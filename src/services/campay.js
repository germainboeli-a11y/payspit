const CAMPAY_BASE_URL = import.meta.env.VITE_CAMPAY_BASE_URL || 'https://demo.campay.net/api';
const CAMPAY_TOKEN = import.meta.env.VITE_CAMPAY_TOKEN;

export async function requestCampayPayment({ amount, phoneNumber, description, externalReference }) {
  console.log('Campay token présent ?', !!CAMPAY_TOKEN);
  const response = await fetch(`${CAMPAY_BASE_URL}/collect/`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${CAMPAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: String(amount),
      from: phoneNumber,
      description,
      external_reference: externalReference,
      currency: 'XAF',
    }),
  });
  const data = await response.json().catch(() => ({}));
  console.log('Campay collect', response.status, data);
  if (!response.ok) throw new Error(data.message || data.detail || `HTTP ${response.status}`);
  return data;
}

export async function checkCampayStatus(reference) {
  const response = await fetch(`${CAMPAY_BASE_URL}/transaction/${reference}/`, {
    headers: { Authorization: `Token ${CAMPAY_TOKEN}` },
  });
  const data = await response.json().catch(() => ({}));
  console.log('Campay status', response.status, data);
  if (!response.ok) throw new Error(data.message || data.detail || `HTTP ${response.status}`);
  return data;
}


