/* world.js — 小镇地图数据与环境绘制（程序化像素风，无图片资源）
 * 世界坐标：1500 x 1100，3/4 俯视视角。
 */
window.World = (function () {
  'use strict';

  var width = 1500, height = 1100;

  // ---------- 建筑（footprint 即碰撞区，门在底边中点）----------
  var buildings = [
    { id: 'cabin', x: 170, y: 200, w: 230, h: 150, kind: 'cabin', wall: '#8a6244', roof: '#7a4a3a', name: '我们的小木屋', hint: '推开门，暖黄的灯光溢出来。（室内装修将在后续版本开放）' },
    { id: 'cafe', x: 1170, y: 170, w: 250, h: 165, kind: 'cafe', wall: '#a8846a', roof: '#8c5a44', name: '暖冬咖啡', hint: '吧台上摆着两杯热可可，冒着白气。老板娘朝你们眨了眨眼。' },
    { id: 'shop', x: 1160, y: 760, w: 250, h: 165, kind: 'shop', wall: '#7a6a9b', roof: '#5a4a7a', name: '圣诞小铺', hint: '' },
    { id: 'stall', x: 560, y: 110, w: 150, h: 95, kind: 'stall', wall: '#9b5a4a', roof: '#c0392b', name: '礼物小摊', hint: '摊主神秘地压低声音：「今年的圣诞礼物，我可是提前给你们俩留了最好的。」' }
  ];

  // ---------- 中央圣诞树 ----------
  var tree = { x: 750, y: 545 };

  // ---------- 碰撞体 ----------
  var obstacles = [];
  buildings.forEach(function (b) { obstacles.push({ x: b.x, y: b.y, w: b.w, h: b.h }); });
  obstacles.push({ x: tree.x - 22, y: tree.y - 18, w: 44, h: 30 });          // 树干
  obstacles.push({ x: 980, y: 930, w: 260, h: 130 });                        // 池塘
  obstacles.push({ x: 40, y: 470, w: 260, h: 90 });                          // 冰湖
  obstacles.push({ x: 420, y: 880, w: 180, h: 120 });                        // 雪松丛(右下)
  obstacles.push({ x: 60, y: 700, w: 200, h: 150 });                         // 树林(左下)

  // ---------- NPC ----------
  var npcs = [
    { id: 'santa', x: 858, y: 648, name: '圣诞老人', lines: [
      'Ho Ho Ho！欢迎回到你们自己的小镇。',
      '这棵树的每一颗灯泡，都在等你们一起点亮。',
      '今年你们一起走了那么多地方——把那些回忆都讲给我听吧。',
      '去咖啡店坐坐吧，热可可我已经帮你们付过账了。Ho Ho！'
    ] },
    { id: 'snowman', x: 1030, y: 890, name: '雪人先生', lines: [
      '别站太近，我最近有点怕化……',
      '你们俩站在一起的时候，比我的胡萝卜鼻子还亮眼。',
      '冬天最大的好处：不用担心冰淇淋化掉。'
    ] },
    { id: 'elf', x: 1108, y: 742, name: '小精灵', lines: [
      '圣诞小铺上新啦！去店里换身衣服试试？',
      '偷偷告诉你：红色那套最衬你们俩。',
      '圣诞老人的驯鹿这几天在减肥，别提了……'
    ] },
    { id: 'barista', x: 1230, y: 382, name: '咖啡店老板娘', lines: [
      '欢迎光临暖冬咖啡～',
      '两杯热可可，加双份棉花糖——你们的老规矩。',
      '外面冷，进来坐坐再走。'
    ] }
  ];

  // ---------- 交互点（建筑门）----------
  var doors = buildings.map(function (b) {
    return { id: b.id, type: 'building', x: b.x + b.w / 2, y: b.y + b.h + 8, name: b.name };
  });

  // ---------- 路灯 / 长椅 / 雪堆 ----------
  var lamps = [
    { x: 620, y: 470 }, { x: 890, y: 470 }, { x: 560, y: 730 }, { x: 950, y: 730 },
    { x: 1090, y: 560 }, { x: 400, y: 300 }
  ];
  var benches = [
    { x: 660, y: 640 }, { x: 850, y: 640 }
  ];
  var snowPiles = [
    { x: 300, y: 560, r: 26 }, { x: 1010, y: 700, r: 30 }, { x: 480, y: 960, r: 24 },
    { x: 1330, y: 520, r: 28 }, { x: 760, y: 950, r: 26 }, { x: 200, y: 950, r: 30 }
  ];
  var borderTrees = (function () {
    var arr = [];
    for (var x = 40; x < width - 20; x += 90) { arr.push({ x: x, y: 36 }); arr.push({ x: x + 45, y: height - 40 }); }
    for (var y = 100; y < height - 60; y += 95) { arr.push({ x: 36, y: y }); arr.push({ x: width - 36, y: y + 40 }); }
    return arr;
  })();

  // ---------- 名字 ----------
  var slotNames = { a: 'Charles', b: 'Julie' };

  // ================= 绘制 =================

  function drawGround(ctx, view) {
    // 雪地底色
    ctx.fillStyle = '#dde8f6';
    ctx.fillRect(view.x, view.y, view.w, view.h);
    // 细微雪纹
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    var gx = Math.floor(view.x / 90) * 90, gy = Math.floor(view.y / 90) * 90;
    for (var x = gx; x < view.x + view.w + 90; x += 90) {
      for (var y = gy; y < view.y + view.h + 90; y += 90) {
        ctx.fillRect(x + ((y / 90) % 2) * 30, y, 46, 3);
      }
    }
    // 小路
    ctx.fillStyle = '#c3d2e8';
    // 广场
    ctx.fillRect(570, 430, 380, 380);
    ctx.fillStyle = '#b7c7e0';
    ctx.fillRect(600, 460, 320, 320);
    // 放射小路
    ctx.fillRect(728, 120, 50, 320);         // 向上（木屋/礼物摊方向）
    ctx.fillRect(728, 800, 50, 180);         // 向下
    ctx.fillRect(395, 595, 340, 50);         // 向左（小木屋）
    ctx.fillRect(940, 595, 340, 50);         // 向右（商店）
    ctx.fillRect(900, 300, 260, 50);         // 斜向咖啡店
    // 广场地砖点缀
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (var i = 0; i < 8; i++) ctx.fillRect(610 + i * 40, 445, 26, 4);
  }

  function drawSnowPiles(ctx) {
    snowPiles.forEach(function (p) {
      ctx.fillStyle = '#f2f7fd';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.55, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(190,208,235,.6)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r * 0.28, p.r * 0.85, p.r * 0.32, 0, 0, 7); ctx.fill();
    });
  }

  function drawFence(ctx) {
    ctx.fillStyle = '#8a6244';
    for (var x = 20; x < width; x += 60) { ctx.fillRect(x, 8, 8, 18); ctx.fillRect(x, height - 26, 8, 18); }
    for (var y = 8; y < height; y += 60) { ctx.fillRect(8, y, 18, 8); ctx.fillRect(width - 26, y, 18, 8); }
    ctx.fillStyle = '#a9793f';
    ctx.fillRect(0, 14, width, 6); ctx.fillRect(0, height - 20, width, 6);
    ctx.fillRect(14, 0, 6, height); ctx.fillRect(width - 20, 0, 6, height);
  }

  function drawBorderTrees(ctx, t) {
    borderTrees.forEach(function (p) {
      ctx.fillStyle = '#244a33';
      ctx.fillRect(p.x - 4, p.y + 26, 8, 12);
      ctx.fillStyle = '#2f6b45';
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x - 22, p.y + 30); ctx.lineTo(p.x + 22, p.y + 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8f0fa'; // 顶雪
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x - 10, p.y + 8); ctx.lineTo(p.x + 10, p.y + 8); ctx.closePath(); ctx.fill();
    });
  }

  function drawBuilding(ctx, b, t) {
    var wallTop = b.y + 34, wallH = b.h - 34;
    // 墙体
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, wallTop, b.w, wallH);
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.fillRect(b.x, wallTop, b.w, 6);
    // 雪顶
    ctx.fillStyle = '#f2f7fd';
    ctx.fillRect(b.x - 8, b.y + 18, b.w + 16, 20);
    ctx.fillStyle = b.roof;
    ctx.beginPath();
    ctx.moveTo(b.x - 14, b.y + 22);
    ctx.lineTo(b.x + b.w / 2, b.y - 30);
    ctx.lineTo(b.x + b.w + 14, b.y + 22);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f2f7fd';
    ctx.beginPath();
    ctx.moveTo(b.x + b.w / 2, b.y - 30);
    ctx.lineTo(b.x + b.w / 2 - 26, b.y - 2);
    ctx.lineTo(b.x + b.w / 2 + 26, b.y - 2);
    ctx.closePath(); ctx.fill();
    // 烟囱 + 炊烟
    if (b.kind === 'cabin' || b.kind === 'cafe') {
      var chx = b.x + b.w - 46;
      ctx.fillStyle = '#6b4a2f';
      ctx.fillRect(chx, b.y - 22, 16, 34);
      ctx.fillStyle = '#f2f7fd';
      ctx.fillRect(chx - 3, b.y - 26, 22, 8);
      for (var i = 0; i < 3; i++) {
        var ph = (t / 900 + i * 0.4) % 1;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.4 * (1 - ph)) + ')';
        ctx.beginPath();
        ctx.arc(chx + 8 + Math.sin(ph * 6 + i) * 8, b.y - 34 - ph * 46, 6 + ph * 10, 0, 7);
        ctx.fill();
      }
    }
    // 暖窗（发光）
    var glow = 0.75 + 0.25 * Math.sin(t / 500 + b.x);
    [[b.x + 26, wallTop + 26], [b.x + b.w - 60, wallTop + 26]].forEach(function (w) {
      var g = ctx.createRadialGradient(w[0] + 17, w[1] + 15, 4, w[0] + 17, w[1] + 15, 46);
      g.addColorStop(0, 'rgba(255,215,122,' + (0.32 * glow) + ')');
      g.addColorStop(1, 'rgba(255,215,122,0)');
      ctx.fillStyle = g;
      ctx.fillRect(w[0] - 34, w[1] - 34, 102, 102);
      ctx.fillStyle = '#ffd77a'; ctx.fillRect(w[0], w[1], 34, 30);
      ctx.fillStyle = '#8a6244'; ctx.fillRect(w[0] + 15, w[1], 4, 30); ctx.fillRect(w[0], w[1] + 13, 34, 4);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(w[0] + 3, w[1] + 3, 12, 6);
    });
    // 门 + 花环
    var dx = b.x + b.w / 2 - 20;
    ctx.fillStyle = '#5b3d29';
    ctx.fillRect(dx, wallTop + wallH - 52, 40, 52);
    ctx.fillStyle = '#3f2a1c';
    ctx.fillRect(dx + 4, wallTop + wallH - 48, 32, 48);
    ctx.fillStyle = '#f0c040';
    ctx.beginPath(); ctx.arc(dx + 33, wallTop + wallH - 26, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2f7a3a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(dx + 20, wallTop + 10, 10, 0, 7); ctx.stroke();
    ctx.fillStyle = '#c0392b'; ctx.fillRect(dx + 17, wallTop + 16, 6, 5);
    // 招牌
    ctx.fillStyle = '#5b3d29';
    ctx.fillRect(b.x + b.w / 2 - 44, wallTop - 12, 88, 20);
    ctx.fillStyle = '#f4ead8';
    ctx.font = 'bold 12px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, b.x + b.w / 2, wallTop + 2);
    // 小铺彩灯
    if (b.kind === 'shop' || b.kind === 'stall') {
      var colors = ['#e0563f', '#f0a83c', '#58b368', '#4f86d6'];
      for (var j = 0; j < 8; j++) {
        var on = Math.sin(t / 300 + j) > -0.3;
        ctx.fillStyle = on ? colors[j % 4] : 'rgba(120,120,140,.4)';
        ctx.fillRect(b.x + 12 + j * (b.w - 24) / 8, wallTop - 6, 6, 6);
      }
    }
  }

  function drawBigTree(ctx, tree, stage, t) {
    var x = tree.x, y = tree.y;
    // 树影
    ctx.fillStyle = 'rgba(120,140,180,.25)';
    ctx.beginPath(); ctx.ellipse(x, y + 8, 95, 22, 0, 0, 7); ctx.fill();
    // 树干
    ctx.fillStyle = '#7a4a2b'; ctx.fillRect(x - 13, y - 12, 26, 34);
    // 树层
    var layers = [
      { w: 150, y: y - 30, c: '#2f7a4d' },
      { w: 118, y: y - 90, c: '#3c8f5c' },
      { w: 86, y: y - 145, c: '#2f7a4d' },
      { w: 54, y: y - 192, c: '#3c8f5c' }
    ];
    layers.forEach(function (L) {
      ctx.fillStyle = L.c;
      ctx.beginPath(); ctx.moveTo(x, L.y - 58); ctx.lineTo(x - L.w / 2, L.y); ctx.lineTo(x + L.w / 2, L.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath(); ctx.moveTo(x, L.y - 58); ctx.lineTo(x - L.w / 5, L.y - 18); ctx.lineTo(x + L.w / 5, L.y - 18); ctx.closePath(); ctx.fill();
    });
    if (stage >= 1) { // 彩球
      var balls = [[x - 40, y - 46, '#e0563f'], [x + 32, y - 58, '#f0a83c'], [x - 58, y - 14, '#f0a83c'], [x, y - 6, '#e0563f'], [x + 52, y - 18, '#4f86d6'], [x - 26, y - 100, '#f0a83c'], [x + 24, y - 104, '#e0563f'], [x - 16, y - 150, '#4f86d6']];
      balls.forEach(function (b) { ctx.fillStyle = b[2]; ctx.beginPath(); ctx.arc(b[0], b[1], 6, 0, 7); ctx.fill(); });
    }
    if (stage >= 2) { // 彩灯（闪烁）
      var lights = [[x - 30, y - 62], [x + 18, y - 70], [x - 52, y - 26], [x + 44, y - 32], [x - 8, y - 20], [x + 10, y - 118], [x - 20, y - 128], [x + 4, y - 168], [x - 38, y - 96], [x + 36, y - 88]];
      lights.forEach(function (L, i) {
        var on = Math.sin(t / 260 + i * 1.3) > -0.2;
        var c = ['#ffe08a', '#8ad2ff', '#ff9d9d', '#b6ff9d'][i % 4];
        if (on) {
          var g = ctx.createRadialGradient(L[0], L[1], 1, L[0], L[1], 14);
          g.addColorStop(0, 'rgba(255,236,150,.8)'); g.addColorStop(1, 'rgba(255,236,150,0)');
          ctx.fillStyle = g; ctx.fillRect(L[0] - 14, L[1] - 14, 28, 28);
          ctx.fillStyle = c;
        } else ctx.fillStyle = 'rgba(150,160,180,.5)';
        ctx.beginPath(); ctx.arc(L[0], L[1], 4, 0, 7); ctx.fill();
      });
    }
    if (stage >= 3) { // 星星 + 光晕 + 礼物
      var g2 = ctx.createRadialGradient(x, y - 252, 8, x, y - 252, 130);
      g2.addColorStop(0, 'rgba(255,215,122,.5)'); g2.addColorStop(1, 'rgba(255,215,122,0)');
      ctx.fillStyle = g2; ctx.fillRect(x - 130, y - 382, 260, 260);
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath();
      var sy = y - 252, pts = [[0, -22], [6, -7], [22, -7], [9, 3], [14, 18], [0, 8], [-14, 18], [-9, 3], [-22, -7], [-6, -7]];
      pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(x + p[0], sy + p[1]); else ctx.lineTo(x + p[0], sy + p[1]); });
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f0a83c'; ctx.lineWidth = 2; ctx.stroke();
      var gifts = [[x - 84, y + 6, '#e0563f'], [x - 60, y + 12, '#4f86d6'], [x + 62, y + 8, '#58b368'], [x + 86, y + 2, '#f0a83c']];
      gifts.forEach(function (gf) {
        ctx.fillStyle = gf[2]; ctx.fillRect(gf[0], gf[1], 26, 20);
        ctx.fillStyle = '#f4ead8'; ctx.fillRect(gf[0] + 11, gf[1], 4, 20); ctx.fillRect(gf[0], gf[1] + 8, 26, 4);
      });
    }
  }

  function drawLamp(ctx, lamp, t) {
    var flicker = 0.8 + 0.2 * Math.sin(t / 400 + lamp.x);
    var g = ctx.createRadialGradient(lamp.x, lamp.y - 34, 4, lamp.x, lamp.y - 34, 70);
    g.addColorStop(0, 'rgba(255,215,122,' + (0.35 * flicker) + ')');
    g.addColorStop(1, 'rgba(255,215,122,0)');
    ctx.fillStyle = g; ctx.fillRect(lamp.x - 70, lamp.y - 104, 140, 140);
    ctx.fillStyle = '#3a3f4a'; ctx.fillRect(lamp.x - 3, lamp.y - 36, 6, 36);
    ctx.fillStyle = '#2e333d'; ctx.fillRect(lamp.x - 7, lamp.y - 6, 14, 6);
    ctx.fillStyle = '#ffe08a'; ctx.fillRect(lamp.x - 5, lamp.y - 46, 10, 12);
    ctx.fillStyle = '#2e333d'; ctx.fillRect(lamp.x - 8, lamp.y - 50, 16, 5);
  }

  function drawBench(ctx, bench) {
    ctx.fillStyle = '#8a6244';
    ctx.fillRect(bench.x - 26, bench.y - 14, 52, 8);
    ctx.fillRect(bench.x - 26, bench.y - 26, 52, 6);
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(bench.x - 22, bench.y - 6, 6, 8); ctx.fillRect(bench.x + 16, bench.y - 6, 6, 8);
    ctx.fillStyle = '#f2f7fd'; ctx.fillRect(bench.x - 26, bench.y - 29, 52, 4);
  }

  function drawPond(ctx) {
    ctx.fillStyle = '#a9c4e8';
    ctx.beginPath(); ctx.ellipse(1110, 995, 130, 65, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.ellipse(1075, 975, 60, 26, -0.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#cfe0f2';
    ctx.beginPath(); ctx.ellipse(1160, 1015, 50, 20, 0.2, 0, 7); ctx.fill();
  }

  function drawIceRink(ctx) {
    ctx.fillStyle = '#cfe2f5';
    ctx.beginPath(); ctx.ellipse(170, 515, 130, 46, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(170, 515, 130, 46, 0, 0, 7); ctx.stroke();
  }

  return {
    width: width, height: height,
    buildings: buildings, obstacles: obstacles, npcs: npcs, doors: doors,
    tree: tree, lamps: lamps, benches: benches, slotNames: slotNames,
    drawGround: drawGround, drawSnowPiles: drawSnowPiles, drawFence: drawFence,
    drawBorderTrees: drawBorderTrees, drawBuilding: drawBuilding, drawBigTree: drawBigTree,
    drawLamp: drawLamp, drawBench: drawBench, drawPond: drawPond, drawIceRink: drawIceRink
  };
})();
