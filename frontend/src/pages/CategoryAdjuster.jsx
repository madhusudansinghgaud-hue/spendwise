import { useState, useEffect } from 'react';
import { categoriesApi, analysisApi, authApi, bufferApi } from '../api';
import toast from 'react-hot-toast';

export default function CategoryAdjuster() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [availableMonths, setAvailableMonths] = useState([]);
  
  // Selected month state (defaults to current month YYYY-MM)
  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  // User financial profile & income
  const [monthlyIncome, setMonthlyIncome] = useState(50000);
  const [allocationMode, setAllocationMode] = useState('auto');
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [incomeInput, setIncomeInput] = useState(50000);
  const [recalcOnIncomeChange, setRecalcOnIncomeChange] = useState(true);

  // Local editing state: { [categoryId]: editedBudgetNumber }
  const [editingBudgets, setEditingBudgets] = useState({});
  const [saving, setSaving] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);

  // Reallocation Modal state
  const [showReallocateModal, setShowReallocateModal] = useState(false);
  const [reallocateForm, setReallocateForm] = useState({
    source_type: 'category',
    source_category_id: '',
    destination_category_id: '',
    amount: '',
    reason: ''
  });
  const [reallocating, setReallocating] = useState(false);

  // Reallocation History state
  const [showReallocHistory, setShowReallocHistory] = useState(false);
  const [reallocations, setReallocations] = useState([]);
  const [loadingReallocations, setLoadingReallocations] = useState(false);

  // Edit Category Configuration Modal
  const [editingCategory, setEditingCategory] = useState(null);
  const [editCategoryForm, setEditCategoryForm] = useState({
    name: '',
    icon: '🏷️',
    color: '#6366f1',
    frequency: 'monthly',
    daily_limit: 0,
    expected_frequency: '',
    transaction_limit: 0,
    is_essential: true
  });
  const [availableBuffer, setAvailableBuffer] = useState(3000);

  // Add new category modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCat, setNewCat] = useState({
    name: '',
    icon: '🏷️',
    color: '#6366f1',
    frequency: 'monthly',
    daily_limit: 300,
    monthly_limit: 4000,
    expected_frequency: '',
    transaction_limit: 0,
    is_essential: true,
    allocation_mode: 'auto'
  });


  const fetchMonths = async () => {
    try {
      const res = await analysisApi.getMonths();
      if (res.data && res.data.length > 0) {
        setAvailableMonths(res.data);
      }
    } catch (err) {
      console.error('Error fetching available months', err);
    }
  };

  const fetchProfileAndBudgets = async (month) => {
    try {
      setLoading(true);
      const [profileRes, catsRes, bufRes] = await Promise.all([
        authApi.getProfile(),
        categoriesApi.getAll(month),
        bufferApi.getStatus().catch(() => ({ data: { available_buffer: 3000 } }))
      ]);

      if (profileRes.data) {
        const inc = profileRes.data.monthly_income || 50000;
        setMonthlyIncome(inc);
        setIncomeInput(inc);
        setAllocationMode(profileRes.data.allocation_mode || 'auto');
      }

      if (bufRes.data?.available_buffer !== undefined) {
        setAvailableBuffer(bufRes.data.available_buffer);
      }

      const data = catsRes.data || [];
      setCategories(data);

      const initialMap = {};
      data.forEach(c => {
        initialMap[c.id] = c.monthly_limit || 0;
      });
      setEditingBudgets(initialMap);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load category budgets');
    } finally {
      setLoading(false);
    }
  };

  const fetchReallocationHistory = async () => {
    try {
      setLoadingReallocations(true);
      const res = await categoriesApi.getReallocations(selectedMonth);
      setReallocations(res.data || []);
    } catch (err) {
      console.error('Error fetching reallocations', err);
    } finally {
      setLoadingReallocations(false);
    }
  };

  useEffect(() => {
    fetchMonths();
  }, []);

  useEffect(() => {
    fetchProfileAndBudgets(selectedMonth);
    fetchReallocationHistory();
  }, [selectedMonth]);

  const handleBudgetChange = (catId, val) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setEditingBudgets(prev => ({
      ...prev,
      [catId]: num
    }));
  };

  // Open Edit Category Configuration Modal
  const handleOpenEditCategory = (cat) => {
    setEditingCategory(cat);
    setEditCategoryForm({
      name: cat.name,
      icon: cat.icon || '🏷️',
      color: cat.color || '#6366f1',
      frequency: cat.frequency || 'monthly',
      daily_limit: cat.daily_limit || 0,
      expected_frequency: cat.expected_frequency || '',
      transaction_limit: cat.transaction_limit || 0,
      is_essential: cat.is_essential !== undefined ? cat.is_essential : true
    });
  };

  // Save Category Configuration
  const handleSaveCategoryConfig = async (e) => {
    e.preventDefault();
    if (!editingCategory) return;
    try {
      await categoriesApi.update(editingCategory.id, {
        name: editCategoryForm.name.trim(),
        icon: editCategoryForm.icon,
        color: editCategoryForm.color,
        frequency: editCategoryForm.frequency,
        daily_limit: parseFloat(editCategoryForm.daily_limit) || 0,
        expected_frequency: editCategoryForm.expected_frequency?.trim() || '',
        transaction_limit: parseFloat(editCategoryForm.transaction_limit) || 0,
        is_essential: editCategoryForm.is_essential,
        priority: editCategoryForm.is_essential ? 1 : 6
      });
      toast.success(`Updated configuration for ${editCategoryForm.name}! ✨`);
      setEditingCategory(null);
      fetchProfileAndBudgets(selectedMonth);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update category configuration');
    }
  };

  // Execute Smart Reallocation Between Categories or Buffer
  const handleExecuteReallocation = async (e) => {
    e.preventDefault();
    const amt = parseFloat(reallocateForm.amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a positive reallocation amount');
      return;
    }
    if (!reallocateForm.destination_category_id) {
      toast.error('Please select a destination category');
      return;
    }
    if (reallocateForm.source_type === 'category') {
      if (!reallocateForm.source_category_id) {
        toast.error('Please select a source category');
        return;
      }
      if (String(reallocateForm.source_category_id) === String(reallocateForm.destination_category_id)) {
        toast.error('Source and destination categories must be different');
        return;
      }
    }

    try {
      setReallocating(true);
      const res = await categoriesApi.reallocate({
        source_type: reallocateForm.source_type,
        source_category_id: reallocateForm.source_type === 'category' ? parseInt(reallocateForm.source_category_id) : null,
        destination_category_id: parseInt(reallocateForm.destination_category_id),
        amount: amt,
        reason: reallocateForm.reason?.trim() || 'Manual Reallocation',
        month_year: selectedMonth
      });
      toast.success(res.data?.message || 'Budget reallocated successfully! 🔄');
      setShowReallocateModal(false);
      setReallocateForm({
        source_type: 'category',
        source_category_id: '',
        destination_category_id: '',
        amount: '',
        reason: ''
      });
      fetchProfileAndBudgets(selectedMonth);
      fetchReallocationHistory();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to reallocate budget');
    } finally {
      setReallocating(false);
    }
  };

  // Toggle essential vs discretionary designation
  const handleToggleEssential = async (cat) => {
    const nextEssential = !cat.is_essential;
    try {
      await categoriesApi.update(cat.id, {
        is_essential: nextEssential,
        priority: nextEssential ? 1 : 6
      });
      toast.success(`${cat.name} is now marked as ${nextEssential ? 'Essential' : 'Discretionary'}`);
      fetchProfileAndBudgets(selectedMonth);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update category priority');
    }
  };


  // Save single category budget adjustment
  const handleSaveSingle = async (catId) => {
    const amount = editingBudgets[catId];
    if (amount === undefined || amount < 0) {
      toast.error('Budget cannot be negative');
      return;
    }
    try {
      const res = await categoriesApi.adjustMonthlyBudget({
        category_id: catId,
        month_year: selectedMonth,
        budget_amount: amount,
        allocation_mode: 'manual',
        update_default: true
      });
      if (res.data?.warning) {
        toast.error(res.data.warning, { duration: 6000 });
      } else {
        toast.success('Category budget adjusted and saved persistently! 💾');
      }
      fetchProfileAndBudgets(selectedMonth);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save budget adjustment');
    }
  };

  // Save all category budget adjustments in batch
  const handleSaveAll = async () => {
    try {
      setSaving(true);
      const updates = categories.map(c => ({
        category_id: c.id,
        budget_amount: editingBudgets[c.id] !== undefined ? editingBudgets[c.id] : c.monthly_limit,
        allocation_mode: 'manual'
      }));

      await categoriesApi.batchAdjustMonthlyBudgets({
        month_year: selectedMonth,
        budgets: updates,
        update_default: true
      });

      if (plannedBudget > monthlyIncome) {
        toast.error(`⚠️ Warning: Total planned budget (₹${plannedBudget.toLocaleString('en-IN')}) exceeds income by ₹${shortfall.toLocaleString('en-IN')}`, { duration: 6000 });
      } else {
        toast.success('All category budgets saved successfully! 🎉');
      }
      fetchProfileAndBudgets(selectedMonth);
    } catch (err) {
      console.error(err);
      toast.error('Failed to batch save budgets');
    } finally {
      setSaving(false);
    }
  };

  // Auto-rebalance budget using centralized budget engine
  const handleAutoRebalance = async () => {
    try {
      setRebalancing(true);
      const res = await categoriesApi.rebalanceBudget({
        month_year: selectedMonth,
        monthly_income: monthlyIncome,
        apply_changes: true
      });
      toast.success(res.data?.message || 'Budget auto-rebalanced successfully based on priority order! ⚡');
      fetchProfileAndBudgets(selectedMonth);
    } catch (err) {
      console.error(err);
      toast.error('Failed to rebalance budget');
    } finally {
      setRebalancing(false);
    }
  };

  // Update user income
  const handleUpdateIncome = async (e) => {
    e.preventDefault();
    const incVal = parseFloat(incomeInput);
    if (isNaN(incVal) || incVal <= 0) {
      toast.error('Please enter a valid monthly income');
      return;
    }
    try {
      const res = await authApi.updateIncome({
        monthly_income: incVal,
        recalculate: recalcOnIncomeChange
      });
      toast.success(res.data?.message || 'Monthly income updated!');
      setMonthlyIncome(incVal);
      setShowIncomeModal(false);
      fetchProfileAndBudgets(selectedMonth);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update income');
    }
  };

  // Create new category
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCat.name.trim()) return;
    try {
      await categoriesApi.create({
        name: newCat.name.trim(),
        icon: newCat.icon,
        color: newCat.color,
        daily_limit: parseFloat(newCat.daily_limit) || 0,
        monthly_limit: parseFloat(newCat.monthly_limit) || 0,
        is_essential: newCat.is_essential,
        priority: newCat.is_essential ? 1 : 6,
        allocation_mode: newCat.allocation_mode
      });
      toast.success(`Category "${newCat.name}" added!`);
      setShowAddModal(false);
      setNewCat({
        name: '',
        icon: '🏷️',
        color: '#6366f1',
        daily_limit: 300,
        monthly_limit: 4000,
        is_essential: true,
        allocation_mode: 'auto'
      });
      fetchProfileAndBudgets(selectedMonth);
    } catch (err) {
      console.error(err);
      toast.error('Failed to create category');
    }
  };

  const handleDeleteCategory = async (catId, catName) => {
    if (!window.confirm(`Are you sure you want to delete "${catName}"?`)) return;
    try {
      await categoriesApi.delete(catId);
      toast.success(`Deleted "${catName}"`);
      fetchProfileAndBudgets(selectedMonth);
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete category');
    }
  };

  // Dynamic calculations in real time
  const plannedBudget = categories.reduce((sum, c) => {
    const val = editingBudgets[c.id] !== undefined ? editingBudgets[c.id] : c.monthly_limit;
    return sum + (parseFloat(val) || 0);
  }, 0);

  const totalSpent = categories.reduce((sum, c) => sum + (c.monthly_spent || 0), 0);
  const remainingBudget = plannedBudget - totalSpent;
  const shortfall = Math.max(0, plannedBudget - monthlyIncome);
  const unallocatedReserve = Math.max(0, monthlyIncome - plannedBudget);
  const isBudgetExceeded = plannedBudget > monthlyIncome;

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title">📊 Budget Overview & Adjuster</h1>
          <p className="page-subtitle">
            Centralized budgeting engine connected directly to your monthly income. All allocations update dynamically without exceeding available money.
          </p>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Month Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--card-bg)', padding: '6px 14px', borderRadius: '24px', border: '1px solid var(--card-border)' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)' }}>Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--coral-accent)',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              {availableMonths.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn-pill-coral"
            onClick={handleSaveAll}
            disabled={saving}
          >
            {saving ? 'Saving...' : '💾 Save All Changes'}
          </button>

          <button
            type="button"
            onClick={handleAutoRebalance}
            disabled={rebalancing}
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: '24px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: rebalancing ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {rebalancing ? 'Rebalancing...' : '⚡ Auto-Rebalance Budget'}
          </button>

          <button
            type="button"
            onClick={() => {
              if (categories.length >= 2) {
                setReallocateForm({
                  source_type: 'category',
                  source_category_id: categories[0].id,
                  destination_category_id: categories[1].id,
                  amount: 200,
                  reason: 'Budget adjustment'
                });
              }
              setShowReallocateModal(true);
            }}
            style={{
              background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: '24px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(14,165,233,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🔄 Reallocate Budget
          </button>

          <button
            type="button"
            onClick={() => setShowReallocHistory(!showReallocHistory)}
            style={{
              background: showReallocHistory ? 'var(--primary-color, #6366f1)' : 'var(--card-bg)',
              color: showReallocHistory ? '#fff' : 'var(--text-dark)',
              border: '1px solid var(--card-border)',
              borderRadius: '24px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            📜 History ({reallocations.length})
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            style={{
              background: 'var(--card-bg)',
              color: 'var(--text-dark)',
              border: '1px solid var(--card-border)',
              borderRadius: '24px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            + New Category
          </button>
        </div>
      </div>

      {/* Prominent Shortfall / Budget Exceeded Warning */}
      {isBudgetExceeded && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1.5px solid #ef4444',
          borderRadius: '16px',
          padding: '16px 20px',
          margin: '16px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>⚠️</span>
            <div>
              <strong style={{ fontSize: '15px', color: '#ef4444', display: 'block' }}>
                Budget Exceeds Monthly Income!
              </strong>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-dark)' }}>
                Your planned budget exceeds your available income by <strong style={{ color: '#ef4444' }}>₹{shortfall.toLocaleString('en-IN')}</strong>. Reduce one or more allocations to continue.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAutoRebalance}
            style={{
              padding: '8px 16px',
              borderRadius: '12px',
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Fix Automatically ⚡
          </button>
        </div>
      )}

      {/* Income & Budget Overview Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px',
        margin: '18px 0'
      }}>
        {/* Monthly Income Card with Edit Button */}
        <div className="card-soft" style={{ padding: '16px', borderLeft: '4px solid #10b981', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>MONTHLY SALARY / INCOME</span>
            <button
              type="button"
              onClick={() => setShowIncomeModal(true)}
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                border: 'none',
                borderRadius: '8px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ✏️ Edit
            </button>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
            ₹{monthlyIncome.toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Single source of truth</span>
        </div>

        {/* Total Planned Budget */}
        <div className="card-soft" style={{ padding: '16px', borderLeft: `4px solid ${isBudgetExceeded ? '#ef4444' : '#6366f1'}` }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>TOTAL PLANNED BUDGET</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: isBudgetExceeded ? '#ef4444' : '#6366f1', marginTop: '4px' }}>
            ₹{plannedBudget.toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '11px', color: isBudgetExceeded ? '#ef4444' : 'var(--text-muted)' }}>
            {isBudgetExceeded ? `Exceeds income by ₹${shortfall.toLocaleString('en-IN')}` : `${((plannedBudget / (monthlyIncome || 1)) * 100).toFixed(0)}% of income allocated`}
          </span>
        </div>

        {/* Unallocated Reserve */}
        <div className="card-soft" style={{ padding: '16px', borderLeft: '4px solid #0ea5e9' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>UNALLOCATED RESERVE</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0ea5e9', marginTop: '4px' }}>
            ₹{unallocatedReserve.toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Free cash buffer available</span>
        </div>

        {/* Actual Spent This Month */}
        <div className="card-soft" style={{ padding: '16px', borderLeft: '4px solid #f59e0b' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>ACTUAL SPENT THIS MONTH</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
            ₹{totalSpent.toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {plannedBudget > 0 ? `${((totalSpent / plannedBudget) * 100).toFixed(1)}% of budget used` : 'No budget set'}
          </span>
        </div>

        {/* Overall Remaining Budget */}
        <div className="card-soft" style={{ padding: '16px', borderLeft: `4px solid ${remainingBudget >= 0 ? '#10b981' : '#ef4444'}` }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>OVERALL REMAINING</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: remainingBudget >= 0 ? '#10b981' : '#ef4444', marginTop: '4px' }}>
            ₹{remainingBudget.toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {remainingBudget >= 0 ? 'Within budget limit' : 'Monthly budget deficit'}
          </span>
        </div>
      </div>

      {/* Category Budget Adjustment Table */}
      <div className="card-soft" style={{ padding: '24px', overflowX: 'auto' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '17px', fontWeight: 800, color: 'var(--text-dark)' }}>
          Category Allocations ({categories.length})
        </h3>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            Loading categories and budgets...
          </div>
        ) : categories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No categories found. Click "+ New Category" to create your first one.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700 }}>
                <th style={{ padding: '12px 14px' }}>Category</th>
                <th style={{ padding: '12px 14px' }}>Designation</th>
                <th style={{ padding: '12px 14px' }}>Allocation Mode</th>
                <th style={{ padding: '12px 14px', width: '180px' }}>Monthly Budget (₹)</th>
                <th style={{ padding: '12px 14px' }}>Actual Spent</th>
                <th style={{ padding: '12px 14px' }}>Remaining</th>
                <th style={{ padding: '12px 14px', minWidth: '150px' }}>Usage</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(c => {
                const currentBudget = editingBudgets[c.id] !== undefined ? editingBudgets[c.id] : c.monthly_limit;
                const spent = c.monthly_spent || 0;
                const rem = currentBudget - spent;
                const pct = currentBudget > 0 ? Math.min(100, Math.round((spent / currentBudget) * 100)) : 0;
                const isOver = currentBudget > 0 && spent > currentBudget;

                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--card-border)', transition: 'background 0.2s' }}>
                    {/* Category Icon & Name */}
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-dark)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <span style={{ fontSize: '24px', marginTop: '2px' }}>{c.icon}</span>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '14px' }}>{c.name}</strong>
                            {c.frequency === 'daily' && (
                              <span style={{ padding: '2px 6px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontSize: '10px', fontWeight: 700 }}>
                                ☀️ Daily
                              </span>
                            )}
                            {c.frequency === 'occasional' && (
                              <span style={{ padding: '2px 6px', borderRadius: '6px', background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', fontSize: '10px', fontWeight: 700 }}>
                                🎯 Occasional
                              </span>
                            )}
                            {c.frequency === 'weekly' && (
                              <span style={{ padding: '2px 6px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontSize: '10px', fontWeight: 700 }}>
                                📅 Weekly
                              </span>
                            )}
                            {(!c.frequency || c.frequency === 'monthly') && (
                              <span style={{ padding: '2px 6px', borderRadius: '6px', background: 'rgba(100, 116, 139, 0.15)', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600 }}>
                                🗓️ Monthly
                              </span>
                            )}
                          </div>
                          
                          {c.frequency === 'daily' ? (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                              Limit: <strong>₹{c.daily_limit?.toLocaleString() || 0}</strong> • Today: ₹{c.daily_spent?.toLocaleString() || 0} • Left: <span style={{ color: (c.daily_remaining || 0) > 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>₹{c.daily_remaining?.toLocaleString() || 0}</span>
                            </div>
                          ) : c.frequency === 'occasional' ? (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                              {c.expected_frequency ? `${c.expected_frequency}` : 'As needed'}{c.transaction_limit > 0 ? ` • Limit/Tx: ₹${c.transaction_limit.toLocaleString()}` : ''}
                            </div>
                          ) : (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                              Daily ~₹{Math.round(currentBudget / 30)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Essential vs Discretionary */}
                    <td style={{ padding: '12px 14px' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleEssential(c)}
                        title="Click to toggle Essential vs Discretionary priority"
                        style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          border: 'none',
                          background: c.is_essential ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: c.is_essential ? '#10b981' : '#f59e0b',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {c.is_essential ? '🛡️ Essential' : '✨ Discretionary'}
                      </button>
                    </td>

                    {/* Mode (Auto vs Manual) */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: 'var(--bg-main)',
                        color: c.allocation_mode === 'manual' ? '#6366f1' : 'var(--text-muted)',
                        border: '1px solid var(--card-border)'
                      }}>
                        {c.allocation_mode === 'manual' ? '✏️ Manual' : '🤖 Auto'}
                      </span>
                    </td>

                    {/* Editable Monthly Budget Input */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>₹</span>
                        <input
                          type="number"
                          step="50"
                          min="0"
                          className="form-input"
                          style={{
                            padding: '6px 10px',
                            fontWeight: 700,
                            color: isOver ? '#ef4444' : 'var(--text-dark)',
                            borderColor: isOver ? '#ef4444' : 'var(--card-border)'
                          }}
                          value={currentBudget}
                          onChange={(e) => handleBudgetChange(c.id, e.target.value)}
                        />
                      </div>
                    </td>

                    {/* Actual Spent */}
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: spent > 0 ? 'var(--text-dark)' : 'var(--text-muted)' }}>
                      ₹{spent.toLocaleString('en-IN')}
                    </td>

                    {/* Remaining */}
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: rem >= 0 ? '#10b981' : '#ef4444' }}>
                      ₹{rem.toLocaleString('en-IN')}
                    </td>

                    {/* Usage Progress Bar */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'var(--bg-main)', overflow: 'hidden' }}>
                          <div style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: isOver ? '#ef4444' : (pct > 80 ? '#f59e0b' : '#10b981'),
                            borderRadius: '4px'
                          }} />
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 700, minWidth: '36px', color: isOver ? '#ef4444' : 'var(--text-muted)' }}>
                          {pct}%
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditCategory(c)}
                          title="Configure Frequency, Daily Limit & Transaction Limits"
                          style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            background: 'rgba(14, 165, 233, 0.15)',
                            color: '#0ea5e9',
                            border: '1px solid rgba(14, 165, 233, 0.3)',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          ⚙️ Config
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveSingle(c.id)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            background: 'rgba(99, 102, 241, 0.15)',
                            color: '#6366f1',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(c.id, c.name)}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '8px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* --- EDIT MONTHLY SALARY MODAL --- */}
      {showIncomeModal && (
        <div className="modal-backdrop">
          <div className="card-soft modal-card" style={{ maxWidth: '440px', width: '90%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-dark)', fontSize: '18px' }}>💰 Update Monthly Income</h3>
              <button
                type="button"
                onClick={() => setShowIncomeModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateIncome}>
              <div className="form-group">
                <label className="form-label">Monthly Salary / Income after Deductions (₹) *</label>
                <input
                  type="number"
                  min="100"
                  step="500"
                  className="form-input"
                  required
                  value={incomeInput}
                  onChange={(e) => setIncomeInput(e.target.value)}
                />
              </div>

              <div style={{ background: 'var(--bg-main)', padding: '12px', borderRadius: '12px', border: '1px solid var(--card-border)', marginBottom: '18px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-dark)' }}>
                  <input
                    type="checkbox"
                    checked={recalcOnIncomeChange}
                    onChange={(e) => setRecalcOnIncomeChange(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#6366f1' }}
                  />
                  <span>
                    <strong>Auto-recalculate category budgets</strong>
                    <br />
                    <small style={{ color: 'var(--text-muted)' }}>Proportionally adjusts suggested category limits to match new income</small>
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowIncomeModal(false)}
                  style={{ flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid var(--card-border)', background: 'var(--bg-main)', color: 'var(--text-dark)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-pill-coral"
                  style={{ flex: 1, padding: '10px' }}
                >
                  Save Income
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD CATEGORY MODAL --- */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="card-soft modal-card" style={{ maxWidth: '440px', width: '90%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-dark)', fontSize: '18px' }}>🏷️ Add New Category</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCategory}>
              <div className="form-group">
                <label className="form-label">Category Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Healthcare, Books, Gym"
                  required
                  value={newCat.name}
                  onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Icon</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newCat.icon}
                    onChange={(e) => setNewCat({ ...newCat, icon: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Color</label>
                  <input
                    type="color"
                    className="form-input"
                    style={{ height: '42px', padding: '2px 4px' }}
                    value={newCat.color}
                    onChange={(e) => setNewCat({ ...newCat, color: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Frequency / Pattern</label>
                  <select
                    className="form-input"
                    value={newCat.frequency}
                    onChange={(e) => setNewCat({ ...newCat, frequency: e.target.value })}
                  >
                    <option value="daily">☀️ Daily (Frequent purchases)</option>
                    <option value="weekly">📅 Weekly</option>
                    <option value="monthly">🗓️ Monthly (Regular bills)</option>
                    <option value="occasional">🎯 Occasional / Irregular</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Monthly Limit (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    className="form-input"
                    value={newCat.monthly_limit}
                    onChange={(e) => setNewCat({ ...newCat, monthly_limit: e.target.value, daily_limit: Math.round((parseFloat(e.target.value) || 0) / 30) })}
                  />
                </div>
              </div>

              {newCat.frequency === 'daily' && (
                <div className="form-group">
                  <label className="form-label">Daily Spending Limit (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    className="form-input"
                    value={newCat.daily_limit}
                    onChange={(e) => setNewCat({ ...newCat, daily_limit: e.target.value })}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    Resets automatically at calendar midnight while preserving monthly spending.
                  </small>
                </div>
              )}

              {newCat.frequency === 'occasional' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Expected Frequency</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 2 times a month"
                      value={newCat.expected_frequency}
                      onChange={(e) => setNewCat({ ...newCat, expected_frequency: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Limit per Transaction (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      className="form-input"
                      placeholder="Optional"
                      value={newCat.transaction_limit}
                      onChange={(e) => setNewCat({ ...newCat, transaction_limit: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Priority Designation</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setNewCat({ ...newCat, is_essential: true })}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '10px',
                      border: newCat.is_essential ? '2px solid #10b981' : '1px solid var(--card-border)',
                      background: newCat.is_essential ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-main)',
                      color: newCat.is_essential ? '#10b981' : 'var(--text-muted)',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    🛡️ Essential
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCat({ ...newCat, is_essential: false })}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '10px',
                      border: !newCat.is_essential ? '2px solid #f59e0b' : '1px solid var(--card-border)',
                      background: !newCat.is_essential ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-main)',
                      color: !newCat.is_essential ? '#f59e0b' : 'var(--text-muted)',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ✨ Discretionary
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid var(--card-border)', background: 'var(--bg-main)', color: 'var(--text-dark)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-pill-coral"
                  style={{ flex: 1, padding: '10px' }}
                >
                  Add Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- REALLOCATION HISTORY CARD --- */}
      {showReallocHistory && (
        <div className="card-soft" style={{ padding: '24px', marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-dark)' }}>
                📜 Budget Reallocation History ({selectedMonth})
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                Audit trail of budget transfers between categories and emergency buffer. Total planned budget remained preserved.
              </p>
            </div>
            <button
              onClick={() => setShowReallocHistory(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          {loadingReallocations ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Loading history...</div>
          ) : reallocations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
              No budget reallocations recorded for {selectedMonth}. When you move money between categories, it will appear here.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700 }}>
                  <th style={{ padding: '10px 14px' }}>Timestamp</th>
                  <th style={{ padding: '10px 14px' }}>Source Category / Buffer</th>
                  <th style={{ padding: '10px 14px' }}>Target Category</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Amount Moved</th>
                  <th style={{ padding: '10px 14px' }}>Reason / Context</th>
                </tr>
              </thead>
              <tbody>
                {reallocations.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-dark)' }}>
                      <span style={{ marginRight: '6px' }}>{r.source_icon}</span>
                      {r.source_name}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-dark)' }}>
                      <span style={{ marginRight: '6px' }}>{r.destination_icon}</span>
                      {r.destination_name}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0ea5e9' }}>
                      ₹{r.amount?.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {r.reason || 'Manual transfer'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* --- SMART REALLOCATION MODAL --- */}
      {showReallocateModal && (
        <div className="modal-backdrop">
          <div className="card-soft modal-card" style={{ maxWidth: '520px', width: '90%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>🔄</span>
                <div>
                  <h3 style={{ margin: 0, color: 'var(--text-dark)', fontSize: '18px' }}>Reallocate Budget</h3>
                  <small style={{ color: 'var(--text-muted)' }}>Move money between categories without increasing total budget</small>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReallocateModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExecuteReallocation}>
              {/* Source Type Toggle */}
              <div className="form-group">
                <label className="form-label">Transfer From:</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setReallocateForm({ ...reallocateForm, source_type: 'category' })}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '10px',
                      border: reallocateForm.source_type === 'category' ? '2px solid #0ea5e9' : '1px solid var(--card-border)',
                      background: reallocateForm.source_type === 'category' ? 'rgba(14, 165, 233, 0.15)' : 'var(--bg-main)',
                      color: reallocateForm.source_type === 'category' ? '#0ea5e9' : 'var(--text-muted)',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    🏷️ Another Category
                  </button>
                  <button
                    type="button"
                    onClick={() => setReallocateForm({ ...reallocateForm, source_type: 'buffer' })}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '10px',
                      border: reallocateForm.source_type === 'buffer' ? '2px solid #0ea5e9' : '1px solid var(--card-border)',
                      background: reallocateForm.source_type === 'buffer' ? 'rgba(14, 165, 233, 0.15)' : 'var(--bg-main)',
                      color: reallocateForm.source_type === 'buffer' ? '#0ea5e9' : 'var(--text-muted)',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    🛡️ Emergency Buffer (₹{availableBuffer.toLocaleString()} available)
                  </button>
                </div>

                {reallocateForm.source_type === 'category' && (
                  <select
                    className="form-input"
                    value={reallocateForm.source_category_id}
                    onChange={(e) => setReallocateForm({ ...reallocateForm, source_category_id: e.target.value })}
                    required
                  >
                    <option value="">-- Choose source category --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name} (Budget: ₹{(editingBudgets[c.id] || c.monthly_limit || 0).toLocaleString()} | Spent: ₹{(c.monthly_spent || 0).toLocaleString()} | Remaining: ₹{Math.max(0, (editingBudgets[c.id] || c.monthly_limit || 0) - (c.monthly_spent || 0)).toLocaleString()})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Destination Category */}
              <div className="form-group">
                <label className="form-label">Transfer To (Destination Category):</label>
                <select
                  className="form-input"
                  value={reallocateForm.destination_category_id}
                  onChange={(e) => setReallocateForm({ ...reallocateForm, destination_category_id: e.target.value })}
                  required
                >
                  <option value="">-- Choose destination category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id} disabled={String(c.id) === String(reallocateForm.source_category_id)}>
                      {c.icon} {c.name} (Current Budget: ₹{(editingBudgets[c.id] || c.monthly_limit || 0).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div className="form-group">
                <label className="form-label">Reallocation Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  step="50"
                  className="form-input"
                  required
                  placeholder="e.g. 300"
                  value={reallocateForm.amount}
                  onChange={(e) => setReallocateForm({ ...reallocateForm, amount: e.target.value })}
                />
              </div>

              {/* Reason */}
              <div className="form-group">
                <label className="form-label">Reason / Context (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Cover extra coffee expenses"
                  value={reallocateForm.reason}
                  onChange={(e) => setReallocateForm({ ...reallocateForm, reason: e.target.value })}
                />
              </div>

              {/* Live Before/After Preview */}
              {reallocateForm.amount && parseFloat(reallocateForm.amount) > 0 && reallocateForm.destination_category_id && (
                <div style={{ background: 'var(--bg-main)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--card-border)', marginBottom: '16px', fontSize: '13px' }}>
                  <strong style={{ color: 'var(--text-dark)', display: 'block', marginBottom: '6px' }}>Preview After Transfer:</strong>
                  {reallocateForm.source_type === 'category' && reallocateForm.source_category_id && (() => {
                    const src = categories.find(c => String(c.id) === String(reallocateForm.source_category_id));
                    const dst = categories.find(c => String(c.id) === String(reallocateForm.destination_category_id));
                    const amt = parseFloat(reallocateForm.amount) || 0;
                    const srcCurr = editingBudgets[src?.id] !== undefined ? editingBudgets[src?.id] : (src?.monthly_limit || 0);
                    const dstCurr = editingBudgets[dst?.id] !== undefined ? editingBudgets[dst?.id] : (dst?.monthly_limit || 0);

                    return (
                      <div>
                        <div>{src?.icon} {src?.name}: ₹{srcCurr.toLocaleString()} → <span style={{ color: '#ef4444', fontWeight: 700 }}>₹{Math.max(0, srcCurr - amt).toLocaleString()}</span> (-₹{amt.toLocaleString()})</div>
                        <div>{dst?.icon} {dst?.name}: ₹{dstCurr.toLocaleString()} → <span style={{ color: '#10b981', fontWeight: 700 }}>₹{(dstCurr + amt).toLocaleString()}</span> (+₹{amt.toLocaleString()})</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>✨ Net change to total planned budget: <strong>₹0 (Preserved)</strong></div>
                      </div>
                    );
                  })()}
                  {reallocateForm.source_type === 'buffer' && (() => {
                    const dst = categories.find(c => String(c.id) === String(reallocateForm.destination_category_id));
                    const amt = parseFloat(reallocateForm.amount) || 0;
                    const dstCurr = editingBudgets[dst?.id] !== undefined ? editingBudgets[dst?.id] : (dst?.monthly_limit || 0);

                    return (
                      <div>
                        <div>🛡️ Emergency Buffer: ₹{availableBuffer.toLocaleString()} → <span style={{ color: '#ef4444', fontWeight: 700 }}>₹{Math.max(0, availableBuffer - amt).toLocaleString()}</span> (-₹{amt.toLocaleString()})</div>
                        <div>{dst?.icon} {dst?.name}: ₹{dstCurr.toLocaleString()} → <span style={{ color: '#10b981', fontWeight: 700 }}>₹{(dstCurr + amt).toLocaleString()}</span> (+₹{amt.toLocaleString()})</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>✨ Deducted from dedicated buffer; does not increase income.</div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowReallocateModal(false)}
                  style={{ flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid var(--card-border)', background: 'var(--bg-main)', color: 'var(--text-dark)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reallocating}
                  className="btn-pill-coral"
                  style={{ flex: 1, padding: '10px', background: '#0ea5e9', borderColor: '#0ea5e9' }}
                >
                  {reallocating ? 'Processing...' : 'Confirm Reallocation 🔄'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT CATEGORY CONFIGURATION MODAL --- */}
      {editingCategory && (
        <div className="modal-backdrop">
          <div className="card-soft modal-card" style={{ maxWidth: '480px', width: '90%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-dark)', fontSize: '18px' }}>
                ⚙️ Configure {editingCategory.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCategoryConfig}>
              <div className="form-group">
                <label className="form-label">Category Name *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={editCategoryForm.name}
                  onChange={(e) => setEditCategoryForm({ ...editCategoryForm, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Icon</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editCategoryForm.icon}
                    onChange={(e) => setEditCategoryForm({ ...editCategoryForm, icon: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Color</label>
                  <input
                    type="color"
                    className="form-input"
                    style={{ height: '42px', padding: '2px 4px' }}
                    value={editCategoryForm.color}
                    onChange={(e) => setEditCategoryForm({ ...editCategoryForm, color: e.target.value })}
                  />
                </div>
              </div>

              {/* Spending Pattern / Frequency Selection */}
              <div className="form-group">
                <label className="form-label">Spending Frequency & Pattern</label>
                <select
                  className="form-input"
                  value={editCategoryForm.frequency}
                  onChange={(e) => setEditCategoryForm({ ...editCategoryForm, frequency: e.target.value })}
                >
                  <option value="daily">☀️ Daily (Frequent expenses like coffee, snacks, transport)</option>
                  <option value="weekly">📅 Weekly</option>
                  <option value="monthly">🗓️ Monthly (Regular recurring bills)</option>
                  <option value="occasional">🎯 Occasional / Irregular (Groceries, medical, electronics, gifts)</option>
                </select>
              </div>

              {editCategoryForm.frequency === 'daily' && (
                <div className="form-group" style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                  <label className="form-label" style={{ color: '#f59e0b', fontWeight: 700 }}>Daily Spending Limit (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    className="form-input"
                    value={editCategoryForm.daily_limit}
                    onChange={(e) => setEditCategoryForm({ ...editCategoryForm, daily_limit: e.target.value })}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                    Resets automatically at calendar midnight while preserving monthly spending.
                  </small>
                </div>
              )}

              {editCategoryForm.frequency === 'occasional' && (
                <div style={{ background: 'rgba(168, 85, 247, 0.08)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.25)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ color: '#a855f7', fontWeight: 700 }}>Expected Frequency (Optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 2 times a month, As needed"
                      value={editCategoryForm.expected_frequency}
                      onChange={(e) => setEditCategoryForm({ ...editCategoryForm, expected_frequency: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ color: '#a855f7', fontWeight: 700 }}>Spending Limit per Transaction (₹) (Optional)</label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      className="form-input"
                      placeholder="Optional per-purchase cap"
                      value={editCategoryForm.transaction_limit}
                      onChange={(e) => setEditCategoryForm({ ...editCategoryForm, transaction_limit: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="form-group" style={{ marginTop: '14px' }}>
                <label className="form-label">Priority Designation</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setEditCategoryForm({ ...editCategoryForm, is_essential: true })}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '10px',
                      border: editCategoryForm.is_essential ? '2px solid #10b981' : '1px solid var(--card-border)',
                      background: editCategoryForm.is_essential ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-main)',
                      color: editCategoryForm.is_essential ? '#10b981' : 'var(--text-muted)',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    🛡️ Essential
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditCategoryForm({ ...editCategoryForm, is_essential: false })}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '10px',
                      border: !editCategoryForm.is_essential ? '2px solid #f59e0b' : '1px solid var(--card-border)',
                      background: !editCategoryForm.is_essential ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-main)',
                      color: !editCategoryForm.is_essential ? '#f59e0b' : 'var(--text-muted)',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ✨ Discretionary
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  style={{ flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid var(--card-border)', background: 'var(--bg-main)', color: 'var(--text-dark)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-pill-coral"
                  style={{ flex: 1, padding: '10px' }}
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

