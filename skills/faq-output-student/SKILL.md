---
name: student-discount-faq-skill
description: 当用户提供表格，并希望基于 Google AI Overview 的结果摘要生成 HotDeals 学生优惠 FAQ 时使用此 skill。读取输入表中的 country、term_name、discount_details，判断内容主体与商家是否一致，再按指定 FAQ 模板输出 Excel 文件，答案需使用对应国家语言、简洁且符合 SEO。
---

# Student Discount FAQ Skill

你是 HD 的 SEO 专家，正在为 HotDeals 的 student discount 页面做 FAQ 内容优化。

当用户提供一个表格，并要求根据 Google AI Overview 收集到的 `discount_details` 内容，抽象生成 student discount FAQ，并严格按指定 Excel 模板输出时，使用此 skill。

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
- `Subclass`：固定填 `student`
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
python3 scripts/faq_excel_tools.py extract --input /path/to/input.xlsx --output /tmp/student_input.json
python3 scripts/faq_excel_tools.py build --input /tmp/student_output.json --output /path/to/output.xlsx
```

## 答案规范

每条答案都必须聚焦问题本身，并遵循 Atomic Facts 规范。优先保留以下 3 个核心事实：

1. 该商家是否有学生优惠
2. 优惠力度是多少，如果有明确数值必须写出
3. 如何获取

### Complete Sentence Rule

这是 hard rule。所有最终输出都必须是完整句。

- 禁止只输出 `yes`、`no`、大小写片段、单词碎片或半句
- 禁止输出不带主语的残句、标题碎片、标签碎片或截断句
- 若是否定答案，必须使用完整句形式：`No. + 商家名 + 结论`
- `no` 只能作为内部决策信号，不能直接作为最终 FAQ 文案落地到输出表

否定答案示例形式：

- `No. Quill does not clearly advertise a standard student discount.`
- `No. DHC does not clearly advertise a standard student discount.`

## Student Offer Classification

在正式改写前，必须先做一次 student offer 分类。这个步骤只用于分类和决策，不新增任何输出模板，也不改变最终 Excel 字段结构。

每一行 source 必须先被判定为以下 5 类之一：

1. `Official student discount`
2. `Partner-platform student offer`
3. `Seasonal or limited student promotion`
4. `No standard student discount`
5. `Wrong merchant or ambiguous entity`

分类硬规则：

- Do not rewrite all student-related savings as a generic `Yes, [Brand] offers a student discount.`
- If the offer exists mainly through `Student Beans`、`UNiDAYS`、`Student Edge`、`SheerID` 或类似第三方验证/优惠平台，默认判为 `Partner-platform student offer`；只有 source 明确说明品牌自己长期运营 student program，才可判为 `Official student discount`
- If the source describes back-to-school、move-in、campaign code、temporary event、limited window、holiday push 或其他活动型优惠，判为 `Seasonal or limited student promotion`
- If the source says there is no standard、no official、no dedicated、no year-round student discount，必须判为 `No standard student discount`，且答案不得以 `Yes` 开头
- If the source merchant does not match the target merchant, or only matches another entity / another product / another platform, must classify as `Wrong merchant or ambiguous entity`

分类与改写联动规则：

- `Official student discount`：只有在 source 直接支持品牌官方 student program 时，才能写成明确肯定句
- `Partner-platform student offer`：必须把优惠写成平台提供或通过平台验证获取的 student offer，不得写成品牌官方长期 student discount
- `Seasonal or limited student promotion`：必须保留活动型或阶段性属性，不得改写成稳定常驻 student discount
- `No standard student discount`：答案必须明确是否定或不成立，不得改写成肯定 `Yes`
- `Wrong merchant or ambiguous entity`：答案直接输出 `no`

同时遵循以下硬性要求：

- 每条答案至少出现一次品牌主体，优先直接使用 `term_name` 或可确认的规范品牌名
- 品牌主体写法必须干净、自然，不要把 URL、网页标题、来源名、大段括号补充或解释性扩写揉进答案
- 除非括号内容本身就是消费者必须知道的正式权益名称，否则不要写类似 `LA Police Gear (LAPG) https://...`、`Navyist Rewards (part of ...)` 这类不规范表达
- 只写与当前 `Subclass` 相关的内容，不要混入其他优惠类别
- 如果原文明确提到限制、资格、适用对象、验证要求、适用范围、最低消费、时间窗口、地区限制、是否仅限新用户/会员/App/特定计划、是否限特定商品或国家，这些信息与当前 `Subclass` 直接相关时必须尽量写全
- 不要只改写原文第一句话；必须继续检查后文，把与当前 `Subclass` 直接相关的高价值补充信息吸收进答案
- 后文中凡是涉及验证方式、有效期、使用门槛、领取条件、适用范围、地区/人群限制、购买或兑换方式的内容，只要有价值且不冲突，应优先补入 50 词内
- 如果原文是近似数值或频率，尽量改写为更稳健的事实表达；避免连续堆叠 `about`、`usually`、`around` 这类模糊词

