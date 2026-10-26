/* 冒烟测试：在 Node 中用桩 ctx 执行绘制/逻辑代码，抓运行时错误 */
'use strict';
global.window = global;

// 桩 ctx：任何方法调用都成功，任何属性赋值都接受
function makeCtx() {
  return new Proxy({}, {
    get: function (t, p) {
      if (p === 'measureText') return function () { return { width: 42 }; };
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return function () { return { addColorStop: function () { } }; };
      if (p === 'canvas') return { width: 800, height: 600 };
      return function () { };
    },
    set: function () { return true; }
  });
}

// --- memories.js（world 依赖它）---
require('./memories.js');
console.log('Memories loaded:', window.Memories.length, '条; image 全为占位:', window.Memories.every(m => m.image === null));

// --- world.js ---
require('./world.js');
const W = window.World;
console.log('World loaded:', Object.keys(W).join(','));

const ctx = makeCtx();
W.drawGround(ctx, { x: 0, y: 0, w: 800, h: 600 });
W.drawIceRink(ctx); W.drawPond(ctx); W.drawSnowPiles(ctx); W.drawFence(ctx); W.drawBorderTrees(ctx, 1000);
W.drawBridge(ctx); W.drawEggs(ctx, 1000);
W.buildings.forEach(b => W.drawBuilding(ctx, b, 1000));
W.drawBigTree(ctx, W.tree, 0, 1000);
W.drawBigTree(ctx, W.tree, 3, 1000);
W.benches.forEach(b => W.drawBench(ctx, b));
W.lamps.forEach(l => W.drawLamp(ctx, l, 1000));
console.log('World draw OK; obstacles:', W.obstacles.length, 'npcs:', W.npcs.length, 'doors:', W.doors.length, 'eggs:', W.eggs.length);

// 数据完整性检查
let errs = [];
W.npcs.forEach(n => {
  if (!n.id || !n.name || !Array.isArray(n.lines) || !n.lines.length) errs.push('npc bad: ' + n.id);
  if (n.lateLines && !Array.isArray(n.lateLines)) errs.push('lateLines bad: ' + n.id);
});
W.doors.forEach(d => {
  const b = W.buildings.filter(x => x.id === d.id)[0];
  if (!b) errs.push('door without building: ' + d.id);
  else if (typeof b.kind === 'undefined' || typeof b.hint === 'undefined') errs.push('building missing kind/hint: ' + b.id);
});
W.buildings.forEach(b => { if (!(b.w > 0 && b.h > 0)) errs.push('building bad size: ' + b.id); });
W.obstacles.forEach(o => { if (!(o.w > 0 && o.h > 0)) errs.push('obstacle bad size'); });
W.eggs.forEach(e => { if (!e.id || !e.title || !e.message || !e.object || !e.color) errs.push('memory bad: ' + e.id); });
// 彩蛋 id 与 memories 对齐、数量一致
if (window.Memories && W.eggs.length !== window.Memories.length) errs.push('eggs count mismatch');
// 彩蛋不能落在碰撞体里
W.eggs.forEach(e => {
  W.obstacles.forEach(o => {
    if (e.x > o.x - 20 && e.x < o.x + o.w + 20 && e.y > o.y - 20 && e.y < o.y + o.h + 20) errs.push('egg inside obstacle: ' + e.id);
  });
});
// 室内场景（v2：全部 4 个室内都要过）
const interiors = W.interiors || { cabin: W.Interior };
Object.keys(interiors).forEach(function (k) {
  const I = interiors[k];
  if (!I || !I.w || !I.h || !I.spawn || !I.exit || !Array.isArray(I.obstacles) || !Array.isArray(I.interactables)) errs.push('Interior bad: ' + k);
  else {
    I.interactables.forEach(it => { if (!it.id || !it.name || !Array.isArray(it.lines)) errs.push('interactable bad: ' + k + '/' + it.id); });
    if (k === 'greenhouse') {
      // 空地 / 生长中 / 成熟可收 三种状态都画一遍
      I.draw(ctx, 1000, null);
      I.draw(ctx, 1000, [null, { stage: 1, kind: 'flower' }, { stage: 2, kind: 'tree' }, { stage: 3, kind: 'flower', ready: true }, { stage: 3, kind: 'tree', ready: true }, null]);
    } else {
      I.draw(ctx, 1000);
    }
  }
});
if (!W.getInterior || W.getInterior('cafe') !== interiors.cafe || W.getInterior('greenhouse') !== interiors.greenhouse) errs.push('getInterior map bad');
if (!errs.length) console.log('World data OK (incl. eggs + 4 Interiors)');
if (errs.length) { console.log('DATA ERRORS:', errs); process.exit(1); }

// --- sprites.js ---
require('./sprites.js');
const SP = window.Sprites;
const CHAROPT = { a: { gender: 'm', glasses: true, hairStyle: 'short' }, b: { gender: 'f', glasses: false, hairStyle: 'long' } };
for (const slot of ['a', 'b']) for (const dir of [0, 1, 2, 3]) for (const frame of [0, 1, 2, 3]) for (const outfit of ['winter', 'santa', 'home']) {
  SP.drawCharacter(ctx, 100, 100, dir, frame, Object.assign({}, CHAROPT[slot], { outfit: outfit }), frame === 1, 12345);
}
SP.drawCharacter(ctx, 100, 100, 0, 0, Object.assign({}, CHAROPT.a, { outfit: 'winter' }), false, undefined); // 无 t 也要能画
SP.drawSanta(ctx, 50, 50, 1000); SP.drawSnowman(ctx, 50, 50, 1000);
SP.drawElf(ctx, 50, 50, 1000, 2); SP.drawBarista(ctx, 50, 50, 1000, 2);
console.log('Sprites draw OK (2 chars x 4 dir x 4 frame x 3 outfit + 4 NPCs)');

// --- game.js 纯逻辑（不启动循环，只验证模块加载与导出）---
require('./game.js');
console.log('Game loaded:', Object.keys(window.Game).join(','));
console.log('Game.active():', window.Game.active()); // 应为 false（未 enter）
console.log('ALL SMOKE TESTS PASSED');
