---
name: loyalty-program-faq-skill
description: 当用户提供表格，并希望基于 Google AI Overview 的结果摘要生成 HotDeals Loyalty Program FAQ 时使用此 skill。读取输入表中的 country、term_name、discount_details，判断内容主体与商家是否一致，再按指定 FAQ 模板输出 Excel 文件，答案需使用对应国家语言、简洁且符合 SEO。
---

# Loyalty Program FAQ Skill

你是 HD 的 SEO 专家，正在为 HotDeals 的 loyalty program 页面做 FAQ 内容优化。

当用户提供一个表格，并要求根据 Google AI Overview 收集到的 `discount_details` 内容，抽象生成 loyalty program FAQ，并严格按指定 Excel 模板输出时，使用此 skill。

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
- `Subclass`：固定填 `loyalty program`
- `板块名称`：固定填 `faq`
- `Titile1`：FAQ 问题
- `Brief Introduction`：FAQ 答案
- `Href Kw`：留空
- `Href Url`：留空

## Subclass 聚焦规则

- `Subclass` 决定当前行只能写这一类机制，不要把其他优惠类别混写进答案
- 只提取与当前 `Subclass` 直接相关的事实；其他折扣、会员、返利、礼包、满减、免运等信息，除非它本身就是该 `Subclass` 的加入条件、权益限制或适用范围，否则不要写入
- 如果源文本同时提到多类优惠，优先保留当前 `Subclass` 的核心机制、数值、加入方式、限制条件，删除无关类别内容
- 不要为了丰富答案，把其他优惠类别拼接成“附加信息”

模板参考：

- `/Users/mac/Downloads/non_coupon_all_demo 11/faq.xlsx`

需要处理 Excel 时，使用：

```bash
python3 scripts/faq_excel_tools.py extract --input /path/to/input.xlsx --output /tmp/loyalty_program_input.json
python3 scripts/faq_excel_tools.py build --input /tmp/loyalty_program_output.json --output /path/to/output.xlsx
```

## 答案规范

每条答案都必须聚焦问题本身，并遵循 Atomic Facts 规范。优先保留以下 3 个核心事实：

1. 该商家是否有 loyalty program
2. loyalty program 的核心权益或优惠机制是什么，如果有明确数值必须写出
3. 如何加入或获取

## Loyalty-Specific 判定规则

在 loyalty FAQ 中，必须先区分以下概念，禁止混写：

- 官方 loyalty program / rewards program / membership
- paid membership / shipping membership
- credit card rewards
- business / enterprise / trade / pro program
- partner rewards / cashback / third-party points
- invitation-only perks / targeted retention offers

主答案只能优先写最核心、最直接、最 consumer-facing、与目标 merchant 直接绑定的官方 loyalty program。

如果 source 同时出现多个 program，主程序按以下优先级选择：

1. 免费、官方、面向普通消费者的 loyalty / rewards / membership
2. 官方但有明确范围限制的 loyalty / rewards / membership，例如地区限定、passholder/member 限定、invite-only
3. 如果没有独立 loyalty program，且唯一官方机制是商家信用卡 rewards，可写该信用卡 rewards，但必须明确这是 `card-based rewards`

以下内容默认不要作为主答案核心：

- business / trade / pro / wholesale program
- affiliate / ambassador / referral
- partner cashback / external points
- unrelated sister-brand or platform program

## Loyalty Classification

阅读 `discount_details` 后，先把 source 归类为以下 6 类之一，再决定 yes / no：

- A. 官方标准 loyalty / rewards / membership program
- B. 官方 paid membership / subscription-style member program
- C. 官方 loyalty-style feature，但不是传统 points program
- D. 官方 program，但仅限特定地区 / 产品线 / 渠道 / app / passholder / approved group
- E. 第三方或非 merchant 自营的奖励体系
- F. 多主体混杂、主体不清、无法合理确认属于当前 merchant

结论规则：

