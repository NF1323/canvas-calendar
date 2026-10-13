-- Foto de perfil (miniatura ya recortada y comprimida desde el navegador) y edición del propio perfil
alter table public.profiles add column if not exists avatar text
  check (avatar is null or char_length(avatar) < 200000);

create policy "members update own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
