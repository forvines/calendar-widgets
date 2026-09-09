#!/usr/bin/env python3
"""Download the McAlder lunch PDF and convert its calendar cells to JSON."""

from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import fitz  # PyMuPDF

SOURCE_URL = "https://www.cascadechristian.org/editoruploads/files/mcalder/menus/LunchMenu.pdf"
OUTPUT = Path("public/data/lunch-menu.json")
MONTHS = {
    name.lower(): number
    for number, name in enumerate(
        [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ],
        start=1,
    )
}
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]


def fetch_pdf() -> tuple[bytes, str | None]:
    req = urllib.request.Request(
        SOURCE_URL,
        headers={"User-Agent": "calendar-widgets/1.0 (+https://github.com/forvines/calendar-widgets)"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read(), response.headers.get("Last-Modified")


def infer_month_year(text: str) -> tuple[int, int]:
    month_match = re.search(
        r"\b(" + "|".join(name.title() for name in MONTHS) + r")\b",
        text,
        re.IGNORECASE,
    )
    if not month_match:
        raise RuntimeError("Could not find a month name in the lunch menu PDF.")
    month = MONTHS[month_match.group(1).lower()]

    years = [int(value) for value in re.findall(r"\b20\d{2}\b", text)]
    now = datetime.now(timezone.utc)
    if years:
        year = min(years, key=lambda value: abs(value - now.year))
    else:
        candidates = [now.year - 1, now.year, now.year + 1]
        year = min(
            candidates,
            key=lambda value: abs((datetime(value, month, 1, tzinfo=timezone.utc) - now).days),
        )
    return month, year


def weekday_centers(words: list[tuple]) -> tuple[list[float], float]:
    found: dict[str, tuple[float, float]] = {}
    for word in words:
        x0, y0, x1, y1, value = word[:5]
        for weekday in WEEKDAYS:
            if value.strip().lower() == weekday.lower() and weekday not in found:
                found[weekday] = ((x0 + x1) / 2, y1)
    missing = [day for day in WEEKDAYS if day not in found]
    if missing:
        raise RuntimeError(f"Could not locate weekday headers: {', '.join(missing)}")
    centers = [found[day][0] for day in WEEKDAYS]
    header_bottom = max(found[day][1] for day in WEEKDAYS)
    return centers, header_bottom


def column_bounds(centers: list[float], page_width: float) -> list[tuple[float, float]]:
    midpoints = [(centers[i] + centers[i + 1]) / 2 for i in range(len(centers) - 1)]
    left = max(0.0, centers[0] - (midpoints[0] - centers[0]))
    right = min(page_width, centers[-1] + (centers[-1] - midpoints[-1]))
    edges = [left, *midpoints, right]
    return [(edges[i], edges[i + 1]) for i in range(5)]


def group_lines(words: list[tuple]) -> list[str]:
    if not words:
        return []
    ordered = sorted(words, key=lambda w: (w[1], w[0]))
    lines: list[list[tuple]] = []
    line_y: list[float] = []
    for word in ordered:
        y = word[1]
        idx = next((i for i, existing in enumerate(line_y) if abs(existing - y) <= 3.0), None)
        if idx is None:
            lines.append([word])
            line_y.append(y)
        else:
            lines[idx].append(word)
            line_y[idx] = (line_y[idx] + y) / 2

    result = []
    for _, line in sorted(zip(line_y, lines), key=lambda item: item[0]):
        text = " ".join(w[4] for w in sorted(line, key=lambda w: w[0])).strip()
        if text:
            result.append(text)
    return result


def parse_days(pdf_bytes: bytes) -> tuple[dict[str, str], int, int]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if doc.page_count < 1:
        raise RuntimeError("Lunch menu PDF has no pages.")
    page = doc[0]
    words = page.get_text("words", sort=True)
    text = page.get_text("text", sort=True)
    month, year = infer_month_year(text)
    centers, header_bottom = weekday_centers(words)
    bounds = column_bounds(centers, page.rect.width)

    # Calendar date numbers sit near the upper-left of each weekday cell. Using
    # that geometry avoids mistaking prices or numbers in menu descriptions for dates.
    dates = []
    for word in words:
        x0, y0, x1, y1, value = word[:5]
        if y0 <= header_bottom + 2 or not re.fullmatch(r"(?:[1-9]|[12]\d|3[01])", value.strip()):
            continue
        for col, (left, right) in enumerate(bounds):
            width = right - left
            if left <= x0 < right and x0 <= left + width * 0.28:
                dates.append({"day": int(value), "col": col, "x0": x0, "y0": y0, "y1": y1})
                break

    # Keep only the first geometric occurrence of each calendar day.
    unique = {}
    for item in sorted(dates, key=lambda d: (d["y0"], d["col"])):
        unique.setdefault(item["day"], item)
    dates = list(unique.values())
    if len(dates) < 15:
        raise RuntimeError(f"Only found {len(dates)} calendar dates; refusing to publish a likely bad parse.")

    row_ys = []
    for item in sorted(dates, key=lambda d: d["y0"]):
        if not row_ys or abs(item["y0"] - row_ys[-1]) > 12:
            row_ys.append(item["y0"])
        else:
            row_ys[-1] = (row_ys[-1] + item["y0"]) / 2

    days: dict[str, str] = {}
    for item in dates:
        row_index = min(range(len(row_ys)), key=lambda i: abs(row_ys[i] - item["y0"]))
        bottom = row_ys[row_index + 1] - 4 if row_index + 1 < len(row_ys) else page.rect.height - 25
        left, right = bounds[item["col"]]

        cell_words = []
        for word in words:
            x0, y0, x1, y1, value = word[:5]
            center_x = (x0 + x1) / 2
            if not (left + 2 <= center_x <= right - 2):
                continue
            if not (item["y1"] + 1 <= y0 < bottom):
                continue
            # Avoid copying a neighboring date number into the menu body.
            if re.fullmatch(r"(?:[1-9]|[12]\d|3[01])", value.strip()) and x0 <= left + (right - left) * 0.28:
                continue
            cell_words.append(word)

        lines = group_lines(cell_words)
        menu = "\n".join(lines).strip()
        key = f"{year:04d}-{month:02d}-{item['day']:02d}"
        days[key] = menu

    return dict(sorted(days.items())), month, year


def main() -> int:
    pdf_bytes, last_modified = fetch_pdf()
    digest = hashlib.sha256(pdf_bytes).hexdigest()

    existing = {}
    if OUTPUT.exists():
        try:
            existing = json.loads(OUTPUT.read_text())
        except (json.JSONDecodeError, OSError):
            existing = {}
    if existing.get("sourceSha256") == digest:
        print("Lunch PDF unchanged; nothing to update.")
        return 0

    days, month, year = parse_days(pdf_bytes)
    payload = {
        "source": SOURCE_URL,
        "menuMonth": f"{year:04d}-{month:02d}",
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sourceLastModified": last_modified,
        "sourceSha256": digest,
        "days": days,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"Imported {len(days)} dates for {payload['menuMonth']}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # GitHub Actions should fail loudly rather than publish bad data.
        print(f"Lunch menu import failed: {exc}", file=sys.stderr)
        raise
