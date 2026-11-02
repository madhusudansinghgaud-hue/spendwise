import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/', icon: '🏛️', label: 'Dashboard' },
  { path: '/transactions', icon: '💳', label: 'Transactions' },
  { path: '/budget', icon: '📊', label: 'Budget Adjuster' },
  { path: '/investments', icon: '📈', label: 'Investments' },
  { path: '/savings', icon: '💰', label: 'Savings Vault' },
  { path: '/analysis', icon: '🔍', label: 'Monthly Analysis' },
  { path: '/buffer', icon: '🛡️', label: 'Buffer Space' },
  { path: '/sync', icon: '📱', label: 'Phone Sync' },
];

// Mobile bottom nav: 5 most important routes
const mobileNavItems = [
  navItems[0], // Dashboard
  navItems[1], // Transactions
  navItems[2], // Budget Adjuster
  navItems[3], // Investments
  navItems[4], // Savings
];

export default function Sidebar() {
  const location = useLocation();
  const { user, theme, toggleTheme, setShowProfileModal, setShowLoginModal, logoutUser } = useAuth();

  return (
    <>
      {/* Desktop & Tablet Sidebar */}
      <aside className="main-app-sidebar">
        {/* User Profile Avatar at Top (Clickable to customize) */}
        <div 
          className="sidebar-profile-box clickable" 
          onClick={() => setShowProfileModal(true)}
          title="Click to customize avatar and name"
        >
          <div className="sidebar-avatar-circle">
            <span role="img" aria-label="avatar">{user?.avatar || '👨‍💻'}</span>
          </div>
          <div className="sidebar-profile-info">
            <h4 className="sidebar-user-name">{user?.display_name || 'My Profile'}</h4>
            <span className="sidebar-user-role">{user?.role_title || 'Smart Budgeter'}</span>
          </div>
          <span className="profile-edit-badge" title="Edit Profile">✏️</span>
        </div>

        {/* Navigation Items */}
        <nav className="sidebar-nav-list">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`sidebar-nav-link ${isActive ? 'active-coral-pill' : ''}`}
                title={item.label}
              >
                <span className="sidebar-link-icon">{item.icon}</span>
                <span className="sidebar-link-label">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Theme Toggle & Login Switcher in Sidebar Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-theme-row">
            <button 
              type="button"
              className="sidebar-action-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              <span>{theme === 'dark' ? '🌙 Dark' : '☀️ Light'}</span>
            </button>
            <button 
              type="button"
              className="sidebar-action-btn"
              onClick={logoutUser}
              title="Switch or Create Profile"
            >
              <span>🚪 Switch</span>
            </button>
          </div>

          <div className="sidebar-logout-btn" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="version-tag">SpendWise v2.0</span>
            <button
              type="button"
              onClick={logoutUser}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--coral-accent)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                padding: '2px 6px'
              }}
            >
              + New Profile
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Floating Bottom Bar — 5 key tabs */}
      <nav className="mobile-bottom-nav">
        {mobileNavItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`mobile-nav-link ${isActive ? 'active-mobile-coral' : ''}`}
            >
              <span className="mobile-nav-icon">{item.icon}</span>
              <span className="mobile-nav-label">{item.label.split(' ')[0]}</span>
            </NavLink>
          );
        })}
        <button
          type="button"
          className="mobile-nav-link"
          onClick={() => setShowProfileModal(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          title="Customize Avatar, Name & Theme"
        >
          <span className="mobile-nav-icon">{user?.avatar || '👤'}</span>
          <span className="mobile-nav-label">Profile</span>
        </button>
      </nav>
    </>
  );
}
