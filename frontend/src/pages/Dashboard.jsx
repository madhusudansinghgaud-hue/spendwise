import { useState, useEffect } from 'react';
import { dashboardApi } from '../api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, theme, toggleTheme, setShowProfileModal } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);

  const currentDate = new Date();
  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const yearNum = currentDate.getFullYear();

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await dashboardApi.getSummary();
      setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const timer = setInterval(fetchDashboardData, 60000);
    return () => clearInterval(timer);
  }, []);

  if (loading || !data) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading SpendWise Dashboard...</p>
      </div>
    );
  }

  // Core financial figures
  const income    = data.monthly_income    || 0;
  const expenses  = data.monthly_expenses  || 0;
  const investments = data.monthly_investments || 0;
  const remaining = data.remaining_amount !== undefined ? data.remaining_amount : (income - expenses - investments);
  const totalSavings = data.total_savings || 0;

  // Flow distribution percentages
  const spentPct    = income > 0 ? Math.min(100, (expenses    / income) * 100) : 0;
  const investedPct = income > 0 ? Math.min(100 - spentPct, (investments / income) * 100) : 0;
  const remainingPct = Math.max(0, 100 - spentPct - investedPct);

  const trendData = (data.trend || []).map(t => ({ label: t.date, spend: t.amount }));

  const overBudgetCats = (data.category_summary || []).filter(c => c.exceeded);

  return (
    <div className="dashboard-page">

      {/* ── Top Header ── */}
      <header className="dash-top-header" style={{ marginBottom: '20px' }}>
        <div>
          <span style={{ fontSize: '12px', color: 'var(--coral-accent)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            OVERVIEW
          </span>
          <h1 className="dash-page-title" style={{ margin: '2px 0 0' }}>
            Financial Dashboard
          </h1>
        </div>

        <div className="dash-header-actions">
          <button type="button" className="dash-theme-btn" onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}>
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>

          <button type="button" className="dash-profile-chip-btn" onClick={() => setShowProfileModal(true)}>
            <span className="chip-avatar">{user?.avatar || '👨‍💻'}</span>
            <span className="chip-name">{user?.display_name || 'Hunter'}</span>
          </button>

          <div className="dash-date-badge">
            <span>📅 {monthName} {yearNum}</span>
          </div>

          <button
            className="dash-bell-btn"
            onClick={() => setShowNotifications(!showNotifications)}
            title="Budget Alerts"
          >
            <span>🔔</span>
            {overBudgetCats.length > 0 && (
              <span className="bell-red-badge">{overBudgetCats.length}</span>
            )}
          </button>
        </div>
      </header>

      {/* ── Notifications Popover ── */}
      {showNotifications && (
        <div className="notifications-popover">
          <div className="popover-header">
            <strong>Budget Alerts ({overBudgetCats.length})</strong>
            <button onClick={() => setShowNotifications(false)}>✕</button>
          </div>
          {overBudgetCats.length > 0 ? (
            overBudgetCats.map((cat, i) => (
              <div key={i} className="popover-item alert">
                <span>{cat.icon}</span>
                <div>
                  <strong>{cat.name} Budget Exceeded!</strong>
                  <p>Spent ₹{cat.monthly_spent?.toLocaleString('en-IN')} / Budget ₹{cat.monthly_limit?.toLocaleString('en-IN')} (+₹{cat.excess?.toLocaleString('en-IN')} over)</p>
                </div>
              </div>
            ))
          ) : (
            <div className="popover-item clean">
              <span>✅</span>
              <p>All categories are within monthly budgets!</p>
            </div>
          )}
        </div>
      )}

      {/* ── Hero Welcome Banner ── */}
      <section className="dash-hero-banner" style={{ padding: '20px 24px', margin: '0 0 20px', borderRadius: '18px' }}>
        <div className="hero-text-content">
          <span className="hero-greeting">Welcome back, {user?.display_name || 'Hunter'} 👋</span>
          <h2 className="hero-heading" style={{ fontSize: '21px', margin: '6px 0 10px' }}>
            {remaining >= 0
              ? `₹${remaining.toLocaleString('en-IN')} unallocated this month`
              : `Monthly deficit: ₹${Math.abs(remaining).toLocaleString('en-IN')} over budget`}
          </h2>
          <div className="hero-subtags">
            <span className="hero-pill-tag">📅 {monthName} {yearNum}</span>
            {overBudgetCats.length > 0 && (
              <span className="hero-pill-tag" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                ⚠️ {overBudgetCats.length} category budget{overBudgetCats.length > 1 ? 's' : ''} exceeded
              </span>
            )}
            {remaining > 0 && (
              <span className="hero-pill-tag" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                ✨ ₹{remaining.toLocaleString('en-IN')} can be saved
              </span>
            )}
          </div>
        </div>
        <div className="hero-illustration-box" style={{ fontSize: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          💹
        </div>
      </section>

      {/* ── 5 Core Financial Pillars ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>

        {/* Income */}
        <div className="card-soft" style={{ padding: '18px', borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>💰 INCOME</span>
            <span style={{ fontSize: '16px' }}>📥</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-dark)', marginTop: '6px' }}>
            ₹{income.toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Received this month</span>
        </div>

        {/* Expenses */}
        <div className="card-soft" style={{ padding: '18px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>💸 EXPENSES</span>
            <span style={{ fontSize: '16px' }}>📤</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-dark)', marginTop: '6px' }}>
            ₹{expenses.toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {income > 0 ? `${((expenses / income) * 100).toFixed(0)}% of income` : 'Total spending'}
          </span>
        </div>

        {/* Investments */}
        <div className="card-soft" style={{ padding: '18px', borderLeft: '4px solid #6366f1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: '#6366f1', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🎯 INVESTED</span>
            <span style={{ fontSize: '16px' }}>📈</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-dark)', marginTop: '6px' }}>
            ₹{investments.toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SIP, Stocks & Wealth</span>
        </div>

        {/* Savings Vault */}
        <div className="card-soft" style={{ padding: '18px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🏦 SAVINGS</span>
            <span style={{ fontSize: '16px' }}>🛡️</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-dark)', marginTop: '6px' }}>
            ₹{totalSavings.toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Lifetime accumulated</span>
        </div>

        {/* Remaining */}
        <div className="card-soft" style={{
          padding: '18px',
          borderLeft: `4px solid ${remaining >= 0 ? '#10b981' : '#ef4444'}`,
          background: remaining >= 0 ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: remaining >= 0 ? '#10b981' : '#ef4444', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ⚖️ REMAINING
            </span>
            <span style={{ fontSize: '16px' }}>{remaining >= 0 ? '✨' : '⚠️'}</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: remaining >= 0 ? '#10b981' : '#ef4444', marginTop: '6px' }}>
            {remaining >= 0 ? '' : '-'}₹{Math.abs(remaining).toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {remaining >= 0 ? 'Income − Spend − Invest' : 'Monthly Deficit'}
          </span>
        </div>
      </div>

      {/* ── Income Flow Distribution Bar ── */}
      <div className="card-soft" style={{ padding: '14px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-dark)' }}>
            Monthly Income Allocation
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Spent {spentPct.toFixed(0)}% · Invested {investedPct.toFixed(0)}% · Unallocated {remainingPct.toFixed(0)}%
          </span>
        </div>
        <div style={{ height: '10px', borderRadius: '6px', background: 'var(--bg-main)', display: 'flex', overflow: 'hidden', border: '1px solid var(--card-border)' }}>
          <div style={{ width: `${spentPct}%`, background: '#ef4444', transition: 'width 0.5s' }} title={`Expenses: ${spentPct.toFixed(1)}%`} />
          <div style={{ width: `${investedPct}%`, background: '#6366f1', transition: 'width 0.5s' }} title={`Investments: ${investedPct.toFixed(1)}%`} />
          <div style={{ width: `${remainingPct}%`, background: '#10b981', transition: 'width 0.5s' }} title={`Unallocated: ${remainingPct.toFixed(1)}%`} />
        </div>
        <div style={{ display: 'flex', gap: '14px', marginTop: '6px', flexWrap: 'wrap' }}>
          {[['#ef4444','Expenses'], ['#6366f1','Invested'], ['#10b981','Unallocated']].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: c }} />
              {l}
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick Action Pills ── */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <Link to="/transactions" className="btn-pill-coral" style={{ textDecoration: 'none' }}>
          + Add Expense
        </Link>
        <Link to="/transactions" style={{ textDecoration: 'none', background: '#10b981', color: '#fff', borderRadius: '24px', padding: '10px 18px', fontSize: '13px', fontWeight: 600 }}>
          + Log Income
        </Link>
        <Link to="/transactions" style={{ textDecoration: 'none', background: '#6366f1', color: '#fff', borderRadius: '24px', padding: '10px 18px', fontSize: '13px', fontWeight: 600 }}>
          + Investment
        </Link>
        <Link to="/budget" style={{ textDecoration: 'none', background: 'var(--card-bg)', color: 'var(--text-dark)', border: '1px solid var(--card-border)', borderRadius: '24px', padding: '10px 18px', fontSize: '13px', fontWeight: 600 }}>
          📊 Category Budgets
        </Link>
        <Link to="/savings" style={{ textDecoration: 'none', background: 'var(--card-bg)', color: 'var(--text-dark)', border: '1px solid var(--card-border)', borderRadius: '24px', padding: '10px 18px', fontSize: '13px', fontWeight: 600 }}>
          💰 Savings Vault
        </Link>
        <Link to="/analysis" style={{ textDecoration: 'none', background: 'var(--card-bg)', color: 'var(--text-dark)', border: '1px solid var(--card-border)', borderRadius: '24px', padding: '10px 18px', fontSize: '13px', fontWeight: 600 }}>
          🔍 Monthly Analysis
        </Link>
      </div>

      {/* ── 2-Column: Trend Chart + Category Health ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', marginBottom: '24px' }}>

        {/* 7-Day Spending Trend */}
        <div className="card-soft" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text-dark)', fontWeight: 700 }}>7-Day Spending Trend</h3>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Daily expenses over the past week</p>
            </div>
            <Link to="/transactions" style={{ fontSize: '12px', color: 'var(--coral-accent)', textDecoration: 'none', fontWeight: 600 }}>
              All →
            </Link>
          </div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <XAxis dataKey="label" stroke="#82869e" fontSize={11} tickLine={false} />
                <YAxis stroke="#82869e" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                <Tooltip formatter={(val) => [`₹${val.toLocaleString('en-IN')}`, 'Spent']} />
                <Bar dataKey="spend" radius={[8, 8, 2, 2]}>
                  {trendData.map((_, idx) => (
                    <Cell key={idx} fill={idx === trendData.length - 1 ? 'var(--coral-accent)' : '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Budget Health */}
        <div className="card-soft" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text-dark)', fontWeight: 700 }}>Category Budget Health</h3>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Monthly spend vs. allocated limits</p>
            </div>
            <Link to="/budget" style={{ fontSize: '12px', color: 'var(--coral-accent)', textDecoration: 'none', fontWeight: 600 }}>
              Adjust →
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(data.category_summary || []).filter(c => c.monthly_limit > 0).slice(0, 6).map((cat) => {
              const spent = cat.monthly_spent || 0;
              const limit = cat.monthly_limit || 0;
              const pct   = limit > 0 ? (spent / limit) * 100 : 0;
              const exc   = limit > 0 && spent > limit;
              return (
                <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-dark)', fontWeight: 600 }}>{cat.icon} {cat.name}</span>
                    <span style={{ color: exc ? '#ef4444' : 'var(--text-muted)', fontWeight: 600 }}>
                      ₹{spent.toLocaleString('en-IN')} / ₹{limit.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div style={{ height: '5px', borderRadius: '3px', background: 'var(--bg-main)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, pct)}%`,
                      height: '100%',
                      background: exc ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981',
                      borderRadius: '3px'
                    }} />
                  </div>
                </div>
              );
            })}
            {(data.category_summary || []).filter(c => c.monthly_limit > 0).length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No budgets set yet. <Link to="/budget" style={{ color: 'var(--coral-accent)' }}>Set up budgets →</Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div className="card-soft" style={{ padding: 0, overflowX: 'auto' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text-dark)', fontWeight: 700 }}>Recent Activity</h3>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Latest expenses recorded</p>
          </div>
          <Link to="/transactions" style={{ fontSize: '12px', color: 'var(--coral-accent)', textDecoration: 'none', fontWeight: 700 }}>
            View All →
          </Link>
        </div>
        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '11px 16px', textAlign: 'left' }}>Item</th>
              <th style={{ padding: '11px 16px', textAlign: 'left' }}>Category</th>
              <th style={{ padding: '11px 16px', textAlign: 'left' }}>Date</th>
              <th style={{ padding: '11px 16px', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(!data.recent_transactions || data.recent_transactions.length === 0) ? (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No transactions yet. <Link to="/transactions" style={{ color: 'var(--coral-accent)' }}>Add your first expense →</Link>
                </td>
              </tr>
            ) : (
              data.recent_transactions.slice(0, 6).map((tx) => (
                <tr key={tx.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                  <td style={{ padding: '11px 16px' }}>
                    <strong style={{ color: 'var(--text-dark)', fontSize: '13px' }}>{tx.title}</strong>
                  </td>
                  <td style={{ padding: '11px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {tx.icon} {tx.category}
                  </td>
                  <td style={{ padding: '11px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    {new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700, color: '#ef4444', fontSize: '13px' }}>
                    -₹{tx.amount.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
