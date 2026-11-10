-- Run this once in the Supabase SQL Editor before using the new features.
-- Existing jobs and columns are preserved.

alter table public.lavori
  add column if not exists tipo_oggetto text not null default 'veicolo',
  add column if not exists appuntamento_at timestamptz,
  add column if not exists costo_ricambi numeric(10, 2) not null default 0,
  add column if not exists costo_manodopera numeric(10, 2) not null default 0,
  add column if not exists foto_url text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lavori-foto',
  'lavori-foto',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can view job photos" on storage.objects;
create policy "Authenticated users can view job photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'lavori-foto');

drop policy if exists "Authenticated users can upload job photos" on storage.objects;
create policy "Authenticated users can upload job photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'lavori-foto');

drop policy if exists "Authenticated users can delete job photos" on storage.objects;
create policy "Authenticated users can delete job photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'lavori-foto');
