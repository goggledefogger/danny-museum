# Danny's Project Museum

A walk-through museum of everything Danny has built: day jobs, side quests, personal and home projects, music, and the second brain. Six wings, one catalogue (`data/projects.json`), no build step.

## Run it

```
python3 -m http.server 8787
```

From the repo root, then open http://localhost:8787. The tools below use `uv run` and the standard library only, so there is nothing to install.

## "I just remembered something I built"

1. `uv run tools/new.py "Name of thing"` writes a stub to `data/incoming/`.
2. Fill in about 5 lines (name, wing, years, a summary, a fact or two). Delete lines you do not know.
3. `uv run tools/ingest.py` (add `--dry-run` to preview). It validates, adds or merges, re-sorts, logs to `data/CHANGELOG.md`, and moves the file to `data/incoming/done/`.

If the thing is already in the museum, ingest merges instead: empty fields are filled, facts are added up to 4, sources are recorded, and it is marked rediscovered. Nothing existing is overwritten. You can also drop a JSON file (one entry or an array) into `data/incoming/`; see `data/incoming/README.md`.

Check the whole catalogue any time with `uv run tools/validate.py` (per-wing counts, newest entries, problems; non-zero exit on problems).

## Data shape in brief

`data/projects.json` is `{wings: [...], projects: [...]}`. A project has `id`, `name`, `wing` (work, side, personal, brain, home, music), `years`, `role`, `summary`, `stack`, `facts`, `surprise`, `link`, `scale` (1-3), `status`, plus `added`, and optionally `rediscovered` and `sources`. Full details in `data/SCHEMA.md`.

## What shows as new

NEW ribbons and the New Acquisitions case in the lobby come from the `added` and `rediscovered` dates. Ingesting a new thing or a rediscovery is all it takes for it to show up there.

## Themes

There are 2 themes. A picker on the first screen lets you choose one. Open `?theme=funhouse` or `?theme=orbital-paper` to skip the picker. Themes are JSON files in `themes/`, and a theme can override its look and words per wing. The schema is described at the top of `src/theme.js`.

## License

MIT. See `LICENSE`.

## MCP server

`tools/mcp_server.py` lets an AI client read the catalogue and, carefully, add to it. It speaks MCP over stdio only (no HTTP, no sockets). uv fetches the MCP SDK from the script header; everything else is the standard library.

```
uv run tools/mcp_server.py              # read and write
uv run tools/mcp_server.py --read-only  # or MUSEUM_MCP_READONLY=1
```

Register with Claude Code:

```
claude mcp add danny-museum -- uv run /path/to/danny-museum/tools/mcp_server.py
```

Other clients (add `"--read-only"` to `args` for a read-only server):

```json
{
  "mcpServers": {
    "danny-museum": {
      "command": "uv",
      "args": ["run", "/path/to/danny-museum/tools/mcp_server.py"]
    }
  }
}
```

Tools:

- `list_wings()`: the six wings with project counts
- `list_projects(wing, start_year_from, start_year_to, status, fresh_days, limit=50, offset=0)`: compact rows (id, name, wing, years, status, added, rediscovered)
- `search_projects(query, limit=20)`: case-insensitive match over name, summary, facts, stack, role, with a one-line "why"
- `get_project(id)`: the full entry
- `get_changelog(last_n_sections=5)`: the tail of `data/CHANGELOG.md`
- `validate_catalogue()`: the same report as `tools/validate.py`
- `add_project(entry)`: add a new thing; refuses duplicates (use `update_project`); sets `added` to today and `sources` (default `["mcp"]`)
- `update_project(id, changes, mark_rediscovered=false, note)`: change name, wing, years, role, summary, stack, facts, surprise, link, scale, status or sources; `id` and `added` never change
- `stage_project(entry)`: the low-trust path; writes a validated file to `data/incoming/` for you to review and ingest, never touches the catalogue

There is no delete. Retire a thing with `update_project(id, {"status": "retired"})`.

Security posture:

1. Confined to `data/`. Every file is a fixed path under the repo's `data/` folder, checked after resolving symlinks before it is opened. No tool takes a path; staged file names are made by the server (date, slug, random suffix).
2. Validated input. The same validator as `validate.py` and `ingest.py` (in `tools/museum.py`, strict mode), plus length and list-size limits, strings only, control characters stripped, links only `http(s)://` or a relative path without `..`, unknown fields refused with the allowed list. Every write re-validates the whole catalogue and refuses if anything is invalid.
3. Atomic, locked writes. An exclusive lock on `data/.mcp.lock`, a temp file swapped in with `os.replace`, and the previous `projects.json` copied to `data/.backups/` first (newest 20 kept).
4. Audited. One JSON line per write in `data/mcp-audit.log`, and a line under `## <date> via MCP` in `data/CHANGELOG.md`.
5. Read-only mode. `--read-only` or `MUSEUM_MCP_READONLY=1`: the write tools are still listed but refuse without touching disk.
6. No network, no subprocesses, nothing read outside `data/`. Errors say what was wrong, never a stack trace or an absolute path.
7. Size limit. Any single tool call over 64 KB is refused.

Tests (on a temp copy of `data/`, never the real catalogue):

```
uv run --with pytest --with "mcp>=1.2,<2" -m pytest tests -q
```

The SDK is pinned below 2 because mcp 2.x renamed `FastMCP`.
