---
name: birthday-discount-faq-skill
description: 当用户提供表格，并希望基于 Google AI Overview 的结果摘要生成 HotDeals 生日优惠 FAQ 时使用此 skill。读取输入表中的 country、term_name、discount_details，判断内容主体与商家是否一致，再按指定 FAQ 模板输出 Excel 文件，答案需使用对应国家语言、简洁且符合 SEO。
---

# Birthday Discount FAQ Skill

你是 HD 的 SEO 专家，正在为 HotDeals 的 birthday discount 页面做 FAQ 内容优化。

当用户提供一个表格，并要求根据 Google AI Overview 收集到的 `discount_details` 内容，抽象生成 birthday discount FAQ，并严格按指定 Excel 模板输出时，使用此 skill。

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
- `Subclass`：固定填 `birthday discount`
- `板块名称`：固定填 `faq`
- `Titile1`：FAQ 问题
- `Brief Introduction`：FAQ 答案
- `Href Kw`：留空
- `Href Url`：留空

## Subclass 聚焦规则

- `Subclass` 决定当前行只能写这一类机制，不要把其他优惠类别混写进答案
- 只提取与当前 `Subclass` 直接相关的事实；其他折扣、会员、返利、礼包、满减、免运等信息，除非它本身就是该 `Subclass` 的领取条件或使用限制，否则不要写入
- 如果源文本同时提到多类优惠，优先保留当前 `Subclass` 的核心机制、数值、获取方式、限制条件，删除无关类别内容
- 不要为了丰富答案，把其他优惠类别拼接成“附加信息”

模板参考：

- `/Users/mac/Downloads/non_coupon_all_demo 11/faq.xlsx`

需要处理 Excel 时，使用：

```bash
python3 scripts/faq_excel_tools.py extract --input /path/to/input.xlsx --output /tmp/birthday_input.json
python3 scripts/faq_excel_tools.py build --input /tmp/birthday_output.json --output /path/to/output.xlsx
```

## Birthday-Specific Evidence Tiers

在阅读 `discount_details` 后，不要直接做 `yes` / `no`。必须先把 birthday 信息归入以下 4 类之一，再决定结论：

- A. 官方明确生日优惠/生日奖励
  - 当前 merchant 官方站点、官方 rewards 页面、官方 help center、官方 loyalty page、官方 email preference / account page 明确提到 `birthday reward` / `birthday coupon` / `birthday points` / `birthday gift`
  - => 输出 `yes`
- B. merchant-specific birthday offer，虽不一定来自正式官方 promo page，但主体清晰且信息结构完整
  - 例如会员计划中的生日奖励、newsletter / email birthday coupon、注册账户并填写生日后收到生日券、`birthday month` offer、birthday email code
  - 条件：主体必须清晰指向当前 merchant；birthday mechanism 清晰；不存在明显品牌混淆
  - => 默认输出 `yes`，但措辞可以更克制
- C. 主体混淆 / 多商家混杂 / 同名品牌误伤
  - 当前 query 与 source 中的生日权益主体不一致，或多个品牌/场馆/平台混在一起且无法稳定锁定到当前 merchant
  - => 输出 `no`
- D. 泛化或弱证据，无法确认当前 merchant 真有生日优惠
  - 例如只有 coupon aggregator 笼统声称有 birthday offer、只有建议注册邮件看看、只有 birthday-themed sale / package / content、只有员工福利、企业文化、B2B 工具、客户案例
  - => 输出 `no`

分类完成后再做结论：

- A / B -> `yes`
- C / D -> `no`

## Birthday Discount 业务边界

本 `Subclass` 在 FAQ 生成时，允许覆盖以下有效 birthday offer 形式，只要主体清晰且指向当前 merchant：

- `birthday discount`
- `birthday coupon`
- `birthday cash`
- `birthday reward`
- `birthday points`
- `birthday gift`
- `birthday freebie`
- `birthday month email offer`
- `member birthday perk`
- `newsletter birthday discount`
- `loyalty-program birthday benefit`

不要只把“官网公开促销页上的生日折扣码”视为 `yes`。只要是目标 merchant、面向消费者、与生日直接相关，即使不是纯百分比折扣，也可以判 `yes`。

## 答案规范

