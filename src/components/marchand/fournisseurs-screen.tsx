'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  History,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Truck,
  User,
  X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/lib/stores/app-store'
import {
  newPartnerClientId,
  useCreditsStore,
  type CreditPartner,
} from '@/lib/market-mode/credits-store'
import { formatFCFA } from '@/lib/utils'
import { playBeep, haptic } from '@/lib/voice/tata-tts'

// MODE-907 (§15) — écran « Mes fournisseurs » : annuaire local-first
// (credits-store, kind 'fournisseur' — l'offline n'est jamais une erreur),
// création/édition (nom requis, téléphone, localisation, produits), détail
// avec l'historique des achats (GET /api/marchand/purchases
// ?supplierClientId=, repli honnête hors connexion). Le crédit fournisseur
// est en AFFICHAGE SEULEMENT en v1 (badge si balance < 0 = le marchand doit
// au fournisseur) — enregistrer des paiements aux fournisseurs est hors
// périmètre. Zéro emoji, gros boutons.

interface PurchaseRow {
  id: string
  totalAmount: number
  amountPaid: number
  createdAt: string
  items: Array<{ productName: string; quantity: number; unitCode?: string | null }>
}

type HistoryState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; purchases: PurchaseRow[] }
  | { kind: 'error' }

function normalize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function FournisseursScreen() {
  const { soleilMode, goBack, merchantId } = useAppStore()
  const { partners, upsertPartner } = useCreditsStore()
  const textClass = soleilMode ? 'text-black' : ''

  const [selected, setSelected] = useState<CreditPartner | null>(null)
  const [history, setHistory] = useState<HistoryState>({ kind: 'idle' })
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CreditPartner | null>(null)
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formLocation, setFormLocation] = useState('')
  const [formProducts, setFormProducts] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // Annuaire : uniquement les fournisseurs, triés par nom (lecture stable).
  const suppliers = useMemo(
    () =>
      Object.values(partners)
        .filter((p) => p.kind === 'fournisseur')
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [partners],
  )

  // Le partenaire sélectionné suit la version à jour du store (édition…).
  const selectedLive = selected ? partners[selected.clientId] ?? selected : null

  // Historique d'achats du fournisseur (lecture réseau ; l'offline reste
  // un état affiché honnête, jamais une erreur bloquante).
  useEffect(() => {
    if (!selectedLive || !merchantId) {
      setHistory({ kind: 'idle' })
      return
    }
    let cancelled = false
    setHistory({ kind: 'loading' })
    fetch(
      `/api/marchand/purchases?merchantId=${encodeURIComponent(merchantId)}&supplierClientId=${encodeURIComponent(selectedLive.clientId)}`,
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { purchases?: PurchaseRow[] }
        if (!cancelled) setHistory({ kind: 'loaded', purchases: data.purchases ?? [] })
      })
      .catch(() => {
        if (!cancelled) setHistory({ kind: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [selectedLive?.clientId, selectedLive?.updatedAt, merchantId])

  const openCreate = () => {
    haptic('light')
    setFormError(null)
    setEditing(null)
    setFormName('')
    setFormPhone('')
    setFormLocation('')
    setFormProducts('')
    setShowForm(true)
  }

  const openEdit = (partner: CreditPartner) => {
    haptic('light')
    setFormError(null)
    setEditing(partner)
    setFormName(partner.name)
    setFormPhone(partner.phone ?? '')
    setFormLocation(partner.location ?? '')
    setFormProducts(partner.products ?? '')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
    setFormError(null)
  }

  const handleSubmit = () => {
    const name = formName.trim()
    if (name.length < 2) {
      setFormError('Saisis le nom du fournisseur.')
      return
    }
    upsertPartner({
      clientId: editing?.clientId ?? newPartnerClientId(),
      name,
      kind: 'fournisseur',
      phone: formPhone.trim() || undefined,
      location: formLocation.trim() || undefined,
      products: formProducts.trim() || undefined,
    })
    playBeep('success')
    haptic('success')
    closeForm()
  }

  const closeDetail = () => {
    setSelected(null)
    setHistory({ kind: 'idle' })
  }

  return (
    <div className="screen-enter min-h-dvh pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-40 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={selected ? closeDetail : goBack} aria-label="Retour">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#C66A2C]">Annuaire</p>
            <h1 className={`truncate text-xl font-bold ${textClass}`}>
              {selected ? selected.name : 'Mes fournisseurs'}
            </h1>
          </div>
          <Truck className="h-5 w-5 text-[#C66A2C]" aria-hidden="true" />
        </div>
      </header>

      {selected ? (
        <main className="space-y-5 px-4 py-5">
          {/* Fiche fournisseur */}
          <Card className="border-[#E8944F]/30 bg-[#FDF3ED]">
            <CardContent className="space-y-2 p-5">
              {selectedLive?.phone && (
                <p className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 shrink-0 text-[#C66A2C]" aria-hidden="true" />
                  <span className={textClass}>{selectedLive.phone}</span>
                </p>
              )}
              {selectedLive?.location && (
                <p className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 shrink-0 text-[#C66A2C]" aria-hidden="true" />
                  <span className={textClass}>{selectedLive.location}</span>
                </p>
              )}
              {selectedLive?.products && (
                <p className="flex items-start gap-2 text-sm">
                  <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[#C66A2C]" aria-hidden="true" />
                  <span className={textClass}>{selectedLive.products}</span>
                </p>
              )}
              {selectedLive && selectedLive.balanceCfa < 0 && (
                <Badge className="border-0 bg-amber-100 text-amber-800">
                  Crédit : tu lui dois {formatFCFA(-selectedLive.balanceCfa)}
                </Badge>
              )}
              <Button
                variant="outline"
                className="h-12 w-full"
                onClick={() => openEdit(selectedLive ?? selected)}
              >
                <Pencil className="mr-2 h-4 w-4" /> Modifier la fiche
              </Button>
            </CardContent>
          </Card>

          {/* Historique des achats */}
          <section>
            <h2 className={`mb-3 flex items-center gap-2 text-lg font-bold ${textClass}`}>
              <History className="h-5 w-5 text-[#C66A2C]" aria-hidden="true" /> Achats de marchandises
            </h2>
            {history.kind === 'loading' && (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  Je regarde tes achats...
                </CardContent>
              </Card>
            )}
            {history.kind === 'error' && (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  Historique indisponible pour le moment. Il se chargera au retour de la connexion.
                </CardContent>
              </Card>
            )}
            {history.kind === 'loaded' && history.purchases.length === 0 && (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  Aucun achat enregistré chez ce fournisseur.
                </CardContent>
              </Card>
            )}
            {history.kind === 'loaded' && history.purchases.length > 0 && (
              <div className="julaba-scroll max-h-96 space-y-2 overflow-y-auto pr-1">
                {history.purchases.map((purchase) => (
                  <Card key={purchase.id}>
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-medium ${textClass}`}>
                          {purchase.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(purchase.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold fcfa text-[#C66A2C]">
                        {formatFCFA(purchase.totalAmount)}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </main>
      ) : (
        <main className="space-y-5 px-4 py-5">
          <Button
            className="h-14 w-full bg-[#C66A2C] text-base text-white hover:bg-[#9E5222]"
            onClick={openCreate}
          >
            <Plus className="mr-2 h-5 w-5" /> Nouveau fournisseur
          </Button>

          {suppliers.length === 0 ? (
            <Card>
              <CardContent className="flex items-start gap-3 p-6 text-center text-sm text-muted-foreground">
                <Truck className="mt-0.5 h-5 w-5 shrink-0 text-[#C66A2C]" aria-hidden="true" />
                <div className="space-y-2 text-left">
                  <p>Ton annuaire est vide. Enregistre ton premier fournisseur ci-dessus.</p>
                  <p>Ou dicte simplement : « j&apos;ai acheté 20 kilos de tomates à 15 000 francs chez Koné ».</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {suppliers.map((partner) => (
                <Card key={partner.clientId}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => {
                        haptic('light')
                        setSelected(partner)
                      }}
                      aria-label={`Voir les achats de ${partner.name}`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDF3ED]">
                        <User className="h-5 w-5 text-[#C66A2C]" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className={`truncate font-semibold ${textClass}`}>{partner.name}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {[partner.phone, partner.location].filter(Boolean).join(' · ') || 'Fiche à compléter'}
                        </p>
                      </div>
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {partner.balanceCfa < 0 && (
                        <Badge className="border-0 bg-amber-100 text-amber-800">
                          Crédit : {formatFCFA(-partner.balanceCfa)}
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        className="min-h-11 px-3"
                        onClick={() => openEdit(partner)}
                        aria-label={`Modifier ${partner.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <p className="px-2 text-center text-xs text-muted-foreground">
            Les fournisseurs dictés à la voix (« chez Koné ») arrivent ici automatiquement.
          </p>
        </main>
      )}

      {/* Modale : création / édition de fournisseur — Sheet Radix (UI-MP-003). */}
      {showForm && (
        <Sheet open onOpenChange={(o) => { if (!o) closeForm() }}>
          <SheetContent side="bottom" aria-describedby={undefined} className="w-full max-w-lg mx-auto rounded-t-3xl rounded-b-none p-0 gap-0 border-0 [&>button:last-of-type]:hidden">
            <div className="p-6 pb-10">
              <div className="mb-4 flex items-center justify-between">
                <SheetTitle asChild>
                  <h3 className={`text-lg font-bold ${textClass}`}>
                    {editing ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
                  </h3>
                </SheetTitle>
                <Button variant="ghost" size="icon" onClick={closeForm} aria-label="Fermer">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <label className={`mb-1 block text-sm font-medium ${textClass}`}>Nom du fournisseur</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex : Koné"
                aria-label="Nom du fournisseur"
                maxLength={80}
                autoFocus
              />
              <label className={`mb-1 mt-4 block text-sm font-medium ${textClass}`}>Téléphone (facultatif)</label>
              <Input
                type="tel"
                inputMode="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="Ex : 0701020304"
                aria-label="Téléphone du fournisseur"
                maxLength={20}
              />
              <label className={`mb-1 mt-4 block text-sm font-medium ${textClass}`}>Localisation (facultatif)</label>
              <Input
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder="Ex : Adjamé, rangée 12"
                aria-label="Localisation du fournisseur"
                maxLength={80}
              />
              <label className={`mb-1 mt-4 block text-sm font-medium ${textClass}`}>Produits (facultatif)</label>
              <Input
                value={formProducts}
                onChange={(e) => setFormProducts(e.target.value)}
                placeholder="Ex : tomates, oignons"
                aria-label="Produits du fournisseur"
                maxLength={80}
              />
              {formError && (
                <div className="mt-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-700" role="alert">
                  {formError}
                </div>
              )}
              <Button
                className="mt-6 h-12 w-full bg-[#C66A2C] text-white hover:bg-[#B55D25]"
                onClick={handleSubmit}
                disabled={formName.trim().length < 2}
              >
                {editing ? 'Enregistrer la fiche' : 'Enregistrer le fournisseur'}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
