# Features

Everything below is implemented and working in the app. (UI language: Spanish.)

## Canvas and navigation
- Infinite canvas with hand-written pan / zoom: mouse wheel, trackpad pinch, touch pinch, drag, inertia.
- Animated "flights" between places (month, week, day, long weekend) using `d3` smooth zoom curves.
- Three levels of detail (far / mid / near): from a year-wide overview where month names become posters, to a single day with every plan expanded.
- Safe-area aware framing so the HUD never covers the destination.
- Minimap, zoom control, fit-to-content, `Esc` to step back out.
- Location bar: month and week dropdowns, **Esta semana** (this week) and **Finde largo** (next long weekend) shortcuts.
- Date-range picker that selects any span of days.
- Keyboard shortcuts for the main actions and a built-in help sheet.
- Dark theme by default plus light theme, reduced-motion option, UI scale that adapts to browser zoom.

## Calendar
- Months laid out as a 4-column grid; weekday headers, today marker, weekend colouring.
- National holidays with names; long-weekend detection.
- **Grid view** (tidy calendar) ↔ **custom view** (your own arrangement), one toggle.
- Move months freely; **ungroup** a month to move its days independently, with a halo that follows them; regroup any time.
- Days can be resized; plans inside re-flow; reset sizes in one click.
- Timed plans that overlap are placed side by side automatically.

## Plans (events)
- Simple, all-day, timed, multi-day.
- Recurring plans (daily / weekly / monthly / custom, with end date) via RRULE.
- Editing scopes for recurrences: this one, this and following, or all.
- Owner per plan (any member, *Todos* or *Externo*), colour-coded; filter chips with live counters and presets (mine / everyone else's / the group's / external).
- Mark as done, duplicate (Alt-drag), delete, full undo / redo.
- Markdown notes with checklists, bold, italic, links and a preview tab.
- Emoji per plan with a picker covering the full Unicode set (emoji, symbols, kaomoji) and search.
- Cover image with a draggable focal point; compact cards use the cover as a background.
- **Cover image search** from free sources (Wikipedia, Wikimedia Commons, Openverse; optional Pexels, Pixabay, Unsplash, Google), with ES→EN translation, relevance ranking and "load more".
- Attachments: images and PDFs; PDFs over 15 MB are compressed in the browser.
- Highlighted ("featured") plans with a countdown banner.
- One click opens the details; no double-click needed anywhere.

## Free-form objects
- Plans without a date live in a **tray** (or float on the canvas); drag them onto a day to schedule them, or back to unschedule.
- Paste or drop images, text, links, YouTube videos and PDFs straight onto the canvas; resize and move them.
- Drop an object onto a plan to attach it.
- **Arrows** between months, days, plans or objects: fully curved, they route around other months, can carry a label, and can be reshaped by dragging a handle.
- Marquee selection of days; move the group together; apply a tag, colour and comment to the whole selection.
- Day inspector panel with the plans of the selected days and quick actions.

## Groups and collaboration
- **Any number of members** in one shared canvas: couples, families, flatmates, friends, teams.
- Join with an **invite link / code** (regenerable by the admin); no need to create users by hand. Group size is capped by `max_members` (default 50).
- Email / password auth; row-level security restricts everything to members.
- Presence: avatar stack with a live online counter, last-seen times, follow any member's camera.
- One coloured live cursor per connected person, with name, avatar, "writing…" indicator and an edge arrow when they are off-screen.
- Real-time sync of plans, canvas items, selections, drafts and drags; partial offline tolerance with automatic retry.
- Ephemeral traffic (cursors, camera) is throttled by group activity and silent when you are alone.
- Per-person filters with live counters, plus *Todos* (whole group) and *Externo* owners.
- Profile editor: display name, colour and photo.

## Performance and robustness
- Only what is on screen is rendered; images are converted once and reused.
- Effects are paused while the camera moves to keep gestures at 60 fps.
- Lazy-loaded heavy modules (PDF tools, HEIC decoding, emoji dataset).
- Error boundary, safe local persistence, graceful degradation to local mode.

## Backend
- Postgres schema versioned in `supabase/migrations` (0001 … 0010; group join and invite codes in 0010).
- Row-level security on every table, driven by an `is_member()` helper.
- Realtime on plans and canvas items; broadcast channels for ephemeral state.
- Private storage bucket for uploaded files with signed URLs.
- Scheduled keep-alive job so a free-tier project does not pause.

## Demo mode
- Runs with no backend at all: data in `localStorage`, tabs sync via `BroadcastChannel`, four sample members plus *join as a new member*.
- One-click sample data with generated covers, recurring plans, arrows and tags.
