// smartbot.js
require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');
const fetchSafeCandidates = require('./yahooScreener');
const sendEmail = require('./emailer');
const { savePosition, removePosition, logTrade } = require('./db');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bot_trades.db');
const { exec } = require('child_process');

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true,
  feed: 'sip'
});

const STRATEGY_API = 'http://localhost:4000/api/strategy';
const MAX_TRADES = 10;

async function getStats(symbol) {
  const bars = await alpaca.getBarsV2(symbol, {
    timeframe: '1Day',
    limit: 1
  });
  for await (let bar of bars) {
    const latest = await alpaca.getLatestTrade(symbol);
    return {
      symbol,
      open: bar.OpenPrice,
      low: bar.LowPrice,
      current: latest.Price
    };
  }
  return null;
}

function isLongSetup({ open, low, current }) {
  const drop = ((open - current) / open) * 100;
  const bounce = ((current - low) / low) * 100;
  return drop >= 2 && drop <= 10 && bounce >= 0.5;
}

function isShortSetup({ open, low, current }) {
  const drop = ((open - current) / open) * 100;
  const nearLow = ((current - low) / low) * 100;
  return drop >= 3 && nearLow <= 1;
}

async function isTradable(symbol, type) {
  try {
    const asset = await alpaca.getAsset(symbol);
    return type === 'long' ? asset.tradable : (asset.tradable && asset.shortable);
  } catch {
    return false;
  }
}

async function placeTrade(symbol, side) {
  const order = {
    symbol,
    qty: 1,
    side: side === 'long' ? 'buy' : 'sell',
    type: 'market',
    time_in_force: 'day'
  };

  try {
    await alpaca.createOrder(order);
    const latest = await alpaca.getLatestTrade(symbol);
    const entryTime = new Date().toISOString();

    savePosition({
      symbol,
      side,
      qty: 1,
      entry_price: latest.Price,
      entry_time: entryTime
    });

    console.log(`📈 ${side.toUpperCase()} ${symbol} at ~$${latest.Price}`);
    sendEmail(`📈 ${side.toUpperCase()} ${symbol}`, `Entry at ~$${latest.Price} on ${entryTime}`);
  } catch (err) {
    console.error(`❌ Failed to ${side} ${symbol}:`, err.message);
  }
}

async function exitPosition(symbol, side, reason = '') {
  try {
    const exitTime = new Date().toISOString();
    const latest = await alpaca.getLatestTrade(symbol);
    const exitPrice = latest.Price;

    const order = {
      symbol,
      qty: 1,
      side: side === 'long' ? 'sell' : 'buy',
      type: 'market',
      time_in_force: 'day'
    };

    await alpaca.createOrder(order);

    db.get(`SELECT * FROM positions WHERE symbol = ? AND side = ?`, [symbol, side], (err, row) => {
      if (err) {
        console.error(`❌ DB fetch error for trade logging:`, err.message);
        return;
      }
      if (!row) {
        console.warn(`⚠️ No position found for ${symbol} (${side}) — skipping trade log.`);
        return;
      }

      logTrade({
        symbol,
        side,
        qty: 1,
        entry_price: row.entry_price,
        exit_price: exitPrice,
        entry_time: row.entry_time,
        exit_time: exitTime,
        reason
      });

      removePosition(symbol);
      console.log(`✅ ${side.toUpperCase()} Exit: ${symbol} | ${reason}`);
      sendEmail(`✅ Sold ${symbol}`, `Exit at ~$${exitPrice} | Reason: ${reason}`);
    });
  } catch (err) {
    console.error(`❌ Error closing ${symbol}:`, err.message);
  }
}

async function monitorPositions() {
  db.all(`SELECT * FROM positions`, async (err, rows) => {
    if (err) return console.error('❌ Error loading positions:', err.message);

    for (const pos of rows) {
      try {
        const current = (await alpaca.getLatestTrade(pos.symbol)).Price;
        const entry = pos.entry_price;
        const change = pos.side === 'long'
          ? ((current - entry) / entry) * 100
          : ((entry - current) / entry) * 100;

        if ((pos.side === 'long' && (change >= 1.25 || change <= -0.5)) ||
            (pos.side === 'short' && (change >= 1 || change <= -0.25))) {
          await exitPosition(pos.symbol, pos.side, change >= 0 ? 'Profit target hit' : 'Stop hit');
        } else {
          console.log(`⏳ ${pos.symbol}: holding | ${pos.side} | PnL = ${change.toFixed(2)}%`);
        }
      } catch (err) {
        console.error(`❌ Monitor failed for ${pos.symbol}:`, err.message);
      }
    }
  });
}

