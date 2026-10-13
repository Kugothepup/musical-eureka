// Tests for the dashboard's logic. Run with `node --test` (Node 18 or newer, no dependencies).
// index.html keeps its pure functions between //<pure> markers, so they can be loaded here without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const block = html.match(/\/\/<pure>([\s\S]*?)\/\/<\/pure>/)[1];
const names = [...block.matchAll(/^(?:function|const)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
const A = new Function(block + '\nreturn {' + names.join(',') + '};')();

const H = 3600e3, at = s => new Date(s), ms = s => Date.parse(s);
const INVERNESS = [57.48, -4.22];
const fmt = d => d.toISOString().slice(11, 16);

// Open-Meteo style hourly weather for 24 hours from the local hour, as the page requests it (timeformat=unixtime)
function weatherJSON(nowMs, offsetSec, cloud) {
  const start = Math.floor((nowMs + offsetSec * 1000) / H) * H - offsetSec * 1000;
  const time = [], cc = [];
  for (let i = 0; i < 24; i++) { time.push((start + i * H) / 1000); cc.push(cloud(start + i * H)); }
  return { utc_offset_seconds: offsetSec, timezone: 'X', current: { time: nowMs / 1000, cloud_cover: cloud(nowMs) },
    hourly: { time, cloud_cover: cc, precipitation_probability: cc.map(() => 0) } };
}
function kpSeries(kpAt, from, to) {
  const out = [];
  for (let t = from; t < to; t += 3 * H) out.push({ t: new Date(t), kp: kpAt(t), kind: 'predicted' });
  return out;
}
function plan(nowMs, lat, lon, o) {
  return A.planTonight(Object.assign({ nowMs, n: 18, hours: [], need: A.kpNeeded(lat, lon),
    altAt: t => A.sunAltitude(new Date(t), lat, lon) }, o));
}

test('the page script and service worker compile', () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script));
  assert.doesNotThrow(() => new Function(readFileSync(new URL('sw.js', root), 'utf8')));
});

test('every file the service worker caches exists', () => {
  const sw = readFileSync(new URL('sw.js', root), 'utf8');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of shell) if (f !== './') assert.ok(existsSync(new URL(f, root)), f + ' is missing');
  for (const m of html.matchAll(/url\((fonts\/[^)]+)\)/g)) assert.ok(shell.includes('./' + m[1]), m[1] + ' is not cached for offline use');
});

test('time parsing copes with each feed’s format', () => {
  assert.equal(A.utcDate('2026-10-10T15:00:00').toISOString(), '2026-10-10T15:00:00.000Z');
  assert.equal(A.isoDate('2026-10-12T17:00:00+0000').toISOString(), '2026-10-12T17:00:00.000Z');
  assert.equal(A.omDate('2026-10-12T20:00', -9000).toISOString(), '2026-10-12T22:30:00.000Z');
  assert.equal(A.omDate(1791835200, 3600).toISOString(), new Date(1791835200 * 1000).toISOString());
});

test('Kp reads both NOAA JSON layouts', () => {
  const objs = [{ time_tag: '2026-10-12T00:00:00', Kp: 2.33 }, { time_tag: '2026-10-12T03:00:00', Kp: 3 }];
  const rows = [['time_tag', 'Kp', 'a_running', 'station_count'], ['2026-10-12T00:00:00', '2.33', '9', '8'], ['2026-10-12T03:00:00', '3.00', '15', '8']];
  const fcObjs = [{ time_tag: '2026-10-12T06:00:00', kp: 4.67, observed: 'predicted' }];
  const fcRows = [['time_tag', 'kp', 'observed', 'noaa_scale'], ['2026-10-12T06:00:00', '4.67', 'predicted', null]];
  const a = A.buildKp(objs, fcObjs), b = A.buildKp(rows, fcRows);
  assert.deepEqual(b.map(r => [r.t.getTime(), r.kp, r.kind]), a.map(r => [r.t.getTime(), r.kp, r.kind]));
  assert.equal(a.length, 3);
  assert.equal(a[2].kind, 'predicted');
});

test('Kp to NOAA storm level', () => {
  assert.equal(A.kpToG(3), 0);
  assert.equal(A.kpToG(4.67), 1);
  assert.equal(A.kpToG(7), 3);
  assert.equal(A.kpToG(8.67), 4);
  assert.equal(A.kpToG(9), 5);
});

