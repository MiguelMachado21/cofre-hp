// Cofre Mágico — controle financeiro pessoal (dados salvos no próprio aparelho)
// Tipos: entrada, saida (conta) · deposito, resgate, rendimento (cofre/poupança)
const CHAVE = 'cofre-magico-v1';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const TIPOS = {
  entrada:    { nome: 'Entrada',  ic: '↑', sinal: '+', feito: 'Já recebi',  pend: 'a receber', acao: 'Marcar recebido', dica: '' },
  saida:      { nome: 'Saída',    ic: '↓', sinal: '−', feito: 'Já paguei',  pend: 'a pagar',   acao: 'Marcar pago',     dica: '' },
  deposito:   { nome: 'Guardar',  ic: '◆', sinal: '→', feito: 'Já guardei', pend: 'a guardar', acao: 'Marcar guardado', dica: 'Sai da conta e entra no cofre. Não conta como gasto.' },
  resgate:    { nome: 'Retirar',  ic: '◇', sinal: '←', feito: 'Já retirei', pend: 'a retirar', acao: 'Marcar retirado', dica: 'Sai do cofre e volta para a conta. Não conta como ganho.' },
  rendimento: { nome: 'Rendeu',   ic: '✦', sinal: '+', feito: 'Já rendeu',  pend: 'previsto',  acao: 'Confirmar',       dica: 'Juros ou rendimento do cofre. Só aumenta a poupança.' },
};
const GRUPOS = { conta: ['entrada', 'saida'], cofre: ['deposito', 'resgate', 'rendimento'] };
const ehCofre = t => GRUPOS.cofre.includes(t);

let dados = carregar();
let mesAtual = (() => { const d = new Date(); return { a: d.getFullYear(), m: d.getMonth() }; })();
let filtro = 'todos';
let aba = 'lista';
let editandoId = null;

function carregar() {
  let d;
  try { d = JSON.parse(localStorage.getItem(CHAVE)); } catch {}
  d = d && Array.isArray(d.lanc) ? d : { lanc: [] };
  d.cofre = d.cofre || { inicial: 0, metaNome: '', metaValor: 0 };
  return d;
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(dados)); }
  catch { toast('Não foi possível salvar neste aparelho'); }
}

const fmt = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const chaveMes = (a, m) => `${a}-${String(m + 1).padStart(2, '0')}`;
const doMes = (a, m) => dados.lanc.filter(l => l.data.startsWith(chaveMes(a, m)));
const nomeMes = (a, m, curto) => new Date(a, m, 1).toLocaleDateString('pt-BR', curto ? { month: 'short' } : { month: 'long', year: 'numeric' }).replace('.', '');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hojeStr = () => { const h = new Date(); return `${chaveMes(h.getFullYear(), h.getMonth())}-${String(h.getDate()).padStart(2, '0')}`; };
const fimDoMes = (a, m) => `${chaveMes(a, m)}-31`;

function parseValor(s) {
  s = String(s).trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "3.000" = três mil
  const n = Math.round(parseFloat(s) * 100);
  return isFinite(n) && n > 0 ? n : null;
}
const valorCampo = c => c ? (c / 100).toFixed(2).replace('.', ',') : '';

function totais(lista) {
  const t = {};
  for (const k in TIPOS) t[k] = { r: 0, p: 0 };
  for (const l of lista) t[l.tipo][l.feito ? 'r' : 'p'] += l.valor;
  return t;
}

// Saldo do cofre até uma data (inclusive), só o que já aconteceu
function totalCofre(ate) {
  let s = dados.cofre.inicial || 0;
  for (const l of dados.lanc) {
    if (!l.feito || !ehCofre(l.tipo) || (ate && l.data > ate)) continue;
    s += l.tipo === 'resgate' ? -l.valor : l.valor;
  }
  return s;
}

