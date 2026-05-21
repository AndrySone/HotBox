import React, { useState } from 'react';
import axios from 'axios';
import './components.css';

function AddPrinterModal({ open, onClose, onAdded }) {
  const [form, setForm] = useState({
    id: '',
    name: '',
    manufacturer: '',
    model: '',
    location: '',
    fluidd_url: '',
    api_key: '',
    webcam_url: '',
    webcam_type: 'mjpeg',
    webcam_fps: 10,
    max_nozzle_temp: 260,
    max_bed_temp: 100,
    print_area: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!open) return null;

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const submit = async () => {
    try {
      setLoading(true);
      setError(null);

      // axios уже настроен в App.jsx через setupAxios(token),
      // поэтому Authorization должен быть в дефолтных заголовках
      await axios.post('http://localhost:8000/api/printers', form);

      onAdded?.();
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || 'Не удалось добавить принтер');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Добавить Klipper принтер</h3>

        {error && <div className="command-message error">{error}</div>}

        <div className="form-grid">
          <input placeholder="Индификационный номер (например: creality_k1se)" value={form.id} onChange={(e) => set('id', e.target.value)} />
          <input placeholder="Название" value={form.name} onChange={(e) => set('name', e.target.value)} />
          <input placeholder="Производитель" value={form.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} />
          <input placeholder="Модель" value={form.model} onChange={(e) => set('model', e.target.value)} />
          <input placeholder="Локация" value={form.location} onChange={(e) => set('location', e.target.value)} />

          <input placeholder="Moonraker URL (http://IP:7125)" value={form.fluidd_url} onChange={(e) => set('fluidd_url', e.target.value)} />
          <input placeholder="API ключ" value={form.api_key} onChange={(e) => set('api_key', e.target.value)} />

          <input placeholder="URL камеры захвата видеопотока" value={form.webcam_url} onChange={(e) => set('webcam_url', e.target.value)} />

          <input placeholder="Размер печати" value={form.print_area} onChange={(e) => set('print_area', e.target.value)} />

          <input
            type="number"
            placeholder="Максимальная температура сопла"
            value={form.max_nozzle_temp}
            onChange={(e) => set('max_nozzle_temp', Number(e.target.value))}
          />
          <input
            type="number"
            placeholder="Максимальная температура стола"
            value={form.max_bed_temp}
            onChange={(e) => set('max_bed_temp', Number(e.target.value))}
          />
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={loading}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Добавляю...' : 'Добавить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddPrinterModal;