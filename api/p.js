// Link de produto com prévia bonita (WhatsApp, Instagram, iMessage).
// /p/<id>  ->  devolve uma página com as tags Open Graph do produto e leva a pessoa para /vitrine/?p=<id>
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(+n) ? 0 : 2, maximumFractionDigits: 2 });

module.exports = async (req, res) => {
  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(rawHost)) { res.status(400).send('Requisição inválida'); return; }
  const origin = 'https://' + rawHost;
  const T = () => ({ signal: AbortSignal.timeout(3000) }); /* prévia de link não pode travar o WhatsApp */
  const id = String((req.query && req.query.id) || '').slice(0, 80);
  const dest = '/vitrine/' + (id ? '?p=' + encodeURIComponent(id) : '');
  let title = 'SELECT IMPORTS | Vitrine', desc = 'Apple & Cosméticos', img = origin + '/icons/icon-512.png';
  try {
    const cfgTxt = await (await fetch(origin + '/config.js', T())).text();
    const U = (/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/.exec(cfgTxt) || [])[1];
    const K = (/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/.exec(cfgTxt) || [])[1];
    if (U && K && id) {
      const r = await fetch(U + '/rest/v1/vitrine_publica?id=eq.loja&select=dados', { headers: { apikey: K, Authorization: 'Bearer ' + K }, signal: AbortSignal.timeout(3000) });
      const D = ((await r.json())[0] || {}).dados;
      const it = D && D.ativa && (D.itens || []).find(x => String(x.id) === id);
      if (it) {
        const c = D.cfg || {};
        const preco = c.preco && (it.pix || it.pr) > 0;
        title = it.n + (it.d ? ' ' + it.d : '') + ' | ' + (c.nome || 'SELECT IMPORTS');
        const partes = [];
        if (preco) partes.push(brl(it.pix || it.pr) + (it.pix || c.pixb !== false ? ' no Pix' : ''));
        if (preco && it.par && it.par.n > 1) partes.push('ou ' + it.par.n + 'x de ' + brl(it.par.v) + ' no cartão');
        if (it.co) partes.push(it.co);
        if (it.ori) partes.push('Original Apple');
        if (it.gar) partes.push(it.gar);
        desc = partes.join(' · ') || desc;
        const ph = (it.ph || []).find(u => /^https?:\/\//.test(u));
        if (ph) img = ph;
      }
    }
  } catch (e) { /* sem dados: usa a prévia padrão da loja */ }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.status(200).send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="SELECT IMPORTS">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:url" content="${esc(origin + '/p/' + encodeURIComponent(id))}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(dest)}"></head>
<body><script>location.replace(${JSON.stringify(dest)})</script><a href="${esc(dest)}">Abrir na vitrine</a></body></html>`);
};
