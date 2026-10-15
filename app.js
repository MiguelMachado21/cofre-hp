// Cofre Mágico — controle financeiro pessoal (dados salvos no próprio aparelho)
// Tipos: entrada, saida (conta) · deposito, resgate, rendimento (cofres/poupança)
'use strict';
const CHAVE = 'cofre-magico-v1';
const DIA = 864e5;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const TIPOS = {
  entrada:    { nome: 'Entrada', ic: '↑', sinal: '+', feito: 'Já recebi',  pend: 'a receber', acao: 'Marcar recebido', dica: '' },
  saida:      { nome: 'Saída',   ic: '↓', sinal: '−', feito: 'Já paguei',  pend: 'a pagar',   acao: 'Marcar pago',     dica: '' },
  deposito:   { nome: 'Guardar', ic: '◆', sinal: '→', feito: 'Já guardei', pend: 'a guardar', acao: 'Marcar guardado', dica: 'Sai da conta e entra no cofre. Não conta como gasto.' },
  resgate:    { nome: 'Retirar', ic: '◇', sinal: '←', feito: 'Já retirei', pend: 'a retirar', acao: 'Marcar retirado', dica: 'Sai do cofre e volta para a conta. Não conta como ganho.' },
  rendimento: { nome: 'Rendeu',  ic: '✦', sinal: '+', feito: 'Já rendeu',  pend: 'previsto',  acao: 'Confirmar',       dica: 'Juros ou rendimento do cofre. Só aumenta a poupança.' },
};
const GRUPOS = { conta: ['entrada', 'saida'], cofre: ['deposito', 'resgate', 'rendimento'] };
const ehCofre = t => GRUPOS.cofre.includes(t);

// ---------- Utilidades ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const fmt = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pad = n => String(n).padStart(2, '0');
const chaveMes = (a, m) => `${a}-${pad(m + 1)}`;                // m = 0..11
const dataStr = d => `${chaveMes(d.getFullYear(), d.getMonth())}-${pad(d.getDate())}`;
const hojeStr = () => dataStr(new Date());
const fimDoMes = (a, m) => `${chaveMes(a, m)}-31`;               // comparação de texto
const ultimoDia = (a, m) => new Date(a, m + 1, 0).getDate();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nomeMes = (a, m, curto) => new Date(a, m, 1).toLocaleDateString('pt-BR', curto ? { month: 'short' } : { month: 'long', year: 'numeric' }).replace('.', '');
const mesDe = s => { const [a, m] = s.split('-').map(Number); return { a, m: m - 1 }; };
const somaMes = ({ a, m }, n) => { const d = new Date(a, m + n, 1); return { a: d.getFullYear(), m: d.getMonth() }; };
const cmpMes = (x, y) => (x.a - y.a) * 12 + (x.m - y.m);

function parseValor(s) {
  s = String(s ?? '').trim().replace(/[R$\s]/g, '');
  if (!s || s.startsWith('-')) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "3.000" = três mil
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(parseFloat(s) * 100);
  return n > 0 && n < 1e13 ? n : null;
}
const valorCampo = c => c ? (c / 100).toFixed(2).replace('.', ',') : '';

// ---------- Dados ----------
function novoBanco() {
  return { versao: 2, lanc: [], conta: { inicial: 0 }, cofres: [{ id: 'principal', nome: 'Reserva', inicial: 0, meta: 0 }],
    fixas: [], fixasGeradas: {}, limites: {}, backup: { ultimo: 0, adiado: 0 }, criadoEm: Date.now() };
}
function migrar(d) {
  if (!d || !Array.isArray(d.lanc)) return novoBanco();
  const b = { ...novoBanco(), ...d };
  if (d.cofre && !d.cofres) {           // versão anterior: um cofre só
    b.cofres = [{ id: 'principal', nome: d.cofre.metaNome || 'Reserva', inicial: d.cofre.inicial || 0, meta: d.cofre.metaValor || 0 }];
  }
  if (!Array.isArray(b.cofres) || !b.cofres.length) b.cofres = novoBanco().cofres;
  delete b.cofre; delete b.casa;
  b.conta = { inicial: 0, ...(b.conta || {}) };
  b.fixas = Array.isArray(b.fixas) ? b.fixas : [];
  b.fixasGeradas = b.fixasGeradas || {};
  b.limites = b.limites || {};
  b.backup = { ultimo: 0, adiado: 0, ...(b.backup || {}) };
  b.criadoEm = b.criadoEm || Date.now();
  const ids = new Set(b.cofres.map(c => c.id));
  b.lanc = b.lanc.filter(l => l && TIPOS[l.tipo] && /^\d{4}-\d{2}-\d{2}$/.test(l.data) && l.valor > 0);
  b.lanc.forEach(l => {
    if (!l.id) l.id = uid();
    if (ehCofre(l.tipo) && !ids.has(l.cofreId)) l.cofreId = b.cofres[0].id;
  });
  b.versao = 2;
  return b;
}
function carregar() {
  let bruto = null;
  try { bruto = localStorage.getItem(CHAVE); } catch { return novoBanco(); }
  if (!bruto) return novoBanco();
  try {
    const d = migrar(JSON.parse(bruto));
    if (JSON.parse(bruto).versao !== 2) { try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch {} }
    return d;
  } catch {
    // dados ilegíveis: guarda uma cópia antes de recomeçar, para não perder nada
    try { localStorage.setItem(CHAVE + '-corrompido-' + Date.now(), bruto); } catch {}
    return novoBanco();
  }
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(dados)); return true; }
  catch { toast('Não foi possível salvar neste aparelho'); return false; }
}

