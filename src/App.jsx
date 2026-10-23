import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ShieldCheck, KeyRound, Package, Smartphone, Send, X, CheckCircle2, Sparkles,
  Camera, Eye, EyeOff, MapPin, QrCode, Copy, ChevronDown, Lock, Phone, ArrowLeft,
  AlertTriangle, Wallet, MessageCircle, Truck, CalendarDays, Clock, Hourglass,
  Menu, Star, History, ShoppingCart, Brain, LogOut, User as UserIcon, FileText, Upload, Trash2
} from 'lucide-react';
import jsQR from 'jsqr';
import { QRCodeSVG } from 'qrcode.react';
import paySpitLogoImg from './assets/logopayspit.png';
import orangeMoneyLogo from './assets/orange-money.png';
import mtnMomoLogo from './assets/mtn-momo.png';
import { requestCampayPayment, checkCampayStatus } from './services/campay';

/* ================= Constantes ================= */
const OPERATOR_LOGOS = {
  orange: orangeMoneyLogo,
  mtn: mtnMomoLogo,
};

const PAYMENT_EVENTS_KEY = 'payspit_payment_events';
const PAID_INVOICES_KEY = 'payspit_paid_invoices';
const PROCESSING_DELAY_MS = 2500;

/* --- Configuration Campay (demo) --- */
const CAMPAY_POLL_INTERVAL_MS = 3000;
const CAMPAY_POLL_MAX_TRIES = 40;

const STATUS = { CREATED: 'CREATED', ESCROW_LOCKED: 'ESCROW_LOCKED', COMPLETED: 'COMPLETED', DISPUTED: 'DISPUTED' };

const CATEGORIES = ['Mode & Accessoires', 'Accessoires de Modes', 'Smartphones', 'Informatique', 'Beauté', 'Alimentation', 'Autre'];

const LIVREURS = [
  { id: 'none', name: 'Aucun (remise en main propre)', phone: '' },
  { id: 'paul', name: 'Paul — Livreur PaySpit', phone: '+237 689 98 11 22' },
  { id: 'sarah', name: 'Sarah — Livreuse PaySpit', phone: '+237 655 22 33 44' },
];

const PRESETS = [
  { name: "Basket Jordan Taille 42 (Neuve)", price: 15000, category: "Mode & Accessoires", emoji: "👟", fee: 0, days: 7, image: 'sneaker' },
  { name: "iPhone 14 Pro Max à Brancher", price: 37000, category: "Smartphones", emoji: "📱", fee: 0, days: 3, image: 'phone' },
  { name: "Montre Homme Quartz Cuir", price: 67000, category: "Accessoires de Modes", emoji: "⌚", fee: 1000, days: 2, image: 'watch' },
  { name: "MacBook Pro M2 16GB", price: 850000, category: "Informatique", emoji: "💻", fee: 3000, days: 5, image: 'laptop' },
  { name: "Parfum de Luxe 100ml", price: 45000, category: "Beauté", emoji: "🧴", fee: 1500, days: 2, image: 'perfume' }
];

/* ================= Images produit (SVG intégrées — aucune requête réseau) ================= */
const PRODUCT_TILES = {
  sneaker: ['#F97316', '👟'],
  phone: ['#1F2937', '📱'],
  watch: ['#92400E', '⌚'],
  laptop: ['#2563EB', '💻'],
  perfume: ['#DB2777', '🧴'],
  bag: ['#7C3AED', '🛍️'],
};
const productImg = (key) => {
  const [bg, glyph] = PRODUCT_TILES[key] || PRODUCT_TILES.bag;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' rx='28' fill='${bg}'/><text x='100' y='118' font-size='96' text-anchor='middle' dominant-baseline='middle'>${glyph}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

/* ================= Aides ================= */
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const commission = (amount) => Math.round(amount * 0.02);
const daysLeft = (deadline) => Math.max(0, Math.ceil((deadline - Date.now()) / 86400000));
const slugify = (s) => (s || 'produit').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 18);
const genOtp = () => Math.floor(1000 + Math.random() * 9000).toString();
const genId = () => 'ps-' + Math.floor(100000 + Math.random() * 900000);

/* --- Factures déjà payées (une facture payée n'est plus valide pour un nouveau paiement) --- */
const readPaidInvoices = () => {
  try { return JSON.parse(localStorage.getItem(PAID_INVOICES_KEY) || '[]'); } catch (e) { return []; }
};

/* --- Résultat du paiement (simulation : à remplacer par le retour réel de l'opérateur Mobile Money / carte) ---
   « pending » = paiement non confirmé pour l'instant (hors ligne, numéro Mobile Money incomplet...) */
const simulatePaymentOutcome = (phone) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'pending';
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length > 0 && digits.length < 9) return 'pending';
  return 'success';
};

/* --- Campay (API demo) : normalisation du numéro (les appels API sont dans src/services/campay.js) --- */
const normalizeCampayPhone = (phone) => {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 9) return '237' + digits;
  return digits;
};

/* --- Lien de facture : les informations de la facture sont encodées dans l'URL de la page de paiement --- */
const encodePayload = (obj) => {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const decodePayload = (s) => {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    return null;
  }
};
const buildInvoiceLink = (tx, sellerName) => {
  const img = tx.shareImage || (tx.productImage && tx.productImage.length < 2500 ? tx.productImage : '');
  const payload = encodePayload({
    id: tx.id,
    seller: sellerName,
    productName: tx.productName,
    amount: tx.amount,
    deliveryFee: tx.deliveryFee,
    category: tx.category,
    escrowDays: tx.escrowDays,
    livreur: tx.livreur ? tx.livreur.name : '',
    image: img
  });
  return `${window.location.origin}${window.location.pathname}#/pay/${payload}`;
};
const makeThumb = (src, max = 240) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const ratio = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL('image/jpeg', 0.7));
  };
  img.onerror = () => resolve(null);
  img.src = src;
});

