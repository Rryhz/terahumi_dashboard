import "dotenv/config";
import express from "express";
import cors from "cors";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const { Pool } = pg;

const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_SECRET";

const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      user: process.env.PGUSER || "teraterapostgres",
      host: process.env.PGHOST || "104.214.173.123",
      database: process.env.PGDATABASE || "terahumi",
      password: process.env.PGPASSWORD || "T3r4huM1",
      port: Number(process.env.PGPORT || 5437),
    });

const app = express();

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (CORS_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS: " + origin));
    },
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);
app.options("*", cors());
app.use(express.json({ limit: "25mb" }));

function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ message: "Missing token" });
  try {
    req.user = jwt.verify(m[1], JWT_SECRET);
    return next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin only" });
  return next();
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1 as ok");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ message: "username & password required" });

    const { rows } = await pool.query(
      "SELECT id, username, password_hash, role FROM users WHERE username=$1 LIMIT 1",
      [String(username)]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ message: "Username / password salah" });

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ message: "Username / password salah" });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (e) {
    console.error("POST /api/auth/login error:", e);
    res.status(500).json({ message: "Login error", error: String(e) });
  }
});

// Admin: buat user baru
app.post("/api/auth/admin/create-user", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ message: "username & password wajib diisi" });
    const validRoles = ["admin", "viewer"];
    const assignedRole = validRoles.includes(role) ? role : "viewer";

    // Cek duplikasi
    const existing = await pool.query("SELECT id FROM users WHERE username=$1", [String(username)]);
    if (existing.rows.length > 0)
      return res.status(409).json({ message: `Username "${username}" sudah digunakan.` });

    const hash = await bcrypt.hash(String(password), 10);
    const result = await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role",
      [String(username), hash, assignedRole]
    );
    return res.status(201).json({ user: result.rows[0] });
  } catch (e) {
    console.error("POST /api/auth/admin/create-user error:", e);
    res.status(500).json({ message: "Gagal membuat user", error: String(e) });
  }
});

// Admin: ambil semua user
app.get("/api/auth/admin/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, username, role, created_at FROM users ORDER BY created_at DESC"
    );
    return res.json(rows);
  } catch (e) {
    console.error("GET /api/auth/admin/users error:", e);
    res.status(500).json({ message: "Gagal mengambil daftar user", error: String(e) });
  }
});

// Admin: hapus user berdasarkan ID
app.delete("/api/auth/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (userId === req.user.id) {
      return res.status(400).json({ message: "Anda tidak bisa menghapus akun Anda sendiri." });
    }

    const { rowCount } = await pool.query("DELETE FROM users WHERE id=$1", [userId]);
    if (rowCount === 0) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }

    return res.json({ message: "User berhasil dihapus." });
  } catch (e) {
    console.error("DELETE /api/auth/admin/users error:", e);
    res.status(500).json({ message: "Gagal menghapus user", error: String(e) });
  }
});

// Admin: update role atau reset password user
app.put("/api/auth/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { role, password } = req.body || {};

    const updates = [];
    const values = [];
    let valIdx = 1;

    // Proteksi: tidak boleh mengubah role diri sendiri
    if (role) {
      if (userId === req.user.id) {
        return res.status(400).json({ message: "Anda tidak bisa mengubah role Anda sendiri." });
      }
      const validRoles = ["admin", "viewer"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: "Role tidak valid." });
      }
      updates.push(`role = $${valIdx++}`);
      values.push(role);
    }

    if (password) {
      if (String(password).trim().length < 6) {
        return res.status(400).json({ message: "Password minimal harus 6 karakter." });
      }
      const hash = await bcrypt.hash(String(password), 10);
      updates.push(`password_hash = $${valIdx++}`);
      values.push(hash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "Tidak ada data yang diubah." });
    }

    values.push(userId);
    const query = `UPDATE users SET ${updates.join(", ")} WHERE id = $${valIdx} RETURNING id, username, role`;
    const { rows, rowCount } = await pool.query(query, values);

    if (rowCount === 0) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }

    return res.json({ message: "User berhasil diperbarui.", user: rows[0] });
  } catch (e) {
    console.error("PUT /api/auth/admin/users error:", e);
    res.status(500).json({ message: "Gagal memperbarui user", error: String(e) });
  }
});


