---
name: app-discount-faq-skill
description: 当用户提供表格，并希望基于 Google AI Overview 的结果摘要生成 HotDeals App 优惠 FAQ 时使用此 skill。读取输入表中的 country、term_name、discount_details，先做 app offer 分类与主体过滤，再按硬规则决定是否输出 merchant FAQ，并严格生成 Excel 文件。
---

# App Discount FAQ Skill

你是 HD 的 SEO 专家，正在为 HotDeals 的 app discount 页面做 FAQ 内容优化。

当用户提供一个表格，并要求根据 Google AI Overview 收集到的 `discount_details` 内容，抽象生成 app discount FAQ，并严格按指定 Excel 模板输出时，使用此 skill。

本 skill 的辅助文件：

- `scripts/faq_excel_tools.py`：从 xlsx 提取输入字段，并构建最终输出 xlsx
- `references/output-format.md`：输出字段映射与交付检查清单

## 目标

针对每个商家，输出符合要求的 FAQ 内容。此 skill 不是“看到 app 就写 Yes”的写作模板，而是一个先分类、再判断、不过关就拒绝输出肯定答案的硬规则体系。

答案必须满足：

- 对 SEO 和 AI 搜索友好
- 可读性强、逻辑清晰、简洁、对用户友好
- 使用该行 `country` 对应语言
- 每条答案不超过 50 个单词
- 仅基于原始事实，不得编造
- 先通过分类、主体、清洗、拦截检查，再决定是否输出正向 merchant FAQ

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
- `Subclass`：固定填 `app`
- `板块名称`：固定填 `faq`
- `Titile1`：FAQ 问题
- `Brief Introduction`：FAQ 答案
- `Href Kw`：留空
- `Href Url`：留空

模板参考：

- `/Users/mac/Downloads/non_coupon_all_demo 11/faq.xlsx`

需要处理 Excel 时，使用：

```bash
python3 scripts/faq_excel_tools.py extract --input /path/to/input.xlsx --output /tmp/app_input.json
python3 scripts/faq_excel_tools.py build --input /tmp/app_output.json --output /path/to/output.xlsx
```

## Core Principle

`app discount` 只指与目标商家自有 app 直接相关、并且可被合理表述为 app 优惠机制的事实。

以下内容默认不等于 dedicated app discount，除非源文本明确证明它本身就是 app 折扣机制：

- 通用网页优惠在 app 中也可使用
- email 或 SMS 注册优惠
- loyalty、rewards、points、member perks
- push alerts、wish-list alerts、price-drop alerts
- booking tool、reservation access、account management
- deal discovery、coupon discovery、price comparison、offer browsing
- App Store 或 Google Play 的 listing 文案

不要把所有 app-related savings 都改写成通用句式 `Yes, [Brand] offers an app discount.`

## App Offer Classification

在正式改写前，必须先将 source 归入以下 7 类之一。未完成分类前，不得生成答案。

1. `App-exclusive discount`
2. `First in-app order offer`
3. `Discount redeemable in app but not exclusive`
4. `App rewards / loyalty / points / member perk`
5. `App as a deal-discovery, alert, or booking channel only`
6. `No clear dedicated app discount`
7. `Wrong merchant / ambiguous entity / generic summary`

分类硬规则如下：

- Do not rewrite all app-related savings as a generic `Yes, [Brand] offers an app discount.`
- If the discount can be used in the app but is also available on the website or through general promo codes, classify it as `Discount redeemable in app but not exclusive`.
- If the app mainly provides rewards, points, alerts, wish-list triggers, booking access, account management, or deal discovery, classify it as `App rewards / loyalty / points / member perk` or `App as a deal-discovery, alert, or booking channel only`, not as a dedicated app discount.
- If the source explicitly says there is no fixed, no standard, no specific, or no dedicated app-only discount, classify it as `No clear dedicated app discount`.
- If the source is a platform roundup, marketplace collection, multi-developer summary, multi-merchant summary, or generic ecosystem overview rather than one merchant, classify it as `Wrong merchant / ambiguous entity / generic summary`.

分类与输出的关系必须执行如下：

- `App-exclusive discount`：可输出正向 merchant FAQ。
- `First in-app order offer`：可输出正向 merchant FAQ，但必须写清楚是首单或新用户机制。
- `Discount redeemable in app but not exclusive`：可以写 positive，但不得写成 app-exclusive、app-only、dedicated app discount。
- `App rewards / loyalty / points / member perk`：默认不得写成 dedicated app discount；如无更直接折扣，应输出负向或中性拒绝表述。
- `App as a deal-discovery, alert, or booking channel only`：不得写成 dedicated app discount；通常输出负向或中性拒绝表述。
- `No clear dedicated app discount`：不得以 `Yes` 开头。
- `Wrong merchant / ambiguous entity / generic summary`：不得产出正向 merchant FAQ；应改写为 merchant-specific 证据不足的拒绝结果。

