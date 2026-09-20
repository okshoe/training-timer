// 公開する内容を変更したら、このバージョンも変更します。
const CACHE_PREFIX = "motion-loop-" + self.registration.scope;
const CACHE_NAME = CACHE_PREFIX + "v6";
const exercises = ["squat", "wall-pushup", "back-lunge", "side-lunge",
  "bird-dog", "hip-bridge", "dead-bug", "side-plank"];
const files = ["./", "index.html", "style.css", "script.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "icons/favicon-32.png", "icons/favicon-16.png", "icons/apple-touch-icon.png",
  ...exercises.flatMap(id => ["assets/" + id + ".svg", "assets/" + id + "_f.svg"])];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    cache.addAll(files.map(file => new Request(new URL(file, self.registration.scope), { cache: "reload" })))));
  // skipWaitingしないことで、使用中のトレーニングを更新で中断しません。
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
    .map(key => caches.delete(key)))));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const home = new URL("./", self.registration.scope);
    const isHome = event.request.mode === "navigate"
      && (url.pathname === home.pathname || url.pathname === home.pathname + "index.html");
    return await cache.match(isHome ? home.href : event.request) || fetch(event.request);
  })());
});
