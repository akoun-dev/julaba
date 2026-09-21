'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Building2,
  Save,
  Pencil,
  X,
  Globe,
  Shield,
  Bell,
  Link2,
  MapPin,
  Phone,
  Mail,
  Upload,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

// ============== TYPES ==============

interface SectionState {
  editing: boolean
  saving: boolean
}

// ============== SUB COMPONENTS ==============

function SectionHeader({ sectionKey, icon, title, sectionStates, toggleEdit, handleSave, handleCancel, isDark }: {
  sectionKey: string
  icon: React.ReactNode
  title: string
  sectionStates: Record<string, SectionState>
  toggleEdit: (section: string) => void
  handleSave: (section: string) => void
  handleCancel: (section: string) => void
  isDark: boolean
}) {
  const state = sectionStates[sectionKey]
  return (
    <div className="flex items-center justify-between">
      <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
        {icon}
        {title}
      </CardTitle>
      <div className="flex gap-2">
        {state?.editing ? (
          <>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleCancel(sectionKey)}>
              <X className="h-3 w-3 mr-1" /> Annuler
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={() => handleSave(sectionKey)} disabled={state?.saving}>
              {state?.saving ? (
                <span className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><Save className="h-3 w-3 mr-1" /> Enregistrer</>
              )}
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toggleEdit(sectionKey)}>
            <Pencil className="h-3 w-3 mr-1" /> Modifier
          </Button>
        )}
      </div>
    </div>
  )
}

// ============== MAIN COMPONENT ==============

