// src/App.jsx
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
      const res = await fetch(`http://localhost:4000/api/setup-choices/${rule.RuleID}`);
      choices[rule.RuleID] = await res.json();
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

  const renderSetupRules = () => {
    return (
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
  
              const isRecommended = options.some(
                (opt) => opt.RiskValue === 'recommended' && opt.ChoiceValue === currentValue
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
  };
  

}
