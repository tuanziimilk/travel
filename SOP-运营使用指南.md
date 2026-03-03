# SC Quality Scoring 运营使用 SOP

适用角色：运营、内容优化、质检同学。

本 SOP 聚焦“如何正确使用工具”和“环境变量如何配合业务稳定运行”。

---

## 1. 使用目标

- 对 About/FAQ 文案进行统一评分
- 快速判断可发布版本
- 追踪批量任务进度与成本
- 在历史批次和看板中复盘质量趋势

---

## 2. 页面与场景

- `手动评分`
  - 适合：单条精修、AB 对比、上线前复核
- `批量上传`
  - 适合：批量跑分、队列处理、导出交付
- `历史批次`
  - 适合：按上传人/国家/日期追溯批次
- `评估看板`
  - 适合：周报/月报统计分析

---

## 3. 手动评分 SOP

1) 选择模块（About 或 FAQ）
2) 填写基础字段：`TermID`、`TermName`、`Domain`、`Country`
3) 填写版本文本：`online`、`ai`、`op(可选)`
4) 选择 `Uploader`，可填写 `batchNote`
5) 提交评分并查看：
   - 总分 + A/B/C/D
   - 是否可发布
   - 优势/问题/建议

注意：

- FAQ 场景建议使用 FAQ 模块，不要混用 About 模块。

---

## 4. 批量上传 SOP

1) 下载模板并准备 `csv/xlsx`
2) 选择上传人、填写备注
3) 上传文件并启动任务
4) 在队列中观察：状态、进度、ETA、耗时、Token、费用
5) 任务完成后下载 xlsx 结果

取消与重试：

- `pending/running` 支持取消
- `failed/cancelled` 支持重试

---

## 5. FAQ 导出格式说明

FAQ 导出为 3 个 sheet：

1) 详情
2) 统计
3) 可发布 FAQ

“可发布 FAQ”核心字段：

- `ContentType`（固定 `faq`）
- `Country`、`TermID`、`TermName`、`Domain`
- `Source`（固定 `AI`）
- `Subclass`
- `板块名称`（固定 `faq`）
- `Titile1`（问题）
- `Brief Introduction`（答案）
- `Href Kw`（留空）
- `Href Url`（留空）

---

## 6. 环境变量与运营关系（重点）

虽然环境变量主要由技术同学配置，但运营需要知道“出现问题该看哪里”。

### 6.1 影响任务是否能跑通

- `AI_API_KEY`
  - 未配置/失效会导致评分失败
- `AI_MODEL`
  - 模型变化会影响评分质量和成本
- `DATABASE_URL`
  - 配错会导致历史、队列、看板都空数据

### 6.2 影响前端是否能拿到数据

- `API_PORT`
  - API 不在这个端口会导致前端请求失败
- `WEB_ORIGIN`
  - 配错可能触发跨域问题
- `VITE_TRPC_URL`（可选）
  - 若配置了错误地址，会导致页面空数据
  - 未配置时默认使用 `/trpc` + 本地代理

### 6.3 影响 Skills 是否可读

- `ABOUT_SKILL_PATH`
- `FAQ_SKILL_PATH`

建议：

- 优先用相对路径（`skills/...`）
- 项目迁移目录后更稳
- 系统有旧绝对路径回退机制，但不建议长期依赖

### 6.4 影响批量速度与稳定性

- `INGEST_ROW_CONCURRENCY`
  - 值大：速度快但更容易触发限流
  - 值小：更稳但耗时增加
- `INGEST_PROGRESS_FLUSH_MS`
  - 决定进度刷新写库频率

运营建议默认值：

- `INGEST_ROW_CONCURRENCY=8~10`
- `INGEST_PROGRESS_FLUSH_MS=1000`

---

## 7. 常见问题处理

### Q1：队列显示“暂无任务”

排查顺序：

1) 看 API `health` 是否正常
2) 看页面 Network 是否有 `/trpc` 请求
3) 看是否切错模块（FAQ/About）
4) 看 `DATABASE_URL` 是否连到正确库

### Q2：Skills 内容显示为空

1) 检查 `ABOUT_SKILL_PATH` / `FAQ_SKILL_PATH`
2) 确认对应 `skills/*/SKILL.md` 存在
3) 重启 API

### Q3：改目录名后页面报包解析错误

执行：

```bash
yarn install
```

用于重建 workspace 链接。

---

## 8. 上线前运营验收清单

- 手动评分（About/FAQ）各跑 1 次
- FAQ 批量上传至少 1 个小样本
- 队列状态流转正常（pending/running/done）
- 历史批次能查到刚跑的数据
- xlsx 下载正常（FAQ 三个 sheet）
- 看板图表可渲染

