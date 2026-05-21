@echo off
chcp 65001 >nul
cls

echo.
echo ============================================
echo 3D Print Monitor - API Server
echo ============================================
echo.

REM Проверить что venv существует
if not exist "venv" (
    echo ERROR: Virtual environment not found!
    echo Run: python -m venv venv
    pause
    exit /b 1
)

REM Активировать окружение
call venv\Scripts\activate.bat

REM Проверить что активировано
if errorlevel 1 (
    echo ERROR: Failed to activate virtual environment
    pause
    exit /b 1
)

REM Показать информацию
echo.
echo ✓ Python environment activated
echo ✓ Starting FastAPI server...
echo.
echo ============================================
echo API will be available at:
echo   http://localhost:8000
echo   http://127.0.0.1:8000
echo.
echo API Docs:     http://localhost:8000/docs
echo Test:         http://localhost:8000/api/test
echo Frontend:     http://localhost:3000
echo.
echo Test command:
echo   curl http://localhost:8000/api/test
echo.
echo Test credentials:
echo   Admin:  admin / admin123
echo   User:   user / user123
echo.
echo Press Ctrl+C to stop
echo ============================================
echo.

REM Запустить API
set "PYTHON_EXE=D:\App\Python\Python311\python.exe"
"%PYTHON_EXE%" -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

REM Если скрипт здесь - значит произошла ошибка
if errorlevel 1 (
    echo.
    echo ERROR: Failed to start API server
    echo Check the error messages above
    pause
    exit /b 1
)

pause