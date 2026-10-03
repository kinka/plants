/* =========================================================================
   8. 术语卡 + 间隔重复（SM-2 简化版）
   ========================================================================= */
async function addCards(glossary, entryId) {
  const existing = new Set((await DB.all('cards')).map(c => c.term));
  for (const g of glossary) {
    if (existing.has(g.term_zh)) continue;
    await DB.put('cards', {
      term: g.term_zh, en: g.term_en, def: g.definition, seen: g.seen_here,
      entryId, ease: 2.5, interval: 0, due: Date.now(), reps: 0
    });
  }
}

const SEED_CATS = [...new Set(SEED.map(s => s.c))];

async function renderSeed() {
  const have = new Set((await DB.all('cards')).map(c => c.term));
  $('#seed-list').innerHTML = SEED_CATS.map(cat => {
    const items = SEED.filter(s => s.c === cat);
    const got = items.filter(s => have.has(s.t)).length;
    return `<div class="feat" style="display:flex;align-items:center;gap:12px">
      <div style="flex:1">
        <b>${esc(cat)}</b> <span class="tiny muted">${items.length} 词</span>
        <div class="obs tiny">${items.slice(0,4).map(s=>esc(s.t)).join(' · ')}${items.length>4?' …':''}</div>
      </div>
      ${got === items.length
        ? '<span class="tiny muted">已载入</span>'
        : `<button class="ghost" data-seed="${esc(cat)}">载入 ${items.length - got}</button>`}
    </div>`;
  }).join('');
  $('#seed-list').querySelectorAll('[data-seed]').forEach(b =>
    b.onclick = () => loadSeed(b.dataset.seed));
}

const seedCard = s => ({
  term: s.t, en: s.e, def: s.d, seen: s.s || '（还没在自己的观察里遇到）',
  cat: s.c, entryId: null, ease: 2.5, interval: 0, due: Date.now(), reps: 0
});

async function loadSeed(cat) {
  const have = new Set((await DB.all('cards')).map(c => c.term));
  const items = SEED.filter(s => cat === '*' || s.c === cat);
  let n = 0;
  for (const s of items) {
    if (have.has(s.t)) continue;
    await DB.put('cards', seedCard(s));
    n++;
  }
  await refreshDeck();
  $('#status2') && ($('#status2').textContent = `已载入 ${n} 张`);
}

// 自测里没认对的术语：已有卡片就提前到现在复习，还没有就从基础术语库补进来
async function reviewNow(term) {
  const c = await DB.get('cards', term);
  if (c) return DB.put('cards', { ...c, due: Date.now() });
  const s = SEED.find(s => s.t === term);
  if (s) await DB.put('cards', seedCard(s));
}

let queue = [], current = null, flipped = false;
let deckMode = localStorage.getItem('deckMode') || 'term';

async function refreshDeck() {
  const all = await DB.all('cards');
  const groups = new Map(SEED_CATS.map(c => [c, []]));
  groups.set('来自我的观察', []);
  for (const c of all) (groups.get(c.cat) || groups.get('来自我的观察')).push(c);

  $('#allterms').innerHTML = all.length
    ? [...groups].filter(([,v]) => v.length).map(([k, v]) => `
        <div class="sec-title" style="margin-top:18px">${esc(k)} <span class="tiny muted" style="font-weight:400">${v.length}</span></div>
        ${v.sort((a,b)=>a.term.localeCompare(b.term,'zh')).map(c => {
          const f = FIG[c.term];
          return `<div class="feat${f ? ' withfig' : ''}">
           ${f ? `<div class="figmini">${f}</div>` : ''}
           <div><b>${esc(c.term)} <span class="muted sci" style="font-weight:400">${esc(c.en)}</span></b>
           <div class="obs">${esc(c.def)}</div>
           ${c.seen ? `<div class="tiny muted">实例：${esc(c.seen)}</div>` : ''}</div></div>`;
        }).join('')}`).join('')
    : '<p class="muted">暂无</p>';

  queue = all.filter(c => c.due <= Date.now()).sort((a,b) => a.due - b.due);
  nextCard();
  renderSeed();
}

