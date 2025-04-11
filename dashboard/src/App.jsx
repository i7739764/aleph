import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import './index.css';

const socket = io('http://localhost:4000');

export default function App() {
  const [summary, setSummary] = useState({ grossProfit: 0, totalFees: 0, netProfit: 0 });
  const [positions, setPositions] = useState([]);
  const [trades, setTrades] = useState([]);
  const [biasHistory, setBiasHistory] = useState([]);
  const [setupRules, setSetupRules] = useState([]);
  const [ruleChoices, setRuleChoices] = useState({});
  const [tab, setTab] = useState('positions');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [strategy, setStrategy] = useState('both');
   const [lastBotRun, setLastBotRun] = useState(null);

  const updateTimestamp = () => setLastUpdate(new Date().toLocaleTimeString());

  const fetchStrategy = async () => {
    const res = await fetch('http://localhost:4000/api/strategy');
    const data = await res.json();
    setStrategy(data.strategy);
  };

  const updateStrategy = async (mode) => {
    await fetch('http://localhost:4000/api/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: mode })
    });
    setStrategy(mode);
  };

  const runBiasCheck = async () => {
    const res = await fetch('http://localhost:4000/api/bias-check');
    const data = await res.json();
    if (data?.strategy) {
      await updateStrategy(data.strategy);
    }
  };

  const fetchBiasHistory = async () => {
    const res = await fetch('http://localhost:4000/api/bias-history');
    const data = await res.json();
    setBiasHistory(data);
  };

  const fetchSetupRules = async () => {
    const res = await fetch('http://localhost:4000/api/setup-rules');
    const rules = await res.json();
    setSetupRules(rules);

    const choices = {};
    for (const rule of rules) {
      const r = await fetch(`http://localhost:4000/api/setup-choices/${rule.RuleID}`);
      choices[rule.RuleID] = await r.json();
    }
    setRuleChoices(choices);
  };

  const applyRecommendedSetup = async () => {
    const res = await fetch('http://localhost:4000/api/setup-rules/set-recommended', {
      method: 'POST'
    });
    if (res.ok) await fetchSetupRules();
  };

  const updateRuleValue = async (ruleID, value) => {
    await fetch('http://localhost:4000/api/setup-rules/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleID, value })
    });
  };

  useEffect(() => {
    fetchStrategy();
    fetchBiasHistory();
    fetchSetupRules();

    fetch('http://localhost:4000/api/summary')
      .then(res => res.json())
      .then(data => { setSummary(data); updateTimestamp(); });

    fetch('http://localhost:4000/api/positions')
      .then(res => res.json())
      .then(data => { setPositions([...data]); updateTimestamp(); });

    fetch('http://localhost:4000/api/trades/today')
      .then(res => res.json())
      .then(data => { setTrades([...data]); updateTimestamp(); });

    socket.on('connect', () => console.log('📡 Connected:', socket.id));
    socket.on('disconnect', () => console.warn('📴 Disconnected'));
    socket.on('connect_error', err => console.error('❌ WebSocket error:', err.message));

    socket.on('summary:update', data => {
      setSummary(data);
      updateTimestamp();
    });

    socket.on('positions:update', data => {
      setPositions([...data]);
      updateTimestamp();
    });

    socket.on('trades:update', data => {
      setTrades([...data]);
      updateTimestamp();
    });

    const interval = setInterval(async () => {
      const res = await fetch('http://localhost:4000/api/last-run');
      const data = await res.json();
      setLastBotRun(data.time);
    }, 30000);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('positions:update');
      socket.off('summary:update');
      socket.off('trades:update');
      clearInterval(interval);
    };
  }, []);

  const renderControls = () => (
    <div className="flex gap-4 items-center">
      <label htmlFor="strategy">Side:</label>
      <select
        value={strategy}
        onChange={(e) => updateStrategy(e.target.value)}
        className="border px-2 py-1 rounded"
      >
        <option value="long">🔁 Auto: Long</option>
        <option value="short">🔁 Auto: Short</option>
        <option value="both">🔁 Auto: Both</option>
        <option value="manual-long">🧍 Manual: Long</option>
        <option value="manual-short">🧍 Manual: Short</option>
        <option value="manual-both">🧍 Manual: Both</option>
      </select>
      <button
        onClick={runBiasCheck}
        className="bg-blue-500 text-white px-3 py-1 rounded"
      >
        🔍 Check Bias
      </button>
    </div>
  );

  const renderSetupRules = () => (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">⚙️ Setup Thresholds</h2>
      <button
        onClick={applyRecommendedSetup}
        className="mb-4 bg-green-500 text-white px-4 py-2 rounded"
      >
        ✅ Set All to Recommended
      </button>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th>Label</th>
            <th>Value</th>
            <th>Risk</th>
            <th>Recommended</th>
          </tr>
        </thead>
        <tbody>
          {setupRules.map((rule, idx) => {
            const options = ruleChoices[rule.RuleID] || [];
            const currentValue = rule.CurrentChoiceValue;
            const isRecommended = options.some(opt =>
              opt.RiskValue === 'recommended' && opt.ChoiceValue === currentValue
            );
            const currentRisk = options.find(opt => opt.ChoiceValue === currentValue)?.RiskValue || '—';

            return (
              <tr key={idx} className="border-b hover:bg-gray-100">
                <td>{rule.label}</td>
                <td>
                  <select
                    className="border px-2 py-1 rounded w-full"
                    value={currentValue}
                    onChange={async (e) => {
                      const value = e.target.value;
                      const updated = [...setupRules];
                      updated[idx].CurrentChoiceValue = value;
                      setSetupRules(updated);
                      await updateRuleValue(rule.RuleID, value);
                    }}
                  >
                    {options.map((opt, i) => (
                      <option key={i} value={opt.ChoiceValue}>
                        {opt.ChoiceValue} — {opt.RiskValue}{opt.RiskValue === 'recommended' ? ' ✅' : ''}
                      </option>
                    ))}
                    {!options.some(opt => opt.ChoiceValue === currentValue) && (
                      <option value={currentValue}>{currentValue} — custom</option>
                    )}
                  </select>
                </td>
                <td>{currentRisk}</td>
                <td>{isRecommended ? '✅' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderBiasHistory = () => (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">Bias History (Today)</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th>Time</th>
            <th>Strategy</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {biasHistory.map((entry, idx) => (
            <tr key={idx} className="border-b hover:bg-gray-100">
              <td>{new Date(entry.timestamp).toLocaleTimeString()}</td>
              <td className="capitalize">{entry.strategy}</td>
              <td className="capitalize">{entry.source}</td>
            </tr>
          ))}
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
            <th>Symbol</th>
            <th>Side</th>
            <th>Qty</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>Profit</th>
            <th>Time</th>
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
                <td>{trade.symbol}</td>
                <td className="capitalize">{trade.side}</td>
                <td>{trade.qty}</td>
                <td>${trade.entry_price.toFixed(2)}</td>
                <td>${trade.exit_price.toFixed(2)}</td>
                <td className={pnlColor}>${net.toFixed(2)}</td>
                <td>{new Date(trade.exit_time).toLocaleTimeString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderPositions = () => (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">Open Positions</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th>Symbol</th>
            <th>Side</th>
            <th>Qty</th>
            <th>Entry Price</th>
            <th>Current Price</th>
            <th>PnL</th>
            <th>Entry Time</th>
            <th>Last Update</th>
          </tr>
        </thead>
        <tbody>
          {positions.map(pos => {
            if (pos.entry_price == null) return null;


            const pnl = pos.side === 'long'
              ? (pos.current_price - pos.entry_price) * pos.qty
              : (pos.entry_price - pos.current_price) * Math.abs(pos.qty);

            const isProfit = pos.side === 'long'
              ? pos.current_price > pos.entry_price
              : pos.current_price < pos.entry_price;

            const pnlColor = isProfit ? 'text-green-600' : 'text-red-600';

            return (
              <tr key={pos.id} className={`border-b hover:bg-gray-100`}>
                <td>{pos.symbol}</td>
                <td className="capitalize">{pos.side}</td>
                <td>{pos.qty}</td>
                <td>${pos.entry_price.toFixed(2)}</td>
                <td>
                  {pos.current_price != null && !isNaN(pos.current_price)
                    ? `$${parseFloat(pos.current_price).toFixed(2)}`
                    : '—'}
                </td>
                <td className={pnlColor}>{isNaN(pnl) ? '—' : `$${pnl.toFixed(2)}`}</td>
                <td>{new Date(pos.entry_time).toLocaleTimeString()}</td>
                <td>
                  {pos.last_update && !isNaN(new Date(pos.last_update))
                    ? new Date(pos.last_update).toLocaleTimeString()
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <div className="bg-white shadow p-4 flex flex-wrap justify-between items-center sticky top-0 z-10">
        <h1 className="text-2xl font-bold">📊 Realtime Trade Dashboard</h1>
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="text-sm space-x-4">
            <span>💵 Profit: ${summary.grossProfit.toFixed(2)}</span>
            <span>💸 Fees: ${summary.totalFees.toFixed(2)}</span>
            <span>✅ Net: ${summary.netProfit.toFixed(2)}</span>
            <span>🤖 Last Bot Run: {lastBotRun ? new Date(lastBotRun).toLocaleTimeString() : '—'}</span>
          </div>
          {renderControls()}
        </div>
      </div>

      <div className="flex space-x-4 p-4">
        <button onClick={() => setTab('positions')} className={`px-4 py-2 rounded ${tab === 'positions' ? 'bg-blue-500 text-white' : 'bg-white border'}`}>Open Positions</button>
        <button onClick={() => setTab('trades')} className={`px-4 py-2 rounded ${tab === 'trades' ? 'bg-blue-500 text-white' : 'bg-white border'}`}>Today's Trades</button>
        <button onClick={() => setTab('bias')} className={`px-4 py-2 rounded ${tab === 'bias' ? 'bg-blue-500 text-white' : 'bg-white border'}`}>Bias Info</button>
        <button onClick={() => setTab('setup')} className={`px-4 py-2 rounded ${tab === 'setup' ? 'bg-blue-500 text-white' : 'bg-white border'}`}>Setup</button>
      </div>

      {tab === 'positions' ? renderPositions()
        : tab === 'trades' ? renderTrades()
        : tab === 'bias' ? renderBiasHistory()
        : renderSetupRules()}
    </div>
  );
}
