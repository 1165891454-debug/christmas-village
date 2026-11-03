/* story.js — v5.1「极光之前」剧情与演出
 * ------------------------------------------------------------
 * 这个文件只管三件事：
 *   1) 剧情阶段（stage）、极夜等级（polar）、NPC 台词档位的**推导**（不存冗余状态）
 *   2) NPC 台词：按阶段逐渐多出来，前期只字不提禾，后期才慢慢对上号
 *   3) 两段 cinematic 的绘制：冰岛「极光」与小镇「天亮」
 *
 * 为什么单独一个文件：
 *   game.js 已经 9000 行，演出和台词塞进去会彻底失控。
 *   这里只做纯绘制与文本，不碰存档、不碰 Firebase（写操作全部在 game.js）。
 *
 * 性能：星野 / 山脊 / 冰湖这些静态层烘三张位图；每帧只画会动的极光与光点。
 */
window.Story = (function () {
  'use strict';

  /* ============================================================
   * 0. 剧情链（唯一可信来源）
   * ------------------------------------------------------------
   * 正式顺序（v5.1 校准后）：
   *
   *   第 1~8 章   小镇生活 / 旅行 / 记忆 / 升级圣诞树
   *   基础条件齐  去过 4 个地方 + 树到第 6 阶 + 14 段回忆
   *               —— 这只代表「有资格」，不发车票、不开始极夜
   *   第 9 章起   小镇光线异常，极夜开始（polar 1）
   *               → 北境入口出现（polar 2）
   *               → 双人星门 + 宝箱（polar 3，拿到地图 / 御寒衣 / 极光盒）
   *               → **宝箱开了，冰岛车票才正式解锁**
   *               → 去冰岛，用极光盒（polar 4）
   *               → 回镇天亮（polar 0）
   *               → 最终圣诞筹备
   *
   * 所有状态**全部从 world 里已有的字段推出来**（world.north / world.travel /
   * world.treeStage / world.quest.found / world.chapter / world.finalPrep），
   * 不新增章节计数器，也不写 localStorage —— 两个人、两台设备、刷新页面
   * 看到的都是同一套天色。
   * ============================================================ */
  var BASE_TRAVEL = 4;        // 原有冰岛基础条件：去过 4 个地方
  var BASE_TREE = 5;          // 树到第 6 阶（treeStage 从 0 起算）
  var BASE_MEM = 14;          // 至少 14 段旅行记忆
  var STORY_CHAPTER = 9;      // 剧情触发章节（第 9 章「把树种起来」之后）

  /* 只读 world，把推导要用的几个数一次算出来。
     注意：不用 S.quest / 本地变量，保证两台设备算出的结果一致。 */
  function ctxOf(w) {
    w = w || {};
    var n = w.north || {};
    var found = (w.quest && w.quest.found) ? w.quest.found : {};
    var travels = w.travel || {};
    return {
      chapter: (w.chapter || 0),
      tree: (typeof w.treeStage === 'number' ? w.treeStage : 0),
      visits: Object.keys(travels).length,
      mem: Object.keys(found).length,
      iceland: !!travels.iceland,
      north: n,
      finalPrep: w.finalPrep || 0,
      revived: n.revived || w.revived || 0
    };
  }

  /* 原有冰岛基础条件 —— 一个数都没改，只是把它和「发车票」拆开了 */
  function baseReady(w) {
    var c = ctxOf(w);
    return c.visits >= BASE_TRAVEL && c.tree >= BASE_TREE && c.mem >= BASE_MEM;
  }
  /* 极夜能不能开始：基础条件 + 剧情章节。两个都满足才算「该出事了」 */
  function storyReady(w) {
    var c = ctxOf(w);
    return baseReady(w) && c.chapter >= STORY_CHAPTER;
  }

  /* 主线阶段
   *   0  还没开始（门没出现）
   *   1  北境入口出现 / 正在探索
   *   2  双人星门已开（拿到星钥）
   *   3  宝箱已开（地图 / 御寒衣 / 极光盒）
   *   4  极光演出完成
   *   5  回到小镇，天亮了
   *   6  最终圣诞筹备
   */
  function stageOf(w) {
    var c = ctxOf(w);
    if (c.finalPrep) return 6;
    if (c.revived) return 5;
    if (c.north.auroraDone) return 4;
    if (c.north.opened) return 3;
    if (c.north.gateOpen) return 2;
    if (c.north.open) return 1;
    return 0;
  }

  /* 极夜等级 0~4：0 正常，4 彻底极夜。
     v5.1 校准：**开箱之前就开始**（1~2 级），北境探索期间一直保持，
     只有「冰岛极光演完 + 回到小镇」这一次事件才把它归零。
     所以它不是开关，而是由进度推出来的浓度 —— 刷新、开菜单、切地图都不会重置。 */
  function polarOf(w) {
    var c = ctxOf(w);
    if (c.revived) return 0;              // 天亮了
    if (!storyReady(w)) return 0;          // 资格不到，小镇一切正常
    if (c.north.auroraDone) return 4;      // 极光演完、还没回镇
    if (c.north.opened) return 3;          // 拿到盒子，天最黑
    if (c.north.open) return 2;            // 门出现了，北境探索期间
    return 1;                              // 光线开始不对
  }

  /* NPC 台词档位：-1 = 还没有剧情台词（第 1~8 章保持原来的日常对话） */
  function talkStageOf(w) {
    var s = stageOf(w);
    if (s >= 5) return 4;
    if (s >= 3) return 3;
    if (s === 2) return 2;
    if (s === 1) return 1;
    return polarOf(w) >= 1 ? 0 : -1;
  }

  /* ============================================================
   * 1. NPC 台词
   * ------------------------------------------------------------
   * 五个档位，每档每家说的话不一样：木匠讲木头，邮差讲信，面包师讲炉火……
   * 档位 0 之前（第 1~8 章）一句剧情台词都不给，保持原来的日常。
   * ============================================================ */
  var LINES = {
    /* -------- 档 0：极夜刚刚开始，北境入口还没出现 -------- */
    santa0: [
      '这几天天亮得越来越晚了。你注意到了吗？',
      '北边那片林子……晚上反倒是亮的。'
    ],
    carpenter0: [
      '木头的颜色不对了。晒不到太阳，木头比人先知道。',
      '炉子我也修不好。它没坏，是它不想烧。'
    ],
    postman0: [
      '有封信我压了十年，收件地址只写了「北边」。',
      '……先放着吧。也许哪天有人能替我送。'
    ],
    barista0: [
      '来杯热的？这几天客人都不肯走，说外面天色不对。',
      '说也奇怪，天越暗，店里越挤。'
    ],
    baker0: [
      '炉子最近总烧不旺。风从北边来的时候，火就低头。',
      '你说，风里是不是带着什么东西？'
    ],
    snowman0: ['……（雪人先生朝着北边，一动不动。）'],
    elf0: ['天怎么一天比一天短呀？我早上起来三次了。'],
    shepherd0: ['羊群不肯往北走。它们比人灵。'],

    /* -------- 档 1：北境入口出现，正在探索 -------- */
    santa1: [
      '那道光……门开了？别一个人进去。',
      '那地方比看上去冷。'
    ],
    carpenter1: [
      '北边的雪松我砍过一棵，年轮密得吓人 —— 那地方的冬天比这儿长。',
      '我年轻时见过一个人往那边走，背着一卷东西，再没回来。'
    ],
    postman1: [
      '雪地上多了一圈发蓝的符文，就在湖中间。',
      '我这辈子没见过那样的字，倒像是……地址。'
    ],
    barista1: [
      '往北边去的人，回来都说冷得说不出话。',
      '不过说也奇怪，这几年没人往那边去了。'
    ],
    baker1: [
      '炉火又低了一寸。你出门的时候，替我看看北边。'
    ],
    snowman1: ['……（雪人先生的帽子上，落了一层新的雪。）'],
    elf1: ['门后面是什么呀？我娘说那儿有光，但不让人看。'],
    shepherd1: ['羊群全挤到南边去了。它们知道要出事。'],

    /* -------- 档 2：星门开了（禾的名字第一次对上号） -------- */
    santa2: [
      '门开了？……那孩子当年也是这么进去的。',
      '他叫禾。种树的那个禾。'
    ],
    carpenter2: [
      '禾？认识。他跟我学过削榫头，手很稳。',
      '他说要去北边找一样东西，我问是什么，他说「等找到再告诉你」。'
    ],
    postman2: [
      '禾。这封信就是写给他的 ——「北边，禾收」。',
      '他走之前交给我的，说等他回来再给。'
    ],
    barista2: [
      '禾每天来，坐最里面那个位子，点最便宜的。',
      '有一回他问我：「如果一样东西不见了，是不是它自己走的？」'
    ],
    baker2: ['那孩子走的那天，炉火特别旺。像是替他送行。'],
    snowman2: ['……（雪人先生朝北边，低下了头。）'],
    elf2: ['禾哥哥会修风车。他答应回来帮我修的。'],
    shepherd2: ['他走之前来看过羊。摸了摸每一只的头。'],

    /* -------- 档 3：宝箱开了（地图 / 御寒衣 / 极光盒） -------- */
    santa3: [
      '地图？……他真的一直在往北走啊。',
      '孩子，光不是取回来的。是要有人去把它叫醒。'
    ],
    carpenter3: [
      '那件外套是我给他做的。领口那圈白毛，是我媳妇缝的。',
      '他留给你了？……那就穿着吧。别冻着。'
    ],
    postman3: [
      '地图上画的地方，比北境还北。',
      '那封信……我送不出去了。你替我拿着吧。'
    ],
    barista3: [
      '极光盒子？他跟我提过一次。他说那里面装的不是光，是「答应」。',
      '答应谁？他没说。'
    ],
    baker3: ['炉火我给你们留着。回来的时候，面包刚好。'],
    snowman3: ['……（雪人先生的影子，比昨天更长。）'],
    elf3: ['你们要去把光带回来吗？'],
    shepherd3: ['去吧。羊我替你们看着。'],

    /* -------- 档 4：天亮了 -------- */
    santa4: [
      '天亮了。真的亮了。',
      '孩子，你们做的这件事，比点亮一棵树重要得多。'
    ],
    carpenter4: ['我今早刨木头，刨花是金色的。好多年没见过了。'],
    postman4: ['信我送出去了。收件人写着「禾」，地址写着「北边」。', '回执我留着了 —— 上面画了一道光。'],
    barista4: ['今天第一杯，我请。'],
    baker4: ['炉火自己就旺了！你闻，是不是有点甜？'],
    snowman4: ['……（雪人先生在阳光里，慢慢变矮了一点。）'],
    elf4: ['亮了亮了！我要去告诉所有人！'],
    shepherd4: ['羊群往南走了。它们知道冬天要过去了。']
  };

  function npcLines(id, tier) {
    if (tier == null || tier < 0) return null;
    var s = Math.max(0, Math.min(4, Math.floor(tier || 0)));
    return LINES[id + s] || null;
  }

  /* ============================================================
   * 2. 冰岛：极光演出
   * ------------------------------------------------------------
   * 场景顺序（非常重要）：
   *   夜空位图 → 极光（会被山挡住的） → 山脊位图（不透明，压住极光下缘）
   *   → 山脊轮廓光 → 冰湖倒影 → 极光盒光柱 → 两个小人 → 暗角
   *
   * 为什么把山放在极光之后：
   *   这样「极光从山后面升起来」是画出来的，不是靠遮罩糊出来的。
   *   第一道极光的下缘被山脊咬住，才有"从远处山后出现"的感觉。
   *
   * 为什么不用逐列渐变画光带：
   *   那是"栅栏"的成因。这里用「一条完整飘带路径 + 沿路径的竖直渐变裁切 +
   *   带倾斜的细光帘」，褶皱靠厚度函数做，不靠加光带数量。
   * ============================================================ */
  var AURORA_SECONDS = 26;          // 演出总时长（game.js 用这个数起 rAF）
  var SCENE_SCALE = 1.18;           // 场景比屏幕大 18%，给镜头拉远留余量

  var CACHE = {};
  var CACHE_ORDER = [];
  function cachePut(key, val) {
    CACHE[key] = val;
    CACHE_ORDER.push(key);
    /* 一张夜空 + 一张山湖 + 一张暗角 + 两个小人 = 5；留到 8 给横竖屏切换留余量 */
    while (CACHE_ORDER.length > 8) {
      var k = CACHE_ORDER.shift();
      if (k !== key) delete CACHE[k];
    }
  }

  /* 柔光贴图：极光折痕、盒子光池都用它。
     以前每帧 new 十几个 RadialGradient，手机上掉帧；现在一种颜色只烘一次。 */
  var GLOW = {};
  function glowSprite(col) {
    var key = col.join(',');
    if (GLOW[key]) return GLOW[key];
    if (typeof document === 'undefined') return null;
    var size = 64;
    var cv = document.createElement('canvas');
    cv.width = cv.height = size * 2;
    var g = cv.getContext('2d');
    if (!g) return null;
    var grd = g.createRadialGradient(size, size, 0, size, size, size);
    grd.addColorStop(0, rgba(col, 1));
    grd.addColorStop(0.45, rgba(col, 0.38));
    grd.addColorStop(1, rgba(col, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, size * 2, size * 2);
    GLOW[key] = cv;
    return cv;
  }

  /* 确定性伪随机（同一尺寸每次烘出来一模一样） */
  function prng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function sstep(a, b, x) {
    if (b === a) return x >= b ? 1 : 0;
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
  }
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a < 0 ? 0 : a).toFixed(3) + ')'; }

  /* ---------- 山脊：折线山峰（低多边形，和像素画风一致） ---------- */
  /* 山脊：不等宽、不等距的峰 + 谷 + 肩峰。
     等距三角形一眼就是纸板，真正的山脉是"大峰带小峰、宽窄不一"。 */
  function makeRidge(seed, n, lo, hi, base) {
    var r = prng(seed);
    var pts = [{ t: 0, y: base - hi * 0.09 }];
    var t = 0.01;
    for (var i = 0; i < n; i++) {
      var w = 0.07 + r() * 0.17;
      /* 峰高：用两个随机数叠出来，让"高耸的主峰"和"低矮的山头"差异拉大，
         别都挤在 45%~100% 的中段，否则远看还是一排差不多高的三角形。 */
      var ph = hi * (0.22 + 0.78 * Math.pow(r(), 1.6));
      var pk = Math.min(0.97, t + w * 0.5);
      pts.push({ t: Math.min(0.97, t + w * 0.10), y: base - hi * (0.03 + r() * 0.09) });
      pts.push({ t: pk, y: base - ph });
      if (r() > 0.42) {
        pts.push({ t: Math.min(0.975, pk + w * 0.34), y: base - ph * (0.48 + 0.30 * r()) });
      }
      t = pk + w * 0.42 + r() * 0.04;
      if (t > 0.95) break;
    }
    pts.push({ t: 1, y: base - hi * 0.07 });
    for (var k = 0; k < pts.length; k++) {
      if (pts[k].y < base - hi) pts[k].y = base - hi;
      if (pts[k].y > base - lo * 0.6) pts[k].y = base - lo * 0.6;
    }
    return pts;
  }
  function ridgePath(g, pts, SW, SH, base, closeY) {
    g.beginPath();
    g.moveTo(0, closeY);
    for (var i = 0; i < pts.length; i++) g.lineTo(pts[i].t * SW, pts[i].y);
    g.lineTo(SW, closeY);
    g.closePath();
  }
  function ridgeLine(g, pts, SW) {
    g.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (i === 0) g.moveTo(p.t * SW, p.y); else g.lineTo(p.t * SW, p.y);
    }
  }

  /* ---------- 静态层：夜空 / 山与冰湖 / 暗角 ---------- */
  function bakeSize(SW, SH) {
    var dpr = (typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);
    dpr = Math.min(2, Math.max(1, dpr));
    /* 像素上限：一张背景超过约 320 万像素就降采样，手机上别把内存吃光 */
    var maxPx = 3.2e6;
    if (SW * SH * dpr * dpr > maxPx) dpr = Math.max(1, Math.sqrt(maxPx / (SW * SH)));
    return dpr;
  }

  function bakeScene(SW, SH, tag) {
    var key = tag + ':' + Math.round(SW) + 'x' + Math.round(SH);
    if (CACHE[key]) return CACHE[key];
    if (typeof document === 'undefined') return null;
    var dpr = bakeSize(SW, SH);
    var cv = document.createElement('canvas');
    if (!cv || !cv.getContext) return null;
    cv.width = Math.max(2, Math.round(SW * dpr));
    cv.height = Math.max(2, Math.round(SH * dpr));
    var g = cv.getContext('2d');
    if (!g) return null;
    g.scale(dpr, dpr);

    var HY = SH * 0.665;             // 地平线
    var rec = { cv: cv, dpr: dpr, SW: SW, SH: SH, HY: HY };

    /* ===== 夜空 ===== */
    var sky = g.createLinearGradient(0, 0, 0, HY + SH * 0.02);
    sky.addColorStop(0, '#01030a');
    sky.addColorStop(0.22, '#040a18');
    sky.addColorStop(0.46, '#071226');
    sky.addColorStop(0.70, '#0a1c33');
    sky.addColorStop(0.88, '#0e2a41');
    sky.addColorStop(1, '#13405a');
    g.fillStyle = sky;
    g.fillRect(0, 0, SW, HY + 4);

    /* 银河：一条很淡的斜带，不要抢极光的戏 */
    g.save();
    g.translate(SW * 0.5, SH * 0.30);
    g.rotate(-0.38);
    var mw = g.createLinearGradient(0, -SH * 0.10, 0, SH * 0.10);
    mw.addColorStop(0, 'rgba(150,180,235,0)');
    mw.addColorStop(0.45, 'rgba(150,180,235,.075)');
    mw.addColorStop(0.55, 'rgba(190,205,240,.085)');
    mw.addColorStop(1, 'rgba(150,180,235,0)');
    g.fillStyle = mw;
    g.fillRect(-SW, -SH * 0.10, SW * 2, SH * 0.20);
    g.restore();

    /* 星：越靠地平线越稀越暗；少数几颗带十字芒和冷暖色差 */
    var rnd = prng(20261103);
    var starN = Math.round(SW * 0.42);
    for (var i = 0; i < starN; i++) {
      var sx = rnd() * SW;
      var sy = Math.pow(rnd(), 0.72) * HY * 0.96;
      var fade = clamp01(1 - sy / (HY * 0.98));
      var sa = (0.10 + rnd() * 0.62) * (0.25 + 0.75 * fade);
      var sr = rnd() > 0.94 ? 1.55 : (rnd() > 0.62 ? 1.0 : 0.62);
      var warm = rnd();
      var col = warm > 0.88 ? '255,228,196' : (warm > 0.72 ? '196,222,255' : '228,240,255');
      g.fillStyle = 'rgba(' + col + ',' + sa.toFixed(3) + ')';
      g.beginPath(); g.arc(sx, sy, sr, 0, 7); g.fill();
      if (sr > 1.4 && fade > 0.4) {
        g.strokeStyle = 'rgba(' + col + ',' + (sa * 0.40).toFixed(3) + ')';
        g.lineWidth = 0.7;
        g.beginPath();
        g.moveTo(sx - 4, sy); g.lineTo(sx + 4, sy);
        g.moveTo(sx, sy - 4); g.lineTo(sx, sy + 4);
        g.stroke();
      }
    }

    cachePut(key, rec);
    return rec;
  }

  /* 湖岸线：必须是一条有起伏的曲线。
     第一版是"到 LAKE 为止的整块矩形"，屏幕上会出现一条横贯画面的直线，
     一眼就看出是贴图接缝，冰湖也就不像湖了。 */
  function lakeTopAt(x, SW, SH) {
    var u = x / SW;
    return SH * 0.796
      + Math.sin(u * 5.1 + 0.55) * SH * 0.011
      + Math.sin(u * 10.7 + 2.20) * SH * 0.0052
      + Math.sin(u * 21.3 + 4.10) * SH * 0.0022;
  }
  function lakeTopPath(g, SW, SH) {
    var N = 40;
    g.beginPath();
    for (var i = 0; i <= N; i++) {
      var x = (i / N) * SW;
      var y = lakeTopAt(x, SW, SH);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  }

  function bakeLand(SW, SH, HY) {
    var key = 'land:' + Math.round(SW) + 'x' + Math.round(SH);
    if (CACHE[key]) return CACHE[key];
    if (typeof document === 'undefined') return null;
    var dpr = bakeSize(SW, SH);
    var cv = document.createElement('canvas');
    if (!cv || !cv.getContext) return null;
    cv.width = Math.max(2, Math.round(SW * dpr));
    cv.height = Math.max(2, Math.round(SH * dpr));
    var g = cv.getContext('2d');
    if (!g) return null;
    g.scale(dpr, dpr);

    /* 峰数不多但高低错落，才有山脉的节奏；太多小尖会变成锯齿噪声 */
    var far = makeRidge(90125, 9, SH * 0.030, SH * 0.118, HY);
    var mid = makeRidge(4489, 6, SH * 0.010, SH * 0.050, HY + SH * 0.006);
    var rnd = prng(7741);

    /* --- 远山：深冷色，山脊上挂一层薄雪 --- */
    ridgePath(g, far, SW, SH, HY, HY + SH * 0.10);
    var fg = g.createLinearGradient(0, HY - SH * 0.13, 0, HY + SH * 0.05);
    fg.addColorStop(0, '#091625');
    fg.addColorStop(0.72, '#07111c');
    fg.addColorStop(1, '#0a1a28');
    g.fillStyle = fg;
    g.fill();

    g.save();
    ridgePath(g, far, SW, SH, HY, HY + SH * 0.10);
    g.clip();
    /* 雪帽：每座峰顶压一小片浅色，顺着坡面斜下去 —— 这是"雪山"的关键。
       注意只压峰顶往下 30%，压到山脚整座山就糊成一个雪包。 */
    for (var f = 1; f < far.length - 1; f++) {
      var pf = far[f];
      var pl = far[f - 1], pr2 = far[f + 1];
      if (!(pf.y < pl.y && pf.y < pr2.y)) continue;      // 只处理局部最高点
      var hgt = HY - pf.y;
      if (hgt < SH * 0.045) continue;
      var px = pf.t * SW;
      var lx = px + (pl.t * SW - px) * 0.30;
      var rx = px + (pr2.t * SW - px) * 0.30;
      var ly = pf.y + (pl.y - pf.y) * 0.30;
      var ry = pf.y + (pr2.y - pf.y) * 0.30;
      g.fillStyle = 'rgba(198,224,246,.13)';
      g.beginPath();
      g.moveTo(px, pf.y);
      g.lineTo(rx, ry);
      g.lineTo(px + (rx - px) * 0.55, ry - hgt * 0.10);
      g.lineTo(px + (lx - px) * 0.55, ly - hgt * 0.08);
      g.lineTo(lx, ly);
      g.closePath();
      g.fill();
    }
    /* 山脊细光：一条 1.5px 的雪线，不能粗，粗了整座山就变成雪包 */
    ridgeLine(g, far, SW);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(206,232,252,.20)';
    g.lineWidth = 1.6;
    g.stroke();
    /* 山脚的雾：把山和雪原分开，远山才有"远"的感觉 */
    var haze2 = g.createLinearGradient(0, HY - SH * 0.05, 0, HY + SH * 0.012);
    haze2.addColorStop(0, 'rgba(48,96,128,0)');
    haze2.addColorStop(0.62, 'rgba(52,104,136,.18)');
    haze2.addColorStop(1, 'rgba(58,116,146,.30)');
    g.fillStyle = haze2;
    g.fillRect(0, HY - SH * 0.05, SW, SH * 0.062);
    g.restore();

    /* --- 中山：更近的一层剪影，把纵深再推一格 --- */
    ridgePath(g, mid, SW, SH, HY, HY + SH * 0.08);
    var mg = g.createLinearGradient(0, HY - SH * 0.06, 0, HY + SH * 0.02);
    mg.addColorStop(0, '#09141f');
    mg.addColorStop(1, '#0c1c2b');
    g.fillStyle = mg;
    g.fill();
    g.save();
    ridgePath(g, mid, SW, SH, HY, HY + SH * 0.08);
    g.clip();
    ridgeLine(g, mid, SW);
    g.strokeStyle = 'rgba(150,200,228,.16)';
    g.lineWidth = 1.3;
    g.stroke();
    g.restore();

    /* --- 雪原：地平线往下到湖岸。夜里雪比水亮一档，别画反了 --- */
    /* 底部不用 fillRect 直到底边 —— 那样会留下一条横贯画面的水平边界。
       改成用湖岸线路径裁切，雪原的下缘就是那条有起伏的岸线，接缝自然消失。 */
    var snowTop = lakeTopAt(0, SW, SH);
    g.save();
    g.beginPath();
    g.moveTo(0, HY);
    g.lineTo(SW, HY);
    g.lineTo(SW, SH * 0.84);
    for (var sx = 40; sx >= 0; sx--) {
      g.lineTo((sx / 40) * SW, lakeTopAt((sx / 40) * SW, SW, SH) + SH * 0.004);
    }
    g.closePath();
    g.clip();
    var snow = g.createLinearGradient(0, HY, 0, snowTop + SH * 0.02);
    snow.addColorStop(0, '#23455a');
    snow.addColorStop(0.42, '#2a5067');
    snow.addColorStop(1, '#2f5b74');
    g.fillStyle = snow;
    g.fillRect(0, HY, SW, snowTop + SH * 0.02 - HY);
    /* 雪原上的起伏：非常淡的横向雪脊，让平地有远近 */
    for (var s = 0; s < 9; s++) {
      var sy = HY + (s + 0.5) / 9 * (snowTop - HY);
      g.fillStyle = s % 2 ? 'rgba(226,242,255,.055)' : 'rgba(8,18,28,.085)';
      g.beginPath();
      g.ellipse(SW * (0.1 + rnd() * 0.8), sy, SW * (0.16 + rnd() * 0.2), SH * 0.008, 0, 0, 7);
      g.fill();
    }
    g.restore();

    /* --- 冰湖：比雪地暗，才有"冰是水冻的"那层意思 --- */
    var lake = g.createLinearGradient(0, snowTop, 0, SH);
    lake.addColorStop(0, '#1b3d54');
    lake.addColorStop(0.22, '#173650');
    lake.addColorStop(0.62, '#132d43');
    lake.addColorStop(1, '#0f2637');
    g.beginPath();
    lakeTopPath(g, SW, SH);
    g.lineTo(SW, SH);
    g.lineTo(0, SH);
    g.closePath();
    g.fillStyle = lake;
    g.fill();

    /* 远岸：一条压亮的雪岸 + 碎冰，把湖和雪地真正分开 */
    g.save();
    lakeTopPath(g, SW, SH);
    g.strokeStyle = 'rgba(226,246,255,.34)';
    g.lineWidth = 2.0;
    g.stroke();
    g.strokeStyle = 'rgba(120,180,210,.30)';
    g.lineWidth = 6;
    g.stroke();
    g.restore();
    for (var b = 0; b < 30; b++) {
      var bx = rnd() * SW;
      var by = lakeTopAt(bx, SW, SH) + (rnd() - 0.5) * SH * 0.008;
      g.fillStyle = 'rgba(232,248,255,' + (0.10 + rnd() * 0.22).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(bx, by, 3 + rnd() * 13, 1.2 + rnd() * 2.2, 0, 0, 7);
      g.fill();
    }

    /* 冰面：大块的薄冰与裂纹 */
    for (var c2 = 0; c2 < 18; c2++) {
      var cx = rnd() * SW;
      var cy = lakeTopAt(cx, SW, SH) + SH * 0.02 + rnd() * SH * 0.15;
      var cw = SW * (0.02 + rnd() * 0.07);
      g.fillStyle = 'rgba(206,232,255,' + (0.030 + rnd() * 0.050).toFixed(3) + ')';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + cw * 0.55, cy - cw * 0.05);
      g.lineTo(cx + cw, cy + cw * 0.04);
      g.lineTo(cx + cw * 0.4, cy + cw * 0.09);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(226,246,255,.16)';
    g.lineWidth = 0.9;
    for (var k2 = 0; k2 < 15; k2++) {
      var kx = rnd() * SW, ky = lakeTopAt(kx, SW, SH) + SH * 0.02 + rnd() * SH * 0.14;
      g.beginPath();
      g.moveTo(kx, ky);
      g.lineTo(kx + 12 + rnd() * 30, ky + (rnd() - 0.5) * 6);
      g.lineTo(kx + 30 + rnd() * 40, ky + (rnd() - 0.5) * 10);
      g.stroke();
    }

    /* 画面最底一条更暗的冰缘，把人物托住 */
    var foot = g.createLinearGradient(0, SH * 0.92, 0, SH);
    foot.addColorStop(0, 'rgba(6,14,24,0)');
    foot.addColorStop(1, 'rgba(4,10,18,.50)');
    g.fillStyle = foot;
    g.fillRect(0, SH * 0.92, SW, SH * 0.08);

    var rec = { cv: cv, dpr: dpr, far: far, mid: mid, LAKE: snowTop };
    cachePut(key, rec);
    return rec;
  }

  function bakeVignette(SW, SH) {
    var key = 'vig:' + Math.round(SW) + 'x' + Math.round(SH);
    if (CACHE[key]) return CACHE[key];
    if (typeof document === 'undefined') return null;
    var dpr = bakeSize(SW, SH);
    var cv = document.createElement('canvas');
    cv.width = Math.max(2, Math.round(SW * dpr));
    cv.height = Math.max(2, Math.round(SH * dpr));
    var g = cv.getContext('2d');
    if (!g) return null;
    g.scale(dpr, dpr);
    var vg = g.createRadialGradient(SW / 2, SH * 0.60, Math.min(SW, SH) * 0.30,
      SW / 2, SH * 0.60, Math.max(SW, SH) * 0.80);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.62, 'rgba(2,6,14,.20)');
    vg.addColorStop(1, 'rgba(2,5,12,.72)');
    g.fillStyle = vg;
    g.fillRect(0, 0, SW, SH);
    var rec = { cv: cv, dpr: dpr };
    cachePut(key, rec);
    return rec;
  }

  /* ---------- 两个小人：烘一张图 + 一张轮廓光遮罩 ---------- */
  function bakeFigure(which, pxH) {
    var key = 'fig:' + which + ':' + Math.round(pxH);
    if (CACHE[key]) return CACHE[key];
    if (typeof document === 'undefined' || !window.Chars || !window.Chars.frameCanvas) return null;
    var src;
    try { src = window.Chars.frameCanvas(which === 'a' ? 'm' : 'f', 1, 0, 0, 'winter'); } catch (e) { return null; }
    if (!src) return null;

    var aspect = src.width / src.height;
    var dpr = Math.min(2, (window.devicePixelRatio || 1));
    var w = pxH * aspect;
    function mk(fill) {
      var cv = document.createElement('canvas');
      cv.width = Math.max(2, Math.round(w * dpr));
      cv.height = Math.max(2, Math.round(pxH * dpr));
      var g = cv.getContext('2d');
      if (!g) return null;
      g.imageSmoothingEnabled = true;
      g.drawImage(src, 0, 0, cv.width, cv.height);
      if (fill) {
        g.globalCompositeOperation = 'source-in';
        var grd = g.createLinearGradient(0, 0, 0, cv.height);
        grd.addColorStop(0, 'rgba(186,255,232,1)');
        grd.addColorStop(0.55, 'rgba(120,232,236,.95)');
        grd.addColorStop(1, 'rgba(70,170,210,.75)');
        g.fillStyle = grd;
        g.fillRect(0, 0, cv.width, cv.height);
      }
      return cv;
    }
    var rec = { body: mk(false), rim: mk(true), w: w, h: pxH, aspect: aspect };
    cachePut(key, rec);
    return rec;
  }

  /* ---------- 极光飘带 ---------- */
  var RIBBONS = [
    { y: 0.238, amp: 0.030, th: 0.082, sp: 1.00, ph: 0.0, col: [86, 255, 156], a: 0.34, at: 0.30 },
    { y: 0.296, amp: 0.038, th: 0.108, sp: 0.74, ph: 1.7, col: [58, 226, 178], a: 0.26, at: 0.36 },
    { y: 0.186, amp: 0.024, th: 0.062, sp: 1.26, ph: 3.2, col: [96, 176, 255], a: 0.22, at: 0.42 },
    { y: 0.348, amp: 0.028, th: 0.070, sp: 0.60, ph: 5.1, col: [162, 116, 255], a: 0.17, at: 0.47 },
    { y: 0.264, amp: 0.021, th: 0.042, sp: 1.52, ph: 2.4, col: [255, 132, 196], a: 0.09, at: 0.55 }
  ];

  function ribbonBaseY(r, SH, HY, grow) {
    var rest = r.y * SH;
    var start = HY - SH * 0.012;
    return start + (rest - start) * grow;
  }
  function ribbonY(r, x, SW, SH, HY, t, grow) {
    var u = x / SW;
    var base = ribbonBaseY(r, SH, HY, grow);
    var wave = (Math.sin(u * 5.1 + r.ph + t * 0.105 * r.sp) * 0.50
      + Math.sin(u * 9.7 - t * 0.072 * r.sp + r.ph * 1.7) * 0.30
      + Math.sin(u * 17.3 + t * 0.128 * r.sp + r.ph * 0.6) * 0.21
      + Math.sin(u * 28.9 - t * 0.165 * r.sp + r.ph * 2.3) * 0.11);
    return base + wave * r.amp * SH * (0.35 + 0.65 * grow);
  }
  function ribbonTh(r, x, SW, SH, t, grow) {
    var u = x / SW;
    /* 厚度变化要大：极光有的地方薄得像一层纱，有的地方卷起来厚成一条带。
       这里是"褶皱"的真正来源 —— 只靠加光带数量是做不出这种疏密的。 */
    var f = 0.52 + 0.48 * Math.sin(u * 7.3 + r.ph * 2.1 - t * 0.165 * r.sp)
      + 0.20 * Math.sin(u * 13.1 + t * 0.225 * r.sp + r.ph)
      + 0.12 * Math.sin(u * 21.7 - t * 0.16 * r.sp);
    f = 0.18 + 0.82 * clamp01(f);
    return r.th * SH * f * (0.42 + 0.58 * grow);
  }
  function ribbonPath(g, r, SW, SH, HY, t, grow, shrinkTop) {
    var N = 46, i, x, y;
    g.beginPath();
    for (i = 0; i <= N; i++) {
      x = (i / N) * SW;
      y = ribbonY(r, x, SW, SH, HY, t, grow);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    for (i = N; i >= 0; i--) {
      x = (i / N) * SW;
      y = ribbonY(r, x, SW, SH, HY, t, grow) - ribbonTh(r, x, SW, SH, t, grow) * (shrinkTop || 1);
      g.lineTo(x, y);
    }
    g.closePath();
  }

  function drawRibbon(g, r, SW, SH, HY, t, grow, alpha) {
    if (alpha <= 0.004 || grow <= 0.01) return;
    var col = r.col;
    var A = alpha;
    var ph = r.ph;

    /* 1) 飘带主体：沿路径裁切的竖直渐变。
       上半部几乎全透明 —— 极光的"实体"只是下缘那一条，
       上面那一大片是光帘，不是一层有边界的色块（这是第一版"像小山"的原因）。 */
    g.save();
    ribbonPath(g, r, SW, SH, HY, t, grow, 1);
    g.clip();
    var y0 = ribbonBaseY(r, SH, HY, grow) + r.th * SH * 0.06;
    var y1 = y0 - r.th * SH * 1.55;
    var lg = g.createLinearGradient(0, y0, 0, y1);
    lg.addColorStop(0, rgba(col, A * 0.85));
    lg.addColorStop(0.12, rgba(col, A * 0.34));
    lg.addColorStop(0.38, rgba(col, A * 0.10));
    lg.addColorStop(0.72, rgba(col, A * 0.025));
    lg.addColorStop(1, rgba(col, 0));
    g.fillStyle = lg;
    g.fillRect(0, y1, SW, (y0 - y1) * 1.3);
    g.restore();

    /* 2) 光帘：**不裁切**，从下缘往上飘出飘带之外，
       长度差别很大 —— 这是"极光"和"栅栏"的分界线。
       每根都带一点倾斜，像被同一阵风推着。 */
    var N = Math.max(40, Math.min(160, Math.round(SW / 8)));
    for (var i = 0; i < N; i++) {
      var u = (i + 0.5) / N;
      var jit = Math.sin(i * 12.9898 + ph * 78.233) * 43758.5453;
      u += ((jit - Math.floor(jit)) - 0.5) * (1.6 / N);
      var x = u * SW;
      var yb = ribbonY(r, x, SW, SH, HY, t, grow);
      var th = ribbonTh(r, x, SW, SH, t, grow);
      var lf = 0.5 + 0.5 * Math.sin(i * 0.37 + t * 0.85 * r.sp + ph);
      var len = th * (0.35 + 1.35 * lf * lf);            // 平方：大部分短，少数特别长
      var lean = Math.sin(u * 6.4 + t * 0.22 * r.sp + ph) * th * 0.34;
      var a1 = A * (0.10 + 0.26 * Math.abs(Math.sin(i * 0.21 + t * 1.05 + ph)));
      if (a1 < 0.008) continue;
      g.fillStyle = rgba(col, a1);
      g.beginPath();
      g.moveTo(x - 1.0, yb + 1);
      g.lineTo(x + 1.0, yb + 1);
      g.lineTo(x + lean + 1.35, yb - len);
      g.lineTo(x + lean - 1.35, yb - len);
      g.closePath();
      g.fill();
    }

    /* 3) 下缘亮芯：极光的"折边"就在这里，必须比主体亮一档。 */
    var N2 = 46;
    g.beginPath();
    for (var k = 0; k <= N2; k++) {
      var x2 = (k / N2) * SW;
      var y2 = ribbonY(r, x2, SW, SH, HY, t, grow);
      if (k === 0) g.moveTo(x2, y2); else g.lineTo(x2, y2);
    }
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = rgba(col, A * 0.22);
    g.lineWidth = Math.max(3.0, r.th * SH * 0.045);
    g.stroke();
    g.strokeStyle = rgba(col, A * 0.90);
    g.lineWidth = 1.15;
    g.stroke();

    /* 4) 折痕高光：褶皱收紧的地方更亮，像绸子折起来的那一道 */
    var gs = glowSprite(col);
    if (gs) {
      for (var q = 0; q < 3; q++) {
        var uq = 0.22 + q * 0.29 + Math.sin(t * 0.09 + ph + q) * 0.03;
        var xq = uq * SW;
        var yq = ribbonY(r, xq, SW, SH, HY, t, grow);
        var rq = Math.max(12, r.th * SH * 0.55);
        g.globalAlpha = Math.min(0.42, A * 0.9);
        g.drawImage(gs, xq - rq, yq - rq, rq * 2, rq * 2);
      }
      g.globalAlpha = 1;
    }
  }

  /* ---------- 冰湖倒影：把天上那几道同步压到湖面上 ---------- */
  function drawReflection(g, SW, SH, HY, t, k) {
    g.save();
    lakeTopPath(g, SW, SH);
    g.lineTo(SW, SH);
    g.lineTo(0, SH);
    g.closePath();
    g.clip();
    g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < RIBBONS.length; i++) {
      var r = RIBBONS[i];
      var grow = sstep(r.at, r.at + 0.25, k.p);
      if (grow <= 0.02) continue;
      var A = r.a * k.strength * grow;
      var base = lakeTopAt(SW * 0.5, SW, SH) + SH * 0.026 + i * SH * 0.004;
      g.beginPath();
      for (var n = 0; n <= 32; n++) {
        var x = (n / 32) * SW;
        var ys = ribbonY(r, x, SW, SH, HY, t, grow);
        var ry = base + (ys - HY * 0.26) * (0.50 + i * 0.03);
        ry += Math.sin(x / (SW * 0.052) + t * 0.85 + i) * SH * 0.0045;
        if (n === 0) g.moveTo(x, ry); else g.lineTo(x, ry);
      }
      g.strokeStyle = rgba(r.col, A * 0.40);
      g.lineWidth = SH * 0.011;
      g.lineJoin = 'round';
      g.stroke();
      g.strokeStyle = rgba(r.col, A * 0.30);
      g.lineWidth = SH * 0.0032;
      g.stroke();
    }
    /* 冰面的碎光：跟着时间闪，不是粒子系统 */
    for (var s = 0; s < 30; s++) {
      var sx = (s / 30) * SW + Math.sin(s * 7.3) * SW * 0.02;
      var sy = lakeTopAt(sx, SW, SH) + SH * 0.02 + Math.abs(Math.sin(s * 3.7)) * SH * 0.15;
      var tw = 0.5 + 0.5 * Math.sin(t * 1.6 + s * 2.1);
      g.fillStyle = 'rgba(198,246,255,' + (0.04 + 0.16 * tw * k.strength).toFixed(3) + ')';
      g.fillRect(sx, sy, 2 + tw * 3, 1);
    }
    g.restore();
  }

  /* ---------- 极光盒 ---------- */
  function drawBox(g, x, y, unit, open, t) {
    var u = unit;
    g.save();
    g.translate(x, y);
    /* 浮起来一点点 */
    var bob = Math.sin(t * 1.1) * u * 0.45;
    g.translate(0, -u * 0.6 + bob);

    /* 冰面上的光池 */
    g.save();
    g.globalCompositeOperation = 'lighter';
    var pool = glowSprite([130, 255, 232]);
    if (pool) {
      g.globalAlpha = 0.16 + open * 0.26;
      g.drawImage(pool, -u * 7, u * 1.4 - u * 7, u * 14, u * 14);
      g.globalAlpha = 1;
    }
    g.restore();

    /* 箱体（像素硬边，不用圆角） */
    g.fillStyle = '#4a3423';
    g.fillRect(-u * 4.2, -u * 2.4, u * 8.4, u * 4.4);
    g.fillStyle = '#5d4229';
    g.fillRect(-u * 3.6, -u * 2.0, u * 7.2, u * 3.4);
    g.fillStyle = '#8a6234';
    g.fillRect(-u * 4.2, -u * 0.4, u * 8.4, u * 0.7);
    /* 铜包角 */
    g.fillStyle = '#b98b4e';
    g.fillRect(-u * 4.2, -u * 2.4, u * 0.7, u * 4.4);
    g.fillRect(u * 3.5, -u * 2.4, u * 0.7, u * 4.4);
    /* 正面符文 */
    g.fillStyle = 'rgba(150,255,226,' + (0.35 + 0.35 * Math.sin(t * 2.4)).toFixed(3) + ')';
    g.fillRect(-u * 1.4, -u * 1.1, u * 0.8, u * 0.25);
    g.fillRect(-u * 0.3, -u * 1.1, u * 0.8, u * 0.25);
    g.fillRect(u * 0.8, -u * 1.1, u * 0.8, u * 0.25);

    /* 盖子：绕后侧铰链掀开 */
    var ang = open * 1.15;
    g.save();
    g.translate(0, -u * 2.4);
    g.rotate(-ang);
    g.fillStyle = '#6a4b2e';
    g.fillRect(-u * 4.6, -u * 1.2, u * 9.2, u * 1.4);
    g.fillStyle = '#8a6234';
    g.fillRect(-u * 4.6, -u * 1.2, u * 9.2, u * 0.35);
    /* 盖子内侧被内部光照亮 */
    if (open > 0.05) {
      g.fillStyle = 'rgba(190,255,238,' + (0.55 * open).toFixed(3) + ')';
      g.fillRect(-u * 4.2, -u * 0.95, u * 8.4, u * 1.0);
    }
    g.restore();

    /* 箱口内部的光 */
    if (open > 0.02) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      var ig = g.createRadialGradient(0, -u * 2.2, 0, 0, -u * 2.2, u * 5.2 * open);
      ig.addColorStop(0, 'rgba(235,255,250,' + (0.85 * open).toFixed(3) + ')');
      ig.addColorStop(0.35, 'rgba(140,255,236,' + (0.42 * open).toFixed(3) + ')');
      ig.addColorStop(1, 'rgba(90,210,255,0)');
      g.fillStyle = ig;
      g.fillRect(-u * 6, -u * 8, u * 12, u * 12);
      g.restore();
    }
    g.restore();
  }

  /* ---------- 主绘制 ----------
     p: 0~1 演出进度（线性，game.js 直接给 t/dur）
     时间轴：
       0.00~0.18 前奏：只有盒子亮着，世界还是暗的
       0.16~0.32 盒盖打开、光柱升起、冰面开始反光
       0.30~0.56 第一道极光从山后升起，慢慢铺开
       0.44~0.72 蓝、紫加入，光带互相穿插
       0.62~0.86 高潮：满天空、山脊轮廓光、人物轮廓光
       0.86~1.00 定格：镜头拉远，留够截图时间
  */
  function drawAurora(ctx, w, h, t, p, zoom) {
    p = clamp01(p == null ? 0 : p);
    var SW = Math.max(320, w) * SCENE_SCALE;
    var SH = Math.max(320, h) * SCENE_SCALE;
    var bg = bakeScene(SW, SH, 'bg');
    var land = bakeLand(SW, SH, SH * 0.665);
    var vig = bakeVignette(SW, SH);
    var HY = SH * 0.665;

    /* ---- 镜头：从近到远，最后停住 ---- */
    var z = 1.14 - 0.26 * sstep(0.06, 0.88, p);
    if (typeof zoom === 'number' && zoom > 0) z *= zoom;

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#01030a';
    ctx.fillRect(0, 0, w, h);

    ctx.translate(w / 2, h * 0.665);
    ctx.scale(z, z);
    ctx.translate(-SW / 2, -SH * 0.665);

    /* ---- 阶段强度 ---- */
    var skyA = 0.10 + 0.90 * sstep(0.02, 0.46, p);
    var landA = 0.20 + 0.80 * sstep(0.03, 0.50, p);
    var open = sstep(0.155, 0.30, p);                        // 盒盖
    var beam = sstep(0.16, 0.30, p) * (1 - sstep(0.62, 0.80, p) * 0.85);
    var strength = sstep(0.30, 0.74, p);                     // 极光总强度
    var kk = { p: p, strength: strength };

    /* ---- 夜空 ---- */
    if (bg) {
      ctx.globalAlpha = skyA;
      ctx.drawImage(bg.cv, 0, 0, SW, SH);
      ctx.globalAlpha = 1;
    }

    /* ---- 极光（画在山之前，才会被山咬住下缘） ---- */
    if (strength > 0.004) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      /* 天顶的冷光：整片天空被点亮，不是某一处 */
      var glow = ctx.createLinearGradient(0, HY - SH * 0.50, 0, HY + SH * 0.02);
      glow.addColorStop(0, 'rgba(70,210,190,' + (0.02 * strength).toFixed(3) + ')');
      glow.addColorStop(0.45, 'rgba(96,240,206,' + (0.055 * strength).toFixed(3) + ')');
      glow.addColorStop(0.78, 'rgba(110,255,220,' + (0.09 * strength).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(110,255,220,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, HY - SH * 0.50, SW, SH * 0.54);

      for (var i = 0; i < RIBBONS.length; i++) {
        var r = RIBBONS[i];
        var grow = sstep(r.at, r.at + 0.26, p);
        if (grow <= 0.01) continue;
        /* 整体呼吸感：不是三条一起闪，而是各自慢一档 */
        var breathe = 0.82 + 0.18 * Math.sin(t * 0.42 + r.ph * 1.35);
        drawRibbon(ctx, r, SW, SH, HY, t, grow, r.a * strength * breathe, false);
      }
      ctx.restore();
    }

    /* ---- 山与冰湖（不透明，压住极光下缘） ---- */
    if (land) {
      ctx.globalAlpha = landA;
      ctx.drawImage(land.cv, 0, 0, SW, SH);
      ctx.globalAlpha = 1;
      /* 山脊轮廓光：极光越强，山脊那条线越亮 */
      if (strength > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ridgeLine(ctx, land.far, SW);
        ctx.strokeStyle = 'rgba(120,240,208,' + (0.10 * strength).toFixed(3) + ')';
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(190,255,236,' + (0.14 * strength).toFixed(3) + ')';
        ctx.lineWidth = 1.0;
        ctx.stroke();
        ridgeLine(ctx, land.mid, SW);
        ctx.strokeStyle = 'rgba(160,255,224,' + (0.10 * strength).toFixed(3) + ')';
        ctx.lineWidth = 0.9;
        ctx.stroke();
        /* 雪原被极光洗过的一层薄绿 */
        var washY = lakeTopAt(SW * 0.5, SW, SH);
        var wash = ctx.createLinearGradient(0, HY, 0, washY);
        wash.addColorStop(0, 'rgba(90,235,196,' + (0.11 * strength).toFixed(3) + ')');
        wash.addColorStop(1, 'rgba(90,235,196,0)');
        ctx.fillStyle = wash;
        ctx.fillRect(0, HY, SW, washY - HY);
        ctx.restore();
      }
    }

    /* ---- 冰湖倒影 ---- */
    if (strength > 0.03) drawReflection(ctx, SW, SH, HY, t, kk);

    /* ---- 前置暗压：前奏阶段画面整体是暗的 ---- */
    var darkA = 0.55 * (1 - sstep(0.06, 0.52, p));
    if (darkA > 0.005) {
      ctx.fillStyle = 'rgba(3,7,16,' + darkA.toFixed(3) + ')';
      ctx.fillRect(0, 0, SW, SH);
    }

    /* ---- 极光盒 + 光柱 ---- */
    var figY = SH * 0.862;
    var figH = Math.min(SH * 0.170, 214);
    var unit = Math.max(2.4, figH * 0.052);
    var boxX = SW * 0.5, boxY = figY + figH * 0.02;

    if (beam > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      /* 光柱：横向用渐变收边（一条硬边矩形在屏幕上就是"探照灯"），
         纵向用 22 片切片叠出"越往上越淡"的衰减，上端一直伸进极光带。 */
      var topY = HY - SH * 0.34;
      var bH = boxY - topY;
      var coreW = Math.max(2.2, unit * 0.52);
      var haloW = Math.max(9, unit * 3.0);
      var hg = ctx.createLinearGradient(boxX - haloW, 0, boxX + haloW, 0);
      hg.addColorStop(0, 'rgba(150,248,230,0)');
      hg.addColorStop(0.40, 'rgba(150,248,230,1)');
      hg.addColorStop(0.60, 'rgba(150,248,230,1)');
      hg.addColorStop(1, 'rgba(150,248,230,0)');
      var cg = ctx.createLinearGradient(boxX - coreW, 0, boxX + coreW, 0);
      cg.addColorStop(0, 'rgba(226,255,250,0)');
      cg.addColorStop(0.5, 'rgba(226,255,250,1)');
      cg.addColorStop(1, 'rgba(226,255,250,0)');
      var SL = 22, sh = bH / SL + 1;
      for (var si = 0; si < SL; si++) {
        var yy = topY + (bH * si) / SL;
        var vf = Math.pow((si + 1) / SL, 1.7);
        ctx.globalAlpha = 0.26 * beam * vf;
        ctx.fillStyle = hg;
        ctx.fillRect(boxX - haloW, yy, haloW * 2, sh);
        ctx.globalAlpha = 0.50 * beam * vf;
        ctx.fillStyle = cg;
        ctx.fillRect(boxX - coreW, yy, coreW * 2, sh);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    /* ---- 两个小人 ---- */
    var gap = SW * 0.052;
    drawFigure(ctx, 'a', boxX - gap, figY, figH, t, strength, open);
    drawFigure(ctx, 'b', boxX + gap, figY, figH, t, strength, open);

    /* ---- 盒子（画在人之后，才不会被人挡住） ---- */
    drawBox(ctx, boxX, boxY, unit, open, t);

    /* ---- 暗角 + 上下压边 ---- */
    if (vig) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(vig.cv, 0, 0, SW, SH);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawFigure(ctx, which, x, y, figH, t, strength, open) {
    var fig = bakeFigure(which, figH);
    var w = fig ? fig.w : figH * 0.567;
    var h = figH;
    var sway = Math.sin(t * 0.9 + (which === 'a' ? 0 : 1.7)) * figH * 0.004;

    /* 脚下投影 */
    ctx.save();
    ctx.fillStyle = 'rgba(4,10,18,.42)';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, w * 0.46, figH * 0.035, 0, 0, 7);
    ctx.fill();
    ctx.restore();

    if (!fig) return;
    var top = y - h * 0.984 + sway;
    /* 轮廓光：极光从上方打下来（更亮）+ 盒子从下方打上来（前奏时唯一的光） */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var rimA = 0.18 + 0.42 * strength;
    ctx.globalAlpha = rimA;
    ctx.drawImage(fig.rim, x - w / 2 - w * 0.03, top - h * 0.018, w, h);
    ctx.globalAlpha = rimA * 0.7;
    ctx.drawImage(fig.rim, x - w / 2 + w * 0.03, top - h * 0.010, w, h);
    ctx.restore();

    /* 盒子下方的暖冷光（前奏阶段为主） */
    if (open > 0.02) {
      var ug = glowSprite([150, 255, 238]);
      if (ug) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.16 * open;
        ctx.drawImage(ug, x - figH * 0.8, y - figH * 0.8, figH * 1.6, figH * 1.6);
        ctx.restore();
      }
    }

    ctx.drawImage(fig.body, x - w / 2, top, w, h);
  }

  /* ============================================================
   * 3. 小镇：天亮
   * ------------------------------------------------------------
   * p: 0~1；0 = 还是极夜，1 = 阳光完全回来
   * ============================================================ */
  function drawSunrise(ctx, w, h, t, p) {
    var k = Math.max(0, Math.min(1, p));
    ctx.save();
    ctx.clearRect(0, 0, w, h);

    /* 天空：从深蓝一路推到暖金 */
    var sky = ctx.createLinearGradient(0, 0, 0, h * 0.72);
    sky.addColorStop(0, lerpHex('#050a18', '#7fb7e8', k));
    sky.addColorStop(0.45, lerpHex('#0a1830', '#ffd9a0', k));
    sky.addColorStop(0.72, lerpHex('#102542', '#fff0cf', k));
    sky.addColorStop(1, lerpHex('#17324f', '#ffe6b8', k));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.74);

    /* 太阳：从地平线慢慢升起来 */
    var sunY = h * (0.74 - 0.16 * k);
    var sr = h * 0.075;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var sg = ctx.createRadialGradient(w * 0.5, sunY, 0, w * 0.5, sunY, sr * 5);
    sg.addColorStop(0, 'rgba(255,244,214,' + (0.9 * k).toFixed(3) + ')');
    sg.addColorStop(0.22, 'rgba(255,214,150,' + (0.5 * k).toFixed(3) + ')');
    sg.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    ctx.arc(w * 0.5, sunY, sr, 0, 7);
    ctx.fillStyle = 'rgba(255,250,236,' + k.toFixed(3) + ')';
    ctx.fill();
    ctx.restore();

    /* 雪地：从冷灰推到暖白 */
    var snow = ctx.createLinearGradient(0, h * 0.70, 0, h);
    snow.addColorStop(0, lerpHex('#101f30', '#e8f0fa', k));
    snow.addColorStop(1, lerpHex('#1a2c40', '#fffdf8', k));
    ctx.fillStyle = snow;
    ctx.fillRect(0, h * 0.70, w, h * 0.30);

    /* 地平线上的房子剪影：窗子的灯一点点亮起来 */
    var seed = 77;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    for (var i = 0; i < 7; i++) {
      var bw = w * (0.07 + rnd() * 0.05);
      var bh = h * (0.05 + rnd() * 0.05);
      var bx = w * (0.06 + i * 0.135) + rnd() * 10;
      var by = h * 0.74;
      ctx.fillStyle = lerpHex('#0b1522', '#6b5a48', k);
      ctx.fillRect(bx, by - bh, bw, bh);
      ctx.beginPath();
      ctx.moveTo(bx - 3, by - bh);
      ctx.lineTo(bx + bw / 2, by - bh - bh * 0.45);
      ctx.lineTo(bx + bw + 3, by - bh);
      ctx.closePath();
      ctx.fill();
      var wl = Math.max(0, Math.min(1, k * 1.4 - 0.25));
      if (wl > 0.02) {
        ctx.fillStyle = 'rgba(255,214,140,' + wl.toFixed(3) + ')';
        ctx.fillRect(bx + bw * 0.28, by - bh * 0.62, bw * 0.18, bh * 0.22);
        ctx.fillRect(bx + bw * 0.62, by - bh * 0.62, bw * 0.18, bh * 0.22);
      }
    }

    /* 一棵小树（镇上那棵）：灯一点点亮回来 */
    var tx = w * 0.82, ty = h * 0.755;
    ctx.fillStyle = lerpHex('#0d1b2a', '#1d4a35', k);
    for (var tier = 0; tier < 3; tier++) {
      var tw = w * (0.085 - tier * 0.018);
      var tyy = ty - tier * h * 0.035;
      ctx.beginPath();
      ctx.moveTo(tx, tyy - h * 0.07);
      ctx.lineTo(tx + tw, tyy);
      ctx.lineTo(tx - tw, tyy);
      ctx.closePath();
      ctx.fill();
    }
    if (k > 0.5) {
      var lk = (k - 0.5) / 0.5;
      for (var s2 = 0; s2 < 16; s2++) {
        var ax = tx + Math.sin(s2 * 2.3) * w * 0.06;
        var ay = ty - (s2 % 5) * h * 0.022 - h * 0.01;
        ctx.fillStyle = 'rgba(255,214,130,' + (lk * (0.5 + 0.5 * Math.sin(t * 2 + s2))).toFixed(3) + ')';
        ctx.fillRect(ax, ay, 2, 2);
      }
    }

    /* 雪地反射的暖光 */
    if (k > 0.15) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var rg = ctx.createRadialGradient(w * 0.5, h * 0.90, 0, w * 0.5, h * 0.90, w * 0.7);
      rg.addColorStop(0, 'rgba(255,226,170,' + (0.20 * k).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(255,210,150,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, h * 0.7, w, h * 0.3);
      ctx.restore();
    }
    ctx.restore();
  }

  /* 十六进制颜色插值 */
  function lerpHex(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    var ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
    var br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    var r = Math.round(ar + (br - ar) * t);
    var g = Math.round(ag + (bg - ag) * t);
    var bl = Math.round(ab + (bb - ab) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  return {
    /* 剧情 */
    ctxOf: ctxOf,
    baseReady: baseReady,
    storyReady: storyReady,
    stageOf: stageOf,
    polarOf: polarOf,
    talkStageOf: talkStageOf,
    npcLines: npcLines,
    lines: LINES,
    /* 演出 */
    AURORA_SECONDS: AURORA_SECONDS,
    drawAurora: drawAurora,
    drawSunrise: drawSunrise,
    /* 给测试/调试用：把烘出来的位图作废（改尺寸后重新烘） */
    clearCache: function () { CACHE = {}; CACHE_ORDER = []; }
  };
})();
