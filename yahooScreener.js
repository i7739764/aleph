// yahooScreener.js
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
 const db = new sqlite3.Database('./bot_trades.db');

module.exports = async function fetchSafeCandidates(mode = 'short') {
  const config = await getThresholds();

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
      if (volume < config.minVolume || price < config.minPrice) continue;

      if (mode === 'short' && percent <= config.shortDropMin) {
        symbols.push(symbol);
      }

      if (
        mode === 'long' &&
        percent <= config.longDropMax &&
        percent >= config.longDropMin
      ) {
        symbols.push(symbol);
      }
    }

    if (mode === 'both') {
      const long = await module.exports('long');
      const short = await module.exports('short');
      return [...new Set([...long, ...short])];
    }

    console.log(`📋 Filtered ${symbols.length} tickers (${mode}): [\n  ${symbols.join(', ')}\n]`);
    return symbols;
  } catch (err) {
    console.error('❌ Screener error:', err.message);
    return [];
  }
};

async function getThresholds() {
  return new Promise((resolve) => {
    db.all(`SELECT name, CurrentChoiceValue FROM setup_rules`, (err, rows) => {
      if (err) return resolve(defaultThresholds);

      const map = Object.fromEntries(rows.map(r => [r.name, parseFloat(r.CurrentChoiceValue)]));
      resolve({
        minVolume: map.min_volume || 500000,
        minPrice: map.min_price || 2,
        shortDropMin: map.short_drop_min || -2,
        longDropMin: map.long_drop_min || -15,
        longDropMax: map.long_drop_max || -2
      });
    });
  });
}

const defaultThresholds = {
  minVolume: 500000,
  minPrice: 2,
  shortDropMin: -2,
  longDropMin: -15,
  longDropMax: -2
};
