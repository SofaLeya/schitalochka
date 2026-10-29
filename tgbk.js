/* Автокопии в Телеграм — общий модуль для приложений на sofaleya.github.io
   (считалОчка, Уход, Упражнения). Подключение одно на все приложения этого сайта:
   ключ бота и чат хранятся только в этом браузере (localStorage), на сервер ничего не уходит,
   кроме самих копий — они отправляются напрямую в Телеграм, в чат пользователя с его же ботом.

   Подключение в приложении:
     TGBK.init({app:'schitalochka', title:'считалОчка', file:function(d){return 'schitalochka-'+d+'.json'}, data:function(){return JSON.stringify(S)}});
     контейнер: <div class="tgbk-box"></div>  (или строка TGBK.panel())
*/
(function(){
  var CFG='tgbk-cfg', API='https://api.telegram.org/bot';
  var apps={}, cur=null, busy=false, connecting=false;
  function get(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
  function put(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  function cfg(){return get(CFG,{})}
  function today(){var t=new Date();t=new Date(t.getTime()-5*3600*1000);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0')}
  function hash(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return h.toString(36)+':'+s.length}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function call(token,method,body){
    var o={method:'POST'};if(body)o.body=body;
    return fetch(API+token+'/'+method,o).then(function(r){return r.json()}).then(function(j){if(!j.ok)throw new Error(j.description||'ошибка Телеграма');return j.result})}
  function ruErr(e){var m=String(e&&e.message||e||'');
    if(/Unauthorized|Not Found/i.test(m))return 'Ключ не подошёл. Скопируй его из сообщения @BotFather целиком.';
    if(/chat not found|blocked/i.test(m))return 'Бот не может написать в чат. Открой бота в Телеграме и нажми «Старт».';
    if(/Failed to fetch|NetworkError|Load failed/i.test(m))return 'Нет связи с Телеграмом. Проверь интернет и попробуй ещё раз.';
    return m||'Не получилось'}

  var inflight=null;
  function sendFile(a,manual){ // одна отправка за раз: автокопия и ручная/при подключении не дублируют друг друга
    if(inflight)return inflight;
    return inflight=sendFile0(a,manual).then(function(r){inflight=null;return r},function(e){inflight=null;throw e})}
  function sendFile0(a,manual){
    var c=cfg();if(!c.token||!c.chat)return Promise.reject(new Error('not set'));
    var data=a.data();if(!data)return Promise.resolve(false);
    var d=today(),lk='tgbk-last:'+a.app,last=get(lk,{}),h=hash(data);
    if(!manual&&last.h===h){last.d=d;put(lk,last);return Promise.resolve(false)} // ничего не менялось — не спамим
    var fd=new FormData();fd.append('chat_id',c.chat);
    fd.append('document',new Blob([data],{type:'application/json'}),a.file(d));
    var dd=d.split('-');fd.append('caption',a.title+' · копия за '+dd[2]+'.'+dd[1]+'.'+dd[0]+'\nВосстановить: в приложении «Восстановить из файла» → этот файл.');
    fd.append('disable_notification','true');
    return call(c.token,'sendDocument',fd).then(function(){put(lk,{d:d,h:h,t:Date.now()});var c2=cfg();delete c2.err;put(CFG,c2);refresh();return true})
      .catch(function(e){var c2=cfg();c2.err=ruErr(e);put(CFG,c2);refresh();throw e})}

  function auto(){if(busy||inflight||connecting||!cur)return;var c=cfg();if(!c.token||!c.chat||c.off)return;
    if(get('tgbk-last:'+cur.app,{}).d===today())return;
    busy=true;sendFile(cur,false).then(function(){busy=false},function(){busy=false})}

  function connect(token){
    token=String(token||'').trim().replace(/^bot/,'');
    if(!/^\d+:[\w-]{20,}$/.test(token))return Promise.reject(new Error('Похоже, это не ключ. Он выглядит так: 1234567890:AAF…'));
    var me;
    return call(token,'getMe').then(function(r){me=r;return call(token,'getUpdates')}).then(function(ups){
      var chat=null;(ups||[]).forEach(function(u){var m=u.message||u.my_chat_member;if(m&&m.chat&&m.chat.type==='private')chat=m.chat.id});
      if(!chat)throw new Error('Бот пока не видит тебя. Открой @'+me.username+' в Телеграме, нажми «Старт» (или напиши «привет») и нажми «Подключить» ещё раз.');
      put(CFG,{token:token,chat:chat,bot:me.username});
      var fd=new FormData();fd.append('chat_id',chat);fd.append('text','✅ Готово! Сюда будут приходить копии приложений с sofaleya.github.io: раз в день, если данные поменялись.');
      return call(token,'sendMessage',fd)}).then(function(){refresh();if(cur)return sendFile(cur,true)})}

  function lastLine(){if(!cur)return '';var l=get('tgbk-last:'+cur.app,{});if(!l.t)return 'Из этого приложения копий ещё не было.';
    var t=new Date(l.t);return 'Последняя копия отсюда: '+t.toLocaleDateString('ru-RU',{day:'numeric',month:'long'})+', '+String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0')+'.'}

  var BTN='display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:12px;border:0;font:inherit;font-weight:700;cursor:pointer;';
  function prim(){return 'background:'+(cur&&cur.accent||'#6a45e8')+';color:'+(cur&&cur.accentText||'#fff')}
  function panel(){var c=cfg();
    var s='<div style="display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:1.4">';
    if(c.token&&c.chat){
      s+='<div><b>'+(c.off?'⏸ Выключено':'✅ Подключено')+'</b> · бот @'+esc(c.bot||'')+'</div>'+
        '<div style="opacity:.8">'+(c.off?'Копии не отправляются.':'Раз в день, когда открываешь приложение, копия уходит в чат с ботом (если данные поменялись).')+' '+esc(lastLine())+'</div>'+
        (c.err?'<div style="color:#e0556b">'+esc(c.err)+'</div>':'')+
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-tgbk="now" style="'+BTN+prim()+'">Отправить сейчас</button>'+
        '<button type="button" data-tgbk="toggle" style="'+BTN+'background:rgba(127,127,127,.18);color:inherit">'+(c.off?'Включить':'Выключить')+'</button>'+
        '<button type="button" data-tgbk="reset" style="'+BTN+'background:rgba(127,127,127,.18);color:inherit">Отключить бота</button></div>'+
        '<div style="opacity:.7;font-size:12.5px">Подключение общее для всех приложений на sofaleya.github.io. Ключ бота хранится только в этом браузере.</div>';
    }else{
      s+='<div style="opacity:.85">Приложение само будет присылать тебе файл-копию в Телеграм раз в день. Нужен свой бот — это бесплатно, минут 5, делается один раз для всех приложений на sofaleya.github.io.</div>'+
        '<ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:4px">'+
        '<li>В Телеграме открой <b>@BotFather</b> → нажми «Старт» → отправь <b>/newbot</b>.</li>'+
        '<li>Придумай имя (например, «Мои копии») и адрес, который заканчивается на <b>bot</b> (например, <i>sofia_kopii_bot</i>).</li>'+
        '<li>BotFather пришлёт ключ вида <i>1234567890:AAF…</i> — скопируй его целиком.</li>'+
        '<li>Открой своего бота по ссылке из того же сообщения и нажми <b>«Старт»</b>.</li>'+
        '<li>Вставь ключ сюда и нажми «Подключить».</li></ol>'+
        '<input id="tgbk-token" placeholder="Ключ от @BotFather" autocomplete="off" style="width:100%;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1.5px solid rgba(127,127,127,.35);background:transparent;color:inherit;font:inherit">'+
        '<div id="tgbk-msg" style="color:#e0556b" hidden></div>'+
        '<button type="button" data-tgbk="connect" style="'+BTN+prim()+'">Подключить</button>'+
        '<div style="opacity:.7;font-size:12.5px">Ключ хранится только в этом браузере. Копии видишь только ты: они приходят в твой чат с твоим ботом.</div>';
    }
    return s+'</div>'}
  function refresh(){var b=document.querySelectorAll('.tgbk-box');for(var i=0;i<b.length;i++)b[i].innerHTML=panel()}

  document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-tgbk]');if(!t)return;var a=t.getAttribute('data-tgbk');e.preventDefault();
    if(a==='connect'){var inp=document.getElementById('tgbk-token'),msg=document.getElementById('tgbk-msg');t.disabled=true;t.textContent='Подключаю…';connecting=true;
      connect(inp&&inp.value).then(function(){connecting=false;refresh()},function(err){connecting=false;t.disabled=false;t.textContent='Подключить';if(msg){msg.textContent=err&&err.message&&/[а-я]/i.test(err.message)?err.message:ruErr(err);msg.hidden=false}})}
    else if(a==='now'){if(!cur)return;t.disabled=true;t.textContent='Отправляю…';sendFile(cur,true).then(function(){t.textContent='Отправлено ✓';setTimeout(refresh,1500)},function(){refresh()})}
    else if(a==='toggle'){var c=cfg();c.off=!c.off;put(CFG,c);refresh();if(!c.off)auto()}
    else if(a==='reset'){if(window.confirm('Отключить бота во всех приложениях на этом сайте? Копии перестанут приходить.')){try{localStorage.removeItem(CFG)}catch(x){}refresh()}}
  });

  window.TGBK={
    init:function(a){apps[a.app]=a;cur=a;setTimeout(auto,4000);
      document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')setTimeout(auto,1500)});refresh()},
    panel:panel,refresh:refresh,sendNow:function(){return cur?sendFile(cur,true):Promise.reject()},cfg:cfg
  };
})();
