// src/App.jsx


import './index.css';

import { useEffect, useState } from 'react';
import socket from './socket';







export default function App() {
  const [summary, setSummary] = useState({ grossProfit: 0, totalFees: 0, netProfit: 0 });
  const [positions, setPositions] = useState([]);
  const [trades, setTrades] = useState([]);
  const [tab, setTab] = useState('positions');
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    const updateTimestamp = () => setLastUpdate(new Date().toLocaleTimeString());
  
    fetch('http://localhost:4000/api/summary')
      .then(res => res.json())
      .then(data => { setSummary(data); updateTimestamp(); });
  
    fetch('http://localhost:4000/api/positions')
      .then(res => res.json())
      .then(data => { setPositions(data); updateTimestamp(); });
  
    fetch('http://localhost:4000/api/trades/today')
      .then(res => res.json())
      .then(data => { setTrades(data); updateTimestamp(); });
  
    socket.on('connect', () => console.log('📡 Connected:', socket.id));
    socket.on('disconnect', () => console.warn('📴 Disconnected'));
    socket.on('connect_error', err => console.error('❌ WebSocket error:', err.message));
  
    socket.on('summary:update', data => {
      console.log('📡 summary:update received');
      setSummary(data);
      updateTimestamp();
    });
  
    socket.on('positions:update', data => {
      console.log('📡 positions:update received');
      setPositions(data);
      updateTimestamp();
    });
  
    socket.on('trades:update', data => {
      console.log('📡 trades:update received');
      setTrades(data);
      updateTimestamp();
    });
  
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('positions:update');
    };
  }, []);

  const renderPositions = () => (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">Open Positions</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="text-left">Symbol</th>
            <th className="text-left">Side</th>
            <th className="text-left">Qty</th>
            <th className="text-left">Entry Price</th>
            <th className="text-left">Current Price</th>
            <th className="text-left">PnL</th>
            <th className="text-left">Entry Time</th>
            <th className="text-left">Last Update</th>
          </tr>
        </thead>
        <tbody>
          {positions.map(pos => {
            if (!pos.current_price || !pos.entry_price) return null;
            const pnl = pos.side === 'long'
              ? (pos.current_price - pos.entry_price) * pos.qty
              : (pos.entry_price - pos.current_price) * Math.abs(pos.qty);

            const isProfit = pos.side === 'long'
              ? pos.current_price > pos.entry_price
              : pos.current_price < pos.entry_price;

            const pnlColor = isProfit ? 'text-green-600' : 'text-red-600';

            return (
              <tr key={pos.id} className="border-b hover:bg-gray-100">
                <td className="text-left">{pos.symbol}</td>
                <td className="text-left capitalize">{pos.side}</td>
                <td className="text-left">{pos.qty}</td>
                <td className="text-left">${pos.entry_price?.toFixed(2)}</td>
                <td className="text-left">{pos.current_price !== undefined && !isNaN(pos.current_price) ? `$${pos.current_price.toFixed(2)}` : '—'}</td>
                <td className={`text-left ${pnlColor}`}>{isNaN(pnl) ? '—' : `$${pnl.toFixed(2)}`}</td>
                <td className="text-left">{new Date(pos.entry_time).toLocaleTimeString()}</td>
                <td className="text-left">
                  {pos.last_update ? new Date(pos.last_update).toLocaleTimeString() : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderTrades = () => (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">Today's Trades</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="text-left">Symbol</th>
            <th className="text-left">Side</th>
            <th className="text-left">Qty</th>
            <th className="text-left">Entry</th>
            <th className="text-left">Exit</th>
            <th className="text-left">Profit</th>
            <th className="text-left">Time</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(trade => {
            const profit = trade.side === 'long'
              ? (trade.exit_price - trade.entry_price) * trade.qty
              : (trade.entry_price - trade.exit_price) * trade.qty;
            const net = profit - trade.fees;
            const pnlColor = net >= 0 ? 'text-green-600' : 'text-red-600';

            return (
              <tr key={trade.id} className="border-b hover:bg-gray-100">
                <td className="text-left">{trade.symbol}</td>
                <td className="text-left capitalize">{trade.side}</td>
                <td className="text-left">{trade.qty}</td>
                <td className="text-left">${trade.entry_price.toFixed(2)}</td>
                <td className="text-left">${trade.exit_price.toFixed(2)}</td>
                <td className={`text-left ${pnlColor}`}>${net.toFixed(2)}</td>
                <td className="text-left">{new Date(trade.exit_time).toLocaleTimeString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <div className="bg-white shadow p-4 flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-2xl font-bold">📊 Realtime Trade Dashboard</h1>
        <div className="text-sm space-x-4">
          <span>💵 Profit: ${summary.grossProfit.toFixed(2)}</span>
          <span>💸 Fees: ${summary.totalFees.toFixed(2)}</span>
          <span>✅ Net: ${summary.netProfit.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex space-x-4 p-4">
        <button
          onClick={() => setTab('positions')}
          className={`px-4 py-2 rounded ${tab === 'positions' ? 'bg-blue-500 text-white' : 'bg-white border'}`}
        >
          Open Positions
        </button>
        <button
          onClick={() => setTab('trades')}
          className={`px-4 py-2 rounded ${tab === 'trades' ? 'bg-blue-500 text-white' : 'bg-white border'}`}
        >
          Today's Trades
        </button>
      </div>

      {tab === 'positions' ? renderPositions() : renderTrades()}
    </div>
  );
}
