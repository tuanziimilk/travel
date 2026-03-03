# SC Quality Scoring

`SC Quality Scoring` 是一个面向 `About` 与 `FAQ` 文案质检评分的 Monorepo 工具。

支持能力：

- 手动评分（对比 online / ai / op）
- 批量上传评分（队列执行、可取消/重试）
- 历史批次查询（筛选、详情、下载）
- 评估看板（分数、通过率、分布图）
- Skill 在线读取/编辑（About 与 FAQ 分离）

---

## 1. 项目结构

```txt
SC-quality-scoring/
  apps/
    api/                 # Express + tRPC + Drizzle + MySQL
    web/                 # React + Vite
  packages/
    trpc/                # 前后端共享 schema
  skills/
    about-quality-scoring/
    faq-quality-scoring/
  .env.example
  package.json
```

---

## 2. 运行环境要求

- Node: `22.22.0`
- Yarn: `1.22.22`
- MySQL: `8.x`

建议先确认：

```bash
node -v
yarn -v
```

---

## 3. 安装与启动

1) 安装依赖

```bash
yarn install
```

2) 复制环境变量文件

```bash
cp .env.example .env
```

3) 启动开发环境

```bash
yarn dev
```

默认地址：

- Web: `http://localhost:5173`
- API: `http://localhost:3001`
- Health: `http://localhost:3001/health`

---

## 4. 环境变量说明（详细）

以下变量定义在 `.env`（可参考 `.env.example`）。

### 4.1 AI / 成本相关

- `AI_BASE_URL`
  - 说明：模型 API 网关地址
  - 默认：`https://api.openai.com/v1`
  - 示例：`https://api.openai.com/v1`

- `AI_API_KEY`
  - 说明：模型 API Key
  - 默认：无（必填）
  - 示例：`sk-xxxx`

- `AI_MODEL`
  - 说明：调用模型名
  - 默认：`gpt-4.1-mini`
  - 示例：`gpt-5-mini`

- `AI_MAX_OUTPUT_TOKENS`
  - 说明：限制模型单次最大输出 token
  - 默认：`1200`（示例值）
  - 建议：过小会导致输出截断，过大增加成本

- `AI_PROMPT_VERSION`
  - 说明：提示词版本标识（用于追踪）
  - 默认：`about_quality_scoring_v1`
  - FAQ 场景建议配置为 FAQ 对应版本

- `AI_INPUT_COST_PER_1M`
  - 说明：输入 token 单价（每 1M）
  - 默认：`0.25`

- `AI_OUTPUT_COST_PER_1M`
  - 说明：输出 token 单价（每 1M）
  - 默认：`2.00`

### 4.2 数据库与服务地址

- `DATABASE_URL`
  - 说明：MySQL 连接串
  - 默认：无（必填）
  - 示例：`mysql://root:password@127.0.0.1:3306/about_quality_demo`

- `API_PORT`
  - 说明：API 启动端口
  - 默认：`3001`

- `WEB_ORIGIN`
  - 说明：API CORS 白名单来源
  - 默认：`http://localhost:5173`
  - 生产建议：改成正式域名

### 4.3 Skill 路径相关

- `ABOUT_SKILL_PATH`
  - 说明：About Skill 目录
  - 默认：`skills/about-quality-scoring`

- `FAQ_SKILL_PATH`
  - 说明：FAQ Skill 目录
  - 默认：`skills/faq-quality-scoring`

说明：

- 建议使用相对路径（随仓库迁移更稳）。
- 后端已做路径容错：若配置为旧绝对路径，会自动回退到当前仓库 `skills/...`。

### 4.4 批量队列与进度

- `SNAPSHOT_ENABLED`
  - 说明：是否保存评分快照
  - 默认：`true`

- `INGEST_ROW_CONCURRENCY`
  - 说明：单个批量任务内部并发
  - 默认：`10`
  - 建议：
    - 稳定起始值 `8~10`
    - 限流明显时降到 `4~6`

- `INGEST_PROGRESS_FLUSH_MS`
  - 说明：进度写库节流间隔（毫秒）
  - 默认：`1000`
  - 建议：`500~1500`

### 4.5 前端 tRPC 地址（可选）

- `VITE_TRPC_URL`
  - 说明：前端直连 tRPC 地址
  - 默认：空（使用 `/trpc` 相对路径）
  - 示例：`https://api.xxx.com/trpc`

说明：

- 开发环境默认使用 Vite 代理：`/trpc -> http://localhost:3001`
- 生产环境可通过网关转发，或设置 `VITE_TRPC_URL`

---

## 5. 改项目目录名后的注意事项

当目录名变化（例如 `about-quality-demo` -> `SC-quality-scoring`）后，建议执行：

```bash
yarn install
```

目的：重建 workspace 软链接，避免 `@about-demo/*` 指向旧路径。

---

## 6. 常用命令

```bash
yarn dev
yarn typecheck
yarn test
yarn build
yarn start
```

---

## 7. 部署前检查清单

```bash
yarn typecheck
yarn build
yarn test
```

建议再人工验证：

1) 手动评分（About/FAQ 各 1 次）
2) 批量上传（FAQ 1 个小样本）
3) 队列状态更新（running -> done）
4) 历史批次可见并可下载
5) 看板图表可渲染

---

## 8. 常见故障排查

### 8.1 前端页面显示“暂无任务”

依次检查：

1) API 是否正常：`/health` 是否返回 200
2) 浏览器 Network 中 `/trpc` 是否成功
3) 当前页面是否在 FAQ 模块（不是 About）
4) `DATABASE_URL` 是否连接到正确库

### 8.2 Skill 取不到值

1) 检查 `ABOUT_SKILL_PATH` / `FAQ_SKILL_PATH`
2) 确认对应目录存在 `SKILL.md`
3) 重新启动 API

### 8.3 改目录后包解析失败

表现：`Failed to resolve import '@about-demo/trpc'`

解决：

```bash
yarn install
```

