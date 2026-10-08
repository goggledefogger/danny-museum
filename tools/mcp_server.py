# /// script
# requires-python = ">=3.10"
# dependencies = ["mcp>=1.2,<2"]  # FastMCP import; mcp 2.x renamed it to MCPServer
# ///
"""MCP server for the project museum. stdio only.

    uv run tools/mcp_server.py [--read-only]

Reads and writes only under data/. Validation is the shared one in tools/museum.py
(strict mode). Writes are locked, atomic, backed up, audited and logged to the changelog.
"""
import argparse
import contextlib
import fcntl
import functools
import json
import os
import secrets
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import museum as m  # noqa: E402

from mcp.server.fastmcp import FastMCP  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MAX_PAYLOAD = 64 * 1024
MAX_BACKUPS = 20
MAX_NOTE = 300
MAX_QUERY = 200
ADD_FIELDS = ["id"] + m.EDITABLE_FIELDS
READ_ONLY = False


class ToolFail(Exception):
    """An error whose message is safe to show the client."""


# ---- paths: constants under ROOT/data, never from input ----

def data_dir():
    return ROOT / "data"


def projects_path():
    return data_dir() / "projects.json"


def changelog_path():
    return data_dir() / "CHANGELOG.md"


def incoming_dir():
    return data_dir() / "incoming"


def backups_dir():
    return data_dir() / ".backups"


def audit_path():
    return data_dir() / "mcp-audit.log"


def lock_path():
    return data_dir() / ".mcp.lock"


def rel(path):
    try:
        return str(Path(path).resolve().relative_to(ROOT.resolve()))
    except ValueError:
        return "<outside repo>"


def confine(path):
    """Resolve path and refuse unless it lies inside ROOT/data. Call before every open."""
    root = ROOT.resolve()
    base = data_dir().resolve()
    target = Path(path).resolve()
    if not base.is_relative_to(root) or not (target == base or target.is_relative_to(base)):
        raise ToolFail("refused: path is outside data/")
    return target


# ---- guards ----

def read_only():
    return READ_ONLY or os.environ.get("MUSEUM_MCP_READONLY", "") == "1"


def payload_size(args, kwargs):
    try:
        return len(json.dumps([args, kwargs], default=str, ensure_ascii=False).encode("utf-8"))
    except (TypeError, ValueError):
        return MAX_PAYLOAD + 1


def guarded(write=False):
    """Size limit, read-only refusal and safe error messages for every tool."""
    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            if payload_size(args, kwargs) > MAX_PAYLOAD:
                return {"error": f"payload too large (max {MAX_PAYLOAD // 1024} KB)"}
            if write and read_only():
                return {"error": "refused: the museum MCP server is in read-only mode; nothing was written"}
            try:
                return fn(*args, **kwargs)
            except ToolFail as e:
                return {"error": str(e)}
            except Exception as e:  # never leak a stack trace or absolute path
                return {"error": f"internal error ({type(e).__name__})"}
        return wrapper
    return deco


# ---- disk ----

def load():
    p = confine(projects_path())
    try:
        cat = json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ToolFail("data/projects.json not found")
    except json.JSONDecodeError:
        raise ToolFail("data/projects.json is not valid JSON")
    if not isinstance(cat, dict) or not isinstance(cat.get("projects"), list):
        raise ToolFail("data/projects.json has no projects list")
    return cat


@contextlib.contextmanager
def locked():
    lp = confine(lock_path())
    with open(lp, "a") as fh:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


def utc_stamp():
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")


def backup_current():
    src = confine(projects_path())
    if not src.exists():
        return None
    bdir = confine(backups_dir())
    bdir.mkdir(exist_ok=True)
    dest = confine(bdir / f"projects-{utc_stamp()}.json")
    with open(dest, "xb") as out:
        out.write(src.read_bytes())
    old = sorted(bdir.glob("projects-*.json"), key=lambda x: x.name)
    for stale in old[:-MAX_BACKUPS]:
        confine(stale).unlink()
    return dest


