/*
// ESP32_Heater_DHT22.ino
// Код для работы нагревателя на 20% мощности с чтением DHT22

#include <Arduino.h>
#include <DHT.h>

#define HEATER_PIN_1 4      // GPIO2 для нагревателя
#define HEATER_PIN_2 5      // GPIO2 для нагревателя
#define DHT_PIN 22        // GPIO22 для DHT22
#define DHT_TYPE DHT22    // Тип датчика DHT22
#define TARGET_POWER 100   // 20% мощности

DHT dht(DHT_PIN, DHT_TYPE);

void setup() {
  Serial.begin(115200);
  
  // Инициализация DHT22
  dht.begin();
  Serial.println("DHT22 инициализирован");
  
  // Настройка ШИМ (новый API)
  ledcAttach(HEATER_PIN_1, 5000, 8); // Пин, частота 5 kHz, разрешение 8-bit
  // Настройка ШИМ (новый API)
  ledcAttach(HEATER_PIN_2, 5000, 8); // Пин, частота 5 kHz, разрешение 8-bit
  // Расчет ШИМ значения для 20%
  int pwmValue = (TARGET_POWER * 255) / 100;
  
  // Включение нагревателя на 20%
  Serial.println("Включение нагревателя на 20% мощности.. .");
  
  // Плавный старт
  for (int i = 254; i <= 255; i++) {
    ledcWrite(HEATER_PIN_1, i);  // Теперь используется PIN напрямую
    ledcWrite(HEATER_PIN_2, i);
    delay(10);
  }
  
  Serial.println("Нагреватель работает на 100% мощности");
  Serial.print("ШИМ значение: ");
  Serial.println(pwmValue);
  Serial.println("----------------------------");
}

void loop() {
  // Чтение данных с DHT22
  float humidity = dht.readHumidity();
  float temperature = dht. readTemperature();
  
  // Проверка успешности чтения
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("Ошибка чтения с DHT22!");
  } else {
    Serial.println("--- Показания датчика ---");
    Serial.print("Температура: ");
    Serial.print(temperature);
    Serial.println(" °C");
    Serial.print("Влажность:  ");
    Serial.print(humidity);
    Serial.println(" %");
    Serial.println("----------------------------");
  }
  
  delay(2000); // Обновление каждые 2 секунды (DHT22 рекомендует минимум 2 сек)
}
*/

/*
 * Система контроля термокамеры (Исправленная версия для ESP32 Core 3.0+)
 * Платформа: ESP32
 * Датчики: DHT22 (Pin 22), DS18B20 (Pin 23)
 * Нагреватели: 2 шт (Pin 4, Pin 5) с ШИМ-управлением
 */
