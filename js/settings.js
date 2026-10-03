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

function updateProviderUI() {
  const p = cfg.provider;
  $('#set-cpa').style.display = p === 'cpa' ? 'block' : 'none';
  $('#set-ollama').style.display = p === 'ollama' ? 'block' : 'none';
  $('#set-anthropic').style.display = p === 'anthropic' ? 'block' : 'none';

  if ($('#active-backend-text')) {
    if (p === 'cpa') {
      $('#active-backend-text').textContent = `CPA 代理 (${cfg.cpaModel})`;
    } else if (p === 'ollama') {
      $('#active-backend-text').textContent = `本地 Ollama (${cfg.ollamaModel})`;
    } else {
      $('#active-backend-text').textContent = `Anthropic API (${cfg.model})`;
    }
  }
}

window.switchToCpa = () => {
  localStorage.setItem('provider', 'cpa');
  $('#provider').value = 'cpa';
  updateProviderUI();
  $('#err-box').innerHTML = '';
};

window.switchToOllama = () => {
  localStorage.setItem('provider', 'ollama');
  $('#provider').value = 'ollama';
  updateProviderUI();
  $('#err-box').innerHTML = '';
};

// 默认值统一在 cfg（js/api.js）里，这里只负责回填表单
$('#provider').value = cfg.provider;
$('#cpa-base-url').value = cfg.cpaBaseUrl;
$('#cpa-key').value = cfg.cpaKey;
$('#cpa-model').value = cfg.cpaModel;
$('#ollama-host').value = cfg.ollamaHost;
$('#ollama-model').value = cfg.ollamaModel;
$('#key').value = cfg.key;
$('#model').value = cfg.model;
$('#effort').value = cfg.effort;
updateProviderUI();

$('#provider').onchange = e => {
  localStorage.setItem('provider', e.target.value);
  updateProviderUI();
};
$('#cpa-base-url').oninput = e => localStorage.setItem('cpa_base_url', e.target.value.trim());
$('#cpa-key').oninput      = e => localStorage.setItem('cpa_key', e.target.value.trim());
$('#cpa-model').onchange   = e => {
  localStorage.setItem('cpa_model', e.target.value);
  updateProviderUI();
};
$('#ollama-host').oninput  = e => localStorage.setItem('ollama_host', e.target.value.trim());
$('#ollama-model').oninput = e => {
  localStorage.setItem('ollama_model', e.target.value.trim());
  updateProviderUI();
};
$('#key').oninput          = e => localStorage.setItem('key', e.target.value.trim());
$('#model').onchange       = e => {
  localStorage.setItem('model', e.target.value);
  updateProviderUI();
};
$('#effort').onchange      = e => localStorage.setItem('effort', e.target.value);

$('#fetch-ollama-models').onclick = async () => {
  const host = ($('#ollama-host').value || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const btn = $('#fetch-ollama-models');
  btn.textContent = '获取中...';
  btn.disabled = true;
  try {
    const res = await fetch(`${host}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = data.models || [];
    if (!models.length) { alert('未找到已安装的 Ollama 模型'); return; }
    const sel = $('#ollama-model-select');
    sel.innerHTML = models.map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('');
    sel.value = $('#ollama-model').value || models[0].name;
    sel.style.display = 'block';
    $('#ollama-model').style.display = 'none';
    sel.onchange = () => {
      $('#ollama-model').value = sel.value;
      localStorage.setItem('ollama_model', sel.value);
      updateProviderUI();
    };
    $('#ollama-model').value = sel.value;
    localStorage.setItem('ollama_model', sel.value);
    updateProviderUI();
  } catch (err) {
    alert(`获取模型列表失败: ${err.message}\n请检查 Ollama 服务是否启动。`);
  } finally {
    btn.textContent = '获取已安装模型';
    btn.disabled = false;
  }
};

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
