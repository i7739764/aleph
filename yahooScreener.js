const axios = require('axios');

module.exports = async function fetchSafeCandidates(mode = 'short') {
  try {
    const url = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_losers&count=100';
    const { data } = await axios.get(url);

    const quotes = data.finance.result?.[0]?.quotes || [];
    const symbols = [];

    for (const quote of quotes) {
      const {
        symbol,
        regularMarketPrice: price,
        regularMarketChangePercent: percent,
        regularMarketVolume: volume
      } = quote;

      if (!symbol || !price || !volume) continue;
      if (volume < 1_000_000 || price < 5) continue;

      // Short setup: strong losers
      if (mode === 'short' && percent <= -3) {
        symbols.push(symbol);
      }

      // Long setup: oversold (but not crashing)
      if (mode === 'long' && percent <= -3 && percent >= -10) {
        symbols.push(symbol);
      }
    }

    console.log(`📋 Filtered ${symbols.length} tickers (${mode}): [\n  ${symbols.join(', ')}\n]`);
    return symbols;
  } catch (err) {
    console.error('❌ Screener error:', err.message);
    return [];
  }
};
