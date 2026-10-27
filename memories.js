/* memories.js — 我们的旅行回忆册（v2 事实核对版）
 * ★ 照片（可选增强）：以后把照片放进项目（如 photos/wuhai.jpg），把 image 改成路径即可。
 * ★ 全部内容基于我们的真实经历，不虚构细节：
 *   乌海=沙漠+湖泊+越野车+蜥蜴（不是海边！）；赛里木湖=2026-05-11 登记结婚；扬州=酒店牙刷纪念。
 * art: 每条一个原创像素小插画绘制函数（ctx 已平移到插画左上角，画布 w×h）。
 */
window.Memories = [
  { id: 'wuhai', x: 370, y: 935, title: '乌海 · 沙漠与湖', location: '内蒙古 · 乌海', date: '', object: 'jeep', color: '#d8b06a', map: 'wuhai', image: null,
    message: '一半是沙漠，一半是湖。我们开着越野车爬上沙丘，还认真地学习了怎么辨认小蜥蜴的脚印。' },
  { id: 'doha', x: 1295, y: 1075, title: '多哈 · 夜晚的主街', location: '卡塔尔 · 多哈', date: '', object: 'lantern', color: '#f0d8a8', map: 'doha', image: null,
    message: '晚上在主街散步，拍来来往往的行人，逛了一路的橱窗。这座城市的珍珠历史很美，虽然我们只是路过它的人。' },
  { id: 'tibet', x: 110, y: 650, title: '西藏 · 高处的天空', location: '西藏', date: '', object: 'bottle', color: '#8ad2ff', map: 'tibet', image: null,
    message: '高原的天很蓝，雪山很近。在那里每走几步都要喘口气，氧气瓶成了最可靠的旅伴。慢慢走，也很好。' },
  { id: 'sayram', x: 335, y: 425, title: '赛里木湖 · 我们的湖', location: '新疆 · 博尔塔拉', date: '2026-05-11', object: 'badge', color: '#6fa8e8', map: 'sayram', image: null,
    message: '2026 年 5 月 11 日，我们在赛里木湖登记结婚。湖是蓝色的，雪山在远处，从那天起我们是一家人了。' },
  { id: 'shenyang', x: 860, y: 1000, title: '沈阳 · 长春 · 澡堂', location: '辽宁 · 沈阳 / 吉林 · 长春', date: '', object: 'steam', color: '#e8e2d6', image: null,
    message: '北方的澡堂，热气腾腾。搓完澡窝在休息大厅，什么也不干——原来放松也是一种行程。' },
  { id: 'zhuhai', x: 470, y: 255, title: '珠海 · 长隆', location: '广东 · 珠海', date: '', object: 'whale', color: '#4f86d6', image: null,
    message: '海洋主题乐园，到处都是欢呼声和蓝色的大幕布。那天走了很多路，笑了很多次。' },
  { id: 'shanghai', x: 855, y: 300, title: '上海 · 迪士尼', location: '上海', date: '', object: 'castle', color: '#c86bb1', image: null,
    message: '城堡、烟花、还有挤满童话的街道。不属于任何人的童话，那天晚上是我们的。' },
  { id: 'kl', x: 1040, y: 290, title: '吉隆坡 · 行李与双塔', location: '马来西亚 · 吉隆坡', date: '', object: 'suitcase', color: '#a8763e', map: 'kl', image: null,
    message: '行李延误了，双塔很亮。等行李的那两天，我们用购物袋逛完了半座城。' },
  { id: 'dongying', x: 640, y: 1030, title: '东营 · 自驾日落', location: '山东 · 东营', date: '', object: 'sunset', color: '#f0a83c', image: null,
    message: '自驾的路上遇到一场很大的日落。我们把车停下来，谁都没说话，看完了整场。' },
  { id: 'zibo', x: 500, y: 405, title: '淄博 · 烧烤', location: '山东 · 淄博', date: '', object: 'skewer', color: '#c96a5a', image: null,
    message: '小饼卷小葱，烤串滋滋响。淄博的夜晚属于炭火和笑声，我们吃到了很晚。' },
  { id: 'wuhan', x: 1230, y: 690, title: '武汉 · 第二故乡', location: '湖北 · 武汉', date: '', object: 'shrimp', color: '#e0563f', map: 'wuhan', image: null,
    message: '你来过这里很多次，考试、办事、路过，武汉成了你的第二故乡。肥肥虾庄的蒸虾，是你的固定节目。' },
  { id: 'chongqing', x: 920, y: 845, title: '重庆 · 山城', location: '重庆', date: '', object: 'stairs', color: '#c9a06a', image: null,
    message: '这座城没有平路。坡道、台阶、从楼顶穿过的马路——我们爬上爬下，把山城走成了迷宫。' },
  { id: 'chengdu', x: 110, y: 405, title: '成都 · 熊猫', location: '四川 · 成都', date: '', object: 'panda', color: '#3a3f4a', image: null,
    message: '滚滚们躺着吃、坐着吃、倒挂着吃。你拍了一路，我说它们过得比我们舒服。' },
  { id: 'leshan', x: 120, y: 180, title: '乐山 · 大佛与甜皮鸭', location: '四川 · 乐山', date: '', object: 'buddha', color: '#c9a06a', image: null,
    message: '在大佛脚下仰头看了很久，下山后用一只甜皮鸭犒劳了酸痛的腿。佛很稳，鸭很甜。' },
  { id: 'suzhou', x: 660, y: 900, title: '苏州 · 园林与照顾', location: '江苏 · 苏州', date: '', object: 'pavilion', color: '#58b368', image: null,
    message: '那次旅行你发烧了，行程慢下来，我们在园林里坐了一下午。旅行不总是完美的，但我们会互相照顾。' },
  { id: 'yangzhou', x: 1075, y: 468, title: '扬州 · 一支牙刷', location: '江苏 · 扬州', date: '', object: 'toothbrush', color: '#a8c686', image: null,
    message: '酒店的那支牙刷，我们一直没舍得扔。最普通的物件，留得最久。' }
];