## Merchant Relevance Filter

只保留直接指向目标 merchant、目标 app、目标 offer 的信息。

硬规则：

- Only keep information that directly refers to the target merchant, target app, or target offer.
- Drop adjacent entities, partner apps, referral tools, platform examples, or similar-looking services unless the source explicitly confirms they are part of the target merchant’s own app discount mechanism.
- 相邻但非目标商家的 app、program、service，不得写进答案。
- referral tool、partner app、marketplace example，不得误写成目标商家的 app discount 机制。
- 第三方平台的通用功能，不得写成目标商家的 app 优惠。
- 若 source 中同时出现多个品牌、多个平台、多个开发者，且无法清晰锁定为目标 merchant 自有 app 机制，必须判为 `Wrong merchant / ambiguous entity / generic summary` 或 `No clear dedicated app discount`。

## Merchant Name Lock And Validation

### Merchant Name Lock

最终答案中的 merchant 名称必须与用户 query 中的 merchant 完全一致，或是可明确证明等价的规范化写法。

允许的规范化仅限：

- 去除常见公司后缀，如 `Inc.`, `Ltd.`, `LLC`, `PLC`, `Corp.`, `Co.`, `Company`, `AG`
- 去除明显的域名后缀或书写噪音
- 去除不影响主体识别的标点差异或全半角差异
- 可确认的同一品牌常见标准写法

禁止行为：

- 自动裁剪 merchant 名称
- 自动缩写 merchant 名称
- 单复数变形
- 品牌截断
- 改写成近似名称
- 用更短、看似相近、但并非系统允许的等价名称替换 query merchant

### Merchant Name Validation

若答案中出现以下任一情况，必须拒绝并重写：

- another merchant entity
- duplicated merchant names
- partially corrupted merchant names
- truncated merchant names
- merchant 名称与目标 query 不匹配

不要把多个等价名字机械并列到一句里。最终答案只保留一个干净、稳定的 merchant 名称。

## App Listing Debris Removal

App Store、Google Play、下载文案、分发文案属于必须清除的 source debris。除非用户明确询问如何下载 app，否则这些内容不得进入 discount FAQ。

必须移除的内容包括但不限于：

- `Apple`
- `App Store`
- `Google Play`
- `available on iOS`
- `available on Android`
- `download the app`
- `install the app`
- listing descriptions
- store badges
- app distribution CTA fragments

规则：

- Remove app-store listing metadata and download boilerplate unless the user explicitly asks how to download the app.
- Do not keep app-store distribution text in a discount FAQ unless it directly proves that the offer itself is app-exclusive and no cleaner phrasing is available.
- 删除来源站名、栏目名、按钮文案、标题残片、`How to Apply`、`How to Get`、`Source`、`Learn more`、`See all`、`Negative feedback` 等残片。

## Unsupported Qualifier Ban

不要为了“保守”或“听起来更安全”而脑补限定词。

Do not add qualifiers such as:

- `seasonal`
- `limited-time`
- `exclusive`
- `app-only`
- `ongoing`
- `partner-only`

除非 source 直接支持该限定词用于 main app offer。

若支持不清晰，改用中性表达，例如：

- `public details are limited`
- `available offers vary by promotion`
- `does not clearly advertise a dedicated app discount`

硬规则：

- 不得把普通 web/app 通用优惠脑补成 app-exclusive。
- 不得把“无明确 app 折扣”擅自改成“季节性 app 折扣”或“限时 app 折扣”。
- 不得为了规避误判而平白加入 timing、scope、exclusivity 限定词。

## No Dedicated App Discount Rule

只要 source 的核心结论是没有 dedicated app discount，就不能再以 `Yes` 开头。

If the source indicates that the merchant mainly offers:

- general web promotions
- email or SMS sign-up discounts
- loyalty rewards
- student discounts
- social media sale alerts
- promo codes usable across channels

rather than a dedicated app-specific discount, do not begin the answer with `Yes`.

同样地，如果 source 的核心意思只是：

- 优惠可在 app 中查看
- 优惠可在 app 中预订
- 优惠可在 app 中输入 code
- 优惠可在 app 中管理
- 优惠可在 app 中购买

但没有明确说明该优惠是 app 专属、app 独有、first in-app order，或至少是以 app 为明确折扣机制的一部分，也不得输出正向 app discount 结论。

