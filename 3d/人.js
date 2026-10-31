// 百川 3D 的人：村子靠水活，会长、会分出新村、会搬、会散。node 和网页都用它。
// 每隔 EVERY 步（一步 4 年）看一次所有村子：
//   有没有水：村子两格以内最大的水 Q。≥ QV 算有水。
//   养得活多少人：有水才有田；地越平、水越足，养得越多（cap）。
//   人数往 cap 靠；没水就一年年少。
//   人多了（> SPLIT）分一支出去，在附近找一块有水、平、不在河道里、离别的村子远的地方建新村。
//   连着几次没水：整村搬到附近最好的地方；找不到就散了，留下废墟。
//   河冲到村子脚下（村子那一格水太大）：村子被冲毁，人往附近逃。
(function (root) {
'use strict';
const NAMES = ['柳村', '石桥', '桑园', '杏花', '鹿鸣', '白沙', '青石', '枫林', '芦花', '云溪', '竹坞', '槐里', '梅岭', '双井', '南浦', '东皋',
  '黄泥', '桃源', '渔湾', '松冈', '麦田', '荷塘', '北坡', '雁落', '茶山', '花溪', '牛背', '燕子', '清水', '老鸦', '柿树', '小河', '长岭', '蒲口', '杨庄', '李家'];

const P = { EVERY: 5, QV: 100, BIG: 700, DROWN: 2500, SPLIT: 70, SPLIT_K: 0.4, GROW: 0.12, DRY: 0.18, MOVE_AFTER: 3, MINPOP: 4, CAP: 150, RANGE: 16, GAP: 11, RISE: 0.9, DROUGHT: 0.15 };

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let DRYK = 1;
function wet(g, x, y) { let q = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= g.W - 1 || yy >= g.H) continue; q = Math.max(q, g.Q[yy * g.W + xx]); } return q * DRYK; }
function slope(g, x, y) {                 // 周围 5x5 的高差，越小越平
  let mn = Infinity, mx = -Infinity; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= g.W - 1 || yy >= g.H) continue; const h = g.h[yy * g.W + xx]; mn = Math.min(mn, h); mx = Math.max(mx, h); } return mx - mn;
}
// 这块地能养多少人
function capOf(g, p, x, y) {
  const q = wet(g, x, y); if (q < p.QV) return 0;
  const flat = 1 / (1 + slope(g, x, y) / 3);            // 平地 1，陡坡趋近 0
  const water = Math.min(1, Math.log(q / p.QV + 1) / Math.log(9));  // 水越多越好，到大河就满
  return p.CAP * flat * (0.4 + 0.6 * water);
}
// 一块地适不适合建村（找新村址用）
function siteScore(g, p, vs, x, y, skip) {
  if (x < 2 || y < 2 || x >= g.W - 3 || y >= g.H - 2) return -1;
  const i = y * g.W + x; if (g.Q[i] >= p.QV * 0.6) return -1;          // 不建在河道里
  if (g.fill[i] - g.h[i] > 0.05) return -1;                             // 不建在湖里
  for (const v of vs) if (v !== skip && v.alive && Math.hypot(v.x - x, v.y - y) < p.GAP) return -1;
  return capOf(g, p, x, y);
}
function bestSite(g, p, vs, cx, cy, R, rand, skip) {
  let best = null, bs = 0;
  for (let k = 0; k < 140; k++) {
    const a = rand() * Math.PI * 2, r = 3 + rand() * (R - 3), x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
    const s = siteScore(g, p, vs, x, y, skip) * (1 - 0.3 * r / R);    // 近一点好
    if (s > bs) { bs = s; best = { x, y }; }
  }
  return best && bs > 8 ? best : null;
}

function make(g, seed, opt) {
  const p = Object.assign({}, P, opt || {}), rand = rng(seed * 7 + 1);
  const names = NAMES.slice(); for (let i = names.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [names[i], names[j]] = [names[j], names[i]]; }
  const T = { p, rand, names, vs: [], log: [], nameK: 0, tick: 0, flood: null };
  // 天时：提前写好的大水、大旱（年份），开局就亮给玩家看
  T.events = [{ year: 600, kind: '大水' }, { year: 1200, kind: '大旱', dur: 120 }, { year: 1900, kind: '大水' }, { year: 2500, kind: '大旱', dur: 160 }];
  return T;
}
function newName(T) { return T.names[T.nameK++ % T.names.length] + (T.nameK > T.names.length ? '二' : ''); }
function found(T, g, x, y, pop, from) {
  const v = { id: T.vs.length, name: newName(T), x, y, pop, alive: true, dry: 0, born: g.step * 4, from: from ? from.name : null, peak: pop, hasWater: true };
  T.vs.push(v); return v;
}
// 开局：在中间一带找一块最好的地，放第一个村子
function first(T, g) {
  let best = null, bs = 0;
  for (let y = 6; y < g.H - 6; y++) for (let x = 25; x < g.W - 30; x++) {
    const s = siteScore(g, T.p, T.vs, x, y) * (1 - Math.abs(x - g.W * 0.45) / g.W);
    if (s > bs) { bs = s; best = { x, y }; }
  }
  const v = found(T, g, best.x, best.y, 30);
  say(T, g, `${v.name}的人在这里落了脚，三十来口人。`, v);
  return v;
}
function say(T, g, text, v, mine) { T.log.push({ year: g.step * 4, text, v: v ? v.id : -1, mine: !!mine }); }

