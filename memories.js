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
  A.wuhai = function (g, w, h) { // 沙丘 + 湖 + 越野车 + 蜥蜴
    sky(g, '#f7c873', '#fbe6bd', w, h); ground(g, h * .62, '#e8c68a', w, h);
    px(g, 0, h * .62, w, 6, '#c9a15f');
    g.fillStyle = '#5f9fd8'; g.beginPath(); g.ellipse(w * .68, h * .78, w * .3, h * .16, 0, 0, 7); g.fill();
    g.fillStyle = '#e0b877'; // 沙丘
    g.beginPath(); g.ellipse(w * .25, h * .62, w * .3, h * .22, 0, Math.PI, 0); g.fill();
    // 越野车
    px(g, w * .18, h * .52, 52, 20, '#b0483a'); px(g, w * .18 + 12, h * .52 - 14, 30, 15, '#b0483a');
    px(g, w * .18 + 15, h * .52 - 11, 18, 9, '#cfe4f5');
    g.fillStyle = '#2b2119'; g.beginPath(); g.arc(w * .18 + 10, h * .52 + 22, 8, 0, 7); g.arc(w * .18 + 42, h * .52 + 22, 8, 0, 7); g.fill();
    // 小蜥蜴
    g.strokeStyle = '#8a7a4a'; g.lineWidth = 3; g.beginPath();
    g.moveTo(w * .62, h * .93); g.quadraticCurveTo(w * .66, h * .89, w * .70, h * .93); g.stroke();
  };
  A.doha = function (g, w, h) { // 夜街 + 灯火 + 人影
    sky(g, '#0e1c3c', '#25406b', w, h); ground(g, h * .7, '#2a3a56', w, h); star(g, w, h, 26);
    for (var i = 0; i < 5; i++) { // 楼 + 橱窗
      px(g, i * 66 + 8, h * .38, 48, h * .34, '#16223d');
      for (var j = 0; j < 6; j++) px(g, i * 66 + 14 + (j % 3) * 14, h * .42 + Math.floor(j / 3) * 26, 8, 12, 'rgba(255,214,130,' + (0.5 + ((i + j) % 3) * .2) + ')');
    }
    g.fillStyle = 'rgba(20,26,44,.9)'; // 行人剪影
    g.fillRect(w * .3, h * .72, 10, 30); g.fillRect(w * .55, h * .73, 9, 26); g.fillRect(w * .78, h * .72, 10, 30);
  };
  A.tibet = function (g, w, h) { // 雪山 + 高原 + 氧气瓶
    sky(g, '#3f6ea8', '#a8c8e8', w, h); ground(g, h * .66, '#7a9a6a', w, h);
    g.fillStyle = '#e8eef5';
    g.beginPath(); g.moveTo(w * .1, h * .66); g.lineTo(w * .34, h * .3); g.lineTo(w * .58, h * .66); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(w * .45, h * .66); g.lineTo(w * .72, h * .36); g.lineTo(w * .95, h * .66); g.closePath(); g.fill();
    // 经幡
    var cc = ['#e0563f', '#f0d858', '#58b368', '#f4ead8', '#4f86d6'];
    for (var i = 0; i < 5; i++) px(g, w * .05 + i * 12, h * .7 + (i % 2) * 4, 9, 12, cc[i]);
    // 氧气瓶
    px(g, w * .78, h * .74, 16, 40, '#4f86d6'); px(g, w * .78 + 5, h * .74 - 8, 6, 9, '#2b5a9b');
    px(g, w * .78 + 2, h * .74 + 8, 12, 3, '#f4ead8');
  };
  A.sayram = function (g, w, h) { // 湖 + 雪山 + 湖蓝徽章（结婚纪念）
    sky(g, '#35608f', '#8fb6d8', w, h); ground(g, h * .58, '#5f9fd8', w, h);
    g.fillStyle = '#e8eef5';
    g.beginPath(); g.moveTo(0, h * .58); g.lineTo(w * .3, h * .26); g.lineTo(w * .6, h * .58); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.8)'; // 湖面波光
    for (var i = 0; i < 6; i++) px(g, w * .1 + i * 30, h * .66 + (i % 3) * 12, 22, 3, 'rgba(255,255,255,.6)');
    // 湖蓝纪念徽章
    g.fillStyle = '#2b5a9b'; g.beginPath(); g.arc(w * .72, h * .8, 26, 0, 7); g.fill();
    g.fillStyle = '#8fc3f0'; g.beginPath(); g.arc(w * .72, h * .8, 20, 0, 7); g.fill();
    g.fillStyle = '#f4ead8'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center';
    g.fillText('2026.5.11', w * .72, h * .82);
    g.strokeStyle = '#f0c040'; g.lineWidth = 3; g.beginPath(); g.arc(w * .72, h * .8, 26, 0, 7); g.stroke();
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
