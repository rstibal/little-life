# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Little Life

A single-file isometric life simulator. Two adults live in a small flat, meet their
own needs, form a relationship, and may end up with children. **There is no player
control beyond speed** — it is something you watch, not something you play. Keep it
that way unless Rob says otherwise; requests for "features" should be read as
"more interesting autonomous behaviour", not "more buttons".

## Layout

```
index.html        the entire app — markup, CSS, simulation, renderer
verify.js         headless checks — run after ANY change to layout or the brain
embed.py          orphaned — no art/ pack left to embed; kept in case that changes
```

`index.html` is fully self-contained and has no build step: every object and every
person is plain canvas geometry (`drawBox` / `drawSoftBox`), so the file can be moved
or opened from disk with nothing alongside it and nothing to regenerate. There used to
be a `tools/` folder holding a PNG sprite pack and an embed script; both are gone as
of the pastel-toy pass (see Sprites, below) and `index.html`/`verify.js` now live at
the project root instead of one level down.

## Conventions

- **Bump the version on every round of changes.** Rob keeps versions as separate
  files (`little-life-v1.html` … `little-life-v9.html`). `index.html` here is v10
  as of the sprite-removal / pastel-toy pass.
- Plain patch increments. No `dev.`/`beta` tags.
- No build step, no dependencies, no framework. Vanilla JS and a 2D canvas.
- Comments explain *why* a constant has its value, not what the line does.

## How it works

**Time.** `minutes` is the in-world clock; `MIN_PER_SEC` (4) means one in-world hour
per 15 real seconds at 1×. Away time runs far slower — `AWAY_MIN_PER_SEC` (0.4),
about one in-world day per real hour, capped at a week. On load, elapsed real time is
replayed at full fidelity with logging suppressed (`quiet`), so you get the state
they'd actually have reached rather than a fabricated summary.

**The brain** (`urgency` → `bestAction` → `think` → `startAct`). Every tick each
person scores every possible action. Urgency is **quadratic** in how depleted a need
is, which is what makes them ignore a slightly grubby shirt and then drop everything
for the bathroom. Distance is subtracted. Then:

- mood adds or subtracts (tired boosts sleep, annoyed suppresses socialising)
- traits reweight needs and add a `+15` affinity to matching activities
- a **novelty penalty** (−26 for 260 in-world minutes) stops repetition

`think` only switches action if the new score beats the current one by a margin — 26
normally, 62 while asleep. Without that margin they dither and never finish anything.

**Moods** sit between needs and actions. Five derive from needs; `annoyed` and
`affectionate` are transient states left by an interaction. They feed back: a bad
conversation leaves both annoyed, which makes the next one more likely to go badly.
That spiral is intentional.

**Family.** Bond ≥ 84 plus a conversation ending well makes them a couple. A settled
couple may have a baby each day. Babies can't act — only a parent tending the crib
meets their needs. After 3 days a baby becomes a mobile child at 0.74 scale with its
own bed, running the same brain minus the adult-only actions.

**Rendering.** Isometric, depth-sorted by `gx + gy`, drawn back to front.
`ISO_RATIO = 0.5` (classic 2:1 dimetric). This used to be `1/√2` to match a PNG
sprite pack's drawn angle; now that everything is geometry, it's a free choice —
0.5 reads flatter and less looming than the old ratio. If it ever changes again,
nothing desynchronises since there's no artwork to match, just re-eyeball the room.

## Sprites — retired

v10 replaced the last PNG sprites (bed, shower, sink, toilet, sofa, tv — the pieces
that used to come from a 116px CC0 pack) with plain canvas geometry, matching
everything else in the room. Motivation: the pack was hand-picked and Rob couldn't
find more pieces that matched it, so continuing to depend on external art was a dead
end. `art/`, `tools/embed.py`'s job, and the base64 blob are all gone.

**"Pastel toy" style.** Both the six ex-sprited objects and the two Sims use
`drawSoftBox()` / `drawToyHead()` (in `index.html`, next to `drawBox`) instead of the
plain flat-shaded boxes everything else still uses: rounded top corners, a gradient
top face instead of a flat tone, a pale seam standing in for a moulded-plastic
highlight, and — for heads — a bigger radius with a radial-gradient fill and a
specular dot. The rest of the furniture (fridge, table, shelf, etc.) intentionally
keeps the older flat `drawBox` look; only the pieces that used to be sprited and the
people were in scope for this pass.

**`shade()` accepts its own output.** `drawSoftBox` re-shades whatever color it's
given, and DETAIL functions sometimes hand it an already-shaded `shade(o.color, x)`
string rather than the raw hex. `shade()` therefore parses both `#rrggbb` and
`rgb(r,g,b)` input — if it only handled hex, a pre-shaded color would parse as NaN
and silently render solid black. (This exact bug shipped once, on the sofa and
shower, before `shade()` was made to handle both formats — if a piece ever renders
black again, this is the first thing to check.)

## Invariants that fail silently

Every real bug in this project so far was a layout error that threw no exception.
`verify.js` checks all of these; run it after touching `OBJECTS` or `walls`.

1. **Every walkable tile must be reachable.** Furniture can seal off a corner. A
   child once spawned into a pocket enclosed by a bed, the crib and a wall.
2. **Every activity object needs a reachable approach tile.** `approachTiles` must
   respect walls — without the `canCross` check a Sim will stand in the bedroom and
   use the fridge through the divider.
3. **Doorway tiles must stay clear**: `2,3 2,4 7,3 7,4 4,2 5,2`.
4. **Footprints must not overlap.**
5. **Depth must follow where a person is drawn, not where they stand.** Someone using
   furniture is drawn at the furniture's position; sorting by their tile makes
   sleepers vanish behind the bed.
6. **Poses key off arrival, not intent.** `lying` must check the path is empty, or
   they lie down the moment they decide to sleep and slide across the floor.

## Verifying

```bash
node verify.js                # layout integrity + a 22-day headless simulation
```

The simulation run should report a family forming, nobody with a permanently empty
action, no need bottoming out, and an idle streak of only a tick or two. A long idle
streak means someone is stuck.

## Known gaps

- `kidbed1` is a 1×1 slot and still uses the plain `DETAIL.bed` geometry at a smaller
  footprint than the adult beds — cosmetic only now that nothing is sprite-sized.
- Only bed/shower/sink/toilet/sofa/tv and the two Sims got the pastel-toy treatment;
  the rest of the furniture is still the older flat `drawBox` look. Extending the
  pastel style to everything else is a reasonable follow-up if the mixed look bothers
  Rob, but wasn't asked for.
- Children never become adults; the household caps at two children.