/* ================= Sous-composants UI ================= */
function PaySpitLogo({ size = 'md' }) {
  const s = size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';
  return (
    <div aria-label="PaySpit" className={`${s} rounded-xl shrink-0 shadow-lg shadow-ps-purple/30 bg-gradient-to-br from-ps-purple to-ps-accent text-white font-black flex items-center justify-center`}>
      P
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    [STATUS.ESCROW_LOCKED]: ['bg-amber-100 text-amber-700 border-amber-200', 'Bloqué'],
    [STATUS.COMPLETED]: ['bg-emerald-100 text-emerald-700 border-emerald-200', 'Terminé'],
    [STATUS.DISPUTED]: ['bg-rose-100 text-rose-700 border-rose-200', 'En Litige'],
    [STATUS.CREATED]: ['bg-cyan-50 text-cyan-700 border-cyan-200', 'En attente de paiement'],
  };
  const [cls, label] = map[status];
  return <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

/* ================= PAGE EXTERNE DE PAIEMENT (ouverte via le lien de la facture) ================= */
function PayPage({ payload }) {
  const inv = useMemo(() => decodePayload(payload), [payload]);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [phase, setPhase] = useState('form'); // form | processing | refused | pending
  const [lastOperator, setLastOperator] = useState('');
  const timerRef = useRef(null);
  const runRef = useRef(0);

  useEffect(() => () => { runRef.current += 1; clearTimeout(timerRef.current); }, []);

  const goToHowItWorks = (status) => {
    window.location.replace(`#/comment-fonctionne-payspit?status=${status}`);
  };

  const waitMs = (ms) => new Promise((resolve) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(resolve, ms);
  });

  /* Paiement Mobile Money via Campay (demo) : collecte puis vérification du statut jusqu'au résultat */
  const runCampayPayment = async (runId) => {
    try {
      const phone = normalizeCampayPhone(buyerPhone);
      if (phone.length < 12) return 'pending';
      const total = (inv.amount || 0) + (inv.deliveryFee || 0);
      const collectData = await requestCampayPayment({
        amount: total,
        phoneNumber: phone,
        description: `Paiement PaySpit - ${inv.productName}`,
        externalReference: `${inv.id}-${Date.now()}`
      });
      if (!collectData || !collectData.reference) throw new Error('campay_collect_failed');
      const reference = collectData.reference;
      for (let i = 0; i < CAMPAY_POLL_MAX_TRIES; i++) {
        await waitMs(CAMPAY_POLL_INTERVAL_MS);
        if (runId !== runRef.current) return 'pending';
        const statusData = await checkCampayStatus(reference);
        const status = statusData && statusData.status;
        if (status === 'SUCCESSFUL') return 'success';
        if (status === 'FAILED') return 'pending';
      }
      return 'pending';
    } catch (e) {
      return 'pending';
    }
  };

  /* Paiement : « En cours de traitement » s'affiche d'abord, puis la confirmation ou le message d'attente */
  const startPayment = async (operator) => {
    if (phase === 'processing') return;
    setLastOperator(operator);
    setPhase('processing');
    clearTimeout(timerRef.current);
    const runId = ++runRef.current;
    let outcome;
    if (operator === 'Carte Bancaire') {
      await waitMs(PROCESSING_DELAY_MS);
      outcome = simulatePaymentOutcome('');
    } else {
      outcome = await runCampayPayment(runId);
    }
    if (runId !== runRef.current) return;
    if (outcome === 'success') {
      try {
        const list = JSON.parse(localStorage.getItem(PAYMENT_EVENTS_KEY) || '[]');
        list.push({
          id: inv.id,
          buyerName: buyerName || 'Client Anonyme',
          buyerPhone: buyerPhone || '+237 6XX XX XX XX',
          operator
        });
        localStorage.setItem(PAYMENT_EVENTS_KEY, JSON.stringify(list));
        const paid = readPaidInvoices();
        if (!paid.includes(inv.id)) {
          paid.push(inv.id);
          localStorage.setItem(PAID_INVOICES_KEY, JSON.stringify(paid));
        }
      } catch (e) {}
      goToHowItWorks('paid');
    } else {
      setPhase('pending');
    }
  };

  const handlePay = (operator) => startPayment(operator);

  if (!inv) {
    return (
      <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center p-6 text-center">
        <img src={paySpitLogoImg} alt="PaySpit Logo" className="h-12 w-auto object-contain mb-4" />
        <h1 className="text-lg font-extrabold mb-1">Lien de facture invalide</h1>
        <p className="text-sm text-black">Ce lien de paiement est incomplet ou a été modifié. Demandez un nouveau lien au vendeur.</p>
      </div>
    );
  }

  const total = (inv.amount || 0) + (inv.deliveryFee || 0);
  const invoiceStillValid = !readPaidInvoices().includes(inv.id);

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="flex flex-col items-center text-center mb-3">
          <img src={paySpitLogoImg} alt="PaySpit Logo" className="h-12 w-auto object-contain" />
          <h1 className="text-lg font-extrabold mt-2">Demande de Paiement Sécurisé</h1>
          <p className="text-xs text-black mt-1">Vendeur : <span className="font-bold">{inv.seller}</span></p>
        </div>

        <div className="flex justify-center my-3">
          {inv.image ? (
            <img src={inv.image} className="w-32 h-32 rounded-full object-cover border-4 border-gray-100" />
          ) : (
            <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center text-4xl">📦</div>
          )}
        </div>

        <h2 className="text-center font-bold text-base">{inv.productName}</h2>
        <div className="text-center text-sm text-black space-y-0.5 mt-1">
          <p>Catégorie : {inv.category}</p>
          <p className="flex items-center justify-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Frais de livraison : {inv.deliveryFee > 0 ? `${fmt(inv.deliveryFee)} XAF` : 'Gratuit'}</p>
          <p className="flex items-center justify-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Délai de livraison : {inv.escrowDays} Jours</p>
          <p>Livreur : {inv.livreur ? inv.livreur.split(' —')[0] : 'Remise en main propre'}</p>
        </div>

        <div className="bg-gray-100 rounded-xl p-3 text-center my-4">
          <p className="text-xs text-black">Montant à payer :</p>
          <p className="text-2xl font-extrabold text-[#a520c7]">{fmt(total)} XAF</p>
          <p className="text-[10px] text-black mt-0.5">*Frais de service Payspit de 2% inclus.</p>
        </div>

        <div className="space-y-2 mb-3">
          <input type="text" placeholder="Votre nom" value={buyerName} onChange={e => setBuyerName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ps-purple" />
          <input type="tel" placeholder="Votre numéro Mobile Money" value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ps-purple" />
        </div>

        <div className="space-y-2">
          <button onClick={() => handlePay('Orange Money')} className="w-full border-2 border-orange-400 text-orange-600 font-bold py-2.5 rounded-full flex items-center justify-center gap-2 hover:bg-orange-50">
            <img src={OPERATOR_LOGOS.orange} className="w-6 h-6 rounded-full object-cover" /> Payer avec Orange Money
          </button>
          <button onClick={() => handlePay('MTN MoMo')} className="w-full border-2 border-yellow-400 text-yellow-700 font-bold py-2.5 rounded-full flex items-center justify-center gap-2 hover:bg-yellow-50">
            <img src={OPERATOR_LOGOS.mtn} className="w-6 h-6 rounded-full object-cover" /> Payer avec MTN MoMo
          </button>
          <button onClick={() => handlePay('Carte Bancaire')} className="w-full border-2 border-gray-400 text-black font-bold py-2.5 rounded-full flex items-center justify-center gap-2 hover:bg-gray-50">
            💳 Payer avec Carte Bancaire (Visa/Mastercard)
          </button>
          <button onClick={() => setPhase('refused')} className="w-full border border-gray-300 text-black font-semibold py-2.5 rounded-full hover:bg-gray-50 text-sm">
            Refuser le paiement
          </button>
        </div>

        <div className="flex items-start gap-2 bg-purple-50 rounded-xl p-3 mt-4 text-[11px] text-black">
          <Lock className="w-4 h-4 text-ps-purple shrink-0 mt-0.5" />
          <p>Votre paiement est protégé par le service d'escrow Payspit. Les fonds ne seront libérés au vendeur qu'après confirmation de votre livraison. Vous disposez de {inv.escrowDays} jours pour confirmer ou signaler un litige.</p>
        </div>
      </div>

      {/* ============ PAIEMENT EN COURS DE TRAITEMENT ============ */}
      {phase === 'processing' && (
        <div className="fixed inset-0 z-50 bg-white/95 flex items-center justify-center p-4" role="status" aria-live="polite">
          <div className="max-w-sm w-full text-center">
            <div className="w-14 h-14 mx-auto rounded-full border-4 border-purple-100 border-t-[#a520c7] animate-spin"></div>
            <p className="text-xl font-extrabold mt-5">En cours de traitement</p>
            <p className="text-xs text-black leading-relaxed mt-2">Nous confirmons votre paiement auprès de l'opérateur. Merci de ne pas fermer cette page et de ne pas payer une seconde fois.</p>
          </div>
        </div>
      )}

      {/* ============ PAIEMENT REFUSÉ PAR L'ACHETEUR ============ */}
      {phase === 'refused' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white text-black rounded-2xl max-w-sm w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setPhase('form')} aria-label="Fermer" className="absolute top-3 right-3 text-black hover:text-black">
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mb-3">
              <X className="w-6 h-6 text-rose-600" />
            </div>
            <h2 className="text-lg font-extrabold leading-snug pr-6">Vous avez choisi de ne pas poursuivre le paiement.</h2>
            <p className="text-sm text-black leading-relaxed mt-3">
              Aucun montant n'a été débité. La commande n'est pas confirmée : le vendeur ne lancera pas la livraison tant que la facture n'est pas payée, et aucun fonds n'est placé en séquestre.
            </p>
            {invoiceStillValid ? (
              <p className="text-sm text-black leading-relaxed mt-2">
                Cette facture reste valide : vous pouvez y revenir à tout moment pour payer en toute sécurité.
              </p>
            ) : (
              <p className="text-sm text-black leading-relaxed mt-2">
                Cette facture n'est plus valide. Demandez un nouveau lien au vendeur si vous souhaitez acheter ce produit.
              </p>
            )}
            {invoiceStillValid && (
              <button onClick={() => setPhase('form')} className="w-full bg-[#a520c7] hover:opacity-90 text-white font-bold py-2.5 rounded-xl text-sm mt-5">
                Retour à la facture
              </button>
            )}
            <a href="#/comment-fonctionne-payspit" className="block text-center text-xs font-bold text-[#a520c7] hover:underline mt-4">
              Comment fonctionne PaySpit ?
            </a>
          </div>
        </div>
      )}

      {/* ============ PAIEMENT NON CONFIRMÉ / EN ATTENTE ============ */}
      {phase === 'pending' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white text-black rounded-2xl max-w-sm w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setPhase('form')} aria-label="Fermer" className="absolute top-3 right-3 text-black hover:text-black">
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-3">
              <Hourglass className="w-6 h-6 text-amber-600" />
            </div>
            <h2 className="text-lg font-extrabold leading-snug pr-6">Nous n'avons pas encore pu confirmer votre paiement.</h2>
            <p className="text-sm text-black leading-relaxed mt-3">
              Votre paiement est peut-être encore en cours de traitement par l'opérateur. Vous pouvez vérifier son statut ou réessayer.
            </p>
            <button onClick={() => startPayment(lastOperator)} className="w-full bg-[#a520c7] hover:opacity-90 text-white font-bold py-2.5 rounded-xl text-sm mt-5">
              Vérifier le statut / Réessayer
            </button>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3 mt-4">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Pour éviter de payer deux fois : ne lancez pas un nouveau paiement tant que le statut n'est pas confirmé. Si vous avez déjà reçu un SMS de débit de votre opérateur, cliquez sur « Vérifier le statut » au lieu de payer à nouveau.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= PAGE « COMMENT FONCTIONNE PAYSPIT » ================= */
function HowItWorksPage({ status }) {
  const steps = [
    { icon: Send, title: "Le vendeur crée une facture sécurisée", text: "Il renseigne le produit, le montant, les frais de livraison et le délai, puis partage le lien de paiement à l'acheteur." },
    { icon: Smartphone, title: "L'acheteur paie en toute confiance", text: "Le paiement s'effectue depuis la page du lien, par Orange Money, MTN MoMo ou carte bancaire." },
    { icon: Lock, title: "Les fonds sont bloqués en séquestre", text: "Le vendeur ne reçoit pas encore l'argent. L'acheteur reçoit un code OTP unique et un QR-Code de livraison." },
    { icon: Truck, title: "Livraison et vérification", text: "L'acheteur vérifie le produit. Il ne communique le code OTP ou le QR-Code au livreur ou au vendeur que si le produit est conforme." },
    { icon: KeyRound, title: "Déblocage des fonds", text: "Dès que le code est validé, les fonds sont transférés au vendeur. Une commission de 2% est prélevée uniquement en cas de livraison réussie." },
    { icon: AlertTriangle, title: "Litige ou remboursement", text: "En cas de problème, un litige gèle les fonds et PaySpit tranche sous 48 heures. Sans action avant la fin du délai, l'acheteur est automatiquement remboursé." },
  ];
  return (
    <div className="min-h-screen bg-white text-black">
      <div className="max-w-md mx-auto lg:max-w-2xl px-4 py-6">
        <div className="flex flex-col items-center text-center mb-5">
          <img src={paySpitLogoImg} alt="PaySpit Logo" className="h-12 w-auto object-contain" />
          <h1 className="text-xl font-extrabold mt-3">Comment Fonctionne PaySpit</h1>
          <p className="text-sm text-black mt-1">PaySpit sécurise les paiements entre acheteurs et vendeurs grâce au séquestre.</p>
        </div>

        {status === 'paid' && (
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 text-xs text-black">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p><span className="font-bold">Paiement effectué.</span> Vos fonds sont désormais sécurisés en séquestre jusqu'à la confirmation de la livraison.</p>
          </div>
        )}
        {status === 'refused' && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4 text-xs text-black">
            <X className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <p><span className="font-bold">Paiement refusé.</span> Aucun montant n'a été débité.</p>
          </div>
        )}

        <div className="space-y-3">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="bg-white border border-black rounded-2xl p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-ps-purple" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm">{i + 1}. {s.title}</p>
                  <p className="text-xs text-black leading-relaxed mt-0.5">{s.text}</p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-[10px] text-black mt-6">PaySpit · CEMAC Escrow</p>
      </div>
    </div>
  );
}

