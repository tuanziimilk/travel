---
name: return-policy-faq-answer
description: >
  为 HotDeals.com 的退货政策类 FAQ 改写任务生成多语种问题与答案，并按表格字段输出。适用于处理 Excel 或结构化数据中的 return policy、returns、refund、exchange 等事实型文案改写任务；严格根据 country 输出对应国家语言，不跟随原文语言；区分 free returns、free mail returns、free in-store returns、free exchanges、cancellation policy、money-back guarantee 等不同概念，并使用 {Mer.} 变量替换商家名。
---

# 多语种退货政策 FAQ 改写技能

## 执行目标

将输入表格中的 `discount_details` 改写为可发布的 FAQ 文案，并输出到指定表格字段。

优先级固定为：

`先给结论 > 明确哪一种免费或不免费 > 再补最关键限制条件 > 最后控制字数`

不要为了压缩长度删除关键信息，也不要把所有限制条件堆进同一句。

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

### 1. 问题与答案严格跟随 `country` 输出，不跟随原文语言

即使 `discount_details` 是英语、德语或多语混杂，只要 `country` 已给出，就必须按该国家对应语言输出。

固定映射如下：

| 国家缩写 | 国家中文名 | 语言缩写 | 输出语言 |
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

如果 `country` 不在表中：

- 默认用英语输出
- 不再因为原文语言不同而切换语种

### 2. 问题使用 `{Mer.}` 变量

问题中的商家名统一写作 `{Mer.}`，不要直接写真实品牌名。

问题不要高频重复同一句式，可以在同一语种内做轻微变化，但语义必须稳定、自然、可发布。

示例：

- 英语：`Does {Mer.} offer free returns?`
- 英语：`Can items be returned to {Mer.} for free?`
- 西语：`¿{Mer.} ofrece devoluciones gratuitas?`
- 韩语：`{Mer.}는 무료 반품을 지원하나요?`
- 波兰语：`Czy w {Mer.} mozna skorzystac z darmowego zwrotu?`

### 3. 答案中的品牌名也替换为 `{Mer.}`

如果 `discount_details` 原文中出现品牌名，改写时替换为 `{Mer.}`。

## 改写规则

### 核心信息提取顺序

从 `discount_details` 提取并重组成 `1-2` 句短答案，顺序固定为：

1. 先给结论
2. 再说明免费适用于哪一种返回方式
3. 最后补最关键限制条件

其中：

- 结论必须先判断这是 `free returns`、`paid returns`、`free in-store returns only`、`free mail returns only`、`cancellation/refund policy`、`money-back guarantee`、`damaged-item resolution` 还是 `subscription cancellation`
- 第二段信息必须明确“哪种免费”，不要只写笼统的 `free returns`
- 第三段只保留最关键限制，优先保留一种，不要在主句里塞满窗口、卫生标签、缺件、original shipping、restocking fee、excluded items

### `free returns` 判定边界

必须严格区分下列概念，不能混写：

- `free returns`
- `free mail returns`
- `free in-store returns`
- `free exchanges`
- `cancellation policy`
- `money-back guarantee`
- `damaged-item replacement`
- `subscription cancellation`
- `refund for non-delivered service`

只有当来源明确支持以下之一时，才可直接写成免费退货：

- `return shipping waived`
- `prepaid return label`
- `no return fee`
- `free in-store return`

以下情况都不能直接写成 `free returns`：

- 只说 `money-back guarantee`
- 只说 `cancel anytime`
- 只说 `refund available`
- 只支持 `free exchange`
- 只对 damaged / defective items 免费补发或退款
- 只支持服务未交付时退款
- 酒店、机票、门票场景中的免费取消

### 必须优先保留的信息

- 结论是免费退、付费退、仅门店免费、仅邮寄免费、不可退，还是取消/退款政策
- 明确的返回方式：`mail`、`in-store`、`exchange`、`cancellation`、`refund guarantee`
- 一项最关键限制：如时间窗口、商品状态、适用品类、退款去向或主要例外

### 长度规则

- 默认尽量短
- 优先控制在 `1-2` 句
- 可参考 `<=50` 词，但不能因压缩而丢失核心信息

