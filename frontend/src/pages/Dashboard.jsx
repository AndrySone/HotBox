import VideoStream from '../components/VideoStream';
import AddPrinterModal from '../components/AddPrinterModal';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './pages.css';

function Dashboard() {
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPrinters();
    const interval = setInterval(fetchPrinters, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchPrinters = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/printers');
      setPrinters(response.data.printers);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching printers:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading printers from Klipper...</div>;
  }

  return (
    <div className="dashboard">
      <h2>Главная страница</h2>

      {/* Модалка должна быть 1 раз на страницу */}
      <AddPrinterModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={fetchPrinters}
      />

      <div className="printers-grid">
        {printers.map((printer) => (
          <div
            key={printer.id}
            className="printer-card"
            onClick={() => navigate(`/printer/${printer.id}`)}
            style={{ cursor: 'pointer' }}
          >
            <div className="card-header">
              <div>
                <h3>{printer.name}</h3>
                <p className="manufacturer">{printer.manufacturer}</p>
                <p className="location">📍 {printer.location || '—'}</p>
              </div>
              <span className={`status-badge ${printer.status}`}>
                {printer.status === 'offline' ? '🔴 OFFLINE' : printer.status.toUpperCase()}
              </span>
            </div>

            <div className="card-body">
              <div className="stat">
                <label>🔥 Сопло</label>
                <value>{printer.temperatures.nozzle.toFixed(1)}°C</value>
              </div>

              <div className="stat">
                <label>📏 Стол</label>
                <value>{printer.temperatures.bed.toFixed(1)}°C</value>
              </div>

              {printer.status === 'printing' && printer.printing && (
                <>
                  <div className="stat">
                    <label>📊 Прогресс</label>
                    <value>{printer.progress?.toFixed(1) || 0}%</value>
                  </div>

                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${printer.progress || 0}%` }}
                    ></div>
                  </div>
                  <div className="progress-text">
                    {printer.progress?.toFixed(1) || 0}% - Осталось: {printer.remaining_time}
                  </div>
                </>
              )}

              {printer.status === 'offline' && (
                <div className="offline-message">
                  ⚠️ Klipper не доступен
                </div>
              )}
            </div>

            <div className="card-footer">
              <button
                className="btn btn-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/printer/${printer.id}`);
                }}
              >
                Подробнее →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* FAB должна быть 1 раз, НЕ внутри карточек */}
      <button
        className="fab-add-printer"
        title="Добавить принтер"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAddOpen(true);
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        +
      </button>
    </div>
  );
}

export default Dashboard;