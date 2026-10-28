/* Omo's Christmas Village — 阶段 1 双人同步原型
 * 数据模型（Firebase Realtime Database，路径 rooms/{roomId}）：
 * {
 *   createdAt: number,
 *   slots: { a: {device, joinedAt, outfit}, b: {...} },   // 玩家绑定
 *   presence: { a: true, b: true },                        // 在线状态(onDisconnect 清除)
 *   tree: { stage: 0..3, updatedBy, updatedAt },           // 共享圣诞树
 *   log: { <pushId>: {slot, what, at} }                    // 同步日志
 * }
 */
(function () {
  'use strict';

  // ---------- 小工具 ----------
  var $ = function (s) { return document.querySelector(s); };
  var CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
  function randomCode(len) {
    var bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    var s = '';
    for (var i = 0; i < len; i++) s += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    return s;
  }
  function deviceId() {
    var id = localStorage.getItem('omo_device_id');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : randomCode(24));
      localStorage.setItem('omo_device_id', id);
    }
    return id;
  }
  function getRoomFromUrl() {
    var m = location.hash.match(/room=([a-z0-9]{6,32})/i);
    if (m) return m[1].toLowerCase();
    try {
      var q = new URLSearchParams(location.search).get('room');
      if (q && /^[a-z0-9]{6,32}$/i.test(q)) return q.toLowerCase();
    } catch (e) { /* 兜底 */ }
    return null;
  }
  function setRoomHash(code) {
    try { history.replaceState(null, '', '#room=' + code); } catch (e) { location.hash = 'room=' + code; }
  }
  function inviteUrl(code) {
    return location.origin + location.pathname + '?room=' + code;
  }
  function fmtTime(ms) {
    var d = new Date(ms);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function toast(msg, ms) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.add('hidden'); }, ms || 2400);
  }

  var OUTFITS = { winter: '冬日暖装', santa: '圣诞装', home: '居家睡衣' };
  var STAGES = ['小树苗', '已装饰', '挂上彩灯', '全树点亮'];
  var SLOTS = { a: '玩家 A', b: '玩家 B' };

  // ============================================================
  // 后端抽象：Firebase 实现与本地演示实现共用同一接口
  // ============================================================

  function createFirebaseBackend(config) {
    firebase.initializeApp(config);
    var auth = firebase.auth();
    var db = firebase.database();
    var roomRef = null;
    var mySlot = null;
    var onState = null, onConn = null, onFull = null;

    // 全局连接监听：进入大厅时就能显示真实连接状态；断线重连后自动重新登记在线状态
    db.ref('.info/connected').on('value', function (snap) {
      var on = !!snap.val();
      onConn && onConn(on);
      if (on) registerPresence();
    });

    /* 主动登记「我在线」。
       只靠 .info/connected 的第一次回调不够：那一刻 mySlot 可能还是 null
       （房间还没建/还没坐进槽位），于是对方永远看到「离线」，直到某次断线重连。
       所以坐进槽位的每一步都自己调一次，并把 onDisconnect 挂好。 */
    function registerPresence() {
      if (!roomRef || !mySlot || !auth.currentUser) return;
      try {
        var p = roomRef.child('presence/' + mySlot);
        p.onDisconnect().remove();
        p.set(true);
      } catch (e) { }
    }

    // 匿名登录：无需注册，设备获得一个固定 UID（同一浏览器保持不变）。
    // 安全规则用它做访问控制：只有已登录 UID 且绑定了槽位的客户端才能写数据。
    function ensureAuth() {
      if (auth.currentUser) return Promise.resolve(auth.currentUser);
      return auth.signInAnonymously().then(function (cred) { return cred.user; });
    }

    function pushLog(what) {
      if (!roomRef || !mySlot) return;
      roomRef.child('log').push({ slot: mySlot, what: what, at: firebase.database.ServerValue.TIMESTAMP });
    }

    function bindRoomListeners() {
      roomRef.on('value', function (snap) {
        onState && onState(snap.val());
      }, function (err) {
        console.error(err);
        onConn && onConn(false);
        toast('同步出错：' + ((err && err.message) || '权限被拒绝'));
      });
    }

    function claimSlot(code, depth, prefer) {
      depth = depth || 0;
      roomRef = db.ref('rooms/' + code);
      var uid = auth.currentUser.uid;
      // 先读当前占用情况，挑一个空槽位；再对该槽位本身做事务（规则只授权到槽位级别）
      return roomRef.child('slots').once('value').then(function (snap) {
        var cur = snap.val() || {};
        var target = null;
        // v3：玩家在大厅选了角色时，优先坐自己选的那个位置（只在它是空位/本来就是自己的时候）
        var preferFree = prefer && (prefer === 'a' || prefer === 'b') && (!cur[prefer] || cur[prefer].uid === uid);
        if (cur.a && cur.a.uid === uid) target = 'a';
        else if (cur.b && cur.b.uid === uid) target = 'b';
        else if (preferFree) target = prefer;
        else if (!cur.a) target = 'a';
        else if (!cur.b) target = 'b';
        if (!target) { onFull && onFull(); return false; } // 两个位置都被占用

        return roomRef.child('slots/' + target).transaction(function (leaf) {
          if (leaf && leaf.uid !== uid) return undefined; // 被别人抢先占用了 → 中止重试
          if (!leaf) {
            return { uid: uid, joinedAt: firebase.database.ServerValue.TIMESTAMP, outfit: 'winter' };
          }
          return leaf; // 已经是我的
        }).then(function (res) {
          if (res.committed) {
            mySlot = target;
            bindRoomListeners();
            registerPresence();
            return true;
          }
          if (depth >= 3) { onFull && onFull(); return false; }
          return claimSlot(code, depth + 1, prefer); // 被抢 → 重新读取再试
        });
      });
    }

    return {
      mode: 'firebase',
      createRoom: function (prefer) {
        var code = randomCode(10);
        var slot = (prefer === 'b') ? 'b' : 'a';
        return ensureAuth().then(function () {
          // 房间通过写入一个槽位创建（规则只允许在空槽位上这样写）
          return db.ref('rooms/' + code + '/slots/' + slot).set({
            uid: auth.currentUser.uid,
            joinedAt: firebase.database.ServerValue.TIMESTAMP,
            outfit: 'winter'
          });
        }).then(function () {
          mySlot = slot;
          roomRef = db.ref('rooms/' + code);
          bindRoomListeners();
          registerPresence();
          return code;
        });
      },
      joinRoom: function (code, prefer) {
        return ensureAuth().then(function () {
          /* 先确认这个房间存在：以前直接写槽位，房间码打错一个字母就会「凭空
             建出一个新房间」，看起来像是自己的存档没了。现在明确报错。 */
          return db.ref('rooms/' + code).once('value');
        }).then(function (snap) {
          if (!snap || !snap.exists()) {
            var e = new Error('房间不存在，检查一下房间码');
            e.code = 'ROOM_NOT_FOUND';
            throw e;
          }
          return claimSlot(code, 0, prefer);
        });
      },
      // 接管模式：拿着链接的人可以选择占用某个角色进入（保留该角色原有服装）
      takeoverSlot: function (slot) {
        return ensureAuth().then(function () {
          return roomRef.child('slots/' + slot).once('value');
        }).then(function (snap) {
          var cur = snap.val() || {};
          return roomRef.child('slots/' + slot).set({
            uid: auth.currentUser.uid,
            device: deviceId(),
            joinedAt: cur.joinedAt || firebase.database.ServerValue.TIMESTAMP,
            outfit: cur.outfit || 'winter'
          });
        }).then(function () {
          mySlot = slot;
          bindRoomListeners();
          registerPresence();
          return true;
        });
      },
      setTreeStage: function (n) {
        return roomRef.child('tree').set({
          stage: n, updatedBy: mySlot, updatedAt: firebase.database.ServerValue.TIMESTAMP
        }).then(function () { pushLog('把圣诞树装饰到了「' + STAGES[n] + '」'); });
      },
      setOutfit: function (key) {
        return roomRef.child('slots/' + mySlot + '/outfit').set(key)
          .then(function () { pushLog('换上了「' + OUTFITS[key] + '」'); });
      },
      setPos: function (x, y, dir, moving, indoor) {
        return roomRef.child('slots/' + mySlot + '/pos').set({
          x: Math.round(x), y: Math.round(y), dir: dir, moving: moving ? 1 : 0,
          indoor: indoor || 0, // 0 = 室外，否则为室内场景 id（cabin/cafe/greenhouse/workshop）
          t: firebase.database.ServerValue.TIMESTAMP
        });
      },
      setWave: function () {
        return roomRef.child('slots/' + mySlot + '/wave').set(firebase.database.ServerValue.TIMESTAMP);
      },
      // 共享世界数据（资源/花园/回忆/任务/热可可）事务写入。
      // 用 transaction 保证两台设备同时操作（例如同时收获）不会重复计数。
      // fn(cur) 返回新对象；返回 undefined 则放弃本次修改。
      // ★ 需要在 Firebase 控制台为 rooms/{id}/world 放行写权限（见 README v2 规则）。
      worldTransact: function (fn) {
        return roomRef.child('world').transaction(fn).then(function (res) {
          return { committed: !!res.committed, value: res.snapshot ? res.snapshot.val() : null };
        });
      },
      mySlot: function () { return mySlot; },
      resetIdentity: function () { return auth.signOut(); },
      onState: function (cb) { onState = cb; },
      onConn: function (cb) { onConn = cb; },
      onFull: function (cb) { onFull = cb; }
    };
  }

  // 本地演示后端：仅预览界面，不连云端（页面有明确提示，不代表已同步）
  function createDemoBackend() {
    var KEY = 'omo_demo_room_v1';
    var listeners = [], fullLs = [];
    var mySlot = null;
    var data = null;
    try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
    if (!data) { data = freshRoom(); }
    function freshRoom() {
      return { createdAt: Date.now(), slots: {}, presence: {}, tree: { stage: 0, updatedBy: null, updatedAt: null }, log: {} };
    }
    function save() {
      localStorage.setItem(KEY, JSON.stringify(data));
      var snap = JSON.parse(JSON.stringify(data));
      listeners.forEach(function (cb) { cb(snap); });
    }
    window.addEventListener('storage', function (ev) {
      if (ev.key === KEY && ev.newValue) {
        data = JSON.parse(ev.newValue);
        var snap = JSON.parse(JSON.stringify(data));
        listeners.forEach(function (cb) { cb(snap); });
      }
    });

    return {
      mode: 'demo',
      createRoom: function (prefer) {
        data = freshRoom(); save();
        mySlot = (prefer === 'b') ? 'b' : 'a';
        return Promise.resolve('demo');
      },
      joinRoom: function (code, prefer) {
        var dev = deviceId();
        if (data.slots.a && data.slots.a.device === dev) mySlot = 'a';
        else if (data.slots.b && data.slots.b.device === dev) mySlot = 'b';
        else if (prefer && !data.slots[prefer]) { mySlot = prefer; data.slots[prefer] = { device: dev, joinedAt: Date.now(), outfit: 'winter' }; }
        else if (!data.slots.a) { mySlot = 'a'; data.slots.a = { device: dev, joinedAt: Date.now(), outfit: 'winter' }; }
        else if (!data.slots.b) { mySlot = 'b'; data.slots.b = { device: dev, joinedAt: Date.now(), outfit: 'winter' }; }
        else { fullLs.forEach(function (cb) { cb(); }); return Promise.resolve(false); }
        data.presence[mySlot] = true;
        save();
        return Promise.resolve(true);
      },
      setTreeStage: function (n) {
        data.tree = { stage: n, updatedBy: mySlot, updatedAt: Date.now() };
        data.log['l' + Date.now()] = { slot: mySlot, what: '把圣诞树装饰到了「' + STAGES[n] + '」', at: Date.now() };
        save(); return Promise.resolve();
      },
      takeoverSlot: function (slot) {
        mySlot = slot;
        if (!data.slots[slot]) data.slots[slot] = { device: deviceId(), joinedAt: Date.now(), outfit: 'winter' };
        data.presence[slot] = true;
        save();
        return Promise.resolve(true);
      },
      setOutfit: function (k) {
        data.slots[mySlot].outfit = k;
        data.log['l' + Date.now()] = { slot: mySlot, what: '换上了「' + OUTFITS[k] + '」', at: Date.now() };
        save(); return Promise.resolve();
      },
      setPos: function (x, y, dir, moving, indoor) {
        if (!data.slots[mySlot]) data.slots[mySlot] = {};
        data.slots[mySlot].pos = { x: Math.round(x), y: Math.round(y), dir: dir, moving: moving ? 1 : 0, indoor: indoor || 0, t: Date.now() };
        save(); return Promise.resolve();
      },
      setWave: function () {
        if (!data.slots[mySlot]) data.slots[mySlot] = {};
        data.slots[mySlot].wave = Date.now();
        save(); return Promise.resolve();
      },
      worldTransact: function (fn) {
        var cur = data.world || {};
        var next = fn(cur);
        if (next === undefined) return Promise.resolve({ committed: false, value: JSON.parse(JSON.stringify(cur)) });
        data.world = next;
        save();
        return Promise.resolve({ committed: true, value: JSON.parse(JSON.stringify(next)) });
      },
      mySlot: function () { return mySlot; },
      resetIdentity: function () { localStorage.removeItem('omo_device_id'); localStorage.removeItem('omo_demo_room_v1'); return Promise.resolve(); },
      onState: function (cb) { listeners.push(cb); },
      onConn: function (cb) { setTimeout(function () { cb(true); }, 300); },
      onFull: function (cb) { fullLs.push(cb); }
    };
  }

  // ============================================================
  // 视图
  // ============================================================

  var backend = null;
  var lastData = null;
  var pendingRoom = null; // 当前尝试进入的房间码（供"接管角色"使用）
  var preferSlot = 'a';   // 大厅里选的角色（不强占别人的位置，空位才坐）

  // ---------- 渲染：把房间状态喂给游戏层 ----------
  function render(d) {
    lastData = d;
    if (!d) return;
    if (window.Game && Game.active()) Game.onData(d);
  }

  function setConn(on) {
    var dot = $('#conn-dot'), txt = $('#conn-text'), banner = $('#offline-banner');
    dot.className = 'dot ' + (on ? 'on' : 'off');
    txt.textContent = on ? '已连接云端' : '连接中断';
    banner.classList.toggle('hidden', !!on);
    /* 把真实连接状态同步给游戏层：断网时管理员写入只是「排进待同步队列」，
       界面不能拿它当「已经写进云端」报成功。 */
    try { if (window.Game && window.Game.setOnline) window.Game.setOnline(on); } catch (e) { }
  }

  // ---------- 流程 ----------
  function showScreen(id) {
    ['screen-config', 'screen-lobby', 'screen-game', 'screen-full'].forEach(function (s) {
      $('#' + s).classList.toggle('hidden', s !== id);
    });
    document.body.classList.toggle('playing', id === 'screen-game');
  }

  function enterGame(code) {
    var roomLabel = backend.mode === 'demo' ? '演示模式' : ('房间 ' + code);
    $('#room-code').textContent = roomLabel;
    var hud = $('#hud-room');
    if (hud) hud.textContent = roomLabel;
    showScreen('screen-game');

    function copyInvite() {
      var target = inviteUrl(code);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(target).then(function () { toast('链接已复制，去发给对方吧 🎁'); },
          function () { window.prompt('长按复制这条邀请链接：', target); });
      } else window.prompt('长按复制这条邀请链接：', target);
    }
    function invite() {
      var url = backend.mode === 'demo' ? null : inviteUrl(code);
      var shareText = '🎄 来我们的小镇吧！房间码：' + code;
      if (navigator.share && url) {
        navigator.share({ title: "Omo's Christmas Village", text: shareText, url: url })
          .catch(function () { copyInvite(); });
      } else copyInvite();
    }

    Game.enter(code, backend, {
      invite: invite,
      onLeave: function () {
        try { history.replaceState(null, '', location.pathname); } catch (e) { }
        location.reload(); // 干净地回到大厅（清除所有监听与游戏状态）
      }
    });
    /* 房间状态有可能在 Game.enter 之前就推过来了（那时 active 还是 false，会被丢掉）。
       这里补喂一次，游戏层才能拿到存档里的位置——包括「上次停在哪张旅行地图」。
       以前只靠第一次写操作触发的推送来补，会导致刚进游戏时 S.data 是空的。 */
    if (lastData) { try { Game.onData(lastData); } catch (e) { } }
  }

  function afterJoined(code) {
    /* 记住这台设备上次进的是哪个房间：iPhone 加到主屏幕后是拿 manifest 的
       start_url 打开的（没有 ?room=），没有这一条就只能在大厅里干瞪眼。
       只存房间码，不存任何进度；进度永远只在 Firebase 里。 */
    try { localStorage.setItem('omo_last_room_v1', code); } catch (e) { }
    setRoomHash(code);
    enterGame(code);
  }

  function lastRoom() {
    try {
      var c = localStorage.getItem('omo_last_room_v1');
      return (/^[a-z0-9]{6,32}$/.test(c || '') && c !== 'demo') ? c : '';
    } catch (e) { return ''; }
  }

  function startBackend() {
    backend.onConn(setConn);
    backend.onState(render);
    backend.onFull(function () { showScreen('screen-full'); });

    if (backend.mode === 'demo') {
      setConn(true);
      toast('本地演示模式：仅预览界面，未连接云端');
      backend.joinRoom('demo', preferSlot).then(function (ok) {
        if (ok) enterGame('demo');
      });
      return;
    }

    var room = getRoomFromUrl();
    if (room) {
      pendingRoom = room;
      toast('正在加入房间 ' + room + ' …', 3000);
      var timeout = new Promise(function (_, rej) {
        setTimeout(function () { rej(new Error('加入超时（10 秒），请检查网络后刷新重试')); }, 10000);
      });
      Promise.race([backend.joinRoom(room, preferSlot), timeout]).then(function (ok) {
        if (ok) enterGame(room);
      }).catch(function (e) {
        lobbyError('进入房间失败：' + ((e && e.message) || e));
      });
    } else {
      showScreen('screen-lobby');
    }
  }

  function initFirebaseBackend() {
    backend = createFirebaseBackend(window.FIREBASE_CONFIG);
    startBackend();
  }

  function lobbyError(msg) {
    showScreen('screen-lobby'); // 保证错误信息在可见的界面上
    var el = $('#lobby-error');
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }

  // ---------- 启动 ----------
  function boot() {
    var snow = $('#snow');
    for (var i = 0; i < 14; i++) {
      var f = document.createElement('i');
      f.style.left = (Math.random() * 100) + 'vw';
      f.style.animationDuration = (5 + Math.random() * 7) + 's';
      f.style.animationDelay = (-Math.random() * 8) + 's';
      f.style.opacity = 0.3 + Math.random() * 0.6;
      snow.appendChild(f);
    }

    /* 大厅角色选择：只记录偏好；真正占位时只在「该位置是空的」情况下生效，
       不会把已经在玩的对方顶掉。 */
    var roleCards = document.querySelectorAll('.role-card');
    if (roleCards.length) {
      Array.prototype.forEach.call(roleCards, function (c) {
        c.addEventListener('click', function () {
          preferSlot = c.dataset.slot === 'b' ? 'b' : 'a';
          Array.prototype.forEach.call(roleCards, function (x) {
            var on = (x === c);
            x.classList.toggle('is-active', on);
            x.setAttribute('aria-checked', on ? 'true' : 'false');
          });
        });
      });
    }

    $('#btn-demo').addEventListener('click', function () {
      backend = createDemoBackend();
      startBackend();
    });
    $('#btn-create').addEventListener('click', function () {
      if (!backend) initFirebaseBackend();
      $('#lobby-error').classList.add('hidden');
      backend.createRoom(preferSlot).then(function (code) {
        pendingRoom = code;
        afterJoined(code);
      }).catch(function (e) { lobbyError('创建失败：' + e.message); });
    });
    function joinByCode(code) {
      code = String(code || '').trim().toLowerCase();
      if (!/^[a-z0-9]{6,32}$/.test(code)) {
        lobbyError('房间码格式不对，应为 6-32 位小写字母或数字');
        return;
      }
      if (!backend) initFirebaseBackend();
      $('#lobby-error').classList.add('hidden');
      pendingRoom = code;
      backend.joinRoom(code, preferSlot).then(function (ok) {
        if (ok) afterJoined(code);
      }).catch(function (e) { lobbyError('加入失败：' + ((e && e.message) || e)); });
    }

    $('#btn-join').addEventListener('click', function () {
      joinByCode($('#input-code').value);
    });

    /* 「回到上次的房间」：只在大厅里出现，点了才进，不会自己偷偷跳进去——
       否则想开个新房间的人会被一直弹回旧房间。 */
    var lr = /[?&]demo=1/.test(location.search) ? '' : lastRoom();
    var lrBtn = $('#btn-last-room'), lrCode = $('#last-room-code'), lrInput = $('#input-code');
    if (lr) {
      if (lrCode) lrCode.textContent = lr;
      if (lrBtn) lrBtn.classList.remove('hidden');
      if (lrInput && !lrInput.value) lrInput.value = lr;
    }
    if (lrBtn && lr) {
      lrBtn.addEventListener('click', function () {
        if (pendingRoom) { return; }        // 已经在连了，别叠第二次
        joinByCode(lr);
      });
    }

    // 房间满员时的接管入口（只属于拿链接的人）
    function takeover(slot) {
      if (!pendingRoom || !backend) return;
      backend.takeoverSlot(slot).then(function (ok) {
        if (ok) afterJoined(pendingRoom);
      }).catch(function (e) { toast('接管失败：' + ((e && e.message) || e)); });
    }
    $('#btn-take-a').addEventListener('click', function () { takeover('a'); });
    $('#btn-take-b').addEventListener('click', function () { takeover('b'); });
    $('#btn-back-lobby').addEventListener('click', function () {
      try { history.replaceState(null, '', location.pathname); } catch (e) { }
      showScreen('screen-lobby');
    });
    window.addEventListener('offline', function () { setConn(false); });
    window.addEventListener('online', function () { toast('网络已恢复，正在重新同步…'); });

    /* 本地预览入口：?demo=1 直接用本地演示后端进游戏（不连云端）。
       给开发/验收用，普通访问不受影响。 */
    if (/[?&]demo=1/.test(location.search)) {
      // ?slot=b 可让本地预览直接以 Julie 身份进入（验收用）
      var dq = new URLSearchParams(location.search).get('slot');
      if (dq === 'b' || dq === 'a') preferSlot = dq;
      if (dq === 'b') {
        try { localStorage.setItem('omo-dev-slot', 'b'); } catch (e) { }
      }
      backend = createDemoBackend();
      startBackend();
      return;
    }

    var configured = window.FIREBASE_CONFIG &&
      typeof window.FIREBASE_CONFIG.apiKey === 'string' &&
      window.FIREBASE_CONFIG.apiKey.indexOf('在此粘贴') === -1 &&
      window.FIREBASE_CONFIG.databaseURL &&
      window.FIREBASE_CONFIG.databaseURL.indexOf('你的项目') === -1;

    if (!configured) {
      showScreen('screen-config');
      return;
    }

    initFirebaseBackend();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else boot();

  // 任何未捕获的页面错误都以浮窗显示，方便非技术用户直接截图反馈
  window.addEventListener('error', function (ev) {
    toast('页面错误：' + ev.message, 5000);
  });
})();
