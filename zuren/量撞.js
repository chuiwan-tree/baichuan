// 量撞：替玩家随手放 N 局，看每局撞了几回、哪几种、先后顺序有多少种。node 量撞.js [族.js 路径] [局数]
const Z = require(process.argv[2] ? require('path').resolve(process.argv[2]) : './族.js');
const N = +(process.argv[3] || 300);
const 是撞 = z => !z.空 && (z.撞 !== undefined ? z.撞 : z.b !== undefined);
const 底数 = {}, 底序 = {}, 序 = {}, 数 = {}, 类 = {}, 局里种 = {}; let 共 = 0, 局 = 0, 到底 = 0, 同种两回 = 0, 单念 = 0;
for (let s = 1; s <= N; s++) {
  const g = Z.新局(s * 7 + 3); let R = s * 9301 % 233280;
  const r = () => (R = (R * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 15 && !g.完; i++) {
    const n = Z.离大水(g); const 派 = {};
    for (const p of Z.能干的(g)) { Z.卡(g, p); const x = r();
      派[p.id] = n !== null && n <= 1 ? (x < 0.5 ? '堤' : x < 0.75 ? '田' : x < 0.9 ? '坡' : '渠') : (x < 0.45 ? '田' : x < 0.65 ? '堤' : x < 0.85 ? '渠' : '坡'); }
    Z.过一代(g, 派);
  }
  局++; if (g.代 > 15) 到底++;
  const zs = (g.撞们 || []).filter(z => z.定);
  单念 += zs.filter(z => !z.空 && !是撞(z)).length;
  const 撞 = zs.filter(是撞); 共 += 撞.length;
  const k = 撞.map(z => z.类).join('→') || '（没撞）'; 序[k] = (序[k] || 0) + 1;
  数[撞.length] = (数[撞.length] || 0) + 1; if (g.代 > 15) { 底数[撞.length] = (底数[撞.length] || 0) + 1; 底序[k] = (底序[k] || 0) + 1; }
  for (const z of 撞) 类[z.类] = (类[z.类] || 0) + 1;
  const 种 = new Set(撞.map(z => z.类)).size; 局里种[种] = (局里种[种] || 0) + 1;
  if (撞.length > new Set(撞.map(z => z.类)).size) 同种两回++;
}
const 排 = Object.entries(序).sort((a, b) => b[1] - a[1]);
console.log(`局 ${局}（活到底 ${到底}），撞一共 ${共}，平均每局 ${(共 / 局).toFixed(2)}；只一个人想、没撞上的心事 ${单念}`);
console.log('每局撞几回：', 数); console.log('活到底的局撞几回：', 底数, '；顺序', Object.keys(底序).length, '种，最多的', Math.max(...Object.values(底序)));
console.log('各种撞：', 类);
console.log('一局里撞了几种：', 局里种, '；同一种撞两回以上的局', 同种两回);
console.log(`先后顺序一共 ${排.length} 种；最常见的十种：`); for (const [k, v] of 排.slice(0, 10)) console.log('  ', v, k);
const 头 = 排[0][1]; console.log(`最常见那一种占 ${(头 / 局 * 100).toFixed(0)}%`);
