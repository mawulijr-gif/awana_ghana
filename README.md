# Awana Clubs Ghana website

## Configure Supabase

1. In the Supabase SQL Editor, run [`supabase/migrations/20261124000000_initial_schema.sql`](./supabase/migrations/20261124000000_initial_schema.sql).
2. Copy the PostgreSQL connection string from your Supabase project settings. Keep it server-side; never put it in browser code.
3. Install dependencies with `npm install`. Set the environment variables in the same terminal before starting the server:

```powershell
$env:DATABASE_URL = "postgresql://postgres:<database-password>@<host>:5432/postgres?sslmode=require"
$env:SESSION_SECRET = (node -p "require('crypto').randomBytes(32).toString('hex')")
$env:ADMIN_EMAIL = "you@example.com"
$env:ADMIN_PASSWORD = "use-a-unique-password-of-at-least-12-characters"
npm start
```

`DATABASE_URL` and `SESSION_SECRET` are required on every start. `ADMIN_EMAIL` and `ADMIN_PASSWORD` create the first website administrator when the Supabase database does not already contain one. The admin login remains the app's existing login system; Supabase Auth is not enabled.

The app seeds its default CMS content and settings on first start. Existing SQLite records are not automatically copied. Registration photos, ID documents, and CMS uploads remain on the server's local disk; only their record metadata is stored in Supabase. These runtime files are intentionally excluded from Git.
