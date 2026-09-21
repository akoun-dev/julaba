'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BarChart3,
  Download,
  FileBarChart,
  FileText,
  Filter,
  LineChart,
  Printer,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useBackofficeStore, type BoActor } from '@/lib/stores/backoffice-store'
import { BoErrorBanner, BoPageHeader } from './bo-ui'

type ChartMode = 'barres' | 'ligne'

const PROFILE_LABELS: Record<string, string> = {
  admin_general: 'Admin général',
  institution: 'Institution',
  producteur: 'Producteur',
  super_admin: 'Super admin',
  cooperateur: 'Coopérateur',
  identificateur: 'Identificateur',
  marchand: 'Marchand',
}

// Rapports générables : chaque entrée est réellement produite à partir des
// données chargées dans le store — l'ancienne liste annonçait des rapports
// (financier, régional) sans aucune source de données, avec des « 12 pages »
// inventées et un bouton qui se contentait de window.print().
type ReportId = 'acteurs' | 'enrolement' | 'audit' | 'cooperatives'

const REPORTS: { id: ReportId; title: string; description: string }[] = [
  { id: 'acteurs', title: 'Rapport Acteurs', description: 'Effectifs par type, zone et statut' },
  { id: 'enrolement', title: 'Rapport Enrôlement', description: 'Dossiers soumis, validés, rejetés, en attente' },
  { id: 'audit', title: 'Rapport Audit', description: 'Actions backoffice récentes' },
  // MODE-946 (AUDIT-003 D-2, DET-COOP-010) — le BO voit enfin le module
  // coopératif : faits agrégés servis par GET /api/backoffice/cooperatives/stats.
  { id: 'cooperatives', title: 'Rapport Coopératives', description: 'Coopératives, membres actifs, trésorerie agrégée, besoins' },
]

/** Faits agrégés du module coopératif (MODE-946) — la réponse SERVEUR fait
 * foi, jamais de chiffre calculé localement. */
