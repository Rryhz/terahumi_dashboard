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
const BACKEND_URL = "http://10.10.240.179:5000";
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

// Helper: force map move
const ChangeView = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, 15);
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
      <div className="vh-100 d-flex justify-content-center align-items-center bg-dark text-white">
        Connecting to Terahumi System...
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
              <button
                className="btn btn-sm btn-outline-info me-2"
                data-bs-toggle="modal"
                data-bs-target="#manageRacksModal"
              >
                Manage Racks
              </button>
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

                  <span
                    className={`badge-temp badge ${
                      rack.status === "Offline" ? "bg-dark" : rack.temp > 27 ? "bg-danger" : "bg-emerald"
                    }`}
                  >
                    {rack.status === "Online" ? `${rack.temp}°C` : "OFF"}
                  </span>
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
              className={`btn btn-primary w-100 py-3 rounded-pill fw-bold shadow-lg border-0 ${
                !activeRack || activeRack?.status === "Offline" ? "btn-secondary" : ""
              }`}
              disabled={!activeRack || activeRack?.status === "Offline"}
            >
              OPEN RACK ANALYTIC &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;