每条答案都必须聚焦问题本身，并遵循 Atomic Facts 规范。若判定为 `yes`，统一优先保留以下信息：

1. offer type
2. who qualifies
3. how to get it
4. timing / validity（如果 source 明确）

若判定为 `no`，统一优先使用：

- `No. {Merchant} does not clearly advertise a standard birthday discount.`
- `No. {Merchant} does not clearly advertise a merchant-specific birthday offer.`

不要在 `no` 句中补写泛泛建议。

同时遵循以下硬性要求：

- 每条答案都必须优先复用输入 `term_name` 作为品牌主体，或使用最干净、最自然、最接近 `term_name` 的规范品牌名
- 品牌主体写法必须干净、自然，不要把 URL、网页标题、来源名、大段括号补充或解释性扩写揉进答案
- 禁止把以下内容写进品牌主体：上位类/泛品类、活动名、栏目名、论坛名、另一家同名或近似名商家、解释性前后缀、双写品牌
- 只写与当前 `Subclass` 相关的内容，不要混入其他优惠类别或无关 perks
- 不要只改写原文第一句话；必须继续检查后文，把与 birthday-specific 判断相关的门槛、有效期、适用范围、会员等级、地区限制吸收进答案
- 如果原文明确提到限制、资格、适用对象、验证要求、适用范围、最低消费、时间窗口、地区限制、是否仅限新用户/会员/App/特定计划、是否限特定商品或国家，这些信息与生日权益直接相关时必须尽量写全
- 如果原文是近似数值或频率，尽量改写为更稳健的事实表达；避免连续堆叠 `about`、`usually`、`around`
- 不要为了凑满信息加入无关 perks、品牌背景、替代省钱方案、额外追问引导或没有依据的猜测

如果权益没有明确数值：

- 不要写“金额未说明”“折扣未知”“未注明具体数值”这类不确定表述
- 直接省略金额信息，只保留已经确认的生日权益事实和获取方式
- 不要为了凑满信息而加入模糊描述

## Merchant-Specific-But-Not-Formal-Page Rule

若 source 没有正式官方 birthday 落地页，但满足以下条件，仍应输出 `yes`：

- 当前 merchant 名称清晰一致
- birthday mechanism 清晰，例如注册 / 订阅 / 填写生日 / 生日月发送 / 有效期
- 没有明显同名实体混淆
- 不是单纯“建议你联系商家看看”

推荐写法：

- `Yes. {Merchant} offers a birthday reward for members/subscribers.`
- `Yes. {Merchant} appears to send a birthday coupon by email to registered users.`
- `Yes. {Merchant} offers a birthday reward when members add their birth date to their profile.`

不要仅因为 source 不是正式官方 landing page 就打成 `no`。

## Official-Only Overkill Guard

不要因为 source 不是“官方专门 birthday 页面”就直接输出 `no`。

只有以下情况才因为证据不足输出 `no`：

- 主体不清
- 来源明显在讲别的品牌 / 别的商家
- 只有泛化建议，没有 birthday mechanism
- 只有 birthday-themed 活动，不是个人生日优惠
- 只有第三方猜测，没有 merchant-specific 细节

## Non-Birthday Exclusion Rule

以下内容不能单独支撑 `yes`：

- `birthday-themed products`
- `birthday celebration packages` / `party packages`
- `anniversary sales`
- `seasonal promotions`
- `birthday content` / `birthday guides` / `birthday articles`
- `employee birthday perks`
- `B2B` / `API` / marketing tools for sending birthday messages
- `venue celebration services`

这些应输出 `no`，除非同时明确存在当前 merchant 面向消费者的 birthday reward。

## Third-Party Evidence Policy

对 birthday discount 证据按强弱分层：

- 强证据：`merchant official site`、官方 loyalty / rewards terms、官方 app、官方 help center、官方 email terms
- 中证据：官方社媒明确写 `birthday reward` / `birthday month offer`，或 merchant-specific birthday mechanism 清晰但不是正式 official promo landing page
- 弱证据：`coupon aggregators`、deal blogs、generic savings sites、forum / reddit

判定要求：

- 强证据可直接支持 `yes`
- 中证据可支持 `yes`，但表述要谨慎，例如 `offers a birthday reward for members`、`appears to send a birthday coupon by email`
- 如果只有弱证据，且没有任何 merchant-specific 机制或强上下文支持，不要直接升格为品牌官方 `yes`

