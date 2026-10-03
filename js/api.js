/* =========================================================================
   3. API 调用
   ========================================================================= */
const cfg = {
  get provider()    { return localStorage.getItem('provider') || 'cpa' },
  get cpaBaseUrl()  { return localStorage.getItem('cpa_base_url') || 'https://api.earnrmb.online' },
  get cpaKey()      { return localStorage.getItem('cpa_key') || '' },
  get cpaModel()    { return localStorage.getItem('cpa_model') || 'gemini-flash' },
  get ollamaHost()  { return localStorage.getItem('ollama_host') || 'http://127.0.0.1:11434' },
  get ollamaModel() { return localStorage.getItem('ollama_model') || 'qwen3.8:27b-mlx' },
  get key()         { return localStorage.getItem('key') || '' },
  get model()       { return localStorage.getItem('model') || 'claude-opus-5' },
  get effort()      { return localStorage.getItem('effort') || 'medium' },
};

const userPrompt = hint => hint ? `请拆解这株植物。用户补充的线索：${hint}` : '请拆解这株植物。';

// CPA / Ollama 不支持 structured outputs，只能靠提示词约束 JSON 格式
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

async function analyze(dataUrl, hint) {
  const [, media, b64] = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  const image = { type: 'image', source: { type: 'base64', media_type: media, data: b64 } };

  // 1. CPA 代理节点 (gemini-flash / earnrmb.online)
  if (cfg.provider === 'cpa') {
    const baseUrl = cfg.cpaBaseUrl.replace(/\/+$/, '');
    let r;
    try {
      r = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.cpaKey,
          'authorization': `Bearer ${cfg.cpaKey}`,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: cfg.cpaModel,
          max_tokens: 8192,
          system: JSON_SYSTEM,
          messages: [{ role: 'user', content: [image, { type: 'text', text: userPrompt(hint) }] }]
        })
      });
    } catch (err) {
      throw new Error(`连接 CPA 代理失败 (${baseUrl}):\n${err.message}`);
    }
    if (!r.ok) throw new Error(`CPA 代理错误 HTTP ${r.status}:\n${await errorMessage(r)}`);

    const res = await r.json();
    const text = res.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    if (!text) throw new Error('CPA 代理未返回文本内容。');
    return {
      data: normalizeData(parseModelJson(text, 'CPA 模型')),
      usage: res.usage || { input_tokens: 0, output_tokens: 0 }
    };
  }

  // 2. 本地 Ollama
  if (cfg.provider === 'ollama') {
    const host = cfg.ollamaHost.replace(/\/+$/, '');
    let r;
    try {
      r = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: cfg.ollamaModel,
          stream: false,
          messages: [
            { role: 'system', content: JSON_SYSTEM },
            { role: 'user', content: userPrompt(hint), images: [b64] }
          ],
          format: 'json'
        })
      });
    } catch (err) {
      throw new Error(`连接本地 Ollama 失败 (${host})。\n请确认 Ollama 正在运行（终端可执行: ollama serve）。\n原始错误: ${err.message}`);
    }
    if (!r.ok) throw new Error(`Ollama 错误 HTTP ${r.status}:\n${await errorMessage(r)}`);

    const res = await r.json();
    const text = res.message?.content || '';
    if (!text) throw new Error('Ollama 没有返回内容。');
    return {
      data: normalizeData(parseModelJson(text, '模型')),
      usage: { input_tokens: res.prompt_eval_count || 0, output_tokens: res.eval_count || 0 }
    };
  }

  // 3. Anthropic 官方 API
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.key,
      'anthropic-version': '2023-06-01',
      // 没有这一行浏览器直连会被 CORS 拒绝
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 16000,
      system: SYSTEM,
      // effort 控制思考深度，format 强制结构化输出——两者同在 output_config 下
      output_config: {
        effort: cfg.effort,
        format: { type: 'json_schema', schema: SCHEMA }
      },
      messages: [{ role: 'user', content: [image, { type: 'text', text: userPrompt(hint) }] }]
    })
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}\n${await errorMessage(r)}`);

  const res = await r.json();
  if (res.stop_reason === 'refusal') throw new Error('模型拒绝了这次请求。换一张照片试试。');
  if (res.stop_reason === 'max_tokens') throw new Error('输出被 max_tokens 截断，结果不完整。');

  // 思考块在前，正文在后 —— 取第一个 text 块
  const text = res.content.find(b => b.type === 'text')?.text;
  if (!text) throw new Error('响应中没有文本内容。');
  return { data: normalizeData(JSON.parse(text)), usage: res.usage };
}