/* ================= App (espace vendeur / acheteur) ================= */
function SellerApp() {
  const [screen, setScreen] = useState('dashboard'); // dashboard | create | created | buyerLocked | stats | livreurs | historique
  const [menuOpen, setMenuOpen] = useState(false);

  /* --- Espace Acheteur (Fonds Bloqués) --- */
  const [openOtpId, setOpenOtpId] = useState(null);
  const [otpViewMode, setOtpViewMode] = useState('code'); // code | qr
  const handleUnlockBuyerFund = (item) => {
    setOtpViewMode('code');
    setOpenOtpId(id => id === item.id ? null : item.id);
  };
  const copyOtp = async (code) => {
    try { await navigator.clipboard.writeText(code); } catch (e) {}
  };

  const [shop] = useState({ name: 'Alpha Boutique', phone: '+237 677 88 99 00', verified: true });
  const [available, setAvailable] = useState(266990);
  const invoiceLink = (tx) => buildInvoiceLink(tx, shop.name);

  const seedTx = () => {
    const now = Date.now();
    return [
      {
        id: 'ps-772104', productName: 'Montre Homme Quartz Cuir', productImage: productImg('watch'),
        amount: 67000, deliveryFee: 0, category: 'Accessoires de Modes', escrowDays: 3,
        livreur: null, status: STATUS.ESCROW_LOCKED,
        buyerName: 'Monthé Marie', buyerPhone: '+237 655 11 22 33', paymentOperator: 'Orange Money',
        otpCode: '7722', createdAt: now - 2 * 86400000, deadlineTime: now + 1 * 86400000,
        slug: 'montrehommecuir_3d'
      },
      {
        id: 'ps-849201', productName: 'iPhone 14 Pro Max à Brancher', productImage: productImg('phone'),
        amount: 37000, deliveryFee: 0, category: 'Smartphones', escrowDays: 3,
        livreur: LIVREURS[1], status: STATUS.ESCROW_LOCKED,
        buyerName: 'Blanche Jose', buyerPhone: '+237 699 44 55 66', paymentOperator: 'MTN MoMo',
        otpCode: '3947', createdAt: now - 86400000, deadlineTime: now + 2 * 86400000,
        slug: 'iphone14promax_3d'
      },
      {
        id: 'ps-611830', productName: 'Basket Jordan Taille 42 (Neuve)', productImage: productImg('sneaker'),
        amount: 15000, deliveryFee: 0, category: 'Mode & Accessoires', escrowDays: 7,
        livreur: null, status: STATUS.COMPLETED,
        buyerName: 'Koffi Serge', buyerPhone: '+237 690 00 11 22', paymentOperator: 'Orange Money',
        otpCode: genOtp(), createdAt: now - 6 * 86400000, deadlineTime: now - 2 * 86400000,
        slug: 'bjordan42neuve_7d'
      }
    ];
  };

  const [transactions, setTransactions] = useState(seedTx());
  const transactionsRef = useRef(transactions);
  transactionsRef.current = transactions;
  const [showBalance, setShowBalance] = useState(true);

  const blocked = useMemo(() => transactions
    .filter(t => t.status === STATUS.ESCROW_LOCKED)
    .reduce((sum, t) => sum + t.amount + t.deliveryFee, 0), [transactions]);

  const activeEscrow = transactions.filter(t => t.status === STATUS.ESCROW_LOCKED);
  const pendingPayment = transactions.filter(t => t.status === STATUS.CREATED);
  const history = transactions.filter(t => t.status === STATUS.COMPLETED || t.status === STATUS.DISPUTED);

  /* --- Fonds bloqués de l'acheteur : issus des mêmes transactions que le tableau de bord du vendeur --- */
  const buyerLockedFunds = useMemo(() => transactions
    .filter(t => t.status === STATUS.ESCROW_LOCKED)
    .map(t => ({
      id: t.id,
      txId: t.id,
      sellerName: shop.name,
      productName: t.productName,
      purchasedAt: new Date(t.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      amount: t.amount + t.deliveryFee,
      livreur: t.livreur,
      otpCode: t.otpCode,
      productImage: t.productImage
    })), [transactions, shop]);
  const buyerLockedTotal = useMemo(() => buyerLockedFunds.reduce((s, f) => s + f.amount, 0), [buyerLockedFunds]);

  /* --- Formulaire de création --- */
  const emptyForm = { productName: '', amount: '', deliveryFee: '0', category: CATEGORIES[0], escrowDays: '2', livreurId: 'none', photos: [], presetImage: null };
  const [form, setForm] = useState(emptyForm);
  const fileInputRef = useRef(null);
  const [newLink, setNewLink] = useState(null);

  const resetCreateForm = () => setForm(emptyForm);

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setForm(f => ({ ...f, photos: [...f.photos, { id: Math.random().toString(36).slice(2), url: ev.target.result }] }));
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };
  const removePhoto = (id) => setForm(f => ({ ...f, photos: f.photos.filter(p => p.id !== id) }));

  const handleApplyPreset = (p) => {
    setForm(f => ({ ...f, productName: p.name, amount: p.price.toString(), deliveryFee: p.fee.toString(), category: p.category, escrowDays: p.days.toString(), presetImage: p.image ? productImg(p.image) : null }));
  };

  const handleCreateInvoice = (e) => {
    e.preventDefault();
    if (!form.productName || !form.amount) return;
    const livreur = LIVREURS.find(l => l.id === form.livreurId);
    const tx = {
      id: genId(),
      productName: form.productName,
      productImage: form.photos[0]?.url || form.presetImage || null,
      amount: parseFloat(form.amount) || 0,
      deliveryFee: parseFloat(form.deliveryFee) || 0,
      category: form.category,
      escrowDays: parseInt(form.escrowDays),
      livreur: livreur && livreur.id !== 'none' ? livreur : null,
      status: STATUS.CREATED,
      buyerName: '', buyerPhone: '', paymentOperator: '',
      otpCode: genOtp(),
      createdAt: Date.now(),
      deadlineTime: Date.now() + parseInt(form.escrowDays) * 86400000,
      slug: slugify(form.productName) + '_' + form.escrowDays + 'd'
    };
    setTransactions(t => [tx, ...t]);
    setNewLink(tx);
    setScreen('created');
    if (tx.productImage && tx.productImage.startsWith('data:image/') && !tx.productImage.startsWith('data:image/svg')) {
      makeThumb(tx.productImage).then(thumb => {
        if (!thumb) return;
        setTransactions(list => list.map(t => t.id === tx.id ? { ...t, shareImage: thumb } : t));
        setNewLink(l => (l && l.id === tx.id ? { ...l, shareImage: thumb } : l));
      });
    }
  };

  /* --- Simulation acheteur --- */
  const [buyerModalTx, setBuyerModalTx] = useState(null);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [smsModalTx, setSmsModalTx] = useState(null);
  const [pendingSellerNotice, setPendingSellerNotice] = useState(null);
  const [sellerPaymentNotice, setSellerPaymentNotice] = useState(null);
  const [disputeTx, setDisputeTx] = useState(null);
  const [disputeSubject, setDisputeSubject] = useState('');
  const [disputeMessage, setDisputeMessage] = useState('');
  const [disputeProofs, setDisputeProofs] = useState([]);
  const [termsOpen, setTermsOpen] = useState(false);

  const openBuyerPage = (tx) => { setBuyerName(''); setBuyerPhone(''); setBuyerModalTx(tx); };
  const handleSimulateAchats = () => {
    if (pendingPayment.length > 0) { openBuyerPage(pendingPayment[0]); }
    else { alert("Aucune facture en attente de paiement pour le moment."); }
  };

  const handleBuyerPay = (operator) => {
    if (!buyerModalTx) return;
    const tx = buyerModalTx;
    setTransactions(list => list.map(t => t.id === tx.id ? {
      ...t, status: STATUS.ESCROW_LOCKED,
      buyerName: buyerName || 'Client Anonyme',
      buyerPhone: buyerPhone || '+237 6XX XX XX XX',
      paymentOperator: operator
    } : t));
    setBuyerModalTx(null);
    const paidTx = { ...tx, buyerName: buyerName || 'Client Anonyme', buyerPhone: buyerPhone || '+237 6XX XX XX XX', paymentOperator: operator };
    setSmsModalTx(paidTx);
    setPendingSellerNotice(paidTx);
  };

  /* --- Paiements effectués depuis la page externe (lien de la facture) --- */
  useEffect(() => {
    const processPayments = () => {
      let events = [];
      try { events = JSON.parse(localStorage.getItem(PAYMENT_EVENTS_KEY) || '[]'); } catch (e) { return; }
      const remaining = [];
      events.forEach(ev => {
        const tx = transactionsRef.current.find(t => t.id === ev.id);
        if (!tx) { remaining.push(ev); return; }
        if (tx.status !== STATUS.CREATED) return;
        setTransactions(list => list.map(t => t.id === tx.id ? {
          ...t, status: STATUS.ESCROW_LOCKED,
          buyerName: ev.buyerName,
          buyerPhone: ev.buyerPhone,
          paymentOperator: ev.operator
        } : t));
        setSellerPaymentNotice({ ...tx, buyerName: ev.buyerName, buyerPhone: ev.buyerPhone, paymentOperator: ev.operator });
      });
      try { localStorage.setItem(PAYMENT_EVENTS_KEY, JSON.stringify(remaining)); } catch (e) {}
    };
    window.addEventListener('storage', processPayments);
    return () => window.removeEventListener('storage', processPayments);
  }, []);

  /* --- Déblocage OTP --- */
  const [otpInputs, setOtpInputs] = useState({});
  const [unlockedTx, setUnlockedTx] = useState(null);

  const handleValidateOtp = (tx) => {
    const code = (otpInputs[tx.id] || '').trim();
    if (!code) return;
    if (code !== tx.otpCode) {
      alert("Code OTP invalide ! Les fonds restent protégés.");
      return;
    }
    const credited = tx.amount - commission(tx.amount) + tx.deliveryFee;
    setTransactions(list => list.map(t => t.id === tx.id ? { ...t, status: STATUS.COMPLETED } : t));
    setAvailable(a => a + credited);
    setUnlockedTx({ ...tx, credited });
    setOtpInputs(o => ({ ...o, [tx.id]: '' }));
  };

  /* --- Déblocage par scan du QR code de l'acheteur --- */
  const handleQrUnlock = (data) => {
    const raw = (data || '').trim();
    if (!raw) return false;
    const tx = transactionsRef.current.find(t =>
      t.status === STATUS.ESCROW_LOCKED &&
      ((raw.includes(t.id) && raw.includes(t.otpCode)) || raw === t.otpCode)
    );
    if (!tx) return false;
    const credited = tx.amount - commission(tx.amount) + tx.deliveryFee;
    setTransactions(list => list.map(t => t.id === tx.id ? { ...t, status: STATUS.COMPLETED } : t));
    setAvailable(a => a + credited);
    setUnlockedTx({ ...tx, credited });
    return true;
  };

  const handleExtension = (id) => {
    setTransactions(list => list.map(t => t.id === id ? { ...t, deadlineTime: t.deadlineTime + 86400000 } : t));
  };

  const handleDeleteInvoice = (id) => {
    if (!window.confirm("Supprimer cette facture en attente de paiement ?")) return;
    setTransactions(list => list.filter(t => !(t.id === id && t.status === STATUS.CREATED)));
  };

  const openDispute = (tx) => {
    setDisputeSubject('');
    setDisputeMessage('');
    setDisputeProofs([]);
    setDisputeTx(tx);
  };

  const handleDisputeProofs = (e) => {
    setDisputeProofs(Array.from(e.target.files || []));
  };

  const handleDispute = (e) => {
    e.preventDefault();
    if (!disputeTx || !disputeSubject) return;
    setTransactions(list => list.map(t => t.id === disputeTx.id ? {
      ...t,
      status: STATUS.DISPUTED,
      dispute: { subject: disputeSubject, message: disputeMessage, proofCount: disputeProofs.length }
    } : t));
    setDisputeTx(null);
  };

  const closeBuyerPaymentMessage = () => {
    setSmsModalTx(null);
    if (pendingSellerNotice) {
      setSellerPaymentNotice(pendingSellerNotice);
      setPendingSellerNotice(null);
    }
  };

  /* --- Portefeuille --- */
  const [walletModal, setWalletModal] = useState(null); // { type: 'recharge' | 'retrait' }
  const [walletOperator, setWalletOperator] = useState('');
  const [walletAmount, setWalletAmount] = useState('');
  const handleWalletAction = (type) => {
    setWalletOperator('');
    setWalletAmount('');
    setWalletModal({ type });
  };
  const handleConfirmWalletAction = () => {
    const val = parseFloat(walletAmount);
    if (!walletOperator || isNaN(val) || val <= 0) return;
    if (walletModal.type === 'retrait' && val > available) { alert("Solde disponible insuffisant."); return; }
    setAvailable(a => walletModal.type === 'recharge' ? a + val : a - val);
    alert(walletModal.type === 'recharge' ? `Recharge de ${fmt(val)} XAF via ${walletOperator} effectuée.` : `Retrait de ${fmt(val)} XAF vers ${walletOperator} initié.`);
    setWalletModal(null);
  };

  /* --- Course / suivi livreur --- */
  const [courseTx, setCourseTx] = useState(null);

  /* --- QR (scan caméra réel) --- */
  const [qrOpen, setQrOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState('idle'); // idle | requesting | scanning | success | error
  const [scanMessage, setScanMessage] = useState('');
  const [scanResult, setScanResult] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const scanTimeoutRef = useRef(null);

  const stopScan = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    rafRef.current = null;
    scanTimeoutRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code && code.data) {
      stopScan();
      if (handleQrUnlock(code.data)) {
        setQrOpen(false);
        setScanStatus('idle');
        return;
      }
      setScanResult(code.data);
      setScanStatus('success');
    } else {
      rafRef.current = requestAnimationFrame(scanFrame);
    }
  };

  const startScan = async () => {
    stopScan();
    setScanStatus('requesting');
    setScanMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanStatus('scanning');
      rafRef.current = requestAnimationFrame(scanFrame);
      scanTimeoutRef.current = setTimeout(() => {
        stopScan();
        setScanMessage("Aucun code détecté. Réessayez en centrant le QR code dans le cadre.");
        setScanStatus('error');
      }, 20000);
    } catch (err) {
      setScanMessage("Accès à la caméra refusé ou indisponible. Autorisez l'accès à la caméra puis réessayez.");
      setScanStatus('error');
    }
  };

  const closeScan = () => {
    stopScan();
    setQrOpen(false);
    setScanStatus('idle');
  };

  useEffect(() => {
    if (qrOpen) startScan();
    return () => { stopScan(); };
  }, [qrOpen]);

  /* --- Copier lien --- */
  const [copiedId, setCopiedId] = useState(null);
  const copyLink = async (tx) => {
    const link = invoiceLink(tx);
    try { await navigator.clipboard.writeText(link); } catch (e) {}
    setCopiedId(tx.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const shareText = (tx) => encodeURIComponent(`Facture PaySpit sécurisée pour "${tx.productName}" — ${fmt(tx.amount + tx.deliveryFee)} XAF. Payez en toute confiance : ${invoiceLink(tx)}`);

  /* --- Copilot IA (bouton flottant + chat) --- */
  const [copilotEnabled, setCopilotEnabled] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [fabPos, setFabPos] = useState({ x: 310, y: 680 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, fabX: 0, fabY: 0 });
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef(fabPos);
  const [chatMessages, setChatMessages] = useState([
    { from: 'ai', text: "Bonjour ! Je suis votre copilote PaySpit. Comment puis-je sécuriser vos transactions aujourd'hui ?" }
  ]);
  const [userMsg, setUserMsg] = useState('');

  useEffect(() => {
    setFabPos({ x: Math.max(10, window.innerWidth - 90), y: Math.max(10, window.innerHeight - 120) });
  }, []);

  const handlePointerDown = (e) => {
    setIsDragging(false);
    isDraggingRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY, fabX: fabPos.x, fabY: fabPos.y };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };
  const handlePointerMove = (e) => {
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.hypot(dx, dy) > 5) {
      setIsDragging(true);
      isDraggingRef.current = true;
      const newPos = {
        x: Math.min(Math.max(10, dragStartRef.current.fabX + dx), window.innerWidth - 85),
        y: Math.min(Math.max(10, dragStartRef.current.fabY + dy), window.innerHeight - 95)
      };
      lastPosRef.current = newPos;
      setFabPos(newPos);
    }
  };
  const handlePointerUp = () => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    if (isDraggingRef.current && lastPosRef.current.x <= 15) {
      setCopilotEnabled(false);
      setIsChatOpen(false);
    }
  };
  const handleSendChat = (e) => {
    e.preventDefault();
    if (!userMsg.trim()) return;
    const newMsgs = [...chatMessages, { from: 'user', text: userMsg }];
    setChatMessages(newMsgs);
    const q = userMsg.toLowerCase();
    setUserMsg('');
    setTimeout(() => {
      let reply = "Je suis là pour vous assister. Créez une facture, débloquez des fonds ou gérez un litige depuis le tableau de bord.";
      if (q.includes('bonjour') || q.includes('salut')) reply = "Bonjour ! Besoin d'aide pour sécuriser une vente ou vérifier un paiement Mobile Money ?";
      else if (q.includes('otp') || q.includes('code')) reply = "Le code OTP est envoyé à l'acheteur après son paiement. Il ne le communique qu'après avoir reçu et validé le produit.";
      else if (q.includes('commission') || q.includes('frais')) reply = "La commission PaySpit est de 2% du montant produit, prélevée uniquement au déblocage des fonds vers le vendeur.";
      else if (q.includes('litige')) reply = "Le bouton 'Litige' gèle immédiatement les fonds. Un conseiller PaySpit arbitre ensuite avec les preuves fournies.";
      else if (q.includes('livreur') || q.includes('livraison')) reply = "Vous pouvez désigner un livreur PaySpit dès la création de la facture, ou laisser 'remise en main propre'.";
      setChatMessages(m => [...m, { from: 'ai', text: reply }]);
    }, 450);
  };

  /* ================= RENDU ================= */
  return (
    <div className="min-h-screen bg-white text-black pb-24 selection:bg-ps-cyan selection:text-black">
      {/* HEADER */}
      <header className={`sticky top-0 z-40 backdrop-blur-md border-b px-4 sm:px-6 py-3 ${screen === 'buyerLocked' ? 'bg-white border-gray-200' : 'bg-white/95 border-gray-200'}`} style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
        <div className="max-w-md mx-auto lg:max-w-2xl flex items-center justify-between gap-2">
          {screen === 'dashboard' ? (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => setMenuOpen(true)} className="text-black hover:text-black p-1 -ml-1">
                  <Menu className="w-6 h-6" />
                </button>
                <img src={paySpitLogoImg} alt="PaySpit Logo" className="h-8 w-auto object-contain" />
                <span className="font-extrabold text-lg tracking-tight">PaySpit</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => { resetCreateForm(); setScreen('create'); }} className="bg-[#a520c7] hover:opacity-90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 shadow-md shadow-[#a520c7]/30">
                  <span className="text-sm leading-none">+</span> Créer une facture
                </button>
                <button onClick={() => setQrOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1">
                  <QrCode className="w-3.5 h-3.5" /> Scanner
                </button>
              </div>
            </>
          ) : screen === 'buyerLocked' ? (
            <>
              <div className="flex items-center gap-3">
                <button onClick={() => setMenuOpen(true)} className="text-black hover:text-black p-1 -ml-1">
                  <Menu className="w-6 h-6" />
                </button>
                <div>
                  <h1 className="font-extrabold text-base text-black leading-tight">Acheteur - Fonds Bloqués</h1>
                  <p className="text-[11px] text-black flex items-center gap-1">Mon Suivi Escrow PaySpit <Lock className="w-3 h-3" /></p>
                </div>
              </div>
              <span></span>
            </>
          ) : ['stats', 'livreurs', 'historique'].includes(screen) ? (
            <>
              <div className="flex items-center gap-3">
                <button onClick={() => setScreen('dashboard')} className="text-black hover:text-black p-1 -ml-1">
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                  <h1 className="font-extrabold text-base text-black leading-tight">
                    {screen === 'stats' ? "Statistiques d'Activité" : screen === 'livreurs' ? 'Mes livreurs' : 'Historique'}
                  </h1>
                  <p className="text-[11px] text-black">
                    {screen === 'stats' ? 'Aperçu de mon activité PaySpit' : screen === 'livreurs' ? 'Mon équipe de livraison' : 'Mes transactions passées'}
                  </p>
                </div>
              </div>
              <span></span>
            </>
          ) : (
            <>
              <button onClick={() => setScreen('dashboard')} className="flex items-center gap-2 text-black hover:text-black">
                <ArrowLeft className="w-5 h-5" />
                <img 
                  src={paySpitLogoImg} 
                  alt="PaySpit Logo" 
                className="h-8 w-auto object-contain"
                />
                <span className="font-extrabold text-lg tracking-tight">PaySpit</span>
              </button>
              <span></span>
            </>
          )}
        </div>
      </header>

      <div className="max-w-md mx-auto lg:max-w-2xl px-4">
        {/* ============ ÉCRAN DASHBOARD ============ */}
        {screen === 'dashboard' && (
          <div className="screen-anim space-y-4 pt-4">
            <div className="flex items-center justify-between text-xs text-black px-1">
              <span className="font-bold">Tableau de Bord</span>
              {shop.verified && (
                <span className="flex items-center gap-1 text-cyan-700 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-full font-semibold">
                  <ShieldCheck className="w-3 h-3" /> Vérifié
                </span>
              )}
            </div>

            <div className="bg-white border border-black rounded-2xl p-4">
              <h2 className="font-bold text-base">{shop.name}</h2>
              <p className="text-[11px] text-black font-semibold uppercase tracking-wide mt-0.5">Vendeur Vérifié · {shop.phone}</p>
            </div>

            <div className="bg-white border border-black rounded-2xl p-4 relative overflow-hidden">
              <div className="absolute -top-8 -right-8 w-32 h-32 bg-ps-purple/20 rounded-full blur-3xl pointer-events-none"></div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-black flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" /> Solde disponible
                  <button onClick={() => setShowBalance(s => !s)} className="text-black hover:text-black">
                    {showBalance ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </span>
              </div>
              <p className="text-3xl font-extrabold text-[#a520c7] mt-1">{showBalance ? `${fmt(available)} XAF` : '•••••• XAF'}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => handleWalletAction('recharge')} className="flex-1 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-black text-xs font-bold py-2 rounded-xl">Recharge</button>
                <button onClick={() => handleWalletAction('retrait')} className="flex-1 bg-[#a520c7] hover:opacity-90 text-white text-xs font-bold py-2 rounded-xl">Retrait</button>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-black mt-3 pt-3 border-t border-gray-100">
                <Lock className="w-3.5 h-3.5" /> Bloqué (Séquestre) : <span className="font-bold text-[#a520c7]">{fmt(blocked)} XAF</span>
              </div>
            </div>

            {/* FONDS BLOQUÉS */}
            <div>
              <h3 className="text-sm font-bold flex items-center gap-1.5 mb-2 px-1">
                <KeyRound className="w-4 h-4 text-cyan-600" /> Fonds bloqués <span className="text-black font-normal">(entrer le code pour débloquer)</span>
              </h3>
              <div className="space-y-3">
                {activeEscrow.length === 0 && <p className="text-xs text-black px-1">Aucun fonds en séquestre pour le moment.</p>}
                {activeEscrow.map(tx => (
                  <div key={tx.id} className="bg-white border border-black rounded-xl p-3.5 shadow-lg shadow-yellow-500/5">
                    <div className="flex items-start gap-2.5 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{tx.productName}</p>
                        <p className="text-[11px] text-black">Acheteur : {tx.buyerName} ({tx.buyerPhone})</p>
                        <p className="text-xs font-semibold text-[#a520c7]">Montant : {fmt(tx.amount)} XAF {tx.deliveryFee > 0 && <span className="text-black font-normal">(+ {fmt(tx.deliveryFee)} XAF livraison)</span>}</p>
                      </div>
                      {tx.productImage ? (
                        <img src={tx.productImage} className="w-11 h-11 rounded-lg object-cover border border-gray-200 shrink-0" />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-lg shrink-0">📦</div>
                      )}
                    </div>

                    {tx.livreur ? (
                      <div className="flex items-center justify-between bg-gray-100/70 rounded-lg px-2.5 py-1.5 mb-2 text-xs">
                        <span className="flex items-center gap-1.5 text-black"><Truck className="w-3.5 h-3.5 text-[#a520c7]" /> Livreur assigné : <span className="font-semibold text-black">{tx.livreur.name.split(' —')[0]}</span></span>
                        <button onClick={() => setCourseTx(tx)} className="text-[#a520c7] font-bold hover:underline">Ouvrir course</button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-black mb-2 flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Aucun livreur assigné (remise en main propre)</p>
                    )}

                    <div className="flex items-center gap-1.5 text-[11px] text-black font-bold mb-2">
                      <Hourglass className="w-3.5 h-3.5" /> En attente du code ({daysLeft(tx.deadlineTime)} jour{daysLeft(tx.deadlineTime) > 1 ? 's' : ''} restant{daysLeft(tx.deadlineTime) > 1 ? 's' : ''})
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text" maxLength={4} placeholder="Code OTP"
                        value={otpInputs[tx.id] || ''}
                        onChange={e => setOtpInputs(o => ({ ...o, [tx.id]: e.target.value }))}
                        className="w-24 bg-gray-100 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center tracking-widest font-mono font-bold text-black focus:outline-none focus:border-ps-purple"
                      />
                      {(otpInputs[tx.id] || '').length === 4 && (
                        <button onClick={() => handleValidateOtp(tx)} className="bg-[#a520c7] hover:opacity-90 text-white font-extrabold text-xs px-3 py-1.5 rounded-lg">Valider</button>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <button onClick={() => handleExtension(tx.id)} className="text-[11px] text-[#a520c7] hover:underline font-semibold">Demander 1 jour de rallonge (+1j)</button>
                      <button onClick={() => openDispute(tx)} className="text-[11px] text-red-600 hover:underline font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Litige</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* FACTURES EN ATTENTE DE PAIEMENT */}
            {pendingPayment.length > 0 && (
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 mb-2 px-1">
                  <Send className="w-4 h-4 text-cyan-600" /> Factures en attente de paiement
                </h3>
                <div className="space-y-2.5">
                  {pendingPayment.map(tx => (
                    <div key={tx.id} className="bg-white border border-black rounded-xl p-3.5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-bold text-sm">{tx.productName}</p>
                          <p className="text-[11px] text-black font-mono truncate">{invoiceLink(tx)}</p>
                        </div>
                        <StatusBadge status={tx.status} />
                      </div>
                      <p className="text-xs text-black mb-2">Montant total : <span className="font-bold text-black">{fmt(tx.amount + tx.deliveryFee)} XAF</span></p>
                      <div className="flex gap-2">
                        <button onClick={() => copyLink(tx)} className="flex-1 bg-gray-100 border border-gray-200 hover:border-cyan-400 text-xs font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-black">
                          <Copy className="w-3.5 h-3.5" /> {copiedId === tx.id ? 'Copié !' : 'Copier le lien'}
                        </button>
                        <a href={invoiceLink(tx)} target="_blank" rel="noopener noreferrer" className="flex-1 bg-[#a520c7] hover:opacity-90 text-white text-xs font-bold py-1.5 rounded-lg flex items-center justify-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5" /> Voir page acheteur
                        </a>
                        <button onClick={() => handleDeleteInvoice(tx.id)} aria-label="Supprimer la facture" className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center justify-center">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* HISTORIQUE */}
            {history.length > 0 && (
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 mb-2 px-1">
                  <Package className="w-4 h-4 text-black" /> Historique
                </h3>
                <div className="space-y-2">
                  {history.map(tx => (
                    <div key={tx.id} className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold">{tx.productName}</p>
                        <p className="text-[11px] text-black">{fmt(tx.amount)} XAF · {tx.buyerName}</p>
                      </div>
                      <StatusBadge status={tx.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ ÉCRAN CRÉATION DE FACTURE ============ */}
        {screen === 'create' && (
          <div className="screen-anim pt-4 pb-8 space-y-5">
            <h1 className="text-xl font-extrabold text-ps-purple">Créer une facture de paiement</h1>

            <div>
              <label className="text-xs font-semibold text-black uppercase tracking-wider block mb-2">Suggestions rapides :</label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p, i) => (
                  <button key={i} type="button" onClick={() => handleApplyPreset(p)} className="text-[11px] bg-gray-100 hover:bg-ps-purple/10 border border-gray-200 hover:border-ps-purple/40 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-black">
                    <span>{p.emoji}</span><span className="font-bold">{p.name}</span><span className="text-cyan-700 font-bold">({fmt(p.price)} F)</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-black block mb-1.5 font-semibold">Photos du produit (charger une ou plusieurs) :</label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} className="w-20 h-20 rounded-xl border-2 border-dashed border-ps-purple/50 hover:border-ps-cyan/60 flex flex-col items-center justify-center gap-1 text-ps-purple hover:text-cyan-600 transition-colors">
                  <Camera className="w-5 h-5" />
                  <span className="text-[10px] font-bold">Charger</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                {form.photos.map(p => (
                  <div key={p.id} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
                    <img src={p.url} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => removePhoto(p.id)} className="absolute top-1 right-1 bg-rose-500 hover:bg-rose-400 text-white rounded-full w-5 h-5 flex items-center justify-center">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              {form.photos.length > 0 && (
                <p className="text-[11px] text-emerald-400 font-semibold mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Safe-Uploader actif • {form.photos.length} photo{form.photos.length > 1 ? 's' : ''} chiffrée{form.photos.length > 1 ? 's' : ''}/intégrée{form.photos.length > 1 ? 's' : ''} avec succès.
                </p>
              )}
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-4">
              <div>
                <label className="text-xs text-black block mb-1">Dénomination du produit</label>
                <input type="text" required value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))}
                  placeholder="Ex : Jordan high-top baskets"
                  className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black focus:outline-none focus:border-ps-purple" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-black block mb-1">Montant (XAF)</label>
                  <input type="number" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="50000"
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black focus:outline-none focus:border-ps-purple" />
                </div>
                <div>
                  <label className="text-xs text-black block mb-1">Frais de livraison (XAF)</label>
                  <input type="number" value={form.deliveryFee} onChange={e => setForm(f => ({ ...f, deliveryFee: e.target.value }))} placeholder="1000"
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black focus:outline-none focus:border-ps-purple" />
                </div>
              </div>

              <div>
                <label className="text-xs text-black block mb-1">Catégorie</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black focus:outline-none focus:border-ps-purple">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-black block mb-1">Délai de livraison (jours d'escrow)</label>
                  <select value={form.escrowDays} onChange={e => setForm(f => ({ ...f, escrowDays: e.target.value }))}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black focus:outline-none focus:border-ps-purple">
                    <option value="1">1 jour (Express)</option>
                    <option value="2">2 jours standard</option>
                    <option value="3">3 jours</option>
                    <option value="5">5 jours</option>
                    <option value="7">7 jours</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-black block mb-1">Livreur désigné (Facultatif)</label>
                  <select value={form.livreurId} onChange={e => setForm(f => ({ ...f, livreurId: e.target.value }))}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black focus:outline-none focus:border-ps-purple">
                    {LIVREURS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-ps-purple/90 font-medium">* Une commission de 2% sera prélevée en cas de livraison réussie.</p>

              <button type="submit" className="w-full bg-[#a520c7] hover:opacity-90 text-white font-bold py-3 rounded-xl shadow-lg shadow-[#a520c7]/30 flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 text-ps-cyan" /> Générer la facture sécurisée
              </button>
            </form>
          </div>
        )}

        {/* ============ ÉCRAN FACTURE CRÉÉE ============ */}
        {screen === 'created' && newLink && (
          <div className="screen-anim pt-6 pb-10 space-y-5 text-center">
            <div className="flex justify-center"><PaySpitLogo size="lg" /></div>
            <h1 className="text-2xl font-extrabold text-ps-purple">Facture créée et prête !</h1>

            <div className="bg-white border border-black rounded-2xl p-5 text-left space-y-2">
              <p className="text-sm"><span className="text-black">Produit : </span><span className="font-bold">{newLink.productName}</span></p>
              <p className="text-sm"><span className="text-black">Montant : </span><span className="font-bold">{fmt(newLink.amount)} XAF</span></p>
              <p className="text-sm"><span className="text-black">Délai de livraison : </span><span className="font-bold">{newLink.escrowDays} jours</span></p>
              <p className="text-sm"><span className="text-black">Frais de livraison : </span><span className="font-bold">{fmt(newLink.deliveryFee)} XAF</span></p>

              <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 mt-3">
                <span className="flex-1 text-xs font-mono text-black truncate">{invoiceLink(newLink)}</span>
                <button onClick={() => copyLink(newLink)} className="bg-ps-purple hover:bg-ps-purple-dark text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0">
                  <Copy className="w-3.5 h-3.5" /> {copiedId === newLink.id ? 'Copié !' : 'Copier'}
                </button>
              </div>

              {newLink.productImage && (
                <div className="flex justify-center pt-2">
                  <img src={newLink.productImage} className="w-28 h-28 rounded-xl object-cover border border-gray-200" />
                </div>
              )}
            </div>

            <p className="text-[11px] text-black">* Commission de 2% ({fmt(commission(newLink.amount))} XAF) incluse dans le montant final.*</p>

            <button onClick={() => openBuyerPage(newLink)} className="w-full bg-gradient-to-r from-ps-purple to-ps-accent hover:opacity-95 text-white font-bold py-3 rounded-xl shadow-lg shadow-ps-purple/30">
              Partager la facture
            </button>

            <div className="flex justify-center gap-4 pt-1">
              <a href={`https://wa.me/?text=${shareText(newLink)}`} target="_blank" rel="noopener noreferrer" className="w-11 h-11 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center hover:border-emerald-400/50">
                <MessageCircle className="w-5 h-5 text-emerald-400" />
              </a>
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(invoiceLink(newLink))}`} target="_blank" rel="noopener noreferrer" className="w-11 h-11 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center hover:border-blue-400/50">
                <span className="font-black text-blue-400 text-lg">f</span>
              </a>
              <button onClick={() => copyLink(newLink)} className="w-11 h-11 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center hover:border-cyan-400">
                <Send className="w-5 h-5 text-cyan-600" />
              </button>
            </div>

            <button onClick={() => setScreen('dashboard')} className="text-xs text-black hover:text-black underline pt-2">Retour au tableau de bord</button>
          </div>
        )}
      </div>

      {/* ============ ÉCRAN ACHETEUR - FONDS BLOQUÉS ============ */}
      {screen === 'buyerLocked' && (
        <div className="screen-anim bg-white text-black min-h-[calc(100vh-64px)]">
          <div className="max-w-md mx-auto lg:max-w-2xl px-4 pt-4 pb-28 space-y-4">
            <div className="flex items-center justify-between bg-white border border-gray-200 rounded-full px-4 py-3 shadow-sm">
              <button onClick={() => setScreen('dashboard')} className="text-ps-purple">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-ps-purple font-bold text-sm">Espace Acheteur (2/2)</span>
              <ChevronDown className="w-4 h-4 text-ps-purple" />
            </div>

            <div>
              <h2 className="font-bold text-base flex items-center gap-2 text-black">
                <Lock className="w-4 h-4 text-amber-500" /> Comment marche le blocage ?
              </h2>
              <p className="text-xs text-black leading-relaxed mt-1.5">
                Vos fonds restent bloqués de manière 100% sécurisée sur PaySpit tant que vous n'avez pas validé la livraison. Une fois le colis vérifié, donnez le code OTP confidentiel ou présentez le QR-Code de livraison pour déclencher le paiement immédiat du vendeur.
              </p>
            </div>

            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-[#a520c7] font-bold text-sm">Total fonds bloqués</span>
                <span className="text-ps-purple text-xs font-semibold flex items-center gap-1">{buyerLockedFunds.length} Actifs <Lock className="w-3 h-3" /></span>
              </div>
              <p className="text-3xl font-extrabold text-[#a520c7] mt-1">{fmt(buyerLockedTotal)} XAF</p>
            </div>

            <h3 className="font-bold text-sm text-black">Mes paiements en attente de livraison ({buyerLockedFunds.length}) :</h3>

            <div className="space-y-4">
              {buyerLockedFunds.map(item => (
                <div key={item.id} className="bg-white border border-black rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-black">Nom du produit : <span className="font-bold text-base text-black">{item.productName}</span></p>
                      <p className="text-xs text-black mt-1">Vendeur : <span className="font-bold">{item.sellerName}</span></p>
                      <p className="text-xs text-black mt-1">Acheté le : {item.purchasedAt}</p>
                    </div>
                    {item.productImage && (
                      <img src={item.productImage} className="w-11 h-11 rounded-lg object-cover border border-gray-200 shrink-0" />
                    )}
                  </div>

                  <div className="flex items-end justify-between mt-4">
                    <div>
                      <p className="text-xs text-black">Fonds Total payé :</p>
                      <p className="text-xl font-extrabold text-[#a520c7]">{fmt(item.amount)} XAF</p>
                    </div>
                    <button onClick={() => handleUnlockBuyerFund(item)} className="bg-[#a520c7] hover:opacity-90 text-white font-bold text-sm px-4 py-2 rounded-full shadow-md shadow-[#a520c7]/20 flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4" /> Débloquer fonds
                    </button>
                  </div>

                  {item.livreur && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                      <Truck className="w-4 h-4 text-black" />
                      <div>
                        <p className="text-[11px] text-black">Livreur attribué :</p>
                        <p className="text-sm font-bold text-black">{item.livreur.name}</p>
                      </div>
                    </div>
                  )}

                  {openOtpId === item.id && (
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 mt-3 modal-anim">
                      <div className="flex items-center justify-between mb-3">
                        <span className="flex items-center gap-1.5 text-[#a520c7] font-bold text-sm">
                          <KeyRound className="w-4 h-4" /> CODE UNIQUE DE LIVRAISON :
                        </span>
                        <button onClick={() => setOpenOtpId(null)} className="text-black hover:text-black">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {otpViewMode === 'code' ? (
                        <p className="text-center text-3xl font-extrabold text-[#a520c7] tracking-[0.3em] mb-3">{item.otpCode.split('').join(' ')}</p>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-2 mb-3">
                          <div className="bg-white p-2 rounded-xl border-2 border-[#a520c7]/50 mb-1">
                            <QRCodeSVG value={`payspit:${item.txId || item.id}:${item.otpCode}`} size={150} bgColor="#ffffff" fgColor="#000000" level="M" />
                          </div>
                          <p className="text-[11px] text-black">Présentez cet écran au livreur</p>
                        </div>
                      )}

                      <div className="flex gap-2 mb-3">
                        <button onClick={() => copyOtp(item.otpCode)} className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-black font-semibold text-xs py-2 rounded-full flex items-center justify-center gap-1.5">
                          <Copy className="w-3.5 h-3.5" /> Copier
                        </button>
                        <button onClick={() => setOtpViewMode(m => m === 'qr' ? 'code' : 'qr')} className="flex-1 bg-[#a520c7] hover:opacity-90 text-white font-semibold text-xs py-2 rounded-full flex items-center justify-center gap-1.5">
                          <QrCode className="w-3.5 h-3.5" /> {otpViewMode === 'qr' ? 'Afficher le code' : 'Présenter QR'}
                        </button>
                      </div>

                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-800">Ne donnez le code OTP/QR que si vous avez reçu le produit conforme.</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleSimulateAchats} className="fixed bottom-6 right-4 sm:right-6 z-30 bg-ps-purple hover:bg-ps-purple-dark text-white font-bold px-5 py-3 rounded-full shadow-lg shadow-ps-purple/30 flex items-center gap-2 text-sm">
            <ShoppingCart className="w-4 h-4" /> Simuler des achats
          </button>
        </div>
      )}

      {/* ============ ÉCRAN STATISTIQUES D'ACTIVITÉ ============ */}
      {screen === 'stats' && (
        <div className="screen-anim max-w-md mx-auto lg:max-w-2xl px-4 pt-4 pb-10 space-y-3">
          <div className="bg-white border border-black rounded-2xl p-4">
            <p className="text-xs text-black flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Factures créées</p>
            <p className="text-2xl font-extrabold text-black mt-1">{transactions.length}</p>
          </div>
          <div className="bg-white border border-black rounded-2xl p-4">
            <p className="text-xs text-black flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Ventes terminées</p>
            <p className="text-2xl font-extrabold text-black mt-1">{transactions.filter(t => t.status === STATUS.COMPLETED).length}</p>
          </div>
          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
            <p className="text-xs text-ps-purple font-semibold flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Fonds actuellement bloqués</p>
            <p className="text-2xl font-extrabold text-ps-purple mt-1">{fmt(blocked)} XAF</p>
          </div>
          <div className="bg-white border border-black rounded-2xl p-4">
            <p className="text-xs text-black flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Panier moyen</p>
            <p className="text-2xl font-extrabold text-black mt-1">{fmt(transactions.length ? transactions.reduce((s, t) => s + t.amount, 0) / transactions.length : 0)} XAF</p>
          </div>
          <div className="bg-white border border-black rounded-2xl p-4">
            <p className="text-xs text-black flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Litiges en cours</p>
            <p className="text-2xl font-extrabold text-black mt-1">{transactions.filter(t => t.status === STATUS.DISPUTED).length}</p>
          </div>
        </div>
      )}

      {/* ============ ÉCRAN MES LIVREURS ============ */}
      {screen === 'livreurs' && (
        <div className="screen-anim max-w-md mx-auto lg:max-w-2xl px-4 pt-4 pb-10 space-y-3">
          {LIVREURS.filter(l => l.id !== 'none').map(l => {
            const enCours = transactions.filter(t => t.status === STATUS.ESCROW_LOCKED && t.livreur?.name === l.name).length;
            return (
              <div key={l.id} className="bg-white border border-black rounded-2xl p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                  <Truck className="w-5 h-5 text-ps-purple" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-black">{l.name}</p>
                  <p className="text-xs text-black">{l.phone}</p>
                  <p className="text-[11px] text-ps-purple font-semibold mt-0.5">{enCours} course{enCours > 1 ? 's' : ''} en cours</p>
                </div>
                <a href={`tel:${l.phone.replace(/\s/g, '')}`} className="w-9 h-9 rounded-full bg-ps-purple hover:bg-ps-purple-dark text-white flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* ============ ÉCRAN HISTORIQUE ============ */}
      {screen === 'historique' && (
        <div className="screen-anim max-w-md mx-auto lg:max-w-2xl px-4 pt-4 pb-10 space-y-3">
          {history.length === 0 && <p className="text-xs text-black px-1">Aucune transaction terminée ou en litige pour le moment.</p>}
          {history.map(tx => (
            <div key={tx.id} className="bg-white border border-black rounded-xl p-3.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-black truncate">{tx.productName}</p>
                <p className="text-[11px] text-black">{fmt(tx.amount)} XAF · {tx.buyerName}</p>
              </div>
              {tx.productImage ? (
                <img src={tx.productImage} className="w-11 h-11 rounded-lg object-cover border border-gray-200 shrink-0" />
              ) : (
                <div className="w-11 h-11 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-lg shrink-0">📦</div>
              )}
              <StatusBadge status={tx.status} />
            </div>
          ))}
        </div>
      )}

      {/* ============ MENU BURGER (COMPTE / NAVIGATION) ============ */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] flex">
          <div className="absolute inset-0 bg-black/60 overlay-anim" onClick={() => setMenuOpen(false)}></div>
          <div className="relative w-[85%] max-w-[320px] h-full bg-white text-black shadow-2xl overflow-y-auto drawer-anim flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="p-5 pt-8">
              <div className="w-16 h-16 rounded-full border-2 border-ps-purple flex items-center justify-center mb-3">
                <UserIcon className="w-9 h-9 text-blue-600" />
              </div>
              <h2 className="text-lg font-extrabold">{shop.name}</h2>
              <p className="text-sm text-black">{shop.phone}</p>
              <div className="flex items-start gap-2 mt-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-black">Compte Vendeur Vérifié</p>
                  <p className="text-[10px] text-black">Ventes standard activées</p>
                </div>
              </div>
            </div>

            <nav className="px-3 mt-3 space-y-1">
              <button onClick={() => { setMenuOpen(false); setScreen('stats'); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-black hover:bg-gray-50 text-left">
                <Star className="w-5 h-5 text-ps-purple shrink-0" /> <span className="text-sm font-medium">Statistiques d'Activité</span>
              </button>
              <button onClick={() => { setMenuOpen(false); setScreen('livreurs'); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-black hover:bg-gray-50 text-left">
                <Truck className="w-5 h-5 text-ps-purple shrink-0" /> <span className="text-sm font-medium">Mes livreurs</span>
              </button>
              <button onClick={() => { setMenuOpen(false); setScreen('historique'); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-black hover:bg-gray-50 text-left">
                <History className="w-5 h-5 text-ps-purple shrink-0" /> <span className="text-sm font-medium">Historique</span>
              </button>
              <button onClick={() => { setMenuOpen(false); setTermsOpen(true); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-black hover:bg-gray-50 text-left">
                <FileText className="w-5 h-5 text-ps-purple shrink-0" /> <span className="text-sm font-medium">Conditions d'utilisation</span>
              </button>
            </nav>

            <p className="px-5 mt-6 mb-2 text-[10px] font-bold text-black tracking-wider">BASCULER DE CONTEXTE</p>

            <div className="px-3 space-y-1">
              <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-purple-50">
                <UserIcon className="w-5 h-5 text-ps-purple shrink-0" />
                <span className="flex-1 text-sm font-bold text-ps-purple text-left">Compte Vendeur</span>
                <span className="text-[10px] font-bold text-white bg-emerald-500 px-2 py-0.5 rounded-full">Actif</span>
              </div>
              <button onClick={() => { setMenuOpen(false); setScreen('buyerLocked'); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-black hover:bg-gray-50 text-left">
                <Lock className="w-5 h-5 shrink-0" /> <span className="text-sm font-medium">Compte Acheteur (Fonds Bloqués)</span>
              </button>
              <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-black">
                <ShoppingCart className="w-5 h-5 shrink-0" /> <span className="text-sm font-medium">Compte Acheteur (Simulateur)</span>
              </div>
              <button onClick={() => { setCopilotEnabled(v => { const nv = !v; if (!nv) setIsChatOpen(false); return nv; }); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-left">
                <Brain className="w-5 h-5 text-ps-purple shrink-0" />
                <span className="flex-1 text-sm font-bold text-ps-purple text-left">{copilotEnabled ? 'Désactiver' : 'Activer'} PaySpit Copilot</span>
                <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${copilotEnabled ? 'bg-emerald-500' : 'bg-gray-400'}`}>{copilotEnabled ? 'Actif' : 'Inactif'}</span>
              </button>
            </div>

            <div className="mt-auto p-4">
              <button onClick={() => setMenuOpen(false)} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                <LogOut className="w-4 h-4" /> Déconnexion
              </button>
              <p className="text-center text-[10px] text-black mt-3">PaySpit version 2.4.0 · CEMAC Escrow</p>
            </div>
          </div>
        </div>
      )}

      {/* ============ MODAL LITIGE ============ */}
      {disputeTx && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleDispute} className="bg-white text-black rounded-2xl max-w-sm w-full p-5 shadow-2xl modal-anim max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div><h2 className="font-extrabold text-lg">Signaler un litige</h2><p className="text-xs text-black mt-0.5">{disputeTx.productName}</p></div>
              <button type="button" onClick={() => setDisputeTx(null)} aria-label="Fermer" className="text-black hover:text-black"><X className="w-5 h-5" /></button>
            </div>
            <label className="text-xs font-bold text-black block mb-1">Objet du litige</label>
            <select required value={disputeSubject} onChange={e => setDisputeSubject(e.target.value)} className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-black focus:outline-none focus:border-ps-purple mb-4">
              <option value="">Choisir un objet</option><option value="Produit non conforme">Produit non conforme</option><option value="Produit endommagé">Produit endommagé</option><option value="Livraison non effectuée">Livraison non effectuée</option><option value="Acheteur injoignable">Acheteur injoignable</option><option value="Autre">Autre</option>
            </select>
            <label className="text-xs font-bold text-black block mb-1">Message et détails</label>
            <textarea value={disputeMessage} onChange={e => setDisputeMessage(e.target.value)} rows={4} placeholder="Décrivez les faits et les échanges utiles..." className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-black resize-none focus:outline-none focus:border-ps-purple mb-4" />
            <label className="text-xs font-bold text-black block mb-2">Preuves</label>
            <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-gray-300 rounded-xl px-4 py-4 cursor-pointer hover:border-ps-purple">
              <Upload className="w-5 h-5 text-ps-purple" /><span className="text-xs font-bold">Ajouter photos, captures ou messages</span><input type="file" multiple accept="image/*,.pdf,.txt" onChange={handleDisputeProofs} className="hidden" />
            </label>
            {disputeProofs.length > 0 && <ul className="mt-2 space-y-1 text-[11px] text-black">{disputeProofs.map((file, index) => <li key={`${file.name}-${index}`} className="truncate">• {file.name}</li>)}</ul>}
            <div className="flex items-center gap-3 mt-5"><button type="submit" className="shrink-0 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl">Envoyer</button><p className="text-[11px] leading-snug text-black font-semibold">PaySpit va trancher le litige sous 48 heures.</p></div>
          </form>
        </div>
      )}

      {/* ============ MODAL CONDITIONS D'UTILISATION ============ */}
      {termsOpen && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white text-black rounded-2xl max-w-sm w-full p-5 shadow-2xl modal-anim max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><h2 className="font-extrabold text-lg">Conditions d'utilisation</h2><button onClick={() => setTermsOpen(false)} aria-label="Fermer" className="text-black hover:text-black"><X className="w-5 h-5" /></button></div>
            <div className="space-y-4 text-xs leading-relaxed text-black">
              <section><h3 className="font-extrabold mb-1">Utilisation du service</h3><p>PaySpit sécurise les paiements entre acheteurs et vendeurs. Chaque utilisateur s'engage à fournir des informations exactes et à utiliser le service uniquement pour des transactions licites.</p></section>
              <section><h3 className="font-extrabold mb-1">Blocage et déblocage des fonds</h3><p>Les fonds restent bloqués jusqu'à la confirmation de la livraison par l'acheteur au moyen du code OTP ou du QR-Code. Ce code ne doit être communiqué qu'après vérification du produit.</p></section>
              <section><h3 className="font-extrabold mb-1">Litiges</h3><p>En cas de désaccord, les fonds restent protégés pendant l'examen des preuves transmises. PaySpit rend une décision sous 48 heures après réception d'un dossier complet.</p></section>
              <section><h3 className="font-extrabold mb-1">Frais et responsabilité</h3><p>La commission applicable est présentée avant la transaction. Les utilisateurs restent responsables de la conformité des produits, des informations partagées et du respect des délais convenus.</p></section>
              <section><h3 className="font-extrabold mb-1">Confidentialité</h3><p>Les données et preuves sont utilisées uniquement pour sécuriser la transaction, traiter les litiges et respecter les obligations applicables.</p></section>
            </div>
            <button onClick={() => setTermsOpen(false)} className="w-full bg-ps-purple hover:bg-ps-purple-dark text-white font-bold py-2.5 rounded-xl mt-5">Fermer</button>
          </div>
        </div>
      )}

      {/* ============ MODAL PAGE ACHETEUR ============ */}
      {buyerModalTx && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white text-black rounded-2xl max-w-sm w-full p-6 shadow-2xl relative modal-anim max-h-[90vh] overflow-y-auto">
            <button onClick={() => setBuyerModalTx(null)} className="absolute top-3 right-3 text-black hover:text-black">
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center mb-3">
              <div className="flex items-center gap-1 text-ps-purple font-black text-xl">
                <ShieldCheck className="w-6 h-6" /> Payspit
              </div>
              <h2 className="text-lg font-extrabold mt-2">Demande de Paiement Sécurisé</h2>
            </div>

            <div className="flex justify-center my-3">
              {buyerModalTx.productImage ? (
                <img src={buyerModalTx.productImage} className="w-32 h-32 rounded-full object-cover border-4 border-gray-100" />
              ) : (
                <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center text-4xl">📦</div>
              )}
            </div>

            <h3 className="text-center font-bold text-base">{buyerModalTx.productName}</h3>
            <div className="text-center text-sm text-black space-y-0.5 mt-1">
              <p className="flex items-center justify-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Frais de livraison : {buyerModalTx.deliveryFee > 0 ? `${fmt(buyerModalTx.deliveryFee)} XAF` : 'Gratuit'}</p>
              <p className="flex items-center justify-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Délai de livraison : {buyerModalTx.escrowDays} Jours</p>
            </div>

            <div className="bg-gray-100 rounded-xl p-3 text-center my-4">
              <p className="text-xs text-black">Montant à payer :</p>
              <p className="text-2xl font-extrabold text-[#a520c7]">{fmt(buyerModalTx.amount + buyerModalTx.deliveryFee)} XAF</p>
              <p className="text-[10px] text-black mt-0.5">*Frais de service Payspit de 2% inclus.</p>
            </div>

            <div className="space-y-2 mb-3">
              <input type="text" placeholder="Votre nom" value={buyerName} onChange={e => setBuyerName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ps-purple" />
              <input type="tel" placeholder="Votre numéro Mobile Money" value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ps-purple" />
            </div>

            <div className="space-y-2">
              <button onClick={() => handleBuyerPay('Orange Money')} className="w-full border-2 border-orange-400 text-orange-600 font-bold py-2.5 rounded-full flex items-center justify-center gap-2 hover:bg-orange-50">
                <img src={OPERATOR_LOGOS.orange} className="w-6 h-6 rounded-full object-cover" /> Payer avec Orange Money
              </button>
              <button onClick={() => handleBuyerPay('MTN MoMo')} className="w-full border-2 border-yellow-400 text-yellow-700 font-bold py-2.5 rounded-full flex items-center justify-center gap-2 hover:bg-yellow-50">
                <img src={OPERATOR_LOGOS.mtn} className="w-6 h-6 rounded-full object-cover" /> Payer avec MTN MoMo
              </button>
              <button onClick={() => handleBuyerPay('Carte Bancaire')} className="w-full border-2 border-gray-400 text-black font-bold py-2.5 rounded-full flex items-center justify-center gap-2 hover:bg-gray-50">
                💳 Payer avec Carte Bancaire (Visa/Mastercard)
              </button>
            </div>

            <div className="flex items-start gap-2 bg-purple-50 rounded-xl p-3 mt-4 text-[11px] text-black">
              <Lock className="w-4 h-4 text-ps-purple shrink-0 mt-0.5" />
              <p>Votre paiement est protégé par le service d'escrow Payspit. Les fonds ne seront libérés au vendeur qu'après confirmation de votre livraison. Vous disposez de {buyerModalTx.escrowDays} jours pour confirmer ou signaler un litige.</p>
            </div>
          </div>
        </div>
      )}

      {/* ============ MODAL CONFIRMATION SMS ============ */}
      {smsModalTx && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-sm w-full shadow-2xl modal-anim overflow-hidden">
            <div className="bg-gray-100 px-4 py-3 flex items-center gap-3 border-b border-gray-200">
              <div className="w-9 h-9 rounded-full bg-gray-600 flex items-center justify-center">👤</div>
              <div>
                <p className="font-extrabold text-sm">PAYSPIT</p>
                <p className="text-[10px] text-black">Nouveau message</p>
              </div>
              <button onClick={closeBuyerPaymentMessage} className="ml-auto text-black hover:text-black"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4">
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm p-3.5 text-xs leading-relaxed text-black">
                <p className="mb-2">Confirmation de paiement PaySpit ! Votre paiement de <b>{fmt(smsModalTx.amount + smsModalTx.deliveryFee)} XAF</b> pour '{smsModalTx.productName}' a été placé en compte <b>séquestre</b>. 🔒</p>
                <p className="mb-2">À LA LIVRAISON, CONFIRMEZ VOTRE RÉCEPTION POUR DÉBLOQUER LES FONDS AU VENDEUR.</p>
                <p className="mb-1">Vous avez deux options :</p>
                <p className="mb-1">1. Communiquez ce code au livreur/vendeur : <span className="font-mono font-extrabold text-cyan-700 text-sm">{smsModalTx.otpCode}</span></p>
                <p className="mb-2">OU<br />2. Cliquez sur ce lien unique pour valider vous-même : <span className="text-cyan-700 underline">paysplit.co/c/{smsModalTx.id.slice(-6)}</span></p>
                <p className="italic text-black">*Si aucune action n'est entreprise sous {smsModalTx.escrowDays} jours, vous serez automatiquement remboursé.*</p>
              </div>
            </div>
            <div className="p-4 pt-0">
              <button onClick={closeBuyerPaymentMessage} className="w-full bg-ps-purple hover:bg-ps-purple-dark text-white font-bold py-2.5 rounded-xl text-sm">J'ai compris</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ MESSAGE DE CONFIRMATION AU VENDEUR ============ */}
      {sellerPaymentNotice && !smsModalTx && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"><div className="bg-white border border-gray-200 rounded-2xl max-w-sm w-full shadow-2xl modal-anim overflow-hidden">
          <div className="bg-gray-100 px-4 py-3 flex items-center gap-3 border-b border-gray-200"><div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center"><CheckCircle2 className="w-5 h-5" /></div><div><p className="font-extrabold text-sm">PAYSPIT</p><p className="text-[10px] text-black">Message au vendeur</p></div><button onClick={() => setSellerPaymentNotice(null)} className="ml-auto text-black hover:text-black" aria-label="Fermer"><X className="w-4 h-4" /></button></div>
          <div className="p-4"><div className="bg-gray-100 rounded-2xl rounded-tl-sm p-3.5 text-xs leading-relaxed text-black"><p className="font-bold mb-2">Paiement confirmé.</p><p>{sellerPaymentNotice.buyerName} a payé <b>{fmt(sellerPaymentNotice.amount + sellerPaymentNotice.deliveryFee)} XAF</b> pour « {sellerPaymentNotice.productName} » via {sellerPaymentNotice.paymentOperator}. Les fonds sont maintenant sécurisés jusqu'à la confirmation de la livraison.</p></div><button onClick={() => setSellerPaymentNotice(null)} className="w-full bg-ps-purple hover:bg-ps-purple-dark text-white font-bold py-2.5 rounded-xl text-sm mt-4">J'ai compris</button></div>
        </div></div>
      )}

      {/* ============ MODAL FONDS DÉBLOQUÉS ============ */}
      {unlockedTx && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white text-black rounded-2xl max-w-sm w-full p-6 shadow-2xl modal-anim">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              <h2 className="text-lg font-extrabold">Fonds Débloqués ! 🎉</h2>
            </div>
            <p className="text-sm text-black mb-4">Le code OTP est correct ! Les fonds ont été transférés avec succès sur votre solde PaySpit.</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-black">Produit :</span><span className="font-bold text-right">{unlockedTx.productName}</span></div>
              <div className="flex justify-between"><span className="text-black">Montant produit :</span><span className="font-bold">{fmt(unlockedTx.amount)} XAF</span></div>
              <div className="flex justify-between"><span className="text-black">Frais de livraison :</span><span className="font-bold">{fmt(unlockedTx.deliveryFee)} XAF</span></div>
              <div className="flex justify-between"><span className="text-black">Commission PaySpit (2%) :</span><span className="font-bold text-rose-500">- {fmt(commission(unlockedTx.amount))} XAF</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1.5"><span className="font-bold">Montant crédité :</span><span className="font-extrabold text-emerald-600">+ {fmt(unlockedTx.credited)} XAF</span></div>
            </div>
            <button onClick={() => setUnlockedTx(null)} className="w-full bg-ps-purple hover:bg-ps-purple-dark text-white font-bold py-2.5 rounded-xl mt-5">Super, merci !</button>
          </div>
        </div>
      )}

      {/* ============ MODAL SUIVI LIVREUR ============ */}
      {courseTx && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-sm w-full p-6 shadow-2xl modal-anim">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-extrabold text-base flex items-center gap-2 text-black"><MapPin className="w-5 h-5 text-cyan-600" /> Suivi de la course</h2>
              <button onClick={() => setCourseTx(null)} className="text-black hover:text-black"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-black mb-1">{courseTx.livreur?.name}</p>
            <p className="text-xs text-black mb-4">{courseTx.livreur?.phone}</p>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-2 overflow-hidden">
              <div className="bg-gradient-to-r from-ps-purple to-ps-cyan h-2 rounded-full" style={{ width: '62%' }}></div>
            </div>
            <p className="text-xs text-black mb-5">En route vers l'adresse de {courseTx.buyerName} · ETA ~ 25 min (simulation)</p>
            <a href={`tel:${(courseTx.livreur?.phone || '').replace(/\s/g, '')}`} className="w-full bg-ps-purple hover:bg-ps-purple-dark text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm">
              <Phone className="w-4 h-4" /> Appeler le livreur
            </a>
          </div>
        </div>
      )}

      {/* ============ MODAL SCAN QR (caméra réelle) ============ */}
      {qrOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-sm w-full p-6 shadow-2xl modal-anim text-center">
            <button onClick={closeScan} className="ml-auto block text-black hover:text-black mb-2"><X className="w-5 h-5" /></button>

            <div className="relative w-56 h-56 mx-auto rounded-2xl overflow-hidden bg-black mb-4">
              <video ref={videoRef} muted playsInline className={`w-full h-full object-cover ${scanStatus === 'scanning' ? 'block' : 'hidden'}`} />
              <canvas ref={canvasRef} className="hidden" />

              {scanStatus === 'requesting' && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-xs px-4 text-center">Démarrage de la caméra...</div>
              )}
              {scanStatus === 'scanning' && (
                <div className="absolute inset-4 border-4 border-[#a520c7]/70 rounded-xl pointer-events-none"></div>
              )}
              {scanStatus === 'success' && (
                <div className="absolute inset-0 flex items-center justify-center bg-white">
                  <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                </div>
              )}
              {scanStatus === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center bg-white">
                  <X className="w-16 h-16 text-red-500" />
                </div>
              )}
            </div>

            {scanStatus === 'success' && (
              <>
                <p className="text-sm font-bold text-emerald-600 mb-1">Code scanné avec succès !</p>
                <p className="text-xs text-black break-all mb-4">{scanResult}</p>
                <button onClick={closeScan} className="w-full bg-[#a520c7] hover:opacity-90 text-white font-bold py-2.5 rounded-xl text-sm">Terminé</button>
              </>
            )}

            {scanStatus === 'error' && (
              <>
                <p className="text-sm font-bold text-red-600 mb-1">Échec du scan</p>
                <p className="text-xs text-black mb-4">{scanMessage}</p>
                <button onClick={startScan} className="w-full bg-[#a520c7] hover:opacity-90 text-white font-bold py-2.5 rounded-xl text-sm">Réessayer</button>
              </>
            )}

            {(scanStatus === 'scanning' || scanStatus === 'requesting') && (
              <p className="text-xs text-black">Centrez le QR code dans le cadre pour le scanner.</p>
            )}
          </div>
        </div>
      )}

      {/* ============ MODAL RECHARGE / RETRAIT ============ */}
      {walletModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-sm w-full p-6 shadow-2xl modal-anim">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-extrabold text-base text-black">{walletModal.type === 'recharge' ? 'Recharger mon solde' : 'Retirer des fonds'}</h2>
              <button onClick={() => setWalletModal(null)} className="text-black hover:text-black"><X className="w-5 h-5" /></button>
            </div>

            <label className="text-xs text-black block mb-1">Montant (XAF)</label>
            <input
              type="number"
              value={walletAmount}
              onChange={e => setWalletAmount(e.target.value)}
              placeholder="10000"
              className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black focus:outline-none focus:border-[#a520c7] mb-4"
            />

            <label className="text-xs text-black block mb-2">Choisissez votre mode de paiement</label>
            <div className="space-y-2 mb-5">
              <button
                onClick={() => setWalletOperator('Orange Money')}
                className={`w-full flex items-center gap-3 border-2 rounded-full px-3 py-2 font-bold text-sm ${walletOperator === 'Orange Money' ? 'border-[#a520c7] bg-[#a520c7]/5' : 'border-gray-200'}`}
              >
                <img src={OPERATOR_LOGOS.orange} className="w-7 h-7 rounded-full object-cover" /> Orange Money
              </button>
              <button
                onClick={() => setWalletOperator('MTN MoMo')}
                className={`w-full flex items-center gap-3 border-2 rounded-full px-3 py-2 font-bold text-sm ${walletOperator === 'MTN MoMo' ? 'border-[#a520c7] bg-[#a520c7]/5' : 'border-gray-200'}`}
              >
                <img src={OPERATOR_LOGOS.mtn} className="w-7 h-7 rounded-full object-cover" /> MTN MoMo
              </button>
            </div>

            <button onClick={handleConfirmWalletAction} className="w-full bg-[#a520c7] hover:opacity-90 text-white font-bold py-3 rounded-xl">
              {walletModal.type === 'recharge' ? 'Confirmer la recharge' : 'Confirmer le retrait'}
            </button>
          </div>
        </div>
      )}

      {/* ============ COPILOT IA FLOTTANT ============ */}
      {copilotEnabled && (
      <div
        style={{ left: `${fabPos.x}px`, top: `${fabPos.y}px`, position: 'fixed' }}
        onPointerDown={handlePointerDown}
        onClick={() => { if (!isDragging) setIsChatOpen(!isChatOpen); }}
        className="z-50 w-[78px] h-[88px] cursor-grab active:cursor-grabbing select-none transition-transform hover:scale-105"
        title="Copilot PaySpit IA"
      >
        <svg viewBox="0 0 100 110" className="w-full h-full drop-shadow-[0_12px_24px_rgba(255,0,127,0.55)]">
          <defs>
            <radialGradient id="haloGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FF007F" stopOpacity="0.6" />
              <stop offset="60%" stopColor="#8B00FF" stopOpacity="0.25" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="body3d" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#8B00FF" />
              <stop offset="45%" stopColor="#6A0DAD" />
              <stop offset="100%" stopColor="#FF007F" />
            </linearGradient>
            <radialGradient id="specularGleam" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="50" cy="98" rx="36" ry="7" fill="url(#haloGlow)" />
          <line x1="50" y1="26" x2="50" y2="8" stroke="#00FFFF" strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="50" cy="8" r="5" fill="#00FFFF" style={{ filter: 'drop-shadow(0 0 4px #00FFFF)' }} />
          <circle cx="48.5" cy="6.5" r="1.5" fill="#FFFFFF" />
          <path d="M 50,26 C 82,34 92,62 87,78 C 82,92 68,92 50,92 C 32,92 18,92 13,78 C 8,62 18,34 50,26 Z" fill="url(#body3d)" stroke="rgba(0, 255, 255, 0.4)" strokeWidth="1.2" />
          <ellipse cx="64" cy="42" rx="15" ry="9" fill="url(#specularGleam)" />
          <ellipse cx="32" cy="62" rx="5" ry="2.5" fill="#FF4081" opacity="0.65" />
          <ellipse cx="68" cy="62" rx="5" ry="2.5" fill="#FF4081" opacity="0.65" />
          <rect x="37" y="52" width="6.5" height="7.5" rx="2.5" fill="#00FFFF" style={{ filter: 'drop-shadow(0 0 3px #00FFFF)' }} />
          <circle cx="41" cy="54" r="1.2" fill="#FFFFFF" />
          <rect x="56.5" y="52" width="6.5" height="7.5" rx="2.5" fill="#00FFFF" style={{ filter: 'drop-shadow(0 0 3px #00FFFF)' }} />
          <circle cx="60.5" cy="54" r="1.2" fill="#FFFFFF" />
          <path d="M 44,67 Q 50,74 56,67" fill="none" stroke="#00FFFF" strokeWidth="2.2" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 2px #00FFFF)' }} />
        </svg>
      </div>
      )}

      {copilotEnabled && isChatOpen && (
        <div className="fixed bottom-28 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] max-w-sm h-[440px] max-h-[70vh] bg-white border border-ps-cyan/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden chat-anim">
          <div className="bg-gradient-to-r from-ps-purple-dark via-ps-purple to-ps-accent px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-ps-cyan animate-pulse"></span>
              <h4 className="font-extrabold text-sm text-white">Copilot PaySpit IA</h4>
            </div>
            <button onClick={() => setIsChatOpen(false)} className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 p-3.5 overflow-y-auto space-y-2.5 text-xs">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`max-w-[85%] p-3 rounded-xl leading-relaxed ${msg.from === 'user' ? 'ml-auto bg-ps-purple text-white' : 'mr-auto bg-gray-100 border border-gray-200 text-black'}`}>
                {msg.text}
              </div>
            ))}
          </div>
          <form onSubmit={handleSendChat} className="p-2.5 bg-gray-50 border-t border-gray-200 flex gap-2">
            <input type="text" value={userMsg} onChange={e => setUserMsg(e.target.value)} placeholder="Posez une question sur PaySpit..."
              className="flex-1 bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-black focus:outline-none focus:border-ps-purple" />
            <button type="submit" className="bg-ps-cyan hover:bg-ps-cyan/80 text-black px-3.5 rounded-xl font-bold flex items-center justify-center">
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ================= Routeur : page de paiement / page « Comment Fonctionne PaySpit » / application ================= */
function App() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (hash.startsWith('#/pay/')) {
    return <PayPage payload={hash.slice('#/pay/'.length)} />;
  }
  if (hash.startsWith('#/comment-fonctionne-payspit')) {
    const status = new URLSearchParams(hash.split('?')[1] || '').get('status');
    return <HowItWorksPage status={status} />;
  }
  return <SellerApp />;
}


export default App;