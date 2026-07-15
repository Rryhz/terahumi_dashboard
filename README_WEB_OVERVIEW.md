# Terahumi Dashboard

Terahumi adalah sistem monitoring rack/sensor suhu & kelembapan berbasis:
- **Backend API (Node.js + Express)** untuk autentikasi, data rack, dan integrasi Grafana
- **Database PostgreSQL** untuk menyimpan metadata rack dan telemetry
- **Monitoring sensor Modbus RTU (RS485)** untuk membaca sensor dan menyimpan data ke DB
- **Web Dashboard** untuk menampilkan status rack (Online/Offline), lokasi, foto, dan analitik (Grafana)

---

## Arsitektur Singkat

1. **Monitoring Modbus** membaca sensor via RS485 (mis. `/dev/ttyUSB0` atau `/dev/ttyS0`) lalu insert ke tabel `sensor_data`.
2. **Backend API** menyediakan endpoint:
   - login (JWT)
   - list rack + telemetry terakhir (join `racks` + `sensor_data`)
   - update metadata rack
   - generate URL Grafana per sensor
3. **Frontend Web** melakukan fetch ke backend dan menampilkan data rack.

---

## Note

- Node.js (disarankan LTS)
- PostgreSQL
- (Opsional) Perangkat RS485 + sensor Modbus RTU
- (Opsional) Grafana (mis. berjalan di port `3000`)

---

## Struktur Data (PostgreSQL)

Backend berisikan tabel:

### `users`
Kolom yang digunakan:
- `id`
- `username`
- `password_hash` (bcrypt)
- `role` (cont. `admin`)

### `racks`
Kolom yang digunakan:
- `sensor_id` (Key)
- `name`
- `lat`, `lng`
- `location`
- `photo_data_url`

### `sensor_data`
Contoh kolom:
- `time` (timestamp)
- `sensor_id`
- `data` (JSON) berisi:
  - `temp`
  - `hum`
---

## 🖥️ Backend (API Server)

### 📦 Panduan Instalasi & Eksekusi Backend
1. Masuk ke direktori backend:
   ```bash
   cd backend
   ```
2. Install semua dependencies Node.js:
   ```bash
   npm install
   ```
3. Buat file konfigurasi `.env` di dalam folder `backend/` dan sesuaikan nilainya:
   ```env
   PORT=5000
   JWT_SECRET=T3r4huM1_S3cr3tKey_2026
   CORS_ORIGINS=http://localhost:3000,http://104.214.173.123:3000
   PGHOST=localhost
   PGDATABASE=terahumi
   PGUSER=teraterapostgres
   PGPASSWORD=T3r4huM1
   PGPORT=5437
   OFFLINE_AFTER_MS=30000
   GRAFANA_BASE_URL=http://104.214.173.123:3000
   ```
4. Jalankan backend dalam mode development:
   ```bash
   npm run dev
   ```
   Atau jalankan menggunakan **PM2** di production:
   ```bash
   pm2 start server.js --name "terahumi-backend"
   ```

### ⚙️ Environment Variables (Backend)
| Variable | Default | Fungsi |
|---|---:|---|
| `PORT` | `5000` | Port tempat backend berjalan |
| `JWT_SECRET` | `CHANGE_ME_SECRET` | Kunci enkripsi token login admin |
| `CORS_ORIGINS` | `http://localhost:3000` | Domain/IP frontend yang diizinkan mengakses API |
| `PGHOST` | `localhost` | Host database PostgreSQL |
| `PGDATABASE` | `terahumi` | Nama database |
| `PGUSER` | `postgres` | Username database |
| `PGPASSWORD` | `T3r4huM1` | Password database |
| `PGPORT` | `5432` | Port database |
| `OFFLINE_AFTER_MS` | `30000` | Batas waktu (ms) sensor dianggap offline jika data tidak masuk |
| `GRAFANA_BASE_URL` | - | Base URL Grafana Dashboard untuk analitik sensor |

