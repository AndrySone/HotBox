import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './login.css';

// ===== ВАЖНО: КОНФИГУРАЦИЯ AXIOS =====
const API_URL = 'http://localhost:8000';

// Создать экземпляр axios с конфигурацией
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 5000,
});

// Логировать запросы
apiClient.interceptors.request.use(request => {
  console.log('Starting Request:', request);
  return request;
});

// Логировать ответы
apiClient.interceptors.response.use(
  response => {
    console.log('Response:', response);
    return response;
  },
  error => {
    console.error('Error:', error);
    return Promise.reject(error);
  }
);

function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [debug, setDebug] = useState('');
  const [backendStatus, setBackendStatus] = useState('checking');

  useEffect(() => {
    checkBackend();
  }, []);

  const checkBackend = async () => {
    console.log('🔍 Checking backend at:', API_URL);
    setDebug('Checking backend connection...');

    try {
      const response = await apiClient.get('/api/test');
      console.log('✓ Backend response:', response.data);
      setDebug(`✓ Backend online at ${API_URL}`);
      setBackendStatus('online');
    } catch (err) {
      console.error('✗ Backend error:', err);
      
      let errorMsg = 'Cannot connect to backend';
      
      if (err.code === 'ECONNABORTED') {
        errorMsg = 'Request timeout - Backend not responding';
      } else if (err.message === 'Network Error') {
        errorMsg = `Cannot reach ${API_URL}`;
      } else if (err.response) {
        errorMsg = `Server error: ${err.response.status}`;
      }
      
      setDebug(`✗ ${errorMsg}`);
      setBackendStatus('offline');
      setError(errorMsg);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setDebug('Sending login request...');

    console.log('🔐 Login attempt:');
    console.log('  Username:', username);
    console.log('  API URL:', API_URL);
    console.log('  Endpoint:', `${API_URL}/api/auth/login`);

    try {
      const response = await apiClient.post('/api/auth/login', {
        username: username.trim(),
        password: password.trim(),
      });

      console.log('✓ Login response:', response.data);
      setDebug('✓ Login successful!');

      const { access_token, user } = response.data;

      if (!access_token || !user) {
        throw new Error('Invalid response format');
      }

      // Вызвать callback успеха
      onLoginSuccess(user, access_token);
      
    } catch (err) {
      console.error('✗ Login error:', err);
      
      let errorMessage = 'Login failed';
      
      if (err.response) {
        console.error('Response status:', err.response.status);
        console.error('Response data:', err.response.data);
        errorMessage = err.response.data.detail || 'Invalid credentials';
      } else if (err.request) {
        console.error('No response received');
        errorMessage = 'Cannot connect to backend - Is it running?';
      } else {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setDebug(`✗ ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = (demoUser) => {
    if (demoUser === 'admin') {
      setUsername('admin');
      setPassword('admin123');
    } else {
      setUsername('user');
      setPassword('user123');
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>🖨️ 3D Print Monitor</h1>
          <p>Remote Monitoring System</p>
        </div>

        {/* Статус бэкенда: показываем только при checking/offline */}
        {(backendStatus === 'checking' || backendStatus === 'offline') && (
          <div className={`backend-status ${backendStatus}`}>
            <span className={`status-dot ${backendStatus}`}></span>
            {backendStatus === 'offline' && '🔴 Backend Offline'}
            {backendStatus === 'checking' && '🟡 Checking...'}
          </div>
        )}

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="error-message">
              ✗ {error}
            </div>
          )}

          {debug && (backendStatus === 'checking' || backendStatus === 'offline' || error) && (
          <div
            className={`debug-message ${
            debug.includes('✓') ? 'success' : debug.includes('✗') ? 'error' : 'info'
            }`}
          >
            {debug}
          </div>
          )}

          <button 
            type="submit" 
            className="btn-login"
            disabled={loading || backendStatus === 'offline'}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="demo-users">
          <p className="demo-title">Demo Accounts:</p>
          <div className="demo-buttons">
            <button
              type="button"
              className="btn-demo"
              onClick={() => handleDemoLogin('admin')}
              disabled={loading}
            >
              👨‍💼 Admin
            </button>
            <button
              type="button"
              className="btn-demo"
              onClick={() => handleDemoLogin('user')}
              disabled={loading}
            >
              👤 User
            </button>
          </div>
          <p className="demo-note">admin123 / user123</p>
        </div>

        <div className="login-footer">
          <p>API: {API_URL}</p>
          <p>For testing purposes only</p>
        </div>
      </div>

      <div className="login-bg"></div>
    </div>
  );
}

export default Login;