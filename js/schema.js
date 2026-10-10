/* =========================================================================
   2. JSON Schema —— 这就是这个应用的「植物学观察大纲」
      模型被强制逐项填写；填不出来必须写「无法判断」而不是编。
      注意 Anthropic structured outputs 的限制：
        · 每个 object 都要 additionalProperties:false 且列全 required
        · 不支持 minLength/maxLength/minItems 等约束 → 用 description 引导
   ========================================================================= */
const S = (props) => ({
  type:'object', properties:props, required:Object.keys(props), additionalProperties:false
});
const T = (desc) => ({type:'string', description:desc});

const SCHEMA = S({
  identification: S({
    confidence:      {type:'string', enum:['high','medium','low'],
                      description:'鉴定到属/种的把握。照片信息不足时必须给 low。'},
    common_name_zh:  T('中文常用名。无把握写「无法判断」。'),
    common_name_en:  T('英文常用名，没有则写 —'),
    scientific_name: T('拉丁学名（属 + 种加词），只到属就写 Genus sp.'),
    family_zh:       T('科的中文名，如「唇形科」'),
    family_latin:    T('科的拉丁名，如 Lamiaceae'),
    order_latin:     T('目的拉丁名，如 Lamiales'),
    reasoning:       T('2-4 句：你是**从哪些可见形态特征**一步步推到这个科属的。像检索表一样推理，不要用「看起来像」。')
  }),
  habit: S({
    growth_form: T('生活型：草本/灌木/乔木/藤本/附生 等，并说明依据'),
    stem:        T('茎的形态：横切面形状（圆/四棱/三棱）、有无毛、直立或匍匐'),
    phyllotaxy:  T('叶序：互生 alternate / 对生 opposite / 轮生 whorled / 基生 rosulate')
  }),
  leaf: S({
    simple_or_compound: T('单叶 simple / 复叶 compound（羽状 pinnate、掌状 palmate…）'),
    shape:   T('叶形：卵形 ovate / 披针形 lanceolate / 心形 cordate / 肾形 reniform …'),
    margin:  T('叶缘：全缘 entire / 锯齿 serrate / 重锯齿 biserrate / 圆齿 crenate / 裂 lobed …'),
    venation:T('叶脉：羽状脉 pinnate / 掌状脉 palmate / 平行脉 parallel / 弧形脉 arcuate'),
    apex:    T('叶尖：渐尖 acuminate / 急尖 acute / 钝 obtuse / 凹 emarginate …'),
    base:    T('叶基：楔形 cuneate / 心形 cordate / 偏斜 oblique / 抱茎 amplexicaul …'),
    surface: T('叶面：质地、光泽、被毛情况（无毛 glabrous / 柔毛 pubescent / 腺点…）'),
    petiole_stipule: T('叶柄与托叶：有无叶柄、托叶形态（托叶是重要的科级特征）')
  }),
  reproductive: S({
    flower_visible: {type:'boolean', description:'照片中是否能看到花'},
    inflorescence:  T('花序类型：总状 raceme / 伞形 umbel / 头状 capitulum / 聚伞 cyme / 穗状 spike…；无花写「未见花」'),
    symmetry:       T('花对称性：辐射对称 actinomorphic / 两侧对称 zygomorphic；未见花写「未见花」'),
    perianth:       T('花被：萼片与花瓣数目、离合情况（合瓣/离瓣）、颜色'),
    androecium_gynoecium: T('雄蕊数目与着生、雌蕊心皮数、子房位置（上位 superior / 下位 inferior）'),
    fruit:          T('果实类型：蒴果 capsule / 瘦果 achene / 浆果 berry / 荚果 legume…；未见果写「未见果」')
  }),
  diagnostic_features: {
    type:'array',
    description:'3-5 条**鉴别特征**——真正把它锁定到这个科属的关键，而非泛泛描述。',
    items: S({
      feature:      T('特征名称，中文术语 + 英文，如「四棱茎 quadrangular stem」'),
      observation:  T('你在这张照片里具体看到了什么'),
      significance: T('为什么这个特征有分类学意义：它排除了谁、指向了谁')
    })
  },
  lookalikes: {
    type:'array',
    description:'1-3 个容易混淆的类群，尤其是同科不同属或形似不同科的。',
    items: S({
      name:          T('易混淆者的中文名 + 拉丁名'),
      how_to_distinguish: T('用哪一个可观察的形态特征就能把两者分开')
    })
  },
  glossary: {
    type:'array',
    description:'本次实际用到、且值得初学者记住的形态学术语，3-8 条。不要收录「叶子」这种常识词。',
    items: S({
      term_zh:   T('中文术语'),
      term_en:   T('英文/拉丁术语'),
      definition:T('一句话定义，说明这个术语描述的是哪个器官的哪种状态'),
      seen_here: T('在这张照片里它具体表现为什么')
    })
  },
  next_observation: T('若要把鉴定推进一步，下次该补看/补拍哪个部位？为什么那个部位关键？'),
  uncertainty: T('明确说出这次判断的薄弱环节：哪些必要特征照片里看不到。')
});

