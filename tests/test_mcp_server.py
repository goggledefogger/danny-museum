"""Tests for tools/mcp_server.py. Run:
    uv run --with pytest --with "mcp>=1.2,<2" -m pytest tests -q
Every test works on a temp copy of data/; the real catalogue is never touched."""
import json
import shutil
import sys
from datetime import date
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "tools"))
import museum as m  # noqa: E402
import mcp_server as s  # noqa: E402

TODAY = date.today().isoformat()
GOOD = {"name": "Test Gizmo", "wing": "side", "years": "2021", "summary": "A gizmo for tests.",
        "facts": ["Runs on a zebrafinch sensor"], "link": "https://example.com/gizmo"}


@pytest.fixture(autouse=True)
def tmp_root(tmp_path, monkeypatch):
    (tmp_path / "data" / "incoming").mkdir(parents=True)
    for name in ("projects.json", "CHANGELOG.md"):
        if (REPO / "data" / name).exists():
            shutil.copy(REPO / "data" / name, tmp_path / "data" / name)
    monkeypatch.setattr(s, "ROOT", tmp_path)
    monkeypatch.setattr(s, "READ_ONLY", False)
    monkeypatch.delenv("MUSEUM_MCP_READONLY", raising=False)
    return tmp_path


def strict(entry):
    return m.validate_entry(dict(entry, added=TODAY), require_added=True, strict=True)


@pytest.mark.parametrize("bad, needle", [
    ({"wing": "garage"}, "wing"),
    ({"surprise": "x" * 111}, "surprise"),
    ({"link": "javascript:alert(1)"}, "scheme"),
    ({"link": "screens/../../etc/passwd"}, ".."),
])
def test_validator_rejects_bad_values(bad, needle):
    errs = strict({**GOOD, **bad})
    assert errs and any(needle in e for e in errs)


def test_unknown_field_rejected_with_allowed_list():
    r = s.add_project({**GOOD, "colour": "red"})
    assert "unknown field(s): colour" in r["error"] and "allowed fields" in r["error"]


def test_add_then_get_round_trips(tmp_root):
    stored = s.add_project(GOOD)
    assert stored["id"] == "test-gizmo" and stored["added"] == TODAY and stored["sources"] == ["mcp"]
    assert s.get_project("test-gizmo") == stored
    assert "Added: Test Gizmo" in s.get_changelog(1)
    audit = (tmp_root / "data" / "mcp-audit.log").read_text().splitlines()
    assert json.loads(audit[-1])["tool"] == "add_project"


def test_duplicate_add_refused():
    s.add_project(GOOD)
    r = s.add_project({**GOOD, "name": "test gizmo!"})
    assert "update_project" in r["error"]


def test_update_refuses_id_and_added():
    s.add_project(GOOD)
    assert "immutable" in s.update_project("test-gizmo", {"id": "x"})["error"]
    assert "immutable" in s.update_project("test-gizmo", {"added": "2000-01-01"})["error"]


def test_update_mark_rediscovered_sets_date():
    s.add_project(GOOD)
    r = s.update_project("test-gizmo", {"status": "retired"}, mark_rediscovered=True, note="found it")
    assert r["rediscovered"] == TODAY and r["status"] == "retired"
    assert "Note: found it" in s.get_changelog(1)


def test_read_only_refuses_writes(tmp_root, monkeypatch):
    before = (tmp_root / "data" / "projects.json").read_bytes()
    monkeypatch.setenv("MUSEUM_MCP_READONLY", "1")
    for r in (s.add_project(GOOD), s.update_project("x", {"status": "quiet"}), s.stage_project(GOOD)):
        assert "read-only" in r["error"]
    assert (tmp_root / "data" / "projects.json").read_bytes() == before
    assert not list((tmp_root / "data" / "incoming").iterdir())
    assert "count" in s.list_wings()["wings"][0]


def test_backups_created_and_capped(tmp_root):
    s.add_project(GOOD)
    bdir = tmp_root / "data" / ".backups"
    assert len(list(bdir.glob("projects-*.json"))) == 1
    for i in range(22):
        s.update_project("test-gizmo", {"role": f"role {i}"})
    assert len(list(bdir.glob("projects-*.json"))) == s.MAX_BACKUPS


def test_confine_rejects_outside_data(tmp_root):
    with pytest.raises(s.ToolFail):
        s.confine(tmp_root / "README.md")
    with pytest.raises(s.ToolFail):
        s.confine(tmp_root / "data" / ".." / "secret.txt")
    assert s.confine(tmp_root / "data" / "projects.json")


def test_stage_writes_server_named_file(tmp_root):
    before = (tmp_root / "data" / "projects.json").read_bytes()
    r = s.stage_project({**GOOD, "name": "../../Evil Name"})
    p = tmp_root / r["path"]
    assert p.parent == tmp_root / "data" / "incoming"
    assert p.name.startswith(f"{TODAY}-evil-name-") and p.suffix == ".json"
    assert json.loads(p.read_text())["name"] == "../../Evil Name"
    assert (tmp_root / "data" / "projects.json").read_bytes() == before


def test_search_finds_by_fact_word():
    s.add_project(GOOD)
    r = s.search_projects("ZEBRAFINCH")
    assert [x["id"] for x in r["rows"]] == ["test-gizmo"] and r["rows"][0]["why"].startswith("fact:")


def test_oversized_payload_refused():
    assert "too large" in s.stage_project({**GOOD, "summary": "x" * 70000})["error"]
