# SC Quality Scoring 运营总手册（About / FAQ 双工具）

文档版本：`v2.0`  
更新日期：`2026-03`  
适用对象：运营、质检、内容优化、项目管理、值班同学  
目标：让任何运营同学在不依赖研发的情况下，完成完整的评估-复盘-交付流程。

---

## 0. 快速索引（先看这里）

### 0.1 About 工具
- 入口：手动评分 / 批量上传 / 历史批次 / 评估看板
- 核心目标：评估 About 文案版本优劣并给出可发布建议
- 详见：第 2-7 章

### 0.2 FAQ 工具
- 入口：手动评分 / 批量上传 / 历史批次 / 评估看板
- 核心目标：评估 FAQ 问答质量并识别高风险问答
- 详见：第 8-13 章

### 0.3 遇到问题先查
- 队列空数据：第 14.1 节
- Skills 读不到：第 14.2 节
- 取消后还有 token：第 14.5 节
- 重试失败：第 14.6 节

---

## 1. 系统总览（无黑盒）

### 1.1 两个工具的关系
- `About` 与 `FAQ` 是两个独立模块。
- 页面、历史、看板、导出按模块隔离展示。
- 不允许把 FAQ 的批次和 About 的批次混看或混导。

### 1.2 队列与执行器逻辑（重点）
系统实际执行逻辑如下：

1. **按模块隔离队列**
   - About 队列一套
   - FAQ 队列一套
2. **同模块内批次串行**
   - 同一模块同一时刻仅跑一个批次
3. **批次内部按行并行**
   - 并行度由 `INGEST_ROW_CONCURRENCY` 控制（默认 10）
4. **进度写库节流**
   - 由 `INGEST_PROGRESS_FLUSH_MS` 控制（默认 1000ms）

### 1.3 任务状态机
- `pending`：排队中
- `running`：执行中
- `done`：完成
- `failed`：失败
- `cancelled`：已取消

状态流转：
- 正常：`pending -> running -> done`
- 失败：`pending/running -> failed`
- 取消：`pending/running -> cancelled`

### 1.4 取消与重试真实行为
- 取消只对 `pending/running` 生效。
- 在并发场景下，取消后可能会有少量已发出的子请求收尾，因此仍可能看到轻微 token 增量。
- `failed/cancelled` 可重试；若服务重启导致缓存丢失，需重新上传文件。

---

# Part A：About 工具运营 SOP（可独立复制）

## 2. About 工具目标与边界

### 2.1 目标
- 对 About 的 online/ai/op 版本做统一评分
- 提供可执行优化建议
- 输出可发布判断用于上线门禁

### 2.2 不做什么
- 不直接替代发布审批流程
- 不自动改写最终发布文案（只给评分与建议）

## 3. About 输入/输出字段字典

### 3.1 输入字段（手动与批量通用）
- `TermID`：商家ID（建议必填）
- `TermName`：商家名称（建议必填）
- `Domain`：域名（建议必填）
- `Country`：国家（必填）
- `About_online`：线上版本（必填）
- `About_ai`：AI版本（必填）
- `About_op`：人工复核版本（可选）
- `Uploader`：上传人（必填）
- `batchNote`：批次备注（强烈建议必填）

### 3.2 输出字段（核心）
- `score_total`
- `score_breakdown`（A/B/C/D）
- `strengths`
- `weaknesses`
- `suggestions`
- `pass_for_publish`
- `comparison.best_version`

## 4. About 手动评分流程（标准步骤）

1. 打开手动评分页，模块选 `About`。
2. 填写 `TermID/TermName/Domain/Country`。
3. 粘贴 `About_online`、`About_ai`、`About_op(可空)`。
4. 选择 `Uploader`，填写 `batchNote`。
5. 提交评分。
6. 按顺序阅读：
   - `pass_for_publish`
   - `best_version`
   - `weaknesses + suggestions`

## 5. About 批量上传流程（标准步骤）

### 5.1 上传前检查
- 文件类型：`csv/xlsx`
- 表头必须与模板一致
- 文本不能全空，避免整批失败

### 5.2 执行步骤
1. 进入 About 批量上传页
2. 选择上传人、填写备注
3. 上传文件并启动
4. 队列观察状态与进度
5. 完成后下载导出文件

### 5.3 队列字段解释
- `任务ID`：任务唯一标识
- `状态`：pending/running/done/failed/cancelled
- `进度`：doneRows/totalRows
- `ETA`：预计剩余
- `耗时`：累计执行时长
- `Token`：累计调用token
- `费用(USD)`：估算费用

## 6. About 导出与交付规范

### 6.1 导出建议
- 优先筛 `pass_for_publish=true`
- 对不通过条目按建议修订后复测

### 6.2 命名规范（建议）
- `about_国家_批次日期_上传人_版本.xlsx`
- 示例：`about_US_2026-03-04_Ella_v1.xlsx`

## 7. About 运营 KPI（可量化）

- 可发布率 = 可发布条数 / 有效条数
- AI提升率 = (AI均分 - Online均分) / Online均分
- 失败率 = 失败条数 / 总条数
- 单条成本 = 总费用 / 有效条数
- 平均处理时长 = 总耗时 / 有效条数

---

# Part B：FAQ 工具运营 SOP（可独立复制）

## 8. FAQ 工具目标与边界

### 8.1 目标
- 对 FAQ 问答质量做标准化评估
- 识别高风险问答（规则冲突、边界缺失、退款缺失等）
- 输出可发布FAQ用于内容交付

### 8.2 不做什么
- 不自动发布FAQ
- 不自动补全不存在的政策事实

## 9. FAQ 输入/输出字段字典

