---
name: family-discount-faq-skill
description: 当用户提供表格，并希望基于 Google AI Overview 的结果摘要生成 HotDeals 家庭优惠 FAQ 时使用此 skill。读取输入表中的 country、term_name、discount_details，判断内容主体与商家是否一致，再按指定 FAQ 模板输出 Excel 文件，答案需使用对应国家语言、简洁且符合 SEO。
---

# Family Discount FAQ Skill

你是 HD 的 SEO 专家，正在为 HotDeals 的 family discount 页面做 FAQ 内容优化。

当用户提供一个表格，并要求根据 Google AI Overview 收集到的 `discount_details` 内容，抽象生成 family discount FAQ，并严格按指定 Excel 模板输出时，使用此 skill。

本 skill 的辅助文件：

- `scripts/faq_excel_tools.py`：从 xlsx 提取输入字段，并构建最终输出 xlsx
- `references/output-format.md`：输出字段映射与交付检查清单

## 目标

针对每个商家，输出符合要求的 FAQ 内容。答案必须满足：

- 对 SEO 和 AI 搜索友好
- 可读性强、逻辑清晰、简洁、对用户友好
- 使用该行 `country` 对应语言
- 每条答案不超过 50 个单词
- 仅基于原始事实，不得编造

## 输入要求

从用户输入表中读取以下字段：

- `country`
- `term_name`
- `discount_details`

如果输入中还有 `term_id` 或 `domain`，则一并保留到输出；若没有提供，则对应输出单元格留空，除非用户另行提供。

一个表中可能包含多个商家，必须逐个商家分别分析、分别输出。

## 输出要求

交付结果必须是 Excel 文件，不是纯文本。

输出表格字段必须严格按以下结构填写：

- `ContentType`：固定填 `faq`
- `Country`：复制输入中的 `country`
- `TermID`：复制输入中的 `term_id`；如无则留空
- `TermName`：复制输入中的 `term_name`
- `Domain`：复制输入中的 `domain`；如无则留空
- `Source`：固定填 `AI`
- `Subclass`：固定填 `family`
- `板块名称`：固定填 `faq`
- `Titile1`：FAQ 问题
- `Brief Introduction`：FAQ 答案
- `Href Kw`：留空
- `Href Url`：留空

模板参考：

- `/Users/mac/Downloads/non_coupon_all_demo 11/faq.xlsx`

需要处理 Excel 时，使用：

```bash
python3 scripts/faq_excel_tools.py extract --input /path/to/input.xlsx --output /tmp/family_input.json
python3 scripts/faq_excel_tools.py build --input /tmp/family_output.json --output /path/to/output.xlsx
```

## Family Discount 判定口径

本任务判断的是“是否存在和家庭相关的优惠、价格或权益”，而不是“是否存在标准化、长期、公开的 family plan”。

只要证据中明确出现以下任一类信息，就可以判为 Yes：

- `family discount` / `family pricing` / `family fare` / `family rate`
- `family plan` / `family subscription` / `family membership`
- `household benefit` / `household card` / `household coverage`
- `same-household discount`
- `multi-line family pricing`
- `large family discount` / `numerosa` / `family pass`
- `family bundle` / `family pack`
- `friends and family sale` / `friends & family promo` / `friends & family event`
- `spouse` / `dependents` / `household members` 可共享或适用的优惠
- 员工、军人、学生、教师等身份优惠明确延伸到家属
- 任何明确面向家庭、`household`、`spouse`、`dependents` 的折扣、减免、免费权益、共享权益

## No 的适用条件

只有在以下情况才判 No：

- 证据里没有任何明确的家庭相关优惠、价格、权益或适用对象
- 只是普通促销，和 `family` / `household` / `spouse` / `dependents` / `friends & family` 无关
- 来源明显指向别的实体，不是当前 merchant
- 只是提到 `family-friendly`、适合家庭、家庭场景，但没有任何优惠、价格、折扣或权益

## 删除过严限制

不要再使用以下否定逻辑作为主要判断标准：

