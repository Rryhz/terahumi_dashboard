const ModbusRTU = require("modbus-serial");
const express = require("express");
const cors = require("cors");
const { Client } = require("pg");

// ======================
// CONFIG (gunakan ENV)
// ======================
const PG_CONFIG = {
  user: process.env.PGUSER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "terahumi",
  password: process.env.PGPASSWORD || "T3r4huM1",
  port: Number(process.env.PGPORT || 5432),
};

const SERIAL_PORT = process.env.SERIAL_PORT || "/dev/ttyUSB0";
const MODBUS_ID = Number(process.env.MODBUS_ID || 1);

const API_PORT = Number(process.env.API_PORT || 5000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

const DEFAULT_LAT = -6.304904944290723;
const DEFAULT_LON = 106.63349615981343;

// ======================
// Clients
// ======================
const pgClient = new Client(PG_CONFIG);
const modbus = new ModbusRTU();

// ======================
// HTTP API
// ======================
const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get("/health", async (req, res) => {
  // cek DB simple
  try {
    await pgClient.query("SELECT 1 as ok");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Endpoint untuk React: ambil latest data per sensor_id
app.get("/api/racks", async (req, res) => {
  try {
    const q = `
      SELECT DISTINCT ON (sensor_id)
        sensor_id,
        time,
        (data->>'temp')::float AS temp,
        (data->>'hum')::float  AS hum
      FROM sensor_data
      ORDER BY sensor_id, time DESC;
    `;

    const { rows } = await pgClient.query(q);

    // status online/offline berdasarkan data terakhir (mis. 30 detik)
    const now = Date.now();
    const OFFLINE_AFTER_MS = 30_000;

    const result = rows.map((r, idx) => {
      const ts = new Date(r.time).getTime();
      const online = Number.isFinite(ts) && (now - ts) <= OFFLINE_AFTER_MS;

      return {
        id: idx + 1,
        sensor_id: r.sensor_id,
        name: `Rack ${r.sensor_id}`,
        temp: r.temp ?? 0,
        hum: r.hum ?? 0,
        status: online ? "Online" : "Offline",
        pos: [DEFAULT_LAT, DEFAULT_LON],
        last_time: r.time,
      };
    });

    res.json(result); // HARUS array
  } catch (e) {
    console.error("GET /api/racks error:", e);
    res.status(500).json({ message: "Failed to fetch racks", error: String(e) });
  }
});

// ======================
// Monitoring loop
// ======================
async function start() {
  try {
    await pgClient.connect();
    console.log("✅ Terhubung ke PostgreSQL");

    // Jalankan API
    app.listen(API_PORT, () => {
      console.log(`✅ API running: http://localhost:${API_PORT}`);
      console.log(`   - health: http://localhost:${API_PORT}/health`);
      console.log(`   - racks : http://localhost:${API_PORT}/api/racks`);
    });

    // Connect Modbus
    await modbus.connectRTUBuffered(SERIAL_PORT, {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "even",
    });
    modbus.setID(MODBUS_ID);
    modbus.setTimeout(1500);
    console.log(`📡 Monitoring sensor di ${SERIAL_PORT} (modbus id=${MODBUS_ID})...`);

    let isReading = false;

    setInterval(async () => {
      if (isReading) return;
      isReading = true;

      try {
        console.log("Mencoba membaca sensor...");

        const r = await modbus.readHoldingRegisters(0, 2);
        const temp = r.data[0] / 10;
        const hum = r.data[1] / 10;

        const query = "INSERT INTO sensor_data(time, sensor_id, data) VALUES($1, $2, $3)";
        const SENSOR_ID = process.env.SENSOR_ID || "TH-001";
        const values = [new Date(), SENSOR_ID, JSON.stringify({ temp, hum })];

        await pgClient.query(query, values);
        console.log(`[${new Date().toLocaleTimeString()}] Data Tersimpan: ${temp}°C, ${hum}%`);
      } catch (err) {
        console.error("❌ Gagal baca sensor/simpan data:", err);
      } finally {
        isReading = false;
      }
    }, 5000);
  } catch (err) {
    console.error("❌ Error Inisialisasi:", err.message);
    process.exitCode = 1;
  }
}

start();