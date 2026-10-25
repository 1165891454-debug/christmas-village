/* world.js — Stage 3：圣诞小镇世界（氛围升级版）
 * 设计目标：冷色雪夜 + 暖色灯光的圣诞绘本风；全程序化绘制，无图片资源。
 * 性能：地面等静态内容预渲染到离屏 canvas（getGroundCanvas），主循环只贴图。
 * 新增：木桥（穿过池塘）、隐藏旅行彩蛋（结构化，后续可挂照片）、
 *       「我们的圣诞小屋」室内场景（Interior）。
 */
window.World = (function () {
  'use strict';

  var width = 1500, height = 1100;

  // ---------- 伪随机（保证每次绘制一致） ----------
  var _seed = 7;
  function rnd() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }

  // ---------- 建筑 ----------
  var buildings = [
    { id: 'cabin', x: 170, y: 200, w: 230, h: 150, kind: 'cabin', wall: '#8a6244', roof: '#7a4a3a', name: '我们的圣诞小屋', hint: '' },
    { id: 'cafe', x: 1170, y: 170, w: 250, h: 165, kind: 'cafe', wall: '#a8846a', roof: '#8c5a44', name: '暖冬咖啡', hint: '推开门，热可可的甜香混着肉桂味飘出来。' },
    { id: 'shop', x: 1160, y: 760, w: 250, h: 165, kind: 'shop', wall: '#7a6a9b', roof: '#5a4a7a', name: '圣诞小铺', hint: '' },
    { id: 'stall', x: 560, y: 110, w: 150, h: 95, kind: 'stall', wall: '#9b5a4a', roof: '#c0392b', name: '礼物小摊', hint: '摊主神秘地压低声音：「今年的圣诞礼物，我可是提前给你们俩留了最好的。」' }
  ];

  // ---------- 中央圣诞树 ----------
  var tree = { x: 750, y: 545 };

  // ---------- 碰撞体（池塘被木桥分成左右两块，桥上可走） ----------
  var obstacles = [];
  buildings.forEach(function (b) { obstacles.push({ x: b.x, y: b.y, w: b.w, h: b.h }); });
  obstacles.push({ x: tree.x - 22, y: tree.y - 18, w: 44, h: 30 });   // 树干
  obstacles.push({ x: 980, y: 930, w: 105, h: 130 });                 // 池塘左
  obstacles.push({ x: 1145, y: 930, w: 95, h: 130 });                 // 池塘右（中间 60px 是桥）
  obstacles.push({ x: 40, y: 470, w: 260, h: 90 });                   // 冰湖
  obstacles.push({ x: 420, y: 880, w: 180, h: 120 });                 // 雪松丛(右下)
  obstacles.push({ x: 60, y: 700, w: 200, h: 150 });                  // 树林(左下)

  // ---------- NPC ----------
  var npcs = [
    { id: 'santa', x: 858, y: 648, name: '圣诞老人', lines: [
      'Ho Ho Ho！欢迎回到你们自己的小镇。',
      '这棵树的每一颗灯泡，都在等你们一起点亮。',
      '今年你们一起走了那么多地方——把那些回忆都讲给我听吧。'
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
      '听说小镇里藏着几样「回忆的碎片」，走慢一点，说不定会踩到闪光的小东西哦。'
    ], lateLines: [
      '哇，全点亮了！我要把这个画面画进我的笔记本！',
      '地图上那些一闪一闪的小角落，你们都找到了吗？'
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

  // ---------- 交互点（建筑门）----------
  var doors = buildings.map(function (b) {
    return { id: b.id, type: 'building', x: b.x + b.w / 2, y: b.y + b.h + 8, name: b.name };
  });

  // ---------- 旅行彩蛋（结构就位：小物件 + 一句只有你们懂的话；照片以后挂） ----------
  var eggs = [
    { id: 'wuhai', x: 300, y: 905, name: '旅行的回忆 · 乌海', obj: 'shell',
      line: '一枚小小的贝壳。「沙漠看海」那天风很大，你笑得比湖水还亮。' },
    { id: 'doha', x: 1295, y: 1075, name: '旅行的回忆 · 多哈', obj: 'pearl',
      line: '一颗温润的小珍珠。多哈的夜晚我们说好：以后每年都要一起看世界。' },
    { id: 'sayram', x: 335, y: 425, name: '旅行的回忆 · 赛里木湖', obj: 'drop',
      line: '一滴蓝色的湖水。都说赛里木湖是大地的眼泪——那天我们光顾着笑了。' }
  ];

  // ---------- 路灯 / 长椅 / 雪堆 ----------
  var lamps = [
    { x: 620, y: 470 }, { x: 890, y: 470 }, { x: 560, y: 730 }, { x: 950, y: 730 },
    { x: 1090, y: 560 }, { x: 400, y: 300 }
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
  // 发光贴图缓存（避免每帧创建渐变）
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
  // 地面预渲染
  // ============================================================
  var _groundCanvas = null;
  function getGroundCanvas() {
    if (_groundCanvas) return _groundCanvas;
    if (typeof document === 'undefined') return null;
    _seed = 7;
    var c = document.createElement('canvas');
    c.width = width; c.height = height;
    var g = c.getContext('2d');

    // 基础雪地
    g.fillStyle = '#dfe9f6';
    g.fillRect(0, 0, width, height);

    // 雪地深浅斑块（绘本质感）
    for (var i = 0; i < 150; i++) {
      var bx = rnd() * width, by = rnd() * height, br = 30 + rnd() * 90;
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.30)' : 'rgba(186,203,232,.16)';
      g.beginPath(); g.ellipse(bx, by, br, br * (0.35 + rnd() * 0.3), rnd() * 3, 0, 7); g.fill();
    }

    // ---- 道路（从广场通向各处）----
    function road(x, y, w, h) {
      g.fillStyle = '#c9d6ea'; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(x, y, w, 4); g.fillRect(x, y, 4, h);
      g.fillStyle = 'rgba(150,168,200,.35)'; g.fillRect(x, y + h - 4, w, 4); g.fillRect(x + w - 4, y, 4, h);
    }
    // 广场石板地
    g.fillStyle = '#c3d0e8'; g.fillRect(560, 420, 380, 380);
    g.strokeStyle = 'rgba(140,158,192,.5)'; g.lineWidth = 2;
    for (var tx = 560; tx <= 940; tx += 38) { g.beginPath(); g.moveTo(tx, 420); g.lineTo(tx, 800); g.stroke(); }
    for (var ty = 420; ty <= 800; ty += 38) { g.beginPath(); g.moveTo(560, ty); g.lineTo(940, ty); g.stroke(); }
    // 树下的暖色光圈石板
    var cg = g.createRadialGradient(tree.x, tree.y, 20, tree.x, tree.y, 170);
    cg.addColorStop(0, 'rgba(255,224,150,.22)'); cg.addColorStop(1, 'rgba(255,224,150,0)');
    g.fillStyle = cg; g.fillRect(tree.x - 170, tree.y - 170, 340, 340);
    // 雪盖住部分石板
    for (var s = 0; s < 26; s++) {
      g.fillStyle = 'rgba(240,246,252,' + (0.25 + rnd() * 0.3) + ')';
      g.beginPath(); g.ellipse(570 + rnd() * 360, 430 + rnd() * 360, 14 + rnd() * 30, 8 + rnd() * 14, rnd() * 3, 0, 7); g.fill();
    }
    // 放射道路
    road(722, 130, 56, 292);        // 上（礼物摊/小屋方向）
    road(722, 798, 56, 212);        // 下（池塘方向）
    road(390, 600, 172, 56);        // 左（小木屋）
    road(938, 600, 212, 56);        // 右（圣诞小铺）
    road(938, 452, 250, 56);        // 右上（咖啡店）
    road(1132, 350, 56, 158);       // 咖啡店门前
    // 道路上的脚印
    _seed = 99;
    for (var f = 0; f < 90; f++) {
      var fx, fy;
      var pick = rnd();
      if (pick < 0.3) { fx = 730 + rnd() * 40; fy = 140 + rnd() * 280; }
      else if (pick < 0.5) { fx = 400 + rnd() * 160; fy = 606 + rnd() * 44; }
      else if (pick < 0.7) { fx = 946 + rnd() * 196; fy = 606 + rnd() * 44; }
      else if (pick < 0.85) { fx = 730 + rnd() * 40; fy = 800 + rnd() * 200; }
      else { fx = 946 + rnd() * 230; fy = 458 + rnd() * 44; }
      g.fillStyle = 'rgba(130,148,178,.30)';
      g.beginPath(); g.ellipse(fx, fy, 3.2, 5, (rnd() - 0.5), 0, 7); g.fill();
    }
    // 边缘雪堆点缀
    _seed = 31;
    for (var d = 0; d < 60; d++) {
      g.fillStyle = 'rgba(245,250,255,.5)';
      g.beginPath(); g.ellipse(rnd() * width, rnd() * height, 6 + rnd() * 16, 4 + rnd() * 8, 0, 0, 7); g.fill();
    }

    _groundCanvas = c;
    return c;
  }

  // ---------- 地面绘制（优先贴预渲染图） ----------
  function drawGround(ctx, view) {
    var c = getGroundCanvas();
    if (c) {
      ctx.drawImage(c, view.x, view.y, view.w, view.h, view.x, view.y, view.w, view.h);
      return;
    }
    // 无离屏能力时的兜底（测试环境）
    ctx.fillStyle = '#dfe9f6';
    ctx.fillRect(view.x, view.y, view.w, view.h);
    ctx.fillStyle = '#c3d0e8';
    ctx.fillRect(560, 420, 380, 380);
  }

  // ============================================================
  // 建筑（按类型差异化绘制）
  // ============================================================
  function drawBuilding(ctx, b, t) {
    var wallTop = b.y + 34, wallH = b.h - 34;
    var glow = 0.75 + 0.25 * Math.sin(t / 500 + b.x);

    // 墙体 + 底部阴影
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, wallTop, b.w, wallH);
    ctx.fillStyle = 'rgba(0,0,0,.14)';
    ctx.fillRect(b.x, wallTop + wallH - 6, b.w, 6);

    if (b.kind === 'cabin') {
      // 原木横线
      ctx.strokeStyle = 'rgba(60,38,22,.4)'; ctx.lineWidth = 2;
      for (var ly = wallTop + 12; ly < wallTop + wallH - 8; ly += 12) {
        ctx.beginPath(); ctx.moveTo(b.x + 3, ly); ctx.lineTo(b.x + b.w - 3, ly); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,230,190,.18)';
      for (var ly2 = wallTop + 6; ly2 < wallTop + wallH - 8; ly2 += 12) {
        ctx.beginPath(); ctx.moveTo(b.x + 3, ly2); ctx.lineTo(b.x + b.w - 3, ly2); ctx.stroke();
      }
    }
    if (b.kind === 'cafe') {
      // 条纹雨棚
      for (var aw = 0; aw < b.w; aw += 24) {
        ctx.fillStyle = (aw / 24) % 2 === 0 ? '#c0392b' : '#f4ead8';
        ctx.fillRect(b.x + aw, wallTop - 4, 24, 16);
      }
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(b.x, wallTop + 12, b.w, 3);
    }
    if (b.kind === 'shop') {
      // 橱窗（里面摆礼物盒）
      var wx = b.x + 30, wy = wallTop + 34;
      ctx.fillStyle = '#3a3450'; ctx.fillRect(wx, wy, b.w - 60, 62);
      ctx.fillStyle = '#5a5280'; ctx.fillRect(wx, wy, b.w - 60, 6);
      var gcolors = ['#e0563f', '#f0a83c', '#58b368', '#4f86d6', '#c86bb1'];
      for (var gi = 0; gi < 5; gi++) {
        var gx = wx + 14 + gi * ((b.w - 90) / 4);
        ctx.fillStyle = gcolors[gi]; ctx.fillRect(gx, wy + 26, 20, 16);
        ctx.fillStyle = '#f4ead8'; ctx.fillRect(gx + 8, wy + 26, 3, 16); ctx.fillRect(gx, wy + 32, 20, 3);
      }
      ctx.strokeStyle = '#c9b8e8'; ctx.lineWidth = 3; ctx.strokeRect(wx, wy, b.w - 60, 62);
    }

    // 雪顶（双坡 + 屋檐雪）
    ctx.fillStyle = '#f2f7fd';
    ctx.fillRect(b.x - 8, b.y + 18, b.w + 16, 20);
    ctx.fillStyle = b.roof;
    ctx.beginPath();
    ctx.moveTo(b.x - 14, b.y + 22);
    ctx.lineTo(b.x + b.w / 2, b.y - 30);
    ctx.lineTo(b.x + b.w + 14, b.y + 22);
    ctx.closePath(); ctx.fill();
    // 屋顶雪（锯齿边）
    ctx.fillStyle = '#f2f7fd';
    ctx.beginPath();
    ctx.moveTo(b.x + b.w / 2, b.y - 30);
    ctx.lineTo(b.x + b.w / 2 - 30, b.y + 0);
    ctx.lineTo(b.x + b.w / 2 - 18, b.y - 6);
    ctx.lineTo(b.x + b.w / 2 - 6, b.y + 2);
    ctx.lineTo(b.x + b.w / 2 + 8, b.y - 6);
    ctx.lineTo(b.x + b.w / 2 + 20, b.y + 0);
    ctx.lineTo(b.x + b.w / 2 + 32, b.y - 2);
    ctx.closePath(); ctx.fill();

    // 烟囱 + 炊烟
    if (b.kind === 'cabin' || b.kind === 'cafe') {
      var chx = b.x + b.w - 46;
      ctx.fillStyle = '#6b4a2f'; ctx.fillRect(chx, b.y - 22, 16, 34);
      ctx.fillStyle = '#f2f7fd'; ctx.fillRect(chx - 3, b.y - 26, 22, 8);
      for (var i = 0; i < 3; i++) {
        var ph = (t / 900 + i * 0.4) % 1;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.4 * (1 - ph)) + ')';
        ctx.beginPath();
        ctx.arc(chx + 8 + Math.sin(ph * 6 + i) * 8, b.y - 34 - ph * 46, 6 + ph * 10, 0, 7);
        ctx.fill();
      }
    }

    // 暖窗（发光 + 窗框 + 高光）
    var wins = (b.kind === 'stall') ? [] : [[b.x + 26, wallTop + 26], [b.x + b.w - 60, wallTop + 26]];
    wins.forEach(function (w) {
      drawGlow(ctx, w[0] + 17, w[1] + 15, 'rgba(255,215,122,.6)', 40, 0.6 * glow);
      ctx.fillStyle = '#ffd77a'; ctx.fillRect(w[0], w[1], 34, 30);
      ctx.fillStyle = '#8a6244'; ctx.fillRect(w[0] + 15, w[1], 4, 30); ctx.fillRect(w[0], w[1] + 13, 34, 4);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(w[0] + 3, w[1] + 3, 12, 6);
      ctx.fillStyle = 'rgba(90,60,30,.25)'; ctx.fillRect(w[0] + 20, w[1] + 18, 14, 12); // 剪影
    });

    // 门 + 花环
    var dx = b.x + b.w / 2 - 20;
    ctx.fillStyle = '#5b3d29'; ctx.fillRect(dx, wallTop + wallH - 52, 40, 52);
    ctx.fillStyle = '#3f2a1c'; ctx.fillRect(dx + 4, wallTop + wallH - 48, 32, 48);
    ctx.fillStyle = '#f0c040';
    ctx.beginPath(); ctx.arc(dx + 33, wallTop + wallH - 26, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2f7a3a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(dx + 20, wallTop + 10, 10, 0, 7); ctx.stroke();
    ctx.fillStyle = '#c0392b'; ctx.fillRect(dx + 17, wallTop + 16, 6, 5);
    ctx.fillStyle = '#f0c040'; ctx.fillRect(dx + 18.5, wallTop + 20, 3, 5); // 花环铃铛

    // 招牌（挂牌样式）
    ctx.strokeStyle = '#5b3d29'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x + b.w / 2 - 30, wallTop - 22); ctx.lineTo(b.x + b.w / 2 - 30, wallTop - 12); ctx.moveTo(b.x + b.w / 2 + 30, wallTop - 22); ctx.lineTo(b.x + b.w / 2 + 30, wallTop - 12); ctx.stroke();
    ctx.fillStyle = '#5b3d29';
    ctx.fillRect(b.x + b.w / 2 - 46, wallTop - 12, 92, 20);
    ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x + b.w / 2 - 43, wallTop - 9.5, 86, 15);
    ctx.fillStyle = '#f4ead8';
    ctx.font = 'bold 12px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, b.x + b.w / 2, wallTop + 2);

    // 小铺/小摊彩灯
    if (b.kind === 'shop' || b.kind === 'stall' || b.kind === 'cafe') {
      var colors = ['#e0563f', '#f0a83c', '#58b368', '#4f86d6'];
      for (var j = 0; j < 9; j++) {
        var on = Math.sin(t / 300 + j * 1.7) > -0.3;
        var lx = b.x + 14 + j * (b.w - 28) / 8;
        if (on) drawGlow(ctx, lx + 3, wallTop - 3, 'rgba(255,220,140,.5)', 12, 0.7);
        ctx.fillStyle = on ? colors[j % 4] : 'rgba(120,120,140,.4)';
        ctx.fillRect(lx, wallTop - 6, 6, 6);
      }
    }
    // 礼物小摊：条纹棚 + 礼物盒
    if (b.kind === 'stall') {
      for (var st = 0; st < b.w; st += 20) {
        ctx.fillStyle = (st / 20) % 2 === 0 ? '#c0392b' : '#f4ead8';
        ctx.fillRect(b.x + st, b.y + 12, 20, 14);
      }
      ctx.fillStyle = '#e0563f'; ctx.fillRect(b.x + 18, wallTop + 30, 24, 18);
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(b.x + 27, wallTop + 30, 4, 18); ctx.fillRect(b.x + 18, wallTop + 37, 24, 4);
      ctx.fillStyle = '#58b368'; ctx.fillRect(b.x + 58, wallTop + 34, 20, 14);
      ctx.fillStyle = '#f0a83c'; ctx.fillRect(b.x + 102, wallTop + 32, 22, 16);
    }
  }

  // ============================================================
  // 中央圣诞树（小镇视觉核心）
  // ============================================================
  function drawBigTree(ctx, tree, stage, t) {
    var x = tree.x, y = tree.y;
    // 树影
    ctx.fillStyle = 'rgba(120,140,180,.25)';
    ctx.beginPath(); ctx.ellipse(x, y + 8, 100, 24, 0, 0, 7); ctx.fill();

    // 树干（带纹理）
    ctx.fillStyle = '#7a4a2b'; ctx.fillRect(x - 13, y - 12, 26, 34);
    ctx.fillStyle = 'rgba(60,35,18,.4)';
    ctx.fillRect(x - 13, y + 2, 26, 3); ctx.fillRect(x - 13, y + 12, 26, 3);

    // 四层树冠（锯齿雪边）
    var layers = [
      { w: 156, y: y - 30, c: '#2b7047', snow: 4 },
      { w: 122, y: y - 92, c: '#35845a', snow: 3 },
      { w: 88, y: y - 148, c: '#2b7047', snow: 3 },
      { w: 54, y: y - 196, c: '#35845a', snow: 2 }
    ];
    layers.forEach(function (L) {
      // 三片交叠三角形，形成锯齿边缘
      for (var k = -1; k <= 1; k++) {
        ctx.fillStyle = L.c;
        ctx.beginPath();
        ctx.moveTo(x + k * L.w * 0.26, L.y - 60);
        ctx.lineTo(x + k * L.w * 0.42 - L.w * 0.18, L.y);
        ctx.lineTo(x + k * L.w * 0.42 + L.w * 0.18, L.y);
        ctx.closePath(); ctx.fill();
      }
      // 每层挂雪
      for (var sn = 0; sn < L.snow; sn++) {
        var sx = x - L.w * 0.38 + (L.w * 0.76) * (sn / Math.max(1, L.snow - 1 || 1));
        ctx.fillStyle = 'rgba(245,250,255,.85)';
        ctx.beginPath(); ctx.ellipse(sx, L.y + 2, 10 + (sn % 2) * 5, 5, 0, 0, 7); ctx.fill();
      }
    });

    // 金色彩灯带（stage>=1 缠绕感）
    if (stage >= 1) {
      ctx.strokeStyle = 'rgba(240,200,110,.75)'; ctx.lineWidth = 2.5;
      for (var gI = 0; gI < 3; gI++) {
        var gy = y - 40 - gI * 52, gw = 120 - gI * 28;
        ctx.beginPath();
        for (var px = -gw / 2; px <= gw / 2; px += 8) {
          var py = gy + Math.sin(px * 0.25 + gI * 2) * 6;
          if (px === -gw / 2) ctx.moveTo(x + px, py); else ctx.lineTo(x + px, py);
        }
        ctx.stroke();
      }
    }

    // 彩球（stage>=1）
    if (stage >= 1) {
      var balls = [
        [x - 44, y - 48, '#e0563f'], [x + 36, y - 60, '#f0a83c'], [x - 60, y - 16, '#f0a83c'],
        [x + 2, y - 8, '#e0563f'], [x + 56, y - 20, '#4f86d6'], [x - 28, y - 104, '#f0a83c'],
        [x + 26, y - 110, '#e0563f'], [x - 16, y - 156, '#4f86d6'], [x + 12, y - 170, '#c86bb1'],
        [x - 40, y - 76, '#c86bb1']
      ];
      balls.forEach(function (b, i) {
        if (i % 3 === (Math.floor(t / 1600) % 3)) { // 轮流微微发亮
          drawGlow(ctx, b[0], b[1], 'rgba(255,230,160,.45)', 10, 0.8);
        }
        ctx.fillStyle = b[2]; ctx.beginPath(); ctx.arc(b[0], b[1], 6, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(b[0] - 2, b[1] - 2, 2, 0, 7); ctx.fill();
        ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(b[0] - 3, b[1] - 7); ctx.lineTo(b[0] + 3, b[1] - 7); ctx.stroke();
      });
    }

    // 彩灯（stage>=2，闪烁）
    if (stage >= 2) {
      var lights = [
        [x - 30, y - 62], [x + 18, y - 70], [x - 52, y - 26], [x + 44, y - 32], [x - 8, y - 20],
        [x + 10, y - 118], [x - 20, y - 128], [x + 4, y - 168], [x - 38, y - 96], [x + 36, y - 88],
        [x - 12, y - 88], [x + 24, y - 140]
      ];
      lights.forEach(function (L, i) {
        var on = Math.sin(t / 260 + i * 1.3) > -0.2;
        var c = ['#ffe08a', '#8ad2ff', '#ff9d9d', '#b6ff9d'][i % 4];
        if (on) drawGlow(ctx, L[0], L[1], 'rgba(255,236,150,.8)', 14, 0.9);
        ctx.fillStyle = on ? c : 'rgba(150,160,180,.5)';
        ctx.beginPath(); ctx.arc(L[0], L[1], 4, 0, 7); ctx.fill();
      });
    }

    // 顶部星星 + 光晕 + 礼物（stage>=3）
    if (stage >= 3) {
      var pulse = 0.85 + 0.15 * Math.sin(t / 400);
      drawGlow(ctx, x, y - 252, 'rgba(255,215,122,.5)', 130 * pulse, 1);
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath();
      var sy = y - 252, pts = [[0, -22], [6, -7], [22, -7], [9, 3], [14, 18], [0, 8], [-14, 18], [-9, 3], [-22, -7], [-6, -7]];
      pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(x + p[0], sy + p[1]); else ctx.lineTo(x + p[0], sy + p[1]); });
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f0a83c'; ctx.lineWidth = 2; ctx.stroke();

      // 树下礼物（丝带蝴蝶结）
      var gifts = [
        [x - 90, y + 4, '#e0563f'], [x - 64, y + 12, '#4f86d6'],
        [x + 60, y + 8, '#58b368'], [x + 88, y + 0, '#f0a83c'], [x + 6, y + 16, '#c86bb1']
      ];
      gifts.forEach(function (gf) {
        ctx.fillStyle = 'rgba(120,140,180,.2)';
        ctx.beginPath(); ctx.ellipse(gf[0] + 13, gf[1] + 21, 16, 4, 0, 0, 7); ctx.fill();
        ctx.fillStyle = gf[2]; ctx.fillRect(gf[0], gf[1], 26, 20);
        ctx.fillStyle = '#f4ead8'; ctx.fillRect(gf[0] + 11, gf[1], 4, 20); ctx.fillRect(gf[0], gf[1] + 8, 26, 4);
        ctx.fillStyle = '#f4ead8';
        ctx.beginPath(); ctx.arc(gf[0] + 13, gf[1] - 2, 4, 0, 7); ctx.arc(gf[0] + 9, gf[1] - 4, 3.4, 0, 7); ctx.arc(gf[0] + 17, gf[1] - 4, 3.4, 0, 7); ctx.fill();
      });
    }
  }

  // ============================================================
  // 路灯 / 长椅 / 木桥 / 池塘 / 冰湖 / 围栏 / 边界树
  // ============================================================
  function drawLamp(ctx, lamp, t) {
    var flicker = 0.8 + 0.2 * Math.sin(t / 400 + lamp.x);
    drawGlow(ctx, lamp.x, lamp.y - 34, 'rgba(255,215,122,.5)', 70, flicker);
    // 灯杆
    ctx.fillStyle = '#3a3f4a'; ctx.fillRect(lamp.x - 3, lamp.y - 36, 6, 36);
    ctx.fillStyle = '#2e333d'; ctx.fillRect(lamp.x - 7, lamp.y - 6, 14, 6);
    ctx.fillStyle = '#ffe08a'; ctx.fillRect(lamp.x - 5, lamp.y - 46, 10, 12);
    ctx.fillStyle = '#2e333d'; ctx.fillRect(lamp.x - 8, lamp.y - 50, 16, 5);
    ctx.fillStyle = '#f0c040'; ctx.fillRect(lamp.x - 2, lamp.y - 54, 4, 4);
  }

  function drawBench(ctx, bench) {
    ctx.fillStyle = 'rgba(120,140,180,.18)';
    ctx.beginPath(); ctx.ellipse(bench.x, bench.y + 4, 30, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#8a6244';
    ctx.fillRect(bench.x - 26, bench.y - 14, 52, 8);
    ctx.fillRect(bench.x - 26, bench.y - 26, 52, 6);
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(bench.x - 22, bench.y - 6, 6, 8); ctx.fillRect(bench.x + 16, bench.y - 6, 6, 8);
    ctx.fillStyle = '#f2f7fd'; ctx.fillRect(bench.x - 26, bench.y - 29, 52, 4);
  }

  function drawBridge(ctx) {
    // 池塘上的小木桥（x 1085-1145，y 930-1060）
    var bx = 1085, bw = 60, by = 926, bh = 138;
    ctx.fillStyle = 'rgba(120,140,180,.2)';
    ctx.beginPath(); ctx.ellipse(bx + bw / 2, by + bh, 40, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#8a6244'; ctx.fillRect(bx + 4, by, bw - 8, bh);
    ctx.strokeStyle = 'rgba(60,38,22,.45)'; ctx.lineWidth = 2;
    for (var py = by + 8; py < by + bh; py += 12) {
      ctx.beginPath(); ctx.moveTo(bx + 5, py); ctx.lineTo(bx + bw - 5, py); ctx.stroke();
    }
    // 两侧栏杆
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(bx - 2, by, 6, bh); ctx.fillRect(bx + bw - 4, by, 6, bh);
    ctx.fillStyle = '#a9793f';
    for (var ry = by + 4; ry < by + bh; ry += 22) {
      ctx.fillRect(bx - 4, ry, 10, 5); ctx.fillRect(bx + bw - 6, ry, 10, 5);
    }
    // 桥头雪
    ctx.fillStyle = '#f2f7fd';
    ctx.fillRect(bx - 2, by - 4, 12, 8); ctx.fillRect(bx + bw - 10, by - 4, 12, 8);
  }

  function drawPond(ctx) {
    ctx.fillStyle = '#a9c4e8';
    ctx.beginPath(); ctx.ellipse(1110, 995, 130, 65, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.ellipse(1075, 975, 60, 26, -0.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#cfe0f2';
    ctx.beginPath(); ctx.ellipse(1160, 1015, 50, 20, 0.2, 0, 7); ctx.fill();
    // 池塘边缘积雪
    ctx.fillStyle = 'rgba(245,250,255,.8)';
    ctx.beginPath(); ctx.ellipse(1000, 945, 40, 14, 0.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(1215, 1040, 36, 12, -0.3, 0, 7); ctx.fill();
  }

  function drawIceRink(ctx) {
    ctx.fillStyle = '#cfe2f5';
    ctx.beginPath(); ctx.ellipse(170, 515, 130, 46, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(170, 515, 130, 46, 0, 0, 7); ctx.stroke();
    // 冰面刀痕
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
      ctx.fillStyle = 'rgba(190,208,235,.6)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r * 0.28, p.r * 0.85, p.r * 0.32, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.ellipse(p.x - p.r * 0.2, p.y - p.r * 0.15, p.r * 0.4, p.r * 0.2, 0, 0, 7); ctx.fill();
    });
  }

  function drawFence(ctx) {
    ctx.fillStyle = '#8a6244';
    for (var x = 20; x < width; x += 60) { ctx.fillRect(x, 8, 8, 18); ctx.fillRect(x, height - 26, 8, 18); }
    for (var y = 8; y < height; y += 60) { ctx.fillRect(8, y, 18, 8); ctx.fillRect(width - 26, y, 18, 8); }
    ctx.fillStyle = '#a9793f';
    ctx.fillRect(0, 14, width, 6); ctx.fillRect(0, height - 20, width, 6);
    ctx.fillRect(14, 0, 6, height); ctx.fillRect(width - 20, 0, 6, height);
    // 栏杆积雪
    ctx.fillStyle = 'rgba(245,250,255,.85)';
    ctx.fillRect(0, 10, width, 3); ctx.fillRect(0, height - 24, width, 3);
  }

  function drawBorderTrees(ctx, t) {
    borderTrees.forEach(function (p) {
      var sway = Math.sin(t / 1400 + p.x * 0.05) * 1.5;
      ctx.fillStyle = '#5b3d29'; ctx.fillRect(p.x - 4, p.y + 26, 8, 12);
      ctx.fillStyle = '#245238';
      ctx.beginPath(); ctx.moveTo(p.x + sway, p.y - 18); ctx.lineTo(p.x - 24, p.y + 30); ctx.lineTo(p.x + 24, p.y + 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2f6b45';
      ctx.beginPath(); ctx.moveTo(p.x + sway, p.y - 6); ctx.lineTo(p.x - 18, p.y + 16); ctx.lineTo(p.x + 18, p.y + 16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8f0fa';
      ctx.beginPath(); ctx.moveTo(p.x + sway, p.y - 18); ctx.lineTo(p.x - 11, p.y + 2); ctx.lineTo(p.x + 11, p.y + 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 28, 14, 5, 0, 0, 7); ctx.fill();
    });
  }

  // ============================================================
  // 旅行彩蛋标记（低调的闪光小物件）
  // ============================================================
  function drawEggs(ctx, t) {
    eggs.forEach(function (e, i) {
      var tw = 0.5 + 0.5 * Math.sin(t / 500 + i * 2.1);
      var bob = Math.sin(t / 700 + i) * 2;
      // 小物件底座阴影
      ctx.fillStyle = 'rgba(120,140,180,.2)';
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 6, 10, 3.5, 0, 0, 7); ctx.fill();
      // 物件
      if (e.obj === 'shell') {
        ctx.fillStyle = '#f2d8c8';
        ctx.beginPath(); ctx.arc(e.x, e.y + bob, 7, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = '#c9a08a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(e.x, e.y + bob); ctx.lineTo(e.x - 5, e.y - 6 + bob);
        ctx.moveTo(e.x, e.y + bob); ctx.lineTo(e.x, e.y - 7 + bob);
        ctx.moveTo(e.x, e.y + bob); ctx.lineTo(e.x + 5, e.y - 6 + bob); ctx.stroke();
      } else if (e.obj === 'pearl') {
        drawGlow(ctx, e.x, e.y + bob, 'rgba(255,240,220,.5)', 10, 0.6 + tw * 0.3);
        ctx.fillStyle = '#f6f0ea';
        ctx.beginPath(); ctx.arc(e.x, e.y + bob, 5, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.beginPath(); ctx.arc(e.x - 1.5, e.y - 1.5 + bob, 1.6, 0, 7); ctx.fill();
      } else { // drop
        drawGlow(ctx, e.x, e.y + bob, 'rgba(140,190,255,.5)', 10, 0.5 + tw * 0.3);
        ctx.fillStyle = '#6fa8e8';
        ctx.beginPath();
        ctx.moveTo(e.x, e.y - 7 + bob);
        ctx.quadraticCurveTo(e.x + 5.5, e.y + bob, e.x, e.y + 5 + bob);
        ctx.quadraticCurveTo(e.x - 5.5, e.y + bob, e.x, e.y - 7 + bob);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.beginPath(); ctx.arc(e.x - 1.5, e.y - 1 + bob, 1.4, 0, 7); ctx.fill();
      }
      // 闪光十字星
      if (tw > 0.6) {
        ctx.strokeStyle = 'rgba(255,255,240,' + (tw - 0.4) + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(e.x - 9, e.y - 12 + bob); ctx.lineTo(e.x - 3, e.y - 12 + bob);
        ctx.moveTo(e.x - 6, e.y - 15 + bob); ctx.lineTo(e.x - 6, e.y - 9 + bob);
        ctx.stroke();
      }
    });
  }

  // ============================================================
  // 「我们的圣诞小屋」室内场景
  // ============================================================
  var Interior = {
    w: 820, h: 540,
    spawn: { x: 410, y: 440 },
    exit: { x: 410, y: 500 },
    obstacles: [
      { x: 340, y: 60, w: 180, h: 80 },   // 壁炉
      { x: 590, y: 100, w: 70, h: 70 },   // 小树
      { x: 160, y: 250, w: 150, h: 70 },  // 沙发
      { x: 40, y: 40, w: 200, h: 90 }     // 书架墙角
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
      { id: 'frame', x: 720, y: 200, r: 80, name: '🖼️ 相框', lines: [
        '相框已经挂好了，里面暂时是一张空白的全家福。',
        '（Stage 4 起，你们旅行的照片会一张张贴进来。）'
      ] }
    ],
    draw: function (ctx, t) {
      var w = this.w, h = this.h;
      // 地板（木纹）
      ctx.fillStyle = '#8a6a4a'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(60,40,25,.35)'; ctx.lineWidth = 2;
      for (var py = 90; py < h; py += 42) {
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
      }
      for (var px = 30; px < w; px += 96) {
        ctx.beginPath(); ctx.moveTo(px, 90); ctx.lineTo(px + ((py / 42) % 2) * 20, h); ctx.stroke();
      }
      // 后墙 + 壁纸
      ctx.fillStyle = '#6a4a3a'; ctx.fillRect(0, 0, w, 90);
      ctx.fillStyle = 'rgba(255,230,190,.08)';
      for (var wp = 0; wp < w; wp += 26) ctx.fillRect(wp, 0, 13, 90);
      ctx.fillStyle = 'rgba(245,250,255,.9)'; ctx.fillRect(0, 86, w, 6); // 墙脚雪白线

      // 窗户（外面是雪夜）
      var wx = 60, wy = 14;
      ctx.fillStyle = '#1a2a4a'; ctx.fillRect(wx, wy, 110, 66);
      ctx.fillStyle = '#f6f0ea';
      ctx.beginPath(); ctx.arc(wx + 88, wy + 14, 9, 0, 7); ctx.fill(); // 月亮
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      for (var sf = 0; sf < 8; sf++) {
        ctx.fillRect(wx + 6 + ((sf * 37 + t / 60) % 100), wy + 6 + ((sf * 23) % 56), 2, 2);
      }
      ctx.strokeStyle = '#5b3d29'; ctx.lineWidth = 4;
      ctx.strokeRect(wx, wy, 110, 66);
      ctx.beginPath(); ctx.moveTo(wx + 55, wy); ctx.lineTo(wx + 55, wy + 66);
      ctx.moveTo(wx, wy + 33); ctx.lineTo(wx + 110, wy + 33); ctx.stroke();

      // 壁炉
      var fx = 340;
      ctx.fillStyle = '#7a6a5a'; ctx.fillRect(fx, 40, 180, 100);
      ctx.fillStyle = '#5b4a3e';
      ctx.fillRect(fx + 14, 58, 152, 70);
      // 炉火（动画）
      for (var fl = 0; fl < 5; fl++) {
        var fh = 18 + Math.sin(t / 120 + fl * 2.2) * 7 + fl * 2;
        ctx.fillStyle = fl % 2 === 0 ? '#f0a83c' : '#e0563f';
        ctx.beginPath();
        ctx.moveTo(fx + 40 + fl * 22, 118);
        ctx.quadraticCurveTo(fx + 34 + fl * 22, 118 - fh, fx + 51 + fl * 22, 118 - fh * 0.5);
        ctx.quadraticCurveTo(fx + 58 + fl * 22, 118 - fh * 0.4, fx + 62 + fl * 22, 118);
        ctx.fill();
      }
      drawGlow(ctx, fx + 90, 100, 'rgba(255,160,80,.4)', 110, 0.8);
      // 壁炉台 + 圣诞袜
      ctx.fillStyle = '#5b3d29'; ctx.fillRect(fx - 8, 34, 196, 12);
      ctx.fillStyle = '#f4ead8';
      ctx.fillStyle = '#c0392b'; ctx.fillRect(fx + 40, 12, 14, 22); ctx.fillRect(fx + 40, 30, 20, 8);
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(fx + 40, 10, 14, 4);
      ctx.fillStyle = '#4f86d6'; ctx.fillRect(fx + 116, 12, 14, 22); ctx.fillRect(fx + 112, 30, 20, 8);
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(fx + 116, 10, 14, 4);
      // 壁炉柴火
      ctx.fillStyle = '#5b3d29';
      ctx.fillRect(fx + 44, 120, 90, 6); ctx.fillRect(fx + 56, 114, 70, 6);

      // 圣诞袜上方小松枝
      ctx.strokeStyle = '#2f6b45'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(fx + 20, 8); ctx.quadraticCurveTo(fx + 90, -2, fx + 160, 8); ctx.stroke();

      // 小圣诞树
      var tx = 625, ty = 170;
      ctx.fillStyle = '#7a4a2b'; ctx.fillRect(tx - 5, ty, 10, 16);
      ctx.fillStyle = '#2b7047';
      ctx.beginPath(); ctx.moveTo(tx, ty - 52); ctx.lineTo(tx - 26, ty); ctx.lineTo(tx + 26, ty); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#35845a';
      ctx.beginPath(); ctx.moveTo(tx, ty - 30); ctx.lineTo(tx - 19, ty + 2); ctx.lineTo(tx + 19, ty + 2); ctx.closePath(); ctx.fill();
      [[-8, -28, '#e0563f'], [9, -20, '#f0a83c'], [-4, -10, '#4f86d6'], [7, -4, '#c86bb1']].forEach(function (b) {
        ctx.fillStyle = b[2]; ctx.beginPath(); ctx.arc(tx + b[0], ty + b[1], 3.5, 0, 7); ctx.fill();
      });
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath(); ctx.arc(tx, ty - 56, 4, 0, 7); ctx.fill();
      drawGlow(ctx, tx, ty - 30, 'rgba(255,220,140,.35)', 46, 0.7);

      // 沙发
      var sx = 160, sy = 250;
      ctx.fillStyle = '#8c5a44'; ctx.fillRect(sx, sy, 150, 60);
      ctx.fillStyle = '#a86a50'; ctx.fillRect(sx + 8, sy - 18, 134, 26);
      ctx.fillStyle = '#c98a68'; ctx.fillRect(sx + 14, sy + 6, 58, 22); ctx.fillRect(sx + 78, sy + 6, 58, 22);
      ctx.fillStyle = '#5b3d29'; ctx.fillRect(sx + 4, sy + 54, 10, 12); ctx.fillRect(sx + 136, sy + 54, 10, 12);
      // 扶手毛毯
      ctx.fillStyle = '#c0392b'; ctx.fillRect(sx + 128, sy - 22, 18, 30);
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(sx + 128, sy - 22, 18, 4);

      // 书架
      ctx.fillStyle = '#5b3d29'; ctx.fillRect(40, 40, 200, 90);
      for (var sh = 0; sh < 3; sh++) {
        ctx.fillStyle = '#6b4a2f'; ctx.fillRect(48, 52 + sh * 28, 184, 6);
        for (var bk = 0; bk < 8; bk++) {
          ctx.fillStyle = ['#c0392b', '#4f86d6', '#58b368', '#f0a83c', '#c86bb1'][(sh * 3 + bk) % 5];
          ctx.fillRect(54 + bk * 22, 38 + sh * 28, 14, 14);
        }
      }

      // 相框（未来放照片）
      ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 4;
      ctx.strokeRect(690, 168, 60, 44);
      ctx.fillStyle = '#3a3040'; ctx.fillRect(692, 170, 56, 40);
      // 里面两个小点（预告：以后是你们的照片）
      ctx.fillStyle = '#4f86d6'; ctx.fillRect(708, 192, 8, 12);
      ctx.fillStyle = '#c86bb1'; ctx.fillRect(720, 192, 8, 12);
      ctx.fillStyle = '#f6cfa8'; ctx.fillRect(709, 186, 6, 6); ctx.fillRect(721, 186, 6, 6);
      ctx.fillStyle = 'rgba(245,250,255,.7)';
      ctx.font = '9px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Omo', 720, 206);

      // 地毯
      ctx.fillStyle = '#a8402f';
      ctx.beginPath(); ctx.ellipse(410, 360, 150, 70, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(410, 360, 130, 56, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(245,250,255,.25)';
      ctx.beginPath(); ctx.ellipse(410, 360, 95, 38, 0, 0, 7); ctx.fill();

      // 出口门垫
      ctx.fillStyle = 'rgba(245,250,255,.5)';
      ctx.beginPath(); ctx.ellipse(this.exit.x, this.exit.y + 14, 46, 12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#5b3d29'; ctx.fillRect(this.exit.x - 26, this.exit.y, 52, 24);
      ctx.fillStyle = '#f4ead8'; ctx.font = '10px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('出门 ▸ 小镇', this.exit.x, this.exit.y + 15);
    }
  };

  // ============================================================
  return {
    width: width, height: height,
    buildings: buildings, obstacles: obstacles, npcs: npcs, doors: doors,
    tree: tree, lamps: lamps, benches: benches, snowPiles: snowPiles,
    eggs: eggs, Interior: Interior, slotNames: slotNames,
    getGroundCanvas: getGroundCanvas,
    drawGround: drawGround, drawSnowPiles: drawSnowPiles, drawFence: drawFence,
    drawBorderTrees: drawBorderTrees, drawBuilding: drawBuilding, drawBigTree: drawBigTree,
    drawLamp: drawLamp, drawBench: drawBench, drawPond: drawPond, drawIceRink: drawIceRink,
    drawBridge: drawBridge, drawEggs: drawEggs
  };
})();
