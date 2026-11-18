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

t('lê as linhas da lista; repetidos (mesmo modelo, capacidade e cor) ficam com o mais barato', () => {
  assert.equal(run(`seParse(${JSON.stringify(lista)}).rows.length`), 4);
  assert.equal(run(`seParse(${JSON.stringify(lista)}).rows.find(x=>x.m=='iPhone 18 Pro').usd`), 950);
});
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
const listaSn = `45971	IPHONE 14 128GB YELLOW ESIM (SWAP GRADO A) S/G 	298
75220	IPHONE 14 256GB RED ESIM (SWAP GRADO A-) 	323
75213	IPHONE 14 256GB RED ESIM (SWAP GRADO A) 	328
45995	IPHONE 14 128GB YELLOW ESIM (SWAP GRADO B) S/G 	286
73196	IPHONE 16 128GB LL BLACK (ESIM) (SWAP GRADO C) S/G 	540
71680	IPHONE 16 128GB LL BLACK (ESIM) (SWAP GRADO A) S/G 	558
71000	IPHONE 16 128GB LL PINK (ESIM) (SWAP GRADO A+) S/G 	570
71001	IPHONE 16 128GB LL TEAL (ESIM) (SWAP GRADO A -) S/G 	560
71002	IPHONE 16 128GB LL ULTRAMARINE (ESIM) (SWAP) S/G 	560
65030	MACBOOK PRO I5 13.3 8/128GB MPXQ2LL/A 2017 GRAY (SWAP) 	195`;
t('seminovos: só entra Grade A exata; A-, A+, B, C, sem grade e outros produtos ficam de fora', () => {
  const r = JSON.parse(run(`JSON.stringify(seParseSn(${JSON.stringify(listaSn)}))`));
  assert.deepEqual(r.rows.map(x => [x.m, x.cap, x.en, x.usd]), [['iPhone 14','128GB','YELLOW',298],['iPhone 14','256GB','RED',328],['iPhone 16','128GB','BLACK',558]]);
  assert.equal(r.ig.am, 2); assert.equal(r.ig.b, 1); assert.equal(r.ig.c, 1); assert.equal(r.ig.out, 1); assert.equal(r.ig.sg, 1);
  assert.equal(r.bad.length, 0);
  assert.equal(run(`seParseSn('IPHONE 17 256GB BLACK ESIM GRADE A 784').rows.length`), 1);
});
t('seminovos: aceita linha sem código nem tabulação e ignora chip e região', () => {
  const r = JSON.parse(run(`JSON.stringify(seParseSn('IPHONE 16 PRO MAX 256GB LL DESERT TITANIUM (SWAP GRADO A) S/G 814').rows)`));
  assert.deepEqual(Object.keys(r[0]).sort(), ['cap','en','key','m','sn','usd']);
  assert.equal(run(`seCor('iPhone 16 Pro Max','DESERT TITANIUM')`), 'Titânio Deserto');
});
t('seminovos vão para a vitrine como Seminovo, com margem e preço próprios', () => {
  const sv = run(`JSON.stringify([S.se,S.cfg.fbank])`);
  const out = JSON.parse(run(`S.se=undefined;const s=se();s.usd=9;s.usdSn=5;s.marg={'iPhone 14':999};s.msn={'iPhone 14':200};s.it=[];s.sn=seParseSn(${JSON.stringify(listaSn)}).rows;S.cfg.fbank={'iphone 14|amarelo':['f'],'iphone 14|vermelho':['f']};JSON.stringify(seRows({pixb:true}).map(r=>[r.n,r.d,r.co,r.pr]))`));
  run(`[S.se,S.cfg.fbank]=JSON.parse(${JSON.stringify(sv)})`);
  assert.deepEqual(out, [['iPhone 14','128GB Amarelo','Seminovo',1790],['iPhone 14','256GB Vermelho','Seminovo',1890]]);
});
t('o que mudou: entraram, saíram, subiram e desceram desde a última lista', () => {
  const d = JSON.parse(run(`JSON.stringify(seDiff(
    [{m:'iPhone 16',cap:'128GB',en:'BLACK',usd:730},{m:'iPhone 16',cap:'128GB',en:'PINK',usd:735},{m:'iPhone 17',cap:'256GB',en:'BLUE',usd:875},{m:'iPhone 15',cap:'128GB',en:'BLUE',usd:640}],
    [{m:'iPhone 16',cap:'128GB',en:'BLACK',usd:740},{m:'iPhone 16',cap:'128GB',en:'PINK',usd:735},{m:'iPhone 17',cap:'256GB',en:'BLUE',usd:860},{m:'iPhone 17',cap:'256GB',en:'WHITE',usd:875}],123))`));
  assert.deepEqual(d.add.map(x => x.en), ['WHITE']);
  assert.deepEqual(d.del.map(x => x.m), ['iPhone 15']);
  assert.deepEqual(d.up.map(x => [x.en, x.from, x.usd]), [['BLACK', 730, 740]]);
  assert.deepEqual(d.dn.map(x => [x.en, x.from, x.usd]), [['BLUE', 875, 860]]);
  assert.equal(d.since, 123);
});
t('o que mudou: lista salva no formato antigo (com região) não gera mudança falsa', () => {
  const d = JSON.parse(run(`JSON.stringify(seDiff([{m:'iPhone 16',cap:'128GB',en:'BLACK',usd:730,reg:'HN/A',chip:'esim',key:'a|b|c|d|e|f|g'}],[{m:'iPhone 16',cap:'128GB',en:'BLACK',usd:730,key:'iPhone 16|128GB|BLACK'}],1))`));
  assert.equal(d.add.length + d.del.length + d.up.length + d.dn.length, 0);
});
t('o que mudou: seApply e seApplySn guardam a comparação; primeira lista não tem comparação', () => {
  const sv = run(`JSON.stringify([S.se,S.cfg.fbank])`);
  const r = JSON.parse(run(`S.se=undefined;seApply({rows:seParse('IPHONE 16 128GB BLACK 700').rows,bad:[]});const a=se().dif;seApply({rows:seParse('IPHONE 16 128GB BLACK 710\\nIPHONE 17 256GB BLACK 800').rows,bad:[]});const b=se().dif;seApplySn({rows:seParseSn('IPHONE 14 128GB YELLOW (SWAP GRADO A) 298').rows,ig:{},bad:[]});const c=se().difSn;seApplySn({rows:seParseSn('IPHONE 14 128GB YELLOW (SWAP GRADO A) 290').rows,ig:{},bad:[]});JSON.stringify([a,b&&[b.add.length,b.up.length],c,se().difSn.dn.length])`));
  run(`[S.se,S.cfg.fbank]=JSON.parse(${JSON.stringify(sv)})`);
  assert.deepEqual(r, [null, [1, 1], null, 1]);
});
t('cotação separada: seminovos usam a cotação dos seminovos, novos usam a dos novos', () => {
  const sv = run(`JSON.stringify([S.se,S.cfg.fbank])`);
  const r = JSON.parse(run(`(()=>{S.se=undefined;const s=se();s.usd=6;s.usdSn=5;s.marg={'iPhone 16':100};s.msn={'iPhone 16':100};s.it=seParse('IPHONE 16 128GB\\nBlack | HN/A | $700').rows;s.sn=seParseSn('IPHONE 16 128GB LL BLACK (SWAP GRADO A) 700').rows;const a=[sePr(s.it[0]),sePr(s.sn[0]),seCost(s.it[0]),seCost(s.sn[0])];se().usdSn=0;const b=sePr(se().sn[0]);se().usdSn=5;se().usd=0;const c=[sePr(se().it[0]),sePr(se().sn[0])];return JSON.stringify([a,b,c])})()`));
  run(`[S.se,S.cfg.fbank]=JSON.parse(${JSON.stringify(sv)})`);
  assert.equal(r[0][2], 4200); assert.equal(r[0][3], 3500);           /* custo = dólar × cotação de cada lista */
  assert.ok(r[0][0] > r[0][1]);                                         /* cotação maior, preço maior */
  assert.equal(r[1], 0);                                                /* seminovo sem a sua cotação não recebe preço */
  assert.equal(r[2][0], 0); assert.ok(r[2][1] > 0);                     /* novo sem a sua cotação não recebe preço, mas o seminovo continua */
});
t('Duo: cores traduzidas para Branco Estelar e Céu Noturno', () => {
  const c = run(`seParse(${JSON.stringify(lista)}).rows.filter(r=>r.m=='iPhone Duo').map(r=>seCor(r.m,r.en)).sort().join('|')`);
  assert.equal(c, 'Branco Estelar|Céu Noturno');
});
t('Duo está no Banco de fotos com as duas cores', () => {
  const d = run(`JSON.stringify(IPH.find(m=>m[1]=='iPhone Duo'))`);
  assert.ok(d.includes('Branco Estelar') && d.includes('Céu Noturno'));
});
t('mesmo modelo, capacidade e cor: fica só o mais barato (sem separar por região ou chip)', () => {
  run(`S.se=undefined;se().usd=5;se().frete=0;se().nota=1;se().marg={'iPhone 18 Pro':500,'iPhone Duo':800,'iPhone 16':300};se().it=seParse(${JSON.stringify(lista)}).rows;S.cfg.fbank={'iphone 18 pro|bordô':['f1'],'iphone duo|branco estelar':['f2'],'iphone duo|céu noturno':['f3'],'iphone 16|preto':['f4']};`);
  const r = run(`seRows({pixb:true})`);
  const p18 = r.filter(x => x.n === 'iPhone 18 Pro');
  assert.equal(p18.length, 1);
  assert.equal(p18[0].pr > 0, true);
  assert.equal(run(`new Set(se().it.map(x=>x.key)).size===se().it.length`), true);
});
t('a vitrine não recebe chip; recebe prazo como campo próprio', () => {
  const r = run(`seRows({pixb:true})`);
  r.forEach(x => { assert.equal(x.desc, ''); assert.ok(!/chip|esim/i.test(JSON.stringify(x))); assert.ok('prz' in x); });
});
t('o app guarda só modelo, capacidade, cor e preço (sem chip, região nem código)', () => {
  const r = JSON.parse(run(`JSON.stringify(seParse(${JSON.stringify(listaZap)}).rows)`));
  r.forEach(x => assert.deepEqual(Object.keys(x).sort(), ['cap','en','key','m','usd']));
});
t('o código do produto não muda quando muda a região mais barata', () => {
  const L = r => `👑 *IPHONE 18 PRO MAX* *256GB*\n🖤 Black | ${r} | $1.390`;
  const id = r => run(`S.se=undefined;se().usd=5;se().marg={'iPhone 18 Pro Max':500};se().it=seParse(${JSON.stringify(L(r))}).rows;S.cfg.fbank={'iphone 18 pro max|preto':['f']};seRows({pixb:true})[0].id`);
  const sv = run(`JSON.stringify([S.se,S.cfg.fbank])`);
  const a = id('LL/A'), b = id('HN/A');
  run(`[S.se,S.cfg.fbank]=JSON.parse(${JSON.stringify(sv)})`);
  assert.equal(a, b);
});
t('lê a data escrita na lista', () => {
  assert.equal(run(`seParse(${JSON.stringify(listaZap)}).date`), '2026-11-17');
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
