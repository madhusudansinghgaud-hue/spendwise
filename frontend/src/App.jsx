import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProfileModal, LoginModal } from './components/AuthModals';
import InstallPwaModal from './components/InstallPwaModal';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import CategoryAdjuster from './pages/CategoryAdjuster';
import Savings from './pages/Savings';
import MonthlyAnalysis from './pages/MonthlyAnalysis';
import BufferSpace from './pages/BufferSpace';
import Investments from './pages/Investments';
import PhoneSync from './pages/PhoneSync';
import AuthOnboarding from './pages/AuthOnboarding';
import './index.css';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        background: 'var(--bg-main)',
        color: 'var(--text-dark)',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '18px',
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
          boxShadow: '0 10px 25px rgba(99,102,241,0.4)',
          animation: 'pulse 1.5s infinite'
        }}>
          ⚡
        </div>
        <p style={{ fontWeight: 600, fontSize: '15px' }}>Loading SpendWise...</p>
      </div>
    );
  }

  // If no user session, show Onboarding / Login Questionnaire screen first!
  if (!user) {
    return <AuthOnboarding />;
  }

  // Authenticated workspace
  return (
    <div className="app-frame-container">
      {/* Profile & Login Modals */}
      <ProfileModal />
      <LoginModal />

      <Sidebar />
      <main className="app-main-canvas">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/expenses" element={<Transactions />} />
          <Route path="/budget" element={<CategoryAdjuster />} />
          <Route path="/categories" element={<CategoryAdjuster />} />
          <Route path="/savings" element={<Savings />} />
          <Route path="/analysis" element={<MonthlyAnalysis />} />
          <Route path="/analytics" element={<MonthlyAnalysis />} />
          <Route path="/investments" element={<Investments />} />
          <Route path="/buffer" element={<BufferSpace />} />
          <Route path="/sync" element={<PhoneSync />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Mobile PWA Install Prompt & Instructions */}
      <InstallPwaModal />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--card-bg)',
              color: 'var(--text-dark)',
              border: '1px solid var(--card-border)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
              borderRadius: '16px',
              fontSize: '14px',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500
            }
          }}
        />
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}
