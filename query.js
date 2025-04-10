// query.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'bot_trades.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    return console.error('❌ Failed to open database:', err.message);
  }
});

const query = process.argv.slice(2).join(' ').trim();

if (!query) {
  console.error('❌ Please provide a SQL query as an argument.');
  console.error('Usage: node query.js \"SELECT * FROM positions\"');
  process.exit(1);
}

const isSelect = /^select/i.test(query);

if (isSelect) {
  db.all(query, (err, rows) => {
    if (err) {
      console.error('❌ Query error:', err.message);
    } else {
      console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
  });
} else {
  db.run(query, function (err) {
    if (err) {
      console.error('❌ Execution error:', err.message);
    } else {
      console.log(`✅ Query executed successfully.`);
      console.log(`Rows affected: ${this.changes}`);
    }
    db.close();
  });
}
