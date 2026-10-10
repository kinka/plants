/* =========================================================================
   3. API 调用
   ========================================================================= */
// 旧版按 provider 分三套字段。没填过新字段时，从那边把当前那套读出来
function legacy(key, fallback) {
  const p = localStorage.getItem('provider') || 'cpa';
  const map = {
    cpa:       { base: 'cpa_base_url', key: 'cpa_key', model: 'cpa_model',
                 baseDefault: 'https://api.earnrmb.online', modelDefault: 'gemini-flash' },
    anthropic: { base: null, key: 'key', model: 'model',
                 baseDefault: 'https://api.anthropic.com', modelDefault: 'claude-opus-5' },
  }[p];
  if (!map) return key === 'key' ? '' : fallback;
  if (key === 'base') return (map.base && localStorage.getItem(map.base)) || map.baseDefault || fallback;
  if (key === 'model') return localStorage.getItem(map.model) || map.modelDefault || fallback;
  return (map.key && localStorage.getItem(map.key)) || '';
}

const cfg = {
  get baseUrl() { return localStorage.getItem('api_base') || legacy('base', 'https://api.earnrmb.online'); },
  get apiKey()  { const v = localStorage.getItem('api_key'); return v !== null ? v : legacy('key'); },
  get model()   { return localStorage.getItem('api_model') || legacy('model', 'gemini-flash'); },
  get effort()  { return localStorage.getItem('effort') || 'medium' },
  // 随机练习的地区（iNaturalist place），默认全中国
  get practicePlaceId()   { return localStorage.getItem('practice_place_id') || '6903' },
  get practicePlaceName() { return localStorage.getItem('practice_place_name') || '中国' },
};

// 官方域名走 structured outputs，其余一律当 Anthropic 兼容的 /v1/messages
function apiKind(base = cfg.baseUrl) {
  try { return new URL(base).hostname === 'api.anthropic.com' ? 'anthropic' : 'compat'; }
  catch { return 'compat'; }
}

function v1Url(base, leaf) {
  const b = base.replace(/\/+$/, '');
  return /\/v1$/i.test(b) ? `${b}/${leaf}` : `${b}/v1/${leaf}`;
}

const userPrompt = (hint, n = 1) => {
  const lead = n > 1
    ? `下面 ${n} 张是同一株植物的不同角度（可能分别是整体、叶、花或果），请综合观察后再拆解，不要把每张当成不同的植物。`
    : '请拆解这株植物。';
  return hint ? `${lead}用户补充的线索：${hint}` : lead;
};

function imageParts(dataUrls) {
  return (Array.isArray(dataUrls) ? dataUrls : [dataUrls]).map(dataUrl => {
    const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) throw new Error('图片数据无效');
    return {
      b64: m[2],
      block: { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
    };
  });
}

// 兼容接口不支持 structured outputs，只能靠提示词约束 JSON 格式
const JSON_SYSTEM = `${SYSTEM}\n\n你必须严格输出且仅输出一个合法的 JSON 对象，不要输出任何 Markdown 代码块（如 \`\`\`json 等）或额外的闲聊文本。\n输出的 JSON 结构必须严格符合如下模板：\n${JSON_TEMPLATE}`;

// 去掉代码围栏和前后闲聊，只保留最外层 {...}
function parseModelJson(text, label) {
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1) text = text.substring(first, last + 1);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`无法解析 ${label} 输出的 JSON:\n${text}\n\n错误: ${e.message}`);
  }
}

async function errorMessage(r) {
  const t = await r.text();
  try { const j = JSON.parse(t); return j.error?.message || j.error || j.message || t; } catch { return t; }
}

async function analyze(dataUrls, hint) {
  const parts = imageParts(dataUrls);
  const prompt = userPrompt(hint, parts.length);
  const images = parts.map(p => p.block);
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const official = apiKind(base) === 'anthropic';
  let r;
  try {
    r = await fetch(v1Url(base, 'messages'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'authorization': `Bearer ${cfg.apiKey}`,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: official ? 16000 : 8192,
        system: official ? SYSTEM : JSON_SYSTEM,
        ...(official && { output_config: { effort: cfg.effort, format: { type: 'json_schema', schema: SCHEMA } } }),
        messages: [{ role: 'user', content: [...images, { type: 'text', text: prompt }] }]
      })
    });
  } catch (err) {
    throw new Error(`连接 ${base} 失败:\n${err.message}`);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}\n${await errorMessage(r)}`);

  const res = await r.json();
  if (res.stop_reason === 'refusal') throw new Error('模型拒绝了这次请求。换一张照片试试。');
  if (res.stop_reason === 'max_tokens') throw new Error('输出被 max_tokens 截断，结果不完整。');
  const text = official
    ? res.content.find(b => b.type === 'text')?.text
    : (res.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '');
  if (!text) throw new Error('响应中没有文本内容。');
  return {
    data: normalizeData(official ? JSON.parse(text) : parseModelJson(text, '模型')),
    usage: res.usage || { input_tokens: 0, output_tokens: 0 }
  };
}

// claude-opus-4-5、claude-opus-4.5-20251101、claude-opus-4-5-latest 是同一个模型
function claudeKey(id) {
  return id.toLowerCase()
    .replace(/^anthropic\//, '')
    .replace(/\./g, '-')
    .replace(/-(\d{8}|latest)$/i, '');
}

function aliasRank(id) {
  if (/-latest$/i.test(id)) return 2;
  const d = id.match(/-(\d{8})$/);
  return d ? 1 + Number(d[1]) / 1e9 : 3;
}

// 只折叠 Claude：带日期的快照和 -latest 并进不带日期的 id，别的模型原样保留
function foldModels(ids) {
  const groups = new Map();
  let dropped = 0;
  for (const id of ids) {
    const key = /claude/i.test(id) ? claudeKey(id) : id;
    const prev = groups.get(key);
    if (!prev) { groups.set(key, id); continue; }
    dropped++;
    if (aliasRank(id) > aliasRank(prev)) groups.set(key, id);
  }
  return { ids: [...groups.values()], dropped };
}

async function fetchModels() {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  // 不带 anthropic-version / x-api-key，CPA 才走 OpenAI 的 /v1/models，返回倒写之前的原名
  const r = await fetch(v1Url(base, 'models'), {
    headers: { authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await errorMessage(r)}`);
  const ids = ((await r.json()).data || []).map(m => m.id).filter(Boolean);
  if (!ids.length) throw new Error('列表是空的');
  return foldModels(ids);
}
