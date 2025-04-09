require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true,
  usePolygon: false
});

function isToday(dateStr) {
  const today = new Date();
  const date = new Date(dateStr);
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

function sortByTime(a, b) {
  return new Date(a.time) - new Date(b.time);
}

async function getMatchedTrades() {
  const fills = await alpaca.getAccountActivities('FILL');
  const todayFills = fills
    .filter(f => isToday(f.transaction_time))
    .map(f => ({
      side: f.side,
      symbol: f.symbol,
      qty: parseFloat(f.qty),
      price: parseFloat(f.price),
      time: f.transaction_time
    }));

  const tradesBySymbol = {};

  for (const trade of todayFills) {
    if (!tradesBySymbol[trade.symbol]) tradesBySymbol[trade.symbol] = [];
    tradesBySymbol[trade.symbol].push(trade);
  }

  const matched = [];

  for (const symbol in tradesBySymbol) {
    const sorted = tradesBySymbol[symbol].sort(sortByTime);
    const sells = sorted.filter(t => t.side === 'sell' || t.side === 'sell_short');
    const buys = sorted.filter(t => t.side === 'buy');

    const pairCount = Math.min(sells.length, buys.length);
    for (let i = 0; i < pairCount; i++) {
      const entry = sells[i];
      const exit = buys[i];
      const pnl = (entry.price - exit.price).toFixed(2);
      matched.push({
        symbol,
        entry: entry.price,
        exit: exit.price,
        pnl: parseFloat(pnl),
        entryTime: entry.time,
        exitTime: exit.time
      });
    }
  }

  return matched;
}

async function runReport() {
  const trades = await getMatchedTrades();

  if (!trades.length) {
    console.log('📭 No matched trades to report today.');
    return;
  }

  console.log(`📊 Matched Trades:\n`);

  let total = 0;
  let wins = 0;
  let losses = 0;
  let biggestWin = -Infinity;
  let biggestLoss = Infinity;

  for (const t of trades) {
    const emoji = t.pnl >= 0 ? '✅' : '❌';
    total += t.pnl;
    if (t.pnl >= 0) {
      wins++;
      if (t.pnl > biggestWin) biggestWin = t.pnl;
    } else {
      losses++;
      if (t.pnl < biggestLoss) biggestLoss = t.pnl;
    }

    console.log(
      `${emoji} ${t.symbol}: Sold @ $${t.entry} → Covered @ $${t.exit} | PnL: $${t.pnl}`
    );
  }

  const winRate = trades.length ? ((wins / trades.length) * 100).toFixed(2) : '0.00';

  console.log(`\n📈 Total PnL: $${total.toFixed(2)}`);
  console.log(`📦 Trades: ${trades.length} | ✅ Wins: ${wins} | ❌ Losses: ${losses}`);
  console.log(`🏆 Win Rate: ${winRate}%`);
  console.log(`🥇 Best Trade: $${biggestWin.toFixed(2)} | 🩸 Worst Trade: $${biggestLoss.toFixed(2)}\n`);
}

runReport();
