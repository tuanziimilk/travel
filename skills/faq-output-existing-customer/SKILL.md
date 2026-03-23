---
name: existing-customer-discount-faq-answer
description: >
  为 HotDeals.com 的优惠类 FAQ 改写任务生成多语种问题与答案，并按表格字段输出。适用于处理 Excel 或结构化数据中的老客优惠、现有客户专属优惠、续订优惠等事实型文案改写任务；严格根据 country 输出对应国家语言，不受原文语言影响，从 discount_details 提取 dedicated existing-customer discount 判断、核心优惠机制、核心福利与关键条件，并使用 {Mer.} 变量替换商家名。
---

# 多语种优惠 FAQ 改写技能

## 执行目标

将输入表格中的 `discount_details` 改写为可发布的 FAQ 文案，并输出到指定表格字段。

优先级固定为：

`优惠 > 核心福利 > 关键条件 > 字数`

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

### 1. 问题与答案严格按 `country` 输出目标语言

不再参考 `discount_details` 的原文语言。即使原文是英语，只要 `country = DE`，问题和答案都必须输出德语。

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

若 `country` 不在表中，默认输出英语。

### 2. 问题使用 `{Mer.}` 变量

问题中的商家名统一写作 `{Mer.}`，不要直接写真实品牌名。

示例：

- 西语：`¿{Mer.} ofrece descuentos para clientes existentes?`
- 韩语：`{Mer.}는 기존 고객 할인을 제공하나요?`
- 波兰语：`Czy {Mer.} oferuje zniżki dla obecnych klientów?`
- 英语：`Does {Mer.} offer an existing customer discount?`

### 3. 答案中的品牌名也替换为 `{Mer.}`

如果 `discount_details` 原文中出现品牌名，改写时替换为 `{Mer.}`。

## 改写规则

### 先做 dedicated discount 判断

答案第一步必须先判断：品牌是否提供专门面向 existing customers 的 dedicated discount。

- 如果有 dedicated existing-customer discount：开头先明确肯定，再补核心机制
- 如果没有 dedicated existing-customer discount：开头先明确否定，语义上等同于 `No dedicated existing-customer discount`
- 如果只有定向保留优惠、会员价、积分、续费价、app/member pricing、subscriber rate 等，不可误写成“有通用老客折扣”；应写清这是替代性机制或限定性福利

### 核心信息提取顺序

从 `discount_details` 提取并重组成一句或两句短答案，信息顺序必须尽量保持：

1. 是否有 dedicated existing-customer discount
2. 核心机制是什么
3. 老客可获得的核心福利
4. 最关键的限制条件或领取路径

### 必须优先保留的信息

- 是否为 dedicated existing-customer discount
- 折扣力度或优惠形式
- 老客/现有客户/会员/续订用户身份
- 最有价值的机制信息：`points`、`member tiers`、`birthday coupon`、`subscriber rate`、`account-only offers`、`app/member pricing`
- 关键福利：续费优惠、忠诚度奖励、专属价格、返现、积分、优惠券、附加服务
- 关键条件：仅限现有账号、续订周期、会员等级、自动续费、金额门槛、适用计划、领取路径

### 长度规则

- 默认尽量短
- 优先控制在 `1-2` 句
- 不再强制 `60` 字符
- 可参考 `<=50` 词，但不能因压缩而丢失核心信息

### 文风要求

- 直接回答问题，不写背景铺垫
- 保留事实，不补充未给出的数字、渠道或限制
- 去掉噪音信息，如“显示更多”“AI 可能出错”“正负反馈”“分享”
- 去掉重复步骤，只保留最关键的领取方式
- 不写 CTA，不引导用户“去查看官网”
- 不使用第一人称
- 减少模板化表达，避免连续复用同一英文骨架句
- 问题和答案可以在同一语种下做自然改写，但结构仍需稳定、清晰、可发布
- 当判断为“无 dedicated 优惠”时，不要机械重复 `does not offer... / returning customers can still save with... / may still benefit from...` 这一组固定句型

## 场景规则

### 老客优惠

当 `fact_type = existing customer` 时：

- `Titile1` 应改写为“是否提供老客优惠/现有客户优惠”的对应语种问题
- `Brief Introduction` 先判断是否存在 dedicated existing-customer discount
- 若无 dedicated 优惠，优先保留最有价值的替代机制，如积分、会员层级、生日券、订阅价、账户专属优惠、app/member pricing
- 若有 dedicated 优惠，重点提取续费优惠、忠诚会员折扣、老客专属优惠码、积分返利、会员保留福利等

### 续订或会员续费场景

若 `discount_details` 明显是续订、renewal、retention、loyalty、member-only offer：

- 问题仍围绕 existing customer 优惠表达
- 答案优先写清它是否构成 dedicated existing-customer discount
- 再写清是否仅限现有客户、会员或续订用户
- 如果不是站内通用折扣，而是定向保留优惠，要明确写出限制

### 其他事实类型

若 `fact_type` 不是 `existing customer`，仍沿用同一原则：

- 问题按事实类型改写
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
| 语言一致 | 问题和答案只与 `country` 映射语言一致 |
| 变量替换 | 使用 `{Mer.}`，不直接暴露品牌名 |
| dedicated 判断 | 开头先判断是否有 dedicated existing-customer discount |
| 信息优先级 | 先判断，再机制，再福利，再条件/路径 |
| 不编造 | 未在原文出现的信息不补写 |
| 去噪完成 | 无平台噪音、无无关提示 |
| 表达自然 | 无明显固定模板连用，语句自然但结构统一 |
| 输出字段正确 | 表头与映射完全一致 |
| `Source`/`板块名称` | 必须留空 |

## 参考文件

- `references/input-schema.md` — 表格输入输出字段说明
- `templates/answer-template.txt` — FAQ 起草模板
