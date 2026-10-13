-- Grupos de cualquier tamaño: amigos, familias, parejas, equipos.
--  · quita el límite de 2 personas (el slug `person` ahora es libre y único)
--  · el dueño de un plan es un integrante (su slug), 'ambos' (= todo el grupo) o 'externo'
--  · se entra con un código de invitación, sin que nadie tenga que crear usuarios a mano
-- NO está aplicada en ningún proyecto: correla en el SQL editor de tu proyecto de Supabase.

alter table public.profiles drop constraint if exists profiles_person_check;
alter table public.events drop constraint if exists events_owner_check;
alter table public.events
  add constraint events_owner_check check (char_length(owner) between 1 and 40);
alter table public.profiles
  add constraint profiles_person_format check (person ~ '^[a-z0-9][a-z0-9-]{0,39}$' and person not in ('ambos', 'externo'));
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Ajustes del grupo (una sola fila).
create table if not exists public.group_settings (
  id boolean primary key default true check (id),
  invite_code text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  join_enabled boolean not null default true,
  max_members integer not null default 50 check (max_members between 2 and 500)
);
insert into public.group_settings default values on conflict (id) do nothing;
alter table public.group_settings enable row level security;

create or replace function public.is_admin() returns boolean as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$ language sql stable security definer set search_path = '';

create policy "admins read group settings" on public.group_settings for select using (public.is_admin());
create policy "admins update group settings" on public.group_settings for update
  using (public.is_admin()) with check (public.is_admin());

-- Unirse con el código. Corre con permisos elevados porque quien llama todavía no es miembro.
create or replace function public.join_group(p_code text, p_name text, p_color text)
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  s public.group_settings;
  n integer;
  base text;
  slug text;
  r public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into r from public.profiles where id = auth.uid();
  if found then return r; end if;

  select * into s from public.group_settings limit 1;
  if not s.join_enabled or p_code is distinct from s.invite_code then raise exception 'invalid invite code'; end if;
  select count(*) into n from public.profiles;
  if n >= s.max_members then raise exception 'group is full'; end if;

  base := trim(both '-' from lower(regexp_replace(coalesce(nullif(trim(p_name), ''), 'member'), '[^a-zA-Z0-9]+', '-', 'g')));
  if base = '' or base in ('ambos', 'externo') then base := 'member'; end if;
  base := left(base, 30);
  slug := base;
  while exists (select 1 from public.profiles where person = slug) loop
    slug := base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
  end loop;

  insert into public.profiles (id, person, display_name, color, is_admin)
  values (auth.uid(), slug, left(trim(coalesce(nullif(p_name, ''), 'Integrante')), 24),
          case when p_color ~ '^#[0-9a-fA-F]{6}$' then p_color else '#4C8BF5' end, n = 0)
  returning * into r;
  return r;
end $$;
revoke all on function public.join_group(text, text, text) from public, anon;
grant execute on function public.join_group(text, text, text) to authenticated;

create or replace function public.regenerate_invite_code() returns text
language plpgsql security definer set search_path = '' as $$
declare c text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.group_settings set invite_code = c;
  return c;
end $$;
revoke all on function public.regenerate_invite_code() from public, anon;
grant execute on function public.regenerate_invite_code() to authenticated;

-- El primer integrante del grupo: después de crear su usuario en Auth → Users, correr a mano:
--   insert into public.profiles (id, person, display_name, color, is_admin)
--   values ('UUID-DE-AUTH-USERS', 'ana', 'Ana', '#4C8BF5', true);
-- A partir de ahí, el resto entra solo con el código (Ajustes → Invitar).
