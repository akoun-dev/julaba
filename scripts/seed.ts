import { createSupabaseAdminClient } from '../src/lib/supabase/admin'
import { hashPassword } from '../src/lib/backoffice-auth/password'
import { randomBytes, createHash } from 'crypto'

const supabase = createSupabaseAdminClient()

// ============ HELPERS ============

const PHONE_PREFIXES = ['07', '05', '01', '04']

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '').replace(/^(\+225)?/, '')
}

function seedApiKey(slug: string): { key: string; secretHash: string } {
  const key = `jlb_${slug}_${randomBytes(9).toString('base64url')}`
  const secretHash = createHash('sha256').update(`sec_${randomBytes(32).toString('base64url')}`).digest('hex')
  return { key, secretHash }
}

function randomPhone(): string {
  const prefix = PHONE_PREFIXES[Math.floor(Math.random() * PHONE_PREFIXES.length)]
  const num = String(Math.floor(Math.random() * 100000000)).padStart(8, '0')
  return `${prefix} ${num.slice(0, 2)} ${num.slice(2, 4)} ${num.slice(4, 6)} ${num.slice(6, 8)}`
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000)
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3600000)
}

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return hash.toString()
}

function identificateurForZone(
  zone: string,
  users: { id: string; name: string; zone: string | null; role: string }[]
) {
  const local = users.find(
    (u) => u.zone === zone && (u.role === 'gestionnaire_zone' || u.role === 'operateur_terrain')
  )
  return local ?? users.find((u) => u.name === 'Koffi YAO')!
}

// ============ SEED DATA ============

const BO_USERS = [
  { email: 'aminata@julaba.ci', password_hash: 'admin123', name: 'Aminata KONÉ', role: 'super_admin', zone: null, is_active: true },
  { email: 'koffi@julaba.ci', password_hash: 'admin123', name: 'Koffi YAO', role: 'admin_general', zone: null, is_active: true },
  { email: 'moussa@dge.ci', password_hash: 'admin123', name: 'Moussa TRAORÉ', role: 'admin_national', zone: 'National', is_active: true },
  { email: 'fatou@julaba.ci', password_hash: 'admin123', name: 'Fatou SORO', role: 'gestionnaire_zone', zone: 'Adjamé', is_active: true },
  { email: 'jean@julaba.ci', password_hash: 'admin123', name: 'Jean KOUADIO', role: 'operateur_terrain', zone: 'Adjamé', is_active: true },
  { email: 'affi@julaba.ci', password_hash: 'admin123', name: 'Affi COULIBALY', role: 'gestionnaire_zone', zone: 'Bouaké', is_active: true },
  { email: 'yao@julaba.ci', password_hash: 'admin123', name: 'Yao KONAN', role: 'operateur_terrain', zone: 'Kong', is_active: false },
]

const ZONES = [
  { name: 'Adjamé', region: 'Abidjan', identificateur_count: 42, actor_count: 340, target: 2000 },
  { name: 'Cocody', region: 'Abidjan', identificateur_count: 28, actor_count: 215, target: 1500 },
  { name: 'Yopougon', region: 'Abidjan', identificateur_count: 35, actor_count: 280, target: 2500 },
  { name: 'Marcory', region: 'Abidjan', identificateur_count: 18, actor_count: 125, target: 800 },
  { name: 'Bouaké', region: 'Centre', identificateur_count: 22, actor_count: 190, target: 1200 },
  { name: 'Kong', region: 'Savanes', identificateur_count: 10, actor_count: 25, target: 500 },
  { name: 'Korhogo', region: 'Savanes', identificateur_count: 15, actor_count: 85, target: 800 },
  { name: 'San-Pédro', region: 'Bas-Sassandra', identificateur_count: 12, actor_count: 60, target: 600 },
]

const ACTORS = [
  { actor_id: '#M-0001', first_name: 'Awa', last_name: 'KONÉ', type: 'marchand', phone: '07 12 34 56 78', zone: 'Adjamé', status: 'actif', photo_url: '/photos/awa-kone.jpg', gps_lat: 5.3600, gps_lng: -4.0083, identificateur_name: 'Fatou SORO' },
  { actor_id: '#M-0002', first_name: 'Ibrahim', last_name: 'TRAORÉ', type: 'marchand', phone: '05 23 45 67 89', zone: 'Adjamé', status: 'actif', gps_lat: 5.3610, gps_lng: -4.0090, identificateur_name: 'Fatou SORO' },
  { actor_id: '#P-0003', first_name: 'Moussa', last_name: 'DIALLO', type: 'producteur', phone: '01 34 56 78 90', zone: 'Bouaké', status: 'actif', photo_url: '/photos/moussa-diallo.jpg', gps_lat: 7.6941, gps_lng: -5.0303, identificateur_name: 'Affi COULIBALY' },
  { actor_id: '#C-0004', first_name: 'Aminata', last_name: 'CAMARA', type: 'cooperatif', phone: '04 45 67 89 01', zone: 'Cocody', status: 'actif', gps_lat: 5.3450, gps_lng: -3.9600, identificateur_name: 'Awa KONÉ' },
  { actor_id: '#M-0005', first_name: 'Fatoumata', last_name: 'KEITA', type: 'marchand', phone: '07 56 78 90 12', zone: 'Yopougon', status: 'actif', photo_url: '/photos/fatoumata-keita.jpg', identificateur_name: 'Ibrahim TRAORÉ' },
  { actor_id: '#M-0006', first_name: 'Drissa', last_name: 'SANGARÉ', type: 'marchand', phone: '05 67 89 01 23', zone: 'Marcory', status: 'actif', gps_lat: 5.3300, gps_lng: -3.9700, identificateur_name: 'Fatou SORO' },
  { actor_id: '#P-0007', first_name: 'Adama', last_name: 'OUATTARA', type: 'producteur', phone: '01 78 90 12 34', zone: 'Bouaké', status: 'actif', photo_url: '/photos/adama-ouattara.jpg', gps_lat: 7.7000, gps_lng: -5.0200, identificateur_name: 'Affi COULIBALY' },
  { actor_id: '#M-0008', first_name: 'Mariam', last_name: 'DIABATÉ', type: 'marchand', phone: '04 89 01 23 45', zone: 'Kong', status: 'actif', identificateur_name: 'Moussa DIALLO' },
  { actor_id: '#C-0009', first_name: 'Seydou', last_name: 'DEMÉLÉ', type: 'cooperatif', phone: '07 90 12 34 56', zone: 'Korhogo', status: 'suspendu', photo_url: '/photos/seydou-dembele.jpg', identificateur_name: 'Ibrahim TRAORÉ' },
  { actor_id: '#M-0010', first_name: 'Salimata', last_name: 'CISSÉ', type: 'marchand', phone: '05 01 23 45 67', zone: 'San-Pédro', status: 'actif', gps_lat: 4.7485, gps_lng: -6.6363, identificateur_name: 'Awa KONÉ' },
  { actor_id: '#P-0011', first_name: 'Bakary', last_name: 'KONATÉ', type: 'producteur', phone: '01 12 34 56 78', zone: 'Adjamé', status: 'actif', photo_url: '/photos/bakary-konate.jpg', gps_lat: 5.3580, gps_lng: -4.0050, identificateur_name: 'Fatou SORO' },
  { actor_id: '#M-0012', first_name: 'Oumou', last_name: 'TOURÉ', type: 'marchand', phone: '04 23 45 67 89', zone: 'Cocody', status: 'en_attente', identificateur_name: 'Awa KONÉ' },
  { actor_id: '#M-0013', first_name: 'Lassina', last_name: 'COULIBALY', type: 'marchand', phone: '07 34 56 78 90', zone: 'Yopougon', status: 'actif', gps_lat: 5.3550, gps_lng: -4.0800, identificateur_name: 'Ibrahim TRAORÉ' },
  { actor_id: '#P-0014', first_name: 'Fanta', last_name: 'BAMBA', type: 'producteur', phone: '05 45 67 89 01', zone: 'Bouaké', status: 'actif', photo_url: '/photos/fanta-bamba.jpg', identificateur_name: 'Affi COULIBALY' },
  { actor_id: '#M-0015', first_name: 'Cheick', last_name: 'DIALLO', type: 'marchand', phone: '01 56 78 90 12', zone: 'Marcory', status: 'suspendu', identificateur_name: 'Fatou SORO' },
  { actor_id: '#C-0016', first_name: 'Kadiatou', last_name: 'SANGARÉ', type: 'cooperatif', phone: '04 67 89 01 23', zone: 'Korhogo', status: 'actif', gps_lat: 9.4580, gps_lng: -5.6300, identificateur_name: 'Ibrahim TRAORÉ' },
  { actor_id: '#M-0017', first_name: 'Aboubacar', last_name: 'DIARRA', type: 'marchand', phone: '07 78 90 12 34', zone: 'San-Pédro', status: 'actif', photo_url: '/photos/aboubacar-diara.jpg', identificateur_name: 'Awa KONÉ' },
  { actor_id: '#P-0018', first_name: 'Ramatoulaye', last_name: 'KEITA', type: 'producteur', phone: '05 89 01 23 45', zone: 'Adjamé', status: 'en_attente', identificateur_name: 'Fatou SORO' },
  { actor_id: '#M-0019', first_name: 'Souleymane', last_name: 'CAMARA', type: 'marchand', phone: '01 90 12 34 56', zone: 'Kong', status: 'actif', gps_lat: 9.0400, gps_lng: -4.5600, identificateur_name: 'Moussa DIALLO' },
  { actor_id: '#M-0020', first_name: 'Boubacar', last_name: 'OUATTARA', type: 'marchand', phone: '04 01 23 45 67', zone: 'Cocody', status: 'actif', identificateur_name: 'Awa KONÉ' },
  { actor_id: '#P-0021', first_name: 'Hawa', last_name: 'CISSÉ', type: 'producteur', phone: '07 12 56 78 90', zone: 'Yopougon', status: 'actif', photo_url: '/photos/hawa-cisse.jpg', gps_lat: 5.3500, gps_lng: -4.0700, identificateur_name: 'Ibrahim TRAORÉ' },
  { actor_id: '#M-0022', first_name: 'Djénéba', last_name: 'TOURÉ', type: 'marchand', phone: '05 23 67 89 01', zone: 'Bouaké', status: 'actif', identificateur_name: 'Affi COULIBALY' },
  { actor_id: '#C-0023', first_name: 'Issouf', last_name: 'DEMÉLÉ', type: 'cooperatif', phone: '01 34 78 90 12', zone: 'Marcory', status: 'actif', gps_lat: 5.3350, gps_lng: -3.9650, identificateur_name: 'Fatou SORO' },
  { actor_id: '#M-0024', first_name: 'Aminata', last_name: 'KONATÉ', type: 'marchand', phone: '04 45 89 01 23', zone: 'Korhogo', status: 'suspendu', identificateur_name: 'Ibrahim TRAORÉ' },
  { actor_id: '#P-0025', first_name: 'Mamadou', last_name: 'DIALLO', type: 'producteur', phone: '07 56 90 12 34', zone: 'San-Pédro', status: 'actif', photo_url: '/photos/mamadou-diallo.jpg', gps_lat: 4.7500, gps_lng: -6.6400, identificateur_name: 'Awa KONÉ' },
  { actor_id: '#M-0026', first_name: 'Fatou', last_name: 'COULIBALY', type: 'marchand', phone: '05 67 01 23 45', zone: 'Adjamé', status: 'actif', identificateur_name: 'Fatou SORO' },
  { actor_id: '#M-0027', first_name: 'Ibrahim', last_name: 'BAMBA', type: 'marchand', phone: '01 78 12 34 56', zone: 'Yopougon', status: 'en_attente', identificateur_name: 'Ibrahim TRAORÉ' },
  { actor_id: '#P-0028', first_name: 'Aïcha', last_name: 'SANGARÉ', type: 'producteur', phone: '04 89 23 45 67', zone: 'Bouaké', status: 'actif', photo_url: '/photos/aicha-sangare.jpg', identificateur_name: 'Affi COULIBALY' },
]

