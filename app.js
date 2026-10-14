// Cofre Mágico — controle financeiro pessoal (dados salvos no próprio aparelho)
const CHAVE = 'cofre-magico-v1';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let dados = carregar();
let mesAtual = (() => { const d = new Date(); return { a: d.getFullYear(), m: d.getMonth() }; })();
let filtro = 'todos';
let editandoId = null;

function carregar() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || { lanc: [], casa: 'escarlate' }; }
  catch { return { lanc: [], casa: 'escarlate' }; }
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

function parseValor(s) {
  s = String(s).trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Math.round(parseFloat(s) * 100);
  return isFinite(n) && n > 0 ? n : null;
}

function totais(lista) {
  const t = { entR: 0, entP: 0, saiR: 0, saiP: 0 };
  for (const l of lista) {
    if (l.tipo === 'entrada') l.feito ? t.entR += l.valor : t.entP += l.valor;
    else l.feito ? t.saiR += l.valor : t.saiP += l.valor;
  }
  return t;
}

// ---------- Render ----------
function render() {
  const { a, m } = mesAtual;
  const nm = nomeMes(a, m);
  $('#mesTitulo').textContent = nm[0].toUpperCase() + nm.slice(1);
  const lista = doMes(a, m);
  const t = totais(lista);
  const real = t.entR - t.saiR;
  const prev = real + t.entP - t.saiP;
  $('#saldoReal').textContent = fmt(real);
  $('#saldoReal').classList.toggle('neg', real < 0);
  $('#saldoPrev').textContent = fmt(prev);
  $('#entReal').textContent = fmt(t.entR);
  $('#entPrev').textContent = fmt(t.entP);
  $('#saiReal').textContent = fmt(t.saiR);
  $('#saiPrev').textContent = fmt(t.saiP);
  renderLista(lista);
  if (!$('#aba-graficos').hidden) renderGraficos();
}

function renderLista(lista) {
  let l = lista.slice();
  if (filtro === 'entrada' || filtro === 'saida') l = l.filter(x => x.tipo === filtro);
  if (filtro === 'previsto') l = l.filter(x => !x.feito);
  l.sort((x, y) => y.data.localeCompare(x.data) || y.criado - x.criado);
  const ul = $('#lista');
  ul.innerHTML = '';
  $('#vazio').hidden = l.length > 0;
  for (const x of l) {
    const li = document.createElement('li');
    li.className = `item ${x.tipo} ${x.feito ? '' : 'previsto'}`;
    const [, mm, dd] = x.data.split('-');
    const pend = x.tipo === 'entrada' ? 'a receber' : 'a pagar';
    const acao = x.tipo === 'entrada' ? 'Marcar recebido' : 'Marcar pago';
    li.innerHTML = `
      <div class="ic">${x.tipo === 'entrada' ? '↑' : '↓'}</div>
      <div class="txt"><b></b><small>${dd}/${mm}${x.cat ? ' · <span class="c"></span>' : ''}</small>${x.feito ? '' : `<span class="tag">${pend}</span>`}</div>
      <div class="val">${x.tipo === 'entrada' ? '+' : '−'} ${fmt(x.valor)}${x.feito ? '' : `<button class="toggle">${acao}</button>`}</div>`;
    li.querySelector('b').textContent = x.desc;
    if (x.cat) li.querySelector('.c').textContent = x.cat;
    li.addEventListener('click', e => {
      if (e.target.classList.contains('toggle')) {
        x.feito = true; salvar(); render(); toast('Feito! ✨'); return;
      }
      abrirForm(x);
    });
    ul.appendChild(li);
  }
}

