import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import { auth, requireAdmin } from "./middleware/auth.js";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

// Admin membuat user baru
app.post("/api/auth/admin/create-user", auth, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: "username & password required" });
  }

  const safeRole = ["viewer", "editor", "admin"].includes(role) ? role : "viewer";
  const password_hash = await bcrypt.hash(password, 10);

  try {
    const r = await pool.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, username, role, created_at`,
      [username, password_hash, safeRole]
    );
    return res.json({ user: r.rows[0] });
  } catch (e) {
    if (String(e).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ message: "Username already exists" });
    }
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: "username & password required" });
  }

  const r = await pool.query(
    `SELECT id, username, password_hash, role FROM users WHERE username=$1`,
    [username]
  );
  const user = r.rows[0];
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  return res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role }
  });
});

// Pola 1: backend yang mengembalikan URL Grafana untuk sensor tertentu
app.get("/api/grafana/url", auth, (req, res) => {
  const sensorId = req.query.sensor_id;
  if (!sensorId) return res.status(400).json({ message: "sensor_id required" });

  const base = process.env.GRAFANA_DASHBOARD_URL;
  const url = `${base}&var-sensor_id=${encodeURIComponent(sensorId)}`;

  return res.json({ url });
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`Terahumi API listening on http://localhost:${port}`));