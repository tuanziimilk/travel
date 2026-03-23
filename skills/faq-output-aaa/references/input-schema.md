# 表格输入输出契约

本 skill 默认处理 Excel 或 CSV 表格行数据，而不是旧版 JSON 学生折扣输入。

## 输入字段

输入表格字段固定为：

```text
ID
term_id
country
domain
term_name
fact_type
supported
status
discount_type
discount_value
currency
discount_details
url
last_verified_at
updated_at
updated_by
```

其中用于改写的核心字段是：

- `country`
- `term_id`
- `domain`
- `term_name`
- `fact_type`
- `discount_details`

说明：

| 字段 | 是否核心 | 说明 |
|------|------|------|
| `country` | 是 | 唯一决定 FAQ 问题与答案语种的字段，不再跟随原文语言 |
| `term_id` | 是 | 直接映射到输出 `TermID` |
| `domain` | 是 | 直接映射到输出 `Domain` |
| `term_name` | 是 | 直接映射到输出 `TermName`，但 FAQ 文案中优先替换为 `{Mer.}` |
| `fact_type` | 是 | 直接映射到输出 `Subclass`，并决定问题类型 |
| `discount_details` | 是 | 原始事实文本，所有改写内容从这里提取 |
| 其他字段 | 否 | 默认不参与改写，除非用户另有要求 |

## 输出字段

输出表格字段固定为：

```text
ContentType
Country
TermID
TermName
Domain
Source
Subclass
板块名称
Titile1
Brief Introduction
Href Kw
Href Url
```

映射规则：

| 输出字段 | 取值规则 |
|------|------|
| `ContentType` | 固定 `faq` |
| `Country` | 输入 `country` |
| `TermID` | 输入 `term_id` |
| `TermName` | 输入 `term_name` |
| `Domain` | 输入 `domain` |
| `Source` | 留空 |
| `Subclass` | 输入 `fact_type` |
| `板块名称` | 留空 |
| `Titile1` | 按语种输出 FAQ 问题，品牌名用 `{Mer.}` |
| `Brief Introduction` | 基于 `discount_details` 改写出的 FAQ 答案 |
| `Href Kw` | 留空 |
| `Href Url` | 留空 |

## 语言映射

FAQ 问题和答案必须严格跟随 `country` 输出，不以 `discount_details` 原文语言为准。

| `country` | 语言缩写 | 输出语言 |
|------|------|------|
| `UK` | `en` | 英语 |
| `AU` | `en` | 英语 |
| `CA` | `en` | 英语 |
| `DE` | `de` | 德语 |
| `FR` | `fr` | 法语 |
| `NL` | `nl` | 荷兰语 |
| `IT` | `it` | 意大利语 |
| `AT` | `de` | 德语 |
| `BE` | `nl` | 荷兰语 |
| `CH` | `de` | 德语 |
| `PT` | `pt` | 葡萄牙语 |
| `GR` | `el` | 希腊语 |
| `BR` | `pt` | 葡萄牙语 |
| `PL` | `pl` | 波兰语 |
| `ES` | `es` | 西班牙语 |
| `SE` | `sv` | 瑞典语 |
| `KR` | `ko` | 韩语 |
| `CZ` | `cs` | 捷克语 |
| `DK` | `da` | 丹麦语 |
| `SK` | `sk` | 斯洛伐克语 |
| `JP` | `ja` | 日语 |
| `HK` | `zh-Hant` | 繁体中文 |

未命中的 `country` 默认输出英语。

## 标准问题模板

针对 `fact_type = aaa discount`，默认使用以下问题模板：

| 语种 | 模板 |
|------|------|
| 英语 | `Does {Mer.} offer an AAA discount?` |
| 德语 | `Bietet {Mer.} einen AAA-Rabatt an?` |
| 法语 | `{Mer.} propose-t-il une réduction AAA ?` |
| 荷兰语 | `Biedt {Mer.} een AAA-korting aan?` |
| 意大利语 | `{Mer.} offre uno sconto AAA?` |
| 葡萄牙语 | `A {Mer.} oferece desconto AAA?` |
| 希腊语 | `Η {Mer.} προσφέρει έκπτωση AAA;` |
| 波兰语 | `Czy {Mer.} oferuje zniżkę AAA?` |
| 西班牙语 | `¿{Mer.} ofrece descuento AAA?` |
| 瑞典语 | `Erbjuder {Mer.} AAA-rabatt?` |
| 韩语 | `{Mer.}는 AAA 할인을 제공하나요?` |
| 捷克语 | `Nabízí {Mer.} slevu AAA?` |
| 丹麦语 | `Tilbyder {Mer.} AAA-rabat?` |
| 斯洛伐克语 | `Ponúka {Mer.} zľavu AAA?` |
| 日语 | `{Mer.}ではAAA割引がありますか。` |
| 繁体中文 | `{Mer.} 有提供 AAA 折扣嗎？` |

其他 `fact_type` 由实际任务决定，但仍需满足：

- 与 `country` 对应语言一致
- 使用 `{Mer.}` 代替品牌名
- 问题表达与事实类型匹配

## `Brief Introduction` 改写要求

先判断来源属于以下哪类：

1. `direct AAA discount`
2. `AAA portal cashback`
3. `AAA travel/member booking benefit`
4. `non-AAA general offer`

再从 `discount_details` 中按以下顺序提取：

1. 优惠
2. 核心福利
3. 关键条件

推荐长度：

- 优先 `1-2` 句
- 尽量控制在 `50` 词左右
- 允许超过短字符限制，只要核心事实完整

表达要求：

- direct discount 要明确是否存在直接 AAA 折扣
- portal cashback 要明确是返现或 AAA Dollars，不是结账立减
- travel/member booking benefit 要明确是 AAA rate、member booking benefit 或参与式旅行权益
- non-AAA general offer 先明确无 AAA 优惠，再只补真正有区分度的替代权益
- 避免重复使用单一模板句式
- 不要把证据充分的内容弱化成泛泛而谈的 “may offer” 或 “other savings may be available”

禁止项：

- 编造折扣或条件
- 搬运整段原文
- 保留平台噪音文本
- 使用真实品牌名替代 `{Mer.}`
