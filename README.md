# PaySpit — Démo Web React

Application de démonstration de la plateforme d'escrow PaySpit (paiement Mobile Money sous séquestre).

## Installation

```bash
npm install
```

## Lancer en développement

```bash
npm run dev
```

Puis ouvrez l'URL indiquée (par défaut http://localhost:5173).

## Build de production

```bash
npm run build
npm run preview
```

## Structure

- `src/App.jsx` — composant principal (création de lien d'escrow, déblocage OTP, simulateur acheteur, gestion des litiges, copilote IA flottant)
- `src/main.jsx` — point d'entrée React
- `src/index.css` — styles globaux + Tailwind
- `tailwind.config.js` — palette de couleurs PaySpit (violet/cyan/rose néon)
