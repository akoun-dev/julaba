import { db } from '../src/lib/db'
import { Prisma } from '@prisma/client'
import { hashPassword } from '../src/lib/backoffice-auth/password'

// ============ HELPERS ============

const PHONE_PREFIXES = ['07', '05', '01', '04']

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

// Same non-cryptographic hash as auth-screen.tsx's simpleHash() — server
// never verifies this field today (marchand auth is entirely local), it's
// only seeded here for consistency with what a real registration would store.
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return hash.toString()
}

// Picks the real BoUser to record as an actor's identificateur, so
// identificateurId (the FK) and identificateurName (the display cache) can
// never drift apart the way free-text names used to. Prefers a field agent
// assigned to the actor's own zone; zones without one fall back to the
// admin_general account, who oversees enrolment nationally in this seed.
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
  { email: 'aminata@julaba.ci', passwordHash: 'admin123', name: 'Aminata KONÉ', role: 'super_admin', zone: null, isActive: true },
  { email: 'koffi@julaba.ci', passwordHash: 'admin123', name: 'Koffi YAO', role: 'admin_general', zone: null, isActive: true },
  { email: 'moussa@dge.ci', passwordHash: 'admin123', name: 'Moussa TRAORÉ', role: 'admin_national', zone: 'National', isActive: true },
  { email: 'fatou@julaba.ci', passwordHash: 'admin123', name: 'Fatou SORO', role: 'gestionnaire_zone', zone: 'Adjamé', isActive: true },
  { email: 'jean@julaba.ci', passwordHash: 'admin123', name: 'Jean KOUADIO', role: 'operateur_terrain', zone: 'Adjamé', isActive: true },
  { email: 'affi@julaba.ci', passwordHash: 'admin123', name: 'Affi COULIBALY', role: 'gestionnaire_zone', zone: 'Bouaké', isActive: true },
  { email: 'yao@julaba.ci', passwordHash: 'admin123', name: 'Yao KONAN', role: 'operateur_terrain', zone: 'Kong', isActive: false },
]

const ZONES = [
  { name: 'Adjamé', region: 'Abidjan', identificateurCount: 42, actorCount: 340, target: 2000 },
  { name: 'Cocody', region: 'Abidjan', identificateurCount: 28, actorCount: 215, target: 1500 },
  { name: 'Yopougon', region: 'Abidjan', identificateurCount: 35, actorCount: 280, target: 2500 },
  { name: 'Marcory', region: 'Abidjan', identificateurCount: 18, actorCount: 125, target: 800 },
  { name: 'Bouaké', region: 'Centre', identificateurCount: 22, actorCount: 190, target: 1200 },
  { name: 'Kong', region: 'Savanes', identificateurCount: 10, actorCount: 25, target: 500 },
  { name: 'Korhogo', region: 'Savanes', identificateurCount: 15, actorCount: 85, target: 800 },
  { name: 'San-Pédro', region: 'Bas-Sassandra', identificateurCount: 12, actorCount: 60, target: 600 },
]