- `not a public family plan`
- `not a formal consumer family plan`
- `not for regular shoppers`
- `not a standard family plan`
- `not a household plan`

这些标准过严，不符合当前任务目标。

## 边界案例处理

以下情况默认判 Yes：

- 员工优惠可覆盖 `spouse` / `dependents`
- 军人优惠可覆盖 `family members`
- `household card` / `complimentary household membership`
- `multi-line family pricing`
- `family bundle` / `family pass` / `family pack`
- `friends & family` 促销活动

以下情况默认判 No：

- 仅仅是“适合全家购买”“for the whole family”，但没有折扣或权益
- 错实体

## 主体一致性判断

必须判断源内容中的优惠主体，是否与该行目标商家为同一主体。

比对主体名称时，先忽略常见法人或公司后缀后再判断，例如：

- `AG`
- `Inc`
- `Ltd`
- `LLC`
- `PLC`
- `Corp`
- `Co.`
- `Company`

还要同时考虑以下放宽规则：

- 如果只是英文、德文或其他语言下的品牌写法差异，但核心品牌明显对应同一商家，可视为同一主体
- 如果只是数字、词形或拼写变体，但仍能清晰指向同一品牌，可视为同一主体
- 例如 `Kfzparts2` 与 `kfzteile24`，若结合上下文可判断是在指同一汽车配件品牌，不要仅因英文/德文写法不同直接输出 `no`
- 对于 `Neckermann`、`Filmpalast`、`Tivoli` 这类核心商家名本身一致的情况，应优先视为主体一致；除非文本明确指向另一个商家、另一个品牌，或明确是无关平台/项目

以下情况答案直接输出 No：

- 优惠主体是另一个商家
- 内容讲的是平台、第三方项目或无关会员体系，而不是目标商家本身
- 文本在核心品牌名上无法与目标商家建立合理对应，且没有任何上下文可支持同一主体判断

如果去掉上述常见后缀后，主体名称能清晰对应同一品牌，则视为同一主体，不要仅因法人后缀差异、语言差异或轻微变体输出 `No`。

当核心商家名一致，或虽有跨语言、变体写法但仍可合理判断为同一品牌时，应放宽处理，不要因为证据门槛过高直接判为 `No`。只有在主体明确不匹配，或确实无法合理对应时，才输出 `No`。

## 答案规范

每条答案都必须聚焦问题本身，并遵循 Atomic Facts 规范。优先保留以下 3 个核心事实：

1. 该商家是否存在和家庭相关的优惠、价格或权益
2. 优惠机制或优惠力度是什么；如果有明确数值必须写
3. 如何获得，或该权益适用于哪些家庭相关对象，如 `household`、`spouse`、`dependents`

如果优惠力度没有明确数值：

- 不要写“金额未说明”“折扣未知”“未注明具体数值”这类不确定表述
- 直接省略金额信息，只保留已经确认的家庭相关优惠事实和获取方式
- 不要为了凑满 3 个事实而加入模糊描述

不得添加：

- 替代省钱方案
- 品牌背景
- 额外追问引导
- 没有依据的猜测

如果这 3 个核心事实不完整，只能补充与 family discount 强相关、且源文本中明确出现的信息。

## 输出要求

- Yes 必须以 `Yes.` 开头
- No 必须以 `No.` 开头
- 不允许只输出 `yes` / `no` 小写
- 结论后只保留最关键的判断依据，控制在 1 到 2 句
- 不要写成长段解释
- 不要机械重复同一套句式
- 不要把“不是正式 family plan”当成 No 的主要理由

## Yes 的写法要求

如果证据是限时的 `Friends & Family sale`，也判 Yes，但可点明它是活动型优惠，而不是长期计划。

Yes 类答案应优先说明它属于哪一种家庭相关优惠，例如：

- `family discount`
- `family pricing`
- `family plan`
- `family subscription`
- `household benefit`
- `same-household discount`
- `multi-line family pricing`
- `family bundle`
- `friends & family` 活动优惠
- 家属可共享的员工、军人、学生、教师等优惠

