/* =========================================================================
   5. 渲染
   ========================================================================= */

const CONF = { high:['高','' ], medium:['中','med'], low:['低','low'] };

// 模型用的说法和示意图标题不完全一致，短的写法指到同一张图
const FIG_ALIAS = [
  ['花萼', '花萼／萼片'], ['萼片', '花萼／萼片'],
  ['花瓣', '花冠／花瓣'], ['花冠', '花冠／花瓣'],
  ['雌蕊', '雌蕊与心皮'], ['心皮', '雌蕊与心皮'],
  ['辐射对称', '辐射对称花'], ['两侧对称', '两侧对称花'],
  ['舌状花', '舌状花与管状花'], ['管状花', '舌状花与管状花'],
  ['中轴胎座', '胎座'], ['侧膜胎座', '胎座'],
  ['箭形', '箭形与戟形'], ['戟形', '箭形与戟形'],
  ['楔形', '楔形基'], ['偏斜', '叶基偏斜'],
];
const FIG_HITS = [...Object.keys(FIG).map(k => [k, k]), ...FIG_ALIAS]
  .sort((a, b) => b[0].length - a[0].length);

// 长词优先，避免「对生」再命中「交互对生」里的那两个字；「未见 / 无」后面的词不画
function matchFigs(text, limit = 2) {
  if (!text) return [];
  const used = [], found = [];
  for (const [label, key] of FIG_HITS) {
    if (!FIG[key]) continue;
    let from = 0;
    while (from < text.length) {
      const i = text.indexOf(label, from);
      if (i < 0) break;
      const covered = used.some(([a, b]) => i < b && i + label.length > a);
      const prefix = text.slice(Math.max(0, i - 3), i);
      if (!covered) {
        used.push([i, i + label.length]);
        const negated = /未见|没有|无|不是|非/.test(prefix);
        if (!negated && !found.includes(key)) found.push(key);
        if (!negated) break;
      }
      from = i + 1;
    }
    if (found.length >= limit) break;
  }
  return found;
}

function figChips(keys) {
  if (!keys.length) return '';
  return `<span class="figchips">${keys.map(k =>
    `<span class="figchip" title="${esc(k)}">${FIG[k]}<span class="tiny muted">${esc(k)}</span></span>`
  ).join('')}</span>`;
}

function renderResult(d, quiz) {
  const [ct, cc] = CONF[d.identification.confidence] || ['?',''];
  const id = d.identification;

  const dl = obj => `<dl class="grid">${Object.entries(obj).map(([k, v]) =>
    `<dt>${k}</dt><dd>${esc(v)}${figChips(matchFigs(String(v)))}</dd>`).join('')}</dl>`;

  return `
  <div class="card veil ${quiz ? 'hidden' : ''}" id="idcard">
    <div class="veil-body">
      <div class="spread">
        <div>
          <div style="font-size:22px;font-weight:650">${esc(id.common_name_zh)}</div>
          <div class="sci muted">${esc(id.scientific_name)} · ${esc(id.common_name_en)}</div>
        </div>
        <span class="pill ${cc}">把握 ${ct}</span>
      </div>
      <div style="margin-top:8px" class="tiny muted">
        ${esc(id.order_latin)} → <b>${esc(id.family_zh)} ${esc(id.family_latin)}</b>
      </div>
      <p style="margin:14px 0 0">${esc(id.reasoning)}</p>
    </div>
    <div class="reveal" onclick="this.parentNode.classList.remove('hidden')">
      <button class="ghost">先自己看完特征 → 点这里揭晓名字</button>
    </div>
  </div>

  <div class="card">
    <div class="sec-title">鉴别特征 Diagnostic features</div>
    ${d.diagnostic_features.map(f => {
      const chips = figChips(matchFigs(`${f.feature} ${f.observation}`));
      return `<div class="feat${chips ? ' withfig' : ''}">
        <div>
          <b>${esc(f.feature)}</b>
          <div class="obs">${esc(f.observation)}</div>
          <div class="why">→ ${esc(f.significance)}</div>
        </div>
        ${chips}
      </div>`;
    }).join('')}

    <div class="sec-title">习性与茎叶 Habit</div>
    ${dl({'生活型':d.habit.growth_form,'茎':d.habit.stem,'叶序':d.habit.phyllotaxy})}

    <div class="sec-title">叶 Leaf</div>
    ${dl({'单叶/复叶':d.leaf.simple_or_compound,'叶形':d.leaf.shape,'叶缘':d.leaf.margin,
          '叶脉':d.leaf.venation,'叶尖':d.leaf.apex,'叶基':d.leaf.base,
          '叶面':d.leaf.surface,'叶柄/托叶':d.leaf.petiole_stipule})}

    <div class="sec-title">花与果 Reproductive</div>
    ${dl({'花序':d.reproductive.inflorescence,'对称性':d.reproductive.symmetry,
          '花被':d.reproductive.perianth,'雄蕊/雌蕊':d.reproductive.androecium_gynoecium,
          '果实':d.reproductive.fruit})}

    <div class="sec-title">易混淆 Lookalikes</div>
    ${d.lookalikes.map(l => {
      const chips = figChips(matchFigs(l.how_to_distinguish));
      return `<div class="feat${chips ? ' withfig' : ''}">
        <div><b>${esc(l.name)}</b>
          <div class="why">区分点：${esc(l.how_to_distinguish)}</div></div>
        ${chips}
      </div>`;
    }).join('')}

    <div class="sec-title">下一步观察</div>
    <p style="margin:0 0 12px">${esc(d.next_observation)}</p>
    <p class="tiny muted" style="margin:0">⚠ ${esc(d.uncertainty)}</p>
  </div>

  <div class="card">
    <div class="sec-title">本次沉淀的术语（已加入卡片库）</div>
    ${d.glossary.map(g => {
      const chips = figChips(matchFigs(g.term_zh, 1));
      return `<div class="feat${chips ? ' withfig' : ''}">
        <div>
          <b>${esc(g.term_zh)} <span class="muted sci" style="font-weight:400">${esc(g.term_en)}</span></b>
          <div class="obs">${esc(g.definition)}</div>
          <div class="why">本例：${esc(g.seen_here)}</div>
        </div>
        ${chips}
      </div>`;
    }).join('')}
  </div>`;
}
