# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Little Life

A single-file isometric life simulator. Two adults live in a small flat, meet their
own needs, form a relationship, and have friends over. **There is no player
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
person is generated pixel art (see Rendering, below), so the file can be moved or
opened from disk with nothing alongside it and nothing to regenerate. The only external
request is the Pixelify Sans web font, which falls back to monospace offline.

## Conventions

- **Bump the version on every round of changes.** Rob keeps versions as separate
  files (`little-life-v1.html` … `little-life-v10.html`). `index.html` here is v12
  as of the visitors / new-layout pass.
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

- mood adds or subtracts (tired boosts sleep, annoyed suppresses socialising) — but the
  pull toward chatting only counts while social has room, or an affectionate couple
  chats all day
- traits reweight needs and add a `+15` affinity to matching activities
- a **novelty penalty** (−26 for 260 in-world minutes) stops repetition — never applied
  to the activity they're in the middle of
- a need that's full returns `-Infinity`, not 0: at 0 the nearest full need could win
  when nothing else was needed (someone sat on the toilet at 100% for an hour)
- **hobbies** (`session` in `ACTS`) run for a session rather than until fun is full, and
  score at least `LEISURE` — they're what free time is for. `group` hobbies (TV, video
  games, cards, dancing) score +16 when someone's already at it, top up social while
  shared, and grow the residents' bond slowly
- **sleep at night lasts till morning**, rested or not; daytime naps need real tiredness

`think` only switches action if the new score beats the current one by a margin — 26
normally, 62 while asleep. Without that margin they dither and never finish anything.

**Moods** sit between needs and actions. Five derive from needs; `annoyed` and
`affectionate` are transient states left by an interaction. They feed back: a bad
conversation leaves both annoyed, which makes the next one more likely to go badly.
That spiral is intentional.

**Couple.** Bond ≥ 84 plus a conversation ending well makes them a couple. Bond grows
mostly by talking, a little by doing group hobbies together. There are no children
(v11 had babies; v12 removed them — saves with children load with just the two adults).

**Visitors.** Four friends (`friends`) are made once per household and saved. Between
10am and 8pm, at most once every `VISIT_GAP` minutes, one or two knock — about one visit a
day, more if someone's messaging friends at the desk or is lonely. Guests run the same
brain with only the `guest:true` activities; energy, bladder and hygiene are frozen for
them. They leave after 100–210 minutes or by 10:30pm, walking back to the door tile.
They're not saved. Conversations are a list (`convs`) now, since two can run at once;
only a conversation between the two residents moves the bond.

**Rendering.** Isometric 2:1, depth-sorted by `gx + gy`, drawn back to front — see
the next section.

## Rendering — pixel art (v11)

The room is drawn **one pixel at a time** into a buffer (`buf`, packed `Uint32Array`),
then `putImageData` onto a canvas scaled up with `image-rendering: pixelated`. There
are no canvas paths anywhere, so nothing is anti-aliased. Tiles are 32×16 px; `WALL`
is 40 px; the room itself is `ROOM_W` (336) × `PH` (220).

**Scaling is always a whole number of device pixels per art pixel** — Rob prefers
even pixels over edge-to-edge. `layout()` picks the biggest whole scale `k` at which
the room fits the stage, then widens the buffer (`PW`, with `OX` recentred) so it
fills the stage at that same `k`; the extra width is just more backdrop. On desktop
and tablet (viewport ≥ 700×500) `k` is also capped so the header, room and stats fit
on one screen — Rob wants everything visible without scrolling there — but never
below 2×; phones scroll and are sized by width alone. `layout()` re-runs whenever
the cards are rebuilt, since a new person changes the stats' height, and desktop
keeps every card in one row (`--people` columns) for the same reason. Every
full-frame buffer is reallocated when `PW` changes. Don't go back to stretching to an
exact width: fractional scales make some pixel rows fatter than others and walking
people shimmer.

- **One rasteriser.** `scan()` is an even-odd scanline fill sampling pixel centres;
  `fillPoly` takes either a colour or a painter `fn(x, y, existing)`, which is how
  wallpaper, windows, the bookshelf's books, the easel painting and screens are
  textured — the painter maps the pixel back onto its plane with `onS`/`onE`.
