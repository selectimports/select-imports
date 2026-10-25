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
  function ui(mode) {
    return new Promise(function (resolve) {
      function build() {
        var d = el('sb-login') || document.createElement('div'); d.id = 'sb-login';
        d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:#48336C;font-family:"IBM Plex Sans",system-ui,sans-serif';
        var inp = 'width:100%;padding:13px;margin:6px 0;border:1px solid #D3BCD8;border-radius:8px;font-size:16px;box-sizing:border-box;background:#fff;color:#1F1630';
        var head = '<img src="icons/simbolo-escuro.png" alt="" style="display:block;width:76px;margin:0 auto 16px"><img src="icons/logotipo-escuro.png" alt="select imports" style="display:block;width:210px;max-width:80%;margin:0 auto 6px">';
        function card(body) { d.innerHTML = '<div style="width:100%;max-width:380px;background:#F8F3F9;border-radius:14px;padding:32px 24px 24px;box-shadow:0 30px 80px #0008;color:#1F1630;text-align:center">' + head + body + '</div>'; }
        if (!d.parentNode) document.body.appendChild(d);
        function er(m) { el('sb-er').textContent = m; }
        function mfaStep() {
          card('<p style="color:#5F4E70;font-size:14px;margin:6px 0 14px">Digite o código de 6 dígitos do seu aplicativo autenticador</p><input id="sb-c" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" style="' + inp + ';text-align:center;letter-spacing:.4em;font-size:22px"><button id="sb-v" style="width:100%;padding:14px;border:0;border-radius:8px;background:#48336C;color:#fff;font-size:16px;font-weight:600;cursor:pointer">Verificar</button><p id="sb-er" style="color:#B3202F;font-size:14px;min-height:18px;margin:10px 0 0"></p><button id="sb-out" style="border:0;background:none;color:#5F4E70;cursor:pointer">Voltar</button>');
          async function ver() {
            var code = el('sb-c').value.replace(/\D/g, '');
            if (code.length !== 6) { er('Digite os 6 números.'); return; }
            el('sb-v').disabled = true;
            var f = await mfaFactor(), ch = f && await sb.auth.mfa.challenge({ factorId: f.id });
            var v = ch && !ch.error && await sb.auth.mfa.verify({ factorId: f.id, challengeId: ch.data.id, code: code });
            if (!v || v.error) { el('sb-v').disabled = false; er('Código incorreto. Tente de novo.'); return; }
            d.remove(); resolve();
          }
          el('sb-v').addEventListener('click', ver);
          el('sb-c').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') ver(); });
          el('sb-out').addEventListener('click', async function () { await sb.auth.signOut(); location.reload(); });
        }
        if (mode === 'config') { card('<p style="color:#B3202F;font-size:14px">Falta configurar o arquivo config.js com a URL e a chave pública do Supabase.</p>'); return; }
        if (mode === 'mfa') { mfaStep(); return; }
        card('<p style="color:#5F4E70;font-size:14px;margin:6px 0 14px">Entre com seu e-mail e senha</p>' +
          '<input id="sb-e" type="email" autocomplete="username" placeholder="E-mail" style="' + inp + '">' +
          '<div style="position:relative"><input id="sb-p" type="password" autocomplete="current-password" placeholder="Senha" style="' + inp + ';padding-right:84px"><button id="sb-eye" type="button" style="position:absolute;right:6px;top:10px;height:36px;padding:0 10px;border:0;border-radius:6px;background:#F1E6F3;color:#5F4E70;font-weight:600;cursor:pointer">Mostrar</button></div>' +
          '<label style="display:flex;gap:8px;align-items:center;justify-content:center;margin:10px 0;font-size:14px;color:#5F4E70"><input id="sb-rm" type="checkbox" checked style="width:auto;margin:0"> Manter conectado</label>' +
          '<button id="sb-go" style="width:100%;padding:14px;border:0;border-radius:8px;background:#48336C;color:#fff;font-size:16px;font-weight:600;cursor:pointer">Entrar</button>' +
          '<p id="sb-er" style="color:#B3202F;font-size:14px;min-height:18px;margin:10px 0 0"></p>');
        el('sb-eye').addEventListener('click', function () {
          var p = el('sb-p'), s = p.type === 'password'; p.type = s ? 'text' : 'password'; this.textContent = s ? 'Ocultar' : 'Mostrar';
        });
        async function go() {
          var e = el('sb-e').value.trim(), p = el('sb-p').value;
          if (!e || !p) { er('Digite o e-mail e a senha.'); return; }
          remember = el('sb-rm').checked;
          el('sb-go').disabled = true; el('sb-go').textContent = 'Entrando...';
          var r = await sb.auth.signInWithPassword({ email: e, password: p });
          if (r.error) { el('sb-go').disabled = false; el('sb-go').textContent = 'Entrar'; er('E-mail ou senha incorretos.'); return; }
          if (await needMfa()) { mfaStep(); return; }
          d.remove(); resolve();
        }
        el('sb-go').addEventListener('click', go);
        el('sb-p').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });
      }
      if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
    });
  }

  function init() {
    if (ready) return ready;
    ready = (async function () {
      if (!cfgOk()) { await ui('config'); return new Promise(function () {}); }
      sb = window.supabase.createClient(C.url, C.key, { auth: { persistSession: true, autoRefreshToken: true, storage: store() } });
      var r = await sb.auth.getSession();
      if (!r.data.session) await ui('login');
      else if (await needMfa()) await ui('mfa');
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
