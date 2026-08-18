// Ponto — service worker
// Padrão: network-first pro HTML (nunca trava numa versão velha da tela),
// cache-first pros arquivos versionados (app.vN.js, ícones, manifest).
const CACHE_NAME = 'ponto-cache-v18';
const ASSETS = [
  './index.html',
  './app.v18.js',
  './firebase-config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // navegação (abrir o app / recarregar a página) -> tenta a rede primeiro
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // firebase-config.js muda direto (sem trocar de versão) quando o dono cola as credenciais —
  // sempre busca da rede primeiro pra valer na hora
  if (req.url.endsWith('firebase-config.js')) {
    event.respondWith(
      fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // demais arquivos (JS versionado, ícones, manifest) -> cache primeiro
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const resClone = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
      return res;
    }))
  );
});
