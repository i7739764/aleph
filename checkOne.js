// checkOne.js
require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true,
  feed: 'sip'
});

const symbol = process.argv[2] || 'PVH'; // default to PVH if none provided
const db = new sqlite3.Database(path.resolve(__dirname, 'bot_trades.db'));

async function runCheck(symbol) {
  console.log(`🔎 Checking ${symbol}...\n`);

  db.get(`SELECT * FROM positions WHERE symbol = ?`, [symbol], async (err, row) => {
    if (err) return console.error('❌ DB error:', err.message);
    if (!row) return console.warn(`⚠️ No DB entry found for ${symbol}`);

    const { entry_price, side, qty } = row;

    const trade = await alpaca.getLatestTrade(symbol);
    const current_price = trade?.Price;

    if (!current_price) return console.warn(`⚠️ No current price found for ${symbol}`);

    const pnl = side === 'long'
      ? (current_price - entry_price) * qty
      : (entry_price - current_price) * Math.abs(qty);

    const pnlPercent = side === 'long'
      ? ((current_price - entry_price) / entry_price) * 100
      : ((entry_price - current_price) / entry_price) * 100;

    console.log(`📊 DB:  entry = $${entry_price.toFixed(2)}, qty = ${qty}, side = ${side}`);
    console.log(`💰 Alpaca: current = $${current_price.toFixed(2)}`);
    console.log(`📈 PnL: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

    db.close();
  });
}

runCheck(symbol);
