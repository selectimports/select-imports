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
  var SBCSS = '';
  var IC_MAIL = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 8 8 6 8-6"/></svg>';
  var IC_LOCK = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  function sbStyle() {
    if (el('sb-css')) return;
    var s = document.createElement('link'); s.id = 'sb-css'; s.rel = 'stylesheet'; s.href = 'login.css';
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
          resolve(); entrada(d, 900);
        }
        function card(body) {
          var c = d.querySelector('.sbl-card');
          if (!c && d.querySelector('.sbl-marca')) {
            d.classList.remove('solo', 'cl');
            var lado = document.createElement('div'); lado.className = 'sbl-lado'; lado.innerHTML = '<div class="sbl-card"></div>';
            d.appendChild(lado); c = d.querySelector('.sbl-card');
          }
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
      if ((window.__loaded === true && t >= min) || t > 6000) {
        var app = document.getElementById('app');
        if (app) { app.classList.add('entra'); setTimeout(function () { app.classList.remove('entra'); }, 1700); }
        d.classList.add('out');
        setTimeout(function () { if (d.parentNode) d.remove(); }, 1500);
      } else setTimeout(esp, 80);
    })();
  }
  /* quem ja estava logado ve a mesma abertura (no tema do app) em vez do "Carregando" */
  function abertura(pronto) {
    if (!document.body) { document.addEventListener('DOMContentLoaded', function () { abertura(pronto); }); return; }
    sbStyle();
    var d = el('sb-login');
    if (!d) {
      d = document.createElement('div'); d.id = 'sb-login'; d.className = 'solo';
      d.innerHTML = '<div class="sbl-marca"><div class="sbl-mono" aria-hidden="true"><i class="b"></i><i class="l"></i></div><div class="sbl-halo" aria-hidden="true"></div>' +
        '<img class="sbl-sim" src="icons/simbolo-claro.png" alt=""><img class="sbl-logo" src="icons/logotipo-claro.png" alt="select imports"></div>';
      document.body.appendChild(d);
    }
    if (lowEnd()) d.classList.add('leve');
    entrada(d, 1700);
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
  window.sbSair = async function () {
    try { await init(); await Promise.race([sb.auth.signOut({ scope: 'local' }), new Promise(function (r) { setTimeout(r, 3000); })]); } catch (e) {}
    try { [localStorage, sessionStorage].forEach(function (st) { Object.keys(st).filter(function (k) { return /^sb-/.test(k) || k === 'si'; }).forEach(function (k) { st.removeItem(k); }); }); } catch (e) {}
    location.reload();
  };
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
