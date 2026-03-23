---
name: child-discount-faq-skill
description: 当用户提供表格，并希望基于 Google AI Overview 的结果摘要生成 HotDeals 儿童优惠 FAQ 时使用此 skill。读取输入表中的 country、term_name、discount_details，判断内容主体与商家是否一致，再按指定 FAQ 模板输出 Excel 文件，答案需使用对应国家语言、简洁且符合 SEO。
---

# Child Discount FAQ Skill

你是 HD 的 SEO 专家，正在为 HotDeals 的 child discount 页面做 FAQ 内容优化。

当用户提供一个表格，并要求根据 Google AI Overview 收集到的 `discount_details` 内容，抽象生成 child discount FAQ，并严格按指定 Excel 模板输出时，使用此 skill。

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
- `Subclass`：固定填 `child`
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

## Child Discount 定义

当前 skill 的目标问题是：

- 这个 merchant 是否存在可以面向儿童、未成年人、child category 明确认定的优惠、儿童票价、儿童免费政策、儿童专属折扣或儿童相关专属权益

`child discount` 在本 skill 中只接受以下 4 类证据：

### A. 明确的儿童票价 / 儿童定价

这类证据可直接支持 `Yes`：

- `child fare`
- `child ticket`
- `child price`
- `junior price`
- `kids rate`
- `child pass`
- `reduced fare for children`
- `discounted child admission`

### B. 明确的儿童免费政策

这类证据可直接支持 `Yes`：

- `kids stay free`
- `children under X stay free`
- `children under X free admission`
- `infants travel free or reduced`
- `children under X enter free`

### C. 明确针对儿童商品 / 儿童分类的优惠

这类证据只在信息明确指向 merchant 自身的 kids category / kids collection / kids sale / kids clearance / children's products discount 时才可保留：

- `kids sale section`
- `children's clearance`
- `discounted kids' shoes`
- `reduced-price children's eyewear`
- `sale pricing on kids' apparel`

这是较弱的 `Yes` 类型。只能写成 `discounted kids' items`、`kids' items in sale or clearance sections`、`discounted children's products` 这一类克制句式。

### D. 明确的儿童专属权益 / 儿童专属活动优惠

这类证据可直接支持 `Yes`：

- `child birthday coupon`
- `kids class participant discount`
- `junior gear special pricing`
- `child-only pass pricing`
- `kid-specific bundle discount`

## 必须判 No 的情况

以下情况即使出现了 `child`、`kids`、`student`、`school` 等词，也不能直接判 `Yes`：

### 1. 学生优惠 / 教育优惠不等于 child discount

以下都不算 child discount：

- `student discount`
- `education pricing`
- `school pricing`
- `teacher / educator offers`
- `academic membership`
- `back-to-school` 的泛促销，除非明确只针对 kids products 或 child fares

### 2. 不是 merchant 自身，而是错误实体 / 同名实体

如果参考信息明显指向另一个品牌、地点、景点、机构、franchise、地区版本或 legal entity，不能拿来回答当前 merchant。

### 3. 只是卖 kids products，但没有明确优惠或儿童价

仅出现以下内容还不够：

- `kids category`
- `children's products`
- `kids collection`
- `children's items`

必须同时出现折扣、优惠价、儿童票价、免费政策或儿童专属权益。

### 4. 只是泛商品促销，且没有明确指向 kids

以下默认不算 child discount：

- `sitewide sale`
- `seasonal sale`
- `newsletter discount`
- `clearance`

除非原文明确说明它适用于 kids items、child fares、child pricing 或 child access。

### 5. 只有第三方平台 / 聚合页 / 论坛 / 泛推荐文章在推断

如果只有第三方在说“可能有”“经常有”“可以看看”，但没有足够证据证明 merchant 本身明确提供 child discount，应保守处理。通常输出完整 `No` 句；只有方向基本正确但力度不足时，才允许 `appears to`。

### 6. 家庭计划 / 保险计划 / 会员计划 / 机构授权

以下默认不算 child discount：

- `pediatric plan`
- `family plan`
- `school license`
- `classroom license`
- `institutional pricing`

除非它能被明确改写为当前 merchant 面向 child 的直接优惠机制，否则不要写进 FAQ。

