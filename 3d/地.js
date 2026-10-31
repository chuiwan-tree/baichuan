// 百川 3D 的地：一张高度图，水自己冲出河来。node 和网页都用它。
// 规矩（照地貌演化的老办法，写小）：
//   1. 每格下一点雨。水往八个邻居里最低的那个流（坑先填平，水总能流到右边的海）。
//   2. 从高往低把水加起来，Q = 这一格上游一共来了多少水。
//   3. 水刮土：刮多少 ∝ Q^m × 坡^n（水多、坡陡的地方刮得狠，所以河越冲越深）。
//   4. 坡上的土慢慢往下溜（扩散），山脊变圆、河谷变宽。
//   5. 左边的山每一步抬高一点点（不然冲几百步就平了）。
(function (root) {
'use strict';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function noise(W, H, cell, R) {          // 一层平滑的随机起伏
  const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2, g = new Float64Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = R() * 2 - 1;
  const out = new Float64Array(W * H), s = t => t * t * (3 - 2 * t);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fx = x / cell, fy = y / cell, x0 = fx | 0, y0 = fy | 0, tx = s(fx - x0), ty = s(fy - y0);
    const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
    out[y * W + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  return out;
}

const P = { W: 128, H: 80, SLOPE: 0.12, BUMP: 3.0, K: 0.004, M: 0.5, N: 1.0, D: 0.004, UP: 0.003, RAIN: 1 };

function make(seed, opt) {
  const p = Object.assign({}, P, opt || {}), W = p.W, H = p.H, N = W * H, R = rng(seed);
  const h = new Float64Array(N);
  const n1 = noise(W, H, 24, R), n2 = noise(W, H, 9, R), n3 = noise(W, H, 4, R);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    h[i] = (W - 1 - x) * p.SLOPE + p.BUMP * (n1[i] + 0.45 * n2[i] + 0.15 * n3[i]);
    if (x === W - 1) h[i] = -2;                 // 海
  }
  const kf = new Float64Array(N).fill(1);           // 每格有多好刮：1 是土，石头小得多
  return { p, W, H, N, h, kf, Q: new Float64Array(N), down: new Int32Array(N), step: 0 };
}

const NB = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];

// 填坑 + 定流向：从海开始往里"漫"（priority-flood），每格流向把它漫到的那一格
function route(g) {
  const { W, H, N, h } = g, fill = new Float64Array(N), seen = new Uint8Array(N), down = g.down;
  const heap = [], push = (k, v) => { heap.push([k, v]); let i = heap.length - 1; while (i > 0) { const pa = (i - 1) >> 1; if (heap[pa][0] <= heap[i][0]) break; [heap[pa], heap[i]] = [heap[i], heap[pa]]; i = pa; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (let y = 0; y < H; y++) { const i = y * W + W - 1; seen[i] = 1; fill[i] = h[i]; down[i] = -1; push(h[i], i); }
  const order = [];
  while (heap.length) {
    const [z, i] = pop(); order.push(i);
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx; if (seen[j]) continue;
      seen[j] = 1; fill[j] = Math.max(h[j], z + 1e-6); down[j] = i; push(fill[j], j);
    }
  }
  g.fill = fill; g.order = order;        // order：从海往上，倒过来就是从上游往下游
}

function accumulate(g, rain) {
  const { N, Q, down, order } = g; Q.fill(rain === undefined ? g.p.RAIN : rain);
  for (let k = order.length - 1; k >= 0; k--) { const i = order[k], d = down[i]; if (d >= 0) Q[d] += Q[i]; }
}

function erode(g) {
  const { W, H, N, h, Q, down, order, p } = g;
  // 刮：从下游往上游，隐式一步（Braun & Willett 那个办法，n=1 时稳）
  for (let k = 0; k < order.length; k++) {
    const i = order[k], d = down[i]; if (d < 0) continue;
    const dx = (i % W) - (d % W), dy = ((i / W) | 0) - ((d / W) | 0), dist = Math.hypot(dx, dy);
    const f = p.K * g.kf[i] * Math.pow(Q[i], p.M) / dist;
    const target = (h[i] + f * h[d]) / (1 + f);
    if (target < h[i]) h[i] = Math.max(target, h[d] + 1e-5); // 刮了也不会比下游低
  }
  // 溜：坡上的土往四邻摊一点
  const nh = Float64Array.from(h);
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) {
    const i = y * W + x; let s = 0, c = 0;
    if (x > 0) { s += h[i - 1]; c++; } s += h[i + 1]; c++;
    if (y > 0) { s += h[i - W]; c++; } if (y < H - 1) { s += h[i + W]; c++; }
    nh[i] = h[i] + p.D * (s - c * h[i]);
  }
  // 抬：左边的山慢慢长高，越往右越少，海不动
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) nh[y * W + x] += p.UP * (1 - x / (W - 1));
  h.set(nh);
}

function step(g, n) { const k = n === undefined ? 1 : n; for (let s = 0; s < k; s++) { route(g); accumulate(g); erode(g); g.step++; } route(g); accumulate(g); }

// 玩的人的手 ------------------------------------------------------
// 挖：从 (x0,y0) 到 (x1,y1) 挖一道沟，深 dep，宽 wid（中间深两边浅）
function dig(g, x0, y0, x1, y1, dep, wid) {
  const { W, H, h } = g, L = Math.hypot(x1 - x0, y1 - y0) || 1e-9;
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) {
    let t = ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / (L * L); t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (x0 + t * (x1 - x0)), y - (y0 + t * (y1 - y0)));
    if (d < wid) h[y * W + x] -= dep * (1 - d / wid);
  }
}
// 石：在 (cx,cy) 放一块硬石，半径 r，高出地面 up；石头上水几乎刮不动
function rock(g, cx, cy, r, up, hard) {
  const { W, H, h, kf } = g;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 2, Math.ceil(cx + r)); x++) {
      const d = Math.hypot(x - cx, y - cy); if (d > r) continue;
      const i = y * W + x; h[i] += up * (1 - (d / r) ** 2); kf[i] = Math.min(kf[i], hard === undefined ? 0.08 : hard);
    }
}

const API = { P, make, route, accumulate, erode, step, dig, rock };
if (typeof module !== 'undefined') module.exports = API; else root.Di = API;
})(this);
