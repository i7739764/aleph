console.log('📦 DB exports:', require('./db'));
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

function isLongSetup({ open, low, current }) {
  const dropFromOpen = ((open - current) / open) * 100;
  const bounceFromLow = ((current - low) / low) * 100;
  return dropFromOpen >= 2 && dropFromOpen <= 10 && bounceFromLow >= 0.5;
}

async function isTradable(symbol) {
  try {
    const asset = await alpaca.getAsset(symbol);
    return asset.tradable;
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

async function placeLong(symbol) {
  try {
    await alpaca.createOrder({
      symbol,
      qty: 1,
      side: 'buy',
      type: 'market',
      time_in_force: 'day'
    });

    const latest = await alpaca.getLatestTrade(symbol);
    const entryTime = new Date().toISOString();

    positions[symbol] = latest.Price;
    positions[`${symbol}_time`] = entryTime;

    savePosition({
      symbol,
      side: 'long',
      qty: 1,
      entry_price: latest.Price,
      entry_time: entryTime
    });

    console.log(`🟩 Longed ${symbol} at ~$${latest.Price}`);
    sendEmail(`📈 Longed ${symbol}`, `Entry at ~$${latest.Price} on ${entryTime}`);
  } catch (err) {
    console.error(`❌ Failed to long ${symbol}:`, err.message);
  }
}

async function exitLong(symbol, reason = '') {
  try {
    const exitTime = new Date().toISOString();
    const exitTrade = await alpaca.getLatestTrade(symbol);
    const exitPrice = exitTrade.Price;
    const entryPrice = positions[symbol];
    const entryTime = positions[`${symbol}_time`] || 'N/A';

    await alpaca.createOrder({
      symbol,
      qty: 1,
      side: 'sell',
      type: 'market',
      time_in_force: 'day'
    });

    logTrade({
      symbol,
      side: 'long',
      qty: 1,
      entry_price: entryPrice,
      exit_price: exitPrice,
      entry_time: entryTime,
      exit_time: exitTime,
      reason
    });

    removePosition(symbol);
    sendEmail(`✅ Sold ${symbol}`, `Exit at ~$${exitPrice} | Reason: ${reason}`);
    console.log(`✅ Sold ${symbol} | ${reason}`);

    delete positions[symbol];
    delete positions[`${symbol}_time`];
    retryQueue.delete(symbol);
  } catch (err) {
    if (err.response?.status === 403) {
      console.warn(`⚠️ ${symbol}: Alpaca blocked sell (403). Will retry.`);
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
      const change = ((current - entry) / entry) * 100;

      if (change >= 1.25) {
        await exitLong(symbol, 'Profit target hit');
      } else if (change <= -0.5) {
        await exitLong(symbol, 'Stop hit');
      } else {
        console.log(`⏳ ${symbol}: holding | PnL = ${change.toFixed(2)}%`);
      }
    } catch (err) {
      console.error(`❌ Error tracking ${symbol}:`, err.message);
    }
  }

  if (retryQueue.size) {
    console.log(`🔁 Retrying long exits: [${[...retryQueue].join(', ')}]`);
    for (const symbol of retryQueue) {
      await exitLong(symbol, 'Retry after 403');
    }
  }
}

async function autoCloseAll() {
  console.log(`⏰ Auto-close triggered — selling all longs`);
  for (let symbol of Object.keys(positions)) {
    if (!symbol.includes('_time')) {
      await exitLong(symbol, 'End of day');
    }
  }
  process.exit(0);
}

async function runBot() {
  console.clear();
  console.log(`🚀 LongBot launching at ${new Date().toLocaleTimeString()}...\n`);

  const tickers = (await fetchSafeCandidates('long')).slice(0, 25);
  if (!tickers.length) {
    console.log('😴 No tickers from screener.');
    return;
  }

  let statsList = [];

  for (const symbol of tickers) {
    try {
      const tradable = await isTradable(symbol);
      if (!tradable) continue;

      const stats = await getStats(symbol);
      if (stats && isLongSetup(stats)) statsList.push(stats);
    } catch (err) {
      console.log(`⚠️ Skipping ${symbol}: ${err.message}`);
    }
  }

  statsList.sort((a, b) => ((b.current - b.low) / b.low) - ((a.current - a.low) / a.low));
  let tradesPlaced = 0;

  for (const stats of statsList) {
    const symbol = stats.symbol;
    if (positions[symbol]) continue;
    if (tradesPlaced >= MAX_TRADES) break;

    await placeLong(symbol);
    tradesPlaced++;
  }
// TEMP: Immediate test update for all current positions
for (const symbol of Object.keys(positions)) {
  if (!symbol.includes('_time')) {
   

    const current = (await alpaca.getLatestTrade(symbol)).Price;
    updateCurrentPrice(symbol, current);
    console.log(`🔄 Initial update for ${symbol} | price: $${current}`);
  }
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
