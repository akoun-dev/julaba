-- MODE-937 (AUDIT-003 S-04) — codes de liaison appareil one-shot.
--
-- AVANT : /api/session/claim liait un appareil en présentant le simple id
-- du compte ; pour identificateur et coopérateur ce premier claim était
-- OUVERT (connaître l'id — exposé par les lookups — suffisait à prendre le
-- compte, DET-COOP-001).
--
-- APRÈS : le claim initial exige un code de liaison ONE-SHOT « ABCD-EFGH »
-- (sha256 en base, émis par les logins pour 10 min ou par le back-office
-- identificateur pour 30 j). La consommation est ATOMIQUE en SQL :
-- update ... where consumed_at is null and expires_at > now() returning —
-- un seul appel gagne (leçon I-07), le rejeu est physiquement impossible.
-- Le chemin compat {subjectType, id} ne fait plus que du RENOUVELLEMENT
-- d'une session existante (aucun premier claim, aucun takeover).
--
-- Contrat : service_role seul, RLS deny-all sans policy (schéma durci).

create table public.liaison_codes (
    id           uuid primary key default gen_random_uuid(),
    subject_type text not null check (subject_type in ('merchant','producteur','identificateur','cooperateur')),
    subject_id   text not null,
    code_hash    text not null unique,
    expires_at   timestamptz not null,
    consumed_at  timestamptz,
    created_by   text not null default 'login',
    created_at   timestamptz not null default now()
);

create index idx_liaison_codes_subject
    on public.liaison_codes (subject_type, subject_id);

alter table public.liaison_codes enable row level security;

-- Consomme ATOMIQUEMENT un code de liaison : renvoie
-- { subject_type, subject_id } au premier appel gagnant, null si le code
-- est inconnu, déjà consommé ou expiré. La normalisation défensive
-- (lettres seules, majuscules) est refaite ici pour qu'un appel direct ne
-- dépende pas du soin de l'appelant.
create or replace function public.consume_liaison_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_row  liaison_codes%rowtype;
    v_hash text;
begin
    v_hash := encode(
        digest(upper(regexp_replace(p_code, '[^A-Za-z]', '', 'g')), 'sha256'),
        'hex'
    );
    update liaison_codes
       set consumed_at = now()
     where code_hash = v_hash
       and consumed_at is null
       and expires_at > now()
    returning * into v_row;
    if not found then
        return null;
    end if;
    return jsonb_build_object('subject_type', v_row.subject_type, 'subject_id', v_row.subject_id);
end;
$$;

revoke all on function public.consume_liaison_code(text) from public;
revoke all on function public.consume_liaison_code(text) from anon;
revoke all on function public.consume_liaison_code(text) from authenticated;
grant execute on function public.consume_liaison_code(text) to service_role;
