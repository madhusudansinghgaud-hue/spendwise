import { useState, useEffect, useCallback } from 'react';
import { expensesApi, categoriesApi } from '../api';
import QuotaAlert from '../components/QuotaAlert';
import { dashboardApi } from '../api';
import toast from 'react-hot-toast';

function AddExpenseModal({ categories, onClose, onSave }) {
  const [form, setForm] = useState({
    amount: '',
    description: '',
    merchant: '',
    category_id: categories[0]?.id || '',
    notes: '',
    source: 'manual'
  });
  const [smsText, setSmsText] = useState('');
  const [smsTab, setSmsTab] = useState('manual');
  const [parsedSms, setParsedSms] = useState(null);

  const parseSms = async () => {
    if (!smsText.trim()) return;
    try {
      const res = await expensesApi.parseSms(smsText);
      const d = res.data;
      setParsedSms(d);
      setForm(p => ({
        ...p,
        amount: d.amount || '',
        merchant: d.merchant || '',
        category_id: d.suggested_category?.id || p.category_id,
        source: 'sms'
      }));
      toast.success(`Parsed: ₹${d.amount} from ${d.merchant || 'Unknown'}`);
    } catch (e) {
      toast.error('Could not parse SMS. Try manual entry.');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.amount || !form.category_id) return toast.error('Amount and category are required');
    onSave({ ...form, amount: parseFloat(form.amount) });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">💸 Add Expense</div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {[
            { key: 'manual', label: '✏️ Manual' },
            { key: 'sms', label: '📱 From SMS' }
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSmsTab(t.key)}
              className="btn"
              style={{
                flex: 1,
                background: smsTab === t.key ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                color: smsTab === t.key ? 'var(--accent-light)' : 'var(--text-secondary)',
                border: `1px solid ${smsTab === t.key ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {smsTab === 'sms' && (
          <div className="form-group">
            <label className="form-label">Paste UPI SMS</label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="INR 150.00 debited from A/c XX1234 to Sharma Medical on 07-Oct..."
              value={smsText}
              onChange={e => setSmsText(e.target.value)}
              style={{ resize: 'vertical' }}
            />
            <button type="button" className="btn btn-primary" style={{ marginTop: '8px', width: '100%' }} onClick={parseSms}>
              🔍 Parse SMS
            </button>
            {parsedSms && (
              <div style={{
                marginTop: '10px',
                padding: '10px 14px',
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: '8px',
                fontSize: '13px',
                color: 'var(--success)'
              }}>
                ✅ Parsed: ₹{parsedSms.amount} · {parsedSms.merchant || 'Unknown merchant'}
                {parsedSms.suggested_category && ` · Suggested: ${parsedSms.suggested_category.icon} ${parsedSms.suggested_category.name}`}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Amount (₹)</label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                className="form-input"
                value={form.category_id}
                onChange={e => setForm(p => ({ ...p, category_id: parseInt(e.target.value) }))}
                required
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <input
              className="form-input"
              placeholder="What did you buy?"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Merchant / Shop</label>
            <input
              className="form-input"
              placeholder="e.g. Big Bazaar, Sharma Pan Shop..."
              value={form.merchant}
              onChange={e => setForm(p => ({ ...p, merchant: e.target.value }))}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              Add Expense 💸
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [quotaAlert, setQuotaAlert] = useState(null);
  const [alertSuggestions, setAlertSuggestions] = useState([]);
  const [filter, setFilter] = useState({ category_id: '', limit: 50 });

  useEffect(() => {
    fetchData();
  }, [filter]);

  const fetchData = async () => {
    try {
      const [expRes, catRes] = await Promise.all([
        expensesApi.getAll(filter.category_id ? { category_id: filter.category_id, limit: filter.limit } : { limit: filter.limit }),
        categoriesApi.getAll()
      ]);
      setExpenses(expRes.data);
      setCategories(catRes.data);
    } catch (e) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (form) => {
    try {
      const res = await expensesApi.create(form);
      toast.success('Expense added! 💸');
      setShowModal(false);

      if (res.data.alert) {
        // Fetch suggestions for the alert
        try {
          const dashRes = await dashboardApi.getSummary();
          setAlertSuggestions(dashRes.data.suggestions || []);
        } catch (_) {}
        setQuotaAlert(res.data.alert);
      }

      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to add expense');
    }
  };

  const handleDelete = async (id) => {
    try {
      await expensesApi.delete(id);
      toast.success('Expense deleted');
      fetchData();
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  const [search, setSearch] = useState('');

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const avgExpense = expenses.length > 0 ? totalAmount / expenses.length : 0;

  const filteredExpenses = expenses.filter(e => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.description?.toLowerCase().includes(q) ||
      e.merchant?.toLowerCase().includes(q) ||
      e.category_name?.toLowerCase().includes(q)
    );
  });

  if (loading) return <div className="loading-container"><div className="spinner" /><p style={{ color: 'var(--text-muted)' }}>Loading expenses...</p></div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div className="page-title">Expenses 💸</div>
            <div className="page-subtitle">
              Track and review all transactions and UPI payments
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            ➕ Add Expense
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card">
          <div className="stat-label">Total Outflow</div>
          <div className="stat-value" style={{ color: 'var(--coral-accent)' }}>₹{totalAmount.toFixed(0)}</div>
          <div className="stat-sub">{expenses.length} recorded payments</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Average Spend</div>
          <div className="stat-value">₹{avgExpense.toFixed(0)}</div>
          <div className="stat-sub">per transaction</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Categories Used</div>
          <div className="stat-value">{new Set(expenses.map(e => e.category_name)).size}</div>
          <div className="stat-sub">active categories</div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          type="text"
          className="form-input"
          placeholder="🔍 Search merchant, title..."
          style={{ flex: 1, minWidth: '180px' }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-input"
          style={{ width: 'auto', minWidth: '160px' }}
          value={filter.category_id}
          onChange={e => setFilter(p => ({ ...p, category_id: e.target.value }))}
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
        <select
          className="form-input"
          style={{ width: 'auto', minWidth: '120px' }}
          value={filter.limit}
          onChange={e => setFilter(p => ({ ...p, limit: parseInt(e.target.value) }))}
        >
          <option value={20}>Last 20</option>
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
        </select>
      </div>

      {/* Expense List */}
      {filteredExpenses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-emoji">💸</div>
          <div className="empty-state-text">No transactions found matching your filter.</div>
          <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => setShowModal(true)}>
            Record First Expense ➕
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: '16px' }}>
          <div className="expense-list">
            {filteredExpenses.map(exp => (
              <div key={exp.id} className="expense-item">
                <div className="expense-left">
                  <div
                    className="expense-icon"
                    style={{ background: `${exp.category_color}25`, border: `1px solid ${exp.category_color}40` }}
                  >
                    {exp.category_icon || '💳'}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="expense-desc">
                      {exp.description || exp.merchant || exp.category_name}
                    </div>
                    <div className="expense-meta">
                      <span className="badge" style={{ background: `${exp.category_color}20`, color: exp.category_color }}>
                        {exp.category_name}
                      </span>
                      {exp.merchant && <span style={{ color: 'var(--text-dark)', fontWeight: 500 }}>· {exp.merchant}</span>}
                      <span>
                        · {new Date(exp.date).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                      {exp.source !== 'manual' && (
                        <span className="badge badge-accent">
                          {exp.source === 'sms' ? '📱 SMS' : '📂 CSV'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                  <div className="expense-amount">-₹{exp.amount.toFixed(0)}</div>
                  <button
                    className="btn-icon"
                    style={{ color: 'var(--danger)' }}
                    title="Delete expense"
                    onClick={() => handleDelete(exp.id)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <AddExpenseModal
          categories={categories}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}

      {quotaAlert && (
        <QuotaAlert
          alert={quotaAlert}
          suggestions={alertSuggestions}
          onClose={() => setQuotaAlert(null)}
          onRefresh={fetchData}
        />
      )}

    </div>
  );
}
