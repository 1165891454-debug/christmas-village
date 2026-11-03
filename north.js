/* north.js — v4.9.0「被遗忘的北境」THE FORGOTTEN NORTH
 * ------------------------------------------------------------
 * 一张独立的大地图，挂在 TravelMaps 体系里（不售票、不进车站列表），
 * 这样摄像机、边界、碰撞、双人位置同步、断线恢复全部复用现成那套，
 * 不需要在 game.js 里再开一条并行的场景分支。
 *
 * 结构
 *   paint(g)      静态层：天空 / 极光底 / 三层山脊 / 雪原 / 五个区域的地物
 *   anim(g, t)    动态层：极光流动、星点呼吸、湖面反光、符文与冰晶的脉动、
 *                 飘雪、回程传送门 —— 每帧只画这些，别的都在 paint 里烘过
 *   obstacles     碰撞体（树干 / 石块 / 遗迹柱 / 木屋 / 雪橇）
 *
 * 五个区域（从左到右，固定坐标，双人共享同一份）
 *   1 沉默的雪林  The Silent Forest   x   0 ~ 470
 *   2 冰晶小径    Crystal Path        x 430 ~ 880
 *   3 被遗忘营地  Forgotten Camp      x 860 ~ 1290
 *   4 星光冰湖    Starlit Lake        x1260 ~ 1700
 *   5 古代遗迹    Ancient Ruins       x1660 ~ 2048
 *
 * v5.0 预留：RUINS.mech 里两个星形机关位（A/B）与石门位置，本版本只留坐标，
 *          不实现任何机关逻辑。
 */
