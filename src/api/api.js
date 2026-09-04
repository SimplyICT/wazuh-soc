const API = '/api';

export async function apiGet(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.data || data;
}

export async function apiPut(path) {
  const res = await fetch(API + path, { method: 'PUT' });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

/** Shared helper for alert actions. */
async function apiAlertAction(alertId, action) {
  const label = action.charAt(0).toUpperCase() + action.slice(1);
  const res = await fetch(`${API}/alert/${alertId}/${action}`, { method: 'POST' });
  if (!res.ok) throw new Error(`${label} failed: ${res.status}: ${res.statusText}`);
  return res.json();
}

/** Acknowledge an alert via the backend's alert endpoint. */
export async function apiAcknowledge(alertId) {
  return apiAlertAction(alertId, 'acknowledge');
}

/** Resolve an alert via the backend's alert endpoint. */
export async function apiResolve(alertId) {
  return apiAlertAction(alertId, 'resolve');
}
