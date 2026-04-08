import React, { useState, useEffect, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet default icon fix
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

// ======================
// CONFIG
// ======================
const BACKEND_URL = "http://10.10.240.50:5000"; // <-- ganti sesuai API Node.js Anda
const RACKS_ENDPOINT = "/api/racks";

// URL Grafana yang BENAR (Raspberry Pi)
const BASE_GRAFANA_URL ="http://10.10.240.50:3000/d/ad8qjkz/terahumi-dashboard-v4?orgId=1"; // <-- ganti jika UID dashboard berubah

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
  const [serverRacks, setServerRacks] = useState([]);
  const [activeRack, setActiveRack] = useState(null);
  const [loading, setLoading] = useState(true);

  const getGrafanaLink = (sensorId) =>
    `${BASE_GRAFANA_URL}&var-sensor_id=${encodeURIComponent(sensorId)}`;

  const openGrafana = (sensorId) => {
    const url = getGrafanaLink(sensorId);
    console.log("Opening Grafana URL:", url);
    // Paksa buka tab baru (tidak bisa diambil alih router React)
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const fetchRacksFromBackend = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}${RACKS_ENDPOINT}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Backend HTTP ${response.status} ${response.statusText} - ${text}`
        );
      }

      const data = await response.json();

      // Normalisasi supaya formatnya konsisten untuk UI
      const liveData = (Array.isArray(data) ? data : []).map((row, index) => {
        const sensor_id = row.sensor_id ?? row.sensorId ?? `UNKNOWN-${index + 1}`;

        const lat =
          Array.isArray(row.pos) ? row.pos[0] : row.latitude ?? row.lat ?? -6.210;
        const lon =
          Array.isArray(row.pos)
            ? row.pos[1]
            : row.longitude ?? row.lng ?? row.lon ?? 106.820;

        return {
          id: row.id ?? index + 1,
          sensor_id,
          name: row.name ?? `Rack ${sensor_id}`,
          temp: Number(row.temp ?? row.temperature ?? 0),
          hum: Number(row.hum ?? row.humidity ?? 0),
          status: row.status ?? "Online",
          pos: [Number(lat), Number(lon)],
          last_time: row.last_time ?? row.time ?? null,
        };
      });

      setServerRacks(liveData);
      if (!activeRack && liveData.length > 0) setActiveRack(liveData[0]);
      setLoading(false);
    } catch (error) {
      console.error("Gagal ambil data rack dari backend:", error);
      setServerRacks([]);
      setActiveRack(null);
      setLoading(false);
    }
  }, [activeRack]);

  useEffect(() => {
    fetchRacksFromBackend();
    const interval = setInterval(fetchRacksFromBackend, 15000);
    return () => clearInterval(interval);
  }, [fetchRacksFromBackend]);

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
              <div className="fw-bold small text-white text-uppercase">Raihan</div>
              <div className="text-emerald small fw-bold" style={{ fontSize: "10px" }}>
                SYSTEM ADMINISTRATOR
              </div>
            </div>
            <div
              className="bg-primary rounded-circle"
              style={{ width: "40px", height: "40px", border: "2px solid #212936" }}
            ></div>
          </div>
        </div>
      </nav>

      <div className="flex-grow-1 container-fluid px-4 d-flex flex-column flex-lg-row gap-4 mb-4 overflow-hidden">
        {/* MAP */}
        <div className="flex-grow-1 position-relative" style={{ minHeight: "450px" }}>
          <div
            className="h-100 w-100 rounded-4 overflow-hidden shadow-lg border"
            style={{ borderColor: "#212936" }}
          >
            <MapContainer
              center={mapCenter}
              zoom={13}
              style={{ height: "100%", width: "100%" }}
              zoomControl={false}
            >
              <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png" />
              <ChangeView center={activeRack?.pos} />

              {serverRacks.map((rack) => (
                <Marker
                  key={rack.id}
                  position={rack.pos}
                  eventHandlers={{ click: () => setActiveRack(rack) }}
                >
                  <Popup>
                    <div style={{ color: "#121826", minWidth: "170px" }}>
                      <h6 className="fw-bold mb-1">{rack.name}</h6>
                      <p className="mb-0 small">Sensor ID: {rack.sensor_id}</p>
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
                        disabled={rack.status === "Offline"}
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
            <div
              className="list-group list-group-flush mb-4 flex-grow-1 overflow-auto"
              style={{ maxHeight: "400px" }}
            >
              {serverRacks.map((rack) => (
                <button
                  key={rack.id}
                  onClick={() => setActiveRack(rack)}
                  className={`list-group-item rack-item d-flex justify-content-between align-items-center p-3 mb-2 
                    ${activeRack?.id === rack.id ? "active" : ""} 
                    ${rack.status === "Offline" ? "opacity-50" : ""}`}
                  type="button"
                >
                  <div className="text-start">
                    <div className="fw-bold">{rack.name}</div>
                    <small className={activeRack?.id === rack.id ? "text-white-50" : "text-muted-custom"}>
                      {rack.sensor_id}
                    </small>
                  </div>

                  <span
                    className={`badge-temp badge ${
                      rack.status === "Offline"
                        ? "bg-dark"
                        : rack.temp > 27
                        ? "bg-danger"
                        : "bg-emerald"
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