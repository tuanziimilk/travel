# 表格输入输出契约

本 skill 默认处理 Excel 或 CSV 表格行数据。

## 输入字段

输入表格字段通常为：

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

核心字段：

- `country`
- `term_id`
- `domain`
- `term_name`
- `fact_type`
- `discount_details`

字段说明：

| 字段 | 是否核心 | 说明 |
|------|------|------|
| `country` | 是 | 严格决定 FAQ 问题与答案的输出语言 |
| `term_id` | 是 | 直接映射到输出 `TermID` |
| `domain` | 是 | 直接映射到输出 `Domain` |
| `term_name` | 是 | 直接映射到输出 `TermName`，FAQ 中优先替换为 `{Mer.}` |
| `fact_type` | 是 | 直接映射到输出 `Subclass` |
| `discount_details` | 是 | 原始事实文本，用于判断是否真的是新客优惠并生成答案 |
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
| `Titile1` | 按 `country` 对应语言输出的自然问句，品牌名用 `{Mer.}` |
| `Brief Introduction` | 以 `Yes / No / Not exactly` 开头的结构化答案 |
| `Href Kw` | 留空 |
| `Href Url` | 留空 |

## `Titile1` 写法要求

针对 `fact_type = new customer`：

- 先按商家类型决定是 `first order`、`first booking`、`first app order`、`free trial` 还是 `welcome offer`
- 再按 `country` 输出对应语言
- 保持自然，不机械复用单一模板

## `Brief Introduction` 写法要求

固定顺序：

1. `Yes,` / `No,` / `Not exactly,`
2. 一句话解释优惠机制或判断原因
3. 再一句写限制条件、领取方式或替代省钱动作

必须优先提取：

1. 折扣力度或优惠形式
2. 首次条件
3. 入口或触发方式
4. code
5. 适用品类 / 最低消费
6. exclusions / 地区限制

## 严格排除项

以下情况默认不能直接写成新客优惠：

- 普通促销
- 季节活动
- 清仓价
- 会员价
- 自动续购折扣
- 身份类折扣
- 批发价
- 免费内容或赠品但未明确面向首次用户

## 语言映射

默认映射：

| `country` | 输出语言 |
|------|------|
| `UK` | 英语 |
| `AU` | 英语 |
| `CA` | 英语 |
| `DE` | 德语 |
| `FR` | 法语 |
| `NL` | 荷兰语 |
| `IT` | 意大利语 |
| `AT` | 德语 |
| `BE` | 荷兰语 |
| `CH` | 德语 |
| `PT` | 葡萄牙语 |
| `GR` | 希腊语 |
| `BR` | 葡萄牙语 |
| `PL` | 波兰语 |
| `ES` | 西语 |
| `SE` | 瑞典语 |
| `KR` | 韩语 |
| `CZ` | 捷克语 |
| `DK` | 丹麦语 |
| `SK` | 斯洛伐克语 |
| `JP` | 日语 |
| `HK` | 繁体中文 |
| 其他 | 英语 |
