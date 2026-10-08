"""Shared helpers for the museum tools. Standard library only."""
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PROJECTS = DATA / "projects.json"
INCOMING = DATA / "incoming"
CHANGELOG = DATA / "CHANGELOG.md"
WINGS = ["work", "side", "personal", "brain", "home", "music"]
STATUSES = ["active", "shipped", "quiet", "retired"]
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ID_RE = re.compile(r"^[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*$")

# Strict limits, used by the MCP server (validate_entry(..., strict=True)).
# The CLI tools keep the original, looser rules unless they opt in.
TEXT_FIELDS = ["name", "wing", "years", "role", "summary", "surprise", "link", "status"]
LIST_FIELDS = ["stack", "facts", "sources"]
EDITABLE_FIELDS = ["name", "wing", "years", "role", "summary", "stack", "facts", "surprise", "link",
                   "scale", "status", "sources"]
ENTRY_FIELDS = ["id"] + EDITABLE_FIELDS + ["added", "rediscovered", "founding"]
MAX_LEN = {"id": 80, "name": 120, "wing": 20, "years": 40, "role": 200, "summary": 600, "surprise": 110,
           "link": 500, "status": 20}
MAX_ITEM_LEN = {"facts": 300, "stack": 40, "sources": 80}
MAX_ITEMS = {"facts": 4, "stack": 20, "sources": 10}


def load():
    return json.loads(PROJECTS.read_text(encoding="utf-8"))