// ============ MAIN SEED FUNCTION ============

async function main() {
  console.log('🌱 Suppression des données existantes (ordre inverse de dépendance)...')

  await supabase.from('legacy_voice_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('legacy_tontine_contributions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('legacy_tontine_members').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('legacy_tontines').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('legacy_sale_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('legacy_sales').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('legacy_expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('legacy_caisse_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('legacy_products').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('merchants').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ Merchant (marchand)')
  await supabase.from('producers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ Producteur')
  await supabase.from('bo_mfa_challenges').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('bo_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('legacy_audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ AuditLog')
  await supabase.from('legacy_bo_system_events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoSystemEvent')
  await supabase.from('legacy_bo_platform_configs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoPlatformConfig')
  await supabase.from('legacy_bo_keiwa_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoKeiwaTransaction')
  await supabase.from('legacy_bo_keiwa_accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoKeiwaAccount')
  await supabase.from('legacy_bo_credit_scores').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoCreditScore')
  await supabase.from('legacy_bo_cron_jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoCronJob')
  await supabase.from('legacy_bo_deliveries').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoDelivery')
  await supabase.from('bo_api_keys').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoApiKey')
  await supabase.from('legacy_bo_communications').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoCommunication')
  await supabase.from('legacy_bo_contents').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoContent')
  await supabase.from('legacy_bo_moderation_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoModerationReport')
  await supabase.from('legacy_bo_mutations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoMutation')
  await supabase.from('legacy_bo_institutions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoInstitution')
  await supabase.from('legacy_bo_alertes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoAlert')
  await supabase.from('legacy_bo_enrolments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoEnrolment')
  await supabase.from('legacy_bo_missions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoMission')
  await supabase.from('legacy_bo_actors').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoActor')
  await supabase.from('legacy_bo_zones').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoZone')
  await supabase.from('bo_users').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✓ BoUser')

  // ===== 0. Merchant (demo marchand account) =====
  console.log('\n🏪 Création du compte marchand de démonstration...')
  await supabase.from('merchants').insert({
    id: 'merchant-1',
    first_name: 'Awa',
    last_name: 'KONÉ',
    phone: normalizePhone('07 01 02 03 04'),
    auth_method: 'pin',
    pin_hash: simpleHash('1234'),
  }).select().single()
  console.log('  ✓ Compte marchand créé')

  const { data: tontineYopougon } = await supabase.from('legacy_tontines').insert({
    name: 'Tontine Femmes Yopougon', amount: 5000, frequency: 'hebdomadaire', member_count: 12,
  }).select().single()
  const { data: tontineCocody } = await supabase.from('legacy_tontines').insert({
    name: 'Tontine Marchands Cocody', amount: 10000, member_count: 8,
  }).select().single()
  await supabase.from('legacy_tontine_members').insert([
    { tontine_id: tontineYopougon!.id, merchant_id: 'merchant-1' },
    { tontine_id: tontineCocody!.id, merchant_id: 'merchant-1' },
  ])
  console.log('  ✓ 2 tontines créées, marchand de démo inscrit')

  // ===== 0bis. Producteur (demo producteur account) =====
  console.log('\n🌾 Création du compte producteur de démonstration...')
  await supabase.from('producers').insert({
    id: 'producteur-1',
    first_name: 'Kouadio',
    phone: normalizePhone('07 44 44 44 44'),
    auth_method: 'pin',
    pin_hash: simpleHash('0000'),
  }).select().single()
  console.log('  ✓ Compte producteur créé')

  // ===== 1. BoUser =====
  console.log('\n👤 Création des 7 comptes Backoffice...')
  const hashedBoUsers = BO_USERS.map((u) => ({ ...u, password_hash: hashPassword(u.password_hash) }))
  await supabase.from('bo_users').insert(hashedBoUsers as any)
  const { data: createdUsers } = await supabase.from('bo_users').select('*')
  console.log(`  ✓ ${createdUsers?.length} utilisateurs créés`)

  // ===== 2. BoZone =====
  console.log('\n🗺️ Création des 8 zones...')
  await supabase.from('legacy_bo_zones').insert(
    ZONES.map((z) => ({
      name: z.name,
      region: z.region,
      identificateur_count: z.identificateur_count,
      actor_count: z.actor_count,
      target: z.target,
      is_active: true,
    })),
  )
  const { data: createdZones } = await supabase.from('legacy_bo_zones').select('*')
  console.log(`  ✓ ${createdZones?.length} zones créées`)

  // ===== 3. BoActor =====
  console.log('\n🎭 Création des 28 acteurs...')
  await supabase.from('legacy_bo_actors').insert(
    ACTORS.map((a, i) => {
      const user = createdUsers![i % createdUsers!.length]
      const identificateur = identificateurForZone(a.zone, createdUsers!)
      return {
        ...a,
        identificateur_id: identificateur.id,
        identificateur_name: identificateur.name,
        validated_by: a.status === 'actif' ? user.name : null,
        validated_at: a.status === 'actif' ? daysAgo(randomInt(1, 60)).toISOString() : null,
      }
    }),
  )
  const { data: createdActors } = await supabase.from('legacy_bo_actors').select('*')
  console.log(`  ✓ ${createdActors?.length} acteurs créés`)

  // ===== 4. BoEnrolment =====
  console.log('\n📋 Création des 18 inscriptions...')
  await supabase.from('legacy_bo_enrolments').insert([
    { dossier_id: 'DOS-2025-001', actor_name: 'Awa KONÉ', actor_type: 'marchand', zone: 'Adjamé', identificateur_name: 'Fatou SORO', phone: '07 12 34 56 78', status: 'valide', has_photo: true, has_gps: true, submitted_at: daysAgo(28).toISOString(), validated_by: 'Koffi YAO', validated_at: daysAgo(26).toISOString() },
    { dossier_id: 'DOS-2025-002', actor_name: 'Ibrahim TRAORÉ', actor_type: 'marchand', zone: 'Adjamé', identificateur_name: 'Fatou SORO', phone: '05 23 45 67 89', status: 'valide', has_photo: true, has_gps: true, submitted_at: daysAgo(25).toISOString(), validated_by: 'Fatou SORO', validated_at: daysAgo(23).toISOString() },
    { dossier_id: 'DOS-2025-003', actor_name: 'Moussa DIALLO', actor_type: 'producteur', zone: 'Bouaké', identificateur_name: 'Affi COULIBALY', phone: '01 34 56 78 90', status: 'valide', has_photo: true, has_gps: false, submitted_at: daysAgo(22).toISOString(), validated_by: 'Affi COULIBALY', validated_at: daysAgo(20).toISOString() },
    { dossier_id: 'DOS-2025-004', actor_name: 'Aminata CAMARA', actor_type: 'cooperatif', zone: 'Cocody', identificateur_name: 'Awa KONÉ', phone: '04 45 67 89 01', status: 'valide', has_photo: false, has_gps: true, submitted_at: daysAgo(20).toISOString(), validated_by: 'Koffi YAO', validated_at: daysAgo(18).toISOString() },
    { dossier_id: 'DOS-2025-005', actor_name: 'Fatoumata KEITA', actor_type: 'marchand', zone: 'Yopougon', identificateur_name: 'Ibrahim TRAORÉ', phone: '07 56 78 90 12', status: 'valide', has_photo: true, has_gps: true, submitted_at: daysAgo(18).toISOString(), validated_by: 'Aminata KONÉ', validated_at: daysAgo(16).toISOString() },
    { dossier_id: 'DOS-2025-006', actor_name: 'Drissa SANGARÉ', actor_type: 'marchand', zone: 'Marcory', identificateur_name: 'Fatou SORO', phone: '05 67 89 01 23', status: 'rejete', has_photo: false, has_gps: false, submitted_at: daysAgo(16).toISOString(), validated_by: 'Koffi YAO', validated_at: daysAgo(14).toISOString(), reject_reason: 'Documents incomplets' },
    { dossier_id: 'DOS-2025-007', actor_name: 'Adama OUATTARA', actor_type: 'producteur', zone: 'Bouaké', identificateur_name: 'Affi COULIBALY', phone: '01 78 90 12 34', status: 'valide', has_photo: true, has_gps: true, submitted_at: daysAgo(14).toISOString(), validated_by: 'Affi COULIBALY', validated_at: daysAgo(12).toISOString() },
    { dossier_id: 'DOS-2025-008', actor_name: 'Mariam DIABATÉ', actor_type: 'marchand', zone: 'Kong', identificateur_name: 'Moussa DIALLO', phone: '04 89 01 23 45', status: 'en_attente', has_photo: true, has_gps: false, submitted_at: daysAgo(10).toISOString() },
    { dossier_id: 'DOS-2025-009', actor_name: 'Seydou DEMÉLÉ', actor_type: 'cooperatif', zone: 'Korhogo', identificateur_name: 'Ibrahim TRAORÉ', phone: '07 90 12 34 56', status: 'info_demandee', has_photo: true, has_gps: true, submitted_at: daysAgo(9).toISOString() },
    { dossier_id: 'DOS-2025-010', actor_name: 'Salimata CISSÉ', actor_type: 'marchand', zone: 'San-Pédro', identificateur_name: 'Awa KONÉ', phone: '05 01 23 45 67', status: 'valide', has_photo: true, has_gps: true, submitted_at: daysAgo(8).toISOString(), validated_by: 'Aminata KONÉ', validated_at: daysAgo(6).toISOString() },
    { dossier_id: 'DOS-2025-011', actor_name: 'Bakary KONATÉ', actor_type: 'producteur', zone: 'Adjamé', identificateur_name: 'Fatou SORO', phone: '01 12 34 56 78', status: 'valide', has_photo: false, has_gps: true, submitted_at: daysAgo(7).toISOString(), validated_by: 'Fatou SORO', validated_at: daysAgo(5).toISOString() },
    { dossier_id: 'DOS-2025-012', actor_name: 'Oumou TOURÉ', actor_type: 'marchand', zone: 'Cocody', identificateur_name: 'Awa KONÉ', phone: '04 23 45 67 89', status: 'en_attente', has_photo: true, has_gps: false, submitted_at: daysAgo(5).toISOString() },
    { dossier_id: 'DOS-2025-013', actor_name: 'Lassina COULIBALY', actor_type: 'marchand', zone: 'Yopougon', identificateur_name: 'Ibrahim TRAORÉ', phone: '07 34 56 78 90', status: 'valide', has_photo: true, has_gps: true, submitted_at: daysAgo(4).toISOString(), validated_by: 'Jean KOUADIO', validated_at: daysAgo(2).toISOString() },
    { dossier_id: 'DOS-2025-014', actor_name: 'Fanta BAMBA', actor_type: 'producteur', zone: 'Bouaké', identificateur_name: 'Affi COULIBALY', phone: '05 45 67 89 01', status: 'valide', has_photo: true, has_gps: false, submitted_at: daysAgo(3).toISOString(), validated_by: 'Affi COULIBALY', validated_at: daysAgo(1).toISOString() },
    { dossier_id: 'DOS-2025-015', actor_name: 'Cheick DIALLO', actor_type: 'marchand', zone: 'Marcory', identificateur_name: 'Fatou SORO', phone: '01 56 78 90 12', status: 'en_attente', has_photo: false, has_gps: true, submitted_at: daysAgo(2).toISOString() },
    { dossier_id: 'DOS-2025-016', actor_name: 'Kadiatou SANGARÉ', actor_type: 'cooperatif', zone: 'Korhogo', identificateur_name: 'Ibrahim TRAORÉ', phone: '04 67 89 01 23', status: 'rejete', has_photo: true, has_gps: false, submitted_at: daysAgo(2).toISOString(), validated_by: 'Moussa TRAORÉ', validated_at: daysAgo(1).toISOString(), reject_reason: 'Zone non couverte' },
    { dossier_id: 'DOS-2025-017', actor_name: 'Aboubacar DIARRA', actor_type: 'marchand', zone: 'San-Pédro', identificateur_name: 'Awa KONÉ', phone: '07 78 90 12 34', status: 'en_attente', has_photo: true, has_gps: true, submitted_at: daysAgo(1).toISOString() },
    { dossier_id: 'DOS-2025-018', actor_name: 'Ramatoulaye KEITA', actor_type: 'producteur', zone: 'Adjamé', identificateur_name: 'Fatou SORO', phone: '05 89 01 23 45', status: 'info_demandee', has_photo: false, has_gps: false, submitted_at: daysAgo(0).toISOString() },
  ])
  console.log('  ✓ 18 inscriptions créées')

  // ===== 5. BoMission =====
  console.log('\n🎯 Création des 7 missions...')
  await supabase.from('legacy_bo_missions').insert([
    { title: 'Identification Adjamé Phase 1', description: 'Identifier 50 marchands dans la zone Adjamé avant fin mars', zone: 'Adjamé', assignee_id: createdUsers![3]?.id, assignee_name: 'Fatou SORO', status: 'en_cours', target_count: 50, current_count: 32, start_date: daysAgo(45).toISOString(), end_date: daysAgo(-15).toISOString() },
    { title: 'Recensement Bouaké', description: 'Couverture complète de la zone Bouaké', zone: 'Bouaké', assignee_id: createdUsers![5]?.id, assignee_name: 'Affi COULIBALY', status: 'en_cours', target_count: 40, current_count: 22, start_date: daysAgo(30).toISOString(), end_date: daysAgo(-20).toISOString() },
    { title: 'Déploiement Kong', description: 'Premier déploiement dans la zone de Kong', zone: 'Kong', assignee_id: createdUsers![6]?.id, assignee_name: 'Yao KONAN', status: 'suspendue', target_count: 25, current_count: 8, start_date: daysAgo(60).toISOString(), end_date: daysAgo(-10).toISOString() },
    { title: 'Vérification Cocody', description: 'Vérification et validation des dossiers soumis à Cocody', zone: 'Cocody', assignee_id: createdUsers![1]?.id, assignee_name: 'Koffi YAO', status: 'en_cours', target_count: 30, current_count: 14, start_date: daysAgo(20).toISOString(), end_date: daysAgo(-10).toISOString() },
    { title: 'Expansion San-Pédro', description: 'Extension de la couverture à San-Pédro', zone: 'San-Pédro', assignee_id: createdUsers![2]?.id, assignee_name: 'Moussa TRAORÉ', status: 'terminee', target_count: 20, current_count: 20, start_date: daysAgo(55).toISOString(), end_date: daysAgo(5).toISOString() },
    { title: 'Identification Yopougon', description: 'Identification des acteurs informels de Yopougon', zone: 'Yopougon', assignee_id: createdUsers![4]?.id, assignee_name: 'Jean KOUADIO', status: 'en_cours', target_count: 35, current_count: 19, start_date: daysAgo(15).toISOString() },
    { title: 'Audit Korhogo', description: 'Audit et mise à jour des données de Korhogo', zone: 'Korhogo', assignee_id: createdUsers![2]?.id, assignee_name: 'Moussa TRAORÉ', status: 'terminee', target_count: 15, current_count: 15, start_date: daysAgo(40).toISOString(), end_date: daysAgo(10).toISOString() },
  ])
  console.log('  ✓ 7 missions créées')

  // ===== 6. BoAlert =====
  console.log('\n🚨 Création des 8 alertes...')
  await supabase.from('legacy_bo_alertes').insert([
    { severity: 'critique', title: 'Échec synchronisation API DGE', message: 'La synchronisation avec l\'API de la DGE a échoué 3 fois consécutives.', module: 'enrôlement', acknowledged: false },
    { severity: 'haute', title: 'Tentative d\'intrusion détectée', message: 'Plusieurs tentatives de connexion échouées depuis l\'IP 192.168.45.102.', module: 'auth', acknowledged: false },
    { severity: 'moyenne', title: 'Taux de validation en baisse', message: 'Le taux de validation des inscriptions est passé sous 70% cette semaine.', module: 'enrôlement', acknowledged: false },
    { severity: 'haute', title: 'Latence API élevée', message: 'Le temps de réponse moyen de l\'API dépasse 2 secondes depuis 30 minutes.', module: 'système', acknowledged: true },
    { severity: 'basse', title: 'Mise à jour disponible', message: 'Une nouvelle version de la plateforme Jùlaba (v2.3.0) est disponible.', module: 'système', acknowledged: true },
    { severity: 'moyenne', title: 'Échec paiement Keiwa', message: 'Un paiement de 150,000 FCFA a échoué pour le compte de Fatoumata KEITA.', module: 'paiement', acknowledged: false },
    { severity: 'critique', title: 'Stockage à 90%', message: 'L\'espace de stockage des pièces jointes atteint 90% de sa capacité.', module: 'système', acknowledged: false },
    { severity: 'basse', title: 'Zone Kong inactive', message: 'Aucune activité d\'identification depuis 7 jours dans la zone Kong.', module: 'enrôlement', acknowledged: false },
  ])
  console.log('  ✓ 8 alertes créées')

  // ===== 7. BoKeiwaAccount =====
  console.log('\n💰 Création des 8 comptes Keiwa...')
  const keiwaData = [
    { holder_name: 'Awa KONÉ', holder_phone: '07 12 34 56 78', zone: 'Adjamé', balance: 350000, transaction_count: 45, is_active: true },
    { holder_name: 'Ibrahim TRAORÉ', holder_phone: '05 23 45 67 89', zone: 'Adjamé', balance: 125000, transaction_count: 22, is_active: true },
    { holder_name: 'Moussa DIALLO', holder_phone: '01 34 56 78 90', zone: 'Bouaké', balance: 5000000, transaction_count: 200, is_active: true },
    { holder_name: 'Aminata CAMARA', holder_phone: '04 45 67 89 01', zone: 'Cocody', balance: 85000, transaction_count: 12, is_active: true },
    { holder_name: 'Fatoumata KEITA', holder_phone: '07 56 78 90 12', zone: 'Yopougon', balance: 1200000, transaction_count: 87, is_active: true },
    { holder_name: 'Drissa SANGARÉ', holder_phone: '05 67 89 01 23', zone: 'Marcory', balance: 50000, transaction_count: 5, is_active: false },
    { holder_name: 'Adama OUATTARA', holder_phone: '01 78 90 12 34', zone: 'Bouaké', balance: 680000, transaction_count: 34, is_active: true },
    { holder_name: 'Salimata CISSÉ', holder_phone: '05 01 23 45 67', zone: 'San-Pédro', balance: 250000, transaction_count: 56, is_active: true },
  ]
  await supabase.from('legacy_bo_keiwa_accounts').insert(keiwaData)
  const { data: createdKeiwaAccounts } = await supabase.from('legacy_bo_keiwa_accounts').select('*')
  console.log(`  ✓ ${createdKeiwaAccounts?.length} comptes Keiwa créés`)

  // ===== 8. BoKeiwaTransaction (35 txns, last 7 days) =====
  console.log('\n💸 Création des 35 transactions Keiwa (7 derniers jours)...')
  const txTypes = ['depot', 'retrait', 'transfert']
  const txNames = ['Awa KONÉ', 'Ibrahim TRAORÉ', 'Moussa DIALLO', 'Aminata CAMARA', 'Fatoumata KEITA', 'Drissa SANGARÉ', 'Adama OUATTARA', 'Salimata CISSÉ', 'Bakary KONATÉ', 'Lassina COULIBALY']
  const txStatuses = ['termine', 'termine', 'termine', 'termine', 'termine', 'en_cours', 'echoue']
  const transactionData: any[] = []
  for (let i = 0; i < 35; i++) {
    const account = createdKeiwaAccounts![i % createdKeiwaAccounts!.length]
    const txType = randomFrom(txTypes)
    const sender_name = txType !== 'depot' ? randomFrom(txNames) : null
    const sender_phone = sender_name ? randomPhone() : null
    const recipient_name = txType !== 'retrait' ? randomFrom(txNames) : null
    const recipient_phone = recipient_name ? randomPhone() : null
    transactionData.push({
      type: txType,
      amount: randomInt(5000, 500000),
      sender_name,
      sender_phone,
      recipient_name,
      recipient_phone,
      account_id: account.id,
      status: randomFrom(txStatuses),
      created_at: daysAgo(randomInt(0, 6)).toISOString(),
    })
  }
  await supabase.from('legacy_bo_keiwa_transactions').insert(transactionData)
  console.log(`  ✓ ${transactionData.length} transactions Keiwa créées`)

  // ===== 9. BoPlatformConfig =====
  console.log('\n⚙️ Création des 3 configurations plateforme...')
  await supabase.from('legacy_bo_platform_configs').insert([
    { category: 'national_target', config: JSON.stringify({ enrolmentTarget: 15000, year: 2026 }) },
    { category: 'institution', config: JSON.stringify({ name: 'Jùlaba - Plateforme Nationale d\'Identification Informelle', address: 'Avenue Franchet d\'Espérey, Abidjan Plateau, Côte d\'Ivoire', phone: '+225 20 20 30 40', email: 'contact@julaba.ci', website: 'https://www.julaba.ci', siret: 'CI-ABJ-2025-001' }) },
    { category: 'system_health', config: JSON.stringify([
      { name: 'Plateforme', status: 'OK', latency: 45 },
      { name: 'API Gateway', status: 'OK', latency: 12 },
      { name: 'Base de donnees', status: 'OK', latency: 8 },
      { name: 'Keiwa Wallet', status: 'OK', latency: 89 },
      { name: 'SMS Provider', status: 'Lent', latency: 234 },
      { name: 'Push Notifications', status: 'OK', latency: 56 },
    ]) },
  ])
  console.log('  ✓ 3 configurations créées')

  // ===== 10. BoSystemEvent (55 events, last 24h) =====
  console.log('\n📊 Création des 55 événements système (24 dernières heures)...')
  const systemEvents = [
    { level: 'INFO', source: 'auth-service', message: 'Connexion réussie de Fatou SORO (fatou@julaba.ci) depuis 192.168.1.45' },
    { level: 'INFO', source: 'api-gateway', message: 'Requête GET /api/backoffice/dashboard traitée en 34ms' },
    { level: 'INFO', source: 'notification-service', message: 'Enrôlement DOS-2025-019 soumis par Jean KOUADIO pour la zone Adjamé' },
    { level: 'WARN', source: 'api-gateway', message: 'Latence élevée détectée sur /api/actors - 1250ms (seuil: 500ms)' },
    { level: 'INFO', source: 'notification-service', message: 'SMS de confirmation envoyé à 07 12 34 56 78 (statut: délivré)' },
    { level: 'DEBUG', source: 'database', message: 'Connexion pool: 8/20 connexions actives, 0 en attente' },
    { level: 'INFO', source: 'scheduler', message: 'Tâche planifiée cache:stats exécutée (durée: 152ms)' },
    { level: 'INFO', source: 'auth-service', message: 'Connexion réussie de Koffi YAO (koffi@julaba.ci) depuis 192.168.1.12' },
    { level: 'INFO', source: 'enrôlement', message: 'Dossier DOS-2025-018 validé par Aminata KONÉ' },
    { level: 'WARN', source: 'file-storage', message: 'Espace de stockage à 87% - nettoyage automatique planifié' },
    { level: 'INFO', source: 'payment-service', message: 'Dépôt de 200,000 FCFA effectué sur le compte de Moussa DIALLO' },
    { level: 'INFO', source: 'api-gateway', message: 'Requête POST /api/enrolments/validate traitée en 89ms' },
    { level: 'INFO', source: 'notification-service', message: 'Push notification envoyée à 340 utilisateurs (zone Adjamé)' },
    { level: 'DEBUG', source: 'ml-inference', message: 'Modèle de détection de fraude exécuté - score moyen: 0.12' },
    { level: 'INFO', source: 'auth-service', message: 'Déconnexion de Jean KOUADIO (jean@julaba.ci)' },
    { level: 'INFO', source: 'enrôlement', message: 'Nouveau dossier DOS-2025-017 créé par Awa KONÉ' },
    { level: 'ERROR', source: 'notification-service', message: 'Échec de l\'envoi SMS batch - provider Orange indisponible (tentative 2/3)' },
    { level: 'INFO', source: 'database', message: 'Migration automatique des données d\'audit terminée (234 enregistrements)' },
    { level: 'INFO', source: 'payment-service', message: 'Transfert de 75,000 FCFA de Awa KONÉ vers Ibrahim TRAORÉ' },
    { level: 'WARN', source: 'api-gateway', message: 'Taux d\'erreur 5xx à 2.1% sur les 15 dernières minutes (seuil: 1%)' },
    { level: 'INFO', source: 'scheduler', message: 'Rapport quotidien des inscriptions généré et envoyé aux admins' },
    { level: 'INFO', source: 'auth-service', message: 'Connexion réussie de Moussa TRAORÉ (moussa@dge.ci) depuis 10.0.0.5' },
    { level: 'INFO', source: 'enrôlement', message: 'Enrôlement DOS-2025-016 rejeté par Moussa TRAORÉ - zone non couverte' },
    { level: 'INFO', source: 'file-storage', message: 'Upload photo acteur #M-0025 (Mamadou DIALLO) - 2.3 MB' },
    { level: 'INFO', source: 'api-gateway', message: 'Requête GET /api/backoffice/actors?page=2 traitée en 23ms' },
    { level: 'ERROR', source: 'database', message: 'Timeout de requête (30s) sur la table BoActor - retry automatique réussi' },
    { level: 'INFO', source: 'notification-service', message: 'Email de rappel envoyé à 5 identificateurs inactifs' },
    { level: 'WARN', source: 'payment-service', message: 'Paiement de 150,000 FCFA échoué pour Fatoumata KEITA - solde insuffisant' },
    { level: 'INFO', source: 'scheduler', message: 'Tâche cleanup:sessions exécutée - 23 sessions expirées supprimées' },
    { level: 'DEBUG', source: 'ml-inference', message: 'Prédiction de churn exécutée pour 450 acteurs - risque moyen détecté pour 12' },
    { level: 'INFO', source: 'auth-service', message: 'Connexion réussie de Affi COULIBALY (affi@julaba.ci) depuis 192.168.2.30' },
    { level: 'INFO', source: 'enrôlement', message: 'Dossier DOS-2025-015 soumis par Fatou SORO pour Cheick DIALLO (Marcory)' },
    { level: 'INFO', source: 'database', message: 'Backup automatique quotidien terminé - taille: 234 MB' },
    { level: 'WARN', source: 'file-storage', message: 'Latence élevée sur le bucket S3 - upload moyen: 1.2s (normal: 200ms)' },
    { level: 'INFO', source: 'api-gateway', message: 'Requête PUT /api/actors/M-0006 traitée en 56ms' },
    { level: 'INFO', source: 'payment-service', message: 'Retrait de 50,000 FCFA par Drissa SANGARÉ' },
    { level: 'INFO', source: 'notification-service', message: 'SMS de rappel envoyé à 89 marchands (zone Bouaké)' },
    { level: 'ERROR', source: 'scheduler', message: 'Échec de la tâche integrity:check - erreur de connexion à la réplique secondaire' },
    { level: 'INFO', source: 'auth-service', message: 'Tentative de connexion échouée pour inconnu@julaba.ci - IP bloquée' },
    { level: 'INFO', source: 'enrôlement', message: 'Dossier DOS-2025-014 validé par Affi COULIBALY' },
    { level: 'INFO', source: 'database', message: 'Index créé sur la colonne BoActor.zone - durée: 3.2s' },
    { level: 'INFO', source: 'api-gateway', message: 'Requête POST /api/enrolments/batch traitée en 456ms' },
    { level: 'WARN', source: 'notification-service', message: 'Taux de délivrance SMS à 78% (normal: >90%) - provider MTN instable' },
    { level: 'INFO', source: 'scheduler', message: 'Tâche sync:dge exécutée - 45 enregistrements synchronisés' },
    { level: 'DEBUG', source: 'ml-inference', message: 'Entraînement incrémental du modèle de classification - accuracy: 94.2%' },
    { level: 'INFO', source: 'payment-service', message: 'Dépôt de 500,000 FCFA sur le compte de Moussa DIALLO' },
    { level: 'INFO', source: 'auth-service', message: 'Connexion réussie de Aminata KONÉ (aminata@julaba.ci) depuis 10.0.0.1' },
    { level: 'INFO', source: 'enrôlement', message: 'Dossier DOS-2025-013 validé par Jean KOUADIO' },
    { level: 'INFO', source: 'file-storage', message: 'Nettoyage des fichiers temporaires - 1.2 GB libérés' },
    { level: 'ERROR', source: 'api-gateway', message: 'Erreur 502 sur le proxy reverse - upstream timeout après 30s' },
    { level: 'INFO', source: 'notification-service', message: 'Rapport hebdomadaire des zones envoyé à 6 gestionnaires' },
    { level: 'INFO', source: 'database', message: 'Vérification d\'intégrité terminée - 0 anomalie détectée' },
    { level: 'INFO', source: 'scheduler', message: 'Tâche scores:calculate exécutée - 28 scores mis à jour' },
    { level: 'WARN', source: 'payment-service', message: 'Taux de rejet de 3.2% sur les transactions des 6 dernières heures' },
  ]
  const hourOffsets = systemEvents.map((_, i) => Math.round((i / (systemEvents.length - 1)) * 24))
  await supabase.from('legacy_bo_system_events').insert(
    systemEvents.map((evt, i) => ({
      ...evt,
      created_at: hoursAgo(hourOffsets[i]).toISOString(),
    })),
  )
  console.log(`  ✓ ${systemEvents.length} événements système créés`)

  // ===== 11. BoInstitution =====
  console.log('\n🏢 Création des 5 institutions...')
  await supabase.from('legacy_bo_institutions').insert([
    { name: 'Direction Générale de l\'Économie', type: 'DGE', contact_name: 'M. Bamba Soro', contact_email: 'dge@gouv.ci', contact_phone: '20 20 30 40', address: 'Abidjan Plateau', linked_actors: 150, is_active: true },
    { name: 'Agence Nationale de la Statistique', type: 'ANSUT', contact_name: 'Mme Awa Konaté', contact_email: 'ansut@gouv.ci', contact_phone: '20 20 30 41', address: 'Abidjan Cocody', linked_actors: 89, is_active: true },
    { name: 'Caisse Nationale de Prévoyance Sociale', type: 'CNPS', contact_name: 'M. Yao Koffi', contact_email: 'cnps@gouv.ci', contact_phone: '20 20 30 42', address: 'Abidjan Adjamé', linked_actors: 234, is_active: true },
    { name: 'Caisse Nationale d\'Assurance Maladie', type: 'CNAM', contact_name: 'Mme Djénéba Cissé', contact_email: 'cnam@gouv.ci', contact_phone: '20 20 30 43', address: 'Abidjan Plateau', linked_actors: 67, is_active: true },
    { name: 'Ministère de l\'Agriculture', type: 'MINAGRI', contact_name: 'M. Ouattara Dramane', contact_email: 'minagri@gouv.ci', contact_phone: '20 20 30 44', address: 'Abidjan Plateau', linked_actors: 312, is_active: true },
  ])
  console.log('  ✓ 5 institutions créées')

  // ===== 12. BoApiKey =====
  console.log('\n🔑 Création des 5 clés API...')
  await supabase.from('bo_api_keys').insert([
    { name: 'DGE Integration', description: 'Export des indicateurs vers la Direction Générale des Entreprises', ...seedApiKey('dge'), permissions: 'read', request_count: 1234, last_used_at: daysAgo(0).toISOString(), is_active: true, created_by: 'Aminata KONÉ', expires_at: daysAgo(-180).toISOString() },
    { name: 'ANSUT Export', description: 'Synchronisation des zones couvertes avec l\'ANSUT', ...seedApiKey('ansut'), permissions: 'read', request_count: 567, last_used_at: daysAgo(1).toISOString(), is_active: true, created_by: 'Koffi YAO', expires_at: daysAgo(-90).toISOString() },
    { name: 'Keiwa Production', description: 'Intégration paiements Keiwa', ...seedApiKey('keiwa'), permissions: 'write', request_count: 8901, last_used_at: daysAgo(0).toISOString(), is_active: true, created_by: 'Aminata KONÉ', expires_at: daysAgo(-365).toISOString() },
    { name: 'Test Dev', description: 'Clé de test pour l\'équipe technique', ...seedApiKey('test'), permissions: 'admin', request_count: 234, last_used_at: daysAgo(2).toISOString(), is_active: false, created_by: 'Koffi YAO', expires_at: daysAgo(-30).toISOString() },
    { name: 'Mobile App v2', description: 'Application mobile marchand/producteur', ...seedApiKey('mobile'), permissions: 'write', request_count: 15678, last_used_at: daysAgo(0).toISOString(), is_active: true, created_by: 'Aminata KONÉ', expires_at: daysAgo(-365).toISOString() },
  ])
  console.log('  ✓ 5 clés API créées')

  // ===== 13. BoCronJob =====
  console.log('\n⏰ Création des 5 tâches planifiées...')
  await supabase.from('legacy_bo_cron_jobs').insert([
    { name: 'Synchronisation DGE', schedule: '0 6 * * *', command: 'sync:dge', status: 'actif', last_run_at: daysAgo(0).toISOString(), next_run_at: daysAgo(-1).toISOString(), duration_ms: 2340, run_count: 45, avg_duration_ms: 2100 },
    { name: 'Nettoyage sessions', schedule: '0 3 * * *', command: 'cleanup:sessions', status: 'actif', last_run_at: daysAgo(0).toISOString(), next_run_at: daysAgo(-1).toISOString(), duration_ms: 890, run_count: 60, avg_duration_ms: 950 },
    { name: 'Calcul scores de crédit', schedule: '0 2 * * 1', command: 'scores:calculate', status: 'actif', last_run_at: daysAgo(3).toISOString(), next_run_at: daysAgo(-4).toISOString(), duration_ms: 15600, run_count: 8, avg_duration_ms: 14200 },
    { name: 'Rapport hebdomadaire', schedule: '0 8 * * 1', command: 'report:weekly', status: 'actif', last_run_at: daysAgo(5).toISOString(), next_run_at: daysAgo(-2).toISOString(), duration_ms: 3200, run_count: 12, avg_duration_ms: 3000 },
    { name: 'Sauvegarde BDD', schedule: '0 1 * * *', command: 'backup:db', status: 'actif', last_run_at: daysAgo(0).toISOString(), next_run_at: daysAgo(-1).toISOString(), duration_ms: 8900, run_count: 90, avg_duration_ms: 8500 },
  ])
  console.log('  ✓ 5 tâches planifiées créées')

  // ===== 14. BoCommunication =====
  console.log('\n📢 Création des 5 communications...')
  await supabase.from('legacy_bo_communications').insert([
    { title: 'Rappel inscription', type: 'sms', content: 'N\'oubliez pas de compléter votre inscription Jùlaba avant le 30 du mois.', target_group: 'tous', status: 'envoyee', sent_count: 1250, delivery_rate: 0.92, sent_at: daysAgo(3).toISOString() },
    { title: 'Nouvelle fonctionnalité Keiwa', type: 'push', content: 'Découvrez Keiwa Wallet - votre portefeuille mobile!', target_group: 'marchands', status: 'envoyee', sent_count: 890, delivery_rate: 0.87, sent_at: daysAgo(1).toISOString() },
    { title: 'Maintenance prévue', type: 'sms', content: 'Maintenance système le samedi 15 mars de 2h à 6h.', target_group: 'tous', status: 'programmee', sent_count: 0 },
    { title: 'Formation identificateurs Adjamé', type: 'email', content: 'Vous êtes invité à la formation du 20 mars à la DGE.', target_group: 'zone_specifique', target_zone: 'Adjamé', status: 'envoyee', sent_count: 12, delivery_rate: 1.0, sent_at: daysAgo(5).toISOString() },
    { title: 'Enquête satisfaction Q1', type: 'sms', content: 'Répondez OUI pour participer à notre enquête de satisfaction.', target_group: 'marchands', status: 'envoyee', sent_count: 750, delivery_rate: 0.78, sent_at: daysAgo(7).toISOString() },
  ])
  console.log('  ✓ 5 communications créées')

  // ===== 15. BoModerationReport =====
  console.log('\n🛡️ Création des 5 rapports de modération...')
  await supabase.from('legacy_bo_moderation_reports').insert([
    { target_type: 'actor', target_id: createdActors![8]?.id, target_name: 'Seydou DEMÉLÉ', reason: 'Informations suspectes sur l\'identité', severity: 'haute', status: 'en_attente', reported_by: 'Fatou SORO' },
    { target_type: 'contenu', target_id: 'content-1', target_name: 'Guide de validation', reason: 'Contenu obsolète', severity: 'basse', status: 'traitee', reported_by: 'Koffi YAO' },
    { target_type: 'communication', target_id: null, target_name: 'SMS de masse', reason: 'Message hors sujet envoyé aux marchands', severity: 'critique', status: 'en_attente', reported_by: 'Affi COULIBALY' },
    { target_type: 'actor', target_id: createdActors![14]?.id, target_name: 'Cheick DIALLO', reason: 'Doublon suspect avec un autre acteur', severity: 'moyenne', status: 'ignoree', reported_by: 'Moussa TRAORÉ' },
    { target_type: 'contenu', target_id: 'content-3', target_name: 'FAQ inscription', reason: 'Information incorrecte sur les tarifs', severity: 'moyenne', status: 'traitee', reported_by: 'Jean KOUADIO' },
  ])
  console.log('  ✓ 5 rapports de modération créés')

  // ===== 16. BoMutation =====
  console.log('\n🔄 Création des 5 mutations...')
  await supabase.from('legacy_bo_mutations').insert([
    { actor_id: createdActors![0]?.actor_id || '#M-0001', actor_name: 'Awa KONÉ', from_zone: 'Adjamé', to_zone: 'Cocody', reason: 'Déménagement du commerce', status: 'en_attente', requested_by: 'Fatou SORO' },
    { actor_id: createdActors![4]?.actor_id || '#M-0005', actor_name: 'Fatoumata KEITA', from_zone: 'Yopougon', to_zone: 'Marcory', reason: 'Rapprochement famille', status: 'approuvee', requested_by: 'Jean KOUADIO', processed_by: 'Koffi YAO', processed_at: daysAgo(2).toISOString() },
    { actor_id: createdActors![2]?.actor_id || '#P-0003', actor_name: 'Moussa DIALLO', from_zone: 'Bouaké', to_zone: 'Korhogo', reason: 'Opportunité commerciale', status: 'refusee', requested_by: 'Affi COULIBALY', processed_by: 'Aminata KONÉ', processed_at: daysAgo(1).toISOString() },
    { actor_id: createdActors![9]?.actor_id || '#M-0010', actor_name: 'Salimata CISSÉ', from_zone: 'San-Pédro', to_zone: 'Adjamé', reason: 'Nouveau marché', status: 'en_attente', requested_by: 'Moussa TRAORÉ' },
    { actor_id: createdActors![7]?.actor_id || '#M-0008', actor_name: 'Mariam DIABATÉ', from_zone: 'Kong', to_zone: 'Bouaké', reason: 'Mutualisation des ressources', status: 'approuvee', requested_by: 'Yao KONAN', processed_by: 'Affi COULIBALY', processed_at: daysAgo(5).toISOString() },
  ])
  console.log('  ✓ 5 mutations créées')

  // ===== 17. BoDelivery =====
  console.log('\n📦 Création des 5 livraisons...')
  await supabase.from('legacy_bo_deliveries').insert([
    { order_id: 'ORD-2001', sender_name: 'Awa KONÉ', sender_phone: '07 12 34 56 78', recipient_name: 'Ibrahim TRAORÉ', recipient_phone: '05 23 45 67 89', address: 'Marché Adjamé, lot 45', zone: 'Adjamé', status: 'livree', courier_name: 'Kouassi Express', pickup_at: daysAgo(2).toISOString(), delivered_at: daysAgo(1).toISOString() },
    { order_id: 'ORD-2002', sender_name: 'Moussa DIALLO', sender_phone: '01 34 56 78 90', recipient_name: 'Fatoumata KEITA', recipient_phone: '07 56 78 90 12', address: 'Zone commerciale Bouaké', zone: 'Bouaké', status: 'en_transit', courier_name: 'Rapido Delivery', pickup_at: daysAgo(0).toISOString() },
    { order_id: 'ORD-2003', sender_name: 'Aminata CAMARA', sender_phone: '04 45 67 89 01', recipient_name: 'Bakary KONATÉ', recipient_phone: '01 12 34 56 78', address: 'Cocody Carrefour', zone: 'Cocody', status: 'en_attente' },
    { order_id: 'ORD-2004', sender_name: 'Adama OUATTARA', sender_phone: '01 78 90 12 34', recipient_name: 'Lassina COULIBALY', recipient_phone: '07 34 56 78 90', address: 'Marché de Yopougon', zone: 'Yopougon', status: 'livree', courier_name: 'Abidjan Livraison', pickup_at: daysAgo(3).toISOString(), delivered_at: daysAgo(2).toISOString() },
    { order_id: 'ORD-2005', sender_name: 'Salimata CISSÉ', sender_phone: '05 01 23 45 67', recipient_name: 'Fanta BAMBA', recipient_phone: '05 45 67 89 01', address: 'Port de San-Pédro', zone: 'San-Pédro', status: 'echouee', courier_name: 'Kouassi Express', pickup_at: daysAgo(1).toISOString() },
  ])
  console.log('  ✓ 5 livraisons créées')

  // ===== 18. BoContent (Académie) =====
  console.log('\n📄 Création des 15 contenus académie...')
  await supabase.from('legacy_bo_contents').insert([
    { title: 'Bien démarrer avec Jùlaba', type: 'tutoriels', category: 'Onboarding', excerpt: 'Découvrez les étapes essentielles pour configurer votre compte et commencer à utiliser la plateforme.', content: '# Bien démarrer avec Jùlaba\n\n## Étape 1 : Créez votre compte\nRenseignez votre numéro de téléphone et créez un code PIN sécurisé.\n\n## Étape 2 : Complétez votre profil\nAjoutez votre nom, prénom et zone d\'activité.\n\n## Étape 3 : Explorez les fonctionnalités\nNaviguez dans le menu principal pour découvrir les différentes options disponibles.\n\n## Étape 4 : Connectez-vous à votre first vente\nEnregistrez votre première transaction pour activer votre score crédit.', author: 'Aminata KONÉ', status: 'publie', difficulty: 'debutant', duration: '10 min', target_role: 'marchand', sort_order: 1, view_count: 1247 },
    { title: 'Gérer votre stock quotidiennement', type: 'tutoriels', category: 'Stock', excerpt: 'Apprenez à enregistrer, suivre et optimiser la gestion de vos produits en stock.', content: '# Gestion du stock\n\n## Ajouter un produit\n1. Allez dans l\'onglet Stock\n2. Cliquez sur "Ajouter un produit"\n3. Renseignez le nom, le prix et la quantité\n\n## Mettre à jour les quantités\nÀ chaque vente, le stock se met à jour automatiquement.\n\n## Alertes de stock bas\nConfigurez un seuil minimum pour recevoir des alertes quand un produit est presque épuisé.', author: 'Fatou SORO', status: 'publie', difficulty: 'debutant', duration: '15 min', target_role: 'marchand', sort_order: 2, view_count: 892 },
    { title: 'Utiliser Keiwa pour vos paiements', type: 'tutoriels', category: 'Paiements', excerpt: 'Maîtrisez le portefeuille numérique Keiwa : envoi, réception et historique des transactions.', content: '# Keiwa - Portefeuille numérique\n\n## Consulter votre solde\nVotre solde Keiwa est affiché sur votre tableau de bord.\n\n## Envoyer de l\'argent\n1. Sélectionnez "Envoyer"\n2. Entrez le numéro du destinataire\n3. Saisissez le montant\n4. Confirmez avec votre PIN\n\n## Historique des transactions\nConsultez toutes vos transactions dans l\'onglet Historique Keiwa.', author: 'Koffi YAO', status: 'publie', difficulty: 'debutant', duration: '10 min', target_role: 'marchand', sort_order: 3, view_count: 1534 },
    { title: 'Comprendre votre score crédit', type: 'tutoriels', category: 'Scoring', excerpt: 'Découvrez comment votre score crédit est calculé et comment l\'améliorer.', content: '# Score Crédit Jùlaba\n\n## Comment est calculé votre score ?\nVotre score dépend de :\n- La régularité de vos transactions\n- Le volume de vos ventes\n- L\'ancienneté de votre compte\n- Les remboursements de tontines\n\n## Améliorer son score\n- Enregistrez vos ventes régulièrement\n- Participez activement aux tontines\n- Maintenez un solde Keiwa positif', author: 'Aminata KONÉ', status: 'publie', difficulty: 'intermediaire', duration: '20 min', target_role: 'marchand', sort_order: 4, view_count: 2103 },
    { title: 'Guide complet de l\'enrôlement', type: 'tutoriels', category: 'Onboarding', excerpt: 'Processus détaillé d\'enrôlement des acteurs : de la soumission à la validation.', content: '# Guide d\'enrôlement\n\n## Pour les identificateurs\n1. Ouvrez l\'application identificateur\n2. Scannez le QR code ou saisissez le téléphone\n3. Complétez la fiche d\'identification\n4. Prenez la photo et géolocalisez\n5. Soumettez le dossier\n\n## Validation\nLe gestionnaire de zone examine le dossier sous 48h.\n\n## Rejet\nEn cas de rejet, consultez le motif et corrigez les informations.', author: 'Jean KOUADIO', status: 'publie', difficulty: 'intermediaire', duration: '25 min', target_role: 'identificateur', sort_order: 5, view_count: 678 },
    { title: 'Optimiser vos ventes au marché', type: 'tutoriels', category: 'Ventes', excerpt: 'Conseils pratiques pour maximiser vos revenus grâce aux outils Jùlaba.', content: '# Optimiser vos ventes\n\n## Suivi des ventes\nEnregistrez chaque transaction pour avoir une vue claire de vos revenus.\n\n## Tontines\nRejoignez une tontine pour accéder à du crédit et développer votre activité.\n\n## Marketplace\nVendez vos produits sur la marketplace Jùlaba pour toucher plus de clients.\n\n## Conseils\n- Fixez des prix compétitifs\n- Maintenez un stock suffisant\n- Fidélisez vos clients réguliers', author: 'Fatou SORO', status: 'publie', difficulty: 'avance', duration: '30 min', target_role: 'marchand', sort_order: 6, view_count: 456 },
    { title: 'Configurer votre compte producteur', type: 'tutoriels', category: 'Onboarding', excerpt: 'Guide spécifique pour les producteurs : mise en place du profil et gestion des récoltes.', content: '# Producteur sur Jùlaba\n\n## Créer votre profil\n1. Sélectionnez "Producteur" lors de l\'inscription\n2. Ajoutez vos cultures principales\n3. Indiquez votre superficie\n\n## Gérer les récoltes\nEnregistrez vos récoltes avec le poids et la qualité.\n\n## Vendre en gros\nAccédez aux acheteurs en gros via la marketplace.', author: 'Affi COULIBALY', status: 'publie', difficulty: 'debutant', duration: '15 min', target_role: 'producteur', sort_order: 7, view_count: 321 },
    { title: 'Comment réinitialiser mon code PIN ?', type: 'faq', category: 'Sécurité', excerpt: 'Procédure de réinitialisation du code PIN en cas d\'oubli.', content: '# Réinitialisation du PIN\n\n## Depuis l\'application\n1. Sur l\'écran de connexion, appuyez sur "PIN oublié"\n2. Entrez votre numéro de téléphone\n3. Vous recevrez un code OTP par SMS\n4. Saisissez le code et créez un nouveau PIN\n\n## Depuis le backoffice\nLe gestionnaire de zone peut réinitialiser le PIN d\'un acteur de sa zone.', author: 'Koffi YAO', status: 'publie', difficulty: 'debutant', duration: '5 min', target_role: 'tous', sort_order: 8, view_count: 3421 },
    { title: 'Que faire en cas de connexion impossible ?', type: 'faq', category: 'Support', excerpt: 'Solutions aux problèmes de connexion les plus fréquents.', content: '# Connexion impossible\n\n## Vérifications\n- Vérifiez votre connexion internet\n- Vérifiez que votre numéro est correct\n- Assurez-vous que votre compte est actif\n\n## Compte verrouillé\nAprès 5 tentatives échouées, votre compte est verrouillé 15 minutes.\n\n## Contact support\nSi le problème persiste, contactez le support via l\'onglet Aide.', author: 'Moussa TRAORÉ', status: 'publie', difficulty: 'debutant', duration: '5 min', target_role: 'tous', sort_order: 9, view_count: 2876 },
    { title: 'Comment devenir identificateur ?', type: 'faq', category: 'Général', excerpt: 'Conditions et processus pour devenir identificateur Jùlaba.', content: '# Devenir identificateur\n\n## Conditions\n- Être majeur (18+)\n- Avoir un smartphone compatible\n- Résider dans une zone couverte par Jùlaba\n- Avoir une bonne réputation dans la communauté\n\n## Processus\n1. Contactez votre gestionnaire de zone\n2. Soumettez votre candidature\n3. Formation de 2 jours\n4. Validation et activation du compte', author: 'Aminata KONÉ', status: 'publie', difficulty: 'debutant', duration: '5 min', target_role: 'tous', sort_order: 10, view_count: 1543 },
    { title: 'Les tontines fonctionnent-elles en ligne ?', type: 'faq', category: 'Technique', excerpt: 'Informations sur le fonctionnement des tontines numériques Jùlaba.', content: '# Tontines numériques\n\n## Principe\nLes tontines Jùlaba fonctionnent en mode hybride :\n- Les cotisations sont enregistrées en ligne\n- Les paiements peuvent être effectués via Keiwa\n- Les réunions restent en présentiel\n\n## Fréquence\nChoisissez entre hebdomadaire, bimensuel ou mensuel.\n\n## Montant\nLe montant est fixé par le groupe lors de la création.', author: 'Fatou SORO', status: 'publie', difficulty: 'debutant', duration: '5 min', target_role: 'marchand', sort_order: 11, view_count: 987 },
    { title: 'Comment contacter le support technique ?', type: 'faq', category: 'Support', excerpt: 'Différents moyens de joindre l\'équipe support Jùlaba.', content: '# Contacter le support\n\n## Via l\'application\n1. Allez dans Menu > Aide\n2. Sélectionnez votre problème\n3. Un agent vous répondra sous 24h\n\n## Par téléphone\nAppelez le +225 27 20 25 80 00 (lundi-vendredi, 8h-18h)\n\n## Par email\nEnvoyez un email à support@julaba.ci\n\n## Urgence\nEn cas de problème de sécurité, appelez le +225 07 08 09 10 11 (24h/24)', author: 'Jean KOUADIO', status: 'publie', difficulty: 'debutant', duration: '5 min', target_role: 'tous', sort_order: 12, view_count: 1234 },
    { title: 'Jùlaba atteint 50 000 acteurs identifiés', type: 'articles', category: 'Actualité', excerpt: 'Un cap historique pour le programme national d\'identification de l\'économie informelle.', content: '# 50 000 acteurs identifiés\n\n## Un succès national\nLa plateforme Jùlaba a franchi le cap des 50 000 acteurs identifiés à travers la Côte d\'Ivoire.\n\n## Répartition géographique\n- Adjamé : 12 000 acteurs\n- Yopougon : 9 500 acteurs\n- Bouaké : 7 200 acteurs\n- Cocody : 6 800 acteurs\n- Autres zones : 14 500 acteurs\n\n## Impact\nCette identification permet un meilleur accès aux services financiers et au marché pour les acteurs de l\'économie informelle.', author: 'Aminata KONÉ', status: 'publie', difficulty: 'debutant', duration: '10 min', target_role: 'tous', sort_order: 13, view_count: 4532 },
    { title: 'Lancement de la formation Keiwa avancée', type: 'articles', category: 'Guide', excerpt: 'Nouveau module de formation pour maîtriser toutes les fonctionnalités de Keiwa.', content: '# Formation Keiwa Avancée\n\n## Nouveau module disponible\nDécouvrez les fonctionnalités avancées de Keiwa :\n- Virements groupés\n- Paiements récurrents\n- Gestion multi-comptes\n- Tableau de bord financier\n\n## Inscription\nLa formation est gratuite et accessible depuis l\'Académie.\n\n## Durée\n4 modules de 20 minutes chacun.\n\n## Certification\nObtenez votre badge "Keiwa Expert" à l\'issue de la formation.', author: 'Koffi YAO', status: 'publie', difficulty: 'intermediaire', duration: '20 min', target_role: 'marchand', sort_order: 14, view_count: 1876 },
    { title: 'Guide du producteur : vendre en gros sur Jùlaba', type: 'articles', category: 'Conseil', excerpt: 'Comment les producteurs peuvent accéder aux marchés en gros via la plateforme.', content: '# Vendre en gros sur Jùlaba\n\n## Pour les producteurs\nLa marketplace Jùlaba offre désormais la possibilité de vendre en gros.\n\n## Étapes\n1. Créez votre profil producteur\n2. Ajoutez vos produits avec photos\n3. Fixez les prix wholesale\n4. Les acheteurs en gros vous contacteront directement\n\n## Avantages\n- Accès à un réseau national d\'acheteurs\n- Paiement sécurisé via Keiwa\n- Livraison organisée', author: 'Affi COULIBALY', status: 'brouillon', difficulty: 'intermediaire', duration: '15 min', target_role: 'producteur', sort_order: 15, view_count: 0 },
  ])
  console.log('  ✓ 15 contenus académie créés')

  // ===== 19. BoCreditScore =====
  console.log('\n📊 Création des 5 scores de crédit...')
  await supabase.from('legacy_bo_credit_scores').insert([
    { actor_id: '#M-0001', actor_name: 'Awa KONÉ', zone: 'Adjamé', score: 820, risk_level: 'faible', credit_limit: 500000, last_calculated_at: daysAgo(1).toISOString() },
    { actor_id: '#M-0005', actor_name: 'Fatoumata KEITA', zone: 'Yopougon', score: 680, risk_level: 'moyen', credit_limit: 200000, last_calculated_at: daysAgo(2).toISOString() },
    { actor_id: '#M-0008', actor_name: 'Mariam DIABATÉ', zone: 'Kong', score: 450, risk_level: 'eleve', credit_limit: 50000, last_calculated_at: daysAgo(3).toISOString() },
    { actor_id: '#P-0003', actor_name: 'Moussa DIALLO', zone: 'Bouaké', score: 910, risk_level: 'faible', credit_limit: 500000, last_calculated_at: daysAgo(0).toISOString() },
    { actor_id: '#M-0015', actor_name: 'Cheick DIALLO', zone: 'Marcory', score: 250, risk_level: 'critique', credit_limit: 0, last_calculated_at: daysAgo(5).toISOString() },
  ])
  console.log('  ✓ 5 scores de crédit créés')

  // ===== 20. AuditLog (50 entries across multiple modules for analytics) =====
  console.log('\n📝 Création des 50 journaux d\'audit...')
  const auditModules = ['authentification', 'acteurs', 'zones', 'missions', 'parametres', 'enrolment', 'paiement', 'communication']
  const auditActions = ['connexion', 'deconnexion', 'creation', 'modification', 'suppression', 'validation', 'rejet', 'export', 'consultation']
  await supabase.from('legacy_audit_logs').insert(
    Array.from({ length: 50 }, (_, i) => {
      const user = createdUsers![i % createdUsers!.length]
      return {
        user_id: user.id,
        user_name: user.name,
        user_email: user.email,
        action: randomFrom(auditActions),
        module: randomFrom(auditModules),
        details: JSON.stringify({ route: '/backoffice/' + randomFrom(auditModules) }),
        ip_address: `192.168.${randomInt(1, 255)}.${randomInt(1, 255)}`,
        created_at: daysAgo(randomInt(0, 30)).toISOString(),
      }
    }),
  )
  console.log('  ✓ 50 journaux d\'audit créés')

  console.log('\n✅ Seed terminé avec succès!')
}

main()
  .catch((e) => {
    console.error('Erreur lors du seed:', e)
    process.exit(1)
  })
