/* Service worker di inBOX: apre l'app anche senza rete.
   Cambia VERSION quando pubblichi una nuova versione dei file. */
var VERSION = 'u27';
var SHELL = 'ibu-shell-' + VERSION;
var RUNTIME = 'ibu-runtime-v2';
var FILES = ['./', 'index.html', 'config.js', 'vendor/supabase.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return (k.indexOf('ibu-shell-') === 0 && k !== SHELL) || (k.indexOf('ibu-runtime-') === 0 && k !== RUNTIME); }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function swr(req, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  // immagine condivisa dal menu «Condividi» del telefono: la teniamo da parte e riapriamo l'app
  if (req.method === 'POST' && url.origin === self.location.origin && /share-target$/.test(url.pathname)) {
    e.respondWith((async function () {
      try {
        var fd = await req.formData();
        var f = fd.get('image');
        if (f && f.size) {
          var cache = await caches.open('ibu-share');
          await cache.put('shared-image', new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg' } }));
        }
      } catch (err) { /* l'app mostrerà che non è arrivato nulla */ }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  // pagina di prova della ricerca online: va sempre in rete
  if (/cerca-test\.html$/.test(url.pathname)) return;
  if (url.origin === self.location.origin) {
    e.respondWith(req.mode === 'navigate'
      ? caches.open(SHELL).then(function (c) { return c.match('index.html'); }).then(function (hit) {
          fetch(req).then(function (res) { if (res && res.ok) caches.open(SHELL).then(function (c) { c.put('index.html', res); }); }).catch(function () {});
          return hit || fetch(req);
        })
      : swr(req, SHELL));
    return;
  }
  // copertine su Supabase e caratteri Google: dalla cache, aggiornate in sottofondo
  // le copertine non cambiano mai (ogni caricamento ha un nome nuovo): una volta in cache si servono subito, senza riscaricarle
  if (url.pathname.indexOf('/storage/v1/object/public/covers-usa/') >= 0) {
    e.respondWith(caches.open(RUNTIME).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit && hit.type !== 'opaque') return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok && res.type !== 'opaque') cache.put(req, res.clone()).catch(function () {});
          return res;
        }).catch(function () { return hit || Response.error(); });
      });
    }));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(swr(req, RUNTIME));
  }
});
