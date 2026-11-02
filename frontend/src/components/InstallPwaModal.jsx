import React, { useState, useEffect } from 'react';

export default function InstallPwaModal() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already running as standalone PWA
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      setIsStandalone(true);
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setShowModal(false);
      }
      setDeferredPrompt(null);
    } else {
      setShowModal(true);
    }
  };

  if (isStandalone) return null;

  return (
    <>
      {/* Floating Install Prompt Banner (Visible on mobile / small screens) */}
      <div style={{
        position: 'fixed',
        bottom: '80px',
        right: '16px',
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <button
          onClick={handleInstallClick}
          style={{
            padding: '10px 16px',
            borderRadius: '50px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#ffffff',
            border: 'none',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(16,185,129,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backdropFilter: 'blur(8px)',
            animation: 'pulse 2s infinite'
          }}
          title="Install SpendWise on your Phone"
        >
          <span>📲</span>
          <span>Install App</span>
        </button>
      </div>

      {/* Manual Instructions Modal if browser doesn't trigger prompt automatically */}
      {showModal && (
        <div 
          className="modal-overlay" 
          onClick={() => setShowModal(false)}
          style={{ zIndex: 10000 }}
        >
          <div 
            className="modal-card" 
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '420px', padding: '24px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '28px' }}>📲</span>
                <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-dark)' }}>Install SpendWise</h3>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '18px' }}>
              Install SpendWise to get full-screen app experience, offline access, and fast transaction tracking without browser address bars!
            </p>

            {/* Android Instructions */}
            <div style={{
              background: 'var(--bg-main)',
              border: '1px solid var(--card-border)',
              borderRadius: '14px',
              padding: '14px',
              marginBottom: '12px'
            }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#10b981', marginBottom: '6px' }}>
                🤖 Android (Chrome / Brave)
              </strong>
              <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-dark)', lineHeight: 1.6 }}>
                <li>Tap the <strong>3 vertical dots (⋮)</strong> in top-right corner.</li>
                <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                <li>Confirm to download and launch from your app drawer!</li>
              </ol>
            </div>

            {/* iOS Instructions */}
            <div style={{
              background: 'var(--bg-main)',
              border: '1px solid var(--card-border)',
              borderRadius: '14px',
              padding: '14px',
              marginBottom: '16px'
            }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6366f1', marginBottom: '6px' }}>
                🍎 iPhone / iPad (Safari)
              </strong>
              <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-dark)', lineHeight: 1.6 }}>
                <li>Tap the <strong>Share button</strong> (square with arrow up at bottom).</li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
                <li>Tap <strong>"Add"</strong> in the top right corner.</li>
              </ol>
            </div>

            <button
              onClick={() => setShowModal(false)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '12px',
                background: '#6366f1',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Got it! 👍
            </button>
          </div>
        </div>
      )}
    </>
  );
}
