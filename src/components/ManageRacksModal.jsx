import React, { useEffect, useMemo, useState } from "react";

const BACKEND_URL = "http://10.10.240.50:5000";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader(); 
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function ManageRacksModal({ onChanged }) {
  const [racks, setRacks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [form, setForm] = useState({
    sensor_id: "",
    name: "",
    lat: "",
    lng: "",
    location: "",
    photoDataUrl: "",
  });

  const canSave = useMemo(() => {
    return form.sensor_id.trim() && form.name.trim();
  }, [form.sensor_id, form.name]);

  async function loadRacks() {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/racks`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);

      // normalize minimal agar form aman
      const normalized = (Array.isArray(data) ? data : []).map((r) => ({
        sensor_id: r.sensor_id,
        name: r.name ?? `Rack ${r.sensor_id}`,
        lat:
          Array.isArray(r.pos) ? r.pos[0] : (r.lat ?? r.latitude ?? ""),
        lng:
          Array.isArray(r.pos) ? r.pos[1] : (r.lng ?? r.lon ?? r.longitude ?? ""),
        location: r.location ?? "",
        photoDataUrl: r.photoDataUrl ?? "",
      }));

      setRacks(normalized);
    } catch (e) {
      setErr(e.message || "Gagal load racks");
      setRacks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // load saat modal pertama kali di-mount
    loadRacks();
  }, []);

  async function onPickPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setForm((f) => ({ ...f, photoDataUrl: dataUrl }));
  }

  function editRack(r) {
    setForm({
      sensor_id: r.sensor_id,
      name: r.name || "",
      lat: r.lat === "" || r.lat == null ? "" : String(r.lat),
      lng: r.lng === "" || r.lng == null ? "" : String(r.lng),
      location: r.location || "",
      photoDataUrl: r.photoDataUrl || "",
    });
  }

  function resetForm() {
    setForm({ sensor_id: "", name: "", lat: "", lng: "", location: "", photoDataUrl: "" });
  }

  async function upsertRack() {
    setErr("");
    const sensor_id = form.sensor_id.trim();
    const payload = {
      name: form.name.trim(),
      lat: String(form.lat).trim() === "" ? null : Number(form.lat),
      lng: String(form.lng).trim() === "" ? null : Number(form.lng),
      location: form.location.trim(),
      photoDataUrl: form.photoDataUrl || "",
    };

    try {
      const res = await fetch(`${BACKEND_URL}/api/racks/${encodeURIComponent(sensor_id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);

      // refresh list agar konsisten dari DB
      await loadRacks();
      resetForm();
      onChanged?.();
    } catch (e) {
      setErr(e.message || "Gagal save rack");
    }
  }

  async function deleteRack(sensor_id) {
    if (!window.confirm(`Hapus rack ${sensor_id}?`)) return;
    setErr("");
    try {
      const res = await fetch(`${BACKEND_URL}/api/racks/${encodeURIComponent(sensor_id)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);

      await loadRacks();
      onChanged?.();
    } catch (e) {
      setErr(e.message || "Gagal delete rack");
    }
  }

  return (
    <div className="modal fade" id="manageRacksModal" tabIndex="-1" aria-hidden="true">
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content bg-dark text-white" style={{ border: "1px solid #212936" }}>
          <div className="modal-header" style={{ borderBottom: "1px solid #212936" }}>
            <h5 className="modal-title fw-bold">Manage Racks (PostgreSQL)</h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              data-bs-dismiss="modal"
              aria-label="Close"
            />
          </div>

          <div className="modal-body">
            {err ? <div className="alert alert-danger py-2">{err}</div> : null}

            <div className="row g-3">
              <div className="col-12 col-lg-5">
                <h6 className="fw-bold mb-2">Tambah / Edit Rack</h6>

                <div className="mb-2">
                  <label className="form-label small">Sensor ID</label>
                  <input
                    className="form-control"
                    value={form.sensor_id}
                    onChange={(e) => setForm((f) => ({ ...f, sensor_id: e.target.value }))}
                    placeholder="TH-001"
                  />
                  <div className="form-text text-muted">
                    Pastikan sensor_id unik. Contoh: TH-001
                  </div>
                </div>

                <div className="mb-2">
                  <label className="form-label small">Nama Rack</label>
                  <input
                    className="form-control"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>

                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label small">Latitude</label>
                    <input
                      className="form-control"
                      value={form.lat}
                      onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                      placeholder="-6.20"
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label small">Longitude</label>
                    <input
                      className="form-control"
                      value={form.lng}
                      onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                      placeholder="106.82"
                    />
                  </div>
                </div>

                <div className="mt-2">
                  <label className="form-label small">Lokasi (opsional)</label>
                  <input
                    className="form-control"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  />
                </div>

                <div className="mt-2">
                  <label className="form-label small">Foto lokasi (opsional)</label>
                  <input className="form-control" type="file" accept="image/*" onChange={onPickPhoto} />
                  {form.photoDataUrl ? (
                    <img
                      alt="preview"
                      src={form.photoDataUrl}
                      style={{ width: "100%", borderRadius: 10, marginTop: 10 }}
                    />
                  ) : null}
                </div>

                <button className="btn btn-primary w-100 mt-3 fw-bold" onClick={upsertRack} disabled={!canSave}>
                  Save to PostgreSQL
                </button>

                <button className="btn btn-outline-light w-100 mt-2" onClick={resetForm} type="button">
                  Clear Form
                </button>
              </div>

              <div className="col-12 col-lg-7">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="fw-bold m-0">Daftar Rack</h6>
                  <button className="btn btn-sm btn-outline-info" onClick={loadRacks} disabled={loading}>
                    Refresh
                  </button>
                </div>

                {loading ? (
                  <div className="text-muted">Loading...</div>
                ) : racks.length === 0 ? (
                  <div className="text-muted">Belum ada rack di PostgreSQL.</div>
                ) : (
                  <div className="list-group">
                    {racks.map((r) => (
                      <div
                        key={r.sensor_id}
                        className="list-group-item bg-black text-white d-flex justify-content-between align-items-center"
                        style={{ borderColor: "#212936" }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div className="fw-bold text-truncate">
                            {r.name} <span className="text-muted">({r.sensor_id})</span>
                          </div>
                          <div className="small text-muted">
                            {r.lat ?? ""}{r.lat != null ? ", " : ""}{r.lng ?? ""}
                          </div>
                        </div>

                        <div className="d-flex gap-2">
                          <button className="btn btn-sm btn-outline-light" onClick={() => editRack(r)}>
                            Edit
                          </button>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => deleteRack(r.sensor_id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer" style={{ borderTop: "1px solid #212936" }}>
            <button type="button" className="btn btn-outline-light" data-bs-dismiss="modal">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}