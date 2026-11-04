-- Run this once in the Supabase SQL Editor before using the new features.
-- Existing jobs and columns are preserved.

alter table public.lavori
  add column if not exists appuntamento_at timestamptz,
  add column if not exists costo_ricambi numeric(10, 2) not null default 0,
  add column if not exists costo_manodopera numeric(10, 2) not null default 0,
  add column if not exists foto_url text[] not null default '{}';
