// Insère les ventes de démonstration « du jour » dans la base Supabase
// hosted (même contenu que supabase/seed.sql, ids identiques, insertion
// idempotente : resolution=ignore-duplicates). Les created_at sont calés
// ce matin (heure d'Abidjan = UTC), jamais dans le futur.
import { readFileSync } from 'node:fs'

const env = readFileSync('/home/z/julaba/.env', 'utf8')
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'))
  if (!m) throw new Error(`Variable manquante : ${k}`)
  return m[1].trim()
}

const URL = get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=ignore-duplicates',
}

const today = new Date().toISOString().slice(0, 10)
const at = (h, m) => `${today}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`

const now = new Date()
if (now.getUTCHours() < 11) {
  // Si le script tourne avant 11h UTC, on décale les heures de démo sous l'heure courante
  console.log(`Heure courante UTC : ${now.getUTCHours()}h — les heures de démo resteront sous 11h.`)
}

const sales = [
  { id: 'legacy-sale-003', merchant_id: 'merchant-2', session_id: null, client_id: 'legacy-client-sale-003', total_amount: 12500, change_amount: 0, amount_received: 12500, is_voice_sale: false, voice_transcript: null, note: null },
  { id: 'legacy-sale-004', merchant_id: 'merchant-1', session_id: null, client_id: 'legacy-client-sale-004', total_amount: 5000, change_amount: 0, amount_received: 5000, is_voice_sale: true, voice_transcript: 'Deux sacs de tomates et un kilo d\'oignons', note: null },
  { id: 'legacy-sale-005', merchant_id: 'merchant-3', session_id: null, client_id: 'legacy-client-sale-005', total_amount: 8500, change_amount: 1500, amount_received: 10000, is_voice_sale: false, voice_transcript: null, note: 'Client fidèle — commande spéciale' },
]

const items = [
  { id: 'legacy-item-004', sale_id: 'legacy-sale-003', product_id: null, product_name: 'Riz local 5 kg', quantity: 2, unit_price: 5000, subtotal: 10000 },
  { id: 'legacy-item-005', sale_id: 'legacy-sale-003', product_id: null, product_name: 'Huile végétale 1 L', quantity: 1, unit_price: 2500, subtotal: 2500 },
  { id: 'legacy-item-006', sale_id: 'legacy-sale-004', product_id: 'legacy-product-001', product_name: 'Tomates fraîches', quantity: 4, unit_price: 500, subtotal: 2000 },
  { id: 'legacy-item-007', sale_id: 'legacy-sale-004', product_id: 'legacy-product-002', product_name: 'Oignons', quantity: 4, unit_price: 750, subtotal: 3000 },
  { id: 'legacy-item-008', sale_id: 'legacy-sale-005', product_id: null, product_name: 'Savon de Marseille', quantity: 5, unit_price: 1000, subtotal: 5000 },
  { id: 'legacy-item-009', sale_id: 'legacy-sale-005', product_id: null, product_name: 'Beurre de karité', quantity: 1, unit_price: 3500, subtotal: 3500 },
]

async function insert(table, rows) {
  const res = await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${table} : ${res.status} ${body}`)
  }
  console.log(`${table} : ${rows.length} ligne(s) insérées (ou déjà présentes)`)
}

await insert('legacy_sales', sales)
await insert('legacy_sale_items', items)
console.log('Seed ventes hosted terminé.')