const ACTORS = [
  { actorId: '#M-0001', firstName: 'Awa', lastName: 'KONÉ', type: 'marchand', phone: '07 12 34 56 78', zone: 'Adjamé', status: 'actif', photoUrl: '/photos/awa-kone.jpg', gpsLat: 5.3600, gpsLng: -4.0083, identificateurName: 'Fatou SORO' },
  { actorId: '#M-0002', firstName: 'Ibrahim', lastName: 'TRAORÉ', type: 'marchand', phone: '05 23 45 67 89', zone: 'Adjamé', status: 'actif', gpsLat: 5.3610, gpsLng: -4.0090, identificateurName: 'Fatou SORO' },
  { actorId: '#P-0003', firstName: 'Moussa', lastName: 'DIALLO', type: 'producteur', phone: '01 34 56 78 90', zone: 'Bouaké', status: 'actif', photoUrl: '/photos/moussa-diallo.jpg', gpsLat: 7.6941, gpsLng: -5.0303, identificateurName: 'Affi COULIBALY' },
  { actorId: '#C-0004', firstName: 'Aminata', lastName: 'CAMARA', type: 'cooperatif', phone: '04 45 67 89 01', zone: 'Cocody', status: 'actif', gpsLat: 5.3450, gpsLng: -3.9600, identificateurName: 'Awa KONÉ' },
  { actorId: '#M-0005', firstName: 'Fatoumata', lastName: 'KEITA', type: 'marchand', phone: '07 56 78 90 12', zone: 'Yopougon', status: 'actif', photoUrl: '/photos/fatoumata-keita.jpg', identificateurName: 'Ibrahim TRAORÉ' },
  { actorId: '#M-0006', firstName: 'Drissa', lastName: 'SANGARÉ', type: 'marchand', phone: '05 67 89 01 23', zone: 'Marcory', status: 'actif', gpsLat: 5.3300, gpsLng: -3.9700, identificateurName: 'Fatou SORO' },
  { actorId: '#P-0007', firstName: 'Adama', lastName: 'OUATTARA', type: 'producteur', phone: '01 78 90 12 34', zone: 'Bouaké', status: 'actif', photoUrl: '/photos/adama-ouattara.jpg', gpsLat: 7.7000, gpsLng: -5.0200, identificateurName: 'Affi COULIBALY' },
  { actorId: '#M-0008', firstName: 'Mariam', lastName: 'DIABATÉ', type: 'marchand', phone: '04 89 01 23 45', zone: 'Kong', status: 'actif', identificateurName: 'Moussa DIALLO' },
  { actorId: '#C-0009', firstName: 'Seydou', lastName: 'DEMÉLÉ', type: 'cooperatif', phone: '07 90 12 34 56', zone: 'Korhogo', status: 'suspendu', photoUrl: '/photos/seydou-dembele.jpg', identificateurName: 'Ibrahim TRAORÉ' },
  { actorId: '#M-0010', firstName: 'Salimata', lastName: 'CISSÉ', type: 'marchand', phone: '05 01 23 45 67', zone: 'San-Pédro', status: 'actif', gpsLat: 4.7485, gpsLng: -6.6363, identificateurName: 'Awa KONÉ' },
  { actorId: '#P-0011', firstName: 'Bakary', lastName: 'KONATÉ', type: 'producteur', phone: '01 12 34 56 78', zone: 'Adjamé', status: 'actif', photoUrl: '/photos/bakary-konate.jpg', gpsLat: 5.3580, gpsLng: -4.0050, identificateurName: 'Fatou SORO' },
  { actorId: '#M-0012', firstName: 'Oumou', lastName: 'TOURÉ', type: 'marchand', phone: '04 23 45 67 89', zone: 'Cocody', status: 'en_attente', identificateurName: 'Awa KONÉ' },
  { actorId: '#M-0013', firstName: 'Lassina', lastName: 'COULIBALY', type: 'marchand', phone: '07 34 56 78 90', zone: 'Yopougon', status: 'actif', gpsLat: 5.3550, gpsLng: -4.0800, identificateurName: 'Ibrahim TRAORÉ' },
  { actorId: '#P-0014', firstName: 'Fanta', lastName: 'BAMBA', type: 'producteur', phone: '05 45 67 89 01', zone: 'Bouaké', status: 'actif', photoUrl: '/photos/fanta-bamba.jpg', identificateurName: 'Affi COULIBALY' },
  { actorId: '#M-0015', firstName: 'Cheick', lastName: 'DIALLO', type: 'marchand', phone: '01 56 78 90 12', zone: 'Marcory', status: 'suspendu', identificateurName: 'Fatou SORO' },
  { actorId: '#C-0016', firstName: 'Kadiatou', lastName: 'SANGARÉ', type: 'cooperatif', phone: '04 67 89 01 23', zone: 'Korhogo', status: 'actif', gpsLat: 9.4580, gpsLng: -5.6300, identificateurName: 'Ibrahim TRAORÉ' },
  { actorId: '#M-0017', firstName: 'Aboubacar', lastName: 'DIARRA', type: 'marchand', phone: '07 78 90 12 34', zone: 'San-Pédro', status: 'actif', photoUrl: '/photos/aboubacar-diara.jpg', identificateurName: 'Awa KONÉ' },
  { actorId: '#P-0018', firstName: 'Ramatoulaye', lastName: 'KEITA', type: 'producteur', phone: '05 89 01 23 45', zone: 'Adjamé', status: 'en_attente', identificateurName: 'Fatou SORO' },
  { actorId: '#M-0019', firstName: 'Souleymane', lastName: 'CAMARA', type: 'marchand', phone: '01 90 12 34 56', zone: 'Kong', status: 'actif', gpsLat: 9.0400, gpsLng: -4.5600, identificateurName: 'Moussa DIALLO' },
  { actorId: '#M-0020', firstName: 'Boubacar', lastName: 'OUATTARA', type: 'marchand', phone: '04 01 23 45 67', zone: 'Cocody', status: 'actif', identificateurName: 'Awa KONÉ' },
  { actorId: '#P-0021', firstName: 'Hawa', lastName: 'CISSÉ', type: 'producteur', phone: '07 12 56 78 90', zone: 'Yopougon', status: 'actif', photoUrl: '/photos/hawa-cisse.jpg', gpsLat: 5.3500, gpsLng: -4.0700, identificateurName: 'Ibrahim TRAORÉ' },
  { actorId: '#M-0022', firstName: 'Djénéba', lastName: 'TOURÉ', type: 'marchand', phone: '05 23 67 89 01', zone: 'Bouaké', status: 'actif', identificateurName: 'Affi COULIBALY' },
  { actorId: '#C-0023', firstName: 'Issouf', lastName: 'DEMÉLÉ', type: 'cooperatif', phone: '01 34 78 90 12', zone: 'Marcory', status: 'actif', gpsLat: 5.3350, gpsLng: -3.9650, identificateurName: 'Fatou SORO' },
  { actorId: '#M-0024', firstName: 'Aminata', lastName: 'KONATÉ', type: 'marchand', phone: '04 45 89 01 23', zone: 'Korhogo', status: 'suspendu', identificateurName: 'Ibrahim TRAORÉ' },
  { actorId: '#P-0025', firstName: 'Mamadou', lastName: 'DIALLO', type: 'producteur', phone: '07 56 90 12 34', zone: 'San-Pédro', status: 'actif', photoUrl: '/photos/mamadou-diallo.jpg', gpsLat: 4.7500, gpsLng: -6.6400, identificateurName: 'Awa KONÉ' },
  { actorId: '#M-0026', firstName: 'Fatou', lastName: 'COULIBALY', type: 'marchand', phone: '05 67 01 23 45', zone: 'Adjamé', status: 'actif', identificateurName: 'Fatou SORO' },
  { actorId: '#M-0027', firstName: 'Ibrahim', lastName: 'BAMBA', type: 'marchand', phone: '01 78 12 34 56', zone: 'Yopougon', status: 'en_attente', identificateurName: 'Ibrahim TRAORÉ' },
  { actorId: '#P-0028', firstName: 'Aïcha', lastName: 'SANGARÉ', type: 'producteur', phone: '04 89 23 45 67', zone: 'Bouaké', status: 'actif', photoUrl: '/photos/aicha-sangare.jpg', identificateurName: 'Affi COULIBALY' },
]

// ============ MAIN SEED FUNCTION ============

