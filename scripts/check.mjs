#!/usr/bin/env node
/* Verificações rápidas do projeto (sem dependências): sintaxe de todos os scripts, JSON, arquivos referenciados e segredos.
   Uso: node scripts/check.mjs   (ou: npm run check) */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let erros = 0, ok = 0;
const falha = (m) => { erros++; console.error('✗ ' + m); };
const passa = (m) => { ok++; console.log('✓ ' + m); };
const ler = (f) => readFileSync(join(root, f), 'utf8');

/* 1. sintaxe dos scripts (.js e blocos <script> inline dos HTML) */
function sintaxe(nome, codigo) {
  try { new Script(codigo, { filename: nome }); passa('sintaxe: ' + nome); }
  catch (e) { falha('sintaxe em ' + nome + ': ' + e.message); }
}
['sw.js', 'supabase-shim.js', 'qr.js', 'config.js'].forEach((f) => sintaxe(f, ler(f)));
try { new Script(ler('api/p.js'), { filename: 'api/p.js' }); passa('sintaxe: api/p.js'); } catch (e) { falha('api/p.js: ' + e.message); }
for (const f of ['index.html', 'vitrine/index.html']) {
  const html = ler(f);
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => sintaxe(`${f} (script ${i + 1})`, m[1]));
}

/* 2. JSON válidos */
['vercel.json', 'manifest.webmanifest', 'package.json'].forEach((f) => {
  try { JSON.parse(ler(f)); passa('json: ' + f); } catch (e) { falha(f + ': ' + e.message); }
});

/* 3. arquivos referenciados existem (ícones do manifest, scripts do index e itens do cache offline) */
const manifest = JSON.parse(ler('manifest.webmanifest'));
manifest.icons.forEach((i) => existsSync(join(root, i.src)) ? passa('ícone: ' + i.src) : falha('ícone ausente: ' + i.src));
const sw = ler('sw.js');
const core = (sw.match(/CORE = \[([\s\S]*?)\]/) || [, ''])[1].match(/'([^']+)'/g) || [];
core.map((x) => x.replace(/'/g, '')).filter((x) => x !== './').forEach((f) => existsSync(join(root, f)) ? 0 : falha('sw.js cacheia arquivo que não existe: ' + f));
passa('cache offline: ' + core.length + ' itens conferidos');
for (const m of ler('index.html').matchAll(/<script src="([^"]+)"/g)) {
  if (!/^https?:/.test(m[1])) existsSync(join(root, m[1])) ? 0 : falha('index.html referencia ' + m[1] + ' que não existe');
}

/* 4. segredos: a chave pública (sb_publishable_ / anon) é esperada; qualquer coisa "secreta" não pode estar no repositório */
const proibidos = [/service_role['"]?\s*[:=]\s*['"][^'"]{8,}/i, /sb_secret_/i, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/];
function varre(dir) {
  for (const n of readdirSync(dir)) {
    if (['.git', 'node_modules'].includes(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { varre(p); continue; }
    if (/\.(png|jpg|jpeg|webp|ico|woff2?|md)$/i.test(n) || n === 'check.mjs') continue;
    const t = readFileSync(p, 'utf8');
    proibidos.forEach((re) => { if (re.test(t)) falha('possível segredo em ' + p.replace(root + '/', '') + ' (' + re + ')'); });
  }
}
varre(root);
passa('varredura de segredos concluída');

console.log(`\n${ok} verificações ok, ${erros} problema(s).`);
process.exit(erros ? 1 : 0);
