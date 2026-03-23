---
name: aaa-discount-faq-answer
description: >
  为 HotDeals.com 的优惠类 FAQ 改写任务生成多语种问题与答案，并按表格字段输出。适用于处理 Excel 或结构化数据中的 AAA discount、AAA member discount、AAA 会员专属优惠等事实型文案改写任务；严格根据 country 输出对应国家语言，从 discount_details 提取 AAA 优惠类型、核心权益与关键条件，使用 {Mer.} 变量替换商家名，避免空泛模板化表达。
---

# 多语种优惠 FAQ 改写技能

## 执行目标

将输入表格中的 `discount_details` 改写为可发布的 FAQ 文案，并输出到指定表格字段。

优先级固定为：

`优惠 > 核心福利 > 关键条件 > 字数`

不要为了压缩长度删除关键信息。

## 输入来源

默认处理表格行数据。核心改写字段为：

- `country`
- `term_id`
- `domain`
- `term_name`
- `fact_type`
- `discount_details`

其中真正用于理解与改写的原文在 `discount_details`。

## 输出格式

输出表格字段固定为：

- `ContentType`
- `Country`
- `TermID`
- `TermName`
- `Domain`
- `Source`
- `Subclass`
- `板块名称`
- `Titile1`
- `Brief Introduction`
- `Href Kw`
- `Href Url`

字段映射规则：

| 输出字段 | 规则 |
|------|------|
| `ContentType` | 固定填 `faq` |
| `Country` | 取输入 `country` |
| `TermID` | 取输入 `term_id` |
| `TermName` | 取输入 `term_name` |
| `Domain` | 取输入 `domain` |
| `Source` | 留空 |
| `Subclass` | 取输入 `fact_type` |
| `板块名称` | 留空 |
| `Titile1` | FAQ 问题，按 `country` 对应语种输出，使用 `{Mer.}` 变量 |
| `Brief Introduction` | 改写后的 FAQ 答案 |
| `Href Kw` | 留空 |
| `Href Url` | 留空 |

## 语言规则

### 1. 问题与答案必须只跟随 `country` 输出

无论 `discount_details` 原文是什么语言，`Titile1` 和 `Brief Introduction` 都必须按 `country` 对应语言输出，不能再跟随原文语种。

固定映射如下：

| `country` | 国家 | 语言缩写 | 输出语言 |
|------|------|------|------|
| `UK` | 英国 | `en` | 英语 |
| `AU` | 澳大利亚 | `en` | 英语 |
| `CA` | 加拿大 | `en` | 英语 |
| `DE` | 德国 | `de` | 德语 |
| `FR` | 法国 | `fr` | 法语 |
| `NL` | 荷兰 | `nl` | 荷兰语 |
| `IT` | 意大利 | `it` | 意大利语 |
| `AT` | 奥地利 | `de` | 德语 |
| `BE` | 比利时 | `nl` | 荷兰语 |
| `CH` | 瑞士 | `de` | 德语 |
| `PT` | 葡萄牙 | `pt` | 葡萄牙语 |
| `GR` | 希腊 | `el` | 希腊语 |
| `BR` | 巴西 | `pt` | 葡萄牙语 |
| `PL` | 波兰 | `pl` | 波兰语 |
| `ES` | 西班牙 | `es` | 西班牙语 |
| `SE` | 瑞典 | `sv` | 瑞典语 |
| `KR` | 韩国 | `ko` | 韩语 |
| `CZ` | 捷克 | `cs` | 捷克语 |
| `DK` | 丹麦 | `da` | 丹麦语 |
| `SK` | 斯洛伐克 | `sk` | 斯洛伐克语 |
| `JP` | 日本 | `ja` | 日语 |
| `HK` | 中国香港 | `zh-Hant` | 繁体中文 |

若 `country` 不在映射表中，默认输出英语。

### 2. 问题使用 `{Mer.}` 变量

问题中的商家名统一写作 `{Mer.}`，不要直接写真实品牌名。

示例：

- 英语：`Does {Mer.} offer an AAA discount?`
- 德语：`Bietet {Mer.} einen AAA-Rabatt an?`
- 法语：`{Mer.} propose-t-il une réduction AAA ?`
- 荷兰语：`Biedt {Mer.} een AAA-korting aan?`
- 意大利语：`{Mer.} offre uno sconto AAA?`
- 葡萄牙语：`A {Mer.} oferece desconto AAA?`
- 希腊语：`Η {Mer.} προσφέρει έκπτωση AAA;`
- 波兰语：`Czy {Mer.} oferuje zniżkę AAA?`
- 西班牙语：`¿{Mer.} ofrece descuento AAA?`
- 瑞典语：`Erbjuder {Mer.} AAA-rabatt?`
- 韩语：`{Mer.}는 AAA 할인을 제공하나요?`
- 捷克语：`Nabízí {Mer.} slevu AAA?`
- 丹麦语：`Tilbyder {Mer.} AAA-rabat?`
- 斯洛伐克语：`Ponúka {Mer.} zľavu AAA?`
- 日语：`{Mer.}ではAAA割引がありますか。`
- 繁体中文：`{Mer.} 有提供 AAA 折扣嗎？`

### 3. 答案中的品牌名也替换为 `{Mer.}`

如果 `discount_details` 原文中出现品牌名，改写时替换为 `{Mer.}`。

## 改写规则

### 核心信息提取顺序

从 `discount_details` 提取并重组成一句或两句短答案，信息顺序必须尽量保持：

