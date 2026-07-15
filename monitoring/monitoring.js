require("dotenv").config();

const ModbusRTU = require("modbus-serial");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

// =========================================================================
// 1. KONFIGURASI SISTEM (DATABASE POSTGRESQL & ENVIRONMENT VARIABLES)
// =========================================================================
const PG_CONFIG = {
  user: process.env.PGUSER || "teraterapostgres",
  host: process.env.PGHOST || "104.214.173.123",
  database: process.env.PGDATABASE || "terahumi",
  password: process.env.PGPASSWORD || "T3r4huM1",
  port: Number(process.env.PGPORT || 5437),

  // Batas waktu koneksi/query untuk menghindari koneksi gantung
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 5000),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  max: Number(process.env.PG_POOL_MAX || 5),

  // Mencegah query berjalan terlalu lama di sisi server database (dalam milidetik)
  options: process.env.PG_OPTIONS || "-c statement_timeout=5000",
};

// Konfigurasi mode keamanan SSL untuk database jarak jauh (VPS)
const PGSSLMODE = (process.env.PGSSLMODE || "disable").toLowerCase();
if (PGSSLMODE !== "disable") {
  PG_CONFIG.ssl = { rejectUnauthorized: false };
}

// Konfigurasi Port Serial dan Protokol Modbus RTU
const SERIAL_PORT = process.env.SERIAL_PORT || "/dev/ttyUSB0"; // Port USB-to-RS485 adapter
const MODBUS_ID = Number(process.env.MODBUS_ID || 1);          // Slave ID Sensor (default: 1)

// Konfigurasi HTTP API Lokal Raspberry Pi (Opsional untuk Debugging)
const API_PORT = Number(process.env.API_PORT || 5000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

// Parameter Identitas Sensor & Sistem Waktu (Polling)
const SENSOR_ID = process.env.SENSOR_ID || "TH-001";
const ENABLE_HTTP_API = (process.env.ENABLE_HTTP_API || "true").toLowerCase() === "true";
const DEFAULT_LAT = Number(process.env.DEFAULT_LAT || -6.304904944290723);
const DEFAULT_LON = Number(process.env.DEFAULT_LON || 106.63349615981343);
const OFFLINE_AFTER_MS = Number(process.env.OFFLINE_AFTER_MS || 30_000); // Batas waktu status offline
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 10000);   // Interval polling (10 detik)

// =========================================================================
// 2. INSTANSIASI KLIEN (POSTGRESQL POOL & MODBUS SERIAL CLIENT)
// =========================================================================
const pgPool = new Pool(PG_CONFIG);
const modbus = new ModbusRTU();

// Event listener untuk menangkap error koneksi database yang sedang idle
pgPool.on("error", (err) => {
  console.error("❌ PG pool error (idle client):", err);
});