def atomic_write(path, text):
    target = confine(path)
    mode = target.stat().st_mode & 0o777 if target.exists() else 0o644
    fd, tmp = tempfile.mkstemp(dir=confine(data_dir()), prefix=".projects-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, mode)
        os.replace(confine(tmp), target)
    except BaseException:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(tmp)
        raise


def append_changelog(lines):
    p = confine(changelog_path())
    heading = f"## {date.today().isoformat()} via MCP"
    old = p.read_text(encoding="utf-8") if p.exists() else "# Changelog\n"
    last = [ln for ln in old.splitlines() if ln.startswith("## ")]
    body = old.rstrip("\n") + "\n"
    if not last or last[-1] != heading:
        body += "\n" + heading + "\n\n"
    body += "\n".join(lines) + "\n"
    p.write_text(body, encoding="utf-8")


def append_audit(tool, pid, fields, note):
    p = confine(audit_path())
    rec = {"utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "tool": tool, "id": pid,
           "fields": fields, "note": note or ""}
    with open(p, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, ensure_ascii=False) + "\n")


def commit(cat, tool, pid, fields, note, log_lines):
    """Validate the whole catalogue, back up, replace atomically, audit. Caller holds the lock."""
    cat["projects"].sort(key=m.sort_key)
    probs = m.validate_catalogue(cat, strict=True)
    if probs:
        shown = "; ".join(f"{label}: {e}" for label, e in probs[:10])
        raise ToolFail(f"refused, the catalogue would be invalid: {shown}")
    backup_current()
    atomic_write(projects_path(), json.dumps(cat, indent=2, ensure_ascii=False) + "\n")
    append_changelog(log_lines)
    append_audit(tool, pid, fields, note)


# ---- helpers ----

def compact(p):
    return {k: p.get(k) for k in ("id", "name", "wing", "years", "status", "added", "rediscovered")}


def first_sentence(s):
    ss = m.sentences(s or "")
    return ss[0] if ss else ""


def clean_note(note):
    if note is None:
        return ""
    if not isinstance(note, str):
        raise ToolFail("note must be a string")
    note = m.clean_text(note)
    if len(note) > MAX_NOTE:
        raise ToolFail(f"note is {len(note)} chars (max {MAX_NOTE})")
    return note


def check_input(entry, allowed):
    cleaned, errs = m.clean_input(entry, allowed)
    if errs:
        raise ToolFail("invalid: " + "; ".join(errs))
    return cleaned


def ordered(entry):
    out = {k: entry[k] for k in m.ENTRY_FIELDS if k in entry}
    out.update({k: v for k, v in entry.items() if k not in out})
    return out


def find(cat, pid):
    for p in cat["projects"]:
        if p.get("id") == pid:
            return p
    return None


def clamp(v, lo, hi, name):
    if isinstance(v, bool) or not isinstance(v, int):
        raise ToolFail(f"{name} must be an integer")
    return max(lo, min(hi, v))


# ---- server and tools ----

mcp = FastMCP("danny-museum", instructions=(
    "Danny's project museum catalogue. Read tools are free. add_project and update_project change "
    "data/projects.json; stage_project only drops a file in data/incoming/ for a human to ingest. "
    "There is no delete: retire with update_project(status='retired')."))


@mcp.tool()
@guarded()
def list_wings() -> dict:
    """List the six wings with their project counts."""
    cat = load()
    counts = {}
    for p in cat["projects"]:
        counts[p.get("wing")] = counts.get(p.get("wing"), 0) + 1
    return {"wings": [{"id": w.get("id"), "name": w.get("name"), "tagline": w.get("tagline", ""),
                       "count": counts.get(w.get("id"), 0)} for w in cat.get("wings", [])]}


@mcp.tool()
@guarded()
def list_projects(wing: str | None = None, start_year_from: int | None = None, start_year_to: int | None = None,
                  status: str | None = None, fresh_days: int | None = None, limit: int = 50,
                  offset: int = 0) -> dict:
    """List projects as compact rows, filtered by wing, start-year range, status, or added/rediscovered
    within the last fresh_days days."""
    if wing is not None and wing not in m.WINGS:
        raise ToolFail(f"wing must be one of {', '.join(m.WINGS)}")
    if status is not None and status not in m.STATUSES:
        raise ToolFail(f"status must be one of {', '.join(m.STATUSES)}")
    limit = clamp(limit, 1, 500, "limit")
    offset = clamp(offset, 0, 10**6, "offset")
    cutoff = None
    if fresh_days is not None:
        cutoff = (date.today() - timedelta(days=clamp(fresh_days, 0, 36500, "fresh_days"))).isoformat()
    rows = []
    for p in load()["projects"]:
        y = m.start_year(p.get("years", ""))
        if wing and p.get("wing") != wing:
            continue
        if status and p.get("status") != status:
            continue
        if start_year_from is not None and y < clamp(start_year_from, 0, 9999, "start_year_from"):
            continue
        if start_year_to is not None and y > clamp(start_year_to, 0, 9999, "start_year_to"):
            continue
        if cutoff and max(p.get("added") or "", p.get("rediscovered") or "") < cutoff:
            continue
        rows.append(compact(p))
    return {"total": len(rows), "offset": offset, "limit": limit, "rows": rows[offset:offset + limit]}