export function BoConfigInstitutionScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Section editing states
  const [sectionStates, setSectionStates] = useState<Record<string, SectionState>>({
    general: { editing: false, saving: false },
    platform: { editing: false, saving: false },
    security: { editing: false, saving: false },
    notifications: { editing: false, saving: false },
    integrations: { editing: false, saving: false },
  })

  // Section 1: General Info
  const [general, setGeneral] = useState({
    name: '',
    logo: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    siret: '',
  })

  // Section 2: Platform Settings
  const [platform, setPlatform] = useState({
    language: 'fr',
    currency: 'XOF',
    timezone: 'Africa/Abidjan',
    dateFormat: 'DD/MM/YYYY',
    defaultZone: 'Adjamé',
  })

  // Section 3: Security
  const [security, setSecurity] = useState({
    sessionTimeout: 30,
    passwordMinLength: 12,
    passwordRequireUppercase: true,
    passwordRequireNumbers: true,
    passwordRequireSpecial: true,
    maxLoginAttempts: 5,
    lockoutDuration: 15,
  })

  // Section 4: Notifications
  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    smsAlerts: false,
    pushAlerts: true,
    alertOnLogin: true,
    alertOnFailedLogin: true,
    alertOnDataExport: true,
    alertOnCriticalError: true,
    digestFrequency: 'immediat',
  })

  // Section 5: Integrations
  const [integrations, setIntegrations] = useState({
    dgeApiEndpoint: '',
    ansutApiEndpoint: '',
    dgeApiKey: '',
    ansutApiKey: '',
    webhookUrl: '',
    webhookSecret: '',
  })

  // GET /api/backoffice/config returns one JSON blob per section, keyed by
  // section name (data.general, data.platform, ...) — see PATCH below, which
  // writes { category: <section>, ...sectionFields }. Only fields the
  // backend actually has saved come back; anything missing keeps the
  // useState default declared above.
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/config')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()

      if (data.general) setGeneral((prev) => ({ ...prev, ...data.general }))
      if (data.platform) setPlatform((prev) => ({ ...prev, ...data.platform }))
      if (data.security) setSecurity((prev) => ({ ...prev, ...data.security }))
      if (data.notifications) setNotifications((prev) => ({ ...prev, ...data.notifications }))
      if (data.integrations) setIntegrations((prev) => ({ ...prev, ...data.integrations }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleEdit = (section: string) => {
    setSectionStates(prev => ({
      ...prev,
      [section]: { editing: !prev[section].editing, saving: false },
    }))
  }

  const sectionData: Record<string, Record<string, unknown>> = {
    general, platform, security, notifications, integrations,
  }

  const handleSave = async (section: string) => {
    setSectionStates(prev => ({
      ...prev,
      [section]: { editing: false, saving: true },
    }))
    try {
      const res = await fetch('/api/backoffice/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: section, ...sectionData[section] }),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur d\'enregistrement')
    } finally {
      setSectionStates(prev => ({
        ...prev,
        [section]: { editing: false, saving: false },
      }))
    }
  }

  const handleCancel = (section: string) => {
    setSectionStates(prev => ({
      ...prev,
      [section]: { editing: false, saving: false },
    }))
  }

  // Skeleton card wrapper for loading state
  const SkeletonCard = ({ children }: { children: React.ReactNode }) => (
    <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'}`}>
      <CardHeader className="pb-3">
        <Skeleton className={`h-5 w-48 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  )

  if (loading) {
    return (
      <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')}>
        <div>
          <Skeleton className={`h-8 w-72 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <Skeleton className={`h-4 w-64 mt-2 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
        </div>
        <Separator />
        <SkeletonCard>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className={`h-3 w-32 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-9 w-full ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className={`h-3 w-28 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-9 w-full ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard>
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className={`h-4 w-48 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-5 w-9 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className={`h-4 w-40 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-5 w-9 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard>
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton className={`h-4 w-48 mb-3 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Skeleton className={`h-3 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                    <Skeleton className={`h-9 w-full ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className={`h-3 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                    <Skeleton className={`h-9 w-full ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>
    )
  }

  if (error) {
    return (
      <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')}>
        <BoPageHeader
          title="Config institution"
          description="Configuration générale de l'institution et de la plateforme"
        />
        <Separator />
        <BoErrorBanner message={error} onRetry={fetchData} />
      </div>
    )
  }

  return (
    <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')}>
      {/* Header */}
      <BoPageHeader
        title="Config institution"
        description="Configuration générale de l'institution et de la plateforme"
      />

      <Separator />

      {/* Section 1: Informations générales */}
      <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
        <CardHeader className="pb-3">
          <SectionHeader sectionKey="general" icon={<Building2 className="h-4 w-4" />} title="Informations générales" sectionStates={sectionStates} toggleEdit={toggleEdit} handleSave={handleSave} handleCancel={handleCancel} isDark={isDark} />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nom de l&apos;institution</Label>
              <Input
                value={general.name}
                onChange={(e) => setGeneral({ ...general, name: e.target.value })}
                disabled={!sectionStates.general.editing}
              />
            </div>
            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex gap-2">
                <Input
                  value={general.logo}
                  onChange={(e) => setGeneral({ ...general, logo: e.target.value })}
                  disabled={!sectionStates.general.editing}
                />
                {sectionStates.general.editing && (
                  <Button variant="outline" size="sm" className="shrink-0 h-9">
                    <Upload className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Adresse</Label>
              <div className="relative">
                <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                <Input
                  className="pl-9"
                  value={general.address}
                  onChange={(e) => setGeneral({ ...general, address: e.target.value })}
                  disabled={!sectionStates.general.editing}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <div className="relative">
                <Phone className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                <Input
                  className="pl-9"
                  value={general.phone}
                  onChange={(e) => setGeneral({ ...general, phone: e.target.value })}
                  disabled={!sectionStates.general.editing}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <div className="relative">
                <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                <Input
                  className="pl-9"
                  value={general.email}
                  onChange={(e) => setGeneral({ ...general, email: e.target.value })}
                  disabled={!sectionStates.general.editing}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Site web</Label>
              <Input
                value={general.website}
                onChange={(e) => setGeneral({ ...general, website: e.target.value })}
                disabled={!sectionStates.general.editing}
              />
            </div>
            <div className="space-y-2">
              <Label>N° SIRET / Enregistrement</Label>
              <Input
                value={general.siret}
                onChange={(e) => setGeneral({ ...general, siret: e.target.value })}
                disabled={!sectionStates.general.editing}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Paramètres Plateforme */}
      <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
        <CardHeader className="pb-3">
          <SectionHeader sectionKey="platform" icon={<Globe className="h-4 w-4" />} title="Paramètres Plateforme" sectionStates={sectionStates} toggleEdit={toggleEdit} handleSave={handleSave} handleCancel={handleCancel} isDark={isDark} />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Langue</Label>
              <Select
                value={platform.language}
                onValueChange={(v) => setPlatform({ ...platform, language: v })}
                disabled={!sectionStates.platform.editing}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Devise</Label>
              <Select
                value={platform.currency}
                onValueChange={(v) => setPlatform({ ...platform, currency: v })}
                disabled={!sectionStates.platform.editing}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="XOF">FCFA (XOF)</SelectItem>
                  <SelectItem value="EUR">Euro (EUR)</SelectItem>
                  <SelectItem value="USD">Dollar (USD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fuseau horaire</Label>
              <Select
                value={platform.timezone}
                onValueChange={(v) => setPlatform({ ...platform, timezone: v })}
                disabled={!sectionStates.platform.editing}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Africa/Abidjan">GMT+0 (Abidjan)</SelectItem>
                  <SelectItem value="Africa/Lagos">GMT+1 (Lagos)</SelectItem>
                  <SelectItem value="Europe/Paris">GMT+1/2 (Paris)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Format de date</Label>
              <Select
                value={platform.dateFormat}
                onValueChange={(v) => setPlatform({ ...platform, dateFormat: v })}
                disabled={!sectionStates.platform.editing}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">JJ/MM/AAAA</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/JJ/AAAA</SelectItem>
                  <SelectItem value="YYYY-MM-DD">AAAA-MM-JJ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Sécurité */}
      <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
        <CardHeader className="pb-3">
          <SectionHeader sectionKey="security" icon={<Shield className="h-4 w-4" />} title="Sécurité" sectionStates={sectionStates} toggleEdit={toggleEdit} handleSave={handleSave} handleCancel={handleCancel} isDark={isDark} />
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Expiration de session (minutes)</Label>
                <Input
                  type="number"
                  value={security.sessionTimeout}
                  onChange={(e) => setSecurity({ ...security, sessionTimeout: parseInt(e.target.value) || 30 })}
                  disabled={!sectionStates.security.editing}
                />
              </div>
              <div className="space-y-2">
                <Label>Tentatives max avant verrouillage</Label>
                <Input
                  type="number"
                  value={security.maxLoginAttempts}
                  onChange={(e) => setSecurity({ ...security, maxLoginAttempts: parseInt(e.target.value) || 5 })}
                  disabled={!sectionStates.security.editing}
                />
              </div>
              <div className="space-y-2">
                <Label>Durée de verrouillage (minutes)</Label>
                <Input
                  type="number"
                  value={security.lockoutDuration}
                  onChange={(e) => setSecurity({ ...security, lockoutDuration: parseInt(e.target.value) || 15 })}
                  disabled={!sectionStates.security.editing}
                />
              </div>
              <div className="space-y-2">
                <Label>Longueur min. mot de passe</Label>
                <Input
                  type="number"
                  value={security.passwordMinLength}
                  onChange={(e) => setSecurity({ ...security, passwordMinLength: parseInt(e.target.value) || 8 })}
                  disabled={!sectionStates.security.editing}
                />
              </div>
            </div>

            <Separator />

            {/* Password policy toggles */}
            <div className="space-y-4">
              <Label className="text-sm font-medium">Politique de mot de passe</Label>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Requérir des majuscules</p>
                </div>
                <Switch
                  checked={security.passwordRequireUppercase}
                  onCheckedChange={(v) => setSecurity({ ...security, passwordRequireUppercase: v })}
                  disabled={!sectionStates.security.editing}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Requérir des chiffres</p>
                </div>
                <Switch
                  checked={security.passwordRequireNumbers}
                  onCheckedChange={(v) => setSecurity({ ...security, passwordRequireNumbers: v })}
                  disabled={!sectionStates.security.editing}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Requérir des caractères spéciaux</p>
                </div>
                <Switch
                  checked={security.passwordRequireSpecial}
                  onCheckedChange={(v) => setSecurity({ ...security, passwordRequireSpecial: v })}
                  disabled={!sectionStates.security.editing}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Notifications */}
      <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
        <CardHeader className="pb-3">
          <SectionHeader sectionKey="notifications" icon={<Bell className="h-4 w-4" />} title="Notifications" sectionStates={sectionStates} toggleEdit={toggleEdit} handleSave={handleSave} handleCancel={handleCancel} isDark={isDark} />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Alertes par Email</Label>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Recevoir les alertes système par email</p>
              </div>
              <Switch
                checked={notifications.emailAlerts}
                onCheckedChange={(v) => setNotifications({ ...notifications, emailAlerts: v })}
                disabled={!sectionStates.notifications.editing}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Alertes par SMS</Label>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Recevoir les alertes critiques par SMS</p>
              </div>
              <Switch
                checked={notifications.smsAlerts}
                onCheckedChange={(v) => setNotifications({ ...notifications, smsAlerts: v })}
                disabled={!sectionStates.notifications.editing}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Alertes Push</Label>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Notifications push sur les appareils autorisés</p>
              </div>
              <Switch
                checked={notifications.pushAlerts}
                onCheckedChange={(v) => setNotifications({ ...notifications, pushAlerts: v })}
                disabled={!sectionStates.notifications.editing}
              />
            </div>

            <Separator />

            <Label className="text-sm font-medium">Événements notifiés</Label>
            <div className="flex items-center justify-between">
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Connexion réussie</p>
              <Switch
                checked={notifications.alertOnLogin}
                onCheckedChange={(v) => setNotifications({ ...notifications, alertOnLogin: v })}
                disabled={!sectionStates.notifications.editing}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Tentative de connexion échouée</p>
              <Switch
                checked={notifications.alertOnFailedLogin}
                onCheckedChange={(v) => setNotifications({ ...notifications, alertOnFailedLogin: v })}
                disabled={!sectionStates.notifications.editing}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Export de données</p>
              <Switch
                checked={notifications.alertOnDataExport}
                onCheckedChange={(v) => setNotifications({ ...notifications, alertOnDataExport: v })}
                disabled={!sectionStates.notifications.editing}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Erreur critique système</p>
              <Switch
                checked={notifications.alertOnCriticalError}
                onCheckedChange={(v) => setNotifications({ ...notifications, alertOnCriticalError: v })}
                disabled={!sectionStates.notifications.editing}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Fréquence du résumé</Label>
              <Select
                value={notifications.digestFrequency}
                onValueChange={(v) => setNotifications({ ...notifications, digestFrequency: v })}
                disabled={!sectionStates.notifications.editing}
              >
                <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediat">Immédiat</SelectItem>
                  <SelectItem value="hourly">Toutes les heures</SelectItem>
                  <SelectItem value="daily">Quotidien</SelectItem>
                  <SelectItem value="weekly">Hebdomadaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Intégrations */}
      <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
        <CardHeader className="pb-3">
          <SectionHeader sectionKey="integrations" icon={<Link2 className="h-4 w-4" />} title="Intégrations" sectionStates={sectionStates} toggleEdit={toggleEdit} handleSave={handleSave} handleCancel={handleCancel} isDark={isDark} />
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* DGE */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Direction Générale des Entreprises (DGE)
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>API Endpoint</Label>
                  <Input
                    value={integrations.dgeApiEndpoint}
                    onChange={(e) => setIntegrations({ ...integrations, dgeApiEndpoint: e.target.value })}
                    disabled={!sectionStates.integrations.editing}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Clé API</Label>
                  <Input
                    type="password"
                    value={integrations.dgeApiKey}
                    onChange={(e) => setIntegrations({ ...integrations, dgeApiKey: e.target.value })}
                    disabled={!sectionStates.integrations.editing}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* ANSUT */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                ANSUT
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>API Endpoint</Label>
                  <Input
                    value={integrations.ansutApiEndpoint}
                    onChange={(e) => setIntegrations({ ...integrations, ansutApiEndpoint: e.target.value })}
                    disabled={!sectionStates.integrations.editing}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Clé API</Label>
                  <Input
                    type="password"
                    value={integrations.ansutApiKey}
                    onChange={(e) => setIntegrations({ ...integrations, ansutApiKey: e.target.value })}
                    disabled={!sectionStates.integrations.editing}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Webhooks */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                Webhooks
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>URL du Webhook</Label>
                  <Input
                    value={integrations.webhookUrl}
                    onChange={(e) => setIntegrations({ ...integrations, webhookUrl: e.target.value })}
                    disabled={!sectionStates.integrations.editing}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Secret</Label>
                  <Input
                    type="password"
                    value={integrations.webhookSecret}
                    onChange={(e) => setIntegrations({ ...integrations, webhookSecret: e.target.value })}
                    disabled={!sectionStates.integrations.editing}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}