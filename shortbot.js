require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');
const fetchSafeCandidates = require('./yahooScreener');
const sendEmail = require('./emailer');
const { savePosition, removePosition, logTrade, updateCurrentPrice } = require('./db');

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true,
  feed: 'sip'
});

const positions = {};
const retryQueue = new Set();
const MAX_TRADES = 10;

function isShortSetup({ open, low, current }) {
  const dropFromOpen = ((open - current) / open) * 100;
  const nearLow = ((current - low) / low) * 100;
  return dropFromOpen >= 3 && nearLow <= 1;
}

async function isShortable(symbol) {
  try {
    const asset = await alpaca.getAsset(symbol);
    return asset.tradable && asset.shortable;
  } catch {
    return false;
  }
}

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

async function placeShort(symbol) {
  try {
    await alpaca.createOrder({
      symbol,
      qty: 1,
      side: 'sell',
      type: 'market',
      time_in_force: 'day'
    });

    const latest = await alpaca.getLatestTrade(symbol);
    const entryTime = new Date().toISOString();
    positions[symbol] = latest.Price;
    positions[`${symbol}_time`] = entryTime;

    savePosition({
      symbol,
      side: 'short',
      qty: 1,
      entry_price: latest.Price,
      entry_time: entryTime
    });

    console.log(`🟥 Shorted ${symbol} at ~$${latest.Price}`);
    sendEmail(`📉 Shorted ${symbol}`, `Entry at ~$${latest.Price} on ${entryTime}`);
  } catch (err) {
    console.error(`❌ Failed to short ${symbol}:`, err.message);
  }
}

async function cover(symbol, reason = '') {
  try {
    const exitTime = new Date().toISOString();
    const exitTrade = await alpaca.getLatestTrade(symbol);
    const exitPrice = exitTrade.Price;
    const entryPrice = positions[symbol];
    const entryTime = positions[`${symbol}_time`] || 'N/A';

    await alpaca.createOrder({
      symbol,
      qty: 1,
      side: 'buy',
      type: 'market',
      time_in_force: 'day'
    });

    logTrade({
      symbol,
      side: 'short',
      qty: 1,
      entry_price: entryPrice,
      exit_price: exitPrice,
      entry_time: entryTime,
      exit_time: exitTime,
      reason
    });

    removePosition(symbol);
    sendEmail(`✅ Covered ${symbol}`, `Exit at ~$${exitPrice} | Reason: ${reason}`);
    console.log(`✅ Covered ${symbol} | ${reason}`);

    delete positions[symbol];
    delete positions[`${symbol}_time`];
    retryQueue.delete(symbol);
  } catch (err) {
    if (err.response?.status === 403) {
      console.warn(`⚠️ ${symbol}: Alpaca blocked cover (403). Will retry.`);
      retryQueue.add(symbol);
    } else {
      console.error(`❌ Error closing ${symbol}:`, err.message);
    }
  }
}

async function monitorPositions() {
  for (let symbol of Object.keys(positions)) {
    if (symbol.includes('_time')) continue;

    try {
      const current = (await alpaca.getLatestTrade(symbol)).Price;
      console.log(`🔄 Updating ${symbol} | price: $${current}`);
      updateCurrentPrice(symbol, current); // 👈 write to DB
      const entry = positions[symbol];
      const change = ((entry - current) / entry) * 100;

      if (change >= 1) {
        await cover(symbol, 'Profit target hit');
      } else if (change <= -0.25) {
        await cover(symbol, 'Stop hit');
      } else {
        console.log(`⏳ ${symbol}: holding | PnL = ${change.toFixed(2)}%`);
      }
    } catch (err) {
      console.error(`❌ Error tracking ${symbol}:`, err.message);
    }
  }

  if (retryQueue.size) {
    console.log(`🔁 Retrying short exits: [${[...retryQueue].join(', ')}]`);
    for (const symbol of retryQueue) {
      await cover(symbol, 'Retry after 403');
    }
  }
}

async function autoCloseAll() {
  console.log(`⏰ Auto-close triggered — closing all shorts`);
  for (let symbol of Object.keys(positions)) {
    if (!symbol.includes('_time')) {
      await cover(symbol, 'End of day');
    }
  }
  process.exit(0);
}

async function runBot() {
  console.clear();
  console.log(`🚀 ShortBot launching at ${new Date().toLocaleTimeString()}...\n`);

  const tickers = (await fetchSafeCandidates('short')).slice(0, 25);
  if (!tickers.length) {
    console.log('😴 No tickers from screener.');
    return;
  }

  let statsList = [];

  for (const symbol of tickers) {
    try {
      const tradable = await isShortable(symbol);
      if (!tradable) continue;

      const stats = await getStats(symbol);
      if (stats && isShortSetup(stats)) statsList.push(stats);
    } catch (err) {
      console.log(`⚠️ Skipping ${symbol}: ${err.message}`);
    }
  }

  statsList.sort((a, b) => ((b.open - b.current) / b.open) - ((a.open - a.current) / a.open));
  let tradesPlaced = 0;

  for (const stats of statsList) {
    const symbol = stats.symbol;
    if (positions[symbol]) continue;
    if (tradesPlaced >= MAX_TRADES) break;

    await placeShort(symbol);
    tradesPlaced++;
  }

  setInterval(monitorPositions, 2 * 60 * 1000);
  setInterval(runBot, 5 * 60 * 1000);

  const now = new Date();
  const marketClose = new Date();
  marketClose.setHours(15, 58, 0, 0);
  const msUntilClose = marketClose - now;
  if (msUntilClose > 0) {
    console.log(`🕒 Auto-close set for 3:58 PM (in ${Math.round(msUntilClose / 60000)} min)`);
    setTimeout(autoCloseAll, msUntilClose);
  }
}

runBot();