let dados = carregar();
let mesAtual = (() => { const d = new Date(); return { a: d.getFullYear(), m: d.getMonth() }; })();
let filtro = 'todos';
let aba = 'lista';
let editandoId = null;

const doMes = (a, m) => dados.lanc.filter(l => l.data.startsWith(chaveMes(a, m)));
const cofrePorId = id => dados.cofres.find(c => c.id === id);
const nomeCofre = id => (cofrePorId(id) || {}).nome || 'Cofre';

function totais(lista) {
  const t = {};
  for (const k in TIPOS) t[k] = { r: 0, p: 0 };
  for (const l of lista) t[l.tipo][l.feito ? 'r' : 'p'] += l.valor;
  return t;
}
// Saldo de um cofre (ou de todos) até uma data, só o que já aconteceu
function totalCofre(id, ate, ignorarId) {
  let s = dados.cofres.filter(c => !id || c.id === id).reduce((x, c) => x + (c.inicial || 0), 0);
  for (const l of dados.lanc) {
    if (!l.feito || !ehCofre(l.tipo) || l.id === ignorarId || (id && l.cofreId !== id) || (ate && l.data > ate)) continue;
    s += l.tipo === 'resgate' ? -l.valor : l.valor;
  }
  return s;
}
function saldoConta(ate) {
  let s = dados.conta.inicial || 0;
  for (const l of dados.lanc) {
    if (!l.feito || l.data > ate) continue;
    if (l.tipo === 'entrada' || l.tipo === 'resgate') s += l.valor;
    if (l.tipo === 'saida' || l.tipo === 'deposito') s -= l.valor;
  }
  return s;
}

// ---------- Contas fixas ----------
function instanciaFixa(f, a, m, feito) {
  const data = `${chaveMes(a, m)}-${pad(Math.min(f.dia, ultimoDia(a, m)))}`;
  const l = { id: uid(), criado: Date.now(), tipo: f.tipo, valor: f.valor, desc: f.desc, cat: ehCofre(f.tipo) ? '' : (f.cat || ''), data, feito: !!feito, fixaId: f.id };
  if (ehCofre(f.tipo)) l.cofreId = f.cofreId;
  dados.lanc.push(l);
  dados.fixasGeradas[`${f.id}|${chaveMes(a, m)}`] = 1;
  return l;
}
function gerarFixas() {
  const hoje = new Date();
  const mh = { a: hoje.getFullYear(), m: hoje.getMonth() };
  let limite = cmpMes(mesAtual, mh) > 0 ? mesAtual : mh;
  if (cmpMes(limite, somaMes(mh, 12)) > 0) limite = somaMes(mh, 12);
  let mudou = false;
  for (const f of dados.fixas) {
    for (let p = mesDe(f.inicio); cmpMes(p, limite) <= 0; p = somaMes(p, 1)) {
      if (dados.fixasGeradas[`${f.id}|${chaveMes(p.a, p.m)}`]) continue;
      instanciaFixa(f, p.a, p.m, false); mudou = true;
    }
  }
  if (mudou) salvar();
}
const inicioMesHoje = () => { const h = new Date(); return `${chaveMes(h.getFullYear(), h.getMonth())}-01`; };

// ---------- Render ----------
function render() {
  gerarFixas();
  const { a, m } = mesAtual;
  const nm = nomeMes(a, m);
  $('#mesTitulo').textContent = nm[0].toUpperCase() + nm.slice(1);
  const lista = doMes(a, m);
  const t = totais(lista);
  renderAviso();

  if (aba === 'lista') renderResumo(lista, t);
  if (aba === 'cofre') renderCofre(lista, t);
  if (aba === 'graficos') renderGraficos();
  if (aba === 'ajustes') renderAjustes();
}

function renderResumo(lista, t) {
  const { a, m } = mesAtual;
  const h = new Date();
  const atual = a === h.getFullYear() && m === h.getMonth();
  const conta = saldoConta(atual ? hojeStr() : fimDoMes(a, m));
  $('#saldoConta').textContent = fmt(conta);
  $('#saldoConta').classList.toggle('neg', conta < 0);
  $('#saldoConta').previousSibling.textContent = atual ? 'Saldo em conta hoje ' : `Saldo em conta no fim de ${nomeMes(a, m, true)} `;

  const real = t.entrada.r - t.saida.r - t.deposito.r + t.resgate.r;
  const prev = real + t.entrada.p - t.saida.p - t.deposito.p + t.resgate.p;
  $('#saldoReal').textContent = fmt(real);
  $('#saldoReal').classList.toggle('neg', real < 0);
  $('#saldoPrev').textContent = fmt(prev);
  $('#entReal').textContent = fmt(t.entrada.r);
  $('#entPrev').textContent = fmt(t.entrada.p);
  $('#saiReal').textContent = fmt(t.saida.r);
  $('#saiPrev').textContent = fmt(t.saida.p);
  const liq = t.deposito.r - t.resgate.r;
  $('#linhaGuardado').hidden = !t.deposito.r && !t.resgate.r;
  $('#linhaGuardado').textContent = liq >= 0 ? `◆ ${fmt(liq)} foram para os cofres neste mês` : `◇ ${fmt(-liq)} voltaram dos cofres para a conta neste mês`;

  const st = statusLimites(lista);
  const passou = st.filter(s => s.pct > 100), perto = st.filter(s => s.pct >= 80 && s.pct <= 100);
  const el = $('#linhaLimite');
  el.hidden = !passou.length && !perto.length;
  el.classList.toggle('ruim', passou.length > 0);
  el.textContent = passou.length
    ? `⚠ Passou do limite: ${passou.map(s => s.cat).join(', ')}`
    : `Perto do limite: ${perto.map(s => `${s.cat} (${Math.floor(s.pct)}%)`).join(', ')}`;

  renderLista(lista);
}

