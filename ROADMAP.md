# Roadmap

## Beyond code: more kinds of exhibits (Danny, 2026-10-07)

The museum could hold more than software: bands, music and recordings, podcasts, videos (the Tech Town YouTube channel), travels, photos.

What that needs, in order:

1. A `media` field on an exhibit: `{type: youtube | audio | photo | gallery, src, caption}`. Signs already render text; a media panel is one more prop type.
2. Wings stay data (they already are in `data/projects.json`), so Travels or Podcasts is a new row plus a per-wing theme override, not new code.
3. Two catalogue layers: the public `data/projects.json` and a local-only private file that merges in when served from this machine. Recordings of other people, travel and family photos live in the private layer unless Danny says otherwise.
4. Hosting: YouTube by id (nothing to host), audio and photos as links or small thumbnails; the repo stays light for Pages.
