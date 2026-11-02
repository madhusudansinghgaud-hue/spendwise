import { useState, useEffect } from 'react';
import { savingsApi, analysisApi } from '../api';
import toast from 'react-hot-toast';

const fmt = (n) => (n || 0).toLocaleString('en-IN');

function formatMonthLabel(str) {
  try {
    const [y, m] = str.split('-');
    return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  } catch {
    return str;
  }
}

export default function Savings() {
  const [summary, setSummary]           = useState(null);
  const [history, setHistory]           = useState(null);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [settling, setSettling]         = useState(false);

  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  // Manual deposit modal
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount]       = useState('');
  const [depositTitle, setDepositTitle]         = useState('Emergency Fund Deposit');
  const [depositSource, setDepositSource]       = useState('manual_deposit');

  const fetchMonths = async () => {
    try {
      const res = await analysisApi.getMonths();
      if (res.data?.length) setAvailableMonths(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSavingsData = async (month) => {
    try {
      setLoading(true);
      const [sumRes, histRes] = await Promise.all([
        savingsApi.getSummary(month),
        savingsApi.getHistory()
      ]);
      setSummary(sumRes.data);
      setHistory(histRes.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load savings data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMonths(); }, []);
  useEffect(() => { fetchSavingsData(selectedMonth); }, [selectedMonth]);

  // Settle leftover money into savings
  const handleSettleMonth = async () => {
    try {
      setSettling(true);
      const res = await savingsApi.settleMonth({
        month_year: selectedMonth,
        notes: `Month-end leftover settlement for ${selectedMonth}`
      });
      if (res.data.status === 'already_settled') {
        toast(res.data.message, { icon: 'ℹ️' });
      } else {
        toast.success(res.data.message);
      }
      fetchSavingsData(selectedMonth);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to settle month into savings');
    } finally {
      setSettling(false);
    }
  };

  // Add manual deposit
  const handleDeposit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) { toast.error('Please enter a valid deposit amount'); return; }
    try {
      await savingsApi.deposit({ amount: amt, title: depositTitle, source: depositSource });
      toast.success(`Successfully deposited ₹${amt.toLocaleString('en-IN')} to Savings! 🏦`);
      setShowDepositModal(false);
      setDepositAmount('');
      setDepositTitle('Emergency Fund Deposit');
      fetchSavingsData(selectedMonth);
    } catch (err) {
      console.error(err);
      toast.error('Failed to process savings deposit');
    }
  };

  const fin               = summary?.month_financials || { income: 0, expenses: 0, investments: 0, remaining: 0, positive_leftover: 0 };
  const totalLifetime     = summary?.total_savings || 0;
  const autoSavedTotal    = summary?.auto_saved_total || 0;
  const manualSavedTotal  = summary?.manual_savings_total || 0;
  const isSettled         = summary?.is_settled || false;

  const sourceLabel = (src) => ({
    auto_leftover: '🔄 Auto Leftover',
    manual_deposit: '💼 Manual Deposit',
    emergency_buffer: '🛡️ Emergency Reserve',
    goal_allocation: '🎯 Goal Allocation',
  }[src] || src);

  return (
    <div className="page-container">

      {/* ── Page Header ── */}
      <div className="page-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <span style={{ fontSize: '12px', color: 'var(--coral-accent)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>SAVINGS</span>
          <h1 className="page-title" style={{ margin: '4px 0 6px' }}>💰 Savings Vault</h1>
          <p className="page-subtitle">
            Auto-transfer month-end leftover into savings. Track total accumulated wealth and monthly settlement history.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--card-bg)', padding: '6px 14px', borderRadius: '24px', border: '1px solid var(--card-border)' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)' }}>Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--coral-accent)', fontSize: '14px', fontWeight: 700, cursor: 'pointer', outline: 'none' }}
            >
              {availableMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setShowDepositModal(true)}
            style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '24px', padding: '10px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            + Manual Deposit
          </button>
        </div>
      </div>

      {/* ── Total Savings Hero Card ── */}
      <div className="card-soft" style={{
        background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(99,102,241,0.08))',
        border: '1px solid rgba(16,185,129,0.3)',
        padding: '28px',
        margin: '20px 0',
        borderRadius: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🏦 TOTAL SAVINGS ACCUMULATED
            </span>
            <h2 style={{ fontSize: '36px', fontWeight: 900, color: 'var(--text-dark)', margin: '6px 0' }}>
              ₹{fmt(totalLifetime)}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
              ₹{fmt(autoSavedTotal)} auto-saved from month-end leftovers&nbsp;+&nbsp;₹{fmt(manualSavedTotal)} manual deposits
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'right' }}>
            <span style={{ display: 'inline-block', background: 'rgba(16,185,129,0.2)', color: '#10b981', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
              🛡️ Protected Wealth Reserve
            </span>
          </div>
        </div>
      </div>

      {/* ── Monthly Remaining Calculation ── */}
      <div className="card-soft" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--text-dark)', fontSize: '17px', fontWeight: 700 }}>
              ⚖️ Month-End Calculation — {formatMonthLabel(selectedMonth)}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
              Formula: <strong>Income − Expenses − Investments = Remaining → Auto-Savings</strong>
            </p>
          </div>
          {isSettled ? (
            <span style={{ padding: '6px 14px', borderRadius: '20px', background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: '12px', fontWeight: 700 }}>
              ✅ Settled (+₹{fmt(summary?.settled_record?.savings_added)})
            </span>
          ) : (
            <span style={{ padding: '6px 14px', borderRadius: '20px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: '12px', fontWeight: 700 }}>
              ⏳ Pending Settlement
            </span>
          )}
        </div>

        {/* Formula Visualizer */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '10px',
          alignItems: 'center',
          background: 'var(--bg-main)',
          padding: '18px',
          borderRadius: '14px',
          border: '1px solid var(--card-border)',
          marginBottom: '18px'
        }}>
          {[
            { label: '1. INCOME',      val: fin.income,      color: '#10b981', op: null },
            { label: null,             val: null,             color: null,      op: '−' },
            { label: '2. EXPENSES',    val: fin.expenses,    color: '#ef4444', op: null },
            { label: null,             val: null,             color: null,      op: '−' },
            { label: '3. INVESTMENTS', val: fin.investments, color: '#6366f1', op: null },
            { label: null,             val: null,             color: null,      op: '=' },
            { label: '4. REMAINING',   val: fin.remaining,   color: fin.remaining >= 0 ? '#10b981' : '#ef4444', op: null, highlight: true },
          ].map((item, i) => {
            if (item.op) {
              return (
                <div key={i} style={{ textAlign: 'center', fontSize: '22px', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {item.op}
                </div>
              );
            }
            return (
              <div key={i} style={{
                textAlign: 'center',
                background: item.highlight ? (fin.remaining >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)') : 'transparent',
                padding: '12px',
                borderRadius: '10px',
                border: item.highlight ? `1px solid ${fin.remaining >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` : 'none',
              }}>
                <span style={{ fontSize: '10px', color: item.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{item.label}</span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: item.color, marginTop: '4px' }}>
                  {item.label === '4. REMAINING' && fin.remaining < 0 ? '-' : ''}₹{fmt(Math.abs(item.val))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-dark)', fontWeight: 500 }}>
            {isSettled
              ? `🎉 Already settled on ${summary?.settled_record?.settled_at ? new Date(summary.settled_record.settled_at).toLocaleDateString('en-IN') : '—'}. No double-counting will occur.`
              : fin.remaining > 0
                ? `💡 Click to add ₹${fmt(fin.remaining)} leftover to your Savings Vault.`
                : '⚠️ No positive leftover to transfer for this month.'}
          </span>

          <button
            type="button"
            className="btn-pill-coral"
            onClick={handleSettleMonth}
            disabled={settling || isSettled}
            style={{ opacity: isSettled ? 0.6 : 1, cursor: isSettled ? 'not-allowed' : 'pointer', padding: '10px 22px' }}
          >
            {isSettled ? '✅ Already Settled' : settling ? 'Settling…' : `🚀 Add ₹${fmt(Math.max(0, fin.remaining))} to Savings`}
          </button>
        </div>
      </div>

      {/* ── Historical Monthly Settlements ── */}
      <div className="card-soft" style={{ padding: 0, overflowX: 'auto', marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--card-border)' }}>
          <h3 style={{ margin: 0, color: 'var(--text-dark)', fontSize: '16px', fontWeight: 700 }}>
            📅 Historical Monthly Settlements
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '4px 0 0' }}>
            Each month settled once — no double-counting guaranteed
          </p>
        </div>
        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '13px 16px', textAlign: 'left' }}>Month</th>
              <th style={{ padding: '13px 16px', textAlign: 'right' }}>Income</th>
              <th style={{ padding: '13px 16px', textAlign: 'right' }}>Expenses</th>
              <th style={{ padding: '13px 16px', textAlign: 'right' }}>Investments</th>
              <th style={{ padding: '13px 16px', textAlign: 'right' }}>Remaining</th>
              <th style={{ padding: '13px 16px', textAlign: 'right' }}>Added to Savings</th>
              <th style={{ padding: '13px 16px', textAlign: 'center' }}>Settled On</th>
              <th style={{ padding: '13px 16px', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {!history?.monthly_records || history.monthly_records.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No months settled yet. Use the "Add Leftover to Savings" button above to record your first month-end closure.
                </td>
              </tr>
            ) : (
              history.monthly_records.map((rec) => (
                <tr key={rec.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-dark)', fontSize: '13px' }}>
                    {formatMonthLabel(rec.month_year)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#10b981', fontWeight: 600, fontSize: '13px' }}>₹{fmt(rec.income)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#ef4444', fontWeight: 600, fontSize: '13px' }}>₹{fmt(rec.expenses)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6366f1', fontWeight: 600, fontSize: '13px' }}>₹{fmt(rec.investments)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontSize: '13px', color: rec.remaining_amount >= 0 ? '#10b981' : '#ef4444' }}>
                    {rec.remaining_amount >= 0 ? '' : '-'}₹{fmt(Math.abs(rec.remaining_amount))}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#10b981', fontWeight: 800, fontSize: '14px' }}>
                    +₹{fmt(rec.savings_added)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                    {rec.settled_at ? new Date(rec.settled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{ padding: '3px 8px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: '11px', fontWeight: 700 }}>
                      ✅ Settled
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── All Savings Transactions ── */}
      <div className="card-soft" style={{ padding: 0, overflowX: 'auto', marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--card-border)' }}>
          <h3 style={{ margin: 0, color: 'var(--text-dark)', fontSize: '16px', fontWeight: 700 }}>
            🧾 All Savings Transactions
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '4px 0 0' }}>
            Recent 50 savings entries — auto-leftover and manual deposits
          </p>
        </div>
        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '13px 16px', textAlign: 'left' }}>Description</th>
              <th style={{ padding: '13px 16px', textAlign: 'left' }}>Source</th>
              <th style={{ padding: '13px 16px', textAlign: 'left' }}>Month</th>
              <th style={{ padding: '13px 16px', textAlign: 'left' }}>Date</th>
              <th style={{ padding: '13px 16px', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {!history?.transactions || history.transactions.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No savings transactions yet. Settle a month or add a manual deposit.
                </td>
              </tr>
            ) : (
              history.transactions.map((tx) => (
                <tr key={tx.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-dark)', fontSize: '13px' }}>{tx.title}</td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {sourceLabel(tx.source)}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {tx.month_year ? formatMonthLabel(tx.month_year) : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#10b981', fontSize: '14px' }}>
                    +₹{fmt(tx.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Manual Deposit Modal ── */}
      {showDepositModal && (
        <div className="modal-backdrop">
          <div className="card-soft modal-card" style={{ maxWidth: '420px', width: '90%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-dark)', fontSize: '18px' }}>🏦 Manual Savings Deposit</h3>
              <button type="button" onClick={() => setShowDepositModal(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <form onSubmit={handleDeposit}>
              <div className="form-group">
                <label className="form-label">Deposit Amount (₹) *</label>
                <input type="number" step="100" className="form-input" placeholder="e.g. 5000" required
                  value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Purpose / Goal</label>
                <input type="text" className="form-input" placeholder="e.g. Emergency Fund, Vacation Savings"
                  value={depositTitle} onChange={(e) => setDepositTitle(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-input" value={depositSource} onChange={(e) => setDepositSource(e.target.value)}>
                  <option value="manual_deposit">Personal Savings Deposit</option>
                  <option value="emergency_buffer">Emergency Cushion Reserve</option>
                  <option value="goal_allocation">Goal-Specific Allocation</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowDepositModal(false)}
                  style={{ flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid var(--card-border)', background: 'var(--bg-main)', color: 'var(--text-dark)', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit"
                  style={{ flex: 1, padding: '10px', borderRadius: '12px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  Deposit to Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
