import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { AVATAR_OPTIONS } from '../constants';
import { authApi } from '../api';
import toast from 'react-hot-toast';

// Suggested categories explicitly listed in prompt requirements
const SUGGESTED_CATEGORIES = [
  { id: 'groceries', name: 'Groceries', icon: '🛒', color: '#10b981', is_essential: true, priority: 1, enabled: true },
  { id: 'food_dining', name: 'Food and Dining', icon: '🍔', color: '#ef4444', is_essential: false, priority: 6, enabled: true },
  { id: 'fuel_transport', name: 'Fuel and Transportation', icon: '🚗', color: '#3b82f6', is_essential: true, priority: 1, enabled: true },
  { id: 'rent_utilities', name: 'Rent and Utilities', icon: '🏠', color: '#6366f1', is_essential: true, priority: 1, enabled: false },
  { id: 'mobile_internet', name: 'Mobile and Internet', icon: '📱', color: '#06b6d4', is_essential: true, priority: 2, enabled: true },
  { id: 'personal_care', name: 'Personal Care', icon: '💈', color: '#8b5cf6', is_essential: false, priority: 6, enabled: true },
  { id: 'entertainment', name: 'Entertainment', icon: '🎮', color: '#ec4899', is_essential: false, priority: 6, enabled: false },
  { id: 'healthcare', name: 'Healthcare', icon: '💊', color: '#14b8a6', is_essential: true, priority: 1, enabled: false },
  { id: 'education', name: 'Education', icon: '📚', color: '#f59e0b', is_essential: true, priority: 1, enabled: false },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#e11d48', is_essential: false, priority: 6, enabled: false },
  { id: 'emergency_buffer', name: 'Emergency Buffer', icon: '🛡️', color: '#10b981', is_essential: true, priority: 3, enabled: true },
  { id: 'investments', name: 'Investments', icon: '📈', color: '#6366f1', is_essential: false, priority: 4, enabled: true },
  { id: 'savings', name: 'Savings', icon: '💰', color: '#0ea5e9', is_essential: false, priority: 5, enabled: true },
  { id: 'other_expenses', name: 'Other Expenses', icon: '📦', color: '#64748b', is_essential: false, priority: 6, enabled: false }
];

const CUSTOM_EMOJIS = ['🏋️', '🐶', '🍿', '✈️', '🎵', '💻', '🎁', '⚡', '🚴‍♂️', '💇‍♂️', '🍼', '🌿', '☕'];
const CUSTOM_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#0ea5e9'];

