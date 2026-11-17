#!/usr/bin/env node
/* Testa a lógica do Sob encomenda (app) e dos cards (vitrine) sem abrir navegador.
   Uso: node scripts/teste-sob-encomenda.mjs */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'index.html'), 'utf8');
const vit = readFileSync(join(root, 'vitrine/index.html'), 'utf8');
let ok = 0;
const t = (nome, fn) => { try { fn(); ok++; console.log('✓ ' + nome); } catch (e) { console.error('✗ ' + nome + '\n  ' + e.message); process.exitCode = 1; } };

/* ---------- app ---------- */
const a0 = app.indexOf('const SEC={'), a1 = app.indexOf('function seEnc(');
const i0 = app.indexOf('const IPH=(()=>'), iph = app.slice(i0, app.indexOf('})();', i0) + 5);
const ctx = vm.createContext({ console, Date, Math, JSON, Set, Object, Array, String, parseFloat, isNaN });
vm.runInContext(`
let S={prod:[],cfg:{fbank:{}}};const r2c=n=>Math.round(n*100)/100;
const parcPlan=()=>({par:null,pl:null}),gwTxt=()=>'',fotoUrl=x=>x,mdName=m=>m;
${iph}
const fbk=(m,c)=>String(m).toLowerCase()+'|'+String(c).toLowerCase().trim();
const pCor=p=>String(p.d||'').replace(/\\b\\d+\\s?(?:gb|tb)\\b/ig,' ').replace(/\\s+/g,' ').trim();
const phOf=p=>(S.cfg.fbank[fbk(p.n,pCor(p))]||[]);
const save=()=>{},go=()=>{},toast=()=>{},$=()=>null,window={},V=()=>'',msg=()=>{},ask=()=>{};
${app.slice(a0, a1)}
`, ctx);
const run = (c) => vm.runInContext(c, ctx);

const lista = `iPhone 18 Pro 256GB BURGUNDY A3600 LL/A eSIM 1000
iPhone 18 Pro 256GB BURGUNDY A3600 AH/A 950
iPhone Duo 256GB STARLIGHT eSIM 1700
iPhone Duo 256GB NIGHT SKY eSIM 1700
iPhone 16 128GB BLACK 600`;

t('lê as linhas da lista', () => assert.equal(run(`seParse(${JSON.stringify(lista)}).rows.length`), 5));
const listaZap = `📱 *LISTA DE IPHONES*
📅   17/11/2026
👑 *IPHONE 18 PRO MAX* *256GB*
🖤 Black | LL/A | $1.390
👑 *IPHONE 18 PRO MAX* *1TB*
🍷 Burgundy | LL/A | $2.100
📱 *iPhone AIR 256GB*
💙 Blue | AJ/ | $905
🍂*IPHONE 16 PRO MAX* *256gb*
  🩶Desert LL/A | $1010`;
