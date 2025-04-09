const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'logs', 'trades.csv');

function ensureHeader() {
  if (!fs.existsSync(logFile)) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.writeFileSync(
      logFile,
      'Symbol,EntryTime,EntryPrice,ExitTime,ExitPrice,PnL,Reason\n'
    );
  }
}

function logTrade({ symbol, entryPrice, exitPrice, entryTime, exitTime, reason }) {
  ensureHeader();

  const pnl = (entryPrice - exitPrice).toFixed(2);
  const line = `${symbol},${entryTime},${entryPrice},${exitTime},${exitPrice},${pnl},${reason}\n`;
  fs.appendFileSync(logFile, line);
}

module.exports = logTrade;
