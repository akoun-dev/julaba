/**
 * Banc IndexedDB (MODE-1010-bis) — harnais de validation Chromium réel.
 *
 * Bundle le module RÉEL du dépôt (src/lib/offline-db.ts, 0 copie, 0 mock)
 * et l'expose au banc sous window.BANC_MOD. Le flag de build est rendu
 * mutable par scénario via define : process.env.JULABA_QUEUE_STORE ->
 * window.__JULABA_QUEUE_STORE (même sémantique que next.config env :
 * constante lue au moment de resolveQueueStore).
 */
import * as offlineDb from '../../src/lib/offline-db'

;(globalThis as Record<string, unknown>).BANC_MOD = offlineDb
