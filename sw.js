const CACHE = 'todolist-v11';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    } catch (_) {
      // 导航请求(打开主页/装好的 PWA 启动)兜底:网络失败时返回缓存的入口页,避免白屏
      if (req.mode === 'navigate' || req.destination === 'document') {
        const fallback = await caches.match('./index.html') || await caches.match('./');
        if (fallback) return fallback;
      }
      // 非导航请求失败时返回明确错误,而不是 null/undefined(后者会让浏览器显示"无法访问此页面")
      return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
  })());
});