async function getCurrentStrategy() {
    try {
      const res = await axios.get('http://localhost:4000/api/strategy');
      return res.data.strategy || 'both';
    } catch (err) {
      console.error('❌ Failed to fetch strategy mode:', err.message);
      return 'both'; // fallback
    }
  }
  

async function runBot() {
  console.clear();
  console.log(`🚀 SmartBot running at ${new Date().toLocaleTimeString()}...`);

  const timestamp = new Date().toISOString();
  db.run(
    `INSERT INTO meta (key, value) VALUES ('last_bot_run', ?) 
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [timestamp],
    (err) => {
      if (err) console.error('❌ Failed to update last_bot_run:', err.message);
      else console.log(`🕒 Last bot run recorded: ${timestamp}`);
    }
  );

  const strategy = await getCurrentStrategy();

  const isManual = strategy.startsWith('manual-');
  const activeMode = isManual
    ? strategy.replace('manual-', '')
    : strategy;

  const tickers = (await fetchSafeCandidates(activeMode)).slice(0, 25);
  console.log(`📋 Screener returned ${tickers.length} tickers for mode: ${activeMode}`);

  if (!tickers.length) {
    console.log('⚠️ No tickers found. Trying fallback to "both".');
    if (activeMode !== 'both') {
      return await runBot('both'); // recursive fallback
    }
    return;
  }
  

  const statsList = [];

  for (const symbol of tickers) {
    try {
      const tradable = await isTradable(symbol, activeMode);
      if (!tradable) continue;

      const stats = await getStats(symbol);
      if (
        (activeMode === 'long' && isLongSetup(stats)) ||
        (activeMode === 'short' && isShortSetup(stats)) ||
        (activeMode === 'both' && (isLongSetup(stats) || isShortSetup(stats)))
      ) {
        statsList.push({ ...stats, direction: isLongSetup(stats) ? 'long' : 'short' });
      }
    } catch (err) {
      console.log(`⚠️ Skipping ${symbol}: ${err.message}`);
    }
  }

  let tradesPlaced = 0;
  for (const stats of statsList) {
    const symbol = stats.symbol;
    const side = stats.direction;
    if (tradesPlaced >= MAX_TRADES) break;
    await placeTrade(symbol, side);
    tradesPlaced++;
  }
}

runBot();

setInterval(runBot, 5 * 60 * 1000);
setInterval(monitorPositions, 2 * 60 * 1000);
setInterval(() => {}, 1 << 30);

// 🧠 Auto-bias updater (every 15 min if NOT in manual mode)
setInterval(() => {
    getCurrentStrategy().then(current => {
      if (current.startsWith('manual')) {
        console.log('🧍 Manual mode active — skipping bias check.');
        return;
      }
  
      exec('node biasCheck.js', async (err, stdout, stderr) => {
        if (err || stderr) {
          return console.error('❌ Bias check error:', err || stderr);
        }
  
        try {
          const result = JSON.parse(stdout.trim());
          if (!result.strategy) throw new Error('Missing strategy in biasCheck output');
  
          if (result.strategy !== current) {
            console.log(`🔁 Bias shift detected: ${current} → ${result.strategy}`);
  
            // ✅ PLACE IT RIGHT HERE:
            await axios.post(STRATEGY_API, { strategy: result.strategy });
  
            db.run(
              `INSERT INTO bias_history (strategy, source, timestamp) VALUES (?, ?, ?)`,
              [result.strategy, 'auto-update', new Date().toISOString()],
              (err) => {
                if (err) console.error('❌ Failed to log auto-update bias:', err.message);
                else console.log(`📝 Bias change logged: ${result.strategy}`);
              }
            );
  
          } else {
            console.log(`📊 Bias check confirmed: still '${current}'`);
          }
        } catch (e) {
          console.error('❌ Failed to parse bias check result:', e.message);
        }
      });
    });
  }, 15 * 60 * 1000); // every 15 minutes
  
