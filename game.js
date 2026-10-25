/* game.js — Stage 2 游戏循环：地图渲染、移动、碰撞、交互、双人位置同步
 * 依赖：Sprites（角色绘制）、World（地图数据与环境）
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
    // Stage 3 新增
    parts: [],              // 粒子（爱心/星星）
    indoor: false,          // 是否在室内
    outdoorPos: null,       // 进屋前的位置
    remoteIndoor: 0,        // 对方所在场景（0室外 1室内）
    prevPresence: null,     // 上一次对方在线状态（用于进出提示）
    prevStage: 0,           // 上一次圣诞树阶段（用于点灯庆祝）
    heartT: 0               // 爱心生成的节流计时
  };

  var SPEED = 150; // px/s
  var NAME = { a: 'Charles', b: 'Julie' };
  var CHAROPT = {
    a: { gender: 'm', glasses: true, hairStyle: 'short' },
    b: { gender: 'f', glasses: false, hairStyle: 'long' }
  };

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

    // 初始位置：优先使用服务器保存的位置（回到上次离开的地方）
    var saved = S.data && S.data.slots && S.data.slots[S.mySlot] && S.data.slots[S.mySlot].pos;
    if (saved && typeof saved.x === 'number') {
      S.self.x = saved.x; S.self.y = saved.y;
    } else {
      S.self.x = S.mySlot === 'a' ? 640 : 860;
      S.self.y = 720;
    }
    S.remote.x = S.otherSlot === 'a' ? 640 : 860;
    S.remote.y = 720; S.remote.tx = S.remote.x; S.remote.ty = S.remote.y;

    // Stage 3 状态复位
    S.parts = []; S.indoor = false; S.outdoorPos = null; S.remoteIndoor = 0;
    S.prevPresence = null; S.prevStage = 0; S.heartT = 0;

    // 雪花
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
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    S.dpr = dpr;
    S.view.w = S.canvas.clientWidth;
    S.view.h = S.canvas.clientHeight;
    S.canvas.width = Math.round(S.view.w * dpr);
    S.canvas.height = Math.round(S.view.h * dpr);
    S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    // 对方进入 / 离开小镇的轻提示
    var online = !!(d.presence && d.presence[S.otherSlot]);
    if (S.prevPresence !== null && online !== S.prevPresence) {
      toast(online ? ('💚 ' + NAME[S.otherSlot] + ' 来到了小镇') : ('😮 ' + NAME[S.otherSlot] + ' 暂时离开了…'));
      if (online && !S.indoor && S.remoteIndoor === 0) {
        S.remote.seen = true;
        burst(S.remote.tx, S.remote.ty - 40, 'heart', 4);
      }
    }
    S.prevPresence = online;
    // 圣诞树阶段变化 → 点灯庆祝
    var stage = (d.tree && typeof d.tree.stage === 'number') ? d.tree.stage : 0;
    if (S.prevStage !== stage && S.prevStage !== null) {
      if (stage === 3 && S.prevStage === 2) {
        toast('✨ 小镇的灯，为你们全部点亮了');
        burst(World.tree.x, World.tree.y - 120, 'spark', 26);
      }
    }
    S.prevStage = stage;
    // 对方在线状态 HUD
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
    // 电脑上也可用鼠标拖摇杆
    base.addEventListener('mousedown', joyStart);
    window.addEventListener('mousemove', function (e) { if (S.joy.active && S.joy.id === 'm') joyMove(e); });
    window.addEventListener('mouseup', function (e) { if (S.joy.id === 'm') joyEnd(e); });

    $('#btn-interact').addEventListener('click', function () { doInteract(); });
    $('#btn-menu').addEventListener('click', function () { toggleMenu(); });
    $('#menu-close').addEventListener('click', function () { closeAllPanels(); });
    $('#menu-outfit').addEventListener('click', function () { closeAllPanels(); openOutfit(); });
    $('#menu-tree').addEventListener('click', function () { closeAllPanels(); openTreePanel(); });
    $('#menu-invite').addEventListener('click', function () { closeAllPanels(); S.opts.invite && S.opts.invite(); });
    $('#menu-leave').addEventListener('click', function () { S.opts.onLeave && S.opts.onLeave(); });
    $('#dlg-close').addEventListener('click', function () { closeAllPanels(); });
    $('#dlg-next').addEventListener('click', function () { dlgNext(); });
    $('#tree-deco').addEventListener('click', function () { decorateTree(); });
    $('#tree-close').addEventListener('click', function () { closeAllPanels(); });
    $('#outfit-close').addEventListener('click', function () { closeAllPanels(); });
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
    // 脚底碰撞盒 24 x 14
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
    if (!S.paused) update(dt, ts);
    draw(ts);
    requestAnimationFrame(loop);
  }

  function update(dt, ts) {
    // 输入向量
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
      // 场地边界
      var iw = S.indoor ? World.Interior.w : World.width;
      var ih = S.indoor ? World.Interior.h : World.height;
      S.self.x = Math.max(30, Math.min(iw - 30, S.self.x));
      S.self.y = S.indoor
        ? Math.max(150, Math.min(ih - 24, S.self.y))
        : Math.max(70, Math.min(ih - 24, S.self.y));
      // 方向
      if (Math.abs(dx) > Math.abs(dy)) S.self.dir = dx < 0 ? 2 : 3;
      else S.self.dir = dy < 0 ? 1 : 0;
      S.self.animT += dt;
      S.self.frame = Math.floor(S.self.animT / 0.14) % 4;
    } else {
      S.self.moving = false;
      S.self.frame = 0; S.self.animT = 0;
    }
    S.self.moving = moving;

    // 位置同步（节流 150ms；方向变化立即发；带室内标记）
    if (S.backend.mode !== 'demo') {
      var now = ts;
      var dirChanged = S.self.dir !== S.lastSentDir;
      if ((moving || dirChanged) && now - S.lastSent > 150) {
        S.lastSent = now; S.lastSentDir = S.self.dir;
        S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, moving, S.indoor ? 1 : 0)
          .catch(function () { });
      }
    }

    // 远端插值（只在同一场景时显示）
    if (S.remoteIndoor === (S.indoor ? 1 : 0)) {
      S.remote.x += (S.remote.tx - S.remote.x) * Math.min(1, dt * 8);
      S.remote.y += (S.remote.ty - S.remote.y) * Math.min(1, dt * 8);
    }

    // 双人靠近时冒爱心（同一场景、距离 <140）
    if (S.remote.seen && S.remoteIndoor === (S.indoor ? 1 : 0)) {
      var pd = Math.sqrt(Math.pow(S.self.x - S.remote.x, 2) + Math.pow(S.self.y - S.remote.y, 2));
      if (pd < 140 && ts - S.heartT > 1400) {
        S.heartT = ts;
        var mx = (S.self.x + S.remote.x) / 2, my = (S.self.y + S.remote.y) / 2;
        burst(mx, my - 46, 'heart', 1);
      }
      // 两人一起站在圣诞树旁 → 树顶冒星星
      if (!S.indoor) {
        var dTreeSelf = Math.sqrt(Math.pow(S.self.x - World.tree.x, 2) + Math.pow(S.self.y - World.tree.y, 2));
        var dTreeOther = Math.sqrt(Math.pow(S.remote.x - World.tree.x, 2) + Math.pow(S.remote.y - World.tree.y, 2));
        if (dTreeSelf < 170 && dTreeOther < 170 && ts - S.heartT > 1000) {
          S.heartT = ts;
          burst(World.tree.x + (Math.random() - 0.5) * 90, World.tree.y - 140 - Math.random() * 60, 'spark', 2);
        }
      }
    }

    // 粒子更新
    for (var pi = S.parts.length - 1; pi >= 0; pi--) {
      var pt = S.parts[pi];
      pt.life -= dt;
      pt.y -= (pt.kind === 'heart' ? 26 : 12) * dt;
      pt.x += Math.sin(pt.life * 5 + pt.ph) * 10 * dt;
      if (pt.life <= 0) S.parts.splice(pi, 1);
    }

    // 交互点检测
    S.curInteract = findInteract();

    // 相机
    var iw2 = S.indoor ? World.Interior.w : World.width;
    var ih2 = S.indoor ? World.Interior.h : World.height;
    var targetCx = S.self.x - S.view.w / 2;
    var targetCy = S.self.y - S.view.h / 2;
    S.cam.x = iw2 <= S.view.w ? (iw2 - S.view.w) / 2 : Math.max(0, Math.min(iw2 - S.view.w, targetCx));
    S.cam.y = ih2 <= S.view.h ? (ih2 - S.view.h) / 2 : Math.max(0, Math.min(ih2 - S.view.h, targetCy));
  }

  // ---------- 粒子 ----------
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
      } else { // spark 四角星
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

  /* ---------- 交互 ---------- */
  function findInteract() {
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
    // 旅行彩蛋
    World.eggs.forEach(function (e) { consider('egg', e.x, e.y, 46, '✨ 拾起闪光的小东西', e); });
    // 对方玩家 → 打招呼
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
    } else if (it.type === 'door') {
      var b = World.buildings.filter(function (x) { return x.id === it.ref.id; })[0];
      if (b.kind === 'shop') openOutfit();
      else if (b.kind === 'cabin') enterIndoor();
      else openDialog(b.name, b.hint);
    } else if (it.type === 'tree') {
      openTreePanel();
    } else if (it.type === 'egg') {
      burst(S.self.x, S.self.y - 50, 'spark', 6);
      openDialog(it.ref.name, it.ref.line);
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

  /* ---------- 室内 / 室外切换 ---------- */
  function enterIndoor() {
    S.indoor = true;
    S.outdoorPos = { x: S.self.x, y: S.self.y };
    S.self.x = World.Interior.spawn.x;
    S.self.y = World.Interior.spawn.y;
    S.remote.seen = S.remoteIndoor === 1; // 对方不在同一场景就先不显示
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
    ['#dlg', '#tree-panel', '#outfit-modal', '#menu-panel'].forEach(function (s) { $(s).classList.add('hidden'); });
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
    // 高亮当前服装
    var cur = (S.data && S.data.slots && S.data.slots[S.mySlot] && S.data.slots[S.mySlot].outfit) || 'winter';
    document.querySelectorAll('#outfit-list .outfit-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.outfit === cur);
    });
    $('#outfit-modal').classList.remove('hidden');
    pause();
  }
  function openTreePanel() {
    var stage = (S.data && S.data.tree && typeof S.data.tree.stage === 'number') ? S.data.tree.stage : 0;
    var names = ['一棵安静的小树苗，等着你们来装点。', '已经挂上了彩球，越来越有味道了。', '彩灯亮起来了！一闪一闪的。', '✨ 全树点亮！这是属于你们的小镇之光。'];
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
        toast('圣诞树变化了！🎉');
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
      // ---------- 室内：我们的圣诞小屋 ----------
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
      // 室内暖色氛围
      ctx.fillStyle = 'rgba(255,150,60,.045)';
      ctx.fillRect(0, 0, World.Interior.w, World.Interior.h);
    } else {
      // ---------- 室外：雪夜小镇 ----------
      World.drawGround(ctx, { x: S.cam.x, y: S.cam.y, w: S.view.w, h: S.view.h });
      World.drawIceRink(ctx);
      World.drawPond(ctx);
      World.drawBridge(ctx);
      World.drawSnowPiles(ctx);
      World.drawFence(ctx);
      World.drawBorderTrees(ctx, ts);
      World.drawEggs(ctx, ts);

      // 按纵深排序绘制：建筑 / 圣诞树 / 长椅 / 路灯 / NPC / 玩家
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
          if (n.id === 'santa') Sprites.drawSanta(ctx, n.x, n.y, ts);
          else if (n.id === 'snowman') Sprites.drawSnowman(ctx, n.x, n.y, ts);
          else if (n.id === 'elf') Sprites.drawElf(ctx, n.x, n.y, ts, Math.floor(ts / 300) % 4);
          else Sprites.drawBarista(ctx, n.x, n.y, ts, Math.floor(ts / 300) % 4);
          nameTag(ctx, n.x, n.y - 66, n.name, false, '#ffe08a');
        } });
      });

      drawables.sort(function (a, b) { return a.y - b.y; }).forEach(function (d) { d.fn(); });

      // 雪花（覆盖在场景上）
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      S.flakes.forEach(function (f) {
        f.y += f.v * 0.016; f.x += Math.sin(ts / 900 + f.ph) * 0.4;
        if (f.y > World.height) { f.y = -6; f.x = Math.random() * World.width; }
        if (f.x > S.cam.x - 10 && f.x < S.cam.x + S.view.w + 10 && f.y > S.cam.y - 10 && f.y < S.cam.y + S.view.h + 10) {
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
        }
      });
    }

    // 粒子（爱心 / 星光）
    drawParticles(ctx);

    ctx.restore();

    // 暗角氛围
    var vg = ctx.createRadialGradient(S.view.w / 2, S.view.h / 2, Math.min(S.view.w, S.view.h) * 0.42, S.view.w / 2, S.view.h / 2, Math.max(S.view.w, S.view.h) * 0.75);
    vg.addColorStop(0, 'rgba(10,20,40,0)');
    vg.addColorStop(1, S.indoor ? 'rgba(40,20,10,.35)' : 'rgba(10,20,40,.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, S.view.w, S.view.h);

    // 交互气泡（跟随目标物，而非只在屏幕角落）
    if (S.curInteract && !S.paused) drawInteractBubble(ctx);
    // 交互按钮
    var btn = $('#btn-interact');
    if (S.curInteract && !S.paused) {
      btn.textContent = S.curInteract.label;
      btn.classList.remove('hidden');
    } else btn.classList.add('hidden');
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
    // 气泡小尾巴
    ctx.fillStyle = 'rgba(20,32,54,.85)';
    ctx.beginPath();
    ctx.moveTo(bx - 5, y + 8); ctx.lineTo(bx + 5, y + 8); ctx.lineTo(bx, y + 15);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(it.label, bx, y + 1);
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
