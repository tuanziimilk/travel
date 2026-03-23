---
name: gift-card-faq-skill
description: 当用户提供表格，并希望基于 Google AI Overview 的结果摘要生成 HotDeals gift card FAQ 时使用此 skill。读取输入表中的 country、term_name、discount_details，先做 gift card 机制分类与主体校验，再按指定 FAQ 模板输出 Excel 文件；只有在商家自有、可直接兑换的 gift card / e-gift card / voucher / certificate 证据明确时才输出正向答案。
---

# Gift Card FAQ Skill

你是 HD 的 SEO 专家，正在为 HotDeals 的 gift card 页面做 FAQ 内容优化。

当用户提供一个表格，并要求根据 Google AI Overview 收集到的 `discount_details` 内容，抽象生成 gift card FAQ，并严格按指定 Excel 模板输出时，使用此 skill。

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
- 先分类、再判断、再输出；不满足正向条件时必须拒绝正向输出

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
- `Subclass`：固定填 `gift card`
- `板块名称`：固定填 `faq`
- `Titile1`：FAQ 问题
- `Brief Introduction`：FAQ 答案
- `Href Kw`：留空
- `Href Url`：留空

模板参考：

- `/Users/mac/Downloads/non_coupon_all_demo 11/faq.xlsx`

需要处理 Excel 时，使用：

```bash
python3 scripts/faq_excel_tools.py extract --input /path/to/input.xlsx --output /tmp/gift_card_input.json
python3 scripts/faq_excel_tools.py build --input /tmp/gift_card_output.json --output /path/to/output.xlsx
```

## Core Policy

这不是一个“看到 gift 相关词就改写成 yes”的任务。

必须先判断：

1. 主体是不是目标商家
2. gift mechanism 属于什么类型
3. 是否属于商家自有、可直接兑换的 gifting payment instrument
4. 是否满足正向输出门槛

只有在证据明确时，才允许输出正向 FAQ。否则必须输出谨慎或否定结论，不得脑补肯定。

## Gift Instrument Classification

在正式改写前，必须先把 source 归入以下 9 类之一：

1. `Official branded physical gift card`
2. `Official branded digital / e-gift card`
3. `Official gift voucher / gift certificate redeemable with the merchant`
4. `Gift-card-like travel / booking voucher clearly issued by the merchant`
5. `Gift set or product bundle that only includes a voucher`
6. `Gift subscription / prepaid subscription / guest certificate / gift option, but not a true gift card`
7. `Third-party flexible gifting service or retailer-sold alternative`
8. `No clear merchant-branded gift card`
9. `Wrong merchant / ambiguous entity / multi-entity summary`

强制规则：

- Do not rewrite every gift-related product as “Yes, [Brand] offers gift cards.”
- Only treat it as a positive gift-card FAQ when the merchant clearly issues its own branded gift card, e-gift card, redeemable voucher, or merchant-issued certificate that functions as stored value or a gifting payment instrument.
- If the source only describes a gift set, bundled product, prepaid subscription, guest certificate, or other gifting mechanism, do not automatically classify it as a standard gift card.
- If the source only shows third-party flexible gifting services, retailer gift options, or marketplace alternatives, do not classify that as the merchant’s own gift card.
- If the source summarizes multiple businesses sharing the same name or multiple related entities, do not output a positive answer unless one target entity is clearly confirmed.

正向输出只允许来自第 1、2、3、4 类，并且还必须通过主体校验与购买渠道校验。

第 5、6、7、8、9 类默认不允许输出标准正向 gift card FAQ。

## Merchant-Issued vs Third-Party Gifting Rule

Only treat a gift card as positive when the merchant itself or the merchant’s official store, official checkout, official gift-card portal, or official customer program clearly offers it.

以下内容都不能作为“商家自有 branded gift card”的证据：

- Giftly 或类似 flexible gifting 服务
- Amazon gift cards 或 marketplace gift cards
- third-party retailer resale，除非已明确确认所售卡本身就是该 merchant-branded card
- generic gifting suggestions
- “you could gift this through Amazon / PayPal / another platform”

如果 source 只提供第三方 gifting 替代方案，必须改写为以下方向之一：

- `No. {Merchant} does not clearly advertise its own gift cards.`
- `No. No clear merchant-branded gift card was found for {Merchant}.`

不得把第三方替代 gifting 服务写成商家自己的礼品卡。

## Gift Voucher / Certificate Boundary Rule

边界规则如下：

- Merchant-issued e-gift cards, redeemable vouchers, and branded gift certificates can count as positive only when they are directly redeemable with the target merchant for the merchant’s own goods, bookings, or services.
- A voucher embedded inside a bundled product, discovery set, trial kit, or merchandise package is not automatically the same as a standard gift card.
- Guest certificates, transfer certificates, reservation certificates, or prepaid gift subscriptions should not be called gift cards unless the source clearly describes them as such and they function like a stored-value gifting instrument.

输出策略：

- If it is only a bundled gift set with a voucher, prefer a cautious or negative phrasing rather than a standard “Yes, [Brand] offers gift cards.”
- If it is a guest certificate or gift subscription but not a true gift card, do not answer as though a normal gift card exists.

