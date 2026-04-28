import React, { useMemo, useState } from "react";
import { loadRacks, saveRacks } from "../storage/racksStorage";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function RackAdmin({ onChange }) {
  const [racks, setRacks] = useState(() => loadRacks());

  const [form, setForm] = useState({
    sensor_id: "",
    name: "",
    lat: "",
    lng: "",
    location: "",
    photoDataUrl: ""
  });

  const canSave = useMemo(() => {
    return (
      form.sensor_id.trim() &&
      form.name.trim() &&
      String(form.lat).trim() &&
      String(form.lng).trim()
    );
  }, [form]);

  function persist(next) {
    setRacks(next);
    saveRacks(next);
    onChange?.(next);
  }

  async function onPickPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setForm((f) => ({ ...f, photoDataUrl: dataUrl }));
  }

  function addRack() {
    const next = [
      ...racks,
      {
        sensor_id: form.sensor_id.trim(),
        name: form.name.trim(),
        lat: Number(form.lat),
        lng: Number(form.lng),
        location: form.location.trim(),
        photoDataUrl: form.photoDataUrl
      }
    ];
    persist(next);
    setForm({ sensor_id: "", name: "", lat: "", lng: "", location: "", photoDataUrl: "" });
  }

  function removeRack(sensor_id) {
    const next = racks.filter((r) => r.sensor_id !== sensor_id);
    persist(next);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div>
        <h3>Tambah Rack</h3>

        <div>
          <label>Sensor ID</label>
          <input value={form.sensor_id} onChange={(e) => setForm({ ...form, sensor_id: e.target.value })} style={{ width: "100%" }} />
        </div>

        <div>
          <label>Nama Rack</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: "100%" }} />
        </div>

        <div>
          <label>Latitude</label>
          <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} style={{ width: "100%" }} />
        </div>

        <div>
          <label>Longitude</label>
          <input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} style={{ width: "100%" }} />
        </div>

        <div>
          <label>Lokasi (opsional)</label>
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={{ width: "100%" }} />
        </div>

        <div>
          <label>Foto lokasi (opsional)</label>
          <input type="file" accept="image/*" onChange={onPickPhoto} />
          {form.photoDataUrl ? (
            <div style={{ marginTop: 8 }}>
              <img src={form.photoDataUrl} alt="preview" style={{ width: "100%", maxWidth: 240, borderRadius: 8 }} />
            </div>
          ) : null}
        </div>

        <button disabled={!canSave} onClick={addRack} style={{ marginTop: 12 }}>
          Save Rack
        </button>
      </div>

      <div>
        <h3>Daftar Rack (Local)</h3>
        {racks.map((r) => (
          <div key={r.sensor_id} style={{ border: "1px solid #444", padding: 10, borderRadius: 8, marginBottom: 8 }}>
            <div><b>{r.name}</b> ({r.sensor_id})</div>
            <div style={{ fontSize: 12 }}>{r.lat}, {r.lng}</div>
            {r.photoDataUrl ? <img src={r.photoDataUrl} alt="" style={{ width: "100%", maxWidth: 240, borderRadius: 8, marginTop: 6 }} /> : null}
            <button onClick={() => removeRack(r.sensor_id)} style={{ marginTop: 8 }}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}