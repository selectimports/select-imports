/* Select Imports - modo sem internet. Guarda o app no aparelho; os dados continuam no Supabase (nunca guardados aqui). */
const V = 'si-v9', CORE = ['./', 'index.html', 'config.js', 'supabase-shim.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/logotipo-escuro.png', 'icons/simbolo-escuro.png', 'icons/logo-recibo.png', 'vitrine/index.html'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.hostname.endsWith('.supabase.co')) return;
  if (u.origin === location.origin && u.pathname.indexOf('/icons/') !== -1) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; })));
    return;
  }
  if (u.origin === location.origin) {
    e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; })
      .catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : undefined))));
  } else {
    e.respondWith(caches.match(r).then(m => { const net = fetch(r).then(res => { if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; }).catch(() => m); return m || net; }));
  }
});
