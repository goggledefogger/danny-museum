# incoming/

Drop things Danny built (or just remembered building) here, then run `uv run tools/ingest.py`.

Fast path: `uv run tools/new.py "Name of thing"` writes a stub here. Fill it in, delete lines you do not know.

Two accepted formats (see EXAMPLE.md and EXAMPLE.json):

- **Markdown** with YAML frontmatter (`name`, `wing`, `years`, `role`, `stack`, `status`, `link`, `scale`, optional `sources`) and body sections `## Summary`, `## Facts` (bullets), `## Surprise`.
- **JSON**: one entry or an array, same shape as `projects` in `data/SCHEMA.md`. `id` is optional (derived from the name).

Rules: required are name, wing (work, side, personal, brain, home, music), years with a 4-digit start year, and summary. Summary max 2 sentences, surprise max 110 characters, facts max 4.

If the name (or id) matches something already in the museum, ingest merges instead of duplicating: empty fields are filled, facts are unioned up to 4, sources are added, and `rediscovered` is set. Existing text is never overwritten.

Files starting with EXAMPLE or README are ignored. Processed files move to `done/` with a date prefix. One invalid file stops the run and writes nothing. Try `--dry-run` first.
