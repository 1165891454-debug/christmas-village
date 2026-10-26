/* chars.js — 高分辨率矢量角色（圣诞绘本风）
 *
 * 设计目标：
 *   1. 不再用 fillRect 拼色块，改用路径 / 贝塞尔 / 渐变绘制有轮廓、有体积的人物；
 *   2. 逻辑坐标里人物高 100 单位（脚底 y=100），烘焙时按显示尺寸 ×3 超采样，
 *      运行时用 drawImage 缩放，等于一张「矢量烘焙的精灵图集」；
 *   3. 与建筑一致：统一暖深棕描边 #4a3020，画面语言统一；
 *   4. 4 方向 × 4 帧行走 + 挥手，全部离线烘焙后缓存，运行时不重复画路径。
 *
 * 对外只暴露 Sprites 需要的东西：scale / box / draw / warm / drawPreview。
 */
window.Chars = (function () {
  'use strict';

  var OUT = '#4a3020';
  var BOX = { x: -34, y: -18, w: 68, h: 120 };  // 脚底 = 逻辑 y 100
  var SS = 3;                                   // 烘焙超采样倍数
  var SCALE = { m: 0.66, f: 0.645 };            // 逻辑单位 → 屏幕像素
  var cache = {};

  /* ---------------- 调色板 ---------------- */
  var PAL = {
    m: {
      skin: '#f4cba6', skinMid: '#eab894', skinShade: '#d99f79', skinHi: '#ffe4c8',
      hair: '#2c221c', hairMid: '#3f3128', hairHi: '#5a4436',
      coat: '#3d5c82', coatMid: '#33506f', coatDark: '#26405a', coatHi: '#5a7fa8',
      trim: '#efe3ca', trimDark: '#d6c3a1',
      pants: '#3c4759', pantsDark: '#2c3543',
      boot: '#5c3d29', bootDark: '#412a1b',
      scarf: '#ecdfc4', scarfDark: '#cfb997',
      glove: '#b8402f', accent: '#c0392b',
      eye: '#3a2a20', blush: 'rgba(228,132,120,.34)'
    },
    f: {
      skin: '#fbd6b7', skinMid: '#f2c19f', skinShade: '#dfa482', skinHi: '#fff0dc',
      hair: '#4b3225', hairMid: '#5e3f2c', hairHi: '#7d5738', hairTop: '#9a6f48', hairDark: '#38231a',
      coat: '#c66470', coatMid: '#b2535f', coatDark: '#96414e', coatHi: '#e08b93',
      trim: '#f8efdf', trimDark: '#e0cfb4',
      pants: '#6f4b53', pantsDark: '#57383f',
      boot: '#6d4b30', bootDark: '#4a3120',
      scarf: '#f8efdf', scarfDark: '#ddc9ac',
      beanie: '#f9f2e4', beanieMid: '#eddfc7', beanieDark: '#d8c4a4',
      glove: '#f8efdf', accent: '#c0392b',
      eye: '#46301f', blush: 'rgba(236,140,136,.46)'
    }
  };

  /* ---------------- 基础画笔 ---------------- */
  function lg(ctx, x0, y0, x1, y1, stops) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function rg(ctx, x, y, r0, r1, stops) {
    var g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function paint(ctx, fill, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (lw !== 0) {
      ctx.strokeStyle = OUT;
      ctx.lineWidth = lw == null ? 2 : lw;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }
  function ell(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  /* ---------------- 腿与靴 ---------------- */
  function leg(ctx, x, top, w, h, P) {
    rr(ctx, x - w / 2, top, w, h, w * 0.45);
    paint(ctx, lg(ctx, x - w / 2, top, x + w / 2, top, [0, P.pantsDark, 0.55, P.pants, 1, P.pantsDark]), 1.6);
  }

  function boot(ctx, cx, top, w, toeDir, P) {
    // 靴筒
    rr(ctx, cx - w / 2, top, w, 7.4, 1.8);
    paint(ctx, lg(ctx, cx - w / 2, top, cx + w / 2, top + 7.4,
      [0, P.bootDark, 0.35, P.boot, 1, P.bootDark]), 1.7);
    // 鞋底 + 鞋头
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 - 0.4, top + 5.4);
    ctx.lineTo(cx + w / 2 + 0.4, top + 5.4);
    ctx.quadraticCurveTo(cx + w / 2 + 0.4 + toeDir * 2.6, top + 8.6, cx + toeDir * (w / 2 + 1.6), top + 9.2);
    ctx.quadraticCurveTo(cx - w / 2 - 1.2, top + 9.4, cx - w / 2 - 0.4, top + 5.4);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, top + 5, 0, top + 9.4, [0, P.boot, 0.7, P.bootDark]), 1.6);
    // 靴口绒毛
    rr(ctx, cx - w / 2 - 0.7, top - 1.6, w + 1.4, 3.2, 1.6);
    paint(ctx, lg(ctx, 0, top - 1.6, 0, top + 1.6, [0, '#fffaf0', 1, P.trimDark]), 1.4);
  }

  /* 圆头「胶囊」肢体：先描边再填色，得到干净的袖管/裤管 */
  function limb(ctx, x0, y0, cx, cy, x1, y1, w, fill, lw) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = w + (lw == null ? 1.6 : lw) * 1.6;
    ctx.stroke();
    ctx.strokeStyle = fill;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- 头部共用 ---------------- */
  function headShape(ctx, ry, rx) {
    ctx.beginPath();
    ctx.moveTo(-rx, 24);
    ctx.bezierCurveTo(-rx, 14.5, -rx * 0.62, 10, 0, 10);
    ctx.bezierCurveTo(rx * 0.62, 10, rx, 14.5, rx, 24);
    ctx.bezierCurveTo(rx, 34, rx * 0.58, 43, 0, 43.4);
    ctx.bezierCurveTo(-rx * 0.58, 43, -rx, 34, -rx, 24);
    ctx.closePath();
  }

  function eyesGirl(ctx, dir, P) {
    var pos = dir === 0 ? [-6.4, 6.4] : [dir === 2 ? -5.4 : 5.4];
    for (var i = 0; i < pos.length; i++) {
      var ex = pos[i];
      if (dir !== 0 && i === 1) break;
      // 眼白
      ell(ctx, ex, 27.4, 3.25, 3.75); paint(ctx, '#fffdf8', 0);
      // 虹膜
      ell(ctx, ex, 27.9, 2.55, 3.1);
      paint(ctx, lg(ctx, ex, 25, ex, 31, [0, '#6d4a30', 0.55, P.eye, 1, '#2c1d13']), 0);
      // 瞳孔
      ell(ctx, ex, 28, 1.15, 1.6); ctx.fillStyle = '#241610'; ctx.fill();
      // 高光
      ell(ctx, ex - 0.85, 26.5, 0.95, 1.15); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill();
      ell(ctx, ex + 1.0, 29.6, 0.5, 0.6); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
      // 上睫毛
      ctx.beginPath();
      ctx.moveTo(ex - 3.3, 25.9);
      ctx.quadraticCurveTo(ex, 23.9, ex + 3.3, 25.9);
      ctx.strokeStyle = '#3a2318'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.stroke();
      // 外眼角小勾
      var s = ex < 0 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(ex + s * 3.0, 25.6);
      ctx.quadraticCurveTo(ex + s * 4.2, 25.2, ex + s * 4.4, 24.1);
      ctx.lineWidth = 1.2; ctx.stroke();
      // 下眼睑
      ctx.beginPath();
      ctx.moveTo(ex - 2.2, 30.6);
      ctx.quadraticCurveTo(ex, 31.6, ex + 2.2, 30.6);
      ctx.strokeStyle = 'rgba(120,80,60,.55)'; ctx.lineWidth = 0.9; ctx.stroke();
      // 眉
      ctx.beginPath();
      ctx.moveTo(ex - 2.8, 21.0);
      ctx.quadraticCurveTo(ex, 19.7, ex + 2.8, 21.1);
      ctx.strokeStyle = P.hairMid; ctx.lineWidth = 1.15; ctx.stroke();
    }
  }

  function eyesBoy(ctx, dir, P, glasses) {
    var pos = dir === 0 ? [-6.2, 6.2] : [dir === 2 ? -3.2 : 3.2];
    for (var i = 0; i < pos.length; i++) {
      var ex = pos[i];
      if (dir !== 0 && i === 1) break;
      ell(ctx, ex, 27.2, 2.7, 3.0); paint(ctx, '#fffdf6', 0);
      ell(ctx, ex, 27.6, 1.95, 2.5);
      paint(ctx, lg(ctx, ex, 25, ex, 30.4, [0, '#6a4a32', 0.7, P.eye, 1, '#241811']), 0);
      ell(ctx, ex, 27.8, 1.0, 1.4); ctx.fillStyle = '#1d130d'; ctx.fill();
      ell(ctx, ex - 0.7, 26.3, 0.8, 0.95); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ex - 2.8, 25.6);
      ctx.quadraticCurveTo(ex, 24.0, ex + 2.8, 25.6);
      ctx.strokeStyle = '#33241a'; ctx.lineWidth = 1.35; ctx.lineCap = 'round'; ctx.stroke();
      // 眉（更平直，男生感）
      ctx.beginPath();
      ctx.moveTo(ex - 3.1, 21.6);
      ctx.quadraticCurveTo(ex, 20.4, ex + 3.1, 21.8);
      ctx.strokeStyle = P.hairMid; ctx.lineWidth = 1.7; ctx.stroke();
    }
    if (glasses) {
      // 镜框 + 镜片反光：侧视只画朝向侧那一只镜片（原来两只都画，
      // 在侧面会读成正面脸，和「转身」完全矛盾）
      var lenses = dir === 0 ? [-6.2, 6.2] : [dir === 2 ? -3.6 : 3.6];
      lenses.forEach(function (ex) {
        rr(ctx, ex - 3.9, 24.1, 7.8, 6.6, 2.0);
        paint(ctx, 'rgba(196,222,235,.20)', 2.2);
        ctx.beginPath();
        ctx.moveTo(ex - 3.1, 27.2);
        ctx.lineTo(ex + 2.4, 24.9);
        ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.lineWidth = 1.1; ctx.stroke();
      });
      if (dir === 0) {
        ctx.beginPath();
        ctx.moveTo(-2.4, 27.0); ctx.quadraticCurveTo(0, 25.8, 2.4, 27.0);
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-10.1, 26.4); ctx.lineTo(-13.6, 25.4);
        ctx.moveTo(10.1, 26.4); ctx.lineTo(13.6, 25.4);
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke();
      } else {
        // 侧视：一根镜腿沿脸侧向后
        var gs = dir === 2 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(gs * 7.2, 26.2);
        ctx.lineTo(gs * 11.0, 25.0);
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
  }

  function blush(ctx, dir, P) {
    if (dir === 0) {
      [[-8.6, 33.2], [8.6, 33.2]].forEach(function (p) {
        ell(ctx, p[0], p[1], 3.5, 2.2);
        ctx.fillStyle = rg(ctx, p[0], p[1], 0.2, 3.6, [0, P.blush, 1, 'rgba(236,140,136,0)']);
        ctx.fill();
      });
    } else {
      var bx = dir === 2 ? -7.4 : 8.6;
      ell(ctx, bx, 33.0, 3.0, 2.0);
      ctx.fillStyle = rg(ctx, bx, 33.0, 0.2, 3.2, [0, P.blush, 1, 'rgba(236,140,136,0)']);
      ctx.fill();
    }
  }

  function noseMouth(ctx, dir, P) {
    if (dir === 0) {
      // 鼻子：极简一点 + 淡影
      ctx.beginPath();
      ctx.moveTo(0.4, 30.4);
      ctx.quadraticCurveTo(-0.2, 32.0, -1.5, 32.2);
      ctx.strokeStyle = 'rgba(178,120,92,.75)'; ctx.lineWidth = 0.9; ctx.stroke();
      // 微笑（上唇线 + 下唇肉感 + 高光）
      ctx.beginPath();
      ctx.moveTo(-3.4, 34.4);
      ctx.quadraticCurveTo(0, 37.4, 3.4, 34.4);
      ctx.quadraticCurveTo(0, 38.6, -3.4, 34.4);
      ctx.closePath();
      paint(ctx, '#bf6266', 0);
      ctx.beginPath();
      ctx.moveTo(-2.9, 34.5);
      ctx.quadraticCurveTo(0, 37.1, 2.9, 34.5);
      ctx.strokeStyle = '#8f4348'; ctx.lineWidth = 0.85; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-1.6, 36.4);
      ctx.quadraticCurveTo(0, 37.3, 1.6, 36.4);
      ctx.strokeStyle = 'rgba(255,222,214,.65)'; ctx.lineWidth = 0.7; ctx.stroke();
    } else {
      var sd = dir === 2 ? -1 : 1;
      // 侧脸鼻梁 + 鼻尖（真实凸出轮廓）
      ctx.beginPath();
      ctx.moveTo(sd * 11.4, 25.4);
      ctx.bezierCurveTo(sd * 14.6, 26.4, sd * 15.2, 29.4, sd * 13.0, 30.6);
      ctx.quadraticCurveTo(sd * 12.4, 31.2, sd * 11.6, 31.0);
      ctx.closePath();
      paint(ctx, lg(ctx, 0, 25, 0, 31, [0, '#ffe6cd', 1, '#f3c19d']), 1.8);
      // 嘴
      ctx.beginPath();
      ctx.moveTo(sd * 7.0, 34.8);
      ctx.quadraticCurveTo(sd * 9.2, 36.0, sd * 11.0, 34.6);
      ctx.strokeStyle = '#b55a58';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // 下唇一点高光
      ctx.beginPath();
      ctx.moveTo(sd * 8.4, 35.6);
      ctx.quadraticCurveTo(sd * 9.6, 36.0, sd * 10.4, 35.4);
      ctx.strokeStyle = 'rgba(255,222,214,.6)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  }

  /* ---------------- 女生 ---------------- */
  /* Julie 头脸几何（v3.4 修正「胡子/长脸」）
     1. 下颌明显收窄：下巴 40.0 → 37.8，脸高 30 → 27.8，纵横比 1.16 → 1.08；
     2. 去掉下巴上那块偏棕的宽投影、以及横穿下巴的「颈侧发影」——这两处叠在
        嘴下方，在游戏尺寸下就是一圈胡渣；下半脸渐变也改为只在最边缘收暗；
     3. 五官随之下移/上提重排，嘴到下巴只留 2 单位，脸不再拖长。 */
  var F_TOP = 10, F_WY = 24, F_CHIN = 37.8, F_RX = 12.9;

  /* 正面头形（背面共用，会被头发覆盖） */
  function girlHeadFront(ctx) {
    ctx.beginPath();
    ctx.moveTo(-F_RX, F_WY);
    ctx.bezierCurveTo(-F_RX, 14.5, -F_RX * 0.62, F_TOP, 0, F_TOP);
    ctx.bezierCurveTo(F_RX * 0.62, F_TOP, F_RX, 14.5, F_RX, F_WY);
    ctx.bezierCurveTo(F_RX, 31.2, F_RX * 0.74, 36.6, 0, F_CHIN);
    ctx.bezierCurveTo(-F_RX * 0.74, 36.6, -F_RX, 31.2, -F_RX, F_WY);
    ctx.closePath();
  }

  /* 朝右的斜侧面头形（朝左时整体镜像）——沿用已验收的 v3.2 造型，
     只把下巴整体上移 2.2（与正面同一条下巴线），避免侧正面的脸长不一致。 */
  function girlHeadSide(ctx) {
    ctx.beginPath();
    ctx.moveTo(-11.4, F_WY);
    ctx.bezierCurveTo(-11.4, 14.6, -7.0, F_TOP, -0.2, F_TOP);
    ctx.bezierCurveTo(6.6, F_TOP, 12.4, 15.0, 13.1, 24.2);
    ctx.bezierCurveTo(13.5, 26.2, 13.4, 27.8, 14.2, 28.9);   // 眉骨 → 鼻梁
    ctx.bezierCurveTo(15.6, 29.9, 15.3, 31.5, 13.4, 31.3);   // 鼻尖（最前点）→ 鼻底
    ctx.bezierCurveTo(12.7, 32.4, 12.4, 33.3, 11.9, 34.2);   // 人中 → 下唇
    ctx.bezierCurveTo(11.0, 35.8, 6.4, 37.6, 1.2, F_CHIN);   // 下巴
    ctx.bezierCurveTo(-4.2, 37.6, -8.6, 31.4, -11.4, F_WY);  // 下颌 → 后缘
    ctx.closePath();
  }

  function girlHeadOutline(ctx, dir) {
    ctx.beginPath();
    if (dir === 2 || dir === 3) {
      ctx.save();
      ctx.scale(dir === 2 ? -1 : 1, 1);
      girlHeadSide(ctx);
      ctx.restore();
      // save/restore 之后 path 仍在当前路径中，坐标已按镜像写入
      return;
    }
    girlHeadFront(ctx);
  }

  /* 单只眼睛：opt.squash 让虹膜略扁（远侧眼），opt.dim 降低对比 */
  function girlEye(ctx, cx, cy, rx, ry, P, opt) {
    opt = opt || {};
    var k = opt.k == null ? 1 : opt.k;
    // 眼白
    ell(ctx, cx, cy, rx, ry); paint(ctx, '#fffdf8', 0);
    // 虹膜
    ell(ctx, cx, cy + 0.5, rx * 0.78 * k, ry * 0.82);
    paint(ctx, lg(ctx, cx, cy - 2.4, cx, cy + 3.6,
      [0, '#6d4a30', 0.55, P.eye, 1, '#2c1d13']), 0);
    // 瞳孔
    ell(ctx, cx, cy + 0.6, rx * 0.36, ry * 0.42);
    ctx.fillStyle = '#241610'; ctx.fill();
    // 高光（远侧眼更小更弱）
    ell(ctx, cx - rx * 0.28, cy - 0.9, opt.dim ? 0.62 : 0.95, opt.dim ? 0.8 : 1.15);
    ctx.fillStyle = opt.dim ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.95)';
    ctx.fill();
    if (!opt.dim) {
      ell(ctx, cx + rx * 0.32, cy + 2.2, 0.5, 0.6);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
    }
    // 上睫毛
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy - 1.5);
    ctx.quadraticCurveTo(cx, cy - 3.6, cx + rx, cy - 1.5);
    ctx.strokeStyle = opt.dim ? '#4a3325' : '#3a2318';
    ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.stroke();
    // 外眼角小勾（朝向侧；远侧眼不画，避免与鬓角连成一片）
    if (!opt.dim) {
      var s = opt.outer || 1;
      ctx.beginPath();
      ctx.moveTo(cx + s * (rx - 0.3), cy - 1.9);
      ctx.quadraticCurveTo(cx + s * (rx + 0.9), cy - 2.3, cx + s * (rx + 1.0), cy - 3.3);
      ctx.lineWidth = 1.2; ctx.stroke();
    }
    // 下眼睑
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.68, cy + 3.1);
    ctx.quadraticCurveTo(cx, cy + 4.1, cx + rx * 0.68, cy + 3.1);
    ctx.strokeStyle = 'rgba(120,80,60,.55)'; ctx.lineWidth = 0.9; ctx.stroke();
    // 眉（可单独控制长度，避免与鬓角粘连）
    var bw = (opt.browW || 0.85) * rx;
    ctx.beginPath();
    ctx.moveTo(cx - bw, cy - 5.6);
    ctx.quadraticCurveTo(cx, cy - 6.9, cx + bw, cy - 5.5);
    ctx.strokeStyle = P.hairMid;
    ctx.lineWidth = opt.dim ? 1.0 : 1.15;
    ctx.stroke();
  }

  /* 正面五官 */
  function girlFaceFront(ctx, P) {
    var cy = 26.2;
    girlEye(ctx, -6.3, cy, 3.2, 3.7, P, { outer: -1 });
    girlEye(ctx, 6.3, cy, 3.2, 3.7, P, { outer: 1 });
    // 腮红
    [-8.8, 8.8].forEach(function (x) {
      ell(ctx, x, 30.6, 3.4, 2.1);
      ctx.fillStyle = rg(ctx, x, 30.6, 0.2, 3.5, [0, P.blush, 1, 'rgba(236,140,136,0)']);
      ctx.fill();
    });
    // 鼻子
    ctx.beginPath();
    ctx.moveTo(0.4, 28.8);
    ctx.quadraticCurveTo(-0.2, 30.3, -1.5, 30.5);
    ctx.strokeStyle = 'rgba(178,120,92,.75)'; ctx.lineWidth = 0.9; ctx.stroke();
    // 微笑：上唇线 + 唇肉 + 高光（整体上移，嘴与下巴之间留 2 单位）
    ctx.beginPath();
    ctx.moveTo(-3.4, 32.2);
    ctx.quadraticCurveTo(0, 35.0, 3.4, 32.2);
    ctx.quadraticCurveTo(0, 35.8, -3.4, 32.2);
    ctx.closePath();
    paint(ctx, '#bf6266', 0);
    ctx.beginPath();
    ctx.moveTo(-2.9, 32.3);
    ctx.quadraticCurveTo(0, 34.7, 2.9, 32.3);
    ctx.strokeStyle = '#8f4348'; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-1.6, 34.1);
    ctx.quadraticCurveTo(0, 35.0, 1.6, 34.1);
    ctx.strokeStyle = 'rgba(255,222,214,.65)'; ctx.lineWidth = 0.7; ctx.stroke();
    // 下巴不再叠棕影（原来那块宽投影在游戏尺寸下像胡渣），只保留下唇下方一点柔光
    ctx.beginPath();
    ctx.moveTo(-1.8, 36.2);
    ctx.quadraticCurveTo(0, 36.9, 1.8, 36.2);
    ctx.strokeStyle = 'rgba(255,236,220,.5)'; ctx.lineWidth = 0.8; ctx.stroke();
  }

  /* 朝右的斜侧面五官（朝左整体镜像）——沿用已验收的 v3.2 造型 */
  function girlFaceSide(ctx, P) {
    var cy = 26.4;
    // 远侧受光弱、略偏暗（加强转向感）
    ell(ctx, -8.0, 27.0, 5.6, 9.4);
    ctx.fillStyle = rg(ctx, -8.0, 27.0, 0.4, 6.4, [0, 'rgba(186,124,96,.22)', 1, 'rgba(186,124,96,0)']);
    ctx.fill();

    girlEye(ctx, 6.2, cy, 3.05, 3.7, P, { outer: 1, browW: 0.72 });                    // 近侧眼
    girlEye(ctx, -3.5, cy + 0.2, 2.15, 3.15, P, { outer: -1, dim: true, k: 0.94, browW: 0.78 }); // 远侧眼（被鼻梁收窄）
    // 远侧腮红淡、近侧腮红明显
    ell(ctx, -7.6, 31.0, 2.4, 1.6);
    ctx.fillStyle = rg(ctx, -7.6, 31.0, 0.2, 2.7, [0, 'rgba(236,140,136,.20)', 1, 'rgba(236,140,136,0)']);
    ctx.fill();
    ell(ctx, 8.0, 31.2, 2.9, 1.9);
    ctx.fillStyle = rg(ctx, 8.0, 31.2, 0.2, 3.1, [0, P.blush, 1, 'rgba(236,140,136,0)']);
    ctx.fill();
    // 鼻：鼻梁阴线 + 鼻底投影（轮廓凸起由头形负责）
    ctx.beginPath();
    ctx.moveTo(10.6, 27.4);
    ctx.quadraticCurveTo(12.2, 29.6, 11.4, 31.0);
    ctx.strokeStyle = 'rgba(178,120,92,.5)'; ctx.lineWidth = 0.9; ctx.stroke();
    ell(ctx, 12.0, 31.1, 1.15, 0.6);
    ctx.fillStyle = 'rgba(178,112,86,.5)'; ctx.fill();
    // 嘴（靠近脸前缘，短弧 + 下唇高光）
    ctx.beginPath();
    ctx.moveTo(3.5, 32.4);
    ctx.quadraticCurveTo(5.5, 33.7, 7.4, 32.0);
    ctx.strokeStyle = '#b55a58'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(4.4, 33.3);
    ctx.quadraticCurveTo(5.5, 33.8, 6.5, 33.0);
    ctx.strokeStyle = 'rgba(255,222,214,.6)'; ctx.lineWidth = 0.7; ctx.stroke();
  }

  /* 统一入口：按方向绘制，空白侧自动镜像 */
  function girlFace(ctx, dir, P) {
    if (dir === 0 || dir === 1) { girlFaceFront(ctx, P); return; }
    ctx.save();
    ctx.scale(dir === 2 ? -1 : 1, 1);
    girlFaceSide(ctx, P);
    ctx.restore();
  }

  function girlBackHair(ctx, dir, P) {
    // 垂在身后的长发主体（先画，被身体压住中段）
    if (dir === 1) {
      // 背视：整片头发盖住后脑，到腰部收成发梢
      ctx.beginPath();
      ctx.moveTo(-14, 12);
      ctx.bezierCurveTo(-17.4, 26, -17, 48, -15.6, 64);
      ctx.bezierCurveTo(-15, 70, -12.4, 71.6, -10.8, 68.6);
      ctx.bezierCurveTo(-9.4, 65.6, -9.6, 60, -8.8, 55);
      ctx.lineTo(-4.2, 68.4);
      ctx.lineTo(0, 57);
      ctx.lineTo(4.2, 68.4);
      ctx.lineTo(8.8, 55);
      ctx.bezierCurveTo(9.6, 60, 9.4, 65.6, 10.8, 68.6);
      ctx.bezierCurveTo(12.4, 71.6, 15, 70, 15.6, 64);
      ctx.bezierCurveTo(17, 48, 17.4, 26, 14, 12);
      ctx.closePath();
      paint(ctx, lg(ctx, 0, 12, 0, 71,
        [0, P.hairMid, 0.32, P.hair, 0.7, P.hairDark, 1, P.hair]), 2);
      // 发丝层次
      ctx.strokeStyle = 'rgba(154,111,72,.34)';
      ctx.lineWidth = 0.9;
      [-8, -2.4, 3.6, 8.6].forEach(function (x) {
        ctx.beginPath();
        ctx.moveTo(x * 0.62, 17);
        ctx.quadraticCurveTo(x, 42, x * 1.32, 64);
        ctx.stroke();
      });
      return;
    }

    /* 正 / 侧：两束带波浪的长发，左右长度不同。
       外缘做 S 形起伏、发梢向内收，避免看起来像一整块窗帘。
       inX：发束内缘（斜侧面时近侧内缘后移，避免盖住脸颊与眼睛） */
    function curtain(side, len, inX) {
      var ix = inX == null ? 2.6 : inX;
      ctx.beginPath();
      ctx.moveTo(side * ix, 15.6);
      ctx.bezierCurveTo(side * 12.6, 13.6, side * 16.2, 22.0, side * 14.6, 30.4);
      ctx.bezierCurveTo(side * 12.8, 37.6, side * 16.8, 42.0, side * 14.4, 48.0);
      ctx.bezierCurveTo(side * 12.8, 52.6, side * 15.8, 55.4, side * 13.8, len);
      ctx.bezierCurveTo(side * 13.0, len + 3.0, side * 11.2, len + 1.6, side * 10.8, len - 1.6);
      ctx.bezierCurveTo(side * 11.6, len - 7.0, side * 10.2, len - 12.0, side * 9.8, len - 17.0);
      ctx.lineTo(side * ix, len - 17.0);
      ctx.closePath();
      paint(ctx, lg(ctx, side * 4, 16, side * 15, len,
        [0, P.hairMid, 0.26, P.hair, 0.66, P.hairDark, 1, P.hairMid]), 2);

      // 波浪高光（暗示卷度）
      ctx.strokeStyle = 'rgba(168,124,80,.42)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(side * 13.2, 24);
      ctx.bezierCurveTo(side * 12.2, 33, side * 14.8, 40, side * 13.6, 48);
      ctx.bezierCurveTo(side * 12.8, 54, side * 14.6, 58, side * 12.8, len - 4);
      ctx.stroke();
      // 内侧暗边，增加体积
      ctx.beginPath();
      ctx.moveTo(side * 11.4, 30);
      ctx.bezierCurveTo(side * 10.6, 40, side * 11.6, 50, side * 10.6, len - 8);
      ctx.strokeStyle = 'rgba(46,28,18,.28)';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      // 发梢分叉
      ctx.beginPath();
      ctx.moveTo(side * 11.4, len - 3.4);
      ctx.quadraticCurveTo(side * 9.6, len + 0.6, side * 8.8, len - 4.2);
      ctx.strokeStyle = 'rgba(46,28,18,.35)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    var sd0 = dir === 2 ? -1 : (dir === 3 ? 1 : 0);
    curtain(-1, 61.0, sd0 === -1 ? 9.0 : 2.6);
    curtain(1, 57.6, sd0 === 1 ? 9.0 : 2.6);

    // 中间发团（被身体遮住大半，只留下颈部两侧的体积）
    ctx.beginPath();
    ctx.moveTo(-13.0, 18);
    ctx.bezierCurveTo(-13.8, 28, -12.6, 38, -11.4, 46);
    ctx.lineTo(11.4, 46);
    ctx.bezierCurveTo(12.6, 38, 13.8, 28, 13.0, 18);
    ctx.quadraticCurveTo(0, 12.6, -13.0, 18);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, 13, 0, 46, [0, P.hairMid, 0.5, P.hair, 1, P.hairDark]), 2);
  }

  function girlFrontHair(ctx, dir, P) {
    // 刘海：三束带尖的弧线，方向随朝向左/右
    var shift = dir === 2 ? -1.4 : (dir === 3 ? 1.4 : 0);
    var sd = dir === 2 ? -1 : (dir === 3 ? 1 : 0);
    var sweep = sd * 1.1;               // 斜侧面时刘海整体向朝向偏移
    ctx.save();
    ctx.translate(sweep, 0);
    ctx.beginPath();
    ctx.moveTo(-13.6, 23.4);
    ctx.bezierCurveTo(-13.8, 13.0, -7.2, 8.4, 0, 8.6);
    ctx.bezierCurveTo(7.6, 8.8, 13.8, 12.8, 13.6, 23.4);
    ctx.bezierCurveTo(11.8, 18.4, 9.0, 16.4, 5.4, 15.8);
    ctx.bezierCurveTo(2.6, 20.2, -1.4, 22.0, -5.4, 21.2);
    ctx.bezierCurveTo(-8.8, 20.6, -11.4, 19.0, -13.6, 23.4);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, 8, 0, 22, [0, P.hairTop, 0.45, P.hair, 1, P.hairMid]), 1.9);

    // 刘海分区线（偏分）
    ctx.strokeStyle = 'rgba(56,35,26,.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-0.8 + shift, 10.6);
    ctx.quadraticCurveTo(-2.0, 15.8, -4.2, 20.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6.2 + shift, 10.8);
    ctx.quadraticCurveTo(7.0, 15.0, 8.8, 18.2);
    ctx.stroke();
    // 刘海高光
    ctx.beginPath();
    ctx.moveTo(-6.0, 14.0);
    ctx.quadraticCurveTo(0.6, 11.2, 7.2, 13.2);
    ctx.strokeStyle = 'rgba(196,150,100,.42)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();

    // 两侧长发（贴脸，末端收尖）；斜侧面时近侧发束外移，避免压住眼睛
    // v3.4：内缘收到脸缘以外（≥11.4），不再盖住脸颊——原来内缘压到 10.3，
    //       两侧深色发丝正好框住下颌，在游戏尺寸下就是「络腮胡」的错觉。
    [-1, 1].forEach(function (s) {
      var near = sd !== 0 && s === sd;
      ctx.save();
      if (near) ctx.translate(s * 2.4, 0);
      
      ctx.beginPath();
      ctx.moveTo(s * 12.2, 14.4);
      ctx.bezierCurveTo(s * 14.8, 23, s * 14.4, 36, s * 13.2, 46.6);
      ctx.bezierCurveTo(s * 12.6, 49.4, s * 11.8, 49.0, s * 11.6, 46.4);
      ctx.bezierCurveTo(s * 12.6, 37, s * 12.4, 25, s * 11.4, 16.6);
      ctx.closePath();
      paint(ctx, lg(ctx, s * 14, 14, s * 12, 49,
        [0, P.hair, 0.55, P.hairMid, 1, P.hairDark]), 1.8);
      // 发丝亮线
      ctx.beginPath();
      ctx.moveTo(s * 12.9, 18);
      ctx.quadraticCurveTo(s * 13.6, 31, s * 12.9, 44);
      ctx.strokeStyle = 'rgba(160,116,74,.5)';
      ctx.lineWidth = 1.0;
      ctx.stroke();
      ctx.restore();
    });
  }

  function beanie(ctx, dir, P) {
    // 折边
    ctx.beginPath();
    ctx.moveTo(-14.8, 14.4);
    ctx.bezierCurveTo(-14.8, 10.4, -8, 8.6, 0, 8.6);
    ctx.bezierCurveTo(8, 8.6, 14.8, 10.4, 14.8, 14.4);
    ctx.lineTo(14.4, 17.6);
    ctx.bezierCurveTo(8, 15.4, -8, 15.4, -14.4, 17.6);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, 8, 0, 17.6, [0, '#fffdf6', 0.55, P.beanie, 1, P.beanieMid]), 1.7);
    // 折边罗纹
    ctx.strokeStyle = 'rgba(200,176,142,.55)';
    ctx.lineWidth = 0.7;
    for (var i = -12; i <= 12; i += 3) {
      ctx.beginPath();
      ctx.moveTo(i, 10.6 + Math.abs(i) * 0.12);
      ctx.lineTo(i, 16.4);
      ctx.stroke();
    }
    // 帽体
    ctx.beginPath();
    ctx.moveTo(-14.4, 15.4);
    ctx.bezierCurveTo(-13.6, 4.6, -7.4, -1.0, 0, -1.0);
    ctx.bezierCurveTo(7.4, -1.0, 13.6, 4.6, 14.4, 15.4);
    ctx.bezierCurveTo(7.6, 12.4, -7.6, 12.4, -14.4, 15.4);
    ctx.closePath();
    paint(ctx, lg(ctx, -10, 0, 10, 14,
      [0, '#fffdf7', 0.45, P.beanie, 1, P.beanieMid]), 1.8);
    // 针织纹理
    ctx.strokeStyle = 'rgba(206,184,152,.5)';
    ctx.lineWidth = 0.6;
    for (var k = -9; k <= 9; k += 4.5) {
      ctx.beginPath();
      ctx.moveTo(k, 4.6);
      ctx.quadraticCurveTo(k * 1.16, 8.4, k * 1.05, 12.2);
      ctx.stroke();
    }
    // 绒球（贴着帽顶，不要悬空）
    ell(ctx, 0, -4.6, 5.1, 4.7);
    paint(ctx, lg(ctx, -3, -9, 3, 1, [0, '#fffdf7', 0.6, P.beanie, 1, P.beanieMid]), 1.7);
    ell(ctx, -1.7, -6.4, 1.9, 1.5);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
    // 绒球底部投影
    ctx.beginPath();
    ctx.moveTo(-4.2, -0.2);
    ctx.quadraticCurveTo(0, 1.4, 4.2, -0.2);
    ctx.strokeStyle = 'rgba(170,142,110,.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 帽影落在额头
    ctx.beginPath();
    ctx.moveTo(-13.6, 16.2);
    ctx.quadraticCurveTo(0, 13.2, 13.6, 16.2);
    ctx.strokeStyle = 'rgba(140,110,80,.30)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  function girlScarf(ctx, P, f, back) {
    // 围巾主体（贴着脖子，不要做成围兜）
    ctx.beginPath();
    ctx.moveTo(-9.6, 44.6);
    ctx.quadraticCurveTo(0, 46.8, 9.6, 44.6);
    ctx.quadraticCurveTo(10.4, 49.4, 9.2, 51.4);
    ctx.quadraticCurveTo(0, 48.2, -9.2, 51.4);
    ctx.quadraticCurveTo(-10.4, 49.4, -9.6, 44.6);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, 44.0, 0, 51.8, [0, '#fffdf5', 0.55, P.scarf, 1, P.scarfDark]), 1.8);

    // 左侧垂下的围巾尾 + 流苏
    var fl = (f === 1 ? 0.9 : (f === 3 ? -0.9 : 0));
    ctx.beginPath();
    ctx.moveTo(-8.8, 48.4);
    ctx.bezierCurveTo(-11.2, 53.2, -11.4, 58.2, -10.4, 62.4 + fl);
    ctx.quadraticCurveTo(-8.6, 63.4, -6.8, 62.2 + fl);
    ctx.bezierCurveTo(-7.6, 57.8, -7.2, 53.2, -6.2, 49.4);
    ctx.closePath();
    paint(ctx, lg(ctx, -7, 48.8, -11, 62.8,
      [0, P.scarf, 0.7, P.scarf, 1, P.scarfDark]), 1.7);
    // 流苏
    ctx.strokeStyle = P.scarfDark;
    ctx.lineWidth = 0.9;
    for (var i = 0; i < 4; i++) {
      var fx = -10.2 + i * 1.2;
      ctx.beginPath();
      ctx.moveTo(fx, 62.2 + fl);
      ctx.lineTo(fx - 0.1, 64.8 + fl);
      ctx.stroke();
    }
    // 围巾织纹
    ctx.strokeStyle = 'rgba(196,172,138,.42)';
    ctx.lineWidth = 0.7;
    for (var j = -1; j <= 1; j++) {
      ctx.beginPath();
      ctx.moveTo(-7.6 + j * 2.8, 46.0);
      ctx.quadraticCurveTo(0, 44.8, 7.6 + j * 2.8, 46.2);
      ctx.stroke();
    }
    // 打结处（背面在颈后，不画到前面）
    if (!back) {
      ell(ctx, -7.2, 48.6, 2.2, 2.0, -0.3);
      paint(ctx, lg(ctx, -9, 46.8, -5, 50.8, [0, '#fffdf5', 1, P.scarf]), 1.4);
    }
  }

  /* 步态参数：4 帧循环 = 站立 / 左步 / 站立 / 右步。
     头、脸、躯干、腿、臂、起伏全部从这一组参数派生，同一帧内必然同步，
     不会再出现「脸在动、身体不动」。起伏只加在上身，脚始终踩在地上。 */
  function gait(f, dir) {
    var side = dir === 2 ? -1 : (dir === 3 ? 1 : 0);
    var ph = [0, 1, 0, -1][f] || 0;
    var wide = side ? 3.0 : 1.7;
    return {
      side: side, ph: ph,
      bob: ph ? -1.3 : 0,
      legL: ph * wide, legR: -ph * wide,
      liftL: ph > 0 ? (side ? 2.0 : 2.4) : 0, liftR: ph < 0 ? (side ? 2.0 : 2.4) : 0,
      armL: -ph * (side ? 3.2 : 2.2), armR: ph * (side ? 3.2 : 2.2)
    };
  }

  /* 垂下的手臂（袖管 + 袖口 + 手套）。dim = 侧视时被躯干挡住的远侧手 */
  function girlArm(ctx, sd, dx, P, dim, xs) {
    xs = xs || 1;
    var sx = sd * 8.8 * xs, sy = 46.6;
    var ex = sd * 12.6 * xs, ey = 64.6 + dx;
    limb(ctx, sx, sy, sd * 13.6 * xs, 55.0, ex, ey, 5.6, dim ? P.coatDark : P.coatMid, 1.7);
    // 肩部阴影，让手臂从大衣上分离出来
    ctx.beginPath();
    ctx.moveTo(sd * 8.4 * xs, 47.4);
    ctx.quadraticCurveTo(sd * 10.6 * xs, 50.6, sd * 10.4 * xs, 54.6);
    ctx.strokeStyle = dim ? 'rgba(96,44,54,.42)' : 'rgba(120,52,60,.35)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // 袖口绒
    ell(ctx, ex, ey + 0.8, 3.1, 2.2, sd * 0.15);
    paint(ctx, lg(ctx, 0, ey - 1.4, 0, ey + 3, [0, '#fffdf6', 1, P.trim]), 1.5);
    // 手套
    ell(ctx, ex, ey + 3.4, 3.3, 2.9, sd * 0.15);
    paint(ctx, lg(ctx, 0, ey + 0.8, 0, ey + 6.2, [0, '#fffdf7', 1, P.trimDark]), 1.5);
    ell(ctx, ex + sd * 1.6, ey + 2.0, 1.2, 1.5, sd * 0.5);
    paint(ctx, P.trim, 1.2);
  }

  /* 举起挥手的手臂：与垂下的手臂共用同一个肩点。
     画了它就不再画那一侧垂下的手 —— 保证同一时刻只有两只手。 */
  function girlArmUp(ctx, sd, wiggle, P, xs) {
    xs = xs || 1;
    var sx = sd * 8.8 * xs, sy = 46.8;
    var ex = sd * 15.8, ey = 32.6;
    var hx = sd * 15.2 + sd * (wiggle === 1 ? 0.8 : -0.6);
    var hy = 22.6 + (wiggle === 1 ? -1.2 : 0.9);
    limb(ctx, sx, sy, sd * 14.2, 39.6, ex, ey, 5.6, P.coatMid, 1.7);
    limb(ctx, ex, ey, hx + sd * 0.4, 29.4, hx, hy, 4.9, P.coat, 1.7);
    // 袖口 + 手套
    ell(ctx, hx, hy + 0.4, 3.0, 2.4, sd * 0.2);
    paint(ctx, lg(ctx, 0, hy - 1.2, 0, hy + 2.4, [0, '#fffdf6', 1, P.trim]), 1.5);
    ell(ctx, hx + sd * 0.3, hy - 3.0, 3.1, 3.0, sd * 0.15);
    paint(ctx, lg(ctx, 0, hy - 6, 0, hy, [0, '#fffdf7', 1, P.trimDark]), 1.5);
    ell(ctx, hx - sd * 1.5, hy - 1.6, 1.2, 1.5, sd * 0.5);
    paint(ctx, P.trim, 1.2);
  }

  function girl(ctx, dir, f, wavePhase) {
    var P = PAL.f;
    var G = gait(f, dir);
    var side = G.side, back = dir === 1;
    var narrow = side ? 0.76 : 1;     // 侧视：躯干明显收窄，读起来是「侧着身」
    var axs = side ? 0.66 : 1;        // 侧视时近侧手臂压到躯干前方（这是「转身」最强的读感）

    // ---- 腿 / 靴（不跟上身起伏，脚踩实）----
    var lx = -6.4 + G.legL, rx = 6.4 + G.legR;
    boot(ctx, lx, 90.6 - G.liftL, 8.4, side || -1, P);
    boot(ctx, rx, 90.6 - G.liftR, 8.4, side || 1, P);
    leg(ctx, lx, 71 - G.liftL, 7.2, 20.6, P);
    leg(ctx, rx, 71 - G.liftR, 7.2, 20.6, P);

    ctx.save();
    ctx.translate(0, G.bob);

    girlBackHair(ctx, dir, P);

    // 侧视只画近侧那只手（远侧被躯干完全挡住，画出来反而像正面）

    ctx.save();
    ctx.scale(narrow, 1);

    // ---- 裙摆 ----
    ctx.beginPath();
    ctx.moveTo(-10.2, 58.6);
    ctx.bezierCurveTo(-12.0, 67.4, -14.2, 73.4, -15.0, 77.4);
    ctx.quadraticCurveTo(0, 81.4, 15.0, 77.4);
    ctx.bezierCurveTo(14.2, 73.4, 12.0, 67.4, 10.2, 58.6);
    ctx.closePath();
    paint(ctx, lg(ctx, -14, 58, 14, 80,
      [0, P.coatHi, 0.22, P.coat, 0.72, P.coatMid, 1, P.coatDark]), 2);
    // 褶
    ctx.strokeStyle = 'rgba(120,52,60,.26)';
    ctx.lineWidth = 0.9;
    [-7.0, -2.4, 2.4, 7.0].forEach(function (x) {
      ctx.beginPath();
      ctx.moveTo(x * 0.60, 60);
      ctx.quadraticCurveTo(x * 0.92, 69, x * 1.34, 78.6);
      ctx.stroke();
    });
    // 裙摆绒边
    ctx.beginPath();
    ctx.moveTo(-14.8, 76.2);
    ctx.quadraticCurveTo(0, 80.4, 14.8, 76.2);
    ctx.strokeStyle = '#fffaf0';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150,110,90,.35)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-14.8, 77.8);
    ctx.quadraticCurveTo(0, 82.0, 14.8, 77.8);
    ctx.stroke();

    // ---- 大衣上身 ----
    ctx.beginPath();
    ctx.moveTo(-10.0, 46.4);
    ctx.bezierCurveTo(-12.6, 48.4, -12.2, 54.4, -11.0, 61.4);
    ctx.lineTo(11.0, 61.4);
    ctx.bezierCurveTo(12.2, 54.4, 12.6, 48.4, 10.0, 46.4);
    ctx.quadraticCurveTo(0, 43.6, -10.0, 46.4);
    ctx.closePath();
    paint(ctx, lg(ctx, -11, 45, 11, 62,
      [0, P.coatHi, 0.3, P.coat, 0.78, P.coatMid, 1, P.coatDark]), 2);

    if (!back) {
      // 门襟 + 扣子（背面不画，否则背影会出现一排扣子）
      ctx.beginPath();
      ctx.moveTo(0.6, 45.4);
      ctx.quadraticCurveTo(1.6, 53, 0.4, 61.0);
      ctx.strokeStyle = 'rgba(120,52,60,.45)';
      ctx.lineWidth = 1.0;
      ctx.stroke();
      [49.6, 54.6, 59.4].forEach(function (y) {
        ell(ctx, 4.6, y, 1.15, 1.15);
        paint(ctx, '#f5d98f', 1.1);
      });
    }
    // 腰带
    ctx.beginPath();
    ctx.moveTo(-11.6, 57.8);
    ctx.quadraticCurveTo(0, 56.2, 11.6, 57.8);
    ctx.lineTo(11.9, 61.0);
    ctx.quadraticCurveTo(0, 59.6, -11.9, 61.0);
    ctx.closePath();
    paint(ctx, P.coatDark, 1.6);
    if (!back) { ell(ctx, 0, 59.4, 2.2, 1.8); paint(ctx, '#f5d98f', 1.1); }

    if (back) {
      // 背面：后中缝
      ctx.beginPath();
      ctx.moveTo(0.2, 46.6);
      ctx.quadraticCurveTo(0.9, 54, 0.2, 61.0);
      ctx.strokeStyle = 'rgba(120,52,60,.35)';
      ctx.lineWidth = 1.0;
      ctx.stroke();
    } else {
      // 口袋
      [-7.4, 7.4].forEach(function (x) {
        ctx.beginPath();
        ctx.moveTo(x - 3.0, 54.6);
        ctx.quadraticCurveTo(x, 57.0, x + 3.0, 54.6);
        ctx.strokeStyle = 'rgba(120,52,60,.42)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      });
    }
    ctx.restore();

    // ---- 近侧 / 正面手臂 ----
    if (side) {
      if (wavePhase) girlArmUp(ctx, side, wavePhase, P);
      else girlArm(ctx, side, G.armR, P, false, axs);
    } else {
      if (wavePhase) {
        girlArm(ctx, -1, G.armL, P, false);          // 另一只手照常垂下
        girlArmUp(ctx, 1, wavePhase, P);             // 这一侧换成举手，不再叠一只手
      } else {
        girlArm(ctx, -1, G.armL, P, false);
        girlArm(ctx, 1, G.armR, P, false);
      }
    }

    girlScarf(ctx, P, f, back);

    // ---- 脖子 ----
    ctx.beginPath();
    ctx.moveTo(-3.4, 35.4);
    ctx.lineTo(3.4, 35.4);
    ctx.lineTo(3.9, 45.6);
    ctx.quadraticCurveTo(0, 47.4, -3.9, 45.6);
    ctx.closePath();
    paint(ctx, P.skinShade, 0);

    // ---- 头 ----
    girlHeadOutline(ctx, dir);
    paint(ctx, lg(ctx, 0, 10, 0, F_CHIN,
      [0, P.skin, 0.72, P.skinMid, 1, P.skinShade]), 2);
    // 左侧柔光
    ell(ctx, -5.6, 23.4, 7.2, 11.2);
    ctx.fillStyle = rg(ctx, -7.4, 21, 0.5, 8.8, [0, 'rgba(255,238,218,.55)', 1, 'rgba(255,238,218,0)']);
    ctx.fill();
    // 背面：整片头发盖住后脑与后背（否则会露出肤色/衣服）
    if (dir === 1) {
      ell(ctx, 0, 26.0, 13.6, 17.4);
      ctx.fillStyle = P.hair;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-13.8, 40.0);
      ctx.bezierCurveTo(-16.0, 52, -15.6, 60, -14.6, 65.0);
      ctx.bezierCurveTo(-14.0, 68.4, -11.6, 69.6, -10.2, 66.4);
      ctx.bezierCurveTo(-9.2, 63.8, -9.4, 58.0, -8.8, 54.0);
      ctx.lineTo(-5.0, 65.0);
      ctx.bezierCurveTo(-4.4, 67.8, -2.6, 67.8, -2.2, 65.0);
      ctx.lineTo(-1.4, 54.0);
      ctx.lineTo(3.8, 54.0);
      ctx.lineTo(4.4, 63.4);
      ctx.bezierCurveTo(4.8, 66.2, 6.6, 66.2, 7.0, 63.4);
      ctx.lineTo(9.6, 54.0);
      ctx.bezierCurveTo(10.2, 58.0, 10.0, 63.8, 11.2, 66.4);
      ctx.bezierCurveTo(12.6, 69.6, 15.0, 68.4, 15.6, 65.0);
      ctx.bezierCurveTo(16.4, 59, 15.6, 50, 13.8, 40.0);
      ctx.bezierCurveTo(10.4, 30.0, 6.8, 24.0, 0, 24.0);
      ctx.bezierCurveTo(-6.8, 24.0, -10.4, 30.0, -13.8, 40.0);
      ctx.closePath();
      paint(ctx, lg(ctx, 0, 12, 0, 68,
        [0, P.hairHi, 0.16, P.hairMid, 0.52, P.hair, 1, P.hairDark]), 2);
      // 背面发丝
      ctx.strokeStyle = 'rgba(160,116,74,.34)';
      ctx.lineWidth = 1.0;
      [-9.6, -4.4, 0.6, 5.6, 10.2].forEach(function (x) {
        ctx.beginPath();
        ctx.moveTo(x * 0.5, 26);
        ctx.bezierCurveTo(x * 0.86, 38, x * 1.0, 50, x * 0.92, 61);
        ctx.stroke();
      });
      // 头顶柔光
      ell(ctx, 0, 24.0, 9.6, 6.6);
      ctx.fillStyle = rg(ctx, 0, 22.0, 0.6, 9.4, [0, 'rgba(168,124,80,.30)', 1, 'rgba(168,124,80,0)']);
      ctx.fill();
      // 头顶轮廓（帽子会压在上面）
      ctx.beginPath();
      ctx.moveTo(-12.6, 26);
      ctx.quadraticCurveTo(0, 18.0, 12.6, 26);
      ctx.strokeStyle = 'rgba(40,24,16,.25)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // 耳朵：正面两侧；斜侧面只露远侧一只（被侧发半掩）
    if (dir === 0) {
      [-1, 1].forEach(function (s) {
        ell(ctx, s * 13.4, 27.6, 2.0, 2.7);
        paint(ctx, P.skinMid, 1.4);
      });
    } else if (dir !== 1) {
      var esd = dir === 2 ? -1 : 1;
      ell(ctx, -esd * 12.3, 27.8, 1.9, 2.6);
      paint(ctx, P.skinMid, 1.4);
    }

    if (dir !== 1) girlFace(ctx, dir, P);

    if (dir !== 1) girlFrontHair(ctx, dir, P);
    beanie(ctx, dir, P);

    ctx.restore();
  }

  /* ---------------- 男生 ---------------- */
  function boyHair(ctx, dir, P) {
    if (dir === 1) {
      // 背视：整颗头都是头发（否则背面会露出一张没有五官的脸）
      ell(ctx, 0, 26.2, 13.2, 17.4);
      paint(ctx, lg(ctx, 0, 9, 0, 43.6, [0, P.hairHi, 0.3, P.hair, 1, '#241a14']), 1.9);
      ctx.beginPath();
      ctx.moveTo(0, 13.4);
      ctx.quadraticCurveTo(6.6, 16.6, 8.8, 24.4);
      ctx.moveTo(0, 13.4);
      ctx.quadraticCurveTo(-6.6, 16.6, -8.8, 24.4);
      ctx.strokeStyle = 'rgba(90,68,54,.45)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      return;
    }
    // 后脑短发
    ctx.beginPath();
    ctx.moveTo(-13.2, 24.4);
    ctx.bezierCurveTo(-13.2, 13.4, -7.2, 9.2, 0, 9.2);
    ctx.bezierCurveTo(7.2, 9.2, 13.2, 13.4, 13.2, 24.4);
    ctx.bezierCurveTo(13.2, 27.6, 12.8, 29.6, 12.4, 30.4);
    ctx.bezierCurveTo(11.4, 24.4, 10.0, 20.6, 8.4, 18.6);
    ctx.bezierCurveTo(4.6, 20.4, -1.4, 21.2, -6.2, 19.4);
    ctx.bezierCurveTo(-8.6, 21.4, -10.4, 25.4, -11.6, 30.4);
    ctx.bezierCurveTo(-12.6, 29.4, -13.2, 27.2, -13.2, 24.4);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, 9, 0, 31, [0, P.hairHi, 0.35, P.hair, 1, P.hair]), 1.9);
    // 发流
    ctx.strokeStyle = 'rgba(90,68,54,.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-6.4, 11.6);
    ctx.quadraticCurveTo(-2.4, 16.4, 2.6, 15.0);
    ctx.quadraticCurveTo(7.4, 13.8, 10.4, 16.2);
    ctx.stroke();
    // 鬓角
    [-1, 1].forEach(function (s) {
      ctx.beginPath();
      ctx.moveTo(s * 12.3, 21.8);
      ctx.quadraticCurveTo(s * 12.9, 25.2, s * 12.2, 27.6);
      ctx.strokeStyle = P.hair;
      ctx.lineWidth = 2.3;
      ctx.lineCap = 'round';
      ctx.stroke();
    });
    // 顶发高光
    ctx.beginPath();
    ctx.moveTo(-6.4, 12.6);
    ctx.quadraticCurveTo(-1.6, 10.0, 4.2, 11.6);
    ctx.strokeStyle = 'rgba(255,232,200,.22)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  /* 垂下的手臂（男生版）：与 girlArm 同一套参数，便于两侧同步 */
  function boyArm(ctx, sd, dx, P, dim) {
    var sx = sd * 9.4, sy = 46.0;
    var ex = sd * 13.2, ey = 63.8 + dx;
    limb(ctx, sx, sy, sd * 14.2, 54.6, ex, ey, 6.2, dim ? P.coatDark : P.coatMid, 1.7);
    // 肩线
    ctx.beginPath();
    ctx.moveTo(sd * 9.0, 47.2);
    ctx.quadraticCurveTo(sd * 11.2, 50.4, sd * 11.0, 54.2);
    ctx.strokeStyle = dim ? 'rgba(18,34,52,.5)' : 'rgba(26,44,64,.4)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // 袖口
    ell(ctx, ex, ey + 0.8, 3.4, 2.3, sd * 0.15);
    paint(ctx, lg(ctx, 0, ey - 1.5, 0, ey + 3.1, [0, '#fffdf6', 1, P.trim]), 1.5);
    // 手套
    ell(ctx, ex, ey + 3.5, 3.5, 3.1, sd * 0.15);
    paint(ctx, lg(ctx, 0, ey + 0.6, 0, ey + 6.6, [0, '#d05a45', 1, P.glove]), 1.5);
    ell(ctx, ex - sd * 0.9, ey + 2.6, 1.1, 1.3, 0);
    ctx.fillStyle = 'rgba(255,210,190,.5)'; ctx.fill();
  }

  /* 举起挥手的手臂：替换同一侧垂下的手，避免出现第三只手 */
  function boyArmUp(ctx, sd, wiggle, P) {
    var sx = sd * 9.4, sy = 46.2;
    var ex = sd * 15.0, ey = 33.6;
    var hx = sd * 13.6 + sd * (wiggle === 1 ? 0.9 : -0.7);
    var hy = 23.6 + (wiggle === 1 ? -1.2 : 0.9);
    limb(ctx, sx, sy, sd * 13.8, 40.2, ex, ey, 6.2, P.coatMid, 1.7);
    limb(ctx, ex, ey, hx + sd * 0.4, 29.6, hx, hy, 5.4, P.coat, 1.7);
    // 袖口 + 手套
    ell(ctx, hx, hy + 0.4, 3.2, 2.5, sd * 0.2);
    paint(ctx, lg(ctx, 0, hy - 1.3, 0, hy + 2.5, [0, '#fffdf6', 1, P.trim]), 1.5);
    ell(ctx, hx + sd * 0.3, hy - 3.2, 3.4, 3.2, sd * 0.15);
    paint(ctx, lg(ctx, 0, hy - 6.4, 0, hy, [0, '#d05a45', 1, P.glove]), 1.5);
    ell(ctx, hx - sd * 0.9, hy - 4.0, 1.1, 1.3, 0);
    ctx.fillStyle = 'rgba(255,210,190,.5)'; ctx.fill();
  }

  function boy(ctx, dir, f, wavePhase) {
    var P = PAL.m;
    var G = gait(f, dir);
    var side = G.side, back = dir === 1;
    var narrow = side ? 0.78 : 1;

    // ---- 腿 / 靴 ----
    var lx = -6.6 + G.legL, rx = 6.6 + G.legR;
    boot(ctx, lx, 90.4 - G.liftL, 8.6, side || -1, P);
    boot(ctx, rx, 90.4 - G.liftR, 8.6, side || 1, P);
    leg(ctx, lx, 70.4 - G.liftL, 7.6, 21.0, P);
    leg(ctx, rx, 70.4 - G.liftR, 7.6, 21.0, P);

    ctx.save();
    ctx.translate(0, G.bob);

    // 侧视只画近侧那只手

    ctx.save();
    ctx.scale(narrow, 1);

    // ---- 大衣（长款派克）----
    ctx.beginPath();
    ctx.moveTo(-11.4, 44.4);
    ctx.bezierCurveTo(-14.0, 47.4, -13.4, 58, -12.6, 70.0);
    ctx.quadraticCurveTo(0, 73.6, 12.6, 70.0);
    ctx.bezierCurveTo(13.4, 58, 14.0, 47.4, 11.4, 44.4);
    ctx.quadraticCurveTo(0, 41.4, -11.4, 44.4);
    ctx.closePath();
    paint(ctx, lg(ctx, -12, 45, 12, 72,
      [0, P.coatHi, 0.26, P.coat, 0.74, P.coatMid, 1, P.coatDark]), 2);
    // 下摆绒边
    ctx.beginPath();
    ctx.moveTo(-12.6, 68.8);
    ctx.quadraticCurveTo(0, 72.4, 12.6, 68.8);
    ctx.strokeStyle = '#fffaf0';
    ctx.lineWidth = 2.1;
    ctx.stroke();

    if (!back) {
      // 拉链（背面不画）
      ctx.beginPath();
      ctx.moveTo(0.8, 45.4);
      ctx.lineTo(0.4, 71.2);
      ctx.strokeStyle = 'rgba(28,44,62,.6)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ell(ctx, 0.6, 52.6, 1.1, 1.1); paint(ctx, '#c9d6e4', 0.9);
      // 口袋
      [-7.2, 7.2].forEach(function (x) {
        ctx.beginPath();
        ctx.moveTo(x - 3.0, 56.2);
        ctx.lineTo(x + 3.0, 56.2);
        ctx.strokeStyle = 'rgba(26,44,64,.45)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });
    } else {
      // 背面：后育克 + 中缝
      ctx.beginPath();
      ctx.moveTo(-10.4, 50.6);
      ctx.quadraticCurveTo(0, 53.4, 10.4, 50.6);
      ctx.moveTo(0.4, 53.0);
      ctx.lineTo(0.4, 69.6);
      ctx.strokeStyle = 'rgba(26,44,64,.45)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    // 下摆开衩
    ctx.beginPath();
    ctx.moveTo(-1.2, 64.6);
    ctx.lineTo(-1.6, 72.0);
    ctx.moveTo(2.2, 64.6);
    ctx.lineTo(2.6, 72.0);
    ctx.strokeStyle = 'rgba(26,44,64,.4)';
    ctx.lineWidth = 1.0;
    ctx.stroke();
    ctx.restore();

    // ---- 近侧 / 正面手臂 ----
    if (side) {
      if (wavePhase) boyArmUp(ctx, side, wavePhase, P);
      else boyArm(ctx, side, G.armR, P, false);
    } else if (wavePhase) {
      boyArm(ctx, -1, G.armL, P, false);
      boyArmUp(ctx, 1, wavePhase, P);
    } else {
      boyArm(ctx, -1, G.armL, P, false);
      boyArm(ctx, 1, G.armR, P, false);
    }

    // ---- 兜帽 / 毛领 ----
    ctx.beginPath();
    ctx.moveTo(-11.6, 44.8);
    ctx.bezierCurveTo(-9.6, 40.2, 9.6, 40.2, 11.6, 44.8);
    ctx.bezierCurveTo(9.0, 48.0, -9.0, 48.0, -11.6, 44.8);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, 40.0, 0, 48.2, [0, '#fffdf8', 0.55, P.trim, 1, P.trimDark]), 1.7);

    // 围巾（背面在颈后，只画围合的一圈）
    ctx.beginPath();
    ctx.moveTo(-9.2, 44.2);
    ctx.quadraticCurveTo(0, 41.4, 9.2, 44.2);
    ctx.quadraticCurveTo(9.8, 48.4, 8.6, 49.8);
    ctx.quadraticCurveTo(0, 47.4, -8.6, 49.8);
    ctx.quadraticCurveTo(-9.8, 48.4, -9.2, 44.2);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, 41.4, 0, 50, [0, '#fffdf5', 0.55, P.scarf, 1, P.scarfDark]), 1.8);
    if (!back) {
      // 围巾尾（左侧，短一些，带流苏）
      var fl = (f === 1 ? 0.8 : (f === 3 ? -0.8 : 0));
      ctx.beginPath();
      ctx.moveTo(-8.4, 47.6);
      ctx.bezierCurveTo(-10.4, 51.6, -10.6, 55.4, -9.8, 58.4 + fl);
      ctx.quadraticCurveTo(-8.0, 59.4, -6.4, 58.2 + fl);
      ctx.bezierCurveTo(-7.2, 54.6, -6.8, 51.2, -6.0, 48.2);
      ctx.closePath();
      paint(ctx, lg(ctx, -6, 48, -10, 59, [0, P.scarf, 1, P.scarfDark]), 1.7);
      ctx.strokeStyle = P.scarfDark;
      ctx.lineWidth = 0.85;
      for (var fs = 0; fs < 4; fs++) {
        var fx = -9.6 + fs * 1.15;
        ctx.beginPath();
        ctx.moveTo(fx, 58.2 + fl);
        ctx.lineTo(fx - 0.1, 60.4 + fl);
        ctx.stroke();
      }
    } else {
      // 背面：围巾在颈后收口
      ctx.beginPath();
      ctx.moveTo(-7.6, 47.6);
      ctx.quadraticCurveTo(0, 45.4, 7.6, 47.6);
      ctx.strokeStyle = P.scarfDark;
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }

    // ---- 脖子 ----
    ctx.beginPath();
    ctx.moveTo(-4.2, 38.6);
    ctx.lineTo(4.2, 38.6);
    ctx.lineTo(4.6, 45.2);
    ctx.quadraticCurveTo(0, 47.0, -4.6, 45.2);
    ctx.closePath();
    paint(ctx, P.skinShade, 0);

    // ---- 头 ----
    headShape(ctx, 0, 13.4);
    paint(ctx, lg(ctx, 0, 10, 0, 43, [0, P.skin, 0.6, P.skinMid, 1, P.skinShade]), 2);
    ell(ctx, -5.8, 24.4, 7.4, 12.0);
    ctx.fillStyle = rg(ctx, -7.6, 22, 0.5, 9.2, [0, 'rgba(255,238,218,.42)', 1, 'rgba(255,238,218,0)']);
    ctx.fill();
    if (dir !== 1) {
      ell(ctx, 0, 43.2, 6.4, 2.0);
      ctx.fillStyle = 'rgba(196,132,100,.26)';
      ctx.fill();
      [-1, 1].forEach(function (s) {
        ell(ctx, s * 13.3, 28.4, 2.0, 2.8);
        paint(ctx, P.skinMid, 1.4);
      });
    }

    if (dir !== 1) {
      eyesBoy(ctx, dir, P, true);
      blush(ctx, dir, { blush: 'rgba(214,140,120,.24)' });
      // 鼻子
      if (dir === 0) {
        ctx.beginPath();
        ctx.moveTo(0.4, 30.8);
        ctx.quadraticCurveTo(-0.4, 32.6, -1.8, 32.8);
        ctx.strokeStyle = 'rgba(170,116,90,.8)';
        ctx.lineWidth = 1.0;
        ctx.stroke();
        // 嘴
        ctx.beginPath();
        ctx.moveTo(-2.6, 35.4);
        ctx.quadraticCurveTo(0, 37.0, 2.6, 35.4);
        ctx.strokeStyle = '#a8665e';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // 下巴阴影
        ctx.beginPath();
        ctx.moveTo(-3.4, 40.4);
        ctx.quadraticCurveTo(0, 42.0, 3.4, 40.4);
        ctx.strokeStyle = 'rgba(190,140,110,.25)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      } else {
        var s2 = dir === 2 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(s2 * 12.8, 27.0);
        ctx.quadraticCurveTo(s2 * 15.2, 29.4, s2 * 12.9, 31.0);
        ctx.strokeStyle = 'rgba(170,116,90,.85)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s2 * 5.4, 34.6);
        ctx.quadraticCurveTo(s2 * 7.6, 35.6, s2 * 9.4, 34.4);
        ctx.strokeStyle = '#a8665e';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    boyHair(ctx, dir, P);

    ctx.restore();
  }

  /* ---------------- 圣诞老人（与主角同画风） ---------------- */
  var SANTA = {
    coat: '#c0392b', coatMid: '#a82d24', coatDark: '#83211b', coatHi: '#d9584a',
    fur: '#fbf6ec', furMid: '#e6dac4',
    skin: '#f6cfa8', skinMid: '#eab894', nose: '#e08a76',
    boot: '#3a2c22', bootDark: '#241a12', belt: '#4a3226', gold: '#f0c040',
    trim: '#fbf6ec', trimDark: '#e6dac4',
    hat: '#c0392b'
  };

  function santaBody(ctx) {
    var P = SANTA;
    // 靴子
    boot(ctx, -6.6, 90.0, 9.4, -1, P);
    boot(ctx, 6.6, 90.0, 9.4, 1, P);
    // 裤子
    rr(ctx, -7.4, 74, 6.6, 18, 3);
    paint(ctx, P.coatDark, 1.6);
    rr(ctx, 0.8, 74, 6.6, 18, 3);
    paint(ctx, P.coatDark, 1.6);
    // 大肚子外套
    ctx.beginPath();
    ctx.moveTo(-12.4, 34.0);
    ctx.bezierCurveTo(-18.4, 44, -19.6, 62, -18.2, 78.0);
    ctx.quadraticCurveTo(-17.6, 84.6, -10.0, 85.6);
    ctx.lineTo(10.0, 85.6);
    ctx.quadraticCurveTo(17.6, 84.6, 18.2, 78.0);
    ctx.bezierCurveTo(19.6, 62, 18.4, 44, 12.4, 34.0);
    ctx.quadraticCurveTo(0, 29.6, -12.4, 34.0);
    ctx.closePath();
    paint(ctx, lg(ctx, -16, 34, 16, 86,
      [0, P.coatHi, 0.3, P.coat, 0.75, P.coatMid, 1, P.coatDark]), 2);
    // 下摆绒边
    ctx.beginPath();
    ctx.moveTo(-18.2, 79.6);
    ctx.quadraticCurveTo(0, 87.6, 18.2, 79.6);
    ctx.strokeStyle = P.fur;
    ctx.lineWidth = 4.4;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,170,140,.5)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-18.0, 82.4);
    ctx.quadraticCurveTo(0, 90.0, 18.0, 82.4);
    ctx.stroke();
    // 腰带
    ctx.beginPath();
    ctx.moveTo(-17.4, 62.0);
    ctx.quadraticCurveTo(0, 66.4, 17.4, 62.0);
    ctx.lineTo(17.4, 68.4);
    ctx.quadraticCurveTo(0, 72.8, -17.4, 68.4);
    ctx.closePath();
    paint(ctx, P.belt, 1.8);
    rr(ctx, -4.4, 62.6, 8.8, 7.4, 1.6);
    paint(ctx, P.gold, 1.6);
    rr(ctx, -2.6, 64.4, 5.2, 3.8, 1.0);
    paint(ctx, P.belt, 0);
    // 手臂
    limb(ctx, -13.2, 35.6, -20.6, 47.0, -19.4, 58.4, 7.6, P.coatMid, 1.8);
    limb(ctx, 13.2, 35.6, 20.6, 47.0, 19.4, 58.4, 7.6, P.coatMid, 1.8);
    [-1, 1].forEach(function (sd) {
      ell(ctx, sd * 19.4, 60.0, 4.4, 3.3);
      paint(ctx, lg(ctx, 0, 56.6, 0, 63.4, [0, '#fffdf7', 1, P.furMid]), 1.6);
      ell(ctx, sd * 19.4, 63.8, 4.2, 3.6);
      paint(ctx, lg(ctx, 0, 60.4, 0, 67.4, [0, '#fffdf7', 1, P.furMid]), 1.6);
    });
    // 白胡子（大片，盖住胸口）
    ctx.beginPath();
    ctx.moveTo(-11.6, 22.6);
    ctx.bezierCurveTo(-13.4, 34, -10.4, 44.6, 0, 50.6);
    ctx.bezierCurveTo(10.4, 44.6, 13.4, 34, 11.6, 22.6);
    ctx.quadraticCurveTo(0, 18.6, -11.6, 22.6);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, 20, 0, 51, [0, '#ffffff', 0.55, P.fur, 1, '#e9dfcb']), 2);
    // 胡子纹理
    ctx.strokeStyle = 'rgba(200,182,150,.45)';
    ctx.lineWidth = 0.9;
    [-6.4, -2.0, 2.4, 6.8].forEach(function (x) {
      ctx.beginPath();
      ctx.moveTo(x * 0.8, 28);
      ctx.quadraticCurveTo(x, 38, x * 1.3, 46);
      ctx.stroke();
    });
    // 脸
    ell(ctx, 0, 24.0, 11.2, 11.4);
    paint(ctx, lg(ctx, 0, 13, 0, 35, [0, P.skin, 0.65, P.skinMid, 1, '#dda078']), 2);
    // 眉毛
    [-5.2, 5.2].forEach(function (x) {
      ctx.beginPath();
      ctx.moveTo(x - 2.6, 18.6);
      ctx.quadraticCurveTo(x, 16.8, x + 2.6, 18.6);
      ctx.strokeStyle = '#f6f2e8';
      ctx.lineWidth = 2.0;
      ctx.lineCap = 'round';
      ctx.stroke();
    });
    // 眼睛
    [-5.2, 5.2].forEach(function (x) {
      ell(ctx, x, 22.4, 1.5, 1.8);
      ctx.fillStyle = '#2b2119';
      ctx.fill();
      ell(ctx, x - 0.4, 21.8, 0.55, 0.6);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fill();
    });
    // 鼻子
    ell(ctx, 0, 26.6, 3.0, 2.6);
    paint(ctx, lg(ctx, 0, 24, 0, 29, [0, '#f0a08c', 1, P.nose]), 1.4);
    // 腮红
    [-8.4, 8.4].forEach(function (x) {
      ell(ctx, x, 27.4, 3.0, 2.0);
      ctx.fillStyle = rg(ctx, x, 27.4, 0.2, 3.2, [0, 'rgba(232,140,130,.5)', 1, 'rgba(232,140,130,0)']);
      ctx.fill();
    });
    // 胡子中间留出嘴部（白八字胡）
    ctx.beginPath();
    ctx.moveTo(-8.6, 30.4);
    ctx.bezierCurveTo(-4.0, 29.0, -1.6, 32.6, 0, 34.2);
    ctx.bezierCurveTo(1.6, 32.6, 4.0, 29.0, 8.6, 30.4);
    ctx.bezierCurveTo(8.0, 35.4, 3.0, 38.4, 0, 38.8);
    ctx.bezierCurveTo(-3.0, 38.4, -8.0, 35.4, -8.6, 30.4);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, 29, 0, 39, [0, '#ffffff', 1, '#ece2cf']), 1.6);
    // 帽子（向左弯的红锥，明确高过帽檐）
    ctx.beginPath();
    ctx.moveTo(-12.4, 14.2);
    ctx.bezierCurveTo(-15.2, 4.4, -11.4, -2.6, -4.8, -5.2);
    ctx.bezierCurveTo(-3.2, 0.4, 0.4, 4.0, 5.4, 6.0);
    ctx.bezierCurveTo(9.8, 7.8, 12.2, 10.8, 12.4, 14.2);
    ctx.quadraticCurveTo(0, 10.0, -12.4, 14.2);
    ctx.closePath();
    paint(ctx, lg(ctx, -10, -5, 10, 15,
      [0, '#e0665a', 0.45, P.coat, 1, P.coatMid]), 2);
    // 帽体针织感
    ctx.strokeStyle = 'rgba(255,220,210,.22)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(-9.0, 9.4);
    ctx.quadraticCurveTo(-2.0, 3.0, 6.6, 8.6);
    ctx.stroke();
    // 帽檐
    ctx.beginPath();
    ctx.moveTo(-13.0, 12.0);
    ctx.quadraticCurveTo(0, 7.4, 13.0, 12.0);
    ctx.quadraticCurveTo(13.6, 17.0, 12.6, 18.6);
    ctx.quadraticCurveTo(0, 14.4, -12.6, 18.6);
    ctx.quadraticCurveTo(-13.6, 17.0, -13.0, 12.0);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, 7.4, 0, 18.6, [0, '#ffffff', 1, P.furMid]), 1.7);
    // 帽尖绒球
    ell(ctx, -5.6, -6.6, 4.8, 4.6);
    paint(ctx, lg(ctx, -8.4, -10.4, -2.4, -1.6, [0, '#ffffff', 0.6, P.fur, 1, P.furMid]), 1.6);
    ell(ctx, -7.0, -8.4, 1.8, 1.4);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fill();
  }

  var santaCache = {};
  function santaFrame(bob) {
    var k = bob ? 1 : 0;
    if (santaCache[k]) return santaCache[k];
    var s = 0.70 * SS;
    var cv = document.createElement('canvas');
    cv.width = Math.round(BOX.w * s);
    cv.height = Math.round(BOX.h * s);
    var ctx = cv.getContext('2d');
    ctx.scale(s, s);
    ctx.translate(-BOX.x, -BOX.y + (bob ? 0.8 : 0));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    santaBody(ctx);
    santaCache[k] = cv;
    return cv;
  }

  function drawSanta(ctx, cx, cy, t) {
    var bob = (typeof t === 'number' && Math.sin(t / 620) > 0) ? 1 : 0;
    var img = santaFrame(bob);
    var s = 0.70;
    ctx.save();
    ctx.fillStyle = 'rgba(64,84,120,.22)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1.4, 16.0, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, cx + BOX.x * s, cy - (100 - BOX.y) * s, BOX.w * s, BOX.h * s);
    ctx.restore();
  }

  /* ---------------- 小精灵（与主角同画风） ---------------- */
  var ELF = {
    skin: '#f7d0ac', skinMid: '#eab894', skinShade: '#d99f79', skinHi: '#ffe6cd',
    hair: '#6b4a2f', hairMid: '#8a6440', hairHi: '#a87d52', hairDark: '#4c3320',
    coat: '#3f8b52', coatMid: '#357846', coatDark: '#27603a', coatHi: '#58a868',
    trim: '#f6e6b8', trimDark: '#dcc789',
    pants: '#3f6b45', pantsDark: '#2f5236',
    boot: '#5c3d29', bootDark: '#412a1b',
    scarf: '#c0392b', scarfDark: '#9c2c20',
    glove: '#f6e6b8', accent: '#c0392b',
    eye: '#3a2a20', blush: 'rgba(228,132,120,.4)'
  };

  function elfBody(ctx, frame) {
    var P = ELF;
    var bob = frame ? -0.8 : 0;
    ctx.save();
    ctx.translate(0, bob);
    // 靴子（鞋尖上翘）
    boot(ctx, -5.8, 90.0, 8.2, -1, P);
    boot(ctx, 5.8, 90.0, 8.2, 1, P);
    ctx.strokeStyle = P.trim;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    [-1, 1].forEach(function (sd) {
      ctx.beginPath();
      ctx.moveTo(sd * 8.4, 90.6);
      ctx.quadraticCurveTo(sd * 10.6, 89.0, sd * 11.2, 86.6);
      ctx.stroke();
      ell(ctx, sd * 11.2, 86.4, 1.4, 1.4);
      paint(ctx, P.trim, 0);
    });
    // 腿
    leg(ctx, -5.8, 72.4, 6.6, 19.0, P);
    leg(ctx, 5.8, 72.4, 6.6, 19.0, P);
    // 绿上衣 + 腰带
    ctx.beginPath();
    ctx.moveTo(-9.6, 45.0);
    ctx.bezierCurveTo(-12.4, 52, -12.8, 64, -12.0, 73.2);
    ctx.quadraticCurveTo(0, 77.0, 12.0, 73.2);
    ctx.bezierCurveTo(12.8, 64, 12.4, 52, 9.6, 45.0);
    ctx.quadraticCurveTo(0, 42.0, -9.6, 45.0);
    ctx.closePath();
    paint(ctx, lg(ctx, -11, 45, 11, 74,
      [0, P.coatHi, 0.3, P.coat, 0.72, P.coatMid, 1, P.coatDark]), 2);
    ctx.beginPath();
    ctx.moveTo(-12.0, 62.6);
    ctx.quadraticCurveTo(0, 66.4, 12.0, 62.6);
    ctx.lineTo(12.0, 67.0);
    ctx.quadraticCurveTo(0, 70.8, -12.0, 67.0);
    ctx.closePath();
    paint(ctx, P.hairDark, 1.6);
    rr(ctx, -3.2, 63.0, 6.4, 5.6, 1.2);
    paint(ctx, P.trim, 1.4);
    // 小尖领
    ctx.beginPath();
    ctx.moveTo(-6.6, 44.6);
    ctx.lineTo(0, 49.6);
    ctx.lineTo(6.6, 44.6);
    ctx.quadraticCurveTo(0, 42.4, -6.6, 44.6);
    ctx.closePath();
    paint(ctx, P.trim, 1.5);
    // 手臂
    function arm(side, dx) {
      var sx = side * 8.8, sy = 46.2;
      var ex = side * 12.6, ey = 62.6 + dx;
      limb(ctx, sx, sy, side * 13.8, 54.4, ex, ey, 5.2, P.coatMid, 1.6);
      ell(ctx, ex, ey + 2.8, 3.1, 2.7);
      paint(ctx, lg(ctx, 0, ey, 0, ey + 5.6, [0, '#fffdf7', 1, P.trimDark]), 1.4);
    }
    arm(-1, frame ? 1.2 : 0);
    arm(1, frame ? -1.2 : 0);
    // 脖子
    rr(ctx, -3.6, 39.2, 7.2, 6.4, 2.4);
    paint(ctx, P.skinShade, 0);
    // 头
    headShape(ctx, 0, 11.6);
    paint(ctx, lg(ctx, 0, 10, 0, 43, [0, P.skin, 0.6, P.skinMid, 1, P.skinShade]), 2);
    // 尖耳朵
    [-1, 1].forEach(function (sd) {
      ctx.beginPath();
      ctx.moveTo(sd * 10.6, 26.0);
      ctx.bezierCurveTo(sd * 15.4, 24.2, sd * 16.6, 24.6, sd * 15.0, 27.2);
      ctx.quadraticCurveTo(sd * 13.4, 28.6, sd * 11.2, 29.4);
      ctx.closePath();
      paint(ctx, P.skinMid, 1.6);
    });
    // 五官
    eyesGirl(ctx, 0, P);
    blush(ctx, 0, P);
    noseMouth(ctx, 0, P);
    // 头发（露出一点刘海）
    ctx.beginPath();
    ctx.moveTo(-11.4, 22.0);
    ctx.bezierCurveTo(-11.4, 12.0, -6.2, 9.4, 0, 9.4);
    ctx.bezierCurveTo(6.2, 9.4, 11.4, 12.0, 11.4, 22.0);
    ctx.bezierCurveTo(8.0, 17.4, 3.4, 16.0, -0.6, 17.2);
    ctx.bezierCurveTo(-4.4, 18.2, -8.4, 18.4, -11.4, 22.0);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, 9, 0, 22, [0, P.hairHi, 0.4, P.hair, 1, P.hairMid]), 1.8);
    // 尖顶帽
    ctx.beginPath();
    ctx.moveTo(-11.0, 12.4);
    ctx.bezierCurveTo(-10.0, 2.0, -2.6, -3.0, 4.6, -6.4);
    ctx.bezierCurveTo(3.2, -0.2, 6.0, 5.2, 11.0, 12.4);
    ctx.quadraticCurveTo(0, 8.4, -11.0, 12.4);
    ctx.closePath();
    paint(ctx, lg(ctx, -6, -6, 8, 13,
      [0, '#58a868', 0.45, P.coat, 1, P.coatDark]), 1.9);
    // 帽檐
    ctx.beginPath();
    ctx.moveTo(-11.6, 11.4);
    ctx.quadraticCurveTo(0, 7.6, 11.6, 11.4);
    ctx.quadraticCurveTo(12.0, 15.4, 11.2, 16.6);
    ctx.quadraticCurveTo(0, 13.4, -11.2, 16.6);
    ctx.quadraticCurveTo(-12.0, 15.4, -11.6, 11.4);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, 7.6, 0, 16.6, [0, P.trim, 1, P.trimDark]), 1.6);
    // 帽尖铃铛
    ell(ctx, 5.4, -7.6, 2.6, 2.6);
    paint(ctx, lg(ctx, 3, -10, 8, -5, [0, '#ffe08a', 1, '#d9a93c']), 1.4);
    ctx.restore();
  }

  var elfCache = {};
  function elfFrame(f) {
    var k = f ? 1 : 0;
    if (elfCache[k]) return elfCache[k];
    var sc = 0.62 * SS;
    var cv = document.createElement('canvas');
    cv.width = Math.round(BOX.w * sc);
    cv.height = Math.round(BOX.h * sc);
    var ctx = cv.getContext('2d');
    ctx.scale(sc, sc);
    ctx.translate(-BOX.x, -BOX.y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    elfBody(ctx, k);
    elfCache[k] = cv;
    return cv;
  }

  function drawElf(ctx, cx, cy, t, frame) {
    var f = (Math.floor((t || 0) / 420) % 2);
    var img = elfFrame(f);
    var sc = 0.62;
    ctx.save();
    ctx.fillStyle = 'rgba(64,84,120,.2)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1.2, 11.0, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, cx + BOX.x * sc, cy - (100 - BOX.y) * sc, BOX.w * sc, BOX.h * sc);
    ctx.restore();
  }

  /* ---------------- 咖啡店老板娘（v3.6 矢量重绘，替代原来的 20×28 色块） ---------------- */
  var baristaCache = {};
  var BAR = {
    skin: '#fbcfad', skinMid: '#f0bd99', skinShade: '#d99c78', skinHi: '#ffe6cf',
    hair: '#5b3c28', hairMid: '#714b32', hairHi: '#8d6140', hairDark: '#3d2718',
    knit: '#b85731', knitMid: '#a04725', knitDark: '#843618', knitHi: '#cf7048',
    apron: '#f8edd6', apronMid: '#e9d8ba', apronDark: '#cdb593',
    skirt: '#4b382d', skirtDark: '#33241c',
    boot: '#5c3e26', bootDark: '#3d2818',
    mug: '#f5eee2', cocoa: '#5f3a1e'
  };

  function baristaBody(ctx) {
    /* ---- 裙子 ---- */
    ctx.beginPath();
    ctx.moveTo(-10.4, 61);
    ctx.lineTo(10.4, 61);
    ctx.bezierCurveTo(15.2, 76, 16.6, 88, 16.2, 95.4);
    ctx.lineTo(-16.2, 95.4);
    ctx.bezierCurveTo(-16.6, 88, -15.2, 76, -10.4, 61);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, 61, 0, 95.4, [0, BAR.skirt, 1, BAR.skirtDark]), 1.9);

    /* ---- 靴子 ---- */
    [-6.4, 6.4].forEach(function (x) {
      rr(ctx, x - 4.5, 88.6, 9.0, 10.6, 3.4);
      paint(ctx, lg(ctx, x - 4, 88, x + 4, 99, [0, BAR.boot, 1, BAR.bootDark]), 1.7);
      // 靴口
      rr(ctx, x - 4.8, 88.2, 9.6, 2.6, 1.3);
      paint(ctx, 'rgba(255,247,232,.35)', 1.2);
    });

    /* ---- 针织衫 ---- */
    rr(ctx, -12.8, 43.4, 25.6, 24.6, 8.4);
    paint(ctx, lg(ctx, -12, 43, 12, 68, [0, BAR.knitHi, 0.4, BAR.knit, 1, BAR.knitDark]), 1.9);
    // 毛衣罗纹
    ctx.strokeStyle = 'rgba(120,45,20,.35)'; ctx.lineWidth = 0.9;
    for (var i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 3.2, 46.5);
      ctx.lineTo(i * 3.2, 58);
      ctx.stroke();
    }

    /* ---- 围裙 ---- */
    ctx.beginPath();
    ctx.moveTo(-7.4, 47.2);
    ctx.lineTo(7.4, 47.2);
    ctx.lineTo(9.6, 82.4);
    ctx.quadraticCurveTo(0, 85.6, -9.6, 82.4);
    ctx.closePath();
    paint(ctx, lg(ctx, -9, 47, 9, 84, [0, '#fffaf0', 0.5, BAR.apron, 1, BAR.apronDark]), 1.6);
    // 口袋
    rr(ctx, -4.8, 68.0, 9.6, 8.6, 2.4);
    paint(ctx, 'rgba(233,216,186,.6)', 1.2);
    // 肩带
    ctx.beginPath();
    ctx.moveTo(-5.2, 47.4); ctx.lineTo(-7.6, 43.0);
    ctx.moveTo(5.2, 47.4); ctx.lineTo(7.6, 43.0);
    ctx.strokeStyle = BAR.apronMid; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.stroke();
    // 腰后系带
    rr(ctx, -10.6, 62.4, 21.2, 2.6, 1.3);
    paint(ctx, 'rgba(205,181,147,.85)', 1.1);

    /* ---- 手臂：左手自然下垂，右手端着马克杯 ---- */
    limb(ctx, -11.6, 47.6, -14.4, 55.0, -13.0, 64.6, 6.0, BAR.knitMid, 1.7);
    ell(ctx, -13.2, 67.2, 3.0, 3.2);
    paint(ctx, lg(ctx, -14, 65, -12, 70, [0, BAR.skinHi, 1, BAR.skinShade]), 1.5);

    limb(ctx, 11.6, 47.6, 15.4, 53.0, 12.6, 58.6, 6.0, BAR.knit, 1.7);
    ell(ctx, 12.0, 61.4, 3.0, 3.2);
    paint(ctx, lg(ctx, 11, 59, 13, 64, [0, BAR.skinHi, 1, BAR.skinShade]), 1.5);

    /* 马克杯 + 热气 */
    rr(ctx, 12.4, 55.4, 8.2, 7.4, 2.0);
    paint(ctx, lg(ctx, 12.4, 55.4, 20.6, 62.8, [0, '#fffdf8', 1, BAR.mug]), 1.5);
    rr(ctx, 12.9, 56.0, 7.2, 2.0, 1.0);
    paint(ctx, BAR.cocoa, 0);
    ctx.beginPath();
    ctx.arc(20.9, 59.0, 2.2, -Math.PI * 0.45, Math.PI * 0.45);
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(15.0, 53.6); ctx.quadraticCurveTo(16.4, 51.6, 15.2, 49.8);
    ctx.moveTo(18.2, 53.6); ctx.quadraticCurveTo(19.6, 51.6, 18.4, 49.8);
    ctx.strokeStyle = 'rgba(255,235,205,.45)'; ctx.lineWidth = 1.0; ctx.stroke();

    /* ---- 脖子 ---- */
    rr(ctx, -3.7, 37.6, 7.4, 7.8, 3.0);
    paint(ctx, BAR.skinShade, 1.5);

    /* ---- 后发（先画，压在头后） ---- */
    ctx.beginPath();
    ctx.moveTo(-11.4, 26.0);
    ctx.bezierCurveTo(-13.6, 34.0, -13.0, 42.0, -10.2, 45.6);
    ctx.lineTo(10.2, 45.6);
    ctx.bezierCurveTo(13.0, 42.0, 13.6, 34.0, 11.4, 26.0);
    ctx.closePath();
    paint(ctx, lg(ctx, 0, 24, 0, 46, [0, BAR.hairMid, 1, BAR.hairDark]), 1.8);

    /* ---- 头 ---- */
    ell(ctx, 0, 28.2, 11.4, 12.2);
    paint(ctx, lg(ctx, -7, 17, 7, 40, [0, BAR.skinHi, 0.45, BAR.skin, 1, BAR.skinMid]), 1.9);

    /* ---- 五官 ---- */
    // 眼
    [-4.5, 4.5].forEach(function (x) {
      ell(ctx, x, 27.6, 1.55, 1.95);
      paint(ctx, '#4a3423', 0);
      ell(ctx, x - 0.4, 26.9, 0.5, 0.55);
      paint(ctx, 'rgba(255,255,255,.85)', 0);
    });
    // 眉
    ctx.strokeStyle = 'rgba(90,58,38,.85)'; ctx.lineWidth = 1.15; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6.3, 23.9); ctx.quadraticCurveTo(-4.5, 23.0, -2.8, 23.9);
    ctx.moveTo(2.8, 23.9); ctx.quadraticCurveTo(4.5, 23.0, 6.3, 23.9);
    ctx.stroke();
    // 鼻
    ctx.beginPath();
    ctx.moveTo(0.3, 29.4); ctx.quadraticCurveTo(-0.4, 31.0, 1.0, 31.2);
    ctx.strokeStyle = 'rgba(196,140,110,.8)'; ctx.lineWidth = 0.9; ctx.stroke();
    // 笑嘴
    ctx.beginPath();
    ctx.moveTo(-3.2, 33.2); ctx.quadraticCurveTo(0, 36.0, 3.2, 33.2);
    ctx.strokeStyle = '#a8493f'; ctx.lineWidth = 1.4; ctx.stroke();
    // 腮红
    [-7.4, 7.4].forEach(function (x) {
      ell(ctx, x, 31.6, 2.6, 1.7);
      ctx.fillStyle = rg(ctx, x, 31.6, 0.2, 3.0, [0, 'rgba(232,132,120,.42)', 1, 'rgba(232,132,120,0)']);
      ctx.fill();
    });

    /* ---- 刘海 + 头顶发髻 ---- */
    ctx.beginPath();
    ctx.moveTo(-11.2, 24.6);
    ctx.bezierCurveTo(-10.4, 14.8, -5.6, 10.4, 0, 10.4);
    ctx.bezierCurveTo(5.6, 10.4, 10.4, 14.8, 11.2, 24.6);
    ctx.bezierCurveTo(9.6, 19.6, 5.4, 17.2, 0, 17.6);
    ctx.bezierCurveTo(-5.4, 17.2, -9.6, 19.6, -11.2, 24.6);
    ctx.closePath();
    paint(ctx, lg(ctx, -8, 10, 8, 25, [0, BAR.hairHi, 0.55, BAR.hair, 1, BAR.hairDark]), 1.7);
    // 发髻
    ell(ctx, 0.4, 8.4, 5.4, 4.6);
    paint(ctx, lg(ctx, -4, 4, 4, 12, [0, BAR.hairHi, 1, BAR.hairMid]), 1.6);
    ell(ctx, -1.0, 7.2, 3.0, 2.0, -0.4);
    paint(ctx, 'rgba(160,110,74,.55)', 0);
    // 两侧碎发（垂到脸颊）
    [-1, 1].forEach(function (s) {
      ctx.beginPath();
      ctx.moveTo(s * 10.8, 20.0);
      ctx.bezierCurveTo(s * 12.8, 27.0, s * 12.4, 34.6, s * 11.2, 40.0);
      ctx.bezierCurveTo(s * 10.0, 40.6, s * 9.2, 39.6, s * 9.4, 38.2);
      ctx.bezierCurveTo(s * 10.2, 32.0, s * 10.0, 25.6, s * 9.2, 21.0);
      ctx.closePath();
      paint(ctx, lg(ctx, s * 12, 20, s * 10, 40, [0, BAR.hair, 0.6, BAR.hairMid, 1, BAR.hairDark]), 1.5);
    });
  }

  function baristaFrame(bob) {
    var k = bob ? 1 : 0;
    if (baristaCache[k]) return baristaCache[k];
    var s = 0.72 * SS;
    var cv = document.createElement('canvas');
    cv.width = Math.round(BOX.w * s);
    cv.height = Math.round(BOX.h * s);
    var c2 = cv.getContext('2d');
    c2.scale(s, s);
    c2.translate(-BOX.x, -BOX.y + (bob ? 0.7 : 0));
    c2.lineJoin = 'round';
    c2.lineCap = 'round';
    baristaBody(c2);
    baristaCache[k] = cv;
    return cv;
  }

  function drawBarista(ctx, cx, cy, t, frame) {
    var wob = (typeof t === 'number' && Math.sin(t / 640) > 0) ? 1 : 0;
    var img = baristaFrame(wob);
    var s = 0.72;
    ctx.save();
    ctx.fillStyle = 'rgba(64,84,120,.22)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1.4, 15.0, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, cx + BOX.x * s, cy - (100 - BOX.y) * s, BOX.w * s, BOX.h * s);
    ctx.restore();
  }

  /* ---------------- 烘焙与绘制 ---------------- */
  var DIRS = { 0: 0, 1: 1, 2: 3, 3: 3 };  // 左向 = 右向镜像

  function bake(g, dir, frame, wavePhase) {
    var s = SCALE[g];
    var w = Math.round(BOX.w * s * SS);
    var h = Math.round(BOX.h * s * SS);
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, w);
    cv.height = Math.max(1, h);
    var ctx = cv.getContext('2d');
    ctx.scale(s * SS, s * SS);
    ctx.translate(-BOX.x, -BOX.y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    var drawDir = DIRS[dir] == null ? dir : DIRS[dir];

    // 挥手不再是「在画好的身体上再叠一只手」——那一侧的手臂由 girl/boy 直接
    // 画成举起姿势，所以任何时刻都只有两只手。
    if (g === 'f') girl(ctx, drawDir, frame, wavePhase);
    else boy(ctx, drawDir, frame, wavePhase);
    return cv;
  }

  function getFrame(g, dir, frame, wavePhase) {
    var key = g + '|' + dir + '|' + frame + '|' + (wavePhase || 0);
    if (cache[key]) return cache[key];
    var cv = bake(g, dir, frame, wavePhase || 0);
    cache[key] = cv;
    return cv;
  }

  function draw(ctx, cx, cy, dir, frame, o, wave, t) {
    var g = (o && o.gender === 'm') ? 'm' : 'f';
    var d = ((dir | 0) % 4 + 4) % 4;
    var fr = (((frame | 0) % 4) + 4) % 4;
    var wp = 0;
    if (wave) wp = (typeof t === 'number' && Math.sin(t / 130) > 0) ? 1 : 2;

    var s = SCALE[g];
    var img = getFrame(g, d, fr, wp);
    var w = BOX.w * s;
    var h = BOX.h * s;
    var left = cx + BOX.x * s;
    var top = cy - (100 - BOX.y) * s;

    // 地面投影
    ctx.save();
    ctx.fillStyle = 'rgba(64,84,120,.22)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1.2, 12.2, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(64,84,120,.12)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1.4, 17.0, 5.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if (d === 2) {
      ctx.translate(cx * 2, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, left, top, w, h);
    ctx.restore();
  }

  // 供预览页直接拿一张静态图（不做投影、不镜像）
  function frameCanvas(g, dir, frame, wavePhase) {
    return getFrame(g === 'm' ? 'm' : 'f', dir, frame, wavePhase || 0);
  }

  /* 后台预热：把 4 方向 × 4 帧（含挥手）逐帧烘焙好，
     避免玩家第一次朝某个方向走时出现一次小卡顿。 */
  function warmup() {
    var jobs = [];
    ['m', 'f'].forEach(function (g) {
      for (var d = 0; d < 4; d++) for (var f = 0; f < 4; f++) jobs.push([g, d, f, 0]);
      for (var d2 = 0; d2 < 4; d2++) jobs.push([g, d2, 0, 1]);
    });
    var i = 0;
    function step() {
      var t0 = Date.now();
      while (i < jobs.length && Date.now() - t0 < 7) {
        var j = jobs[i++];
        try { getFrame(j[0], j[1], j[2], j[3]); } catch (e) { }
      }
      if (i < jobs.length) setTimeout(step, 70);
    }
    setTimeout(step, 500);
  }
  if (typeof window !== 'undefined') {
    if (document.readyState === 'complete') warmup();
    else window.addEventListener('load', warmup);
  }

  return {
    draw: draw,
    drawSanta: drawSanta,
    drawElf: drawElf,
    drawBarista: drawBarista,
    warmup: warmup,
    frameCanvas: frameCanvas,
    scale: SCALE,
    box: BOX,
    palettes: PAL,
    clearCache: function () { cache = {}; }
  };
})();
