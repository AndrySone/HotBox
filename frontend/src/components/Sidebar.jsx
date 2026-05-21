import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './components.css';

function Sidebar({ isOpen }) {
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <nav className="nav-menu">
        <Link
          to="/"
          className={`nav-item ${isActive('/') ? 'active' : ''}`}
        >
          <span className="nav-icon">📊</span>
          <span className="nav-label">Главная страница</span>
        </Link>

        <Link
          to="/defect-detection"
          className={`nav-item ${isActive('/defect-detection') ? 'active' : ''}`}
        >
          <span className="nav-icon">🧠</span>
          <span className="nav-label">Поиск дефекта</span>
        </Link>

        <Link
          to="/history"
          className={`nav-item ${isActive('/history') ? 'active' : ''}`}
        >
          <span className="nav-icon">📜</span>
          <span className="nav-label">История печати</span>
        </Link>

        {/* NEW: История дефектов */}
        <Link
          to="/defect-history"
          className={`nav-item ${isActive('/defect-history') ? 'active' : ''}`}
        >
          <span className="nav-icon">🧾</span>
          <span className="nav-label">История дефектов</span>
        </Link>

        <Link
          to="/settings"
          className={`nav-item ${isActive('/settings') ? 'active' : ''}`}
        >
          <span className="nav-icon">⚙️</span>
          <span className="nav-label">Настройки</span>
        </Link>
      </nav>

      <div className="sidebar-footer">
        <p className="version">v1.0.0</p>
      </div>
    </aside>
  );
}

export default Sidebar;