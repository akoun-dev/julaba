'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Eye, EyeOff, Mic, MicOff, Phone, User, Shield, Info, Lock, Grid3X3 } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { tataSpeak, tataStop, playBeep, haptic } from '@/lib/voice/tata-tts'
import { parseVoicePin } from '@/lib/voice/localIntent'
import { isSTTAvailable, createSingleShotSTT, type STTSession } from '@/lib/voice/stt'
import { PatternLock } from '@/components/marchand/pattern-lock'
import { cn } from '@/lib/utils'

type AuthMethod = 'pin' | 'pattern'
type AuthStep = 'name' | 'phone' | 'pin' | 'confirm' | 'login-pin' | 'choose-method' | 'pattern-create' | 'pattern-confirm' | 'pattern-login'

interface MerchantData {
  id: string
  firstName: string
  phone: string
  pinHash: string
  patternHash?: string
  authMethod: 'pin' | 'pattern' | 'both'
}

const simpleHash = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString()
}

const patternToHash = (pattern: number[]) => simpleHash(pattern.join('-'))
const loadMerchant = (phone: string): MerchantData | null => {
  const raw = localStorage.getItem(`julaba-merchant-${phone}`)
  return raw ? JSON.parse(raw) : null
}
const saveMerchant = (data: MerchantData) =>
  localStorage.setItem(`julaba-merchant-${data.phone}`, JSON.stringify(data))