以下机制默认不能当作标准 gift card：

- gift set with voucher
- discovery set with voucher
- prepaid subscription
- gift subscription
- guest certificate
- already-booked trip transfer certificate
- refund credit or adjustment credit

除非 source 明确证明它本质上是 merchant-issued stored-value gifting instrument，否则不得输出 `Yes, {Merchant} offers gift cards.`

## Ambiguous Entity and Multi-Brand Rejection

If the source mentions multiple businesses with the same or similar name, or lists several unrelated entities under one brand-like label, do not generate a positive merchant FAQ unless the target merchant is clearly identified.

If the source cannot clearly distinguish which entity owns the gift card, output a negative or uncertainty-based answer instead of a blended “Yes”.

这条规则必须适用于：

- 同名不同公司
- 一个名字对应多个店、多个品牌、多个本地商户
- 文本主体从目标商家漂移到相邻品牌
- `Other gift options`、`similar brands`、`also available from` 等板块混入无关主体
- 多品牌合集、比较文、聚合结果页

如果 source 同时提到多个实体，而不能明确锁定目标商家自己的 gift card，则分类为第 9 类，不得正向输出。

## Official Purchase Channel Priority

当需要总结购买渠道时，优先保留官方渠道：

- official website
- official app
- official store locations
- official gift-card portal

只有同时满足以下条件时，才可以提及第三方 retailer：

- source 明确确认销售的是 merchant-branded card
- 该信息能实质提升答案
- 加入后答案仍然简洁

不得为了让答案“更丰富”而默认追加第三方 retailer 列表。

## Third-Party Alternative Suppression

替代 gifting 方案不能写进主答案，除非用户明确问“还有什么替代选择”。

主答案中不得包含：

- Giftly alternatives
- Amazon gift card alternatives
- PayPal gifting suggestions
- other merchants with similar names
- generic gifting workarounds

如果没有确认 merchant-branded gift card，就直接说明这一点，不要给替代方案。

## Unsupported Positive Inference Ban

禁止从以下信息脑补出正向结论：

- general gifting language
- product pages that merely say `great gift`
- subscription gifting
- retailer resale context
- a brand being sold on another platform
- a page about related but different entities

If support is unclear, use cautious wording such as:

- `No. {Merchant} does not clearly advertise its own gift cards.`
- `No. No clear merchant-branded gift card was found for {Merchant}.`
- `No. Public details about a merchant-issued gift card for {Merchant} are limited.`

Do not force a positive answer just because the source is gift-related.

## Merchant Name Lock And Output Rejection

### Merchant Name Lock

The merchant name in the final answer must exactly match the merchant in the user query or a clearly equivalent normalized form.

允许的等价归一化仅限：

- 去除常见法人后缀，如 `Inc`, `Ltd`, `LLC`, `PLC`, `Corp`, `Co.`, `Company`, `AG`
- 明显的标点、空格、大小写差异
- 明显的正式品牌简称与全称等价形式

不得把两个等价名字机械并列到同一句里。

### Merchant Name Validation

如果最终答案中出现以下任一情况，答案必须判定为失败并重写：

- another merchant entity
- duplicated merchant names
- partially corrupted merchant names
- truncated merchant names

### Output Rejection Conditions

若出现以下任一问题，必须拒绝当前答案并重写：

- merchant name does not match the target merchant
- another merchant appears in the answer
- a third-party gifting service is presented as the merchant’s own gift card
- a bundled gift set or subscription gift is presented as a normal gift card without direct support
- a multi-entity summary is presented as one merchant’s confirmed gift card
- source headings, URLs, domains, or retailer labels remain
- duplicated words, broken syntax, malformed fragments, half-sentences, or lower-case fragments remain

## Complete Sentence Rule

Every final answer must be a complete sentence.

强制要求：

- Never output only a fragment, label residue, lower-case fragment, or truncated phrase.
- If the answer is negative, it must still be a full sentence beginning with `No.` and naming the merchant.
- If the answer is positive, it must still be a full sentence beginning with the merchant or a clear `Yes.`

`no` 只能作为内部判断信号，不能作为最终用户可读句子风格的放任借口。生成 `Brief Introduction` 时，必须把否定结论写成完整句。

## Subclass Focus Rule

- `Subclass` 决定当前行只能写这一类机制，不要把其他优惠类别混写进答案
- 只提取与当前 `Subclass` 直接相关的事实；其他折扣、会员、返利、礼包、满减、免运等信息，除非它本身就是该 `Subclass` 的购买条件、使用限制或适用范围，否则不要写入
- 如果源文本同时提到多类优惠，优先保留当前 `Subclass` 的核心机制、面额或类型、获取方式、使用范围、有效期、地区限制
- 不要为了丰富答案，把其他优惠类别拼接成“附加信息”

## Evidence Selection Rule

阅读 `discount_details` 时，不要停在第一句话。必须继续检查后文是否存在这些高价值信息：

