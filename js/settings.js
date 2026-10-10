/* =========================================================================
   9. 导航与设置
   ========================================================================= */
function show(v) {
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'book') refreshBook();
  if (v === 'deck') refreshDeck();
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => show(b.dataset.v));

function updateBackendLabel() {
  let host = cfg.baseUrl;
  try { host = new URL(cfg.baseUrl).host; } catch { /* 还没填成合法 URL */ }
  $('#active-backend-text').textContent = `${cfg.model} · ${host}`;
  $('#set-effort').hidden = apiKind() !== 'anthropic';
}

function fillModels(ids) {
  const cur = cfg.model;
  const all = [...new Set([cur, ...ids].filter(Boolean))];
  $('#api-model').innerHTML = all.map(id => `<option value="${esc(id)}">${esc(id)}</option>`).join('');
  $('#api-model').value = all.includes(cur) ? cur : all[0];
  if ($('#api-model').value !== cur) localStorage.setItem('api_model', $('#api-model').value);
  updateBackendLabel();
}

async function loadModels() {
  const btn = $('#fetch-models');
  const note = $('#models-note');
  if (!cfg.apiKey) { note.textContent = '先填 API Key'; return; }
  btn.disabled = true;
  note.textContent = '获取中…';
  try {
    const { ids, dropped } = await fetchModels();
    fillModels(ids);
    note.textContent = dropped
      ? `${ids.length} 个模型，折叠了 ${dropped} 个重复的 Claude 快照`
      : `${ids.length} 个模型`;
  } catch (e) {
    note.textContent = `没取到列表：${e.message}`;
  }
  btn.disabled = false;
}

$('#api-base').value = cfg.baseUrl;
$('#api-key').value = cfg.apiKey;
fillModels([]);
$('#effort').value = cfg.effort;
updateBackendLabel();

$('#api-base').oninput = e => {
  localStorage.setItem('api_base', e.target.value.trim());
  updateBackendLabel();
};
$('#api-key').oninput = e => localStorage.setItem('api_key', e.target.value.trim());
$('#api-model').onchange = e => {
  localStorage.setItem('api_model', e.target.value);
  updateBackendLabel();
};
$('#fetch-models').onclick = loadModels;
$('#effort').onchange = e => localStorage.setItem('effort', e.target.value);
loadModels();

$('#place-now').textContent = cfg.practicePlaceName;
$('#place-search').onclick = async () => {
  const text = $('#place-q').value.trim();
  if (!text) return;
  const box = $('#place-list');
  box.innerHTML = '<span class="spin"></span>';
  try {
    const places = await searchPlaces(text);
    box.innerHTML = places.length
      ? places.map(p => `<button class="ghost" data-id="${p.id}">${esc(p.name)}</button>`).join('')
      : '<span class="tiny muted">没找到，试试拼音或英文</span>';
    box.querySelectorAll('[data-id]').forEach(b => b.onclick = () => {
      localStorage.setItem('practice_place_id', b.dataset.id);
      localStorage.setItem('practice_place_name', b.textContent);
      $('#place-now').textContent = b.textContent;
      box.innerHTML = '';
    });
  } catch (e) {
    box.innerHTML = `<span class="tiny muted">搜索失败：${esc(e.message)}</span>`;
  }
};
$('#place-q').onkeydown = e => { if (e.key === 'Enter') $('#place-search').click(); };

$('#export').onclick = async () => {
  const blob = new Blob([JSON.stringify(await DB.all('entries'), null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `plants-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
};
$('#wipe').onclick = async () => {
  if (!confirm('清空所有观察记录和术语卡？不可恢复。')) return;
  await DB.clear('entries'); await DB.clear('cards');
  refreshBook(); refreshDeck(); alert('已清空');
};