def _why(p, terms):
    fields = [("name", p.get("name", "")), ("summary", p.get("summary", "")), ("role", p.get("role", ""))]
    fields += [("fact", f) for f in p.get("facts", [])] + [("stack", s) for s in p.get("stack", [])]
    for label, text in fields:
        low = text.lower()
        i = low.find(terms[0])
        if i >= 0:
            a, b = max(0, i - 50), min(len(text), i + len(terms[0]) + 60)
            snip = ("..." if a else "") + text[a:b] + ("..." if b < len(text) else "")
            return f"{label}: {snip}"
    return ""


@mcp.tool()
@guarded()
def search_projects(query: str, limit: int = 20) -> dict:
    """Case-insensitive search over name, summary, facts, stack and role. Every word must match somewhere."""
    if not isinstance(query, str):
        raise ToolFail("query must be a string")
    q = m.clean_text(query).lower()
    if not q:
        raise ToolFail("query is empty")
    if len(q) > MAX_QUERY:
        raise ToolFail(f"query is too long (max {MAX_QUERY} chars)")
    limit = clamp(limit, 1, 100, "limit")
    terms = q.split()
    hits = []
    for p in load()["projects"]:
        hay = " ".join([p.get("name", ""), p.get("summary", ""), p.get("role", "")] + list(p.get("facts", []))
                       + list(p.get("stack", []))).lower()
        if q in hay or all(t in hay for t in terms):
            row = compact(p)
            row["why"] = _why(p, [q] if q in hay else terms)
            hits.append(row)
    return {"total": len(hits), "rows": hits[:limit]}


@mcp.tool()
@guarded()
def get_project(id: str) -> dict:
    """Return the full entry for one project id."""
    p = find(load(), id)
    if p is None:
        raise ToolFail(f"no project with id '{m.clean_text(str(id))[:80]}'")
    return p


@mcp.tool()
@guarded()
def get_changelog(last_n_sections: int = 5) -> str:
    """The tail of data/CHANGELOG.md: the last N dated sections."""
    n = clamp(last_n_sections, 1, 50, "last_n_sections")
    p = confine(changelog_path())
    if not p.exists():
        return "no changes yet"
    sections, cur = [], None
    for ln in p.read_text(encoding="utf-8").splitlines():
        if ln.startswith("## "):
            cur = [ln]
            sections.append(cur)
        elif cur is not None:
            cur.append(ln)
    if not sections:
        return "no changes yet"
    return "\n\n".join("\n".join(s).strip() for s in sections[-n:])


@mcp.tool()
@guarded()
def validate_catalogue() -> dict:
    """The same report tools/validate.py prints: per-wing counts, newest entries, problems."""
    lines, n = m.catalogue_report(load())
    return {"ok": n == 0, "problems": n, "report": "\n".join(lines)}


@mcp.tool()
@guarded(write=True)
def add_project(entry: dict) -> dict:
    """Add a new project. Derives id from name if missing; refuses duplicates (use update_project).
    Sets added=today and sources (default ["mcp"])."""
    it = check_input(entry, ADD_FIELDS)
    if not it.get("name"):
        raise ToolFail("invalid: missing required field 'name'")
    it["id"] = it.get("id") or m.kebab(it["name"])
    if not it["id"]:
        raise ToolFail("invalid: name needs at least one letter or digit")
    it.setdefault("stack", [])
    it.setdefault("facts", [])
    it["sources"] = it.get("sources") or ["mcp"]
    it["added"] = date.today().isoformat()
    for k in [k for k, v in it.items() if v == ""]:
        del it[k]
    errs = m.validate_entry(it, require_added=True, strict=True)
    if errs:
        raise ToolFail("invalid: " + "; ".join(errs))
    it = ordered(it)
    with locked():
        cat = load()
        for p in cat["projects"]:
            if p.get("id") == it["id"] or m.norm(p.get("name", "")) == m.norm(it["name"]):
                raise ToolFail(f"already in the museum as '{p.get('id')}' ({p.get('name')}); "
                               "use update_project to change it")
        cat["projects"].append(it)
        commit(cat, "add_project", it["id"], sorted(k for k in it if k not in ("id", "added")), "",
               [f"- Added: {it['name']} ({it['wing']}, {it['years']}) - {first_sentence(it['summary'])}"])
    return it