// Client-side simulation of the Budget Allocation Engine to provide real-time Step 3 preview
function computeClientAllocation(income, categories) {
  const available = Math.max(0, income);
  if (available <= 0) return { allocations: [], total: 0, reserve: 0 };

  const enabled = categories.filter(c => c.enabled);
  if (enabled.length === 0) return { allocations: [], total: 0, reserve: available };

  // Baseline weights
  const weights = {
    'rent': 0.35,
    'grocer': 0.25,
    'fuel': 0.10,
    'transport': 0.10,
    'utilit': 0.08,
    'mobile': 0.05,
    'internet': 0.05,
    'health': 0.08,
    'educat': 0.10,
    'personal': 0.07,
    'dining': 0.08,
    'food': 0.10,
    'shopping': 0.06,
    'entertain': 0.05,
    'buffer': 0.10,
    'emergency': 0.10,
    'invest': 0.10,
    'saving': 0.10
  };

  const getWeight = (name) => {
    const lname = name.toLowerCase();
    for (const [k, w] of Object.entries(weights)) {
      if (lname.includes(k)) return w;
    }
    return 0.06;
  };

  // Determine dedicated goals vs categories
  const hasBuffer = enabled.some(c => c.name.toLowerCase().includes('buffer') || c.name.toLowerCase().includes('emergency'));
  const hasInvest = enabled.some(c => c.name.toLowerCase().includes('invest'));
  const hasSavings = enabled.some(c => c.name.toLowerCase().includes('saving'));

  // Separate regular categories vs goals
  const regularCats = enabled.filter(c => {
    const n = c.name.toLowerCase();
    return !n.includes('buffer') && !n.includes('emergency') && !n.includes('invest') && !n.includes('saving');
  });

  // Target spending pool = 60-70% of available income
  const reserveGoal = Math.round(available * 0.15); // 15% reserve
  const goalPool = Math.round(available * 0.25); // 25% for buffer/invest/savings
  const spendingPool = Math.max(0, available - goalPool - reserveGoal);

  const totalCatWeight = regularCats.reduce((sum, c) => sum + getWeight(c.name), 0) || 1.0;

  const result = [];
  let allocatedSum = 0;

  // Allocate regular categories
  for (const c of regularCats) {
    const ratio = getWeight(c.name) / totalCatWeight;
    const amount = Math.max(50, Math.round(spendingPool * ratio));
    result.push({
      ...c,
      monthly_allocation: amount,
      daily_limit: Math.round((amount / 30) * 10) / 10
    });
    allocatedSum += amount;
  }

  // Allocate goals if selected
  const activeGoalsCount = (hasBuffer ? 1 : 0) + (hasInvest ? 1 : 0) + (hasSavings ? 1 : 0);
  const perGoal = activeGoalsCount > 0 ? Math.round(goalPool / activeGoalsCount) : 0;

  for (const c of enabled) {
    const n = c.name.toLowerCase();
    if (n.includes('buffer') || n.includes('emergency') || n.includes('invest') || n.includes('saving')) {
      const amount = Math.max(100, perGoal);
      result.push({
        ...c,
        monthly_allocation: amount,
        daily_limit: Math.round((amount / 30) * 10) / 10
      });
      allocatedSum += amount;
    }
  }

  // Ensure constraint: allocatedSum <= available
  if (allocatedSum > available) {
    const scale = available / allocatedSum;
    for (const item of result) {
      item.monthly_allocation = Math.round(item.monthly_allocation * scale);
      item.daily_limit = Math.round((item.monthly_allocation / 30) * 10) / 10;
    }
    allocatedSum = result.reduce((s, i) => s + i.monthly_allocation, 0);
  }

  const unallocatedReserve = Math.max(0, available - allocatedSum);

  return {
    allocations: result,
    total: allocatedSum,
    reserve: unallocatedReserve
  };
}

