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

真实数据保存在：

```text
data/subscriptions.json
```

这个文件已加入 `.gitignore`，避免误提交真实客户 URL。示例数据在：

```text
data/subscriptions.example.json
```

## 配置

可以参考 `.env.example` 设置环境变量：

```text
PORT=3000
REFRESH_INTERVAL_MS=1800000
LOW_TRAFFIC_BYTES=10737418240
EXPIRING_SOON_DAYS=7
DATA_FILE=./data/subscriptions.json
```

## 项目状态

这是一个可用的内部管理项目雏形。更多规划见 `PROJECT.md`。