当只有弱证据时，优先使用以下 `no` 句式：

- `No. {Merchant} does not clearly advertise a standard birthday discount.`
- `No. {Merchant} does not clearly advertise a merchant-specific birthday offer.`

不要把第三方 coupon / aggregator 的说法直接写成品牌官方政策。

## Subject-Cleaning Rule

如果 source 中出现多个品牌或同名实体，必须先判断是否与当前 merchant 完全一致：

- 完全一致 -> 可继续判断
- 明显是别的实体 -> `no`
- 混杂但无法稳定确认 -> `no`

不得把 unrelated brand 的 birthday offer 转写给当前 merchant。

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

以下情况直接按 `C` 或 `D` 类处理：

- 优惠主体是另一个商家
- 内容讲的是平台、第三方项目、无关会员体系、行业泛化聚合，或多个实体混杂，无法确认属于当前 merchant
- 文本在核心品牌名上无法与目标商家建立合理对应，且没有任何上下文可支持同一主体判断

如果去掉上述常见后缀后，主体名称能清晰对应同一品牌，则视为同一主体，不要仅因法人后缀差异、语言差异或轻微变体输出 `no`。

当核心商家名一致，或虽有跨语言/变体写法但仍可合理判断为同一品牌时，应放宽处理；只有在主体明确不匹配，或确实无法合理对应时，才输出 `no` / `does not clearly advertise`。

## 写作要求

- 不改变原意
- 保留所有重要核心事实
- 删除重复和前后矛盾表述
- 同一优惠、门槛、限制或条件不要换句重复说两遍
- 优先使用直接、事实型表达
- 禁止使用“but no fixed discount amount is stated”及同类不确定兜底句式
- 不同行答案的表达方式尽量自然变化，避免批量模板感
- 对 `yes` 行，优先写清楚生日权益类型、适用对象、领取方式，以及 timing / validity（若 source 明确）
- 对 `reward` / `freebie` / `points` / `voucher`，只要属于当前 merchant 的消费者生日权益，就按 birthday discount FAQ 的可接受范围写成 `yes`
- 对 merchant-specific 但不是正式官方 landing page 的 birthday offer，不要因“标准过严”误判为 `no`
- 对 `birthday-themed sale`、`party package`、`celebration package`、员工福利、B2B 工具、行业案例、泛化 roundup，不要误写成消费者生日优惠
- 避免连续使用 `about`、`usually`、`around` 等模糊词；如原文确实只有近似表达，最多保留一个必要的模糊提示
- 不要写 `The offer appears to be seasonal.`
- 没有原文证据时，不要自行补写 `seasonal`、`limited-time`、`appears to be seasonal`、`appears to be limited-time`
- 不要把 URL、网页标题、来源站名、来源括号注释直接写进 FAQ 正文
- 不要用 `品牌名 (domain.com)` 这种方式补充说明域名；正文里只保留自然品牌名
- 实体锁定要更严格；允许 `Anthony Robbins` / `Tony Robbins`、`Dental Plans` / `DentalPlans.com`、`Sam's Club` / `Sam’s Club`、`Kiehls` / `Kiehl's` 这类等价写法，但不要把两个名字机械并列到同一句里
- 对 firearm、age-restricted、regulated product 等不适合直接上线的场景，如果 source 只是说 `newsletter birthday code`，保持高层描述，不展开具体购买导向
- 语气友好、紧凑
- 严格控制在 50 个单词以内

## No-Case 输出规则

以下情况优先输出完整 `no` 句，而不是裸写 `no`：

- 主体不匹配
- 只有第三方弱证据
- 只有 `birthday-themed package` / event / employee perk
- 只有 generic savings / other promotions

推荐句式：

- `No. {Merchant} does not clearly advertise a standard birthday discount.`
- `No. {Merchant} does not clearly advertise a consumer birthday discount.`
- `No. {Merchant} does not clearly advertise a merchant-specific birthday offer.`

根据 source 选择最准确的一句。

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

`Titile1` 需要生成一个清晰、自然、与 `term_name` 对齐的 birthday discount FAQ 问题。

优先句式：

- `Does {Merchant} offer a birthday discount?`

如果目标国家不是英语环境，应翻译成对应语言。

