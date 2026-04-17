# 服务器 AI 默认模型运维说明

## 结论

当前线上服务的 AI 默认模型已经对齐到：

- `AI_MODEL=gemini-2.5-flash-lite`
- `TRANSLATION_AI_MODEL=gemini-2.5-flash-lite`
- `CATEGORY_CALIBRATION_AI_MODEL=gemini-2.5-flash-lite`

对应线上运行时默认值应为：

- `output-faq` -> `gemini / gemini-2.5-flash-lite`
- `translation-batch` -> `gemini / gemini-2.5-flash-lite`
- `translation-text` -> `gemini / gemini-2.5-flash-lite`
- `category-calibration` -> `gemini / gemini-2.5-flash-lite`

## 为什么服务器会和本地漂移

根因不是代码默认值失效，而是部署策略决定了服务器 `.env` 不会被代码仓库覆盖。

当前 [deploy.sh](D:\python-tool\SC-quality-scoring\deploy.sh) 在同步代码时显式排除了：

- `.env`
- `.env.*`

这意味着：

1. 本地 `.env` 或 `.env.example` 改成 Gemini 默认后
2. 执行部署
3. 服务器仍继续使用原来的 `/app/site/SC-quality-scoring/.env`

如果服务器 `.env` 里还保留旧值，例如：

- `AI_MODEL=gpt-4.1-mini`
- `AI_BASE_URL=https://api.openai.com/v1`
- `AI_API_KEY=...`

那么线上默认显示和实际启动默认值都会继续是 OpenAI。

## 服务器 `.env` 必须维护的字段

服务器至少应保持下面这些字段存在且正确：

```env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=...
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
GEMINI_API_KEY=...

AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=...

AI_MODEL=gemini-2.5-flash-lite
TRANSLATION_AI_MODEL=gemini-2.5-flash-lite
CATEGORY_CALIBRATION_AI_MODEL=gemini-2.5-flash-lite
```

说明：

- `OPENAI_*` / `GEMINI_*` 是双 provider 正式配置
- `AI_BASE_URL` / `AI_API_KEY` 是旧兼容字段，当前仍建议保留
- `AI_MODEL` 控制质量评分和 FAQ 输出等默认模型
- `TRANSLATION_AI_MODEL` 控制翻译工具默认模型
- `CATEGORY_CALIBRATION_AI_MODEL` 控制分类校准默认模型

## 修改服务器默认模型的标准步骤

### 1. 先备份服务器 `.env`

```bash
cd /app/site/SC-quality-scoring
cp .env .env.backup-$(date +%Y%m%d-%H%M%S)
```

### 2. 修改关键字段

直接编辑：

- `/app/site/SC-quality-scoring/.env`

确保上面的 9 个关键字段存在，并且模型值都为：

- `gemini-2.5-flash-lite`

### 3. 重启 API

```bash
cd /app/site/SC-quality-scoring
docker compose --env-file .env up -d api
```

如果同时改了 web 静态资源或后端镜像，再按正常部署流程执行。

## 验证方法

### 1. 健康检查

```bash
curl http://127.0.0.1:3001/health
```

期望：

```json
{"ok":true}
```

### 2. 运行时默认值检查

可直接请求：

```bash
curl "http://127.0.0.1:3001/trpc/runtime.aiConfig.get?input=%7B%22toolKey%22%3A%22output-faq%22%7D"
curl "http://127.0.0.1:3001/trpc/runtime.aiConfig.get?input=%7B%22toolKey%22%3A%22translation-batch%22%7D"
curl "http://127.0.0.1:3001/trpc/runtime.aiConfig.get?input=%7B%22toolKey%22%3A%22translation-text%22%7D"
curl "http://127.0.0.1:3001/trpc/runtime.aiConfig.get?input=%7B%22toolKey%22%3A%22category-calibration%22%7D"
```

期望返回：

- `provider = gemini`
- `aiModel = gemini-2.5-flash-lite`

## 如何确认工具切换仍然隔离

当前隔离逻辑是按 `toolKey` 管理的，不依赖服务器 `.env` 是否统一。

重点验证方法：

1. 将 `output-faq` 切到 `openai / gpt-4.1-mini`
2. 再读取：
   - `translation-batch`
   - `translation-text`
   - `category-calibration`
3. 这三个仍应保持：
   - `gemini / gemini-2.5-flash-lite`

如果只改了一个工具，而其他工具默认值没变，就说明隔离正常。

## 运维注意事项

- 不要以为改了仓库里的 `.env.example` 就等于改了服务器默认值
- 每次发现“线上默认模型和本地不一致”，优先先查服务器 `.env`
- 如果要长期避免漂移，后续可以再做单独的“服务器 `.env` 差异审计”脚本
- 当前不建议让部署脚本自动覆盖服务器 `.env`，因为会放大密钥和环境配置变更风险
