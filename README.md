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

## Backend 

### Environment variables (Backend)

| Variable | Default | Fungsi |
|---|---:|---|
| `PORT` | `5000` | Port backend |
| `JWT_SECRET` | `CHANGE_ME_SECRET` | Secret JWT (WAJIB diganti di production) |
| `CORS_ORIGINS` | `http://localhost:5173` | Daftar origin frontend yang diizinkan, pisahkan dengan koma |
| `DATABASE_URL` | - | Connection string Postgres (opsional) |
| `PGHOST` | `localhost` | Host Postgres |
| `PGDATABASE` | `terahumi` | Nama DB |
| `PGUSER` | `postgres` | User DB |
| `PGPASSWORD` | `T3r4huM1` | Password DB |
| `PGPORT` | `5432` | Port DB |
| `OFFLINE_AFTER_MS` | `30000` | Rack dianggap Offline jika data terakhir lebih lama dari ini |
| `GRAFANA_BASE_URL` | (lihat kode) | Base URL Grafana (cont. `http://10.10.240.179:3000`) |
---

## Endpoint Utama (Backend)

- `GET /health`  
  Cek koneksi DB.

- `POST /api/auth/login`  
  Body JSON:
  ```json
  { "username": "admin", "password": "..." }
  ```
  Response:
  - `token` (JWT)
  - `user` (id/username/role)

- `GET /api/racks`  
  Mengembalikan seluruh rack dari tabel `racks` + telemetry terakhir dari `sensor_data`.

- `PUT /api/racks/:sensor_id`  
  Upsert metadata rack (nama, lokasi, foto, koordinat).

- `DELETE /api/racks/:sensor_id`  
  Hapus rack.

- `GET /api/grafana/url?sensor_id=...`  
  Mengembalikan URL Grafana untuk analitik sensor tersebut.

---

## Frontend (Web Dashboard)

### Menjalankan
Install dependency:
```bash
npm install
npm run dev
```

Frontend berjalan di:
- `http://localhost:3000` (React App)

> Pastikan backend CORS mengizinkan origin port yang Anda gunakan.

### Mengatur URL Backend
Di frontend, pastikan base URL mengarah ke IP backend yang benar:
- Backend: `http://10.10.240.179:5000`

Jika sebelumnya hardcode ke IP lama, ganti ke IP baru.

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