模板参考：

- `/Users/mac/Downloads/non_coupon_all_demo 11/faq.xlsx`

需要处理 Excel 时，使用：

```bash
python3 scripts/faq_excel_tools.py extract --input /path/to/input.xlsx --output /tmp/child_input.json
python3 scripts/faq_excel_tools.py build --input /tmp/child_output.json --output /path/to/output.xlsx
```

## 答案规范

每条答案都必须聚焦问题本身，并遵循 Atomic Facts 规范。优先保留以下 3 个核心事实：

1. 该商家是否有儿童优惠
2. 优惠力度是多少，如果有明确数值必须写出
3. 如何获取

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
- 直接省略金额信息，只保留已经确认的儿童优惠事实和获取方式
- 不要为了凑满 3 个事实而加入模糊描述

不得添加：

- 替代省钱方案
- 品牌背景
- 额外追问引导
- 没有依据的猜测

如果这 3 个核心事实不完整，只能补充与 child discount 强相关、且源文本中明确出现的信息，尤其要优先从后文补足会影响用户判断或领取的限制条件、有效期和适用范围。

## 实体识别规则

在判断前，先确认参考信息说的是当前 merchant 本体。

以下情况优先视为实体混淆风险：

- 商家名过于通用
- 搜索结果混入同名景点、酒店、学校、服务或 app
- 结果中的品牌域名、业务类型、国家或地区与目标 merchant 不一致
- 结果在讲另一个 legal entity、另一个 franchise、另一个子品牌

一旦有明显实体混淆：

- 若无法确认结果就是当前 merchant：输出完整 `No` 句
- 不要把错误实体的 child offer 写进答案
- 不要为了尽量给 `Yes` 而硬接错误结果

## Yes / appears / No 使用规则

### 1. 用 `Yes` 的条件

只有当参考信息能明确证明以下 3 点同时成立时，才使用肯定句：

- 说的是当前 merchant 本体
- 说的是 child-specific pricing、child offer、free child policy、merchant 自己 kids items 的明确折扣
- 证据足够明确，不需要靠推断补全

### 2. 用 `appears to` 的条件

只有在以下情况下才可以用 `appears to`：

- 信息方向基本正确
- 证据主要来自 merchant 自己的 sale section、listing pattern 或商品展示
- 能看出 merchant 确实有 kids item discount，但强度、范围、稳定性不够明确
- 需要避免夸大成明确稳定项目

允许的典型句式：

- `appears to offer discounted kids' items through its sale section`
- `appears to offer discounted kids' eyewear through select promotions`

### 3. 不允许滥用 `appears`

如果其实没有明确 child discount 证据，只是模糊猜测，不能靠 `appears` 偷渡成 `Yes`。证据不够时，应直接输出完整 `No` 句。

## Child Discount 专属判定优先级

逐行判断时，按以下顺序执行：

1. 先确认实体是否正确
2. 判断是否为 child-specific，而不是 student、teacher、family、education、insurance、license
3. 判断是否为 merchant 自身优惠，而非第三方或泛建议
4. 判断是否足够明确可以使用 `Yes`
5. 若证据偏弱但方向正确，可用 `appears`
6. 若不满足以上条件，输出完整英文 `No` 句

压缩事实时，优先抽取：

1. 是否存在明确儿童优惠机制
2. 优惠对象是谁
   - `infant`
   - `child`
   - `kids`
   - `toddler`
   - `youth`
   - `junior`
   - `ages X–Y`
3. 优惠形式是什么
   - `free`
   - `reduced fare / reduced rate`
   - `percentage off`
   - `fixed-price child ticket / child pass`
   - `sale / clearance on kids items`
4. 如何获取
   - `booking as child ticket`
   - `selecting child fare`
   - `through kids sale section`
   - `with adult purchase`
   - `during class / camp participation`
5. 限制条件
   - 年龄范围
   - 是否需与成人同行
   - participating locations only
   - 某城市 / 某路线 / 某酒店 / 某 lounge 才适用
   - 仅适用于 kids section / junior gear / classes / camps
   - seasonal / limited-time / specific promotion，仅当原文明确