export function AuthScreen() {
  const { setAuth, soleilMode, voiceEnabled } = useAppStore()

  // --- State ---
  const [step, setStep] = useState<AuthStep>('name')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [authMethod, setAuthMethod] = useState<AuthMethod>('pin')
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
  const [patternError, setPatternError] = useState(false)
  const [patternSuccess, setPatternSuccess] = useState(false)
  const [createdPattern, setCreatedPattern] = useState<number[] | null>(null)

  const [sttAvailable, setSttAvailable] = useState(() => typeof window !== 'undefined' && isSTTAvailable())
  const [micChecked, setMicChecked] = useState(false)
  const sttSessionRef = useRef<STTSession | null>(null)

  // Check mic access on mount (async, non-blocking)
  useEffect(() => {
    if (!sttAvailable || !voiceEnabled) { setMicChecked(true); return }
    if (!navigator.mediaDevices?.getUserMedia) { setSttAvailable(false); setMicChecked(true); return }
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        // Mic works — release immediately
        stream.getTracks().forEach(t => t.stop())
        setMicChecked(true)
      })
      .catch(() => {
        setSttAvailable(false)
        setMicChecked(true)
      })
  }, [])

  // Refs for STT callbacks
  const phoneRef = useRef(phone)
  const firstNameRef = useRef(firstName)
  const pinRef = useRef(pin)
  const stepRef = useRef(step)
  const modeRef = useRef(mode)
  const confirmPinRef = useRef(confirmPin)
  const voiceAttemptsRef = useRef(voiceAttempts)

  phoneRef.current = phone
  firstNameRef.current = firstName
  pinRef.current = pin
  stepRef.current = step
  modeRef.current = mode
  confirmPinRef.current = confirmPin
  voiceAttemptsRef.current = voiceAttempts

  // --- Login logic ---
  const doLogin = useCallback((phoneVal: string, nameVal: string) => {
    setIsProcessing(true)
    setError('')
    try {
      const id = crypto.randomUUID()
      playBeep('success')
      haptic('success')
      tataSpeak(`Bonjour Maman ${nameVal} ! Bienvenue sur Jùlaba.`)
      setAuth(id, nameVal, phoneVal)
    } catch {
      setError('Erreur de connexion.')
      playBeep('error')
    } finally {
      setIsProcessing(false)
    }
  }, [setAuth])

  // --- Voice ---
  const handleVoiceResult = useCallback((transcript: string) => {
    const lower = transcript.toLowerCase().trim()
    const currentStep = stepRef.current

    if (currentStep === 'name') {
      const nameMatch = lower.match(/(?:je m\'|m\')?appelle\s+([\w\sàâäéèêëïîôùûüÿçñæœ]+?)(?:\s*(?:mon numéro|mon code|c'est|voilà|$))/i)
      let name: string
      if (nameMatch && nameMatch[1].trim().length >= 2) {
        name = nameMatch[1].trim()
      } else {
        name = lower.replace(/^(bonjour|salut|je suis|oui|merci)\s*/gi, '').replace(/\s+(mon|c'est|voilà|merci|oui).*$/gi, '').trim()
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
        setError("Je n'ai pas compris le nom. Réessayez.")
        tataSpeak("Je n'ai pas bien compris. Répétez votre nom.")
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
          tataSpeak("Je n'ai pas entendu 4 chiffres. Répétez ?")
          setError('Dites exactement 4 chiffres.')
        }
      }
    } else if (currentStep === 'confirm') {
      if (/^(oui|c\'?est (?:ça|ca)|exact|c\'?est bon)/i.test(lower)) {
        // validate and login
        const stored = loadMerchant(phoneRef.current || 'demo')
        if (stored && simpleHash(pinRef.current) === stored.pinHash) {
          doLogin(stored.phone, stored.firstName)
        } else {
          doLogin(phoneRef.current, firstNameRef.current)
        }
      } else if (/^non/i.test(lower)) {
        tataSpeak("D'accord, réentrez votre code.")
        setPin('')
        pinRef.current = ''
        setPinDisplay([])
        setStep(modeRef.current === 'register' ? 'pin' : 'login-pin')
        stepRef.current = modeRef.current === 'register' ? 'pin' : 'login-pin'
      }
    }
  }, [doLogin])

  const startListening = useCallback(() => {
    if (!voiceEnabled || isListening || !sttAvailable || !micChecked) return
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
          tataSpeak("Je n'ai rien entendu. Réessayez.")
          setError('Aucune parole détectée.')
        } else if (err === 'aborted') {
          /* silent */
        } else {
          // Any other error (not-allowed, audio-capture, network, service-not-available, etc.)
          // → disable voice for this session to avoid repeated failures
          setSttAvailable(false)
          if (err === 'not-allowed') {
            setError('Micro non autorisé. Utilisez le clavier.')
          } else if (err === 'audio-capture') {
            setError('Aucun micro détecté.')
          } else {
            playBeep('error')
            setError('Micro indisponible. Utilisez le clavier.')
          }
        }
      },
      onEnd: () => { setIsListening(false) },
    })
    sttSessionRef.current.start()
  }, [voiceEnabled, isListening, sttAvailable, handleVoiceResult])

  // --- Phone submit ---
  const handlePhoneSubmit = () => {
    if (phone.length < 8) { setError('Entrez un numéro valide.'); return }
    setError('')
    const stored = loadMerchant(phone)
    if (stored) {
      setFirstName(stored.firstName)
      firstNameRef.current = stored.firstName
      setMode('login')
      modeRef.current = 'login'
      // Route to the correct auth method
      if (stored.authMethod === 'pattern') {
        setAuthMethod('pattern')
        setStep('pattern-login')
        stepRef.current = 'pattern-login'
        tataSpeak(`Bonjour Maman ${stored.firstName} ! Dessinez votre schéma.`)
      } else if (stored.authMethod === 'both') {
        setStep('choose-method')
        stepRef.current = 'choose-method'
        tataSpeak(`Bonjour Maman ${stored.firstName} ! Choisissez votre méthode.`)
      } else {
        setAuthMethod('pin')
        setStep('login-pin')
        stepRef.current = 'login-pin'
        tataSpeak(`Bonjour Maman ${stored.firstName} ! Dites votre code à 4 chiffres.`)
      }
    } else {
      setMode('register')
      modeRef.current = 'register'
      setStep('choose-method')
      stepRef.current = 'choose-method'
      tataSpeak('Choisissez comment vous voulez vous connecter.')
    }
    haptic('light')
  }

  // --- Method choice ---
  const handleChooseMethod = (method: AuthMethod) => {
    setAuthMethod(method)
    setMode('register')
    modeRef.current = 'register'
    if (method === 'pin') {
      setStep('pin')
      stepRef.current = 'pin'
      tataSpeak('Créez votre code secret à 4 chiffres.')
    } else {
      setStep('pattern-create')
      stepRef.current = 'pattern-create'
      setCreatedPattern(null)
      setPatternError(false)
      tataSpeak('Dessinez votre schéma secret. Au moins 4 points.')
    }
  }

  // --- Switch method on login ---
  const handleSwitchMethod = (method: AuthMethod) => {
    setAuthMethod(method)
    setPatternError(false)
    setPatternSuccess(false)
    setCreatedPattern(null)
    setError('')
    if (method === 'pin') {
      setPin('')
      pinRef.current = ''
      setPinDisplay([])
      setStep('login-pin')
      stepRef.current = 'login-pin'
      tataSpeak('Entrez votre code à 4 chiffres.')
    } else {
      setStep('pattern-login')
      stepRef.current = 'pattern-login'
      tataSpeak('Dessinez votre schéma.')
    }
  }

  // --- Pattern creation ---
  const handlePatternCreate = (pattern: number[]) => {
    if (createdPattern === null) {
      // First draw — store and ask for confirmation
      setCreatedPattern(pattern)
      haptic('success')
      setStep('pattern-confirm')
      stepRef.current = 'pattern-confirm'
      tataSpeak('Dessinez à nouveau pour confirmer.')
    }
  }

  const handlePatternConfirm = (pattern: number[]) => {
    if (createdPattern && pattern.join('-') === createdPattern.join('-')) {
      // Match!
      haptic('success')
      setPatternSuccess(true)
      playBeep('success')
      const id = crypto.randomUUID()
      const merchantData: MerchantData = {
        id,
        firstName: firstName || 'Awa',
        phone,
        pinHash: '', // no PIN set
        patternHash: patternToHash(pattern),
        authMethod: 'pattern',
      }
      saveMerchant(merchantData)
      localStorage.setItem('julaba-last-name', merchantData.firstName)
      tataSpeak(`Compte créé ! Bonjour Maman ${merchantData.firstName} !`)
      setTimeout(() => doLogin(phone, merchantData.firstName), 600)
    } else {
      // Mismatch
      haptic('error')
      playBeep('error')
      setPatternError(true)
      setError('Les schémas ne correspondent pas. Réessayez.')
      tataSpeak('Les schémas sont différents. Réessayez.')
      setTimeout(() => {
        setCreatedPattern(null)
        setPatternError(false)
        setStep('pattern-create')
        stepRef.current = 'pattern-create'
        tataSpeak('Dessinez votre schéma secret à nouveau.')
      }, 1200)
    }
  }

  // --- Pattern login ---
  const handlePatternLogin = (pattern: number[]) => {
    const stored = loadMerchant(phone)
    if (stored && stored.patternHash === patternToHash(pattern)) {
      haptic('success')
      setPatternSuccess(true)
      playBeep('success')
      tataSpeak(`Bonjour Maman ${stored.firstName} !`)
      setTimeout(() => doLogin(phone, stored.firstName), 400)
    } else {
      haptic('error')
      playBeep('error')
      setPatternError(true)
      setError('Schéma incorrect.')
      tataSpeak('Schéma incorrect. Réessayez.')
      setTimeout(() => setPatternError(false), 1200)
    }
  }

  // --- PIN logic ---
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
            const merchantData: MerchantData = {
              id, firstName, phone,
              pinHash: simpleHash(confirmPin),
              authMethod: 'pin',
            }
            saveMerchant(merchantData)
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

  const attemptLogin = () => {
    const stored = loadMerchant(phone || 'demo')
    if (stored && simpleHash(pin) === stored.pinHash) {
      playBeep('success')
      haptic('success')
      tataSpeak(`Bonjour Maman ${stored.firstName} ! Bienvenue sur Jùlaba.`)
      setAuth(stored.id, stored.firstName, stored.phone)
    } else {
      doLogin(phone, firstName)
    }
  }

  // --- Effects ---
  useEffect(() => {
    if (voiceEnabled) {
      const t = setTimeout(() => {
        tataSpeak('Bonjour ! Bienvenue sur Jùlaba. Entrez votre numéro ou dites votre nom.')
      }, 500)
      return () => clearTimeout(t)
    }
  }, [])

  useEffect(() => () => { sttSessionRef.current?.abort() }, [])

  // --- Render ---
  const textClass = soleilMode ? 'text-black text-lg' : 'text-foreground'

  const MethodToggle = ({ current }: { current: AuthMethod }) => (
    <div className='flex gap-1 bg-muted rounded-xl p-1'>
      <button
        onClick={() => current === 'pin' ? null : (mode === 'register' ? handleChooseMethod('pin') : handleSwitchMethod('pin'))}
        className={cn(
          'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center',
          current === 'pin' ? 'bg-white shadow-sm text-[#C66A2C]' : 'text-muted-foreground'
        )}
      >
        <Lock className='w-4 h-4' />
        Code
      </button>
      <button
        onClick={() => current === 'pattern' ? null : (mode === 'register' ? handleChooseMethod('pattern') : handleSwitchMethod('pattern'))}
        className={cn(
          'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center',
          current === 'pattern' ? 'bg-white shadow-sm text-[#C66A2C]' : 'text-muted-foreground'
        )}
      >
        <Grid3X3 className='w-4 h-4' />
        Schéma
      </button>
    </div>
  )

  return (
    <div className='min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5]'>
      <div className='w-full max-w-sm'>
        {/* Logo */}
        <div className='text-center mb-8'>
          <div className='w-20 h-20 rounded-2xl mx-auto mb-4 shadow-lg overflow-hidden'>
            <img src='/icon-only.png' alt='Jùlaba' className='w-full h-full object-contain' />
          </div>
          <h1 className={cn('text-3xl font-bold text-[#C66A2C]', soleilMode && 'text-2xl')}>Jùlaba</h1>
          <p className={cn('text-sm mt-1', textClass, 'opacity-70')}>Votre assistant marché</p>
        </div>

        {/* ===== STEP: Name / Phone ===== */}
        {step === 'name' && (
          <Card className={cn('border-2 border-[#C66A2C]/20', soleilMode && 'shadow-2xl border-[#C66A2C]/40')}>
            <CardContent className='p-6 space-y-4'>
              <div className='text-center mb-2'>
                <User className='w-10 h-10 mx-auto text-[#C66A2C] mb-2' />
                <h2 className={cn('text-xl font-semibold', textClass)}>Connexion</h2>
                <p className={cn('text-sm', textClass, 'opacity-70 mt-1')}>Entrez votre numéro de téléphone</p>
              </div>
              <div className='flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5'>
                <Phone className='w-5 h-5 text-muted-foreground' />
                <Input
                  type='tel'
                  placeholder='Ex: 07 01 02 03 04'
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ''))}
                  className={cn('border-0 bg-transparent text-lg', soleilMode && 'text-xl', 'p-0 h-auto focus-visible:ring-0')}
                  onKeyDown={(e) => e.key === 'Enter' && handlePhoneSubmit()}
                  autoFocus
                />
              </div>
              {voiceEnabled && sttAvailable && micChecked && (
                <Button
                  variant='outline'
                  className={cn('w-full h-14 text-base', isListening && 'bg-[#C66A2C] text-white border-[#C66A2C]')}
                  onClick={startListening}
                  disabled={isListening}
                >
                  <Mic className={cn('w-5 h-5 mr-2', isListening && 'animate-pulse')} />
                  {isListening ? "J'écoute..." : 'Ou dites votre nom'}
                </Button>
              )}
              {voiceEnabled && (!sttAvailable || !micChecked) && (
                <div className='flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3'>
                  <MicOff className='w-4 h-4 shrink-0' />
                  <span>{!micChecked ? 'Vérification du micro...' : 'Micro non disponible. Utilisez le clavier.'}</span>
                </div>
              )}
              <Button
                className='w-full h-14 text-base bg-[#C66A2C] hover:bg-[#B55D25] text-white'
                onClick={handlePhoneSubmit}
                disabled={phone.length < 8}
              >
                Continuer
              </Button>
              {error && <p className='text-destructive text-sm text-center'>{error}</p>}
            </CardContent>
          </Card>
        )}

        {/* ===== STEP: Phone (after voice name) ===== */}
        {step === 'phone' && (
          <Card className='border-2 border-[#C66A2C]/20'>
            <CardContent className='p-6 space-y-4'>
              <div className='text-center mb-2'>
                <Phone className='w-10 h-10 mx-auto text-[#C66A2C] mb-2' />
                <h2 className={cn('text-xl font-semibold', textClass)}>Bienvenue, {firstName} !</h2>
                <p className={cn('text-sm', textClass, 'opacity-70 mt-1')}>Entrez votre numéro de téléphone</p>
              </div>
              <div className='flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5'>
                <Phone className='w-5 h-5 text-muted-foreground' />
                <Input
                  type='tel'
                  placeholder='Ex: 07 01 02 03 04'
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ''))}
                  className='border-0 bg-transparent text-lg p-0 h-auto focus-visible:ring-0'
                  autoFocus
                />
              </div>
              <Button
                className='w-full h-14 text-base bg-[#C66A2C] hover:bg-[#B55D25] text-white'
                onClick={() => {
                  if (phone.length < 8) { setError('Numéro invalide'); return }
                  setError('')
                  setMode('register')
                  modeRef.current = 'register'
                  setStep('choose-method')
                  stepRef.current = 'choose-method'
                  tataSpeak('Choisissez comment vous connecter.')
                }}
                disabled={phone.length < 8}
              >
                Continuer
              </Button>
              {error && <p className='text-destructive text-sm text-center'>{error}</p>}
            </CardContent>
          </Card>
        )}

        {/* ===== STEP: Choose method (register or login with both) ===== */}
        {step === 'choose-method' && (
          <Card className={cn('border-2 border-[#C66A2C]/20', soleilMode && 'shadow-2xl border-[#C66A2C]/40')}>
            <CardContent className='p-6 space-y-5'>
              <div className='text-center mb-2'>
                <Shield className='w-10 h-10 mx-auto text-[#C66A2C] mb-2' />
                <h2 className={cn('text-xl font-semibold', textClass)}>
                  {mode === 'register' ? 'Choisissez votre sécurité' : 'Méthode de connexion'}
                </h2>
                <p className={cn('text-sm', textClass, 'opacity-70 mt-1')}>
                  {mode === 'register'
                    ? 'Comment voulez-vous protéger votre compte ?'
                    : 'Comment souhaitez-vous vous connecter ?'}
                </p>
              </div>
              <div className='space-y-3'>
                <button
                  onClick={() => handleChooseMethod('pattern')}
                  className='w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border hover:border-[#C66A2C]/40 hover:bg-[#C66A2C]/5 transition-all active:scale-[0.98]'
                >
                  <div className='w-12 h-12 rounded-xl bg-[#C66A2C]/10 flex items-center justify-center'>
                    <Grid3X3 className='w-6 h-6 text-[#C66A2C]' />
                  </div>
                  <div className='text-left'>
                    <p className={cn('font-semibold', textClass)}>Schéma</p>
                    <p className={cn('text-xs', textClass, 'opacity-60')}>Dessin secret sur la grille</p>
                  </div>
                </button>
                <button
                  onClick={() => handleChooseMethod('pin')}
                  className='w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border hover:border-[#C66A2C]/40 hover:bg-[#C66A2C]/5 transition-all active:scale-[0.98]'
                >
                  <div className='w-12 h-12 rounded-xl bg-[#C66A2C]/10 flex items-center justify-center'>
                    <Lock className='w-6 h-6 text-[#C66A2C]' />
                  </div>
                  <div className='text-left'>
                    <p className={cn('font-semibold', textClass)}>Code PIN</p>
                    <p className={cn('text-xs', textClass, 'opacity-60')}>4 chiffres secrets</p>
                  </div>
                </button>
              </div>
              {error && <p className='text-destructive text-sm text-center'>{error}</p>}
            </CardContent>
          </Card>
        )}

        {/* ===== STEP: PIN entry / login ===== */}
        {(step === 'pin' || step === 'login-pin' || step === 'confirm') && (
          <Card className={cn('border-2 border-[#C66A2C]/20', soleilMode && 'shadow-2xl border-[#C66A2C]/40')}>
            <CardContent className='p-6 space-y-4'>
              <div className='text-center mb-2'>
                <Shield className='w-10 h-10 mx-auto text-[#C66A2C] mb-2' />
                <h2 className={cn('text-xl font-semibold', textClass)}>
                  {mode === 'register'
                    ? (confirmPin ? 'Confirmez votre code' : 'Créez votre code')
                    : 'Entrez votre code'}
                </h2>
                <p className={cn('text-sm', textClass, 'opacity-70 mt-1')}>Code à 4 chiffres</p>
              </div>
              <div className='flex justify-center gap-3 my-4'>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      'w-12 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold transition-all',
                      i < pinDisplay.length ? 'border-[#C66A2C] bg-[#C66A2C]/10 text-[#C66A2C]' : 'border-border',
                      soleilMode && 'w-14 h-14 text-2xl'
                    )}
                  >
                    {showPin && i < pin.length ? pin[i] : pinDisplay[i] || ''}
                  </div>
                ))}
              </div>
              <div className='flex justify-center gap-2'>
                <Button variant='ghost' size='sm' onClick={() => setShowPin(!showPin)}>
                  {showPin ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
                </Button>
              </div>
              <div className='grid grid-cols-3 gap-2'>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <Button
                    key={num}
                    variant='outline'
                    className={cn('h-14 text-xl font-semibold touch-target', soleilMode && 'text-2xl h-16')}
                    onClick={() => handlePinDigit(num.toString())}
                  >
                    {num}
                  </Button>
                ))}
                <Button variant='ghost' className='h-14 touch-target' onClick={startListening}
                  disabled={!voiceEnabled || isListening || !sttAvailable || !micChecked}>
                  {isListening
                    ? <Mic className='w-6 h-6 text-[#C66A2C] animate-pulse' />
                    : (sttAvailable && micChecked)
                      ? <Mic className='w-6 h-6 text-muted-foreground' />
                      : <MicOff className='w-6 h-6 text-muted-foreground/30' />}
                </Button>
                <Button variant='outline' className={cn('h-14 text-xl font-semibold touch-target', soleilMode && 'text-2xl h-16')}
                  onClick={() => handlePinDigit('0')}>{0}</Button>
                <Button variant='ghost' className='h-14 touch-target' onClick={handleDeletePin}>
                  <span className={cn('text-sm font-medium', textClass, 'opacity-60')}>Effacer</span>
                </Button>
              </div>
              {step === 'confirm' && (
                <div className='flex gap-2 mt-2'>
                  <Button className='flex-1 h-12 bg-green-600 hover:bg-green-700 text-white' onClick={attemptLogin} disabled={isProcessing}>
                    Oui ✓
                  </Button>
                  <Button variant='outline' className='flex-1 h-12 border-destructive text-destructive'
                    onClick={() => { tataSpeak("D'accord, réentrez."); setPin(''); setPinDisplay([]); setStep(mode === 'register' ? 'pin' : 'login-pin') }}>
                    Non ✗
                  </Button>
                </div>
              )}
              {step === 'login-pin' && (
                <button
                  type='button'
                  className='w-full text-center text-sm text-[#C66A2C] hover:underline mt-1'
                  onClick={() => handleSwitchMethod('pattern')}
                >
                  Dessiner le schéma
                </button>
              )}
              {error && <p className='text-destructive text-sm text-center'>{error}</p>}
            </CardContent>
          </Card>
        )}

        {/* ===== STEP: Pattern Create / Confirm / Login ===== */}
        {(step === 'pattern-create' || step === 'pattern-confirm' || step === 'pattern-login') && (
          <Card className={cn('border-2 border-[#C66A2C]/20', soleilMode && 'shadow-2xl border-[#C66A2C]/40')}>
            <CardContent className='p-6 space-y-4'>
              <div className='text-center mb-2'>
                <Grid3X3 className='w-10 h-10 mx-auto text-[#C66A2C] mb-2' />
                <h2 className={cn('text-xl font-semibold', textClass)}>
                  {step === 'pattern-create' && 'Dessinez votre schéma'}
                  {step === 'pattern-confirm' && 'Confirmez votre schéma'}
                  {step === 'pattern-login' && 'Dessinez pour vous connecter'}
                </h2>
                <p className={cn('text-sm', textClass, 'opacity-70 mt-1')}>
                  {step === 'pattern-create' && 'Reliez au moins 4 points'}
                  {step === 'pattern-confirm' && 'Redessinez le même schéma'}
                  {step === 'pattern-login' && 'Reproduisez votre schéma secret'}
                </p>
              </div>

              <div className='flex justify-center py-2'>
                <PatternLock
                  onComplete={step === 'pattern-create'
                    ? handlePatternCreate
                    : step === 'pattern-confirm'
                      ? handlePatternConfirm
                      : handlePatternLogin}
                  disabled={isProcessing}
                  error={patternError}
                  success={patternSuccess}
                  size={soleilMode ? 290 : 260}
                />
              </div>

              {error && <p className='text-destructive text-sm text-center'>{error}</p>}

              {step === 'pattern-login' && (
                <button
                  type='button'
                  className='w-full text-center text-sm text-[#C66A2C] hover:underline mt-1'
                  onClick={() => handleSwitchMethod('pin')}
                >
                  Saisir le code
                </button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Demo Account Hint */}
        <div className='mt-5 rounded-xl bg-[#C66A2C]/5 border border-[#C66A2C]/15 p-3'>
          <p className={cn('text-xs font-semibold text-center', textClass, 'opacity-80 mb-1')}>Compte de démonstration</p>
          <div className='flex items-center justify-center gap-3 text-xs'>
            <span className={textClass}>
              <span className='opacity-60'>Tél :</span>{' '}
              <span className='font-mono font-bold text-[#C66A2C]'>07 01 02 03 04</span>
            </span>
            <span className='w-px h-3 bg-border' />
            <span className={textClass}>
              <span className='opacity-60'>Code :</span>{' '}
              <span className='font-mono font-bold text-[#C66A2C]'>1234</span>
            </span>
          </div>
        </div>

        <p className={cn('text-center text-xs mt-4', textClass, 'opacity-50')}>Jùlaba v2.0 · Votre assistant marché</p>
      </div>
    </div>
  )
}
