-- Nuevo dueño posible: 'externo' (algo que no es de ninguno de los dos: trámites, amigos, familia, etc.)
alter table public.events drop constraint if exists events_owner_check;
alter table public.events
  add constraint events_owner_check check (owner in ('alex','sam','ambos','externo'));
