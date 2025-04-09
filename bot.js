require('dotenv').config();


const Alpaca = require('@alpacahq/alpaca-trade-api');

const alpaca = new Alpaca({
    keyId: process.env.ALPACA_API_KEY,
    secretKey: process.env.ALPACA_SECRET_KEY,
    paper: true,
    usePolygon: false,
    feed: 'sip' // 
  });
  

const symbol = 'AAPL';

async function getYesterdaysHigh(symbol) {
    const today = new Date();
    const dayOfWeek = today.getDay();
  
    let offset = 1;
    if (dayOfWeek === 1) offset = 3;
    if (dayOfWeek === 0) offset = 2;
  
    const end = new Date(today);
    const start = new Date(today);
    start.setDate(start.getDate() - offset);
  
    const bars = await alpaca.getBarsV2(
      symbol,
      {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
        timeframe: '1Day'
      }
    );
  
    for await (let bar of bars) {
      console.log('📦 Got bar:', bar);
      return bar.HighPrice;
    }
  
    throw new Error("No data returned for yesterday's high");
  }
  
  
 
  

async function getCurrentPrice(symbol) {
  const trade = await alpaca.getLatestTrade(symbol);
  return trade.Price;
}

async function placeOrder(symbol, qty) {
  const order = await alpaca.createOrder({
    symbol: symbol,
    qty: qty,
    side: 'buy',
    type: 'market',
    time_in_force: 'day'
  });
  console.log(`✅ Order placed: Bought ${qty} share(s) of ${symbol}`);
}

async function runBot() {
  try {
    const yHigh = await getYesterdaysHigh(symbol);
    console.log(`📊 Yesterday's high for ${symbol}: $${yHigh}`);

    const current = await getCurrentPrice(symbol);
    console.log(`📈 Current price: $${current}`);

    if (current > yHigh) {
      console.log(`🚀 Breakout detected! Placing order...`);
      await placeOrder(symbol, 1);
    } else {
      console.log(`📉 No breakout. No trade.`);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

runBot();