window.NorthMap = (function () {
  'use strict';

  var W = 2048, H = 1080;
  /* 能站人的地面带：上界是远景林脚，下界是画面底边（和旅行地图一致的做法） */
  var WALK = { y0: 604, y1: 1042 };
  var GROUND_Y = 566;

  /* 五个区域的横坐标（有重叠，交界处自然过渡） */
  var REGIONS = [
    { id: 'forest', x0: 0, x1: 470, name: '沉默的雪林', en: 'The Silent Forest' },
    { id: 'crystal', x0: 430, x1: 880, name: '冰晶小径', en: 'Crystal Path' },
    { id: 'camp', x0: 860, x1: 1290, name: '被遗忘营地', en: 'Forgotten Camp' },
    { id: 'lake', x0: 1260, x1: 1700, name: '星光冰湖', en: 'Starlit Lake' },
    { id: 'ruins', x0: 1660, x1: 2048, name: '古代遗迹', en: 'Ancient Ruins' }
  ];

  /* 关键坐标（固定，不随机 —— 双人机关要靠它） */
  var PORTAL_IN = { x: 128, y: 892 };      // 回程传送门（也是出生点旁边那圈符文）
  var SPAWN = { x: 236, y: 906, dir: 3 };
  /* 遗迹：门在 936 这条线上，机关与符文圈都在门前的地面上（y 更大 = 更靠近镜头） */
  var RUINS = {
    gate: { x: 1870, y: 936 },             // 石门（柱脚落点）
    mechA: { x: 1770, y: 986 },            // 星形机关 A（v5.0 用）
    mechB: { x: 1970, y: 986 },            // 星形机关 B（v5.0 用）
    runeCenter: { x: 1870, y: 952 }
  };
  var LAKE = { x: 1478, y: 806, rx: 196, ry: 92 };

  /* ============================================================
   * 画笔工具
   * ============================================================ */
  function rnd(seed) {
    var v = seed || 1;
    return function () { v = (v * 1103515245 + 12345) % 2147483648; return v / 2147483648; };
  }
  function lin(g, x0, y0, x1, y1, stops) {
    var gr = g.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
    return gr;
  }
  function rad(g, x, y, r, stops) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
    return gr;
  }
  function glow(g, x, y, r, col, a) {
    if (r <= 0) return;
    g.save();
    g.globalAlpha = a === undefined ? 1 : a;
    g.fillStyle = rad(g, x, y, r, [0, col, 0.45, col.replace(/[\d.]+\)$/, '0.30)'), 1, 'rgba(0,0,0,0)']);
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.restore();
  }

  /* 雪松：三层下垂的扇形 + 雪压枝头。h 是总高，w 是底部半宽 */
  function pine(g, x, y, h, w, seed, dark) {
    var r = rnd(seed);
    var tiers = 4;
    /* 树影：冷蓝色、偏右一点（光从左上打过来） */
    g.beginPath();
    g.ellipse(x + w * 0.12, y + 2, w * 0.70, w * 0.17, 0, 0, 7);
    g.fillStyle = 'rgba(44,74,120,' + (dark ? 0.22 : 0.15) + ')';
    g.fill();
    // 树干
    g.fillStyle = dark ? '#0a1420' : '#2a2118';
    g.fillRect(x - w * 0.09, y - h * 0.20, w * 0.18, h * 0.22);
    for (var i = 0; i < tiers; i++) {
      var t = i / tiers;
      var ty = y - h * (0.14 + t * 0.74);
      var tw = w * (1 - t * 0.72);
      var th = h * 0.30;
      g.beginPath();
      g.moveTo(x, ty - th);
      g.quadraticCurveTo(x + tw * 0.52, ty - th * 0.42, x + tw, ty + th * 0.10);
      // 底缘：一排下垂的枝尖
      var n = 5;
      for (var k = 0; k < n; k++) {
        var u0 = 1 - (k / n) * 2;
        var u1 = 1 - ((k + 1) / n) * 2;
        var dip = 1 + (r() - 0.5) * 0.5;
        g.quadraticCurveTo(x + tw * (u0 + u1) * 0.5, ty + th * 0.34 * dip, x + tw * u1, ty + th * 0.10);
      }
      g.closePath();
      var base = dark ? '#0b1a2c' : '#12314a';
      g.fillStyle = lin(g, x - tw, ty - th, x + tw, ty + th, [0, base, 0.55, dark ? '#081522' : '#0d2438', 1, '#07111c']);
      g.fill();
      // 枝头积雪
      if (!dark) {
        for (var k2 = 0; k2 < 4; k2++) {
          var uu = -0.85 + 1.7 * (k2 / 3) + (r() - 0.5) * 0.18;
          var sx = x + tw * uu * 0.86;
          var sy = ty + th * 0.06;
          var sw = tw * (0.16 + r() * 0.12);
          g.beginPath();
          g.ellipse(sx, sy - sw * 0.16, sw, sw * 0.34, 0, 0, 7);
          g.fillStyle = 'rgba(226,240,255,' + (0.45 + r() * 0.3).toFixed(2) + ')';
          g.fill();
        }
      }
    }
    /* 树尖 */
    g.beginPath();
    g.moveTo(x, y - h);
    g.lineTo(x + w * 0.10, y - h * 0.86);
    g.lineTo(x - w * 0.10, y - h * 0.86);
    g.closePath();
    g.fillStyle = dark ? '#0a1626' : '#163b56';
    g.fill();
  }

  /* 雪堆：一段扁平的白，带冷色下沿 */
  function drift(g, x, y, w, h, a) {
    var A = (a === undefined ? 0.55 : a);
    g.beginPath();
    g.ellipse(x + w * 0.06, y + h * 0.62, w * 1.02, h * 0.9, 0, 0, 7);
    g.fillStyle = 'rgba(118,152,196,' + (A * 0.30).toFixed(3) + ')';
    g.fill();
    g.beginPath();
    g.ellipse(x, y, w, h, 0, 0, 7);
    g.fillStyle = lin(g, x, y - h, x, y + h,
      [0, 'rgba(255,255,255,' + A + ')', 1, 'rgba(208,226,246,' + (A * 0.92).toFixed(3) + ')']);
    g.fill();
    g.beginPath();
    g.ellipse(x - w * 0.18, y - h * 0.34, w * 0.52, h * 0.34, 0, 0, 7);
    g.fillStyle = 'rgba(255,255,255,' + (A * 0.5).toFixed(3) + ')';
    g.fill();
  }

  /* 石头：深灰蓝，顶上一撮雪 */
  function rock(g, x, y, r, seed) {
    var rr = rnd(seed || 3);
    g.beginPath();
    g.moveTo(x - r, y + r * 0.30);
    g.quadraticCurveTo(x - r * 0.85, y - r * 0.75, x - r * 0.15, y - r * 0.9);
    g.quadraticCurveTo(x + r * 0.62, y - r * 1.02, x + r * 0.92, y - r * 0.2);
    g.quadraticCurveTo(x + r * 1.02, y + r * 0.32, x + r * 0.6, y + r * 0.42);
    g.lineTo(x - r * 0.7, y + r * 0.44);
    g.closePath();
    g.fillStyle = lin(g, x - r, y - r, x + r, y + r, [0, '#3b4b68', 0.6, '#2a3852', 1, '#1b263c']);
    g.fill();
    g.beginPath();
    g.ellipse(x - r * 0.05, y - r * 0.62, r * 0.82, r * 0.28, 0, 0, 7);
    g.fillStyle = 'rgba(232,244,255,.85)';
    g.fill();
    if (rr() > 0.5) {
      g.beginPath();
      g.ellipse(x + r * 0.55, y - r * 0.2, r * 0.28, r * 0.12, 0, 0, 7);
      g.fillStyle = 'rgba(226,240,255,.6)';
      g.fill();
    }
  }

  /* 冰晶：透光的棱柱，外缘深、内芯亮 */
  function crystal(g, x, y, h, w, hue) {
    hue = hue || 0;
    var c1 = hue ? '#7fe6ff' : '#9fd8ff';
    var c2 = hue ? '#3f8fd0' : '#4f7fc8';
    g.save();
    g.translate(x, y);
    // 光斑
    glow(g, 0, -h * 0.45, w * 3.4, 'rgba(120,200,255,.30)', 1);
    // 主体（两个面）
    g.beginPath();
    g.moveTo(-w * 0.5, 0);
    g.lineTo(-w * 0.34, -h * 0.86);
    g.lineTo(0, -h);
    g.lineTo(w * 0.30, -h * 0.80);
    g.lineTo(w * 0.5, 0);
    g.closePath();
    g.fillStyle = lin(g, -w, -h, w, 0, [0, 'rgba(214,244,255,.92)', 0.45, c1, 1, c2]);
    g.fill();
    // 亮芯
    g.beginPath();
    g.moveTo(-w * 0.10, -h * 0.06);
    g.lineTo(-w * 0.06, -h * 0.72);
    g.lineTo(0, -h * 0.96);
    g.lineTo(w * 0.10, -h * 0.70);
    g.lineTo(w * 0.12, -h * 0.06);
    g.closePath();
    g.fillStyle = 'rgba(240,252,255,.55)';
    g.fill();
    // 底座积雪
    g.beginPath();
    g.ellipse(0, -h * 0.02, w * 0.72, w * 0.20, 0, 0, 7);
    g.fillStyle = 'rgba(236,247,255,.75)';
    g.fill();
    g.restore();
  }

  /* 石碑：上部被雪盖住，阴刻符文微微发光（静态底，脉动在 anim 里补） */
  function stele(g, x, y, w, h, seed) {
    var r = rnd(seed || 7);
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.moveTo(-w * 0.5, 0);
    g.lineTo(-w * 0.44, -h);
    g.lineTo(w * 0.42, -h * 1.02);
    g.lineTo(w * 0.5, 0);
    g.closePath();
    g.fillStyle = lin(g, -w, -h, w, 0, [0, '#4a5a78', 0.5, '#35435e', 1, '#232e44']);
    g.fill();
    // 竖向凿痕
    g.strokeStyle = 'rgba(14,22,36,.35)';
    g.lineWidth = 1.4;
    for (var i = 0; i < 3; i++) {
      var lx = -w * 0.28 + i * w * 0.28;
      g.beginPath(); g.moveTo(lx, -h * 0.16); g.lineTo(lx + 1, -h * 0.9); g.stroke();
    }
    // 符文（三行）
    g.fillStyle = 'rgba(126,214,255,.75)';
    for (var k = 0; k < 3; k++) {
      var gy = -h * (0.72 - k * 0.2);
      var gw = w * (0.26 + r() * 0.12);
      g.fillRect(-gw, gy, gw * 2, Math.max(1.6, h * 0.022));
      g.fillRect(-gw * 0.2, gy - h * 0.05, Math.max(1.6, h * 0.02), h * 0.1);
    }
    // 顶部积雪
    g.beginPath();
    g.ellipse(0, -h * 0.99, w * 0.5, h * 0.055, 0, 0, 7);
    g.fillStyle = 'rgba(238,248,255,.92)';
    g.fill();
    g.beginPath();
    g.ellipse(-w * 0.2, -h * 1.03, w * 0.3, h * 0.05, 0, 0, 7);
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.fill();
    g.restore();
  }

  /* 地面上的符文圈（静态底图用；发光在 anim 里单独补） */
  function runeRing(g, x, y, rx, ry, n, seed, col) {
    var r = rnd(seed || 11);
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    g.beginPath(); g.arc(0, 0, rx, 0, 7);
    g.strokeStyle = col || 'rgba(120,200,255,.42)';
    g.lineWidth = 2.4;
    g.stroke();
    g.beginPath(); g.arc(0, 0, rx * 0.82, 0, 7);
    g.strokeStyle = col || 'rgba(120,200,255,.26)';
    g.lineWidth = 1.4;
    g.stroke();
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + r() * 0.12;
      var px = Math.cos(a) * rx * 0.91, py = Math.sin(a) * rx * 0.91;
      g.save();
      g.translate(px, py);
      g.rotate(a);
      g.fillStyle = col || 'rgba(150,220,255,.55)';
      g.fillRect(-rx * 0.045, -1.2, rx * 0.09, 2.4);
      if (i % 2 === 0) g.fillRect(-1.2, -rx * 0.05, 2.4, rx * 0.1);
      g.restore();
    }
    g.restore();
  }

  /* 遗迹拱门：两根方柱 + 横楣，顶上压雪，边缘有崩口 */
  function arch(g, x, y, s) {
    g.save();
    g.translate(x, y);
    var cw = 42 * s, chh = 168 * s, gap = 96 * s;
    function pillar(px, hh, tilt) {
      g.save();
      g.translate(px, 0);
      g.rotate(tilt || 0);
      g.fillStyle = lin(g, -cw / 2, -hh, cw / 2, 0, [0, '#4c5c7a', 0.5, '#3a4763', 1, '#26314a']);
      g.fillRect(-cw / 2, -hh, cw, hh);
      // 砖缝
      g.strokeStyle = 'rgba(16,24,38,.32)';
      g.lineWidth = 1.2;
      for (var i = 1; i < 6; i++) {
        var yy = -hh * (i / 6);
        g.beginPath(); g.moveTo(-cw / 2, yy); g.lineTo(cw / 2, yy); g.stroke();
      }
      // 柱头
      g.fillStyle = '#44526e';
      g.fillRect(-cw * 0.62, -hh - 10 * s, cw * 1.24, 12 * s);
      // 积雪（薄薄一层，别做成大白盘子）
      g.beginPath();
      g.ellipse(0, -hh - 11 * s, cw * 0.58, 3.4 * s, 0, 0, 7);
      g.fillStyle = 'rgba(240,250,255,.9)';
      g.fill();
      // 柱身上的符文（竖排三条，淡淡的蓝）
      for (var rn2 = 0; rn2 < 5; rn2++) {
        var ry2 = -hh * (0.16 + rn2 * 0.16);
        g.fillStyle = 'rgba(140,220,255,' + (0.30 + (rn2 % 2) * 0.16).toFixed(2) + ')';
        g.fillRect(-cw * 0.18, ry2, cw * 0.36, Math.max(1.6, 2.4 * s));
        if (rn2 % 2 === 0) g.fillRect(-cw * 0.05, ry2 - 5 * s, Math.max(1.6, 2.2 * s), 10 * s);
      }
      // 柱脚
      g.fillStyle = '#3d4a66';
      g.fillRect(-cw * 0.68, -14 * s, cw * 1.36, 14 * s);
      g.beginPath();
      g.ellipse(0, -1 * s, cw * 0.72, 5 * s, 0, 0, 7);
      g.fillStyle = 'rgba(232,245,255,.55)';
      g.fill();
      g.restore();
    }
    pillar(-gap / 2, chh, -0.012);
    pillar(gap / 2, chh * 0.94, 0.018);
    // 横楣（断了一角）
    g.fillStyle = lin(g, -gap, -chh - 40 * s, gap, -chh, [0, '#516182', 1, '#2b3750']);
    g.beginPath();
    g.moveTo(-gap * 0.62, -chh - 34 * s);
    g.lineTo(gap * 0.40, -chh - 38 * s);
    g.lineTo(gap * 0.44, -chh - 6 * s);
    g.lineTo(-gap * 0.60, -chh - 2 * s);
    g.closePath();
    g.fill();
    /* 横楣正中那一段符文带 */
    g.fillStyle = 'rgba(150,225,255,.42)';
    for (var lg2 = 0; lg2 < 7; lg2++) {
      var lx2 = -gap * 0.34 + lg2 * gap * 0.115;
      g.fillRect(lx2, -chh - 26 * s, 2.4 * s, 12 * s);
      if (lg2 % 2 === 0) g.fillRect(lx2 - 4 * s, -chh - 20 * s, 10 * s, 2.2 * s);
    }
    g.beginPath();
    g.ellipse(-gap * 0.10, -chh - 36 * s, gap * 0.42, 4.4 * s, 0, 0, 7);
    g.fillStyle = 'rgba(242,251,255,.9)';
    g.fill();
    g.beginPath();
    g.ellipse(gap * 0.30, -chh - 30 * s, gap * 0.14, 3 * s, 0, 0, 7);
    g.fillStyle = 'rgba(242,251,255,.7)';
    g.fill();
    g.restore();
  }

  /* 断柱 */
  function column(g, x, y, h, w, seed) {
    var r = rnd(seed || 5);
    g.save();
    g.translate(x, y);
    g.fillStyle = lin(g, -w, -h, w, 0, [0, '#4a5975', 0.6, '#36435e', 1, '#222d44']);
    g.beginPath();
    g.moveTo(-w * 0.5, 0);
    g.lineTo(-w * 0.46, -h * (0.92 + r() * 0.08));
    g.lineTo(w * 0.12, -h);
    g.lineTo(w * 0.5, -h * 0.82);
    g.lineTo(w * 0.5, 0);
    g.closePath();
    g.fill();
    g.beginPath();
    g.ellipse(0, 0, w * 0.7, w * 0.24, 0, 0, 7);
    g.fillStyle = 'rgba(230,244,255,.5)';
    g.fill();
    g.beginPath();
    g.ellipse(0, -h * 0.97, w * 0.34, w * 0.10, 0, 0, 7);
    g.fillStyle = 'rgba(240,250,255,.85)';
    g.fill();
    g.restore();
  }

  /* 湖面：冰 + 边缘 + 裂纹（反光在 anim 里） */
  function iceLake(g, cx, cy, rx, ry) {
    g.save();
    // 外圈雪堤
    g.beginPath();
    g.ellipse(cx, cy, rx * 1.12, ry * 1.22, 0, 0, 7);
    g.fillStyle = 'rgba(233,243,255,.55)';
    g.fill();
    // 冰面
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, 7);
    g.fillStyle = lin(g, cx, cy - ry, cx, cy + ry,
      [0, '#9ed2ee', 0.26, '#c6e4f6', 0.62, '#eaf7ff', 1, '#a8cde4']);
    g.fill();
    // 深处更暗的一圈，让冰有厚度
    g.beginPath();
    g.ellipse(cx, cy + ry * 0.12, rx * 0.74, ry * 0.62, 0, 0, 7);
    g.fillStyle = 'rgba(92,146,190,.20)';
    g.fill();
    // 靠近岸边的一圈薄冰（更白）
    g.beginPath();
    g.ellipse(cx, cy, rx * 0.97, ry * 0.97, 0, 0, 7);
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 7;
    g.stroke();
    // 裂纹
    var r = rnd(29);
    g.strokeStyle = 'rgba(255,255,255,.5)';
    for (var i = 0; i < 7; i++) {
      var a = r() * 7, len = rx * (0.25 + r() * 0.5);
      var sx = cx + Math.cos(a) * rx * 0.15, sy = cy + Math.sin(a) * ry * 0.15;
      g.lineWidth = 0.8 + r() * 1.1;
      g.beginPath();
      g.moveTo(sx, sy);
      g.quadraticCurveTo(sx + Math.cos(a) * len * 0.5 + 14, sy + Math.sin(a) * len * 0.4,
        sx + Math.cos(a) * len, sy + Math.sin(a) * len * 0.7);
      g.stroke();
    }
    // 浮着的碎冰：几片多边形，带一点投影
    var rf = rnd(97);
    for (var f = 0; f < 5; f++) {
      var fa2 = rf() * 6.28, fr = 0.28 + rf() * 0.55;
      var fx2 = cx + Math.cos(fa2) * rx * fr, fy2 = cy + Math.sin(fa2) * ry * fr;
      var fs = 8 + rf() * 14;
      g.beginPath();
      g.moveTo(fx2 - fs, fy2);
      g.lineTo(fx2 - fs * 0.3, fy2 - fs * 0.5);
      g.lineTo(fx2 + fs * 0.7, fy2 - fs * 0.3);
      g.lineTo(fx2 + fs, fy2 + fs * 0.2);
      g.lineTo(fx2 - fs * 0.2, fy2 + fs * 0.42);
      g.closePath();
      g.fillStyle = 'rgba(226,240,252,.55)';
      g.fill();
      g.strokeStyle = 'rgba(150,186,222,.55)';
      g.lineWidth = 1.2;
      g.stroke();
    }
    // 边缘的高光
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95);
    g.strokeStyle = 'rgba(255,255,255,.75)';
    g.lineWidth = 3.4;
    g.stroke();
    g.restore();
  }

  /* 木屋：营地主体 */
  function cabin(g, x, y, w, h) {
    g.save();
    g.translate(x, y);
    // 石基
    g.fillStyle = '#2a3142';
    g.fillRect(-w * 0.52, -h * 0.12, w * 1.04, h * 0.12);
    // 原木墙
    g.fillStyle = lin(g, -w / 2, -h, w / 2, 0, [0, '#3b2f26', 0.5, '#2e241d', 1, '#1d1712']);
    g.fillRect(-w * 0.5, -h * 0.86, w, h * 0.76);
    // 横木纹理
    g.strokeStyle = 'rgba(84,64,46,.55)';
    g.lineWidth = 1.6;
    for (var i = 1; i < 6; i++) {
      var yy = -h * (0.86 - i * 0.12);
      g.beginPath(); g.moveTo(-w * 0.5, yy); g.lineTo(w * 0.5, yy); g.stroke();
    }
    // 门（微微透出冷光，说明里面空了很久）
    g.fillStyle = '#120f0d';
    g.fillRect(-w * 0.12, -h * 0.56, w * 0.24, h * 0.44);
    g.fillStyle = 'rgba(120,180,220,.10)';
    g.fillRect(-w * 0.10, -h * 0.54, w * 0.20, h * 0.40);
    // 窗
    g.fillStyle = '#0d1119';
    g.fillRect(w * 0.16, -h * 0.70, w * 0.20, h * 0.18);
    g.fillStyle = 'rgba(255,190,120,.10)';
    g.fillRect(w * 0.17, -h * 0.69, w * 0.18, h * 0.16);
    // 屋顶（雪压得很厚）：先一层暗檐，再压雪
    g.beginPath();
    g.moveTo(-w * 0.66, -h * 0.80);
    g.lineTo(0, -h * 1.14);
    g.lineTo(w * 0.66, -h * 0.80);
    g.lineTo(w * 0.60, -h * 0.74);
    g.lineTo(0, -h * 1.06);
    g.lineTo(-w * 0.60, -h * 0.74);
    g.closePath();
    g.fillStyle = 'rgba(28,40,58,.55)';
    g.fill();
    g.beginPath();
    g.moveTo(-w * 0.66, -h * 0.82);
    g.lineTo(0, -h * 1.22);
    g.lineTo(w * 0.66, -h * 0.82);
    g.lineTo(w * 0.60, -h * 0.76);
    g.lineTo(0, -h * 1.10);
    g.lineTo(-w * 0.60, -h * 0.76);
    g.closePath();
    g.fillStyle = lin(g, 0, -h * 1.22, 0, -h * 0.76, [0, '#ffffff', 0.6, '#e4f0fb', 1, '#c2d6ec']);
    g.fill();
    g.beginPath();
    g.moveTo(-w * 0.62, -h * 0.84);
    g.lineTo(0, -h * 1.16);
    g.lineTo(w * 0.62, -h * 0.84);
    g.lineTo(w * 0.58, -h * 0.80);
    g.lineTo(0, -h * 1.10);
    g.lineTo(-w * 0.58, -h * 0.80);
    g.closePath();
    g.fillStyle = 'rgba(210,228,246,.9)';
    g.fill();
    // 屋檐挂的冰锥
    for (var k = 0; k < 5; k++) {
      var ix = -w * 0.5 + k * w * 0.25;
      var ih = 6 + (k % 3) * 5;
      g.beginPath();
      g.moveTo(ix - 2.5, -h * 0.82);
      g.lineTo(ix + 2.5, -h * 0.82);
      g.lineTo(ix, -h * 0.82 + ih);
      g.closePath();
      g.fillStyle = 'rgba(200,232,255,.8)';
      g.fill();
    }
    g.restore();
  }

  /* 旧篝火：一圈石头 + 焦木 */
  function firePit(g, x, y, s) {
    var r = rnd(41);
    g.beginPath();
    g.ellipse(x, y, s * 0.72, s * 0.30, 0, 0, 7);
    g.fillStyle = 'rgba(38,32,30,.75)';
    g.fill();
    for (var i = 0; i < 9; i++) {
      var a = (i / 9) * Math.PI * 2 + r() * 0.2;
      rock(g, x + Math.cos(a) * s * 0.78, y + Math.sin(a) * s * 0.34, s * (0.09 + r() * 0.04), i + 2);
    }
    // 焦木
    g.strokeStyle = '#1a1512';
    g.lineWidth = s * 0.10;
    g.lineCap = 'round';
    for (var k = 0; k < 3; k++) {
      var ang = -0.5 + k * 0.5;
      g.beginPath();
      g.moveTo(x - Math.cos(ang) * s * 0.34, y - Math.sin(ang) * s * 0.14);
      g.lineTo(x + Math.cos(ang) * s * 0.34, y + Math.sin(ang) * s * 0.14);
      g.stroke();
    }
    g.fillStyle = 'rgba(120,120,130,.35)';
    g.beginPath();
    g.ellipse(x, y, s * 0.36, s * 0.14, 0, 0, 7);
    g.fill();
  }

  /* 破雪橇 */
  function sled(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.rotate(-0.06);
    g.strokeStyle = '#4a3524';
    g.lineWidth = 4 * s;
    g.lineCap = 'round';
    // 滑板
    g.beginPath();
    g.moveTo(-46 * s, -4 * s);
    g.lineTo(34 * s, -4 * s);
    g.quadraticCurveTo(52 * s, -4 * s, 52 * s, -18 * s);
    g.stroke();
    // 立柱
    g.lineWidth = 3 * s;
    [-30, -6, 20].forEach(function (px) {
      g.beginPath(); g.moveTo(px * s, -6 * s); g.lineTo(px * s, -26 * s); g.stroke();
    });
    // 座面
    g.fillStyle = '#5a4130';
    g.fillRect(-34 * s, -30 * s, 52 * s, 6 * s);
    // 雪
    g.beginPath();
    g.ellipse(-4 * s, -31 * s, 30 * s, 4 * s, 0, 0, 7);
    g.fillStyle = 'rgba(235,247,255,.9)';
    g.fill();
    g.restore();
  }

  /* 木箱 */
  function crate(g, x, y, s, tilt) {
    g.save();
    g.translate(x, y);
    g.rotate(tilt || 0);
    g.fillStyle = lin(g, -s, -s, s, 0, [0, '#4a382a', 1, '#2c2118']);
    g.fillRect(-s * 0.5, -s * 0.5, s, s * 0.5);
    g.strokeStyle = 'rgba(120,92,64,.6)';
    g.lineWidth = 1.6;
    g.strokeRect(-s * 0.5, -s * 0.5, s, s * 0.5);
    g.beginPath();
    g.moveTo(-s * 0.5, -s * 0.5); g.lineTo(s * 0.5, 0);
    g.moveTo(s * 0.5, -s * 0.5); g.lineTo(-s * 0.5, 0);
    g.stroke();
    g.beginPath();
    g.ellipse(0, -s * 0.48, s * 0.46, s * 0.10, 0, 0, 7);
    g.fillStyle = 'rgba(236,248,255,.85)';
    g.fill();
    g.restore();
  }

  /* ============================================================
   * 静态层
   * ============================================================ */
  function paint(g, mode) {
    var r = rnd(20261102);

    /* ---------- 天空 ---------- */
    g.fillStyle = lin(g, 0, 0, 0, GROUND_Y + 40, [
      0, '#050a1c', 0.34, '#0a1330', 0.66, '#122045', 1, '#1d3355'
    ]);
    g.fillRect(0, 0, W, GROUND_Y + 60);

    /* 星河：一条斜着的带子，比零散星点更像"北境的夜空" */
    g.save();
    g.globalAlpha = 0.55;
    g.translate(W * 0.52, H * 0.22);
    g.rotate(-0.16);
    g.fillStyle = rad(g, 0, 0, W * 0.55, [0, 'rgba(140,180,255,.16)', 0.5, 'rgba(110,150,230,.07)', 1, 'rgba(0,0,0,0)']);
    g.fillRect(-W * 0.7, -H * 0.16, W * 1.4, H * 0.32);
    g.restore();

    /* 星点 */
    for (var i = 0; i < 260; i++) {
      var sx = r() * W, sy = r() * (GROUND_Y - 40);
      var sr = 0.5 + r() * 1.5;
      var sa = 0.25 + r() * 0.7;
      g.beginPath();
      g.arc(sx, sy, sr, 0, 7);
      g.fillStyle = 'rgba(' + (200 + Math.round(r() * 55)) + ',' + (215 + Math.round(r() * 40)) + ',255,' + sa.toFixed(2) + ')';
      g.fill();
    }

    /* ---------- 极光底（静态的那一层，动的在 anim） ---------- */
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (var a = 0; a < 3; a++) {
      var ay = 120 + a * 52;
      g.beginPath();
      g.moveTo(-40, ay + 90);
      for (var x = 0; x <= W; x += 64) {
        var yy = ay + Math.sin(x / 320 + a * 1.7) * 46 + Math.cos(x / 170 + a) * 18;
        g.lineTo(x, yy);
      }
      g.lineTo(W + 40, ay + 210);
      for (var x2 = W; x2 >= 0; x2 -= 64) {
        var yy2 = ay + Math.sin(x2 / 320 + a * 1.7) * 46 + Math.cos(x2 / 170 + a) * 18;
        g.lineTo(x2, yy2 + 120);
      }
      g.closePath();
      g.fillStyle = lin(g, 0, ay - 60, 0, ay + 220, [
        0, 'rgba(90,255,210,0)', 0.35, a === 1 ? 'rgba(120,200,255,.20)' : 'rgba(96,255,206,.20)', 1, 'rgba(70,160,255,0)'
      ]);
      g.fill();
    }
    g.restore();

    /* ---------- 远山：三层，越远越淡越蓝 ---------- */
    function ridgeLine(pts, fillTop, fillBot, snow) {
      g.beginPath();
      g.moveTo(0, H);
      for (var i = 0; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.lineTo(W, H);
      g.closePath();
      g.fillStyle = lin(g, 0, 300, 0, GROUND_Y, [0, fillTop, 1, fillBot]);
      g.fill();
      if (snow) {
        g.save();
        g.beginPath();
        g.moveTo(0, H);
        for (var j = 0; j < pts.length; j++) g.lineTo(pts[j][0], pts[j][1]);
        g.lineTo(W, H);
        g.closePath();
        g.clip();
        g.fillStyle = 'rgba(190,216,255,.28)';
        g.fillRect(0, 330, W, 120);
        g.restore();
      }
    }
    ridgeLine([[-20, 470], [140, 396], [300, 452], [470, 372], [640, 440], [820, 380],
      [980, 446], [1150, 386], [1330, 452], [1500, 392], [1690, 448], [1880, 384], [2068, 452]],
    'rgba(60,92,150,.55)', 'rgba(44,72,120,.55)', true);
    ridgeLine([[-20, 512], [180, 452], [360, 500], [540, 438], [720, 496], [900, 446],
      [1090, 502], [1280, 448], [1470, 504], [1660, 452], [1860, 500], [2068, 458]],
    'rgba(36,62,104,.75)', 'rgba(26,46,82,.8)', true);

    /* ---------- 中景雪松林带：一排深色剪影，压住山脚 ---------- */
    g.beginPath();
    g.moveTo(0, GROUND_Y + 20);
    for (var tx = 0; tx < W; tx += 26) {
      var th = 38 + r() * 46;
      g.lineTo(tx, GROUND_Y + 10 - th);
      g.lineTo(tx + 13, GROUND_Y + 10);
    }
    g.lineTo(W, GROUND_Y + 40);
    g.lineTo(0, GROUND_Y + 40);
    g.closePath();
    g.fillStyle = 'rgba(9,20,36,.92)';
    g.fill();

    /* ---------- 雪原地面 ---------- */
    var gy = GROUND_Y;
    g.beginPath();
    g.moveTo(0, gy);
    g.lineTo(W, gy);
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.closePath();
    g.fillStyle = lin(g, 0, gy, 0, H, [0, '#c3d6ee', 0.24, '#dbe8f8', 0.62, '#eef5fd', 1, '#dde9f7']);
    g.fill();

    /* 林脚阴影：把树林和雪原接起来，不要留一条笔直的横线 */
    g.save();
    g.beginPath();
    g.moveTo(0, gy - 8);
    for (var bxp = 0; bxp <= W; bxp += 36) {
      g.lineTo(bxp, gy + 22 + Math.sin(bxp / 92) * 11 + Math.sin(bxp / 31) * 5);
    }
    g.lineTo(W, gy + 150);
    for (var bx2 = W; bx2 >= 0; bx2 -= 36) {
      g.lineTo(bx2, gy + 118 + Math.sin(bx2 / 128 + 1.3) * 22);
    }
    g.closePath();
    g.fillStyle = lin(g, 0, gy - 6, 0, gy + 150,
      [0, 'rgba(26,48,82,.40)', 0.55, 'rgba(40,72,116,.16)', 1, 'rgba(60,96,146,0)']);
    g.fill();
    g.restore();

    /* 风纹：成对的一亮一暗的弧线，让雪面有"被风刮过"的方向感 */
    for (var wr = 0; wr < 78; wr++) {
      var wx2b = r() * W;
      var wy2 = gy + 30 + r() * (H - gy - 40);
      var ww = 26 + r() * 86;
      var bend = 3 + r() * 4;
      g.beginPath();
      g.moveTo(wx2b - ww / 2, wy2);
      g.quadraticCurveTo(wx2b, wy2 - bend, wx2b + ww / 2, wy2);
      g.strokeStyle = 'rgba(255,255,255,' + (0.16 + r() * 0.16).toFixed(2) + ')';
      g.lineWidth = 1 + r() * 1.8;
      g.stroke();
      g.beginPath();
      g.moveTo(wx2b - ww / 2, wy2 + 3.4);
      g.quadraticCurveTo(wx2b, wy2 + 3.4 - bend, wx2b + ww / 2, wy2 + 3.4);
      g.strokeStyle = 'rgba(150,180,220,' + (0.10 + r() * 0.10).toFixed(2) + ')';
      g.lineWidth = 1.4 + r();
      g.stroke();
    }

    /* 起伏的雪包：大的几坨，带影子和高光（drift 里已经画了三层） */
    for (var d = 0; d < 34; d++) {
      var dx = r() * W, dy = gy + 44 + r() * (H - gy - 80);
      var dw = 46 + r() * 130, dh = 9 + r() * 18;
      drift(g, dx, dy, dw, dh, 0.34 + r() * 0.26);
    }

    /* 雪面的闪点：很淡，只在近处撒一层 */
    for (var sp2 = 0; sp2 < 320; sp2++) {
      var sx3 = r() * W, sy3 = gy + 40 + r() * (H - gy - 50);
      var sr3 = 0.5 + r() * 1.1;
      g.beginPath();
      g.arc(sx3, sy3, sr3, 0, 7);
      g.fillStyle = r() > 0.7 ? 'rgba(255,255,255,.5)' : 'rgba(206,226,248,.35)';
      g.fill();
    }

    /* 踩出来的一条雪路：从左往右缓缓上行，串起五个区域 */
    g.save();
    g.beginPath();
    g.moveTo(60, 980);
    g.bezierCurveTo(430, 940, 620, 900, 900, 912);
    g.bezierCurveTo(1180, 924, 1320, 878, 1520, 872);
    g.bezierCurveTo(1720, 866, 1860, 872, 2010, 828);
    g.strokeStyle = 'rgba(172,194,226,.55)';
    g.lineWidth = 74;
    g.lineCap = 'round';
    g.stroke();
    g.strokeStyle = 'rgba(198,216,240,.62)';
    g.lineWidth = 52;
    g.stroke();
    g.strokeStyle = 'rgba(236,244,254,.50)';
    g.lineWidth = 26;
    g.stroke();
    /* 路上被踩出来的碎痕 */
    for (var tr = 0; tr < 60; tr++) {
      var trx = 70 + r() * (W - 140);
      var trY = 980 - (trx / W) * 150 + (r() - 0.5) * 46;
      g.beginPath();
      g.ellipse(trx, trY, 4 + r() * 9, 1.6 + r() * 2, 0, 0, 7);
      g.fillStyle = 'rgba(255,255,255,.28)';
      g.fill();
    }
    g.restore();

    /* 近处的前景雪坡（画面底边压一层，人物走上去有层次） */
    g.beginPath();
    g.moveTo(0, H - 46);
    g.bezierCurveTo(W * 0.25, H - 72, W * 0.6, H - 30, W, H - 58);
    g.lineTo(W, H); g.lineTo(0, H);
    g.closePath();
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fill();

    /* ============================================================
     * 1 沉默的雪林
     * ============================================================ */
    // 远景密林
    for (var f = 0; f < 26; f++) {
      var fx = 10 + f * 18 + r() * 10;
      pine(g, fx, 600 + r() * 18, 110 + r() * 70, 30 + r() * 14, 100 + f, true);
    }
    // 中景雪松（有雪）
    var forestPines = [
      [70, 700, 210, 66], [148, 664, 176, 54], [232, 726, 236, 74], [318, 690, 190, 60],
      [390, 742, 220, 70], [46, 830, 190, 62], [300, 852, 168, 52], [430, 800, 200, 64]
    ];
    forestPines.forEach(function (p, i) { pine(g, p[0], p[1], p[2], p[3], 300 + i); });
    // 倒木与雪堆
    drift(g, 200, 940, 96, 22, 0.5);
    drift(g, 360, 918, 70, 16, 0.42);
    rock(g, 96, 962, 26, 3);
    rock(g, 268, 986, 18, 8);
    g.save();
    g.translate(322, 962);
    g.rotate(-0.12);
    g.fillStyle = '#2a2119';
    g.fillRect(-52, -9, 104, 18);
    g.fillStyle = 'rgba(236,247,255,.75)';
    g.fillRect(-52, -11, 104, 6);
    g.restore();

    // 入口传送门的地面符文圈（回程用）
    runeRing(g, PORTAL_IN.x, PORTAL_IN.y, 74, 32, 12, 21, 'rgba(110,190,255,.5)');
    drift(g, PORTAL_IN.x, PORTAL_IN.y + 6, 52, 14, 0.5);

    /* ============================================================
     * 2 冰晶小径
     * ============================================================ */
    // 冰晶簇：三组，大小错落
    [[520, 830, 96, 30], [556, 846, 62, 20], [500, 858, 44, 15],
    [700, 782, 118, 34], [736, 800, 70, 22], [672, 796, 52, 17],
    [812, 862, 84, 26], [846, 872, 54, 18]].forEach(function (c, i) {
      crystal(g, c[0], c[1], c[2], c[3], i % 3 === 0 ? 1 : 0);
    });
    // 石碑
    stele(g, 604, 900, 46, 86, 31);
    stele(g, 770, 940, 38, 64, 37);
    // 半埋的符文石板
    g.save();
    g.translate(660, 962);
    g.rotate(-0.05);
    g.fillStyle = '#39465f';
    g.fillRect(-42, -12, 84, 24);
    g.fillStyle = 'rgba(126,214,255,.55)';
    for (var rn = 0; rn < 4; rn++) g.fillRect(-32 + rn * 18, -4, 10, 3);
    g.fillStyle = 'rgba(238,248,255,.8)';
    g.fillRect(-44, -14, 88, 5);
    g.restore();
    // 一串脚印通向营地
    g.fillStyle = 'rgba(170,192,222,.55)';
    for (var fp = 0; fp < 16; fp++) {
      var px2 = 700 + fp * 27 + Math.sin(fp) * 8;
      var py2 = 930 - fp * 2.2 + Math.cos(fp * 0.8) * 5;
      g.beginPath();
      g.ellipse(px2, py2, 3.4, 2.2, fp % 2 ? 0.2 : -0.2, 0, 7);
      g.fill();
    }
    drift(g, 600, 860, 80, 18, 0.4);
    rock(g, 880, 900, 20, 12);

    /* ============================================================
     * 3 被遗忘营地
     * ============================================================ */
    cabin(g, 1042, 892, 190, 132);
    firePit(g, 1186, 946, 46);
    sled(g, 936, 962, 1);
    crate(g, 1132, 900, 40, 0.08);
    crate(g, 1170, 918, 30, -0.14);
    crate(g, 908, 916, 34, 0.2);
    // 挂着的东西（晾绳）
    g.strokeStyle = 'rgba(120,130,150,.5)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(958, 830);
    g.quadraticCurveTo(1010, 848, 1060, 832);
    g.stroke();
    g.fillStyle = 'rgba(200,214,232,.5)';
    g.fillRect(986, 838, 12, 18);
    g.fillRect(1024, 836, 10, 16);
    // 半埋在雪里的木桶
    g.save();
    g.translate(1236, 906);
    g.fillStyle = '#3a2b1f';
    g.beginPath();
    g.ellipse(0, 0, 16, 20, 0, 0, 7);
    g.fill();
    g.strokeStyle = 'rgba(140,110,78,.6)';
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(0, -4, 16, 8, 0, 0, 7); g.stroke();
    g.beginPath(); g.ellipse(0, 6, 16, 8, 0, 0, 7); g.stroke();
    g.beginPath(); g.ellipse(0, -14, 15, 6, 0, 0, 7);
    g.fillStyle = 'rgba(238,248,255,.9)';
    g.fill();
    g.restore();
    drift(g, 1000, 960, 110, 20, 0.45);

    /* ============================================================
     * 4 星光冰湖
     * ============================================================ */
    iceLake(g, LAKE.x, LAKE.y, LAKE.rx, LAKE.ry);
    // 湖边的雪松
    pine(g, 1288, 806, 176, 54, 501);
    pine(g, 1332, 872, 140, 44, 502);
    pine(g, 1664, 792, 168, 52, 503);
    pine(g, 1620, 876, 132, 40, 504);
    // 冰面上的碎冰
    [[1390, 792, 14], [1500, 828, 11], [1562, 790, 16], [1440, 840, 9]].forEach(function (ic, i) {
      g.save();
      g.translate(ic[0], ic[1]);
      g.rotate(i * 0.7);
      g.fillStyle = 'rgba(226,244,255,.85)';
      g.beginPath();
      g.moveTo(-ic[2] * 0.5, 0); g.lineTo(0, -ic[2] * 0.34); g.lineTo(ic[2] * 0.5, 0);
      g.closePath(); g.fill();
      g.restore();
    });
    drift(g, 1478, 902, 190, 22, 0.35);
    rock(g, 1700, 940, 24, 17);

    /* ============================================================
     * 5 古代遗迹
     * ============================================================ */
    // 地面符文大圈（就在门槛前）
    runeRing(g, RUINS.runeCenter.x, RUINS.runeCenter.y, 88, 30, 14, 61, 'rgba(120,200,255,.38)');
    // 石门
    arch(g, RUINS.gate.x, RUINS.gate.y, 1.0);
    // 断柱：只在两侧外围，不挡着门前那块空地
    column(g, 1698, 1006, 96, 30, 71);
    column(g, 2020, 1000, 120, 34, 72);
    column(g, 1652, 962, 54, 26, 73);
    column(g, 1954, 1028, 40, 22, 74);
    // 倒塌的石块
    rock(g, 1832, 1038, 16, 19);
    rock(g, 1902, 1042, 13, 23);
    rock(g, 1744, 1030, 12, 29);
    // 两个星形机关位（v5.0 会在这里放真正的机关；先做成地面上的凹槽）
    [[RUINS.mechA.x, RUINS.mechA.y], [RUINS.mechB.x, RUINS.mechB.y]].forEach(function (m, i) {
      g.save();
      /* 底下的石台（不缩放，给一点厚度） */
      g.beginPath();
      g.ellipse(m[0], m[1] + 6, 44, 16, 0, 0, 7);
      g.fillStyle = 'rgba(70,86,116,.55)';
      g.fill();
      g.beginPath();
      g.ellipse(m[0], m[1] + 2, 42, 15, 0, 0, 7);
      g.fillStyle = 'rgba(120,142,176,.35)';
      g.fill();
      g.translate(m[0], m[1]);
      g.scale(1, 0.42);
      g.beginPath();
      g.arc(0, 0, 34, 0, 7);
      g.fillStyle = 'rgba(18,28,44,.45)';
      g.fill();
      g.strokeStyle = 'rgba(120,200,255,.38)';
      g.lineWidth = 2.6;
      g.stroke();
      // 五角星凹槽
      g.beginPath();
      for (var k = 0; k < 10; k++) {
        var rr = k % 2 ? 9 : 22;
        var aa = -Math.PI / 2 + k * Math.PI / 5;
        if (k === 0) g.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
        else g.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
      }
      g.closePath();
      g.strokeStyle = 'rgba(170,232,255,.75)';
      g.lineWidth = 2.2;
      g.stroke();
      g.fillStyle = 'rgba(160,225,255,.22)';
      g.fill();
      g.restore();
      /* 星槽里透出的一点冷光 */
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.beginPath();
      g.ellipse(m[0], m[1], 30, 13, 0, 0, 7);
      g.fillStyle = rad(g, m[0], m[1], 30, [0, 'rgba(140,215,255,.30)', 1, 'rgba(120,200,255,0)']);
      g.fill();
      g.restore();
    });
    // 遗迹后面的雪松，给"古老"一点尺度
    pine(g, 1690, 748, 150, 46, 601);
    pine(g, 2020, 738, 168, 52, 602);

    /* ---------- 压角：左右各两棵巨大的前景雪松，把画面框住 ---------- */
    pine(g, 26, 1010, 300, 96, 901, true);
    pine(g, 2010, 1006, 316, 100, 902, true);
    drift(g, 0, 1042, 120, 26, 0.5);
    drift(g, W, 1036, 130, 28, 0.5);

    /* ---------- 暗角：把注意力收到中间 ---------- */
    var vg = rad(g, W * 0.5, H * 0.46, H * 0.42, [0, 'rgba(0,0,0,0)', 0.72, 'rgba(4,10,24,.20)', 1, 'rgba(3,8,20,.55)']);
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  /* ============================================================
   * 动态层（每帧只画这些）
   * ============================================================ */
  var STARS = [];
  (function () {
    var r = rnd(777);
    for (var i = 0; i < 46; i++) {
      STARS.push({ x: r() * W, y: r() * (GROUND_Y - 60), r: 0.7 + r() * 1.4, ph: r() * 7, sp: 0.6 + r() * 1.2 });
    }
  })();

  function anim(g, t) {
    var s = t / 1000;

    /* ---- 极光：三条会流动的带子 ---- */
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (var a = 0; a < 3; a++) {
      var ay = 118 + a * 54;
      var drift = Math.sin(s * 0.12 + a * 2.1) * 40;
      g.beginPath();
      g.moveTo(-60 + drift, ay + 96);
      for (var x = -60; x <= W + 60; x += 56) {
        var yy = ay + Math.sin((x + drift * 2) / 300 + a * 1.7 + s * 0.22) * 44
          + Math.cos((x + drift) / 160 + a + s * 0.15) * 16;
        g.lineTo(x, yy);
      }
      g.lineTo(W + 60, ay + 230);
      for (var x2 = W + 60; x2 >= -60; x2 -= 56) {
        var yy2 = ay + Math.sin((x2 + drift * 2) / 300 + a * 1.7 + s * 0.22) * 44
          + Math.cos((x2 + drift) / 160 + a + s * 0.15) * 16;
        g.lineTo(x2, yy2 + 110);
      }
      g.closePath();
      var al = 0.055 + 0.035 * Math.sin(s * 0.5 + a * 1.9);
      g.fillStyle = lin(g, 0, ay - 40, 0, ay + 230, [
        0, 'rgba(90,255,210,0)',
        0.34, a === 1 ? 'rgba(110,190,255,' + (al * 1.2).toFixed(3) + ')' : 'rgba(90,255,200,' + al.toFixed(3) + ')',
        1, 'rgba(60,150,255,0)'
      ]);
      g.fill();
    }
    g.restore();

    /* ---- 星星呼吸（只画固定那几十颗） ---- */
    for (var i = 0; i < STARS.length; i++) {
      var st = STARS[i];
      var tw = 0.35 + 0.65 * Math.abs(Math.sin(s * st.sp + st.ph));
      g.beginPath();
      g.arc(st.x, st.y, st.r * (0.7 + tw * 0.5), 0, 7);
      g.fillStyle = 'rgba(226,240,255,' + (tw * 0.75).toFixed(2) + ')';
      g.fill();
    }

    /* ---- 冰晶的呼吸光 ---- */
    var pulse = 0.55 + 0.45 * Math.sin(s * 1.1);
    [[520, 830], [700, 782], [812, 862]].forEach(function (c, i) {
      glow(g, c[0], c[1] - 50, 78 + i * 8, 'rgba(130,210,255,.30)', 0.35 + pulse * 0.35);
    });

    /* ---- 冰湖反光：几条横向流动的亮带 + 星点 ---- */
    g.save();
    g.beginPath();
    g.ellipse(LAKE.x, LAKE.y, LAKE.rx, LAKE.ry, 0, 0, 7);
    g.clip();
    for (var k = 0; k < 5; k++) {
      var wy = LAKE.y - LAKE.ry * 0.6 + k * (LAKE.ry * 0.3);
      var off = (s * (12 + k * 6)) % (LAKE.rx * 2);
      var wx = LAKE.x - LAKE.rx + off;
      g.beginPath();
      g.ellipse(wx, wy, 46 + k * 12, 2.4, 0, 0, 7);
      g.fillStyle = 'rgba(226,244,255,' + (0.10 + 0.06 * Math.sin(s * 0.9 + k)).toFixed(3) + ')';
      g.fill();
    }
    // 星光倒影
    for (var q = 0; q < 12; q++) {
      var sa2 = STARS[q];
      var ry2 = LAKE.y - LAKE.ry * 0.4 + (q % 6) * (LAKE.ry * 0.16);
      var ra2 = 0.4 + 0.6 * Math.abs(Math.sin(s * 1.4 + q));
      g.beginPath();
      g.arc(LAKE.x - LAKE.rx * 0.6 + q * (LAKE.rx * 0.1), ry2, 1.6 * ra2, 0, 7);
      g.fillStyle = 'rgba(235,250,255,' + (ra2 * 0.6).toFixed(2) + ')';
      g.fill();
    }
    g.restore();

    /* ---- 符文脉动（冰晶小径 + 遗迹） ---- */
    var rp = 0.5 + 0.5 * Math.sin(s * 0.9);
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, 604, 858, 54, 'rgba(120,210,255,.30)', 0.22 + rp * 0.28);
    glow(g, 770, 906, 46, 'rgba(120,210,255,.30)', 0.18 + rp * 0.24);
    glow(g, RUINS.runeCenter.x, RUINS.runeCenter.y, 190, 'rgba(110,190,255,.26)', 0.16 + rp * 0.22);
    glow(g, RUINS.mechA.x, RUINS.mechA.y, 64, 'rgba(140,220,255,.30)', 0.12 + rp * 0.20);
    glow(g, RUINS.mechB.x, RUINS.mechB.y, 64, 'rgba(140,220,255,.30)', 0.12 + rp * 0.20);
    // 石门里的微光（门还没开，只从缝里透出来）
    glow(g, RUINS.gate.x, RUINS.gate.y - 60, 96, 'rgba(120,200,255,.22)', 0.10 + rp * 0.14);
    g.restore();

    /* ---- 旧篝火的余烬：极淡，说明这里曾经有人 ---- */
    for (var e2 = 0; e2 < 4; e2++) {
      var rise = ((s * 16 + e2 * 21) % 60);
      var ea = 1 - rise / 60;
      g.beginPath();
      g.arc(1186 + Math.sin(s + e2) * 7, 946 - rise, 1.6 * ea + 0.6, 0, 7);
      g.fillStyle = 'rgba(255,170,90,' + (ea * 0.35).toFixed(2) + ')';
      g.fill();
    }

    /* ---- 飘雪：32 颗，够看出"在下雪"但不吃帧 ---- */
    for (var f2 = 0; f2 < 32; f2++) {
      var fx = ((f2 * 137 + s * (10 + (f2 % 5) * 4)) % (W + 80)) - 40;
      var fy = ((f2 * 211 + s * (18 + (f2 % 3) * 9)) % (H + 40)) - 20;
      var fa = 0.25 + 0.35 * Math.abs(Math.sin(s * 0.7 + f2));
      g.beginPath();
      g.arc(fx + Math.sin(s * 0.6 + f2) * 6, fy, 1.1 + (f2 % 3) * 0.5, 0, 7);
      g.fillStyle = 'rgba(240,250,255,' + fa.toFixed(2) + ')';
      g.fill();
    }

    /* ---- 回程传送门：符文环 + 光幕 + 旋转光线 ---- */
    drawPortal(g, PORTAL_IN.x, PORTAL_IN.y, 1.0, s, true);
  }

  /* ============================================================
   * 传送门 v4.10 —— 古老符文门
   * ------------------------------------------------------------
   * 小镇里那道门和北境的回程门是同一个函数，只是 scale 不同。
   *
   * 画法分两层（和圣诞树一个思路）：
   *   静态层：石柱 / 冰晶 / 断裂横楣 / 门座 —— 按 scale 烘一张位图，只烘一次；
   *   动态层：空间裂隙 / 旋转符文 / 向上光点 / 极光带 / 靠近增亮 / 进入蓄能。
   *
   * 关键的美术取舍：**这是像素画，不是插画**。
   * 第一版用了大片柔和渐变，结果整座门糊成一坨蓝色果冻，和小镇那种
   * 硬边色块的风格完全不像。现在改成：石头用 3 个色阶 + 1px 深色描边，
   * 裂隙用「深底 + 几层平涂光带 + 一道硬亮边」，渐变只留给地面那一小圈。
   * ============================================================ */
  var PORTAL_BAKE = {};

  var PST = {
    out: '#232e42',          // 描边
    hi: '#8294b2',           // 受光面
    mid: '#64769a',          // 中间调
    lo: '#465672',           // 背光面
    dark: '#33415c',         // 砌缝 / 暗部
    snow: '#f2f9ff',
    snow2: '#cfe1f4'
  };
  var PICE = { out: 'rgba(96,168,214,.75)', hi: 'rgba(214,244,255,.85)', mid: 'rgba(150,216,252,.62)' };

  /* 一根风化的石柱：硬边色块 + 1px 描边，顶上压雪 */
  function pillar(g, x, y, w, h, seed, lean) {
    var r = rnd(seed);
    g.save();
    g.translate(x, y);
    if (lean) g.rotate(lean);
    var hw = w / 2;

    /* 柱身（正面） */
    g.beginPath();
    g.moveTo(-hw, 0);
    g.lineTo(-hw + w * 0.05, -h * 0.93);
    g.lineTo(hw - w * 0.10, -h);
    g.lineTo(hw, 0);
    g.closePath();
    g.fillStyle = PST.mid;
    g.fill();
    /* 左受光 */
    g.beginPath();
    g.moveTo(-hw, 0);
    g.lineTo(-hw + w * 0.05, -h * 0.93);
    g.lineTo(-hw + w * 0.30, -h * 0.955);
    g.lineTo(-hw + w * 0.26, 0);
    g.closePath();
    g.fillStyle = PST.hi;
    g.fill();
    /* 右背光 */
    g.beginPath();
    g.moveTo(hw - w * 0.26, 0);
    g.lineTo(hw - w * 0.28, -h * 0.985);
    g.lineTo(hw - w * 0.10, -h);
    g.lineTo(hw, 0);
    g.closePath();
    g.fillStyle = PST.lo;
    g.fill();
    /* 描边 */
    g.beginPath();
    g.moveTo(-hw, 0);
    g.lineTo(-hw + w * 0.05, -h * 0.93);
    g.lineTo(hw - w * 0.10, -h);
    g.lineTo(hw, 0);
    g.strokeStyle = PST.out;
    g.lineWidth = Math.max(1, w * 0.055);
    g.stroke();

    /* 砌缝 */
    g.strokeStyle = PST.dark;
    g.lineWidth = Math.max(1, w * 0.05);
    for (var b = 1; b <= 3; b++) {
      var by = -h * (b / 4.2);
      g.beginPath();
      g.moveTo(-hw + w * 0.05, by);
      g.lineTo(hw - w * 0.04, by - h * 0.008);
      g.stroke();
    }
    /* 一道裂 */
    var cx0 = (r() - 0.5) * w * 0.2;
    g.beginPath();
    g.moveTo(cx0, -h * 0.16);
    g.lineTo(cx0 + w * 0.10, -h * 0.40);
    g.lineTo(cx0 - w * 0.05, -h * 0.62);
    g.stroke();

    /* 阴刻符文：暗槽（点亮时动态层在上面叠亮色） */
    for (var rn = 0; rn < 3; rn++) {
      var ry = -h * (0.28 + rn * 0.20);
      g.fillStyle = PST.dark;
      g.fillRect(-w * 0.17, ry, w * 0.34, Math.max(1.6, w * 0.07));
      if (rn % 2 === 0) g.fillRect(-w * 0.035, ry - w * 0.13, Math.max(1.6, w * 0.07), w * 0.26);
    }
    /* 顶雪：一块硬边的雪帽，往前探出一点 */
    g.beginPath();
    g.moveTo(-hw - w * 0.10, -h * 0.93);
    g.lineTo(-hw + w * 0.02, -h * 1.02);
    g.lineTo(hw - w * 0.06, -h * 0.99);
    g.lineTo(hw + w * 0.10, -h * 0.90);
    g.lineTo(hw - w * 0.30, -h * 0.90);
    g.lineTo(-hw + w * 0.24, -h * 0.87);
    g.closePath();
    g.fillStyle = PST.snow;
    g.fill();
    g.strokeStyle = PST.out;
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = PST.snow2;
    g.fillRect(-hw + w * 0.02, -h * 0.885, w * 0.72, Math.max(1, h * 0.012));

    /* 柱脚雪堆 */
    g.beginPath();
    g.ellipse(0, 0, w * 0.72, Math.max(2.2, w * 0.16), 0, 0, 7);
    g.fillStyle = PST.snow;
    g.fill();
    g.strokeStyle = PST.out;
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }

  /* 冰晶：三块硬边三角，深浅各一档 */
  function iceShard(g, x, y, h, w, lean) {
    g.save();
    g.translate(x, y);
    g.rotate(lean || 0);
    g.beginPath();
    g.moveTo(0, -h);
    g.lineTo(w, -h * 0.24);
    g.lineTo(w * 0.34, 0);
    g.lineTo(-w * 0.52, -h * 0.20);
    g.closePath();
    g.fillStyle = PICE.mid;
    g.fill();
    g.beginPath();
    g.moveTo(0, -h);
    g.lineTo(w * 0.26, -h * 0.30);
    g.lineTo(0, -h * 0.06);
    g.closePath();
    g.fillStyle = PICE.hi;
    g.fill();
    g.beginPath();
    g.moveTo(0, -h);
    g.lineTo(w, -h * 0.24);
    g.lineTo(w * 0.34, 0);
    g.lineTo(-w * 0.52, -h * 0.20);
    g.closePath();
    g.strokeStyle = PICE.out;
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }

  /* 静态层：门座 + 三根石柱（两高一低）+ 冰晶。烘一次，之后只贴图。 */
  function portalBake(scale) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var key = Math.round(scale * 100);
    if (PORTAL_BAKE[key]) return PORTAL_BAKE[key];
    var R = 54 * scale;
    var w = Math.ceil(R * 4.0), h = Math.ceil(R * 3.4);
    var ox = -w / 2, oy = -h * 0.88;
    var SS = 2;
    var cv = document.createElement('canvas');
    if (!cv || !cv.getContext) return null;
    cv.width = Math.max(1, Math.ceil(w * SS));
    cv.height = Math.max(1, Math.ceil(h * SS));
    var g = cv.getContext('2d');
    if (!g) return null;
    g.scale(SS, SS);
    g.translate(-ox, -oy);

    /* 门座：一块冻在冰里的石板 */
    g.beginPath();
    g.ellipse(0, 2, R * 1.30, R * 0.34, 0, 0, 7);
    g.fillStyle = PST.dark;
    g.fill();
    g.beginPath();
    g.ellipse(0, -1, R * 1.26, R * 0.31, 0, 0, 7);
    g.fillStyle = PST.mid;
    g.fill();
    g.beginPath();
    g.ellipse(0, -R * 0.09, R * 1.02, R * 0.22, 0, 0, 7);
    g.fillStyle = PST.hi;
    g.fill();
    g.beginPath();
    g.ellipse(0, -1, R * 1.26, R * 0.31, 0, 0, 7);
    g.strokeStyle = PST.out;
    g.lineWidth = 1.4;
    g.stroke();

    /* 后面的断柱（最矮，往后压，给纵深） */
    pillar(g, -R * 1.26, -R * 0.06, R * 0.26, R * 0.62, 7.3, 0);
    /* 左柱 */
    pillar(g, -R * 0.74, 0, R * 0.40, R * 1.94, 3.1, 0);
    /* 右柱（略矮一点，但两根都够高，横梁才搭得住） */
    pillar(g, R * 0.76, 0, R * 0.38, R * 1.80, 5.7, 0);

    /* 残拱：三块石头从左柱顶上往右搭，搭到一半就断了。
       第一版是一整块悬空的横梁，看起来像从柱子上支出来一根扁担 ——
       现在改成贴着柱顶、逐块降低的拱石，断口留在中间，
       既说明"这儿本来有座完整的门"，又不会封成一个现代门框。 */
    /* 横梁：从左右两根柱顶各伸出一截，中间断开。
       这样"这里本来是一座完整的门"读得出来，又不会封成现代门框。
       （试过单边一整块压顶石 —— 因为柱顶是斜切的，那块石头会浮在半空。） */
    function beam(sign, x0, x1) {
      g.beginPath();
      g.moveTo(x0, -R * 1.94);
      g.lineTo(x0, -R * 2.13);
      g.lineTo(x1, -R * 2.11);
      g.lineTo(x1 + sign * R * 0.03, -R * 2.04);   // 断口：斜着劈下去
      g.lineTo(x1 - sign * R * 0.02, -R * 1.96);
      g.lineTo(x0, -R * 1.94);
      g.closePath();
      g.fillStyle = PST.mid;
      g.fill();
      g.strokeStyle = PST.out;
      g.lineWidth = 1.3;
      g.stroke();
      /* 梁上的雪 */
      g.beginPath();
      g.moveTo(x0, -R * 2.13);
      g.lineTo((x0 + x1) / 2, -R * 2.18);
      g.lineTo(x1, -R * 2.11);
      g.lineTo(x1, -R * 2.07);
      g.lineTo((x0 + x1) / 2, -R * 2.13);
      g.lineTo(x0, -R * 2.09);
      g.closePath();
      g.fillStyle = PST.snow;
      g.fill();
      /* 梁下的符文槽 */
      g.fillStyle = PST.dark;
      var n2 = 3;
      for (var bi = 0; bi < n2; bi++) {
        var bx2 = x0 + (x1 - x0) * (0.16 + bi * 0.30);
        g.fillRect(bx2, -R * 2.03, R * 0.07, R * 0.025);
      }
    }
    beam(-1, -R * 0.90, -R * 0.16);
    beam(1, R * 0.92, R * 0.18);

    /* 掉在门座边上的一小块碎石（断口掉下来的，给故事感） */
    g.save();
    g.translate(R * 0.34, -R * 0.03);
    g.rotate(0.22);
    g.beginPath();
    g.moveTo(-R * 0.10, 0);
    g.lineTo(-R * 0.07, -R * 0.10);
    g.lineTo(R * 0.08, -R * 0.08);
    g.lineTo(R * 0.10, 0);
    g.closePath();
    g.fillStyle = PST.lo;
    g.fill();
    g.strokeStyle = PST.out;
    g.lineWidth = 1.1;
    g.stroke();
    g.restore();

    /* 柱脚的冰晶 */
    iceShard(g, -R * 1.04, -R * 0.02, R * 0.40, R * 0.13, -0.22);
    iceShard(g, -R * 0.88, 0, R * 0.26, R * 0.09, 0.16);
    iceShard(g, R * 1.02, -R * 0.02, R * 0.32, R * 0.11, 0.24);
    iceShard(g, R * 0.86, 0, R * 0.21, R * 0.08, -0.18);
    /* 门座上的残雪 */
    g.beginPath();
    g.ellipse(-R * 0.36, R * 0.0, R * 0.38, R * 0.075, 0, 0, 7);
    g.fillStyle = PST.snow;
    g.fill();
    g.beginPath();
    g.ellipse(R * 0.50, R * 0.02, R * 0.28, R * 0.06, 0, 0, 7);
    g.fillStyle = PST.snow;
    g.fill();

    var rec = { cv: cv, w: w, h: h, ox: ox, oy: oy, R: R };
    PORTAL_BAKE[key] = rec;
    return rec;
  }

  /* 地面魔法阵：两圈细环 + 短刻线 + 轮转的符文 */
  function portalCircle(g, R, s, lum, alpha) {
    g.save();
    g.scale(1, 0.40);
    var i, a;
    g.beginPath();
    g.arc(0, 0, R * 1.24, 0, 7);
    g.strokeStyle = 'rgba(110,196,255,' + (0.55 * lum * alpha).toFixed(3) + ')';
    g.lineWidth = 2.6;
    g.stroke();
    g.beginPath();
    g.arc(0, 0, R * 1.04, 0, 7);
    g.strokeStyle = 'rgba(160,224,255,' + (0.34 * lum * alpha).toFixed(3) + ')';
    g.lineWidth = 1.2;
    g.stroke();
    /* 环之间的短刻线（古老魔法阵的齿） */
    for (i = 0; i < 18; i++) {
      a = (i / 18) * Math.PI * 2 - s * 0.10;
      g.beginPath();
      g.moveTo(Math.cos(a) * R * 1.07, Math.sin(a) * R * 1.07);
      g.lineTo(Math.cos(a) * R * 1.21, Math.sin(a) * R * 1.21);
      g.strokeStyle = 'rgba(120,200,255,' + ((0.16 + 0.20 * Math.abs(Math.sin(s * 1.5 + i))) * lum * alpha).toFixed(3) + ')';
      g.lineWidth = 1.8;
      g.stroke();
    }
    /* 环上的符文块，慢速转 */
    for (i = 0; i < 10; i++) {
      a = (i / 10) * Math.PI * 2 + s * 0.16;
      g.save();
      g.rotate(a);
      g.translate(R * 1.14, 0);
      var l2 = 0.30 + 0.70 * Math.abs(Math.sin(s * 1.4 + i * 0.9));
      g.fillStyle = 'rgba(210,244,255,' + (l2 * 0.9 * lum * alpha).toFixed(3) + ')';
      g.fillRect(-R * 0.045, -R * 0.020, R * 0.090, R * 0.040);
      g.fillRect(-R * 0.011, -R * 0.068, R * 0.022, R * 0.048);
      g.restore();
    }
    g.restore();
  }

  /* 空间裂隙的轮廓：一个上下收窄、边缘会轻抖的"眼睛"形状 */
  /* 裂隙轮廓：一道**撕开的竖缝**。
     试过四种：兜帽形（像帐篷）、尖叶形（像蓝宝石）、圆拱门（像玻璃罩）、
     这个撕裂形。前三种都是"一块发光的实体"，只有撕裂形会被读成"洞"。
     做法：底宽 0.54R，往上收到 0.40R，顶端是参差的裂口（不是平滑曲线）。 */
  function riftHalfAt(R, t) {
    return R * (0.54 - 0.14 * t);
  }
  function riftPath(g, R, H2, s, ph) {
    var N = 16, i, t, w2, y2;
    g.beginPath();
    /* 左侧：从地面往上 */
    for (i = 0; i <= N; i++) {
      t = i / N;
      w2 = riftHalfAt(R, t) * (1 + 0.045 * Math.sin(t * 9 + s * 1.9 + ph));
      y2 = -H2 * t;
      if (i === 0) g.moveTo(-w2, y2); else g.lineTo(-w2, y2);
    }
    /* 顶端：参差的裂口（4 段折线，长短不一，随时间轻微起伏） */
    var top = [[-0.54, 0.975], [-0.27, 1.0], [0.0, 0.988], [0.27, 1.0], [0.54, 0.975]];
    for (i = 0; i < top.length; i++) {
      g.lineTo(top[i][0] * R * (0.95 + 0.02 * Math.sin(s * 1.3 + i)),
        -H2 * (top[i][1] + 0.008 * Math.sin(s * 1.7 + i * 2.1 + ph)));
    }
    /* 右侧：往下回到地面 */
    for (i = N; i >= 0; i--) {
      t = i / N;
      w2 = riftHalfAt(R, t) * (1 + 0.045 * Math.sin(t * 9 + s * 1.9 + 1.7 + ph));
      g.lineTo(w2, -H2 * t);
    }
    g.closePath();
  }

  function drawPortal(g, x, y, scale, s, atNorth, opt) {
    opt = opt || {};
    var near = Math.max(0, Math.min(1, opt.near || 0));        // 玩家靠近 0~1
    var charge = Math.max(0, Math.min(1, opt.charge || 0));    // 进入蓄能 0~1
    var R = 54 * scale;
    var pulse = 0.5 + 0.5 * Math.sin(s * 1.15);
    /* tone：白天把整座门压暗一点（0.72），否则在亮雪地上会糊成一团白；
       夜里给满。近/蓄能照旧往上加。 */
    var tone = (opt.tone === undefined ? 1 : opt.tone);
    var lum = (0.80 + near * 0.20 + charge * 0.50) * tone;
    var H2 = R * (1.66 + charge * 0.14);

    g.save();
    g.translate(x, y);

    /* ---- 1. 地面：一小圈冷暗底 + 一圈光池 ----
       雪地本来很亮，纯加法混合会被洗白，所以先压一层冷暗底再叠光。
       注意范围要收着 —— 第一版铺得太大，像地上摊了一滩水。 */
    g.beginPath();
    g.ellipse(0, 3, R * 1.16, R * 0.34, 0, 0, 7);
    g.fillStyle = rad(g, 0, 3, R * 1.16, [
      0, 'rgba(8,16,34,.34)', 0.62, 'rgba(10,20,42,.14)', 1, 'rgba(10,20,42,0)'
    ]);
    g.fill();
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.beginPath();
    g.ellipse(0, 2, R * 1.16, R * 0.26, 0, 0, 7);
    g.fillStyle = rad(g, 0, 2, R * 1.16, [
      0, 'rgba(96,190,255,' + (0.22 * lum).toFixed(3) + ')',
      1, 'rgba(80,150,255,0)'
    ]);
    g.fill();
    g.restore();

    /* ---- 2. 石头（烘焙位图；没有 canvas 的环境退化成两个方块） ---- */
    var rec = portalBake(scale);
    if (rec) {
      g.drawImage(rec.cv, rec.ox, rec.oy, rec.w, rec.h);
    } else {
      g.fillStyle = PST.mid;
      g.fillRect(-R * 1.12, -R * 1.64, R * 0.36, R * 1.64);
      g.fillRect(R * 0.79, -R * 1.26, R * 0.34, R * 1.26);
    }

    /* ---- 3. 魔法阵 ----
       必须画在石头之后：它刻在门座和冰面上，画在前面会被门座整个盖掉
       （第一版就是这样，地上那道环几乎看不见）。 */
    portalCircle(g, R, s, lum, 1);
    g.save();
    g.globalCompositeOperation = 'lighter';
    portalCircle(g, R, s, lum, 0.55);
    g.restore();

    /* ---- 4. 空间裂隙（整座门的主角） ---- */

    /* 4a. 门洞里的暗（先铺一层，别让背后的雪透进来） */
    riftPath(g, R, H2, s, 0);
    g.fillStyle = '#0a1633';
    g.fill();

    /* 4b. 门里那层"别处"的光。
       这里用一次竖向渐变是值得的：它同时给出了"下面亮、上面紫"的色序
       和纵深（越靠近地面越亮，光是从裂缝里漏到冰上的）。 */
    g.save();
    riftPath(g, R, H2, s, 0);
    g.clip();
    /* 门里：**深色**。
       这一版之前试过"整块亮蓝"，结果不管怎么调都读成一颗蓝宝石 ——
       因为一个又亮又饱和的形状，观众只会当它是个物件。
       洞就该是暗的：光只在边上、在里面流动的那几条丝上。 */
    g.fillStyle = lin(g, 0, 0, 0, -H2, [
      0, '#050a18',
      0.30, '#0a1430',
      0.62, '#0b1c3c',
      0.88, '#122a52',
      1, '#1b3a6a'
    ]);
    g.fillRect(-R, -H2, R * 2, H2);
    /* 贴着内壁的一圈冷光：让"洞口"有厚度，不是一张黑纸 */
    var ig = rad(g, 0, -H2 * 0.42, R * 0.66, [
      0, 'rgba(70,170,240,0)',
      0.72, 'rgba(70,170,240,.10)',
      1, 'rgba(140,220,255,.34)'
    ]);
    g.fillStyle = ig;
    g.fillRect(-R, -H2, R * 2, H2);
    /* 底部透上来的光（"那边"的光从地面漏出来） */
    g.beginPath();
    g.ellipse(0, 0, R * 0.52, R * 0.24, 0, 0, 7);
    g.fillStyle = rad(g, 0, 0, R * 0.52, [
      0, 'rgba(226,252,255,.80)', 1, 'rgba(120,200,255,0)'
    ]);
    g.fill();
    /* 竖向光帘：几条粗细不一的亮柱，慢慢晃 —— 这是"里面有东西在流"的关键 */
    g.globalCompositeOperation = 'lighter';
    for (var cu = 0; cu < 6; cu++) {
      /* 竖着往下淌的光丝：x 基本不变、只轻轻摆 —— 之前那些往中间收的曲线
         在洞里交叉成了一个大大的 "X"，像反光，不像光在流。 */
      var cxp2 = -R * 0.40 + cu * R * 0.16 + Math.sin(s * 0.7 + cu * 1.7) * R * 0.03;
      var cw2 = R * (0.03 + (cu % 3) * 0.022);
      g.beginPath();
      g.moveTo(cxp2, 0);
      g.quadraticCurveTo(cxp2 + Math.sin(s * 0.9 + cu) * R * 0.05, -H2 * 0.5,
        cxp2 + Math.sin(s * 1.2 + cu * 2) * R * 0.05, -H2 * 0.96);
      g.strokeStyle = cu % 2
        ? 'rgba(206,180,255,' + (0.32 + 0.14 * Math.sin(s * 1.9 + cu)).toFixed(3) + ')'
        : 'rgba(196,244,255,' + (0.36 + 0.16 * Math.sin(s * 1.6 + cu)).toFixed(3) + ')';
      g.lineWidth = cw2 * 1.6;
      g.stroke();
    }
    /* 中心一道更亮的核：有它，裂缝才像"透光"，而不是一块色板 */
    g.beginPath();
    g.ellipse(0, -H2 * 0.34, R * 0.06, H2 * 0.26, 0, 0, 7);
    g.fillStyle = 'rgba(236,252,255,.22)';
    g.fill();
    /* 往里飘的流光带：几条横的，慢慢往上走 */
    g.globalCompositeOperation = 'lighter';
    for (var b2 = 0; b2 < 4; b2++) {
      var by2 = -(((s * 22 + b2 * H2 * 0.25) % (H2 * 1.05)));
      g.beginPath();
      g.ellipse(Math.sin(s * 0.6 + b2) * R * 0.16, by2, R * 0.66, R * 0.055, 0, 0, 7);
      g.fillStyle = 'rgba(170,232,255,' + (0.11 + 0.05 * Math.sin(s * 2.4 + b2)).toFixed(3) + ')';
      g.fill();
    }
    /* 竖着的空间褶：两三条，颜色偏紫，提示"后面还有一层" */
    for (var k = 0; k < 3; k++) {
      var kx = -R * 0.34 + k * R * 0.34 + Math.sin(s * 0.9 + k * 2.1) * R * 0.05;
      g.beginPath();
      g.moveTo(kx, 0);
      g.quadraticCurveTo(kx + R * 0.10, -H2 * 0.5, kx * 0.42, -H2 * 0.96);
      g.strokeStyle = k === 1 ? 'rgba(186,152,255,.26)' : 'rgba(120,214,255,.20)';
      g.lineWidth = 1.6 + (k % 2) * 1.4;
      g.stroke();
    }
    /* 深处的星点 */
    for (var st2 = 0; st2 < 8; st2++) {
      var stx = Math.sin(st2 * 2.7 + s * 0.3) * R * 0.46;
      var sty = -((st2 * 0.141 + s * 0.045) % 1) * H2 * 0.9 - R * 0.05;
      var sa2 = 0.3 + 0.45 * Math.abs(Math.sin(s * 1.9 + st2));
      g.fillStyle = 'rgba(226,246,255,' + sa2.toFixed(2) + ')';
      g.fillRect(stx - 0.7, sty - 0.7, 1.4, 1.4);
    }
    g.restore();

    /* 4c. 硬亮边：外面一道窄光晕 + 一条 2px 的白边（像素画的"硬"就在这里） */
    g.save();
    g.globalCompositeOperation = 'lighter';
    riftPath(g, R, H2, s, 0);
    g.strokeStyle = 'rgba(90,180,255,' + (0.22 * lum).toFixed(3) + ')';
    g.lineWidth = 7;
    g.stroke();
    riftPath(g, R, H2, s, 0);
    g.strokeStyle = 'rgba(232,252,255,' + ((0.86 + pulse * 0.14) * lum).toFixed(3) + ')';
    g.lineWidth = 2.6;
    g.stroke();
    g.restore();

    /* 4d. 从裂缝里溢到空气里的一点点光（很淡，只为了让边缘不那么"贴纸"） */
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.beginPath();
    g.ellipse(0, -H2 * 0.55, R * (0.95 + charge * 0.3), H2 * 0.55, 0, 0, 7);
    g.fillStyle = rad(g, 0, -H2 * 0.55, R * 1.30, [
      0, 'rgba(110,196,255,' + ((0.10 + charge * 0.20) * lum).toFixed(3) + ')',
      1, 'rgba(90,150,255,0)'
    ]);
    g.fill();
    g.restore();

    /* 4e. 裂缝底部的光摊在门座上（没有这一块，门会像贴在背景上的贴纸） */
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.beginPath();
    g.ellipse(0, -R * 0.02, R * 0.56, R * 0.20, 0, 0, 7);
    g.fillStyle = rad(g, 0, -R * 0.02, R * 0.60, [
      0, 'rgba(190,245,255,' + ((0.34 + charge * 0.3) * lum).toFixed(3) + ')',
      1, 'rgba(90,170,255,0)'
    ]);
    g.fill();
    g.restore();

    /* ---- 5. 石柱上的符文：被门里的光点亮，一明一暗往上走 ---- */
    g.save();
    g.globalCompositeOperation = 'lighter';
    var cols = [[-R * 0.74, R * 1.96, R * 0.40], [R * 0.76, R * 1.46, R * 0.38]];
    for (var c = 0; c < cols.length; c++) {
      var cxp = cols[c][0], chp = cols[c][1], cwp = cols[c][2];
      for (var rn2 = 0; rn2 < 3; rn2++) {
        var ry2 = -chp * (0.28 + rn2 * 0.20);
        var gl2 = 0.18 + 0.82 * Math.max(0, Math.sin(s * 1.6 + rn2 * 1.1 + c * 0.7));
        g.fillStyle = 'rgba(150,228,255,' + (gl2 * 0.62 * lum).toFixed(3) + ')';
        g.fillRect(cxp - cwp * 0.17, ry2, cwp * 0.34, Math.max(1.6, cwp * 0.07));
        if (rn2 % 2 === 0) g.fillRect(cxp - cwp * 0.035, ry2 - cwp * 0.13, Math.max(1.6, cwp * 0.07), cwp * 0.26);
      }
    }
    /* 横楣符文带 */
    /* 横梁上的符文：左右各三颗，交替亮 */
    var beamRunes = [
      [-R * 0.66, -R * 2.05], [-R * 0.44, -R * 2.05], [-R * 0.30, -R * 2.04],
      [R * 0.66, -R * 2.05], [R * 0.44, -R * 2.05], [R * 0.30, -R * 2.04]
    ];
    for (var lr = 0; lr < beamRunes.length; lr++) {
      var gl3 = 0.18 + 0.82 * Math.max(0, Math.sin(s * 1.5 + lr * 0.8));
      g.fillStyle = 'rgba(160,232,255,' + (gl3 * 0.55 * lum).toFixed(3) + ')';
      g.fillRect(beamRunes[lr][0], beamRunes[lr][1], R * 0.07, R * 0.025);
    }
    g.restore();

    /* ---- 6. 向上的光点与雪粒（固定 12 个，按时间戳推，不存粒子） ---- */
    for (var p = 0; p < 12; p++) {
      var ph2 = ((s * (0.20 + (p % 4) * 0.032) + p * 0.083) % 1);
      var py2 = -ph2 * H2 * 1.02;
      var pxx = Math.sin(ph2 * 5.2 + p * 1.7) * R * (0.30 + ph2 * 0.22);
      var pa = (1 - ph2) * (0.40 + 0.22 * lum);
      g.fillStyle = p % 3 === 0
        ? 'rgba(206,190,255,' + pa.toFixed(2) + ')'
        : 'rgba(216,244,255,' + pa.toFixed(2) + ')';
      g.fillRect(pxx - 0.8, py2 - 0.8, 1.7, 1.7);
    }

    /* ---- 7. 极光带：偶尔从门里斜着扫过的一道绿紫光 ---- */
    var sweep = (s * 0.10) % 1;
    if (sweep < 0.5) {
      var sa = Math.sin((sweep / 0.5) * Math.PI) * (0.14 + 0.10 * lum);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.beginPath();
      g.moveTo(-R * 0.92, -H2 * (0.22 + sweep * 0.62));
      g.quadraticCurveTo(0, -H2 * (0.38 + sweep * 0.56), R * 0.92, -H2 * (0.24 + sweep * 0.60));
      g.lineTo(R * 0.92, -H2 * (0.17 + sweep * 0.60));
      g.quadraticCurveTo(0, -H2 * (0.31 + sweep * 0.56), -R * 0.92, -H2 * (0.15 + sweep * 0.62));
      g.closePath();
      g.fillStyle = 'rgba(150,255,214,' + sa.toFixed(3) + ')';
      g.fill();
      g.restore();
    }

    /* ---- 8. 进入时的吸入光效：向内收的光条 + 中心过曝 ---- */
    if (charge > 0.001) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.beginPath();
      g.ellipse(0, -H2 * 0.5, R * 1.1, H2 * 0.5, 0, 0, 7);
      g.fillStyle = rad(g, 0, -H2 * 0.5, R * 1.2, [
        0, 'rgba(235,252,255,' + (charge * 0.5).toFixed(3) + ')',
        1, 'rgba(120,200,255,0)'
      ]);
      g.fill();
      for (var q = 0; q < 10; q++) {
        var qa = (q / 10) * Math.PI * 2 + s * 0.9;
        var r0 = R * (1.6 - charge * 0.85);
        g.beginPath();
        g.moveTo(Math.cos(qa) * r0, -H2 * 0.48 + Math.sin(qa) * r0 * 0.62);
        g.lineTo(Math.cos(qa) * r0 * 0.45, -H2 * 0.48 + Math.sin(qa) * r0 * 0.28);
        g.strokeStyle = 'rgba(210,246,255,' + (charge * 0.5).toFixed(3) + ')';
        g.lineWidth = 2;
        g.stroke();
      }
      g.restore();
    }

    g.restore();
  }

  /* ============================================================
   * 碰撞体
   * ============================================================ */
  var obstacles = [
    /* 雪林的树干（留出中间的路，不要把玩家堵死） */
    { x: 52, y: 690, w: 30, h: 22 },
    { x: 214, y: 716, w: 34, h: 24 },
    { x: 372, y: 734, w: 32, h: 22 },
    { x: 288, y: 692, w: 26, h: 18 },
    /* 冰晶小径：晶簇与石碑 */
    { x: 496, y: 816, w: 46, h: 26 },
    { x: 686, y: 768, w: 52, h: 28 },
    { x: 800, y: 850, w: 44, h: 24 },
    { x: 588, y: 888, w: 34, h: 20 },
    { x: 756, y: 930, w: 30, h: 18 },
    /* 营地：木屋、雪橇、木箱 */
    { x: 946, y: 846, w: 192, h: 52 },
    { x: 896, y: 954, w: 108, h: 22 },
    { x: 1112, y: 884, w: 44, h: 26 },
    { x: 1152, y: 904, w: 34, h: 20 },
    { x: 1222, y: 892, w: 30, h: 22 },
    /* 冰湖边缘（湖面能走，但两端封住，绕湖走） */
    { x: 1280, y: 776, w: 26, h: 30 },
    { x: 1648, y: 764, w: 26, h: 30 },
    /* 遗迹：两根门柱（1801~1843 / 1897~1939，柱脚在 936）+ 两侧断柱 */
    { x: 1801, y: 902, w: 42, h: 38 },
    { x: 1897, y: 902, w: 42, h: 38 },
    { x: 1680, y: 986, w: 36, h: 24 },
    { x: 2002, y: 980, w: 36, h: 24 },
    { x: 1640, y: 948, w: 24, h: 18 }
  ];


  /* ============================================================
   * v4.10 寻宝：挖掘点 / 旧雪橇 / 那封信 / 古老宝箱
   * ------------------------------------------------------------
   * 一切坐标都是**固定的**，不随机 —— 两个人看到的是同一份地图，
   * 进度写在 world.north 里共享，所以 v5.0 的双人机关也能直接接着用。
   *
   * 五种挖掘反馈（四个错的，一个对的）：
   *   soft    雪是松的，一铲子下去空空的
   *   stone   碰到了石头
   *   dull    硬东西，但声音很闷（旧木箱角）
   *   prints  挖出一段很老的脚印
   *   treasure 脚下硬得反常 —— 金属或陶罐的回声
   * 错误地点没有任何惩罚，也不消耗东西，只是"这里不对"。
   * ============================================================ */
  var DIGS = [
    {
      id: 'soft', x: 330, y: 790, kind: 'soft', r: 62,
      label: '⛏ 挖开这里的雪',
      title: '松软的雪',
      lines: ['铲子很轻松就捅进去了，雪下面是空的、松的。',
        '除了雪，还是雪。']
    },
    {
      id: 'stone', x: 704, y: 846, kind: 'stone', r: 62,
      label: '⛏ 挖开这里的雪',
      title: '雪下是石头',
      lines: ['铲刃"当"地磕了一下，震得手发麻。',
        '扒开雪，是一块埋在地里的石头，边角被冰磨得很圆。']
    },
    {
      id: 'dull', x: 1186, y: 820, kind: 'dull', r: 62,
      label: '⛏ 挖开这里的雪',
      title: '闷闷的一声',
      lines: ['铲子碰到了硬东西 —— 可那声音是闷的，像敲在旧木头上。',
        '是一角烂掉的木箱，钉子都锈没了。']
    },
    {
      id: 'prints', x: 1352, y: 838, kind: 'prints', r: 62,
      label: '⛏ 挖开这里的雪',
      title: '雪下的脚印',
      lines: ['铲子下去，露出来的不是土，是一串脚印。',
        '很小，很浅，一层一层被雪压过。有人在这里站过很久，然后走了。']
    },
    {
      id: 'treasure', x: 1560, y: 900, kind: 'treasure', r: 66,
      label: '⛏ 这里不一样',
      title: '底下有东西',
      lines: ['铲刃撞上去，是一声很脆的金属响。',
        '不是石头。是某种……容器。']
    }
  ];

  /* 旧雪橇旁那封信（信本身在 camp 的雪橇边上） */
  var LETTER = { x: 1016, y: 946, r: 66 };
  var SLED = { x: 936, y: 962, r: 70 };      // 那辆旧雪橇（画在 camp 段里）
  var CHEST = { x: 1560, y: 900 };

  /* ---------- 挖过的坑 ---------- */
  function drawPit(g, x, y, kind) {
    g.save();
    /* 坑：外圈翻出来的雪，里面是暗的 */
    g.beginPath();
    g.ellipse(x, y, kind === 'treasure' ? 40 : 28, kind === 'treasure' ? 15 : 11, 0, 0, 7);
    g.fillStyle = 'rgba(226,238,252,.85)';
    g.fill();
    g.beginPath();
    g.ellipse(x, y - 1, kind === 'treasure' ? 33 : 22, kind === 'treasure' ? 11 : 8, 0, 0, 7);
    g.fillStyle = kind === 'prints' ? 'rgba(96,116,146,.85)' : 'rgba(28,40,60,.8)';
    g.fill();
    g.beginPath();
    g.ellipse(x - 2, y - 3, (kind === 'treasure' ? 33 : 22) * 0.8, (kind === 'treasure' ? 11 : 8) * 0.6, 0, 0, 7);
    g.fillStyle = 'rgba(12,18,30,.55)';
    g.fill();
    if (kind === 'prints') {
      g.fillStyle = 'rgba(190,206,228,.55)';
      for (var i = 0; i < 4; i++) {
        g.fillRect(x - 14 + i * 8, y - 2 + (i % 2) * 3, 3, 2);
      }
    }
    if (kind === 'stone') {
      g.beginPath();
      g.ellipse(x + 4, y - 2, 9, 5, 0.2, 0, 7);
      g.fillStyle = '#54637e';
      g.fill();
    }
    g.restore();
  }

  /* ---------- 最终宝箱 ----------
     这一段重画过：v4.10 那个 56×46 的"小木屋"当不起整条线的终点。
     现在 116×92，木箱体 + 青铜包边 + 中央符文锁 + **两个星形钥匙槽** +
     积雪 + 冰晶 + 呼吸的蓝光。平时它是安静的，开箱时才亮起来。 */
  var CHEST_W = 116, CHEST_H = 92;

  /* opened: 0 关 / 0~1 开盖过程中 / 1 已开 */
  function drawChest(g, x, y, ts, opened, keyIn) {
    var t = (typeof ts === 'number') ? ts : 0;
    var open = (typeof opened === 'number') ? Math.max(0, Math.min(1, opened)) : (opened ? 1 : 0);
    var glow = 0.55 + 0.45 * Math.sin(t / 620);
    var W2 = CHEST_W / 2;
    g.save();
    g.translate(x, y);

    /* 影子 */
    g.beginPath();
    g.ellipse(0, 0, W2 * 0.95, 13, 0, 0, 7);
    g.fillStyle = 'rgba(6,12,24,.46)';
    g.fill();

    /* 开盖后从箱子里溢出来的光（先画，被箱体压住一部分） */
    if (open > 0.02) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.beginPath();
      g.ellipse(0, -CHEST_H * 0.55, W2 * (0.5 + open * 0.5), CHEST_H * (0.35 + open * 0.5), 0, 0, 7);
      g.fillStyle = rad(g, 0, -CHEST_H * 0.55, W2 * 1.1, [
        0, 'rgba(226,250,255,' + (0.42 * open).toFixed(3) + ')',
        0.55, 'rgba(140,220,255,' + (0.20 * open).toFixed(3) + ')',
        1, 'rgba(110,190,255,0)'
      ]);
      g.fill();
      g.restore();
    }

    /* ---- 箱体 ---- */
    var bodyH = CHEST_H * 0.60;
    g.beginPath();
    g.rect(-W2, -bodyH, CHEST_W, bodyH);
    g.fillStyle = lin(g, -W2, -bodyH, W2, 0, [0, '#5a4028', 0.45, '#4a3420', 1, '#382718']);
    g.fill();
    /* 木纹竖条 */
    g.strokeStyle = 'rgba(28,18,10,.45)';
    g.lineWidth = 1.2;
    for (var i = 1; i < 5; i++) {
      var px = -W2 + (CHEST_W / 5) * i;
      g.beginPath(); g.moveTo(px, -bodyH + 4); g.lineTo(px, -2); g.stroke();
    }
    /* 木纹高光 */
    g.strokeStyle = 'rgba(150,116,74,.22)';
    g.lineWidth = 1;
    for (var i2 = 0; i2 < 5; i2++) {
      var px2 = -W2 + 4 + (CHEST_W / 5) * i2;
      g.beginPath(); g.moveTo(px2, -bodyH + 6); g.lineTo(px2, -4); g.stroke();
    }
    /* 青铜包边：上下各一道 + 两侧竖条 */
    g.fillStyle = '#8a6a3a';
    g.fillRect(-W2, -bodyH, CHEST_W, 6);
    g.fillRect(-W2, -8, CHEST_W, 8);
    g.fillRect(-W2, -bodyH, 7, bodyH);
    g.fillRect(W2 - 7, -bodyH, 7, bodyH);
    g.fillStyle = 'rgba(214,176,106,.55)';
    g.fillRect(-W2 + 1, -bodyH + 1, CHEST_W - 2, 1.6);
    g.fillRect(-W2 + 1, -7, CHEST_W - 2, 1.6);
    /* 铆钉 */
    g.fillStyle = '#d8b46a';
    for (var rv = 0; rv < 4; rv++) {
      g.fillRect(-W2 + 2 + rv * (CHEST_W - 8) / 3, -bodyH + 2, 2.6, 2.6);
      g.fillRect(-W2 + 2 + rv * (CHEST_W - 8) / 3, -6, 2.6, 2.6);
    }

    /* ---- 盖子（会随 open 转开） ---- */
    g.save();
    g.translate(-W2, -bodyH);
    g.rotate(-open * 0.95);
    var lidH = CHEST_H * 0.34;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(W2, -lidH * 1.15, CHEST_W, 0);
    g.lineTo(CHEST_W, 6);
    g.quadraticCurveTo(W2, -lidH * 0.75, 0, 6);
    g.closePath();
    g.fillStyle = lin(g, 0, -lidH, 0, 6, [0, '#6a4c30', 1, '#4a3420']);
    g.fill();
    /* 盖上的青铜箍 */
    g.strokeStyle = '#8a6a3a';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(W2, -lidH * 1.15, CHEST_W, 0);
    g.stroke();
    g.strokeStyle = 'rgba(216,180,106,.6)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, -1.5);
    g.quadraticCurveTo(W2, -lidH * 1.15 - 1.5, CHEST_W, -1.5);
    g.stroke();
    /* 盖上的雪 + 冰晶 */
    g.fillStyle = 'rgba(240,250,255,.95)';
    g.beginPath();
    g.ellipse(W2 * 0.72, -lidH * 0.42, W2 * 0.46, 5.5, -0.06, 0, 7);
    g.fill();
    g.beginPath();
    g.ellipse(W2 * 0.30, -lidH * 0.30, W2 * 0.22, 3.4, 0.1, 0, 7);
    g.fill();
    g.fillStyle = 'rgba(190,232,255,.75)';
    g.beginPath();
    g.moveTo(W2 * 1.30, -lidH * 0.10);
    g.lineTo(W2 * 1.42, -lidH * 0.42);
    g.lineTo(W2 * 1.50, -lidH * 0.06);
    g.closePath();
    g.fill();
    g.restore();

    /* ---- 中央锁：青铜牌 + 符文锁孔 ---- */
    var lockY = -bodyH * 0.46;
    g.fillStyle = '#8a6a3a';
    g.fillRect(-13, lockY - 14, 26, 30);
    g.fillStyle = '#b8934e';
    g.fillRect(-11, lockY - 12, 22, 26);
    g.fillStyle = '#d8b46a';
    g.fillRect(-11, lockY - 12, 22, 2);
    /* 锁孔 */
    g.fillStyle = '#1a2230';
    g.fillRect(-2.4, lockY - 6, 4.8, 12);
    g.beginPath();
    g.arc(0, lockY - 8, 4.2, 0, 7);
    g.fill();
    /* 锁孔里的蓝光（呼吸） */
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(150,228,255,' + (0.35 + glow * 0.45).toFixed(3) + ')';
    g.fillRect(-1.4, lockY - 5, 2.8, 9);
    g.beginPath();
    g.arc(0, lockY - 8, 2.6, 0, 7);
    g.fill();
    g.restore();

    /* ---- 两个星形钥匙槽（一左一右） ---- */
    var slotY = lockY + 2;
    [-1, 1].forEach(function (sd) {
      var sx = sd * (W2 * 0.52);
      g.save();
      g.translate(sx, slotY);
      /* 凹槽底 */
      starPath(g, 0, 0, 9.5, 0);
      g.fillStyle = 'rgba(12,18,28,.85)';
      g.fill();
      starPath(g, 0, 0, 9.5, 0);
      g.strokeStyle = 'rgba(138,106,58,.9)';
      g.lineWidth = 1.4;
      g.stroke();
      /* 插了钥匙就亮 */
      if (keyIn) {
        starPath(g, 0, 0, 7, 0);
        g.fillStyle = 'rgba(160,238,255,' + (0.55 + glow * 0.40).toFixed(3) + ')';
        g.fill();
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.beginPath();
        g.ellipse(0, 0, 17, 17, 0, 0, 7);
        g.fillStyle = rad(g, 0, 0, 17, [0, 'rgba(140,225,255,.30)', 1, 'rgba(120,200,255,0)']);
        g.fill();
        g.restore();
      }
      g.restore();
    });

    /* ---- 箱脚 ---- */
    g.fillStyle = '#2c1e12';
    g.fillRect(-W2 + 4, 0, 12, 4);
    g.fillRect(W2 - 16, 0, 12, 4);

    /* ---- 呼吸光 + 少量蓝色粒子（平时就很克制） ---- */
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.beginPath();
    g.ellipse(0, lockY, 42, 26, 0, 0, 7);
    g.fillStyle = rad(g, 0, lockY, 42, [
      0, 'rgba(120,205,255,' + (0.10 + glow * 0.10).toFixed(3) + ')',
      1, 'rgba(120,205,255,0)'
    ]);
    g.fill();
    g.restore();
    for (var p2 = 0; p2 < 5; p2++) {
      var ph = ((t / 2600 + p2 * 0.2) % 1);
      var py = -8 - ph * 54;
      var pxx = Math.sin(ph * 5 + p2 * 2.1) * 26;
      g.fillStyle = 'rgba(190,236,255,' + ((1 - ph) * 0.55).toFixed(2) + ')';
      g.fillRect(pxx - 1, py - 1, 2, 2);
    }
    g.restore();
  }

  /* ---------- 像素小图标（获得物品 / 管理员面板用） ----------
     kind: shovel | letter | chest | key */
  function drawIcon(g, kind, size) {
    var u = size / 16;
    g.save();
    g.clearRect && g.clearRect(0, 0, size, size);
    g.translate(0, 0);
    function px(x, y, w, h, c) { g.fillStyle = c; g.fillRect(x * u, y * u, w * u, h * u); }
    if (kind === 'shovel') {
      px(7, 1, 2, 9, '#8a6a44');          // 木柄
      px(7, 0, 2, 1, '#a98a5e');
      px(6, 9, 4, 2, '#9aa8bb');          // 铁颈
      px(5, 11, 6, 4, '#c3cedd');         // 铲面
      px(6, 15, 4, 1, '#7c8b9e');
      px(6, 11, 1, 4, '#e8f1fa');         // 高光
      px(6, 2, 1, 7, '#6d5233');          // 柄暗边
    } else if (kind === 'letter') {
      px(2, 4, 12, 9, '#f2e6c8');
      px(2, 4, 12, 1, '#d8c69c');
      px(3, 6, 10, 6, '#fbf3df');
      px(3, 6, 5, 1, '#c9b184');
      px(4, 8, 8, 1, '#c9b184');
      px(4, 10, 6, 1, '#c9b184');
      px(11, 9, 3, 3, '#b8422f');         // 火漆
    } else if (kind === 'chest') {
      px(2, 7, 12, 7, '#5d4530');
      px(2, 4, 12, 4, '#6b5038');
      px(2, 4, 12, 1, '#8a6a3a');
      px(2, 11, 12, 1, '#8a6a3a');
      px(7, 6, 2, 5, '#d8b46a');
      px(7, 8, 2, 2, '#8ce1ff');
      px(3, 3, 10, 1, '#f2f9ff');
    } else if (kind === 'map') {
      /* 禾的地图：卷边的羊皮纸 + 一条折线 */
      px(2, 3, 12, 10, '#d9c49a');
      px(3, 4, 10, 8, '#efe0bd');
      px(2, 3, 1, 10, '#b8a077');
      px(13, 3, 1, 10, '#b8a077');
      px(5, 6, 2, 1, '#8a7350');
      px(7, 7, 2, 1, '#8a7350');
      px(9, 6, 2, 1, '#8a7350');
      px(9, 9, 2, 1, '#8a7350');
      px(6, 10, 3, 1, '#8a7350');
    } else if (kind === 'coat') {
      /* 北境御寒衣：深蓝 + 白毛领 */
      px(4, 3, 8, 3, '#e8f2fb');          // 毛领
      px(3, 5, 10, 8, '#2f4a72');         // 衣身
      px(6, 5, 4, 8, '#3c5c88');
      px(7, 5, 2, 8, '#24405f');          // 门襟
      px(3, 5, 1, 8, '#1d3350');
      px(12, 5, 1, 8, '#1d3350');
      px(3, 12, 3, 2, '#22405f');
      px(10, 12, 3, 2, '#22405f');
      px(7, 8, 2, 1, '#c9a45c');          // 扣
      px(7, 11, 2, 1, '#c9a45c');
    } else if (kind === 'auroraBox') {
      /* 极光盒子：木盒 + 盒盖上一道光 */
      px(2, 6, 12, 8, '#5a4028');
      px(2, 5, 12, 2, '#6b4e30');
      px(2, 5, 12, 1, '#8a6a3a');
      px(7, 7, 2, 6, '#8a6a3a');
      px(3, 9, 2, 2, '#3fd0b0');
      px(5, 8, 2, 4, '#57e0c0');
      px(9, 7, 2, 5, '#7fe6d4');
      px(11, 10, 2, 2, '#a8f0e4');
    } else if (kind === 'key') {
      px(3, 2, 5, 5, '#c9a45c');
      px(4, 3, 3, 3, '#8ce1ff');
      px(7, 6, 2, 8, '#c9a45c');
      px(9, 11, 3, 2, '#c9a45c');
      px(9, 8, 2, 2, '#c9a45c');
    }
    g.restore();
  }

  /* ============================================================
   * v5.0 双人星门 / 星钥 / 最终宝箱
   * ------------------------------------------------------------
   * 两个星纹台（mechA / mechB）就在石门前，间距 200。
   * 充能状态不写存档：两台设备各自用"双方的实时坐标"算，天然一致；
   * 真正需要共享的只有「门开了」这个结果 —— 那一步走 mutate 事务。
   * ============================================================ */
  var GATE = {
    a: { x: RUINS.mechA.x, y: RUINS.mechA.y },
    b: { x: RUINS.mechB.x, y: RUINS.mechB.y },
    arch: { x: RUINS.gate.x, y: RUINS.gate.y },
    r: 44                       // 站到多近算"踩上去了"
  };

  /* 五角星路径（尖朝上），半径 r */
  function starPath(g, cx, cy, r, rot) {
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = rot + (i / 10) * Math.PI * 2 - Math.PI / 2;
      var rr = (i % 2 === 0) ? r : r * 0.44;
      var px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
  }

  /* 星纹台：没踩上去的时候是一圈很淡的刻纹，踩上去自下而上点亮 */
  function drawPad(g, x, y, fill, ts, side) {
    fill = Math.max(0, Math.min(1, fill || 0));
    var pulse = 0.5 + 0.5 * Math.sin(ts / 480 + (side === 'a' ? 0 : 1.7));
    g.save();
    /* 台面 */
    g.beginPath();
    g.ellipse(x, y, 54, 19, 0, 0, 7);
    g.fillStyle = 'rgba(30,44,66,.55)';
    g.fill();
    g.beginPath();
    g.ellipse(x, y - 2, 50, 17, 0, 0, 7);
    g.fillStyle = 'rgba(70,88,118,.55)';
    g.fill();

    /* 外圈刻纹 */
    g.save();
    g.beginPath();
    g.ellipse(x, y - 2, 46, 15.5, 0, 0, 7);
    g.strokeStyle = 'rgba(120,200,255,' + (0.24 + fill * 0.6).toFixed(3) + ')';
    g.lineWidth = 2;
    g.stroke();
    g.restore();

    /* 五角星刻纹：用 clip 让点亮"从下往上长" */
    g.save();
    if (fill > 0.01) {
      g.beginPath();
      g.rect(x - 60, y - 2 - 26 * fill, 120, 26 * fill + 4);
      g.clip();
    }
    starPath(g, x, y - 3, 26, ts / 2600 * (side === 'a' ? 1 : -1));
    g.fillStyle = 'rgba(150,228,255,' + (0.12 + fill * 0.72).toFixed(3) + ')';
    g.fill();
    starPath(g, x, y - 3, 26, ts / 2600 * (side === 'a' ? 1 : -1));
    g.strokeStyle = 'rgba(210,245,255,' + (0.30 + fill * 0.6).toFixed(3) + ')';
    g.lineWidth = 1.6;
    g.stroke();
    g.restore();

    /* 点亮后的地面光池 */
    if (fill > 0.02) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.beginPath();
      g.ellipse(x, y, 58, 20, 0, 0, 7);
      g.fillStyle = rad(g, x, y, 58, [
        0, 'rgba(150,235,255,' + (0.34 * fill * (0.7 + pulse * 0.3)).toFixed(3) + ')',
        1, 'rgba(120,200,255,0)'
      ]);
      g.fill();
      g.restore();
    }
    g.restore();
  }

  /* 两座台之间的能量线：踩满时抽过去，带流动的光点 */
  function drawBeam(g, ax, ay, bx, by, p, ts) {
    if (p <= 0.01) return;
    var N = 18;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < N; i++) {
      var t0 = i / N, t1 = (i + 1) / N;
      if (t1 > p) break;
      var x0 = ax + (bx - ax) * t0, y0 = ay + (by - ay) * t0 - 3;
      var x1 = ax + (bx - ax) * t1, y1 = ay + (by - ay) * t1 - 3;
      var mid = (x0 + x1) / 2;
      var wave = Math.sin(t0 * 6 + ts / 300) * 6 * Math.sin(Math.PI * t0);
      g.beginPath();
      g.moveTo(x0, y0 + wave);
      g.lineTo(x1, y1 + wave);
      g.strokeStyle = 'rgba(170,240,255,' + (0.35 + 0.35 * Math.sin(t0 * 9 - ts / 220)).toFixed(3) + ')';
      g.lineWidth = 3.2;
      g.stroke();
    }
    /* 顺流的光点 */
    for (var k = 0; k < 4; k++) {
      var ph = ((ts / 900 + k * 0.25) % 1) * p;
      var px = ax + (bx - ax) * ph;
      var py = ay + (by - ay) * ph - 3 + Math.sin(ph * 6 + ts / 300) * 6 * Math.sin(Math.PI * ph);
      g.beginPath();
      g.arc(px, py, 2.6, 0, 7);
      g.fillStyle = 'rgba(230,252,255,.9)';
      g.fill();
    }
    g.restore();
  }

  /* 石门的两扇门叶。open = 0 关死，1 完全打开（各自缩进旁边的石柱里）
     —— 第一版画成了一整块浅灰板 + 一排亮横条，远看像栋亮着窗的楼。
     现在改成：深色石面 + 错缝的石块 + 中间一道缝 + 一枚浅浅的星纹。 */
  function drawGateDoor(g, x, y, open, ts) {
    open = Math.max(0, Math.min(1, open || 0));
    var gap = 96, hh = 164, leaf = gap / 2;
    var slide = open * (leaf * 0.94);
    var r = rnd(31);

    /* 门后：先铺深色，再透出一点光 */
    if (open > 0.02) {
      g.beginPath();
      g.rect(x - leaf, y - hh, gap, hh);
      g.fillStyle = 'rgba(5,8,16,' + (0.55 + open * 0.40).toFixed(3) + ')';
      g.fill();
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.beginPath();
      g.ellipse(x, y - hh * 0.52, gap * 0.40 * open, hh * 0.46, 0, 0, 7);
      g.fillStyle = rad(g, x, y - hh * 0.52, gap * 0.52, [
        0, 'rgba(120,210,255,' + (0.26 * open).toFixed(3) + ')',
        1, 'rgba(90,170,255,0)'
      ]);
      g.fill();
      g.restore();
    }

    /* 门叶都裁在门洞里：滑开之后是被石柱挡住，而不是飘到柱子外面去 */
    g.save();
    g.beginPath();
    g.rect(x - leaf, y - hh - 6, gap, hh + 8);
    g.clip();

    function one(side) {
      g.save();
      /* 往两侧滑：左叶往左、右叶往右 */
      g.translate(x + side * (leaf / 2 + slide), y);
      /* 石面 */
      g.beginPath();
      g.rect(-leaf / 2, -hh, leaf, hh);
      g.fillStyle = lin(g, -leaf / 2, -hh, leaf / 2, 0, [0, '#3c4a66', 0.45, '#323e58', 1, '#242e44']);
      g.fill();

      /* 错缝石块：横四行，每行错开半块 */
      g.strokeStyle = 'rgba(14,20,32,.42)';
      g.lineWidth = 1.1;
      var rows = 5;
      for (var i = 1; i < rows; i++) {
        var yy = -hh + (hh / rows) * i;
        g.beginPath(); g.moveTo(-leaf / 2, yy); g.lineTo(leaf / 2, yy); g.stroke();
      }
      for (var j = 0; j < rows; j++) {
        var yy0 = -hh + (hh / rows) * j;
        var off = (j % 2) ? leaf * 0.16 : -leaf * 0.16;
        g.beginPath();
        g.moveTo(off, yy0);
        g.lineTo(off, yy0 + hh / rows);
        g.stroke();
      }
      /* 石面上的高光边（左上受光） */
      g.strokeStyle = 'rgba(150,176,206,.16)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(-leaf / 2 + 1, 0);
      g.lineTo(-leaf / 2 + 1, -hh);
      g.stroke();

      /* 阴刻星纹：很浅，只在光里能看见 */
      g.save();
      g.translate(0, -hh * 0.52);
      starPath(g, 0, 0, leaf * 0.26, 0);
      g.strokeStyle = 'rgba(120,180,230,' + (0.14 * (1 - open)).toFixed(3) + ')';
      g.lineWidth = 1.4;
      g.stroke();
      g.restore();

      /* 三处小符文刻痕 */
      for (var r2 = 0; r2 < 3; r2++) {
        var ry = -hh * (0.18 + r2 * 0.22);
        var lit = (1 - open) * (0.18 + 0.10 * Math.sin((ts || 0) / 900 + r2 + side));
        g.fillStyle = 'rgba(130,205,245,' + lit.toFixed(3) + ')';
        g.fillRect(-leaf * 0.10, ry, leaf * 0.20, 2);
      }

      /* 顶部积雪 */
      g.fillStyle = 'rgba(238,248,255,.92)';
      g.fillRect(-leaf / 2, -hh - 3, leaf, 4);
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.fillRect(-leaf / 2, -hh + 1, leaf, 1.4);
      g.restore();
    }
    one(-1); one(1);
    g.restore();

    /* 门缝：关着的时候是一道暗线，打开过程中变成一道光 */
    if (open < 0.98) {
      var seamA = (1 - open) * 0.5;
      g.beginPath();
      g.rect(x - 1 - seamA, y - hh, 2 + seamA * 2, hh);
      g.fillStyle = open > 0.02
        ? 'rgba(150,230,255,' + (0.18 + open * 0.5).toFixed(3) + ')'
        : 'rgba(16,22,34,.55)';
      g.fill();
    }
  }

  /* 星钥：开门口浮在门前，捡走之前一直在转 */
  function drawKey(g, x, y, ts) {
    var bob = Math.sin(ts / 620) * 4;
    g.save();
    g.translate(x, y + bob);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.beginPath();
    g.ellipse(0, 0, 34, 34, 0, 0, 7);
    g.fillStyle = rad(g, 0, 0, 34, [0, 'rgba(140,225,255,.34)', 1, 'rgba(120,200,255,0)']);
    g.fill();
    g.restore();
    g.rotate(Math.sin(ts / 1400) * 0.28);
    /* 钥匙本体：环 + 杆 + 齿，中心嵌一颗星 */
    g.strokeStyle = '#c9a45c';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(0, -12, 9, 0, 7);
    g.stroke();
    g.strokeStyle = '#8ce1ff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, -12, 9, 0, 7);
    g.stroke();
    g.fillStyle = '#c9a45c';
    g.fillRect(-2.4, -4, 4.8, 24);
    g.fillRect(2.4, 12, 8, 3.4);
    g.fillRect(2.4, 18, 6, 3.4);
    /* 环里的小星星 */
    starPath(g, 0, -12, 5, ts / 900);
    g.fillStyle = '#eafcff';
    g.fill();
    g.restore();
  }

  /* ============================================================
   * 对外：一张标准的 TravelMaps 地图对象
   * ============================================================ */
  var MAP = {
    id: 'north',
    name: '被遗忘的北境',
    sub: 'THE FORGOTTEN NORTH',
    card: '小镇之外的雪原。有人在这里点过篝火，然后被时间忘了。',
    arrive: '❄️ 雪把声音都吞了。远处有一点蓝光。',
    line: '风从很远的地方吹过来，带着冰的味道。',
    w: W, h: H,
    secret: true,          // 不进车站列表、不发车票
    noTicket: true,        // 进这张图不看车票
    zoom: 0.95,
    walk: WALK,
    spawn: SPAWN,
    exitPos: PORTAL_IN,
    exitLabel: '🌀 回到小镇',
    view: {
      x: LAKE.x, y: LAKE.y + 96, r: 104, label: '🌌 一起看冰湖',
      lines: [
        '你们在湖边站定。冰面把整片天都收进去了，连极光的褶子都看得清。',
        '脚下的冰发出很轻的一声，像是翻了个身。',
        '「这里好像……本来就该有我们两个人。」'
      ]
    },
    paint: paint,
    anim: anim,
    obstacles: obstacles,
    regions: REGIONS,
    portalIn: PORTAL_IN,
    ruins: RUINS,
    lake: LAKE,
    drawPortal: drawPortal,
    /* v4.10 寻宝 */
    digs: DIGS,
    sled: SLED,
    letter: LETTER,
    chest: CHEST,
    drawPit: drawPit,
    drawChest: drawChest,
    drawIcon: drawIcon,
    /* v5.0 */
    gate: GATE,
    drawPad: drawPad,
    drawBeam: drawBeam,
    drawGateDoor: drawGateDoor,
    drawKey: drawKey,
    starPath: starPath
  };

  return MAP;
})();
