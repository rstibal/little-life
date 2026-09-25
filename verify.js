#!/usr/bin/env node
/*
 * Headless checks for index.html. Run after any change to OBJECTS, walls, or the brain:
 *
 *     node verify.js
 *
 * Every real bug in this project has been a layout error that threw no exception —
 * a sealed-off corner, an object approachable only through a wall, a pose keyed off
 * intent instead of arrival. None of those surface in a browser as an error; they
 * just look subtly wrong. So these run the actual simulation rather than linting it,
 * and check the layout through the page's own OBJECTS, walls and pathing code rather
 * than a copy of them that could drift.
 */

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = html.slice(
  html.indexOf('<script>') + '<script>'.length,
  html.lastIndexOf('</script>')
);

let failures = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${label}${detail ? '  — ' + detail : ''}`);
  if (!pass) failures++;
};

/* ---------- a stubbed DOM, enough for the page to boot ---------- */

const noop = () => {};
const gradient = { addColorStop: noop };
const ctx = new Proxy({}, { get: (_, k) =>
  (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => gradient : noop });

const element = () => {
  const e = { style: {}, textContent: '', value: '', innerHTML: '', dataset: {},
    clientWidth: 900, getContext: () => ctx, addEventListener: noop,
    setAttribute: noop, querySelectorAll: () => [], appendChild: noop };
  e.parentElement = e;
  return e;
};

const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = v; },
  removeItem: k => { delete store[k]; },
};
global.document = { getElementById: element, querySelectorAll: () => [],
  addEventListener: noop, documentElement: {}, createElement: element };
global.getComputedStyle = () => ({ getPropertyValue: () => '#fff' });
global.window = { addEventListener: noop, devicePixelRatio: 1 };
global.performance = { now: () => 0 };
global.requestAnimationFrame = noop;      // never start the render loop
global.setInterval = noop;                // never start the autosave timer
global.location = { reload: noop };

const DAYS = 22;
const harness = script.replace(/requestAnimationFrame\(frame\);\s*$/, '') + `
;({
  layout() {
    const key = (x, y) => x + ',' + y, overlaps = [], owner = {};
    for (const o of OBJECTS)
      for (let i = 0; i < o.w; i++) for (let j = 0; j < o.h; j++) {
        const k = key(o.x + i, o.y + j);
        if (owner[k]) overlaps.push(k + ' (' + owner[k] + ' / ' + o.id + ')');
        owner[k] = o.id;
      }
    const seen = new Set([key(...DOOR)]), q = [DOOR.slice()];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (free(nx, ny) && !seen.has(key(nx, ny)) && canCross(x, y, nx, ny)) { seen.add(key(nx, ny)); q.push([nx, ny]); }
      }
    }
    const stranded = [];
    for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++)
      if (free(x, y) && !seen.has(key(x, y))) stranded.push(key(x, y));
    const used = new Set(SEATS.concat(people.map(p => p.bedId)));
    for (const k in ACTS) if (ACTS[k].obj && k !== 'relax' && k !== 'sleep') used.add(ACTS[k].obj(people[0]));
    const unreachable = [...used].filter(id => !approachTiles(byId(id)).some(t => seen.has(key(...t))));
    const badUse = OBJECTS.filter(o => o.use && approachTiles(o).length < o.use.length).map(o => o.id);
    return { overlaps, stranded, walkable: seen.size, unreachable, badUse,
             doorsClear: DOORWAYS.every(d => free(...d.split(',').map(Number))) };
  },

  simulate(days) {
    let peakBond = 0, coupleDay = 0, visits = 0, overnight = 0, maxGuests = 0, together = 0, hadGuests = false;
    const acts = { adult: {}, guest: {} }, streak = new Map(), longest = new Map();
    const steps = days * 1440 * 2;                  // half an in-world minute per step
    for (let n = 0; n < steps; n++) {
      tick(0.5);
      peakBond = Math.max(peakBond, rel);
      if (family.partners && !coupleDay) coupleDay = day;
      if (guests.length && !hadGuests) visits++;
      hadGuests = guests.length > 0;
      maxGuests = Math.max(maxGuests, guests.length);
      if (guests.length && hour() > 3 && hour() < 3.01) overnight++;
      for (const p of everyone()) {
        if (p.leaving) continue;
        if (p.actKey && !p.path.length) acts[p.stage][p.actKey] = (acts[p.stage][p.actKey] || 0) + 1;
        if (p.act && p.act.group && !p.path.length && doingWith(p.actKey, p).length) together++;
        const s = p.actKey ? 0 : (streak.get(p) || 0) + 1;
        streak.set(p, s);
        longest.set(p.name, Math.max(longest.get(p.name) || 0, s));
      }
      paintUI();
    }
    return {
      household: people.map(p => p.name + ' (' + p.gender + ')'),
      friends: friends.map(f => f.name + ' ' + f.from),
      partners: family.partners, coupleDay, peakBond, visits, overnight, maxGuests, together, acts,
      longestIdleStreak: Math.max(0, ...longest.values()),
      starving: people.filter(p => Object.values(p.needs).some(v => v < 3)).length,
    };
  },
})`;

let api;
try {
  api = eval(harness);
} catch (err) {
  console.log(' FAIL  page boots headlessly  — ' + err.message);
  process.exit(1);
}

console.log('\nLayout');
const L = api.layout();
ok('no overlapping footprints', L.overlaps.length === 0, L.overlaps.join(', '));
ok('doorway tiles clear', L.doorsClear);
ok('every walkable tile reachable from the front door', L.stranded.length === 0,
   L.stranded.length ? 'stranded: ' + L.stranded.join(' ') : L.walkable + ' tiles');
ok('every activity object approachable', L.unreachable.length === 0, L.unreachable.join(', '));
ok('every "use" tile is walkable', L.badUse.length === 0, L.badUse.join(', '));

console.log(`\nSimulation (${DAYS} in-world days)`);
let r;
try {
  r = api.simulate(DAYS);
} catch (err) {
  ok('runs without throwing', false, err.stack);
  process.exit(1);
}
ok('runs without throwing', true);
console.log(`        household: ${r.household.join(', ')}`);
console.log(`        friends: ${r.friends.join(', ')}`);
console.log(`        partners: ${r.partners ? 'from day ' + r.coupleDay : 'no'} | peak bond: ${r.peakBond.toFixed(1)} | visits: ${r.visits} (up to ${r.maxGuests} at once)`);
const hours = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / 120).toFixed(0)}h`).join(', ');
console.log('        residents: ' + hours(r.acts.adult));
console.log('        visitors:  ' + hours(r.acts.guest));
ok('relationship can progress', r.peakBond > 84);
ok('friends come to visit', r.visits >= DAYS / 3, `${r.visits} visits`);
ok('visitors go home at night', r.overnight === 0, `${r.overnight} nights with someone still here at 3am`);
ok('people do things together', r.together > 0, `${(r.together / 120).toFixed(0)} person-hours of group activities`);
ok('nobody gets stuck without an action', r.longestIdleStreak <= 4, `longest streak ${r.longestIdleStreak} ticks`);
ok('no need bottoms out', r.starving === 0);

console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
