const KEY = "terahumi:racks";

/**
 * Metadata rack yang dikelola via website (localStorage).
 * Foto disimpan sebagai base64 data URL: photoDataUrl
 */
export function loadRackMeta() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveRackMeta(meta) {
  localStorage.setItem(KEY, JSON.stringify(meta));
}

/** helper: cepat cari meta berdasarkan sensor_id */
export function getMetaBySensorId(meta, sensor_id) {
  return meta.find((m) => String(m.sensor_id).trim() === String(sensor_id).trim()) || null;
}