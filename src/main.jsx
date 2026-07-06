import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  App as AntApp,
  Avatar,
  Button,
  Breadcrumb,
  Card as AntCard,
  Checkbox,
  ConfigProvider,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  Layout as AntLayout,
  Menu,
  Modal,
  Progress,
  Select,
  Skeleton,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme
} from "antd";
import {
  ApiOutlined,
  BellOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DashboardOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SunOutlined,
  UserOutlined,
  WarningOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import "antd/dist/reset.css";
import "./styles.css";
import { apiFetch, fetchJson, postJson } from "./api";
import { formatBytes, formatDate, formatDateTime, formatMoney, formatUserExpiry, userStatus } from "./utils";
import {
  BusyOverlay,
  Card,
  CardActions,
  CodeViewer,
  CopyableUrlPill,
  CopyButton,
  DataContext,
  DataProvider,
  DwellixLogo,
  ErrorBoundary,
  FormModal,
  Header,
  Content,
  Sider,
  inModalSelectProps,
  InlineActions,
  makeAntTheme,
  ManagementSection,
  MiniProgressBar,
  NAV_DISPLAY,
  PALETTE,
  PageSection,
  ReminderItem,
  RequireAuth,
  ResizableHeaderCell,
  resizableComponents,
  SectionCard,
  serviceProviderLabel,
  StatusBadge,
  tablePag,
  Text,
  TextArea,
  ThemeModeContext,
  Title,
  ToolbarSearch,
  UrlPill,
  UrlText,
  useData,
  usePalette,
  useResizableCols,
  useResponsiveList,
  useTheme,
  VendorTag
} from "./lib.jsx";

// ─── Lazy-loaded page components ──────────────────────────────────────────────

const LazyUsersPage = React.lazy(() => import("./pages/UsersPage"));
const LazyUserDetailPage = React.lazy(() => import("./pages/UsersPage").then(module => ({ default: module.UserDetailPage })));
const LazyBillsPage = React.lazy(() => import("./pages/BillsPage"));
const LazyEmbyPage = React.lazy(() => import("./pages/EmbyPage"));
const LazySubconverterPage = React.lazy(() => import("./pages/SubconverterPage"));
const LazyDeliveryPage = React.lazy(() => import("./pages/DeliveryPage"));
const LazyPricingPage = React.lazy(() => import("./pages/PricingPage"));

function shouldHidePoolMetrics(item) {
  return item?.status === "invalid";
}

// ─── Suspense fallback ────────────────────────────────────────────────────────

function PageSpin() {
  return (
    <Flex justify="center" align="center" style={{ minHeight: 200, padding: 48 }}>
      <Spin size="large" />
    </Flex>
  );
}

// ─── LoginPage ────────────────────────────────────────────────────────────────

function LoginPage() {
  const navigate = useNavigate();
  const p = usePalette();
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");

  async function submit(values) {
    setLoading(true); setErr("");
    try {
      const res     = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify(values) });
      const payload = await res.json();
      if (!res.ok) return setErr(payload.error || "Sign-in failed");
      navigate("/dashboard", { replace: true });
    } catch { setErr("Unable to reach the login service"); }
    finally  { setLoading(false); }
  }

  return (
    <Flex align="center" justify="center" style={{ minHeight: "100vh", background: p.page, padding: "32px 20px" }}>
      <Flex vertical style={{ width: "100%", maxWidth: 420 }}>
        <Flex vertical align="center" style={{ textAlign: "center", marginBottom: 28 }}>
          <Space direction="vertical" size={12} align="center">
            <Tag bordered={false} style={{ background: p.fill, color: p.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 14px", minHeight: 28, display: "inline-flex", alignItems: "center", borderRadius: 6 }}>管理控制台</Tag>
            <DwellixLogo size={52} />
            <Title level={3} style={{ margin: 0, fontWeight: 800, letterSpacing: -0.5 }}>Monitor</Title>
          </Space>
          <Text type="secondary" style={{ fontSize: 14 }}>订阅运营控制台</Text>
        </Flex>
        <AntCard bordered={false} style={{ background: p.surfaceElevated, border: `1px solid ${p.border}`, borderRadius: 8, padding: 28 }}>
          <Form layout="vertical" onFinish={submit} requiredMark={false} initialValues={{ remember: true }}>
            <Form.Item name="account" label="账号" rules={[{ required: true, message: "请输入账号" }]} style={{ marginBottom: 16 }}>
              <Input autoFocus autoComplete="username" placeholder="账号" size="large" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]} style={{ marginBottom: 20 }}>
              <Input.Password autoComplete="current-password" placeholder="密码" size="large" />
            </Form.Item>
            <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 16 }}>
              <Checkbox>记住我，30 天内免登录</Checkbox>
            </Form.Item>
            {err && <Text type="danger" style={{ display: "block", marginBottom: 14, fontSize: 13 }}>{err}</Text>}
            <Button type="primary" htmlType="submit" block loading={loading} size="large">登录</Button>
          </Form>
        </AntCard>
      </Flex>
    </Flex>
  );
}

// ─── SidebarNav ───────────────────────────────────────────────────────────────

