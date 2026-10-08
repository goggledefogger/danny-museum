# projects.json shape

{
  "wings": [
    { "id": "work", "name": "The Day Jobs Wing", "tagline": "...", "color": "#hex" }
  ],
  "projects": [
    {
      "id": "kebab-id",
      "name": "Project name",
      "wing": "work | side | personal | home | music | brain",
      "years": "2014-2016",
      "role": "what Danny did on it",
      "summary": "1-2 sentences, plain words, what it is and why it mattered",
      "stack": ["Python", "Three.js"],
      "facts": ["up to 4 short fun or surprising facts"],
      "surprise": "one line (max 110 chars) a funhouse machine could spit out about it",
      "link": "optional URL or local path",
      "scale": 1,
      "status": "active | shipped | quiet | retired",
      "added": "2026-10-07",
      "rediscovered": "2026-11-02",
      "sources": ["portfolio doc", "resume", "personal notes"]
    }
  ]
}

scale: 1 small, 2 medium, 3 big/years-long.

## Dates and provenance

- `added` (required, ISO YYYY-MM-DD): the day the entry entered the museum. The museum opened 2026-10-07, so every original entry has that date. Drives NEW ribbons and the New Acquisitions case.
- `rediscovered` (optional, ISO): the day it was found again and refreshed. Set by `tools/ingest.py` on a merge. Also drives NEW ribbons.
- `sources` (optional, list of short strings): where the facts came from.

## Rules (enforced by tools/validate.py and tools/ingest.py)

- Required: name, wing, years (must contain a 4-digit start year; a leading "~" is fine), summary, and a unique id.
- Wing is exactly one of work, side, personal, brain, home, music.
- Summary at most 2 sentences; surprise at most 110 characters; facts at most 4.
- Names are unique after lowercasing and stripping punctuation.
- Order: by start year, then name (ingest re-sorts).

`founding` (bool, optional): part of the opening-day collection (2026-10-07). Never counts as fresh by its `added` date; only a later `rediscovered` makes it fresh.