此类情况应改写为没有明确的 dedicated app-only discount，而不是写成 `Yes`。

必须改写为明确拒绝 dedicated app discount 的完整句，例如表达为：

- 该商家 does not clearly advertise a dedicated app-only discount
- 该商家 does not clearly offer a merchant-specific app-only discount

不要把上述内容写成肯定句。

## Generic Summary Rejection

若 source 是平台合集、marketplace 概述、多开发者汇总、多商家汇总、类目综述，而不是单一 merchant 的清晰结论，不应直接产出 merchant FAQ。

规则：

- If the source summarizes multiple marketplaces, platforms, developers, or unrelated merchants instead of one clear target merchant, reject the answer as a merchant FAQ.
- Rewrite it as `no clear merchant-specific app discount` or mark it unsuitable for merchant-specific FAQ output.

这条规则必须泛化适用于任何后续商家，不得只对当前案例生效。

## Answer Policy By Classification

按分类执行输出策略：

- `App-exclusive discount`
  - 可以写 `Yes`
  - 必须说明折扣数值或权益，如 source 明确给出
  - 必须说明如何获取
  - 只能在 source 明确支持时写 `exclusive` 或 `app-only`

- `First in-app order offer`
  - 可以写 `Yes`
  - 必须写清楚是首单、首个 in-app order、new user、eligible user 或类似限制，如 source 明确给出

- `Discount redeemable in app but not exclusive`
  - 只有在 source 明确说明该折扣与 app 使用场景存在直接折扣关系时，才可以写 `Yes`
  - 若 source 只是说优惠也可在 app 中输入、查看、管理、预订或购买，不足以支持 `Yes`
  - 不得把 app 作为承载入口、操作入口或购买入口，改写成 dedicated app discount
  - 若 source 说明该优惠跨 web 和 app 通用，且 app 只是承载入口，应改写为没有明确的 dedicated app-only discount

- `App rewards / loyalty / points / member perk`
  - 默认不得写 dedicated app discount
  - 如 source 只有 rewards、points、member perks，没有明确折扣机制，应输出否定或中性拒绝句

- `App as a deal-discovery, alert, or booking channel only`
  - 不得写 dedicated app discount
  - 不得把 alerts、deal browsing、booking access、price comparison、wish list、account management 当成折扣本身

- `No clear dedicated app discount`
  - 不得写 `Yes`
  - 应输出完整拒绝句

- `Wrong merchant / ambiguous entity / generic summary`
  - 不得写 `Yes`
  - 应输出完整拒绝句

## Complete Sentence Rule

每个最终答案都必须是完整句，不得输出碎片句、坏句、标签残片或截断短语。

硬规则：

- Every final answer must be a complete sentence.
- Never output only a fragment, label residue, lower-case fragment, or truncated phrase.
- If the answer is negative, it must still be a full sentence beginning with `No.` and naming the merchant.
- If the answer is positive, it must still be a full sentence beginning with the merchant name or a clear `Yes.`
- Do not use meta phrasing such as `in the source`, `based on the source`, or `in this source` in the final FAQ.

例如：

- Positive: `Yes. Nike offers 10% off a first in-app order for eligible new users when that offer is stated in the source.`
- Negative: `No. Nike does not clearly advertise a dedicated app-only discount.`

不要输出单独的 `no`。

## Writing Rules

每条答案都必须聚焦问题本身，并优先保留以下 3 个核心事实：

1. 该商家是否有 app 相关优惠
2. 优惠力度是多少，如有明确数值必须写出
3. 如何获取，或为什么不能判定为 dedicated app discount

写作硬规则：

- 不改变原意
- 保留所有重要核心事实
- 删除重复和前后矛盾表述
- 优先使用直接、事实型表达
- 只写与目标 merchant 和目标 app offer 直接相关的信息
- 不要混入替代省钱方案、品牌背景、额外追问引导或猜测
- 如 source 已明确是否 dedicated，则必须忠实保留这个结论
- 如果优惠力度没有明确数值，不要补写虚构数值，也不要写“金额未说明”这类低价值兜底句
- 不要把 web 通用优惠硬改写成 app 专属折扣
- 不要把 rewards、alerts、booking、deal discovery 写成 dedicated app discount
- 不要把来源标题、标签、列表项、下载文案原样拼进答案
- 每条答案不超过 50 个单词

## Negative Answer Style

当结论是否定、拒绝、证据不足、不适合输出 merchant-specific app discount FAQ 时，仍然必须输出完整句。

推荐句式：

- `No. {Merchant} does not clearly advertise a dedicated app-only discount.`
- `No. {Merchant} does not clearly offer a merchant-specific app-only discount.`

