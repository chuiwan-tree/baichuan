// 命令行里玩：node 玩.js 新 [种子]   开一局
//             node 玩.js 看          看这一代的人
//             node 玩.js 放 阿满=堤 福=渠 ...   放人过一代（没写的放北坡）
// 局存在 局.json
const fs = require('fs'), path = require('path');
const Z = require('./族.js');
const F = path.join(__dirname, '局.json');
const 存 = g => fs.writeFileSync(F, JSON.stringify(g));
const 读 = () => JSON.parse(fs.readFileSync(F, 'utf8'));
function 看(g) {
  if (g.完) { console.log('\n=== ' + g.终 + ' 整本族谱：'); for (const d of g.族谱) { console.log(`【第${d.代}回${d.大水 ? '·大水' : ''}】`); d.句.forEach(s => console.log('  ' + s)); } return; }
  const n = Z.离大水(g);
  const 看 = Z.看水(g);
  console.log(`\n—— 第${g.代}回（第${g.代*10-10}年）——  粮：${看.粮}　堤：${看.堤}　北渠 ${g.渠通 ? (g.淤死 ? '淤死了' : g.淤 >= 2 ? '淤了一半' : '通了') : (g.渠 >= 7 ? '快通了' : g.渠 >= 3 ? '挖了一半' : g.渠 > 0 ? '刚起头' : '没动')}　${看.水 || '后面没有大水了'}`);
  for (const p of Z.能干的(g)) { const c = Z.卡(g, p); console.log("  " + [`${c.名}，${c.岁}岁，${c.本事}`, c.一行, c.线.join("；"), c.想].filter(Boolean).join("。")); }
  const 老小 = g.人们.filter(p => p.活 && !(p.岁 >= 15 && p.岁 < 60)).map(p => `${p.名}(${p.岁})`);
  if (老小.length) console.log('  不能干活的：' + 老小.join('、'));
  console.log('  能放：田（南田，收成好，大水淹）、坡（北坡，人安全，收成差；老小带不上去，除非有手巧的在坡上搭了棚）、堤（守田堤，人越多越稳，堤后就是村子）、渠（北渠，挖通了大水分流）');
  console.log('  本事：力气在堤上顶两个人；懂水会看水色、挖渠快；会算下南田多收；会说话放北坡，粮紧时能去下游借粮；手巧放北坡能搭棚，大水时老小带得上坡。堤要是冲开：仓里的粮泡掉大半，南田压一层沙，房子冲了，那十年没人成亲。');
}
const [cmd, ...a] = process.argv.slice(2);
if (cmd === '新') { const g = Z.新局(+(a[0] || 1)); 存(g); 看(g); }
else if (cmd === '看') 看(读());
else if (cmd === '放') {
  const g = 读(); if (g.完) { 看(g); process.exit(); }
  const 派 = {};
  for (const s of a) { const [名, 处] = s.split('='); const p = Z.能干的(g).find(x => x.名 === 名); if (!p) { console.log('没有这个能干活的人：' + 名); process.exit(1); } 派[p.id] = 处; }
  const r = Z.过一代(g, 派);
  console.log('\n· 这十年：'); r.翻.forEach(s => console.log('  ' + s));
  if (r.死.length) console.log('  没回来的：' + r.死.join('、'));
  console.log('· 族谱：'); r.族谱.forEach(s => console.log('  ' + s));
  存(g); 看(g);
}
