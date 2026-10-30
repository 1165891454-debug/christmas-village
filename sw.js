/* sw.js — Omo's Christmas Village Service Worker
 * 策略：导航与配置走网络优先（保证更新可达），静态资源缓存优先。
 * 版本号变更（CACHE 名）即可强制刷新全部缓存。
 *
 * 2026-10-28 紧急修复（寄件台点了没反应 / 阿信托付的事交不了）：
 *   那一版只换了缓存名、?v= 没动；从 v4.6.0 起两处已经重新对齐。
 *
 * 2026-10-30 v4.6.1（HUD 按钮改「按下即动作」）：
 *   只改了 game.js / style.css。菜单、换装、抽奖券、任务角标、家当角标、互动按钮
 *   不再依赖浏览器合成的 click —— 手指带抖动、或一只手推摇杆另一只手点按钮时，
 *   click 根本不会产生，所以以前要点三四次。缓存名必须一起换，否则手机还是旧 game.js。
 *
 * 2026-10-29 v4.6.0（管理员一次性会话 + 时间状态查看器）：
 *   ?v= 与缓存名一起抬到 4.6.0。静态资源是「缓存优先」、键里带 ?v=，
 *   两处一起换最稳，老手机一定会重新取 game.js。
 *
 * 2026-10-29 v4.6.0 续（抽奖券 / 9 套服装 / 合影姿势 / 树阶纪念照 / 点击响应 / 白屏防护）：
 *   同一版本号内的功能补齐，缓存名不变（仍是 omo-v4.6.0）——这一版是首次上线，
 *   还没有手机缓存过它，所以不需要再换名。
 */
var CACHE = 'omo-v4.7.0';
var CORE = [
  './',
  './index.html',
  './style.css?v=4.7.0',
  './firebase-config.js?v=4.7.0',
  './memories.js?v=4.7.0',
  './chars.js?v=4.7.0',
  './sprites.js?v=4.7.0',
  './world.js?v=4.7.0',
  './maps.js?v=4.7.0',
  './specialties.js?v=4.7.0',
  './life.js?v=4.7.0',
  './game.js?v=4.7.0',
  './app.js?v=4.7.0',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/firebase-app-compat.js',
  './vendor/firebase-auth-compat.js',
  './vendor/firebase-database-compat.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // 导航 / 配置：网络优先，失败回退缓存（保证发新版能立刻生效）
  if (e.request.mode === 'navigate' || url.pathname.endsWith('firebase-config.js')) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () { return caches.match(e.request); })
    );
    return;
  }

  // 其他静态资源：缓存优先
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      });
    })
  );
});