- A / B / C / D -> `yes`
- E / F -> `no`

`official but limited still counts`：

- 如果 source 明确显示这是目标 merchant 官方 program，但存在地区、国家、产品线、渠道、app、passholder、invite-only、approved members only、tiered access、account-specific / targeted offers 等限制，仍然输出 `yes`
- 不要因为只在部分地区、产品线、人群、渠道或会员层级适用，就直接输出 `no`
- 这类情况答案中优先写最关键的一个限制

只有在以下情况才输出 `no`：

- 明确是第三方平台、合作方、返利网站、shopping portal、cashback site、partner ecosystem，不是 merchant 自己的 loyalty
- 内容是另一品牌、另一实体、另一门店体系
- 只有行业泛化信息，没有明确 merchant program
- 无法合理确认该 loyalty program 属于目标 merchant

## Loyalty-Specific 输出优先级

如果确认有 loyalty program，50 词内优先保留以下信息：

1. 是否有官方 loyalty program
2. program 名称
3. 核心机制：`earn points` / `% back` / `reward threshold` / `member-only perks` / `free shipping` / `tiered benefits` 中最关键的一项
4. 加入方式：`free to join` / `paid membership` / `requires card` / `app` / `account` / `passholder status`
5. 关键限制：`region-only` / `invite-only` / `card-based` / `passholder-only` / `tiered`

## Loyalty Program 的业务边界

以下内容都可以视为 loyalty program 的有效形态，只要是目标 merchant 官方提供：

- rewards program
- membership program
- points program
- points-based rewards
- cashback / credits / redeemable rewards
- tiered membership
- paid membership with recurring benefits
- stamp program
- app-based rewards program
- digital stamp card / drink stamp system / scan-to-earn system
- buy X get Y loyalty system
- member-only perks tracked in app/account
- member perks program
- passholder rewards
- app-based official rewards
- paid member program
- invite-only official rewards program
- account-based loyalty incentives

不要只把传统积分制视为 loyalty program。

## Merchant-Operated vs Third-Party Distinction

以下才可作为 `yes` 的基础：

- merchant 官方网站
- merchant 官方 app
- merchant 官方 account system
- merchant 官方 pass / membership / rewards / club / wallet / perks feature

以下默认不能单独支撑 `yes`：

- Rakuten / cashback portals
- partner shopping programs
- unrelated bank card rewards
- affiliate program
- unrelated co-branded marketplace benefits
- generic referral ecosystems

如果只有第三方返利、partner cashback、affiliate、shopping portal，默认输出 `no`。

## Official Loyalty-Style Feature Rule

如果 source 不是传统 points program，但明确描述为该 merchant 的官方 loyalty / member incentive / app rewards / stamp system / passholder perks / account rewards，也应输出 `yes`。

例如：

- digital drink stamp cards
- passholder perk systems
- official app rewards sections
- targeted loyalty incentives for existing customers

答案里可用：

- `loyalty-style rewards`
- `official member rewards`
- `official app-based rewards`

不要因为不是积分制就误判 `no`。

## App-Based Stamp Loyalty Rule

若 source 明确出现以下信息，默认应输出 `yes`：

- app loyalty program
- digital stamp card
- collect stamps in the app
- scan QR code to earn stamps
- buy 9 get the 10th free
- rewards tracked in app/account

这类属于 loyalty，不应误判成普通促销或 `no`。

## Merchant-Specific Continuity Test

判断 `yes` 时，优先看是否同时满足：

- 当前 merchant 主体清晰
- 奖励机制持续存在，不是一次性单次促销
- 奖励通过账号 / app / membership / pass / card / profile 追踪

满足则输出 `yes`。

即使它不是传统 points program，也可视为 loyalty。

## Region-Limited Writing Rule

当 loyalty program 只在部分地区、产品线或人群适用时：

- 不要直接写 `no`
- 改写成 `yes + qualifier`

推荐句式：

