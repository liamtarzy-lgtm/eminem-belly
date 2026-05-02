# Deploy Eminem · Belly

Stack: **Next.js on Vercel + Turso (libsql) for the database**.

Total time once you start: ~15 minutes.

---

## 1. Push your code to GitHub

You already have a repo at `https://github.com/liamtarzy-lgtm/eminem-belly`. There's a local commit waiting — just push it:

```bash
git push origin main
```

---

## 2. Create your Turso database (~3 min)

1. Go to **https://app.turso.tech/** and sign up with GitHub (free).
2. Click **"Create Database"**:
   - Name: `eminem-belly`
   - Region: pick the one closest to you (e.g. `lax` for west coast US, `iad` for east coast)
   - Plan: **Free** (more than enough)
3. Once created, click into the database. You'll see two values you need:
   - **Database URL** — looks like `libsql://eminem-belly-yourname.turso.io`
   - **Auth Token** — click **"Create Token"** (read & write, no expiration). Copy it immediately, you can't see it again.

Keep both handy.

---

## 3. Push the schema + seed the catalog into Turso (~5 min)

You'll do this **from your laptop** so the catalog populates before you deploy.

1. In your project root, create a temporary file `.env.production.local`:
   ```
   DATABASE_URL=libsql://eminem-belly-yourname.turso.io
   TURSO_AUTH_TOKEN=<paste your token>
   ```
   (Use the actual values from Turso.)

2. Push the schema to Turso:
   ```bash
   DATABASE_URL=libsql://eminem-belly-yourname.turso.io \
   TURSO_AUTH_TOKEN=<your token> \
   npm run db:push
   ```
   Type `y` when it asks to apply changes. You should see `[✓] Changes applied`.

3. Seed the song catalog into Turso (takes ~3 min — pulls from MusicBrainz + Deezer):
   ```bash
   DATABASE_URL=libsql://eminem-belly-yourname.turso.io \
   TURSO_AUTH_TOKEN=<your token> \
   npm run seed
   ```
   You should see ~550 songs inserted. (You can also enrich previews now with `npm run enrich` using the same env vars, but they auto-resolve at play time anyway, so it's optional.)

4. **Delete `.env.production.local`** — you don't want it in git, and Vercel will get those values directly.

---

## 4. Deploy to Vercel (~3 min)

1. Go to **https://vercel.com/** and sign up with GitHub.
2. Click **"Add New… → Project"**.
3. Find `eminem-belly` in your repo list, click **"Import"**.
4. **Don't deploy yet** — first add environment variables. Expand the **"Environment Variables"** section and add:

   | Name | Value |
   |---|---|
   | `AUTH_SECRET` | copy the value out of your local `.env.local` (or generate a fresh one with `openssl rand -base64 32`) |
   | `AUTH_GOOGLE_ID` | your Google client ID (same as local) |
   | `AUTH_GOOGLE_SECRET` | your Google client secret (same as local) |
   | `DATABASE_URL` | `libsql://eminem-belly-yourname.turso.io` |
   | `TURSO_AUTH_TOKEN` | the token from Turso |
   | `AUTH_TRUST_HOST` | `true` |

5. Click **"Deploy"**. Wait ~1 min.
6. Vercel will give you a URL like `https://eminem-belly-xxx.vercel.app`. **Copy it.**

---

## 5. Add the Vercel URL to Google OAuth (~2 min)

Currently Google only allows redirects to `localhost`. Add your Vercel URL:

1. Go to **https://console.cloud.google.com/apis/credentials**
2. Click your OAuth Client ID (the one named "eminem-belly local" or similar).
3. Under **Authorized redirect URIs**, click **+ Add URI** and paste:
   ```
   https://eminem-belly-xxx.vercel.app/api/auth/callback/google
   ```
   (Replace `eminem-belly-xxx.vercel.app` with whatever Vercel gave you.)
4. Click **Save**. Google warns it can take ~5 min to propagate but is usually instant.

---

## 6. Also update OAuth consent screen (one-time)

Since you set up OAuth in "Testing" mode earlier, only your test users (`liamtarzy@gmail.com`) can sign in. To let other people use it:

- **Stay in Testing mode** — add their emails to the test user list. Up to 100 users, no review needed. **Easiest if it's just for friends.**
- **Or publish the app** — APIs & Services → OAuth consent screen → **"Publish App"**. Anyone can sign in with Google. You don't need verification for "non-sensitive" scopes (which you're using). Faster than you'd think.

---

## 7. Open it

Visit your Vercel URL → sign in with Google → you should land on the auto-rank flow.

If anything breaks, check **Vercel → your project → Logs** for the error and paste it back to me.

---

## Future deploys

Once everything's wired, every `git push origin main` triggers an auto-deploy on Vercel. About 60 seconds later it's live.

To re-seed or update the catalog later, run the seed script with your Turso env vars (same as Step 3).