### 9.1 常见输入字段
- `TermID / TermName / Domain / Country`
- `subclass`
- `Q_online / A_online`
- `Q_ai / A_ai`
- `Q_op / A_op`（可选）

### 9.2 FAQ 输出核心字段
- `score_total`
- `score_breakdown`
- `pass_for_publish`
- `comparison.best_version`
- 风险项（一般在 weaknesses/notes）

## 10. FAQ 操作流程

### 10.1 手动评分
1. 打开手动评分页，模块选 `FAQ`
2. 填写基础字段
3. 填写问答文本
4. 提交评分并查看风险提示

### 10.2 批量上传
1. 下载 FAQ 模板
2. 上传并启动任务
3. 观察队列：商家数 + FAQ进度 + ETA/耗时/成本
4. 完成后下载 FAQ 导出

## 11. FAQ 导出规范（重点）

FAQ 导出包含 3 个 sheet：
1. `详情`
2. `统计`
3. `可发布FAQ`

可发布FAQ关键字段：
- `ContentType`（faq）
- `Country/TermID/TermName/Domain`
- `Source`（AI）
- `Subclass`
- `板块名称`（faq）
- `Titile1`（question）
- `Brief Introduction`（answer）
- `Href Kw / Href Url`（留空）

## 12. FAQ 高风险关注清单

跑批后重点筛查：
- 叠加规则前后矛盾
- 生效时点缺失
- 适用范围与排除项缺失
- 退款后优惠处理缺失
- 绝对化承诺（100%/永久/全部）

## 13. FAQ KPI（可量化）

- FAQ通过率 = 可发布FAQ条数 / 有效FAQ条数
- 商家通过率 = 至少1条FAQ通过商家数 / 总商家数
- 高风险命中率 = 高风险条数 / 有效条数
- 单条成本(USD/FAQ)
- 平均处理时长(秒/FAQ)

---

# Part C：通用运维与排障（两个工具都适用）

## 14. 问题排查总表（按现象查）

### 14.1 现象：队列显示“暂无任务”
排查顺序：
1) 是否切到正确模块（About/FAQ）  
2) API `/health` 是否 200  
3) 浏览器 Network 是否有 `/trpc` 请求  
4) `DATABASE_URL` 是否指向正确库

### 14.2 现象：Skills 内容为空或加载失败
1) 检查 `ABOUT_SKILL_PATH` / `FAQ_SKILL_PATH`  
2) 确认 `skills/*/SKILL.md` 存在  
3) 重启 API  
4) 若项目改名后发生，执行 `yarn install`

### 14.3 现象：历史批次有数据但页面为空
1) 检查模块筛选是否正确  
2) 检查日期筛选范围  
3) 检查 API 返回的 moduleId 是否匹配当前页

### 14.4 现象：构建时报包解析错误
常见动作：
1) 执行 `yarn install` 重建 workspace 链接  
2) 确认 Node 版本为 `22.22.0`

### 14.5 现象：点击取消后任务似乎还在消耗
解释：并发任务收尾导致少量 token 继续增长，属正常边界。

### 14.6 现象：重试失败
可能是缓存丢失（服务重启或内存释放），建议重新上传文件。

## 15. 环境变量说明（运营可读版）

### 15.1 服务连接
- `DATABASE_URL`：数据库连接（错了=全站空数据）
- `API_PORT`：API端口
- `WEB_ORIGIN`：允许前端来源
- `VITE_TRPC_URL`：前端直连地址（可选）

### 15.2 AI与成本
- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`
- `AI_MAX_OUTPUT_TOKENS`
- `AI_INPUT_COST_PER_1M`
- `AI_OUTPUT_COST_PER_1M`

### 15.3 队列并发
- `INGEST_ROW_CONCURRENCY`（建议 8~10）
- `INGEST_PROGRESS_FLUSH_MS`（建议 1000）
- `SNAPSHOT_ENABLED`

### 15.4 Skills 路径
- `ABOUT_SKILL_PATH`
- `FAQ_SKILL_PATH`

建议：使用相对路径 `skills/...`，迁移更稳定。

## 16. 值班与SLA建议

### 16.1 处理时效建议
- P1（全站不可用）：15 分钟响应，2 小时内给出恢复方案
- P2（某模块不可用）：30 分钟响应，4 小时内修复
- P3（体验问题）：当日排期

### 16.2 值班记录模板
- 时间
- 现象
- 影响范围（About/FAQ）
- 排查路径
- 根因
- 处理动作
- 是否复发

## 17. 复盘与周报模板（可复制）

### 17.1 批次复盘模板
- 批次ID：
- 模块：About/FAQ
- 数据规模：商家数/条数
- 可发布率：
- 失败率：
- AI提升率：
- 高风险命中率（FAQ）：
- 成本：
- 结论与行动项：

### 17.2 周报摘要模板
- 本周总批次数
- 本周总处理条数
- 可发布率周环比
- 平均成本周环比
- Top3 问题类型
- 下周优化计划

## 18. 上线前总验收清单（最终）

- [ ] About 手动评分正常
- [ ] FAQ 手动评分正常
- [ ] About 批量跑通并可导出
- [ ] FAQ 批量跑通并导出3个sheet
- [ ] 队列状态流转正常（含取消/重试）
- [ ] 历史批次可查可追溯
- [ ] 看板图表正常显示
- [ ] 抽检 10 条结果与业务预期一致

---

## 19. 文档维护规范

- 配置项变化：当天更新本手册
- 导出字段变化：必须更新第 6 / 11 章
- 队列逻辑变化：必须更新第 1 章和第 14 章
- 每次版本发布后更新版本号与日期

