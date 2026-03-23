---
name: teacher-discount-faq-skill
description: 当用户提供表格，并希望基于 Google AI Overview 的结果摘要生成 HotDeals 教师优惠 FAQ 时使用此 skill。读取输入表中的 country、term_name、discount_details，判断内容主体与商家是否一致，再按指定 FAQ 模板输出 Excel 文件，答案需使用对应国家语言、简洁且符合 SEO。
---

# Teacher Discount FAQ Skill

你是 HD 的 SEO 专家，正在为 HotDeals 的 teacher discount 页面做 FAQ 内容优化。

当用户提供一个表格，并要求根据 Google AI Overview 收集到的 `discount_details` 内容，抽象生成 teacher discount FAQ，并严格按指定 Excel 模板输出时，使用此 skill。

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
- `Subclass`：固定填 `teacher discount`
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

## Teacher Discount 定义边界

在 teacher discount 场景里，只有当优惠、免费资格、专属价格或专属权益是面向教师或教育工作者本人获取并使用时，才可视为当前 `Subclass` 的有效事实。

以下情况可判定为 `Yes`：

- merchant 明确提供 `teacher`、`educator`、`educator discount`、`teacher offer`、`educator pricing`
- merchant 为教师提供可验证领取的专属折扣、专属价格、专属码、专属优惠页或专属权益
- merchant 为教师提供免费教育访问或免费教师资格，且该权益是教师本人可直接申请和使用的产品或服务权益
- 教师优惠通过官方合作验证平台领取，例如 `ID.me`、`SheerID`、`Gocertify`、`BeansID`、`Student Beans`、`Blue Light Card`、`Discounts for Teachers`，且文本能清晰表明这是目标 merchant 的教师优惠，而不是平台自己的 cashback、积分或泛优惠聚合

以下情况默认不算当前 `Subclass`，优先输出 `no`：

- 只有学生优惠、军人优惠、医护优惠、`first responder` 优惠，没有教师优惠
- 只有 newsletter、welcome code、sitewide sale、clearance、cashback、coupon aggregation、积分返利
- 只有学校、教室、教育机构、district、bulk order、campus、institution、classroom license、school procurement 的教育采购价
- 只有 grants、classroom support、school donation、teacher rewards for students、classroom incentive program，而不是教师本人购物、订阅或使用时获得的折扣
- 只有 `local store`、`some locations`、`participating franchises`、`regional association`、`union benefit`，而看不出这是 merchant 官方稳定提供的教师优惠
- 只有第三方平台提到“教师可能有优惠”或“教师可在某平台找到优惠”，但没有清晰证据表明该优惠是目标 merchant 的教师优惠机制
- 文本只说明教师可购买某类受限商品、可参加某项目、可申请教育资源，但没有教师个人折扣或教师个人专属价格、权益

补充说明：

- “免费教育访问”可视为 teacher discount 的一种特殊形式，但仅限教师本人可直接验证并使用
- “学校/教室授权价”不等于“教师个人优惠”
- “教师可帮学生领取奖励”不等于“教师本人有 teacher discount”
- “部分门店有活动”不等于“品牌有标准 teacher discount”

模板参考：

- `/Users/mac/Downloads/non_coupon_all_demo 11/faq.xlsx`

需要处理 Excel 时，使用：

```bash
python3 scripts/faq_excel_tools.py extract --input /path/to/input.xlsx --output /tmp/teacher_input.json
python3 scripts/faq_excel_tools.py build --input /tmp/teacher_output.json --output /path/to/output.xlsx
```

## 答案规范

每条答案都必须聚焦问题本身，并遵循 Atomic Facts 规范。优先保留以下 3 个核心事实：

1. 该商家是否有教师优惠
2. 优惠力度是多少，如果有明确数值必须写出
3. 如何获取

对于 teacher discount，若信息充足，4 个事实的优先级顺序应为：

1. 有没有教师优惠
2. 折扣值或免费资格
3. 如何验证或获取
4. 是否仅限特定平台、特定时间、特定地区、特定身份或特定商品

如果 50 词不足，优先保留 1-3；第 4 项只保留最影响用户判断的限制。

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
- 直接省略金额信息，只保留已经确认的教师优惠事实和获取方式
- 不要为了凑满 3 个事实而加入模糊描述

不得添加：

- 替代省钱方案
- 品牌背景
- 额外追问引导
- 没有依据的猜测

如果这 3 个核心事实不完整，只能补充与 teacher discount 强相关、且源文本中明确出现的信息，尤其要优先从后文补足会影响用户判断或领取的限制条件、有效期和验证要求。

## Teacher Discount 证据强弱分级

A 级证据（强）：

- merchant 官网
- merchant 官方 FAQ、help、promo page、teacher page
- merchant 官方合作验证页
- 官方明确说明的 educator verification flow

B 级证据（中）：

- `ID.me`、`SheerID`、`Gocertify`、`BeansID`、`Student Beans`、`Blue Light Card`、`Discounts for Teachers` 上，明确指向目标 merchant 的教师优惠页，且可看出是 merchant 官方参与的验证优惠

C 级证据（弱）：

- coupon aggregation sites
- Facebook、Instagram 本地门店帖文
- Reddit、forum、blog 二手总结
- “teachers may save through platform X” 这类模糊转述
- 只提 cashback、points、affiliate benefits 的平台页

判定规则：

- A 级可直接支持 `Yes`
- B 级只有在优惠对象、merchant 主体、领取方式都清楚时，才支持 `Yes`
- C 级不能单独支撑稳定 `Yes`；若无更强证据，优先写 `no`
- `ID.me Shop` cashback、partner cashback、reward points 不算 teacher discount
- 不能因为某平台支持教师身份验证，就自动推断 merchant 一定有教师优惠

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

以下情况答案直接输出 `no`：

- 优惠主体是另一个商家
- 内容讲的是平台、第三方项目或无关会员体系，而不是目标商家本身
- 文本在核心品牌名上无法与目标商家建立合理对应，且没有任何上下文可支持同一主体判断

如果去掉上述常见后缀后，主体名称能清晰对应同一品牌，则视为同一主体，不要仅因法人后缀差异、语言差异或轻微变体输出 `no`。

当核心商家名一致，或虽有跨语言/变体写法但仍可合理判断为同一品牌时，应放宽处理，不要因为证据门槛过高直接判为 `no`。只有在主体明确不匹配，或确实无法合理对应时，才输出 `no`。

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

`Titile1` 需要生成一个清晰、自然、与 `term_name` 对齐的 teacher discount FAQ 问题。

优先句式：

- `Does {Merchant} offer a teacher discount?`

如果目标国家不是英语环境，应翻译成对应语言。

## Teacher Discount 专属示例口径

- 若 merchant 明确提供教师验证折扣，例如 `15% off via ID.me` 或 `SheerID`，可判定 `Yes`
- 若 merchant 只在 back-to-school 或 `Teacher Appreciation Week` 做官方教师活动，可判定 `Yes`，但答案必须保留 `seasonal`、`annual` 或 `limited-time` 的原意
- 若只是一些本地门店或加盟店给老师打折，优先判定 `No`
- 若只是学校采购价、课堂 license、教育机构授权，优先判定 `No`
- 若教师只是能使用某项目奖励学生，而不是自己享受优惠，优先判定 `No`
- 若只有 cashback、聚合站、论坛猜测，没有清晰 merchant 对应，优先判定 `No`
- 若是 verified teachers 可免费使用产品或服务，且教师本人可直接申请和使用，可判定 `Yes`

禁止泛化写法：

- 不要把 `partner-only` 写成 merchant 官方全年政策
- 不要把 `some locations` 写成品牌通用政策
- 不要把 `teacher support program` 写成教师折扣
- 不要把 `cashback` 写成 teacher discount
- 不要把 `education access` 与 `teacher discount code` 混写成同一种东西
- 不要把整个 skill 放宽成更宽泛的 educator benefits skill
- 不要放宽到“任何教育相关优惠都算 teacher discount”
- 不要因为 source 中出现 `teacher` 这个词就默认判定为 `Yes`

## 执行流程

逐行处理时，按以下步骤：

1. 从 `term_name` 识别目标商家
2. 阅读 `discount_details`，只提取 teacher discount 相关事实、获取方式和限制条件
   - 不要停在第一句话；继续检查后文是否还有验证、有效期、适用范围、地区限制、使用门槛等高价值信息
3. 判断源内容中的商家主体是否与目标商家一致
4. 做出结论：
   - 若确认有教师优惠：写明有、折扣值（若有明确数值）、获取方式，以及与教师优惠直接相关的限制或要求
   - 若确认没有，或主体明确不一致，或确实无法合理对应：输出 `no`
5. 用目标国家语言改写成简洁 FAQ 答案，并确保答案里至少出现一次品牌主体
6. 检查答案是否只保留当前 `Subclass` 内容、没有编造信息、没有堆叠模糊词
7. 使用 `scripts/faq_excel_tools.py` 生成最终 Excel

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
- 有没有把 cashback、rewards、general promo 写成 teacher discount
- 有没有把 school、classroom、institutional pricing 写成 teacher personal discount
- 有没有把 teacher support project、classroom reward project 写成 teacher discount
- 有没有把 local franchise、some locations、regional benefit 写成 brand-wide offer
- 有没有把 aggregator mention 写成 merchant official policy
- 有没有把 annual、seasonal、limited-time 教师活动写成长期稳定折扣
- 有没有把 newsletter、welcome offer、student discount、military discount 当成 teacher discount 附加写进答案
- 有没有把验证平台本身当成商家主体来写
- 有没有出现 `teachers can also save with...` 这种替代省钱方案补充
- 有没有把 school-staff、pastor、missionary、educator-adjacent 群体错误泛化成教师优惠

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
