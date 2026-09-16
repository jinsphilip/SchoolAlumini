# Import report

Source: `61b11303-10th_Class__1998.xlsx`

## Summary

- Alumni imported: 246 (240 after the manual dedup below)
- By division: A: 42, B: 39, C: 43, D: 39, E: 40, F: 43
- In WhatsApp group: 35
- With email: 26
- With Facebook ID: 2
- With birthday: 1

## Skipped rows

These rows were not imported.

- X-A row 17: name column contains 'Yes', not a name

## Same name in more than one place

These were flagged by the import script as possible duplicates. Resolved
manually on 2026-09-16 - see "Duplicates resolved" below for what was
kept and removed, and why re-running the import script would bring them
back unless the source spreadsheet is fixed too.

- ~~Shanil T P in A (a-16), Shanil T P in F (f-41)~~
- ~~Asha John in A (a-22), Asha John in E (e-21)~~
- ~~Jeena George in A (a-27), Jeena George in D (d-26)~~
- ~~Varghese Mathew in A (a-42), Varghese Mathew in C (c-22), Varghese Mathew in F (f-43)~~
- ~~Deepa Divakaran in B (b-27), Deepa Divakaran in F (f-42)~~

## Duplicates resolved (2026-09-16, manual - not from the import script)

Only Varghese Mathew had actual evidence of being one person entered
twice (the X-C and X-F rows share the same email, `vm3378@gmail.com`).
The other four had no overlapping contact info between their entries -
no evidence either way, since these are common enough names that they
could just as easily be different classmates. Merged anyway per an
explicit decision to treat all five as duplicates; kept whichever entry
had the most information (an email, if any) and folded in any "Yes"
WhatsApp status from the removed copies rather than losing it:

- Shanil T P: kept `f-41` (X-F, has email), removed `a-16` (X-A, blank)
- Asha John: kept `a-22` (X-A), removed `e-21` (X-E) - both entries were blank
- Jeena George: kept `a-27` (X-A), removed `d-26` (X-D) - both entries were blank
- Varghese Mathew: kept `c-22` (X-C, has email), removed `a-42` (X-A, blank) and `f-43` (X-F, same email as c-22)
- Deepa Divakaran: kept `b-27` (X-B), removed `f-42` (X-F, had whatsappGroup=Yes - carried over to b-27)

**This fix lives only in `data/alumni.json` / `data/alumni.private.js`,
not in the source spreadsheet.** Re-running
`scripts/import_excel.py` against `61b11303-10th_Class__1998.xlsx` will
regenerate these files from scratch and bring all five duplicates back.
If you re-import later, either remove the corresponding rows from the
spreadsheet first, or re-apply this merge afterward.

## Values cleaned up

Applied automatically; check that nothing was mangled.

- X-A row 38: name 'Sheena yob' normalised to 'Sheena Yob'
- X-A row 42: name 'sophi Anna Francis' normalised to 'Sophi Anna Francis'
- Sudheesh M P (X-A): email column value 'Reecooper' moved to notes
- X-A row 44: name 'VARGHESE MATHEW' normalised to 'Varghese Mathew'
- X-B row 10: name 'Jomet sunny' normalised to 'Jomet Sunny'
- X-C row 3: name 'Ajith kumar V' normalised to 'Ajith Kumar V'
- X-C row 33: name 'Leeba K stephen' normalised to 'Leeba K Stephen'
- X-E row 14: name 'Sony. M J' normalised to 'Sony M J'
- X-F row 44: name 'Varghese mathew' normalised to 'Varghese Mathew'
