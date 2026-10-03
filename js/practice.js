/* =========================================================================
   随机练习：从 iNaturalist 随机取一张本地区的研究级被子植物照片
   · 研究级 = 至少两位社区成员鉴定一致，可以当作「标准答案」和 AI 对照
   · 公开 API，不需要 key；照片在 S3 上，允许跨域，可以直接画进 canvas
   · 物种名要等 AI 看完再揭晓，所以原观察链接也放到揭晓时才给
   ========================================================================= */
const INAT = 'https://api.inaturalist.org/v1';
const PRACTICE_TAXON = 47125;   // 被子植物（开花植物）

async function fetchPracticePhoto() {
  const q = new URLSearchParams({
    taxon_id: PRACTICE_TAXON, place_id: cfg.practicePlaceId, quality_grade: 'research',
    photos: 'true', rank: 'species', order_by: 'random', per_page: '1', locale: 'zh-CN',
  });
  const r = await fetch(`${INAT}/observations?${q}`);
  if (!r.ok) throw new Error(`iNaturalist 返回 HTTP ${r.status}`);
  const o = (await r.json()).results[0];
  if (!o) throw new Error(`「${cfg.practicePlaceName}」没有找到研究级照片，换个大一点的地区试试`);

  const p = o.photos[0];
  const blob = await (await fetch(p.url.replace('/square.', '/large.'))).blob();
  return {
    img: await toDataUrl(blob),
    source: {
      site: 'iNaturalist', uri: o.uri, place: o.place_guess || '',
      name_zh: o.taxon.preferred_common_name || '', sci: o.taxon.name,
      attribution: p.attribution, license: p.license_code || '',
    },
  };
}

// 设置页的地区搜索：优先给行政区（admin_level 有值），公园、植物园之类的小地点排后面
async function searchPlaces(text) {
  const r = await fetch(`${INAT}/places/autocomplete?${new URLSearchParams({ q: text, per_page: '20' })}`);
  if (!r.ok) throw new Error(`iNaturalist 返回 HTTP ${r.status}`);
  const rs = (await r.json()).results;
  return rs.sort((a, b) => (b.admin_level != null) - (a.admin_level != null))
           .map(p => ({ id: p.id, name: p.display_name }));
}

// 揭晓：社区鉴定 vs AI 鉴定（按学名比，物种相同 / 属相同 / 不一致）
function renderSource(src, d) {
  if (!src) return '';
  const ai = (d.identification.scientific_name || '').trim().toLowerCase().split(/\s+/);
  const ans = src.sci.toLowerCase().split(/\s+/);
  const verdict = ai[0] === ans[0] && ai[1] === ans[1] ? '✓ AI 认对了'
                : ai[0] === ans[0] ? 'AI 认到了属，种不一样'
                : 'AI 和社区鉴定不一致，以社区鉴定为准';
  return `<div class="card">
    <div class="sec-title">揭晓 · iNaturalist 社区鉴定</div>
    <div style="font-size:20px;font-weight:650">${esc(src.name_zh || src.sci)}</div>
    <div class="sci muted">${esc(src.sci)}</div>
    <div class="obs" style="margin-top:8px">${esc(verdict)}（AI：${esc(d.identification.common_name_zh)} ${esc(d.identification.scientific_name)}）</div>
    <div class="tiny muted" style="margin-top:8px">
      ${src.place ? `${esc(src.place)} · ` : ''}照片 ${esc(src.attribution)} ·
      <a class="reallink" target="_blank" rel="noopener" href="${esc(src.uri)}">查看原观察</a>
    </div>
  </div>`;
}
