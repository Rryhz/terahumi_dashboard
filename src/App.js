import React, { useState, useEffect, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import ManageRacksModal from "./components/ManageRacksModal";
import { loadAuth, saveAuth, clearAuth } from "./storage/authStorage";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

// ======================
// CONFIG
// ======================
const BACKEND_URL = process.env.REACT_APP_API_BASE_URL || "http://104.214.173.123:5000";
const RACKS_ENDPOINT = "/api/racks";
const GRAFANA_URL_ENDPOINT = "/api/grafana/url";

const mapCenter = [-6.2, 106.816666];

// Fix marker icon
const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom pulsing divIcon for markers
const createCustomMarker = (rack) => {
  let colorClass = "marker-offline";
  if (rack.status === "Online") {
    colorClass = rack.temp > 27 ? "marker-danger" : "marker-success";
  }
  return L.divIcon({
    className: "custom-div-icon",
    html: `<div class="marker-pin ${colorClass}"><div class="marker-pulse"></div></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

// Helper: force map move with animation
const ChangeView = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 15, {
        animate: true,
        duration: 1.5,
      });
    }
  }, [center, map]);
  return null;
};

function App() {
  // --- auth state (JWT dari backend) ---
  const [auth, setAuth] = useState(() => loadAuth());
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginErr, setLoginErr] = useState("");

  // --- racks dari backend ---
  const [serverRacks, setServerRacks] = useState([]);
  const [activeRack, setActiveRack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSensorId, setSelectedSensorId] = useState(null);

  // --- Export Telemetry ---
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportDates, setExportDates] = useState({ start: "", end: "" });
  const [exportLoading, setExportLoading] = useState(false);
  const [exportErr, setExportErr] = useState("");

  // --- Manage Users ---
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userForm, setUserForm] = useState({ username: "", password: "", role: "viewer" });
  const [userErr, setUserErr] = useState("");
  const [userSuccess, setUserSuccess] = useState("");
  const [userLoading, setUserLoading] = useState(false);
  const [usersList, setUsersList] = useState([]);

  const fetchUsersList = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/admin/users`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${auth?.token}`,
        },
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.message || "Gagal mengambil list user");
      setUsersList(data);
    } catch (err) {
      console.error(err);
      setUserErr(err.message || "Gagal mengambil list user");
    }
  }, [auth?.token]);

  useEffect(() => {
    if (userModalOpen && auth?.token) {
      fetchUsersList();
    }
  }, [userModalOpen, auth?.token, fetchUsersList]);

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Hapus user "${username}"?`)) return;
    setUserErr("");
    setUserSuccess("");
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${auth?.token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Gagal menghapus user");
      setUserSuccess("User berhasil dihapus.");
      fetchUsersList();
    } catch (err) {
      console.error(err);
      setUserErr(err.message || "Gagal menghapus user");
    }
  };

  const handleUpdateUser = async (userId, fields) => {
    setUserErr("");
    setUserSuccess("");
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${auth?.token}`,
        },
        body: JSON.stringify(fields),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Gagal memperbarui user");
      setUserSuccess("User berhasil diperbarui.");
      fetchUsersList();
    } catch (err) {
      console.error(err);
      setUserErr(err.message || "Gagal memperbarui user");
    }
  };

  const handleCreateUser = async () => {
    setUserErr("");
    setUserSuccess("");
    if (!userForm.username || !userForm.password) {
      setUserErr("Username dan password wajib diisi.");
      return;
    }
    setUserLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/admin/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth?.token}`,
        },
        body: JSON.stringify(userForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      setUserSuccess(`User "${data.user?.username}" berhasil dibuat dengan role "${data.user?.role}".`);
      setUserForm({ username: "", password: "", role: "viewer" });
      fetchUsersList();
    } catch (err) {
      setUserErr(err.message || "Gagal membuat user.");
    } finally {
      setUserLoading(false);
    }
  };

  const handleExportCSV = async () => {
    if (!activeRack) return;
    setExportErr("");
    setExportLoading(true);
    try {
      const { start, end } = exportDates;
      let queryParams = "";
      if (start) queryParams += `&start=${encodeURIComponent(start)}`;
      if (end) queryParams += `&end=${encodeURIComponent(end)}`;

      const res = await fetch(
        `${BACKEND_URL}/api/racks/${encodeURIComponent(activeRack.sensor_id)}/telemetry?${queryParams}`,
        {
          headers: { Accept: "application/json" }
        }
      );
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);

      if (data.length === 0) {
        throw new Error("Tidak ada data telemetry pada periode tersebut.");
      }

      // Convert to CSV
      const headers = ["Time", "Temperature (C)", "Humidity (%)"];
      const rows = data.map((r) => [
        new Date(r.time).toLocaleString(),
        r.temp ?? "",
        r.hum ?? ""
      ]);

      const csvContent = "\uFEFF" + [
        "sep=,",
        `Telemetry Report for Sensor: ${activeRack.sensor_id} (${activeRack.name})`,
        headers.join(","),
        ...rows.map((e) => e.join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `telemetry_${activeRack.sensor_id}_report.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportModalOpen(false);
    } catch (err) {
      console.error(err);
      setExportErr(err.message || "Gagal mengunduh data telemetry.");
    } finally {
      setExportLoading(false);
    }
  };

  // Login
  const doLogin = async (e) => {
    e.preventDefault();
    setLoginErr("");

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(loginForm),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Login gagal");

      saveAuth(data);
      setAuth(data);
    } catch (err) {
      setLoginErr(err.message || "Login gagal");
    }
  };

  // Pola 1: minta URL grafana dari backend (pakai JWT)
  const openGrafana = async (sensorId) => {
    try {
      if (!auth?.token) {
        alert("Anda belum login.");
        return;
      }

      const res = await fetch(
        `${BACKEND_URL}${GRAFANA_URL_ENDPOINT}?sensor_id=${encodeURIComponent(sensorId)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Gagal ambil URL Grafana");

      const url = data.url;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      alert(err.message || "Gagal buka Grafana");
    }
  };

  const fetchRacksFromBackend = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}${RACKS_ENDPOINT}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Backend HTTP ${response.status} ${response.statusText} - ${text}`);
      }

      const data = await response.json();

      const liveData = (Array.isArray(data) ? data : []).map((row, index) => {
        const sensor_id = row.sensor_id ?? row.sensorId ?? `UNKNOWN-${index + 1}`;

        const latFromBackend = Array.isArray(row.pos) ? row.pos[0] : row.latitude ?? row.lat ?? -6.210;
        const lonFromBackend =
          Array.isArray(row.pos) ? row.pos[1] : row.longitude ?? row.lng ?? row.lon ?? 106.820;

        return {
          id: row.id ?? index + 1,
          sensor_id,
          name: row.name ?? `Rack ${sensor_id}`,
          temp: Number(row.temp ?? row.temperature ?? 0),
          hum: Number(row.hum ?? row.humidity ?? 0),
          status: row.status ?? "Offline",
          pos: [Number(latFromBackend), Number(lonFromBackend)],
          last_time: row.last_time ?? row.time ?? null,
          photoDataUrl: row.photoDataUrl ?? row.photo_data_url ?? "",
          location: row.location ?? "",
        };
      });

      setServerRacks(liveData);

      // pilih active rack berdasarkan selectedSensorId TANPA pakai activeRack dependency
      setActiveRack((prev) => {
        const idToSelect = selectedSensorId || prev?.sensor_id || liveData[0]?.sensor_id || null;
        if (!idToSelect) return null;
        return liveData.find((r) => r.sensor_id === idToSelect) || null;
      });

      setLoading(false);
    } catch (error) {
      console.error("Gagal ambil data rack dari backend:", error);
      setServerRacks([]);
      setActiveRack(null);
      setLoading(false);
    }
  }, [selectedSensorId]);

  useEffect(() => {
    fetchRacksFromBackend();
    const interval = setInterval(fetchRacksFromBackend, 15000);
    return () => clearInterval(interval);
  }, [fetchRacksFromBackend]);

  // --- LOGIN SCREEN ---
  if (!auth?.token) {
    return (
      <div className="vh-100 d-flex justify-content-center align-items-center bg-dark text-white">
        <div style={{ width: 360 }}>
          <span className="navbar-brand fw-bold text-white m-0 fs-4">
            TERA<span className="text-primary">HUMI</span> Login{" "}
          </span>

          {loginErr ? <div className="alert alert-danger py-2">{loginErr}</div> : null}

          <form onSubmit={doLogin}>
            <div className="mb-2">
              <label className="form-label small">Username</label>
              <input
                className="form-control"
                value={loginForm.username}
                onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>

            <div className="mb-3">
              <label className="form-label small">Password</label>
              <input
                type="password"
                className="form-control"
                value={loginForm.password}
                onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
              />
              <div className="text-end mt-1">
                <button
                  type="button"
                  className="btn btn-link p-0 text-decoration-none text-muted-custom small"
                  style={{ fontSize: "11px" }}
                  onClick={() => alert("Lupa password? Silakan hubungi administrator sistem (admin) untuk melakukan reset password akun Anda.")}
                >
                  Lupa password?
                </button>
              </div>
            </div>

            <button className="btn btn-primary w-100 fw-bold" type="submit">
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="vh-100 d-flex flex-column justify-content-center align-items-center text-white" style={{ backgroundColor: "#121826" }}>
        <div className="spinner-border text-primary mb-3" role="status" style={{ width: "3rem", height: "3rem" }}>
          <span className="visually-hidden">Loading...</span>
        </div>
        <div className="fw-bold text-uppercase tracking-wider fs-5">
          TERA<span className="text-primary">HUMI</span> System
        </div>
        <small className="text-muted mt-2">Menghubungkan ke server...</small>
      </div>
    );
  }

  return (
    <div className="vh-100 d-flex flex-column" style={{ backgroundColor: "#121826" }}>
      {/* NAVBAR */}
      <nav className="navbar py-3 px-4 mb-4" style={{ borderBottom: "1px solid #212936" }}>
        <div className="container-fluid d-flex justify-content-between">
          <span className="navbar-brand fw-bold text-white m-0 fs-4">
            TERA<span className="text-primary">HUMI</span>
            <span className="ms-2 text-muted-custom fw-light fs-4 text-uppercase">
              | Server Rack Monitoring
            </span>
          </span>

          <div className="d-flex align-items-center">
            <div className="text-end me-3">
              <div className="fw-bold small text-white text-uppercase">
                {auth?.user?.username || "User"}
              </div>
              <div className="text-emerald small fw-bold" style={{ fontSize: "10px" }}>
                {String(auth?.user?.role || "viewer").toUpperCase()}
              </div>
            </div>

            {auth?.user?.role === "admin" ? (
              <>
                <button
                  className="btn btn-sm btn-outline-info me-2"
                  data-bs-toggle="modal"
                  data-bs-target="#manageRacksModal"
                >
                  Manage Racks
                </button>
                <button
                  className="btn btn-sm btn-outline-warning me-2"
                  onClick={() => setUserModalOpen(true)}
                >
                  Manage Users
                </button>
              </>
            ) : null}

            <button
              className="btn btn-sm btn-outline-light"
              onClick={() => {
                clearAuth();
                setAuth(null);
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Modal: setelah save/delete, refresh racks dari backend */}
      <ManageRacksModal onChanged={() => fetchRacksFromBackend()} />

      {/* Summary Widgets */}
      {serverRacks.length > 0 && (() => {
        const totalRacks = serverRacks.length;
        const onlineRacks = serverRacks.filter((r) => r.status === "Online").length;
        const offlineRacks = totalRacks - onlineRacks;
        const overheatRacks = serverRacks.filter((r) => r.status === "Online" && r.temp > 27).length;
        const avgTemp = onlineRacks > 0
          ? (serverRacks.filter((r) => r.status === "Online").reduce((acc, r) => acc + r.temp, 0) / onlineRacks).toFixed(1)
          : "—";

        const widgets = [
          {
            icon: "🖥️",
            label: "Total Rack",
            value: totalRacks,
            sub: "terdaftar",
            color: "#3b82f6",
            bg: "rgba(59,130,246,0.1)",
          },
          {
            icon: "🟢",
            label: "Online",
            value: onlineRacks,
            sub: "aktif",
            color: "#10b981",
            bg: "rgba(16,185,129,0.1)",
          },
          {
            icon: "⚫",
            label: "Offline",
            value: offlineRacks,
            sub: "tidak aktif",
            color: offlineRacks > 0 ? "#ef4444" : "#6b7280",
            bg: offlineRacks > 0 ? "rgba(239,68,68,0.1)" : "rgba(107,114,128,0.1)",
          },
          {
            icon: "🌡️",
            label: "Avg. Suhu",
            value: avgTemp === "—" ? "—" : `${avgTemp}°C`,
            sub: "rack aktif",
            color: avgTemp !== "—" && Number(avgTemp) > 27 ? "#ef4444" : "#f59e0b",
            bg: avgTemp !== "—" && Number(avgTemp) > 27 ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
          },
          {
            icon: "⚠️",
            label: "Overheat",
            value: overheatRacks,
            sub: "> 27°C",
            color: overheatRacks > 0 ? "#ef4444" : "#10b981",
            bg: overheatRacks > 0 ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
          },
        ];

        return (
          <div className="container-fluid px-4 mb-3">
            <div className="row g-3">
              {widgets.map((w) => (
                <div key={w.label} className="col-6 col-sm-4 col-md-3 col-lg">
                  <div
                    className="rounded-4 p-3 d-flex flex-column"
                    style={{
                      backgroundColor: "#1a2332",
                      border: "1px solid #212936",
                      borderLeft: `3px solid ${w.color}`,
                    }}
                  >
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <small className="text-uppercase fw-bold" style={{ fontSize: "10px", letterSpacing: "0.05em", color: "rgba(255,255,255,0.6)" }}>
                        {w.label}
                      </small>
                      <span style={{ fontSize: "16px" }}>{w.icon}</span>
                    </div>
                    <div className="fw-bold text-white" style={{ fontSize: "22px", lineHeight: 1 }}>
                      {w.value}
                    </div>
                    <small className="mt-1" style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>{w.sub}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="flex-grow-1 container-fluid px-4 d-flex flex-column flex-lg-row gap-4 mb-4 overflow-hidden">
        {/* MAP */}
        <div className="flex-grow-1 position-relative" style={{ minHeight: "450px" }}>
          <div
            className="h-100 w-100 rounded-4 overflow-hidden shadow-lg border"
            style={{ borderColor: "#212936" }}
          >
            <MapContainer center={mapCenter} zoom={13} style={{ height: "100%", width: "100%" }} zoomControl={false}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png" />
              <ChangeView center={activeRack?.pos} />

              {serverRacks.map((rack) => (
                <Marker
                  key={rack.sensor_id}
                  position={rack.pos}
                  icon={createCustomMarker(rack)}
                  eventHandlers={{ click: () => setSelectedSensorId(rack.sensor_id) }}
                >
                  <Popup>
                    <div style={{ color: "#121826", minWidth: "200px" }}>
                      <h6 className="fw-bold mb-1">{rack.name}</h6>
                      <p className="mb-0 small">Sensor ID: {rack.sensor_id}</p>

                      {rack.location ? <p className="mb-1 small">Lokasi: {rack.location}</p> : null}

                      {rack.photoDataUrl ? (
                        <img
                          src={rack.photoDataUrl}
                          alt="Lokasi rack"
                          style={{ width: "100%", borderRadius: 8, margin: "8px 0" }}
                        />
                      ) : (
                        <p className="mb-1 small text-muted">(Belum ada foto)</p>
                      )}

                      <p className="mb-0 small">
                        Temp: <b>{rack.temp}°C</b>
                      </p>
                      <p className="mb-2 small">
                        Hum: <b>{rack.hum}%</b>
                      </p>

                      <button
                        type="button"
                        className="btn btn-sm btn-primary w-100 text-white border-0 shadow-sm"
                        onClick={() => openGrafana(rack.sensor_id)}
                      >
                        Buka Grafana
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="card card-stylish p-4 d-flex flex-column" style={{ width: "100%", maxWidth: "400px" }}>
          <h5 className="fw-bold text-white mb-4">Server Rack</h5>

          {serverRacks.length === 0 ? (
            <div className="text-muted-custom small">
              Tidak ada data rack dari backend. Cek:
              <ul className="mt-2">
                <li>
                  Endpoint: <code>{BACKEND_URL}{RACKS_ENDPOINT}</code>
                </li>
                <li>Backend running & bisa diakses dari browser</li>
                <li>Response backend berupa JSON array</li>
              </ul>
            </div>
          ) : (
            <div className="list-group list-group-flush mb-4 flex-grow-1 overflow-auto" style={{ maxHeight: "400px" }}>
              {serverRacks.map((rack) => (
                <button
                  key={rack.sensor_id}
                  onClick={() => setSelectedSensorId(rack.sensor_id)}
                  className={`list-group-item rack-item d-flex justify-content-between align-items-center p-3 mb-2 
                    ${activeRack?.sensor_id === rack.sensor_id ? "active" : ""} 
                    ${rack.status === "Offline" ? "opacity-50" : ""}`}
                  type="button"
                >
                  <div className="text-start">
                    <div className="fw-bold">{rack.name}</div>
                    <small className={activeRack?.sensor_id === rack.sensor_id ? "text-white-50" : "text-muted-custom"}>
                      {rack.sensor_id}
                    </small>
                  </div>

                  <div className="d-flex gap-2">
                    <span
                      className={`badge-temp badge ${rack.status === "Offline" ? "bg-dark text-secondary" : rack.temp > 27 ? "bg-danger text-white" : "bg-emerald text-white"}`}
                      style={{ fontSize: "11px", minWidth: "50px" }}
                    >
                      {rack.status === "Online" ? `${rack.temp}°C` : "OFF"}
                    </span>
                    {rack.status === "Online" && (
                      <span
                        className="badge bg-info text-dark d-flex align-items-center justify-content-center"
                        style={{ fontSize: "11px", minWidth: "45px" }}
                      >
                        {rack.hum}%
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-auto pt-3 border-top border-secondary">
            <small className="text-muted-custom d-block mb-1 text-uppercase" style={{ fontSize: "10px" }}>
              Selected Unit
            </small>
            <div className="fw-bold text-white mb-3 fs-5">{activeRack?.name || "Pilih Rak"}</div>

            <button
              type="button"
              onClick={() => activeRack && openGrafana(activeRack.sensor_id)}
              className={`btn btn-primary w-100 py-3 rounded-pill fw-bold shadow-lg border-0 mb-2 ${!activeRack || activeRack?.status === "Offline" ? "btn-secondary" : ""
                }`}
              disabled={!activeRack || activeRack?.status === "Offline"}
            >
              OPEN RACK ANALYTIC &rarr;
            </button>
            {auth?.user?.role === "admin" && (
              <button
                type="button"
                onClick={() => activeRack && setExportModalOpen(true)}
                className={`btn btn-outline-info w-100 py-2 rounded-pill fw-bold border-2 ${!activeRack ? "btn-secondary text-muted" : ""}`}
                disabled={!activeRack}
              >
                📊 EXPORT TELEMETRY
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Telemetry Export Modal */}
      {exportModalOpen && (
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1050 }} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content bg-dark text-white" style={{ border: "1px solid #212936" }}>
              <div className="modal-header" style={{ borderBottom: "1px solid #212936" }}>
                <h5 className="modal-title fw-bold">📊 Ekspor Laporan Telemetri</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setExportModalOpen(false)}
                />
              </div>

              <div className="modal-body">
                {exportErr ? <div className="alert alert-danger py-2">{exportErr}</div> : null}

                <p className="small text-muted-custom mb-3">
                  Ekspor histori suhu & kelembapan untuk <b>{activeRack?.name} ({activeRack?.sensor_id})</b> ke file .CSV.
                </p>

                <div className="mb-3">
                  <label className="form-label small text-muted-custom">Tanggal Mulai (Opsional)</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={exportDates.start}
                    onChange={(e) => setExportDates((d) => ({ ...d, start: e.target.value }))}
                    style={{ backgroundColor: "#121826", borderColor: "#212936", color: "white" }}
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label small text-muted-custom">Tanggal Selesai (Opsional)</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={exportDates.end}
                    onChange={(e) => setExportDates((d) => ({ ...d, end: e.target.value }))}
                    style={{ backgroundColor: "#121826", borderColor: "#212936", color: "white" }}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: "1px solid #212936" }}>
                <button
                  type="button"
                  className="btn btn-outline-light"
                  onClick={() => setExportModalOpen(false)}
                  disabled={exportLoading}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className="btn btn-primary fw-bold"
                  onClick={handleExportCSV}
                  disabled={exportLoading}
                >
                  {exportLoading ? "Mengunduh..." : "Download CSV"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manage Users Modal */}
      {userModalOpen && (
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1060 }} tabIndex="-1">
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content text-white" style={{ backgroundColor: "#141c2b", border: "1px solid #212936" }}>
              <div className="modal-header" style={{ borderBottom: "1px solid #212936" }}>
                <h5 className="modal-title fw-bold">👤 Kelola Pengguna (Users)</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => { setUserModalOpen(false); setUserErr(""); setUserSuccess(""); }}
                />
              </div>
              <div className="modal-body">
                {userErr && <div className="alert alert-danger py-2 small">{userErr}</div>}
                {userSuccess && <div className="alert alert-success py-2 small">{userSuccess}</div>}

                <div className="row g-4">
                  {/* Kolom Kiri: Form Buat User */}
                  <div className="col-12 col-lg-5">
                    <h6 className="fw-bold mb-3">➕ Tambah User Baru</h6>
                    <div className="mb-3">
                      <label className="form-label small text-white fw-semibold">Username</label>
                      <input
                        type="text"
                        className="form-control input-dark"
                        style={{ backgroundColor: "#1a2332", border: "1px solid #212936", color: "#fff" }}
                        placeholder="Masukkan username..."
                        value={userForm.username}
                        onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label small text-white fw-semibold">Password</label>
                      <input
                        type="password"
                        className="form-control input-dark"
                        style={{ backgroundColor: "#1a2332", border: "1px solid #212936", color: "#fff" }}
                        placeholder="Masukkan password..."
                        value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label small text-white fw-semibold">Role</label>
                      <select
                        className="form-select"
                        style={{ backgroundColor: "#1a2332", border: "1px solid #212936", color: "#fff" }}
                        value={userForm.role}
                        onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                      >
                        <option value="viewer">Viewer — Hanya bisa lihat dashboard</option>
                        <option value="admin">Admin — Bisa kelola rack &amp; user</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn btn-warning w-100 fw-bold text-dark mt-2"
                      onClick={handleCreateUser}
                      disabled={userLoading}
                    >
                      {userLoading ? "Menyimpan..." : "Buat User"}
                    </button>
                  </div>

                  {/* Kolom Kanan: Daftar User Aktif */}
                  <div className="col-12 col-lg-7">
                    <h6 className="fw-bold mb-3">📋 Daftar User Aktif</h6>
                    <div className="table-responsive" style={{ maxHeight: "280px", overflowY: "auto" }}>
                      <table className="table table-dark table-striped table-hover align-middle mb-0" style={{ fontSize: "13px", borderColor: "#212936" }}>
                        <thead>
                          <tr style={{ borderColor: "#212936" }}>
                            <th>Username</th>
                            <th>Role</th>
                            <th className="text-end">Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usersList.length === 0 ? (
                            <tr>
                              <td colSpan="3" className="text-center text-muted-custom py-3">Tidak ada user ditemukan.</td>
                            </tr>
                          ) : (
                            usersList.map((u) => (
                              <tr key={u.id} style={{ borderColor: "#212936" }}>
                                <td className="fw-semibold">{u.username}</td>
                                <td>
                                  {u.username === auth?.user?.username ? (
                                    <span className="badge bg-warning text-dark" style={{ fontSize: "10px" }}>
                                      {String(u.role).toUpperCase()}
                                    </span>
                                  ) : (
                                    <select
                                      className="form-select form-select-sm"
                                      value={u.role}
                                      onChange={(e) => handleUpdateUser(u.id, { role: e.target.value })}
                                      style={{
                                        fontSize: "12px",
                                        backgroundColor: "#1a2332",
                                        border: "1px solid #212936",
                                        color: "#fff",
                                        padding: "2px 8px",
                                        width: "100px",
                                      }}
                                    >
                                      <option value="viewer">VIEWER</option>
                                      <option value="admin">ADMIN</option>
                                    </select>
                                  )}
                                </td>
                                <td className="text-end">
                                  <button
                                    className="btn btn-sm btn-outline-warning py-0 px-2 me-1"
                                    onClick={() => {
                                      const newPass = window.prompt(`Masukkan password baru untuk user "${u.username}":`);
                                      if (newPass !== null && newPass.trim() !== "") {
                                        handleUpdateUser(u.id, { password: newPass });
                                      }
                                    }}
                                    style={{ fontSize: "12px" }}
                                  >
                                    🔑 Reset
                                  </button>
                                  <button
                                    className="btn btn-sm btn-outline-danger py-0 px-2"
                                    onClick={() => handleDeleteUser(u.id, u.username)}
                                    disabled={u.username === auth?.user?.username}
                                    style={{ fontSize: "12px" }}
                                  >
                                    Hapus
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop: "1px solid #212936" }}>
                <button
                  type="button"
                  className="btn btn-outline-light"
                  onClick={() => { setUserModalOpen(false); setUserErr(""); setUserSuccess(""); }}
                  disabled={userLoading}
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;