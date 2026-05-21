"""
FastAPI сервер с интеграцией Klipper/Fluidd API с аутентификацией.
Получает реальные данные о печати и температурах.
"""

from pathlib import Path
import io
import os
import numpy as np
from PIL import Image
import keras
from keras import layers
from keras.applications import DenseNet201
from keras.applications.densenet import preprocess_input as densenet_preprocess_input
import tensorflow as tf
import logging
import httpx
import asyncio
import json
from fastapi import FastAPI, HTTPException, UploadFile, Depends, Header,  File, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from datetime import datetime, timedelta
import secrets
from typing import Optional, Dict, List, Literal
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.orm import Session
from sqlalchemy import desc, text
from backend.db import engine, SessionLocal, Base
from backend.models_history import PrintHistory, DefectHistory

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Создать приложение
app = FastAPI(
    title="3D Print Monitor",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
    redoc_url="/redoc"
)

# ===== CORS КОНФИГУРАЦИЯ =====
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# ===== PRINTER CONFIGURATIONS =====

PRINTER_CONFIGS = {
    "creality_k1se": {
        "name": "Creality K1SE",
        "type": "FDM (High Speed)",
        "model": "K1SE",
        "manufacturer": "Creality",
        "features": [
            "High-speed printing",
            "Leveling-free",
            "Sprite extruder",
            "Auto-calibration"
        ],
        "max_nozzle_temp": 300,
        "max_bed_temp": 100,
        "print_area": "235x235x250mm",
        # Fluidd API
        "fluidd_url": "http://10.19.84.68:7125",
        "api_key": "e9d902901dae4566ab0a0ebb5f59c815",
        # Webcam
        "webcam_url": "http://10.19.84.68:4408/webcam/?action=stream&cacheBust=1776251366839",
        "webcam_type": "mjpeg",
        "webcam_fps": 10
    },
    "wanhao_i3": {
        "name": "Wanhao Duplicator i3",
        "type": "FDM (Precision)",
        "model": "Duplicator i3",
        "manufacturer": "Wanhao",
        "features": [
            "Precision printing",
            "Stable frame",
            "Standard hotend",
            "Community support"
        ],
        "max_nozzle_temp": 280,
        "max_bed_temp": 110,
        "print_area": "200x200x200mm",
        # Fluidd API
        "fluidd_url": "http://10.19.84.69:7125",
        "api_key": "c6cde38871834e91b2a3fd092d03c4b8",
        # Webcam
        "webcam_url": "http://10.19.84.69/go2rtc/api/stream.mjpeg?src=camera2",
        "webcam_type": "mjpeg",
        "webcam_fps": 10
    },
    "creality_ender3": {
        "name": "Creality Ender 3",
        "type": "FDM (Budget)",
        "model": "Ender 3 (V2/V3)",
        "manufacturer": "Creality",
        "features": [
            "Budget-friendly",
            "Reliable",
            "Open-source community",
            "Highly customizable"
        ],
        "max_nozzle_temp": 260,
        "max_bed_temp": 100,
        "print_area": "235x235x250mm",
        # Fluidd API
        "fluidd_url": "http://10.19.84.69:7126",
        "api_key": "bd1e25d4f6d343339a5d2bd529700660",
        # Webcam
        "webcam_url": "http://10.19.84.69/go2rtc/api/stream.mjpeg?src=camera1",
        "webcam_type": "mjpeg",
        "webcam_fps": 10
    }
}

PRINTERS_DB_PATH = Path(__file__).resolve().parent / "printers.json"

# Пауза один раз на файл (в памяти)
PAUSED_BY_DEFECT = {}  # printer_id -> filename

# Хранилище текущих показаний датчиков
SENSOR_READINGS = {
    "creality_k1se": {
        "dht22_temperature": 22.5,
        "dht22_humidity": 45.0,
        "ds18b20_temperature": 22.3,
        "timestamp": datetime.now().isoformat()
    },
    "wanhao_i3": {
        "dht22_temperature": 23.0,
        "dht22_humidity": 48.0,
        "ds18b20_temperature": 22.8,
        "timestamp": datetime.now().isoformat()
    },
    "creality_ender3": {
        "dht22_temperature": 21.5,
        "dht22_humidity": 42.0,
        "ds18b20_temperature": 21.2,
        "timestamp": datetime.now().isoformat()
    }
}

# Материалы и их параметры (из G-кода)
MATERIAL_SETTINGS = {
    "PLA": {
        "nozzle_temp": 200,
        "bed_temp": 60,
        "speed": 50,
        "fan_speed": 100,
        "chamber_temp": 25,          # NEW
        "humidity_min": 30,          # NEW
        "humidity_max": 45,          # NEW
        "description": "PLA - Polylactic Acid (общий пластик)"
    },
    "PETG": {
        "nozzle_temp": 235,
        "bed_temp": 70,
        "speed": 40,
        "fan_speed": 50,
        "chamber_temp": 35,
        "humidity_min": 20,
        "humidity_max": 35,
        "description": "PETG - Polyethylene Terephthalate Glycol"
    },
    "ABS": {
        "nozzle_temp": 240,
        "bed_temp": 100,
        "speed": 30,
        "fan_speed": 0,
        "chamber_temp": 50,
        "humidity_min": 10,
        "humidity_max": 25,
        "description": "ABS - Acrylonitrile Butadiene Styrene"
    },
    "TPU": {
        "nozzle_temp": 220,
        "bed_temp": 60,
        "speed": 20,
        "fan_speed": 30,
        "chamber_temp": 30,
        "humidity_min": 10,
        "humidity_max": 20,
        "description": "TPU - Thermoplastic Polyurethane (гибкий)"
    },
    "Nylon": {
        "nozzle_temp": 250,
        "bed_temp": 85,
        "speed": 25,
        "fan_speed": 20,
        "chamber_temp": 45,
        "humidity_min": 5,
        "humidity_max": 15,
        "description": "Nylon - Прочный пластик"
    }
}

# Пути (main.py лежит в backend/main.py)
BASE_DIR = Path(__file__).resolve().parent.parent
CKPT_DIR = BASE_DIR / "models" / "densenet201_ckpt"
WEIGHTS_PATH = BASE_DIR / "models" / "final_DenseNet201_no_aug.weights.h5"
MODEL_INPUT_SIZE = (380, 380)  # фиксировано по твоим метаданным

DEFECT_MODEL = None

# ===== MODELS =====

class LoginRequest(BaseModel):
    """Модель для логина."""
    username: str
    password: str


class LoginResponse(BaseModel):
    """Модель ответа при логине."""
    access_token: str
    user: dict
    message: str

