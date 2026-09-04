# Agent 指令

## 项目

XELA monitor 是一个基于 Node.js、PostgreSQL、React、Vite 和 Docusaurus 的应用，用于管理 VPN 订阅、客户、账单、支付和 3x-ui 服务。

## 仓库结构

- `server.js` — 主 API、业务逻辑和后台任务
- `src/` — React 前端
- `src/components/ui/` — shadcn/ui 基础组件
- `src/components/features/` — 产品功能组件
- `xui-*.js` — 独立的 3x-ui 服务
- `docs-site/` — Docusaurus 客户文档
- `scripts/` — 设置、迁移、同步和构建脚本
- `.github/workflows/deploy.yml` — 生产环境部署

## 开始工作（Startup Workflow）

1. 运行 `git branch --show-current` 和 `git status --short`。
2. 如果当前分支是 `production`，编辑前先切换到 `main`。
3. 阅读 `PROGRESS.md` 和 `feature_list.json`。
4. 同一时间最多处理一个 `in_progress` 功能。
5. 仅在依赖缺失或 lockfile 发生变化时运行 `npm ci`。
6. 进行非简单实现工作前，运行 `npm run agent:init`。

## 命令

- 开发：`npm run dev:all`
- 测试：`npm test`
- 快速基线验证：`npm run verify:fast`
- 完整验证：`npm run verify`
- 生产构建：`npm run build`

## 工作规则

- 每次只做一个功能点（One feature at a time）
- 当前功能点端到端验证通过后，才能开始下一个
- 不要在实现功能 A 时"顺便"重构功能 B

## 范围规则（Stay in Scope）

- 不要用无关的重构、清理或推测性的基础设施扩大任务范围。
- 添加新内容前，优先复用现有代码、平台功能和已安装的依赖。
- 将 `feature_list.json` 视为功能状态跟踪的唯一事实来源。
- 只有在验证成功并记录证据后，才能将功能状态改为 `passing`。

## 分支、Git 和部署

- 仅在 `main` 分支修改代码或文档。
- 切勿直接修改 `production` 分支。
- 除非用户明确要求，否则不要暂存、提交、推送、合并或部署。
- 仅当用户明确要求部署或上线时，才将 `main` 合并到 `production` 并推送 `production`。

## UI 规则

- 编辑 JSX、组件、布局或样式前，先阅读 `docs/agent/ui-rules.md`。
- 优先使用 `src/components/ui/` 中已有的组件，并遵循其官方 API。
- 每次修改 UI 后，都要打开受影响的页面并检查浏览器控制台是否存在未捕获错误；仅构建成功并不足够。
- UI 功能在 `feature_list.json` 中必须标记 `"ui": true`；完成前按 `docs/agent/ui-rules.md` 记录 `browser_verification`，并运行 `npm run verify:harness`。

## 验证

- 仅修改文档或改动非常小时：运行 `git diff --check`。
- 修改后端逻辑时：运行最相关的测试以及 `npm run verify:fast`。
- 修改 JSX、类型或构建链时：运行 `npm run check`，并在浏览器中验证受影响的页面。
- 修改支付、钱包、账单或订阅交付逻辑时：运行 `npm run verify`。
- 浏览器检查使用 `domcontentloaded` 并加上短暂的固定等待；不要默认使用 `networkidle`。
- 尽可能复用当前浏览器标签页和登录会话。
- 将临时验证文件放在临时目录中，并在验证后清理。

## 完成定义（Definition of Done）

仅当满足以下条件时，任务才算完成：

- 已实现用户要求的行为，且没有扩大无关范围。
- 相关自动化检查通过，并已报告结果。
- UI 改动已经在浏览器中实际验证，且没有相关控制台错误。
- `ui: true` 的功能只有在 `browser_verification.console_errors` 和 `page_errors` 均为空时才能标记为 `passing`；构建或单元测试不能替代此门槛。
- 没有无法解释的调试代码、临时产物或未完成的工作。
- 功能跟踪状态和验证证据准确。
- 如果工作需要在其他会话继续，已更新 `PROGRESS.md`。
- 仓库保持可用，下一会话无需手动修复即可继续工作。

## 会话收尾（End of Session）

1. 运行与改动范围匹配的验证。
2. 仅在验证通过后更新 `feature_list.json` 的状态和证据。
3. 运行 `npm run agent:handoff -- --objective "当前目标" --next "下一步"`；需要时增加 `--blocker "阻塞"` 和 `--evidence "验证证据"`。命令会自动写入日期、活动功能和 Git 改动文件，确保下一会话可干净重启（restartable）。

## Agent 文档

- `docs/agent/ui-rules.md` — 前端和 UI 工作的必读规则
- `PROGRESS.md` — 当前已验证状态和跨会话交接信息
- `feature_list.json` — 机器可读的工作状态和验证证据
