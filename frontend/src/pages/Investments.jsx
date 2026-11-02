import { useState, useEffect } from 'react';
import { investmentsApi } from '../api';
import toast from 'react-hot-toast';

const INVESTMENT_TYPES = ['SIP', 'FD', 'RD', 'Stocks', 'Mutual Funds', 'PPF', 'NPS', 'Gold', 'Crypto', 'Real Estate', 'Savings'];

function InvestmentModal({ plan, onClose, onSave }) {
  const [form, setForm] = useState({
    name: plan?.name || 'My Investment Plan',
    monthly_salary: plan?.monthly_salary || '',
    investment_target: plan?.investment_target || '',
    investment_type: plan?.investment_type || 'SIP',
    notes: plan?.notes || ''
  });

  const spending_budget = (parseFloat(form.monthly_salary) || 0) - (parseFloat(form.investment_target) || 0);
  const savings_rate = form.monthly_salary > 0
    ? ((parseFloat(form.investment_target) || 0) / parseFloat(form.monthly_salary) * 100).toFixed(1)
    : 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.monthly_salary || !form.investment_target) return toast.error('All fields required');
    if (parseFloat(form.investment_target) >= parseFloat(form.monthly_salary)) {
      return toast.error('Investment cannot exceed salary!');
    }
    onSave({
      ...form,
      monthly_salary: parseFloat(form.monthly_salary),
      investment_target: parseFloat(form.investment_target)
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">📈 {plan ? 'Edit' : 'Set Up'} Investment Plan</div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Plan Name</label>
            <input
              className="form-input"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Monthly Salary (₹)</label>
              <input
                className="form-input"
                type="number"
                placeholder="e.g. 50000"
                value={form.monthly_salary}
                onChange={e => setForm(p => ({ ...p, monthly_salary: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Investment Target (₹)</label>
              <input
                className="form-input"
                type="number"
                placeholder="e.g. 10000"
                value={form.investment_target}
                onChange={e => setForm(p => ({ ...p, investment_target: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Investment Type</label>
            <select
              className="form-input"
              value={form.investment_type}
              onChange={e => setForm(p => ({ ...p, investment_type: e.target.value }))}
            >
              {INVESTMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <input
              className="form-input"
              placeholder="e.g. SIP via Groww app..."
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            />
          </div>

          {/* Live Preview */}
          {form.monthly_salary && form.investment_target && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.05))',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Preview</div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-light)' }}>₹{form.investment_target}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>💰 Invest</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--success)' }}>₹{spending_budget.toFixed(0)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>🛒 Spend</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--warning)' }}>{savings_rate}%</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>📊 Save Rate</div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              {plan ? 'Update' : 'Activate'} Plan 🚀
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Investments() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { fetchPlan(); }, []);

  const fetchPlan = async () => {
    try {
      const res = await investmentsApi.getActive();
      setPlan(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (form) => {
    try {
      await investmentsApi.create(form);
      toast.success('Investment plan activated! 🚀');
      setShowModal(false);
      fetchPlan();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save plan');
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const spendBudget = plan ? plan.spending_budget : 0;
  const investPct = plan ? plan.savings_rate : 0;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Investments 📈</div>
            <div className="page-subtitle">Plan your savings and investment goals</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            {plan ? '✏️ Edit Plan' : '➕ Set Up Plan'}
          </button>
        </div>
      </div>

      {!plan ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 40px' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>📈</div>
          <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>No Investment Plan Yet</div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Set up your salary and investment goal to get started
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            🚀 Create Investment Plan
          </button>
        </div>
      ) : (
        <>
          {/* Main Plan Card */}
          <div style={{ marginBottom: '24px' }}>
            <div className="card" style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.08))',
              borderColor: 'rgba(99,102,241,0.2)',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '4px' }}>Active Plan</div>
                  <div style={{ fontSize: '24px', fontWeight: 700 }}>{plan.name}</div>
                  <span className="badge badge-accent" style={{ marginTop: '6px' }}>{plan.investment_type}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Savings Rate</div>
                  <div style={{ fontSize: '40px', fontWeight: 800, color: 'var(--accent-light)' }}>
                    {plan.savings_rate.toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Budget Breakdown */}
              <div style={{ display: 'flex', gap: '16px' }}>
                {[
                  { label: '💼 Salary', value: plan.monthly_salary, color: 'var(--text-primary)' },
                  { label: '📈 Invest', value: plan.investment_target, color: 'var(--accent-light)' },
                  { label: '🛒 Spend Budget', value: spendBudget, color: 'var(--success)' },
                ].map(item => (
                  <div key={item.label} style={{
                    flex: 1,
                    padding: '16px',
                    background: 'var(--navy-soft)',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>{item.label}</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: item.color, fontFamily: 'Space Grotesk' }}>
                      ₹{item.value.toFixed(0)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Investment bar */}
              <div style={{ marginTop: '20px' }}>
                <div className="progress-bar-label">
                  <span>Investment allocation</span>
                  <span>{investPct.toFixed(1)}% of salary</span>
                </div>
                <div className="progress-bar" style={{ height: '10px' }}>
                  <div
                    className="progress-fill safe"
                    style={{ width: `${investPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Tips */}
            <div className="grid-2">
              {[
                {
                  icon: '🎯',
                  title: '50/30/20 Rule',
                  body: `Your plan: ${(100 - investPct).toFixed(0)}% spending, ${investPct.toFixed(0)}% investing. Ideal: 50% needs, 30% wants, 20% savings.`,
                  color: 'rgba(99,102,241,0.08)'
                },
                {
                  icon: '📅',
                  title: 'Annual Projection',
                  body: `If you invest ₹${plan.investment_target.toFixed(0)}/month, you'll save ₹${(plan.investment_target * 12).toFixed(0)} per year!`,
                  color: 'rgba(16,185,129,0.08)'
                },
                {
                  icon: '💡',
                  title: 'Smart Tip',
                  body: 'Set up an auto-debit for your SIP on salary day so you pay yourself first before spending.',
                  color: 'rgba(245,158,11,0.08)'
                },
                {
                  icon: '📊',
                  title: '10-Year Goal',
                  body: `At 12% annual returns, ₹${plan.investment_target}/month could grow to ₹${(plan.investment_target * 12 * ((Math.pow(1.01, 120) - 1) / 0.01)).toFixed(0)} in 10 years!`,
                  color: 'rgba(168,85,247,0.08)'
                },
              ].map(tip => (
                <div key={tip.title} className="card" style={{ background: tip.color, borderColor: 'var(--border)' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>{tip.icon}</div>
                  <div style={{ fontWeight: 600, marginBottom: '6px' }}>{tip.title}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{tip.body}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {showModal && (
        <InvestmentModal
          plan={plan}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
