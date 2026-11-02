import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState('dark');
  const [loading, setLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Initialize from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('spendwise_theme') || 'dark';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedProfile = localStorage.getItem('spendwise_user_profile');
    const savedUsername = localStorage.getItem('spendwise_user');

    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        setUser(parsed);
        if (parsed.theme) {
          setTheme(parsed.theme);
          document.documentElement.setAttribute('data-theme', parsed.theme);
        }
        setLoading(false);
        // Background refresh profile from backend
        fetchProfile(parsed.username);
        return;
      } catch (_) {}
    }

    if (savedUsername) {
      fetchProfile(savedUsername);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchProfile = async (username) => {
    try {
      const res = await authApi.getProfile(username);
      setUser(res.data);
      localStorage.setItem('spendwise_user', res.data.username);
      localStorage.setItem('spendwise_user_profile', JSON.stringify(res.data));
      if (res.data.theme) {
        setTheme(res.data.theme);
        document.documentElement.setAttribute('data-theme', res.data.theme);
      }
    } catch (err) {
      console.error(err);
      // If fetching fails, clear stale session
      localStorage.removeItem('spendwise_user');
      localStorage.removeItem('spendwise_user_profile');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('spendwise_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);

    // Save to backend if user exists
    if (user?.username) {
      try {
        await authApi.updateProfile({ theme: newTheme }, user.username);
      } catch (_) {}
    }
  };

  const updateProfile = async (data) => {
    if (!user) return;
    try {
      const res = await authApi.updateProfile(data, user.username);
      const updated = res.data.user;
      setUser(updated);
      localStorage.setItem('spendwise_user', updated.username);
      localStorage.setItem('spendwise_user_profile', JSON.stringify(updated));
      if (data.theme) {
        setTheme(data.theme);
        localStorage.setItem('spendwise_theme', data.theme);
        document.documentElement.setAttribute('data-theme', data.theme);
      }
      toast.success('Profile updated successfully! ✨');
      setShowProfileModal(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update profile');
    }
  };

  const loginUser = async (username) => {
    try {
      const res = await authApi.login({ username });
      const loggedUser = res.data.user;
      setUser(loggedUser);
      localStorage.setItem('spendwise_user', loggedUser.username);
      localStorage.setItem('spendwise_user_profile', JSON.stringify(loggedUser));
      if (loggedUser.theme) {
        setTheme(loggedUser.theme);
        localStorage.setItem('spendwise_theme', loggedUser.theme);
        document.documentElement.setAttribute('data-theme', loggedUser.theme);
      }
      toast.success(`Welcome back, ${loggedUser.display_name}! 👋`);
      setShowLoginModal(false);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Login failed');
    }
  };

  const onboardUser = async (data) => {
    const res = await authApi.onboard(data);
    const createdUser = res.data.user;
    setUser(createdUser);
    localStorage.setItem('spendwise_user', createdUser.username);
    localStorage.setItem('spendwise_user_profile', JSON.stringify(createdUser));
    if (createdUser.theme) {
      setTheme(createdUser.theme);
      localStorage.setItem('spendwise_theme', createdUser.theme);
      document.documentElement.setAttribute('data-theme', createdUser.theme);
    }
    toast.success(res.data.message || `Welcome aboard, ${createdUser.display_name}! 🚀`);
  };

  const logoutUser = () => {
    localStorage.removeItem('spendwise_user');
    localStorage.removeItem('spendwise_user_profile');
    setUser(null);
    toast('Logged out. Choose or create a profile to continue 👋');
  };

  return (
    <AuthContext.Provider value={{
      user,
      theme,
      loading,
      toggleTheme,
      updateProfile,
      loginUser,
      onboardUser,
      logoutUser,
      showProfileModal,
      setShowProfileModal,
      showLoginModal,
      setShowLoginModal
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
