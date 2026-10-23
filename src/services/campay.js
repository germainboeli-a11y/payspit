const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function requestCampayPayment({ amount, phoneNumber, description, externalReference }) {
  const response = await fetch(`${API_BASE}/api/campay-collect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, phoneNumber, description, externalReference }),
  });
  const data = await response.json().catch(() => ({}));
  console.log('Campay collect', response.status, data);
  if (!response.ok) throw new Error(data.message || data.detail || `HTTP ${response.status}`);
  return data;
}

export async function checkCampayStatus(reference) {
  const response = await fetch(`${API_BASE}/api/campay-status?reference=${encodeURIComponent(reference)}`);
  const data = await response.json().catch(() => ({}));
  console.log('Campay status', response.status, data);
  if (!response.ok) throw new Error(data.message || data.detail || `HTTP ${response.status}`);
  return data;
}