- **`prism()`** extrudes any convex footprint. `box`, `cyl` (octagon) and `soft`
  (chamfered) are wrappers. Visible sides are shaded by facing, the top gets a lit
  front rim, and the **outline is found, not stroked**: the silhouette is stamped into
  a scratch buffer and its border pixels coloured, so outlines are always exactly one
  pixel whatever rounding did to the vertices.
- **People** are built from parts by `buildPerson` into an 18×30 grid (head, hair,
  torso, arms, legs, face), auto-outlined, and cached by colours+pose+frame+facing+face.
  Two facings are drawn and two mirrored. Poses: stand, walk (4 frames), use, talk,
  sit, sitback, stretch, guitar, head (sleepers, the baby, card portraits). Faces
  follow mood and blink.
- **`placeSim`** decides where and how each person is drawn *and* their depth — the
  one place invariants 5 and 6 below live now. Seated poses put people on the actual
  seat (sofa cushion, table chair, desk chair, toilet).
- **`FRONT`** holds parts of an object that belong *in front of* its user (table
  chairs, desk chair, shower glass). They're separate draw items at object depth
  +0.7, where the user sits at +0.55.
- **Floor** is per-pixel (`floorPx`) and baked once per wall mode. Its `X/Y` are tile
  coords ×32, which is what makes tile grout and plank seams exact 2:1 stairs.
- **Walls** have thickness: papered face (per-room `WALLPAPER`), cap, and end faces
  where a run stops. `DECOR` paints windows (live sky, clouds, skyline, stars),
  the clock (real time), mirror, pictures and so on straight onto the wall plane.
- **Light** is a multiply pass after everything's drawn: an ambient tint keyed to the
  hour (`AMB`) plus point lights (lamps after dark, TV/fridge/stove/monitor/arcade
  while in use) that fall off in dithered quarter steps. Pixels drawn with `EMIT`
  set (lamp shades, screens, window glass) skip it and stay lit.
- Bubbles and particles (Zs, hearts, notes, steam, shower drops) go on after the
  light pass.

**`shade()` accepts its own output.** DETAIL code sometimes hands it an
already-shaded `rgb()` string rather than a hex, so it parses both — if it only
handled hex, a pre-shaded colour would parse as NaN and silently render black (this
shipped once in v10). It also hue-shifts: shadows toward violet, highlights warm.

**Layout (v12).** Bedroom top-left with a computer desk in the corner, bathroom top-right
with a tub, kitchen down the west wall, a 2×3 dining table whose footprint includes its
four chairs (the far pair drawn by `BACK`, the near pair by `FRONT`), the entry and front
door bottom-left, and the living room's seats all facing south toward a TV at (6,9) — far
enough forward that it doesn't hide the people on the sofa. The front door is painted on
the west wall (`doorPx`); the street isn't on the map, so visitors appear on the doormat.

Objects can list `use` tiles — where someone must stand to use it. Without it any
neighbouring tile counts, which is how people played the arcade from the side.
**Remember the projection when placing things:** the tile up-left of an object
(x−1, y−1) is directly *behind* it on screen, so a dance floor or a viewing spot there is
hidden. Put anything people stand at on the +x/+y side, toward the camera.

Walls sort at `x + y + 0.45` (the segment's middle). At −0.12 anything just behind an
interior wall — the desk, the wardrobe — was drawn over it.

## Invariants that fail silently

Every real bug in this project so far was a layout error that threw no exception.
`verify.js` checks all of these; run it after touching `OBJECTS` or `walls`.

1. **Every walkable tile must be reachable.** Furniture can seal off a corner. A
   child once spawned into a pocket enclosed by a bed, the crib and a wall.
2. **Every activity object needs a reachable approach tile.** `approachTiles` must
   respect walls — without the `canCross` check a Sim will stand in the bedroom and
   use the fridge through the divider.
3. **Doorway tiles must stay clear**: `DOORWAYS` in index.html (the front door's tile too).
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

verify.js checks the layout through the page's own `OBJECTS`/`walls`/`approachTiles`,
not a copy. The simulation run should report a couple forming, regular visits that end
before 3am, some shared activity, no need bottoming out, and an idle streak of only a
tick or two. It also prints hours per activity for residents and visitors — check it
after touching urgency numbers; small changes swing the balance a lot.

## Known gaps

- Visitors aren't saved; reloading mid-visit sends them home.
- Chatting is fairly rare now that hobbies fill free time, so arguments are rarer too.
