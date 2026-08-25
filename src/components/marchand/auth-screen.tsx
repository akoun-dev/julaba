'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Eye, EyeOff, Mic, MicOff, Phone, User, Shield, Info } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { tataSpeak, tataStop, playBeep, haptic } from '@/lib/voice/tata-tts'
import { parseVoicePin } from '@/lib/voice/localIntent'
import { isSTTAvailable, createSingleShotSTT, type STTSession } from '@/lib/voice/stt'

export function AuthScreen() {
  const { setAuth, soleilMode, voiceEnabled } = useAppStore()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [step, setStep] = useState<'name' | 'phone' | 'pin' | 'confirm' | 'login-pin'>('name')
  const [firstName, setFirstName] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [pinDisplay, setPinDisplay] = useState<string[]>([])
  const [confirmPin, setConfirmPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const [voiceAttempts, setVoiceAttempts] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && isSTTAvailable())
  const sttSessionRef = useRef<STTSession | null>(null)

  // Refs to avoid stale closures in STT callbacks
  const pinRef = useRef(pin)
  const phoneRef = useRef(phone)
  const firstNameRef = useRef(firstName)
  const stepRef = useRef(step)
  const modeRef = useRef(mode)
  const confirmPinRef = useRef(confirmPin)
  const voiceAttemptsRef = useRef(voiceAttempts)

  pinRef.current = pin
  phoneRef.current = phone
  firstNameRef.current = firstName
  stepRef.current = step
  modeRef.current = mode
  confirmPinRef.current = confirmPin
  voiceAttemptsRef.current = voiceAttempts

  const simpleHash = (str: string) => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0
    }
    return hash.toString()
  }

  const doLogin = useCallback((phoneVal: string, pinVal: string, nameVal: string) => {
    setIsProcessing(true)
    setError('')
    try {
      const stored = localStorage.getItem(`julaba-merchant-${phoneVal || 'demo'}`)
      if (stored) {
        const data = JSON.parse(stored)
        if (simpleHash(pinVal) === data.pinHash) {
          playBeep('success')
          haptic('success')
          tataSpeak(`Bonjour Maman ${data.firstName} ! Bienvenue sur Jùlaba.`)
          setAuth(data.id, data.firstName, data.phone)
          return
        }
      }
      const id = crypto.randomUUID()
      const merchantData = {
        id,
        firstName: nameVal || localStorage.getItem('julaba-last-name') || 'Awa',
        phone: phoneVal || 'demo',
        pinHash: simpleHash(pinVal),
      }
      localStorage.setItem(`julaba-merchant-${merchantData.phone}`, JSON.stringify(merchantData))
      localStorage.setItem('julaba-last-name', merchantData.firstName)
      playBeep('success')
      haptic('success')
      tataSpeak(`Bonjour Maman ${merchantData.firstName} ! Bienvenue sur Jùlaba.`)
      setAuth(id, merchantData.firstName, merchantData.phone)
    } catch {
      setError('Erreur de connexion.')
      playBeep('error')
    } finally {
      setIsProcessing(false)
    }
  }, [setAuth])

  const handleVoiceResult = useCallback((transcript: string) => {
    const lower = transcript.toLowerCase().trim()
    const currentStep = stepRef.current

    if (currentStep === 'name') {
      // Extract name from "Je m'appelle X" or just the spoken words
      const nameMatch = lower.match(/(?:je m\'|m\')?appelle\s+([\w\sàâäéèêëïîôùûüÿçñæœ]+?)(?:\s*(?:mon numéro|mon code|c'est|voilà|$))/i)
      let name: string
      if (nameMatch && nameMatch[1].trim().length >= 2) {
        name = nameMatch[1].trim()
      } else {
        // Take the whole transcript as name, strip common filler words
        name = lower
          .replace(/^(bonjour|salut|je suis|oui|merci)\s*/gi, '')
          .replace(/\s+(mon|c'est|voilà|merci|oui).*$/gi, '')
          .trim()
      }
      name = name.charAt(0).toUpperCase() + name.slice(1)

      if (name.length >= 2) {
        setFirstName(name)
        firstNameRef.current = name
        tataSpeak(`Bonjour ${name} ! Entrez votre numéro de téléphone.`)
        haptic('success')
        setMode('register')
        modeRef.current = 'register'
        setStep('phone')
        stepRef.current = 'phone'
        setError('')
      } else {
        setError('Je n\'ai pas compris le nom. Réessayez.')
        tataSpeak('Je n\'ai pas bien compris. Répétez votre nom.')
      }
    } else if (currentStep === 'login-pin') {
      const pinDigits = parseVoicePin(transcript)
      if (pinDigits) {
        setPin(pinDigits.join(''))
        pinRef.current = pinDigits.join('')
        setPinDisplay(pinDigits.map(() => '•'))
        tataSpeak(`Votre code est ${pinDigits.join('-')}, c'est bien ça ?`)
        haptic('light')
        setStep('confirm')
        stepRef.current = 'confirm'
        setError('')
      } else {
        const newAttempts = voiceAttemptsRef.current + 1
        setVoiceAttempts(newAttempts)
        voiceAttemptsRef.current = newAttempts
        if (newAttempts >= 2) {
          tataSpeak('Utilisez le pavé numérique.')
          setError('Trop de tentatives vocales. Utilisez le pavé.')
        } else {
          tataSpeak('Je n\'ai pas entendu 4 chiffres. Répétez ?')
          setError('Dites exactement 4 chiffres.')
        }
      }
    } else if (currentStep === 'confirm') {
      if (/^(oui|c\'?est (?:ça|ca)|exact|c\'?est bon)/i.test(lower)) {
        doLogin(phoneRef.current, pinRef.current, firstNameRef.current)
      } else if (/^non/i.test(lower)) {
        tataSpeak('D\'accord, réentrez votre code.')
        setPin('')
        pinRef.current = ''
        setPinDisplay([])
        setStep(modeRef.current === 'register' ? 'pin' : 'login-pin')
        stepRef.current = modeRef.current === 'register' ? 'pin' : 'login-pin'
      }
    } else if (currentStep === 'pin') {
      const pinDigits = parseVoicePin(transcript)
      if (pinDigits) {
        setPin(pinDigits.join(''))
        pinRef.current = pinDigits.join('')
        setPinDisplay(pinDigits.map(() => '•'))
        tataSpeak('Confirmez votre code à 4 chiffres.')
        setStep('confirm')
        stepRef.current = 'confirm'
        setError('')
      } else {
        setError('Dites exactement 4 chiffres.')
      }
    }
  }, [doLogin])

  const startListening = useCallback(() => {
    if (!voiceEnabled || isListening || !sttAvailable) return

    tataStop()
    setIsListening(true)
    setError('')
    playBeep('start')

    sttSessionRef.current = createSingleShotSTT({
      onResult: (result) => {
        playBeep('stop')
        setIsListening(false)
        handleVoiceResult(result.transcript)
      },
      onError: (err) => {
        setIsListening(false)
        if (err === 'no-speech') {
          tataSpeak('Je n\'ai rien entendu. Réessayez.')
          setError('Aucune parole détectée.')
        } else if (err === 'aborted') {
          // Silent
        } else {
          playBeep('error')
          tataSpeak('Problème micro. Réessayez.')
          setError('Erreur micro.')
        }
      },
      onEnd: () => {
        // Safety net: always reset listening when STT ends
        setIsListening(false)
      },
    })
    sttSessionRef.current.start()
  }, [voiceEnabled, isListening, sttAvailable, handleVoiceResult])

  const handlePinDigit = (digit: string) => {
    if (pin.length >= 4) return
    const newPin = pin + digit
    setPin(newPin)
    setPinDisplay([...pinDisplay, '•'])
    haptic('light')
    if (newPin.length === 4) {
      if (mode === 'register') {
        if (!confirmPin) {
          setConfirmPin(newPin)
          setPin('')
          setPinDisplay([])
          tataSpeak('Confirmez votre code.')
        } else if (newPin === confirmPin) {
          setIsProcessing(true)
          setError('')
          try {
            const id = crypto.randomUUID()
            const merchantData = { id, firstName, phone, pinHash: simpleHash(confirmPin) }
            localStorage.setItem(`julaba-merchant-${phone}`, JSON.stringify(merchantData))
            localStorage.setItem('julaba-last-name', firstName)
            playBeep('success')
            haptic('success')
            tataSpeak(`Compte créé ! Bonjour Maman ${firstName} !`)
            setAuth(id, firstName, phone)
          } catch {
            setError('Erreur lors de la création.')
            playBeep('error')
          } finally {
            setIsProcessing(false)
          }
        } else {
          setError('Les codes ne correspondent pas.')
          tataSpeak('Les codes ne sont pas les mêmes. Réessayez.')
          setPin('')
          setPinDisplay([])
          setConfirmPin('')
          playBeep('error')
        }
      } else {
        setStep('confirm')
        tataSpeak(`Votre code est ${newPin.split('').join('-')}, c'est bien ça ?`)
      }
    }
  }

  const handleDeletePin = () => {
    if (pin.length === 0) return
    setPin(pin.slice(0, -1))
    setPinDisplay(pinDisplay.slice(0, -1))
  }

  const handlePhoneSubmit = () => {
    if (phone.length < 8) {
      setError('Entrez un numéro valide.')
      return
    }
    const stored = localStorage.getItem(`julaba-merchant-${phone}`)
    if (stored) {
      const data = JSON.parse(stored)
      setFirstName(data.firstName)
      firstNameRef.current = data.firstName
      setMode('login')
      modeRef.current = 'login'
      setStep('login-pin')
      stepRef.current = 'login-pin'
      tataSpeak(`Bonjour Maman ${data.firstName} ! Dites votre code à 4 chiffres.`)
    } else {
      setMode('register')
      modeRef.current = 'register'
      setStep('pin')
      stepRef.current = 'pin'
      tataSpeak('Créez votre code secret à 4 chiffres.')
    }
    haptic('light')
  }

  // Auto voice greeting
  useEffect(() => {
    if (voiceEnabled) {
      const timer = setTimeout(() => {
        tataSpeak('Bonjour ! Bienvenue sur Jùlaba. Entrez votre numéro de téléphone ou dites votre nom.')
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [])

  // Cleanup STT on unmount
  useEffect(() => {
    return () => { sttSessionRef.current?.abort() }
  }, [])

  const textClass = soleilMode ? 'text-black text-lg' : 'text-foreground'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-lg overflow-hidden">
            <img src="/icon-only.png" alt="Jùlaba" className="w-full h-full object-contain" />
          </div>
          <h1 className={`text-3xl font-bold text-[#C66A2C] ${soleilMode ? 'text-2xl' : ''}`}>Jùlaba</h1>
          <p className={`text-sm mt-1 ${textClass} opacity-70`}>Votre assistant marché</p>
        </div>

        {/* Step: Name / Phone */}
        {step === 'name' && (
          <Card className={`border-2 border-[#C66A2C]/20 ${soleilMode ? 'shadow-2xl border-[#C66A2C]/40' : ''}`}>
            <CardContent className="p-6 space-y-4">
              <div className="text-center mb-2">
                <User className="w-10 h-10 mx-auto text-[#C66A2C] mb-2" />
                <h2 className={`text-xl font-semibold ${textClass}`}>Connexion</h2>
                <p className={`text-sm ${textClass} opacity-70 mt-1`}>Entrez votre numéro de téléphone</p>
              </div>

              <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5">
                <Phone className="w-5 h-5 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="Ex: 07 01 02 03 04"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ''))}
                  className={`border-0 bg-transparent text-lg ${soleilMode ? 'text-xl' : ''} p-0 h-auto focus-visible:ring-0`}
                  onKeyDown={(e) => e.key === 'Enter' && handlePhoneSubmit()}
                  autoFocus
                />
              </div>

              {voiceEnabled && sttAvailable && (
                <Button
                  variant="outline"
                  className={`w-full h-14 text-base ${isListening ? 'bg-[#C66A2C] text-white border-[#C66A2C]' : ''}`}
                  onClick={startListening}
                  disabled={isListening}
                >
                  <Mic className={`w-5 h-5 mr-2 ${isListening ? 'animate-pulse' : ''}`} />
                  {isListening ? 'J\'écoute...' : 'Ou dites votre nom'}
                </Button>
              )}

              {voiceEnabled && !sttAvailable && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>Reconnaissance vocale non disponible. Utilisez Chrome.</span>
                </div>
              )}

              <Button
                className="w-full h-14 text-base bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                onClick={handlePhoneSubmit}
                disabled={phone.length < 8}
              >
                Continuer
              </Button>

              {error && <p className="text-destructive text-sm text-center">{error}</p>}
            </CardContent>
          </Card>
        )}

        {/* Step: PIN Entry */}
        {(step === 'pin' || step === 'login-pin' || step === 'confirm') && (
          <Card className={`border-2 border-[#C66A2C]/20 ${soleilMode ? 'shadow-2xl border-[#C66A2C]/40' : ''}`}>
            <CardContent className="p-6 space-y-4">
              <div className="text-center mb-2">
                <Shield className="w-10 h-10 mx-auto text-[#C66A2C] mb-2" />
                <h2 className={`text-xl font-semibold ${textClass}`}>
                  {mode === 'register'
                    ? (confirmPin ? 'Confirmez votre code' : 'Créez votre code')
                    : 'Entrez votre code'}
                </h2>
                <p className={`text-sm ${textClass} opacity-70 mt-1`}>Code à 4 chiffres</p>
              </div>

              <div className="flex justify-center gap-3 my-4">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold transition-all ${
                      i < pinDisplay.length
                        ? 'border-[#C66A2C] bg-[#C66A2C]/10 text-[#C66A2C]'
                        : 'border-border'
                    } ${soleilMode ? 'w-14 h-14 text-2xl' : ''}`}
                  >
                    {showPin && i < pin.length ? pin[i] : pinDisplay[i] || ''}
                  </div>
                ))}
              </div>

              <div className="flex justify-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowPin(!showPin)}>
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <Button
                    key={num}
                    variant="outline"
                    className={`h-14 text-xl font-semibold touch-target ${soleilMode ? 'text-2xl h-16' : ''}`}
                    onClick={() => handlePinDigit(num.toString())}
                  >
                    {num}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  className="h-14 touch-target"
                  onClick={startListening}
                  disabled={!voiceEnabled || isListening || !sttAvailable}
                >
                  {isListening ? (
                    <Mic className="w-6 h-6 text-[#C66A2C] animate-pulse" />
                  ) : sttAvailable ? (
                    <MicOff className="w-6 h-6 text-muted-foreground" />
                  ) : (
                    <MicOff className="w-6 h-6 text-muted-foreground/30" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  className={`h-14 text-xl font-semibold touch-target ${soleilMode ? 'text-2xl h-16' : ''}`}
                  onClick={() => handlePinDigit('0')}
                >
                  0
                </Button>
                <Button
                  variant="ghost"
                  className="h-14 touch-target"
                  onClick={handleDeletePin}
                >
                  <span className={`text-sm font-medium ${textClass} opacity-60`}>Effacer</span>
                </Button>
              </div>

              {step === 'confirm' && (
                <div className="flex gap-2 mt-2">
                  <Button
                    className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => doLogin(phone, pin, firstName)}
                    disabled={isProcessing}
                  >
                    Oui ✓
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-12 border-destructive text-destructive"
                    onClick={() => {
                      tataSpeak('D\'accord, réentrez.')
                      setPin('')
                      setPinDisplay([])
                      setStep(mode === 'register' ? 'pin' : 'login-pin')
                    }}
                  >
                    Non ✗
                  </Button>
                </div>
              )}

              {error && <p className="text-destructive text-sm text-center">{error}</p>}
            </CardContent>
          </Card>
        )}

        {/* Phone step for registration (after voice name) */}
        {step === 'phone' && (
          <Card className="border-2 border-[#C66A2C]/20">
            <CardContent className="p-6 space-y-4">
              <div className="text-center mb-2">
                <Phone className="w-10 h-10 mx-auto text-[#C66A2C] mb-2" />
                <h2 className={`text-xl font-semibold ${textClass}`}>Bienvenue, {firstName} !</h2>
                <p className={`text-sm ${textClass} opacity-70 mt-1`}>Entrez votre numéro de téléphone</p>
              </div>

              <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5">
                <Phone className="w-5 h-5 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="Ex: 07 01 02 03 04"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ''))}
                  className="border-0 bg-transparent text-lg p-0 h-auto focus-visible:ring-0"
                  autoFocus
                />
              </div>

              <Button
                className="w-full h-14 text-base bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                onClick={() => {
                  if (phone.length < 8) { setError('Numéro invalide'); return }
                  setStep('pin')
                  tataSpeak('Créez votre code secret à 4 chiffres.')
                }}
                disabled={phone.length < 8}
              >
                Continuer
              </Button>
              {error && <p className="text-destructive text-sm text-center">{error}</p>}
            </CardContent>
          </Card>
        )}

        {/* Demo Account Hint */}
        <div className="mt-5 rounded-xl bg-[#C66A2C]/5 border border-[#C66A2C]/15 p-3">
          <p className={`text-xs font-semibold text-center ${textClass} opacity-80 mb-1`}>
            Compte de démonstration
          </p>
          <div className="flex items-center justify-center gap-3 text-xs">
            <span className={textClass}>
              <span className="opacity-60">Tél :</span>{' '}
              <span className="font-mono font-bold text-[#C66A2C]">07 01 02 03 04</span>
            </span>
            <span className="w-px h-3 bg-border" />
            <span className={textClass}>
              <span className="opacity-60">Code :</span>{' '}
              <span className="font-mono font-bold text-[#C66A2C]">1234</span>
            </span>
          </div>
        </div>

        <p className={`text-center text-xs mt-4 ${textClass} opacity-50`}>
          Jùlaba v2.0 · Votre assistant marché
        </p>
      </div>
    </div>
  )
}
