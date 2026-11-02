import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { AVATAR_OPTIONS } from '../constants';
import { authApi } from '../api';
import toast from 'react-hot-toast';

export function ProfileModal() {
  const { user, theme, toggleTheme, updateProfile, showProfileModal, setShowProfileModal, setShowLoginModal } = useAuth();
  
  const [displayName, setDisplayName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('👨‍💻');

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '');
      setRoleTitle(user.role_title || '');
      setSelectedAvatar(user.avatar || '👨‍💻');
    }
  }, [user, showProfileModal]);

  if (!showProfileModal) return null;

  const handleSave = (e) => {
    e.preventDefault();
    if (!displayName.trim()) return toast.error('Name cannot be empty');
    updateProfile({
      display_name: displayName.trim(),
      role_title: roleTitle.trim(),
      avatar: selectedAvatar
    });
  };

  return (
    <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
      <div className="modal-card profile-modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>✨</span>
            <h3 style={{ margin: 0 }}>Customize Profile & Avatar</h3>
          </div>
          <button className="modal-close-btn" onClick={() => setShowProfileModal(false)}>✕</button>
        </div>

        <form onSubmit={handleSave}>
          {/* Active Avatar Preview */}
          <div className="avatar-preview-section">
            <div className="avatar-big-circle">
              <span>{selectedAvatar}</span>
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '17px', color: 'var(--text-dark)' }}>{displayName || 'Your Name'}</h4>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{roleTitle || 'Custom Role'}</span>
            </div>
          </div>

          {/* Avatar Selector Grid */}
          <div className="form-group" style={{ marginTop: '16px' }}>
            <label className="form-label">Pick Your Avatar</label>
            <div className="avatar-picker-grid">
              {AVATAR_OPTIONS.map((av) => (
                <button
                  key={av}
                  type="button"
                  className={`avatar-choice-btn ${selectedAvatar === av ? 'active' : ''}`}
                  onClick={() => setSelectedAvatar(av)}
                >
                  {av}
                </button>
              ))}
            </div>
          </div>

          {/* Name Field */}
          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input
              type="text"
              className="form-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Ghulam, Hunter, Alex..."
              required
            />
          </div>

          {/* Role / Tagline Field */}
          <div className="form-group">
            <label className="form-label">Title / Role</label>
            <input
              type="text"
              className="form-input"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="e.g. UX UI Designer, Budget Ninja..."
            />
          </div>

          {/* Theme Selector */}
          <div className="form-group theme-setting-group">
            <label className="form-label">App Appearance Theme</label>
            <div className="theme-toggle-pills">
              <button
                type="button"
                className={`theme-pill-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => { if (theme !== 'dark') toggleTheme(); }}
              >
                🌙 Dark Theme (Recommended)
              </button>
              <button
                type="button"
                className={`theme-pill-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => { if (theme !== 'light') toggleTheme(); }}
              >
                ☀️ Light Theme
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="modal-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-link-action"
              style={{ fontSize: '13px' }}
              onClick={() => {
                setShowProfileModal(false);
                setShowLoginModal(true);
              }}
            >
              🔄 Switch or Login Account
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary" onClick={() => setShowProfileModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-pill-coral">
                Save Profile
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function LoginModal() {
  const { loginUser, showLoginModal, setShowLoginModal, setShowProfileModal } = useAuth();
  const [usernameInput, setUsernameInput] = useState('');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [regName, setRegName] = useState('');
  const [regAvatar, setRegAvatar] = useState('🚀');

  useEffect(() => {
    if (showLoginModal) {
      authApi.getUsers().then(res => setAvailableUsers(res.data)).catch(() => {});
    }
  }, [showLoginModal]);

  if (!showLoginModal) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!usernameInput.trim()) return toast.error('Username is required');
    loginUser(usernameInput.trim());
  };

  return (
    <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
      <div className="modal-card profile-modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🔐</span>
            <h3 style={{ margin: 0 }}>{isRegisterMode ? 'Create New Profile' : 'SpendWise Login'}</h3>
          </div>
          <button className="modal-close-btn" onClick={() => setShowLoginModal(false)}>✕</button>
        </div>

        {/* Quick Switch from Existing Profiles */}
        {!isRegisterMode && availableUsers.length > 0 && (
          <div className="existing-users-box">
            <span className="form-helper" style={{ marginBottom: '8px' }}>Select an existing profile:</span>
            <div className="existing-users-chips">
              {availableUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="user-quick-chip"
                  onClick={() => loginUser(u.username)}
                >
                  <span>{u.avatar}</span>
                  <strong>{u.display_name}</strong>
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
          <div className="form-group">
            <label className="form-label">Username / Nickname</label>
            <input
              type="text"
              className="form-input"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="e.g. ghulam, alex, hunter..."
              required
            />
            <span className="form-helper">Enter any nickname to login or create a personalized profile.</span>
          </div>

          <div className="modal-actions" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowLoginModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn-pill-coral">
              🚀 Enter SpendWise
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
