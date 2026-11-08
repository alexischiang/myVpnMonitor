# node-hub：用本站控制每台 VPS 上的 xboard-node

node-hub 让本站直接管理部署在每台 VPS 上的 [xboard-node](https://github.com/cedar2025/xboard-node)（安装和升级都用 fork `alexischiang/nexora-node`：在上游 v1.13 上修复了「无用户启动后收不到用户」，见下文已知限制），是本站唯一的自研线路后端（3x-ui 已于 2026-11-04 移除）。xboard-node 使用 Xboard 的原生节点 API，无需二次开发。

## 架构

```
用户 / 管理后台 ──> server.js（本站） ──loopback + Bearer──> node-hub（node-hub/server.js，默认 127.0.0.1:3003）
                                                               │  同一个 PostgreSQL：nh_* 表 + xui_daily_traffic
VPS: xboard-node (machine 模式) ──HTTPS /api/v1|v2/server/*──> 反向代理 ──> node-hub
                               <══WSS /api/v2/server/ws（推送）═══
```

- node-hub 是独立进程，只做三件事：对 xboard-node 提供 Xboard 节点 API（handshake、config、user、report、machine/nodes、machine/status，ETag/304）；通过 WebSocket 把变化实时推给 xboard-node（`node-hub/push.js`，见下节）；对本站提供 `/internal/*` 管理 API（仅 loopback + `NODE_HUB_INTERNAL_TOKEN`）。
- 授权由本站计算：每个用户 `{userKey, uuid, planId, nodeIds, speedLimit, deviceLimit, enabled}`，每 60 秒全量同步（同步任务「node-hub 授权同步」，兜底到期等没有事件的变化），开通、续费、套餐变更、流量耗尽、个人定制入站变更时立即同步单个用户。node-hub 收到后立刻推给已连接的机器。
- 流量：xboard-node 每次上报的是每用户增量；node-hub 在一个事务里按 report id 去重后累加到本站的 `xui_daily_traffic`（中国日期，每个节点一个计费键 `node_guid = hub-m<机器id>-n<节点id>`）。所以加权计费、日流量图、节点盈利分析都沿用原逻辑（按机器统计的地方把节点键归到机器，见「已知限制」里的流量倍率）。上报失败时节点会自己回滚重报，不会丢流量。
- 在本站里，hub 节点以入站形式出现：key `hub-m<机器id>:<节点id>`，入站 id `1000000000 + 节点id`（远高于原 3x-ui 入站 id，用户上残留的旧 id 不会指到 hub 节点）。线路组、入站设置（地区、网络等级、套餐/定制）、启用停用、个人定制入站、在线状态、节点监控都直接可用。
- 线路组可以打开「包含全部节点」（`includeAllNodes`）：不存节点列表，读取和计算授权时按当前节点表展开为全部套餐节点（`lineGroupInboundKeys`），定制节点除外。新建的套餐节点最迟在下一次「node-hub 授权同步」（60 秒）推给这个组的用户。
- 订阅：`/sub/<token>` 用用户有权使用的 hub 节点生成 Clash 配置，再交给 subconverter。

## 配置与计费

需要 `NODE_HUB_URL`、`NODE_HUB_INTERNAL_TOKEN` 和 `SUB_CONVERTER_URL`；没有配置时自研线路不可用（开通报错，Node Hub 页显示配置说明）。计费由同步任务「node-hub 流量计费」完成，紧接着推送授权。计费状态（每用户账本、节点倍率）存在 `app_records` 的 `xuiBilling/state`；原 3x-ui 服务把它存在 `xui_state.billing`，启动时若那份更新，会一次性复制过来（`database.js` 初始化）。

## 功能说明

| 功能 | node-hub |
| --- | --- |
| Client 开通、续费、停用 | `enabled` 授权；停用用户会从节点用户列表移除，节点下次拉取（≤ pull_interval）即断开 |
| 每用户流量统计、加权计费、流量耗尽停用 | 节点增量上报 → `xui_daily_traffic` → 原有加权账本；耗尽后自动停用 |
| 赠送流量、重置流量、流量包、流量附加服务 | 立即同步该用户的 hub 授权（耗尽的用户马上恢复），hub 同步失败即操作失败 |
| 每日流量、按节点流量、盈利分析 | 同一张表，`hub-m<id>` 作为节点 guid |
| 在线用户、在线 IP 数 | `alive` / `online` 上报 → presence，合并进 `/api/xui-presence` 和用户的 connectedIpCount |
| 设备数限制 | `device_limit`（套餐 deviceLimit）；推送连接时各节点上报在线 IP，node-hub 汇总后下发 `sync.devices`，sing-box 内核按全局设备数限制，xray 内核按单节点 |
| 限速 | `speed_limit`（Mbps）：用户覆盖值 `PUT /api/users/:id/node-speed-limit`，否则用套餐 `speedLimitMbps` |
| 入站启停、入站设置、线路组 | 同一套页面与 API，hub 入站可直接加入线路组 |
| 个人定制入站 | 同一套 API，hub 入站 id 可直接分配 |
| 节点监控、VPS 成本 | 机器在线状态、CPU/内存/磁盘/负载、在线人数来自 machine/status；VPS 月度成本在机器详情里设置（`PUT /api/sales-traffic/nodes/hub-m<id>/cost`），盈利分析按它计算 |
| 订阅 | hub 节点生成 ClashMeta 代理（vless/vmess/trojan/ss/hysteria2/tuic/anytls） |
| REALITY 密钥 | `/api/node-hub/reality-keypair` 生成 |

## 管理 API（管理员登录后）

- `GET /api/node-hub/overview`、`POST /api/node-hub/reality-keypair`
- `GET|POST /api/node-hub/machines`、`GET|PUT|DELETE /api/node-hub/machines/:id`、`POST /api/node-hub/machines/:id/reset-token`（返回安装命令）
- `GET|POST /api/node-hub/nodes`、`GET|PUT|DELETE /api/node-hub/nodes/:id`（字段：machineId、name、protocol、host、serverPort、settings、inboundType、region、enabled…）
- `GET|POST /api/node-hub/relays`、`GET|PUT|DELETE /api/node-hub/relays/:id`、`POST /api/node-hub/relays/:id/reset-token`（返回安装命令）；节点的 `relayIds` 决定它经过哪些中转机
- `POST /api/node-hub/sync`：立即全量同步授权
- `PUT /api/users/:id/node-speed-limit {speedLimitMbps}`（null 取消覆盖）

管理端侧边栏「Node Hub」（`/node-hub`）提供这些 API 的界面：概览（在线情况、需要处理的问题、同步用户授权）、机器（新建后显示安装命令，详情里可改设置、看 24 小时负载、重置 token、删除）、节点（按协议的配置表单，含传输、TLS/REALITY 和密钥生成、证书、高级 JSON）和用户限速。hub 节点同时出现在入站管理和线路组页面；原 3x-ui 监控页（`/xui-monitor`）已并入「机器」标签。没有配置 node-hub 时，`GET /api/node-hub/overview` 返回 `{ configured: false }`，页面显示配置说明。

## 部署

1. 在同一台服务器上运行 `npm run start:hub`（或 pm2/systemd），环境变量见 `.env.example` 的 node-hub 段。`NODE_HUB_DATABASE_URL` 指向本站数据库（node-hub 需要写 `xui_daily_traffic`）。
2. 反向代理只把 `/api/v1/server/` 和 `/api/v2/server/` 转发到 `127.0.0.1:3003`，绝不暴露 `/internal/`；`/api/v2/server/ws` 要允许 WebSocket 升级（nginx：`proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_read_timeout 120s;`）。`NODE_HUB_PUBLIC_URL` 设为这个 HTTPS 地址。
3. 本站设置 `NODE_HUB_URL=http://127.0.0.1:3003` 和相同的 `NODE_HUB_INTERNAL_TOKEN`，重启。
4. 创建机器（`POST /api/node-hub/machines`），在 VPS 上执行返回的 `installCommand`（machine 模式，每台机器独立 token，固定 `--kernel xray` 和 `--version v1.13.2`：从这个版本起 xray 内核会断开被移除用户已打开的连接，见「已知限制」；已装的机器重新执行一次安装命令即升级）。machine 模式下 xboard-node 只按机器 `config.yml` 的 `kernel.type` 选内核，节点的 `kernel_type` 不生效；安装脚本默认 sing-box，而 sing-box 不处理 PROXY protocol，经中转的节点会握手失败。旧命令装的机器把 `/etc/xboard-node/config.yml` 里的 `type: singbox` 改成 `type: xray` 后 `systemctl restart xboard-node`，日志出现 `accepting PROXY protocol` 即生效（2026-11-03 bage-hk 照此修复）。
5. 创建节点，加入线路组，运行同步任务「node-hub 授权同步」。

## 中转机（入口机 → 落地机）

中转机是一台运行 realm 的 VPS：每个（节点，中转机）入口占中转机上的一个端口，原样转发到节点所在机器的地址和端口，并带上 PROXY protocol v2 头，让落地节点拿到用户真实 IP。中转机不解密流量，流量、在线、计费都记在落地节点上。

- 管理端「Node Hub → 中转机」：新建（名称、公网地址）后得到安装命令 `curl -fsSL <NODE_HUB_PUBLIC_URL>/api/v1/server/relay/install.sh | sudo bash -s -- --hub <公开地址> --relay-id <id> --token <token>`。脚本（`node-hub/relay-install.sh`，由 node-hub 直接提供）安装 realm（`/usr/local/bin/realm`，版本见脚本 `REALM_VERSION`）、`realm.service` 和 `nexora-relay-sync.timer`：每 30 秒从 `/api/v1/server/relay/config` 拉取 realm 规则写入 `/etc/realm/config.toml`，有变化就重启 realm，没有规则时停掉 realm，并上报 realm 状态和已应用规则的哈希。再次执行即原地升级、替换凭据；`--uninstall` 卸载。
- 节点表单「接入方式」：直连 / 经中转机（勾选一台或多台）。经中转时自动开启「接受 PROXY protocol」并使用 Xray 内核；每台中转机从 61001 起分配一个空闲端口（保留已有端口，释放的端口会复用）；节点所在机器必须填写地址。订阅里每个入口一个条目（中转机地址和端口），不再有直连条目；条目名就是节点名，只有同时经过多台启用的中转机时才写成「节点名 · 中转机名」（Clash 要求节点名唯一，主站和 subconverter 不去重）。改回直连会清空入口并关闭 PROXY protocol。
- 规则只包含启用的节点和启用的机器；停用的中转机从订阅里移除，并在下次同步时拿到空规则、停掉 realm。仍有节点经过的中转机不能删除。
- 中转机列表显示在线（90 秒内拉取过）、realm 是否运行、规则是否已同步（上报的哈希等于当前规则）。
- 只在必要时打断连接：编辑节点时 `nodeRuntimeChanged`（`node-hub/node-config.js`）比较改前改后的「运行指纹」（是否启用、`buildNodeConfig` 下发的内核配置、经过的中转机），只改名称、地区、网络级别、排序、入站类型时不触发推送。推送里的节点列表哈希只算 id 和协议并按 id 排序，改名、改排序不会发 `sync.nodes`；realm 规则文件只由 `realmRules`（`node-hub/relay.js`：中转机是否启用、每个监听端口转发到哪里）生成，注释只写 id，所以改节点名、中转机名、备注或中转机公网地址都不会改变文件，中转机也就不会重启 realm；`realmRulesChanged` 判断一次编辑是否改变规则，保存中转机时随响应返回 `rulesChanged`（后台提示据此说明是否会同步），中转机编辑本身不触发对机器的推送。xboard-node 收到配置后自己也按哈希判断，配置或用户列表变化时 xray 才整体重启。
- 不经过中转机管理、手动配的 realm 也能用：节点手动打开「接受 PROXY protocol」，连接地址填入口机，realm 配置 `send_proxy = true`、`send_proxy_version = 2`。sing-box 内核不处理 PROXY protocol（xboard-node 里这段被注释），所以 hub 拒绝在非 Xray 内核上开启。

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
- 流量倍率按节点计（计费键 `hub-m<机器 id>-n<节点 id>`，node-hub 的 `nodeBillingKey`，概览节点的 `billingKey`；`guid = hub-m<机器 id>` 仍是入站 key、在线状态和 VPS 成本用的机器键，线路组不受影响）。在「Node Hub → 节点」新建或编辑时填写，默认 1：本站转发请求时取出 `multiplier`、校验 0–100、在节点存在后写进计费状态（`setNodeMultiplier`），读取节点、节点列表和概览时附上当前倍率；node-hub 本身不存倍率。机器没有倍率：机器表单没有这个字段，`/api/xui-monitor` 的机器行 `multiplier` 为 null；VPS 成本在机器详情里设置。修改后下一次计费同步按新倍率重算本计费周期已用流量。VPS 成本、盈利分析、今日节点流量、流量时段图和账户节点用量都用 `billingMachineGuid` 把节点键归到机器；用户的流量明细里每个节点一行，名为「机器 · 节点」。同一台落地机经两台中转机按不同倍率计费时，把节点拆成两个（不同端口、各挂一台中转机），分别设倍率。
- 从机器倍率迁移（`migrateHubMachineMultipliers`，第一次计费同步或 Node Hub 请求时执行一次，计费状态记 `hubNodeMultipliersAt`，node-hub 不可达时下次重试）：倍率不是 1 的机器，把倍率写给它的每个节点。旧机器键 `hub-m<机器 id>` 的倍率保留但不能再改，只用来给升级前记在机器键下的流量计价，这些流量离开计费周期后就不再参与计费。
- 节点在没有任何授权用户时创建，xboard-node（v1.13）不启动内核；之后推送来的用户（`sync.users`、`add` 增量、只有用户变化的 REST 重新拉取）都会被 `ensureRunning()` 丢掉，因为它检查的 `lastUsers` 要等内核启动后才写入。节点会一直显示「内核未运行」，直到 `systemctl restart xboard-node`。fork `alexischiang/nexora-node` 已修复（内核空闲时先记下推送来的用户再启动内核），hub 的安装命令默认从 fork 安装；仍在用上游二进制的机器，先把节点加入线路组、确认有用户授权，再执行安装命令或重启 xboard-node。
- 流量耗尽或到期的用户，已经建立的连接要靠 xboard-node 主动断开。xray 内核从 UserManager 移除用户只拒绝新连接；fork v1.13.1 的 `CloseUserConnections` 是空操作，所以旧连接会一直跑（2026-11-03 实测，`npm run e2e:hub`：REALITY Vision 节点上持续下载的连接在新连接被拒后 10 秒内又传了 3.26 MB，速率不变，没有断开）。fork v1.13.2 已修复（PR [alexischiang/nexora-node#1](https://github.com/alexischiang/nexora-node/pull/1)，`internal/kernel/xray`：dispatcher 按用户登记每条连接，`RemoveUsers`/`UpdateUsers` 移除用户时取消其上下文并中断 link，含重启回退和最后一个用户被移除时的 Stop）。用发布的 v1.13.2 实测：推送模式下这条连接在新连接被拒的同时停止（之后 0 字节，客户端约 0.7 s 内收到断开）；修复构建在 REST 轮询模式下同样 0 字节。安装命令固定 `--version v1.13.2`；还在跑 v1.13.1 或更早版本的机器要重新执行安装命令升级，否则旧连接仍会继续用流量，直到客户端自己断开。到期与耗尽走同一条移除路径。sing-box 内核本来就会断开。
- REALITY 伪装域名不要用 `www.microsoft.com`：xray 和 sing-box 内核下合法连接都会以 `REALITY: processed invalid connection ... handshake did not complete successfully` 失败（2026-10-31 在新加坡测试节点上复现，换成 3x-ui 节点使用的伪装域名后立即连通）。新建节点表单不再预填它。

## 本地验证

```bash
npm run test:hub        # 单元 + 节点协议 + 本站集成，需要 TEST_DATABASE_URL
npm run verify          # 完整验证，包含 test:hub
# 真实二进制端到端（可选）：自行编译 xboard-node 和 xray
TEST_DATABASE_URL=... XBOARD_NODE_BIN=/path/xboard-node XRAY_BIN=/path/xray npm run e2e:hub
```

`e2e:hub` 会在本机启动 hub、本站（只用 hub）、真实 xboard-node（machine 模式）和 xray 客户端，创建 VLESS、VLESS REALITY Vision、SS2022 三个节点和两个用户（第二个用户始终有效，让节点在第一个用户被移除时保持运行，和生产一样走热移除），下载文件并检查：计费误差 < 5%、在线状态、8 Mbps 限速、2 倍率计费、流量耗尽后新连接被拒且已打开的下载在 10 秒内被断开、恢复、停用节点后节点停止。已打开连接这一项需要 fork v1.13.2 或更新的 xboard-node（见「已知限制」），用 v1.13.1 会失败。

Windows 上没有 Linux 环境时，可以用 Docker 跑：`postgres:16` 容器做 `TEST_DATABASE_URL`，在 `node:24-bookworm` 容器里下载 xboard-node 和 xray 的 Linux 发行版二进制后执行 `npm run e2e:hub`；fork 用 `golang:1.26-bookworm` 编译（`CGO_ENABLED=0`，标签同 Makefile）。
