/* Select Imports - gerador de QR Code local (modo byte, correção M, versões 1 a 10 = até 213 caracteres).
   Evita enviar o link da loja a um serviço externo e funciona sem internet.
   Uso: siQR('https://...') devolve um data URI de imagem SVG; siQR.matrix(texto) devolve a matriz de módulos. */
(function (root) {
  'use strict';
  var EXP = [], LOG = [];
  (function () {
    var x = 1, i;
    for (i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function mul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }
  function rsEnc(data, n) {
    var g = [1], i, j;
    for (i = 0; i < n; i++) {
      var ng = [];
      for (j = 0; j <= g.length; j++) ng[j] = 0;
      for (j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); }
      g = ng;
    }
    var r = [];
    for (i = 0; i < n; i++) r[i] = 0;
    data.forEach(function (d) {
      var f = d ^ r[0];
      r.shift(); r.push(0);
      if (f) for (var k = 0; k < n; k++) r[k] ^= mul(g[k + 1], f);
    });
    return r;
  }
  /* correção M: [bytes de correção por bloco, blocos do grupo 1, dados por bloco, blocos do grupo 2, dados por bloco] */
  var BL = [null, [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]];
  var AL = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  function utf8(t) {
    var s = unescape(encodeURIComponent(String(t))), o = [], i;
    for (i = 0; i < s.length; i++) o.push(s.charCodeAt(i));
    return o;
  }
  function dataCap(v) { var b = BL[v]; return b[1] * b[2] + b[3] * b[4]; }

  function matrix(text) {
    var bytes = utf8(text), v, n, i, j;
    for (v = 1; v <= 10; v++) {
      var cc = v < 10 ? 8 : 16;
      if (Math.ceil((4 + cc + 8 * bytes.length) / 8) <= dataCap(v)) break;
    }
    if (v > 10) throw new Error('Texto longo demais para o QR Code');
    var cap = dataCap(v), bits = [];
    function put(val, len) { for (var k = len - 1; k >= 0; k--) bits.push((val >>> k) & 1); }
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    var cw = [];
    for (i = 0; i < bits.length; i += 8) { var x = 0; for (j = 0; j < 8; j++) x = (x << 1) | bits[i + j]; cw.push(x); }
    for (i = 0; cw.length < cap; i++) cw.push(i % 2 ? 0x11 : 0xEC);
    /* blocos, correção de erros e intercalação */
    var b = BL[v], blocks = [], pos = 0, ec = b[0];
    for (i = 0; i < b[1] + b[3]; i++) {
      var len = i < b[1] ? b[2] : b[4];
      blocks.push({ d: cw.slice(pos, pos + len), e: rsEnc(cw.slice(pos, pos + len), ec) });
      pos += len;
    }
    var all = [], maxd = Math.max(b[2], b[4]);
    for (i = 0; i < maxd; i++) blocks.forEach(function (k) { if (i < k.d.length) all.push(k.d[i]); });
    for (i = 0; i < ec; i++) blocks.forEach(function (k) { all.push(k.e[i]); });

    n = 17 + 4 * v;
    var M = [], F = [];
    for (i = 0; i < n; i++) { M.push([]); F.push([]); for (j = 0; j < n; j++) { M[i].push(false); F[i].push(false); } }
    function set(x, y, d) { M[y][x] = !!d; F[y][x] = true; }
    for (i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [n - 4, 3], [3, n - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var xx = c[0] + dx, yy = c[1] + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (xx >= 0 && xx < n && yy >= 0 && yy < n) set(xx, yy, d !== 2 && d !== 4);
      }
    });
    var al = AL[v], last = al.length - 1;
    al.forEach(function (ax, ai) {
      al.forEach(function (ay, aj) {
        if ((ai === 0 && aj === 0) || (ai === 0 && aj === last) || (ai === last && aj === 0)) return;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      });
    });
    function formatBits(mask) {
      var data = mask, rem = data << 10, k;      /* correção M = 00 */
      for (k = 14; k >= 10; k--) if ((rem >>> k) & 1) rem ^= 0x537 << (k - 10);
      var f = ((data << 10) | rem) ^ 0x5412;
      function bt(q) { return (f >>> q) & 1; }
      for (k = 0; k <= 5; k++) set(8, k, bt(k));
      set(8, 7, bt(6)); set(8, 8, bt(7)); set(7, 8, bt(8));
      for (k = 9; k < 15; k++) set(14 - k, 8, bt(k));
      for (k = 0; k < 8; k++) set(n - 1 - k, 8, bt(k));
      for (k = 8; k < 15; k++) set(8, n - 15 + k, bt(k));
      set(8, n - 8, true);
    }
    formatBits(0);
    if (v >= 7) {
      var rem = v, k;
      for (k = 0; k < 12; k++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (v << 12) | rem;
      for (k = 0; k < 18; k++) {
        var a = n - 11 + (k % 3), c = Math.floor(k / 3), bit = (vb >>> k) & 1;
        set(a, c, bit); set(c, a, bit);
      }
    }
    /* posição dos bits de dados */
    var idx = 0, right, vert, jj;
    for (right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (vert = 0; vert < n; vert++) for (jj = 0; jj < 2; jj++) {
        var px = right - jj, up = ((right + 1) & 2) === 0, py = up ? n - 1 - vert : vert;
        if (!F[py][px] && idx < all.length * 8) { M[py][px] = ((all[idx >> 3] >>> (7 - (idx & 7))) & 1) === 1; idx++; }
      }
    }
    function applyMask(m) {
      for (var y = 0; y < n; y++) for (var x2 = 0; x2 < n; x2++) {
        var inv;
        switch (m) {
          case 0: inv = (x2 + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x2 % 3 === 0; break;
          case 3: inv = (x2 + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x2 / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = (x2 * y) % 2 + (x2 * y) % 3 === 0; break;
          case 6: inv = ((x2 * y) % 2 + (x2 * y) % 3) % 2 === 0; break;
          default: inv = ((x2 + y) % 2 + (x2 * y) % 3) % 2 === 0;
        }
        if (!F[y][x2] && inv) M[y][x2] = !M[y][x2];
      }
    }
    function penalty() {
      var p = 0, y, x2, run, dark = 0, line, q;
      for (y = 0; y < n; y++) for (q = 0; q < 2; q++) {      /* regra 1 e 3: linhas e colunas */
        line = []; for (x2 = 0; x2 < n; x2++) line.push(q ? M[x2][y] : M[y][x2]);
        run = 1;
        for (x2 = 1; x2 <= n; x2++) {
          if (x2 < n && line[x2] === line[x2 - 1]) run++;
          else { if (run >= 5) p += 3 + run - 5; run = 1; }
        }
        var s = line.map(function (d) { return d ? '1' : '0'; }).join('');
        var m1 = s.match(/(?=(00001011101|10111010000))/g);
        if (m1) p += 40 * m1.length;
      }
      for (y = 0; y < n - 1; y++) for (x2 = 0; x2 < n - 1; x2++) {   /* regra 2: blocos 2x2 */
        var c0 = M[y][x2];
        if (c0 === M[y][x2 + 1] && c0 === M[y + 1][x2] && c0 === M[y + 1][x2 + 1]) p += 3;
      }
      for (y = 0; y < n; y++) for (x2 = 0; x2 < n; x2++) if (M[y][x2]) dark++;   /* regra 4: equilíbrio */
      p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
      return p;
    }
    var best = 0, bestP = Infinity, m;
    for (m = 0; m < 8; m++) {
      applyMask(m); formatBits(m);
      var pp = penalty();
      if (pp < bestP) { bestP = pp; best = m; }
      applyMask(m);
    }
    applyMask(best); formatBits(best);
    return M;
  }

  function siQR(text, opt) {
    opt = opt || {};
    var M = matrix(text), n = M.length, q = opt.quiet == null ? 4 : opt.quiet, N = n + q * 2, d = '', x, y;
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (M[y][x]) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + N + ' ' + N + '" shape-rendering="crispEdges">' +
      '<rect width="' + N + '" height="' + N + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  siQR.matrix = matrix;
  root.siQR = siQR;
  if (typeof module !== 'undefined' && module.exports) module.exports = siQR;
})(typeof window !== 'undefined' ? window : globalThis);
