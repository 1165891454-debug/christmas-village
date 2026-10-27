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

  var TREE_COST = [
    { wood: 3 },                              // 小树苗 → 已装饰
    { wood: 6, flowers: 6 },                  // 已装饰 → 挂上彩灯
    { wood: 5, flowers: 8, materials: 2 }     // 挂上彩灯 → 全树点亮（还需 2 件工坊手工礼物）
  ];
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
      crafted: {}
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
    /* 昨天喂过 → 今天就能收 */
    if (st.ready && st.ready <= today) {
      mutate(function (w) {
        w.ranch = w.ranch || {};
        w.ranch[a.id] = {};
        w.ranch.ever = w.ranch.ever || {};
        w.ranch.ever[a.goods] = Date.now();
        w.res = w.res || {};
        w.res[a.goods] = (w.res[a.goods] || 0) + 1;
        return w;
      }).then(function () {
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
      w.res = w.res || {};
      w.res.hay = Math.max(0, (w.res.hay || 0) - 1);
      w.ranch[a.id] = { fed: today, ready: dayShift(1) };
      return w;
    }).then(function () {
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
      w2.ranch.hayDay = today;
      w2.ranch.gotHay = w2.ranch.gotHay || Date.now();
      w2.res = w2.res || {};
      w2.res.hay = (w2.res.hay || 0) + 3;
      return w2;
    }).then(function () {
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
      w.res.giftbox -= 1;
      w.parcels = w.parcels || {};
      if (w.parcels[placeId]) return w;
      w.parcels[placeId] = { at: Date.now(), readyAt: Date.now() + PACK_MS };
      w.sent = (w.sent || 0) + 1;
      return w;
    }).then(function (ok) {
      if (!ok) { toast('没寄出去，再试一次', 2400); return; }
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
      w.mail = w.mail || [];
      w.mail.push({ place: placeId, at: Date.now() });
      if (w.mail.length > 240) w.mail = w.mail.slice(-240);
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
    if (!pool.length) { toast('📬 所有地址都收齐了——41 个地方，一个不剩', 3400); return; }
    var ds = parseInt(dayStr().replace(/-/g, ''), 10) || 0;
    var pl = pool[ds % pool.length];
    mutate(function (w) {
      w.addr = w.addr || {};
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
  function commKey(idx) { return dayStr() + '#' + idx; }
  function commDone(idx) {
    var w = curWorld() || {};
    return !!(w.commDone && w.commDone[commKey(idx)]);
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
      if (w.commDone[commKey(c.idx)]) return w;
      w.res = w.res || {};
      if (c.want.kind === 'res') {
        if ((w.res[c.want.key] || 0) < c.want.n) return w;
        w.res[c.want.key] -= c.want.n;
      } else if (!(w.spec && w.spec[c.want.key])) {
        return w;
      }
      for (var k in c.give) if (c.give.hasOwnProperty(k)) w.res[k] = (w.res[k] || 0) + c.give[k];
      w.commDone[commKey(c.idx)] = Date.now();
      return w;
    }).then(function (ok) {
      if (!ok) return;
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

  function treeStage() {
    var w = curWorld();
    if (w && typeof w.treeStage === 'number') return w.treeStage;
    return (S.data && S.data.tree && typeof S.data.tree.stage === 'number') ? S.data.tree.stage : 0;
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
      prog: function () { return '树 ' + ['小树苗', '已装饰', '挂上彩灯', '全树点亮'][treeStage()] + ' · 手工 ' + Math.min(1, worldRes().materials || 0) + '/1'; } },
    { t: '凑齐三张车票', tip: '车票不会一次给全：先把小镇的日子过得再热闹一点',
      ok: function () { return ticketOwnedCount() >= 3; },
      prog: function () { return '车票 ' + Math.min(3, ticketOwnedCount()) + '/3 · 回忆 ' + foundCount(); } },
    { t: '远方的回信', tip: '寄出去的包裹会带着当地特产回来，收满三种',
      ok: function () { return mailCount() >= 3 && specCount() >= 3; },
      prog: function () { return '回信 ' + Math.min(3, mailCount()) + '/3 · 特产 ' + Math.min(3, specCount()) + '/3'; } },
    { t: '点亮整棵树', tip: '树全亮、三种牧场产物都收过、六种远方特产摆上架',
      ok: function () { return treeStage() >= 3 && foundCount() >= 11 && ranchGoodsCount() >= 3 && specCount() >= 6; },
      prog: function () {
        return '树 ' + ['小树苗', '已装饰', '挂上彩灯', '全树点亮'][treeStage()] +
          ' · 回忆 ' + Math.min(11, foundCount()) + '/11 · 产物 ' + Math.min(3, ranchGoodsCount()) + '/3' +
          ' · 特产 ' + Math.min(6, specCount()) + '/6';
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
    }
    var w = d.world;
    if (w && !S.worldFallback) {
      S.world = w;
      absorbQuest(w);
      if (w.ended && !S.ended) S.ended = true; // 另一台设备已经看过结局
    }
    syncTickets();      // 条件达成 / 老存档里去过的地方 → 自动补票并同步给另一台设备
    refreshHUD();
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

    bindAdmin();   // 隐藏应急入口（长按标题 5 秒），不占界面任何位置
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
       列表是动态生成的，委托式绑定在手机上也不会有几百个监听器。 */
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var sd = t.closest('[data-send]');
      if (sd) {
        e.preventDefault();
        var pid = sd.getAttribute('data-send');
        if (parcelState(pid) === 'ready') claimParcel(pid);
        else if (parcelState(pid) === 'fly') toast('这件还在路上，再等等', 2400);
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
        if (line) { toast(line.replace(/[（(].*?[）)]/g, ''), 3600); openMailPanel(); }
        return;
      }
    });
    var mAddr = $('#mail-addr');
    if (mAddr) mAddr.addEventListener('click', function () { takeAddrToday(); });
    var mTrade = $('#mail-trade');
    if (mTrade) mTrade.addEventListener('click', function () { tradeAddr(); });

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
    $('#tree-deco').addEventListener('click', function () { decorateTree(); });
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
    $('#end-overlay').addEventListener('click', function () { endNext(); });
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
    if (S.ending) { updateEnding(dt, ts); return; }

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

    if (S.backend.mode !== 'demo') {
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
        if (nearTree && treeStage() >= 3 && ts - S.heartT > 1000) {
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

    // ---- 结局触发（三重门：日期 + 任务 + 树全亮；已在共享数据里标记看过则不再触发） ----
    if (!S.ended && !S.ending && !S.interId && !S.mapId) {
      var w = curWorld();
      if (!(w && w.ended) && treeStage() >= 3 && S.quest.step >= 6 && endingUnlocked()) {
        startEnding();
      } else if (treeStage() >= 3 && S.quest.step >= 6 && !S.endHintShown) {
        S.endHintShown = true;
        var days = daysToChristmas();
        toast(days > 0
          ? '✨ 万事俱备！圣诞夜将在 2026 年 12 月 25 日到来（还有 ' + days + ' 天）'
          : '✨ 万事俱备，圣诞夜即将开始…', 5000);
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
    var targetCx = S.self.x - vwW / 2;
    var targetCy = S.self.y - vhW / 2;
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

  function decorateTree() {
    var stage = treeStage();
    if (stage >= 3) return;
    var cost = TREE_COST[stage];
    mutate(function (w) {
      w.res = w.res || { wood: 0, seeds: 0, flowers: 0, materials: 0 };
      var r = w.res;
      if ((r.wood || 0) < (cost.wood || 0) || (r.flowers || 0) < (cost.flowers || 0) || (r.materials || 0) < (cost.materials || 0)) return w;
      r.wood = (r.wood || 0) - (cost.wood || 0);
      r.flowers = (r.flowers || 0) - (cost.flowers || 0);
      r.materials = (r.materials || 0) - (cost.materials || 0);
      w.treeStage = stage + 1;
      return w;
    }).then(function (ok) {
      var newStage = treeStage();
      if (newStage > stage) {
        Snd.sfx('ding');
        burst(World.tree.x, World.tree.y - 120, 'spark', 14);
        closeAllPanels();
      } else {
        toast('材料还不够：去温室种植（木材/鲜花）→ 工坊做手工礼物 🎁');
      }
    });
  }

  /* ---------- 结局序列：Omo's Christmas Night ---------- */
  var END_LINES = [
    '平安夜。小镇的每一盏灯，都亮了起来。',
    '这棵圣诞树，是你们两个人一起、一天一天养出来的。',
    '从乌海的沙丘，到赛里木湖的湖水——这一路捡回来的回忆，都收在册子里了。',
    '现在，站到树下去吧。这是属于你们的夜晚。'
  ];
  function startEnding() {
    S.ending = { t: 0, phase: 0, santaX: 858, santaY: 648, glow: 0, line: -1 };
    S.interId = null;
    S.quest.step = 6;
    toast('✨ 小镇的灯，一盏一盏亮起来了…', 4000);
    burst(World.tree.x, World.tree.y - 120, 'spark', 30);
    if (S.backend.mode !== 'demo') S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, false, 0).catch(function () { });
  }
  function updateEnding(dt, ts) {
    var e = S.ending;
    e.t += dt;
    var tx = World.tree.x - S.view.w / 2;
    var ty = World.tree.y - 60 - S.view.h / 2;
    S.cam.x += (Math.max(0, Math.min(World.width - S.view.w, tx)) - S.cam.x) * Math.min(1, dt * 1.6);
    S.cam.y += (Math.max(0, Math.min(World.height - S.view.h, ty)) - S.cam.y) * Math.min(1, dt * 1.6);
    e.glow = Math.min(1, e.glow + dt * 0.3);
    if (Math.random() < dt * 6) burst(World.tree.x + (Math.random() - 0.5) * 200, World.tree.y - 100 - Math.random() * 120, 'spark', 1);
    if (e.t > 3.5) {
      e.santaX += (742 - e.santaX) * Math.min(1, dt * 0.9);
      e.santaY += (700 - e.santaY) * Math.min(1, dt * 0.9);
    }
    if (e.t > 7 && e.phase === 0) {
      e.phase = 1;
      e.line = 0;
      S.paused = true;
      showEndLine(0);
    }
    S.self.x += ((S.mySlot === 'a' ? 668 : 832) - S.self.x) * Math.min(1, dt * 0.8);
    S.self.y += (712 - S.self.y) * Math.min(1, dt * 0.8);
    S.self.dir = 0; S.self.moving = false; S.self.frame = 0;
  }
  function showEndLine(i) {
    var ov = $('#end-overlay');
    $('#end-text').textContent = END_LINES[i];
    $('#end-hint').textContent = (i < END_LINES.length - 1) ? '轻触继续 ▸' : '轻触开始 📸';
    ov.classList.remove('hidden');
  }
  function endNext() {
    var e = S.ending;
    if (!e || e.phase !== 1) return;
    e.line++;
    if (e.line < END_LINES.length) {
      showEndLine(e.line);
    } else {
      $('#end-overlay').classList.add('hidden');
      S.paused = false;
      S.ending = null;
      S.ended = true;
      mutate(function (w) { w.ended = 1; return w; });
      openPhoto();
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
    if (title) title.textContent = opt.mapId ? ('📷 ' + (opt.label || '旅行打卡')) : '📷 我们的圣诞合照';
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
      a.download = 'Omos-Christmas-Village-' + (S.photoOpt && S.photoOpt.mapId ? S.photoOpt.mapId : 'town') + '-' + Date.now() + '.png';
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
    ['#dlg', '#tree-panel', '#outfit-modal', '#menu-panel', '#end-overlay', '#book-panel',
      '#plot-panel', '#craft-panel', '#mem-photo', '#res-panel', '#quest-panel', '#settings-panel'].forEach(function (s) {
      var el = $(s); if (el) el.classList.add('hidden');
    });
    syncPanelChrome();
  }

  /* ---------- 照片：统一 1920×1080 横版 ----------
   * 两种照片（小镇最终合照 / 旅行打卡）用同一套尺寸和收尾，
   * 不截手机屏幕，全部在独立画布上重画，所以人物和环境都不会被 UI 压住。
   */
  var PHOTO_W = 1920, PHOTO_H = 1080;

  function photoNightSky(ctx, W, H) {
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#08122a');
    sky.addColorStop(0.45, '#15294a');
    sky.addColorStop(1, '#2c4666');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    var rnd = seeded(77);
    for (var i = 0; i < 150; i++) {
      var sx = rnd() * W, sy = rnd() * H * 0.6;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.18 + rnd() * 0.55) + ')';
      ctx.fillRect(sx, sy, 1.8 + rnd() * 1.6, 1.8 + rnd() * 1.6);
    }
    /* 月亮 + 月晕 */
    var mx = W - 250, my = 165;
    var hg = ctx.createRadialGradient(mx, my, 20, mx, my, 220);
    hg.addColorStop(0, 'rgba(255,247,214,.34)');
    hg.addColorStop(1, 'rgba(255,247,214,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(mx, my, 220, 0, 7); ctx.fill();
    ctx.fillStyle = '#fbf4d8';
    ctx.beginPath(); ctx.arc(mx, my, 56, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(226,220,190,.55)';
    ctx.beginPath(); ctx.arc(mx - 14, my - 12, 12, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 16, my + 14, 8, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 4, my - 24, 6, 0, 7); ctx.fill();
  }

  function photoMountains(ctx, W, H, baseY) {
    /* 后排更淡更远，前排更实——两排就够撑起纵深 */
    [[0.42, '#1b2c48', '#243756'], [0.52, '#22375a', '#2c4569']].forEach(function (row, ri) {
      var y = baseY - ri * 26;
      ctx.beginPath();
      ctx.moveTo(-40, baseY + 60);
      var step = W / 5;
      for (var i = 0; i <= 5; i++) {
        var px = i * step;
        var peak = y - (ri === 0 ? 120 : 168) - ((i * 53 + ri * 31) % 90);
        ctx.lineTo(px - step / 2, y - 30);
        ctx.lineTo(px, peak);
      }
      ctx.lineTo(W + 40, baseY + 60);
      ctx.closePath();
      ctx.fillStyle = row[1]; ctx.fill();
      /* 雪线 */
      ctx.save(); ctx.clip();
      ctx.fillStyle = row[2];
      ctx.fillRect(0, y - 210, W, 60);
      ctx.restore();
    });
  }

  function photoTownSilhouette(ctx, W, H, baseY) {
    var rnd = seeded(19);
    for (var b = 0; b < 12; b++) {
      var bw = 60 + rnd() * 80;
      var bh = 70 + rnd() * 90;
      var bx = -30 + b * (W / 11);
      var by = baseY - bh;
      ctx.fillStyle = 'rgba(16,26,44,.92)';
      ctx.fillRect(bx, by, bw, bh);
      /* 屋顶 */
      ctx.beginPath();
      ctx.moveTo(bx - 8, by + 4);
      ctx.lineTo(bx + bw / 2, by - 24 - rnd() * 14);
      ctx.lineTo(bx + bw + 8, by + 4);
      ctx.closePath();
      ctx.fill();
      /* 窗灯 */
      for (var wq = 0; wq < 3; wq++) {
        if (rnd() > 0.35) {
          ctx.fillStyle = 'rgba(255,206,130,' + (0.5 + rnd() * 0.4) + ')';
          ctx.fillRect(bx + 10 + wq * 22, by + 18 + (wq % 2) * 26, 11, 13);
        }
      }
      /* 屋顶积雪 */
      ctx.fillStyle = 'rgba(236,246,255,.35)';
      ctx.fillRect(bx - 4, by - 2, bw + 8, 4);
    }
  }

  function photoSnowGround(ctx, W, H, groundY) {
    var g = ctx.createLinearGradient(0, groundY, 0, H);
    g.addColorStop(0, '#cfdcee');
    g.addColorStop(0.35, '#bacbe4');
    g.addColorStop(1, '#8fa5c8');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 30);
    ctx.bezierCurveTo(W * 0.25, groundY - 6, W * 0.6, groundY + 16, W, groundY - 4);
    ctx.lineTo(W, H); ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    /* 雪面起伏 */
    var rnd = seeded(451);
    for (var i = 0; i < 26; i++) {
      var x = rnd() * W, y = groundY + 40 + rnd() * (H - groundY - 40);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.12 + rnd() * 0.22) + ')';
      ctx.beginPath();
      ctx.ellipse(x, y, 40 + rnd() * 90, 8 + rnd() * 14, 0, 0, 7);
      ctx.fill();
    }
  }

  function photoPerson(ctx, x, y, s, opt, isJulie, dir) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    /* 影子 */
    ctx.fillStyle = 'rgba(40,60,90,.22)';
    ctx.beginPath(); ctx.ellipse(0, 2, 30, 7, 0, 0, 7); ctx.fill();
    Sprites.drawCharacter(ctx, 0, 0, dir === undefined ? 0 : dir, 0, opt, isJulie, 800);
    ctx.restore();
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

  /* 小镇里的最终合照：整棵树 + 两个人 + 小镇背景都在画面里 */
  function renderTownPhoto(ctx, W, H) {
    var stage = Math.max(2, Math.min(3, treeStage()));
    var groundY = H * 0.63;

    photoNightSky(ctx, W, H);
    photoMountains(ctx, W, H, groundY - 40);
    photoTownSilhouette(ctx, W, H, groundY + 6);
    photoSnowGround(ctx, W, H, groundY);

    /* 树：用世界坐标套一层缩放搬到画面右侧（放大到接近满高，才有仪式感） */
    var s = 2.05;
    var treeScreenX = W * 0.655, treeScreenY = H * 0.825;
    ctx.save();
    ctx.translate(treeScreenX, treeScreenY);
    ctx.scale(s, s);
    ctx.translate(-World.tree.x, -World.tree.y);
    World.drawBigTree(ctx, World.tree, stage, 1000);
    ctx.restore();

    /* 两个人的暖光 */
    var glow = ctx.createRadialGradient(treeScreenX - 120, H * 0.82, 20, treeScreenX - 120, H * 0.82, 420);
    glow.addColorStop(0, 'rgba(255,206,132,.22)');
    glow.addColorStop(1, 'rgba(255,206,132,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, H * 0.5, W, H * 0.5);

    photoPerson(ctx, W * 0.285, H * 0.815, 3.4,
      Object.assign({}, CHAROPT.a, { outfit: getOutfit('a', 'winter') }), false, 0);
    photoPerson(ctx, W * 0.355, H * 0.822, 3.4,
      Object.assign({}, CHAROPT.b, { outfit: getOutfit('b', 'winter') }), true, 0);

    /* 心形 */
    ctx.fillStyle = 'rgba(242,109,125,.9)';
    [[W * 0.32, H * 0.62, 19], [W * 0.292, H * 0.675, 13], [W * 0.355, H * 0.685, 15]].forEach(function (h) {
      var hx = h[0], hy = h[1], hs = h[2];
      ctx.beginPath();
      ctx.moveTo(hx, hy + hs * 0.36);
      ctx.bezierCurveTo(hx - hs, hy - hs * 0.45, hx - hs * 0.42, hy - hs * 1.12, hx, hy - hs * 0.4);
      ctx.bezierCurveTo(hx + hs * 0.42, hy - hs * 1.12, hx + hs, hy - hs * 0.45, hx, hy + hs * 0.36);
      ctx.fill();
    });

    photoSnowfall(ctx, W, H, 150);
    photoVignette(ctx, W, H);

    /* 铭牌 */
    var pw = 1000, ph = 104, px = (W - pw) / 2, py = H - ph - 14;
    ctx.fillStyle = 'rgba(20,14,10,.72)';
    roundRectPath(ctx, px, py, pw, ph, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(240,192,64,.85)'; ctx.lineWidth = 3;
    roundRectPath(ctx, px + 10, py + 10, pw - 20, ph - 20, 15); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe08a';
    ctx.font = 'bold 38px "PingFang SC", Georgia, serif';
    ctx.fillText("Omo's Christmas Village", W / 2, py + 47);
    ctx.fillStyle = '#f4ead8';
    ctx.font = '22px "PingFang SC", Georgia, serif';
    ctx.fillText('✦ Charles ♥ Julie · 回忆 ' + foundCount() + ' 段 · ' + dayStr() + ' ✦', W / 2, py + 82);
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

  function renderPhoto(ctx, W, H, opt) {
    opt = opt || {};
    if (opt.mapId) renderTravelPhoto(ctx, W, H, opt.mapId, opt.label);
    else renderTownPhoto(ctx, W, H);
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
    World.npcs.forEach(function (n) { consider('npc', n.x, n.y, 85, '💬 和 ' + n.name + ' 交谈', n); });
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
      var stage = treeStage();
      var lines = (stage >= 2 && it.ref.lateLines) ? it.ref.lateLines : it.ref.lines;
      var idx = (S.npcIdx[it.ref.id] || 0);
      var commLine = talkComm(it.ref.id);
      openDialog(it.ref.name, commLine ? [lines[idx % lines.length], commLine] : lines[idx % lines.length]);
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
      /* v4.3：地图里的回忆是一封信——拆开会附一件当地特产和一封回信 */
      if (pl) {
        w.spec = w.spec || {};
        w.spec[pl.id] = w.spec[pl.id] || Date.now();
        w.res.flowers = (w.res.flowers || 0) + 1;
        w.mail = w.mail || [];
        w.mail.push({ place: pl.id, at: Date.now() });
      }
      /* 回忆本身就是「去过」的证明 → 那个地方的地址就到手了 */
      w.addr = w.addr || {};
      if (T() && T().has(m.id) && !w.addr[m.id]) w.addr[m.id] = Date.now();
      return w;
    }).then(function () {
      refreshHUD();
      if (pl) {
        toast('💭 收进回忆册 · ✉️ 信里还有 ' + pl.icon + ' ' + pl.item + ' 和 ' + pl.name + ' 的地址', 5200);
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
    if (c.type === 'tree') return '小镇的树长到第 ' + (c.n || 1) + ' 阶';
    if (c.type === 'visit') return '已经去过 ' + (c.n || 1) + ' 个地方';
    return '';
  }
  function ticketCondMet(id) {
    var tk = ticketOf(id);
    if (!tk || !tk.cond) return false;
    for (var i = 0; i < tk.cond.length; i++) if (condMet(tk.cond[i])) return true;
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
   * 应急管理（默认隐藏）
   *   入口：长按顶部标题 5 秒。界面上没有任何按钮，正常流程不会误触。
   *   口令：4 位数字（默认是圣诞节那天 1225）。前端只存哈希值，不存明文。
   *   说明：这是「隐藏入口」，不是真正的安全边界——网页是公开的，
   *   任何人都能改前端代码。真正需要防人的改动，必须走 Firebase 安全规则，
   *   这里所有写操作都仍然老老实实经过原来的 world 事务与规则校验。
   * ============================================================ */
  var ADMIN_HASH = 1786157946;   // djb2('omo1225')
  var adminOk = false;

  function djb2(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h;
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
    lines.push('<div class="admin-sec"><b>车票</b><span>' + owned.length + ' / 6' +
      (locked.length ? '　未获得：' + esc(locked.join('、')) : '　全部到手') + '</span></div>');

    var found = foundCount();
    var all = World.allMemories || [];
    var miss = all.filter(function (m) { return !S.quest.found[m.id]; }).map(function (m) { return m.title; });
    lines.push('<div class="admin-sec"><b>回忆</b><span>' + found + ' / ' + all.length +
      (miss.length ? '　未找到：' + esc(miss.slice(0, 6).join('、')) + (miss.length > 6 ? '…' : '') : '　全部收齐') + '</span></div>');

    var st = treeStage();
    var stName = ['小树苗', '已装饰', '挂上彩灯', '全树点亮'][Math.min(3, st)] || '小树苗';
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

    el.innerHTML = lines.join('');
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
    restore: '恢复上次备份'
  };

  function adminDo(kind) {
    var label = ADMIN_LABEL[kind] || kind;
    if (!window.confirm('确定要「' + label + '」吗？\n\n操作前会先备份当前进度，出问题可以从这里恢复。')) return;
    if (!backupWorld()) toast('⚠️ 备份没写进本机，仍然继续。');

    if (kind === 'tickets') {
      mutate(function (w) {
        w.tickets = w.tickets || {};
        TravelMaps.list().forEach(function (d) { if (!w.tickets[d.id]) w.tickets[d.id] = Date.now(); });
        return w;
      }).then(function () { renderAdminStatus(); toast('🎫 六张车票都补上了'); });
    } else if (kind === 'memories') {
      mutate(function (w) {
        w.quest = w.quest || {};
        w.quest.found = w.quest.found || {};
        (World.allMemories || []).forEach(function (m) { if (!w.quest.found[m.id]) w.quest.found[m.id] = Date.now(); });
        if ((w.quest.step || 0) < 4) w.quest.step = 4;
        return w;
      }).then(function () { renderAdminStatus(); toast('💭 回忆册补齐了'); });
    } else if (kind === 'tree') {
      mutate(function (w) { w.treeStage = 3; return w; })
        .then(function () { renderAdminStatus(); toast('🎄 树已经点亮到最后阶段'); });
    } else if (kind === 'ending') {
      S.adminEnding = true;
      mutate(function (w) {
        w.treeStage = 3;
        w.quest = w.quest || {};
        if ((w.quest.step || 0) < 6) w.quest.step = 6;
        w.ended = false;
        return w;
      }).then(function () {
        renderAdminStatus();
        closeAllPanelsSilent();
        S.paused = false;
        S.endHintShown = true;
        setTimeout(function () { if (!S.ending) startEnding(); }, 260);
        toast('🎁 结局开始了');
      });
    } else if (kind === 'restore') {
      var raw = null;
      try { raw = JSON.parse(localStorage.getItem('omo_admin_backup') || 'null'); } catch (e) { }
      if (!raw || !raw.world) { toast('还没有可恢复的备份'); return; }
      if (!window.confirm('恢复会覆盖当前进度（' + new Date(raw.at).toLocaleString() + ' 的备份）。确定？')) return;
      mutate(function () { return raw.world; }).then(function () {
        renderAdminStatus();
        toast('已恢复备份');
      });
    }
  }

  function bindAdmin() {
    var brand = document.querySelector('#topbar .brand');
    if (brand && !brand.dataset.adminBound) {
      brand.dataset.adminBound = '1';
      var timer = null, moved = false;
      var start = function () {
        moved = false;
        timer = setTimeout(function () {
          timer = null;
          if (!moved) {
            /* 松手后浏览器还会补一个 click（移动端可能延迟 0~300ms），
               而那时遮罩已经盖住全屏，会把刚打开的面板立刻关掉。
               开一个 1.5s 保护窗，让这次手势的余波够不着面板。 */
            S.adminGuardUntil = Date.now() + 1500;
            openAdminGate();
          }
        }, 5000);
      };
      var stop = function () { if (timer) { clearTimeout(timer); timer = null; } };
      brand.addEventListener('pointerdown', start);
      brand.addEventListener('pointerup', stop);
      brand.addEventListener('pointercancel', stop);
      brand.addEventListener('pointerleave', stop);
      brand.addEventListener('pointermove', function () { moved = true; });
    }
    var okBtn = $('#admin-pin-ok');
    if (okBtn && !okBtn.dataset.bound) {
      okBtn.dataset.bound = '1';
      okBtn.addEventListener('click', function () {
        var v = ($('#admin-pin').value || '').trim();
        if (djb2('omo' + v) === ADMIN_HASH) {
          adminOk = true;
          $('#admin-pin-wrap').classList.add('hidden');
          $('#admin-body').classList.remove('hidden');
          renderAdminStatus();
        } else {
          $('#admin-pin-err').classList.remove('hidden');
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
    var sub = $('#station-sub');
    if (sub) sub.textContent = '车票 ' + n + ' / 6';
    var note = $('#station-note');
    if (note) {
      note.textContent = n >= 6
        ? '六张票都到手了。想去哪儿，就挑一张。'
        : '有票的方向才能上车。没票的那几张，先把小镇上的日子过得再热闹一点。';
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
    $('#ticket-count').textContent = n + ' / 6';
    $('#ticket-note').textContent = n >= 6
      ? '集齐了。六张票、六个地方，都去过一遍。'
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
    if (S.backend.mode !== 'demo') {
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
    if (S.backend.mode !== 'demo') {
      S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, false, 0).catch(function () { });
    }
  }

  /* ---------- 面板 / 对话 ---------- */
  function pause() { S.paused = true; }
  function unpause() { S.paused = false; }

  /* 所有面板集中登记：关闭时统一处理，新增面板不会漏关 */
  var PANEL_IDS = ['#dlg', '#tree-panel', '#outfit-modal', '#menu-panel', '#mem-photo',
    '#book-panel', '#plot-panel', '#craft-panel', '#res-panel', '#quest-panel', '#settings-panel',
    '#station-panel', '#ticket-panel', '#admin-panel', '#pack-panel', '#mail-panel'];

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
    var names = ['一棵安静的小树苗，等着你们来装点。', '已经挂上了彩球和金色灯带，越来越有味道了。', '彩灯亮起来了！一闪一闪的。', '✨ 全树点亮！这是属于你们的小镇之光。'];
    $('#tree-stage-text').textContent = '当前阶段：' + ['小树苗', '已装饰', '挂上彩灯', '全树点亮'][stage];
    $('#tree-desc').textContent = names[stage];
    var need = $('#tree-need');
    var deco = $('#tree-deco');
    if (stage >= 3) {
      need.textContent = '🎄 树已经全亮。圣诞夜：2026 年 12 月 25 日（今天 ' + dayStr() + '）';
      deco.classList.add('hidden');
    } else {
      var cost = TREE_COST[stage];
      var r = worldRes();
      var enough = (r.wood || 0) >= (cost.wood || 0) && (r.flowers || 0) >= (cost.flowers || 0) && (r.materials || 0) >= (cost.materials || 0);
      need.textContent = '升到「' + ['已装饰', '挂上彩灯', '全树点亮'][stage] + '」需要：🪵 ' + (cost.wood || 0) + ' · 🌸 ' + (cost.flowers || 0) + ' · 🎁 ' + (cost.materials || 0) +
        '（现有 🪵 ' + (r.wood || 0) + ' 🌸 ' + (r.flowers || 0) + ' 🎁 ' + (r.materials || 0) + '）';
      deco.classList.remove('hidden');
      deco.textContent = enough ? '✨ 使用材料装饰 → ' + ['已装饰', '挂上彩灯', '全树点亮'][stage] : '材料还不够（去温室种植 → 工坊制作）';
      deco.disabled = !enough;
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
      '<div class="res-line"><b>🎄 圣诞树</b><span>' + ['小树苗', '已装饰', '挂上彩灯', '全树点亮'][treeStage()] + '</span></div>';
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
      ['小树苗', '已装饰', '挂上彩灯', '全树点亮'][treeStage()] +
      ' · 回忆 ' + foundCount() + ' / ' + ((window.Memories || []).length) +
      ' · 车票 ' + ticketOwnedCount() + ' / 6' +
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
          if (S.ending && n.id === 'santa') return;
          if (n.id === 'santa') Sprites.drawSanta(ctx, n.x, n.y, ts);
          else if (n.id === 'snowman') Sprites.drawSnowman(ctx, n.x, n.y, ts);
          else if (n.style) Sprites.drawVillager(ctx, n.x, n.y, ts, n.style, Math.floor(ts / 320) % 4);
          else if (n.id === 'elf') Sprites.drawElf(ctx, n.x, n.y, ts, Math.floor(ts / 300) % 4);
          else Sprites.drawBarista(ctx, n.x, n.y, ts, Math.floor(ts / 300) % 4);
          nameTag(ctx, n.x, n.y - (n.id === 'santa' ? 84 : 66), n.name, false, '#ffe08a');
        } });
      });

      if (S.ending) {
        var e = S.ending;
        drawables.push({ y: e.santaY, fn: function () {
          Sprites.drawSanta(ctx, e.santaX, e.santaY, ts);
          nameTag(ctx, e.santaX, e.santaY - 84, '圣诞老人', false, '#ffe08a');
        } });
      }

      drawables.sort(function (a, b) { return a.y - b.y; }).forEach(function (d) { d.fn(); });

      var snowBoost = S.ending ? 1.6 : 1;
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      S.flakes.forEach(function (f) {
        f.y += f.v * 0.016 * snowBoost; f.x += Math.sin(ts / 900 + f.ph) * 0.4 * snowBoost;
        if (f.y > World.height) { f.y = -6; f.x = Math.random() * World.width; }
        if (f.x > S.cam.x - 10 && f.x < S.cam.x + S.view.w + 10 && f.y > S.cam.y - 10 && f.y < S.cam.y + S.view.h + 10) {
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (S.ending ? 1.3 : 1), 0, 7); ctx.fill();
        }
      });
    }

    drawParticles(ctx);
    ctx.restore();

    if (S.ending && S.ending.glow > 0) {
      ctx.fillStyle = 'rgba(255,190,110,' + (0.16 * S.ending.glow) + ')';
      ctx.fillRect(0, 0, S.view.w, S.view.h);
    }

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
    return true;
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
      tickets: ticketOwnedCount(), spots: Object.keys(S.spots || {}).length,
      stage: treeStage(),
      joy: { dx: S.joy.dx, dy: S.joy.dy, mag: S.joy.mag, active: S.joy.active },
      view: { w: S.view.w, h: S.view.h }, dpr: S.dpr,
      cam: { x: S.cam.x, y: S.cam.y }, slot: S.mySlot,
      outfit: getOutfit(S.mySlot, 'winter'), otherOutfit: getOutfit(S.otherSlot, 'winter'),
      res: Object.assign({}, worldRes()),
      chapter: chapterNo(), chapterDay: chapterDayStr(),
      ranch: Object.assign({}, (curWorld() && curWorld().ranch) || {}),
      indoors: !!S.interId, memoryCount: foundCount()
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
    /* v4.1 给验收脚本用的口子（只在 ?dev=1 时有意义，但本身不改变游戏行为） */
    devTicketBook: function () { openTicketBook(); },
    devBook: function () { openBook(); },
    devAdmin: function () { openAdminGate(); },
    devAdminUnlock: function (pin) { return djb2('omo' + (pin || '1225')) === ADMIN_HASH; },
    devAdminAct: function (k) { adminDo(k); },
    devPhoto: function (opt) { openPhoto(opt); },
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
