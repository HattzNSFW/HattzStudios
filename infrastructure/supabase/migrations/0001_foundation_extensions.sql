-- 0001_foundation_extensions.sql
-- Fundação: extensões e utilitários (projeto Supabase novo)
-- Não executar em bancos remotos nesta etapa.

begin;

create extension if not exists pgcrypto;

-- Schema lógico para objetos internos administrativos/auditoria quando aplicável
create schema if not exists hattz_admin;
create schema if not exists hattz_audit;

-- Tipos/enums base
do $$ begin
  create type public.publication_state as enum (
    'draft', 'validating', 'ready_to_publish', 'publishing', 'published', 'failed', 'unpublished'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sync_state as enum (
    'offline', 'sincronizando', 'sincronizado', 'pendente', 'falhou', 'conflito'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.profile_visibility as enum ('public', 'private', 'unpublished');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.collectible_rarity as enum (
    'comum', 'incomum', 'rara', 'epica', 'lendaria', 'mitica', 'especial'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.benefit_validity_type as enum ('permanent', 'temporary', 'event', 'role_bound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.grant_source_type as enum ('manual', 'automatic', 'event', 'role', 'collection_reward', 'system_test');
exception when duplicate_object then null; end $$;

-- Função utilitária de atualização de timestamp
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

commit;
