# Cómo publicarlo en LinkedIn (guía + textos)

## Orden: GitHub → demo online → LinkedIn

| | Solo imágenes en LinkedIn | Repo + demo + imágenes (recomendado) |
|---|---|---|
| Credibilidad | "Dice que lo hizo" | Cualquiera puede ver el código y probarlo |
| Reclutadores técnicos | Ven capturas | Revisan código, README, arquitectura |

Reglas de oro:
1. **Los videos / imágenes van subidos directo a LinkedIn.** LinkedIn castiga los posts cuyo contenido principal es un link.
2. **El link al repo y a la demo va en el primer comentario**, no en el cuerpo del post.
3. El repo es tu respaldo: sin él, un proyecto "hecho con IA" se lee como humo; con él, se lee como evidencia.

## Material disponible

- `docs/readme/hero.gif` — el GIF de portada del repo (grupo en vivo).
- `docs/gifs/` — 24 GIFs, uno por función (ver `docs/FEATURE_SHOWCASE.md`).
- `docs/screenshots/` — 9 capturas a 1920 px.
- `clips-4k/` — un MP4 por función (60 fps, 2560×1440). **No está en git** (pesa); es lo que conviene subir directo a LinkedIn. Para un video único, concatená los que quieras con ffmpeg.

## Checklist antes de publicar

- [x] Repo público con historial limpio, sin claves ni datos personales.
- [ ] *Social preview* del repo: subir `docs/screenshots/01-group-live-cursors.png` (Settings → General).
- [ ] Fijar el repo en tu perfil de GitHub.
- [ ] Demo online (Netlify → *Import from Git* → el repo). Con `config.js` vacío entra con "Explorar con datos de ejemplo" y sin cuenta. Probala en el celular y poné la URL en el README.
- [ ] Revisar que el gancho entre en las dos primeras líneas del post.

## Formato

- **Un video nativo de 45–60 s** (varios clips de `clips-4k/` encadenados): arranca con el grupo en vivo (clip 24), sigue con zoom → mover/desagrupar meses → redimensionar día → flechas → adjuntar archivos → buscador de portadas.
- Subtitulado (se mira en silencio). Máximo 3–5 hashtags.
- Post de seguimiento 2–3 días después: carrusel PDF de 8 láminas con `docs/screenshots/` y un aprendizaje técnico puntual.

## Buenas prácticas

- Contá **qué construiste, cómo trabajaste con la IA y qué aprendiste**, no solo "mirá qué lindo".
- Sé honesto con el rol de la IA: vos definiste el producto, tomaste las decisiones y revisaste; la IA escribió gran parte del código.
- No inventes métricas. Datos verificables: ~9.600 líneas de TS/TSX/CSS, 10 migraciones SQL, tiempo real con Supabase, demo sin backend, grupos de cualquier tamaño con invitación por link.
- Publicá martes a jueves por la mañana y respondé todos los comentarios en la primera hora.
- Actualizá el perfil: *Destacados* (post + repo) y *Proyectos* (link a la demo).

---

## Post — español (recomendado)

> Construí un calendario sobre un canvas infinito para que lo use todo un grupo. Casi todo el código lo escribió una IA. 🧵

Un calendario es una grilla. Tus planes no.

**Canvas Calendar** pone el año entero en una sola superficie infinita: movés los meses donde quieras, estirás un día hasta que aparecen las horas, conectás planes con flechas y soltás un PDF sobre el plan al que pertenece. Y se usa en grupo: pareja, familia, amigos, equipo. Cada persona tiene su color y su cursor, y un link invita a la siguiente.

Lo que tiene adentro:
🗺️ Zoom infinito, del año completo a un solo día
👥 Presencia y cursores en vivo para cualquier cantidad de personas
➡️ Flechas curvas que esquivan los meses
📎 Archivos pegados en el canvas y adjuntos descargables
🔁 Planes recurrentes, de varios días y con portadas
🔒 Seguridad a nivel de fila en Postgres

Lo que más me sorprendió trabajando con una IA:
→ La IA ejecuta muy bien; el valor está en decidir qué construir y cuándo decir "así no".
→ Iterar en lenguaje natural acelera todo, pero cada cambio hay que probarlo en un navegador real.
→ Pedirle que mida rendimiento y que audite la seguridad funcionó mejor que "hacelo más rápido".

Código abierto, con modo demo sin registro. Link en el primer comentario 👇

¿Qué calendario (o herramienta) que usás hoy te gustaría ver como un canvas?

#IA #React #TypeScript #Supabase

**Primer comentario**
> 🔗 Repo: https://github.com/NF1323/canvas-calendar
> 🚀 Demo (sin cuenta): *(pegar la URL de Netlify cuando esté lista)*
> Hecho con React + TypeScript + Supabase. El README explica la arquitectura y cómo armar tu propio grupo.

---

## Post — English

> I built a calendar on an infinite canvas that a whole group can share. An AI wrote most of the code. 🧵

A calendar is a grid. Your plans aren't.

**Canvas Calendar** puts the whole year on one infinite surface: move months wherever you like, stretch a day until its hours appear, connect plans with arrows, drop a PDF onto the plan it belongs to. And it's built for groups — couples, families, friends, teams. Everyone gets a colour and a live cursor, and one link invites the next person.

Inside:
🗺️ Infinite zoom, from a full year to a single day
👥 Live presence and cursors for any number of people
➡️ Curved arrows that route around months
📎 Files dropped on the canvas, downloadable attachments
🔁 Recurring and multi-day plans with cover images
🔒 Row-level security in Postgres

What surprised me most working with an AI:
→ AI is great at execution; the value is deciding what to build and when to say "not like that".
→ Iterating in plain language speeds everything up, but every change still needs testing in a real browser.
→ Asking it to measure performance and audit security worked better than "make it faster".

Open source, with a no-signup demo mode. Link in the first comment 👇

Which calendar (or tool) you use today would you like to see as a canvas?

#AI #React #TypeScript #Supabase
