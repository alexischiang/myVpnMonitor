# VPN 订阅线路监控后台

一个本地运行的订阅线路管理后台，用来监控已售 VPN 订阅 URL 的剩余流量、已用流量和到期时间。

## 快速启动

```bash
npm start
```

打开：

```text
http://localhost:3000
```

## 常用命令

```bash
npm start     # 启动后台
npm run check # 检查代码语法
npm test      # 运行解析测试
```

## 当前解析规则

后台会优先解析标准响应头：

```text
subscription-userinfo: upload=123; download=456; total=107374182400; expire=1767225600
```

如果没有这个响应头，会只解析正文中的指定 `STATUS` 字段：

```text
STATUS=🚀↑:0.03GB,↓:0.69GB,TOT:500GB💡Expires:2026-11-20
```

含义：

- `↑`：上传用量
- `↓`：下载用量
- `TOT`：本月总量
- `Expires`：到期时间

## 数据位置

默认本地模式会把真实数据保存在：

```text
data/subscriptions.json
data/users.json
data/bills.json
```

这些文件已加入 `.gitignore`，避免误提交真实客户数据。示例数据在：

```text
data/subscriptions.example.json
```

## 数据库

项目现在支持两种数据后端：

- 本地默认：继续使用 `data/*.json`，不需要额外配置。
- 云端部署：配置 PostgreSQL 连接串 `DATABASE_URL` 后，数据会写入数据库表 `app_records`。

云端使用 PostgreSQL 前先安装依赖：

```bash
npm install
```

然后配置环境变量：

```text
DATABASE_URL=postgres://user:password@host:5432/database
DATABASE_SSL=true
```

首次启动时会自动创建表结构。当前数据库层用 `collection + id + JSONB` 存储三类业务数据，方便从本地 JSON 平滑迁移到云端，后续如果数据量变大，可以再拆成更细的关系表。

## Vercel 部署

项目已增加 Vercel Serverless 入口：

```text
api/[...path].js
vercel.json
```

Vercel 会直接托管 `public/` 里的前端文件，所有 `/api/*` 请求会进入 `api/[...path].js`，再复用本地的 API 逻辑。

在 Vercel 项目里配置环境变量：

```text
DATABASE_URL=postgres://user:password@host:5432/database
DATABASE_SSL=true
LOW_TRAFFIC_BYTES=53687091200
EXPIRING_SOON_DAYS=3
REFRESH_INTERVAL_MS=1800000
```

建议搭配 Neon PostgreSQL。Vercel 的函数文件系统不适合保存 `data/*.json`，所以云端必须配置 `DATABASE_URL`。

Vercel Cron 已配置为每 6 小时请求一次：

```text
/api/cron/refresh
```

如果想保护这个定时接口，可以设置：

```text
CRON_SECRET=一段随机字符串
```

然后调用接口时带上：

```text
Authorization: Bearer 一段随机字符串
```

## 配置

可以参考 `.env.example` 设置环境变量：

```text
PORT=3000
REFRESH_INTERVAL_MS=1800000
LOW_TRAFFIC_BYTES=10737418240
EXPIRING_SOON_DAYS=7
DATA_FILE=./data/subscriptions.json
DATABASE_URL=postgres://user:password@host:5432/database
DATABASE_SSL=true
```

## 项目状态

这是一个可用的内部管理项目雏形。更多规划见 `PROJECT.md`。
