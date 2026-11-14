self.addEventListener('install',function(){self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim())});
// Сначала спрашиваем у сервера свежую версию (не из 10-минутного кэша браузера).
// Если сеть молчит дольше 2,5 с (метро, слабый интернет) - сразу отдаём сохранённую версию,
// а свежая докачивается в фоне и откроется в следующий раз. Без интернета - из кэша.
var WAIT=2500;
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  if(new URL(e.request.url).origin!==location.origin)return; // чужие сайты (Яндекс, Телеграм) - напрямую, без воркера
  var net=fetch(e.request,{cache:'no-cache'}).then(function(r){
    if(r&&r.ok){var c=r.clone();caches.open('sch-v1').then(function(ch){ch.put(e.request,c)})}
    return r});
  e.waitUntil(net.catch(function(){}));
  e.respondWith(new Promise(function(done){
    var sent=false;function give(r){if(!sent&&r){sent=true;done(r)}}
    var t=setTimeout(function(){caches.match(e.request).then(give)},WAIT);
    net.then(function(r){clearTimeout(t);give(r)}).catch(function(){clearTimeout(t);caches.match(e.request).then(function(c){give(c||Response.error())})});
  }));
});
