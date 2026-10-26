/* game.js — v1.0.0：Omo's Christmas Village 游戏核心
 * 包含：地图渲染、移动、碰撞、双人位置同步、交互、主线任务、
 *       结局序列（Omo's Christmas Night）、拍照模式（PNG 导出）、
 *       自适应性能分级、回忆彩蛋交互。
 * 依赖：Sprites（角色）、World（世界）、Memories（回忆数据）
 */
window.Game = (function () {
  'use strict';

  var S = {
    active: false, code: null, backend: null,
    canvas: null, ctx: null, view: { w: 0, h: 0 }, dpr: 1,
    self: { x: 640, y: 720, dir: 0, moving: false, frame: 0, animT: 0, waveUntil: 0 },
    remote: { x: 860, y: 720, tx: 860, ty: 720, dir: 0, moving: false, waveUntil: 0, seen: false },
    cam: { x: 0, y: 0 },
    keys: {}, joy: { active: false, id: null, bx: 0, by: 0, dx: 0, dy: 0 },
    lastSent: 0, lastSentDir: -1, flakes: [], data: null, otherSlot: null,
    npcIdx: {}, paused: false, curInteract: null,
    parts: [], indoor: false, outdoorPos: null, remoteIndoor: 0,
    prevPresence: null, prevStage: 0, heartT: 0,
    // v1.0.0 新增
    quest: { step: 0, talked: {}, visited: {}, found: {} },
    q: { lvl: 2, acc: 0, n: 0 },
    ending: null,
    ended: false,
    photo: false,
    lastQuestText: ''
  };

  var SPEED = 150;
  var NAME = { a: 'Charles', b: 'Julie' };
  var CHAROPT = {
    a: { gender: 'm', glasses: true, hairStyle: 'short' },
    b: { gender: 'f', glasses: false, hairStyle: 'long' }
  };

  // ---------- 主线任务 ----------
  var QUESTS = [
    '🎄 走近广场的圣诞树看看吧',
    '💬 去和圣诞老人聊聊吧',
    '💬 认识小镇的居民们（0/3）',
    '🧭 探索小镇：木屋 · 咖啡 · 木桥 · 冰湖（0/4）',
    '✨ 寻找闪光的旅行回忆（0/3）',
    '🎄 一起把圣诞树装饰到全亮',
    '📸 圣诞夜即将开始…'
  ];
  function foundCount() { return Object.keys(S.quest.found).length; }
  function talkedExtra() { return ['snowman', 'elf', 'barista'].filter(function (k) { return S.quest.talked[k]; }).length; }
  function visitedCount() { return Object.keys(S.quest.visited).length; }
  function questText() {
    var t = QUESTS[Math.min(S.quest.step, QUESTS.length - 1)];
    return t.replace('（0/3）', '（' + (S.quest.step === 2 ? talkedExtra() : foundCount()) + '/3）')
            .replace('（0/4）', '（' + visitedCount() + '/4）');
  }
  function updateQuest() {
    var st = S.quest.step;
    if (st === 0) {
      var d = Math.sqrt(Math.pow(S.self.x - World.tree.x, 2) + Math.pow(S.self.y - World.tree.y, 2));
      if (d < 150) { S.quest.step = 1; toast('🎅 圣诞老人好像有话想跟你们说'); }
    } else if (st === 1 && S.quest.talked.santa) {
      S.quest.step = 2; toast('📋 新任务：认识小镇的居民们');
    } else if (st === 2 && talkedExtra() >= 3) {
      S.quest.step = 3; toast('📋 新任务：探索小镇的四个角落');
    } else if (st === 3 && visitedCount() >= 4) {
      S.quest.step = 4; toast('📋 新任务：寻找闪光的旅行回忆 ✨');
    } else if (st === 4 && foundCount() >= 3) {
      S.quest.step = 5; toast('🎄 回到圣诞树，把它装饰到全亮吧！');
    } else if (st === 5 && treeStage() >= 3) {
      S.quest.step = 6;
    }
  }
  function checkVisitZones() {
    if (S.indoor || S.quest.step > 3) return;
    function near(x, y, r) { return Math.sqrt(Math.pow(S.self.x - x, 2) + Math.pow(S.self.y - y, 2)) < r; }
    if (near(285, 410, 110)) S.quest.visited.cabin = 1;
    if (near(1295, 385, 110)) S.quest.visited.cafe = 1;
    if (S.self.x > 1080 && S.self.x < 1150 && S.self.y > 900) S.quest.visited.bridge = 1;
    if (near(170, 515, 150)) S.quest.visited.ice = 1;
  }

  function $(s) { return document.querySelector(s); }
  function toast(msg, ms) {
    var el = $('#toast');
    el.textContent = msg; el.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.add('hidden'); }, ms || 2400);
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

    S.parts = []; S.indoor = false; S.outdoorPos = null; S.remoteIndoor = 0;
    S.prevPresence = null; S.prevStage = 0; S.heartT = 0;
    S.quest = { step: 0, talked: {}, visited: {}, found: {} };
    S.q = { lvl: 2, acc: 0, n: 0 };
    S.ending = null; S.ended = false; S.photo = false;
    S.lastQuestText = '';

    S.flakes = [];
    for (var i = 0; i < 55; i++) {
      S.flakes.push({ x: Math.random() * World.width, y: Math.random() * World.height, r: 1 + Math.random() * 2.2, v: 22 + Math.random() * 40, ph: Math.random() * 7 });
    }

    bindInput();
    S.active = true;
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
    var o = d.slots && d.slots[S.otherSlot];
    if (o) {
      if (o.pos && typeof o.pos.x === 'number') {
        S.remote.tx = o.pos.x; S.remote.ty = o.pos.y; S.remote.dir = o.pos.dir || 0;
        S.remote.moving = !!o.pos.moving; S.remote.seen = true;
        S.remoteIndoor = o.pos.indoor || 0;
      }
      if (o.wave && o.wave !== S._lastWave) { S._lastWave = o.wave; S.remote.waveUntil = performance.now() + 1500; }
    }
    var online = !!(d.presence && d.presence[S.otherSlot]);
    if (S.prevPresence !== null && online !== S.prevPresence) {
      toast(online ? ('💚 ' + NAME[S.otherSlot] + ' 来到了小镇') : ('😮 ' + NAME[S.otherSlot] + ' 暂时离开了…'));
      if (online && !S.indoor && S.remoteIndoor === 0) {
        S.remote.seen = true;
        burst(S.remote.tx, S.remote.ty - 40, 'heart', 4);
      }
    }
    S.prevPresence = online;
    var stage = (d.tree && typeof d.tree.stage === 'number') ? d.tree.stage : 0;
    if (S.prevStage !== stage && !S.ending && !S.ended) {
      if (stage >= 3) startEnding();
    }
    S.prevStage = stage;
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

    // 防止游戏中页面滚动 / 双指缩放误触
    document.addEventListener('touchmove', function (e) {
      if (S.active) e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', function (e) { if (S.active) e.preventDefault(); });
    document.addEventListener('dblclick', function (e) { if (S.active) e.preventDefault(); });

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
    $('#menu-leave').addEventListener('click', function () { S.opts.onLeave && S.opts.onLeave(); });
    $('#dlg-close').addEventListener('click', function () { closeAllPanels(); });
    $('#dlg-next').addEventListener('click', function () { dlgNext(); });
    $('#tree-deco').addEventListener('click', function () { decorateTree(); });
    $('#tree-close').addEventListener('click', function () { closeAllPanels(); });
    $('#outfit-close').addEventListener('click', function () { closeAllPanels(); });
    $('#mem-close').addEventListener('click', function () { closeAllPanels(); });
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
  function hits(x, y) {
    var bx = x - 12, by = y - 12, bw = 24, bh = 14;
    var list = S.indoor ? World.Interior.obstacles : World.obstacles;
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
      var iw = S.indoor ? World.Interior.w : World.width;
      var ih = S.indoor ? World.Interior.h : World.height;
      S.self.x = Math.max(30, Math.min(iw - 30, S.self.x));
      S.self.y = S.indoor
        ? Math.max(150, Math.min(ih - 24, S.self.y))
        : Math.max(70, Math.min(ih - 24, S.self.y));
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
        S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, moving, S.indoor ? 1 : 0)
          .catch(function () { });
      }
    }

    if (S.remoteIndoor === (S.indoor ? 1 : 0)) {
      S.remote.x += (S.remote.tx - S.remote.x) * Math.min(1, dt * 8);
      S.remote.y += (S.remote.ty - S.remote.y) * Math.min(1, dt * 8);
    }

    // 双人互动（爱心 / 树下星光 / 长椅星光）
    if (S.remote.seen && S.remoteIndoor === (S.indoor ? 1 : 0)) {
      var pd = Math.sqrt(Math.pow(S.self.x - S.remote.x, 2) + Math.pow(S.self.y - S.remote.y, 2));
      if (pd < 140 && ts - S.heartT > 1400) {
        S.heartT = ts;
        burst((S.self.x + S.remote.x) / 2, (S.self.y + S.remote.y) / 2 - 46, 'heart', 1);
      }
      var nearBench = World.benches.some(function (b) {
        return Math.sqrt(Math.pow(S.self.x - b.x, 2) + Math.pow(S.self.y - b.y, 2)) < 90 &&
               Math.sqrt(Math.pow(S.remote.x - b.x, 2) + Math.pow(S.remote.y - b.y, 2)) < 110;
      });
      var nearTree = Math.sqrt(Math.pow(S.self.x - World.tree.x, 2) + Math.pow(S.self.y - World.tree.y, 2)) < 170 &&
                     Math.sqrt(Math.pow(S.remote.x - World.tree.x, 2) + Math.pow(S.remote.y - World.tree.y, 2)) < 170;
      if (!S.indoor && (nearTree || (nearBench && treeStage() >= 3)) && ts - S.heartT > 1000) {
        S.heartT = ts;
        var px2 = nearTree ? World.tree.x + (Math.random() - 0.5) * 90 : (S.self.x + S.remote.x) / 2;
        var py2 = nearTree ? World.tree.y - 140 - Math.random() * 60 : (S.self.y + S.remote.y) / 2 - 70;
        burst(px2, py2, 'spark', 2);
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

    S.curInteract = findInteract();

    var iw2 = S.indoor ? World.Interior.w : World.width;
    var ih2 = S.indoor ? World.Interior.h : World.height;
    var targetCx = S.self.x - S.view.w / 2;
    var targetCy = S.self.y - S.view.h / 2;
    S.cam.x = iw2 <= S.view.w ? (iw2 - S.view.w) / 2 : Math.max(0, Math.min(iw2 - S.view.w, targetCx));
    S.cam.y = ih2 <= S.view.h ? (ih2 - S.view.h) / 2 : Math.max(0, Math.min(ih2 - S.view.h, targetCy));
  }

  /* ---------- 结局序列：Omo's Christmas Night ---------- */
  var END_LINES = [
    '平安夜。小镇的每一盏灯，都亮了起来。',
    '这棵圣诞树，是你们两个人一起点亮的。',
    '从乌海的湖，到多哈的珍珠——你们把回忆一路收集到了这里。',
    '现在，站到树下去吧。这是属于你们的夜晚。'
  ];
  function startEnding() {
    S.ending = { t: 0, phase: 0, santaX: 858, santaY: 648, glow: 0, line: -1 };
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
      openPhoto();
    }
  }

  /* ---------- 拍照模式 ---------- */
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
      a.download = 'Omos-Christmas-Night-2026.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast('已尝试保存，若未弹出请长按图片存储 📱');
    } catch (e) {
      toast('请长按图片 → 「存储到照片」');
    }
  }
  function closeAllPanelsSilent() {
    ['#dlg', '#tree-panel', '#outfit-modal', '#menu-panel', '#end-overlay'].forEach(function (s) {
      var el = $(s); if (el) el.classList.add('hidden');
    });
  }

  // 定格构图：圣诞树 + 两人 + 圣诞老人 + 小镇夜景
  function renderPhoto(ctx, W, H) {
    var stage = 3;
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
    // 远处小镇剪影（亮窗）
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
    // 雪地
    var gr = ctx.createLinearGradient(0, H * 0.5, 0, H);
    gr.addColorStop(0, '#3d5578'); gr.addColorStop(0.35, '#7f97ba'); gr.addColorStop(1, '#c6d4ea');
    ctx.fillStyle = gr; ctx.fillRect(0, H * 0.52, W, H * 0.48);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    for (var sp = 0; sp < 60; sp++) {
      ctx.beginPath(); ctx.ellipse(Math.random() * W, H * 0.56 + Math.random() * H * 0.42, 10 + Math.random() * 26, 4 + Math.random() * 8, 0, 0, 7); ctx.fill();
    }

    // 大圣诞树 + 圣诞老人 + 雪人
    ctx.save();
    ctx.translate(W / 2 - 750 * 2.1, H * 0.56 - 560 * 2.1);
    ctx.scale(2.1, 2.1);
    World.drawBigTree(ctx, World.tree, stage, 1000);
    Sprites.drawSanta(ctx, 828, 640, 1000);
    Sprites.drawSnowman(ctx, 560, 650, 1200);
    ctx.restore();

    // 两位主角
    ctx.save();
    ctx.translate(W / 2, H * 0.82);
    ctx.scale(4.4, 4.4);
    Sprites.drawCharacter(ctx, -46, 0, 0, 0, Object.assign({}, CHAROPT.a, { outfit: getOutfit('a', 'winter') }), false, 800);
    Sprites.drawCharacter(ctx, 46, 0, 0, 0, Object.assign({}, CHAROPT.b, { outfit: getOutfit('b', 'winter') }), true, 800);
    ctx.restore();
    // 两人之间的爱心
    ctx.fillStyle = '#f26d7d';
    [[W / 2 - 60, H * 0.62, 9], [W / 2 + 54, H * 0.60, 7], [W / 2, H * 0.57, 11]].forEach(function (h) {
      var s = h[2];
      ctx.beginPath();
      ctx.moveTo(h[0], h[1] + s * 0.35);
      ctx.bezierCurveTo(h[0] - s, h[1] - s * 0.45, h[0] - s * 0.42, h[1] - s * 1.1, h[0], h[1] - s * 0.4);
      ctx.bezierCurveTo(h[0] + s * 0.42, h[1] - s * 1.1, h[0] + s, h[1] - s * 0.45, h[0], h[1] + s * 0.35);
      ctx.fill();
    });

    // 前景飘雪
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (var fl = 0; fl < 130; fl++) {
      ctx.globalAlpha = 0.4 + Math.random() * 0.5;
      ctx.beginPath(); ctx.arc(Math.random() * W, Math.random() * H, 1.5 + Math.random() * 3, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 暗角
    var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(10,20,40,0)'); vg.addColorStop(1, 'rgba(10,20,40,.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    // 底部木牌标题
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
    ctx.fillText('✦ Charles ♥ Julie · Christmas 2026 ✦', W / 2, H - 112);
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
    if (S.indoor) {
      World.Interior.interactables.forEach(function (it) {
        consider('roomItem', it.x, it.y, it.r, it.name, it);
      });
      consider('exit', World.Interior.exit.x, World.Interior.exit.y, 70, '🚪 回到小镇', World.Interior.exit);
      return best;
    }
    World.npcs.forEach(function (n) { consider('npc', n.x, n.y, 85, '💬 和 ' + n.name + ' 交谈', n); });
    World.doors.forEach(function (dr) { consider('door', dr.x, dr.y, 78, '🚪 进入 ' + dr.name, dr); });
    consider('tree', World.tree.x, World.tree.y + 10, 120, '🎄 查看圣诞树', World.tree);
    World.eggs.forEach(function (e) { consider('egg', e.x, e.y, 46, '✨ 拾起闪光的回忆', e); });
    if (S.remote.seen && S.remoteIndoor === 0) {
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
        updateQuest();
      }
    } else if (it.type === 'door') {
      var b = World.buildings.filter(function (x) { return x.id === it.ref.id; })[0];
      if (b.kind === 'shop') openOutfit();
      else if (b.kind === 'cabin') enterIndoor();
      else openDialog(b.name, b.hint);
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
      openDialog(it.ref.name, it.ref.lines);
    } else if (it.type === 'exit') {
      leaveIndoor();
    }
  }

  // ---------- 回忆彩蛋 ----------
  function collectEgg(m) {
    var first = !S.quest.found[m.id];
    S.quest.found[m.id] = 1;
    burst(S.self.x, S.self.y - 50, 'spark', 6);
    if (first) {
      updateQuest();
      var total = World.eggs.length;
      toast('💭 收集了旅行的回忆（' + foundCount() + '/' + total + '）');
    }
    if (m.image) {
      $('#mem-photo-img').src = m.image;
      $('#mem-photo-title').textContent = m.title;
      $('#mem-photo-text').textContent = m.message + ' —— ' + m.location;
      $('#mem-photo').classList.remove('hidden');
      S.paused = true;
    } else {
      openDialog(m.title, [
        m.message,
        '—— ' + m.location,
        '（照片位已预留：把照片文件放进项目，在 memories.js 里把 image 改成路径即可）'
      ]);
    }
  }

  /* ---------- 室内 / 室外 ---------- */
  function enterIndoor() {
    S.indoor = true;
    S.outdoorPos = { x: S.self.x, y: S.self.y };
    S.self.x = World.Interior.spawn.x;
    S.self.y = World.Interior.spawn.y;
    S.remote.seen = S.remoteIndoor === 1;
    toast('🏠 你们回到了自己的圣诞小屋');
    if (S.backend.mode !== 'demo') {
      S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, false, 1).catch(function () { });
    }
  }
  function leaveIndoor() {
    S.indoor = false;
    if (S.outdoorPos) { S.self.x = S.outdoorPos.x; S.self.y = S.outdoorPos.y; }
    else { S.self.x = 400; S.self.y = 420; }
    S.remote.seen = !!(S.data && S.data.slots && S.data.slots[S.otherSlot]) && S.remoteIndoor === 0;
    toast('⛄ 回到了雪夜的小镇');
    if (S.backend.mode !== 'demo') {
      S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, false, 0).catch(function () { });
    }
  }

  /* ---------- 面板 / 对话 ---------- */
  function pause() { S.paused = true; }
  function unpause() { S.paused = false; }
  function closeAllPanels() {
    ['#dlg', '#tree-panel', '#outfit-modal', '#menu-panel', '#mem-photo'].forEach(function (s) { $(s).classList.add('hidden'); });
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
    var stage = (S.data && S.data.tree && typeof S.data.tree.stage === 'number') ? S.data.tree.stage : 0;
    var names = ['一棵安静的小树苗，等着你们来装点。', '已经挂上了彩球和金色灯带，越来越有味道了。', '彩灯亮起来了！一闪一闪的。', '✨ 全树点亮！这是属于你们的小镇之光。'];
    $('#tree-stage-text').textContent = '当前阶段：' + ['小树苗', '已装饰', '挂上彩灯', '全树点亮'][stage];
    $('#tree-desc').textContent = names[stage];
    $('#tree-deco').classList.toggle('hidden', stage >= 3);
    $('#tree-deco').textContent = stage < 3 ? '✨ 装饰圣诞树 → ' + ['已装饰', '挂上彩灯', '全树点亮'][stage] : '已经全部点亮啦';
    $('#tree-panel').classList.remove('hidden');
    pause();
  }
  function decorateTree() {
    var stage = (S.data && S.data.tree && typeof S.data.tree.stage === 'number') ? S.data.tree.stage : 0;
    if (stage < 3) {
      S.backend.setTreeStage(stage + 1).then(function () {
        closeAllPanels();
      }).catch(function (e) { toast('操作失败：' + e.message); });
    }
  }
  function toggleMenu() {
    var m = $('#menu-panel');
    if (m.classList.contains('hidden')) { m.classList.remove('hidden'); pause(); }
    else { m.classList.add('hidden'); unpause(); }
  }

  /* ---------- 绘制 ---------- */
  function draw(ts) {
    var ctx = S.ctx;
    ctx.clearRect(0, 0, S.view.w, S.view.h);
    ctx.save();
    ctx.translate(-Math.round(S.cam.x), -Math.round(S.cam.y));

    var myOutfit = getOutfit(S.mySlot, 'winter');
    var theirOutfit = getOutfit(S.otherSlot, 'winter');
    var showRemote = S.remote.seen && S.remoteIndoor === (S.indoor ? 1 : 0);
    var drawables = [];

    if (S.indoor) {
      World.Interior.draw(ctx, ts);
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
          if (S.ending && n.id === 'santa') return; // 结局时由结局逻辑绘制
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
    vg.addColorStop(1, S.indoor ? 'rgba(40,20,10,.35)' : 'rgba(10,20,40,.42)');
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
  function treeStage() {
    return (S.data && S.data.tree && typeof S.data.tree.stage === 'number') ? S.data.tree.stage : 0;
  }

  return { enter: enter, onData: onData, active: active };
})();
