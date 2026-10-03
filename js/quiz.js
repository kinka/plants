/* =========================================================================
   自测：AI 观察的同时先答 1–2 道看图题，揭晓后和 AI 的观察逐项对照
   · 不打分；答错或看不出来，只是把对应术语卡提前到今天复习
   · 题目按学习顺序排列，上一题连续答对几次才解锁下一题
   · 加一道题 = 往 QUESTIONS 里加一项；options.term 要在 FIG 和 SEED 里都有
   ========================================================================= */
const QUESTIONS = [
  { key: 'phyllotaxy', ask: '叶在茎上怎么排？', tip: '先找到节——叶长出来的位置',
    ai: d => d.habit.phyllotaxy,
    options: [
      { term: '互生',   words: ['互生', 'alternate'] },
      { term: '对生',   words: ['对生', 'opposite', 'decussate'] },
      { term: '轮生',   words: ['轮生', 'whorled', 'verticillate'] },
      { term: '基生叶', words: ['基生', '莲座', 'rosul', 'basal'] },
    ] },
  { key: 'simple_or_compound', ask: '单叶还是复叶？', tip: '看芽：芽只长在叶柄基部，小叶腋里没有芽',
    ai: d => d.leaf.simple_or_compound,
    options: [
      { term: '单叶', words: ['单叶', 'simple'] },
      { term: '复叶', words: ['复叶', 'compound'] },
    ] },
];
const QUIZ_MAX = 2;        // 每张照片最多问几题
const UNLOCK_STREAK = 3;   // 上一题连续答对几次，解锁下一题
const UNSURE = '看不出来';

// 把 AI 的自由文本归到某个选项：取最早出现的关键词；AI 自己也判断不了就返回 null
function aiAnswer(q, data) {
  const text = (q.ai(data) || '').toLowerCase();
  if (text.includes('无法判断')) return null;
  let best = null, at = Infinity;
  for (const o of q.options) for (const w of o.words) {
    const i = text.indexOf(w);
    if (i !== -1 && i < at) { at = i; best = o.term; }
  }
  return best;
}

async function pickQuestions() {
  const history = (await DB.all('entries')).filter(e => e.quiz).sort((a, b) => b.id - a.id);
  const answers = key => history.map(e => e.quiz.find(r => r.key === key)).filter(Boolean);
  const streak = key => {
    let n = 0;
    for (const r of answers(key)) {
      if (r.outcome === 'skip') continue;      // AI 也判断不了的不算
      if (r.outcome !== 'match') break;
      n++;
    }
    return n;
  };
  // 问过的题保持解锁，不会因为后来答错又锁回去
  let open = 1;
  while (open < QUESTIONS.length &&
         (answers(QUESTIONS[open].key).length || streak(QUESTIONS[open - 1].key) >= UNLOCK_STREAK)) open++;

  // 最新解锁的那题必问，其余随机补
  const unlocked = QUESTIONS.slice(0, open);
  const newest = unlocked.pop();
  return [newest, ...unlocked.sort(() => Math.random() - 0.5)].slice(0, QUIZ_MAX);
}

// 在 box 里出题，返回一个 Promise，用户点「揭晓」后 resolve 出 {key: 选项}
function askQuiz(box, qs) {
  box.innerHTML = `<div class="card">
    <div class="sec-title">AI 观察中 · 你先看看</div>
    ${qs.map(q => `<div class="quiz-q" data-key="${q.key}">
      <b>${esc(q.ask)}</b> <span class="tiny muted">${esc(q.tip)}</span>
      <div class="qopts">
        ${q.options.map(o => `<button class="qopt" data-v="${esc(o.term)}">${FIG[o.term] || ''}<span>${esc(o.term)}</span></button>`).join('')}
        <button class="qopt unsure" data-v="${UNSURE}"><span>${UNSURE}</span></button>
      </div>
    </div>`).join('')}
    <div class="row">
      <button class="primary" id="quiz-done" disabled>看看 AI 怎么说</button>
      <span class="tiny muted" id="quiz-wait"></span>
    </div>
  </div>`;

  const picked = {};
  return new Promise(resolve => {
    box.querySelectorAll('.quiz-q').forEach(el => el.querySelectorAll('.qopt').forEach(b => b.onclick = () => {
      el.querySelectorAll('.qopt').forEach(x => x.classList.toggle('on', x === b));
      picked[el.dataset.key] = b.dataset.v;
      $('#quiz-done').disabled = Object.keys(picked).length < qs.length;
    }));
    $('#quiz-done').onclick = () => {
      $('#quiz-done').disabled = true;
      $('#quiz-wait').innerHTML = '<span class="spin"></span> 等 AI 看完…';
      resolve(picked);
    };
  });
}

function gradeQuiz(qs, picked, data) {
  return qs.map(q => {
    const user = picked[q.key], ai = aiAnswer(q, data);
    const outcome = !ai ? 'skip' : user === UNSURE ? 'unsure' : user === ai ? 'match' : 'diff';
    return { key: q.key, user, ai, aiText: q.ai(data), outcome };
  });
}

async function reviewMissed(results) {
  for (const r of results) if (r.outcome === 'diff' || r.outcome === 'unsure') await reviewNow(r.ai);
}

function renderCompare(results) {
  if (!results?.length) return '';
  const mini = (term, who) => FIG[term]
    ? `<div class="figmini" title="${esc(who)}">${FIG[term]}<div class="tiny muted">${esc(who)}：${esc(term)}</div></div>` : '';
  return `<div class="card">
    <div class="sec-title">你的观察 vs AI</div>
    ${results.map(r => {
      const q = QUESTIONS.find(q => q.key === r.key);
      const line = {
        match:  `✓ 你选「${r.user}」，AI 也是这么看的。`,
        diff:   `你选「${r.user}」，AI 看到的是「${r.ai}」。「${r.ai}」已加入复习。`,
        unsure: `你没看出来，AI 看到的是「${r.ai}」。「${r.ai}」已加入复习。`,
        skip:   r.user === UNSURE ? '这张照片 AI 也判断不了，和你一样。' : `这张照片 AI 也判断不了，你选的「${r.user}」暂时无法核对。`,
      }[r.outcome];
      const figs = r.outcome === 'diff' ? mini(r.user, '你选') + mini(r.ai, 'AI')
                 : r.outcome === 'unsure' ? mini(r.ai, 'AI') : '';
      return `<div class="feat cmp ${r.outcome}${figs ? ' withfig' : ''}">
        <div>
          <b>${esc(q?.ask || r.key)}</b>
          <div class="obs">${esc(line)}</div>
          <div class="why">AI 原话：${esc(r.aiText)}</div>
        </div>
        ${figs}
      </div>`;
    }).join('')}
  </div>`;
}