### 文风要求

- 直接回答问题，不写背景铺垫
- 保留事实，不补充未给出的期限、费用或例外条件
- 去掉噪音信息，如“显示更多”“AI 可能出错”“正负反馈”“分享”
- 去掉重复步骤，只保留最关键的退货条件
- 不写 CTA，不引导用户“去查看官网”
- 不使用第一人称
- 避免所有答案都以同一套高频句式开头，可替换表达，但逻辑顺序必须稳定

### 固定答案结构

每条 `Brief Introduction` 必须遵守这个结构：

1. 先给结论
2. 再说明免费或不免费适用于哪种方式
3. 最后补最关键限制条件

可接受示例：

- `Yes, {Mer.} offers free mail returns. The prepaid label usually applies to eligible items, while oversized products may still be excluded.`
- `No, {Mer.} does not provide free mail returns. In-store returns are free, but mailed returns are at the customer's expense.`
- `{Mer.} does not have free returns in the retail sense. It mainly offers a 30-day money-back guarantee for eligible subscriptions.`

不推荐写法：

- 把窗口、包装、卫生标签、original shipping、restocking fee、excluded items 全部堆进第一句
- 用 `free returns` 概括实际上只是 `free exchange` 或 `cancellation`
- 酒店、机票、门票场景仍写成 `returns`

## 场景规则

### 零售商品

当 `fact_type` 为 `return policy`、`returns`、`refund`、`exchange` 或明显属于零售商品退货时：

- `Titile1` 应优先围绕“是否免费退货”提问
- `Brief Introduction` 必须先区分 `mail` 和 `in-store`
- 如果只有门店免费，不能写成整体免费退货
- 如果只有邮寄免费，也要明确是 `mail returns`

### 酒店 / 机票 / 门票 / 预订服务

- 用 `cancellation policy` 或 `refund policy`
- 不要写成 `free returns`
- 核心信息是：是否可免费取消、何时可退、哪些票价或房价不可退

### 数字产品 / 软件 / 下载内容

- 用 `trial`、`refund guarantee`、`money-back guarantee`
- 不要写成 `free returns`
- 如果是下载后不退，也要明确是数字内容或订阅限制

### 生鲜食品 / 定制食品 / 易腐商品

- 用 `damaged-order resolution`
- 不要写成 `free returns`
- 优先说明：通常不接受常规退货，损坏/错单可补发或退款

### 订阅服务 / 会员 / 杂志 / SaaS

- 用 `cancel`、`prorated refund`、`no refund`、`money-back guarantee`
- 不要写成 `free returns`
- 优先说明取消后是否停止续费、是否按未使用部分退款、是否有试用期

### 无法退货或部分可退场景

若 `discount_details` 明显表示不支持退货、仅部分方式免费、仅部分品类可退、Final Sale 不可退：

- 答案开头先明确 `No` 或“不是所有方式都免费”
- 再补充最关键限制，如 Final Sale、定制商品、内衣/美妆等除外
- 如果仅支持换货、店铺积分退款、门店免费退或服务取消，要明确写出

### 其他事实类型

若 `fact_type` 不是退货政策，但用户仍要求按该 skill 改写：

- 问题按最贴近业务类型的免费退货 / 取消 / 退款语义改写
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
| 语言一致 | 问题和答案严格与 `country` 对应语言一致 |
| 变量替换 | 使用 `{Mer.}`，不直接暴露品牌名 |
| 概念准确 | `free returns` 与 `free exchange` / `cancellation` / `money-back guarantee` 等严格区分 |
| 结构稳定 | 先结论，再说明免费适用方式，最后补关键限制 |
| 句式自然 | 不机械重复同一句型，但逻辑顺序一致 |
| 不编造 | 未在原文出现的信息不补写 |
| 去噪完成 | 无平台噪音、无无关提示 |
| 输出字段正确 | 表头与映射完全一致 |
| `Source`/`板块名称` | 必须留空 |

## 参考文件

- `references/input-schema.md` — 表格输入输出字段说明
- `references/examples.md` — 退货政策 FAQ 示例
- `templates/answer-template.txt` — FAQ 起草模板
