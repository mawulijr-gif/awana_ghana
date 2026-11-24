# Awana Clubs Ghana website

## Configure Supabase

Use Node.js 22.x, as required by the Supabase SDK.

1. In the Supabase SQL Editor, run [`supabase/migrations/20261124000000_initial_schema.sql`](./supabase/migrations/20261124000000_initial_schema.sql), then [`supabase/migrations/20261124010000_storage_buckets.sql`](./supabase/migrations/20261124010000_storage_buckets.sql).
2. In Supabase project settings, copy the project URL, service-role key, and PostgreSQL connection string. Use the session pooler connection string if the direct database host is not reachable from your hosting provider.
3. Keep all credentials server-side. Never expose the service-role key or database connection string in browser code.
4. Install dependencies with `npm install`. Set the environment variables in the same terminal before starting the server:

```powershell
$env:DATABASE_URL = "postgresql://postgres:<database-password>@<host>:5432/postgres?sslmode=require"
$env:SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-key>"
$env:SESSION_SECRET = (node -p "require('crypto').randomBytes(32).toString('hex')")
$env:ADMIN_EMAIL = "you@example.com"
$env:ADMIN_PASSWORD = "use-a-unique-password-of-at-least-12-characters"
npm start
```

`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SESSION_SECRET` are required on every start. `ADMIN_EMAIL` and `ADMIN_PASSWORD` create the first website administrator when the Supabase database does not already contain one. The admin login remains the app's existing login system; Supabase Auth is not enabled.

The app seeds its default CMS content and settings on first start. Existing SQLite records and previously uploaded local files are not automatically copied. CMS media and resources are stored in the public `site-assets` bucket. Registration photos and ID documents are stored in the private `registration-files` bucket and are only served through administrator-authenticated routes.

## Deploy to Render

1. Push the project to GitHub and create a new Render Blueprint from the repository. Render will read [`render.yaml`](./render.yaml).
2. When prompted, provide `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. Use a unique admin password of at least 12 characters. Render generates `SESSION_SECRET`.
3. Confirm both Supabase migrations above have been run before the first deployment. Render's `/healthz` check verifies the app can reach PostgreSQL.

Render's normal web-service filesystem is ephemeral. All uploaded files are stored in Supabase Storage, so redeploys and restarts do not remove them.