1. 有没有 AAA 优惠
2. 核心优惠是什么
3. AAA 会员可获得的核心福利
4. 最关键的限制条件

### 必须先判断 AAA 信息类型

在写答案前，先识别来源属于哪一类，再决定表达方式：

1. `direct AAA discount`
2. `AAA portal cashback`
3. `AAA travel/member booking benefit`
4. `non-AAA general offer`

#### 1. `direct AAA discount`

指 AAA 会员直接享有折扣、专属价格、AAA rate、member-only price、指定产品折扣。

写法要求：

- 明确写“有”或“没有” direct AAA discount
- 若有，优先保留折扣力度、适用对象、适用范围、验证要求
- 若仅限部分门店、日期、产品、地区或渠道，必须保留限制

#### 2. `AAA portal cashback`

指需通过 AAA 网站、AAA app、AAA Discounts portal、AAA Dollars mall、browser extension 跳转下单，获得现金返还、AAA Dollars、cash back。

写法要求：

- 不要误写成 direct discount
- 必须点明这是 cash back / rewards，不是结账立减
- 保留返现比例、触发方式、是否需从 AAA portal/app 进入、主要排除条件

#### 3. `AAA travel/member booking benefit`

指酒店、租车、度假、门票、会员预订价、AAA/CAA rate、特定旅行权益或预订福利。

写法要求：

- 明确这是 booking benefit、AAA rate、member rate 或 travel benefit
- 保留房价/车价折扣、参与酒店或地点、适用预订渠道、会员验证要求
- 若不是全站或全品牌适用，要明确写出范围

#### 4. `non-AAA general offer`

指来源明确说没有 AAA 优惠，只给出普通促销、学生优惠、军人优惠、会员计划、邮件订阅折扣等其他省钱方式。

写法要求：

- 先明确无 AAA 优惠
- 只有当来源确实给出有价值且可区分的信息时，才简要补一句替代权益
- 不要把完整强信息压缩成空泛的 “may offer” 或 “other savings may be available”

### 必须优先保留的信息

- 折扣力度或优惠形式
- AAA 会员身份要求
- 关键福利：会员专属价格、房价折扣、保险折扣、订阅优惠、附加服务、返现或赠品
- 关键条件：需验证 AAA membership、适用门店/地区/产品、预订渠道、使用优惠码、有效期、排除项
- 差异性事实：是直接折扣还是 portal cashback、是全站还是部分参与渠道、是会员价还是普通促销

### 长度规则

- 默认尽量短
- 优先控制在 `1-2` 句
- 不再强制 `60` 字符
- 可参考 `<=50` 词，但不能因压缩而丢失核心信息

### 文风要求

- 直接回答问题，不写背景铺垫
- 保留事实，不补充未给出的数字、渠道或限制
- 去掉噪音信息，如“显示更多”“AI 可能出错”“正负反馈”“分享”
- 去掉重复步骤，只保留最关键的领取方式
- 不写 CTA，不引导用户“去查看官网”
- 不使用第一人称
- 题和答案避免高频重复句式，改用更自然但结构一致的表达
- 不要把信息完整的来源弱化成普通模板句
- 若来源证据明确，优先写明确判断，不用 `may offer`、`might`、`other savings may be available` 这类空泛表达

## 场景规则

### AAA 优惠

当 `fact_type = aaa discount` 时：

- `Titile1` 应改写为“是否提供 AAA 优惠”的对应语种问题
- `Brief Introduction` 必须先判断是 direct AAA discount、AAA portal cashback、AAA travel/member booking benefit，还是仅有非 AAA 普通优惠
- 优先保留折扣/返现数值、适用场景、验证方式和限制条件

### AAA 会员验证场景

若 `discount_details` 明显包含 AAA member verification、membership required、AAA rates、AAA exclusive：

- 问题仍围绕 AAA discount 表达
- 答案优先写清是否仅限 AAA 会员
- 若优惠仅在特定商品、地区、酒店、租车、保险或合作渠道有效，要明确写出限制
- 若是 AAA rate 或 member booking benefit，不要误写成普通 retail 折扣

### 其他事实类型

若 `fact_type` 不是 `aaa discount`，仍沿用同一原则：

- 问题按事实类型改写
- 答案只保留最关键事实
- 语言与品牌变量规则不变

## 清洗 `discount_details`

改写前先清洗原文中的低价值噪音：

- 平台 UI 文案：`Mostrar todo`、`AI 模式`、`查看全部`、`공유`
- 无关来源标记：`Instagram`、`Bankier.pl +5`
- 重复步骤与重复句
- 泛化提醒：`AI answers may contain errors`

只保留能回答 FAQ 的有效事实。

## 质检清单

每条输出完成后检查：

| 检查项 | 标准 |
|------|------|
| 语言一致 | 问题和答案与 `country` 对应语言一致 |
| 变量替换 | 使用 `{Mer.}`，不直接暴露品牌名 |
| 信息优先级 | 先优惠类型，再福利，再条件 |
| 类型判断 | 已区分 direct discount / portal cashback / travel benefit / non-AAA offer |
| 不编造 | 未在原文出现的信息不补写 |
| 不空泛 | 不使用弱化强证据的模板句 |
| 去噪完成 | 无平台噪音、无无关提示 |
| 输出字段正确 | 表头与映射完全一致 |
| `Source`/`板块名称` | 必须留空 |

## 参考文件

- `references/input-schema.md` — 表格输入输出字段说明
- `references/examples.md` — AAA discount 改写示例
- `templates/answer-template.txt` — FAQ 起草模板
