# 项目同步总结

更新时间：2026-06-03

## 本轮主要目标

把原来的 Node + 静态 HTML 管理后台重构为更适合部署和维护的 React 应用，并完成 URL 池、自定义 URL 中转、缓存、用户购买/续费、账单和 UI 体验的多轮调整。

## 前端重构

- 使用 React + React Router + Vite 重构前端。
- 删除旧的 `public/index.html`、`public/login.html`、`public/app.js`、`public/styles.css`。
- 新增 React 入口：
  - `index.html`
  - `src/main.jsx`
  - `src/api.js`
  - `src/utils.js`
  - `vite.config.js`
- `server.js` 支持优先服务 `dist`，并支持 React SPA fallback。
- `vercel.json` 调整为支持 Vite 构建输出和 SPA 路由。

## UI 设计

- 参考 Muse Ant Design Dashboard 风格改造后台。
- 安装并使用：
  - `antd`
  - `@ant-design/icons`
  - `dayjs`
- 所有 UI 组件统一使用 Ant Design：
  - `Layout`
  - `Sider`
  - `Header`
  - `Content`
  - `Menu`
  - `Drawer`
  - `Card`
  - `Table`
  - `Form`
  - `Modal`
  - `Skeleton`
  - `Spin`
  - `Statistic`
  - `Tag`
- 加入响应式布局：
  - 桌面端使用表格。
  - 移动端使用卡片列表。
  - 移动端导航使用 Drawer。
- 所有表格默认每页展示 20 条。
- 表格操作按钮统一横向平铺，避免竖向堆叠。
- 表格行高提高，减少纵向拥挤。

## 日间 / 夜间模式

- 新增日间/夜间模式切换。
- 使用 Ant Design `defaultAlgorithm` / `darkAlgorithm`。
- 使用 `THEME_PALETTES.light` 和 `THEME_PALETTES.dark` 集中管理颜色变量。
- 主题状态保存到 `localStorage`。
- 修复夜间模式下：
  - 统计数字黑色不可见。
  - 卡片 header 白色分割线突兀。
  - hover / elevated 区域发白。

## URL 池与缓存

- URL 池页支持：
  - 添加池 URL。
  - 编辑池 URL。
  - 刷新状态。
  - 刷新单条缓存。
  - 刷新全部池缓存。
  - 查看缓存。
  - 查看订阅返回信息。
- 池 URL 请求客户端固定使用 `clash-meta`。
- 缓存只保留 Clash 配置主体。
- 支持本地文件缓存，避免每次都从数据库读取大体积 YAML。

## 自定义 URL 中转

- 新增自定义 URL 页面。
- 自定义 URL 可以绑定某个池 URL。
- 自定义 URL 返回的是转换后的 Clash 配置，不是简单跳转到池 URL。
- 支持：
  - 到期时间。
  - 启用/停用。
  - Clash mode。
  - 替换 rules。
  - 前置 rules。
  - 后置 rules。
  - 追加 YAML 片段。
  - 预览转换结果。
  - 刷新绑定池缓存。
- 公共访问路径支持：
  - `/c/:token`
  - `/custom/:token`

## 用户购买 / 续费逻辑

- 用户购买时会根据用户到期时间自动推荐合适的池 URL。
- 用户订阅链接为 `/sub/:token`。
- 新增 `useCustomRelay` 字段。
- 添加用户和续费表单新增开关：
  - `启用自定义 URL 中转逻辑`
  - 默认关闭。
- 关闭时：
  - `/sub/:token` 继续按原逻辑实时请求池 URL。
- 开启时：
  - `/sub/:token` 从池 URL 缓存读取 Clash 配置并执行转换后返回。

## 异步体验

- 首次进入后台加载数据时显示骨架屏。
- 登录显示加载弹窗。
- 刷新缓存、查看缓存、预览、添加、编辑、删除、续费、撤销账单等异步操作均显示 loading 弹窗。

## 账单

- 保留用户初始购买、续费、调整账单逻辑。
- 账单页支持月份筛选和关键字搜索。
- 账单表格默认 20 条。

## 测试与构建

已验证通过：

```bash
npm run check
npm test
npm run build
```

注意：Vite 构建会提示 Ant Design bundle 超过 500KB，这是 Ant Design 后台项目常见体积警告，不影响运行。后续可通过路由级懒加载做拆包优化。

## 部署说明

- 本地启动：

```bash
npm start
```

- 前端生产构建：

```bash
npm run build
```

- Vercel 部署使用 `dist` 作为输出目录。

