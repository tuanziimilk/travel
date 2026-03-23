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
| `country` | 是 | 唯一决定 FAQ 问题与答案输出语言；不再参考原文语言 |
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

## `country` 与输出语言映射

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

未命中映射时默认英语。

## 标准问题模板

针对 `fact_type = existing customer`，默认使用以下问题模板：

| 语种 | 模板 |
|------|------|
| 西语 | `¿{Mer.} ofrece descuentos para clientes existentes?` |
| 韩语 | `{Mer.}는 기존 고객 할인을 제공하나요?` |
| 波兰语 | `Czy {Mer.} oferuje zniżki dla obecnych klientów?` |
| 英语 | `Does {Mer.} offer an existing customer discount?` |

其他 `fact_type` 由实际任务决定，但仍需满足：

- 与 `country` 映射语言一致
- 使用 `{Mer.}` 代替品牌名
- 问题表达与事实类型匹配

## `Brief Introduction` 改写要求

从 `discount_details` 中按以下顺序提取：

1. 是否有 dedicated existing-customer discount
2. 最有价值的优惠机制
3. 核心福利
4. 关键条件或领取路径

如果没有 dedicated existing-customer discount：

- 开头必须明确表达“没有 dedicated 老客优惠”这一判断
- 不要把积分、会员价、生日券、app/member pricing、subscriber rate、账户专属优惠误写成通用老客折扣
- 优先保留最有价值的替代机制信息

推荐长度：

- 优先 `1-2` 句
- 尽量控制在 `50` 词左右
- 允许超过短字符限制，只要核心事实完整

禁止项：

- 编造折扣或条件
- 搬运整段原文
- 保留平台噪音文本
- 使用真实品牌名替代 `{Mer.}`
- 连续复用同一固定句型导致答案模板化
