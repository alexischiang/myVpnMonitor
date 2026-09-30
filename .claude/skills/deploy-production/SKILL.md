---
name: deploy-production
description: 提交本地所有改动并推送 main，合并到 production 触发 GitHub Actions 部署，监控直到线上 https://webprovider.top 正常运行。仅在用户明确要求部署/上线时使用。
disable-model-invocation: true
argument-hint: "[可选：提交信息]"
---

# 部署到生产环境

用户调用本技能即视为明确授权：提交、推送 `main`、合并并推送 `production`。
除此之外的破坏性操作（强推、回滚、改写历史、跳过 hook）一律先询问用户。

- 仓库：`origin` = `git@github.com:alexischiang/myVpnMonitor.git`
- 部署工作流：`.github/workflows/deploy.yml`（push 到 `production` 触发，VPS 上 pm2 重启后检查 `/api/health`）
- 线上地址：`https://webprovider.top`

PowerShell 中用 `; if ($?) { ... }` 串联命令，不能用 `&&`。

## 1. 前置检查

```powershell
git branch --show-current
git fetch origin
git status --short
git rev-list --left-right --count origin/main...main
```

- 当前分支必须是 `main`；如果在 `production`，先 `git checkout main`。
- 左侧数字 > 0 说明本地落后远端：先 `git pull --ff-only origin main`。失败就停下来告诉用户，不要自行 rebase 或 merge。
- 工作区干净且本地没有领先远端的提交时，告诉用户没有可部署的内容，然后结束。

## 2. 检查改动并验证

1. 查看 `git status --short` 和 `git diff --stat`，确认没有 `.env`、密钥、临时文件或调试产物。发现可疑文件时先问用户。
2. 按 AGENTS.md 选择验证命令：
   - 改了 `src/`、类型或构建链：`npm run check`
   - 改了后端逻辑：`npm run verify:fast`
   - 改了支付、钱包、账单或订阅交付：`npm run verify`
   - 只改了文档：`git diff --check`
3. 任何验证失败就停止，报告失败输出，不要提交。

## 3. 提交

- 提交信息优先用 `$ARGUMENTS`；为空时根据 diff 写一条 conventional commit（`feat:` / `fix:` / `chore:` …），正文列出要点。
- 末尾加上当前会话 system reminder 中给出的 Co-Authored-By 署名行。
- 用 `git add -A`，但要排除第 2 步发现的可疑文件。

```powershell
git add -A
git commit -m @'
<标题>

<要点>

<署名行>
'@
```

没有未提交改动、但本地领先远端时，跳过本步骤。

## 4. 记录线上基线

```powershell
$before = ([regex]::Match((Invoke-WebRequest https://webprovider.top/login -UseBasicParsing -TimeoutSec 15).Content, 'assets/index-[^"]+\.js')).Value
$before
```

## 5. 推送并合并 production

```powershell
git push origin main
git checkout production
git pull --ff-only origin production
git merge --no-ff main -m "merge: deploy main to production"
git push origin production
git checkout main
```

- 每一步失败都立即停止。
- 合并冲突时执行 `git merge --abort` 并 `git checkout main`，把冲突文件报告给用户，不要自行解决冲突。
- 结束时必须回到 `main` 分支。

## 6. 监控 GitHub Actions

```powershell
$sha = git rev-parse production
gh run list --branch production --commit $sha --limit 1 --json databaseId,status --jq '.[0].databaseId'
gh run watch <databaseId> --exit-status --interval 15
```

- run 没出现时等几秒再查一次（最多约 1 分钟）。
- 用 `gh run watch` 等待，Bash/PowerShell 超时设为 600000 毫秒；运行超过 10 分钟就再调用一次 `gh run watch`。
- 失败时用 `gh run view <id> --log-failed` 取出失败步骤的日志，报告失败原因和建议的修复办法。未经用户同意不要重跑、回滚或强推。

## 7. 验证线上服务

工作流成功后，从外部确认新版本已经生效：

```powershell
$h = Invoke-WebRequest https://webprovider.top/api/health -UseBasicParsing -TimeoutSec 15
$h.Content          # 必须包含 "ok":true，各 services 的 status 应为 ok
$after = ([regex]::Match((Invoke-WebRequest https://webprovider.top/login -UseBasicParsing -TimeoutSec 15).Content, 'assets/index-[^"]+\.js')).Value
"$before -> $after" # 前端有改动时哈希必须变化
```

- health 不是 ok：每 15 秒重试一次，最多 2 分钟；仍然失败就报告 health 内容。
- 前端有改动但 bundle 哈希没变：可能是缓存或同步问题，报告给用户。
- 本次改动涉及页面时，用内置浏览器打开受影响的线上页面，检查渲染结果和控制台错误。只做只读检查，不要登录、下单或提交表单。

## 8. 汇报

用中文简要汇报：

- 提交哈希和标题，推送到 main 和 production 的结果
- Actions run 的链接和结论（`gh run view <id> --json url --jq .url`）
- health 结果、bundle 哈希变化、浏览器检查结果
- 任何警告，例如工作流中的 Node 版本弃用提示
