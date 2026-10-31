// 往前看：在旁边另起一个线程，把眼下这块地照同样的规矩一口气冲到最后一年，交回那时的地和水。
importScripts('地.js');
onmessage = e => {
  const { id, seed, opt, h, kf, step, end } = e.data;
  const g = Di.make(seed, opt);
  g.h.set(h); g.kf.set(kf); g.step = step;
  Di.step(g, Math.max(0, end - step));
  postMessage({ id, h: g.h, Q: g.Q, fill: g.fill, down: g.down }, [g.h.buffer, g.Q.buffer]);
};