test('AuroraWatch UK only counts in the UK and Ireland, and follows its own wording', () => {
  for (const [la, lo] of [[51.5, -0.13], [57.48, -4.22], [53.35, -6.26], [60.15, -1.15], [50.07, -5.7]]) assert.ok(A.inAWRegion(la, lo), la + ',' + lo);
  for (const [la, lo] of [[48.86, 2.35], [52.37, 4.9], [41.9, 12.5], [40.42, -3.7], [64.15, -21.94]]) assert.ok(!A.inAWRegion(la, lo), la + ',' + lo);
  assert.equal(A.tierFromAW('amber', 57.5), 3);                   // "likely visible by eye from Scotland"
  assert.equal(A.tierFromAW('amber', 51.5), 2);                   // "possibly visible from elsewhere in the UK"
  assert.equal(A.tierFromAW('red', 51.5), 3);
  assert.equal(A.tierFromAW('red', 57.5), 4);
  assert.equal(A.tierFromAW('yellow', 51.5), 0);
  assert.equal(A.tierFromAW('green', 57.5), 0);
});

test('darkness: a normal night, midnight sun and polar night', () => {
  const d = A.darkWindow(at('2026-10-12T21:30:00Z'), ...INVERNESS, -12);
  assert.ok(d.nowDark && !d.always && !d.never);
  assert.ok(Math.abs(d.end - ms('2026-10-13T05:24:00Z')) < 10 * 60e3, 'dark until about 05:24 UTC, got ' + d.end.toISOString());
  assert.ok(A.darkWindow(at('2026-06-21T12:00:00Z'), 69.65, 18.96, -12).never, 'no darkness in Tromsø in June');
  const polar = A.darkWindow(at('2026-12-21T12:00:00Z'), 78.92, 11.93, -12);    // Ny-Ålesund: the noon Sun stays below -12°
  assert.ok(polar.nowDark && polar.always, 'dark all day in Svalbard in December');
});

test('Moon position, phase, and rise and set', () => {
  const m = A.moonEcliptic(A.j2000(at('1992-04-12T00:00:00Z')));     // Meeus, Astronomical Algorithms, example 47.a
  assert.ok(Math.abs(m.lon - 133.163) < 0.3 && Math.abs(m.lat + 3.229) < 0.3);
  const nu = A.moonInfo(at('2026-10-10T15:50:00Z')), full = A.moonInfo(at('2026-10-26T04:12:00Z'));
  assert.equal(nu.name, 'New moon'); assert.ok(nu.illum < 0.01);
  assert.equal(full.name, 'Full moon'); assert.ok(full.illum > 0.99);
  assert.equal(A.moonInfo(at('2026-10-18T16:00:00Z')).name, 'First quarter');
  // around full moon it rises near sunset and sets near sunrise
  const ev = A.moonEvents(at('2026-10-25T12:00:00Z'), 51.5, -0.13);
  assert.ok(!ev.up && ev.rise > at('2026-10-25T15:00:00Z') && ev.rise < at('2026-10-25T17:30:00Z'));
  assert.ok(ev.set > at('2026-10-26T06:00:00Z') && ev.set < at('2026-10-26T08:30:00Z'));
});

test('Moon drawing: the lit side flips between hemispheres', () => {
  assert.match(A.moonPath(0.5, true, false), /^M12 2A10 10 0 0 1 12 22A0\.00 10/);   // first quarter, lit on the right
  assert.match(A.moonPath(0.5, true, true), /^M12 2A10 10 0 0 0 12 22/);             // seen from the south, lit on the left
  assert.match(A.moonPath(1, true, false), /A10\.00 10 0 0 1 12 2Z$/);               // full: the terminator bulges out
});

test('thin high cloud counts for less than low cloud', () => {
  assert.equal(A.effectiveCloud(88, 6, 10, 86), 52);
  assert.equal(A.effectiveCloud(95, 90, 40, 60), 95);
  assert.equal(A.effectiveCloud(50, null, null, null), 50);        // older saved data without layers
  assert.equal(A.effectiveCloud(null, 1, 2, 3), null);
  assert.ok(A.effectiveCloud(30, 30, 30, 30) <= 30, 'never more than the total');
  assert.ok(A.thinCloud(52, 88) && !A.thinCloud(80, 88));
});