interface CoopStats {
  cooperatives: { actives: number; inactives: number }
  membresActifs: number
  tresorerie: { solde: number; totalCotisations: number }
  besoins: { en_attente: number; consolide: number; en_cours: number; livre: number }
  generatedAt: string
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Ouvre une fenêtre d'impression contenant le rapport HTML construit à
 * partir des données réelles — le navigateur propose ensuite
 * « Enregistrer au format PDF ». */
function printReport(title: string, sections: { heading: string; body: string }[]): void {
  const win = window.open('', '_blank', 'width=900,height=650')
  if (!win) return
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<title>${escapeHtml(title)} — Jùlaba</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a202c; margin: 40px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #718096; font-size: 12px; margin-bottom: 28px; }
  h2 { font-size: 15px; margin: 24px 0 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; border-bottom: 2px solid #2d3748; padding: 6px 8px; }
  td { border-bottom: 1px solid #edf2f7; padding: 6px 8px; }
  .kpi { display: inline-block; margin: 0 24px 12px 0; }
  .kpi b { font-size: 20px; display: block; }
  .kpi span { font-size: 11px; color: #718096; }
  footer { margin-top: 36px; font-size: 11px; color: #a0aec0; }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">Jùlaba — généré le ${new Date().toLocaleString('fr-FR')} à partir des données chargées</p>
${sections.map((s) => `<h2>${escapeHtml(s.heading)}</h2>${s.body}`).join('\n')}
<footer>Document généré par le backoffice Jùlaba — utilisez « Enregistrer au format PDF » de la boîte d'impression.</footer>
</body></html>`
  win.document.write(html)
  win.document.close()
  win.focus()
  win.print()
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
}

function downloadCSV(rows: Record<string, string | number>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [headers.join(';'), ...rows.map((row) => headers.map((key) => {
    const value = String(row[key] ?? '').replace(/"/g, '""')
    return `"${value}"`
  }).join(';'))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `julaba-rapports-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function MetricCard({ label, value, detail, isDark }: { label: string; value: string; detail?: string; isDark: boolean }) {
  return (
    <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
      <CardContent className="p-5">
        <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
        <p className={`mt-2 text-2xl font-bold tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{value}</p>
        {detail && <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{detail}</p>}
      </CardContent>
    </Card>
  )
}

function SectionTitle({ icon, children, isDark }: { icon: React.ReactNode; children: React.ReactNode; isDark: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={isDark ? 'text-blue-400' : 'text-blue-600'}>{icon}</span>
      <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{children}</h2>
    </div>
  )
}

export function BoRapportsScreen() {
  const { actors, enrolments, auditLog, boTheme, errors } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const [region, setRegion] = useState('toutes')
  const [period, setPeriod] = useState('30')
  const [chartMode, setChartMode] = useState<ChartMode>('barres')

  // MODE-946 (D-2) — faits coopératifs servis par l'API BO, lus au montage
  // (échec = bannière honnête, jamais de silhouette à zéros inventés).
  const [coopStats, setCoopStats] = useState<CoopStats | null>(null)
  const [coopErreur, setCoopErreur] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    fetch('/api/backoffice/cooperatives/stats')
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: CoopStats) => {
        if (!annule) {
          setCoopStats(data)
          setCoopErreur(null)
        }
      })
      .catch(() => {
        if (!annule) setCoopErreur('Statistiques coopératives indisponibles.')
      })
    return () => { annule = true }
  }, [])

  const regions = useMemo(() => [...new Set(actors.map((actor) => actor.zone).filter(Boolean))].sort(), [actors])
  const filteredActors = useMemo(
    () => {
      const cutoff = Date.now() - Number(period) * 86_400_000
      return actors.filter((actor) =>
        (region === 'toutes' || actor.zone === region) &&
        new Date(actor.createdAt).getTime() >= cutoff
      )
    },
    [actors, region, period]
  )
  const profileCounts = useMemo(() => {
    const counts = new Map<string, number>()
    filteredActors.forEach((actor) => counts.set(actor.type, (counts.get(actor.type) ?? 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [filteredActors])
  const regionRows = useMemo(() => {
    const counts = new Map<string, number>()
    actors.forEach((actor) => counts.set(actor.zone || 'Autre', (counts.get(actor.zone || 'Autre') ?? 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  }, [actors])
  const timeline = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 6 + index, 1)
      const count = filteredActors.filter((actor) => {
        const created = new Date(actor.createdAt)
        return created.getFullYear() === date.getFullYear() && created.getMonth() === date.getMonth()
      }).length
      return { label: monthLabel(date), count }
    })
  }, [filteredActors])
  const maxTimeline = Math.max(1, ...timeline.map((point) => point.count))
  const totalActors = filteredActors.length

  const exportRows = filteredActors.map((actor: BoActor) => ({
    profil: PROFILE_LABELS[actor.type] ?? actor.type,
    nom: `${actor.firstName} ${actor.lastName}`.trim(),
    zone: actor.zone,
    statut: actor.status,
    telephone: actor.phone,
    date: actor.createdAt,
  }))

  // --- Générateurs de rapports (données réelles du store) ---
  const kpiTable = (rows: [string, string | number][]) =>
    `<table><tbody>${rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td><b>${escapeHtml(String(v))}</b></td></tr>`).join('')}</tbody></table>`

  const buildReportSections = (id: ReportId, coop: CoopStats | null = coopStats) => {
    if (id === 'cooperatives') {
      // MODE-946 (D-2) — rapport coopératif : faits servis par l'API BO.
      if (!coop) {
        return [{ heading: 'Coopératives', body: '<p>Statistiques non chargées — réessayez.</p>' }]
      }
      const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`
      const besoins = coop.besoins
      return [
        { heading: "Vue d'ensemble", body: kpiTable([
          ['Coopératives actives', coop.cooperatives.actives],
          ['Coopératives inactives', coop.cooperatives.inactives],
          ['Membres actifs', coop.membresActifs],
          ['Trésorerie agrégée', fcfa(coop.tresorerie.solde)],
          ['Total cotisations', fcfa(coop.tresorerie.totalCotisations)],
        ]) },
        { heading: 'Besoins par statut', body: `<table><tbody>${[
          ['En attente', besoins.en_attente],
          ['Consolidés', besoins.consolide],
          ['En cours', besoins.en_cours],
          ['Livrés', besoins.livre],
        ].map(([k, v]) => `<tr><td>${escapeHtml(String(k))}</td><td><b>${String(v)}</b></td></tr>`).join('')}</tbody></table>` },
      ]
    }
    if (id === 'acteurs') {
      const byType = profileCounts.map(([type, count]) => [PROFILE_LABELS[type] ?? type, count] as [string, number])
      const byZone = regionRows
      const actifs = actors.filter((a) => a.status === 'actif').length
      const suspendus = actors.filter((a) => a.status === 'suspendu').length
      return [
        { heading: 'Vue d\'ensemble', body: kpiTable([['Total acteurs', totalActors], ['Actifs', actifs], ['Suspendus', suspendus]]) },
        { heading: "Répartition par type d'acteur", body: `<table><thead><tr><th>Type</th><th>Effectif</th></tr></thead><tbody>${byType.map(([t, c]) => `<tr><td>${t}</td><td>${c}</td></tr>`).join('')}</tbody></table>` },
        { heading: 'Top zones', body: `<table><thead><tr><th>Zone</th><th>Effectif</th></tr></thead><tbody>${byZone.map(([z, c]) => `<tr><td>${escapeHtml(z)}</td><td>${c}</td></tr>`).join('')}</tbody></table>` },
      ]
    }
    if (id === 'enrolement') {
      const counts = {
        en_attente: enrolments.filter((e) => e.status === 'en_attente').length,
        valide: enrolments.filter((e) => e.status === 'valide').length,
        rejete: enrolments.filter((e) => e.status === 'rejete').length,
        info_demandee: enrolments.filter((e) => e.status === 'info_demandee').length,
      }
      const processed = counts.valide + counts.rejete
      const rate = processed > 0 ? Math.round((counts.valide / processed) * 100) : 0
      return [
        { heading: 'Vue d\'ensemble', body: kpiTable([
          ['Dossiers chargés', enrolments.length],
          ['En attente', counts.en_attente],
          ['Validés', counts.valide],
          ['Rejetés', counts.rejete],
          ['Info demandée', counts.info_demandee],
          ['Taux de validation', `${rate} %`],
        ]) },
      ]
    }
    // audit
    const byModule = new Map<string, number>()
    auditLog.forEach((e) => byModule.set(e.module, (byModule.get(e.module) ?? 0) + 1))
    return [
      { heading: 'Vue d\'ensemble', body: kpiTable([['Entrées chargées', auditLog.length]]) },
      { heading: 'Actions par module', body: `<table><thead><tr><th>Module</th><th>Actions</th></tr></thead><tbody>${[...byModule.entries()].sort((a, b) => b[1] - a[1]).map(([m, c]) => `<tr><td>${escapeHtml(m)}</td><td>${c}</td></tr>`).join('')}</tbody></table>` },
      { heading: 'Dernières actions', body: `<table><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Module</th></tr></thead><tbody>${auditLog.slice(0, 20).map((e) => `<tr><td>${new Date(e.timestamp).toLocaleString('fr-FR')}</td><td>${escapeHtml(e.userName)}</td><td>${escapeHtml(e.action)}</td><td>${escapeHtml(e.module)}</td></tr>`).join('')}</tbody></table>` },
    ]
  }

  const handleGenerateReport = async (id: ReportId) => {
    const report = REPORTS.find((r) => r.id === id)
    if (!report) return
    if (id === 'cooperatives') {
      let stats = coopStats
      if (!stats) {
        try {
          const r = await fetch('/api/backoffice/cooperatives/stats')
          if (!r.ok) throw new Error(String(r.status))
          stats = await r.json() as CoopStats
          setCoopStats(stats)
        } catch {
          setCoopErreur('Statistiques coopératives indisponibles.')
          return
        }
      }
      printReport(report.title, buildReportSections(id, stats))
      return
    }
    printReport(report.title, buildReportSections(id))
  }

  return (
    <div className={`min-h-full space-y-6 p-4 sm:p-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`}>
      <BoPageHeader title="Rapports & Analytics" description="Supervision nationale - données en temps réel" />
      {errors.dashboard && <BoErrorBanner message={errors.dashboard} />}
      {coopErreur && <BoErrorBanner message={coopErreur} />}

      <div className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
        {/* flex-wrap : icône + « Filtres » + 2 selects de 150px ≈ 380px
            débordaient à 360px ; les selects passent pleine largeur en mobile. */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="text-sm font-semibold mr-1">Filtres</span>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="h-9 w-full sm:w-[150px]"><SelectValue placeholder="Région" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="toutes">Toutes les régions</SelectItem>
              {regions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-9 w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 derniers jours</SelectItem>
              <SelectItem value="90">90 derniers jours</SelectItem>
              <SelectItem value="365">12 derniers mois</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadCSV(exportRows)} disabled={!exportRows.length}>
          <Download className="mr-2 h-4 w-4" />Exporter CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Acteurs" value={totalActors.toLocaleString('fr-FR')} detail="Données chargées" isDark={isDark} />
        {/* MODE-946 (D-2) — les 2 placeholders « non collectée » remplacés
            par les faits coopératifs réels ; « Commissions » reste sans
            source (aucun chiffre inventé). */}
        <MetricCard
          label="Trésorerie coopérative"
          value={coopStats ? `${coopStats.tresorerie.solde.toLocaleString('fr-FR')} F` : '—'}
          detail={coopErreur ? 'Source indisponible' : 'Σ entrées − sorties validées'}
          isDark={isDark}
        />
        <MetricCard
          label="Membres coopératifs actifs"
          value={coopStats ? coopStats.membresActifs.toLocaleString('fr-FR') : '—'}
          detail={coopErreur ? 'Source indisponible' : 'Adhésions actives'}
          isDark={isDark}
        />
        <MetricCard label="Commissions" value="-" detail="Donnée non collectée" isDark={isDark} />
      </div>

      <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">Évolution nationale</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{period === '30' ? '30 derniers jours' : period === '90' ? '90 derniers jours' : '12 derniers mois'} - {region === 'toutes' ? 'Toutes les régions' : region}</p>
          </div>
          <div className="flex rounded-md border p-0.5">
            <Button size="sm" variant={chartMode === 'barres' ? 'secondary' : 'ghost'} className="h-7 text-xs" onClick={() => setChartMode('barres')}><BarChart3 className="mr-1 h-3.5 w-3.5" />Barres</Button>
            <Button size="sm" variant={chartMode === 'ligne' ? 'secondary' : 'ghost'} className="h-7 text-xs" onClick={() => setChartMode('ligne')}><LineChart className="mr-1 h-3.5 w-3.5" />Ligne</Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Légende alignée sur les séries réellement tracées (une seule :
              transactions/volume/commissions ne sont pas collectées). */}
          <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />Acteurs enrôlés</span>
          </div>
          <div className="flex h-48 items-end gap-2 border-b border-l px-3 pb-0 pt-4">
            {timeline.map((point) => (
              <div key={point.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                {chartMode === 'barres' ? (
                  <div className="w-full max-w-10 rounded-t bg-blue-500 transition-[height]" style={{ height: `${Math.max(4, (point.count / maxTimeline) * 100)}%` }} title={`${point.count} acteur(s)`} />
                ) : (
                  <div className="relative flex h-full w-full items-end justify-center"><span className="mb-0.5 h-2.5 w-2.5 rounded-full bg-blue-500" title={`${point.count} acteur(s)`} /></div>
                )}
                <span className="text-[10px] text-muted-foreground">{point.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
            <span>Acteurs enrôlés: <strong className="text-foreground">{totalActors}</strong></span><span>Transactions: <strong className="text-foreground">0</strong></span><span>Volume: <strong className="text-foreground">-</strong></span><span>Commissions: <strong className="text-foreground">-</strong></span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
          <CardHeader><SectionTitle icon={<Users className="h-4 w-4" />} isDark={isDark}>Répartition par type d'acteur</SectionTitle></CardHeader>
          <CardContent className="space-y-3">
            {profileCounts.length === 0 ? <p className="text-sm text-muted-foreground">Aucune donnée d’acteur.</p> : profileCounts.map(([type, count]) => (
              <div key={type} className="flex items-center justify-between text-sm"><span>{PROFILE_LABELS[type] ?? type}</span><Badge variant="secondary">{count}</Badge></div>
            ))}
            <Separator /><div className="flex justify-between text-sm font-semibold"><span>Total</span><span>{totalActors}</span></div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
          <CardHeader><SectionTitle icon={<Activity className="h-4 w-4" />} isDark={isDark}>Comparaison régionale (Top 3)</SectionTitle></CardHeader>
          <CardContent className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="pb-3">Région</th><th className="pb-3">Acteurs</th><th className="pb-3">Part du total</th></tr></thead><tbody>{regionRows.map(([name, count]) => <tr key={name} className="border-t"><td className="py-3 font-medium">{name}</td><td>{count}</td><td><Badge variant="secondary">{actors.length > 0 ? Math.round((count / actors.length) * 100) : 0} %</Badge></td></tr>)}</tbody></table></CardContent>
        </Card>
      </div>

      <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
        <CardHeader><SectionTitle icon={<BarChart3 className="h-4 w-4" />} isDark={isDark}>Évolution par profil d'acteur</SectionTitle><p className="text-xs text-muted-foreground">Inscriptions par mois et par type d'acteur — 7 derniers mois.</p></CardHeader>
        {/* Flex + flex-1 (pattern du graphe du dessus) au lieu de 7 colonnes
            de grille fixes : ~30px/colonne à 360px rendait le graphe illisible. */}
        <CardContent><div className="flex h-32 items-end gap-2 border-b border-l px-2 pt-4">{timeline.map((point) => <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"><div className="w-full max-w-10 rounded-t bg-blue-500" style={{ height: `${Math.max(4, (point.count / maxTimeline) * 100)}%` }} /><span className="text-[10px] text-muted-foreground">{point.label}</span></div>)}</div><p className="mt-3 text-xs text-muted-foreground">Marchands · Producteurs · Coopératives · Coopérateurs · Identificateurs · Institutions</p></CardContent>
      </Card>

      <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
        <CardHeader><SectionTitle icon={<Users className="h-4 w-4" />} isDark={isDark}>Couverture sociale (renseignement)</SectionTitle><p className="text-xs text-muted-foreground">Taux de renseignement du numéro, pas un taux d'affiliation réel. Les données d'affiliation (statut, date) ne sont pas encore collectées.</p></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border p-4"><p className="text-2xl font-bold">0 <span className="text-sm font-normal text-muted-foreground">· 0%</span></p><p className="mt-1 text-xs text-muted-foreground">N° RSTI renseigné</p></div><div className="rounded-lg border p-4"><p className="text-2xl font-bold">0 <span className="text-sm font-normal text-muted-foreground">· 0%</span></p><p className="mt-1 text-xs text-muted-foreground">N° CMU renseigné</p></div></CardContent>
      </Card>

      <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
        <CardHeader><SectionTitle icon={<FileBarChart className="h-4 w-4" />} isDark={isDark}>Génération de rapports PDF</SectionTitle><p className="text-xs text-muted-foreground">Rapports officiels prêts à imprimer ou partager</p></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{REPORTS.map((report) => <div key={report.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{report.title}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{report.description}</p></div><Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={() => handleGenerateReport(report.id)}><Printer className="mr-1 h-3.5 w-3.5" />Générer PDF</Button></div>)}</CardContent>
      </Card>
    </div>
  )
}