class SensorReading(BaseModel):
    """Модель для получения показаний датчиков."""
    dht22_temperature: float  # Температура окружающей среды (°C)
    dht22_humidity: float     # Влажность окружающей среды (%)
    ds18b20_temperature: Optional[float] = None  # Дополнительный датчик температуры (°C)


class PrinterCommand(BaseModel):
    """Модель для команд принтера."""
    command: str  # pause, resume, cancel, restart
    message: Optional[str] = None


class AddPrinterRequest(BaseModel):
    id: str
    name: str
    manufacturer: str
    model: str

    # Moonraker base url, например: http://192.168.1.50:7125
    fluidd_url: str
    api_key: str

    # опционально
    location: Optional[str] = ""
    webcam_url: Optional[str] = ""
    webcam_type: Optional[str] = "mjpeg"
    webcam_fps: Optional[int] = 10

    defect_action: Optional[Literal["notify", "pause"]] = "notify"
    max_nozzle_temp: Optional[int] = 260
    max_bed_temp: Optional[int] = 100
    print_area: Optional[str] = ""
    features: Optional[List[str]] = []
    type: Optional[str] = "FDM"

class UpdateDefectActionRequest(BaseModel):
    defect_action: Literal["notify", "pause"]

class ExportToDatasetRequest(BaseModel):
    label: str  # "defected" | "no_defected"

# ===== FAKE DATABASE =====

VALID_USERS = {
    "admin": {
        "password": "admin123",
        "email": "admin@printmonitor.com",
        "role": "admin",
        "id": "user_1"
    },
    "user": {
        "password": "user123",
        "email": "user@printmonitor.com",
        "role": "user",
        "id": "user_2"
    }
}

def ensure_defect_history_export_columns():
    """
    Авто-миграция для SQLite: добавляет колонки в defect_history,
    если они отсутствуют. Без Alembic.
    """
    cols = set()
    with engine.connect() as conn:
        res = conn.execute(text("PRAGMA table_info(defect_history)"))
        for row in res:
            # row = (cid, name, type, notnull, dflt_value, pk)
            cols.add(row[1])

        alters = []
        if "exported_label" not in cols:
            alters.append("ALTER TABLE defect_history ADD COLUMN exported_label VARCHAR")
        if "exported_path" not in cols:
            alters.append("ALTER TABLE defect_history ADD COLUMN exported_path VARCHAR")
        if "exported_at" not in cols:
            alters.append("ALTER TABLE defect_history ADD COLUMN exported_at DATETIME")

        for sql in alters:
            conn.execute(text(sql))
        conn.commit()

Base.metadata.create_all(bind=engine)
ensure_defect_history_export_columns()

# Хранилище активных токенов
ACTIVE_TOKENS = {}

DEVICE_TOKENS = {}

# ===== AUTHENTICATION FUNCTIONS =====

def generate_token():
    """Генерировать токен."""
    return secrets.token_urlsafe(32)

def load_device_tokens_from_env() -> Dict[str, dict]:
    """
    Читает DEVICE_TOKENS из .env
    Формат: printer_id:token,printer_id:token
    Возвращает dict вида {token: {"printer_id": "...", "enabled": True}}
    """
    raw = os.getenv("DEVICE_TOKENS", "").strip()
    result: Dict[str, dict] = {}

    if not raw:
        return result

    pairs = [p.strip() for p in raw.split(",") if p.strip()]
    for pair in pairs:
        if ":" not in pair:
            continue
        printer_id, token = pair.split(":", 1)
        printer_id = printer_id.strip()
        token = token.strip()
        if printer_id and token:
            result[token] = {
                "printer_id": printer_id,
                "enabled": True
            }
    return result
        

DEVICE_TOKENS = load_device_tokens_from_env()


def verify_token_value(token: str) -> dict:
    # 1) Device token
    device = DEVICE_TOKENS.get(token)
    if device and device.get("enabled"):
        return {
            "type": "device",
            "printer_id": device["printer_id"]
        }

    # 2) User token
    if token not in ACTIVE_TOKENS:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_data = ACTIVE_TOKENS[token]
    if user_data["expires"] < datetime.now():
        del ACTIVE_TOKENS[token]
        raise HTTPException(status_code=401, detail="Token expired")

    return {
        "type": "user",
        **user_data["user"]
    }