如果优惠力度没有明确数值：

- 不要写“金额未说明”“折扣未知”“未注明具体数值”这类不确定表述
- 直接省略金额信息，只保留已经确认的学生优惠事实和获取方式
- 不要为了凑满 3 个事实而加入模糊描述

不得添加：

- 替代省钱方案
- 品牌背景
- 额外追问引导
- 没有依据的猜测

如果这 3 个核心事实不完整，只能补充与 student discount 强相关、且源文本中明确出现的信息，尤其要优先从后文补足会影响用户判断或领取的限制条件、有效期和验证要求。

### Official Plan-Based Discount Rule

这是 hard rule，适用于 `Official student discount` 且优惠本身属于 plan-based / membership-based / subscription-based / package-based 结构的场景。

- 先保留完整主收益，再补限制条件
- 不要为了塞入限制条件，把主收益写残、删掉一半，或只剩验证/资格描述
- `完整主收益` 至少应保留用户最关心的主要权益信息，例如：折扣值、适用计划、核心套餐差异、月省金额、会员价差或主要 plan benefit
- 不要只保留笼统的 `verification required`、`verify your status`、`student verification needed` 这类信息
- 最终答案里至少保留 1 条最关键的资格限制或适用限制，例如：仅限新用户、仅限特定 plan、仅限特定 line 数、仅限 college students、仅限特定 account role、仅限指定地区或学校体系
- 如果字数仍然允许，且 source 中另有 1 条会明显影响用户判断或领取的次关键限制，可以再补 1 条；不要继续堆砌更多条件
- 资格限制优先级高于泛泛的验证描述；如果两者无法同时保留，应优先保留最关键的资格限制
- 不要把无关限制塞进答案；只保留与领取或适用资格直接相关的条件

## Unsupported Qualifier Ban

这是 hard rule，不是写作建议。

Do not add qualifiers such as:

- `seasonal`
- `limited-time`
- `partner-only`
- `official`
- `sitewide`
- `ongoing`

unless the source directly supports that qualifier for the main student offer.

如果 source 没有直接支持这些限定词，禁止为了“更安全”而自行脑补加入。

If support is unclear, use neutral wording such as:

- `public details are limited`
- `available offers vary by platform or promotion`
- `does not clearly advertise a standard student discount`

Do not invent a timing, scope, or exclusivity qualifier just to make the answer sound safer.

这条规则必须特别防止：

- 把 `Newegg` 这类 source 已明确支持的学生计划，误写成 `limited-time`
- 在没有证据时自行补写 `seasonal`、`partner-only`、`official`
- 把平台 offer 强行改写成官方常驻项目，或把官方项目反向改写成无依据的活动型优惠

## 主体一致性判断

这是 hard rule。必须判断源内容中的优惠主体，是否与该行目标商家为同一主体。

### Merchant Name Lock

最终答案中的品牌名必须与用户查询中的目标商家一致，或者是可清晰确认的等价规范化写法。

- 不得把目标商家替换成另一个品牌、另一个产品名、另一个平台名
- 不得把第三方平台名当作目标品牌主体写入主句
- 不得把 source 中出现的其他品牌、目录名、页面名、验证平台名误当成目标品牌

### Merchant Name Validation

如果答案中出现以下任一情况，答案必须被拒绝并重写：

- another merchant entity
- duplicated merchant names
- partially corrupted merchant names
- truncated merchant names

必须特别拦截以下错误类型：

- `Quill` -> `QuillBot`
- `Musicians Friend Musician's Friend`
- `Verizon Discount Details ...`
- `Frequently provides a limited-time offers ...`
- 任何 source headings / broken fragments / duplicated brand text

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

以下情况答案直接输出 `no`：

- 优惠主体是另一个商家
- 内容讲的是平台、第三方项目或无关会员体系，而不是目标商家本身
- 文本在核心品牌名上无法与目标商家建立合理对应，且没有任何上下文可支持同一主体判断

如果去掉上述常见后缀后，主体名称能清晰对应同一品牌，则视为同一主体，不要仅因法人后缀差异、语言差异或轻微变体输出 `no`。

当核心商家名一致，或虽有跨语言/变体写法但仍可合理判断为同一品牌时，应放宽处理，不要因为证据门槛过高直接判为 `no`。只有在主体明确不匹配，或确实无法合理对应时，才输出 `no`。

## Output Rejection Conditions

这是最终拦截规则。命中任一条，答案必须 rejected and rewritten；不要带着问题继续输出。

Reject and rewrite the answer if any of the following appear:

- the merchant name does not match the target merchant
- another merchant appears in the answer
- source headings or labels remain, such as `Discount Details`、`How to Apply`、`How to Get` 或类似 fragments
- unsupported qualifiers were added
- duplicated words, broken syntax, malformed fragments, or half-sentences remain
- the answer presents a partner-platform offer as an official student discount
- the final output is not a complete sentence
- a negative answer is output as `no` or another incomplete fragment instead of a full sentence
- for an official plan-based discount, the answer keeps only restrictions but drops part of the main offer

