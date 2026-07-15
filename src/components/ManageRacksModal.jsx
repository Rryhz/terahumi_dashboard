import React, { useEffect, useMemo, useState } from "react";

const BACKEND_URL = process.env.REACT_APP_API_BASE_URL || "http://104.214.173.123:5000";

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
  const [isEditing, setIsEditing] = useState(false);

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
    setIsEditing(true);
  }

  function resetForm() {
    setForm({ sensor_id: "", name: "", lat: "", lng: "", location: "", photoDataUrl: "" });
    setIsEditing(false);
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
            <h5 className="modal-title fw-bold">Add Racks</h5>
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
                <h6 className="fw-bold mb-3">{isEditing ? "✏️ Edit Data Rack" : "➕ Tambah Rack Baru"}</h6>

                <div className="mb-2">
                  <label className="form-label small text-white fw-semibold">Sensor ID</label>
                  <input
                    className="form-control input-dark"
                    value={form.sensor_id}
                    onChange={(e) => setForm((f) => ({ ...f, sensor_id: e.target.value }))}
                    placeholder="TH-001"
                    disabled={isEditing}
                    style={{ backgroundColor: "#121826", borderColor: "#212936", color: "white" }}
                  />
                  {!isEditing && (
                    <div className="form-text text-muted" style={{ fontSize: "11px" }}>
                      Pastikan sensor_id unik. Contoh: TH-001
                    </div>
                  )}
                </div>

                <div className="mb-2">
                  <label className="form-label small text-white fw-semibold">Nama Rack</label>
                  <input
                    className="form-control input-dark"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Nama rack..."
                    style={{ backgroundColor: "#121826", borderColor: "#212936", color: "white" }}
                  />
                </div>

                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label small text-white fw-semibold">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control input-dark"
                      value={form.lat}
                      onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                      placeholder="-6.20"
                      style={{ backgroundColor: "#121826", borderColor: "#212936", color: "white" }}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label small text-white fw-semibold">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control input-dark"
                      value={form.lng}
                      onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                      placeholder="106.82"
                      style={{ backgroundColor: "#121826", borderColor: "#212936", color: "white" }}
                    />
                  </div>
                </div>

                <div className="mt-2 mb-2">
                  <label className="form-label small text-white fw-semibold">Lokasi (opsional)</label>
                  <input
                    className="form-control input-dark"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="Contoh: Gedung A, Lantai 2"
                    style={{ backgroundColor: "#121826", borderColor: "#212936", color: "white" }}
                  />
                </div>

                <div className="mt-2 mb-3">
                  <label className="form-label small text-white fw-semibold">Foto lokasi (opsional)</label>
                  <label 
                    className="d-flex flex-column align-items-center justify-content-center border rounded-3 p-3 text-center" 
                    style={{ borderColor: "#212936", borderStyle: "dashed", borderWidth: "2px", cursor: "pointer", backgroundColor: "#121826" }}
                  >
                    <input type="file" accept="image/*" onChange={onPickPhoto} className="d-none" />
                    <span className="fs-4 mb-1">📷</span>
                    <span className="small text-muted" style={{ fontSize: "11px" }}>
                      {form.photoDataUrl ? "Ganti foto lokasi" : "Pilih foto lokasi..."}
                    </span>
                  </label>
                  {form.photoDataUrl ? (
                    <div className="position-relative mt-2" style={{ maxHeight: "150px", overflow: "hidden", borderRadius: "8px" }}>
                      <img
                        alt="preview"
                        src={form.photoDataUrl}
                        style={{ width: "100%", height: "auto", objectFit: "cover" }}
                      />
                      <button 
                        type="button" 
                        className="btn btn-sm btn-danger position-absolute top-0 end-0 m-2 d-flex align-items-center justify-content-center"
                        onClick={() => setForm((f) => ({ ...f, photoDataUrl: "" }))}
                        style={{ borderRadius: "50%", width: "24px", height: "24px", padding: 0 }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : null}
                </div>

                <button className="btn btn-primary w-100 mt-2 fw-bold" onClick={upsertRack} disabled={!canSave}>
                  {isEditing ? "Simpan Perubahan" : "Tambah Rack"}
                </button>

                {isEditing ? (
                  <button className="btn btn-outline-danger w-100 mt-2" onClick={resetForm} type="button">
                    Batal Edit
                  </button>
                ) : (
                  <button className="btn btn-outline-light w-100 mt-2" onClick={resetForm} type="button">
                    Clear Form
                  </button>
                )}
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
                        className="list-group-item text-white d-flex justify-content-between align-items-center p-3 mb-2 rounded border"
                        style={{ borderColor: "#212936", backgroundColor: "#121826" }}
                      >
                        <div className="d-flex align-items-center gap-3" style={{ minWidth: 0 }}>
                          {/* Miniature photo */}
                          <div 
                            style={{ 
                              width: "44px", 
                              height: "44px", 
                              borderRadius: "8px", 
                              backgroundColor: "#1e293b", 
                              backgroundSize: "cover", 
                              backgroundPosition: "center",
                              backgroundImage: r.photoDataUrl ? `url(${r.photoDataUrl})` : "none",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              border: "1px solid #212936"
                            }}
                          >
                            {!r.photoDataUrl && <span style={{ fontSize: "20px" }}>🖥️</span>}
                          </div>

                          <div style={{ minWidth: 0 }}>
                            <div className="fw-bold text-truncate">
                              {r.name} <span className="text-muted-custom font-monospace small" style={{ fontSize: "11px" }}>({r.sensor_id})</span>
                            </div>
                            <div className="small text-muted-custom text-truncate" style={{ fontSize: "11px" }}>
                              📍 {r.lat != null && r.lat !== "" ? Number(r.lat).toFixed(4) : "—"}, {r.lng != null && r.lng !== "" ? Number(r.lng).toFixed(4) : "—"}
                              {r.location ? ` | 🏢 ${r.location}` : ""}
                            </div>
                          </div>
                        </div>

                        <div className="d-flex gap-2 ms-2">
                          <button 
                            className="btn btn-sm btn-outline-info d-flex align-items-center justify-content-center" 
                            onClick={() => editRack(r)}
                            title="Edit Rack"
                            style={{ width: "30px", height: "30px", padding: 0 }}
                          >
                            ✏️
                          </button>
                          <button 
                            className="btn btn-sm btn-outline-danger d-flex align-items-center justify-content-center" 
                            onClick={() => deleteRack(r.sensor_id)}
                            title="Hapus Rack"
                            style={{ width: "30px", height: "30px", padding: 0 }}
                          >
                            🗑️
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