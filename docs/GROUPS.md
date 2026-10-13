# Groups of any size

Canvas Calendar was born as a calendar for two people. It now works for **any group**: a couple, a family, a flatshare, a group of friends, a small team. Everyone shares one canvas, sees each other's cursors, and every plan has an owner colour.

## How the group model works

| Concept | Meaning |
|---|---|
| **Member** | Anyone with an account that joined the group. Each member has a name, a colour and an optional photo. |
| **Owner of a plan** | One member, **Todos** (the whole group) or **Externo** (something that is not any member's: errands, outside friends…). |
| **Admin** | The member who created the group. Sees the invite link and can regenerate it. |
| **Invite code** | A secret code (inside a link like `https://your-site/?invite=abc123…`). Anyone who creates an account with it joins the group. |

There is exactly **one group per deployment** (one Supabase project). That keeps the security model simple: if you are a member you can see and edit everything; if you are not, you can see nothing.

## Setting up your group

1. Create a Supabase project and run every file in [`supabase/migrations`](../supabase/migrations) in order (`0001` … `0010`).
2. In **Auth → Users** create your own user, then in the SQL editor run the block at the bottom of `0010_groups_any_size.sql` to make yourself the first member and admin.
3. Put the project URL and the *anon* key in `public/config.js`, build and deploy `dist/` (see the main [README](../README.md)).
4. Open the app → profile menu → **Ajustes → Invitar al grupo**. Copy the link and send it to your people. They create an account and land inside the group.
5. Optional: in **Auth → Providers → Email** decide whether new accounts must confirm their email.

To close the group, set `join_enabled = false` in the `group_settings` table (or regenerate the code). To cap its size change `max_members` (default 50, up to 500).

> **Security note.** Signing up is open on purpose (that is how the invite link works), but a new account is *not* a member until it calls `join_group` with a valid code. Row-level security only lets members read or write anything. The join function is `security definer`, validates the code and the group size, and never trusts the colour or name it receives.

## What changes when there are many people

* **Presence.** The top bar shows a stack of avatars with a live "online / total" counter. Click an avatar to follow that person's camera; `+N` opens the full list.
* **Cursors.** One coloured cursor (with avatar, name and "writing…" indicator) per connected person, plus an edge arrow pointing to anyone who is off-screen.
* **Filters.** One chip per member plus *Todos* and *Externo*, with live counters. `Alt + click` isolates a person; `Alt + 1…9` toggles them from the keyboard.
* **Selections and drafts.** A day selected by someone else is outlined in their colour; a plan being typed shows up as a ghost card.
* **Minimap.** Shows a dot for every connected person.

## Scaling notes (honest numbers)

The app talks to Supabase Realtime in two ways, and each has its own limit:

1. **Data changes** (plans, arrows, objects) travel through `postgres_changes`. They are small and infrequent.
2. **Ephemeral state** (cursors, camera, selection) travels through *broadcast* messages. This is the traffic that grows with the group, so it is throttled:
   * nothing is sent when nobody else is online;
   * the interval between cursor / camera messages grows with the number of connected people: `min(6 × base, base + 22 ms × people)` — about 60 ms with one other person and 240 ms from nine others onwards.

With 20 people moving their mouse at once that is roughly 80 messages per second sent across the whole channel (each one delivered to everybody else). Supabase's free tier caps concurrent Realtime connections and messages per second, so check the quotas of your plan before inviting a very large group. For the sizes this project targets (up to a few dozen people) the free tier is enough.

What was verified: the join flow and its permissions were run against a real PostgreSQL engine (PGlite) with Supabase-style stubs, and four simultaneous members were run in the browser demo (presence, cursors, filters, shared edits). It has **not** been load-tested with dozens of simultaneous users on a live Supabase project.

## Demo mode

Without a backend the app runs in *local mode* with four sample members (Alex, Sam, Luz, Max). Open it in several browser tabs and sign in as different people to see presence and cursors; **"Unirme al grupo"** on the login screen adds more members, with no limit.
