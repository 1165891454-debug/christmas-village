/* game.js — v2.0.0：Omo's Christmas Village 游戏核心
 * v2 变化（相对 v1.0.0）：
 *  1. 结局双重门控：真实日期（2026-12-25 起）+ 共享任务进度 + 圣诞树全亮，三者齐备才触发。
 *     树不再「点 3 下就结局」——每一阶段需要真实材料（木材/鲜花/手工礼物）。
 *  2. 真实时间种植（温室 6 块地）：种下后按真实时间生长，离线也会长；transaction 防双设备重复收获。
 *  3. 资源与制作：木材/鲜花/种子/手工礼物；工坊制作；咖啡馆每日热可可；温室每日补给。
 *  4. 双人共享进度：全部存 rooms/{code}/world（Firebase 规则需放行，见 README v2 步骤）。
 *     权限未放行时自动降级为本机保存并提示（换设备前记得开通）。
 *  5. 四个可进入的室内：小屋 / 咖啡馆 / 星星温室 / 礼物工坊。
 *  6. 回忆册（16 条，事实核对版）+ 每条一张原创像素插画（memories.js MemoryArt）。
 *  7. WebAudio 合成音乐与音效（可开关，无外部文件）。
 *  8. ?dev=1 测试模式：生长 5 秒、日期门放开。
 * 依赖：Sprites / World / Memories（memories.js）
 */
