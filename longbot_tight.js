require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');
const fetchSafeCandidates = require('./yahooScreener');
const logTrade = require('./logTrade');
const sendEmail = require('./emailer');

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true,
  feed: 'sip'
});

const positions = {};
const MAX_TRADES = 10;

function isMarketOpenNow() {
  const now = new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const minutes = hour * 60 + minute;
  return minutes >= 570 && minutes <= 960; // 9:30am–4pm ET
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

function isLongSetup({ open, low, current }) {
  const dropFromOpen = ((open - current) / open) * 100;
  const bounceFromLow = ((current - low) / low) * 100;

  return (
    dropFromOpen >= 3 &&
    dropFromOpen <= 10 &&
    bounceFromLow >= 1 &&
    current < open
  );
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

    logTrade({ symbol, entryPrice, exitPrice, entryTime, exitTime, reason });
    sendEmail(`✅ Sold ${symbol}`, `Exit at ~$${exitPrice} | Reason: ${reason}`);

    console.log(`✅ Sold ${symbol} | ${reason}`);
    delete positions[symbol];
    delete positions[`${symbol}_time`];
  } catch (err) {
    console.error(`❌ Error closing ${symbol}:`, err.message);
  }
}

async function monitorPositions() {
  for (let symbol of Object.keys(positions)) {
    if (symbol.includes('_time')) continue;

    try {
      const current = (await alpaca.getLatestTrade(symbol)).Price;
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
}

async function autoCloseAll() {
  console.log(`⏰ Auto-close triggered — selling all`);
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

  // Uncomment for live trading only
  // if (!isMarketOpenNow()) {
  //   console.log("🕒 Market is closed — skipping entries.");
  //   return;
  // }

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
      console.log(`⚠️ Skipping ${symbol} due to data error: ${err.message}`);
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
