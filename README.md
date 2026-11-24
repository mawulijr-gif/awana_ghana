# Awana Clubs Ghana website

## Run locally

Install dependencies with `npm install`. Set the environment variables in the same terminal before starting the server:

```powershell
$env:SESSION_SECRET = (node -p "require('crypto').randomBytes(32).toString('hex')")
$env:ADMIN_EMAIL = "you@example.com"
$env:ADMIN_PASSWORD = "use-a-unique-password-of-at-least-12-characters"
npm start
```

`SESSION_SECRET` is required on every start. `ADMIN_EMAIL` and `ADMIN_PASSWORD` are used to create the first administrator when the local database does not already contain one.

The SQLite database and private registration files are kept in `data/`; uploaded public site assets are kept in `public/uploads/`. These runtime files are intentionally excluded from Git.
