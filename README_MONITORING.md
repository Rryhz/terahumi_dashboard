# Dokumentasi Gateway Edge - Raspberry Pi (terahumi-monitoring)

Dokumentasi ini menjelaskan alur kerja, instalasi, dan konfigurasi skrip `monitoring.js` pada perangkat Raspberry Pi 3 yang bertindak sebagai *Edge Gateway* untuk membaca data sensor LH-WS46-HW menggunakan protokol Modbus RTU dan mengirimkannya ke database PostgreSQL di VPS.

---

## 📋 Alur Kerja Sistem (Edge-to-Cloud)

Sistem ini berjalan dengan mengirimkan data telemetri dari perangkat fisik di lapangan (Edge) ke VPS Cloud secara berkala dengan urutan alur kerja sebagai berikut:

1. **Inisialisasi**:
   - `monitoring.js` dimuat menggunakan Node.js (direkomendasikan dikelola oleh `PM2`).
   - Skrip membaca konfigurasi lingkungan dari file `.env` (atau menggunakan nilai default).
   - Skrip menginisialisasi *database connection pool* ke PostgreSQL VPS dan melakukan koneksi serial ke USB-to-RS485 adapter pada port `/dev/ttyUSB0` (dengan toleransi *auto-retry* 5 detik jika gagal).
2. **Siklus Pembacaan (Polling Loop)**:
   - Setiap **10 detik** (berdasarkan variabel `POLL_INTERVAL_MS`), skrip membaca *Holding Registers* pada address `0` (Suhu) dan `1` (Kelembapan) dari sensor Modbus RTU (Slave ID = 1).
   - Data mentah bertipe integer dari sensor dibagi dengan faktor skala **10** (contoh: nilai `257` diterjemahkan sebagai `25.7°C`).
3. **Pengiriman Data (Ingestion)**:
   - Data suhu dan kelembapan dikemas dalam format JSON.
   - Skrip melakukan perintah `INSERT` langsung ke tabel `sensor_data` pada database PostgreSQL VPS secara aman dengan parameter terproteksi (*SQL Injection safe*).
4. **Fault Tolerance (Ketahanan Error)**:
   - Jika koneksi database terputus atau sensor terlepas, blok `try-catch` akan menangkap error tersebut, mencatatnya ke konsol log, dan melepaskan kunci status (`isReading = false`). Sistem akan terus berjalan dan mencoba kembali pada siklus 10 detik berikutnya tanpa memicu crash aplikasi.

---

## 🛠️ Panduan Instalasi (Langkah demi Langkah)

### Langkah 1: Persiapan OS & Node.js di Raspberry Pi
Pastikan Raspberry Pi Anda terhubung ke jaringan internet, lalu jalankan perintah berikut di Terminal:

```bash
# Update package list & upgrade sistem
sudo apt update && sudo apt upgrade -y

# Install Node.js LTS (Versi 18 ke atas) menggunakan NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verifikasi instalasi Node.js dan NPM
node -v
npm -v
```

### Langkah 2: Menyalin Kode ke Raspberry Pi
Buat direktori kerja di Raspberry Pi (misalnya `/home/pi/monitoring`) dan salin file-file berikut dari repositori Anda ke dalam direktori tersebut:
- `monitoring.js`
- `package.json` (atau inisialisasi package baru)

Jika Anda ingin menginisialisasi dari awal:
```bash
# Masuk ke folder kerja
cd /home/pi/monitoring

# Install modul Node.js yang diperlukan
npm install modbus-serial pg express cors dotenv
```

---

## ⚙️ Panduan Konfigurasi `.env`

Buat file bernama `.env` di direktori yang sama dengan `monitoring.js` untuk mengonfigurasi parameter IP VPS, interval baca, dan pengaturan komunikasi Modbus.

### Struktur File `.env`
```env
# ==== KONFIGURASI DATABASE POSTGRESQL (VPS) ====
PGUSER=teraterapostgres
PGHOST=104.214.173.123
PGDATABASE=terahumi
PGPASSWORD=T3r4huM1
PGPORT=5437
PG_CONNECT_TIMEOUT_MS=5000
PG_IDLE_TIMEOUT_MS=30000
PG_POOL_MAX=5

# ==== KONFIGURASI KOMUNIKASI MODBUS ====
SERIAL_PORT=/dev/ttyUSB0
MODBUS_ID=1
SENSOR_ID=TH-001

# ==== SISTEM INTERVAL ====
# Nilai dalam milidetik (10000 ms = 10 detik)
POLL_INTERVAL_MS=10000
OFFLINE_AFTER_MS=30000

# ==== KONFIGURASI API LOKAL (OPSIONAL) ====
ENABLE_HTTP_API=false
API_PORT=5000
CORS_ORIGIN=http://localhost:3000
```

