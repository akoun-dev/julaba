'use client'

// Barre de pagination + bandeau « chargés sur total » de l'écran Enrôlement
// back-office (DET-001 tranche 12, MODE-1001) — JSX verbatim depuis
// bo-enrolement-screen.tsx (pages visibles à ellipses via la lib
// enrolement-logic, boutons précédent/suivant, chargement serveur).

import type { Dispatch, SetStateAction } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ITEMS_PER_PAGE, buildPaginationPages } from '@/lib/backoffice/enrolement-logic'
import type { BoEnrolment } from '@/lib/backoffice/bo-models'

interface EnrolementPaginationProps {
  currentPage: number
  setCurrentPage: Dispatch<SetStateAction<number>>
  totalPages: number
  filteredEnrolments: BoEnrolment[]
  isDark: boolean
  enrolments: BoEnrolment[]
  enrolmentsTotal: number
  loading: boolean
  fetchMoreEnrolments: () => void
}

export function EnrolementPagination({
  currentPage,
  setCurrentPage,
  totalPages,
  filteredEnrolments,
  isDark,
  enrolments,
  enrolmentsTotal,
  loading,
  fetchMoreEnrolments,
}: EnrolementPaginationProps) {
  return (
    <>
      {/* ===== PAGINATION ===== */}
      {filteredEnrolments.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between pt-2">
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-[#333333]/60'}`}>
            Affichage {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredEnrolments.length)}
            {' '}sur {filteredEnrolments.length} enrôlements
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className={isDark ? 'text-slate-100' : 'text-[#333333]'}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Précédent
            </Button>
            <div className="flex items-center gap-1">
      {buildPaginationPages(totalPages, currentPage)
                .map((item, idx) =>
                  item === 'ellipsis' ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className={isDark ? 'px-1 text-slate-500' : 'px-1 text-[#333333]/40'}
                    >
                      …
                    </span>
                  ) : (
                    <Button
                      key={item}
                      variant={currentPage === item ? 'default' : 'outline'}
                      size="sm"
                      className={
                        currentPage === item
                          ? 'h-8 w-8 bg-[#333333] text-white hover:bg-[#333333]/90 p-0'
                          : `h-8 w-8 p-0 ${isDark ? 'text-slate-100' : 'text-[#333333]'}`
                      }
                      onClick={() => setCurrentPage(item)}
                    >
                      {item}
                    </Button>
                  )
                )}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className={isDark ? 'text-slate-100' : 'text-[#333333]'}
            >
              Suivant
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* More records exist on the server than are currently loaded */}
      {enrolments.length < enrolmentsTotal && (
        <div className={`flex items-center justify-between gap-3 pt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          <span>{enrolments.length} dossiers chargés sur {enrolmentsTotal} au total</span>
          <Button size="sm" variant="outline" disabled={loading} onClick={() => fetchMoreEnrolments()}>
            Charger plus
          </Button>
        </div>
      )}
    </>
  )
}
