require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true
});

async function closeAllPositions() {
  try {
    const positions = await alpaca.getPositions();

    if (!positions.length) {
      console.log('📭 No open positions to close.');
      return;
    }

    for (const position of positions) {
      const symbol = position.symbol;
      const qty = Math.abs(Number(position.qty));
      const side = position.side === 'long' ? 'sell' : 'buy';

      await alpaca.createOrder({
        symbol,
        qty,
        side,
        type: 'market',
        time_in_force: 'day'
      });

      console.log(`✅ Closed ${symbol} (${position.side})`);
    }
  } catch (err) {
    console.error('❌ Error closing positions:', err.message);
  }
}

closeAllPositions();
