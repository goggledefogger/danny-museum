"""Theme files are data the museum code reads; these checks keep the two in step.
Run: uv run -m pytest tests -q"""
import json
import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
THEMES = REPO / "themes"
SRC = REPO / "src"
BLOCKS = ("palette", "materials", "typography", "css", "copy")


def load(name):
    return json.loads((THEMES / name).read_text())


INDEX = load("index.json")
IDS = [t["id"] for t in INDEX["themes"]]
ALL = {i: load(f"{i}.json") for i in IDS}


def keys(d, prefix=""):
    """Every dotted key path in a nested dict (lists count as leaves)."""
    out = set()
    for k, v in d.items():
        out.add(prefix + k)
        if isinstance(v, dict):
            out |= keys(v, f"{prefix}{k}.")
    return out


def test_index_lists_existing_themes():
    assert len(IDS) >= 1 and len(set(IDS)) == len(IDS)
    assert INDEX["default"] in IDS
    for t in INDEX["themes"]:
        assert t["name"].strip() and t["blurb"].strip()
        assert (THEMES / f"{t['id']}.json").exists()
        assert ALL[t["id"]]["id"] == t["id"]


@pytest.mark.parametrize("tid", IDS)
def test_required_blocks_and_values(tid):
    th = ALL[tid]
    d = th["default"]
    for b in BLOCKS:
        assert isinstance(d.get(b), dict), f"{tid}: default.{b} missing"
    assert d["materials"]["shading"] in ("smooth", "toon")
    for k in ("fontFamily", "maxWeight", "letterSpacing", "handLettered"):
        assert k in d["typography"]
    for k in ("floor", "wall", "ceiling", "trim", "accent", "signBg", "signInk", "caseGlass", "caseFrame", "light", "fog", "sky"):
        assert k in d["palette"], f"{tid}: palette.{k} missing"


def test_themes_define_the_same_keys():
    # every theme is a full style set, so code never meets a missing key
    first, *rest = IDS
    for tid in rest:
        for b in BLOCKS:
            assert keys(ALL[tid]["default"][b]) == keys(ALL[first]["default"][b]), f"{tid}.{b} differs from {first}"


@pytest.mark.parametrize("tid", IDS)
def test_wing_overrides_only_use_default_keys(tid):
    data = json.loads((REPO / "data" / "projects.json").read_text())
    wing_ids = {w["id"] for w in data["wings"]} | {"lobby", "timeline"}
    default_keys = keys(ALL[tid]["default"])
    for wing, override in ALL[tid].get("wings", {}).items():
        assert wing in wing_ids, f"{tid}: unknown wing {wing}"
        extra = keys(override) - default_keys
        assert not extra, f"{tid}: wing {wing} overrides unknown keys {extra}"


def referenced_copy_keys():
    found = set()
    for f in SRC.glob("*.js"):
        for arg in re.findall(r"\bt\(([^,)]*)", f.read_text()):
            # t('key') or t(cond ? 'a' : 'b')
            part = arg.split("?", 1)[1] if "?" in arg else arg
            found |= set(re.findall(r"'(\w+)'", part))
        found |= set(re.findall(r"\.copy\.(\w+)", f.read_text()))
    html = (REPO / "index.html").read_text()
    found |= set(re.findall(r'data-copy(?:-html|-title)?="(\w+)"', html))
    return found


def test_copy_keys_used_by_code_exist_in_every_theme():
    used = referenced_copy_keys()
    assert {"museumTitle", "factoryName", "trapdoorLabel", "acqTitle", "overlayStart", "pickerTitle"} <= used
    for tid in IDS:
        missing = used - set(ALL[tid]["default"]["copy"])
        assert not missing, f"{tid}: copy keys missing {missing}"


def test_css_variables_used_by_stylesheet_exist_in_every_theme():
    used = set(re.findall(r"var\(--([\w-]+)\)", (SRC / "style.css").read_text()))
    used -= {"accent"}  # set per element at runtime from the wing colour
    for tid in IDS:
        missing = used - set(ALL[tid]["default"]["css"])
        assert not missing, f"{tid}: css variables missing {missing}"


def test_props_are_known_types_with_one_factory_and_one_trapdoor():
    src = (SRC / "props.js").read_text()
    known = set(re.findall(r"^  '?([\w-]+)'?\((?:scene|body|g),", src, re.M))
    factories = set(re.findall(r"^  '?([\w-]+)'?\(body,", src, re.M))
    trapdoors = set(re.findall(r"^  '?([\w-]+)'?\(g, hinge,", src, re.M))
    assert {"porthole", "dinosaur", "labelling-machine", "airlock"} <= known
    for tid in IDS:
        types = [p["type"] for p in ALL[tid]["props"]]
        assert set(types) <= known, f"{tid}: unknown props {set(types) - known}"
        assert sum(t in factories for t in types) == 1
        assert sum(t in trapdoors for t in types) == 1
    # the funhouse never lists the orbital props
    assert not {"porthole", "dinosaur", "airlock", "labelling-machine"} & {p["type"] for p in ALL["funhouse"]["props"]}


def test_no_em_dashes_in_theme_or_code():
    files = [*THEMES.glob("*.json"), *SRC.glob("*.js"), SRC / "style.css", REPO / "index.html"]
    for f in files:
        assert "\u2014" not in f.read_text(), f"em-dash in {f.name}"
