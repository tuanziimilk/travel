---
name: clearance-faq-answer
description: >
为 HotDeals.com 的 clearance 类 FAQ 改写任务生成多语种问题与答案，并按表格字段输出。适用于处理 Excel 或结构化数据中的清仓、尾货、最终甩卖、季末促销等事实型文案改写任务；严格根据 country 输出目标国家语言，从 discount_details 提取真实 clearance 机制、适用品类与关键限制，使用 {Mer.} 变量替换商家名。
---

# 多语种 Clearance FAQ 改写技能

## 执行目标

将输入表格中的 `discount_details` 改写为可发布的 clearance FAQ 文案，并输出到指定表格字段。

优先级固定为：

`清仓优惠 > 适用品类/范围 > 关键限制 > 字数`

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

### 1. 问题与答案严格按 `country` 输出对应国家语言

不要再根据 `discount_details` 原文语种切换语言。即使原文是英语，只要 `country` 指向其他国家，也必须输出该国家对应语言。

固定映射如下：

| `country` | 国家中文名 | 语言缩写 | 输出语言 |
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

若 `country` 不在映射表内，默认输出英语，并在交付前提示该映射缺失。

### 2. 问题使用 `{Mer.}` 变量

问题中的商家名统一写作 `{Mer.}`，不要直接写真实品牌名。

示例：

- 西语：`¿{Mer.} tiene sección de liquidación o outlet?`
- 韩语：`{Mer.}에는 클리어런스나 아울렛 상품이 있나요?`
- 波兰语：`Czy {Mer.} ma sekcję clearance lub outlet?`
- 英语：`Does {Mer.} have a clearance or outlet section?`

### 3. 答案中的品牌名也替换为 `{Mer.}`

如果 `discount_details` 原文中出现品牌名，改写时替换为 `{Mer.}`。

## 改写规则

### 核心判定顺序

先判断品牌是否存在真实清仓机制，再组织答案。判定优先级固定为：

1. 是否存在真实 `clearance` / `outlet` / `final sale` / `closeout` / 专门 `sale section`
2. 若存在，提取最强的清仓证据、折扣、适用品类、限制条件
3. 若不存在，再提取最常见的替代优惠形式

注意：

- `holiday sale`
- `promo codes`
- `bundle offers`
- `app deals`
- `membership pricing`
- `limited-time discounts`

这些都不能直接判定为 clearance 机制。

### 必须优先保留的信息

- 折扣力度或价格描述，如 up to、from、as low as
- 清仓范围：指定品类、末码、季末、停产款、选定商品
- 关键限制：仅限 selected items、售完即止、不退不换、不可叠加、时间限制
- 领取或适用方式：是否自动生效、是否需要 code、是否仅在线上或门店
- 最强证据：是否有 dedicated clearance / outlet / final sale / closeout / sale section

### 答案结构规则

答案必须固定为两步，允许写成两句：

1. 先明确回答有没有真实 clearance / outlet / final sale / closeout / sale section
2. 如果没有，再单独说明最常见的替代优惠形式

要求：

- 不要把“没有清仓”与“有普通优惠”揉成一个模糊结论
- 用户读完第一句就必须知道该品牌到底有没有清仓机制
- 如果有真实清仓机制，第二句优先补充折扣范围、类目和关键限制
- 如果没有真实清仓机制，第二句只写替代优惠形式，不要硬写成 clearance

### 长度规则

- 默认尽量短
- 优先控制在 `2` 句内
- 不再强制 `60` 字符
- 可参考 `<=55` 词，但不能因压缩而丢失核心信息

### 文风要求

- 直接回答问题，不写背景铺垫
- 保留事实，不补充未给出的数字、渠道或限制
- 去掉噪音信息，如“显示更多”“AI 可能出错”“正负反馈”“分享”
- 去掉重复步骤，只保留最关键的购买或使用条件
- 不写 CTA，不引导用户“去查看官网”
- 不使用第一人称
- 避免高频重复句式，改用更自然但结构一致的表达
- 不要批量重复 `does not currently offer a permanent/dedicated/formal clearance section` 这类句式
- 可以替换为更自然的同义表达，但逻辑顺序必须稳定

## 场景规则

### Clearance / 清仓优惠

当 `fact_type = clearance` 时：

- `Titile1` 应改写为“是否有 clearance / outlet / final sale”的对应语种问题
- `Brief Introduction` 先判断是否有真实清仓机制，再提取清仓折扣、涉及品类、是否限选定商品，以及最关键限制

### 其他 closeout / final sale / sale facts

若 `fact_type` 不是严格的 `clearance`，但原文事实明显属于清仓、尾货、final sale、end-of-season sale：

- 问题仍可按 clearance 语义改写
- 答案仍必须先判断是否有真实清仓机制，再补充最关键事实
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
| 机制判断 | 已先判断是否存在真实 clearance / outlet / final sale / closeout / sale section |
| 信息优先级 | 先回答是否有真实清仓机制，再写范围、折扣和限制；若没有，再单独写替代优惠 |
| 不编造 | 未在原文出现的信息不补写 |
| 去噪完成 | 无平台噪音、无无关提示 |
| 句式控制 | 避免批量重复僵硬否定句 |
| 输出字段正确 | 表头与映射完全一致 |
| `Source`/`板块名称` | 必须留空 |

## 参考文件

- `references/input-schema.md` — 表格输入输出字段说明
- `references/examples.md` — clearance 场景示例
- `templates/answer-template.txt` — FAQ 起草模板