// =========================================================================
// 3. ROUTING HTTP API LOKAL (UNTUK KEBUTUHAN PENGUJIAN / HEALTHCHECK)
// =========================================================================
const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Endpoint Health Check: Memeriksa apakah Raspberry Pi terhubung ke VPS
app.get("/health", async (req, res) => {
  try {
    await pgPool.query("SELECT 1 as ok");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Endpoint Racks: Mengambil data telemetri terbaru dari database untuk pengujian lokal
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
    const { rows } = await pgPool.query(q);

    const now = Date.now();
    const result = rows.map((r, idx) => {
      const ts = new Date(r.time).getTime();
      const online = Number.isFinite(ts) && now - ts <= OFFLINE_AFTER_MS;

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

    res.json(result);
  } catch (e) {
    console.error("GET /api/racks error:", e);
    res.status(500).json({ message: "Failed to fetch racks", error: String(e) });
  }
});

// =========================================================================
// 4. LOGIKA UTAMA MONITORING (KONEKSI SERIAL MODBUS & POLLING LOOP)
// =========================================================================

/**
 * Fungsi koneksi Modbus RTU dengan mekanisme auto-retry
 * Jika USB-to-RS485 terlepas atau gagal inisialisasi, fungsi ini akan 
 * mencoba menghubungkan ulang setiap 5 detik secara terus-menerus.
 */
async function connectModbusWithRetry() {
  while (true) {
    try {
      await modbus.connectRTUBuffered(SERIAL_PORT, {
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: "even", // Konfigurasi paritas sensor LH-WS46-HW
      });
      modbus.setID(MODBUS_ID);
      modbus.setTimeout(1500); // Timeout respons pembacaan 1.5 detik
      console.log(`📡 Inisialisasi port berhasil. Monitoring sensor di ${SERIAL_PORT} (Modbus ID=${MODBUS_ID})...`);
      return;
    } catch (err) {
      console.error("❌ Gagal inisialisasi koneksi Modbus, mencoba ulang dalam 5 detik:", err?.message || err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/**
 * Fungsi Inisialisasi & Start Aplikasi
 */
async function start() {
  // A. Aktifkan HTTP API Lokal jika diizinkan di konfigurasi
  if (ENABLE_HTTP_API) {
    app.listen(API_PORT, () => {
      console.log(`✅ API Lokal berjalan: http://localhost:${API_PORT}`);
      console.log(`   - health: http://localhost:${API_PORT}/health`);
      console.log(`   - racks : http://localhost:${API_PORT}/api/racks`);
    });
  } else {
    console.log("ℹ️ HTTP API dinonaktifkan (ENABLE_HTTP_API=false)");
  }

  // B. Uji Koneksi Database PostgreSQL awal (Smoke Test)
  try {
    await pgPool.query("SELECT 1 as ok");
    console.log("✅ Uji koneksi awal database PostgreSQL berhasil (Pool Ready)");
  } catch (err) {
    console.error("⚠️ Koneksi database gagal di awal. Proses tetap berjalan dan akan mencoba ulang saat siklus pengiriman:", err?.message || err);
  }

  // C. Mulai koneksi serial Modbus
  await connectModbusWithRetry();

  let isReading = false; // Flag untuk mencegah penumpukan siklus pembacaan (overlap)

  // D. Siklus Pengambilan Data berkala (Polling Interval)
  setInterval(async () => {
    if (isReading) return; // Jika pembacaan siklus sebelumnya belum selesai, lewati siklus ini
    isReading = true;

    try {
      console.log("Mencoba melakukan pembacaan register sensor...");

      // Membaca 2 register berturut-turut mulai dari Address 0 (Address 0 = Suhu, Address 1 = Kelembapan)
      const r = await modbus.readHoldingRegisters(0, 2);
      console.log("✅ Data Modbus berhasil terbaca:", r.data);

      // LH-WS46-HW mengirimkan nilai integer dengan faktor skala 10 (contoh: 265 / 10 = 26.5)
      const temp = r.data[0] / 10;
      const hum = r.data[1] / 10;

      // Menyimpan data telemetri ke dalam format JSON di database PostgreSQL VPS
      const query = "INSERT INTO sensor_data(time, sensor_id, data) VALUES($1, $2, $3)";
      const values = [new Date(), SENSOR_ID, JSON.stringify({ temp, hum })];

      await pgPool.query(query, values);
      console.log(`[${new Date().toLocaleTimeString()}] Data Tersimpan: Suhu = ${temp}°C, Kelembapan = ${hum}%`);
    } catch (err) {
      console.error("❌ Gagal membaca sensor atau menyimpan data ke database:", err?.message || err);
      // Apabila terjadi error serial, inisialisasi ulang koneksi Modbus
      if (err?.message?.includes("port") || err?.message?.includes("Serial")) {
        console.log("⚠️ Masalah port terdeteksi, mencoba inisialisasi ulang serial...");
        await connectModbusWithRetry();
      }
    } finally {
      isReading = false; // Siklus selesai, reset flag status pembacaan
    }
  }, POLL_INTERVAL_MS);

  // E. Sistem Graceful Shutdown (Penanganan penghentian proses PM2 / Terminal secara aman)
  const shutdown = async () => {
    try {
      console.log("🛑 Menerima sinyal penghentian. Mematikan sistem secara aman...");
      try {
        modbus.close(() => { }); // Tutup koneksi serial Modbus
      } catch {}
      await pgPool.end(); // Tutup koneksi PostgreSQL Connection Pool
      console.log("✅ Koneksi ditutup. Program dihentikan.");
      process.exit(0);
    } catch (e) {
      process.exit(1);
    }
  };

  process.on("SIGINT", shutdown);  // Menangkap sinyal Ctrl+C
  process.on("SIGTERM", shutdown); // Menangkap sinyal stop dari PM2
}

// Menjalankan fungsi utama aplikasi
start().catch((err) => {
  console.error("❌ Fatal Error: Program utama gagal dijalankan:", err);
});