async function main() {
  console.log('🌱 Suppression des données existantes (ordre inverse de dépendance)...')

  await db.voiceLog.deleteMany()
  await db.tontineContribution.deleteMany()
  await db.tontineMember.deleteMany()
  await db.tontine.deleteMany()
  await db.saleItem.deleteMany()
  await db.sale.deleteMany()
  await db.expense.deleteMany()
  await db.caisseSession.deleteMany()
  await db.product.deleteMany()
  await db.merchant.deleteMany()
  console.log('  ✓ Merchant (marchand)')
  await db.boMfaChallenge.deleteMany()
  await db.boSession.deleteMany()
  await db.auditLog.deleteMany()
  console.log('  ✓ AuditLog')
  await db.boSystemEvent.deleteMany()
  console.log('  ✓ BoSystemEvent')
  await db.boPlatformConfig.deleteMany()
  console.log('  ✓ BoPlatformConfig')
  await db.boKeiwaTransaction.deleteMany()
  console.log('  ✓ BoKeiwaTransaction')
  await db.boKeiwaAccount.deleteMany()
  console.log('  ✓ BoKeiwaAccount')
  await db.boCreditScore.deleteMany()
  console.log('  ✓ BoCreditScore')
  await db.boCronJob.deleteMany()
  console.log('  ✓ BoCronJob')
  await db.boDelivery.deleteMany()
  console.log('  ✓ BoDelivery')
  await db.boApiKey.deleteMany()
  console.log('  ✓ BoApiKey')
  await db.boCommunication.deleteMany()
  console.log('  ✓ BoCommunication')
  await db.boContent.deleteMany()
  console.log('  ✓ BoContent')
  await db.boModerationReport.deleteMany()
  console.log('  ✓ BoModerationReport')
  await db.boMutation.deleteMany()
  console.log('  ✓ BoMutation')
  await db.boInstitution.deleteMany()
  console.log('  ✓ BoInstitution')
  await db.boAlert.deleteMany()
  console.log('  ✓ BoAlert')
  await db.boEnrolment.deleteMany()
  console.log('  ✓ BoEnrolment')
  await db.boMission.deleteMany()
  console.log('  ✓ BoMission')
  await db.boActor.deleteMany()
  console.log('  ✓ BoActor')
  await db.boZone.deleteMany()
  console.log('  ✓ BoZone')
  await db.boUser.deleteMany()
  console.log('  ✓ BoUser')

  // ===== 0. Merchant (demo marchand account) =====
  // 'merchant-1' is the fallback id every marchand screen sends when no real
  // id is set yet (see app-store.ts's merchantId, and every `merchantId ||
  // 'merchant-1'` call site) — without a real row here, every write from the
  // demo account (sale/expense/product) fails its foreign key check and
  // sits in the offline queue forever, even fully online. Phone/PIN match
  // the demo credentials shown on the login screen (07 01 02 03 04 / 1234).
  console.log('\n🏪 Création du compte marchand de démonstration...')
  await db.merchant.create({
    data: {
      id: 'merchant-1',
      firstName: 'Awa',
      lastName: 'KONÉ',
      phone: '07 01 02 03 04',
      authMethod: 'pin',
      pinHash: simpleHash('1234'),
    },
  })
  console.log('  ✓ Compte marchand créé')

  // Two demo tontines with the demo merchant already enrolled — the
  // TontinesScreen UI used to show these as a hardcoded local list with no
  // server counterpart at all (the "Cotiser" button was pure decoration:
  // it just spoke a message, wrote nothing anywhere). These give it real
  // ids to record TontineContribution rows against.
  const tontineYopougon = await db.tontine.create({
    data: { name: 'Tontine Femmes Yopougon', amount: 5000, frequency: 'hebdomadaire', memberCount: 12 },
  })
  const tontineCocody = await db.tontine.create({
    data: { name: 'Tontine Marchands Cocody', amount: 10000, memberCount: 8 },
  })
  await db.tontineMember.createMany({
    data: [
      { tontineId: tontineYopougon.id, merchantId: 'merchant-1' },
      { tontineId: tontineCocody.id, merchantId: 'merchant-1' },
    ],
  })
  console.log('  ✓ 2 tontines créées, marchand de démo inscrit')

  // ===== 1. BoUser =====
  console.log('\n👤 Création des 7 comptes Backoffice...')
  const hashedBoUsers = BO_USERS.map((u) => ({ ...u, passwordHash: hashPassword(u.passwordHash) }))
  await db.boUser.createMany({ data: hashedBoUsers as any })
  const createdUsers = await db.boUser.findMany()
  console.log(`  ✓ ${createdUsers.length} utilisateurs créés`)

  // ===== 2. BoZone =====
  console.log('\n🗺️ Création des 8 zones...')
  await db.boZone.createMany({
    data: ZONES.map((z) => ({
      name: z.name,
      region: z.region,
      identificateurCount: z.identificateurCount,
      actorCount: z.actorCount,
      target: z.target,
      isActive: true,
    })),
  })
  const createdZones = await db.boZone.findMany()
  console.log(`  ✓ ${createdZones.length} zones créées`)

  // ===== 3. BoActor =====
  console.log('\n🎭 Création des 28 acteurs...')
  await db.boActor.createMany({
    data: ACTORS.map((a, i) => {
      const user = createdUsers[i % createdUsers.length]
      const identificateur = identificateurForZone(a.zone, createdUsers)
      return {
        ...a,
        identificateurId: identificateur.id,
        identificateurName: identificateur.name,
        validatedBy: a.status === 'actif' ? user.name : null,
        validatedAt: a.status === 'actif' ? daysAgo(randomInt(1, 60)) : null,
      }
    }),
  })
  const createdActors = await db.boActor.findMany()
  console.log(`  ✓ ${createdActors.length} acteurs créés`)

  // ===== 4. BoEnrolment =====
  console.log('\n📋 Création des 18 inscriptions...')
  await db.boEnrolment.createMany({
    data: [
      { dossierId: 'DOS-2025-001', actorName: 'Awa KONÉ', actorType: 'marchand', zone: 'Adjamé', identificateurName: 'Fatou SORO', phone: '07 12 34 56 78', status: 'valide', hasPhoto: true, hasGps: true, submittedAt: daysAgo(28), validatedBy: 'Koffi YAO', validatedAt: daysAgo(26) },
      { dossierId: 'DOS-2025-002', actorName: 'Ibrahim TRAORÉ', actorType: 'marchand', zone: 'Adjamé', identificateurName: 'Fatou SORO', phone: '05 23 45 67 89', status: 'valide', hasPhoto: true, hasGps: true, submittedAt: daysAgo(25), validatedBy: 'Fatou SORO', validatedAt: daysAgo(23) },
      { dossierId: 'DOS-2025-003', actorName: 'Moussa DIALLO', actorType: 'producteur', zone: 'Bouaké', identificateurName: 'Affi COULIBALY', phone: '01 34 56 78 90', status: 'valide', hasPhoto: true, hasGps: false, submittedAt: daysAgo(22), validatedBy: 'Affi COULIBALY', validatedAt: daysAgo(20) },
      { dossierId: 'DOS-2025-004', actorName: 'Aminata CAMARA', actorType: 'cooperatif', zone: 'Cocody', identificateurName: 'Awa KONÉ', phone: '04 45 67 89 01', status: 'valide', hasPhoto: false, hasGps: true, submittedAt: daysAgo(20), validatedBy: 'Koffi YAO', validatedAt: daysAgo(18) },
      { dossierId: 'DOS-2025-005', actorName: 'Fatoumata KEITA', actorType: 'marchand', zone: 'Yopougon', identificateurName: 'Ibrahim TRAORÉ', phone: '07 56 78 90 12', status: 'valide', hasPhoto: true, hasGps: true, submittedAt: daysAgo(18), validatedBy: 'Aminata KONÉ', validatedAt: daysAgo(16) },
      { dossierId: 'DOS-2025-006', actorName: 'Drissa SANGARÉ', actorType: 'marchand', zone: 'Marcory', identificateurName: 'Fatou SORO', phone: '05 67 89 01 23', status: 'rejete', hasPhoto: false, hasGps: false, submittedAt: daysAgo(16), validatedBy: 'Koffi YAO', validatedAt: daysAgo(14), rejectReason: 'Documents incomplets' },
      { dossierId: 'DOS-2025-007', actorName: 'Adama OUATTARA', actorType: 'producteur', zone: 'Bouaké', identificateurName: 'Affi COULIBALY', phone: '01 78 90 12 34', status: 'valide', hasPhoto: true, hasGps: true, submittedAt: daysAgo(14), validatedBy: 'Affi COULIBALY', validatedAt: daysAgo(12) },
      { dossierId: 'DOS-2025-008', actorName: 'Mariam DIABATÉ', actorType: 'marchand', zone: 'Kong', identificateurName: 'Moussa DIALLO', phone: '04 89 01 23 45', status: 'en_attente', hasPhoto: true, hasGps: false, submittedAt: daysAgo(10) },
      { dossierId: 'DOS-2025-009', actorName: 'Seydou DEMÉLÉ', actorType: 'cooperatif', zone: 'Korhogo', identificateurName: 'Ibrahim TRAORÉ', phone: '07 90 12 34 56', status: 'info_demandee', hasPhoto: true, hasGps: true, submittedAt: daysAgo(9) },
      { dossierId: 'DOS-2025-010', actorName: 'Salimata CISSÉ', actorType: 'marchand', zone: 'San-Pédro', identificateurName: 'Awa KONÉ', phone: '05 01 23 45 67', status: 'valide', hasPhoto: true, hasGps: true, submittedAt: daysAgo(8), validatedBy: 'Aminata KONÉ', validatedAt: daysAgo(6) },
      { dossierId: 'DOS-2025-011', actorName: 'Bakary KONATÉ', actorType: 'producteur', zone: 'Adjamé', identificateurName: 'Fatou SORO', phone: '01 12 34 56 78', status: 'valide', hasPhoto: false, hasGps: true, submittedAt: daysAgo(7), validatedBy: 'Fatou SORO', validatedAt: daysAgo(5) },
      { dossierId: 'DOS-2025-012', actorName: 'Oumou TOURÉ', actorType: 'marchand', zone: 'Cocody', identificateurName: 'Awa KONÉ', phone: '04 23 45 67 89', status: 'en_attente', hasPhoto: true, hasGps: false, submittedAt: daysAgo(5) },
      { dossierId: 'DOS-2025-013', actorName: 'Lassina COULIBALY', actorType: 'marchand', zone: 'Yopougon', identificateurName: 'Ibrahim TRAORÉ', phone: '07 34 56 78 90', status: 'valide', hasPhoto: true, hasGps: true, submittedAt: daysAgo(4), validatedBy: 'Jean KOUADIO', validatedAt: daysAgo(2) },
      { dossierId: 'DOS-2025-014', actorName: 'Fanta BAMBA', actorType: 'producteur', zone: 'Bouaké', identificateurName: 'Affi COULIBALY', phone: '05 45 67 89 01', status: 'valide', hasPhoto: true, hasGps: false, submittedAt: daysAgo(3), validatedBy: 'Affi COULIBALY', validatedAt: daysAgo(1) },
      { dossierId: 'DOS-2025-015', actorName: 'Cheick DIALLO', actorType: 'marchand', zone: 'Marcory', identificateurName: 'Fatou SORO', phone: '01 56 78 90 12', status: 'en_attente', hasPhoto: false, hasGps: true, submittedAt: daysAgo(2) },
      { dossierId: 'DOS-2025-016', actorName: 'Kadiatou SANGARÉ', actorType: 'cooperatif', zone: 'Korhogo', identificateurName: 'Ibrahim TRAORÉ', phone: '04 67 89 01 23', status: 'rejete', hasPhoto: true, hasGps: false, submittedAt: daysAgo(2), validatedBy: 'Moussa TRAORÉ', validatedAt: daysAgo(1), rejectReason: 'Zone non couverte' },
      { dossierId: 'DOS-2025-017', actorName: 'Aboubacar DIARRA', actorType: 'marchand', zone: 'San-Pédro', identificateurName: 'Awa KONÉ', phone: '07 78 90 12 34', status: 'en_attente', hasPhoto: true, hasGps: true, submittedAt: daysAgo(1) },
      { dossierId: 'DOS-2025-018', actorName: 'Ramatoulaye KEITA', actorType: 'producteur', zone: 'Adjamé', identificateurName: 'Fatou SORO', phone: '05 89 01 23 45', status: 'info_demandee', hasPhoto: false, hasGps: false, submittedAt: daysAgo(0) },
    ],
  })
  console.log('  ✓ 18 inscriptions créées')

  // ===== 5. BoMission =====
  console.log('\n🎯 Création des 7 missions...')
  await db.boMission.createMany({
    data: [
      { title: 'Identification Adjamé Phase 1', description: 'Identifier 50 marchands dans la zone Adjamé avant fin mars', zone: 'Adjamé', assigneeId: createdUsers[3]?.id, assigneeName: 'Fatou SORO', status: 'en_cours', targetCount: 50, currentCount: 32, startDate: daysAgo(45), endDate: daysAgo(-15) },
      { title: 'Recensement Bouaké', description: 'Couverture complète de la zone Bouaké', zone: 'Bouaké', assigneeId: createdUsers[5]?.id, assigneeName: 'Affi COULIBALY', status: 'en_cours', targetCount: 40, currentCount: 22, startDate: daysAgo(30), endDate: daysAgo(-20) },
      { title: 'Déploiement Kong', description: 'Premier déploiement dans la zone de Kong', zone: 'Kong', assigneeId: createdUsers[6]?.id, assigneeName: 'Yao KONAN', status: 'suspendue', targetCount: 25, currentCount: 8, startDate: daysAgo(60), endDate: daysAgo(-10) },
      { title: 'Vérification Cocody', description: 'Vérification et validation des dossiers soumis à Cocody', zone: 'Cocody', assigneeId: createdUsers[1]?.id, assigneeName: 'Koffi YAO', status: 'en_cours', targetCount: 30, currentCount: 14, startDate: daysAgo(20), endDate: daysAgo(-10) },
      { title: 'Expansion San-Pédro', description: 'Extension de la couverture à San-Pédro', zone: 'San-Pédro', assigneeId: createdUsers[2]?.id, assigneeName: 'Moussa TRAORÉ', status: 'terminee', targetCount: 20, currentCount: 20, startDate: daysAgo(55), endDate: daysAgo(5) },
      { title: 'Identification Yopougon', description: 'Identification des acteurs informels de Yopougon', zone: 'Yopougon', assigneeId: createdUsers[4]?.id, assigneeName: 'Jean KOUADIO', status: 'en_cours', targetCount: 35, currentCount: 19, startDate: daysAgo(15) },
      { title: 'Audit Korhogo', description: 'Audit et mise à jour des données de Korhogo', zone: 'Korhogo', assigneeId: createdUsers[2]?.id, assigneeName: 'Moussa TRAORÉ', status: 'terminee', targetCount: 15, currentCount: 15, startDate: daysAgo(40), endDate: daysAgo(10) },
    ],
  })
  console.log('  ✓ 7 missions créées')

  // ===== 6. BoAlert =====
  console.log('\n🚨 Création des 8 alertes...')
  await db.boAlert.createMany({
    data: [
      { severity: 'critique', title: 'Échec synchronisation API DGE', message: 'La synchronisation avec l\'API de la DGE a échoué 3 fois consécutives.', module: 'enrôlement', acknowledged: false },
      { severity: 'haute', title: 'Tentative d\'intrusion détectée', message: 'Plusieurs tentatives de connexion échouées depuis l\'IP 192.168.45.102.', module: 'auth', acknowledged: false },
      { severity: 'moyenne', title: 'Taux de validation en baisse', message: 'Le taux de validation des inscriptions est passé sous 70% cette semaine.', module: 'enrôlement', acknowledged: false },
      { severity: 'haute', title: 'Latence API élevée', message: 'Le temps de réponse moyen de l\'API dépasse 2 secondes depuis 30 minutes.', module: 'système', acknowledged: true },
      { severity: 'basse', title: 'Mise à jour disponible', message: 'Une nouvelle version de la plateforme Jùlaba (v2.3.0) est disponible.', module: 'système', acknowledged: true },
      { severity: 'moyenne', title: 'Échec paiement Keiwa', message: 'Un paiement de 150,000 FCFA a échoué pour le compte de Fatoumata KEITA.', module: 'paiement', acknowledged: false },
      { severity: 'critique', title: 'Stockage à 90%', message: 'L\'espace de stockage des pièces jointes atteint 90% de sa capacité.', module: 'système', acknowledged: false },
      { severity: 'basse', title: 'Zone Kong inactive', message: 'Aucune activité d\'identification depuis 7 jours dans la zone Kong.', module: 'enrôlement', acknowledged: false },
    ],
  })
  console.log('  ✓ 8 alertes créées')

  // ===== 7. BoKeiwaAccount =====
  console.log('\n💰 Création des 8 comptes Keiwa...')
  const keiwaData = [
    { holderName: 'Awa KONÉ', holderPhone: '07 12 34 56 78', zone: 'Adjamé', balance: 350000, transactionCount: 45, isActive: true },
    { holderName: 'Ibrahim TRAORÉ', holderPhone: '05 23 45 67 89', zone: 'Adjamé', balance: 125000, transactionCount: 22, isActive: true },
    { holderName: 'Moussa DIALLO', holderPhone: '01 34 56 78 90', zone: 'Bouaké', balance: 5000000, transactionCount: 200, isActive: true },
    { holderName: 'Aminata CAMARA', holderPhone: '04 45 67 89 01', zone: 'Cocody', balance: 85000, transactionCount: 12, isActive: true },
    { holderName: 'Fatoumata KEITA', holderPhone: '07 56 78 90 12', zone: 'Yopougon', balance: 1200000, transactionCount: 87, isActive: true },
    { holderName: 'Drissa SANGARÉ', holderPhone: '05 67 89 01 23', zone: 'Marcory', balance: 50000, transactionCount: 5, isActive: false },
    { holderName: 'Adama OUATTARA', holderPhone: '01 78 90 12 34', zone: 'Bouaké', balance: 680000, transactionCount: 34, isActive: true },
    { holderName: 'Salimata CISSÉ', holderPhone: '05 01 23 45 67', zone: 'San-Pédro', balance: 250000, transactionCount: 56, isActive: true },
  ]
  await db.boKeiwaAccount.createMany({ data: keiwaData })
  const createdKeiwaAccounts = await db.boKeiwaAccount.findMany()
  console.log(`  ✓ ${createdKeiwaAccounts.length} comptes Keiwa créés`)

  // ===== 8. BoKeiwaTransaction (35 txns, last 7 days) =====
  console.log('\n💸 Création des 35 transactions Keiwa (7 derniers jours)...')
  const txTypes = ['depot', 'retrait', 'transfert']
  const txNames = ['Awa KONÉ', 'Ibrahim TRAORÉ', 'Moussa DIALLO', 'Aminata CAMARA', 'Fatoumata KEITA', 'Drissa SANGARÉ', 'Adama OUATTARA', 'Salimata CISSÉ', 'Bakary KONATÉ', 'Lassina COULIBALY']
  const txStatuses = ['termine', 'termine', 'termine', 'termine', 'termine', 'en_cours', 'echoue']
  const transactionData: Prisma.BoKeiwaTransactionCreateManyInput[] = []
  for (let i = 0; i < 35; i++) {
    const account = createdKeiwaAccounts[i % createdKeiwaAccounts.length]
    const txType = randomFrom(txTypes)
    const senderName = txType !== 'depot' ? randomFrom(txNames) : null
    const senderPhone = senderName ? randomPhone() : null
    const recipientName = txType !== 'retrait' ? randomFrom(txNames) : null
    const recipientPhone = recipientName ? randomPhone() : null
    transactionData.push({
      type: txType,
      amount: randomInt(5000, 500000),
      senderName,
      senderPhone,
      recipientName,
      recipientPhone,
      accountId: account.id,
      status: randomFrom(txStatuses),
      createdAt: daysAgo(randomInt(0, 6)),
    })
  }
  await db.boKeiwaTransaction.createMany({ data: transactionData })
  console.log(`  ✓ ${transactionData.length} transactions Keiwa créées`)

  // ===== 9. BoPlatformConfig =====
  console.log('\n⚙️ Création des 3 configurations plateforme...')
  await db.boPlatformConfig.createMany({
    data: [
      { category: 'national_target', config: JSON.stringify({ enrolmentTarget: 15000, year: 2026 }) },
      { category: 'institution', config: JSON.stringify({ name: 'Jùlaba - Plateforme Nationale d\'Identification Informelle', address: 'Avenue Franchet d\'Espérey, Abidjan Plateau, Côte d\'Ivoire', phone: '+225 20 20 30 40', email: 'contact@julaba.ci', website: 'https://www.julaba.ci', siret: 'CI-ABJ-2025-001' }) },
      // system_health stored as array of { name, status, latency } for dashboard compatibility
      { category: 'system_health', config: JSON.stringify([
        { name: 'Plateforme', status: 'OK', latency: 45 },
        { name: 'API Gateway', status: 'OK', latency: 12 },
        { name: 'Base de donnees', status: 'OK', latency: 8 },
        { name: 'Keiwa Wallet', status: 'OK', latency: 89 },
        { name: 'SMS Provider', status: 'Lent', latency: 234 },
        { name: 'Push Notifications', status: 'OK', latency: 56 },
      ]) },
    ],
  })
  console.log('  ✓ 3 configurations créées')

  // ===== 10. BoSystemEvent (55 events, last 24h) =====
  console.log('\n📊 Création des 55 événements système (24 dernières heures)...')
  const systemEvents = [
    // Last 1 hour
    { level: 'INFO', source: 'auth-service', message: 'Connexion réussie de Fatou SORO (fatou@julaba.ci) depuis 192.168.1.45' },
    { level: 'INFO', source: 'api-gateway', message: 'Requête GET /api/backoffice/dashboard traitée en 34ms' },
    { level: 'INFO', source: 'notification-service', message: 'Enrôlement DOS-2025-019 soumis par Jean KOUADIO pour la zone Adjamé' },
    { level: 'WARN', source: 'api-gateway', message: 'Latence élevée détectée sur /api/actors - 1250ms (seuil: 500ms)' },
    { level: 'INFO', source: 'notification-service', message: 'SMS de confirmation envoyé à 07 12 34 56 78 (statut: délivré)' },
    { level: 'DEBUG', source: 'database', message: 'Connexion pool: 8/20 connexions actives, 0 en attente' },
    { level: 'INFO', source: 'scheduler', message: 'Tâche planifiée cache:stats exécutée (durée: 152ms)' },
    // 1-2 hours ago
    { level: 'INFO', source: 'auth-service', message: 'Connexion réussie de Koffi YAO (koffi@julaba.ci) depuis 192.168.1.12' },
    { level: 'INFO', source: 'enrôlement', message: 'Dossier DOS-2025-018 validé par Aminata KONÉ' },
    { level: 'WARN', source: 'file-storage', message: 'Espace de stockage à 87% - nettoyage automatique planifié' },
    { level: 'INFO', source: 'payment-service', message: 'Dépôt de 200,000 FCFA effectué sur le compte de Moussa DIALLO' },
    { level: 'INFO', source: 'api-gateway', message: 'Requête POST /api/enrolments/validate traitée en 89ms' },
    { level: 'INFO', source: 'notification-service', message: 'Push notification envoyée à 340 utilisateurs (zone Adjamé)' },
    { level: 'DEBUG', source: 'ml-inference', message: 'Modèle de détection de fraude exécuté - score moyen: 0.12' },
    // 2-4 hours ago
    { level: 'INFO', source: 'auth-service', message: 'Déconnexion de Jean KOUADIO (jean@julaba.ci)' },
    { level: 'INFO', source: 'enrôlement', message: 'Nouveau dossier DOS-2025-017 créé par Awa KONÉ' },
    { level: 'ERROR', source: 'notification-service', message: 'Échec de l\'envoi SMS batch - provider Orange indisponible (tentative 2/3)' },
    { level: 'INFO', source: 'database', message: 'Migration automatique des données d\'audit terminée (234 enregistrements)' },
    { level: 'INFO', source: 'payment-service', message: 'Transfert de 75,000 FCFA de Awa KONÉ vers Ibrahim TRAORÉ' },
    { level: 'WARN', source: 'api-gateway', message: 'Taux d\'erreur 5xx à 2.1% sur les 15 dernières minutes (seuil: 1%)' },
    { level: 'INFO', source: 'scheduler', message: 'Rapport quotidien des inscriptions généré et envoyé aux admins' },
    // 4-8 hours ago
    { level: 'INFO', source: 'auth-service', message: 'Connexion réussie de Moussa TRAORÉ (moussa@dge.ci) depuis 10.0.0.5' },
    { level: 'INFO', source: 'enrôlement', message: 'Enrôlement DOS-2025-016 rejeté par Moussa TRAORÉ - zone non couverte' },
    { level: 'INFO', source: 'file-storage', message: 'Upload photo acteur #M-0025 (Mamadou DIALLO) - 2.3 MB' },
    { level: 'INFO', source: 'api-gateway', message: 'Requête GET /api/backoffice/actors?page=2 traitée en 23ms' },
    { level: 'ERROR', source: 'database', message: 'Timeout de requête (30s) sur la table BoActor - retry automatique réussi' },
    { level: 'INFO', source: 'notification-service', message: 'Email de rappel envoyé à 5 identificateurs inactifs' },
    { level: 'WARN', source: 'payment-service', message: 'Paiement de 150,000 FCFA échoué pour Fatoumata KEITA - solde insuffisant' },
    { level: 'INFO', source: 'scheduler', message: 'Tâche cleanup:sessions exécutée - 23 sessions expirées supprimées' },
    { level: 'DEBUG', source: 'ml-inference', message: 'Prédiction de churn exécutée pour 450 acteurs - risque moyen détecté pour 12' },
    // 8-12 hours ago
    { level: 'INFO', source: 'auth-service', message: 'Connexion réussie de Affi COULIBALY (affi@julaba.ci) depuis 192.168.2.30' },
    { level: 'INFO', source: 'enrôlement', message: 'Dossier DOS-2025-015 soumis par Fatou SORO pour Cheick DIALLO (Marcory)' },
    { level: 'INFO', source: 'database', message: 'Backup automatique quotidien terminé - taille: 234 MB' },
    { level: 'WARN', source: 'file-storage', message: 'Latence élevée sur le bucket S3 - upload moyen: 1.2s (normal: 200ms)' },
    { level: 'INFO', source: 'api-gateway', message: 'Requête PUT /api/actors/M-0006 traitée en 56ms' },
    { level: 'INFO', source: 'payment-service', message: 'Retrait de 50,000 FCFA par Drissa SANGARÉ' },
    { level: 'INFO', source: 'notification-service', message: 'SMS de rappel envoyé à 89 marchands (zone Bouaké)' },
    { level: 'ERROR', source: 'scheduler', message: 'Échec de la tâche integrity:check - erreur de connexion à la réplique secondaire' },
    // 12-18 hours ago
    { level: 'INFO', source: 'auth-service', message: 'Tentative de connexion échouée pour inconnu@julaba.ci - IP bloquée' },
    { level: 'INFO', source: 'enrôlement', message: 'Dossier DOS-2025-014 validé par Affi COULIBALY' },
    { level: 'INFO', source: 'database', message: 'Index créé sur la colonne BoActor.zone - durée: 3.2s' },
    { level: 'INFO', source: 'api-gateway', message: 'Requête POST /api/enrolments/batch traitée en 456ms' },
    { level: 'WARN', source: 'notification-service', message: 'Taux de délivrance SMS à 78% (normal: >90%) - provider MTN instable' },
    { level: 'INFO', source: 'scheduler', message: 'Tâche sync:dge exécutée - 45 enregistrements synchronisés' },
    { level: 'DEBUG', source: 'ml-inference', message: 'Entraînement incrémental du modèle de classification - accuracy: 94.2%' },
    { level: 'INFO', source: 'payment-service', message: 'Dépôt de 500,000 FCFA sur le compte de Moussa DIALLO' },
    // 18-24 hours ago
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
  await db.boSystemEvent.createMany({
    data: systemEvents.map((evt, i) => ({
      ...evt,
      createdAt: hoursAgo(hourOffsets[i]),
    })),
  })
  console.log(`  ✓ ${systemEvents.length} événements système créés`)

  // ===== 11. BoInstitution =====
  console.log('\n🏢 Création des 5 institutions...')
  await db.boInstitution.createMany({
    data: [
      { name: 'Direction Générale de l\'Économie', type: 'DGE', contactName: 'M. Bamba Soro', contactEmail: 'dge@gouv.ci', contactPhone: '20 20 30 40', address: 'Abidjan Plateau', linkedActors: 150, isActive: true },
      { name: 'Agence Nationale de la Statistique', type: 'ANSUT', contactName: 'Mme Awa Konaté', contactEmail: 'ansut@gouv.ci', contactPhone: '20 20 30 41', address: 'Abidjan Cocody', linkedActors: 89, isActive: true },
      { name: 'Caisse Nationale de Prévoyance Sociale', type: 'CNPS', contactName: 'M. Yao Koffi', contactEmail: 'cnps@gouv.ci', contactPhone: '20 20 30 42', address: 'Abidjan Adjamé', linkedActors: 234, isActive: true },
      { name: 'Caisse Nationale d\'Assurance Maladie', type: 'CNAM', contactName: 'Mme Djénéba Cissé', contactEmail: 'cnam@gouv.ci', contactPhone: '20 20 30 43', address: 'Abidjan Plateau', linkedActors: 67, isActive: true },
      { name: 'Ministère de l\'Agriculture', type: 'MINAGRI', contactName: 'M. Ouattara Dramane', contactEmail: 'minagri@gouv.ci', contactPhone: '20 20 30 44', address: 'Abidjan Plateau', linkedActors: 312, isActive: true },
    ],
  })
  console.log('  ✓ 5 institutions créées')

  // ===== 12. BoApiKey =====
  console.log('\n🔑 Création des 5 clés API...')
  await db.boApiKey.createMany({
    data: [
      { name: 'DGE Integration', key: 'jlb_dge_' + Math.random().toString(36).slice(2, 14), secret: 'sec_' + Math.random().toString(36).slice(2, 18), permissions: 'read', requestCount: 1234, lastUsedAt: daysAgo(0), isActive: true, createdBy: 'Aminata KONÉ', expiresAt: daysAgo(-180) },
      { name: 'ANSUT Export', key: 'jlb_ansut_' + Math.random().toString(36).slice(2, 14), secret: 'sec_' + Math.random().toString(36).slice(2, 18), permissions: 'read', requestCount: 567, lastUsedAt: daysAgo(1), isActive: true, createdBy: 'Koffi YAO', expiresAt: daysAgo(-90) },
      { name: 'Keiwa Production', key: 'jlb_keiwa_' + Math.random().toString(36).slice(2, 14), secret: 'sec_' + Math.random().toString(36).slice(2, 18), permissions: 'write', requestCount: 8901, lastUsedAt: daysAgo(0), isActive: true, createdBy: 'Aminata KONÉ', expiresAt: daysAgo(-365) },
      { name: 'Test Dev', key: 'jlb_test_' + Math.random().toString(36).slice(2, 14), secret: 'sec_' + Math.random().toString(36).slice(2, 18), permissions: 'admin', requestCount: 234, lastUsedAt: daysAgo(2), isActive: false, createdBy: 'Koffi YAO', expiresAt: daysAgo(-30) },
      { name: 'Mobile App v2', key: 'jlb_mobile_' + Math.random().toString(36).slice(2, 14), secret: 'sec_' + Math.random().toString(36).slice(2, 18), permissions: 'write', requestCount: 15678, lastUsedAt: daysAgo(0), isActive: true, createdBy: 'Aminata KONÉ', expiresAt: daysAgo(-365) },
    ],
  })
  console.log('  ✓ 5 clés API créées')

  // ===== 13. BoCronJob =====
  console.log('\n⏰ Création des 5 tâches planifiées...')
  await db.boCronJob.createMany({
    data: [
      { name: 'Synchronisation DGE', schedule: '0 6 * * *', command: 'sync:dge', status: 'actif', lastRunAt: daysAgo(0), nextRunAt: daysAgo(-1), durationMs: 2340, runCount: 45, avgDurationMs: 2100 },
      { name: 'Nettoyage sessions', schedule: '0 3 * * *', command: 'cleanup:sessions', status: 'actif', lastRunAt: daysAgo(0), nextRunAt: daysAgo(-1), durationMs: 890, runCount: 60, avgDurationMs: 950 },
      { name: 'Calcul scores de crédit', schedule: '0 2 * * 1', command: 'scores:calculate', status: 'actif', lastRunAt: daysAgo(3), nextRunAt: daysAgo(-4), durationMs: 15600, runCount: 8, avgDurationMs: 14200 },
      { name: 'Rapport hebdomadaire', schedule: '0 8 * * 1', command: 'report:weekly', status: 'actif', lastRunAt: daysAgo(5), nextRunAt: daysAgo(-2), durationMs: 3200, runCount: 12, avgDurationMs: 3000 },
      { name: 'Sauvegarde BDD', schedule: '0 1 * * *', command: 'backup:db', status: 'actif', lastRunAt: daysAgo(0), nextRunAt: daysAgo(-1), durationMs: 8900, runCount: 90, avgDurationMs: 8500 },
    ],
  })
  console.log('  ✓ 5 tâches planifiées créées')

  // ===== 14. BoCommunication =====
  console.log('\n📢 Création des 5 communications...')
  await db.boCommunication.createMany({
    data: [
      { title: 'Rappel inscription', type: 'sms', content: 'N\'oubliez pas de compléter votre inscription Jùlaba avant le 30 du mois.', targetGroup: 'tous', status: 'envoyee', sentCount: 1250, deliveryRate: 0.92, sentAt: daysAgo(3) },
      { title: 'Nouvelle fonctionnalité Keiwa', type: 'push', content: 'Découvrez Keiwa Wallet - votre portefeuille mobile!', targetGroup: 'marchands', status: 'envoyee', sentCount: 890, deliveryRate: 0.87, sentAt: daysAgo(1) },
      { title: 'Maintenance prévue', type: 'sms', content: 'Maintenance système le samedi 15 mars de 2h à 6h.', targetGroup: 'tous', status: 'programmee', sentCount: 0 },
      { title: 'Formation identificateurs Adjamé', type: 'email', content: 'Vous êtes invité à la formation du 20 mars à la DGE.', targetGroup: 'zone_specifique', targetZone: 'Adjamé', status: 'envoyee', sentCount: 12, deliveryRate: 1.0, sentAt: daysAgo(5) },
      { title: 'Enquête satisfaction Q1', type: 'sms', content: 'Répondez OUI pour participer à notre enquête de satisfaction.', targetGroup: 'marchands', status: 'envoyee', sentCount: 750, deliveryRate: 0.78, sentAt: daysAgo(7) },
    ],
  })
  console.log('  ✓ 5 communications créées')

  // ===== 15. BoModerationReport =====
  console.log('\n🛡️ Création des 5 rapports de modération...')
  await db.boModerationReport.createMany({
    data: [
      { targetType: 'actor', targetId: createdActors[8]?.id, targetName: 'Seydou DEMÉLÉ', reason: 'Informations suspectes sur l\'identité', severity: 'haute', status: 'en_attente', reportedBy: 'Fatou SORO' },
      { targetType: 'contenu', targetId: 'content-1', targetName: 'Guide de validation', reason: 'Contenu obsolète', severity: 'basse', status: 'traitee', reportedBy: 'Koffi YAO' },
      { targetType: 'communication', targetId: null, targetName: 'SMS de masse', reason: 'Message hors sujet envoyé aux marchands', severity: 'critique', status: 'en_attente', reportedBy: 'Affi COULIBALY' },
      { targetType: 'actor', targetId: createdActors[14]?.id, targetName: 'Cheick DIALLO', reason: 'Doublon suspect avec un autre acteur', severity: 'moyenne', status: 'ignoree', reportedBy: 'Moussa TRAORÉ' },
      { targetType: 'contenu', targetId: 'content-3', targetName: 'FAQ inscription', reason: 'Information incorrecte sur les tarifs', severity: 'moyenne', status: 'traitee', reportedBy: 'Jean KOUADIO' },
    ],
  })
  console.log('  ✓ 5 rapports de modération créés')

  // ===== 16. BoMutation =====
  console.log('\n🔄 Création des 5 mutations...')
  await db.boMutation.createMany({
    data: [
      { actorId: createdActors[0]?.actorId || '#M-0001', actorName: 'Awa KONÉ', fromZone: 'Adjamé', toZone: 'Cocody', reason: 'Déménagement du commerce', status: 'en_attente', requestedBy: 'Fatou SORO' },
      { actorId: createdActors[4]?.actorId || '#M-0005', actorName: 'Fatoumata KEITA', fromZone: 'Yopougon', toZone: 'Marcory', reason: 'Rapprochement famille', status: 'approuvee', requestedBy: 'Jean KOUADIO', processedBy: 'Koffi YAO', processedAt: daysAgo(2) },
      { actorId: createdActors[2]?.actorId || '#P-0003', actorName: 'Moussa DIALLO', fromZone: 'Bouaké', toZone: 'Korhogo', reason: 'Opportunité commerciale', status: 'refusee', requestedBy: 'Affi COULIBALY', processedBy: 'Aminata KONÉ', processedAt: daysAgo(1) },
      { actorId: createdActors[9]?.actorId || '#M-0010', actorName: 'Salimata CISSÉ', fromZone: 'San-Pédro', toZone: 'Adjamé', reason: 'Nouveau marché', status: 'en_attente', requestedBy: 'Moussa TRAORÉ' },
      { actorId: createdActors[7]?.actorId || '#M-0008', actorName: 'Mariam DIABATÉ', fromZone: 'Kong', toZone: 'Bouaké', reason: 'Mutualisation des ressources', status: 'approuvee', requestedBy: 'Yao KONAN', processedBy: 'Affi COULIBALY', processedAt: daysAgo(5) },
    ],
  })
  console.log('  ✓ 5 mutations créées')

  // ===== 17. BoDelivery =====
  console.log('\n📦 Création des 5 livraisons...')
  await db.boDelivery.createMany({
    data: [
      { orderId: 'ORD-2001', senderName: 'Awa KONÉ', senderPhone: '07 12 34 56 78', recipientName: 'Ibrahim TRAORÉ', recipientPhone: '05 23 45 67 89', address: 'Marché Adjamé, lot 45', zone: 'Adjamé', status: 'livree', courierName: 'Kouassi Express', pickupAt: daysAgo(2), deliveredAt: daysAgo(1) },
      { orderId: 'ORD-2002', senderName: 'Moussa DIALLO', senderPhone: '01 34 56 78 90', recipientName: 'Fatoumata KEITA', recipientPhone: '07 56 78 90 12', address: 'Zone commerciale Bouaké', zone: 'Bouaké', status: 'en_transit', courierName: 'Rapido Delivery', pickupAt: daysAgo(0) },
      { orderId: 'ORD-2003', senderName: 'Aminata CAMARA', senderPhone: '04 45 67 89 01', recipientName: 'Bakary KONATÉ', recipientPhone: '01 12 34 56 78', address: 'Cocody Carrefour', zone: 'Cocody', status: 'en_attente' },
      { orderId: 'ORD-2004', senderName: 'Adama OUATTARA', senderPhone: '01 78 90 12 34', recipientName: 'Lassina COULIBALY', recipientPhone: '07 34 56 78 90', address: 'Marché de Yopougon', zone: 'Yopougon', status: 'livree', courierName: 'Abidjan Livraison', pickupAt: daysAgo(3), deliveredAt: daysAgo(2) },
      { orderId: 'ORD-2005', senderName: 'Salimata CISSÉ', senderPhone: '05 01 23 45 67', recipientName: 'Fanta BAMBA', recipientPhone: '05 45 67 89 01', address: 'Port de San-Pédro', zone: 'San-Pédro', status: 'echouee', courierName: 'Kouassi Express', pickupAt: daysAgo(1) },
    ],
  })
  console.log('  ✓ 5 livraisons créées')

  // ===== 18. BoContent =====
  console.log('\n📄 Création des 5 contenus...')
  await db.boContent.createMany({
    data: [
      { title: 'Guide de validation des inscriptions', type: 'tutoriel', category: 'inscription', content: '# Guide de validation\n\nCe tutoriel explique comment valider une inscription d\'acteur sur la plateforme Jùlaba. Vérifiez les documents, la photo et les coordonnées GPS.', author: 'Aminata KONÉ', status: 'publie', viewCount: 234 },
      { title: 'FAQ - Questions fréquentes', type: 'faq', category: 'general', content: '## Qu\'est-ce que Jùlaba ?\n\nJùlaba est la plateforme nationale d\'identification des acteurs de l\'économie informelle en Côte d\'Ivoire.', author: 'Koffi YAO', status: 'publie', viewCount: 567 },
      { title: 'Comment utiliser la géolocalisation', type: 'tutoriel', category: 'identification', content: '# Utilisation du GPS\n\nPour activer la géolocalisation, autorisez l\'accès à la localisation dans les paramètres de votre téléphone.', author: 'Jean KOUADIO', status: 'publie', viewCount: 89 },
      { title: 'Règlementation des marchés informels', type: 'reglementation', category: 'juridique', content: '# Cadre réglementaire\n\nLa loi n°2019-875 encadre l\'identification et le suivi des acteurs de l\'économie informelle.', author: 'Aminata KONÉ', status: 'publie', viewCount: 445 },
      { title: 'Procédure de mutation de zone', type: 'tutoriel', category: 'mutation', content: '# Mutation de zone\n\nPour demander une mutation, accédez à la fiche de l\'acteur et cliquez sur "Demander une mutation".', author: 'Fatou SORO', status: 'brouillon', viewCount: 0 },
    ],
  })
  console.log('  ✓ 5 contenus créés')

  // ===== 19. BoCreditScore =====
  console.log('\n📊 Création des 5 scores de crédit...')
  await db.boCreditScore.createMany({
    data: [
      { actorId: '#M-0001', actorName: 'Awa KONÉ', zone: 'Adjamé', score: 820, riskLevel: 'faible', creditLimit: 500000, lastCalculatedAt: daysAgo(1) },
      { actorId: '#M-0005', actorName: 'Fatoumata KEITA', zone: 'Yopougon', score: 680, riskLevel: 'moyen', creditLimit: 200000, lastCalculatedAt: daysAgo(2) },
      { actorId: '#M-0008', actorName: 'Mariam DIABATÉ', zone: 'Kong', score: 450, riskLevel: 'eleve', creditLimit: 50000, lastCalculatedAt: daysAgo(3) },
      { actorId: '#P-0003', actorName: 'Moussa DIALLO', zone: 'Bouaké', score: 910, riskLevel: 'faible', creditLimit: 500000, lastCalculatedAt: daysAgo(0) },
      { actorId: '#M-0015', actorName: 'Cheick DIALLO', zone: 'Marcory', score: 250, riskLevel: 'critique', creditLimit: 0, lastCalculatedAt: daysAgo(5) },
    ],
  })
  console.log('  ✓ 5 scores de crédit créés')

  // ===== 20. AuditLog (50 entries across multiple modules for analytics) =====
  console.log('\n📝 Création des 50 journaux d\'audit...')
  const auditModules = ['authentification', 'acteurs', 'zones', 'missions', 'parametres', 'enrolment', 'paiement', 'communication']
  const auditActions = ['connexion', 'deconnexion', 'creation', 'modification', 'suppression', 'validation', 'rejet', 'export', 'consultation']
  await db.auditLog.createMany({
    data: Array.from({ length: 50 }, (_, i) => {
      const user = createdUsers[i % createdUsers.length]
      return {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        action: randomFrom(auditActions),
        module: randomFrom(auditModules),
        details: JSON.stringify({ route: '/backoffice/' + randomFrom(auditModules) }),
        ipAddress: `192.168.${randomInt(1, 255)}.${randomInt(1, 255)}`,
        createdAt: daysAgo(randomInt(0, 30)),
      }
    }),
  })
  console.log('  ✓ 50 journaux d\'audit créés')

  console.log('\n✅ Seed terminé avec succès!')
}

main()
  .catch((e) => {
    console.error('Erreur lors du seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
