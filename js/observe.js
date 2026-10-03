/* =========================================================================
   4. 图片处理：等比缩到长边 2048（Opus 5 支持高分辨率，2048 是精度/成本的折中）
   ========================================================================= */
function toDataUrl(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 2048;
        const k = Math.min(1, MAX / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = rej;
      img.src = fr.result;
    };
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

/* =========================================================================
   6. 观察流程
   ========================================================================= */
let pending = null;   // 当前待分析的 dataURL

async function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  pending = await toDataUrl(file);
  $('#preview').src = pending;
  $('#preview').hidden = false;
  $('#drop-hint').hidden = true;
  $('#go').disabled = false;
}

$('#drop').onclick = () => $('#file').click();
$('#file').onchange = e => loadFile(e.target.files[0]);
['dragover','dragenter'].forEach(ev =>
  $('#drop').addEventListener(ev, e => { e.preventDefault(); $('#drop').classList.add('hot'); }));
['dragleave','drop'].forEach(ev =>
  $('#drop').addEventListener(ev, e => { e.preventDefault(); $('#drop').classList.remove('hot'); }));
$('#drop').addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
document.addEventListener('paste', e => {
  const it = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
  if (it) loadFile(it.getAsFile());
});

$('#go').onclick = async () => {
  if (cfg.provider === 'cpa' && !cfg.cpaKey) {
    $('#err-box').innerHTML = `
      <div class="err">
        <b>当前处于 CPA 代理模式，但未配置 API Token。</b><br>
        <div class="row" style="margin-top:8px">
          <button class="ghost" style="font-size:13px;padding:6px 12px" onclick="show('set')">前往设置填写 Key</button>
          <button class="ghost" style="font-size:13px;padding:6px 12px" onclick="switchToOllama()">切换为本地 Ollama</button>
        </div>
      </div>`;
    return;
  }
  if (cfg.provider === 'anthropic' && !cfg.key) {
    $('#err-box').innerHTML = `
      <div class="err">
        <b>当前处于 Anthropic 官方 API 模式，但未配置 API Key。</b><br>
        <div class="row" style="margin-top:8px">
          <button class="primary" style="font-size:13px;padding:6px 12px" onclick="switchToCpa()">一键切换为 CPA 节点 (gemini-flash)</button>
          <button class="ghost" style="font-size:13px;padding:6px 12px" onclick="switchToOllama()">切换为本地 Ollama</button>
          <button class="ghost" style="font-size:13px;padding:6px 12px" onclick="show('set')">去设置填写 Key</button>
        </div>
      </div>`;
    return;
  }
  $('#err-box').innerHTML = '';
  $('#go').disabled = true;
  const currentModel = cfg.provider === 'cpa' ? cfg.cpaModel : (cfg.provider === 'ollama' ? cfg.ollamaModel : cfg.model);
  $('#status').innerHTML = `<span class="spin"></span> 正在观察…（${esc(currentModel)} 分析中）`;

  const img = pending, hint = $('#hint').value.trim(), selfTest = $('#quiz').checked;
  const t0 = Date.now();
  // 先发请求，用户答题和等 AI 同时进行
  const job = analyze(img, hint);
  job.catch(() => {});
  const qs = selfTest ? await pickQuestions() : [];
  const picked = qs.length ? askQuiz($('#result'), qs) : null;

  try {
    const { data, usage } = await job;
    const entry = { id: Date.now(), img, hint, data, at: new Date().toISOString() };
    await DB.put('entries', entry);
    await addCards(data.glossary, entry.id);
    $('#status').textContent =
      `完成 · ${((Date.now()-t0)/1000).toFixed(0)}s · in ${usage.input_tokens} / out ${usage.output_tokens} tokens`;

    if (picked) {
      $('#quiz-wait') && ($('#quiz-wait').textContent = 'AI 已经看完了，选好就揭晓');
      entry.quiz = gradeQuiz(qs, await picked, data);
      await DB.put('entries', entry);
      await reviewMissed(entry.quiz);
    }
    $('#result').innerHTML = renderCompare(entry.quiz) + renderResult(data, selfTest);
    refreshBook(); refreshDeck();
  } catch (e) {
    $('#err-box').innerHTML = `<div class="err">${esc(e.message)}</div>`;
    $('#status').textContent = '';
    if (picked) $('#result').innerHTML = '';
  }
  $('#go').disabled = false;
};
