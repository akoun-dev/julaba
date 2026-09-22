// Stub vitest pour le garde « server-only » (DET-008, MODE-969) : dans
// l'environnement de test Node tout est code serveur, le garde n'a pas de
// sens — le vrai garde est appliqué par Next au build via son alias webpack
// interne (next/dist/compiled/server-only : throw côté client, empty côté
// react-server). Aliasé dans vitest.config.mts ; les tests qui mockent
// @/lib/supabase/admin via factory n'exécutent jamais le vrai module, ceux
// qui l'importent transitivement sans mock tombent ici — no-op volontaire.
module.exports = {}
