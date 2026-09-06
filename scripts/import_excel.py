#!/usr/bin/env python3
"""Import the class-list spreadsheet into the alumni data files.

Usage:
    python3 scripts/import_excel.py path/to/10th_Class_1998.xlsx [--batch 1998]

Reads one worksheet per division (X-A, X-B, ...). Each sheet is expected to
have the columns: Name, WhatsApp group (Yes/No), Email address, FB ID, Birthday.

Writes:
    data/alumni.json          public directory (names, division, WhatsApp flag)
    data/alumni.js            same data, loadable from file:// and GitHub Pages
    data/alumni.private.js    full data including email/Facebook/birthday
                              (git-ignored; never committed to the public repo)
    data/import-report.md     what was cleaned, skipped or looks suspicious
"""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit("openpyxl is required: pip install openpyxl")

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
CONTACT_FIELDS = ("email", "facebook", "birthday")


def clean_text(value):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def clean_name(raw):
    name = clean_text(raw).replace(".", " ")
    name = re.sub(r"\s+", " ", name).strip()
    words = []
    for word in name.split(" "):
        words.append(word.upper() if len(word) <= 2 else word[:1].upper() + word[1:].lower())
    return " ".join(words)


def name_key(name):
    return re.sub(r"[^a-z]", "", name.lower())


def parse_flag(value):
    text = clean_text(value).lower()
    if text.startswith("y"):
        return True
    if text.startswith("n"):
        return False
    return None


def parse_email(value):
    text = clean_text(value).replace(" ", "").lower()
    if not text:
        return "", ""
    if EMAIL_RE.match(text):
        return text, ""
    return "", clean_text(value)


def parse_birthday(value):
    text = clean_text(value)
    if not text:
        return "", ""
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d"), ""
    match = re.match(r"^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$", text)
    if match:
        day, month, year = (int(part) for part in match.groups())
        if 1 <= day <= 31 and 1 <= month <= 12:
            return f"{year:04d}-{month:02d}-{day:02d}", ""
    return "", text


def header_index(header_row):
    """Map logical fields to column positions from the sheet's header row."""
    index = {}
    for position, cell in enumerate(header_row):
        label = clean_text(cell).lower()
        if not label:
            continue
        if label.startswith("name"):
            index.setdefault("name", position)
        elif "whats" in label:
            index.setdefault("whatsapp", position)
        elif "mail" in label:
            index.setdefault("email", position)
        elif label.startswith("fb") or "facebook" in label:
            index.setdefault("facebook", position)
        elif "birth" in label:
            index.setdefault("birthday", position)
    return index


def cell(row, index, field):
    position = index.get(field)
    if position is None or position >= len(row):
        return None
    return row[position]


def import_workbook(path, batch):
    workbook = openpyxl.load_workbook(path, data_only=True)
    records, report = [], defaultdict(list)

    for sheet in workbook.worksheets:
        division = sheet.title.strip().upper().replace("X-", "").replace("X", "", 1) or sheet.title
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            report["skipped"].append(f"{sheet.title}: empty sheet")
            continue
        index = header_index(rows[0])
        if "name" not in index:
            report["skipped"].append(f"{sheet.title}: no Name column found in header")
            continue

        serial = 0
        for row_number, row in enumerate(rows[1:], start=2):
            raw_name = clean_text(cell(row, index, "name"))
            if not raw_name:
                continue
            if raw_name.lower() in {"yes", "no"}:
                report["skipped"].append(
                    f"{sheet.title} row {row_number}: name column contains '{raw_name}', not a name"
                )
                continue

            serial += 1
            name = clean_name(raw_name)
            email, email_note = parse_email(cell(row, index, "email"))
            birthday, birthday_note = parse_birthday(cell(row, index, "birthday"))
            notes = []
            if email_note:
                notes.append(f"Email column had '{email_note}' (not an email address)")
                report["fixed"].append(f"{name} ({sheet.title}): email column value '{email_note}' moved to notes")
            if birthday_note:
                notes.append(f"Birthday column had '{birthday_note}' (unrecognised format)")
            if name != raw_name:
                report["fixed"].append(f"{sheet.title} row {row_number}: name '{raw_name}' normalised to '{name}'")

            records.append(
                {
                    "id": f"{division.lower()}-{serial:02d}",
                    "name": name,
                    "division": division,
                    "batch": batch,
                    "whatsappGroup": parse_flag(cell(row, index, "whatsapp")),
                    "email": email,
                    "facebook": clean_text(cell(row, index, "facebook")),
                    "birthday": birthday,
                    "notes": "; ".join(notes),
                }
            )

    # Flag the same name appearing more than once (could be one person listed
    # twice, or two classmates who share a name - a human has to decide).
    by_key = defaultdict(list)
    for record in records:
        by_key[name_key(record["name"])].append(record)
    for group in by_key.values():
        if len(group) > 1:
            where = ", ".join(f"{r['name']} in {r['division']} ({r['id']})" for r in group)
            report["duplicates"].append(where)
            for record in group:
                record["possibleDuplicate"] = True

    return records, report


def public_view(records):
    return [{k: v for k, v in record.items() if k not in CONTACT_FIELDS} for record in records]


def write_js(path, records, banner):
    body = json.dumps(records, indent=2, ensure_ascii=False)
    path.write_text(f"// {banner}\nwindow.ALUMNI = {body};\n", encoding="utf-8")


def write_report(path, records, report, source):
    divisions = Counter(r["division"] for r in records)
    lines = [
        "# Import report",
        "",
        f"Source: `{source.name}`",
        "",
        "## Summary",
        "",
        f"- Alumni imported: {len(records)}",
        "- By division: " + ", ".join(f"{d}: {n}" for d, n in sorted(divisions.items())),
        f"- In WhatsApp group: {sum(1 for r in records if r['whatsappGroup'])}",
        f"- With email: {sum(1 for r in records if r['email'])}",
        f"- With Facebook ID: {sum(1 for r in records if r['facebook'])}",
        f"- With birthday: {sum(1 for r in records if r['birthday'])}",
        "",
    ]
    for title, key, blurb in (
        ("Skipped rows", "skipped", "These rows were not imported."),
        ("Same name in more than one place", "duplicates",
         "Decide whether these are one person listed twice or different people, then fix the spreadsheet and re-run."),
        ("Values cleaned up", "fixed", "Applied automatically; check that nothing was mangled."),
    ):
        lines += [f"## {title}", "", blurb, ""]
        lines += [f"- {item}" for item in report.get(key, [])] or ["- none"]
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--batch", type=int, default=1998)
    args = parser.parse_args()

    records, report = import_workbook(args.workbook, args.batch)
    DATA.mkdir(exist_ok=True)

    public = public_view(records)
    (DATA / "alumni.json").write_text(json.dumps(public, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_js(DATA / "alumni.js", public, "Generated by scripts/import_excel.py - public directory, no contact details")
    write_js(DATA / "alumni.private.js", records,
             "Generated by scripts/import_excel.py - PRIVATE, contains contact details, do not commit")
    write_report(DATA / "import-report.md", records, report, args.workbook)

    print(f"Imported {len(records)} alumni from {args.workbook}")
    print(f"  public : {DATA / 'alumni.json'}, {DATA / 'alumni.js'}")
    print(f"  private: {DATA / 'alumni.private.js'} (git-ignored)")
    print(f"  report : {DATA / 'import-report.md'}")


if __name__ == "__main__":
    main()
