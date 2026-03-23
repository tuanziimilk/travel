# 表格输入输出契约

本 skill 默认处理 Excel 或 CSV 表格行数据，用于价格保障类 FAQ 改写。

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
| `country` | 是 | 决定 FAQ 问题与答案的输出语言；必须严格按国家映射，不跟随原文语言 |
| `term_id` | 是 | 直接映射到输出 `TermID` |
| `domain` | 是 | 直接映射到输出 `Domain` |
| `term_name` | 是 | 直接映射到输出 `TermName`，但 FAQ 文案中优先替换为 `{Mer.}` |
| `fact_type` | 是 | 直接映射到输出 `Subclass`，并辅助判断政策类型 |
| `discount_details` | 是 | 原始事实文本，所有改写内容从这里提取 |
| 其他字段 | 否 | 默认不参与改写，除非用户另有要求 |

## 语言映射

FAQ 输出语言固定按 `country` 决定：

| `country` | 语言缩写 | 语言 |
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

未列出的国家默认输出英语。

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
| `Titile1` | 按 `country` 语种输出 FAQ 问题，品牌名用 `{Mer.}` |
| `Brief Introduction` | 基于 `discount_details` 改写出的 FAQ 答案 |
| `Href Kw` | 留空 |
| `Href Url` | 留空 |

## 问题生成规则

问题需要匹配实际政策类型，不能把所有情况都写成笼统的 “price guarantee”。

推荐方向：

- `price match`：问“是否提供价格匹配”
- `price protection` / `post-purchase adjustment`：问“是否提供购买后价格保护/差价调整”
- `low-price guarantee` / `best rate guarantee`：问“是否提供最低价保证/最低房价保证”
- 政策混合时：优先问官方是否有价格保障政策

问题必须：

- 严格按 `country` 输出目标语言
- 使用 `{Mer.}` 代替品牌名
- 与答案中的政策类型一致

## `Brief Introduction` 改写要求

答案优先写成 `2-3` 句，顺序固定为：

1. 直接说明是否提供 `official price guarantee / official price match`
2. 说明适用国家、站点、门店、渠道或产品线范围
3. 补充关键限制条件

必须优先保留：

- 官方商城与门店差异
- 国家/站点差异
- 时间窗口
- `required proof`
- `current price`
- `identical item`
- `third-party sellers`
- `excluded categories`
- 退款形式或补偿形式

禁止项：

- 只因原文是英语就输出英语
- 混用 `price match` 和 `price protection`
- 在官方证据明确时滥用 `may offer`
- 搬运整段原文
- 保留平台噪音文本
- 使用真实品牌名替代 `{Mer.}`
