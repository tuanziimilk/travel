---
name: price-guarantee-faq-answer
description: >
  为 HotDeals.com 的价格保障类 FAQ 改写任务生成多语种问题与答案，并按表格字段输出。适用于处理 Excel 或结构化数据中的 price match、price protection、low-price guarantee、post-purchase adjustment、store-level discretionary matching 等事实型文案改写任务；严格根据 country 输出目标国家语言，不跟随原文语言，并使用 {Mer.} 变量替换商家名。
---

# 多语种价格保障 FAQ 改写技能

## 执行目标

将输入表格中的 `discount_details` 改写为可发布的 FAQ 文案，并输出到指定表格字段。

优先级固定为：

`是否提供官方价格保障/价格匹配 > 政策类型 > 适用国家/站点/门店范围 > 时间窗口 > required proof > identical item/current price/third-party sellers/excluded categories > 字数`

不要为了压缩长度删除最实用的限制细节。

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
| `Titile1` | FAQ 问题，严格按 `country` 对应语种输出，使用 `{Mer.}` 变量 |
| `Brief Introduction` | 改写后的 FAQ 答案 |
| `Href Kw` | 留空 |
| `Href Url` | 留空 |

## 语言规则

### 1. FAQ 语言只看 `country`

问题与答案必须严格根据 `country` 输出对应国家语言，不以原文语言为准。

若原文是英文、但 `country=DE`，最终 FAQ 必须输出德语；若 `country=HK`，最终 FAQ 必须输出繁体中文。

固定映射如下：

| 国家缩写 | 国家中文名 | 语言缩写 | 语言 |
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

若遇到未列出的 `country`，默认输出英语，并在内部判定为兜底规则。

### 2. 问题使用 `{Mer.}` 变量

问题中的商家名统一写作 `{Mer.}`，不要直接写真实品牌名。

### 3. 答案中的品牌名也替换为 `{Mer.}`

如果 `discount_details` 原文中出现品牌名，改写时替换为 `{Mer.}`。

## 政策类型判定

改写前必须先区分政策类型，不要把不同政策混写成笼统的 `price guarantee`：

1. `price match`
   对比当前外部竞品价格并匹配当前价格，通常要求 `identical item`、`current price`、`proof`。
2. `price protection`
   购买后若官方价格下调，退还差额或发放 credit。
3. `low-price guarantee` / `best rate guarantee`
   官方宣称最低价，若发现更低公开价格则 match 或额外补偿。
4. `post-purchase adjustment`
   不做竞品匹配，但允许购买后因本站/本店降价申请差额退还。
5. `store-level discretionary matching`
   不是统一官方政策，只在部分门店、客服或地区站点根据店内裁量处理。

判定原则：

- 若来源明确写明官方政策，直接按对应类型表述，不要再写 `may offer` 这类过度保守说法。
- 若只在部分国家、站点、门店、产品线或活动页支持，必须明确写出适用范围。
- 若只有论坛、门店经验、客服回复或零散报告支撑，必须明确写 `based on current public policy or store-level reports` 的对应表达。
- 若实际是不支持 `price match`、但支持 `post-purchase adjustment`，必须明确写“不提供官方 price match，但支持购买后本站降价调整”。

## 改写规则

### 标准答案结构

答案必须优先写成 `2-3` 句，结构固定为：

1. 先直接说明品牌是否提供 `official price guarantee / official price match`
2. 再补一句渠道、地区、站点、门店或产品线范围
3. 最后补一句关键限制条件

不要把“是否支持”拖到句子后半段。

### 句式要求

- 避免高频重复句式
- 改用更自然但结构一致的表达
- 可以在肯定句中交替使用 “Yes”, “{Mer.} does offer”, “{Mer.} has an official...” 等自然表达
- 在否定句中交替使用 “No”, “{Mer.} does not have an official...”, “There is no official...” 等自然表达
- 句式变化不能影响信息顺序和可读性

### 必须优先保留的信息

