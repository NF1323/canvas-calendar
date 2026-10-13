-- Adjuntos de un plan (imágenes, PDF, links, videos y notas): lista de objetos; los archivos viven en el bucket canvas-files
alter table public.events add column if not exists attachments jsonb not null default '[]'::jsonb
  check (jsonb_typeof(attachments) = 'array');