// ---------- Render ----------
function render() {
  const { a, m } = mesAtual;
  const nm = nomeMes(a, m);
  $('#mesTitulo').textContent = nm[0].toUpperCase() + nm.slice(1);
  const lista = doMes(a, m);
  const t = totais(lista);

  // Conta
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
  $('#linhaGuardado').textContent = liq >= 0 ? `◆ ${fmt(liq)} foram para o cofre neste mês` : `◇ ${fmt(-liq)} saíram do cofre para a conta neste mês`;

  if (aba === 'lista') renderLista(lista);
  if (aba === 'cofre') renderCofre(lista, t);
  if (aba === 'graficos') renderGraficos();
}

function itemLi(x) {
  const T = TIPOS[x.tipo];
  const li = document.createElement('li');
  li.className = `item ${x.tipo} ${x.feito ? '' : 'previsto'}`;
  const [, mm, dd] = x.data.split('-');
  li.innerHTML = `
    <div class="ic">${T.ic}</div>
    <div class="txt"><b></b><small>${dd}/${mm}${x.cat ? ' · <span class="c"></span>' : ''}${ehCofre(x.tipo) ? ' · cofre' : ''}</small>${x.feito ? '' : `<span class="tag">${T.pend}</span>`}</div>
    <div class="val">${T.sinal} ${fmt(x.valor)}${x.feito ? '' : `<button class="toggle">${T.acao}</button>`}</div>`;
  li.querySelector('b').textContent = x.desc;
  if (x.cat) li.querySelector('.c').textContent = x.cat;
  li.addEventListener('click', e => {
    if (e.target.classList.contains('toggle')) { x.feito = true; salvar(); render(); toast('Feito!'); return; }
    abrirForm(x);
  });
  return li;
}
const ordena = l => l.sort((x, y) => y.data.localeCompare(x.data) || (y.criado || 0) - (x.criado || 0));

function renderLista(lista) {
  let l = lista.filter(x => x.tipo !== 'rendimento');
  if (filtro === 'entrada') l = l.filter(x => x.tipo === 'entrada' || x.tipo === 'resgate');
  if (filtro === 'saida') l = l.filter(x => x.tipo === 'saida' || x.tipo === 'deposito');
  if (filtro === 'previsto') l = l.filter(x => !x.feito);
  const ul = $('#lista'); ul.innerHTML = '';
  $('#vazio').hidden = l.length > 0;
  ordena(l).forEach(x => ul.appendChild(itemLi(x)));
}

function renderCofre(lista, t) {
  const { a, m } = mesAtual;
  const total = totalCofre(fimDoMes(a, m));
  $('#pTotal').textContent = fmt(total);
  $('#pDep').textContent = fmt(t.deposito.r);
  $('#pRen').textContent = fmt(t.rendimento.r);
  $('#pRes').textContent = fmt(t.resgate.r);
  const liq = t.deposito.r + t.rendimento.r - t.resgate.r;
  const pend = t.deposito.p - t.resgate.p + t.rendimento.p;
  $('#pMesTxt').innerHTML = `Neste mês: <strong>${liq >= 0 ? '+' : '−'} ${fmt(Math.abs(liq))}</strong>${pend ? ` · previsto ${pend >= 0 ? '+' : '−'} ${fmt(Math.abs(pend))}` : ''}`;

  const meta = dados.cofre.metaValor;
  $('#metaBox').hidden = !meta;
  if (meta) {
    const pct = Math.max(0, Math.min(100, total / meta * 100));
    $('#metaNome').textContent = dados.cofre.metaNome || 'Meta';
    $('#metaPct').textContent = `${Math.floor(pct)}%`;
    $('#metaBarra').style.width = pct + '%';
    $('#metaFalta').textContent = total >= meta ? 'Meta alcançada! ✦' : `Faltam ${fmt(meta - total)} de ${fmt(meta)}`;
  }

  // Evolução: 12 meses até o mês escolhido
  const pts = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(a, m - i, 1);
    pts.push({ rot: nomeMes(d.getFullYear(), d.getMonth(), true), v: totalCofre(fimDoMes(d.getFullYear(), d.getMonth())) });
  }
  const max = Math.max(1, ...pts.map(p => p.v)), min = Math.min(0, ...pts.map(p => p.v));
  const W = 320, H = 166, top = 30, base = 134, x = i => 14 + i * (W - 28) / 11, y = v => base - (v - min) / (max - min) * (base - top);
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