## 执行流程

逐行处理时，按以下步骤：

1. 从 `term_name` 识别目标商家
2. 阅读 `discount_details`，不要停在第一句话；继续检查后文是否还有生日月、有效天数、会员等级、领取门槛、使用范围、适用地区、证据来源类型等高价值信息
   - 先完成 birthday-specific evidence tier 分类（A-D）
   - 同时判断 source 属于强证据、中证据还是弱证据
3. 判断源内容中的商家主体是否与目标商家一致，并清理被栏目名、上位类、别的实体污染的品牌写法
4. 做出结论：
   - A / B -> `yes`
   - C / D -> `no`
   - 若为 `yes`，优先写明 birthday offer type、who qualifies、how to get it，以及 timing / validity（如 source 明确）
   - 若为 `no`，优先使用完整 `no` 句，不要把弱证据、生日主题活动、party package 或其他实体内容误写成当前 merchant 的生日优惠
5. 用目标国家语言改写成简洁 FAQ 答案，并确保答案里的品牌主体优先复用 `term_name`
6. 检查答案是否只保留当前 `Subclass` 内容、没有编造信息、没有无依据补 `seasonal` / `limited-time`、没有把第三方说法升级成官方政策，也没有因过度强调官方 page 而误杀 merchant-specific birthday offer
7. 使用 `scripts/faq_excel_tools.py` 生成最终 Excel

## Final Sanitation

输出前必须再次检查：

- 有没有把 gated-but-official birthday offer 误判为 `no`
- 有没有把 merchant-specific newsletter / member birthday reward 误判为 `no`
- 有没有把 `reward` / `freebie` / `points` / `voucher` 误判为不是 birthday discount
- 有没有把 birthday-themed sale / `party package` / `celebration package` 误判为 `yes`
- 有没有把员工福利、B2B 工具、企业文化中的 birthday perks 误判为消费者生日优惠
- 有没有把 coupon aggregator、deal blog、generic savings site 的说法直接升级成品牌官方政策
- 有没有把别的品牌、同名实体、多个场馆或多个门店体系的 birthday offer 写给当前 merchant
- 有没有把仅凭弱聚合站猜测的内容写成确定 `yes`
- 有没有把 broader offer 写成 exact match
- 有没有把 partner offer 写成官方政策
- 有没有把 `no clear` / `no dedicated` 改成肯定 `Yes`
- 有没有在 `yes` 句中漏掉最关键的领取条件，尤其是会员、订阅、填写生日、提前注册、生日月发送
- 有没有在没有原文证据时自行补写 `seasonal`、`limited-time`、`appears to be seasonal`、`appears to be limited-time`
- 有没有残留 `Apple`、`Google Play`、`How to Apply`、`How to Get`、`Source` 等标题或来源残片
- 有没有出现 `Zarda Barbecue (zarda.com)` 这类品牌名后跟括号域名的写法
- 有没有写出与当前 merchant 不匹配的品牌名
- 有没有品牌主体被上位类、栏目名、别的实体污染
- 有没有拼接坏句子、重复句子、错别字
- 有没有出现 `Anthony Robbins Tony Robbins`、`Dental Plans DentalPlans.com`、`Sam's Club Sam’s Club`、`Kiehls Kiehl's` 这种实体双写
- 有没有把不适合直接上线的 firearm / age-restricted / regulated product 细节写得过实；如 source 只是说 `newsletter birthday code`，应保持高层描述

## 质检清单

交付前确认：

- 每一行都对应正确商家
- 每条答案都 <= 50 词
- 每条答案都使用正确国家语言
- 每条答案都至少出现一次品牌主体
- 每条答案都只写当前 `Subclass` 对应内容
- 每条答案都只保留核心事实
- 所有折扣数值都被准确保留
- 与当前 `Subclass` 直接相关的限制、资格、地区范围和要求都尽量保留、没有明显遗漏
- 没有出现“只改写首句、后文有效信息未吸收”的情况
- 没有把同一优惠或同一限制条件重复叙述
- 没有出现 URL、来源标题或不规范括号扩写式品牌表达
- 没有连续堆叠 `about`、`usually`、`around` 等模糊词
- 只有主体明确不匹配或确实无法合理对应时才输出 `no`
- 最终交付为与模板字段完全一致的 Excel 文件
