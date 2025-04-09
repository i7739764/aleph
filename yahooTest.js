const axios = require('axios');

async function fetchYahooLosers() {
  try {
    const url = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_losers&count=100';
    const res = await axios.get(url);
    const rows = res.data.finance.result[0].quotes;

    const filtered = rows
      .filter(stock =>
        parseFloat(stock.regularMarketChangePercent || 0) <= -3 &&
        parseInt(stock.regularMarketVolume || 0) >= 1_000_000 &&
        parseFloat(stock.regularMarketPrice || 0) >= 5
      )
      .map(stock => ({
        symbol: stock.symbol,
        price: stock.regularMarketPrice,
        change: stock.regularMarketChangePercent,
        volume: stock.regularMarketVolume
      }));

    if (filtered.length) {
      console.log(`📉 Yahoo Top Losers (Filtered):\n`);
      filtered.forEach(s =>
        console.log(`🔻 ${s.symbol} - $${s.price} | ↓${s.change.toFixed(2)}% | Vol: ${s.volume.toLocaleString()}`)
      );
    } else {
      console.log('😴 No stocks matched the filter criteria.');
    }

    return filtered.map(s => s.symbol);

  } catch (err) {
    console.error('❌ Yahoo Fetch Error:', err.message);
    return [];
  }
}

fetchYahooLosers();
