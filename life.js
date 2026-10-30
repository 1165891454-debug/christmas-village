/* life.js — v4.7.0「小镇生命力」
 * ============================================================
 * 这一版只做「让小镇自己活着」，不碰任何经济 / 任务 / 存档 / 同步：
 *
 *   A 自动昼夜与天气    —— 独立的时间轴 + 色标插值 + 天气窗口
 *   B NPC 自主生活      —— 每人在自己的活动区里散步 / 停留 / 打招呼 / 聊天 / 坐下 / 玩雪 / 看树
 *   C 双人自然互动      —— 靠近 + 双方静止 → 面向彼此 / 并肩 / 坐下 / 一起看树 / 一起看雪
 *   D 生活细节          —— 雪地脚印 / 窗光 / 烟囱烟 / 牧场动物 / 零星的烟花
 *
 * 设计上的三条硬约束（都是为了避免影响既有系统）：
 *   1. 不写 Firebase。时间与天气由「共享时间种子」推导（Date.now + 固定 EPOCH），
 *      两台设备自然一致，一次写入都不需要；NPC 与脚印纯本地。
 *   2. 不改任何存档字段。所有状态都在这个文件的内存里，刷新就重来。
 *   3. 不接管输入、不改玩家坐标。双人互动只改「怎么画」，不改 S.self / S.remote 的真实位置。
 *
 * 性能：NPC 行为决策 4Hz（按 NPC 错峰），移动按帧插值；光晕用一张预烘焙的径向 sprite；
 * 烟囱烟 / 极光 / 星星全部用时间戳现算，不存粒子；页面隐藏时停掉 NPC 计算。
 */
