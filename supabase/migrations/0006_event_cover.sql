-- Portada opcional de un plan (imagen ya recortada y comprimida desde el navegador, como data URL)
alter table public.events add column if not exists cover text
  check (cover is null or char_length(cover) < 400000);