function SidebarNav({ selectedKey, onSelect, version, darkMode, toggleTheme, logout }) {
  const p = usePalette();
  const menuItems = Object.entries(NAV_DISPLAY).map(([key, meta]) => {
    const Icon = meta.icon;
    return {
      key,
      icon: <Icon style={{ fontSize: 15 }} />,
      label: meta.label
    };
  });

  const userMenu = {
    items: [
      { key: "logout", label: "退出登录", icon: <LogoutOutlined />, danger: true, onClick: logout }
    ]
  };

  return (
    <Flex vertical className="console-sidebar">
      <Flex className="console-sidebar-brand" align="center">
        <Flex className="console-sidebar-brandmark" align="center" justify="center">
          <DwellixLogo size={32} />
        </Flex>
        <Flex vertical className="console-sidebar-brandcopy">
          <Text className="console-sidebar-kicker">管理控制台</Text>
          <Text strong className="console-sidebar-title">Monitor</Text>
        </Flex>
      </Flex>
      <Text className="console-sidebar-group-label">导航</Text>
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        className="console-sidebar-menu"
        onClick={onSelect}
      />
      <Flex className="console-sidebar-footer" align="center" justify="space-between">
        <Dropdown menu={userMenu} trigger={["click"]} placement="topRight">
          <Button className="console-user-button" type="default">
            <Avatar size={28} icon={<UserOutlined />} style={{ background: p.fillMid, color: p.primary }} />
            <Flex vertical className="console-user-copy">
              <Text className="console-user-name">管理员</Text>
              <Text className="console-user-meta">构建 {version || "--"}</Text>
            </Flex>
          </Button>
        </Dropdown>
        <Tooltip title={darkMode ? "切换亮色" : "切换暗色"}>
          <Button className="console-header-icon" type="default" icon={darkMode ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} />
        </Tooltip>
      </Flex>
    </Flex>
  );
}

// ─── HeaderBar ────────────────────────────────────────────────────────────────

function HeaderBar({ selectedKey, isMobile, onDrawer, darkMode, toggleTheme, logout, version }) {
  const p = usePalette();
  const pageMeta = NAV_DISPLAY[selectedKey] || NAV_DISPLAY["/urls"];
  const userMenu = {
    items: [
      { key: "logout", label: "退出登录", icon: <LogoutOutlined />, danger: true, onClick: logout }
    ]
  };

  return (
    <Flex className="console-header-bar" align="center" justify="space-between">
      <Flex className="console-header-leading" align="center">
        {isMobile ? (
          <Button className="console-header-icon" type="default" icon={<MenuOutlined />} onClick={onDrawer} />
        ) : (
          <>
            <Flex className="console-header-brand" align="center">
              <Flex className="console-header-brandmark" align="center" justify="center">
                <DwellixLogo size={32} />
              </Flex>
              <Text strong className="console-header-brandtitle">Monitor</Text>
            </Flex>
            <Breadcrumb
              className="console-header-breadcrumb"
              separator={<Text className="console-header-slash">/</Text>}
              items={[
                { title: <Text className="console-header-path">工作区</Text> },
                { title: <Text strong className="console-header-title">{pageMeta.label}</Text> }
              ]}
            />
          </>
        )}
      </Flex>

      <Flex className="console-header-actions" align="center">
        {!isMobile && (
          <Input
            className="console-header-search"
            prefix={<SearchOutlined />}
            placeholder="搜索资源..."
            allowClear
          />
        )}
        {!isMobile && <Button className="console-header-icon" type="default" icon={<BellOutlined />} />}
        <Tooltip title={darkMode ? "切换亮色" : "切换暗色"}>
          <Button className="console-header-icon" type="default" icon={darkMode ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} />
        </Tooltip>
        {isMobile ? (
          <Button className="console-header-icon" type="default" icon={<LogoutOutlined />} onClick={logout} danger />
        ) : (
          <Dropdown menu={userMenu} trigger={["click"]} placement="bottomRight">
            <Button className="console-user-button" type="default">
              <Avatar size={30} icon={<UserOutlined />} style={{ background: p.fillMid, color: p.primary }} />
              <Flex vertical className="console-user-copy">
                <Text className="console-user-name">管理员</Text>
                <Text className="console-user-meta">构建 {version || "--"}</Text>
              </Flex>
            </Button>
          </Dropdown>
        )}
      </Flex>
    </Flex>
  );
}

// ─── AppLayout ────────────────────────────────────────────────────────────────