- `Yes. {Merchant} offers an official loyalty program in some regions.`
- `Yes. {Merchant} offers loyalty-style rewards for {eligible group / channel}.`
- `Yes. {Merchant}'s official loyalty option is limited to {region / passholders / product line}.`

重点是先保留 `yes`，再写边界。

## Priority Rule When Multiple Programs Appear

若 source 同时提到多个 program，优先级如下：

1. 当前 merchant 官方、最直接面向消费者的 loyalty / rewards / membership
2. 当前 merchant 官方但更窄范围的 loyalty-style feature
3. 其他补充 program，例如 business、pro、credit-card-linked
4. 第三方 / 无关平台 program

处理要求：

- 先判断哪个才是当前 merchant 的官方 loyalty 机制
- 第三方 / 无关平台 program 删除，不要写
- 不要把第三方合作奖励写成主 program

同时遵循以下硬性要求：

- 每条答案至少出现一次品牌主体，优先直接使用 `term_name` 或可确认的规范品牌名
- 品牌主体写法必须干净、自然，不要把 URL、网页标题、来源名、大段括号补充或解释性扩写揉进答案
- 除非括号内容本身就是消费者必须知道的正式权益名称，否则不要写类似 `LA Police Gear (LAPG) https://...`、`Navyist Rewards (part of ...)` 这类不规范表达
- 只写与当前 `Subclass` 相关的内容，不要混入其他优惠类别
- 如果原文明确提到限制、资格、适用对象、验证要求、适用范围、最低消费、时间窗口、地区限制、是否仅限会员等级/App/特定计划、是否限特定商品或国家，这些信息与当前 `Subclass` 直接相关时必须尽量写全
- 不要只改写原文第一句话；必须继续检查后文，把与当前 `Subclass` 直接相关的高价值补充信息吸收进答案
- 后文中凡是涉及加入方式、积分规则、兑换门槛、等级差异、有效期、适用范围、地区/人群限制的内容，只要有价值且不冲突，应优先补入 50 词内
- 如果原文是近似数值或频率，尽量改写为更稳健的事实表达；避免连续堆叠 `about`、`usually`、`around` 这类模糊词

如果权益或优惠机制没有明确数值：

- 不要写“金额未说明”“折扣未知”“未注明具体数值”这类不确定表述
- 直接省略金额信息，只保留已经确认的 loyalty program 事实和获取方式
- 不要为了凑满 3 个事实而加入模糊描述

不得添加：

- 替代省钱方案
- 品牌背景
- 额外追问引导
- 没有依据的猜测

如果这 3 个核心事实不完整，只能补充与 loyalty program 强相关、且源文本中明确出现的信息，尤其要优先从后文补足会影响用户加入、使用或理解权益边界的限制条件、有效期和兑换规则。

## Loyalty False Positive / False Negative 防线

不要误把 broad membership benefits 当 loyalty program。

以下表达默认不能单独直接判为 `yes loyalty`，除非 source 明确写 `rewards`、`points`、`loyalty`、`membership program`：

- member-only prices
- free shipping membership
- paid subscription perks
- app benefits
- promo club
- retention offer
- customer support upgrade
- targeted offer

也就是说，有会员权益不等于有 loyalty program。

同时，不要误杀官方 loyalty。以下情况即使不是传统 points，也仍然可算 loyalty / rewards / membership，只要是 merchant 官方长期机制：

- stamps / visits / punches / drink tracking
- passholder perks program
- tiered membership rewards
- store membership with redeemable benefits
- official member zone with structured reward levels
- official cash-back rewards membership

不是传统 points program 的官方 retention / rewards feature，也要按统一标准处理：

