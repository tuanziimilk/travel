---
name: referral-discount-faq-answer
description: >
  为 HotDeals.com 的优惠类 FAQ 改写任务生成多语种问题与答案，并按表格字段输出。适用于处理 Excel 或结构化数据中的 referral discount、refer-a-friend、invite rewards 等事实型文案改写任务；严格根据 country 输出对应国家语言，不跟随原文语言，从 discount_details 提取核心推荐优惠、双方奖励与关键条件，使用 {Mer.} 变量替换商家名，并先判断具体业务实体后再作答。
---

# 多语种 Referral Discount FAQ 改写技能

## 执行目标

将输入表格中的 `discount_details` 改写为可发布的 FAQ 文案，并输出到指定表格字段。

优先级固定为：

`推荐优惠 > 双方奖励/受益对象 > 关键条件 > 字数`

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

### 1. 问题与答案严格跟随 `country` 输出

问题和答案都必须根据输入表格的 `country` 字段决定语言，不以 `discount_details` 原文语言为准。

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

若 `country` 不在映射中，再退回英语；但只要命中映射，必须按映射语言输出。

### 2. 问题使用 `{Mer.}` 变量

问题中的商家名统一写作 `{Mer.}`，不要直接写真实品牌名。

常用示例：

- 西语：`¿{Mer.} ofrece un descuento por recomendación?`
- 韩语：`{Mer.}는 추천인 할인을 제공하나요?`
- 波兰语：`Czy {Mer.} oferuje zniżkę za polecenie?`
- 英语：`Does {Mer.} offer a referral discount?`

### 3. 答案中的品牌名也替换为 `{Mer.}`

如果 `discount_details` 原文中出现品牌名，改写时替换为 `{Mer.}`。

### 4. 先判断实体边界，再生成 FAQ

如果品牌存在多个实体、产品线、地区站点、母品牌与子品牌混用，必须先判断当前 `discount_details` 实际对应的是哪个具体实体，再生成答案。

处理原则：

- 如果证据只指向某一业务线、子服务或地区站点，FAQ 也只针对该实体作答
- 必要时可在答案中明确说明：当前信息仅对应某一具体服务、订阅、会员体系或地区版本
- 若 `term_name` / `domain` / `discount_details` 明显互相冲突，应优先按证据更强的具体实体表述，并标注限定范围

## 改写规则

### 核心信息提取顺序

从 `discount_details` 提取并重组成一句或两句短答案，信息顺序必须尽量保持：

1. 有没有 referral offer
2. 推荐人和被推荐人各自获得什么
3. 核心福利是什么
4. 最关键的限制条件

### 必须优先保留的信息

- 优惠力度或奖励形式
- 谁能获得奖励：referrer、friend、双方都可得
- 核心福利：现金奖励、积分、代金券、折扣、账户余额、免运福利
- 关键条件：通过专属链接注册、首次下单后生效、最低消费、地区或账户限制

### 长度规则

- 默认尽量短
- 优先控制在 `1-2` 句
- 不再强制 `60` 字符
- 可参考 `<=50` 词，但不能因压缩而丢失核心信息

### 文风要求

- 直接回答问题，不写背景铺垫
- 保留事实，不补充未给出的数字、渠道或限制
- 去掉噪音信息，如“显示更多”“AI 可能出错”“正负反馈”“分享”
- 去掉重复步骤，只保留最关键的参与方式
- 不写 CTA，不引导用户“去查看官网”
- 不使用第一人称
- 避免高频重复句式，不要机械反复使用 `may`、`often`、`does not currently offer`
- 证据强时直接写肯定或否定判断
- 证据弱、来源有限或只看到公开信息时，要明确写出 `based on currently available public info` 对应语义
- 不要把信息完整、限制明确的原始事实弱化成空泛模板句

## 场景规则

### Referral discount

当 `fact_type = referral discount` 时：

- `Titile1` 应改写为“是否提供 referral discount”的对应语种问题
- `Brief Introduction` 重点提取邀请奖励、双方奖励、好友首单奖励、账户抵扣、推荐成功条件

### 其他 referral 类事实类型

若 `fact_type` 不是精确的 `referral discount`，但语义属于 refer-a-friend、invite rewards、referral program，仍沿用同一原则：

- 问题按事实类型改写
- 答案只保留最关键事实
- 语言与品牌变量规则不变
- 若原文只覆盖特定业务线，问题和答案也必须保持该限定范围

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
| 语言一致 | 问题和答案与 `country` 映射语言一致 |
| 变量替换 | 使用 `{Mer.}`，不直接暴露品牌名 |
| 实体边界 | 已确认对应具体实体，未把子业务误写成品牌整体政策 |
| 信息优先级 | 先推荐优惠，再奖励对象，再条件 |
| 不编造 | 未在原文出现的信息不补写 |
| 语气准确 | 证据强弱表达匹配，不机械套模板 |
| 去噪完成 | 无平台噪音、无无关提示 |
| 输出字段正确 | 表头与映射完全一致 |
| `Source`/`板块名称` | 必须留空 |

## 参考文件

- `references/input-schema.md` — 表格输入输出字段说明
- `templates/answer-template.txt` — FAQ 起草模板