function itemLi(x, comAno) {
  const T = TIPOS[x.tipo];
  const li = document.createElement('li');
  li.className = `item ${x.tipo} ${x.feito ? '' : 'previsto'}`;
  const [aa, mm, dd] = x.data.split('-');
  const extra = ehCofre(x.tipo) ? nomeCofre(x.cofreId) : x.cat;
  li.innerHTML = `
    <div class="ic">${T.ic}</div>
    <div class="txt"><b>${esc(x.desc)}</b><small>${dd}/${mm}${comAno ? '/' + aa.slice(2) : ''}${extra ? ' · ' + esc(extra) : ''}</small>${x.fixaId ? '<span class="tag fixa">fixa</span>' : ''}${x.feito ? '' : `<span class="tag">${T.pend}</span>`}</div>
    <div class="val">${T.sinal} ${fmt(x.valor)}${x.feito ? '' : `<button class="toggle" type="button">${T.acao}</button>`}</div>`;
  li.addEventListener('click', e => {
    if (e.target.classList.contains('toggle')) {
      if (x.tipo === 'resgate') {
        const disp = totalCofre(x.cofreId, x.data, x.id);
        if (x.valor > disp) { toast(`${nomeCofre(x.cofreId)} tem só ${fmt(disp)} nessa data`); return; }
      }
      x.feito = true; salvar(); render(); toast('Feito!'); return;
    }
    abrirForm(x);
  });
  return li;
}
const ordena = l => l.sort((x, y) => y.data.localeCompare(x.data) || (y.criado || 0) - (x.criado || 0));

function aplicaFiltro(l) {
  if (filtro === 'entrada') return l.filter(x => x.tipo === 'entrada' || x.tipo === 'resgate');
  if (filtro === 'saida') return l.filter(x => x.tipo === 'saida' || x.tipo === 'deposito');
  if (filtro === 'previsto') return l.filter(x => !x.feito);
  if (filtro === 'fixa') return l.filter(x => x.fixaId);
  return l;
}

function renderLista(lista) {
  const q = norm($('#busca').value);
  let l;
  if (q) {
    l = dados.lanc.filter(x => norm(x.desc).includes(q) || norm(x.cat).includes(q) || (ehCofre(x.tipo) && norm(nomeCofre(x.cofreId)).includes(q)));
  } else {
    l = lista.filter(x => x.tipo !== 'rendimento');
  }
  l = aplicaFiltro(l);
  const ul = $('#lista'); ul.innerHTML = '';
  ordena(l).forEach(x => ul.appendChild(itemLi(x, !!q)));
  $('#buscaInfo').hidden = !q;
  if (q) {
    const e = l.filter(x => x.tipo === 'entrada').reduce((s, x) => s + x.valor, 0);
    const s = l.filter(x => x.tipo === 'saida').reduce((s, x) => s + x.valor, 0);
    $('#buscaInfo').textContent = `${l.length} resultado${l.length === 1 ? '' : 's'} em todos os meses` + (e ? ` · entradas ${fmt(e)}` : '') + (s ? ` · saídas ${fmt(s)}` : '');
  }
  $('#vazio').hidden = l.length > 0;
  $('#vazio').innerHTML = q ? 'Nada encontrado.' : 'Nenhum lançamento neste mês.<br>Toque na varinha para adicionar.';
}

function barraHtml(nome, sub, pct, classe) {
  return `<div class="top"><span>${esc(nome)}</span><small>${sub}</small></div><div class="trilho"><div class="enche ${classe || ''}" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>`;
}