如果答案空间有限，优先保留：

- age range
- `under-X free`
- `child / youth / junior category`
- 是否需成人购买、成人同行
- participating locations only
- route / city / hotel / lounge / class restrictions
- 儿童价是否低于成人价
- 适用于 tickets、stays、meals、classes、gear 还是 kids items
- 是否仅限 kids sale / clearance section

这些信息优先级高于：

- 泛泛品牌背景
- 次要通用优惠
- 低价值形容词
- 推荐性语句

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
- 例如 `Kfzparts2` 与 `kfzteile24`，若结合上下文可判断是在指同一汽车配件品牌，不要仅因英文/德文写法不同直接输出完整英文 `No` 句
- 对于 `Neckermann`、`Filmpalast`、`Tivoli` 这类核心商家名本身一致的情况，应优先视为主体一致；除非文本明确指向另一个商家、另一个品牌，或明确是无关平台/项目

以下情况答案直接输出完整英文 `No` 句：

- 优惠主体是另一个商家
- 内容讲的是平台、第三方项目或无关会员体系，而不是目标商家本身
- 文本在核心品牌名上无法与目标商家建立合理对应，且没有任何上下文可支持同一主体判断

如果去掉上述常见后缀后，主体名称能清晰对应同一品牌，则视为同一主体，不要仅因法人后缀差异、语言差异或轻微变体输出完整英文 `No` 句。

当核心商家名一致，或虽有跨语言/变体写法但仍可合理判断为同一品牌时，应放宽处理，不要因为证据门槛过高直接判为 `No`。只有在主体明确不匹配，或确实无法合理对应时，才输出完整英文 `No` 句。

## Child 专属 Merchant Locking

child discount 的主体必须是目标 merchant 自己，或目标 merchant 自己的以下官方范围：

- kids / child category
- 官方 ticketing
- 官方 pricing
- 官方 classes / camps
- 官方 stays / meals / passes / junior gear

不得把以下内容直接写成目标 merchant 的 child discount：

- 第三方 retailer 的儿童商品折扣
- 第三方 pass 或聚合型通票
- 第三方博客或总结页归纳出的儿童优惠
- 其他景点、酒店、球队、品牌、会员计划或合作方的儿童优惠

额外要求：

- 不能因为 `term_name` 中带有通用词，如 `kids`、`family`、`baseball`、`dental`、`paris`、`london`、`reef`，就自动放宽主体判断
- 如果 source 只是 broader category summary，而不是目标 merchant 的单一事实，应优先输出完整英文 `No` 句，或只在证据足够时使用极稳健句式
- 如果 source 明显在说另一主体，即使内容本身与儿童有关，也必须输出完整英文 `No` 句

## Yes / No 决策规则

### 输出 `Yes` 的条件

满足以下任一即可：

- 商家有明确 `children / kids / youth / junior` 定价或减免
- 商家有 `children free`、`child fare`、`child pass`、`kids pricing` 之类的直接证据
- 商家存在由儿童年龄、儿童身份、儿童生日触发的专属优惠
- 商家为儿童课程、夏令营、儿童活动参与者提供折扣
- 商家仅有 kids category 的明确折扣、sale、clearance、markdown，且主体清晰、证据直接，此时只可作为弱 `Yes` 保留

### 输出 `No` 的条件

出现以下情况应直接输出完整英文 `No` 句：

- source 讲的是其他商家、平台、合作方、第三方项目，而不是目标 merchant 本身
- 只出现 `student`、`newsletter`、`app`、`loyalty`、`military` 等非 child 折扣
- 只是泛泛提到“适合孩子”“有儿童产品”“孩子能用”，但没有折扣事实
- 只是家庭或家长优惠，没有明确 child 本人、child fare、kids product discount 受益
- 内容无法与目标 merchant 建立合理主体对应

### 边界情况处理

对于边界模糊但仍可保留的情况，使用更稳健表达：

- `appears to offer discounted kids' items through its sale section`
- `offers child pricing on select tickets`
- `children under X may receive free admission`
- `child rates are available on eligible bookings`

只有在原文本身明确时，才可以用非常肯定的句式。

child subclass 中还要额外遵守：

