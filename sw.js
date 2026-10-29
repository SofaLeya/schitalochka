self.addEventListener('install',function(){self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim())});
// всегда спрашиваем у сервера свежую версию (не берём из 10-минутного кэша браузера); без интернета — из кэша
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  if(new URL(e.request.url).origin!==location.origin)return; // чужие сайты (Яндекс, Телеграм) — напрямую, без воркера
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(function(r){
    if(r&&r.ok&&new URL(e.request.url).origin===location.origin){var c=r.clone();caches.open('sch-v1').then(function(ch){ch.put(e.request,c)})}
    return r}).catch(function(){return caches.match(e.request)}))});
