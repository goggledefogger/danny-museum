"""Write a pre-filled stub into data/incoming/: uv run tools/new.py "Name of thing" """
import sys

import museum as m

STUB = """---
name: {name}
wing: side
years: {year}
role:
stack: []
status: shipped
link:
scale: 1
sources: []
---

## Summary
One or two plain sentences: what it is and why it mattered.

## Facts
- 

## Surprise
One line (max 110 chars) a funhouse machine could say about it.
"""


def main():
    if len(sys.argv) != 2 or not sys.argv[1].strip():
        m.die('usage: uv run tools/new.py "Name of thing"')
    name = sys.argv[1].strip()
    slug = m.kebab(name)
    if not slug:
        m.die("name needs at least one letter or digit")
    path = m.INCOMING / f"{slug}.md"
    if path.exists():
        m.die(f"{path} already exists")
    existing = [p["name"] for p in m.load()["projects"] if m.norm(p["name"]) == m.norm(name)]
    path.parent.mkdir(parents=True, exist_ok=True)
    from datetime import date
    path.write_text(STUB.format(name=name, year=date.today().year), encoding="utf-8")
    print(f"wrote {path.relative_to(m.ROOT)}")
    if existing:
        print(f"note: '{existing[0]}' is already in the museum; ingest will merge and mark it rediscovered")
    print("next: fill it in (delete lines you do not know), then: uv run tools/ingest.py")


if __name__ == "__main__":
    main()
