"""Recon and enrich exhibits across the museum catalogue.

Usage:
  uv run tools/recon.py summary
  uv run tools/recon.py wing <wing-name>
  uv run tools/recon.py candidates
  uv run tools/recon.py add-people <id> "Person 1" "Person 2"
  uv run tools/recon.py add-media <id> --type audio|demo|video|image --title "Title" (--src <path> | --url <url>)
"""
import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import museum as m


def cmd_summary():
    cat = m.load()
    projects = cat["projects"]
    total = len(projects)

    has_link = sum(1 for p in projects if p.get("link"))
    has_people = sum(1 for p in projects if p.get("people"))
    has_media = sum(1 for p in projects if p.get("media"))

    print(f"Museum Catalogue Recon Summary ({total} exhibits):")
    print(f"  Links / URLs:       {has_link:3}/{total} ({has_link*100//total}%)")
    print(f"  People / Members:   {has_people:3}/{total} ({has_people*100//total}%)")
    print(f"  Media / Recordings: {has_media:3}/{total} ({has_media*100//total}%)")
    print()

    print("Coverage by Wing:")
    print(f"  {'Wing':<12} {'Total':<6} {'Links':<8} {'People':<8} {'Media':<8}")
    print("  " + "-" * 42)
    by_wing = defaultdict(list)
    for p in projects:
        by_wing[p["wing"]].append(p)

    for w in m.WINGS:
        plist = by_wing.get(w, [])
        w_tot = len(plist)
        w_link = sum(1 for p in plist if p.get("link"))
        w_peop = sum(1 for p in plist if p.get("people"))
        w_med = sum(1 for p in plist if p.get("media"))
        print(f"  {w:<12} {w_tot:<6} {w_link:<8} {w_peop:<8} {w_med:<8}")


def cmd_wing(wing_name):
    if wing_name not in m.WINGS:
        m.die(f"Unknown wing '{wing_name}'. Wings: {', '.join(m.WINGS)}")
    cat = m.load()
    projects = [p for p in cat["projects"] if p["wing"] == wing_name]
    print(f"Wing: {wing_name.upper()} ({len(projects)} exhibits)\n")
    for p in projects:
        people_str = f"people: {', '.join(p['people'])}" if p.get("people") else "no people"
        media_str = f"media: {len(p['media'])} item(s)" if p.get("media") else "no media"
        link_str = p.get("link") or "no link"
        print(f"  • {p['name']} ({p['id']}, {p.get('years', '?')})")
        print(f"    - {people_str} | {media_str} | {link_str}")
        print(f"    - {p['summary']}\n")


def cmd_candidates():
    cat = m.load()
    projects = cat["projects"]
    found = []

    # Regex for mentions of collaboration
    people_pat = re.compile(r"\b(?:with|and|co-founded with|team of)\s+([A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+)*(?:\s+and\s+[A-Z][a-z]+)?)", re.I)

    for p in projects:
        if p.get("people"):
            continue
        text = p.get("summary", "") + " " + " ".join(p.get("facts", []))
        match = people_pat.search(text)
        if match:
            raw = match.group(1)
            # Split names
            names = [n.strip() for n in re.split(r",|\band\b", raw) if n.strip()]
            if names and len(names) >= 2:
                found.append((p, names))

    print(f"Found {len(found)} exhibits with candidate collaborator names in their summary/facts:\n")
    for p, names in found:
        print(f"  • {p['name']} ({p['id']}, wing: {p['wing']})")
        print(f"    Suggested people: {names}")
        print(f"    Context: \"{p['summary']}\"\n")


def cmd_add_people(pid, names):
    cat = m.load()
    target = next((p for p in cat["projects"] if p["id"] == pid), None)
    if not target:
        m.die(f"Project '{pid}' not found in catalogue.")
    existing = target.get("people", [])
    merged = list(existing)
    for n in names:
        if n not in merged:
            merged.append(n)
    target["people"] = merged
    probs = m.validate_entry(target)
    if probs:
        m.die(f"Validation failed: {probs}")
    m.save(cat)
    print(f"Added people to '{target['name']}': {target['people']}")


def cmd_add_media(pid, m_type, title, src=None, url=None):
    cat = m.load()
    target = next((p for p in cat["projects"] if p["id"] == pid), None)
    if not target:
        m.die(f"Project '{pid}' not found in catalogue.")
    item = {"type": m_type, "title": title}
    if src:
        item["src"] = src
    if url:
        item["url"] = url
    target.setdefault("media", []).append(item)
    probs = m.validate_entry(target)
    if probs:
        m.die(f"Validation failed: {probs}")
    m.save(cat)
    print(f"Added {m_type} media to '{target['name']}': {title}")


def main():
    p = argparse.ArgumentParser(description="Museum Catalogue Recon & Enrichment Tool")
    sub = p.add_subparsers(dest="cmd")

    sub.add_parser("summary")
    sub.add_parser("candidates")

    p_wing = sub.add_parser("wing")
    p_wing.add_argument("name", help="Wing name")

    p_peop = sub.add_parser("add-people")
    p_peop.add_argument("id", help="Project ID")
    p_peop.add_argument("names", nargs="+", help="People names")

    p_med = sub.add_parser("add-media")
    p_med.add_argument("id", help="Project ID")
    p_med.add_argument("--type", required=True, choices=["audio", "demo", "video", "image", "link"])
    p_med.add_argument("--title", required=True)
    p_med.add_argument("--src")
    p_med.add_argument("--url")

    args = p.parse_args()
    if args.cmd == "summary":
        cmd_summary()
    elif args.cmd == "candidates":
        cmd_candidates()
    elif args.cmd == "wing":
        cmd_wing(args.name)
    elif args.cmd == "add-people":
        cmd_add_people(args.id, args.names)
    elif args.cmd == "add-media":
        if not args.src and not args.url:
            m.die("Must provide either --src or --url")
        cmd_add_media(args.id, args.type, args.title, args.src, args.url)
    else:
        cmd_summary()


if __name__ == "__main__":
    main()
