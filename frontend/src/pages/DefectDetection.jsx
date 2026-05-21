import React, { useState } from 'react';
import axios from 'axios';

function DefectDetection() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    setResult(null);
    setError(null);

    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const onPredict = async () => {
    if (!file) return;
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('access_token');
      const formData = new FormData();
      formData.append('file', file);

      const res = await axios.post('http://localhost:8000/api/defect/predict', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Prediction failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2>🧠 Детекция дефектов (DenseNet201)</h2>

      <div style={{ background: '#fff', padding: 20, borderRadius: 8 }}>
        <input type="file" accept="image/*" onChange={onFileChange} />
        {preview && (
          <div style={{ marginTop: 16 }}>
            <img src={preview} alt="preview" style={{ maxWidth: '100%', borderRadius: 8 }} />
          </div>
        )}

        <button
          onClick={onPredict}
          disabled={!file || loading}
          style={{ marginTop: 16, padding: '10px 16px' }}
        >
          {loading ? '⏳ Анализ...' : '🔍 Проверить изображение'}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 16, color: '#c62828', background: '#ffcdd2', padding: 12, borderRadius: 8 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 16, background: '#fff', padding: 20, borderRadius: 8 }}>
          <h3>Результат</h3>
          <p><b>Класс:</b> {result.prediction === 'defect' ? '❌ Дефект' : '✅ Без дефекта'}</p>
          <p><b>Уверенность:</b> {(result.confidence * 100).toFixed(2)}%</p>
          <p><b>No defect:</b> {(result.probabilities.no_defect * 100).toFixed(2)}%</p>
          <p><b>Defect:</b> {(result.probabilities.defect * 100).toFixed(2)}%</p>
        </div>
      )}
    </div>
  );
}

export default DefectDetection;