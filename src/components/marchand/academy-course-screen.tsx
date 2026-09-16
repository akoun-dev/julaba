'use client'

/**
 * Academy course reader — renders a published training_content as a
 * readable, scrollable article (replaces the stub behavior where tapping a
 * course only announced its title out loud).
 *
 * Product decisions:
 * - The reader is a full screen, not a sheet: course content is the primary
 *   task here and can be long; a modal would fight the bottom bar and the
 *   sticky headers.
 * - Markdown comes from the backoffice (bo-contenus editor). Rendered with
 *   a small explicit element map (no typography plugin in this project).
 * - "Écouter" reads the excerpt/opening paragraph — deliberately not the
 *   whole course (a 10-minute read is several minutes of speech; the
 *   merchant should choose to start it, and Tata's single-callback TTS
 *   queue makes very long utterances un-cancellable from the UI).
 * - The view count is incremented server-side by the [id] route.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Clock, Eye, GraduationCap, PlayCircle, User } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useAppStore } from '@/lib/stores/app-store'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'

interface CourseDetail {
  id: string
  title: string
  content: string
  excerpt: string | null
  author: string | null
  difficulty: string | null
  duration: string | null
  viewCount: number
}

const difficultyLabel: Record<string, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
}

/** First ~2 sentences of the markdown body, stripped of markup markers —
 * enough for Tata to announce what the course is about without a
 * multi-minute utterance. */
function openingSpeech(content: string): string {
  const plain = content
    .replace(/[#*_>`~\-]+/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  const sentences = plain.split(/(?<=[.!?])\s+/)
  return sentences.slice(0, 2).join(' ') || plain.slice(0, 160)
}

export function AcademyCourseScreen() {
  const { soleilMode, goBack, merchantId, academyCourseId, closeAcademyCourse } = useAppStore()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const loadCourse = useCallback(async () => {
    if (!merchantId || !academyCourseId) return
    setLoadError(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/marchand/contenus/${academyCourseId}?merchantId=${merchantId}`)
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setCourse(data)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [merchantId, academyCourseId])

  useEffect(() => {
    loadCourse()
  }, [loadCourse])

  const handleBack = () => {
    closeAcademyCourse()
    goBack()
  }

  const handleListen = () => {
    if (!course) return
    tataSpeak(openingSpeech(course.excerpt ? `${course.excerpt}. ${course.content}` : course.content))
    haptic('light')
  }

  const labelClass = soleilMode ? 'text-black' : ''

  return (
    <div className="screen-enter pb-24">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour à l'Académie">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={`truncate ${soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}`}>
            {course?.title ?? 'Académie'}
          </h1>
        </div>
      </div>

      {loading && (
        <div className="px-4 mt-4 space-y-3">
          <div className="h-6 w-3/4 bg-muted rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-5 w-20 bg-muted rounded-full animate-pulse" />
            <div className="h-5 w-24 bg-muted rounded-full animate-pulse" />
          </div>
          <div className="space-y-2 pt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-4 bg-muted rounded animate-pulse" style={{ width: `${100 - (i % 3) * 12}%` }} />
            ))}
          </div>
        </div>
      )}

      {!loading && loadError && (
        <div className="px-4 mt-6">
          <Card className="border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40">
            <CardContent className="p-6 text-center">
              <GraduationCap className="w-10 h-10 mx-auto mb-2 text-red-400" />
              <p className={`text-sm font-medium text-red-700 dark:text-red-300 ${soleilMode ? 'text-base text-black' : ''}`}>
                Impossible de charger ce cours
              </p>
              <p className={`text-xs text-red-600/80 dark:text-red-400/80 mt-1 ${soleilMode ? 'text-base' : ''}`}>
                Vérifiez votre connexion puis réessayez
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={loadCourse}>
                Réessayer
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {!loading && !loadError && course && (
        <article className="px-4 mt-4">
          <h2 className={`text-xl font-bold leading-snug ${soleilMode ? 'text-black' : ''}`}>{course.title}</h2>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {course.difficulty && (
              <Badge variant="secondary" className="text-[10px]">
                {difficultyLabel[course.difficulty] ?? course.difficulty}
              </Badge>
            )}
            {course.duration && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="w-3 h-3" />{course.duration}
              </span>
            )}
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Eye className="w-3 h-3" />{course.viewCount} vues
            </span>
            {course.author && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <User className="w-3 h-3" />{course.author}
              </span>
            )}
          </div>

          <Button
            variant="outline"
            className="mt-3 border-[#C66A2C]/40 text-[#C66A2C] hover:bg-[#FDF3ED] hover:text-[#B55D25] min-h-11"
            onClick={handleListen}
          >
            <PlayCircle className="w-4 h-4 mr-1" />
            Écouter le début
          </Button>

          <Separator className="my-4" />

          <div className={`prose-julaba text-sm leading-relaxed space-y-3 ${labelClass}`}>
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h2 className={`text-lg font-bold mt-4 mb-2 ${soleilMode ? 'text-black' : ''}`}>{children}</h2>,
                h2: ({ children }) => <h3 className={`text-base font-bold mt-4 mb-2 ${soleilMode ? 'text-black' : ''}`}>{children}</h3>,
                h3: ({ children }) => <h4 className={`text-sm font-semibold mt-3 mb-1 ${soleilMode ? 'text-black' : ''}`}>{children}</h4>,
                p: ({ children }) => <p className={soleilMode ? 'text-base text-black' : ''}>{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
                li: ({ children }) => <li className={soleilMode ? 'text-base text-black' : ''}>{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                a: ({ children, href }) => (
                  <span className="text-[#C66A2C] underline break-all">{children}</span>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-[#C66A2C]/40 pl-3 text-muted-foreground italic">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {course.content}
            </ReactMarkdown>
          </div>
        </article>
      )}
    </div>
  )
}
