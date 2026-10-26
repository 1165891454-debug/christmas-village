/* world.js — v1.0.0：Omo's Christmas Village 世界（绘本式视觉）
 * 视觉语言：暖木 + 奶油白 + 圣诞红 + 暖金；所有物件带轮廓、两阶明暗、投影。
 * 性能：地面与灯光光池预渲染到离屏 canvas；光晕用缓存 sprite。
 * 回忆彩蛋：数据在 memories.js（16 条），本文件只负责摆放与绘制。
 */
window.World = (function () {
  'use strict';

  var width = 1500, height = 1100;
  var OUT = '#4a3020'; // 统一轮廓色（暖深棕）

  var _seed = 7;
  function rnd() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }

  // ---------- 小工具：带轮廓/明暗的矩形与圆 ----------
  function box(ctx, x, y, w, h, fill, opt) {
    opt = opt || {};
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (ctx.roundRect && opt.r) ctx.roundRect(x, y, w, h, opt.r); else ctx.rect(x, y, w, h);
    ctx.fill();
    if (opt.outline !== false) { ctx.strokeStyle = opt.oc || OUT; ctx.lineWidth = opt.ol || 1.5; ctx.stroke(); }
    if (opt.shade) { // 底部暗阶
      ctx.fillStyle = 'rgba(40,24,12,.18)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y + h * 0.62, w, h * 0.38, opt.r ? [0, 0, opt.r, opt.r] : 0); else ctx.rect(x, y + h * 0.62, w, h * 0.38);
      ctx.fill();
    }
    if (opt.hi) { // 左上高光
      ctx.fillStyle = 'rgba(255,245,225,.35)';
      ctx.fillRect(x + 2, y + 2, Math.max(1, w - 4), 2);
    }
  }
  function ball(ctx, x, y, rad, fill, opt) {
    opt = opt || {};
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
    if (opt.outline !== false) { ctx.strokeStyle = opt.oc || OUT; ctx.lineWidth = opt.ol || 1.5; ctx.stroke(); }
    if (opt.hi !== false) {
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.arc(x - rad * 0.32, y - rad * 0.35, rad * 0.3, 0, 7); ctx.fill();
    }
  }
  function shadow(ctx, x, y, rx, ry) {
    ctx.fillStyle = 'rgba(70,90,130,.22)';
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill();
  }

  // ---------- 建筑 ----------
  var buildings = [
    { id: 'cabin', x: 170, y: 200, w: 230, h: 150, kind: 'cabin', wall: '#9a7050', roof: '#8a5644', name: '我们的圣诞小屋', hint: '' },
    { id: 'cafe', x: 1170, y: 170, w: 250, h: 165, kind: 'cafe', wall: '#b8907a', roof: '#96604a', name: '暖冬咖啡', hint: '推开门，热可可的甜香混着肉桂味飘出来。' },
    { id: 'shop', x: 1160, y: 760, w: 250, h: 165, kind: 'shop', wall: '#8678ab', roof: '#655388', name: '圣诞小铺', hint: '' },
    { id: 'stall', x: 560, y: 110, w: 150, h: 95, kind: 'stall', wall: '#a86454', roof: '#c0392b', name: '礼物小摊', hint: '摊主神秘地压低声音：「今年的圣诞礼物，我可是提前给你们俩留了最好的。」' },
    { id: 'greenhouse', x: 150, y: 870, w: 180, h: 125, kind: 'greenhouse', wall: '#bfe3f5', roof: '#8fc3d8', name: '星星温室', hint: '玻璃房里暖烘烘的，一排排花盆正在等你们来种点什么。' },
    { id: 'workshop', x: 930, y: 110, w: 230, h: 140, kind: 'workshop', wall: '#a08a6a', roof: '#7a6450', name: '礼物工坊', hint: '叮叮当当——木屑的香味里，可以亲手做点小东西。' }
  ];

  var tree = { x: 750, y: 545 };

  var obstacles = [];
  buildings.forEach(function (b) { obstacles.push({ x: b.x, y: b.y, w: b.w, h: b.h }); });
  obstacles.push({ x: tree.x - 22, y: tree.y - 18, w: 44, h: 30 });
  obstacles.push({ x: 980, y: 930, w: 105, h: 130 });
  obstacles.push({ x: 1145, y: 930, w: 95, h: 130 });
  obstacles.push({ x: 40, y: 470, w: 260, h: 90 });
  obstacles.push({ x: 420, y: 880, w: 180, h: 120 });
  obstacles.push({ x: 60, y: 700, w: 200, h: 150 });

  // ---------- NPC ----------
  var npcs = [
    { id: 'santa', x: 858, y: 648, name: '圣诞老人', lines: [
      'Ho Ho Ho！欢迎回到你们自己的小镇。',
      '这棵树的每一颗灯泡，都在等你们一起点亮。',
      '去镇子里走走吧——听说有些角落藏着你们旅行的回忆。'
    ], lateLines: [
      'Ho Ho Ho！看，全镇的灯都亮了——因为你们俩呀。',
      '这棵树是今年我见过最漂亮的树。不对，是第二漂亮，第一漂亮的是站在树下的你们。',
      '去吧，站到树底下去，让雪花见证一下。'
    ] },
    { id: 'snowman', x: 1030, y: 890, name: '雪人先生', lines: [
      '别站太近，我最近有点怕化……',
      '你们俩站在一起的时候，比我的胡萝卜鼻子还亮眼。',
      '冬天最大的好处：不用担心冰淇淋化掉。'
    ], lateLines: [
      '这么亮的天……我压力真的很大。但为了庆祝，化了也值！',
      '快去桥那边看看，池塘都结冰了，适合两个人并排走。'
    ] },
    { id: 'elf', x: 1108, y: 742, name: '小精灵', lines: [
      '圣诞小铺上新啦！去店里换身衣服试试？',
      '偷偷告诉你：红色那套最衬你们俩。',
      '地图上那些一闪一闪的小角落，藏着你们去过的地方，去找找看！'
    ], lateLines: [
      '哇，全点亮了！我要把这个画面画进我的笔记本！',
      '那些回忆的小物件，你们收集了几个啦？'
    ] },
    { id: 'barista', x: 1230, y: 382, name: '咖啡店老板娘', lines: [
      '欢迎光临暖冬咖啡～',
      '两杯热可可，加双份棉花糖——你们的老规矩。',
      '外面冷，进来坐坐再走。'
    ], lateLines: [
      '今晚的咖啡我请！庆祝你们把小镇点亮！',
      '窗边的位置给你们留着呢，看雪最清楚了。'
    ] }
  ];

  var doors = buildings.map(function (b) {
    return { id: b.id, type: 'building', x: b.x + b.w / 2, y: b.y + b.h + 8, name: b.name };
  });

  // ---------- 回忆彩蛋（数据来自 memories.js） ----------
  var eggs = (window.Memories || []).slice();

  // ---------- 小镇道具（让地图「有人生活」） ----------
  var props = [
    { kind: 'crate', x: 430, y: 380 }, { kind: 'crate', x: 452, y: 392 }, { kind: 'giftbox', x: 444, y: 366, c: '#e0563f' },
    { kind: 'crate', x: 1120, y: 700 }, { kind: 'giftbox', x: 1102, y: 712, c: '#4f86d6' },
    { kind: 'barrel', x: 520, y: 130 }, { kind: 'giftbox', x: 545, y: 142, c: '#58b368' },
    { kind: 'signpost', x: 690, y: 470 }, { kind: 'signpost', x: 960, y: 640 },
    { kind: 'mailbox', x: 425, y: 372 }, { kind: 'mailbox', x: 1146, y: 356 },
    { kind: 'minitree', x: 180, y: 420 }, { kind: 'minitree', x: 1330, y: 640 }, { kind: 'minitree', x: 690, y: 980 },
    { kind: 'giftbox', x: 948, y: 690, c: '#f0a83c' }, { kind: 'crate', x: 962, y: 702 },
    { kind: 'flagstring', x1: 620, y1: 452, x2: 890, y2: 452 }, { kind: 'flagstring', x1: 570, y1: 620, x2: 940, y2: 620 }
  ];

  var lamps = [
    { x: 620, y: 470 }, { x: 890, y: 470 }, { x: 560, y: 730 }, { x: 950, y: 730 },
    { x: 1090, y: 560 }, { x: 400, y: 300 }, { x: 1330, y: 430 }, { x: 300, y: 620 }
  ];
  var benches = [
    { x: 660, y: 640 }, { x: 850, y: 640 }, { x: 1300, y: 480 }
  ];
  var snowPiles = [
    { x: 300, y: 560, r: 26 }, { x: 1010, y: 700, r: 30 }, { x: 480, y: 960, r: 24 },
    { x: 1330, y: 520, r: 28 }, { x: 760, y: 950, r: 26 }, { x: 200, y: 950, r: 30 },
    { x: 960, y: 240, r: 22 }, { x: 520, y: 330, r: 20 }
  ];
  var borderTrees = (function () {
    var arr = [];
    for (var x = 40; x < width - 20; x += 90) { arr.push({ x: x, y: 36 }); arr.push({ x: x + 45, y: height - 40 }); }
    for (var y = 100; y < height - 60; y += 95) { arr.push({ x: 36, y: y }); arr.push({ x: width - 36, y: y + 40 }); }
    return arr;
  })();

  var slotNames = { a: 'Charles', b: 'Julie' };

  // ============================================================
  // 发光贴图缓存
  // ============================================================
  var _glowCache = {};
  function glowSprite(color, size) {
    var key = color + size;
    if (_glowCache[key]) return _glowCache[key];
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas');
    c.width = c.height = size * 2;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(size, size, 1, size, size, size);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(255,215,122,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size * 2, size * 2);
    _glowCache[key] = c;
    return c;
  }
  function drawGlow(ctx, x, y, color, size, alpha) {
    var s = glowSprite(color, size);
    if (!s) return;
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.drawImage(s, x - size, y - size);
    ctx.globalAlpha = 1;
  }

  // ============================================================
  // 地面预渲染（含灯光光池、树影、踩雪痕）
  // ============================================================
  var _groundCanvas = null;
  function getGroundCanvas() {
    if (_groundCanvas) return _groundCanvas;
    if (typeof document === 'undefined') return null;
    _seed = 7;
    var c = document.createElement('canvas');
    c.width = width; c.height = height;
    var g = c.getContext('2d');

    g.fillStyle = '#e2ebf7';
    g.fillRect(0, 0, width, height);

    // 大块冷暖色斑（绘本底层）
    for (var i = 0; i < 40; i++) {
      g.fillStyle = i % 3 === 0 ? 'rgba(214,226,244,.24)' : (i % 3 === 1 ? 'rgba(238,244,251,.26)' : 'rgba(198,214,238,.18)');
      g.beginPath(); g.ellipse(rnd() * width, rnd() * height, 80 + rnd() * 120, 40 + rnd() * 62, rnd() * 3, 0, 7); g.fill();
    }
    // 细雪斑
    for (var i2 = 0; i2 < 150; i2++) {
      var bx = rnd() * width, by = rnd() * height, br = 20 + rnd() * 60;
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.20)' : 'rgba(186,203,232,.10)';
      g.beginPath(); g.ellipse(bx, by, br, br * (0.35 + rnd() * 0.3), rnd() * 3, 0, 7); g.fill();
    }
    // 雪地小亮点
    _seed = 55;
    for (var sp = 0; sp < 160; sp++) {
      g.fillStyle = 'rgba(255,255,255,' + (0.35 + rnd() * 0.45) + ')';
      g.fillRect(rnd() * width, rnd() * height, 2 + rnd() * 2, 1 + rnd() * 1.5);
    }

    // ---- 广场：错缝石板 + 石缝积雪（不用方格子）----
    var PX0 = 560, PY0 = 420, PX1 = 940, PY1 = 800;
    var pg = g.createLinearGradient(PX0, PY0, PX1, PY1);
    pg.addColorStop(0, '#cdd6e6');
    pg.addColorStop(0.5, '#c2ccdf');
    pg.addColorStop(1, '#b6c2d8');
    g.fillStyle = pg; g.fillRect(PX0, PY0, PX1 - PX0, PY1 - PY0);
    _seed = 1234;
    var stoneCols = ['#cdd6e6', '#c5cfe1', '#d3dbe9', '#bfcadf', '#c9d2e3'];
    var rowH = 30, rowY = PY0, rowIdx = 0;
    while (rowY < PY1) {
      var x = PX0 - (rowIdx % 2 ? 22 : 0);
      while (x < PX1) {
        var wStone = 40 + Math.floor(rnd() * 12);
        var x0 = Math.max(PX0, x), x1 = Math.min(PX1, x + wStone - 3);
        if (x1 - x0 > 6) {
          g.beginPath();
          var rr2 = 5;
          if (g.roundRect) g.roundRect(x0 + 1, rowY + 1, x1 - x0 - 1, rowH - 3, rr2);
          else g.rect(x0 + 1, rowY + 1, x1 - x0 - 1, rowH - 3);
          g.fillStyle = stoneCols[Math.floor(rnd() * stoneCols.length)];
          g.fill();
          // 顶面高光 + 底部暗边
          g.fillStyle = 'rgba(255,255,255,.30)';
          g.fillRect(x0 + 3, rowY + 2, x1 - x0 - 6, 2);
          g.fillStyle = 'rgba(120,138,172,.18)';
          g.fillRect(x0 + 3, rowY + rowH - 5, x1 - x0 - 6, 2);
        }
        x += wStone;
      }
      rowY += rowH; rowIdx++;
    }
    // 石缝里积的雪
    _seed = 777;
    for (var sf = 0; sf < 46; sf++) {
      var sfx = PX0 + rnd() * (PX1 - PX0), sfy = PY0 + rnd() * (PY1 - PY0);
      g.fillStyle = 'rgba(248,252,255,' + (0.30 + rnd() * 0.42) + ')';
      g.beginPath();
      g.ellipse(sfx, sfy, 5 + rnd() * 16, 2 + rnd() * 4, (rnd() - 0.5) * 0.4, 0, 7);
      g.fill();
    }
    // 广场外沿的一圈大石
    g.strokeStyle = 'rgba(150,166,196,.45)'; g.lineWidth = 3;
    g.strokeRect(PX0 - 1.5, PY0 - 1.5, PX1 - PX0 + 3, PY1 - PY0 + 3);
    // 树下暖光圈 + 树影
    var cg = g.createRadialGradient(tree.x, tree.y, 20, tree.x, tree.y, 175);
    cg.addColorStop(0, 'rgba(255,224,150,.26)'); cg.addColorStop(1, 'rgba(255,224,150,0)');
    g.fillStyle = cg; g.fillRect(tree.x - 175, tree.y - 175, 350, 350);
    g.fillStyle = 'rgba(80,100,140,.18)';
    g.beginPath(); g.ellipse(tree.x + 40, tree.y + 14, 130, 30, 0, 0, 7); g.fill();
    for (var s = 0; s < 34; s++) {
      g.fillStyle = 'rgba(244,249,255,' + (0.18 + rnd() * 0.26) + ')';
      g.beginPath(); g.ellipse(570 + rnd() * 360, 430 + rnd() * 360, 7 + rnd() * 13, 4 + rnd() * 6, rnd() * 3, 0, 7); g.fill();
    }

    // ---- 道路 ----
    function road(x, y, w, h) {
      g.fillStyle = '#cdd9ec'; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(140,158,192,.4)'; g.lineWidth = 1.5;
      for (var px = x + 24; px < x + w; px += 48) { g.beginPath(); g.moveTo(px, y + 4); g.lineTo(px - 6, y + h - 4); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x, y, w, 4); g.fillRect(x, y, 4, h);
      g.fillStyle = 'rgba(146,164,198,.4)'; g.fillRect(x, y + h - 5, w, 5); g.fillRect(x + w - 5, y, 5, h);
      g.fillStyle = 'rgba(245,250,255,.8)';
      for (var e = 0; e < w * h / 3000; e++) {
        g.beginPath(); g.ellipse(x + rnd() * w, (rnd() > 0.5 ? y - 3 : y + h + 3), 8 + rnd() * 12, 4 + rnd() * 5, 0, 0, 7); g.fill();
      }
    }
    road(722, 130, 56, 292);
    road(722, 798, 56, 212);
    road(390, 600, 172, 56);
    road(938, 600, 212, 56);
    road(938, 452, 250, 56);
    road(1132, 350, 56, 158);
    // 被踩实的雪痕（门前后）
    function trampled(cx2, cy2) {
      for (var k = 0; k < 12; k++) {
        g.fillStyle = 'rgba(160,176,205,' + (0.15 + rnd() * 0.2) + ')';
        g.beginPath(); g.ellipse(cx2 + (rnd() - 0.5) * 60, cy2 + (rnd() - 0.5) * 30, 6 + rnd() * 10, 3 + rnd() * 5, (rnd() - 0.5) * 0.6, 0, 7); g.fill();
      }
    }
    buildings.forEach(function (b) { trampled(b.x + b.w / 2, b.y + b.h + 26); });
    trampled(tree.x, tree.y + 40);
    // 脚印
    _seed = 99;
    for (var f = 0; f < 110; f++) {
      var fx, fy, pick = rnd();
      if (pick < 0.28) { fx = 730 + rnd() * 40; fy = 140 + rnd() * 280; }
      else if (pick < 0.48) { fx = 400 + rnd() * 160; fy = 606 + rnd() * 44; }
      else if (pick < 0.68) { fx = 946 + rnd() * 196; fy = 606 + rnd() * 44; }
      else if (pick < 0.84) { fx = 730 + rnd() * 40; fy = 800 + rnd() * 200; }
      else { fx = 946 + rnd() * 230; fy = 458 + rnd() * 44; }
      g.fillStyle = 'rgba(128,146,176,.30)';
      g.beginPath(); g.ellipse(fx, fy, 3.4, 5.2, (rnd() - 0.5), 0, 7); g.fill();
    }

    // ---- 路灯光池（烘焙，静态） ----
    lamps.forEach(function (l) {
      var gs = glowSprite('rgba(255,214,130,.4)', 85);
      if (gs) { g.globalAlpha = 0.9; g.drawImage(gs, l.x - 85, l.y - 20 - 85); g.globalAlpha = 1; }
    });

    // 边缘雪堆点缀
    _seed = 31;
    for (var d = 0; d < 70; d++) {
      g.fillStyle = 'rgba(245,250,255,.55)';
      g.beginPath(); g.ellipse(rnd() * width, rnd() * height, 6 + rnd() * 16, 4 + rnd() * 8, 0, 0, 7); g.fill();
    }

    _groundCanvas = c;
    return c;
  }

  function drawGround(ctx, view) {
    var c = getGroundCanvas();
    if (c) {
      ctx.drawImage(c, view.x, view.y, view.w, view.h, view.x, view.y, view.w, view.h);
      return;
    }
    ctx.fillStyle = '#e2ebf7';
    ctx.fillRect(view.x, view.y, view.w, view.h);
  }

  // ============================================================
  // 建筑绘本式重绘
  // ============================================================
  function drawWindows(ctx, b, wallTop, t) {
    var glow = 0.75 + 0.25 * Math.sin(t / 500 + b.x);
    [[b.x + 26, wallTop + 26], [b.x + b.w - 60, wallTop + 26]].forEach(function (w) {
      drawGlow(ctx, w[0] + 17, w[1] + 15, 'rgba(255,205,110,.6)', 44, 0.65 * glow);
      box(ctx, w[0] - 4, w[1] - 4, 42, 38, '#5b3d29', { r: 3 });
      ctx.fillStyle = '#ffd77a';
      ctx.fillRect(w[0], w[1], 34, 30);
      ctx.fillStyle = 'rgba(150,80,40,.45)';
      ctx.fillRect(w[0], w[1], 7, 30); ctx.fillRect(w[0] + 27, w[1], 7, 30);
      ctx.fillStyle = 'rgba(110,64,30,.55)';
      ctx.fillRect(w[0] + 9, w[1] + 18, 16, 12);
      ctx.fillStyle = '#5b3d29';
      ctx.fillRect(w[0] + 15, w[1], 4, 30); ctx.fillRect(w[0], w[1] + 13, 34, 4);
      ctx.fillStyle = 'rgba(255,255,255,.65)';
      ctx.fillRect(w[0] + 3, w[1] + 3, 11, 5);
      box(ctx, w[0] - 6, w[1] + 30, 46, 6, '#7a5236', { r: 2 });
      ctx.fillStyle = '#f2f7fd'; ctx.fillRect(w[0] - 6, w[1] + 28, 46, 3);
      box(ctx, w[0] + 6, w[1] + 22, 22, 8, '#8a5a3a', { r: 2, outline: false });
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(w[0] + 9, w[1] + 18, 3, 4); ctx.fillRect(w[0] + 15, w[1] + 17, 3, 5); ctx.fillRect(w[0] + 21, w[1] + 19, 3, 3);
      ctx.fillStyle = '#2f7a3a';
      ctx.fillRect(w[0] + 10, w[1] + 22, 2, 3); ctx.fillRect(w[0] + 16, w[1] + 22, 2, 3); ctx.fillRect(w[0] + 22, w[1] + 22, 2, 3);
    });
  }

  function drawDoor(ctx, b, wallTop, wallH, t) {
    var dx = b.x + b.w / 2 - 20, dy = wallTop + wallH - 52;
    box(ctx, dx - 5, dy - 5, 50, 57, '#4a3020', { r: 4 });
    ctx.fillStyle = '#6b4a2f';
    ctx.beginPath();
    ctx.moveTo(dx, dy + 52); ctx.lineTo(dx, dy + 12);
    ctx.quadraticCurveTo(dx + 20, dy - 6, dx + 40, dy + 12);
    ctx.lineTo(dx + 40, dy + 52); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(40,24,12,.4)';
    ctx.beginPath(); ctx.moveTo(dx + 12, dy + 8); ctx.lineTo(dx + 12, dy + 50); ctx.moveTo(dx + 28, dy + 8); ctx.lineTo(dx + 28, dy + 50); ctx.stroke();
    ball(ctx, dx + 33, dy + 28, 3, '#f0c040', { hi: true });
    ctx.strokeStyle = '#2f7a3a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(dx + 20, dy + 10, 9, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#3c9b52'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(dx + 20, dy + 10, 9, 0.6, 2.6); ctx.stroke();
    ball(ctx, dx + 20, dy + 20, 2.5, '#c0392b', { outline: false });
    ball(ctx, dx + 14, dy + 5, 2, '#f0c040', { outline: false });
    ball(ctx, dx + 26, dy + 5, 2, '#f0c040', { outline: false });
    var flick = 0.8 + 0.2 * Math.sin(t / 350 + b.x);
    drawGlow(ctx, dx - 12, dy - 2, 'rgba(255,205,110,.55)', 22, flick);
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(dx - 15, dy - 8, 6, 9);
    ctx.fillStyle = '#ffe08a'; ctx.fillRect(dx - 14, dy - 6, 4, 5);
    box(ctx, dx - 8, dy + 52, 56, 6, '#9aa8be', { r: 2 });
    ctx.fillStyle = '#f2f7fd'; ctx.fillRect(dx - 8, dy + 52, 56, 2);
  }

  function drawSign(ctx, b, wallTop) {
    var cx2 = b.x + b.w / 2;
    ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx2 - 30, wallTop - 24); ctx.lineTo(cx2 - 30, wallTop - 12);
    ctx.moveTo(cx2 + 30, wallTop - 24); ctx.lineTo(cx2 + 30, wallTop - 12); ctx.stroke();
    box(ctx, cx2 - 48, wallTop - 14, 96, 22, '#7a5236', { r: 4, oc: OUT });
    ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx2 - 44, wallTop - 11, 88, 16, 3); else ctx.rect(cx2 - 44, wallTop - 11, 88, 16);
    ctx.stroke();
    ctx.fillStyle = '#f4ead8';
    ctx.font = 'bold 12px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, cx2, wallTop + 2);
  }

  function drawBuilding(ctx, b, t) {
    var wallTop = b.y + 34, wallH = b.h - 34;
    shadow(ctx, b.x + b.w / 2, b.y + b.h + 10, b.w * 0.56, 14);
    box(ctx, b.x, wallTop, b.w, wallH, b.wall, { shade: true, hi: true });
    box(ctx, b.x - 3, wallTop + wallH - 10, b.w + 6, 12, '#8a8f9c', { r: 2 });
    ctx.fillStyle = 'rgba(60,60,70,.35)';
    for (var st = 0; st < b.w; st += 26) ctx.fillRect(b.x + 3 + st, wallTop + wallH - 8, 20, 2);

    if (b.kind === 'cabin') {
      for (var ly = wallTop + 12; ly < wallTop + wallH - 14; ly += 13) {
        ctx.strokeStyle = 'rgba(58,36,20,.4)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(b.x + 4, ly); ctx.lineTo(b.x + b.w - 4, ly); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,228,190,.22)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(b.x + 4, ly - 3); ctx.lineTo(b.x + b.w - 4, ly - 3); ctx.stroke();
      }
      ctx.strokeStyle = '#6b452c'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(b.x + 18, wallTop + 4); ctx.lineTo(b.x + 66, wallTop + wallH - 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.x + b.w - 18, wallTop + 4); ctx.lineTo(b.x + b.w - 66, wallTop + wallH - 16); ctx.stroke();
      ctx.strokeStyle = '#8a5c3a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x + 18, wallTop + 4); ctx.lineTo(b.x + 66, wallTop + wallH - 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.x + b.w - 18, wallTop + 4); ctx.lineTo(b.x + b.w - 66, wallTop + wallH - 16); ctx.stroke();
    }
    if (b.kind === 'cafe') {
      for (var aw = 0; aw < b.w; aw += 25) {
        ctx.fillStyle = (aw / 25) % 2 === 0 ? '#c0392b' : '#f4ead8';
        ctx.beginPath();
        ctx.moveTo(b.x + aw, wallTop - 6); ctx.lineTo(b.x + aw + 25, wallTop - 6);
        ctx.lineTo(b.x + aw + 21, wallTop + 12);
        ctx.quadraticCurveTo(b.x + aw + 12.5, wallTop + 18, b.x + aw + 4, wallTop + 12);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(b.x + 40, wallTop + 22); ctx.lineTo(b.x + 40, wallTop + 36); ctx.stroke();
      box(ctx, b.x + 26, wallTop + 36, 28, 24, '#f4ead8', { r: 4 });
      ctx.fillStyle = '#8a5a3a';
      ctx.fillRect(b.x + 32, wallTop + 41, 12, 10);
      ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x + 46, wallTop + 45, 4, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = 'rgba(200,200,210,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(b.x + 36, wallTop + 38); ctx.quadraticCurveTo(b.x + 38, wallTop + 35, b.x + 36, wallTop + 33);
      ctx.moveTo(b.x + 41, wallTop + 38); ctx.quadraticCurveTo(b.x + 43, wallTop + 35, b.x + 41, wallTop + 33); ctx.stroke();
      box(ctx, b.x + b.w - 58, wallTop + wallH + 14, 34, 8, '#8a5c3a', { r: 2 });
      ctx.fillStyle = '#6b452c'; ctx.fillRect(b.x + b.w - 54, wallTop + wallH + 22, 4, 8); ctx.fillRect(b.x + b.w - 26, wallTop + wallH + 22, 4, 8);
      ball(ctx, b.x + b.w - 66, wallTop + wallH + 12, 5, '#c0392b', { outline: false });
      ball(ctx, b.x + b.w - 16, wallTop + wallH + 12, 5, '#c0392b', { outline: false });
    }
    if (b.kind === 'shop') {
      var wx = b.x + 26, wy = wallTop + 30;
      box(ctx, wx - 5, wy - 5, b.w - 42, 74, '#3a3450', { r: 6 });
      var gcolors = ['#e0563f', '#f0a83c', '#58b368', '#4f86d6', '#c86bb1'];
      for (var gi = 0; gi < 5; gi++) {
        var gx = wx + 12 + gi * ((b.w - 90) / 4);
        box(ctx, gx, wy + 34, 22, 20, gcolors[gi], { r: 2, outline: false });
        ctx.fillStyle = '#f4ead8'; ctx.fillRect(gx + 9, wy + 34, 3.5, 20); ctx.fillRect(gx, wy + 42, 22, 3.5);
      }
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(wx + 24, wy + 8, 10, 14); ctx.fillRect(wx + 24, wy + 20, 16, 6);
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(wx + 24, wy + 6, 10, 4);
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.beginPath(); ctx.moveTo(wx + 10, wy + 66); ctx.lineTo(wx + 60, wy - 2); ctx.lineTo(wx + 74, wy - 2); ctx.lineTo(wx + 24, wy + 66); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c9b8e8'; ctx.lineWidth = 3;
      ctx.strokeRect(wx - 5, wy - 5, b.w - 42, 74);
      ctx.fillStyle = '#c0392b'; ctx.fillRect(b.x + b.w - 66, wallTop - 2, 12, 18); ctx.fillRect(b.x + b.w - 66, wallTop + 14, 18, 7);
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(b.x + b.w - 66, wallTop - 5, 12, 4);
    }
    if (b.kind === 'stall') {
      box(ctx, b.x + 8, wallTop + 26, b.w - 16, 18, '#8a5c3a', { r: 2 });
      for (var st2 = 0; st2 < b.w; st2 += 20) {
        ctx.fillStyle = (st2 / 20) % 2 === 0 ? '#c0392b' : '#f4ead8';
        ctx.beginPath();
        ctx.moveTo(b.x + st2, b.y + 26); ctx.lineTo(b.x + st2 + 20, b.y + 26);
        ctx.lineTo(b.x + st2 + 17, b.y + 42);
        ctx.quadraticCurveTo(b.x + st2 + 10, b.y + 48, b.x + st2 + 3, b.y + 42);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
      }
      box(ctx, b.x + 14, wallTop + 8, 26, 20, '#e0563f', { r: 2, outline: false });
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(b.x + 25, wallTop + 8, 4, 20); ctx.fillRect(b.x + 14, wallTop + 16, 26, 4);
      box(ctx, b.x + 58, wallTop + 12, 20, 16, '#58b368', { r: 2, outline: false });
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(b.x + 66, wallTop + 12, 3, 16);
      box(ctx, b.x + 100, wallTop + 10, 24, 18, '#f0a83c', { r: 2, outline: false });
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(b.x + 110, wallTop + 10, 3.5, 18); ctx.fillRect(b.x + 100, wallTop + 17, 24, 3.5);
    }

    if (b.kind === 'greenhouse') {
      // 玻璃反光斜带
      ctx.fillStyle = 'rgba(255,255,255,.30)';
      ctx.beginPath();
      ctx.moveTo(b.x + 12, wallTop + wallH - 8); ctx.lineTo(b.x + 74, wallTop + 6);
      ctx.lineTo(b.x + 102, wallTop + 6); ctx.lineTo(b.x + 42, wallTop + wallH - 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.beginPath();
      ctx.moveTo(b.x + 110, wallTop + wallH - 8); ctx.lineTo(b.x + 146, wallTop + 6);
      ctx.lineTo(b.x + 158, wallTop + 6); ctx.lineTo(b.x + 108, wallTop + wallH - 8);
      ctx.closePath(); ctx.fill();
      // 白色格棂
      ctx.strokeStyle = '#eef6fb'; ctx.lineWidth = 2.5;
      for (var gm = 1; gm < 5; gm++) {
        ctx.beginPath(); ctx.moveTo(b.x + gm * b.w / 5, wallTop + 4); ctx.lineTo(b.x + gm * b.w / 5, wallTop + wallH - 12); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(b.x + 4, wallTop + wallH * 0.5); ctx.lineTo(b.x + b.w - 4, wallTop + wallH * 0.5); ctx.stroke();
      // 玻璃后的暖光与植物
      drawGlow(ctx, b.x + b.w / 2, wallTop + wallH * 0.55, 'rgba(190,255,170,.35)', 70, 0.8);
      for (var pl = 0; pl < 4; pl++) {
        var pgx = b.x + 26 + pl * 40, pgy = wallTop + wallH - 30;
        box(ctx, pgx, pgy, 28, 14, '#8a5a3a', { r: 2 });
        ctx.fillStyle = '#2b7047';
        ctx.beginPath(); ctx.arc(pgx + 14, pgy - 8, 11, 0, 7); ctx.fill();
        ctx.fillStyle = '#35845a';
        ctx.beginPath(); ctx.arc(pgx + 8, pgy - 13, 6, 0, 7); ctx.arc(pgx + 20, pgy - 11, 5, 0, 7); ctx.fill();
        ball(ctx, pgx + 14, pgy - 18, 2.4, '#e0563f', { outline: false });
      }
      // 檐口挂着的星饰
      ball(ctx, b.x + 24, wallTop - 4, 4, '#f0c040', { hi: false });
      ball(ctx, b.x + b.w - 24, wallTop - 4, 4, '#f0c040', { hi: false });
    }
    if (b.kind === 'workshop') {
      // 大工作窗（带暖光）+ 工具墙 + 木料堆
      box(ctx, b.x + 30, wallTop + 22, b.w - 96, 64, '#5b3d29', { r: 3 });
      ctx.fillStyle = '#ffd77a'; ctx.fillRect(b.x + 36, wallTop + 28, b.w - 108, 52);
      drawGlow(ctx, b.x + b.w / 2 - 10, wallTop + 54, 'rgba(255,205,110,.55)', 70, 0.9);
      ctx.fillStyle = '#5b3d29';
      ctx.fillRect(b.x + b.w / 2 - 12, wallTop + 28, 4, 52);
      ctx.fillRect(b.x + 36, wallTop + 52, b.w - 108, 4);
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.fillRect(b.x + 40, wallTop + 32, 14, 8);
      // 影子里的小人剪影（工作台）
      ctx.fillStyle = 'rgba(90,60,30,.45)';
      ctx.fillRect(b.x + b.w / 2 + 6, wallTop + 60, 26, 20);
      // 工具：锯子 + 锤子
      ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x + b.w - 52, wallTop + 20); ctx.lineTo(b.x + b.w - 52, wallTop + 52); ctx.stroke();
      ctx.fillStyle = '#9aa8be';
      ctx.beginPath(); ctx.moveTo(b.x + b.w - 58, wallTop + 20); ctx.lineTo(b.x + b.w - 34, wallTop + 20);
      ctx.lineTo(b.x + b.w - 40, wallTop + 30); ctx.lineTo(b.x + b.w - 52, wallTop + 30); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7a8496'; ctx.lineWidth = 1;
      for (var tw = 0; tw < 4; tw++) {
        ctx.beginPath(); ctx.moveTo(b.x + b.w - 56 + tw * 6, wallTop + 20); ctx.lineTo(b.x + b.w - 54 + tw * 6, wallTop + 30); ctx.stroke();
      }
      ctx.fillStyle = '#8a6244'; ctx.fillRect(b.x + b.w - 76, wallTop + 24, 4, 24);
      ctx.fillStyle = '#9aa8be'; ctx.fillRect(b.x + b.w - 80, wallTop + 18, 12, 9);
      // 木料堆（门口左侧）
      for (var lw = 0; lw < 3; lw++) {
        box(ctx, b.x + 18, wallTop + wallH - 22 - lw * 9, 34, 9, '#b8906a', { r: 2, outline: false });
        ctx.fillStyle = '#d8b088'; ctx.fillRect(b.x + 50, wallTop + wallH - 22 - lw * 9, 3, 9);
      }
      // 烟囱白烟
      var wsx = b.x + b.w - 44;
      box(ctx, wsx, b.y - 18, 14, 32, '#6b4a2f', { outline: false });
      for (var wp2 = 0; wp2 < 3; wp2++) {
        var ph2 = (t / 800 + wp2 * 0.35) % 1;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.35 * (1 - ph2)) + ')';
        ctx.beginPath();
        ctx.arc(wsx + 7 + Math.sin(ph2 * 6 + wp2) * 7, b.y - 26 - ph2 * 40, 5 + ph2 * 9, 0, 7);
        ctx.fill();
      }
    }

    // 雪顶 + 屋檐冰柱
    ctx.fillStyle = '#f2f7fd';
    ctx.fillRect(b.x - 8, b.y + 18, b.w + 16, 20);
    ctx.fillStyle = b.roof;
    ctx.beginPath();
    ctx.moveTo(b.x - 14, b.y + 22);
    ctx.lineTo(b.x + b.w / 2, b.y - 30);
    ctx.lineTo(b.x + b.w + 14, b.y + 22);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(40,24,12,.22)'; ctx.lineWidth = 1;
    for (var rl = 1; rl < 4; rl++) {
      ctx.beginPath();
      ctx.moveTo(b.x - 12 + rl * 2, b.y + 20 - rl * 2);
      ctx.lineTo(b.x + b.w / 2, b.y - 30 + rl * 14);
      ctx.lineTo(b.x + b.w + 12 - rl * 2, b.y + 20 - rl * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#f2f7fd';
    ctx.beginPath();
    ctx.moveTo(b.x + b.w / 2, b.y - 30);
    ctx.lineTo(b.x + b.w / 2 - 32, b.y + 2);
    ctx.lineTo(b.x + b.w / 2 - 18, b.y - 6);
    ctx.lineTo(b.x + b.w / 2 - 4, b.y + 3);
    ctx.lineTo(b.x + b.w / 2 + 10, b.y - 6);
    ctx.lineTo(b.x + b.w / 2 + 24, b.y + 1);
    ctx.lineTo(b.x + b.w / 2 + 36, b.y - 3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(200,225,250,.9)';
    for (var ic = 0; ic < 6; ic++) {
      var ix = b.x + 14 + ic * (b.w - 28) / 5;
      var il = 5 + (ic % 3) * 4;
      ctx.beginPath();
      ctx.moveTo(ix - 2.5, b.y + 38); ctx.lineTo(ix + 2.5, b.y + 38); ctx.lineTo(ix, b.y + 38 + il);
      ctx.closePath(); ctx.fill();
    }

    if (b.kind === 'cabin' || b.kind === 'cafe') {
      var chx = b.x + b.w - 46;
      box(ctx, chx, b.y - 22, 16, 36, '#6b4a2f', { outline: false });
      ctx.fillStyle = '#8a6a4a'; ctx.fillRect(chx + 2, b.y - 22, 3, 36);
      box(ctx, chx - 3, b.y - 27, 22, 8, '#f2f7fd', { r: 2, outline: false });
      for (var i = 0; i < 3; i++) {
        var ph = (t / 900 + i * 0.4) % 1;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.4 * (1 - ph)) + ')';
        ctx.beginPath();
        ctx.arc(chx + 8 + Math.sin(ph * 6 + i) * 8, b.y - 34 - ph * 46, 6 + ph * 10, 0, 7);
        ctx.fill();
      }
    }

    if (b.kind !== 'greenhouse') drawWindows(ctx, b, wallTop, t);
    drawDoor(ctx, b, wallTop, wallH, t);
    drawSign(ctx, b, wallTop);

    if (b.kind === 'shop' || b.kind === 'stall' || b.kind === 'cafe') {
      var colors = ['#e0563f', '#f0a83c', '#58b368', '#4f86d6'];
      for (var j = 0; j < 9; j++) {
        var on = Math.sin(t / 300 + j * 1.7) > -0.3;
        var lx = b.x + 14 + j * (b.w - 28) / 8;
        if (on) drawGlow(ctx, lx + 3, wallTop - 3, 'rgba(255,220,140,.5)', 12, 0.7);
        ball(ctx, lx + 3, wallTop - 3, 3.4, on ? colors[j % 4] : 'rgba(120,120,140,.4)', { hi: false, outline: false });
      }
    }
  }

  // ============================================================
  // 小镇道具
  // ============================================================
  function drawProps(ctx, t) {
    props.forEach(function (p) {
      if (p.kind === 'crate') {
        shadow(ctx, p.x + 11, p.y + 20, 14, 4);
        box(ctx, p.x, p.y - 20, 24, 20, '#a87b48', { r: 2 });
        ctx.strokeStyle = 'rgba(60,38,22,.5)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p.x + 2, p.y - 10); ctx.lineTo(p.x + 22, p.y - 10); ctx.stroke();
        ctx.fillStyle = '#f2f7fd'; ctx.fillRect(p.x, p.y - 22, 24, 3);
      } else if (p.kind === 'giftbox') {
        shadow(ctx, p.x + 9, p.y + 14, 11, 3.5);
        box(ctx, p.x, p.y - 4, 18, 16, p.c || '#e0563f', { r: 2 });
        ctx.fillStyle = '#f4ead8'; ctx.fillRect(p.x + 7.5, p.y - 4, 3, 16); ctx.fillRect(p.x, p.y + 2, 18, 3);
        ctx.fillStyle = '#f4ead8';
        ctx.beginPath(); ctx.arc(p.x + 9, p.y - 6, 3, 0, 7); ctx.fill();
      } else if (p.kind === 'barrel') {
        shadow(ctx, p.x + 10, p.y + 4, 12, 4);
        box(ctx, p.x, p.y - 26, 20, 28, '#8a6244', { r: 6 });
        ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p.x + 1, p.y - 18); ctx.lineTo(p.x + 19, p.y - 18);
        ctx.moveTo(p.x + 1, p.y - 8); ctx.lineTo(p.x + 19, p.y - 8); ctx.stroke();
        ctx.fillStyle = '#f2f7fd'; ctx.fillRect(p.x, p.y - 28, 20, 3);
      } else if (p.kind === 'signpost') {
        ctx.fillStyle = '#8a5c3a'; ctx.fillRect(p.x - 2.5, p.y - 34, 5, 36);
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.strokeRect(p.x - 2.5, p.y - 34, 5, 36);
        box(ctx, p.x + 2, p.y - 32, 34, 12, '#c9a06a', { r: 2 });
        ctx.fillStyle = '#5b3d29'; ctx.font = '8px "PingFang SC", sans-serif'; ctx.textAlign = 'left';
        ctx.fillText('广场 →', p.x + 6, p.y - 23);
        box(ctx, p.x - 36, p.y - 18, 34, 12, '#c9a06a', { r: 2 });
        ctx.fillStyle = '#5b3d29'; ctx.textAlign = 'right';
        ctx.fillText('← 咖啡', p.x - 6, p.y - 9);
        box(ctx, p.x + 2, p.y - 6, 34, 12, '#c9a06a', { r: 2 });
        ctx.fillStyle = '#5b3d29'; ctx.textAlign = 'left';
        ctx.fillText('池塘 ↓', p.x + 6, p.y + 3);
        ctx.fillStyle = '#f2f7fd'; ctx.fillRect(p.x - 4, p.y - 38, 9, 3);
      } else if (p.kind === 'mailbox') {
        shadow(ctx, p.x + 6, p.y + 16, 8, 3);
        ctx.fillStyle = '#6b452c'; ctx.fillRect(p.x - 2, p.y - 8, 4, 24);
        box(ctx, p.x - 8, p.y - 22, 16, 15, '#2f6b9b', { r: 6 });
        ctx.fillStyle = '#f0c040'; ctx.fillRect(p.x + 4, p.y - 16, 3, 3);
        ctx.fillStyle = '#f2f7fd'; ctx.fillRect(p.x - 8, p.y - 24, 16, 3);
      } else if (p.kind === 'minitree') {
        shadow(ctx, p.x, p.y + 4, 12, 3.5);
        ctx.fillStyle = '#5b3d29'; ctx.fillRect(p.x - 2.5, p.y - 4, 5, 8);
        ctx.fillStyle = '#2b7047';
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 30); ctx.lineTo(p.x - 14, p.y - 2); ctx.lineTo(p.x + 14, p.y - 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#35845a';
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 22); ctx.lineTo(p.x - 10, p.y - 8); ctx.lineTo(p.x + 10, p.y - 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f2f7fd';
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 30); ctx.lineTo(p.x - 7, p.y - 18); ctx.lineTo(p.x + 7, p.y - 18); ctx.closePath(); ctx.fill();
        ball(ctx, p.x + 4, p.y - 10, 2, '#e0563f', { outline: false });
        ball(ctx, p.x - 4, p.y - 14, 2, '#f0a83c', { outline: false });
      } else if (p.kind === 'flagstring') {
        var x1 = p.x1, y1 = p.y1 - 40, x2 = p.x2, y2 = p.y2 - 40;
        ctx.strokeStyle = 'rgba(90,60,30,.8)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, y1 + 16, x2, y2); ctx.stroke();
        var colors = ['#e0563f', '#f0a83c', '#58b368', '#4f86d6'];
        for (var fi = 1; fi < 8; fi++) {
          var ft = fi / 8;
          var fx = x1 + (x2 - x1) * ft;
          var fy = y1 + (y2 - y1) * ft + Math.sin(ft * Math.PI) * 12;
          ctx.fillStyle = colors[fi % 4];
          ctx.beginPath();
          ctx.moveTo(fx - 5, fy); ctx.lineTo(fx + 5, fy); ctx.lineTo(fx, fy + 9);
          ctx.closePath(); ctx.fill();
        }
      }
    });
  }

  // ============================================================
  // 中央圣诞树（4 阶段，视觉核心）
  // 造型：五层冷杉，每层是一簇下垂的枝扇（外缘锯齿 + 枝尖积雪），
  //       层间错位、越往上越亮，树心透出暖光。
  // 阶段：0 小树苗 → 1 挂彩球 → 2 亮彩灯 → 3 全树点亮（金星/礼物/光柱）
  // ============================================================
  var TREE_TIERS = [
    { apex: -108, bot: 2, half: 104, tips: 9 },
    { apex: -172, bot: -72, half: 86, tips: 8 },
    { apex: -228, bot: -138, half: 68, tips: 7 },
    { apex: -276, bot: -196, half: 50, tips: 6 },
    { apex: -318, bot: -246, half: 33, tips: 5 }
  ];

  /* 层的外轮廓：两侧上是弧线，底缘是一排下垂的枝尖 */
  function firTierPath(ctx, cx, apexY, botY, halfW, tips) {
    var span = botY - apexY;
    var notchY = botY - Math.max(5, halfW * 0.12);
    var rX = cx + halfW * 0.94, lX = cx - halfW * 0.94;
    ctx.beginPath();
    ctx.moveTo(cx, apexY);
    ctx.bezierCurveTo(cx + halfW * 0.50, apexY + span * 0.13,
                      cx + halfW * 0.90, apexY + span * 0.40, rX, notchY);
    for (var j = 0; j < tips; j++) {
      var x0 = rX + (lX - rX) * (j / tips);
      var x1 = rX + (lX - rX) * ((j + 1) / tips);
      var xm = (x0 + x1) / 2 + (j % 2 ? 1.6 : -1.6);
      var tipY = botY + (halfW > 60 ? 5 : 2);
      ctx.quadraticCurveTo(x0 + (xm - x0) * 0.62, tipY - 3, xm, tipY);
      ctx.quadraticCurveTo(xm + (x1 - xm) * 0.38, tipY - 3, x1, notchY);
    }
    ctx.bezierCurveTo(cx - halfW * 0.90, apexY + span * 0.40,
                      cx - halfW * 0.50, apexY + span * 0.13, cx, apexY);
    ctx.closePath();
  }

  /* 只走底缘那条锯齿（用来压雪） */
  function firEdgePath(ctx, cx, botY, halfW, tips) {
    var notchY = botY - Math.max(5, halfW * 0.12);
    var rX = cx + halfW * 0.94, lX = cx - halfW * 0.94;
    ctx.beginPath();
    ctx.moveTo(rX, notchY);
    for (var j = 0; j < tips; j++) {
      var x0 = rX + (lX - rX) * (j / tips);
      var x1 = rX + (lX - rX) * ((j + 1) / tips);
      var xm = (x0 + x1) / 2 + (j % 2 ? 1.6 : -1.6);
      var tipY = botY + (halfW > 60 ? 5 : 2);
      ctx.quadraticCurveTo(x0 + (xm - x0) * 0.62, tipY - 3, xm, tipY);
      ctx.quadraticCurveTo(xm + (x1 - xm) * 0.38, tipY - 3, x1, notchY);
    }
  }

  /* u: -1(左) ~ 1(右) 在这一层表面取点；越靠外越靠近下垂的枝尖 */
  function tierPt(cx, apexY, botY, halfW, u) {
    var notchY = botY - Math.max(5, halfW * 0.12);
    var px = cx + halfW * 0.86 * u;
    var py = notchY + (botY - notchY) * (0.30 + 0.70 * u * u);
    return { x: px, y: py };
  }

  function firTier(ctx, cx, apexY, botY, halfW, tips, top, bottom, snowA, lit) {
    // 底部暗影（把层与层分开）
    ctx.save();
    ctx.translate(0, 6);
    firTierPath(ctx, cx, apexY, botY, halfW, tips);
    ctx.fillStyle = 'rgba(12,44,30,.42)';
    ctx.fill();
    ctx.restore();

    firTierPath(ctx, cx, apexY, botY, halfW, tips);
    var g = ctx.createLinearGradient(cx - halfW * 0.55, apexY, cx + halfW * 0.6, botY);
    g.addColorStop(0, top);
    g.addColorStop(0.55, bottom);
    g.addColorStop(1, 'rgba(16,54,36,1)');
    ctx.fillStyle = g;
    ctx.fill();

    // 枝纹：几道顺着层的浅弧
    ctx.save();
    firTierPath(ctx, cx, apexY, botY, halfW, tips);
    ctx.clip();
    ctx.strokeStyle = 'rgba(120,190,150,.16)';
    ctx.lineWidth = 1.2;
    for (var b = 1; b <= 3; b++) {
      var by = apexY + (botY - apexY) * (b / 3.4);
      ctx.beginPath();
      ctx.moveTo(cx - halfW * 0.92, by + 6);
      ctx.quadraticCurveTo(cx, by - 4, cx + halfW * 0.92, by + 6);
      ctx.stroke();
    }
    if (lit) {
      var lg2 = ctx.createRadialGradient(cx, apexY + (botY - apexY) * 0.55, 2, cx, apexY + (botY - apexY) * 0.55, halfW * 0.95);
      lg2.addColorStop(0, 'rgba(255,214,130,.20)');
      lg2.addColorStop(1, 'rgba(255,214,130,0)');
      ctx.fillStyle = lg2;
      ctx.fillRect(cx - halfW, apexY - 4, halfW * 2, botY - apexY + 8);
    }
    ctx.restore();

    // 左侧月光边：给圆锥一点体积
    ctx.save();
    firTierPath(ctx, cx, apexY, botY, halfW, tips);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(cx - halfW * 0.95, botY);
    ctx.quadraticCurveTo(cx - halfW * 0.55, apexY + (botY - apexY) * 0.25, cx - halfW * 0.02, apexY - 2);
    ctx.lineTo(cx - halfW * 0.30, apexY - 2);
    ctx.quadraticCurveTo(cx - halfW * 0.86, apexY + (botY - apexY) * 0.32, cx - halfW * 1.1, botY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(180,232,200,.13)';
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(16,58,40,.45)';
    ctx.lineWidth = 1.2;
    firTierPath(ctx, cx, apexY, botY, halfW, tips);
    ctx.stroke();

    // 积雪：沿外露枝尖压一道白，越靠外越厚
    if (snowA > 0) {
      firEdgePath(ctx, cx, botY, halfW, tips);
      ctx.strokeStyle = 'rgba(250,253,255,' + Math.min(1, snowA * 0.55 + 0.42) + ')';
      ctx.lineWidth = Math.max(2.6, halfW * 0.048);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      // 枝尖的雪团只在靠外的一半，避免整排白点
      var rX = cx + halfW * 0.86, lX = cx - halfW * 0.86;
      for (var j3 = 0; j3 < tips; j3++) {
        var uu = (j3 + 0.5) / tips;
        if (Math.abs(uu - 0.5) < 0.20) continue;
        var px3 = rX + (lX - rX) * uu;
        ctx.beginPath();
        ctx.ellipse(px3, botY - Math.max(1.6, halfW * 0.03), Math.max(3.0, halfW * 0.075), Math.max(2.0, halfW * 0.048), 0, 0, 7);
        ctx.fillStyle = 'rgba(252,254,255,' + Math.min(1, snowA * 0.5 + 0.48) + ')';
        ctx.fill();
      }
      var rX = cx + halfW * 0.86, lX = cx - halfW * 0.86;
      for (var j2 = 0; j2 < tips; j2++) {
        var px = rX + (lX - rX) * ((j2 + 0.5) / tips);
        ctx.beginPath();
        ctx.ellipse(px, botY - Math.max(2, halfW * 0.035), Math.max(3.4, halfW * 0.085), Math.max(2.2, halfW * 0.055), 0, 0, 7);
        ctx.fillStyle = 'rgba(252,254,255,' + Math.min(1, snowA + 0.1) + ')';
        ctx.fill();
      }
    }
  }

  /* 彩球：金盖 + 提环 + 高光 + 落影 */
  function ornament(ctx, x, y, r, col) {
    ctx.beginPath();
    ctx.ellipse(x + r * 0.18, y + r * 0.9, r * 0.85, r * 0.42, 0, 0, 7);
    ctx.fillStyle = 'rgba(10,40,26,.35)';
    ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
    var g = ctx.createRadialGradient(x - r * 0.34, y - r * 0.4, r * 0.15, x, y, r * 1.15);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.28, col);
    g.addColorStop(1, 'rgba(40,20,10,.55)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(58,32,16,.55)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.42, y - r * 0.95);
    ctx.lineTo(x + r * 0.42, y - r * 0.95);
    ctx.strokeStyle = '#e8c05a';
    ctx.lineWidth = Math.max(1.2, r * 0.34);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - r * 1.12, r * 0.24, 0, 7);
    ctx.strokeStyle = '#f2d478';
    ctx.lineWidth = Math.max(0.9, r * 0.2);
    ctx.stroke();
  }

  /* 灯串：沿层的表面垂一道弧，等距挂灯泡 */
  function garland(ctx, cx, apexY, botY, halfW, t, phase, bright) {
    var a = tierPt(cx, apexY, botY, halfW, -0.78);
    var b = tierPt(cx, apexY, botY, halfW, 0.78);
    var dip = Math.min(14, (botY - apexY) * 0.30);
    var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + dip };
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mid.x, mid.y + 6, b.x, b.y);
    ctx.strokeStyle = 'rgba(240,204,120,.55)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    var N = 5;
    for (var i = 0; i <= N; i++) {
      var u = i / N;
      var iu = 1 - u;
      var px = iu * iu * a.x + 2 * iu * u * mid.x + u * u * b.x;
      var py = iu * iu * a.y + 2 * iu * u * (mid.y + 6) + u * u * b.y;
      var on = Math.sin(t / 240 + i * 0.9 + phase) > -0.35;
      var col = ['#ffe49a', '#9ad8ff', '#ff9f9a', '#c2ff9e', '#ffd0f2'][(i + Math.round(phase)) % 5];
      if (on) drawGlow(ctx, px, py + 2, 'rgba(255,232,150,' + (bright * 0.85) + ')', 11, 0.9);
      ctx.beginPath();
      ctx.ellipse(px, py + 2.5, 2.6, 3.2, 0, 0, 7);
      ctx.fillStyle = on ? col : 'rgba(146,158,180,.55)';
      ctx.fill();
      if (on) {
        ctx.beginPath();
        ctx.arc(px - 0.7, py + 1.6, 1.0, 0, 7);
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.fill();
      }
    }
  }

  /* 顶星：五角 + 长芒 + 呼吸光 */
  function treeStar(ctx, x, y, R, t, mode) {
    var pulse = 0.86 + 0.14 * Math.sin(t / 380);
    if (mode >= 1) {
      // 长芒
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 4; i++) {
        var ang = i * Math.PI / 4 + Math.PI / 8;
        var len = R * (2.5 + (i % 2 ? 1.1 : 0)) * pulse;
        var gg = ctx.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        gg.addColorStop(0, 'rgba(255,228,150,.5)');
        gg.addColorStop(1, 'rgba(255,228,150,0)');
        ctx.strokeStyle = gg;
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        ctx.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.restore();
      drawGlow(ctx, x, y, 'rgba(255,220,130,.55)', R * 5.4 * pulse, 0.9);
    }
    var pts = [], k = 5;
    for (var j = 0; j < k * 2; j++) {
      var rr = (j % 2 === 0) ? R : R * 0.40;
      var aa = -Math.PI / 2 + j * Math.PI / k;
      pts.push([x + Math.cos(aa) * rr, y + Math.sin(aa) * rr]);
    }
    ctx.beginPath();
    pts.forEach(function (p2, i2) { if (i2 === 0) ctx.moveTo(p2[0], p2[1]); else ctx.lineTo(p2[0], p2[1]); });
    ctx.closePath();
    var sg = ctx.createLinearGradient(x, y - R, x, y + R);
    if (mode >= 1) { sg.addColorStop(0, '#fff6cf'); sg.addColorStop(0.45, '#ffd75e'); sg.addColorStop(1, '#e6a534'); }
    else { sg.addColorStop(0, '#fbf7ea'); sg.addColorStop(1, '#cfc6a8'); }
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.strokeStyle = mode >= 1 ? '#d99a2e' : '#8a6b3c';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    if (mode >= 1) {
      ctx.beginPath();
      ctx.arc(x - R * 0.18, y - R * 0.22, R * 0.20, 0, 7);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fill();
    }
  }

  function giftBox(ctx, gx, gy, w, h, col, ribbon) {
    shadow(ctx, gx + w / 2, gy + h + 3, w * 0.6, 4);
    box(ctx, gx, gy, w, h, col, { r: 2, shade: true });
    ctx.fillStyle = ribbon;
    ctx.fillRect(gx + w / 2 - 2.5, gy, 5, h);
    ctx.fillRect(gx, gy + h * 0.42, w, 5);
    ctx.strokeStyle = 'rgba(60,30,10,.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(gx + w / 2 - 2.5, gy, 5, h);
    // 蝴蝶结
    ctx.beginPath();
    ctx.ellipse(gx + w / 2 - 4.5, gy - 3, 4.6, 3.2, -0.5, 0, 7);
    ctx.ellipse(gx + w / 2 + 4.5, gy - 3, 4.6, 3.2, 0.5, 0, 7);
    ctx.fillStyle = ribbon;
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,30,10,.35)';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(gx + w / 2, gy - 3, 2.2, 2.2, 0, 0, 7);
    ctx.fillStyle = ribbon;
    ctx.fill();
  }

  function drawBigTree(ctx, tree, stage, t) {
    var x = tree.x, y = tree.y;
    var lit = stage >= 2, full = stage >= 3;

    // ---- 地面光影 ----
    if (lit) {
      var pool = ctx.createRadialGradient(x, y + 8, 10, x, y + 8, 190);
      pool.addColorStop(0, 'rgba(255,214,132,' + (full ? 0.34 : 0.22) + ')');
      pool.addColorStop(0.55, 'rgba(255,196,110,' + (full ? 0.13 : 0.07) + ')');
      pool.addColorStop(1, 'rgba(255,196,110,0)');
      ctx.fillStyle = pool;
      ctx.save();
      ctx.translate(x, y + 8);
      ctx.scale(1, 0.42);
      ctx.beginPath(); ctx.arc(0, 0, 190, 0, 7); ctx.fill();
      ctx.restore();
    }

    if (stage === 0) {
      drawSapling(ctx, x, y, t);
      return;
    }

    // ---- 树后的暖晕（点亮后才有）----
    if (lit) {
      var halo = ctx.createRadialGradient(x, y - 190, 20, x, y - 190, 250);
      halo.addColorStop(0, 'rgba(255,206,120,' + (full ? 0.26 : 0.14) + ')');
      halo.addColorStop(0.6, 'rgba(255,190,110,' + (full ? 0.10 : 0.05) + ')');
      halo.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(x, y - 190, 250, 0, 7); ctx.fill();
    }

    // ---- 基座：雪堆 + 石圈 + 树干 ----
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 92, 24, 0, 0, 7);
    ctx.fillStyle = 'rgba(120,150,190,.22)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 84, 20, 0, 0, 7);
    var sgm = ctx.createLinearGradient(x - 84, y - 16, x + 84, y + 20);
    sgm.addColorStop(0, '#fdfeff');
    sgm.addColorStop(1, '#dfe9f6');
    ctx.fillStyle = sgm;
    ctx.fill();

    // 树干
    var tg = ctx.createLinearGradient(x - 9, 0, x + 9, 0);
    tg.addColorStop(0, '#8a5a38'); tg.addColorStop(0.4, '#6d4426'); tg.addColorStop(1, '#4d2f1a');
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 6);
    ctx.quadraticCurveTo(x - 7.5, y - 34, x - 6, y - 66);
    ctx.lineTo(x + 6, y - 66);
    ctx.quadraticCurveTo(x + 7.5, y - 34, x + 10, y + 6);
    ctx.closePath();
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(48,28,14,.6)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,24,12,.28)';
    ctx.lineWidth = 1;
    for (var bk = 0; bk < 3; bk++) {
      ctx.beginPath();
      ctx.moveTo(x - 6 + bk * 4, y - 10 - bk * 14);
      ctx.quadraticCurveTo(x - 4 + bk * 4, y - 30 - bk * 14, x - 5 + bk * 4, y - 52 - bk * 10);
      ctx.stroke();
    }

    // ---- 五层枝扇 ----
    var tops = ['#3f9060', '#437f57', '#3a8358', '#457f57', '#3f8d5f'];
    for (var i = 0; i < TREE_TIERS.length; i++) {
      var L = TREE_TIERS[i];
      firTier(ctx, x, y + L.apex, y + L.bot, L.half, L.tips,
        tops[i], i % 2 ? '#2a6b46' : '#2f744c', 0.62 + i * 0.09, lit);
    }

    // ---- 彩球（stage>=1） ----
    if (stage >= 1) {
      var cols = ['#dc4f3c', '#f0a83c', '#4f86d6', '#c86bb1', '#f2e2a8', '#58b368'];
      var plan = [
        [0, [-0.62, -0.16, 0.30, 0.68]],
        [1, [-0.70, -0.22, 0.26, 0.72]],
        [2, [-0.62, 0.10, 0.66]],
        [3, [-0.58, 0.34]],
        [4, [-0.30, 0.34]]
      ];
      var cIdx = 0;
      plan.forEach(function (row) {
        var Lr = TREE_TIERS[row[0]];
        row[1].forEach(function (u) {
          var pt = tierPt(x, y + Lr.apex, y + Lr.bot, Lr.half, u);
          var r = 5.4 - row[0] * 0.5 + (Math.abs(u) > 0.55 ? 0.6 : 0);
          var flick = full ? (0.6 + 0.4 * Math.sin(t / 520 + cIdx * 1.7)) : 1;
          if (stage >= 2) drawGlow(ctx, pt.x, pt.y, 'rgba(255,232,168,' + (0.34 * flick + 0.1) + ')', 13, 0.8);
          ornament(ctx, pt.x, pt.y, r, cols[cIdx % cols.length]);
          cIdx++;
        });
      });
    }

    // ---- 灯串（stage>=2） ----
    if (lit) {
      for (var gi = 0; gi < TREE_TIERS.length - 1; gi++) {
        var Lg = TREE_TIERS[gi];
        garland(ctx, x, y + Lg.apex, y + Lg.bot, Lg.half, t, gi * 1.7, full ? 1 : 0.72);
      }
    }

    // ---- 顶星 ----
    if (stage >= 2) {
      treeStar(ctx, x, y - 336, full ? 18 : 13, t, full ? 1 : 0);
    } else {
      // 未点亮的阶段：只插一根尖枝
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 316);
      ctx.lineTo(x, y - 336);
      ctx.lineTo(x + 3, y - 316);
      ctx.closePath();
      ctx.fillStyle = '#2f744c';
      ctx.fill();
    }

    // ---- 礼物（stage 3） ----
    if (full) {
      var gifts = [
        [x - 116, y + 4, 34, 26, '#d94c3a', '#f4ead8'],
        [x - 74, y + 16, 26, 20, '#4f86d6', '#eef4ff'],
        [x + 62, y + 12, 30, 23, '#58b368', '#f4ead8'],
        [x + 98, y + 2, 24, 19, '#f0a83c', '#7a3f2a'],
        [x + 12, y + 20, 22, 17, '#c86bb1', '#fff0f8']
      ];
      gifts.forEach(function (gf) { giftBox(ctx, gf[0], gf[1], gf[2], gf[3], gf[4], gf[5]); });
    }

    // ---- 光柱 + 星屑（stage 3） ----
    if (full) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var beam = ctx.createLinearGradient(x, y - 320, x, y + 10);
      beam.addColorStop(0, 'rgba(255,226,150,.20)');
      beam.addColorStop(1, 'rgba(255,226,150,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 326);
      ctx.lineTo(x + 14, y - 326);
      ctx.lineTo(x + 120, y + 12);
      ctx.lineTo(x - 120, y + 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      for (var sp = 0; sp < 14; sp++) {
        var a2 = (sp * 2.399) % (Math.PI * 2);
        var rr2 = 40 + ((sp * 37) % 120);
        var sx2 = x + Math.cos(a2) * rr2 * 0.85;
        var sy2 = y - 160 + Math.sin(a2) * rr2 * 1.25;
        var tw = 0.35 + 0.65 * Math.abs(Math.sin(t / 620 + sp * 1.1));
        ctx.beginPath();
        ctx.arc(sx2, sy2, 1.1 + tw * 1.5, 0, 7);
        ctx.fillStyle = 'rgba(255,246,205,' + (tw * 0.9) + ')';
        ctx.fill();
      }
    }
  }

  /* 阶段 0：还没装饰的小树苗 */
  function drawSapling(ctx, x, y, t) {
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 46, 13, 0, 0, 7);
    ctx.fillStyle = 'rgba(120,150,190,.20)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 40, 11, 0, 0, 7);
    ctx.fillStyle = '#eef5fd';
    ctx.fill();

    // 细枝
    ctx.strokeStyle = '#6d4426';
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + 4);
    ctx.quadraticCurveTo(x - 2, y - 30, x + 1, y - 66);
    ctx.stroke();

    // 三小簇枝叶
    var tiers = [
      { ay: -72, by: -16, hw: 38, tips: 6 },
      { ay: -104, by: -64, hw: 29, tips: 5 },
      { ay: -132, by: -96, hw: 20, tips: 4 }
    ];
    tiers.forEach(function (T, i) {
      firTier(ctx, x + (i === 1 ? 1 : 0), y + T.ay, y + T.by, T.hw, T.tips,
        '#5aa377', '#3d8158', 0.42, false);
    });

    // 未挂任何装饰，只在树根放一小团雪人和待用的木箱
    box(ctx, x - 46, y - 14, 26, 18, '#a9793f', { r: 2, shade: true });
    ctx.fillStyle = '#f2f7fd';
    ctx.fillRect(x - 46, y - 16, 26, 4);
    ctx.strokeStyle = 'rgba(60,38,22,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 40, y - 10); ctx.lineTo(x - 26, y - 10);
    ctx.moveTo(x - 40, y - 5); ctx.lineTo(x - 26, y - 5);
    ctx.stroke();

    // 一点暖光，表示"在等你们来点亮"
    var p = 0.5 + 0.5 * Math.sin(t / 900);
    drawGlow(ctx, x + 2, y - 70, 'rgba(255,232,170,.28)', 40 * (0.85 + 0.15 * p), 0.5);
  }

  // ============================================================
  // 路灯 / 长椅 / 木桥 / 池塘 / 冰湖 / 围栏 / 边界树
  // ============================================================
  function drawLamp(ctx, lamp, t) {
    var flicker = 0.8 + 0.2 * Math.sin(t / 400 + lamp.x);
    drawGlow(ctx, lamp.x, lamp.y - 34, 'rgba(255,215,122,.5)', 70, flicker);
    shadow(ctx, lamp.x, lamp.y + 3, 8, 3);
    box(ctx, lamp.x - 3, lamp.y - 36, 6, 38, '#3a3f4a', { r: 2, outline: false });
    box(ctx, lamp.x - 7, lamp.y - 6, 14, 7, '#2e333d', { r: 2, outline: false });
    ctx.fillStyle = '#2e333d';
    ctx.beginPath(); ctx.moveTo(lamp.x - 9, lamp.y - 50); ctx.lineTo(lamp.x + 9, lamp.y - 50); ctx.lineTo(lamp.x + 6, lamp.y - 56); ctx.lineTo(lamp.x - 6, lamp.y - 56); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe08a'; ctx.fillRect(lamp.x - 5, lamp.y - 47, 10, 12);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(lamp.x - 3, lamp.y - 46, 3, 8);
    ball(ctx, lamp.x, lamp.y - 59, 3, '#f0c040', { hi: false });
  }

  function drawBench(ctx, bench) {
    shadow(ctx, bench.x, bench.y + 4, 32, 6);
    box(ctx, bench.x - 26, bench.y - 14, 52, 8, '#9a7050', { r: 2 });
    box(ctx, bench.x - 26, bench.y - 27, 52, 7, '#9a7050', { r: 2 });
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(bench.x - 22, bench.y - 6, 6, 10); ctx.fillRect(bench.x + 16, bench.y - 6, 6, 10);
    ctx.strokeStyle = 'rgba(60,38,22,.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bench.x - 26, bench.y - 18); ctx.lineTo(bench.x + 26, bench.y - 18);
    ctx.moveTo(bench.x - 26, bench.y - 10); ctx.lineTo(bench.x + 26, bench.y - 10); ctx.stroke();
    ctx.fillStyle = '#f2f7fd'; ctx.fillRect(bench.x - 26, bench.y - 30, 52, 4);
  }

  function drawBridge(ctx) {
    var bx = 1085, bw = 60, by = 926, bh = 138;
    shadow(ctx, bx + bw / 2, by + bh, 44, 9);
    box(ctx, bx + 4, by, bw - 8, bh, '#8a6244', { r: 3, outline: false });
    ctx.strokeStyle = 'rgba(60,38,22,.45)'; ctx.lineWidth = 2;
    for (var py = by + 8; py < by + bh; py += 12) {
      ctx.beginPath(); ctx.moveTo(bx + 5, py); ctx.lineTo(bx + bw - 5, py); ctx.stroke();
    }
    box(ctx, bx - 2, by, 6, bh, '#6b4a2f', { r: 2, outline: false });
    box(ctx, bx + bw - 4, by, 6, bh, '#6b4a2f', { r: 2, outline: false });
    ctx.fillStyle = '#a9793f';
    for (var ry = by + 4; ry < by + bh; ry += 22) {
      box(ctx, bx - 4, ry, 10, 5, '#a9793f', { r: 1, outline: false });
      box(ctx, bx + bw - 6, ry, 10, 5, '#a9793f', { r: 1, outline: false });
    }
    ctx.fillStyle = '#f2f7fd';
    ctx.fillRect(bx - 2, by - 4, 12, 8); ctx.fillRect(bx + bw - 10, by - 4, 12, 8);
  }

  function drawPond(ctx) {
    ctx.fillStyle = '#a9c4e8';
    ctx.beginPath(); ctx.ellipse(1110, 995, 130, 65, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(120,150,190,.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.ellipse(1075, 975, 60, 26, -0.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#cfe0f2';
    ctx.beginPath(); ctx.ellipse(1160, 1015, 50, 20, 0.2, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(245,250,255,.8)';
    ctx.beginPath(); ctx.ellipse(1000, 945, 40, 14, 0.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(1215, 1040, 36, 12, -0.3, 0, 7); ctx.fill();
  }

  function drawIceRink(ctx) {
    ctx.fillStyle = '#cfe2f5';
    ctx.beginPath(); ctx.ellipse(170, 515, 130, 46, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(170, 515, 130, 46, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5;
    for (var i = 0; i < 6; i++) {
      var sx = 80 + i * 32;
      ctx.beginPath(); ctx.moveTo(sx, 495 + (i % 3) * 12);
      ctx.quadraticCurveTo(sx + 20, 505 + (i % 2) * 14, sx + 44, 498 + (i % 3) * 10);
      ctx.stroke();
    }
  }

  function drawSnowPiles(ctx) {
    snowPiles.forEach(function (p) {
      ctx.fillStyle = '#f2f7fd';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.55, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(180,200,230,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(190,208,235,.6)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r * 0.28, p.r * 0.85, p.r * 0.32, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.beginPath(); ctx.ellipse(p.x - p.r * 0.2, p.y - p.r * 0.15, p.r * 0.4, p.r * 0.2, 0, 0, 7); ctx.fill();
    });
  }

  function drawFence(ctx) {
    for (var x = 20; x < width; x += 60) {
      box(ctx, x, 8, 8, 18, '#8a6244', { r: 2, outline: false });
      box(ctx, x, height - 26, 8, 18, '#8a6244', { r: 2, outline: false });
    }
    for (var y = 8; y < height; y += 60) {
      box(ctx, 8, y, 18, 8, '#8a6244', { r: 2, outline: false });
      box(ctx, width - 26, y, 18, 8, '#8a6244', { r: 2, outline: false });
    }
    ctx.fillStyle = '#a9793f';
    ctx.fillRect(0, 14, width, 6); ctx.fillRect(0, height - 20, width, 6);
    ctx.fillRect(14, 0, 6, height); ctx.fillRect(width - 20, 0, 6, height);
    ctx.fillStyle = 'rgba(245,250,255,.85)';
    ctx.fillRect(0, 10, width, 3); ctx.fillRect(0, height - 24, width, 3);
  }

  function drawBorderTrees(ctx, t) {
    borderTrees.forEach(function (p) {
      var sway = Math.sin(t / 1400 + p.x * 0.05) * 1.5;
      shadow(ctx, p.x, p.y + 30, 16, 4);
      ctx.fillStyle = '#5b3d29'; ctx.fillRect(p.x - 4, p.y + 26, 8, 12);
      ctx.fillStyle = '#245238';
      ctx.beginPath(); ctx.moveTo(p.x + sway, p.y - 18); ctx.lineTo(p.x - 24, p.y + 30); ctx.lineTo(p.x + 24, p.y + 30); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(16,42,26,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#2f6b45';
      ctx.beginPath(); ctx.moveTo(p.x + sway, p.y - 6); ctx.lineTo(p.x - 18, p.y + 16); ctx.lineTo(p.x + 18, p.y + 16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8f0fa';
      ctx.beginPath(); ctx.moveTo(p.x + sway, p.y - 18); ctx.lineTo(p.x - 11, p.y + 2); ctx.lineTo(p.x + 11, p.y + 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 28, 14, 5, 0, 0, 7); ctx.fill();
    });
  }

  // ============================================================
  // 回忆彩蛋（融入场景的小物件，无发光标记）
  // ============================================================
  /* ---------------- 散落在小镇里的回忆（隐藏式探索） ----------------
     v3.7：以前每个回忆点是「发光 + 星光 + 上下浮动」的挂坠，等于在地图上插了
     一排路标。现在改成「融入场景的小物件」——一张被风吹落的明信片 / 折起的
     便签 / 旧车票，贴地放、颜色压暗、没有光晕、没有浮动，也没有任何方向提示。
     只有走到很近（约 60px）时，物件上方才浮出一行极轻的「看看这里…」。
     数量不提前告诉玩家：回忆册只列已找到的。 */

  var TRACE_PAPER = ['#efe4cd', '#e6dbc2', '#f0e7d4', '#e8ddc6'];

  /* 卡片上的小图案：只用 3~5 笔，远看只是纸上的墨点，近看才认得出 */
  function traceInk(ctx, e) {
    var o = e.object;
    ctx.fillStyle = 'rgba(70,56,44,.7)';
    ctx.strokeStyle = 'rgba(70,56,44,.7)';
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    if (o === 'jeep') {
      ctx.fillRect(-3.6, -2.8, 7.2, 2.4);
      ctx.beginPath(); ctx.arc(-2.1, 0.2, 1.1, 0, 7); ctx.arc(2.1, 0.2, 1.1, 0, 7); ctx.fill();
    } else if (o === 'lantern') {
      ctx.beginPath();
      ctx.moveTo(0, -3.4); ctx.lineTo(2.5, -0.6); ctx.lineTo(0, 2.4); ctx.lineTo(-2.5, -0.6);
      ctx.closePath(); ctx.fill();
    } else if (o === 'bottle') {
      ctx.fillRect(-1.3, -2.6, 2.6, 5.4);
      ctx.fillRect(-0.5, -3.9, 1.0, 1.4);
    } else if (o === 'badge' || o === 'sunset') {
      ctx.beginPath(); ctx.arc(0, -0.2, 2.6, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-3.4, 0.6); ctx.lineTo(3.4, 0.6); ctx.stroke();
    } else if (o === 'whale') {
      ctx.beginPath(); ctx.arc(-0.6, 0, 2.6, Math.PI * 0.15, Math.PI * 1.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1.8, -1.6); ctx.lineTo(3.4, -2.4); ctx.lineTo(3.0, -0.6); ctx.closePath(); ctx.fill();
    } else if (o === 'castle') {
      ctx.fillRect(-3.2, -2.4, 1.8, 4.6); ctx.fillRect(1.4, -2.4, 1.8, 4.6); ctx.fillRect(-1.0, -1.0, 2.0, 3.2);
    } else if (o === 'suitcase') {
      ctx.fillRect(-3.4, -1.6, 6.8, 3.8);
      ctx.beginPath(); ctx.moveTo(-1.2, -1.8); ctx.lineTo(-1.2, -3.0); ctx.lineTo(1.2, -3.0); ctx.lineTo(1.2, -1.8); ctx.stroke();
    } else if (o === 'skewer' || o === 'shrimp') {
      ctx.beginPath(); ctx.moveTo(-3.4, 1.8); ctx.lineTo(3.4, -1.8); ctx.stroke();
      ctx.beginPath(); ctx.arc(-1.4, -0.2, 0.9, 0, 7); ctx.arc(0.8, 0.1, 0.9, 0, 7); ctx.arc(2.4, -0.8, 0.9, 0, 7); ctx.fill();
    } else if (o === 'stairs') {
      ctx.beginPath();
      ctx.moveTo(-3.4, 2.4); ctx.lineTo(-1.0, 2.4); ctx.lineTo(-1.0, 0.2);
      ctx.lineTo(1.4, 0.2); ctx.lineTo(1.4, -2.0); ctx.lineTo(3.4, -2.0);
      ctx.stroke();
    } else if (o === 'panda') {
      ctx.beginPath(); ctx.arc(-1.4, -1.6, 1.3, 0, 7); ctx.arc(1.4, -1.6, 1.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0.8, 1.9, 0, 7); ctx.fill();
    } else if (o === 'buddha') {
      ctx.beginPath(); ctx.arc(0, -0.4, 2.4, Math.PI, 0); ctx.fill();
      ctx.fillRect(-2.6, -0.2, 5.2, 2.6);
    } else if (o === 'pavilion') {
      ctx.beginPath(); ctx.moveTo(-3.6, -1.0); ctx.lineTo(0, -3.4); ctx.lineTo(3.6, -1.0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-2.4, -0.6); ctx.lineTo(-2.4, 2.6); ctx.moveTo(2.4, -0.6); ctx.lineTo(2.4, 2.6); ctx.stroke();
    } else if (o === 'toothbrush') {
      ctx.beginPath(); ctx.moveTo(-3.0, 2.2); ctx.lineTo(2.2, -1.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2.2, -1.4); ctx.lineTo(3.2, -2.2); ctx.stroke();
    } else if (o === 'steam') {
      ctx.beginPath();
      ctx.moveTo(-2.2, 2.0); ctx.quadraticCurveTo(-3.2, -0.4, -1.6, -2.2);
      ctx.moveTo(0.6, 2.2); ctx.quadraticCurveTo(-0.4, -0.6, 1.2, -2.6);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, 7); ctx.fill();
    }
  }

  /* 一张贴地的小纸片（三种形态轮换，看起来像散落物而不是路标） */
  function drawTrace(ctx, e, i) {
    var rot = ((i * 37) % 7 - 3) * 0.05;
    ctx.save();
    ctx.translate(e.x, e.y + 6.6);
    ctx.rotate(rot);

    // 地面投影（很浅，只是让它「压在地上」）
    ctx.fillStyle = 'rgba(56,76,100,.16)';
    ctx.beginPath(); ctx.ellipse(0.4, 1.8, 9.0, 2.8, 0, 0, Math.PI * 2); ctx.fill();

    var kind = i % 3;
    if (kind === 0) {
      // 明信片
      ctx.beginPath();
      ctx.moveTo(-8.0, -5.6); ctx.lineTo(8.0, -5.6); ctx.lineTo(8.8, 5.0); ctx.lineTo(-8.8, 5.0);
      ctx.closePath();
      ctx.fillStyle = TRACE_PAPER[i % 4]; ctx.fill();
      ctx.strokeStyle = 'rgba(74,52,36,.42)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.globalAlpha = 0.42; ctx.fillStyle = e.color;
      ctx.fillRect(-9, -5.8, 18, 6.2);
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.save();
      ctx.translate(0, -1.4);
      traceInk(ctx, e);
      ctx.restore();
    } else if (kind === 1) {
      // 对折的便签（露出里面一角）
      ctx.beginPath();
      ctx.moveTo(-7.6, -4.6); ctx.lineTo(6.2, -5.4); ctx.lineTo(7.8, 4.4); ctx.lineTo(-6.0, 5.2);
      ctx.closePath();
      ctx.fillStyle = TRACE_PAPER[(i + 1) % 4]; ctx.fill();
      ctx.strokeStyle = 'rgba(74,52,36,.40)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2.0, -5.2); ctx.lineTo(3.4, -2.4); ctx.lineTo(1.2, 4.8);
      ctx.strokeStyle = 'rgba(74,52,36,.22)'; ctx.lineWidth = 1.0; ctx.stroke();
      ctx.save(); ctx.translate(3.4, 0.2); ctx.globalAlpha = .8; traceInk(ctx, e); ctx.restore();
    } else {
      // 旧车票（细长、带撕口）
      ctx.beginPath();
      ctx.moveTo(-9.4, -3.4); ctx.lineTo(9.4, -3.4); ctx.lineTo(9.4, 3.4); ctx.lineTo(-9.4, 3.4);
      ctx.closePath();
      ctx.fillStyle = TRACE_PAPER[(i + 2) % 4]; ctx.fill();
      ctx.strokeStyle = 'rgba(74,52,36,.40)'; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(5.0, -3.4); ctx.lineTo(5.0, 3.4);
      ctx.setLineDash && ctx.setLineDash([1.6, 1.6]);
      ctx.strokeStyle = 'rgba(74,52,36,.34)'; ctx.lineWidth = 1.0; ctx.stroke();
      ctx.setLineDash && ctx.setLineDash([]);
      ctx.save(); ctx.translate(-1.6, 0); ctx.globalAlpha = .85; traceInk(ctx, e); ctx.restore();
    }
    ctx.restore();
  }

  function drawEggs(ctx, t, self) {
    eggs.forEach(function (e, i) {
      drawTrace(ctx, e, i);
    });
    // 走近才有的极轻提示：没有箭头、没有方向、没有图标
    if (!self) return;
    eggs.forEach(function (e) {
      var dx = self.x - e.x, dy = self.y - e.y;
      if (dx * dx + dy * dy > 60 * 60) return;
      ctx.save();
      ctx.font = '600 9.5px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(18,24,38,.6)';
      ctx.shadowBlur = 3;
      ctx.fillStyle = 'rgba(255,250,238,.62)';
      ctx.fillText('看看这里…', e.x, e.y - 8);
      ctx.restore();
    });
  }

  // ============================================================
  // 室内：我们的圣诞小屋
  // ============================================================
  var Interior = {
    w: 820, h: 540,
    spawn: { x: 410, y: 440 },
    exit: { x: 410, y: 500 },
    obstacles: [
      { x: 340, y: 60, w: 180, h: 80 },
      { x: 590, y: 100, w: 70, h: 70 },
      { x: 160, y: 250, w: 150, h: 70 },
      { x: 40, y: 40, w: 200, h: 90 }
    ],
    interactables: [
      { id: 'fireplace', x: 430, y: 150, r: 90, name: '🔥 壁炉', lines: [
        '炉火烧得正旺，噼啪作响。',
        '壁炉边挂着两只圣诞袜——一只写着 C，一只写着 J。',
        '（以后这里会挂上你们的旅行照片。）'
      ] },
      { id: 'tree', x: 625, y: 180, r: 80, name: '🎄 屋里的圣诞树', lines: [
        '一棵属于我们两个人的小树。',
        '上面挂着的每一颗球，都是一个小小的约定。',
        '外面的那棵大树点亮之后，屋里的这棵也会更亮哦。'
      ] },
      { id: 'sofa', x: 235, y: 330, r: 85, name: '🛋️ 双人沙发', lines: [
        '毛毯叠在扶手上，正好够两个人挤着坐。',
        '坐下看炉火发呆，也是 Christmas 很重要的事。'
      ] },
      { id: 'frame', x: 720, y: 200, r: 80, name: '🖼️ Omo 相框', lines: [
        '相框已经挂好了，里面暂时是一张空白的全家福。',
        '（你们旅行的照片，以后会一张张贴进来。）'
      ] }
    ],
    draw: function (ctx, t) {
      var w = this.w, h = this.h;
      ctx.fillStyle = '#8f6d4c'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(70,48,30,.35)'; ctx.lineWidth = 1.5;
      for (var py = 90; py < h; py += 34) {
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
      }
      for (var px = 0; px < w; px += 74) {
        var off = ((px / 74) % 2) * 37;
        ctx.beginPath(); ctx.moveTo(px + off, 90); ctx.lineTo(px + off, h); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,230,190,.06)';
      for (var ph2 = 90; ph2 < h; ph2 += 34) ctx.fillRect(0, ph2 + 2, w, 4);

      ctx.fillStyle = '#6a4a3a'; ctx.fillRect(0, 0, w, 90);
      ctx.fillStyle = 'rgba(255,230,190,.08)';
      for (var wp = 0; wp < w; wp += 26) ctx.fillRect(wp, 0, 13, 90);
      ctx.fillStyle = 'rgba(245,250,255,.9)'; ctx.fillRect(0, 86, w, 6);

      var wx = 60, wy = 14;
      ctx.fillStyle = '#16264a'; ctx.fillRect(wx, wy, 110, 66);
      ctx.fillStyle = '#f6f0ea';
      ctx.beginPath(); ctx.arc(wx + 88, wy + 14, 9, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      for (var sf = 0; sf < 8; sf++) {
        ctx.fillRect(wx + 6 + ((sf * 37 + t / 60) % 100), wy + 6 + ((sf * 23) % 56), 2, 2);
      }
      ctx.fillStyle = 'rgba(255,214,130,.75)';
      ctx.fillRect(wx + 12, wy + 44, 3, 4); ctx.fillRect(wx + 30, wy + 40, 3, 4); ctx.fillRect(wx + 70, wy + 46, 3, 4); ctx.fillRect(wx + 92, wy + 42, 3, 4);
      ctx.strokeStyle = '#5b3d29'; ctx.lineWidth = 4;
      ctx.strokeRect(wx, wy, 110, 66);
      ctx.beginPath(); ctx.moveTo(wx + 55, wy); ctx.lineTo(wx + 55, wy + 66);
      ctx.moveTo(wx, wy + 33); ctx.lineTo(wx + 110, wy + 33); ctx.stroke();
      ctx.fillStyle = '#f2f7fd'; ctx.fillRect(wx - 4, wy + 66, 118, 4);

      var fx = 340;
      box(ctx, fx, 40, 180, 100, '#7a6a5a', { r: 3 });
      ctx.fillStyle = 'rgba(60,50,40,.4)';
      for (var bs = 0; bs < 6; bs++) { ctx.fillRect(fx + 6 + (bs % 3) * 60, 46 + Math.floor(bs / 3) * 46, 54, 40); }
      ctx.fillStyle = '#3a2c22'; ctx.fillRect(fx + 14, 58, 152, 70);
      for (var fl = 0; fl < 5; fl++) {
        var fh = 20 + Math.sin(t / 120 + fl * 2.2) * 8 + fl * 2;
        ctx.fillStyle = fl % 2 === 0 ? '#f0a83c' : '#e0563f';
        ctx.beginPath();
        ctx.moveTo(fx + 40 + fl * 22, 118);
        ctx.quadraticCurveTo(fx + 34 + fl * 22, 118 - fh, fx + 51 + fl * 22, 118 - fh * 0.5);
        ctx.quadraticCurveTo(fx + 58 + fl * 22, 118 - fh * 0.4, fx + 62 + fl * 22, 118);
        ctx.fill();
      }
      drawGlow(ctx, fx + 90, 100, 'rgba(255,160,80,.4)', 115, 0.85);
      box(ctx, fx - 8, 34, 196, 12, '#5b3d29', { r: 2 });
      ctx.fillStyle = '#f2f7fd'; ctx.fillRect(fx - 8, 32, 196, 3);
      ctx.fillStyle = '#c0392b'; ctx.fillRect(fx + 40, 12, 14, 22); ctx.fillRect(fx + 40, 30, 20, 8);
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(fx + 40, 10, 14, 4);
      ctx.fillStyle = '#f4ead8'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('C', fx + 47, 26);
      ctx.fillStyle = '#4f86d6'; ctx.fillRect(fx + 116, 12, 14, 22); ctx.fillRect(fx + 112, 30, 20, 8);
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(fx + 116, 10, 14, 4);
      ctx.fillStyle = '#f4ead8'; ctx.fillText('J', fx + 123, 26);
      ctx.fillStyle = '#5b3d29';
      ctx.fillRect(fx + 44, 120, 90, 6); ctx.fillRect(fx + 56, 114, 70, 6);
      ctx.strokeStyle = '#2f6b45'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(fx + 20, 8); ctx.quadraticCurveTo(fx + 90, -2, fx + 160, 8); ctx.stroke();

      var tx = 625, ty = 170;
      ctx.fillStyle = '#7a4a2b'; ctx.fillRect(tx - 5, ty, 10, 16);
      ctx.fillStyle = '#2b7047';
      ctx.beginPath(); ctx.moveTo(tx, ty - 52); ctx.lineTo(tx - 26, ty); ctx.lineTo(tx + 26, ty); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#35845a';
      ctx.beginPath(); ctx.moveTo(tx, ty - 30); ctx.lineTo(tx - 19, ty + 2); ctx.lineTo(tx + 19, ty + 2); ctx.closePath(); ctx.fill();
      [[-8, -28, '#e0563f'], [9, -20, '#f0a83c'], [-4, -10, '#4f86d6'], [7, -4, '#c86bb1']].forEach(function (b) {
        ball(ctx, tx + b[0], ty + b[1], 3.5, b[2], { hi: true, ol: 1 });
      });
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath(); ctx.arc(tx, ty - 56, 4, 0, 7); ctx.fill();
      drawGlow(ctx, tx, ty - 30, 'rgba(255,220,140,.35)', 46, 0.7);

      var sx = 160, sy = 250;
      shadow(ctx, sx + 75, sy + 66, 80, 8);
      box(ctx, sx, sy, 150, 60, '#8c5a44', { r: 8 });
      box(ctx, sx + 8, sy - 18, 134, 26, '#a86a50', { r: 8 });
      box(ctx, sx + 14, sy + 6, 58, 22, '#c98a68', { r: 6, outline: false });
      box(ctx, sx + 78, sy + 6, 58, 22, '#c98a68', { r: 6, outline: false });
      ctx.fillStyle = '#5b3d29'; ctx.fillRect(sx + 4, sy + 54, 10, 12); ctx.fillRect(sx + 136, sy + 54, 10, 12);
      ctx.fillStyle = '#c0392b'; ctx.fillRect(sx + 128, sy - 22, 18, 30);
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(sx + 128, sy - 22, 18, 4);

      box(ctx, 40, 40, 200, 90, '#5b3d29', { r: 3 });
      for (var sh = 0; sh < 3; sh++) {
        ctx.fillStyle = '#6b4a2f'; ctx.fillRect(48, 52 + sh * 28, 184, 6);
        for (var bk = 0; bk < 8; bk++) {
          ctx.fillStyle = ['#c0392b', '#4f86d6', '#58b368', '#f0a83c', '#c86bb1'][(sh * 3 + bk) % 5];
          ctx.fillRect(54 + bk * 22, 38 + sh * 28, 14, 14);
          ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(54 + bk * 22, 38 + sh * 28, 3, 14);
        }
      }

      ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 4;
      ctx.strokeRect(690, 168, 60, 44);
      ctx.fillStyle = '#3a3040'; ctx.fillRect(692, 170, 56, 40);
      ctx.fillStyle = '#4f86d6'; ctx.fillRect(708, 192, 8, 12);
      ctx.fillStyle = '#c86bb1'; ctx.fillRect(720, 192, 8, 12);
      ctx.fillStyle = '#f6cfa8'; ctx.fillRect(709, 186, 6, 6); ctx.fillRect(721, 186, 6, 6);
      ctx.fillStyle = 'rgba(245,250,255,.7)';
      ctx.font = '9px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Omo', 720, 206);

      ctx.fillStyle = '#a8402f';
      ctx.beginPath(); ctx.ellipse(410, 360, 150, 70, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(410, 360, 130, 56, 0, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(245,250,255,.4)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(410, 360, 112, 46, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(245,250,255,.22)';
      ctx.beginPath(); ctx.ellipse(410, 360, 95, 38, 0, 0, 7); ctx.fill();

      ctx.fillStyle = 'rgba(245,250,255,.5)';
      ctx.beginPath(); ctx.ellipse(this.exit.x, this.exit.y + 14, 46, 12, 0, 0, 7); ctx.fill();
      box(ctx, this.exit.x - 26, this.exit.y, 52, 24, '#5b3d29', { r: 3 });
      ctx.fillStyle = '#f4ead8'; ctx.font = '10px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('出门 ▸ 小镇', this.exit.x, this.exit.y + 15);
    }
  };

  // ============================================================
  // 室内：暖冬咖啡（每日热可可）
  // ============================================================
  var CafeInterior = {
    w: 820, h: 540,
    spawn: { x: 410, y: 445 },
    exit: { x: 410, y: 502 },
    obstacles: [
      { x: 230, y: 55, w: 360, h: 85 },
      { x: 90, y: 250, w: 130, h: 75 },
      { x: 600, y: 250, w: 130, h: 75 }
    ],
    interactables: [
      { id: 'cocoa', x: 410, y: 132, r: 120, name: '☕ 吧台', lines: [
        '老板娘把两只马克杯推过来：「今天的热可可，还是请你们的哦。」',
        '每天来一杯，暖暖手再走。'
      ] },
      { id: 'menuboard', x: 410, y: 62, r: 80, name: '📋 菜单黑板', lines: [
        '黑板上用粉笔写着：',
        '「热可可 · 双份棉花糖 · 每人每天一杯，免费。」',
        '下面还有一行小字：谢谢你们常来。'
      ] },
      { id: 'windowseat', x: 155, y: 287, r: 85, name: '🪑 窗边座位', lines: [
        '窗边的位置永远给你们留着，看雪最清楚。',
        '玻璃上有雾气——正好用手指画一颗小爱心。'
      ] },
      { id: 'gramophone', x: 665, y: 287, r: 80, name: '🎵 老唱机', lines: [
        '唱机放着很慢很慢的爵士，唱针转一圈，雪就落一层。',
        '「圣诞歌单，」老板娘说，「十一月就开始排了。」'
      ] }
    ],
    draw: function (ctx, t) {
      var w = this.w, h = this.h;
      ctx.fillStyle = '#b08a68'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(90,60,35,.35)'; ctx.lineWidth = 1.5;
      for (var py = 90; py < h; py += 34) { ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke(); }
      for (var px = 0; px < w; px += 74) {
        var off = ((px / 74) % 2) * 37;
        ctx.beginPath(); ctx.moveTo(px + off, 90); ctx.lineTo(px + off, h); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,235,200,.06)';
      for (var ph2 = 90; ph2 < h; ph2 += 34) ctx.fillRect(0, ph2 + 2, w, 4);
      // 墙
      ctx.fillStyle = '#9c6a50'; ctx.fillRect(0, 0, w, 90);
      ctx.fillStyle = 'rgba(255,230,190,.08)';
      for (var wp = 0; wp < w; wp += 26) ctx.fillRect(wp, 0, 13, 90);
      ctx.fillStyle = 'rgba(245,250,255,.9)'; ctx.fillRect(0, 86, w, 6);
      // 暖黄吊灯
      for (var ld = 0; ld < 3; ld++) {
        var lx = 170 + ld * 240;
        ctx.strokeStyle = '#5b3d29'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, 26); ctx.stroke();
        drawGlow(ctx, lx, 40, 'rgba(255,214,130,.55)', 60, 0.85 + 0.15 * Math.sin(t / 500 + ld));
        ctx.fillStyle = '#6b4a2f'; ctx.fillRect(lx - 14, 26, 28, 8);
        ctx.fillStyle = '#ffe08a'; ctx.fillRect(lx - 10, 34, 20, 12);
        ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.strokeRect(lx - 10, 34, 20, 12);
      }
      // 吧台
      box(ctx, 230, 130, 360, 30, '#7a5236', { r: 4 });
      box(ctx, 238, 160, 344, 26, '#8a5c3a', { r: 2 });
      ctx.fillStyle = 'rgba(255,235,200,.15)'; ctx.fillRect(230, 130, 360, 5);
      // 咖啡机
      box(ctx, 300, 74, 56, 58, '#3a3f4a', { r: 4 });
      ctx.fillStyle = '#2e333d'; ctx.fillRect(306, 80, 44, 10);
      ball(ctx, 328, 132, 3, '#e0563f', { outline: false });
      ball(ctx, 340, 132, 3, '#f0a83c', { outline: false });
      drawGlow(ctx, 328, 108, 'rgba(255,190,110,.45)', 34, 0.9);
      // 双杯热可可（吧台上）
      [[470, 112], [540, 112]].forEach(function (m) {
        box(ctx, m[0], m[1], 26, 22, '#f4ead8', { r: 3 });
        ctx.fillStyle = '#6b4226'; ctx.fillRect(m[0] + 3, m[1] + 3, 20, 7);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(m[0] + 8, m[1] + 2, 4, 0, 7); ctx.arc(m[0] + 17, m[1] + 1, 4.5, 0, 7); ctx.fill();
        ctx.strokeStyle = '#f4ead8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(m[0] + 26, m[1] + 6); ctx.lineTo(m[0] + 32, m[1] + 6); ctx.stroke();
        // 热气
        for (var st = 0; st < 2; st++) {
          var sp2 = (t / 700 + st * 0.5) % 1;
          ctx.fillStyle = 'rgba(255,255,255,' + (0.4 * (1 - sp2)) + ')';
          ctx.beginPath();
          ctx.arc(m[0] + 13 + Math.sin(sp2 * 6 + st) * 5, m[1] - sp2 * 22, 3 + sp2 * 4, 0, 7);
          ctx.fill();
        }
      });
      // 菜单黑板
      box(ctx, 355, 30, 130, 62, '#2e2a26', { r: 3, oc: '#8a5c3a' });
      ctx.strokeStyle = 'rgba(244,234,216,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(368, 46); ctx.lineTo(472, 46); ctx.moveTo(368, 60); ctx.lineTo(452, 60); ctx.stroke();
      ctx.fillStyle = '#f4ead8'; ctx.font = '9px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('热可可 · 每日免费', 420, 42);
      ctx.fillStyle = 'rgba(244,234,216,.75)'; ctx.font = '7px "PingFang SC", sans-serif';
      ctx.fillText('双份棉花糖 · 谢谢常来', 420, 74);
      // 左：窗边座位（圆桌+两椅+大窗）
      var wx = 60;
      ctx.fillStyle = '#16264a'; ctx.fillRect(wx, 14, 130, 70);
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      for (var sf = 0; sf < 10; sf++) ctx.fillRect(wx + 8 + ((sf * 41 + t / 60) % 116), 20 + ((sf * 29) % 60), 2, 2);
      ctx.strokeStyle = '#5b3d29'; ctx.lineWidth = 4;
      ctx.strokeRect(wx, 14, 130, 70);
      ctx.beginPath(); ctx.moveTo(wx + 65, 14); ctx.lineTo(wx + 65, 84); ctx.moveTo(wx, 49); ctx.lineTo(wx + 130, 49); ctx.stroke();
      shadow(ctx, 155, 330, 44, 8);
      ball(ctx, 155, 296, 26, '#9a7050', { hi: false });
      ctx.fillStyle = '#f2f7fd'; ctx.beginPath(); ctx.ellipse(155, 272, 26, 8, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
      box(ctx, 96, 262, 22, 26, '#c0392b', { r: 4 });
      box(ctx, 192, 262, 22, 26, '#4f86d6', { r: 4 });
      box(ctx, 143, 266, 24, 12, '#f4ead8', { r: 3 });
      ctx.fillStyle = '#6b4226'; ctx.fillRect(146, 269, 18, 5);
      // 右：老唱机
      box(ctx, 610, 250, 110, 72, '#7a5236', { r: 5 });
      ctx.fillStyle = '#5b3d29'; ctx.fillRect(616, 256, 98, 24);
      ball(ctx, 665, 268, 10, '#2b2119', { outline: false });
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.beginPath(); ctx.arc(665, 268, 10, 0, 7); ctx.fill();
      ball(ctx, 665, 268, 3, '#f0c040', { outline: false });
      ctx.fillStyle = '#2b2119'; ctx.fillRect(700, 240, 3, 26);
      ctx.fillStyle = '#9aa8be'; ctx.beginPath();
      ctx.moveTo(672, 260); ctx.lineTo(700, 244); ctx.lineTo(702, 246); ctx.lineTo(674, 262); ctx.closePath(); ctx.fill();
      // 圣诞花环 + 彩旗
      ctx.strokeStyle = '#2f7a3a'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(720, 40, 15, 0, 7); ctx.stroke();
      ball(ctx, 720, 27, 3, '#e0563f', { outline: false });
      ball(ctx, 708, 44, 3, '#f0a83c', { outline: false });
      ball(ctx, 732, 44, 3, '#f0a83c', { outline: false });
      var fc = ['#e0563f', '#f0a83c', '#58b368', '#4f86d6'];
      for (var fi = 0; fi < 10; fi++) {
        ctx.fillStyle = fc[fi % 4];
        var fx2 = 60 + fi * 74, fy2 = 4 + (fi % 2) * 3;
        ctx.beginPath(); ctx.moveTo(fx2 - 6, fy2); ctx.lineTo(fx2 + 6, fy2); ctx.lineTo(fx2, fy2 + 9); ctx.closePath(); ctx.fill();
      }
      // 出门垫
      ctx.fillStyle = 'rgba(245,250,255,.5)';
      ctx.beginPath(); ctx.ellipse(this.exit.x, this.exit.y + 14, 46, 12, 0, 0, 7); ctx.fill();
      box(ctx, this.exit.x - 26, this.exit.y, 52, 24, '#5b3d29', { r: 3 });
      ctx.fillStyle = '#f4ead8'; ctx.font = '10px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('出门 ▸ 小镇', this.exit.x, this.exit.y + 15);
    }
  };

  // ============================================================
  // 室内：星星温室（6 块真实时间种植地）
  // ============================================================
  var GHInterior = {
    w: 820, h: 540,
    spawn: { x: 410, y: 465 },
    exit: { x: 410, y: 508 },
    plots: [
      { id: 'p1', x: 175, y: 255 }, { id: 'p2', x: 375, y: 255 }, { id: 'p3', x: 575, y: 255 },
      { id: 'p4', x: 175, y: 400 }, { id: 'p5', x: 375, y: 400 }, { id: 'p6', x: 575, y: 400 }
    ],
    obstacles: [
      { x: 40, y: 60, w: 110, h: 120 },
      { x: 670, y: 60, w: 110, h: 120 }
    ],
    interactables: [],
    draw: function (ctx, t, plots) {
      var w = this.w, h = this.h;
      // 陶土地面
      ctx.fillStyle = '#c9a582'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(120,85,55,.25)'; ctx.lineWidth = 1.5;
      for (var py = 90; py < h; py += 30) { ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,240,220,.08)';
      for (var ph2 = 90; ph2 < h; ph2 += 30) ctx.fillRect(0, ph2 + 2, w, 4);
      // 墙：玻璃格棂 + 外面雪景
      ctx.fillStyle = '#dceaf5'; ctx.fillRect(0, 0, w, 90);
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      for (var sf = 0; sf < 14; sf++) ctx.fillRect((sf * 67 + t / 50) % (w - 4), 18 + ((sf * 31) % 66), 2, 2);
      ctx.strokeStyle = '#eef6fb'; ctx.lineWidth = 3;
      for (var gm = 0; gm <= 8; gm++) { ctx.beginPath(); ctx.moveTo(gm * w / 8, 0); ctx.lineTo(gm * w / 8, 90); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, 45); ctx.lineTo(w, 45); ctx.stroke();
      // 远处雪松剪影
      for (var tt = 0; tt < 7; tt++) {
        var tx0 = 40 + tt * 118;
        ctx.fillStyle = 'rgba(120,150,180,.5)';
        ctx.beginPath(); ctx.moveTo(tx0, 76); ctx.lineTo(tx0 - 16, 86); ctx.lineTo(tx0 + 16, 86); ctx.closePath(); ctx.fill();
      }
      // 屋顶吊盆与暖灯
      for (var hp = 0; hp < 4; hp++) {
        var hx = 130 + hp * 190;
        ctx.strokeStyle = '#5b3d29'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, 22); ctx.stroke();
        box(ctx, hx - 10, 22, 20, 12, '#8a5a3a', { r: 4 });
        ctx.fillStyle = '#2b7047';
        ctx.beginPath(); ctx.arc(hx, 18, 9, Math.PI, 0); ctx.fill();
        drawGlow(ctx, hx, 40, 'rgba(190,255,170,.30)', 40, 0.8);
      }
      // 两侧花架（装饰）
      [[40, 60], [670, 60]].forEach(function (sh) {
        box(ctx, sh[0], sh[1] + 20, 110, 14, '#8a5c3a', { r: 2 });
        box(ctx, sh[0], sh[1] + 76, 110, 14, '#8a5c3a', { r: 2 });
        for (var pp = 0; pp < 3; pp++) {
          var bx = sh[0] + 16 + pp * 36;
          box(ctx, bx, sh[1] + 4, 24, 16, '#8a5a3a', { r: 2 });
          ctx.fillStyle = '#2b7047';
          ctx.beginPath(); ctx.arc(bx + 12, sh[1] - 2, 9, 0, 7); ctx.fill();
          ball(ctx, bx + 6, sh[1] - 7, 2.2, '#e0563f', { outline: false });
          ball(ctx, bx + 17, sh[1] - 6, 2.2, '#f0a83c', { outline: false });
          box(ctx, bx + 2, sh[1] + 60, 24, 16, '#8a5a3a', { r: 2 });
          ctx.fillStyle = '#35845a';
          ctx.beginPath(); ctx.arc(bx + 12, sh[1] + 54, 8, 0, 7); ctx.fill();
        }
      });
      // ---- 6 块种植地（状态由 game.js 计算后传入 plots） ----
      var self = this;
      this.plots.forEach(function (p, i) {
        var st = plots && plots[i] ? plots[i] : { stage: 0, kind: 'none', ready: false };
        // 苗床
        shadow(ctx, p.x, p.y + 26, 52, 9);
        box(ctx, p.x - 52, p.y - 16, 104, 42, '#8a5c3a', { r: 5 });
        ctx.fillStyle = '#5b3d29'; ctx.fillRect(p.x - 46, p.y - 10, 92, 30);
        // 土壤纹理
        ctx.fillStyle = 'rgba(80,50,25,.5)';
        for (var d = 0; d < 4; d++) ctx.fillRect(p.x - 40 + d * 22, p.y - 6, 12, 3);
        // 植物
        var kind = st.kind, stage = st.stage || 0;
        if (stage >= 1) {
          var sway = Math.sin(t / 900 + i * 1.4) * 2;
          if (stage === 1) { // 破土小芽
            ctx.fillStyle = '#58b368';
            ctx.beginPath(); ctx.moveTo(p.x + sway, p.y - 18); ctx.lineTo(p.x - 4, p.y - 4); ctx.lineTo(p.x + 4, p.y - 4); ctx.closePath(); ctx.fill();
          } else if (stage === 2) { // 长叶
            ctx.fillStyle = '#35845a';
            ctx.beginPath(); ctx.moveTo(p.x + sway, p.y - 26); ctx.lineTo(p.x - 12, p.y - 2); ctx.lineTo(p.x + 12, p.y - 2); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#58b368';
            ctx.beginPath(); ctx.moveTo(p.x + sway, p.y - 18); ctx.lineTo(p.x - 7, p.y); ctx.lineTo(p.x + 7, p.y); ctx.closePath(); ctx.fill();
          } else { // 成熟：花 或 小树
            if (kind === 'tree') {
              ctx.fillStyle = '#5b3d29'; ctx.fillRect(p.x - 3, p.y - 14, 6, 14);
              ctx.fillStyle = '#2b7047';
              ctx.beginPath(); ctx.moveTo(p.x + sway, p.y - 48); ctx.lineTo(p.x - 22, p.y - 10); ctx.lineTo(p.x + 22, p.y - 10); ctx.closePath(); ctx.fill();
              ctx.fillStyle = '#35845a';
              ctx.beginPath(); ctx.moveTo(p.x + sway, p.y - 34); ctx.lineTo(p.x - 15, p.y - 8); ctx.lineTo(p.x + 15, p.y - 8); ctx.closePath(); ctx.fill();
              ctx.fillStyle = '#f2f7fd';
              ctx.beginPath(); ctx.moveTo(p.x + sway, p.y - 48); ctx.lineTo(p.x - 10, p.y - 28); ctx.lineTo(p.x + 10, p.y - 28); ctx.closePath(); ctx.fill();
            } else {
              ctx.strokeStyle = '#35845a'; ctx.lineWidth = 2.5;
              ctx.beginPath(); ctx.moveTo(p.x, p.y - 2); ctx.quadraticCurveTo(p.x + sway, p.y - 18, p.x + sway * 0.6, p.y - 30); ctx.stroke();
              ctx.fillStyle = '#58b368';
              ctx.beginPath(); ctx.ellipse(p.x - 8, p.y - 12, 7, 3, -0.6, 0, 7); ctx.fill();
              ctx.beginPath(); ctx.ellipse(p.x + 8, p.y - 16, 7, 3, 0.6, 0, 7); ctx.fill();
              ball(ctx, p.x + sway * 0.6, p.y - 34, 7, '#e0563f', { hi: true });
              ball(ctx, p.x + sway * 0.6 - 7, p.y - 27, 4.5, '#c86bb1', { hi: false, ol: 1 });
              ball(ctx, p.x + sway * 0.6 + 7, p.y - 27, 4.5, '#f0a83c', { hi: false, ol: 1 });
            }
          }
          if (st.ready) { // 可收获闪光
            var tw = 0.5 + 0.5 * Math.sin(t / 350 + i * 2);
            drawGlow(ctx, p.x, p.y - 26, 'rgba(255,240,170,.55)', 30, 0.5 + 0.5 * tw);
            ctx.strokeStyle = 'rgba(255,255,240,' + (0.4 + 0.5 * tw) + ')'; ctx.lineWidth = 1.5;
            var sy3 = p.y - 46 + Math.sin(t / 600 + i) * 2;
            ctx.beginPath();
            ctx.moveTo(p.x - 8, sy3); ctx.lineTo(p.x - 3, sy3);
            ctx.moveTo(p.x - 5.5, sy3 - 2.5); ctx.lineTo(p.x - 5.5, sy3 + 2.5);
            ctx.stroke();
          }
        }
        // 地块编号小木牌
        ctx.fillStyle = '#6b4a2f'; ctx.fillRect(p.x - 3, p.y + 26, 6, 10);
        box(ctx, p.x - 16, p.y + 16, 32, 14, '#c9a06a', { r: 2 });
        ctx.fillStyle = '#5b3d29'; ctx.font = 'bold 9px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('地 ' + (i + 1), p.x, p.y + 27);
      });
      // 出门垫
      ctx.fillStyle = 'rgba(245,250,255,.5)';
      ctx.beginPath(); ctx.ellipse(this.exit.x, this.exit.y + 14, 46, 12, 0, 0, 7); ctx.fill();
      box(ctx, this.exit.x - 26, this.exit.y, 52, 24, '#5b3d29', { r: 3 });
      ctx.fillStyle = '#f4ead8'; ctx.font = '10px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('出门 ▸ 小镇', this.exit.x, this.exit.y + 15);
    }
  };
  // 每块地生成一个可交互点（game.js 用它弹种植/收获菜单）
  GHInterior.plots.forEach(function (p) {
    GHInterior.interactables.push({ id: p.id, x: p.x, y: p.y, r: 74, name: '🌱 种植地', lines: [] });
  });

  // ============================================================
  // 室内：礼物工坊（制作）
  // ============================================================
  var WSInterior = {
    w: 820, h: 540,
    spawn: { x: 410, y: 445 },
    exit: { x: 410, y: 502 },
    obstacles: [
      { x: 250, y: 60, w: 320, h: 90 },
      { x: 60, y: 240, w: 150, h: 80 },
      { x: 620, y: 240, w: 150, h: 80 }
    ],
    interactables: [
      { id: 'craft', x: 410, y: 140, r: 130, name: '🛠️ 大工作台', lines: [
        '台上摆着你们俩的工具箱，木屑香香的。',
        '「一起做点什么吧。」'
      ] },
      { id: 'plans', x: 135, y: 270, r: 90, name: '📐 图纸桌', lines: [
        '图纸桌上摊着好多张手绘小图：木鸟、八音盒、星星挂饰……',
        '每张图纸角上都签着两个名字：C & J。'
      ] },
      { id: 'shelf', x: 695, y: 270, r: 90, name: '📦 材料架', lines: [
        '木头、松果、彩带、铃铛——分门别类码得整整齐齐。',
        '（材料不够的时候，去温室和镇子里就能收集到。）'
      ] }
    ],
    draw: function (ctx, t) {
      var w = this.w, h = this.h;
      // 木地板
      ctx.fillStyle = '#9a7858'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(80,55,30,.35)'; ctx.lineWidth = 1.5;
      for (var py = 90; py < h; py += 34) { ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke(); }
      for (var px = 0; px < w; px += 74) {
        var off = ((px / 74) % 2) * 37;
        ctx.beginPath(); ctx.moveTo(px + off, 90); ctx.lineTo(px + off, h); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,235,200,.06)';
      for (var ph2 = 90; ph2 < h; ph2 += 34) ctx.fillRect(0, ph2 + 2, w, 4);
      // 墙
      ctx.fillStyle = '#8a7058'; ctx.fillRect(0, 0, w, 90);
      ctx.fillStyle = 'rgba(255,230,190,.07)';
      for (var wp = 0; wp < w; wp += 26) ctx.fillRect(wp, 0, 13, 90);
      ctx.fillStyle = 'rgba(245,250,255,.85)'; ctx.fillRect(0, 86, w, 6);
      // 吊着的工具（墙面）
      var tools = ['saw', 'hammer', 'wrench', 'brush'];
      tools.forEach(function (tl, i) {
        var tx = 90 + i * 200;
        if (tl === 'saw') {
          ctx.fillStyle = '#9aa8be';
          ctx.beginPath(); ctx.moveTo(tx, 20); ctx.lineTo(tx + 40, 20); ctx.lineTo(tx + 34, 34); ctx.lineTo(tx + 4, 34); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#7a8496'; ctx.lineWidth = 1;
          for (var s = 0; s < 5; s++) { ctx.beginPath(); ctx.moveTo(tx + 6 + s * 7, 20); ctx.lineTo(tx + 4 + s * 7, 34); ctx.stroke(); }
        } else if (tl === 'hammer') {
          ctx.fillStyle = '#8a6244'; ctx.fillRect(tx + 16, 26, 5, 22);
          ctx.fillStyle = '#9aa8be'; ctx.fillRect(tx + 6, 18, 26, 10);
        } else if (tl === 'wrench') {
          ctx.fillStyle = '#9aa8be'; ctx.fillRect(tx + 16, 24, 6, 24);
          ball(ctx, tx + 19, 22, 7, '#9aa8be', { outline: false });
          ctx.fillStyle = '#8a7058'; ctx.fillRect(tx + 14, 16, 10, 6);
        } else {
          ctx.fillStyle = '#c9a06a'; ctx.fillRect(tx + 14, 20, 9, 26);
          ctx.fillStyle = '#d8b088'; ctx.fillRect(tx + 15, 46, 7, 8);
        }
      });
      // 大工作台
      shadow(ctx, 410, 170, 190, 12);
      box(ctx, 250, 108, 320, 26, '#7a5236', { r: 4 });
      [[270, 134], [540, 134]].forEach(function (lg) {
        box(ctx, lg[0], lg[1], 18, 26, '#5b3d29', { r: 2 });
      });
      ctx.fillStyle = 'rgba(255,235,200,.15)'; ctx.fillRect(250, 108, 320, 5);
      // 台面上：半成品小木鸟 + 木屑 + 图纸
      box(ctx, 360, 88, 34, 22, '#c9a06a', { r: 4 });
      ball(ctx, 394, 92, 5, '#c9a06a', { hi: false });
      ctx.fillStyle = '#f0c040'; ctx.beginPath();
      ctx.moveTo(398, 90); ctx.lineTo(404, 88); ctx.lineTo(398, 94); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2b2119'; ctx.fillRect(381, 96, 3, 3);
      ctx.fillStyle = 'rgba(200,160,110,.7)';
      for (var shx = 0; shx < 6; shx++) ctx.fillRect(440 + shx * 14, 100 + (shx % 3) * 3, 5, 2);
      box(ctx, 470, 80, 40, 26, '#f4ead8', { r: 3 });
      ctx.strokeStyle = 'rgba(120,90,60,.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(476, 94); ctx.quadraticCurveTo(490, 84, 504, 94); ctx.stroke();
      drawGlow(ctx, 410, 96, 'rgba(255,214,130,.45)', 90, 0.9);
      // 左：图纸桌
      shadow(ctx, 135, 330, 60, 9);
      box(ctx, 60, 250, 150, 18, '#8a6244', { r: 3 });
      [[72, 268], [182, 268]].forEach(function (lg) { box(ctx, lg[0], lg[1], 12, 60, '#6b4a2f', { r: 2 }); });
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(70, 232, 60, 20);
      ctx.strokeStyle = 'rgba(120,90,60,.5)';
      ctx.strokeRect(70, 232, 60, 20);
      ctx.beginPath(); ctx.moveTo(76, 248); ctx.lineTo(84, 240); ctx.lineTo(92, 248); ctx.moveTo(98, 248); ctx.lineTo(106, 242); ctx.stroke();
      ball(ctx, 150, 240, 6, '#c0392b', { outline: false });
      // 右：材料架
      box(ctx, 620, 240, 150, 84, '#8a5c3a', { r: 4 });
      for (var sh = 0; sh < 3; sh++) {
        ctx.fillStyle = '#6b4a2f'; ctx.fillRect(628, 268 + sh * 22, 134, 5);
        for (var it = 0; it < 5; it++) {
          var kinds = ['#b8906a', '#8a5a3a', '#f0c040', '#c0392b', '#35845a'];
          ctx.fillStyle = kinds[(sh * 3 + it) % 5];
          ctx.fillRect(634 + it * 26, 254 + sh * 22, 20, 13);
          ctx.fillStyle = 'rgba(255,255,255,.25)';
          ctx.fillRect(634 + it * 26, 254 + sh * 22, 20, 3);
        }
      }
      // 落地灯暖光
      drawGlow(ctx, 700, 120, 'rgba(255,214,130,.5)', 80, 0.9);
      // 出门垫
      ctx.fillStyle = 'rgba(245,250,255,.5)';
      ctx.beginPath(); ctx.ellipse(this.exit.x, this.exit.y + 14, 46, 12, 0, 0, 7); ctx.fill();
      box(ctx, this.exit.x - 26, this.exit.y, 52, 24, '#5b3d29', { r: 3 });
      ctx.fillStyle = '#f4ead8'; ctx.font = '10px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('出门 ▸ 小镇', this.exit.x, this.exit.y + 15);
    }
  };

  var interiors = { cabin: Interior, cafe: CafeInterior, greenhouse: GHInterior, workshop: WSInterior };
  function getInterior(id) { return interiors[id] || Interior; }

  // ============================================================
  return {
    width: width, height: height,
    buildings: buildings, obstacles: obstacles, npcs: npcs, doors: doors,
    tree: tree, lamps: lamps, benches: benches, snowPiles: snowPiles, props: props,
    eggs: eggs, Interior: Interior, interiors: interiors, getInterior: getInterior, slotNames: slotNames,
    getGroundCanvas: getGroundCanvas,
    drawGround: drawGround, drawSnowPiles: drawSnowPiles, drawFence: drawFence,
    drawBorderTrees: drawBorderTrees, drawBuilding: drawBuilding, drawBigTree: drawBigTree,
    drawLamp: drawLamp, drawBench: drawBench, drawPond: drawPond, drawIceRink: drawIceRink,
    drawBridge: drawBridge, drawEggs: drawEggs, drawProps: drawProps
  };
})();