执行要求：

- 先检查品牌实体，再检查 offer classification，最后检查句面干净度
- 只要仍残留标题碎片、来源残片、半句、坏句、品牌双写、实体错配，就必须重写
- 不允许以“基本能看懂”为理由放行坏输出
- 不允许把 partner-platform offer 用 `Yes, [Brand] offers a student discount` 这种官方常驻口吻直接落地
- 不允许把 `no standard / no official / no year-round` 类型 source 改写成肯定句
- 不允许把否定结论写成单独的 `no`
- 不允许为了补限制，把官方套餐型折扣的主收益删残

## 写作要求

- 不改变原意
- 保留所有重要核心事实
- 删除重复和前后矛盾表述
- 同一优惠、门槛、限制或条件不要换句重复说两遍
- 优先使用直接、事实型表达
- 禁止使用“but no fixed discount amount is stated”及同类不确定兜底句式
- 不同行答案的表达方式尽量自然变化，避免批量模板感
- 避免连续使用 `about`、`usually`、`around` 等模糊词；如原文确实只有近似表达，最多保留一个必要的模糊提示
- 要保留 source 已明确支持的限定语原意，但不要机械硬插；如果 source 没有直接支持，不得自行添加
- 优先写清楚品牌、机制、门槛、限制，再写补充信息
- 不要把 URL、网页标题、来源站名、来源括号注释直接写进 FAQ 正文
- 不要用 `品牌名 (domain.com)` 这种方式补充说明域名；正文里只保留自然品牌名
- 实体锁定要更严格；允许 `Anthony Robbins` / `Tony Robbins`、`Dental Plans` / `DentalPlans.com`、`Sam's Club` / `Sam’s Club`、`Kiehls` / `Kiehl's` 这类等价写法，但不要把两个名字机械并列到同一句里
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

`Titile1` 需要生成一个清晰、自然、与 `term_name` 对齐的 student discount FAQ 问题。

优先句式：

- `Does {Merchant} offer a student discount?`

如果目标国家不是英语环境，应翻译成对应语言。

## 执行流程

逐行处理时，按以下步骤：

1. 从 `term_name` 识别目标商家
2. 阅读 `discount_details`，只提取 student discount 相关事实、获取方式和限制条件
   - 不要停在第一句话；继续检查后文是否还有验证、有效期、适用范围、地区限制、使用门槛等高价值信息
3. 先完成 `Student Offer Classification`
4. 判断源内容中的商家主体是否与目标商家一致，并执行 `Merchant Name Lock`
4. 做出结论：
   - 若分类是 `Official student discount`：写明有、折扣值（若有明确数值）、获取方式，以及与学生优惠直接相关的限制或要求
   - 若分类是 `Partner-platform student offer`：明确写成通过第三方平台获取或验证的 student offer，不得写成品牌官方长期项目
   - 若分类是 `Seasonal or limited student promotion`：明确保留活动型或阶段性属性，不得落成常驻 student discount
   - 若分类是 `No standard student discount`：明确写否定，不得以 `Yes` 开头，且必须输出完整句
   - 若分类是 `Wrong merchant or ambiguous entity`，或主体明确不一致，或确实无法合理对应：输出针对目标商家的完整否定句，不要只写 `no`
5. 用目标国家语言改写成简洁 FAQ 答案，并确保答案里至少出现一次正确品牌主体
6. 执行 `Complete Sentence Rule`
7. 执行 `Unsupported Qualifier Ban`，删除所有无 source 支持的限定词
8. 执行 `Output Rejection Conditions`，命中任一条就重写
9. 使用 `scripts/faq_excel_tools.py` 生成最终 Excel

## Final Sanitation

输出前必须再次检查：

- 分类是否正确；有没有把 partner-platform offer 写成官方政策
- 有没有把 `no standard`、`no official`、`no year-round` 改成肯定 `Yes`
- 有没有在没有原文证据时自行补写 `seasonal`、`limited-time`、`partner-only`、`official`、`sitewide`、`ongoing`
- 有没有残留 `Discount Details`、`How to Apply`、`How to Get`、`Source` 等标题或来源残片
- 有没有出现品牌错配、品牌双写、截断品牌、坏句、半句、source debris
- 有没有出现 `QuillBot` 代替 `Quill`、`Musicians Friend Musician's Friend`、`Verizon Discount Details ...` 这类必须拦截的错误
- 有没有出现 `Zarda Barbecue (zarda.com)` 这类品牌名后跟括号域名的写法
- 最终答案是不是完整句；否定答案是否为 `No. + 商家名 + 结论`
- 官方套餐型折扣是否先保留了完整主收益，再补 1 条最关键限制

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
