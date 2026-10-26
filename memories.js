/* memories.js — 我们的旅行回忆册（v2 事实核对版）
 * ★ 照片（可选增强）：以后把照片放进项目（如 photos/wuhai.jpg），把 image 改成路径即可。
 * ★ 全部内容基于我们的真实经历，不虚构细节：
 *   乌海=沙漠+湖泊+越野车+蜥蜴（不是海边！）；赛里木湖=2026-05-11 登记结婚；扬州=酒店牙刷纪念。
 * art: 每条一个原创像素小插画绘制函数（ctx 已平移到插画左上角，画布 w×h）。
 */
window.Memories = [
  { id: 'wuhai', x: 370, y: 935, title: '乌海 · 沙漠与湖', location: '内蒙古 · 乌海', date: '', object: 'jeep', color: '#d8b06a', image: null,
    message: '一半是沙漠，一半是湖。我们开着越野车爬上沙丘，还认真地学习了怎么辨认小蜥蜴的脚印。' },
  { id: 'doha', x: 1295, y: 1075, title: '多哈 · 夜晚的主街', location: '卡塔尔 · 多哈', date: '', object: 'lantern', color: '#f0d8a8', image: null,
    message: '晚上在主街散步，拍来来往往的行人，逛了一路的橱窗。这座城市的珍珠历史很美，虽然我们只是路过它的人。' },
  { id: 'tibet', x: 110, y: 650, title: '西藏 · 高处的天空', location: '西藏', date: '', object: 'bottle', color: '#8ad2ff', image: null,
    message: '高原的天很蓝，雪山很近。在那里每走几步都要喘口气，氧气瓶成了最可靠的旅伴。慢慢走，也很好。' },
  { id: 'sayram', x: 335, y: 425, title: '赛里木湖 · 我们的湖', location: '新疆 · 博尔塔拉', date: '2026-05-11', object: 'badge', color: '#6fa8e8', image: null,
    message: '2026 年 5 月 11 日，我们在赛里木湖登记结婚。湖是蓝色的，雪山在远处，从那天起我们是一家人了。' },
  { id: 'shenyang', x: 860, y: 1000, title: '沈阳 · 长春 · 澡堂', location: '辽宁 · 沈阳 / 吉林 · 长春', date: '', object: 'steam', color: '#e8e2d6', image: null,
    message: '北方的澡堂，热气腾腾。搓完澡窝在休息大厅，什么也不干——原来放松也是一种行程。' },
  { id: 'zhuhai', x: 470, y: 255, title: '珠海 · 长隆', location: '广东 · 珠海', date: '', object: 'whale', color: '#4f86d6', image: null,
    message: '海洋主题乐园，到处都是欢呼声和蓝色的大幕布。那天走了很多路，笑了很多次。' },
  { id: 'shanghai', x: 855, y: 300, title: '上海 · 迪士尼', location: '上海', date: '', object: 'castle', color: '#c86bb1', image: null,
    message: '城堡、烟花、还有挤满童话的街道。不属于任何人的童话，那天晚上是我们的。' },
  { id: 'kl', x: 1040, y: 290, title: '吉隆坡 · 行李与双塔', location: '马来西亚 · 吉隆坡', date: '', object: 'suitcase', color: '#a8763e', image: null,
    message: '行李延误了，双塔很亮。等行李的那两天，我们用购物袋逛完了半座城。' },
  { id: 'dongying', x: 640, y: 1030, title: '东营 · 自驾日落', location: '山东 · 东营', date: '', object: 'sunset', color: '#f0a83c', image: null,
    message: '自驾的路上遇到一场很大的日落。我们把车停下来，谁都没说话，看完了整场。' },
  { id: 'zibo', x: 500, y: 405, title: '淄博 · 烧烤', location: '山东 · 淄博', date: '', object: 'skewer', color: '#c96a5a', image: null,
    message: '小饼卷小葱，烤串滋滋响。淄博的夜晚属于炭火和笑声，我们吃到了很晚。' },
  { id: 'wuhan', x: 1230, y: 690, title: '武汉 · 第二故乡', location: '湖北 · 武汉', date: '', object: 'shrimp', color: '#e0563f', image: null,
    message: '你来过这里很多次，考试、办事、路过，武汉成了你的第二故乡。肥肥虾庄的蒸虾，是你的固定节目。' },
  { id: 'chongqing', x: 920, y: 845, title: '重庆 · 山城', location: '重庆', date: '', object: 'stairs', color: '#c9a06a', image: null,
    message: '这座城没有平路。坡道、台阶、从楼顶穿过的马路——我们爬上爬下，把山城走成了迷宫。' },
  { id: 'chengdu', x: 110, y: 405, title: '成都 · 熊猫', location: '四川 · 成都', date: '', object: 'panda', color: '#3a3f4a', image: null,
    message: '滚滚们躺着吃、坐着吃、倒挂着吃。你拍了一路，我说它们过得比我们舒服。' },
  { id: 'leshan', x: 120, y: 180, title: '乐山 · 大佛与甜皮鸭', location: '四川 · 乐山', date: '', object: 'buddha', color: '#c9a06a', image: null,
    message: '在大佛脚下仰头看了很久，下山后用一只甜皮鸭犒劳了酸痛的腿。佛很稳，鸭很甜。' },
  { id: 'suzhou', x: 660, y: 900, title: '苏州 · 园林与照顾', location: '江苏 · 苏州', date: '', object: 'pavilion', color: '#58b368', image: null,
    message: '那次旅行你发烧了，行程慢下来，我们在园林里坐了一下午。旅行不总是完美的，但我们会互相照顾。' },
  { id: 'yangzhou', x: 980, y: 380, title: '扬州 · 一支牙刷', location: '江苏 · 扬州', date: '', object: 'toothbrush', color: '#a8c686', image: null,
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

  A.shenyang = function (g, w, h) { // 澡场热气
    sky(g, '#4a3a30', '#7a6252', w, h); ground(g, h * .72, '#c9b8a0', w, h);
    px(g, w * .12, h * .3, w * .76, h * .44, '#8a6a52'); // 池
    g.fillStyle = '#a8d8e8'; g.fillRect(w * .16, h * .5, w * .68, h * .22);
    for (var i = 0; i < 7; i++) { // 热气
      g.fillStyle = 'rgba(255,255,255,.5)';
      g.beginPath(); g.arc(w * .2 + i * 36, h * .34 + Math.sin(i) * 8, 13 + (i % 3) * 5, 0, 7); g.fill();
    }
  };
  A.zhuhai = function (g, w, h) { // 海洋乐园 + 鲸鱼
    sky(g, '#1e3a6b', '#4f86d6', w, h); ground(g, h * .74, '#3a5a8a', w, h);
    g.fillStyle = '#2f5a9b'; g.beginPath(); // 大鲸鱼雕塑
    g.moveTo(w * .18, h * .66); g.quadraticCurveTo(w * .5, h * .34, w * .8, h * .62);
    g.quadraticCurveTo(w * .5, h * .58, w * .18, h * .66); g.fill();
    g.fillStyle = '#8ad2ff'; g.fillRect(w * .47, h * .38, 4, 10); // 喷水
    for (var i = 0; i < 4; i++) { px(g, 30 + i * 78, h * .74 - 8, 26, 8, '#c0392b'); px(g, 34 + i * 78, h * .74 - 16, 18, 8, i % 2 ? '#f0a83c' : '#f4ead8'); }
  };
  A.shanghai = function (g, w, h) { // 城堡 + 烟花
    sky(g, '#141c3e', '#3a2a5e', w, h); ground(g, h * .78, '#2a2448', w, h); star(g, w, h, 20);
    px(g, w * .42, h * .4, w * .16, h * .4, '#c9b8e8'); // 城堡
    px(g, w * .34, h * .52, w * .06, h * .28, '#c9b8e8'); px(g, w * .6, h * .52, w * .06, h * .28, '#c9b8e8');
    px(g, w * .44, h * .3, 6, 14, '#e0563f'); px(g, w * .55, h * .3, 6, 14, '#4f86d6');
    var cc = ['#f0a83c', '#c86bb1', '#8ad2ff', '#f4ead8'];
    for (var i = 0; i < 4; i++) {
      g.strokeStyle = cc[i]; g.lineWidth = 2.5;
      g.beginPath(); g.arc(w * (.2 + i * .2), h * (.2 + (i % 2) * .12), 16, 0, 7); g.stroke();
    }
  };
  A.kl = function (g, w, h) { // 双子塔 + 行李箱
    sky(g, '#0e1c3c', '#25406b', w, h); ground(g, h * .76, '#202c44', w, h); star(g, w, h, 18);
    px(g, w * .3, h * .18, w * .1, h * .6, '#3a4a68'); px(g, w * .56, h * .18, w * .1, h * .6, '#3a4a68');
    for (var i = 0; i < 14; i++) { px(g, w * .3 + 4, h * .2 + i * 18, 30, 3, 'rgba(140,190,240,.5)'); px(g, w * .56 + 4, h * .2 + i * 18, 30, 3, 'rgba(140,190,240,.5)'); }
    g.strokeStyle = '#8a92a8'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * .41, h * .4); g.quadraticCurveTo(w * .48, h * .32, w * .55, h * .4); g.stroke();
    // 行李箱
    px(g, w * .76, h * .68, 40, 30, '#8a5a3a'); px(g, w * .76 + 16, h * .68 - 6, 8, 6, '#5b3d29');
    g.strokeStyle = '#f0c040'; g.strokeRect(w * .76, h * .68, 40, 30);
  };
  A.dongying = function (g, w, h) { // 公路日落
    sky(g, '#f7a04a', '#fbd9a0', w, h); ground(g, h * .6, '#8a7a5a', w, h);
    g.fillStyle = '#f6f0d8'; g.beginPath(); g.arc(w * .5, h * .58, 30, 0, 7); g.fill();
    px(g, w * .48, h * .6, 12, h * .4, '#4a4452'); // 公路
    for (var i = 0; i < 4; i++) px(g, w * .492, h * .64 + i * 24, 5, 12, '#f4ead8');
    px(g, w * .08, h * .52, 44, 26, '#b0483a'); px(g, w * .84, h * .52, 44, 26, '#b0483a'); // 停着的车
  };
  A.zibo = function (g, w, h) { // 烧烤摊
    sky(g, '#1c2438', '#3c3448', w, h); ground(g, h * .72, '#4a4038', w, h);
    px(g, w * .16, h * .5, w * .68, 10, '#6b4a2f'); // 烤架
    for (var i = 0; i < 5; i++) {
      g.strokeStyle = '#c9b8a0'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(w * .24 + i * 34, h * .44); g.lineTo(w * .28 + i * 34, h * .52); g.stroke();
      px(g, w * .245 + i * 34, h * .455, 10, 8, i % 2 ? '#c96a5a' : '#a86a3a');
    }
    for (var j = 0; j < 4; j++) { g.fillStyle = 'rgba(255,180,90,.5)'; g.beginPath(); g.arc(w * .26 + j * 40, h * .56, 5, 0, 7); g.fill(); } // 炭火
    px(g, w * .1, h * .3, w * .8, 8, '#c0392b'); px(g, w * .1, h * .26, w * .8, 4, '#f4ead8'); // 摊棚
  };
  A.wuhan = function (g, w, h) { // 长江大桥 + 书 + 蒸虾
    sky(g, '#e8905a', '#f7d8a8', w, h); ground(g, h * .7, '#5a7a9b', w, h);
    px(g, 0, h * .48, w, 8, '#8a6a4a'); // 桥面
    for (var i = 0; i < 6; i++) px(g, i * 60 + 20, h * .52, 6, 30, '#8a6a4a');
    g.fillStyle = '#f4ead8'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.fillText('武汉', w * .5, h * .34);
    // 一笼蒸虾
    px(g, w * .3, h * .78, 60, 22, '#b8845a');
    for (var j = 0; j < 4; j++) { g.fillStyle = '#e0563f'; g.beginPath(); g.arc(w * .33 + j * 14, h * .76, 6, Math.PI, 0); g.fill(); }
    px(g, w * .62, h * .72, 34, 26, '#58b368'); // 书
    px(g, w * .62 + 4, h * .74, 26, 22, '#f4ead8');
  };
  A.chongqing = function (g, w, h) { // 山城立体道路夜景
    sky(g, '#141c34', '#2c3a5e', w, h); ground(g, h * .8, '#20283e', w, h); star(g, w, h, 14);
    for (var lv = 0; lv < 3; lv++) {
      var ly = h * (.42 + lv * .16);
      px(g, w * (.05 + lv * .08), ly, w * .8, 8, '#4a4452');
      for (var wd = 0; wd < 5; wd++) px(g, w * (.12 + lv * .06) + wd * 44, ly - 22, 18, 20, '#2a3352');
      for (var li = 0; li < 5; li++) px(g, w * (.13 + lv * .06) + li * 44, ly - 16, 6, 6, 'rgba(255,214,130,.9)');
    }
  };
  A.chengdu = function (g, w, h) { // 熊猫
    sky(g, '#5a8a5a', '#a8c8a0', w, h); ground(g, h * .7, '#7aa868', w, h);
    g.fillStyle = '#f4f4f4'; g.beginPath(); g.ellipse(w * .5, h * .68, 52, 40, 0, 0, 7); g.fill();
    g.beginPath(); g.arc(w * .5, h * .42, 34, 0, 7); g.fill();
    g.fillStyle = '#2b2b30';
    g.beginPath(); g.ellipse(w * .38, h * .38, 8, 11, -.4, 0, 7); g.ellipse(w * .62, h * .38, 8, 11, .4, 0, 7); g.fill();
    g.beginPath(); g.arc(w * .44, h * .44, 3.4, 0, 7); g.arc(w * .56, h * .44, 3.4, 0, 7); g.fill();
    g.beginPath(); g.ellipse(w * .3, h * .6, 10, 18, .5, 0, 7); g.ellipse(w * .7, h * .6, 10, 18, -.5, 0, 7); g.fill();
    px(g, w * .56, h * .46, 10, 6, '#2b2b30'); // 啃的竹子
    px(g, w * .6, h * .34, 3, 22, '#58b368');
  };
  A.leshan = function (g, w, h) { // 大佛 + 甜皮鸭
    sky(g, '#7a9ab8', '#c8d8c8', w, h); ground(g, h * .72, '#6a8a5a', w, h);
    g.fillStyle = '#b09468'; // 坐佛轮廓
    g.beginPath(); g.arc(w * .3, h * .4, 24, 0, 7); g.fill();
    px(g, w * .3 - 30, h * .48, 60, 42, '#b09468');
    px(g, w * .3 - 44, h * .58, 22, 26, '#b09468'); px(g, w * .3 + 24, h * .58, 22, 26, '#b09468');
    // 甜皮鸭
    g.fillStyle = '#c9803a'; g.beginPath(); g.ellipse(w * .72, h * .8, 30, 18, 0, 0, 7); g.fill();
    g.fillStyle = '#a85a2a'; g.beginPath(); g.arc(w * .72 - 26, h * .74, 8, 0, 7); g.fill();
    g.fillStyle = '#f0c040'; g.fillRect(w * .72 - 8, h * .72, 20, 4);
  };
  A.suzhou = function (g, w, h) { // 园林亭子曲桥
    sky(g, '#8aa8b8', '#c8d8d8', w, h); ground(g, h * .66, '#7a9a78', w, h);
    g.fillStyle = '#5a8a68'; g.beginPath(); g.ellipse(w * .3, h * .8, 70, 22, 0, 0, 7); g.fill(); // 池
    g.fillStyle = '#8a5a3a'; // 亭
    px(g, w * .56, h * .44, 56, 26, '#8a5a3a');
    g.beginPath(); g.moveTo(w * .5, h * .44); g.lineTo(w * .84, h * .44); g.lineTo(w * .67, h * .3); g.closePath(); g.fill();
    px(g, w * .58, h * .7, 6, 26, '#8a5a3a'); px(g, w * .8, h * .7, 6, 26, '#8a5a3a');
    g.strokeStyle = '#a8846a'; g.lineWidth = 5; // 曲桥
    g.beginPath(); g.moveTo(w * .1, h * .72); g.quadraticCurveTo(w * .25, h * .66, w * .34, h * .72); g.stroke();
  };
  A.yangzhou = function (g, w, h) { // 一支牙刷（幽默温暖）
    sky(g, '#2c3a5e', '#5a7a9b', w, h); ground(g, h * .74, '#4a5a78', w, h);
    px(g, w * .3, h * .3, w * .4, h * .44, '#e8e2d6'); // 漱口杯
    g.strokeStyle = '#b8a888'; g.strokeRect(w * .3, h * .3, w * .4, h * .44);
    px(g, w * .34, h * .22, 10, 44, '#7ac0c8'); px(g, w * .34, h * .18, 10, 8, '#f4ead8'); // 牙刷柄+毛
    px(g, w * .52, h * .18, 10, 48, '#f0a83c'); px(g, w * .52, h * .14, 10, 8, '#f4ead8');
    g.fillStyle = '#f4ead8'; g.font = '11px sans-serif'; g.textAlign = 'center';
    g.fillText('留得最久的纪念', w * .5, h * .88);
  };
  return A;
})();
