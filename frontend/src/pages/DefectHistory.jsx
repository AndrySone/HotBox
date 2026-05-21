import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './pages.css';

const API_BASE = 'http://localhost:8000';

function withToken(urlLike, token) {
  if (!urlLike) return null;
  try {
    const u = new URL(urlLike, API_BASE);
    if (token) u.searchParams.set('token', token);
    return u.toString();
  } catch {
    return null;
  }
}

function DefectHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // чтобы отключать кнопки на конкретной записи во время запроса
  const [exportingId, setExportingId] = useState(null);

  const token = localStorage.getItem('access_token');

  useEffect(() => {
    fetchDefects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDefects = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/history/defects`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setHistory(response.data.history || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching defects history:', error);
      setLoading(false);
    }
  };

  const exportToDataset = async (defectId, label) => {
    try {
      setExportingId(defectId);

      await axios.post(
        `${API_BASE}/api/dataset/defects/${defectId}/export`,
        { label }, // "defected" | "no_defected"
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      );

      // минимально: обычное уведомление
      // если у тебя есть Toast компонент на этой странице — можно заменить на него
      window.alert(`Сохранено в датасет: ${label}`);
    } catch (err) {
      console.error(err);
      window.alert(err.response?.data?.detail || 'Не удалось сохранить в датасет');
    } finally {
      setExportingId(null);
    }
  };

  if (loading) return <div className="loading">Загрузка истории дефектов...</div>;

  return (
    <div className="history">
      <h2>История дефектов</h2>

      <table className="history-table">
        <thead>
          <tr>
            <th>Изображение</th>
            <th>Дата</th>
            <th>Время</th>
            <th>Принтер</th>
            <th>Модель (файл)</th>
            <th>Материал</th>
            <th>Результат</th>
            <th>Уверенность</th>
            <th>Параметры</th>
            <th>Датасет</th>
          </tr>
        </thead>

        <tbody>
          {history.map((item) => {
            const imgUrl = withToken(item.image_url, token);
            const busy = exportingId === item.id;

            return (
              <tr key={item.id} className={`status-${item.prediction}`}>
                <td>
                  {imgUrl ? (
                    <a href={imgUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block' }}>
                      <img
                        src={imgUrl}
                        alt="defect"
                        style={{
                          width: 400,
                          height: 300,
                          objectFit: 'cover',
                          borderRadius: 10,
                          border: '1px solid #ddd',
                          background: '#f3f4f6',
                        }}
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    '—'
                  )}
                </td>

                <td>{item.date}</td>
                <td>{item.time}</td>
                <td>{item.printer}</td>
                <td>{item.model}</td>
                <td>{item.material}</td>

                <td>
                  <span className={`status-badge ${item.prediction}`}>
                    {item.prediction === 'defect' ? 'ДЕФЕКТ' : 'БЕЗ ДЕФЕКТОВ'}
                  </span>
                  {item.note ? <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{item.note}</div> : null}
                </td>

                <td>{Math.round((item.confidence || 0) * 100)}%</td>

                <td style={{ fontSize: 12, color: '#444' }}>
                  <div>🔥 Сопло: {item.params?.nozzle_temp ?? '—'}°C</div>
                  <div>📏 Стол: {item.params?.bed_temp ?? '—'}°C</div>
                  <div>💧 Влажн.: {item.params?.dht22_humidity ?? '—'}%</div>
                  <div>🏠 Камера: {item.params?.ds18b20_temp ?? '—'}°C</div>
                </td>

                <td>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="btn-control"
                      disabled={busy}
                      onClick={() => exportToDataset(item.id, 'defected')}
                      title="Сохранить изображение как дефектное (380x380) в backend/data/dataset/defected"
                    >
                      {busy ? '⏳...' : 'В defected'}
                    </button>

                    <button
                      className="btn-control"
                      disabled={busy}
                      onClick={() => exportToDataset(item.id, 'no_defected')}
                      title="Сохранить изображение как без дефектов (380x380) в backend/data/dataset/no_defected"
                    >
                      {busy ? '⏳...' : 'В no_defected'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default DefectHistory;