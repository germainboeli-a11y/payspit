export default async function handler(req, res) {
  // Autoriser uniquement les requêtes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Méthode non autorisée' });
  }

  try {
    const { amount, phoneNumber, description, externalReference } = req.body;

    // Récupération du token secret configuré sur Vercel (sans le préfixe VITE_ côté serveur)
    const campayToken = process.env.CAMPAY_TOKEN || process.env.VITE_CAMPAY_TOKEN;
    const campayBaseUrl = process.env.CAMPAY_BASE_URL || 'https://demo.campay.net/api'; // Utiliser l'URL de production le moment venu

    if (!campayToken) {
      return res.status(500).json({ message: 'Jeton CamPay non configuré sur le serveur.' });
    }

    // Appel vers l'API officielle de CamPay
    const response = await fetch(`${campayBaseUrl}/collect/`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${campayToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        from: phoneNumber,
        description,
        external_reference: externalReference,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ message: data.message || 'Erreur lors de l’initialisation du paiement CamPay' });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Erreur serveur campay-collect:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
}