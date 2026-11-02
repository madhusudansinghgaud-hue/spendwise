import { useState, useEffect } from 'react';
import { expensesApi, incomeApi, investmentsApi, categoriesApi } from '../api';
import toast from 'react-hot-toast';
import SpendingAlertModal from '../components/SpendingAlertModal';

export default function Transactions() {
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'expenses', 'income', 'investments'
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [showAddInvestment, setShowAddInvestment] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);

  // Smart Spending Alert State
  const [spendingAlertData, setSpendingAlertData] = useState(null);
  const [showSpendingAlertModal, setShowSpendingAlertModal] = useState(false);
  const [pendingExpensePayload, setPendingExpensePayload] = useState(null);


  // Form states
  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    category_id: '',
    description: '',
    merchant: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [incomeForm, setIncomeForm] = useState({
    amount: '',
    source: 'Salary',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [investmentForm, setInvestmentForm] = useState({
    amount: '',
    name: '',
    category: 'Mutual Funds SIP',
    notes: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [smsText, setSmsText] = useState('');
  const [smsParsing, setSmsParsing] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [expRes, incRes, invRes, catRes] = await Promise.all([
        expensesApi.getAll({ limit: 100 }),
        incomeApi.getAll(),
        investmentsApi.getEntries(),
        categoriesApi.getAll()
      ]);
      setExpenses(expRes.data || []);
      setIncomes(incRes.data?.items || []);
      setInvestments(invRes.data?.items || []);
      setCategories(catRes.data || []);
      if (catRes.data?.length > 0 && !expenseForm.category_id) {
        setExpenseForm(prev => ({ ...prev, category_id: catRes.data[0].id }));
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load transaction data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [submittingIncome, setSubmittingIncome] = useState(false);
  const [submittingInvestment, setSubmittingInvestment] = useState(false);

  // Reset helper
  const resetExpenseForm = () => {
    setExpenseForm({
      amount: '',
      category_id: categories[0]?.id || '',
      description: '',
      merchant: '',
      date: new Date().toISOString().split('T')[0]
    });
  };

  // Submit Expense with Pre-flight Check
  const handleCreateExpense = async (e) => {
    e.preventDefault();
    if (submittingExpense) return;
    const amountNum = parseFloat(expenseForm.amount);
    if (!expenseForm.amount || isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a positive expense amount');
      return;
    }
    if (!expenseForm.category_id) {
      toast.error('Please select a valid category');
      return;
    }

    const payload = {
      amount: amountNum,
      category_id: parseInt(expenseForm.category_id),
      description: expenseForm.description?.trim() || '',
      merchant: expenseForm.merchant?.trim() || '',
      date: expenseForm.date ? new Date(expenseForm.date).toISOString() : null
    };

    try {
      setSubmittingExpense(true);

      // Pre-flight check limit (Daily & Monthly)
      const checkRes = await expensesApi.checkLimit({
        amount: amountNum,
        category_id: payload.category_id,
        date: payload.date
      });

      if (checkRes.data?.exceeded) {
        setPendingExpensePayload(payload);
        setSpendingAlertData(checkRes.data);
        setShowSpendingAlertModal(true);
        setSubmittingExpense(false);
        return;
      }

      // If within limits, record directly
      await expensesApi.create(payload);
      toast.success('Expense recorded successfully! 💸');
      setShowAddExpense(false);
      resetExpenseForm();
      await fetchData();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.detail || err.message || 'Failed to save expense';
      toast.error(msg);
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Confirm With Reallocation (Option 1 or Option 2)
  const handleConfirmWithReallocation = async (reallocation) => {
    if (!pendingExpensePayload) return;
    try {
      setSubmittingExpense(true);
      await expensesApi.create({
        ...pendingExpensePayload,
        reallocation
      });
      toast.success('Budget reallocated & expense saved! 💸');
      setShowSpendingAlertModal(false);
      setShowAddExpense(false);
      setSpendingAlertData(null);
      setPendingExpensePayload(null);
      resetExpenseForm();
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to execute budget reallocation');
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Confirm Over-Budget (Option 4)
  const handleConfirmOverBudget = async () => {
    if (!pendingExpensePayload) return;
    try {
      setSubmittingExpense(true);
      await expensesApi.create({
        ...pendingExpensePayload,
        accept_over_budget: true
      });
      toast('Expense saved with Over-Budget status ⚠️', { icon: '⚠️' });
      setShowSpendingAlertModal(false);
      setShowAddExpense(false);
      setSpendingAlertData(null);
      setPendingExpensePayload(null);
      resetExpenseForm();
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save over-budget expense');
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Reduce Expense Amount (Option 3)
  const handleUpdateExpenseAmount = async (newAmount) => {
    setExpenseForm(prev => ({ ...prev, amount: String(newAmount) }));
    if (!pendingExpensePayload) return;
    try {
      setSubmittingExpense(true);
      const updatedPayload = { ...pendingExpensePayload, amount: newAmount };
      const checkRes = await expensesApi.checkLimit({
        amount: newAmount,
        category_id: updatedPayload.category_id,
        date: updatedPayload.date
      });
      if (checkRes.data?.exceeded) {
        setPendingExpensePayload(updatedPayload);
        setSpendingAlertData(checkRes.data);
      } else {
        // Now fits inside budget!
        await expensesApi.create(updatedPayload);
        toast.success(`Expense of ₹${newAmount.toLocaleString()} saved within budget! 💸`);
        setShowSpendingAlertModal(false);
        setShowAddExpense(false);
        setSpendingAlertData(null);
        setPendingExpensePayload(null);
        resetExpenseForm();
        await fetchData();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update expense amount');
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Cancel Warning (Do Not Save)
  const handleCancelAlert = () => {
    setShowSpendingAlertModal(false);
    setSpendingAlertData(null);
    setPendingExpensePayload(null);
    toast('Transaction cancelled — no budget modified', { icon: 'ℹ️' });
  };


  // Submit Income
  const handleCreateIncome = async (e) => {
    e.preventDefault();
    if (submittingIncome) return;
    const amountNum = parseFloat(incomeForm.amount);
    if (!incomeForm.amount || isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid positive income amount');
      return;
    }
    try {
      setSubmittingIncome(true);
      await incomeApi.create({
        amount: amountNum,
        source: incomeForm.source,
        description: incomeForm.description?.trim() || '',
        date: incomeForm.date
      });
      toast.success('Income recorded successfully! 💰');
      setShowAddIncome(false);
      setIncomeForm({
        amount: '',
        source: 'Salary',
        description: '',
        date: new Date().toISOString().split('T')[0]
      });
      await fetchData();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.detail || err.message || 'Failed to save income';
      toast.error(msg);
    } finally {
      setSubmittingIncome(false);
    }
  };


  // Submit Investment
  const handleCreateInvestment = async (e) => {
    e.preventDefault();
    if (submittingInvestment) return;
    const amountNum = parseFloat(investmentForm.amount);
    if (!investmentForm.amount || isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid positive investment amount');
      return;
    }
    if (!investmentForm.name.trim()) {
      toast.error('Please provide investment name/plan');
      return;
    }
    try {
      setSubmittingInvestment(true);
      await investmentsApi.createEntry({
        amount: amountNum,
        name: investmentForm.name.trim(),
        category: investmentForm.category,
        notes: investmentForm.notes?.trim() || '',
        date: investmentForm.date
      });
      toast.success('Investment logged successfully! 🎯');
      setShowAddInvestment(false);
      setInvestmentForm({
        amount: '',
        name: '',
        category: 'Mutual Funds SIP',
        notes: '',
        date: new Date().toISOString().split('T')[0]
      });
      await fetchData();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.detail || err.message || 'Failed to save investment';
      toast.error(msg);
    } finally {
      setSubmittingInvestment(false);
    }
  };


  // Submit SMS parser
  const handleParseSms = async (e) => {
    e.preventDefault();
    if (!smsText.trim()) return;
    try {
      setSmsParsing(true);
      const res = await expensesApi.parseSms(smsText);
      const parsed = res.data;
      if (parsed.amount) {
        toast.success(`Parsed ₹${parsed.amount} from SMS!`);
        setExpenseForm({
          amount: parsed.amount.toString(),
          category_id: parsed.category_id || (categories[0]?.id || ''),
          description: parsed.description || '',
          merchant: parsed.merchant || '',
          date: new Date().toISOString().split('T')[0]
        });
        setShowSmsModal(false);
        setShowAddExpense(true);
      } else {
        toast.error('Could not extract expense info from text');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to parse SMS');
    } finally {
      setSmsParsing(false);
    }
  };

  // Delete handlers
  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await expensesApi.delete(id);
      toast.success('Expense removed');
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete expense');
    }
  };

  const handleDeleteIncome = async (id) => {
    if (!window.confirm('Delete this income entry?')) return;
    try {
      await incomeApi.delete(id);
      toast.success('Income entry removed');
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete income');
    }
  };

  const handleDeleteInvestment = async (id) => {
    if (!window.confirm('Delete this investment entry?')) return;
    try {
      await investmentsApi.deleteEntry(id);
      toast.success('Investment entry removed');
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete investment');
    }
  };

  // Compile Unified Transactions List
  const unifiedList = [];

  expenses.forEach(e => {
    unifiedList.push({
      id: `exp-${e.id}`,
      rawId: e.id,
      type: 'expense',
      title: e.description || e.merchant || e.category_name || 'Expense',
      subtext: e.merchant ? `Merchant: ${e.merchant}` : (e.notes || 'Manual entry'),
      category: e.category_name || 'General',
      icon: e.category_icon || '💸',
      color: e.category_color || '#ef4444',
      amount: e.amount,
      date: e.date,
      paymentMode: e.source === 'sms_auto' ? 'Auto-SMS' : (e.upi_ref ? 'UPI' : 'Manual'),
      is_over_budget: e.is_over_budget,
      over_budget_type: e.over_budget_type,
      reallocation_note: e.reallocation_note
    });
  });

  incomes.forEach(i => {
    unifiedList.push({
      id: `inc-${i.id}`,
      rawId: i.id,
      type: 'income',
      title: i.source || 'Income',
      subtext: i.description || 'Income received',
      category: i.source || 'Salary',
      icon: '💰',
      color: '#10b981',
      amount: i.amount,
      date: i.date,
      paymentMode: 'Direct Credit'
    });
  });

  investments.forEach(inv => {
    unifiedList.push({
      id: `inv-${inv.id}`,
      rawId: inv.id,
      type: 'investment',
      title: inv.name || 'Investment',
      subtext: inv.notes || inv.category || 'Asset Allocation',
      category: inv.category || 'Investment',
      icon: '🎯',
      color: '#6366f1',
      amount: inv.amount,
      date: inv.date,
      paymentMode: inv.category || 'Portfolio'
    });
  });

  unifiedList.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Filter by tab and search
  const filteredList = unifiedList.filter(item => {
    const matchesTab = 
      activeTab === 'all' ? true :
      activeTab === 'expenses' ? item.type === 'expense' :
      activeTab === 'income' ? item.type === 'income' :
      activeTab === 'investments' ? item.type === 'investment' : true;

    const matchesSearch = 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subtext.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesTab && matchesSearch;
  });

  // Calculate totals
  const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalInvestments = investments.reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div className="page-container">
      {/* Header Row */}
      <div className="page-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title">💳 Transactions Hub</h1>
          <p className="page-subtitle">Add and manage all your Incomes, Expenses, and Investments in one place</p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            type="button" 
            className="btn-pill-coral" 
            onClick={() => setShowAddExpense(true)}
          >
            + Add Expense
          </button>
          <button 
            type="button" 
            className="btn-pill-green" 
            onClick={() => setShowAddIncome(true)}
            style={{
              background: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '24px',
              padding: '10px 18px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            + Add Income
          </button>
          <button 
            type="button" 
            className="btn-pill-navy" 
            onClick={() => setShowAddInvestment(true)}
            style={{
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: '24px',
              padding: '10px 18px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            + Add Investment
          </button>
          <button 
            type="button" 
            onClick={() => setShowSmsModal(true)}
            style={{
              background: 'var(--card-bg)',
              color: 'var(--text-dark)',
              border: '1px solid var(--card-border)',
              borderRadius: '24px',
              padding: '10px 14px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Paste bank SMS to auto-parse"
          >
            ⚡ Paste SMS
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px',
        margin: '20px 0'
      }}>
        <div className="card-soft" style={{ padding: '16px', borderLeft: '4px solid #10b981' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL INCOME LOGGED</span>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
            +₹{totalIncome.toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{incomes.length} records</span>
        </div>

        <div className="card-soft" style={{ padding: '16px', borderLeft: '4px solid #ef4444' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL EXPENSES LOGGED</span>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#ef4444', marginTop: '4px' }}>
            -₹{totalExpenses.toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{expenses.length} records</span>
        </div>

        <div className="card-soft" style={{ padding: '16px', borderLeft: '4px solid #6366f1' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL INVESTMENTS LOGGED</span>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#6366f1', marginTop: '4px' }}>
            ₹{totalInvestments.toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{investments.length} records</span>
        </div>

        <div className="card-soft" style={{ padding: '16px', borderLeft: '4px solid #f59e0b' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>NET REMAINING</span>
          <div style={{
            fontSize: '22px',
            fontWeight: 800,
            color: (totalIncome - totalExpenses - totalInvestments) >= 0 ? '#10b981' : '#ef4444',
            marginTop: '4px'
          }}>
            ₹{(totalIncome - totalExpenses - totalInvestments).toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Income - Expenses - Investments</span>
        </div>
      </div>

      {/* Filter Tabs and Search Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px'
      }}>
        {/* Tabs */}
        <div style={{
          display: 'flex',
          background: 'var(--card-bg)',
          borderRadius: '30px',
          padding: '4px',
          border: '1px solid var(--card-border)'
        }}>
          {[
            { id: 'all', label: `All (${unifiedList.length})` },
            { id: 'expenses', label: `💸 Expenses (${expenses.length})` },
            { id: 'income', label: `💰 Income (${incomes.length})` },
            { id: 'investments', label: `🎯 Investments (${investments.length})` }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                border: 'none',
                background: activeTab === tab.id ? 'var(--coral-accent)' : 'transparent',
                color: activeTab === tab.id ? '#fff' : 'var(--text-dark)',
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ minWidth: '240px' }}>
          <input
            type="text"
            placeholder="Search by title, merchant, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 14px',
              borderRadius: '20px',
              border: '1px solid var(--card-border)',
              background: 'var(--card-bg)',
              color: 'var(--text-dark)',
              fontSize: '13px'
            }}
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="card-soft" style={{ overflowX: 'auto', padding: '0' }}>
        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '14px 16px', textAlign: 'left' }}>Type</th>
              <th style={{ padding: '14px 16px', textAlign: 'left' }}>Title / Description</th>
              <th style={{ padding: '14px 16px', textAlign: 'left' }}>Category / Source</th>
              <th style={{ padding: '14px 16px', textAlign: 'left' }}>Date</th>
              <th style={{ padding: '14px 16px', textAlign: 'right' }}>Amount</th>
              <th style={{ padding: '14px 16px', textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  Loading transactions...
                </td>
              </tr>
            ) : filteredList.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No transactions found matching your criteria. Click "+ Add Expense", "+ Add Income", or "+ Add Investment" above.
                </td>
              </tr>
            ) : (
              filteredList.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                  {/* Type Badge */}
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      background: 
                        item.type === 'income' ? 'rgba(16, 185, 129, 0.15)' :
                        item.type === 'expense' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                      color:
                        item.type === 'income' ? '#10b981' :
                        item.type === 'expense' ? '#ef4444' : '#6366f1'
                    }}>
                      {item.icon} {item.type}
                    </span>
                  </td>

                  {/* Title & Subtext */}
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-dark)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span>{item.title}</span>
                      {item.is_over_budget && (
                        <span style={{
                          fontSize: '11px',
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          fontWeight: 700
                        }}>
                          ⚠️ Over Budget ({item.over_budget_type})
                        </span>
                      )}
                      {item.reallocation_note && (
                        <span style={{
                          fontSize: '11px',
                          background: 'rgba(99, 102, 241, 0.15)',
                          color: '#818cf8',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          fontWeight: 600
                        }}>
                          🔄 {item.reallocation_note}
                        </span>
                      )}
                    </div>
                    {item.subtext && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {item.subtext}
                      </div>
                    )}
                  </td>

                  {/* Category / Source */}
                  <td style={{ padding: '12px 16px', color: 'var(--text-dark)', fontSize: '13px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '8px',
                      background: 'var(--bg-main)',
                      border: '1px solid var(--card-border)',
                      fontSize: '12px',
                      fontWeight: 500
                    }}>
                      {item.category}
                    </span>
                  </td>

                  {/* Date */}
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    {new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>

                  {/* Amount */}
                  <td style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontWeight: 700,
                    fontSize: '15px',
                    color: 
                      item.type === 'income' ? '#10b981' :
                      item.type === 'expense' ? '#ef4444' : '#6366f1'
                  }}>
                    {item.type === 'income' ? '+' : item.type === 'expense' ? '-' : ''}
                    ₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                  </td>

                  {/* Action */}
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (item.type === 'expense') handleDeleteExpense(item.rawId);
                        else if (item.type === 'income') handleDeleteIncome(item.rawId);
                        else if (item.type === 'investment') handleDeleteInvestment(item.rawId);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: '4px'
                      }}
                      title="Delete record"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* --- ADD EXPENSE MODAL --- */}
      {showAddExpense && (
        <div className="modal-backdrop">
          <div className="card-soft modal-card" style={{ maxWidth: '440px', width: '90%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-dark)', fontSize: '18px' }}>💸 Log New Expense</h3>
              <button 
                type="button" 
                onClick={() => setShowAddExpense(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateExpense}>
              <div className="form-group">
                <label className="form-label">Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  placeholder="e.g. 450"
                  required
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category *</label>
                <select
                  className="form-input"
                  required
                  value={expenseForm.category_id}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })}
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Dinner with friends"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Merchant / Vendor</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Swiggy, Blinkit, Chai Point"
                  value={expenseForm.merchant}
                  onChange={(e) => setExpenseForm({ ...expenseForm, merchant: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddExpense(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '12px',
                    border: '1px solid var(--card-border)',
                    background: 'var(--bg-main)',
                    color: 'var(--text-dark)',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-pill-coral"
                  style={{ flex: 1, padding: '10px', opacity: submittingExpense ? 0.7 : 1, cursor: submittingExpense ? 'not-allowed' : 'pointer' }}
                  disabled={submittingExpense}
                >
                  {submittingExpense ? 'Recording...' : 'Record Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD INCOME MODAL --- */}
      {showAddIncome && (
        <div className="modal-backdrop">
          <div className="card-soft modal-card" style={{ maxWidth: '440px', width: '90%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-dark)', fontSize: '18px' }}>💰 Record Income Received</h3>
              <button 
                type="button" 
                onClick={() => setShowAddIncome(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateIncome}>
              <div className="form-group">
                <label className="form-label">Income Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  placeholder="e.g. 50000"
                  required
                  value={incomeForm.amount}
                  onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Source / Type</label>
                <select
                  className="form-input"
                  value={incomeForm.source}
                  onChange={(e) => setIncomeForm({ ...incomeForm, source: e.target.value })}
                >
                  <option value="Salary">💼 Monthly Salary</option>
                  <option value="Freelance">💻 Freelance / Contract</option>
                  <option value="Business">🏪 Business / Sales</option>
                  <option value="Investment Returns">📈 Investment Dividends / Profit</option>
                  <option value="Rental">🏠 Rental Income</option>
                  <option value="Bonus">🎁 Bonus / Gift</option>
                  <option value="Other">💵 Other Income</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description / Notes</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. October Salary credited"
                  value={incomeForm.description}
                  onChange={(e) => setIncomeForm({ ...incomeForm, description: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Date Received</label>
                <input
                  type="date"
                  className="form-input"
                  value={incomeForm.date}
                  onChange={(e) => setIncomeForm({ ...incomeForm, date: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddIncome(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '12px',
                    border: '1px solid var(--card-border)',
                    background: 'var(--bg-main)',
                    color: 'var(--text-dark)',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingIncome}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '12px',
                    border: 'none',
                    background: '#10b981',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: submittingIncome ? 'not-allowed' : 'pointer',
                    opacity: submittingIncome ? 0.7 : 1
                  }}
                >
                  {submittingIncome ? 'Saving...' : 'Save Income'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD INVESTMENT MODAL --- */}
      {showAddInvestment && (
        <div className="modal-backdrop">
          <div className="card-soft modal-card" style={{ maxWidth: '440px', width: '90%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-dark)', fontSize: '18px' }}>🎯 Log Investment Entry</h3>
              <button 
                type="button" 
                onClick={() => setShowAddInvestment(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateInvestment}>
              <div className="form-group">
                <label className="form-label">Investment Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  placeholder="e.g. 10000"
                  required
                  value={investmentForm.amount}
                  onChange={(e) => setInvestmentForm({ ...investmentForm, amount: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Asset / Plan Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Nifty 50 Index Fund, PPF, Sovereign Gold"
                  required
                  value={investmentForm.name}
                  onChange={(e) => setInvestmentForm({ ...investmentForm, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Investment Category</label>
                <select
                  className="form-input"
                  value={investmentForm.category}
                  onChange={(e) => setInvestmentForm({ ...investmentForm, category: e.target.value })}
                >
                  <option value="Mutual Funds SIP">Mutual Funds (SIP)</option>
                  <option value="Direct Stocks">Direct Equity / Stocks</option>
                  <option value="Fixed Deposit (FD)">Fixed Deposit (FD)</option>
                  <option value="Public Provident Fund (PPF)">PPF / EPF</option>
                  <option value="Gold & Commodities">Gold / Sovereign Gold Bonds</option>
                  <option value="Real Estate">Real Estate / REITs</option>
                  <option value="Crypto">Crypto Assets</option>
                  <option value="Other">Other Investment</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={investmentForm.date}
                  onChange={(e) => setInvestmentForm({ ...investmentForm, date: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Monthly auto-debit"
                  value={investmentForm.notes}
                  onChange={(e) => setInvestmentForm({ ...investmentForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddInvestment(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '12px',
                    border: '1px solid var(--card-border)',
                    background: 'var(--bg-main)',
                    color: 'var(--text-dark)',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingInvestment}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '12px',
                    border: 'none',
                    background: '#6366f1',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: submittingInvestment ? 'not-allowed' : 'pointer',
                    opacity: submittingInvestment ? 0.7 : 1
                  }}
                >
                  {submittingInvestment ? 'Logging...' : 'Log Investment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- PASTE SMS MODAL --- */}
      {showSmsModal && (
        <div className="modal-backdrop">
          <div className="card-soft modal-card" style={{ maxWidth: '440px', width: '90%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-dark)', fontSize: '18px' }}>⚡ Auto-Parse Bank SMS</h3>
              <button 
                type="button" 
                onClick={() => setShowSmsModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleParseSms}>
              <div className="form-group">
                <label className="form-label">Paste Raw Bank / UPI SMS</label>
                <textarea
                  className="form-input form-textarea"
                  rows="4"
                  placeholder="e.g. Sent Rs.450.00 from HDFC Bank to BLINKIT via UPI on 08-Oct-26..."
                  required
                  value={smsText}
                  onChange={(e) => setSmsText(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setShowSmsModal(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '12px',
                    border: '1px solid var(--card-border)',
                    background: 'var(--bg-main)',
                    color: 'var(--text-dark)',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-pill-coral"
                  style={{ flex: 1, padding: '10px' }}
                  disabled={smsParsing}
                >
                  {smsParsing ? 'Analyzing...' : 'Parse & Pre-fill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Smart Spending Alert & Warning Modal */}
      <SpendingAlertModal
        isOpen={showSpendingAlertModal}
        alertData={spendingAlertData}
        expensePayload={pendingExpensePayload}
        onConfirmWithReallocation={handleConfirmWithReallocation}
        onConfirmOverBudget={handleConfirmOverBudget}
        onUpdateExpenseAmount={handleUpdateExpenseAmount}
        onCancel={handleCancelAlert}
        loading={submittingExpense}
      />
    </div>
  );
}
