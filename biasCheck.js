// biasCheck.js
require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bot_trades.db');

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true,
  feed: 'sip'
});

const fetchSafeCandidates = require('./yahooScreener');

function updateBiasComponent(component, value, score) {
  const now = new Date().toISOString();
  db.run(
    `UPDATE bias_components SET last_value = ?, score = ?, last_updated = ? WHERE component = ?`,
    [value, score, now, component],
    (err) => {
      if (err) console.error(`❌ Failed to update ${component}:`, err.message);
     // else console.log(`✅ Updated ${component} → ${value} (${score})`);
    }
  );
}

async function runSpyTrend() {
  try {
    const bars = await alpaca.getBarsV2('SPY', { timeframe: '5Min', limit: 3 });
    let previousClose = null;
    let change = 0;

    for await (const bar of bars) {
      if (!previousClose) previousClose = bar.ClosePrice;
      else change = ((bar.ClosePrice - previousClose) / previousClose) * 100;
    }

    let signal = 'both';
    let score = 0;

    if (change >= 0.3) {
      signal = 'long';
      score = 1;
    } else if (change <= -0.3) {
      signal = 'short';
      score = -1;
    }

    updateBiasComponent('spy_trend', signal, score);
    return score;
  } catch (err) {
    console.error('❌ Error running SPY trend check:', err.message);
    return 0;
  }
}

async function runBreadth() {
  try {
    const tickers = await fetchSafeCandidates('both');
    let longCount = 0;
    let shortCount = 0;

    for (const symbol of tickers.slice(0, 20)) {
      const bars = await alpaca.getBarsV2(symbol, { timeframe: '1Day', limit: 1 });
      for await (let bar of bars) {
        const latest = await alpaca.getLatestTrade(symbol);
        const open = bar.OpenPrice;
        const low = bar.LowPrice;
        const current = latest.Price;

        const drop = ((open - current) / open) * 100;
        const bounce = ((current - low) / low) * 100;

        if (drop >= 2 && drop <= 10 && bounce >= 0.5) longCount++;
        if (drop >= 3 && ((current - low) / low) * 100 <= 1) shortCount++;
      }
    }

    const ratio = longCount / (shortCount || 1);
    let signal = 'both';
    let score = 0;

    if (ratio > 2) {
      signal = 'long';
      score = 1;
    } else if (ratio < 0.5) {
      signal = 'short';
      score = -1;
    }

    updateBiasComponent('breadth', signal, score);
    return score;
  } catch (err) {
    console.error('❌ Error running breadth check:', err.message);
    return 0;
  }
}

async function runVolatility() {
  try {
    const bars = await alpaca.getBarsV2('SPY', { timeframe: '15Min', limit: 10 });
    const closes = [];

    for await (const bar of bars) {
      closes.push(bar.ClosePrice);
    }

    const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
    const variance = closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / closes.length;
    const stdDev = Math.sqrt(variance);

    let signal = 'both';
    let score = 0;

    if (stdDev > 2) {
      signal = 'both';
      score = 0;
    } else {
      signal = 'long';
      score = 1;
    }

    updateBiasComponent('volatility', signal, score);
    return score;
  } catch (err) {
    console.error('❌ Error running volatility check:', err.message);
    return 0;
  }
}

async function combineBias() {
  return new Promise((resolve) => {
    db.all(`SELECT * FROM bias_components`, async (err, rows) => {
      if (err) {
        console.error('❌ Failed to load bias components:', err.message);
        return resolve('both');
      }

      let totalWeight = 0;
      let totalScore = 0;

      for (const { weight, score } of rows) {
        totalScore += score * weight;
        totalWeight += weight;
      }

      const biasScore = totalScore / totalWeight;
      let finalStrategy = 'both';

      if (biasScore >= 0.5) finalStrategy = 'long';
      else if (biasScore <= -0.5) finalStrategy = 'short';

      resolve(finalStrategy);
    });
  });
}

async function runBiasEngine() {
  await runSpyTrend();
  await runBreadth();
  await runVolatility();
  const strategy = await combineBias();
  console.log(`🎯 Final strategy decision: ${strategy}`);
  console.log(JSON.stringify({ strategy }));
  db.run(
    `INSERT INTO bias_history (strategy, source, timestamp) VALUES (?, ?, ?)`,
    [strategy, 'biasCheck', new Date().toISOString()],
    (err) => {
      if (err) console.error('❌ Failed to log bias decision:', err.message);
      else console.log(`📝 Bias logged: ${strategy}`);
    }
  );
  

}

runBiasEngine();