-- Migration: tokens de notifications push (Task 29)
-- Un token FCM (Android) ou APNs (iOS) par appareil, rattaché au subject de
-- session appareil (« merchant:<id> », « producteur:<id> », …). Le client
-- natif poste son token sur /api/push-tokens ; l'upsert se fait sur token
-- UNIQUE : un appareil qui se reconnecte sous un autre compte réattribue sa
-- ligne, les push suivants partent au compte courant (jamais à l'ancien
-- propriétaire du device).
--
-- Pas de RLS : la table n'est lue/écrite que par le client admin serveur
-- (routes /api/push-tokens), le subject venant du cookie de session — même
-- modèle de confiance que legacy_notifications (Task 28). L'ENVOI réel des
-- push (FCM HTTP v1 / APNs) est une étape serveur séparée, voir
-- docs/CAPACITOR.md § Notifications push.

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_device_push_tokens_subject
  on public.device_push_tokens (subject);

comment on table public.device_push_tokens is
  'Tokens push FCM/APNs par appareil (Task 29) — upsert sur token ; l''envoi réel se fait côté serveur via FCM/APNs.';
