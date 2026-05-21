import React, { useEffect, useState } from 'react';
import './pages.css';

const DEFAULT_SETTINGS = {
  // Дефекты
  defect_detection_enabled: true,
  defect_check_interval_sec: 30,
  defect_threshold: 0.5, // 0..1
  defect_default_action: 'notify', // notify | pause

  // Уведомления
  ui_notifications_enabled: true,
  no_defect_toast_cooldown_min: 2,
  sound_enabled: false,

  // Окружение
  env_check_interval_sec: 15,
  humidity_tolerance: 2, // %
  chamber_temp_tolerance: 3, // °C (ниже цели на 3 — предупреждать)
  ambient_temp_low_threshold: 15, // °C

  // Датасет
  dataset_root: 'models/dataset',
  dataset_image_size: '380x380',
  dataset_auto_export_enabled: false, // автораскладка по pred (осторожно)

  // Интерфейс
  theme: 'light', // light | dark
  time_format: '24h', // 24h | 12h
};

function Settings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    // загружаем сохранённые настройки
    try {
      const saved = localStorage.getItem('app_settings');
      if (saved) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      }
    } catch (e) {
      console.warn('Не удалось загрузить настройки:', e);
    }
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    let v = type === 'checkbox' ? checked : value;

    // числа
    if (
      name.endsWith('_sec') ||
      name.endsWith('_min') ||
      name.includes('tolerance') ||
      name.includes('threshold') ||
      name.includes('interval') ||
      name.includes('ambient_temp')
    ) {
      // defect_threshold оставим float
      v = name === 'defect_threshold' ? Number(v) : parseInt(v, 10);
      if (Number.isNaN(v)) v = 0;
    }

    setSettings((prev) => ({ ...prev, [name]: v }));
  };

  const handleSave = () => {
  localStorage.setItem('app_settings', JSON.stringify(settings));
  window.dispatchEvent(new Event('app_settings_changed'));
  alert('Настройки сохранены');
};

  const handleReset = () => {
  setSettings(DEFAULT_SETTINGS);
  localStorage.removeItem('app_settings');
  window.dispatchEvent(new Event('app_settings_changed'));
  alert('Сброшено к настройкам по умолчанию');
};

  return (
    <div className="settings">
      <h2>Настройки</h2>

      <div className="settings-form">
        <h3>🧠 Контроль дефектов</h3>

        <div className="form-group checkbox">
          <input
            type="checkbox"
            name="defect_detection_enabled"
            checked={settings.defect_detection_enabled}
            onChange={handleChange}
          />
          <label>Включить контроль дефектов</label>
        </div>

        <div className="form-group">
          <label>Интервал проверки дефектов (сек)</label>
          <input
            type="number"
            name="defect_check_interval_sec"
            min="5"
            max="300"
            value={settings.defect_check_interval_sec}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Порог “дефект” (0.50–0.95)</label>
          <input
            type="number"
            name="defect_threshold"
            step="0.01"
            min="0.5"
            max="0.95"
            value={settings.defect_threshold}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Действие по умолчанию при дефекте</label>
          <select
            name="defect_default_action"
            value={settings.defect_default_action}
            onChange={handleChange}
          >
            <option value="notify">Только уведомление</option>
            <option value="pause">Авто‑пауза</option>
          </select>
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            Индивидуальная настройка принтера (в карточке принтера) имеет приоритет.
          </div>
        </div>

        <h3 style={{ marginTop: 18 }}>🔔 Уведомления</h3>

        <div className="form-group checkbox">
          <input
            type="checkbox"
            name="ui_notifications_enabled"
            checked={settings.ui_notifications_enabled}
            onChange={handleChange}
          />
          <label>Показывать уведомления (toast)</label>
        </div>

        <div className="form-group">
          <label>“Без дефектов” — показывать не чаще чем раз в (мин)</label>
          <input
            type="number"
            name="no_defect_toast_cooldown_min"
            min="1"
            max="60"
            value={settings.no_defect_toast_cooldown_min}
            onChange={handleChange}
          />
        </div>

        <div className="form-group checkbox">
          <input
            type="checkbox"
            name="sound_enabled"
            checked={settings.sound_enabled}
            onChange={handleChange}
          />
          <label>Звук уведомлений</label>
        </div>

        <h3 style={{ marginTop: 18 }}>💨 Окружение (датчики)</h3>

        <div className="form-group">
          <label>Интервал проверки окружения (сек)</label>
          <input
            type="number"
            name="env_check_interval_sec"
            min="5"
            max="300"
            value={settings.env_check_interval_sec}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Допуск по влажности (%)</label>
          <input
            type="number"
            name="humidity_tolerance"
            min="0"
            max="20"
            value={settings.humidity_tolerance}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Допуск по температуре камеры (°C)</label>
          <input
            type="number"
            name="chamber_temp_tolerance"
            min="0"
            max="30"
            value={settings.chamber_temp_tolerance}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Низкая температура помещения (°C)</label>
          <input
            type="number"
            name="ambient_temp_low_threshold"
            min="-10"
            max="30"
            value={settings.ambient_temp_low_threshold}
            onChange={handleChange}
          />
        </div>

        <h3 style={{ marginTop: 18 }}>📦 Датасет (дообучение)</h3>

        <div className="form-group">
          <label>Папка датасета</label>
          <input
            type="text"
            name="dataset_root"
            value={settings.dataset_root}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Размер изображений (фиксированный)</label>
          <input type="text" value={settings.dataset_image_size} readOnly />
        </div>

        <div className="form-group checkbox">
          <input
            type="checkbox"
            name="dataset_auto_export_enabled"
            checked={settings.dataset_auto_export_enabled}
            onChange={handleChange}
          />
          <label>Автоматически экспортировать в датасет по предикту (осторожно)</label>
        </div>

        <h3 style={{ marginTop: 18 }}>🎨 Интерфейс</h3>

        <div className="form-group">
          <label>Тема</label>
          <select name="theme" value={settings.theme} onChange={handleChange}>
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
        </div>

        <div className="form-group">
          <label>Формат времени</label>
          <select name="time_format" value={settings.time_format} onChange={handleChange}>
            <option value="24h">24 часа</option>
            <option value="12h">12 часов</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button className="btn btn-primary" onClick={handleSave}>
            Сохранить настройки
          </button>
          <button className="btn" onClick={handleReset}>
            Сбросить
          </button>
        </div>
      </div>

      <div className="about">
        <h3>О программе</h3>
        <p>3D Print Monitor v1.0.0</p>
        <p>Мониторинг 3D‑принтеров, датчиков и контроль дефектов печати.</p>
      </div>
    </div>
  );
}

export default Settings;