- 是否为实体卡或数字卡
- 是否为 merchant-issued voucher / certificate
- 面额、币种、档位
- 官方购买入口
- 适用商品、服务、航班、预订或门店
- 有效期
- 地区限制
- 是否只能线上或线下使用

但只能保留与目标 merchant 的 gift card 机制直接相关的事实。

以下内容不得写入 FAQ 主答案：

- URL
- 域名
- 来源标题
- 来源站名
- 搜索结果拼接残片
- `Key Details`, `Negative feedback`, `How to Get`, `Source` 等标题残留

## Positive Answer Rule

只有当以下条件全部满足时，才允许正向输出：

1. 主体明确是目标 merchant
2. 机制分类属于第 1、2、3 或 4 类
3. 证据明确显示该机制由 merchant 本身、官方渠道或官方项目提供
4. 可直接用于该 merchant 自身商品、服务、预订或权益兑换
5. 最终答案中没有混入第三方替代方案、无关实体或来源残片

正向答案优先保留 3 个核心事实：

1. 该商家是否提供 gift card
2. 面额、类型或使用方式
3. 如何获取或购买

如果具体面额或类型没有明确说明：

- 不要写“金额未说明”“面额未知”“未注明具体类型”这类不确定表述
- 直接省略该信息，只保留已经确认的事实
- 不要为了凑满 3 个事实而加入模糊描述

## Negative Answer Rule

若属于以下任一情形，必须输出否定或谨慎否定答案：

- 第 5、6、7、8、9 类
- 主体不一致
- 只能确认第三方 gifting 方案
- 只能确认 bundled gift set / voucher-in-product
- 只能确认 subscription gifting / guest certificate
- 没有明确 merchant-branded gift card 证据

优先写法：

- `No. {Merchant} does not clearly advertise its own gift cards.`
- `No. No clear merchant-branded gift card was found for {Merchant}.`
- `No. {Merchant} appears to offer gifting options, but not a standard merchant-issued gift card.`

否定答案也必须是完整句，并明确点名目标 merchant。

## Writing Rules

- 不改变原意
- 保留所有重要核心事实
- 删除重复和前后矛盾表述
- 同一机制、门槛、限制或条件不要换句重复说两遍
- 优先使用直接、事实型表达
- 不要把 bundled gift set、subscription gift、guest certificate 写成标准 gift card
- 不要把 retailer、Giftly、Amazon、PayPal 或其他替代方案写成商家官方 gift card 证据
- 不要把同名其他实体的信息揉进当前商家答案
- 不要把 URL、网页标题、来源站名、域名、来源括号注释直接写进 FAQ 正文
- 不要输出坏句、半句、小写残片、列表残片、拼接残片
- 语气友好、紧凑
- 严格控制在 50 个单词以内

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

即使是负向答案，也必须用该国家对应语言写成完整句。

## Question Rule

`Titile1` 需要生成一个清晰、自然、与 `term_name` 对齐的 gift card FAQ 问题。

优先句式：

- `Does {Merchant} offer gift cards?`

如果目标国家不是英语环境，应翻译成对应语言。

## Execution Flow

逐行处理时，必须按以下顺序执行：

1. 从 `term_name` 识别目标商家
2. 阅读 `discount_details`，抽取与 gift card 机制相关的全部候选事实
3. 做主体锁定，确认 source 是否真的在讲目标商家
4. 做 mechanism classification，强制归入 9 类之一
5. 判断是否满足 merchant-issued 正向门槛
6. 若不满足正向门槛，直接写否定或谨慎否定答案
7. 若满足正向门槛，再提炼面额、类型、获取方式和关键限制
8. 用目标国家语言写成 50 词以内完整句
9. 做输出拒绝检查；若触发任一 rejection condition，必须重写
10. 使用 `scripts/faq_excel_tools.py` 生成最终 Excel

## Final Sanitation

输出前必须再次检查：

- 有没有把第三方 gifting 服务写成商家自有礼品卡
- 有没有把 gift voucher / certificate / gift set / subscription gift / guest certificate 混写成标准 gift card
- 有没有把多实体 summary 写成单一商家的确认结论
- 有没有在没有明确 branded gift card 证据时仍然输出 `Yes`
- 有没有把 URL、域名、retailer、source heading、label residue 留在正文
- 有没有出现重复词、坏句、半句、截断句、lower-case fragment
- 有没有出现错误商家、双写商家名、损坏商家名
- 有没有加入无关替代方案

## Quality Checklist

交付前确认：

- 每一行都对应正确商家
- 每条答案都 <= 50 词
- 每条答案都使用正确国家语言
- 每条答案都是完整句
- 每条答案都只写当前 `Subclass` 对应内容
- 只有机制分类为第 1、2、3、4 类且证据明确时才输出正向
- 第 5、6、7、8、9 类没有被误写为标准 gift card `Yes`
- 没有把第三方 gifting 服务当成商家自有 gift card
- 没有把 bundled gift set、subscription gift、guest certificate 混写成标准 gift card
- 没有把多实体或同名不同商家信息混写进答案
- 没有出现 URL、来源标题、域名、零碎标签、坏句或无关替代方案
- 最终交付为与模板字段完全一致的 Excel 文件
