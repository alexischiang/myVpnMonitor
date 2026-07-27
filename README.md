# XELA monitor

## Docusaurus 文档中心

文档源码位于 `docs-site/docs/`，生产环境随主应用构建并发布到 `/docs/`，无需独立服务。

```bash
npm run dev:docs
npm run build:docs
```

一个用于管理 VPN 订阅 URL、客户、购买账单和订阅监控的后台系统。
## 功能概览

- URL 管理：新增、编辑、删除、刷新订阅 URL，查看监控返回内容。
- URL 服务商：池 URL 支持记录服务商和可选官网，旧数据会自动补为 `YKK Cloud`，便于后续按服务商扩展解析逻辑。
- URL 监控：自动解析剩余流量、已用流量、总量、到期日期和异常信息。
- URL 状态：正常、需关注、已到期、流量耗尽、未检查。
- 需关注 URL：监控异常、剩余流量小于 50GB、距离到期小于 3 天，或绑定客户数大于等于 8。
- URL 表格：支持到期时间排序、客户数排序、列宽拖拽、显示列控制、一键复制 URL。
- 用户管理：新增、编辑、删除、续费、查看详情。
- 用户类型：区分活跃用户和已过期用户。
- 用户表排序：默认按最新购买时间排序，支持用户到期、购买时间、总付款排序。
- 自动推荐 URL：新增月付或季付用户时，根据用户到期日和 URL 到期日自动推荐合适 URL。
- 购买成功弹窗：新增用户成功后展示购买次数、购买总付款、本次起止日期和绑定 URL，并支持复制。
- 账单管理：记录新购、续费、调整账单，支持撤销、月份筛选、金额合计、账单时间和金额排序。
- 数据同步：用户改名后，账单表会通过用户 ID 链接到当前用户资料；删除用户后账单保留并标记已删除用户。
- 云端数据库：支持 PostgreSQL，当前推荐 Neon。
- Vercel 部署：支持 `/api/*` Serverless Functions 和每日 Cron 刷新。

## 快速启动

安装依赖：

```bash
npm install
```

启动本地服务：

```bash
npm start
```

开发时热重载前端和后端：

```bash
npm run dev:all
```

只启动前端开发服务：

```bash
npm run dev
```

打开：

```text
http://localhost:3000
```

开发模式下打开：

```text
http://localhost:5173
```

## subconverter

`npm run dev:all` 会自动下载并启动 subconverter（仅 macOS / Linux）。Windows 需手动安装。

**检查是否正常运行：**

```bash
curl http://127.0.0.1:25500/version
```

正常返回类似 `subconverter v0.9.1-mihomo backend`。

**手动停止：**

```bash
pkill -f subconverter
```

subconverter 是独立后台进程，`ctrl+c` 停止 `dev:all` 时不会自动停止，下次 `npm run dev:all` 会检测到已在运行并跳过启动。

## 常用命令

```bash
npm start              # 启动后台
npm run dev:all        # 同时启动后端和 Vite 前端热重载
npm run dev            # 只启动 Vite 前端开发服务
npm run dev:server     # 只启动后端热重载
npm run check          # 检查代码语法
npm test               # 运行解析测试
npm run sync:neon-to-local # 将 Neon 数据同步到本机 PostgreSQL
```

## 数据存储

项目只支持 PostgreSQL，业务数据存储在 `app_records` 表中。没有配置数据库或连接失败时，服务会直接启动失败，不会回退到本地文件。

当前数据库层使用 `collection + id + JSONB` 存储业务数据。

## Neon 数据库

本地 `.env` 中配置：

```text
DATABASE_URL=postgres://user:password@host:5432/database
DATABASE_SSL=true
LOCAL_DATABASE_URL=postgres://vpn_monitor:password@127.0.0.1:5432/vpn_monitor
TELEGRAM_BOT_TOKEN=123456:abcdef
TELEGRAM_CHAT_ID=123456789
TELEGRAM_API_BASE_URL=https://api.telegram.org
TELEGRAM_PROXY_URL=http://127.0.0.1:7890
TELEGRAM_WEBHOOK_SECRET=change-me
```

Telegram bot webhook:

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://your-domain.com/api/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>
```

本地 `npm start` / `npm run dev:all` 优先连接 `LOCAL_DATABASE_URL`，Vercel 始终连接 `DATABASE_URL`。

把 Neon 当前数据覆盖同步到本机 PostgreSQL：

```bash
npm run sync:neon-to-local
```



## 订阅解析规则

后台会优先解析标准响应头：

```text
subscription-userinfo: upload=123; download=456; total=107374182400; expire=1767225600
```

如果没有这个响应头，会解析正文里的指定 `STATUS` 字段：

```text
STATUS=↑:0.03GB,↓:0.69GB,TOT:500GB Expires:2026-11-20
```

含义：

- `↑`：上传用量
- `↓`：下载用量
- `TOT`：总量
- `Expires`：到期时间

如果返回：

```json
{
  "message": "Account unavailable"
}
```

会判定该 URL 已到期。

## 配置项

可以参考 `.env.example`：

```text
PORT=3000
REFRESH_INTERVAL_MS=1800000
LOW_TRAFFIC_BYTES=53687091200
EXPIRING_SOON_DAYS=3
DATABASE_URL=postgres://user:password@host:5432/database
DATABASE_SSL=true
LOCAL_DATABASE_URL=postgres://vpn_monitor:password@127.0.0.1:5432/vpn_monitor
```

## 注意事项

- `.env`、真实客户数据和账单数据不要提交到 GitHub。
- 已经泄露过的数据库连接串建议在 Neon 后台轮换密码。
- 本地新增、编辑、删除只写入 `LOCAL_DATABASE_URL`；再次同步会以 Neon 数据覆盖本机数据。
- Vercel 上如果看到 Serverless Function crashed，优先检查 `DATABASE_URL` 是否配置在 Production 环境。
