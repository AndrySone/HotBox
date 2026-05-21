# HotBox - 3D Print Monitoring System

Интеллектуальная система мониторинга и анализа процесса 3D-печати 
с использованием компьютерного зрения и глубокого обучения.

## Быстрый старт

### Требования
- Docker & Docker Compose
- Python 3.10+
- Node.js 16+
- GPU (NVIDIA RTX 3060 или выше для AI инференса)

### Установка

\`\`\`bash
# Клонировать репозиторий
git clone https://github.com/AndrySone/HotBox.git
cd 3d-print-monitoring

# Развернуть с Docker Compose
docker-compose up -d

# Приложение будет доступно по адресу http://localhost
\`\`\`

cd D:\Работа\Вкр\HotBox

# 1. Активировать виртуальное окружение
.\.venv\Scripts\activate

# 2. Запустить API
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# 3. Перейти в папку фронтенда
cd D:\Работа\Вкр\HotBox\frontend

# 4. Запустить фронтенд
npm start

## Структура проекта

- **backend/** - FastAPI сервер
- **frontend/** - React приложение
- **esp32_client/** - Код для микроконтроллера
- **models/** - ML модели
- **training/** - Скрипты обучения

## Документация

- [Architecture](docs/ARCHITECTURE.md)
- [API Documentation](docs/API_DOCUMENTATION.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Лицензия

MIT License