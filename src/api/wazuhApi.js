const API = '/wazuh-api';

export async function apiGet(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.data || data;
}

export async function apiPut(path) {
  const res = await fetch(API + path, { method: 'PUT' });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
