import { useState, useEffect } from 'react';
import { expensesApi, categoriesApi } from '../api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '12px 16px', fontSize: '13px'
      }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
        <div style={{ fontWeight: 700, color: 'var(--accent-light)' }}>₹{payload[0].value?.toFixed(0)}</div>
      </div>
    );
  }
  return null;
};

export default function Analytics() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [expRes, catRes] = await Promise.all([
        expensesApi.getAll({ limit: 500 }),
        categoriesApi.getAll()
      ]);
      setExpenses(expRes.data);
      setCategories(catRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  // Category totals
  const catTotals = categories.map(cat => ({
    name: cat.name,
    icon: cat.icon,
    color: cat.color,
    total: expenses.filter(e => e.category_id === cat.id).reduce((s, e) => s + e.amount, 0)
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  // Daily spending (last 30 days)
  const dailyMap = {};
  expenses.forEach(e => {
    const d = new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    dailyMap[d] = (dailyMap[d] || 0) + e.amount;
  });
  const dailyData = Object.entries(dailyMap).slice(-14).map(([date, amount]) => ({ date, amount }));

  // Total
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const avgPerDay = dailyData.length > 0 ? totalSpent / dailyData.length : 0;
  const highestDay = dailyData.reduce((max, d) => d.amount > max ? d.amount : max, 0);

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Analytics 🔍</div>
        <div className="page-subtitle">Deep dive into your spending patterns</div>
      </div>

      {/* Summary Stats */}
      <div className="stats-grid" style={{ marginBottom: '28px' }}>
        {[
          { label: 'Total Tracked', value: `₹${totalSpent.toFixed(0)}`, sub: `${expenses.length} transactions`, color: 'var(--accent-light)' },
          { label: 'Daily Average', value: `₹${avgPerDay.toFixed(0)}`, sub: 'per day', color: 'var(--success)' },
          { label: 'Highest Day', value: `₹${highestDay.toFixed(0)}`, sub: 'single day spend', color: 'var(--warning)' },
          { label: 'Categories', value: catTotals.length, sub: 'active categories', color: 'var(--accent-light)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {expenses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-emoji">🔍</div>
          <div className="empty-state-text">Add some expenses to see analytics!</div>
        </div>
      ) : (
        <>
          {/* Charts Row */}
          <div className="grid-2" style={{ marginBottom: '24px' }}>
            {/* Category Bar */}
            <div className="card card-glow">
              <div className="section-title" style={{ marginBottom: '20px' }}>Spending by Category</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={catTotals} layout="vertical">
                  <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                    {catTotals.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie */}
            <div className="card card-glow">
              <div className="section-title" style={{ marginBottom: '20px' }}>Category Distribution</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <PieChart width={160} height={160}>
                  <Pie data={catTotals} cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={3} dataKey="total">
                    {catTotals.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
                <div style={{ flex: 1 }}>
                  {catTotals.map((c, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.color }} />
                        <span style={{ fontSize: '13px', color: 'var(--text-dark)' }}>{c.icon} {c.name}</span>
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)' }}>₹{c.total.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Daily Trend */}
          <div className="card card-glow" style={{ marginBottom: '24px' }}>
            <div className="section-title" style={{ marginBottom: '20px' }}>Daily Spending Trend</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData}>
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="amount" stroke="var(--coral-accent)" strokeWidth={2.5} dot={{ fill: 'var(--coral-accent)', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Top Expenses Table */}
          <div className="card">
            <div className="section-title" style={{ marginBottom: '16px' }}>Top Expenses</div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Merchant</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {[...expenses].sort((a, b) => b.amount - a.amount).slice(0, 10).map(exp => (
                    <tr key={exp.id}>
                      <td>
                        <span style={{ marginRight: '6px' }}>{exp.category_icon}</span>
                        {exp.category_name}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{exp.description || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{exp.merchant || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>
                        ₹{exp.amount.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
