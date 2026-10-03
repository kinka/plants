/* =========================================================================
   7. 笔记本
   ========================================================================= */
async function refreshBook() {
  const all = (await DB.all('entries')).sort((a,b) => b.id - a.id);
  const fams = new Set(all.map(e => e.data.identification.family_latin).filter(f => f && f !== '无法判断'));
  const cards = await DB.all('cards');

  $('#stats').innerHTML = `
    <div><b>${all.length}</b><span>观察记录</span></div>
    <div><b>${fams.size}</b><span>见过的科</span></div>
    <div><b>${cards.length}</b><span>术语卡片</span></div>
    <div><b>${cards.filter(c => c.due <= Date.now()).length}</b><span>今日待复习</span></div>`;

  $('#notes').innerHTML = all.map(e => `
    <div class="note" data-id="${e.id}">
      <img src="${e.img}">
      <div>
        <b>${esc(e.data.identification.common_name_zh)}</b>
        <span class="tiny muted">${esc(e.data.identification.family_zh)} · ${e.at.slice(0,10)}</span>
      </div>
    </div>`).join('') || '<p class="muted">还没有记录。</p>';

  $('#notes').querySelectorAll('.note').forEach(n => n.onclick = async () => {
    const e = await DB.get('entries', Number(n.dataset.id));
    $('#detail').innerHTML =
      `<div class="card"><div class="spread">
         <b>${esc(e.data.identification.common_name_zh)}</b>
         <button class="ghost" id="del">删除这条</button></div>
       <img src="${e.img}" style="max-width:100%;border-radius:8px;margin-top:12px">
       ${e.hint ? `<p class="tiny muted">线索：${esc(e.hint)}</p>` : ''}
       </div>` + renderCompare(e.quiz) + renderResult(e.data, false);
    $('#del').onclick = async () => { await DB.del('entries', e.id); $('#detail').innerHTML=''; refreshBook(); };
    $('#detail').scrollIntoView({behavior:'smooth'});
  });
}
