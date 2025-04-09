require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true,
  usePolygon: false,
  feed: 'sip'
});

async function getMarketBias(symbol = 'SPY') {
  const bars = await alpaca.getBarsV2(symbol, {
    timeframe: '1Day',
    limit: 1
  });

  for await (let bar of bars) {
    const latest = await alpaca.getLatestTrade(symbol);
    const open = bar.OpenPrice;
    const current = latest.Price;

    const change = ((current - open) / open) * 100;
    console.log(`📊 ${symbol} Change: ${change.toFixed(2)}%`);

    if (change >= 1) {
      console.log('🔼 Market Bias: LONG');
      return 'long';
    } else if (change <= -1) {
      console.log('🔻 Market Bias: SHORT');
      return 'short';
    } else {
      console.log('🤷 Market Bias: SIDEWAYS');
      return 'neutral';
    }
  }
}

getMarketBias();