---

## 🌐 Endpoint Utama (Backend)
* `GET /health` : Memeriksa status konektivitas database.
* `POST /api/auth/login` : Login admin (Body: `{ "username", "password" }`).
* `GET /api/racks` : Mengambil data seluruh rak beserta status telemetri terakhirnya.
* `PUT /api/racks/:sensor_id` : Menambahkan atau mengupdate metadata rak.
* `DELETE /api/racks/:sensor_id` : Menghapus data rak tertentu.
* `GET /api/grafana/url?sensor_id=...` : Mengambil URL iframe Grafana yang aman untuk grafik telemetri.

---

## 💻 Frontend (Web Dashboard React)

### 📦 Panduan Instalasi & Eksekusi Frontend
1. Pastikan Anda berada di root direktori proyek (`terahumi-dashboard/`).
2. Install semua dependencies React:
   ```bash
   npm install
   ```
3. Buat file `.env` di root direktori untuk mengarahkan URL API ke backend:
   ```env
   REACT_APP_API_BASE_URL=http://localhost:5000
   ```
   *(Ganti `localhost:5000` dengan IP VPS backend Anda jika dideploy di server cloud, contoh: `http://104.214.173.123:5000`)*
4. Jalankan aplikasi React:
   ```bash
   npm start
   ```
   Aplikasi akan otomatis berjalan pada port default: `http://localhost:3000` (atau port alternatif jika port 3000 digunakan).

---

## Monitoring Sensor (Modbus RTU / RS485)

Jika menjalankan script `monitoring.js` untuk membaca sensor dan menyimpan ke DB:

### Environment variables (Monitoring)
| Variable | Contoh | Fungsi |
|---|---|---|
| `SERIAL_PORT` | `/dev/ttyUSB0` | Port serial RS485 |
| `MODBUS_ID` | `1` | Modbus slave id |
| `SENSOR_ID` | `TH-001` | sensor_id yang dipakai untuk insert ke DB |
| (opsional) `API_PORT` | `5001` | Jika monitoring juga expose API agar tidak bentrok dengan backend utama |

### Troubleshooting Modbus Timeout
Jika error `ETIMEDOUT`:
- Pastikan A/B RS485 terpasang dan tidak terbalik
- Pastikan GND common
- Pastikan baudrate/parity/stopbit sesuai (banyak sensor memakai 9600 8E1)

---

## Menjalankan Otomatis dengan PM2

### Start
```bash
sudo npm i -g pm2
pm2 start monitoring.js --name terahumi-monitor
pm2 save
pm2 startup
```
Ikuti perintah `sudo ...` yang ditampilkan oleh `pm2 startup`.

### Lihat log
```bash
pm2 logs terahumi-monitor
```

### Mematikan autostart saat boot (PM2)
- Hapus proses dari daftar:
```bash
pm2 delete terahumi-monitor
pm2 save
```
- Disable service pm2:
```bash
systemctl list-unit-files | grep -i pm2
sudo systemctl disable --now pm2-<namauser>
```
atau bersih total:
```bash
pm2 unstartup systemd
```

---

## Troubleshooting Umum

### 1) `Failed to fetch` / `ERR_CONNECTION_TIMED_OUT`
- Biasanya IP backend berubah.
- Cek IP server: `hostname -I`
- Pastikan frontend memanggil IP backend yang benar.

### 2) Error CORS: `Not allowed by CORS`
- Tambahkan origin frontend ke `CORS_ORIGINS`.
- Pastikan preflight `OPTIONS` tidak error.

### 3) `/api/racks` HTTP 500
- Cek log backend (console / pm2 logs / journalctl)
- Pastikan tabel DB (`racks`, `sensor_data`) ada dan query sesuai.

---

## Catatan Keamanan
- Ganti `JWT_SECRET` di production.
- Jangan commit password DB atau secret ke repo publik.
- Batasi CORS origin hanya domain yang dibutuhkan.

---