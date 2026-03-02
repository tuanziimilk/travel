---
name: faq_coupon_quality_scoring_v1
description: 对优惠券分发站点商家页下的 FAQ 文本进行 10 分制质检评分（线上/AI/可选OP），重点评估优惠信息准确性、规则完整性、可执行性与本地化表达。
---

## Purpose
本 skill 用于评估“商家页优惠相关 FAQ”质量，不是通用客服 FAQ。输出为结构化评分结果，比较不同版本并给出最佳版本。

## Business Context（必须遵守）
- 场景：优惠券分发站点中的“单商家页面 FAQ”。
- 内容重点：优惠与促销相关问题，如“是否有学生折扣”“首单优惠是否可叠加”“优惠码如何使用”“折扣何时生效”“是否支持免邮/退换”等。
- 评估目标：让运营可直接判断 FAQ 是否可发布、是否会误导用户、是否能减少咨询成本。

## Scope / 输入输出边界
- 输入字段：`TermID`、`TermName`、`Domain`、`Country`、`About_online`、`About_ai`、`About_op`
- 字段语义映射：在 FAQ 板块中，`About_online/ai/op` 分别作为 FAQ 文本版本载体（字段名沿用历史接口）
- 输出字段：严格使用既有 JSON 契约（`meta/results/comparison/notes`）
- 不做改写：只评分，不直接输出重写后的 FAQ 文案

## Hard Rules
1) 商家指代只允许 `{Mer.}`，不得泄露真实品牌名（`TermName`）到建议文本。
2) 不使用第一人称（我们/我方）作评价。
3) 输出必须是单个 JSON 对象，不附带额外解释。
4) 不得编造未在原文出现的优惠政策细节（如具体折扣比例、有效期、排除品类）。

## Scoring Dimensions (10分)

### A 结构完整与FAQ可读性（0-3）
- 是否具备明确问答结构（问题可检索、答案直给、不绕弯）。
- 是否覆盖优惠 FAQ 的核心主题（建议优先覆盖）：
  - 折扣类型（优惠码/自动折扣/活动页）
  - 适用对象（新客/学生/会员等）
  - 使用条件（门槛、排除品类、是否叠加）
  - 生效与失效（起止时间、地区限制）
  - 售后关联（退款后优惠处理、取消订单规则）
- 缺少核心主题、结构混乱、问答不匹配需要扣分。

### B 政策准确与可执行性（0-4）
- 回答是否具体可执行：包含条件、步骤、边界、异常处理。
- 是否避免误导：不自相矛盾，不夸大优惠，不含模糊表述（如“大部分”“通常”但无条件）。
- 是否有运营风险：如对叠加、排除项、生效时点描述含混，容易引发投诉。

### C 本地化与表达质量（0-2）
- 语言是否符合 `Country` 映射语系，表达自然、术语准确。
- 与优惠相关单位表达是否本地化（币种、税费、配送表述、日期格式）。
- 句子是否简洁，避免机器翻译腔和冗余套话。

### D SEO与可发现性（0-1）
- FAQ 问句是否贴合真实搜索意图（如 student discount / promo code not working / stack coupons）。
- 关键词覆盖自然，避免堆砌。

## Publish Rule
- `pass_for_publish = true` 当且仅当 `score_total >= 8`。

## Output Constraints
- `results` 至少包含 `online` 与 `ai`；`op` 仅在输入非空时出现。
- `comparison.best_version` 必须出现在 `results.version` 中。
- `comparison.key_deltas` 必须提供 2-5 条可读差异，不可为空。
- `strengths/weaknesses/suggestions` 每项建议 2-4 条，必须可执行。

## Notes Guidance
- 在 `notes` 中说明：
  - 是否存在 OP 版本；
  - 本次本地化判断依据（按 country-language-map）；
  - 是否发现“优惠政策风险点”（如叠加规则不清、时效缺失）。