app.get("/api/racks", async (req, res) => {
  try {
    const q = `
      WITH latest AS (
        SELECT DISTINCT ON (sensor_id)
          sensor_id,
          time,
          (data->>'temp')::float AS temp,
          (data->>'hum')::float  AS hum
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
      LEFT JOIN latest l ON l.sensor_id = r.sensor_id
      ORDER BY r.sensor_id;
    `;

    const { rows } = await pool.query(q);

    const now = Date.now();
    const OFFLINE_AFTER_MS = Number(process.env.OFFLINE_AFTER_MS || 30_000);

    const result = rows.map((r, idx) => {
      const ts = r.last_time ? new Date(r.last_time).getTime() : NaN;
      const online = Number.isFinite(ts) && now - ts <= OFFLINE_AFTER_MS;

      return {
        id: idx + 1,
        sensor_id: r.sensor_id,
        name: r.name,
        temp: r.temp ?? 0,
        hum: r.hum ?? 0,
        status: online ? "Online" : "Offline",
        last_time: r.last_time ?? null,
        pos: (r.lat != null && r.lng != null) ? [Number(r.lat), Number(r.lng)] : [-6.210, 106.820],
        location: r.location ?? "",
        photoDataUrl: r.photo_data_url ?? "",
      };
    });

    res.json(result);
  } catch (e) {
    console.error("GET /api/racks error:", e);
    res.status(500).json({ message: "Failed to fetch racks", error: String(e) });
  }
});

app.put("/api/racks/:sensor_id", async (req, res) => {
  try {
    const sensor_id = req.params.sensor_id;
    const { name, lat, lng, location, photoDataUrl } = req.body || {};

    const q = `
      INSERT INTO racks(sensor_id, name, lat, lng, location, photo_data_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (sensor_id) DO UPDATE SET
        name = EXCLUDED.name,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        location = EXCLUDED.location,
        photo_data_url = EXCLUDED.photo_data_url
      RETURNING sensor_id, name, lat, lng, location, photo_data_url;
    `;

    const vals = [
      sensor_id,
      (name && String(name).trim()) ? String(name).trim() : `Rack ${sensor_id}`,
      (lat === "" || lat == null) ? null : Number(lat),
      (lng === "" || lng == null) ? null : Number(lng),
      location ?? "",
      photoDataUrl ?? "",
    ];

    const { rows } = await pool.query(q, vals);
    res.json(rows[0]);
  } catch (e) {
    console.error("PUT /api/racks/:sensor_id error:", e);
    res.status(500).json({ message: "Failed to update rack", error: String(e) });
  }
});

app.delete("/api/racks/:sensor_id", async (req, res) => {
  try {
    const { sensor_id } = req.params;
    await pool.query("DELETE FROM racks WHERE sensor_id=$1", [sensor_id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/racks/:sensor_id error:", e);
    res.status(500).json({ message: "Failed to delete rack", error: String(e) });
  }
});

app.get("/api/grafana/url", (req, res) => {
  const sensorId = String(req.query.sensor_id || "").trim();
  if (!sensorId) return res.status(400).json({ message: "sensor_id is required" });

  const base = process.env.GRAFANA_BASE_URL || "http://104.214.173.123:3007";
  const uid  = process.env.GRAFANA_UID  || "ad8qjkz";
  const slug = process.env.GRAFANA_SLUG || "terahumi-dashboard-v4";

  const to   = new Date().toISOString();
  const from = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  const url =
    `${base}/d/${encodeURIComponent(uid)}/${encodeURIComponent(slug)}` +
    `?orgId=1` +
    `&from=${encodeURIComponent(from)}` +
    `&to=${encodeURIComponent(to)}` +
    `&timezone=browser` +
    `&var-sensor_id=${encodeURIComponent(sensorId)}`;

  return res.json({ url });
});

// GET telemetry history for a specific rack
app.get("/api/racks/:sensor_id/telemetry", async (req, res) => {
  const { sensor_id } = req.params;
  const { start, end } = req.query;

  try {
    let query = `
      SELECT time, (data->>'temp')::float AS temp, (data->>'hum')::float AS hum
      FROM sensor_data
      WHERE sensor_id = $1
    `;
    const params = [sensor_id];

    if (start) {
      params.push(new Date(start));
      query += ` AND time >= $${params.length}`;
    }
    if (end) {
      params.push(new Date(end));
      query += ` AND time <= $${params.length}`;
    }

    query += " ORDER BY time ASC";

    const { rows } = await pool.query(query, params);
    return res.json(rows);
  } catch (e) {
    console.error("GET telemetry history error:", e);
    return res.status(500).json({ message: "Server error", error: String(e) });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Terahumi API running at http://0.0.0.0:${PORT}`);
});