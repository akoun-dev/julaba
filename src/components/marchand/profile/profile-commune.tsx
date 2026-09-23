"use client"

// MODE-991 (DET-001 tranche 5) — bloc déplacé VERBATIM de
// profile-screen.tsx (preuve octet-pour-octet via le script de
// chirurgie persisté) ; comportement inchangé. Substitution
// documentée : déclaration « export »ée.
import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, MapPin } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { choisirCommuneMarchand } from '@/lib/marchand-commune'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { cn } from '@/lib/utils'

// ============================================================
// SUB-SCREEN : MA COMMUNE (MODE-985 — DET-COOP-011 tranche 2)
// ============================================================

// Le marchand déclare SA commune dans le référentiel GPS (MODE-979, 41
// communes). Sans commune, son marchand n'apparaît que dans « Toutes »
// des filtres région/commune de la liste membres de sa coopérative — la
// localisation n'est JAMAIS devinée. Verdicts honnêtes du PIN (synced /
// queued / rejet / lost) : le verdict dit toujours ce qui s'est
// réellement passé, la commune vit SERVEUR (merchants.commune_id).

export function CommuneSubScreen({ soleilMode, onBack }: { soleilMode: boolean; onBack: () => void }) {
  const { merchantId } = useAppStore()
  const [communes, setCommunes] = useState<{ id: string; nom: string; region: string }[]>([])
  const [communesErreur, setCommunesErreur] = useState(false)
  const [communeCourante, setCommuneCourante] = useState<{ id: string; nom: string; region: string } | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Annuaire chargé une fois ; la commune courante est lue SERVEUR
  // (null = jamais choisie — « non définie », pas de valeur inventée).
  useEffect(() => {
    let annule = false
    Promise.all([
      fetch('/api/communes').then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
      merchantId
        ? fetch(`/api/marchand/profil/commune?marchandId=${encodeURIComponent(merchantId)}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        : Promise.resolve({ commune: null }),
    ])
      .then(([annuaire, courant]) => {
        if (annule) return
        setCommunes((annuaire.communes ?? []) as { id: string; nom: string; region: string }[])
        setCommuneCourante((courant?.commune as { id: string; nom: string; region: string } | null) ?? null)
      })
      .catch(() => {
        if (!annule) setCommunesErreur(true)
      })
    return () => {
      annule = true
    }
  }, [merchantId])

  const tc = soleilMode ? 'text-black' : ''

  const choisir = async (communeId: string) => {
    if (!merchantId || enCours) return
    const commune = communes.find((c) => c.id === communeId)
    if (!commune) return
    setEnCours(true)
    setErreur(null)
    try {
      const verdict = await choisirCommuneMarchand(merchantId, communeId)
      if (verdict.statut === 'synced') {
        setCommuneCourante(commune)
        tataSpeak(`Commune enregistrée : ${commune.nom}.`)
        haptic('success')
      } else if (verdict.statut === 'queued') {
        // Nom choisi affiché, mais le verdict dit que le serveur n'a pas
        // encore confirmé — la liste membres ne le montrera qu'après.
        setCommuneCourante(commune)
        tataSpeak('Commune notée. Elle partira au serveur dès la reconnexion.')
        haptic('success')
      } else if (verdict.statut === 'rejet') {
        setErreur(verdict.raison)
        tataSpeak('Choix refusé par le serveur.')
        haptic('error')
      } else {
        // 'lost' : ni serveur ni file — le choix n'existe NULLE PART,
        // dit explicitement (même grammaire que le PIN, MODE-978).
        setErreur(verdict.raison)
        tataSpeak("Le choix n'a pu être ni envoyé ni mis en file. Réessayez.")
        haptic('error')
      }
    } catch {
      setErreur('Choix impossible pour le moment.')
      tataSpeak('Choix impossible pour le moment.')
      haptic('error')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Ma commune</h1>
        </div>
      </div>

      <div className="px-4 mt-4">
        <Card>
          <CardContent className="p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className={cn('text-sm font-semibold', tc)}>Ma commune</span>
            </div>
            <p className={cn('text-xs text-muted-foreground', tc)}>
              {communeCourante
                ? `Commune déclarée : ${communeCourante.nom} (${communeCourante.region}).`
                : 'Aucune commune déclarée — ton marchand apparaîtra seulement dans « Toutes » des filtres de ta coopérative.'}
            </p>
            {communesErreur ? (
              <p className="text-xs text-amber-600">Annuaire des communes indisponible (hors ligne ?) — réessayez plus tard.</p>
            ) : communes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chargement de l&apos;annuaire…</p>
            ) : (
              <Select
                value={communeCourante?.id ?? ''}
                onValueChange={(v) => void choisir(v)}
                disabled={enCours || !merchantId}
              >
                <SelectTrigger className="w-full h-11 min-h-[44px]" aria-label="Choisir ma commune">
                  <SelectValue placeholder="Choisir ma commune" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {communes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nom} — {c.region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {erreur && <p className="text-xs text-red-600">{erreur}</p>}
            <p className={cn('text-xs text-muted-foreground/80', tc)}>
              Ta commune aide ta coopérative à filtrer ses membres par région et par commune — elle n&apos;est jamais devinée.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
