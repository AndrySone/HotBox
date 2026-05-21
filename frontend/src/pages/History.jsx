import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './pages.css';

function History() {
  const [perPrinter, setPerPrinter] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const tokenRef = useRef(localStorage.getItem('access_token'));

  useEffect(() => {
    fetchHistory();
    // можно обновлять раз в минуту, т.к. история не меняется каждую секунду
    const t = setInterval(fetchHistory, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatDateTime = (unixSeconds) => {
    if (!unixSeconds) return '—';
    const d = new Date(Number(unixSeconds) * 1000);
    if (Number.isNaN(d.getTime())) return '—';
    // локальное время, как в PowerShell
    return d.toLocaleString();
  };

  const formatDuration = (seconds) => {
    if (seconds === null || seconds === undefined) return '—';
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}h ${m}m ${ss}s`;
    if (m > 0) return `${m}m ${ss}s`;
    return `${ss}s`;
  };

  const formatMeters = (mm) => {
    if (mm === null || mm === undefined) return '—';
    const v = Number(mm);
    if (Number.isNaN(v)) return '—';
    return `${(v / 1000).toFixed(2)} m`;
  };

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = tokenRef.current;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Новый endpoint на backend, агрегирующий Moonraker history по всем принтерам
      const response = await axios.get(
        'http://localhost:8000/api/history/moonraker/prints?limit=5',
        { headers }
      );

      setPerPrinter(response.data.per_printer || []);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching moonraker history:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load history');
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading history...</div>;

  if (error) {
    return (
      <div className="error">
        <p>⚠️ Ошибка загрузки истории</p>
        <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>{error}</p>
        <button onClick={fetchHistory} style={{ marginTop: '20px' }}>
          Повторить
        </button>
      </div>
    );
  }

  if (!perPrinter || perPrinter.length === 0) {
    return (
      <div className="history">
        <h2>История печати</h2>
        <div style={{ color: '#666', marginTop: 12 }}>Принтеров нет или Moonraker не настроен.</div>
      </div>
    );
  }

  return (
    <div className="history">
      <h2>История печати</h2>

      {perPrinter.map((p) => (
        <div key={p.printer_id} style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '12px 0' }}>
            {p.printer_name || p.printer_id}
            {p.error ? (
              <span style={{ marginLeft: 10, color: '#b45309', fontSize: 14 }}>
                (ошибка: {p.error})
              </span>
            ) : null}
          </h3>

          {!p.history || p.history.length === 0 ? (
            <div style={{ color: '#666', marginTop: 8 }}>Записей нет.</div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Файл</th>
                  <th>Статус</th>
                  <th>Старт</th>
                  <th>Конец</th>
                  <th>Длительность</th>
                  <th>Филамент</th>
                </tr>
              </thead>
              <tbody>
                {p.history.map((item, idx) => (
                  <tr key={`${p.printer_id}-${idx}`} className={`status-${item.status}`}>
                    <td>{item.filename || '—'}</td>
                    <td>
                      <span className={`status-badge ${item.status}`}>
                        {String(item.status || '').toUpperCase()}
                      </span>
                    </td>
                    <td>{formatDateTime(item.start_time)}</td>
                    <td>{formatDateTime(item.end_time)}</td>
                    <td>{formatDuration(item.print_duration)}</td>
                    <td>{formatMeters(item.filament_used)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}

export default History;