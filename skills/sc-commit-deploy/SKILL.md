---
name: sc-commit-deploy
description: 用于本项目的代码提交、deploy.sh 部署、上线复核与常见故障排查；当用户要求“提交并部署”“上线这版代码”“部署后确认是否生效”时使用。
---

## Purpose
这个 skill 只服务 `SC-quality-scoring` 项目的标准上线流程：整理本次改动、运行最小必要验证、提交 commit、从仓库根目录执行 [`deploy.sh`](D:/python-tool/SC-quality-scoring/deploy.sh)、部署后做健康检查与改动相关 smoke check，并明确说明是否真的生效。

## Use When
- 用户要求“提交改动并部署”
- 用户要求“上线这版代码”
- 用户要求“部署后顺手复核”
- 用户要求“按这个项目的标准提交流程走一遍”

## Default Workflow
1. 先检查 `git status --short`，确认工作区里哪些改动属于本次任务，哪些不是。
2. 运行“本次改动对应的最小必要验证”，不要默认跑全量重测试。
3. 只在确认本次相关改动可提交后执行 `git add` 和 `git commit`。
4. 仅从仓库根目录执行 `bash ./deploy.sh`。
5. 部署完成后至少复核：
   - API 健康
   - `docker compose ps`
   - migrate 日志
   - 本次改动相关的关键接口或页面
6. 最终汇报必须包含：
   - commit id
   - 部署是否成功
   - 复核结果
   - 残余风险或未验证项

## Hard Rules
- 绝不能在存在未提交改动时声称“已部署最新代码”；[`deploy.sh`](D:/python-tool/SC-quality-scoring/deploy.sh) 只会部署 committed `HEAD`。
- 绝不能从 `apps/api`、`apps/web` 等子目录猜测部署；正式入口只有仓库根目录的 [`deploy.sh`](D:/python-tool/SC-quality-scoring/deploy.sh)。
- 部署后不能只看脚本返回成功；必须补健康检查和关键链路复核。
- 发现无关改动时，不要顺手混提；要明确区分“本次提交内容”和“用户已有未提交内容”。
- 若改动涉及 DB、下载中心、队列、worker、runtime 路径，自动升级为增强复核。
- 本 skill 不包含：
  - 自动修改线上 `.env`
  - 自动清理服务器数据
  - 自动执行高风险回滚
  - 自动替用户 push 到远端 Git 仓库

## Validation Strategy
- 默认先选最小必要验证：
  - 纯前端改动：优先构建/局部交互验证
  - API 逻辑改动：优先对应模块测试、类型检查或 targeted smoke test
  - DB / 下载 / 队列 / worker 改动：至少补类型检查、相关模块测试、部署后专项复核
- 如果当前工作区有无关改动，提交前要明确避开，不要因为“顺手部署”污染 commit。
- commit message 默认使用简洁英文祈使句。

## Deployment Checklist
- 执行前确认当前分支、`git status`、目标 commit。
- 在仓库根目录运行 [`deploy.sh`](D:/python-tool/SC-quality-scoring/deploy.sh)。
- 部署后按需查看：
  - `docker compose ps`
  - `docker compose logs --tail=50 migrate`
  - `/health`
  - 本次改动相关页面/API/下载/队列链路

## Enhanced Verification Triggers
出现以下任一情况时，必须读取对应 reference 并执行增强复核：
- 新增或依赖新表、新字段、新迁移
- 涉及 FAQ 下载中心、GG 下载、历史导出
- 涉及 worker、队列状态、后台任务消费
- 涉及 `.runtime` 文件读写或结果文件路径

增强复核与坑点细节见：
- [references/pitfalls.md](references/pitfalls.md)
- [references/verification-matrix.md](references/verification-matrix.md)

## Output Requirements
最终回复保持简洁，但必须明确：
- 本次提交了什么
- 部署的是哪个 commit
- 线上是否真的生效
- 哪些项已验证
- 哪些项未验证或仍有风险