test('the banner sky follows the weather', () => {
  const clear = A.skyScene({ sky: 'night', cloud: 5, cloudTotal: 5, code: 0, vis: 24000, moonUp: false, moonIllum: 0.9 });
  assert.deepEqual(clear, { cloud: 0.05, haze: 0, precip: '', precipLevel: 0, moon: 0 });
  assert.equal(A.skyScene({ sky: 'night', cloud: 100, code: 3 }).cloud, 1);
  const fog = A.skyScene({ sky: 'night', cloud: 100, code: 45, vis: 3000 });
  assert.ok(fog.haze >= 0.65, 'fog code gives at least a fairly thick haze');
  const mist = A.skyScene({ sky: 'day', cloud: 20, code: 2, vis: 1000 });
  assert.ok(mist.haze > 0.3 && mist.haze < 0.6, 'visibility of 1 km is hazy: ' + mist.haze);
  assert.equal(A.skyScene({ sky: 'day', cloud: 20, vis: 20000 }).haze, 0);
  assert.ok(A.skyScene({ sky: 'night', cloud: 52, cloudTotal: 88 }).haze > 0.1, 'thin high cloud adds a veil');
  assert.deepEqual([A.skyScene({ code: 61 }).precip, A.skyScene({ code: 61 }).precipLevel], ['rain', 1]);
  assert.deepEqual([A.skyScene({ code: 65 }).precip, A.skyScene({ code: 65 }).precipLevel], ['rain', 3]);
  assert.deepEqual([A.skyScene({ code: 75 }).precip, A.skyScene({ code: 75 }).precipLevel], ['snow', 3]);
  assert.equal(A.skyScene({ code: 95 }).precip, 'rain');
  assert.equal(A.skyScene({ code: 3 }).precip, '');
  // the Moon: shown when it's up and not in daylight, dimmed by cloud, hidden when barely lit
  assert.equal(A.skyScene({ sky: 'night', cloud: 0, moonUp: true, moonIllum: 0.8 }).moon, 1);
  assert.ok(A.skyScene({ sky: 'night', cloud: 100, moonUp: true, moonIllum: 0.8 }).moon < 0.2);
  assert.equal(A.skyScene({ sky: 'day', cloud: 0, moonUp: true, moonIllum: 0.8 }).moon, 0);
  assert.equal(A.skyScene({ sky: 'night', cloud: 0, moonUp: true, moonIllum: 0.02 }).moon, 0);
});

test('solar wind early warning', () => {
  const now = ms('2026-10-12T21:30:00Z');
  assert.ok(A.windWatch({ bz: -9, speed: 580, t: now - 5 * 60e3 }, now));
  assert.ok(!A.windWatch({ bz: -9, speed: 380, t: now }, now), 'slow wind');
  assert.ok(A.windWatch({ bz: -13, speed: null, t: null }, now), 'strongly south even without a speed');
  assert.ok(!A.windWatch({ bz: -9, speed: 580, t: now - 2 * H }, now), 'old reading');
  assert.ok(!A.windWatch({ bz: -3, speed: 700 }, now), 'Bz not south enough');
});

test('Tonight lines up with the hourly weather where clocks are 30 or 45 minutes off UTC', () => {
  for (const [name, lat, lon, off] of [['Inverness', ...INVERNESS, 3600], ['St John’s', 47.56, -52.71, -9000], ['Adelaide', -34.93, 138.6, 37800], ['Nepal', 28, 84, 20700]]) {
    const now = ms('2026-10-12T19:10:00Z');
    const wx = A.normaliseWeather(weatherJSON(now, off, () => 20));
    const p = plan(now, lat, lon, { n: 12, offsetMs: off * 1000, hours: A.buildHours(wx, now, 24), nowTier: 3 });
    assert.equal(p.cols.filter(c => c.cloud != null).length, 12, name + ': every hour should have cloud data');
    assert.ok(p.cols[0].t.getTime() <= now && now < p.cols[0].t.getTime() + H, name + ': first column contains now');
  }
});

test('only the next hour or so counts as live; later hours are NOAA’s forecast', () => {
  const now = ms('2026-10-12T21:30:00Z'), series = kpSeries(() => 5, now - 6 * H, now + 24 * H);
  const p = plan(now, ...INVERNESS, { series, nowTier: 3 });
  assert.deepEqual(p.cols.slice(0, 3).map(c => c.live), [true, true, false]);
  assert.ok(p.cols.slice(2).every(c => !c.live));
  const noLive = plan(now, ...INVERNESS, { series, nowTier: null });
  assert.ok(noLive.cols.every(c => !c.live), 'without live data every hour is a forecast');
});

test('a bright Moon trims the chance, and the summary says so', () => {
  const now = ms('2026-10-25T20:00:00Z'), series = kpSeries(() => 5, now - 6 * H, now + 24 * H);
  const base = { nowTier: 3, series, moonIllum: 1 };
  const up = plan(now, ...INVERNESS, Object.assign({ moonAltAt: () => 30 }, base));
  const down = plan(now, ...INVERNESS, Object.assign({ moonAltAt: () => -30 }, base));
  const i = up.cols.findIndex(c => c.dark === 1);
  assert.ok(Math.abs(up.cols[i].score - down.cols[i].score * (1 - A.CFG.moonDim)) < 1e-9);
  assert.match(A.tonightSummary(up, fmt, now).sub, /bright Moon up/);
  assert.doesNotMatch(A.tonightSummary(down, fmt, now).sub, /Moon/);
});

