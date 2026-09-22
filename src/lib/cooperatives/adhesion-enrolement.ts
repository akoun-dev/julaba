import 'server-only'

// DET-COOP-007 (MODE-978) — adhésion coopérative automatique à l'enrôlement.
//
// Référence julaba-app §7 (identifications.controller l.395-418) : quand un
// dossier d'identification porte l'intention « ce marchand adhère à la
// coopérative X » (estMembreCooperative + cooperativeId), l'adhésion est
// créée DÈS L'ENRÔLEMENT — actif=true, rôle 'membre' — sans attendre une
// action manuelle du président. julaba applique la même sémantique au
// moment où POST /api/backoffice/enrolments provisionne le compte marchand
// (provisionAccount crée le compte AVANT la validation BO du dossier, donc
// l'adhésion suit le compte, pas la validation).
//
// Différences assumées avec la demande d'adhésion « rejoindre » (statut
// en_attente, acceptation par le président) : ici l'agent de terrain a
// physiquement enrôlé l'acteur et renseigné sa coopérative — le comportement
// de référence est l'activation directe. Les garde-fous restent la base :
// UNIQUE (cooperative_id, membre_id) et l'index partiel uniq_coop_membre_actif
// (« une seule adhésion active par marchand ») — un marchand déjà géré par
// une coopérative n'est JAMAIS réactivé ni déplacé en silence : la fonction
// renvoie un verdict honnête et laisse le président décider.
//
// La création est NON BLOQUANTE pour le dossier : un échec d'adhésion ne
// doit jamais perdre un dossier enrôlé (le président garde la possibilité
// d'ajouter le marchand manuellement, comme avant ce module).

/** Verdict honnête renvoyé à l'appelant (route + agent via la réponse HTTP). */
export type VerdictAdhesionEnrolement =
  | 'creee' // adhésion créée (actif, rôle membre, date du jour)
  | 'deja_membre' // une adhésion existe déjà pour ce couple (coop, marchand) — quel que soit son statut ; le président en a la gestion
  | 'deja_actif_ailleurs' // le marchand a déjà une adhésion ACTIVE dans une AUTRE coopérative (invariant « une seule adhésion active »)
  | 'coop_absente' // coopérative inconnue ou désactivée — rien créé
  | 'erreur' // toute autre erreur SQL — journalisée côté serveur, non bloquante

interface ErreurSql {
  message?: string
  code?: string
}

/** Chaîne de builder Supabase à la fois AWAITABLE (résultat {data,error})
 *  et CHAINABLE (eq, maybeSingle) — couvre les deux lectures du module :
 *  cooperatives (eq×2 + maybeSingle) et cooperative_membres (eq×1 + await). */
interface ChaineAdhesion extends Promise<{ data: unknown; error: ErreurSql | null }> {
  eq: (col: string, val: unknown) => ChaineAdhesion
  maybeSingle: () => Promise<{ data: unknown; error: ErreurSql | null }>
}

interface SupabaseAdhesion {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => ChaineAdhesion
    }
    insert: (row: Record<string, unknown>) => Promise<{ error: ErreurSql | null }>
  }
}

function aujourdhuiIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Crée l'adhésion (actif, membre) du marchand fraîchement enrôlé dans la
 * coopérative visée, ou renvoie un verdict honnête SANS jamais lever :
 * la route d'enrôlement appelle cette fonction en best-effort.
 */
export async function creerAdhesionDepuisEnrolement(
  supabase: SupabaseAdhesion,
  params: { cooperativeId: string; marchandId: string; dateAdhesion?: string }
): Promise<VerdictAdhesionEnrolement> {
  try {
    // 1. La coopérative doit exister ET être active — une référence
    // obsolète (coop supprimée/désactivée entre la saisie et l'envoi) ne
    // crée jamais une adhésion orpheline.
    const { data: coop } = await supabase
      .from('cooperatives')
      .select('id')
      .eq('id', params.cooperativeId)
      .eq('actif', true)
      .maybeSingle()
    if (!coop) return 'coop_absente'

    // 2. Toutes les adhésions EXISTANTES du marchand (toutes coopéras
    // confondues — un marchand n'a au plus que quelques lignes) :
    //   • déjà une ligne pour CETTE coop (en_attente/suspendu/exclu
    //     compris) → le président gère déjà ce marchand, on ne touche pas ;
    //   • une ligne ACTIVE ailleurs → invariant « une seule adhésion
    //     active » : transfert = décision du président, pas du dossier.
    const { data: existantes, error: erreurLecture } = (await supabase
      .from('cooperative_membres')
      .select('id, cooperative_id, actif')
      .eq('membre_id', params.marchandId)) as { data: unknown; error: ErreurSql | null }
    if (erreurLecture) {
      console.error('[adhesion-enrolement] lecture adhésions existantes', erreurLecture)
      return 'erreur'
    }
    const lignes = (existantes ?? []) as Array<{ cooperative_id: string; actif: boolean }>
    if (lignes.some((l) => l.cooperative_id === params.cooperativeId)) return 'deja_membre'
    if (lignes.some((l) => l.actif)) return 'deja_actif_ailleurs'

    // 3. Insertion (le trigger MODE-922 maintient le miroir actif=true).
    const { error } = await supabase.from('cooperative_membres').insert({
      cooperative_id: params.cooperativeId,
      membre_id: params.marchandId,
      statut: 'actif',
      role: 'membre',
      date_adhesion: params.dateAdhesion ?? aujourdhuiIso(),
      cotisation_payee: false,
    })
    if (error) {
      // Course (autre instance a inséré entre la lecture et l'écriture) :
      // la contrainte UNIQUE a parlé — même verdict qu'une ligne lue.
      if (error.code === '23505') return 'deja_membre'
      console.error('[adhesion-enrolement] insertion', error)
      return 'erreur'
    }
    return 'creee'
  } catch (e) {
    console.error('[adhesion-enrolement] exception', e)
    return 'erreur'
  }
}
