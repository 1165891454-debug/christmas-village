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
      if (on && mySlot && roomRef) {
        var p = roomRef.child('presence/' + mySlot);
        p.onDisconnect().remove();
        p.set(true);
      }
    });

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

    function claimSlot(code, depth) {
      depth = depth || 0;
      roomRef = db.ref('rooms/' + code);
      var uid = auth.currentUser.uid;
      // 先读当前占用情况，挑一个空槽位；再对该槽位本身做事务（规则只授权到槽位级别）
      return roomRef.child('slots').once('value').then(function (snap) {
        var cur = snap.val() || {};
        var target = null;
        if (cur.a && cur.a.uid === uid) target = 'a';
        else if (cur.b && cur.b.uid === uid) target = 'b';
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
            return true;
          }
          if (depth >= 3) { onFull && onFull(); return false; }
          return claimSlot(code, depth + 1); // 被抢 → 重新读取再试
        });
      });
    }

    return {
      mode: 'firebase',
      createRoom: function () {
        var code = randomCode(10);
        return ensureAuth().then(function () {
          // 房间通过写入 slots/a 创建（规则只允许在空槽位上这样写）
          return db.ref('rooms/' + code + '/slots/a').set({
            uid: auth.currentUser.uid,
            joinedAt: firebase.database.ServerValue.TIMESTAMP,
            outfit: 'winter'
          });
        }).then(function () {
          mySlot = 'a';
          roomRef = db.ref('rooms/' + code);
          bindRoomListeners();
          return code;
        });
      },
      joinRoom: function (code) {
        return ensureAuth().then(function () { return claimSlot(code); });
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
      createRoom: function () { data = freshRoom(); save(); return Promise.resolve('demo'); },
      joinRoom: function () {
        var dev = deviceId();
        if (data.slots.a && data.slots.a.device === dev) mySlot = 'a';
        else if (data.slots.b && data.slots.b.device === dev) mySlot = 'b';
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

  function avatarSVG(outfit, isMe) {
    var outfits = {
      winter: { hat: '#c0392b', body: '#3b6ea5', scarf: '#e8d9b5' },
      santa: { hat: '#d63b2f', body: '#c0392b', scarf: '#ffffff' },
      home: { hat: null, body: '#b784a9', scarf: null }
    };
    var o = outfits[outfit] || outfits.winter;
    var hair = isMe ? '#2b2119' : '#5a3b23'; // 深棕 / 栗色，便于区分两位角色
    var hat = o.hat
      ? '<path d="M18 18 Q32 2 46 18 L46 22 L18 22 Z" fill="' + o.hat + '"/><circle cx="32" cy="4" r="4" fill="#fff"/>'
      : '<path d="M20 20 Q32 6 44 20 L44 26 L20 26 Z" fill="' + hair + '"/>';
    return '<svg viewBox="0 0 64 84" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="20" y="40" width="24" height="30" rx="9" fill="' + o.body + '"/>' +
      (o.scarf ? '<rect x="21" y="38" width="22" height="6" rx="3" fill="' + o.scarf + '"/><rect x="36" y="42" width="6" height="14" rx="3" fill="' + o.scarf + '"/>' : '') +
      '<circle cx="32" cy="27" r="14" fill="#f2c9a5"/>' +
      hat +
      '<circle cx="27" cy="28" r="1.8" fill="#3a2c22"/><circle cx="37" cy="28" r="1.8" fill="#3a2c22"/>' +
      '<circle cx="24" cy="32" r="2.2" fill="#f0a8a0" opacity=".7"/><circle cx="40" cy="32" r="2.2" fill="#f0a8a0" opacity=".7"/>' +
      '<rect x="23" y="68" width="7" height="10" rx="3" fill="#2c2c34"/><rect x="34" y="68" width="7" height="10" rx="3" fill="#2c2c34"/>' +
      '</svg>';
  }

  function treeSVG() {
    return '<svg id="tree-svg" data-stage="0" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      '<radialGradient id="glowGrad"><stop offset="0%" stop-color="#ffd77a" stop-opacity=".55"/><stop offset="100%" stop-color="#ffd77a" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      '<g class="g-glow"><circle cx="100" cy="105" r="86" fill="url(#glowGrad)"/></g>' +
      '<circle cx="30" cy="30" r="3" fill="#fff" opacity=".5"/><circle cx="170" cy="55" r="2.4" fill="#fff" opacity=".45"/>' +
      '<circle cx="150" cy="18" r="2" fill="#fff" opacity=".5"/><circle cx="55" cy="70" r="2.2" fill="#fff" opacity=".4"/>' +
      '<polygon points="100,38 64,100 136,100" fill="#2f7a4d"/>' +
      '<polygon points="100,66 52,146 148,146" fill="#3c8f5c"/>' +
      '<rect x="90" y="146" width="20" height="22" rx="4" fill="#7a4a2b"/>' +
      '<g class="g-decor">' +
      '<circle cx="88" cy="88" r="5" fill="#e0563f"/><circle cx="112" cy="94" r="5" fill="#f0a83c"/>' +
      '<circle cx="76" cy="122" r="5" fill="#f0a83c"/><circle cx="100" cy="128" r="5" fill="#e0563f"/><circle cx="124" cy="120" r="5" fill="#4f86d6"/>' +
      '</g>' +
      '<g class="g-lights">' +
      '<circle cx="96" cy="74" r="3.4" fill="#ffe08a"/><circle cx="118" cy="108" r="3.4" fill="#8ad2ff"/>' +
      '<circle cx="84" cy="106" r="3.4" fill="#ff9d9d"/><circle cx="66" cy="136" r="3.4" fill="#ffe08a"/>' +
      '<circle cx="110" cy="136" r="3.4" fill="#b6ff9d"/><circle cx="134" cy="140" r="3.4" fill="#ffe08a"/>' +
      '</g>' +
      '<g class="g-star"><polygon points="100,18 104,30 117,30 107,38 111,50 100,43 89,50 93,38 83,30 96,30" fill="#ffd75e" stroke="#f0a83c" stroke-width="1.5"/></g>' +
      '<ellipse cx="100" cy="172" rx="70" ry="8" fill="#e8f0fa" opacity=".9"/>' +
      '</svg>';
  }

  // ---------- 渲染 ----------
  function render(d) {
    lastData = d;
    if (!d) return;

    // 圣诞树
    var stage = (d.tree && typeof d.tree.stage === 'number') ? d.tree.stage : 0;
    var svg = $('#tree-svg');
    if (svg) svg.setAttribute('data-stage', String(stage));
    $('#tree-stage-label').textContent = STAGES[stage];
    $('#btn-tree-next').disabled = stage >= 3;

    // 我的角色
    var mySlot = backend.mySlot();
    if (mySlot) {
      $('#my-slot-tag').textContent = SLOTS[mySlot];
      var me = d.slots && d.slots[mySlot];
      var myOutfit = (me && me.outfit) || 'winter';
      $('#my-avatar').innerHTML = avatarSVG(myOutfit, mySlot === 'a');
      document.querySelectorAll('.outfit-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.outfit === myOutfit);
      });
    }

    // 对方角色
    var other = mySlot === 'a' ? 'b' : 'a';
    var po = d.slots && d.slots[other];
    var pEl = $('#partner-outfit');
    if (po) {
      $('#partner-avatar').innerHTML = avatarSVG(po.outfit, other === 'a');
      pEl.textContent = '当前服装：' + (OUTFITS[po.outfit] || '冬日暖装');
    } else {
      $('#partner-avatar').innerHTML = '<div class="muted" style="padding:26px 0">﹖</div>';
      pEl.textContent = '等待对方加入…';
    }
    var online = !!(d.presence && d.presence[other]);
    var pres = $('#partner-presence');
    pres.querySelector('.dot').className = 'dot ' + (online ? 'on' : 'off');
    pres.querySelector('span').textContent = online ? '在线' : '离线';

    // 日志
    var logEl = $('#log-list');
    var entries = [];
    if (d.log) {
      Object.keys(d.log).forEach(function (k) { entries.push(d.log[k]); });
      entries.sort(function (x, y) { return (y.at || 0) - (x.at || 0); });
    }
    logEl.innerHTML = entries.slice(0, 6).map(function (e) {
      return '<li><b>' + (SLOTS[e.slot] || '?') + '</b> ' + e.what +
        ' <span style="opacity:.6">' + fmtTime(e.at || Date.now()) + '</span></li>';
    }).join('') || '<li>还没有操作记录，试着装饰圣诞树吧 🎄</li>';
  }

  function setConn(on) {
    var dot = $('#conn-dot'), txt = $('#conn-text'), banner = $('#offline-banner');
    dot.className = 'dot ' + (on ? 'on' : 'off');
    txt.textContent = on ? '已连接云端' : '连接中断';
    banner.classList.toggle('hidden', !!on);
  }

  // ---------- 流程 ----------
  function showScreen(id) {
    ['screen-config', 'screen-lobby', 'screen-game', 'screen-full'].forEach(function (s) {
      $('#' + s).classList.toggle('hidden', s !== id);
    });
  }

  function enterGame(code) {
    $('#room-code').textContent = backend.mode === 'demo' ? '演示模式' : ('房间 ' + code);
    showScreen('screen-game');

    if (!$('#tree-holder').hasChildNodes()) {
      $('#tree-holder').innerHTML = treeSVG();
      var picker = $('#outfit-picker');
      picker.innerHTML = '';
      Object.keys(OUTFITS).forEach(function (k) {
        var b = document.createElement('button');
        b.className = 'outfit-btn';
        b.dataset.outfit = k;
        b.textContent = OUTFITS[k];
        b.addEventListener('click', function () {
          backend.setOutfit(k).catch(function (e) { toast('保存失败：' + e.message); });
        });
        picker.appendChild(b);
      });
    }
    if (lastData) render(lastData); // 修正：先渲染过再插入 SVG 的情况

    var url = backend.mode === 'demo' ? null : inviteUrl(code);
    var shareText = '🎄 来我们的小镇吧！房间码：' + code;
    function copyInvite() {
      var target = url || location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(target).then(function () { toast('链接已复制，去发给对方吧 🎁'); },
          function () { window.prompt('长按复制这条邀请链接：', target); });
      } else window.prompt('长按复制这条邀请链接：', target);
    }
    $('#btn-invite').onclick = function () {
      if (navigator.share && url) {
        navigator.share({ title: "Omo's Christmas Village", text: shareText, url: url })
          .catch(function () { copyInvite(); });
      } else copyInvite();
    };
  }

  function afterJoined(code) {
    setRoomHash(code);
    enterGame(code);
  }

  function startBackend() {
    backend.onConn(setConn);
    backend.onState(render);
    backend.onFull(function () { showScreen('screen-full'); });

    if (backend.mode === 'demo') {
      setConn(true);
      toast('本地演示模式：仅预览界面，未连接云端');
      backend.joinRoom('demo').then(function (ok) {
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
      Promise.race([backend.joinRoom(room), timeout]).then(function (ok) {
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

    $('#btn-demo').addEventListener('click', function () {
      backend = createDemoBackend();
      startBackend();
    });
    $('#btn-create').addEventListener('click', function () {
      if (!backend) initFirebaseBackend();
      $('#lobby-error').classList.add('hidden');
      backend.createRoom().then(function (code) {
        pendingRoom = code;
        afterJoined(code);
      }).catch(function (e) { lobbyError('创建失败：' + e.message); });
    });
    $('#btn-join').addEventListener('click', function () {
      var code = ($('#input-code').value || '').trim().toLowerCase();
      if (!/^[a-z0-9]{6,32}$/.test(code)) {
        lobbyError('房间码格式不对，应为 6-32 位小写字母或数字');
        return;
      }
      if (!backend) initFirebaseBackend();
      $('#lobby-error').classList.add('hidden');
      pendingRoom = code;
      backend.joinRoom(code).then(function (ok) {
        if (ok) afterJoined(code);
      }).catch(function (e) { lobbyError('加入失败：' + e.message); });
    });
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
    $('#btn-tree-next').addEventListener('click', function () {
      var stage = parseInt($('#tree-svg').getAttribute('data-stage'), 10) || 0;
      if (stage < 3) backend.setTreeStage(stage + 1).catch(function (e) { toast('保存失败：' + e.message); });
    });
    $('#btn-tree-reset').addEventListener('click', function () { backend.setTreeStage(0); });
    $('#btn-identity-reset').addEventListener('click', function () {
      if (!backend) { localStorage.removeItem('omo_device_id'); localStorage.removeItem('omo_demo_room_v1'); }
      else {
        backend.resetIdentity().catch(function () { });
        localStorage.removeItem('omo_demo_room_v1');
      }
      toast('已重置本机身份，即将重新进入');
      setTimeout(function () { location.reload(); }, 800);
    });
    window.addEventListener('offline', function () { setConn(false); });
    window.addEventListener('online', function () { toast('网络已恢复，正在重新同步…'); });

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
