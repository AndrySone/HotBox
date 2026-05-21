import React, { useEffect, useRef, useState, useMemo } from 'react';
import './video-stream.css';

function addCacheBust(url, bust) {
  if (!url) return '';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}cacheBust=${bust}`;
}

function VideoStream({ webcamUrl, printerName, printerStatus }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  // ключ для принудительного переподключения (раз в 40 секунд)
  const [refreshKey, setRefreshKey] = useState(Date.now());

  const imgRef = useRef(null);
  const containerRef = useRef(null);

  // Обновляем refreshKey каждые 40 секунд (чтобы поток не отваливался ~через 50 сек)
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(Date.now());
    }, 40_000);

    return () => clearInterval(interval);
  }, []);

  // Итоговый URL потока с cacheBust
  const streamUrl = useMemo(() => addCacheBust(webcamUrl, refreshKey), [webcamUrl, refreshKey]);

  // Проверка доступности потока и управление loading/error
  useEffect(() => {
    if (!webcamUrl) {
      setError('No webcam URL available');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const img = new Image();

    img.onload = () => {
      setLoading(false);
      setError(null);
    };

    img.onerror = () => {
      setError('Failed to load video stream');
      setLoading(false);
    };

    img.onabort = () => {
      setError('Video stream aborted');
      setLoading(false);
    };

    // Установить источник с небольшим таймаутом
    const timer = setTimeout(() => {
      img.src = streamUrl;
    }, 100);

    return () => {
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      img.onabort = null;
    };
  }, [webcamUrl, streamUrl]);

  const handleFullscreen = (e) => {
    e.stopPropagation();

    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error('Fullscreen error:', err);
      });
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  return (
    <div className="video-stream-wrapper">
      <div className="video-stream-header">
        <div className="video-info">
          <h3>📹 Live Camera</h3>
          <p className="printer-name">{printerName}</p>
        </div>
        <div className="video-controls">
          <span className={`status-indicator ${printerStatus}`}>
            {printerStatus === 'printing' ? '🔴' : printerStatus === 'paused' ? '🟡' : '🟢'}
            {printerStatus.toUpperCase()}
          </span>
          <button className="btn-fullscreen" onClick={handleFullscreen} title="Fullscreen">
            ⛶
          </button>
        </div>
      </div>

      <div className={`video-stream-container ${fullscreen ? 'fullscreen' : ''}`} ref={containerRef}>
        {loading && !error && (
          <div className="video-loader">
            <div className="spinner"></div>
            <p>Loading camera stream...</p>
          </div>
        )}

        {error && (
          <div className="video-error">
            <span>⚠️</span>
            <p>{error}</p>
            <small>Check if camera is available and webcam URL is correct</small>
          </div>
        )}

        {webcamUrl && !error && (
          <img
            ref={imgRef}
            src={streamUrl}
            alt={`${printerName} Camera`}
            className="video-stream-img"
            style={{ display: loading ? 'none' : 'block' }}
            onError={() => {
              // если поток отвалился — пробуем переподключиться сразу
              setRefreshKey(Date.now());
            }}
          />
        )}
      </div>

      <div className="video-info-bar">
        <span>FPS: ~10</span>
        <span>•</span>
        <span>Type: MJPEG</span>
        <span>•</span>
        <span>Auto refresh: 40s</span>
      </div>
    </div>
  );
}

export default VideoStream;