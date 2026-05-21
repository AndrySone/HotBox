@echo off
chcp 65001 >nul
cls

echo.
echo ============================================
echo 3D Print Monitor - Full Start
echo ============================================
echo.

REM Проверить что venv существует
if not exist "venv" (
    echo ERROR: Virtual environment not found!
    echo.
    echo Run these commands:
    echo   python -m venv venv
    echo   venv\Scripts\activate.ps1
    echo   pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

REM Проверить что frontend зависимости установлены
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install frontend dependencies
        cd ..
        pause
        exit /b 1
    )
    cd ..
)

echo.
echo ============================================
echo Starting services...
echo ============================================
echo.

REM Запустить API в отдельном окне
echo Starting API server...
start "API Server - 3D Print Monitor" cmd /k "call start_api.bat"

REM Подождать пока API запустится
timeout /t 3 /nobreak

REM Запустить фронтенд в отдельном окне
echo Starting Frontend...
start "Frontend - 3D Print Monitor" cmd /k "call start_frontend.bat"

echo.
echo ============================================
echo Services started in separate windows!
echo ============================================
echo.
echo 🌐 Frontend:     http://localhost:3000
echo 📡 API:          http://localhost:8000
echo 📚 API Docs:     http://localhost:8000/docs
echo 🧪 Test API:     http://localhost:8000/api/test
echo.
echo Test Credentials:
echo   Admin:  admin / admin123
echo   User:   user / user123
echo.
echo Both windows should open automatically.
echo If not, check the firewall or port availability.
echo.
echo Press any key to close this window...
pause