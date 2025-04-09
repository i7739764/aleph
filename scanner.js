require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true,
  usePolygon: false,
  feed: 'sip'
});

// 🧾 Get tickers from command-line arguments
const tickers = process.argv.slice(2);

if (tickers.length === 0) {
  console.error('❌ Please provide tickers to scan. Example:\nnode scanner.js AAPL TSLA NVDA');
  process.exit(1);
}

async function getIntradayStats(symbol) {
  const bars = await alpaca.getBarsV2(symbol, {
    timeframe: '1Day',
    limit: 1
  });

  for await (let bar of bars) {
    const latestTrade = await alpaca.getLatestTrade(symbol);

    return {
      symbol,
      open: bar.OpenPrice,
      high: bar.HighPrice,
      current: latestTrade.Price
    };
  }

  return null;
}

function meetsCriteria({ open, high, current }) {
  const percentChange = ((current - open) / open) * 100;
  const distanceToHigh = ((high - current) / high) * 100;

  return percentChange >= 3 && distanceToHigh <= 1;
}

async function scanTickers() {
  console.clear();
  console.log(`\n🚨 Scanning stocks at ${new Date().toLocaleTimeString()}...\n`);

  for (let symbol of tickers) {
    try {
      const stats = await getIntradayStats(symbol);
      if (!stats) continue;

      const change = ((stats.current - stats.open) / stats.open) * 100;
      const distToHigh = ((stats.high - stats.current) / stats.high) * 100;

      if (meetsCriteria(stats)) {
        console.log(
          `✅ ${symbol}: UP ${change.toFixed(2)}%, just ${distToHigh.toFixed(
            2
          )}% from high → TRADE CANDIDATE`
        );
      } else {
        console.log(
          `⚠️  ${symbol}: up ${change.toFixed(2)}%, ${distToHigh.toFixed(
            2
          )}% from high — skipping`
        );
      }
    } catch (err) {
      console.error(`❌ Error scanning ${symbol}:`, err.message);
    }
  }

  console.log('\n⏳ Next scan in 5 min...\n');
}

// 🔁 Run every 5 minutes
scanTickers();
setInterval(scanTickers, 5 * 60 * 1000);
