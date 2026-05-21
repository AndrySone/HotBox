import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import Login from './pages/Login';
import Toast from './components/Toast';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import PrinterDetail from './pages/PrinterDetail';
import History from './pages/History';
import Settings from './pages/Settings';
import DefectDetection from './pages/DefectDetection';
import DefectHistory from './pages/DefectHistory';
import './App.css';

// Настроить axios с токеном
const setupAxios = (token) => {
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    console.log('✓ Authorization header set');
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }
};

function getSavedTheme() {
  try {
    const raw = localStorage.getItem('app_settings');
    if (!raw) return 'light';
    const parsed = JSON.parse(raw);
    return parsed?.theme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();

    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.06;

    o.connect(g);
    g.connect(ctx.destination);

    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 220);
  } catch {
    // браузер мог запретить звук до первого клика
  }
}

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  const [globalToast, setGlobalToast] = useState({ open: false, type: 'info', message: '' });
  const showGlobalToast = (type, message) => setGlobalToast({ open: true, type, message });

  // антиспам: запоминаем время последней тревоги по принтеру
  const lastAlarmRef = useRef(new Map());
  const canAlarm = (printerId, cooldownMs = 120000) => {
    const now = Date.now();
    const last = lastAlarmRef.current.get(printerId) || 0;
    if (now - last < cooldownMs) return false;
    lastAlarmRef.current.set(printerId, now);
    return true;
  };

  // Восстановить сессию
  useEffect(() => {
    const savedToken = localStorage.getItem('access_token');
    const savedUser = localStorage.getItem('user');

    console.log('Checking saved session...');
    console.log('Saved token:', savedToken ? 'Yes' : 'No');
    console.log('Saved user:', savedUser ? 'Yes' : 'No');

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        setupAxios(savedToken);
        console.log('✓ Session restored from localStorage');
      } catch (error) {
        console.error('Error restoring session:', error);
        localStorage.clear();
      }
    }

    setLoading(false);
  }, []);

  // Тема (глобально)
  useEffect(() => {
    const apply = () => {
      const theme = getSavedTheme();
      document.body.classList.toggle('theme-dark', theme === 'dark');
    };

    apply();
    window.addEventListener('storage', apply); // другие вкладки
    window.addEventListener('app_settings_changed', apply); // текущая вкладка

    return () => {
      window.removeEventListener('storage', apply);
      window.removeEventListener('app_settings_changed', apply);
    };
  }, []);

  // Глобальный контроль дефектов для всех печатающих принтеров
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const run = async () => {
      try {
        const printersRes = await axios.get('http://localhost:8000/api/printers');
        const printers = printersRes.data?.printers || [];

        const printing = printers.filter((p) => p?.status === 'printing');

        for (const p of printing) {
          if (cancelled) return;

          const pid = p.id;
          if (!pid) continue;

          const r = await axios.post(`http://localhost:8000/api/printer/${pid}/defect/check`, {});
          if (cancelled) return;

          if (r.data?.status === 'skip') continue;

          const { prediction, confidence, note } = r.data || {};
          if (prediction === 'defect') {
            if (canAlarm(pid, 120000)) {
              showGlobalToast(
                'error',
                `Дефект на принтере "${p.name}" (уверенность ${((confidence || 0) * 100).toFixed(1)}%).${
                  note ? ` Причины: ${note}.` : ''
                }`
              );
              playBeep();
            }
          }
        }
      } catch (e) {
        // при желании можно раз в N минут показывать предупреждение
        // console.warn('Global defect monitor error:', e);
      }
    };

    run();
    const interval = setInterval(run, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  const handleLoginSuccess = (userData, accessToken) => {
    setUser(userData);
    setToken(accessToken);
    setupAxios(accessToken);
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setUser(null);
    setToken(null);
    delete axios.defaults.headers.common['Authorization'];
    window.location.href = '/';
  };

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!user || !token) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <Router>
      <div className="app-container">
        <Header user={user} onLogout={handleLogout} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <Toast
          open={globalToast.open}
          type={globalToast.type}
          message={globalToast.message}
          onClose={() => setGlobalToast((t) => ({ ...t, open: false }))}
          duration={8000}
        />

        <div className="app-content">
          <Sidebar isOpen={sidebarOpen} />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/printer/:printerId" element={<PrinterDetail />} />
              <Route path="/defect-detection" element={<DefectDetection />} />
              <Route path="/history" element={<History />} />
              <Route path="/defect-history" element={<DefectHistory />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;