window.Game = (function () {
  'use strict';

  var S = {
    active: false, code: null, backend: null, opts: {},
    canvas: null, ctx: null, view: { w: 0, h: 0 }, dpr: 1,
    self: { x: 640, y: 720, dir: 0, moving: false, frame: 0, animT: 0, waveUntil: 0 },
    remote: { x: 860, y: 720, tx: 860, ty: 720, dir: 0, moving: false, waveUntil: 0, seen: false, inter: 0 },
    cam: { x: 0, y: 0 },
    keys: {}, joy: { active: false, id: null, bx: 0, by: 0, dx: 0, dy: 0 },
    lastSent: 0, lastSentDir: -1, flakes: [], data: null, otherSlot: null, mySlot: 'a',
    npcIdx: {}, paused: false, curInteract: null,
    parts: [], interId: null, outdoorPos: null,
    adminGuardUntil: 0, mapId: null, mapReturn: null, spots: {}, photoOpt: null,
    prevPresence: null, prevStage: -1, heartT: 0,
    q: { lvl: 2, acc: 0, n: 0 },
    quest: { step: 0, talked: {}, visited: {}, found: {} },
    world: null, localWorld: null, worldFallback: false, worldErrShown: false,
    online: null,   // null=未知；true/false 由 app.js 的 .info/connected 推过来（管理员提示用）
    ending: null, ended: false, photo: false, lastQuestText: '',
    endHintShown: false, plotIdx: 0,
    dev: (typeof location !== 'undefined') && /[?&#]dev=1/.test(location.search + location.hash)
  };

  var SPEED = 166;
  var NAME = { a: 'Charles', b: 'Julie' };
  var CHAROPT = {
    a: { gender: 'm', glasses: true, hairStyle: 'short' },
    b: { gender: 'f', glasses: false, hairStyle: 'long' }
  };

  /* ---------- 养成配置 ---------- */
  var GROW = {
    flower: { ms: 30 * 60 * 1000, yield: 3, label: '花种 🌱', need: '30 分钟' },
    tree: { ms: 6 * 60 * 60 * 1000, yield: 5, label: '树种 🌲', need: '6 小时' }
  };
  if (S.dev) { GROW.flower.ms = 6000; GROW.tree.ms = 10000; GROW.flower.need = '6 秒(dev)'; GROW.tree.need = '10 秒(dev)'; }

  /* ---------- 圣诞树：六个阶段（v4.5）----------
   * 以前只有 4 个值（0..3），而 1→3 画的是同一棵满高的树，
   * 所以「第一次升级就直接长到最大形态」。现在改成 0..5 六个真实阶段：
   *   0 小树苗 / 1 初生 / 2 开始装饰 / 3 节日树形 / 4 即将点亮 / 5 完全点亮
   * 每次装饰只推进一级（decorateTree 里 stage+1），没有跳级。
   *
   * 成本设计（不是把老的三级复制两遍）：
   *   总量 🪵30 / 🌸35 / 🎁6 / 🌾2 / 🥛1，摊到 5 次升级上，每一步都很小；
   *   4 阶引入干草（牧场）、5 阶引入牛奶（牧场）——后期要你「去镇上转转」，
   *   而不是「再去砍十根木头」。木材另有老木匠每天的边角料 +3 兜底，
   *   鲜花 30 分钟一茬，所以卡人的不是单一稀缺资源。 */
  var TREE_STAGES = ['小树苗', '初生', '开始装饰', '节日树形', '即将点亮', '完全点亮'];
  var TREE_STAGE_MAX = 5;
  var TREE_COST = [
    { wood: 2, flowers: 2 },                          // 0 → 1 初生
    { wood: 4, flowers: 5 },                          // 1 → 2 开始装饰（第一次挂彩球）
    { wood: 6, flowers: 8, materials: 1 },            // 2 → 3 节日树形（要一件手工礼物）
    { wood: 8, flowers: 9, materials: 2, hay: 2 },    // 3 → 4 即将点亮（干草扎花环）
    { wood: 10, flowers: 11, materials: 3, milk: 1 }  // 4 → 5 完全点亮（牛奶刷一遍白漆）
  ];
  /* 一阶升完给的一点甜头：树上多挂一件手工礼物 */
  var TREE_STAGE_GIFT = 1;
  function treeStageName(n) { return TREE_STAGES[Math.max(0, Math.min(TREE_STAGE_MAX, n | 0))] || TREE_STAGES[0]; }
  function treeNextName(n) { return TREE_STAGES[Math.max(0, Math.min(TREE_STAGE_MAX, (n | 0) + 1))]; }
  var RECIPES = [
    { id: 'bird', name: '木头小鸟', wood: 4, flowers: 0, out: { materials: 1 }, desc: '刻了一只圆滚滚的小鸟，翅膀还会扇。' },
    { id: 'musicbox', name: '八音盒', wood: 6, flowers: 4, out: { materials: 1 }, desc: '打开盖子，会响起你们都熟悉的那段旋律。' },
    { id: 'star', name: '星星挂饰', wood: 2, flowers: 6, out: { materials: 1 }, desc: '磨得亮亮的，挂在高高的枝头最合适。' },
    /* v4.3：工坊真正的工作量在这里——做纸、钉礼盒，然后寄出去。 */
    { id: 'paper', name: '一沓信纸', wood: 2, flowers: 0, out: { paper: 3 }, desc: '把木头刨薄、压平、裁齐，就是写信用的纸。' },
    { id: 'giftbox', name: '寄件礼盒', wood: 2, flowers: 2, need: { paper: 1 }, out: { giftbox: 1 }, desc: '钉一个木盒，铺上干花，系上麻绳——寄出去该有的样子。' }
  ];
  /* 寄一封信要等多久：真实 2 小时；?dev=1 下 20 秒，方便验收 */
  var PACK_MS = 2 * 60 * 60 * 1000;
  if (S.dev) PACK_MS = 20 * 1000;

  function dayStr() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ---------- 声音（WebAudio 合成，无外部文件）---------- */
  var Snd = (function () {
    var ac = null, on = true, bgmTimer = null, step = 0;
    try { on = localStorage.getItem('omo_sound') !== '0'; } catch (e) { }
    function ensure() {
      if (!ac) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; try { ac = new AC(); } catch (e) { return null; } }
      if (ac.state === 'suspended') { try { ac.resume(); } catch (e) { } }
      return ac;
    }
    function tone(freq, dur, type, vol, delay) {
      if (!on || !ensure()) return;
      var t0 = ac.currentTime + (delay || 0);
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol || 0.1, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
    // 温柔版铃铛旋律（自写小循环，无版权问题）
    var MEL = [
      659, 0, 659, 0, 659, 0, 659, 0, 659, 0, 784, 0, 587, 0, 523, 0,
      587, 0, 659, 0, 587, 0, 659, 0, 523, 0, 523, 0, 392, 0, 0, 0
    ];
    function beat() {
      var f = MEL[step % MEL.length];
      if (f) tone(f, 0.55, 'triangle', 0.035);
      if (step % 8 === 0) tone(1568, 0.09, 'sine', 0.02); // 铃铛点缀
      step++;
    }
    return {
      isOn: function () { return on; },
      toggle: function () {
        on = !on;
        try { localStorage.setItem('omo_sound', on ? '1' : '0'); } catch (e) { }
        if (on) { this.startBgm(); } else { this.stopBgm(); }
        return on;
      },
      startBgm: function () { if (!bgmTimer && on) { ensure(); bgmTimer = setInterval(beat, 400); } },
      stopBgm: function () { if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } },
      sfx: function (kind) {
        if (!on || !ensure()) return;
        if (kind === 'collect') { tone(880, 0.1, 'sine', 0.1); tone(1318, 0.16, 'sine', 0.08, 0.07); }
        else if (kind === 'plant') { tone(392, 0.12, 'triangle', 0.09); tone(494, 0.14, 'triangle', 0.08, 0.08); }
        else if (kind === 'harvest') { tone(659, 0.1, 'sine', 0.1); tone(988, 0.1, 'sine', 0.09, 0.06); tone(1318, 0.2, 'sine', 0.08, 0.12); }
        else if (kind === 'craft') { tone(233, 0.08, 'square', 0.05); tone(311, 0.08, 'square', 0.05, 0.09); tone(466, 0.12, 'square', 0.04, 0.18); }
        else if (kind === 'door') { tone(330, 0.12, 'triangle', 0.07); tone(262, 0.14, 'triangle', 0.06, 0.09); }
        else if (kind === 'cocoa') { tone(523, 0.14, 'sine', 0.08); tone(659, 0.18, 'sine', 0.07, 0.09); }
        else if (kind === 'ding') { tone(1047, 0.2, 'sine', 0.1); }
      }
    };
  })();

  /* ---------- 共享世界数据 ---------- */
  function defaultWorld() {
    return {
      res: { wood: 0, seeds: 2, flowers: 0, materials: 0 },
      garden: {},
      quest: { step: 0, talked: {}, visited: {}, found: {} },
      cocoa: { lastDay: '' },
      daily: { day: '' },
      crafted: {},
      /* v4.5：新存档直接就是六阶段刻度，不需要迁移 */
      treeStageVer: 2,
      treeStage: 0
    };
  }
  function curWorld() {
    if (S.worldFallback) return S.localWorld;
    return (S.data && S.data.world) || null;
  }
  /* ---------- 牧场（v4.2） ----------
   * 一天一趟：先喂，第二天来收。产物直接写进共享存档 world.res，
   * 两台手机看到的是同一桶奶、同一卷毛、同一个蛋，不需要额外同步。
   */
  var RANCH_GOODS = {
    milk: { icon: '🥛', name: '牛奶' },
    wool: { icon: '🧶', name: '羊毛' },
    egg: { icon: '🥚', name: '鸡蛋' }
  };
  function dayShift(n) {
    var d = new Date(Date.now() + n * 86400000);
    function p2(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  function ranchEntry(id) {
    var w = curWorld() || {};
    return (w.ranch && w.ranch[id]) || {};
  }
  function ranchLabel(a) {
    var today = dayStr();
    var st = ranchEntry(a.id);
    var gd = RANCH_GOODS[a.goods] || { icon: '🎁', name: '产物' };
    if (st.ready && st.ready <= today) return gd.icon + ' 收 ' + gd.name + '（' + a.name + '）';
    if (st.fed === today) return '🌙 ' + a.name + ' 今天吃饱了';
    return '🌾 喂 ' + a.name;
  }
  function animalAct(a) {
    if (!a) return;
    var today = dayStr();
    var st = ranchEntry(a.id);
    var gd = RANCH_GOODS[a.goods] || { icon: '🎁', name: '产物' };
    /* 昨天喂过 → 今天就能收。
       收成的事务里再判一次 ready：两台设备同时点「收」，只有先到的真的加产物，
       后到的那次读到 ready 已经被清掉，直接放弃（否则会重复收一份）。 */
    if (st.ready && st.ready <= today) {
      mutate(function (w) {
        w.ranch = w.ranch || {};
        var e = w.ranch[a.id] || {};
        if (!(e.ready && e.ready <= today)) return w;
        w.ranch[a.id] = {};
        w.ranch.ever = w.ranch.ever || {};
        w.ranch.ever[a.goods] = Date.now();
        w.res = w.res || {};
        w.res[a.goods] = (w.res[a.goods] || 0) + 1;
        return w;
      }).then(function () {
        if (ranchEntry(a.id).ready) return;      // 没抢到（对方刚收走），不报成功
        Snd.sfx('harvest');
        burst(a.x, a.y - 26, 'spark', 5);
        toast(gd.icon + ' 收到了 1 份' + gd.name + '！明天再来喂一次', 3200);
      });
      return;
    }
    if (st.fed === today) {
      toast('🌙 ' + a.name + ' 今天已经吃饱了，明天早上来收' + gd.name, 3000);
      return;
    }
    var hay = worldRes().hay || 0;
    if (hay < 1) {
      toast('🌾 没有干草了，先去旁边的干草垛拿一份', 3200);
      return;
    }
    mutate(function (w) {
      w.ranch = w.ranch || {};
      var e = w.ranch[a.id] || {};
      if (e.fed === today) return w;             // 对方刚喂过 → 这次不再扣干草
      w.res = w.res || {};
      if ((w.res.hay || 0) < 1) return w;
      w.res.hay = Math.max(0, (w.res.hay || 0) - 1);
      w.ranch[a.id] = { fed: today, ready: dayShift(1) };
      return w;
    }).then(function () {
      if (ranchEntry(a.id).fed !== today) return;
      Snd.sfx('plant');
      burst(a.x, a.y - 20, 'heart', 3);
      toast('🌾 ' + a.name + ' 吃得很香 · 明天来收' + gd.name, 3000);
    });
  }
  function takeHay() {
    var today = dayStr();
    var w = curWorld() || {};
    if (w.ranch && w.ranch.hayDay === today) {
      toast('🌾 今天的干草已经拿过了，明天再来', 2800);
      return;
    }
    mutate(function (w2) {
      w2.ranch = w2.ranch || {};
      if (w2.ranch.hayDay === today) return w2;  // 对方刚拿过 → 不再给第二份
      w2.ranch.hayDay = today;
      w2.ranch.gotHay = w2.ranch.gotHay || Date.now();
      w2.res = w2.res || {};
      w2.res.hay = (w2.res.hay || 0) + 3;
      return w2;
    }).then(function () {
      var w3 = curWorld() || {};
      if (!(w3.ranch && w3.ranch.hayDay === today)) return;
      Snd.sfx('ding');
      toast('🌾 抱了三捆干草（够喂三只）', 2800);
    });
  }

  /* ============================================================
   * v4.3 远方物产 / 地址 / 包裹 / 回信 / 村民委托
   * ------------------------------------------------------------
   * 设计意图（回应「章节只是在拖时间」）：
   *   这一段不是加锁，而是加「可以一直做下去的事」——
   *   41 个去过的地方，每个地方都能寄一个包裹、换回一件特产；
   *   地址要靠找回忆 / 找邮差 / 拿东西换才到手；
   *   特产不消耗，收进册子，村民的委托会点名要看某一件。
   * 存档字段（全部 NEW，老存档不受影响）：
   *   world.addr      = { 地名id: 时间戳 }     已知地址
   *   world.spec      = { 地名id: 时间戳 }     收到的特产
   *   world.parcels   = { 地名id: {at,readyAt} } 在途包裹
   *   world.mail      = [ {place, at} ]        回信记录
   *   world.sent      = 累计寄出件数
   *   world.addrDay   = 今天是否已经从邮差那儿领过地址
   *   world.commDone  = { '日期#序号': 时间戳 } 当天委托完成情况
   * ============================================================ */
  var RES_NAME = {
    wood: '🪵 木材', flowers: '🌸 鲜花', seeds: '🌱 种子', materials: '🎁 手工礼物',
    hay: '🌾 干草', milk: '🥛 牛奶', wool: '🧶 羊毛', egg: '🥚 鸡蛋',
    paper: '📄 信纸', giftbox: '📦 礼盒'
  };
  function T() { return window.Travels || null; }

  /* ---------------- 地址 ---------------- */
  function addrMap() { var w = curWorld() || {}; return w.addr || {}; }
  function hasAddr(id) { return !!addrMap()[id]; }
  function addrCount() { return Object.keys(addrMap()).length; }
  /* 找到一段回忆 → 那个地方就有地址了（回忆本身就是「去过」的证明） */
  function grantAddrFor(memId) {
    var t = T();
    if (!t || !t.has(memId) || hasAddr(memId)) return;
    mutate(function (w) {
      w.addr = w.addr || {};
      if (!w.addr[memId]) w.addr[memId] = Date.now();
      return w;
    }).then(function () {
      var pl = t.get(memId);
      if (pl) toast('✉️ 记下了一个地址：' + pl.name + '（可以去工坊寄东西了）', 4200);
    });
  }

  /* ---------------- 特产 ---------------- */
  function specMap() { var w = curWorld() || {}; return w.spec || {}; }
  function specCount() { return Object.keys(specMap()).length; }
  function hasSpec(id) { return !!specMap()[id]; }
  function specList() {
    var t = T(), out = [], m = specMap();
    if (!t) return out;
    t.list.forEach(function (p) { if (m[p.id]) out.push(p); });
    return out;
  }

  /* 「拆过的信」是一串流水（w.mail = []）。老存档或手改存档里万一是对象，
     push 会当场抛错 —— 在点击回调里抛错＝玩家看到的「点了没反应」。
     所以三处写入统一走这里，先把它收成数组。 */
  function mailArr(w) {
    if (!Array.isArray(w.mail)) w.mail = [];
    return w.mail;
  }

  /* ---------------- 包裹 ---------------- */
  function parcels() { var w = curWorld() || {}; return w.parcels || {}; }
  function parcelOf(id) { return parcels()[id] || null; }
  function parcelLeftMs(id) {
    var p = parcelOf(id);
    return p ? Math.max(0, p.readyAt - Date.now()) : 0;
  }
  function readyParcels() {
    var ps = parcels(), now = Date.now(), out = [];
    for (var id in ps) if (ps.hasOwnProperty(id) && ps[id] && ps[id].readyAt <= now) out.push(id);
    out.sort(function (a, b) { return (ps[a].readyAt || 0) - (ps[b].readyAt || 0); });
    return out;
  }
  function flyingParcels() {
    var ps = parcels(), now = Date.now(), out = [];
    for (var id in ps) if (ps.hasOwnProperty(id) && ps[id] && ps[id].readyAt > now) out.push(id);
    return out;
  }
  function sentCount() { var w = curWorld() || {}; return w.sent || 0; }
  function mailCount() { var w = curWorld() || {}; return (w.mail || []).length; }

  function sendParcel(placeId) {
    var t = T(), pl = t && t.get(placeId);
    if (!pl) return;
    var r = worldRes();
    if (!hasAddr(placeId)) { toast('✉️ 还没有「' + pl.name + '」的地址', 3000); return; }
    if (parcelOf(placeId)) { toast('📮 已经有一件寄往' + pl.name + '了，先等它回来', 3200); return; }
    if ((r.giftbox || 0) < 1) { toast('📦 差一个寄件礼盒——在工坊用 纸×1 + 木材×2 + 鲜花×2 做一个', 4600); return; }
    mutate(function (w) {
      w.res = w.res || {};
      if ((w.res.giftbox || 0) < 1) return w;
      /* 先判重、再扣礼盒。旧顺序是「先扣再判重」：两台设备同时点同一张卡时，
         后到的那次事务会先扣掉一个礼盒，然后发现已经有包裹就直接返回 ——
         礼盒白扣了。顺序换过来，重复点击不会多扣一分钱。 */
      w.parcels = w.parcels || {};
      if (w.parcels[placeId]) return undefined;
      w.res.giftbox -= 1;
      w.parcels[placeId] = { at: Date.now(), readyAt: Date.now() + PACK_MS };
      w.sent = (w.sent || 0) + 1;
      return w;
    }).then(function (ok) {
      if (!ok) {
        /* 事务被拒：要么对方先寄了同一件，要么礼盒刚好被用掉——都不是"没反应"，
           按真实原因说一句。 */
        if (parcelOf(placeId)) toast('📮 已经有一件寄往' + pl.name + '了，先等它回来', 3200);
        else toast('没寄出去：礼盒不够了，再做一个（纸×1 + 木材×2 + 鲜花×2）', 4200);
        refreshHUD();
        return;
      }
      Snd.sfx('craft');
      toast('📮 包裹寄往' + pl.name + '了 · 大概 ' + fmtRemain(PACK_MS) + '后回来', 4200);
      refreshHUD();
      if (S.interId === 'workshop') openPackPanel();
    });
  }

  /* 领回信：不消耗任何东西，特产是「一件」，重复领不到第二件 */
  function claimParcel(placeId) {
    var t = T(), pl = t && t.get(placeId);
    if (!pl) return;
    mutate(function (w) {
      w.parcels = w.parcels || {};
      var p = w.parcels[placeId];
      if (!p || p.readyAt > Date.now()) return w;
      delete w.parcels[placeId];
      w.spec = w.spec || {};
      w.spec[placeId] = w.spec[placeId] || Date.now();
      var ml0 = mailArr(w);
      ml0.push({ place: placeId, at: Date.now() });
      if (ml0.length > 240) w.mail = ml0.slice(-240);
      // 回信里总会夹一点心意：两朵干花
      w.res = w.res || {};
      w.res.flowers = (w.res.flowers || 0) + 2;
      // 每收满 5 种特产，邮局补贴一次
      var n = Object.keys(w.spec).length;
      if (n % 5 === 0) {
        w.res.seeds = (w.res.seeds || 0) + 3;
        w.res.paper = (w.res.paper || 0) + 2;
      }
      return w;
    }).then(function (ok) {
      if (!ok) return;
      Snd.sfx('harvest');
      burst(S.self.x, S.self.y - 46, 'spark', 6);
      toast('✉️ ' + pl.name + '的回信到了 · ' + pl.icon + ' ' + pl.item + ' 已收进物产册' +
        ((specCount() % 5 === 0) ? '（满 5 种，邮局补贴了种子和纸）' : ''), 5200);
      openMailPanel();
    });
  }

  /* ---------------- 邮差：领地址 / 换地址 ---------------- */
  function addrToday() { var w = curWorld() || {}; return w.addrDay === dayStr(); }
  function unknownPlaces() {
    var t = T(); if (!t) return [];
    return t.list.filter(function (p) { return !hasAddr(p.id); });
  }
  function takeAddrToday() {
    if (addrToday()) { toast('📬 今天的信已经给过你了，明天再来', 2800); return; }
    var pool = unknownPlaces();
    if (!pool.length) { toast('📬 所有地址都收齐了——' + ((T() && T().count) || 41) + ' 个地方，一个不剩', 3400); return; }
    var ds = parseInt(dayStr().replace(/-/g, ''), 10) || 0;
    var pl = pool[ds % pool.length];
    mutate(function (w) {
      w.addr = w.addr || {};
      if (w.addrDay === dayStr()) return w;      // 对方刚领过 → 不再多给一张信纸
      w.addr[pl.id] = w.addr[pl.id] || Date.now();
      w.addrDay = dayStr();
      w.res = w.res || {};
      w.res.paper = (w.res.paper || 0) + 1;
      return w;
    }).then(function (ok) {
      if (!ok) return;
      Snd.sfx('ding');
      var left = unknownPlaces().length;
      toast('📬 阿信递来一个地址：' + pl.name + '（还差 ' + left + ' 个地方）· 顺便给了一张信纸', 4600);
      openMailPanel();
    });
  }
  function tradeAddr() {
    var w = curWorld() || {};
    if (w.addrTradeDay === dayStr()) { toast('📮 今天已经换过一次地址了', 2600); return; }
    var r = worldRes();
    if ((r.paper || 0) < 3 || (r.materials || 0) < 1) {
      toast('📮 换地址要 3 张信纸 + 1 件手工礼物（你现在 📄' + (r.paper || 0) + ' 🎁' + (r.materials || 0) + '）', 4200);
      return;
    }
    var pool = unknownPlaces();
    if (!pool.length) { toast('📬 已经没有不知道的地方了', 2800); return; }
    var ds = parseInt(dayStr().replace(/-/g, ''), 10) || 0;
    var pl = pool[(ds + 13) % pool.length];
    mutate(function (w2) {
      w2.res = w2.res || {};
      if (w2.addrTradeDay === dayStr()) return w2;   // 对方刚换过 → 今天不再换第二次
      if ((w2.res.paper || 0) < 3 || (w2.res.materials || 0) < 1) return w2;
      w2.res.paper -= 3;
      w2.res.materials -= 1;
      w2.addr = w2.addr || {};
      w2.addr[pl.id] = w2.addr[pl.id] || Date.now();
      w2.addrTradeDay = dayStr();
      return w2;
    }).then(function (ok) {
      if (!ok) return;
      Snd.sfx('ding');
      toast('📮 阿信帮你问到了：' + pl.name + ' 的地址', 3600);
      openMailPanel();
    });
  }

  /* ---------------- v4.5 礼物的第二、第三条路 ----------------
   * 以前「礼物」几乎只有一条路：寄包裹 → 等两小时 → 收特产。
   * 现在补三条不靠重复劳动的渠道，但都不动邮差的地盘：
   *   ① 第一次到某个地方，当地小摊塞一件手工礼物（每个地方一次）
   *   ② 屋子里的旧物里夹一件手工礼物（每间屋子一次）
   *   ③ 邮差「加急代寄」：一张信纸，当天就把已有地址的特产带回来（每天一次）
   * 特产的「唯一完整来源」仍然是邮差（普通包裹 + 加急 + 地址），
   * 所以他的价值没被架空；但玩家不必为了收集反复寄、反复等。
   * ---------------- */
  function grantMapGift(id) {
    var w = curWorld() || {};
    if (w.mapGift && w.mapGift[id]) return;
    mutate(function (w2) {
      w2.mapGift = w2.mapGift || {};
      if (w2.mapGift[id]) return undefined;
      w2.mapGift[id] = Date.now();
      w2.res = w2.res || {};
      w2.res.materials = (w2.res.materials || 0) + 1;
      return w2;
    }).then(function (ok) {
      if (!ok) return;
      Snd.sfx('collect');
      toast('🎁 站台边的小摊主塞给你一件手工小礼物 +1（第一次来这里）', 3800);
      refreshHUD();
    }, function () { });
  }

  function expressDayDone() { var w = curWorld() || {}; return w.expressDay === dayStr(); }
  /* 能加急的：已经有地址、还没收到特产、也不在途 */
  function expressPool() {
    var t = T(); if (!t) return [];
    var w = curWorld() || {};
    var parcels = w.parcels || {};
    return t.list.filter(function (p) {
      return hasAddr(p.id) && !hasSpec(p.id) && !parcels[p.id];
    });
  }
  function expressClaim() {
    if (expressDayDone()) { toast('📮 今天已经托阿信加急跑过一趟了，明天再来', 2800); return; }
    var r = worldRes();
    if ((r.paper || 0) < 1) { toast('📮 加急要一张信纸（📄1）——工坊里两张木头就能做三张', 3200); return; }
    var pool = expressPool();
    if (!pool.length) { toast('📮 手上的地址都收到特产了：寄个普通包裹，或者找阿信领个新地址', 3600); return; }
    var ds = parseInt(dayStr().replace(/-/g, ''), 10) || 0;
    var pl = pool[ds % pool.length];
    mutate(function (w) {
      if (w.expressDay === dayStr()) return undefined;         // 对方刚用过
      w.res = w.res || {};
      if ((w.res.paper || 0) < 1) return undefined;
      w.res.paper -= 1;
      w.expressDay = dayStr();
      w.spec = w.spec || {};
      w.spec[pl.id] = w.spec[pl.id] || Date.now();
      var ml1 = mailArr(w);
      ml1.push({ place: pl.id, at: Date.now(), fast: 1 });
      if (ml1.length > 240) w.mail = ml1.slice(-240);
      w.res.flowers = (w.res.flowers || 0) + 1;                // 顺手带回一朵干花
      return w;
    }).then(function (ok) {
      if (!ok) { toast('没送出去，再试一次', 2400); return; }
      Snd.sfx('harvest');
      burst(S.self.x, S.self.y - 46, 'spark', 6);
      toast('📮 阿信骑车跑了一趟 ' + pl.name + '：' + pl.icon + ' ' + pl.item + ' 带回来了（今天加急用掉了）', 4600);
      openMailPanel();
    });
  }

  /* 老木匠的边角料：每天一次 +3 木材。走的是「找 NPC 说话」这条渠道，
     不额外花材料、不需要等，也不会把邮差的事抢走（他不管木头）。 */
  function grantCarpenterScraps(cb) {
    var w = curWorld() || {};
    if (w.carpenterDay === dayStr()) { if (cb) cb(false); return; }
    mutate(function (w2) {
      if (w2.carpenterDay === dayStr()) return undefined;
      w2.carpenterDay = dayStr();
      w2.res = w2.res || {};
      w2.res.wood = (w2.res.wood || 0) + 3;
      return w2;
    }).then(function (ok) {
      if (ok) { Snd.sfx('craft'); refreshHUD(); }
      if (cb) cb(!!ok);
    }, function () { if (cb) cb(false); });
  }

  /* ---------------- 村民委托（v4.3 替代原来的每日心愿） ----------------
   * 每天两条：一条要材料（会收走），一条要看某件特产（只是看看，不收走）。
   * 用日期做种子从池子里取，两台设备算出来完全一样，不需要同步「今天是谁」。
   */
  var COMM_POOL = [
    { npc: 'baker', want: { kind: 'res', key: 'milk', n: 1 }, give: { wood: 3, paper: 1 },
      ask: '牧场要是挤出牛奶，分我一杯？我给你换点木头。', say: '太好了！布丁烤上了，木头你拿去。' },
    { npc: 'baker', want: { kind: 'res', key: 'egg', n: 2 }, give: { materials: 1 },
      ask: '缺两颗鸡蛋——蛋糕差一点点就成型了。', say: '正好！这个手工礼物给你，我留着也没用。' },
    { npc: 'shepherd', want: { kind: 'res', key: 'hay', n: 2 }, give: { wool: 1, seeds: 2 },
      ask: '干草还有多的吗？今晚要下雪。', say: '替它们谢谢你。这卷毛你拿着。' },
    { npc: 'shepherd', want: { kind: 'res', key: 'flowers', n: 3 }, give: { milk: 1, egg: 1 },
      ask: '羊圈边上想摆几朵花，三朵就够。', say: '这样它们睡觉都能闻到香味。' },
    { npc: 'carpenter', want: { kind: 'res', key: 'wood', n: 4 }, give: { paper: 2, giftbox: 1 },
      ask: '再给我四根木头，我给你们钉个像样的礼盒。', say: '拿好，钉子是我自己敲直的。' },
    { npc: 'carpenter', want: { kind: 'res', key: 'wool', n: 1 }, give: { wood: 4 },
      ask: '羊毛有吗？锯子把手缠一圈就不磨手了。', say: '舒服多了。这些木头你拿去。' },
    { npc: 'postman', want: { kind: 'res', key: 'paper', n: 2 }, give: { seeds: 3, flowers: 2 },
      ask: '信纸还有富余吗？我这边快写完了。', say: '够我写到月底了，这些种子换给你。' },
    { npc: 'postman', want: { kind: 'res', key: 'giftbox', n: 1 }, give: { materials: 1, wood: 2 },
      ask: '有做好的礼盒吗？有个客人急着寄。', say: '帮大忙了。这个挂饰你收着。' },
    { npc: 'santa', want: { kind: 'res', key: 'flowers', n: 4 }, give: { materials: 1, seeds: 2 },
      ask: 'Ho Ho——帽子上想插几朵花，热闹一点。', say: '好看吗？我也觉得。这些给你。' },
    { npc: 'snowman', want: { kind: 'res', key: 'wood', n: 2 }, give: { hay: 2 },
      ask: '两根树枝当新手臂，我原来的快断了。', say: '举手试试——嗯，稳。' },
    { npc: 'elf', want: { kind: 'res', key: 'wool', n: 1 }, give: { flowers: 3 },
      ask: '货架的垫子破了，一卷羊毛就好。', say: '垫好啦，你看是不是顺眼多了。' },
    { npc: 'barista', want: { kind: 'res', key: 'flowers', n: 2 }, give: { seeds: 2, paper: 1 },
      ask: '柜台上想换一束花，两朵就够。', say: '客人说店里好看多了。' }
  ];
  /* 「拿给我看看」的委托：从今天有特产的人里挑一件，不消耗 */
  var SHOW_POOL = [
    { npc: 'postman', say: '这封信上的邮戳……你们真的去过啊。' },
    { npc: 'santa', say: 'Ho Ho，这么远的地方，你们都带回来了。' },
    { npc: 'barista', say: '摆在柜台上，今天的光都变软了。' },
    { npc: 'carpenter', say: '南北的东西就是不一样，做工很讲究。' },
    { npc: 'baker', say: '闻着就知道是好东西，我都不敢下锅。' },
    { npc: 'shepherd', say: '要是能带它们也去看看就好了。' }
  ];

  function commSeed() { return parseInt(dayStr().replace(/-/g, ''), 10) || 0; }
  function commsToday() {
    var ds = commSeed();
    var a = COMM_POOL[ds % COMM_POOL.length];
    var b = COMM_POOL[(ds + 5) % COMM_POOL.length];
    if (b === a) b = COMM_POOL[(ds + 1) % COMM_POOL.length];
    var out = [
      { idx: 0, npc: a.npc, want: a.want, give: a.give, ask: a.ask, say: a.say },
      { idx: 1, npc: b.npc, want: b.want, give: b.give, ask: b.ask, say: b.say }
    ];
    /* 第二条如果能换成「看特产」，就换——这样每天至少有一条和远方有关 */
    var sl = specList();
    if (sl.length) {
      var pl = sl[ds % sl.length];
      var sp = SHOW_POOL[ds % SHOW_POOL.length];
      out[1] = {
        idx: 1, npc: sp.npc,
        want: { kind: 'spec', key: pl.id, n: 1 },
        give: { seeds: 2, flowers: 2 },
        ask: '听说你手上有' + pl.name + '的' + pl.item + '，拿给我看看行吗？',
        say: sp.say + '（' + pl.icon + ' ' + pl.item + '）'
      };
    }
    return out;
  }
  /* ★ v4.5.1 修复（阿信的「今天托付的事」交不了）：
     这里原来是 dayStr() + '#' + idx，写成云端字段名就是 "2026-10-28#1"。
     Firebase Realtime Database 的 key **不允许包含 # . $ / [ ]**，
     于是 rooms/{code}/world/commDone 这一次事务直接被云端拒掉、抛异常，
     而在面板里的点击回调里抛异常＝玩家看到的「点了没反应」。
     改成只含字母数字下划线的 d<yyyymmdd>_<idx>。
     旧 key 只在本地 demo 存档里可能存在（云端从来写不进去），读取时一并认。 */
  function commKey(idx) { return 'd' + commSeed() + '_' + idx; }
  function commLegacyKey(idx) { return dayStr() + '#' + idx; }
  function commDone(idx) {
    var w = curWorld() || {};
    var d = w.commDone || {};
    return !!(d[commKey(idx)] || d[commLegacyKey(idx)]);
  }
  function commFor(npcId) {
    var list = commsToday();
    for (var i = 0; i < list.length; i++) if (list[i].npc === npcId && !commDone(list[i].idx)) return list[i];
    return null;
  }
  function commHave(c) {
    if (!c) return false;
    if (c.want.kind === 'spec') return hasSpec(c.want.key);
    return (worldRes()[c.want.key] || 0) >= c.want.n;
  }
  function commWantText(c) {
    if (!c) return '';
    if (c.want.kind === 'spec') {
      var t = T(), pl = t && t.get(c.want.key);
      return pl ? (pl.icon + ' ' + pl.item + '（' + pl.name + '）') : '特产';
    }
    return (RES_NAME[c.want.key] || c.want.key) + ' ×' + c.want.n;
  }
  function commGiveText(c) {
    if (!c) return '';
    var out = [];
    for (var k in c.give) if (c.give.hasOwnProperty(k)) out.push((RES_NAME[k] || k) + ' ×' + c.give[k]);
    return out.join(' · ');
  }
  /* NPC 说话时调用：能交就交，不能交就提一句。返回要接在对话后面的话。 */
  function talkComm(npcId) {
    var c = commFor(npcId);
    if (!c) return null;
    if (!commHave(c)) {
      return '（' + c.ask + ' 需要 ' + commWantText(c) + '，你还没凑够。）';
    }
    mutate(function (w) {
      w.commDone = w.commDone || {};
      /* 已经交过（含本地老 key / 另一台设备刚交）→ 放弃这次写入，一分奖励都不发 */
      if (w.commDone[commKey(c.idx)] || w.commDone[commLegacyKey(c.idx)]) return undefined;
      w.res = w.res || {};
      if (c.want.kind === 'res') {
        if ((w.res[c.want.key] || 0) < c.want.n) return undefined;
        w.res[c.want.key] -= c.want.n;
      } else if (!(w.spec && w.spec[c.want.key])) {
        return undefined;
      }
      for (var k in c.give) if (c.give.hasOwnProperty(k)) w.res[k] = (w.res[k] || 0) + c.give[k];
      w.commDone[commKey(c.idx)] = Date.now();
      return w;
    }).then(function (ok) {
      if (!ok) { refreshHUD(); return; }
      Snd.sfx('ding');
      toast('🤝 委托完成：' + commGiveText(c), 3600);
      refreshHUD();
    });
    return '（' + c.say + '）这里是 ' + commGiveText(c) + '，收下吧。';
  }

  function worldRes() {
    var w = curWorld();
    return (w && w.res) || { wood: 0, seeds: 0, flowers: 0, materials: 0 };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* mutate(fn)：fn(w) 原地修改并返回 w；返回 undefined 表示放弃。
   * Firebase 模式走 transaction（双设备防重复）；失败/无权限 → 本机降级。 */
  function mutate(fn) {
    if (!S.backend || !S.backend.worldTransact) return Promise.resolve(false);
    if (S.worldFallback) {
      var base = S.localWorld || defaultWorld();
      var next = fn(base);
      if (next === undefined) return Promise.resolve(false);
      S.localWorld = next; S.world = next;
      refreshHUD(); absorbQuest(next);
      return Promise.resolve(true);
    }
    return S.backend.worldTransact(function (cur) {
      var w = cur || defaultWorld();
      return fn(w);
    }).then(function (r) {
      if (r && r.committed) {
        S.world = r.value;
        refreshHUD(); absorbQuest(r.value);
      }
      return !!(r && r.committed);
    }).catch(function (err) {
      // 通常是 Firebase 规则尚未放行 rooms/{id}/world → 降级本机保存
      S.worldFallback = true;
      S.localWorld = clone(curWorld() || defaultWorld());
      var next = fn(S.localWorld);
      if (next !== undefined) { S.localWorld = next; S.world = next; }
      refreshHUD(); absorbQuest(S.localWorld);
      if (!S.worldErrShown) {
        S.worldErrShown = true;
        toast('⚠️ 共享进度暂存在本机：云端 world 节点还没放行（见 README「v2 规则更新」）。换设备游玩前请先完成那一步。', 6500);
      }
      return true;
    });
  }

  function refreshHUD() {
    var r = worldRes();
    var el = $('#res-chip');
    if (el) {
      el.textContent = '🪵 ' + (r.wood || 0) + ' · 🌸 ' + (r.flowers || 0) + ' · 🌱 ' + (r.seeds || 0) + ' · 🎁 ' + (r.materials || 0) +
        ((r.hay || r.milk || r.wool || r.egg) ? (' · 🌾 ' + (r.hay || 0)) : '');
    }
  }

  // 把共享 quest 合并进本地镜像（只吸收，不回写）
  function absorbQuest(w) {
    if (!w) return;
    /* 老存档迁移：以前是 6 步直线任务，现在改成 8 章。
       按旧步数折算，玩到一半的进度不会作废。 */
    if (w.chapter === undefined || w.chapter === null) {
      var oldStep = (w.quest && w.quest.step) || 0;
      w.chapter = oldStep >= 6 ? 7 : (oldStep >= 5 ? 5 : (oldStep >= 4 ? 3 : (oldStep >= 2 ? 1 : 0)));
    }
    if (!w.quest) return;
    var q = w.quest;
    ['talked', 'visited', 'found'].forEach(function (k) {
      var rem = q[k] || {};
      S.quest[k] = S.quest[k] || {};
      for (var key in rem) if (rem[key] && !S.quest[k][key]) S.quest[k][key] = rem[key];
    });
    if ((q.step || 0) > S.quest.step) S.quest.step = q.step;
    /* 旅行打卡点（共享）：改完立刻能算「已经拍过」 */
    if (w.spots) {
      S.spots = S.spots || {};
      for (var sk in w.spots) if (w.spots[sk] && !S.spots[sk]) S.spots[sk] = w.spots[sk];
    }
  }
  // 本地 quest 推到共享（并集 + step 取最大）
  function syncQuest() {
    mutate(function (w) {
      w.quest = w.quest || { step: 0, talked: {}, visited: {}, found: {} };
      ['talked', 'visited', 'found'].forEach(function (k) {
        w.quest[k] = w.quest[k] || {};
        var loc = S.quest[k] || {};
        for (var key in loc) if (loc[key]) w.quest[k][key] = w.quest[k][key] || loc[key];
      });
      w.quest.step = Math.max(w.quest.step || 0, S.quest.step);
      return w;
    });
  }

  /* 树阶段统一从存档读，一律夹到 0..5。
     旧存档（4 阶刻度 0/1/2/3）由 migrateWorld() 折算成新刻度：
     老 1「已装饰」= 新 2（第一次挂彩球），老 2「挂上彩灯」= 新 4（灯已亮），
     老 3「全树点亮」= 新 5。这样升级上来的玩家不会看到树突然缩小。 */
  var TREE_LEGACY_MAP = [0, 2, 4, 5];
  function treeStage() {
    var w = curWorld();
    var n = (w && typeof w.treeStage === 'number') ? w.treeStage
      : ((S.data && S.data.tree && typeof S.data.tree.stage === 'number') ? S.data.tree.stage : 0);
    if (!isFinite(n) || n < 0) n = 0;
    return Math.min(TREE_STAGE_MAX, Math.floor(n));
  }
  /* 老存档一次性折算（只做一次，写 treeStageVer=2 之后永不再动） */
  function migrateWorld(w) {
    if (!w) return false;
    if (w.treeStageVer === 2) return false;
    var old = (typeof w.treeStage === 'number') ? w.treeStage : 0;
    w.treeStage = TREE_LEGACY_MAP[Math.max(0, Math.min(3, Math.floor(old)))] || 0;
    w.treeStageVer = 2;
    return true;
  }

  // ---------- 结局日期门 ----------
  function endingUnlocked() {
    if (S.dev) return true;
    if (S.adminEnding) return true;   // 只在应急入口按下时置位，平时一直是 false
    var d = new Date();
    if (d.getFullYear() > 2026) return true;
    return d.getFullYear() === 2026 && d.getMonth() === 11 && d.getDate() >= 25;
  }
  function daysToChristmas() {
    return Math.ceil((new Date(2026, 11, 25) - new Date()) / 86400000);
  }

  // ---------- 主线任务（v2：共享 + 材料版）----------
  /* ---------- 主线章节（v4.2）----------
   * 节奏设计：8 章（第 8 章就是圣诞夜），每天最多推进一章。
   * 所以「一切准备就绪」最少也要 7 天，正好铺到圣诞前，不会两天就玩完。
   * 每章的要求都只用已有进度字段（回忆/对话/树/车票/牧场），不另开存档结构。
   */
  function foundCount() { return Object.keys(S.quest.found).length; }
  /* 聊过几个人（八个人都算：老人四个 + 新邻居四个） */
  function talkCount() {
    var n = 0, t = S.quest.talked || {};
    for (var k in t) if (t.hasOwnProperty(k) && t[k]) n++;
    return n;
  }
  function visitedCount() { return Object.keys(S.quest.visited).length; }
  /* 藏在屋子里的回忆找到了几段 */
  function roomFoundCount() {
    var n = 0;
    (window.Memories || []).forEach(function (m) { if (m.room && S.quest.found[m.id]) n++; });
    return n;
  }
  function ranchEver() {
    var w = curWorld() || {};
    return (w.ranch && w.ranch.ever) || {};
  }
  function ranchFedAny() {
    var w = curWorld() || {};
    var r = w.ranch || {};
    return !!((r.cow && r.cow.fed) || (r.sheep && r.sheep.fed) || (r.hen && r.hen.fed));
  }
  function ranchGoodsCount() { return Object.keys(ranchEver()).length; }
  function chapterNo() {
    var w = curWorld() || {};
    var n = w.chapter || 0;
    return n > 8 ? 8 : n;
  }
  function chapterDayStr() { var w = curWorld() || {}; return w.chapterDay || ''; }

  /* 是否今天已经推进过一章：v4.3 起不再当锁用，只记录日期 */
  function canAdvanceToday() { return true; }

  var CHAPTERS = [
    { t: '回到小镇', tip: '先和圣诞老人打个招呼',
      ok: function () { return !!S.quest.talked.santa; },
      prog: function () { return S.quest.talked.santa ? '✓' : '还没聊过'; } },
    { t: '认识邻居', tip: '镇上现在有八个人：圣诞老人、雪人、小精灵、老板娘、邮差阿信、面包师麦香、牧羊女小禾、老木匠老鲁',
      ok: function () { return talkCount() >= 4 && !!S.quest.visited.cabin; },
      prog: function () { return '聊过 ' + Math.min(4, talkCount()) + '/4 · 小屋 ' + (S.quest.visited.cabin ? '✓' : '×'); } },
    { t: '屋里的旧照片', tip: '四间屋子的角落都藏着回忆——不只是雪地上有',
      ok: function () { return roomFoundCount() >= 2; },
      prog: function () { return '室内回忆 ' + Math.min(2, roomFoundCount()) + '/2'; } },
    { t: '开一片牧场', tip: '去左边牧场抱一捆干草，喂一次牛、羊或鸡',
      ok: function () {
        var w = curWorld() || {};
        return !!(w.ranch && w.ranch.gotHay) && ranchFedAny();
      },
      prog: function () {
        var w = curWorld() || {};
        return '干草 ' + (w.ranch && w.ranch.gotHay ? '✓' : '×') + ' · 喂食 ' + (ranchFedAny() ? '✓' : '×');
      } },
    { t: '收下第一份产物', tip: '喂过的动物第二天来收：牛奶 / 羊毛 / 鸡蛋',
      ok: function () { return ranchGoodsCount() >= 1 && foundCount() >= 4; },
      prog: function () { return '产物 ' + Math.min(1, ranchGoodsCount()) + '/1 · 回忆 ' + Math.min(4, foundCount()) + '/4'; } },
    { t: '邮局开张', tip: '去工坊：木材做纸 → 纸+木材+鲜花做礼盒 → 到「寄件」台寄出第一个包裹',
      ok: function () { return sentCount() >= 1; },
      prog: function () { return '寄出包裹 ' + Math.min(1, sentCount()) + '/1 · 已知地址 ' + addrCount(); } },
    { t: '把树种起来', tip: '温室种树收木材 → 工坊做一件手工 → 树下装饰',
      ok: function () { return treeStage() >= 1 && (worldRes().materials || 0) >= 1; },
      prog: function () { return '树 ' + treeStageName(treeStage()) + ' · 手工 ' + Math.min(1, worldRes().materials || 0) + '/1'; } },
    { t: '凑齐三张车票', tip: '车票不会一次给全：先把小镇的日子过得再热闹一点',
      ok: function () { return ticketOwnedCount() >= 3; },
      prog: function () { return '车票 ' + Math.min(3, ticketOwnedCount()) + '/3 · 回忆 ' + foundCount(); } },
    { t: '远方的回信', tip: '寄出去的包裹会带着当地特产回来，收满三种',
      ok: function () { return mailCount() >= 3 && specCount() >= 3; },
      prog: function () { return '回信 ' + Math.min(3, mailCount()) + '/3 · 特产 ' + Math.min(3, specCount()) + '/3'; } },
    { t: '点亮整棵树', tip: '树长到第 6 阶（完全点亮）、三种牧场产物都收过、六种远方特产摆上架',
      ok: function () { return treeStage() >= TREE_STAGE_MAX && foundCount() >= 11 && ranchGoodsCount() >= 3 && specCount() >= 6; },
      prog: function () {
        return '树 ' + treeStageName(treeStage()) + '（' + treeStage() + '/' + TREE_STAGE_MAX + '）' +
          ' · 回忆 ' + Math.min(11, foundCount()) + '/11 · 产物 ' + Math.min(3, ranchGoodsCount()) + '/3' +
          ' · 特产 ' + specCount() + '/' + ((T() && T().count) || 41);
      } }
  ];

  function chapterText() {
    var ch = chapterNo();
    if (ch >= CHAPTERS.length) return '🎄 一切就绪，就等 2026 年 12 月 25 日的晚上了';
    var c = CHAPTERS[ch];
    return '📖 第 ' + (ch + 1) + ' 章 · ' + c.t + '　' + c.prog();
  }
  function questText() { return chapterText(); }

  /* 推进一步：写进共享存档，两台设备看到的是同一章、同一天 */
  function advanceChapter(to) {
    mutate(function (w) {
      w.chapter = to;
      w.chapterDay = dayStr();
      return w;
    }).then(function () {
      refreshHUD();
      var nxt = CHAPTERS[to];
      if (nxt) toast('📖 第 ' + (to + 1) + ' 章：' + nxt.t + ' —— ' + nxt.tip, 5200);
      else toast('🎄 八章都过完了。剩下的日子，就在小镇里慢慢等圣诞夜吧。', 5200);
      Snd.sfx('ding');
      if (to >= CHAPTERS.length) {
        S.quest.step = 6;
        syncQuest();
      }
    });
    S.lastQuestText = '';
  }

  /* v4.3：章节不再「一天只让推一章」，条件到了就推。
     时长靠真实要做的事撑起来（作物生长 / 牧场隔天 / 包裹往返 / 41 个地址），
     不靠「明天再来」这四个字。 */
  function updateQuest() {
    var ch = chapterNo();
    if (ch >= CHAPTERS.length) {
      if (S.quest.step < 6) { S.quest.step = 6; syncQuest(); }
      return;
    }
    var c = CHAPTERS[ch];
    if (!c || !c.ok()) return;
    advanceChapter(ch + 1);
  }
  /* 脚边自动拾起：地上那十段回忆没有任何文字提示，走到 26px 内就收进册子。
     不弹「要不要捡」的确认，因为发现本身就是奖励。 */
  function autoPickEggs() {
    if (S.mapId || S.ending || S.photo) return;
    var i, e, dx, dy;
    /* 室外：雪地上那几段 */
    if (!S.interId && World.eggs) {
      for (i = 0; i < World.eggs.length; i++) {
        e = World.eggs[i];
        if (S.quest.found[e.id]) continue;
        dx = S.self.x - e.x; dy = S.self.y - e.y;
        if (dx * dx + dy * dy < 26 * 26) { collectEgg(e); return; }
      }
    }
    /* 室内：藏在桌椅架子后面的那几段（v4.3 起同样不提示、走过就收） */
    if (S.interId && World.roomEggs) {
      for (i = 0; i < World.roomEggs.length; i++) {
        e = World.roomEggs[i];
        if (e.room !== S.interId) continue;
        if (S.quest.found[e.id]) continue;
        dx = S.self.x - e.x; dy = S.self.y - e.y;
        if (dx * dx + dy * dy < 26 * 26) { collectEgg(e); return; }
      }
    }
  }

  function checkVisitZones() {
    if (S.interId || S.mapId || S.quest.step > 3) return;
    var marked = false;
    function near(x, y, r) { return Math.sqrt(Math.pow(S.self.x - x, 2) + Math.pow(S.self.y - y, 2)) < r; }
    if (!S.quest.visited.cabin && near(285, 410, 110)) { S.quest.visited.cabin = 1; marked = true; }
    if (!S.quest.visited.cafe && near(1295, 385, 110)) { S.quest.visited.cafe = 1; marked = true; }
    if (!S.quest.visited.greenhouse && near(240, 1000, 130)) { S.quest.visited.greenhouse = 1; marked = true; }
    if (!S.quest.visited.workshop && near(1045, 260, 130)) { S.quest.visited.workshop = 1; marked = true; }
    if (marked) syncQuest();
  }

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg, ms) {
    var el = $('#toast');
    el.textContent = msg; el.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.add('hidden'); }, ms || 2400);
  }
  function fmtRemain(ms) {
    if (ms <= 0) return '已成熟';
    var s = Math.floor(ms / 1000);
    if (s < 60) return s + ' 秒';
    var m = Math.floor(s / 60);
    if (m < 60) return m + ' 分 ' + (s % 60) + ' 秒';
    var h = Math.floor(m / 60);
    return h + ' 小时 ' + (m % 60) + ' 分';
  }

  /* ---------- 进入游戏 ---------- */
  function enter(code, backend, opts) {
    S.code = code; S.backend = backend; S.opts = opts || {};
    S.mySlot = backend.mySlot();
    S.otherSlot = S.mySlot === 'a' ? 'b' : 'a';
    S.canvas = $('#game-canvas');
    S.ctx = S.canvas.getContext('2d');
    resize();

    var saved = S.data && S.data.slots && S.data.slots[S.mySlot] && S.data.slots[S.mySlot].pos;
    /* 上次停在某张旅行地图里：刷新后直接回到那张地图（旧存档 indoor 是 0 或室内 id，走原来的路） */
    var savedHere = saved && saved.indoor;
    var restoreMap = (typeof savedHere === 'string' && window.TravelMaps && TravelMaps.has(savedHere)) ? savedHere : null;
    if (restoreMap) {
      var rd = TravelMaps.get(restoreMap);
      S.self.x = rd.spawn.x; S.self.y = rd.spawn.y;
    } else if (saved && typeof saved.x === 'number') {
      S.self.x = saved.x; S.self.y = saved.y;
    } else {
      S.self.x = S.mySlot === 'a' ? 640 : 860;
      S.self.y = 720;
    }
    S.remote.x = S.otherSlot === 'a' ? 640 : 860;
    S.remote.y = 720; S.remote.tx = S.remote.x; S.remote.ty = S.remote.y;

    S.parts = []; S.interId = null; S.outdoorPos = null;
    S.mapId = restoreMap; S.mapReturn = null; S.posRestored = false;
    S.prevPresence = null; S.prevStage = -1; S.heartT = 0;
    S.quest = { step: 0, talked: {}, visited: {}, found: {} };
    S.q = { lvl: 2, acc: 0, n: 0 };
    S.ending = null; S.ended = false; S.photo = false; S.lastQuestText = '';
    S.endHintShown = false; S.worldFallback = false; S.worldErrShown = false;
    /* 加载时的庆典状态当基线：只有「此刻正在从未开始变成已开始」才自动开演，
       刷新 / 重进房间时不会因为一次页面加载就把整段结局重放一遍。 */
    /* null = 「还没看到过云端状态」。第一次收到存档时把当时的值当基线，
       所以刷新 / 重进房间不会重放；之后只有真正发生「未开始 → 已开始」才自动开演。 */
    S.partyBase = null;
    S.partyPlayed = -1;
    S.partyReady = false; S.adminPreview = false;
    S.world = null; S.localWorld = null;

    if (S.data && S.data.world) absorbQuest(S.data.world);

    S.flakes = [];
    for (var i = 0; i < 55; i++) {
      S.flakes.push({ x: Math.random() * World.width, y: Math.random() * World.height, r: 1 + Math.random() * 2.2, v: 22 + Math.random() * 40, ph: Math.random() * 7 });
    }

    bindInput();
    watchPanels();
    S.active = true;
    refreshHUD();    if (S.dev) {
      var dc = $('#dev-chip');
      if (dc) dc.classList.remove('hidden');
      toast('🛠️ 开发测试模式：生长 6-10 秒 · 日期门放开', 4000);
    }
    startLoop();

    /* 仅 dev 模式：?dev=1&open=res|quest|settings|book|outfit|tree|menu
       用于逐个截图验收面板（正常游玩不会触发）。 */
    if (S.dev) {
      var m = /[?&]open=([a-z]+)/.exec(location.search);
      var openers = {
        res: openResPanel, quest: openQuestPanel, settings: openSettings,
        book: openBook, outfit: openOutfit, tree: openTreePanel, menu: toggleMenu
      };
      if (m && openers[m[1]]) setTimeout(openers[m[1]], 400);
    }
  }

  function active() { return S.active; }

  function resize() {
    if (!S.canvas) return;
    /* v3：分辨率不再随帧率降级。
     * 旧代码按性能分级把 DPR 压到 1 或 1.5，再配合 CSS image-rendering:pixelated，
     * 结果是真机上整屏被最近邻放大 2~3 倍——这是"画面粗糙"最直接的一环。
     * 现在始终按设备像素比（上限 3）渲染；性能不够时只减粒子与光晕，不降清晰度。 */
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    S.dpr = dpr;
    S.view.w = S.canvas.clientWidth;
    S.view.h = S.canvas.clientHeight;
    S.canvas.width = Math.round(S.view.w * dpr);
    S.canvas.height = Math.round(S.view.h * dpr);
    S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S.ctx.imageSmoothingEnabled = true;
    S.ctx.imageSmoothingQuality = 'high';
  }

  /* ---------- 自适应性能分级 ---------- */
  function perfTick(dt) {
    S.q.acc += dt; S.q.n++;
    if (S.q.acc >= 2) {
      var avg = S.q.acc / S.q.n;
      S.q.acc = 0; S.q.n = 0;
      if (avg > 0.030 && S.q.lvl > 0) { S.q.lvl--; applyQuality(); }
      else if (avg < 0.018 && S.q.lvl < 2) { S.q.lvl++; applyQuality(); }
    }
  }
  function applyQuality() {
    var target = [16, 30, 55][S.q.lvl];
    while (S.flakes.length > target) S.flakes.pop();
    while (S.flakes.length < target) {
      S.flakes.push({ x: Math.random() * World.width, y: Math.random() * World.height, r: 1 + Math.random() * 2.2, v: 22 + Math.random() * 40, ph: Math.random() * 7 });
    }
    // 不再调用 resize()：清晰度固定，性能只通过粒子数量调节
  }

  /* ---------- 数据入口（app.js 调用）---------- */
  function onData(d) {
    S.data = d;
    if (!S.active || !d) return;
    /* 首次拿到存档时对一次位：如果上次是停在某张旅行地图里，
       刷新/重进后直接回到那张地图，而不是被扔回小镇广场。 */
    if (!S.posRestored) {
      S.posRestored = true;
      var sp0 = d.slots && d.slots[S.mySlot] && d.slots[S.mySlot].pos;
      if (sp0 && typeof sp0.indoor === 'string' && window.TravelMaps && TravelMaps.has(sp0.indoor)) {
        var rd0 = TravelMaps.get(sp0.indoor);
        S.mapId = sp0.indoor; S.interId = null;
        S.self.x = rd0.spawn.x; S.self.y = rd0.spawn.y;
        TravelMaps.bg(sp0.indoor);
      }
      /* 进房间后先把「我在哪」告诉对方一次：不然刷新 / 刚进来时，
         对方屏幕上自己会一直停在出生点，直到自己走两步才对齐。 */
      setTimeout(publishPos, 120);
    }
    var w = d.world;
    if (w && !S.worldFallback) {
      S.world = w;
      absorbQuest(w);
      if (w.ended && !S.ended) S.ended = true; // 另一台设备已经看过结局
      /* 老存档（四阶段刻度）折算成六阶段。先改内存镜像让这一帧就画对，
         再把折算结果落盘；落盘时事务里再判一次，两台设备同时开会话也只折一次。 */
      if (migrateWorld(w)) {
        mutate(function (w2) { migrateWorld(w2); return w2; });
      }
      syncPartyState(w);
    }
    syncTickets();      // 条件达成 / 老存档里去过的地方 → 自动补票并同步给另一台设备
    refreshHUD();
    syncAdminLive();    // 对方改了共享进度时，开着的管理员面板数字跟着走
    var o = d.slots && d.slots[S.otherSlot];
    if (o) {
      if (o.pos && typeof o.pos.x === 'number') {
        S.remote.tx = o.pos.x; S.remote.ty = o.pos.y; S.remote.dir = o.pos.dir || 0;
        S.remote.moving = !!o.pos.moving; S.remote.seen = true;
        S.remote.inter = o.pos.indoor || 0;
      }
      if (o.wave && o.wave !== S._lastWave) { S._lastWave = o.wave; S.remote.waveUntil = performance.now() + 1500; }
    }
    var online = !!(d.presence && d.presence[S.otherSlot]);
    if (S.prevPresence !== null && online !== S.prevPresence) {
      toast(online ? ('💚 ' + NAME[S.otherSlot] + ' 来到了小镇') : ('😮 ' + NAME[S.otherSlot] + ' 暂时离开了…'));
      if (online && !S.interId && S.remote.inter === 0) {
        S.remote.seen = true;
        burst(S.remote.tx, S.remote.ty - 40, 'heart', 4);
      }
    }
    S.prevPresence = online;
    var p = $('#partner-presence');
    if (p) {
      p.querySelector('.dot').className = 'dot ' + (online ? 'on' : 'off');
      p.querySelector('span').textContent = (NAME[S.otherSlot]) + (online ? ' 在线' : ' 离线');
    }
  }

  /* ---------- 输入 ---------- */
  function bindInput() {
    if (S.inputBound) return;   // 防止重复 enter 时把监听器叠一层（重复监听会让摇杆/按键被处理多次）
    S.inputBound = true;
    window.addEventListener('resize', resize);

    window.addEventListener('keydown', function (e) {
      if (S.paused && e.key !== 'Escape') return;
      S.keys[e.key.toLowerCase()] = true;
      if ((e.key === 'e' || e.key === 'E' || e.key === ' ') && S.curInteract) { doInteract(); e.preventDefault(); }
      if (e.key === 'Escape') { closeAllPanels(); }
    });
    window.addEventListener('keyup', function (e) { S.keys[e.key.toLowerCase()] = false; });

    /* 任何"输入中断"都立刻归零：切后台 / 失焦 / 页面隐藏后，角色不许继续走 */
    function dropInput() {
      S.keys = {};
      joyReset();
      lastT = 0;   // 回来时不要把后台那段时间算成位移
    }
    window.addEventListener('blur', dropInput);
    window.addEventListener('pagehide', dropInput);
    document.addEventListener('visibilitychange', function () { if (document.hidden) dropInput(); });

    /* 面板里必须允许原生滚动：以前这里无条件 preventDefault，
       导致菜单/家当/回忆册的内容区永远拖不动（手指下拖只会被吞掉）。 */
    function inScrollableUI(node) {
      while (node && node !== document.body) {
        if (node.classList && (node.classList.contains('panel') ||
          node.classList.contains('panel-body') || node.classList.contains('book-list'))) return true;
        node = node.parentNode;
      }
      return false;
    }
    document.addEventListener('touchmove', function (e) {
      if (!S.active) return;
      if (inScrollableUI(e.target)) return;   // 交给浏览器滚面板内容
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', function (e) { if (S.active) e.preventDefault(); });
    document.addEventListener('dblclick', function (e) { if (S.active) e.preventDefault(); });

    // 首次触摸/点击后启动背景音乐（浏览器策略要求用户手势）
    function firstGesture() {
      document.removeEventListener('pointerdown', firstGesture);
      if (Snd.isOn()) Snd.startBgm();
    }
    document.addEventListener('pointerdown', firstGesture);

    /* 虚拟摇杆 —— v3 重写
     * 旧实现的问题（已实测）：
     *  1) touchstart 与 mousedown 双绑定，iOS 在 touchend 后会补发鼠标事件 → 摇杆可能残留输入；
     *  2) 摇杆位移只要 >12% 就被归一化成满速 → "一碰就跑"，无法慢走；
     *  3) 摇杆中心只在按下瞬间取一次，横竖屏切换或安全区变化后会偏移。
     * 现在：只用 Pointer Events（单一输入源 + setPointerCapture），输出 0~1 的模拟量，
     * 带死区与平滑曲线；任何中断（抬起 / 取消 / 失焦 / 切后台）都立刻归零。 */
    var base = $('#joy-base'), knob = $('#joy-knob');
    var JOY_MAX = 46, JOY_DEAD = 0.14;
    S.joy = { active: false, pid: null, bx: 0, by: 0, dx: 0, dy: 0, mag: 0 };

    function joyCenter() {
      var r = base.getBoundingClientRect();
      S.joy.bx = r.left + r.width / 2;
      S.joy.by = r.top + r.height / 2;
    }
    function joyReset() {
      S.joy.active = false; S.joy.pid = null;
      S.joy.dx = 0; S.joy.dy = 0; S.joy.mag = 0;
      if (knob) knob.style.transform = 'translate(0,0)';
    }
    function joyApply(cx, cy) {
      var dx = cx - S.joy.bx, dy = cy - S.joy.by;
      var len = Math.sqrt(dx * dx + dy * dy);
      var nx = 0, ny = 0;
      if (len > JOY_MAX) { nx = dx / len * JOY_MAX; ny = dy / len * JOY_MAX; }
      else { nx = dx; ny = dy; }
      var mag = Math.min(1, len / JOY_MAX);
      var out = 0;
      if (mag > JOY_DEAD) {
        var f = (mag - JOY_DEAD) / (1 - JOY_DEAD);
        out = f * f * (3 - 2 * f);            // smoothstep：轻推很慢，推到底才满速
      }
      S.joy.dx = nx / JOY_MAX;
      S.joy.dy = ny / JOY_MAX;
      S.joy.mag = out;
      if (knob) knob.style.transform = 'translate(' + nx + 'px,' + ny + 'px)';
    }
    base.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      S.joy.active = true; S.joy.pid = e.pointerId;
      joyCenter();
      try { base.setPointerCapture(e.pointerId); } catch (err) { }
      joyApply(e.clientX, e.clientY);
    });
    base.addEventListener('pointermove', function (e) {
      if (!S.joy.active || e.pointerId !== S.joy.pid) return;
      e.preventDefault();
      joyApply(e.clientX, e.clientY);
    });
    function joyEnd(e) {
      if (!S.joy.active) return;
      if (e && e.pointerId !== undefined && e.pointerId !== S.joy.pid) return;
      joyReset();
    }
    base.addEventListener('pointerup', joyEnd);
    base.addEventListener('pointercancel', joyEnd);
    base.addEventListener('lostpointercapture', joyEnd);

    bindAdmin();   // 管理员入口（设置最底部的「小镇维护」），不占界面任何位置
    $('#btn-interact').addEventListener('click', function () { doInteract(); });
    $('#btn-menu').addEventListener('click', function () { toggleMenu(); });
    $('#menu-close').addEventListener('click', function () { closeAllPanels(); });
    var mo = $('#menu-outfit');
    if (mo) mo.addEventListener('click', function () { closeAllPanels(); openOutfit(); });
    $('#menu-tree').addEventListener('click', function () { closeAllPanels(); openTreePanel(); });
    $('#menu-invite').addEventListener('click', function () { closeAllPanels(); S.opts.invite && S.opts.invite(); });
    $('#menu-photo').addEventListener('click', function () { closeAllPanels(); openPhoto(); });
    $('#menu-book').addEventListener('click', function () { closeAllPanels(); openBook(); });
    $('#menu-res').addEventListener('click', function () { closeAllPanels(); openResPanel(); });
    $('#menu-quest').addEventListener('click', function () { closeAllPanels(); openQuestPanel(); });
    $('#menu-settings').addEventListener('click', function () { closeAllPanels(); openSettings(); });

    /* 右下角快捷按钮：换装 / 合影（和菜单里走同一条逻辑） */
    var qOutfit = $('#btn-outfit');
    if (qOutfit) qOutfit.addEventListener('click', function () { closeAllPanels(); openOutfit(); });
    var qPhoto = $('#btn-photo');
    if (qPhoto) qPhoto.addEventListener('click', function () { closeAllPanels(); openPhoto(); });

    /* 统一的关闭入口：任何带 data-close 的按钮都走同一条路，
       以后加面板只要写上按钮就一定能关。 */
    document.addEventListener('click', function (e) {
      var t = e.target;
      var c = t && t.closest ? t.closest('[data-close]') : null;
      if (c) {
        if (S.adminGuardUntil && Date.now() < S.adminGuardUntil) return;
        e.preventDefault(); closeAllPanels();
      }
    });
    var scrim = $('#panel-scrim');
    if (scrim) scrim.addEventListener('click', function () {
      if (S.adminGuardUntil && Date.now() < S.adminGuardUntil) return;
      closeAllPanels();
    });
    // 面板内部点击不关闭面板；但面板自己的 ✕ / data-close 按钮必须有效
    PANEL_IDS.forEach(function (s) {
      var el = $(s);
      if (!el) return;
      el.addEventListener('click', function (e) {
        var c = e.target && e.target.closest ? e.target.closest('[data-close]') : null;
        if (c) { e.preventDefault(); closeAllPanels(); }
        e.stopPropagation();   // 不要冒泡到遮罩/画布
      });
    });
    /* v4.3 寄件台 / 信袋里的按钮用事件委托：
       列表是动态生成的，委托式绑定在手机上也不会有几百个监听器。

       ★ v4.5.1 修复（寄件台点了没反应 / 阿信托付的事交不了）：
       下面那个「点面板内部不关闭面板」的循环里有一句 e.stopPropagation()，
       它挂在 #pack-panel / #mail-panel 自己身上 —— 冒泡到面板就被掐断了，
       于是挂在 document 上的这份委托**一次也收不到**面板里的点击。
       所以这里必须用**捕获阶段**（第三个参数 true）：捕获从 document 往目标走，
       先于面板上的 stopPropagation 执行完，事件被拦掉也不影响我们。
       不改成「面板里别 stopPropagation」，是因为那句挡的是「点面板内部漏到画布」。 */
    function panelActionClick(e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var sd = t.closest('[data-send]');
      if (sd) {
        e.preventDefault();
        var pid = sd.getAttribute('data-send');
        var st = parcelState(pid);
        if (st === 'ready') claimParcel(pid);
        else if (st === 'fly') toast('这件还在路上，再等等', 2400);
        else if (hasSpec(pid)) toast('这个地址的特产已经收过了，可以寄去别的地方', 3000);
        else sendParcel(pid);
        return;
      }
      var cl = t.closest('[data-claim]');
      if (cl) { e.preventDefault(); claimParcel(cl.getAttribute('data-claim')); return; }
      var cm = t.closest('[data-comm]');
      if (cm) {
        e.preventDefault();
        var who = cm.getAttribute('data-comm');
        var line = talkComm(who);
        /* talkComm 返回 null = 这条委托已经不在了（另一台设备先交了 / 跨天了）。
           以前这里什么都不做，玩家看到的就是「点了没反应」，现在明确说一句。 */
        if (line) { toast(line.replace(/[（(].*?[）)]/g, ''), 3600); openMailPanel(); }
        else { toast('这件事今天已经交过了，明天再来看看 ✉️', 3200); openMailPanel(); }
        return;
      }
    }
    document.addEventListener('click', function (e) {
      /* 任何一步抛错都不能变成「点了没反应」：打日志 + 给一句人话。 */
      try { panelActionClick(e); }
      catch (err) {
        if (window.console && console.error) console.error('[panel-click]', err);
        toast('这一步没走通，再试一次 ✦', 2600);
      }
    }, true);

    var mAddr = $('#mail-addr');
    if (mAddr) mAddr.addEventListener('click', function () { takeAddrToday(); });
    var mTrade = $('#mail-trade');
    if (mTrade) mTrade.addEventListener('click', function () { tradeAddr(); });
    var mFast = $('#mail-fast');
    if (mFast) mFast.addEventListener('click', function () { expressClaim(); });

    // 任务 / 资源角标：点开对应面板
    var qc = $('#quest-chip');
    if (qc) qc.addEventListener('click', function () { openQuestPanel(); });
    var rc = $('#res-chip');
    if (rc) rc.addEventListener('click', function () { openResPanel(); });
    function toggleMusic() {
      var nowOn = Snd.toggle();
      var m1 = $('#menu-music');
      if (m1) m1.textContent = nowOn ? '🔊 音乐音效：开' : '🔈 音乐音效：关';
      var m2 = $('#set-music');
      if (m2) {
        m2.textContent = nowOn ? '开' : '关';
        m2.classList.toggle('is-on', nowOn);
        m2.setAttribute('aria-checked', nowOn ? 'true' : 'false');
      }
      toast(nowOn ? '音乐已开启 🎵' : '音乐已关闭');
    }
    var mMusic = $('#menu-music');
    if (mMusic) mMusic.addEventListener('click', toggleMusic);
    var setMusic = $('#set-music');
    if (setMusic) setMusic.addEventListener('click', toggleMusic);
    var setInvite = $('#set-invite');
    if (setInvite) setInvite.addEventListener('click', function () { closeAllPanels(); S.opts.invite && S.opts.invite(); });
    var setLeave = $('#set-leave');
    if (setLeave) setLeave.addEventListener('click', function () { S.opts.onLeave && S.opts.onLeave(); });
    $('#menu-leave').addEventListener('click', function () { S.opts.onLeave && S.opts.onLeave(); });
    $('#dlg-close').addEventListener('click', function () { closeAllPanels(); });
    $('#dlg-next').addEventListener('click', function () { dlgNext(); });
    var tdeco = $('#tree-deco');
    if (tdeco) tdeco.addEventListener('click', function () { decorateTree(); });
    /* 庆典面板：一个「开 Party」，一个「再准备一下」 */
    var pgo = $('#party-go');
    if (pgo) pgo.addEventListener('click', function () {
      if (pgo.dataset.mode === 'live') resumeParty();
      else startParty();
    });
    var pLater = $('#party-later');
    if (pLater) pLater.addEventListener('click', function () { closeAllPanels(); });
    $('#tree-close').addEventListener('click', function () { closeAllPanels(); });
    $('#outfit-close').addEventListener('click', function () { closeAllPanels(); });
    $('#mem-close').addEventListener('click', function () { closeAllPanels(); });
    $('#book-close').addEventListener('click', function () { closeAllPanels(); });
    var stk = $('#station-tickets');
    if (stk) stk.addEventListener('click', function () { closeAllPanels(); openTicketBook(); });
    var tkc = $('#ticket-close');
    if (tkc) tkc.addEventListener('click', function () { closeAllPanels(); });
    var stc = $('#station-close');
    if (stc) stc.addEventListener('click', function () { closeAllPanels(); });
    $('#plot-close').addEventListener('click', function () { closeAllPanels(); });
    $('#craft-close').addEventListener('click', function () { closeAllPanels(); });
    var bpf = $('#btn-plant-flower'), bpt = $('#btn-plant-tree'), bhv = $('#btn-harvest');
    if (bpf) bpf.addEventListener('click', function () { plantSeed(S.plotIdx, 'flower'); });
    if (bpt) bpt.addEventListener('click', function () { plantSeed(S.plotIdx, 'tree'); });
    if (bhv) bhv.addEventListener('click', function () { harvest(S.plotIdx); });
    /* 合成按钮由 openCraftPanel() 动态生成（配方从 3 个变成 5 个），这里不再逐个绑定 */
    /* 最终结局：点画面任何地方推进台词（只绑定一次） */
    var finBox = $('#finale');
    if (finBox && !finBox.dataset.bound) {
      finBox.dataset.bound = '1';
      finBox.addEventListener('click', function () { finNextBeat(); });
    }
    $('#photo-close').addEventListener('click', function () { closePhoto(); });
    var px2 = $('#photo-x');
    if (px2) px2.addEventListener('click', function (e) { e.stopPropagation(); closePhoto(); });
    /* 点空白处也能关：手指在照片外面轻触一下就退出，不用去找按钮 */
    var pm = $('#photo-modal');
    if (pm) pm.addEventListener('click', function (e) { if (e.target === pm) closePhoto(); });
    $('#photo-save').addEventListener('click', function () { savePhoto(); });
    document.querySelectorAll('#outfit-list .outfit-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.dataset.outfit;
        // 先本地生效：不用等网络回包，关掉面板就能看到新衣服（云端回来后会再对齐一次）
        if (S.data && S.data.slots && S.data.slots[S.mySlot]) S.data.slots[S.mySlot].outfit = key;
        S.backend.setOutfit(key).then(function () {
          toast('换上了「' + b.textContent.trim() + '」✨');
          closeAllPanels();
        }).catch(function (e) { toast('换装失败：' + e.message); });
      });
    });
    window.addEventListener('orientationchange', function () { setTimeout(resize, 300); });
  }

  /* ---------- 碰撞 ---------- */
  function curInt() { return S.interId ? World.getInterior(S.interId) : null; }
  /* 当前所在的旅行地图（不在任何地图里就是 null）。
     六张地图的数据全部来自 maps.js，game.js 只负责「怎么走、怎么交互」。 */
  function curMap() {
    return (S.mapId && window.TravelMaps) ? TravelMaps.get(S.mapId) : null;
  }
  /* 当前位置的共享标识：室内 id / 地图 id / 0（小镇）。
     存档里仍然写在 pos.indoor 这个字段上——旧存档是 0 或室内 id，照样能读。 */
  function hereKey() { return S.interId || S.mapId || 0; }

  /* 旅行地图的取景比例。地图是 1500×1200 的大画幅，1:1 摆在竖屏手机上
     只能看到中间一条横带（最上面 350px 永远露不出来）；缩到 0.8 之后
     整张地图的高度一次看全——天、山、湖/江、地面同时在场，
     人才像是「站在那个地方」，而不是「站在一张背景图前面」。 */
  var MAP_ZOOM = 0.8;
  function zoomNow() {
    var mp = curMap();
    if (!mp) return 1;
    /* v4.4：有的地图（冰岛）主角是天空。
       fitSky = 希望「一屏看到多少个世界单位高」：
         太高的窗口（竖屏）不会被放大到看不出比例，太矮的窗口（横屏）也会缩一点，
       最终夹在 minZoom~maxZoom 之间。
       注意不要用「刚好装下整张 h」——那样整张图一览无余，人只有十来个像素，
       而且远处的东西一眼就在画面里了。 */
    if (mp.fitSky) {
      var z2 = S.view.h / mp.fitSky;
      z2 = Math.min(z2, mp.maxZoom || MAP_ZOOM);
      z2 = Math.max(z2, mp.minZoom || MAP_ZOOM);
      return z2;
    }
    return mp.zoom || MAP_ZOOM;
  }

  function hits(x, y) {
    var bx = x - 12, by = y - 12, bw = 24, bh = 14;
    var inter = curInt();
    var mp = inter ? null : curMap();
    var list = inter ? inter.obstacles : (mp ? (mp.obstacles || []) : World.obstacles);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (bx < o.x + o.w && bx + bw > o.x && by < o.y + o.h && by + bh > o.y) return true;
    }
    return false;
  }

  /* ---------- 主循环 ----------
   * v3 修复（实测数据见 tools/README-move-test.md）：
   *  旧代码 `Math.min((ts-lastT)/1000 || 0.016, 0.05)` 有两个隐患：
   *   a) 当 (ts-lastT) 恰好为 0 时，`0 || 0.016` 会凭空补 16ms；
   *   b) enter() 没有守卫，第二次 enter 会再起一条 rAF 循环，两条循环里总有一条拿到 dt=0 →
   *      被补成 16ms，于是每帧多算 16ms。实测：60Hz 下速度 150→293 px/s，120Hz 下 150→438 px/s。
   *      ——这正是"网页正常、主屏幕版明显更快"的技术原因（高刷屏更严重）。
   *  现在：全局唯一循环令牌 + 真实 dt + 时间回退保护，绝不凭空造时间。 */
  var lastT = 0, rafId = 0;
  S.simT = 0;
  function loop(ts) {
    if (!S.active) { rafId = 0; return; }
    var raw = lastT ? (ts - lastT) / 1000 : 0.016;
    lastT = ts;
    if (!isFinite(raw) || raw < 0) raw = 0;   // 时间回退 / NaN 保护
    var dt = Math.min(raw, 0.05);             // 卡顿保护：单帧最多按 50ms 计
    S.dt = dt;
    S.simT += dt;                             // 累计模拟时间（调试口用来算"每模拟秒位移"）
    perfTick(dt);
    if (!S.paused) update(dt, ts);
    if (S.ending) finTick(dt, ts);
    draw(ts);
    rafId = requestAnimationFrame(loop);
  }
  function startLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    lastT = 0;
    rafId = requestAnimationFrame(loop);
  }
  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    S.active = false;
  }

  function update(dt, ts) {
    if (S.ending) return;   // 最终结局有自己的舞台，世界这一层完全停下

    /* 输入合成：键盘给满速，摇杆给 0~1 的模拟量；两者取较大者，不叠加。
     * 旧的写法把任意输入都归一化成 1.0，轻推摇杆也等于全速跑。 */
    var kx = 0, ky = 0;
    if (S.keys['w'] || S.keys['arrowup']) ky -= 1;
    if (S.keys['s'] || S.keys['arrowdown']) ky += 1;
    if (S.keys['a'] || S.keys['arrowleft']) kx -= 1;
    if (S.keys['d'] || S.keys['arrowright']) kx += 1;
    var klen = Math.sqrt(kx * kx + ky * ky);

    var ux = 0, uy = 0, umag = 0;
    if (S.joy.mag > 0.001) {
      var jlen = Math.sqrt(S.joy.dx * S.joy.dx + S.joy.dy * S.joy.dy) || 1;
      ux = S.joy.dx / jlen; uy = S.joy.dy / jlen; umag = S.joy.mag;
    }
    if (klen > 0) { ux = kx / klen; uy = ky / klen; umag = 1; }

    var moving = umag > 0.001;
    if (moving) {
      var nx = S.self.x + ux * SPEED * umag * dt;
      var ny = S.self.y + uy * SPEED * umag * dt;
      if (!hits(nx, S.self.y)) S.self.x = nx;
      if (!hits(S.self.x, ny)) S.self.y = ny;
      var inter = curInt();
      var mp = inter ? null : curMap();
      var iw = inter ? inter.w : (mp ? mp.w : World.width);
      var ih = inter ? inter.h : (mp ? mp.h : World.height);
      S.self.x = Math.max(30, Math.min(iw - 30, S.self.x));
      if (mp) {
        // 旅行地图只有一条「能站人的地面带」：上界是远景的地脚，下界是画面底边
        S.self.y = Math.max(mp.walk.y0, Math.min(mp.walk.y1, S.self.y));
      } else {
        S.self.y = Math.max(inter ? 150 : 70, Math.min(ih - 24, S.self.y));
      }
      if (Math.abs(ux) > Math.abs(uy)) S.self.dir = ux < 0 ? 2 : 3;
      else S.self.dir = uy < 0 ? 1 : 0;
      // 步频跟着速度走：慢走时脚步也慢
      S.self.animT += dt * (0.45 + 0.55 * umag);
      S.self.frame = Math.floor(S.self.animT / 0.14) % 4;
    } else {
      S.self.moving = false;
      S.self.frame = 0; S.self.animT = 0;
    }
    S.self.moving = moving;

    if (S.backend && S.backend.mode !== 'demo') {
      var now = ts;
      var dirChanged = S.self.dir !== S.lastSentDir;
      if ((moving || dirChanged) && now - S.lastSent > 150) {
        S.lastSent = now; S.lastSentDir = S.self.dir;
        S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, moving, hereKey())
          .catch(function () { });
      }
    }

    if (S.remote.inter === hereKey()) {
      S.remote.x += (S.remote.tx - S.remote.x) * Math.min(1, dt * 8);
      S.remote.y += (S.remote.ty - S.remote.y) * Math.min(1, dt * 8);
    }

    // 双人互动（爱心 / 树下星光）
    if (S.remote.seen && S.remote.inter === hereKey()) {
      var pd = Math.sqrt(Math.pow(S.self.x - S.remote.x, 2) + Math.pow(S.self.y - S.remote.y, 2));
      if (pd < 140 && ts - S.heartT > 1400) {
        S.heartT = ts;
        burst((S.self.x + S.remote.x) / 2, (S.self.y + S.remote.y) / 2 - 46, 'heart', 1);
      }
      if (!S.interId && !S.mapId) {
        var nearTree = Math.sqrt(Math.pow(S.self.x - World.tree.x, 2) + Math.pow(S.self.y - World.tree.y, 2)) < 170 &&
                       Math.sqrt(Math.pow(S.remote.x - World.tree.x, 2) + Math.pow(S.remote.y - World.tree.y, 2)) < 170;
        if (nearTree && treeStage() >= TREE_STAGE_MAX && ts - S.heartT > 1000) {
          S.heartT = ts;
          burst(World.tree.x + (Math.random() - 0.5) * 90, World.tree.y - 140 - Math.random() * 60, 'spark', 2);
        }
      }
    }

    for (var pi = S.parts.length - 1; pi >= 0; pi--) {
      var pt = S.parts[pi];
      pt.life -= dt;
      pt.y -= (pt.kind === 'heart' ? 26 : 12) * dt;
      pt.x += Math.sin(pt.life * 5 + pt.ph) * 10 * dt;
      if (pt.life <= 0) S.parts.splice(pi, 1);
    }

    checkVisitZones();
    autoPickEggs();
    updateQuest();

    /* ---- v4.5：树点亮之后不再自动播结局 ----
     * 以前这里是 startEnding()：树一满、任务一到，整段 15 句对白自己就开演了。
     * 现在只做两件事：
     *   1. 记下「庆典准备就绪」（S.partyReady 供 HUD / 圣诞老人用）；
     *   2. 第一次就绪时给一句提示，并悄悄把雪橇位置记好。
     * 真正的演出必须由两个人一起走到圣诞老人跟前、手动选「开 Party」才开始。 */
    if (!S.ended && !S.ending && !S.interId && !S.mapId) {
      var festOk = partyFestivalReady();
      S.partyReady = festOk;
      if (festOk && !S.endHintShown) {
        S.endHintShown = true;
        var daysP = daysToChristmas();
        toast(daysP > 0
          ? '✨ 树已经全亮了！庆典定在圣诞夜（还有 ' + daysP + ' 天）——到时候和 ' + NAME[S.otherSlot] + ' 一起去找圣诞老人。'
          : '✨ 树已经全亮了！和 ' + NAME[S.otherSlot] + ' 一起到圣诞老人跟前，跟他说一声「开 Party 吧」。', 5600);
      }
    }

    S.curInteract = findInteract();

    var inter2 = curInt();
    var mp2 = inter2 ? null : curMap();
    var iw2 = inter2 ? inter2.w : (mp2 ? mp2.w : World.width);
    var ih2 = inter2 ? inter2.h : (mp2 ? mp2.h : World.height);
    /* 旅行地图用略微缩小的视口（见 zoomNow）：相机按「世界单位」的可见尺寸算，
       这样整张地图的高度能一次看全，不再只看到一条横带。 */
    var zi2 = zoomNow();
    var vwW = S.view.w / zi2, vhW = S.view.h / zi2;
    /* camBias：玩家在竖直方向上落在画面的第几成（0.5 = 正中）。
       主角是天空的地图会调大到 0.7，人压低一点，上半屏留给天。 */
    var bias = (mp2 && mp2.camBias) || 0.5;
    var targetCx = S.self.x - vwW / 2;
    var targetCy = S.self.y - vhW * bias;
    S.cam.x = iw2 <= vwW ? (iw2 - vwW) / 2 : Math.max(0, Math.min(iw2 - vwW, targetCx));
    S.cam.y = ih2 <= vhW ? (ih2 - vhW) / 2 : Math.max(0, Math.min(ih2 - vhW, targetCy));
  }

  /* ---------- 养成动作 ---------- */
  function plotStates() {
    var w = curWorld(); var g = (w && w.garden) || {};
    var arr = [];
    for (var i = 0; i < 6; i++) {
      var id = 'p' + (i + 1);
      var p = g[id];
      if (!p) { arr.push({ stage: 0, kind: 'none', ready: false, remain: 0 }); continue; }
      var conf = GROW[p.kind] || GROW.flower;
      var elapsed = Date.now() - (p.plantedAt || 0);
      var frac = elapsed / conf.ms;
      var stage = frac >= 1 ? 3 : (frac >= 0.25 ? 2 : 1);
      arr.push({ stage: stage, kind: p.kind, ready: stage >= 3, remain: Math.max(0, conf.ms - elapsed) });
    }
    return arr;
  }

  function plantSeed(i, kind) {
    var conf = GROW[kind];
    if (!conf) return;
    mutate(function (w) {
      w.garden = w.garden || {};
      var id = 'p' + (i + 1);
      if (w.garden[id]) return w;            // 已有作物
      w.res = w.res || { wood: 0, seeds: 0, flowers: 0, materials: 0 };
      if ((w.res.seeds || 0) < 1) return w;  // 种子不够
      w.res.seeds -= 1;
      w.garden[id] = { kind: kind, plantedAt: Date.now() };
      return w;
    }).then(function (ok) {
      var w = curWorld();
      var planted = w && w.garden && w.garden['p' + (i + 1)];
      if (planted) {
        Snd.sfx('plant');
        burst(175 + 200 * (i % 3) + (i > 2 ? 200 : 0), (i > 2 ? 400 : 255) - 20, 'spark', 3);
        toast('种下了一颗' + (kind === 'tree' ? '树种 🌲（' + conf.need + '后成材）' : '花种 🌱（' + conf.need + '后开花）'));
        closeAllPanels();
      } else {
        toast('种子不够啦——每天来温室领补给，或在小镇收集回忆 ✨');
      }
    });
  }

  function harvest(i) {
    mutate(function (w) {
      w.garden = w.garden || {};
      var id = 'p' + (i + 1);
      var p = w.garden[id];
      if (!p) return w;
      var conf = GROW[p.kind] || GROW.flower;
      if (Date.now() - (p.plantedAt || 0) < conf.ms) return w; // 未成熟（或对方刚收走）
      delete w.garden[id];
      w.res = w.res || { wood: 0, seeds: 0, flowers: 0, materials: 0 };
      if (p.kind === 'tree') w.res.wood = (w.res.wood || 0) + conf.yield;
      else w.res.flowers = (w.res.flowers || 0) + conf.yield;
      return w;
    }).then(function (ok) {
      var w = curWorld();
      var still = w && w.garden && w.garden['p' + (i + 1)];
      if (still) {
        var st = plotStates()[i];
        toast(st.ready ? '手慢了一步，好像刚刚被收走了 😮' : '还没长好呢（还需 ' + fmtRemain(st.remain) + '）');
      } else {
        Snd.sfx('harvest');
        burst(175 + 200 * (i % 3) + (i > 2 ? 200 : 0), (i > 2 ? 400 : 255) - 30, 'spark', 6);
        toast('收获啦！🪵 木材 / 🌸 鲜花已入账');
        closeAllPanels();
      }
    });
  }

  /* 配方现在可以产出任意资源（手工礼物 / 纸 / 礼盒），成本也可以多一项。 */
  function recipeLackList(recipe, r) {
    r = r || worldRes();
    var lack = [];
    if ((r.wood || 0) < recipe.wood) lack.push({ t: '🪵 木材', need: recipe.wood, have: (r.wood || 0) });
    if ((r.flowers || 0) < recipe.flowers) lack.push({ t: '🌸 鲜花', need: recipe.flowers, have: (r.flowers || 0) });
    var nd = recipe.need || {};
    for (var k in nd) if (nd.hasOwnProperty(k)) {
      if ((r[k] || 0) < nd[k]) lack.push({ t: (RES_NAME[k] || k), need: nd[k], have: (r[k] || 0) });
    }
    return lack;
  }
  function recipeLack(recipe, r) {
    return recipeLackList(recipe, r).map(function (x) {
      return x.t + ' ' + x.need + '（有 ' + x.have + '）';
    }).join(' · ');
  }
  function craft(recipe) {
    var bad = recipeLack(recipe);
    if (bad) { toast('材料还不够：' + bad, 3000); return; }
    mutate(function (w) {
      w.res = w.res || {};
      var r = w.res;
      if ((r.wood || 0) < recipe.wood || (r.flowers || 0) < recipe.flowers) return w;
      var nd = recipe.need || {};
      for (var k in nd) if (nd.hasOwnProperty(k) && (r[k] || 0) < nd[k]) return w;
      r.wood -= recipe.wood; r.flowers -= recipe.flowers;
      for (var k2 in nd) if (nd.hasOwnProperty(k2)) r[k2] = (r[k2] || 0) - nd[k2];
      var out = recipe.out || { materials: 1 };
      for (var k3 in out) if (out.hasOwnProperty(k3)) r[k3] = (r[k3] || 0) + out[k3];
      w.crafted = w.crafted || {};
      w.crafted[recipe.id] = (w.crafted[recipe.id] || 0) + 1;
      return w;
    }).then(function (ok) {
      if (!ok) return;
      Snd.sfx('craft');
      var out = recipe.out || { materials: 1 };
      var names = [];
      for (var k in out) if (out.hasOwnProperty(k)) names.push((RES_NAME[k] || k) + ' ×' + out[k]);
      toast('做好了「' + recipe.name + '」—— ' + names.join(' · ') + '　' + recipe.desc, 4200);
      refreshHUD();
    });
  }

  function grantDaily() {
    var today = dayStr();
    return mutate(function (w) {
      w.daily = w.daily || {};
      if (w.daily.day === today) return w;
      w.daily.day = today;
      w.res = w.res || { wood: 0, seeds: 0, flowers: 0, materials: 0 };
      w.res.seeds = (w.res.seeds || 0) + 2;
      w.res.wood = (w.res.wood || 0) + 1;
      w.res.flowers = (w.res.flowers || 0) + 1;
      return w;
    }).then(function (ok) {
      var w = curWorld();
      if (w && w.daily && w.daily.day === today) {
        toast('🎁 今日温室补给：🌱 种子 ×2 · 🪵 木材 ×1 · 🌸 鲜花 ×1', 4000);
        Snd.sfx('ding');
      }
    });
  }

  function drinkCocoa() {
    var today = dayStr();
    var w = curWorld();
    if (w && w.cocoa && w.cocoa.lastDay === today) {
      openDialog('☕ 吧台', ['老板娘笑了：「今天的两杯已经喝完啦，明天再来～」', '（热可可每天一杯，免费。）']);
      return;
    }
    mutate(function (w2) {
      w2.cocoa = w2.cocoa || {};
      if (w2.cocoa.lastDay === today) return w2;
      w2.cocoa.lastDay = today;
      w2.cocoa.count = (w2.cocoa.count || 0) + 1;
      return w2;
    }).then(function (ok) {
      Snd.sfx('cocoa');
      var w3 = curWorld();
      var n = w3 && w3.cocoa && w3.cocoa.count || 0;
      openDialog('☕ 吧台', [
        '老板娘把两只马克杯推过来，棉花糖堆得冒尖。',
        '「第 ' + n + ' 杯啦——外头冷，坐会儿再走。」',
        '☕ 今天的免费热可可已领（每天一杯）。'
      ]);
    });
  }

  /* 一次装饰只推进一级。费用按 TREE_COST[stage] 扣，扣完再 +1 阶；
     事务内重算一遍，所以两台手机同时点不会重复扣、也不会跳两级。 */
  function treeCostLack(cost, r) {
    var lack = [];
    ['wood', 'flowers', 'materials', 'hay', 'milk'].forEach(function (k) {
      var need = cost[k] || 0;
      if (need > 0 && (r[k] || 0) < need) lack.push({ key: k, need: need, have: r[k] || 0 });
    });
    return lack;
  }
  function treeCostText(cost) {
    var out = [];
    ['wood', 'flowers', 'materials', 'hay', 'milk'].forEach(function (k) {
      if (cost[k]) out.push((RES_NAME[k] || k) + ' ' + cost[k]);
    });
    return out.join(' · ');
  }

  function decorateTree() {
    var stage = treeStage();
    if (stage >= TREE_STAGE_MAX) return;
    var cost = TREE_COST[stage] || {};
    if (treeCostLack(cost, worldRes()).length) {
      toast('材料还不够：' + treeCostText(cost) + '（去温室种植 / 工坊制作 / 牧场收一次）', 4200);
      return;
    }
    var btn = $('#tree-deco');
    if (btn) { btn.disabled = true; btn.textContent = '正在装饰…'; }
    mutate(function (w) {
      /* 事务里重算：如果对方已经升级成功，stage 变了 → 这次按下就作废 */
      if (typeof w.treeStage !== 'number') w.treeStage = 0;
      if (w.treeStage !== stage) return undefined;
      w.res = w.res || { wood: 0, seeds: 0, flowers: 0, materials: 0 };
      var r = w.res;
      if (treeCostLack(cost, r).length) return undefined;
      ['wood', 'flowers', 'materials', 'hay', 'milk'].forEach(function (k) {
        if (cost[k]) r[k] = (r[k] || 0) - cost[k];
      });
      w.treeStage = stage + 1;
      w.treeStageVer = 2;
      /* 升一阶的小甜头：树上多挂一件手工礼物（不占成本，纯奖励） */
      r.materials = (r.materials || 0) + TREE_STAGE_GIFT;
      return w;
    }).then(function (ok) {
      var newStage = treeStage();
      if (ok && newStage > stage) {
        Snd.sfx('ding');
        burst(World.tree.x, World.tree.y - 120, 'spark', 14);
        toast('🎄 树长到「' + treeStageName(newStage) + '」了 · 手工礼物 +' + TREE_STAGE_GIFT, 3600);
      } else {
        toast('这一步没成：可能刚好被对方先点了一下，材料也已退回，看一眼树现在的样子。', 3600);
      }
      refreshHUD();
      /* 面板不关：升完这一阶直接看到「下一阶要什么」，少点两次 */
      var tp = document.getElementById('tree-panel');
      if (tp && !tp.classList.contains('hidden')) openTreePanel();
    });
  }

  /* ============================================================
   * v4.4.0 Final · 最终结局（Finale）
   * ------------------------------------------------------------
   * 不是「在小镇画布上把镜头推到树前」，而是切到一块独立的舞台：
   *   天空（星 / 月 / 云）→ 远山 → 整个小镇 → 雪地 → 全亮的树 →
   *   全镇的人 → 烟花 → 圣诞老人雪橇。
   * 同一份 paintFinale() 既画游戏里的最后一幕，也画最后那张照片，
   * 所以「玩到的最后一幕」和「存下来的那张」是同一个画面。
   *
   * 坐标全部写成比例（xf / yf），人物大小乘 K = H / 1080，
   * 所以同一段代码可以画 1920×1080（游戏里）和 1920×900（照片画面区）。
   *
   * 性能：不动的部分（天空 / 小镇 / 雪地 / 树 / 礼物 / 两个人）烘到一张
   * 离屏画布上，每帧只做 1 次 drawImage + 几个人物 + 雪花 + 烟花。
   * ============================================================ */
  var FIN_W = 1920, FIN_H = 1080;

  var FIN = {
    horizon: 0.720,
    /* 树：整个画面的中心。星顶在 0.12H 附近，树裙压到 0.86H。 */
    tree: { xf: 0.500, yf: 0.848, sf: 2.00 },   // 2.12 ÷ 1.06：树本身长高了 6%，这里收回来，构图不变
    /* 两个人永远站在最前面、最大 */
    couple: [
      { g: 'm', xf: 0.454, yf: 0.964, sf: 3.55, dir: 0 },
      { g: 'f', xf: 0.545, yf: 0.970, sf: 3.46, dir: 0 }
    ],
    /* 居民：左右分开、高低错落、朝向不同，y 越小越远 */
    cast: [
      { id: 'carpenter', xf: 0.166, yf: 0.938, sf: 2.54, dir: 0 },
      { id: 'postman', xf: 0.248, yf: 0.866, sf: 2.24, dir: 0 },
      { id: 'baker', xf: 0.334, yf: 0.922, sf: 2.46, dir: 3 },
      { id: 'barista', xf: 0.666, yf: 0.870, sf: 2.22, dir: 0 },
      { id: 'shepherd', xf: 0.746, yf: 0.930, sf: 2.50, dir: 2 },
      { id: 'elf', xf: 0.822, yf: 0.906, sf: 2.40, dir: 0 },
      { id: 'snowman', xf: 0.896, yf: 0.952, sf: 2.62, dir: 0 }
    ]
  };

  function finK(H) { return H / 1080; }
  function finTreeY(H) { return H * FIN.tree.yf; }

  var FIN_CAST_DELAY = 420;
  var FIN_GATHER_AT = 2100;
  var FIN_TALK_AT = FIN_GATHER_AT + FIN_CAST_DELAY * 7 + 520;
  /* 从这一句开始，天上就该有雪橇了。跳着看（管理员/调试）也不会漏。 */
  var FIN_SANTA_BEAT = 6;

  var FIN_BEATS = [
    { who: '', text: '平安夜。小镇的灯，一盏一盏亮了起来。' },
    { who: '', text: '这棵树，是你们两个人一起、一天一天养出来的。' },
    { who: '邮差 · 阿信', text: '这一年，你们把许多远方的故事寄到了这里。', fire: 1 },
    { who: '面包师 · 麦香', text: '以后每一次回来，炉子里都会有刚出炉的面包等着你们。' },
    { who: '牧羊女 · 小禾', text: '不管走到多远，都别忘了——这儿还有一群羊在等你们。' },
    { who: '老木匠 · 老鲁', text: '慢慢走，慢慢看。下一段路，也会是好木头。' },
    { who: '咖啡店老板娘', text: '两杯热可可，加双份棉花糖。窗边的位置永远给你们留着。' },
    { who: '小精灵', text: '今晚我画进本子里了。明年翻开，还是这么亮。' },
    { who: '雪人先生', text: '这么亮的天……我可能得化一点。但为了今晚，值。' },
    { who: 'Charles', text: '原来我们已经一起走了这么远。', fire: 2 },
    { who: 'Julie', text: '以后也一起去看看更多地方吧。', fire: 2, santa: true },
    { who: '', text: '愿我们的下一站，也一路顺利。', fire: 3 },
    { who: '', text: '愿我们在冰岛，看见极光。', fire: 3 },
    { who: '', text: '下一站，冰岛。', big: true, fire: 3 },
    { who: '', text: '愿我们一路顺利，\n也一直一起走下去。', big: true, fire: 3 }
  ];

  /* 烟花位置（1920×1080 基准）：全部在树冠以上或树的两侧，
     不会盖住树顶的星，也不会盖住任何一张脸。 */
  var FIN_FW_SLOTS = [
    [286, 196], [520, 128], [742, 86], [1188, 98], [1444, 150], [1712, 214],
    [216, 306], [1656, 322], [402, 240], [1520, 274], [966, 68], [660, 168]
  ];
  var FIN_FW_COLORS = ['255,214,140', '255,158,150', '168,240,206', '176,208,255', '222,186,255'];

  var finState = null;
  var finBGCache = {};

  /* ---------- 舞台：静态层 ---------- */
  function finSky(ctx, W, H) {
    var g = ctx.createLinearGradient(0, 0, 0, H * 0.80);
    g.addColorStop(0, '#04060e');
    g.addColorStop(0.32, '#070c1c');
    g.addColorStop(0.58, '#0e1a34');
    g.addColorStop(0.82, '#182c4e');
    g.addColorStop(1, '#264568');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    var hz = ctx.createRadialGradient(W * 0.5, H * FIN.horizon, 30, W * 0.5, H * FIN.horizon, W * 0.60);
    hz.addColorStop(0, 'rgba(126,138,212,.17)');
    hz.addColorStop(0.55, 'rgba(88,100,166,.07)');
    hz.addColorStop(1, 'rgba(60,70,130,0)');
    ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);

    var rnd = seeded(4021);
    for (var i = 0; i < 300; i++) {
      var sx = rnd() * W, sy = Math.pow(rnd(), 0.86) * H * 0.70;
      var pick = rnd();
      var r = pick > 0.965 ? 2.7 : (pick > 0.86 ? 1.85 : 1.15);
      var a = 0.16 + rnd() * 0.74;
      var tint = pick > 0.9 ? '255,242,216' : '222,236,255';
      ctx.fillStyle = 'rgba(' + tint + ',' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill();
      if (pick > 0.965) {
        ctx.strokeStyle = 'rgba(' + tint + ',' + (a * 0.42).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - 9, sy); ctx.lineTo(sx + 9, sy);
        ctx.moveTo(sx, sy - 9); ctx.lineTo(sx, sy + 9);
        ctx.stroke();
      }
    }

    ctx.save();
    ctx.translate(W * 0.44, H * 0.23); ctx.rotate(-0.40);
    var mw = ctx.createLinearGradient(0, -96, 0, 96);
    mw.addColorStop(0, 'rgba(150,170,230,0)');
    mw.addColorStop(0.5, 'rgba(150,170,230,.05)');
    mw.addColorStop(1, 'rgba(150,170,230,0)');
    ctx.fillStyle = mw; ctx.fillRect(-W, -96, W * 2, 192);
    ctx.restore();

    var mx = W * 0.826, my = H * 0.120, mr = 42 * finK(H);
    var halo = ctx.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 5.6);
    halo.addColorStop(0, 'rgba(228,234,255,.24)');
    halo.addColorStop(0.42, 'rgba(198,212,255,.07)');
    halo.addColorStop(1, 'rgba(180,196,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(mx, my, mr * 5.6, 0, 7); ctx.fill();
    var mg = ctx.createRadialGradient(mx - 13, my - 13, 5, mx, my, mr);
    mg.addColorStop(0, '#fffdf3'); mg.addColorStop(1, '#e3e1d3');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(208,206,192,.46)';
    ctx.beginPath(); ctx.arc(mx - mr * 0.28, my - mr * 0.18, mr * 0.22, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + mr * 0.26, my + mr * 0.28, mr * 0.15, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + mr * 0.12, my - mr * 0.44, mr * 0.11, 0, 7); ctx.fill();
  }

  function finClouds(ctx, W, H) {
    var rnd = seeded(7717);
    for (var i = 0; i < 5; i++) {
      var cx = rnd() * W, cy = H * (0.07 + rnd() * 0.28);
      var cw = 260 + rnd() * 400, ch = 24 + rnd() * 20;
      var cg = ctx.createLinearGradient(cx - cw / 2, cy, cx + cw / 2, cy);
      cg.addColorStop(0, 'rgba(96,112,168,0)');
      cg.addColorStop(0.5, 'rgba(122,138,198,' + (0.045 + rnd() * 0.05).toFixed(3) + ')');
      cg.addColorStop(1, 'rgba(96,112,168,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.ellipse(cx, cy, cw / 2, ch, 0, 0, 7); ctx.fill();
    }
  }

  function finMountains(ctx, W, H) {
    var base = H * FIN.horizon;
    var K = finK(H);
    var layers = [
      { y: base - 4 * K, amt: 150 * K, col: '#16253d', snow: 'rgba(198,216,240,.15)', seed: 91 },
      { y: base + 12 * K, amt: 94 * K, col: '#0f1b2c', snow: 'rgba(190,208,232,.09)', seed: 37 }
    ];
    layers.forEach(function (L) {
      var rnd = seeded(L.seed);
      ctx.beginPath();
      ctx.moveTo(-20, base + 70);
      var x = -60;
      while (x < W + 40) {
        var w = 170 + rnd() * 250;
        var hh = L.amt * (0.42 + rnd() * 0.78);
        ctx.lineTo(x + w * 0.5, L.y - hh);
        ctx.lineTo(x + w * 0.78, L.y - hh * 0.42);
        ctx.lineTo(x + w, L.y - hh * 0.12);
        x += w;
      }
      ctx.lineTo(W + 40, base + 70);
      ctx.closePath();
      ctx.fillStyle = L.col; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = L.snow;
      ctx.fillRect(0, L.y - L.amt, W, L.amt * 0.34);
      ctx.restore();
    });
  }

  function finBuilding(ctx, id, cx, baseY, s, t) {
    var src = null;
    for (var i = 0; i < World.buildings.length; i++) {
      if (World.buildings[i].id === id) { src = World.buildings[i]; break; }
    }
    if (!src) return;
    ctx.save();
    ctx.translate(cx - (src.x + src.w / 2) * s, baseY - (src.y + src.h) * s);
    ctx.scale(s, s);
    World.drawBuilding(ctx, src, t);
    ctx.restore();
  }

  function finTown(ctx, W, H, t) {
    var base = H * FIN.horizon;
    var K = finK(H);

    var rnd = seeded(5150);
    for (var i = 0; i < 26; i++) {
      var bw = 46 + rnd() * 60, bh = 32 + rnd() * 56;
      var bx = -40 + i * (W + 80) / 26 + rnd() * 14;
      var by = base - bh * K + 14 * K;
      ctx.fillStyle = 'rgba(8,13,23,.9)';
      ctx.fillRect(bx, by, bw * K, bh * K);
      ctx.beginPath();
      ctx.moveTo(bx - 6 * K, by + 3 * K);
      ctx.lineTo(bx + bw * K / 2, by - (14 + rnd() * 12) * K);
      ctx.lineTo(bx + bw * K + 6 * K, by + 3 * K);
      ctx.closePath(); ctx.fill();
      for (var wq = 0; wq < 3; wq++) {
        if (rnd() > 0.42) {
          ctx.fillStyle = 'rgba(255,198,112,' + (0.32 + rnd() * 0.5).toFixed(3) + ')';
          ctx.fillRect(bx + (7 + wq * 16) * K, by + (11 + (wq % 2) * 13) * K, 7 * K, 8 * K);
        }
      }
    }

    finBuilding(ctx, 'cabin', 152, base + 92 * K, 0.9 * K, t);
    finBuilding(ctx, 'workshop', 430, base + 80 * K, 0.76 * K, t);
    finBuilding(ctx, 'stall', 606, base + 70 * K, 0.64 * K, t);
    finBuilding(ctx, 'station', 1116, base + 84 * K, 0.74 * K, t);
    finBuilding(ctx, 'cafe', 1338, base + 92 * K, 0.84 * K, t);
    finBuilding(ctx, 'shop', 1588, base + 84 * K, 0.8 * K, t);
    finBuilding(ctx, 'greenhouse', 1816, base + 72 * K, 0.64 * K, t);
  }

  function finGround(ctx, W, H) {
    var base = H * FIN.horizon;
    var g = ctx.createLinearGradient(0, base, 0, H);
    g.addColorStop(0, '#b9c9e3');
    g.addColorStop(0.18, '#c3d2e9');
    g.addColorStop(0.62, '#a8bcd9');
    g.addColorStop(1, '#8ba0c4');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, base + 14);
    ctx.bezierCurveTo(W * 0.22, base - 14, W * 0.42, base + 16, W * 0.56, base + 2);
    ctx.bezierCurveTo(W * 0.72, base - 12, W * 0.86, base + 14, W, base - 4);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fill();

    /* 地平线上的一层薄雾：让小镇和雪地不是硬切 */
    var fog = ctx.createLinearGradient(0, base - 30, 0, base + 80);
    fog.addColorStop(0, 'rgba(206,222,244,.42)');
    fog.addColorStop(1, 'rgba(206,222,244,0)');
    ctx.fillStyle = fog; ctx.fillRect(0, base - 30, W, 110);

    var rnd = seeded(883);
    for (var i = 0; i < 42; i++) {
      var x = rnd() * W, y = base + 26 + Math.pow(rnd(), 0.72) * (H - base - 16);
      var rx = 46 + rnd() * 170, ry = 7 + rnd() * 19;
      ctx.fillStyle = rnd() > 0.44
        ? 'rgba(255,255,255,' + (0.09 + rnd() * 0.19).toFixed(3) + ')'
        : 'rgba(122,150,192,' + (0.05 + rnd() * 0.10).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill();
    }

    var warm = ctx.createRadialGradient(W * 0.5, base + (H - base) * 0.46, 40, W * 0.5, base + (H - base) * 0.46, 560);
    warm.addColorStop(0, 'rgba(255,206,132,.16)');
    warm.addColorStop(1, 'rgba(255,206,132,0)');
    ctx.fillStyle = warm; ctx.fillRect(0, base, W, H - base);
  }

  function finTree(ctx, H, t) {
    var ty = finTreeY(H);
    var tx = FIN.tree.xf * FIN_W;
    var ts = FIN.tree.sf * finK(H);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(ts, ts);
    ctx.translate(-tx, -ty);
    World.drawBigTree(ctx, { x: tx, y: ty }, 5, t);
    ctx.restore();
  }

  /* ---------- 树上那层「比小镇里更华丽」的装饰 ----------
   * 小镇里的树是给白天看的，挂在世界坐标里、尺寸固定；
   * 结局这棵要当成整张画的主角，所以在 drawBigTree 之上再叠：
   *   60 颗暖灯泡（沿每一层枝扇的表面挂） + 冰晶垂饰 + 三层蝴蝶结。
   * 位置用固定种子算，只跟画布高度有关，所以实时画面和最后那张照片
   * 挂的是同一批位置，不会一个样一个样。
   * ------------------------------------------------------------ */
  var finBulbCache = {};

  function finBulbPts(H) {
    var key = H | 0;
    if (finBulbCache[key]) return finBulbCache[key];
    /* v4.5：6 阶的树比原来高 6%，灯泡必须按「实际画出来的那套层」算，
       否则 60 颗灯会整体缩进树里。 */
    var T = (window.World && World.tiersFor) ? World.tiersFor(5) : ((window.World && World.tiers) || []);
    var ty = finTreeY(H), tx = FIN.tree.xf * FIN_W, ts = FIN.tree.sf * finK(H);
    var out = [], s = 20261225;
    function rr() { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }
    for (var ti = 0; ti < T.length; ti++) {
      var L = T[ti], n = [13, 11, 9, 8, 6][ti] || 8;
      for (var k = 0; k < n; k++) {
        /* u 横向 -1~1（留 10% 余量不挂到枝尖外），v 纵向往下 */
        var u = -0.94 + 1.88 * ((k + 0.5) / n) + (rr() - 0.5) * 0.14;
        var v = 0.18 + 0.70 * rr();
        var r = L.half * (0.13 + 0.87 * v);
        out.push({
          x: tx + r * u * 0.88 * ts,
          y: ty + (L.apex + (L.bot - L.apex) * v) * ts,
          r: (1.45 + rr() * 0.8) * ts,
          ph: rr() * 6.283,
          sp: 0.55 + rr() * 0.95
        });
      }
    }
    finBulbCache[key] = out;
    return out;
  }

  /* 蝴蝶结：两片环 + 中间结 + 两条飘带（小尺寸下也要能看出是结） */
  function finBow(ctx, x, y, s, col) {
    ctx.save();
    ctx.translate(x, y);

    /* 两条垂下来的飘带 */
    ctx.fillStyle = col;
    [-1, 1].forEach(function (sg) {
      ctx.beginPath();
      ctx.moveTo(sg * s * 0.10, s * 0.18);
      ctx.quadraticCurveTo(sg * s * 0.86, s * 0.86, sg * s * 1.06, s * 1.42);
      ctx.lineTo(sg * s * 0.62, s * 1.30);
      ctx.quadraticCurveTo(sg * s * 0.44, s * 0.76, -sg * s * 0.06, s * 0.40);
      ctx.closePath(); ctx.fill();
    });

    /* 两片环：先满色，再压一层暗心，看出是"环"而不是色块 */
    [-1, 1].forEach(function (sg) {
      ctx.save();
      ctx.translate(sg * s * 0.62, -s * 0.16);
      ctx.rotate(sg * 0.38);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.72, s * 0.44, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(30,10,6,.30)';
      ctx.beginPath(); ctx.ellipse(sg * s * 0.10, 0, s * 0.30, s * 0.17, 0, 0, 7); ctx.fill();
      ctx.restore();
    });

    /* 中间那个结 */
    ctx.fillStyle = 'rgba(255,238,198,.94)';
    ctx.beginPath(); ctx.arc(0, s * 0.06, s * 0.28, 0, 7); ctx.fill();
    ctx.restore();
  }

  function finTreeDecor(ctx, H) {
    /* v4.5：6 阶的树比原来高 6%，灯泡必须按「实际画出来的那套层」算，
       否则 60 颗灯会整体缩进树里。 */
    var T = (window.World && World.tiersFor) ? World.tiersFor(5) : ((window.World && World.tiers) || []);
    if (!T.length) return;
    var K = finK(H);
    var ty = finTreeY(H), tx = FIN.tree.xf * FIN_W, ts = FIN.tree.sf * K;
    /* 树局部坐标（相对树根）→ 画布坐标：y 是负数往上 */
    function P(localX, localY) { return { x: tx + localX * ts, y: ty + localY * ts }; }

    /* 灯泡：先一层暖晕，再一颗实心（坐标已经是画布坐标） */
    var pts = finBulbPts(H);
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var gl = ctx.createRadialGradient(p.x, p.y, 0.4, p.x, p.y, p.r * 3.0);
      gl.addColorStop(0, 'rgba(255,230,172,.26)');
      gl.addColorStop(0.45, 'rgba(255,198,112,.10)');
      gl.addColorStop(1, 'rgba(255,180,96,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fffdf4';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.86, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,226,160,.34)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.35, 0, 7); ctx.fill();
    }

    /* 冰晶垂饰：挂每一层下沿，越往下越大 */
    var cs = seeded(9911);
    for (var ti = 0; ti < T.length; ti++) {
      var L = T[ti];
      var nC = ti < 3 ? 2 : 3;
      for (var c = 0; c < nC; c++) {
        var u = -0.78 + 1.56 * ((c + 0.5) / nC);
        var lx = L.half * (0.55 + 0.3 * cs()) * u * 0.9;
        var ly = L.bot - 2 + cs() * 6;
        var pt0 = P(lx, ly);
        var len = (9 + cs() * 22) * (1 - ti * 0.10) * ts;
        var gg = ctx.createLinearGradient(pt0.x, pt0.y, pt0.x, pt0.y + len);
        gg.addColorStop(0, 'rgba(198,232,255,.92)');
        gg.addColorStop(0.7, 'rgba(146,206,244,.62)');
        gg.addColorStop(1, 'rgba(120,180,230,0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.moveTo(pt0.x - 1.5 * ts, pt0.y);
        ctx.lineTo(pt0.x + 1.5 * ts, pt0.y);
        ctx.lineTo(pt0.x + 0.25 * ts, pt0.y + len);
        ctx.lineTo(pt0.x - 0.25 * ts, pt0.y + len * 0.94);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(240,250,255,.92)';
        ctx.beginPath(); ctx.arc(pt0.x, pt0.y - 0.5 * ts, 1.5 * ts, 0, 7); ctx.fill();
      }
    }

    /* 蝴蝶结：每层交界各挂两个红结 */
    [[0, '#c8402f', -0.52], [0, '#c8402f', 0.60], [2, '#b83a2a', -0.58],
     [2, '#b83a2a', 0.50], [4, '#c8402f', -0.44]].forEach(function (B) {
      var L = T[B[0]];
      if (!L) return;
      var ptb = P(L.half * B[2], L.bot - 4);
      finBow(ctx, ptb.x, ptb.y, 4.6 * ts, B[1]);
    });
  }

  function finGift(ctx, x, y, w, h, body, ribbon) {
    ctx.fillStyle = 'rgba(40,58,88,.18)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, w * 0.62, h * 0.22, 0, 0, 7); ctx.fill();
    ctx.fillStyle = body;
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(x - w / 2, y - h, w, Math.max(2, h * 0.14));
    ctx.fillStyle = ribbon;
    ctx.fillRect(x - w * 0.08, y - h, w * 0.16, h);
    ctx.beginPath(); ctx.ellipse(x - w * 0.16, y - h - 2, w * 0.13, h * 0.13, 0.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w * 0.16, y - h - 2, w * 0.13, h * 0.13, -0.4, 0, 7); ctx.fill();
  }

  function finProps(ctx, W, H, t) {
    var base = H * FIN.horizon;
    var K = finK(H);
    var tx = FIN.tree.xf * FIN_W, ty = finTreeY(H);

    var boxes = [
      [-292, 18, 76, 58, '#b3432f', '#f3e3c2'], [-232, 12, 54, 44, '#2f6b52', '#f3e3c2'],
      [-352, 10, 48, 40, '#8a5a3a', '#e8c86a'], [-176, 20, 42, 34, '#c98a3a', '#f3e3c2'],
      [286, 20, 80, 60, '#2f5f8a', '#f3e3c2'], [352, 12, 52, 46, '#b3432f', '#e8c86a'],
      [220, 14, 46, 38, '#8a5a3a', '#f3e3c2'], [402, 8, 40, 32, '#c98a3a', '#f3e3c2']
    ];
    boxes.forEach(function (b) {
      finGift(ctx, tx + b[0] * K, ty + b[1] * K, b[2] * K, b[3] * K, b[4], b[5]);
    });

    [[128, 0.95], [616, 0.82], [1300, 0.84], [1806, 0.92]].forEach(function (L) {
      World.drawLamp(ctx, { x: L[0] * K + (1 - K) * 0, y: base + 150 * L[1] * K }, t);
    });

    /* 三棵小冷杉当画框 */
    [[64, 0.95], [1858, 0.9], [1010, 0.5]].forEach(function (F) {
      var x = F[0] * K, s = F[1] * K, y = base + 150 * K;
      ctx.fillStyle = 'rgba(40,60,90,.16)';
      ctx.beginPath(); ctx.ellipse(x, y + 2, 44 * s, 9 * s, 0, 0, 7); ctx.fill();
      for (var i = 0; i < 3; i++) {
        var hh = (110 - i * 26) * s, ww = (46 - i * 11) * s;
        ctx.fillStyle = i === 0 ? '#20563a' : (i === 1 ? '#256341' : '#2b7049');
        ctx.beginPath();
        ctx.moveTo(x, y - hh);
        ctx.lineTo(x + ww, y - i * 34 * s);
        ctx.lineTo(x - ww, y - i * 34 * s);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(240,248,255,.62)';
      ctx.beginPath();
      ctx.moveTo(x, y - 110 * s);
      ctx.lineTo(x + 16 * s, y - 84 * s);
      ctx.lineTo(x - 16 * s, y - 84 * s);
      ctx.closePath(); ctx.fill();
    });

    /* 树两侧的灯串 */
    ctx.save();
    var gy1 = base + 92 * K, gy2 = base + 170 * K;
    ctx.strokeStyle = 'rgba(60,44,28,.5)'; ctx.lineWidth = 1.6 * K;
    ctx.beginPath();
    ctx.moveTo(128 * K, gy1);
    ctx.quadraticCurveTo(520 * K, gy2, tx - 240 * K, gy1);
    ctx.moveTo(1806 * K, gy1);
    ctx.quadraticCurveTo(1420 * K, gy2, tx + 240 * K, gy1);
    ctx.stroke();
    for (var i = 1; i < 16; i++) {
      var u = i / 16;
      [[128, 520, (tx - 240 * K) / K], [1806, 1420, (tx + 240 * K) / K]].forEach(function (P) {
        var x2 = ((1 - u) * (1 - u) * P[0] + 2 * (1 - u) * u * P[1] + u * u * P[2]) * K;
        var y2 = ((1 - u) * (1 - u) * (gy1 / K) + 2 * (1 - u) * u * (gy2 / K) + u * u * (gy1 / K)) * K;
        var tw = 0.45 + 0.55 * Math.abs(Math.sin(i * 1.7 + P[0]));
        ctx.fillStyle = 'rgba(255,' + (206 + i * 3) + ',140,' + (0.55 * tw + 0.25).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(x2, y2, (2.4 + tw * 1.2) * K, 0, 7); ctx.fill();
      });
    }
    ctx.restore();

    /* 雪地上零星的脚印 */
    ctx.fillStyle = 'rgba(120,148,190,.28)';
    var rnd2 = seeded(6621);
    for (var f = 0; f < 18; f++) {
      var fxp = (300 + rnd2() * 1320) * K;
      var fyp = base + (140 + rnd2() * 240) * K;
      ctx.beginPath(); ctx.ellipse(fxp, fyp, 4.2 * K, 2.4 * K, 0.2, 0, 7); ctx.fill();
    }
  }

  function finCouple(ctx, H, t) {
    var K = finK(H);
    FIN.couple.forEach(function (c) {
      var slot = c.g === 'm' ? 'a' : 'b';
      var opt = Object.assign({}, CHAROPT[slot], { outfit: getOutfit(slot, 'winter') });
      ctx.save();
      ctx.translate(c.xf * FIN_W, c.yf * H);
      ctx.scale(c.sf * K, c.sf * K);
      Sprites.drawCharacter(ctx, 0, 0, c.dir, 0, opt, false, 780);
      ctx.restore();
    });
    var cx = (FIN.couple[0].xf + FIN.couple[1].xf) / 2 * FIN_W;
    var ly = FIN.couple[0].yf * H;
    var gl = ctx.createRadialGradient(cx, ly, 10, cx, ly, 320 * K);
    gl.addColorStop(0, 'rgba(255,214,150,.15)');
    gl.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.ellipse(cx, ly + 6, 320 * K, 96 * K, 0, 0, 7); ctx.fill();
  }

  function finVignette(ctx, W, H) {
    var vg = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.30, W / 2, H * 0.50, H * 0.94);
    vg.addColorStop(0, 'rgba(4,8,18,0)');
    vg.addColorStop(1, 'rgba(4,8,18,.60)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  function finBG(W, H) {
    var key = W + 'x' + H + '|' + getOutfit('a', 'winter') + getOutfit('b', 'winter');
    if (finBGCache[key]) return finBGCache[key];
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    finSky(g, W, H);
    finClouds(g, W, H);
    finMountains(g, W, H);
    finTown(g, W, H, 0);
    finGround(g, W, H);
    finTree(g, H, 0);
    finTreeDecor(g, H);
    finProps(g, W, H, 0);
    finCouple(g, H, 0);
    finBGCache[key] = cv;
    return cv;
  }

  /* ---------- 舞台：动态层 ---------- */
  function finDrawNpc(ctx, id, x, y, s, dir, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    if (id === 'snowman') Sprites.drawSnowman(ctx, 0, 0, t);
    else if (id === 'elf') Sprites.drawElf(ctx, 0, 0, t, 0);
    else if (id === 'barista') Sprites.drawBarista(ctx, 0, 0, t, 0);
    else Sprites.drawVillager(ctx, 0, 0, t, id, 0);
    ctx.restore();
  }

  function finDeer(ctx, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    var run = Math.sin(t / 150);
    ctx.fillStyle = '#181326';
    ctx.strokeStyle = '#181326';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.6;
    [[-9, run], [-4, -run], [7, -run], [12, run]].forEach(function (L) {
      ctx.beginPath();
      ctx.moveTo(L[0], 3);
      ctx.lineTo(L[0] + L[1] * 5, 13);
      ctx.stroke();
    });
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 6.4, 0, 0, 7); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(11, -2); ctx.lineTo(19.5, -12); ctx.lineTo(23.5, -10); ctx.lineTo(14.5, 2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(22.5, -13, 5.4, 3.4, -0.42, 0, 7); ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(23.5, -16); ctx.lineTo(25.5, -24);
    ctx.moveTo(25.5, -24); ctx.lineTo(29.5, -26);
    ctx.moveTo(25.5, -24); ctx.lineTo(22.5, -28);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, -4); ctx.lineTo(-18.5, -8.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,214,150,.26)';
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 6.4, 0, Math.PI * 1.04, Math.PI * 1.72); ctx.stroke();
    ctx.restore();
  }

  function finSleigh(ctx, cx, cy, s, t) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);

    for (var i = 1; i <= 20; i++) {
      var tx = -48 - i * 30;
      var ty = Math.sin(t / 700 + i * 0.55) * 4 + i * 1.5;
      var k = 1 - i / 21;
      ctx.fillStyle = 'rgba(255,238,196,' + (0.26 * k).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(tx, ty, 1.0 + k * 1.9, 0, 7); ctx.fill();
    }

    finDeer(ctx, -34, 1, t);
    finDeer(ctx, -80, 7, t + 60);

    ctx.strokeStyle = 'rgba(244,226,196,.35)';
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(2, -8); ctx.lineTo(-36, -1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, -6); ctx.lineTo(-78, 6); ctx.stroke();

    ctx.strokeStyle = '#8a6a3f'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-16, 12); ctx.lineTo(11, 12);
    ctx.quadraticCurveTo(20, 12, 16, 5);
    ctx.stroke();
    ctx.fillStyle = '#a83226';
    ctx.beginPath();
    ctx.moveTo(-16, 10); ctx.lineTo(-16, -2);
    ctx.quadraticCurveTo(-6, -7, 6, -2);
    ctx.lineTo(14, 2); ctx.lineTo(10, 12);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,140,.72)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-16, 7.5); ctx.lineTo(12, 7.5); ctx.stroke();

    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.ellipse(-4, -12, 6.4, 7.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f6d0ae';
    ctx.beginPath(); ctx.arc(-4, -21, 4.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#f7f7f7';
    ctx.beginPath(); ctx.ellipse(-4, -18.6, 3.3, 2.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(-8.8, -23); ctx.lineTo(0.8, -23); ctx.lineTo(-4, -30.4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-4, -30.8, 1.8, 0, 7); ctx.fill();

    ctx.fillStyle = '#8a6a3e';
    ctx.beginPath(); ctx.ellipse(11, -6, 7, 8.2, 0.2, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,214,140,.55)';
    ctx.beginPath(); ctx.arc(11, -6, 2.4, 0, 7); ctx.fill();

    ctx.restore();
  }

  /* 烟花：分三层画——炸开的白心、48 根长短不一的拖尾、慢落的余烬。
     v4.4.0 第一版只有 30 根等长的细线，远看像蒲公英；这一版加了
     拖尾长度随机、长度随寿命衰减、下半圈被重力拉长，爆点才有"炸开"的感觉。 */
  function finFirework(ctx, x, y, R, col, age) {
    var p = Math.max(0, Math.min(1, age));
    var fade = Math.pow(1 - p, 1.35);
    if (fade <= 0.02) return;
    var e = 1 - Math.pow(1 - p, 2.6);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    /* 炸开那一下的一点白心：小而亮，不是一大团光斑 */
    if (p < 0.16) {
      var cf = 1 - p / 0.16;
      var cg = ctx.createRadialGradient(x, y, 1, x, y, R * 0.24);
      cg.addColorStop(0, 'rgba(255,255,246,' + (0.92 * cf).toFixed(3) + ')');
      cg.addColorStop(0.55, 'rgba(255,238,196,' + (0.32 * cf).toFixed(3) + ')');
      cg.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(x, y, R * 0.24, 0, 7); ctx.fill();
    }

    var N = 48;
    ctx.lineCap = 'round';
    for (var i = 0; i < N; i++) {
      var a = (i / N) * Math.PI * 2 + (i % 6) * 0.087;
      var d = R * e * (0.52 + ((i * 37) % 19) / 26);
      var px = x + Math.cos(a) * d;
      var py = y + Math.sin(a) * d + p * p * R * 0.34;
      var tail = R * 0.17 * fade + 3;
      var al = Math.min(1, (0.28 + 0.62 * fade) * (0.72 + ((i * 13) % 9) / 24));
      ctx.strokeStyle = 'rgba(' + col + ',' + al.toFixed(3) + ')';
      ctx.lineWidth = 2.9 * fade + 0.7;
      ctx.beginPath();
      ctx.moveTo(px - Math.cos(a) * tail, py - Math.sin(a) * tail);
      ctx.lineTo(px, py);
      ctx.stroke();
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(' + col + ',' + (0.95 * fade).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(px, py, 2.0 * fade + 0.6, 0, 7); ctx.fill();
      }
    }

    /* 慢落的余烬：比主爆活得更久，落得更低 */
    for (var j = 0; j < 14; j++) {
      var a2 = (j / 14) * Math.PI * 2 + 0.4;
      var d2 = R * e * (0.30 + ((j * 23) % 11) / 22);
      var ex = x + Math.cos(a2) * d2;
      var ey = y + Math.sin(a2) * d2 + p * p * R * 0.78;
      ctx.fillStyle = 'rgba(255,246,222,' + (0.5 * fade * fade).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(ex, ey, 1.3, 0, 7); ctx.fill();
    }

    /* 一层很淡的色雾，让爆点在夜里"亮"起来 */
    var gg = ctx.createRadialGradient(x, y, R * 0.10, x, y, R * (0.35 + e * 0.55));
    gg.addColorStop(0, 'rgba(' + col + ',' + (0.09 * fade).toFixed(3) + ')');
    gg.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(x, y, R * (0.35 + e * 0.55), 0, 7); ctx.fill();
    ctx.restore();
  }

  function finSnow(ctx, W, H, t, n) {
    for (var i = 0; i < n; i++) {
      var s1 = ((i * 73.13) % 100) / 100;
      var s2 = ((i * 37.71) % 100) / 100;
      var x = (s1 * (W + 140) + t * (0.008 + s2 * 0.014) + Math.sin(t / 1400 + i) * 20) % (W + 140) - 70;
      var y = (s2 * H + t * (0.026 + s1 * 0.030)) % H;
      var r = 1.2 + s1 * 2.5;
      var a = 0.26 + s2 * 0.5;
      ctx.fillStyle = 'rgba(255,250,238,' + a.toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }

  /* 主绘制：o = {t, shown, appear[], santa, fx[], twinkle} */
  function paintFinale(ctx, W, H, o) {
    o = o || {};
    var t = o.t || 0;
    var K = finK(H);
    var shown = (o.shown === undefined) ? FIN.cast.length : o.shown;

    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(finBG(W, H), 0, 0);

    /* 开场那两秒：像有人一盏一盏把灯拧开——先压一层暗，再慢慢褪掉 */
    var rise = Math.min(1, t / 2200);
    if (rise < 1) {
      ctx.fillStyle = 'rgba(3,6,12,' + (0.82 * (1 - rise)).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    if (o.twinkle !== false) {
      for (var s = 0; s < 44; s++) {
        var sx = ((s * 317.7) % 100) / 100 * W;
        var sy = (((s * 197.3) % 100) / 100) * H * 0.52;
        var a2 = (0.22 + 0.5 * Math.abs(Math.sin(t / 900 + s * 1.7))) * (s % 7 === 0 ? 1.5 : 1);
        ctx.fillStyle = 'rgba(232,242,255,' + a2.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(sx, sy, (s % 11 === 0 ? 2.1 : 1.3) * K, 0, 7); ctx.fill();
      }
    }

    /* 树顶那圈会呼吸的暖光：树本身是烘死的，这层让它"活着" */
    var puls = 0.09 + 0.05 * Math.sin(t / 2200);
    var ttx = FIN.tree.xf * FIN_W, tty = finTreeY(H);
    var tg = ctx.createRadialGradient(ttx, tty - 300 * K, 40, ttx, tty - 300 * K, 520 * K);
    tg.addColorStop(0, 'rgba(255,214,140,' + puls.toFixed(3) + ')');
    tg.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H);

    for (var b = 0; b < 18; b++) {
      var ba = (b * 2.399) % (Math.PI * 2);
      var br = (80 + ((b * 61) % 150)) * K;
      var bx = ttx + Math.cos(ba) * br * 1.15;
      var by = tty - 300 * K + Math.sin(ba) * br * 1.55;
      var blink = 0.30 + 0.70 * Math.abs(Math.sin(t / 620 + b * 1.7));
      ctx.fillStyle = 'rgba(255,236,178,' + (0.5 * blink).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(bx, by, (1.4 + blink * 1.6) * K, 0, 7); ctx.fill();
    }

    /* 挂满树的灯泡在呼吸：静态层里已经挂好，这里只叠会变亮的那一层 */
    var bps = finBulbPts(H);
    for (var q = 0; q < bps.length; q++) {
      var bb = bps[q];
      var tw = Math.abs(Math.sin(t / (900 * bb.sp) + bb.ph));
      if (tw < 0.40) continue;
      ctx.fillStyle = 'rgba(255,232,176,' + (0.34 * (tw - 0.40) / 0.60).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(bb.x, bb.y, bb.r * (1.5 + tw * 1.6), 0, 7); ctx.fill();
    }

    /* 全镇的人：一个个从雪地里"站起来" */
    for (var i = 0; i < Math.min(shown, FIN.cast.length); i++) {
      var c = FIN.cast[i];
      var ap = (o.appear && o.appear[i] !== undefined) ? o.appear[i] : 1;
      ap = Math.max(0, Math.min(1, ap));
      if (ap <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = ap;
      finDrawNpc(ctx, c.id, c.xf * FIN_W, c.yf * H + (1 - ap) * 26 * K, c.sf * K, c.dir, t);
      ctx.restore();
    }

    if (o.santa) finSleigh(ctx, o.santa.x, o.santa.y, (o.santa.s || 1.15) * K, t);

    if (o.fx) {
      for (var f = 0; f < o.fx.length; f++) {
        var F = o.fx[f];
        var age = (t - F.t0) / F.dur;
        if (age < 0 || age > 1) continue;
        finFirework(ctx, F.x * K, F.y * K, F.R * K, F.col, age);
      }
    }

    finSnow(ctx, W, H, t, o.photo ? 120 : 96);
    finVignette(ctx, W, H);
    ctx.restore();
  }

  /* ============================================================
   * v4.5：双人庆典（Party）
   * ------------------------------------------------------------
   * 树亮到第 6 阶之后，**不再自动播结局**。要走完这条链路：
   *
   *   树 6 阶 + 主线就绪 + 到了圣诞夜
   *        ↓  两个人都真的在这个房间里、在线、并且站在圣诞老人身边
   *   圣诞老人给出邀请 → 「🎄 我们一起庆祝吧！开 Party 吧！」
   *        ↓  经过一次 world 事务（原子，只允许一个人启动）
   *   world.party.state = 'started' → 双方各自开演同一套完整结局
   *
   * 共享状态就放在 world.party 里（和树、背包同一个事务域，规则不变）：
   *   { state: 'idle' | 'started' | 'done', by: 'a'|'b', at: 时间, seq: 第几次, tree: 启动时的树阶 }
   * 为什么不做成独立节点：rooms/{id}/world 已经是唯一「两个人都能写、都能读」的
   * 事务域；另开一个 rooms/{id}/party 会要求改生产安全规则，本次明确不动规则。
   *
   * 「到场」怎么判定（全部用云端数据，不看按钮）：
   *   slots[x].uid 存在   （这个位置真的有人坐过、初始化过）
   *   presence[x] === true（在线，onDisconnect 会在断开时清掉）
   *   slots[x].pos 存在、indoor 为 0（人在小镇里，不在地图/室内）
   *   与圣诞老人的距离 < PARTY_R
   * 本机自己的坐标用实时位置兜底（还没发布过 pos 时不至于卡住）。
   *
   * 已知边界（写在报告里）：前端判定终究是前端，链接即钥匙的信任模型没变；
   * 这里做的是「让正常玩家不可能误触发 / 单人触发 / 重复触发」，
   * 不是防改代码的人。
   * ============================================================ */
  var PARTY_R = 260;
  var PARTY_GO_TEXT = '🎄 我们一起庆祝吧！开 Party 吧！';

  function partyOf() {
    var w = curWorld() || {};
    return (w.party && typeof w.party === 'object') ? w.party : {};
  }
  function partyState() {
    var s = partyOf().state;
    return (s === 'started' || s === 'done') ? s : 'idle';
  }
  /* 「庆典准备就绪」= 树到顶 + 主线走到最后（quest.step>=6，即十章全过） */
  function partyFestivalReady() {
    if (S.ended) return false;
    return treeStage() >= TREE_STAGE_MAX && S.quest.step >= 6;
  }
  /* 圣诞夜那天才开演（和原来一样；管理员 / ?dev=1 的门照旧放开） */
  function partyDayOk() { return endingUnlocked(); }

  function santaNpc() {
    var list = (window.World && World.npcs) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === 'santa') return list[i];
    return null;
  }

  function attendOf(slot) {
    var d = S.data || {};
    var sl = d.slots && d.slots[slot];
    var santa = santaNpc();
    if (!sl || !sl.uid) return { ok: false, why: 'noslot' };
    if (!(d.presence && d.presence[slot])) return { ok: false, why: 'offline' };
    var pos = sl.pos;
    if (!pos || typeof pos.x !== 'number') {
      /* 刚进房间还没发布坐标：只有自己的位置可以用实时坐标兜底 */
      if (slot === S.mySlot) pos = { x: S.self.x, y: S.self.y, indoor: S.interId || (S.mapId ? 1 : 0) };
      else return { ok: false, why: 'nopos' };
    }
    if (pos.indoor) return { ok: false, why: 'elsewhere', where: pos.indoor };
    if (!santa) return { ok: false, why: 'nosanta' };
    var dist = Math.sqrt(Math.pow(pos.x - santa.x, 2) + Math.pow(pos.y - santa.y, 2));
    if (dist > PARTY_R) return { ok: false, why: 'far', dist: Math.round(dist) };
    return { ok: true, dist: Math.round(dist) };
  }
  function partyCrowd() {
    var a = attendOf('a'), b = attendOf('b');
    return { ok: !!(a.ok && b.ok), a: a, b: b };
  }

  /* 对方 / 自己分别卡在哪一步 —— 只用来拼一句人话，不参与判定 */
  function attendWhyText(slot, st) {
    var nm = NAME[slot] || '对方';
    if (st.why === 'offline') return '「' + nm + '还没进小镇呢，等他/她上线。」';
    if (st.why === 'elsewhere') return '「' + nm + '还在别的地方逛——喊一声，让' + (slot === 'b' ? '她' : '他') + '回小镇。」';
    if (st.why === 'far') return '「' + nm + '在小镇的另一头，约个地方：圣诞老人这儿就好。」';
    if (st.why === 'nopos' || st.why === 'noslot') return '「' + nm + '那边还没坐稳，稍等一下。」';
    return '';
  }

  /* 和圣诞老人说话：满足条件就走庆典流程，否则交回普通对话 */
  function talkSanta() {
    var st = partyState();
    var w = curWorld() || {};
    if (st === 'started' && !S.ended) { openPartyPanel('live'); return true; }
    if (st === 'done' || (w && w.ended)) { openPartyPanel('done'); return true; }
    if (!partyFestivalReady()) return false;
    if (!partyDayOk()) { openPartyPanel('soon'); return true; }
    openPartyPanel(partyCrowd().ok ? 'ready' : 'wait');
    return true;
  }

  function openPartyPanel(mode) {
    var panel = $('#party-panel');
    if (!panel) return;
    var say = $('#party-say'), go = $('#party-go'), later = $('#party-later'), head = $('#party-head');
    var c = partyCrowd();
    var lines = [];
    var goText = PARTY_GO_TEXT, goOn = false, laterText = '我们再准备一下';

    if (mode === 'ready') {
      lines = [
        '哇！看看这棵闪闪发光的圣诞树！你们一起努力的成果真棒。',
        '小镇的朋友们都准备好了。今天是属于你们的圣诞节！',
        '那么……你们准备好一起庆祝了吗？'
      ];
      goOn = true;
    } else if (mode === 'wait') {
      lines = ['庆典马上就要开始啦！我们再等等另一位朋友吧。'];
      if (c.a.ok && !c.b.ok) lines.push(attendWhyText('b', c.b));
      else if (c.b.ok && !c.a.ok) lines.push(attendWhyText('a', c.a));
      else { lines.push(attendWhyText('a', c.a)); lines.push(attendWhyText('b', c.b)); }
      lines.push('两个人都站到我身边来，我这儿的花环就等着你们了。');
      goOn = false;
      laterText = '好，我们再等等';
    } else if (mode === 'soon') {
      var dleft = daysToChristmas();
      lines = [
        '树已经全亮啦——灯都点到最后一个了。',
        '不过庆典要在圣诞夜那晚才开始。还有 ' + Math.max(0, dleft) + ' 天，别急。',
        '到时候你和 ' + NAME[S.otherSlot] + ' 一起到我这儿来，跟我说一声「开 Party 吧」，我们就开始。'
      ];
      laterText = '好，到时候再来';
    } else if (mode === 'live') {
      lines = [
        '庆典已经开始了——你们按下那个按钮的时候，雪就落下来了。',
        '要不要接着看？'
      ];
      goText = '▶️ 继续刚才的庆典';
      goOn = true;
      laterText = '先在镇上走走';
    } else {  // done
      lines = [
        '那一晚的雪，到现在还没化呢。',
        '照片你们留着了吧？想再看一眼，随时到我这儿来坐坐。'
      ];
      laterText = '好';
    }

    if (head) head.textContent = '🎅 圣诞老人';
    if (say) {
      say.innerHTML = lines.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('');
    }
    if (go) {
      go.textContent = goText;
      go.classList.toggle('hidden', !goOn);
      go.disabled = !goOn;
      go.dataset.mode = mode;
    }
    if (later) later.textContent = laterText;
    panel.classList.remove('hidden');
    pause();
  }

  /* 真正按下「开 Party」：先复核一次双人到场，再用**一次云端事务**把状态从
     idle 推到 started。两个人同时按，只有一个人能 commit 成功。

     这里故意不走 mutate()：mutate 在事务失败时会降级成「只写本机」，
     而庆典是两个人的事——让某一边在本地自己开一场，等于把双人条件绕过去了。
     所以这里直连 worldTransact，失败就明确失败。 */
  function startParty() {
    var c = partyCrowd();
    if (!partyFestivalReady()) { openPartyPanel('soon'); toast('树还没全亮，再等等 🎄', 3000); return; }
    if (!partyDayOk()) { openPartyPanel('soon'); return; }
    if (!c.ok) { openPartyPanel('wait'); toast('还差一个人到场，再等等', 3200); return; }
    if (!S.backend || !S.backend.worldTransact) { toast('还没连上云端，庆典开不了', 3200); return; }

    var go = $('#party-go');
    if (go) { go.disabled = true; go.textContent = '正在点灯…'; }
    function restore() { if (go) { go.disabled = false; go.textContent = PARTY_GO_TEXT; } }

    S.backend.worldTransact(function (w) {
      w = w || {};
      /* 原子闸门：已经开过 / 已经结束 → 放弃这次写入（committed=false） */
      if (w.party && (w.party.state === 'started' || w.party.state === 'done')) return undefined;
      w.party = w.party || {};
      w.party.state = 'started';
      w.party.by = S.mySlot;
      w.party.at = Date.now();
      w.party.seq = (w.party.seq || 0) + 1;
      w.party.tree = (typeof w.treeStage === 'number') ? w.treeStage : 0;
      return w;
    }).then(function (r) {
      restore();
      var committed = !!(r && r.committed);
      /* 诊断用：事务到底提交没提交、云端那一次读到的发起人是谁 */
      S.partyDbg = {
        committed: committed, mine: S.mySlot,
        dbBy: (r && r.value && r.value.party && r.value.party.by) || null,
        dbSeq: (r && r.value && r.value.party && r.value.party.seq) || 0,
        dbState: (r && r.value && r.value.party && r.value.party.state) || 'idle'
      };
      if (committed) {
        var seq = (r.value && r.value.party && r.value.party.seq) || 0;
        S.partyBase = 'started';
        beginPartyFinale(seq);
        return;
      }
      /* 对方手快一步：跟着进同一场庆典，不算失败 */
      if (partyState() === 'started') {
        S.partyBase = 'started';
        beginPartyFinale(partyOf().seq || 0);
        toast('🎉 ' + NAME[S.otherSlot] + ' 已经按下开始了——一起看吧！', 3600);
      } else {
        toast('这场庆典已经结束过了。', 3600);
        openPartyPanel('done');
      }
    }).catch(function () {
      restore();
      /* 事务被云端拒绝 / 网络断开：状态没变，按钮还在，重试就行 */
      toast('⚠️ 没能写进云端：庆典要在同一个房间里、两个人都联网才能开始，检查网络后再按一次', 5200);
    });
  }

  /* 刷新 / 重进房间后，不自动重放；由玩家在圣诞老人那儿点「继续」 */
  function resumeParty() {
    if (partyState() !== 'started') { openPartyPanel('done'); return; }
    beginPartyFinale(partyOf().seq || 0);
  }

  function beginPartyFinale(seq) {
    closeAllPanelsSilent();
    S.partyPlayed = seq;
    if (S.ending || S.ended) return;
    S.paused = false;
    startEnding();
  }

  /* 云端状态变化：只有「没开始 → 已开始」这个跃迁会自动开演。
     第一次拿到存档只记基线（S.partyBase === null），不触发任何演出，
     所以刷新 / 重新进房不会把整段结局再放一遍。 */
  function syncPartyState(w) {
    if (!w || !S.active) return;
    var p = w.party || {};
    var st = (p.state === 'started' || p.state === 'done') ? p.state : 'idle';
    var seq = p.seq || 0;
    if (S.partyBase === null || S.partyBase === undefined) {
      S.partyBase = st;
      S.partyPlayed = seq;
      return;
    }
    if (st === 'started' && !S.ending && !S.ended && S.partyBase !== 'started' && seq !== S.partyPlayed) {
      S.partyBase = 'started';
      S.partyPlayed = seq;
      toast('🎉 庆典开始了！', 3200);
      beginPartyFinale(seq);
      return;
    }
    if (st !== S.partyBase) S.partyBase = st;
  }

  /* 只读快照：验收脚本用它判断「到底卡在哪一步」 */
  function partySnapshot() {
    var c = partyCrowd();
    var p = document.getElementById('party-panel');
    var go = document.getElementById('party-go');
    return {
      ready: partyFestivalReady(), dayOk: partyDayOk(), state: partyState(),
      crowdOk: !!c.ok, a: c.a, b: c.b,
      tree: treeStage(), step: S.quest.step,
      ending: !!S.ending, ended: !!S.ended,
      seq: partyOf().seq || 0, by: partyOf().by || null,
      dbg: S.partyDbg || null,
      base: S.partyBase, played: S.partyPlayed,
      panelOpen: !!(p && !p.classList.contains('hidden')),
      say: (document.getElementById('party-say') || {}).textContent || '',
      goText: (go && go.textContent) || '',
      goHidden: !!(go && go.classList.contains('hidden')),
      goDisabled: !!(go && go.disabled),
      adminPreview: !!S.adminPreview
    };
  }

  /* ---------- 结局流程 ---------- */
  var FIN_TALK_HINT = '轻触继续 ▸';

  function startEnding() {
    if (S.ending || S.ended) return;   // 只允许启动一次：重复点击 / 双端同时触发都不会来第二遍
    closeAllPanelsSilent();
    S.ending = { t: 0 };
    S.photo = false;
    S.interId = null;
    S.paused = true;
    if (S.quest.step < 6) S.quest.step = 6;
    finState = {
      t: 0, phase: 'gather', shown: 0, appear: [], beat: -1,
      fx: [], santa: null, santaT0: 0
    };
    for (var i = 0; i < FIN.cast.length; i++) finState.appear.push(0);
    var ov = $('#finale');
    if (ov) {
      ov.classList.remove('hidden');
      setTimeout(function () { ov.classList.add('show'); }, 30);
    }
    var who = $('#finale-who'), say = $('#finale-say'), hint = $('#finale-hint');
    if (who) { who.textContent = ''; who.classList.remove('on'); }
    if (say) { say.className = ''; say.textContent = ''; }
    if (hint) hint.textContent = '轻触跳过 ▸';
    finBGCache = {};
    Snd.sfx('ding');
    if (S.backend && S.backend.mode !== 'demo') {
      S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, false, 0).catch(function () { });
    }
  }

  function finAddFire(kind) {
    if (!finState) return;
    var n = kind >= 3 ? 7 : (kind === 2 ? 4 : 2);
    var pool = FIN_FW_SLOTS.slice();
    for (var i = 0; i < n && pool.length; i++) {
      var pick = (finState.beat * 7 + i * 3 + (kind * 5)) % pool.length;
      var slot = pool.splice(pick, 1)[0];
      finState.fx.push({
        x: slot[0] + ((i * 17) % 24) - 12,
        y: slot[1] + ((i * 11) % 18) - 9,
        R: (kind >= 3 ? 132 : 104) + ((i * 13) % 46),
        col: FIN_FW_COLORS[(i + finState.beat) % FIN_FW_COLORS.length],
        t0: finState.t + i * 130,
        dur: 1500 + ((i * 137) % 500)
      });
    }
  }

  function finSay(i) {
    var b = FIN_BEATS[i];
    if (!b) return;
    var who = $('#finale-who'), say = $('#finale-say'), hint = $('#finale-hint');
    if (who) {
      who.textContent = b.who || '';
      who.classList.toggle('on', !!b.who);
    }
    if (say) {
      say.classList.add('fade');
      setTimeout(function () {
        say.textContent = b.text;
        say.className = b.big ? 'big' : '';
      }, 130);
    }
    if (b.fire) finAddFire(b.fire);
    if ((b.santa || i >= FIN_SANTA_BEAT) && !finState.santa) {
      finState.santa = { x: -320, y: 96, s: 1.0 };
      finState.santaT0 = finState.t;
    }
    if (hint) {
      hint.textContent = (i >= FIN_BEATS.length - 1) ? '轻触进入合影 📸' : FIN_TALK_HINT;
    }
  }

  function finNextBeat() {
    var f = finState;
    if (!f) return;
    if (f.phase === 'gather') { f.t = Math.max(f.t, FIN_TALK_AT); return; }
    if (f.phase !== 'talk') return;
    if (f.beat >= FIN_BEATS.length - 1) { finFinish(); return; }
    f.beat++;
    finSay(f.beat);
    Snd.sfx('ding');
  }

  function finFinish() {
    var ov = $('#finale');
    if (ov) {
      ov.classList.remove('show');
      setTimeout(function () { ov.classList.add('hidden'); }, 380);
    }
    finState = null;
    S.ending = null;
    S.ended = true;
    /* 结局看过之后，共享状态一起收尾：ended 记「看过」，party.state 记「这场庆典结束了」。
       两个字段一起写，所以刷新 / 换设备都不会再开一场。
       管理员「本机预览」不写云端——它不该替正式房间收尾。 */
    if (!S.adminPreview) {
      mutate(function (w) {
        w.ended = 1;
        if (w.party && w.party.state === 'started') w.party.state = 'done';
        return w;
      });
    }
    setTimeout(function () { openPhoto({ finale: true }); }, 460);
  }

  function finTick(dt, ts) {
    var f = finState;
    if (!f) return;
    f.t += dt * 1000;
    var t = f.t;

    for (var i = 0; i < FIN.cast.length; i++) {
      var start = FIN_GATHER_AT + i * FIN_CAST_DELAY;
      var ap = (t - start) / 420;
      f.appear[i] = ap < 0 ? 0 : (ap > 1 ? 1 : ap);
      if (f.appear[i] > 0 && f.shown < i + 1) f.shown = i + 1;
    }

    if (f.phase === 'gather' && t >= FIN_TALK_AT) {
      f.phase = 'talk';
      f.beat = 0;
      finSay(0);
    }

    if (f.santa) {
      var u = Math.min(1, Math.max(0, (t - f.santaT0) / 15000));
      f.santa.x = -320 + u * (FIN_W + 640);
      f.santa.y = 96 + Math.sin(u * Math.PI * 1.35) * 14 - u * 8;
    }

    if (f.fx.length) {
      f.fx = f.fx.filter(function (b) { return (t - b.t0) < b.dur + 60; });
    }

    var cv = $('#finale-canvas');
    if (cv) {
      var g = cv.getContext('2d');
      paintFinale(g, FIN_W, FIN_H, {
        t: t, shown: f.shown, appear: f.appear, santa: f.santa, fx: f.fx
      });
    }
  }

  /* ---------- 拍照模式（按实际进度构图）---------- */
  function openPhoto(opt) {
    opt = opt || {};
    S.photo = true;
    S.photoOpt = opt;
    S.paused = true;
    hidePanelsForPhoto();
    var cv = $('#photo-canvas');
    cv.width = PHOTO_W; cv.height = PHOTO_H;
    renderPhoto(cv.getContext('2d'), PHOTO_W, PHOTO_H, opt);
    try {
      var url = cv.toDataURL('image/png');
      var img = $('#photo-img');
      img.src = url;
      img.style.display = 'block';
      cv.style.display = 'none';
      $('#photo-note').textContent = '📱 长按图片 → 「存储到照片」（1920 × 1080 横版）';
    } catch (err) {
      cv.style.display = 'block';
      $('#photo-note').textContent = '长按上方画布保存（1920 × 1080）';
    }
    var title = $('#photo-title');
    if (title) {
      title.textContent = opt.finale ? '📷 我们的最终合影'
        : (opt.mapId ? ('📷 ' + (opt.label || '旅行打卡')) : '📷 我们的圣诞合照');
    }
    $('#photo-modal').classList.remove('hidden');
  }
  function closePhoto() {
    $('#photo-modal').classList.add('hidden');
    S.photo = false;
    S.paused = false;
  }
  function savePhoto() {
    try {
      var img = $('#photo-img');
      var a = document.createElement('a');
      a.href = img.src;
      var tag = S.photoOpt && S.photoOpt.finale ? 'finale'
        : (S.photoOpt && S.photoOpt.mapId ? S.photoOpt.mapId : 'town');
      a.download = 'Omos-Christmas-Village-' + tag + '-' + Date.now() + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast('已尝试保存，若未弹出请长按图片存储 📱');
    } catch (e) {
      toast('请长按图片 → 「存储到照片」');
    }
  }
  /* 拍照时要把结局遮罩一起收起来（与普通关面板不同） */
  function hidePanelsForPhoto() {
    ['#dlg', '#tree-panel', '#outfit-modal', '#menu-panel', '#finale', '#book-panel',
      '#plot-panel', '#craft-panel', '#mem-photo', '#res-panel', '#quest-panel', '#settings-panel',
      '#party-panel'].forEach(function (s) {
      var el = $(s); if (el) el.classList.add('hidden');
    });
    syncPanelChrome();
  }

  /* ---------- 照片：统一 1920×1080 横版 ----------
   * 两种照片（小镇最终合照 / 旅行打卡）用同一套尺寸和收尾，
   * 不截手机屏幕，全部在独立画布上重画，所以人物和环境都不会被 UI 压住。
   */
  var PHOTO_W = 1920, PHOTO_H = 1080;

  /* ---------- 小镇合照：按圣诞树的阶段构图 ----------
   * v4.5：六个阶段（0 小树苗 → 5 完全点亮）。照片跟着阶段变：
   * 星星、月亮、窗灯、路灯、树下礼物、居民、雪量、树的实际大小全都不一样，
   * 所以回头看旧照片，能一眼看出「那时候小镇还没这么亮」。
   * treeS 是「再乘一次」的构图系数：树本身的几何已经随阶段长高，
   * 这里只微调取景，保证六个阶段的成像高度一阶比一阶高、又不会顶出画面。
   * 注意：最高阶段也只是「漂亮」，不能和最终结局那张比——那张另有渲染器。
   */
  var TOWN_STAGES = [
    { star: 62, moon: 0.70, win: 0.16, lamps: 2, gifts: 1, snow: 62,
      treeS: 1.05, glow: 0.10, heart: false, tag: '小树苗',
      cx: 0.452, gap: 0.050, npcs: [], line: '一切才刚刚开始' },
    { star: 92, moon: 0.80, win: 0.26, lamps: 2, gifts: 1, snow: 74,
      treeS: 1.54, glow: 0.13, heart: true, tag: '初生',
      cx: 0.456, gap: 0.054, npcs: [], line: '它开始往上长了' },
    { star: 124, moon: 0.90, win: 0.42, lamps: 2, gifts: 3, snow: 88,
      treeS: 1.70, glow: 0.18, heart: true, tag: '开始装饰',
      cx: 0.460, gap: 0.058, npcs: ['elf'], line: '树上第一次挂上了彩球' },
    { star: 160, moon: 0.98, win: 0.64, lamps: 4, gifts: 5, snow: 106,
      treeS: 1.79, glow: 0.24, heart: true, tag: '节日树形',
      cx: 0.464, gap: 0.062, npcs: ['elf', 'snowman'], line: '小镇开始有了圣诞节的样子' },
    { star: 186, moon: 1.02, win: 0.80, lamps: 4, gifts: 7, snow: 122,
      treeS: 1.86, glow: 0.29, heart: true, tag: '即将点亮',
      cx: 0.467, gap: 0.065, npcs: ['elf', 'snowman', 'postman', 'baker'], line: '灯串亮了，就差最后一点' },
    { star: 214, moon: 1.06, win: 0.94, lamps: 4, gifts: 10, snow: 138,
      treeS: 1.84, glow: 0.34, heart: true, tag: '完全点亮',
      cx: 0.470, gap: 0.068,
      npcs: ['elf', 'snowman', 'postman', 'baker', 'shepherd', 'barista'], line: '我们把这里变成了真正的圣诞小镇' }
  ];

  /* 居民站位：都在树的两侧，不挡树干、不挡脸 */
  /* 居民站位：都在树的两侧，不挡树干、不挡脸。单位是画面比例。 */
  var TOWN_CAST_POS = {
    barista:  [0.118, 0.808, 2.30],
    postman:  [0.205, 0.824, 2.44],
    baker:    [0.292, 0.800, 2.26],
    elf:      [0.762, 0.818, 2.38],
    shepherd: [0.842, 0.808, 2.26],
    snowman:  [0.902, 0.846, 1.58]
  };

  function photoNightSky(ctx, W, H, cfg) {
    cfg = cfg || TOWN_STAGES[5];
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#070e22');
    sky.addColorStop(0.45, '#132542');
    sky.addColorStop(1, '#2a4462');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    var rnd = seeded(77);
    for (var i = 0; i < cfg.star; i++) {
      var sx = rnd() * W, sy = rnd() * H * 0.62;
      var r = 1.4 + rnd() * 1.9;
      ctx.fillStyle = 'rgba(238,246,255,' + (0.12 + rnd() * 0.62).toFixed(3) + ')';
      ctx.fillRect(sx, sy, r, r);
      if (i % 17 === 0) {
        ctx.strokeStyle = 'rgba(226,238,255,' + (0.16 + rnd() * 0.2).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - 7, sy); ctx.lineTo(sx + 7, sy);
        ctx.moveTo(sx, sy - 7); ctx.lineTo(sx, sy + 7);
        ctx.stroke();
      }
    }

    /* 月亮：阶段越靠后越大越亮 */
    var m = cfg.moon;
    var mx = W - 250, my = 165, mr = 42 * m;
    var hg = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 5);
    hg.addColorStop(0, 'rgba(255,247,214,' + (0.30 * m).toFixed(3) + ')');
    hg.addColorStop(1, 'rgba(255,247,214,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(mx, my, mr * 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fbf4d8';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(226,220,190,.5)';
    ctx.beginPath(); ctx.arc(mx - mr * 0.25, my - mr * 0.22, mr * 0.22, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + mr * 0.28, my + mr * 0.26, mr * 0.15, 0, 7); ctx.fill();
  }

  /* 远山：两层不等距的山脊（不是一排等边三角形），顶上压一层冷雾 */
  function photoMountains(ctx, W, H, baseY) {
    var rows = [
      { y: baseY - 8, amp: 168, col: '#1a2b47', top: '#2d4266', seed: 331, step: 250 },
      { y: baseY + 10, amp: 112, col: '#101d31', top: '#1c2c46', seed: 877, step: 190 }
    ];
    rows.forEach(function (R) {
      var rnd = seeded(R.seed);
      var pts = [], x = -90;
      while (x < W + 140) {
        pts.push([x, R.y - R.amp * (0.30 + rnd() * 0.70)]);
        x += R.step * (0.55 + rnd() * 0.85);
      }
      ctx.beginPath();
      ctx.moveTo(-90, R.y + 120);
      ctx.lineTo(-90, R.y - 10);
      pts.forEach(function (pt) { ctx.lineTo(pt[0], pt[1]); });
      ctx.lineTo(W + 140, pts[pts.length - 1][1] * 0.5 + (R.y - 10) * 0.5);
      ctx.lineTo(W + 140, R.y + 120);
      ctx.closePath();
      ctx.fillStyle = R.col; ctx.fill();

      /* 山脊上一层薄薄的反光，让它有体积 */
      ctx.save();
      ctx.clip();
      var lg = ctx.createLinearGradient(0, R.y - R.amp, 0, R.y - R.amp * 0.35);
      lg.addColorStop(0, R.top);
      lg.addColorStop(1, 'rgba(30,48,78,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, R.y - R.amp, W, R.amp * 0.8);
      ctx.restore();
    });
  }

  /* 小镇：一栋一栋错落排开，屋顶压雪、留出间距，窗灯按阶段亮 */
  function photoTownSilhouette(ctx, W, H, baseY, cfg) {
    cfg = cfg || TOWN_STAGES[5];

    /* 镇的暖光：越往后越亮，让地平线不空 */
    var glow = ctx.createLinearGradient(0, baseY - 190, 0, baseY + 20);
    glow.addColorStop(0, 'rgba(255,188,112,0)');
    glow.addColorStop(1, 'rgba(255,188,112,' + (0.04 + cfg.glow * 0.20).toFixed(3) + ')');
    ctx.fillStyle = glow;
    ctx.fillRect(0, baseY - 190, W, 210);

    var rnd = seeded(19);
    var x = -50;
    while (x < W + 40) {
      var bw = 84 + rnd() * 96;
      var bh = 86 + rnd() * 104;
      var by = baseY - bh;

      /* 墙 */
      ctx.fillStyle = 'rgba(24,37,59,.96)';
      ctx.fillRect(x, by, bw, bh + 40);

      /* 屋顶 */
      ctx.beginPath();
      ctx.moveTo(x - 11, by + 7);
      ctx.lineTo(x + bw / 2, by - 42 - rnd() * 20);
      ctx.lineTo(x + bw + 11, by + 7);
      ctx.closePath();
      ctx.fillStyle = 'rgba(20,31,50,.96)';
      ctx.fill();
      /* 屋顶上的雪 */
      ctx.beginPath();
      ctx.moveTo(x - 11, by + 7);
      ctx.lineTo(x + bw / 2, by - 42 - rnd() * 6);
      ctx.lineTo(x + bw + 11, by + 7);
      ctx.closePath();
      ctx.fillStyle = 'rgba(206,224,248,.30)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(238,248,255,.50)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x - 11, by + 7);
      ctx.lineTo(x + bw / 2, by - 42);
      ctx.lineTo(x + bw + 11, by + 7);
      ctx.stroke();

      /* 烟囱（有的房子有） */
      if (rnd() > 0.55) {
        var chx = x + bw * (0.22 + rnd() * 0.5);
        ctx.fillStyle = 'rgba(14,22,38,.95)';
        ctx.fillRect(chx, by - 58 - rnd() * 12, 13, 30);
      }

      /* 窗灯：阶段决定亮几成 */
      var cols = Math.max(1, Math.floor(bw / 34));
      for (var wi = 0; wi < cols; wi++) {
        for (var wj = 0; wj < 2; wj++) {
          if (rnd() < cfg.win) {
            ctx.fillStyle = 'rgba(255,204,126,' + (0.40 + rnd() * 0.52).toFixed(3) + ')';
            ctx.fillRect(x + 12 + wi * 34, by + 22 + wj * 34, 15, 18);
            if (cfg.glow > 0.2) {
              ctx.fillStyle = 'rgba(255,196,110,.13)';
              ctx.fillRect(x + 12 + wi * 34 - 6, by + 22 + wj * 34 - 6, 27, 30);
            }
          }
        }
      }

      x += bw + 14 + rnd() * 46;
    }
  }

  /* 雪地：一层厚的雪坡 + 几道压出来的车辙/脚印 + 淡淡的雪堆 */
  function photoSnowGround(ctx, W, H, groundY) {
    var g = ctx.createLinearGradient(0, groundY, 0, H);
    g.addColorStop(0, '#d3e0f1');
    g.addColorStop(0.30, '#c2d3ea');
    g.addColorStop(0.76, '#a6bad9');
    g.addColorStop(1, '#8ea3c8');
    ctx.fillStyle = g;
    ctx.beginPath();
    /* 顶边做成起伏的雪堆，而不是一条直线：
       房子底部的"切口"被雪盖住，雪和镇子之间没有硬边 */
    ctx.moveTo(0, groundY + 30);
    var wob = [[0.10, -12], [0.22, 16], [0.34, -8], [0.46, 12], [0.58, -14],
               [0.70, 10], [0.82, -6], [0.92, 13]];
    wob.forEach(function (p2) {
      ctx.quadraticCurveTo(W * (p2[0] - 0.06), groundY + p2[1] * 1.3, W * p2[0], groundY + p2[1]);
    });
    ctx.quadraticCurveTo(W * 0.97, groundY - 12, W, groundY + 2);
    ctx.lineTo(W, H); ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    /* 地平线上的一层薄雾，避免雪地和镇硬切 */
    var fog = ctx.createLinearGradient(0, groundY - 26, 0, groundY + 60);
    fog.addColorStop(0, 'rgba(226,238,252,.42)');
    fog.addColorStop(1, 'rgba(226,238,252,0)');
    ctx.fillStyle = fog; ctx.fillRect(0, groundY - 26, W, 90);

    /* 雪堆：扁而软，边界不明显 */
    var rnd = seeded(451);
    for (var i = 0; i < 22; i++) {
      var x = rnd() * W, y = groundY + 50 + rnd() * (H - groundY - 60);
      var rx = 70 + rnd() * 180, ry = 10 + rnd() * 20;
      var sg = ctx.createRadialGradient(x, y, 0, x, y, rx);
      sg.addColorStop(0, 'rgba(255,255,255,.22)');
      sg.addColorStop(0.6, 'rgba(255,255,255,.10)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.translate(x, y); ctx.scale(1, ry / rx);
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(0, 0, rx, 0, 7); ctx.fill();
      ctx.restore();
    }

    /* 压出来的小路：从画面左下往镇子那边去 */
    ctx.strokeStyle = 'rgba(150,172,206,.34)';
    ctx.lineWidth = 46; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(W * 0.30, H + 20);
    ctx.quadraticCurveTo(W * 0.42, groundY + 150, W * 0.62, groundY + 46);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,208,234,.30)';
    ctx.lineWidth = 22;
    ctx.stroke();
  }

  function photoPerson(ctx, x, y, s, opt, isJulie, dir) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(40,60,90,.22)';
    ctx.beginPath(); ctx.ellipse(0, 2, 30, 7, 0, 0, 7); ctx.fill();
    Sprites.drawCharacter(ctx, 0, 0, dir === undefined ? 0 : dir, 0, opt, isJulie, 800);
    ctx.restore();
  }

  /* 居民：和小镇里用的是同一套 sprite，只是换成照片坐标 */
  function photoNpc(ctx, id, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    if (id === 'snowman') Sprites.drawSnowman(ctx, 0, 0, 800);
    else if (id === 'elf') Sprites.drawElf(ctx, 0, 0, 800, 0);
    else if (id === 'barista') Sprites.drawBarista(ctx, 0, 0, 800, 0);
    else Sprites.drawVillager(ctx, 0, 0, 800, id, 0);
    ctx.restore();
  }

  function photoGift(ctx, x, y, w, h, body, ribbon) {
    ctx.fillStyle = 'rgba(40,60,90,.18)';
    ctx.beginPath(); ctx.ellipse(x, y + 1, w * 0.6, h * 0.2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = body;
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.fillRect(x - w / 2, y - h, w, Math.max(2, h * 0.13));
    ctx.fillStyle = ribbon;
    ctx.fillRect(x - w * 0.08, y - h, w * 0.16, h);
    ctx.beginPath(); ctx.ellipse(x - w * 0.15, y - h - 1, w * 0.13, h * 0.13, 0.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w * 0.15, y - h - 1, w * 0.13, h * 0.13, -0.4, 0, 7); ctx.fill();
  }

  function photoSnowfall(ctx, W, H, n) {
    var rnd = seeded(913);
    for (var i = 0; i < n; i++) {
      var x = rnd() * W, y = rnd() * H;
      var r = 1.6 + rnd() * 3.4;
      ctx.globalAlpha = 0.25 + rnd() * 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function photoVignette(ctx, W, H) {
    var vg = ctx.createRadialGradient(W / 2, H * 0.52, H * 0.34, W / 2, H * 0.52, H * 0.86);
    vg.addColorStop(0, 'rgba(8,16,32,0)');
    vg.addColorStop(1, 'rgba(8,16,32,.52)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  /* 小镇合照：整棵树 + 两个人（+ 随阶段增多的居民）+ 小镇背景。
     构图固定成「树在右、两个人站在树前偏左、居民分列两边」，
     阶段只改亮度、树的尺寸、礼物数量、居民数量和雪量——
     所以翻旧照片一眼就能看出「那时候小镇还没这么亮」。 */
  function renderTownPhoto(ctx, W, H) {
    var stage = Math.max(0, Math.min(5, treeStage()));
    var cfg = TOWN_STAGES[stage] || TOWN_STAGES[5];
    var k = W / 1920;
    var groundY = H * 0.625;

    photoNightSky(ctx, W, H, cfg);
    photoMountains(ctx, W, H, groundY - 30);
    photoTownSilhouette(ctx, W, H, groundY + 24, cfg);
    photoSnowGround(ctx, W, H, groundY);

    /* 路灯：只在画面最外侧，不抢人物 */
    var lampXs = [0.048, 0.952, 0.104, 0.896];
    for (var li = 0; li < Math.min(cfg.lamps, lampXs.length); li++) {
      var lx = W * lampXs[li], ly = H * 0.850;
      var lg = ctx.createRadialGradient(lx, ly - 96 * k, 4, lx, ly - 96 * k, 120 * k);
      lg.addColorStop(0, 'rgba(255,214,130,' + (0.20 + cfg.glow * 0.7).toFixed(3) + ')');
      lg.addColorStop(1, 'rgba(255,214,130,0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(lx, ly - 96 * k, 120 * k, 0, 7); ctx.fill();
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(lx - 3 * k, ly - 100 * k, 6 * k, 100 * k);
      ctx.fillStyle = '#ffe08a';
      ctx.fillRect(lx - 8 * k, ly - 110 * k, 16 * k, 16 * k);
    }

    /* 树：整张照片的主角，偏右 */
    var treeScreenX = W * 0.615, treeScreenY = H * 0.792;
    var treeScale = cfg.treeS * k * 0.86;
    ctx.save();
    ctx.translate(treeScreenX, treeScreenY);
    ctx.scale(treeScale, treeScale);
    ctx.translate(-World.tree.x, -World.tree.y);
    World.drawBigTree(ctx, World.tree, stage, 900);
    ctx.restore();

    /* 树下的礼物：阶段越多越满 */
    var grnd = seeded(3311);
    for (var gi = 0; gi < cfg.gifts; gi++) {
      var gx = treeScreenX + (-0.35 + grnd()) * 430 * k;
      var gy = treeScreenY + 8 * k + grnd() * 22 * k;
      photoGift(ctx, gx, gy, (34 + grnd() * 32) * k, (26 + grnd() * 24) * k,
        ['#b3432f', '#2f5f8a', '#2f6b52', '#c98a3a', '#8a5a3a'][gi % 5],
        gi % 2 ? '#f3e3c2' : '#e8c86a');
    }

    /* 树周围那层暖光：阶段越靠后越强 */
    var glow = ctx.createRadialGradient(treeScreenX, H * 0.70, 30 * k, treeScreenX, H * 0.70, 560 * k);
    glow.addColorStop(0, 'rgba(255,206,132,' + (0.08 + cfg.glow).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(255,206,132,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(treeScreenX - 560 * k, H * 0.40, 1120 * k, H * 0.60);

    /* 居民（中景，站在树两侧，不挡树干） */
    cfg.npcs.forEach(function (id) {
      var p = TOWN_CAST_POS[id];
      if (!p) return;
      photoNpc(ctx, id, W * p[0], H * p[1], p[2] * k);
    });

    /* 两个人：站在树前偏左，永远是画面里最大的。
       树越长越大，两个人也一点点往两边让开——站位本身就是"长大了"的证据。 */
    photoPerson(ctx, W * (cfg.cx - cfg.gap / 2), H * 0.846, 3.15 * k,
      Object.assign({}, CHAROPT.a, { outfit: getOutfit('a', 'winter') }), false, 0);
    photoPerson(ctx, W * (cfg.cx + cfg.gap / 2), H * 0.850, 3.10 * k,
      Object.assign({}, CHAROPT.b, { outfit: getOutfit('b', 'winter') }), true, 0);

    if (cfg.heart) {
      [[W * cfg.cx, H * 0.690, 17 * k], [W * (cfg.cx - 0.026), H * 0.728, 12 * k], [W * (cfg.cx + 0.028), H * 0.736, 13 * k]].forEach(function (h) {
        var hx = h[0], hy = h[1], hs = h[2];
        ctx.fillStyle = 'rgba(242,109,125,.88)';
        ctx.beginPath();
        ctx.moveTo(hx, hy + hs * 0.36);
        ctx.bezierCurveTo(hx - hs, hy - hs * 0.45, hx - hs * 0.42, hy - hs * 1.12, hx, hy - hs * 0.4);
        ctx.bezierCurveTo(hx + hs * 0.42, hy - hs * 1.12, hx + hs, hy - hs * 0.45, hx, hy + hs * 0.36);
        ctx.fill();
      });
    }

    photoSnowfall(ctx, W, H, cfg.snow);
    photoVignette(ctx, W, H);

    /* 铭牌：记下这张照片是「树到哪一步」的时候拍的 */
    var pw = 1060 * k, ph = 120 * k, px2 = (W - pw) / 2, py = H - ph - 14 * k;
    ctx.fillStyle = 'rgba(20,14,10,.78)';
    roundRectPath(ctx, px2, py, pw, ph, 22 * k); ctx.fill();
    ctx.strokeStyle = 'rgba(240,192,64,.82)'; ctx.lineWidth = 3 * k;
    roundRectPath(ctx, px2 + 10 * k, py + 10 * k, pw - 20 * k, ph - 20 * k, 15 * k); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe08a';
    ctx.font = 'bold ' + (31 * k).toFixed(1) + 'px "PingFang SC", Georgia, serif';
    ctx.fillText("Omo's Christmas Village", W / 2, py + 40 * k);
    ctx.fillStyle = '#f4ead8';
    ctx.font = (19 * k).toFixed(1) + 'px "PingFang SC", Georgia, serif';
    ctx.fillText('✦ Charles ♥ Julie · 回忆 ' + foundCount() + ' 段 ✦', W / 2, py + 68 * k);
    ctx.fillStyle = 'rgba(244,234,216,.66)';
    ctx.font = (16 * k).toFixed(1) + 'px "PingFang SC", Georgia, serif';
    ctx.fillText('🌲 圣诞树 · ' + cfg.tag + '　·　' + cfg.line + '　·　' + dayStr(), W / 2, py + 95 * k);
  }

  /* ---------- 最终结局合照（独立渲染，不复用任何普通模板）----------
   * 1920×1080、16:9 横版：全亮的树 + 全镇的人 + 烟花 + 圣诞老人雪橇 + 完整小镇，
   * 底部一条纪念文字带。和游戏里那一幕是同一份 paintFinale()。
   */
  var FIN_BAND_H = 200;   /* 底部纪念文字带的高度：画面 880 + 文字 200 = 1080 */

  function renderFinalePhoto(ctx, W, H) {
    var T = 12000;
    var bandH = FIN_BAND_H;
    var sceneH = H - bandH;          // 880

    /* 画面只在 1920×880 里画：人物和树都在这一块里完整收住，
       下面的 200px 留给文字，所以文字不可能压到任何一张脸。 */
    var sc = document.createElement('canvas');
    sc.width = W; sc.height = sceneH;
    var g = sc.getContext('2d');

    /* 几发「停在这一帧」的烟花：位置全部在树冠以上或树的两侧 */
    var fx = [
      [300, 206, 132, '255,214,140', 0.30],
      [706, 118, 108, '176,208,255', 0.46],
      [1252, 136, 146, '255,158,150', 0.36],
      [1642, 210, 118, '168,240,206', 0.52],
      [988, 72, 96, '222,186,255', 0.62],
      [172, 316, 92, '255,224,170', 0.44]
    ].map(function (b) {
      return {
        x: b[0] * W / 1920, y: b[1] * sceneH / 1080, R: b[2] * W / 1920,
        col: b[3], t0: T - b[4] * 1000, dur: 1000
      };
    });

    paintFinale(g, W, sceneH, {
      t: T, shown: FIN.cast.length,
      appear: FIN.cast.map(function () { return 1; }),
      santa: { x: W * 0.300, y: sceneH * 0.146, s: 1.14 },
      fx: fx, photo: true
    });
    ctx.drawImage(sc, 0, 0);

    /* ---------- 底部纪念文字带 ---------- */
    var by = sceneH;
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, by, W, bandH);

    /* 上沿压一点暗，让雪地和黑底之间不是硬切 */
    var sh = ctx.createLinearGradient(0, by - 18, 0, by);
    sh.addColorStop(0, 'rgba(7,11,20,0)');
    sh.addColorStop(1, 'rgba(7,11,20,.62)');
    ctx.fillStyle = sh; ctx.fillRect(0, by - 18, W, 18);

    /* 一条细金线当分隔 */
    var lg = ctx.createLinearGradient(W * 0.5 - 430, 0, W * 0.5 + 430, 0);
    lg.addColorStop(0, 'rgba(240,192,64,0)');
    lg.addColorStop(0.5, 'rgba(240,192,64,.85)');
    lg.addColorStop(1, 'rgba(240,192,64,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(W * 0.5 - 430, by, 860, 2);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe6a8';
    ctx.font = 'bold 38px "PingFang SC", Georgia, serif';
    ctx.fillText("Omo's Christmas Village", W / 2, by + 56);

    /* CHRISTMAS 2026：逐字排开，字距拉开 */
    ctx.fillStyle = 'rgba(244,234,216,.74)';
    ctx.font = '15px "PingFang SC", Georgia, serif';
    var yr = 'CHRISTMAS ' + new Date().getFullYear();
    var chars = yr.split('');
    var spacing = 13;
    var totalW = 0;
    chars.forEach(function (ch) { totalW += ctx.measureText(ch).width + spacing; });
    totalW -= spacing;
    var cx0 = W / 2 - totalW / 2;
    ctx.textAlign = 'left';
    chars.forEach(function (ch) {
      ctx.fillText(ch, cx0, by + 90);
      cx0 += ctx.measureText(ch).width + spacing;
    });

    /* v4.4.0 Final：这张「保存下来的照片」只留三行——
       标题 / 年份 / 一句祝福。对白里那句「下一站，冰岛。」属于剧情，
       仍然在结局台词里（FIN_BEATS），只是不再烙进照片。 */
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(246,238,222,.92)';
    ctx.font = '17.5px "PingFang SC", Georgia, serif';
    ctx.fillText('愿我们一路顺利，也一直一起走下去。', W / 2, by + 146);
  }

  function renderPhoto(ctx, W, H, opt) {
    opt = opt || {};
    if (opt.finale) { renderFinalePhoto(ctx, W, H); return; }
    if (opt.mapId) renderTravelPhoto(ctx, W, H, opt.mapId, opt.label);
    else renderTownPhoto(ctx, W, H);
  }

  /* 旅行打卡照：当地风景当底，两个人站在景里 */
  function renderTravelPhoto(ctx, W, H, mapId, spotLabel) {
    var d = TravelMaps.get(mapId);
    if (!d) { renderTownPhoto(ctx, W, H); return; }
    var bg = TravelMaps.bg(mapId);
    /* 所有「固定像素」都乘这个系数：1920 宽时 k=1（和以前一模一样），
       回忆册里的 320×180 小图也按同一套比例排，不会变成大头贴。 */
    var k = W / 1920;

    /* 地图是 1500×1200；按 16:9 取一条横向的带，让代表性景观留在画面里 */
    var srcH = Math.round(d.w * H / W);
    var sy = function (spotY) { return Math.max(0, Math.min(d.h - srcH, spotY - 600)); };
    var focus = d.view ? { x: d.view.x, y: d.view.y } : d.spawn;
    var srcY = sy(focus.y);
    var sc = W / d.w;

    if (bg) {
      ctx.drawImage(bg, 0, srcY, d.w, srcH, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#16223d'; ctx.fillRect(0, 0, W, H);
    }

    /* 世界坐标 → 照片坐标 */
    var toPx = function (wx, wy) { return { x: wx * sc, y: (wy - srcY) * sc }; };
    var cxw = Math.round(d.w * 0.5);
    var cyp = toPx(cxw, d.spawn.y).y;
    var footY = Math.min(H * 0.85, Math.max(H * 0.60, cyp));

    photoPerson(ctx, W * 0.435, footY, 3.05 * k,
      Object.assign({}, CHAROPT.a, { outfit: getOutfit('a', 'winter') }), false, 1);
    photoPerson(ctx, W * 0.545, footY + 4 * k, 3.05 * k,
      Object.assign({}, CHAROPT.b, { outfit: getOutfit('b', 'winter') }), true, -1);

    /* 暖光 + 飘落物（夜里/雪地才加，白天少一点） */
    var warm = ctx.createRadialGradient(W * 0.5, footY, 40 * k, W * 0.5, footY, 620 * k);
    warm.addColorStop(0, 'rgba(255,214,150,.16)');
    warm.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, H * 0.35, W, H * 0.65);

    photoSnowfall(ctx, W, H, (mapId === 'doha' || mapId === 'kl' || mapId === 'wuhan') ? 40 : 90);
    photoVignette(ctx, W, H);

    /* 左上角票根标签 */
    var tw = 470 * k, th = 116 * k, tx = 60 * k, ty = 56 * k;
    ctx.fillStyle = 'rgba(14,18,26,.66)';
    roundRectPath(ctx, tx, ty, tw, th, 14 * k); ctx.fill();
    ctx.fillStyle = (d.ticket && d.ticket.color) || '#f0c040';
    ctx.fillRect(tx, ty + 18 * k, 7 * k, th - 36 * k);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe08a';
    ctx.font = 'bold ' + (38 * k).toFixed(1) + 'px "PingFang SC", Georgia, serif';
    ctx.fillText(d.name, tx + 26 * k, ty + 54 * k);
    ctx.fillStyle = 'rgba(244,234,216,.86)';
    ctx.font = (20 * k).toFixed(1) + 'px "PingFang SC", Georgia, serif';
    ctx.fillText(d.sub, tx + 26 * k, ty + 86 * k);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(244,234,216,.6)';
    ctx.font = (17 * k).toFixed(1) + 'px "PingFang SC", Georgia, serif';
    ctx.fillText('No.' + ((d.ticket && d.ticket.no) || '00'), tx + tw - 22 * k, ty + 40 * k);

    /* 底部一行 */
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(12,16,24,.55)';
    roundRectPath(ctx, W / 2 - 430 * k, H - 108 * k, 860 * k, 66 * k, 16 * k); ctx.fill();
    ctx.fillStyle = '#f4ead8';
    ctx.font = (24 * k).toFixed(1) + 'px "PingFang SC", Georgia, serif';
    ctx.fillText('✦ Charles ♥ Julie · ' + (spotLabel || d.name) + ' · ' + dayStr() + ' ✦', W / 2, H - 64 * k);
  }

  /* 固定种子随机：照片里的星、雪、屋顶都按同一个种子铺，
     这样同一张照片每次导出都是一样的，不会看起来"抖"。 */
  function seeded(seed) {
    var v = seed;
    return function () { v = (v * 1103515245 + 12345) % 2147483648; return v / 2147483648; };
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- 交互 ---------- */
  function findInteract() {
    if (S.ending || S.photo) return null;
    var best = null, bd = 1e9;
    function consider(type, x, y, r, label, ref) {
      var d = Math.sqrt(Math.pow(S.self.x - x, 2) + Math.pow(S.self.y - y, 2));
      if (d < r && d < bd) { bd = d; best = { type: type, label: label, ref: ref, x: x, y: y }; }
    }
    var inter = curInt();
    if (inter) {
      inter.interactables.forEach(function (it) {
        var label = it.name;
        if (S.interId === 'greenhouse' && /^p[1-6]$/.test(it.id)) {
          var st = plotStates()[parseInt(it.id.slice(1), 10) - 1];
          label = st.stage === 0 ? '🌱 种点什么（地 ' + it.id.slice(1) + '）'
            : (st.ready ? '🧺 收获（地 ' + it.id.slice(1) + '）' : '👀 看看长势（地 ' + it.id.slice(1) + '）');
        }
        consider('roomItem', it.x, it.y, it.r, label, it);
      });
      /* v4.3：藏进屋里的回忆不再出现在最近可互动列表里——
         走近到 26px 由 autoPickEggs 直接收下，不给任何文字提示。 */
      consider('exit', inter.exit.x, inter.exit.y, 70, '🚪 回到小镇', inter.exit);
      return best;
    }
    var mp = curMap();
    if (mp) {
      /* 地图里只有三件事可做：捡起那里留下的一件小东西、站到观景点、回小镇。 */
      var mm = mapMemory(mp.id);
      if (mm) {
        var got = S.quest.found[mm.id];
        consider('mapEgg', mp.eggPos.x, mp.eggPos.y, 70, got ? '💭 再看看这封信' : '✉️ 拆开这封信', mp.eggPos);
      }
      if (mp.view) consider('mapView', mp.view.x, mp.view.y, mp.view.r, mp.view.label, mp.view);
      /* 双人打卡点：站过去就能拍一张横版纪念照，不占任务进度。
         观景点范围内一律优先「看风景」——不然在观景台按互动会突然弹相机，
         想安静看个景都做不到（两处已经拉开距离，重叠只是边角）。 */
      var viewWins = !!(mp.view && best && best.type === 'mapView');
      if (mp.spots && !viewWins) {
        mp.spots.forEach(function (sp, si) {
          var done = !!(S.spots && S.spots[mp.id + ':' + si]);
          consider('mapSpot', sp.x, sp.y, sp.r || 86,
            done ? '📷 再拍一张' : sp.label, { spot: sp, idx: si, mapId: mp.id });
        });
      }
      consider('mapExit', mp.exitPos.x, mp.exitPos.y, 86, '🚉 回小镇', mp.exitPos);
      if (S.remote.seen && S.remote.inter === hereKey()) {
        var op = S.data && S.data.slots && S.data.slots[S.otherSlot];
        if (op) consider('partner', S.remote.x, S.remote.y, 90, '👋 和 ' + NAME[S.otherSlot] + ' 打个招呼', op);
      }
      return best;
    }
    World.npcs.forEach(function (n) { consider('npc', n.x, n.y, 85, '💬 和' + n.name + '交谈', n); });
    /* 牧场：三只动物 + 干草垛 */
    if (World.animals) {
      World.animals.forEach(function (a) { consider('ranch', a.x, a.y - 18, 64, ranchLabel(a), a); });
      if (World.haystack) {
        var hayDone = !!(curWorld() && curWorld().ranch && curWorld().ranch.hayDay === dayStr());
        consider('ranch', World.haystack.x, World.haystack.y + 6, 62,
          hayDone ? '🌾 干草今天拿过了' : '🌾 抱一捆干草',
          { isHay: true, x: World.haystack.x, y: World.haystack.y, name: '干草垛' });
      }
    }
    World.doors.forEach(function (dr) {
      var b = World.buildings.filter(function (x) { return x.id === dr.id; })[0];
      if (b && b.kind === 'station') { consider('station', dr.x, dr.y, 104, '🚉 去车站看看', dr); return; }
      var enterable = b && b.kind !== 'shop' && b.kind !== 'stall';
      consider('door', dr.x, dr.y, 78, enterable ? ('🚪 进入 ' + dr.name) : ('👀 ' + dr.name), dr);
    });
    consider('tree', World.tree.x, World.tree.y + 10, 120, '🎄 查看圣诞树', World.tree);
    /* v4.3：地上这十段回忆完全不给提示——没找到的靠走到跟前自动拾起，
       找到过的才会在地图上留一句「再看看这里」（重读用）。
       所以这里只登记「已经找到的」，未找到的不参与互动判定。 */
    World.eggs.forEach(function (e) {
      if (!S.quest.found[e.id]) return;
      consider('egg', e.x, e.y, 40, '💭 再看看这里', e);
    });
    if (S.remote.seen && S.remote.inter === 0) {
      var o = S.data && S.data.slots && S.data.slots[S.otherSlot];
      if (o) consider('partner', S.remote.x, S.remote.y, 90, '👋 和 ' + NAME[S.otherSlot] + ' 打招呼', o);
    }
    return best;
  }

  function doInteract() {
    if (!S.curInteract) return;
    var it = S.curInteract;
    try {
      doInteractInner(it);
    } catch (err) {
      /* 一个互动出错不该让玩家「点了没反应」：写进控制台，同时给一句人话，
         并把这次互动从当前状态里清掉，下一次重新判定。 */
      if (window.console && console.error) console.error('[interact]', it && it.type, err);
      S.curInteract = null;
      toast('这一步没走通，再试一次 ✦', 2600);
    }
  }
  function doInteractInner(it) {
    if (it.type === 'npc') {
      /* 邮差不是只说话：他手上有一整个信袋（回信 / 地址 / 委托） */
      if (it.ref.id === 'postman') {
        if (!S.quest.talked[it.ref.id]) {
          S.quest.talked[it.ref.id] = 1;
          updateQuest(); syncQuest();
        }
        openMailPanel();
        return;
      }
      /* 圣诞老人：树亮了之后他这儿才是「庆典入口」。
         条件没到（或人没齐）时 talkSanta() 自己给出提示面板；
         主线还没走到这一步就返回 false，落回上面那套普通闲聊。 */
      if (it.ref.id === 'santa') {
        if (!S.quest.talked[it.ref.id]) {
          S.quest.talked[it.ref.id] = 1;
          updateQuest(); syncQuest();
        }
        if (talkSanta()) return;
      }
      /* 老木匠：每天第一次说话，塞几根边角料（木材的另一条来源，
         不占温室的地、也不用等 6 小时）。 */
      if (it.ref.id === 'carpenter') {
        var cw0 = curWorld() || {};
        if (cw0.carpenterDay !== dayStr()) {
          var firstC = !S.quest.talked[it.ref.id];
          grantCarpenterScraps(function (got) {
            openDialog(it.ref.name, got
              ? ['「木头是有脾气的，得顺着它的纹路来。」',
                 '老鲁从刨花堆里挑出几根边角料塞给你：「拿着，反正也进不了炉子。」',
                 '🪵 木材 +3（每天一次，说句话就有）']
              : ['「木头是有脾气的，得顺着它的纹路来。」']);
            if (firstC && !S.quest.talked[it.ref.id]) { S.quest.talked[it.ref.id] = 1; updateQuest(); syncQuest(); }
          });
          return;
        }
      }
      var stage = treeStage();
      var pool = (stage >= 4 && it.ref.lateLines && it.ref.lateLines.length) ? it.ref.lateLines : it.ref.lines;
      if (!pool || !pool.length) pool = ['……'];
      var idx = (S.npcIdx[it.ref.id] || 0);
      /* 委托那句是「附加」的：它自己出问题，也不能把正常对话一起拖没 */
      var commLine = null;
      try { commLine = talkComm(it.ref.id); } catch (e) { if (window.console) console.warn('[comm]', it.ref.id, e); }
      var first = pool[idx % pool.length];
      openDialog(it.ref.name, commLine ? [first, commLine] : [first]);
      S.npcIdx[it.ref.id] = idx + 1;
      if (!S.quest.talked[it.ref.id]) {
        S.quest.talked[it.ref.id] = 1;
        updateQuest(); syncQuest();
      }
    } else if (it.type === 'station') {
      openStationPanel();
    } else if (it.type === 'mapExit') {
      leaveMap();
    } else if (it.type === 'mapView') {
      var mpv = curMap();
      if (mpv) {
        S.self.waveUntil = performance.now() + 1200;
        openDialog(mpv.name, mpv.view.lines);
      }
    } else if (it.type === 'mapEgg') {
      var mpE = curMap();
      var mmE = mpE && mapMemory(mpE.id);
      if (mmE) collectEgg(mmE);
    } else if (it.type === 'mapSpot') {
      /* 双人打卡：先让两个人都挥挥手，再出横版照片。
         完成状态写进共享存档，另一台设备也会看到「已经拍过」。 */
      var sp = it.ref;
      var mpS = curMap();
      if (!mpS) return;
      S.self.waveUntil = performance.now() + 1500;
      try { Snd.sfx('spark'); } catch (e) { }
      var spotKey = sp.mapId + ':' + sp.idx;
      if (!(S.spots && S.spots[spotKey])) {
        mutate(function (w) {
          w.spots = w.spots || {};
          if (!w.spots[spotKey]) w.spots[spotKey] = Date.now();
          return w;
        }).then(function () { refreshHUD(); }, function () { });
      }
      var spotLabel = (sp.spot.label || '').replace(/^📷\s*/, '');
      setTimeout(function () {
        openPhoto({ mapId: sp.mapId, label: spotLabel });
      }, 240);
    } else if (it.type === 'door') {
      var b = World.buildings.filter(function (x) { return x.id === it.ref.id; })[0];
      if (!b) return;
      if (b.kind === 'shop') openOutfit();
      else if (b.kind === 'stall') openDialog(b.name, [b.hint]);
      else if (b.kind === 'station') openStationPanel();
      else enterIndoor(b.id);
    } else if (it.type === 'tree') {
      openTreePanel();
      updateQuest();
    } else if (it.type === 'ranch') {
      if (it.ref && it.ref.isHay) takeHay();
      else animalAct(it.ref);
    } else if (it.type === 'egg') {
      collectEgg(it.ref);
    } else if (it.type === 'partner') {
      S.self.waveUntil = performance.now() + 1600;
      S.backend.setWave().catch(function () { });
      burst((S.self.x + S.remote.x) / 2, (S.self.y + S.remote.y) / 2 - 50, 'heart', 2);
      toast('你朝 ' + NAME[S.otherSlot] + ' 挥了挥手 👋');
    } else if (it.type === 'roomItem') {
      var id = it.ref.id;
      if (S.interId === 'cafe' && id === 'cocoa') drinkCocoa();
      else if (S.interId === 'greenhouse' && /^p[1-6]$/.test(id)) openPlotPanel(parseInt(id.slice(1), 10) - 1);
      else if (S.interId === 'workshop' && id === 'craft') openCraftPanel();
      else if (S.interId === 'workshop' && id === 'pack') openPackPanel();
      else openDialog(it.ref.name, it.ref.lines);
    } else if (it.type === 'exit') {
      leaveIndoor();
    }
  }

  // ---------- 回忆彩蛋（收集 → 回忆册 + 奖励一颗种子） ----------
  function collectEgg(m) {
    var first = !S.quest.found[m.id];
    if (!first) {
      showMemoryCard(m); // 重温
      return;
    }
    S.quest.found[m.id] = 1;
    burst(S.self.x, S.self.y - 50, 'spark', 6);
    Snd.sfx('collect');
    updateQuest();
    var isMap = !!m.map;
    var pl = isMap && T() ? T().get(m.id) : null;
    mutate(function (w) {
      w.quest = w.quest || { step: 0, talked: {}, visited: {}, found: {} };
      w.quest.found = w.quest.found || {};
      if (w.quest.found[m.id]) return w; // 对方先收集过：只补本地记录，不重复发东西
      w.quest.found[m.id] = Date.now();
      w.res = w.res || { wood: 0, seeds: 0, flowers: 0, materials: 0 };
      w.res.seeds = (w.res.seeds || 0) + 1;      // 一段回忆，化作一颗种子
      /* v4.5：屋子里的旧物里常夹着一件能挂上树的手工小东西 ——
         这是「探索获得礼物」的一条独立渠道，不花材料、不用等包裹。 */
      if (m.room) {
        w.res.materials = (w.res.materials || 0) + 1;
        w.roomGift = w.roomGift || {};
        w.roomGift[m.id] = w.roomGift[m.id] || Date.now();
      }
      /* v4.3：地图里的回忆是一封信——拆开会附一件当地特产和一封回信 */
      if (pl) {
        w.spec = w.spec || {};
        w.spec[pl.id] = w.spec[pl.id] || Date.now();
        w.res.flowers = (w.res.flowers || 0) + 1;
        mailArr(w).push({ place: pl.id, at: Date.now() });
      }
      /* 回忆本身就是「去过」的证明 → 那个地方的地址就到手了 */
      w.addr = w.addr || {};
      if (T() && T().has(m.id) && !w.addr[m.id]) w.addr[m.id] = Date.now();
      return w;
    }).then(function () {
      refreshHUD();
      if (pl) {
        toast('💭 收进回忆册 · ✉️ 信里还有 ' + pl.icon + ' ' + pl.item + ' 和 ' + pl.name + ' 的地址', 5200);
      } else if (m.room) {
        toast('💭 收进回忆册了 · 旧物里还夹着一件手工小礼物 🎁 +1', 3600);
      } else {
        toast('💭 收进回忆册了 · 这段回忆化作一颗种子 🌱', 3200);
      }
      var w2 = curWorld() || {};
      if (w2.addr && w2.addr[m.id]) {
        // 地址提示已经由上面那条 toast 说过，这里不重复
      }
    });
    showMemoryCard(m);
  }

  function showMemoryCard(m) {
    var img = $('#mem-photo-img'), cv = $('#mem-art-canvas');
    if (m.image && img) {
      img.src = m.image; img.style.display = 'block';
      if (cv) cv.style.display = 'none';
    } else {
      if (img) img.style.display = 'none';
      if (cv) {
        cv.style.display = 'block';
        cv.width = 320; cv.height = 200;
        var g = cv.getContext('2d');
        try {
          var art = (window.MemoryArt && MemoryArt[m.id]);
          if (art) art(g, 320, 200);
          else { g.fillStyle = '#2a3350'; g.fillRect(0, 0, 320, 200); }
        } catch (e) { }
      }
    }
    $('#mem-photo-title').textContent = m.title;
    $('#mem-photo-text').textContent = m.message + ' —— ' + m.location + (m.date ? ' · ' + m.date : '');
    $('#mem-photo').classList.remove('hidden');
    pause();
  }

  /* ---------- 旅行地图（六张，走小镇车站进出） ---------- */
  /* 每张地图只藏一段回忆，回忆本体仍然登记在 memories.js 里，
     用 map 字段和地图 id 对应——这样回忆册、共享存档、已找到集合都不用改结构。 */
  function mapMemory(mapId) {
    var all = (window.Memories || []);
    for (var i = 0; i < all.length; i++) if (all[i].map === mapId) return all[i];
    return null;
  }

  /* ---------- 车票 ----------
   * 每张票的「获得条件」写在 maps.js 的 ticket.cond 里（一个数组，任一条满足即可）。
   * 判定只用现成的进度字段（回忆数 / 热可可 / 对话过的人 / 手作 / 树阶段 / 去过的城市），
   * 不另开一套任务系统，也不要求连续登录。
   * 一旦条件达成，就同步写进共享存档 world.tickets——两台设备都会随即看到「有票了」。
   */
  function ticketOf(id) {
    var d = window.TravelMaps && TravelMaps.get(id);
    return (d && d.ticket) ? d.ticket : null;
  }
  function condMet(c) {
    if (!c) return false;
    var w = curWorld() || {};
    if (c.type === 'free') return true;
    if (c.type === 'mem') return foundCount() >= (c.n || 1);
    if (c.type === 'cocoa') return ((w.cocoa && w.cocoa.count) || 0) >= (c.n || 1);
    if (c.type === 'talk') return Object.keys(S.quest.talked || {}).length >= (c.n || 1);
    if (c.type === 'craft') return Object.keys(w.crafted || {}).length >= (c.n || 1);
    if (c.type === 'tree') return treeStage() >= (c.n || 1);
    if (c.type === 'visit') return Object.keys(w.travel || {}).length >= (c.n || 1);
    return false;
  }
  function condText(c) {
    if (!c) return '';
    if (c.type === 'free') return '第一次走到车站就有';
    if (c.type === 'mem') return '收进 ' + (c.n || 1) + ' 段回忆';
    if (c.type === 'cocoa') return '在咖啡店喝过一杯热可可';
    if (c.type === 'talk') return '和镇上 ' + (c.n || 1) + ' 个人说过话';
    if (c.type === 'craft') return '在工坊做过一件小东西';
    if (c.type === 'tree') return '小镇的树长到「' + treeStageName(c.n || 1) + '」（第 ' + ((c.n || 1) + 1) + ' 阶 / 共 6 阶）';
    if (c.type === 'visit') return '已经去过 ' + (c.n || 1) + ' 个地方';
    return '';
  }
  /* 默认 OR：cond 里任一条满足就给票（前六张票都是这个节奏，hint 文案也写的「或者」）。
     写了 all: true 的票改成 AND：每一条都必须满足。
     —— 冰岛（07）用的就是 AND，否则「树长到第 3 阶」单独就能把北境之票发出来，
        玩家还没去过几个地方就先知道有这张票了。 */
  function ticketCondMet(id) {
    var tk = ticketOf(id);
    if (!tk || !tk.cond || !tk.cond.length) return false;
    var i;
    if (tk.all) {
      for (i = 0; i < tk.cond.length; i++) if (!condMet(tk.cond[i])) return false;
      return true;
    }
    for (i = 0; i < tk.cond.length; i++) if (condMet(tk.cond[i])) return true;
    return false;
  }
  /* 「有票」= 存档里已经记下，或此刻条件就满足（后者会被 syncTickets 落盘） */
  function hasTicket(id) {
    var w = curWorld();
    if (w && w.tickets && w.tickets[id]) return true;
    return ticketCondMet(id);
  }
  function ticketHint(id) {
    var tk = ticketOf(id);
    return (tk && tk.hint) || '再在镇子上走走，这张票就会出现。';
  }
  function travelVisited(id) {
    var w = curWorld();
    return !!(w && w.travel && w.travel[id]);
  }
  function ticketOwnedCount() {
    var n = 0;
    if (!window.TravelMaps) return 0;
    TravelMaps.list().forEach(function (d) { if (hasTicket(d.id)) n++; });
    return n;
  }
  /* 一共几张票 = 一共几张地图。v4.4 加了冰岛，所有「/ 6」的文案都改走这里，
     以后再加地图不会再出现「7 张票 / 6」这种数字。 */
  function ticketTotal() {
    return (window.TravelMaps && TravelMaps.list().length) || 6;
  }

  /* 条件满足就补票；已去过的城市也补票（老存档迁移，绝不让玩过的地方退回去锁住） */
  function syncTickets() {
    if (!window.TravelMaps) return;
    var w = curWorld();
    if (!w) return;
    var owned = w.tickets || {};
    var travel = w.travel || {};
    var need = null;
    TravelMaps.list().forEach(function (d) {
      if (owned[d.id]) return;
      if (travel[d.id] || ticketCondMet(d.id)) {
        need = need || {};
        need[d.id] = Date.now();
      }
    });
    if (!need) return;
    mutate(function (ww) {
      ww.tickets = ww.tickets || {};
      for (var k in need) if (!ww.tickets[k]) ww.tickets[k] = need[k];
      return ww;
    }).then(function () { refreshHUD(); }, function () { });
  }

  /* ============================================================
   * 应急管理（对玩家隐藏）
   *   入口：菜单 → ⚙️ 设置 → 最底部那行灰色小字「小镇维护」→ 4 位口令。
   *         （v4.4.0 之前是「长按顶部标题 5 秒」，手机上按不出来，已下线。）
   *   口令：4 位数字。前端只存哈希值，不存明文，源码里也不写出来。
   *   说明：这是「不太显眼的入口」，不是真正的安全边界——网页是公开的，
   *   任何人都能改前端代码。真正需要防人的改动，必须走 Firebase 安全规则，
   *   这里所有写操作都仍然老老实实经过原来的 world 事务与规则校验。
   * ============================================================ */
  var ADMIN_HASH = 1786157946;   // djb2('omo' + PIN)，口令本身不写进源码
  var adminOk = false;

  function djb2(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h;
  }

  /* ---------- 恢复备份：只回滚「这一版代码认识」的字段 ----------
   * 备份里没有的字段分两种：
   *   a) 备份之后才加进来的新字段（老代码不认识）→ 必须原样留着，不能清空；
   *   b) 备份时还不存在、但现在已经是「认识」的进度字段（比如当时树还没有 treeStage）
   *      → 这是要被回滚的进度，不能当成新字段护着，否则「恢复」根本恢复不回去。
   * 所以用一张已知字段白名单来区分，而不是「备份里没有就留着」。 */
  var WORLD_KEYS = ['res', 'quest', 'garden', 'cocoa', 'daily', 'crafted', 'ranch',
    'tickets', 'travel', 'spots', 'addr', 'spec', 'parcels', 'mail', 'sent',
    'addrDay', 'addrTradeDay', 'commDone', 'chapter', 'chapterDay', 'treeStage', 'ended',
    /* v4.5 新增：树刻度版本 / 庆典共享状态 / 礼物渠道的一次性记账 */
    'treeStageVer', 'party', 'mapGift', 'roomGift', 'expressDay', 'carpenterDay'];

  /* ---------- 素材注册表（管理员「+5」用）----------
   * 不另开一套库存：直接读 RES_NAME（游戏里所有会写进 world.res 的可计数素材）。
   * MAT_ORDER 只决定显示顺序；RES_NAME 里将来新增的 key 会自动追加到末尾，
   * 所以以后加材料不用改这里。
   * 归属：world.res 是「这个房间共享的背包」（双人共用一桶木头条），
   * 所以写入走同一个 world 事务，两台设备会同时看到。
   */
  var MAT_ORDER = ['wood', 'flowers', 'seeds', 'materials', 'paper', 'giftbox', 'hay', 'milk', 'wool', 'egg'];
  function matList() {
    var out = [], seen = {};
    MAT_ORDER.forEach(function (k) {
      if (RES_NAME[k]) { seen[k] = 1; out.push({ key: k, label: RES_NAME[k] }); }
    });
    for (var k in RES_NAME) {
      if (RES_NAME.hasOwnProperty(k) && !seen[k]) out.push({ key: k, label: RES_NAME[k] });
    }
    return out;
  }
  /* 数量一律当非负整数看：NaN / 负数 / 小数 / 超大值都不会被放大或传染 */
  function resNum(key) {
    var r = worldRes() || {};
    var n = Math.floor(Number(r[key]));
    if (!isFinite(n) || n < 0) n = 0;
    return n;
  }
  var MAT_MAX = 99999;          // 上限，防止溢出（正常玩不可能到）
  var MAT_STEP = 5;             // 每次点一下加 5 个
  var matPending = {};          // 每个素材各自的「写入中」锁，挡住连点重复提交

  /* ---------- 管理员操作日志（本机，别写云端）----------
   * 只记操作类型 / 目标 / 前后数量 / 是否写成功；不记口令、不记任何敏感信息。
   * 上限 200 条，超出丢最旧的。 */
  function logAdmin(kind, target, before, after, ok) {
    try {
      var arr = [];
      try { arr = JSON.parse(localStorage.getItem('omo_admin_log') || '[]') || []; } catch (e) { arr = []; }
      if (!Array.isArray(arr)) arr = [];
      arr.push({ at: Date.now(), kind: kind, target: target || '', before: before, after: after, ok: !!ok });
      if (arr.length > 200) arr = arr.slice(arr.length - 200);
      localStorage.setItem('omo_admin_log', JSON.stringify(arr));
    } catch (e) { }
  }
  function adminLog() {
    try {
      var arr = JSON.parse(localStorage.getItem('omo_admin_log') || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  /* 连点「+5」时不要每次都写一份整份备份（存档会膨胀），
     改成最多每 60 秒一份；大操作（车票/回忆/树/结局/礼品/恢复）仍然每次都备份。 */
  function backupWorldThrottled(minMs) {
    var last = 0;
    try {
      var b = JSON.parse(localStorage.getItem('omo_admin_backup') || 'null');
      last = (b && b.at) || 0;
    } catch (e) { }
    if (Date.now() - last < (minMs || 60000)) return true;
    return backupWorld();
  }

  function openAdminGate() {
    var p = $('#admin-panel');
    if (!p) return;
    closeAllPanelsSilent();
    p.classList.remove('hidden');
    pause();
    var wrap = $('#admin-pin-wrap'), body = $('#admin-body');
    if (adminOk) {
      wrap.classList.add('hidden');
      body.classList.remove('hidden');
      renderAdminStatus();
    } else {
      wrap.classList.remove('hidden');
      body.classList.add('hidden');
      $('#admin-pin').value = '';
      $('#admin-pin-err').classList.add('hidden');
    }
  }

  function renderAdminStatus() {
    var el = $('#admin-status');
    if (!el) return;
    var lines = [];
    var owned = [], locked = [];
    if (window.TravelMaps) {
      TravelMaps.list().forEach(function (d) { (hasTicket(d.id) ? owned : locked).push(d.name); });
    }
    lines.push('<div class="admin-sec"><b>车票</b><span>' + owned.length + ' / ' + ticketTotal() +
      (locked.length ? '　未获得：' + esc(locked.join('、')) : '　全部到手') + '</span></div>');

    var found = foundCount();
    var all = World.allMemories || [];
    var miss = all.filter(function (m) { return !S.quest.found[m.id]; }).map(function (m) { return m.title; });
    lines.push('<div class="admin-sec"><b>回忆</b><span>' + found + ' / ' + all.length +
      (miss.length ? '　未找到：' + esc(miss.slice(0, 6).join('、')) + (miss.length > 6 ? '…' : '') : '　全部收齐') + '</span></div>');

    var st = treeStage();
    var stName = treeStageName(st);
    lines.push('<div class="admin-sec"><b>圣诞树</b><span>第 ' + st + ' 阶 · ' + stName + '</span></div>');

    var canEnd = treeStage() >= 3 && S.quest.step >= 6;
    lines.push('<div class="admin-sec"><b>结局</b><span>' +
      (S.ended ? '已经看过结局' : (canEnd ? '可以触发（日期闸门由应急开关放行）' : '还没满足：需要树到第 3 阶且主线走到第 6 步')) +
      '</span></div>');

    var bak = null;
    try { bak = JSON.parse(localStorage.getItem('omo_admin_backup') || 'null'); } catch (e) { }
    lines.push('<div class="admin-sec"><b>备份</b><span>' +
      (bak && bak.at ? ('上次备份：' + new Date(bak.at).toLocaleString()) : '还没有备份（第一次操作会自动建一个）') +
      '</span></div>');

    /* 礼品图鉴的真实口径：车票 / 回忆 / 地址 / 特产，四本册子都是 world 里现成的字段 */
    lines.push('<div class="admin-sec"><b>礼品图鉴</b><span id="admin-gift-line">' + giftLineText() + '</span></div>');

    var lg = adminLog();
    if (lg.length) {
      var last = lg[lg.length - 1];
      lines.push('<div class="admin-sec"><b>上次操作</b><span>' +
        esc(new Date(last.at).toLocaleTimeString() + ' · ' + last.kind + (last.target ? ' ' + last.target : '') +
          (last.before !== undefined && last.before !== null ? ('　' + last.before + ' → ' + last.after) : '') +
          (last.ok ? '　✓ 已写入' : '　✗ 未写入')) +
        '</span></div>');
    }

    el.innerHTML = lines.join('');
    renderAdminMats();
  }

  /* 礼品图鉴的真实口径：车票 / 回忆 / 地址 / 特产，四本册子都是 world 里现成的字段 */
  function giftLineText() {
    var tl = (window.Travels && Travels.list) ? Travels.list.length : 0;
    return '车票 ' + (window.TravelMaps ? ticketOwnedCount() : 0) + '/' + ticketTotal() +
      ' · 回忆 ' + foundCount() + '/' + (World.allMemories || []).length +
      ' · 地址 ' + addrCount() + '/' + tl +
      ' · 特产 ' + specCount() + '/' + tl;
  }

  /* 另一台设备改了共享进度时，正开着的管理员面板也要跟着动——
     不能「数据已经变了，面板上还写着旧数字」。只改文字，不重建 DOM（不然滚动位置会跳）。 */
  function syncAdminLive() {
    var panel = $('#admin-panel');
    if (!panel || panel.classList.contains('hidden')) return;
    var body = $('#admin-body');
    if (!body || body.classList.contains('hidden')) return;
    var nums = document.querySelectorAll('#admin-mats [data-mat-num]');
    for (var i = 0; i < nums.length; i++) {
      var k = nums[i].getAttribute('data-mat-num');
      var t = '当前 ' + resNum(k);
      if (nums[i].textContent !== t) nums[i].textContent = t;
    }
    var gl = $('#admin-gift-line');
    if (gl && gl.textContent !== giftLineText()) gl.textContent = giftLineText();
  }

  /* ---------- 素材 +5 行（按真实注册表生成，不写死四种）---------- */
  function renderAdminMats() {
    var box = $('#admin-mats');
    if (!box) return;
    var r = worldRes() || {};
    var html = matList().map(function (m) {
      var sp = String(m.label).split(' ');
      var icon = sp.length > 1 ? sp[0] : '';
      var name = sp.length > 1 ? sp.slice(1).join(' ') : m.label;
      var n = resNum(m.key);
      return '<div class="admin-mat" data-mat-row="' + m.key + '">' +
        '<span class="admin-mat-name">' + esc(icon ? icon + ' ' + name : name) + '</span>' +
        '<span class="admin-mat-num" data-mat-num="' + m.key + '">当前 ' + n + '</span>' +
        '<button class="btn ghost small" type="button" data-mat-add="' + m.key + '">+5</button>' +
        '</div>';
    }).join('');
    box.innerHTML = html;
    var btns = box.querySelectorAll('[data-mat-add]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', onMatAdd);
    }
  }

  function onMatAdd(ev) {
    var btn = ev.currentTarget;
    var key = btn && btn.getAttribute('data-mat-add');
    addMat(key, btn);
  }

  function addMat(key, btn) {
    if (!key || !RES_NAME[key]) return false;
    if (matPending[key]) return false;   // 同一种素材的重复提交直接吞掉
    var before = resNum(key);
    if (before >= MAT_MAX) { toast('已经到上限了（' + MAT_MAX + '）', 2200); return false; }
    matPending[key] = true;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    backupWorldThrottled(60000);

    mutate(function (w) {
      w.res = w.res || {};
      var cur = Math.floor(Number(w.res[key]));
      if (!isFinite(cur) || cur < 0) cur = 0;
      if (cur >= MAT_MAX) return w;       // 已经到顶，不再涨
      w.res[key] = Math.min(MAT_MAX, cur + MAT_STEP);
      return w;
    }).then(function (ok) {
      matPending[key] = false;
      var after = resNum(key);
      var wrote = !!ok && after === Math.min(MAT_MAX, before + MAT_STEP);
      var local = S.worldFallback;
      logAdmin('素材+5', key, before, after, wrote && !local);
      if (!wrote) {
        toast('⚠️ 没有写进存档，再试一次', 3000);
      } else if (local) {
        /* 云端没放行时 mutate 会降级成本机保存——别让它看起来像同步成功 */
        toast('⚠️ 只加到了本机：云端进度还没放行（见 README「v2 规则更新」）', 5200);
      } else {
        toast('＋' + MAT_STEP + ' ' + (RES_NAME[key] || key) + '　现在 ' + after, 1600);
      }
      refreshHUD();
      renderAdminStatus();   // 里面会重画素材行
    });
    return true;
  }

  /* ---------- 解锁全部礼品 ----------
   * 「礼品」在这个项目里就是四本册子（都是 world 里现成的字段）：
   *   world.tickets  车票      world.quest.found  回忆
   *   world.addr     地址      world.spec         特产
   * 全部按「没有才补」写，所以点几次都只有一份，不会复制、不会重复发奖。
   * 明确不动的东西：world.res（实物）、world.parcels（在途包裹）、
   * world.chapter / quest.step / treeStage / ended（剧情与树）。
   */
  function adminGifts() {
    var rows = [];
    var ownedT = [], lockedT = [];
    if (window.TravelMaps) TravelMaps.list().forEach(function (d) { (hasTicket(d.id) ? ownedT : lockedT).push(d.name); });
    var all = World.allMemories || [];
    var lockedM = all.filter(function (m) { return !S.quest.found[m.id]; }).length;
    var tl = (window.Travels && Travels.list) ? Travels.list : [];
    var lockedA = 0, lockedS = 0;
    tl.forEach(function (p) { if (!hasAddr(p.id)) lockedA++; if (!hasSpec(p.id)) lockedS++; });

    rows.push('车票 ' + (lockedT.length ? ('还差 ' + lockedT.length + ' 张') : '已经齐了'));
    rows.push('回忆 ' + (lockedM ? ('还差 ' + lockedM + ' 段') : '已经齐了'));
    rows.push('地址 ' + (lockedA ? ('还差 ' + lockedA + ' 个') : '已经齐了'));
    rows.push('特产 ' + (lockedS ? ('还差 ' + lockedS + ' 件') : '已经齐了'));
    if (!lockedT.length && !lockedM && !lockedA && !lockedS) { toast('🎁 图鉴本来就是全的'); return; }
    if (!window.confirm('确定要「解锁全部礼品（图鉴）」吗？\n\n' + rows.join('\n') +
      '\n\n只补图鉴，不发实物、不重复领奖、不推进剧情。操作前会先备份。')) return;

    if (!backupWorld()) toast('⚠️ 备份没写进本机，仍然继续。');
    var before = { t: ownedT.length, m: all.length - lockedM, a: addrCount(), s: specCount() };

    mutate(function (w) {
      if (window.TravelMaps) {
        w.tickets = w.tickets || {};
        TravelMaps.list().forEach(function (d) { if (!w.tickets[d.id]) w.tickets[d.id] = Date.now(); });
      }
      w.quest = w.quest || {};
      w.quest.found = w.quest.found || {};
      all.forEach(function (m) { if (!w.quest.found[m.id]) w.quest.found[m.id] = Date.now(); });
      w.addr = w.addr || {};
      w.spec = w.spec || {};
      tl.forEach(function (p) {
        if (!w.addr[p.id]) w.addr[p.id] = Date.now();
        if (!w.spec[p.id]) w.spec[p.id] = Date.now();
      });
      return w;   // 故意不碰 res / parcels / chapter / quest.step / treeStage / ended
    }).then(function (ok) {
      var after = { t: Object.keys((curWorld() || {}).tickets || {}).length, m: foundCount(), a: addrCount(), s: specCount() };
      var good = !!ok && after.m >= all.length && after.a >= tl.length && after.s >= tl.length;
      logAdmin('解锁全部礼品', '图鉴', before.t + '/' + before.m + '/' + before.a + '/' + before.s,
        after.t + '/' + after.m + '/' + after.a + '/' + after.s, good && !S.worldFallback);
      renderAdminStatus();
      if (!good) toast('⚠️ 没解锁成功，再试一次', 3000);
      else if (S.worldFallback) toast('⚠️ 只解锁在本机：云端进度还没放行', 5200);
      else toast('🎁 礼品图鉴补齐了 · 车票 ' + after.t + ' · 回忆 ' + after.m + ' · 地址 ' + after.a + ' · 特产 ' + after.s, 4200);
    });
  }

  function backupWorld() {
    try {
      var w = curWorld() || {};
      localStorage.setItem('omo_admin_backup', JSON.stringify({ at: Date.now(), world: w }));
      return true;
    } catch (e) { return false; }
  }

  var ADMIN_LABEL = {
    tickets: '补齐全部车票',
    memories: '补齐全部回忆',
    tree: '直接把树点亮到最终阶段',
    ending: '立刻开启最终结局',
    gifts: '解锁全部礼品（图鉴）',
    restore: '恢复上次备份'
  };

  function adminDo(kind) {
    if (kind === 'gifts') { adminGifts(); return; }   // 带自己的确认文案与前后计数
    if (kind && kind.indexOf('mat:') === 0) { addMat(kind.slice(4), null); return; }
    /* 恢复备份必须最先分出去：以前它跟着「先备份再操作」的通用流程走，
       结果「恢复」第一步就把备份覆盖成了当前状态，恢复完等于什么都没变。
       现在恢复不动 omo_admin_backup，只把「恢复前」另存一份当后悔药。 */
    if (kind === 'restore') { adminRestore(); return; }
    var label = ADMIN_LABEL[kind] || kind;
    if (!window.confirm('确定要「' + label + '」吗？\n\n操作前会先备份当前进度，出问题可以从这里恢复。')) return;
    if (!backupWorld()) toast('⚠️ 备份没写进本机，仍然继续。');

    if (kind === 'tickets') {
      var t0 = Object.keys((curWorld() || {}).tickets || {}).length;
      mutate(function (w) {
        w.tickets = w.tickets || {};
        TravelMaps.list().forEach(function (d) { if (!w.tickets[d.id]) w.tickets[d.id] = Date.now(); });
        return w;
      }).then(function (ok) {
        var t1 = Object.keys((curWorld() || {}).tickets || {}).length;
        logAdmin('补齐车票', 'tickets', t0, t1, !!ok);
        renderAdminStatus(); toast(adminWriteMsg(ok, '🎫 车票全补上了 · ' + ticketTotal() + ' 张', '车票没补上'), 3600);
      });
    } else if (kind === 'memories') {
      var m0 = foundCount();
      mutate(function (w) {
        w.quest = w.quest || {};
        w.quest.found = w.quest.found || {};
        (World.allMemories || []).forEach(function (m) { if (!w.quest.found[m.id]) w.quest.found[m.id] = Date.now(); });
        if ((w.quest.step || 0) < 4) w.quest.step = 4;
        return w;
      }).then(function (ok) {
        logAdmin('补齐回忆', 'memories', m0, foundCount(), !!ok);
        renderAdminStatus(); toast(adminWriteMsg(ok, '💭 回忆册补齐了', '回忆没补齐'), 3600);
      });
    } else if (kind === 'tree') {
      var s0 = treeStage();
      mutate(function (w) { w.treeStage = TREE_STAGE_MAX; w.treeStageVer = 2; return w; })
        .then(function (ok) {
          logAdmin('点亮圣诞树', 'treeStage', s0, treeStage(), !!ok);
          renderAdminStatus(); toast(adminWriteMsg(ok, '🎄 树已经点亮到最后阶段', '树没点亮'), 3600);
        });
    } else if (kind === 'ending') {
      /* v4.5：这是「本机预览」，只在本机把演出放一遍，
         不写共享存档（不改树阶、不改 quest、不改 ended / party），
         所以它既不会替正式房间开庆典，也不会给任何一边发奖励。 */
      S.adminEnding = true;
      S.adminPreview = true;
      S.ended = false;
      logAdmin('开启最终结局（本机预览）', 'ending', null, null, true);
      renderAdminStatus();
      closeAllPanelsSilent();
      S.paused = false;
      setTimeout(function () { if (!S.ending) startEnding(); }, 260);
      return;
    } else if (kind === 'restore') {
      /* 这里已经不会走到：restore 在 adminDo 开头就分流到 adminRestore()。 */
    }
  }

  function readBackup() {
    try { return JSON.parse(localStorage.getItem('omo_admin_backup') || 'null'); } catch (e) { return null; }
  }

  /* 管理员写完之后到底写进哪儿了？界面必须说实话：
   *   ok=false            → 连事务都没提交
   *   S.worldFallback     → 云端拒绝（规则/权限），mutate 把改动存到本机了
   *   S.online === false  → 断网：改动排进了 Firebase 待同步队列，联网才会真正落盘
   * 只有三种都不是，才算「真的写进云端了」。 */
  function netDown() {
    if (S.online === false) return true;                     // Firebase .info/connected 说断了（权威）
    try { if (typeof navigator !== 'undefined' && navigator.onLine === false) return true; } catch (e) { }
    return false;                                            // 立刻生效的兜底（.info/connected 有 ~1s 延迟）
  }

  function adminWriteMsg(ok, good, bad) {
    if (!ok) return '⚠️ ' + bad + '：没有写进存档，再试一次';
    if (S.worldFallback) return '⚠️ ' + bad + '：云端没放行，只写进了本机（换设备看不到）';
    if (netDown()) return '⚠️ ' + bad + '：当前连接中断，只排进了待同步队列，联网后才会真正写进云端';
    return good;
  }

  function adminRestore() {
    var raw = readBackup();
    if (!raw || !raw.world) { toast('还没有可恢复的备份'); return; }
    if (!window.confirm('恢复会覆盖当前进度（' + new Date(raw.at).toLocaleString() + ' 的备份）。确定？')) return;
    /* 后悔药：把「恢复前」的状态另存一份，恢复错了还能从这个键再拿回来 */
    try {
      localStorage.setItem('omo_admin_pre_restore', JSON.stringify({ at: Date.now(), world: curWorld() || {} }));
    } catch (e) { }
    /* 只回写备份里「认得」的字段：备份之后新加的、这一版代码还不认识的字段
       原样保留，所以恢复不会把未知字段抹掉；认识的老字段一律以备份为准。 */
    var keepUnknown = [];
    var settled = false;
    /* 断网时 Firebase 事务会先在本地应用，然后一直等云端确认——
       不给提示的话，玩家会以为「点完就已经写进云端了」。6 秒没回音就直说。 */
    var watchdog = setTimeout(function () {
      if (settled) return;
      settled = true;
      logAdmin('恢复备份', 'restore', null, new Date(raw.at).toLocaleString(), false);
      toast(netDown()
        ? '⏳ 还没等到云端确认：当前连接中断，恢复只排进了待同步队列，联网后才会真正写进云端'
        : '⏳ 还没等到云端确认：请检查网络；恢复可能没有写进去，可以再点一次', 6200);
    }, 6000);

    mutate(function (w) {
      var cur = w || {};
      var next = clone(raw.world) || {};
      for (var k in cur) {
        if (!cur.hasOwnProperty(k)) continue;
        if (WORLD_KEYS.indexOf(k) >= 0) continue;   // 认识的进度字段：交给备份回滚
        if (!(k in next)) { next[k] = cur[k]; keepUnknown.push(k); }
      }
      return next;
    }).then(function (ok) {
      var late = settled;          // 看门狗已经先报过「还没确认」
      settled = true; clearTimeout(watchdog);
      logAdmin('恢复备份', 'restore', null, new Date(raw.at).toLocaleString(), !!ok && !S.worldFallback && !netDown());
      renderAdminStatus();
      toast(adminWriteMsg(ok,
        (late ? '✅ 云端已经确认：' : '') + '已恢复备份' + (keepUnknown.length ? '（保留了 ' + keepUnknown.length + ' 个备份里没有的字段）' : ''),
        '恢复没写进去'), 4600);
    });
  }

  /* 管理员入口：菜单 → 设置 → 最底部的「小镇维护」一行小字 → 4 位口令。
     原来这里是「长按顶栏 5 秒」，手机上要好几次才按得出来，所以改成看得见、但
     存在感很低的一行灰字。只换了「怎么进去」：口令校验、面板内容、备份机制
     全部沿用原来的实现，这里不做第二套。 */
  function bindAdmin() {
    var maint = $('#set-maint');
    if (maint && !maint.dataset.adminBound) {
      maint.dataset.adminBound = '1';
      maint.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        /* 刚点开的这一下别顺带把面板又关掉（设置面板会先被收起来） */
        S.adminGuardUntil = Date.now() + 400;
        openAdminGate();
      });
    }
    /* 电脑上给个快捷键：Ctrl/⌘ + Shift + A（手机上没键盘，等于不对玩家暴露） */
    if (!document.body.dataset.adminKeyBound) {
      document.body.dataset.adminKeyBound = '1';
      window.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
          e.preventDefault();
          S.adminGuardUntil = Date.now() + 400;
          openAdminGate();
        }
      });
    }
    var okBtn = $('#admin-pin-ok');
    if (okBtn && !okBtn.dataset.bound) {
      okBtn.dataset.bound = '1';
      okBtn.addEventListener('click', function () {
        var pinEl = $('#admin-pin');
        var v = (pinEl.value || '').trim();
        if (djb2('omo' + v) === ADMIN_HASH) {
          adminOk = true;
          $('#admin-pin-wrap').classList.add('hidden');
          $('#admin-body').classList.remove('hidden');
          renderAdminStatus();
        } else {
          /* 只告诉对方「不对」，不透露位数、不透露任何内部信息 */
          $('#admin-pin-err').classList.remove('hidden');
          pinEl.value = '';
          try { pinEl.focus(); } catch (e) { }
        }
      });
      $('#admin-pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') okBtn.click(); });
    }
    var ab = document.querySelectorAll('[data-admin]');
    for (var i = 0; i < ab.length; i++) {
      if (ab[i].dataset.bound) continue;
      ab[i].dataset.bound = '1';
      ab[i].addEventListener('click', function () { adminDo(this.getAttribute('data-admin')); });
    }
    var ac = $('#admin-close');
    if (ac && !ac.dataset.bound) { ac.dataset.bound = '1'; ac.addEventListener('click', function () { closeAllPanels(); }); }
  }

  function openStationPanel() {
    var list = $('#station-list');
    if (!list || !window.TravelMaps) return;
    list.innerHTML = '';
    TravelMaps.list().forEach(function (d) {
      var owned = hasTicket(d.id);
      /* v4.5：标了 hidden 的票（最后那张）在没拿到之前连灰卡都不出现——
         以前它会以「？？？ / 目的地未知」的形式占着一个位子，等于提前告诉玩家「还有一张」。 */
      if (d.ticket && d.ticket.hidden && !owned) return;
      var visited = travelVisited(d.id);
      var mm = mapMemory(d.id);
      var got = !!(mm && S.quest.found[mm.id]);

      var card = document.createElement('button');
      card.className = 'station-card' + (owned ? '' : ' locked');
      card.type = 'button';
      card.setAttribute('data-map', d.id);

      /* 卡片上半就是这张票本身：有票是彩色，没票是盖了章的灰票 */
      var cv = document.createElement('canvas');
      cv.className = 'station-ticket';
      cv.width = 320; cv.height = 150;
      card.appendChild(cv);
      try { TravelMaps.ticket(d.id, cv, owned); } catch (e) { }

      var body = document.createElement('div');
      body.className = 'station-card-body';
      body.innerHTML =
        '<b>' + esc(owned ? d.name : '？？？') + '</b>' +
        '<span class="station-sub">' + esc(owned ? d.sub : '目的地未知') + '</span>' +
        '<p>' + esc(owned ? d.card : ticketHint(d.id)) + '</p>' +
        '<em class="station-state">' +
        (!owned ? '🔒 还没有这张票' : (visited ? '✓ 去过了' : '🎫 有票 · 随时可以走')) +
        (got ? ' · 💭 找到了那里的东西' : '') +
        '</em>';
      card.appendChild(body);

      if (owned) {
        card.addEventListener('click', function () { enterMap(d.id); });
      } else {
        card.addEventListener('click', function () {
          toast('🎫 ' + ticketHint(d.id), 3400);
        });
      }
      list.appendChild(card);
    });

    var n = ticketOwnedCount();
    var total = ticketTotal();
    var sub = $('#station-sub');
    /* 只报「手上有几张」，不报总数：总数会顺带告诉玩家「还有一张藏着」 */
    if (sub) sub.textContent = '车票 ' + n + ' 张' + (n >= total ? ' · 全了' : '');
    var note = $('#station-note');
    if (note) {
      note.textContent = n >= total
        ? total + ' 张票都到手了。想去哪儿，就挑一张。'
        : '有票的方向才能上车。剩下的那些，先把小镇上的日子过得再热闹一点。';
    }
    $('#station-panel').classList.remove('hidden');
    pause();
  }

  /* ---------- 车票册 ---------- */
  function openTicketBook() {
    var list = $('#ticket-list');
    if (!list || !window.TravelMaps) return;
    list.innerHTML = '';
    TravelMaps.list().forEach(function (d) {
      var owned = hasTicket(d.id);
      if (d.ticket && d.ticket.hidden && !owned) return;   // 没拿到的隐藏票不进册子
      var row = document.createElement('div');
      row.className = 'ticket-row' + (owned ? '' : ' locked');

      var cv = document.createElement('canvas');
      cv.className = 'ticket-canvas';
      cv.width = 320; cv.height = 150;
      row.appendChild(cv);
      try { TravelMaps.ticket(d.id, cv, owned); } catch (e) { }

      var info = document.createElement('div');
      info.className = 'ticket-info';
      var conds = (d.ticket && d.ticket.cond || []).map(condText).filter(Boolean);
      info.innerHTML =
        '<b>' + esc(owned ? d.name : '？？？') + '</b>' +
        '<span class="ticket-sub">' + esc(owned ? d.sub : '目的地未知') + '</span>' +
        '<span class="ticket-state">' +
        (owned ? '🎫 已获得' + (travelVisited(d.id) ? ' · 去过了' : '') : '🔒 未获得') +
        '</span>' +
        (owned ? '' : '<span class="ticket-cond">' + esc(conds.join(' 或 ') || '再走走就会遇到') + '</span>');
      row.appendChild(info);
      list.appendChild(row);
    });
    var n = ticketOwnedCount();
    var tt = ticketTotal();
    $('#ticket-count').textContent = n >= tt ? (n + ' / ' + tt) : ('已得 ' + n + ' 张');
    $('#ticket-note').textContent = n >= tt
      ? '集齐了。' + tt + ' 张票、' + tt + ' 个地方，都去过一遍。'
      : '有票才能上车。每张票都只差一件小事——看看下面写的那行字。';
    $('#ticket-panel').classList.remove('hidden');
    pause();
  }

  function enterMap(id) {
    var d = window.TravelMaps && TravelMaps.get(id);
    if (!d) return;
    if (!hasTicket(id)) { toast('🎫 ' + ticketHint(id), 3400); return; }
    closeAllPanels();          // 顺手解除暂停，否则上车后走不动
    // 记住小镇上的位置，回来时站回原处
    S.mapReturn = { x: S.self.x, y: S.self.y, dir: S.self.dir };
    S.interId = null;
    S.outdoorPos = null;
    S.mapId = id;
    S.self.x = d.spawn.x;
    S.self.y = d.spawn.y;
    S.self.dir = (typeof d.spawn.dir === 'number') ? d.spawn.dir : 1;
    S.self.animT = 0; S.self.frame = 0; S.self.moving = false;
    S.remote.seen = (S.remote.inter === id);
    S.parts = [];
    Snd.sfx('door');
    toast(d.arrive || ('🚉 到了 ' + d.name), 3000);
    /* 第一次来：写进共享存档（world.travel），两台设备都能看到「去过了」。
       顺带把地图背景提前烘出来，避免第一帧空白。 */
    if (!travelVisited(id)) {
      mutate(function (w) {
        w.travel = w.travel || {};
        if (!w.travel[id]) w.travel[id] = Date.now();
        return w;
      }).then(function () { refreshHUD(); }, function () { });
    }
    grantMapGift(id);
    if (window.TravelMaps) TravelMaps.bg(id);
    /* 上车是一次性事件，不是每 150ms 的位移同步——demo 模式也照写，
       这样刷新页面 / 关掉重开都能回到同一张地图。 */
    try {
      S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, false, id).catch(function () { });
    } catch (e) { }
  }

  function leaveMap() {
    var d = curMap();
    S.mapId = null;
    var back = S.mapReturn || { x: 1033, y: 468, dir: 0 };
    S.self.x = back.x; S.self.y = back.y; S.self.dir = back.dir || 0;
    S.self.moving = false; S.self.frame = 0; S.self.animT = 0;
    S.mapReturn = null;
    S.remote.seen = !!(S.data && S.data.slots && S.data.slots[S.otherSlot]) && S.remote.inter === 0;
    S.parts = [];
    Snd.sfx('door');
    toast(d ? ('⛄ 从' + d.name + '回到了小镇') : '⛄ 回到了雪夜的小镇');
    try {
      S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, false, 0).catch(function () { });
    } catch (e) { }
  }

  /* ---------- 室内 / 室外 ---------- */
  function enterIndoor(id) {
    var inter = World.getInterior(id);
    if (!inter) return;
    S.mapId = null;            // 从地图直接进室内是不可能的，防御一下
    S.interId = id;
    S.outdoorPos = { x: S.self.x, y: S.self.y };
    S.self.x = inter.spawn.x;
    S.self.y = inter.spawn.y;
    S.remote.seen = S.remote.inter === id;
    Snd.sfx('door');
    var names = { cabin: '🏠 你们回到了自己的圣诞小屋', cafe: '☕ 推门进了暖冬咖啡——好暖和', greenhouse: '🌿 进了星星温室，玻璃上都是雾气', workshop: '🛠️ 进了礼物工坊，木屑香香的' };
    toast(names[id] || '进来了');
    if (id === 'greenhouse') grantDaily();
    if (S.backend && S.backend.mode !== 'demo') {
      S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, false, id).catch(function () { });
    }
  }
  function leaveIndoor() {
    S.interId = null;
    if (S.outdoorPos) { S.self.x = S.outdoorPos.x; S.self.y = S.outdoorPos.y; }
    else { S.self.x = 400; S.self.y = 420; }
    S.remote.seen = !!(S.data && S.data.slots && S.data.slots[S.otherSlot]) && S.remote.inter === 0;
    Snd.sfx('door');
    toast('⛄ 回到了雪夜的小镇');
    if (S.backend && S.backend.mode !== 'demo') {
      S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, false, 0).catch(function () { });
    }
  }

  /* ---------- 面板 / 对话 ---------- */
  function pause() { S.paused = true; }
  function unpause() { S.paused = false; }

  /* 所有面板集中登记：关闭时统一处理，新增面板不会漏关 */
  var PANEL_IDS = ['#dlg', '#tree-panel', '#outfit-modal', '#menu-panel', '#mem-photo',
    '#book-panel', '#plot-panel', '#craft-panel', '#res-panel', '#quest-panel', '#settings-panel',
    '#station-panel', '#ticket-panel', '#admin-panel', '#pack-panel', '#mail-panel', '#party-panel'];

  function closeAllPanels() {
    PANEL_IDS.forEach(function (s) { var el = $(s); if (el) el.classList.add('hidden'); });
    unpause();
    syncPanelChrome();
  }
  function closeAllPanelsSilent() {
    PANEL_IDS.forEach(function (s) { var el = $(s); if (el) el.classList.add('hidden'); });
    syncPanelChrome();
  }

  /* 面板打开时：加遮罩、隐藏摇杆与交互按钮（避免遮挡和误触）。
   * 用 MutationObserver 监听 class 变化，任何面板以任何方式开关都会自动同步，
   * 不需要在每个 open 函数里手动调用——这样以后加面板也不会漏。 */
  function syncPanelChrome() {
    var any = false;
    PANEL_IDS.forEach(function (s) {
      var el = $(s);
      if (el && !el.classList.contains('hidden')) any = true;
    });
    var game = $('#screen-game');
    if (game) game.classList.toggle('panel-open', any);
    var scrim = $('#panel-scrim');
    if (scrim) scrim.classList.toggle('hidden', !any);
  }
  function watchPanels() {
    if (S.panelWatch) { syncPanelChrome(); return; }
    S.panelWatch = true;
    if (typeof MutationObserver === 'undefined') { syncPanelChrome(); return; }
    var mo = new MutationObserver(function () { syncPanelChrome(); });
    PANEL_IDS.forEach(function (s) {
      var el = $(s);
      if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    syncPanelChrome();
  }
  var dlgLines = null, dlgIdx = 0, dlgName = '';
  function openDialog(name, lines) {
    dlgLines = Array.isArray(lines) ? lines : [lines];
    dlgIdx = 0; dlgName = name;
    $('#dlg-name').textContent = name;
    $('#dlg-text').textContent = dlgLines[0];
    $('#dlg-next').textContent = dlgLines.length > 1 ? '继续 ▸' : '关闭';
    $('#dlg').classList.remove('hidden');
    pause();
  }
  function dlgNext() {
    if (!dlgLines || !dlgLines.length) { closeAllPanels(); return; }  // 没有对话时点「继续」不该炸
    dlgIdx++;
    if (dlgIdx < dlgLines.length) {
      $('#dlg-text').textContent = dlgLines[dlgIdx];
      $('#dlg-next').textContent = dlgIdx < dlgLines.length - 1 ? '继续 ▸' : '关闭';
    } else closeAllPanels();
  }
  function openOutfit() {
    var cur = (S.data && S.data.slots && S.data.slots[S.mySlot] && S.data.slots[S.mySlot].outfit) || 'winter';
    document.querySelectorAll('#outfit-list .outfit-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.outfit === cur);
    });
    $('#outfit-modal').classList.remove('hidden');
    pause();
  }
  function openTreePanel() {
    var stage = treeStage();
    var names = [
      '一棵安静的小树苗，等着你们来装点。',
      '它开始往上长了：三层枝叶，还什么都没挂。',
      '第一颗彩球挂上去了，树上有了颜色。',
      '树形长开了，彩球成串，树顶那颗星也装上了——只是还没通电。',
      '灯串亮了，星星有了光，树下开始堆礼物。就差最后一点。',
      '✨ 全树点亮。这是属于你们两个人的小镇之光。'
    ];
    $('#tree-stage-text').textContent = '当前阶段：' + treeStageName(stage) + '（' + stage + '/' + TREE_STAGE_MAX + '）';
    $('#tree-desc').textContent = names[Math.min(stage, TREE_STAGE_MAX)];
    var need = $('#tree-need');
    var deco = $('#tree-deco');
    if (stage >= TREE_STAGE_MAX) {
      need.textContent = '🎄 树已经全亮。圣诞夜：2026 年 12 月 25 日（今天 ' + dayStr() + '）' +
        '　—— 庆典不会自己开始：和 ' + NAME[S.otherSlot] + ' 一起到圣诞老人跟前，说一声「开 Party 吧」。';
      deco.classList.add('hidden');
      deco.disabled = true;
    } else {
      var cost = TREE_COST[stage] || {};
      var r = worldRes();
      var lack = treeCostLack(cost, r);
      var haveText = '（现有 🪵 ' + (r.wood || 0) + ' 🌸 ' + (r.flowers || 0) + ' 🎁 ' + (r.materials || 0) +
        ((cost.hay || cost.milk) ? (' 🌾 ' + (r.hay || 0) + ' 🥛 ' + (r.milk || 0)) : '') + '）';
      need.textContent = '升到「' + treeNextName(stage) + '」需要：' + treeCostText(cost) + haveText;
      deco.classList.remove('hidden');
      deco.textContent = lack.length
        ? ('还差 ' + lack.map(function (x) { return (RES_NAME[x.key] || x.key) + ' ' + (x.need - x.have); }).join(' · '))
        : ('✨ 装饰一下 → ' + treeNextName(stage));
      deco.disabled = lack.length > 0;
    }
    $('#tree-panel').classList.remove('hidden');
    pause();
  }
  function toggleMenu() {
    var m = $('#menu-panel');
    if (m.classList.contains('hidden')) { m.classList.remove('hidden'); pause(); }
    else { m.classList.add('hidden'); unpause(); }
  }

  /* ---------- 资源面板 ---------- */
  function openResPanel() {
    var r = worldRes();
    var g = (curWorld() && curWorld().garden) || {};
    var planted = 0, ready = 0;
    for (var i = 1; i <= 6; i++) { if (g['p' + i]) planted++; }
    plotStates().forEach(function (s) { if (s.ready) ready++; });
    var body = $('#res-body');
    if (!body) return;
    body.innerHTML =
      '<div class="res-line"><b>🪵 木材</b><span>' + (r.wood || 0) + ' 根 · 温室种树收获</span></div>' +
      '<div class="res-line"><b>🌸 鲜花</b><span>' + (r.flowers || 0) + ' 朵 · 温室种花收获</span></div>' +
      '<div class="res-line"><b>🌱 种子</b><span>' + (r.seeds || 0) + ' 颗 · 每天进温室领补给</span></div>' +
      '<div class="res-line"><b>🎁 手工礼物</b><span>' + (r.materials || 0) + ' 件 · 工坊制作</span></div>' +
      '<div class="res-line"><b>🌾 干草</b><span>' + (r.hay || 0) + ' 捆 · 牧场干草垛每天领一份</span></div>' +
      '<div class="res-line"><b>🥛 牛奶 · 🧶 羊毛 · 🥚 鸡蛋</b><span>' + (r.milk || 0) + ' / ' + (r.wool || 0) + ' / ' + (r.egg || 0) + ' · 牧场每天收</span></div>' +
      '<div class="res-line"><b>📄 信纸 · 📦 礼盒</b><span>' + (r.paper || 0) + ' / ' + (r.giftbox || 0) + ' · 工坊制作（寄包裹要用礼盒）</span></div>' +
      '<div class="res-line"><b>✉️ 地址 · ' + '🌏 特产</b><span>' + addrCount() + ' / ' + ((T() && T().count) || 41) + ' 个地方 · 已收 ' + specCount() + ' 种特产</span></div>' +
      '<div class="res-line"><b>🌿 温室</b><span>' + planted + ' / 6 块地有作物' + (ready ? ' · ' + ready + ' 块可收获' : '') + '</span></div>' +
      '<div class="res-line"><b>✨ 旅行回忆</b><span>' + foundCount() + ' 段已收进册子</span></div>' +
      '<div class="res-line"><b>🎄 圣诞树</b><span>' + treeStageName(treeStage()) + '（' + treeStage() + '/' + TREE_STAGE_MAX + '）</span></div>';
    $('#res-panel').classList.remove('hidden');
    pause();
  }

  /* ---------- 任务面板 ---------- */
  function openQuestPanel() {
    var ch = chapterNo();
    var rows = '';
    CHAPTERS.forEach(function (c, i) {
      var done = ch > i, cur = (ch === i);
      rows += '<div class="quest-line' + (done ? ' done' : '') + '">' +
        '<span class="quest-mark">' + (done ? '✔' : (cur ? '▶' : '·')) + '</span>' +
        '<span>第 ' + (i + 1) + ' 章 · ' + esc(c.t) +
        (cur ? '　<b style="color:#ffe08a">' + esc(c.prog()) + '</b>' : '') + '</span></div>';
      if (cur) rows += '<div class="quest-line tip"><span class="quest-mark">　</span><span>' + esc(c.tip) + '</span></div>';
    });
    /* v4.3：没有「今天只能推一章」这回事了，条件到了就走 */
    rows += '<div class="quest-line"><span class="quest-mark">📅</span><span>' +
      (ch >= CHAPTERS.length ? '十章都过完了，剩下的日子就在小镇里慢慢等圣诞夜'
        : '做事就行——条件一满足，这一章自己就翻过去') + '</span></div>';

    /* 今天镇上的两件委托 */
    var NPCN = { santa: '圣诞老人', snowman: '雪人先生', elf: '小精灵', barista: '老板娘',
      postman: '邮差阿信', baker: '面包师麦香', shepherd: '牧羊女小禾', carpenter: '老木匠老鲁' };
    commsToday().forEach(function (c) {
      var nm = NPCN[c.npc] || '镇上的人';
      var okc = commDone(c.idx);
      rows += '<div class="quest-line' + (okc ? ' done' : '') + '"><span class="quest-mark">' + (okc ? '✔' : '🤝') + '</span><span>' +
        esc(okc ? ('🤝 委托 · ' + nm + ' 的那件已经交付了')
          : ('🤝 委托 · ' + nm + '：' + c.ask + '（' + commWantText(c) + ' → ' + commGiveText(c) + '）')) + '</span></div>';
    });
    rows += '<div class="quest-line"><span class="quest-mark">🎄</span><span>圣诞树：' +
      treeStageName(treeStage()) + '（' + treeStage() + '/' + TREE_STAGE_MAX + '）' +
      ' · 回忆 ' + foundCount() + ' / ' + ((window.Memories || []).length) +
      ' · 车票 ' + ticketOwnedCount() + ' / ' + ticketTotal() +
      ' · 特产 ' + specCount() + ' / ' + ((T() && T().count) || 41) +
      ' · 圣诞夜 2026-12-25（还有 ' + Math.max(0, daysToChristmas()) + ' 天）</span></div>';

    var body = $('#quest-body');
    if (!body) return;
    body.innerHTML = rows;
    $('#quest-panel').classList.remove('hidden');
    pause();
  }

  /* ---------- 设置面板 ---------- */
  function openSettings() {
    var sw = $('#set-music');
    if (sw) {
      var on = Snd.isOn();
      sw.textContent = on ? '开' : '关';
      sw.classList.toggle('is-on', on);
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    $('#settings-panel').classList.remove('hidden');
    pause();
  }

  /* ---------- 回忆册 ---------- */
  /* 已打卡的合影点：S.spots 的键是 "地图id:序号"，这里翻译成能直接用的对象 */
  function spotList() {
    var out = [];
    var spots = S.spots || {};
    Object.keys(spots).forEach(function (key) {
      var p = key.split(':');
      var d = window.TravelMaps && TravelMaps.get(p[0]);
      if (!d) return;
      var idx = parseInt(p[1], 10) || 0;
      var sp = d.spots && d.spots[idx];
      out.push({
        mapId: d.id, mapName: d.name, idx: idx,
        label: (sp && sp.label) ? String(sp.label).replace(/^📷\s*/, '') : '在这里合影',
        at: spots[key]
      });
    });
    out.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    return out;
  }

  /* v3.7：只列已找到的回忆。
     - 以前把 16 条全列出来、还写「待发现 · i/16」，等于把总数和进度都摊开了；
     - 现在没有总数的概念：找到一段，册子里才多一页；没找到时只有一句提示。 */
  function openBook() {
    var list = $('#book-list');
    if (!list) return;
    list.innerHTML = '';
    var found = S.quest.found || {};
    /* v4：回忆册里的条目来自全部 16 段回忆——小镇地上的 10 段，
       加上六张旅行地图里各藏的一段（它们不在 World.eggs 里）。 */
    var all = World.allMemories || World.eggs;
    var foundList = all.filter(function (m) { return !!found[m.id]; });
    if (!foundList.length && !spotList().length && !specCount()) {
      var empty = document.createElement('div');
      empty.className = 'book-empty';
      empty.innerHTML = '<b>册子还是空的</b><p>照片和明信片会散落在小镇各处——' +
        '长椅上、窗台边、树下、桌上的小物件里。走远了，车站还能带你们去别的地方找。</p>';
      list.appendChild(empty);
    }
    foundList.forEach(function (m) {
      var div = document.createElement('div');
      div.className = 'book-item';
      var cv = document.createElement('canvas');
      cv.width = 320; cv.height = 200;
      var g = cv.getContext('2d');
      if (window.MemoryArt && MemoryArt[m.id]) {
        try { MemoryArt[m.id](g, 320, 200); } catch (e) {
          g.fillStyle = '#2a3350'; g.fillRect(0, 0, 320, 200);
        }
      }
      cv.addEventListener('click', function () { showMemoryCard(m); });
      div.appendChild(cv);
      var info = document.createElement('div');
      info.className = 'book-info';
      info.innerHTML = '<b>' + esc(m.title) + '</b><span>' + esc(m.location) + (m.date ? ' · ' + esc(m.date) : '') + '</span><p>' + esc(m.message) + '</p>';
      div.appendChild(info);
      list.appendChild(div);
    });

    /* v4.1 旅行合影：六张地图的打卡点拍过的照片都收在这里。
       不给每张单独存图片（一张 1080P 就是几百 KB，双人同步会爆），
       只记「哪张地图的第几个点拍过」，点开时用同一套固定构图重画一遍。 */
    var sps = spotList();
    if (sps.length) {
      var head = document.createElement('div');
      head.className = 'book-sec';
      head.textContent = '📷 旅行合影';
      list.appendChild(head);
      sps.forEach(function (sp) {
        var div2 = document.createElement('div');
        div2.className = 'book-item';
        var cv2 = document.createElement('canvas');
        cv2.width = 320; cv2.height = 180;
        try { renderTravelPhoto(cv2.getContext('2d'), 320, 180, sp.mapId, sp.label); } catch (e) { }
        cv2.addEventListener('click', function () { openPhoto({ mapId: sp.mapId, label: sp.label }); });
        div2.appendChild(cv2);
        var info2 = document.createElement('div');
        info2.className = 'book-info';
        info2.innerHTML = '<b>' + esc(sp.mapName) + ' · 合影</b><span>' + esc(sp.label) + '</span>' +
          '<p>在这个位置一起站了一会儿，就顺手拍下来了。</p>';
        div2.appendChild(info2);
        list.appendChild(div2);
      });
    }

    /* v4.3 远方物产：41 个地方，收到一件亮一格。
       没收到但已经有地址的，先露地名；连地址都没有的，只有「还没去过」。 */
    var spGot = specList();
    var tt = T();
    if (tt) {
      var head2 = document.createElement('div');
      head2.className = 'book-sec';
      head2.textContent = '✉️ 远方物产 · ' + spGot.length + ' / ' + tt.count;
      list.appendChild(head2);
      var grid = document.createElement('div');
      grid.className = 'spec-grid';
      /* 收到的排前面：翻到这一节就能看见自己攒了什么，不用在 41 格里找 */
      var ordered = tt.list.slice().sort(function (a, b) {
        var ma = specMap()[a.id] ? 1 : 0, mb = specMap()[b.id] ? 1 : 0;
        return mb - ma;
      });
      ordered.forEach(function (p) {
        var has = !!specMap()[p.id];
        var cell = document.createElement('div');
        cell.className = 'spec-cell' + (has ? ' is-got' : '');
        cell.innerHTML = has
          ? '<span class="sp-ico">' + p.icon + '</span><b>' + esc(p.item) + '</b><em>' + esc(p.name) + '</em>'
          : '<span class="sp-ico">·</span><b>？？？</b><em>' + (hasAddr(p.id) ? esc(p.name) : '还没去过') + '</em>';
        if (has) cell.title = p.line;
        grid.appendChild(cell);
      });
      list.appendChild(grid);
      var tip = document.createElement('p');
      tip.className = 'book-empty-note';
      tip.textContent = spGot.length
        ? '每一件都是从那个地方寄回来的。寄包裹去工坊的寄件台，收信找邮差阿信。'
        : '寄出去的包裹，会带回当地的一件特产。地址在回忆里，也在邮差手上。';
      list.appendChild(tip);
    }

    var cnt = $('#book-count');
    if (cnt) cnt.textContent = (foundList.length || sps.length || spGot.length)
      ? ('回忆 ' + foundList.length + ' 段' + (sps.length ? ' · 合影 ' + sps.length + ' 张' : '') +
         (spGot.length ? ' · 特产 ' + spGot.length : ''))
      : '';
    $('#book-panel').classList.remove('hidden');
    pause();
  }

  /* ---------- 种植地面板 ---------- */
  function openPlotPanel(i) {
    S.plotIdx = i;
    var st = plotStates()[i];
    $('#plot-title').textContent = '🌱 种植地 ' + (i + 1);
    var body = $('#plot-body');
    var bpf = $('#btn-plant-flower'), bpt = $('#btn-plant-tree'), bhv = $('#btn-harvest');
    bpf.classList.add('hidden'); bpt.classList.add('hidden'); bhv.classList.add('hidden');
    if (st.stage === 0) {
      var r = worldRes();
      var noSeed = (r.seeds || 0) < 1;
      body.innerHTML = '<p class="plot-tip">这块地还空着。种点什么？</p>' +
        '<p class="plot-sub">持有种子 🌱 ' + (r.seeds || 0) + ' 颗（每天进温室领补给 · 每段新回忆 +1）</p>';
      bpf.classList.remove('hidden'); bpt.classList.remove('hidden');
      bpf.disabled = noSeed; bpt.disabled = noSeed;
    } else if (st.ready) {
      var what = st.kind === 'tree' ? '一棵小树 🌲（收成：木材 ×' + GROW.tree.yield + '）' : '一丛花 🌸（收成：鲜花 ×' + GROW.flower.yield + '）';
      body.innerHTML = '<p class="plot-tip">已经成熟——' + what + '</p>';
      bhv.classList.remove('hidden');
    } else {
      var label = st.kind === 'tree' ? GROW.tree.label : GROW.flower.label;
      body.innerHTML = '<p class="plot-tip">正在生长：' + label + '</p>' +
        '<p class="plot-sub">大约还需 ' + fmtRemain(st.remain) + '（真实时间，关掉游戏也会继续长）</p>';
    }
    $('#plot-panel').classList.remove('hidden');
    pause();
  }

  /* ---------- 工坊制作面板（v4.3：配方动态生成） ---------- */
  function openCraftPanel() {
    var r = worldRes();
    var box = $('#craft-list');
    if (box) {
      box.innerHTML = '';
      RECIPES.forEach(function (rc) {
        var out = rc.out || { materials: 1 };
        var outTxt = [];
        for (var k in out) if (out.hasOwnProperty(k)) outTxt.push((RES_NAME[k] || k) + '×' + out[k]);
        var cost = '🪵' + rc.wood + (rc.flowers ? ' 🌸' + rc.flowers : '');
        var need = rc.need || {};
        for (var nk in need) if (need.hasOwnProperty(nk)) cost += ' ' + (RES_NAME[nk] || nk) + '×' + need[nk];
        var b = document.createElement('button');
        b.className = 'btn craft-btn';
        var lackList = recipeLackList(rc, r);
        var lackTxt = lackList.map(function (x) {
          return '<span>' + esc(x.t) + ' ' + x.need + '<i>（有 ' + x.have + '）</i></span>';
        }).join('');
        b.innerHTML = '<b>' + esc(rc.name) + '</b><span>' + outTxt.join(' · ') + '　（' + cost + '）</span>' +
          (lackTxt ? '<span class="craft-lack">还差 ' + lackTxt + '</span>' : '');
        b.disabled = lackList.length > 0;
        b.addEventListener('click', function () { craft(rc); openCraftPanel(); });
        box.appendChild(b);
      });
    }
    $('#craft-res').textContent = '现有：🪵 ' + (r.wood || 0) + ' · 🌸 ' + (r.flowers || 0) +
      ' · 📄 ' + (r.paper || 0) + ' · 📦 ' + (r.giftbox || 0) + ' · 🎁 ' + (r.materials || 0);
    $('#craft-panel').classList.remove('hidden');
    pause();
  }

  /* ---------- v4.3 寄件台（工坊里那张包装台） ---------- */
  function parcelState(id) {
    var p = parcels()[id];
    if (!p) return 'none';
    return p.readyAt <= Date.now() ? 'ready' : 'fly';
  }
  function openPackPanel() {
    var t = T();
    if (!t) return;
    var r = worldRes();
    var sub = $('#pack-sub');
    if (sub) sub.textContent = '📦 礼盒 ' + (r.giftbox || 0) + ' · 地址 ' + addrCount() + '/' + t.count + ' · 特产 ' + specCount() + '/' + t.count;
    var flyEl = $('#pack-fly');
    if (flyEl) {
      var fly = flyingParcels();
      flyEl.innerHTML = fly.length
        ? '🚚 在路上：' + fly.map(function (id) {
          var pl = t.get(id);
          return '<b>' + esc(pl ? pl.name : id) + '</b>（还有 ' + fmtRemain(parcelLeftMs(id)) + '）';
        }).join('　·　')
        : '<span class="muted">现在没有在路上的包裹。</span>';
    }
    var list = $('#pack-list');
    if (!list) return;
    var am = addrMap();
    var known = t.list.filter(function (p) { return am[p.id]; });
    var html = '';
    if (!known.length) {
      html = '<div class="book-empty"><b>还没有地址</b><p>找到一段回忆，那个地方的地址就写进本子了；' +
        '也可以去镇上找邮差阿信，他每天会给你一个。</p></div>';
    } else {
      t.regions.forEach(function (rg) {
        var grp = known.filter(function (p) { return p.region === rg; });
        if (!grp.length) return;
        html += '<div class="book-sec">' + rg + '</div><div class="pack-grid">';
        grp.forEach(function (p) {
          var st = parcelState(p.id);
          var got = hasSpec(p.id);
          var cls = 'pack-chip' + (st === 'fly' ? ' is-fly' : '') + (st === 'ready' ? ' is-ready' : '') + (got ? ' is-got' : '');
          var tail = got ? '✓ 已收 ' + p.icon
            : (st === 'fly' ? '在途 ' + fmtRemain(parcelLeftMs(p.id))
              : (st === 'ready' ? '✉️ 取回信' : '寄一个'));
          html += '<button class="' + cls + '" data-send="' + p.id + '">' +
            '<span class="pc-name">' + esc(p.name) + '</span>' +
            '<span class="pc-item">' + p.icon + ' ' + esc(p.item) + '</span>' +
            '<span class="pc-tail">' + tail + '</span></button>';
        });
        html += '</div>';
      });
      var unknown = t.count - known.length;
      if (unknown > 0) html += '<p class="muted small-note">还有 ' + unknown + ' 个地方没有地址——去镇上找回忆，或者找阿信。</p>';
    }
    list.innerHTML = html;
    $('#pack-panel').classList.remove('hidden');
    pause();
  }

  /* ---------- v4.3 邮差的信袋 ---------- */
  function openMailPanel() {
    var t = T();
    if (!t) return;
    var sub = $('#mail-sub');
    if (sub) sub.textContent = '地址 ' + addrCount() + '/' + t.count + ' · 特产 ' + specCount() + '/' + t.count;
    var ready = readyParcels();
    var body = $('#mail-body');
    if (!body) return;
    var html = '';
    html += '<div class="mail-say">「有信——！」阿信把邮包放在腿上，一张一张数给你听。</div>';

    /* 今天托付给邮差的事 */
    var c = commFor('postman');
    if (c) {
      html += '<div class="book-sec">今天托付给你的事</div>';
      html += '<div class="mail-item"><span>' + esc(c.ask) + '</span><em>' +
        commWantText(c) + ' → ' + commGiveText(c) + '</em>' +
        (commHave(c) ? '<button class="btn primary small" data-comm="postman">交给他</button>'
          : '<span class="mail-dim">还没凑够</span>') + '</div>';
    }

    /* 待拆的信 */
    html += '<div class="book-sec">等你拆的信' + (ready.length ? '（' + ready.length + '）' : '') + '</div>';
    if (!ready.length) {
      html += '<div class="mail-item"><span class="mail-dim">暂时没有新信。寄出去的包裹回来时，我会喊你。</span></div>';
    } else {
      ready.forEach(function (id) {
        var pl = t.get(id);
        if (!pl) return;
        html += '<div class="mail-item"><span>' + pl.icon + ' 来自 <b>' + esc(pl.name) + '</b></span><em>' +
          esc(pl.item) + '</em><button class="btn primary small" data-claim="' + id + '">拆开</button></div>';
      });
    }

    /* 已经收到的特产 */
    var got = specList();
    if (got.length) {
      html += '<div class="book-sec">已经收到的特产（' + got.length + ' / ' + t.count + '）</div><div class="mail-tags">';
      got.forEach(function (p) {
        html += '<span class="mail-tag" title="' + esc(p.line) + '">' + p.icon + ' ' + esc(p.item) + ' · ' + esc(p.name) + '</span>';
      });
      html += '</div>';
    }

    /* 地址情况 */
    var un = unknownPlaces();
    html += '<div class="book-sec">地址</div>';
    html += '<div class="mail-item"><span>已经知道 <b>' + addrCount() + '</b> 个地方，还有 <b>' + un.length + '</b> 个不知道。</span>' +
      (addrToday() ? '<span class="mail-dim">今天的已经领过</span>' : '<span class="mail-dim">今天还有一封</span>') + '</div>';
    if (un.length) {
      html += '<div class="mail-dim small-note">没去过的地方，等你收到那边的信，地址就自然有了。</div>';
    }
    body.innerHTML = html;

    var a = $('#mail-addr');
    if (a) { a.disabled = addrToday() || !un.length; a.textContent = addrToday() ? '今天领过了' : '领今天的地址'; }
    var mf = $('#mail-fast');
    if (mf) {
      var canFast = !expressDayDone() && (worldRes().paper || 0) >= 1 && expressPool().length > 0;
      mf.disabled = !canFast;
      mf.textContent = expressDayDone() ? '今天加急用过了' : '加急代寄（📄1）';
    }
    var tr = $('#mail-trade');
    if (tr) {
      var r = worldRes();
      tr.disabled = (r.paper || 0) < 3 || (r.materials || 0) < 1 || !un.length;
      tr.textContent = '换地址（📄3 🎁1）';
    }
    $('#mail-panel').classList.remove('hidden');
    pause();
  }

  /* ---------- 绘制 ---------- */
  function draw(ts) {
    if (S.ending) {   // 最终结局在独立舞台上播，小镇这一帧不用画
      var b0 = $('#btn-interact'); if (b0) b0.classList.add('hidden');
      return;
    }
    var ctx = S.ctx;
    ctx.clearRect(0, 0, S.view.w, S.view.h);
    ctx.save();
    var zNow = zoomNow();
    if (zNow !== 1) ctx.scale(zNow, zNow);
    ctx.translate(-Math.round(S.cam.x), -Math.round(S.cam.y));

    var myOutfit = getOutfit(S.mySlot, 'winter');
    var theirOutfit = getOutfit(S.otherSlot, 'winter');
    var inter = curInt();
    var showRemote = S.remote.seen && S.remote.inter === hereKey();
    var drawables = [];

    if (inter) {
      if (S.interId === 'greenhouse') inter.draw(ctx, ts, plotStates());
      else inter.draw(ctx, ts);
      if (World.drawRoomEggs) World.drawRoomEggs(ctx, ts, S.self, S.interId, S.quest.found);
      if (showRemote) {
        drawables.push({ y: S.remote.y, fn: function () {
          var waving = ts < S.remote.waveUntil;
          Sprites.drawCharacter(ctx, S.remote.x, S.remote.y, S.remote.dir, S.remote.moving ? Math.floor(ts / 140) % 4 : 0,
            Object.assign({}, CHAROPT[S.otherSlot], { outfit: theirOutfit }), waving, ts);
          nameTag(ctx, S.remote.x, S.remote.y - 82, NAME[S.otherSlot], false);
        } });
      }
      drawables.push({ y: S.self.y, fn: function () {
        var waving = ts < S.self.waveUntil;
        Sprites.drawCharacter(ctx, S.self.x, S.self.y, S.self.dir, S.self.frame,
          Object.assign({}, CHAROPT[S.mySlot], { outfit: myOutfit }), waving, ts);
        nameTag(ctx, S.self.x, S.self.y - 82, NAME[S.mySlot] + '（你）', true);
      } });
      drawables.sort(function (a, b) { return a.y - b.y; }).forEach(function (d) { d.fn(); });
      ctx.fillStyle = 'rgba(255,150,60,.045)';
      ctx.fillRect(S.cam.x, S.cam.y, S.view.w, S.view.h);
    } else if (curMap()) {
      /* ---------- 旅行地图 ----------
       * 背景是一张离屏 canvas（maps.js 里整张画好、按 id 缓存），这里只裁剪可见区域画一次；
       * 人物、记忆物件、动态效果（水波 / 喷泉 / 灯光呼吸）都叠在上面。 */
      var md = curMap();
      var bgi = window.TravelMaps ? TravelMaps.bg(md.id) : null;
      ctx.fillStyle = '#0e1622';
      ctx.fillRect(0, 0, md.w, md.h);
      if (bgi) {
        /* 可见区域要用「世界单位」算：屏幕像素 ÷ 取景比例，
           否则缩放到 0.8 时只会画出屏幕宽度的 0.8 倍，右边和下边留黑。 */
        var zz = zoomNow();
        var vx = Math.max(0, Math.floor(S.cam.x)), vy = Math.max(0, Math.floor(S.cam.y));
        var vw = Math.min(md.w - vx, Math.ceil(S.view.w / zz) + 2);
        var vh = Math.min(md.h - vy, Math.ceil(S.view.h / zz) + 2);
        if (vw > 0 && vh > 0) ctx.drawImage(bgi, vx, vy, vw, vh, vx, vy, vw, vh);
      }
      if (typeof md.anim === 'function') { ctx.save(); md.anim(ctx, ts); ctx.restore(); }
      /* v4.1 环境细节的动态部分（草浪 / 浮尘 / 灯光呼吸 / 水花），
         只在人物之前薄薄叠一层，不参与碰撞，也不吃帧率。 */
      if (window.TravelMaps && TravelMaps.animExtra) {
        try { ctx.save(); TravelMaps.animExtra(md.id, ctx, ts); ctx.restore(); } catch (e) { }
      }

      /* v4.3：每张地图上的回忆是一封真正的信——躺在那里，能看见、能拆。
         拆过之后不再发光，只留一张安静的纸（还能再看一遍）。 */
      var memObj = mapMemory(md.id);
      if (memObj) {
        var gotLetter = !!S.quest.found[memObj.id];
        World.drawEnvelope(ctx, { x: md.eggPos.x, y: md.eggPos.y, color: memObj.color }, ts, gotLetter);
      }

      if (showRemote) {
        drawables.push({ y: S.remote.y, fn: function () {
          var waving = ts < S.remote.waveUntil;
          Sprites.drawCharacter(ctx, S.remote.x, S.remote.y, S.remote.dir, S.remote.moving ? Math.floor(ts / 140) % 4 : 0,
            Object.assign({}, CHAROPT[S.otherSlot], { outfit: theirOutfit }), waving, ts);
          nameTag(ctx, S.remote.x, S.remote.y - 78, NAME[S.otherSlot], false);
        } });
      }
      drawables.push({ y: S.self.y, fn: function () {
        var waving2 = ts < S.self.waveUntil;
        Sprites.drawCharacter(ctx, S.self.x, S.self.y, S.self.dir, S.self.frame,
          Object.assign({}, CHAROPT[S.mySlot], { outfit: myOutfit }), waving2, ts);
        nameTag(ctx, S.self.x, S.self.y - 78, NAME[S.mySlot] + '（你）', true);
      } });
      drawables.sort(function (a, b) { return a.y - b.y; }).forEach(function (d) { d.fn(); });

      /* 画面最上面压一层很淡的空气感，让远景和人物贴合，
         同时也不至于挡住地面——只是 0 到 ~40% 不透明度的竖向渐变。 */
      var haze = ctx.createLinearGradient(0, 0, 0, md.h * 0.62);
      haze.addColorStop(0, 'rgba(255,255,255,.06)');
      haze.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, md.w, md.h * 0.62);
    } else {
      World.drawGround(ctx, { x: S.cam.x, y: S.cam.y, w: S.view.w, h: S.view.h });
      World.drawIceRink(ctx);
      World.drawPond(ctx);
      World.drawBridge(ctx);
      World.drawSnowPiles(ctx);
      if (World.drawRanchGround) World.drawRanchGround(ctx, ts);
      World.drawProps(ctx, ts);
      World.drawFence(ctx);
      World.drawBorderTrees(ctx, ts);
      World.drawEggs(ctx, ts, S.self, S.quest.found);

      World.buildings.forEach(function (b) { drawables.push({ y: b.y + b.h, fn: function () { World.drawBuilding(ctx, b, ts); } }); });
      drawables.push({ y: World.tree.y, fn: function () { World.drawBigTree(ctx, World.tree, treeStage(), ts); } });
      World.benches.forEach(function (b) { drawables.push({ y: b.y, fn: function () { World.drawBench(ctx, b); } }); });
      World.lamps.forEach(function (l) { drawables.push({ y: l.y, fn: function () { World.drawLamp(ctx, l, ts); } }); });
      if (World.animals) {
        World.animals.forEach(function (a) {
          drawables.push({ y: a.y, fn: function () { World.drawAnimal(ctx, a, ts); } });
        });
      }

      if (showRemote) {
        drawables.push({ y: S.remote.y, fn: function () {
          var waving = ts < S.remote.waveUntil;
          Sprites.drawCharacter(ctx, S.remote.x, S.remote.y, S.remote.dir, S.remote.moving ? Math.floor(ts / 140) % 4 : 0,
            Object.assign({}, CHAROPT[S.otherSlot], { outfit: theirOutfit }), waving, ts);
          nameTag(ctx, S.remote.x, S.remote.y - 78, NAME[S.otherSlot], false);
        } });
      }
      drawables.push({ y: S.self.y, fn: function () {
        var waving = ts < S.self.waveUntil;
        Sprites.drawCharacter(ctx, S.self.x, S.self.y, S.self.dir, S.self.frame,
          Object.assign({}, CHAROPT[S.mySlot], { outfit: myOutfit }), waving, ts);
        nameTag(ctx, S.self.x, S.self.y - 78, NAME[S.mySlot] + '（你）', true);
      } });

      World.npcs.forEach(function (n) {
        drawables.push({ y: n.y, fn: function () {
          if (n.id === 'santa') Sprites.drawSanta(ctx, n.x, n.y, ts);
          else if (n.id === 'snowman') Sprites.drawSnowman(ctx, n.x, n.y, ts);
          else if (n.style) Sprites.drawVillager(ctx, n.x, n.y, ts, n.style, Math.floor(ts / 320) % 4);
          else if (n.id === 'elf') Sprites.drawElf(ctx, n.x, n.y, ts, Math.floor(ts / 300) % 4);
          else Sprites.drawBarista(ctx, n.x, n.y, ts, Math.floor(ts / 300) % 4);
          nameTag(ctx, n.x, n.y - (n.id === 'santa' ? 84 : 66), n.name, false, '#ffe08a');
        } });
      });

      drawables.sort(function (a, b) { return a.y - b.y; }).forEach(function (d) { d.fn(); });

      var snowBoost = 1;
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      S.flakes.forEach(function (f) {
        f.y += f.v * 0.016 * snowBoost; f.x += Math.sin(ts / 900 + f.ph) * 0.4 * snowBoost;
        if (f.y > World.height) { f.y = -6; f.x = Math.random() * World.width; }
        if (f.x > S.cam.x - 10 && f.x < S.cam.x + S.view.w + 10 && f.y > S.cam.y - 10 && f.y < S.cam.y + S.view.h + 10) {
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
        }
      });
    }

    drawParticles(ctx);
    ctx.restore();

    var vg = ctx.createRadialGradient(S.view.w / 2, S.view.h / 2, Math.min(S.view.w, S.view.h) * 0.42, S.view.w / 2, S.view.h / 2, Math.max(S.view.w, S.view.h) * 0.75);
    vg.addColorStop(0, 'rgba(10,20,40,0)');
    vg.addColorStop(1, inter ? 'rgba(40,20,10,.35)' : (curMap() ? 'rgba(10,16,30,.26)' : 'rgba(10,20,40,.42)'));
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, S.view.w, S.view.h);

    if (S.curInteract && !S.paused) drawInteractBubble(ctx);
    var btn = $('#btn-interact');
    if (S.curInteract && !S.paused) {
      btn.textContent = S.curInteract.label;
      btn.classList.remove('hidden');
    } else btn.classList.add('hidden');

    var qt = questText();
    if (qt !== S.lastQuestText) {
      S.lastQuestText = qt;
      var qc = $('#quest-chip');
      if (qc) qc.textContent = qt;
    }

    /* dev 专用：实测帧率与移动速度。
       iPhone 实测时打开 ?dev=1，分别记录「Safari 里」和「主屏幕 PWA 里」的数字，
       两者都应该稳定在 150 px/s（推到底）——若 PWA 明显更高，就是时间步长出了问题。 */
    if (S.dev) drawDevMeter(ctx, ts);
  }

  function drawDevMeter(ctx, ts) {
    var tr = S.track;
    if (!tr) { tr = S.track = { x: S.self.x, y: S.self.y, t: ts, v: 0, fps: 60, fa: 0, f: 0 }; }
    tr.fa += (S.dt || 0.016); tr.f++;
    if (ts - tr.t >= 250) {
      var dist = Math.sqrt(Math.pow(S.self.x - tr.x, 2) + Math.pow(S.self.y - tr.y, 2));
      tr.v = dist / ((ts - tr.t) / 1000);
      tr.fps = tr.f / (tr.fa || 1);
      tr.x = S.self.x; tr.y = S.self.y; tr.t = ts; tr.fa = 0; tr.f = 0;
    }
    var txt = 'fps ' + Math.round(tr.fps) + ' · ' + Math.round(tr.v) + ' px/s · dpr ' + (S.dpr || 1);
    ctx.save();
    ctx.font = 'bold 12px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    var w = ctx.measureText(txt).width + 18;
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(S.view.w / 2 - w / 2, S.view.h - 26, w, 20);
    ctx.fillStyle = '#9dffa8';
    ctx.fillText(txt, S.view.w / 2, S.view.h - 12);
    ctx.restore();
  }

  /* 交互提示气泡。注意：这个函数是在 ctx.restore() 之后调用的，
     所以必须自己把「世界坐标」换算成「屏幕坐标」——以前直接用世界坐标画，
     镜头一移动气泡就跑到屏幕外了（等于没有提示）。 */
  function drawInteractBubble(ctx) {
    var it = S.curInteract;
    var zi = zoomNow();
    var bob = Math.sin(performance.now() / 300) * 2.5;
    var x = (it.x - S.cam.x) * zi;
    var y = (it.y - S.cam.y) * zi - (it.type === 'npc' ? 96 : 108) * zi + bob;
    y = Math.max(56, Math.min(S.view.h - 150, y));
    ctx.font = 'bold 13px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    var w = ctx.measureText(it.label).width + 22;
    var bx = Math.max(w / 2 + 8, Math.min(S.view.w - w / 2 - 8, x));
    ctx.fillStyle = 'rgba(20,32,54,.85)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx - w / 2, y - 17, w, 26, 13); else ctx.rect(bx - w / 2, y - 17, w, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,224,138,.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(20,32,54,.85)';
    ctx.beginPath();
    ctx.moveTo(bx - 5, y + 8); ctx.lineTo(bx + 5, y + 8); ctx.lineTo(bx, y + 15);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(it.label, bx, y + 1);
  }

  /* ---------- 粒子 ---------- */
  function burst(x, y, kind, n) {
    for (var i = 0; i < n; i++) {
      S.parts.push({
        x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 16,
        kind: kind, life: 1.1 + Math.random() * 0.5, max: 1.6,
        ph: Math.random() * 7
      });
    }
  }
  function drawParticles(ctx) {
    S.parts.forEach(function (pt) {
      var a = Math.max(0, Math.min(1, pt.life / 0.9));
      ctx.globalAlpha = a;
      if (pt.kind === 'heart') {
        var s = 6;
        ctx.fillStyle = '#f26d7d';
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y + s * 0.35);
        ctx.bezierCurveTo(pt.x - s, pt.y - s * 0.45, pt.x - s * 0.42, pt.y - s * 1.1, pt.x, pt.y - s * 0.4);
        ctx.bezierCurveTo(pt.x + s * 0.42, pt.y - s * 1.1, pt.x + s, pt.y - s * 0.45, pt.x, pt.y + s * 0.35);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.beginPath(); ctx.arc(pt.x - s * 0.28, pt.y - s * 0.32, s * 0.18, 0, 7); ctx.fill();
      } else {
        var r1 = 4.5 + Math.sin(pt.life * 8 + pt.ph) * 1.4;
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y - r1); ctx.lineTo(pt.x + r1 * 0.32, pt.y - r1 * 0.32);
        ctx.lineTo(pt.x + r1, pt.y); ctx.lineTo(pt.x + r1 * 0.32, pt.y + r1 * 0.32);
        ctx.lineTo(pt.x, pt.y + r1); ctx.lineTo(pt.x - r1 * 0.32, pt.y + r1 * 0.32);
        ctx.lineTo(pt.x - r1, pt.y); ctx.lineTo(pt.x - r1 * 0.32, pt.y - r1 * 0.32);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  }

  function nameTag(ctx, x, y, text, isSelf, color) {
    ctx.font = 'bold 12px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    var w = ctx.measureText(text).width + 12;
    ctx.fillStyle = isSelf ? 'rgba(240,168,60,.85)' : 'rgba(20,32,54,.72)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - 14, w, 19, 8); else ctx.rect(x - w / 2, y - 14, w, 19);
    ctx.fill();
    ctx.fillStyle = isSelf ? '#3a2c10' : (color || '#f4ead8');
    ctx.fillText(text, x, y);
  }

  function getOutfit(slot, def) {
    var d = S.data;
    return (d && d.slots && d.slots[slot] && d.slots[slot].outfit) || def;
  }

  /* 调试口（仅 ?dev=1 生效）：给自动化探针读取真实位置/输入/时间步长，
     以及把角色放回指定坐标，避免测速时撞到建筑导致误判。
     不参与游戏逻辑，正式环境全部是空操作。 */
  function devPlace(x, y) {
    if (!S.dev) return false;
    S.self.x = x; S.self.y = y;
    /* 瞬移也要让对方看见：正常走路时位置是边走边发的，
       直接改坐标不发的话，对方屏幕上会一直停在旧位置。 */
    publishPos();
    return true;
  }

  /* 主动把当前位置发给对方一次（进门 / 瞬移 / 刷新后第一次拿到存档时用）。
     正常走路仍然走主循环里那套 150ms 节流，不额外增加写入。 */
  function publishPos() {
    if (!S.backend || !S.backend.setPos) return;
    try {
      S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, false, hereKey())
        .catch(function () { });
    } catch (e) { }
  }
  function devWave(ms) {
    if (!S.dev) return false;
    S.self.waveUntil = performance.now() + (ms || 3000);
    return true;
  }
  function devState() {
    if (!S.dev) return null;
    return {
      x: S.self.x, y: S.self.y, dir: S.self.dir, frame: S.self.frame,
      dt: S.dt, t: S.simT, paused: !!S.paused, inter: S.interId || 0,
      map: S.mapId || null, here: hereKey(), photo: !!S.photo, ending: !!S.ending,
      ended: !!((curWorld() || {}).ended),
      tickets: ticketOwnedCount(), spots: Object.keys(S.spots || {}).length,
      stage: treeStage(),
      joy: { dx: S.joy.dx, dy: S.joy.dy, mag: S.joy.mag, active: S.joy.active },
      view: { w: S.view.w, h: S.view.h }, dpr: S.dpr,
      cam: { x: S.cam.x, y: S.cam.y }, slot: S.mySlot,
      outfit: getOutfit(S.mySlot, 'winter'), otherOutfit: getOutfit(S.otherSlot, 'winter'),
      res: Object.assign({}, worldRes()),
      remote: { x: Math.round(S.remote.x), y: Math.round(S.remote.y), tx: Math.round(S.remote.tx),
                ty: Math.round(S.remote.ty), seen: !!S.remote.seen, inter: S.remote.inter || 0 },
      chapter: chapterNo(), chapterDay: chapterDayStr(),
      ranch: Object.assign({}, (curWorld() && curWorld().ranch) || {}),
      indoors: !!S.interId, memoryCount: foundCount(),
      party: partySnapshot()
    };
  }

  /* 调试口：直接进/出某张地图（验收脚本用；?dev=1 之外是空操作） */
  function devEnterMap(id) {
    if (!S.dev) return false;
    if (id) { enterMap(id); return true; }
    leaveMap(); return true;
  }
  function devStation() {
    if (!S.dev) return false;
    openStationPanel(); return true;
  }
  function devInteract() {
    if (!S.dev) return false;
    S.curInteract = findInteract();
    doInteract();
    return S.curInteract ? S.curInteract.type : null;
  }
  /* 调试口：直接进某间屋子（只为了截图验收，不改存档、不触发奖励之外的行为） */
  function devIndoor(id) {
    if (!S.dev) return false;
    if (!id) { leaveIndoor(); return true; }
    enterIndoor(id); return true;
  }
  /* 调试口：把镜头挪到世界某点，方便截树 / 截建筑 */
  function devLook(wx, wy) {
    if (!S.dev) return false;
    S.cam.x = wx - S.view.w / zoomNow() / 2;
    S.cam.y = wy - S.view.h / zoomNow() / 2;
    return true;
  }

  return {
    enter: enter, onData: onData, active: active, devState: devState, devPlace: devPlace, devWave: devWave,
    devEnterMap: devEnterMap, devStation: devStation, devInteract: devInteract,
    devIndoor: devIndoor, devLook: devLook,
    devHit: function (x, y) { return S.dev ? hits(x, y) : null; },
    devNear: function () {
      if (!S.dev) return null;
      var it = findInteract();
      return it ? { type: it.type, label: it.label, id: (it.ref && (it.ref.id || it.ref.name)) || null } : null;
    },
    /* v4.1 给验收脚本用的口子（只在 ?dev=1 时有意义，但本身不改变游戏行为） */
    devTicketBook: function () { openTicketBook(); },
    devBook: function () { openBook(); },
    devAdmin: function () { if (!S.dev && !adminOk) return false; openAdminGate(); return true; },
    /* app.js 的连接监听推过来的真实在线状态（只读给 UI 用，不改任何进度） */
    setOnline: function (on) { S.online = !!on; return S.online; },
    devAdminUnlock: function (pin) { return djb2('omo' + (pin || '')) === ADMIN_HASH; },
    /* 写入口加一道闸：只有 ?dev=1 的验收页面，或者已经在上界面里输对过口令，
       才肯执行——控制台里喊一句 devAdminAct('tickets') 不再直接生效。 */
    devAdminAct: function (k) { if (!S.dev && !adminOk) return false; adminDo(k); return true; },
    /* v4.5 双人庆典：只读快照 + 三个「和玩家按同一个按钮」的动作。
       它们不绕过任何判定——条件不够时和真人点下去的结果一样（什么都不发生）。 */
    devParty: function () { return partySnapshot(); },
    devDecorate: function () { if (!S.dev) return false; decorateTree(); return true; },
    devTreePanel: function () { if (!S.dev) return false; openTreePanel(); return true; },
    devTalkSanta: function () { if (!S.dev) return false; talkSanta(); return true; },
    devPartyGo: function () { if (!S.dev) return false; startParty(); return true; },
    devPartyLater: function () { if (!S.dev) return false; closeAllPanels(); return true; },
    devGiftSources: function () {
      var w = curWorld() || {};
      return {
        mapGift: Object.keys(w.mapGift || {}), roomGift: Object.keys(w.roomGift || {}),
        expressDay: w.expressDay || '', carpenterDay: w.carpenterDay || '',
        materials: (worldRes().materials || 0), paper: (worldRes().paper || 0),
        wood: (worldRes().wood || 0)
      };
    },
    /* 只读：素材注册表 / 管理员日志 / 礼品图鉴计数（验收脚本用来对账） */
    devAdminMats: function () {
      return matList().map(function (m) { return { key: m.key, label: m.label, n: resNum(m.key) }; });
    },
    devAdminLog: function () { return adminLog(); },
    /* 只读：整份共享存档 + 房间/槽位。验收脚本对账用，不写任何东西。 */
    devWorldRaw: function () { return S.dev ? JSON.parse(JSON.stringify(curWorld() || {})) : null; },
    devRoom: function () {
      if (!S.dev) return null;
      return { code: S.code || null, slot: S.mySlot, other: S.otherSlot, fallback: !!S.worldFallback,
               online: (S.online === null ? null : !!S.online), navOnline: (typeof navigator !== 'undefined' ? !!navigator.onLine : null),
               mode: (S.backend && S.backend.mode) || null };
    },
    devGifts: function () {
      var all = World.allMemories || [];
      var tl = (window.Travels && Travels.list) ? Travels.list : [];
      return {
        tickets: (window.TravelMaps ? ticketOwnedCount() : 0), ticketTotal: ticketTotal(),
        mem: foundCount(), memTotal: all.length,
        addr: addrCount(), spec: specCount(), places: tl.length,
        res: Object.assign({}, worldRes()),
        parcels: Object.keys((curWorld() || {}).parcels || {}).length,
        chapter: chapterNo(), treeStage: treeStage(), ended: !!((curWorld() || {}).ended)
      };
    },
    devPhoto: function (opt) { openPhoto(opt); },
    /* 最终结局的验收入口：只在 ?dev=1 下有效，不改变玩家看到的任何东西 */
    devFinale: function (act, arg) {
      if (!S.dev) return null;
      function snap() {
        return {
          t: finState.t, phase: finState.phase, beat: finState.beat,
          shown: finState.shown, santa: !!finState.santa, fx: finState.fx.length
        };
      }
      /* 只读：没有正在播的结局就返回 null，绝不顺手再开一场 */
      if (act === 'state') return finState ? snap() : null;
      if (act === 'open') {
        if (!finState) startEnding();
        return { t: 0, phase: 'gather' };
      }
      if (!finState) return null;
      if (act === 'skip') {
        finState.t = Math.max(finState.t, FIN_TALK_AT + 20);
        return { t: finState.t };
      }
      if (act === 'beat') {
        finState.phase = 'talk';
        finState.beat = Math.max(0, Math.min(FIN_BEATS.length - 1, arg | 0));
        finSay(finState.beat);
        return { beat: finState.beat };
      }
      if (act === 'next') { finNextBeat(); return { beat: finState ? finState.beat : -1 }; }
      if (act === 'photo') { openPhoto({ finale: true }); return true; }
      return snap();
    },
    devStagePhoto: function () { openPhoto(); return treeStage(); },
    devPhotoSize: function () { var cv = $('#photo-canvas'); return cv ? { w: cv.width, h: cv.height } : null; },
    devTickets: function () {
      var out = {};
      if (window.TravelMaps) TravelMaps.list().forEach(function (d) { out[d.id] = hasTicket(d.id); });
      return out;
    },
    devSpots: function () { return S.spots || {}; },
    devChapter: function () {
      var w = curWorld() || {};
      return { chapter: chapterNo(), day: w.chapterDay || '', canAdvance: canAdvanceToday(),
               count: CHAPTERS.length, text: questText(),
               comms: commsToday().map(function (c) { return c.npc; }),
               addr: addrCount(), spec: specCount(), mail: mailCount() };
    },
    devPatchWorld: function (patch) {
      if (!S.dev) return false;
      var w = curWorld(); if (!w) return false;
      for (var k in patch) if (patch.hasOwnProperty(k)) w[k] = patch[k];
      return true;
    },
    /* 和 devPatchWorld 的区别：这个走 mutate() 真正落盘，
       所以能触发依赖存档的异步流程（寄包裹 / 章节推进）——验收脚本要用这个。 */
    devPatchPersist: function (patch) {
      if (!S.dev) return Promise.resolve(false);
      return mutate(function (w) {
        for (var k in patch) if (patch.hasOwnProperty(k)) w[k] = patch[k];
        /* 夹具写的是「六阶段刻度」，别让老存档迁移把它再折一次 */
        if (!patch.hasOwnProperty('treeStageVer')) w.treeStageVer = 2;
        return w;
      });
    },
    devLeaveMap: function () { if (!S.dev) return false; leaveMap(); return true; },
    devOpenCraft: function () { openCraftPanel(); },
    devQuestPanel: function () { openQuestPanel(); },
    devPack: function () { openPackPanel(); },
    devMail: function () { openMailPanel(); },
    devTravels: function () {
      var t = T();
      return {
        count: t ? t.count : 0,
        addr: addrCount(),
        spec: specCount(),
        mail: mailCount(),
        sent: sentCount(),
        ready: readyParcels(),
        fly: flyingParcels(),
        gifts: { paper: (worldRes().paper || 0), giftbox: (worldRes().giftbox || 0) }
      };
    },
    devSend: function (id) { sendParcel(id); },
    devClaim: function (id) { claimParcel(id); },
    devAddr: function () { takeAddrToday(); },
    devComm: function () { return commsToday(); },
    devCommDone: function () { return commDone(0) && commDone(1); },
    devSpecIds: function () { return Object.keys(specMap()); }
  };
})();