## No 的写法要求

No 时只说明最核心原因：

- 没有看到明确家庭相关优惠
- 或来源是错实体

不要再写“不是公开 family plan”“不是标准家庭套餐”这类过严表述。

## 写作要求

- 不改变原意
- 保留所有重要核心事实
- 删除重复和前后矛盾表述
- 优先使用直接、事实型表达
- 禁止使用“but no fixed discount amount is stated”及同类不确定兜底句式
- 不同行答案的表达方式尽量自然变化
- 语气友好、紧凑
- 严格控制在 50 个单词以内
- 每条尽量控制在 1 到 2 句
- 第一时间给结论
- 第二部分简要说明为什么是 Yes / 为什么是 No
- 不要复述一大段搜索材料
- 不要堆砌背景信息
- 不要写得像搜索摘要
- 不要把第三方无关折扣、顺手可用的别的优惠全塞进去
- 只有在确实有助于判断 family 属性时，才补充一个简短细节
- 品牌主体必须出现
- 不写 URL / 来源名 / 标题残片

## 语言规则

答案必须使用 `country` 对应国家的常用语言。

例如：

- `US`、`UK`、`CA`、`AU`：英文
- `DE`：德文
- `FR`：法文
- `ES`：西班牙文
- `IT`：意大利文
- `JP`：日文

如果国家与语言的对应关系不够明确，使用该国家用户最常见的面向消费者语言。

## 问题生成规则

`Titile1` 需要生成一个清晰、自然、与 `term_name` 对齐的 family discount FAQ 问题。

优先句式：

- `Does {Merchant} offer a family discount?`

如果目标国家不是英语环境，应翻译成对应语言。

## Family Discount Examples

判 Yes 的典型模式：

- official `family plan`
- `family subscription`
- `family pricing`
- `family fare`
- `family rate`
- `household benefit`
- `household card`
- `same-household discount`
- `multi-line family pricing`
- `large family discount`
- `family pass`
- `family bundle`
- `family pack`
- `friends & family` sale or promo
- 家属可适用的员工、军人、学生、教师优惠

判 No 的典型模式：

- 普通促销，与 `family` / `household` 无关
- 只是 `family-friendly` 产品描述
- 只是“for the whole family”这类场景文案
- 错实体

## 执行流程

逐行处理时，按以下步骤：

1. 从 `term_name` 识别目标商家
2. 阅读 `discount_details`，只提取 family discount 强相关事实
3. 判断源内容中的商家主体是否与目标商家一致
4. 先判断是否存在任何明确的家庭相关优惠、价格、权益或适用对象
5. 如果有，输出 `Yes.` 开头，并简要说明这是哪类家庭相关优惠
6. 如果没有，或来源是错实体，输出 `No.` 开头，并说明没有看到明确家庭相关优惠或主体不匹配
7. 用目标国家语言改写成简洁 FAQ 答案
8. 检查答案是否不超过 50 个词，且没有编造信息
9. 使用 `scripts/faq_excel_tools.py` 生成最终 Excel

## Final Sanitation

交付前逐条检查：

- 有没有把明确的 `friends & family` 活动误判成 No
- 有没有把员工、军人、学生、教师优惠覆盖家属误判成 No
- 有没有把 `household card`、`household benefit`、`same-household discount` 漏判为 Yes
- 有没有把只是 `family-friendly` 场景、但没有任何优惠信息的内容误判成 Yes
- `Yes.` / `No.` 开头规则是否执行
- 品牌主体是否出现
- 是否删除了 URL、来源名、标题残片

## 质检清单

交付前确认：

- 每一行都对应正确商家
- 每条答案都 <= 50 个词
- 每条答案都使用正确国家语言
- 每条答案都只保留核心事实
- 所有折扣数值都被准确保留
- 只要存在明确家庭相关优惠、价格、权益或适用对象，就可以输出 `Yes`
- 只有在没有明确家庭相关优惠、或来源明显是错实体时才输出 `No`
- 最终交付为与模板字段完全一致的 Excel 文件