window.TownLife = (function () {
  'use strict';

  /* ============================================================
   * 0. 常量
   * ============================================================ */
  var DAY_MS = 900000;          // 虚拟一天 = 15 分钟真实时间（压缩的一天，不是系统时间）
  var EPOCH = 1767225600000;    // 2026-01-01T00:00:00Z —— 全设备共用的时间原点
  var WX_MS = 240000;           // 天气每 4 分钟换一档（不会频繁跳）
  var PRINT_MAX = 120;          // 脚印上限（环形复用，不留内存）
  var PRINT_LIFE = 7.0;         // 脚印淡出秒数
  var DECIDE_HZ = 4;            // NPC 决策频率

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, f) { return a + (b - a) * f; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

  /* 稳定的整数哈希：同一秒、同一台设备、换一台设备，算出来都一样 */
  function h32(n) {
    n = n | 0;
    n = (n ^ 61) ^ (n >>> 16);
    n = (n + (n << 3)) | 0;
    n = n ^ (n >>> 4);
    n = Math.imul(n, 0x27d4eb2d);
    n = n ^ (n >>> 15);
    return (n >>> 0);
  }
  function rnd01(seed) { return h32(seed) / 4294967296; }

  /* ============================================================
   * 1. 昼夜色标
   * ------------------------------------------------------------
   * 一天被压成 15 分钟，所以「清晨→白天→黄昏→夜晚→深夜」在一次游玩里
   * 能完整走一遍。全部靠色标线性插值，不存在任何跳变点：
   * 0.00 与 1.00 两帧刻意写成同一种颜色，接缝处天然连续。
   *
   *   top / bot : 远景（画面上方）与近景的着色，用来做纵深
   *   amb / aa  : 叠在整个小镇上的环境光颜色与不透明度（夜晚变暗靠它）
   *   lamp      : 路灯光强 0~1
   *   win       : 窗户暖光 0~1
   * ============================================================ */
  var KEYS = [
    { t: 0.00, top: '#080d1c', bot: '#151d33', amb: '#0e1426', aa: 0.58, lamp: 1.00, win: 0.95 },
    { t: 0.10, top: '#0c1224', bot: '#1e2740', amb: '#141c33', aa: 0.51, lamp: 0.92, win: 0.86 },
    { t: 0.20, top: '#6d7a9e', bot: '#b8abae', amb: '#5b5f86', aa: 0.30, lamp: 0.54, win: 0.50 },
    { t: 0.30, top: '#b0c3dd', bot: '#e4ebf4', amb: '#ffe4cc', aa: 0.09, lamp: 0.14, win: 0.12 },
    { t: 0.38, top: '#cddcee', bot: '#eef3fa', amb: '#fffaf0', aa: 0.00, lamp: 0.00, win: 0.00 },
    { t: 0.56, top: '#c9d7ea', bot: '#f2eee6', amb: '#ffe6c4', aa: 0.05, lamp: 0.00, win: 0.03 },
    { t: 0.66, top: '#d8a887', bot: '#eec6a6', amb: '#f0a068', aa: 0.16, lamp: 0.46, win: 0.46 },
    { t: 0.74, top: '#6a5c86', bot: '#9d7376', amb: '#543a63', aa: 0.38, lamp: 0.80, win: 0.78 },
    { t: 0.84, top: '#131a33', bot: '#26304c', amb: '#181e3a', aa: 0.50, lamp: 1.00, win: 0.98 },
    { t: 0.94, top: '#080d1c', bot: '#151d33', amb: '#0e1426', aa: 0.58, lamp: 1.00, win: 0.95 },
    { t: 1.00, top: '#080d1c', bot: '#151d33', amb: '#0e1426', aa: 0.58, lamp: 1.00, win: 0.95 }
  ];

  function hexRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  /* 预解析，避免每帧再做 11 次字符串解析 */
  var KP = KEYS.map(function (k) {
    return { t: k.t, top: hexRgb(k.top), bot: hexRgb(k.bot), amb: hexRgb(k.amb), aa: k.aa, lamp: k.lamp, win: k.win };
  });
  function mix3(a, b, f) { return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)]; }
  function rgba3(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a < 0 ? 0 : a).toFixed(3) + ')';
  }

  /* ============================================================
   * 2. 状态
   * ============================================================ */
  var st = {
    ready: false,
    vt: 0,                 // 平滑后的虚拟一天位置 0..1
    vtInit: false,
    frozen: false,         // 测试用：锁住时间，不让它跟着真实时间跑
    phase: 'day',
    top: [205, 220, 239], bot: [238, 243, 250], amb: [255, 250, 240], aa: 0,
    lamp: 0, win: 0,
    slot: -1, wx: 'clear', wxLock: null,
    snow: 0, snowTarget: 0,
    aurora: 0, auroraTarget: 0,
    clock: 0,              // 模块内累计秒（只给动画用）
    frame: 0
  };

  /* ============================================================
   * 3. 时间轴与天气
   * ============================================================ */
  function vtOf(now) {
    var v = ((now - EPOCH) % DAY_MS) / DAY_MS;
    return v < 0 ? v + 1 : v;
  }
  function phaseOf(t) {
    if (t < 0.13 || t >= 0.90) return 'late';   // 深夜
    if (t < 0.30) return 'dawn';                // 清晨
    if (t < 0.60) return 'day';                 // 白天
    if (t < 0.75) return 'dusk';                // 黄昏
    return 'night';                             // 夜晚
  }

  /* 天气：由「第几个 4 分钟窗口」哈希出来。
     两端各自用自己的时钟算同一个窗口 → 看到同一种天气，一次 Firebase 都不用写。 */
  function wxOf(slot) {
    var r = rnd01(slot * 7919 + 104729);
    if (r < 0.44) return 'clear';
    if (r < 0.74) return 'snow';
    if (r < 0.945) return 'heavy';
    return 'aurora';    // 低概率（约 5.5% 的窗口）
  }
  var WX_SNOW = { clear: 0.16, snow: 0.58, heavy: 1.00, aurora: 0.26 };

  function updateEnv(dt, now) {
    /* ---- 时间 ---- */
    if (!st.vtInit) { st.vt = vtOf(now); st.vtInit = true; }
    else if (!st.frozen) {
      var target = vtOf(now);
      var d = target - st.vt;
      /* 取最短路径（跨 0 点也不会倒着绕一圈） */
      if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
      /* 指数追赶：正常游玩时差距极小（≈0.4 秒），等于跟着真实时间走；
         从后台回来差距大时，2 秒左右平滑追平 —— 不会闪一下换色。 */
      st.vt += d * (1 - Math.exp(-dt * 2.2));
      if (st.vt < 0) st.vt += 1; else if (st.vt >= 1) st.vt -= 1;
    }

    /* ---- 色标插值 ---- */
    var t = st.vt, i = 0;
    while (i < KP.length - 2 && t >= KP[i + 1].t) i++;
    var a = KP[i], b = KP[i + 1];
    var f = (t - a.t) / Math.max(1e-6, b.t - a.t);
    f = f < 0 ? 0 : (f > 1 ? 1 : f);
    st.top = mix3(a.top, b.top, f);
    st.bot = mix3(a.bot, b.bot, f);
    st.amb = mix3(a.amb, b.amb, f);
    st.aa = lerp(a.aa, b.aa, f);
    st.lamp = lerp(a.lamp, b.lamp, f);
    st.win = lerp(a.win, b.win, f);
    st.phase = phaseOf(t);

    /* ---- 天气 ---- */
    var slot = Math.floor((now - EPOCH) / WX_MS);
    if (slot !== st.slot) {
      st.slot = slot;
      st.wx = st.wxLock || wxOf(slot);
      st.snowTarget = WX_SNOW[st.wx];
      st.auroraTarget = (st.wx === 'aurora') ? 1 : 0;
    }
    /* 强度缓动：换天气时有 2~3 秒的过渡，不会「一秒之间大雪变晴」 */
    var k = 1 - Math.exp(-dt * 0.9);
    st.snow += (st.snowTarget - st.snow) * k;
    st.aurora += (st.auroraTarget - st.aurora) * k;

    st.clock += dt;
    st.frame++;
  }

  /* ============================================================
   * 4. 脚印
   * ============================================================ */
  var prints = [];
  var printHead = 0;
  function addPrint(x, y, s, rot, dark) {
    var p;
    if (prints.length < PRINT_MAX) {
      p = { x: 0, y: 0, s: 1, rot: 0, life: 0, max: PRINT_LIFE, dark: 0 };
      prints.push(p);
    } else {
      p = prints[printHead];
      printHead = (printHead + 1) % PRINT_MAX;
    }
    p.x = x; p.y = y; p.s = s; p.rot = rot; p.life = PRINT_LIFE; p.max = PRINT_LIFE; p.dark = dark || 0;
  }

  /* ============================================================
   * 5. NPC 自主生活
   * ------------------------------------------------------------
   * 每个 NPC 有自己的活动区（矩形，单位是世界坐标，y=脚底）。
   * 区域是手工量过的：都在空地上，不压建筑、不压围栏、不压树。
   * 移动时仍然逐轴做一次碰撞检测（World.obstacles），双保险。
   * ============================================================ */
  var ZONES = {
    /*         x     y     w    h   速度  可坐 */
    santa: { x: 790, y: 598, w: 112, h: 108, sp: 15, sit: 1, idle: 0.55 },
    elf: { x: 1052, y: 698, w: 94, h: 54, sp: 26, sit: 0 },
    barista: { x: 1186, y: 346, w: 116, h: 86, sp: 23, sit: 0 },
    postman: { x: 1050, y: 446, w: 132, h: 94, sp: 30, sit: 0 },
    baker: { x: 1246, y: 432, w: 114, h: 100, sp: 25, sit: 1 },
    shepherd: { x: 356, y: 874, w: 118, h: 66, sp: 23, sit: 0 },
    carpenter: { x: 798, y: 272, w: 126, h: 66, sp: 21, sit: 0 }
  };

  var agents = [];
  var byId = {};
  var homes = null;          // NPC 的原始站位（模块加载时就记下来，之后不再变）

  function captureHomes() {
    if (homes || !window.World || !World.npcs) return;
    homes = {};
    World.npcs.forEach(function (n) { homes[n.id] = { x: n.x, y: n.y }; });
  }

  function buildAgents() {
    captureHomes();
    if (!window.World || !World.npcs) return;
    agents = []; byId = {};
    World.npcs.forEach(function (n, i) {
      var z = ZONES[n.id];
      var h = homes[n.id] || { x: n.x, y: n.y };
      var a = {
        n: n, id: n.id, idx: i,
        hx: h.x, hy: h.y,
        x: n.x, y: n.y,
        dir: 0, moving: false,
        mode: z ? 'idle' : 'static',      // 没有活动区的（雪人）就只是站着
        until: 0, acc: (i * 0.037) % 0.25,
        tx: n.x, ty: n.y,
        z: z || null,
        seat: null,
        partner: null,
        bob: Math.random() * 6
      };
      if (z) { a.x = clamp(a.x, z.x, z.x + z.w); a.y = clamp(a.y, z.y, z.y + z.h); }
      agents.push(a); byId[n.id] = a;
      /* 位置写回 World.npcs：这样「走近和某人交谈」的判定、
         名字标签、深度排序全都自动跟着走，不需要改 game.js 的交互代码。 */
      n.x = a.x; n.y = a.y;
    });
  }

  function blocked(x, y, r) {
    var obs = (window.World && World.obstacles) || [];
    for (var i = 0; i < obs.length; i++) {
      var o = obs[i];
      if (x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h) return true;
    }
    return false;
  }
  function inZone(a, x, y) {
    var z = a.z;
    if (!z) return false;
    return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  }
  function nearOther(a, x, y, r) {
    for (var i = 0; i < agents.length; i++) {
      var o = agents[i];
      if (o === a || o.mode === 'static') continue;
      if (dist(o.x, o.y, x, y) < r) return o;
    }
    return null;
  }

  function setMode(a, m, dur) {
    a.mode = m;
    a.until = st.clock + (dur || 0);
    a.moving = (m === 'walk');
    if (m !== 'chat' && m !== 'greet') a.partner = null;
  }

  /* 在活动区里挑一个落脚点：不压障碍、不贴着别的 NPC、也不正好压在玩家身上 */
  function pickTarget(a, self) {
    var z = a.z;
    if (!z) return null;
    for (var tries = 0; tries < 8; tries++) {
      var x = z.x + Math.random() * z.w;
      var y = z.y + Math.random() * z.h;
      if (blocked(x, y, 9)) continue;
      if (nearOther(a, x, y, 30)) continue;
      if (self && dist(self.x, self.y, x, y) < 26) continue;
      return { x: x, y: y };
    }
    return null;
  }

  /* 找一个可以坐下的长椅：必须在活动区里，且离得不算远 */
  function benchFor(a) {
    var bs = (window.World && World.benches) || [];
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (inZone(a, b.x, b.y) && dist(a.x, a.y, b.x, b.y) < 120) return b;
    }
    return null;
  }

  function decide(a, self, ts) {
    /* 权重随环境变化：下雪更容易玩雪，夜里更容易看树，白天更多散步。
       权重小、变化慢，所以不会看到「所有 NPC 同时做同一件事」。 */
    var snowW = 0.10 + st.snow * 0.30;
    var treeW = 0.06 + st.lamp * 0.22;
    var sitW = a.z && a.z.sit ? 0.10 : 0;
    var idleW = (a.z && a.z.idle) ? a.z.idle : 0.24;
    var walkW = 0.46;

    /* 夜里树点满了会被吸引过去（这条只在树点亮之后才加权） */
    var treeStage = st.treeStage || 0;
    if (treeStage >= 4) treeW += 0.10;

    var total = walkW + idleW + snowW + treeW + sitW;
    var r = Math.random() * total;

    if (r < walkW) {
      var p = pickTarget(a, self);
      if (!p) { setMode(a, 'idle', 1.2 + Math.random() * 2.2); return; }
      a.tx = p.x; a.ty = p.y; setMode(a, 'walk', 0);
      return;
    }
    r -= walkW;
    if (r < idleW) { setMode(a, 'idle', 1.6 + Math.random() * 4.2); return; }
    r -= idleW;

    if (r < snowW && st.snow > 0.24) {
      setMode(a, 'snowplay', 2.0 + Math.random() * 1.8);
      puffAt(a.x, a.y - 6, 4);
      return;
    }
    r -= snowW;

    if (r < treeW) {
      /* 看树：走到朝向圣诞树的位置站着看一会儿 */
      var tree = (window.World && World.tree) || { x: 750, y: 545 };
      var ang = Math.atan2(a.y - tree.y, a.x - tree.x);
      var rr = 150 + Math.random() * 26;
      var tx = tree.x + Math.cos(ang) * rr, ty = tree.y + Math.sin(ang) * rr;
      /* 只在自己活动区里看树，别为了看树跑出老远 */
      if (inZone(a, tx, ty) && !blocked(tx, ty, 9)) {
        a.tx = tx; a.ty = ty; setMode(a, 'walk', 0); a.after = 'treewatch';
        return;
      }
      setMode(a, 'treewatch', 2.6 + Math.random() * 2.4);
      return;
    }
    r -= treeW;

    if (r < sitW) {
      var b = benchFor(a);
      if (b) {
        a.seat = b;
        a.tx = b.x + (a.x < b.x ? -11 : 11); a.ty = b.y - 7;
        setMode(a, 'walk', 0); a.after = 'sit';
        return;
      }
    }
    setMode(a, 'idle', 1.4 + Math.random() * 3);
  }

  /* 闲聊：两个都闲着的 NPC 离得够近，就可能停下来说两句 */
  function maybeChat(a) {
    if (a.mode !== 'idle' && a.mode !== 'treewatch') return;
    for (var i = 0; i < agents.length; i++) {
      var o = agents[i];
      if (o === a || o.mode === 'static' || o.partner) continue;
      if (o.mode !== 'idle' && o.mode !== 'treewatch') continue;
      if (dist(a.x, a.y, o.x, o.y) > 92) continue;
      if (Math.random() > 0.35) return;
      a.partner = o; o.partner = a;
      a.dir = dirTo(a.x, a.y, o.x, o.y);
      o.dir = dirTo(o.x, o.y, a.x, a.y);
      setMode(a, 'chat', 3.2 + Math.random() * 2.6);
      setMode(o, 'chat', 3.0 + Math.random() * 2.6);
      return;
    }
  }

  function dirTo(fx, fy, tx, ty) {
    var dx = tx - fx, dy = ty - fy;
    if (Math.abs(dx) > Math.abs(dy) * 1.15) return dx > 0 ? 3 : 2;
    return dy > 0 ? 0 : 1;
  }

  /* 雪地小扬雪（玩雪时用）——纯绘制，没有粒子对象 */
  var puffs = [];
  function puffAt(x, y, n) {
    for (var i = 0; i < n; i++) {
      if (puffs.length > 28) puffs.shift();
      puffs.push({ x: x, y: y, vx: (Math.random() - 0.5) * 42, vy: -30 - Math.random() * 34, life: 0.9 + Math.random() * 0.5 });
    }
  }

  function stepAgent(a, dt, ts, self) {
    if (a.mode === 'static') { a.moving = false; return; }

    /* 玩家贴得很近时先站住（不是碰撞，只是「让一下」，也顺便显得他们在注意你） */
    if (a.mode === 'walk' && self && dist(a.x, a.y, self.x, self.y) < 24) {
      a.moving = false;
    } else if (a.mode === 'walk') {
      var dx = a.tx - a.x, dy = a.ty - a.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 2.2) {
        a.x = a.tx; a.y = a.ty;
        a.moving = false;
        if (a.after === 'sit' && a.seat) { setMode(a, 'sit', 6 + Math.random() * 5); }
        else if (a.after === 'treewatch') {
          var tree = (window.World && World.tree) || { x: 750, y: 545 };
          a.dir = dirTo(a.x, a.y, tree.x, tree.y);
          setMode(a, 'treewatch', 3.4 + Math.random() * 2.6);
        } else setMode(a, 'idle', 0.8 + Math.random() * 1.6);
        a.after = null;
      } else {
        var sp = a.z.sp * dt;
        var nx = a.x + dx / d * sp, ny = a.y + dy / d * sp;
        var moved = false;
        if (!blocked(nx, a.y, 9) && inZone(a, nx, a.y)) { a.x = nx; moved = true; }
        if (!blocked(a.x, ny, 9) && inZone(a, a.x, ny)) { a.y = ny; moved = true; }
        if (!moved) { /* 被挡住就换一个目标，不要贴着墙抖 */
          var p = pickTarget(a, self);
          if (p) { a.tx = p.x; a.ty = p.y; } else setMode(a, 'idle', 1.2);
        }
        a.dir = dirTo(a.x, a.y, a.tx, a.ty);
        a.moving = true;
      }
    } else {
      a.moving = false;
    }

    /* 决策节拍（4Hz，按 NPC 错峰，避免同一帧全算一遍） */
    a.acc += dt;
    if (a.acc >= 1 / DECIDE_HZ) {
      a.acc -= 1 / DECIDE_HZ;
      if (a.mode === 'idle' && st.clock >= a.until) {
        /* 闲够了：先看看旁边有没有人能聊两句，再考虑自己干点什么 */
        if (Math.random() < 0.30) maybeChat(a);
        if (a.mode === 'idle') decide(a, self, ts);
      } else if ((a.mode === 'chat' || a.mode === 'greet') && st.clock >= a.until) {
        if (a.partner) a.partner.partner = null;
        a.partner = null;
        setMode(a, 'idle', 1.0 + Math.random() * 2.4);
      } else if ((a.mode === 'snowplay' || a.mode === 'treewatch' || a.mode === 'sit') && st.clock >= a.until) {
        setMode(a, 'idle', 0.9 + Math.random() * 2.2);
      } else if (a.mode === 'walk' && st.clock - (a.until || 0) > 26) {
        /* 走了太久还没到（被什么挡住）——回家，别在外面绕圈 */
        a.tx = a.hx; a.ty = a.hy; a.until = st.clock;
        if (dist(a.x, a.y, a.hx, a.hy) < 3) setMode(a, 'idle', 1.2);
      }
    }

    /* 坐下时朝向镜头（长椅都是横着摆的，朝下最自然） */
    if (a.mode === 'sit') a.dir = 0;

    /* 写回 World.npcs：交互判定 / 名字标签 / 深度排序都读这两个字段 */
    a.n.x = a.x; a.n.y = a.y; a.n.dir = a.dir;
  }

  /* ============================================================
   * 6. 牧场动物（只做小范围活动 + 玩雪，不新增养成）
   * ============================================================ */
  var ANIMAL_ZONES = {
    cow: { x: 376, y: 778, w: 44, h: 48 },
    sheep: { x: 492, y: 780, w: 62, h: 54 },
    hen: { x: 340, y: 790, w: 38, h: 40 }
  };
  var critters = [];
  function buildCritters() {
    critters = [];
    var list = (window.World && World.animals) || [];
    list.forEach(function (a, i) {
      var z = ANIMAL_ZONES[a.kind] || ANIMAL_ZONES[a.id];
      if (!z) return;
      critters.push({
        a: a, id: a.id, z: z,
        hx: a.x, hy: a.y, x: a.x, y: a.y,
        tx: a.x, ty: a.y, mode: 'idle', until: 0,
        acc: (i * 0.11) % 0.5, sp: a.kind === 'hen' ? 16 : 9, moving: false
      });
    });
  }
  function stepCritter(c, dt) {
    c.acc += dt;
    if (c.mode === 'walk') {
      var dx = c.tx - c.x, dy = c.ty - c.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1.5) { c.x = c.tx; c.y = c.ty; c.mode = 'idle'; c.until = st.clock + 2 + Math.random() * 5; c.moving = false; }
      else {
        var sp = c.sp * dt;
        c.x += dx / d * sp; c.y += dy / d * sp;
        c.moving = true;
      }
    } else if (c.mode === 'play') {
      if (st.clock >= c.until) { c.mode = 'idle'; c.until = st.clock + 2 + Math.random() * 4; }
    } else if (st.clock >= c.until) {
      /* 下雪天更容易「玩雪」，否则就是短距离走走 */
      if (st.snow > 0.3 && Math.random() < 0.38) {
        c.mode = 'play'; c.until = st.clock + 1.6 + Math.random() * 1.4;
        puffAt(c.x, c.y - 8, 3);
      } else {
        c.tx = c.z.x + Math.random() * c.z.w;
        c.ty = c.z.y + Math.random() * c.z.h;
        c.mode = 'walk';
      }
    }
    c.a.x = c.x; c.a.y = c.y;
  }

  /* ============================================================
   * 7. 双人自然互动（只改「怎么画」，不改真实坐标）
   * ============================================================ */
  var cp = {
    on: false, kind: '', since: 0, cool: 0,
    stillA: 0, stillB: 0,
    px: 0, py: 0, ox: 0, oy: 0, inited: false,
    dirA: 0, dirB: 0, sit: 0,
    ax: 0, ay: 0, bx: 0, by: 0,      // 实际用来画的位置（坐下时会平滑挪到椅子上）
    tx1: 0, ty1: 0, tx2: 0, ty2: 0,  // 目标位置
    k: 0
  };

  function resetCouple() {
    cp.on = false; cp.kind = ''; cp.sit = 0; cp.stillA = 0; cp.stillB = 0; cp.inited = false;
  }

  function pickKind(self, other) {
    var bs = (window.World && World.benches) || [];
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (dist(self.x, self.y, b.x, b.y) < 52 && dist(other.x, other.y, b.x, b.y) < 52) return { k: 'sit', bench: b };
    }
    var tree = (window.World && World.tree) || { x: 750, y: 545 };
    if (dist(self.x, self.y, tree.x, tree.y) < 205 && dist(other.x, other.y, tree.x, tree.y) < 205) {
      return { k: (st.treeStage >= 4 && st.lamp > 0.4) ? 'fireworks' : 'tree' };
    }
    if (st.snow > 0.34) return { k: 'snow' };
    return { k: 'face' };
  }

  function stepCouple(dt, self, other, inTown, otherOnline) {
    /* 对方离线时直接退出：不能因为最后一次位置还在那儿就一直「等着互动」 */
    if (!inTown || !other || !other.seen || other.inter !== 0 || otherOnline === false) { resetCouple(); return; }

    /* 静止判定：位移小于半像素就算「站着没动」 */
    if (!cp.inited) { cp.px = self.x; cp.py = self.y; cp.ox = other.x; cp.oy = other.y; cp.inited = true; }
    if (Math.abs(self.x - cp.px) + Math.abs(self.y - cp.py) < 0.6) cp.stillA += dt;
    else { cp.stillA = 0; cp.px = self.x; cp.py = self.y; }
    if (Math.abs(other.x - cp.ox) + Math.abs(other.y - cp.oy) < 0.6) cp.stillB += dt;
    else { cp.stillB = 0; cp.ox = other.x; cp.oy = other.y; }

    var d = dist(self.x, self.y, other.x, other.y);
    var moving = !!(self.moving || other.moving);

    /* 任意一方动了 / 走远了 → 立刻解除（不锁摇杆、不拦输入） */
    if (cp.on && (moving || d > 124)) {
      cp.on = false; cp.kind = ''; cp.cool = st.clock + 3.0; cp.sit = 0;
    }

    if (!cp.on) {
      if (st.clock < cp.cool) { cp.ax = self.x; cp.ay = self.y; cp.bx = other.x; cp.by = other.y; return; }
      if (d < 100 && cp.stillA > 1.0 && cp.stillB > 1.0) {
        var picked = pickKind(self, other);
        cp.on = true; cp.kind = picked.k; cp.since = st.clock;
        if (picked.k === 'sit' && picked.bench) {
          var b = picked.bench;
          cp.sit = 1;
          cp.tx1 = b.x - 13; cp.ty1 = b.y - 7;
          cp.tx2 = b.x + 13; cp.ty2 = b.y - 7;
          cp.ax = self.x; cp.ay = self.y; cp.bx = other.x; cp.by = other.y;
          cp.dirA = 0; cp.dirB = 0;
        } else {
          cp.sit = 0;
          cp.tx1 = self.x; cp.ty1 = self.y; cp.tx2 = other.x; cp.ty2 = other.y;
          cp.ax = self.x; cp.ay = self.y; cp.bx = other.x; cp.by = other.y;
          if (cp.kind === 'face') {
            cp.dirA = dirTo(self.x, self.y, other.x, other.y);
            cp.dirB = dirTo(other.x, other.y, self.x, self.y);
          } else if (cp.kind === 'snow') {
            cp.dirA = 1; cp.dirB = 1;          // 一起抬头看雪
          } else {
            /* 一起看树 / 看烟火 / 看雪：两个人都朝同一个方向 */
            var tvx = (window.World && World.tree) ? World.tree.x : self.x;
            var tvy = (window.World && World.tree) ? World.tree.y - 120 : self.y - 100;
            var dA = dirTo(self.x, self.y, tvx, tvy);
            cp.dirA = dA; cp.dirB = dA;
          }
        }
      }
    } else {
      /* 还在一起：位置目标跟随真实站位（坐下时是椅子） */
      if (cp.sit) {
        cp.dirA = 0; cp.dirB = 0;
      } else if (cp.kind === 'face') {
        cp.dirA = dirTo(self.x, self.y, other.x, other.y);
        cp.dirB = dirTo(other.x, other.y, self.x, self.y);
        cp.tx1 = self.x; cp.ty1 = self.y; cp.tx2 = other.x; cp.ty2 = other.y;
      } else {
        cp.tx1 = self.x; cp.ty1 = self.y; cp.tx2 = other.x; cp.ty2 = other.y;
      }
      /* 太长也会自然结束（避免两个人像被钉在那儿） */
      if (st.clock - cp.since > 16) { cp.on = false; cp.cool = st.clock + 3.0; cp.sit = 0; }
    }

    /* 画的位置平滑靠近目标（坐下时就是「走过去坐下」的过程） */
    var f = 1 - Math.exp(-dt * 6);
    cp.ax += (cp.tx1 - cp.ax) * f; cp.ay += (cp.ty1 - cp.ay) * f;
    cp.bx += (cp.tx2 - cp.bx) * f; cp.by += (cp.ty2 - cp.by) * f;
  }

  /* ============================================================
   * 8. 脚印的更新
   * ============================================================ */
  var lastP = { a: null };
  /* 走一段落一个脚印，左右交替；足迹垂直于前进方向偏移，看起来才像两串脚 */
  function leftPrint(rec, x, y, s, dark) {
    if (!rec.on) { rec.on = true; rec.x = x; rec.y = y; rec.side = 1; return; }
    var d = dist(rec.x, rec.y, x, y);
    if (d < rec.gap) return;
    var ang = Math.atan2(y - rec.y, x - rec.x) || 0;
    rec.side = -rec.side;
    addPrint(x + Math.cos(ang + Math.PI / 2) * 3.4 * rec.side,
      y + Math.sin(ang + Math.PI / 2) * 2.2 * rec.side,
      s, rec.side * 0.30, dark);
    rec.x = x; rec.y = y;
  }

  /* ============================================================
   * 9. 对外：每帧推进
   * ============================================================ */
  var hidden = false;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () { hidden = !!document.hidden; });
  }

  function tick(dt, ts, info) {
    var now = Date.now();
    updateEnv(dt, now);
    if (!agents.length) { buildAgents(); buildCritters(); }
    if (!info || !info.inTown) { resetCouple(); return; }
    if (hidden) return;   // 后台不跑 NPC/动物，只留时间轴

    var self = info.self;
    st.treeStage = info.treeStage || 0;

    for (var i = 0; i < agents.length; i++) stepAgent(agents[i], dt, ts, self);
    for (var j = 0; j < critters.length; j++) stepCritter(critters[j], dt);
    stepCouple(dt, self, info.remote, true, info.remoteOnline);

    /* 脚印：自己、NPC、牧场动物 */
    if (self) {
      if (!lastP.a) lastP.a = { on: false, gap: 21, side: 1, x: 0, y: 0 };
      if (self.moving) leftPrint(lastP.a, self.x, self.y, 1, 0);
      else lastP.a.on = false;
    }
    var i2;
    for (i2 = 0; i2 < agents.length; i2++) {
      var a = agents[i2];
      if (!a.moving) { a.pr = null; continue; }
      if (!a.pr) a.pr = { on: false, gap: 24, side: 1, x: 0, y: 0 };
      leftPrint(a.pr, a.x, a.y, 0.72, 1);
    }
    for (i2 = 0; i2 < critters.length; i2++) {
      var c = critters[i2];
      if (!c.moving) { c.pr = null; continue; }
      if (!c.pr) c.pr = { on: false, gap: 22, side: 1, x: 0, y: 0 };
      leftPrint(c.pr, c.x, c.y, 0.55, 1);
    }

    /* 脚印淡出 */
    for (var k = prints.length - 1; k >= 0; k--) {
      prints[k].life -= dt;
      if (prints[k].life <= 0) prints.splice(k, 1);
    }
    /* 扬雪 */
    for (var q = puffs.length - 1; q >= 0; q--) {
      var pf = puffs[q];
      pf.life -= dt; pf.x += pf.vx * dt; pf.y += pf.vy * dt; pf.vy += 46 * dt; pf.vx *= 0.97;
      if (pf.life <= 0) puffs.splice(q, 1);
    }

    stepFireworks(dt);
    stepGather();
  }

  /* ============================================================
   * 10. 零星的「生活事件」：夜里树点满 → 偶尔放一朵小烟花 + 居民聚过来
   * ============================================================ */
  var fw = { next: 0, parts: [] };
  function stepFireworks(dt) {
    if (st.treeStage >= 5 && st.lamp > 0.55) {
      if (!fw.next) fw.next = st.clock + 30 + Math.random() * 40;
      else if (st.clock >= fw.next) {
        fw.next = st.clock + 34 + Math.random() * 46;
        var tree = (window.World && World.tree) || { x: 750, y: 545 };
        var cx = tree.x + (Math.random() - 0.5) * 160;
        var cy = tree.y - 340 - Math.random() * 90;
        var hue = Math.random() < 0.5 ? '255,220,150' : '200,230,255';
        for (var i = 0; i < 14; i++) {
          var an = (i / 14) * TAU + Math.random() * 0.3;
          var sp = 70 + Math.random() * 60;
          fw.parts.push({ x: cx, y: cy, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: 1.1 + Math.random() * 0.5, c: hue });
        }
      }
    } else {
      fw.next = 0;
    }
    for (var j = fw.parts.length - 1; j >= 0; j--) {
      var p = fw.parts[j];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.vx *= 0.985;
      if (p.life <= 0) fw.parts.splice(j, 1);
    }
  }

  /* 偶尔让两三个居民慢慢聚到树附近抬头看一会儿（纯视觉，无奖励） */
  var gather = { next: 0 };
  function stepGather() {
    if (st.treeStage < 4 || st.lamp < 0.5) { gather.next = 0; return; }
    if (!gather.next) { gather.next = st.clock + 60 + Math.random() * 60; return; }
    if (st.clock < gather.next) return;
    gather.next = st.clock + 90 + Math.random() * 90;
    var tree = (window.World && World.tree) || { x: 750, y: 545 };
    var near = [];
    for (var i = 0; i < agents.length; i++) {
      var a = agents[i];
      if (a.mode === 'static' || a.mode === 'chat' || a.mode === 'sit') continue;
      if (dist(a.x, a.y, tree.x, tree.y) < 340) near.push(a);
    }
    if (near.length < 2) return;
    near.sort(function (p, q) { return Math.random() - 0.5; });
    for (var k = 0; k < Math.min(2, near.length); k++) {
      var ag = near[k];
      var ang = (k === 0 ? -0.65 : 0.65) + Math.random() * 0.2;
      var rr = 132 + Math.random() * 20;
      var tx = tree.x + Math.cos(ang) * rr, ty = tree.y + Math.sin(ang) * rr + 60;
      if (blocked(tx, ty, 10)) continue;
      ag.tx = tx; ag.ty = ty; ag.after = 'treewatch';
      setMode(ag, 'walk', 0);
    }
  }

  /* ============================================================
   * 11. 绘制
   * ============================================================ */

  /* 预烘焙的暖光 sprite：每帧只做 drawImage，不新建渐变 */
  var _glow = null;
  function glowSprite() {
    if (_glow || typeof document === 'undefined') return _glow;
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var rg = g.createRadialGradient(64, 64, 1, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,226,164,1)');
    rg.addColorStop(0.36, 'rgba(255,206,132,.46)');
    rg.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    _glow = c;
    return c;
  }
  function glow(ctx, x, y, r, a) {
    var s = glowSprite();
    if (!s || a <= 0.002) return;
    ctx.globalAlpha = a;
    ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  /* --- 地面层：脚印 --- */
  function drawFootprints(ctx, view) {
    if (!prints.length) return;
    for (var i = 0; i < prints.length; i++) {
      var p = prints[i];
      if (p.x < view.x - 20 || p.x > view.x + view.w + 20 || p.y < view.y - 20 || p.y > view.y + view.h + 20) continue;
      var f = p.life / p.max;
      var a = f * f * 0.34;
      ctx.fillStyle = (p.dark ? 'rgba(120,146,186,' : 'rgba(140,166,205,') + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 3.1 * p.s, 1.8 * p.s, p.rot, 0, TAU);
      ctx.fill();
    }
  }

  /* --- 建筑层：烟囱的烟（纯时间函数，不存粒子） --- */
  function drawBuildingLife(ctx, b, ts) {
    var cx = b.x + b.w * 0.76;
    var cy = b.y + 2;
    var night = st.lamp;
    var n = 5;
    for (var i = 0; i < n; i++) {
      var ph = ((ts / 4200) + i / n + (b.x % 97) / 97) % 1;
      var y = cy - 6 - ph * 52;
      var x = cx + Math.sin(ph * 5.2 + b.x * 0.01) * 7 + ph * 10;
      var a = (1 - ph) * 0.30 * (0.55 + night * 0.65);
      var r = 2.6 + ph * 7.4;
      ctx.fillStyle = 'rgba(232,238,246,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  /* --- 圣诞树的背光：画在树「之前」，所以只在树的轮廓外缘透出来，
         看起来是「树在发光」，而不是「树被一层白光糊住了」 --- */
  function drawTreeHalo(ctx, tree, stage) {
    if (!tree || stage < 1) return;
    var night = st.lamp;
    var a = (0.06 + stage * 0.028) * (0.30 + night * 0.85);
    if (a <= 0.004) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, tree.x, tree.y - 112, 118 + stage * 26, a);
    ctx.restore();
  }


  /* 树上一串会闪的小灯：位置由序号算出来（不随机），亮度靠时间相位推 */
  function drawTreeLights(ctx, tree, stage, night) {
    var n = 6 + stage * 3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < n; i++) {
      var f = 0.16 + ((i * 37) % 100) / 100 * 0.78;      // 0.16..0.94，从树尖到树脚
      var y = tree.y - 330 + f * 330;
      var halfW = 16 + f * 128;
      var ang = ((i * 97) % 360) / 360 * TAU;
      var x = tree.x + Math.cos(ang) * halfW * 0.86;
      var tw = 0.35 + 0.65 * Math.abs(Math.sin(st.clock * 1.6 + i * 0.83));
      var warm = (i % 3 === 0) ? '255,236,180' : ((i % 3 === 1) ? '255,196,120' : '198,230,255');
      ctx.fillStyle = 'rgba(' + warm + ',' + (0.55 * tw * night).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, 1.9 + tw * 1.1, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(' + warm + ',' + (0.13 * tw * night).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, 7.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* --- NPC 绘制：朝向镜像 / 走路步频 / 坐下 / 蹲下玩雪 --- */
  function drawNpc(ctx, n, v, ts) {
    var S2 = window.Sprites;
    if (!S2) return;
    var fr = v.moving ? (Math.floor(ts / 190) % 4) : 0;
    var tw = v.moving ? ts * 1.9 : ts;    // 村民精灵只有上下呼吸，走起来把呼吸加快一点
    ctx.save();
    if (v.sit) {
      ctx.translate(v.x, v.y);
      ctx.scale(1, 0.84);
      ctx.translate(-v.x, -v.y - 3);
    } else if (v.duck) {
      ctx.translate(v.x, v.y);
      ctx.scale(1, 0.92);
      ctx.translate(-v.x, -v.y);
    }
    if (v.flip) { ctx.translate(v.x * 2, 0); ctx.scale(-1, 1); }
    if (n.id === 'santa') S2.drawSanta(ctx, v.x, v.y, ts);
    else if (n.id === 'snowman') S2.drawSnowman(ctx, v.x, v.y, ts);
    else if (n.style) S2.drawVillager(ctx, v.x, v.y, tw, n.style, fr);
    else if (n.id === 'elf') S2.drawElf(ctx, v.x, v.y, ts, fr);
    else S2.drawBarista(ctx, v.x, v.y, ts, fr);
    ctx.restore();
  }

  function viewOf(n) {
    var a = byId[n.id];
    if (!a) return { x: n.x, y: n.y, dir: 0, moving: false, sit: false, duck: false, flip: false };
    return {
      x: a.x, y: a.y, dir: a.dir, moving: a.moving,
      sit: a.mode === 'sit', duck: a.mode === 'snowplay',
      flip: a.dir === 2
    };
  }

  /* --- 环境光 + 光池 + 极光 --- */
  function drawNight(ctx, view, opt) {
    opt = opt || {};
    var W = window.World;
    if (!W) return;

    /* 1) 环境光：从上到下由冷到暖，夜晚整体压暗。
          用世界坐标做渐变（不是屏幕坐标），这样相机移动时天色不会跟着跑。 */
    if (st.aa > 0.004) {
      /* 渐变跟着「画面」而不是「整张地图」走：镜头挪到哪儿，远/近的明暗关系都一样。
         三段色：远景最冷最暗 → 中景是主色 → 近景略亮一点点（不至于踩在黑里）。 */
      var g = ctx.createLinearGradient(0, view.y, 0, view.y + view.h);
      g.addColorStop(0, rgba3(st.top, Math.min(0.92, st.aa * 1.20)));
      g.addColorStop(0.56, rgba3(st.amb, st.aa));
      g.addColorStop(1, rgba3(st.bot, st.aa * 0.90));
      ctx.fillStyle = g;
      ctx.fillRect(view.x, view.y, view.w, view.h);
    }

    /* 2) 光池：路灯 / 窗户 / 圣诞树 / 自己脚下。lighter 叠加，暖光会自然「点亮」冷色。 */
    var night = st.lamp;
    if (night > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      var lamps = W.lamps || [];
      for (var i = 0; i < lamps.length; i++) {
        var l = lamps[i];
        if (l.x < view.x - 120 || l.x > view.x + view.w + 120 || l.y < view.y - 160 || l.y > view.y + view.h + 120) continue;
        glow(ctx, l.x, l.y - 40, 100, 0.42 * night);
        glow(ctx, l.x, l.y - 6, 56, 0.22 * night);   // 地面上的那圈光
      }

      /* 窗户：每栋楼两扇，位置和 world.js 的 drawWindows 对齐 */
      var bs = W.buildings || [];
      for (var j = 0; j < bs.length; j++) {
        var b = bs[j];
        if (b.x < view.x - 260 || b.x > view.x + view.w + 260) continue;
        var wt = b.y + 34;
        glow(ctx, b.x + 43, wt + 41, 48, 0.40 * st.win);
        glow(ctx, b.x + b.w - 43, wt + 41, 48, 0.40 * st.win);
      }

      /* 圣诞树：树越亮，光越大越暖；白天也留一点点，显得树本身在发亮 */
      var stage = st.treeStage || 0;
      if (W.tree && stage >= 1) {
        /* 光落在树脚下那圈雪地上，而不是打在树身上——打在树上会把树照成一片惨白 */
        var tr = 96 + stage * 16;
        glow(ctx, W.tree.x, W.tree.y + 16, tr, (0.08 + stage * 0.030) * (0.50 + night * 0.55));
        /* 树身上只补一层很淡的暖雾：环境光把整棵树压暗了，这里把它「抬」回一点点，
           让点亮的树在夜里仍然是主角，但不至于糊成一团白。 */
        glow(ctx, W.tree.x, W.tree.y - 100, 104 + stage * 12, (0.05 + stage * 0.020) * night);
        drawTreeLights(ctx, W.tree, stage, night);
      }

      /* 自己脚下：夜里不至于看不见自己 */
      if (opt.self) glow(ctx, opt.self.x, opt.self.y - 10, 72, 0.17 * night);

      ctx.restore();
    }

    /* 3) 极光：只在极光窗口、而且夜色够深时才出现。
          小镇是俯视绘本视角，没有真正的地平线，所以不做「空中光带」，
          改成从画面顶端往下渗的一片冷绿 / 青蓝辉光 + 极缓的明暗起伏，
          看起来像「头顶那片天在发亮」，而不是横在街上的一条彩带。 */
    if (st.aurora > 0.02 && night > 0.32) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var reach = Math.min(view.h * 0.42, 300);
      var bands = [
        ['96,240,190', 0.085],
        ['120,196,255', 0.062],
        ['188,150,255', 0.040]
      ];
      for (var k = 0; k < bands.length; k++) {
        var hK = reach * (1 - k * 0.20);
        var top = view.y - 10 + k * 14;
        var gg = ctx.createLinearGradient(0, top, 0, top + hK);
        var base = bands[k][1] * st.aurora * Math.min(1, (night - 0.3) * 2.4);
        var sway = 0.55 + 0.45 * Math.sin(st.clock * 0.33 + k * 2.1);
        gg.addColorStop(0, 'rgba(' + bands[k][0] + ',' + (base * 0.28 * sway).toFixed(3) + ')');
        gg.addColorStop(0.22, 'rgba(' + bands[k][0] + ',' + (base * sway).toFixed(3) + ')');
        gg.addColorStop(0.62, 'rgba(' + bands[k][0] + ',' + (base * 0.34).toFixed(3) + ')');
        gg.addColorStop(1, 'rgba(' + bands[k][0] + ',0)');
        ctx.fillStyle = gg;
        ctx.fillRect(view.x, top, view.w, hK);
      }
      ctx.restore();
    }

    /* 4) 扬雪 / 烟花 */
    if (puffs.length) {
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      for (var p = 0; p < puffs.length; p++) {
        var pf = puffs[p];
        ctx.globalAlpha = clamp(pf.life, 0, 1) * 0.8;
        ctx.beginPath(); ctx.arc(pf.x, pf.y, 2.4, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (fw.parts.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var q = 0; q < fw.parts.length; q++) {
        var fp = fw.parts[q];
        ctx.fillStyle = 'rgba(' + fp.c + ',' + clamp(fp.life, 0, 1).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(fp.x, fp.y, 2.2, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  /* --- NPC 说话气泡（聊 / 打招呼时） --- */
  function drawBubbles(ctx, view, ts) {
    if (!agents.length) return;
    for (var i = 0; i < agents.length; i++) {
      var a = agents[i];
      if (a.mode !== 'chat' && a.mode !== 'greet') continue;
      if (a.x < view.x - 40 || a.x > view.x + view.w + 40 || a.y < view.y - 40 || a.y > view.y + view.h + 120) continue;
      var by = a.y - 74 + Math.sin(ts / 520 + a.bob) * 1.6;
      var txt = a.mode === 'chat' ? '···' : '👋';
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(255,252,244,.94)';
      ctx.strokeStyle = 'rgba(120,96,70,.5)';
      ctx.lineWidth = 1;
      var w = a.mode === 'chat' ? 26 : 22, h = 16;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(a.x - w / 2, by - h, w, h, 8); }
      else { ctx.beginPath(); ctx.rect(a.x - w / 2, by - h, w, h); }
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,252,244,.94)';
      ctx.beginPath();
      ctx.moveTo(a.x - 3, by - 1); ctx.lineTo(a.x + 3, by - 1); ctx.lineTo(a.x, by + 4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6b5240';
      ctx.font = '700 10px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, a.x, by - h / 2 + 0.5);
      ctx.restore();
    }
  }

  /* --- 雪：数量与速度随天气变化 --- */
  var SNOW_DENS = { clear: 0.30, snow: 0.76, heavy: 1.0, aurora: 0.42 };
  var SNOW_SPD = { clear: 0.55, snow: 1.0, heavy: 1.45, aurora: 0.6 };
  function drawSnowfall(ctx, flakes, view, worldW, worldH) {
    if (!flakes || !flakes.length) return;
    var dens = SNOW_DENS[st.wx] === undefined ? 0.7 : SNOW_DENS[st.wx];
    var spd = SNOW_SPD[st.wx] === undefined ? 1 : SNOW_SPD[st.wx];
    var n = Math.max(6, Math.round(flakes.length * dens));
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (var i = 0; i < n; i++) {
      var f = flakes[i];
      f.y += f.v * 0.016 * spd;
      f.x += Math.sin(st.clock * 1.1 + f.ph) * 0.45 * spd;
      if (f.y > worldH) { f.y = -6; f.x = Math.random() * worldW; }
      if (f.x > view.x - 12 && f.x < view.x + view.w + 12 && f.y > view.y - 12 && f.y < view.y + view.h + 12) {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (st.wx === 'heavy' ? 1.15 : 1), 0, TAU); ctx.fill();
      }
    }
  }

  /* --- 双人互动：两人之间浮一层很淡的暖光（坐着时略强） --- */
  function drawCoupleGlow(ctx) {
    if (!cp.on) return;
    var mx = (cp.ax + cp.bx) / 2, my = (cp.ay + cp.by) / 2 - 30;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var pul = 0.72 + 0.28 * Math.sin(st.clock * 1.8);
    glow(ctx, mx, my, 62, (cp.sit ? 0.13 : 0.10) * pul);
    ctx.restore();
  }

  /* 坐下时把角色压矮一点（脚底位置不变，视觉上就是「坐下去」） */
  function seatTransform(ctx, x, y) {
    ctx.translate(x, y);
    ctx.scale(1, 0.84);
    ctx.translate(-x, -y - 3);
  }

  function coupleView() { return cp; }

  /* ============================================================
   * 12. 验收用接口（只读快照 + 可控时钟；不影响存档）
   * ============================================================ */
  function snapshot() {
    return {
      phase: st.phase,
      vt: +st.vt.toFixed(4),
      aa: +st.aa.toFixed(3),
      lamp: +st.lamp.toFixed(3),
      win: +st.win.toFixed(3),
      wx: st.wx,
      snow: +st.snow.toFixed(3),
      aurora: +st.aurora.toFixed(3),
      agents: agents.map(function (a) {
        return {
          id: a.id, x: +a.x.toFixed(1), y: +a.y.toFixed(1), mode: a.mode,
          inZone: a.z ? inZone(a, a.x, a.y) : true,
          blocked: blocked(a.x, a.y, 8)
        };
      }),
      couple: { on: cp.on, kind: cp.kind, sit: cp.sit, dirA: cp.dirA, dirB: cp.dirB },
      prints: prints.length,
      critters: critters.map(function (c) { return { id: c.id, x: +c.x.toFixed(1), y: +c.y.toFixed(1), mode: c.mode }; })
    };
  }

  function setClock(t, hold) {
    st.vt = ((t % 1) + 1) % 1;
    st.vtInit = true;
    st.frozen = hold !== false;
    updateEnv(0.016, Date.now());
  }
  function releaseClock() {
    st.frozen = false;
    st.vt = vtOf(Date.now());
  }
  /* instant=false 时只改目标值，让强度自己渐变过去 ——
     这正是天气窗口切换时走的那条路径（验收脚本用它证明「不会一秒变天」）。 */
  function setWeather(name, instant) {
    st.wxLock = name || null;
    st.slot = -1;
    updateEnv(0.016, Date.now());
    if (name) {
      st.snowTarget = WX_SNOW[name] || 0;
      st.auroraTarget = (name === 'aurora') ? 1 : 0;
      if (instant !== false) { st.snow = st.snowTarget; st.aurora = st.auroraTarget; }
    }
  }
  function releaseWeather() { st.wxLock = null; st.slot = -1; updateEnv(0.016, Date.now()); }

  /* 快进模拟：验收脚本用它把 60 秒的行为在几十毫秒里跑完 */
  function simulate(sec) {
    var steps = Math.max(1, Math.round(sec * 10));
    var dt = 1 / 10;
    var ts = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var self = { x: -9999, y: -9999, moving: false };
    for (var i = 0; i < steps; i++) {
      st.clock += dt;
      for (var k = 0; k < agents.length; k++) stepAgent(agents[k], dt, ts, self);
      for (var j = 0; j < critters.length; j++) stepCritter(critters[j], dt);
      stepGather();
    }
    return snapshot();
  }

  function reset() {
    prints.length = 0; printHead = 0;
    puffs.length = 0; fw.parts.length = 0; fw.next = 0;
    gather.next = 0;
    resetCouple();
    if (agents.length && homes) {
      agents.forEach(function (a) {
        var h = homes[a.id] || { x: a.hx, y: a.hy };
        a.x = h.x; a.y = h.y; a.tx = h.x; a.ty = h.y;
        a.mode = a.z ? 'idle' : 'static'; a.until = 0; a.moving = false; a.after = null; a.seat = null;
        a.n.x = a.x; a.n.y = a.y;
      });
      critters.forEach(function (c) { c.x = c.hx; c.y = c.hy; c.tx = c.hx; c.ty = c.hy; c.mode = 'idle'; c.a.x = c.hx; c.a.y = c.hy; });
    }
    lastP.a = null;
  }

  return {
    version: '4.7.0',
    tick: tick,
    drawFootprints: drawFootprints,
    drawBuildingLife: drawBuildingLife,
    drawNpc: drawNpc,
    viewOf: viewOf,
    drawNight: drawNight,
    drawBubbles: drawBubbles,
    drawSnowfall: drawSnowfall,
    drawCoupleGlow: drawCoupleGlow,
    seatTransform: seatTransform,
    drawTreeHalo: drawTreeHalo,
    coupleView: coupleView,
    snapshot: snapshot,
    setClock: setClock,
    releaseClock: releaseClock,
    setWeather: setWeather,
    releaseWeather: releaseWeather,
    simulate: simulate,
    reset: reset,
    zones: ZONES
  };
})();