def save(cat):
    PROJECTS.write_text(json.dumps(cat, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def kebab(name):
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s


def norm(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


def start_year(years):
    m = re.search(r"\d{4}", str(years))
    return int(m.group()) if m else 9999


def sort_key(p):
    return (start_year(p.get("years", "")), p.get("name", "").lower())


def sentences(text):
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])", text.strip())
    return [x for x in parts if x]


def validate_entry(p, require_added=False, strict=False):
    """Return a list of problem strings for one project entry.

    strict=True adds the hardening rules (types, lengths, list sizes, link scheme, known fields only)."""
    errs = []
    if not isinstance(p, dict):
        return ["entry is not an object"]
    if strict:
        errs += strict_problems(p)
        if errs:
            return errs
    for k in ("name", "wing", "years", "summary"):
        if not str(p.get(k, "")).strip():
            errs.append(f"missing required field '{k}'")
    if p.get("wing") and p["wing"] not in WINGS:
        errs.append(f"wing '{p['wing']}' not one of {', '.join(WINGS)}")
    if p.get("years") and not re.search(r"\d{4}", str(p["years"])):
        errs.append(f"years '{p['years']}' has no 4-digit start year")
    if p.get("summary") and len(sentences(p["summary"])) > 2:
        errs.append("summary is longer than 2 sentences")
    s = p.get("surprise", "")
    if len(s) > 110:
        errs.append(f"surprise is {len(s)} chars (max 110)")
    f = p.get("facts", [])
    if not isinstance(f, list):
        errs.append("facts must be a list")
    elif len(f) > 4:
        errs.append(f"{len(f)} facts (max 4)")
    if "stack" in p and not isinstance(p["stack"], list):
        errs.append("stack must be a list")
    if "sources" in p and not (isinstance(p["sources"], list) and all(isinstance(x, str) for x in p["sources"])):
        errs.append("sources must be a list of strings")
    if p.get("status") and p["status"] not in STATUSES:
        errs.append(f"status '{p['status']}' not one of {', '.join(STATUSES)}")
    if "scale" in p and p["scale"] not in (1, 2, 3):
        errs.append("scale must be 1, 2 or 3")
    for k in ("added", "rediscovered"):
        if k in p and not ISO.match(str(p[k])):
            errs.append(f"{k} '{p[k]}' is not YYYY-MM-DD")
    if require_added and not p.get("added"):
        errs.append("missing 'added' date")
    return errs


def validate_catalogue(cat, strict=False):
    """Return list of (label, problem)."""
    probs = []
    wing_ids = [w["id"] for w in cat.get("wings", [])]
    if sorted(wing_ids) != sorted(WINGS):
        probs.append(("wings", f"wing ids {wing_ids} differ from {WINGS}"))
    ids, names = {}, {}
    for p in cat.get("projects", []):
        label = p.get("id") or p.get("name") or "?"
        if not p.get("id"):
            probs.append((label, "missing id"))
        elif p["id"] in ids:
            probs.append((label, "duplicate id"))
        ids[p.get("id")] = 1
        n = norm(p.get("name", ""))
        if n in names:
            probs.append((label, f"duplicate name (same as {names[n]})"))
        names[n] = label
        for e in validate_entry(p, require_added=True, strict=strict):
            probs.append((label, e))
    return probs


def catalogue_report(cat, strict=False):
    """The validate.py report as (lines, problem_count)."""
    projects = cat.get("projects", [])
    probs = validate_catalogue(cat, strict=strict)
    names = {w.get("id"): w.get("name", "") for w in cat.get("wings", [])}
    counts = Counter(p.get("wing") for p in projects)
    out = ["Per wing:"]
    for w in WINGS:
        out.append(f"  {w:9} {counts.get(w, 0):4}  {names.get(w, '')}")
    newest = sorted(projects, key=lambda p: (p.get("rediscovered") or p.get("added") or ""), reverse=True)[:5]
    out.append("Newest:")
    for p in newest:
        tag = f"rediscovered {p['rediscovered']}" if p.get("rediscovered") else f"added {p.get('added', '?')}"
        out.append(f"  {p.get('name', '?')} ({tag})")
    if probs:
        out.append(f"Problems ({len(probs)}):")
        for label, e in probs:
            out.append(f"  {label}: {e}")
    out.append(f"{len(projects)} projects, {len(WINGS)} wings, {len(probs)} problems")
    return out, len(probs)


# ---- strict (untrusted input) checks ----

def clean_text(v):
    """Strip control characters (tabs and newlines become spaces) and outer whitespace."""
    v = re.sub(r"[\t\n\r]+", " ", v)
    return "".join(c for c in v if unicodedata.category(c) != "Cc").strip()


def clean_input(entry, allowed):
    """Type-check and clean an untrusted entry or change set. Returns (cleaned, problems)."""
    if not isinstance(entry, dict):
        return {}, ["entry must be a JSON object"]
    unknown = sorted(str(k) for k in entry if k not in allowed)
    if unknown:
        return {}, [f"unknown field(s): {', '.join(unknown)}; allowed fields: {', '.join(allowed)}"]
    out, errs = {}, []
    for k, v in entry.items():
        if k == "scale":
            if isinstance(v, bool) or v not in (1, 2, 3):
                errs.append("scale must be 1, 2 or 3")
            else:
                out[k] = v
        elif k in LIST_FIELDS:
            if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
                errs.append(f"{k} must be a list of strings")
            else:
                out[k] = [c for c in (clean_text(x) for x in v) if c]
        else:
            if not isinstance(v, str):
                errs.append(f"{k} must be a string")
            else:
                out[k] = clean_text(v)
    return out, errs


def link_problem(link):
    """None if the link is http(s) or a safe relative path, else the reason."""
    if any(unicodedata.category(c) == "Cc" for c in link) or "\\" in link:
        return "link contains control characters or backslashes"
    if link.startswith("//"):
        return "link must not be protocol-relative (//host)"
    try:
        parts = urlsplit(link)
    except ValueError:
        return "link is not a valid URL"
    if parts.scheme or ":" in link.split("/", 1)[0]:
        if parts.scheme.lower() not in ("http", "https"):
            return "link scheme must be http or https (or a relative path)"
        if not parts.netloc:
            return "link URL has no host"
        return None
    path = unquote(parts.path)
    if ".." in path.split("/"):
        return "relative link must not contain '..' segments"
    return None


def strict_problems(p):
    """Hardening rules for one stored entry: field set, types, lengths, list sizes, link."""
    errs = []
    unknown = sorted(str(k) for k in p if k not in ENTRY_FIELDS)
    if unknown:
        errs.append(f"unknown field(s): {', '.join(unknown)}; allowed fields: {', '.join(ENTRY_FIELDS)}")
    for k, v in p.items():
        if k in LIST_FIELDS:
            if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
                errs.append(f"{k} must be a list of strings")
                continue
            if len(v) > MAX_ITEMS[k]:
                errs.append(f"{k} has {len(v)} items (max {MAX_ITEMS[k]})")
            for x in v:
                if len(x) > MAX_ITEM_LEN[k]:
                    errs.append(f"an item in {k} is {len(x)} chars (max {MAX_ITEM_LEN[k]})")
                if any(unicodedata.category(c) == "Cc" for c in x):
                    errs.append(f"an item in {k} contains control characters")
        elif k == "scale":
            if isinstance(v, bool) or v not in (1, 2, 3):
                errs.append("scale must be 1, 2 or 3")
        elif k == "founding":
            if not isinstance(v, bool):
                errs.append("founding must be true or false")
        elif k in MAX_LEN or k in ("added", "rediscovered"):
            if not isinstance(v, str):
                errs.append(f"{k} must be a string")
                continue
            if k in MAX_LEN and len(v) > MAX_LEN[k]:
                errs.append(f"{k} is {len(v)} chars (max {MAX_LEN[k]})")
            if any(unicodedata.category(c) == "Cc" for c in v):
                errs.append(f"{k} contains control characters")
    if isinstance(p.get("id"), str) and not ID_RE.match(p["id"]):
        errs.append("id must be letters and digits joined by single - _ or .")
    if isinstance(p.get("link"), str) and p["link"]:
        lp = link_problem(p["link"])
        if lp:
            errs.append(lp)
    return errs


# ---- incoming file parsing ----

def _scalar(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def _listval(v):
    v = v.strip()
    if v.startswith("[") and v.endswith("]"):
        v = v[1:-1]
    return [_scalar(x) for x in v.split(",") if x.strip()]


def parse_markdown(text):
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.S)
    if not m:
        raise ValueError("no YAML frontmatter (file must start with ---)")
    fm, body = m.groups()
    e = {}
    for line in fm.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            raise ValueError(f"bad frontmatter line: {line!r}")
        k, v = line.split(":", 1)
        k = k.strip()
        if k in ("stack", "sources"):
            e[k] = _listval(v)
        elif k == "scale":
            try:
                e[k] = int(v.strip())
            except ValueError:
                raise ValueError(f"scale '{v.strip()}' is not a number")
        elif k:
            val = _scalar(v)
            if val != "":
                e[k] = val
    sections, cur = {}, None
    for line in body.splitlines():
        h = re.match(r"^##\s+(.*?)\s*$", line)
        if h:
            cur = h.group(1).strip().lower()
            sections[cur] = []
        elif cur is not None:
            sections[cur].append(line)
    if "summary" in sections:
        t = " ".join(x.strip() for x in sections["summary"] if x.strip())
        if t:
            e["summary"] = t
    if "facts" in sections:
        fs = [re.sub(r"^\s*[-*]\s+", "", x).strip() for x in sections["facts"] if re.match(r"^\s*[-*]\s+\S", x)]
        if fs:
            e["facts"] = fs
    if "surprise" in sections:
        t = " ".join(x.strip() for x in sections["surprise"] if x.strip())
        if t:
            e["surprise"] = t
    return [e]


def parse_file(path):
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        data = json.loads(text)
        items = data if isinstance(data, list) else [data]
    elif path.suffix.lower() == ".md":
        items = parse_markdown(text)
    else:
        raise ValueError("unsupported file type (use .json or .md)")
    for it in items:
        if not isinstance(it, dict):
            raise ValueError("entry is not an object")
    return items


def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)
