---
name: about_quality_scoring_v1
description: 对优惠券网站商家 About 文本进行 10 分制质检评分（线上/AI/可选OP），输出分项分数、优劣势与可执行建议（中文）。
---

## Purpose
本 skill 只负责对「单个商家」的 About 文本做 10 分制质检评分，并对不同版本（线上/AI/可选 OP）给出分项分数、优劣势与可执行修改建议，最后对比选出最佳版本。

## Scope / 边界（必须遵守）
- 输入：`TermID`、`TermName`、`Domain`、`Country`、`About-线上`、`About-AI优化`、`About-OP复核（可空）`
- 输出：对每个版本独立打分 + 最佳版本对比结论
- 明确不做：任何统计/批量汇总/看板/历史分析/可视化/排名榜单（只评价当前输入的 2-3 个版本）

## Inputs
请将以下字段以结构化方式提供（推荐 JSON；也可用表格/键值对，但字段名必须清晰）。**团队长期使用时，统一以本节“推荐输入 JSON 契约”为准**：
- `TermID`：字符串或数字（输出中原样回填为字符串）
- `TermName`：商家真实名称（仅用于检测禁用项；不得作为商家名出现在输出与建议中）
- `Domain`：商家域名（允许出现在输出的 `meta.Domain`；不得作为商家名/指代出现在其他字段）
- `Country`：国家代码（必须在 `references/country-language-map.json` 有映射）
- `About_online`：线上版本 About 文本（必填）
- `About_ai`：AI 优化版本 About 文本（必填）
- `About_op`：OP 复核版本 About 文本（可空；trim 后为空视为缺失）

### 推荐输入 JSON 契约（唯一标准）
{
  "TermID": "123",
  "TermName": "（真实商家名）",
  "Domain": "example.com",
  "Country": "US",
  "About_online": "…",
  "About_ai": "…",
  "About_op": ""
}

约定：
- `About_online` 与 `About_ai` 必填且为字符串；可为空白但会被视为“过短/无效文本”并扣分。
- `About_op`：`trim()` 后为空字符串则视为缺失，不评分、不出现在 `versions_present`。

### 兼容字段映射（仅为接入兼容；输出仍用 online/ai/op）
若上游暂时用中文连字符字段，也可接受并映射为以下：
- `About-线上` → `About_online`
- `About-AI优化` → `About_ai`
- `About-OP复核` → `About_op`

字段命名兼容建议（避免接入歧义）：
- 若上游已固定使用中文连字符字段（`About-线上/About-AI优化/About-OP复核`），也可直接提供；但请确保能明确对应到 `online/ai/op` 三个版本。
- 本 skill 的输出 `version` 字段只使用 `online/ai/op`。

## Hard Rules / 关键硬规则（违反将重扣 A）
1) 商家名统一占位：
   - 文本中指代商家时，必须且只能使用 `{Mer.}`。
   - 输出（包括 strengths/weaknesses/suggestions/key_deltas/notes）中商家指代也必须只使用 `{Mer.}`。
   - 允许在 `meta.Domain` 出现域名；但不得在其他字段用 `Domain`/域名来指代商家或替代 `{Mer.}`。
2) 禁止第一人称：
   - 输出与建议中不得出现第一人称（I/we/our/我/我们/咱们等）。
   - 输入文本若出现第一人称，属于扣分点（见 A）。
3) 禁止编造事实：
   - 只能基于输入 About 文本中已出现的信息做评价与改写建议。
   - 不得新增不存在的业务/政策/价格/物流/售后/覆盖地区/年限/资质/承诺等事实。
   - 允许提出“应补充哪些信息”的建议，但不得在建议里直接写出具体事实内容。
4) 语言与本土化判断：
   - `Country` 用于语言匹配与本土化表达习惯判断；映射表来自 `references/country-language-map.json`。
   - 映射值为语系代码（如 `en/de/fr/zh-tw`），用于判断语言匹配与本土化表达习惯。
   - 不要引入额外国家/语言维度；只依据该映射做“匹配/不匹配/直译腔”的判断。