// 每一步调一次；到了 EVERY 才真的看一遍
function tick(T, g, cause) {
  const p = T.p, yr = g.step * 4;
  for (const e of T.events) {
    if (e.kind === '大水' && !e.done && yr >= e.year) { e.done = true; flood(T, g); }
    if (e.kind === '大旱' && !e.done && yr >= e.year) { e.done = true; e.on = true; say(T, g, `大旱开始了。小河小溪一条条干下去。`); }
    if (e.kind === '大旱' && e.on && yr >= e.year + e.dur) { e.on = false; say(T, g, `旱了${e.dur}年，雨终于回来了。`); }
  }
  DRYK = T.events.some(e => e.on) ? p.DROUGHT : 1;
  if (g.step % p.EVERY !== 0) return;
  const dt = p.EVERY * 4 / 20;                        // 以二十年为一个单位
  for (const v of T.vs.slice()) {
    if (!v.alive) continue;
    const i = v.y * g.W + v.x, q = wet(g, v.x, v.y);
    if (g.Q[i] >= p.DROWN) {                          // 河冲到了村子脚下
      v.alive = false; v.ruin = true; v.died = g.step * 4;
      const to = bestSite(g, p, T.vs, v.x, v.y, p.RANGE, T.rand, v);
      if (to && v.pop * 0.5 >= p.MINPOP) { const n = found(T, g, to.x, to.y, Math.round(v.pop * 0.5), v); say(T, g, `大河改道，冲进了${v.name}。活下来的一半人往高处逃，建了${n.name}。`, v, cause); }
      else say(T, g, `大河改道，冲进了${v.name}。${v.name}没了。`, v, cause);
      continue;
    }
    const had = v.hasWater; v.hasWater = q >= p.QV;
    if (v.hasWater) {
      if (!had) say(T, g, `${v.name}又有水了。`, v, cause);
      v.dry = 0; const cap = capOf(g, p, v.x, v.y); v.cap = cap;
      v.pop += (cap - v.pop) * p.GROW * dt * (v.pop < cap ? 1 : 0.6);
    } else {
      if (had) say(T, g, `${v.name}门口的河干了。`, v, cause);
      v.dry++; v.cap = 0; v.pop *= Math.pow(1 - p.DRY, dt);
      if (v.dry >= p.MOVE_AFTER) {                    // 撑不住了：搬
        const to = bestSite(g, p, T.vs, v.x, v.y, p.RANGE * 1.4, T.rand, v);
        if (to) { say(T, g, `${v.name}等不来水，整村搬到了${dirOf(v, to)}${Math.round(Math.hypot(to.x - v.x, to.y - v.y))}里外的河边。`, v, cause); v.x = to.x; v.y = to.y; v.dry = 0; v.hasWater = true; v.moved = (v.moved || 0) + 1; }
      }
    }
    if (v.pop < p.MINPOP) { v.alive = false; v.ruin = true; v.died = g.step * 4; say(T, g, `${v.name}的最后几户也走了，只剩下空房子。`, v, cause); continue; }
    v.peak = Math.max(v.peak, v.pop);
    if (v.pop > p.SPLIT && T.rand() < 0.6) {            // 分一支出去
      const to = bestSite(g, p, T.vs, v.x, v.y, p.RANGE, T.rand);
      if (to) { const k = Math.round(v.pop * p.SPLIT_K); v.pop -= k; const n = found(T, g, to.x, to.y, k, v); const dir = dirOf(v, to), r = T.rand(), t = r < 0.3 ? `${v.name}住不下了，${k}口人往${dir}走，建了${n.name}。` : r < 0.55 ? `${v.name}有几户往${dir}的河边开了荒，那里后来叫${n.name}。` : r < 0.8 ? `从${v.name}分出去${k}口人，在${dir}边落脚，起名${n.name}。` : `${n.name}建起来了，最早的人是从${v.name}过来的。`;
        say(T, g, t, n, cause); }
    }
  }
}
// 大水：每条大河的水面涨 RISE，顺着低地漫开（垒高的地方挡得住）。被漫到的村子折掉大半人，最低的直接冲没。
function flood(T, g) {
  const { W, H, h, Q } = g, p = T.p, lvl = new Float32Array(W * H).fill(-1e9), st = [];
  for (let i = 0; i < W * H; i++) if (Q[i] >= p.BIG && i % W < W - 1) { lvl[i] = h[i] + p.RISE; st.push(i); }
  while (st.length) {
    const i = st.pop(), L = lvl[i], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W - 1 || yy >= H) continue;
      const j = yy * W + xx, Lj = L - 0.1;                 // 漫得越远水越浅
      if (h[j] < Lj && lvl[j] < Lj) { lvl[j] = Lj; st.push(j); }
    }
  }
  T.flood = { lvl, year: g.step * 4 };
  let hit = [];
  for (const v of T.vs) {
    if (!v.alive) continue; const i = v.y * W + v.x, d = lvl[i] - h[i];
    if (d <= 0) continue;
    if (d > 0.7) { v.alive = false; v.ruin = true; v.died = g.step * 4; hit.push(v.name + '（冲没了）'); }
    else { v.pop *= 0.5; hit.push(v.name); }
  }
  say(T, g, hit.length ? `大水。${hit.join('、')}被淹了。` : `大水来了，没有一个村子被淹。`);
}
function dirOf(a, b) { const dx = b.x - a.x, dy = b.y - a.y; const ang = Math.atan2(-dy, dx) * 180 / Math.PI; const d = ['东', '东北', '北', '西北', '西', '西南', '南', '东南']; return d[((Math.round(ang / 45) % 8) + 8) % 8]; }
function total(T) { let s = 0; for (const v of T.vs) if (v.alive) s += v.pop; return Math.round(s); }

const API = { P, make, first, tick, total, wet, capOf, say, found, bestSite, flood };
if (typeof module !== 'undefined') module.exports = API; else root.Ren = API;
})(this);