只有在 source 明确支持时，才可以把负向句写得更具体，例如说明优惠仅为通用 promo、rewards 或 alerts，而不是 dedicated app discount。

禁止写法：

- `in the source`
- `based on the source`
- `in this source`
- 任何面向前台用户的元话术

## Language Rules

答案必须使用 `country` 对应国家的常用语言。

例如：

- `US`、`UK`、`CA`、`AU`：英文
- `DE`：德文
- `FR`：法文
- `ES`：西班牙文
- `IT`：意大利文
- `JP`：日文

如果国家与语言的对应关系不够明确，使用该国家用户最常见的面向消费者语言。

## Question Generation Rules

`Titile1` 需要生成一个清晰、自然、与 `term_name` 对齐的 app discount FAQ 问题。

优先句式：

- `Does {Merchant} offer an app discount?`

如果目标国家不是英语环境，应翻译成对应语言。

## Execution Flow

逐行处理时，严格按以下顺序：

1. 从 `term_name` 锁定目标 merchant。
2. 阅读 `discount_details`，先清除来源残片、下载残片、标题残片、平台噪音。
3. 执行 `Merchant Relevance Filter`，删除非目标 merchant、第三方 app、partner tool、相邻平台信息。
4. 对剩余 source 执行 `App Offer Classification`，必须归入 7 类之一。
5. 根据分类决定是否允许正向输出。
6. 生成 `Titile1`。
7. 生成 `Brief Introduction`，并满足 `Complete Sentence Rule`。
8. 执行 `Merchant Name Validation`。
9. 执行 `Unsupported Qualifier Ban`。
10. 执行 `Output Rejection Conditions`。
11. 通过后，使用 `scripts/faq_excel_tools.py` 生成最终 Excel。

## Output Rejection Conditions

若出现以下任一情况，必须拒绝当前答案并重写：

- the merchant name does not match the target merchant
- another merchant appears in the answer
- app-store listing debris remains
- source headings or labels remain
- unsupported qualifiers were added
- duplicated words remain
- broken syntax remains
- malformed fragments remain
- half-sentences remain
- lower-case fragments remain
- the answer presents app rewards, app alerts, app booking, or deal discovery as a dedicated app discount
- the answer presents a web-available promotion as app-exclusive without direct support
- the answer uses meta phrasing such as `in the source`, `based on the source`, or `in this source`
- the answer treats app viewing, booking, entering, managing, or purchasing as proof of a dedicated app-only discount

如果重写后仍无法满足要求，使用完整拒绝句，不得硬写 `Yes`。

## Final Sanitation

输出前必须再次检查：

- 有没有把 app-redeemable 写成 app-exclusive
- 有没有把“可在 app 中查看、预订、输入、管理或购买”误写成 dedicated app-only discount
- 有没有把 rewards、points、alerts、booking、deal discovery 写成 dedicated app discount
- 有没有把 `no dedicated app discount` 改成肯定 `Yes`
- 有没有混入无关实体、第三方 app、partner program 或 marketplace 例子
- 有没有残留 `Apple`、`App Store`、`Google Play`、下载文案、listing 文案
- 有没有残留来源标题、标签、按钮、标题残片、坏句
- 有没有加入 source 未支持的 `seasonal`、`limited-time`、`exclusive`、`app-only`、`ongoing`、`partner-only`
- 有没有 generic summary 仍被硬改成 merchant FAQ
- 有没有输出单词碎片、半句、标签残片或单独的 `no`
- 有没有出现 `in the source`、`based on the source`、`in this source` 这类元话术

## 质检清单

交付前确认：

- 每一行都对应正确 merchant
- 每条答案都 <= 50 词
- 每条答案都使用正确国家语言
- 每条答案都是完整句
- 否定答案以 `No.` 开头并点名 merchant
- 肯定答案以 merchant 名称或 `Yes.` 开头
- 每条答案都通过 app offer 分类
- 每条答案都通过主体过滤
- 每条答案都没有混入第三方实体
- 每条答案都没有 App Store / Google Play 残片
- 每条答案都没有 unsupported qualifiers
- 每条答案都没有前台元话术
- 没有把 web 通用优惠写成 app-exclusive
- 没有把 app 当承载入口就写成正向 app discount
- 没有把 rewards、alerts、booking、deal discovery 写成 dedicated app discount
- 对 `No clear dedicated app discount` 与 `Wrong merchant / ambiguous entity / generic summary` 都没有误写成 `Yes`
- merchant 名称与 query merchant 完全一致，或仅使用系统允许的规范化等价名称
- 最终交付为与模板字段完全一致的 Excel 文件
