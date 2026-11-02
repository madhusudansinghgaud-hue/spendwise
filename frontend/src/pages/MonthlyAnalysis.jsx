import { useState, useEffect } from 'react';
import { analysisApi, savingsApi } from '../api';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
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

// ─── History Tab ───────────────────────────────────────────────────────────────
function MonthlyHistoryTab({ availableMonths, onSelectMonth }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analysisApi.getMonthlyHistory()
      .then(r => setHistory(r.data || []))
      .catch(() => toast.error('Failed to load monthly history'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
        <p>Loading monthly history…</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
        <p>No monthly data yet. Start adding income, expenses, and investments to see history here.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Summary Header Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <div className="card-soft" style={{ padding: '16px', borderLeft: '4px solid #6366f1' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>MONTHS TRACKED</span>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#6366f1', marginTop: '4px' }}>{history.length}</div>
        </div>
        <div className="card-soft" style={{ padding: '16px', borderLeft: '4px solid #10b981' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL INCOME</span>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
            ₹{fmt(history.reduce((s, r) => s + r.income, 0))}
          </div>
        </div>
        <div className="card-soft" style={{ padding: '16px', borderLeft: '4px solid #ef4444' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL EXPENSES</span>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#ef4444', marginTop: '4px' }}>
            ₹{fmt(history.reduce((s, r) => s + r.expenses, 0))}
          </div>
        </div>
        <div className="card-soft" style={{ padding: '16px', borderLeft: '4px solid #f59e0b' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL SAVED (AUTO)</span>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
            ₹{fmt(history.reduce((s, r) => s + (r.savings_added || 0), 0))}
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="card-soft" style={{ padding: 0, overflowX: 'auto' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--card-border)' }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-dark)' }}>📅 Month-by-Month History</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
            Click any month to view detailed analysis. Previous months are read-only and immutable.
          </p>
        </div>
        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '14px 16px', textAlign: 'left' }}>Month</th>
              <th style={{ padding: '14px 16px', textAlign: 'right' }}>Income</th>
              <th style={{ padding: '14px 16px', textAlign: 'right' }}>Expenses</th>
              <th style={{ padding: '14px 16px', textAlign: 'right' }}>Invested</th>
              <th style={{ padding: '14px 16px', textAlign: 'right' }}>Remaining</th>
              <th style={{ padding: '14px 16px', textAlign: 'right' }}>Saved</th>
              <th style={{ padding: '14px 16px', textAlign: 'center' }}>Status</th>
              <th style={{ padding: '14px 16px', textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.month_year} style={{ borderBottom: '1px solid var(--card-border)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-dark)' }}>
                  {row.month_label}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                  ₹{fmt(row.income)}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>
                  ₹{fmt(row.expenses)}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6366f1', fontWeight: 600 }}>
                  ₹{fmt(row.investments)}
                </td>
                <td style={{
                  padding: '12px 16px',
                  textAlign: 'right',
                  fontWeight: 700,
                  color: row.remaining >= 0 ? '#10b981' : '#ef4444'
                }}>
                  {row.remaining >= 0 ? '' : '-'}₹{fmt(Math.abs(row.remaining))}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#f59e0b', fontWeight: 700 }}>
                  +₹{fmt(row.savings_added)}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: row.is_settled ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                    color: row.is_settled ? '#10b981' : '#f59e0b'
                  }}>
                    {row.is_settled ? '✅ Settled' : '⏳ Pending'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button
                    onClick={() => onSelectMonth(row.month_year)}
                    style={{
                      background: 'var(--bg-main)',
                      border: '1px solid var(--card-border)',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: 'var(--coral-accent)'
                    }}
                  >
                    View Report
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Analysis Report Tab ───────────────────────────────────────────────────────
function AnalysisReportTab({ selectedMonth, availableMonths, onMonthChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);

  const fetchReport = async (month) => {
    try {
      setLoading(true);
      const res = await analysisApi.getMonthly(month);
      setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load monthly analysis');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(selectedMonth);
  }, [selectedMonth]);

  const handleSettleMonth = async () => {
    if (data?.summary?.is_settled) {
      toast('This month was already settled into savings.', { icon: 'ℹ️' });
      return;
    }
    try {
      setSettling(true);
      const res = await savingsApi.settleMonth({ month_year: selectedMonth });
      if (res.data.status === 'already_settled') {
        toast(res.data.message, { icon: 'ℹ️' });
      } else {
        toast.success(res.data.message);
      }
      fetchReport(selectedMonth);
    } catch (err) {
      toast.error('Failed to settle month');
    } finally {
      setSettling(false);
    }
  };

  const copySummary = () => {
    if (data?.summary?.summary_text) {
      navigator.clipboard.writeText(data.summary.summary_text);
      toast.success('Financial summary copied to clipboard! 📋');
    }
  };

  if (loading || !data) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
        <p>Generating analysis for {selectedMonth}…</p>
      </div>
    );
  }

  const summary = data.summary || {};
  const cats = data.category_breakdown || [];
  const catChartData = cats.filter(c => c.spent > 0).map(c => ({ name: c.name, value: c.spent, color: c.color || '#6366f1' }));
  const budgetVsActual = cats.map(c => ({ name: c.name.split(' ')[0], Budget: c.budget, Actual: c.spent }));
  const fourPillars = [
    { name: 'Income',      amount: summary.income,      fill: '#10b981' },
    { name: 'Expenses',    amount: summary.expenses,    fill: '#ef4444' },
    { name: 'Investments', amount: summary.investments, fill: '#6366f1' },
    { name: 'Savings',     amount: summary.savings,     fill: '#f59e0b' },
  ];
  const invBreakdown = data.investments_breakdown || [];

  return (
    <div>
      {/* Month Selector + Actions Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--card-bg)', padding: '7px 16px', borderRadius: '24px', border: '1px solid var(--card-border)' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)' }}>Month:</span>
          <select
            value={selectedMonth}
            onChange={(e) => onMonthChange(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: 'var(--coral-accent)', fontSize: '14px', fontWeight: 700, cursor: 'pointer', outline: 'none' }}
          >
            {availableMonths.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="btn-pill-coral" onClick={copySummary}>
            📋 Copy Report
          </button>
          {!summary.is_settled && summary.remaining > 0 && (
            <button
              type="button"
              onClick={handleSettleMonth}
              disabled={settling}
              style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '24px', padding: '10px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              {settling ? 'Saving…' : `🏦 Add ₹${fmt(summary.positive_leftover)} to Savings`}
            </button>
          )}
          {summary.is_settled && (
            <span style={{ padding: '10px 16px', borderRadius: '24px', background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: '12px', fontWeight: 700 }}>
              ✅ Settled into Savings
            </span>
          )}
        </div>
      </div>

      {/* Executive Summary Box */}
      <div className="card-soft" style={{ padding: '22px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--coral-accent)', textTransform: 'uppercase', letterSpacing: '1px' }}>EXECUTIVE SUMMARY</span>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-dark)', margin: '4px 0 0' }}>
              {data.month_label} Financial Statement
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ padding: '5px 12px', borderRadius: '14px', background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: '12px', fontWeight: 700 }}>
              Savings Rate: {summary.savings_rate}%
            </span>
            {summary.over_budget_count > 0 && (
              <span style={{ padding: '5px 12px', borderRadius: '14px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '12px', fontWeight: 700 }}>
                ⚠️ {summary.over_budget_count} Over Budget
              </span>
            )}
          </div>
        </div>
        <div style={{ background: 'var(--bg-main)', border: '1px dashed var(--card-border)', borderRadius: '12px', padding: '16px 20px', fontFamily: 'monospace', fontSize: '13px', lineHeight: 1.8, color: 'var(--text-dark)', whiteSpace: 'pre-wrap' }}>
          {summary.summary_text}
        </div>
      </div>

      {/* 4 Pillar Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: '1. TOTAL INCOME',      val: summary.income,      pct: null,                                               color: '#10b981' },
          { label: '2. TOTAL EXPENSES',     val: summary.expenses,    pct: summary.income > 0 ? (summary.expenses / summary.income * 100).toFixed(1) + '% of income' : null, color: '#ef4444' },
          { label: '3. TOTAL INVESTMENTS',  val: summary.investments, pct: summary.income > 0 ? (summary.investments / summary.income * 100).toFixed(1) + '% invested' : null, color: '#6366f1' },
          { label: '4. TOTAL SAVED',        val: summary.savings,     pct: null,                                               color: '#f59e0b' },
        ].map(({ label, val, pct, color }) => (
          <div key={label} className="card-soft" style={{ padding: '18px', borderLeft: `4px solid ${color}` }}>
            <span style={{ fontSize: '11px', color, fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-dark)', marginTop: '4px' }}>₹{fmt(val)}</div>
            {pct && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{pct}</span>}
          </div>
        ))}
      </div>

      {/* Highest & Over-Budget callouts */}
      {(summary.highest_category || (data.over_budget_categories || []).length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '20px' }}>
          {summary.highest_category && (
            <div className="card-soft" style={{ padding: '16px', borderLeft: '4px solid #f59e0b', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '28px' }}>{summary.highest_category.icon}</span>
              <div>
                <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase' }}>🏆 Highest Spend Category</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)', marginTop: '2px' }}>{summary.highest_category.name}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>₹{fmt(summary.highest_category.spent)} spent ({summary.highest_category.percentage}% of expenses)</div>
              </div>
            </div>
          )}
          {(data.over_budget_categories || []).length > 0 && (
            <div className="card-soft" style={{ padding: '16px', borderLeft: '4px solid #ef4444' }}>
              <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 700, textTransform: 'uppercase' }}>⚠️ Over-Budget Categories</span>
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {data.over_budget_categories.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-dark)', fontWeight: 600 }}>{c.icon} {c.name}</span>
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>+₹{fmt(c.excess)} over</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts: Category Pie + Financial Flow Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div className="card-soft" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '15px', color: 'var(--text-dark)', fontWeight: 700 }}>🍩 Expense Distribution</h3>
          <p style={{ margin: '0 0 16px', fontSize: '11px', color: 'var(--text-muted)' }}>Share of total spend per category</p>
          {catChartData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)', fontSize: '13px' }}>No expenses recorded for this month.</div>
          ) : (
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={catChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={4}>
                    {catChartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `₹${fmt(v)}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card-soft" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '15px', color: 'var(--text-dark)', fontWeight: 700 }}>📊 Financial Flow</h3>
          <p style={{ margin: '0 0 16px', fontSize: '11px', color: 'var(--text-muted)' }}>Income vs Expenses vs Investments vs Savings</p>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fourPillars} margin={{ top: 5, right: 5, left: 5, bottom: 15 }}>
                <XAxis dataKey="name" stroke="#82869e" fontSize={11} tickLine={false} />
                <YAxis stroke="#82869e" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                <Tooltip formatter={(v) => `₹${fmt(v)}`} />
                <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                  {fourPillars.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Budget vs Actual chart */}
      {cats.length > 0 && (
        <div className="card-soft" style={{ padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '15px', color: 'var(--text-dark)', fontWeight: 700 }}>🎯 Budget vs. Actual Spend</h3>
          <p style={{ margin: '0 0 16px', fontSize: '11px', color: 'var(--text-muted)' }}>Category-wise budget allocation vs realized spend</p>
          <div style={{ width: '100%', height: 270 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={budgetVsActual} margin={{ top: 5, right: 5, left: 5, bottom: 15 }}>
                <XAxis dataKey="name" stroke="#82869e" fontSize={11} tickLine={false} />
                <YAxis stroke="#82869e" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                <Tooltip formatter={(v) => `₹${fmt(v)}`} />
                <Legend />
                <Bar dataKey="Budget" fill="#6366f1" radius={[5, 5, 0, 0]} />
                <Bar dataKey="Actual"  fill="#ff7262" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Investments Breakdown */}
      {invBreakdown.length > 0 && (
        <div className="card-soft" style={{ padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: 'var(--text-dark)', fontWeight: 700 }}>📈 Investment Breakdown</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {invBreakdown.map((inv) => (
              <div key={inv.type} className="card-soft" style={{ padding: '14px', borderLeft: '4px solid #6366f1', background: 'rgba(99,102,241,0.04)' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#6366f1' }}>{inv.type}</span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-dark)', marginTop: '4px' }}>₹{fmt(inv.amount)}</div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{inv.percentage}% of total invested</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category-Wise Details Table */}
      <div className="card-soft" style={{ padding: 0, overflowX: 'auto', marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--card-border)' }}>
          <h3 style={{ margin: 0, color: 'var(--text-dark)', fontSize: '15px', fontWeight: 700 }}>📋 Category-Wise Breakdown</h3>
        </div>
        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '13px 16px', textAlign: 'left' }}>Category</th>
              <th style={{ padding: '13px 16px', textAlign: 'right' }}>Budget</th>
              <th style={{ padding: '13px 16px', textAlign: 'right' }}>Spent</th>
              <th style={{ padding: '13px 16px', textAlign: 'right' }}>Remaining</th>
              <th style={{ padding: '13px 16px', textAlign: 'center' }}>% of Expenses</th>
              <th style={{ padding: '13px 16px', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {cats.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No expenses this month.</td></tr>
            ) : cats.map((cat) => (
              <tr key={cat.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ marginRight: '8px' }}>{cat.icon}</span>
                  <strong style={{ color: 'var(--text-dark)', fontSize: '13px' }}>{cat.name}</strong>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '13px' }}>₹{fmt(cat.budget)}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-dark)', fontSize: '13px' }}>₹{fmt(cat.spent)}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: cat.remaining >= 0 ? '#10b981' : '#ef4444', fontSize: '13px' }}>
                  {cat.remaining >= 0 ? '' : '-'}₹{fmt(Math.abs(cat.remaining))}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>{cat.percentage}%</td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
                    background: cat.exceeded ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                    color: cat.exceeded ? '#ef4444' : '#10b981'
                  }}>
                    {cat.exceeded ? `Exceeded +₹${fmt(cat.excess)}` : 'Safe'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Month-over-Month Comparison */}
      {data.comparison && (
        <div className="card-soft" style={{ padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: 'var(--text-dark)', fontWeight: 700 }}>
            🔄 vs. Previous Month ({data.comparison.prev_month})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            {[
              { label: 'Income Change',     val: data.comparison.income_delta,     positive: true  },
              { label: 'Expense Change',    val: data.comparison.expense_delta,    positive: false },
              { label: 'Investment Change', val: data.comparison.investment_delta, positive: true  },
              { label: 'Remaining Change',  val: data.comparison.remaining_delta,  positive: true  },
            ].map(({ label, val, positive }) => {
              const isGood = positive ? val >= 0 : val <= 0;
              const color  = val === 0 ? 'var(--text-muted)' : (isGood ? '#10b981' : '#ef4444');
              return (
                <div key={label} className="card-soft" style={{ padding: '14px', borderLeft: `4px solid ${color}` }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{label.toUpperCase()}</span>
                  <div style={{ fontSize: '18px', fontWeight: 800, color, marginTop: '4px' }}>
                    {val >= 0 ? '+' : '-'}₹{fmt(Math.abs(val))}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>vs prev month</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function MonthlyAnalysis() {
  const [activeTab, setActiveTab] = useState('report'); // 'report' | 'history'
  const [availableMonths, setAvailableMonths] = useState([]);

  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  useEffect(() => {
    analysisApi.getMonths()
      .then(r => { if (r.data?.length) setAvailableMonths(r.data); })
      .catch(console.error);
  }, []);

  const handleHistoryMonthSelect = (month) => {
    setSelectedMonth(month);
    setActiveTab('report');
  };

  const tabs = [
    { id: 'report',  label: '📈 Monthly Report'  },
    { id: 'history', label: '📅 Monthly History' },
  ];

  return (
    <div className="page-container">
      {/* Page Header */}
      <div style={{ marginBottom: '20px' }}>
        <span style={{ fontSize: '12px', color: 'var(--coral-accent)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          ANALYTICS
        </span>
        <h1 className="page-title" style={{ margin: '4px 0 6px' }}>Monthly Financial Analysis</h1>
        <p className="page-subtitle">
          Detailed monthly reports, investment breakdowns, savings tracking, and month-over-month comparisons
        </p>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: '4px', background: 'var(--card-bg)', padding: '4px', borderRadius: '16px', border: '1px solid var(--card-border)', marginBottom: '24px', width: 'fit-content' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: activeTab === tab.id ? 'var(--coral-accent)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : 'var(--text-muted)',
              border: 'none',
              borderRadius: '12px',
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'report' && (
        <AnalysisReportTab
          selectedMonth={selectedMonth}
          availableMonths={availableMonths}
          onMonthChange={setSelectedMonth}
        />
      )}
      {activeTab === 'history' && (
        <MonthlyHistoryTab
          availableMonths={availableMonths}
          onSelectMonth={handleHistoryMonthSelect}
        />
      )}
    </div>
  );
}