function AppLayout() {
  const p = usePalette();
  const { darkMode, toggleTheme } = useTheme();
  const { meta, loading, error, subscriptions, users, bills, busy } = useData();
  const [drawer, setDrawer] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const selKey = location.pathname.startsWith("/urls") ? "/urls" : location.pathname;
  const initial = loading && !subscriptions.length && !users.length && !bills.length;

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    navigate("/login", { replace: true });
  }

  function handleNav({ key }) {
    navigate(key);
    setDrawer(false);
  }

  return (
    <AntLayout className="console-shell" style={{ minHeight: "100dvh", background: p.page }}>
      {isMobile && (
        <Header className="console-workspace-header" style={{ padding: 0, lineHeight: 1 }}>
          <div className="console-workspace-inner console-workspace-inner-top">
            <Flex align="center" justify="space-between" style={{ minHeight: 56, padding: "8px 0" }}>
              <Button className="console-header-icon" type="default" icon={<MenuOutlined />} onClick={() => setDrawer(true)} />
              <Flex align="center" gap={8}>
                <Tooltip title={darkMode ? "切换亮色" : "切换暗色"}>
                  <Button className="console-header-icon" type="default" icon={darkMode ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} />
                </Tooltip>
                <Button className="console-header-icon" type="default" icon={<LogoutOutlined />} onClick={logout} danger />
              </Flex>
            </Flex>
          </div>
        </Header>
      )}

      <AntLayout className="console-main-layout" style={{ background: "transparent", minWidth: 0 }}>
        {!isMobile && (
          <Sider width={240} className="console-layout-sider">
            <SidebarNav selectedKey={selKey} onSelect={handleNav} version={meta?.version} darkMode={darkMode} toggleTheme={toggleTheme} logout={logout} />
          </Sider>
        )}

        <Content className="console-workspace-content-shell" style={{ background: "transparent", minWidth: 0 }}>
          <div className="console-workspace-shell">
            <div className="console-workspace-inner">
              <Content className="console-workspace-content" style={{ padding: 0, minWidth: 0 }}>
                {error && <div className="console-error-banner"><Text type="danger">{error}</Text></div>}

                {initial ? (
                  <Flex vertical gap={16}>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 16 }}>
                      {[1, 2, 3, 4].map(i => <Card key={i} pad={20}><Skeleton active paragraph={{ rows: 1 }} /></Card>)}
                    </div>
                    <Card><Skeleton active paragraph={{ rows: 6 }} /></Card>
                  </Flex>
                ) : (
                  <ErrorBoundary>
                    <Suspense fallback={<PageSpin />}>
                      <Routes>
                        <Route path="/dashboard" element={<DashboardPage />} />
                        <Route path="/urls" element={<UrlPoolPage />} />
                        <Route path="/urls/detail/:id" element={<PoolDetailPage />} />
                        <Route path="/users" element={<LazyUsersPage />} />
                        <Route path="/users/detail/:id" element={<LazyUserDetailPage />} />
                        <Route path="/bills" element={<LazyBillsPage />} />
                        <Route path="/emby" element={<LazyEmbyPage />} />
                        <Route path="/subconverter" element={<LazySubconverterPage />} />
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                      </Routes>
                    </Suspense>
                  </ErrorBoundary>
                )}

                <Text className="console-workspace-footer">
                  {loading ? "同步中..." : `最后更新：${formatDateTime(meta?.updatedAt)}`} · v{meta?.version || "1.0.0"}
                </Text>
              </Content>
            </div>
          </div>
        </Content>
      </AntLayout>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        placement="left"
        width={292}
        closable={false}
        styles={{ body: { padding: 0, background: p.surface } }}
      >
        <SidebarNav selectedKey={selKey} onSelect={handleNav} version={meta?.version} darkMode={darkMode} toggleTheme={toggleTheme} logout={logout} />
      </Drawer>

      <BusyOverlay busy={busy} />
    </AntLayout>
  );
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

function DashboardPage() {
  return <ConsoleOverview />;
}

// ─── ConsoleOverview (Dashboard content) ──────────────────────────────────────