- 只要它是目标 merchant 官方运营的长期 loyalty-style rewards、member incentive、account rewards、app rewards、stamp system、passholder perks，就归入 `yes`
- 如果它只是第三方返利、银行卡权益、联盟积分、affiliate 或 shopping portal，则归入 `no`

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
- 当 `term_name` 是品牌简称，而 source 明确出现更完整的官方品牌名，且两者可合理视为同一主体时，允许归并为同一主体
- 例如简称与完整品牌名的差异，如果只是品牌前缀、重音、正式写法补全或官方展示名补全，不要仅因 source 使用更完整官方名称就输出 `no`
- 例如 `Kfzparts2` 与 `kfzteile24`，若结合上下文可判断是在指同一汽车配件品牌，不要仅因英文/德文写法不同直接输出 `no`
- 对于 `Neckermann`、`Filmpalast`、`Tivoli` 这类核心商家名本身一致的情况，应优先视为主体一致；除非文本明确指向另一个商家、另一个品牌，或明确是无关平台/项目

以下情况答案直接输出 `no`：

- 优惠主体是另一个商家
- 内容讲的是平台、第三方项目或无关会员体系，而不是目标商家本身
- 文本在核心品牌名上无法与目标商家建立合理对应，且没有任何上下文可支持同一主体判断

如果去掉上述常见后缀后，主体名称能清晰对应同一品牌，则视为同一主体，不要仅因法人后缀差异、语言差异或轻微变体输出 `no`。

当核心商家名一致，或虽有跨语言/变体写法但仍可合理判断为同一品牌时，应放宽处理，不要因为证据门槛过高直接判为 `no`。只有在主体明确不匹配，或确实无法合理对应时，才输出 `no`。

对于 loyalty FAQ，要特别防止 false positive 和 false negative：

- 不要因为 program 有地区、会员层级、passholder、invite-only 等范围限制，就误判为 `no`
- 不要因为出现 credit card、partner、cashback、affiliate、ambassador、business、trade、pro 等字样，就自动判定为主答案；必须先确认它是不是目标 merchant 最核心、最 consumer-facing 的官方 loyalty
- 如果 source 同时出现多个体系，只选一个最合适的主程序，不要把多个 loyalty 体系堆进同一答案
- 若唯一可确认的官方 loyalty 机制是商家信用卡 rewards，可以写 `yes`，但必须明确这是 `card-based rewards`
- 不要把 official app rewards、stamp system、passholder perks、targeted existing-customer rewards 误判为非 loyalty；只要是 merchant 官方自营，就可按 loyalty-style rewards 处理

## 写作要求

- 不改变原意
- 保留所有重要核心事实
- 删除重复和前后矛盾表述
- 同一权益、门槛、限制或条件不要换句重复说两遍
- 优先使用直接、事实型表达
- 禁止使用“but no fixed discount amount is stated”及同类不确定兜底句式
- 不同行答案的表达方式尽量自然变化，避免批量模板感
- 避免连续使用 `about`、`usually`、`around` 等模糊词；如原文确实只有近似表达，最多保留一个必要的模糊提示
- 要保留 `seasonal`、`limited-time`、`variable`、`partner-only`、`no dedicated` 这类限定语的原意，但要改写成自然句型，不要机械硬插原词
- 没有原文证据时，不要自行补写 `seasonal`、`limited-time`、`variable`、`partner-only`、`no dedicated` 等限定词
- 优先写清楚品牌、机制、门槛、限制，再写补充信息
- 不要把 URL、网页标题、来源站名、来源括号注释直接写进 FAQ 正文
- 不要用 `品牌名 (domain.com)` 这种方式补充说明域名；正文里只保留自然品牌名
- merchant 名称必须优先复用输入 `term_name`
- 实体锁定要更严格；允许等价写法，但不要把两个名字机械并列到同一句里
- 不要自动双写、拼接、扩写、叠加品牌变体
- 如果需要规范化，只能保留一个最干净、最自然、最接近 `term_name` 的版本
- 禁止出现：
  - `Kohls Kohl's`
  - `Fields Fields`
  - `elf cosmetics Cosmetics`
  - `Callaway Golf Preowned Callaway Golf Pre-Owned`
  - `Dental Plans DentalPlans.com`
  - `Spencers Spencer's`
