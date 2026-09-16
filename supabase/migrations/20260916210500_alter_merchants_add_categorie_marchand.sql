-- Migration: merchants — colonne categorie_marchand + backfill par défaut
-- Extrait de 20260916210000_marchand_categories.sql (re-baseline 1 objet = 1 fichier).
--
-- App marchande : profil de connexion. Backfill réfléchi : tout marchand déjà
-- provisionné sans catégorie est un utilisateur de l'app de vente au détail —
-- 'detaillant' est la valeur par défaut la plus probable, corrigeable ensuite
-- au backoffice.

alter table public.merchants
  add column if not exists categorie_marchand text
    check (categorie_marchand is null or categorie_marchand in ('detaillant', 'semi_grossiste', 'grossiste'));

update public.merchants
set categorie_marchand = 'detaillant'
where categorie_marchand is null;