### Penjelasan Variabel Kunci:
1. **IP & Port VPS (`PGHOST` & `PGPORT`)**:
   - `PGHOST`: Alamat IP Publik VPS tempat database PostgreSQL berada (`104.214.173.123`).
   - `PGPORT`: Port PostgreSQL VPS (`5437`).
2. **Interval Baca (`POLL_INTERVAL_MS`)**:
   - Menentukan seberapa sering Raspberry Pi membaca sensor. Nilai bawaan adalah `10000` (10 detik) untuk menjaga keseimbangan antara performa *real-time* dan efisiensi penyimpanan database.
3. **Konfigurasi Modbus (`SERIAL_PORT` & `MODBUS_ID`)**:
   - `SERIAL_PORT`: Jalur port USB-to-RS485 adapter pada Raspberry Pi (biasanya `/dev/ttyUSB0`). Anda bisa mengeceknya dengan perintah `ls /dev/ttyUSB*`.
   - `MODBUS_ID`: ID Slave sensor LH-WS46-HW (bawaannya `1`).

---

## 🌐 Dokumentasi REST API Lokal

Jika `ENABLE_HTTP_API` diatur ke `true`, program `monitoring.js` akan menjalankan server HTTP mini berbasis Express pada Raspberry Pi (default port: `5000`). Ini digunakan untuk tujuan debugging atau verifikasi lokal:

### 1. Health Check
* **Endpoint:** `GET /health`
* **Deskripsi:** Memeriksa status koneksi internet/database dari Raspberry Pi ke PostgreSQL VPS.
* **Format Respons (JSON):**
  ```json
  {
    "ok": true
  }
  ```

### 2. Telemetri Terakhir (Latest Telemetry)
* **Endpoint:** `GET /api/racks`
* **Deskripsi:** Mengambil data pembacaan sensor terakhir yang terdaftar dari database.
* **Format Respons (JSON):**
  ```json
  [
    {
      "id": 1,
      "sensor_id": "TH-001",
      "name": "Rack TH-001",
      "temp": 25.7,
      "hum": 53.6,
      "status": "Online",
      "pos": [-6.304904944290723, 106.63349615981343],
      "last_time": "2026-07-16T02:00:00.000Z"
    }
  ]
  ```

---

## 🚀 Menjalankan Aplikasi di Raspberry Pi

### Opsi A: Menjalankan untuk Pengujian (Development Mode)
Untuk menguji koneksi pertama kali dan melihat output pembacaan sensor langsung di layar:
```bash
node monitoring.js
```

### Opsi B: Menjalankan secara Terus-menerus (Production Mode dengan PM2)
Sangat direkomendasikan menggunakan pengelola proses **PM2** agar aplikasi otomatis berjalan di latar belakang (*background*), otomatis berjalan kembali saat Raspberry Pi di-*reboot*, dan otomatis merestart aplikasi jika terjadi crash.

1. **Install PM2 secara global**:
   ```bash
   sudo npm install -pm2 -g
   ```
2. **Jalankan `monitoring.js` melalui PM2**:
   ```bash
   pm2 start monitoring.js --name "terahumi-monitoring"
   ```
3. **Mengatur PM2 agar otomatis berjalan saat Raspberry Pi menyala (Auto-start on Boot)**:
   ```bash
   pm2 startup
   # Salin dan jalankan perintah keluaran yang diberikan terminal
   pm2 save
   ```
4. **Perintah Berguna untuk Pemantauan Log & Status PM2**:
   ```bash
   # Melihat status aplikasi yang sedang berjalan
   pm2 status
   
   # Memantau konsol log pembacaan sensor secara langsung (real-time)
   pm2 logs terahumi-monitoring
   
   # Memberhentikan atau merestart aplikasi
   pm2 stop terahumi-monitoring
   pm2 restart terahumi-monitoring
   ```

---

## 📌 Catatan Penting untuk Troubleshooting
* **Koneksi VPS gagal (`Connection timeout`)**:
  Pastikan port database `5437` pada firewall VPS (UFW / Azure Network Security Group) telah diizinkan untuk menerima koneksi masuk dari alamat IP Raspberry Pi.