const SYSTEM = `你是一位植物分类学家，同时也是野外实习课的老师。用户会给你同一株植物的一张或几张照片，你的任务不是"报出名字"，而是**示范一次专业的形态观察**。

工作原则：
1. 严格基于照片中**实际可见**的证据。看不见的部位一律写"无法判断"或"未见花/未见果"，绝不根据物种猜测反推形态描述——那是循环论证。
2. 所有形态描述必须使用规范术语，中文术语后附英文或拉丁文，让用户建立术语对照。
3. reasoning 字段要写成检索表式的推理链：从最上位的特征逐步收窄（如：对生叶 + 四棱茎 + 唇形花冠 → 唇形科），而不是"整体感觉像"。
4. 置信度要诚实。仅凭照片，多数情况下只能可靠地定到科或属；能定到种的往往是形态极特殊或栽培常见的类群。宁可给 low 也不要编造种加词。
5. diagnostic_features 是教学核心：每条都要说清"这个特征排除了什么、指向了什么"。
6. glossary 只收本次真正用到的术语，这些会变成用户的记忆卡片。

用中文输出。`;

const JSON_TEMPLATE = JSON.stringify({
  identification: {
    confidence: "high | medium | low",
    common_name_zh: "中文常用名",
    common_name_en: "英文常用名",
    scientific_name: "拉丁学名",
    family_zh: "科中文名",
    family_latin: "科拉丁名",
    order_latin: "目拉丁名",
    reasoning: "2-4句：从哪些可见形态特征一步步推到这个科属，检索表式推理"
  },
  habit: {
    growth_form: "生活型及依据",
    stem: "茎形态",
    phyllotaxy: "叶序"
  },
  leaf: {
    simple_or_compound: "单叶/复叶",
    shape: "叶形",
    margin: "叶缘",
    venation: "叶脉",
    apex: "叶尖",
    base: "叶基",
    surface: "叶面",
    petiole_stipule: "叶柄与托叶"
  },
  reproductive: {
    flower_visible: false,
    inflorescence: "花序",
    symmetry: "对称性",
    perianth: "花被",
    androecium_gynoecium: "雄蕊与雌蕊",
    fruit: "果实"
  },
  diagnostic_features: [
    { feature: "特征名称（中+英）", observation: "可见事实", significance: "分类学意义（排除了谁、指向了谁）" }
  ],
  lookalikes: [
    { name: "混淆种", how_to_distinguish: "区分特征" }
  ],
  glossary: [
    { term_zh: "中文术语", term_en: "英文术语", definition: "一句话定义", seen_here: "本照片中的表现" }
  ],
  next_observation: "下次补拍哪个部位及原因",
  uncertainty: "本次判断的薄弱环节"
}, null, 2);

function normalizeData(raw) {
  const d = raw || {};
  return {
    identification: {
      confidence: d.identification?.confidence || 'low',
      common_name_zh: d.identification?.common_name_zh || '无法判断',
      common_name_en: d.identification?.common_name_en || '—',
      scientific_name: d.identification?.scientific_name || 'Genus sp.',
      family_zh: d.identification?.family_zh || '无法判断',
      family_latin: d.identification?.family_latin || '—',
      order_latin: d.identification?.order_latin || '—',
      reasoning: d.identification?.reasoning || '无推理过程'
    },
    habit: {
      growth_form: d.habit?.growth_form || '—',
      stem: d.habit?.stem || '—',
      phyllotaxy: d.habit?.phyllotaxy || '—'
    },
    leaf: {
      simple_or_compound: d.leaf?.simple_or_compound || '—',
      shape: d.leaf?.shape || '—',
      margin: d.leaf?.margin || '—',
      venation: d.leaf?.venation || '—',
      apex: d.leaf?.apex || '—',
      base: d.leaf?.base || '—',
      surface: d.leaf?.surface || '—',
      petiole_stipule: d.leaf?.petiole_stipule || '—'
    },
    reproductive: {
      flower_visible: Boolean(d.reproductive?.flower_visible),
      inflorescence: d.reproductive?.inflorescence || '未见花',
      symmetry: d.reproductive?.symmetry || '未见花',
      perianth: d.reproductive?.perianth || '未见花',
      androecium_gynoecium: d.reproductive?.androecium_gynoecium || '未见',
      fruit: d.reproductive?.fruit || '未见果'
    },
    diagnostic_features: Array.isArray(d.diagnostic_features) ? d.diagnostic_features.map(f => ({
      feature: f.feature || '特征',
      observation: f.observation || '—',
      significance: f.significance || '—'
    })) : [],
    lookalikes: Array.isArray(d.lookalikes) ? d.lookalikes.map(l => ({
      name: l.name || '—',
      how_to_distinguish: l.how_to_distinguish || '—'
    })) : [],
    glossary: Array.isArray(d.glossary) ? d.glossary.map(g => ({
      term_zh: g.term_zh || '术语',
      term_en: g.term_en || '',
      definition: g.definition || '—',
      seen_here: g.seen_here || '—'
    })) : [],
    next_observation: d.next_observation || '—',
    uncertainty: d.uncertainty || '—'
  };
}
