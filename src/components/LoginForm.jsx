import React, { useState } from "react";
import { saveAuth } from "../storage/authStorage";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

export default function LoginForm({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");

    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.message || "Login failed");
      return;
    }

    saveAuth(data);
    onLoggedIn?.(data);
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 360 }}>
      <h2 style={{ marginBottom: 12 }}>Login</h2>
      {err ? <div style={{ color: "salmon", marginBottom: 8 }}>{err}</div> : null}

      <div style={{ marginBottom: 8 }}>
        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: "100%" }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%" }} />
      </div>

      <button type="submit" style={{ width: "100%" }}>Sign in</button>
    </form>
  );
}