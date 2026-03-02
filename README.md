# About 质量评估工具（about-quality-demo）

一个基于 Monorepo 的 AI 质检系统，支持：

- 手动评估（`/manual`）
- 批量上传异步评估（`/upload`）
- 历史批次查询与导出（`/history`）
- 评估看板（`/analytics`）

---

## 1. 项目结构

```txt
about-quality-demo/
  apps/
    api/                 # Express + tRPC + Drizzle + MySQL
    web/                 # React + Vite 前端
  packages/
    trpc/                # 前后端共享 schema
  .env.example
  pm2.ecosystem.config.cjs
  package.json
```

---

## 2. 运行环境要求

- Node: `22.22.0`（必须，项目有 engines 限制）
- Yarn: `1.22.22`
- MySQL: `8.x`
- OS: Windows / Linux 均可

> 如果 `yarn` 报 `engine incompatible`，优先检查 Node 版本是否是 `22.22.0`。

---

## 3. 环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

主要变量说明：

- `DATABASE_URL`: MySQL 连接串（必填）
- `API_PORT`: API 端口，默认 `3001`
- `WEB_ORIGIN`: 前端来源地址，默认 `http://localhost:5173`
- `AI_BASE_URL`: 大模型网关地址
- `AI_API_KEY`: 大模型密钥（必填）
- `AI_MODEL`: 模型名（如 `gpt-5-mini`）
- `AI_PROMPT_VERSION`: Prompt 版本号
- `AI_INPUT_COST_PER_1M` / `AI_OUTPUT_COST_PER_1M`: 费用估算参数
- `ABOUT_SKILL_PATH`: About 评分规则目录（默认 `skills/about-quality-scoring`）
- `FAQ_SKILL_PATH`: FAQ 评分规则目录（默认 `skills/faq-quality-scoring`）
- `SNAPSHOT_ENABLED`: 是否保存快照
- `INGEST_ROW_CONCURRENCY`: 批量任务内并发（当前建议 `10`）
- `INGEST_PROGRESS_FLUSH_MS`: 进度写库节流毫秒（建议 `1000`）

---

## 4. 安装与本地启动

```bash
yarn install
yarn dev
```

默认地址：

- Web: `http://localhost:5173`
- API: `http://localhost:3001`
- Health: `http://localhost:3001/health`

---

## 5. 数据库初始化

### 5.1 首次初始化

```bash
yarn workspace @about-demo/api db:generate
yarn workspace @about-demo/api db:migrate
```

### 5.2 兼容历史库说明

服务端已做运行时自动补列（例如 `upload_batches.note/source`、`about_score_rows.term_name` 等）。

即使是旧库，也会在读写时自动尝试 `ALTER TABLE` 补齐字段。

---

## 6. 构建与部署

### 6.1 构建

```bash
yarn build
```

### 6.2 启动 API（PM2）

```bash
yarn start
```

PM2 配置文件：`pm2.ecosystem.config.cjs`

> 当前仓库的 PM2 仅托管 API。Web 由你自己选择静态部署方式（Nginx、Vercel、Netlify 等）。

---

## 7. Web 与 API 联通配置（重要）

当前前端 `tRPC` 地址在代码中写死为：

- `apps/web/src/lib/trpc.ts` -> `http://localhost:3001/trpc`

生产部署时请改为你的实际 API 域名（或按你的网关策略改造为环境变量）。

---

## 8. 当前批量任务执行模型

- 任务间：串行（队列一次只跑一个批次）
- 任务内：并行（按 `INGEST_ROW_CONCURRENCY`）

并发调优建议：

- 起始值 `10`
- 若模型网关限流明显，降到 `6~8`
- 若网关稳定可承受，再逐步上调

---

## 9. 导出能力说明

批量与历史页均支持 xlsx 导出，当前包含 3 个 sheet：

1. `结果明细`
2. `结果统计`（中文）
3. `可发布About`（固定模板）

其中 `可发布About`：

- 仅输出“评估成功且可发布”的行
- `Source` 固定为 `AI`
- `板块名称` 固定为 `About`
- `是否可发布` 口径：`AI总分 >= 8` 或 `OP总分 >= 8`

---

## 10. 常见问题排查

### Q1: 历史页显示 0 条，但库里有数据

- 先看 API 日志是否有 SQL 错误
- 访问 `/health` 确认 API 正常
- 确认 `DATABASE_URL` 是否连到正确库

### Q2: `yarn test` 无法运行，提示 Node 版本不兼容

- 切换到 Node `22.22.0`

### Q3: 上传任务耗时波动大

- 模型服务本身有抖动，属于常见现象
- 先观察 `Token/费用/耗时`，再调整 `INGEST_ROW_CONCURRENCY`

---

## 11. 常用命令

```bash
# 本地开发
yarn dev

# 类型检查
yarn typecheck

# 运行测试
yarn test

# 构建
yarn build

# 启动 API（PM2）
yarn start
```

---

## 12. 路由速览

- `/manual`：手动评估
- `/upload`：批量上传与任务队列
- `/history`：历史批次与导出
- `/analytics`：统计看板