function renderCofre(lista, t) {
  const { a, m } = mesAtual;
  const ate = fimDoMes(a, m);
  $('#pTotal').textContent = fmt(totalCofre(null, ate));
  $('#pDep').textContent = fmt(t.deposito.r);
  $('#pRen').textContent = fmt(t.rendimento.r);
  $('#pRes').textContent = fmt(t.resgate.r);
  const liq = t.deposito.r + t.rendimento.r - t.resgate.r;
  const pend = t.deposito.p - t.resgate.p + t.rendimento.p;
  $('#pMesTxt').innerHTML = `Neste mês: <strong>${liq >= 0 ? '+' : '−'} ${fmt(Math.abs(liq))}</strong>${pend ? ` · previsto ${pend >= 0 ? '+' : '−'} ${fmt(Math.abs(pend))}` : ''}`;

  const box = $('#cofres'); box.innerHTML = '';
  dados.cofres.forEach(c => {
    const tot = totalCofre(c.id, ate);
    const d = document.createElement('div');
    d.className = 'cofre-card';
    let html = `<div class="top"><b>${esc(c.nome)}</b><span class="v">${fmt(tot)}</span></div>`;
    if (c.meta) {
      const pct = tot / c.meta * 100;
      html += `<div class="trilho"><div class="enche" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>
        <small>${tot >= c.meta ? 'Meta alcançada! ✦' : `${Math.floor(Math.max(0, pct))}% · faltam ${fmt(c.meta - tot)} de ${fmt(c.meta)}`}</small>`;
    } else html += '<small>Sem meta definida</small>';
    d.innerHTML = html;
    d.addEventListener('click', () => editarCofre(c));
    box.appendChild(d);
  });

  // Evolução: 12 meses até o mês escolhido
  const pts = [];
  for (let i = 11; i >= 0; i--) {
    const p = somaMes(mesAtual, -i);
    pts.push({ rot: nomeMes(p.a, p.m, true), v: totalCofre(null, fimDoMes(p.a, p.m)) });
  }
  const max = Math.max(1, ...pts.map(p => p.v)), min = Math.min(0, ...pts.map(p => p.v));
  const W = 320, H = 166, top = 30, base = 134, x = i => 14 + i * (W - 28) / 11, y = v => base - (v - min) / (max - min || 1) * (base - top);
  const linha = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução do total guardado nos últimos 12 meses">
    <defs><linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ff0b3" stop-opacity=".35"/><stop offset="1" stop-color="#7ff0b3" stop-opacity="0"/></linearGradient></defs>
    <line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="#c9d1d633"/>
    <path d="${linha} L${x(11)} ${base} L${x(0)} ${base}Z" fill="url(#gArea)"/>
    <path d="${linha}" fill="none" stroke="#c9d1d6" stroke-width="2.2" stroke-linejoin="round"/>`;
  pts.forEach((p, i) => {
    svg += `<circle cx="${x(i)}" cy="${y(p.v)}" r="${i === 11 ? 4 : 2.5}" fill="${i === 11 ? '#7ff0b3' : '#c9d1d6'}"><title>${p.rot}: ${fmt(p.v)}</title></circle>`;
    if (i % 2 === 1 || i === 11) svg += `<text x="${x(i)}" y="${base + 18}" text-anchor="middle" font-size="11" fill="#9fb3a8" font-family="Cinzel" font-weight="${i === 11 ? 700 : 400}">${p.rot}</text>`;
  });
  svg += `<text x="${x(11)}" y="${y(pts[11].v) - 9}" text-anchor="end" font-size="11" fill="#eef2f4" font-family="Cinzel">${fmt(pts[11].v)}</text></svg>`;
  $('#grafCofre').innerHTML = svg;

  const l = ordena(lista.filter(x => ehCofre(x.tipo)));
  const ul = $('#listaCofre'); ul.innerHTML = '';
  $('#vazioCofre').hidden = l.length > 0;
  l.forEach(x => ul.appendChild(itemLi(x)));
}

// Limites por categoria (comparação sem acento/maiúsculas)
function statusLimites(lista) {
  const out = [];
  for (const [cat, lim] of Object.entries(dados.limites)) {
    if (!lim) continue;
    const gasto = lista.filter(l => l.tipo === 'saida' && norm(l.cat) === norm(cat)).reduce((s, l) => s + l.valor, 0);
    out.push({ cat, lim, gasto, pct: gasto / lim * 100 });
  }
  return out;
}

function renderGraficos() {
  const meses = [];
  for (let i = -3; i <= 2; i++) {
    const p = somaMes(mesAtual, i);
    const t = totais(doMes(p.a, p.m));
    meses.push({ atual: i === 0, rot: nomeMes(p.a, p.m, true),
      ent: t.entrada.r + t.entrada.p, sai: t.saida.r + t.saida.p, dep: Math.max(0, t.deposito.r + t.deposito.p - t.resgate.r - t.resgate.p) });
  }
  const max = Math.max(1, ...meses.flatMap(x => [x.ent, x.sai, x.dep]));
  const W = 320, H = 180, base = 150, col = W / 6, bw = 12;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entradas, saídas e valores guardados em 6 meses">`;
  svg += `<line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="#c9d1d633"/>`;
  meses.forEach((x, i) => {
    const cx = i * col + col / 2;
    [[x.ent, 'var(--in)', 'Entradas'], [x.sai, 'var(--out)', 'Saídas'], [x.dep, 'var(--dep)', 'Guardado']].forEach(([v, cor, nome], k) => {
      const h = (v / max) * 130;
      svg += `<rect x="${cx - bw * 1.5 - 1 + k * (bw + 1)}" y="${base - h}" width="${bw}" height="${h}" rx="3" fill="${cor}"><title>${nome}: ${fmt(v)}</title></rect>`;
    });
    svg += `<text x="${cx}" y="${base + 18}" text-anchor="middle" font-size="12" fill="${x.atual ? '#eef2f4' : '#9fb3a8'}" font-weight="${x.atual ? 700 : 400}" font-family="Cinzel">${x.rot}</text>`;
  });
  $('#grafMeses').innerHTML = svg + '</svg>';

  const lista = doMes(mesAtual.a, mesAtual.m);
  barrasCat('#grafCat', lista.filter(l => l.tipo === 'saida'), true);
  barrasCat('#grafCatIn', lista.filter(l => l.tipo === 'entrada'), false);
}

