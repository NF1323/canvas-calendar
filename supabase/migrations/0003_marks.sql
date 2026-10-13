-- Etiquetas / colores para rangos de días ("Viaje a Buenos Aires")
alter table public.canvas_items drop constraint if exists canvas_items_kind_check;
alter table public.canvas_items
  add constraint canvas_items_kind_check check (kind in ('month','day','arrow','mark'));
