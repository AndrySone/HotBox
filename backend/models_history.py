from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from sqlalchemy.sql import func
from backend.db import Base

class PrintHistory(Base):
    __tablename__ = "print_history"

    id = Column(Integer, primary_key=True, index=True)
    printer_id = Column(String, index=True, nullable=False)
    printer_name = Column(String, nullable=False)

    filename = Column(String, nullable=True)     # gcode filename
    material = Column(String, nullable=True)

    status = Column(String, nullable=False)      # printing/complete/failed/canceled/etc
    progress = Column(Float, nullable=True)

    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    duration_sec = Column(Float, nullable=True)

    filament_used_mm = Column(Float, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)


class DefectHistory(Base):
    __tablename__ = "defect_history"

    id = Column(Integer, primary_key=True, index=True)
    printer_id = Column(String, index=True, nullable=False)
    printer_name = Column(String, nullable=False)

    filename = Column(String, nullable=True)
    material = Column(String, nullable=True)

    prediction = Column(String, nullable=False)  # defect / no_defect
    confidence = Column(Float, nullable=False)

    image_path = Column(String, nullable=True)   # путь к сохраненному jpg/png

    nozzle_temp = Column(Float, nullable=True)
    bed_temp = Column(Float, nullable=True)
    dht22_temp = Column(Float, nullable=True)
    dht22_humidity = Column(Float, nullable=True)
    ds18b20_temp = Column(Float, nullable=True)

    note = Column(Text, nullable=True)           # "возможные причины..."

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # NEW: отметка экспорта в датасет
    exported_label = Column(String, nullable=True)   # "defected" | "no_defected"
    exported_path = Column(String, nullable=True)    # относительный путь от BASE_DIR
    exported_at = Column(DateTime, nullable=True)