function barrasCat(sel, lista, comLimite) {
  const el = $(sel);
  const soma = {}, rot = {};
  lista.forEach(l => { const c = l.cat || 'Sem categoria', k = norm(c); rot[k] = rot[k] || c; soma[k] = (soma[k] || 0) + l.valor; });
  const ord = Object.entries(soma).map(([k, v]) => [rot[k], v]).sort((a, b) => b[1] - a[1]);
  if (!ord.length) { el.innerHTML = '<p class="sub"><i>Nada neste mês.</i></p>'; return; }
  const total = ord.reduce((s, x) => s + x[1], 0);
  const limites = {};
  if (comLimite) for (const [c, v] of Object.entries(dados.limites)) limites[norm(c)] = v;
  el.innerHTML = ord.map(([c, v]) => {
    const lim = limites[norm(c)];
    if (lim) {
      const pct = v / lim * 100;
      return `<div class="barra">${barraHtml(c, `${fmt(v)} de ${fmt(lim)}`, pct, pct > 100 ? 'passou' : pct >= 80 ? 'perto' : '')}</div>`;
    }
    return `<div class="barra">${barraHtml(c, `${fmt(v)} · ${Math.round(v / total * 100)}%`, v / ord[0][1] * 100)}</div>`;
  }).join('');
}

// ---------- Aviso de backup ----------
function renderAviso() {
  const agora = Date.now();
  const ref = dados.backup.ultimo || dados.criadoEm;
  $('#avisoBackup').hidden = !(dados.lanc.length && agora - ref > 30 * DIA && agora > (dados.backup.adiado || 0));
}
$('#avisoBaixar').addEventListener('click', fazerBackup);
$('#avisoDepois').addEventListener('click', () => { dados.backup.adiado = Date.now() + 7 * DIA; salvar(); renderAviso(); });

// ---------- Formulário de lançamento ----------
const tipoSel = () => (document.querySelector('input[name=tipo]:checked') || {}).value;

function montaTipos(grupo, marcado) {
  $('#tipos').innerHTML = GRUPOS[grupo].map(k =>
    `<label><input type="radio" name="tipo" value="${k}" ${k === marcado ? 'checked' : ''}><span>${TIPOS[k].nome}</span></label>`).join('');
  $$('input[name=tipo]').forEach(r => r.addEventListener('change', atualizaTipo));
}
function atualizaTipo() {
  const t = tipoSel();
  $('#fFeitoTxt').textContent = TIPOS[t].feito;
  $('#dicaTipo').textContent = TIPOS[t].dica;
  $('#campoCat').hidden = ehCofre(t);
  $('#campoCofre').hidden = !ehCofre(t);
  $('#fDesc').placeholder = ehCofre(t) ? 'Ex.: Guardar do salário' : 'Ex.: Salário, Aluguel…';
  $('#campoFixa').hidden = !!editandoId || t === 'resgate' || t === 'rendimento';
}
function atualizaCats() {
  const cats = [...new Set(dados.lanc.filter(x => x.cat).map(x => x.cat))].sort((a, b) => a.localeCompare(b));
  $('#cats').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
}
// "mercado" vira "Mercado" se já existir assim
function catExistente(c) {
  if (!c) return '';
  const achada = dados.lanc.find(l => l.cat && norm(l.cat) === norm(c)) || null;
  return achada ? achada.cat : c;
}
function erroCampo(input, msg) {
  const lab = input.closest('label');
  lab.querySelectorAll('.erro').forEach(e => e.remove());
  input.classList.toggle('invalido', !!msg);
  if (msg) { const s = document.createElement('span'); s.className = 'erro'; s.textContent = msg; lab.appendChild(s); }
}

function abrirForm(l, grupo) {
  editandoId = l ? l.id : null;
  grupo = l ? (ehCofre(l.tipo) ? 'cofre' : 'conta') : grupo;
  $('#formTitulo').textContent = l ? 'Editar' : (grupo === 'cofre' ? 'Movimentar cofre' : 'Novo lançamento');
  montaTipos(grupo, l ? l.tipo : GRUPOS[grupo][0]);
  $('#fCofre').innerHTML = dados.cofres.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
  $('#fCofre').value = l && l.cofreId ? l.cofreId : dados.cofres[0].id;
  $('#fValor').value = l ? valorCampo(l.valor) : '';
  $('#fDesc').value = l ? l.desc : '';
  $('#fCat').value = l ? (l.cat || '') : '';
  const h = new Date();
  $('#fData').value = l ? l.data : (mesAtual.a === h.getFullYear() && mesAtual.m === h.getMonth() ? hojeStr() : `${chaveMes(mesAtual.a, mesAtual.m)}-01`);
  $('#fFeito').checked = l ? l.feito : true;
  $('#fFixa').checked = false;
  $('#dicaFixa').hidden = !(l && l.fixaId);
  $('#excluir').hidden = !l;
  erroCampo($('#fValor')); erroCampo($('#fData'));
  atualizaCats();
  atualizaTipo();
  $('#modal').showModal();
  if (!l) $('#fValor').focus(); // foco imediato (sem atraso que roube o foco de outro campo)
}

