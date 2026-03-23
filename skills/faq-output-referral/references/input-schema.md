# 表格输入输出契约

本 skill 默认处理 Excel 或 CSV 表格行数据，而不是旧版 JSON 推荐奖励输入。

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
| `country` | 是 | 唯一决定 FAQ 问题与答案输出语言；不跟随原文语言 |
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
| `Titile1` | 按 `country` 映射语言输出 FAQ 问题，品牌名用 `{Mer.}` |
| `Brief Introduction` | 基于 `discount_details` 改写出的 FAQ 答案，需先判断具体业务实体 |
| `Href Kw` | 留空 |
| `Href Url` | 留空 |

## 标准问题模板

针对 `fact_type = referral discount`，默认使用对应国家语言的问题模板。

语言必须按 `country` 映射，不受原文语言影响：

| `country` | 语种 | 模板示例 |
|------|------|------|
| `UK`/`AU`/`CA` | 英语 | `Does {Mer.} offer a referral discount?` |
| `DE`/`AT`/`CH` | 德语 | `Bietet {Mer.} einen Empfehlungsrabatt an?` |
| `FR` | 法语 | `{Mer.} propose-t-il une remise de parrainage ?` |
| `NL`/`BE` | 荷兰语 | `Biedt {Mer.} een referral-korting aan?` |
| `IT` | 意大利语 | `{Mer.} offre uno sconto per il referral?` |
| `PT`/`BR` | 葡萄牙语 | `{Mer.} oferece um desconto por indicação?` |
| `GR` | 希腊语 | `Η {Mer.} προσφέρει έκπτωση σύστασης;` |
| `PL` | 波兰语 | `Czy {Mer.} oferuje zniżkę za polecenie?` |
| `ES` | 西班牙语 | `¿{Mer.} ofrece un descuento por recomendación?` |
| `SE` | 瑞典语 | `Erbjuder {Mer.} en värvningsrabatt?` |
| `KR` | 韩语 | `{Mer.}는 추천인 할인을 제공하나요?` |
| `CZ` | 捷克语 | `Nabízí {Mer.} slevu za doporučení?` |
| `DK` | 丹麦语 | `Tilbyder {Mer.} en henvisningsrabat?` |
| `SK` | 斯洛伐克语 | `Ponúka {Mer.} zľavu za odporúčanie?` |
| `JP` | 日语 | `{Mer.}は紹介割引を提供していますか。` |
| `HK` | 繁体中文 | `{Mer.} 有提供推薦折扣嗎？` |

其他 referral 类 `fact_type` 由实际任务决定，但仍需满足：

- 与 `country` 映射语言一致
- 使用 `{Mer.}` 代替品牌名
- 问题表达与事实类型匹配

## `Brief Introduction` 改写要求

从 `discount_details` 中按以下顺序提取：

1. Referral offer
2. 奖励对象与奖励内容
3. 关键条件
4. 必要时补上实体限定范围

推荐长度：

- 优先 `1-2` 句
- 尽量控制在 `50` 词左右
- 允许超过短字符限制，只要核心事实完整

禁止项：

- 编造奖励或条件
- 搬运整段原文
- 保留平台噪音文本
- 使用真实品牌名替代 `{Mer.}`
- 在实体不清时用模糊品牌总称笼统作答
- 用空泛模板句削弱原文里已经明确的奖励和限制