@mcp.tool()
@guarded(write=True)
def update_project(id: str, changes: dict, mark_rediscovered: bool = False, note: str | None = None) -> dict:
    """Change fields of an existing project. Editable: name, wing, years, role, summary, stack, facts,
    surprise, link, scale, status, sources. id and added are immutable. An empty string clears an
    optional field. mark_rediscovered sets rediscovered=today. Retire with status='retired'."""
    if isinstance(changes, dict) and ({"id", "added"} & set(changes)):
        raise ToolFail("refused: id and added are immutable")
    ch = check_input(changes, m.EDITABLE_FIELDS)
    note = clean_note(note)
    if not ch and not mark_rediscovered:
        raise ToolFail("nothing to change")
    with locked():
        cat = load()
        p = find(cat, id)
        if p is None:
            raise ToolFail(f"no project with id '{m.clean_text(str(id))[:80]}'")
        new = dict(p)
        for k, v in ch.items():
            if v == "" or (v == [] and k == "sources"):
                new.pop(k, None)
            else:
                new[k] = v
        if mark_rediscovered:
            new["rediscovered"] = date.today().isoformat()
        changed = sorted(k for k in set(new) | set(p) if new.get(k) != p.get(k))
        if not changed:
            raise ToolFail("nothing to change (values are the same)")
        errs = m.validate_entry(new, require_added=True, strict=True)
        if errs:
            raise ToolFail("invalid: " + "; ".join(errs))
        new = ordered(new)
        p.clear()
        p.update(new)
        verb = "Rediscovered" if mark_rediscovered else "Updated"
        line = f"- {verb}: {new['name']} ({new['wing']}, {new['years']}) - changed {', '.join(changed)}"
        commit(cat, "update_project", new["id"], changed, note, [line + (f". Note: {note}" if note else "")])
    return new


@mcp.tool()
@guarded(write=True)
def stage_project(entry: dict) -> dict:
    """Low-trust write: validate an entry and drop it in data/incoming/ for a human to review and
    ingest with tools/ingest.py. Does not touch the catalogue. Returns the repo-relative path."""
    it = check_input(entry, ADD_FIELDS)
    for k in [k for k, v in it.items() if v == ""]:
        del it[k]
    errs = m.validate_entry(it, strict=True)
    if errs:
        raise ToolFail("invalid: " + "; ".join(errs))
    it = ordered(it)
    slug = (m.kebab(it["name"])[:40].strip("-")) or "entry"
    name = f"{date.today().isoformat()}-{slug}-{secrets.token_hex(3)}.json"
    with locked():
        idir = confine(incoming_dir())
        idir.mkdir(exist_ok=True)
        path = confine(idir / name)
        with open(path, "x", encoding="utf-8") as fh:
            fh.write(json.dumps(it, indent=2, ensure_ascii=False) + "\n")
        append_audit("stage_project", it.get("id") or m.kebab(it["name"]), sorted(it), "")
    existing = [p.get("id") for p in load()["projects"] if m.norm(p.get("name", "")) == m.norm(it["name"])]
    out = {"path": rel(path), "next": "review it, then run: uv run tools/ingest.py"}
    if existing:
        out["note"] = f"matches existing '{existing[0]}'; ingest will merge and mark it rediscovered"
    return out


def main(argv=None):
    global READ_ONLY
    ap = argparse.ArgumentParser(description="MCP server (stdio) for Danny's project museum.")
    ap.add_argument("--read-only", action="store_true",
                    help="refuse every write tool (same as MUSEUM_MCP_READONLY=1)")
    a = ap.parse_args(argv)
    READ_ONLY = a.read_only or os.environ.get("MUSEUM_MCP_READONLY", "") == "1"
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
