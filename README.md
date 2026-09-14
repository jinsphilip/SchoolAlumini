# SSLC 1998 Alumni Network

**Live site:** https://jinsphilip.github.io/SchoolAlumini/

An alumni directory for the SSLC batch of 1998 (divisions X-A through X-F),
built from the batch's shared spreadsheet. The frontend is always static
(GitHub Pages, deployed automatically by `.github/workflows/deploy-pages.yml`
on every push) - it can run two ways:

- **Static mode** (default, `data/config.js` → `apiBaseUrl: ""`): a
  read-only snapshot. "Edit" opens a pre-filled email to the organiser
  instead of saving anything.
- **Live mode** (`apiBaseUrl` set to a deployed backend URL): the directory
  is read from and edited straight into a real database - click Edit on a
  row, change it, hit Save, done. See [Live editing](#live-editing-optional)
  below for how to turn this on.

## What's here

- `index.html`, `assets/style.css`, `assets/app.js` — the site: a searchable,
  sortable directory with stats, division filters, a WhatsApp-group filter,
  and (in live mode) inline editing.
- `data/config.js` — site title, tagline, organiser email, WhatsApp invite
  link, and the live-mode API URL. Edit and reload, no rebuild needed.
- `data/alumni.json` / `data/alumni.js` — the **public** directory (name,
  division, batch year, WhatsApp status), used as the static-mode snapshot
  and as the seed data for live mode. Safe to commit and publish.
- `data/alumni.private.js` — the same records **with** email, Facebook ID,
  and birthday. Generated locally, **git-ignored**, never pushed. In static
  mode, loading it locally next to `index.html` shows contact columns; in
  live mode it's only used once, to seed the database (see below).
- `data/import-report.md` — a log of what the import script skipped, fixed,
  or flagged as a possible duplicate. Worth a read after every import.
- `scripts/import_excel.py` — regenerates all of the above from a class-list
  spreadsheet.
- `server/` — the optional backend for live mode (Node/Express + MongoDB).
  Not deployed anywhere by default; see below.

## Re-importing from a spreadsheet

```
pip install openpyxl
python3 scripts/import_excel.py path/to/class_list.xlsx --batch 1998
```

The script expects one worksheet per division, with a header row containing
columns like `Name`, `... WhatsApp group`, `Email address`, `FB ID`,
`Birthday`. It's tolerant of stray whitespace, inconsistent capitalisation,
and a few known spreadsheet quirks (a name column that says "Yes" instead of
a name is skipped; a birthday like `14.10.1982` is normalised to
`1982-10-14`). Anything it can't confidently parse is left blank and noted in
`data/import-report.md` rather than guessed at.

Re-running the script overwrites `data/alumni.json`, `data/alumni.js`,
`data/alumni.private.js`, and `data/import-report.md`.

## Privacy

Only names, division, batch year, and WhatsApp-group status are ever public
— in both modes. Email, Facebook, and birthday are never sent to a visitor
without the admin token:

- **Static mode**: contact details live solely in the git-ignored
  `data/alumni.private.js`. The public page never fetches or displays it
  unless it's physically present next to `index.html` (i.e. on an
  organiser's own machine).
- **Live mode**: the public API endpoint (`GET /api/alumni`) only ever
  returns name/division/batch/WhatsApp/notes — never contact fields, at the
  database query level, regardless of what's stored. Only a request that
  presents the correct `ADMIN_TOKEN` (`GET /api/alumni/full?token=...`) gets
  contact details back. Anyone can *submit* an edit to any field (see
  [Live editing](#live-editing-optional) for the trust model this assumes),
  but only the admin token can *read* contact details back.

## Known data issues

See `data/import-report.md` for the current list. As of the last import: one
stray "Yes" row was skipped, and five names appear in more than one division
(could be the same person miscounted, or two classmates who share a name) —
worth confirming with the batch before treating the count as final.

## Updating details

- **Static mode**: the "Update my details" button and each row's "Edit"
  link open a pre-filled email to the organiser address set in
  `data/config.js`. Nothing is saved automatically — you apply the change
  yourself (edit `data/alumni.private.js` or the spreadsheet + re-import)
  and push.
- **Live mode**: clicking "Edit" on a row turns it into a small form
  (WhatsApp status, email, Facebook, birthday) with a Save button that
  writes straight to the database via the backend API. No email round-trip.

## Live editing (optional)

Turning this on means the frontend still lives on GitHub Pages, but reads
and writes go to a small stateless API (`server/`) backed by a free MongoDB
Atlas cluster. Nobody needs an account to *use* the site - only you need
accounts to *host* the backend.

### 1. Create a free MongoDB Atlas cluster

1. Sign up at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
   (no credit card needed for the free M0 tier).
2. Create an M0 (free) cluster.
3. **Database Access** → add a database user with a password.
4. **Network Access** → add `0.0.0.0/0` (allow access from anywhere) - the
   backend's own auth (admin token + field-level rules) is what protects
   the data, not IP allowlisting, since Render's outbound IPs aren't fixed
   on the free plan.
5. **Connect** → "Drivers" → copy the `mongodb+srv://...` connection string.

### 2. Seed the database from your current data

Locally, with `data/alumni.json` (and, if you have it, `data/alumni.private.js`
for contact details) already in place:

```
cd server
npm install
cp .env.example .env
# edit .env: paste your MONGODB_URI, and set ADMIN_TOKEN to a long random
# string - e.g. `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
npm run migrate
```

This upserts every alumni record into MongoDB. Re-running it later
overwrites records by `id` from these files, so don't re-run it once the
batch has started editing their own rows unless you mean to reset them.

### 3. Deploy the backend to Render

1. Sign up at [render.com](https://render.com) (free, no credit card for the
   free web service tier).
2. New → Blueprint → connect this repo. Render reads `render.yaml` at the
   repo root and proposes a `schoolalumini-api` web service.
3. Before deploying, set the two secret env vars it asks for (`sync: false`
   in the blueprint means Render won't invent a value - you paste them in):
   - `MONGODB_URI` - the same connection string from step 1.
   - `ADMIN_TOKEN` - the same value you put in `server/.env`.
4. Deploy. Once live, note the service URL, e.g.
   `https://schoolalumini-api.onrender.com`.

The free Render web service spins down after inactivity and takes ~30-50s
to wake on the next request - fine for a low-traffic alumni site, just
expect the first visitor after a quiet spell to see a brief loading delay
(the page falls back to the static snapshot if the API doesn't respond).

### 4. Point the frontend at it

In `data/config.js`:

```js
apiBaseUrl: "https://schoolalumini-api.onrender.com"
```

Commit and push - the site redeploys and switches to live mode
automatically.

### 5. Bookmark your admin link

Visit `https://jinsphilip.github.io/SchoolAlumini/?admin=<your ADMIN_TOKEN>`
to see full contact details and edit any field with current values
pre-filled. Keep that URL private - anyone with it can read every alumni's
contact details. Regular visitors never see or need it.

### Trust model

Anyone with the site link can edit anyone's WhatsApp status, email,
Facebook, and birthday (but not their name or division - those aren't
editable through the API). This fits a closed batch of ~250 people who
mostly know each other and matches the original mailto-based "Edit" flow's
trust level, just without the manual step. The backend does the following,
and no more:

- Validates email format and birthday format server-side; rejects garbage.
- Rate-limits edits per device (30 per 15 minutes) to blunt casual abuse.
- Never returns contact fields from the public endpoint, regardless of the
  request.

It does **not** verify that the person editing a row is that row's actual
owner - there's no login. If that ever becomes a problem, the fix is adding
a lightweight per-person edit code (e.g. emailed on request) rather than
opening this up further.
