/* maps.js — v4.0：六个旅行地图（圣诞小镇车站的目的地）
 *
 * 设计原则
 *  1. 一张地图 = 一个独立的数据对象（paint / anim / near / obstacles / view / eggPos），
 *     六张地图互不影响，不在一个巨型函数里堆 if。
 *  2. 静态背景一次性渲染进离屏 canvas（LRU 只保留 2 张，避免 iPhone 内存爆掉），
 *     每帧只做 1 次 drawImage + 少量动态元素 —— 手感和圣诞小镇完全一致。
 *  3. 全部用世界坐标绘制（1500×1000）。车站面板里的缩略图靠 ctx.scale 复用同一个 paint，
 *     所以缩略图就是这张地图本身，不是另画的另一张图。
 *  4. 风格沿用 memories.js 里那四张样板（渐变天空 / 分层山脊 / 光晕 / 暗角 / 颗粒），
 *     不写实、不像素化，保持绘本质感。
 *
 * 依赖：无（纯 Canvas 2D）
 */
window.TravelMaps = (function () {
  'use strict';

  var W = 1500, H = 1000;

  /* ============================================================
   * 画笔工具（与 memories.js 一脉相承）
   * ============================================================ */
  function lin(g, x0, y0, x1, y1, stops) {
    var gr = g.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
    return gr;
  }
  function seeded(seed) {
    var v = seed;
    return function () { v = (v * 1103515245 + 12345) % 2147483648; return v / 2147483648; };
  }
  function bloom(g, x, y, r, col, a) {
    if (r <= 0) return;
    var rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col);
    rg.addColorStop(0.55, col.replace(/[\d.]+\)$/, '0.35)'));
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.save();
    g.globalAlpha = a === undefined ? 1 : a;
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.restore();
  }
  function vignette(g, a, col) {
    var rg = g.createRadialGradient(W / 2, H * 0.42, H * 0.34, W / 2, H * 0.42, H * 1.02);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, col || ('rgba(12,20,34,' + a + ')'));
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
  }
  function grain(g, n, seed) {
    var r = seeded(seed);
    for (var i = 0; i < n; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.055)' : 'rgba(20,30,50,.045)';
      g.fillRect(r() * W, r() * H, 1.6, 1.6);
    }
  }
  /* 平滑山脊（丘陵 / 云层 / 沙丘用）—— pts 是归一化 [u,v] */
  function ridge(g, pts, fill, closeY) {
    g.beginPath();
    g.moveTo(pts[0][0] * W, pts[0][1] * H);
    for (var i = 1; i < pts.length - 1; i++) {
      var cx = (pts[i][0] + pts[i + 1][0]) / 2 * W, cy = (pts[i][1] + pts[i + 1][1]) / 2 * H;
      g.quadraticCurveTo(pts[i][0] * W, pts[i][1] * H, cx, cy);
    }
    var L = pts[pts.length - 1];
    g.lineTo(L[0] * W, L[1] * H);
    var cy2 = closeY === undefined ? H + 10 : closeY;
    g.lineTo(W + 10, cy2); g.lineTo(-10, cy2);
    g.closePath();
    g.fillStyle = fill; g.fill();
  }
  /* 折线山脊（雪山用，尖峰） */
  function jag(g, pts, fill, closeY) {
    g.beginPath();
    g.moveTo(pts[0][0] * W, pts[0][1] * H);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * W, pts[i][1] * H);
    var cy2 = closeY === undefined ? H + 10 : closeY;
    g.lineTo(W + 10, cy2); g.lineTo(-10, cy2);
    g.closePath();
    g.fillStyle = fill; g.fill();
  }
  /* 一座山：两侧是曲线，顶点尖锐 —— 比折线山脊自然得多 */
  function peakPath(g, x, y, hw, baseY) {
    var d = baseY - y;
    g.moveTo(x - hw, baseY);
    g.quadraticCurveTo(x - hw * 0.40, y + d * 0.46, x - hw * 0.10, y + d * 0.10);
    g.lineTo(x, y);
    g.lineTo(x + hw * 0.12, y + d * 0.12);
    g.quadraticCurveTo(x + hw * 0.46, y + d * 0.50, x + hw, baseY);
  }
  /* 一整排山：peaks = [{x,y,w}]，同层合并成一条剪影（避免三角形互相压边） */
  function range(g, peaks, baseY, fill) {
    g.beginPath();
    peaks.forEach(function (p) { peakPath(g, p.x, p.y, p.w, baseY); });
    g.lineTo(peaks[peaks.length - 1].x + peaks[peaks.length - 1].w, baseY + 4);
    g.lineTo(peaks[0].x - peaks[0].w, baseY + 4);
    g.closePath();
    g.fillStyle = fill; g.fill();
  }
  /* 把「雪」压进山体剪影里：每座山一条雪线 + 碎裂的下缘 */
  function snowOnPeaks(g, peaks, baseY, col, shade) {
    peaks.forEach(function (p, i) {
      var d = baseY - p.y;
      var line = d * (0.20 + ((i * 37) % 11) / 60);
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x + p.w * 0.30, p.y + line * 0.72);
      g.lineTo(p.x + p.w * 0.16, p.y + line * 0.55);
      g.lineTo(p.x + p.w * 0.06, p.y + line * 0.86);
      g.lineTo(p.x - p.w * 0.08, p.y + line * 0.60);
      g.lineTo(p.x - p.w * 0.22, p.y + line * 0.92);
      g.lineTo(p.x - p.w * 0.34, p.y + line * 0.66);
      g.closePath();
      g.fillStyle = col; g.fill();
      if (shade) {
        g.save(); g.clip();
        g.fillStyle = shade;
        g.beginPath();
        g.moveTo(p.x, p.y); g.lineTo(p.x + p.w * 0.40, p.y + line * 1.1);
        g.lineTo(p.x + p.w * 0.06, p.y + line * 1.1); g.closePath(); g.fill();
        g.restore();
      }
    });
  }
  /* 一朵柔软的云：多个低透明度椭圆叠出体积 */
  function cloud(g, x, y, w, h, a) {
    for (var i = 0; i < 5; i++) {
      var t = i / 4;
      g.fillStyle = 'rgba(255,255,255,' + (a * (0.34 + 0.22 * Math.sin(t * 3.1))) + ')';
      g.beginPath();
      g.ellipse(x + (t - 0.5) * w * 0.72, y - Math.sin(t * 3.14) * h * 0.42,
        w * (0.24 + 0.16 * Math.sin(t * 3.14)), h * (0.5 + 0.34 * Math.sin(t * 3.14)), 0, 0, 7);
      g.fill();
    }
    g.fillStyle = 'rgba(214,226,240,' + (a * 0.22) + ')';
    g.beginPath(); g.ellipse(x, y + h * 0.30, w * 0.62, h * 0.30, 0, 0, 7); g.fill();
  }
  /* 草地：底色 + 深浅斑 + 草叶（越靠下越大，做出景深） */
  function grassField(g, y0, y1, c0, c1, seed, density) {
    g.fillStyle = lin(g, 0, y0, 0, y1, [0, c0, 1, c1]);
    g.fillRect(0, y0, W, y1 - y0);
    var r = seeded(seed);
    for (var i = 0; i < 26; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(24,48,26,.07)';
      g.beginPath();
      g.ellipse(r() * W, y0 + r() * (y1 - y0), 80 + r() * 190, 16 + r() * 40, 0, 0, 7);
      g.fill();
    }
    var n = density || 240;
    for (var b = 0; b < n; b++) {
      var bx = r() * W, by = y0 + r() * (y1 - y0);
      var k = (by - y0) / (y1 - y0);           // 0 远 → 1 近
      var l = 6 + r() * 8 + k * 20;
      g.strokeStyle = r() > 0.55 ? 'rgba(30,58,32,.30)' : 'rgba(178,208,150,.34)';
      g.lineWidth = 1 + k * 1.6;
      g.beginPath();
      g.moveTo(bx, by);
      g.quadraticCurveTo(bx + (r() - 0.5) * l * 0.5, by - l * 0.65, bx + (r() - 0.5) * l, by - l);
      g.stroke();
    }
  }
  function snowPeak(g, cx, base, half, top, lit, shade, detail) {
    var d = base - top;
    // 每座山给一点自己的偏斜，避免看成一排同款三角形
    var sk = (((cx * 37) % 100) / 100 - 0.5) * 0.26;
    var sx1 = cx + half * (sk - 0.09), sx2 = cx + half * (sk + 0.07);

    /* 山体轮廓：下段外扩、上段收成刃脊。
       用直线/单段二次曲线画出来的侧影是等腰三角，一眼就是剪纸；
       改成双段贝塞尔后，山脚有「坡」、山腰有「背」，才像一座山。 */
    function outline(gg) {
      gg.beginPath();
      gg.moveTo(cx - half, base);
      gg.bezierCurveTo(cx - half * 0.82, base - d * 0.19,
        cx - half * 0.55, base - d * 0.55,
        sx1, top);
      gg.lineTo(sx2, top + d * (0.05 + Math.abs(sk) * 0.06));
      gg.bezierCurveTo(cx + half * 0.56, base - d * 0.53,
        cx + half * 0.84, base - d * 0.19,
        cx + half, base);
      gg.closePath();
    }

    outline(g);
    g.fillStyle = lit; g.fill();

    /* 背光面 */
    g.beginPath();
    g.moveTo(sx2, top + d * (0.05 + Math.abs(sk) * 0.06));
    g.bezierCurveTo(cx + half * 0.56, base - d * 0.53,
      cx + half * 0.84, base - d * 0.19,
      cx + half, base);
    g.lineTo(cx + half * 0.02, base);
    g.closePath();
    g.fillStyle = shade; g.fill();
    /* 背光面不是一块平涂：靠外缘被天光罩住，越往右越亮 */
    var shg = g.createLinearGradient(sx2, 0, cx + half, 0);
    shg.addColorStop(0, 'rgba(255,255,255,0)');
    shg.addColorStop(0.55, 'rgba(236,245,253,.22)');
    shg.addColorStop(1, 'rgba(240,248,255,.52)');
    g.fillStyle = shg; g.fill();

    /* 以下全部裁剪在山体里：接缝渐变 / 体积 / 支脊 */
    g.save();
    outline(g);
    g.clip();

    var seam = g.createLinearGradient(sx2 - half * 0.34, 0, sx2 + half * 0.10, 0);
    seam.addColorStop(0, lit);
    seam.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = seam;
    g.fillRect(sx2 - half * 0.34, top, half * 0.46, d);

    /* 体积：峰顶提一点亮、山脚压一点暗。
       不做这一步，大画幅下整座山就是一块均匀的白，看着像折纸。 */
    var vol = g.createLinearGradient(0, top, 0, base);
    vol.addColorStop(0, 'rgba(255,255,255,.16)');
    vol.addColorStop(0.42, 'rgba(255,255,255,0)');
    vol.addColorStop(1, 'rgba(66,96,134,.22)');
    g.fillStyle = vol;
    g.fillRect(cx - half - 2, top - 2, half * 2 + 4, d + 4);

    /* 支脊：从主脊散下来的几道浅沟，让雪面有走向 */
    g.strokeStyle = 'rgba(122,152,188,.20)';
    g.lineWidth = 1.6;
    for (var sp = 1; sp <= 3; sp++) {
      g.beginPath();
      g.moveTo(sx1 + (sx2 - sx1) * 0.45, top + d * 0.05);
      g.quadraticCurveTo(cx + half * (0.06 + 0.15 * sp), base - d * (0.46 - 0.06 * sp),
        cx + half * (0.22 + 0.12 * sp), base);
      g.stroke();
    }
    /* 背光面内侧再压一道暗，交界处就不那么「剪」 */
    g.strokeStyle = 'rgba(64,96,134,.16)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(sx2, top + d * 0.06);
    g.quadraticCurveTo(cx + half * 0.54, base - d * 0.50, cx + half * 0.92, base);
    g.stroke();
    g.restore();

    /* 主脊的高光 */
    g.strokeStyle = 'rgba(255,255,255,.78)'; g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(sx1, top);
    g.lineTo(sx2, top + d * 0.06);
    g.stroke();

    if (detail) {
      /* 雪面的横纹（很低调，只是打散整片白） */
      g.save();
      outline(g);
      g.clip();
      g.strokeStyle = 'rgba(150,178,208,.10)'; g.lineWidth = 1.1;
      for (var i = 1; i <= 3; i++) {
        var t = i / 4;
        g.beginPath();
        g.moveTo(cx - half * 0.05 * t, top + d * 0.09 * t);
        g.quadraticCurveTo(cx - half * 0.20 * t, base - d * (0.66 - t * 0.14),
          cx - half * (0.26 + t * 0.18), base - d * (0.22 - t * 0.04));
        g.stroke();
      }
      g.restore();
      /* 山脚的碎石：让山「落地」，不再浮在草地上 */
      var rr = (((cx * 91) % 100) / 100);
      for (var rk = 0; rk < 4; rk++) {
        var rx2 = cx + (rr - 0.5) * half * 1.4 + rk * 9 - 14;
        g.fillStyle = 'rgba(96,120,150,.20)';
        g.beginPath();
        g.ellipse(rx2, base - 2 - rk * 1.5, 7 + rk * 2, 3 + rk, 0, 0, 7);
        g.fill();
      }
      g.fillStyle = 'rgba(122,148,180,.16)';
      g.beginPath();
      g.moveTo(cx - half * 0.9, base);
      g.quadraticCurveTo(cx - half * 0.5, base - d * 0.10, cx - half * 0.1, base - d * 0.04);
      g.lineTo(cx + half * 0.4, base);
      g.closePath(); g.fill();
    }
  }

  /* 雪帽：给一个尖峰 (px,py) 加上边缘碎裂的积雪 */
  function snowCap(g, px, py, hw, depth, col, shade) {
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + hw * 0.52, py + depth * 0.46);
    g.lineTo(px + hw * 0.24, py + depth * 0.38);
    g.lineTo(px + hw * 0.06, py + depth * 0.60);
    g.lineTo(px - hw * 0.16, py + depth * 0.42);
    g.lineTo(px - hw * 0.42, py + depth * 0.66);
    g.lineTo(px - hw * 0.62, py + depth * 0.48);
    g.closePath();
    g.fillStyle = col; g.fill();
    if (shade) {
      g.save(); g.clip();
      g.fillStyle = shade;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + hw * 0.62, py + depth * 0.7);
      g.lineTo(px + hw * 0.08, py + depth * 0.7); g.closePath(); g.fill();
      g.restore();
    }
  }
  /* 水面：底色 + 远近不同的细波纹 */
  function water(g, y0, y1, stops) {
    g.fillStyle = lin(g, 0, y0, 0, y1, stops);
    g.fillRect(0, y0, W, y1 - y0);
  }
  function shimmer(g, y0, y1, n, seed, col) {
    var r = seeded(seed);
    g.save();
    g.fillStyle = col || 'rgba(255,255,255,.55)';
    for (var i = 0; i < n; i++) {
      var u = r();
      var y = y0 + Math.pow(r(), 0.62) * (y1 - y0);
      var k = (y - y0) / Math.max(1, y1 - y0);
      var w = (12 + r() * 46) * (0.35 + k * 1.5);
      g.globalAlpha = 0.10 + r() * 0.24;
      g.beginPath();
      g.ellipse(u * W, y, w, 1.1 + k * 2.4, 0, 0, 7);
      g.fill();
    }
    g.restore();
  }
  /* 剪影针叶树 */
  function pine(g, x, y, h, col, snow) {
    var w = h * 0.44;
    g.fillStyle = col;
    for (var i = 0; i < 3; i++) {
      var t = i / 3;
      var tw = w * (1 - t * 0.42), ty = y - h * (0.42 + t * 0.30);
      g.beginPath();
      g.moveTo(x, ty - h * 0.34);
      g.lineTo(x + tw, ty);
      g.lineTo(x - tw, ty);
      g.closePath(); g.fill();
    }
    if (snow) {
      g.fillStyle = 'rgba(255,255,255,.42)';
      for (var j = 0; j < 3; j++) {
        var tt = j / 3;
        var sw = w * (1 - tt * 0.42) * 0.72, sy = y - h * (0.42 + tt * 0.30);
        g.beginPath();
        g.moveTo(x, sy - h * 0.30); g.lineTo(x + sw, sy - h * 0.06); g.lineTo(x - sw, sy - h * 0.06);
        g.closePath(); g.fill();
      }
    }
  }
  function treeTrunk(g, x, y, h, col) {
    g.fillStyle = col || '#4a3524';
    g.fillRect(x - h * 0.035, y - h * 0.3, h * 0.07, h * 0.3);
  }
  /* 棕榈（Doha / KL 用）：粗一点的干、长一点的叶，否则像插了把伞 */
  function palm(g, x, y, h, lean, col, frondCol) {
    // 地面阴影
    g.fillStyle = 'rgba(30,44,34,.22)';
    g.beginPath(); g.ellipse(x + lean * h * 0.16, y + 4, h * 0.12, h * 0.035, 0, 0, 7); g.fill();
    var steps = 10, px = x, py = y, seg = h / steps, pts = [[x, y]];
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      px = x + lean * h * t * t * 0.42;
      py = y - seg * i;
      pts.push([px, py]);
    }
    g.strokeStyle = col || '#7c5b3c';
    g.lineCap = 'round';
    for (var s = 0; s < 3; s++) {                 // 用三条线叠出梯形截面的粗干
      g.lineWidth = Math.max(5, h * 0.055) - s * 2.2;
      g.globalAlpha = s === 0 ? 0.55 : 1;
      g.beginPath();
      g.moveTo(pts[0][0] + s * 2, pts[0][1]);
      for (var j = 1; j < pts.length; j++) g.lineTo(pts[j][0] + s * 2, pts[j][1]);
      g.stroke();
    }
    g.globalAlpha = 1;
    // 干上的横纹
    g.strokeStyle = 'rgba(40,30,20,.28)'; g.lineWidth = 1.4;
    for (var r = 1; r < pts.length - 1; r += 2) {
      g.beginPath();
      g.moveTo(pts[r][0] - h * 0.028, pts[r][1]);
      g.lineTo(pts[r][0] + h * 0.030, pts[r][1] - 1);
      g.stroke();
    }
    // 叶：9 片，长短不一
    var topX = pts[pts.length - 1][0], topY = pts[pts.length - 1][1];
    g.strokeStyle = frondCol || '#3f7d52';
    g.lineCap = 'round';
    for (var f = 0; f < 9; f++) {
      var a = -Math.PI / 2 + (f - 4) * 0.36 + lean * 0.16;
      var L = h * (0.40 - Math.abs(f - 4) * 0.028);
      g.lineWidth = Math.max(2.6, h * 0.022);
      g.beginPath();
      g.moveTo(topX, topY);
      g.quadraticCurveTo(topX + Math.cos(a) * L * 0.62, topY + Math.sin(a) * L * 0.72,
        topX + Math.cos(a) * L, topY + Math.sin(a) * L + L * 0.40);
      g.stroke();
      // 叶脉两侧的小羽片
      g.lineWidth = Math.max(1.4, h * 0.009);
      g.globalAlpha = 0.75;
      for (var k = 1; k <= 3; k++) {
        var tt = k / 4;
        var bx2 = topX + Math.cos(a) * L * tt * 0.92;
        var by2 = topY + Math.sin(a) * L * tt * 0.92 + L * 0.40 * tt * tt;
        g.beginPath();
        g.moveTo(bx2, by2);
        g.lineTo(bx2 + Math.cos(a + 0.9) * L * 0.16, by2 + Math.sin(a + 0.9) * L * 0.16 + L * 0.05);
        g.moveTo(bx2, by2);
        g.lineTo(bx2 + Math.cos(a - 0.9) * L * 0.16, by2 + Math.sin(a - 0.9) * L * 0.16 + L * 0.05);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    // 椰子
    g.fillStyle = 'rgba(70,58,34,.85)';
    g.beginPath(); g.arc(topX - 3, topY + 5, 3.4, 0, 7); g.fill();
    g.beginPath(); g.arc(topX + 3, topY + 6, 3, 0, 7); g.fill();
  }
  /* 上窄下宽的路：用采样点拼多边形，避免「棒棒糖」圆头 */
  function taperedPath(g, p0, p1, p2, p3, w0, w1, fill) {
    var N = 26, L = [], R = [];
    for (var i = 0; i <= N; i++) {
      var t = i / N, mt = 1 - t;
      var x = mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0];
      var y = mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1];
      var dx = 3 * mt * mt * (p1[0] - p0[0]) + 6 * mt * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
      var dy = 3 * mt * mt * (p1[1] - p0[1]) + 6 * mt * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len, ny = dx / len;
      var hw = (w0 + (w1 - w0) * t) / 2;
      L.push([x + nx * hw, y + ny * hw]);
      R.push([x - nx * hw, y - ny * hw]);
    }
    g.beginPath();
    g.moveTo(L[0][0], L[0][1]);
    for (var a = 1; a < L.length; a++) g.lineTo(L[a][0], L[a][1]);
    for (var b = R.length - 1; b >= 0; b--) g.lineTo(R[b][0], R[b][1]);
    g.closePath();
    g.fillStyle = fill; g.fill();
  }

  /* 暖光窗户格 */
  function litWindows(g, x, y, w, h, cols, rows, col, seed) {
    var r = seeded(seed || 7);
    var cw = w / cols, ch = h / rows;
    for (var i = 0; i < cols; i++) {
      for (var j = 0; j < rows; j++) {
        if (r() > 0.55) {
          g.fillStyle = col;
          g.globalAlpha = 0.45 + r() * 0.55;
          g.fillRect(x + i * cw + cw * 0.22, y + j * ch + ch * 0.22, cw * 0.5, ch * 0.42);
        }
      }
    }
    g.globalAlpha = 1;
  }
  function text(g, str, x, y, size, col, align, font) {
    g.save();
    g.font = (font || '600') + ' ' + size + 'px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    g.textAlign = align || 'center';
    g.fillStyle = col; g.fillText(str, x, y);
    g.restore();
  }

  /* ============================================================
   * 地图定义
   * ============================================================ */
  var D = {};
  var ORDER = ['sayram', 'tibet', 'doha', 'wuhan', 'wuhai', 'kl', 'iceland'];

  /* ------------------------------------------------------------
   * 1. 新疆 · 赛里木湖
   *    蓝色湖水 / 环绕雪山 / 开阔草地 / 木质观景台
   * ------------------------------------------------------------ */
  /* ------------------------------------------------------------
   * 1. 新疆 · 赛里木湖
   *    蓝色湖水 / 环绕雪山 / 开阔草地 / 木质观景台
   * ------------------------------------------------------------ */
  D.sayram = {
    id: 'sayram', name: '赛里木湖', sub: '新疆 · 博尔塔拉',
    card: '蓝色的湖水，远处的雪山。风把草吹得很轻。',
    arrive: '🚉 赛里木湖的风是凉的，湖很蓝。',
    line: '风把湖面吹皱，雪山一直站在那儿。',
    w: W, h: 1200,
    walk: { y0: 900, y1: 1150 },
    spawn: { x: 360, y: 1040, dir: 1 },
    exitPos: { x: 196, y: 1074 },
    view: {
      x: 1036, y: 916, r: 108, label: '🌅 一起看湖',
      lines: [
        '你们并排站在木栈道边。湖面像一块很大的蓝色玻璃。',
        '远处的雪山把影子搁在水里，风一过，整片蓝色都在轻轻晃。',
        '「以后还来。」——不用说得太大声，湖也听得见。'
      ]
    },
    eggPos: { x: 1160, y: 862 },
    ticket: { no: '01', code: 'SRM', color: '#2f7fb8', ink: '#0b2740', paper: '#e8f3fa',
      cond: [{ type: 'free' }],
      hint: '走到车站，第一张票就在你手上。' },
    spots: [
      { x: 860, y: 1030, r: 86, label: '📷 在栈道上合影' },
      { x: 700, y: 1012, r: 86, label: '📷 在湖边合影' }
    ],
    obstacles: [
      { x: 976, y: 752, w: 366, h: 116 },
      { x: 300, y: 946, w: 132, h: 74 },
      { x: 1372, y: 996, w: 118, h: 70 }
    ],
    paint: function (g, mode) {
      var full = mode !== 'thumb';
      var HH = 1200;

      /* --- 天空 --- */
      g.fillStyle = lin(g, 0, 0, 0, 400, [
        0, '#2a68a6', 0.22, '#4a8ac2', 0.48, '#7db0d8', 0.72, '#aed0e8', 0.9, '#dcebf6', 1, '#f4fafd'
      ]);
      g.fillRect(0, 0, W, 610);   // 必须盖住山脚，否则山与山之间会露出画布底色
      bloom(g, 1200, 92, 320, 'rgba(255,246,212,.40)', 0.9);
      bloom(g, 1200, 92, 84, 'rgba(255,252,236,.9)', 0.9);
      g.fillStyle = 'rgba(255,254,246,.95)';
      g.beginPath(); g.arc(1200, 92, 17, 0, 7); g.fill();
      cloud(g, 280, 128, 470, 22, 0.9);
      cloud(g, 760, 176, 330, 18, 0.68);
      cloud(g, 1080, 240, 390, 20, 0.5);
      cloud(g, 1400, 140, 240, 15, 0.46);
      if (full) {
        var rcs = seeded(9);
        for (var cs = 0; cs < 20; cs++) {
          g.fillStyle = 'rgba(255,255,255,' + (0.04 + rcs() * 0.05) + ')';
          g.beginPath();
          g.ellipse(rcs() * W, 80 + rcs() * 260, 130 + rcs() * 230, 4 + rcs() * 6, 0, 0, 7);
          g.fill();
        }
      }

      /* --- 雪山：整座山就是雪，右半边是背光面 --- */
      var MB = 588;
      [[70, 336, 118], [230, 316, 126], [400, 344, 112], [560, 308, 130], [730, 330, 120],
      [900, 312, 128], [1060, 342, 114], [1220, 320, 126], [1380, 344, 118]].forEach(function (p) {
        snowPeak(g, p[0], MB, p[2], p[1], 'rgba(206,222,240,.85)', 'rgba(172,196,222,.85)', false);
      });
      [[140, 400, 140], [380, 388, 150], [620, 404, 140], [860, 386, 150], [1100, 402, 142], [1330, 390, 146]].forEach(function (p) {
        snowPeak(g, p[0], MB + 4, p[2], p[1], 'rgba(146,172,201,.95)', 'rgba(116,142,174,.95)', true);
      });
      snowPeak(g, 300, MB + 8, 176, 372, '#fdfeff', '#bccfe4', true);
      snowPeak(g, 690, MB + 8, 190, 356, '#fbfdff', '#b5cbe1', true);
      snowPeak(g, 1090, MB + 8, 180, 378, '#f9fcff', '#b8cce2', true);
      snowPeak(g, 1420, MB + 8, 168, 366, '#fbfdff', '#b6cbe1', true);
      g.fillStyle = lin(g, 0, 496, 0, 600, [0, 'rgba(226,240,252,0)', 0.55, 'rgba(228,241,252,.44)', 1, 'rgba(238,247,254,.86)']);
      g.fillRect(0, 496, W, 104);

      /* 雪山接地的一层薄雾：不然一排山都坐在同一条直线上 */
      g.fillStyle = lin(g, 0, 512, 0, 646, [0, 'rgba(226,240,252,0)', 0.42, 'rgba(228,241,252,.46)', 1, 'rgba(232,244,253,.14)']);
      g.fillRect(0, 512, W, 134);

      /* --- 对岸的草线 + 三顶小毡房 --- */
      g.fillStyle = 'rgba(82,118,94,.40)';
      g.beginPath();
      g.moveTo(-10, 572);
      g.bezierCurveTo(W * 0.28, 564, W * 0.62, 578, W + 10, 568);
      g.lineTo(W + 10, 590); g.lineTo(-10, 594); g.closePath(); g.fill();
      [[258, 571], [306, 568], [356, 572]].forEach(function (y2) {
        g.fillStyle = '#f3f6f2';
        g.beginPath(); g.arc(y2[0], y2[1], 10, Math.PI, 0); g.rect(y2[0] - 10, y2[1] - 1, 20, 8); g.fill();
        g.fillStyle = 'rgba(124,146,166,.36)';
        g.beginPath(); g.arc(y2[0], y2[1] - 1, 10, Math.PI * 0.1, Math.PI * 0.82); g.fill();
      });

      /* --- 湖水 --- */
      water(g, 578, 940, [
        0, '#d6eaf6', 0.04, '#b3d5ec', 0.16, '#88bcdf', 0.38, '#5fa2cf', 0.62, '#4388bb', 0.84, '#3475a8', 1, '#2a6597'
      ]);
      g.fillStyle = lin(g, 0, 580, 0, 690, [0, 'rgba(242,251,255,.66)', 1, 'rgba(242,251,255,0)']);
      g.fillRect(0, 580, W, 110);
      g.save();
      g.globalCompositeOperation = 'multiply';
      [[300, 176], [690, 190], [1090, 180], [1420, 168]].forEach(function (p) {
        var rw = p[1] * 0.5;
        var grd = g.createLinearGradient(p[0] - rw, 0, p[0] + rw, 0);
        grd.addColorStop(0, 'rgba(255,255,255,0)');
        grd.addColorStop(0.5, 'rgba(116,150,180,.24)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(p[0] - rw, 588, rw * 2, 92);
      });
      g.restore();
      shimmer(g, 590, 930, full ? 230 : 60, 33, 'rgba(255,255,255,.85)');
      for (var wv = 0; wv < 10; wv++) {
        var wy = 620 + wv * 30;
        g.fillStyle = 'rgba(255,255,255,' + (0.045 + wv * 0.006) + ')';
        g.fillRect(0, wy, W, 1.4 + wv * 0.6);
        g.fillStyle = 'rgba(32,80,128,' + (0.035 + wv * 0.005) + ')';
        g.fillRect(0, wy + 5, W, 2 + wv * 0.7);
      }
      g.fillStyle = lin(g, 0, 800, 0, 940, [0, 'rgba(134,202,206,0)', 1, 'rgba(152,216,208,.55)']);
      g.fillRect(0, 800, W, 140);

      /* --- 湖岸草地 --- */
      var shoreY = function (x) {
        var u = x / W;
        return 848 + Math.sin(u * 5.4 + 0.7) * 24 + Math.sin(u * 2.3) * 12;
      };
      g.beginPath();
      g.moveTo(-10, shoreY(0));
      for (var sx = 0; sx <= W; sx += 30) g.lineTo(sx, shoreY(sx));
      g.lineTo(W + 10, HH + 10); g.lineTo(-10, HH + 10);
      g.closePath();
      g.save();
      g.clip();
      grassField(g, 850, HH, '#7dab68', '#3f6849', 77, full ? 560 : 90);
      var rf = seeded(303);
      for (var f = 0; f < (full ? 190 : 40); f++) {
        var fx = rf() * W, fy = 900 + rf() * 300;
        var fc = rf(), kk = (fy - 900) / 300;
        g.fillStyle = fc > 0.72 ? '#f8f4e4' : (fc > 0.44 ? '#f0cb56' : '#b9a8e0');
        g.beginPath(); g.arc(fx, fy, 1.2 + rf() * 1.1 + kk * 2.0, 0, 7); g.fill();
      }
      var rgn = seeded(515);
      for (var t2 = 0; t2 < (full ? 34 : 8); t2++) {
        var gx2 = rgn() * W, gy2 = 1120 + rgn() * 70, len = 30 + rgn() * 48;
        g.strokeStyle = 'rgba(32,64,38,.38)'; g.lineWidth = 2.8;
        for (var b2 = -2; b2 <= 2; b2++) {
          g.beginPath(); g.moveTo(gx2 + b2 * 4, gy2);
          g.quadraticCurveTo(gx2 + b2 * 8 + rgn() * 7, gy2 - len * 0.6, gx2 + b2 * 13 + rgn() * 11, gy2 - len);
          g.stroke();
        }
      }
      g.restore();
      g.strokeStyle = 'rgba(240,249,243,.85)'; g.lineWidth = 4;
      g.beginPath();
      g.moveTo(-10, shoreY(0));
      for (var sx2 = 0; sx2 <= W; sx2 += 30) g.lineTo(sx2, shoreY(sx2));
      g.stroke();
      g.strokeStyle = 'rgba(178,206,186,.45)'; g.lineWidth = 8;
      g.beginPath();
      g.moveTo(-10, shoreY(0) + 8);
      for (var sx3 = 0; sx3 <= W; sx3 += 30) g.lineTo(sx3, shoreY(sx3) + 8);
      g.stroke();
      var rpb = seeded(808);
      for (var pb = 0; pb < (full ? 100 : 16); pb++) {
        var bx3 = rpb() * W;
        var by3 = shoreY(bx3) - 2 + rpb() * 14;
        g.fillStyle = rpb() > 0.5 ? 'rgba(202,212,204,.8)' : 'rgba(154,168,160,.75)';
        g.beginPath(); g.ellipse(bx3, by3, 2 + rpb() * 4, 1.3 + rpb() * 2.2, 0, 0, 7); g.fill();
      }

      /* --- 木质观景台（前缘搭在水面上） --- */
      var dk = { x: 986, y: 756, w: 348, h: 100 };
      g.fillStyle = 'rgba(28,54,74,.26)';
      g.beginPath(); g.ellipse(dk.x + dk.w * 0.55, dk.y + dk.h + 22, dk.w * 0.5, 16, 0, 0, 7); g.fill();
      g.fillStyle = '#6b4a32';
      [0, 1, 2, 3].forEach(function (i) { g.fillRect(dk.x + 26 + i * 96, dk.y + dk.h - 2, 11, 34); });
      g.fillStyle = lin(g, 0, dk.y, 0, dk.y + dk.h, [0, '#cba578', 0.55, '#b68b5f', 1, '#8b6544']);
      g.fillRect(dk.x, dk.y, dk.w, dk.h);
      g.strokeStyle = 'rgba(66,44,26,.30)'; g.lineWidth = 2;
      for (var p2 = 0; p2 < 8; p2++) {
        var py2 = dk.y + 9 + p2 * 12;
        g.beginPath(); g.moveTo(dk.x + 3, py2); g.lineTo(dk.x + dk.w - 3, py2); g.stroke();
      }
      g.fillStyle = 'rgba(255,242,216,.24)'; g.fillRect(dk.x, dk.y, dk.w, 4);
      g.fillStyle = 'rgba(44,30,18,.26)'; g.fillRect(dk.x, dk.y + dk.h - 4, dk.w, 4);
      g.strokeStyle = '#7a5636'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(dk.x + 2, dk.y - 28); g.lineTo(dk.x + dk.w - 2, dk.y - 28); g.stroke();
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(dk.x + 2, dk.y - 12); g.lineTo(dk.x + dk.w - 2, dk.y - 12); g.stroke();
      for (var rp = 0; rp < 8; rp++) {
        g.fillStyle = '#6b4a32';
        g.fillRect(dk.x + 10 + rp * 46, dk.y - 30, 6, 32);
        g.fillStyle = 'rgba(255,240,214,.26)';
        g.fillRect(dk.x + 10 + rp * 46, dk.y - 30, 2, 32);
      }
      g.fillStyle = '#7a5636'; g.fillRect(dk.x + 62, dk.y + 50, 7, 14); g.fillRect(dk.x + 140, dk.y + 50, 7, 14);
      g.fillStyle = '#a5794e'; g.fillRect(dk.x + 56, dk.y + 41, 96, 9);
      g.fillStyle = '#cba578'; g.fillRect(dk.x + 56, dk.y + 30, 96, 8);
      g.fillStyle = '#5b3f28'; g.fillRect(dk.x + dk.w - 30, dk.y + 26, 5, 26);
      bloom(g, dk.x + dk.w - 27, dk.y + 20, 28, 'rgba(255,214,130,.5)', 0.9);
      g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(dk.x + dk.w - 27, dk.y + 20, 6, 0, 7); g.fill();

      /* --- 岸边大石头 --- */
      function rock(bx, by, rw, rh, c1, c2) {
        g.fillStyle = 'rgba(38,58,58,.18)';
        g.beginPath(); g.ellipse(bx + rw * 0.12, by + rh * 0.16, rw * 1.02, rh * 0.32, 0, 0, 7); g.fill();
        g.fillStyle = c1;
        g.beginPath();
        g.moveTo(bx - rw, by);
        g.quadraticCurveTo(bx - rw * 0.92, by - rh * 1.06, bx - rw * 0.16, by - rh * 1.04);
        g.quadraticCurveTo(bx + rw * 0.72, by - rh * 0.98, bx + rw, by - rh * 0.12);
        g.quadraticCurveTo(bx + rw * 1.02, by + rh * 0.1, bx, by + rh * 0.12);
        g.closePath(); g.fill();
        g.fillStyle = c2;
        g.beginPath();
        g.moveTo(bx + rw * 0.06, by - rh * 0.96);
        g.quadraticCurveTo(bx + rw * 0.82, by - rh * 0.84, bx + rw, by - rh * 0.1);
        g.quadraticCurveTo(bx + rw * 0.36, by - rh * 0.30, bx + rw * 0.06, by - rh * 0.96);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,.2)';
        g.beginPath(); g.ellipse(bx - rw * 0.3, by - rh * 0.84, rw * 0.28, rh * 0.13, -0.2, 0, 7); g.fill();
      }
      rock(352, 972, 62, 34, '#8a949e', '#c2ccd4');
      rock(432, 990, 44, 23, '#828c96', '#b6c0c9');
      rock(1428, 1022, 56, 30, '#8e98a2', '#c0c9d1');

      /* 岸边的碎石与水草：让水陆交界有东西「咬住」，不然就是蓝绿两块色 */
      var rsh = seeded(404);
      for (var sb = 0; sb < (full ? 52 : 14); sb++) {
        var bx3 = rsh() * W;
        var by3 = shoreY(bx3) + 2 + rsh() * 28;
        if (rsh() > 0.54) {
          g.fillStyle = 'rgba(150,160,150,.5)';
          g.beginPath(); g.ellipse(bx3, by3, 3 + rsh() * 7, 2 + rsh() * 3, 0, 0, 7); g.fill();
        } else {
          g.strokeStyle = 'rgba(96,120,78,.45)'; g.lineWidth = 1.4;
          for (var rdi = -2; rdi <= 2; rdi++) {
            g.beginPath(); g.moveTo(bx3 + rdi * 2, by3 + 4);
            g.quadraticCurveTo(bx3 + rdi * 3, by3 - 6, bx3 + rdi * 7, by3 - 15 - rsh() * 8);
            g.stroke();
          }
        }
      }

      /* --- 回小镇的路牌 --- */
      g.fillStyle = 'rgba(38,58,58,.16)';
      g.beginPath(); g.ellipse(212, 1092, 26, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#6b4a32'; g.fillRect(206, 1004, 9, 88);
      g.fillStyle = '#cba578';
      g.beginPath();
      g.moveTo(212, 1010); g.lineTo(302, 1014); g.lineTo(290, 1033); g.lineTo(212, 1031);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(66,44,26,.5)'; g.lineWidth = 2; g.stroke();
      text(g, '小镇', 252, 1028, 15, '#4a3020');
      g.fillStyle = 'rgba(246,250,255,.85)';
      g.beginPath(); g.ellipse(210, 1000, 12, 4, 0, 0, 7); g.fill();

      if (full) {
        vignette(g, 0.30, 'rgba(10,26,46,.38)');
        grain(g, 1000, 11);
      }
    },
    anim: function (ctx, t) {
      /* 湖面反光：一条被风吹碎的亮带 */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 9; i++) {
        var y = 560 + i * 24;
        var w = 60 + Math.sin(t / 1400 + i) * 26;
        ctx.fillStyle = 'rgba(255,252,232,.05)';
        ctx.beginPath();
        ctx.ellipse(1210 + Math.sin(t / 2200 + i * 0.7) * 34, y, w, 5, 0, 0, 7);
        ctx.fill();
      }
      ctx.restore();
      /* 三只慢慢滑过的鸟 */
      ctx.strokeStyle = 'rgba(46,66,90,.5)'; ctx.lineWidth = 2;
      for (var b = 0; b < 3; b++) {
        var bx = ((t / 90 + b * 340) % 1900) - 200;
        var by = 250 + b * 34 + Math.sin(t / 900 + b) * 8;
        var s = 7 - b * 1.4;
        ctx.beginPath();
        ctx.moveTo(bx - s, by); ctx.quadraticCurveTo(bx - s * 0.4, by - s * 0.7, bx, by);
        ctx.quadraticCurveTo(bx + s * 0.4, by - s * 0.7, bx + s, by);
        ctx.stroke();
      }
    }
  };

  /* ------------------------------------------------------------
   * 2. 西藏 · 高原雪山
   *    壮阔雪山 / 经幡 / 石堆 / 蜿蜒山路 / 藏式歇脚点
   * ------------------------------------------------------------ */
  D.tibet = {
    id: 'tibet', name: '西藏', sub: '高原 · 雪山',
    card: '高原的天很蓝，雪山很近。走几步就要喘口气。',
    arrive: '🚉 到了。这里的风又干又亮，云跑得很快。',
    line: '慢一点走，这里的空气薄。',
    w: W, h: 1200,
    walk: { y0: 840, y1: 1150 },
    spawn: { x: 700, y: 1030, dir: 1 },
    exitPos: { x: 196, y: 1092 },
    view: {
      x: 512, y: 902, r: 112, label: '🏔 一起看雪山',
      lines: [
        '你们站住了。前面那座雪山亮得有点晃眼。',
        '经幡被风吹得噼啪响，一下一下，像有人在数拍子。',
        '这里每走两步就要喘一口气——所以慢一点，正好可以多看一会儿。'
      ]
    },
    eggPos: { x: 352, y: 884 },
    ticket: { no: '02', code: 'TBT', color: '#b8452f', ink: '#3a1410', paper: '#f7ece4',
      cond: [{ type: 'mem', n: 2 }, { type: 'talk', n: 2 }],
      hint: '再收两段回忆，或者和镇上的两个人多说说话。' },
    spots: [
      { x: 700, y: 950, r: 86, label: '📷 在经幡前合影' },
      { x: 878, y: 1002, r: 86, label: '📷 在山路转弯处合影' }
    ],
    obstacles: [
      { x: 1150, y: 660, w: 232, h: 130 },
      { x: 286, y: 872, w: 130, h: 62 },
      { x: 460, y: 786, w: 14, h: 60 },
      { x: 968, y: 748, w: 14, h: 60 }
    ],
    paint: function (g, mode) {
      var full = mode !== 'thumb';
      var HH = 1200;
      /* 天空：高原的蓝更深 */
      g.fillStyle = lin(g, 0, 0, 0, 620, [
        0, '#1e4b86', 0.2, '#31649f', 0.44, '#5b8cbd', 0.66, '#93b7d4', 0.84, '#c8dce9', 1, '#e9f2f7'
      ]);
      g.fillRect(0, 0, W, 630);
      // 高空卷云
      var rc = seeded(41);
      for (var c = 0; c < 12; c++) {
        g.fillStyle = 'rgba(255,255,255,' + (0.10 + rc() * 0.16) + ')';
        g.beginPath();
        g.ellipse(rc() * W, 90 + rc() * 240, 110 + rc() * 220, 4 + rc() * 8, -0.06, 0, 7);
        g.fill();
      }
      // 雪山
      var MB = 612;
      [[90, 388, 130], [250, 356, 140], [420, 400, 124], [590, 344, 146], [760, 386, 132],
      [930, 344, 148], [1100, 396, 130], [1270, 358, 142], [1430, 400, 126]].forEach(function (p) {
        snowPeak(g, p[0], MB, p[2], p[1], 'rgba(214,228,242,.82)', 'rgba(176,199,222,.82)', false);
      });
      [[170, 452, 150], [430, 436, 160], [700, 456, 146], [960, 430, 162], [1230, 452, 150], [1450, 440, 140]].forEach(function (p) {
        snowPeak(g, p[0], MB + 4, p[2], p[1], 'rgba(150,175,203,.95)', 'rgba(118,144,176,.95)', true);
      });
      snowPeak(g, 380, MB + 10, 200, 414, '#fdfeff', '#b7cce2', true);
      snowPeak(g, 1040, MB + 10, 214, 396, '#fbfdff', '#b3c9e0', true);
      snowPeak(g, 1420, MB + 10, 180, 424, '#fbfdff', '#b6cbe1', true);
      // 山脚雾
      g.fillStyle = lin(g, 0, 540, 0, 632, [0, 'rgba(226,240,252,0)', 0.6, 'rgba(226,240,250,.40)', 1, 'rgba(236,246,252,.82)']);
      g.fillRect(0, 540, W, 92);

      /* 高原谷地：顶边是一道缓坡（不是一条直线），
         否则山脚和草地之间会出现一条生硬的横缝，看起来像两块色卡拼接。 */
      g.beginPath();
      g.moveTo(-10, 636);
      g.bezierCurveTo(W * 0.20, 600, W * 0.34, 626, W * 0.52, 610);
      g.bezierCurveTo(W * 0.70, 594, W * 0.86, 622, W + 10, 606);
      g.lineTo(W + 10, HH + 10); g.lineTo(-10, HH + 10);
      g.closePath();
      g.fillStyle = lin(g, 0, 596, 0, HH, [0, '#9aa374', 0.14, '#8d9a68', 0.42, '#7e8c5c', 1, '#68774e']);
      g.fill();
      /* 山坡接地的一层薄雾，把山脚揉进草里 */
      g.fillStyle = lin(g, 0, 552, 0, 712, [0, 'rgba(230,241,250,0)', 0.30, 'rgba(232,242,251,.52)', 0.62, 'rgba(232,242,251,.22)', 1, 'rgba(230,241,250,0)']);
      g.fillRect(0, 552, W, 160);
      // 远坡的草甸色块
      var rg = seeded(63);
      for (var i = 0; i < 26; i++) {
        g.fillStyle = rg() > 0.5 ? 'rgba(160,168,116,.35)' : 'rgba(96,108,70,.28)';
        g.beginPath();
        g.ellipse(rg() * W, 640 + rg() * 480, 90 + rg() * 200, 18 + rg() * 44, 0, 0, 7);
        g.fill();
      }
      // 一条蜿蜒的山路（上窄下宽，远端消失在地形里）
      taperedPath(g, [760, 560], [700, 720], [880, 800], [800, 900], 18, 96, '#b7a97f');
      taperedPath(g, [800, 900], [730, 990], [850, 1080], [820, 1220], 96, 124, '#b7a97f');
      taperedPath(g, [760, 560], [700, 720], [880, 800], [800, 900], 8, 52, 'rgba(206,196,166,.55)');
      taperedPath(g, [800, 900], [730, 990], [850, 1080], [820, 1220], 52, 70, 'rgba(206,196,166,.5)');
      // 路面被踩出的两道浅痕
      g.save();
      g.strokeStyle = 'rgba(150,138,110,.35)'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(772, 640); g.bezierCurveTo(720, 730, 890, 812, 826, 906);
      g.stroke();
      g.beginPath();
      g.moveTo(826, 906); g.bezierCurveTo(766, 992, 862, 1082, 838, 1210);
      g.stroke();
      g.restore();
      // 碎石与草丛
      var rs = seeded(77);
      for (var s2 = 0; s2 < (full ? 240 : 50); s2++) {
        var sx = rs() * W, sy = 620 + rs() * 570;
        var k2 = (sy - 620) / 570;
        if (rs() > 0.55) {
          g.fillStyle = 'rgba(178,170,146,.6)';
          g.beginPath(); g.ellipse(sx, sy, 1.6 + rs() * 3.4, 1.2 + rs() * 2.2, 0, 0, 7); g.fill();
        } else {
          g.strokeStyle = 'rgba(88,102,60,.35)'; g.lineWidth = 1 + k2 * 1.4;
          g.beginPath(); g.moveTo(sx, sy);
          g.quadraticCurveTo(sx + 2, sy - 4 - k2 * 6, sx + 5, sy - 8 - k2 * 12);
          g.stroke();
        }
      }

      /* 藏式歇脚的石屋 */
      var hx = 1150, hy = 660, hw = 232, hh = 130;
      g.fillStyle = 'rgba(50,40,26,.22)';
      g.beginPath(); g.ellipse(hx + hw / 2 + 16, hy + hh + 8, hw * 0.56, 16, 0, 0, 7); g.fill();
      // 石砌墙身
      g.fillStyle = lin(g, 0, hy, 0, hy + hh, [0, '#f2ece0', 0.55, '#e2d9c8', 1, '#c9bfa9']);
      g.fillRect(hx, hy + 26, hw, hh - 26);
      // 石块纹理
      var rh = seeded(88);
      for (var hb = 0; hb < 60; hb++) {
        g.fillStyle = 'rgba(150,138,118,' + (0.10 + rh() * 0.16) + ')';
        g.beginPath();
        g.ellipse(hx + 6 + rh() * (hw - 12), hy + 34 + rh() * (hh - 44), 3 + rh() * 8, 2 + rh() * 4, 0, 0, 7);
        g.fill();
      }
      // 顶部的暗红檐带 + 白色女儿墙
      g.fillStyle = '#8c3b2e'; g.fillRect(hx - 8, hy + 14, hw + 16, 14);
      g.fillStyle = '#efe7d8'; g.fillRect(hx - 10, hy, hw + 20, 16);
      g.strokeStyle = 'rgba(80,64,44,.35)'; g.lineWidth = 1.6;
      g.strokeRect(hx - 10, hy, hw + 20, 16);
      // 窗（梯形窗套、黑框）
      [0, 1, 2].forEach(function (i) {
        var wx = hx + 30 + i * 70, wy = hy + 58;
        g.fillStyle = '#2c2622';
        g.beginPath();
        g.moveTo(wx, wy + 34); g.lineTo(wx + 34, wy + 34);
        g.lineTo(wx + 30, wy); g.lineTo(wx + 4, wy);
        g.closePath(); g.fill();
        g.strokeStyle = '#f7f2e8'; g.lineWidth = 5;
        g.beginPath();
        g.moveTo(wx - 2, wy + 36); g.lineTo(wx + 36, wy + 36);
        g.lineTo(wx + 31, wy - 2); g.lineTo(wx + 3, wy - 2);
        g.closePath(); g.stroke();
        g.fillStyle = 'rgba(255,214,150,.55)';
        g.fillRect(wx + 8, wy + 8, 18, 20);
      });
      // 门
      g.fillStyle = '#4a3324'; g.fillRect(hx + hw / 2 - 22, hy + 92, 44, 38);
      g.fillStyle = '#8c3b2e'; g.fillRect(hx + hw / 2 - 26, hy + 86, 52, 10);
      // 门口的小石阶
      g.fillStyle = '#cfc6b2';
      g.fillRect(hx + hw / 2 - 30, hy + hh, 60, 8);
      // 屋角的一小段石墙
      g.fillStyle = '#d8cfba';
      g.fillRect(hx - 74, hy + 74, 74, 56);
      g.strokeStyle = 'rgba(120,108,88,.4)'; g.lineWidth = 1.4;
      for (var wl = 0; wl < 4; wl++) {
        g.beginPath();
        g.moveTo(hx - 74, hy + 86 + wl * 12); g.lineTo(hx, hy + 86 + wl * 12);
        g.stroke();
      }

      /* 经幡：两根木杆拉出的两串 */
      function flagLine(x1, y1, x2, y2, sag, n) {
        g.strokeStyle = 'rgba(60,48,34,.8)'; g.lineWidth = 2.4;
        g.beginPath(); g.moveTo(x1, y1);
        g.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + sag, x2, y2);
        g.stroke();
        var cols = ['#c94b3c', '#e8b53f', '#3f7fc0', '#4f9b5c', '#f2ecdf'];
        for (var i = 0; i < n; i++) {
          var t = (i + 0.5) / n;
          var fx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * ((x1 + x2) / 2) + t * t * x2;
          var fy = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * ((y1 + y2) / 2 + sag) + t * t * y2;
          g.fillStyle = cols[i % 5];
          g.beginPath();
          g.moveTo(fx - 9, fy); g.lineTo(fx + 9, fy);
          g.lineTo(fx + 7, fy + 20); g.lineTo(fx - 7, fy + 20);
          g.closePath(); g.fill();
          g.strokeStyle = 'rgba(70,54,36,.35)'; g.lineWidth = 0.8; g.stroke();
        }
      }
      // 木杆
      [[460, 786], [968, 748]].forEach(function (p) {
        g.fillStyle = 'rgba(50,40,26,.2)';
        g.beginPath(); g.ellipse(p[0] + 4, p[1] + 2, 12, 4, 0, 0, 7); g.fill();
        g.fillStyle = '#6b5134'; g.fillRect(p[0] - 7, p[1] - 168, 14, 168);
        g.fillStyle = 'rgba(255,240,210,.18)'; g.fillRect(p[0] - 7, p[1] - 168, 4, 168);
        g.fillStyle = '#4f3b26';
        g.beginPath(); g.moveTo(p[0] - 4, p[1] - 168); g.lineTo(p[0] + 4, p[1] - 168); g.lineTo(p[0], p[1] - 184); g.closePath(); g.fill();
        // 杆顶的一小簇经幡
        g.fillStyle = '#e8b53f'; g.fillRect(p[0] - 6, p[1] - 196, 12, 12);
      });
      flagLine(460, 622, 968, 590, 56, 11);
      flagLine(460, 668, 968, 636, 44, 9);

      /* 玛尼石堆 */
      (function () {
        var cx = 330, by = 930;
        g.fillStyle = 'rgba(50,40,26,.2)';
        g.beginPath(); g.ellipse(cx, by + 4, 56, 14, 0, 0, 7); g.fill();
        var stones = [[0, 0, 52, 26], [-8, -24, 42, 21], [6, -44, 33, 17], [-4, -60, 24, 13], [2, -72, 15, 9]];
        stones.forEach(function (s3, i) {
          g.fillStyle = i % 2 ? '#a89e8a' : '#b8ae98';
          g.beginPath();
          g.ellipse(cx + s3[0], by + s3[1] - s3[3] / 2, s3[2] / 2, s3[3] / 2, 0, 0, 7);
          g.fill();
          g.fillStyle = 'rgba(255,250,236,.35)';
          g.beginPath();
          g.ellipse(cx + s3[0] - s3[2] * 0.12, by + s3[1] - s3[3] * 0.75, s3[2] * 0.26, s3[3] * 0.16, 0, 0, 7);
          g.fill();
        });
        // 石堆上系的小经幡
        g.strokeStyle = 'rgba(60,48,34,.6)'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(cx, by - 78); g.lineTo(cx + 40, by - 60); g.stroke();
        ['#c94b3c', '#e8b53f', '#3f7fc0'].forEach(function (c2, i) {
          g.fillStyle = c2;
          g.fillRect(cx + 8 + i * 12, by - 72 + i * 6, 8, 12);
        });
      })();

      /* 回小镇的方向牌 */
      g.fillStyle = 'rgba(50,40,26,.18)';
      g.beginPath(); g.ellipse(206, 1102, 24, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#6b5134'; g.fillRect(200, 1010, 9, 92);
      g.fillStyle = '#cfc0a0';
      g.beginPath();
      g.moveTo(206, 1016); g.lineTo(298, 1020); g.lineTo(286, 1040); g.lineTo(206, 1038);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(70,54,36,.5)'; g.lineWidth = 2; g.stroke();
      text(g, '小镇', 248, 1035, 15, '#4a3020');

      if (full) { vignette(g, 0.30, 'rgba(14,24,38,.40)'); grain(g, 1000, 13); }
    },
    anim: function (ctx, t) {
      /* 经幡一直在抖（很轻，几帧一次就够） */
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (var i = 0; i < 10; i++) {
        var x = 480 + i * 50, y = 616 + Math.sin(i * 0.8) * 8;
        var s = Math.sin(t / 260 + i) * 2.4;
        ctx.fillStyle = ['#c94b3c', '#e8b53f', '#3f7fc0', '#4f9b5c', '#f2ecdf'][i % 5];
        ctx.beginPath();
        ctx.moveTo(x - 2 + s, y); ctx.lineTo(x + 3 + s, y);
        ctx.lineTo(x + 2 + s, y + 4); ctx.lineTo(x - 3 + s, y + 4);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      /* 一只慢慢盘旋的鹰 */
      ctx.strokeStyle = 'rgba(40,44,52,.45)'; ctx.lineWidth = 2;
      var bx = 700 + Math.cos(t / 5200) * 260, by = 330 + Math.sin(t / 5200) * 40;
      var s2 = 12;
      ctx.beginPath();
      ctx.moveTo(bx - s2, by); ctx.quadraticCurveTo(bx - s2 * 0.4, by - s2 * 0.6, bx, by);
      ctx.quadraticCurveTo(bx + s2 * 0.4, by - s2 * 0.6, bx + s2, by);
      ctx.stroke();
    }
  };

  /* ------------------------------------------------------------
   * 3. 多哈 · 海湾与天际线
   * ------------------------------------------------------------ */
  D.doha = {
    id: 'doha', name: '多哈', sub: '卡塔尔 · 波斯湾',
    card: '傍晚的海滨大道，玻璃楼把晚霞反射成沙金色。',
    arrive: '🚉 多哈的晚风是暖的，海面上一层金。',
    line: '路灯一盏一盏亮起来，海是暖的。',
    w: W, h: 1200,
    walk: { y0: 862, y1: 1150 },
    spawn: { x: 420, y: 1030, dir: 1 },
    exitPos: { x: 200, y: 1094 },
    view: {
      x: 760, y: 880, r: 104, label: '🌇 靠着栏杆看湾',
      lines: [
        '你们靠在白色栏杆上。对岸的楼一层层亮起来，像有人在天际线上点蜡烛。',
        '海风把白天的热气吹散了，水面把灯光揉成一条条金色的线。',
        '「这里的晚上，比我拍的照片好看。」——那就别看照片了。'
      ]
    },
    eggPos: { x: 1124, y: 908 },
    ticket: { no: '03', code: 'DOH', color: '#c08b4a', ink: '#3a2410', paper: '#faf1e2',
      cond: [{ type: 'cocoa', n: 1 }, { type: 'mem', n: 4 }],
      hint: '去咖啡店喝一杯热可可，或者把回忆册再收厚一点。' },
    spots: [
      { x: 962, y: 962, r: 86, label: '📷 在海滨步道合影' },
      { x: 1078, y: 992, r: 86, label: '📷 在棕榈树下合影' }
    ],
    obstacles: [
      { x: 1096, y: 906, w: 96, h: 40 },
      { x: 300, y: 830, w: 26, h: 60 },
      { x: 900, y: 812, w: 26, h: 60 },
      { x: 566, y: 986, w: 120, h: 54 }
    ],
    paint: function (g, mode) {
      var full = mode !== 'thumb';
      var HH = 1200;
      /* 落日的天 */
      g.fillStyle = lin(g, 0, 0, 0, 600, [
        0, '#8f5f7e', 0.18, '#c47a72', 0.38, '#e79b6f', 0.58, '#f6c189', 0.76, '#fbdcae', 0.9, '#fdeed2', 1, '#fff8ea'
      ]);
      g.fillRect(0, 0, W, 610);
      bloom(g, 980, 512, 420, 'rgba(255,214,140,.55)', 0.85);
      bloom(g, 980, 512, 120, 'rgba(255,246,214,.9)', 0.9);
      var rc = seeded(51);
      for (var c = 0; c < 10; c++) {
        g.fillStyle = 'rgba(255,232,196,' + (0.12 + rc() * 0.18) + ')';
        g.beginPath();
        g.ellipse(rc() * W, 120 + rc() * 300, 130 + rc() * 250, 6 + rc() * 12, 0, 0, 7);
        g.fill();
      }

      /* --- 西湾天际线 --- */
      function tower(x, w, top, kind, col) {
        var base = 566, h = base - top;
        g.fillStyle = col;
        if (kind === 'cyl') {              // 圆柱 + 穹顶（多哈塔的样子）
          g.beginPath();
          g.moveTo(x, base);
          g.lineTo(x + 6, top + 20);
          g.quadraticCurveTo(x + w / 2, top - 6, x + w - 6, top + 20);
          g.lineTo(x + w, base);
          g.closePath(); g.fill();
          g.fillStyle = 'rgba(255,236,200,.18)';
          g.fillRect(x + w * 0.62, top + 22, w * 0.3, h - 22);
        } else if (kind === 'cone') {      // 圆锥（龙卷风塔）
          g.beginPath();
          g.moveTo(x, base); g.lineTo(x + w * 0.30, top);
          g.lineTo(x + w * 0.70, top); g.lineTo(x + w, base);
          g.closePath(); g.fill();
        } else if (kind === 'slab') {      // 阶梯板楼
          g.fillRect(x, top + h * 0.16, w, h * 0.84);
          g.fillRect(x + w * 0.18, top, w * 0.64, h * 0.18);
        } else {                            // 普通方块
          g.fillRect(x, top, w, h);
        }
        // 窗格灯
        if (kind !== 'cone') {
          litWindows(g, x + 3, top + h * 0.2, w - 6, h * 0.76, Math.max(2, Math.round(w / 9)), Math.max(4, Math.round(h / 16)),
            'rgba(255,226,164,.95)', (x | 0) % 97 + 3);
        } else {
          g.strokeStyle = 'rgba(255,226,170,.5)'; g.lineWidth = 1.6;
          for (var d = 0; d < 7; d++) {
            g.beginPath();
            g.moveTo(x + w * 0.30 + d * w * 0.06, top + d * (h / 8));
            g.lineTo(x + w * (0.30 + 0.57) - d * w * 0.06, top + (d + 1) * (h / 8));
            g.stroke();
          }
        }
        // 顶端红灯
        g.fillStyle = 'rgba(255,120,110,.9)';
        g.beginPath(); g.arc(x + w / 2, top + (kind === 'cyl' ? 2 : 0), 2.2, 0, 7); g.fill();
      }
      var sil = 'rgba(146,110,104,.88)';
      tower(250, 66, 470, 'slab', 'rgba(136,102,98,.86)');
      tower(330, 84, 424, 'box', sil);
      tower(428, 70, 458, 'slab', 'rgba(150,114,106,.88)');
      tower(512, 88, 356, 'cyl', 'rgba(158,120,110,.92)');
      tower(618, 74, 434, 'box', sil);
      tower(704, 92, 330, 'cone', 'rgba(170,130,116,.94)');
      tower(812, 78, 398, 'slab', sil);
      tower(900, 90, 366, 'box', 'rgba(152,116,108,.9)');
      tower(1004, 72, 446, 'slab', 'rgba(140,106,100,.88)');
      tower(1088, 86, 412, 'box', sil);
      tower(1184, 70, 470, 'slab', 'rgba(138,104,98,.86)');
      tower(1264, 80, 438, 'box', 'rgba(148,112,104,.88)');
      tower(1356, 66, 486, 'slab', 'rgba(142,108,100,.86)');
      // 近处的一层低矮滨水建筑，把人挡住天际线的根部
      g.fillStyle = 'rgba(120,88,84,.9)';
      for (var b = 0; b < 16; b++) {
        var bw = 60 + (b % 4) * 22, bh = 22 + (b % 3) * 14;
        g.fillRect(b * 96 - 10, 566 - bh, bw, bh);
      }
      litWindows(g, 0, 520, W, 46, 60, 3, 'rgba(255,214,150,.8)', 12);

      /* --- 海湾 --- */
      water(g, 566, 800, [
        0, '#e8b98e', 0.14, '#c98f7e', 0.4, '#8f7a8c', 0.7, '#5c6a88', 1, '#3f5378'
      ]);
      g.fillStyle = lin(g, 0, 570, 0, 660, [0, 'rgba(255,226,176,.6)', 1, 'rgba(255,226,176,0)']);
      g.fillRect(0, 570, W, 90);
      // 楼影倒在水里
      g.save();
      g.globalCompositeOperation = 'lighter';
      [[548, 88], [740, 92], [940, 90], [1130, 86]].forEach(function (p) {
        var grd = g.createLinearGradient(p[0] - p[1], 0, p[0] + p[1], 0);
        grd.addColorStop(0, 'rgba(255,206,140,0)');
        grd.addColorStop(0.5, 'rgba(255,206,140,.16)');
        grd.addColorStop(1, 'rgba(255,206,140,0)');
        g.fillStyle = grd;
        g.fillRect(p[0] - p[1], 576, p[1] * 2, 150);
      });
      g.restore();
      shimmer(g, 578, 794, full ? 160 : 45, 71, 'rgba(255,226,180,.75)');
      // 一条木船（湾里的小 dhow）
      g.save();
      g.translate(360, 726);
      g.fillStyle = 'rgba(60,48,48,.85)';
      g.beginPath();
      g.moveTo(-58, 0); g.quadraticCurveTo(-30, 16, 46, 8);
      g.quadraticCurveTo(66, 2, 62, -6); g.quadraticCurveTo(0, 2, -58, 0);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(60,48,48,.85)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -62); g.stroke();
      g.fillStyle = 'rgba(232,214,188,.7)';
      g.beginPath(); g.moveTo(2, -60); g.lineTo(40, -8); g.lineTo(2, -8); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,214,150,.7)';
      g.beginPath(); g.arc(-30, -6, 3, 0, 7); g.fill();
      g.restore();

      /* --- 海滨大道 --- */
      g.fillStyle = lin(g, 0, 790, 0, HH, [0, '#e6d3b4', 0.12, '#ddc6a4', 0.5, '#cfb590', 1, '#b99b78']);
      g.fillRect(0, 790, W, HH - 790);
      // 铺装纹理
      g.strokeStyle = 'rgba(150,124,96,.25)'; g.lineWidth = 1.4;
      for (var pv = 0; pv < 14; pv++) {
        var py = 800 + pv * 30;
        g.beginPath(); g.moveTo(0, py); g.lineTo(W, py); g.stroke();
      }
      for (var px2 = 0; px2 < W; px2 += 60) {
        g.beginPath(); g.moveTo(px2, 790); g.lineTo(px2 - 18, HH); g.stroke();
      }
      // 靠海的白色栏杆
      g.fillStyle = '#f6efe2';
      g.fillRect(0, 782, W, 9);
      g.fillStyle = 'rgba(184,160,130,.55)';
      g.fillRect(0, 791, W, 4);
      for (var rl = 0; rl < 26; rl++) {
        g.fillStyle = '#f2ebdd';
        g.fillRect(20 + rl * 60, 762, 7, 28);
      }

      /* 棕榈 + 花坛 + 长椅 + 路灯 */
      palm(g, 300, 860, 200, 0.34, '#8a6647', '#3f7d52');
      palm(g, 906, 842, 210, -0.3, '#8a6647', '#3f7d52');
      palm(g, 1360, 872, 184, 0.28, '#8a6647', '#3f7d52');
      // 花坛
      function bed(bx, by, w2, h2) {
        g.fillStyle = 'rgba(60,44,30,.18)';
        g.beginPath(); g.ellipse(bx, by + 6, w2, h2 * 0.5, 0, 0, 7); g.fill();
        g.fillStyle = '#a8896a';
        g.beginPath(); g.ellipse(bx, by, w2, h2, 0, 0, 7); g.fill();
        g.fillStyle = '#7b6a4a';
        g.beginPath(); g.ellipse(bx, by - 4, w2 * 0.86, h2 * 0.72, 0, 0, 7); g.fill();
        var rb = seeded(bx | 0);
        for (var i = 0; i < 22; i++) {
          g.fillStyle = rb() > 0.5 ? '#e8814a' : (rb() > 0.4 ? '#f0c451' : '#d9604f');
          g.beginPath();
          g.arc(bx + (rb() - 0.5) * w2 * 1.6, by - 6 + (rb() - 0.5) * h2, 2.2 + rb() * 1.8, 0, 7);
          g.fill();
        }
      }
      bed(566, 1010, 118, 34);
      bed(196, 1016, 92, 28);
      // 长椅
      function bench(bx, by) {
        g.fillStyle = 'rgba(60,44,30,.22)';
        g.beginPath(); g.ellipse(bx, by + 4, 54, 8, 0, 0, 7); g.fill();
        g.fillStyle = '#8a6647';
        g.fillRect(bx - 48, by - 16, 96, 9);
        g.fillRect(bx - 48, by - 32, 96, 8);
        g.fillStyle = '#6b4a32';
        g.fillRect(bx - 44, by - 8, 8, 10); g.fillRect(bx + 36, by - 8, 8, 10);
        g.fillStyle = 'rgba(255,240,214,.30)';
        g.fillRect(bx - 48, by - 32, 96, 2);
      }
      bench(1144, 946);
      bench(430, 940);
      // 路灯（海湾风格的球形灯）
      function dlamp(lx, ly) {
        g.fillStyle = 'rgba(60,44,30,.2)';
        g.beginPath(); g.ellipse(lx, ly + 2, 9, 4, 0, 0, 7); g.fill();
        g.fillStyle = '#5b4a3c'; g.fillRect(lx - 3, ly - 96, 6, 98);
        g.fillStyle = '#4a3d32'; g.fillRect(lx - 9, ly - 6, 18, 7);
        bloom(g, lx, ly - 106, 60, 'rgba(255,214,140,.5)', 0.9);
        g.fillStyle = '#ffe9b8';
        g.beginPath(); g.arc(lx, ly - 106, 9, 0, 7); g.fill();
      }
      dlamp(640, 900);
      dlamp(1050, 890);
      dlamp(1480, 906);

      /* 回小镇的指示牌 */
      g.fillStyle = 'rgba(60,44,30,.18)';
      g.beginPath(); g.ellipse(206, 1104, 24, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#7a5a42'; g.fillRect(200, 1016, 9, 88);
      g.fillStyle = '#f2e6cf';
      g.beginPath();
      g.moveTo(206, 1022); g.lineTo(300, 1026); g.lineTo(288, 1046); g.lineTo(206, 1044);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(90,70,50,.4)'; g.lineWidth = 2; g.stroke();
      text(g, '小镇', 250, 1041, 15, '#4a3020');

      if (full) { vignette(g, 0.32, 'rgba(40,20,30,.38)'); grain(g, 950, 17); }
    },
    anim: function (ctx, t) {
      /* 海面暖光在动 */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 12; i++) {
        var y = 596 + i * 16;
        ctx.fillStyle = 'rgba(255,206,150,' + (0.05 - i * 0.002) + ')';
        ctx.beginPath();
        ctx.ellipse(980 + Math.sin(t / 1600 + i) * 40, y, 90 - i * 5, 3.4, 0, 0, 7);
        ctx.fill();
      }
      ctx.restore();
      /* 远处塔顶的航空灯一闪一闪 */
      var blink = 0.35 + 0.65 * Math.abs(Math.sin(t / 900));
      [[281, 470], [555, 353], [750, 330], [945, 366], [1220, 470]].forEach(function (p) {
        ctx.fillStyle = 'rgba(255,110,100,' + blink + ')';
        ctx.beginPath(); ctx.arc(p[0], p[1], 2.6, 0, 7); ctx.fill();
      });
    }
  };

  /* ------------------------------------------------------------
   * 4. 武汉 · 长江与大桥
   * ------------------------------------------------------------ */
  D.wuhan = {
    id: 'wuhan', name: '武汉', sub: '湖北 · 长江',
    card: '长江大桥横在江上，江风把整座城吹得很近。',
    arrive: '🚉 到武汉了。江风一吹，就知道是这里。',
    line: '桥上的灯一盏一盏亮着，江水一直在走。',
    w: W, h: 1200,
    walk: { y0: 892, y1: 1150 },
    spawn: { x: 480, y: 1040, dir: 1 },
    exitPos: { x: 198, y: 1096 },
    view: {
      x: 940, y: 900, r: 106, label: '🌉 一起看江',
      lines: [
        '桥上的灯一排排亮到对岸，钢架把夜色切成一块一块。',
        '江水比想象中安静，只是不停地往东走。',
        '你以前一个人在这里走过很多次；这一次是两个人。'
      ]
    },
    eggPos: { x: 656, y: 962 },
    ticket: { no: '04', code: 'WUH', color: '#2c4a72', ink: '#0d1c30', paper: '#e9edf5',
      cond: [{ type: 'mem', n: 5 }, { type: 'craft', n: 1 }],
      hint: '回忆册再厚一点，或者在工坊里做一件小东西。' },
    spots: [
      { x: 762, y: 1020, r: 86, label: '📷 在桥景前合影' },
      { x: 556, y: 1022, r: 86, label: '📷 在江边长椅旁合影' }
    ],
    obstacles: [
      { x: 612, y: 960, w: 96, h: 40 },
      { x: 200, y: 962, w: 70, h: 40 },
      { x: 1180, y: 900, w: 26, h: 60 }
    ],
    paint: function (g, mode) {
      var full = mode !== 'thumb';
      var HH = 1200;
      /* 傍晚转夜 */
      g.fillStyle = lin(g, 0, 0, 0, 600, [
        0, '#12203c', 0.22, '#1f3357', 0.46, '#3b4f75', 0.66, '#6b7089', 0.82, '#a8807e', 0.94, '#cf9276', 1, '#e0a884'
      ]);
      g.fillRect(0, 0, W, 610);
      bloom(g, 880, 560, 420, 'rgba(214,140,96,.35)', 0.8);
      var rc = seeded(71);
      for (var c = 0; c < 40; c++) {
        g.fillStyle = 'rgba(255,255,255,' + (0.10 + rc() * 0.3) + ')';
        g.fillRect(rc() * W, 30 + rc() * 300, 1.6, 1.6);
      }

      /* 对岸：城市剪影 + 一点山和楼阁 */
      function cityBlock(x, w, top, col, seed, warm) {
        g.fillStyle = col;
        g.fillRect(x, top, w, 566 - top);
        litWindows(g, x + 2, top + 6, w - 4, 566 - top - 10, Math.max(2, Math.round(w / 11)), Math.max(3, Math.round((566 - top) / 18)), warm, seed);
      }
      // 远山（江对岸的龟山一类）
      g.fillStyle = 'rgba(44,52,72,.9)';
      g.beginPath();
      g.moveTo(-20, 566);
      g.quadraticCurveTo(120, 452, 260, 500);
      g.quadraticCurveTo(360, 528, 470, 566);
      g.closePath(); g.fill();
      // 山上的楼阁剪影（只做轮廓，不做完整地标）
      g.fillStyle = 'rgba(36,42,60,.95)';
      g.beginPath();
      g.moveTo(150, 470); g.lineTo(196, 470); g.lineTo(186, 448); g.lineTo(160, 448);
      g.closePath(); g.fill();
      g.fillRect(162, 470, 6, 26); g.fillRect(178, 470, 6, 26);
      g.beginPath();
      g.moveTo(168, 448); g.lineTo(178, 448); g.lineTo(173, 430);
      g.closePath(); g.fill();
      // 城市
      var rcb = seeded(83);
      var bx = 300;
      while (bx < W) {
        var bw = 40 + rcb() * 70, bt = 470 + rcb() * 76;
        cityBlock(bx, bw, bt, 'rgba(30,38,58,.94)', (bx | 0) % 89 + 5, 'rgba(255,214,150,.9)');
        bx += bw + 6 + rcb() * 20;
      }

      /* --- 江水（先铺水面，桥墩和桥面才能压在水上） --- */
      water(g, 566, 850, [
        0, '#42506a', 0.14, '#37455f', 0.4, '#2d3b54', 0.7, '#25324a', 1, '#1c2739'
      ]);
      g.fillStyle = lin(g, 0, 570, 0, 706, [0, 'rgba(230,164,120,.34)', 1, 'rgba(230,164,120,0)']);
      g.fillRect(0, 570, W, 136);
      shimmer(g, 578, 844, full ? 150 : 40, 91, 'rgba(198,212,236,.45)');
      for (var wv2 = 0; wv2 < 12; wv2++) {
        var wy2 = 600 + wv2 * 22;
        g.fillStyle = 'rgba(160,180,214,' + (0.05 + wv2 * 0.004) + ')';
        g.fillRect(0, wy2, W, 1.2 + wv2 * 0.5);
      }

      /* --- 桥墩：从桥面一直落进江里 --- */
      [200, 620, 1040, 1420].forEach(function (px3) {
        // 水里的倒影
        g.fillStyle = 'rgba(18,24,38,.30)';
        g.fillRect(px3 - 15, 690, 30, 110);
        var prg = g.createLinearGradient(0, 690, 0, 800);
        prg.addColorStop(0, 'rgba(18,24,38,.34)');
        prg.addColorStop(1, 'rgba(18,24,38,0)');
        g.fillStyle = prg;
        g.fillRect(px3 - 15, 690, 30, 110);
        // 墩身
        g.fillStyle = 'rgba(26,32,46,.98)';
        g.fillRect(px3 - 22, 496, 44, 214);
        g.fillStyle = 'rgba(52,62,84,.9)';
        g.fillRect(px3 - 26, 492, 52, 12);
        g.fillStyle = 'rgba(42,50,70,.95)';
        g.fillRect(px3 - 27, 660, 54, 44);
        // 墩上的暖灯
        bloom(g, px3, 590, 26, 'rgba(255,214,150,.35)', 0.8);
        g.fillStyle = 'rgba(255,220,160,.8)';
        g.fillRect(px3 - 3, 588, 6, 5);
      });

      /* --- 桥面 + 钢桁架 + 桥上路灯 --- */
      var deckY = 470, deckH = 30;
      g.fillStyle = 'rgba(24,30,46,.98)';
      g.fillRect(-20, deckY, W + 40, deckH);
      g.fillStyle = 'rgba(70,82,108,.55)';
      g.fillRect(-20, deckY, W + 40, 3);
      // 桁架
      g.strokeStyle = 'rgba(18,24,38,.95)'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(-20, deckY - 26); g.lineTo(W + 20, deckY - 26); g.stroke();
      g.lineWidth = 3.2;
      for (var tb = 0; tb < 40; tb++) {
        var tx = tb * 40 - 10;
        g.beginPath();
        g.moveTo(tx, deckY - 26); g.lineTo(tx + 20, deckY);
        g.moveTo(tx + 20, deckY - 26); g.lineTo(tx, deckY);
        g.stroke();
      }
      // 桥上路灯
      for (var bl = 0; bl < 24; bl++) {
        var lx2 = 30 + bl * 64;
        g.fillStyle = 'rgba(30,36,52,.9)'; g.fillRect(lx2 - 1, deckY - 44, 2.6, 18);
        bloom(g, lx2, deckY - 46, 16, 'rgba(255,226,170,.55)', 0.9);
        g.fillStyle = 'rgba(255,236,190,.95)';
        g.beginPath(); g.arc(lx2, deckY - 46, 2.6, 0, 7); g.fill();
      }
      // 桥上灯光在江面的倒影（少而软，不要排成一排灰条）
      g.save();
      g.globalCompositeOperation = 'lighter';
      [[300, 76], [700, 96], [1080, 84], [1400, 72]].forEach(function (p) {
        var grd2 = g.createLinearGradient(0, 600, 0, 800);
        grd2.addColorStop(0, 'rgba(255,206,150,.13)');
        grd2.addColorStop(1, 'rgba(255,206,150,0)');
        g.fillStyle = grd2;
        g.fillRect(p[0] - p[1] / 2, 600, p[1], 200);
      });
      g.restore();

      /* 江岸步道 */
      g.fillStyle = lin(g, 0, 842, 0, HH, [0, '#6d6a60', 0.14, '#65625a', 0.5, '#585650', 1, '#4a4844']);
      g.fillRect(0, 842, W, HH - 842);
      // 石板缝
      g.strokeStyle = 'rgba(30,32,34,.32)'; g.lineWidth = 1.6;
      for (var st = 0; st < 16; st++) {
        var sy2 = 852 + st * 24;
        g.beginPath(); g.moveTo(0, sy2); g.lineTo(W, sy2); g.stroke();
      }
      for (var sx4 = 0; sx4 < W; sx4 += 74) {
        g.beginPath(); g.moveTo(sx4, 842); g.lineTo(sx4 - 20, HH); g.stroke();
      }
      // 江边石栏
      g.fillStyle = '#7d7a72';
      g.fillRect(0, 830, W, 12);
      g.fillStyle = 'rgba(220,224,232,.35)';
      g.fillRect(0, 830, W, 3);
      for (var rl2 = 0; rl2 < 24; rl2++) {
        g.fillStyle = '#8a877e';
        g.fillRect(24 + rl2 * 64, 806, 12, 28);
      }
      // 长椅
      function wbench(bxp, byp) {
        g.fillStyle = 'rgba(20,22,26,.3)';
        g.beginPath(); g.ellipse(bxp, byp + 4, 52, 8, 0, 0, 7); g.fill();
        g.fillStyle = '#6b5a48';
        g.fillRect(bxp - 46, byp - 16, 92, 9);
        g.fillRect(bxp - 46, byp - 32, 92, 8);
        g.fillStyle = '#4a3d30';
        g.fillRect(bxp - 42, byp - 8, 8, 10); g.fillRect(bxp + 34, byp - 8, 8, 10);
        g.fillStyle = 'rgba(255,236,200,.22)';
        g.fillRect(bxp - 46, byp - 32, 92, 2);
      }
      wbench(660, 1000);
      wbench(240, 1002);
      wbench(1250, 994);
      // 江边的树
      function wtree(x, y, s) {
        g.fillStyle = 'rgba(20,22,26,.28)';
        g.beginPath(); g.ellipse(x, y + 4, 34 * s, 9 * s, 0, 0, 7); g.fill();
        g.fillStyle = '#3a3026'; g.fillRect(x - 5 * s, y - 62 * s, 10 * s, 64 * s);
        g.fillStyle = '#2c3a2c';
        [[0, -74, 34], [-20, -58, 26], [22, -58, 26], [0, -46, 30]].forEach(function (b3) {
          g.beginPath();
          g.ellipse(x + b3[0] * s, y + b3[1] * s, b3[2] * s, b3[2] * s * 0.86, 0, 0, 7);
          g.fill();
        });
        g.fillStyle = 'rgba(120,150,110,.22)';
        g.beginPath(); g.ellipse(x - 10 * s, y - 80 * s, 20 * s, 12 * s, 0, 0, 7); g.fill();
      }
      wtree(1120, 962, 1.1);
      wtree(420, 1050, 1.24);
      // 路灯
      function wlamp2(lx, ly) {
        g.fillStyle = 'rgba(20,22,26,.28)';
        g.beginPath(); g.ellipse(lx, ly + 2, 9, 4, 0, 0, 7); g.fill();
        g.fillStyle = '#3a3a3c'; g.fillRect(lx - 3, ly - 104, 6, 106);
        g.fillStyle = '#2e2e30';
        g.beginPath(); g.moveTo(lx - 11, ly - 104); g.lineTo(lx + 11, ly - 104);
        g.lineTo(lx + 7, ly - 116); g.lineTo(lx - 7, ly - 116); g.closePath(); g.fill();
        bloom(g, lx, ly - 110, 66, 'rgba(255,214,140,.55)', 0.9);
        g.fillStyle = '#ffe9b8'; g.fillRect(lx - 5, ly - 112, 10, 10);
      }
      wlamp2(860, 920);
      wlamp2(1360, 930);

      /* 回小镇的牌 */
      g.fillStyle = 'rgba(20,22,26,.2)';
      g.beginPath(); g.ellipse(206, 1106, 24, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#5b4a38'; g.fillRect(200, 1018, 9, 88);
      g.fillStyle = '#e6e2d4';
      g.beginPath();
      g.moveTo(206, 1024); g.lineTo(300, 1028); g.lineTo(288, 1048); g.lineTo(206, 1046);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,36,30,.5)'; g.lineWidth = 2; g.stroke();
      text(g, '小镇', 250, 1043, 15, '#3a3020');

      if (full) { vignette(g, 0.36, 'rgba(6,10,22,.46)'); grain(g, 950, 19); }
    },
    anim: function (ctx, t) {
      /* 江面缓慢流动的亮痕 */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 14; i++) {
        var y = 590 + i * 18;
        var x = ((t / 60 + i * 190) % 1900) - 200;
        ctx.fillStyle = 'rgba(190,210,240,' + (0.05 - i * 0.002) + ')';
        ctx.beginPath();
        ctx.ellipse(x, y, 60, 2.6, 0, 0, 7);
        ctx.fill();
      }
      ctx.restore();
      /* 桥上的车灯偶尔滑过 */
      for (var c = 0; c < 3; c++) {
        var cx = ((t / (26 + c * 9) + c * 420) % 1600) - 50;
        ctx.fillStyle = c % 2 ? 'rgba(255,236,190,.85)' : 'rgba(255,150,120,.8)';
        ctx.fillRect(cx, 466, 10, 3);
      }
    }
  };

  /* ------------------------------------------------------------
   * 5. 乌海 · 沙漠与湖
   * ------------------------------------------------------------ */
  D.wuhai = {
    id: 'wuhai', name: '乌海', sub: '内蒙古 · 沙漠湖城',
    card: '一半沙漠，一半湖水。越野车停在沙丘边上。',
    arrive: '🚉 乌海到了。风里有沙子的味道。',
    line: '沙是暖的，湖是凉的，中间站着我们。',
    w: W, h: 1200,
    walk: { y0: 892, y1: 1150 },
    spawn: { x: 420, y: 1046, dir: 1 },
    exitPos: { x: 190, y: 1098 },
    view: {
      x: 1310, y: 916, r: 108, label: '🏜 一起看湖和沙',
      lines: [
        '沙丘一直铺到湖那边，湖水亮得像另一片天空。',
        '你把鞋脱了，踩在沙上说了句「烫」。',
        '越野车的引擎还在轻轻响——但我们都不急着走。'
      ]
    },
    eggPos: { x: 1058, y: 938 },
    ticket: { no: '05', code: 'WHI', color: '#b07a3c', ink: '#3a2610', paper: '#f9efdd',
      cond: [{ type: 'mem', n: 7 }, { type: 'tree', n: 4 }],
      hint: '把回忆册攒到七段，或者让小镇的大树再长一阶。' },
    spots: [
      { x: 520, y: 992, r: 86, label: '📷 在越野车旁合影' },
      { x: 1310, y: 1092, r: 86, label: '📷 在沙丘上合影' }
    ],
    obstacles: [
      { x: 408, y: 884, w: 232, h: 74 },   // 越野车（车头朝湖，挡着别穿过去）
      { x: 696, y: 900, w: 16, h: 74 }
    ],
    paint: function (g, mode) {
      var full = mode !== 'thumb';
      var HH = 1200;
      /* 金色时刻的天 */
      g.fillStyle = lin(g, 0, 0, 0, 620, [
        0, '#e8a05c', 0.16, '#f2b46e', 0.36, '#f8c986', 0.56, '#fbdca6', 0.74, '#fdebc8', 0.9, '#fef6e4', 1, '#fffaf0'
      ]);
      g.fillRect(0, 0, W, 630);
      bloom(g, 356, 470, 420, 'rgba(255,232,168,.55)', 0.9);
      bloom(g, 356, 470, 110, 'rgba(255,251,226,.95)', 0.95);
      g.fillStyle = '#fffdf2';
      g.beginPath(); g.arc(356, 470, 34, 0, 7); g.fill();
      var rc = seeded(97);
      for (var c = 0; c < 8; c++) {
        g.fillStyle = 'rgba(255,244,220,' + (0.14 + rc() * 0.16) + ')';
        g.beginPath();
        g.ellipse(rc() * W, 120 + rc() * 280, 150 + rc() * 240, 5 + rc() * 9, 0, 0, 7);
        g.fill();
      }

      /* 远沙丘：三层，越远越淡 */
      function dune(yBase, peaks, c1, c2) {
        g.beginPath();
        g.moveTo(-20, yBase + 80);
        g.quadraticCurveTo(peaks[0][0], peaks[0][1], peaks[1][0], peaks[1][1]);
        g.quadraticCurveTo(peaks[2][0], peaks[2][1], peaks[3][0], peaks[3][1]);
        g.lineTo(W + 20, yBase + 80); g.closePath();
        g.fillStyle = lin(g, 0, yBase - 60, 0, yBase + 80, [0, c1, 1, c2]);
        g.fill();
      }
      dune(520, [[-20, 470], [320, 386], [720, 448], [W + 20, 404]], 'rgba(240,202,152,.92)', 'rgba(228,182,128,.92)');
      dune(560, [[-20, 520], [430, 428], [900, 490], [W + 20, 446]], 'rgba(228,180,120,.96)', 'rgba(212,160,102,.96)');
      // 沙丘脊线上的亮边
      g.strokeStyle = 'rgba(255,238,206,.55)'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-20, 470); g.quadraticCurveTo(320, 386, 720, 448);
      g.quadraticCurveTo(1000, 470, W + 20, 404);
      g.stroke();

      /* --- 湖：整条水面，近处的沙丘再把它的下缘压住（这样岸线才有起伏） --- */
      water(g, 512, 830, [
        0, '#cfe4ee', 0.10, '#9ec8da', 0.32, '#68a2be', 0.62, '#43809f', 1, '#2f6787'
      ]);
      g.fillStyle = lin(g, 0, 524, 0, 632, [0, 'rgba(255,246,214,.62)', 1, 'rgba(255,246,214,0)']);
      g.fillRect(0, 524, W, 110);
      shimmer(g, 532, 812, full ? 150 : 36, 47, 'rgba(255,250,232,.8)');
      // 湖对岸的沙影（贴在水面上的一条）
      g.fillStyle = 'rgba(206,160,104,.35)';
      g.beginPath();
      g.moveTo(-20, 516);
      g.bezierCurveTo(300, 526, 700, 512, 1100, 522);
      g.bezierCurveTo(1300, 527, 1420, 516, W + 20, 520);
      g.lineTo(W + 20, 536); g.lineTo(-20, 534);
      g.closePath(); g.fill();

      /* --- 沙地：近处沙丘把湖水挡住一部分 --- */
      g.fillStyle = lin(g, 0, 640, 0, HH, [0, '#e2bd85', 0.16, '#d9ae72', 0.48, '#cfa167', 1, '#bd8f58']);
      g.beginPath();
      g.moveTo(-20, 752);
      g.bezierCurveTo(220, 668, 470, 736, 740, 694);
      g.bezierCurveTo(1000, 654, 1300, 710, W + 20, 676);
      g.lineTo(W + 20, HH); g.lineTo(-20, HH);
      g.closePath(); g.fill();
      // 水陆交界的亮沙线
      g.strokeStyle = 'rgba(250,238,208,.9)'; g.lineWidth = 6;
      g.beginPath();
      g.moveTo(-20, 752);
      g.bezierCurveTo(220, 668, 470, 736, 740, 694);
      g.bezierCurveTo(1000, 654, 1300, 710, W + 20, 676);
      g.stroke();
      g.strokeStyle = 'rgba(198,152,100,.35)'; g.lineWidth = 10;
      g.beginPath();
      g.moveTo(-20, 760);
      g.bezierCurveTo(220, 676, 470, 744, 740, 702);
      g.bezierCurveTo(1000, 662, 1300, 718, W + 20, 684);
      g.stroke();
      // 沙丘上的一道背光面，让坡有起伏
      g.fillStyle = 'rgba(178,130,84,.22)';
      g.beginPath();
      g.moveTo(-20, 752);
      g.bezierCurveTo(220, 668, 470, 736, 740, 694);
      g.bezierCurveTo(1000, 654, 1300, 710, W + 20, 676);
      g.lineTo(W + 20, 732);
      g.bezierCurveTo(1300, 756, 1000, 708, 740, 742);
      g.bezierCurveTo(470, 778, 220, 718, -20, 794);
      g.closePath(); g.fill();

      // 沙纹（一道道被风吹出来的弧线）
      var rw = seeded(111);
      g.lineWidth = 2;
      for (var i = 0; i < (full ? 90 : 24); i++) {
        var y = 660 + Math.pow(rw(), 0.7) * 520;
        var x0 = rw() * W;
        var wl2 = 90 + rw() * 260;
        g.strokeStyle = 'rgba(178,132,86,' + (0.10 + rw() * 0.14) + ')';
        g.beginPath();
        g.moveTo(x0, y);
        g.quadraticCurveTo(x0 + wl2 * 0.5, y - 8 - rw() * 10, x0 + wl2, y);
        g.stroke();
      }
      // 车辙：从画面左下弯到车边
      g.save();
      g.strokeStyle = 'rgba(160,116,74,.42)'; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(30, 1212);
      g.bezierCurveTo(250, 1150, 470, 1088, 660, 1002);
      g.stroke();
      g.beginPath();
      g.moveTo(86, 1218);
      g.bezierCurveTo(290, 1160, 500, 1098, 686, 1014);
      g.stroke();
      g.restore();
      // 稀疏的耐旱植物
      var rp = seeded(131);
      for (var p = 0; p < (full ? 70 : 16); p++) {
        var px4 = rp() * W, py4 = 680 + rp() * 500;
        g.strokeStyle = 'rgba(120,128,72,.55)'; g.lineWidth = 1.8;
        for (var q = -2; q <= 2; q++) {
          g.beginPath(); g.moveTo(px4, py4);
          g.quadraticCurveTo(px4 + q * 4, py4 - 8, px4 + q * 9, py4 - 16 - rp() * 8);
          g.stroke();
        }
      }
      // 脚印
      var rfp = seeded(151);
      for (var f = 0; f < (full ? 40 : 10); f++) {
        var fx = 300 + rfp() * 700, fy = 760 + rfp() * 380;
        g.fillStyle = 'rgba(150,108,68,.32)';
        g.beginPath(); g.ellipse(fx, fy, 4, 6, rfp() - 0.5, 0, 7); g.fill();
      }

      /* 越野车（停在沙地上，车头朝湖） */
      (function jeep() {
        var jx = 520, jy = 944;
        g.fillStyle = 'rgba(120,80,40,.28)';
        g.beginPath(); g.ellipse(jx, jy + 6, 128, 26, 0, 0, 7); g.fill();
        // 车身
        g.fillStyle = '#b8534a';
        g.beginPath();
        g.moveTo(jx - 108, jy - 8);
        g.lineTo(jx - 100, jy - 46);
        g.lineTo(jx - 46, jy - 52);
        g.lineTo(jx - 20, jy - 92);
        g.lineTo(jx + 40, jy - 94);
        g.lineTo(jx + 62, jy - 54);
        g.lineTo(jx + 106, jy - 48);
        g.lineTo(jx + 116, jy - 8);
        g.closePath(); g.fill();
        // 顶窗（沙色）
        g.fillStyle = '#f2dfbe';
        g.beginPath();
        g.moveTo(jx - 16, jy - 86); g.lineTo(jx + 36, jy - 88);
        g.lineTo(jx + 52, jy - 56); g.lineTo(jx - 40, jy - 54);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.fillRect(jx - 12, jy - 84, 44, 5);
        // 车顶行李架
        g.strokeStyle = '#4a3a2c'; g.lineWidth = 4;
        g.beginPath();
        g.moveTo(jx - 44, jy - 100); g.lineTo(jx + 44, jy - 102);
        g.stroke();
        g.fillStyle = '#4a3a2c';
        g.fillRect(jx - 44, jy - 104, 4, 8); g.fillRect(jx + 40, jy - 106, 4, 8);
        // 备胎
        g.fillStyle = '#2e2a28';
        g.beginPath(); g.arc(jx + 96, jy - 66, 14, 0, 7); g.fill();
        g.fillStyle = '#5b5450';
        g.beginPath(); g.arc(jx + 96, jy - 66, 6, 0, 7); g.fill();
        // 车轮
        [-58, 62].forEach(function (wx2) {
          g.fillStyle = '#26242a';
          g.beginPath(); g.arc(jx + wx2, jy - 8, 22, 0, 7); g.fill();
          g.fillStyle = '#6b6460';
          g.beginPath(); g.arc(jx + wx2, jy - 8, 9, 0, 7); g.fill();
        });
        // 车身反光与沙尘
        g.fillStyle = 'rgba(255,226,180,.30)';
        g.fillRect(jx - 100, jy - 46, 200, 5);
        g.fillStyle = 'rgba(60,40,30,.35)';
        g.fillRect(jx - 108, jy - 12, 224, 6);
      })();

      /* 车旁的小装备 */
      g.fillStyle = 'rgba(120,80,40,.24)';
      g.beginPath(); g.ellipse(846, 978, 44, 10, 0, 0, 7); g.fill();
      g.fillStyle = '#3f6f74';                       // 折叠椅
      g.fillRect(820, 940, 48, 8);
      g.strokeStyle = '#3f6f74'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(822, 948); g.lineTo(812, 982); g.moveTo(866, 948); g.lineTo(876, 982); g.stroke();
      g.fillStyle = '#e8dfcc';                       // 保温壶
      g.fillRect(890, 950, 20, 30);
      g.fillStyle = '#c05c4a'; g.fillRect(890, 944, 20, 8);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(894, 954, 4, 22);

      /* 路线的木桩标记 */
      g.fillStyle = 'rgba(120,80,40,.2)';
      g.beginPath(); g.ellipse(704, 972, 16, 5, 0, 0, 7); g.fill();
      g.fillStyle = '#8a6242'; g.fillRect(696, 900, 12, 74);
      g.fillStyle = '#e8d9b8';
      g.beginPath();
      g.moveTo(702, 906); g.lineTo(772, 910); g.lineTo(762, 926); g.lineTo(702, 924);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(90,70,50,.5)'; g.lineWidth = 2; g.stroke();
      text(g, '湖边', 734, 923, 13, '#4a3020');

      /* 回小镇的牌 */
      g.fillStyle = 'rgba(120,80,40,.2)';
      g.beginPath(); g.ellipse(196, 1108, 24, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#7a5a3c'; g.fillRect(190, 1020, 9, 88);
      g.fillStyle = '#f0e0c0';
      g.beginPath();
      g.moveTo(196, 1026); g.lineTo(290, 1030); g.lineTo(278, 1050); g.lineTo(196, 1048);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(90,70,50,.5)'; g.lineWidth = 2; g.stroke();
      text(g, '小镇', 240, 1045, 15, '#4a3020');

      if (full) { vignette(g, 0.30, 'rgba(70,40,16,.34)'); grain(g, 950, 23); }
    },
    anim: function (ctx, t) {
      /* 风把细沙吹起来一点点 */
      ctx.save();
      for (var i = 0; i < 16; i++) {
        var x = ((t / (14 + i * 2) + i * 180) % 1800) - 100;
        var y = 700 + ((i * 137) % 420) + Math.sin(t / 900 + i) * 6;
        ctx.fillStyle = 'rgba(250,232,196,' + (0.10 + (i % 3) * 0.05) + ')';
        ctx.beginPath(); ctx.ellipse(x, y, 14 + (i % 4) * 8, 1.6, 0, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
  };

  /* ------------------------------------------------------------
   * 6. 吉隆坡 · 双子塔与城市公园
   * ------------------------------------------------------------ */
  D.kl = {
    id: 'kl', name: '吉隆坡', sub: '马来西亚 · 双子塔',
    card: '夜里双子塔亮着，公园的树影层层叠叠。',
    arrive: '🚉 吉隆坡的夜是潮的，双子塔亮在头顶。',
    line: '两座塔一直亮着，像给夜里留的灯。',
    w: W, h: 1200,
    walk: { y0: 900, y1: 1150 },
    spawn: { x: 880, y: 1046, dir: 1 },
    exitPos: { x: 640, y: 1098 },
    view: {
      x: 900, y: 914, r: 106, label: '✨ 一起看双塔',
      lines: [
        '两座塔在夜里几乎透明，灯沿着塔身一层层往上爬。',
        '公园的喷泉刚好亮起来，水柱被照成淡蓝色。',
        '「行李丢了那天，我们也是站在这里。」——现在想想，好像也不亏。'
      ]
    },
    eggPos: { x: 616, y: 962 },
    ticket: { no: '06', code: 'KUL', color: '#2f6b52', ink: '#0c2618', paper: '#eaf3ec',
      cond: [{ type: 'mem', n: 9 }, { type: 'visit', n: 3 }],
      hint: '收满九段回忆，或者先坐三次车去别的地方。' },
    spots: [
      { x: 1100, y: 980, r: 86, label: '📷 在双子塔前合影' },
      { x: 432, y: 1022, r: 86, label: '📷 在公园喷泉旁合影' }
    ],
    obstacles: [
      { x: 570, y: 960, w: 96, h: 40 },
      { x: 1352, y: 906, w: 26, h: 60 },
      { x: 252, y: 900, w: 26, h: 60 }
    ],
    paint: function (g, mode) {
      var full = mode !== 'thumb';
      var HH = 1200;
      /* 热带夜空 */
      g.fillStyle = lin(g, 0, 0, 0, 640, [
        0, '#08101f', 0.2, '#0f1d33', 0.42, '#1a3050', 0.62, '#284565', 0.8, '#3a5a72', 1, '#57707f'
      ]);
      g.fillRect(0, 0, W, 650);
      bloom(g, 900, 600, 460, 'rgba(255,196,132,.28)', 0.85);
      var rc = seeded(171);
      for (var c = 0; c < 60; c++) {
        g.fillStyle = 'rgba(255,255,255,' + (0.10 + rc() * 0.35) + ')';
        g.fillRect(rc() * W, 20 + rc() * 380, 1.5, 1.5);
      }

      /* 城市轮廓（低层） */
      var rcb = seeded(193);
      var bx = -20;
      while (bx < W) {
        var bw = 50 + rcb() * 90, bt = 500 + rcb() * 70;
        g.fillStyle = 'rgba(22,34,52,.96)';
        g.fillRect(bx, bt, bw, 610 - bt);
        litWindows(g, bx + 3, bt + 8, bw - 6, 610 - bt - 12, Math.max(2, Math.round(bw / 12)), Math.max(3, Math.round((610 - bt) / 20)), 'rgba(255,214,150,.85)', (bx | 0) % 71 + 3);
        bx += bw + 8 + rcb() * 16;
      }

      /* 双子塔 */
      (function towers() {
        var base = 610, top = 300, hw = 42;
        function one(cx) {
          // 塔身：直上 + 三次收分（双子塔是圆截面、带退台，不是火箭）
          function body(half) {
            g.beginPath();
            g.moveTo(cx - half, base);
            g.lineTo(cx - half * 0.95, 520);
            g.lineTo(cx - half * 0.90, 520);
            g.lineTo(cx - half * 0.83, 430);
            g.lineTo(cx - half * 0.78, 430);
            g.lineTo(cx - half * 0.72, 366);
            g.lineTo(cx - half * 0.84, 366);   // 顶部外挑的环
            g.lineTo(cx - half * 0.72, 338);
            g.lineTo(cx - half * 0.52, top);
            g.lineTo(cx + half * 0.52, top);
            g.lineTo(cx + half * 0.72, 338);
            g.lineTo(cx + half * 0.84, 366);
            g.lineTo(cx + half * 0.72, 366);
            g.lineTo(cx + half * 0.78, 430);
            g.lineTo(cx + half * 0.83, 430);
            g.lineTo(cx + half * 0.90, 520);
            g.lineTo(cx + half * 0.95, 520);
            g.lineTo(cx + half, base);
            g.closePath();
          }
          body(hw);
          g.fillStyle = '#aebecd'; g.fill();
          // 银蓝的柱面渐变：左侧受月光，右侧偏冷
          var grd = g.createLinearGradient(cx - hw, 0, cx + hw, 0);
          grd.addColorStop(0, 'rgba(96,124,154,.85)');
          grd.addColorStop(0.28, 'rgba(226,238,248,.95)');
          grd.addColorStop(0.55, 'rgba(196,214,230,.95)');
          grd.addColorStop(1, 'rgba(112,140,168,.9)');
          body(hw); g.fillStyle = grd; g.fill();
          // 层间窗带
          for (var i = 0; i < 30; i++) {
            var t = i / 30;
            var yy = top + 40 + t * (base - top - 40);
            var k = 1 - t * 0.24;
            var ww = hw * 1.72 * k;
            g.fillStyle = i % 3 === 0 ? 'rgba(255,226,168,.55)' : (i % 3 === 1 ? 'rgba(120,156,190,.42)' : 'rgba(238,246,252,.5)');
            g.fillRect(cx - ww / 2, yy, ww, 2.6);
          }
          // 退台处的暗线
          [520, 430, 366, 338].forEach(function (sy) {
            g.fillStyle = 'rgba(70,92,116,.35)';
            g.fillRect(cx - hw, sy - 1.5, hw * 2, 3);
          });
          // 塔尖
          g.fillStyle = '#dfeaf4';
          g.beginPath();
          g.moveTo(cx - 5, top);
          g.lineTo(cx + 5, top);
          g.lineTo(cx + 1, top - 34);
          g.lineTo(cx - 1, top - 34);
          g.closePath(); g.fill();
          g.strokeStyle = '#eaf2fa'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(cx, top - 30); g.lineTo(cx, top - 72); g.stroke();
          bloom(g, cx, top - 46, 26, 'rgba(206,230,252,.30)', 0.7);
          g.fillStyle = 'rgba(255,140,120,.9)';
          g.beginPath(); g.arc(cx, top - 74, 2.4, 0, 7); g.fill();
        }
        one(880);
        one(1052);
        // 空中连桥（双层）
        g.fillStyle = '#d7e3ee';
        g.fillRect(880 + 26, 452, 1052 - 880 - 52, 9);
        g.fillStyle = '#c6d4e2';
        g.fillRect(880 + 26, 468, 1052 - 880 - 52, 7);
        g.fillStyle = 'rgba(255,226,168,.85)';
        g.fillRect(880 + 30, 454, 1052 - 880 - 60, 3);
        g.strokeStyle = '#d2dfea'; g.lineWidth = 2.4;
        g.beginPath(); g.moveTo(880 + 44, 452); g.lineTo(880 + 44, 424); g.stroke();
        g.beginPath(); g.moveTo(1052 - 44, 452); g.lineTo(1052 - 44, 424); g.stroke();
      })();

      /* 吉隆坡塔（远处的针塔，给城市一个辨识度） */
      (function kltower() {
        var cx = 300, base = 610, top = 352;
        g.fillStyle = 'rgba(190,206,222,.75)';
        g.fillRect(cx - 7, top + 40, 14, base - top - 40);
        g.beginPath();
        g.moveTo(cx - 26, top + 34); g.lineTo(cx - 18, top + 6);
        g.lineTo(cx + 18, top + 6); g.lineTo(cx + 26, top + 34);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(214,228,240,.85)';
        g.fillRect(cx - 3, top - 34, 6, 44);
        bloom(g, cx, top + 20, 40, 'rgba(200,226,255,.35)', 0.8);
        g.fillStyle = 'rgba(255,140,120,.85)';
        g.beginPath(); g.arc(cx, top - 36, 2.4, 0, 7); g.fill();
      })();

      /* 公园：草地 + 步道 + 湖 + 喷泉 */
      g.fillStyle = lin(g, 0, 612, 0, HH, [0, '#2f4a3a', 0.12, '#2a4435', 0.45, '#233a2c', 1, '#1b2f24']);
      g.fillRect(0, 612, W, HH - 612);
      /* 城市灯火在草地边的一层暖雾：把「楼脚一条直线」揉开 */
      g.fillStyle = lin(g, 0, 596, 0, 726, [0, 'rgba(255,214,160,.30)', 0.34, 'rgba(230,210,180,.13)', 1, 'rgba(230,210,180,0)']);
      g.fillRect(0, 596, W, 132);
      // 步道（浅色石带，从右下弯到双塔脚下）
      g.save();
      taperedPath(g, [980, 616], [900, 740], [620, 800], [500, 910], 16, 52, '#3f4a3e');
      taperedPath(g, [500, 910], [400, 1000], [330, 1090], [330, 1220], 52, 70, '#3f4a3e');
      taperedPath(g, [980, 616], [900, 740], [620, 800], [500, 910], 8, 30, 'rgba(196,192,172,.30)');
      taperedPath(g, [500, 910], [400, 1000], [330, 1090], [330, 1220], 30, 40, 'rgba(196,192,172,.26)');
      g.restore();
      // 草坪的深浅与草叶
      var rgr = seeded(251);
      for (var gp2 = 0; gp2 < 30; gp2++) {
        g.fillStyle = rgr() > 0.5 ? 'rgba(56,96,64,.35)' : 'rgba(24,48,34,.30)';
        g.beginPath();
        g.ellipse(rgr() * W, 650 + rgr() * 520, 70 + rgr() * 170, 16 + rgr() * 36, 0, 0, 7);
        g.fill();
      }
      for (var gb = 0; gb < (full ? 260 : 40); gb++) {
        var gbx = rgr() * W, gby = 660 + rgr() * 540;
        var kk2 = (gby - 660) / 540;
        g.strokeStyle = rgr() > 0.5 ? 'rgba(30,58,38,.42)' : 'rgba(96,140,92,.32)';
        g.lineWidth = 1 + kk2 * 1.4;
        g.beginPath();
        g.moveTo(gbx, gby);
        g.quadraticCurveTo(gbx + 3, gby - 6 - kk2 * 8, gbx + 6, gby - 12 - kk2 * 16);
        g.stroke();
      }
      // 公园湖 + 喷泉
      g.fillStyle = '#1e3a48';
      g.beginPath(); g.ellipse(980, 806, 250, 74, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(96,158,180,.55)';
      g.beginPath(); g.ellipse(980, 800, 232, 64, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(200,238,246,.35)';
      g.beginPath(); g.ellipse(960, 786, 150, 34, 0, 0, 7); g.fill();
      // 喷泉水柱
      g.fillStyle = 'rgba(196,238,250,.55)';
      for (var fb = 0; fb < 5; fb++) {
        var fx2 = 900 + fb * 40;
        g.beginPath();
        g.moveTo(fx2 - 3, 790);
        g.quadraticCurveTo(fx2, 700 + (fb % 2) * 26, fx2 + 3, 790);
        g.closePath(); g.fill();
      }
      bloom(g, 980, 760, 120, 'rgba(180,230,250,.30)', 0.8);

      /* 热带植物：棕榈 + 大叶植物 */
      palm(g, 252, 940, 210, 0.3, '#3b3226', '#255c3a');
      palm(g, 1372, 930, 226, -0.26, '#3b3226', '#255c3a');
      palm(g, 1180, 1010, 190, 0.24, '#3b3226', '#2a6440');
      // 大叶植物（芭蕉 / 龟背竹的感觉）
      function bigLeaf(x, y, s) {
        g.fillStyle = 'rgba(10,20,14,.3)';
        g.beginPath(); g.ellipse(x, y + 4, 26 * s, 8 * s, 0, 0, 7); g.fill();
        g.strokeStyle = '#2c5c3a'; g.lineWidth = 3 * s;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 54 * s); g.stroke();
        for (var i = 0; i < 5; i++) {
          var a = -Math.PI / 2 + (i - 2) * 0.62;
          var L = 34 * s;
          g.fillStyle = i % 2 ? '#2f6b42' : '#276038';
          g.beginPath();
          g.moveTo(x, y - 44 * s);
          g.quadraticCurveTo(x + Math.cos(a) * L * 0.7, y - 44 * s + Math.sin(a) * L * 0.7 - 10 * s,
            x + Math.cos(a) * L, y - 44 * s + Math.sin(a) * L + 12 * s);
          g.quadraticCurveTo(x + Math.cos(a) * L * 0.5, y - 44 * s + Math.sin(a) * L * 0.5 + 8 * s, x, y - 42 * s);
          g.closePath(); g.fill();
        }
      }
      bigLeaf(430, 1060, 1.1);
      bigLeaf(1240, 1080, 1.2);
      bigLeaf(120, 1000, 1.0);
      // 草地上的灌木
      var rb = seeded(211);
      for (var b2 = 0; b2 < 26; b2++) {
        var bxp = rb() * W, byp = 700 + rb() * 480;
        g.fillStyle = rb() > 0.5 ? 'rgba(38,78,52,.85)' : 'rgba(30,64,44,.85)';
        g.beginPath();
        g.ellipse(bxp, byp, 16 + rb() * 26, 10 + rb() * 14, 0, 0, 7);
        g.fill();
      }

      /* 长椅 + 花坛 + 园灯 */
      function kbench(bx2, by2) {
        g.fillStyle = 'rgba(6,14,10,.4)';
        g.beginPath(); g.ellipse(bx2, by2 + 4, 50, 8, 0, 0, 7); g.fill();
        g.fillStyle = '#4a3c2c';
        g.fillRect(bx2 - 44, by2 - 16, 88, 9);
        g.fillRect(bx2 - 44, by2 - 32, 88, 8);
        g.fillStyle = '#2e2620';
        g.fillRect(bx2 - 40, by2 - 8, 8, 10); g.fillRect(bx2 + 32, by2 - 8, 8, 10);
        g.fillStyle = 'rgba(255,226,168,.22)';
        g.fillRect(bx2 - 44, by2 - 32, 88, 2);
      }
      kbench(616, 1000);
      kbench(1440, 1030);
      // 花坛（木槿：马来西亚国花）
      g.fillStyle = '#3a3630';
      g.beginPath(); g.ellipse(820, 1044, 62, 20, 0, 0, 7); g.fill();
      g.fillStyle = '#243a2a';
      g.beginPath(); g.ellipse(820, 1038, 54, 16, 0, 0, 7); g.fill();
      var rh2 = seeded(233);
      for (var h2 = 0; h2 < 16; h2++) {
        var hx2 = 820 + (rh2() - 0.5) * 96, hy2 = 1036 + (rh2() - 0.5) * 20;
        g.fillStyle = rh2() > 0.35 ? '#d4455c' : '#f0e6d4';
        for (var pt = 0; pt < 5; pt++) {
          var pa = pt / 5 * Math.PI * 2;
          g.beginPath();
          g.ellipse(hx2 + Math.cos(pa) * 3.4, hy2 + Math.sin(pa) * 3.4, 3, 2.2, pa, 0, 7);
          g.fill();
        }
        g.fillStyle = '#f6d267';
        g.beginPath(); g.arc(hx2, hy2, 1.6, 0, 7); g.fill();
      }
      // 园灯
      function klamp(lx, ly) {
        g.fillStyle = 'rgba(6,14,10,.4)';
        g.beginPath(); g.ellipse(lx, ly + 2, 8, 4, 0, 0, 7); g.fill();
        g.fillStyle = '#2f2c28'; g.fillRect(lx - 3, ly - 90, 6, 92);
        bloom(g, lx, ly - 92, 58, 'rgba(255,206,140,.45)', 0.9);
        g.fillStyle = '#ffe2ac';
        g.beginPath(); g.arc(lx, ly - 92, 8, 0, 7); g.fill();
      }
      klamp(700, 946);
      klamp(1180, 962);

      /* 回小镇的牌 */
      g.fillStyle = 'rgba(6,14,10,.36)';
      g.beginPath(); g.ellipse(646, 1108, 24, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#4a3c2c'; g.fillRect(640, 1020, 9, 88);
      g.fillStyle = '#e8e2d2';
      g.beginPath();
      g.moveTo(646, 1026); g.lineTo(740, 1030); g.lineTo(728, 1050); g.lineTo(646, 1048);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,34,26,.5)'; g.lineWidth = 2; g.stroke();
      text(g, '小镇', 690, 1045, 15, '#3a3020');

      if (full) { vignette(g, 0.38, 'rgba(4,8,16,.5)'); grain(g, 950, 29); }
    },
    anim: function (ctx, t) {
      /* 喷泉在动 */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 5; i++) {
        var fx = 900 + i * 40;
        var h = 92 + Math.sin(t / 420 + i * 1.1) * 16;
        ctx.fillStyle = 'rgba(176,226,246,.12)';
        ctx.beginPath();
        ctx.ellipse(fx, 790 - h * 0.6, 9, h * 0.55, 0, 0, 7);
        ctx.fill();
      }
      ctx.restore();
      /* 双塔的灯微微呼吸 */
      var a = 0.10 + 0.06 * Math.sin(t / 1200);
      ctx.fillStyle = 'rgba(255,236,200,' + a + ')';
      ctx.fillRect(880 - 42, 300, 84, 310);
      ctx.fillRect(1052 - 42, 300, 84, 310);
    }
  };

  /* @@NEXT@@ */

  /* ============================================================
   * 背景缓存（LRU 2 张） + 缩略图
   * ============================================================ */
  var cache = {}, cacheOrder = [];

  /* ============================================================
   * v4.1 地图环境细节
   *   只做「加法」：在原有 paint 画完之后，往地面层补草丛、石头、花、
   *   长椅、栅栏、路灯、旅行小物——不重画任何已有地标与插画。
   *   全部用固定种子撒点，并避开出生点/出口/回忆点/观景点/打卡点，
   *   保证不挡人、不压互动。
   * ============================================================ */
  function avoidHit(x, y, list, pad) {
    if (!list) return false;
    for (var i = 0; i < list.length; i++) {
      var dx = x - list[i][0], dy = y - list[i][1];
      if (dx * dx + dy * dy < pad * pad) return true;
    }
    return false;
  }

  function tuft(g, x, y, s, col) {
    g.strokeStyle = col;
    g.lineWidth = Math.max(1, s * 0.34);
    for (var i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(x + i * s * 0.5, y);
      g.quadraticCurveTo(x + i * s * 0.9, y - s * 1.1, x + i * s * 1.5, y - s * 1.9);
      g.stroke();
    }
  }

  function pebble(g, x, y, s, col, hi) {
    g.fillStyle = col;
    g.beginPath(); g.ellipse(x, y, s, s * 0.62, 0, 0, 7); g.fill();
    g.fillStyle = hi || 'rgba(255,255,255,.32)';
    g.beginPath(); g.ellipse(x - s * 0.24, y - s * 0.22, s * 0.45, s * 0.24, 0, 0, 7); g.fill();
  }

  function flowerDot(g, x, y, s, col) {
    g.strokeStyle = 'rgba(72,112,70,.65)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s * 2.4); g.stroke();
    g.fillStyle = col;
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      g.beginPath();
      g.arc(x + Math.cos(a) * s * 0.8, y - s * 2.4 + Math.sin(a) * s * 0.8, s * 0.55, 0, 7);
      g.fill();
    }
    g.fillStyle = '#f7d774';
    g.beginPath(); g.arc(x, y - s * 2.4, s * 0.42, 0, 7); g.fill();
  }

  /* 长椅：木条 + 铁腿 + 一点影子 */
  function bench(g, x, y, s, wood, iron) {
    g.fillStyle = 'rgba(30,40,60,.20)';
    g.beginPath(); g.ellipse(x, y + 4 * s, 34 * s, 7 * s, 0, 0, 7); g.fill();
    g.fillStyle = wood || '#a8763f';
    for (var i = 0; i < 3; i++) g.fillRect(x - 32 * s, y - 10 * s + i * 7 * s, 64 * s, 5 * s);
    g.fillRect(x - 32 * s, y - 26 * s, 64 * s, 5 * s);
    g.fillRect(x - 32 * s, y - 20 * s, 64 * s, 4 * s);
    g.fillStyle = iron || '#4a4238';
    g.fillRect(x - 28 * s, y - 8 * s, 5 * s, 16 * s);
    g.fillRect(x + 23 * s, y - 8 * s, 5 * s, 16 * s);
    g.fillRect(x - 30 * s, y - 26 * s, 4 * s, 20 * s);
    g.fillRect(x + 26 * s, y - 26 * s, 4 * s, 20 * s);
  }

  /* 木栅栏：立柱 + 两道横杆 */
  function fence(g, x0, x1, y, s, col) {
    var step = 26 * s;
    g.strokeStyle = col || 'rgba(122,86,54,.85)';
    g.lineWidth = 4 * s;
    g.beginPath(); g.moveTo(x0, y - 16 * s); g.lineTo(x1, y - 16 * s); g.stroke();
    g.lineWidth = 3 * s;
    g.beginPath(); g.moveTo(x0, y - 30 * s); g.lineTo(x1, y - 30 * s); g.stroke();
    g.lineWidth = 5 * s;
    for (var x = x0; x <= x1; x += step) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 36 * s); g.stroke();
    }
  }

  /* 路灯：柱 + 灯罩 + 一圈暖光（夜里用） */
  function lampPost(g, x, y, s, col, glowCol, a) {
    g.fillStyle = col || '#3a3f4a';
    g.fillRect(x - 2.2 * s, y - 62 * s, 4.4 * s, 62 * s);
    g.fillRect(x - 7 * s, y - 4 * s, 14 * s, 4 * s);
    g.beginPath();
    g.moveTo(x - 9 * s, y - 62 * s); g.lineTo(x + 9 * s, y - 62 * s);
    g.lineTo(x + 6 * s, y - 74 * s); g.lineTo(x - 6 * s, y - 74 * s);
    g.closePath();
    g.fillStyle = '#2e333d'; g.fill();
    g.fillStyle = '#ffe2a4';
    g.fillRect(x - 5 * s, y - 72 * s, 10 * s, 8 * s);
    var rg = g.createRadialGradient(x, y - 68 * s, 2 * s, x, y - 68 * s, 46 * s);
    rg.addColorStop(0, glowCol || 'rgba(255,214,140,.42)');
    rg.addColorStop(1, 'rgba(255,214,140,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y - 68 * s, 46 * s, 0, 7); g.fill();
  }

  var EXTRA = {
    /* ---------------- 赛里木湖 ---------------- */
    sayram: function (g) {
      var av = [[360, 1040], [196, 1074], [1160, 862], [1036, 916], [1030, 952], [700, 1012]];
      var rnd = seeded(3001);
      /* 湖岸一带的碎石（贴着岸线，让水陆交界咬得住） */
      for (var i = 0; i < 26; i++) {
        var x = 60 + rnd() * 1380;
        var y = 880 + rnd() * 40;
        if (avoidHit(x, y, av, 60)) continue;
        pebble(g, x, y, 3 + rnd() * 6, 'rgba(150,146,134,.55)', 'rgba(255,255,255,.35)');
      }
      /* 草地上的野花和草丛 */
      for (var j = 0; j < 70; j++) {
        var fx = 40 + rnd() * 1420, fy = 930 + rnd() * 210;
        if (avoidHit(fx, fy, av, 54)) continue;
        if (rnd() > 0.72) flowerDot(g, fx, fy, 2.4 + rnd() * 1.4, rnd() > 0.5 ? '#f4f0e0' : '#f2d06a');
        else tuft(g, fx, fy, 3 + rnd() * 3, 'rgba(96,132,78,.62)');
      }
      /* 观景台旁边的一张长椅，正对湖 */
      bench(g, 820, 1004, 1, '#b98a52', '#4a4a52');
      /* 栈道外侧的一段矮栅栏 */
      fence(g, 950, 1160, 980, 0.85, 'rgba(126,90,58,.8)');
      /* 一顶远处的毡房炊烟（极淡，只做气氛） */
      g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(300, 838);
      g.quadraticCurveTo(292, 812, 306, 792);
      g.stroke();
    },

    /* ---------------- 西藏 ---------------- */
    tibet: function (g) {
      var av = [[700, 1030], [196, 1092], [352, 884], [512, 902], [512, 942], [878, 1002]];
      var rnd = seeded(3002);
      /* 山谷里的碎石堆 */
      for (var i = 0; i < 34; i++) {
        var x = 40 + rnd() * 1420, y = 900 + rnd() * 200;
        if (avoidHit(x, y, av, 56)) continue;
        pebble(g, x, y, 4 + rnd() * 9, 'rgba(132,124,110,.5)', 'rgba(255,255,255,.28)');
      }
      /* 高山草甸：矮丛，颜色偏冷 */
      for (var j = 0; j < 80; j++) {
        var fx = 30 + rnd() * 1440, fy = 920 + rnd() * 220;
        if (avoidHit(fx, fy, av, 50)) continue;
        if (rnd() > 0.86) flowerDot(g, fx, fy, 2.2, '#e8dfc8');
        else tuft(g, fx, fy, 2.6 + rnd() * 2.6, 'rgba(104,124,86,.55)');
      }
      /* 路边一小段玛尼石（三块叠起来的白石） */
      pebble(g, 620, 964, 15, 'rgba(206,206,198,.85)', 'rgba(255,255,255,.5)');
      pebble(g, 620, 950, 11, 'rgba(196,196,188,.85)', 'rgba(255,255,255,.45)');
      pebble(g, 620, 939, 7, 'rgba(216,216,208,.9)', 'rgba(255,255,255,.55)');
      /* 歇脚的石凳 */
      bench(g, 780, 1044, 0.9, '#8a7a62', '#5a5348');
      /* 斜插在坡上的一根经幡杆（细，不抢主体） */
      g.strokeStyle = '#7a6a52'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(1080, 1010); g.lineTo(1072, 900); g.stroke();
    },

    /* ---------------- 多哈 ---------------- */
    doha: function (g) {
      var av = [[420, 1030], [200, 1094], [1124, 908], [760, 880], [760, 924], [1078, 992]];
      var rnd = seeded(3003);
      /* 海滨步道的栏杆（沿步道边缘一排立柱） */
      g.strokeStyle = 'rgba(226,214,190,.55)';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(60, 984); g.lineTo(520, 968); g.stroke();
      for (var f = 0; f < 12; f++) {
        var fx0 = 70 + f * 40;
        g.fillStyle = 'rgba(226,214,190,.5)';
        g.fillRect(fx0, 966, 2.6, 20);
      }
      /* 棕榈的落叶影 + 沿路的矮灌木 */
      for (var j = 0; j < 54; j++) {
        var x = 40 + rnd() * 1420, y = 940 + rnd() * 190;
        if (avoidHit(x, y, av, 54)) continue;
        if (rnd() > 0.7) tuft(g, x, y, 3 + rnd() * 2.6, 'rgba(96,122,84,.5)');
        else pebble(g, x, y, 3 + rnd() * 4, 'rgba(198,178,148,.45)', 'rgba(255,255,255,.3)');
      }
      /* 步道灯（暖白，两盏） */
      lampPost(g, 300, 1000, 0.86, '#3f4450', 'rgba(255,226,164,.34)');
      lampPost(g, 980, 1010, 0.86, '#3f4450', 'rgba(255,226,164,.34)');
      /* 面海的木长椅 */
      bench(g, 560, 1024, 1, '#c8a878', '#4a4a52');
      /* 沙滩上的遮阳伞影（斜长的一道，暗示时间） */
      g.fillStyle = 'rgba(60,60,80,.10)';
      g.beginPath();
      g.moveTo(1200, 1040); g.lineTo(1330, 1006); g.lineTo(1344, 1026); g.lineTo(1214, 1060);
      g.closePath(); g.fill();
    },

    /* ---------------- 武汉 ---------------- */
    wuhan: function (g) {
      var av = [[480, 1040], [198, 1096], [656, 962], [940, 900], [940, 952], [556, 1022]];
      var rnd = seeded(3004);
      /* 江岸铺地：一排方砖的接缝（很淡，只在近处看得见） */
      g.strokeStyle = 'rgba(220,226,238,.10)'; g.lineWidth = 1.5;
      for (var bx = 40; bx < 1460; bx += 74) {
        g.beginPath(); g.moveTo(bx, 980); g.lineTo(bx - 26, 1200); g.stroke();
      }
      for (var by = 1000; by < 1200; by += 46) {
        g.beginPath(); g.moveTo(0, by); g.lineTo(W, by); g.stroke();
      }
      /* 系船柱 + 铁链（江边特征，克制地放一组） */
      [180, 320, 460].forEach(function (px) {
        g.fillStyle = '#4a5260';
        g.fillRect(px, 986, 12, 26);
        g.beginPath(); g.ellipse(px + 6, 985, 8, 4, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,.18)';
        g.fillRect(px + 2, 988, 3, 20);
      });
      g.strokeStyle = 'rgba(70,78,92,.55)'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(192, 992);
      g.quadraticCurveTo(256, 1006, 320, 992);
      g.quadraticCurveTo(390, 1006, 460, 992);
      g.stroke();
      /* 江堤的灯（两盏，冷白偏暖） */
      lampPost(g, 760, 1030, 0.9, '#3a4250', 'rgba(255,222,170,.3)');
      lampPost(g, 1240, 1000, 0.9, '#3a4250', 'rgba(255,222,170,.3)');
      /* 长椅旁的小树池 */
      for (var t2 = 0; t2 < 40; t2++) {
        var x = 40 + rnd() * 1400, y = 1010 + rnd() * 160;
        if (avoidHit(x, y, av, 52)) continue;
        if (rnd() > 0.55) tuft(g, x, y, 2.6 + rnd() * 2.2, 'rgba(96,118,84,.45)');
        else pebble(g, x, y, 2.4 + rnd() * 3, 'rgba(160,166,178,.4)', 'rgba(255,255,255,.25)');
      }
    },

    /* ---------------- 乌海 ---------------- */
    wuhai: function (g) {
      var av = [[420, 1046], [190, 1098], [1058, 938], [1310, 916], [520, 992], [1176, 982]];
      var rnd = seeded(3005);
      /* 沙地纹理：细长的风纹 */
      g.strokeStyle = 'rgba(196,150,102,.22)'; g.lineWidth = 2;
      for (var i = 0; i < 30; i++) {
        var x = 20 + rnd() * 1460, y = 960 + rnd() * 220;
        if (avoidHit(x, y, av, 46)) continue;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 40 + rnd() * 50, y - 6, x + 90 + rnd() * 70, y + 2);
        g.stroke();
      }
      /* 沙丘上的枯草丛 */
      for (var j = 0; j < 48; j++) {
        var fx = 30 + rnd() * 1440, fy = 950 + rnd() * 220;
        if (avoidHit(fx, fy, av, 50)) continue;
        tuft(g, fx, fy, 2.6 + rnd() * 2.4, 'rgba(168,142,96,.55)');
      }
      /* 湖边竖着的旧木桩（当地人用来拴船的） */
      [[760, 1010], [790, 1016], [828, 1008]].forEach(function (p, i) {
        g.fillStyle = 'rgba(30,26,22,.18)';
        g.beginPath(); g.ellipse(p[0] + 6, p[1] + 4, 10, 4, 0, 0, 7); g.fill();
        g.fillStyle = i % 2 ? '#7a5a3c' : '#8a6a48';
        g.fillRect(p[0] - 4, p[1] - 34, 8, 38);
        g.fillStyle = 'rgba(255,240,214,.25)';
        g.fillRect(p[0] - 4, p[1] - 34, 2.5, 38);
      });
      /* 一辆车的车辙尽头，一个小小的路标（写着「湖」） */
      g.fillStyle = '#8a6242'; g.fillRect(1122, 1030, 8, 40);
      g.fillStyle = '#e8d9b8';
      g.beginPath();
      g.moveTo(1126, 1034); g.lineTo(1176, 1037); g.lineTo(1168, 1051); g.lineTo(1126, 1049);
      g.closePath(); g.fill();
      text(g, '湖', 1148, 1048, 11, '#4a3020');
    },

    /* ---------------- 吉隆坡 ---------------- */
    kl: function (g) {
      var av = [[500, 1046], [200, 1098], [616, 962], [900, 914], [880, 962], [432, 1022]];
      var rnd = seeded(3006);
      /* 公园里的热带灌木丛（成团，不是散点） */
      for (var i = 0; i < 16; i++) {
        var cx = 60 + rnd() * 1380, cy = 990 + rnd() * 170;
        if (avoidHit(cx, cy, av, 70)) continue;
        for (var k = 0; k < 5; k++) {
          g.fillStyle = k % 2 ? 'rgba(46,92,64,.55)' : 'rgba(58,110,74,.5)';
          g.beginPath();
          g.ellipse(cx + (k - 2) * 12, cy - Math.abs(k - 2) * 5, 18, 12, 0, 0, 7);
          g.fill();
        }
      }
      /* 步道灯（两盏，暖白） */
      lampPost(g, 520, 1016, 0.88, '#333a3a', 'rgba(255,226,168,.34)');
      lampPost(g, 1130, 1030, 0.88, '#333a3a', 'rgba(255,226,168,.34)');
      /* 公园长椅 */
      bench(g, 700, 1032, 0.95, '#a8804c', '#3f4a44');
      /* 喷泉边的一圈矮石栏 */
      g.strokeStyle = 'rgba(226,232,222,.28)'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(432, 1010, 64, 20, 0, 0, 7); g.stroke();
      /* 草坪上零星的小花 */
      for (var j = 0; j < 40; j++) {
        var fx = 40 + rnd() * 1420, fy = 1000 + rnd() * 170;
        if (avoidHit(fx, fy, av, 48)) continue;
        flowerDot(g, fx, fy, 2, rnd() > 0.5 ? '#f6e8a8' : '#f0a0b8');
      }
    }
  };

  /* ------------------------------------------------------------
   * 7. 冰岛 · 极光下的冰川
   *    冬夜天空 / 多层极光 / 冰川与冰崖 / 冰湖 / 黑色火山砂
   *
   *    这张图的构图是「自下而上」看的，所以纵向分区写死在这里：
   *      天 0~700   ·  极光 470~670   ·  三层山脊 690~830
   *      冰湖 806~902  ·  黑砂岸 892~1200（可走 930~1150）
   *    横屏时镜头往上偏（camBias），抬头就能看见极光——
   *    这也是这张图唯一需要「改取景」的地方，别的地图仍是 0.8 居中。
   * ------------------------------------------------------------ */

  var ICE = { horizon: 700, lakeTop: 806, lakeBot: 902, shoreTop: 892 };

  /* ---------- 极光 ----------
   * 一条极光 = 一条会起伏的中心线，用「由粗到细、由淡到亮」的六道描边叠出来。
   * 这样边缘是软的、中间是亮的，像发光的管子；
   * 再用横向的正弦权重把两端淡掉，就不会变成一条横贯画面的绿条。
   * 底下的细光丝只留很淡的一点，作为「帘」的纹理。 */
  function auroraBand(g, o) {
    var step = 16;
    function cy(x) {
      return o.y
        + Math.sin(x / o.p + o.ph) * o.a
        + Math.sin(x / (o.p * 0.33) + o.ph * 1.9) * (o.a * 0.32)
        + Math.sin(x / (o.p * 0.13) + o.ph * 3.4) * (o.a * 0.11);
    }
    var x0 = o.x0, x1 = o.x1, span = x1 - x0;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'butt'; g.lineJoin = 'round';
    g.strokeStyle = o.c;
    for (var pi = 0; pi < o.pass.length; pi++) {
      g.lineWidth = o.w * o.pass[pi][0];
      var al = o.pass[pi][1] * o.gain;
      for (var x = x0; x < x1; x += step) {
        var t = (x + step / 2 - x0) / span;
        var tp = Math.sin(Math.PI * Math.max(0.004, Math.min(0.996, t)));
        g.globalAlpha = al * Math.pow(tp, 0.5);
        g.beginPath();
        g.moveTo(x, cy(x));
        g.lineTo(x + step + 1.5, cy(x + step + 1.5));
        g.stroke();
      }
    }
    /* 帘上的竖纹：不是等距的一把梳子（那会像下雨），
       而是用一条平滑噪声决定「宽窄 + 长短 + 亮度」，
       于是自然出现一束一束的亮带——极光的竖纹本来就是这样聚散的。 */
    function nz(x) {
      var v = 0.5 + 0.30 * Math.sin(x / 37 + (o.ph || 0))
        + 0.18 * Math.sin(x / 13 + (o.ph || 0) * 2.3)
        + 0.10 * Math.sin(x / 5.7 + (o.ph || 0) * 3.7);
      return Math.max(0, Math.min(1, v));
    }
    var fx = x0;
    while (fx < x1) {
      var n = nz(fx);
      var w2 = 3 + n * 15;
      var len = (o.tall || 110) * (0.28 + n * 1.05);
      var yy2 = cy(fx);
      var t2 = (fx - x0) / span;
      var tp2 = Math.sin(Math.PI * Math.max(0.004, Math.min(0.996, t2)));
      var lg2 = g.createLinearGradient(0, yy2 - len, 0, yy2 + 8);
      lg2.addColorStop(0, o.c0);
      lg2.addColorStop(0.55, o.c);
      lg2.addColorStop(1, o.c);
      g.fillStyle = lg2;
      g.globalAlpha = (0.05 + n * 0.12) * o.gain * Math.pow(tp2, 0.5);
      g.fillRect(fx, yy2 - len, w2, len + 8);
      fx += w2 * (0.45 + n * 0.75);
    }
    g.restore();
  }

  /* 三层：主帘（青绿）· 高层（淡青）· 低层（紫，压在山脊后面） */
  var AURORA_BANDS = [
    { x0: -90, x1: 1000, y: 596, a: 30, p: 430, ph: 0.35, w: 132, gain: 1, seed: 21,
      c: 'rgba(96,255,206,.85)', c0: 'rgba(96,255,206,0)', tall: 150,
      pass: [[1, .040], [.72, .050], [.48, .066], [.30, .082], [.16, .098], [.07, .086]] },
    { x0: 250, x1: 1620, y: 556, a: 24, p: 330, ph: 2.30, w: 96, gain: .86, seed: 57,
      c: 'rgba(150,255,224,.80)', c0: 'rgba(150,255,224,0)', tall: 125,
      pass: [[1, .034], [.70, .044], [.44, .060], [.26, .074], [.12, .086], [.05, .070]] },
    { x0: -60, x1: 1500, y: 648, a: 44, p: 520, ph: 4.10, w: 150, gain: .70, seed: 92,
      c: 'rgba(178,146,255,.62)', c0: 'rgba(178,146,255,0)', tall: 130,
      pass: [[1, .030], [.68, .038], [.42, .050], [.24, .060], [.11, .064], [.05, .050]] }
  ];

  /* 动的那一层：整片极光画进一张半分辨率的小画布，每帧只 drawImage 一次。
     逐帧重画上千道描边的话，iPhone 上会掉到 20fps 以下。 */
  var _aurCv = null;
  var AUR_TOP = 400, AUR_BOT = 740;
  function auroraSprite() {
    if (_aurCv) return _aurCv;
    var c = document.createElement('canvas');
    c.width = 760; c.height = (AUR_BOT - AUR_TOP) / 2;
    var g = c.getContext('2d');
    g.scale(0.5, 0.5);
    g.translate(0, -AUR_TOP);
    for (var i = 0; i < AURORA_BANDS.length; i++) {
      var b = AURORA_BANDS[i];
      auroraBand(g, { x0: b.x0, x1: b.x1, y: b.y, a: b.a, p: b.p, ph: b.ph, w: b.w,
        c: b.c, c0: b.c0, tall: b.tall, pass: b.pass, seed: b.seed, gain: 1 });
    }
    _aurCv = c;
    return c;
  }

  /* ---------- 山脊 ----------
   * 一串尖峰叠出来的剪影。峰形用 (1-|t|)^k 而不是高斯：
   * 高斯在顶点是圆的，叠出来是一排馒头山；(1-|t|) 在顶点有尖角，
   * 叠上第二层更细的「石脊」，才有冰岛那种又碎又陡的山脊线。
   * 全局的 jag() 是按 H=1000 归一化的，这张图高 1200，直接用它会把山脊抬高 115px，
   * 正好压在极光上——所以这里全部用绝对坐标重写。 */
  function iceRidgePts(baseY, peaks, spires, jitter, seed) {
    var pts = [];
    for (var x = -60; x <= W + 60; x += 8) {
      var y = baseY;
      for (var i = 0; i < peaks.length; i++) {
        var p = peaks[i];
        var t = Math.abs((x - p.x) / p.w);
        if (t < 1) y -= Math.pow(1 - t, 1.15) * p.h;
      }
      for (var j = 0; j < spires.length; j++) {
        var q = spires[j];
        var t2 = Math.abs((x - q.x) / q.w);
        if (t2 < 1) y -= Math.pow(1 - t2, 0.95) * q.h;
      }
      y += Math.sin(x / 23 + seed) * jitter + Math.sin(x / 7.3 + seed * 2.3) * jitter * 0.55;
      pts.push([x, y]);
    }
    return pts;
  }
  function iceRidge(g, pts, fill, baseY, snowA, snowTop) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.lineTo(W + 60, baseY + 40); g.lineTo(-60, baseY + 40);
    g.closePath();
    g.fillStyle = fill; g.fill();
    if (snowA) {
      /* 雪只落在最高的那一段：用一条竖直渐变裁在山体里，
         峰越低离渐变底越近，落到的雪就越少——不用为每座山单独算雪线。 */
      g.save();
      g.clip();
      var gr = g.createLinearGradient(0, snowTop, 0, snowTop + 96);
      gr.addColorStop(0, 'rgba(232,246,255,' + snowA + ')');
      gr.addColorStop(0.42, 'rgba(206,230,252,' + (snowA * 0.52).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(190,220,248,0)');
      g.fillStyle = gr;
      g.fillRect(-60, snowTop, W + 120, 160);
      g.restore();
    }
  }

  /* ---------- 冰 ---------- */
  var iceRnd = seeded(1207);

  /* 浮冰 / 小冰山：水上白、水下蓝，底下一圈倒影 */
  function icefloe(g, x, y, w2, h2, seed) {
    var r = seeded(seed);
    g.fillStyle = 'rgba(140,200,230,.10)';
    g.beginPath(); g.ellipse(x, y + h2 * 0.34, w2 * 0.92, h2 * 0.30, 0, 0, 7); g.fill();
    /* 水下 */
    g.beginPath();
    g.moveTo(x - w2, y);
    g.lineTo(x - w2 * 0.55, y + h2 * 0.40);
    g.lineTo(x - w2 * 0.05, y + h2 * 0.26);
    g.lineTo(x + w2 * 0.48, y + h2 * 0.44);
    g.lineTo(x + w2, y + h2 * 0.12);
    g.closePath();
    g.fillStyle = 'rgba(54,116,156,.50)'; g.fill();
    /* 水上：几个折面 */
    g.beginPath();
    g.moveTo(x - w2, y);
    g.lineTo(x - w2 * 0.74, y - h2 * (0.44 + r() * 0.16));
    g.lineTo(x - w2 * 0.34, y - h2 * (0.86 + r() * 0.14));
    g.lineTo(x + w2 * 0.04, y - h2 * (0.58 + r() * 0.12));
    g.lineTo(x + w2 * 0.46, y - h2 * (0.80 + r() * 0.20));
    g.lineTo(x + w2, y - h2 * 0.30);
    g.lineTo(x + w2, y);
    g.closePath();
    var gr = g.createLinearGradient(x - w2, y - h2, x + w2 * 0.6, y);
    gr.addColorStop(0, '#f6fdff');
    gr.addColorStop(0.40, '#d6effb');
    gr.addColorStop(1, '#7fb6d8');
    g.fillStyle = gr; g.fill();
    /* 受光的那一刀 */
    g.strokeStyle = 'rgba(255,255,255,.62)'; g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x - w2 * 0.34, y - h2 * 0.86);
    g.lineTo(x + w2 * 0.04, y - h2 * 0.58);
    g.stroke();
    /* 一道冷蓝的暗面 */
    g.fillStyle = 'rgba(96,152,190,.22)';
    g.beginPath();
    g.moveTo(x + w2 * 0.04, y - h2 * 0.58);
    g.lineTo(x + w2 * 0.46, y - h2 * 0.80);
    g.lineTo(x + w2, y - h2 * 0.30);
    g.lineTo(x + w2, y);
    g.lineTo(x + w2 * 0.04, y);
    g.closePath(); g.fill();
  }

  /* 低矮的木栈台：冰岛那种贴着地的观景平台 */
  function deck(g, x, y, w2, s) {
    var h2 = 13 * s;
    g.fillStyle = 'rgba(6,10,16,.42)';
    g.beginPath(); g.ellipse(x + w2 / 2, y + h2 + 5 * s, w2 * 0.54, 6 * s, 0, 0, 7); g.fill();
    /* 支柱 */
    g.fillStyle = '#3b332c';
    for (var p = 0; p < 4; p++) {
      var px = x + 10 * s + p * (w2 - 20 * s) / 3;
      g.fillRect(px - 2.7 * s, y, 5.4 * s, h2 + 9 * s);
    }
    /* 台面 */
    g.fillStyle = '#6a5a48';
    g.fillRect(x, y - 4 * s, w2, h2);
    g.strokeStyle = 'rgba(20,14,9,.38)'; g.lineWidth = 1.2;
    for (var l = 1; l < 9; l++) {
      g.beginPath();
      g.moveTo(x + w2 * l / 9, y - 4 * s);
      g.lineTo(x + w2 * l / 9, y + h2 - 4 * s);
      g.stroke();
    }
    /* 板面上的一条亮边 + 雪 */
    g.fillStyle = 'rgba(122,108,90,.85)';
    g.fillRect(x, y + h2 - 4.2 * s, w2, 1.6 * s);
    g.fillStyle = 'rgba(240,250,255,.92)';
    g.fillRect(x, y - 5.6 * s, w2 * 0.62, 2.4 * s);
    g.fillRect(x + w2 * 0.70, y - 5.2 * s, w2 * 0.30, 1.8 * s);
    /* 两根木桩 + 一道绳 */
    g.strokeStyle = '#463c32'; g.lineWidth = 4 * s;
    g.beginPath(); g.moveTo(x + 6 * s, y - 4 * s); g.lineTo(x + 6 * s, y - 27 * s); g.stroke();
    g.beginPath(); g.moveTo(x + w2 - 6 * s, y - 4 * s); g.lineTo(x + w2 - 6 * s, y - 27 * s); g.stroke();
    g.strokeStyle = 'rgba(206,198,178,.55)'; g.lineWidth = 1.4 * s;
    g.beginPath();
    g.moveTo(x + 6 * s, y - 25 * s);
    g.quadraticCurveTo(x + w2 / 2, y - 19 * s, x + w2 - 6 * s, y - 25 * s);
    g.stroke();
  }

  /* 一片雪：两头收尖的透镜形，比椭圆「自然」，不会看成水洼 */
  function lens(g, x, y, w2, h2, tilt) {
    g.save();
    g.translate(x, y);
    if (tilt) g.rotate(tilt);
    g.beginPath();
    g.moveTo(-w2, 0);
    g.bezierCurveTo(-w2 * 0.52, -h2 * 1.18, w2 * 0.52, -h2 * 1.18, w2, 0);
    g.bezierCurveTo(w2 * 0.54, h2 * 0.62, -w2 * 0.54, h2 * 0.62, -w2, 0);
    g.closePath();
    g.restore();
  }

  D.iceland = {
    id: 'iceland', name: '冰岛', sub: '北境 · 极光与冰川',
    card: '整片天都在发光。冰川一直躺在那儿，安静得像睡着了。',
    arrive: '🚉 到得很晚，天已经黑透。抬头的那一下，你会记很久。',
    line: '雪把声音都吃掉了，只剩冰在轻轻响。',
    w: W, h: 1140,
    /* 这张图的主角是天空。取景不写死 0.8：
       按窗口高度算出「一屏大约看 620 个世界单位」的比例，夹在 0.62~0.86 之间；
       再把镜头往上偏 0.70，让极光永远在画面上半部。 */
    fitSky: 620, minZoom: 0.60, maxZoom: 0.86, camBias: 0.80,
    walk: { y0: 900, y1: 1030 },
    spawn: { x: 332, y: 966, dir: 1 },
    exitPos: { x: 178, y: 1002 },
    view: {
      x: 700, y: 916, r: 104, label: '🌌 一起看极光',
      lines: [
        '你们把手肘搭在木栏上，谁也没先开口。',
        '天上有好几层光，一层压着一层，慢慢翻过去。',
        '冰湖把这些光又还了一遍，颜色比天上暗一点。'
      ]
    },
    eggPos: { x: 1212, y: 902 },
    ticket: {
      no: '07', code: 'ISL', color: '#57b3a6', ink: '#062026', paper: '#e8f5f3',
      title: '北境之票',
      /* all: true = 两条都要满足。这张是最后一站，不能靠「树亮了」单独换出来，
         否则玩家还没去过几个地方，车站里就先出现一张陌生的票。 */
      all: true,
      /* v4.5：树改成六阶段，这里跟着改刻度（5 = 完全点亮，即树到顶）。
         仍然是 AND：只满足树、或只去过几个地方，都换不出这张票。 */
      cond: [{ type: 'visit', n: 4 }, { type: 'tree', n: 5 }],
      /* 没拿到之前，车站和车票册里连这张灰卡都不显示（连「还有第 7 张」都不提示） */
      hidden: true,
      hint: '去过的地方够多了，树也长得像样了——两样都齐了，车站才会多出这一张。'
    },
    spots: [
      { x: 508, y: 950, r: 88, label: '📷 在冰湖边合影' },
      { x: 962, y: 992, r: 88, label: '📷 在冰块前合影' }
    ],
    obstacles: [
      { x: 382, y: 918, w: 96, h: 44 },      // 岸边那块玄武岩
      { x: 1052, y: 940, w: 90, h: 42 },     // 中右的礁石
      { x: 1362, y: 964, w: 132, h: 58 }     // 右端那片矮岩台
    ],
    paint: function (g, mode) {
      var full = mode !== 'thumb';
      var rnd = seeded(1207);

      /* ================= 天 ================= */
      g.fillStyle = lin(g, 0, 0, 0, 760, [
        0, '#01030a', 0.14, '#030814', 0.32, '#05101f', 0.50, '#07182b',
        0.68, '#0a2038', 0.84, '#0d2a46', 1, '#123452'
      ]);
      g.fillRect(0, 0, W, 770);

      /* 星星：越靠地平线越稀、越暗；少数几颗带十字芒 */
      var starN = full ? 190 : 50;
      for (var s = 0; s < starN; s++) {
        var sx = rnd() * W, sy = Math.pow(rnd(), 0.78) * 620;
        var sa = (0.16 + rnd() * 0.62) * Math.max(0.10, 1 - sy / 820);
        var sr2 = rnd() > 0.92 ? 1.7 : (rnd() > 0.55 ? 1.1 : 0.72);
        g.fillStyle = 'rgba(222,238,255,' + sa.toFixed(3) + ')';
        g.beginPath(); g.arc(sx, sy, sr2, 0, 7); g.fill();
        if (full && rnd() > 0.94) {
          g.strokeStyle = 'rgba(214,236,255,' + (sa * 0.46).toFixed(3) + ')';
          g.lineWidth = 0.7;
          g.beginPath();
          g.moveTo(sx - 3.8, sy); g.lineTo(sx + 3.8, sy);
          g.moveTo(sx, sy - 3.8); g.lineTo(sx, sy + 3.8);
          g.stroke();
        }
      }

      /* 地平线上那层很淡的冷光，把天空托住 */
      bloom(g, 720, 700, 760, 'rgba(64,158,190,.15)', 1);
      bloom(g, 220, 636, 420, 'rgba(52,120,170,.09)', 1);

      /* ================= 极光 ================= */
      /* 静态这层只做「底色」，画得淡一点：真正流动的那层在 anim 里叠上来，
         两层都用 lighter，静态太亮就会糊成一块白板（上一版就是这个毛病）。 */
      for (var a = 0; a < AURORA_BANDS.length; a++) {
        var bd = AURORA_BANDS[a];
        auroraBand(g, { x0: bd.x0, x1: bd.x1, y: bd.y, a: bd.a, p: bd.p, ph: bd.ph, w: bd.w,
          c: bd.c, c0: bd.c0, tall: bd.tall, pass: bd.pass, seed: bd.seed, gain: 0.46 });
      }
      /* 极光落在雪雾上的那一层薄光 */
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = lin(g, 0, 560, 0, 700, [0, 'rgba(70,210,180,.10)', 1, 'rgba(60,190,170,0)']);
      g.fillRect(0, 560, W, 140);
      g.restore();

      /* 很少量的薄云：只在极光和山之间露一条 */
      if (full) {
        for (var cl = 0; cl < 5; cl++) {
          g.fillStyle = 'rgba(120,150,190,.045)';
          g.beginPath();
          g.ellipse(140 + cl * 330, 648 + (cl % 3) * 26, 200 + (cl % 2) * 130, 7 + (cl % 3) * 3, 0, 0, 7);
          g.fill();
        }
      }

      /* ================= 三层山脊 ================= */
      /* 最远：只剩剪影，颜色比天空更暗，顶上挂一点被极光照亮的雪 */
      iceRidge(g, iceRidgePts(766, [
        { x: 40, y: 0, w: 150, h: 44 }, { x: 250, y: 0, w: 130, h: 34 },
        { x: 430, y: 0, w: 170, h: 52 }, { x: 640, y: 0, w: 140, h: 30 },
        { x: 860, y: 0, w: 180, h: 48 }, { x: 1080, y: 0, w: 140, h: 36 },
        { x: 1280, y: 0, w: 190, h: 50 }, { x: 1480, y: 0, w: 140, h: 40 }
      ], [
        { x: 90, y: 0, w: 40, h: 30 }, { x: 175, y: 0, w: 26, h: 22 },
        { x: 330, y: 0, w: 34, h: 26 }, { x: 470, y: 0, w: 44, h: 34 },
        { x: 560, y: 0, w: 24, h: 20 }, { x: 700, y: 0, w: 30, h: 24 },
        { x: 920, y: 0, w: 46, h: 32 }, { x: 1010, y: 0, w: 22, h: 18 },
        { x: 1190, y: 0, w: 36, h: 28 }, { x: 1350, y: 0, w: 42, h: 30 },
        { x: 1440, y: 0, w: 26, h: 22 }
      ], 2.4, 3.1), '#1b3149', 766, 0.20, 704);

      /* 中景：真的盖着雪的山 */
      iceRidge(g, iceRidgePts(812, [
        { x: 20, y: 0, w: 190, h: 56 }, { x: 280, y: 0, w: 170, h: 42 },
        { x: 520, y: 0, w: 210, h: 66 }, { x: 780, y: 0, w: 180, h: 38 },
        { x: 1030, y: 0, w: 200, h: 58 }, { x: 1290, y: 0, w: 190, h: 44 },
        { x: 1500, y: 0, w: 180, h: 50 }
      ], [
        { x: 120, y: 0, w: 46, h: 34 }, { x: 300, y: 0, w: 30, h: 24 },
        { x: 430, y: 0, w: 40, h: 30 }, { x: 590, y: 0, w: 52, h: 40 },
        { x: 690, y: 0, w: 28, h: 22 }, { x: 880, y: 0, w: 36, h: 28 },
        { x: 1140, y: 0, w: 48, h: 36 }, { x: 1250, y: 0, w: 26, h: 20 },
        { x: 1400, y: 0, w: 40, h: 30 }
      ], 3.2, 7.7), '#122438', 812, 0.34, 738);

      /* 最近：几乎全黑的一条，把湖和山分开 */
      iceRidge(g, iceRidgePts(842, [
        { x: 100, y: 0, w: 240, h: 34 }, { x: 430, y: 0, w: 260, h: 40 },
        { x: 760, y: 0, w: 220, h: 28 }, { x: 1060, y: 0, w: 270, h: 42 },
        { x: 1350, y: 0, w: 240, h: 32 }
      ], [
        { x: 220, y: 0, w: 40, h: 20 }, { x: 500, y: 0, w: 44, h: 24 },
        { x: 640, y: 0, w: 26, h: 16 }, { x: 900, y: 0, w: 36, h: 18 },
        { x: 1180, y: 0, w: 46, h: 26 }, { x: 1420, y: 0, w: 32, h: 18 }
      ], 2.0, 11.3), '#0a1626', 842, 0.16, 802);

      /* 山脚的雾：把中景和冰湖之间糊一层，不然两排山都浮着 */
      g.fillStyle = lin(g, 0, 760, 0, 850, [
        0, 'rgba(126,164,200,0)', 0.55, 'rgba(112,158,196,.13)', 1, 'rgba(96,140,178,.04)'
      ]);
      g.fillRect(0, 760, W, 90);

      /* ================= 冰湖 ================= */
      g.fillStyle = lin(g, 0, ICE.lakeTop, 0, ICE.lakeBot, [
        0, '#1c4058', 0.30, '#17364c', 0.68, '#102838', 1, '#0c1e2b'
      ]);
      g.fillRect(0, ICE.lakeTop, W, ICE.lakeBot - ICE.lakeTop);

      /* 极光倒映在冰面上：一层一层很淡的横光，靠岸最近的那几条最亮 */
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (var wr = 0; wr < 12; wr++) {
        var wy = ICE.lakeTop + 4 + wr * 7.6;
        var wa = 0.075 - wr * 0.0052;
        if (wa <= 0) break;
        g.fillStyle = 'rgba(112,236,204,' + wa.toFixed(3) + ')';
        g.beginPath();
        g.ellipse(700 + Math.sin(wr * 0.9) * 90, wy, 660 - wr * 34, 2.4 + wr * 0.12, 0, 0, 7);
        g.fill();
      }
      bloom(g, 700, ICE.lakeTop + 8, 480, 'rgba(74,214,186,.13)', 1);
      g.restore();

      /* 冰面的裂纹：横着顺几条，偶尔分个岔 */
      if (full) {
        g.strokeStyle = 'rgba(214,240,255,.30)'; g.lineWidth = 1.1;
        for (var cr = 0; cr < 12; cr++) {
          var cxx = 30 + cr * 130 + (cr % 3) * 17;
          var cyy = ICE.lakeTop + 14 + (cr % 4) * 19;
          g.beginPath();
          g.moveTo(cxx, cyy);
          g.lineTo(cxx + 34, cyy + 5);
          g.lineTo(cxx + 62, cyy - 2);
          g.lineTo(cxx + 88, cyy + 4);
          g.stroke();
          if (cr % 3 === 0) {
            g.beginPath();
            g.moveTo(cxx + 34, cyy + 5);
            g.lineTo(cxx + 46, cyy + 16);
            g.stroke();
          }
        }
      }

      /* 碎冰 */
      var rw2 = seeded(88);
      for (var fl = 0; fl < (full ? 54 : 12); fl++) {
        var fx2 = rw2() * W, fy2 = ICE.lakeTop + 8 + rw2() * 76;
        var fw2 = 4 + rw2() * 15;
        g.fillStyle = 'rgba(226,244,255,' + (0.14 + rw2() * 0.36).toFixed(3) + ')';
        g.beginPath();
        g.ellipse(fx2, fy2, fw2, fw2 * 0.24, rw2() * 0.4, 0, 7);
        g.fill();
      }
      /* 浮着的冰山：近大远小 */
      icefloe(g, 250, 852, 74, 46, 5);
      icefloe(g, 556, 866, 58, 34, 9);
      icefloe(g, 792, 856, 86, 52, 13);
      icefloe(g, 1150, 870, 66, 40, 21);
      icefloe(g, 1400, 852, 52, 30, 27);
      /* 靠岸的冰排：贴着水边的一条白 */
      g.fillStyle = 'rgba(232,246,255,.62)';
      for (var isl = 0; isl < 16; isl++) {
        var ix = -20 + isl * 98 + rnd() * 40;
        lens(g, ix, ICE.lakeBot - 3 + rnd() * 4, 32 + rnd() * 34, 4 + rnd() * 3, 0);
        g.fill();
      }

      /* ================= 左：一条压进湖里的冰川 =================
         先画湖再画冰：冰舌是探进水里的，若先画冰再盖水，
         冰就只剩水面以上一条白边（上一版就是那样，看着像一道白线）。
         造型走「低多边形冰体」——几块大折面 + 亮棱，
         和这个游戏其它地图的平面画风一致，也比画一堆弧线更像冰。 */
      function icePoly(pts, fill) {
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.closePath();
        g.fillStyle = fill; g.fill();
      }
      var GL_OUT = [[560, 764], [640, 772], [712, 796], [748, 824], [742, 858],
        [700, 872], [640, 880], [560, 882], [480, 878], [410, 870],
        [356, 858], [316, 832], [318, 800], [368, 778], [452, 768]];
      icePoly(GL_OUT, lin(g, 430, 760, 640, 882, [
        0, '#ffffff', 0.30, '#eaf8ff', 0.62, '#c6e2f5', 1, '#84b6d6'
      ]));
      g.save();
      g.beginPath();
      g.moveTo(GL_OUT[0][0], GL_OUT[0][1]);
      for (var gi = 1; gi < GL_OUT.length; gi++) g.lineTo(GL_OUT[gi][0], GL_OUT[gi][1]);
      g.closePath(); g.clip();
      /* 折面：每块一个冷暖，明暗拉开，冰的体积就出来了 */
      icePoly([[452, 768], [560, 764], [640, 772], [712, 796], [556, 828]], 'rgba(255,255,255,.56)');
      icePoly([[556, 828], [712, 796], [748, 824], [742, 858], [660, 868]], 'rgba(40,94,142,.32)');
      icePoly([[368, 778], [452, 768], [556, 828], [470, 856]], 'rgba(120,172,210,.15)');
      icePoly([[470, 856], [660, 868], [640, 880], [480, 878], [410, 870]], 'rgba(26,74,120,.40)');
      icePoly([[318, 800], [368, 778], [470, 856], [410, 870], [356, 858], [316, 832]], 'rgba(240,252,255,.46)');
      /* 竖向的冰棱：冰舌表面被拉出来的一道道沟 */
      g.strokeStyle = 'rgba(255,255,255,.40)'; g.lineWidth = 1.3;
      var flute = [400, 442, 486, 528, 572, 618, 664];
      for (var fl2 = 0; fl2 < flute.length; fl2++) {
        g.beginPath();
        g.moveTo(flute[fl2] + 6, 772 + (fl2 % 3) * 6);
        g.lineTo(flute[fl2] - 4, 862 + (fl2 % 2) * 8);
        g.stroke();
      }
      /* 冰裂隙：短、直、带一点折角，不要画成弧（弯的会看成笑脸） */
      g.strokeStyle = 'rgba(44,96,142,.32)'; g.lineWidth = 1.5;
      for (var gc = 0; gc < 8; gc++) {
        var gx2 = 350 + ((gc * 57) % 330), gy2 = 812 + ((gc * 31) % 54);
        g.beginPath();
        g.moveTo(gx2, gy2);
        g.lineTo(gx2 + 14, gy2 + 5 + (gc % 3));
        g.lineTo(gx2 + 30, gy2 + 1);
        g.stroke();
      }
      /* 冰洞：不是「一个黑眼珠」，而是一块凹进去的深蓝 —— 边缘软、里面也没有死黑 */
      var cav = g.createRadialGradient(392, 848, 8, 392, 852, 54);
      cav.addColorStop(0, 'rgba(26,88,116,.34)');
      cav.addColorStop(0.55, 'rgba(30,96,126,.16)');
      cav.addColorStop(1, 'rgba(34,104,134,0)');
      g.fillStyle = cav;
      g.beginPath(); g.ellipse(392, 850, 58, 30, -0.10, 0, 7); g.fill();
      g.restore();
      /* 冰舌边缘的亮边 */
      g.strokeStyle = 'rgba(248,255,255,.66)'; g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(452, 768); g.lineTo(560, 764); g.lineTo(640, 772); g.lineTo(712, 796);
      g.stroke();
      /* 入水处：一圈更深的蓝 + 一层倒影 */
      g.fillStyle = 'rgba(30,84,126,.36)';
      g.beginPath();
      g.moveTo(316, 832); g.lineTo(356, 858); g.lineTo(410, 870); g.lineTo(480, 878);
      g.lineTo(560, 882); g.lineTo(640, 880); g.lineTo(700, 872); g.lineTo(742, 858);
      g.lineTo(742, 898); g.lineTo(316, 898);
      g.closePath(); g.fill();

      /* ================= 右：一整面冰崖 =================
         不用一排尖齿（那会像白栅栏）：顶边是一条连着的崖脊，
         靠不规则间距的竖冰裂 + 明暗分块做出「一整面墙」。 */
      var CF_TOP = [[896, 822], [940, 800], [986, 778], [1040, 762], [1096, 750],
        [1152, 738], [1206, 732], [1262, 738], [1318, 748], [1372, 754],
        [1428, 758], [1472, 764], [1512, 758]];
      g.beginPath();
      g.moveTo(896, 878);
      g.lineTo(896, 818);
      for (var cf = 1; cf < CF_TOP.length; cf++) g.lineTo(CF_TOP[cf][0], CF_TOP[cf][1]);
      g.lineTo(1512, 878);
      g.closePath();
      var cliff = g.createLinearGradient(0, 716, 0, 878);
      cliff.addColorStop(0, '#fbfeff');
      cliff.addColorStop(0.26, '#e8f6fe');
      cliff.addColorStop(0.66, '#bcdcf1');
      cliff.addColorStop(1, '#6ba3c6');
      g.fillStyle = cliff; g.fill();
      g.save();
      g.clip();
      /* 折面：冰崖也用「几块大折面 + 亮棱」来画。
         竖条纹会像铁皮瓦/栅栏，纯白渐变会像一顶帐篷——
         折面才有体积，也和左边那条冰川是一套画法。 */
      var bx = [896, 992, 1082, 1176, 1270, 1382, 1512];
      var bsk = [0, 16, -12, 20, -14, 9, 0];
      for (var bi = 0; bi < 6; bi++) {
        var t0 = [bx[bi], 698], t1 = [bx[bi + 1], 698];
        var b1 = [bx[bi + 1] + bsk[bi + 1], 892], b0 = [bx[bi] + bsk[bi], 892];
        icePoly([t0, t1, b1, b0], bi % 2
          ? 'rgba(255,255,255,.17)'
          : 'rgba(40,94,140,.15)');
        g.strokeStyle = 'rgba(255,255,255,.42)'; g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(t0[0], t0[1]); g.lineTo(b0[0], b0[1]);
        g.stroke();
      }
      /* 靠下才有的几道短竖沟：冰壁脚下被水啃出来的痕 */
      g.strokeStyle = 'rgba(40,94,140,.20)'; g.lineWidth = 2.2;
      for (var gq = 0; gq < 9; gq++) {
        var qx = 910 + gq * 68 + ((gq * 37) % 23);
        g.beginPath();
        g.moveTo(qx, 824 + (gq % 3) * 9);
        g.lineTo(qx + (gq % 2 ? 5 : -4), 880);
        g.stroke();
      }
      /* 横向的冰层：很淡的几道，说明冰是一层层积的 */
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.4;
      for (var ly = 0; ly < 5; ly++) {
        var lyy = 776 + ly * 20;
        g.beginPath();
        g.moveTo(896, lyy + Math.sin(ly) * 4);
        g.quadraticCurveTo(1200, lyy - 5, 1512, lyy + 3);
        g.stroke();
      }
      /* 贴水的那一截更蓝 */
      g.fillStyle = lin(g, 0, 830, 0, 878, [0, 'rgba(52,118,164,0)', 1, 'rgba(32,90,136,.66)']);
      g.fillRect(896, 830, 620, 50);
      g.restore();
      /* 崖顶的雪 */
      g.strokeStyle = 'rgba(252,255,255,.78)'; g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(896, 818);
      for (var ct = 1; ct < CF_TOP.length; ct++) g.lineTo(CF_TOP[ct][0], CF_TOP[ct][1]);
      g.stroke();

      /* 崩下来的冰块：浮在冰舌和冰崖前面 */
      icefloe(g, 330, 886, 26, 13, 41);
      icefloe(g, 742, 880, 22, 11, 43);
      icefloe(g, 862, 870, 30, 15, 47);
      icefloe(g, 1470, 884, 24, 12, 49);

      /* ================= 岸：黑色火山砂 =================
         这一段整体压在 892~1060 这 170 个单位里，1060 往下只留一层渐到全黑的砂，
         给镜头一点余量：地图太高时人会贴在最底下，天也就留不住。 */
      g.fillStyle = lin(g, 0, ICE.shoreTop, 0, 1140, [
        0, '#26262c', 0.16, '#1d1e23', 0.44, '#151619', 0.74, '#0f1013', 1, '#08090c'
      ]);
      g.beginPath();
      g.moveTo(-10, 1150);
      g.lineTo(-10, ICE.shoreTop + 4);
      g.bezierCurveTo(240, ICE.shoreTop - 6, 470, ICE.shoreTop + 12, 700, ICE.shoreTop);
      g.bezierCurveTo(920, ICE.shoreTop - 12, 1150, ICE.shoreTop + 14, 1360, ICE.shoreTop);
      g.bezierCurveTo(1430, ICE.shoreTop - 5, 1480, ICE.shoreTop + 4, 1510, ICE.shoreTop - 2);
      g.lineTo(1510, 1150);
      g.closePath();
      g.fill();
      /* 贴着水的那一条湿砂，比别处深 */
      g.fillStyle = 'rgba(6,10,16,.42)';
      g.beginPath();
      g.moveTo(-10, ICE.shoreTop + 6);
      g.bezierCurveTo(240, ICE.shoreTop - 4, 470, ICE.shoreTop + 14, 700, ICE.shoreTop + 2);
      g.bezierCurveTo(920, ICE.shoreTop - 10, 1150, ICE.shoreTop + 16, 1360, ICE.shoreTop + 2);
      g.bezierCurveTo(1430, ICE.shoreTop - 3, 1480, ICE.shoreTop + 6, 1510, ICE.shoreTop);
      g.lineTo(1510, ICE.shoreTop + 24);
      g.bezierCurveTo(1200, ICE.shoreTop + 36, 900, ICE.shoreTop + 24, 600, ICE.shoreTop + 32);
      g.bezierCurveTo(300, ICE.shoreTop + 40, 100, ICE.shoreTop + 24, -10, ICE.shoreTop + 30);
      g.closePath();
      g.fill();

      /* 岸上的雪：贴着水先铺一条连续的雪带，再往里有几片被风吹散的积雪。
         注意两点——① 雪要白：低透明度的白压在黑砂上只会变成灰，
         看着像一摊水洼；② 形状要长、要薄，「被风吹出来的一层」不是一堆圆饼。 */
      g.save();
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.strokeStyle = 'rgba(224,240,254,.92)'; g.lineWidth = 19;
      g.beginPath();
      g.moveTo(-20, ICE.shoreTop + 9);
      g.bezierCurveTo(240, ICE.shoreTop - 1, 470, ICE.shoreTop + 17, 700, ICE.shoreTop + 5);
      g.bezierCurveTo(920, ICE.shoreTop - 7, 1150, ICE.shoreTop + 19, 1360, ICE.shoreTop + 5);
      g.bezierCurveTo(1430, ICE.shoreTop, 1480, ICE.shoreTop + 9, 1520, ICE.shoreTop + 3);
      g.stroke();
      /* 雪带不能是一条完美平行线：压几块黑砂回去，让它断断续续 */
      g.fillStyle = 'rgba(22,23,27,.55)';
      for (var bk = 0; bk < (full ? 16 : 5); bk++) {
        lens(g, rnd() * W, ICE.shoreTop + 3 + rnd() * 14, 16 + rnd() * 40, 3 + rnd() * 5, 0);
        g.fill();
      }
      /* 往里的积雪：一片一片，薄、长、边缘收尖。
         雪一定要够白——低透明的白压在黑砂上只会变成一块灰色水洼。 */
      for (var sp2 = 0; sp2 < (full ? 11 : 3); sp2++) {
        var sx3 = -40 + sp2 * 142 + rnd() * 60;
        var sy3 = ICE.shoreTop + 12 + rnd() * 118;
        var sw3 = 60 + rnd() * 96, sh3 = 6 + rnd() * 7;
        g.fillStyle = 'rgba(46,84,126,.20)';
        lens(g, sx3 + 6, sy3 + sh3 * 0.8, sw3, sh3 * 0.7, 0);
        g.fill();
        g.fillStyle = 'rgba(238,249,255,' + (0.74 + rnd() * 0.22).toFixed(2) + ')';
        lens(g, sx3, sy3, sw3, sh3, (rnd() - 0.5) * 0.05);
        g.fill();
      }
      /* 几道被风拉长的雪痕 */
      g.strokeStyle = 'rgba(226,242,254,.24)'; g.lineWidth = 1.6;
      if (full) {
        for (var wk = 0; wk < 9; wk++) {
          var wkx = rnd() * W, wky = ICE.shoreTop + 22 + rnd() * 140;
          g.beginPath();
          g.moveTo(wkx - 70, wky);
          g.quadraticCurveTo(wkx, wky - 5, wkx + 90, wky + 2);
          g.stroke();
        }
      }
      g.restore();
      /* 雪里露出来的黑砂：细长的斑，别摆成均匀的点 */
      for (var sp = 0; sp < (full ? 34 : 9); sp++) {
        g.fillStyle = 'rgba(18,19,24,' + (0.12 + rnd() * 0.26).toFixed(3) + ')';
        lens(g, rnd() * W, ICE.shoreTop + 10 + rnd() * 150, 18 + rnd() * 56, 3 + rnd() * 7, 0);
        g.fill();
      }
      /* 风吹出来的砂纹：很淡的横线，给地面一点朝向 */
      if (full) {
        g.strokeStyle = 'rgba(150,158,176,.055)'; g.lineWidth = 1.4;
        for (var wl = 0; wl < 14; wl++) {
          var wy2 = ICE.shoreTop + 14 + wl * 11;
          var wo = rnd() * 300;
          g.beginPath();
          g.moveTo(wo - 120, wy2);
          g.quadraticCurveTo(wo + 120, wy2 - 4, wo + 360, wy2 + 1);
          g.stroke();
        }
      }

      /* ================= 木栈台 ================= */
      deck(g, 616, 942, 168, 1.2);      // 观景台（view 就在这里）
      deck(g, 906, 984, 104, 0.9);      // 另一处矮木台（合影用）

      /* ================= 玄武岩 ================= */
      function boulder(bx, by, bw2, bh2, seed) {
        var rb = seeded(seed);
        g.fillStyle = 'rgba(3,5,9,.50)';
        g.beginPath(); g.ellipse(bx + bw2 / 2, by + bh2 - 1, bw2 * 0.58, bh2 * 0.24, 0, 0, 7); g.fill();
        g.beginPath();
        g.moveTo(bx, by + bh2);
        g.lineTo(bx + bw2 * 0.04, by + bh2 * 0.40);
        g.lineTo(bx + bw2 * 0.30, by);
        g.lineTo(bx + bw2 * 0.68, by + bh2 * 0.11);
        g.lineTo(bx + bw2, by + bh2 * 0.48);
        g.lineTo(bx + bw2, by + bh2);
        g.closePath();
        var bg2 = g.createLinearGradient(bx, by, bx, by + bh2);
        bg2.addColorStop(0, '#3a3e47');
        bg2.addColorStop(1, '#121418');
        g.fillStyle = bg2; g.fill();
        /* 雪帽 */
        g.fillStyle = 'rgba(238,249,255,.95)';
        g.beginPath();
        g.moveTo(bx + bw2 * 0.06, by + bh2 * 0.40);
        g.lineTo(bx + bw2 * 0.30, by + 1);
        g.lineTo(bx + bw2 * 0.68, by + bh2 * 0.13);
        g.lineTo(bx + bw2 * 0.58, by + bh2 * 0.26);
        g.lineTo(bx + bw2 * 0.32, by + bh2 * 0.16);
        g.closePath(); g.fill();
        /* 石面细裂纹 */
        g.strokeStyle = 'rgba(178,188,204,.16)'; g.lineWidth = 1;
        for (var kk = 0; kk < 3; kk++) {
          g.beginPath();
          g.moveTo(bx + bw2 * (0.2 + rb() * 0.5), by + bh2 * 0.55);
          g.lineTo(bx + bw2 * (0.3 + rb() * 0.5), by + bh2 * 0.88);
          g.stroke();
        }
      }
      boulder(382, 918, 96, 44, 6);
      boulder(1052, 940, 90, 42, 8);
      boulder(70, 986, 122, 52, 15);
      boulder(1424, 1000, 96, 40, 19);

      /* 岸边的碎冰：几块被冲上来的蓝冰，给前景一点颜色 */
      icefloe(g, 262, 934, 34, 18, 33);
      icefloe(g, 836, 962, 26, 14, 35);
      icefloe(g, 1160, 976, 30, 16, 37);

      /* 右端那片矮岩台 */
      g.fillStyle = '#191b20';
      g.beginPath();
      g.moveTo(1362, 1022);
      g.lineTo(1362, 982); g.lineTo(1392, 968); g.lineTo(1434, 973);
      g.lineTo(1476, 964); g.lineTo(1494, 976); g.lineTo(1494, 1022);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(232,244,253,.88)';
      g.beginPath();
      g.moveTo(1362, 982); g.lineTo(1392, 968); g.lineTo(1434, 973);
      g.lineTo(1476, 964); g.lineTo(1494, 976); g.lineTo(1494, 986);
      g.lineTo(1476, 975); g.lineTo(1434, 984); g.lineTo(1392, 979);
      g.closePath();
      g.fill();

      /* 木头界桩 + 反光条 */
      function stake(sx2, sy2, s2) {
        g.strokeStyle = 'rgba(4,6,10,.45)'; g.lineWidth = 4 * s2;
        g.beginPath(); g.moveTo(sx2 + 2, sy2 + 2); g.lineTo(sx2 + 2, sy2 - 32 * s2); g.stroke();
        g.strokeStyle = '#6a5744'; g.lineWidth = 3.2 * s2;
        g.beginPath(); g.moveTo(sx2, sy2); g.lineTo(sx2, sy2 - 32 * s2); g.stroke();
        g.fillStyle = 'rgba(238,248,255,.9)';
        g.beginPath(); g.ellipse(sx2, sy2 - 32 * s2, 3.2 * s2, 1.7 * s2, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(230,238,246,.55)';
        g.fillRect(sx2 - 1.5 * s2, sy2 - 21 * s2, 3 * s2, 5.4 * s2);
      }
      stake(238, 972, 1);
      stake(296, 978, 1);
      stake(862, 966, 1);

      /* 雪地里的小草：几撮就够 */
      var rt = seeded(41);
      for (var tf = 0; tf < (full ? 20 : 6); tf++) {
        var tfx = 60 + rt() * 1380, tfy = 906 + rt() * 110;
        if (tfy < 940 && tfx > 600 && tfx < 820) continue;
        if (tfx > 1350 && tfy > 950) continue;
        tuft(g, tfx, tfy, 0.7 + rt() * 0.5, 'rgba(146,136,106,.45)');
      }
      /* 一串脚印，从木栈台往右走 */
      if (full) {
        for (var fp = 0; fp < 13; fp++) {
          var fpx = 796 + fp * 24, fpy = 918 + Math.sin(fp * 0.9) * 8 + fp * 2.0;
          g.fillStyle = 'rgba(126,150,174,.22)';
          g.beginPath(); g.ellipse(fpx, fpy, 3.2, 1.8, 0.3, 0, 7); g.fill();
          g.beginPath(); g.ellipse(fpx + 7.5, fpy + 3.6, 3.2, 1.8, 0.3, 0, 7); g.fill();
        }
      }

      /* 回小镇的路牌 */
      g.fillStyle = 'rgba(3,7,12,.45)';
      g.beginPath(); g.ellipse(182, 970, 24, 6.5, 0, 0, 7); g.fill();
      g.fillStyle = '#5a4a38'; g.fillRect(176, 890, 8, 80);
      g.fillStyle = '#c9b79c';
      g.beginPath();
      g.moveTo(182, 896); g.lineTo(266, 900); g.lineTo(254, 918); g.lineTo(182, 916);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(30,26,20,.55)'; g.lineWidth = 1.6; g.stroke();
      text(g, '小镇', 220, 913, 14, '#2a241c');
      g.fillStyle = 'rgba(238,248,255,.9)';
      g.beginPath(); g.ellipse(180, 886, 11, 3.6, 0, 0, 7); g.fill();

      if (full) {
        vignette(g, 0.34, 'rgba(3,8,18,.46)');
        grain(g, 900, 17);
      }
    },
    anim: function (ctx, t) {
      /* 极光在动：半分辨率的一张图，每帧一次 drawImage。 */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var spr = auroraSprite();
      var dx = Math.sin(t / 12000) * 26;
      var dy = Math.sin(t / 7700 + 1.2) * 7;
      ctx.globalAlpha = 0.40 + 0.08 * Math.sin(t / 6300);
      ctx.drawImage(spr, dx, AUR_TOP + dy, 1520, AUR_BOT - AUR_TOP);
      ctx.restore();

      /* 星光呼吸：只挑十几颗 */
      ctx.save();
      for (var i = 0; i < 14; i++) {
        var sx = 50 + i * 104;
        var sy = 50 + ((i * 173) % 460);
        var a = 0.13 + 0.19 * (0.5 + 0.5 * Math.sin(t / 1500 + i * 1.7));
        ctx.fillStyle = 'rgba(226,242,255,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(sx, sy, 1.4, 0, 7); ctx.fill();
      }
      ctx.restore();

      /* 冰面上的微光：贴着水走 */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var k = 0; k < 8; k++) {
        var wx = 110 + k * 186 + Math.sin(t / 2800 + k) * 14;
        var wa = 0.05 + 0.05 * Math.sin(t / 2000 + k * 2.1);
        ctx.fillStyle = 'rgba(190,255,236,' + Math.max(0, wa).toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(wx, 812 + (k % 3) * 17, 46, 3.2, 0, 0, 7);
        ctx.fill();
      }
      ctx.restore();

      /* 雪：很少的几片 */
      ctx.save();
      for (var f = 0; f < 26; f++) {
        var fx = ((t / 52 + f * 141) % 1620) - 60;
        var fy = 140 + ((f * 73 + Math.sin(t / 2600 + f) * 24) % 960);
        var fa = 0.10 + 0.22 * ((f % 5) / 5);
        ctx.fillStyle = 'rgba(240,250,255,' + fa.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(fx, fy, 0.9 + (f % 3) * 0.5, 0, 7); ctx.fill();
      }
      ctx.restore();

      /* 动态层的两个小色块：站着、不动、不参与碰撞，也没有提示与标签。
         画在动态层而不是背景里，所以缩略图和合影里都不会出现。 */
      ctx.save();
      var br = Math.sin(t / 2300) * 0.5;
      [[1398, 0], [1428, 1]].forEach(function (p, pi) {
        var px = p[0], py = 1018 + (p[1] ? 2 : 0);
        ctx.fillStyle = 'rgba(3,6,11,.40)';
        ctx.beginPath(); ctx.ellipse(px, py + 1, 9, 2.6, 0, 0, 7); ctx.fill();
        /* 大衣（背对） */
        ctx.fillStyle = pi ? '#161c27' : '#1c222c';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(px - 6.2, py - 27 + br * 0.3, 12.4, 27, 3.8);
        else ctx.rect(px - 6.2, py - 27 + br * 0.3, 12.4, 27);
        ctx.fill();
        /* 肩 */
        ctx.beginPath(); ctx.arc(px, py - 27.5 + br * 0.3, 5.6, Math.PI, 0); ctx.fill();
        /* 头 */
        ctx.fillStyle = '#242832';
        ctx.beginPath(); ctx.arc(px, py - 35 + br * 0.3, 4.8, 0, 7); ctx.fill();
        /* 极光打在肩上的一点边光 */
        ctx.strokeStyle = 'rgba(150,255,214,.34)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py - 35 + br * 0.3, 4.8, Math.PI * 1.06, Math.PI * 1.58);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px - 6, py - 22 + br * 0.3);
        ctx.lineTo(px - 6, py - 6 + br * 0.3);
        ctx.stroke();
      });
      /* 脚边一盏小灯 */
      bloom(ctx, 1413, 1030, 26, 'rgba(255,214,150,.26)', 1);
      ctx.fillStyle = 'rgba(255,232,180,.8)';
      ctx.beginPath(); ctx.arc(1413, 1030, 2, 0, 7); ctx.fill();
      ctx.restore();
    }
  };

  /* 动态细节：只在背景之上叠很少几笔，避免 iPhone 掉帧 */
  var EXTRA_ANIM = {
    sayram: function (g, t) {
      /* 草地上被风吹的一小片草浪 */
      g.strokeStyle = 'rgba(132,168,104,.34)'; g.lineWidth = 1.6;
      for (var i = 0; i < 26; i++) {
        var x = 120 + i * 52;
        var sway = Math.sin(t / 900 + i * 0.6) * 4;
        g.beginPath();
        g.moveTo(x, 1080 + (i % 3) * 18);
        g.quadraticCurveTo(x + sway, 1062, x + sway * 1.6, 1046);
        g.stroke();
      }
    },
    tibet: function (g, t) {
      /* 高原风里的一层浮尘 */
      g.fillStyle = 'rgba(232,226,206,.10)';
      for (var i = 0; i < 12; i++) {
        var x = ((t / 60 + i * 130) % 1600) - 50;
        g.beginPath();
        g.ellipse(x, 1000 + (i % 4) * 40, 22, 5, 0, 0, 7);
        g.fill();
      }
    },
    doha: function (g, t) {
      /* 路灯的呼吸感（很轻，只在灯罩附近） */
      var a = 0.16 + 0.08 * Math.sin(t / 900);
      var rg = g.createRadialGradient(300, 926, 2, 300, 926, 40);
      rg.addColorStop(0, 'rgba(255,226,164,' + a + ')');
      rg.addColorStop(1, 'rgba(255,226,164,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(300, 926, 40, 0, 7); g.fill();
    },
    wuhan: function (g, t) {
      /* 江边灯影在水里被拉长、轻轻晃 */
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 5; i++) {
        var x = 220 + i * 210 + Math.sin(t / 1600 + i) * 10;
        g.fillStyle = 'rgba(255,210,140,.045)';
        g.beginPath();
        g.ellipse(x, 800 + i * 22, 30 + Math.sin(t / 1200 + i) * 8, 4, 0, 0, 7);
        g.fill();
      }
      g.restore();
    },
    wuhai: function (g, t) {
      /* 沙面上被风带起来的一层薄沙（只在近处） */
      g.fillStyle = 'rgba(232,196,148,.09)';
      for (var i = 0; i < 10; i++) {
        var x = ((t / 40 + i * 170) % 1700) - 60;
        g.beginPath();
        g.ellipse(x, 1090 + (i % 3) * 26, 40, 6, 0, 0, 7);
        g.fill();
      }
    },
    kl: function (g, t) {
      /* 喷泉水花：一圈起落的水柱 */
      ctxSpray(g, 432, 1012, t);
    }
  };

  function ctxSpray(g, x, y, t) {
    g.strokeStyle = 'rgba(216,238,246,.6)'; g.lineWidth = 2;
    for (var i = 0; i < 6; i++) {
      var ph = (t / 900 + i / 6) % 1;
      var h = 26 + Math.sin(ph * Math.PI) * 26;
      var dx = (i - 2.5) * 7;
      g.beginPath();
      g.moveTo(x + dx * 0.4, y);
      g.quadraticCurveTo(x + dx * 0.8, y - h * 0.7, x + dx, y - h);
      g.stroke();
    }
  }

  function paintBg(id) {
    var d = D[id];
    if (!d || typeof document === 'undefined') return null;
    var c = document.createElement('canvas');
    c.width = d.w; c.height = d.h;
    var g = c.getContext('2d');
    g.save();
    try { d.paint(g, 'full'); } catch (e) { g.fillStyle = '#2a3350'; g.fillRect(0, 0, d.w, d.h); }
    /* v4.1 环境细节：草丛/石头/长椅/路灯……叠在地面层，人物仍然画在它上面 */
    try { if (EXTRA[id]) EXTRA[id](g); } catch (e) { }
    g.restore();
    return c;
  }
  function bg(id) {
    if (cache[id]) return cache[id];
    var c = paintBg(id);
    if (!c) return null;
    cache[id] = c;
    cacheOrder.push(id);
    while (cacheOrder.length > 2) {
      var old = cacheOrder.shift();
      if (old !== id) delete cache[old];
    }
    return c;
  }

  /* 缩略图：把同一套 paint 缩放到 300×200（和地图同比例 1.5:1） */
  function thumb(id, cv) {
    var d = D[id];
    if (!d || !cv) return;
    cv.width = 300; cv.height = 200;
    var g = cv.getContext('2d');
    g.save();
    g.scale(300 / d.w, 200 / d.h);
    try { d.paint(g, 'thumb'); } catch (e) { g.fillStyle = '#2a3350'; g.fillRect(0, 0, d.w, d.h); }
    g.restore();
  }

  /* ---------- 车票 ----------
   * 六张票共用同一套版式（纸张 + 顶部色带 + 左侧风景窗 + 右侧副券），
   * 各张只换颜色、编号和目的地代号——统一里带地方感。
   * 画到任意 canvas 上：TravelMaps.ticket(id, cv, owned)
   */
  var TK_W = 320, TK_H = 150;
  var tkCache = {};

  function tkRR(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* 票面上的小风景窗：把缩略图按正方形裁一块，缓存起来（别为每张票重烘全图） */
  function tkScene(id) {
    if (tkCache[id]) return tkCache[id];
    var d = D[id];
    if (!d) return null;
    var cv = document.createElement('canvas');
    cv.width = 300; cv.height = 200;
    var g = cv.getContext('2d');
    g.save();
    g.scale(300 / d.w, 200 / d.h);
    try { d.paint(g, 'thumb'); } catch (e) { }
    g.restore();
    tkCache[id] = cv;
    return cv;
  }

  function drawTicket(g, id, owned) {
    var d = D[id];
    if (!d) return;
    var tk = d.ticket || { color: '#8a7a5a', paper: '#f4ead8', ink: '#2a2118', no: '00', code: '---' };
    var ink = tk.ink || '#2a2118';

    g.clearRect(0, 0, TK_W, TK_H);
    g.save();

    /* 纸面 */
    tkRR(g, 0.5, 0.5, TK_W - 1, TK_H - 1, 10);
    g.fillStyle = owned ? tk.paper : '#d9d5cc';
    g.fill();
    g.save();
    g.clip();

    /* 一点纸纹（很淡，只在深色纸上看得出层次） */
    g.fillStyle = 'rgba(255,255,255,.30)';
    for (var i = 0; i < 26; i++) g.fillRect((i * 47) % TK_W, (i * 29) % TK_H, 26, 1);

    /* 顶部色带 */
    g.fillStyle = owned ? tk.color : '#9a958c';
    g.fillRect(0, 0, TK_W, 9);
    g.fillStyle = 'rgba(255,255,255,.32)';
    g.fillRect(0, 0, TK_W, 2);

    /* 左侧风景窗 */
    var sx = 14, sy = 26, sw = 80, sh = 80;
    tkRR(g, sx, sy, sw, sh, 5);
    g.save();
    g.clip();
    if (!owned) {
      /* 没票的时候连风景窗都不给看——不然一眼就知道要去哪儿了 */
      g.fillStyle = '#8d8981';
      g.fillRect(sx, sy, sw, sh);
      g.fillStyle = 'rgba(255,255,255,.10)';
      for (var qy = 0; qy < sh; qy += 9) g.fillRect(sx, sy + qy, sw, 4);
      text(g, '?', sx + sw / 2, sy + 58, 42, 'rgba(245,243,238,.62)', 'center', '700');
    } else {
      var sc = tkScene(id);
      if (sc) {
        g.drawImage(sc, 50, 0, 200, 200, sx, sy, sw, sh);
      } else {
        g.fillStyle = tk.color; g.fillRect(sx, sy, sw, sh);
      }
    }
    /* 照片压一层暖光，和整体色纸贴得更近 */
    g.fillStyle = owned ? 'rgba(255,238,205,.12)' : 'rgba(210,206,198,.55)';
    g.fillRect(sx, sy, sw, sh);
    g.restore();
    g.strokeStyle = 'rgba(30,20,10,.28)';
    g.lineWidth = 1;
    tkRR(g, sx, sy, sw, sh, 5);
    g.stroke();

    /* 目的地名字 */
    text(g, owned ? d.name : '？ ？ ？', 108, 56, owned ? 21 : 19, owned ? ink : '#6c6862', 'left', '700');
    text(g, owned ? d.sub : '目的地未知', 108, 75, 10.5,
      owned ? 'rgba(30,20,10,.62)' : 'rgba(90,88,84,.6)', 'left', '400');

    /* 虚线分隔 */
    g.strokeStyle = owned ? 'rgba(30,20,10,.28)' : 'rgba(90,88,84,.3)';
    g.lineWidth = 1;
    g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(108, 86); g.lineTo(240, 86); g.stroke();
    g.setLineDash([]);

    /* 出发站 + 代号 */
    text(g, 'OMO RAIL · 圣诞小镇站', 108, 103, 8.5, owned ? 'rgba(30,20,10,.55)' : 'rgba(90,88,84,.55)', 'left', '400');
    text(g, '→ ' + (owned ? d.name : '？？？'), 108, 126, 11.5, owned ? tk.color : '#7b776f', 'left', '700');

    /* 右侧副券 */
    var cx = 254;
    g.strokeStyle = owned ? 'rgba(30,20,10,.3)' : 'rgba(90,88,84,.3)';
    g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(cx, 14); g.lineTo(cx, TK_H - 14); g.stroke();
    g.setLineDash([]);

    text(g, 'No.', cx + 34, 34, 8.5, owned ? 'rgba(30,20,10,.5)' : 'rgba(90,88,84,.5)', 'center', '400');
    text(g, tk.no || '00', cx + 34, 60, 26, owned ? ink : '#7b776f', 'center', '700');
    /* 没票的时候连三字代号也留白：ISL / SRM 这种缩写一样能让人猜出目的地。
       有票才印真代号。 */
    text(g, owned ? (tk.code || '---') : '---', cx + 34, 78, 9.5, owned ? tk.color : '#8b8780', 'center', '600');

    /* 打孔 */
    g.fillStyle = owned ? '#ffffff' : '#efece6';
    g.beginPath(); g.arc(cx + 34, 102, 6.5, 0, 7); g.fill();
    g.strokeStyle = owned ? 'rgba(30,20,10,.22)' : 'rgba(90,88,84,.25)';
    g.lineWidth = 1; g.stroke();

    text(g, 'CHRISTMAS', cx + 34, 124, 6.6, owned ? 'rgba(30,20,10,.45)' : 'rgba(90,88,84,.45)', 'center', '600');
    text(g, 'LINE', cx + 34, 134, 6.6, owned ? 'rgba(30,20,10,.45)' : 'rgba(90,88,84,.45)', 'center', '600');

    g.restore(); // clip

    /* 边框 */
    g.strokeStyle = owned ? 'rgba(30,20,10,.30)' : 'rgba(110,106,98,.45)';
    g.lineWidth = 1.4;
    tkRR(g, 0.5, 0.5, TK_W - 1, TK_H - 1, 10);
    g.stroke();

    /* 未获得：斜盖章 */
    if (!owned) {
      g.save();
      g.translate(TK_W / 2 - 6, TK_H / 2 + 8);
      g.rotate(-0.16);
      g.strokeStyle = 'rgba(150,72,58,.55)';
      g.lineWidth = 2;
      g.strokeRect(-52, -17, 104, 34);
      text(g, '还没有票', 0, 6, 15, 'rgba(150,72,58,.68)', 'center', '700');
      g.restore();
    }

    g.restore();
  }

  function ticket(id, cv, owned) {
    if (!cv) return;
    cv.width = TK_W; cv.height = TK_H;
    drawTicket(cv.getContext('2d'), id, owned);
  }

  function list() {
    return ORDER.filter(function (id) { return !!D[id]; }).map(function (id) { return D[id]; });
  }
  function get(id) { return D[id] || null; }

  function animExtra(id, g, t) {
    if (EXTRA_ANIM[id]) { try { EXTRA_ANIM[id](g, t); } catch (e) { } }
  }

  return {
    get: get, list: list, bg: bg, thumb: thumb, ticket: ticket, animExtra: animExtra,
    W: W, H: H, has: function (id) { return !!D[id]; }
  };
})();