- 适用国家差异、区域差异、站点差异
- 官方商城与门店差异
- `price match` / `price protection` / `low-price guarantee` / `post-purchase adjustment` / `store-level discretionary matching` 的准确类型
- 时间窗口
- `required proof`
- 是否只限 `current price`
- 是否只限 `identical item`
- 是否排除 `third-party sellers`
- `excluded categories`，如 clearance、refurbished、open-box、holiday deals、final sale、marketplace items
- 差价返还方式，如 refund、store credit、gift card、account credit

### 用词强弱规则

- 证据强：直接写 `offers`、`has`、`provides`
- 证据弱：明确写 `based on current public policy` 或 `based on store-level reports`
- 不要在官方证据明确时写 `may offer`
- 不要为了保守把确定性的官方政策写虚

### 长度规则

- 默认控制在 `2-3` 句
- 允许略长，但不能省略高价值限制条件
- 不再以极短答案为目标

### 文风要求

- 直接回答问题，不写背景铺垫
- 保留事实，不补充未给出的规则
- 去掉噪音信息，如“显示更多”“AI 可能出错”“分享”“Would you like me to...”
- 去掉重复步骤，只保留最关键的申请路径或限制条件
- 不写 CTA，不引导用户“去查看官网”
- 不使用第一人称

## 场景规则

### 官方 `price match`

若证据显示品牌有正式 `price match` 政策：

- 开头明确写提供 `official price match`
- 第二句写支持的渠道、竞品范围、国家或门店/官网范围
- 最后一句写 `identical item`、`current price`、`proof`、`third-party sellers excluded` 等关键限制

### 官方 `price protection` / `post-purchase adjustment`

若证据显示是购买后差价保护或本站降价补差：

- 开头明确写不是竞品匹配还是购买后价保
- 第二句写适用站点或订单范围
- 最后一句写时间窗口、退款方式、excluded categories

### `low-price guarantee` / `best rate guarantee`

若证据显示官方最低价承诺：

- 开头明确写是 `low-price guarantee` 或 `best rate guarantee`
- 第二句写适用 booking channel / official site / qualifying listings
- 最后一句写索赔窗口、matching criteria、额外补偿

### `store-level discretionary matching`

若证据只支持部分门店或店员裁量：

- 开头先明确“不存在统一官方政策”或“没有官方统一的 price match”
- 第二句写只在部分门店、地区或客服渠道有处理案例
- 最后一句写 `based on current public policy or store-level reports` 的事实基础与主要限制

### 不支持场景

若 `discount_details` 明显表示不提供官方价格保障：

- 第一句必须明确写不提供 `official price guarantee` 或 `official price match`
- 第二句补充是否仅支持本站降价调整、退款、退货重买、满意保证等替代方案
- 最后一句写最关键的适用范围或限制

## 清洗 `discount_details`

改写前先清洗原文中的低价值噪音：

- 平台 UI 文案：`Mostrar todo`、`AI 模式`、`查看全部`、`공유`
- 无关来源标记：`Instagram`、`Bankier.pl +5`
- CTA 或追问：`Would you like me to...`
- 重复步骤与重复句
- 泛化提醒：`AI answers may contain errors`

只保留能回答 FAQ 的有效事实。

## 质检清单

每条输出完成后检查：

| 检查项 | 标准 |
|------|------|
| 语言一致 | 问题和答案严格按 `country` 映射语言输出 |
| 类型判定 | 已先区分 `price match`、`price protection`、`low-price guarantee`、`post-purchase adjustment`、`store-level discretionary matching` |
| 变量替换 | 使用 `{Mer.}`，不直接暴露品牌名 |
| 信息顺序 | 先是否支持，再范围，再关键限制 |
| 范围清楚 | 国家/站点/门店/品类差异写清楚 |
| 证据强弱 | 官方证据不用 `may offer`，弱证据明确标注来源强度 |
| 不编造 | 未在原文出现的信息不补写 |
| 去噪完成 | 无平台噪音、无无关提示 |
| 输出字段正确 | 表头与映射完全一致 |
| `Source`/`板块名称` | 必须留空 |

## 参考文件

- `references/input-schema.md` — 表格输入输出字段说明
- `references/examples.md` — 价格保障 FAQ 示例
- `templates/answer-template.txt` — FAQ 起草模板
