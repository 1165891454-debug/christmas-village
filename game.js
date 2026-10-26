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
    prevPresence: null, prevStage: -1, heartT: 0,
    q: { lvl: 2, acc: 0, n: 0 },
    quest: { step: 0, talked: {}, visited: {}, found: {} },
    world: null, localWorld: null, worldFallback: false, worldErrShown: false,
    ending: null, ended: false, photo: false, lastQuestText: '',
    endHintShown: false, plotIdx: 0,
    dev: (typeof location !== 'undefined') && /[?&#]dev=1/.test(location.search + location.hash)
  };

  var SPEED = 150;
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
    { id: 'bird', name: '木头小鸟', wood: 4, flowers: 0, desc: '刻了一只圆滚滚的小鸟，翅膀还会扇。' },
    { id: 'musicbox', name: '八音盒', wood: 6, flowers: 4, desc: '打开盖子，会响起你们都熟悉的那段旋律。' },
    { id: 'star', name: '星星挂饰', wood: 2, flowers: 6, desc: '磨得亮亮的，挂在高高的枝头最合适。' }
  ];

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
    if (el) el.textContent = '🪵 ' + (r.wood || 0) + ' · 🌸 ' + (r.flowers || 0) + ' · 🌱 ' + (r.seeds || 0) + ' · 🎁 ' + (r.materials || 0);
  }

  // 把共享 quest 合并进本地镜像（只吸收，不回写）
  function absorbQuest(w) {
    if (!w || !w.quest) return;
    var q = w.quest;
    ['talked', 'visited', 'found'].forEach(function (k) {
      var rem = q[k] || {};
      S.quest[k] = S.quest[k] || {};
      for (var key in rem) if (rem[key] && !S.quest[k][key]) S.quest[k][key] = rem[key];
    });
    if ((q.step || 0) > S.quest.step) S.quest.step = q.step;
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
    var d = new Date();
    if (d.getFullYear() > 2026) return true;
    return d.getFullYear() === 2026 && d.getMonth() === 11 && d.getDate() >= 25;
  }
  function daysToChristmas() {
    return Math.ceil((new Date(2026, 11, 25) - new Date()) / 86400000);
  }

  // ---------- 主线任务（v2：共享 + 材料版）----------
  var QUESTS = [
    '🎄 走近广场的圣诞树看看吧',
    '💬 去和圣诞老人聊聊吧',
    '💬 认识小镇的居民们（0/3）',
    '🧭 探索小镇：木屋 · 咖啡 · 温室 · 工坊（0/4）',
    '✨ 寻找闪光的旅行回忆（0/3）',
    '🪵 收集材料，把圣诞树装饰到全亮',
    '🎄 圣诞夜即将开始…'
  ];
  function foundCount() { return Object.keys(S.quest.found).length; }
  function talkedExtra() { return ['snowman', 'elf', 'barista'].filter(function (k) { return S.quest.talked[k]; }).length; }
  function visitedCount() { return Object.keys(S.quest.visited).length; }
  function questText() {
    var st = S.quest.step;
    if (st >= 6) return '🎄 圣诞夜即将开始…（2026 年 12 月 25 日）';
    if (st === 5) {
      var stage = treeStage();
      if (stage >= 3) return '🎄 圣诞树已经全亮！等圣诞夜到来（12 月 25 日）';
      var cost = TREE_COST[stage] || TREE_COST[0];
      var r = worldRes();
      return '🪵 装饰到「' + ['已装饰', '挂上彩灯', '全树点亮'][stage] + '」还差：🪵 ' + Math.max(0, (cost.wood || 0) - (r.wood || 0)) + ' 🌸 ' + Math.max(0, (cost.flowers || 0) - (r.flowers || 0)) + ' 🎁 ' + Math.max(0, (cost.materials || 0) - (r.materials || 0));
    }
    var t = QUESTS[Math.min(st, QUESTS.length - 1)];
    return t.replace('（0/3）', '（' + (st === 2 ? talkedExtra() : foundCount()) + '/3）')
            .replace('（0/4）', '（' + visitedCount() + '/4）');
  }
  function updateQuest() {
    var st = S.quest.step;
    if (st === 0) {
      var d = Math.sqrt(Math.pow(S.self.x - World.tree.x, 2) + Math.pow(S.self.y - World.tree.y, 2));
      if (d < 150) { S.quest.step = 1; toast('🎅 圣诞老人好像有话想跟你们说'); syncQuest(); }
    } else if (st === 1 && S.quest.talked.santa) {
      S.quest.step = 2; toast('📋 新任务：认识小镇的居民们'); syncQuest();
    } else if (st === 2 && talkedExtra() >= 3) {
      S.quest.step = 3; toast('📋 新任务：探索小镇的四个角落'); syncQuest();
    } else if (st === 3 && visitedCount() >= 4) {
      S.quest.step = 4; toast('📋 新任务：寻找闪光的旅行回忆 ✨'); syncQuest();
    } else if (st === 4 && foundCount() >= 3) {
      S.quest.step = 5; toast('🪵 收集材料装饰圣诞树：温室种植 → 工坊制作 → 回到树下'); syncQuest();
    } else if (st === 5 && treeStage() >= 3) {
      S.quest.step = 6; syncQuest();
    }
  }
  function checkVisitZones() {
    if (S.interId || S.quest.step > 3) return;
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
    if (saved && typeof saved.x === 'number') {
      S.self.x = saved.x; S.self.y = saved.y;
    } else {
      S.self.x = S.mySlot === 'a' ? 640 : 860;
      S.self.y = 720;
    }
    S.remote.x = S.otherSlot === 'a' ? 640 : 860;
    S.remote.y = 720; S.remote.tx = S.remote.x; S.remote.ty = S.remote.y;

    S.parts = []; S.interId = null; S.outdoorPos = null;
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
    S.active = true;
    refreshHUD();
    if (S.dev) {
      var dc = $('#dev-chip');
      if (dc) dc.classList.remove('hidden');
      toast('🛠️ 开发测试模式：生长 6-10 秒 · 日期门放开', 4000);
    }
    requestAnimationFrame(loop);
  }

  function active() { return S.active; }

  function resize() {
    if (!S.canvas) return;
    var cap = [1, 1.5, 2][S.q.lvl];
    var dpr = Math.min(window.devicePixelRatio || 1, cap);
    S.dpr = dpr;
    S.view.w = S.canvas.clientWidth;
    S.view.h = S.canvas.clientHeight;
    S.canvas.width = Math.round(S.view.w * dpr);
    S.canvas.height = Math.round(S.view.h * dpr);
    S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    resize();
  }

  /* ---------- 数据入口（app.js 调用）---------- */
  function onData(d) {
    S.data = d;
    if (!S.active || !d) return;
    var w = d.world;
    if (w && !S.worldFallback) {
      S.world = w;
      absorbQuest(w);
      if (w.ended && !S.ended) S.ended = true; // 另一台设备已经看过结局
    }
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
    window.addEventListener('resize', resize);

    window.addEventListener('keydown', function (e) {
      if (S.paused && e.key !== 'Escape') return;
      S.keys[e.key.toLowerCase()] = true;
      if ((e.key === 'e' || e.key === 'E' || e.key === ' ') && S.curInteract) { doInteract(); e.preventDefault(); }
      if (e.key === 'Escape') { closeAllPanels(); }
    });
    window.addEventListener('keyup', function (e) { S.keys[e.key.toLowerCase()] = false; });

    document.addEventListener('touchmove', function (e) {
      if (S.active) e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', function (e) { if (S.active) e.preventDefault(); });
    document.addEventListener('dblclick', function (e) { if (S.active) e.preventDefault(); });

    // 首次触摸/点击后启动背景音乐（浏览器策略要求用户手势）
    function firstGesture() {
      document.removeEventListener('pointerdown', firstGesture);
      if (Snd.isOn()) Snd.startBgm();
    }
    document.addEventListener('pointerdown', firstGesture);

    // 虚拟摇杆（触摸）
    var base = $('#joy-base'), knob = $('#joy-knob');
    function joyStart(e) {
      var t = e.changedTouches ? e.changedTouches[0] : e;
      S.joy.active = true; S.joy.id = t.identifier !== undefined ? t.identifier : 'm';
      var rect = base.getBoundingClientRect();
      S.joy.bx = rect.left + rect.width / 2; S.joy.by = rect.top + rect.height / 2;
      joyMove(e);
    }
    function joyMove(e) {
      if (!S.joy.active) return;
      var list = e.changedTouches || [e];
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (S.joy.id !== 'm' && t.identifier !== S.joy.id) continue;
        var dx = t.clientX - S.joy.bx, dy = t.clientY - S.joy.by;
        var len = Math.sqrt(dx * dx + dy * dy), max = 46;
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        S.joy.dx = dx / max; S.joy.dy = dy / max;
        knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      }
      e.preventDefault();
    }
    function joyEnd(e) {
      var list = e.changedTouches || [e];
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (S.joy.id === 'm' || t.identifier === S.joy.id) {
          S.joy.active = false; S.joy.dx = 0; S.joy.dy = 0;
          knob.style.transform = 'translate(0,0)';
        }
      }
    }
    base.addEventListener('touchstart', joyStart, { passive: false });
    base.addEventListener('touchmove', joyMove, { passive: false });
    base.addEventListener('touchend', joyEnd);
    base.addEventListener('touchcancel', joyEnd);
    base.addEventListener('mousedown', joyStart);
    window.addEventListener('mousemove', function (e) { if (S.joy.active && S.joy.id === 'm') joyMove(e); });
    window.addEventListener('mouseup', function (e) { if (S.joy.id === 'm') joyEnd(e); });

    $('#btn-interact').addEventListener('click', function () { doInteract(); });
    $('#btn-menu').addEventListener('click', function () { toggleMenu(); });
    $('#menu-close').addEventListener('click', function () { closeAllPanels(); });
    $('#menu-outfit').addEventListener('click', function () { closeAllPanels(); openOutfit(); });
    $('#menu-tree').addEventListener('click', function () { closeAllPanels(); openTreePanel(); });
    $('#menu-invite').addEventListener('click', function () { closeAllPanels(); S.opts.invite && S.opts.invite(); });
    $('#menu-photo').addEventListener('click', function () { closeAllPanels(); openPhoto(); });
    $('#menu-book').addEventListener('click', function () { closeAllPanels(); openBook(); });
    var mMusic = $('#menu-music');
    if (mMusic) mMusic.addEventListener('click', function () {
      var nowOn = Snd.toggle();
      mMusic.textContent = nowOn ? '🔊 音乐音效：开' : '🔈 音乐音效：关';
      toast(nowOn ? '音乐已开启 🎵' : '音乐已关闭');
    });
    $('#menu-leave').addEventListener('click', function () { S.opts.onLeave && S.opts.onLeave(); });
    $('#dlg-close').addEventListener('click', function () { closeAllPanels(); });
    $('#dlg-next').addEventListener('click', function () { dlgNext(); });
    $('#tree-deco').addEventListener('click', function () { decorateTree(); });
    $('#tree-close').addEventListener('click', function () { closeAllPanels(); });
    $('#outfit-close').addEventListener('click', function () { closeAllPanels(); });
    $('#mem-close').addEventListener('click', function () { closeAllPanels(); });
    $('#book-close').addEventListener('click', function () { closeAllPanels(); });
    $('#plot-close').addEventListener('click', function () { closeAllPanels(); });
    $('#craft-close').addEventListener('click', function () { closeAllPanels(); });
    var bpf = $('#btn-plant-flower'), bpt = $('#btn-plant-tree'), bhv = $('#btn-harvest');
    if (bpf) bpf.addEventListener('click', function () { plantSeed(S.plotIdx, 'flower'); });
    if (bpt) bpt.addEventListener('click', function () { plantSeed(S.plotIdx, 'tree'); });
    if (bhv) bhv.addEventListener('click', function () { harvest(S.plotIdx); });
    RECIPES.forEach(function (rc) {
      var b = $('#craft-' + rc.id);
      if (b) b.addEventListener('click', function () { craft(rc); });
    });
    $('#end-overlay').addEventListener('click', function () { endNext(); });
    $('#photo-close').addEventListener('click', function () { closePhoto(); });
    $('#photo-save').addEventListener('click', function () { savePhoto(); });
    document.querySelectorAll('#outfit-list .outfit-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        S.backend.setOutfit(b.dataset.outfit).then(function () {
          toast('换上了「' + b.textContent.trim() + '」✨');
          closeAllPanels();
        }).catch(function (e) { toast('换装失败：' + e.message); });
      });
    });
    window.addEventListener('orientationchange', function () { setTimeout(resize, 300); });
  }

  /* ---------- 碰撞 ---------- */
  function curInt() { return S.interId ? World.getInterior(S.interId) : null; }
  function hits(x, y) {
    var bx = x - 12, by = y - 12, bw = 24, bh = 14;
    var inter = curInt();
    var list = inter ? inter.obstacles : World.obstacles;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (bx < o.x + o.w && bx + bw > o.x && by < o.y + o.h && by + bh > o.y) return true;
    }
    return false;
  }

  /* ---------- 主循环 ---------- */
  var lastT = 0;
  function loop(ts) {
    if (!S.active) return;
    var dt = Math.min((ts - lastT) / 1000 || 0.016, 0.05);
    lastT = ts;
    perfTick(dt);
    if (!S.paused) update(dt, ts);
    draw(ts);
    requestAnimationFrame(loop);
  }

  function update(dt, ts) {
    if (S.ending) { updateEnding(dt, ts); return; }

    var dx = 0, dy = 0;
    if (S.keys['w'] || S.keys['arrowup']) dy -= 1;
    if (S.keys['s'] || S.keys['arrowdown']) dy += 1;
    if (S.keys['a'] || S.keys['arrowleft']) dx -= 1;
    if (S.keys['d'] || S.keys['arrowright']) dx += 1;
    dx += S.joy.dx; dy += S.joy.dy;
    var len = Math.sqrt(dx * dx + dy * dy);
    var moving = len > 0.12;
    if (moving) {
      dx /= len; dy /= len;
      var nx = S.self.x + dx * SPEED * dt;
      var ny = S.self.y + dy * SPEED * dt;
      if (!hits(nx, S.self.y)) S.self.x = nx;
      if (!hits(S.self.x, ny)) S.self.y = ny;
      var inter = curInt();
      var iw = inter ? inter.w : World.width;
      var ih = inter ? inter.h : World.height;
      S.self.x = Math.max(30, Math.min(iw - 30, S.self.x));
      S.self.y = Math.max(inter ? 150 : 70, Math.min(ih - 24, S.self.y));
      if (Math.abs(dx) > Math.abs(dy)) S.self.dir = dx < 0 ? 2 : 3;
      else S.self.dir = dy < 0 ? 1 : 0;
      S.self.animT += dt;
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
        S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, moving, S.interId || 0)
          .catch(function () { });
      }
    }

    if (S.remote.inter === (S.interId || 0)) {
      S.remote.x += (S.remote.tx - S.remote.x) * Math.min(1, dt * 8);
      S.remote.y += (S.remote.ty - S.remote.y) * Math.min(1, dt * 8);
    }

    // 双人互动（爱心 / 树下星光）
    if (S.remote.seen && S.remote.inter === (S.interId || 0)) {
      var pd = Math.sqrt(Math.pow(S.self.x - S.remote.x, 2) + Math.pow(S.self.y - S.remote.y, 2));
      if (pd < 140 && ts - S.heartT > 1400) {
        S.heartT = ts;
        burst((S.self.x + S.remote.x) / 2, (S.self.y + S.remote.y) / 2 - 46, 'heart', 1);
      }
      if (!S.interId) {
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
    updateQuest();

    // ---- 结局触发（三重门：日期 + 任务 + 树全亮；已在共享数据里标记看过则不再触发） ----
    if (!S.ended && !S.ending && !S.interId) {
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
    var iw2 = inter2 ? inter2.w : World.width;
    var ih2 = inter2 ? inter2.h : World.height;
    var targetCx = S.self.x - S.view.w / 2;
    var targetCy = S.self.y - S.view.h / 2;
    S.cam.x = iw2 <= S.view.w ? (iw2 - S.view.w) / 2 : Math.max(0, Math.min(iw2 - S.view.w, targetCx));
    S.cam.y = ih2 <= S.view.h ? (ih2 - S.view.h) / 2 : Math.max(0, Math.min(ih2 - S.view.h, targetCy));
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

  function craft(recipe) {
    mutate(function (w) {
      w.res = w.res || { wood: 0, seeds: 0, flowers: 0, materials: 0 };
      var r = w.res;
      if ((r.wood || 0) < recipe.wood || (r.flowers || 0) < recipe.flowers) return w;
      r.wood -= recipe.wood; r.flowers -= recipe.flowers;
      r.materials = (r.materials || 0) + 1;
      w.crafted = w.crafted || {};
      w.crafted[recipe.id] = (w.crafted[recipe.id] || 0) + 1;
      return w;
    }).then(function (ok) {
      var w = curWorld();
      var cnt = w && w.crafted && w.crafted[recipe.id];
      var r = worldRes();
      if ((r.materials || 0) > 0 && (S._lastMats || 0) !== (r.materials || 0)) {
        S._lastMats = r.materials;
        Snd.sfx('craft');
        toast('做好了「' + recipe.name + '」🎁 —— ' + recipe.desc);
        closeAllPanels();
      } else if (!cnt || (r.materials || 0) <= (S._lastMats || 0)) {
        toast('材料还不够：需要 🪵 ' + recipe.wood + ' 🌸 ' + recipe.flowers);
      }
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
    '从乌海的沙丘，到赛里木湖的湖水——十六段回忆，一路收集到了这里。',
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
  function openPhoto() {
    S.photo = true;
    S.paused = true;
    closeAllPanelsSilent();
    var cv = $('#photo-canvas');
    cv.width = 1125; cv.height = 1500;
    renderPhoto(cv.getContext('2d'), 1125, 1500);
    try {
      var url = cv.toDataURL('image/png');
      var img = $('#photo-img');
      img.src = url;
      img.style.display = 'block';
      cv.style.display = 'none';
      $('#photo-note').textContent = '📱 iPhone：长按图片 → 「存储到照片」';
    } catch (err) {
      cv.style.display = 'block';
      $('#photo-note').textContent = '长按上方画布保存';
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
      a.download = 'Omos-Christmas-Village-2026.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast('已尝试保存，若未弹出请长按图片存储 📱');
    } catch (e) {
      toast('请长按图片 → 「存储到照片」');
    }
  }
  function closeAllPanelsSilent() {
    ['#dlg', '#tree-panel', '#outfit-modal', '#menu-panel', '#end-overlay', '#book-panel', '#plot-panel', '#craft-panel', '#mem-photo'].forEach(function (s) {
      var el = $(s); if (el) el.classList.add('hidden');
    });
  }

  function renderPhoto(ctx, W, H) {
    var stage = Math.max(2, Math.min(3, treeStage()));
    var memN = foundCount();
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0d1c3a'); sky.addColorStop(0.6, '#1e3357'); sky.addColorStop(1, '#31486e');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < 90; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.random() * 0.6) + ')';
      ctx.fillRect(Math.random() * W, Math.random() * H * 0.55, 2.2, 2.2);
    }
    ctx.fillStyle = '#f6f0d8';
    ctx.beginPath(); ctx.arc(W - 190, 170, 52, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(13,28,58,.25)';
    ctx.beginPath(); ctx.arc(W - 172, 158, 44, 0, 7); ctx.fill();
    for (var bld = 0; bld < 9; bld++) {
      var bx = 40 + bld * 128, bw = 70 + (bld % 3) * 26, bh = 70 + (bld % 4) * 34;
      ctx.fillStyle = '#16223d';
      ctx.fillRect(bx, H * 0.52 - bh, bw, bh);
      ctx.fillStyle = '#0f1830';
      ctx.beginPath(); ctx.moveTo(bx - 8, H * 0.52 - bh); ctx.lineTo(bx + bw / 2, H * 0.52 - bh - 26); ctx.lineTo(bx + bw + 8, H * 0.52 - bh); ctx.closePath(); ctx.fill();
      for (var wl = 0; wl < 4; wl++) {
        if ((bld + wl) % 3 !== 0) {
          ctx.fillStyle = 'rgba(255,210,120,.85)';
          ctx.fillRect(bx + 10 + (wl % 2) * 30, H * 0.52 - bh + 14 + Math.floor(wl / 2) * 26, 12, 14);
        }
      }
    }
    var gr = ctx.createLinearGradient(0, H * 0.5, 0, H);
    gr.addColorStop(0, '#3d5578'); gr.addColorStop(0.35, '#7f97ba'); gr.addColorStop(1, '#c6d4ea');
    ctx.fillStyle = gr; ctx.fillRect(0, H * 0.52, W, H * 0.48);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    for (var sp = 0; sp < 60; sp++) {
      ctx.beginPath(); ctx.ellipse(Math.random() * W, H * 0.56 + Math.random() * H * 0.42, 10 + Math.random() * 26, 4 + Math.random() * 8, 0, 0, 7); ctx.fill();
    }

    ctx.save();
    ctx.translate(W / 2 - 750 * 2.1, H * 0.56 - 560 * 2.1);
    ctx.scale(2.1, 2.1);
    World.drawBigTree(ctx, World.tree, stage, 1000);
    Sprites.drawSanta(ctx, 828, 640, 1000);
    Sprites.drawSnowman(ctx, 560, 650, 1200);
    ctx.restore();

    ctx.save();
    ctx.translate(W / 2, H * 0.82);
    ctx.scale(4.4, 4.4);
    Sprites.drawCharacter(ctx, -46, 0, 0, 0, Object.assign({}, CHAROPT.a, { outfit: getOutfit('a', 'winter') }), false, 800);
    Sprites.drawCharacter(ctx, 46, 0, 0, 0, Object.assign({}, CHAROPT.b, { outfit: getOutfit('b', 'winter') }), true, 800);
    ctx.restore();
    ctx.fillStyle = '#f26d7d';
    [[W / 2 - 60, H * 0.62, 9], [W / 2 + 54, H * 0.60, 7], [W / 2, H * 0.57, 11]].forEach(function (h) {
      var s = h[2];
      ctx.beginPath();
      ctx.moveTo(h[0], h[1] + s * 0.35);
      ctx.bezierCurveTo(h[0] - s, h[1] - s * 0.45, h[0] - s * 0.42, h[1] - s * 1.1, h[0], h[1] - s * 0.4);
      ctx.bezierCurveTo(h[0] + s * 0.42, h[1] - s * 1.1, h[0] + s, h[1] - s * 0.45, h[0], h[1] + s * 0.35);
      ctx.fill();
    });

    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (var fl = 0; fl < 130; fl++) {
      ctx.globalAlpha = 0.4 + Math.random() * 0.5;
      ctx.beginPath(); ctx.arc(Math.random() * W, Math.random() * H, 1.5 + Math.random() * 3, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(10,20,40,0)'); vg.addColorStop(1, 'rgba(10,20,40,.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(40,26,14,.88)';
    roundRectPath(ctx, W / 2 - 420, H - 240, 840, 150, 26);
    ctx.fill();
    ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 5;
    roundRectPath(ctx, W / 2 - 404, H - 226, 808, 122, 18);
    ctx.stroke();
    ctx.fillStyle = '#f4ead8';
    ctx.font = 'bold 64px "PingFang SC", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText("Omo's Christmas Village", W / 2, H - 168);
    ctx.fillStyle = '#ffe08a';
    ctx.font = '34px "PingFang SC", Georgia, serif';
    ctx.fillText('✦ Charles ♥ Julie · 回忆 ' + memN + '/16 · ' + dayStr() + ' ✦', W / 2, H - 112);
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
      consider('exit', inter.exit.x, inter.exit.y, 70, '🚪 回到小镇', inter.exit);
      return best;
    }
    World.npcs.forEach(function (n) { consider('npc', n.x, n.y, 85, '💬 和 ' + n.name + ' 交谈', n); });
    World.doors.forEach(function (dr) {
      var b = World.buildings.filter(function (x) { return x.id === dr.id; })[0];
      var enterable = b && b.kind !== 'shop' && b.kind !== 'stall';
      consider('door', dr.x, dr.y, 78, enterable ? ('🚪 进入 ' + dr.name) : ('👀 ' + dr.name), dr);
    });
    consider('tree', World.tree.x, World.tree.y + 10, 120, '🎄 查看圣诞树', World.tree);
    World.eggs.forEach(function (e) {
      var found = S.quest.found[e.id];
      consider('egg', e.x, e.y, 46, found ? '💭 重温这段回忆' : '✨ 拾起闪光的回忆', e);
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
      var stage = treeStage();
      var lines = (stage >= 2 && it.ref.lateLines) ? it.ref.lateLines : it.ref.lines;
      var idx = (S.npcIdx[it.ref.id] || 0);
      openDialog(it.ref.name, lines[idx % lines.length]);
      S.npcIdx[it.ref.id] = idx + 1;
      if (!S.quest.talked[it.ref.id]) {
        S.quest.talked[it.ref.id] = 1;
        updateQuest(); syncQuest();
      }
    } else if (it.type === 'door') {
      var b = World.buildings.filter(function (x) { return x.id === it.ref.id; })[0];
      if (!b) return;
      if (b.kind === 'shop') openOutfit();
      else if (b.kind === 'stall') openDialog(b.name, [b.hint]);
      else enterIndoor(b.id);
    } else if (it.type === 'tree') {
      openTreePanel();
      updateQuest();
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
    mutate(function (w) {
      w.quest = w.quest || { step: 0, talked: {}, visited: {}, found: {} };
      w.quest.found = w.quest.found || {};
      if (w.quest.found[m.id]) return w; // 对方先收集过：只补本地记录，不重复发种子
      w.quest.found[m.id] = Date.now();
      w.res = w.res || { wood: 0, seeds: 0, flowers: 0, materials: 0 };
      w.res.seeds = (w.res.seeds || 0) + 1; // 一段回忆，化作一颗种子
      return w;
    }).then(function () {
      refreshHUD();
      var total = World.eggs.length;
      toast('💭 收集了旅行的回忆（' + foundCount() + '/' + total + '）· 回忆化作一颗种子 🌱');
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

  /* ---------- 室内 / 室外 ---------- */
  function enterIndoor(id) {
    var inter = World.getInterior(id);
    if (!inter) return;
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
  function closeAllPanels() {
    ['#dlg', '#tree-panel', '#outfit-modal', '#menu-panel', '#mem-photo', '#book-panel', '#plot-panel', '#craft-panel'].forEach(function (s) { $(s).classList.add('hidden'); });
    unpause();
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

  /* ---------- 回忆册 ---------- */
  function openBook() {
    var list = $('#book-list');
    if (!list) return;
    list.innerHTML = '';
    var found = S.quest.found || {};
    World.eggs.forEach(function (m, i) {
      var unlocked = !!found[m.id];
      var div = document.createElement('div');
      div.className = 'book-item' + (unlocked ? '' : ' locked');
      var cv = document.createElement('canvas');
      cv.width = 320; cv.height = 200;
      var g = cv.getContext('2d');
      if (unlocked && window.MemoryArt && MemoryArt[m.id]) {
        try { MemoryArt[m.id](g, 320, 200); } catch (e) {
          g.fillStyle = '#2a3350'; g.fillRect(0, 0, 320, 200);
        }
      } else {
        g.fillStyle = '#243050'; g.fillRect(0, 0, 320, 200);
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.font = 'bold 64px sans-serif'; g.textAlign = 'center';
        g.fillText('?', 160, 122);
        g.font = '14px sans-serif';
        g.fillText('待发现', 160, 170);
      }
      div.appendChild(cv);
      var info = document.createElement('div');
      info.className = 'book-info';
      if (unlocked) {
        info.innerHTML = '<b>' + esc(m.title) + '</b><span>' + esc(m.location) + (m.date ? ' · ' + esc(m.date) : '') + '</span><p>' + esc(m.message) + '</p>';
      } else {
        info.innerHTML = '<b>？？？</b><span>待发现的回忆 · ' + (i + 1) + '/16</span><p>去小镇的角落里，找一闪一闪的小挂饰。</p>';
      }
      div.appendChild(info);
      list.appendChild(div);
    });
    var cnt = $('#book-count');
    if (cnt) cnt.textContent = '已解锁 ' + Object.keys(found).length + ' / 16 段回忆';
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

  /* ---------- 工坊制作面板 ---------- */
  function openCraftPanel() {
    var r = worldRes();
    var made = (curWorld() && curWorld().crafted) || {};
    RECIPES.forEach(function (rc) {
      var b = $('#craft-' + rc.id);
      if (!b) return;
      var enough = (r.wood || 0) >= rc.wood && (r.flowers || 0) >= rc.flowers;
      b.disabled = !enough;
      b.textContent = (made[rc.id] ? '再做一件 · ' : '') + rc.name + '（🪵' + rc.wood + ' 🌸' + rc.flowers + '）' + (enough ? '' : ' · 材料不足');
    });
    $('#craft-res').textContent = '现有材料：🪵 ' + (r.wood || 0) + ' · 🌸 ' + (r.flowers || 0) + ' · 🎁 ' + (r.materials || 0) + '（手工礼物用于把圣诞树点到全亮）';
    $('#craft-panel').classList.remove('hidden');
    pause();
  }

  /* ---------- 绘制 ---------- */
  function draw(ts) {
    var ctx = S.ctx;
    ctx.clearRect(0, 0, S.view.w, S.view.h);
    ctx.save();
    ctx.translate(-Math.round(S.cam.x), -Math.round(S.cam.y));

    var myOutfit = getOutfit(S.mySlot, 'winter');
    var theirOutfit = getOutfit(S.otherSlot, 'winter');
    var inter = curInt();
    var showRemote = S.remote.seen && S.remote.inter === (S.interId || 0);
    var drawables = [];

    if (inter) {
      if (S.interId === 'greenhouse') inter.draw(ctx, ts, plotStates());
      else inter.draw(ctx, ts);
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
    } else {
      World.drawGround(ctx, { x: S.cam.x, y: S.cam.y, w: S.view.w, h: S.view.h });
      World.drawIceRink(ctx);
      World.drawPond(ctx);
      World.drawBridge(ctx);
      World.drawSnowPiles(ctx);
      World.drawProps(ctx, ts);
      World.drawFence(ctx);
      World.drawBorderTrees(ctx, ts);
      World.drawEggs(ctx, ts);

      World.buildings.forEach(function (b) { drawables.push({ y: b.y + b.h, fn: function () { World.drawBuilding(ctx, b, ts); } }); });
      drawables.push({ y: World.tree.y, fn: function () { World.drawBigTree(ctx, World.tree, treeStage(), ts); } });
      World.benches.forEach(function (b) { drawables.push({ y: b.y, fn: function () { World.drawBench(ctx, b); } }); });
      World.lamps.forEach(function (l) { drawables.push({ y: l.y, fn: function () { World.drawLamp(ctx, l, ts); } }); });

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
          else if (n.id === 'elf') Sprites.drawElf(ctx, n.x, n.y, ts, Math.floor(ts / 300) % 4);
          else Sprites.drawBarista(ctx, n.x, n.y, ts, Math.floor(ts / 300) % 4);
          nameTag(ctx, n.x, n.y - 66, n.name, false, '#ffe08a');
        } });
      });

      if (S.ending) {
        var e = S.ending;
        drawables.push({ y: e.santaY, fn: function () {
          Sprites.drawSanta(ctx, e.santaX, e.santaY, ts);
          nameTag(ctx, e.santaX, e.santaY - 66, '圣诞老人', false, '#ffe08a');
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
    vg.addColorStop(1, inter ? 'rgba(40,20,10,.35)' : 'rgba(10,20,40,.42)');
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
  }

  function drawInteractBubble(ctx) {
    var it = S.curInteract;
    var bob = Math.sin(performance.now() / 300) * 2.5;
    var x = it.x, y = it.y - (it.type === 'npc' ? 96 : 108) + bob;
    ctx.font = 'bold 13px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    var w = ctx.measureText(it.label).width + 22;
    var bx = Math.max(S.cam.x + w / 2 + 6, Math.min(S.cam.x + S.view.w - w / 2 - 6, x));
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

  return { enter: enter, onData: onData, active: active };
})();
