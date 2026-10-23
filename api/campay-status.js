export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Méthode non autorisée' });
  }

  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({ message: 'Référence de transaction manquante' });
    }

    const campayToken = process.env.CAMPAY_TOKEN || process.env.VITE_CAMPAY_TOKEN;
    const campayBaseUrl = process.env.CAMPAY_BASE_URL || 'https://demo.campay.net/api';

    if (!campayToken) {
      return res.status(500).json({ message: 'Jeton CamPay non configuré sur le serveur.' });
    }

    // Appel vers l'API CamPay pour vérifier le statut
    const response = await fetch(`${campayBaseUrl}/transaction/${reference}/`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${campayToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ message: data.message || 'Erreur lors de la vérification du statut' });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Erreur serveur campay-status:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
}