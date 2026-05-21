@echo off
chcp 65001 >nul
cls

echo.
echo ============================================
echo 3D Print Monitor - Frontend
echo ============================================
echo.

REM Перейти в папку фронтенда
cd frontend

REM Проверить что node_modules существует
if not exist "node_modules" (
    echo Installing dependencies...
    echo.
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        cd ..
        pause
        exit /b 1
    )
)

REM Показать информацию
echo.
echo ✓ Dependencies ready
echo ✓ Starting React development server...
echo.
echo ============================================
echo Frontend will be available at:
echo   http://localhost:3000
echo.
echo API:          http://localhost:8000
echo API Docs:     http://localhost:8000/docs
echo.
echo The browser will open automatically
echo Press Ctrl+C to stop
echo ============================================
echo.

REM Запустить фронтенд
call npm start

REM Если скрипт здесь - значит произошла ошибка
if errorlevel 1 (
    echo.
    echo ERROR: Failed to start frontend
    cd ..
    pause
    exit /b 1
)

pause