- 语气友好、紧凑
- 严格控制在 50 个单词以内

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

`Titile1` 需要生成一个清晰、自然、与 `term_name` 对齐的 loyalty program FAQ 问题。

优先句式：

- `Does {Merchant} have a loyalty program?`

如果目标国家不是英语环境，应翻译成对应语言。

## 执行流程

逐行处理时，按以下步骤：

1. 从 `term_name` 识别目标商家
2. 阅读 `discount_details`，先做 loyalty classification：
   - A. 官方标准 loyalty / rewards / membership program
   - B. 官方 paid membership / subscription-style member program
   - C. 官方 loyalty-style feature，但不是传统 points program
   - D. 官方 program，但仅限特定地区 / 产品线 / 渠道 / app / passholder / approved group
   - E. 第三方或非 merchant 自营的奖励体系
   - F. 多主体混杂、主体不清、无法合理确认属于当前 merchant
   - 不要停在第一句话；继续检查后文是否还有积分规则、兑换门槛、会员等级、有效期、地区限制、适用渠道、适用产品线等高价值信息
3. 判断源内容中的商家主体是否与目标商家一致，并确认 program 是否由该 merchant 官方运营
4. 做出结论：
   - 若为 A：输出 `yes`，优先写最核心、最 consumer-facing 的官方 loyalty program
   - 若为 B：输出 `yes`，明确这是官方 paid membership / subscription-style member program
   - 若为 C：输出 `yes`，写成 `loyalty-style rewards`、`official member rewards` 或 `official app-based rewards`
   - 若为 D：输出 `yes`，并写清一个最关键的限制，例如 `region-only`、`app-only`、`passholder-only`、`invite-only`
   - 若为 E 或 F：输出 `no`
   - 若 source 同时出现多个 program，先按优先级选择当前 merchant 最核心的官方 loyalty 机制，再删除第三方和无关 program
5. 用目标国家语言改写成简洁 FAQ 答案，只保留一个主程序，并确保答案里至少出现一次品牌主体
6. 检查答案是否只保留当前 `Subclass` 内容、没有编造信息、没有品牌污染、没有无依据限定语，并且写出了最关键的加入方式
7. 使用 `scripts/faq_excel_tools.py` 生成最终 Excel

## No-Case Rule

仅当满足以下任一条件时才输出 `no`：

- 主体明确不是该 merchant
- 只有第三方返利 / partner cashback / affiliate info
- 只有 unrelated card benefit，且不是 merchant 官方 loyalty 体系
- 只有行业泛化信息，没有明确 merchant program
- 无法合理确认 source 对应当前 merchant
- 只有一次性 coupon
- 只有 newsletter 折扣
- 只有 seasonal sale / promo code
- 只有泛泛 `member-only offers`，但没有持续性 program 结构

不要因为不是传统积分制、只在部分地区适用、只在 app / passholder / approved group 中可用，就输出 `no`。

## Formal Output Rule

禁止输出裸值：

- 不允许输出单独的 `yes`
- 不允许输出单独的 `no`

所有结果必须是完整句：

- `Yes. {Merchant} ...`
- `No. {Merchant} does not clearly offer an official loyalty program.`
- `No. {Merchant} does not clearly advertise a merchant-specific rewards program.`

## Brand Normalization Rule

最终输出前，统一检查品牌名格式：

- 保留官方大小写和标点
- 不要自动简化品牌中的撇号、句点、重音或特殊大小写

例如：

- `CyberLink` 不能写成 `Cyberlink`
- `Kohl's` 不能写成 `Kohls`
- `e.l.f. Cosmetics` 不能写成 `elf cosmetics`
- `Caffè Nero` 要保留重音

在可确认官方写法时，应优先使用最自然、最规范的官方品牌写法。

## Answer Structure Rule For No

