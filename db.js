// db.js
const sqlite3 = require('sqlite3').verbose();
 const db = new sqlite3.Database('./bot_trades.db');

function savePosition({ symbol, side, qty, entry_price, entry_time }) {
  db.run(`
    INSERT INTO positions (symbol, side, qty, entry_price, entry_time)
    VALUES (?, ?, ?, ?, ?)
  `, [symbol, side, qty, entry_price, entry_time], (err) => {
    if (err) console.error(`❌ DB insert error (position):`, err.message);
  });
}

function removePosition(symbol) {
  db.run(`DELETE FROM positions WHERE symbol = ?`, [symbol], (err) => {
    if (err) console.error(`❌ DB delete error (position):`, err.message);
  });
}

function logTrade({ symbol, side, qty, entry_price, exit_price, entry_time, exit_time, reason }) {
  const SEC = qty * exit_price * 0.000008;
  const FINRA = Math.min(qty * 0.000145, 7.27);
  const fees = +(SEC + FINRA).toFixed(4);

  db.run(`
    INSERT INTO trades (symbol, side, qty, entry_price, exit_price, entry_time, exit_time, reason, fees)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [symbol, side, qty, entry_price, exit_price, entry_time, exit_time, reason, fees], (err) => {
    if (err) console.error(`❌ DB insert error (trade):`, err.message);
  });
}

function updateCurrentPrice(symbol, current_price) {
  const timestamp = new Date().toISOString();
  db.run(
    `UPDATE positions SET current_price = ?, last_update = ? WHERE symbol = ?`,
    [current_price, timestamp, symbol],
    (err) => {
      if (err) {
        console.error(`❌ DB update error (${symbol}):`, err.message);
      } else {
        console.log(`✅ Updated ${symbol}: $${current_price} at ${timestamp}`);
      }
    }
  );
}


module.exports = {
  savePosition,
  removePosition,
  logTrade,
  updateCurrentPrice // ✅ this line is key
};
