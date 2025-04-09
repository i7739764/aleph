# Alpaca Bot Trading Dashboard

This is a trading bot system that uses Alpaca's paper trading API to place and track long and short positions in real time. It includes a backend with trading logic and a live React dashboard for visualization.

---

## Structure

- **server.js**: REST API and WebSocket server
- **longbot.js / shortbot.js**: Entry and exit logic for long and short trades
- **db.js**: Handles SQLite database operations
- **dashboard/**: React frontend built with Vite + Tailwind
- **bot_trades.db**: SQLite database (ignored in Git)
- **.env**: Contains Alpaca API keys (not committed)
- **.env.example**: Template for environment variables

---

## Running the Bot

1. Clone this repo and install dependencies:

   git clone https://github.com/YOUR_USERNAME/alpaca-bot.git  
   cd alpaca-bot  
   npm install  
   cd dashboard  
   npm install

2. Create a `.env` file in the root with your API keys:

   ALPACA_API_KEY=your_key  
   ALPACA_SECRET_KEY=your_secret

3. Start the backend (you can run these in separate terminals):

   node server.js  
   node longbot.js  
   node shortbot.js

4. Start the frontend dashboard:

   cd dashboard  
   npm run dev

   Then open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Tech Stack

- Node.js, Express, Socket.IO
- SQLite
- Alpaca Trade API
- React, Vite, Tailwind CSS

---

## License

MIT © 2025 Your Name