$('#form').addEventListener('submit', e => {
  e.preventDefault();
  const valor = parseValor($('#fValor').value);
  const data = $('#fData').value;
  erroCampo($('#fValor'), valor ? '' : 'Digite um valor maior que zero, ex.: 150,90');
  erroCampo($('#fData'), /^\d{4}-\d{2}-\d{2}$/.test(data) ? '' : 'Escolha uma data');
  if (!valor) { $('#fValor').focus(); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return;
  const tipo = tipoSel();
  const base = {
    tipo, valor, data,
    desc: $('#fDesc').value.trim() || TIPOS[tipo].nome,
    cat: ehCofre(tipo) ? '' : catExistente($('#fCat').value.trim()),
    feito: $('#fFeito').checked,
  };
  if (ehCofre(tipo)) base.cofreId = $('#fCofre').value;
  if (tipo === 'resgate' && base.feito) {
    const disp = totalCofre(base.cofreId, data, editandoId);
    if (valor > disp) { erroCampo($('#fValor'), `${nomeCofre(base.cofreId)} tem só ${fmt(disp)} nessa data`); return; }
  }
  if (editandoId) {
    const l = dados.lanc.find(x => x.id === editandoId);
    Object.assign(l, base);
    if (!ehCofre(tipo)) delete l.cofreId;
    toast('Atualizado');
  } else if ($('#fFixa').checked && !$('#campoFixa').hidden) {
    const [a, m, d] = data.split('-').map(Number);
    const f = { id: uid(), tipo, valor, desc: base.desc, cat: base.cat, cofreId: base.cofreId, dia: d, inicio: chaveMes(a, m - 1) };
    dados.fixas.push(f);
    instanciaFixa(f, a, m - 1, base.feito);
    toast('Conta fixa criada ✦');
  } else {
    dados.lanc.push({ ...base, id: uid(), criado: Date.now() });
    toast('Adicionado ✦');
  }
  salvar();
  $('#modal').close();
  mesAtual = mesDe(data);
  render();
});

$('#excluir').addEventListener('click', () => {
  const l = dados.lanc.find(x => x.id === editandoId);
  const msg = l && l.fixaId ? 'Excluir só este mês desta conta fixa?' : 'Excluir este lançamento?';
  if (!confirm(msg)) return;
  dados.lanc = dados.lanc.filter(x => x.id !== editandoId);
  salvar(); $('#modal').close(); render(); toast('Excluído');
});
$('#cancelar').addEventListener('click', () => $('#modal').close());
$('#fab').addEventListener('click', () => abrirForm(null, aba === 'cofre' ? 'cofre' : 'conta'));
// fechar tocando fora
['#modal', '#dlg'].forEach(s => $(s).addEventListener('click', e => { if (e.target === $(s)) $(s).close(); }));

// ---------- Formulário genérico ----------
let dlgCfg = null;
function abrirDlg(cfg) {
  dlgCfg = cfg;
  $('#dlgTitulo').textContent = cfg.titulo;
  $('#dlgCampos').innerHTML = cfg.campos.map(c => {
    const v = cfg.valores[c.id] ?? '';
    let inp;
    if (c.tipo === 'select') inp = `<select id="d_${c.id}">${c.opcoes.map(([k, n]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    else inp = `<input id="d_${c.id}" value="${esc(c.tipo === 'valor' ? valorCampo(v) : v)}" ${c.tipo === 'valor' ? 'inputmode="decimal"' : c.tipo === 'dia' ? 'inputmode="numeric"' : ''} ${c.lista ? `list="${c.lista}"` : ''} placeholder="${esc(c.ph || '')}" maxlength="${c.max || 40}" autocomplete="off">`;
    return `<label class="campo" data-campo="${c.id}">${esc(c.label)}${inp}</label>`;
  }).join('');
  $('#dlgExcluir').hidden = !cfg.onDelete;
  $('#dlgExcluir').textContent = cfg.textoExcluir || 'Excluir';
  $$('#dlgCampos select').forEach(s => s.addEventListener('change', visDlg));
  atualizaCats();
  visDlg();
  $('#dlg').showModal();
}
function lerDlg() {
  const v = {};
  dlgCfg.campos.forEach(c => { v[c.id] = $('#d_' + c.id).value.trim(); });
  return v;
}
function visDlg() {
  const v = lerDlg();
  dlgCfg.campos.forEach(c => { if (c.se) $(`[data-campo="${c.id}"]`).hidden = !c.se(v); });
}
$('#dlgForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = lerDlg();
  $$('#dlgCampos .erro').forEach(x => x.remove());
  $$('#dlgCampos .invalido').forEach(x => x.classList.remove('invalido'));
  const r = dlgCfg.onSave(v);
  if (r && r.campo) { erroCampo($('#d_' + r.campo), r.msg); return; }
  salvar(); $('#dlg').close(); render();
});
$('#dlgCancelar').addEventListener('click', () => $('#dlg').close());
$('#dlgExcluir').addEventListener('click', () => { if (dlgCfg.onDelete() !== false) { salvar(); $('#dlg').close(); render(); } });

// Cofres
function editarCofre(c) {
  abrirDlg({
    titulo: c ? 'Editar cofre' : 'Novo cofre',
    valores: c ? { nome: c.nome, inicial: c.inicial, meta: c.meta } : {},
    campos: [
      { id: 'nome', label: 'Nome', ph: 'Ex.: Reserva, Viagem, Carro', max: 30 },
      { id: 'inicial', label: 'Quanto já tinha nele antes do app', tipo: 'valor', ph: '0,00' },
      { id: 'meta', label: 'Meta (opcional)', tipo: 'valor', ph: '0,00' },
    ],
    onSave: v => {
      if (!v.nome) return { campo: 'nome', msg: 'Dê um nome ao cofre' };
      if (dados.cofres.some(x => x !== c && norm(x.nome) === norm(v.nome))) return { campo: 'nome', msg: 'Já existe um cofre com esse nome' };
      for (const k of ['inicial', 'meta']) if (v[k] && !parseValor(v[k])) return { campo: k, msg: 'Valor inválido' };
      const novo = { nome: v.nome, inicial: parseValor(v.inicial) || 0, meta: parseValor(v.meta) || 0 };
      if (c) Object.assign(c, novo); else dados.cofres.push({ id: uid(), ...novo });
      toast('Cofre salvo');
    },
    onDelete: c && (() => {
      if (dados.cofres.length === 1) { toast('Você precisa ter pelo menos um cofre'); return false; }
      const n = dados.lanc.filter(l => l.cofreId === c.id).length;
      if (n) { toast(`Esse cofre tem ${n} movimento${n > 1 ? 's' : ''}. Exclua-os antes.`); return false; }
      if (dados.fixas.some(f => f.cofreId === c.id)) { toast('Uma conta fixa usa esse cofre. Remova-a antes.'); return false; }
      if (!confirm(`Excluir o cofre "${c.nome}"?`)) return false;
      dados.cofres = dados.cofres.filter(x => x !== c); toast('Cofre excluído');
    }),
  });
}

// Contas fixas
function editarFixa(f) {
  abrirDlg({
    titulo: f ? 'Editar conta fixa' : 'Nova conta fixa',
    valores: f ? { tipo: f.tipo, desc: f.desc, valor: f.valor, cat: f.cat, cofre: f.cofreId, dia: String(f.dia) } : { tipo: 'saida', dia: String(new Date().getDate()) },
    campos: [
      { id: 'tipo', label: 'Tipo', tipo: 'select', opcoes: [['saida', 'Saída (conta a pagar)'], ['entrada', 'Entrada (a receber)'], ['deposito', 'Guardar no cofre']] },
      { id: 'desc', label: 'Descrição', ph: 'Ex.: Aluguel, Internet, Salário', max: 60 },
      { id: 'valor', label: 'Valor', tipo: 'valor', ph: '0,00' },
      { id: 'cat', label: 'Categoria', lista: 'cats', ph: 'Ex.: Moradia', max: 30, se: v => v.tipo !== 'deposito' },
      { id: 'cofre', label: 'Cofre', tipo: 'select', opcoes: dados.cofres.map(c => [c.id, c.nome]), se: v => v.tipo === 'deposito' },
      { id: 'dia', label: 'Dia do mês', tipo: 'dia', ph: '1 a 31', max: 2 },
    ],
    onSave: v => {
      if (!v.desc) return { campo: 'desc', msg: 'Escreva uma descrição' };
      const valor = parseValor(v.valor); if (!valor) return { campo: 'valor', msg: 'Valor inválido' };
      const dia = +v.dia; if (!(dia >= 1 && dia <= 31 && Number.isInteger(dia))) return { campo: 'dia', msg: 'Dia entre 1 e 31' };
      const novo = { tipo: v.tipo, desc: v.desc, valor, cat: v.tipo === 'deposito' ? '' : catExistente(v.cat), cofreId: v.tipo === 'deposito' ? v.cofre : undefined, dia };
      if (f) {
        Object.assign(f, novo);
        const ini = inicioMesHoje();
        dados.lanc.forEach(l => {
          if (l.fixaId !== f.id || l.feito || l.data < ini) return;
          const { a, m } = mesDe(l.data);
          Object.assign(l, { tipo: f.tipo, desc: f.desc, valor: f.valor, cat: f.cat, data: `${chaveMes(a, m)}-${pad(Math.min(dia, ultimoDia(a, m)))}` });
          if (ehCofre(f.tipo)) l.cofreId = f.cofreId; else delete l.cofreId;
        });
        toast('Conta fixa atualizada (pendentes deste mês em diante)');
      } else {
        const h = new Date();
        const nf = { id: uid(), ...novo, inicio: chaveMes(h.getFullYear(), h.getMonth()) };
        dados.fixas.push(nf);
        toast('Conta fixa criada ✦');
      }
    },
    textoExcluir: 'Parar de repetir',
    onDelete: f && (() => {
      if (!confirm('Parar de repetir esta conta? O que já foi pago continua no histórico; os pendentes deste mês em diante serão removidos.')) return false;
      const ini = inicioMesHoje();
      dados.lanc = dados.lanc.filter(l => !(l.fixaId === f.id && !l.feito && l.data >= ini));
      dados.fixas = dados.fixas.filter(x => x !== f);
      for (const k in dados.fixasGeradas) if (k.startsWith(f.id + '|')) delete dados.fixasGeradas[k];
      toast('Conta fixa removida');
    }),
  });
}

// Limites
function editarLimite(cat) {
  abrirDlg({
    titulo: cat ? 'Editar limite' : 'Novo limite',
    valores: cat ? { cat, valor: dados.limites[cat] } : {},
    campos: [
      { id: 'cat', label: 'Categoria de saída', lista: 'cats', ph: 'Ex.: Mercado', max: 30 },
      { id: 'valor', label: 'Limite por mês', tipo: 'valor', ph: '0,00' },
    ],
    onSave: v => {
      if (!v.cat) return { campo: 'cat', msg: 'Escolha a categoria' };
      const valor = parseValor(v.valor); if (!valor) return { campo: 'valor', msg: 'Valor inválido' };
      const repetida = Object.keys(dados.limites).find(k => k !== cat && norm(k) === norm(v.cat));
      if (repetida) return { campo: 'cat', msg: 'Essa categoria já tem limite' };
      if (cat) delete dados.limites[cat];
      dados.limites[v.cat] = valor;
      toast('Limite salvo');
    },
    onDelete: cat && (() => { delete dados.limites[cat]; toast('Limite removido'); }),
  });
}

// ---------- Ajustes ----------
function renderAjustes() {
  const ci = dados.conta.inicial || 0;
  if (document.activeElement !== $('#aContaInicial')) $('#aContaInicial').value = valorCampo(Math.abs(ci));
  $('#aContaNeg').checked = ci < 0;

  const fx = $('#listaFixas');
  fx.innerHTML = dados.fixas.length ? '' : '<li class="vazio">Nenhuma conta fixa ainda.</li>';
  dados.fixas.forEach(f => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${TIPOS[f.tipo].ic} ${esc(f.desc)}</span><small>dia ${f.dia} · ${fmt(f.valor)}</small>`;
    li.addEventListener('click', () => editarFixa(f));
    fx.appendChild(li);
  });

  const lm = $('#listaLimites');
  const ks = Object.keys(dados.limites).sort((a, b) => a.localeCompare(b));
  lm.innerHTML = ks.length ? '' : '<li class="vazio">Nenhum limite ainda.</li>';
  ks.forEach(k => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${esc(k)}</span><small>${fmt(dados.limites[k])} / mês</small>`;
    li.addEventListener('click', () => editarLimite(k));
    lm.appendChild(li);
  });

  const cf = $('#listaCofresAj'); cf.innerHTML = '';
  dados.cofres.forEach(c => {
    const li = document.createElement('li');
    li.innerHTML = `<span>◆ ${esc(c.nome)}</span><small>${c.meta ? 'meta ' + fmt(c.meta) : 'sem meta'}</small>`;
    li.addEventListener('click', () => editarCofre(c));
    cf.appendChild(li);
  });

  $('#ultimoBackup').textContent = dados.backup.ultimo
    ? `Último backup: ${new Date(dados.backup.ultimo).toLocaleDateString('pt-BR')}.` : 'Você ainda não fez nenhum backup.';
}
$('#salvarConta').addEventListener('click', () => {
  const raw = $('#aContaInicial').value.trim();
  const v = raw ? parseValor(raw) : 0;
  if (raw && !v) { erroCampo($('#aContaInicial'), 'Valor inválido'); return; }
  erroCampo($('#aContaInicial'));
  dados.conta.inicial = (v || 0) * ($('#aContaNeg').checked ? -1 : 1);
  salvar(); toast('Saldo da conta salvo'); render();
});
$('#novaFixa').addEventListener('click', () => editarFixa(null));
$('#novoLimite').addEventListener('click', () => editarLimite(null));
$('#novoCofre').addEventListener('click', () => editarCofre(null));

async function fazerBackup() {
  const nome = `cofre-magico-backup-${hojeStr()}.json`;
  const json = JSON.stringify(dados, null, 2);
  const arquivo = typeof File === 'function' ? new File([json], nome, { type: 'application/json' }) : null;
  try {
    // No celular, abre "Salvar em Arquivos"/compartilhar; no computador, baixa direto
    if (arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] }) && matchMedia('(pointer:coarse)').matches) {
      await navigator.share({ files: [arquivo], title: 'Backup do Cofre Mágico' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    dados.backup.ultimo = Date.now(); dados.backup.adiado = 0;
    salvar(); render(); toast('Backup feito ✦');
  } catch (e) {
    if (e && e.name !== 'AbortError') toast('Não foi possível fazer o backup');
  }
}
$('#exportar').addEventListener('click', fazerBackup);

$('#importar').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || !Array.isArray(d.lanc)) throw 0;
    if (!confirm(`Restaurar ${d.lanc.length} lançamentos? Isso substitui os dados atuais.`)) return;
    dados = migrar(d);
    dados.backup.ultimo = Date.now();
    salvar(); render(); toast('Backup restaurado');
  } catch { toast('Arquivo de backup inválido'); }
  finally { e.target.value = ''; }
});
$('#apagarTudo').addEventListener('click', () => {
  if (!confirm('Apagar TODOS os lançamentos, cofres, contas fixas e limites? Não dá para desfazer.')) return;
  dados = novoBanco(); salvar(); render(); toast('Tudo apagado');
});

// ---------- Navegação ----------
$('#mesAnt').addEventListener('click', () => { mesAtual = somaMes(mesAtual, -1); render(); });
$('#mesProx').addEventListener('click', () => { mesAtual = somaMes(mesAtual, 1); render(); });
$('#mesTitulo').addEventListener('click', () => { const h = new Date(); mesAtual = { a: h.getFullYear(), m: h.getMonth() }; render(); });

function irPara(nova) {
  aba = nova;
  $$('.aba').forEach(x => x.classList.toggle('ativa', x.dataset.aba === aba));
  ['lista', 'cofre', 'graficos', 'ajustes'].forEach(n => { $('#aba-' + n).hidden = n !== aba; });
  $('#fab').hidden = !(aba === 'lista' || aba === 'cofre');
  $('#navMes').hidden = aba === 'ajustes';
  window.scrollTo({ top: 0 });
  render();
}
$$('.aba').forEach(b => b.addEventListener('click', () => irPara(b.dataset.aba)));
$$('.chip').forEach(c => c.addEventListener('click', () => {
  filtro = c.dataset.filtro;
  $$('.chip').forEach(x => x.classList.toggle('ativo', x === c));
  render();
}));
let tBusca;
$('#busca').addEventListener('input', () => { clearTimeout(tBusca); tBusca = setTimeout(render, 150); });

let tt;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2600);
}

// Ao voltar para o app (ex.: virou o mês), atualiza
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

irPara('lista');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
