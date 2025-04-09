require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true,
  usePolygon: false
});

async function getPositions() {
  try {
    const positions = await alpaca.getPositions();
    if (positions.length === 0) {
      console.log('📭 No open positions.');
      return;
    }

    console.log(`📊 Current Open Positions:\n`);
    positions.forEach(pos => {
      const side = pos.side === 'short' ? '🔻 SHORT' : '🟢 LONG';
      console.log(
        `${side} ${pos.qty} share(s) of ${pos.symbol} @ avg $${Number(pos.avg_entry_price).toFixed(2)} | Unrealized PnL: $${Number(pos.unrealized_pl).toFixed(2)}`
      );
    });
  } catch (err) {
    console.error('❌ Error fetching positions:', err.message);
  }
}

getPositions();
