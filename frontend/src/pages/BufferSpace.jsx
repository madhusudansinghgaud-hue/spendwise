import { useState, useEffect } from 'react';
import { bufferApi } from '../api';
import toast from 'react-hot-toast';

export default function BufferSpace() {
  const [bufferStatus, setBufferStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [dailyBufferInput, setDailyBufferInput] = useState(150);
  const [monthlyBufferInput, setMonthlyBufferInput] = useState(3000);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await bufferApi.getStatus();
      setBufferStatus(res.data);
      setDailyBufferInput(res.data.daily_buffer);
      setMonthlyBufferInput(res.data.monthly_buffer);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load buffer space');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await bufferApi.updateSettings({
        daily_buffer: parseFloat(dailyBufferInput),
        monthly_buffer: parseFloat(monthlyBufferInput)
      });
      toast.success('Buffer limits updated successfully! 🛡️');
      setShowSettings(false);
      fetchStatus();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update buffer settings');
    }
  };

  if (loading || !bufferStatus) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading Buffer Space...</p>
      </div>
    );
  }

  const dailyPct = Math.min(100, Math.round(bufferStatus.daily_percent || 0));
  const monthlyPct = Math.min(100, Math.round(bufferStatus.monthly_percent || 0));

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">🛡️ Buffer Money Space</h1>
          <p className="page-subtitle">
            Your personal financial shock absorber. When unexpected expenses pop up, your buffer absorbs the blow so your ₹10,000 monthly investment stays 100% safe.
          </p>
        </div>
        <button 
          className="btn-pill-coral" 
          onClick={() => setShowSettings(true)}
        >
          ⚙️ Adjust Buffer Limits
        </button>
      </div>

      {/* Hero Buffer Gauges */}
      <div className="buffer-cards-grid">
        {/* Daily Buffer Card */}
        <div className="card-soft buffer-card">
          <div className="buffer-card-header">
            <div>
              <span className="badge-tag coral">TODAY'S CUSHION</span>
              <h2 className="buffer-card-title">Daily Buffer Pool</h2>
            </div>
            <div className="buffer-icon-circle">🛡️</div>
          </div>

          <div className="buffer-amount-display">
            <span className="buffer-currency">₹</span>
            <span className="buffer-big-number">{bufferStatus.daily_remaining.toFixed(0)}</span>
            <span className="buffer-unit">/ ₹{bufferStatus.daily_buffer.toFixed(0)} available today</span>
          </div>

          {/* Progress bar */}
          <div className="custom-progress-track">
            <div 
              className="custom-progress-bar coral" 
              style={{ width: `${dailyPct}%` }}
            ></div>
          </div>
          <div className="progress-labels">
            <span>Used today: ₹{bufferStatus.daily_used.toFixed(0)}</span>
            <span>{100 - dailyPct}% cushion remaining</span>
          </div>

          <div className="buffer-hint-box">
            💡 <strong>How it works:</strong> If you overspend on Cigarettes or Chai by ₹50, you can absorb it into this daily buffer with 1 tap.
          </div>
        </div>

        {/* Monthly Emergency Buffer Card */}
        <div className="card-soft buffer-card">
          <div className="buffer-card-header">
            <div>
              <span className="badge-tag navy">MONTHLY RESERVE</span>
              <h2 className="buffer-card-title">Monthly Safety Net</h2>
            </div>
            <div className="buffer-icon-circle navy">🏦</div>
          </div>

          <div className="buffer-amount-display">
            <span className="buffer-currency">₹</span>
            <span className="buffer-big-number">{bufferStatus.monthly_remaining.toFixed(0)}</span>
            <span className="buffer-unit">/ ₹{bufferStatus.monthly_buffer.toFixed(0)} monthly pool</span>
          </div>

          {/* Progress bar */}
          <div className="custom-progress-track">
            <div 
              className="custom-progress-bar navy" 
              style={{ width: `${monthlyPct}%` }}
            ></div>
          </div>
          <div className="progress-labels">
            <span>Absorbed this month: ₹{bufferStatus.monthly_used.toFixed(0)}</span>
            <span>{100 - monthlyPct}% buffer left</span>
          </div>

          <div className="buffer-hint-box">
            🎯 <strong>Wealth Protection:</strong> By capping monthly unplanned expenses to this reserve, your salary savings rate is never compromised.
          </div>
        </div>
      </div>

      {/* Buffer Absorption History */}
      <div className="card-soft" style={{ marginTop: '24px' }}>
        <div className="card-header-clean">
          <h3 className="section-title">Recent Buffer Absorptions</h3>
          <span className="badge-pill-outline">{bufferStatus.recent_usages?.length || 0} recorded</span>
        </div>

        {(!bufferStatus.recent_usages || bufferStatus.recent_usages.length === 0) ? (
          <div className="empty-state-box">
            <span style={{ fontSize: '36px' }}>✨</span>
            <h4 style={{ margin: '8px 0 4px', color: 'var(--text-dark)' }}>No overspends absorbed yet</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              Your buffer space is fully intact! Whenever an expense exceeds a daily quota, you can absorb it right here.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Reason / Context</th>
                  <th>Amount Absorbed</th>
                  <th>Date & Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bufferStatus.recent_usages.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="table-category-cell">
                        <span className="table-cat-icon">{item.category_icon || '🛡️'}</span>
                        <span className="table-cat-name">{item.category_name}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-dark)' }}>{item.reason || 'Quota excess absorption'}</td>
                    <td>
                      <span className="table-amount coral">₹{item.amount.toFixed(0)}</span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                      {new Date(item.date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td>
                      <span className="status-tag tag-buffer">🛡️ Absorbed</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🛡️ Configure Buffer Money</h3>
              <button className="modal-close-btn" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveSettings}>
              <div className="form-group">
                <label className="form-label">Daily Buffer Cushion (₹)</label>
                <input 
                  type="number"
                  className="form-input"
                  value={dailyBufferInput}
                  onChange={(e) => setDailyBufferInput(e.target.value)}
                  placeholder="e.g. 150"
                  required
                  min="0"
                />
                <span className="form-helper">Maximum amount you are willing to absorb per day for incidental overspends.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Monthly Total Emergency Reserve (₹)</label>
                <input 
                  type="number"
                  className="form-input"
                  value={monthlyBufferInput}
                  onChange={(e) => setMonthlyBufferInput(e.target.value)}
                  placeholder="e.g. 3000"
                  required
                  min="0"
                />
                <span className="form-helper">Total monthly safety cushion allocated from your spending budget.</span>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowSettings(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-pill-coral">
                  Save Buffer Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
