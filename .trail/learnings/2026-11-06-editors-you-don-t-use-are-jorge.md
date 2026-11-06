---
title: "Editors you don't use are switched off with an opt-out list, and matrix dots show what the hub syncs, not what each editor already has"
author: Jorge
date: 2026-11-06
branch: main
cost: { minutes: 1, tokens: 0 }
id: l-a7985800
scope: repo
status: active
src: agent
touches:
  - src/targets/registry.ts
  - src/config/store.ts
  - web/src/styles.css
---

## Decided
- Switching editors off is an opt-out list. Existing configs keep working and every editor starts on. The downside: a newly added editor also starts on. An opt-in list was rejected because it would have changed behaviour for current users.
- A switched-off editor is never written, not even by an explicit single-editor sync. A dry run still previews it.
- A filled dot in the Servers matrix means the editor is in the server's targets (what the hub will write). A dashed ring means the editor's file has the server but the hub doesn't sync it there. The two used to be indistinguishable: the dashboard showed intent only, which hid servers Claude Code really had.
- Root cause of the missing Claude Code dots: import skipped a server already in the hub without adding the new editor to its targets. Import now adds it.

## Watch out
- The editors API now reads the hub config, so a broken mcp-hub.json makes it error. Don't use it as a liveness probe in tests.
- The dashboard already had a `.switch` class for the On toggles. Reuse it instead of defining a new one; a second definition stretched those toggles.

In the code: settings.disabledTargets in mcp-hub.json; isTargetEnabled / getEnabledTargetNames in src/targets/registry.ts; setTargetEnabled in src/config/store.ts; PUT /api/targets/:name; `mcp-hub targets enable|disable`; GET /api/targets returns `present` (hub ids found in each editor, names only); dot styles .jack.on / .jack.stray in web/src/styles.css; README "Reading the Servers matrix".
