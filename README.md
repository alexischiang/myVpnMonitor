# XELA monitor

一个用于管理 VPN 订阅 URL、客户、购买账单和订阅监控的后台系统。项目支持本地运行，也支持部署到 Vercel 并连接 Neon PostgreSQL。

## 功能概览

- URL 管理：新增、编辑、删除、刷新订阅 URL，查看监控返回内容。
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

开发时热重载：

```bash
npm run dev
```

打开：

```text
http://localhost:3000
```

## 常用命令

```bash
npm start              # 启动后台
npm run dev            # nodemon 热重载
npm run check          # 检查代码语法
npm test               # 运行解析测试
npm run migrate:json-to-db # 将 data/*.json 导入 DATABASE_URL 指向的数据库
```

## 数据存储

项目支持两种数据后端：

- 本地 JSON：没有配置 `DATABASE_URL` 时，使用 `data/*.json`。
- PostgreSQL：配置 `DATABASE_URL` 后，使用数据库表 `app_records`。

本地 JSON 文件：

```text
data/subscriptions.json
data/users.json
data/bills.json
```

这些文件已加入 `.gitignore`，避免误提交真实客户数据。

当前数据库层用 `collection + id + JSONB` 存储三类业务数据，方便从本地 JSON 平滑迁移到云端。后续数据量变大时，可以再拆成更细的关系表。

## Neon 数据库

本地 `.env` 中配置：

```text
DATABASE_URL=postgres://user:password@host:5432/database
DATABASE_SSL=true
```

配置后，本地 `npm start` / `npm run dev` 会直接连接 Neon。

如果要把现有 JSON 数据导入 Neon：

```bash
npm run migrate:json-to-db
```

如果想临时切回本地 JSON，删除或注释 `.env` 里的 `DATABASE_URL`，然后重启服务。

## Vercel 部署

项目已包含 Vercel 部署结构：

```text
api/[...path].js
vercel.json
```

Vercel 会托管 `public/` 中的前端文件，所有 `/api/*` 请求会进入 `api/[...path].js`，并复用本地 API 逻辑。

Vercel 环境变量：

```text
DATABASE_URL=你的 Neon PostgreSQL 连接串
DATABASE_SSL=true
LOW_TRAFFIC_BYTES=53687091200
EXPIRING_SOON_DAYS=3
REFRESH_INTERVAL_MS=1800000
```

Vercel 的函数文件系统不适合保存 `data/*.json`，所以云端必须配置 `DATABASE_URL`。

Vercel Hobby 账号的 Cron 限制为每天一次，因此当前配置为每日刷新：

```text
/api/cron/refresh
```

如需保护 Cron 接口，可设置：

```text
CRON_SECRET=一段随机字符串
```

然后调用接口时带上：

```text
Authorization: Bearer 一段随机字符串
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
DATA_FILE=./data/subscriptions.json
DATABASE_URL=postgres://user:password@host:5432/database
DATABASE_SSL=true
```

## 注意事项

- `.env`、真实客户数据和账单数据不要提交到 GitHub。
- 已经泄露过的数据库连接串建议在 Neon 后台轮换密码。
- 本地连接 Neon 时，所有新增、编辑、删除都会直接写入云端数据库。
- Vercel 上如果看到 Serverless Function crashed，优先检查 `DATABASE_URL` 是否配置在 Production 环境。
