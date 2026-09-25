# Little Life

A single-file isometric life simulator. Two adults live in a small flat, meet their
own needs, form a relationship, and have friends over.

There is no player control beyond speed — it's something you watch, not something
you play.

**[Watch it in your browser →](https://rstibal.github.io/little-life/)**

![One Sim asleep, the other playing guitar, in the pixel-art flat on an evening with the lamps on](screenshot.png)

## Running it

Play it at [rstibal.github.io/little-life](https://rstibal.github.io/little-life/),
which GitHub Pages republishes from `master` on every push.

Or open [`index.html`](index.html) in a browser. That's it — no build step, no
dependencies, no server. Everything (markup, styles, simulation, and an entirely
procedural canvas renderer) lives in that one file.

## How it works

Each Sim scores every possible action every tick, weighing how urgently a need
(hunger, energy, hygiene, fun, social, bladder) needs attention against the distance
to go do something about it. Mood, personality traits, and a novelty penalty (so
nobody showers four times in a row) all feed into that score. A conversation that
goes well raises a couple's bond; a bond high enough, sealed with a good
conversation, makes them a couple. In their free time they pick up hobbies — cards,
video games, the record player, the arcade, the fish tank — and join each other at
them. Friends and neighbours knock most days, come in through the front door, hang out
for a couple of hours and head home before bedtime.

Time keeps running while the tab is closed: reopening the page replays the elapsed
time at full simulation fidelity (just without the on-screen logging) rather than
faking a summary, so the household you come back to is one that actually happened.

Rendering is isometric, depth-sorted, and drawn as pixel art, one pixel at a time into a small buffer —
no image assets. See [`CLAUDE.md`](CLAUDE.md) for the internals (the brain, the
render pipeline, the layout invariants) if you're digging into the code.

## Verifying changes

```bash
node verify.js
```

Runs layout-integrity checks (every tile reachable, every piece of furniture
approachable, no overlapping footprints) plus a 22-day headless simulation, and
reports whether a household formed normally with nobody getting stuck.

## Status

A personal project, under active tinkering. Known gaps are tracked in
[`CLAUDE.md`](CLAUDE.md).
