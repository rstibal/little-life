#!/usr/bin/env node
/*
 * Headless checks for index.html. Run after any change to OBJECTS, walls, or the brain:
 *
 *     node verify.js
 *
 * Every real bug in this project has been a layout error that threw no exception —
 * a sealed-off corner, an object approachable only through a wall, a pose keyed off
 * intent instead of arrival. None of those surface in a browser as an error; they
 * just look subtly wrong. So these run the actual simulation rather than linting it.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const script = html.slice(
  html.indexOf('<script>') + '<script>'.length,
  html.lastIndexOf('</script>')
);

let failures = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${label}${detail ? '  — ' + detail : ''}`);
  if (!pass) failures++;
};

/* ---------- 1. layout, read straight out of the source ---------- */

const COLS = 10, ROWS = 10;
const objs = [...script
  .match(/const OBJECTS = \[([\s\S]*?)\n\];/)[1]
  .matchAll(/id:'(\w+)',\s*x:(\d+), y:(\d+), w:(\d+), h:(\d+)/g)]
  .map(m => ({ id: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] }));

const blocked = {}, overlaps = [];
for (const o of objs)
  for (let i = 0; i < o.w; i++)
    for (let j = 0; j < o.h; j++) {
      const k = `${o.x + i},${o.y + j}`;
      if (blocked[k]) overlaps.push(`${k} (${blocked[k]} / ${o.id})`);
      blocked[k] = o.id;
    }

const walls = new Set();
for (let x = 0; x < COLS; x++) walls.add(`N:${x}:0`);
for (let y = 0; y < ROWS; y++) walls.add(`W:0:${y}`);
for (let x = 0; x < COLS; x++) if (x !== 2 && x !== 7) walls.add(`N:${x}:4`);
for (let y = 0; y < 4; y++) if (y !== 2) walls.add(`W:5:${y}`);

const free = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !blocked[`${x},${y}`];
const cross = (fx, fy, tx, ty) => {
  if (ty === fy + 1) return !walls.has(`N:${tx}:${ty}`);
  if (ty === fy - 1) return !walls.has(`N:${fx}:${fy}`);
  if (tx === fx + 1) return !walls.has(`W:${tx}:${ty}`);
  if (tx === fx - 1) return !walls.has(`W:${fx}:${fy}`);
  return true;
};

const seen = new Set(['5,7']);
const queue = [[5, 7]];
while (queue.length) {
  const [x, y] = queue.shift();
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
    if (free(nx, ny) && !seen.has(k) && cross(x, y, nx, ny)) { seen.add(k); queue.push([nx, ny]); }
  }
}

const walkable = COLS * ROWS - Object.keys(blocked).length;
const stranded = [];
for (let x = 0; x < COLS; x++)
  for (let y = 0; y < ROWS; y++)
    if (free(x, y) && !seen.has(`${x},${y}`)) stranded.push(`${x},${y}`);

const DOORS = ['2,3', '2,4', '7,3', '7,4', '4,2', '5,2'];
const ACTIVITY_OBJECTS = ['bed0','bed1','kidbed0','kidbed1','crib','desk','shower','sink',
  'toilet','fridge','stove','table','guitar','easel','shelf','arcade','mat','sofa'];

const unreachable = ACTIVITY_OBJECTS.filter(id => {
  const o = objs.find(v => v.id === id);
  if (!o) return true;
  for (let i = 0; i < o.w; i++)
    for (let j = 0; j < o.h; j++) {
      const ox = o.x + i, oy = o.y + j;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const x = ox + dx, y = oy + dy;
        if (free(x, y) && cross(x, y, ox, oy) && seen.has(`${x},${y}`)) return false;
      }
    }
  return true;
});

console.log('\nLayout');
ok('no overlapping footprints', overlaps.length === 0, overlaps.join(', '));
ok('doorway tiles clear', DOORS.every(d => free(...d.split(',').map(Number))));
ok('every walkable tile reachable', stranded.length === 0,
   stranded.length ? `stranded: ${stranded.join(' ')}` : `${seen.size}/${walkable}`);
ok('every activity object approachable', unreachable.length === 0, unreachable.join(', '));

/* ---------- 2. run the real simulation against a stubbed DOM ---------- */

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
global.Image = class { constructor() { this.complete = false; this.naturalWidth = 0; } set src(_) {} };

const DAYS = 22;
const harness = script.replace(/requestAnimationFrame\(frame\);\s*$/, '') + `
;(function () {
  let idleTicks = 0, personTicks = 0, tendTicks = 0, peakBond = 0;
  const steps = ${DAYS} * 1440 * 2;                 // half an in-world minute per step
  for (let n = 0; n < steps; n++) {
    const dt = 0.5, before = minutes;
    minutes += dt;
    if (Math.floor(minutes / 1440) > Math.floor(before / 1440)) { day++; familyTick(); }
    for (const p of people) (p.mobile ? stepSim : stepBaby)(p, dt);
    stepChat(dt);
    rel = Math.max(0, rel - 0.0016 * dt);
    peakBond = Math.max(peakBond, rel);
    for (const p of people) {
      if (p.actKey === 'tend') tendTicks++;
      if (!p.mobile) continue;
      personTicks++;
      if (!p.actKey) { p._streak = (p._streak || 0) + 1; p._max = Math.max(p._max || 0, p._streak); idleTicks++; }
      else p._streak = 0;
    }
    paintUI();
  }
  return {
    days: day,
    household: people.map(p => \`\${p.name} (\${p.gender}, \${p.stage})\`),
    partners: family.partners,
    peakBond,
    born: family.born,
    tendTicks,
    longestIdleStreak: Math.max(0, ...people.map(p => p._max || 0)),
    starving: people.filter(p => Object.values(p.needs).some(v => v < 3)).length,
  };
})();
`;

console.log(`\nSimulation (${DAYS} in-world days)`);
let r;
try {
  r = eval(harness);
} catch (err) {
  ok('runs without throwing', false, err.message);
  process.exit(1);
}
ok('runs without throwing', true);
console.log(`        household: ${r.household.join(', ')}`);
console.log(`        partners: ${r.partners} | peak bond: ${r.peakBond.toFixed(1)} | children born: ${r.born}`);
ok('relationship can progress', r.peakBond > 84);
ok('baby care happens when there are babies', r.born === 0 || r.tendTicks > 0, `${r.tendTicks} ticks`);
ok('nobody gets stuck without an action', r.longestIdleStreak <= 4, `longest streak ${r.longestIdleStreak} ticks`);
ok('no need bottoms out', r.starving === 0);

console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
