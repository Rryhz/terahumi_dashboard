# PANDUAN INTEGRASI DAN DOKUMENTASI SISTEM TERAHUMI

Dokumen ini berisi panduan teknis lengkap instalasi, konfigurasi, dan arsitektur kode untuk seluruh komponen sistem **Terahumi Dashboard** yang dibangun untuk memantau kondisi suhu dan kelembapan rak server secara *real-time*.

---

## 1. INSTALASI & KONFIGURASI DATABASE (POSTGRESQL & TIMESCALEDB)

Database sistem menggunakan **PostgreSQL** yang diperkuat dengan ekstensi **TimescaleDB** untuk penanganan data deret waktu (*time-series*) yang cepat, efisien, dan terstruktur.

### A. Instalasi PostgreSQL & TimescaleDB Menggunakan Docker
Untuk mempermudah manajemen server, database dijalankan di dalam kontainer Docker.

1. **Unduh Image TimescaleDB** (menggunakan basis PostgreSQL 15):
   ```bash
   docker pull timescale/timescaledb:latest-pg15
   ```
2. **Jalankan Kontainer Docker Database**:
   Jalankan kontainer dengan memetakan port `5437` ke port internal `5432` serta pasang volume persisten agar data tidak hilang ketika kontainer dihentikan:
   ```bash
   docker run -d \
     --name terahumi-db \
     -p 5437:5432 \
     -e POSTGRES_DB=terahumi \
     -e POSTGRES_USER=teraterapostgres \
     -e POSTGRES_PASSWORD=T3r4huM1 \
     -v pgdata:/var/lib/postgresql/data \
     --restart always \
     timescale/timescaledb:latest-pg15
   ```

---

### B. Pembuatan Tabel & Hypertable (Skema Database)
Setelah kontainer database berjalan, masuk ke dalam sistem PostgreSQL (menggunakan terminal CLI `psql` atau aplikasi GUI seperti DBeaver/pgAdmin) dan jalankan DDL query berikut:

1. **Tabel Pengguna (`users`)**:
   Digunakan untuk proses otentikasi login admin pada antarmuka *website*:
   ```sql
   CREATE TABLE users (
       id SERIAL PRIMARY KEY,
       username VARCHAR(50) UNIQUE NOT NULL,
       password_hash VARCHAR(255) NOT NULL,
       role VARCHAR(20) DEFAULT 'admin'
   );
   ```

2. **Tabel Rak Server (`racks`)**:
   Menyimpan metadata dasar lokasi fisik rak, titik koordinat peta, dan gambar/foto rak:
   ```sql
   CREATE TABLE racks (
       sensor_id VARCHAR(50) PRIMARY KEY,
       name VARCHAR(100) NOT NULL,
       lat DOUBLE PRECISION NOT NULL,
       lng DOUBLE PRECISION NOT NULL,
       location VARCHAR(255) NOT NULL,
       photo_data_url TEXT
   );
   ```

3. **Tabel Data Telemetri (`sensor_data`)**:
   Menampung pembacaan suhu dan kelembapan historis dari sensor:
   ```sql
   CREATE TABLE sensor_data (
       time TIMESTAMPTZ NOT NULL,
       sensor_id VARCHAR(50) NOT NULL,
       data JSONB NOT NULL
   );
   ```

4. **Konversi ke TimescaleDB Hypertable**:
   Ubah tabel `sensor_data` biasa menjadi *Hypertable* berbasis waktu agar kueri agregasi histori telemetri berjalan optimal:
   ```sql
   -- Aktifkan ekstensi TimescaleDB
   CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

   -- Ubah tabel menjadi hypertable berdasarkan kolom waktu 'time'
   SELECT create_hypertable('sensor_data', 'time');

   -- Tambahkan indeks pencarian untuk mempercepat filter pencarian
   CREATE INDEX idx_sensor_time ON sensor_data (sensor_id, time DESC);
   ```

---

## 2. INSTALASI & KONFIGURASI VISUALISASI (GRAFANA)

Grafana digunakan untuk memvisualisasikan data deret waktu yang tersimpan di PostgreSQL dalam bentuk grafik (*Charts/Panels*) serta bertindak sebagai mesin pemicu alarm (*Alerting Engine*).

### A. Instalasi Grafana Menggunakan Docker
Jalankan kontainer Grafana Enterprise dengan memetakan port `3000` di server VPS:
```bash
docker run -d \
  --name terahumi-grafana \
  -p 3000:3000 \
  -v grafana-storage:/var/lib/grafana \
  --restart always \
  grafana/grafana-enterprise:latest
```

---

### B. Konfigurasi Akuisisi Data (Data Source)
1. Buka Grafana di browser (`http://IP-VPS:3000`).
2. Navigasikan ke **Connections** -> **Data Sources** -> **Add Data Source**.
3. Pilih **PostgreSQL**.
4. Isi konfigurasi koneksi:
   * **Host**: `104.214.173.123:5437` (Sesuaikan dengan IP VPS & Port PostgreSQL Anda)
   * **Database**: `terahumi`
   * **User**: `teraterapostgres`
   * **Password**: `T3r4huM1`
   * **SSL Mode**: `disable` (atau `require` jika menggunakan sertifikat SSL)
   * **TimescaleDB**: Ubah opsi ini ke posisi **`ON`**.
5. Klik **Save & Test**.

---

### C. Pembuatan Grafik Visualisasi (Kueri Dashboard)
Untuk membuat visualisasi grafik deret waktu suhu dan kelembapan di dashboard Grafana, buatlah Panel bertipe **Time Series** dan masukkan SQL Query berikut:

