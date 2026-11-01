# Taskflow — Tasks & Time

Static HTML/CSS/JavaScript task manager. Existing task fields and focus timer are retained. Tasks remain local without a Supabase connection; when connected, Supabase Auth, PostgreSQL, Realtime and a per-account IndexedDB cache provide cross-device sync and offline edits.

## Setup

1. Create a Supabase project and enable Email auth under **Authentication → Providers**. Configure email confirmation and password reset redirect URLs for your deployed site.
2. Run both SQL migrations, in order: [`202611010001_tasks_sync.sql`](supabase/migrations/202611010001_tasks_sync.sql), then [`202611010002_preferences_sync.sql`](supabase/migrations/202611010002_preferences_sync.sql), in the Supabase SQL Editor (or `supabase db push` after linking the Supabase CLI project).
3. Serve this directory over HTTPS (or localhost); opening `index.html` as `file://` is not suitable for Auth redirects or IndexedDB in all browsers.
4. Choose **Connect account**, enter the project URL and the browser-safe `sb_publishable_...` key from Project Settings → API Keys. Settings are stored in this browser's localStorage. Sign up or sign in with email/password.

No build step or `.env` is needed for static hosting. For a deployment pipeline, the URL and publishable key can instead be injected into the page by your hosting setup; never use a service-role or secret key in browser code. The Supabase JS v2 SDK is loaded from jsDelivr.

## Database and access control

`public.tasks` stores `id`, `user_id`, `name`, `memo`, `due`, `mode`, `done`, `updated_at`, and `deleted_at`. `public.user_preferences` stores one row per user with the reminder interval array, the timer state JSON, and `updated_at`. Both tables force Row Level Security and restrict access to `auth.uid() = user_id`. The migrations add both tables to `supabase_realtime`. Task deletes are represented as tombstones (`deleted_at`) so offline devices can observe them.

## Local and offline behavior

Authenticated task and preference snapshots, plus durable mutation queues, are stored in IndexedDB partitioned by authenticated user ID. Reminder edits and timer start, stop, reset, and fired-reminder state are persisted to Supabase and received through Realtime. A running timer shares its start timestamp; each device calculates elapsed time locally. Writes render optimistically and retry when connectivity returns. Realtime updates are filtered by user and merged only when their `updated_at` is newer. Existing local task and preference values are imported once per account when the corresponding remote data is empty. Logging out clears that account's IndexedDB cache and queues.

Conflict handling is timestamp based: a strictly newer server row wins over a queued older snapshot; otherwise the queued snapshot is uploaded. This avoids unconditional overwrites but is not field-level merging and depends on reasonably synchronized device clocks. Timer alert presentation happens locally on each active device, so two devices may occasionally announce the same due interval around a simultaneous update. Hard deletes from external SQL clients cannot be synchronized as tombstones; use the app's soft-delete flow. For strict multi-writer guarantees, use server-assigned revisions/transactions and conflict UI rather than relying on client timestamps.

## Run and deploy

Run a local static server (for example `python -m http.server 8000`) and visit `http://localhost:8000`. GitHub Pages or any HTTPS static host can serve the files; keep `index.html`, `app.js`, `sync-service.js`, and `styles.css` together. Add the deployed origin to Supabase Auth's allowed redirect URLs.

## Limitations

- Auth, Realtime, migration, and offline reconciliation need a configured Supabase project; they cannot be verified from this repository alone.
- The SDK CDN must load at least once to initialize Auth. A service worker/app-shell cache is not included, so a first-ever offline visit cannot load the app.
- Email confirmation, SMTP delivery, provider limits, domain redirects, and project credentials must be configured in Supabase.
- Browser clock skew may affect last-write-wins resolution. Concurrent edits to the same task are whole-record updates.
