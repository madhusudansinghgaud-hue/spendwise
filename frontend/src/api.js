import axios from 'axios';

const api = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  try {
    const userJson = localStorage.getItem('spendwise_user_profile');
    if (userJson) {
      const u = JSON.parse(userJson);
      if (u.id) config.headers['X-User-Id'] = u.id;
      if (u.username) config.headers['X-Username'] = u.username;
    } else {
      const username = localStorage.getItem('spendwise_user');
      if (username) config.headers['X-Username'] = username;
    }
  } catch (e) {
    console.error('Error attaching user header', e);
  }
  return config;
});

export const categoriesApi = {
  getAll: (month) => api.get('/api/categories/', { params: { month } }),
  getOverview: (month) => api.get('/api/categories/overview', { params: { month } }),
  create: (data) => api.post('/api/categories/', data),
  update: (id, data) => api.put(`/api/categories/${id}`, data),
  delete: (id) => api.delete(`/api/categories/${id}`),
  adjustMonthlyBudget: (data) => api.post('/api/categories/monthly-budget', data),
  batchAdjustMonthlyBudgets: (data) => api.post('/api/categories/batch-monthly-budget', data),
  rebalance: (data) => api.post('/api/categories/rebalance', data),
  rebalanceBudget: (data) => api.post('/api/categories/rebalance-budget', data),
  reallocate: (data) => api.post('/api/categories/reallocate', data),
  getReallocations: (month) => api.get('/api/categories/reallocations', { params: { month } })
};


export const expensesApi = {
  getAll: (params) => api.get('/api/expenses/', { params }),
  create: (data) => api.post('/api/expenses/', data),
  update: (id, data) => api.put(`/api/expenses/${id}`, data),
  delete: (id) => api.delete(`/api/expenses/${id}`),
  checkLimit: (data) => api.post('/api/expenses/check-limit', data),
  parseSms: (sms) => api.post('/api/expenses/parse-sms', { sms }),
  webhook: (data) => api.post('/api/expenses/webhook', data)
};

export const incomeApi = {
  getAll: (month) => api.get('/api/income/', { params: { month } }),
  create: (data) => api.post('/api/income/', data),
  update: (id, data) => api.put(`/api/income/${id}`, data),
  delete: (id) => api.delete(`/api/income/${id}`)
};

export const investmentsApi = {
  getAll: () => api.get('/api/investments/'),
  getActive: () => api.get('/api/investments/active'),
  create: (data) => api.post('/api/investments/', data),
  update: (id, data) => api.put(`/api/investments/${id}`, data),
  delete: (id) => api.delete(`/api/investments/${id}`),
  // Individual entry transactions
  getEntries: (month) => api.get('/api/investments/entries', { params: { month } }),
  createEntry: (data) => api.post('/api/investments/entries', data),
  updateEntry: (id, data) => api.put(`/api/investments/entries/${id}`, data),
  deleteEntry: (id) => api.delete(`/api/investments/entries/${id}`)
};

export const savingsApi = {
  getSummary: (month) => api.get('/api/savings/summary', { params: { month } }),
  getHistory: () => api.get('/api/savings/history'),
  settleMonth: (data) => api.post('/api/savings/settle-month', data),
  deposit: (data) => api.post('/api/savings/deposit', data)
};

export const analysisApi = {
  getMonths: () => api.get('/api/analysis/months'),
  getMonthly: (month) => api.get('/api/analysis/monthly', { params: { month } }),
  getMonthlyHistory: () => api.get('/api/analysis/monthly-history')
};

export const dashboardApi = {
  getSummary: () => api.get('/api/dashboard/summary')
};

export const bufferApi = {
  getStatus: () => api.get('/api/buffer/status'),
  absorb: (data) => api.post('/api/buffer/absorb', data),
  updateSettings: (data) => api.put('/api/buffer/settings', data)
};

export const authApi = {
  getProfile: (username) => api.get('/api/auth/profile', { params: { username } }),
  updateProfile: (data, username) => api.put('/api/auth/profile', data, { params: { username } }),
  updateIncome: (data) => api.put('/api/auth/income', data),
  login: (data) => api.post('/api/auth/login', data),
  register: (data) => api.post('/api/auth/register', data),
  onboard: (data) => api.post('/api/auth/onboard', data),
  getUsers: () => api.get('/api/auth/users')
};


export default api;
