-- Punto focal de la portada de un plan ("x y" en porcentaje)
alter table public.events add column if not exists cover_pos text
  check (cover_pos is null or char_length(cover_pos) < 20);

-- Objetos pegados en el canvas (imágenes, textos, links, videos, PDF)
alter table public.canvas_items drop constraint if exists canvas_items_kind_check;
alter table public.canvas_items
  add constraint canvas_items_kind_check check (kind in ('month','day','arrow','mark','obj'));

-- Archivos (imágenes y PDF): bucket privado, solo los miembros leen y escriben
insert into storage.buckets (id, name, public, file_size_limit)
values ('canvas-files', 'canvas-files', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "members read canvas files" on storage.objects;
drop policy if exists "members insert canvas files" on storage.objects;
drop policy if exists "members update canvas files" on storage.objects;
drop policy if exists "members delete canvas files" on storage.objects;

create policy "members read canvas files" on storage.objects for select to authenticated
  using (bucket_id = 'canvas-files' and public.is_member());
create policy "members insert canvas files" on storage.objects for insert to authenticated
  with check (bucket_id = 'canvas-files' and public.is_member());
create policy "members update canvas files" on storage.objects for update to authenticated
  using (bucket_id = 'canvas-files' and public.is_member());
create policy "members delete canvas files" on storage.objects for delete to authenticated
  using (bucket_id = 'canvas-files' and public.is_member());
