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
    { id: 'workshop', x: 930, y: 110, w: 230, h: 140, kind: 'workshop', wall: '#a08a6a', roof: '#7a6450', name: '礼物工坊', hint: '叮叮当当——木屑的香味里，可以亲手做点小东西。' },
    { id: 'station', x: 940, y: 270, w: 186, h: 152, kind: 'station', wall: '#c8b79c', roof: '#8c6a52', name: '小镇车站', hint: '『去哪儿？六个方向的车，都在今天发。』' }
  ];

  var tree = { x: 750, y: 545 };

  var obstacles = [];
  buildings.forEach(function (b) { obstacles.push({ x: b.x, y: b.y, w: b.w, h: b.h }); });
  obstacles.push({ x: tree.x - 22, y: tree.y - 18, w: 44, h: 30 });
  obstacles.push({ x: 980, y: 930, w: 105, h: 130 });
  obstacles.push({ x: 1145, y: 930, w: 95, h: 130 });
  obstacles.push({ x: 40, y: 470, w: 260, h: 90 });
  obstacles.push({ x: 60, y: 700, w: 200, h: 150 });

  /* ---------- 小镇牧场（左侧中部，围栏围起来的一片地） ----------
   * v4.4：门口从 56 加宽到 84，并把门口正南方那块看不见的碰撞体删掉了。
   * （那块 180×120 的方块是 v1 遗留的，早就没有对应的东西画在那里，
   *   但它正好横在门口外面，人走到门口就被一堵空气墙挡住 —— 牧场一直进不去。） */
  var ranch = { x: 312, y: 648, w: 296, h: 224, gateX: 436, gateW: 84 };
  /* 围栏 + 马厩 + 干草垛 + 水槽都参与碰撞，只在下方留一道门 */
  obstacles.push({ x: 312, y: 648, w: 296, h: 12 });     // 上
  obstacles.push({ x: 312, y: 648, w: 12, h: 224 });     // 左
  obstacles.push({ x: 596, y: 648, w: 12, h: 224 });     // 右
  obstacles.push({ x: 312, y: 860, w: 124, h: 12 });     // 下（左半）
  obstacles.push({ x: 520, y: 860, w: 88, h: 12 });      // 下（右半）→ 中间 436~520 是门口
  obstacles.push({ x: 330, y: 660, w: 116, h: 88 });     // 马厩
  obstacles.push({ x: 546, y: 690, w: 44, h: 34 });      // 干草垛
  obstacles.push({ x: 424, y: 796, w: 56, h: 20 });      // 水槽

  /* 牧场里的动物：固定位置、只做原地小动作（不四处乱走），
     这样互动点不会飘，两个人从两台手机看到的也是同一个位置。 */
  var ranchAnimals = [
    { id: 'cow', kind: 'cow', x: 404, y: 800, name: '奶牛 · 奶油', goods: 'milk', goodsName: '牛奶' },
    { id: 'sheep', kind: 'sheep', x: 524, y: 806, name: '绵羊 · 云朵', goods: 'wool', goodsName: '羊毛' },
    { id: 'hen', kind: 'hen', x: 356, y: 812, name: '母鸡 · 布丁', goods: 'egg', goodsName: '鸡蛋' }
  ];
  var haystack = { x: 568, y: 704, name: '干草垛' };

  // ---------- NPC ----------
  var npcs = [
    { id: 'santa', x: 858, y: 648, name: '圣诞老人', lines: [
      'Ho Ho Ho！欢迎回到你们自己的小镇。',
      '这棵树的每一颗灯泡，都在等你们一起点亮。',
      '去镇子里走走吧——听说有些角落藏着你们旅行的回忆。',
      '小镇的一天很短，一天做好一件事就够啦，剩下的明天再说。'
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
    ] },
    /* ---------- v4.3 四个新邻居 ----------
       每个人都有明确的一摊事：邮差管信、面包师管吃的、牧羊女管牧场、
       老木匠管木头。玩家不用猜他们有什么用，聊两句就知道。 */
    { id: 'postman', x: 1120, y: 500, name: '邮差 · 阿信', style: 'postman', lines: [
      '有信——！啊，是你们俩呀。这个镇子的信，现在都归我送。',
      '去过的每个地方都能寄东西。地址嘛，藏在回忆里，找到了就写进本子。',
      '工坊里那个打包台是我钉的，寄出去的包裹从那儿走。',
      '寄出去要等一阵子才有回信——好饭不怕晚。'
    ], lateLines: [
      '今晚的灯亮成这样，我得加印一批明信片。',
      '你们寄出去的信，回信都堆成小山啦。'
    ] },
    { id: 'baker', x: 1300, y: 470, name: '面包师 · 麦香', style: 'baker', lines: [
      '刚出炉的，小心烫手。',
      '牧场要是挤出牛奶、下了蛋，拿来给我，我给你烤一炉。',
      '面粉、黄油、糖——少一样都不行，做东西这件事最讲道理。'
    ], lateLines: [
      '今天烤了一炉星星形状的，专门给你们留的。',
      '这么多人一起过节，面团都不够用啦。'
    ] },
    /* 小禾就站在牧场门口左边（v4.4 从围栏东侧挪过来）：
       以前她站在围栏外侧的过道上，看着像「牧场门口」，其实离门 160px，
       玩家进门的方向根本碰不到她；现在她在门柱旁边，走过去一定要经过。 */
    { id: 'shepherd', x: 414, y: 900, name: '牧羊女·小禾', style: 'shepherd', lines: [
      '奶油、云朵、布丁今天乖不乖？',
      '先喂饱，第二天才有得收——急不来的。',
      '干草垛每天能抱三捆，别一次全用完了。'
    ], lateLines: [
      '灯一亮，羊都不肯睡了。',
      '等雪再厚一点，我带它们去坡上跑跑。'
    ] },
    { id: 'carpenter', x: 872, y: 300, name: '老木匠 · 老鲁', style: 'carpenter', lines: [
      '木头是有脾气的，得顺着它的纹路来。',
      '礼盒我给你钉结实点，路上颠不坏。',
      '纸在工坊能做，别老想着去镇上买。'
    ], lateLines: [
      '这棵树做得漂亮，比我年轻时打的任何一件都好。',
      '活儿干完了，剩下的就是等日子。'
    ] }
  ];

  var doors = buildings.map(function (b) {
    return { id: b.id, type: 'building', x: b.x + b.w / 2, y: b.y + b.h + 8, name: b.name };
  });

  // ---------- 回忆彩蛋（数据来自 memories.js） ----------
  // 六个大型旅行地图的回忆不摆在小镇地上（由 maps.js 的 eggPos 定位）
  var eggs = (window.Memories || []).filter(function (m) { return !m.map && !m.room; });
  /* v4.2：藏进室内的回忆（cabin / cafe / greenhouse / workshop），按房间取自 memories.js */
  var roomEggs = (window.Memories || []).filter(function (m) { return !!m.room; });

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
    { x: 620, y: 470 }, { x: 890, y: 470 }, { x: 288, y: 706 }, { x: 950, y: 730 },
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

    if (b.kind === 'station') {
      /* 小镇车站：站牌 + 时钟 + 时刻表 + 站台雨棚 + 行李车 */
      var mid = b.x + b.w / 2;
      // 时刻表（六行小色块，暗示六个目的地）
      box(ctx, b.x + 18, wallTop + 16, 62, 62, '#2f3b46', { r: 4 });
      ctx.fillStyle = 'rgba(255,240,214,.85)';
      ctx.fillRect(b.x + 22, wallTop + 20, 54, 8);
      var destCols = ['#6fa8dc', '#e8b53f', '#e0814a', '#7fb3b8', '#d8b06a', '#a8c686'];
      for (var dr = 0; dr < 6; dr++) {
        ctx.fillStyle = destCols[dr];
        ctx.fillRect(b.x + 24, wallTop + 32 + dr * 7, 8, 4);
        ctx.fillStyle = 'rgba(240,232,214,.5)';
        ctx.fillRect(b.x + 36, wallTop + 33 + dr * 7, 34 - (dr % 3) * 5, 2.5);
      }
      // 时钟
      var ckx = b.x + b.w - 46, cky = wallTop + 26;
      ball(ctx, ckx, cky, 17, '#f4ead8', { outline: true });
      ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ckx, cky, 17, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ckx, cky); ctx.lineTo(ckx, cky - 11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ckx, cky); ctx.lineTo(ckx + 7, cky + 4); ctx.stroke();
      ctx.fillStyle = '#c0392b';
      for (var tk = 0; tk < 12; tk += 3) {
        var ta = tk / 12 * Math.PI * 2;
        ctx.fillRect(ckx + Math.sin(ta) * 13 - 1, cky - Math.cos(ta) * 13 - 1, 2, 2);
      }
      // 站台雨棚（左侧伸出来的一小段）
      ctx.fillStyle = '#7a5636';
      ctx.fillRect(b.x - 54, wallTop + 46, 6, 92);
      ctx.fillStyle = '#8c6a52';
      ctx.beginPath();
      ctx.moveTo(b.x - 66, wallTop + 48);
      ctx.lineTo(b.x + 6, wallTop + 30);
      ctx.lineTo(b.x + 6, wallTop + 40);
      ctx.lineTo(b.x - 66, wallTop + 58);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = '#f2f7fd';
      ctx.beginPath();
      ctx.moveTo(b.x - 66, wallTop + 48); ctx.lineTo(b.x + 6, wallTop + 30);
      ctx.lineTo(b.x + 6, wallTop + 34); ctx.lineTo(b.x - 66, wallTop + 52);
      ctx.closePath(); ctx.fill();
      // 站台上的一盏吊灯
      drawGlow(ctx, b.x - 32, wallTop + 62, 'rgba(255,214,140,.55)', 30, 0.9);
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath(); ctx.arc(b.x - 32, wallTop + 62, 5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#6b4a32'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(b.x - 32, wallTop + 42); ctx.lineTo(b.x - 32, wallTop + 57); ctx.stroke();
      // 门口旁的行李车
      var lcx = b.x + b.w - 34, lcy = wallTop + wallH - 6;
      box(ctx, lcx - 16, lcy - 16, 34, 20, '#8a6244', { r: 3 });
      box(ctx, lcx - 12, lcy - 30, 26, 15, '#a86454', { r: 3 });
      ctx.strokeStyle = '#6b4a32'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(lcx + 18, lcy - 18); ctx.lineTo(lcx + 26, lcy - 30); ctx.stroke();
      ball(ctx, lcx - 12, lcy + 5, 5, '#4a3020', { hi: false });
      ball(ctx, lcx + 10, lcy + 5, 5, '#4a3020', { hi: false });
      // 站牌的火车小图标
      ctx.fillStyle = '#4a3020';
      ctx.fillRect(b.x + b.w - 96, wallTop + 54, 26, 13);
      ctx.fillStyle = '#f4ead8';
      ctx.fillRect(b.x + b.w - 93, wallTop + 56, 20, 6);
      ctx.fillStyle = '#4a3020';
      ctx.beginPath(); ctx.arc(b.x + b.w - 90, wallTop + 68, 2.6, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(b.x + b.w - 76, wallTop + 68, 2.6, 0, 7); ctx.fill();
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

  /* 固定种子的伪随机（0~1）：同一个 seed 每次结果一样，
     这样枝尖的不规则形状在「实时画面 / 合照 / 缩略图」里永远一致，不会闪烁。 */
  function jag(seed, j) {
    var s = Math.sin(seed * 12.9898 + j * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  /* 层的外轮廓：两侧上是弧线，底缘是一排下垂的枝尖。
     seed 传了才加不规则（只有大圣诞树用），其它小树保持原来的规整形状。 */
  function firTierPath(ctx, cx, apexY, botY, halfW, tips, seed) {
    var span = botY - apexY;
    var notchY = botY - Math.max(5, halfW * 0.12);
    var rX = cx + halfW * 0.94, lX = cx - halfW * 0.94;
    var jAmpX = seed ? 2.2 + halfW * 0.030 : 0;
    var jAmpY = seed ? 1.6 + halfW * 0.020 : 0;
    ctx.beginPath();
    ctx.moveTo(cx, apexY);
    ctx.bezierCurveTo(cx + halfW * 0.50, apexY + span * 0.13,
                      cx + halfW * 0.90, apexY + span * 0.40, rX, notchY);
    for (var j = 0; j < tips; j++) {
      var x0 = rX + (lX - rX) * (j / tips);
      var x1 = rX + (lX - rX) * ((j + 1) / tips);
      var jx = seed ? (jag(seed, j) - 0.5) * jAmpX * 2 : 0;
      var jy = seed ? (jag(seed + 7.3, j) - 0.5) * jAmpY * 2 : 0;
      var xm = (x0 + x1) / 2 + (j % 2 ? 1.6 : -1.6) + jx;
      var tipY = botY + (halfW > 60 ? 5 : 2) + jy;
      ctx.quadraticCurveTo(x0 + (xm - x0) * 0.62, tipY - 3, xm, tipY);
      ctx.quadraticCurveTo(xm + (x1 - xm) * 0.38, tipY - 3, x1, notchY);
    }
    ctx.bezierCurveTo(cx - halfW * 0.90, apexY + span * 0.40,
                      cx - halfW * 0.50, apexY + span * 0.13, cx, apexY);
    ctx.closePath();
  }

  /* 只走底缘那条锯齿（用来压雪）——jitter 必须和上面完全一致，雪才贴着枝条 */
  function firEdgePath(ctx, cx, botY, halfW, tips, seed) {
    var notchY = botY - Math.max(5, halfW * 0.12);
    var rX = cx + halfW * 0.94, lX = cx - halfW * 0.94;
    var jAmpX = seed ? 2.2 + halfW * 0.030 : 0;
    var jAmpY = seed ? 1.6 + halfW * 0.020 : 0;
    ctx.beginPath();
    ctx.moveTo(rX, notchY);
    for (var j = 0; j < tips; j++) {
      var x0 = rX + (lX - rX) * (j / tips);
      var x1 = rX + (lX - rX) * ((j + 1) / tips);
      var jx = seed ? (jag(seed, j) - 0.5) * jAmpX * 2 : 0;
      var jy = seed ? (jag(seed + 7.3, j) - 0.5) * jAmpY * 2 : 0;
      var xm = (x0 + x1) / 2 + (j % 2 ? 1.6 : -1.6) + jx;
      var tipY = botY + (halfW > 60 ? 5 : 2) + jy;
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

  /* 层「表面」上的点：u 左右，v 从上(0)到下(1)。
     彩球要挂在面上、不能全挤在底缘，所以单独有这个函数。 */
  function surfPt(cx, apexY, botY, halfW, u, v) {
    var r = halfW * (0.13 + 0.87 * v);
    return {
      x: cx + r * u * 0.94,
      y: apexY + (botY - apexY) * v
    };
  }

  function firTier(ctx, cx, apexY, botY, halfW, tips, top, bottom, snowA, lit, seed, full) {
    // 底部暗影（把层与层分开）
    ctx.save();
    ctx.translate(0, 6);
    firTierPath(ctx, cx, apexY, botY, halfW, tips, seed);
    ctx.fillStyle = 'rgba(12,44,30,.42)';
    ctx.fill();
    ctx.restore();

    firTierPath(ctx, cx, apexY, botY, halfW, tips, seed);
    var g = ctx.createLinearGradient(cx - halfW * 0.55, apexY, cx + halfW * 0.6, botY);
    g.addColorStop(0, top);
    g.addColorStop(0.55, bottom);
    g.addColorStop(1, 'rgba(16,54,36,1)');
    ctx.fillStyle = g;
    ctx.fill();

    // 枝纹：几道顺着层的浅弧
    ctx.save();
    firTierPath(ctx, cx, apexY, botY, halfW, tips, seed);
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
    /* v4.1 放射状枝条：从层心向外散开，让整层有「编织」的质感，
       不再是一整块平的绿色。固定种子 → 每帧、每张照片都一样。 */
    var notchB = botY - Math.max(5, halfW * 0.12);
    ctx.lineWidth = Math.max(1, halfW * 0.015);
    var branchN = Math.min(tips, 7);
    for (var br = 0; br < branchN; br++) {
      var bu = -0.98 + 1.96 * (br / (branchN - 1));
      var ax0 = cx + halfW * 0.08 * bu;
      var ay0 = apexY + (botY - apexY) * 0.10;
      var bx0 = cx + halfW * 0.96 * bu;
      var by0 = notchB - (botY - apexY) * (0.02 + 0.12 * jag(seed + 9.1, br));
      ctx.beginPath();
      ctx.moveTo(ax0, ay0);
      ctx.quadraticCurveTo((ax0 + bx0) / 2, ay0 + (by0 - ay0) * 0.62, bx0, by0);
      ctx.strokeStyle = (br % 2 ? 'rgba(18,62,42,.17)' : 'rgba(156,214,178,.13)');
      ctx.stroke();
    }
    if (lit && !full) {   /* 满树阶段由树后的光柱负责暖光，这里省一次大半径渐变 */
      var lg2 = ctx.createRadialGradient(cx, apexY + (botY - apexY) * 0.55, 2, cx, apexY + (botY - apexY) * 0.55, halfW * 0.95);
      lg2.addColorStop(0, 'rgba(255,214,130,.13)');
      lg2.addColorStop(1, 'rgba(255,214,130,0)');
      ctx.fillStyle = lg2;
      ctx.fillRect(cx - halfW, apexY - 4, halfW * 2, botY - apexY + 8);
    }
    ctx.restore();

    // 左侧月光边：给圆锥一点体积
    ctx.save();
    firTierPath(ctx, cx, apexY, botY, halfW, tips, seed);
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
    firTierPath(ctx, cx, apexY, botY, halfW, tips, seed);
    ctx.stroke();

    /* 积雪（v4.1 重做）
       以前是沿锯齿描一条粗白线，放大看像贴在树上的白花边。
       现在改成：极薄的一道白边 + 每个枝尖一小团雪，雪只「落在枝头」，
       不在枝与枝之间拉横幅。 */
    if (snowA > 0) {
      firEdgePath(ctx, cx, botY, halfW, tips, seed);
      ctx.strokeStyle = 'rgba(232,244,255,' + Math.min(0.30, snowA * 0.30) + ')';
      ctx.lineWidth = Math.max(1.0, halfW * 0.014);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      var notchYs = botY - Math.max(5, halfW * 0.12);
      var sRX = cx + halfW * 0.94, sLX = cx - halfW * 0.94;
      for (var js = 0; js < tips; js++) {
        var sx0 = sRX + (sLX - sRX) * (js / tips);
        var sx1 = sRX + (sLX - sRX) * ((js + 1) / tips);
        var sjx = seed ? (jag(seed, js) - 0.5) * (2.2 + halfW * 0.030) * 2 : 0;
        var sjy = seed ? (jag(seed + 7.3, js) - 0.5) * (1.6 + halfW * 0.020) * 2 : 0;
        var sxm = (sx0 + sx1) / 2 + (js % 2 ? 1.6 : -1.6) + sjx;
        var stY = botY + (halfW > 60 ? 5 : 2) + sjy;
        var sr = Math.max(1.7, halfW * (0.022 + 0.016 * jag(seed + 2.2, js)) * (0.7 + snowA * 0.6));
        ctx.beginPath();
        ctx.ellipse(sxm, stY - sr * 0.45, sr * 1.55, sr * 0.80, 0, 0, 7);
        ctx.fillStyle = 'rgba(250,253,255,' + Math.min(0.95, snowA * 0.55 + 0.30) + ')';
        ctx.fill();
        /* 雪团上沿的一点冷高光，别让雪看起来像纯白纸片 */
        ctx.beginPath();
        ctx.ellipse(sxm - sr * 0.3, stY - sr * 0.72, sr * 0.85, sr * 0.34, 0, 0, 7);
        ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.8, snowA * 0.4 + 0.22) + ')';
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
        gg.addColorStop(0, 'rgba(255,238,180,.62)');
        gg.addColorStop(0.45, 'rgba(255,222,140,.24)');
        gg.addColorStop(1, 'rgba(255,222,140,0)');
        ctx.strokeStyle = gg;
        ctx.lineCap = 'round';
        ctx.lineWidth = 5.0;
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

  /* ============================================================
   * v4.1 大圣诞树
   * 成长阶段完全不变（0 树苗 / 1 挂上彩球 / 2 挂上彩灯 / 3 全树点亮），
   * 只把「看得见」的部分做厚：
   *   轮廓  每层枝尖带固定种子的轻微不规则，左右不再完全对称
   *   层次  树干从层间露出、层底压暗、亮灯后自下而上有一层暖光
   *   挂饰  按层排布 + 固定配色（暖金为主、红蓝点缀），下大上小，不再是随机彩球
   *   礼物  绕树根一圈，树后的先画（被枝叶遮住一点）、树前的后画
   *   终局  光柱 + 地面涟漪 + 柔和飘雪
   * 全部是固定算式，同一 t 重绘结果一致 → 合照 / 缩略图可复现、不会闪。
   * ============================================================ */

  /* 树下礼物：dx/dy 相对树根，back=1 表示摆在树后。
     顺序就是「得到的先后」：第 1~3 件第 1 阶就有，第 4~6 件第 2 阶，第 7~9 件满树时。 */
  var TREE_GIFTS = [
    [-54, 16, 28, 21, '#58b368', '#f4ead8', 0],
    [40, 14, 32, 25, '#f0a83c', '#7a3f2a', 0],
    [0, 24, 24, 18, '#c86bb1', '#fff0f8', 0],
    [-132, 4, 38, 28, '#d94c3a', '#f6ecd8', 0],
    [96, 6, 32, 25, '#4f86d6', '#eef4ff', 0],
    [-90, -8, 30, 24, '#f2e2a8', '#b4573f', 1],
    [-108, 20, 26, 20, '#e2754f', '#fdf6ea', 0],
    [78, 22, 24, 18, '#a97ed6', '#f7eefc', 0],
    [56, -6, 26, 21, '#6fbf8f', '#f4ead8', 1]
  ];
  /* 每个阶段树下摆几件：越往后越热闹 */
  var TREE_GIFT_N = [0, 3, 6, 9];

  /* 挂饰数量：每层几个（下密上疏），三个阶段明显不同 */
  var ORN_N = {
    1: [2, 2, 2, 1, 1],
    2: [4, 3, 3, 2, 1],
    3: [5, 5, 4, 3, 2]
  };
  /* 每个阶段只用一套配色：暖金打底，越往后才慢慢掺进红蓝绿 */
  var ORN_PALETTE = {
    1: ['#e3c07a', '#f2e2a8', '#c9905a'],
    2: ['#dc4f3c', '#e3c07a', '#4f86d6', '#f2e2a8', '#58b368'],
    3: ['#f2c869', '#dc4f3c', '#f9efcd', '#e3c07a', '#4f86d6', '#58b368', '#c86bb1']
  };

  /* back=true 画「树后那半圈」，false 画「树前那半圈」，中间隔着一整棵树。
     同侧再按 dy 从远到近排，靠前的礼物压住靠后的，才有堆叠感。 */
  function drawTreeGifts(ctx, x, y, stage, back) {
    var n = TREE_GIFT_N[Math.min(stage, 3)] || 0;
    var list = [];
    for (var i = 0; i < n && i < TREE_GIFTS.length; i++) {
      var gf = TREE_GIFTS[i];
      if (!!gf[6] !== !!back) continue;
      list.push(gf);
    }
    list.sort(function (a, b) { return a[1] - b[1]; });
    for (var k = 0; k < list.length; k++) {
      var g2 = list[k];
      giftBox(ctx, x + g2[0], y + g2[1], g2[2], g2[3], g2[4], g2[5]);
    }
  }

  function drawBigTree(ctx, tree, stage, t) {
    var x = tree.x, y = tree.y;
    var lit = stage >= 2, full = stage >= 3;

    // ---- 地面光池（点亮后才有）----
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

    // ---- 树后的暖晕 ----
    if (lit) {
      var halo = ctx.createRadialGradient(x, y - 190, 20, x, y - 190, 250);
      halo.addColorStop(0, 'rgba(255,206,120,' + (full ? 0.26 : 0.14) + ')');
      halo.addColorStop(0.6, 'rgba(255,190,110,' + (full ? 0.10 : 0.05) + ')');
      halo.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(x, y - 190, 250, 0, 7); ctx.fill();
    }

    // ---- 最终阶段：雪地上慢慢荡开的两圈光 ----
    if (full) {
      for (var rp = 0; rp < 2; rp++) {
        var ph = ((t / 2600) + rp * 0.5) % 1;
        ctx.save();
        ctx.translate(x, y + 8);
        ctx.scale(1, 0.34);
        ctx.beginPath();
        ctx.arc(0, 0, 92 + ph * 104, 0, 7);
        ctx.strokeStyle = 'rgba(255,228,160,' + (0.26 * (1 - ph)).toFixed(3) + ')';
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.restore();
      }
    }

    // ---- 基座：雪堆 ----
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

    // ---- 树后那圈礼物：先画，等下被最低一层枝叶压住一点 ----
    drawTreeGifts(ctx, x, y, stage, true);

    // ---- 树干 ----
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

    // ---- 最终阶段：从星落下来的光柱 ----
    /* v4.1：光柱改画在树「后面」。以前画在树身上，用 lighter 叠一层，
       整棵树会被冲成惨白的一团，层次全丢了。 */
    if (full) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var beam = ctx.createLinearGradient(x, y - 320, x, y + 10);
      beam.addColorStop(0, 'rgba(255,226,150,.30)');
      beam.addColorStop(0.5, 'rgba(255,226,150,.08)');
      beam.addColorStop(1, 'rgba(255,226,150,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 330);
      ctx.lineTo(x + 12, y - 330);
      ctx.lineTo(x + 132, y + 14);
      ctx.lineTo(x - 132, y + 14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // ---- 五层枝扇（seed 让每层的枝尖略微参差）----
    var tops = ['#3a8a5c', '#3d7a52', '#35804f', '#3c7a52', '#3a875a'];
    for (var i = 0; i < TREE_TIERS.length; i++) {
      var L = TREE_TIERS[i];
      firTier(ctx, x, y + L.apex, y + L.bot, L.half, L.tips,
        tops[i], i % 2 ? '#245f3e' : '#286843', 0.62 + i * 0.09, lit, 3.7 + i * 1.9, full);
    }

    // ---- 树前那圈礼物：画在枝叶之后，完整露出来 ----
    drawTreeGifts(ctx, x, y, stage, false);

    // ---- 彩球（stage>=1）----
    if (stage >= 1) {
      var pal = ORN_PALETTE[Math.min(stage, 3)] || ORN_PALETTE[1];
      var nTier = ORN_N[Math.min(stage, 3)] || ORN_N[1];
      var cIdx = 0;
      for (var oi = 0; oi < TREE_TIERS.length; oi++) {
        var Lr = TREE_TIERS[oi];
        var nO = nTier[oi] || 0;
        for (var k = 0; k < nO; k++) {
          /* 横向等分 + 固定抖动，纵向 0.46~0.90 错落 —— 挂满但不成排 */
          var jr = jag(4.1 + oi * 3.3, k);
          var u = -0.72 + 1.44 * ((k + 0.5) / nO) + (jr - 0.5) * 0.26;
          var vv = 0.46 + 0.44 * jag(9.7 + oi * 2.7, k);
          var pt = surfPt(x, y + Lr.apex, y + Lr.bot, Lr.half, u, vv);
          var r = 6.0 - oi * 0.45 + (Math.abs(u) > 0.55 ? 0.4 : 0) + jr * 0.5;
          if (stage >= 3 && cIdx % 7 === 3) r += 1.3;   // 少数大球当视觉重点
          var flick = full ? (0.62 + 0.38 * Math.sin(t / 560 + cIdx * 1.7)) : 1;
          if (lit && r > 5.2) drawGlow(ctx, pt.x, pt.y, 'rgba(255,232,168,' + (0.30 * flick + 0.10).toFixed(3) + ')', 12 + r, 0.8);
          ornament(ctx, pt.x, pt.y, r, pal[cIdx % pal.length]);
          cIdx++;
        }
      }
    }

    // ---- 灯串（stage>=2）----
    if (lit) {
      for (var gi = 0; gi < TREE_TIERS.length - 1; gi++) {
        var Lg = TREE_TIERS[gi];
        garland(ctx, x, y + Lg.apex, y + Lg.bot, Lg.half, t, gi * 1.7, full ? 1 : 0.72);
      }
    }

    // ---- 顶星 ----
    if (stage >= 2) {
      treeStar(ctx, x, y - 336, full ? 19 : 14, t, 1);
    } else {
      // 还没通电：只插一根尖枝
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 316);
      ctx.lineTo(x, y - 336);
      ctx.lineTo(x + 3, y - 316);
      ctx.closePath();
      ctx.fillStyle = '#2f744c';
      ctx.fill();
    }

    // ---- 星屑 + 飘雪（stage 3；光柱已经在树后面画过了）----
    if (full) {
      for (var sp = 0; sp < 9; sp++) {
        var a2 = (sp * 2.399) % (Math.PI * 2);
        var rr2 = 60 + ((sp * 53) % 110);
        var sx2 = x + Math.cos(a2) * rr2 * 1.15;
        var sy2 = y - 150 + Math.sin(a2) * rr2 * 1.45;
        var tw = 0.30 + 0.70 * Math.abs(Math.sin(t / 700 + sp * 1.7));
        ctx.beginPath();
        ctx.arc(sx2, sy2, 0.9 + tw * 1.1, 0, 7);
        ctx.fillStyle = 'rgba(255,246,205,' + (tw * 0.55).toFixed(3) + ')';
        ctx.fill();
      }

      /* 柔和的暖雪花：只在树周围一小圈，下落很慢，不抢灯 */
      for (var fl = 0; fl < 16; fl++) {
        var fx0 = jag(31.7, fl), fy0 = jag(57.1, fl);
        var fy = y - 340 + ((fy0 * 400 + t * (0.012 + fx0 * 0.010)) % 400);
        var fx = x - 165 + fx0 * 330 + Math.sin(t / 950 + fl * 1.3) * 11;
        var fa = 0.16 + 0.30 * (0.5 + 0.5 * Math.sin(t / 520 + fl * 2.1));
        ctx.beginPath();
        ctx.arc(fx, fy, 1.0 + fx0 * 1.5, 0, 7);
        ctx.fillStyle = 'rgba(255,250,236,' + fa.toFixed(3) + ')';
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

  /* ---------- v4.3 信封（六张旅行地图里的回忆改成这个）----------
     一张真正能看出来是「信」的纸：信封主体 + 折下来的封盖 + 一枚蜡封 +
     很轻的呼吸光。地图里一直可见，走近可以拆开。 */
  function drawEnvelope(ctx, e, t, dim) {
    var x = e.x, y = e.y;
    var bob = dim ? 0 : Math.sin((t || 0) / 760 + (x || 0) * 0.012) * 1.5;
    var rot = Math.sin((t || 0) / 1300 + (y || 0) * 0.01) * 0.035;
    var col = e.color || '#c0392b';
    ctx.save();
    ctx.translate(x, y + bob);

    // 地面上的暖光池：远处看不出是信，但走近会看到一小块「这里有点不一样」
    if (!dim) {
      var pool = ctx.createRadialGradient(0, 8, 0, 0, 8, 26);
      pool.addColorStop(0, 'rgba(255,226,160,.22)');
      pool.addColorStop(1, 'rgba(255,226,160,0)');
      ctx.fillStyle = pool;
      ctx.beginPath(); ctx.ellipse(0, 8, 26, 9, 0, 0, Math.PI * 2); ctx.fill();
    }

    // 地面投影（跟着浮起来的高度收一点）
    ctx.save();
    ctx.translate(0, -bob + 2);
    ctx.fillStyle = 'rgba(52,72,100,.22)';
    ctx.beginPath(); ctx.ellipse(0, 8.4, 17.0, 4.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* 整封信放大到 1.45 倍：原来 22×15 世界像素，缩到 0.8 倍取景后
       只有 18×12，压在长椅上完全看不出来是一封信。 */
    ctx.scale(1.45, 1.45);

    // 呼吸光（拆过的信不再发光，只剩一张安静躺着的纸）
    var gl = dim ? 0 : (0.55 + 0.45 * Math.sin((t || 0) / 900));
    if (gl > 0) {
      var rg = ctx.createRadialGradient(0, 0, 1, 0, 0, 26);
      rg.addColorStop(0, 'rgba(255,232,178,' + (0.20 * gl).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(255,232,178,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
    }

    ctx.rotate(rot);

    // 信封主体
    ctx.beginPath();
    ctx.moveTo(-11.4, -7.2);
    ctx.lineTo(11.4, -7.2);
    ctx.lineTo(11.4, 7.2);
    ctx.lineTo(-11.4, 7.2);
    ctx.closePath();
    ctx.fillStyle = '#f6eddc';
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,52,36,.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 内页露出来的一条边（暗示里面真的有东西）
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-11.4, -7.2); ctx.lineTo(11.4, -7.2); ctx.lineTo(11.4, -4.6); ctx.lineTo(-11.4, -4.6);
    ctx.closePath();
    ctx.fillStyle = '#fffaf0';
    ctx.fill();
    ctx.restore();

    // 封盖（倒三角）
    ctx.beginPath();
    ctx.moveTo(-11.4, -7.2);
    ctx.lineTo(0, 1.6);
    ctx.lineTo(11.4, -7.2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(232,220,196,.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,52,36,.5)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // 两侧的折线
    ctx.strokeStyle = 'rgba(74,52,36,.22)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-11.4, 7.2); ctx.lineTo(-2.6, -0.6);
    ctx.moveTo(11.4, 7.2); ctx.lineTo(2.6, -0.6);
    ctx.stroke();

    // 蜡封（用回忆的色）
    ctx.beginPath();
    ctx.arc(0, 1.2, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,30,24,.45)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-0.9, 0.4, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fill();

    ctx.restore();
  }

  function drawRoomEggs(ctx, t, self, roomId, found) {
    /* v4.3：和地上那六段一样，收过就不再画，只留一点极轻的浮动痕迹、不再写字提示；
       走近到 26px 会自动收下（game.js 的 autoPickEggs）。 */
    var list = roomEggs.filter(function (m) { return m.room === roomId; });
    if (!list.length) return;
    list = list.filter(function (m) { return !(found && found[m.id]); });
    if (!list.length) return;
    list.forEach(function (e, i) { drawTrace(ctx, e, i + 3); });
    if (!self) return;
    list.forEach(function (e) {
      var dx = self.x - e.x, dy = self.y - e.y;
      var d2 = dx * dx + dy * dy;
      if (d2 > 150 * 150) return;
      var a = d2 > 90 * 90 ? Math.max(0, (150 - Math.sqrt(d2)) / 60) : 1;
      ctx.save();
      ctx.globalAlpha = 0.10 + 0.34 * a;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 6, 9, 3, 0, 0, 7);
      ctx.fillStyle = 'rgba(255,238,196,.5)';
      ctx.fill();
      ctx.restore();
    });
  }


  /* ============================================================
     v4.2 牧场：围栏 / 马厩 / 干草垛 / 水槽 + 三种动物
     画风和镇上其它东西一致（box + ball + 落影），动物只做原地小动作。
     ============================================================ */
  function ranchPost(ctx, x, y, h) {
    box(ctx, x - 3.5, y - h, 7, h, '#8a6244', { r: 2 });
    ctx.fillStyle = 'rgba(255,245,225,.35)';
    ctx.fillRect(x - 2.5, y - h + 1, 1.6, h - 3);
    /* 柱头的雪 */
    ctx.fillStyle = '#f4f9ff';
    ctx.beginPath(); ctx.ellipse(x, y - h, 5, 2.2, 0, 0, 7); ctx.fill();
  }
  function ranchRails(ctx, x1, y1, x2, y2) {
    ctx.strokeStyle = '#a9793f';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    var offs = [-13, -6];
    for (var i = 0; i < offs.length; i++) {
      ctx.beginPath();
      ctx.moveTo(x1, y1 + offs[i]);
      ctx.lineTo(x2, y2 + offs[i]);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(70,44,26,.45)';
    ctx.lineWidth = 1;
    for (var j = 0; j < offs.length; j++) {
      ctx.beginPath();
      ctx.moveTo(x1, y1 + offs[j] + 1.6);
      ctx.lineTo(x2, y2 + offs[j] + 1.6);
      ctx.stroke();
    }
  }

  function drawRanchGround(ctx, t) {
    var r = ranch;
    /* 踩出来的地面：一层浅泥 + 一层雪，边界不用太规整 */
    ctx.fillStyle = 'rgba(146,126,104,.20)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(r.x + 6, r.y + 8, r.w - 12, r.h - 14, 14); else ctx.rect(r.x + 6, r.y + 8, r.w - 12, r.h - 14);
    ctx.fill();
    var spots = [[380, 720], [470, 760], [430, 830], [540, 780], [360, 800], [500, 700]];
    for (var i = 0; i < spots.length; i++) {
      ctx.fillStyle = 'rgba(150,130,108,.16)';
      ctx.beginPath();
      ctx.ellipse(spots[i][0], spots[i][1], 26 + (i % 3) * 8, 9 + (i % 2) * 4, 0, 0, 7);
      ctx.fill();
    }
    /* 蹄印 */
    ctx.fillStyle = 'rgba(120,102,84,.26)';
    for (var k = 0; k < 14; k++) {
      var px = 350 + ((k * 53) % 220), py = 700 + ((k * 71) % 150);
      ctx.beginPath(); ctx.ellipse(px, py, 2.4, 1.6, 0.4, 0, 7); ctx.fill();
    }

    /* 马厩 */
    var bx = 330, by = 660, bw = 116, bh = 88;
    shadow(ctx, bx + bw / 2, by + bh + 2, bw * 0.46, 7);
    box(ctx, bx, by + 26, bw, bh - 26, '#a4553f', { r: 3 });
    /* 木板缝 */
    ctx.strokeStyle = 'rgba(70,32,22,.35)'; ctx.lineWidth = 1;
    for (var vx = bx + 14; vx < bx + bw; vx += 18) {
      ctx.beginPath(); ctx.moveTo(vx, by + 28); ctx.lineTo(vx, by + bh); ctx.stroke();
    }
    /* 屋顶 */
    ctx.beginPath();
    ctx.moveTo(bx - 10, by + 28);
    ctx.lineTo(bx + bw / 2, by - 6);
    ctx.lineTo(bx + bw + 10, by + 28);
    ctx.closePath();
    ctx.fillStyle = '#7a3f2e'; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke();
    /* 屋顶的雪 */
    ctx.fillStyle = 'rgba(248,252,255,.92)';
    ctx.beginPath();
    ctx.moveTo(bx - 6, by + 26);
    ctx.lineTo(bx + bw / 2, by - 3);
    ctx.lineTo(bx + bw + 6, by + 26);
    ctx.lineTo(bx + bw + 1, by + 30);
    ctx.lineTo(bx + bw / 2, by + 4);
    ctx.lineTo(bx - 1, by + 30);
    ctx.closePath(); ctx.fill();
    /* 门 + 白边 + 干草塞在门口 */
    box(ctx, bx + 38, by + 52, 40, bh - 52, '#6b432c', { r: 2 });
    ctx.strokeStyle = '#f0e6d2'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx + 58, by + 52); ctx.lineTo(bx + 58, by + bh); ctx.stroke();
    ctx.fillStyle = '#d9b96a';
    ctx.fillRect(bx + 42, by + bh - 10, 32, 8);
    /* 小窗：暖光 */
    box(ctx, bx + 16, by + 46, 16, 14, '#f7dfa8', { r: 2 });
    drawGlow(ctx, bx + 24, by + 53, 'rgba(255,214,150,.30)', 34, 0.8);

    /* 干草垛 */
    var hx = 546, hy = 690, hw = 44, hh = 34;
    shadow(ctx, hx + hw / 2, hy + hh + 1, 22, 5);
    box(ctx, hx, hy + 14, hw, hh - 14, '#c9a45c', { r: 3 });
    box(ctx, hx + 4, hy + 2, hw - 8, 18, '#dcb96f', { r: 5 });
    ctx.strokeStyle = 'rgba(150,112,48,.5)'; ctx.lineWidth = 1;
    for (var s2 = 0; s2 < 5; s2++) {
      ctx.beginPath(); ctx.moveTo(hx + 3, hy + 8 + s2 * 6); ctx.lineTo(hx + hw - 3, hy + 9 + s2 * 6); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(248,252,255,.85)';
    ctx.beginPath(); ctx.ellipse(hx + hw / 2, hy + 3, hw * 0.38, 4, 0, 0, 7); ctx.fill();

    /* 水槽 */
    var tx = 424, ty = 796, tw = 56, th = 20;
    shadow(ctx, tx + tw / 2, ty + th, 26, 4);
    box(ctx, tx, ty, tw, th, '#9a8f7c', { r: 3 });
    ctx.fillStyle = '#7fb6d8';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(tx + 4, ty + 3, tw - 8, th - 9, 3); else ctx.rect(tx + 4, ty + 3, tw - 8, th - 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.fillRect(tx + 7, ty + 5, tw - 20, 2);

    /* 围栏 */
    var r2 = ranch;
    var stepX = 33;
    for (var fx = r2.x + 6; fx <= r2.x + r2.w - 6; fx += stepX) {
      ranchPost(ctx, fx, r2.y + 12, 26);
      if (Math.abs(fx - r2.gateX - 2) > 30) ranchPost(ctx, fx, r2.y + r2.h - 4, 26);
    }
    for (var fy = r2.y + 30; fy <= r2.y + r2.h - 10; fy += stepX) {
      ranchPost(ctx, r2.x + 6, fy, 26);
      ranchPost(ctx, r2.x + r2.w - 6, fy, 26);
    }
    ranchRails(ctx, r2.x + 6, r2.y + 12, r2.x + r2.w - 6, r2.y + 12);
    ranchRails(ctx, r2.x + 6, r2.y + 12, r2.x + 6, r2.y + r2.h - 4);
    ranchRails(ctx, r2.x + r2.w - 6, r2.y + 12, r2.x + r2.w - 6, r2.y + r2.h - 4);
    ranchRails(ctx, r2.x + 6, r2.y + r2.h - 4, r2.gateX, r2.y + r2.h - 4);
    ranchRails(ctx, r2.gateX + r2.gateW, r2.y + r2.h - 4, r2.x + r2.w - 6, r2.y + r2.h - 4);
    /* 门柱高一点，顶上一盏小灯 */
    ranchPost(ctx, r2.gateX, r2.y + r2.h - 4, 34);
    ranchPost(ctx, r2.gateX + r2.gateW, r2.y + r2.h - 4, 34);
    ball(ctx, r2.gateX + r2.gateW / 2, r2.y + r2.h - 4, 3.2, '#f2e2a8', { outline: false });
    drawGlow(ctx, r2.gateX + r2.gateW / 2, r2.y + r2.h - 4, 'rgba(255,214,150,.24)', 26, 0.8);

    /* 门就是开着的：两根门柱之间空出来，谁都能走进去。
       （门口不放任何带碰撞的东西——这里曾经被一块看不见的旧碰撞体堵死过。） */
    /* 门口的一块踏石：告诉人「这里能走进去」 */
    ctx.fillStyle = 'rgba(206,212,222,.75)';
    ctx.beginPath();
    ctx.ellipse(r2.gateX + r2.gateW / 2, r2.y + r2.h + 12, 34, 9, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,160,176,.55)'; ctx.lineWidth = 1.4; ctx.stroke();

    /* 门口被踩出来的一条小路：从门洞一直通到广场 */
    ctx.fillStyle = 'rgba(150,128,104,.18)';
    ctx.beginPath();
    ctx.moveTo(r2.gateX + 12, r2.y + r2.h + 6);
    ctx.lineTo(r2.gateX + r2.gateW - 12, r2.y + r2.h + 6);
    ctx.lineTo(r2.gateX + r2.gateW + 2, r2.y + r2.h + 74);
    ctx.lineTo(r2.gateX - 2, r2.y + r2.h + 74);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(120,102,84,.14)';
    for (var pt2 = 0; pt2 < 6; pt2++) {
      ctx.beginPath();
      ctx.ellipse(r2.gateX + 26 + (pt2 % 2) * 40, r2.y + r2.h + 14 + pt2 * 10, 6, 2.6, 0, 0, 7);
      ctx.fill();
    }

    /* 门口旁边的零碎：奶罐 + 水桶 + 一小堆干草屑（都放在门右侧，别挡路） */
    var mx = r2.gateX + r2.gateW + 30, my = r2.y + r2.h + 30;
    shadow(ctx, mx + 7, my + 1, 9, 3);
    box(ctx, mx, my - 24, 15, 25, '#b9c0c6', { r: 4 });
    ctx.fillStyle = '#8e989f';
    ctx.fillRect(mx, my - 16, 15, 2);
    ctx.fillStyle = '#d7dde1';
    ctx.beginPath(); ctx.ellipse(mx + 7, my - 25, 7, 2.4, 0, 0, 7); ctx.fill();
    var bx2 = r2.gateX + r2.gateW + 56, by2 = r2.y + r2.h + 26;
    shadow(ctx, bx2 + 6, by2 + 1, 8, 2.6);
    box(ctx, bx2, by2 - 13, 12, 13, '#8a6244', { r: 3 });
    ctx.fillStyle = '#7a5334';
    ctx.beginPath(); ctx.ellipse(bx2 + 6, by2 - 13, 6, 2, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#b98d5a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(bx2 + 6, by2 - 14, 5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.fillStyle = 'rgba(201,164,92,.75)';
    for (var hs = 0; hs < 5; hs++) {
      ctx.fillRect(bx2 + 18 + hs * 3, by2 - 4 - (hs % 2) * 2, 5, 2);
    }

    /* 木牌：挪到门左边，别挡着门口 */
    var sgx = r2.gateX - 92, sgy = r2.y + r2.h + 34;
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(sgx + 10, sgy - 6, 4, 18);
    box(ctx, sgx - 6, sgy - 24, 52, 20, '#a9793f', { r: 3 });
    ctx.fillStyle = '#f7f1e4';
    ctx.font = '600 10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🐄 牧场', sgx + 20, sgy - 10);
    ctx.textAlign = 'left';
  }

  /* ---- 三只动物：只用基本图形，靠小动作显得活着 ---- */
  function drawAnimal(ctx, a, t) {
    var bob = Math.sin(t / 640 + a.x * 0.05) * 1.1;
    var x = a.x, y = a.y;
    if (a.kind === 'cow') {
      shadow(ctx, x, y + 2, 24, 5);
      /* 腿 */
      ctx.fillStyle = '#5b4332';
      [-13, -4, 8, 16].forEach(function (lx) { ctx.fillRect(x + lx, y - 12, 4, 13); });
      /* 身体 */
      ctx.fillStyle = '#f4f1ea';
      ctx.beginPath(); ctx.ellipse(x, y - 20 + bob, 23, 14, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();
      /* 斑块 */
      ctx.fillStyle = '#6b4a35';
      ctx.beginPath(); ctx.ellipse(x - 8, y - 24 + bob, 7, 5.4, 0.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 9, y - 17 + bob, 6, 4.6, -0.4, 0, 7); ctx.fill();
      /* 头 */
      ctx.fillStyle = '#f4f1ea';
      ctx.beginPath(); ctx.ellipse(x + 20, y - 26 + bob, 9, 8, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.3; ctx.stroke();
      /* 耳朵 / 角 */
      ctx.fillStyle = '#e8dfd0';
      ctx.beginPath(); ctx.ellipse(x + 13, y - 32 + bob, 4, 3, -0.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#d8cbb4';
      ctx.beginPath(); ctx.ellipse(x + 26, y - 32 + bob, 3.4, 2.6, 0.4, 0, 7); ctx.fill();
      /* 鼻子 */
      ctx.fillStyle = '#e6b7b0';
      ctx.beginPath(); ctx.ellipse(x + 27, y - 23 + bob, 4.6, 3.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#4a3020';
      ctx.beginPath(); ctx.arc(x + 24, y - 28 + bob, 1.1, 0, 7); ctx.fill();
      /* 尾巴 */
      var sw = Math.sin(t / 500) * 3;
      ctx.strokeStyle = '#6b4a35'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x - 22, y - 24 + bob); ctx.lineTo(x - 27 + sw, y - 14 + bob); ctx.stroke();
    } else if (a.kind === 'sheep') {
      shadow(ctx, x, y + 2, 21, 4.5);
      ctx.fillStyle = '#4a4038';
      [-9, -1, 7, 13].forEach(function (lx) { ctx.fillRect(x + lx, y - 10, 3.4, 11); });
      /* 云朵一样的身子 */
      ctx.fillStyle = '#f8f6f0';
      var puffs = [[-12, -18, 12], [0, -23, 13], [12, -18, 11], [2, -14, 12]];
      puffs.forEach(function (p) {
        ctx.beginPath(); ctx.arc(x + p[0], y + p[1] + bob, p[2], 0, 7); ctx.fill();
      });
      ctx.strokeStyle = 'rgba(74,64,56,.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x - 12, y - 18 + bob, 12, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 12, y - 18 + bob, 11, 0, 7); ctx.stroke();
      /* 头 */
      ctx.fillStyle = '#4a4038';
      ctx.beginPath(); ctx.ellipse(x + 18, y - 22 + bob, 7, 6.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#f8f6f0';
      ctx.beginPath(); ctx.ellipse(x + 15, y - 27 + bob, 5, 4, 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = '#2f2a25';
      ctx.beginPath(); ctx.arc(x + 22, y - 23 + bob, 1.1, 0, 7); ctx.fill();
    } else {
      /* 母鸡：啄食的小动作 */
      var peck = Math.max(0, Math.sin(t / 340)) * 3.4;
      shadow(ctx, x, y + 1, 11, 3);
      ctx.fillStyle = '#c98f3f';
      ctx.fillRect(x - 4, y - 5, 2, 6);
      ctx.fillRect(x + 3, y - 5, 2, 6);
      ctx.fillStyle = '#f0e3cc';
      ctx.beginPath(); ctx.ellipse(x, y - 10 + bob, 10, 8, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
      /* 翅膀 */
      ctx.fillStyle = '#e2d1b4';
      ctx.beginPath(); ctx.ellipse(x - 2, y - 9 + bob, 6, 4.4, 0.2, 0, 7); ctx.fill();
      /* 尾羽 */
      ctx.fillStyle = '#d9a06a';
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 13 + bob);
      ctx.lineTo(x - 16, y - 17 + bob);
      ctx.lineTo(x - 9, y - 8 + bob);
      ctx.closePath(); ctx.fill();
      /* 头（啄食时往下点） */
      var hy = y - 17 + bob + peck * 0.6;
      ctx.fillStyle = '#f4ead6';
      ctx.beginPath(); ctx.arc(x + 8, hy, 5, 0, 7); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.1; ctx.stroke();
      /* 鸡冠 */
      ctx.fillStyle = '#d94c3a';
      ctx.beginPath(); ctx.arc(x + 6, hy - 4.4, 2.1, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 9, hy - 5, 2.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 11.6, hy - 3.8, 1.8, 0, 7); ctx.fill();
      /* 嘴 */
      ctx.fillStyle = '#e8a23c';
      ctx.beginPath();
      ctx.moveTo(x + 12.6, hy - 0.6); ctx.lineTo(x + 17, hy + 0.8); ctx.lineTo(x + 12.6, hy + 2.2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2f2a25';
      ctx.beginPath(); ctx.arc(x + 9.4, hy - 1.4, 1, 0, 7); ctx.fill();
    }
  }

  /* ---------- 地上的回忆（v4.3：彻底藏起来）----------
     以前的版本会在 60px 内浮一句「看看这里…」，等于把位置摊开了。
     现在完全没有文字：远看是一片雪，只有走到 150px 以内，
     那张纸片才慢慢浮出来（越近越清楚），走到脚边（24px）就自动捡起来。
     已经捡走的不再画——它就真的从地上消失了。 */
  function drawEggs(ctx, t, self, found) {
    eggs.forEach(function (e, i) {
      if (found && found[e.id]) return;
      var d2 = 1;
      if (self) {
        var dx = self.x - e.x, dy = self.y - e.y;
        d2 = dx * dx + dy * dy;
        if (d2 > 150 * 150) return;
        var a = (150 - Math.sqrt(d2)) / 150;      // 150px 外 0，脚边 1
        ctx.save();
        ctx.globalAlpha = 0.12 + 0.72 * a * a;
        drawTrace(ctx, e, i);
        ctx.restore();
        return;
      }
      drawTrace(ctx, e, i);
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
      ] },
      { id: 'photos', x: 706, y: 112, r: 92, name: '🖼️ 照片墙', lines: [
        '三张小相框并排挂着：一湖、一桥、一片海。',
        '都是在路上拍的。等照片再多几张，这面墙就挂满了。'
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
      if (ROOM_PROPS.cabin) ROOM_PROPS.cabin(ctx, t);   // v4.1 房间装饰

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
      ] },
      { id: 'table2', x: 646, y: 382, r: 84, name: '🕯️ 角落的小桌', lines: [
        '角落的小桌，桌上一支红蜡烛，火苗很稳。',
        '两个位置，刚好够把手放在一起。'
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
      if (ROOM_PROPS.cafe) ROOM_PROPS.cafe(ctx, t);   // v4.1 房间装饰
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
    interactables: [
      { id: 'bench', x: 92, y: 492, r: 80, name: '🪑 温室长椅', lines: [
        '长椅上落了一层薄土，坐下去能闻到泥土和青草的味道。',
        '从这里看过去，六块地里的东西都在慢慢长。'
      ] }
    ],
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
      if (ROOM_PROPS.greenhouse) ROOM_PROPS.greenhouse(ctx, t);   // v4.1 房间装饰
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
      ] },
      /* v4.2.1 的房间里本来就画了这张包装台，但一直点不动——现在它是工坊的正事：
         把礼盒寄到一个有地址的地方，过一阵子对方会寄回当地特产。 */
      { id: 'pack', x: 722, y: 366, r: 78, name: '📮 打包 · 寄包裹', lines: [
        '包装台上摆着彩带、麻绳和一沓空白地址签。',
        '（选一个去过的地方，把礼盒寄出去。）'
      ] },
      { id: 'stove', x: 92, y: 430, r: 86, name: '🔥 小暖炉', lines: [
        '铁炉子烧得暖暖的，手放上去一会儿就不冷了。',
        '「做东西之前先烤烤手，」这是你们俩定下的规矩。'
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
      if (ROOM_PROPS.workshop) ROOM_PROPS.workshop(ctx, t);   // v4.1 房间装饰
      // 出门垫
      ctx.fillStyle = 'rgba(245,250,255,.5)';
      ctx.beginPath(); ctx.ellipse(this.exit.x, this.exit.y + 14, 46, 12, 0, 0, 7); ctx.fill();
      box(ctx, this.exit.x - 26, this.exit.y, 52, 24, '#5b3d29', { r: 3 });
      ctx.fillStyle = '#f4ead8'; ctx.font = '10px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('出门 ▸ 小镇', this.exit.x, this.exit.y + 15);
    }
  };

  /* ============================================================
   * v4.1 室内装饰
   *   每个房间按用途补一批家具，全部画在原有 draw 的末尾：
   *   原有家具、互动台、出口、碰撞一律不动，新家具只补空着的角落。
   *   颜色沿用各房间原有的木色 / 暖光，不引入新色系。
   * ============================================================ */
  /* 靠垫：圆角 + 上沿高光 + 下沿压暗，别再画成一块纯色方块 */
  function propCushion(ctx, x, y, w, h, col) {
    box(ctx, x, y, w, h, col, { r: Math.min(8, h * 0.42), shade: true });
    box(ctx, x + 3, y + 2.5, w - 6, Math.max(2, h * 0.26), 'rgba(255,255,255,.22)', { r: 3, outline: false });
    ctx.strokeStyle = 'rgba(60,30,16,.26)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 4, y + h - 3.5); ctx.lineTo(x + w - 4, y + h - 3.5); ctx.stroke();
  }
  /* 马克杯：杯身 + 杯口 + 把手 + 落影 */
  function propMug(ctx, x, y, s, col) {
    box(ctx, x, y, s, s * 1.02, col, { r: Math.max(2, s * 0.28), hi: true });
    ctx.fillStyle = 'rgba(60,36,20,.30)';
    ctx.beginPath(); ctx.ellipse(x + s / 2, y + 1.2, s * 0.40, s * 0.16, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, s * 0.16); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x + s + s * 0.06, y + s * 0.48, s * 0.26, -1.15, 1.15); ctx.stroke();
  }

  var ROOM_PROPS = {
    /* ---------- 小屋：客厅 ---------- */
    cabin: function (ctx, t) {
      /* 茶几（地毯中央，压在地毯上但看得见腿） */
      shadow(ctx, 410, 414, 58, 8);
      box(ctx, 366, 372, 88, 13, '#7a5236', { r: 4 });
      ctx.fillStyle = 'rgba(255,235,200,.16)'; ctx.fillRect(366, 372, 88, 4);
      [[372, 385], [444, 385]].forEach(function (lg) { box(ctx, lg[0], lg[1], 8, 26, '#5b3d29', { r: 2 }); });
      // 桌上：两只杯子 + 小蜡烛
      [[390, 360], [420, 360]].forEach(function (m) {
        box(ctx, m[0], m[1], 16, 13, '#f4ead8', { r: 3 });
        ctx.fillStyle = '#6b4226'; ctx.fillRect(m[0] + 2, m[1] + 2, 12, 4);
        ctx.strokeStyle = '#f4ead8'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(m[0] + 16, m[1] + 4); ctx.lineTo(m[0] + 20, m[1] + 4); ctx.stroke();
      });
      ball(ctx, 440, 358, 6, '#c0392b', { outline: false });
      drawGlow(ctx, 440, 348, 'rgba(255,190,110,.55)', 22, 0.9 + 0.1 * Math.sin(t / 400));

      /* 落地灯（右下角，暖光落在沙发边） */
      ctx.fillStyle = '#5b3d29'; ctx.fillRect(700, 350, 5, 96);
      ctx.fillStyle = '#4a3020';
      ctx.beginPath(); ctx.ellipse(702, 448, 18, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8c98a';
      ctx.beginPath();
      ctx.moveTo(680, 350); ctx.lineTo(724, 350); ctx.lineTo(716, 316); ctx.lineTo(688, 316);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(90,60,35,.55)'; ctx.lineWidth = 1.4; ctx.stroke();
      drawGlow(ctx, 702, 344, 'rgba(255,206,130,.46)', 96, 0.9);

      /* 树下的礼物盒（大小三只，错开摆） */
      box(ctx, 566, 196, 30, 24, '#c0392b', { r: 3 });
      ctx.fillStyle = '#f0c040'; ctx.fillRect(579, 196, 5, 24); ctx.fillRect(566, 206, 30, 4);
      box(ctx, 602, 202, 22, 18, '#35845a', { r: 3 });
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(611, 202, 4, 18);
      box(ctx, 578, 214, 18, 14, '#4f86d6', { r: 3 });
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(585, 214, 4, 14);

      /* 唱片柜（左下，靠书架） */
      box(ctx, 48, 384, 66, 56, '#7a5236', { r: 4 });
      ctx.fillStyle = '#5b3d29'; ctx.fillRect(54, 392, 54, 18);
      for (var rc = 0; rc < 4; rc++) {
        ctx.fillStyle = ['#c0392b', '#4f86d6', '#f0a83c', '#c86bb1'][rc];
        ctx.fillRect(56 + rc * 13, 396, 10, 10);
      }
      ctx.fillStyle = '#2b2119'; ctx.fillRect(54, 416, 54, 18);
      ball(ctx, 78, 425, 7, '#1a1512', { outline: false });
      ball(ctx, 78, 425, 2, '#f0c040', { outline: false });

      /* 墙上的钟（放在相框左边的空墙上） */
      ball(ctx, 612, 46, 17, '#f4ead8', { hi: true });
      ctx.strokeStyle = '#5b3d29'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(612, 46, 17, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(90,60,35,.5)'; ctx.lineWidth = 1;
      for (var tic = 0; tic < 12; tic++) {
        var ta = tic * Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(612 + Math.cos(ta) * 13, 46 + Math.sin(ta) * 13);
        ctx.lineTo(612 + Math.cos(ta) * 15.5, 46 + Math.sin(ta) * 15.5);
        ctx.stroke();
      }
      ctx.strokeStyle = '#5b3d29'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(612, 46); ctx.lineTo(612, 35); ctx.moveTo(612, 46); ctx.lineTo(620, 50); ctx.stroke();
      ball(ctx, 612, 46, 2, '#c0392b', { outline: false });

      /* 照片墙：三张小相框（挂着你们去过的地方） */
      var frames = [[694, 22, 34, 26, '#4f86d6'], [734, 18, 40, 30, '#2f7fb8'], [782, 26, 30, 24, '#b07a3c']];
      frames.forEach(function (f) {
        ctx.fillStyle = '#f0c040';
        ctx.fillRect(f[0], f[1], f[2], f[3]);
        ctx.fillStyle = f[4];
        ctx.fillRect(f[0] + 3, f[1] + 3, f[2] - 6, f[3] - 6);
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.fillRect(f[0] + 4, f[1] + f[3] - 8, f[2] - 8, 2);
      });
    },

    /* ---------- 咖啡店 ---------- */
    cafe: function (ctx, t) {
      /* 角落第二张小桌（右下）：圆桌面 + 木纹 + 柱脚 + 底盘 */
      var tcx = 646, tcy = 356;
      shadow(ctx, tcx, 402, 42, 10);
      ctx.fillStyle = '#4a3020';
      ctx.beginPath(); ctx.ellipse(tcx, 400, 20, 5.5, 0, 0, 7); ctx.fill();
      box(ctx, tcx - 5, tcy + 2, 10, 42, '#6b4a2f', { r: 2, outline: false });
      /* 桌面：椭圆 + 上下两段，才有厚度 */
      ctx.beginPath(); ctx.ellipse(tcx, tcy + 4, 37, 12.5, 0, 0, 7);
      ctx.fillStyle = '#7a4f32'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(tcx, tcy, 37, 12.5, 0, 0, 7);
      var tg = ctx.createLinearGradient(tcx - 37, tcy - 13, tcx + 37, tcy + 13);
      tg.addColorStop(0, '#c08f63'); tg.addColorStop(0.55, '#a87a52'); tg.addColorStop(1, '#8a5c3a');
      ctx.fillStyle = tg; ctx.fill();
      ctx.strokeStyle = 'rgba(58,36,20,.55)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,235,200,.22)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(tcx, tcy - 1, 30, 9, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      for (var gr = 0; gr < 3; gr++) {
        ctx.strokeStyle = 'rgba(90,58,35,.20)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(tcx, tcy, 26 - gr * 8, 8.5 - gr * 2.6, 0, 0.25, Math.PI - 0.25); ctx.stroke();
      }
      /* 桌上：两杯热可可 + 一支蜡烛 */
      propMug(ctx, tcx - 24, tcy - 15, 9, '#e0563f');
      propMug(ctx, tcx + 2, tcy - 16, 8, '#f4ead8');
      box(ctx, tcx + 17, tcy - 13, 5, 12, '#f2e2c0', { r: 1, outline: false });
      ball(ctx, tcx + 19.5, tcy - 16, 2.6, '#ffd06a', { outline: false });
      drawGlow(ctx, tcx + 19, tcy - 21, 'rgba(255,190,110,.5)', 24, 0.85 + 0.15 * Math.sin(t / 430 + 1));

      /* 两把椅子（左右各一，面向桌子） */
      [[tcx - 54, 1], [tcx + 54, -1]].forEach(function (c) {
        var cxx = c[0], side = c[1];
        shadow(ctx, cxx, 404, 15, 4);
        box(ctx, cxx - 13, 382, 26, 9, '#a0684a', { r: 3, shade: true, hi: true });
        box(ctx, cxx - 13, 352, 26, 9, '#96604a', { r: 3 });
        box(ctx, cxx - 11 + (side > 0 ? 0 : 0), 359, 5, 25, '#8a5c3a', { r: 2, outline: false });
        box(ctx, cxx + 6, 359, 5, 25, '#8a5c3a', { r: 2, outline: false });
        box(ctx, cxx - 10, 390, 4, 15, '#6b4a2f', { r: 1, outline: false });
        box(ctx, cxx + 6, 390, 4, 15, '#6b4a2f', { r: 1, outline: false });
      });

      /* 靠墙长椅（左下）：座 + 靠背 + 两只靠垫 + 一条毯子 */
      shadow(ctx, 99, 418, 70, 8);
      box(ctx, 34, 340, 130, 36, '#96604a', { r: 6, shade: true });
      ctx.fillStyle = 'rgba(255,235,200,.16)'; ctx.fillRect(38, 343, 122, 4);
      box(ctx, 30, 386, 138, 13, '#a0684a', { r: 4, hi: true });
      box(ctx, 38, 399, 116, 9, '#7a4f32', { r: 2, outline: false });
      box(ctx, 40, 408, 9, 12, '#6b4a2f', { r: 1, outline: false });
      box(ctx, 128, 408, 9, 12, '#6b4a2f', { r: 1, outline: false });
      propCushion(ctx, 50, 350, 32, 26, '#c0392b');
      propCushion(ctx, 118, 350, 32, 26, '#35845a');
      /* 搭在靠背上的毯子 */
      ctx.fillStyle = 'rgba(240,206,150,.55)';
      ctx.beginPath();
      ctx.moveTo(88, 340); ctx.lineTo(112, 340); ctx.lineTo(110, 372);
      ctx.quadraticCurveTo(104, 378, 96, 372); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,45,.35)'; ctx.lineWidth = 1; ctx.stroke();

      /* 吧台后的杯子架：两层木板 + 三只马克杯 + 一个糖罐 */
      box(ctx, 244, 118, 100, 5, '#8a6244', { r: 1, outline: false });
      box(ctx, 244, 118, 100, 2, 'rgba(255,235,200,.28)', { r: 1, outline: false });
      propMug(ctx, 252, 100, 9, '#f4ead8');
      propMug(ctx, 272, 102, 8, '#8fd0e8');
      propMug(ctx, 292, 100, 9, '#e0563f');
      box(ctx, 314, 100, 16, 18, '#cfe3f0', { r: 4, hi: true });
      ctx.fillStyle = '#e8c98a'; ctx.fillRect(317, 96, 10, 5);
      box(ctx, 246, 138, 96, 4, '#8a6244', { r: 1, outline: false });
      [0, 1, 2, 3].forEach(function (j) {   /* 下层：一叠杯垫和罐子 */
        box(ctx, 250 + j * 24, 126, 12, 12, ['#c9a06a', '#8fd0e8', '#c9a06a', '#e0563f'][j], { r: 3, outline: false });
      });

      /* 角落的小圣诞树 */
      var tx = 762, ty = 196;
      shadow(ctx, tx, ty + 14, 20, 5);
      ctx.fillStyle = '#7a4a2b'; ctx.fillRect(tx - 3, ty, 6, 13);
      ctx.fillStyle = '#2b7047';
      ctx.beginPath(); ctx.moveTo(tx, ty - 42); ctx.lineTo(tx - 21, ty + 2); ctx.lineTo(tx + 21, ty + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#35845a';
      ctx.beginPath(); ctx.moveTo(tx, ty - 24); ctx.lineTo(tx - 16, ty + 4); ctx.lineTo(tx + 16, ty + 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(240,246,255,.55)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx - 19, ty + 1); ctx.lineTo(tx + 19, ty + 1); ctx.stroke();
      [[-6, -24, '#e0563f'], [7, -15, '#f0a83c'], [-3, -7, '#4f86d6']].forEach(function (b) {
        ball(ctx, tx + b[0], ty + b[1], 3, b[2], { hi: true, ol: 1 });
      });
      ball(ctx, tx, ty - 44, 3.4, '#f0c040', { hi: true, ol: 1 });
      drawGlow(ctx, tx, ty - 20, 'rgba(255,220,140,.30)', 44, 0.7);

      /* 门口地毯（椭圆 + 内圈，压在地板上） */
      ctx.fillStyle = 'rgba(150,74,56,.42)';
      ctx.beginPath(); ctx.ellipse(410, 476, 98, 27, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(240,192,64,.40)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(410, 476, 84, 21, 0, 0, 7); ctx.stroke();

      /* 墙上的两幅小画（挂在墙面上，有框和挂线） */
      [[470, 18, 34, 26, '#2f7fb8'], [516, 24, 28, 22, '#b07a3c']].forEach(function (f) {
        ctx.strokeStyle = 'rgba(90,60,35,.45)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(f[0] + f[2] / 2, 4); ctx.lineTo(f[0] + f[2] / 2, f[1] - 2); ctx.stroke();
        ctx.fillStyle = '#8a5c3a'; ctx.fillRect(f[0] - 3, f[1] - 3, f[2] + 6, f[3] + 6);
        ctx.fillStyle = f[4]; ctx.fillRect(f[0], f[1], f[2], f[3]);
        ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(f[0] + 2, f[1] + f[3] - 6, f[2] - 4, 2);
      });
    },
    /* ---------- 温室 ---------- */
    greenhouse: function (ctx, t) {
      /* 石板小路：门口先横向挪到左侧空道，再顺着苗床之间的缝往上。
         苗床在 x=175/375/575，缝在 x≈275 —— 石头只铺在缝里，不压任何一块地。 */
      var pathPts = [
        [398, 508], [352, 510], [306, 508],
        [275, 474], [275, 434], [275, 394], [275, 354], [275, 314], [275, 274]
      ];
      pathPts.forEach(function (pt, pi) {
        var sx = pt[0], sy = pt[1];
        shadow(ctx, sx, sy + 1.5, 19, 5.5);
        ctx.beginPath(); ctx.ellipse(sx, sy, 19, 8, 0, 0, 7);
        var sg = ctx.createLinearGradient(sx - 19, sy - 8, sx + 19, sy + 8);
        sg.addColorStop(0, '#c6b69d'); sg.addColorStop(1, '#9a8972');
        ctx.fillStyle = sg; ctx.fill();
        ctx.strokeStyle = 'rgba(104,82,60,.45)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,250,240,.26)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(sx, sy - 0.8, 14, 5.4, 0, Math.PI * 1.06, Math.PI * 1.9); ctx.stroke();
      });

      /* 右下工作台 */
      shadow(ctx, 720, 468, 52, 8);
      box(ctx, 676, 430, 92, 12, '#8a5c3a', { r: 3 });
      [[684, 442], [752, 442]].forEach(function (lg) { box(ctx, lg[0], lg[1], 8, 30, '#6b4a2f', { r: 2 }); });
      // 台上：花盆 + 铲子 + 种子袋
      box(ctx, 686, 414, 20, 16, '#8a5a3a', { r: 3 });
      ctx.fillStyle = '#2b7047';
      ctx.beginPath(); ctx.arc(696, 410, 8, 0, 7); ctx.fill();
      ball(ctx, 692, 405, 2.4, '#e0563f', { outline: false });
      ball(ctx, 701, 404, 2.4, '#f0a83c', { outline: false });
      ctx.fillStyle = '#9aa8be';
      ctx.fillRect(716, 412, 3, 20);
      ctx.beginPath(); ctx.moveTo(716, 412); ctx.lineTo(722, 406); ctx.lineTo(726, 412); ctx.closePath(); ctx.fill();
      box(ctx, 736, 416, 22, 16, '#c9a06a', { r: 2 });
      ctx.fillStyle = '#5b3d29'; ctx.font = '7px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('种子', 747, 427);

      /* 水桶 + 洒水壶（左侧空处） */
      shadow(ctx, 100, 470, 24, 6);
      ctx.fillStyle = '#7f8f96';
      ctx.beginPath(); ctx.moveTo(86, 436); ctx.lineTo(114, 436); ctx.lineTo(110, 468); ctx.lineTo(90, 468); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6a7a82';
      ctx.beginPath(); ctx.ellipse(100, 436, 14, 5, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#9aa8be'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(100, 432, 11, Math.PI, 0); ctx.stroke();
      /* 洒水壶 */
      box(ctx, 128, 444, 26, 22, '#5f8a6a', { r: 3 });
      ctx.strokeStyle = '#5f8a6a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(154, 448); ctx.quadraticCurveTo(166, 440, 168, 430); ctx.stroke();

      /* 长椅（左下，能坐） */
      box(ctx, 40, 496, 104, 12, '#8a5c3a', { r: 3 });
      box(ctx, 46, 508, 10, 20, '#6b4a2f', { r: 2 });
      box(ctx, 128, 508, 10, 20, '#6b4a2f', { r: 2 });
      box(ctx, 40, 476, 104, 20, '#a0684a', { r: 4 });

      /* 麻袋（角落） */
      ctx.fillStyle = '#c9a06a';
      ctx.beginPath();
      ctx.moveTo(756, 500); ctx.quadraticCurveTo(744, 470, 758, 464);
      ctx.quadraticCurveTo(772, 460, 776, 476); ctx.quadraticCurveTo(782, 494, 776, 500);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(120,90,60,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#8a6244'; ctx.fillRect(752, 470, 24, 5);

      /* 墙上的小暖灯（比原来多两盏，画面更亮） */
      drawGlow(ctx, 410, 60, 'rgba(255,214,150,.22)', 120, 0.8);
    },

    /* ---------- 工坊 ---------- */
    workshop: function (ctx, t) {
      /* 小暖炉（左侧，能烤火） */
      shadow(ctx, 90, 448, 40, 8);
      box(ctx, 56, 392, 68, 56, '#4a4a52', { r: 5 });
      ctx.fillStyle = '#2b2b31'; ctx.fillRect(64, 404, 52, 30);
      for (var fl = 0; fl < 4; fl++) {
        var fh = 10 + Math.sin(t / 160 + fl * 2) * 4;
        ctx.fillStyle = fl % 2 ? '#f0a83c' : '#e0563f';
        ctx.beginPath();
        ctx.moveTo(72 + fl * 12, 432);
        ctx.quadraticCurveTo(66 + fl * 12, 432 - fh, 78 + fl * 12, 432 - fh * 0.6);
        ctx.quadraticCurveTo(84 + fl * 12, 430, 84 + fl * 12, 432);
        ctx.fill();
      }
      drawGlow(ctx, 90, 420, 'rgba(255,160,80,.34)', 80, 0.85);
      ctx.fillStyle = '#5b3d29'; ctx.fillRect(52, 384, 76, 8);

      /* 木料堆（右下） */
      for (var wd = 0; wd < 3; wd++) {
        box(ctx, 690 + (wd % 2) * 6, 452 - wd * 14, 66, 12, wd % 2 ? '#c9a06a' : '#b8906a', { r: 3 });
        ball(ctx, 756, 458 - wd * 14, 5.5, '#a8825c', { outline: false });
      }

      /* 包装台（右中，摆着彩带和半成品礼物） */
      box(ctx, 674, 330, 96, 12, '#8a5c3a', { r: 3 });
      box(ctx, 682, 342, 8, 34, '#6b4a2f', { r: 2 });
      box(ctx, 754, 342, 8, 34, '#6b4a2f', { r: 2 });
      box(ctx, 690, 312, 30, 18, '#c0392b', { r: 2 });
      ctx.fillStyle = '#f0c040'; ctx.fillRect(703, 312, 4, 18);
      // 彩带卷
      ball(ctx, 736, 320, 7, '#58b368', { outline: false });
      ball(ctx, 750, 320, 6, '#f0a83c', { outline: false });
      /* v4.3：这张台子现在能点——补一叠信封、几张地址签和一块小木牌，
         让它一眼就看得出来是「寄东西的地方」。 */
      for (var ev = 0; ev < 3; ev++) {
        ctx.save();
        ctx.translate(690 + ev * 2.4, 322 - ev * 2.6);
        ctx.rotate(-0.06 + ev * 0.05);
        ctx.fillStyle = ev === 2 ? '#fffaf0' : '#f2e7cf';
        ctx.fillRect(-1, -6, 20, 9);
        ctx.strokeStyle = 'rgba(74,52,36,.45)'; ctx.lineWidth = 0.9;
        ctx.strokeRect(-1, -6, 20, 9);
        ctx.beginPath(); ctx.moveTo(-1, -6); ctx.lineTo(9, -0.6); ctx.lineTo(19, -6);
        ctx.stroke();
        ctx.restore();
      }
      ball(ctx, 692, 316, 1.8, '#c0392b', { outline: false });
      // 桌沿贴的寄件单：一张小纸片 + 红印章，不挡材料架
      ctx.save();
      ctx.translate(700, 344);
      ctx.rotate(-0.02);
      ctx.fillStyle = '#f6eddc';
      ctx.fillRect(0, 0, 42, 11);
      ctx.strokeStyle = 'rgba(74,52,36,.5)'; ctx.lineWidth = 0.8;
      ctx.strokeRect(0, 0, 42, 11);
      ctx.strokeStyle = 'rgba(120,90,60,.55)'; ctx.lineWidth = 0.8;
      for (var ln = 0; ln < 3; ln++) {
        ctx.beginPath();
        ctx.moveTo(4, 3 + ln * 3);
        ctx.lineTo(24 - ln * 5, 3 + ln * 3);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(192,57,43,.85)';
      ctx.beginPath(); ctx.arc(35, 5.6, 3.4, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,230,.75)';
      ctx.font = '600 4px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('寄', 35, 7.2);
      ctx.restore();

      /* 墙上挂的成品（木鸟 / 星星 / 小铃铛） */
      [[470, 26], [510, 20], [552, 30]].forEach(function (h, i) {
        ctx.fillStyle = 'rgba(90,60,35,.45)'; ctx.fillRect(h[0], h[1], 2, 14);
        if (i === 0) {
          ball(ctx, h[0] + 1, h[1] + 22, 8, '#c9a06a', { hi: false });
          ctx.fillStyle = '#f0c040';
          ctx.beginPath();
          ctx.moveTo(h[0] + 9, h[1] + 20); ctx.lineTo(h[0] + 15, h[1] + 18); ctx.lineTo(h[0] + 9, h[1] + 24);
          ctx.closePath(); ctx.fill();
        } else if (i === 1) {
          ctx.fillStyle = '#f0c040';
          ctx.beginPath();
          for (var k = 0; k < 10; k++) {
            var ang = -Math.PI / 2 + k * Math.PI / 5;
            var rr = k % 2 ? 4 : 10;
            ctx.lineTo(h[0] + 1 + Math.cos(ang) * rr, h[1] + 24 + Math.sin(ang) * rr);
          }
          ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = '#c9a06a';
          ctx.beginPath(); ctx.arc(h[0] + 1, h[1] + 24, 6, Math.PI, 0); ctx.fill();
          ctx.fillRect(h[0] - 5, h[1] + 24, 12, 3);
          ball(ctx, h[0] + 1, h[1] + 30, 2, '#8a6244', { outline: false });
        }
      });

      /* 门口地毯 */
      ctx.fillStyle = 'rgba(120,90,60,.4)';
      ctx.beginPath(); ctx.ellipse(410, 478, 90, 24, 0, 0, 7); ctx.fill();

      /* 落地灯：靠右墙立着（那里没有别的家具），灯杆落地 + 底座 */
      var lampX = 800;
      shadow(ctx, lampX, 470, 17, 5);
      ctx.fillStyle = '#4a3020';
      ctx.beginPath(); ctx.ellipse(lampX, 468, 16, 4.6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#5b3d29'; ctx.fillRect(lampX - 2.2, 156, 4.4, 312);
      ctx.fillStyle = 'rgba(255,235,200,.20)'; ctx.fillRect(lampX - 2.2, 156, 1.6, 312);
      ctx.fillStyle = '#e8c98a';
      ctx.beginPath();
      ctx.moveTo(lampX - 18, 156); ctx.lineTo(lampX + 18, 156);
      ctx.lineTo(lampX + 12, 122); ctx.lineTo(lampX - 12, 122);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(90,60,35,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,245,220,.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lampX - 12, 154); ctx.lineTo(lampX - 6, 124); ctx.stroke();
      drawGlow(ctx, lampX, 158, 'rgba(255,214,150,.34)', 78, 0.9);
    }
  };

  var interiors = { cabin: Interior, cafe: CafeInterior, greenhouse: GHInterior, workshop: WSInterior };
  function getInterior(id) { return interiors[id] || Interior; }

  // ============================================================
  return {
    width: width, height: height,
    buildings: buildings, obstacles: obstacles, npcs: npcs, doors: doors,
    tree: tree, lamps: lamps, benches: benches, snowPiles: snowPiles, props: props,
    eggs: eggs, roomEggs: roomEggs, allMemories: (window.Memories || []), drawTrace: drawTrace,
    drawEnvelope: drawEnvelope,
    Interior: Interior, interiors: interiors, getInterior: getInterior, slotNames: slotNames,
    getGroundCanvas: getGroundCanvas,
    drawGround: drawGround, drawSnowPiles: drawSnowPiles, drawFence: drawFence,
    drawBorderTrees: drawBorderTrees, drawBuilding: drawBuilding, drawBigTree: drawBigTree,
    drawLamp: drawLamp, drawBench: drawBench, drawPond: drawPond, drawIceRink: drawIceRink,
    drawBridge: drawBridge, drawEggs: drawEggs, drawRoomEggs: drawRoomEggs, drawProps: drawProps,
    ranch: ranch, animals: ranchAnimals, haystack: haystack,
    drawRanchGround: drawRanchGround, drawAnimal: drawAnimal
  };
})();