def verify_token(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    try:
        scheme, token = authorization.split(" ", 1)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid authorization format")

    if scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization scheme")

    return verify_token_value(token)

def verify_token_query(token: str = Query(None)) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    logger.info(f"verify_token_query: token_present={bool(token)}")
    return verify_token_value(token)

# ===== KLIPPER API HELPERS =====

def load_printers_from_file():
    global PRINTER_CONFIGS
    if PRINTERS_DB_PATH.exists():
        try:
            with open(PRINTERS_DB_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                PRINTER_CONFIGS.update(data)
                for _, cfg in PRINTER_CONFIGS.items():
                    cfg.setdefault("defect_action", "notify")
                logger.info(f"Loaded {len(data)} printers from {PRINTERS_DB_PATH}")
        except Exception as e:
            logger.error(f"Failed to load printers.json: {e}")

def save_printers_to_file():
    try:
        with open(PRINTERS_DB_PATH, "w", encoding="utf-8") as f:
            json.dump(PRINTER_CONFIGS, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Failed to save printers.json: {e}")

load_printers_from_file()

async def get_klipper_data(printer_id: str) -> Optional[Dict]:
    """
    Получить данные из Moonraker Klipper API.
    Используется endpoint: /printer/objects/query?extruder&heater_bed&print_stats&gcode_move&toolhead
    """
    if printer_id not in PRINTER_CONFIGS:
        logger.error(f"Printer {printer_id} not found in config")
        return None
    
    config = PRINTER_CONFIGS[printer_id]
    moonraker_url = config["fluidd_url"]
    api_key = config.get("api_key")
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {
                "Content-Type": "application/json",
            }
            
            if api_key:
                headers["X-API-KEY"] = api_key
            
            # Правильный endpoint для получения всех необходимых данных
            api_url = f"{moonraker_url}/printer/objects/query?extruder&heater_bed&print_stats&virtual_sdcard&gcode_move&toolhead"
            
            logger.info(f"[{printer_id}] Fetching from {api_url}")
            
            response = await client.get(api_url, headers=headers, timeout=5.0)
            
            logger.info(f"[{printer_id}] Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                # Moonraker возвращает данные в формате {"result": {"status": {...}}}
                if "result" in data and "status" in data["result"]:
                    logger.info(f"[{printer_id}] Successfully got printer data")
                    return data["result"]["status"]
                else:
                    logger.warning(f"[{printer_id}] Unexpected response structure")
                    return None
            
            elif response.status_code == 401:
                logger.error(f"[{printer_id}] Authentication failed - invalid API key")
                return None
            else:
                logger.warning(f"[{printer_id}] Status {response.status_code}")
                return None
    
    except asyncio.TimeoutError:
        logger.error(f"[{printer_id}] Timeout connecting to {moonraker_url}")
        return None
    except httpx.ConnectError as e:
        logger.error(f"[{printer_id}] Connection refused to {moonraker_url}")
        return None
    except Exception as e:
        logger.error(f"[{printer_id}] Error: {type(e).__name__}: {e}")
        return None


def parse_klipper_data(klipper_status: Dict, printer_id: str) -> Dict:
    """
    Парсить данные из Moonraker /printer/objects/query endpoint.

    elapsed:
      - print_stats.print_duration (секунды)
    progress:
      - предпочитаем print_stats.progress (0..1)
      - если он отсутствует/0, fallback на virtual_sdcard.progress (0..1)
    esttotal:
      - elapsed / progress (если progress > 0)
    """

    extruder = klipper_status.get("extruder", {})
    heater_bed = klipper_status.get("heater_bed", {})
    print_stats = klipper_status.get("print_stats", {})
    gcode_move = klipper_status.get("gcode_move", {})
    toolhead = klipper_status.get("toolhead", {})
    virtual_sdcard = klipper_status.get("virtual_sdcard", {})  # важно: запрос должен включать virtual_sdcard

    # ---- STATUS ----
    raw_state = (print_stats.get("state") or "idle").lower()
    allowed = {
        "printing", "paused", "idle", "error", "standby",
        "complete", "cancelled", "canceled", "failed"
    }
    print_status = raw_state if raw_state in allowed else "idle"

    filename = print_stats.get("filename", "")
    filament_used = float(print_stats.get("filament_used", 0) or 0)
    z_pos = float(print_stats.get("z_pos", 0) or 0)

    material = detect_material_from_filename(filename)
    material_settings = MATERIAL_SETTINGS.get(material) if material else None

    # ---- TIME (elapsed) ----
    elapsed_seconds = float(print_stats.get("print_duration", 0) or 0)
    total_duration = float(print_stats.get("total_duration", 0) or 0)  # optional

    # ---- PROGRESS helper ----
    def _to_progress_0_1(v) -> float:
        if isinstance(v, (int, float)):
            return max(0.0, min(1.0, float(v)))
        return 0.0

    # 1) пробуем print_stats.progress
    progress_0_1 = _to_progress_0_1(print_stats.get("progress", None))

    # 2) fallback: virtual_sdcard.progress, если print_stats пустой/нулевой
    # (порог 0.0001 чтобы отсечь "0" и "почти 0")
    if progress_0_1 <= 0.0001:
        progress_0_1 = _to_progress_0_1(virtual_sdcard.get("progress", None))

    progress_percent = progress_0_1 * 100.0

    # ---- EST TOTAL / REMAINING ----
    esttotal_seconds = 0.0
    remaining_seconds = 0.0

    elapsed_time = "0m"
    remaining_time = "N/A"

    if print_status in ("printing", "paused"):
        elapsed_hours = int(elapsed_seconds // 3600)
        elapsed_minutes = int((elapsed_seconds % 3600) // 60)
        elapsed_time = f"{elapsed_hours}h {elapsed_minutes}m" if elapsed_hours > 0 else f"{elapsed_minutes}m"

        if progress_0_1 > 0.0:
            esttotal_seconds = elapsed_seconds / progress_0_1
            remaining_seconds = max(0.0, esttotal_seconds - elapsed_seconds)

            remaining_hours = int(remaining_seconds // 3600)
            remaining_minutes = int((remaining_seconds % 3600) // 60)
            remaining_time = f"{remaining_hours}h {remaining_minutes}m" if remaining_hours > 0 else f"{remaining_minutes}m"
        else:
            remaining_time = "расчет..."

    # ---- POSITION ----
    gcode_position = gcode_move.get("gcode_position", [0, 0, 0, 0])
    z_height = float(gcode_position[2] if len(gcode_position) > 2 else 0)

    logger.info(
        f"[{printer_id}] Status: {print_status}, Progress: {progress_percent:.2f}%, "
        f"elapsed={elapsed_seconds:.1f}s, esttotal={esttotal_seconds:.1f}s"
    )

    return {
        "status": print_status,
        "temperatures": {
            "nozzle": round(float(extruder.get("temperature", 0)), 1),
            "bed": round(float(heater_bed.get("temperature", 0)), 1),
            "nozzle_target": round(float(extruder.get("target", 0)), 1),
            "bed_target": round(float(heater_bed.get("target", 0)), 1),
        },
        "printing": {
            "filename": filename,

            # То, что вы просили:
            "elapsed": round(elapsed_seconds, 1),          # seconds
            "progress": round(progress_percent, 2),        # percent
            "esttotal": round(esttotal_seconds, 1),        # seconds

            # Полезные дополнения:
            "remaining": round(remaining_seconds, 1),      # seconds
            "elapsed_time": elapsed_time,
            "remaining_time": remaining_time,
            "total_time": round(total_duration, 1),
        },
        "material": {
            "name": material,
            "settings": material_settings,
            "detected_from_filename": True if material else False
        },
        "position": {
            "z_height": round(float(z_height), 2),
            "z_pos": round(float(z_pos), 2),
        },
        "filament_used": round(float(filament_used), 1),
        "print_stats": print_status,
    }

def detect_material_from_filename(filename: str) -> Optional[str]:
    """
    Определить материал из имени файла G-кода.
    
    Примеры:
    - "model_PLA_2h30m.gcode" -> "PLA"
    - "part_PETG_3h25m.gcode" -> "PETG"
    - "object_ABS.gcode" -> "ABS"
    """
    if not filename:
        return None
    
    filename_upper = filename.upper()
    
    for material in MATERIAL_SETTINGS.keys():
        if material in filename_upper:
            logger.info(f"Detected material from filename: {material}")
            return material
    
    # Если материал не найден, вернуть None
    return None

def build_snapshot_url(webcam_url: str) -> str:
    if not webcam_url:
        return ""
    # Fluidd/Mainsail
    if "action=stream" in webcam_url:
        return webcam_url.replace("action=stream", "action=snapshot")
    # go2rtc
    if "/stream.mjpeg" in webcam_url:
        return webcam_url.replace("/stream.mjpeg", "/stream.jpeg")
    return webcam_url


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ===== Presigen =====

def build_densenet201_binary(input_shape=(380, 380, 3)):
    """
    Архитектура должна совпадать с той, под которую сохранены веса.
    """
    base_model = DenseNet201(
        weights="imagenet",
        include_top=False,
        input_shape=input_shape
    )
    base_model.trainable = False

    inputs = keras.Input(shape=input_shape, name="image")
    x = base_model(inputs, training=False)
    x = layers.GlobalAveragePooling2D(name="gap")(x)
    x = layers.BatchNormalization(name="bn")(x)
    x = layers.Dense(512, activation="relu", name="dense_512")(x)
    x = layers.Dropout(0.4, name="drop_04")(x)
    x = layers.Dense(256, activation="relu", name="dense_256")(x)
    x = layers.Dropout(0.3, name="drop_03")(x)
    outputs = layers.Dense(1, activation="sigmoid", name="pred")(x)

    model = keras.Model(inputs, outputs, name="DenseNet201_binary")
    return model


def get_defect_model():
    global DEFECT_MODEL

    if DEFECT_MODEL is not None:
        return DEFECT_MODEL

    model = build_densenet201_binary((380, 380, 3))
    model.build((None, 380, 380, 3))

    # Находим последний чекпоинт в папке
    latest = tf.train.latest_checkpoint(str(CKPT_DIR))
    if not latest:
        raise FileNotFoundError(f"No checkpoint found in: {CKPT_DIR}")

    ckpt = tf.train.Checkpoint(model=model)
    status = ckpt.restore(latest)

    # важно: проверяем что все веса на месте
    status.expect_partial()  # если хочешь строгую проверку — убери expect_partial и сделай assert_consumed()
    # status.assert_consumed()  # строгий вариант

    DEFECT_MODEL = model
    return DEFECT_MODEL

def preprocess_image_for_model(image_bytes: bytes) -> np.ndarray:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image = image.resize(MODEL_INPUT_SIZE)  # (380, 380)

    arr = np.asarray(image).astype("float32")  # 0..255
    arr = np.expand_dims(arr, axis=0)          # (1, 380, 380, 3)

    # ВАЖНО для DenseNet (imagenet-style)
    arr = densenet_preprocess_input(arr)

    return arr

async def send_pause_command_to_printer(printer_id: str):
    """
    Поставить печать на паузу через Moonraker.
    Используем тот же подход, что и /api/printer/{id}/command: gcode script.
    """
    config = PRINTER_CONFIGS.get(printer_id)
    if not config:
        raise HTTPException(status_code=404, detail="Printer not found")

    moonraker_url = config.get("fluidd_url")
    api_key = config.get("api_key")

    if not moonraker_url:
        raise HTTPException(status_code=400, detail="No fluidd_url configured")

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-KEY"] = api_key

    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.post(
            f"{moonraker_url}/printer/gcode/script",
            headers=headers,
            json={"script": "PAUSE"},
        )
        if resp.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"Pause failed: {resp.status_code} {resp.text}")


# ===== Middleware для логирования =====

@app.middleware("http")
async def log_requests(request, call_next):
    """Логировать все запросы."""
    logger.info(f"{request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"Response: {response.status_code}")
    return response


# ===== ROOT ENDPOINT =====

@app.get("/", response_class=HTMLResponse)
async def root():
    """Главная страница."""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>3D Print Monitor API</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 1000px;
                margin: 0 auto;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #333;
            }
            .container {
                background: white;
                border-radius: 10px;
                padding: 30px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            }
            h1 { color: #667eea; margin-top: 0; }
            .status { background: #c8e6c9; color: #2e7d32; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #4CAF50; }
            .link-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
            .link-box { background: #f5f5f5; padding: 15px; border-radius: 5px; border: 2px solid #ddd; }
            .link-box a { color: #667eea; text-decoration: none; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🖨️ 3D Print Monitor API</h1>
            <div class="status">✓ Server is running with Fluidd API Key Authentication</div>
            <div class="link-grid">
                <div class="link-box"><a href="/docs">📚 Swagger UI</a></div>
                <div class="link-box"><a href="/api/test">🧪 Test</a></div>
            </div>
        </div>
    </body>
    </html>
    """


@app.get("/api")
async def api_root():
    """API root информация."""
    return {
        "name": "3D Print Monitor API",
        "version": "1.0.0",
        "status": "running",
        "authentication": "Fluidd API Keys",
        "supported_printers": list(PRINTER_CONFIGS.keys())
    }


# ===== SYSTEM ENDPOINTS =====

@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.get("/api/test")
async def test():
    """Тестовый endpoint."""
    return {
        "status": "ok",
        "message": "Backend is working",
        "supported_printers": list(PRINTER_CONFIGS.keys())
    }


@app.get("/api/health/printers")
async def check_all_printers():
    """Проверить здоровье всех принтеров."""
    results = {}
    
    for printer_id, config in PRINTER_CONFIGS.items():
        fluidd_url = config["fluidd_url"]
        api_key = config["api_key"]
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                headers = {"X-API-KEY": api_key}
                response = await client.get(f"{fluidd_url}/api/printer", headers=headers)
                
                results[printer_id] = {
                    "status": "online" if response.status_code == 200 else "error",
                    "fluidd_url": fluidd_url,
                    "http_status": response.status_code
                }
        except Exception as e:
            results[printer_id] = {
                "status": "offline",
                "fluidd_url": fluidd_url,
                "error": str(e)
            }
    
    return results


# ===== AUTH ENDPOINTS =====

@app.post("/api/auth/login", response_model=LoginResponse)
async def login(credentials: LoginRequest):
    """Вход в систему."""
    logger.info(f"Login attempt: {credentials.username}")
    
    user = VALID_USERS.get(credentials.username)
    
    if not user or user["password"] != credentials.password:
        logger.warning(f"Invalid credentials for: {credentials.username}")
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = generate_token()
    user_info = {
        "id": user["id"],
        "username": credentials.username,
        "email": user["email"],
        "role": user["role"]
    }
    
    ACTIVE_TOKENS[token] = {
        "user": user_info,
        "expires": datetime.now() + timedelta(hours=24)
    }
    
    logger.info(f"Login successful: {credentials.username}")
    
    return LoginResponse(
        access_token=token,
        user=user_info,
        message="Login successful"
    )


@app.post("/api/auth/logout")
async def logout(user: dict = Depends(verify_token)):
    """Выход из системы."""
    return {"message": "Logout successful"}


@app.get("/api/auth/me")
async def get_current_user(user: dict = Depends(verify_token)):
    """Получить информацию о текущем пользователе."""
    return user


# ===== PRINTER ENDPOINTS =====

@app.get("/api/printers")
async def get_printers(user: dict = Depends(verify_token)):
    """Получить список всех принтеров."""
    logger.info(f"Getting printers for user: {user['username']}")
    
    printers = []
    
    for printer_id, config in PRINTER_CONFIGS.items():
        klipper_data = await get_klipper_data(printer_id)
        
        if klipper_data:
            parsed_data = parse_klipper_data(klipper_data, printer_id)
            status = parsed_data["status"]
            nozzle_temp = parsed_data["temperatures"]["nozzle"]
            bed_temp = parsed_data["temperatures"]["bed"]
            progress = parsed_data["printing"]["progress"]
        else:
            status = "offline"
            nozzle_temp = 0
            bed_temp = 0
            progress = 0
            parsed_data = None
        
        printer = {
            "id": printer_id,
            "name": config["name"],
            "type": config["type"],
            "manufacturer": config["manufacturer"],
            "status": status,
            "location": config.get("location", ""),  # <-- ВАЖНО: вместо "198a"
            "model": config["model"],
            "features": config.get("features", []),
            "temperatures": {
                "nozzle": nozzle_temp,
                "bed": bed_temp,
            },
            "fluidd_url": config["fluidd_url"],
            "last_update": datetime.now().isoformat()
        }
        
        if parsed_data:
            printer.update({
                "printing": bool(parsed_data.get("printing", {}).get("filename")),
                "progress": progress,
                "remaining_time": parsed_data["printing"].get("remaining_time"),
            })
        
        printers.append(printer)
    
    return {"printers": printers}


@app.post("/api/printers")
async def add_printer(req: AddPrinterRequest, user: dict = Depends(verify_token)):
    # ОСТАВИТЬ (сохраняет в json через save_printers_to_file)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    printer_id = req.id.strip()
    if not printer_id:
        raise HTTPException(status_code=400, detail="id is required")

    if printer_id in PRINTER_CONFIGS:
        raise HTTPException(status_code=409, detail="Printer with this id already exists")

    PRINTER_CONFIGS[printer_id] = {
        "name": req.name,
        "type": req.type or "FDM",
        "manufacturer": req.manufacturer,
        "model": req.model,
        "location": req.location or "",
        "features": req.features or [],
        "defect_action": req.defect_action or "notify",
        "max_nozzle_temp": req.max_nozzle_temp or 260,
        "max_bed_temp": req.max_bed_temp or 100,
        "print_area": req.print_area or "",
        "fluidd_url": req.fluidd_url,
        "api_key": req.api_key,
        "webcam_url": req.webcam_url or "",
        "webcam_type": req.webcam_type or "mjpeg",
        "webcam_fps": req.webcam_fps or 10,
    }

    save_printers_to_file()
    return {"status": "ok", "printer_id": printer_id}


@app.get("/api/printer/{printer_id}")
async def get_printer_detail(printer_id: str, user: dict = Depends(verify_token)):
    """Получить детали принтера."""
    if printer_id not in PRINTER_CONFIGS:
        raise HTTPException(status_code=404, detail=f"Printer '{printer_id}' not found")
    
    config = PRINTER_CONFIGS[printer_id]
    
    klipper_data = await get_klipper_data(printer_id)
    
    if not klipper_data:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to Fluidd at {config['fluidd_url']}"
        )
    
    parsed_data = parse_klipper_data(klipper_data, printer_id)
    
    return {
        "id": printer_id,
        "name": config["name"],
        "type": config["type"],
        "manufacturer": config["manufacturer"],
        "model": config["model"],
        "features": config["features"],
        "specs": {
            "max_nozzle_temp": config["max_nozzle_temp"],
            "max_bed_temp": config["max_bed_temp"],
            "print_area": config["print_area"],
            "webcam_url": config["webcam_url"],
            "webcam_type": config["webcam_type"],
            "webcam_fps": config["webcam_fps"]
        },
        "status": parsed_data["status"],
        "defect_action": config.get("defect_action", "notify"),
        "temperatures": parsed_data["temperatures"],
        "printing": parsed_data["printing"],
        "material": parsed_data["material"],
        "position": parsed_data["position"],
        "filament_used": parsed_data["filament_used"],
        "fluidd_url": config["fluidd_url"],
        "last_update": datetime.now().isoformat()
    }


@app.patch("/api/printer/{printer_id}/defect-action")
async def update_defect_action(
    printer_id: str,
    req: UpdateDefectActionRequest,
    user: dict = Depends(verify_token)
):
    """
    Обновить действие при обнаружении дефекта для конкретного принтера.
    Используется чекбоксом на фронте.
    """
    if printer_id not in PRINTER_CONFIGS:
        raise HTTPException(status_code=404, detail=f"Printer '{printer_id}' not found")

    # если хочешь ограничить только админам — раскомментируй:
    # if user.get("role") != "admin":
    #     raise HTTPException(status_code=403, detail="Admin only")

    PRINTER_CONFIGS[printer_id]["defect_action"] = req.defect_action

    # сохраняем в printers.json
    save_printers_to_file()

    return {
        "status": "ok",
        "printer_id": printer_id,
        "defect_action": req.defect_action
    }


@app.get("/api/printer/{printer_id}/sensors")
async def get_printer_sensors(printer_id: str, user: dict = Depends(verify_token)):
    """Получить показания датчиков принтера."""
    if printer_id not in PRINTER_CONFIGS:
        raise HTTPException(status_code=404, detail=f"Printer '{printer_id}' not found")
    
    config = PRINTER_CONFIGS[printer_id]
    klipper_data = await get_klipper_data(printer_id)
    
    if not klipper_data:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to Fluidd at {config['fluidd_url']}"
        )
    
    parsed_data = parse_klipper_data(klipper_data, printer_id)
    
    return {
        "printer_id": printer_id,
        "timestamp": datetime.now().isoformat(),
        "temperatures": {
            "nozzle": {
                "current": parsed_data["temperatures"]["nozzle"],
                "target": parsed_data["temperatures"]["nozzle_target"]
            },
            "bed": {
                "current": parsed_data["temperatures"]["bed"],
                "target": parsed_data["temperatures"]["bed_target"]
            }
        },
        "position": parsed_data["position"],
        "filament_used": parsed_data["filament_used"],
        "status": parsed_data["status"]
    }


@app.get("/api/printer/{printer_id}/webcam")
async def get_printer_webcam(printer_id: str, user: dict = Depends(verify_token)):
    """Получить информацию о веб-камере."""
    if printer_id not in PRINTER_CONFIGS:
        raise HTTPException(status_code=404, detail=f"Printer '{printer_id}' not found")
    
    config = PRINTER_CONFIGS[printer_id]
    
    return {
        "printer_id": printer_id,
        "webcam": {
            "url": config["webcam_url"],
            "type": config["webcam_type"],
            "fps": config["webcam_fps"]
        }
    }


@app.get("/api/printer/{printer_id}/test-connection")
async def test_printer_connection(printer_id: str, user: dict = Depends(verify_token)):
    """Тестировать подключение."""
    if printer_id not in PRINTER_CONFIGS:
        raise HTTPException(status_code=404, detail=f"Printer '{printer_id}' not found")
    
    config = PRINTER_CONFIGS[printer_id]
    fluidd_url = config["fluidd_url"]
    api_key = config["api_key"]
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            headers = {"X-API-KEY": api_key}
            response = await client.get(f"{fluidd_url}/api/printer", headers=headers)
            
            if response.status_code == 200:
                return {
                    "status": "ok",
                    "printer_id": printer_id,
                    "fluidd_url": fluidd_url,
                    "message": "Successfully connected to Fluidd"
                }
            else:
                return {
                    "status": "error",
                    "printer_id": printer_id,
                    "fluidd_url": fluidd_url,
                    "message": f"Fluidd returned status {response.status_code}"
                }
    
    except Exception as e:
        return {
            "status": "error",
            "printer_id": printer_id,
            "fluidd_url": fluidd_url,
            "message": f"Connection failed: {str(e)}"
        }


@app.post("/api/printer/{printer_id}/sensor-reading")
async def receive_sensor_reading(
    printer_id: str,
    data: SensorReading,
    user: dict = Depends(verify_token)
):
    if printer_id not in PRINTER_CONFIGS:
        raise HTTPException(status_code=404, detail=f"Printer '{printer_id}' not found")
    
    if user.get("type") == "device":
        if user.get("printer_id") != printer_id:
            raise HTTPException(status_code=403, detail="Device token is not allowed for this printer")

    # Если это device-token — разрешаем только свой printer_id
    if user.get("type") == "device" and user.get("printer_id") != printer_id:
        raise HTTPException(status_code=403, detail="Device token is not allowed for this printer")

    SENSOR_READINGS[printer_id] = {
        "dht22_temperature": data.dht22_temperature,
        "dht22_humidity": data.dht22_humidity,
        "ds18b20_temperature": data.ds18b20_temperature,
        "timestamp": datetime.now().isoformat()
    }

    return {"status": "ok", "printer_id": printer_id}


@app.get("/api/printer/{printer_id}/sensors-live")
async def get_live_sensors(printer_id: str, user: dict = Depends(verify_token)):
    """
    Получить текущие показания датчиков окружающей среды.
    """
    if printer_id not in PRINTER_CONFIGS:
        raise HTTPException(status_code=404, detail=f"Printer '{printer_id}' not found")
    
    reading = SENSOR_READINGS.get(printer_id, {})
    
    return {
        "printer_id": printer_id,
        "timestamp": reading.get("timestamp", datetime.now().isoformat()),
        "dht22": {
            "temperature": reading.get("dht22_temperature", 0),
            "humidity": reading.get("dht22_humidity", 0),
            "unit": {"temperature": "°C", "humidity": "%"},
            "description": "Ambient temperature and humidity"
        },
        "ds18b20": {
            "temperature": reading.get("ds18b20_temperature"),
            "unit": "°C",
            "description": "Additional temperature sensor"
        } if reading.get("ds18b20_temperature") is not None else None
    }


@app.post("/api/printer/{printer_id}/command")
async def send_printer_command(
    printer_id: str,
    cmd: PrinterCommand,
    user: dict = Depends(verify_token)
):
    """
    Отправить команду принтеру.
    
    Доступные команды:
    - pause: Пауза печати
    - resume: Возобновить печать
    - cancel: Остановить печать
    - restart: Перезагрузить принтер
    
    POST /api/printer/creality_k1se/command
    {
        "command": "pause",
        "message": "User requested pause"
    }
    """
    if printer_id not in PRINTER_CONFIGS:
        raise HTTPException(status_code=404, detail=f"Printer '{printer_id}' not found")
    
    config = PRINTER_CONFIGS[printer_id]
    moonraker_url = config["fluidd_url"]
    api_key = config.get("api_key")
    
    # Маппинг команд на Klipper G-коды
    command_map = {
        "pause": {"gcode": "PAUSE"},
        "resume": {"gcode": "RESUME"},
        "cancel": {"gcode": "CANCEL_PRINT"},
        "restart": {"gcode": "FIRMWARE_RESTART"}
    }
    
    if cmd.command not in command_map:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown command: {cmd.command}. Allowed: {list(command_map.keys())}"
        )
    
    gcode_cmd = command_map[cmd.command]["gcode"]
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["X-API-KEY"] = api_key
            
            # Отправить G-код команду через Moonraker
            response = await client.post(
                f"{moonraker_url}/printer/gcode/script",
                headers=headers,
                json={"script": gcode_cmd}
            )
            
            logger.info(f"[{printer_id}] Command '{cmd.command}' sent: {gcode_cmd}")
            
            if response.status_code in [200, 204]:
                return {
                    "status": "ok",
                    "message": f"Command '{cmd.command}' sent successfully",
                    "printer_id": printer_id,
                    "command": cmd.command,
                    "gcode": gcode_cmd,
                    "timestamp": datetime.now().isoformat()
                }
            else:
                logger.error(f"[{printer_id}] Command failed: {response.status_code} - {response.text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to send command: {response.text}"
                )
    
    except asyncio.TimeoutError:
        logger.error(f"[{printer_id}] Command timeout")
        raise HTTPException(status_code=504, detail="Command timeout")
    except Exception as e:
        logger.error(f"[{printer_id}] Command error: {e}")
        raise HTTPException(status_code=500, detail=f"Error sending command: {str(e)}")


@app.get("/api/materials")
async def get_materials(user: dict = Depends(verify_token)):
    """
    Получить список известных материалов и их параметры.
    """
    return {
        "materials": MATERIAL_SETTINGS,
        "count": len(MATERIAL_SETTINGS)
    }


@app.get("/api/alerts")
async def get_alerts(user: dict = Depends(verify_token)):
    """Получить оповещения."""
    return {"alerts": []}

@app.post("/api/defect/predict")
async def predict_defect(
    file: UploadFile = File(...),
    user: dict = Depends(verify_token)
):
    try:
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")

        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty file")

        x = preprocess_image_for_model(content)
        model = get_defect_model()

        # sigmoid output: shape (1, 1)
        defect_prob = float(model.predict(x, verbose=0)[0][0])
        defect_prob = max(0.0, min(1.0, defect_prob))
        no_defect_prob = 1.0 - defect_prob

        if defect_prob >= 0.5:
            prediction = "defect"
            confidence = defect_prob
        else:
            prediction = "no_defect"
            confidence = no_defect_prob

        return {
            "status": "ok",
            "filename": file.filename,
            "prediction": prediction,
            "confidence": round(confidence, 4),
            "probabilities": {
                "no_defect": round(no_defect_prob, 4),
                "defect": round(defect_prob, 4),
            },
            "threshold": 0.5,
            "input_size": MODEL_INPUT_SIZE,
            "model": "DenseNet201",
        }

    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")

@app.post("/api/printer/{printer_id}/defect/check")
async def defect_check_and_log(
    printer_id: str,
    user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    if printer_id not in PRINTER_CONFIGS:
        raise HTTPException(status_code=404, detail="Printer not found")

    config = PRINTER_CONFIGS[printer_id]

    # 1) Проверяем, что печатает
    klipper_data = await get_klipper_data(printer_id)
    if not klipper_data:
        raise HTTPException(status_code=503, detail="Klipper offline")

    parsed = parse_klipper_data(klipper_data, printer_id)
    if parsed.get("status") != "printing":
        # сбрасываем "paused by defect", если печать закончилась/остановилась
        PAUSED_BY_DEFECT.pop(printer_id, None)
        return {"status": "skip", "reason": "not_printing"}

    filename = (parsed.get("printing") or {}).get("filename") or ""

    # 2) Snapshot URL
    webcam_url = config.get("webcam_url", "")
    snapshot_url = build_snapshot_url(webcam_url)
    if not snapshot_url:
        raise HTTPException(status_code=400, detail="No webcam_url configured")

    # 3) Тянем кадр
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(snapshot_url)
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Snapshot HTTP {r.status_code}")
            image_bytes = r.content
            if not image_bytes:
                raise HTTPException(status_code=502, detail="Snapshot is empty")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch snapshot: {e}")

    # 4) Предикт
    x = preprocess_image_for_model(image_bytes)
    model = get_defect_model()

    defect_prob = float(model.predict(x, verbose=0)[0][0])
    defect_prob = max(0.0, min(1.0, defect_prob))
    no_defect_prob = 1.0 - defect_prob

    if defect_prob >= 0.5:
        prediction = "defect"
        confidence = defect_prob
    else:
        prediction = "no_defect"
        confidence = no_defect_prob

    # 5) Собираем причины из датчиков/материала
    live = SENSOR_READINGS.get(printer_id, {})
    note_parts = []

    mat = (parsed.get("material") or {}).get("name")
    mat_settings = (parsed.get("material") or {}).get("settings") or {}

    hum = live.get("dht22_humidity")
    chamber = live.get("ds18b20_temperature")
    target_chamber = mat_settings.get("chamber_temp")
    hum_max = mat_settings.get("humidity_max")

    if isinstance(hum, (int, float)) and isinstance(hum_max, (int, float)) and hum > hum_max:
        note_parts.append(f"влажность высокая ({hum}% > {hum_max}%)")
    if isinstance(chamber, (int, float)) and isinstance(target_chamber, (int, float)) and chamber < target_chamber:
        note_parts.append(f"температура камеры низкая ({chamber}°C < {target_chamber}°C)")

    note = "; ".join(note_parts) if note_parts else None

    # 6) Авто-пауза (если включено) — ОДИН РАЗ НА ТЕКУЩИЙ ФАЙЛ
    action = config.get("defect_action", "notify")  # notify|pause
    paused = False
    pause_error = None

    if prediction == "defect" and action == "pause":
        already_paused_for_file = (PAUSED_BY_DEFECT.get(printer_id) == filename and filename)
        if not already_paused_for_file:
            try:
                await send_pause_command_to_printer(printer_id)
                paused = True
                if filename:
                    PAUSED_BY_DEFECT[printer_id] = filename
            except Exception as e:
                pause_error = str(e)

    # 7) Сохраняем изображение на диск
    defects_dir = Path(__file__).resolve().parent / "data" / "defects" / printer_id
    defects_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    img_rel = Path("data") / "defects" / printer_id / f"{ts}.jpg"
    img_abs = (Path(__file__).resolve().parent / img_rel).resolve()

    with open(img_abs, "wb") as f:
        f.write(image_bytes)

    # 8) Пишем в БД
    row = DefectHistory(
        printer_id=printer_id,
        printer_name=config.get("name", printer_id),
        filename=filename or None,
        material=mat,
        prediction=prediction,
        confidence=round(float(confidence), 4),
        image_path=str(img_rel).replace("\\", "/"),
        nozzle_temp=(parsed.get("temperatures") or {}).get("nozzle"),
        bed_temp=(parsed.get("temperatures") or {}).get("bed"),
        dht22_temp=live.get("dht22_temperature"),
        dht22_humidity=live.get("dht22_humidity"),
        ds18b20_temp=live.get("ds18b20_temperature"),
        note=note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "status": "ok",
        "logged": True,
        "defect_id": row.id,
        "prediction": prediction,
        "confidence": round(float(confidence), 4),
        "image_url": f"/api/defects/image/{row.id}",
        "note": note,
        "action": action,
        "paused": paused,
        "pause_error": pause_error,
    }


@app.post("/api/dataset/defects/{defect_id}/export")
async def export_defect_to_dataset(
    defect_id: int,
    req: ExportToDatasetRequest,
    user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    label = (req.label or "").strip()
    if label not in ("defected", "no_defected"):
        raise HTTPException(status_code=400, detail="label must be 'defected' or 'no_defected'")

    row = db.query(DefectHistory).filter(DefectHistory.id == defect_id).first()
    if not row or not row.image_path:
        raise HTTPException(status_code=404, detail="Defect record/image not found")

    # Если уже экспортировали — не экспортируем повторно, если файл есть
    if row.exported_at and row.exported_label and row.exported_path:
        exported_abs = Path(row.exported_path)
        if not exported_abs.is_absolute():
            exported_abs = (BASE_DIR / exported_abs).resolve()

        if exported_abs.exists():
            return {
                "status": "already_exported",
                "defect_id": row.id,
                "label": row.exported_label,
                "output_path": str(exported_abs),
                "exported_at": row.exported_at.isoformat(),
                "size": MODEL_INPUT_SIZE,
            }
        else:
            # файл удалили вручную — сбрасываем отметку и экспортируем заново
            row.exported_at = None
            row.exported_label = None
            row.exported_path = None
            db.add(row)
            db.commit()
            db.refresh(row)

    src_path = (Path(__file__).resolve().parent / row.image_path).resolve()
    if not src_path.exists():
        raise HTTPException(status_code=404, detail="Source image missing on disk")

    dataset_root = BASE_DIR / "models" / "dataset"
    out_dir = dataset_root / label
    out_dir.mkdir(parents=True, exist_ok=True)

    safe_printer = (row.printer_id or "printer").replace("/", "_").replace("\\", "_")
    out_name = f"defect_{row.id}_{safe_printer}.jpg"
    out_path = (out_dir / out_name).resolve()

    try:
        img = Image.open(src_path).convert("RGB")
        img = img.resize(MODEL_INPUT_SIZE)  # (380, 380)
        img.save(out_path, format="JPEG", quality=95)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export image: {e}")

    # Запись отметок в БД
    try:
        rel_path = out_path.relative_to(BASE_DIR)
        rel_path_str = str(rel_path).replace("\\", "/")
    except Exception:
        rel_path_str = str(out_path).replace("\\", "/")

    row.exported_label = label
    row.exported_path = rel_path_str
    row.exported_at = datetime.now()

    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "status": "ok",
        "defect_id": row.id,
        "label": label,
        "output_path": str(out_path),
        "exported_at": row.exported_at.isoformat(),
        "size": MODEL_INPUT_SIZE,
    }

# ===== HISTORY ENDPOINTS =====

@app.get("/api/history/prints")
async def get_print_history(user: dict = Depends(verify_token), db: Session = Depends(get_db)):
    rows = db.query(PrintHistory).order_by(desc(PrintHistory.created_at)).limit(300).all()
    return {
        "history": [
            {
                "id": r.id,
                "printer_id": r.printer_id,
                "printer": r.printer_name,
                "model": r.filename or "—",
                "material": r.material or "—",
                "status": r.status,
                "date": r.created_at.strftime("%Y-%m-%d"),
                "time": r.created_at.strftime("%H:%M:%S"),
                "duration_sec": r.duration_sec,
                "filament_mm": r.filament_used_mm,
            }
            for r in rows
        ]
    }

# ===== MOONRAKER HISTORY (per-printer) =====

async def fetch_moonraker_history(printer_id: str, limit: int = 5) -> dict:
    """
    Берёт последние limit печатей из Moonraker history для конкретного принтера.
    Возвращает dict: {printer_id, printer_name, history, error}
    """
    cfg = PRINTER_CONFIGS.get(printer_id) or {}
    base_url = cfg.get("fluidd_url")
    api_key = cfg.get("api_key")

    result = {
        "printer_id": printer_id,
        "printer_name": cfg.get("name", printer_id),
        "history": [],
        "error": None,
    }

    if not base_url:
        result["error"] = "no_fluidd_url"
        return result

    headers = {"Content-Type": "application/json"}
    if api_key:
        # у тебя везде используется X-API-KEY (Moonraker обычно принимает X-Api-Key тоже)
        headers["X-API-KEY"] = api_key

    url = f"{base_url.rstrip('/')}/server/history/list?limit={limit}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, headers=headers)
            if r.status_code != 200:
                result["error"] = f"http_{r.status_code}"
                return result

            data = r.json()
            jobs = (data.get("result") or {}).get("jobs") or []

            # нормализуем в компактный формат
            result["history"] = [
                {
                    "filename": j.get("filename") or "—",
                    "status": j.get("status") or "—",
                    "start_time": j.get("start_time"),        # unix sec
                    "end_time": j.get("end_time"),            # unix sec
                    "print_duration": j.get("print_duration"),# sec
                    "total_duration": j.get("total_duration"),# sec
                    "filament_used": j.get("filament_used"),  # обычно mm
                }
                for j in jobs
            ]
            return result

    except asyncio.TimeoutError:
        result["error"] = "timeout"
        return result
    except httpx.ConnectError:
        result["error"] = "connect_error"
        return result
    except Exception as e:
        result["error"] = f"{type(e).__name__}: {e}"
        return result


@app.get("/api/history/moonraker/prints")
async def get_moonraker_print_history_all(
    user: dict = Depends(verify_token),
    limit: int = Query(5, ge=1, le=50),
):
    """
    Последние `limit` печатей для КАЖДОГО принтера из PRINTER_CONFIGS.
    Источник — Moonraker /server/history/list.
    """
    printer_ids = list(PRINTER_CONFIGS.keys())

    tasks = [fetch_moonraker_history(pid, limit=limit) for pid in printer_ids]
    per_printer = await asyncio.gather(*tasks)

    return {"per_printer": per_printer}

@app.get("/api/history/defects")
async def get_defect_history(user: dict = Depends(verify_token), db: Session = Depends(get_db)):
    rows = db.query(DefectHistory).order_by(desc(DefectHistory.created_at)).limit(300).all()
    return {
        "history": [
            {
                "id": r.id,
                "printer_id": r.printer_id,
                "printer": r.printer_name,
                "model": r.filename or "—",
                "material": r.material or "—",
                "prediction": r.prediction,
                "confidence": r.confidence,
                "image_url": f"/api/defects/image/{r.id}" if r.image_path else None,
                "params": {
                    "nozzle_temp": r.nozzle_temp,
                    "bed_temp": r.bed_temp,
                    "dht22_temp": r.dht22_temp,
                    "dht22_humidity": r.dht22_humidity,
                    "ds18b20_temp": r.ds18b20_temp,
                },
                "note": r.note,
                "date": r.created_at.strftime("%Y-%m-%d"),
                "time": r.created_at.strftime("%H:%M:%S"),
            }
            for r in rows
        ]
    }

@app.get("/api/defects/image/{defect_id}")
async def get_defect_image(
    defect_id: int,
    user: dict = Depends(verify_token_query),
    db: Session = Depends(get_db)
):
    row = db.query(DefectHistory).filter(DefectHistory.id == defect_id).first()
    if not row or not row.image_path:
        raise HTTPException(status_code=404, detail="Image not found")

    img_path = (Path(__file__).resolve().parent / row.image_path).resolve()
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Image file missing on disk")

    return FileResponse(str(img_path))

if __name__ == "__main__":
    import uvicorn
    
    print("\n" + "="*70)
    print("🖨️  3D PRINT MONITOR API - FLUIDD INTEGRATION")
    print("="*70)
    print("\n✓ Connected Printers:")
    for printer_id, config in PRINTER_CONFIGS.items():
        print(f"   • {config['name']} ({printer_id})")
        print(f"     Fluidd: {config['fluidd_url']}")
        print(f"     API Key: {config['api_key'][:10]}...")
    print("\n✓ Authentication: Fluidd API Keys")
    print("\n📍 Available at: http://localhost:8000")
    print("📚 Documentation: http://localhost:8000/docs")
    print("\n" + "="*70 + "\n")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )