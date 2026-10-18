# Arc UI 组件替换规范

本文件是把 `src/components/ui/`（shadcn）替换为 [Arc UI](https://uiarc.dev/) 免费组件时的唯一依据。替换任何组件前先读本文件；与本文件冲突时，以用户最新的明确指示为准，并同步更新本文件。

状态：迁移已完成。第 7 节是完成情况和保留项，第 6 节是实际做过的源码扩展，第 8 节是模糊处的决策。

## 1. 总则

1. **页面大框架优先套用 Arc blocks**。这条优先于组件级的规则：先看第 3 节有没有可套用的 block，没有再用组件拼。
2. **能用 Arc 实现的都用 Arc 实现**，Arc 没有的属性通过扩展安装后的源码解决（见 1.3）。
3. **保留旧实现以便回退**（见 1.4）。
4. 全部页面都迁移：登录注册、用户端、公开页面、管理端。全部在 `main` 分支完成。
5. 只改组件层，不改业务逻辑、接口和文案含义。

### 1.1 Arc 基本事实

- 来源：`https://uiarc.dev/r/{name}.json`，用 shadcn CLI 安装；免费组件为 MIT 许可。只使用免费（free）条目，Pro 条目不得使用，也不得仿写其源码。
- 安装位置：`src/components/arc/<name>/<name>.tsx` 加同名 `.module.css`；blocks 在 `src/components/arc/blocks/<name>/`。
- 样式：CSS Modules 加 Arc 自有 CSS 变量，不使用 Tailwind 类。布局仍可用 Tailwind。
- 依赖：几乎所有组件依赖 `motion`（项目尚未安装），部分依赖 Radix 和 `lucide-react`（已有）。
- 部分 block 引用了 `next/image`（如 `site-header`），本项目是 Vite，安装后要改成普通 `img`。
- 查 API 的顺序：`https://uiarc.dev/components/<name>/markdown`，其次 `https://uiarc.dev/r/catalog.json`，最后是安装后的源码。

### 1.2 主题与 Token

- 安装 `arc-foundation`，以 Arc 变量为唯一来源。
- `src/styles.css` 里 Tailwind 的语义色改为指向 Arc 变量，旧 Token 名全部保留定义，保证未迁移的页面和旧组件继续可用。
- 两边有 9 个同名变量：`--background`、`--foreground`、`--border`、`--accent`、`--accent-foreground`、`--series-1` 至 `--series-4`。`--accent` 语义不同（旧：悬停底色；Arc：品牌主色），Tailwind 的 `accent` 色要改指向 Arc 的弱化表面色，不能直接沿用同名变量。
- 深色模式：`next-themes` 同时写入 `.dark` 类和 `data-theme` 属性。
- 焦点：采用 Arc 的规则，鼠标聚焦不显示焦点环，键盘聚焦显示。

### 1.3 源码扩展约定

- 需要 Arc 没有的属性时，直接改 `src/components/arc/` 下的源码。
- 改动处加一行注释说明扩展了什么，并登记到第 6 节的扩展清单；重新从 registry 安装会覆盖扩展，安装前先查清单。
- 所有面向用户的内置英文文案改成中文：有 `messages` 或 label 类属性的通过属性传入，没有的改源码。

### 1.4 回退约定

- `src/components/ui/` 下的文件在迁移期间不删除、不改行为。
- 被 Arc 版本取代的共享业务组件（如 `data-table.tsx`、`app-sidebar.tsx`）保留原文件，Arc 版本另建新文件。
- 页面回退靠 git：每个迁移的功能点是独立的一组改动，提交时不与其它功能点混在一起。
- `AGENTS.md` 和 `docs/agent/ui-rules.md` 在迁移开始时改为以 Arc 为准，同时保留旧 shadcn 规则作为「回退路径」一节。

## 2. 组件映射

用量指 `src` 下的 JSX 使用次数。

### 2.1 可近似直接替换

| 本地 | Arc | 注意 |
|---|---|---|
| `tabs` | `tabs` | 导出同名。本地 `variant="line"`（1 处）无对应 |
| `popover` | `popover` | 导出 `Popover/PopoverTrigger/PopoverContent/PopoverClose` |

### 2.2 Button

| 场景 | Arc | 属性 |
|---|---|---|
| 普通按钮 | `button` | `variant`: `primary/secondary/ghost/danger`；`size`: `sm/md/lg`；`loading` |
| 带异步动作的按钮，包括表单提交按钮 | `action-button` | `label`、`pendingLabel`、`successLabel`、`onAction`（返回 Promise）、`onActionError`、`resetAfterMs` |
| 复制按钮 | `copy-button` | `value`、`label`、`iconOnly`、`variant`: `outline/plain`、`onCopied` |

variant 对应：默认对应 `primary`；`outline`（89）和 `secondary` 对应 `secondary`；`ghost`（24）对应 `ghost`；`destructive`（12）对应 `danger`。

需要扩展源码的部分：

- `button` 增加 `link`（11）、`orange`（7）、`success`（1）三种 variant 和图标尺寸（`icon`、`icon-sm`）。
- `button` 增加 `asChild`（39 处，多为链接样式的按钮）。
- `action-button` 的状态由 `onAction` 内部驱动，而现有表单用 `onSubmit`。表单提交按钮的接法：`type="submit"` 时由表单的提交 Promise 驱动状态。具体做法实现时验证。

### 2.3 Input

Arc 的输入类组件 `label` 必填，并内置 `description` 和 `error`，因此不再需要外层的 `Field`、`Label`、`FieldError`。

| 场景（本地用量） | Arc | 要点 |
|---|---|---|
| 普通文本、邮箱、URL | `input` | `label`、`description`、`error`，其余同原生 input |
| 数字（`type="number"` 46 处） | `number-field` | `value` 是 `number`；`min/max/step`、`prefix/suffix`、`formatOptions`；没有 `name` 属性。空值见 5.2 |
| 金额 | `money-input` | 值是最小货币单位的整数（分）。本项目金额以元为单位，进出都要换算；`currencies={["CNY"]}`、`locale="zh-CN"` |
| 手机号 | `phone-input` | 项目目前没有手机号输入 |
| 登录密码、确认密码 | `password-field` | `label`、`description`、`messages` |
| 新建密码 | `password-strength` | 见下 |
| 搜索框 | `search-field` | 必须受控：`value`、`onValueChange` |
| 多行文本 | `textarea` | 同 `input` |

新建密码统一使用 `password-strength`，共三处：注册和重置密码（`auth-pages.tsx`）、修改密码（`account-pages.tsx`）。

- 只显示长度一条规则，与后端一致（`server.js` 的密码校验：8 至 128 位）。
- 用 `createPasswordRules({ minLength: 8, labels })` 生成后只保留 `id` 为 `length` 的规则，`shortLength={8}`。不使用 Arc 默认规则（默认 12 位并要求大小写、数字、符号）。
- `messages`、规则标签、强度等级全部传中文。

### 2.4 Field

- 输入类组件改用 Arc 内置的 `label`、`description`、`error`，这部分 `Field` 自然消失。
- 剩余用法（`FieldGroup`、`FieldSet` 的分组布局，包裹自定义控件的横向排列）保留一个本地轻量布局组件，样式改用 Arc 变量。
- `contact-section` 是营销站的「联系我们」整块，不用于改写 `Field`。

### 2.5 卡片

| 场景 | Arc | 要点 |
|---|---|---|
| 数据卡片（值是纯数字） | `metric-card` | `label`、`value`（`number`）、`suffix`、`context`（必填）、`change` |
| 非数据卡片（表单区块、设置面板等通用容器，112 处） | `card` | `title`（必填）、`description`、`action`，正文放 children。对应本地的 `CardHeader` 加 `CardContent` |
| 可展开的摘要卡片 | `expandable-card` | `title`、`description`、children |

需要扩展或验证的部分：

- `metric-card` 没有前缀（如 `¥`）、操作按钮插槽，`value` 不接受字符串或日期。金额、日期、状态文字类的数据卡片需要扩展源码，实现时验证。
- `card` 没有页脚插槽，`CardFooter`（24 处）的内容放进 children；没有标题的卡片需要把 `title` 扩展为可选。
- 现有数据卡片实现：`BentoStatCard` 和 `Metric`（`account-pages.tsx`）。

### 2.6 Item

66 处 `Item` 分布在 19 个文件，只有 3 处可点击。按用途找最接近的 Arc 免费组件：

| 用途 | Arc | 例子 |
|---|---|---|
| 单选的选项组 | `radio-cards` | 计费周期（`public-pages.tsx`）、支付方式（`online-payment.tsx`）、分类切换（`category-pills.tsx`） |
| 统计格（说明加数字） | `metric-card` | `account-node-status.tsx` 顶部三格 |
| 带标题和说明的步骤或说明行 | `stepper`（`orientation="vertical"`、`details="all"`） | `account-onboarding.tsx` 的邀请步骤 |
| 按时间排列的记录、日志 | `timeline`（`events[{id,at,title,meta,detail,tone}]`） | `sync-jobs.tsx`、`xui-logs.tsx`、工单消息 |
| 带头像或图标、标题、说明、操作的信息行 | `card`（`avatar`、`title`、`description`、`meta`、`status`、`action`） | 节点行、订单移动端条目 |

`radio-cards` 属性：`options[{value,label,description,meta,icon,disabled,disabledReason}]`、`value`、`onValueChange`、`layout`: `grid/list`、`name`。以上对应是默认方案，每处实现时按实际内容选择并验证。

### 2.7 表格、图表、提示

| 本地（用量） | Arc | 要点 |
|---|---|---|
| `table`（26）和 TanStack `DataTable` | `sortable-data-table`，配 `filter-toolbar`、`pagination`、`empty-state` | `rows`、`columns[{key,label,sortable,render,numeric,width}]`、`rowKey`、`selectable`。排序在客户端；服务端分页用 `pagination` 受控。旧的 `data-table.tsx` 保留 |
| `chart`（recharts，3 个文件） | `line-chart`、`bar-chart`、`donut-chart` | 数据结构不同，图表重做。Arc 没有对应图表类型时保留 recharts |
| `sonner`（119 次调用，21 个文件） | `toast-stack` | 根部放 `ToastStackProvider` 和 `ToastStack`；组件内用 `useToastStack()` 的 `toast({ type, title, description })`。现有调用全部在组件内，可以替换 |

### 2.8 其它组件

| 本地（用量） | Arc | 传参要点 |
|---|---|---|
| `alert-dialog`（16） | `dialog` | 使用普通 Dialog（确认/删除用 `features/confirm-dialog`）。按 Arc 自己的示例：操作按钮直接放在 body 里，右对齐 `flex flex-wrap justify-end gap-2`，不加额外上边距（body 已有内边距；前面有内容时由父级 gap 或 `mt-4` 隔开）；确认按钮用 `primary`，`danger` 只用于页面上触发删除的按钮 |
| `dialog`（20） | `dialog` | `<DialogContent title description>`，`title` 必填，没有 Header/Footer 子组件 |
| `progress`（9） | `progress`；流量配额用 `usage-meter` | `progress`: `value`、`max`、`label`、`showValue`。`usage-meter`: `label`、`segments[{id,label,value}]`、`limit`、`unit`、`decimals`、`freeLabel`、`overLabel`、`warnAt`。不限流量见 5.1 |
| `select`（50） | `select`；长列表用 `combobox` | `label` 必填，`options[{value,label,disabled}]`，选项只能是纯文本 |
| `skeleton`（50） | `skeleton` | `lines`、`avatar`、`loading`，包裹真实内容 |
| `alert`（约 40） | `alert` | `tone`: `info/success/warning/danger`，`title` 必填。本地 `destructive` 和 `error` 对应 `danger` |
| `badge`（约 65） | `badge` | `tone`: `neutral/success/info/warning/danger`。本地 `outline`（32）和 `secondary`（13）对应 `neutral` |
| `checkbox`（23） | `checkbox` | 内置 `label`、`description` |
| `switch`（15） | `switch` | 内置 `label` |
| `tooltip`（13） | `tooltip` | `<Tooltip content side>`，自带 Provider |
| `sheet`（4） | `drawer` | `<DrawerContent title description side>` |
| `avatar`（6） | `avatar` / `avatar-group` | `name`、`src`、`size`、`status` |
| `calendar`（3） | `calendar`；范围选择用 `date-range-picker` | `calendar` 只支持单日、受控 |
| `carousel`（3） | `carousel` | 子元素即幻灯片，`label` 必填 |
| `radio-group`（2） | `radio-group` 或 `radio-cards` | `options` 数组，必须受控 |
| `accordion`（1） | `accordion` | `items[{title,content}]`，只支持单项展开 |
| `breadcrumb`（1） | `breadcrumb` | `items[{label,href,onClick}]`；站内跳转通过 `ArcProvider link={Link}` 接入 react-router |
| `slider`（1） | `slider` | `label` 必填 |
| `toggle-group`（1） | `segmented-control` | 默认导出，必须受控，只支持单选 |
| `dropdown-menu`（5） | `dropdown-menu`；账户菜单用 `user-menu` | `label` 加 `items[...]`，触发按钮内置。勾选项（1 个文件在用）需要扩展源码 |
| `bubble` / `message` | `chat-thread` | 完整聊天组件，父容器需固定高度 |
| `label`（28）、`separator`（25） | 无 | 标签并入输入组件；分隔线用 Arc 的边框变量 |

## 3. 页面框架与 blocks

### 3.1 外壳

| 范围 | 方案 |
|---|---|
| 管理端（`/` 下各路由） | 保留本地 `Sidebar` 和 `AppSidebar` |
| 用户端（`/account` 下各路由） | 用 `site-header` 改写，分组见 3.2；底部为 `site-footer` 的 `minimal` 样式（`contained`） |
| 公开页面（`/pricing`、`/buy`） | `site-header` 加 `site-footer` |

### 3.2 用户端导航分组

使用 `site-header` 的 `mega` 变体：顶层 5 项（无节点权限的用户 4 项），带子链接的展开为面板。

| 顶层 | 子链接 | 路由 |
|---|---|---|
| 总览 | 无 | `/account` |
| 购买服务 | 无 | `/account/plans` |
| 节点状态（仅有节点权限的用户显示） | 无 | `/account/nodes` |
| 账务 | 账户余额 | `/account/wallet` |
| | 订单记录 | `/account/orders` |
| | 邀请返利 | `/account/referrals` |
| 帮助 | 使用文档（外链，新标签页） | `DOCS_URL` |
| | 工单服务 | `/account/tickets` |

- 右侧放 `user-menu`：账户设置（`/account/settings`）、主题切换、退出登录。
- `current` 按路径前缀推导；子页面（如 `/account/orders/:id`、`/account/tickets/new`、`/account/plans/checkout`）归入所属分组。
- 需要扩展 `site-header` 源码：右侧增加放 `user-menu` 的插槽；去掉 `next/image`；`onNavigate` 接 react-router。
- `site-header` 的属性：`variant`、`brand{name,href,mark}`、`items[{value,label,href,links[{label,description,icon,href}]}]`、`current`、`onNavigate`、`primaryAction`、`secondaryAction`、`sticky`。

### 3.3 页面与 block 对应

下表是迁移前的计划；实际套用情况和没有套用的原因见第 7 节。

| 页面 | 套用的 block 或组件 |
|---|---|
| `/register` | `signup-form`（扩展：邀请码字段、注册模式、`password-strength`；去掉第三方登录） |
| `/login`、`/forgot-password`、`/reset-password` | 免费的登录 block（`sign-in`、`login-centered`）都是验证码或通行密钥流程，没有邮箱加密码的。以 `login-centered` 的卡片框架为底，步骤换成邮箱加 `password-field`。实现时验证 |
| `/pricing` | `site-header`、`plan-comparison`（已改为属性驱动，见第 6 节；目前只在测试路由 `/account/plans/compare` 使用）、`faq-section`、`site-footer` |
| 列表页（用户、订单、工单、账单、交付等） | `filter-toolbar`、`sortable-data-table`、`pagination`、`empty-state` |
| 详情页（用户详情、订单详情、工单详情） | `page-header`（该 block 不接收属性，数据要提成属性） |
| 工单对话 | `chat-thread` |
| `/onboarding` | `stepper` |
| 404 | `empty-state` |
| 总览、仪表盘、钱包、设置 | 对应的 block 都是 Pro，用 `metric-card`、图表、`card`、`tabs` 等组件拼 |
| `/cashier/:id`、`/buy`、支付结果、交付页 | 没有对应 block，用 `radio-cards`、`action-button`、`copy-button`、`card` 等组件拼 |

## 4. 执行规则

- 遵守 `AGENTS.md`：每次只迁移一个功能点，浏览器验证通过后再做下一个；每个功能点在 `feature_list.json` 登记并标 `"ui": true`。
- 迁移期间新旧组件并存，不做全局查找替换。
- 每个迁移的页面按 `docs/agent/ui-rules.md` 的浏览器验收门槛检查，浅色和深色主题都要看；涉及支付、钱包、账单、订阅交付的页面运行 `npm run verify`。
- 日期、金额、流量继续使用 `src/utils.ts` 里的共享格式化函数。

迁移顺序：

1. 基础：安装 `motion` 和 `arc-foundation`，完成 Token 映射和深色模式双属性，接入 `ToastStackProvider` 和 `ArcProvider`，更新 `AGENTS.md` 和 `ui-rules.md`。验收标准是现有页面仍可正常使用。
2. 登录注册页。
3. 用户端外壳（`site-header` 加 `user-menu`）。
4. 用户端各页面。
5. 公开页面。
6. 管理端各页面（侧边栏保留）。
7. 收尾：清点仍被引用的旧组件并列出，不删除。

## 5. 兼容规则

### 5.1 不限流量的套餐

`usage-meter` 的 `limit` 必填。不限流量的套餐按 9999 GB 的名义上限渲染（`account-pages.tsx` 的 `UNLIMITED_TRAFFIC_DISPLAY_GB`），有上限的套餐按实际配额渲染，单位都是 GB。用量未知时不渲染 `usage-meter`，只保留下方的文字。流量卡片没有标题行，标题和剩余量由 `usage-meter` 自己显示。

### 5.2 数字和金额输入

`number-field` 和 `money-input` 会把值夹在 `min`/`max` 之间、按 `step` 对齐，并且没有空值，所以只在不会改变提交值的情况下使用：

- 输入框的处理函数原本就是 `Number(event.target.value)`（留空本来就等于 0）才转换。
- 标签是数量类（数量、天数、排序、库存、档数、档位、次数、优先级、时长）且 `step`、`min` 为整数或未设置的，换成 `number-field`，`min` 沿用原值，未设置时为 0。
- 标签是价格类（价格、金额、月费、售价）的，换成 `money-input`：值以分为单位传入（`Math.round(元 * 100)`），回调里再除以 100 交还给原有逻辑，货币固定为 CNY。
- 其余数字输入保持 Arc `input` 加 `type="number"`：状态是字符串的、用 `nullableNumber` 表示「未填写」的、带小数步长的（流量 GB、倍率、比例等）。

## 6. 源码扩展清单

以下是对 `src/components/arc/` 源码实际做过的改动。重新从 registry 安装会覆盖它们，安装前先对照本表。

| 组件 | 扩展内容 |
|---|---|
| `button` | `link`、`success`、`orange` variant；`icon`、`icon-sm` 尺寸；`asChild` |
| `action-button` | `pending`（由外部驱动进行中状态，用于表单提交）、`onClick`、`variant`、`size`、`arrow`；`onAction` 改为可选；默认文案改中文 |
| `card` | `title`、`description` 改为可选且接受节点；`headerAction`；没有 `details` 时不做悬停抬起；正文外包一层带间距的容器 |
| `metric-card` | `prefix`、`decimals`、`locale`；`value` 可为 `null`（显示占位符）；`context` 可选；`action`；`className` |
| `dialog` | `size`（`md/lg/xl/full`）；关闭按钮文案 |
| `drawer` | `size`（`md/lg/xl`）；关闭按钮文案 |
| `input`、`textarea`、`select`、`password-field`、`search-field` | `hideLabel`（标签只对读屏可见） |
| `password-field` | `error`；默认文案改中文 |
| `password-strength` | 默认文案和规则标签改中文 |
| `dropdown-menu` | `trigger`（自定义触发元素）、`align` |
| `sortable-data-table` | `minWidth`（可选的最小宽度）；锁定列宽时按列测量不换行宽度与最窄宽度：内容放得下就铺满容器，略宽时长文本列先收窄换行（短值列保留，见 `KEEP_COLUMN`），收窄后仍放不下才横向滚动；手机布局的 `min-width` 用 `!important` 覆盖内联值；播报和标签文案改中文 |
| `progress`、`skeleton`、`alert`、`pagination`、`copy-button`、`toast-stack`、`user-menu` | 内置文案改中文 |
| `user-menu` | 去掉「跟随系统」主题选项（产品只有浅色和深色） |
| `lib/use-copy-feedback` | 改用应用自己的 `copyText`（微信内置浏览器拒绝 Clipboard API 时回退到选区复制） |
| `blocks/login-centered` | 去掉演示用的通行密钥、验证码、第三方登录步骤，只保留框架（环形背景、顶栏、卡片、状态行），表单由页面传入 |
| `blocks/site-header` | 去掉 `next/image`；`onNavigate` 存在时站内链接走前端路由；链接支持 `external`（新标签页）；`endSlot`；默认不显示演示按钮；文案改中文 |
| `button`（补充） | `orange-soft`、`orange-outline`、`orange-ghost`、`orange-link` variant |
| `metric-card`（补充） | `density="compact"`，用于固定行高的网格 |
| `sortable-data-table`（补充） | 列的 `header`（表头显示节点，如带说明气泡的标题） |
| `date-picker` | `hideLabel`；默认 `locale` 改为 `zh-CN`；文案改中文 |
| `calendar`、`date-range-picker`、`carousel`、`stepper`、`chat-thread`、`bar-chart`、`line-chart`、`donut-chart`、`number-field`、`money-input`、`usage-meter` | 内置文案改中文，日期类默认 `locale` 改为 `zh-CN` |
| `blocks/page-header` | 去掉演示用的滚动容器、标签页、议题面板和模拟操作，改为可传参的头部：`breadcrumbs`、`title`、`status`、`description`、`meta`、`actions` |
| `blocks/faq-section`、`blocks/site-footer` | 默认文案改中文 |
| `card`（补充） | 背景先读 `--card-surface`（缺省回落到 `--surface`），用户端外壳借此只在总览页（`[data-account-overview]`）把普通卡片设为浅灰，其它用户端页面保持默认白底，不影响共用的 `--surface` |
| `blocks/cta-section` | 新安装（只取 block 本身，`lib/media.ts` 沿用项目已有版本）；`bare`：banner 去掉自带的居中列和留白，放进页面已有的内容列；`onNavigate`：`/` 开头的 `href` 动作走前端路由；`compactAction`：banner 在窄宽度下保持一行，链接动作只显示箭头图标（文案保留给读屏）；关闭按钮读屏文案改中文 |
| `blocks/site-footer`（补充） | `contained`：内容收进与 `site-header` 相同的 1200px 列和左右留白（窄于 760px 时 16px），上边框仍通栏；传了 `onNavigate` 时站内链接（`/` 开头）走前端路由，不再整页刷新；`status.static` 把状态显示为纯文本（不渲染成无动作的按钮）；社交链接列表的读屏标签改中文；`minimal` 版式下 `tagline` 为空时版权行不再带多余的「. 」 |
| `button`、`badge`、`tabs`、`segmented-control`、`card` | 没有写尺寸类的图标按控件给定尺寸（按钮和标签页 16px，小号按钮 14px，徽标 12px，卡片标题 18px）；带 `size-*` 类的图标不受影响 |
| 控件尺寸（`src/styles.css`） | 鼠标设备下 `--control-height-sm/md/lg` 为 32/36/40px、`--radius-control` 为 14px；触屏保持 Arc 的 36/44/50px 和 18px |
| `card`（补充） | `fill`：卡片被网格行拉伸时内容区撑满高度，正文可以贴底 |
| `metric-card`（补充） | `style`（用于指定底色）；紧凑密度下数字用 `--text-2xl` |
| `blocks/cta-section`（补充） | `tone="warning"`（仅 banner）：按 warning token 铺浅色底和描边，用于用户中心待付款提醒；发送工单 banner 不传，保持中性 |
| `alert` | `inline`：标题和正文同一行，放不下时正文截断；`tinted`：按 tone 铺浅色底和描边；`action`：行尾操作（如“去支付”链接） |
| `gauge` | 新安装；`size`：环的最大宽度（像素，默认 176），中间数字按同一比例缩放，用于行高固定的网格；读屏摘要改中文 |
| `metric-card`（补充） | 标题行的文字样式从 `.top span` 收窄为 `.top > span`（只作用于标题），`action` 插槽里的徽标、按钮保持自己的文字颜色和字号；`trailing`：右下角的控件（如圆形跳转按钮），数字和说明留在左下 |
| `blocks/cta-section`（补充） | `transparent`（仅 banner）：去掉 banner 和外层 section 的底色并把边框加深一档，用于放在渐变或有底色的页面背景上（总览页的发送工单 banner） |
| `user-menu`（补充） | 首字母头像用前景色填充（浅色主题黑底白字，深色主题浅底深字），在透明或渐变顶栏上保持显眼；原为 `surface-muted` 底、`text-secondary` 字 |
| `money-input` | `size="md"`：与标准 `Input` 同高（`--control-height-md`）、同圆角、同字号，用于字段较多的表单（商品编辑页的价格）；默认仍是 Arc 的大号 `lg` |
| `blocks/plan-comparison` | 演示常量改为属性（不传时仍显示原演示）：`plans`（任意数量，列数由 `--plan-count` 驱动；`tagline`、`badge`；`prices` 按周期给出 `amount`、`unit`、`note`，缺省表示该周期未开放，按钮禁用）、`periods`（周期切换，只有一个周期时隐藏）、`rows`（值为 `true`/`false`/`null`/文字；所有套餐取值相同即视为共用行，供「只看差异」过滤，可用 `shared` 覆盖）；周期与选中项可受控（`period`/`onPeriodChange`、`selected`/`onSelectedChange`）；`currency`、`footer`、`action`（页脚操作，如购买按钮）、`labels`（全部文案）；价格支持两位小数；列放不下时矩阵横向滚动（宽屏每列至少 168px，窄屏至少 156px） |
| `chat-thread` | 点击消息里的图片在当前页放大查看（Radix Dialog：关闭按钮、点遮罩或 Esc 关闭；带修饰键或中键点击仍按链接在新标签页打开）；新增文案 `closeImage`；`reactions` 为空数组时不显示添加回应按钮；`header`：消息列表上方的标题行（与输入框一样用细分隔线隔开） |
| `blocks/page-header`（补充） | `statusAlign`：`"end"` 时标题行撑满整行，`status` 插槽（徽标、页面级按钮）靠右；默认 `"inline"` 保持紧跟标题 |
| `blocks/changelog-feed` | 手动安装（只复制 block 的 tsx 和 css，`copy-button`、`lib/media` 沿用已有版本，避免覆盖其扩展）；`next/image` 改为普通 `img`；`version` 改为可选，为空时不显示版本号；`subscribe`（`false` 隐藏订阅控件，产品没有邮件列表）；`emptyNote`（没有任何条目时的结尾文案）；`kinds`（筛选类型由数据传入：`{ id, label, color?, tick? }`，`ChangelogKind` 改为任意字符串，带 `color` 的类型用行内 CSS 变量着色）；`fill`（撑满容器宽度，不再限制 920px）；`autoHeight` + `stickyTop`（列表随条目增高、由页面滚动，月份栏吸顶在页面顶栏下方，月份跟踪和跳转改用窗口滚动）；类型标签和全部内置文案改中文 |
| `select`（补充） | 选项可带 `icon`（如颜色色块），在下拉列表和触发器里显示在文字前；`iconOnly`：只显示图标，文字保留给读屏（更新日志标签的颜色选择） |
| `timeline` | 相对时间、「今天/昨天」日期标题、条数和新条目播报改中文；判断「今天」改用日期而不是标题文字 |
| `line-chart` | `integer`：计数类数据只用整数刻度（避免 0.25 步长四舍五入后出现重复的「1 1 1」标签） |
| `usage-meter` | 用量正好等于配额时角标显示「已用完」而不是「即将用完」 |
| `blocks/empty-states` | 手动安装（只复制 block 的 tsx、css 和 `empty-states-art.ts`，`button`、`lib/motion-tokens` 沿用已有版本）；新增 `EmptyScene` 导出：单个场景插画加标题、说明和操作，不带标签页和演示动作，`scene`（`search` 无结果 / `inbox` 已处理完 / `map` 未找到 / `offline` 加载失败）、`phase`（`idle`/`done`）、`compact`（卡片和表格内的小尺寸插画）变化时插画按原动画形变；对应样式 `.scene*`；场景无障碍标签和演示文案改中文。业务里通过 `features/shared` 的 `EmptyState` 的 `scene` 属性使用 |

## 7. 进度

### 已完成

- 基础：`motion`、`arc-foundation`、Token 映射（`src/styles.css`）、深色模式双属性、`AppToasts`（`src/components/features/toast.tsx`）。
- 认证页：登录、注册、找回密码、重置密码都用 `login-centered` 框架，加 `input`、`password-field`、`password-strength`、`action-button`、`alert`。
- 用户端外壳：`site-header` 加 `user-menu`（`account-shell.tsx`）。公开价格页套用 `site-header`、`faq-section`、`site-footer`。
- 详情页头部：商品详情（两处）、订单详情、工单详情（用户端和管理端）用 `page-header`。
- 基础组件：按钮、徽标、提示、卡片、骨架屏、气泡提示、弹窗、抽屉、标签页、浮层、输入框、多行文本、下拉框、复选框、开关、进度条、菜单、面包屑、折叠面板、滑块、头像、toast 全部换成 Arc。
- 表格：列表页用 `arc-data-table.tsx`（`sortable-data-table`、`search-field`、`pagination`、`empty-state`）；页面内的 22 个普通表格用 `simple-table.tsx`；订单详情的 3 个「标签加内容」表格改为描述列表。
- 数据卡片：仪表盘、用户列表、用户总览和邀请返利页的数字卡片用 `metric-card`。
- `Item` 全部改为 `card`；选项组用 `radio-cards`、`segmented-control`；流量配额用 `usage-meter`（见 5.1）。
- 日期：单日用 `date-picker`，范围用 `date-range-picker`。
- 图表：仪表盘的收入趋势、日收入、用户增长，销售统计的销售趋势、套餐表现、客户状态改用 `line-chart`、`bar-chart`、`donut-chart`。
- 新手引导用 `stepper`，权限组保存进度用 `stepper`，公告用 `carousel`，工单对话用 `chat-thread`。
- 用户总览「个人信息」卡片的 VIP 进度用 `gauge`（`tone="success"`、`size={112}`）：中间是到下一级的百分比，等级作为环下方的标签。
- 数字和金额输入：13 处 `number-field`、4 处 `money-input`（见 5.2）；搜索框用 `search-field`；复制按钮用 `copy-button`。

### 保留项

业务文件里仍然引用旧组件的地方，都是有意保留：

- `field`、`label`、`separator`：Arc 没有对应物，作为本地布局件保留。
- 管理端 `sidebar` 及其内部的头像、菜单、气泡提示（`app-sidebar.tsx`、`site-header.tsx`、`main.tsx` 里的 `TooltipProvider`）：按约定保留本地实现。
- `account-traffic-chart.tsx` 的「近 30 天流量明细」：按节点堆叠的柱状图，Arc 的免费图表里没有堆叠柱，继续用 recharts。
- `data-table.tsx`、`summary-card.tsx`、`progress-ring.tsx`：旧实现，作为回退路径保留，已无页面引用。
- 约 30 处数字输入保持 `input type="number"`，原因见 5.2。

### 没有套用的 block

- `plan-comparison`：原版并排比较固定的两个档位，数据写在文件里，所以价格页继续用卡片。现已改为属性驱动（见第 6 节），先在测试路由 `/account/plans/compare` 套用于周期性套餐，`/account/plans` 和 `/pricing` 暂不切换。
- `signup-form`：注册页与登录页共用 `login-centered` 框架（见第 8 节第 1 条）。
- 总览、钱包、设置页对应的 block 都是 Pro。

### 验证

- 类型检查：项目没有安装 TypeScript，迁移期间用临时目录里的 `tsc` 对照迁移前的基线（基线有 98 个既有错误），迁移后没有新增错误。
- `npm run verify`（构建、核心测试、支付、钱包、商品目录）通过。
- 浏览器：隔离的验证环境（本地库的副本，关闭邮件、Telegram、支付网关和面板调用）。管理端 26 个路由、用户端 14 个路由、4 个认证页和公开价格页，在浅色和深色下各打开一遍，没有控制台错误和页面异常。检查过的交互：登录、注册表单校验、结算页切换计费周期、列表排序、保存通用设置、优惠码日期范围、新手引导翻页、工单对话、面包屑跳转。手机宽度只看过用户端订单页。

## 8. 模糊处的决策

迁移中没有明确规定、由执行者决定的事项：

1. **「Login and sign up」对应 `login-centered`**。Arc 没有叫这个名字的条目；`login-centered` 的说明是「一张卡片同时用于登录和注册」。四个认证页都用它的框架，原来右侧的配图不再显示。
2. **登录 block 只保留框架**。它自带的通行密钥、邮箱验证码、第三方登录是演示流程，产品用邮箱加密码，所以去掉了这些步骤。
3. **Toast 通过桥接函数调用**。`toast-stack` 只能用 Hook；为了让组件外的代码也能弹提示，加了 `toast({ type, title })` 函数转发到已挂载的栈，参数形状与 Arc 一致。
4. **表单提交按钮用外部状态驱动 `action-button`**。给它加了 `pending` 属性，由表单自己的提交状态驱动，不改动各表单的 `onSubmit`。因为不知道请求是否成功，这种用法不显示成功态。危险操作的 `action-button` 不显示箭头。
5. **没有标题的提示用固定标题**。旧 `Alert` 只有正文时，正文是纯文本就作为 Arc 的 `title`；正文含节点时按语气补一个固定标题（提示、请注意、出错了、已完成）。
6. **`outline`、`secondary`、`default` 徽标都对应 `neutral`**；`outline` 按钮对应 `secondary`。
7. **卡片操作区放在标题右侧**。旧 `CardAction` 在右上角，而 Arc `card` 的 `action` 在底部，所以加了 `headerAction`。`CardFooter` 的内容放进正文末尾。
8. **骨架屏按高度折算行数**。旧骨架屏靠 Tailwind 类定高宽，Arc 用行数描述，按原高度折算成 1 至 6 行，宽度类保留。
9. **Arc 样式优先于 Tailwind 类**。Tailwind v4 的工具类在 CSS layer 里，Arc 的 CSS Modules 不在，同一属性冲突时 Arc 生效。传给 Arc 组件的 `className` 只对 Arc 没设置的属性有效，这是部分页面间距、圆角与迁移前不同的原因。
10. **列表表格保留 TanStack 的数据层**。搜索、跨页排序、分页、列显隐和 URL 状态仍由 TanStack Table 负责，只把渲染换成 Arc，这样各页面的列定义不用改。行操作菜单从子元素改为 `actions` 数组。
11. **用户端顶栏的品牌位只显示「NEXORA」**，账户设置、主题切换、退出登录放进 `user-menu`；主题只提供浅色和深色。
12. **头像显示名字首字母**。Arc `avatar` 自己从 `name` 取首字母，原来是取邮箱前两个字符。
13. **字体仍用 Geist**。Arc 正文默认回退到 Inter，这里把 `--font-body` 指回 Geist。
14. **图表色板跟随 Arc**。`--series-1` 至 `--series-4` 由 Arc 定义，`--series-5` 和 `--series-other` 保留本地值，旧的 `--chart-*` 指向它们。
15. **数字和金额输入只转换不会改变提交值的字段**，规则见 5.2。
16. **详情页的 `page-header` 只保留头部**。原 block 是一个自带滚动容器和标签页的演示页，详情页有自己的内容和滚动，所以只取面包屑、标题、状态、说明、操作这一段；滚动后折叠成紧凑条的效果没有保留。
17. **订单详情的「标签加内容」表格改为描述列表**。它们不是表格数据，没有表头，改用 `dl` 加 Arc 的边框变量。
18. **销售趋势从堆叠面积图改为两条折线**。Arc 的折线图每个系列都从坐标轴画起，不堆叠；新客和老客各一条线。套餐表现从横向柱改为纵向柱。
19. **新手引导从可滑动的轮播改为步骤条**。每次只显示当前一步，用上一步、下一步按钮或点击已完成的步骤切换，不能再左右拖动。
20. **工单对话整体使用 `chat-thread`**（2026-10-16 起）：回复由其自带输入框发送，可附最多 3 张截图（粘贴、拖入或点附件按钮）；双方都看到自己的消息在右侧，用户端 `currentUserId="user"`、管理端 `currentUserId="admin"`。发送中显示“发送中”，失败显示“发送失败”和重试；工单已解决时不显示输入框。表情回应开启（👍 ❤️ 😂 🎉 👀 🙏，与服务端 `TICKET_REACTIONS` 一致），按用户端/管理端分别保存在消息的 `reactions` 中，双方互相可见；已解决的工单不能再添加回应。对话直接使用 `chat-thread` 本身（自带边框、`rounded-4xl` 圆角和白底），不再套卡片，外层只保留给定高度的容器。框内顶部用 `header` 放标题行：`avatar-group`（客户邮箱、NEXORA 团队）、工单主题和参与方，行尾是从查看者角度的回复状态：待您回复（danger 红色高亮；本项目 `--accent` 接近黑色，info 会显示成灰色）/ 待客户回复或待客服回复（neutral），已解决后不显示。工单状态只有进行中（warning）/ 已解决（success），用 `page-header` 的 `statusAlign="end"` 显示在大标题这一行的最右侧；管理端的“标记已解决”按钮在状态标签左边。工单列表页（用户端和管理端）同样显示进行中/已解决，进行中的工单再加一个从查看者角度的回复状态；列表标签和筛选里的“已结束”统一改为“已解决”。Arc 演示页里的“Go offline”是演示外壳，不属于组件，工单没有在线状态，不做。
21. **公开价格页新增了顶栏和页脚**。顶栏有登录、注册入口，页脚有登录、注册、使用文档链接和原来的退款提示。
22. **橙色按钮展示页保留**，为它补了四个橙色 variant，而不是删掉这个页面。
23. **bento 卡片的底色用行内样式指定**。Arc `card` 自带底色和边框且优先级高于工具类，所以 `BentoCard` 按 tone 用行内样式写回原来的底色（灰、浅灰、黄、绿），网格里的 `metric-card` 通过 `bentoSurfaceStyle()` 取同样的底色。`BentoCardBadge` 的 `tone="green"` 同理：深绿底（`bento-green-strong`，#228822，与白字对比度约 4.5:1）、白字、无边框写在行内样式里，悬停时也不变色。
24. **bento 网格的行高改为自适应**。原来每行固定为一个 `--bento-row`，内容超出会被裁掉；现在以它为最小高度，随内容增高。
25. **总览页顶部的渐变底色**。只有 `/account` 有：`AccountShell` 在页面顶部铺一条 `--arc-gradient-soft` 色带（高 40rem，下半段渐隐到页面底色），顶栏在页面顶部透明、滚动后或菜单打开时恢复白底加阴影（沿用 `site-header` 自带的 `data-scrolled`）。其它用户端页面的顶栏始终是白底。
