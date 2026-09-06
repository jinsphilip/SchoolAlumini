# SSLC 1998 Alumni Network

A small, static alumni directory for the SSLC batch of 1998 (divisions X-A
through X-F), built from the batch's shared spreadsheet. No backend, no
build step — open `index.html` or host the folder as-is (GitHub Pages,
Netlify, or any static file server).

## What's here

- `index.html`, `assets/style.css`, `assets/app.js` — the site: a searchable,
  sortable directory with stats, division filters, and a WhatsApp-group filter.
- `data/config.js` — site title, tagline, organiser email, WhatsApp invite
  link. Edit and reload, no rebuild needed.
- `data/alumni.json` / `data/alumni.js` — the **public** directory (name,
  division, batch year, WhatsApp status). Safe to commit and publish.
- `data/alumni.private.js` — the same records **with** email, Facebook ID,
  and birthday. Generated locally, **git-ignored**, never pushed. If present
  next to `index.html`, the page loads it automatically and shows contact
  columns; if absent, the public site hides those columns entirely.
- `data/import-report.md` — a log of what the import script skipped, fixed,
  or flagged as a possible duplicate. Worth a read after every import.
- `scripts/import_excel.py` — regenerates all of the above from a class-list
  spreadsheet.

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

Only names, division, batch year, and WhatsApp-group status are published.
Email addresses, Facebook IDs, and birthdays live solely in the git-ignored
`data/alumni.private.js`, which an organiser keeps on their own machine (or
shares directly with co-organisers) rather than committing. The public page
never fetches or displays that file's contents unless it's physically present
alongside `index.html`.

## Known data issues

See `data/import-report.md` for the current list. As of the last import: one
stray "Yes" row was skipped, and five names appear in more than one division
(could be the same person miscounted, or two classmates who share a name) —
worth confirming with the batch before treating the count as final.

## Updating details

The "Update my details" button opens a pre-filled email to the organiser
address set in `data/config.js`. There's no database or form backend by
design — it's one WhatsApp group's worth of people, and email keeps this a
zero-maintenance static site.
