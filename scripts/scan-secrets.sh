#!/usr/bin/env bash
# MODE-1005 (AUDIT-012 P2) — scanner de secrets pour la CI.
#
# Contexte : le dépôt a vécu deux classes d'incidents réels de secrets
# publics — PAT GitHub (ghp_…, SEC-402 volet PAT, révoqué) et jeton
# Supabase Management API (sbp_…, à rotation après usage). Ce scanner
# rejette TOUTE nouvelle occurrence de motifs à très haut signal dans
# l'arbre suivi (ripgrep respecte .gitignore : .env, .next, node_modules,
# bun.lockb sont exclus d'office).
#
# Volontairement SANS dépendance : un échec CI = ligne + fichier + motif.
# Placeholders de .env.example (« replace-with-… », « example.invalid »)
# ne matchent aucun motif — testé au dry-run d'implémentation.

set -euo pipefail
cd "$(dirname "$0")/.."

PATTERNS=(
  'ghp_[A-Za-z0-9]{30,}'                                  # PAT GitHub classique
  'github_pat_[A-Za-z0-9_]{20,}'                          # PAT GitHub fine-grained
  'sbp_[A-Za-z0-9]{40,}'                                  # Supabase Access Token (Management API)
  'SUPABASE_SERVICE_ROLE_KEY=eyJ'                         # vraie clé service_role JWT assignée
  'sk_live_[A-Za-z0-9]{20,}'                              # clé Stripe live
  'AKIA[0-9A-Z]{16}'                                      # AWS access key id
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'       # clé privée embarquée
)

fails=0
for pat in "${PATTERNS[@]}"; do
  hits=$(rg -n --hidden \
    -g '!node_modules' -g '!.git' -g '!.next' -g '!bun.lockb' -g '!*.lock' \
    -g '!scripts/scan-secrets.sh' \
    -e "$pat" . 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "✗ SECRET DÉTECTÉ — motif : $pat"
    echo "$hits"
    fails=$((fails + 1))
  fi
done

if [ "$fails" -gt 0 ]; then
  echo ""
  echo "scanner secrets : $fails motif(s) déclenché(s) — révoquer le secret exposé,"
  echo "le retirer de l'arbre (git rm --cached si suivi) puis purger l'historique."
  exit 1
fi

echo "scanner secrets : 0 occurrence (${#PATTERNS[@]} motifs vérifiés)"
