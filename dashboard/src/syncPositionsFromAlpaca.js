// syncPositionsFromAlpaca.js
require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');
const sqlite3 = require('sqlite3').verbose();

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true,
  feed: 'sip',
});

const db = new sqlite3.Database('./bot_trades.db');

async function syncPositions() {
  try {
    const alpacaPositions = await alpaca.getPositions();

    // Step 1: Clear old positions
    db.run(`DELETE FROM positions`, [], (err) => {
      if (err) return console.error('❌ Error clearing positions:', err.message);
    });

    // Step 2: Insert each position
    for (const pos of alpacaPositions) {
      const symbol = pos.symbol;
      const side = pos.side.toLowerCase(); // 'long' or 'short'
      const qty = parseInt(pos.qty);
      const entryPrice = parseFloat(pos.avg_entry_price);
      const entryTime = new Date().toISOString(); // Use current time for now

      db.run(
        `INSERT INTO positions (symbol, side, qty, entry_price, entry_time) VALUES (?, ?, ?, ?, ?)`,
        [symbol, side, qty, entryPrice, entryTime],
        (err) => {
          if (err) console.error(`❌ Error inserting ${symbol}:`, err.message);
          else console.log(`✅ Synced ${symbol} (${side})`);
        }
      );
    }
  } catch (err) {
    console.error('❌ Failed to sync from Alpaca:', err.message);
  }
}

syncPositions();
