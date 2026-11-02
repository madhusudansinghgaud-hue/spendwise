import { useState, useEffect } from 'react';
import { bufferApi, categoriesApi } from '../api';
import toast from 'react-hot-toast';

export default function QuotaAlert({ alert, onClose, onRefresh }) {
  const [absorbing, setAbsorbing] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [bufferAvailable, setBufferAvailable] = useState(alert?.buffer_available ?? 150);
  const [rebalanceList, setRebalanceList] = useState([]);

  useEffect(() => {
    if (alert) {
      if (alert.buffer_available !== undefined) {
        setBufferAvailable(alert.buffer_available);
      }
      if (alert.rebalance_candidates) {
        setRebalanceList(alert.rebalance_candidates);
      }
    }
  }, [alert]);

  if (!alert) return null;

  const isExceeded = alert.type === 'daily_exceeded' || alert.spent >= alert.limit;
  const percent = alert.limit > 0 ? ((alert.spent / alert.limit) * 100).toFixed(0) : 100;
  const excess = alert.excess || Math.max(0, alert.spent - alert.limit);

  // Handle 1-click buffer absorption
  const handleAbsorbBuffer = async () => {
    try {
      setAbsorbing(true);
      await bufferApi.absorb({
        amount: excess,
        category_id: alert.category_id,
        reason: `Exceeded quota on ${alert.category || 'Category'}`
      });
      toast.success(`🛡️ Absorbed ₹${excess.toFixed(0)} into Buffer Space! Budget protected!`);
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to absorb with buffer: ' + (err.response?.data?.detail || err.message));
    } finally {
      setAbsorbing(false);
    }
  };

  // Handle smart category rebalancing
  const handleApplyRebalance = async () => {
    try {
      setRebalancing(true);
      // Create adjustments list from candidates
      let remainingToCover = excess;
      const adjustments = [];

      for (const cand of rebalanceList) {
        if (remainingToCover <= 0) break;
        const cut = Math.min(remainingToCover, cand.available);
        if (cut > 0) {
          adjustments.push({
            category_id: cand.id,
            reduce_by: cut
          });
          remainingToCover -= cut;
        }
      }

      if (adjustments.length === 0) {
        toast.error('No donor categories with available budget found.');
        return;
      }

      await categoriesApi.rebalance({
        exceeded_category_id: alert.category_id,
        adjustments
      });

      toast.success(`⚖️ Rebalanced ₹${(excess - remainingToCover).toFixed(0)} across other categories!`);
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to rebalance categories');
    } finally {
      setRebalancing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal alert-modal" onClick={e => e.stopPropagation()}>
        {/* Top Animated Header */}
        <div className="alert-emoji-container">
          <div className="alert-pulse-ring"></div>
          <span className="alert-emoji">{isExceeded ? '🚨' : '⚠️'}</span>
        </div>

        <h2 className="alert-title">
          {isExceeded ? 'Daily Quota Exceeded!' : 'Approaching Daily Quota!'}
        </h2>

        <div className="alert-category-badge">
          <span style={{ fontSize: '24px' }}>{alert.icon || '💰'}</span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-dark)' }}>{alert.category}</span>
        </div>

        <div className="alert-message" style={{ color: 'var(--text-dark)' }}>
          You've spent <strong style={{ color: 'var(--coral-accent)' }}>₹{alert.spent?.toFixed(0)}</strong> out of your
          daily limit of <strong>₹{alert.limit?.toFixed(0)}</strong> ({percent}%)
          {excess > 0 && (
            <span> — that's <strong style={{ color: 'var(--coral-accent)' }}>₹{excess.toFixed(0)} over</strong> your quota today!</span>
          )}
        </div>

        {/* Progress Bar */}
        <div style={{ margin: '14px 0 20px' }}>
          <div className="custom-progress-track">
            <div
              className="custom-progress-bar coral"
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
        </div>

        {/* SOLUTION 1: Buffer Money Absorption */}
        <div className="alert-solution-card buffer-solution">
          <div className="solution-header">
            <div className="solution-icon-box coral">🛡️</div>
            <div>
              <h4 className="solution-title">Option 1: Absorb with Buffer Money</h4>
              <p className="solution-desc">
                Your Buffer Cushion has <strong>₹{bufferAvailable.toFixed(0)}</strong> available today.
              </p>
            </div>
          </div>
          <button 
            className="btn-pill-coral" 
            style={{ width: '100%', marginTop: '10px' }}
            onClick={handleAbsorbBuffer}
            disabled={absorbing || bufferAvailable <= 0}
          >
            {absorbing ? 'Absorbing...' : `🛡️ Absorb ₹${excess.toFixed(0)} into Buffer Fund`}
          </button>
        </div>

        {/* SOLUTION 2: Category Rebalancing */}
        {rebalanceList && rebalanceList.length > 0 && (
          <div className="alert-solution-card rebalance-solution">
            <div className="solution-header">
              <div className="solution-icon-box navy">⚖️</div>
              <div>
                <h4 className="solution-title">Option 2: Adjust Other Categories</h4>
                <p className="solution-desc">
                  Reduce other category daily allowances so your total daily spend stays within budget:
                </p>
              </div>
            </div>

            <div className="rebalance-donor-chips">
              {rebalanceList.map((cand) => (
                <div key={cand.id} className="donor-chip">
                  <span>{cand.icon} {cand.name}</span>
                  <span className="donor-available">₹{cand.available?.toFixed(0)} available</span>
                  <span className="donor-cut">-₹{cand.suggested_cut?.toFixed(0)}</span>
                </div>
              ))}
            </div>

            <button 
              className="btn-pill-navy" 
              style={{ width: '100%', marginTop: '12px' }}
              onClick={handleApplyRebalance}
              disabled={rebalancing}
            >
              {rebalancing ? 'Applying...' : '⚖️ Auto-Rebalance Categories for Today'}
            </button>
          </div>
        )}

        {/* Footer Actions */}
        <div className="alert-footer-actions">
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
