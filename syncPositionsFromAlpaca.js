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

// Give SQLite a little patience
db.run('PRAGMA busy_timeout = 2000');

// Get current market price from Alpaca (quote or fallback to trade)
async function getCurrentPrice(symbol) {
  try {
    const quote = await alpaca.getLatestQuote(symbol);
    const price = quote?.AskPrice || quote?.BidPrice;
    if (price) return price;

    const trade = await alpaca.getLatestTrade(symbol);
    return trade?.Price || null;
  } catch (err) {
    console.warn(`⚠️ ${symbol}: Failed to fetch price →`, err.message);
    return null;
  }
}

async function syncPositions() {
  try {
    const alpacaPositions = await alpaca.getPositions();

    // Clear existing positions
    db.run(`DELETE FROM positions`, (err) => {
      if (err) return console.error('❌ Failed to clear positions:', err.message);
    });

    for (const pos of alpacaPositions) {
      const symbol = pos.symbol;
      const side = pos.side.toLowerCase();
      const qty = parseFloat(pos.qty);
      const entryPrice = parseFloat(pos.avg_entry_price);
      const entryTime = new Date().toISOString();

      const currentPrice = await getCurrentPrice(symbol);
      console.log(`📡 ${symbol} → current: ${currentPrice}`);

      db.run(
        `INSERT INTO positions (symbol, side, qty, entry_price, entry_time, current_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [symbol, side, qty, entryPrice, entryTime, currentPrice],
        (err) => {
          if (err) {
            console.error(`❌ DB insert error for ${symbol}:`, err.message);
          } else {
            console.log(`✅ Synced ${symbol} | ${side} | $${entryPrice} → $${currentPrice}`);
          }
        }
      );
    }
  } catch (err) {
    console.error('❌ Overall sync failed:', err.message);
  }
}

syncPositions();
