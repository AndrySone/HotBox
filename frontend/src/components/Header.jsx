import React from 'react';
import './components.css';

function Header({ user, onLogout, toggleSidebar }) {
  return (
    <header className="header">
      <div className="header-left">
        <button 
          className="sidebar-toggle"
          onClick={toggleSidebar}
          title="Toggle Sidebar"
        >
          ☰
        </button>
        <h1 className="app-title">Интеллектуальная система мониторинга и анализа печати</h1>
      </div>
      
      <div className="header-right">
        <span className="status-indicator" title="Status">
          <span className="status-dot"></span>
          Connected
        </span>
        
        {user && (
          <div className="user-menu">
            <span className="user-name">
              👤 {user.username}
              {user.role === 'admin' && <span className="admin-badge">Admin</span>}
            </span>
            <button className="btn-logout" onClick={onLogout}>
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;