## Output Format（必须：严格 JSON；不要 Markdown）
你必须只输出一个 JSON 对象（不包裹在 ``` 中，不要任何额外文本），字段必须完全一致：

{
  "meta": { "TermID": "...", "Domain": "...", "Country": "...", "versions_present": ["online","ai"] 或 ["online","ai","op"] },
  "results": [
    {
      "version": "online"|"ai"|"op",
      "score_total": 0-10（1位小数）,
      "score_breakdown": { "A":0-3, "B":0-4, "C":0-2, "D":0-1（均1位小数） },
      "strengths": ["..."],
      "weaknesses": ["..."],
      "suggestions": ["..."],
      "pass_for_publish": true/false
    }
  ],
  "comparison": {
    "best_version": "online"|"ai"|"op",
    "ranking": ["...按分数从高到低的version..."],
    "key_deltas": ["为什么最佳版本最好（2-5条）"]
  },
  "notes": "..."
}

### 输出字段硬约束
- `results` 中每个版本：
  - `strengths`：3-6 条；每条必须可追溯到 A/B/C/D 的某一类高分信号，且不要重复同一点。
  - `weaknesses`：3-6 条；必须对应实际问题（A/B/C/D），且不要重复同一点。
  - `suggestions`：2-5 条；必须是可执行的修改建议（可直接改句式/补信息点/删冗余），但不得编造事实。
- `pass_for_publish` 规则（必须严格执行）：
  - `score_total >= 8.0` 且 `A >= 2.0` 且 `B >= 3.0` 才为 `true`，否则 `false`。
- 并列胜负规则（comparison 用于排序与 best_version）：
  - 总分相同：优先 `B` 高者；再 `A` 高者；仍相同：`op > ai > online`。

## Scoring Rubric（必须：不增加维度；严格按 A/B/C/D）
总分 10，四个大类相加：
- A 基础规范与硬性质量（3.0）
- B 业务描述清晰度与信息完整（4.0）
- C SEO 语义与关键词自然覆盖（2.0）
- D 可读性与“非 AI 腔”（含本土化）（1.0）

评分方法建议：
- 先从满分开始（A=3/B=4/C=2/D=1），再按下列扣分规则逐条扣减。
- 每一项扣分要能在 `weaknesses` 与 `suggestions` 中被追溯（但不要把“扣了多少分”写进输出）。
- 分数保留 1 位小数。

### A（3.0）基础规范与硬性质量：扣分规则
1) 未使用 `{Mer.}` 或出现真实商家名/TermName/Domain 当商家名：
   - 该项出现则强制：`A <= 1.0`（建议落在 `0.5~1.0` 区间，按严重程度）
2) 第一人称：
   - `-0.5 / -0.8 / -1.0`（按频次与显眼程度）
3) 语法拼写/乱码/模板残留（如占位符、重复段落、未替换变量）：
   - `-0.3 / -0.6 / -1.0`
4) 语言与 Country 不匹配（参考 `references/country-language-map.json`）：
   - `-0.5 / -1.0`
5) 字数过短：
   - `-0.5 / -1.0`（阈值建议见 `references/rubric-cheatsheet.md`）
6) 字数过长、冗余、信息重复：
   - `-0.3 / -0.6 / -0.8`

### B（4.0）业务描述清晰度与信息完整：扣分规则
1) 未说明 `{Mer.}` 是什么/主营：
   - `-1.5 / -2.0`
2) 范围不具体、抽象口号为主（缺少“做什么/面向谁/覆盖什么品类或服务范围”）：
   - `-1.0 / -1.5`
3) 不自洽/泛化严重（前后矛盾、空泛堆叠、无法形成清晰业务画像）：
   - `-0.5 / -1.0`

### C（2.0）SEO 语义与关键词自然覆盖：扣分规则
1) 业务关键词缺失（用户搜得到的核心词缺失，如“优惠券/折扣/促销码/返利”等与具体品类/场景相关的词）：
   - `-0.8 / -1.2`
2) `{Mer.}` 不自然出现（硬插入、语法不通顺、过度重复）：
   - `-0.3 / -0.6`
3) 关键词堆砌/重复（同义词列表式堆叠、重复同一句或同一关键词过多）：
   - `-0.5 / -1.0`

### D（1.0）可读性与“非 AI 腔”（含本土化）：扣分规则
1) AI 模板腔/套话重复（如“致力于/提供最佳体验/一站式/不断创新”反复出现且无信息增量）：
   - `-0.3 / -0.6`
2) 生硬不通顺（不属于 A 的拼写语法错误，但读起来别扭）：
   - `-0.2 / -0.4`
3) 本土化不足（直译腔/不符合当地表达；与 Country 对应语言习惯不贴合）：
   - `-0.2 / -0.4 / -0.6`

## Version Handling（必须）
- 必须评分 `online` 与 `ai`。
- `op` 只有在 `About_op` 非空（trim 后仍有内容）时才评分并纳入对比。
- `notes` 必须说明：是否缺少 `op`，以及评分时采用的语言/本土化判断依据来自 `references/country-language-map.json`。

## Execution Checklist（内部自检；不要输出为文本）
- 输出严格为单个 JSON 对象（无多余文本）。
- 输出中只出现 `{Mer.}` 作为商家名，不出现 `TermName`、真实商家名、`Domain`。
- 不出现第一人称。
- strengths/weaknesses/suggestions 数量符合要求且不重复同一点。
- 分数范围正确，且 `A+B+C+D` 与 `total` 误差 <= 0.1。
- comparison 排序符合并列胜负规则。

## Team SOP（多人长期稳定使用建议）
目标：让不同同事在同样输入下，得到稳定、可校验、可落地的 JSON 评分结果。

1) 统一输入（推荐按“推荐输入 JSON 契约”提供）：
   - `About_online` 与 `About_ai` 必填；`About_op` 为空则缺失。
2) 生成输出：
   - 严格按本 skill 输出一个 JSON 对象；不要 Markdown、不要多余解释文本。
3) 本地门禁校验（推荐写入流程要求）：
   - 将输出保存为 `output.json` 后运行：
     - `node scripts/score-validator.mjs --file output.json --termname "你的TermName" --strict`
   - 若只想做基础 schema 校验，不启用严格门禁：
     - `node scripts/score-validator.mjs --file output.json --termname "你的TermName"`
4) examples 维护自检（多人协作时建议在修改 examples 后必跑）：
   - `node scripts/score-validator.mjs --lint-examples --examples assets/examples.jsonl`

验收标准（建议）：
- validator 基础校验必须通过（结构/分数范围/一致性）。
- 严格门禁（`--strict`）用于发布前/质检留档前的最终确认（可按团队流程选择是否强制）。

## Comparison Consistency Supplement
- `comparison.best_version`, `comparison.ranking`, and `comparison.key_deltas` must stay fully consistent with the final `results[].score_total` and `results[].score_breakdown`.
- `key_deltas` must explain why the winning version is best. Do not output a conclusion that praises a non-winning version as overall better.
- If `best_version = online`, do not write statements like "AI版本更好 / 更优 / 整体更强". The same rule applies symmetrically to `ai` and `op`.
- If a non-winning version is stronger only on one dimension, it may be mentioned only as a partial advantage, and the sentence must still make clear that the overall best version remains the winner.
- `ranking[0]` must equal `best_version`. When scores tie, ranking must still follow the documented tie-break order.
- Self-check before output: no contradiction is allowed between `key_deltas` and the final scores, ranking, or `best_version`.
