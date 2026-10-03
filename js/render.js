/* =========================================================================
   5. 渲染
   ========================================================================= */

const CONF = { high:['高','' ], medium:['中','med'], low:['低','low'] };

function renderResult(d, quiz) {
  const [ct, cc] = CONF[d.identification.confidence] || ['?',''];
  const id = d.identification;

  const dl = obj => `<dl class="grid">${Object.entries(obj)
    .map(([k,v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

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
    ${d.diagnostic_features.map(f => `
      <div class="feat">
        <b>${esc(f.feature)}</b>
        <div class="obs">${esc(f.observation)}</div>
        <div class="why">→ ${esc(f.significance)}</div>
      </div>`).join('')}

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
    ${d.lookalikes.map(l => `<div class="feat"><b>${esc(l.name)}</b>
      <div class="why">区分点：${esc(l.how_to_distinguish)}</div></div>`).join('')}

    <div class="sec-title">下一步观察</div>
    <p style="margin:0 0 12px">${esc(d.next_observation)}</p>
    <p class="tiny muted" style="margin:0">⚠ ${esc(d.uncertainty)}</p>
  </div>

  <div class="card">
    <div class="sec-title">本次沉淀的术语（已加入卡片库）</div>
    ${d.glossary.map(g => `<div class="feat">
        <b>${esc(g.term_zh)} <span class="muted sci" style="font-weight:400">${esc(g.term_en)}</span></b>
        <div class="obs">${esc(g.definition)}</div>
        <div class="why">本例：${esc(g.seen_here)}</div>
      </div>`).join('')}
  </div>`;
}
