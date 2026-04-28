import React from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import { loadAuth } from "../storage/authStorage";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

// fix marker icon
const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

async function getGrafanaUrl(sensor_id) {
  const auth = loadAuth();
  if (!auth?.token) throw new Error("Not logged in");

  const res = await fetch(`${API_BASE}/api/grafana/url?sensor_id=${encodeURIComponent(sensor_id)}`, {
    headers: { Authorization: `Bearer ${auth.token}` }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to get Grafana URL");
  return data.url;
}

export default function RackMap({ racks }) {
  const center = racks?.[0] ? [racks[0].lat, racks[0].lng] : [-6.2, 106.816666];

  async function openAnalytics(sensor_id) {
    const url = await getGrafanaUrl(sensor_id);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <MapContainer center={center} zoom={15} style={{ height: 520, width: "100%" }}>
      <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png" />
      {racks.map((r) => (
        <Marker key={r.sensor_id} position={[r.lat, r.lng]}>
          <Popup>
            <div style={{ minWidth: 220 }}>
              <div style={{ fontWeight: 700 }}>{r.name}</div>
              <div style={{ fontSize: 12, marginBottom: 8 }}>{r.sensor_id}</div>

              {r.photoDataUrl ? (
                <img
                  src={r.photoDataUrl}
                  alt="lokasi rack"
                  style={{ width: "100%", borderRadius: 8, marginBottom: 8 }}
                />
              ) : (
                <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                  (Belum ada foto)
                </div>
              )}

              <button onClick={() => openAnalytics(r.sensor_id)} style={{ width: "100%" }}>
                Open Analytics
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}   