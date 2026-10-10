/* =========================================================================
   4. 图片处理：等比缩到长边 2048（Opus 5 支持高分辨率，2048 是精度/成本的折中）
   ========================================================================= */
function toDataUrl(file, maxEdge = 2048) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', maxEdge < 2048 ? 0.8 : 0.85));
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
let pendingImgs = [];       // 当前待分析的 dataURL（随机练习可能有多张）
let pendingSource = null;   // 随机练习的照片来源（自己上传的为 null）

function showShot(i) {
  $('#preview').src = pendingImgs[i];
  $('#thumbs').querySelectorAll('.thumb').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
}

function setPending(imgs, source) {
  pendingImgs = Array.isArray(imgs) ? imgs : [imgs];
  pendingSource = source;
  const n = pendingImgs.length;
  $('#practice-note').textContent = source
    ? `${n > 1 ? `${n} 个角度 · ` : ''}照片 ${source.attribution} · 名字等 AI 看完再揭晓`
    : '';
  $('#preview').hidden = false;
  $('#drop-hint').hidden = true;
  const box = $('#thumbs');
  if (n < 2) {
    box.hidden = true;
    box.innerHTML = '';
  } else {
    box.hidden = false;
    box.innerHTML = pendingImgs.map((_, i) =>
      `<button type="button" class="thumb${i ? '' : ' on'}" data-i="${i}"><img src="${pendingImgs[i]}" alt="角度 ${i + 1}"></button>`
    ).join('') + `<span class="tiny muted">同一株，点小图换角度</span>`;
    box.querySelectorAll('.thumb').forEach(b => b.onclick = e => {
      e.stopPropagation();
      showShot(+b.dataset.i);
    });
  }
  showShot(0);
  $('#go').disabled = false;
}

async function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  setPending(await toDataUrl(file), null);
}

$('#practice').onclick = async () => {
  const btn = $('#practice');
  btn.disabled = true;
  $('#practice-note').innerHTML = `<span class="spin"></span> 从 iNaturalist 找一株${esc(cfg.practicePlaceName)}、有多张照片的植物…`;
  try {
    const { imgs, source } = await fetchPracticePhoto();
    setPending(imgs, source);
    $('#hint').value = source.place ? `拍摄地：${source.place}` : '';
    $('#result').innerHTML = ''; $('#status').textContent = '';
  } catch (e) {
    $('#practice-note').textContent = `没取到照片：${e.message}`;
  }
  btn.disabled = false;
};

$('#drop').onclick = e => { if (!e.target.closest('#thumbs')) $('#file').click(); };
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
  if (!cfg.apiKey) {
    $('#err-box').innerHTML = `
      <div class="err">
        <b>还没填 API Key。</b><br>
        <div class="row" style="margin-top:8px">
          <button class="ghost" style="font-size:13px;padding:6px 12px" onclick="show('set')">去设置填写</button>
        </div>
      </div>`;
    return;
  }
  $('#err-box').innerHTML = '';
  $('#go').disabled = true;
  $('#status').innerHTML = `<span class="spin"></span> 正在观察…（${esc(cfg.model)} 分析中）`;

  const imgs = pendingImgs, source = pendingSource, hint = $('#hint').value.trim(), selfTest = $('#quiz').checked;
  const t0 = Date.now();
  // 先发请求，用户答题和等 AI 同时进行
  const job = analyze(imgs, hint);
  job.catch(() => {});
  const qs = selfTest ? await pickQuestions() : [];
  const picked = qs.length ? askQuiz($('#result'), qs) : null;

  try {
    const { data, usage } = await job;
    const entry = { id: Date.now(), img: imgs[0], imgs, hint, data, at: new Date().toISOString(), ...(source && { source }) };
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
    $('#result').innerHTML = renderSource(source, data) + renderCompare(entry.quiz) + renderResult(data, selfTest);
    refreshBook(); refreshDeck();
  } catch (e) {
    $('#err-box').innerHTML = `<div class="err">${esc(e.message)}</div>`;
    $('#status').textContent = '';
    if (picked) $('#result').innerHTML = '';
  }
  $('#go').disabled = false;
};
