'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, WifiOff, GraduationCap, Clock, Eye } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { haptic } from '@/lib/voice/tata-tts'
import { useNetworkStatus } from '@/lib/hooks/use-network-status'

// ============================================================
// ACADEMY SCREEN - Training courses
// ============================================================

interface AcademyCourse {
  id: string
  title: string
  excerpt: string
  duration: string
  difficulty: string
  category: string
  viewCount: number
}

type AcademyTab = 'tutoriels' | 'faq' | 'articles'

const ACADEMY_TABS: { value: AcademyTab; label: string }[] = [
  { value: 'tutoriels', label: 'Tutoriels' },
  { value: 'faq', label: 'FAQ' },
  { value: 'articles', label: 'Articles' },
]

export function AcademyScreen() {
  const { soleilMode, goBack, merchantId, openAcademyCourse } = useAppStore()
  const [courses, setCourses] = useState<AcademyCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<AcademyTab>('tutoriels')
  const online = useNetworkStatus()

  const loadCourses = useCallback(async (type: AcademyTab) => {
    if (!merchantId) return
    setLoading(true)
    try {
      // /api/marchand/contenus is the marchand-accessible read of PUBLISHED
      // contents only. The old /api/backoffice/contenus call failed 401 for
      // every marchand (it requires a backoffice permission), which is why
      // this list always came back empty.
      // Le type est paramétrable : l'Academy ne montrait JAMAIS les FAQ ni
      // les articles (type=tutoriels codé en dur).
      const res = await fetch(`/api/marchand/contenus?type=${type}&merchantId=${merchantId}`)
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setCourses(Array.isArray(data) ? data : [])
    } catch {
      setCourses([])
    } finally {
      setLoading(false)
    }
  }, [merchantId])

  useEffect(() => {
    loadCourses(activeTab)
  }, [loadCourses, activeTab])

  const handleStart = (course: AcademyCourse) => {
    haptic('light')
    openAcademyCourse(course.id)
  }

  const difficultyLabel: Record<string, string> = { debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé' }

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Académie Jùlaba</h1>
          </div>
          {!online && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-0">
              <WifiOff className="w-3 h-3 mr-1" />
              Hors ligne
            </Badge>
          )}
        </div>
        <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
          Formations pour améliorer votre commerce
        </p>
        {/* Onglets de contenu : tutoriels, FAQ et articles publiés par le BO */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {ACADEMY_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? 'bg-[#C66A2C] text-white'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {loading && (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-muted rounded animate-pulse w-full" />
                    <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
        {!loading && courses.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">
              Aucun contenu {ACADEMY_TABS.find((t) => t.value === activeTab)?.label.toLowerCase()} disponible
            </p>
            <p className="text-xs mt-1">Revenez bientôt pour découvrir nos formations</p>
          </div>
        )}
        {courses.map(course => (
          <Card key={course.id} className="cursor-pointer active:scale-[0.99] transition-transform" onClick={() => handleStart(course)}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg bg-[#C66A2C]/10 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-6 h-6 text-[#C66A2C]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${soleilMode ? 'text-black text-base' : ''}`}>{course.title}</p>
                  {course.excerpt && (
                    <p className={`text-xs text-muted-foreground mt-0.5 line-clamp-2 ${soleilMode ? 'text-base' : ''}`}>{course.excerpt}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="w-3 h-3" />{course.duration}
                    </span>
                    {course.difficulty && (
                      <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">
                        {difficultyLabel[course.difficulty] ?? course.difficulty}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Eye className="w-3 h-3" />{course.viewCount}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
