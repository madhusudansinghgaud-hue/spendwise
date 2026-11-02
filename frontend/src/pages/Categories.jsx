import { useState, useEffect } from 'react';
import { categoriesApi } from '../api';
import toast from 'react-hot-toast';

const EMOJIS = ['💰','🛒','🚬','☕','🚗','🍔','🎮','💊','📱','🏠','👕','✈️','🎵','📚','🏋️','🍕','🍺','💻','🎁','🐕','⚡','🛵','🍜','🥤','🎯','💈','🪥','🛁'];
const COLORS = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f59e0b','#10b981','#3b82f6','#06b6d4','#84cc16','#f97316','#a855f7','#14b8a6'];

function CategoryModal({ category, onClose, onSave }) {
  const [form, setForm] = useState({
    name: category?.name || '',
    icon: category?.icon || '💰',
    color: category?.color || '#6366f1',
    daily_limit: category?.daily_limit || '',
    monthly_limit: category?.monthly_limit || '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Category name is required');
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{category ? '✏️ Edit Category' : '➕ New Category'}</div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Category Name</label>
            <input
              className="form-input"
              placeholder="e.g. Cigarettes, Groceries..."
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Choose Icon</label>
            <div className="emoji-grid">
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  className={`emoji-btn ${form.icon === emoji ? 'selected' : ''}`}
                  onClick={() => setForm(p => ({ ...p, icon: emoji }))}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Color</label>
            <div className="color-grid">
              {COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`color-btn ${form.color === color ? 'selected' : ''}`}
                  style={{ background: color }}
                  onClick={() => setForm(p => ({ ...p, color }))}
                />
              ))}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Daily Limit (₹)</label>
              <input
                className="form-input"
                type="number"
                placeholder="e.g. 150"
                value={form.daily_limit}
                onChange={e => setForm(p => ({ ...p, daily_limit: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Monthly Limit (₹)</label>
              <input
                className="form-input"
                type="number"
                placeholder="e.g. 3000"
                value={form.monthly_limit}
                onChange={e => setForm(p => ({ ...p, monthly_limit: e.target.value }))}
              />
            </div>
          </div>

          {/* Preview */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '10px',
            marginBottom: '20px',
            border: '1px solid var(--border)'
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: `${form.color}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px'
            }}>{form.icon}</div>
            <div>
              <div style={{ fontWeight: 600 }}>{form.name || 'Category Name'}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {form.daily_limit ? `₹${form.daily_limit}/day` : 'No daily limit'}
                {form.monthly_limit ? ` · ₹${form.monthly_limit}/month` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              {category ? 'Update' : 'Create'} Category
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCat, setEditingCat] = useState(null);

  useEffect(() => { fetchCategories(); }, []);

  const fetchCategories = async () => {
    try {
      const res = await categoriesApi.getAll();
      setCategories(res.data);
    } catch (e) {
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (form) => {
    try {
      const payload = {
        ...form,
        daily_limit: parseFloat(form.daily_limit) || 0,
        monthly_limit: parseFloat(form.monthly_limit) || 0
      };
      if (editingCat) {
        await categoriesApi.update(editingCat.id, payload);
        toast.success('Category updated! ✅');
      } else {
        await categoriesApi.create(payload);
        toast.success('Category created! 🎉');
      }
      setShowModal(false);
      setEditingCat(null);
      fetchCategories();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Something went wrong');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this category? All expenses in it will also be deleted.')) return;
    try {
      await categoriesApi.delete(id);
      toast.success('Category deleted');
      fetchCategories();
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  const totalDailyLimit = categories.reduce((sum, c) => sum + (c.daily_limit || 0), 0);
  const totalDailySpent = categories.reduce((sum, c) => sum + (c.daily_spent || 0), 0);
  const exceededCount = categories.filter(c => c.daily_exceeded).length;

  if (loading) return <div className="loading-container"><div className="spinner" /><p style={{ color: 'var(--text-muted)' }}>Loading categories...</p></div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div className="page-title">Categories 🗂️</div>
            <div className="page-subtitle">Manage your spending categories, icons & daily quotas</div>
          </div>
          <button className="btn btn-primary" onClick={() => { setEditingCat(null); setShowModal(true); }}>
            ➕ New Category
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-label">Total Categories</div>
          <div className="stat-value">{categories.length}</div>
          <div className="stat-sub">configured spending buckets</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Daily Quota Budget</div>
          <div className="stat-value">₹{totalDailyLimit.toFixed(0)}</div>
          <div className="stat-sub">Spent today: ₹{totalDailySpent.toFixed(0)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Exceeded Limits Today</div>
          <div className="stat-value" style={{ color: exceededCount > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {exceededCount > 0 ? `🚨 ${exceededCount} Over Limit` : '✅ All Within Limits'}
          </div>
          <div className="stat-sub">{exceededCount > 0 ? 'Needs rebalancing' : 'Healthy spending'}</div>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-emoji">🗂️</div>
          <div className="empty-state-text">No categories yet. Create your first one!</div>
          <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => { setEditingCat(null); setShowModal(true); }}>
            ➕ Create First Category
          </button>
        </div>
      ) : (
        <div className="category-grid">
          {categories.map(cat => {
            const dailyPct = cat.daily_limit > 0 ? (cat.daily_spent / cat.daily_limit) * 100 : 0;
            const monthPct = cat.monthly_limit > 0 ? (cat.monthly_spent / cat.monthly_limit) * 100 : 0;
            const fillClass = (pct) => pct >= 100 ? 'danger' : pct >= 75 ? 'warning' : 'safe';

            return (
              <div key={cat.id} className={`category-card ${cat.daily_exceeded ? 'exceeded' : ''}`}>
                <div className="category-header">
                  <div className="category-info">
                    <div className="category-icon-wrapper" style={{ background: `${cat.color}22` }}>
                      {cat.icon}
                    </div>
                    <div>
                      <div className="category-name">{cat.name}</div>
                      <div className="category-limit">
                        {cat.daily_limit > 0 ? `₹${cat.daily_limit}/day` : 'No daily limit'}
                      </div>
                    </div>
                  </div>
                  <div className="category-actions">
                    <button className="btn-icon" onClick={() => { setEditingCat(cat); setShowModal(true); }}>✏️</button>
                    <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(cat.id)}>🗑️</button>
                  </div>
                </div>

                {cat.daily_limit > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div className="progress-bar-label">
                      <span>Today: ₹{cat.daily_spent.toFixed(0)}</span>
                      <span style={{ color: dailyPct >= 100 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {dailyPct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div className={`progress-fill ${fillClass(dailyPct)}`} style={{ width: `${Math.min(dailyPct, 100)}%` }} />
                    </div>
                  </div>
                )}

                {cat.monthly_limit > 0 && (
                  <div>
                    <div className="progress-bar-label">
                      <span>Month: ₹{cat.monthly_spent.toFixed(0)}</span>
                      <span style={{ color: monthPct >= 100 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {monthPct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div className={`progress-fill ${fillClass(monthPct)}`} style={{ width: `${Math.min(monthPct, 100)}%` }} />
                    </div>
                  </div>
                )}

                {cat.daily_exceeded && (
                  <div style={{
                    marginTop: '12px',
                    padding: '8px 12px',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'var(--danger)',
                    fontWeight: 600
                  }}>
                    🚨 Daily limit exceeded by ₹{(cat.daily_spent - cat.daily_limit).toFixed(0)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <CategoryModal
          category={editingCat}
          onClose={() => { setShowModal(false); setEditingCat(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
