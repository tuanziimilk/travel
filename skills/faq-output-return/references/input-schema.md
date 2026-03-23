# 表格输入输出契约

本 skill 默认处理 Excel 或 CSV 表格行数据，用于退货政策类 FAQ 改写。

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
| `country` | 是 | 唯一决定 FAQ 问题与答案输出语种；不再跟随原文语言 |
| `term_id` | 是 | 直接映射到输出 `TermID` |
| `domain` | 是 | 直接映射到输出 `Domain` |
| `term_name` | 是 | 直接映射到输出 `TermName`，但 FAQ 文案中优先替换为 `{Mer.}` |
| `fact_type` | 是 | 直接映射到输出 `Subclass`，并帮助判断业务类型 |
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
| `Titile1` | 按 `country` 对应语种输出 FAQ 问题，品牌名用 `{Mer.}` |
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

若 `country` 不在映射表中，默认输出英语。

## 标准问题模板

针对退货政策类事实，优先围绕“是否免费退货 / 哪种方式免费”提问，且语义必须匹配业务类型：

| 语种 | 模板 |
|------|------|
| 英语 | `Does {Mer.} offer free returns?` |
| 德语 | `Bietet {Mer.} kostenlose Ruecksendungen an?` |
| 法语 | `{Mer.} propose-t-il des retours gratuits ?` |
| 荷兰语 | `Biedt {Mer.} gratis retourneren aan?` |
| 意大利语 | `{Mer.} offre resi gratuiti?` |
| 葡萄牙语 | `{Mer.} oferece devolucoes gratis?` |
| 希腊语 | `Η {Mer.} προσφερει δωρεαν επιστροφες;` |
| 波兰语 | `Czy w {Mer.} mozna skorzystac z darmowego zwrotu?` |
| 西班牙语 | `¿{Mer.} ofrece devoluciones gratuitas?` |
| 瑞典语 | `Erbjuder {Mer.} fria returer?` |
| 韩语 | `{Mer.}는 무료 반품을 지원하나요?` |
| 捷克语 | `Nabizi {Mer.} vraceni zbozi zdarma?` |
| 丹麦语 | `Tilbyder {Mer.} gratis returnering?` |
| 斯洛伐克语 | `Ponuka {Mer.} bezplatne vratenie tovaru?` |
| 日语 | `{Mer.}では送料無料で返品できますか？` |
| 繁体中文 | `{Mer.} 提供免費退貨嗎？` |

如果原文更明确是免费门店退货、取消政策、试用退款或订阅取消，也可改成对应问题，但仍需：

- 与 `country` 对应语言一致
- 使用 `{Mer.}` 代替品牌名
- 问题表达与业务类型匹配

## `Brief Introduction` 改写要求

从 `discount_details` 中按以下顺序提取：

1. 先给结论
2. 再说明免费或不免费适用于哪一种方式
3. 最后补一个最关键限制条件

推荐长度：

- 优先 `1-2` 句
- 尽量控制在 `50` 词左右
- 允许超过短字符限制，只要核心事实完整

禁止项：

- 编造退货时限或费用
- 搬运整段原文
- 保留平台噪音文本
- 使用真实品牌名替代 `{Mer.}`
- 把 `free exchange`、`money-back guarantee`、`cancellation policy` 直接写成 `free returns`
- 把所有限制条件堆进第一句