* **Query Grafik Suhu & Kelembapan Historis**:
  Menggunakan macro bawaan Grafana `$__timeFilter(time)` untuk memotong rentang waktu grafik secara dinamis:
  ```sql
  SELECT 
    time AS "time", 
    (data->>'temp')::float AS "Suhu", 
    (data->>'hum')::float AS "Kelembapan" 
  FROM sensor_data 
  WHERE $__timeFilter(time) AND sensor_id IN ($sensor_id) 
  ORDER BY time ASC
  ```

* **Query Indikator Nilai Suhu Terkini (Single Stat)**:
  ```sql
  SELECT 
    time AS "time",
    (data->>'temp')::float AS value
  FROM sensor_data
  WHERE sensor_id = 'TH-001'
  ORDER BY time DESC
  LIMIT 1
  ```

* **Query Indikator Nilai Kelembapan Terkini (Single Stat)**:
  ```sql
  SELECT 
    time AS "time",
    (data->>'hum')::float AS value
  FROM sensor_data
  WHERE sensor_id = 'TH-001'
  ORDER BY time DESC
  LIMIT 1
  ```

---

## 3. DOKUMENTASI BACKEND API (NODE.JS + EXPRESS)

Folder `backend/` bertugas menyediakan REST API yang dikonsumsi oleh aplikasi frontend React JS untuk berinteraksi dengan database secara aman.

### A. Detail Endpoint Utama & Alur Logika

1. **Otentikasi Admin (`POST /api/auth/login`)**:
   * Membaca `username` dan `password` dari client.
   * Melakukan verifikasi keamanan menggunakan `bcryptjs` terhadap hash password yang disimpan di DB.
   * Jika valid, menghasilkan *JSON Web Token* (JWT) yang dienkripsi dengan `JWT_SECRET` untuk dipasang di header client (`Authorization: Bearer <token>`).

2. **Daftar Rak + Telemetri Terakhir (`GET /api/racks`)**:
   * Melakukan kueri gabungan (*JOIN query*) menggunakan PostgreSQL untuk mendapatkan daftar rak serta telemetri terbarunya dalam satu langkah pemanggilan:
     ```sql
     WITH latest AS (
       SELECT DISTINCT ON (sensor_id) 
         sensor_id, 
         time, 
         (data->>'temp')::float AS temp, 
         (data->>'hum')::float AS hum 
       FROM sensor_data 
       ORDER BY sensor_id, time DESC
     )
     SELECT 
       r.sensor_id, 
       r.name, 
       r.lat, 
       r.lng, 
       r.location, 
       r.photo_data_url,
       l.time AS last_time,
       l.temp,
       l.hum
     FROM racks r
     LEFT JOIN latest l ON l.sensor_id = r.sensor_id;
     ```

3. **Manajemen Metadata Rak (`PUT /api/racks/:sensor_id`)**:
   * Menyimpan koordinat lintang/bujur peta, nama ruang, dan *base64 data URL* foto rak server menggunakan skema query `INSERT ... ON CONFLICT (sensor_id) DO UPDATE`.

4. **URL Keamanan Grafana (`GET /api/grafana/url?sensor_id=...`)**:
   * Mengembalikan alamat URL Panel iframe Grafana secara dinamis yang ditautkan langsung ke dasbor visualisasi parameter sensor yang bersangkutan.

---

## 4. DOKUMENTASI FRONTEND & ANTARMUKA (REACT JS)

Aplikasi frontend dibangun menggunakan **React JS** untuk menghadirkan dasbor interaktif modern yang responsif bagi administrator.

### A. Panduan Instalasi & Eksekusi Frontend
1. Buka terminal pada root direktori proyek (`terahumi-dashboard/`).
2. Pasang modul dependensi:
   ```bash
   npm install
   ```
3. Konfigurasikan file `.env` pada folder root:
   ```env
   REACT_APP_API_BASE_URL=http://104.214.173.123:5000
   ```
4. Jalankan aplikasi React:
   ```bash
   npm start
   ```

---

### B. Ringkasan Arsitektur & Source Code Utama
Aplikasi frontend React dibagi menjadi beberapa komponen utama di dalam folder `src/`:

* **`App.js` (Halaman Utama / State Manager)**:
  Mengontrol alur logika login pengguna, memproses pemanggilan API list rak, melacak status rak aktif, serta memuat data riwayat telemetri berformat tabel untuk diunduh menjadi format `.CSV`.
* **`components/RackMap.jsx` (Visualisasi Peta Kontrol)**:
  Memanfaatkan library peta interaktif `react-leaflet` (berbasis OpenStreetMap) untuk meletakkan pin koordinat sensor secara presisi di peta. Warna penanda pin dinamis disesuaikan dengan kondisi real-time:
  * **Hijau**: Kondisi normal (Suhu < 27°C, Kelembapan < 55%).
  * **Kuning (Warning)**: Kondisi waspada (Suhu 27°C - 29.9°C, Kelembapan 55% - 59.9%).
  * **Merah (Critical)**: Kondisi kritis (Suhu >= 30°C, Kelembapan >= 60%).
* **`components/LoginForm.jsx`**:
  Formulir autentikasi pengguna antarmuka admin menggunakan validasi state lokal.
* **`components/ManageRacksModal.jsx`**:
  Modul interaktif pop-up untuk menambah, mengedit, mengupload foto, dan menghapus rak server dari sistem database utama.
* **Embed Iframe Grafana**:
  Di dalam `App.js`, grafik visualisasi historis diintegrasikan menggunakan tag HTML `<iframe>` secara aman yang membaca URL dinamis hasil kueri backend API:
  ```jsx
  <iframe
    src={grafanaUrl}
    width="100%"
    height="400"
    frameBorder="0"
    title="Grafana Analytics"
  />
  ```