function ConsoleOverview() {
  const p = usePalette();
  const navigate = useNavigate();
  const { subscriptions, users, bills } = useData();
  const screens = Grid.useBreakpoint();
  const wide = screens.xl;
  const md = screens.md;

  const counts = subscriptions.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const activeBills = bills.filter(item => !item.reversedAt);
  const paidTotal = activeBills.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const now = new Date();
  const monthPfx = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const todayPfx = `${monthPfx}-${String(now.getDate()).padStart(2, "0")}`;
  const monthIncome = activeBills.filter(item => (item.occurredAt || "").startsWith(monthPfx)).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const todayIncome = activeBills.filter(item => (item.occurredAt || "").startsWith(todayPfx)).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const expiringUsers = users.filter(item => userStatus(item) === "warning");
  const activeUsers = users.filter(item => userStatus(item) !== "expired");
  const activeUserPct = users.length ? Math.round((activeUsers.length / users.length) * 100) : 0;
  const activeUrls = subscriptions.filter(item => item.status === "ok").length;
  const totalUrls = subscriptions.length;
  const activeUrlPct = totalUrls ? Math.round((activeUrls / totalUrls) * 100) : 0;
  const poolIssueCount = subscriptions.filter(item => item.status && item.status !== "ok").length;
  const warningPct = totalUrls ? Math.round((poolIssueCount / totalUrls) * 100) : 0;
  const goalPct = paidTotal > 0 ? Math.min(100, Math.round((monthIncome / paidTotal) * 100)) : 0;

  const criticalUrl = [...subscriptions]
    .filter(item => !shouldHidePoolMetrics(item) && item.metrics?.totalBytes)
    .sort((a, b) => (a.metrics.remainingBytes / a.metrics.totalBytes) - (b.metrics.remainingBytes / b.metrics.totalBytes))[0];

  const spotlightPools = [...subscriptions]
    .sort((a, b) => (b.customerCount || 0) - (a.customerCount || 0))
    .slice(0, wide ? 4 : md ? 3 : 2);

  const recentBills = [...bills]
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
    .slice(0, 5);

  const placeholderPools = [
    { title: "主订阅池", meta: "订阅来源", domain: "添加第一个订阅链接", status: "待配置" },
    { title: "备用池", meta: "故障切换来源", domain: "添加备用链接", status: "可选" },
    { title: "续费池", meta: "用户投递", domain: "绑定续费订阅池", status: "推荐" },
    { title: "自定义中继", meta: "高级路由", domain: "暴露清洁中继端点", status: "高级" }
  ];

  const overviewCards = [
    { label: "池URL数", value: totalUrls, hint: `${activeUrls} 活跃订阅` },
    { label: "用户", value: users.length, hint: `${expiringUsers.length} 即将到期` },
    { label: "活跃用户", value: activeUsers.length, hint: `占比 ${activeUserPct}%` },
    { label: "本月收入", value: formatMoney(monthIncome), hint: `今日 ${formatMoney(todayIncome)}` },
    { label: "总收入", value: formatMoney(paidTotal), hint: `共 ${activeBills.length} 笔账单` },
    { label: "告警", value: poolIssueCount, hint: criticalUrl ? "需跟进" : "全部正常", accent: !!(poolIssueCount || criticalUrl) }
  ];

  const metricRows = [
    { label: "订阅可用率", value: `${activeUrlPct}%`, pct: activeUrlPct },
    { label: "告警占比", value: `${warningPct}%`, pct: warningPct },
    { label: "收款目标", value: `${goalPct}%`, pct: goalPct }
  ];

  return (
    <div className="console-overview">
      <div className="console-hero">
        <div className="console-hero-copy">
          <span className="console-kicker">订阅总览</span>
          <div className="console-title">订阅工作区</div>
          <Text type="secondary" className="console-subtitle">
            查看订阅健康状态、续费风险及近期账单。
          </Text>
        </div>
        <div className="console-hero-actions">
          <Button onClick={() => navigate("/bills")}>查看账单</Button>
          <Button type="primary" onClick={() => navigate("/users")}>管理用户</Button>
        </div>
      </div>

      <div className="console-overview-grid" style={{ gridTemplateColumns: `repeat(${wide ? 4 : md ? 2 : 1}, minmax(0, 1fr))` }}>
        {overviewCards.map(item => (
          <div key={item.label} className="console-overview-card">
            <div className="console-overview-label">{item.label}</div>
            <div className={`console-overview-value${item.accent ? " accent" : ""}`} style={{ color: item.accent ? p.primary : p.text }}>
              {item.value}
            </div>
            <div className="console-overview-hint">{item.hint}</div>
          </div>
        ))}
      </div>

      <div className="console-main-grid" style={{ gridTemplateColumns: wide ? "minmax(0, 1.55fr) minmax(320px, 0.95fr)" : "1fr" }}>
        <div className="console-main-column">
          <Card pad={0}>
            <div className="console-section-head">
              <div>
                <div className="console-section-kicker">订阅总览</div>
                <div className="console-section-title">优先订阅池</div>
              </div>
            </div>
            <div className="console-app-grid" style={{ gridTemplateColumns: `repeat(${wide ? 2 : 1}, minmax(0, 1fr))` }}>
              {spotlightPools.length > 0 ? spotlightPools.map(pool => (
                <div key={pool.id} className="console-app-card">
                  <div className="console-app-head">
                    <div className="console-app-title">{pool.email || serviceProviderLabel(pool)}</div>
                    <StatusBadge status={pool.status} />
                  </div>
                  <div className="console-app-runtime">{serviceProviderLabel(pool)}</div>
                  <div className="console-app-domain">{pool.url || "暂无链接"}</div>
                  <div className="console-app-foot">
                    <span>{pool.customerCount || 0} users</span>
                    <span>{shouldHidePoolMetrics(pool) ? "-" : formatDate(pool.metrics?.expireAt)}</span>
                  </div>
                </div>
              )) : placeholderPools.slice(0, wide ? 4 : md ? 2 : 1).map(pool => (
                <div key={pool.title} className="console-app-card placeholder">
                  <div className="console-app-head">
                    <div className="console-app-title">{pool.title}</div>
                    <span className="console-app-status-placeholder">{pool.status}</span>
                  </div>
                  <div className="console-app-runtime">{pool.meta}</div>
                  <div className="console-app-domain">{pool.domain}</div>
                  <div className="console-app-foot">
                    <span>待配置</span>
                    <span>添加数据</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card pad={0}>
            <div className="console-section-head">
              <div>
                <div className="console-section-kicker">账单</div>
                <div className="console-section-title">最近记录</div>
              </div>
              <Button type="text" onClick={() => navigate("/bills")}>查看全部</Button>
            </div>
            <div className="console-table-list">
              {recentBills.length > 0 ? recentBills.map(item => (
                <div key={item.id} className="console-table-row">
                  <div className="console-table-main">
                    <div className="console-table-title">{item.userLabel}</div>
                    <div className="console-table-subtitle">{formatDate(item.occurredAt)}</div>
                  </div>
                  <div className="console-table-side">
                    <div className="console-table-title">{formatMoney(item.amount)}</div>
                    <div className="console-table-subtitle">{item.billType || "付款"}</div>
                  </div>
                </div>
              )) : (
                <div className="console-empty-row table-like">暂无账单记录。</div>
              )}
            </div>
          </Card>
        </div>

        <div className="console-side-column">
          <Card pad={0}>
            <div className="console-section-head">
              <div>
                <div className="console-section-kicker">运营状况</div>
                <div className="console-section-title">运营快照</div>
              </div>
            </div>
            <div className="console-metric-stack">
              {metricRows.map(row => (
                <div key={row.label} className="console-metric-row">
                  <div className="console-metric-head">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                  <MiniProgressBar pct={row.pct} />
                </div>
              ))}
            </div>
          </Card>

          <Card pad={0}>
            <div className="console-section-head">
              <div>
                <div className="console-section-kicker">告警</div>
                <div className="console-section-title">监控列表</div>
              </div>
            </div>
            <div className="console-watch-list">
              <ReminderItem
                title="高危订阅池"
                subtitle={criticalUrl ? `${serviceProviderLabel(criticalUrl)} 流量即将耗尽` : "当前无高危订阅池"}
                urgent={!!criticalUrl}
              />
              <ReminderItem
                title="本月账单"
                subtitle={`${activeBills.filter(item => (item.occurredAt || "").startsWith(monthPfx)).length} 条本月记录`}
              />
              <ReminderItem
                title="用户覆盖"
                subtitle={`${users.length} 用户绑定了 ${subscriptions.length} 条订阅`}
              />
            </div>
          </Card>

          <ServiceStatusCard />

          <Card pad={0}>
            <div className="console-section-head">
              <div>
                <div className="console-section-kicker">续费</div>
                <div className="console-section-title">待续费用户</div>
              </div>
            </div>
            <div className="console-user-stack">
              {expiringUsers.length > 0 ? expiringUsers.slice(0, 4).map(user => (
                <div key={user.id} className="console-user-card">
                  <div className="console-user-row">
                    <div>
                      <div className="console-user-name">{user.userId}</div>
                      <div className="console-user-meta">{user.subscription?.email || "无绑定链接"}</div>
                    </div>
                    <StatusBadge status={userStatus(user)} />
                  </div>
                  <div className="console-user-row subtle">
                    <span>{formatMoney(user.actualPaid)}</span>
                    <span>{formatUserExpiry(user)}</span>
                  </div>
                </div>
              )) : (
                <div className="console-empty-row">暂无需关注的续费。</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── ServiceStatusCard ────────────────────────────────────────────────────────

function ServiceStatusCard() {
  const p = usePalette();
  const [services, setServices] = useState(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    try {
      const data = await fetchJson("/api/health");
      setServices(data.services);
    } catch {
      setServices({ database: { status: "error", message: "无法连接服务器" }, subconverter: { status: "error", message: "无法连接服务器" } });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { check(); const t = setInterval(check, 30000); return () => clearInterval(t); }, [check]);

  const items = services ? [
    { label: "数据库", ...services.database },
    { label: "Subconverter", ...services.subconverter }
  ] : [];

  return (
    <Card pad={0}>
      <div className="console-section-head">
        <div>
          <div className="console-section-kicker">服务</div>
          <div className="console-section-title">服务状态</div>
        </div>
        <Button type="text" size="small" icon={<ReloadOutlined spin={loading} />} onClick={() => { setLoading(true); check(); }} />
      </div>
      <div className="console-watch-list">
        {loading && !services ? (
          <div style={{ padding: "16px 0", textAlign: "center" }}><Text type="secondary">检测中...</Text></div>
        ) : items.map(svc => (
          <div key={svc.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: `1px solid ${p.border}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 2 }}>{svc.label}</div>
              {svc.latency != null && <div style={{ fontSize: 12, color: p.textMuted }}>{svc.latency}ms</div>}
              {svc.status === "error" && <div style={{ fontSize: 12, color: p.textMuted }}>{svc.message}</div>}
              {svc.status === "unconfigured" && <div style={{ fontSize: 12, color: p.textMuted }}>未配置</div>}
            </div>
            <div style={{ flexShrink: 0 }}>
              {svc.status === "ok" && <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 16 }} />}
              {svc.status === "error" && <CloseCircleOutlined style={{ color: "#ff4d4f", fontSize: 16 }} />}
              {svc.status === "unconfigured" && <WarningOutlined style={{ color: "#faad14", fontSize: 16 }} />}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── SubscriptionForm ──────────────────────────────────────────────────────

function SubscriptionForm({ item, onClose, onSaved }) {
  const { runAsync, vendors, reload } = useData();
  const [form] = Form.useForm();
  const [newVendor, setNewVendor] = useState("");
  const [addingVendor, setAddingVendor] = useState(false);

  async function submit(values) {
    const editingExisting = !!item.id;
    const urlChanged = editingExisting && String(values.url || "").trim() !== String(item.url || "").trim();
    let savedId = item.id;
    await runAsync(async () => {
      if (editingExisting) {
        const updated = await fetchJson(`/api/subscriptions/${item.id}`, { method: "PUT", body: JSON.stringify(values) });
        if (updated?.id) savedId = updated.id;
      } else {
        const created = await postJson("/api/subscriptions", values);
        if (created?.id) savedId = created.id;
      }
      await onSaved();
    }, editingExisting ? "Saving URL pool..." : "Creating URL pool...");
    if ((urlChanged || !editingExisting) && savedId) {
      await runAsync(async () => {
        await postJson(`/api/subscriptions/${savedId}/refresh`);
        await reload(["subscriptions"]);
      }, "正在刷新订阅数据...");
    }
  }

  async function handleAddVendor() {
    const name = newVendor.trim();
    if (!name) return;
    setAddingVendor(true);
    try {
      await postJson("/api/vendors", { name });
      await reload(["vendors"]);
      form.setFieldValue("serviceProvider", name);
      setNewVendor("");
    } finally {
      setAddingVendor(false);
    }
  }

  return (
    <FormModal title={item.id ? "编辑订阅" : "新增订阅"} open onCancel={onClose}>
      <Form form={form} layout="vertical" initialValues={{ url: item.url || "", email: item.email || "", note: item.note || "", serviceProvider: item.serviceProvider || "" }} onFinish={submit}>
        <Divider orientation="left" orientationMargin={0} style={{ marginTop: 0 }}><Text type="secondary" style={{ fontSize: 12 }}>基本信息</Text></Divider>
        <Flex gap={16} wrap="wrap">
          <Form.Item name="url" label="订阅链接" rules={[{ required: true, type: "url", message: "请输入有效的链接" }]} style={{ marginBottom: 0, flex: "1 1 200px" }}>
            <Input placeholder="https://" />
          </Form.Item>
          <Form.Item name="email" label="绑定邮箱" rules={[{ required: true, type: "email", message: "请输入邮箱地址" }]} style={{ marginBottom: 0, flex: "1 1 200px" }}>
            <Input placeholder="user@example.com" />
          </Form.Item>
        </Flex>
        <Divider orientation="left" orientationMargin={0}><Text type="secondary" style={{ fontSize: 12 }}>供应商</Text></Divider>
        <Form.Item name="serviceProvider" style={{ marginBottom: 0 }}>
          <Select
            placeholder="选择供应商"
            allowClear
            style={{ width: "100%" }}
            options={vendors.map(v => ({ label: v.name, value: v.name }))}
            dropdownRender={menu => (
              <>
                {menu}
                <Divider style={{ margin: "8px 0" }} />
                <Flex gap={8} style={{ padding: "0 8px 8px" }}>
                  <Input
                    placeholder="新增供应商..."
                    value={newVendor}
                    onChange={e => setNewVendor(e.target.value)}
                    onPressEnter={handleAddVendor}
                  />
                  <Button loading={addingVendor} onClick={handleAddVendor} icon={<PlusOutlined />} />
                </Flex>
              </>
            )}
            {...inModalSelectProps}
          />
        </Form.Item>
        <Divider orientation="left" orientationMargin={0}><Text type="secondary" style={{ fontSize: 12 }}>备注</Text></Divider>
        <Form.Item name="note" style={{ marginBottom: 0 }}>
          <TextArea rows={4} placeholder="选填" />
        </Form.Item>
        <div style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" block>保存</Button>
        </div>
      </Form>
    </FormModal>
  );
}

// ─── UrlPoolPage ──────────────────────────────────────────────────────────────

function UrlPoolPage() {
  const { subscriptions, reload, runAsync, busy } = useData();
  const { notification } = AntApp.useApp();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(null);
  const [showExpired, setShowExpired] = useState(false);
  const mobile = useResponsiveList();

  const visible = subscriptions
    .filter(item => showExpired || item.status !== "expired")
    .filter(item => `${item.email || ""} ${item.url || ""} ${item.note || ""}`.toLowerCase().includes(keyword.toLowerCase()))
    .sort((a, b) => {
      const ta = a.metrics?.expireAt ? new Date(a.metrics.expireAt).getTime() : 0;
      const tb = b.metrics?.expireAt ? new Date(b.metrics.expireAt).getTime() : 0;
      return tb - ta;
    });

  const lastRefreshedAt = useMemo(() => {
    let latest = 0;
    for (const item of subscriptions) {
      if (item.lastCheckedAt) {
        const t = new Date(item.lastCheckedAt).getTime();
        if (t > latest) latest = t;
      }
    }
    return latest ? formatDateTime(new Date(latest).toISOString()) : null;
  }, [subscriptions]);

  async function action(run) {
    await runAsync(async () => {
      try { await run(); await reload(["subscriptions"]); }
      catch (e) { notification.error({ message: "Action failed", description: e.message, placement: "bottomRight" }); }
    }, "Processing subscription...");
  }

  const actions = (item, compact = false) => {
    const Wrap = compact ? InlineActions : CardActions;
    const bp = compact ? { size: "small", style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy } : { style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy };
    return (
      <Wrap>
        <Button {...bp} icon={<EditOutlined />} onClick={() => setEditing(item)}>编辑</Button>
        <Button {...bp} icon={<ReloadOutlined />} onClick={() => action(() => postJson(`/api/subscriptions/${item.id}/refresh`))}>刷新</Button>
        <Button {...bp} icon={<EyeOutlined />} onClick={() => navigate(`/urls/detail/${item.id}`)}>查看</Button>
        <Button {...bp} danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "删除订阅", content: "确认删除？", onOk: () => action(() => fetchJson(`/api/subscriptions/${item.id}`, { method: "DELETE" })) })}>删除</Button>
      </Wrap>
    );
  };

  const columns = [
    { title: "#", render: (_, __, i) => i + 1, width: 64 },
    { title: "邮箱", render: (_, item) => item.email || item.name || "未命名订阅", width: 160 },
    { title: "供应商", render: (_, item) => <VendorTag name={serviceProviderLabel(item)} />, width: 110 },
    { title: "URL", dataIndex: "url", render: v => <UrlText value={v} />, width: 320 },
    { title: "用户", dataIndex: "customerCount", render: v => v || 0, width: 82 },
    { title: "剩余流量", render: (_, item) => {
      if (shouldHidePoolMetrics(item) || !item.metrics?.totalBytes) return <span>-</span>;
      const pct = Math.round(item.metrics.remainingBytes / item.metrics.totalBytes * 100);
      return <Flex vertical gap={2} style={{ minWidth: 90 }}><Progress percent={pct} size="small" strokeColor={pct < 20 ? "#ff4d4f" : pct < 50 ? "#faad14" : "#52c41a"} showInfo={false} /><Text style={{ fontSize: 11 }}>{formatBytes(item.metrics.remainingBytes)} / {formatBytes(item.metrics.totalBytes)}</Text></Flex>;
    }, width: 140 },
    { title: "到期时间", render: (_, item) => shouldHidePoolMetrics(item) ? "-" : formatDate(item.metrics?.expireAt), width: 120 },
    { title: "状态", dataIndex: "status", render: v => <StatusBadge status={v} />, width: 90 },
    { title: "操作", render: (_, item) => actions(item, true), width: 300 }
  ].map(col => ({ ...col, onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }), onCell: () => ({ style: { whiteSpace: "nowrap" } }) }));
  const poolTable = useResizableCols(columns, "url-pool");

  return (
    <div className="console-page-stack">
      <ManagementSection
        title="Pool"
        actions={
          <>
            <ToolbarSearch placeholder="搜索订阅..." style={{ width: 220 }} onSearch={setKeyword} onChange={e => setKeyword(e.target.value)} />
            <Button onClick={() => setShowExpired(v => !v)} style={{ borderRadius: 6 }}>
              {showExpired ? "隐藏已过期" : "显示已过期"}
            </Button>
            <Button icon={<ReloadOutlined />} loading={!!busy} disabled={!!busy} onClick={() => action(() => postJson("/api/subscriptions/cache-refresh", {}))}>
              全部刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>
              新增订阅
            </Button>
          </>
        }
      >
        {lastRefreshedAt && <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: "block" }}>最后刷新时间：{lastRefreshedAt}</Text>}
        <div>
          {mobile
            ? <PoolCards items={visible} actions={actions} />
            : <Table className="plain-detail-table user-flat-table saas-data-table" size="middle" rowKey="id" columns={poolTable.columns} components={poolTable.components} dataSource={visible} pagination={tablePag} scroll={{ x: Math.max(1520, poolTable.scrollX) }} />
          }
        </div>
        {editing && <SubscriptionForm item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(["subscriptions"]); }} />}
      </ManagementSection>
    </div>
  );
}

// ─── PoolCards ────────────────────────────────────────────────────────────────

function PoolCards({ items, actions }) {
  const p = usePalette();
  if (!items.length) return <Empty description="暂无订阅。" />;
  return (
    <Flex vertical gap={0}>
      {items.map(item => (
        <div key={item.id} style={{ padding: 16, borderBottom: `1px solid ${p.border}` }}>
          <Flex justify="space-between" gap={12} align="start" style={{ marginBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <Text strong style={{ display: "block", fontSize: 15 }}>{item.email || item.name || "未命名订阅"}</Text>
              <Text type="secondary" style={{ fontSize: 13 }}>{item.customerCount || 0} 用户</Text>
            </div>
            <StatusBadge status={item.status} />
          </Flex>
          <div style={{ padding: "10px 0 12px", borderTop: `1px solid ${p.border}`, borderBottom: `1px solid ${p.border}`, marginBottom: 2 }}>
            <UrlPill value={item.url} />
          </div>
          <div style={{ display: "grid", gap: 8, padding: "12px 0" }}>
            {!shouldHidePoolMetrics(item) && item.metrics?.totalBytes ? (
              <div>
                <Flex justify="space-between" align="center" gap={12}>
                  <Text type="secondary" style={{ fontSize: 13, flex: "0 0 auto" }}>剩余流量</Text>
                  <Text style={{ fontSize: 11 }}>{formatBytes(item.metrics.remainingBytes)} / {formatBytes(item.metrics.totalBytes)}</Text>
                </Flex>
                <Progress percent={Math.round(item.metrics.remainingBytes / item.metrics.totalBytes * 100)} size="small" strokeColor={item.metrics.remainingBytes / item.metrics.totalBytes < 0.2 ? "#ff4d4f" : item.metrics.remainingBytes / item.metrics.totalBytes < 0.5 ? "#faad14" : "#52c41a"} showInfo={false} style={{ marginTop: 4 }} />
              </div>
            ) : (
              <Flex justify="space-between" align="center" gap={12}>
                <Text type="secondary" style={{ fontSize: 13, flex: "0 0 auto" }}>剩余流量</Text>
                <Text strong style={{ fontSize: 13 }}>{shouldHidePoolMetrics(item) ? "-" : formatBytes(item.metrics?.remainingBytes)}</Text>
              </Flex>
            )}
            {[["到期", shouldHidePoolMetrics(item) ? "-" : formatDate(item.metrics?.expireAt)]].map(([label, value]) => (
              <Flex justify="space-between" align="center" gap={12} key={label}>
                <Text type="secondary" style={{ fontSize: 13, flex: "0 0 auto" }}>{label}</Text>
                <Text strong style={{ fontSize: 13 }}>{value}</Text>
              </Flex>
            ))}
          </div>
          <div style={{ paddingTop: 2 }}>{actions(item)}</div>
        </div>
      ))}
    </Flex>
  );
}

// ─── PoolDetailPage ───────────────────────────────────────────────────────────

function PoolDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const p = usePalette();
  const { subscriptions, users, reload, runAsync } = useData();
  const [cache, setCache] = useState(null);
  const [refreshingCache, setRefreshingCache] = useState(false);
  const [refreshingTraffic, setRefreshingTraffic] = useState(false);
  const item = subscriptions.find(e => e.id === id);
  const boundUsers = item ? users.filter(u => u.subscriptionId === item.id) : [];

  const userCols = [
    { title: "User ID", dataIndex: "userId" },
    { title: "WeChat", dataIndex: "wechatName", render: v => v || "-" },
    { title: "Expires", render: (_, u) => formatUserExpiry(u) },
    { title: "Status", render: (_, u) => <StatusBadge status={userStatus(u)} /> }
  ];
  const boundUserTable = useResizableCols(userCols, "url-detail-bound-users");

  useEffect(() => {
    if (!item?.id) return;
    let cancelled = false;
    runAsync(async () => {
      const result = await fetchJson(`/api/subscriptions/${item.id}/cache`).catch(e => ({ error: e.message }));
      if (!cancelled) setCache(result);
    }, "Loading details...");
    return () => { cancelled = true; };
  }, [item?.id, runAsync]);

  if (!item) return (
    <PageSection title="URL details"><Empty description="未找到该订阅记录。" /></PageSection>
  );

  async function refreshTraffic() {
    setRefreshingTraffic(true);
    try {
      await runAsync(async () => {
        await postJson(`/api/subscriptions/${item.id}/refresh`);
        await reload(["subscriptions"]);
      }, "正在刷新订阅数据...");
    } finally { setRefreshingTraffic(false); }
  }

  async function refreshCache() {
    setRefreshingCache(true);
    try {
      const result = await fetchJson(`/api/subscriptions/${item.id}/cache?force=true`).catch(e => ({ error: e.message }));
      setCache(result);
    } finally { setRefreshingCache(false); }
  }

  const m = item.metrics || {};
  const hideMetrics = shouldHidePoolMetrics(item);
  const isMobile = !screens.md;

  const cacheText = cache?.error ? `Error: ${cache.error}` : (cache?.body || "(no YAML fetched)");
  const cacheSource = cache?.storage === "cached" ? "缓存" : cache?.storage === "live" ? "实时" : "";
  const cacheMeta = cache?.fetchedAt ? `${cacheSource ? `[${cacheSource}] ` : ""}${formatDateTime(cache.fetchedAt)} - ${formatBytes(cache.bodyLength || 0)}${cache.truncated ? " (truncated)" : ""}` : "";

  return (
    <div className="detail-page" style={{ color: p.text }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <Button size="small" onClick={() => navigate("/urls")} style={{ marginBottom: 10, borderRadius: 6 }}>返回订阅池</Button>
          <Title level={2} style={{ margin: 0, fontSize: isMobile ? 26 : 34, fontWeight: 900, letterSpacing: -1, lineHeight: 1.1 }}>
            订阅池<br />详情
          </Title>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Text strong style={{ fontSize: 16, fontWeight: 700 }}>订阅详情</Text>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="small" icon={<EditOutlined />} style={{ borderRadius: 6 }}>编辑</Button>
              <Button size="small" icon={<ReloadOutlined />} loading={refreshingTraffic} onClick={refreshTraffic} style={{ borderRadius: 6 }}>刷新</Button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: p.fill, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ApiOutlined style={{ color: p.primary, fontSize: 20 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <Text strong style={{ fontSize: 15, display: "block" }}>{item.email || "无邮箱"}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{serviceProviderLabel(item)}</Text>
            </div>
          </div>
          <CopyableUrlPill value={item.url} className="detail-url-copyable" />
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[
              { label: "HTTP 状态", value: item.httpStatus || "-" },
              { label: "最近检查", value: item.lastCheckedAt ? formatDate(item.lastCheckedAt) : "-" },
              { label: "到期时间", value: !hideMetrics && m.expireAt ? formatDate(m.expireAt) : "-" },
              { label: "剩余流量", value: !hideMetrics && m.totalBytes ? `${formatBytes(m.remainingBytes)} / ${formatBytes(m.totalBytes)}` : "-" },
              { label: "已用流量", value: !hideMetrics && m.usedBytes ? formatBytes(m.usedBytes) : "-" },
              { label: "绑定用户", value: `${boundUsers.length} users` }
            ].map(r => (
              <div key={r.label}>
                <Text type="secondary" style={{ fontSize: 11, display: "block" }}>{r.label}</Text>
                <Text strong style={{ fontSize: 13 }}>{r.value}</Text>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Status</Text>
              <StatusBadge status={item.status} />
            </div>
            {item.note && (
              <Text type="secondary" style={{ fontSize: 12, maxWidth: 160, textAlign: "right" }}>{item.note}</Text>
            )}
          </div>
          {item.lastError && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,0.07)" }}>
              <Text type="danger" style={{ fontSize: 12 }}>{item.lastError}</Text>
            </div>
          )}
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <Text strong style={{ fontSize: 16, fontWeight: 700 }}>绑定用户</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{boundUsers.length} 活跃用户</Text>
          </div>
          {boundUsers.length && isMobile ? (
            <div className="detail-user-card-list">
              {boundUsers.map(u => (
                <div className="detail-user-card" key={u.id}>
                  <div>
                    <Text strong>{u.userId}</Text>
                    <Text type="secondary" style={{ display: "block", fontSize: 12, marginTop: 2 }}>{u.wechatName || "-"}</Text>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Text style={{ display: "block", fontSize: 13 }}>{formatUserExpiry(u)}</Text>
                    <StatusBadge status={userStatus(u)} />
                  </div>
                </div>
              ))}
            </div>
          ) : boundUsers.length ? (
            <Table className="plain-detail-table" size="small" rowKey="id" columns={boundUserTable.columns} components={boundUserTable.components} dataSource={boundUsers} pagination={false} scroll={{ x: Math.max(620, boundUserTable.scrollX) }} />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无绑定用户。" />
          )}
        </Card>

        <Card>
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <Text strong style={{ fontSize: 16, fontWeight: 700 }}>实时配置</Text>
              {cacheMeta && <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 2 }}>{cacheMeta}</Text>}
            </div>
            <Button size="small" icon={<ReloadOutlined />} loading={refreshingCache} onClick={refreshCache} style={{ borderRadius: 6 }}>刷新</Button>
          </div>
          <CodeViewer code={cacheText} meta="" language="YAML" />
        </Card>
      </div>
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────

function App() {
  const [darkMode, setDarkMode] = useState(() => { const v = localStorage.getItem("themeMode"); return v ? v === "dark" : false; });
  const palette = darkMode ? PALETTE.dark : PALETTE.light;
  const toggleTheme = useCallback(() => {
    setDarkMode(cur => {
      const next = !cur;
      localStorage.setItem("themeMode", next ? "dark" : "light");
      return next;
    });
  }, []);
  const ctxValue = useMemo(() => ({ darkMode, toggleTheme, palette }), [darkMode, toggleTheme, palette]);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
  }, [darkMode]);

  return (
    <ConfigProvider theme={makeAntTheme(palette, darkMode)} wave={{ disabled: true }}>
      <ThemeModeContext.Provider value={ctxValue}>
        <AntApp>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/delivery/:token" element={<Suspense fallback={<PageSpin />}><LazyDeliveryPage /></Suspense>} />
              <Route path="/pricing" element={<Suspense fallback={<PageSpin />}><LazyPricingPage /></Suspense>} />
              <Route path="/buy" element={<Suspense fallback={<PageSpin />}><LazyPricingPage /></Suspense>} />
              <Route path="/*" element={
                <RequireAuth>
                  <DataProvider>
                    <AppLayout />
                  </DataProvider>
                </RequireAuth>
              } />
            </Routes>
          </BrowserRouter>
        </AntApp>
      </ThemeModeContext.Provider>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")).render(<App />);
