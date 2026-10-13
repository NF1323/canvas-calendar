create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  person text not null unique check (person in ('alex','sam')),
  display_name text not null,
  color text not null,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner text not null check (owner in ('alex','sam','ambos')),
  title text not null check (char_length(title) between 1 and 140),
  description_md text,
  start_date date,                -- null = está en la bandeja "Algún día"
  end_date date,                  -- null = un solo día
  all_day boolean not null default true,
  start_time time,
  end_time time,
  rrule text,                     -- ej: 'FREQ=WEEKLY;BYDAY=TU,TH'
  rrule_until date,
  done boolean not null default false,
  is_meetup boolean not null default false,  -- "Nos vemos"
  emoji text,
  sort_order double precision not null default 0,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index events_start_idx on public.events (start_date);
create index events_rrule_idx on public.events (rrule_until) where rrule is not null;

create table public.event_exceptions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  occurrence_date date not null,
  kind text not null check (kind in ('skip','override')),
  override jsonb,   -- title, description_md, start_date, start_time, end_time, owner, done
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (event_id, occurrence_date)
);

create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();
create trigger exceptions_touch before update on public.event_exceptions
  for each row execute function public.touch_updated_at();

create or replace function public.is_member() returns boolean as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$ language sql stable security definer;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_exceptions enable row level security;

create policy "members read profiles" on public.profiles for select using (public.is_member());
create policy "members all events" on public.events for all
  using (public.is_member()) with check (public.is_member() and updated_by = auth.uid());
create policy "members all exceptions" on public.event_exceptions for all
  using (public.is_member()) with check (public.is_member() and updated_by = auth.uid());

alter publication supabase_realtime add table public.events, public.event_exceptions;
alter table public.events replica identity full;
alter table public.event_exceptions replica identity full;

-- SEED: correr a mano en el SQL editor DESPUÉS de crear los dos usuarios en Auth → Users.
-- Reemplazar los UUID por los ids reales de auth.users.
-- insert into public.profiles (id, person, display_name, color) values
--   ('UUID-DE-ALEX', 'alex', 'Alex', '#4C8BF5'),
--   ('UUID-DE-SAM', 'sam', 'Sam', '#FF5C8A');
