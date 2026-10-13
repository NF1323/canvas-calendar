-- Planes sueltos: posición libre en el canvas cuando start_date es null
alter table public.events add column canvas_x double precision;
alter table public.events add column canvas_y double precision;

-- Posiciones de meses/días y flechas
create table public.canvas_items (
  id text primary key,              -- 'month:2026-10' | 'day:2026-10-08' | uuid (flecha)
  kind text not null check (kind in ('month','day','arrow')),
  data jsonb not null,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);

create trigger canvas_items_touch before update on public.canvas_items
  for each row execute function public.touch_updated_at();

alter table public.canvas_items enable row level security;
create policy "members all canvas_items" on public.canvas_items for all
  using (public.is_member()) with check (public.is_member() and updated_by = auth.uid());

alter publication supabase_realtime add table public.canvas_items;
alter table public.canvas_items replica identity full;
