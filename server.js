// server.js
const express = require('express');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
      origin: 'http://localhost:5173', // tighten CORS to your React app
      methods: ['GET'],
      credentials: true
    },
    pingTimeout: 20000,    // how long to wait for a pong (default is 5000ms)
    pingInterval: 25000    // how often to send ping to clients
  });
io.on('connection', socket => {
  console.log('📡 WebSocket client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('📴 WebSocket client disconnected:', socket.id);
  });
});

const db = new sqlite3.Database('./bot_trades.db');

app.use(cors());

// --- API Routes ---

// GET /api/positions
app.get('/api/positions', (req, res) => {
  db.all(`SELECT * FROM positions ORDER BY entry_time DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET /api/trades/today
app.get('/api/trades/today', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  db.all(`SELECT * FROM trades WHERE DATE(exit_time) = ? ORDER BY exit_time DESC`, [today], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET /api/summary
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

// --- Realtime WebSocket Broadcast ---

function broadcastTrades() {
    const today = new Date().toISOString().slice(0, 10);
  
    db.all(`SELECT * FROM trades WHERE DATE(exit_time) = ? ORDER BY exit_time DESC LIMIT 10`, [today], (err, rows) => {
      if (!err && rows.length) {
        io.emit('trades:update', rows);
        console.log(`📤 trades:update emitted (${rows.length} trades)`);
      }
    });
  
    db.all(`SELECT * FROM positions ORDER BY entry_time DESC`, [], (err, rows) => {
      if (!err) {
        io.emit('positions:update', rows);
        console.log(`📤 positions:update emitted (${rows.length} positions)`);
      }
    });
  
    db.all(`SELECT * FROM trades WHERE DATE(exit_time) = ?`, [today], (err, rows) => {
      if (!err) {
        let grossProfit = 0;
        let totalFees = 0;
        rows.forEach(({ side, entry_price, exit_price, qty, fees }) => {
          const pnl = side === 'long'
            ? (exit_price - entry_price) * qty
            : (entry_price - exit_price) * qty;
          grossProfit += pnl;
          totalFees += fees;
        });
  
        const netProfit = grossProfit - totalFees;
  
        io.emit('summary:update', {
          grossProfit: +grossProfit.toFixed(2),
          totalFees: +totalFees.toFixed(2),
          netProfit: +netProfit.toFixed(2),
          count: rows.length
        });
  
        console.log(`📤 summary:update emitted | Profit: $${netProfit.toFixed(2)} from ${rows.length} trades`);
      }
    });
  }
  

setInterval(broadcastTrades, 5000); // broadcast every 5 seconds

// --- Start Server ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 API + WebSocket server running at http://localhost:${PORT}`);
});
