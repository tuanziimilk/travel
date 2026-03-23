---
name: new-customer-discount-faq-answer
description: >
  为 HotDeals.com 的优惠类 FAQ 改写任务生成多语种问题与答案，并按表格字段输出。适用于处理 Excel 或结构化数据中的 new customer / first order / first signup / first app order / free trial 等事实型优惠；严格依据 country 字段决定输出语言，先判断是否真实只面向首次用户，再输出 Yes / No / Not exactly 结构化答案，使用 {Mer.} 替换商家名。
---

# 多语种新客优惠 FAQ 改写技能

## 执行目标

将输入表格中的 `discount_details` 改写为可发布的 FAQ 问题与答案，并输出到指定字段。

优先级固定为：

`是否真的是新客优惠 > 语言匹配 > 强证据保留 > 自然表达 > 压缩长度`

不要把普通促销、季节活动、会员价、内容赠送、批发价、自动续购优惠或身份类优惠误写成 `new customer discount`。

## 输入来源

默认处理表格行数据。核心字段为：

- `country`
- `term_id`
- `domain`
- `term_name`
- `fact_type`
- `discount_details`

其中真正用于判断与改写的原文在 `discount_details`。

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
| `Titile1` | FAQ 问题，严格按 `country` 对应语言输出，使用 `{Mer.}` |
| `Brief Introduction` | 按本 skill 规则改写后的 FAQ 答案 |
| `Href Kw` | 留空 |
| `Href Url` | 留空 |

## 语言规则

### 1. 问题与答案都严格跟随 `country`

不要再根据原文语言切换输出语种。即使 `discount_details` 是英文，只要 `country = ES`，问题和答案也必须输出西语。

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

### 2. 问题与答案中的品牌名都替换为 `{Mer.}`

不要直接写真实品牌名。

## 先判断是否真的是新客优惠

只有在来源明确指向以下任一条件时，才可判定为 `Yes`：

- first order / first purchase
- first signup / first registration / new account
- first subscription / welcome offer
- first app order / first delivery
- first booking
- first verification / first verified use
- free trial 或 first plan savings，且明确面向新用户

以下情况默认不能直接判 `Yes`：

- 普通站内促销、节日活动、清仓
- 会员价、忠诚度积分、订阅续费折扣
- 学生、军人、教师、AARP、企业采购等身份类优惠
- 批发价、团购价、套餐价
- 内容赠送、免费资源、赠品，但未明确只面向首次用户
- “sign up for emails” 但未明确给首单折扣或欢迎优惠

判定口径：

- `Yes`：明确是首次用户专享优惠，且机制清楚
- `No`：明确没有新客优惠，或只有普通促销
- `Not exactly`：存在欢迎机制、地区限定、渠道限定、注册奖励或替代省钱方式，但不能算标准、普适的新客优惠

## 答案结构

`Brief Introduction` 必须按 2-3 句写：

1. 先直接给出 `Yes,` / `No,` / `Not exactly,`
2. 第二部分说明优惠机制或判断原因
3. 最后补一句限制条件、领取方式或替代省钱方式

细则：

- 若为 `Yes`，第二句优先写折扣力度、首单条件、领取入口、code、品类、exclusions
- 若为 `No`，最后一句补最常见替代省钱方式，并给出下一步动作，如 `sign up for emails`, `use the app`, `verify status`, `check the deals page`
- 若为 `Not exactly`，第二句解释为什么不是标准新客优惠，最后一句写地区/渠道/领取动作

## 信息提取优先级

优先保留强证据：

1. 折扣力度或优惠形式
2. 首次条件
3. 领取入口或触发方式
4. code
5. 最低消费 / 适用品类
6. exclusions / 地区限制 / 时间限制

不要把有明确数字和条件的来源压缩成笼统句。

## 商家类型适配

根据商家类型调整措辞：

- 零售：`first order` / `first purchase`
- 订阅或 SaaS：`free trial` / `first plan savings`
- 餐饮或外送：`first app order` / `first delivery`
- 服务类：`first booking` / `new account offer`

## 问题写法

问题要自然，但结构稳定；不要在每条里机械重复完全相同的英文句型。

允许的方向：

- 英语：`Does {Mer.} have a first-order discount?` / `Can new customers get a welcome offer at {Mer.}?`
- 德语：`Gibt es bei {Mer.} einen Rabatt für die erste Bestellung?`
- 法语：`{Mer.} propose-t-il une réduction sur la première commande ?`
- 荷兰语：`Biedt {Mer.} korting op de eerste bestelling?`
- 意大利语：`{Mer.} offre uno sconto sul primo ordine?`
- 葡萄牙语：`A {Mer.} oferece desconto na primeira compra?`
- 希腊语：`Η {Mer.} προσφέρει έκπτωση για την πρώτη παραγγελία;`
- 西语：`¿{Mer.} tiene descuento en la primera compra?` / `¿Hay una oferta de bienvenida para nuevos clientes en {Mer.}?`
- 瑞典语：`Har {Mer.} rabatt på första beställningen?`
- 韩语：`{Mer.} 첫 주문 할인은 있나요?` / `{Mer.} 신규 고객 웰컴 혜택이 있나요?`
- 捷克语：`Nabízí {Mer.} slevu na první objednávku?`
- 丹麦语：`Har {Mer.} rabat på den første bestilling?`
- 斯洛伐克语：`Ponúka {Mer.} zľavu na prvú objednávku?`
- 日语：`{Mer.} では初回注文の割引がありますか？`
- 繁体中文：`{Mer.} 有首單優惠嗎？`
- 波兰语：`Czy {Mer.} ma zniżkę na pierwsze zamówienie?` / `Czy nowi klienci mogą dostać ofertę powitalną w {Mer.}?`

选择最贴近事实类型的一种，不必每行都相同。

## 清洗 `discount_details`

改写前先删除低价值噪音：

- 平台 UI 文案
- 来源站点名拼接如 `+3`
- `Negative feedback`、`Share`
- 重复步骤、重复句、无关推荐

只保留可用于回答 FAQ 的事实。

## 质检清单

每条输出后检查：

| 检查项 | 标准 |
|------|------|
| 语言 | 严格跟随 `country`，不跟随原文 |
| 判定 | 已先判断是否真的是首次用户优惠 |
| 开头 | 明确以 `Yes` / `No` / `Not exactly` 起句 |
| 强证据 | 关键折扣、门槛、code、入口、限制未丢失 |
| 替代方案 | 无明确新客优惠时，补替代省钱方式与下一步动作 |
| 变量替换 | 使用 `{Mer.}`，不直接暴露品牌名 |
| 去噪 | 无平台噪音、无来源污染 |
| 输出字段 | 表头与映射完全一致 |

## 参考文件

- `references/input-schema.md` — 表格输入输出字段说明
- `templates/answer-template.txt` — FAQ 起草模板
- `references/examples.md` — Yes / No / Not exactly 示例