export default function AuthOnboarding() {
  const { onboardUser, loginUser, theme, toggleTheme } = useAuth();

  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'login'
  const [step, setStep] = useState(1); // 1: Income & Profile -> 2: Select Categories -> 3: Generated Budget Preview

  // Step 1: Income & Profile
  const [monthlyIncome, setMonthlyIncome] = useState(10000);
  const [otherIncome, setOtherIncome] = useState(0);
  const [existingObligations, setExistingObligations] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [avatar, setAvatar] = useState('👨‍💻');
  const [username, setUsername] = useState('');

  // Step 2: Categories selection
  const [categories, setCategories] = useState(SUGGESTED_CATEGORIES);
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingName, setEditingName] = useState('');
  
  // Custom category creation
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customIcon, setCustomIcon] = useState('🏋️');
  const [customColor, setCustomColor] = useState('#6366f1');
  const [customEssential, setCustomEssential] = useState(true);

  // Step 3: Generated Budget
  const [generatedBudget, setGeneratedBudget] = useState({ allocations: [], total: 0, reserve: 0 });
  const [submitting, setSubmitting] = useState(false);

  // Quick login state
  const [existingUsers, setExistingUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loginInput, setLoginInput] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await authApi.getUsers();
      setExistingUsers(res.data || []);
    } catch (_) {}
    finally {
      setLoadingUsers(false);
    }
  };

  // Recalculate client preview whenever income or categories change
  useEffect(() => {
    const effectiveIncome = Math.max(0, (parseFloat(monthlyIncome) || 0) + (parseFloat(otherIncome) || 0) - (parseFloat(existingObligations) || 0));
    const res = computeClientAllocation(effectiveIncome, categories);
    setGeneratedBudget(res);
  }, [monthlyIncome, otherIncome, existingObligations, categories]);

  // Step 1 -> Step 2
  const handleProceedToStep2 = (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error('Please enter your name');
      return;
    }
    const num = parseFloat(monthlyIncome);
    if (isNaN(num) || num <= 0) {
      toast.error('Please enter a valid monthly income');
      return;
    }
    const cleanUsername = (username.trim() || displayName.trim().toLowerCase().replace(/\s+/g, '_')).replace(/[^a-z0-9_]/g, '');
    setUsername(cleanUsername);
    setStep(2);
  };

  // Step 2 category manipulation
  const handleToggleCategory = (id) => {
    setCategories(categories.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  };

  const handleTogglePriority = (id) => {
    setCategories(categories.map(c => {
      if (c.id === id) {
        const nextEssential = !c.is_essential;
        return {
          ...c,
          is_essential: nextEssential,
          priority: nextEssential ? 1 : 6
        };
      }
      return c;
    }));
  };

  const handleRemoveCategory = (id) => {
    setCategories(categories.filter(c => c.id !== id));
    toast.success('Category removed');
  };

  const handleStartRename = (cat) => {
    setEditingCatId(cat.id);
    setEditingName(cat.name);
  };

  const handleSaveRename = (id) => {
    if (!editingName.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    setCategories(categories.map(c => c.id === id ? { ...c, name: editingName.trim() } : c));
    setEditingCatId(null);
    toast.success('Category renamed');
  };

  const handleAddCustomCategory = (e) => {
    e.preventDefault();
    if (!customName.trim()) {
      toast.error('Please enter a category name');
      return;
    }
    const newCat = {
      id: `custom_${Date.now()}`,
      name: customName.trim(),
      icon: customIcon,
      color: customColor,
      is_essential: customEssential,
      priority: customEssential ? 1 : 6,
      enabled: true
    };
    setCategories([...categories, newCat]);
    setCustomName('');
    setShowAddCustom(false);
    toast.success(`Added "${newCat.name}" category! ✨`);
  };

  // Step 2 -> Step 3
  const handleProceedToStep3 = () => {
    const selected = categories.filter(c => c.enabled);
    if (selected.length === 0) {
      toast.error('Please select at least 1 category to manage');
      return;
    }
    setStep(3);
  };

  // Final confirmation & launch
  const handleFinalLaunch = async () => {
    const selectedCategories = categories
      .filter(c => c.enabled)
      .map(c => {
        const matched = generatedBudget.allocations.find(a => a.id === c.id);
        const alloc = matched ? matched.monthly_allocation : 0;
        return {
          name: c.name,
          icon: c.icon,
          color: c.color,
          daily_limit: Math.round((alloc / 30) * 10) / 10,
          monthly_limit: alloc,
          is_essential: c.is_essential,
          priority: c.priority || (c.is_essential ? 1 : 6),
          allocation_mode: 'auto'
        };
      });

    const incomeVal = parseFloat(monthlyIncome) || 10000;
    const otherVal = parseFloat(otherIncome) || 0;
    const obligVal = parseFloat(existingObligations) || 0;

    setSubmitting(true);
    try {
      await onboardUser({
        username,
        display_name: displayName,
        avatar,
        role_title: 'Smart Budgeter',
        theme,
        monthly_income: incomeVal,
        other_income: otherVal,
        existing_obligations: obligVal,
        categories: selectedCategories,
        allocation_mode: 'auto'
      });
      toast.success('🎉 Welcome to SpendWise! Your intelligent budget is active.');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Setup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: 'radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.15) 0%, var(--bg-main) 70%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Top Header */}
      <div style={{
        width: '100%',
        maxWidth: '720px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            boxShadow: '0 8px 20px rgba(99,102,241,0.35)'
          }}>
            ⚡
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--text-dark)', letterSpacing: '-0.5px' }}>
              SpendWise
            </h1>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>
              Income-Aware Financial Tracker
            </p>
          </div>
        </div>

        <button
          onClick={toggleTheme}
          style={{
            padding: '8px 14px',
            borderRadius: '12px',
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            color: 'var(--text-dark)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      {/* Main Container Card */}
      <div className="card-soft" style={{
        width: '100%',
        maxWidth: '720px',
        padding: '28px',
        borderRadius: '24px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
        border: '1px solid var(--card-border)'
      }}>
        {/* Tab Toggle: New Workspace vs Existing Profile */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-main)',
          padding: '4px',
          borderRadius: '14px',
          marginBottom: '24px'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '10px',
              border: 'none',
              background: activeTab === 'new' ? 'var(--card-bg)' : 'transparent',
              color: activeTab === 'new' ? 'var(--text-dark)' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: activeTab === 'new' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            ✨ New Financial Setup
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('login')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '10px',
              border: 'none',
              background: activeTab === 'login' ? 'var(--card-bg)' : 'transparent',
              color: activeTab === 'login' ? 'var(--text-dark)' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: activeTab === 'login' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            👤 Existing Profile ({existingUsers.length})
          </button>
        </div>

        {activeTab === 'login' ? (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px', color: 'var(--text-dark)' }}>
              Choose a Profile
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Select an existing workspace to resume your budgets and transactions:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              {existingUsers.map(u => (
                <div
                  key={u.id}
                  onClick={() => loginUser(u.username)}
                  style={{
                    padding: '16px',
                    borderRadius: '16px',
                    background: 'var(--bg-main)',
                    border: '1px solid var(--card-border)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#6366f1'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--card-border)'}
                >
                  <span style={{ fontSize: '28px' }}>{u.avatar || '👨‍💻'}</span>
                  <div>
                    <strong style={{ fontSize: '14px', color: 'var(--text-dark)', display: 'block' }}>{u.display_name}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>@{u.username}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Or enter username directly..."
                className="form-input"
                value={loginInput}
                onChange={(e) => setLoginInput(e.target.value)}
              />
              <button
                type="button"
                className="btn-pill-coral"
                onClick={() => loginInput.trim() && loginUser(loginInput.trim())}
              >
                Log In
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Step Progress Indicators */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: step >= 1 ? '#6366f1' : 'var(--bg-main)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 800
                }}>1</span>
                <span style={{ fontSize: '13px', fontWeight: step === 1 ? 700 : 500, color: step === 1 ? 'var(--text-dark)' : 'var(--text-muted)' }}>
                  Monthly Income
                </span>
              </div>
              <div style={{ flex: 1, height: '2px', background: 'var(--card-border)', margin: '0 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: step >= 2 ? '#6366f1' : 'var(--bg-main)',
                  color: step >= 2 ? '#fff' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 800
                }}>2</span>
                <span style={{ fontSize: '13px', fontWeight: step === 2 ? 700 : 500, color: step === 2 ? 'var(--text-dark)' : 'var(--text-muted)' }}>
                  Select Categories
                </span>
              </div>
              <div style={{ flex: 1, height: '2px', background: 'var(--card-border)', margin: '0 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: step >= 3 ? '#10b981' : 'var(--bg-main)',
                  color: step >= 3 ? '#fff' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 800
                }}>3</span>
                <span style={{ fontSize: '13px', fontWeight: step === 3 ? 700 : 500, color: step === 3 ? 'var(--text-dark)' : 'var(--text-muted)' }}>
                  Generated Budget
                </span>
              </div>
            </div>

            {/* STEP 1: ASK FOR MONTHLY INCOME */}
            {step === 1 && (
              <form onSubmit={handleProceedToStep2}>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px', color: 'var(--text-dark)' }}>
                    Step 1: What is your monthly income after deductions?
                  </h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                    SpendWise uses this as the single source of truth to ensure your budget never exceeds available money.
                  </p>
                </div>

                {/* Profile Nickname & Avatar */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '20px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Avatar</label>
                    <select
                      className="form-input"
                      value={avatar}
                      onChange={(e) => setAvatar(e.target.value)}
                      style={{ fontSize: '20px', textAlign: 'center' }}
                    >
                      {AVATAR_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Your Name / Nickname *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Hunter, Alex, Priya"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                </div>

                {/* Monthly Income in INR */}
                <div className="form-group" style={{ background: 'rgba(99, 102, 241, 0.05)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                  <label className="form-label" style={{ fontSize: '13px', color: '#6366f1', fontWeight: 700 }}>
                    Monthly Salary / Income after Deductions (₹) *
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-dark)' }}>₹</span>
                    <input
                      type="number"
                      step="100"
                      min="100"
                      className="form-input"
                      style={{ fontSize: '20px', fontWeight: 800, color: 'var(--coral-accent)' }}
                      placeholder="e.g. 10000"
                      required
                      value={monthlyIncome}
                      onChange={(e) => setMonthlyIncome(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    {[10000, 25000, 50000, 75000, 100000].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setMonthlyIncome(val)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '8px',
                          background: parseFloat(monthlyIncome) === val ? '#6366f1' : 'var(--card-bg)',
                          color: parseFloat(monthlyIncome) === val ? '#fff' : 'var(--text-muted)',
                          border: '1px solid var(--card-border)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        ₹{val.toLocaleString('en-IN')}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 0' }}>
                    ℹ️ You can easily edit or change your income anytime later through Settings.
                  </p>
                </div>

                {/* Optional Other Income and Obligations */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>Other Monthly Income (Optional)</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      placeholder="e.g. 0"
                      value={otherIncome}
                      onChange={(e) => setOtherIncome(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>Fixed Obligations / Loan EMI (Optional)</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      placeholder="e.g. 0"
                      value={existingObligations}
                      onChange={(e) => setExistingObligations(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn-pill-coral" style={{ padding: '12px 24px', fontSize: '14px' }}>
                    Next: Choose Expense Categories →
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: SELECT EXPENSE CATEGORIES */}
            {step === 2 && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px', color: 'var(--text-dark)' }}>
                    Step 2: Select Expense Categories
                  </h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                    Select which categories you want to track. You can rename, add custom categories, or set Essential vs Discretionary priority.
                  </p>
                </div>

                {/* Quick Selection Toolbar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setCategories(categories.map(c => ({ ...c, enabled: true })))}
                      style={{ padding: '4px 10px', borderRadius: '8px', background: 'var(--bg-main)', border: '1px solid var(--card-border)', fontSize: '11px', color: 'var(--text-dark)', cursor: 'pointer' }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategories(categories.map(c => ({ ...c, enabled: c.is_essential })))}
                      style={{ padding: '4px 10px', borderRadius: '8px', background: 'var(--bg-main)', border: '1px solid var(--card-border)', fontSize: '11px', color: '#10b981', cursor: 'pointer' }}
                    >
                      Essentials Only
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddCustom(true)}
                    style={{ padding: '6px 12px', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    + Add Custom Category
                  </button>
                </div>

                {/* Custom Category Modal/Form inline */}
                {showAddCustom && (
                  <div style={{ background: 'var(--bg-main)', padding: '14px', borderRadius: '14px', border: '1px dashed #6366f1', marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--text-dark)' }}>Add Custom Category</h4>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      <input
                        type="text"
                        placeholder="Category name (e.g. Gym, Books)"
                        className="form-input"
                        style={{ flex: 2, minWidth: '150px' }}
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                      />
                      <select
                        className="form-input"
                        style={{ width: '80px', fontSize: '16px' }}
                        value={customIcon}
                        onChange={(e) => setCustomIcon(e.target.value)}
                      >
                        {CUSTOM_EMOJIS.map(em => <option key={em} value={em}>{em}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => setCustomEssential(!customEssential)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: 'none',
                          background: customEssential ? '#10b981' : '#f59e0b',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {customEssential ? 'Essential' : 'Discretionary'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button type="button" onClick={() => setShowAddCustom(false)} style={{ padding: '6px 12px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                      <button type="button" onClick={handleAddCustomCategory} className="btn-pill-coral" style={{ padding: '6px 14px', fontSize: '12px' }}>Save Category</button>
                    </div>
                  </div>
                )}

                {/* Categories Grid */}
                <div style={{ maxHeight: '380px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '10px', paddingRight: '4px', marginBottom: '20px' }}>
                  {categories.map(c => (
                    <div
                      key={c.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '14px',
                        background: c.enabled ? 'var(--card-bg)' : 'var(--bg-main)',
                        border: `1.5px solid ${c.enabled ? (c.is_essential ? '#10b981' : '#6366f1') : 'var(--card-border)'}`,
                        opacity: c.enabled ? 1 : 0.6,
                        transition: 'all 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '20px' }}>{c.icon}</span>
                          {editingCatId === c.id ? (
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onBlur={() => handleSaveRename(c.id)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(c.id)}
                              autoFocus
                              style={{ width: '100px', fontSize: '12px', padding: '2px 4px', borderRadius: '4px', border: '1px solid #6366f1' }}
                            />
                          ) : (
                            <strong style={{ fontSize: '13px', color: 'var(--text-dark)' }}>{c.name}</strong>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={c.enabled}
                          onChange={() => handleToggleCategory(c.id)}
                          style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#6366f1' }}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--card-border)' }}>
                        <button
                          type="button"
                          onClick={() => handleTogglePriority(c.id)}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            border: 'none',
                            background: c.is_essential ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: c.is_essential ? '#10b981' : '#f59e0b',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {c.is_essential ? '🛡️ Essential' : '✨ Discretionary'}
                        </button>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            title="Rename"
                            onClick={() => handleStartRename(c)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            title="Remove"
                            onClick={() => handleRemoveCategory(c.id)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    style={{ padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--card-border)', background: 'var(--bg-main)', color: 'var(--text-dark)', cursor: 'pointer', fontSize: '13px' }}
                  >
                    ← Back to Income
                  </button>
                  <button
                    type="button"
                    className="btn-pill-coral"
                    onClick={handleProceedToStep3}
                    style={{ padding: '12px 24px', fontSize: '14px' }}
                  >
                    Generate Intelligent Budget →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: AUTOMATICALLY GENERATED MONTHLY BUDGET */}
            {step === 3 && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px', color: 'var(--text-dark)' }}>
                    Step 3: Automatically Generated Monthly Budget
                  </h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                    Here is your tailored budget for ₹{parseFloat(monthlyIncome).toLocaleString('en-IN')}. It distributes available income intelligently and will never exceed your income.
                  </p>
                </div>

                {/* Summary Metrics Banner */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '12px',
                  marginBottom: '20px'
                }}>
                  <div style={{ background: 'rgba(99, 102, 241, 0.08)', padding: '14px', borderRadius: '14px', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>AVAILABLE MONTHLY INCOME</span>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#6366f1', marginTop: '2px' }}>
                      ₹{parseFloat(monthlyIncome).toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '14px', borderRadius: '14px', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>PLANNED ALLOCATIONS</span>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                      ₹{generatedBudget.total.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(14, 165, 233, 0.08)', padding: '14px', borderRadius: '14px', border: '1px solid rgba(14,165,233,0.2)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>UNALLOCATED RESERVE</span>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0ea5e9', marginTop: '2px' }}>
                      ₹{generatedBudget.reserve.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                {/* Allocation Table Preview */}
                <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--card-border)', borderRadius: '14px', marginBottom: '24px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--card-border)' }}>
                        <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-muted)' }}>Category</th>
                        <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-muted)' }}>Priority</th>
                        <th style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--text-muted)' }}>Daily Allowance</th>
                        <th style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--text-muted)' }}>Monthly Allocation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generatedBudget.allocations.map((a, idx) => (
                        <tr key={a.id || idx} style={{ borderBottom: '1px solid var(--card-border)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-dark)' }}>
                            <span style={{ marginRight: '6px' }}>{a.icon}</span> {a.name}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '10px',
                              fontSize: '10px',
                              fontWeight: 700,
                              background: a.is_essential ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: a.is_essential ? '#10b981' : '#f59e0b'
                            }}>
                              {a.is_essential ? 'Essential' : 'Discretionary'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-muted)' }}>
                            ₹{a.daily_limit}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--coral-accent)' }}>
                            ₹{a.monthly_allocation.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    style={{ padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--card-border)', background: 'var(--bg-main)', color: 'var(--text-dark)', cursor: 'pointer', fontSize: '13px' }}
                  >
                    ← Back to Categories
                  </button>
                  <button
                    type="button"
                    className="btn-pill-coral"
                    disabled={submitting}
                    onClick={handleFinalLaunch}
                    style={{ padding: '12px 28px', fontSize: '15px', fontWeight: 800, opacity: submitting ? 0.7 : 1 }}
                  >
                    {submitting ? 'Setting up Workspace...' : '🚀 Complete Setup & Launch SpendWise'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
