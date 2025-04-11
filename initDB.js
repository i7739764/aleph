 const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bot_trades.db');

db.serialize(() => {
  // Table for current open positions
  db.run(`
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,          -- 'long' or 'short'
      qty INTEGER NOT NULL,
      entry_price REAL NOT NULL,
      entry_time TEXT NOT NULL
    )
  `);

  // Table for completed trades
  db.run(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,          -- 'long' or 'short'
      qty INTEGER NOT NULL,
      entry_price REAL NOT NULL,
      exit_price REAL NOT NULL,
      entry_time TEXT NOT NULL,
      exit_time TEXT NOT NULL,
      reason TEXT,
      fees REAL DEFAULT 0.0
    )
  `);

  console.log('✅ Tables created successfully.');
});

db.close();
