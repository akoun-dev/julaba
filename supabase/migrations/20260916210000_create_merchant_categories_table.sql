-- ============================================================================
-- Migration: table merchant_categories — nomenclature des catégories de marchands
-- Extrait de 20260916210000_marchand_categories.sql (re-baseline 1 table = 1 fichier).
--
-- Table de référence requêtable côté backoffice sans redéployer l'app :
--   * id : detaillant | semi_grossiste | grossiste (texte + CHECK plutôt
--     qu'ENUM natif : ajouter un maillon plus tard est un ALTER simple) ;
--   * position_chaine : position canonique dans la chaîne de distribution
--     producteur(0) → grossiste(1) → semi_grossiste(2) → détaillant(3) →
--     consommateur(4).
-- ============================================================================

create table if not exists public.merchant_categories (
  id text primary key check (id in ('detaillant', 'semi_grossiste', 'grossiste')),
  label text not null,
  description text not null,
  position_chaine integer not null,
  created_at timestamptz not null default now()
);

comment on table public.merchant_categories is
  'Nomenclature des catégories de marchands (détaillant, semi-grossiste, grossiste).';

alter table public.merchant_categories enable row level security;

drop policy if exists "merchant_categories readable by authenticated" on public.merchant_categories;
create policy "merchant_categories readable by authenticated"
  on public.merchant_categories for select
  to authenticated
  using (true);