/*
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <EEPROM.h>

// ==================== КОНФИГУРАЦИЯ ПИНОВ ====================
#define DHT_PIN           22     // Пин датчика DHT22
#define DS18B20_PIN       23     // Пин датчика DS18B20
#define HEATER1_PIN       4      // Нагреватель 1
#define HEATER2_PIN       5      // Нагреватель 2
#define BUZZER_PIN        19     // Пин пищалки
#define LED_ALARM_PIN     2      // Встроенный светодиод

// ==================== КОНФИГУРАЦИЯ ДАТЧИКОВ ====================
#define DHT_TYPE              DHT22
#define TEMP_READ_INTERVAL     2000  // Интервал считывания температуры (мс)
#define SERIAL_UPDATE_INTERVAL 1000  // Интервал вывода в консоль (мс)

// ==================== КОНФИГУРАЦИЯ ШИМ ====================
// Канал больше не указывается вручную в версии 3.0
#define PWM_FREQUENCY     1000   // 1 кГц
#define PWM_RESOLUTION    8      // 8 бит (0-255)

// ==================== КОНФИГУРАЦИЯ EEPROM ====================
#define EEPROM_SIZE       128
#define EEPROM_ADDRESS    0
#define SAVE_DELAY        5000

// ==================== ПРЕДЕЛЫ ТЕМПЕРАТУРЫ ====================
#define TEMP_MAX_BOTTOM   120.0
#define TEMP_MAX_TOP      80.0
#define TEMP_MIN          0.0
#define TEMP_DEFAULT      40.0

// ==================== КОЭФФИЦИЕНТЫ ФИЛЬТРА ====================
#define FILTER_ALPHA      0.1
#define OUTLIER_THRESHOLD 5.0

// ==================== РЕЖИМЫ РАБОТЫ ====================
enum OperationMode {
  MODE_STANDBY = 0,
  MODE_HEATING = 1,
  MODE_MAINTAINING = 2,
  MODE_ALARM = 3
};

// ==================== СТРУКТУРА НАСТРОЕК ====================
struct Settings {
  float temp_target;
  float Kp;
  float Ki;
  float Kd;
  float temp_max_bottom;
  float temp_max_top;
  uint8_t checksum;
};

// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
DHT dht(DHT_PIN, DHT_TYPE);
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);

// Температуры
float temp_top = 0.0;
float temp_bottom = 0.0;
float humidity = 0.0;
float temp_top_filtered = 0.0;
float temp_bottom_filtered = 0.0;

// ПИД
float temp_target = TEMP_DEFAULT;
float temp_error = 0.0;
float prev_error = 0.0;
float integral = 0.0;
float derivative = 0.0;
float pid_output = 0.0;

// Коэффициенты ПИД
float Kp = 25.0;
float Ki = 0.5;
float Kd = 10.0;

#define INTEGRAL_LIMIT 100.0

// Управление
uint8_t heater_power = 0;
bool heater_enabled = true;
OperationMode mode = MODE_STANDBY;
bool alarm_active = false;

// Сохранение настроек
Settings saved_settings;
bool settings_changed = false;
unsigned long last_settings_change = 0;
unsigned long last_save_time = 0;

// Таймеры
unsigned long last_temp_read = 0;
unsigned long last_serial_update = 0;
unsigned long pid_dt = 1000;

bool first_run = true;

// ==================== ПРОТОТИПЫ ====================
void readDHT22();
void readDS18B20();
void filterTemperatures();
void calculatePID();
void controlHeaters();
void checkOverheat();
void printDebugInfo();
void saveSettings();
void loadSettings();
uint8_t calculateChecksum(Settings* s);
void triggerAlarm();
void resetAlarm();
void processSerialCommands();
String getModeString(OperationMode m);

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Система контроля термокамеры (ESP32 Core 3.0+) ===");
  
  EEPROM.begin(EEPROM_SIZE);
  loadSettings();

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_ALARM_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_ALARM_PIN, LOW);

  // === ИСПРАВЛЕНИЕ: Новая инициализация ШИМ для ESP32 Core 3.0+ ===
  // ledcAttach(pin, freq, resolution) возвращает bool
  if (!ledcAttach(HEATER1_PIN, PWM_FREQUENCY, PWM_RESOLUTION)) {
    Serial.println("Ошибка инициализации PWM HEATER1");
  }
  if (!ledcAttach(HEATER2_PIN, PWM_FREQUENCY, PWM_RESOLUTION)) {
    Serial.println("Ошибка инициализации PWM HEATER2");
  }
  
  // Обнуляем выход
  ledcWrite(HEATER1_PIN, 0);
  ledcWrite(HEATER2_PIN, 0);

  dht.begin();
  ds18b20.begin();
  ds18b20.setResolution(12);
  ds18b20.setWaitForConversion(false);
  
  Serial.print("Найдено DS18B20: ");
  Serial.println(ds18b20.getDeviceCount());
  
  delay(2000); // Стабилизация

  readDHT22();
  ds18b20.requestTemperatures();
  delay(750);
  readDS18B20();
  
  temp_top_filtered = temp_top;
  temp_bottom_filtered = temp_bottom;
  first_run = false;
  ds18b20.requestTemperatures();

  Serial.println("Система готова. Введите HELP для списка команд.");
}

// ==================== LOOP ====================
void loop() {
  unsigned long current_time = millis();
  processSerialCommands();

  if (current_time - last_temp_read >= TEMP_READ_INTERVAL) {
    last_temp_read = current_time;
    
    readDHT22();
    readDS18B20();
    ds18b20.requestTemperatures();
    
    filterTemperatures();
    checkOverheat();
    
    if (mode != MODE_ALARM) {
      calculatePID();
    }
    
    controlHeaters();
  }

  // Вывод в консоль
  if (current_time - last_serial_update >= SERIAL_UPDATE_INTERVAL) {
    last_serial_update = current_time;
    printDebugInfo();
  }

  saveSettings();

  if (alarm_active) {
    triggerAlarm();
  }
}

// ==================== ФУНКЦИИ ====================
void readDHT22() {
  float temp_raw = dht.readTemperature();
  float hum_raw = dht.readHumidity();

  if (isnan(temp_raw) || isnan(hum_raw)) {
    Serial.println("Ошибка DHT22!");
    return;
  }
  if (temp_raw >= -40.0 && temp_raw <= 80.0 && hum_raw >= 0.0 && hum_raw <= 100.0) {
    temp_top = temp_raw;
    humidity = hum_raw;
  }
}

void readDS18B20() {
  float temp_raw = ds18b20.getTempCByIndex(0);
  if (temp_raw == DEVICE_DISCONNECTED_C || temp_raw == 85.0 || temp_raw == -127.0) return;
  temp_bottom = temp_raw;
}

void filterTemperatures() {
  if (abs(temp_top - temp_top_filtered) < OUTLIER_THRESHOLD) {
    temp_top_filtered += FILTER_ALPHA * (temp_top - temp_top_filtered);
  }
  if (abs(temp_bottom - temp_bottom_filtered) < OUTLIER_THRESHOLD) {
    temp_bottom_filtered += FILTER_ALPHA * (temp_bottom - temp_bottom_filtered);
  }
}

void calculatePID() {
  float dt = pid_dt / 1000.0;
  temp_error = temp_target - temp_bottom_filtered;

  float P = Kp * temp_error;
  
  integral += temp_error * dt;
  if (integral > INTEGRAL_LIMIT) integral = INTEGRAL_LIMIT;
  else if (integral < -INTEGRAL_LIMIT) integral = -INTEGRAL_LIMIT;
  
  float I = Ki * integral;

  derivative = (temp_error - prev_error) / dt;
  float D = Kd * derivative;

  pid_output = P + I + D;

  if (pid_output > 255.0) pid_output = 255.0;
  else if (pid_output < 0.0) pid_output = 0.0;

  prev_error = temp_error;

  if (heater_enabled && pid_output > 0) {
    mode = (abs(temp_error) < 1.0) ? MODE_MAINTAINING : MODE_HEATING;
  } else if (!heater_enabled || pid_output == 0) {
    if (mode != MODE_ALARM) mode = MODE_STANDBY;
  }
}

void controlHeaters() {
  uint8_t pwm_value;
  if (heater_enabled && mode != MODE_ALARM) {
    pwm_value = (uint8_t)pid_output;
  } else {
    pwm_value = 0;
    integral = 0;
  }
  
  // === ИСПРАВЛЕНИЕ: Запись значения ШИМ напрямую в пины ===
  ledcWrite(HEATER1_PIN, pwm_value);
  ledcWrite(HEATER2_PIN, pwm_value);
  
  heater_power = (pwm_value * 100) / 255;
}

void checkOverheat() {
  bool overheat = false;
  if (temp_bottom_filtered > saved_settings.temp_max_bottom) overheat = true;
  if (temp_top_filtered > saved_settings.temp_max_top) overheat = true;

  if (overheat) {
    heater_enabled = false;
    mode = MODE_ALARM;
    alarm_active = true;
    
    // Отключение обоих нагревателей
    ledcWrite(HEATER1_PIN, 0);
    ledcWrite(HEATER2_PIN, 0);
    
    Serial.println("!!! АВАРИЯ: ПЕРЕГРЕВ !!!");
  }
}

void triggerAlarm() {
  static unsigned long last_beep = 0;
  static bool beep_state = false;
  if (millis() - last_beep >= 500) {
    last_beep = millis();
    beep_state = !beep_state;
    digitalWrite(LED_ALARM_PIN, beep_state);
    digitalWrite(BUZZER_PIN, beep_state);
  }
}

void resetAlarm() {
  if (temp_bottom_filtered < (saved_settings.temp_max_bottom - 10.0) &&
      temp_top_filtered < (saved_settings.temp_max_top - 10.0)) {
    alarm_active = false;
    heater_enabled = true;
    mode = MODE_STANDBY;
    digitalWrite(LED_ALARM_PIN, LOW);
    digitalWrite(BUZZER_PIN, LOW);
    Serial.println("Авария сброшена.");
  }
}

void saveSettings() {
  if (!settings_changed || millis() - last_settings_change < SAVE_DELAY) return;
  saved_settings.temp_target = temp_target;
  saved_settings.Kp = Kp;
  saved_settings.Ki = Ki;
  saved_settings.Kd = Kd;
  saved_settings.checksum = calculateChecksum(&saved_settings);
  EEPROM.put(EEPROM_ADDRESS, saved_settings);
  EEPROM.commit();
  settings_changed = false;
  Serial.println("Настройки сохранены.");
}

void loadSettings() {
  EEPROM.get(EEPROM_ADDRESS, saved_settings);
  if (saved_settings.checksum == calculateChecksum(&saved_settings) &&
      saved_settings.temp_target <= TEMP_MAX_TOP) {
    temp_target = saved_settings.temp_target;
    Kp = saved_settings.Kp;
    Ki = saved_settings.Ki;
    Kd = saved_settings.Kd;
  } else {
    saved_settings.temp_target = TEMP_DEFAULT;
    saved_settings.Kp = 25.0;
    saved_settings.Ki = 0.5;
    saved_settings.Kd = 10.0;
    saved_settings.temp_max_bottom = TEMP_MAX_BOTTOM;
    saved_settings.temp_max_top = TEMP_MAX_TOP;
    temp_target = saved_settings.temp_target;
    Kp = saved_settings.Kp;
    Ki = saved_settings.Ki;
    Kd = saved_settings.Kd;
  }
}

uint8_t calculateChecksum(Settings* s) {
  uint8_t* ptr = (uint8_t*)s;
  uint8_t sum = 0;
  for (size_t i = 0; i < sizeof(Settings) - 1; i++) sum += ptr[i];
  return sum;
}

String getModeString(OperationMode m) {
  switch (m) {
    case MODE_STANDBY: return "STANDBY";
    case MODE_HEATING: return "HEATING";
    case MODE_MAINTAINING: return "HOLDING";
    case MODE_ALARM: return "ALARM";
    default: return "UNKNOWN";
  }
}

void printDebugInfo() {
  Serial.print("["); Serial.print(getModeString(mode)); Serial.println("]");
  Serial.print("Target: "); Serial.println(temp_target, 1);
  Serial.print("| DHT22 Temp: "); Serial.print(temp_top_filtered, 1); Serial.println("C");
  Serial.print("| Humidity: "); Serial.print(humidity, 0); Serial.println("%");
  Serial.print("| DHT22 Temp: "); Serial.print(temp_bottom_filtered, 1); Serial.println("C");
  Serial.print("| DS18B20 Temp: "); Serial.print(temp_bottom, 1); Serial.println("C");
  Serial.print("| Power: "); Serial.print(heater_power); Serial.println("%");
}

void processSerialCommands() {
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    if (command.startsWith("SET_TEMP ")) {
      temp_target = command.substring(9).toFloat();
      settings_changed = true;
      last_settings_change = millis();
    }
    else if (command == "START") heater_enabled = true;
    else if (command == "STOP") { 
      heater_enabled = false; 
      ledcWrite(HEATER1_PIN, 0); 
      ledcWrite(HEATER2_PIN, 0);
    }
    else if (command == "RESET") resetAlarm();
    else if (command.startsWith("SET_KP ")) { Kp = command.substring(7).toFloat(); settings_changed = true; Serial.println("KP = "); Serial.println(Kp);}
    else if (command.startsWith("SET_KI ")) { Ki = command.substring(7).toFloat(); settings_changed = true; Serial.println("KI = "); Serial.println(Ki);}
    else if (command.startsWith("SET_KD ")) { Kd = command.substring(7).toFloat(); settings_changed = true; Serial.println("KD = "); Serial.println(Kd);}
    else if (command == "HELP") {
      Serial.println("CMDS: SET_TEMP <v>, SET_KP <v>, START, STOP, RESET");
    }
  }
}

*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ==================== НАСТРОЙКИ WIFI ====================
const char* WIFI_SSID = "Lab3D";
const char* WIFI_PASS = "BBisWatching";

// ==================== НАСТРОЙКИ BACKEND ====================
// Ваша сеть: 10.19.84.76 / шлюз 10.19.84.65
// Укажите IP сервера backend (пример: 10.19.84.76) и порт (пример: 8000)
const char* SERVER_HOST = "10.19.84.76";
const uint16_t SERVER_PORT = 8000;

// printer_id должен существовать в PRINTER_CONFIGS backend
const char* PRINTER_ID = "creality_k1se";

// Токен должен проходить verify_token на backend
const char* API_TOKEN = "devtok_t-fexoDaWlnz9GtZKbi8-lHjELwQ0NVtamSpXTjq2ZE";

// Интервал отправки данных (мс)
const unsigned long SEND_INTERVAL_MS = 5000;

// ==================== ПИНЫ ДАТЧИКОВ ====================
#define DHT_PIN      22
#define DHT_TYPE     DHT22
#define DS18B20_PIN  23

// ==================== ОБЪЕКТЫ ДАТЧИКОВ ====================
DHT dht(DHT_PIN, DHT_TYPE);
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);

// ==================== ПЕРЕМЕННЫЕ ====================
unsigned long lastSendTime = 0;

// ==================== ФУНКЦИИ ====================
void connectWiFi() {
  Serial.print("Подключение к WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long startAttemptTime = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (millis() - startAttemptTime > 20000) {
      Serial.println("\nWiFi timeout, перезапуск попытки...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASS);
      startAttemptTime = millis();
    }
  }

  Serial.println("\nWiFi подключен!");
  Serial.print("IP ESP32: ");
  Serial.println(WiFi.localIP());
}

bool sendSensorReading(float dhtTemp, float dhtHum, float dsTemp, bool dsValid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi не подключен, попытка переподключения...");
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) return false;
  }

  HTTPClient http;
  String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT +
               "/api/printer/" + PRINTER_ID + "/sensor-reading";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + API_TOKEN);

  StaticJsonDocument<256> doc;
  doc["dht22_temperature"] = dhtTemp;
  doc["dht22_humidity"] = dhtHum;

  if (dsValid) {
    doc["ds18b20_temperature"] = dsTemp;
  } else {
    // Модель backend допускает Optional[float], можно отправить null
    doc["ds18b20_temperature"] = nullptr;
  }

  String payload;
  serializeJson(doc, payload);

  Serial.print("POST ");
  Serial.println(url);
  Serial.print("Payload: ");
  Serial.println(payload);

  int httpCode = http.POST(payload);
  String response = http.getString();
  http.end();

  Serial.print("HTTP code: ");
  Serial.println(httpCode);
  Serial.print("Response: ");
  Serial.println(response);

  return (httpCode >= 200 && httpCode < 300);
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== ESP32 Sensor Sender ===");

  dht.begin();
  ds18b20.begin();
  ds18b20.setResolution(12);

  connectWiFi();
}

void loop() {
  unsigned long now = millis();

  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = now;

    // Чтение DHT22
    float dhtTemp = dht.readTemperature();
    float dhtHum = dht.readHumidity();

    if (isnan(dhtTemp) || isnan(dhtHum)) {
      Serial.println("Ошибка чтения DHT22, пакет не отправлен.");
      return;
    }

    // Чтение DS18B20
    ds18b20.requestTemperatures();
    float dsTemp = ds18b20.getTempCByIndex(0);
    bool dsValid = !(dsTemp == DEVICE_DISCONNECTED_C || dsTemp == -127.0 || dsTemp == 85.0);

    Serial.print("DHT22 T/H: ");
    Serial.print(dhtTemp, 2);
    Serial.print(" C / ");
    Serial.print(dhtHum, 2);
    Serial.println(" %");

    if (dsValid) {
      Serial.print("DS18B20 T: ");
      Serial.print(dsTemp, 2);
      Serial.println(" C");
    } else {
      Serial.println("DS18B20: нет валидного значения");
    }

    bool ok = sendSensorReading(dhtTemp, dhtHum, dsTemp, dsValid);
    if (ok) {
      Serial.println("Данные успешно отправлены.\n");
    } else {
      Serial.println("Ошибка отправки данных.\n");
    }
  }
}