function nextCard() {
  const box = $('#deck-box');
  current = queue.shift(); flipped = false;
  if (!current) {
    box.innerHTML = `<p class="muted" style="text-align:center;padding:30px 0">
      没有待复习的卡片了 🌿<br><span class="tiny">继续去观察新植物，或稍后再来</span></p>`;
    return;
  }
  draw();
}

function figOf(term) { return FIG[term] ? `<div class="figbox">${FIG[term]}</div>` : ''; }

function realPhoto(c) {
  const q = encodeURIComponent(c.en || c.term);
  const z = encodeURIComponent(c.term + ' 植物');
  return `<div style="margin-top:16px">看实物照片：
    <a class="reallink" target="_blank" rel="noopener"
       href="https://commons.wikimedia.org/w/index.php?search=${q}&ns6=1">维基共享</a> ·
    <a class="reallink" target="_blank" rel="noopener"
       href="https://image.baidu.com/search/index?tn=baiduimage&word=${z}">百度图片</a></div>`;
}

function draw() {
  const fig = figOf(current.term);
  const rev = deckMode === 'fig' && fig;
  $('#deck-box').innerHTML = `
    <div id="cardface">
      ${rev
        ? `${fig}${flipped
            ? `<div class="term" style="margin-top:14px">${esc(current.term)}</div>
               <div class="en">${esc(current.en)}</div>`
            : '<p class="tiny muted" style="margin-top:14px">这是什么？</p>'}`
        : `<div class="term">${esc(current.term)}</div>
           <div class="en">${esc(current.en)}</div>
           ${flipped ? fig : ''}`}
      ${flipped ? `<div class="def">${esc(current.def)}
        <div class="tiny muted" style="margin-top:12px">实例：${esc(current.seen)}</div>
        ${realPhoto(current)}</div>` : ''}
    </div>
    <div class="row" style="justify-content:center">
      ${flipped
        ? `<button class="ghost" data-q="0">不认识</button>
           <button class="ghost" data-q="1">模糊</button>
           <button class="primary" data-q="2">认识</button>`
        : `<button class="primary" id="flip">${deckMode === 'fig' ? '显示答案' : '显示图与释义'}</button>`}
    </div>
    <p class="tiny muted" style="text-align:center;margin:14px 0 0">队列剩余 ${queue.length}</p>`;

  if (!flipped) $('#flip').onclick = () => { flipped = true; draw(); };
  else $('#deck-box').querySelectorAll('[data-q]').forEach(b => b.onclick = () => grade(+b.dataset.q));
}

async function grade(q) {
  const DAY = 864e5;
  const c = current;
  c.reps++;
  if (q === 0) { c.ease = Math.max(1.3, c.ease - 0.2); c.interval = 0; c.due = Date.now() + 6e5; queue.push(c); }
  else if (q === 1) { c.interval = c.interval ? c.interval * 1.2 : 1; c.due = Date.now() + c.interval * DAY; }
  else { c.ease = Math.min(3.0, c.ease + 0.1); c.interval = c.interval ? c.interval * c.ease : 1;
         c.due = Date.now() + c.interval * DAY; }
  await DB.put('cards', c);
  nextCard();
}

$('#seed-all').onclick = () => loadSeed('*');

function setMode(m) {
  deckMode = m; localStorage.setItem('deckMode', m);
  $('#mode-term').classList.toggle('on', m === 'term');
  $('#mode-fig').classList.toggle('on', m === 'fig');
  if (current) { flipped = false; draw(); }
}
$('#mode-term').onclick = () => setMode('term');
$('#mode-fig').onclick  = () => setMode('fig');
setMode(deckMode);