t('lista do WhatsApp (cabeçalho + linhas de cor): preço em dólar certo, 1TB lido, capacidade não vira preço', () => {
  const r = run(`JSON.stringify(seParse(${JSON.stringify(listaZap)}).rows.map(x=>[x.m,x.cap,seCor(x.m,x.en),x.usd]))`);
  assert.equal(r, JSON.stringify([['iPhone 18 Pro Max','256GB','Preto',1390],['iPhone 18 Pro Max','1TB','Bordô',2100],['iPhone Air','256GB','Azul Céu',905],['iPhone 16 Pro Max','256GB','Titânio Deserto',1010]]));
  assert.equal(run(`seParse(${JSON.stringify(listaZap)}).bad.length`), 0);
});
t('Duo: cores traduzidas para Branco Estelar e Céu Noturno', () => {
  const c = run(`seParse(${JSON.stringify(lista)}).rows.filter(r=>r.m=='iPhone Duo').map(r=>seCor(r.m,r.en)).sort().join('|')`);
  assert.equal(c, 'Branco Estelar|Céu Noturno');
});
t('Duo está no Banco de fotos com as duas cores', () => {
  const d = run(`JSON.stringify(IPH.find(m=>m[1]=='iPhone Duo'))`);
  assert.ok(d.includes('Branco Estelar') && d.includes('Céu Noturno'));
});
t('mesmo modelo, capacidade e cor: só o mais barato na vitrine (chip não separa)', () => {
  run(`S.se=undefined;se().usd=5;se().frete=0;se().nota=1;se().marg={'iPhone 18 Pro':500,'iPhone Duo':800,'iPhone 16':300};se().it=seParse(${JSON.stringify(lista)}).rows;S.cfg.fbank={'iphone 18 pro|bordô':['f1'],'iphone duo|branco estelar':['f2'],'iphone duo|céu noturno':['f3'],'iphone 16|preto':['f4']};`);
  const r = run(`seRows({pixb:true})`);
  const p18 = r.filter(x => x.n === 'iPhone 18 Pro');
  assert.equal(p18.length, 1);
  assert.equal(p18[0].pr > 0, true);
  assert.equal(run(`seVis().hid.size`), 1);
});
t('a vitrine não recebe chip; recebe prazo e selo Anatel como campos próprios', () => {
  const r = run(`seRows({pixb:true})`);
  r.forEach(x => { assert.equal(x.desc, ''); assert.ok(!/chip|esim/i.test(JSON.stringify(x))); assert.ok('prz' in x && 'an' in x); });
});
t('sem foto no banco: não vai para a vitrine, a menos que a opção esteja ligada', () => {
  run(`S.cfg.fbank={'iphone duo|branco estelar':['f2']}`);
  assert.equal(run(`seRows({pixb:true}).map(x=>x.n+' '+x.d).sort().join('|')`), 'iPhone Duo 256GB Branco Estelar');
  run(`se().semFoto=true`);
  assert.equal(run(`seRows({pixb:true}).length`), 4);
  run(`se().semFoto=false`);
});
t('margem fica salva quando o modelo some da lista e volta', () => {
  run(`se().marg['iPhone 16']=777;seApply({rows:seParse('iPhone Duo 256GB NIGHT SKY eSIM 1700').rows,bad:[]})`);
  assert.equal(run(`seMg('iPhone 16')`), 777);
  run(`seApply({rows:seParse('iPhone 16 128GB BLACK 600').rows,bad:[]})`);
  assert.equal(run(`seMg('iPhone 16')`), 777);
  assert.equal(run(`seMg('iPhone 18 Pro')`), 500);
});
t('modelo sem margem nunca recebe preço', () => {
  run(`delete se().marg['iPhone 16']`);
  assert.equal(run(`sePr(se().it[0])`), 0);
});

/* ---------- vitrine ---------- */
const g0 = vit.indexOf('const pv=x=>'), g1 = vit.indexOf('function theme()');
const v = vm.createContext({ console, Set, Object, Array, String, JSON, Math, Date, isFinite, Infinity });
vm.runInContext(`
let D={itens:[]},fl={cat:'',cond:''},cfg={preco:true};
const CAP=/(\\d+(?:[.,]\\d+)?)\\s*(tb|gb)/i,norm=s=>String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase(),hexOf=()=>'#000',R=n=>n,X=s=>s,cname=()=>'',wa=()=>'';
${vit.slice(g0, g1)}
`, v);
const vr = (c) => vm.runInContext(c, v);
t('card mostra só as fotos do aparelho exibido (não soma as outras cores)', () => {
  vr(`D.itens=[{id:1,c:'sob',n:'iPhone 18 Pro',d:'256GB Bordô',co:'Novo',pr:8590,disp:'enc',ph:['a','b','c']},{id:2,c:'sob',n:'iPhone 18 Pro',d:'256GB Preto',co:'Novo',pr:8890,disp:'enc',ph:['d','e','f','g','h']}]`);
  assert.equal(vr(`(()=>{const P=groups();return P.length+'|'+P[0].ph.length+'|'+cph(P[0]).length+'|'+cph(P[0])[0]})()`), '1|8|3|a');
});
t('prazo e Anatel chegam ao produto', () => {
  vr(`D.itens=[{id:1,c:'sob',n:'iPhone 18 Pro',d:'256GB Bordô',co:'Novo',pr:8590,disp:'enc',ph:['a'],prz:'7 a 10 dias',an:1}]`);
  assert.equal(vr(`(()=>{const x=groups()[0].v[0];return x.prz+'|'+x.an})()`), '7 a 10 dias|1');
});
t('botão de encomendar não leva valor nem Pix', () => {
  assert.ok(vit.includes("x.disp!='esgotado'&&x.disp!='enc'?"));
  assert.ok(!/Quero encomendar.{0,80}no Pix/.test(vit));
});
console.log(`\n${ok} testes ok${process.exitCode ? ', com falhas' : ''}.`);