- A 类 child pricing / free / child-triggered benefit 是强 `Yes`
- B 类 kids sale / clearance / discounted kids merchandise 只是弱 `Yes`
- 当 source 只有 B 类证据时，不要把它写成优先级很高、很稳定、很官方的 child discount

## Child 专属排除规则

输出 child discount FAQ 时，不得混入：

- 学生优惠
- 家长 / 军属 / 会员 / 信用卡 / 订阅 / 推荐返利
- 其他 merchant 的儿童优惠
- 替代省钱建议
- “也可以去某某平台买更便宜”
- 其他 unrelated savings path

如果 source 同时包含 child 折扣和别的优惠，只保留 child 相关信息。

如果 child 事实不够强，而其他优惠很强，也不能拿其他优惠来补全答案。

## 写作要求

- 不改变原意
- 保留所有重要核心事实
- 删除重复和前后矛盾表述
- 同一优惠、门槛、限制或条件不要换句重复说两遍
- 优先使用直接、事实型表达
- 禁止使用“but no fixed discount amount is stated”及同类不确定兜底句式
- 不同行答案的表达方式尽量自然变化，避免批量模板感
- 避免连续使用 `about`、`usually`、`around` 等模糊词；如原文确实只有近似表达，最多保留一个必要的模糊提示
- 要保留 `seasonal`、`limited-time`、`variable`、`partner-only`、`no dedicated` 这类限定语的原意，但要改写成自然句型，不要机械硬插原词
- 没有原文证据时，不要自行补写 `seasonal`、`limited-time`、`variable`、`partner-only`、`no dedicated` 等限定词
- 优先写清楚品牌、机制、门槛、限制，再写补充信息
- 不要把 URL、网页标题、来源站名、来源括号注释直接写进 FAQ 正文
- 不要用 `品牌名 (domain.com)` 这种方式补充说明域名；正文里只保留自然品牌名
- 实体锁定要更严格；允许 `Anthony Robbins` / `Tony Robbins`、`Dental Plans` / `DentalPlans.com`、`Sam's Club` / `Sam’s Club`、`Kiehls` / `Kiehl's` 这类等价写法，但不要把两个名字机械并列到同一句里
- 语气友好、紧凑
- 严格控制在 50 个单词以内

child subclass 句式还必须符合以下原则：

- `Yes` 类答案必须统一以 `Yes.` 开头
- `No` 类答案必须统一以 `No.` 开头
- 最终答案必须是 1 到 2 句，适合前台 FAQ 直接展示
- 不要写检索摘要、来源解释、免责声明、建议查看官网
- 对 A 类 child-specific pricing，可写成 `Yes. {Merchant} offers child fares...`、`Yes. Children under X get free entry...`、`Yes. {Merchant} has child rates...`
- 对 B 类 kids section / category sale，只能写成 `Yes. {Merchant} has discounted kids' items...`、`Yes. {Merchant} has kids' items in sale or clearance sections...`、`Yes. {Merchant} offers discounted kids' items through its sale section.`
- 不能把 B 类写成固定官方儿童政策
- 不能把 `children's products on sale` 误写成 `children receive a discount`
- 当证据仅表明 merchant 有 kids / baby / junior category 的 sale、clearance、markdown 时，禁止写 `child discount` 或 `discount for children`
- `No` 必须写成完整英文句子，不能只写 `no`
- 推荐 `No` 句式：
  - `No. {Merchant} does not offer a standard child discount.`
  - `No. {Merchant} does not offer a standard child discount. The source refers to a different entity.`
  - `No. {Merchant} does not offer a standard child discount. The source refers to student or educator pricing instead.`
  - `No. {Merchant} does not offer a standard child discount. The source describes broader family or pediatric savings, not a child-specific merchant offer.`
- 不要写 `No, the available information does not clearly show...`
- 不要写 `Based on available information...`
- 不要写 `There is no evidence that...`
- 不要写 `It does not appear to...`
- 没有原文证据时，不要自行补写 `seasonal`、`limited-time`、`official`、`standard`、`dedicated`

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

`Titile1` 需要生成一个清晰、自然、与 `term_name` 对齐的 child discount FAQ 问题。

优先句式：

