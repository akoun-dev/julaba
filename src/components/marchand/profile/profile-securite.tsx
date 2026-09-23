"use client"

// MODE-991 (DET-001 tranche 5) — bloc déplacé VERBATIM de
// profile-screen.tsx (preuve octet-pour-octet via le script de
// chirurgie persisté) ; comportement inchangé. Substitution
// documentée : déclaration « export »ée.
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Lock, Clock, Delete } from 'lucide-react'
import { changerPinMarchand } from '@/lib/marchand-pin'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { loadMerchantAuthData, type MerchantProfile } from '@/lib/marchand-profile-data'
import { cn } from '@/lib/utils'

// ============================================================
// SUB-SCREEN: SÉCURITÉ
// ============================================================


export function SecuriteSubScreen({
  profile,
  setProfile,
  phone,
  soleilMode,
  onBack,
}: {
  profile: MerchantProfile
  setProfile: (p: MerchantProfile) => void
  phone: string
  soleilMode: boolean
  onBack: () => void
}) {
  const [pinStep, setPinStep] = useState<'idle' | 'old' | 'new' | 'confirm'>('idle')
  const [pin, setPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPinVal, setConfirmPinVal] = useState('')
  const [error, setError] = useState('')

  const [authData] = useState(() => loadMerchantAuthData(phone))
  const authMethod = authData?.authMethod || 'pin'

  const handlePinDigit = (digit: string) => {
    if (pinStep === 'old') {
      if (pin.length < 4) {
        const next = pin + digit
        setPin(next)
        if (next.length === 4) {
          // Verify old PIN
          const merchantRaw = localStorage.getItem(`julaba-merchant-${phone}`)
          if (merchantRaw) {
            const merchant = JSON.parse(merchantRaw)
            const simpleHash = (str: string) => {
              let hash = 0
              for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i)
                hash = ((hash << 5) - hash) + char
                hash |= 0
              }
              return hash.toString()
            }
            if (simpleHash(next) === merchant.pinHash) {
              setPinStep('new')
              setError('')
            } else {
              setError('Code incorrect')
              setPin('')
              tataSpeak('Code incorrect')
              haptic('error')
            }
          }
        }
      }
    } else if (pinStep === 'new') {
      if (newPin.length < 4) {
        const next = newPin + digit
        setNewPin(next)
        if (next.length === 4) {
          setPinStep('confirm')
        }
      }
    } else if (pinStep === 'confirm') {
      if (confirmPinVal.length < 4) {
        const next = confirmPinVal + digit
        setConfirmPinVal(next)
        if (next.length === 4) {
          if (next === newPin) {
            // DET-AUTH-001 (MODE-978) : le changement est PROPAGÉ AU
            // SERVEUR (PATCH /api/merchant, codes en brut, hachage scrypt
            // serveur, ancien code vérifié côté serveur) — fini le
            // changement local silencieux qui laissait l'ancien code
            // valide sur tout autre appareil. Verdict honnête avant de
            // toucher au cache local.
            const ancienCode = pin
            const nouveauCode = next
            void (async () => {
              const verdict = await changerPinMarchand(phone, ancienCode, nouveauCode)
              // Refus du SERVEUR (cache local périmé) : le changement local
              // n'est PAS appliqué — sinon ce compte aurait deux codes.
              if (verdict.statut === 'rejet') {
                setError(verdict.raison || 'Code actuel incorrect')
                setConfirmPinVal('')
                setPinStep('new')
                tataSpeak('Code actuel refusé par le serveur. Resynchronisez l application.')
                haptic('error')
                return
              }
              const merchantRaw = localStorage.getItem(`julaba-merchant-${phone}`)
              if (merchantRaw) {
                const merchant = JSON.parse(merchantRaw)
                const simpleHash = (str: string) => {
                  let hash = 0
                  for (let i = 0; i < str.length; i++) {
                    const char = str.charCodeAt(i)
                    hash = ((hash << 5) - hash) + char
                    hash |= 0
                  }
                  return hash.toString()
                }
                merchant.pinHash = simpleHash(nouveauCode)
                localStorage.setItem(`julaba-merchant-${phone}`, JSON.stringify(merchant))
              }
              // Add to connection history
              const updatedProfile = {
                ...profile,
                connectionHistory: [
                  { date: new Date().toISOString(), method: 'Changement PIN' },
                  ...profile.connectionHistory,
                ].slice(0, 5),
              }
              setProfile(updatedProfile)
              setPinStep('idle')
              setPin('')
              setNewPin('')
              setConfirmPinVal('')
              setError('')
              if (verdict.statut === 'synced') {
                tataSpeak('Ton nouveau code est enregistré !')
                haptic('success')
              } else if (verdict.statut === 'queued') {
                tataSpeak('Nouveau code enregistré. Il partira au serveur dès la reconnexion.')
                haptic('success')
              } else if (verdict.statut === 'local_seul') {
                tataSpeak('Nouveau code enregistré sur cet appareil.')
                haptic('success')
              } else {
                // 'lost' : ni serveur ni file — le changement ne vaut QUE
                // sur cet appareil, dit explicitement (plus jamais de
                // synchronisation manquante en silence).
                setError('Code changé sur cet appareil seulement — la synchronisation a échoué. L\'ancien code reste valide ailleurs.')
                tataSpeak('Code changé sur cet appareil seulement. La synchronisation a échoué.')
                haptic('error')
              }
            })()
          } else {
            setError('Les codes ne correspondent pas')
            setConfirmPinVal('')
            setPinStep('new')
            tataSpeak('Les codes ne correspondent pas')
            haptic('error')
          }
        }
      }
    }
  }

  const handlePinDelete = () => {
    if (pinStep === 'old') setPin((p) => p.slice(0, -1))
    else if (pinStep === 'new') setNewPin((p) => p.slice(0, -1))
    else if (pinStep === 'confirm') setConfirmPinVal((p) => p.slice(0, -1))
  }

  const currentPin = pinStep === 'old' ? pin : pinStep === 'new' ? newPin : confirmPinVal

  const pinLabels: Record<string, string> = {
    idle: '',
    old: 'Entrez votre code actuel',
    new: 'Entrez le nouveau code',
    confirm: 'Confirmez le nouveau code',
  }

  const tc = soleilMode ? 'text-black' : ''

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Sécurité & Connexion</h1>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Current auth method */}
        <Card>
          <CardContent className="p-4">
            <p className={cn('text-xs text-muted-foreground mb-1', tc)}>Méthode de connexion</p>
            <div className="flex items-center gap-2">
              <Badge className="bg-[#C66A2C]/10 text-[#C66A2C] border-0">
                {authMethod === 'pin' ? 'Code PIN' : authMethod === 'pattern' ? 'Motif' : 'PIN + Motif'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Change PIN */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm font-medium', tc)}>Changer mon code PIN</span>
              </div>
              {pinStep === 'idle' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { haptic('light'); setPinStep('old'); setError(''); setPin(''); setNewPin(''); setConfirmPinVal('') }}
                >
                  Modifier
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { haptic('light'); setPinStep('idle'); setPin(''); setNewPin(''); setConfirmPinVal(''); setError('') }}
                >
                  Annuler
                </Button>
              )}
            </div>

            {pinStep !== 'idle' && (
              <div className="mt-4 space-y-4">
                <p className={cn('text-sm text-center font-medium', tc)}>{pinLabels[pinStep]}</p>

                {/* PIN dots */}
                <div className="flex justify-center gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        'w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all',
                        i < currentPin.length
                          ? 'bg-[#C66A2C] border-[#C66A2C]'
                          : 'border-muted-foreground/30'
                      )}
                    >
                      {i < currentPin.length && <div className="w-3 h-3 rounded-full bg-card" />}
                    </div>
                  ))}
                </div>

                {error && (
                  <p className="text-destructive text-sm text-center">{error}</p>
                )}

                {/* Numeric keypad */}
                <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                    <Button
                      key={d}
                      variant="outline"
                      className={cn('h-12 text-lg font-semibold', soleilMode && 'text-base')}
                      onClick={() => handlePinDigit(d)}
                    >
                      {d}
                    </Button>
                  ))}
                  <Button variant="ghost" className="h-12" onClick={handlePinDelete} aria-label="Effacer">
                    <Delete className="size-5" />
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 text-lg font-semibold"
                    onClick={() => handlePinDigit('0')}
                  >
                    0
                  </Button>
                  <div className="h-12" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Connection history */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <p className={cn('text-sm font-medium', tc)}>Historique des connexions</p>
            </div>
            {profile.connectionHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">Aucun historique</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {profile.connectionHistory.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className={tc}>{entry.method}</span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(entry.date).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