test('before dark, the headline answers for tonight (and agrees with the Tonight card)', () => {
  const now = ms('2026-10-12T14:00:00Z');
  const stormTonight = kpSeries(t => t >= ms('2026-10-12T18:00:00Z') && t < ms('2026-10-13T06:00:00Z') ? 6.33 : 2, now - 12 * H, now + 30 * H);
  const tier = A.tierFromKp(2, A.kpNeeded(...INVERNESS));
  const dark = A.darkWindow(at(now), ...INVERNESS, -12);
  const p = plan(now, ...INVERNESS, { series: stormTonight, nowTier: tier });
  const v = A.makeVerdict({ tier, plan: p, nowMs: now, dark, cloud: 10, fmt });
  assert.equal(v.level, 'wait');
  assert.equal(v.title, 'Aurora likely tonight');
  assert.equal(v.sub, 'Best chance ' + fmt(p.best.start) + '–' + fmt(p.best.end) + '.');
  assert.match(A.tonightSummary(p, fmt, now).title, /^Best chance/);

  const quiet = plan(now, ...INVERNESS, { series: kpSeries(() => 1, now - 12 * H, now + 30 * H), nowTier: tier });
  assert.equal(A.makeVerdict({ tier, plan: quiet, nowMs: now, dark, cloud: 10, fmt }).title, 'Quiet for now');

  const overcast = A.buildHours(A.normaliseWeather(weatherJSON(now, 3600, () => 100)), now, 24);
  const cloudy = plan(now, ...INVERNESS, { series: stormTonight, nowTier: tier, offsetMs: 3600e3, hours: overcast });
  const cv = A.makeVerdict({ tier, plan: cloudy, nowMs: now, dark, cloud: 100, fmt });
  assert.equal(cv.level, 'no');
  assert.equal(cv.title, 'Cloud likely to hide it');
});

test('in the dark, a quiet now with a storm later says when', () => {
  const now = ms('2026-10-12T20:30:00Z');
  const series = kpSeries(t => t >= ms('2026-10-13T00:00:00Z') ? 6 : 1.67, now - 12 * H, now + 30 * H);
  const dark = A.darkWindow(at(now), ...INVERNESS, -12);
  const p = plan(now, ...INVERNESS, { series, nowTier: 0 });
  const v = A.makeVerdict({ tier: 0, plan: p, nowMs: now, dark, cloud: 10, fmt });
  assert.equal(v.level, 'wait');
  assert.equal(v.title, 'Likely later tonight');
  assert.ok(p.best.start.getTime() > now);
});

test('headline basics', () => {
  const now = ms('2026-10-12T21:30:00Z'), dark = A.darkWindow(at(now), ...INVERNESS, -12);
  assert.equal(A.makeVerdict({ tier: 3, dark, cloud: 10, nowMs: now, fmt }).level, 'go');
  assert.equal(A.makeVerdict({ tier: 4, dark, cloud: 10, nowMs: now, fmt }).title, 'Look up now');
  assert.equal(A.makeVerdict({ tier: 3, dark, cloud: 90, nowMs: now, fmt }).title, 'Likely, but cloudy');
  assert.match(A.makeVerdict({ tier: 2, dark, cloud: 10, nowMs: now, fmt, moonBright: true }).sub, /moonlight/);
  assert.equal(A.makeVerdict({ tier: 1, dark: { never: true }, nowMs: now, fmt }).title, 'Too light for aurora');
  assert.equal(A.makeVerdict({ needLocation: true }).title, 'Set your location');
  assert.equal(A.makeVerdict({ tier: null, loading: false }).title, 'Can’t read aurora data');
});

test('Kp needed: a rough rule of thumb, but in the right order', () => {
  const need = (la, lo) => A.kpNeeded(la, lo);
  assert.ok(need(69.65, 18.96) < 1);                               // Tromsø
  assert.ok(need(...INVERNESS) > 3 && need(...INVERNESS) < 4.5);
  assert.ok(need(51.5, -0.13) > 6 && need(51.5, -0.13) < 7.5);    // London
  assert.ok(need(-42.88, 147.33) > 6 && need(-42.88, 147.33) < 8); // Hobart
});