function renderGraficos() {
  const meses = [];
  for (let i = -3; i <= 2; i++) {
    const d = new Date(mesAtual.a, mesAtual.m + i, 1);
    const t = totais(doMes(d.getFullYear(), d.getMonth()));
    meses.push({ atual: i === 0, rot: nomeMes(d.getFullYear(), d.getMonth(), true),
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
  barrasCat('#grafCat', lista.filter(l => l.tipo === 'saida'));
  barrasCat('#grafCatIn', lista.filter(l => l.tipo === 'entrada'));
}

function barrasCat(sel, lista) {
  const el = $(sel);
  const soma = {};
  lista.forEach(l => { const c = l.cat || 'Sem categoria'; soma[c] = (soma[c] || 0) + l.valor; });
  const ord = Object.entries(soma).sort((a, b) => b[1] - a[1]);
  if (!ord.length) { el.innerHTML = '<p class="sub"><i>Nada neste mês.</i></p>'; return; }
  const total = ord.reduce((s, x) => s + x[1], 0);
  el.innerHTML = '';
  ord.forEach(([c, v]) => {
    const d = document.createElement('div');
    d.className = 'barra';
    d.innerHTML = `<div class="top"><span></span><span>${fmt(v)} · ${Math.round(v / total * 100)}%</span></div><div class="trilho"><div class="enche" style="width:${v / ord[0][1] * 100}%"></div></div>`;
    d.querySelector('span').textContent = c;
    el.appendChild(d);
  });
}

// ---------- Formulário ----------
const tipoSel = () => document.querySelector('input[name=tipo]:checked').value;

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
  $('#fDesc').placeholder = ehCofre(t) ? 'Ex.: Reserva, Viagem…' : 'Ex.: Salário, Aluguel…';
}

function abrirForm(l, grupo) {
  editandoId = l ? l.id : null;
  grupo = l ? (ehCofre(l.tipo) ? 'cofre' : 'conta') : grupo;
  $('#formTitulo').textContent = l ? 'Editar' : (grupo === 'cofre' ? 'Movimentar o cofre' : 'Novo lançamento');
  montaTipos(grupo, l ? l.tipo : GRUPOS[grupo][0]);
  $('#fValor').value = l ? valorCampo(l.valor) : '';
  $('#fDesc').value = l ? l.desc : '';
  $('#fCat').value = l ? (l.cat || '') : '';
  const h = new Date();
  $('#fData').value = l ? l.data : (mesAtual.a === h.getFullYear() && mesAtual.m === h.getMonth() ? hojeStr() : `${chaveMes(mesAtual.a, mesAtual.m)}-01`);
  $('#fFeito').checked = l ? l.feito : true;
  $('#fRepetir').value = '0';
  $('#campoRepetir').hidden = !!l;
  $('#excluir').hidden = !l;
  const cats = [...new Set(dados.lanc.map(x => x.cat).filter(Boolean))].sort();
  $('#cats').innerHTML = cats.map(c => `<option value="${c.replace(/"/g, '&quot;')}">`).join('');
  atualizaTipo();
  $('#modal').showModal();
  if (!l) setTimeout(() => $('#fValor').focus(), 50);
}

$('#form').addEventListener('submit', e => {
  e.preventDefault();
  const valor = parseValor($('#fValor').value);
  if (!valor) { toast('Valor inválido'); $('#fValor').focus(); return; }
  const tipo = tipoSel();
  const base = {
    tipo, valor,
    desc: $('#fDesc').value.trim() || TIPOS[tipo].nome,
    cat: ehCofre(tipo) ? '' : $('#fCat').value.trim(),
    data: $('#fData').value,
    feito: $('#fFeito').checked,
  };
  if (editandoId) {
    Object.assign(dados.lanc.find(x => x.id === editandoId), base);
    toast('Atualizado');
  } else {
    const rep = +$('#fRepetir').value || 1;
    const [a, m, d] = base.data.split('-').map(Number);
    for (let i = 0; i < rep; i++) {
      const ult = new Date(a, m - 1 + i + 1, 0).getDate();
      const dt = new Date(a, m - 1 + i, Math.min(d, ult));
      const data = `${chaveMes(dt.getFullYear(), dt.getMonth())}-${String(dt.getDate()).padStart(2, '0')}`;
      dados.lanc.push({ ...base, id: uid(), criado: Date.now() + i, data, feito: i === 0 ? base.feito : false });
    }
    toast(rep > 1 ? `Adicionado em ${rep} meses` : 'Adicionado ✦');
  }
  salvar();
  $('#modal').close();
  const [na, nm] = base.data.split('-').map(Number);
  mesAtual = { a: na, m: nm - 1 };
  render();
});

$('#excluir').addEventListener('click', () => {
  if (!confirm('Excluir este lançamento?')) return;
  dados.lanc = dados.lanc.filter(x => x.id !== editandoId);
  salvar(); $('#modal').close(); render(); toast('Excluído');
});
$('#cancelar').addEventListener('click', () => $('#modal').close());
$('#fab').addEventListener('click', () => abrirForm(null, aba === 'cofre' ? 'cofre' : 'conta'));

// ---------- Navegação ----------
$('#mesAnt').addEventListener('click', () => { mesAtual = mesRel(-1); render(); });
$('#mesProx').addEventListener('click', () => { mesAtual = mesRel(1); render(); });
function mesRel(n) { const d = new Date(mesAtual.a, mesAtual.m + n, 1); return { a: d.getFullYear(), m: d.getMonth() }; }

function irPara(nova) {
  aba = nova;
  $$('.aba').forEach(x => x.classList.toggle('ativa', x.dataset.aba === aba));
  ['lista', 'cofre', 'graficos', 'ajustes'].forEach(n => $('#aba-' + n).hidden = n !== aba);
  $('#fab').hidden = !(aba === 'lista' || aba === 'cofre');
  $('#navMes').hidden = aba === 'ajustes';
  if (aba === 'ajustes') preencheAjustes();
  window.scrollTo({ top: 0 });
  render();
}
$$('.aba').forEach(b => b.addEventListener('click', () => irPara(b.dataset.aba)));
$$('.chip').forEach(c => c.addEventListener('click', () => {
  filtro = c.dataset.filtro;
  $$('.chip').forEach(x => x.classList.toggle('ativo', x === c));
  render();
}));

// ---------- Ajustes ----------
function preencheAjustes() {
  $('#aInicial').value = valorCampo(dados.cofre.inicial);
  $('#aMetaNome').value = dados.cofre.metaNome || '';
  $('#aMetaValor').value = valorCampo(dados.cofre.metaValor);
}
$('#salvarCofre').addEventListener('click', () => {
  dados.cofre.inicial = parseValor($('#aInicial').value) || 0;
  dados.cofre.metaNome = $('#aMetaNome').value.trim();
  dados.cofre.metaValor = parseValor($('#aMetaValor').value) || 0;
  salvar(); toast('Cofre atualizado');
});

$('#exportar').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cofre-magico-backup-${hojeStr()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#importar').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.lanc)) throw 0;
    if (!confirm(`Restaurar ${d.lanc.length} lançamentos? Isso substitui os dados atuais.`)) return;
    dados = { ...d, cofre: d.cofre || { inicial: 0, metaNome: '', metaValor: 0 } };
    salvar(); preencheAjustes(); render(); toast('Backup restaurado');
  } catch { toast('Arquivo de backup inválido'); }
  e.target.value = '';
});
$('#apagarTudo').addEventListener('click', () => {
  if (!confirm('Apagar TODOS os lançamentos e o cofre? Não dá para desfazer.')) return;
  dados = { lanc: [], cofre: { inicial: 0, metaNome: '', metaValor: 0 } };
  salvar(); preencheAjustes(); render(); toast('Tudo apagado');
});

let tt;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2200);
}

irPara('lista');

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
