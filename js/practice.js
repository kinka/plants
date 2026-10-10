/* =========================================================================
   随机练习：从 iNaturalist 随机取一株本地区的研究级被子植物
   · 研究级 = 至少两位社区成员鉴定一致，可以当作「标准答案」和 AI 对照
   · 同一条观察里往往有整体、叶、花、果几个角度，优先挑照片多的，最多带 4 张
   · 公开 API，不需要 key；照片在 S3 上，允许跨域，可以直接画进 canvas
   · 物种名要等 AI 看完再揭晓，所以原观察链接也放到揭晓时才给
   ========================================================================= */
const INAT = 'https://api.inaturalist.org/v1';
const PRACTICE_TAXON = 47125;   // 被子植物（开花植物）
const PRACTICE_SHOTS = 4;

async function fetchPhotoBlob(url) {
  const large = url.replace('/square.', '/large.');
  let r = await fetch(large);
  if (!r.ok) r = await fetch(url.replace('/square.', '/medium.'));
  if (!r.ok) throw new Error(`照片 HTTP ${r.status}`);
  return r.blob();
}

async function fetchPracticePhoto() {
  const q = new URLSearchParams({
    taxon_id: PRACTICE_TAXON, place_id: cfg.practicePlaceId, quality_grade: 'research',
    photos: 'true', rank: 'species', order_by: 'random', per_page: '30', locale: 'zh-CN',
    _: Math.random().toString(36).slice(2),   // API 前面有 CDN 缓存 5 分钟，同一 URL 会一直返回同一批
  });
  const r = await fetch(`${INAT}/observations?${q}`);
  if (!r.ok) throw new Error(`iNaturalist 返回 HTTP ${r.status}`);
  const pool = (await r.json()).results.filter(o => o.taxon && o.photos?.some(p => p.url));
  if (!pool.length) throw new Error(`「${cfg.practicePlaceName}」没有找到研究级照片，换个大一点的地区试试`);

  // 这一批里挑照片最多的。张数相同则保留 API 的随机顺序（sort 稳定）
  pool.sort((a, b) => b.photos.length - a.photos.length);
  const o = pool[0];
  const shots = o.photos.filter(p => p.url).slice(0, PRACTICE_SHOTS);
  const imgs = (await Promise.all(shots.map(async p => {
    try { return await toDataUrl(await fetchPhotoBlob(p.url), 1600); }
    catch { return null; }
  }))).filter(Boolean);
  if (!imgs.length) throw new Error('照片下载失败，再试一次');

  const credits = [...new Set(shots.map(p => p.attribution).filter(Boolean))];
  return {
    imgs,
    source: {
      site: 'iNaturalist', uri: o.uri, place: o.place_guess || '',
      name_zh: o.taxon.preferred_common_name || '', sci: o.taxon.name,
      attribution: credits.length > 2 ? `${credits[0]} 等 ${imgs.length} 张` : credits.join('；'),
      license: [...new Set(shots.map(p => p.license_code).filter(Boolean))].join(' / '),
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