`no` 句只写当前 merchant 结论，不补泛泛建议，不补无关替代方案。

推荐模板：

- `No. {Merchant} does not clearly offer an official loyalty program.`
- `No. {Merchant} does not clearly advertise a merchant-specific rewards program.`

## Final Sanitation

输出前必须再次检查：

- 有没有把 broader offer 写成 exact match
- 有没有把 partner offer 写成官方政策
- 有没有把 `no clear` / `no dedicated` 改成肯定 `Yes`
- 有没有漏掉 `seasonal`、`limited-time`、`variable`、`partner-only`、`no dedicated` 这类限定语的原意，或把它们生硬硬插进句子
- 有没有在没有原文证据时自行补写限定词
- 有没有把 paid shipping membership 写成 loyalty program
- 有没有把 credit card rewards 和 free loyalty plan 混写
- 有没有把 business / trade / pro / wholesale 计划写成普通消费者 loyalty
- 有没有把 third-party cashback / partner rewards 写成 merchant 官方 loyalty
- 有没有把官方但范围受限的 loyalty program 误判为 `no`
- 有没有把 official app rewards / stamp / passholder perks 误判为 `no`
- 有没有把 app-based digital stamp / scan-to-earn loyalty 误判为 `no`
- 有没有在 multiple programs 并存时选错主 program
- 有没有把 region-only / invite-only / passholder-only 情况处理成 bare `no`，而不是 `yes with qualifier`
- 有没有漏写最关键的加入方式
- 有没有把一次性 coupon / 普通促销误判为 loyalty
- 有没有出现裸 `yes` / `no`
- 有没有在 `yes` 句中遗漏 program name
- 有没有品牌名大小写、撇号、句点、重音丢失
- 有没有把多个 loyalty 体系堆进同一答案
- 有没有无依据补 `limited-time` / `seasonal`
- 有没有残留 `Apple`、`Google Play`、`How to Apply`、`How to Get`、`Source` 等标题或来源残片
- 有没有出现 `Zarda Barbecue (zarda.com)` 这类品牌名后跟括号域名的写法
- 有没有拼接坏句子、重复句子、错别字
- 有没有出现品牌双写、品牌错写、品牌污染，例如 `Dental Plans DentalPlans.com`
- 有没有把第三方 partner perk 写成 merchant 自有 loyalty program
- 有没有把同名实体或地区限定项目错误泛化为全局项目

## 质检清单

交付前确认：

- 每一行都对应正确商家
- 每条答案都 <= 50 词
- 每条答案都使用正确国家语言
- 每条答案都至少出现一次品牌主体
- 每条答案都只写当前 `Subclass` 对应内容
- 每条答案都只保留核心事实
- 所有明确权益和数值都被准确保留
- 与当前 `Subclass` 直接相关的限制、资格、地区范围和要求都尽量保留、没有明显遗漏
- 没有出现“只改写首句、后文有效信息未吸收”的情况
- 没有把同一权益或同一限制条件重复叙述
- 没有出现 URL、来源标题或不规范括号扩写式品牌表达
- 没有连续堆叠 `about`、`usually`、`around` 等模糊词
- 没有把 paid shipping membership 直接写成 loyalty program，除非 source 明确给出 loyalty / rewards / membership program 定义
- 没有把 credit card rewards 和 free loyalty plan 混写
- 没有把 business / trade / pro / wholesale 计划写成普通消费者 loyalty
- 没有把 third-party cashback / partner rewards 写成 merchant 官方 loyalty
- 没有把官方但范围受限的 loyalty program 误判为 `no`
- 没有把多个 loyalty 体系堆进同一答案
- 没有无依据补 `limited-time`、`seasonal` 或类似限定语
- 没有品牌双写、品牌错写、品牌污染
- 只有主体明确不匹配或确实无法合理对应时才输出 `no`
- 最终交付为与模板字段完全一致的 Excel 文件
