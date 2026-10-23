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
    npcIdx: {}, paused: false, curInteract: null
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
      if (o.pos && typeof o.pos.x === 'number') { S.remote.tx = o.pos.x; S.remote.ty = o.pos.y; S.remote.dir = o.pos.dir || 0; S.remote.moving = !!o.pos.moving; S.remote.seen = true; }
      if (o.wave && o.wave !== S._lastWave) { S._lastWave = o.wave; S.remote.waveUntil = performance.now() + 1500; }
    }
    // 对方在线状态 HUD
    var online = !!(d.presence && d.presence[S.otherSlot]);
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
    for (var i = 0; i < World.obstacles.length; i++) {
      var o = World.obstacles[i];
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
      S.self.x = Math.max(30, Math.min(World.width - 30, S.self.x));
      S.self.y = Math.max(70, Math.min(World.height - 24, S.self.y));
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

    // 位置同步（节流 150ms；方向变化立即发）
    if (S.backend.mode !== 'demo') {
      var now = ts;
      var dirChanged = S.self.dir !== S.lastSentDir;
      if ((moving || dirChanged) && now - S.lastSent > 150) {
        S.lastSent = now; S.lastSentDir = S.self.dir;
        S.backend.setPos(Math.round(S.self.x), Math.round(S.self.y), S.self.dir, moving)
          .catch(function () { });
      }
    }

    // 远端插值
    S.remote.x += (S.remote.tx - S.remote.x) * Math.min(1, dt * 8);
    S.remote.y += (S.remote.ty - S.remote.y) * Math.min(1, dt * 8);

    // 交互点检测
    S.curInteract = findInteract();

    // 相机
    var targetCx = S.self.x - S.view.w / 2;
    var targetCy = S.self.y - S.view.h / 2;
    S.cam.x = World.width <= S.view.w ? (World.width - S.view.w) / 2 : Math.max(0, Math.min(World.width - S.view.w, targetCx));
    S.cam.y = World.height <= S.view.h ? (World.height - S.view.h) / 2 : Math.max(0, Math.min(World.height - S.view.h, targetCy));
  }

  /* ---------- 交互 ---------- */
  function findInteract() {
    var best = null, bd = 1e9;
    function consider(type, x, y, r, label, ref) {
      var d = Math.sqrt(Math.pow(S.self.x - x, 2) + Math.pow(S.self.y - y, 2));
      if (d < r && d < bd) { bd = d; best = { type: type, label: label, ref: ref }; }
    }
    World.npcs.forEach(function (n) { consider('npc', n.x, n.y, 85, '💬 和 ' + n.name + ' 交谈', n); });
    World.doors.forEach(function (dr) { consider('door', dr.x, dr.y, 78, '🚪 进入 ' + dr.name, dr); });
    consider('tree', World.tree.x, World.tree.y + 10, 120, '🎄 查看圣诞树', World.tree);
    // 对方玩家 → 打招呼
    if (S.remote.seen) {
      var o = S.data && S.data.slots && S.data.slots[S.otherSlot];
      if (o) consider('partner', S.remote.x, S.remote.y, 90, '👋 和 ' + NAME[S.otherSlot] + ' 打招呼', o);
    }
    return best;
  }

  function doInteract() {
    if (!S.curInteract) return;
    var it = S.curInteract;
    if (it.type === 'npc') {
      var idx = (S.npcIdx[it.ref.id] || 0);
      openDialog(it.ref.name, it.ref.lines[idx % it.ref.lines.length]);
      S.npcIdx[it.ref.id] = idx + 1;
    } else if (it.type === 'door') {
      var b = World.buildings.filter(function (x) { return x.id === it.ref.id; })[0];
      if (b.kind === 'shop') openOutfit();
      else openDialog(b.name, b.hint);
    } else if (it.type === 'tree') {
      openTreePanel();
    } else if (it.type === 'partner') {
      S.self.waveUntil = performance.now() + 1600;
      S.backend.setWave().catch(function () { });
      toast('你朝 ' + NAME[S.otherSlot] + ' 挥了挥手 👋');
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

    // 环境
    World.drawGround(ctx, { x: S.cam.x, y: S.cam.y, w: S.view.w, h: S.view.h });
    World.drawIceRink(ctx);
    World.drawPond(ctx);
    World.drawSnowPiles(ctx);
    World.drawFence(ctx);
    World.drawBorderTrees(ctx, ts);

    // 按纵深排序绘制：建筑 / 圣诞树 / 长椅 / 路灯 / NPC / 玩家
    var drawables = [];
    World.buildings.forEach(function (b) { drawables.push({ y: b.y + b.h, fn: function () { World.drawBuilding(ctx, b, ts); } }); });
    drawables.push({ y: World.tree.y, fn: function () { World.drawBigTree(ctx, World.tree, treeStage(), ts); } });
    World.benches.forEach(function (b) { drawables.push({ y: b.y, fn: function () { World.drawBench(ctx, b); } }); });
    World.lamps.forEach(function (l) { drawables.push({ y: l.y, fn: function () { World.drawLamp(ctx, l, ts); } }); });

    var myOutfit = getOutfit(S.mySlot, 'winter');
    var theirOutfit = getOutfit(S.otherSlot, 'winter');

    drawables.push({ y: S.remote.y, fn: function () {
      if (!S.remote.seen) return;
      var waving = ts < S.remote.waveUntil;
      Sprites.drawCharacter(ctx, S.remote.x, S.remote.y, S.remote.dir, S.remote.moving ? Math.floor(ts / 140) % 4 : 0,
        Object.assign({}, CHAROPT[S.otherSlot], { outfit: theirOutfit }), waving);
      nameTag(ctx, S.remote.x, S.remote.y - 78, NAME[S.otherSlot], false);
    } });
    drawables.push({ y: S.self.y, fn: function () {
      var waving = ts < S.self.waveUntil;
      Sprites.drawCharacter(ctx, S.self.x, S.self.y, S.self.dir, S.self.frame,
        Object.assign({}, CHAROPT[S.mySlot], { outfit: myOutfit }), waving);
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

    ctx.restore();

    // 暗角氛围
    var vg = ctx.createRadialGradient(S.view.w / 2, S.view.h / 2, Math.min(S.view.w, S.view.h) * 0.42, S.view.w / 2, S.view.h / 2, Math.max(S.view.w, S.view.h) * 0.75);
    vg.addColorStop(0, 'rgba(10,20,40,0)');
    vg.addColorStop(1, 'rgba(10,20,40,.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, S.view.w, S.view.h);

    // 交互提示按钮
    var btn = $('#btn-interact');
    if (S.curInteract && !S.paused) {
      btn.textContent = S.curInteract.label;
      btn.classList.remove('hidden');
    } else btn.classList.add('hidden');
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
