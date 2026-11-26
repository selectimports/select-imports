/* Login (e-mail/senha + verificacao em duas etapas) e banco Supabase para o app Select Imports.
   Imita as funcoes do Claude que o app usa (db, downloads, assets) sem mudar as regras do app.
   Etapa 2: gravacao segura entre aparelhos (versao + fusao), fila offline, backups, 2FA e saida por inatividade. */
(function () {
  'use strict';
  var C = { url: window.SUPABASE_URL || '', key: window.SUPABASE_ANON_KEY || '' };
  var remember = true, sb = null, ready = null, LP = 'selectimports:db:';
  var rev = null, baseJ = null, chain = Promise.resolve(), retryT = null, lastAct = Date.now();
  var hide = document.createElement('style');
  hide.id = 'sb-hide'; hide.textContent = 'body>#app{visibility:hidden}';
  document.head.appendChild(hide);

  function store() {
    return {
      getItem: function (k) { return localStorage.getItem(k) || sessionStorage.getItem(k); },
      setItem: function (k, v) { (remember ? localStorage : sessionStorage).setItem(k, v); },
      removeItem: function (k) { localStorage.removeItem(k); sessionStorage.removeItem(k); }
    };
  }
  function cfgOk() { return C.url && C.key && C.url.indexOf('COLE-') < 0 && C.key.indexOf('COLE-') < 0; }
  function el(id) { return document.getElementById(id); }

  /* ---------- fusao de duas versoes (evita um aparelho apagar o que o outro lancou) ---------- */
  function idOf(x) { return x && typeof x === 'object' && x.id != null ? String(x.id) : null; }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function mergeArr(b, l, r) {
    var all = [].concat(b, l, r);
    if (all.some(function (x) { return idOf(x) == null; })) return same(l, b) ? r : l;
    var bm = {}, lm = {}, res = r.slice();
    b.forEach(function (x) { bm[idOf(x)] = x; });
    l.forEach(function (x) { lm[idOf(x)] = x; });
    function idx(id) { for (var i = 0; i < res.length; i++) if (idOf(res[i]) === id) return i; return -1; }
    l.forEach(function (x) {
      var id = idOf(x), i = idx(id);
      if (!(id in bm)) { if (i < 0) res.push(x); }
      else if (!same(x, bm[id])) { if (i < 0) res.push(x); else res[i] = x; }
    });
    b.forEach(function (x) { var id = idOf(x); if (!(id in lm)) { var i = idx(id); if (i >= 0) res.splice(i, 1); } });
    return res;
  }
  function mergeObj(b, l, r) {
    var o = {}, k;
    for (k in r) o[k] = r[k];
    var keys = {}; for (k in b) keys[k] = 1; for (k in l) keys[k] = 1;
    Object.keys(keys).forEach(function (k) {
      if (!same(l[k], b[k])) { if (l[k] === undefined) delete o[k]; else o[k] = l[k]; }
    });
    return o;
  }
  function merge3(base, local, remote) {
    base = base || {}; var out = {}, k;
    for (k in remote) out[k] = remote[k];
    var keys = {}; for (k in base) keys[k] = 1; for (k in local) keys[k] = 1; for (k in remote) keys[k] = 1;
    Object.keys(keys).forEach(function (k) {
      var b = base[k], l = local[k], r = remote[k];
      if (Array.isArray(b) || Array.isArray(l) || Array.isArray(r)) out[k] = mergeArr(b || [], l || [], r || []);
      else if (l && typeof l === 'object') out[k] = mergeObj(b && typeof b === 'object' ? b : {}, l, r && typeof r === 'object' ? r : {});
      else if (!same(l, b)) { if (l === undefined) delete out[k]; else out[k] = l; }
    });
    return out;
  }
  window.__merge3 = merge3;

  /* ---------- aviso de conexao ---------- */
  function chip(msg) {
    var c = el('sb-chip');
    if (!msg) { if (c) c.style.display = 'none'; return; }
    if (!c) {
      c = document.createElement('div'); c.id = 'sb-chip';
      c.style.cssText = 'position:fixed;left:12px;bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:9999;background:#7c2d12;color:#fff;border-radius:8px;padding:8px 12px;font:500 12.5px "IBM Plex Sans",system-ui,sans-serif;max-width:80vw;box-shadow:0 8px 24px #0005';
      document.body.appendChild(c);
    }
    c.textContent = msg; c.style.display = 'block';
  }
  function scheduleRetry() {
    if (retryT) return;
    retryT = setTimeout(function () { retryT = null; if (window.__resync) window.__resync(); }, 20000);
  }
  window.addEventListener('online', function () { if (window.__resync) window.__resync(); });

  /* ---------- tela de login com verificacao em duas etapas ---------- */
  function mfaFactor() {
    return sb.auth.mfa.listFactors().then(function (f) { return ((f.data && f.data.totp) || []).filter(function (x) { return x.status === 'verified'; })[0]; });
  }
  function needMfa() {
    return sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (a) {
      return !!(a.data && a.data.nextLevel === 'aal2' && a.data.currentLevel !== 'aal2');
    }).catch(function () { return false; });
  }
  /* ---------- aparencia da tela de login (vidro fosco, monograma luminoso) ---------- */
  var SBCSS = `
#sb-login{--ease:cubic-bezier(.2,.8,.2,1);position:fixed;top:0;left:0;right:0;height:100%;z-index:99999;display:flex;flex-direction:column;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;isolation:isolate;
  font:16px/1.4 'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:#F4ECF6;-webkit-font-smoothing:antialiased;
  background:radial-gradient(85% 46% at 50% 0%,rgba(129,86,161,.62),transparent 72%),radial-gradient(70% 38% at 105% 62%,rgba(72,51,108,.55),transparent 70%),radial-gradient(60% 30% at -10% 85%,rgba(129,86,161,.22),transparent 70%),linear-gradient(180deg,#2B1F44 0%,#170F26 52%,#0E0916 100%)}
#sb-login *{box-sizing:border-box;margin:0}
#sb-login button,#sb-login input{font-family:inherit}
#sb-login::after{content:"";position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.07;mix-blend-mode:overlay;background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
#sb-login .sbl-marca{position:relative;z-index:2;flex:1 0 auto;min-height:250px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:calc(env(safe-area-inset-top,0px) + 28px) 28px 24px}
#sb-login .sbl-mono{position:absolute;left:50%;top:50%;width:170%;aspect-ratio:1200/739;transform:translate(-50%,-50%);z-index:-1;pointer-events:none;-webkit-mask-image:radial-gradient(closest-side,#000 62%,transparent 100%);mask-image:radial-gradient(closest-side,#000 62%,transparent 100%);animation:sblAcende 1.8s var(--ease) both}
#sb-login .sbl-mono i{position:absolute;inset:0;-webkit-mask:url(icons/monograma-claro.png) center/contain no-repeat;mask:url(icons/monograma-claro.png) center/contain no-repeat}
#sb-login .sbl-mono .b{background:#C9A8D6;opacity:.28;filter:blur(18px)}
#sb-login .sbl-mono .l{background:linear-gradient(105deg,transparent 38%,rgba(255,255,255,.55) 50%,transparent 62%) 140% 0/300% 100% no-repeat,linear-gradient(120deg,rgba(227,208,229,.10) 0%,rgba(227,208,229,.26) 42%,rgba(129,86,161,.18) 100%);animation:sblVarre 9s ease-in-out 1.6s infinite}
#sb-login .sbl-halo{position:absolute;left:50%;top:50%;width:330px;height:260px;transform:translate(-50%,-50%);z-index:-1;pointer-events:none;background:radial-gradient(closest-side,rgba(19,12,32,.62),transparent)}
#sb-login .sbl-sim{width:78px;margin-bottom:20px;filter:drop-shadow(0 8px 28px rgba(201,168,214,.5));animation:sblSurge .9s var(--ease) .1s both}
#sb-login .sbl-logo{width:min(240px,68%);filter:drop-shadow(0 6px 24px rgba(129,86,161,.45));animation:sblSurge .9s var(--ease) .22s both}
#sb-login .sbl-lema{display:none}
#sb-login .sbl-lado{position:relative;z-index:2;flex:none}
#sb-login .sbl-lado::before{content:"";position:absolute;left:50%;top:50%;width:min(520px,100%);height:420px;transform:translate(-50%,-50%);z-index:-1;pointer-events:none;background:radial-gradient(closest-side,rgba(129,86,161,.4),transparent)}
#sb-login .sbl-card{position:relative;margin:0 14px calc(env(safe-area-inset-bottom,0px) + 14px);padding:26px 22px 18px;border-radius:30px;background:linear-gradient(180deg,rgba(255,255,255,.115),rgba(255,255,255,.04));border:1px solid rgba(227,208,229,.17);-webkit-backdrop-filter:blur(30px) saturate(150%);backdrop-filter:blur(30px) saturate(150%);box-shadow:0 34px 90px rgba(6,3,12,.62),inset 0 1px 0 rgba(255,255,255,.16);animation:sblSobe .85s var(--ease) .3s both}
#sb-login .sbl-card::before{content:"";position:absolute;left:12%;right:12%;top:-1px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent)}
#sb-login .sbl-card.erra{animation:sblTrema .42s}
#sb-login h1{font:700 25px/1.15 'Plus Jakarta Sans','IBM Plex Sans',system-ui,sans-serif;letter-spacing:-.022em;color:#F4ECF6}
#sb-login .sbl-sub{font-size:14.5px;color:#C9B8D3;margin:6px 0 22px}
#sb-login .sbl-cp{position:relative;margin-bottom:12px}
#sb-login .sbl-cp input{width:100%;height:58px;padding:22px 16px 6px 49px;border:1px solid rgba(227,208,229,.18);border-radius:16px;background:rgba(14,9,22,.46);color:#F4ECF6;font-size:16px;outline:none;box-shadow:inset 0 1px 3px rgba(0,0,0,.28);transition:border-color .16s,box-shadow .16s,background .16s}
#sb-login .sbl-cp label{position:absolute;left:49px;top:19px;font-size:16px;color:#A692B5;pointer-events:none;transform-origin:left top;transition:transform .18s var(--ease),color .18s}
#sb-login .sbl-cp .ic{position:absolute;left:17px;top:18px;width:22px;height:22px;color:#A692B5;transition:color .16s;pointer-events:none}
#sb-login .sbl-cp input:focus+label,#sb-login .sbl-cp input:not(:placeholder-shown)+label,#sb-login .sbl-cp input:-webkit-autofill+label{transform:translateY(-11px) scale(.75)}
#sb-login .sbl-cp input:focus{border-color:#C9A8D6;background:rgba(14,9,22,.62);box-shadow:0 0 0 4px rgba(201,168,214,.17),inset 0 1px 3px rgba(0,0,0,.28)}
#sb-login .sbl-cp:focus-within .ic,#sb-login .sbl-cp:focus-within label{color:#E3D0E5}
#sb-login .sbl-cp.sn input{padding-right:104px}
#sb-login .sbl-cp.err input{border-color:#F2808C}
#sb-login .sbl-cp input:-webkit-autofill,#sb-login .sbl-cp input:-webkit-autofill:focus{-webkit-text-fill-color:#F4ECF6;caret-color:#F4ECF6;-webkit-box-shadow:0 0 0 60px #1B1329 inset;box-shadow:0 0 0 60px #1B1329 inset;transition:background-color 99999s}
#sb-login .sbl-ver{position:absolute;right:9px;top:9px;height:40px;padding:0 14px;border:1px solid rgba(227,208,229,.14);border-radius:11px;background:rgba(227,208,229,.10);color:#E3D0E5;font-weight:600;font-size:13.5px;cursor:pointer}
#sb-login .sbl-opc{position:relative;display:flex;align-items:center;gap:12px;margin:18px 2px 20px;font-size:14.5px;color:#C9B8D3;cursor:pointer;width:fit-content}
#sb-login .sbl-opc input{position:absolute;opacity:0;width:1px;height:1px}
#sb-login .sw{position:relative;width:46px;height:28px;border-radius:14px;flex:none;background:rgba(227,208,229,.16);transition:background .2s,box-shadow .2s}
#sb-login .sw::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.3);transition:transform .2s var(--ease)}
#sb-login .sbl-opc input:checked+.sw{background:linear-gradient(135deg,#8156A1,#C9A8D6);box-shadow:0 0 18px rgba(201,168,214,.35)}
#sb-login .sbl-opc input:checked+.sw::after{transform:translateX(18px)}
#sb-login .sbl-opc input:focus-visible+.sw{outline:2px solid #C9A8D6;outline-offset:3px}
#sb-login .sbl-go{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;width:100%;height:56px;border:0;border-radius:16px;color:#2A1E42;font-size:16.5px;font-weight:600;letter-spacing:.01em;cursor:pointer;background:linear-gradient(180deg,#F4E8F6,#D2B3DD);box-shadow:0 14px 34px rgba(201,168,214,.30),inset 0 1px 0 #fff,inset 0 -2px 0 rgba(72,51,108,.12);transition:transform .14s,box-shadow .14s,opacity .14s}
#sb-login .sbl-go::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.7),transparent);transform:skewX(-18deg);transition:left .7s var(--ease)}
#sb-login .sbl-go:hover::after{left:130%}
#sb-login .sbl-go:active{transform:scale(.985)}
#sb-login .sbl-go:disabled{opacity:.8;cursor:default}
#sb-login .sbl-go.carr::before{content:"";width:18px;height:18px;margin-right:10px;border:2px solid rgba(42,30,66,.25);border-top-color:#2A1E42;border-radius:50%;animation:sblGira .7s linear infinite}
#sb-login .sbl-erro{min-height:20px;margin-top:12px;font-size:14px;color:#F2808C;text-align:center}
#sb-login .sbl-seg{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:2px;font-size:12.5px;color:#A692B5}
#sb-login .sbl-seg svg{width:14px;height:14px}
#sb-login .sbl-link{display:block;margin:6px auto 0;padding:8px 14px;border:0;background:none;color:#C9B8D3;font-size:14.5px;cursor:pointer}
#sb-login .sbl-aviso{font-size:14.5px;color:#F2808C;margin-top:8px}
#sb-login .sbl-otp{position:relative;display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:4px 0 18px}
#sb-login .sbl-otp input{position:absolute;inset:0;z-index:2;width:100%;height:100%;opacity:0;border:0;font-size:16px;color:transparent;caret-color:transparent}
#sb-login .sbl-otp span{display:flex;align-items:center;justify-content:center;height:58px;border:1px solid rgba(227,208,229,.18);border-radius:14px;background:rgba(14,9,22,.46);box-shadow:inset 0 1px 3px rgba(0,0,0,.28);font:600 24px 'IBM Plex Sans',system-ui,sans-serif;color:#F4ECF6;transition:border-color .16s,box-shadow .16s}
#sb-login .sbl-otp span.on{border-color:#C9A8D6;box-shadow:0 0 0 4px rgba(201,168,214,.17),inset 0 1px 3px rgba(0,0,0,.28)}
@media(max-height:760px){#sb-login .sbl-seg{display:none}}
#sb-login.tec .sbl-marca{min-height:0;flex:0 0 auto;padding:calc(env(safe-area-inset-top,0px) + 14px) 28px 12px}
#sb-login.tec .sbl-sim,#sb-login.tec .sbl-lema,#sb-login.tec .sbl-seg{display:none}
#sb-login.tec .sbl-logo{width:150px}
#sb-login.tec .sbl-halo{width:220px;height:110px}
#sb-login.tec .sbl-card{padding-top:20px}
#sb-login.tec .sbl-sub{margin-bottom:16px}
@keyframes sblSobe{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}
@keyframes sblSurge{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
@keyframes sblAcende{from{opacity:0;transform:translate(-50%,-50%) scale(.94)}to{opacity:1;transform:translate(-50%,-50%)}}
@keyframes sblVarre{0%,12%{background-position:140% 0,0 0}60%,100%{background-position:-40% 0,0 0}}
@keyframes sblTrema{0%,100%{transform:none}20%{transform:translateX(-8px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}
@keyframes sblGira{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){#sb-login *{animation:none!important;transition:none!important}}
@media(min-width:880px){
  #sb-login{flex-direction:row}
  #sb-login .sbl-marca{flex:1 1 58%;min-height:0;padding:48px}
  #sb-login .sbl-mono{width:158%}
  #sb-login .sbl-halo{width:440px;height:330px}
  #sb-login .sbl-sim{width:104px;margin-bottom:26px}
  #sb-login .sbl-logo{width:320px}
  #sb-login .sbl-lema{display:block;position:absolute;left:56px;bottom:48px;max-width:420px;font-size:15px;line-height:1.55;color:#A692B5}
  #sb-login .sbl-lado{flex:0 0 min(580px,44vw);display:flex;align-items:center;justify-content:center;padding:32px 48px}
  #sb-login .sbl-card{width:100%;max-width:440px;margin:0;padding:36px 34px 24px;border-radius:32px}
  #sb-login h1{font-size:29px}
}

/* entrada do app: o cartao do login sai, a marca fica e o app aparece por baixo */
#sb-login.sai{pointer-events:none}
#sb-login.sai .sbl-lado{opacity:0;transform:translateY(18px);transition:opacity .32s ease,transform .45s var(--ease),flex-basis .55s var(--ease),padding .55s var(--ease)}
#sb-login.sai .sbl-lema{opacity:0;transition:opacity .25s}
#sb-login.sai .sbl-mono .b{display:none}
#sb-login.sai .sbl-mono .l{animation:none;opacity:.75}
#sb-login.out{opacity:0;transition:opacity .5s ease}
@media(min-width:880px){#sb-login.sai .sbl-lado{flex-basis:0;padding-left:0;padding-right:0;overflow:hidden}}
#sb-login.cl{color:#48336C;background:radial-gradient(80% 42% at 50% 0%,rgba(129,86,161,.14),transparent 72%),linear-gradient(180deg,#F8F3F9,#EEE2F0)}
#sb-login.cl::after,#sb-login.cl .sbl-halo{display:none}
#sb-login.cl .sbl-mono .b{display:none}
#sb-login.cl .sbl-mono .l{animation:none;background:linear-gradient(120deg,rgba(72,51,108,.10),rgba(129,86,161,.18))}
#sb-login.cl .sbl-sim,#sb-login.cl .sbl-logo{filter:none}
/* aparelhos mais fracos ou sem suporte: sem desfoque pesado */
#sb-login.leve .sbl-card{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(30,21,48,.94)}
#sb-login.leve .sbl-mono .b,#sb-login.leve::after{display:none}
#sb-login.leve .sbl-mono .l{animation:none}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){#sb-login .sbl-card{background:rgba(30,21,48,.94)}}
`;
  var IC_MAIL = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 8 8 6 8-6"/></svg>';
  var IC_LOCK = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  function sbStyle() {
    if (el('sb-css')) return;
    var s = document.createElement('style'); s.id = 'sb-css'; s.textContent = SBCSS;
    document.head.appendChild(s);
  }
  function lowEnd() {
    try {
      return (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-transparency: reduce)').matches);
    } catch (e) { return false; }
  }

  function ui(mode) {
    return new Promise(function (resolve) {
      function build() {
        sbStyle();
        var d = el('sb-login') || document.createElement('div'); d.id = 'sb-login';
        if (lowEnd()) d.classList.add('leve');
        if (!d.parentNode) document.body.appendChild(d);
        var vv = window.visualViewport;
        /* acompanha a area visivel (teclado aberto) e encolhe a marca para o formulario nao ficar escondido */
        function fit() { if (!vv) return; d.style.height = vv.height + 'px'; d.style.top = vv.offsetTop + 'px'; }
        var down = false;
        function tec() {
          var a = document.activeElement;
          if (window.innerWidth < 880 && a && d.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) { d.classList.add('tec'); return; }
          if (down) return; /* nao mexe no layout no meio de um toque (senao o clique em Entrar se perde) */
          d.classList.remove('tec');
        }
        function onOut() { setTimeout(tec, 350); }
        function onDown() { down = true; }
        function onUp() { down = false; setTimeout(tec, 350); }
        d.addEventListener('focusin', tec); d.addEventListener('focusout', onOut);
        d.addEventListener('pointerdown', onDown); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onUp);
        if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit(); }
        function done() {
          if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }
          d.removeEventListener('focusin', tec); d.removeEventListener('focusout', onOut);
          d.removeEventListener('pointerdown', onDown); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onUp);
          resolve(); entrada(d, 800);
        }
        function card(body) {
          var c = d.querySelector('.sbl-card');
          if (!c) {
            d.innerHTML = '<div class="sbl-marca"><div class="sbl-mono" aria-hidden="true"><i class="b"></i><i class="l"></i></div><div class="sbl-halo" aria-hidden="true"></div>' +
              '<img class="sbl-sim" src="icons/simbolo-claro.png" alt=""><img class="sbl-logo" src="icons/logotipo-claro.png" alt="select imports">' +
              '<p class="sbl-lema">Vendas, estoque e recibos da loja em um só lugar.</p></div>' +
              '<div class="sbl-lado"><div class="sbl-card"></div></div>';
            c = d.querySelector('.sbl-card');
          }
          c.innerHTML = body;
          return c;
        }
        function er(m, campos) {
          var e = el('sb-er'), c = d.querySelector('.sbl-card');
          if (e) e.textContent = m || '';
          Array.prototype.forEach.call(d.querySelectorAll('.sbl-cp'), function (x) { x.classList.remove('err'); });
          c.classList.remove('erra');
          if (m) { void c.offsetWidth; c.classList.add('erra'); (campos || []).forEach(function (id) { var f = el(id); if (f) f.parentNode.classList.add('err'); }); }
        }
        function mfaStep() {
          card('<h1>Verificação em duas etapas</h1><p class="sbl-sub">Digite o código de 6 dígitos do seu aplicativo autenticador</p>' +
            '<div class="sbl-otp"><input id="sb-c" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Código de 6 dígitos"><span></span><span></span><span></span><span></span><span></span><span></span></div>' +
            '<button id="sb-v" class="sbl-go"><span>Verificar</span></button><p id="sb-er" class="sbl-erro" role="alert"></p><button id="sb-out" type="button" class="sbl-link">Voltar</button>');
          var inp = el('sb-c'), bx = d.querySelectorAll('.sbl-otp span'), busy = false;
          function pint() {
            var v = inp.value.replace(/\D/g, '').slice(0, 6); if (inp.value !== v) inp.value = v;
            for (var i = 0; i < 6; i++) { bx[i].textContent = v.charAt(i); bx[i].classList.toggle('on', document.activeElement === inp && i === Math.min(v.length, 5)); }
            return v;
          }
          async function ver() {
            if (busy) return;
            var code = pint();
            if (code.length !== 6) { er('Digite os 6 números.'); return; }
            busy = true; el('sb-v').disabled = true; el('sb-v').classList.add('carr');
            var f = await mfaFactor(), ch = f && await sb.auth.mfa.challenge({ factorId: f.id });
            var v = ch && !ch.error && await sb.auth.mfa.verify({ factorId: f.id, challengeId: ch.data.id, code: code });
            if (!v || v.error) {
              busy = false; el('sb-v').disabled = false; el('sb-v').classList.remove('carr');
              inp.value = ''; pint(); er('Código incorreto. Tente de novo.'); inp.focus(); return;
            }
            done();
          }
          ['input', 'focus', 'blur'].forEach(function (ev) { inp.addEventListener(ev, function () { if (pint().length === 6 && ev === 'input') ver(); }); });
          el('sb-v').addEventListener('click', ver);
          el('sb-out').addEventListener('click', async function () { await sb.auth.signOut(); location.reload(); });
          setTimeout(function () { inp.focus(); }, 350);
        }
        if (mode === 'config') { card('<h1>Falta configurar</h1><p class="sbl-aviso">Falta configurar o arquivo config.js com a URL e a chave pública do Supabase.</p>'); return; }
        if (mode === 'mfa') { mfaStep(); return; }
        card('<h1>Bem-vindo de volta</h1><p class="sbl-sub">Entre com seu e-mail e senha</p><form id="sb-f" method="post" action="#" autocomplete="on" novalidate>' +
          '<div class="sbl-cp">' + IC_MAIL + '<input id="sb-e" name="username" type="email" inputmode="email" autocapitalize="none" spellcheck="false" autocomplete="username" placeholder=" "><label for="sb-e">E-mail</label></div>' +
          '<div class="sbl-cp sn">' + IC_LOCK + '<input id="sb-p" name="password" type="password" autocomplete="current-password" placeholder=" "><label for="sb-p">Senha</label><button id="sb-eye" type="button" class="sbl-ver">Mostrar</button></div>' +
          '<label class="sbl-opc"><input id="sb-rm" type="checkbox" checked><span class="sw"></span>Manter conectado</label>' +
          '<button id="sb-go" type="submit" class="sbl-go"><span>Entrar</span></button><p id="sb-er" class="sbl-erro" role="alert"></p></form>' +
          '<p class="sbl-seg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Acesso restrito à equipe</p>');
        el('sb-eye').addEventListener('click', function () {
          var p = el('sb-p'), s = p.type === 'password'; p.type = s ? 'text' : 'password'; this.textContent = s ? 'Ocultar' : 'Mostrar';
        });
        async function go() {
          var e = el('sb-e').value.trim(), p = el('sb-p').value;
          if (!e || !p) { er('Digite o e-mail e a senha.', [!e ? 'sb-e' : 'sb-p']); return; }
          er('');
          remember = el('sb-rm').checked;
          el('sb-go').disabled = true; el('sb-go').classList.add('carr'); el('sb-go').textContent = 'Entrando...';
          var r = await sb.auth.signInWithPassword({ email: e, password: p });
          if (r.error) { el('sb-go').disabled = false; el('sb-go').classList.remove('carr'); el('sb-go').textContent = 'Entrar'; er('E-mail ou senha incorretos.', ['sb-e', 'sb-p']); return; }
          try { if (window.PasswordCredential && navigator.credentials && navigator.credentials.store) navigator.credentials.store(new window.PasswordCredential({ id: e, password: p, name: e })); } catch (x) {}
          if (await needMfa()) { mfaStep(); return; }
          done();
        }
        el('sb-f').addEventListener('submit', function (ev) { ev.preventDefault(); go(); });
        el('sb-e').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); el('sb-p').focus(); } });
        
      }
      if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
    });
  }

  /* entrada do app: mantem a marca na tela enquanto os dados chegam e some com suavidade */
  function entrada(d, min) {
    var t0 = Date.now();
    d.classList.add('sai');
    (function esp() {
      var t = Date.now() - t0;
      if ((window.__loaded === true && t >= min) || t > 4500) {
        d.classList.add('out');
        setTimeout(function () { if (d.parentNode) d.remove(); }, 540);
      } else setTimeout(esp, 80);
    })();
  }
  /* quem ja estava logado ve a mesma abertura (no tema do app) em vez do "Carregando" */
  function abertura(pronto) {
    if (!document.body) { document.addEventListener('DOMContentLoaded', function () { abertura(pronto); }); return; }
    sbStyle();
    var luz = true; try { luz = localStorage.getItem('sith') !== '0'; } catch (e) {}
    var k = luz ? 'escuro' : 'claro';
    var d = document.createElement('div'); d.id = 'sb-login'; d.className = 'solo' + (luz ? ' cl' : '');
    if (lowEnd()) d.classList.add('leve');
    d.innerHTML = '<div class="sbl-marca"><div class="sbl-mono" aria-hidden="true"><i class="b"></i><i class="l"></i></div><div class="sbl-halo" aria-hidden="true"></div>' +
      '<img class="sbl-sim" src="icons/simbolo-' + k + '.png" alt=""><img class="sbl-logo" src="icons/logotipo-' + k + '.png" alt="select imports"></div>';
    document.body.appendChild(d);
    entrada(d, 700);
    if (pronto) pronto();
  }

  function init() {
    if (ready) return ready;
    ready = (async function () {
      if (!cfgOk()) { await ui('config'); return new Promise(function () {}); }
      sb = window.supabase.createClient(C.url, C.key, { auth: { persistSession: true, autoRefreshToken: true, storage: store() } });
      var r = await sb.auth.getSession();
      if (!r.data.session) await ui('login');
      else if (await needMfa()) await ui('mfa');
      else await new Promise(function (r) { abertura(r); });
      var h = document.getElementById('sb-hide'); if (h) h.remove();
      sb.auth.onAuthStateChange(function (ev) {
        if (ev === 'SIGNED_OUT') { try { localStorage.removeItem('si'); } catch (e) {} location.reload(); }
      });
      return sb;
    })();
    return ready;
  }

  /* ---------- banco ---------- */
  function snapOf(path, data) {
    return { id: path.split('/').pop(), exists: data != null, data: function () { return data; }, metadata: { hasPendingWrites: false, fromCache: false } };
  }
  function localDoc(p) {
    function read() { var raw = null; try { raw = localStorage.getItem(LP + p); } catch (e) {} return raw == null ? undefined : JSON.parse(raw); }
    return {
      get: function () { return Promise.resolve(snapOf(p, read())); },
      set: function (d) { localStorage.setItem(LP + p, JSON.stringify(d)); return Promise.resolve(); },
      onSnapshot: function (f) { setTimeout(function () { f(snapOf(p, read())); }, 0); return function () {}; }
    };
  }
  function isEmptyState(j) {
    try { var o = JSON.parse(j); return !(o.prod && o.prod.length) && !(o.ven && o.ven.length) && !(o.des && o.des.length); } catch (e) { return false; }
  }
  function parse(j) { try { return JSON.parse(j); } catch (e) { return {}; } }
  async function readRemote() {
    var r = await sb.from('app_state').select('state,rev').eq('id', 'loja').maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  }
  async function doSet(d) {
    if (isEmptyState(d.j)) {
      var cur0 = await readRemote(), cj = cur0 && cur0.state && cur0.state.j;
      if (cj && !isEmptyState(cj)) { console.warn('Gravacao vazia bloqueada para proteger os dados.'); return; }
    }
    for (var i = 0; i < 5; i++) {
      try {
        if (rev == null) {
          var cur = await readRemote();
          if (cur) { rev = cur.rev || 0; baseJ = cur.state && cur.state.j; }
          else {
            var ins = await sb.from('app_state').insert({ id: 'loja', state: d, rev: 1 }).select('rev');
            if (ins.error) { if (String(ins.error.code) === '23505') continue; throw ins.error; }
            rev = 1; baseJ = d.j; chip(''); return;
          }
        }
        var u = await sb.from('app_state').update({ state: d, rev: rev + 1, updated_at: new Date().toISOString() }).eq('id', 'loja').eq('rev', rev).select('rev');
        if (u.error) throw u.error;
        if (u.data && u.data.length) { rev = u.data[0].rev; baseJ = d.j; chip(''); return; }
        var rm = await readRemote();
        if (!rm) { rev = null; continue; }
        var merged = merge3(parse(baseJ), parse(d.j), parse(rm.state && rm.state.j));
        d = { j: JSON.stringify(merged) }; rev = rm.rev || 0; baseJ = rm.state && rm.state.j;
        if (window.__onMerged) window.__onMerged(d.j);
      } catch (e) {
        var net = !navigator.onLine || /fetch|network|failed|load/i.test(String(e && e.message));
        chip(net ? 'Sem conexão: suas alterações estão guardadas neste aparelho e serão enviadas ao reconectar.' : 'Erro ao salvar na nuvem. Tente de novo em instantes.');
        scheduleRetry();
        throw e;
      }
    }
    throw new Error('Conflito de gravacao repetido');
  }
  function remoteDoc(p) {
    return {
      get: async function () {
        var r = await readRemote();
        if (r) { rev = r.rev || 0; baseJ = r.state && r.state.j; } else { rev = null; baseJ = null; }
        return snapOf(p, r ? r.state : undefined);
      },
      set: function (d) { var run = chain.then(function () { return doSet(d); }); chain = run.catch(function () {}); return run; },
      onSnapshot: function (f) {
        var self = this, ch = null, dead = false;
        self.get().then(function (s) { if (!dead) f(s); }).catch(function () {});
        ch = sb.channel('selectimports-state').on('postgres_changes', { event: '*', schema: 'public', table: 'app_state', filter: 'id=eq.loja' },
          function (pl) { if (!dead && pl.new) { rev = pl.new.rev || rev; if (pl.new.state && pl.new.state.j !== baseJ) { /* vem de outro aparelho */ } baseJ = pl.new.state && pl.new.state.j; f(snapOf(p, pl.new.state)); } }).subscribe();
        return function () { dead = true; if (ch) sb.removeChannel(ch); };
      }
    };
  }
  var downloads = {
    save: function (o) {
      var b = o.data instanceof Blob ? o.data : new Blob([o.data]);
      var a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = o.filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      return Promise.resolve();
    }
  };
  var assets = {
    upload: async function (blob) {
      var path = 'p/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.jpg';
      var r = await sb.storage.from('fotos').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
      if (r.error) throw r.error;
      return { id: path, url: C.url + '/storage/v1/object/public/fotos/' + path };
    },
    'delete': async function (id) { var r = await sb.storage.from('fotos').remove([id]); return { deleted: !r.error }; }
  };

  /* ---------- funcoes extras usadas pelo app ---------- */
  window.sbSair = async function () { await init(); await sb.auth.signOut(); };
  window.sbTrocarSenha = async function (p) { await init(); var r = await sb.auth.updateUser({ password: p }); return r.error ? r.error.message : null; };
  window.sbPublicar = async function (d) {
    await init();
    var r = await sb.from('vitrine_publica').upsert({ id: 'loja', dados: d, atualizado_em: new Date().toISOString() });
    return r.error ? r.error.message : null;
  };
  window.sbCliques = async function (dias) {
    await init();
    var r = await sb.from('vitrine_cliques').select('produto_id,tipo,em').gte('em', new Date(Date.now() - dias * 864e5).toISOString()).limit(5000);
    return r.error ? null : r.data;
  };
  /* avisos de volta ao estoque (pedidos feitos na vitrine) */
  window.sbAvisos = async function () {
    await init();
    var r = await sb.from('vitrine_avisos').select('id,produto_id,produto,modelo,cap,cond,whats,em,avisado_em').is('avisado_em', null).order('em', { ascending: false }).limit(500);
    return r.error ? null : r.data;
  };
  window.sbAvisoMarcar = async function (ids) {
    await init();
    var r = await sb.from('vitrine_avisos').update({ avisado_em: new Date().toISOString() }).in('id', ids);
    return r.error ? r.error.message : null;
  };
  window.sbAvisoDel = async function (ids) {
    await init();
    var r = await sb.from('vitrine_avisos').delete().in('id', ids);
    return r.error ? r.error.message : null;
  };
  window.sbBackup = async function (name, json) {
    await init();
    var r = await sb.storage.from('backups').upload(name, new Blob([json], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
    return r.error ? r.error.message : null;
  };
  window.sbBackups = async function () {
    await init();
    var r = await sb.storage.from('backups').list('', { limit: 100, sortBy: { column: 'name', order: 'desc' } });
    return r.error ? null : r.data;
  };
  window.sbBackupUrl = async function (name) { await init(); var r = await sb.storage.from('backups').createSignedUrl(name, 120); return r.error ? null : r.data.signedUrl; };
  window.sbBackupDel = async function (names) { await init(); return sb.storage.from('backups').remove(names); };
  window.sbMfaStatus = async function () { await init(); var f = await mfaFactor(); return { ativo: !!f, id: f && f.id }; };
  window.sbMfaEnroll = async function () {
    await init();
    var l = await sb.auth.mfa.listFactors();
    var un = ((l.data && l.data.all) || []).filter(function (x) { return x.factor_type === 'totp' && x.status !== 'verified'; });
    for (var i = 0; i < un.length; i++) await sb.auth.mfa.unenroll({ factorId: un[i].id });
    var r = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Select Imports ' + Date.now() });
    if (r.error) return { erro: r.error.message };
    return { id: r.data.id, qr: r.data.totp.qr_code, segredo: r.data.totp.secret };
  };
  window.sbMfaVerify = async function (id, code) {
    await init();
    var c = await sb.auth.mfa.challenge({ factorId: id });
    if (c.error) return c.error.message;
    var v = await sb.auth.mfa.verify({ factorId: id, challengeId: c.data.id, code: code });
    return v.error ? v.error.message : null;
  };
  window.sbMfaOff = async function (id) { await init(); var r = await sb.auth.mfa.unenroll({ factorId: id }); return r.error ? r.error.message : null; };

  /* ---------- saida por inatividade (configuravel no app; padrao: nunca) ---------- */
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(function (e) { document.addEventListener(e, function () { lastAct = Date.now(); }, { passive: true }); });
  function checkIdle() { var m = +window.__idleMin || 0; if (m > 0 && sb && Date.now() - lastAct > m * 60000) window.sbSair(); }
  setInterval(checkIdle, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkIdle(); });

  window.claude = {
    use: async function (n) {
      await init();
      if (n === 'db') return { doc: function (p) { return p === 'loja/dados' ? remoteDoc(p) : localDoc(p); } };
      if (n === 'downloads') return downloads;
      if (n === 'assets') return assets;
      return null;
    }
  };
  init();
})();
