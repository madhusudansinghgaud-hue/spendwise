import { useState } from 'react';
import { expensesApi } from '../api';
import toast from 'react-hot-toast';

export default function PhoneSync() {
  const [testSms, setTestSms] = useState('Sent Rs.180.00 from HDFC Bank to CHAI POINT via UPI Ref 429381923019 on 07-Oct-26');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Dynamically use current origin (works over HTTPS tunnel, Wi-Fi LAN IP, or localhost)
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const webhookUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/expenses/webhook` 
    : 'http://localhost:8000/api/expenses/webhook';

  const sampleMessages = [
    {
      bank: 'HDFC UPI (Beverages / Chai)',
      text: 'Sent Rs.180.00 from HDFC Bank to CHAI POINT via UPI Ref 429381923019 on 07-Oct-26'
    },
    {
      bank: 'SBI UPI (Cigarettes over limit)',
      text: 'Dear UPI user A/C *4892 debited by Rs.160.00 on 07-Oct-26 to PAAN CORNER MARLBORO ref no 3291823901'
    },
    {
      bank: 'Paytm UPI (Groceries)',
      text: 'Paid Rs.450.00 to BLINKIT COMMERCE PVT LTD on Paytm via UPI Ref 9102837461'
    },
    {
      bank: 'ICICI UPI (Food / Burger)',
      text: 'Your ICICI Bank A/C XX104 is debited with INR 350.00 on 07-Oct-26. Info: UPI/SWIGGY/4829103'
    }
  ];

  const handleTestWebhook = async () => {
    if (!testSms) return;
    try {
      setTesting(true);
      const res = await expensesApi.webhook({ sms: testSms, sender: 'Phone-Test' });
      setTestResult(res.data);
      if (res.data.status === 'success') {
        toast.success(`🎉 Expense auto-recorded: ₹${res.data.expense.amount} for ${res.data.expense.category}!`);
        if (res.data.alert) {
          toast.error(`⚠️ Quota exceeded for ${res.data.alert.category}! Check alert modal.`, { duration: 5000 });
        }
      } else {
        toast('Message received but not recognized as a debit transaction.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Webhook error: ' + (err.response?.data?.detail || err.message));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">📱 Phone Auto-SMS Sync</h1>
          <p className="page-subtitle">
            Turn SpendWise into a 100% automated expense tracker. Connect your Android phone via webhook so every UPI payment logs immediately without typing a word!
          </p>
        </div>
      </div>

      {/* Webhook URL Banner */}
      <div className="card-soft hero-webhook-card">
        <div className="webhook-badge-row">
          <span className="badge-tag coral">ACTIVE WEBHOOK ENDPOINT</span>
          <span className="badge-pill-outline">LAN Accessible</span>
        </div>
        <h3 style={{ margin: '12px 0 6px', color: 'var(--text-dark)', fontSize: '18px' }}>Your Webhook URL</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '14px' }}>
          This is the private endpoint on your network that accepts SMS transaction alerts from your phone automation app.
        </p>

        <div className="webhook-copy-box">
          <code className="webhook-code">{webhookUrl}</code>
          <button 
            className="btn-copy-code"
            onClick={() => {
              navigator.clipboard.writeText(webhookUrl);
              toast.success('Webhook URL copied to clipboard! 📋');
            }}
          >
            📋 Copy URL
          </button>
        </div>
      </div>

      {/* Live Test Simulator */}
      <div className="phone-sync-grid">
        <div className="card-soft">
          <h3 className="section-title">⚡ Live Webhook Simulator</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
            Test the live auto-detection right now by sending a sample bank SMS to the webhook.
          </p>

          <div className="sample-sms-chips">
            {sampleMessages.map((s, idx) => (
              <button 
                key={idx}
                type="button"
                className="chip-btn"
                onClick={() => setTestSms(s.text)}
              >
                {s.bank}
              </button>
            ))}
          </div>

          <div className="form-group" style={{ marginTop: '14px' }}>
            <label className="form-label">Incoming SMS Body</label>
            <textarea 
              className="form-input form-textarea"
              rows="3"
              value={testSms}
              onChange={(e) => setTestSms(e.target.value)}
              placeholder="Paste or type sample UPI SMS..."
            />
          </div>

          <button 
            className="btn-pill-coral" 
            style={{ width: '100%', padding: '12px', marginTop: '10px' }}
            onClick={handleTestWebhook}
            disabled={testing}
          >
            {testing ? 'Sending to Webhook...' : '🚀 Test Webhook Ingestion'}
          </button>

          {/* Result view */}
          {testResult && (
            <div className="test-result-box">
              <div className="result-header">
                <strong>Status:</strong> <span className={`status-pill ${testResult.status}`}>{testResult.status}</span>
              </div>
              <p style={{ fontSize: '13px', margin: '6px 0', color: 'var(--text-dark)' }}>{testResult.message}</p>
              {testResult.alert && (
                <div className="alert-inline-warning">
                  ⚠️ <strong>Quota Alert Triggered:</strong> {testResult.alert.category} exceeded limit by ₹{testResult.alert.excess}!
                  {testResult.alert.buffer_available > 0 && (
                    <div style={{ marginTop: '4px', fontSize: '12px' }}>
                      🛡️ Buffer Space available to absorb: ₹{testResult.alert.buffer_available}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3-Step Setup Guide */}
        <div className="card-soft">
          <h3 className="section-title">📲 3-Step Android Setup (MacroDroid / Tasker)</h3>
          <p style={{ color: '#82869e', fontSize: '13px', marginBottom: '16px' }}>
            Takes under 2 minutes to set up on any Android phone (Zero coding needed):
          </p>

          <div className="guide-steps-list">
            <div className="guide-step-item">
              <div className="step-number">1</div>
              <div className="step-content">
                <strong>Install MacroDroid (Free on Play Store)</strong>
                <p>Open Google Play Store on your phone and install <em>MacroDroid</em> or <em>Tasker</em>.</p>
              </div>
            </div>

            <div className="guide-step-item">
              <div className="step-number">2</div>
              <div className="step-content">
                <strong>Add Trigger: SMS Received</strong>
                <p>Choose <strong>Triggers → Incoming SMS</strong>. Set sender filter to: <code>*HDFC*, *SBI*, *PAYTM*, *AXIS*, *ICICI*, *UPI*</code>.</p>
              </div>
            </div>

            <div className="guide-step-item">
              <div className="step-number">3</div>
              <div className="step-content">
                <strong>Add Action: HTTP Request (POST)</strong>
                <p>
                  Choose <strong>Actions → Applications → HTTP Request</strong>:
                  <br />• URL: <code>{webhookUrl}</code>
                  <br />• Method: <code>POST</code>
                  <br />• Content Body: <code>{`{"sms": "[sms_body]", "sender": "[sms_number]"}`}</code>
                </p>
              </div>
            </div>
          </div>

          <div className="pwa-phone-tip" style={{
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: '16px',
            padding: '16px',
            marginTop: '16px'
          }}>
            <strong style={{ fontSize: '14px', color: '#6366f1', display: 'block', marginBottom: '8px' }}>
              📱 Open SpendWise on your Phone (Anywhere):
            </strong>
            <p style={{ fontSize: '12px', color: 'var(--text-dark)', marginBottom: '10px', lineHeight: 1.5 }}>
              Use your secure HTTPS Cloudflare Tunnel (works on any 4G/5G mobile data or Wi-Fi):
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <code style={{
                flex: 1,
                background: 'var(--bg-main)',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--card-border)',
                color: 'var(--text-dark)',
                fontSize: '12px',
                wordBreak: 'break-all'
              }}>
                {typeof window !== 'undefined' ? window.location.origin : 'https://buddy-listed-merry-mortality.trycloudflare.com'}
              </code>
              <button
                type="button"
                onClick={() => {
                  const url = typeof window !== 'undefined' ? window.location.origin : 'https://buddy-listed-merry-mortality.trycloudflare.com';
                  navigator.clipboard.writeText(url);
                  toast.success('Mobile URL copied! 📋');
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: '#6366f1',
                  color: '#fff',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Copy Link
              </button>
            </div>

            <div style={{
              background: 'var(--bg-main)',
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px dashed var(--card-border)',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', display: 'block' }}>
                  📶 Wi-Fi LAN Direct (Never expires at home):
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-dark)', fontFamily: 'monospace' }}>
                  http://192.168.29.178:5173
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText('http://192.168.29.178:5173');
                  toast.success('Wi-Fi LAN URL copied! 📋');
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Copy LAN
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img 
                src="/phone-qr.png" 
                alt="Scan to open on phone" 
                style={{ width: '84px', height: '84px', borderRadius: '10px', border: '1px solid var(--card-border)' }} 
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                <strong>📷 Scan with Phone Camera:</strong>
                <br />
                Point your camera at this QR code to open SpendWise instantly, then tap <strong>"Add to Home Screen"</strong> or <strong>"Install App"</strong>!
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
