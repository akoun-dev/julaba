import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { isMissingTableError } from '@/lib/backoffice/table-guard'
import { normalizeZoneKey } from '@/lib/objectifs'

// Boucle complète objectifs BO -> mission mensuelle mobile : l'app
// identificateur lit ici l'objectif que le back-office lui a fixé pour le
// mois courant. Ordre de résolution :
//   1. objectif individuel (scope=identificateur, cible = l'agent)
//   2. objectif de zone (scope=zone, cible = la zone de l'agent,
//      comparaison insensible à la casse et aux accents)
//   3. repli : boDefined=false, l'app conserve sa cible locale.
// Lecture par session appareil (requireDeviceOwner), jamais par rôle BO.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const identificateurId = searchParams.get('identificateurId')

    const auth = await requireDeviceOwner(request, 'identificateur', identificateurId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const now = new Date()
    const month = now.getMonth()
    const year = now.getFullYear()

    const { data: ident, error: identErr } = await supabase
      .from('legacy_bo_identificateurs')
      .select('id, name, zone')
      .eq('id', identificateurId!)
      .single()
    if (identErr) throw identErr

    const { data: objectifs, error } = await supabase
      .from('legacy_bo_objectifs')
      .select('scope, cible_id, cible_label, target')
      .eq('month', month)
      .eq('year', year)
    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ month, year, target: null, source: null, boDefined: false, migration_en_attente: true })
      }
      throw error
    }

    const rows = (objectifs || []) as { scope: 'identificateur' | 'zone'; cible_id: string; cible_label: string; target: number }[]

    const individuel = rows.find((o) => o.scope === 'identificateur' && o.cible_id === identificateurId)
    if (individuel) {
      return NextResponse.json({
        month, year, target: individuel.target,
        source: 'identificateur', sourceLabel: ident?.name || null, boDefined: true,
      })
    }

    const zoneKey = normalizeZoneKey(ident?.zone || '')
    if (zoneKey) {
      const zone = rows.find((o) => o.scope === 'zone' && o.cible_id === zoneKey)
      if (zone) {
        return NextResponse.json({
          month, year, target: zone.target,
          source: 'zone', sourceLabel: zone.cible_label, boDefined: true,
        })
      }
    }

    return NextResponse.json({ month, year, target: null, source: null, sourceLabel: null, boDefined: false })
  } catch (error) {
    console.error('[API identificateur/mission GET]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
