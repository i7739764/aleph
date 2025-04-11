// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const { Server } = require('socket.io');
const Alpaca = require('@alpacahq/alpaca-trade-api');
const cors = require('cors');
 const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 20000,
  pingInterval: 25000
});

const db = new sqlite3.Database('./bot_trades.db');

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true,
  feed: 'sip'
});

app.use(cors());
app.use(express.json());

io.on('connection', socket => {
  console.log('📡 WebSocket client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('📴 WebSocket client disconnected:', socket.id);
  });
});

// --- API Routes ---
app.get('/api/strategy', (req, res) => {
  db.get(`SELECT value FROM meta WHERE key = 'strategy'`, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ strategy: row?.value || 'both' });
  });
});

app.post('/api/strategy', (req, res) => {
  const strategy = req.body.strategy;
  db.run(
    `INSERT INTO meta (key, value) VALUES ('strategy', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [strategy],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.get('/api/positions', (req, res) => {
  db.all(`SELECT * FROM positions ORDER BY entry_time DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/trades/today', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  db.all(`SELECT * FROM trades WHERE DATE(exit_time) = ? ORDER BY exit_time DESC`, [today], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/summary', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  db.all(`SELECT * FROM trades WHERE DATE(exit_time) = ?`, [today], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    let grossProfit = 0;
    let totalFees = 0;
    rows.forEach(({ side, entry_price, exit_price, qty, fees }) => {
      const pnl = side === 'long' ? (exit_price - entry_price) * qty : (entry_price - exit_price) * qty;
      grossProfit += pnl;
      totalFees += fees;
    });
    const netProfit = grossProfit - totalFees;
    res.json({
      grossProfit: +grossProfit.toFixed(2),
      totalFees: +totalFees.toFixed(2),
      netProfit: +netProfit.toFixed(2),
      count: rows.length
    });
  });
});

app.get('/api/bias-history', (req, res) => {
  db.all(`SELECT * FROM bias_history WHERE DATE(timestamp) = DATE('now') ORDER BY timestamp DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/setup-rules', (req, res) => {
  db.all(`SELECT * FROM setup_rules`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/setup-rules/set-recommended', (req, res) => {
  db.all(`SELECT RuleID, CurrentChoiceValue FROM setup_rules`, (err, rules) => {
    if (err) return res.status(500).json({ error: err.message });

    const updates = rules.map(rule => {
      return new Promise((resolve, reject) => {
        db.get(`SELECT ChoiceValue FROM setup_choices WHERE RuleID = ? AND RiskValue = 'recommended' LIMIT 1`, [rule.RuleID], (err, row) => {
          if (err || !row) return resolve();
          db.run(`UPDATE setup_rules SET CurrentChoiceValue = ? WHERE RuleID = ?`, [row.ChoiceValue, rule.RuleID], (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    });

    Promise.all(updates)
      .then(() => res.json({ success: true }))
      .catch(err => res.status(500).json({ error: err.message }));
  });
});

app.post('/api/setup-rules/update', (req, res) => {
  const { ruleID, value } = req.body;
  if (!ruleID) return res.status(400).json({ error: 'Missing rule ID' });

  db.run(`UPDATE setup_rules SET CurrentChoiceValue = ? WHERE RuleID = ?`, [value, ruleID], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/last-run', (req, res) => {
  db.get(`SELECT value FROM meta WHERE key = 'last_bot_run'`, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ time: row?.value || null });
  });
});

app.get('/api/bias-check', (req, res) => {
  exec('node biasCheck.js', (err, stdout, stderr) => {
    if (err || stderr) {
      return res.status(500).json({ error: 'Bias check failed' });
    }

    try {
      const lastLine = stdout.trim().split('\n').pop();
      const parsed = JSON.parse(lastLine);
      if (!parsed.strategy) throw new Error('Missing strategy');
      res.json(parsed);
    } catch (parseErr) {
      res.status(500).json({ error: 'Invalid JSON from bias check' });
    }
  });
});
app.get('/api/setup-choices/:ruleID', (req, res) => {
  const ruleID = req.params.ruleID;
  db.all(
    `SELECT ChoiceValue, RiskValue, ChoiceDescription FROM setup_choices WHERE RuleID = ? ORDER BY RiskValue`,
    [ruleID],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 API + WebSocket server running at http://localhost:${PORT}`);
});