function renderGraficos() {
  // Barras dos últimos 6 meses
  const meses = [];
  for (let i = -3; i <= 2; i++) {
    const d = new Date(mesAtual.a, mesAtual.m + i, 1);
    const t = totais(doMes(d.getFullYear(), d.getMonth()));
    meses.push({ atual: i === 0, rot: nomeMes(d.getFullYear(), d.getMonth(), true), ent: t.entR + t.entP, sai: t.saiR + t.saiP });
  }
  const max = Math.max(1, ...meses.flatMap(x => [x.ent, x.sai]));
  const W = 320, H = 180, base = 150, col = W / 6, bw = 16;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entradas e saídas dos últimos 6 meses">`;
  svg += `<line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="#6b553455"/>`;
  meses.forEach((x, i) => {
    const cx = i * col + col / 2;
    const he = (x.ent / max) * 130, hs = (x.sai / max) * 130;
    svg += `<rect x="${cx - bw - 1}" y="${base - he}" width="${bw}" height="${he}" rx="3" fill="var(--in)"><title>Entradas: ${fmt(x.ent)}</title></rect>`;
    svg += `<rect x="${cx + 1}" y="${base - hs}" width="${bw}" height="${hs}" rx="3" fill="var(--out)"><title>Saídas: ${fmt(x.sai)}</title></rect>`;
    svg += `<text x="${cx}" y="${base + 18}" text-anchor="middle" font-size="12" fill="#6b5534" font-weight="${x.atual ? 700 : 400}" font-family="Cinzel">${x.rot}</text>`;
  });
  svg += '</svg>';
  $('#grafMeses').innerHTML = svg;

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
function atualizaTxtFeito() {
  const tipo = document.querySelector('input[name=tipo]:checked').value;
  $('#fFeitoTxt').textContent = tipo === 'entrada' ? 'Já recebi' : 'Já paguei';
}

function abrirForm(l) {
  editandoId = l ? l.id : null;
  $('#formTitulo').textContent = l ? 'Editar lançamento' : 'Novo lançamento';
  document.querySelector(`input[name=tipo][value=${l ? l.tipo : 'entrada'}]`).checked = true;
  $('#fValor').value = l ? (l.valor / 100).toFixed(2).replace('.', ',') : '';
  $('#fDesc').value = l ? l.desc : '';
  $('#fCat').value = l ? (l.cat || '') : '';
  const hoje = new Date();
  const padrao = (mesAtual.a === hoje.getFullYear() && mesAtual.m === hoje.getMonth())
    ? `${chaveMes(hoje.getFullYear(), hoje.getMonth())}-${String(hoje.getDate()).padStart(2, '0')}` :`${chaveMes(mesAtual.a, mesAtual.m)}-01`;
  $('#fData').value = l ? l.data : padrao;
  $('#fFeito').checked = l ? l.feito : true;
  $('#fRepetir').value = '0';
  $('#fRepetir').parentElement.hidden = !!l;
  $('#excluir').hidden = !l;
  const cats = [...new Set(dados.lanc.map(x => x.cat).filter(Boolean))].sort();
  $('#cats').innerHTML = cats.map(c => `<option value="${c.replace(/"/g, '&quot;')}">`).join('');
  atualizaTxtFeito();
  $('#modal').showModal();
  if (!l) setTimeout(() => $('#fValor').focus(), 50);
}

$('#form').addEventListener('submit', e => {
  e.preventDefault();
  const valor = parseValor($('#fValor').value);
  if (!valor) { toast('Valor inválido'); $('#fValor').focus(); return; }
  const base = {
    tipo: document.querySelector('input[name=tipo]:checked').value,
    valor,
    desc: $('#fDesc').value.trim() || 'Sem descrição',
    cat: $('#fCat').value.trim(),
    data: $('#fData').value,
    feito: $('#fFeito').checked,
  };
  if (editandoId) {
    Object.assign(dados.lanc.find(x => x.id === editandoId), base);
    toast('Lançamento atualizado');
  } else {
    const rep = +$('#fRepetir').value || 1;
    const [a, m, d] = base.data.split('-').map(Number);
    for (let i = 0; i < rep; i++) {
      const ult = new Date(a, m - 1 + i + 1, 0).getDate();
      const dt = new Date(a, m - 1 + i, Math.min(d, ult));
      const data = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      dados.lanc.push({ ...base, id: uid(), criado: Date.now() + i, data, feito: i === 0 ? base.feito : false });
    }
    toast(rep > 1 ? `Adicionado em ${rep} meses ✨` : 'Lançamento adicionado ✨');
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
$$('input[name=tipo]').forEach(r => r.addEventListener('change', atualizaTxtFeito));
$('#fab').addEventListener('click', () => abrirForm(null));

// ---------- Navegação ----------
$('#mesAnt').addEventListener('click', () => { mesAtual = mesRel(-1); render(); });
$('#mesProx').addEventListener('click', () => { mesAtual = mesRel(1); render(); });
function mesRel(n) { const d = new Date(mesAtual.a, mesAtual.m + n, 1); return { a: d.getFullYear(), m: d.getMonth() }; }

$$('.aba').forEach(b => b.addEventListener('click', () => {
  $$('.aba').forEach(x => x.classList.toggle('ativa', x === b));
  ['lista', 'graficos', 'ajustes'].forEach(n => $('#aba-' + n).hidden = n !== b.dataset.aba);
  $('#fab').hidden = b.dataset.aba === 'ajustes';
  render();
}));
$$('.chip').forEach(c => c.addEventListener('click', () => {
  filtro = c.dataset.filtro;
  $$('.chip').forEach(x => x.classList.toggle('ativo', x === c));
  render();
}));

// ---------- Ajustes ----------
function aplicaCasa() {
  document.body.className = dados.casa === 'escarlate' ? '' : dados.casa;
  $$('.casas button').forEach(b => b.classList.toggle('sel', b.dataset.casa === dados.casa));
}
$$('.casas button').forEach(b => b.addEventListener('click', () => { dados.casa = b.dataset.casa; salvar(); aplicaCasa(); }));

$('#exportar').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cofre-magico-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#importar').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.lanc)) throw 0;
    if (!confirm(`Restaurar ${d.lanc.length} lançamentos? Isso substitui os dados atuais.`)) return;
    dados = { casa: 'escarlate', ...d }; salvar(); aplicaCasa(); render(); toast('Backup restaurado');
  } catch { toast('Arquivo de backup inválido'); }
  e.target.value = '';
});
$('#apagarTudo').addEventListener('click', () => {
  if (!confirm('Apagar TODOS os lançamentos? Não dá para desfazer.')) return;
  dados.lanc = []; salvar(); render(); toast('Tudo apagado');
});

let tt;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2200);
}

aplicaCasa();
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
