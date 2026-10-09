"""Fold data/incoming/ into the catalogue: uv run tools/ingest.py [--dry-run] [--date YYYY-MM-DD]"""
import argparse
import shutil
from datetime import date

import museum as m

SKIP = ("EXAMPLE", "README")
FIELDS = ["name", "wing", "years", "role", "summary", "stack", "facts", "surprise", "link", "scale", "status", "people", "media"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--date", default=date.today().isoformat())
    a = ap.parse_args()
    if not m.ISO.match(a.date):
        m.die(f"--date '{a.date}' is not YYYY-MM-DD")

    files = sorted(f for f in m.INCOMING.glob("*") if f.is_file() and f.suffix.lower() in (".json", ".md")
                   and not f.name.startswith(SKIP))
    if not files:
        print("nothing in data/incoming/ to ingest")
        return

    cat = m.load()
    projects = cat["projects"]
    by_id = {p["id"]: p for p in projects}
    by_name = {m.norm(p["name"]): p for p in projects}
    added, redisc, errors = [], [], []

    for f in files:
        try:
            items = m.parse_file(f)
        except Exception as e:
            errors.append(f"{f.name}: {e}")
            continue
        for i, it in enumerate(items):
            tag = f.name if len(items) == 1 else f"{f.name}[{i}]"
            it = dict(it)
            src = it.get("sources")
            if src is not None and not (isinstance(src, list) and all(isinstance(x, str) for x in src)):
                errors.append(f"{tag}: sources must be a list of strings")
                continue
            if isinstance(it.get("facts"), list):
                it["facts"] = [str(x) for x in it["facts"]]
            existing = None
            if it.get("id") and it["id"] in by_id:
                existing = by_id[it["id"]]
            elif it.get("name") and m.norm(it["name"]) in by_name:
                existing = by_name[m.norm(it["name"])]
            if existing is not None:
                # validate the merged result, so a sparse rediscovery stub is fine
                merged = merge(existing, it, a.date, f.stem)
                errs = m.validate_entry(merged, require_added=True)
                if errs:
                    errors += [f"{tag}: {e}" for e in errs]
                    continue
                existing.clear()
                existing.update(merged)
                redisc.append((existing, f))
            else:
                if not it.get("name"):
                    errors.append(f"{tag}: missing required field 'name'")
                    continue
                it.setdefault("id", m.kebab(it["name"]))
                if it["id"] in by_id:
                    errors.append(f"{tag}: id '{it['id']}' already used by a different name")
                    continue
                it.setdefault("stack", [])
                it.setdefault("facts", [])
                it["added"] = a.date
                it.setdefault("sources", [f"incoming/{f.name}"])
                errs = m.validate_entry(it, require_added=True)
                if errs:
                    errors += [f"{tag}: {e}" for e in errs]
                    continue
                ordered = {k: it[k] for k in ["id"] + FIELDS if k in it}
                ordered.update({k: v for k, v in it.items() if k not in ordered})
                projects.append(ordered)
                by_id[ordered["id"]] = ordered
                by_name[m.norm(ordered["name"])] = ordered
                added.append((ordered, f))

    if errors:
        print("INVALID, nothing written:", *errors, sep="\n  ", file=__import__("sys").stderr)
        raise SystemExit(1)

    projects.sort(key=m.sort_key)
    print(("DRY RUN - " if a.dry_run else "") + f"{len(added)} added, {len(redisc)} rediscovered")
    for p, f in added:
        print(f"  + {p['name']} ({p['wing']}, {p['years']}) from {f.name}")
    for p, f in redisc:
        print(f"  ~ {p['name']} refreshed from {f.name}")
    print(f"catalogue: {len(projects)} projects")
    if a.dry_run:
        return

    m.save(cat)
    lines = [f"## {a.date}", ""]
    lines += [f"- Added: {p['name']} ({p['wing']}, {p['years']}) - {first_sentence(p['summary'])}" for p, _ in added]
    lines += [f"- Rediscovered: {p['name']} ({p['wing']}, {p['years']}) - {first_sentence(p['summary'])}" for p, _ in redisc]
    old = m.CHANGELOG.read_text(encoding="utf-8") if m.CHANGELOG.exists() else "# Changelog\n"
    m.CHANGELOG.write_text(old.rstrip("\n") + "\n\n" + "\n".join(lines) + "\n", encoding="utf-8")
    done = m.INCOMING / "done"
    done.mkdir(exist_ok=True)
    for f in files:
        shutil.move(str(f), str(done / f"{a.date}-{f.name}"))


def first_sentence(s):
    ss = m.sentences(s)
    return ss[0] if ss else ""


def merge(existing, new, day, stem):
    out = dict(existing)
    for k in FIELDS:
        if k in ("facts",):
            continue
        v = new.get(k)
        if v in (None, "", []):
            continue
        if out.get(k) in (None, "", []):
            out[k] = v
    facts = list(out.get("facts", []))
    low = {x.lower() for x in facts}
    for x in new.get("facts", []):
        if x.lower() not in low and len(facts) < 4:
            facts.append(x)
            low.add(x.lower())
    out["facts"] = facts
    srcs = list(out.get("sources", []))
    for s in new.get("sources") or [f"incoming/{stem}"]:
        if s not in srcs:
            srcs.append(s)
    out["sources"] = srcs
    out["rediscovered"] = day
    return out


if __name__ == "__main__":
    main()
