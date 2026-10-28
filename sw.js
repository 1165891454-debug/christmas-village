/* sw.js — Omo's Christmas Village Service Worker
 * 策略：导航与配置走网络优先（保证更新可达），静态资源缓存优先。
 * 版本号变更（CACHE 名）即可强制刷新全部缓存。
 *
 * 2026-10-28 紧急修复（寄件台点了没反应 / 阿信托付的事交不了）：
 *   版本号仍然是 v4.5.0（index.html 里的 ?v=4.5.0 未动），但缓存名必须换一个，
 *   否则已经打开过 v4.5.0 的手机还会用旧缓存的 game.js，修复等于没上传。
 */
var CACHE = 'omo-v4.5.0b';
var CORE = [
  './',
  './index.html',
  './style.css?v=4.5.0',
  './firebase-config.js?v=4.5.0',
  './memories.js?v=4.5.0',
  './chars.js?v=4.5.0',
  './sprites.js?v=4.5.0',
  './world.js?v=4.5.0',
  './maps.js?v=4.5.0',
  './specialties.js?v=4.5.0',
  './game.js?v=4.5.0',
  './app.js?v=4.5.0',
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
