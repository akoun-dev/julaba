'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Gift } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { tataSpeak } from '@/lib/voice/tata-tts'
import { useNetworkStatus } from '@/lib/hooks/use-network-status'
import { deriveLoyaltySubjectRole } from '@/lib/marchand/secondary-logic'
import { AppEmpty } from '@/components/shared/app-states'

export function FideliteScreen() {
  const { soleilMode, goBack, merchantId, userRole, merchantCategorie } = useAppStore()
  const online = useNetworkStatus()
  const [data, setData] = useState<LoyaltyView | null>(null)
  const [loading, setLoading] = useState(true)
  const [redeeming, setRedeeming] = useState<string | null>(null)

  const subjectRole = deriveLoyaltySubjectRole(userRole, merchantCategorie)

  useEffect(() => {
    if (!merchantId) return
    let annule = false
    void (async () => {
      try {
        const res = await fetch(`/api/loyalty/me?subjectId=${encodeURIComponent(merchantId)}&subjectRole=${encodeURIComponent(subjectRole)}`)
        if (!res.ok) return
        const payload = await res.json() as LoyaltyView
        if (!annule) setData(payload)
      } catch {
        // Hors ligne : conserver le dernier état fiable en mémoire et ne rien inventer.
      } finally {
        if (!annule) setLoading(false)
      }
    })()
    return () => { annule = true }
  }, [merchantId, subjectRole])

  const redeem = async (rewardId: string, rewardName: string) => {
    if (!merchantId || !data || redeeming) return
    setRedeeming(rewardId)
    try {
      const res = await fetch('/api/loyalty/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subjectId: merchantId, subjectRole, rewardId, operationId: crypto.randomUUID(), metadata: { source: 'mobile' } }) })
      const result = await res.json() as { balance?: number; erreur?: string }
      if (!res.ok) { tataSpeak(result.erreur ?? 'La récompense n’a pas pu être utilisée.'); return }
      tataSpeak(`Récompense obtenue : ${rewardName}. Il vous reste ${result.balance ?? 0} points.`)
      setData((previous) => previous ? { ...previous, account: previous.account ? { ...previous.account, points_balance: result.balance ?? previous.account.points_balance } : previous.account } : previous)
    } catch {
      tataSpeak('Connexion indisponible. Votre récompense sera disponible quand le réseau reviendra.')
    } finally {
      setRedeeming(null)
    }
  }

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Fidélité</h1>
        </div>
      </div>

      <div className="px-4 mt-4">
        <Card>
          <CardContent className="p-5">
            <div className="min-w-0">
              <p className={`text-sm text-muted-foreground ${soleilMode ? 'text-base text-black' : ''}`}>Mes points fidélité</p>
              {data?.account ? (
                <>
                  <p className={`font-bold ${soleilMode ? 'text-3xl text-black' : 'text-3xl'}`}>{data.account.points_balance} <span className="text-base font-medium text-muted-foreground">points</span></p>
                  <p className={`text-sm font-semibold mt-1 ${soleilMode ? 'text-black' : ''}`}>{data.level?.name ?? 'Nouveau'}</p>
                  {data.nextLevel && <><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#C66A2C]" style={{ width: `${data.progress}%` }} /></div><p className="mt-1 text-xs text-muted-foreground">{data.progress}% vers {data.nextLevel.name} ({data.nextLevel.threshold_points} points)</p></>}
                </>
              ) : (
                <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-sm text-black' : ''}`}>{loading ? 'Chargement de votre compte…' : online ? 'Votre compte fidélité sera créé lors de votre première activité éligible.' : 'Points indisponibles hors connexion — aucune valeur inventée.'}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="px-4 mt-4">
        <h3 className={`text-sm font-semibold text-muted-foreground mb-3 ${soleilMode ? 'text-base text-black' : ''}`}>
          Avantages fidélité
        </h3>
        {data?.rewards?.length ? <div className="space-y-2">{data.rewards.map((reward) => <Card key={reward.id}><CardContent className="p-4 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold">{reward.name}</p><p className="text-xs text-muted-foreground">{reward.description || reward.reward_type} · {reward.cost_points} points</p></div><Button size="sm" className="shrink-0 bg-[#C66A2C] text-white" disabled={!data.account || data.account.points_balance < reward.cost_points || !online || redeeming === reward.id} onClick={() => void redeem(reward.id, reward.name)}>Utiliser</Button></CardContent></Card>)}</div> : <Card><CardContent className="p-0"><AppEmpty icon={Gift} title={online ? 'Aucune récompense disponible pour le moment.' : 'Récompenses indisponibles hors connexion.'} description="Les avantages dépendent des règles actives pour votre profil." soleilMode={soleilMode} className="py-6" /></CardContent></Card>}
      </div>

      <div className="px-4 mt-4 pb-6"><h3 className={`text-sm font-semibold text-muted-foreground mb-3 ${soleilMode ? 'text-base text-black' : ''}`}>Historique des points</h3><Card><CardContent className="p-4 space-y-3">{data?.transactions?.length ? data.transactions.slice(0, 10).map((tx) => <div key={tx.id} className="flex justify-between gap-3 text-xs"><span className="min-w-0 truncate">{tx.description}</span><span className={tx.points > 0 ? 'font-bold text-emerald-700' : 'font-bold text-muted-foreground'}>{tx.points > 0 ? '+' : ''}{tx.points}</span></div>) : <AppEmpty title="Aucun mouvement de points." soleilMode={soleilMode} className="py-6" />}</CardContent></Card></div>
    </div>
  )
}

type LoyaltyView = {
  account: { points_balance: number; points_earned: number; points_redeemed: number; points_expired: number } | null
  level: { name: string; threshold_points: number } | null
  nextLevel: { name: string; threshold_points: number } | null
  progress: number | null
  rewards: Array<{ id: string; name: string; description: string | null; reward_type: string; cost_points: number }>
  transactions: Array<{ id: string; description: string; points: number; created_at: string }>
}
