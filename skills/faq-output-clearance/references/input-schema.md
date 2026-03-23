# 表格输入输出契约

本 skill 默认处理 Excel 或 CSV 表格行数据。

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
| `country` | 是 | 决定 FAQ 问题与答案的语种 |
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
| `Titile1` | 严格按 `country` 对应语言输出 FAQ 问题，品牌名用 `{Mer.}` |
| `Brief Introduction` | 基于 `discount_details` 改写出的 FAQ 答案 |
| `Href Kw` | 留空 |
| `Href Url` | 留空 |

## 标准问题模板

针对 `fact_type = clearance`，默认使用以下问题模板：

| 语种 | 模板 |
|------|------|
| 西语 | `¿{Mer.} tiene sección de liquidación o outlet?` |
| 韩语 | `{Mer.}에는 클리어런스나 아울렛 상품이 있나요?` |
| 波兰语 | `Czy {Mer.} ma sekcję clearance lub outlet?` |
| 英语 | `Does {Mer.} have a clearance or outlet section?` |

其他 closeout / final sale 场景仍需满足：

- 与 `country` 对应语言一致
- 使用 `{Mer.}` 代替品牌名
- 问题表达与清仓事实匹配

## `Brief Introduction` 改写要求

从 `discount_details` 中按以下顺序提取：

1. 是否存在真实 `clearance` / `outlet` / `final sale` / `closeout` / 专门 `sale section`
2. 若存在，提取清仓优惠或价格信息
3. 涉及品类或商品范围
4. 关键限制
5. 若不存在，单独说明最常见的替代优惠形式

推荐长度：

- 优先 `2` 句内
- 尽量控制在 `55` 词左右
- 允许超过短字符限制，只要核心事实完整

禁止项：

- 把 holiday sale、promo codes、bundle offers、app deals、membership pricing、limited-time discounts 直接写成 clearance
- 编造折扣或限制
- 搬运整段原文
- 保留平台噪音文本
- 使用真实品牌名替代 `{Mer.}`