/* ---------- 原创像素插画（每个地点一个小场景）---------- */
/* 画布约 320x200，坐标已平移到左上角。统一：夜空/天色 + 地面 + 主体物。 */
window.MemoryArt = (function () {
  'use strict';
  function sky(g, c1, c2, w, h) {
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  function ground(g, y, c, w, h) { g.fillStyle = c; g.fillRect(0, y, w, h - y); }
  function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function star(g, w, h, n) {
    for (var i = 0; i < n; i++) { g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(Math.random() * w, Math.random() * h * .5, 2, 2); }
  }
  var A = {};
  /* ---------- 通用：绘本质感的底子（渐变 / 光晕 / 暗角 / 颗粒） ---------- */
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
    var rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.save();
    g.globalAlpha = a === undefined ? 1 : a;
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.restore();
  }
  function vignette(g, w, h, a) {
    var rg = g.createRadialGradient(w / 2, h * 0.44, h * 0.30, w / 2, h * 0.44, h * 1.0);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(14,20,34,' + a + ')');
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
  }
  function grain(g, w, h, n, seed) {
    var r = seeded(seed);
    for (var i = 0; i < n; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(20,30,50,.05)';
      g.fillRect(r() * w, r() * h, 1.3, 1.3);
    }
  }
  function ridge(g, w, h, pts, fill) {
    // pts: [[u,v],...] 用平滑曲线连成一条山脊，并向下封口
    g.beginPath();
    g.moveTo(pts[0][0] * w, pts[0][1] * h);
    for (var i = 1; i < pts.length - 1; i++) {
      var cx1 = (pts[i][0] + pts[i + 1][0]) / 2 * w;
      var cy1 = (pts[i][1] + pts[i + 1][1]) / 2 * h;
      g.quadraticCurveTo(pts[i][0] * w, pts[i][1] * h, cx1, cy1);
    }
    var last = pts[pts.length - 1];
    g.lineTo(last[0] * w, last[1] * h);
    g.lineTo(w + 2, h + 2); g.lineTo(-2, h + 2);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  }

  /* ============ 样板 1 / 4：乌海 · 沙漠与湖 ============ */
  A.wuhai = function (g, w, h) {
    // 黄昏的天
    g.fillStyle = lin(g, 0, 0, 0, h * 0.60, [
      0, '#f3a54f', 0.38, '#f9c87e', 0.68, '#fde0b0', 0.9, '#ffeecd', 1, '#fff6e2'
    ]);
    g.fillRect(0, 0, w, h);
    // 落日：压低在湖面上，光晕收小一圈
    bloom(g, w * 0.30, h * 0.475, h * 0.34, 'rgba(255,226,158,.55)', 0.9);
    bloom(g, w * 0.30, h * 0.475, h * 0.11, 'rgba(255,250,224,.95)', 1);
    g.beginPath(); g.arc(w * 0.30, h * 0.475, h * 0.055, 0, 7);
    g.fillStyle = '#fffdf2'; g.fill();
    // 落日在湖面上的那条光路
    var sunPath = g.createLinearGradient(w * 0.30, h * 0.53, w * 0.30, h * 0.712);
    sunPath.addColorStop(0, 'rgba(255,246,206,.55)');
    sunPath.addColorStop(1, 'rgba(255,246,206,0)');

    // 远山：三层，越远越淡
    ridge(g, w, h, [[-0.1, 0.50], [0.14, 0.455], [0.30, 0.485], [0.46, 0.455], [0.64, 0.50], [0.82, 0.47], [1.1, 0.50]], 'rgba(176,150,176,.42)');
    ridge(g, w, h, [[-0.1, 0.535], [0.18, 0.505], [0.38, 0.53], [0.58, 0.50], [0.78, 0.528], [1.1, 0.512]], 'rgba(140,118,150,.5)');

    // 湖：一条安静的蓝，压在沙丘后面
    g.beginPath();
    g.moveTo(-2, h * 0.552);
    g.bezierCurveTo(w * 0.28, h * 0.536, w * 0.66, h * 0.564, w + 2, h * 0.542);
    g.lineTo(w + 2, h * 0.712); g.lineTo(-2, h * 0.712);
    g.closePath();
    g.fillStyle = lin(g, 0, h * 0.54, 0, h * 0.70, [0, '#a8d2e8', 0.45, '#79b0d8', 1, '#4f84b8']);
    g.fill();
    // 落日在水面上的倒影
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = sunPath; g.fillRect(w * 0.235, h * 0.552, w * 0.145, h * 0.16);
    g.restore();
    // 湖面反光
    var rl = seeded(11);
    for (var i = 0; i < 14; i++) {
      var ly = h * (0.565 + rl() * 0.135);
      var lw = w * (0.03 + rl() * 0.10);
      var lx = w * (0.10 + rl() * 0.72);
      g.fillStyle = 'rgba(255,248,220,' + (0.18 + rl() * 0.4) + ')';
      g.beginPath(); g.ellipse(lx, ly, lw, 1.4, 0, 0, 7); g.fill();
    }
    // 湖岸线
    g.strokeStyle = 'rgba(255,250,232,.55)'; g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-2, h * 0.552);
    g.bezierCurveTo(w * 0.28, h * 0.536, w * 0.66, h * 0.564, w + 2, h * 0.542);
    g.stroke();

    // 远沙丘（在湖前）
    ridge(g, w, h, [[-0.1, 0.742], [0.20, 0.706], [0.42, 0.730], [0.66, 0.700], [0.86, 0.724], [1.1, 0.710]], '#e9c793');
    // 近沙丘：一条大的曲面，右下压暗
    g.beginPath();
    g.moveTo(-2, h * 0.855);
    g.bezierCurveTo(w * 0.18, h * 0.800, w * 0.42, h * 0.690, w * 0.60, h * 0.682);
    g.bezierCurveTo(w * 0.78, h * 0.674, w * 0.90, h * 0.735, w + 2, h * 0.718);
    g.lineTo(w + 2, h + 2); g.lineTo(-2, h + 2);
    g.closePath();
    g.fillStyle = lin(g, 0, h * 0.67, w * 0.5, h, [0, '#f7dcae', 0.45, '#e8c48c', 1, '#cf9f66']);
    g.fill();
    // 沙丘阴影面
    g.beginPath();
    g.moveTo(w * 0.42, h * 0.694);
    g.bezierCurveTo(w * 0.56, h * 0.683, w * 0.66, h * 0.702, w * 0.74, h * 0.736);
    g.bezierCurveTo(w * 0.62, h * 0.772, w * 0.50, h * 0.752, w * 0.42, h * 0.694);
    g.closePath();
    g.fillStyle = 'rgba(186,138,86,.22)'; g.fill();
    // 风纹
    var rw = seeded(23);
    for (var k = 0; k < 9; k++) {
      var wy2 = h * (0.752 + k * 0.028);
      g.beginPath();
      g.moveTo(w * (0.02 + rw() * 0.25), wy2);
      g.bezierCurveTo(w * 0.35, wy2 - h * 0.02, w * 0.55, wy2 + h * 0.015, w * (0.75 + rw() * 0.2), wy2 - h * 0.008);
      g.strokeStyle = 'rgba(255,246,226,' + (0.22 + rw() * 0.22) + ')';
      g.lineWidth = 1.4; g.stroke();
    }

    // ---- 越野车（停在山脊上）----
    (function jeep(jx, jy, s) {
      // 沙上落影
      g.fillStyle = 'rgba(150,104,58,.32)';
      g.beginPath(); g.ellipse(jx + 20 * s, jy + 15 * s, 26 * s, 5 * s, 0, 0, 7); g.fill();
      // 车身
      g.beginPath();
      g.moveTo(jx - 20 * s, jy + 10 * s);
      g.lineTo(jx - 20 * s, jy - 1 * s);
      g.quadraticCurveTo(jx - 19 * s, jy - 4 * s, jx - 14 * s, jy - 4 * s);
      g.lineTo(jx - 10 * s, jy - 13 * s);
      g.quadraticCurveTo(jx - 9 * s, jy - 15 * s, jx - 6 * s, jy - 15 * s);
      g.lineTo(jx + 6 * s, jy - 15 * s);
      g.quadraticCurveTo(jx + 9 * s, jy - 15 * s, jx + 10 * s, jy - 13 * s);
      g.lineTo(jx + 13 * s, jy - 4 * s);
      g.lineTo(jx + 19 * s, jy - 4 * s);
      g.quadraticCurveTo(jx + 21 * s, jy - 3 * s, jx + 21 * s, jy + 1 * s);
      g.lineTo(jx + 21 * s, jy + 10 * s);
      g.closePath();
      g.fillStyle = lin(g, 0, jy - 15 * s, 0, jy + 10 * s, [0, '#e26a4e', 0.5, '#c94a3a', 1, '#8f2f28']);
      g.fill();
      g.strokeStyle = 'rgba(70,26,20,.75)'; g.lineWidth = 1.1 * s; g.stroke();
      // 车窗
      g.beginPath();
      g.moveTo(jx - 8 * s, jy - 12.5 * s);
      g.lineTo(jx + 5 * s, jy - 12.5 * s);
      g.lineTo(jx + 7 * s, jy - 5.5 * s);
      g.lineTo(jx - 9.4 * s, jy - 5.5 * s);
      g.closePath();
      g.fillStyle = lin(g, 0, jy - 13 * s, 0, jy - 5 * s, [0, '#cfe6f7', 1, '#8fb6d8']);
      g.fill();
      // 车顶行李架
      g.strokeStyle = '#5d3a2a'; g.lineWidth = 1.2 * s;
      g.beginPath(); g.moveTo(jx - 8 * s, jy - 16 * s); g.lineTo(jx + 7 * s, jy - 16 * s); g.stroke();
      for (var q = 0; q < 3; q++) {
        g.beginPath();
        g.moveTo(jx + (-6 + q * 5) * s, jy - 16 * s);
        g.lineTo(jx + (-6 + q * 5) * s, jy - 15 * s);
        g.stroke();
      }
      // 轮子
      [-11, 11].forEach(function (wx) {
        g.beginPath(); g.arc(jx + wx * s, jy + 10 * s, 6.4 * s, 0, 7);
        g.fillStyle = '#2c241c'; g.fill();
        g.beginPath(); g.arc(jx + wx * s, jy + 10 * s, 2.6 * s, 0, 7);
        g.fillStyle = '#8d8377'; g.fill();
      });
      // 夕阳轮廓光
      g.beginPath();
      g.moveTo(jx - 10 * s, jy - 13 * s);
      g.quadraticCurveTo(jx - 9 * s, jy - 15 * s, jx - 6 * s, jy - 15 * s);
      g.lineTo(jx + 6 * s, jy - 15 * s);
      g.strokeStyle = 'rgba(255,226,168,.85)'; g.lineWidth = 1.6 * s; g.stroke();
    })(w * 0.455, h * 0.690, Math.max(1.0, w / 300));

    // 车辙
    g.strokeStyle = 'rgba(170,124,74,.35)'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w * 0.42, h * 0.742);
    g.bezierCurveTo(w * 0.34, h * 0.775, w * 0.26, h * 0.805, w * 0.14, h * 0.832);
    g.stroke();

    // 小蜥蜴与脚印（沙脊右侧）
    var lz = seeded(77);
    for (var t = 0; t < 9; t++) {
      g.fillStyle = 'rgba(150,108,66,.30)';
      g.beginPath();
      g.ellipse(w * (0.70 + t * 0.026), h * (0.782 + Math.sin(t) * 0.008 + t * 0.004), 2.0, 1.2, 0.4, 0, 7);
      g.fill();
      g.beginPath();
      g.ellipse(w * (0.712 + t * 0.026), h * (0.790 + Math.sin(t + 1) * 0.008 + t * 0.004), 2.0, 1.2, 0.4, 0, 7);
      g.fill();
    }
    g.beginPath();
    g.moveTo(w * 0.665, h * 0.818);
    g.bezierCurveTo(w * 0.675, h * 0.811, w * 0.688, h * 0.815, w * 0.692, h * 0.825);
    g.strokeStyle = '#8a7248'; g.lineWidth = 2.4; g.lineCap = 'round'; g.stroke();

    vignette(g, w, h, 0.34);
    grain(g, w, h, 220, 5);
  };

  /* ============ 样板 2 / 4：赛里木湖 · 我们的湖 ============ */
  A.sayram = function (g, w, h) {
    g.fillStyle = lin(g, 0, 0, 0, h * 0.55, [
      0, '#173257', 0.40, '#3b6a9b', 0.72, '#7fa8cc', 1, '#cfe2f0'
    ]);
    g.fillRect(0, 0, w, h);

    // 雪山：三座，各有受光面与背光面
    function peak(cx, base, half, top, lit, shade) {
      g.beginPath();
      g.moveTo(cx - half, base);
      g.quadraticCurveTo(cx - half * 0.42, base - (base - top) * 0.55, cx - half * 0.10, top);
      g.lineTo(cx + half * 0.06, top + (base - top) * 0.05);
      g.quadraticCurveTo(cx + half * 0.46, base - (base - top) * 0.5, cx + half, base);
      g.closePath();
      g.fillStyle = lit; g.fill();
      // 背光面
      g.beginPath();
      g.moveTo(cx - half * 0.10, top);
      g.lineTo(cx + half * 0.06, top + (base - top) * 0.05);
      g.quadraticCurveTo(cx + half * 0.46, base - (base - top) * 0.5, cx + half, base);
      g.lineTo(cx + half * 0.02, base);
      g.closePath();
      g.fillStyle = shade; g.fill();
      // 雪脊线
      g.beginPath();
      g.moveTo(cx - half * 0.10, top);
      g.lineTo(cx + half * 0.06, top + (base - top) * 0.05);
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.3; g.stroke();
    }
    // 后一排（淡、远）
    peak(w * 0.16, h * 0.545, w * 0.24, h * 0.30, '#cfe0f2', '#a8c2dd');
    peak(w * 0.62, h * 0.545, w * 0.24, h * 0.295, '#c9dcef', '#a2bdd9');
    peak(w * 0.92, h * 0.545, w * 0.22, h * 0.315, '#c4d8ee', '#9dbbd6');
    // 前一排（亮、近）
    peak(w * 0.34, h * 0.548, w * 0.30, h * 0.245, '#fdfeff', '#b3cbe3');
    peak(w * 0.74, h * 0.548, w * 0.26, h * 0.265, '#f7fbff', '#adc6e0');

    // 山脚的雾带：把雪山与湖面柔化过渡
    var mist = g.createLinearGradient(0, h * 0.475, 0, h * 0.575);
    mist.addColorStop(0, 'rgba(226,240,252,0)');
    mist.addColorStop(0.55, 'rgba(226,240,252,.55)');
    mist.addColorStop(1, 'rgba(226,240,252,0)');
    g.fillStyle = mist; g.fillRect(0, h * 0.455, w, h * 0.13);

    // 湖：从雪山脚下开始
    g.fillStyle = lin(g, 0, h * 0.53, 0, h, [
      0, '#9fc8de', 0.22, '#4e93b6', 0.62, '#2f7398', 1, '#1d4f74'
    ]);
    g.fillRect(0, h * 0.53, w, h * 0.47);

    // 山的倒影（竖向拉伸、淡）
    g.save();
    g.globalAlpha = 0.30;
    g.translate(0, h * 0.53);
    g.scale(1, -0.55);
    g.translate(0, -h * 0.53);
    peak(w * 0.34, h * 0.548, w * 0.30, h * 0.245, '#e8f2fb', '#8fb0cf');
    peak(w * 0.74, h * 0.548, w * 0.26, h * 0.265, '#e2eef9', '#88a9c8');
    g.restore();

    // 湖面波光
    var rs = seeded(31);
    for (var i = 0; i < 26; i++) {
      var yy = h * (0.58 + rs() * 0.40);
      var xx = w * (rs() * 0.9);
      var ww = w * (0.02 + rs() * 0.08);
      g.fillStyle = 'rgba(226,242,255,' + (0.10 + rs() * 0.35) + ')';
      g.beginPath(); g.ellipse(xx, yy, ww, 1.3, 0, 0, 7); g.fill();
    }
    // 水岸
    g.beginPath();
    g.moveTo(-2, h * 0.895);
    g.bezierCurveTo(w * 0.24, h * 0.86, w * 0.52, h * 0.905, w + 2, h * 0.872);
    g.lineTo(w + 2, h + 2); g.lineTo(-2, h + 2);
    g.closePath();
    g.fillStyle = lin(g, 0, h * 0.87, 0, h, [0, '#d8cdb2', 1, '#a89a7e']);
    g.fill();
    // 岸边的碎石
    for (var j = 0; j < 22; j++) {
      var sx = w * (rs() * 1.0), sy = h * (0.895 + rs() * 0.09);
      g.fillStyle = 'rgba(120,108,88,' + (0.25 + rs() * 0.3) + ')';
      g.beginPath(); g.ellipse(sx, sy, 3 + rs() * 5, 2 + rs() * 2.5, 0, 0, 7); g.fill();
    }

    // 两个小小的人影：牵手看湖
    function person(px, py, s, col) {
      g.fillStyle = col;
      g.beginPath(); g.arc(px, py - 13 * s, 3.2 * s, 0, 7); g.fill();          // 头
      g.beginPath();                                                          // 身体
      g.moveTo(px - 3.2 * s, py);
      g.quadraticCurveTo(px - 3.6 * s, py - 9 * s, px, py - 10 * s);
      g.quadraticCurveTo(px + 3.6 * s, py - 9 * s, px + 3.2 * s, py);
      g.closePath(); g.fill();
      g.lineWidth = 1.6 * s; g.strokeStyle = col;
      g.beginPath(); g.moveTo(px - 1.4 * s, py); g.lineTo(px - 1.8 * s, py + 4.4 * s); g.stroke();
      g.beginPath(); g.moveTo(px + 1.4 * s, py); g.lineTo(px + 1.8 * s, py + 4.4 * s); g.stroke();
    }
    var px0 = w * 0.445, py0 = h * 0.878, sc = Math.max(0.9, w / 300);
    // 落在岸上的影子
    g.fillStyle = 'rgba(90,84,70,.22)';
    g.beginPath(); g.ellipse(px0 + 12 * sc, py0 + 5 * sc, 20 * sc, 3.4 * sc, 0, 0, 7); g.fill();
    person(px0, py0, sc, 'rgba(46,58,74,.92)');
    person(px0 + 17 * sc, py0 - 1 * sc, sc * 1.04, 'rgba(58,44,52,.92)');
    // 牵着的手
    g.strokeStyle = 'rgba(52,48,58,.9)'; g.lineWidth = 1.8 * sc;
    g.beginPath(); g.moveTo(px0 + 3 * sc, py0 - 6 * sc); g.quadraticCurveTo(px0 + 9 * sc, py0 - 4 * sc, px0 + 14 * sc, py0 - 7 * sc); g.stroke();

    // 高原的天光
    bloom(g, w * 0.50, h * 0.20, h * 0.60, 'rgba(214,236,255,.30)', 0.9);
    vignette(g, w, h, 0.30);
    grain(g, w, h, 220, 9);
  };

  /* ============ 样板 3 / 4：多哈 · 夜晚的主街 ============ */
  A.doha = function (g, w, h) {
    g.fillStyle = lin(g, 0, 0, 0, h * 0.72, [
      0, '#0a1732', 0.45, '#152a4e', 0.78, '#27456b', 1, '#3d5c84'
    ]);
    g.fillRect(0, 0, w, h);
    // 星
    var rd = seeded(43);
    for (var s2 = 0; s2 < 26; s2++) {
      g.fillStyle = 'rgba(255,255,255,' + (0.2 + rd() * 0.55) + ')';
      g.fillRect(rd() * w, rd() * h * 0.34, 1.6, 1.6);
    }
    // 月牙
    g.beginPath(); g.arc(w * 0.83, h * 0.15, h * 0.055, 0, 7);
    g.fillStyle = 'rgba(255,246,214,.95)'; g.fill();
    g.beginPath(); g.arc(w * 0.855, h * 0.135, h * 0.048, 0, 7);
    g.fillStyle = '#0d1c38'; g.fill();

    // 远楼（暗，几乎融化在夜色里）
    var rb = seeded(17);
    for (var i = 0; i < 7; i++) {
      var bw = w * (0.10 + rb() * 0.09);
      var bh = h * (0.20 + rb() * 0.18);
      var bx = w * (i * 0.155) - w * 0.02;
      g.fillStyle = 'rgba(20,36,62,.92)';
      g.fillRect(bx, h * 0.60 - bh, bw, bh + h * 0.05);
      for (var wy = 0; wy < 4; wy++) {
        for (var wx = 0; wx < 3; wx++) {
          if (rb() > 0.55) {
            g.fillStyle = 'rgba(255,214,140,' + (0.25 + rb() * 0.45) + ')';
            g.fillRect(bx + bw * (0.16 + wx * 0.28), h * 0.60 - bh + h * 0.03 + wy * h * 0.042, bw * 0.14, h * 0.018);
          }
        }
      }
    }

    // 近处店面：一排暖橱窗
    g.fillStyle = '#101f3a';
    g.fillRect(0, h * 0.52, w, h * 0.28);
    var shops = [
      [0.015, 0.155, '#ffcf7a', '#b4442f'], [0.195, 0.135, '#ffdca0', '#2f5f8a'],
      [0.350, 0.170, '#ffc46a', '#3f7a5a'], [0.545, 0.145, '#ffe0ae', '#8a4a6a'],
      [0.712, 0.125, '#ffcf7a', '#4a5a8a'], [0.855, 0.140, '#ffd79a', '#a05a2f']
    ];
    shops.forEach(function (sp, si) {
      var sx = w * sp[0], sw = w * sp[1];
      // 店面：深色墙体，和隔壁分开
      g.fillStyle = '#0d1a32';
      g.fillRect(sx - w * 0.008, h * 0.545, sw + w * 0.016, h * 0.235);
      // 雨棚
      g.fillStyle = sp[3];
      g.beginPath();
      g.moveTo(sx - w * 0.010, h * 0.556);
      g.lineTo(sx + sw + w * 0.010, h * 0.556);
      g.lineTo(sx + sw + w * 0.004, h * 0.588);
      g.lineTo(sx - w * 0.004, h * 0.588);
      g.closePath(); g.fill();
      for (var st = 0; st < 4; st++) {
        g.fillStyle = 'rgba(255,248,232,.35)';
        g.fillRect(sx + sw * (st / 4), h * 0.556, sw * 0.045, h * 0.032);
      }
      // 橱窗
      bloom(g, sx + sw / 2, h * 0.665, sw * 0.95, 'rgba(255,206,130,.40)', 0.8);
      g.fillStyle = sp[2];
      g.fillRect(sx, h * 0.596, sw, h * 0.118);
      // 窗内的货架与商品剪影（打断整片亮色）
      g.fillStyle = 'rgba(74,44,22,.42)';
      g.fillRect(sx, h * 0.655, sw, 1.8);
      g.fillRect(sx + sw * 0.52 - 1, h * 0.596, 1.8, h * 0.118);
      var rs2 = seeded(101 + si);
      for (var it = 0; it < 4; it++) {
        var ix = sx + sw * (0.10 + rs2() * 0.78);
        var iw = sw * (0.05 + rs2() * 0.08);
        var ih = h * (0.018 + rs2() * 0.030);
        g.fillStyle = 'rgba(70,42,20,' + (0.30 + rs2() * 0.28) + ')';
        g.fillRect(ix, h * 0.655 - ih, iw, ih);
      }
      // 门
      g.fillStyle = 'rgba(30,20,12,.55)';
      g.fillRect(sx + sw * 0.72, h * 0.640, sw * 0.22, h * 0.074);
      // 暖光溢到街面
      var og = g.createLinearGradient(0, h * 0.714, 0, h * 0.845);
      og.addColorStop(0, 'rgba(255,206,130,.32)');
      og.addColorStop(1, 'rgba(255,206,130,0)');
      g.fillStyle = og;
      g.fillRect(sx - sw * 0.15, h * 0.714, sw * 1.3, h * 0.13);
    });

    // 主街
    g.fillStyle = lin(g, 0, h * 0.78, 0, h, [0, '#2b3d58', 1, '#1b2942']);
    g.fillRect(0, h * 0.78, w, h * 0.22);
    // 湿石板的反光
    var rr = seeded(61);
    for (var k = 0; k < 20; k++) {
      var rx = w * rr(), rw2 = w * (0.01 + rr() * 0.06);
      g.fillStyle = 'rgba(255,214,150,' + (0.05 + rr() * 0.16) + ')';
      g.fillRect(rx, h * (0.80 + rr() * 0.16), rw2, 2);
    }
    // 路缘
    g.fillStyle = 'rgba(160,180,206,.35)';
    g.fillRect(0, h * 0.775, w, 2);

    // 路灯：一根主灯 + 光晕
    (function lamp(lx, ly) {
      bloom(g, lx, ly, h * 0.30, 'rgba(255,214,140,.55)', 0.95);
      g.fillStyle = '#0f1c32';
      g.fillRect(lx - 2.2, ly, 4.4, h * 0.78 - ly);
      g.fillRect(lx - 5.5, h * 0.772, 11, 3);
      // 灯罩
      g.fillStyle = 'rgba(255,236,176,.96)';
      g.beginPath();
      g.moveTo(lx - 5.2, ly - 1);
      g.lineTo(lx + 5.2, ly - 1);
      g.lineTo(lx + 3.6, ly - 9.5);
      g.lineTo(lx - 3.6, ly - 9.5);
      g.closePath(); g.fill();
      g.fillStyle = '#0f1c32';
      g.fillRect(lx - 5.6, ly - 11.4, 11.2, 2.2);
    })(w * 0.115, h * 0.545);

    // 两个走路的背影
    function walker(px, py, s, col, flip) {
      g.fillStyle = col;
      g.beginPath(); g.ellipse(px, py - 26 * s, 4.4 * s, 5.2 * s, 0, 0, 7); g.fill();  // 头
      g.beginPath();
      g.moveTo(px - 6 * s, py);
      g.quadraticCurveTo(px - 7 * s, py - 19 * s, px, py - 21 * s);
      g.quadraticCurveTo(px + 7 * s, py - 19 * s, px + 6 * s, py);
      g.closePath(); g.fill();
      g.lineWidth = 3 * s; g.strokeStyle = col; g.lineCap = 'round';
      g.beginPath(); g.moveTo(px - 2.6 * s, py); g.lineTo(px - (flip ? 4 : 5) * s, py); g.stroke();
      g.beginPath(); g.moveTo(px + 2.6 * s, py); g.lineTo(px + (flip ? 5 : 4) * s, py); g.stroke();
    }
    var wsc = Math.max(1.0, w / 300);
    g.fillStyle = 'rgba(10,18,32,.35)';
    g.beginPath(); g.ellipse(w * 0.60, h * 0.905, 26 * wsc, 4 * wsc, 0, 0, 7); g.fill();
    walker(w * 0.575, h * 0.90, wsc, 'rgba(16,26,44,.94)');
    walker(w * 0.632, h * 0.90, wsc * 0.96, 'rgba(30,38,58,.94)');

    vignette(g, w, h, 0.46);
    grain(g, w, h, 220, 13);
  };

  /* ============ 样板 4 / 4：西藏 · 高处的天空 ============ */
  A.tibet = function (g, w, h) {
    // 高原的天：浓蓝到近白的稀薄
    g.fillStyle = lin(g, 0, 0, 0, h * 0.70, [
      0, '#0f4a86', 0.35, '#2f7ab4', 0.68, '#79aed6', 0.88, '#c2dcee', 1, '#e4f0f8'
    ]);
    g.fillRect(0, 0, w, h);
    bloom(g, w * 0.72, h * 0.22, h * 0.50, 'rgba(255,255,255,.45)', 0.8);

    // 云：几缕被拉长的薄云
    var rc = seeded(53);
    for (var i = 0; i < 5; i++) {
      var cy2 = h * (0.14 + rc() * 0.22);
      g.fillStyle = 'rgba(255,255,255,' + (0.16 + rc() * 0.22) + ')';
      g.beginPath();
      g.ellipse(w * (0.15 + rc() * 0.7), cy2, w * (0.08 + rc() * 0.13), h * 0.014, 0, 0, 7);
      g.fill();
    }

    // 雪山：正面的雪坡 + 冷色阴面 + 山脚碎石
    function bigPeak(cx, base, half, top, lit, shade, edge) {
      g.beginPath();
      g.moveTo(cx - half, base);
      g.quadraticCurveTo(cx - half * 0.55, base - (base - top) * 0.62, cx - half * 0.14, top);
      g.lineTo(cx + half * 0.04, top + (base - top) * 0.06);
      g.quadraticCurveTo(cx + half * 0.50, base - (base - top) * 0.55, cx + half, base);
      g.closePath();
      g.fillStyle = lit; g.fill();
      // 阴面
      g.beginPath();
      g.moveTo(cx - half * 0.14, top);
      g.lineTo(cx + half * 0.04, top + (base - top) * 0.06);
      g.quadraticCurveTo(cx + half * 0.50, base - (base - top) * 0.55, cx + half, base);
      g.lineTo(cx + half * 0.10, base);
      g.closePath();
      g.fillStyle = shade; g.fill();
      // 雪脊高光
      g.beginPath();
      g.moveTo(cx - half * 0.14, top);
      g.lineTo(cx + half * 0.04, top + (base - top) * 0.06);
      g.strokeStyle = edge; g.lineWidth = 1.6; g.stroke();
    }
    bigPeak(w * 0.30, h * 0.66, w * 0.34, h * 0.20, '#fbfdff', '#9dbbd8', 'rgba(255,255,255,.95)');
    bigPeak(w * 0.70, h * 0.66, w * 0.30, h * 0.30, '#f4f9ff', '#8fb0d2', 'rgba(255,255,255,.9)');

    // 山脚的冷雾，软掉雪山的硬底边
    var mist2 = g.createLinearGradient(0, h * 0.55, 0, h * 0.76);
    mist2.addColorStop(0, 'rgba(216,232,244,0)');
    mist2.addColorStop(0.6, 'rgba(216,232,244,.42)');
    mist2.addColorStop(1, 'rgba(216,232,244,0)');
    g.fillStyle = mist2; g.fillRect(0, h * 0.55, w, h * 0.23);

    // 山脚：暗一点的岩坡
    ridge(g, w, h, [[-0.1, 0.72], [0.18, 0.685], [0.40, 0.715], [0.62, 0.672], [0.84, 0.705], [1.1, 0.688]], '#6f7d90');
    // 地面：褐黄的碎石草甸
    g.beginPath();
    g.moveTo(-2, h * 0.84);
    g.bezierCurveTo(w * 0.28, h * 0.80, w * 0.62, h * 0.855, w + 2, h * 0.815);
    g.lineTo(w + 2, h + 2); g.lineTo(-2, h + 2);
    g.closePath();
    g.fillStyle = lin(g, 0, h * 0.80, 0, h, [0, '#c9b98e', 0.5, '#b0a077', 1, '#8e8161']);
    g.fill();
    // 碎石
    var rk = seeded(89);
    for (var j = 0; j < 26; j++) {
      g.fillStyle = 'rgba(96,88,70,' + (0.2 + rk() * 0.32) + ')';
      g.beginPath(); g.ellipse(w * rk(), h * (0.845 + rk() * 0.14), 2 + rk() * 5, 1.6 + rk() * 2.4, 0, 0, 7); g.fill();
    }

    // 经幡：从左上山脊斜挂到右侧，带下垂
    var flagCols = ['#d8402f', '#f2c53d', '#3f9e5c', '#f4ead8', '#3f6fb5'];
    var ax = w * 0.045, ay = h * 0.335, bx2 = w * 0.925, by2 = h * 0.415;
    // 两根木杆
    g.fillStyle = '#6b5334';
    g.fillRect(ax - 1.6, ay, 3.2, h * 0.50);
    g.fillRect(bx2 - 1.6, by2, 3.2, h * 0.42);
    g.beginPath();
    g.moveTo(ax, ay);
    g.quadraticCurveTo(w * 0.48, h * 0.545, bx2, by2);
    g.strokeStyle = 'rgba(60,50,40,.55)'; g.lineWidth = 1.2; g.stroke();
    for (var f = 0; f < 16; f++) {
      var u = f / 15, iu = 1 - u;
      var fx = iu * iu * ax + 2 * iu * u * (w * 0.48) + u * u * bx2;
      var fy = iu * iu * ay + 2 * iu * u * (h * 0.545) + u * u * by2;
      var fw = w * 0.036, fh = h * 0.062;
      g.beginPath();
      g.moveTo(fx - fw / 2, fy);
      g.lineTo(fx + fw / 2, fy);
      g.lineTo(fx + fw / 2 + (f % 2 ? 3 : -3), fy + fh);
      g.lineTo(fx - fw / 2 + (f % 2 ? 3 : -3), fy + fh);
      g.closePath();
      g.fillStyle = flagCols[f % 5];
      g.globalAlpha = 0.94; g.fill(); g.globalAlpha = 1;
      g.strokeStyle = 'rgba(50,40,32,.35)'; g.lineWidth = 0.8; g.stroke();
    }

    // 氧气瓶与背包（放在右下，很小）
    var ox = w * 0.86, oy = h * 0.83;
    g.fillStyle = 'rgba(70,64,50,.25)';
    g.beginPath(); g.ellipse(ox + 6, oy + 26, 20, 4, 0, 0, 7); g.fill();
    g.beginPath();
    g.roundRect ? g.roundRect(ox, oy, 13, 26, 5) : g.rect(ox, oy, 13, 26);
    g.fillStyle = lin(g, ox, 0, ox + 13, 0, [0, '#7fb2d8', 0.5, '#4f86b8', 1, '#2f5f8a']);
    g.fill();
    g.fillStyle = '#e8e2d6'; g.fillRect(ox, oy + 9, 13, 4);
    g.fillStyle = '#8a8478'; g.fillRect(ox + 4, oy - 4, 5, 5);
    g.fillStyle = '#c9c2b0'; g.fillRect(ox - 2, oy - 7, 10, 3);

    vignette(g, w, h, 0.30);
    grain(g, w, h, 220, 21);
  };

  /* ============ 上海 · 迪士尼：城堡与烟花 ============ */
  A.shanghai = function (g, w, h) {
    var s = w / 320;
    g.fillStyle = lin(g, 0, 0, 0, h, [0, '#0c1128', 0.34, '#191f4a', 0.62, '#282555', 0.86, '#3a2f60', 1, '#4a3a68']);
    g.fillRect(0, 0, w, h);
    // 星
    var rs = seeded(3);
    for (var i = 0; i < 80; i++) {
      g.fillStyle = 'rgba(255,255,255,' + (0.2 + rs() * 0.7) + ')';
      g.fillRect(rs() * w, rs() * h * 0.55, 1.2 * s, 1.2 * s);
    }
    // 烟花
    function firework(cx, cy, R, col, n, seed) {
      var rr = seeded(seed);
      bloom(g, cx, cy, R * 1.5, col, 0.30);
      g.strokeStyle = col;
      for (var k = 0; k < n; k++) {
        var a = k / n * Math.PI * 2 + rr() * 0.1;
        var L = R * (0.72 + rr() * 0.4);
        g.globalAlpha = 0.45 + rr() * 0.5;
        g.lineWidth = 1.5 * s;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * L * 0.35, cy + Math.sin(a) * L * 0.35);
        g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L * 0.94);
        g.stroke();
        g.fillStyle = col;
        g.beginPath();
        g.arc(cx + Math.cos(a) * L, cy + Math.sin(a) * L * 0.94, 1.5 * s, 0, 7);
        g.fill();
      }
      g.globalAlpha = 1;
      bloom(g, cx, cy, R * 0.22, 'rgba(255,255,240,.9)', 0.9);
    }
    firework(w * 0.20, h * 0.20, h * 0.24, 'rgba(255,214,150,.9)', 26, 11);
    firework(w * 0.80, h * 0.15, h * 0.20, 'rgba(198,150,255,.9)', 22, 23);
    firework(w * 0.62, h * 0.30, h * 0.13, 'rgba(140,220,255,.85)', 16, 31);

    // 城堡
    var cx2 = w * 0.5, base = h * 0.90;
    function towerX(px2, halfW, topY, botY, col, lit) {
      g.fillStyle = col;
      g.fillRect(px2 - halfW, topY, halfW * 2, botY - topY);
      // 尖顶
      g.beginPath();
      g.moveTo(px2 - halfW * 1.18, topY);
      g.lineTo(px2, topY - halfW * 2.6);
      g.lineTo(px2 + halfW * 1.18, topY);
      g.closePath();
      g.fillStyle = lit;
      g.fill();
      // 顶上的小旗
      g.strokeStyle = 'rgba(255,240,220,.85)'; g.lineWidth = 1.4 * s;
      g.beginPath(); g.moveTo(px2, topY - halfW * 2.6); g.lineTo(px2, topY - halfW * 3.3); g.stroke();
    }
    // 侧塔（远）
    towerX(cx2 - w * 0.215, 9 * s, base - h * 0.30, base, '#8f7fbe', '#b9a6e0');
    towerX(cx2 + w * 0.215, 9 * s, base - h * 0.30, base, '#8f7fbe', '#b9a6e0');
    // 主体
    g.fillStyle = '#a99ad0'; g.fillRect(cx2 - w * 0.145, base - h * 0.40, w * 0.29, h * 0.40);
    g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(cx2 - w * 0.145, base - h * 0.40, w * 0.12, h * 0.40);
    // 中塔（高）
    towerX(cx2, 12 * s, base - h * 0.60, base - h * 0.34, '#c3b3e6', '#f0e4ff');
    // 两侧副塔
    towerX(cx2 - w * 0.105, 8.5 * s, base - h * 0.48, base - h * 0.18, '#b7a8dc', '#e2d6ff');
    towerX(cx2 + w * 0.105, 8.5 * s, base - h * 0.48, base - h * 0.18, '#b7a8dc', '#e2d6ff');
    // 城门 + 窗
    g.fillStyle = '#4a3a68';
    g.beginPath();
    g.moveTo(cx2 - 12 * s, base);
    g.lineTo(cx2 - 12 * s, base - 20 * s);
    g.quadraticCurveTo(cx2, base - 32 * s, cx2 + 12 * s, base - 20 * s);
    g.lineTo(cx2 + 12 * s, base);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,214,140,.92)';
    [-0.06, -0.02, 0.02, 0.06].forEach(function (u, j) {
      g.fillRect(cx2 + u * w - 2 * s, base - h * (0.30 + (j % 2) * 0.06), 4 * s, 6 * s);
    });
    g.fillRect(cx2 - 2.5 * s, base - h * 0.54, 5 * s, 7 * s);
    // 城堡的暖光轮廓
    bloom(g, cx2, base - h * 0.18, w * 0.22, 'rgba(255,196,220,.28)', 0.9);

    // 前景人群剪影
    var rp = seeded(47);
    for (var p = 0; p < 16; p++) {
      var px2 = w * 0.06 + rp() * w * 0.88;
      var ph = (12 + rp() * 12) * s;
      g.fillStyle = 'rgba(14,14,28,.85)';
      g.beginPath();
      g.arc(px2, base + h * 0.02 - ph, ph * 0.26, 0, 7);
      g.fill();
      g.beginPath();
      g.ellipse(px2, base + h * 0.06 - ph * 0.42, ph * 0.36, ph * 0.5, 0, 0, 7);
      g.fill();
      if (rp() > 0.7) {  // 举着的气球 / 荧光棒
        g.strokeStyle = 'rgba(255,190,220,.6)'; g.lineWidth = 1 * s;
        g.beginPath(); g.moveTo(px2 + ph * 0.3, base + h * 0.02 - ph * 0.9);
        g.lineTo(px2 + ph * 0.34, base - ph * 1.5); g.stroke();
      }
    }
    // 地面反光
    g.fillStyle = lin(g, 0, base, 0, h, [0, 'rgba(255,206,170,.20)', 1, 'rgba(120,90,140,.05)']);
    g.fillRect(0, base, w, h - base);
    vignette(g, w, h, 0.42);
    grain(g, w, h, 220, 5);
  };

  /* ============ 珠海 · 长隆：鲸与乐园 ============ */
  A.zhuhai = function (g, w, h) {
    var s = w / 320;
    g.fillStyle = lin(g, 0, 0, 0, h * 0.62, [0, '#1d3560', 0.4, '#3f6396', 0.72, '#7f9dc0', 1, '#e0b8b0']);
    g.fillRect(0, 0, w, h);
    bloom(g, w * 0.72, h * 0.60, h * 0.42, 'rgba(255,196,160,.35)', 0.9);
    // 云
    var rc = seeded(61);
    for (var c = 0; c < 7; c++) {
      g.fillStyle = 'rgba(255,240,230,' + (0.10 + rc() * 0.16) + ')';
      g.beginPath();
      g.ellipse(rc() * w, h * (0.10 + rc() * 0.30), w * (0.10 + rc() * 0.18), h * 0.02, 0, 0, 7);
      g.fill();
    }
    // 海
    g.fillStyle = lin(g, 0, h * 0.58, 0, h, [0, '#4b7ea8', 0.35, '#2f5f8c', 0.75, '#20496f', 1, '#17395a']);
    g.fillRect(0, h * 0.58, w, h * 0.42);
    // 落日倒影
    g.save();
    g.globalCompositeOperation = 'lighter';
    var rg2 = g.createLinearGradient(0, h * 0.58, 0, h * 0.9);
    rg2.addColorStop(0, 'rgba(255,200,160,.36)');
    rg2.addColorStop(1, 'rgba(255,200,160,0)');
    g.fillStyle = rg2;
    g.fillRect(w * 0.58, h * 0.58, w * 0.3, h * 0.32);
    g.restore();

    // 远山小岛
    ridge(g, w, h, [[0.55, 0.575], [0.66, 0.545], [0.78, 0.565], [0.9, 0.548], [1.05, 0.575]], 'rgba(30,58,86,.75)', h * 0.60);

    // 摩天轮（左）
    var fwx = w * 0.155, fwy = h * 0.40, fwr = h * 0.17;
    g.strokeStyle = 'rgba(240,246,255,.55)'; g.lineWidth = 1.4 * s;
    g.beginPath(); g.arc(fwx, fwy, fwr, 0, 7); g.stroke();
    g.beginPath(); g.arc(fwx, fwy, fwr * 0.66, 0, 7); g.stroke();
    for (var sp = 0; sp < 12; sp++) {
      var a2 = sp / 12 * Math.PI * 2;
      g.beginPath(); g.moveTo(fwx, fwy);
      g.lineTo(fwx + Math.cos(a2) * fwr, fwy + Math.sin(a2) * fwr); g.stroke();
      g.fillStyle = sp % 3 === 0 ? 'rgba(255,214,150,.9)' : 'rgba(190,226,255,.75)';
      g.fillRect(fwx + Math.cos(a2) * fwr - 1.6 * s, fwy + Math.sin(a2) * fwr - 1.6 * s, 3.2 * s, 3.2 * s);
    }
    g.strokeStyle = 'rgba(230,240,255,.4)'; g.lineWidth = 2 * s;
    g.beginPath(); g.moveTo(fwx - fwr * 0.5, h * 0.62); g.lineTo(fwx, fwy); g.lineTo(fwx + fwr * 0.5, h * 0.62); g.stroke();

    // 过山车轨道（右后）
    g.strokeStyle = 'rgba(28,46,70,.85)'; g.lineWidth = 2.6 * s;
    g.beginPath();
    g.moveTo(w * 0.42, h * 0.60);
    g.bezierCurveTo(w * 0.56, h * 0.34, w * 0.72, h * 0.52, w * 0.86, h * 0.40);
    g.stroke();
    g.strokeStyle = 'rgba(255,214,150,.5)'; g.lineWidth = 1 * s;
    for (var cl = 0; cl < 14; cl++) {
      var u = cl / 14;
      var lx = w * (0.42 + u * 0.44), ly = h * (0.60 - Math.sin(u * 3.1) * 0.16);
      g.fillStyle = 'rgba(255,226,170,.9)';
      g.fillRect(lx, ly - 2 * s, 2.4 * s, 2.4 * s);
    }

    // 跃出水面的鲸（右）
    var wx = w * 0.68, wy = h * 0.60;
    g.save();
    g.translate(wx, wy);
    g.fillStyle = '#16324e';
    // 尾鳍
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(w * 0.04, -h * 0.16, w * 0.06, -h * 0.24, w * 0.02, -h * 0.30);
    g.bezierCurveTo(w * 0.09, -h * 0.26, w * 0.13, -h * 0.20, w * 0.16, -h * 0.14);
    g.bezierCurveTo(w * 0.13, -h * 0.08, w * 0.07, -h * 0.04, 0, 0);
    g.fill();
    g.fillStyle = 'rgba(120,180,220,.35)';
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(w * 0.02, -h * 0.10, w * 0.02, -h * 0.18, 0, -h * 0.24);
    g.lineTo(w * 0.05, -h * 0.20);
    g.closePath(); g.fill();
    g.restore();
    // 水花
    var rw2 = seeded(83);
    for (var d = 0; d < 26; d++) {
      var ax = wx + (rw2() - 0.5) * w * 0.26, ay = wy + (rw2() - 0.4) * h * 0.09;
      g.fillStyle = 'rgba(232,246,255,' + (0.3 + rw2() * 0.5) + ')';
      g.beginPath(); g.arc(ax, ay, (1 + rw2() * 2.4) * s, 0, 7); g.fill();
    }

    // 水面反光
    var rl2 = seeded(97);
    for (var r2 = 0; r2 < 30; r2++) {
      g.fillStyle = 'rgba(220,240,255,' + (0.08 + rl2() * 0.22) + ')';
      g.beginPath();
      g.ellipse(rl2() * w, h * (0.62 + rl2() * 0.36), w * (0.02 + rl2() * 0.08), 1.2 * s, 0, 0, 7);
      g.fill();
    }
    vignette(g, w, h, 0.34);
    grain(g, w, h, 220, 9);
  };

  /* ============ 沈阳 · 长春：澡堂的热气 ============ */
  A.shenyang = function (g, w, h) {
    var s = w / 320;
    // 室内：暖褐
    g.fillStyle = lin(g, 0, 0, 0, h, [0, '#4a3628', 0.45, '#6b4e38', 1, '#8a6a4c']);
    g.fillRect(0, 0, w, h);
    // 墙砖
    g.strokeStyle = 'rgba(30,20,14,.22)'; g.lineWidth = 1 * s;
    for (var ty = h * 0.06; ty < h * 0.66; ty += h * 0.10) {
      g.beginPath(); g.moveTo(0, ty); g.lineTo(w, ty); g.stroke();
    }
    for (var tx2 = 0; tx2 < w; tx2 += w * 0.085) {
      g.beginPath(); g.moveTo(tx2, h * 0.06); g.lineTo(tx2, h * 0.66); g.stroke();
    }
    // 磨砂窗（右侧冷光）
    g.fillStyle = '#c8d8dc';
    g.fillRect(w * 0.70, h * 0.10, w * 0.24, h * 0.34);
    g.strokeStyle = '#4a3a2c'; g.lineWidth = 2.4 * s;
    g.strokeRect(w * 0.70, h * 0.10, w * 0.24, h * 0.34);
    g.beginPath();
    g.moveTo(w * 0.82, h * 0.10); g.lineTo(w * 0.82, h * 0.44);
    g.moveTo(w * 0.70, h * 0.27); g.lineTo(w * 0.94, h * 0.27); g.stroke();
    bloom(g, w * 0.82, h * 0.27, w * 0.26, 'rgba(210,232,240,.35)', 0.9);

    // 池子
    var py = h * 0.60;
    g.fillStyle = '#7a5c42';
    g.beginPath();
    g.ellipse(w * 0.44, py, w * 0.34, h * 0.10, 0, 0, 7);
    g.fill();
    g.fillStyle = '#3f6a72';
    g.beginPath();
    g.ellipse(w * 0.44, py + h * 0.012, w * 0.31, h * 0.082, 0, 0, 7);
    g.fill();
    g.fillStyle = 'rgba(160,220,230,.45)';
    g.beginPath();
    g.ellipse(w * 0.40, py, w * 0.20, h * 0.045, 0, 0, 7);
    g.fill();
    // 池边水面反光
    g.strokeStyle = 'rgba(210,246,250,.5)'; g.lineWidth = 1.4 * s;
    for (var wr = 0; wr < 4; wr++) {
      g.beginPath();
      g.ellipse(w * 0.44, py + h * 0.006, w * (0.10 + wr * 0.045), h * (0.02 + wr * 0.012), 0, 0, 7);
      g.stroke();
    }

    // 木凳 + 毛巾（左下）
    g.fillStyle = '#8a6244';
    g.fillRect(w * 0.04, h * 0.72, w * 0.28, h * 0.045);
    g.fillStyle = '#6b4a32';
    g.fillRect(w * 0.06, h * 0.765, w * 0.022, h * 0.10);
    g.fillRect(w * 0.27, h * 0.765, w * 0.022, h * 0.10);
    // 叠好的毛巾
    g.fillStyle = '#f0ece0';
    g.fillRect(w * 0.08, h * 0.685, w * 0.14, h * 0.036);
    g.fillStyle = '#dfd8c8';
    g.fillRect(w * 0.08, h * 0.685, w * 0.14, h * 0.010);
    g.fillStyle = '#c8bfae';
    g.fillRect(w * 0.125, h * 0.685, w * 0.012, h * 0.036);

    // 木桶 + 瓢（右下）
    g.fillStyle = '#a9793f';
    g.beginPath();
    g.moveTo(w * 0.74, h * 0.78);
    g.lineTo(w * 0.78, h * 0.78);
    g.lineTo(w * 0.772, h * 0.86);
    g.lineTo(w * 0.748, h * 0.86);
    g.closePath(); g.fill();
    g.strokeStyle = '#7a5636'; g.lineWidth = 2 * s;
    g.strokeRect(w * 0.742, h * 0.80, w * 0.036, h * 0.008);
    g.fillStyle = '#c9a173';
    g.beginPath(); g.ellipse(w * 0.76, h * 0.78, w * 0.02, h * 0.008, 0, 0, 7); g.fill();
    g.strokeStyle = '#8a6244'; g.lineWidth = 1.6 * s;
    g.beginPath();
    g.moveTo(w * 0.80, h * 0.80); g.lineTo(w * 0.86, h * 0.76); g.stroke();
    g.fillStyle = '#b8906a';
    g.beginPath(); g.arc(w * 0.865, h * 0.755, w * 0.014, 0, 7); g.fill();

    // 热气（一层一层的软曲线）
    var rs = seeded(21);
    for (var k = 0; k < 16; k++) {
      var bx = w * (0.16 + rs() * 0.62);
      var by = py - h * (0.02 + rs() * 0.22);
      var rr = (10 + rs() * 22) * s;
      g.fillStyle = 'rgba(255,252,246,' + (0.06 + rs() * 0.12) + ')';
      g.beginPath();
      g.ellipse(bx, by, rr, rr * 0.72, 0, 0, 7);
      g.fill();
    }
    g.strokeStyle = 'rgba(255,255,250,.28)'; g.lineWidth = 1.6 * s;
    for (var c2 = 0; c2 < 7; c2++) {
      var cxx = w * (0.20 + c2 * 0.08);
      g.beginPath();
      g.moveTo(cxx, py - h * 0.02);
      g.bezierCurveTo(cxx - w * 0.02, py - h * 0.14, cxx + w * 0.03, py - h * 0.24, cxx - w * 0.01, py - h * 0.34);
      g.stroke();
    }
    vignette(g, w, h, 0.36);
    grain(g, w, h, 220, 21);
  };

  /* ============ 重庆 · 山城与轻轨 ============ */
  A.chongqing = function (g, w, h) {
    var s = w / 320;
    g.fillStyle = lin(g, 0, 0, 0, h, [0, '#12182c', 0.4, '#1e2740', 0.7, '#2c3450', 1, '#3a3f58']);
    g.fillRect(0, 0, w, h);
    // 雾
    var rf = seeded(7);
    for (var i = 0; i < 30; i++) {
      g.fillStyle = 'rgba(150,170,200,' + (0.03 + rf() * 0.05) + ')';
      g.beginPath();
      g.ellipse(rf() * w, rf() * h, w * (0.10 + rf() * 0.22), h * 0.05, 0, 0, 7);
      g.fill();
    }
    // 三层楼群 + 道路
    var levels = [0.30, 0.52, 0.74];
    levels.forEach(function (lv, li) {
      var yy = h * lv;
      // 楼
      var rb = seeded(30 + li * 7);
      for (var b = 0; b < 9; b++) {
        var bx = w * (0.02 + b * 0.11) + rb() * w * 0.02;
        var bw = w * (0.055 + rb() * 0.045);
        var bh = h * (0.10 + rb() * 0.10);
        g.fillStyle = 'rgba(22,30,48,.92)';
        g.fillRect(bx, yy - bh, bw, bh);
        // 窗
        for (var wy = yy - bh + h * 0.012; wy < yy - h * 0.012; wy += h * 0.028) {
          for (var wx2 = bx + w * 0.008; wx2 < bx + bw - w * 0.012; wx2 += w * 0.018) {
            if (rb() > 0.42) {
              g.fillStyle = rb() > 0.6 ? 'rgba(255,214,150,.85)' : 'rgba(150,200,240,.55)';
              g.fillRect(wx2, wy, w * 0.010, h * 0.012);
            }
          }
        }
      }
      // 高架 / 道路
      g.fillStyle = 'rgba(48,54,72,.96)';
      g.fillRect(0, yy, w, h * 0.030);
      g.fillStyle = 'rgba(90,98,120,.55)';
      g.fillRect(0, yy, w, h * 0.006);
      // 路上车灯
      for (var cl = 0; cl < 7; cl++) {
        var cx3 = w * (0.04 + cl * 0.14);
        g.fillStyle = cl % 2 ? 'rgba(255,236,190,.9)' : 'rgba(255,120,110,.85)';
        g.fillRect(cx3, yy + h * 0.008, w * 0.018, h * 0.008);
      }
      // 桥墩
      g.fillStyle = 'rgba(34,40,58,.9)';
      for (var pi2 = 0; pi2 < 4; pi2++) {
        g.fillRect(w * (0.12 + pi2 * 0.26), yy + h * 0.030, w * 0.016, h * 0.05);
      }
    });
    // 轻轨列车（穿过楼群）
    var tx = w * 0.30, tyy = h * 0.505;
    g.fillStyle = 'rgba(240,246,255,.92)';
    g.fillRect(tx, tyy - h * 0.036, w * 0.40, h * 0.032);
    g.fillStyle = 'rgba(80,140,200,.9)';
    g.fillRect(tx, tyy - h * 0.020, w * 0.40, h * 0.014);
    for (var wq = 0; wq < 10; wq++) {
      g.fillStyle = 'rgba(255,226,168,.95)';
      g.fillRect(tx + w * 0.012 + wq * 0.038, tyy - h * 0.031, w * 0.026, h * 0.010);
    }
    bloom(g, tx + w * 0.06, tyy - h * 0.026, w * 0.10, 'rgba(255,230,180,.45)', 0.9);
    // 前车灯
    bloom(g, tx + w * 0.40, tyy - h * 0.020, w * 0.07, 'rgba(255,240,200,.55)', 0.9);
    // 霓虹招牌
    function neon(nx, ny, nw, nh2, col, txt) {
      g.fillStyle = 'rgba(20,24,36,.8)';
      g.fillRect(nx, ny, nw, nh2);
      g.strokeStyle = col; g.lineWidth = 1.6 * s;
      g.strokeRect(nx, ny, nw, nh2);
      g.fillStyle = col;
      g.font = 'bold ' + Math.round(11 * s) + 'px "PingFang SC", sans-serif';
      g.textAlign = 'center';
      g.fillText(txt, nx + nw / 2, ny + nh2 * 0.72);
      bloom(g, nx + nw / 2, ny + nh2 / 2, nw * 0.9, col.replace('1)', '.35)'), 0.7);
    }
    neon(w * 0.06, h * 0.58, w * 0.12, h * 0.06, 'rgba(255,120,110,1)', '火锅');
    neon(w * 0.80, h * 0.36, w * 0.14, h * 0.055, 'rgba(120,220,255,1)', '山城');

    // 火锅（前景）
    var hx = w * 0.5, hy = h * 0.885;
    g.fillStyle = '#c8a06a';
    g.beginPath(); g.ellipse(hx, hy, w * 0.155, h * 0.055, 0, 0, 7); g.fill();
    g.fillStyle = '#a8503c';
    g.beginPath(); g.ellipse(hx, hy - h * 0.006, w * 0.135, h * 0.045, 0, 0, 7); g.fill();
    g.fillStyle = '#d9633f';
    g.beginPath(); g.ellipse(hx, hy - h * 0.010, w * 0.115, h * 0.036, 0, 0, 7); g.fill();
    // 汤面气泡与辣椒
    var rhp = seeded(53);
    for (var hp = 0; hp < 16; hp++) {
      g.fillStyle = 'rgba(255,214,150,' + (0.3 + rhp() * 0.4) + ')';
      g.beginPath();
      g.arc(hx + (rhp() - 0.5) * w * 0.20, hy - h * 0.012 + (rhp() - 0.5) * h * 0.05, (1 + rhp() * 2.2) * s, 0, 7);
      g.fill();
    }
    // 筷子
    g.strokeStyle = '#e8d9b8'; g.lineWidth = 2 * s;
    g.beginPath(); g.moveTo(hx + w * 0.06, hy - h * 0.02); g.lineTo(hx + w * 0.20, hy - h * 0.16); g.stroke();
    g.beginPath(); g.moveTo(hx + w * 0.075, hy - h * 0.012); g.lineTo(hx + w * 0.215, hy - h * 0.152); g.stroke();
    // 蒸汽
    g.strokeStyle = 'rgba(255,240,220,.24)'; g.lineWidth = 1.8 * s;
    for (var hs = 0; hs < 5; hs++) {
      var sx2 = hx + (hs - 2) * w * 0.05;
      g.beginPath();
      g.moveTo(sx2, hy - h * 0.03);
      g.bezierCurveTo(sx2 - w * 0.02, hy - h * 0.12, sx2 + w * 0.03, hy - h * 0.18, sx2 - w * 0.01, hy - h * 0.26);
      g.stroke();
    }
    vignette(g, w, h, 0.40);
    grain(g, w, h, 220, 25);
  };

  /* ============ 成都 · 熊猫与竹林 ============ */
  A.chengdu = function (g, w, h) {
    var s = w / 320;
    g.fillStyle = lin(g, 0, 0, 0, h, [0, '#3f6a48', 0.35, '#5c8a5c', 0.68, '#88ab74', 1, '#b8c894']);
    g.fillRect(0, 0, w, h);
    // 光斑
    bloom(g, w * 0.74, h * 0.16, w * 0.36, 'rgba(255,246,200,.30)', 0.9);
    // 竹林（后层，淡）
    function stalk(bx, col, wpx, top, nodes) {
      g.strokeStyle = col; g.lineWidth = wpx * s;
      g.beginPath();
      g.moveTo(bx, h);
      g.quadraticCurveTo(bx - w * 0.02, h * 0.5, bx + w * 0.01, top);
      g.stroke();
      g.strokeStyle = 'rgba(40,70,40,.35)'; g.lineWidth = 1 * s;
      for (var n = 0; n < nodes; n++) {
        var ny = top + (h - top) * (n / nodes);
        g.beginPath(); g.moveTo(bx - wpx * 0.6 * s, ny); g.lineTo(bx + wpx * 0.6 * s, ny); g.stroke();
      }
    }
    var rb = seeded(13);
    for (var b = 0; b < 8; b++) {
      stalk(w * (0.04 + b * 0.13) + rb() * w * 0.03, 'rgba(74,110,72,.55)', 5, h * (0.02 + rb() * 0.1), 9);
    }
    for (var b2 = 0; b2 < 5; b2++) {
      stalk(w * (0.10 + b2 * 0.20) + rb() * w * 0.04, 'rgba(48,84,50,.8)', 8, h * (0.04 + rb() * 0.08), 8);
    }
    // 竹叶
    var rl = seeded(29);
    for (var l = 0; l < 60; l++) {
      var lx = rb() * w, ly = rb() * h * 0.62;
      var a3 = -0.4 + rl() * 0.9;
      var L = (10 + rl() * 14) * s;
      g.strokeStyle = 'rgba(40,86,44,' + (0.3 + rl() * 0.4) + ')'; g.lineWidth = 1.6 * s;
      g.beginPath();
      g.moveTo(lx, ly);
      g.quadraticCurveTo(lx + Math.cos(a3) * L * 0.5, ly + Math.sin(a3) * L * 0.5,
        lx + Math.cos(a3) * L, ly + Math.sin(a3) * L + L * 0.4);
      g.stroke();
    }
    // 地面
    g.fillStyle = lin(g, 0, h * 0.62, 0, h, [0, 'rgba(108,138,86,.95)', 0.5, '#7d9e66', 1, '#5f7d52']);
    g.fillRect(0, h * 0.62, w, h * 0.38);
    // 石头
    g.fillStyle = '#8a9280';
    g.beginPath();
    g.ellipse(w * 0.46, h * 0.83, w * 0.20, h * 0.06, 0, 0, 7);
    g.fill();
    g.fillStyle = 'rgba(255,255,245,.18)';
    g.beginPath();
    g.ellipse(w * 0.42, h * 0.815, w * 0.10, h * 0.026, -0.1, 0, 7);
    g.fill();

    // 熊猫
    var px3 = w * 0.47, py3 = h * 0.80, S = w * 0.30;
    // 身体
    g.fillStyle = '#f6f4ee';
    g.beginPath();
    g.ellipse(px3, py3 - S * 0.22, S * 0.30, S * 0.30, 0, 0, 7);
    g.fill();
    // 腿
    g.fillStyle = '#2b2b30';
    g.beginPath();
    g.ellipse(px3 - S * 0.20, py3 + S * 0.06, S * 0.11, S * 0.08, 0.3, 0, 7);
    g.fill();
    g.beginPath();
    g.ellipse(px3 + S * 0.20, py3 + S * 0.04, S * 0.11, S * 0.08, -0.2, 0, 7);
    g.fill();
    // 头
    g.fillStyle = '#f6f4ee';
    g.beginPath(); g.arc(px3, py3 - S * 0.56, S * 0.24, 0, 7); g.fill();
    // 耳朵
    g.fillStyle = '#2b2b30';
    g.beginPath(); g.arc(px3 - S * 0.19, py3 - S * 0.73, S * 0.075, 0, 7); g.fill();
    g.beginPath(); g.arc(px3 + S * 0.19, py3 - S * 0.73, S * 0.075, 0, 7); g.fill();
    // 黑眼圈
    g.beginPath();
    g.ellipse(px3 - S * 0.09, py3 - S * 0.58, S * 0.062, S * 0.082, -0.3, 0, 7);
    g.ellipse(px3 + S * 0.09, py3 - S * 0.58, S * 0.062, S * 0.082, 0.3, 0, 7);
    g.fill();
    // 眼睛
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.beginPath();
    g.arc(px3 - S * 0.085, py3 - S * 0.60, S * 0.020, 0, 7);
    g.arc(px3 + S * 0.095, py3 - S * 0.60, S * 0.020, 0, 7);
    g.fill();
    // 鼻子
    g.fillStyle = '#2b2b30';
    g.beginPath();
    g.ellipse(px3, py3 - S * 0.50, S * 0.030, S * 0.022, 0, 0, 7);
    g.fill();
    // 手上举着的竹子
    g.strokeStyle = '#5c9451'; g.lineWidth = 3 * s;
    g.beginPath();
    g.moveTo(px3 + S * 0.16, py3 - S * 0.30);
    g.lineTo(px3 + S * 0.42, py3 - S * 0.68);
    g.stroke();
    g.fillStyle = '#4f8848';
    for (var bl = 0; bl < 5; bl++) {
      var by2 = py3 - S * (0.34 + bl * 0.075);
      var sgn = bl % 2 ? 1 : -1;
      g.beginPath();
      g.ellipse(px3 + S * (0.18 + bl * 0.05) + sgn * S * 0.05, by2, S * 0.055, S * 0.016, sgn * 0.5, 0, 7);
      g.fill();
    }
    g.fillStyle = '#2b2b30';
    g.beginPath(); g.ellipse(px3 + S * 0.17, py3 - S * 0.28, S * 0.055, S * 0.045, 0.2, 0, 7); g.fill();

    // 盖碗茶（右）
    g.fillStyle = '#8a5c3a';
    g.fillRect(w * 0.78, h * 0.72, w * 0.10, h * 0.012);
    g.fillStyle = '#f2ece0';
    g.beginPath();
    g.moveTo(w * 0.80, h * 0.72);
    g.lineTo(w * 0.86, h * 0.72);
    g.lineTo(w * 0.85, h * 0.665);
    g.lineTo(w * 0.81, h * 0.665);
    g.closePath(); g.fill();
    g.fillStyle = '#e2dccd';
    g.beginPath(); g.ellipse(w * 0.83, h * 0.662, w * 0.026, h * 0.008, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1 * s;
    g.beginPath(); g.ellipse(w * 0.83, h * 0.664, w * 0.022, h * 0.006, 0, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,250,240,.28)'; g.lineWidth = 1.6 * s;
    g.beginPath();
    g.moveTo(w * 0.83, h * 0.65);
    g.bezierCurveTo(w * 0.82, h * 0.60, w * 0.85, h * 0.57, w * 0.83, h * 0.52);
    g.stroke();
    vignette(g, w, h, 0.32);
    grain(g, w, h, 220, 33);
  };

  /* ============ 乐山 · 大佛与甜皮鸭 ============ */
  A.leshan = function (g, w, h) {
    var s = w / 320;
    g.fillStyle = lin(g, 0, 0, 0, h, [0, '#8fb0c4', 0.4, '#b8ccd2', 0.72, '#d2dcd6', 1, '#e2e6da']);
    g.fillRect(0, 0, w, h);
    // 山崖
    g.fillStyle = lin(g, 0, 0, w, h, [0, '#6b7f6c', 0.5, '#8a9a80', 1, '#a8b096']);
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(w * 0.52, 0);
    g.lineTo(w * 0.50, h * 0.30);
    g.quadraticCurveTo(w * 0.56, h * 0.52, w * 0.44, h * 0.72);
    g.lineTo(w * 0.46, h);
    g.lineTo(0, h);
    g.closePath(); g.fill();
    // 崖上的植被
    var rv = seeded(19);
    for (var i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(58,88,58,' + (0.10 + rv() * 0.22) + ')';
      g.beginPath();
      g.ellipse(rv() * w * 0.5, rv() * h, w * (0.02 + rv() * 0.06), h * (0.01 + rv() * 0.03), 0, 0, 7);
      g.fill();
    }
    // 大佛（头 + 肩，侧向左）
    var bx = w * 0.30, by = h * 0.36;
    g.fillStyle = '#a8906c';
    g.beginPath();
    g.ellipse(bx, by, w * 0.13, h * 0.17, 0, 0, 7);
    g.fill();
    g.beginPath();
    g.moveTo(bx - w * 0.15, by + h * 0.06);
    g.quadraticCurveTo(bx - w * 0.22, by + h * 0.30, bx - w * 0.20, h * 0.86);
    g.lineTo(bx + w * 0.22, h * 0.86);
    g.quadraticCurveTo(bx + w * 0.20, by + h * 0.26, bx + w * 0.13, by + h * 0.06);
    g.closePath(); g.fill();
    // 耳
    g.fillStyle = '#9a8462';
    g.beginPath(); g.ellipse(bx - w * 0.125, by + h * 0.01, w * 0.022, h * 0.062, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(bx + w * 0.125, by + h * 0.01, w * 0.022, h * 0.062, 0, 0, 7); g.fill();
    // 发髻
    g.fillStyle = '#8f7a5a';
    for (var hb2 = 0; hb2 < 9; hb2++) {
      var ha = -Math.PI * 0.86 + hb2 / 8 * Math.PI * 0.72;
      g.beginPath();
      g.arc(bx + Math.cos(ha) * w * 0.115, by + Math.sin(ha) * h * 0.15, w * 0.022, 0, 7);
      g.fill();
    }
    // 眼 / 鼻 / 嘴（很淡的凹线）
    g.strokeStyle = 'rgba(110,88,60,.55)'; g.lineWidth = 1.6 * s;
    g.beginPath();
    g.moveTo(bx - w * 0.062, by - h * 0.02);
    g.quadraticCurveTo(bx - w * 0.035, by - h * 0.035, bx - w * 0.012, by - h * 0.018);
    g.moveTo(bx + w * 0.020, by - h * 0.020);
    g.quadraticCurveTo(bx + w * 0.045, by - h * 0.032, bx + w * 0.068, by - h * 0.014);
    g.stroke();
    g.beginPath();
    g.moveTo(bx - w * 0.008, by + h * 0.005);
    g.quadraticCurveTo(bx - w * 0.020, by + h * 0.045, bx + w * 0.002, by + h * 0.052);
    g.stroke();
    g.beginPath();
    g.moveTo(bx - w * 0.048, by + h * 0.086);
    g.quadraticCurveTo(bx, by + h * 0.106, bx + w * 0.048, by + h * 0.086);
    g.stroke();
    // 肩上的苔痕
    g.fillStyle = 'rgba(84,110,74,.20)';
    g.beginPath();
    g.ellipse(bx - w * 0.08, by + h * 0.26, w * 0.10, h * 0.04, 0.1, 0, 7);
    g.fill();

    // 江
    g.fillStyle = lin(g, 0, h * 0.74, 0, h, [0, '#7f9ea8', 0.4, '#6b8c9a', 1, '#587a88']);
    g.beginPath();
    g.moveTo(w * 0.40, h * 0.78);
    g.bezierCurveTo(w * 0.60, h * 0.74, w * 0.80, h * 0.80, w, h * 0.76);
    g.lineTo(w, h); g.lineTo(w * 0.40, h); g.closePath(); g.fill();
    // 江上的小船
    g.fillStyle = 'rgba(56,54,50,.8)';
    g.beginPath();
    g.moveTo(w * 0.66, h * 0.89);
    g.quadraticCurveTo(w * 0.72, h * 0.915, w * 0.80, h * 0.888);
    g.quadraticCurveTo(w * 0.73, h * 0.878, w * 0.66, h * 0.89);
    g.fill();
    g.fillStyle = 'rgba(230,226,214,.8)';
    g.beginPath();
    g.moveTo(w * 0.72, h * 0.882); g.lineTo(w * 0.75, h * 0.845);
    g.lineTo(w * 0.78, h * 0.882); g.closePath(); g.fill();
    // 雾
    for (var m = 0; m < 4; m++) {
      g.fillStyle = 'rgba(240,246,244,' + (0.14 + m * 0.05) + ')';
      g.beginPath();
      g.ellipse(w * (0.35 + m * 0.18), h * (0.66 + m * 0.03), w * 0.30, h * 0.035, 0, 0, 7);
      g.fill();
    }
    // 前景：石头 + 一袋甜皮鸭
    g.fillStyle = '#7d8474';
    g.beginPath();
    g.ellipse(w * 0.72, h * 0.95, w * 0.22, h * 0.055, 0, 0, 7);
    g.fill();
    g.fillStyle = 'rgba(255,255,240,.14)';
    g.beginPath();
    g.ellipse(w * 0.68, h * 0.94, w * 0.10, h * 0.02, 0, 0, 7);
    g.fill();
    // 油纸包（甜皮鸭）
    g.fillStyle = '#d8c29a';
    g.beginPath();
    g.moveTo(w * 0.68, h * 0.94);
    g.lineTo(w * 0.76, h * 0.94);
    g.lineTo(w * 0.755, h * 0.885);
    g.lineTo(w * 0.685, h * 0.885);
    g.closePath(); g.fill();
    g.fillStyle = '#b89a72';
    g.fillRect(w * 0.683, h * 0.882, w * 0.075, h * 0.012);
    // 露出来的鸭腿
    g.fillStyle = '#c17a3c';
    g.beginPath();
    g.ellipse(w * 0.722, h * 0.876, w * 0.026, h * 0.014, -0.2, 0, 7);
    g.fill();
    g.strokeStyle = '#8a5a2c'; g.lineWidth = 2 * s;
    g.beginPath();
    g.moveTo(w * 0.742, h * 0.872); g.lineTo(w * 0.756, h * 0.856); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.beginPath(); g.arc(w * 0.742, h * 0.856, 2 * s, 0, 7); g.fill();
    vignette(g, w, h, 0.28);
    grain(g, w, h, 220, 41);
  };

  /* ============ 苏州 · 园林与照顾 ============ */
  A.suzhou = function (g, w, h) {
    var s = w / 320;
    g.fillStyle = lin(g, 0, 0, 0, h, [0, '#a8bfc4', 0.45, '#c2d2d2', 0.8, '#d6e0dc', 1, '#e6ece4']);
    g.fillRect(0, 0, w, h);
    // 白墙
    g.fillStyle = '#eceee6';
    g.fillRect(0, h * 0.10, w * 0.62, h * 0.62);
    g.fillStyle = 'rgba(180,190,184,.35)';
    g.fillRect(0, h * 0.10, w * 0.62, h * 0.03);
    // 黛瓦
    g.fillStyle = '#3a4148';
    g.beginPath();
    g.moveTo(-w * 0.02, h * 0.10);
    g.lineTo(w * 0.20, h * 0.02);
    g.lineTo(w * 0.42, h * 0.10);
    g.lineTo(w * 0.64, h * 0.02);
    g.lineTo(w * 0.66, h * 0.10);
    g.lineTo(w * 0.66, h * 0.14);
    g.lineTo(-w * 0.02, h * 0.14);
    g.closePath(); g.fill();
    // 瓦楞
    g.strokeStyle = 'rgba(20,24,28,.35)'; g.lineWidth = 1 * s;
    for (var tl = 0; tl < 16; tl++) {
      var tlx = tl / 16 * w * 0.68;
      g.beginPath();
      g.moveTo(tlx, h * 0.14);
      g.lineTo(tlx + w * 0.01, h * 0.10 - Math.abs(tlx - w * 0.3) * 0.06);
      g.stroke();
    }
    // 月洞门
    var gx = w * 0.30, gy = h * 0.48, gr = h * 0.16;
    g.fillStyle = '#3f4a42';
    g.beginPath(); g.arc(gx, gy, gr, 0, 7); g.fill();
    g.fillStyle = '#cfd8ce';
    g.beginPath(); g.arc(gx, gy, gr * 0.86, 0, 7); g.fill();
    // 门里看到的竹子
    g.strokeStyle = 'rgba(70,110,74,.6)'; g.lineWidth = 2 * s;
    for (var mb = 0; mb < 4; mb++) {
      g.beginPath();
      g.moveTo(gx - gr * 0.5 + mb * gr * 0.34, gy + gr * 0.8);
      g.quadraticCurveTo(gx - gr * 0.4 + mb * gr * 0.34, gy, gx - gr * 0.2 + mb * gr * 0.34, gy - gr * 0.7);
      g.stroke();
    }
    g.strokeStyle = '#8a9288'; g.lineWidth = 3 * s;
    g.beginPath(); g.arc(gx, gy, gr, 0, 7); g.stroke();

    // 地面
    g.fillStyle = lin(g, 0, h * 0.70, 0, h, [0, '#9aa894', 0.4, '#8a9a86', 1, '#788a76']);
    g.beginPath();
    g.moveTo(0, h * 0.72); g.lineTo(w, h * 0.66); g.lineTo(w, h); g.lineTo(0, h);
    g.closePath(); g.fill();
    // 池
    g.fillStyle = lin(g, 0, h * 0.74, 0, h * 0.94, [0, '#8aa8ae', 0.5, '#6f929c', 1, '#5a7f8a']);
    g.beginPath();
    g.ellipse(w * 0.30, h * 0.86, w * 0.34, h * 0.11, -0.03, 0, 7);
    g.fill();
    g.strokeStyle = 'rgba(230,240,244,.45)'; g.lineWidth = 1.4 * s;
    g.beginPath();
    g.ellipse(w * 0.30, h * 0.86, w * 0.34, h * 0.11, -0.03, 0, 7);
    g.stroke();
    // 荷叶
    var rlo = seeded(59);
    for (var lo = 0; lo < 6; lo++) {
      var lox = w * (0.10 + rlo() * 0.42), loy = h * (0.80 + rlo() * 0.12);
      g.fillStyle = 'rgba(88,132,92,.9)';
      g.beginPath();
      g.ellipse(lox, loy, w * (0.035 + rlo() * 0.03), h * (0.014 + rlo() * 0.01), rlo() * 2, 0, 7);
      g.fill();
      g.fillStyle = 'rgba(150,190,140,.5)';
      g.beginPath();
      g.ellipse(lox - w * 0.008, loy - h * 0.004, w * 0.016, h * 0.006, 0, 0, 7);
      g.fill();
    }
    // 曲桥（右下）
    g.strokeStyle = '#d8d2c2'; g.lineWidth = 5 * s;
    g.beginPath();
    g.moveTo(w * 0.52, h * 0.98);
    g.lineTo(w * 0.62, h * 0.90);
    g.lineTo(w * 0.72, h * 0.96);
    g.lineTo(w * 0.84, h * 0.88);
    g.lineTo(w * 0.96, h * 0.94);
    g.stroke();
    g.strokeStyle = 'rgba(120,120,110,.55)'; g.lineWidth = 1.2 * s;
    g.beginPath();
    g.moveTo(w * 0.52, h * 0.98); g.lineTo(w * 0.62, h * 0.90);
    g.lineTo(w * 0.72, h * 0.96); g.lineTo(w * 0.84, h * 0.88); g.lineTo(w * 0.96, h * 0.94);
    g.stroke();

    // 垂柳（右上）
    g.strokeStyle = 'rgba(56,80,54,.75)'; g.lineWidth = 4 * s;
    g.beginPath(); g.moveTo(w * 0.86, h * 0.04); g.lineTo(w * 0.84, h * 0.28); g.stroke();
    g.lineWidth = 1.4 * s;
    var rw3 = seeded(71);
    for (var wl = 0; wl < 22; wl++) {
      var wx2 = w * (0.80 + rw3() * 0.16);
      var wy2 = h * (0.06 + rw3() * 0.1);
      var len = h * (0.16 + rw3() * 0.22);
      g.strokeStyle = 'rgba(74,104,66,' + (0.25 + rw3() * 0.35) + ')';
      g.beginPath();
      g.moveTo(wx2, wy2);
      g.quadraticCurveTo(wx2 + w * 0.02, wy2 + len * 0.5, wx2 - w * 0.01, wy2 + len);
      g.stroke();
    }
    // 雨丝
    g.strokeStyle = 'rgba(240,248,250,.35)'; g.lineWidth = 1 * s;
    var rr2 = seeded(89);
    for (var rn = 0; rn < 60; rn++) {
      var rx2 = rr2() * w, ry2 = rr2() * h;
      g.beginPath();
      g.moveTo(rx2, ry2); g.lineTo(rx2 - w * 0.008, ry2 + h * 0.05);
      g.stroke();
    }
    vignette(g, w, h, 0.26);
    grain(g, w, h, 220, 47);
  };

  /* ============ 扬州 · 早茶与一支牙刷 ============ */
  A.yangzhou = function (g, w, h) {
    var s = w / 320;
    // 晨光里的室内
    g.fillStyle = lin(g, 0, 0, w, h, [0, '#d8b884', 0.4, '#b89468', 1, '#7a5c40']);
    g.fillRect(0, 0, w, h);
    // 窗（左侧光）
    g.fillStyle = '#f6ecd4';
    g.fillRect(0, h * 0.06, w * 0.30, h * 0.44);
    g.strokeStyle = '#5b4330'; g.lineWidth = 2.6 * s;
    g.strokeRect(0, h * 0.06, w * 0.30, h * 0.44);
    g.beginPath();
    g.moveTo(w * 0.15, h * 0.06); g.lineTo(w * 0.15, h * 0.50);
    g.moveTo(0, h * 0.28); g.lineTo(w * 0.30, h * 0.28);
    g.stroke();
    bloom(g, w * 0.16, h * 0.28, w * 0.34, 'rgba(255,244,214,.42)', 0.9);
    // 桌面
    g.fillStyle = lin(g, 0, h * 0.68, 0, h, [0, '#a8764c', 0.3, '#94633e', 1, '#75492c']);
    g.fillRect(0, h * 0.68, w, h * 0.32);
    g.fillStyle = 'rgba(255,226,180,.18)';
    g.fillRect(0, h * 0.68, w, h * 0.012);
    g.strokeStyle = 'rgba(60,40,24,.22)'; g.lineWidth = 1.2 * s;
    for (var gy2 = h * 0.71; gy2 < h; gy2 += h * 0.06) {
      g.beginPath(); g.moveTo(0, gy2); g.lineTo(w, gy2); g.stroke();
    }

    // 蒸笼
    var sx3 = w * 0.24, sy3 = h * 0.74;
    g.fillStyle = '#d8c49a';
    g.beginPath(); g.ellipse(sx3, sy3 + h * 0.10, w * 0.14, h * 0.035, 0, 0, 7); g.fill();
    g.fillStyle = '#c9b184';
    g.fillRect(sx3 - w * 0.135, sy3 + h * 0.035, w * 0.27, h * 0.065);
    g.fillStyle = '#e2d0a8';
    g.beginPath(); g.ellipse(sx3, sy3 + h * 0.035, w * 0.135, h * 0.030, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(120,96,60,.4)'; g.lineWidth = 1.2 * s;
    g.beginPath(); g.ellipse(sx3, sy3 + h * 0.035, w * 0.135, h * 0.030, 0, 0, 7); g.stroke();
    // 包子
    [[-0.06, 0.028], [0, 0.020], [0.062, 0.030]].forEach(function (b3) {
      var bx3 = sx3 + b3[0] * w, by3 = sy3 + b3[1] * h;
      g.fillStyle = '#f8f4ea';
      g.beginPath(); g.arc(bx3, by3, w * 0.030, Math.PI, 0); g.rect(bx3 - w * 0.030, by3, w * 0.060, h * 0.018); g.fill();
      g.fillStyle = 'rgba(210,200,180,.6)';
      g.beginPath(); g.arc(bx3, by3 - w * 0.014, w * 0.008, 0, 7); g.fill();
    });
    // 蒸笼的蒸汽
    g.strokeStyle = 'rgba(255,252,242,.34)'; g.lineWidth = 2 * s;
    for (var st3 = 0; st3 < 4; st3++) {
      var stx = sx3 - w * 0.06 + st3 * w * 0.04;
      g.beginPath();
      g.moveTo(stx, sy3 + h * 0.015);
      g.bezierCurveTo(stx - w * 0.02, sy3 - h * 0.05, stx + w * 0.025, sy3 - h * 0.09, stx - w * 0.005, sy3 - h * 0.14);
      g.stroke();
    }

    // 茶壶（右）
    var tx3 = w * 0.66, ty3 = h * 0.78;
    g.fillStyle = '#cfd8d2';
    g.beginPath();
    g.ellipse(tx3, ty3, w * 0.072, h * 0.062, 0, 0, 7);
    g.fill();
    g.fillStyle = '#b9c4be';
    g.beginPath(); g.ellipse(tx3, ty3 + h * 0.05, w * 0.050, h * 0.016, 0, 0, 7); g.fill();
    // 盖
    g.fillStyle = '#dde5df';
    g.beginPath(); g.ellipse(tx3, ty3 - h * 0.056, w * 0.040, h * 0.014, 0, 0, 7); g.fill();
    g.fillStyle = '#a8b4ae';
    g.beginPath(); g.arc(tx3, ty3 - h * 0.072, w * 0.010, 0, 7); g.fill();
    // 嘴 / 把
    g.strokeStyle = '#b9c4be'; g.lineWidth = 4 * s;
    g.beginPath();
    g.moveTo(tx3 + w * 0.062, ty3 - h * 0.006);
    g.quadraticCurveTo(tx3 + w * 0.10, ty3 - h * 0.02, tx3 + w * 0.098, ty3 - h * 0.05);
    g.stroke();
    g.lineWidth = 3.4 * s;
    g.beginPath();
    g.arc(tx3 - w * 0.082, ty3 - h * 0.004, w * 0.030, -1.2, 1.2);
    g.stroke();
    // 杯子
    g.fillStyle = '#eeeae0';
    g.beginPath();
    g.moveTo(w * 0.80, h * 0.80);
    g.lineTo(w * 0.86, h * 0.80);
    g.lineTo(w * 0.852, h * 0.865);
    g.lineTo(w * 0.808, h * 0.865);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(190,160,110,.55)';
    g.beginPath(); g.ellipse(w * 0.83, h * 0.803, w * 0.028, h * 0.008, 0, 0, 7); g.fill();

    // 那支一直没扔的牙刷（漱口杯里）
    var gx2 = w * 0.44, gy3 = h * 0.70;
    g.fillStyle = 'rgba(220,232,236,.55)';
    g.beginPath();
    g.moveTo(gx2 - w * 0.032, gy3);
    g.lineTo(gx2 + w * 0.032, gy3);
    g.lineTo(gx2 + w * 0.028, gy3 + h * 0.10);
    g.lineTo(gx2 - w * 0.028, gy3 + h * 0.10);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.4 * s;
    g.stroke();
    // 两支牙刷
    [[-0.012, '#7ac0c8', -0.10], [0.014, '#f0a83c', 0.04]].forEach(function (tb) {
      var bx4 = gx2 + tb[0] * w;
      g.save();
      g.translate(bx4, gy3 + h * 0.02);
      g.rotate(tb[2]);
      g.fillStyle = tb[1];
      g.fillRect(-w * 0.008, -h * 0.20, w * 0.016, h * 0.16);
      g.fillStyle = '#f8f4ea';
      g.fillRect(-w * 0.010, -h * 0.235, w * 0.020, h * 0.038);
      g.restore();
    });
    // 一支牙刷的反光
    bloom(g, gx2, gy3 - h * 0.10, w * 0.10, 'rgba(255,248,224,.28)', 0.8);
    vignette(g, w, h, 0.34);
    grain(g, w, h, 220, 53);
  };

  /* ============ 淄博 · 烧烤 ============ */
  A.zibo = function (g, w, h) {
    var s = w / 320;
    g.fillStyle = lin(g, 0, 0, 0, h, [0, '#161c26', 0.4, '#232a34', 0.7, '#33291f', 1, '#4a3524']);
    g.fillRect(0, 0, w, h);
    // 远处暖光
    bloom(g, w * 0.5, h * 0.42, w * 0.5, 'rgba(255,150,70,.30)', 0.9);
    // 串灯
    g.strokeStyle = 'rgba(60,50,40,.8)'; g.lineWidth = 1.4 * s;
    g.beginPath();
    g.moveTo(0, h * 0.12);
    g.quadraticCurveTo(w * 0.5, h * 0.22, w, h * 0.10);
    g.stroke();
    for (var bl2 = 0; bl2 < 12; bl2++) {
      var u = bl2 / 11;
      var bx5 = w * u;
      var by5 = h * (0.12 + Math.sin(u * Math.PI) * 0.10);
      bloom(g, bx5, by5 + h * 0.02, w * 0.035, 'rgba(255,200,120,.55)', 0.9);
      g.fillStyle = 'rgba(255,226,160,.95)';
      g.beginPath(); g.arc(bx5, by5 + h * 0.02, 2.4 * s, 0, 7); g.fill();
    }
    // 烤炉
    var gx3 = w * 0.50, gy4 = h * 0.66;
    g.fillStyle = '#2e2a26';
    g.fillRect(gx3 - w * 0.30, gy4, w * 0.60, h * 0.035);
    g.fillStyle = '#1f1c1a';
    g.fillRect(gx3 - w * 0.30, gy4 + h * 0.035, w * 0.60, h * 0.12);
    // 炭火
    g.fillStyle = '#8a3a1e';
    g.fillRect(gx3 - w * 0.28, gy4 + h * 0.006, w * 0.56, h * 0.022);
    var rc3 = seeded(37);
    for (var ch = 0; ch < 40; ch++) {
      var cx4 = gx3 - w * 0.27 + rc3() * w * 0.54;
      g.fillStyle = rc3() > 0.5 ? 'rgba(255,150,60,.95)' : 'rgba(255,206,120,.9)';
      g.beginPath();
      g.arc(cx4, gy4 + h * (0.008 + rc3() * 0.018), (1 + rc3() * 2.6) * s, 0, 7);
      g.fill();
    }
    bloom(g, gx3, gy4 + h * 0.02, w * 0.34, 'rgba(255,140,60,.35)', 0.9);
    // 烤串
    for (var sk = 0; sk < 9; sk++) {
      var sx4 = gx3 - w * 0.26 + sk * w * 0.062;
      g.strokeStyle = 'rgba(210,190,160,.75)'; g.lineWidth = 2 * s;
      g.beginPath();
      g.moveTo(sx4 + w * 0.006, gy4 - h * 0.005);
      g.lineTo(sx4 + w * 0.020, gy4 - h * 0.075);
      g.stroke();
      for (var mq = 0; mq < 3; mq++) {
        g.fillStyle = mq % 2 ? '#8a4a2c' : '#a85a30';
        g.beginPath();
        g.ellipse(sx4 + w * (0.009 + mq * 0.004), gy4 - h * (0.018 + mq * 0.018), w * 0.014, h * 0.010, 0.5, 0, 7);
        g.fill();
      }
    }
    // 烟
    g.strokeStyle = 'rgba(230,220,210,.16)'; g.lineWidth = 3 * s;
    for (var sm = 0; sm < 5; sm++) {
      var smx = gx3 - w * 0.16 + sm * w * 0.08;
      g.beginPath();
      g.moveTo(smx, gy4 - h * 0.04);
      g.bezierCurveTo(smx - w * 0.03, gy4 - h * 0.14, smx + w * 0.04, gy4 - h * 0.20, smx - w * 0.01, gy4 - h * 0.30);
      g.stroke();
    }
    // 小饼（左）
    g.fillStyle = '#e8d6ae';
    for (var pn = 0; pn < 4; pn++) {
      g.beginPath();
      g.ellipse(w * 0.14, h * (0.74 - pn * 0.026), w * 0.075, h * 0.020, 0, 0, 7);
      g.fill();
      g.fillStyle = pn % 2 ? '#e2cfa4' : '#e8d6ae';
    }
    g.fillStyle = 'rgba(200,170,120,.5)';
    g.beginPath(); g.ellipse(w * 0.14, h * 0.688, w * 0.072, h * 0.018, 0, 0, 7); g.fill();
    // 小葱
    g.strokeStyle = '#6f9a4a'; g.lineWidth = 3 * s;
    for (var sc = 0; sc < 5; sc++) {
      g.beginPath();
      g.moveTo(w * 0.24 + sc * w * 0.010, h * 0.79);
      g.quadraticCurveTo(w * 0.25 + sc * w * 0.012, h * 0.72, w * 0.235 + sc * w * 0.014, h * 0.68);
      g.stroke();
    }
    g.fillStyle = '#f2f0e2';
    g.beginPath(); g.ellipse(w * 0.255, h * 0.795, w * 0.030, h * 0.012, 0, 0, 7); g.fill();
    // 塑料凳（右）
    g.fillStyle = '#b8443a';
    g.fillRect(w * 0.82, h * 0.78, w * 0.14, h * 0.020);
    g.fillStyle = '#a03a32';
    g.fillRect(w * 0.835, h * 0.80, w * 0.014, h * 0.09);
    g.fillRect(w * 0.94, h * 0.80, w * 0.014, h * 0.09);
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.fillRect(w * 0.82, h * 0.78, w * 0.14, h * 0.006);
    vignette(g, w, h, 0.42);
    grain(g, w, h, 220, 59);
  };

  /* ============ 东营 · 黄河入海口的日落 ============ */
  A.dongying = function (g, w, h) {
    var s = w / 320;
    g.fillStyle = lin(g, 0, 0, 0, h * 0.58, [0, '#4a5f92', 0.35, '#8a7fa0', 0.62, '#d8a07e', 0.85, '#f2c48a', 1, '#fae0b0']);
    g.fillRect(0, 0, w, h);
    // 落日
    bloom(g, w * 0.58, h * 0.54, w * 0.34, 'rgba(255,214,150,.5)', 0.9);
    bloom(g, w * 0.58, h * 0.54, w * 0.09, 'rgba(255,250,224,.95)', 1);
    g.fillStyle = '#fffaf0';
    g.beginPath(); g.arc(w * 0.58, h * 0.54, w * 0.048, 0, 7); g.fill();
    // 云带
    var rc4 = seeded(67);
    for (var c4 = 0; c4 < 9; c4++) {
      g.fillStyle = 'rgba(255,230,200,' + (0.10 + rc4() * 0.16) + ')';
      g.beginPath();
      g.ellipse(rc4() * w, h * (0.12 + rc4() * 0.34), w * (0.08 + rc4() * 0.18), h * 0.016, 0, 0, 7);
      g.fill();
    }
    // 水面：左黄（河）右蓝（海），中间一条交界
    g.fillStyle = lin(g, 0, h * 0.56, 0, h * 0.80, [0, '#e8bc84', 0.5, '#cf9a5e', 1, '#a87a48']);
    g.beginPath();
    g.moveTo(0, h * 0.60);
    g.bezierCurveTo(w * 0.20, h * 0.56, w * 0.40, h * 0.62, w * 0.58, h * 0.60);
    g.lineTo(w * 0.58, h);
    g.lineTo(0, h);
    g.closePath(); g.fill();
    g.fillStyle = lin(g, 0, h * 0.56, 0, h * 0.80, [0, '#5f8fae', 0.5, '#43758f', 1, '#2f5a72']);
    g.beginPath();
    g.moveTo(w * 0.58, h * 0.60);
    g.bezierCurveTo(w * 0.76, h * 0.575, w * 0.90, h * 0.615, w, h * 0.595);
    g.lineTo(w, h); g.lineTo(w * 0.58, h);
    g.closePath(); g.fill();
    // 交界的白色泡沫线
    g.strokeStyle = 'rgba(255,248,232,.55)'; g.lineWidth = 2.2 * s;
    g.beginPath();
    g.moveTo(w * 0.58, h * 0.60);
    g.bezierCurveTo(w * 0.52, h * 0.72, w * 0.62, h * 0.84, w * 0.54, h);
    g.stroke();
    // 太阳在水面的光路
    g.save();
    g.globalCompositeOperation = 'lighter';
    var sp2 = g.createLinearGradient(0, h * 0.58, 0, h);
    sp2.addColorStop(0, 'rgba(255,226,168,.5)');
    sp2.addColorStop(1, 'rgba(255,226,168,0)');
    g.fillStyle = sp2;
    g.fillRect(w * 0.52, h * 0.58, w * 0.12, h * 0.42);
    g.restore();
    // 波纹
    var rw4 = seeded(73);
    for (var wr2 = 0; wr2 < 40; wr2++) {
      g.fillStyle = 'rgba(255,246,224,' + (0.06 + rw4() * 0.22) + ')';
      g.beginPath();
      g.ellipse(rw4() * w, h * (0.62 + rw4() * 0.36), w * (0.02 + rw4() * 0.09), 1.4 * s, 0, 0, 7);
      g.fill();
    }
    // 岸堤与车
    g.fillStyle = '#3a3a32';
    g.beginPath();
    g.moveTo(0, h * 0.70);
    g.quadraticCurveTo(w * 0.20, h * 0.685, w * 0.40, h * 0.705);
    g.lineTo(w * 0.40, h * 0.745);
    g.quadraticCurveTo(w * 0.18, h * 0.73, 0, h * 0.75);
    g.closePath(); g.fill();
    // 车（很小的剪影，停在堤上）
    g.fillStyle = '#26262a';
    g.fillRect(w * 0.10, h * 0.665, w * 0.062, h * 0.022);
    g.fillRect(w * 0.112, h * 0.650, w * 0.038, h * 0.018);
    g.beginPath();
    g.arc(w * 0.115, h * 0.690, w * 0.008, 0, 7);
    g.arc(w * 0.150, h * 0.690, w * 0.008, 0, 7);
    g.fill();
    // 芦苇（前景）
    var rr3 = seeded(81);
    for (var rd = 0; rd < 46; rd++) {
      var rdx = rr3() * w, rdy = h * (0.80 + rr3() * 0.20);
      var rh2 = h * (0.10 + rr3() * 0.22);
      g.strokeStyle = 'rgba(58,52,38,' + (0.45 + rr3() * 0.45) + ')';
      g.lineWidth = (1.2 + rr3() * 1.4) * s;
      g.beginPath();
      g.moveTo(rdx, rdy);
      g.quadraticCurveTo(rdx + w * 0.008, rdy - rh2 * 0.6, rdx + w * (0.01 - rr3() * 0.03), rdy - rh2);
      g.stroke();
      if (rr3() > 0.55) {
        g.fillStyle = 'rgba(140,110,70,.75)';
        g.beginPath();
        g.ellipse(rdx + w * 0.008, rdy - rh2, w * 0.008, h * 0.014, 0, 0, 7);
        g.fill();
      }
    }
    // 鸟
    g.strokeStyle = 'rgba(50,44,46,.6)'; g.lineWidth = 1.6 * s;
    for (var bd = 0; bd < 5; bd++) {
      var bdx = w * (0.66 + bd * 0.05), bdy = h * (0.24 + (bd % 3) * 0.04);
      g.beginPath();
      g.moveTo(bdx - w * 0.014, bdy);
      g.quadraticCurveTo(bdx - w * 0.006, bdy - h * 0.012, bdx, bdy);
      g.quadraticCurveTo(bdx + w * 0.006, bdy - h * 0.012, bdx + w * 0.014, bdy);
      g.stroke();
    }
    vignette(g, w, h, 0.30);
    grain(g, w, h, 220, 61);
  };

  /* ============ 武汉 · 长江大桥（地图回忆用） ============ */
  A.wuhan = function (g, w, h) {
    var s = w / 320;
    g.fillStyle = lin(g, 0, 0, 0, h * 0.62, [0, '#101a2e', 0.4, '#1d2b46', 0.72, '#3a4a68', 1, '#7a6a76']);
    g.fillRect(0, 0, w, h);
    bloom(g, w * 0.62, h * 0.56, w * 0.5, 'rgba(210,140,100,.28)', 0.9);
    // 对岸城市
    var rb = seeded(43);
    for (var b = 0; b < 14; b++) {
      var bx = w * (0.02 + b * 0.072), bw = w * (0.04 + rb() * 0.03);
      var bh = h * (0.06 + rb() * 0.12);
      g.fillStyle = 'rgba(20,28,44,.95)';
      g.fillRect(bx, h * 0.60 - bh, bw, bh);
      for (var wy3 = h * 0.60 - bh + h * 0.014; wy3 < h * 0.60 - h * 0.014; wy3 += h * 0.026) {
        for (var wx3 = bx + w * 0.006; wx3 < bx + bw - w * 0.008; wx3 += w * 0.014) {
          if (rb() > 0.45) {
            g.fillStyle = 'rgba(255,214,150,.85)';
            g.fillRect(wx3, wy3, w * 0.007, h * 0.010);
          }
        }
      }
    }
    // 桥（斜跨画面）
    g.save();
    g.translate(w * 0.5, h * 0.36);
    g.rotate(-0.045);
    g.fillStyle = 'rgba(18,24,38,.98)';
    g.fillRect(-w * 0.62, 0, w * 1.24, h * 0.048);
    // 桁架
    g.strokeStyle = 'rgba(14,20,34,.95)'; g.lineWidth = 2 * s;
    g.beginPath();
    g.moveTo(-w * 0.62, -h * 0.032); g.lineTo(w * 0.62, -h * 0.032);
    g.stroke();
    for (var i2 = 0; i2 < 26; i2++) {
      var x2 = -w * 0.62 + i2 * w * 0.048;
      g.beginPath();
      g.moveTo(x2, -h * 0.032); g.lineTo(x2 + w * 0.024, 0);
      g.moveTo(x2 + w * 0.024, -h * 0.032); g.lineTo(x2, 0);
      g.stroke();
    }
    // 桥灯
    for (var l2 = 0; l2 < 14; l2++) {
      var lx3 = -w * 0.60 + l2 * w * 0.09;
      bloom(g, lx3, -h * 0.046, w * 0.022, 'rgba(255,220,160,.6)', 0.9);
      g.fillStyle = 'rgba(255,238,196,.95)';
      g.beginPath(); g.arc(lx3, -h * 0.046, 1.8 * s, 0, 7); g.fill();
      g.fillStyle = 'rgba(30,38,54,.9)';
      g.fillRect(lx3 - 1 * s, -h * 0.044, 2 * s, h * 0.014);
    }
    // 桥墩
    [0.16, 0.44, 0.72, 0.94].forEach(function (u) {
      g.fillStyle = 'rgba(22,28,42,.97)';
      g.fillRect(-w * 0.62 + w * 1.24 * u, h * 0.048, w * 0.022, h * 0.16);
    });
    g.restore();
    // 江
    g.fillStyle = lin(g, 0, h * 0.58, 0, h, [0, '#33415c', 0.35, '#2a3852', 0.7, '#22304a', 1, '#1a2740']);
    g.fillRect(0, h * 0.58, w, h * 0.42);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (var rf3 = 0; rf3 < 9; rf3++) {
      var rfx = w * (0.08 + rf3 * 0.10);
      var grd3 = g.createLinearGradient(0, h * 0.60, 0, h * 0.86);
      grd3.addColorStop(0, 'rgba(255,206,150,.16)');
      grd3.addColorStop(1, 'rgba(255,206,150,0)');
      g.fillStyle = grd3;
      g.fillRect(rfx, h * 0.60, w * 0.02, h * 0.26);
    }
    g.restore();
    var rw5 = seeded(53);
    for (var wq2 = 0; wq2 < 30; wq2++) {
      g.fillStyle = 'rgba(200,216,240,' + (0.05 + rw5() * 0.16) + ')';
      g.beginPath();
      g.ellipse(rw5() * w, h * (0.62 + rw5() * 0.34), w * (0.02 + rw5() * 0.07), 1.2 * s, 0, 0, 7);
      g.fill();
    }
    // 江岸 + 长椅 + 路灯
    g.fillStyle = lin(g, 0, h * 0.86, 0, h, [0, '#5a5850', 1, '#454340']);
    g.fillRect(0, h * 0.86, w, h * 0.14);
    g.fillStyle = 'rgba(200,204,212,.25)';
    g.fillRect(0, h * 0.86, w, h * 0.008);
    // 栏杆
    g.fillStyle = '#7a776e';
    for (var rl3 = 0; rl3 < 16; rl3++) g.fillRect(w * (0.02 + rl3 * 0.062), h * 0.845, w * 0.008, h * 0.03);
    // 长椅
    g.fillStyle = '#6b5a48';
    g.fillRect(w * 0.12, h * 0.925, w * 0.20, h * 0.014);
    g.fillRect(w * 0.12, h * 0.905, w * 0.20, h * 0.012);
    g.fillStyle = '#4a3d30';
    g.fillRect(w * 0.13, h * 0.939, w * 0.014, h * 0.03);
    g.fillRect(w * 0.29, h * 0.939, w * 0.014, h * 0.03);
    // 路灯
    g.fillStyle = '#3a3a3c';
    g.fillRect(w * 0.72, h * 0.76, w * 0.008, h * 0.19);
    bloom(g, w * 0.724, h * 0.755, w * 0.10, 'rgba(255,214,140,.55)', 0.9);
    g.fillStyle = '#ffe9b8';
    g.fillRect(w * 0.712, h * 0.745, w * 0.028, h * 0.018);
    vignette(g, w, h, 0.44);
    grain(g, w, h, 220, 67);
  };

  /* ============ 吉隆坡 · 双塔与行李（地图回忆用） ============ */
  A.kl = function (g, w, h) {
    var s = w / 320;
    g.fillStyle = lin(g, 0, 0, 0, h, [0, '#070e1a', 0.4, '#0f1c30', 0.7, '#1a2c44', 1, '#263c50']);
    g.fillRect(0, 0, w, h);
    // 星
    var rs2 = seeded(11);
    for (var i = 0; i < 70; i++) {
      g.fillStyle = 'rgba(255,255,255,' + (0.15 + rs2() * 0.6) + ')';
      g.fillRect(rs2() * w, rs2() * h * 0.5, 1.1 * s, 1.1 * s);
    }
    bloom(g, w * 0.56, h * 0.62, w * 0.5, 'rgba(255,196,140,.22)', 0.9);
    // 天际线
    var rb = seeded(23);
    for (var b = 0; b < 16; b++) {
      var bx = w * (-0.02 + b * 0.068), bw = w * (0.038 + rb() * 0.03);
      var bh = h * (0.05 + rb() * 0.10);
      g.fillStyle = 'rgba(14,24,38,.96)';
      g.fillRect(bx, h * 0.66 - bh, bw, bh);
      for (var wy4 = h * 0.66 - bh + h * 0.012; wy4 < h * 0.66 - h * 0.01; wy4 += h * 0.022) {
        for (var wx4 = bx + w * 0.006; wx4 < bx + bw - w * 0.006; wx4 += w * 0.012) {
          if (rb() > 0.5) {
            g.fillStyle = 'rgba(255,212,148,.8)';
            g.fillRect(wx4, wy4, w * 0.006, h * 0.009);
          }
        }
      }
    }
    // 双子塔
    function tower(cx5) {
      var top2 = h * 0.16, base2 = h * 0.66, hw2 = w * 0.045;
      g.beginPath();
      g.moveTo(cx5 - hw2, base2);
      g.lineTo(cx5 - hw2 * 0.78, top2 + h * 0.06);
      g.lineTo(cx5 - hw2 * 0.5, top2);
      g.lineTo(cx5 + hw2 * 0.5, top2);
      g.lineTo(cx5 + hw2 * 0.78, top2 + h * 0.06);
      g.lineTo(cx5 + hw2, base2);
      g.closePath();
      g.fillStyle = '#cfdce8'; g.fill();
      var grd = g.createLinearGradient(cx5 - hw2, 0, cx5 + hw2, 0);
      grd.addColorStop(0, 'rgba(90,116,146,.9)');
      grd.addColorStop(0.4, 'rgba(232,242,250,.95)');
      grd.addColorStop(1, 'rgba(120,148,176,.9)');
      g.fillStyle = grd; g.fill();
      for (var f2 = 0; f2 < 14; f2++) {
        var yy2 = top2 + h * 0.07 + f2 * (h * 0.036);
        g.fillStyle = f2 % 2 ? 'rgba(255,224,168,.6)' : 'rgba(130,168,200,.5)';
        g.fillRect(cx5 - hw2 * 0.86, yy2, hw2 * 1.72, 1.6 * s);
      }
      g.strokeStyle = '#e8f2fa'; g.lineWidth = 2 * s;
      g.beginPath(); g.moveTo(cx5, top2); g.lineTo(cx5, top2 - h * 0.06); g.stroke();
      g.fillStyle = 'rgba(255,140,120,.9)';
      g.beginPath(); g.arc(cx5, top2 - h * 0.062, 1.8 * s, 0, 7); g.fill();
    }
    tower(w * 0.50);
    tower(w * 0.60);
    // 空中连桥
    g.fillStyle = '#dbe7f2';
    g.fillRect(w * 0.517, h * 0.40, w * 0.066, h * 0.012);
    g.fillStyle = 'rgba(255,226,168,.85)';
    g.fillRect(w * 0.520, h * 0.401, w * 0.060, h * 0.004);

    // 公园地面
    g.fillStyle = lin(g, 0, h * 0.66, 0, h, [0, '#1d3326', 0.4, '#1a2e22', 1, '#132318']);
    g.fillRect(0, h * 0.66, w, h * 0.34);
    // 树影
    var rt = seeded(31);
    for (var t3 = 0; t3 < 10; t3++) {
      var tx4 = w * (0.04 + rt() * 0.9), ty4 = h * (0.70 + rt() * 0.10);
      g.fillStyle = 'rgba(10,24,16,.85)';
      g.beginPath();
      g.ellipse(tx4, ty4, w * (0.05 + rt() * 0.05), h * (0.03 + rt() * 0.03), 0, 0, 7);
      g.fill();
      g.fillStyle = 'rgba(28,54,36,.9)';
      g.beginPath();
      g.ellipse(tx4 - w * 0.01, ty4 - h * 0.012, w * (0.04 + rt() * 0.04), h * (0.024 + rt() * 0.02), 0, 0, 7);
      g.fill();
    }
    // 步道
    g.fillStyle = 'rgba(96,96,86,.9)';
    g.beginPath();
    g.moveTo(w * 0.30, h);
    g.lineTo(w * 0.44, h);
    g.lineTo(w * 0.62, h * 0.67);
    g.lineTo(w * 0.54, h * 0.67);
    g.closePath(); g.fill();
    // 行李箱（前景，贴纸 + 吊牌）
    var lx4 = w * 0.74, ly4 = h * 0.86;
    g.fillStyle = '#7a4f30';
    g.beginPath();
    g.moveTo(lx4 - w * 0.075, ly4);
    g.lineTo(lx4 + w * 0.075, ly4);
    g.lineTo(lx4 + w * 0.070, ly4 - h * 0.16);
    g.lineTo(lx4 - w * 0.070, ly4 - h * 0.16);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.10)';
    g.fillRect(lx4 - w * 0.070, ly4 - h * 0.16, w * 0.030, h * 0.16);
    // 拉杆
    g.strokeStyle = '#4a3a2c'; g.lineWidth = 2.4 * s;
    g.beginPath();
    g.moveTo(lx4 - w * 0.030, ly4 - h * 0.16); g.lineTo(lx4 - w * 0.030, ly4 - h * 0.235);
    g.moveTo(lx4 + w * 0.030, ly4 - h * 0.16); g.lineTo(lx4 + w * 0.030, ly4 - h * 0.235);
    g.moveTo(lx4 - w * 0.030, ly4 - h * 0.235); g.lineTo(lx4 + w * 0.030, ly4 - h * 0.235);
    g.stroke();
    // 贴纸
    g.fillStyle = 'rgba(230,220,190,.85)';
    g.beginPath(); g.arc(lx4 - w * 0.028, ly4 - h * 0.09, w * 0.016, 0, 7); g.fill();
    g.fillStyle = 'rgba(200,90,80,.85)';
    g.beginPath(); g.arc(lx4 + w * 0.022, ly4 - h * 0.06, w * 0.013, 0, 7); g.fill();
    // 行李吊牌
    g.strokeStyle = 'rgba(200,190,160,.8)'; g.lineWidth = 1.2 * s;
    g.beginPath(); g.moveTo(lx4 + w * 0.050, ly4 - h * 0.12); g.lineTo(lx4 + w * 0.066, ly4 - h * 0.075); g.stroke();
    g.fillStyle = '#e8dfc6';
    g.save();
    g.translate(lx4 + w * 0.068, ly4 - h * 0.068);
    g.rotate(0.3);
    g.fillRect(-w * 0.016, -h * 0.016, w * 0.032, h * 0.032);
    g.restore();
    bloom(g, lx4, ly4 - h * 0.08, w * 0.14, 'rgba(255,214,160,.10)', 0.8);
    vignette(g, w, h, 0.46);
    grain(g, w, h, 220, 71);
  };

  return A;
})();