- `Does {Merchant} offer a child discount?`

如果目标国家不是英语环境，应翻译成对应语言。

## 执行流程

逐行处理时，按以下步骤：

1. 从 `term_name` 识别目标商家
2. 先做实体校验；如果存在明显实体混淆且无法确认是当前 merchant，本行直接输出完整英文 `No` 句
3. 阅读 `discount_details`，先判断它属于 A 类 child-specific pricing、B 类 kids category sale、D 类 child-specific benefit，还是非 child 折扣
4. 只提取 child discount 相关事实、获取方式和限制条件
   - 不要停在第一句话；继续检查后文是否还有年龄范围、有效期、适用范围、地区限制、使用门槛等高价值信息
5. 判断源内容中的商家主体是否与目标商家一致，并执行 child 专属 merchant locking
6. 做出结论：
   - 若确认有儿童优惠：输出以 `Yes.` 开头的最终答案
   - 若只是 kids section / category sale：保留为 `Yes`，但必须使用克制句式
   - 若证据方向正确但力度不足：仅在必要时使用一次 `appears to`
   - 若确认没有，或主体明确不一致，或确实无法合理对应，或仅有非 child 折扣：输出以 `No.` 开头的完整英文 `No` 句
7. 用目标国家语言改写成简洁 FAQ 答案，并确保答案里至少出现一次品牌主体；若输出 `Yes`，句式必须与 A / B 类型匹配
8. 检查答案是否只保留当前 `Subclass` 内容、没有编造信息、没有堆叠模糊词
9. 使用 `scripts/faq_excel_tools.py` 生成最终 Excel

## Final Sanitation

输出前必须再次检查：

- 有没有把 broader offer 写成 exact match
- 有没有把 partner offer 写成官方政策
- 有没有把 `no clear` / `no dedicated` 改成肯定 `Yes`
- 有没有漏掉 `seasonal`、`limited-time`、`variable`、`partner-only`、`no dedicated` 这类限定语的原意，或把它们生硬硬插进句子
- 有没有在没有原文证据时自行补写限定词
- 有没有残留 `Apple`、`Google Play`、`How to Apply`、`How to Get`、`Source` 等标题或来源残片
- 有没有出现 `Zarda Barbecue (zarda.com)` 这类品牌名后跟括号域名的写法
- 有没有拼接坏句子、重复句子、错别字
- 有没有出现 `Anthony Robbins Tony Robbins`、`Dental Plans DentalPlans.com`、`Sam's Club Sam’s Club`、`Kiehls Kiehl's` 这种实体双写
- 有没有把 `kids sale` 写成 `official child discount`
- 有没有把 `student discount for high school students` 写成 `child discount`
- 有没有把 `family offer`、`parent offer`、`dependent offer` 写成 child offer
- 有没有把 broader travel / attraction / dental / school summary 写成某个 merchant 的官方 child discount
- 有没有把第三方 pass、第三方零售商、其他酒店 / 景点 / 品牌的 kids offer 混进正文
- 有没有残留网页广告语、栏目标题、SEO 标题、source 断句
- 有没有保留 `How to get`、`Key details`、`Why spend more`、`where to find`、`shop now` 等网页残片
- 有没有把 `children's products on sale` 误写成 `children receive a discount`
- 有没有在 B 类弱 `Yes` 中写出 `child discount` 或 `discount for children`
- 有没有在无证据时自行补写 `seasonal`、`limited-time`、`official`、`standard`、`dedicated`
- 有没有把 `student discount`、`education pricing`、`teacher offer`、`school license`、`classroom license`、`family plan`、`insurance plan` 写成 child discount
- 有没有把实体混淆结果、同名品牌、异地区版本、第三方平台内容写给当前 merchant
- `Yes` 是否以 `Yes.` 开头，`No` 是否以 `No.` 开头
- `No` 是否避免了 `available information does not clearly show`、`there is no evidence that`、`it does not appear to`
- 是否仍然保留了搜索腔、免责声明、建议查看官网、来源解释

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
- 只有主体明确不匹配或确实无法合理对应时才输出完整英文 `No` 句
- 最终交付为与模板字段完全一致的 Excel 文件
