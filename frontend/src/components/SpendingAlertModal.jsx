import React, { useState } from 'react';

export default function SpendingAlertModal({
  isOpen,
  alertData,
  expensePayload,
  onConfirmWithReallocation,
  onConfirmOverBudget,
  onUpdateExpenseAmount,
  onCancel,
  loading = false
}) {
  if (!isOpen || !alertData) return null;

  const [activeOption, setActiveOption] = useState('category'); // 'category', 'buffer', 'reduce', 'proceed'
  const [selectedSourceCatId, setSelectedSourceCatId] = useState(
    alertData.eligible_transfer_categories?.[0]?.id || ''
  );
  const [transferAmount, setTransferAmount] = useState(
    alertData.monthly_excess > 0 ? alertData.monthly_excess : alertData.daily_excess || 0
  );
  const [adjustedExpenseAmount, setAdjustedExpenseAmount] = useState(expensePayload?.amount || '');

  const {
    category_name,
    category_icon,
    exceeded_daily,
    daily_limit,
    daily_spent,
    daily_remaining,
    daily_excess,
    exceeded_monthly,
    monthly_budget,
    monthly_spent,
    monthly_remaining,
    monthly_excess,
    available_buffer,
    eligible_transfer_categories = []
  } = alertData;

  const selectedSourceCat = eligible_transfer_categories.find(
    (c) => String(c.id) === String(selectedSourceCatId)
  );

  const neededExcess = monthly_excess > 0 ? monthly_excess : daily_excess;

  // Handlers
  const handleExecuteTransfer = () => {
    if (!selectedSourceCat) return;
    const amt = parseFloat(transferAmount) || neededExcess;
    onConfirmWithReallocation({
      source_type: 'category',
      source_category_id: parseInt(selectedSourceCatId),
      amount: amt,
      reason: `Transfer to cover ${category_name} budget`
    });
  };

  const handleExecuteBuffer = () => {
    const amt = parseFloat(transferAmount) || neededExcess;
    onConfirmWithReallocation({
      source_type: 'buffer',
      source_category_id: null,
      amount: Math.min(amt, available_buffer),
      reason: `Emergency Buffer used for ${category_name}`
    });
  };

  const handleApplyReducedAmount = () => {
    const num = parseFloat(adjustedExpenseAmount);
    if (!num || num <= 0) return;
    onUpdateExpenseAmount(num);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 15, 29, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px'
      }}
    >
      <div
        style={{
          background: 'var(--card-bg, #1a2236)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '560px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(239, 68, 68, 0.2)',
          color: 'var(--text-dark, #f1f5f9)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
      >
        {/* Header with Alert Glow */}
        <div
          style={{
            padding: '20px 24px',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.05) 100%)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>⚠️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f87171' }}>
                Budget Limit Exceeded
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '13px', opacity: 0.8 }}>
                Review before recording ₹{expensePayload?.amount} for {category_icon} {category_name}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px 8px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Over-Limit Explanation Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {exceeded_daily && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '14px',
                  padding: '12px 16px',
                  fontSize: '13px',
                  lineHeight: 1.5
                }}
              >
                <strong style={{ color: '#f87171' }}>⏰ Daily Limit Exceeded:</strong>
                <br />
                You have <strong>₹{daily_remaining.toLocaleString()}</strong> remaining in today's {category_name} allowance (Limit: ₹{daily_limit.toLocaleString()}, Spent today: ₹{daily_spent.toLocaleString()}).
                This expense will exceed your daily limit by <span style={{ color: '#ef4444', fontWeight: 700 }}>₹{daily_excess.toLocaleString()}</span>.
              </div>
            )}

            {exceeded_monthly && (
              <div
                style={{
                  background: 'rgba(249, 115, 22, 0.1)',
                  border: '1px solid rgba(249, 115, 22, 0.3)',
                  borderRadius: '14px',
                  padding: '12px 16px',
                  fontSize: '13px',
                  lineHeight: 1.5
                }}
              >
                <strong style={{ color: '#fb923c' }}>📅 Monthly Budget Exceeded:</strong>
                <br />
                You have <strong>₹{monthly_remaining.toLocaleString()}</strong> remaining in your monthly {category_name} budget (Limit: ₹{monthly_budget.toLocaleString()}, Spent this month: ₹{monthly_spent.toLocaleString()}).
                This expense will exceed your monthly budget by <span style={{ color: '#f97316', fontWeight: 700 }}>₹{monthly_excess.toLocaleString()}</span>.
              </div>
            )}
          </div>

          {/* Quick Metrics Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '14px',
              padding: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>Expense</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9' }}>₹{expensePayload?.amount?.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>Overage</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ef4444' }}>+₹{neededExcess?.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>Avail Buffer</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#38bdf8' }}>₹{available_buffer?.toLocaleString()}</div>
            </div>
          </div>

          {/* Options Navigation Tabs */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted, #94a3b8)' }}>
              Choose Resolution Strategy:
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '6px',
                background: 'rgba(0,0,0,0.2)',
                padding: '4px',
                borderRadius: '12px'
              }}
            >
              {[
                { id: 'category', label: '1. Transfer', icon: '🔄' },
                { id: 'buffer', label: '2. Buffer', icon: '🛡️' },
                { id: 'reduce', label: '3. Reduce', icon: '✂️' },
                { id: 'proceed', label: '4. Over-Budget', icon: '⚠️' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setActiveOption(opt.id)}
                  style={{
                    padding: '8px 4px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    background: activeOption === opt.id ? 'var(--primary-color, #6366f1)' : 'transparent',
                    color: activeOption === opt.id ? '#fff' : 'var(--text-muted, #94a3b8)',
                    transition: 'all 0.2s'
                  }}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Option 1: Transfer from Another Category */}
          {activeOption === 'category' && (
            <div
              style={{
                background: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#818cf8' }}>
                Option 1: Transfer from Another Category
              </div>
              <p style={{ margin: 0, fontSize: '12px', opacity: 0.85 }}>
                Move funds between category budgets without increasing your total planned budget.
              </p>

              {eligible_transfer_categories.length === 0 ? (
                <div style={{ color: '#ef4444', fontSize: '13px' }}>
                  No other categories currently have surplus budget available to transfer. Please use Emergency Buffer or accept over-budget.
                </div>
              ) : (
                <>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                      Select Source Category (with available funds):
                    </label>
                    <select
                      value={selectedSourceCatId}
                      onChange={(e) => setSelectedSourceCatId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#f1f5f9',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    >
                      {eligible_transfer_categories.map((c) => (
                        <option key={c.id} value={c.id} style={{ background: '#1e293b' }}>
                          {c.icon} {c.name} (₹{c.available.toLocaleString()} available to transfer)
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedSourceCat && (
                    <div
                      style={{
                        fontSize: '12px',
                        background: 'rgba(0,0,0,0.2)',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        lineHeight: 1.6
                      }}
                    >
                      <div>
                        <strong>{selectedSourceCat.icon} {selectedSourceCat.name}:</strong> ₹{selectedSourceCat.monthly_budget.toLocaleString()} →{' '}
                        <span style={{ color: '#f87171' }}>
                          ₹{Math.max(0, selectedSourceCat.monthly_budget - (parseFloat(transferAmount) || neededExcess)).toLocaleString()}
                        </span>{' '}
                        (-₹{(parseFloat(transferAmount) || neededExcess).toLocaleString()})
                      </div>
                      <div>
                        <strong>{category_icon} {category_name}:</strong> ₹{monthly_budget.toLocaleString()} →{' '}
                        <span style={{ color: '#4ade80' }}>
                          ₹{(monthly_budget + (parseFloat(transferAmount) || neededExcess)).toLocaleString()}
                        </span>{' '}
                        (+₹{(parseFloat(transferAmount) || neededExcess).toLocaleString()})
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleExecuteTransfer}
                    disabled={loading || !selectedSourceCat}
                    style={{
                      background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                      color: '#fff',
                      border: 'none',
                      padding: '12px',
                      borderRadius: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)'
                    }}
                  >
                    {loading ? 'Reallocating & Saving...' : `Confirm Reallocation of ₹${(parseFloat(transferAmount) || neededExcess).toLocaleString()} & Record Expense`}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Option 2: Use Emergency Buffer */}
          {activeOption === 'buffer' && (
            <div
              style={{
                background: 'rgba(14, 165, 233, 0.08)',
                border: '1px solid rgba(14, 165, 233, 0.25)',
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#38bdf8' }}>
                Option 2: Cover with Emergency Buffer
              </div>
              <p style={{ margin: 0, fontSize: '12px', opacity: 0.85 }}>
                Use your dedicated free-cash buffer to cover this expense without increasing income.
              </p>

              <div
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '13px'
                }}
              >
                <div>Available Emergency Buffer: <strong>₹{available_buffer.toLocaleString()}</strong></div>
                <div>Amount to Cover: <strong style={{ color: '#38bdf8' }}>₹{neededExcess.toLocaleString()}</strong></div>
                <div>Buffer Remaining After: <strong>₹{Math.max(0, available_buffer - neededExcess).toLocaleString()}</strong></div>
              </div>

              {available_buffer < neededExcess && (
                <div style={{ color: '#fb923c', fontSize: '12px' }}>
                  ⚠️ Buffer will cover ₹{available_buffer.toLocaleString()}; remaining shortfall of ₹{(neededExcess - available_buffer).toLocaleString()} will remain.
                </div>
              )}

              <button
                onClick={handleExecuteBuffer}
                disabled={loading || available_buffer <= 0}
                style={{
                  background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                  color: '#fff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '12px',
                  fontWeight: 600,
                  cursor: available_buffer > 0 ? 'pointer' : 'not-allowed',
                  opacity: available_buffer > 0 ? 1 : 0.5,
                  boxShadow: '0 4px 12px rgba(14, 165, 233, 0.4)'
                }}
              >
                {loading ? 'Processing...' : `Cover ₹${Math.min(neededExcess, available_buffer).toLocaleString()} via Buffer & Save Expense`}
              </button>
            </div>
          )}

          {/* Option 3: Reduce the Expense */}
          {activeOption === 'reduce' && (
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#4ade80' }}>
                Option 3: Reduce Expense Amount
              </div>
              <p style={{ margin: 0, fontSize: '12px', opacity: 0.85 }}>
                Adjust the expense amount so that it stays within your remaining available allowance (₹{Math.max(0, daily_remaining || monthly_remaining).toLocaleString()} remaining).
              </p>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                  New Expense Amount (₹):
                </label>
                <input
                  type="number"
                  step="any"
                  value={adjustedExpenseAmount}
                  onChange={(e) => setAdjustedExpenseAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#f1f5f9',
                    fontSize: '15px',
                    outline: 'none'
                  }}
                />
              </div>

              <button
                onClick={handleApplyReducedAmount}
                disabled={loading || !adjustedExpenseAmount || parseFloat(adjustedExpenseAmount) <= 0}
                style={{
                  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                  color: '#fff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)'
                }}
              >
                Apply ₹{parseFloat(adjustedExpenseAmount || 0).toLocaleString()} & Re-check
              </button>
            </div>
          )}

          {/* Option 4: Proceed Without Reallocation */}
          {activeOption === 'proceed' && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#f87171' }}>
                Option 4: Proceed & Accept Over-Budget Status
              </div>
              <p style={{ margin: 0, fontSize: '12px', opacity: 0.85 }}>
                Record this expense as-is. It will be explicitly tagged as <strong>Over Budget</strong> in transaction history and will reduce your remaining monthly financial cash flow.
              </p>

              <button
                onClick={onConfirmOverBudget}
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: '#fff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)'
                }}
              >
                {loading ? 'Recording...' : 'Accept Over-Budget & Record Expense'}
              </button>
            </div>
          )}
        </div>

        {/* Footer / Cancel Button */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'rgba(0,0,0,0.1)'
          }}
        >
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '8px 18px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: 'var(--text-dark, #f1f5f9)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Cancel (Do Not Save)
          </button>
        </div>
      </div>
    </div>
  );
}
