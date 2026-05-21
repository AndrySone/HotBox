import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import VideoStream from '../components/VideoStream';
import Toast from '../components/Toast';
import './printer-detail.css';

function PrinterDetail() {
  const { printerId } = useParams();
  const navigate = useNavigate();

  const [printer, setPrinter] = useState(null);
  const [sensors, setSensors] = useState(null);
  const [liveSensors, setLiveSensors] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [executing, setExecuting] = useState(null);
  const [commandMessage, setCommandMessage] = useState(null);

  const [toast, setToast] = useState({ open: false, type: 'info', message: '' });

  // включено ли наблюдение дефектов на странице принтера
  const [defectEnabled] = useState(true);

  // токен (axios defaults у тебя тоже выставляются в App.jsx, но тут оставим явно)
  const tokenRef = useRef(localStorage.getItem('access_token'));

  const showToast = useCallback((type, message) => {
    setToast({ open: true, type, message });
  }, []);

  // анти-спам одинаковых уведомлений
  const lastAlertRef = useRef(new Map());
  const canShowAlert = useCallback((key, cooldownMs = 120000) => {
    const now = Date.now();
    const last = lastAlertRef.current.get(key) || 0;
    if (now - last < cooldownMs) return false;
    lastAlertRef.current.set(key, now);
    return true;
  }, []);

  const fetchPrinterData = useCallback(async () => {
    try {
      setError(null);

      const token = tokenRef.current;
      const headers = { Authorization: `Bearer ${token}` };

      const [printerRes, sensorRes, liveSensorRes] = await Promise.all([
        axios.get(`http://localhost:8000/api/printer/${printerId}`, { headers }),
        axios.get(`http://localhost:8000/api/printer/${printerId}/sensors`, { headers }),
        axios.get(`http://localhost:8000/api/printer/${printerId}/sensors-live`, { headers }),
      ]);

      setPrinter(printerRes.data);
      setSensors(sensorRes.data);
      setLiveSensors(liveSensorRes.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching printer data:', err);
      setError(err.response?.data?.detail || 'Failed to load printer data');
      setLoading(false);
    }
  }, [printerId]);

  // polling данных принтера/датчиков
  useEffect(() => {
    fetchPrinterData();
    const interval = setInterval(fetchPrinterData, 2000);
    return () => clearInterval(interval);
  }, [fetchPrinterData]);

  // уведомления по смене статуса
  const prevStatusRef = useRef(null);
  useEffect(() => {
    if (!printer) return;

    const prev = prevStatusRef.current;
    const next = printer.status;
    prevStatusRef.current = next;

    if (prev !== next && next === 'printing') {
      showToast('info', 'Печать началась. Включён контроль дефектов.');
    }
    if (prev !== next && next === 'paused') {
      showToast('warning', 'Печать на паузе.');
    }
    if (prev !== next && (next === 'idle' || next === 'standby')) {
      showToast('info', 'Печать завершена/остановлена.');
    }
    if (prev !== next && next === 'offline') {
      showToast('warning', 'Принтер OFFLINE. Данные/камера могут быть недоступны.');
    }
  }, [printer, printer?.status, showToast]);

  // проверка окружения (причины): температура камеры/влажность и т.п.
  const checkEnvironment = useCallback(() => {
    if (!printer || !liveSensors) return;
    if (printer.status !== 'printing') return;

    const mat = printer?.material?.name || 'материала';
    const settings = printer?.material?.settings;

    const humidity = liveSensors?.dht22?.humidity;
    const chamberTemp = liveSensors?.ds18b20?.temperature; // трактуем как "камера/корпус" если датчик там
    const ambientTemp = liveSensors?.dht22?.temperature;

    const humMin = settings?.humidity_min;
    const humMax = settings?.humidity_max;
    const chamberTarget = settings?.chamber_temp;

    // Влажность
    if (typeof humidity === 'number') {
      if (typeof humMax === 'number' && humidity > humMax + 2) {
        if (canShowAlert('humidity_high', 120000)) {
          showToast(
            'warning',
            `Высокая влажность: ${humidity.toFixed(1)}% (норма для ${mat} до ${humMax}%). Возможные дефекты: пузыри/стрингинг/плохая адгезия. Рекомендации: просушить пластик, осушитель/силикагель, закрыть камеру.`
          );
        }
      }
      if (typeof humMin === 'number' && humidity < humMin - 2) {
        if (canShowAlert('humidity_low', 120000)) {
          showToast(
            'warning',
            `Слишком низкая влажность: ${humidity.toFixed(1)}% (рекомендовано для ${mat} от ${humMin}%). Возможные проблемы: хрупкость (PLA), статическое электричество.`
          );
        }
      }

      // общий порог, если материал не определён
      if (!settings && humidity > 60) {
        if (canShowAlert('humidity_high_generic', 120000)) {
          showToast(
            'warning',
            `Высокая влажность: ${humidity.toFixed(1)}%. Возможны дефекты печати (пузыри/стрингинг). Для PETG/Nylon рекомендуется просушка.`
          );
        }
      }
    }

    // Температура камеры
    if (typeof chamberTemp === 'number' && typeof chamberTarget === 'number') {
      if (chamberTemp < chamberTarget - 3) {
        if (canShowAlert('chamber_temp_low', 120000)) {
          showToast(
            'warning',
            `Низкая температура камеры: ${chamberTemp.toFixed(1)}°C (рекомендовано для ${mat}: ~${chamberTarget}°C). Возможные дефекты: отслоение, коробление, трещины (ABS/Nylon).`
          );
        }
      }
      if (chamberTemp > chamberTarget + 10) {
        if (canShowAlert('chamber_temp_high', 120000)) {
          showToast(
            'warning',
            `Слишком высокая температура камеры: ${chamberTemp.toFixed(1)}°C (рекомендовано для ${mat}: ~${chamberTarget}°C). Возможен перегрев/размягчение деталей.`
          );
        }
      }
    }

    // Температура помещения (общая)
    if (typeof ambientTemp === 'number' && ambientTemp < 15) {
      if (canShowAlert('ambient_temp_low', 120000)) {
        showToast(
          'warning',
          `Низкая температура в помещении: ${ambientTemp.toFixed(1)}°C. Возможны проблемы первого слоя/коробление.`
        );
      }
    }
  }, [printer, liveSensors, showToast, canShowAlert]);

  useEffect(() => {
    checkEnvironment();
    const t = setInterval(checkEnvironment, 15000);
    return () => clearInterval(t);
  }, [checkEnvironment]);

  // Дефект-чек: backend сам тянет кадр по webcam_url, делает predict и логирует в SQLite
useEffect(() => {
  if (!defectEnabled) return;
  if (!printer) return;
  if (printer.status !== 'printing') return;

  let cancelled = false;

  const run = async () => {
    try {
      const token = tokenRef.current;

      const r = await axios.post(
        `http://localhost:8000/api/printer/${printerId}/defect/check`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (cancelled) return;
      if (r.data?.status === 'skip') return;

      const { prediction, confidence, note } = r.data;

      if (prediction === 'defect') {
        showToast(
          'error',
          `Дефект обнаружен (уверенность ${(confidence * 100).toFixed(1)}%).${note ? ` Возможные причины: ${note}.` : ''}`
        );
      } else {
        if (canShowAlert('no_defect', 120000)) {
          showToast('success', `Дефектов не обнаружено (уверенность ${(confidence * 100).toFixed(1)}%).`);
        }
      }
    } catch (e) {
      if (cancelled) return;
      const detail = e.response?.data?.detail || e.message;
      if (canShowAlert('defect_check_error', 120000)) {
        showToast('warning', `Контроль дефектов: ошибка (${detail})`);
      }
    }
  };

  run();
  const interval = setInterval(run, 30000);

  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}, [defectEnabled, printerId, printer?.status, showToast, canShowAlert]);

  const sendCommand = async (command) => {
    try {
      setExecuting(command);
      setCommandMessage(null);

      const token = tokenRef.current;

      const response = await axios.post(
        `http://localhost:8000/api/printer/${printerId}/command`,
        { command },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setCommandMessage({ type: 'success', text: `✓ ${response.data.message}` });

      setTimeout(fetchPrinterData, 1000);
    } catch (err) {
      setCommandMessage({
        type: 'error',
        text: `✗ Error: ${err.response?.data?.detail || err.message}`,
      });
    } finally {
      setExecuting(null);
    }
  };

  if (loading && !printer) {
    return <div className="loading">Loading printer details...</div>;
  }

  if (error && !printer) {
    return (
      <div className="error">
        <p>⚠️ Connection Error</p>
        <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>{error}</p>
        <button onClick={() => navigate('/')} style={{ marginTop: '20px' }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!printer) {
    return (
      <div className="error">
        <p>Printer not found</p>
        <button onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    );
  }

  const isPrinting = printer.status === 'printing';

  // формат секунд -> "HHh MMm SSs"
  const formatDuration = (seconds) => {
    const s = Math.max(0, Math.floor(Number(seconds || 0)));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;

    if (h > 0) return `${h}h ${m}m ${ss}s`;
    if (m > 0) return `${m}m ${ss}s`;
    return `${ss}s`;
  };

  return (
    <div className="printer-detail">
      <Toast
        open={toast.open}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        duration={6000}
      />

      <div className="detail-header">
        <button className="btn-back" onClick={() => navigate('/')}>
          ← Вернуться
        </button>
        <div>
          <h2>{printer.name}</h2>
          <p className="subtitle">
            {printer.manufacturer} {printer.model}
          </p>
        </div>
        <span className={`status-badge ${printer.status}`}>
          {printer.status === 'offline' ? '🔴 OFFLINE' : printer.status.toUpperCase()}
        </span>
      </div>

      <div className="specs-bar">
        <div className="spec-item">
          <span className="spec-label">Тип:</span>
          <span className="spec-value">{printer.type}</span>
        </div>
        <div className="spec-item">
          <span className="spec-label">Область печати:</span>
          <span className="spec-value">{printer.specs?.print_area}</span>
        </div>
        <div className="spec-item">
          <span className="spec-label">Max сопло:</span>
          <span className="spec-value">{printer.specs?.max_nozzle_temp}°C</span>
        </div>
        <div className="spec-item">
          <span className="spec-label">Max стол:</span>
          <span className="spec-value">{printer.specs?.max_bed_temp}°C</span>
        </div>
      </div>

      {commandMessage && <div className={`command-message ${commandMessage.type}`}>{commandMessage.text}</div>}

      <div className="detail-grid">
        {/* Видео */}
        {printer.specs?.webcam_url && (
          <div className="video-section">
            <VideoStream
              webcamUrl={printer.specs.webcam_url}
              printerName={printer.name}
              printerStatus={printer.status}
            />
          </div>
        )}

        {/* Информация о печати */}
        {printer?.printing && (
          <div className="print-info-section">
            <h3>📋 Информация о печати</h3>

            {(['idle', 'complete'].includes(printer.status)) ? (
              // Короткий блок после завершения печати
              <div className="info-grid distributed">
                <div className="info-item">
                  <label>Статус</label>
                  <value>{printer.status || 'idle'}</value>
                </div>

                <div className="info-item">
                  <label>Файл</label>
                  <value>{printer.printing.filename || '—'}</value>
                </div>

                <div className="info-item">
                  <label>Материал</label>
                  <value>{printer?.material?.name || 'Не определен'}</value>
                </div>

                <div className="info-item">
                  <label>Время печати</label>
                  <value>{formatDuration(printer?.printing?.elapsed)}</value>
                </div>

                <div className="info-item">
                  <label>Филамент</label>
                  <value>{Number(printer.filament_used || 0).toFixed(1)}mm</value>
                </div>

                <div className="info-item">
                  <label>Z высота</label>
                  <value>{Number(printer?.position?.z_height || 0).toFixed(2)}mm</value>
                </div>
              </div>
            ) : (
              // Расширенный блок во время печати/паузы/и т.п.
              <>
                <div className="info-grid distributed">
                  <div className="info-item">
                    <label>Статус</label>
                    <value>{printer.status || 'idle'}</value>
                  </div>

                  <div className="info-item">
                    <label>Файл</label>
                    <value>{printer.printing.filename || '—'}</value>
                  </div>

                  <div className="info-item">
                    <label>Материал</label>
                    <value>{printer?.material?.name || 'Не определен'}</value>
                  </div>

                  <div className="info-item">
                    <label>Прогресс</label>
                    <value>{Number(printer.printing.progress || 0).toFixed(1)}%</value>
                  </div>

                  <div className="info-item">
                    <label>Прошло времени</label>
                    <value>{printer.printing.elapsed_time || '0m'}</value>
                  </div>

                  <div className="info-item">
                    <label>Осталось</label>
                    <value>{printer.printing.remaining_time || 'N/A'}</value>
                  </div>

                  <div className="info-item">
                    <label>Филамент</label>
                    <value>{Number(printer.filament_used || 0).toFixed(1)}mm</value>
                  </div>

                  <div className="info-item">
                    <label>Z высота</label>
                    <value>{Number(printer?.position?.z_height || 0).toFixed(2)}mm</value>
                  </div>
                </div>

                {/* прогресс-бар показываем только когда печать не idle */}
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.max(0, Math.min(100, Number(printer.printing.progress || 0)))}%` }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Рекомендуемые параметры выбранного материала */}
        <div className="material-recommend-section">
          <h3>🧪 Рекомендуемые параметры материала</h3>

          {printer?.material?.settings ? (
            <div className="material-recommend-grid">
              <div className="recommend-item">
                <span>Материал:</span>
                <strong>{printer.material.name}</strong>
              </div>
              <div className="recommend-item">
                <span>🔥 Сопло:</span>
                <strong>{printer.material.settings.nozzle_temp}°C</strong>
              </div>
              <div className="recommend-item">
                <span>📏 Стол:</span>
                <strong>{printer.material.settings.bed_temp}°C</strong>
              </div>
              <div className="recommend-item">
                <span>⚡ Скорость:</span>
                <strong>{printer.material.settings.speed}%</strong>
              </div>
              <div className="recommend-item">
                <span>❄️ Вентилятор:</span>
                <strong>{printer.material.settings.fan_speed}%</strong>
              </div>
              <div className="recommend-item">
                <span>🏠 Камера:</span>
                <strong>{printer.material.settings.chamber_temp ?? '—'}°C</strong>
              </div>
              <div className="recommend-item">
                <span>💧 Влажность:</span>
                <strong>
                  {printer.material.settings.humidity_min ?? '—'}–{printer.material.settings.humidity_max ?? '—'}%
                </strong>
              </div>
            </div>
          ) : (
            <div className="material-empty">
              Материал не определён. Проверь имя gcode-файла (PLA/PETG/ABS/TPU/Nylon).
            </div>
          )}
        </div>

        {/* Датчики температуры */}
        {sensors && (
          <div className="sensors-section">
            <h3>🌡️ Температуры печати</h3>
            <div className="sensors-grid">
              <div className="sensor-card large">
                <div className="sensor-icon">🔥</div>
                <div className="sensor-label">Сопло</div>
                <div className="sensor-value">{sensors.temperatures.nozzle.current.toFixed(1)}°C</div>
                <div className="sensor-target">Target: {sensors.temperatures.nozzle.target.toFixed(1)}°C</div>
              </div>

              <div className="sensor-card large">
                <div className="sensor-icon">📏</div>
                <div className="sensor-label">Стол</div>
                <div className="sensor-value">{sensors.temperatures.bed.current.toFixed(1)}°C</div>
                <div className="sensor-target">Target: {sensors.temperatures.bed.target.toFixed(1)}°C</div>
              </div>
            </div>
          </div>
        )}

        {/* Датчики окружающей среды */}
        {liveSensors && (
          <div className="sensors-section">
            <h3>💨 Датчики внутри корпуса</h3>
            <div className="sensors-grid">
              <div className="sensor-card">
                <div className="sensor-icon">🌡️</div>
                <div className="sensor-value">{liveSensors.dht22.temperature.toFixed(1)}°C</div>
                <div className="sensor-label">Температура (DHT22)</div>
              </div>

              <div className="sensor-card">
                <div className="sensor-icon">💧</div>
                <div className="sensor-value">{liveSensors.dht22.humidity.toFixed(1)}%</div>
                <div className="sensor-label">Влажность (DHT22)</div>
              </div>

              {liveSensors.ds18b20 && (
                <div className="sensor-card">
                  <div className="sensor-icon">📊</div>
                  <div className="sensor-value">{liveSensors.ds18b20.temperature.toFixed(1)}°C</div>
                  <div className="sensor-label">Доп. датчик (DS18B20)</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Контролы */}
        <div className="controls-section">
          <div className="controls-section">
            <h3>🛡️ Контроль дефектов</h3>

              <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
    <input
      type="checkbox"
      checked={(printer.defect_action || 'notify') === 'pause'}
      onChange={async (e) => {
        const next = e.target.checked ? 'pause' : 'notify';

        try {
          const token = tokenRef.current;

          await axios.patch(
            `http://localhost:8000/api/printer/${printerId}/defect-action`,
            { defect_action: next },
            { headers: { Authorization: `Bearer ${token}` } }
          );

          setPrinter((p) => ({ ...p, defect_action: next }));
          showToast('success', next === 'pause'
            ? 'Автопауза включена: при дефекте печать будет ставиться на паузу.'
            : 'Автопауза выключена: при дефекте будет только уведомление.'
          );
        } catch (err) {
          showToast('error', err.response?.data?.detail || 'Не удалось сохранить настройку');
        }
      }}
    />
    Автопауза при дефекте (иначе только уведомление)
  </label>
</div>
          <h3>⚙️ Управление</h3>
          <div className="controls-grid">
            <button
              className="btn-control btn-pause"
              onClick={() => sendCommand('pause')}
              disabled={executing === 'pause' || !isPrinting}
              title={isPrinting ? 'Pause print' : 'Printer is not printing'}
            >
              {executing === 'pause' ? '⏳ ...' : '⏸️ Пауза'}
            </button>
            <button
              className="btn-control btn-resume"
              onClick={() => sendCommand('resume')}
              disabled={executing === 'resume' || printer.status !== 'paused'}
              title={printer.status === 'paused' ? 'Resume print' : 'Printer is not paused'}
            >
              {executing === 'resume' ? '⏳ ...' : '▶️ Возобновить'}
            </button>
            <button
              className="btn-control btn-stop"
              onClick={() => sendCommand('cancel')}
              disabled={executing === 'cancel' || !isPrinting}
              title={isPrinting ? 'Cancel print' : 'Printer is not printing'}
            >
              {executing === 'cancel' ? '⏳ ...' : '⏹️ Остановить'}
            </button>
            <button
              className="btn-control btn-restart"
              onClick={() => sendCommand('restart')}
              disabled={executing === 'restart'}
              title="Restart printer"
            >
              {executing === 'restart' ? '⏳ ...' : '🔄 Перезагрузить'}
            </button>
          </div>
        </div>

        {/* Информация о принтере */}
        {printer.features && printer.features.length > 0 && (
          <div className="printer-info-section">
            <h3>ℹ️ Характеристики</h3>
            <div className="features-list">
              {printer.features.map((feature, idx) => (
                <div key={idx} className="feature-item">
                  ✓ {feature}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PrinterDetail;