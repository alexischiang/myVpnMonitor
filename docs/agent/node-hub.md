# node-hub：用本站控制每台 VPS 上的 xboard-node

node-hub 让本站直接管理部署在每台 VPS 上的 [xboard-node](https://github.com/cedar2025/xboard-node)（fork：`alexischiang/nexora-node`，节点代码未改），替代 3x-ui 主面板 / 子面板架构。xboard-node 使用 Xboard 的原生节点 API，无需二次开发。

## 架构

```
用户 / 管理后台 ──> server.js（本站） ──loopback + Bearer──> node-hub（node-hub/server.js，默认 127.0.0.1:3003）
                                                               │  同一个 PostgreSQL：nh_* 表 + xui_daily_traffic
VPS: xboard-node (machine 模式) ──HTTPS /api/v1|v2/server/*──> 反向代理 ──> node-hub
                               <══WSS /api/v2/server/ws（推送）═══
```

- node-hub 是独立进程，只做三件事：对 xboard-node 提供 Xboard 节点 API（handshake、config、user、report、machine/nodes、machine/status，ETag/304）；通过 WebSocket 把变化实时推给 xboard-node（`node-hub/push.js`，见下节）；对本站提供 `/internal/*` 管理 API（仅 loopback + `NODE_HUB_INTERNAL_TOKEN`）。
- 授权由本站计算：每个用户 `{userKey, uuid, planId, nodeIds, speedLimit, deviceLimit, enabled}`，每 60 秒全量同步（同步任务「node-hub 授权同步」，兜底到期等没有事件的变化），开通、续费、套餐变更、流量耗尽、个人定制入站变更时立即同步单个用户。node-hub 收到后立刻推给已连接的机器。
- 流量：xboard-node 每次上报的是每用户增量；node-hub 在一个事务里按 report id 去重后累加到本站的 `xui_daily_traffic`（中国日期，`node_guid = hub-m<机器id>`）。所以加权计费、日流量图、节点盈利分析都沿用原逻辑。上报失败时节点会自己回滚重报，不会丢流量。
- 在本站里，hub 节点以入站形式出现：key `hub-m<机器id>:<节点id>`，入站 id `1000000000 + 节点id`。这些 id 永远不会发给 3x-ui。线路组、入站设置（地区、网络等级、套餐/定制）、启用停用、个人定制入站、在线状态、节点监控都直接可用。
- 订阅：`/sub/<token>` 把 hub 节点的 Clash 代理合并进 3x-ui 的 Clash 配置（两者共存时），或者单独生成（只有 hub 时），再交给 subconverter。

## 两种运行方式

| 配置 | 行为 |
| --- | --- |
| 只配 `XUI_*`（现状） | 和以前完全一样，hub 相关代码不运行，同步任务里不显示「节点」模块。 |
| `XUI_*` + `NODE_HUB_*` | 混合：用户同时拿到 3x-ui 入站和 hub 节点。hub 复用 3x-ui Client 的 uuid，VLESS/VMess 迁移后客户端无需更新：新开通用户直接传入面板 uuid；已有用户在第一次授权同步时从面板 client 列表读取 uuid，面板上找不到 client 的用户先不上 hub，等开通创建 client 后再同步。计费仍由 3x-ui 面板同步任务完成，同时计入 hub 流量。 |
| 只配 `NODE_HUB_*` + `SUB_CONVERTER_URL` | 只用 hub：开通不再调用 3x-ui，计费由「node-hub 流量计费」任务完成。 |

## 功能对照（3x-ui → node-hub）

| 3x-ui 用法 | node-hub |
| --- | --- |
| Client 开通、续费、停用 | `enabled` 授权；停用用户会从节点用户列表移除，节点下次拉取（≤ pull_interval）即断开 |
| 每用户流量统计、加权计费、流量耗尽停用 | 节点增量上报 → `xui_daily_traffic` → 原有加权账本；耗尽后自动停用 |
| 赠送流量、重置流量、流量包、流量附加服务 | 立即同步该用户的 hub 授权（耗尽的用户马上恢复）；只用 hub 时不再调用 3x-ui，hub 同步失败即操作失败 |
| 每日流量、按节点流量、盈利分析 | 同一张表，`hub-m<id>` 作为节点 guid |
| 在线用户、在线 IP 数 | `alive` / `online` 上报 → presence，合并进 `/api/xui-presence` 和用户的 connectedIpCount |
| 设备数限制 | `device_limit`（套餐 deviceLimit）；推送连接时各节点上报在线 IP，node-hub 汇总后下发 `sync.devices`，sing-box 内核按全局设备数限制，xray 内核按单节点 |
| 限速 | `speed_limit`（Mbps）：用户覆盖值 `PUT /api/users/:id/node-speed-limit`，否则用套餐 `speedLimitMbps` |
| 入站启停、入站设置、线路组 | 同一套页面与 API，hub 入站可直接加入线路组 |
| 个人定制入站 | 同一套 API，hub 入站 id 可直接分配 |
| 节点监控 | 机器在线状态、CPU/内存/磁盘/负载、在线人数来自 machine/status |
| 订阅 | hub 节点生成 ClashMeta 代理（vless/vmess/trojan/ss/hysteria2/tuic/anytls） |
| REALITY 密钥 | `/api/node-hub/reality-keypair` 生成，或迁移时沿用 3x-ui 的 |

## 管理 API（管理员登录后）

- `GET /api/node-hub/overview`、`POST /api/node-hub/reality-keypair`
- `GET|POST /api/node-hub/machines`、`GET|PUT|DELETE /api/node-hub/machines/:id`、`POST /api/node-hub/machines/:id/reset-token`（返回安装命令）
- `GET|POST /api/node-hub/nodes`、`GET|PUT|DELETE /api/node-hub/nodes/:id`（字段：machineId、name、protocol、host、serverPort、settings、inboundType、region、enabled…）
- `POST /api/node-hub/sync`：立即全量同步授权
- `PUT /api/users/:id/node-speed-limit {speedLimitMbps}`（null 取消覆盖）

管理端侧边栏「Node Hub」（`/node-hub`）提供这些 API 的界面：概览（在线情况、需要处理的问题、同步用户授权）、机器（新建后显示安装命令，详情里可改设置、看 24 小时负载、重置 token、删除）、节点（按协议的配置表单，含传输、TLS/REALITY 和密钥生成、证书、高级 JSON）和用户限速。hub 节点同时继续出现在入站管理、线路组和监控页面。没有配置 node-hub 时，`GET /api/node-hub/overview` 返回 `{ configured: false }`，页面显示配置说明。

## 部署

1. 在同一台服务器上运行 `npm run start:hub`（或 pm2/systemd），环境变量见 `.env.example` 的 node-hub 段。`NODE_HUB_DATABASE_URL` 指向本站数据库（node-hub 需要写 `xui_daily_traffic`）。
2. 反向代理只把 `/api/v1/server/` 和 `/api/v2/server/` 转发到 `127.0.0.1:3003`，绝不暴露 `/internal/`；`/api/v2/server/ws` 要允许 WebSocket 升级（nginx：`proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_read_timeout 120s;`）。`NODE_HUB_PUBLIC_URL` 设为这个 HTTPS 地址。
3. 本站设置 `NODE_HUB_URL=http://127.0.0.1:3003` 和相同的 `NODE_HUB_INTERNAL_TOKEN`，重启。
4. 创建机器（`POST /api/node-hub/machines`），在 VPS 上执行返回的 `installCommand`（machine 模式，每台机器独立 token）。
5. 创建节点，加入线路组，运行同步任务「node-hub 授权同步」。

## 从 3x-ui 迁移一台 VPS

```bash
npm run migrate:xui-to-hub -- --node-guid <3x-ui 节点 guid 或 local>             # 只打印计划
npm run migrate:xui-to-hub -- --node-guid <guid> --apply                         # 创建机器和同端口节点，写入用户 uuid，打印安装命令
# 在 VPS 上停止 3x-ui 的 xray（或换端口），执行安装命令，确认节点上线
npm run migrate:xui-to-hub -- --node-guid <guid> --switch-line-groups            # 线路组里的 3x-ui key 换成 hub key
# 运行同步任务「node-hub 授权同步」，用户更新订阅
```

- 端口、协议、REALITY 私钥/公钥、第一个 shortId 和 serverName、flow、ws/grpc/xhttp/httpupgrade 传输保持不变；VLESS/VMess 用户沿用原 uuid。计划会列出三类用户：本次写入 3x-ui uuid 的、已经以 3x-ui uuid 在 hub 上的、hub uuid 与 3x-ui 不一致的（脚本不覆盖 hub 已在使用的凭据，这些用户需要更新订阅）。
- Trojan 和 Shadowsocks 的密码由 node-hub 根据 uuid 生成，用户需要更新订阅。
- TLS（非 REALITY）证书不会迁移，需要在节点 settings 中配置 `cert_config`。
- 个人定制入站用户会被列出，切换后在用户页重新分配新的 hub 入站 id。
- 每次迁移一台，确认流量、在线、计费正常后再迁移下一台；3x-ui 回退只需把线路组 key 改回。

## 实时推送（WebSocket）

xboard-node 启动时调 handshake；`NODE_HUB_PUBLIC_URL` 已设置且 `NODE_HUB_WEBSOCKET` 不为 `false` 时，node-hub 返回 `ws_url`（`wss://<公开地址>/api/v2/server/ws`），机器用自己的 token 建一条长连接，之后不再轮询配置和用户。协议与 Xboard 的 Workerman 服务一致：

| 方向 | 事件 | 什么时候 |
| --- | --- | --- |
| hub → 机器 | `auth.success` / `error` | 连接时；token 重置、机器停用或删除时发 `error` 并断开 |
| hub → 机器 | `sync.nodes` | 连接时、机器上的节点增删或启停时（机器立即重新发现节点） |
| hub → 节点 | `sync.config` | 连接时、节点配置变化时 |
| hub → 节点 | `sync.users` | 连接时、该节点的用户、限速、设备数变化时 |
| hub → 节点 | `sync.user.delta` | 节点最后一个用户被移除时：机器模式发 `resync` 让节点立即用 REST 对账（xboard-node 的机器信箱会丢掉被清空的列表），单节点模式发 `remove` |
| hub → 节点 | `sync.devices` | 各节点上报的在线 IP 汇总变化时 |
| hub → 机器 | `ping` | 每 30 秒；90 秒没有任何消息的连接被断开 |
| 机器 → hub | `report.devices`、`pong` | 节点的在线 IP，心跳 |

- 每条连接记住每个节点最后收到内容的哈希，只推有变化的部分；管理写操作后 200 ms 合并推送一次，另外每 30 秒全量对账一次兜底。
- 流量、在线、机器负载仍走 REST 上报，计费不依赖推送通道。推送断开时节点自动退回 REST 轮询，并按退避重连。
- 管理端「Node Hub」的机器列表显示每台机器是「实时推送」还是「轮询」。
- 实测（`npm run e2e:hub`，轮询拉长到 300 秒）：流量耗尽踢人 3 ms、恢复 4 ms、停用节点后机器停掉节点 1 s；纯轮询模式分别取决于拉取间隔。

## 已知限制

- 节点停用或删除后，xboard-node 会等现有连接结束再释放端口（最长约 5 分钟）。这段时间内不要在同一端口重新创建或启用节点。
- 推送连接时变化即时生效；只用轮询（没有 `NODE_HUB_PUBLIC_URL`、反向代理不支持 WebSocket、或推送断开）时，机器的节点列表和用户最多每 60 秒刷新一次。
- xboard-node 的机器模式只在启动时 handshake 一次：已经在跑的机器要重启 xboard-node（`systemctl restart xboard-node`）才会切到推送。
- 限速按节点生效；全局设备数只在 sing-box 内核上生效，xray 内核按单节点计算。
- 3x-ui 中多个 shortId / serverName 只保留第一个。

## 本地验证

```bash
npm run test:hub        # 单元 + 节点协议 + 迁移脚本 + 本站集成（只用 hub、hub 与 mock 3x-ui 共存），需要 TEST_DATABASE_URL
npm run verify          # 完整验证，包含 test:hub
# 真实二进制端到端（可选）：自行编译 xboard-node 和 xray
TEST_DATABASE_URL=... XBOARD_NODE_BIN=/path/xboard-node XRAY_BIN=/path/xray npm run e2e:hub
```

`e2e:hub` 会在本机启动 hub、本站（只用 hub）、真实 xboard-node（machine 模式）和 xray 客户端，创建 VLESS、VLESS REALITY Vision、SS2022 三个节点，下载文件并检查：计费误差 < 5%、在线状态、8 Mbps 限速、2 倍率计费、流量耗尽后连接被拒、恢复、停用节点后节点停止。
