#!/usr/bin/env python3
"""Download the McAlder lunch PDF and convert its calendar cells to JSON."""

from __future__ import annotations

import calendar
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import fitz  # PyMuPDF

SOURCE_URL = "https://www.cascadechristian.org/editoruploads/files/mcalder/menus/LunchMenu.pdf"
OUTPUT = Path("public/data/lunch-menu.json")
PARSER_VERSION = 3
PACIFIC = ZoneInfo("America/Los_Angeles")
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
    """Fetch the PDF, bypassing the school's occasionally stale intermediary cache."""
    last_error: Exception | None = None
    for attempt in range(1, 4):
        cache_bust = f"{int(time.time())}-{attempt}"
        url = f"{SOURCE_URL}?{urllib.parse.urlencode({'cb': cache_bust})}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "calendar-widgets/1.1 (+https://github.com/forvines/calendar-widgets)",
                "Accept": "application/pdf,*/*;q=0.8",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                data = response.read()
                if len(data) < 1000 or not data.startswith(b"%PDF"):
                    raise RuntimeError("Lunch menu response was not a valid PDF.")
                return data, response.headers.get("Last-Modified")
        except (urllib.error.URLError, TimeoutError, RuntimeError) as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(2 * attempt)

    raise RuntimeError(f"Could not download a valid lunch menu PDF after 3 attempts: {last_error}")


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
    now = datetime.now(PACIFIC)
    if years:
        year = min(years, key=lambda value: abs(value - now.year))
    else:
        candidates = [now.year - 1, now.year, now.year + 1]
        year = min(
            candidates,
            key=lambda value: abs((datetime(value, month, 1, tzinfo=PACIFIC) - now).days),
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



def parse_days_from_text(text: str, month: int, year: int) -> dict[str, str]:
    max_day = calendar.monthrange(year, month)[1]
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    days: dict[str, str] = {}
    current_day = None
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_day, current_lines
        if current_day is not None:
            days[f"{year:04d}-{month:02d}-{current_day:02d}"] = "\n".join(current_lines).strip()
        current_lines = []

    for line in lines:
        m = re.fullmatch(r"(?:[1-9]|[12]\d|3[01])", line)
        if m:
            candidate = int(line)
            if candidate <= max_day and calendar.weekday(year, month, candidate) < 5 and candidate != current_day and f"{year:04d}-{month:02d}-{candidate:02d}" not in days:
                flush()
                current_day = candidate
                continue
        if current_day is not None and not line.lower().startswith(("lunch prices", "menu subject to change", "all raw veggies")):
            current_lines.append(line)

    flush()
    return dict(sorted(days.items()))


def parse_days(pdf_bytes: bytes) -> tuple[dict[str, str], int, int]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if doc.page_count < 1:
        raise RuntimeError("Lunch menu PDF has no pages.")
    page = doc[0]
    words = page.get_text("words", sort=True)
    text = page.get_text("text", sort=True)
    month, year = infer_month_year(text)

    expected_weekdays = sum(
        1
        for day in range(1, calendar.monthrange(year, month)[1] + 1)
        if calendar.weekday(year, month, day) < 5
    )
    minimum_dates = max(10, min(15, expected_weekdays - 5))
    text_days = parse_days_from_text(text, month, year)
    if len(text_days) == expected_weekdays:
        return text_days, month, year

    centers, header_bottom = weekday_centers(words)
    bounds = column_bounds(centers, page.rect.width)

    # Match numeric tokens to the weekday where that calendar date must occur.
    # Older menus placed date numbers at the far-left of each cell; newer ones
    # move them around, so relying on an x-position percentage is too brittle.
    candidates_by_day: dict[int, list[dict]] = {}
    for word_index, word in enumerate(words):
        x0, y0, x1, y1, value = word[:5]
        raw = value.strip()
        if y0 <= header_bottom + 2 or not re.fullmatch(r"(?:[1-9]|[12]\d|3[01])", raw):
            continue

        day = int(raw)
        try:
            weekday = calendar.weekday(year, month, day)
        except ValueError:
            continue
        if weekday >= 5:
            continue

        center_x = (x0 + x1) / 2
        left, right = bounds[weekday]
        if not (left <= center_x <= right):
            continue

        candidates_by_day.setdefault(day, []).append({
            "day": day,
            "col": weekday,
            "word_index": word_index,
            "x0": x0,
            "y0": y0,
            "y1": y1,
        })

    dates = []
    for day, candidates in candidates_by_day.items():
        # The actual date label is the uppermost matching token in its expected
        # weekday column. This rejects stray numbers that may appear in menu text.
        dates.append(min(candidates, key=lambda item: (item["y0"], item["x0"])))

    dates.sort(key=lambda d: (d["y0"], d["col"]))

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
        date_word_indexes = {date["word_index"] for date in dates}
        row_top = row_ys[row_index] - 1
        for word_index, word in enumerate(words):
            x0, y0, x1, y1, value = word[:5]
            center_x = (x0 + x1) / 2
            if not (left + 2 <= center_x <= right - 2):
                continue
            if not (row_top <= y0 < bottom):
                continue
            # Skip date labels themselves, but keep menu text that begins on the
            # same visual line. The prior y1-based cutoff dropped the first food
            # line from many cells.
            if word_index in date_word_indexes:
                continue
            cell_words.append(word)

        lines = group_lines(cell_words)
        menu = "\n".join(lines).strip()
        key = f"{year:04d}-{month:02d}-{item['day']:02d}"
        days[key] = menu

    combined = dict(days)
    combined.update(text_days)
    combined = dict(sorted(combined.items()))
    if len(combined) < minimum_dates:
        raise RuntimeError(
            f"Text parser found {len(text_days)}, geometry parser found {len(days)}, "
            f"and combined result found {len(combined)} of {expected_weekdays} weekday dates."
        )
    if len(combined) < expected_weekdays:
        print(
            f"Lunch parser partial coverage: text={len(text_days)}, geometry={len(days)}, "
            f"combined={len(combined)}/{expected_weekdays}."
        )
    return combined, month, year


def load_existing() -> dict:
    if not OUTPUT.exists():
        return {}
    try:
        return json.loads(OUTPUT.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def existing_covers_current_month(existing: dict, now: datetime) -> bool:
    days = existing.get("days")
    if not isinstance(days, dict):
        return False
    prefix = now.strftime("%Y-%m-")
    return any(isinstance(key, str) and key.startswith(prefix) for key in days)


def validate_menu_month(month: int, year: int, now: datetime) -> None:
    delta = (year - now.year) * 12 + (month - now.month)
    # A school may publish next month's menu a few days early, but anything
    # older than the current month is stale and must never replace current data.
    if delta not in (0, 1):
        raise RuntimeError(
            f"Downloaded menu is for {year:04d}-{month:02d}, not the current/next month "
            f"({now:%Y-%m}); refusing stale data."
        )


def merge_days(existing: dict, incoming: dict[str, str], now: datetime) -> dict[str, str]:
    merged = dict(existing.get("days") or {})
    merged.update(incoming)

    # Keep a small overlap so an early next-month publication does not make the
    # final day(s) of the current month disappear from the widget.
    earliest = now.date() - timedelta(days=45)
    latest = now.date() + timedelta(days=100)
    pruned: dict[str, str] = {}
    for key, value in merged.items():
        try:
            day = datetime.strptime(key, "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        if earliest <= day <= latest:
            pruned[key] = value
    return dict(sorted(pruned.items()))


def main() -> int:
    now = datetime.now(PACIFIC)
    existing = load_existing()

    try:
        pdf_bytes, last_modified = fetch_pdf()
        digest = hashlib.sha256(pdf_bytes).hexdigest()

        if existing.get("sourceSha256") == digest and existing.get("parserVersion") == PARSER_VERSION:
            print("Lunch PDF unchanged and parser version is current; nothing to update.")
            return 0

        days, month, year = parse_days(pdf_bytes)
        validate_menu_month(month, year, now)
    except Exception as exc:
        # If the school briefly serves an old/corrupt PDF, preserve already-good
        # data instead of generating a daily failure notification. We still fail
        # when there is no usable current-month data, because then the widget
        # genuinely needs attention.
        if existing_covers_current_month(existing, now):
            print(f"Warning: lunch menu refresh skipped; keeping existing data: {exc}", file=sys.stderr)
            return 0
        raise

    payload = {
        "source": SOURCE_URL,
        "menuMonth": f"{year:04d}-{month:02d}",
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sourceLastModified": last_modified,
        "sourceSha256": digest,
        "parserVersion": PARSER_VERSION,
        "days": merge_days(existing, days, now),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"Imported {len(days)} dates for {payload['menuMonth']}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # Fail only when no usable current-month fallback exists.
        print(f"Lunch menu import failed: {exc}", file=sys.stderr)
        raise
