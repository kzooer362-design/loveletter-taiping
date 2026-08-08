/* ===== 情书：掌上明珠 Service Worker =====
   离线缓存策略：
   1. install 时预缓存核心 HTML + UI 图片（首屏必需）
   2. 音频/卡牌图等采用「缓存优先，回退网络」运行时缓存
   3. 版本号变更时清理旧缓存
   注意：CDN 资源（peerjs/qrcode）不走缓存，直接回退网络
*/
const CACHE_VERSION = 'll-v1.0.0-20260808';
const CACHE_CORE = 'll-core-' + CACHE_VERSION;
const CACHE_RUNTIME = 'll-runtime-' + CACHE_VERSION;

/* install 时预缓存：核心 HTML + UI 图标 */
const CORE_ASSETS = [
  './',
  './index.html',
  './index-internet.html',
  './index-lan.html',
  'assets/ui/icon.png',
  'assets/ui/cover.png',
  'assets/ui/token.png',
  'assets/ui/icon1.png','assets/ui/icon2.png','assets/ui/icon3.png','assets/ui/icon4.png','assets/ui/icon5.png',
  'picture/back.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_CORE).then(cache => {
      // 用 addAll 的宽松版：逐个 add，单文件失败不阻断
      return Promise.all(CORE_ASSETS.map(url =>
        cache.add(url).catch(err => console.warn('[SW] 预缓存失败', url, err))
      ));
    }).then(() => self.skipWaiting())
  );
});

/* activate 时清理旧版本缓存 */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => {
        if(key !== CACHE_CORE && key !== CACHE_RUNTIME){
          console.log('[SW] 清理旧缓存', key);
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

/* fetch 策略：
   - HTML 文件：网络优先（保证拿到最新版），失败回退缓存
   - 同源图片/音频：缓存优先，缺失则网络获取并缓存
   - CDN/外部资源：直接网络，不缓存
*/
self.addEventListener('fetch', event => {
  const req = event.request;
  // 只处理 GET
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  // 外部 CDN 资源（peerjs/qrcode 等）：直接走网络，不拦截
  if(url.origin !== self.location.origin){
    return;
  }

  // HTML 文件：网络优先
  if(req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')){
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_CORE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 同源静态资源（图片/音频/字体）：缓存优先
  event.respondWith(
    caches.match(req).then(cached => {
      if(cached) return cached;
      return fetch(req).then(res => {
        // 只缓存成功的响应
        if(!res || res.status !== 200 || res.type === 'opaque') return res;
        const copy = res.clone();
        caches.open(CACHE_RUNTIME).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
    })
  );
});
