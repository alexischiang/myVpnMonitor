import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  App as AntApp,
  Avatar,
  Button,
  Card,
  Checkbox,
  Col,
  ConfigProvider,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  Layout as AntLayout,
  Menu,
  Modal,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Skeleton,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  theme
} from "antd";
import {
  ApiOutlined,
  CheckOutlined,
  CopyOutlined,
  DashboardOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  EyeOutlined,
  LinkOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MoonOutlined,
  PlusOutlined,
  ReloadOutlined,
  RetweetOutlined,
  SunOutlined,
  TeamOutlined,
  UserOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import "antd/dist/reset.css";
import "./styles.css";
import { apiFetch, fetchJson, postJson } from "./api";
import {
  absoluteUrl,
  billTypeLabels,
  copyText,
  durationLabels,
  formatBytes,
  formatDate,
  formatDateTime,
  formatMoney,
  statusLabels,
  userStatus
} from "./utils";

const { Header, Sider, Content } = AntLayout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const DataContext = createContext(null);
const ThemeModeContext = createContext({ darkMode: false, toggleTheme: () => {} });

const menuItems = [
  { key: "/urls", icon: <ApiOutlined />, label: "URL 池" },
  { key: "/custom-urls", icon: <LinkOutlined />, label: "自定义 URL" },
  { key: "/users", icon: <TeamOutlined />, label: "用户管理" },
  { key: "/bills", icon: <DollarOutlined />, label: "账单管理" }
];

// 弹窗内的下拉 / 日期面板：关掉虚拟滚动并渲染进 Form 内部，
// 修复 iOS WebKit 下 Modal 锁定 body 滚动导致下拉无法上下滑动的问题。
const inModalSelectProps = { virtual: false, getPopupContainer: node => node.parentElement };
const durationDaysMap = { monthly: 30, quarterly: 90, half_yearly: 180, yearly: 360 };
function calcExpiry(purchasedAt, duration) {
  const days = durationDaysMap[duration];
  if (!days || !purchasedAt) return null;
  const d = new Date(purchasedAt instanceof Object ? purchasedAt.toDate() : purchasedAt);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d;
}

function DurationRadio({ purchasedAt, value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {Object.entries(durationLabels).map(([key, label]) => {
        const expiry = calcExpiry(purchasedAt, key);
        const selected = value === key;
        return (
          <div
            key={key}
            onClick={() => onChange?.(key)}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: `1.5px solid ${selected ? "var(--ant-color-primary)" : "var(--ant-color-border)"}`,
              background: selected ? "var(--ant-color-primary-bg)" : "transparent",
              cursor: "pointer",
              transition: "all 0.15s"
            }}
          >
            <Text strong style={{ fontSize: 14, color: selected ? "var(--ant-color-primary)" : undefined }}>{label}</Text>
            {expiry && <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 2 }}>到 {formatDate(expiry)}</Text>}
          </div>
        );
      })}
    </div>
  );
}

const RELAY_BEFORE_EXPIRY_DAYS = 2;
const RELAY_AFTER_EXPIRY_DAYS = 10;
const RELAY_MAX_CUSTOMERS = 8;

function findRecommendedSubscription(subscriptions, users, expiresAt, ignoredUserId = "") {
  if (!expiresAt) return { result: null, reason: null };
  const userExpiry = new Date(expiresAt).setHours(0, 0, 0, 0);
  const dayMs = 86400000;
  let noExpiry = 0, outOfWindow = 0, tooFull = 0;
  const candidates = subscriptions.map(s => {
    const poolExpiry = s.metrics?.expireAt ? new Date(s.metrics.expireAt).setHours(0, 0, 0, 0) : null;
    if (!poolExpiry) { noExpiry++; return null; }
    const customerCount = users.filter(u => u.subscriptionId === s.id && u.id !== ignoredUserId).length;
    const diffDays = (poolExpiry - userExpiry) / dayMs;
    if (customerCount > RELAY_MAX_CUSTOMERS) { tooFull++; return null; }
    if (diffDays < -RELAY_BEFORE_EXPIRY_DAYS || diffDays > RELAY_AFTER_EXPIRY_DAYS) { outOfWindow++; return null; }
    return { s, diffDays, customerCount };
  }).filter(Boolean);
  const after = candidates.filter(c => c.diffDays >= 0).sort((a, b) => a.diffDays - b.diffDays || a.customerCount - b.customerCount);
  if (after.length) return { result: after[0].s, reason: null };
  const before = candidates.filter(c => c.diffDays < 0).sort((a, b) => Math.abs(a.diffDays) - Math.abs(b.diffDays) || a.customerCount - b.customerCount);
  if (before.length) return { result: before[0].s, reason: null };
  const reason = tooFull > 0 && outOfWindow === 0
    ? `${tooFull} 条池 URL 时间匹配但已满员（>${RELAY_MAX_CUSTOMERS} 客户），请手动选择`
    : outOfWindow > 0 && tooFull === 0
    ? "没有到期时间接近的池 URL，请手动选择"
    : tooFull > 0
    ? `有 ${tooFull} 条满员、${outOfWindow} 条时间不匹配，请手动选择`
    : "没有可用的池 URL";
  return { result: null, reason };
}

function subscriptionLabel(s) {
  const tail = s.url ? s.url.slice(-4) : "????";
  const expire = s.metrics?.expireAt ? formatDate(s.metrics.expireAt) : "未知到期";
  const email = s.email || "无邮箱";
  return `${tail} · ${expire} · ${email}`;
}
const inModalPickerProps = {};

function createMuse(palette) {
  return {
    app: { minHeight: "100dvh", background: palette.page },
    sider: {
      minHeight: "100dvh",
      background: palette.sidebar,
      padding: "32px 12px 24px",
      borderRight: `1px solid ${palette.border}`
    },
    header: isMobile => ({
      height: "auto",
      background: palette.page,
      padding: isMobile
        ? "calc(18px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) 10px calc(16px + env(safe-area-inset-left))"
        : "28px 32px 12px",
      lineHeight: 1.3
    }),
    content: isMobile => ({
      padding: isMobile
        ? "12px calc(16px + env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))"
        : "16px 32px 32px"
    }),
    card: {
      borderRadius: 18,
      background: palette.surface,
      border: `1px solid ${palette.border}`,
      boxShadow: palette.shadowCard
    },
    softCard: {
      borderRadius: 18,
      background: palette.surface,
      border: `1px solid ${palette.border}`,
      boxShadow: palette.shadowSoft
    },
    brandAvatar: {
      background: palette.primary,
      boxShadow: "0 4px 12px rgba(0,122,255,0.3)"
    },
    menu: { borderInlineEnd: 0, background: "transparent" },
    navDivider: `1px solid ${palette.border}`
  };
}

const tablePagination = { pageSize: 20, showSizeChanger: false };

const THEME_PALETTES = {
  light: {
    primary: "#007aff",
    page: "#f2f2f7",
    sidebar: "#ffffff",
    surface: "#ffffff",
    surfaceElevated: "#ffffff",
    surfaceHover: "#f2f2f7",
    border: "rgba(60,60,67,0.13)",
    borderSoft: "rgba(60,60,67,0.08)",
    text: "#1c1c1e",
    textSecondary: "#6e6e73",
    textMuted: "#aeaeb2",
    fill: "rgba(120,120,128,0.12)",
    fillSecondary: "rgba(120,120,128,0.08)",
    fillTertiary: "rgba(120,120,128,0.05)",
    shadowCard: "0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)",
    shadowSoft: "0 1px 2px rgba(0,0,0,0.06)"
  },
  dark: {
    primary: "#0a84ff",
    page: "#000000",
    sidebar: "#1c1c1e",
    surface: "#1c1c1e",
    surfaceElevated: "#2c2c2e",
    surfaceHover: "#2c2c2e",
    border: "rgba(255,255,255,0.12)",
    borderSoft: "rgba(255,255,255,0.07)",
    text: "#ffffff",
    textSecondary: "#ebebf599",
    textMuted: "#ebebf54d",
    fill: "rgba(120,120,128,0.22)",
    fillSecondary: "rgba(120,120,128,0.16)",
    fillTertiary: "rgba(120,120,128,0.10)",
    shadowCard: "none",
    shadowSoft: "none"
  }
};

function useData() {
  return useContext(DataContext);
}

function useMuse() {
  const { palette } = useContext(ThemeModeContext);
  return useMemo(() => createMuse(palette), [palette]);
}

function useThemeMode() {
  return useContext(ThemeModeContext);
}

function BusyModal({ busy }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!busy) { setProgress(0); return; }
    setProgress(15);
    const t1 = setTimeout(() => setProgress(45), 400);
    const t2 = setTimeout(() => setProgress(72), 1200);
    const t3 = setTimeout(() => setProgress(88), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [busy]);
  return (
    <Modal open={Boolean(busy)} footer={null} closable={false} centered maskClosable={false} width={340}
      styles={{ content: { borderRadius: 20, padding: "32px 28px 28px" } }}>
      <Flex vertical align="center" gap={20}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(0,122,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spin size="default" />
        </div>
        <Flex vertical align="center" gap={6} style={{ width: "100%" }}>
          <Text strong style={{ fontSize: 16, letterSpacing: -0.3 }}>{busy?.label || "处理中..."}</Text>
          <Progress percent={progress} showInfo={false} strokeColor="#007aff" trailColor="rgba(0,0,0,0.06)" strokeLinecap="round" style={{ width: "100%", margin: "4px 0" }} />
          <Text type="secondary" style={{ fontSize: 12 }}>请稍候，完成后自动关闭</Text>
        </Flex>
      </Flex>
    </Modal>
  );
}

function DataProvider({ children }) {
  const [state, setState] = useState({ subscriptions: [], users: [], customUrls: [], bills: [], meta: null, loading: true, error: "" });
  const [busy, setBusy] = useState(null);

  const reload = useCallback(async () => {
    setState(current => ({ ...current, loading: true, error: "" }));
    try {
      const [subscriptions, users, customUrls, bills, meta] = await Promise.all([
        fetchJson("/api/subscriptions"),
        fetchJson("/api/users"),
        fetchJson("/api/custom-urls"),
        fetchJson("/api/bills"),
        fetchJson("/api/app-meta")
      ]);
      setState({ subscriptions, users, customUrls, bills, meta, loading: false, error: "" });
    } catch (error) {
      setState(current => ({ ...current, loading: false, error: error.message }));
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  const runAsync = useCallback(async (task, label = "处理中...") => {
    setBusy({ label, startAt: Date.now() });
    try {
      return await task();
    } finally {
      setBusy(null);
    }
  }, []);

  const value = useMemo(() => ({ ...state, reload, runAsync, busy }), [state, reload, runAsync, busy]);
  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

function statusColor(status) {
  return {
    ok: "green",
    warning: "gold",
    error: "red",
    expired: "default",
    depleted: "red",
    unknown: "blue"
  }[status] || "default";
}

function StatusBadge({ status }) {
  return <Tag color={statusColor(status)}>{statusLabels[status] || "未知"}</Tag>;
}

function UrlText({ value }) {
  const { message } = AntApp.useApp();
  const [copied, setCopied] = useState(false);
  const text = value || "未知";
  function handleCopy() {
    copyText(value || "").then(() => {
      message.success("已复制");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <Flex align="center" gap={8}>
      <Tag color="gold">{String(text).slice(-4)}</Tag>
      <Text code ellipsis={{ tooltip: text }}>{text}</Text>
      <Button size="small" icon={copied ? <CheckOutlined /> : <CopyOutlined />} style={copied ? { color: "#52c41a", borderColor: "#52c41a" } : {}} onClick={handleCopy} />
    </Flex>
  );
}

function MobileUrlBlock({ value }) {
  const { message } = AntApp.useApp();
  const [copied, setCopied] = useState(false);
  const text = value || "未知";
  function handleCopy() {
    copyText(value || "").then(() => {
      message.success("已复制");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <Flex align="center" gap={8} style={{ minWidth: 0 }}>
      <Tag color="gold" style={{ marginInlineEnd: 0, flex: "0 0 auto" }}>{String(text).slice(-4)}</Tag>
      <Text code ellipsis={{ tooltip: text }} style={{ flex: 1, minWidth: 0, maxWidth: "100%", fontSize: 13, lineHeight: 1.6 }}>{text}</Text>
      <Button size="small" icon={copied ? <CheckOutlined /> : <CopyOutlined />} style={{ flex: "0 0 auto", ...(copied ? { color: "#52c41a", borderColor: "#52c41a" } : {}) }} onClick={handleCopy} />
    </Flex>
  );
}

function PageCard({ title, extra, children }) {
  const muse = useMuse();
  const { palette } = useThemeMode();
  const screens = Grid.useBreakpoint();
  const mobile = !screens.md;
  return (
    <Card
      bordered={false}
      style={muse.card}
      title={<Text strong style={{ fontSize: 15, letterSpacing: -0.2 }}>{title}</Text>}
      extra={mobile ? null : extra}
      styles={{ header: { padding: "18px 20px", borderBottomColor: palette.borderSoft }, body: { padding: 20 } }}
    >
      {mobile && extra ? <div style={{ marginBottom: 16 }}>{extra}</div> : null}
      {children}
    </Card>
  );
}

function Toolbar({ children }) {
  const screens = Grid.useBreakpoint();
  const mobile = !screens.md;
  return (
    <Flex wrap={mobile ? "wrap" : "nowrap"} gap={8} justify={mobile ? "flex-start" : "flex-end"} align="center" style={{ width: "100%" }}>
      {React.Children.map(children, child => {
        if (!React.isValidElement(child)) return child;
        const isInput = child.type === Input.Search || child.type === DatePicker;
        const style = {
          ...(child.props.style || {}),
          width: mobile ? "100%" : child.props.style?.width,
          minWidth: mobile ? 0 : child.props.style?.minWidth
        };
        return (
          <div style={{ flex: mobile ? (isInput ? "1 1 100%" : "1 1 auto") : "0 0 auto", minWidth: 0 }}>
            {React.cloneElement(child, { style })}
          </div>
        );
      })}
    </Flex>
  );
}

function InlineActions({ children }) {
  return <Flex wrap="nowrap" gap={6} align="center">{children}</Flex>;
}

function CardActions({ children }) {
  return (
    <Flex wrap="wrap" gap={8} align="center">
      {React.Children.map(children, child => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child, {
          size: "small",
          style: {
            ...(child.props.style || {}),
            height: 32,
            paddingInline: 12,
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500
          }
        });
      })}
    </Flex>
  );
}

function PoolDetailModal({ item, cache, boundUsers = [], onClose }) {
  const m = item.metrics || {};
  const statusItems = [
    { label: "状态", children: <StatusBadge status={item.status} /> },
    { label: "到期时间", children: m.expireAt ? formatDateTime(m.expireAt) : "—" },
    { label: "剩余流量", children: m.remainingBytes != null ? formatBytes(m.remainingBytes) : "—" },
    { label: "已用流量", children: m.usedBytes != null ? formatBytes(m.usedBytes) : "—" },
    { label: "总流量", children: m.totalBytes != null ? formatBytes(m.totalBytes) : "—" },
    { label: "上次检查", children: item.lastCheckedAt ? formatDateTime(item.lastCheckedAt) : "—" },
    { label: "HTTP 状态", children: item.httpStatus || "—" },
    { label: "错误", children: item.lastError || "—" },
  ];
  const userColumns = [
    { title: "用户 ID", dataIndex: "userId" },
    { title: "微信名", dataIndex: "wechatName", render: v => v || "—" },
    { title: "到期", render: (_, u) => formatDate(u.expiresAt) },
    { title: "状态", render: (_, u) => <StatusBadge status={userStatus(u)} /> },
  ];
  return (
    <Modal title={item.email || item.name || "池 URL 详情"} open width={960} footer={null} onCancel={onClose} destroyOnHidden>
      <Flex vertical gap={20}>
        <div>
          <Text strong style={{ display: "block", marginBottom: 8 }}>订阅状态</Text>
          <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }} items={statusItems} />
        </div>
        <div>
          <Text strong style={{ display: "block", marginBottom: 8 }}>绑定用户 <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>({boundUsers.length} 人)</Text></Text>
          {boundUsers.length ? (
            <Table size="small" rowKey="id" columns={userColumns} dataSource={boundUsers} pagination={false} />
          ) : (
            <Text type="secondary">暂无绑定用户</Text>
          )}
        </div>
        <div>
          <Text strong style={{ display: "block", marginBottom: 8 }}>
            YAML 缓存
            {cache?.fetchedAt && <Text type="secondary" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>{formatDateTime(cache.fetchedAt)} · {formatBytes(cache.bodyLength || 0)}{cache.truncated ? "（已截断）" : ""}</Text>}
          </Text>
          <TextArea value={cache?.error ? `错误：${cache.error}` : (cache?.body || "（暂无缓存）")} readOnly autoSize={{ minRows: 8, maxRows: 20 }} />
        </div>
      </Flex>
    </Modal>
  );
}

function DebugModal({ title, content, onClose }) {
  return (
    <Modal title={title || "返回信息"} open width={900} footer={null} onCancel={onClose}>
      <TextArea value={content} readOnly autoSize={{ minRows: 12, maxRows: 24 }} />
    </Modal>
  );
}

function LoginPage() {
  const muse = useMuse();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(values) {
    setLoading(true);
    setMessage("");
    try {
      const response = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ ...values, remember: false }) });
      const payload = await response.json();
      if (!response.ok) return setMessage(payload.error || "登录失败。");
      navigate("/urls", { replace: true });
    } catch {
      setMessage("无法连接登录服务。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AntLayout style={{ ...muse.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 380, padding: "0 24px" }}>
        <Flex vertical align="center" gap={6} style={{ marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, ...muse.brandAvatar, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: "#fff", marginBottom: 4 }}>X</div>
          <Title level={3} style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>XELA monitor</Title>
          <Text type="secondary" style={{ fontSize: 14 }}>订阅中转管理后台</Text>
        </Flex>
        <Form layout="vertical" size="large" onFinish={submit} requiredMark={false}>
          <div style={{ background: "var(--ant-color-fill-tertiary)", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
            <Form.Item name="account" label="账号" rules={[{ required: true, message: "请输入账号" }]} style={{ padding: "10px 16px 4px", marginBottom: 0 }}>
              <Input variant="borderless" prefix={<UserOutlined style={{ color: "var(--ant-color-text-tertiary)" }} />} autoComplete="username" placeholder="请输入账号" />
            </Form.Item>
            <div style={{ height: 1, background: "var(--ant-color-border-secondary)", margin: "0 16px" }} />
            <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]} style={{ padding: "10px 16px 4px", marginBottom: 0 }}>
              <Input.Password variant="borderless" autoComplete="current-password" placeholder="请输入密码" />
            </Form.Item>
          </div>
          {message && <Text type="danger" style={{ display: "block", marginBottom: 12, fontSize: 13 }}>{message}</Text>}
          <Button type="primary" htmlType="submit" block loading={loading} size="large" style={{ borderRadius: 12, fontWeight: 600, height: 48 }}>登录</Button>
        </Form>
      </div>
    </AntLayout>
  );
}

function RequireAuth({ children }) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    fetchJson("/api/auth/me").then(() => setOk(true)).catch(() => setOk(false)).finally(() => setReady(true));
  }, []);

  if (!ready) return <Card loading />;
  if (!ok) return <Navigate to="/login" replace />;
  return children;
}

function AppLayout() {
  const muse = useMuse();
  const { darkMode, toggleTheme } = useThemeMode();
  const { meta, loading, error, subscriptions, users, customUrls, bills } = useData();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    navigate("/login", { replace: true });
  }

  function handleMenu({ key }) {
    navigate(key);
    setDrawerOpen(false);
  }

  const nav = <SideNavigation selectedKey={location.pathname} onSelect={handleMenu} />;
  const initialLoading = loading && !subscriptions.length && !users.length && !customUrls.length && !bills.length;

  return (
    <AntLayout style={muse.app}>
      {!isMobile && <Sider width={252} style={muse.sider}>{nav}</Sider>}
      <AntLayout style={muse.app}>
        <Header style={muse.header(isMobile)}>
          <Flex align="center" justify="space-between" gap={16}>
            <Flex align="center" gap={12}>
              {isMobile && <Button icon={<MenuFoldOutlined />} onClick={() => setDrawerOpen(true)} />}
              <div>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0.2, textTransform: "uppercase" }}>{menuItems.find(item => item.key === location.pathname)?.label || "Dashboard"}</Text>
                <Title level={4} style={{ margin: "2px 0 0", fontSize: 17, fontWeight: 700, letterSpacing: -0.4 }}>订阅中转控制台</Title>
              </div>
            </Flex>
            <Space size={8} wrap>
              <Text type="secondary" style={{ fontSize: 12 }}>v{meta?.version || "--"}</Text>
              <Button
                type="text"
                shape="circle"
                title={darkMode ? "日间模式" : "夜间模式"}
                icon={darkMode ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
                style={{ color: "var(--ant-color-text-secondary)" }}
              />
              <Button type="text" icon={<LogoutOutlined />} onClick={logout} style={{ color: "var(--ant-color-text-secondary)" }} />
            </Space>
          </Flex>
        </Header>
        <Content style={muse.content(isMobile)}>
          <Flex vertical gap={16}>
            {error && <Card bordered={false} style={muse.softCard}><Text type="danger">{error}</Text></Card>}
            {initialLoading ? (
              <DashboardSkeleton />
            ) : (
              <>
                <Summary />
                <Routes>
                  <Route path="/urls" element={<UrlPoolPage />} />
                  <Route path="/custom-urls" element={<CustomUrlsPage />} />
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/bills" element={<BillsPage />} />
                  <Route path="*" element={<Navigate to="/urls" replace />} />
                </Routes>
              </>
            )}
            {loading && <Text type="secondary">正在同步数据...</Text>}
            <Text type="secondary" style={{ fontSize: 12 }}>Latest updated: {formatDateTime(meta?.updatedAt)}</Text>
          </Flex>
        </Content>
      </AntLayout>
      <Drawer title="XELA monitor" open={drawerOpen} onClose={() => setDrawerOpen(false)} placement="left" width={292} styles={{ body: { padding: 16 } }}>
        {nav}
      </Drawer>
    </AntLayout>
  );
}

function DashboardSkeleton() {
  const muse = useMuse();
  return (
    <>
      <Row gutter={[16, 16]}>
        {[1, 2, 3, 4, 5].map(item => (
          <Col xs={24} sm={12} xl={4} key={item}>
            <Card bordered={false} style={muse.softCard}>
              <Skeleton active paragraph={{ rows: 1 }} title={{ width: "45%" }} />
            </Card>
          </Col>
        ))}
      </Row>
      <Card bordered={false} style={muse.card}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    </>
  );
}

function SideNavigation({ selectedKey, onSelect }) {
  const muse = useMuse();
  const { palette } = useThemeMode();
  return (
    <Flex vertical gap={24}>
      <Flex align="center" gap={10} style={{ padding: "0 10px 20px", borderBottom: muse.navDivider }}>
        <Avatar size={32} style={{ ...muse.brandAvatar, fontSize: 13, fontWeight: 700 }}>X</Avatar>
        <Text strong style={{ fontSize: 15, letterSpacing: -0.3 }}>XELA</Text>
      </Flex>
      <Menu mode="inline" selectedKeys={[selectedKey]} items={menuItems} onClick={onSelect} style={muse.menu} />
    </Flex>
  );
}

function Summary() {
  const muse = useMuse();
  const { palette } = useThemeMode();
  const { subscriptions, users, bills } = useData();
  const counts = subscriptions.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {});
  const activeBills = bills.filter(bill => !bill.reversedAt);
  const paidTotal = activeBills.reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0);
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const todayPrefix = `${monthPrefix}-${String(now.getDate()).padStart(2, "0")}`;
  const monthIncome = activeBills.filter(b => (b.occurredAt || "").startsWith(monthPrefix)).reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const todayIncome = activeBills.filter(b => (b.occurredAt || "").startsWith(todayPrefix)).reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const expiringUsers = users.filter(user => userStatus(user) === "warning").length;
  const statusItems = [
    { title: "池 URL", value: subscriptions.length },
    { title: "用户", value: users.length },
    { title: "需关注 URL", value: counts.warning || 0 },
    { title: "即将到期用户", value: expiringUsers },
  ];
  const incomeItems = [
    { title: "本日收入", value: formatMoney(todayIncome) },
    { title: "本月收入", value: formatMoney(monthIncome) },
    { title: "实付款合计", value: formatMoney(paidTotal) }
  ];

  function StatGrid({ items }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {items.map(item => (
          <Card bordered={false} style={{ ...muse.softCard, minWidth: 0 }} styles={{ body: { padding: "14px 16px" } }} key={item.title}>
            <Statistic
              title={<Text type="secondary" style={{ display: "block", fontSize: 12, fontWeight: 600 }}>{item.title}</Text>}
              value={item.value}
              valueStyle={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: palette.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              style={{ minWidth: 0 }}
            />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <Flex vertical gap={12}>
      <div>
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, display: "block" }}>状态监控</Text>
        <StatGrid items={statusItems} />
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, display: "block" }}>收入情况</Text>
        <StatGrid items={incomeItems} />
      </div>
    </Flex>
  );
}

function useResponsiveList() {
  const screens = Grid.useBreakpoint();
  return !screens.md;
}

function UrlPoolPage() {
  const { subscriptions, users, reload, runAsync, busy } = useData();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showExpired, setShowExpired] = useState(false);
  const mobile = useResponsiveList();
  const visible = subscriptions
    .filter(item => !showExpired ? item.status !== "expired" : true)
    .filter(item => `${item.email || ""} ${item.url || ""} ${item.note || ""}`.toLowerCase().includes(keyword.toLowerCase()))
    .sort((a, b) => {
      const ta = a.metrics?.expireAt ? new Date(a.metrics.expireAt).getTime() : 0;
      const tb = b.metrics?.expireAt ? new Date(b.metrics.expireAt).getTime() : 0;
      return tb - ta;
    });

  async function action(run) {
    await runAsync(async () => {
      await run();
      await reload();
    }, "正在处理 URL 池操作...");
  }

  async function showDetail(item) {
    await runAsync(async () => {
      const cache = await fetchJson(`/api/subscriptions/${item.id}/cache`).catch(e => ({ error: e.message }));
      const boundUsers = users.filter(u => u.subscriptionId === item.id);
      setDetail({ item, cache, boundUsers });
    }, "正在读取详情...");
  }

  const actions = (item, compact = false) => {
    const Wrap = compact ? InlineActions : CardActions;
    const buttonProps = compact ? { size: "small", style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy } : { style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy };
    return (
      <Wrap>
        <Button {...buttonProps} icon={<EditOutlined />} onClick={() => setEditing(item)}>编辑</Button>
        <Button {...buttonProps} icon={<ReloadOutlined />} onClick={() => action(() => postJson(`/api/subscriptions/${item.id}/refresh`))}>刷新</Button>
        <Button {...buttonProps} icon={<EyeOutlined />} onClick={() => showDetail(item)}>查看</Button>
        <Button {...buttonProps} danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "删除池 URL", content: "确定删除这个池 URL 吗？", onOk: () => action(() => fetchJson(`/api/subscriptions/${item.id}`, { method: "DELETE" })) })}>删除</Button>
      </Wrap>
    );
  };

  const columns = [
    { title: "#", render: (_, __, index) => index + 1, width: 64 },
    { title: "邮箱", dataIndex: "email", render: (_, item) => item.email || item.name || "未填写", width: 160 },
    { title: "池 URL", dataIndex: "url", render: value => <UrlText value={value} />, width: 320 },
    { title: "客户数", dataIndex: "customerCount", render: value => value || 0, width: 82 },
    { title: "剩余流量", render: (_, item) => {
      if (item.status === "expired" || !item.metrics?.totalBytes) return <span>{formatBytes(item.metrics?.remainingBytes)}</span>;
      const pct = Math.round(item.metrics.remainingBytes / item.metrics.totalBytes * 100);
      return <Flex vertical gap={2} style={{ minWidth: 90 }}><Progress percent={pct} size="small" strokeColor={pct < 20 ? "#ff4d4f" : pct < 50 ? "#faad14" : "#52c41a"} showInfo={false} /><Text style={{ fontSize: 11 }}>{formatBytes(item.metrics.remainingBytes)} / {formatBytes(item.metrics.totalBytes)}</Text></Flex>;
    }, width: 140 },
    { title: "到期", render: (_, item) => item.status === "expired" ? "-" : formatDate(item.metrics?.expireAt), width: 120 },
    { title: "状态", dataIndex: "status", render: value => <StatusBadge status={value} />, width: 90 },
    { title: "缓存", render: (_, item) => item.cachedConfig?.fetchedAt ? `${formatDateTime(item.cachedConfig.fetchedAt)} · ${formatBytes(item.cachedConfig.bodyLength || item.cachedConfig.body?.length || 0)}` : "未缓存", width: 210 },
    { title: "操作", render: (_, item) => actions(item, true), width: 300 }
  ].map(column => ({
    ...column,
    onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }),
    onCell: () => ({ style: { whiteSpace: "nowrap" } })
  }));

  return (
    <PageCard title="URL 池" extra={<Toolbar><Input.Search allowClear placeholder="搜索 URL、邮箱或备注" style={{ width: 210 }} onSearch={setKeyword} onChange={event => setKeyword(event.target.value)} /><Button onClick={() => setShowExpired(v => !v)}>{showExpired ? "隐藏已到期" : "显示已到期"}</Button><Button icon={<ReloadOutlined />} onClick={() => action(() => postJson("/api/subscriptions/cache-refresh"))}>刷新缓存</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>添加 URL</Button></Toolbar>}>
      {mobile ? <PoolCards items={visible} actions={actions} /> : <Table size="middle" rowKey="id" columns={columns} dataSource={visible} pagination={tablePagination} scroll={{ x: 1520 }} />}
      {editing && <SubscriptionForm item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
      {detail && <PoolDetailModal item={detail.item} cache={detail.cache} boundUsers={detail.boundUsers} onClose={() => setDetail(null)} />}
    </PageCard>
  );
}

function PoolCards({ items, actions }) {
  const muse = useMuse();
  const { palette } = useThemeMode();
  if (!items.length) return <Empty description="还没有池 URL。" />;
  return (
    <Flex vertical gap={12}>
      {items.map(item => (
        <Card
          hoverable
          bordered={false}
          style={{ ...muse.softCard, borderRadius: 14 }}
          styles={{ body: { padding: 16 } }}
          key={item.id}
        >
          <Flex justify="space-between" gap={12} align="start" style={{ marginBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <Text strong ellipsis={{ tooltip: item.email || item.name || "未填写" }} style={{ display: "block", fontSize: 15 }}>
                {item.email || item.name || "未填写"}
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>{item.customerCount || 0} 个客户</Text>
            </div>
            <StatusBadge status={item.status} />
          </Flex>
          <div style={{ padding: "10px 0 12px", borderTop: `1px solid ${palette.borderSoft}`, borderBottom: `1px solid ${palette.borderSoft}` }}>
            <MobileUrlBlock value={item.url} />
          </div>
          <div style={{ display: "grid", gap: 8, padding: "12px 0" }}>
            {item.status !== "expired" && item.metrics?.totalBytes ? (
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
                <Text strong style={{ fontSize: 13 }}>{item.status === "expired" ? "-" : formatBytes(item.metrics?.remainingBytes)}</Text>
              </Flex>
            )}
            {[
              ["到期", item.status === "expired" ? "-" : formatDate(item.metrics?.expireAt)],
              ["缓存", item.cachedConfig?.fetchedAt ? formatDateTime(item.cachedConfig.fetchedAt) : "未缓存"]
            ].map(([label, value]) => (
              <Flex justify="space-between" align="center" gap={12} key={label}>
                <Text type="secondary" style={{ fontSize: 13, flex: "0 0 auto" }}>{label}</Text>
                <Text strong ellipsis={{ tooltip: value }} style={{ minWidth: 0, textAlign: "right", fontSize: 13 }}>{value}</Text>
              </Flex>
            ))}
          </div>
          <div style={{ paddingTop: 2 }}>
            {actions(item)}
          </div>
        </Card>
      ))}
    </Flex>
  );
}

function SubscriptionForm({ item, onClose, onSaved }) {
  const { runAsync } = useData();
  const [form] = Form.useForm();
  async function submit(values) {
    await runAsync(async () => {
      if (item.id) await fetchJson(`/api/subscriptions/${item.id}`, { method: "PUT", body: JSON.stringify(values) });
      else await postJson("/api/subscriptions", values);
      await onSaved();
    }, item.id ? "正在更新池 URL..." : "正在添加池 URL...");
  }
  return (
    <Modal title={item.id ? "编辑池 URL" : "添加池 URL"} open onCancel={onClose} footer={null} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={{ url: item.url || "", email: item.email || "", note: item.note || "" }} onFinish={submit}>
        <Form.Item name="url" label="订阅 URL" rules={[{ required: true, type: "url", message: "请输入正确的 URL" }]}><Input /></Form.Item>
        <Form.Item name="email" label="绑定邮箱" rules={[{ required: true, type: "email", message: "请输入邮箱" }]}><Input /></Form.Item>
        <Form.Item name="note" label="备注"><TextArea rows={4} /></Form.Item>
        <Flex justify="end"><Button type="primary" htmlType="submit">保存</Button></Flex>
      </Form>
    </Modal>
  );
}

function CustomUrlsPage() {
  const { customUrls, users, subscriptions, reload, runAsync, busy } = useData();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(null);
  const [editingRelay, setEditingRelay] = useState(null);
  const [debug, setDebug] = useState(null);
  const mobile = useResponsiveList();

  const userRelayItems = users
    .filter(u => u.useCustomRelay && u.subscriptionToken)
    .map(u => ({
      id: `user-relay-${u.id}`,
      _userId: u.id,
      _userRelay: true,
      name: u.userId || u.wechatName || u.id,
      publicPath: `/sub/${u.subscriptionToken}`,
      expiresAt: u.expiresAt,
      enabled: true,
      source: u.subscription ? { url: u.subscription.url } : null,
      subscriptionId: u.subscriptionId,
      transform: u.customRelayTransform || {}
    }));

  const allItems = [...customUrls, ...userRelayItems];
  const visible = allItems.filter(item => `${item.name || ""} ${item.note || ""} ${item.source?.url || ""}`.toLowerCase().includes(keyword.toLowerCase()));

  async function preview(item) {
    await runAsync(async () => {
      const url = item._userRelay ? `/api/users/${item._userId}/relay-preview` : `/api/custom-urls/${item.id}/preview`;
      const payload = await fetchJson(url);
      setDebug({ title: `${item.name} 预览`, content: payload.body });
    }, "正在生成预览...");
  }

  async function mutate(run) {
    await runAsync(async () => {
      await run();
      await reload();
    }, "正在处理自定义 URL...");
  }

  const actions = (item, compact = false) => {
    const Wrap = compact ? InlineActions : CardActions;
    const buttonProps = compact ? { size: "small", style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy } : { style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy };
    if (item._userRelay) {
      return (
        <Wrap>
          <Button {...buttonProps} icon={<EyeOutlined />} onClick={() => preview(item)}>预览</Button>
          <Button {...buttonProps} icon={<RetweetOutlined />} onClick={() => mutate(() => postJson(`/api/users/${item._userId}/relay-refresh-cache`))}>刷新缓存</Button>
          <Button {...buttonProps} icon={<EditOutlined />} onClick={() => setEditingRelay(item)}>编辑</Button>
          <Button {...buttonProps} danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "删除用户", content: "确定删除这个用户吗？", onOk: () => mutate(() => fetchJson(`/api/users/${item._userId}`, { method: "DELETE" })) })}>删除</Button>
        </Wrap>
      );
    }
    return (
      <Wrap>
        <Button {...buttonProps} icon={<EyeOutlined />} onClick={() => preview(item)}>预览</Button>
        <Button {...buttonProps} icon={<RetweetOutlined />} onClick={() => mutate(() => postJson(`/api/custom-urls/${item.id}/refresh-cache`))}>刷新缓存</Button>
        <Button {...buttonProps} icon={<EditOutlined />} onClick={() => setEditing(item)}>编辑</Button>
        <Button {...buttonProps} danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "删除自定义 URL", content: "确定删除这个自定义 URL 吗？", onOk: () => mutate(() => fetchJson(`/api/custom-urls/${item.id}`, { method: "DELETE" })) })}>删除</Button>
      </Wrap>
    );
  };

  const columns = [
    { title: "#", render: (_, __, index) => index + 1, width: 64 },
    { title: "名称", render: (_, item) => <Flex align="center" gap={6}><span>{item.name}</span>{item._userRelay && <Tag color="blue">用户中转</Tag>}</Flex> },
    { title: "自定义 URL", render: (_, item) => <UrlText value={absoluteUrl(item.publicPath)} />, width: 320 },
    { title: "池 URL", render: (_, item) => <UrlText value={item.source?.url || "池 URL 不存在"} />, width: 320 },
    { title: "到期", render: (_, item) => item.expiresAt ? formatDateTime(item.expiresAt) : "长期有效" },
    { title: "缓存", render: (_, item) => item._userRelay ? "—" : (item.source?.cache?.fetchedAt ? `${formatDateTime(item.source.cache.fetchedAt)} · ${formatBytes(item.source.cache.bodyLength || 0)}` : "未缓存"), width: 230 },
    { title: "状态", render: (_, item) => item.enabled === false ? <Tag>已停用</Tag> : <Tag color="success">正常</Tag> },
    { title: "操作", render: (_, item) => actions(item, true), width: 330 }
  ].map(column => ({
    ...column,
    onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }),
    onCell: () => ({ style: { whiteSpace: "nowrap" } })
  }));

  return (
    <PageCard title="自定义 URL" extra={<Toolbar><Input.Search allowClear placeholder="搜索名称、池 URL 或备注" style={{ minWidth: 240 }} onSearch={setKeyword} onChange={event => setKeyword(event.target.value)} /><Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ enabled: true, transform: {} })}>添加自定义 URL</Button></Toolbar>}>
      {mobile ? <CustomUrlCards items={visible} actions={actions} /> : <Table size="middle" rowKey="id" columns={columns} dataSource={visible} pagination={tablePagination} scroll={{ x: 1360 }} />}
      {editing && <CustomUrlForm item={editing} subscriptions={subscriptions} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
      {editingRelay && <UserRelayForm item={editingRelay} subscriptions={subscriptions} onClose={() => setEditingRelay(null)} onSaved={async () => { setEditingRelay(null); await reload(); }} />}
      {debug && <DebugModal title={debug.title} content={debug.content} onClose={() => setDebug(null)} />}
    </PageCard>
  );
}

function CustomUrlCards({ items, actions }) {
  const muse = useMuse();
  const { palette } = useThemeMode();
  if (!items.length) return <Empty description="还没有自定义 URL。" />;
  return (
    <Flex vertical gap={12}>
      {items.map(item => (
        <Card hoverable bordered={false} style={{ ...muse.softCard, borderRadius: 14 }} styles={{ body: { padding: 16 } }} key={item.id}>
          <Flex justify="space-between" gap={12} align="center" style={{ marginBottom: 10 }}>
            <Text strong ellipsis={{ tooltip: item.name }} style={{ fontSize: 15 }}>{item.name}</Text>
            {item.enabled === false ? <Tag>已停用</Tag> : <Tag color="success">正常</Tag>}
          </Flex>
          <Flex vertical gap={6} style={{ padding: "10px 0 12px", borderTop: `1px solid ${palette.borderSoft}`, borderBottom: `1px solid ${palette.borderSoft}` }}>
            <Flex align="center" gap={6}>
              <Text type="secondary" style={{ fontSize: 12, flex: "0 0 auto" }}>中转</Text>
              <MobileUrlBlock value={absoluteUrl(item.publicPath)} />
            </Flex>
            <Flex align="center" gap={6}>
              <Text type="secondary" style={{ fontSize: 12, flex: "0 0 auto" }}>池</Text>
              <MobileUrlBlock value={item.source?.url || "池 URL 不存在"} />
            </Flex>
          </Flex>
          <div style={{ display: "grid", gap: 8, padding: "12px 0" }}>
            {[
              ["到期", item.expiresAt ? formatDateTime(item.expiresAt) : "长期有效"],
              ["缓存", item.source?.cache?.fetchedAt ? formatDateTime(item.source.cache.fetchedAt) : "未缓存"]
            ].map(([label, value]) => (
              <Flex justify="space-between" align="center" gap={12} key={label}>
                <Text type="secondary" style={{ fontSize: 13, flex: "0 0 auto" }}>{label}</Text>
                <Text strong ellipsis={{ tooltip: value }} style={{ minWidth: 0, textAlign: "right", fontSize: 13 }}>{value}</Text>
              </Flex>
            ))}
          </div>
          <div style={{ paddingTop: 2 }}>{actions(item)}</div>
        </Card>
      ))}
    </Flex>
  );
}

function UserRelayForm({ item, subscriptions, onClose, onSaved }) {
  const { runAsync } = useData();
  async function submit(values) {
    await runAsync(async () => {
      const user = { subscriptionId: values.subscriptionId, expiresAt: values.expiresAt ? values.expiresAt.toISOString() : "", customRelayTransform: { mode: values.mode || "", replaceRules: Boolean(values.replaceRules), prependRules: values.prependRules || "", appendRules: values.appendRules || "", customYaml: values.customYaml || "" } };
      await fetchJson(`/api/users/${item._userId}`, { method: "PUT", body: JSON.stringify(user) });
      await onSaved();
    }, "正在更新用户中转配置...");
  }
  return (
    <Modal title={`${item.name} 中转配置`} open onCancel={onClose} footer={null} width={860} destroyOnHidden>
      <Form layout="vertical" initialValues={{ subscriptionId: item.subscriptionId || subscriptions[0]?.id || "", expiresAt: item.expiresAt ? dayjs(item.expiresAt) : null, mode: item.transform?.mode || "", replaceRules: Boolean(item.transform?.replaceRules), prependRules: item.transform?.prependRules || "", appendRules: item.transform?.appendRules || "", customYaml: item.transform?.customYaml || "" }} onFinish={submit}>
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="subscriptionId" label="池 URL" rules={[{ required: true, message: "请选择池 URL" }]}><Select {...inModalSelectProps} options={subscriptions.map(s => ({ value: s.id, label: subscriptionLabel(s) }))} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="expiresAt" label="到期时间"><DatePicker {...inModalPickerProps} showTime style={{ width: "100%" }} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="mode" label="Clash mode"><Select {...inModalSelectProps} options={[{ value: "", label: "保持原配置" }, { value: "Rule", label: "Rule" }, { value: "Global", label: "Global" }, { value: "Direct", label: "Direct" }]} /></Form.Item></Col>
        </Row>
        <Space wrap><Form.Item name="replaceRules" valuePropName="checked"><Checkbox>用下方规则替换原 rules</Checkbox></Form.Item></Space>
        <Form.Item name="prependRules" label="前置规则"><TextArea rows={4} /></Form.Item>
        <Form.Item name="appendRules" label="后置规则"><TextArea rows={4} /></Form.Item>
        <Form.Item name="customYaml" label="追加 YAML 片段"><TextArea rows={4} /></Form.Item>
        <Flex justify="end"><Button type="primary" htmlType="submit">保存</Button></Flex>
      </Form>
    </Modal>
  );
}

function CustomUrlForm({ item, subscriptions, onClose, onSaved }) {
  const { runAsync } = useData();
  async function submit(values) {
    await runAsync(async () => {
      const payload = {
        ...values,
        expiresAt: values.expiresAt ? values.expiresAt.toISOString() : "",
        enabled: Boolean(values.enabled),
        replaceRules: Boolean(values.replaceRules)
      };
      if (item.id) await fetchJson(`/api/custom-urls/${item.id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await postJson("/api/custom-urls", payload);
      await onSaved();
    }, item.id ? "正在更新自定义 URL..." : "正在添加自定义 URL...");
  }
  return (
    <Modal title={item.id ? "编辑自定义 URL" : "添加自定义 URL"} open onCancel={onClose} footer={null} width={860} destroyOnHidden>
      <Form layout="vertical" initialValues={{
        name: item.name || "",
        sourceSubscriptionId: item.sourceSubscriptionId || subscriptions[0]?.id || "",
        expiresAt: item.expiresAt ? dayjs(item.expiresAt) : null,
        enabled: item.enabled !== false,
        mode: item.transform?.mode || "",
        replaceRules: Boolean(item.transform?.replaceRules),
        prependRules: item.transform?.prependRules || "",
        appendRules: item.transform?.appendRules || "",
        customYaml: item.transform?.customYaml || "",
        note: item.note || ""
      }} onFinish={submit}>
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}><Input /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="sourceSubscriptionId" label="池 URL" rules={[{ required: true, message: "请选择池 URL" }]}><Select {...inModalSelectProps} options={subscriptions.map(source => ({ value: source.id, label: subscriptionLabel(source) }))} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="expiresAt" label="到期时间"><DatePicker {...inModalPickerProps} showTime style={{ width: "100%" }} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="mode" label="Clash mode"><Select {...inModalSelectProps} options={[{ value: "", label: "保持原配置" }, { value: "Rule", label: "Rule" }, { value: "Global", label: "Global" }, { value: "Direct", label: "Direct" }]} /></Form.Item></Col>
        </Row>
        <Space wrap><Form.Item name="enabled" valuePropName="checked"><Checkbox>启用</Checkbox></Form.Item><Form.Item name="replaceRules" valuePropName="checked"><Checkbox>用下方规则替换原 rules</Checkbox></Form.Item></Space>
        <Form.Item name="prependRules" label="前置规则"><TextArea rows={4} /></Form.Item>
        <Form.Item name="appendRules" label="后置规则"><TextArea rows={4} /></Form.Item>
        <Form.Item name="customYaml" label="追加 YAML 片段"><TextArea rows={4} /></Form.Item>
        <Form.Item name="note" label="备注"><TextArea rows={3} /></Form.Item>
        <Flex justify="end"><Button type="primary" htmlType="submit">保存</Button></Flex>
      </Form>
    </Modal>
  );
}

function UsersPage() {
  const { users, subscriptions, reload, runAsync, busy } = useData();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(null);
  const [renewing, setRenewing] = useState(null);
  const mobile = useResponsiveList();
  const visible = users.filter(user => `${user.userId || ""} ${user.wechatName || ""} ${user.imessageId || ""} ${user.subscription?.url || ""}`.toLowerCase().includes(keyword.toLowerCase()));

  async function mutate(run) {
    await runAsync(async () => {
      await run();
      await reload();
    }, "正在处理用户操作...");
  }

  const actions = (user, compact = false) => {
    const Wrap = compact ? InlineActions : CardActions;
    const buttonProps = compact ? { size: "small", style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy } : { style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy };
    return (
      <Wrap>
        <Button {...buttonProps} icon={<RetweetOutlined />} onClick={() => setRenewing(user)}>续费</Button>
        <Button {...buttonProps} icon={<EditOutlined />} onClick={() => setEditing(user)}>编辑</Button>
        <Button {...buttonProps} danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "删除用户", content: "确定删除这个用户吗？", onOk: () => mutate(() => fetchJson(`/api/users/${user.id}`, { method: "DELETE" })) })}>删除</Button>
      </Wrap>
    );
  };

  const columns = [
    { title: "#", render: (_, __, index) => index + 1, width: 64 },
    { title: "用户 ID", dataIndex: "userId" },
    { title: "状态", render: (_, user) => <StatusBadge status={userStatus(user)} /> },
    { title: "到期", render: (_, user) => formatDate(user.expiresAt) },
    { title: "时长", render: (_, user) => durationLabels[user.duration] || "未知" },
    { title: "总付款", render: (_, user) => formatMoney(user.actualPaid) },
    { title: "客户订阅 URL", render: (_, user) => <UrlText value={user.relayPath ? absoluteUrl(user.relayPath) : (user.subscription?.url || "关联 URL 不存在")} />, width: 320 },
    { title: "绑定邮箱", render: (_, user) => user.subscription?.email || "" },
    { title: "购买时间", render: (_, user) => formatDate(user.purchasedAt) },
    { title: "操作", render: (_, user) => actions(user, true), width: 230 }
  ].map(column => ({
    ...column,
    onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }),
    onCell: () => ({ style: { whiteSpace: "nowrap" } })
  }));

  return (
    <PageCard title="用户管理" extra={<Toolbar><Input.Search allowClear placeholder="搜索用户、邮箱或 URL" style={{ minWidth: 240 }} onSearch={setKeyword} onChange={event => setKeyword(event.target.value)} /><Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>添加用户</Button></Toolbar>}>
      {mobile ? <UserCards users={visible} actions={actions} /> : <Table size="middle" rowKey="id" columns={columns} dataSource={visible} pagination={tablePagination} scroll={{ x: 1380 }} />}
      {editing && <UserForm item={editing} subscriptions={subscriptions} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
      {renewing && <RenewForm user={renewing} subscriptions={subscriptions} onClose={() => setRenewing(null)} onSaved={async () => { setRenewing(null); await reload(); }} />}
    </PageCard>
  );
}

function UserCards({ users, actions }) {
  const muse = useMuse();
  const { palette } = useThemeMode();
  if (!users.length) return <Empty description="还没有匹配的用户。" />;
  return (
    <Flex vertical gap={12}>
      {users.map(user => (
        <Card hoverable bordered={false} style={{ ...muse.softCard, borderRadius: 14 }} styles={{ body: { padding: 16 } }} key={user.id}>
          <Flex justify="space-between" gap={12} align="center" style={{ marginBottom: 10 }}>
            <Text strong ellipsis={{ tooltip: user.userId }} style={{ fontSize: 15 }}>{user.userId}</Text>
            <StatusBadge status={userStatus(user)} />
          </Flex>
          <div style={{ padding: "10px 0 12px", borderTop: `1px solid ${palette.borderSoft}`, borderBottom: `1px solid ${palette.borderSoft}` }}>
            <MobileUrlBlock value={user.relayPath ? absoluteUrl(user.relayPath) : (user.subscription?.url || "关联 URL 不存在")} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", padding: "12px 0" }}>
            {[
              ["到期", formatDate(user.expiresAt)],
              ["时长", durationLabels[user.duration] || "未知"],
              ["总付款", formatMoney(user.actualPaid)],
              ["购买时间", formatDate(user.purchasedAt)]
            ].map(([label, value]) => (
              <div key={label}>
                <Text type="secondary" style={{ fontSize: 12, display: "block" }}>{label}</Text>
                <Text strong style={{ fontSize: 13 }}>{value}</Text>
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 2 }}>{actions(user)}</div>
        </Card>
      ))}
    </Flex>
  );
}

function UserForm({ item, subscriptions, onClose, onSaved }) {
  const { runAsync, users } = useData();
  const [form] = Form.useForm();
  const useCustomRelay = Form.useWatch("useCustomRelay", form);
  const purchasedAt = Form.useWatch("purchasedAt", form);
  const duration = Form.useWatch("duration", form);

  const { result: recommended, reason: recommendReason } = useMemo(() => {
    if (useCustomRelay || item.id || !purchasedAt || !duration) return { result: null, reason: null };
    const expiresAt = calcExpiry(purchasedAt, duration);
    return findRecommendedSubscription(subscriptions, users, expiresAt);
  }, [purchasedAt, duration, useCustomRelay, item.id, subscriptions, users]);

  async function submit(values) {
    await runAsync(async () => {
      const payload = { ...values, purchasedAt: values.purchasedAt ? values.purchasedAt.format("YYYY-MM-DD") : "" };
      if (item.id) await fetchJson(`/api/users/${item.id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await postJson("/api/users", payload);
      await onSaved();
    }, item.id ? "正在更新用户..." : "正在添加用户...");
  }
  return (
    <Modal title={item.id ? "编辑用户" : "添加用户"} open onCancel={onClose} footer={null} destroyOnHidden width={480}>
      <Form form={form} layout="vertical" initialValues={{
        userId: item.userId || "",
        wechatName: item.wechatName || "",
        imessageId: item.imessageId || "",
        purchasedAt: item.purchasedAt ? dayjs(item.purchasedAt) : dayjs(),
        actualPaid: item.actualPaid ?? "",
        duration: item.duration || "monthly",
        subscriptionId: item.subscriptionId || subscriptions[0]?.id || "",
        useCustomRelay: Boolean(item.useCustomRelay)
      }} onFinish={submit} style={{ marginTop: 8 }}>
        <Flex vertical gap={16}>
          <div style={{ background: "var(--ant-color-fill-tertiary)", borderRadius: 12, padding: "4px 0" }}>
            <Form.Item name="userId" label="用户 ID" rules={[{ required: true, message: "请输入用户 ID" }]} style={{ padding: "10px 16px 0", marginBottom: 0 }}><Input variant="borderless" placeholder="必填" /></Form.Item>
            <div style={{ height: 1, background: "var(--ant-color-border-secondary)", margin: "0 16px" }} />
            <Form.Item name="wechatName" label="微信名" style={{ padding: "10px 16px 0", marginBottom: 0 }}><Input variant="borderless" placeholder="选填" /></Form.Item>
            <div style={{ height: 1, background: "var(--ant-color-border-secondary)", margin: "0 16px" }} />
            <Form.Item name="imessageId" label="iMessage ID" style={{ padding: "10px 16px 4px", marginBottom: 0 }}><Input variant="borderless" placeholder="选填" /></Form.Item>
          </div>

          <div style={{ background: "var(--ant-color-fill-tertiary)", borderRadius: 12, padding: "4px 0" }}>
            <Row gutter={0}>
              <Col xs={24} sm={12} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
                <Form.Item name="purchasedAt" label="购买时间" rules={[{ required: true, message: "请选择购买时间" }]} style={{ padding: "10px 16px 4px", marginBottom: 0 }}>
                  <DatePicker {...inModalPickerProps} variant="borderless" style={{ width: "100%", paddingLeft: 0 }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="actualPaid" label="实付款" rules={[{ required: true, message: "请输入" }]} style={{ padding: "10px 16px 4px", marginBottom: 0 }}>
                  <Input variant="borderless" type="number" min="0" step="0.01" placeholder="0.00" style={{ paddingLeft: 0 }} />
                </Form.Item>
              </Col>
            </Row>
          </div>

          <div style={{ background: "var(--ant-color-fill-tertiary)", borderRadius: 12, padding: "12px 16px" }}>
            <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 10 }}>购买时长</Text>
            <Form.Item name="duration" style={{ marginBottom: 0 }}><DurationRadio purchasedAt={purchasedAt} /></Form.Item>
          </div>

          <div style={{ background: "var(--ant-color-fill-tertiary)", borderRadius: 12, padding: "12px 16px" }}>
            <Form.Item name="useCustomRelay" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Checkbox><Text style={{ fontSize: 14 }}>启用自定义 URL 中转逻辑</Text></Checkbox>
            </Form.Item>
          </div>

          {!useCustomRelay && (
            <div style={{ background: "var(--ant-color-fill-tertiary)", borderRadius: 12, padding: "4px 0" }}>
              {!item.id && (
                <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
                  <Text type={recommended ? "secondary" : "warning"} style={{ fontSize: 12 }}>
                    {recommended ? `推荐：${subscriptionLabel(recommended)}` : (recommendReason || "无匹配池 URL，请手动选择")}
                  </Text>
                </div>
              )}
              <Form.Item name="subscriptionId" label="使用池 URL" rules={[{ required: true, message: "请选择池 URL" }]} style={{ padding: "10px 16px 4px", marginBottom: 0 }}>
                <Select virtual={false} variant="borderless" options={subscriptions.map(s => ({ value: s.id, label: subscriptionLabel(s) }))} style={{ marginLeft: -11 }} />
              </Form.Item>
            </div>
          )}

          <Button type="primary" htmlType="submit" block size="large" style={{ borderRadius: 12, fontWeight: 600 }}>
            {item.id ? "保存" : "添加用户"}
          </Button>
        </Flex>
      </Form>
    </Modal>
  );
}

function RenewForm({ user, subscriptions, onClose, onSaved }) {
  const { runAsync, users } = useData();
  const [form] = Form.useForm();
  const useCustomRelay = Form.useWatch("useCustomRelay", form);
  const purchasedAt = Form.useWatch("purchasedAt", form);
  const duration = Form.useWatch("duration", form);

  const { result: recommended, reason: recommendReason } = useMemo(() => {
    if (useCustomRelay || !purchasedAt || !duration) return { result: null, reason: null };
    const base = user.expiresAt && new Date(user.expiresAt) > purchasedAt.toDate() ? user.expiresAt : purchasedAt;
    const expiresAt = calcExpiry(base, duration);
    return findRecommendedSubscription(subscriptions, users, expiresAt, user.id);
  }, [purchasedAt, duration, useCustomRelay, user.id, user.expiresAt, subscriptions, users]);

  async function submit(values) {
    await runAsync(async () => {
      await postJson(`/api/users/${user.id}/renew`, { ...values, purchasedAt: values.purchasedAt.format("YYYY-MM-DD") });
      await onSaved();
    }, "正在续费用户...");
  }
  return (
    <Modal title={`${user.userId || "用户"} 续费`} open onCancel={onClose} footer={null} destroyOnHidden width={480}>
      <Form form={form} layout="vertical" initialValues={{ purchasedAt: dayjs(), actualPaid: "", duration: user.duration || "monthly", subscriptionId: user.subscriptionId || subscriptions[0]?.id || "", useCustomRelay: Boolean(user.useCustomRelay) }} onFinish={submit} style={{ marginTop: 8 }}>
        <Flex vertical gap={16}>
          <div style={{ background: "var(--ant-color-fill-tertiary)", borderRadius: 12, padding: "4px 0" }}>
            <Row gutter={0}>
              <Col xs={24} sm={12} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
                <Form.Item name="purchasedAt" label="续费时间" rules={[{ required: true, message: "请选择续费时间" }]} style={{ padding: "10px 16px 4px", marginBottom: 0 }}>
                  <DatePicker {...inModalPickerProps} variant="borderless" style={{ width: "100%", paddingLeft: 0 }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="actualPaid" label="实付款" rules={[{ required: true, message: "请输入" }]} style={{ padding: "10px 16px 4px", marginBottom: 0 }}>
                  <Input variant="borderless" type="number" min="0" step="0.01" placeholder="0.00" style={{ paddingLeft: 0 }} />
                </Form.Item>
              </Col>
            </Row>
          </div>

          <div style={{ background: "var(--ant-color-fill-tertiary)", borderRadius: 12, padding: "12px 16px" }}>
            <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 10 }}>续费时长</Text>
            <Form.Item name="duration" style={{ marginBottom: 0 }}>
              <DurationRadio purchasedAt={user.expiresAt && purchasedAt && new Date(user.expiresAt) > purchasedAt.toDate() ? user.expiresAt : purchasedAt} />
            </Form.Item>
          </div>

          <div style={{ background: "var(--ant-color-fill-tertiary)", borderRadius: 12, padding: "12px 16px" }}>
            <Form.Item name="useCustomRelay" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Checkbox><Text style={{ fontSize: 14 }}>启用自定义 URL 中转逻辑</Text></Checkbox>
            </Form.Item>
          </div>

          {!useCustomRelay && (
            <div style={{ background: "var(--ant-color-fill-tertiary)", borderRadius: 12, padding: "4px 0" }}>
              <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
                <Text type={recommended ? "secondary" : "warning"} style={{ fontSize: 12 }}>
                  {recommended ? `推荐：${subscriptionLabel(recommended)}` : (recommendReason || "无匹配池 URL，请手动选择")}
                </Text>
              </div>
              <Form.Item name="subscriptionId" label="使用池 URL" rules={[{ required: true, message: "请选择池 URL" }]} style={{ padding: "10px 16px 4px", marginBottom: 0 }}>
                <Select virtual={false} variant="borderless" options={subscriptions.map(source => ({ value: source.id, label: subscriptionLabel(source) }))} style={{ marginLeft: -11 }} />
              </Form.Item>
            </div>
          )}

          <Button type="primary" htmlType="submit" block size="large" style={{ borderRadius: 12, fontWeight: 600 }}>
            确认续费
          </Button>
        </Flex>
      </Form>
    </Modal>
  );
}

function BillsPage() {
  const { bills, reload, runAsync, busy } = useData();
  const [keyword, setKeyword] = useState("");
  const [month, setMonth] = useState(null);
  const mobile = useResponsiveList();
  const visible = bills.filter(bill => {
    const haystack = `${bill.userLabel || ""} ${bill.description || ""} ${billTypeLabels[bill.type] || ""}`.toLowerCase();
    const billMonth = bill.occurredAt ? bill.occurredAt.slice(0, 7) : "";
    return haystack.includes(keyword.toLowerCase()) && (!month || billMonth === month.format("YYYY-MM"));
  });
  const total = visible.filter(bill => !bill.reversedAt).reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0);

  async function mutate(run) {
    await runAsync(async () => {
      await run();
      await reload();
    }, "正在处理账单操作...");
  }

  const actions = (bill, compact = false) => {
    const Wrap = compact ? InlineActions : CardActions;
    const buttonProps = compact ? { size: "small", style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy } : { style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy };
    return (
      <Wrap>
        {!bill.reversedAt && <Button {...buttonProps} onClick={() => mutate(() => postJson(`/api/bills/${bill.id}/reverse`))}>撤销</Button>}
        <Button {...buttonProps} danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "删除账单", content: "确定删除这笔账单吗？", onOk: () => mutate(() => fetchJson(`/api/bills/${bill.id}`, { method: "DELETE" })) })}>删除</Button>
      </Wrap>
    );
  };

  const columns = [
    { title: "#", render: (_, __, index) => index + 1, width: 64 },
    { title: "账单时间", render: (_, bill) => formatDateTime(bill.occurredAt) },
    { title: "用户", dataIndex: "userLabel" },
    { title: "类型", render: (_, bill) => billTypeLabels[bill.type] || bill.type },
    { title: "金额", render: (_, bill) => <Text type={Number(bill.amount) < 0 ? "danger" : "success"} strong>{formatMoney(bill.amount)}</Text> },
    { title: "时长", render: (_, bill) => durationLabels[bill.duration] || bill.duration || "-" },
    { title: "到期变化", render: (_, bill) => bill.type === "renewal" ? `${formatDate(bill.beforeExpiresAt)} 延至 ${formatDate(bill.afterExpiresAt)}` : formatDate(bill.afterExpiresAt) },
    { title: "状态", render: (_, bill) => bill.reversedAt ? <Tag>已撤销</Tag> : <Tag color="success">有效</Tag> },
    { title: "操作", render: (_, bill) => actions(bill, true), width: 170 }
  ].map(column => ({
    ...column,
    onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }),
    onCell: () => ({ style: { whiteSpace: "nowrap" } })
  }));

  return (
    <PageCard title="账单管理" extra={<Toolbar><DatePicker picker="month" value={month} onChange={setMonth} placeholder="筛选月份" style={{ minWidth: 150 }} /><Input.Search allowClear placeholder="搜索用户、类型或备注" style={{ minWidth: 240 }} onSearch={setKeyword} onChange={event => setKeyword(event.target.value)} /></Toolbar>}>
      {mobile ? <BillCards bills={visible} actions={actions} total={total} /> : <Table size="middle" rowKey="id" columns={columns} dataSource={visible} pagination={tablePagination} scroll={{ x: 1100 }} summary={() => <Table.Summary fixed><Table.Summary.Row><Table.Summary.Cell index={0} colSpan={4}>筛选合计</Table.Summary.Cell><Table.Summary.Cell index={4}><Text strong>{formatMoney(total)}</Text></Table.Summary.Cell><Table.Summary.Cell index={5} colSpan={4}>{visible.length} 笔账单</Table.Summary.Cell></Table.Summary.Row></Table.Summary>} />}
    </PageCard>
  );
}

function BillCards({ bills, actions, total }) {
  const muse = useMuse();
  const { palette } = useThemeMode();
  return (
    <Flex vertical gap={12}>
      <Card hoverable bordered={false} style={muse.softCard}><Statistic title="筛选合计" value={formatMoney(total)} /></Card>
      {!bills.length && <Empty description="还没有匹配的账单。" />}
      {bills.map(bill => (
        <Card hoverable bordered={false} style={{ ...muse.softCard, borderRadius: 14 }} styles={{ body: { padding: 16 } }} key={bill.id}>
          <Flex justify="space-between" gap={12} align="start" style={{ marginBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <Text strong ellipsis={{ tooltip: bill.userLabel }} style={{ display: "block", fontSize: 15 }}>{bill.userLabel}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(bill.occurredAt)}</Text>
            </div>
            <Text type={Number(bill.amount) < 0 ? "danger" : "success"} strong style={{ fontSize: 16, flex: "0 0 auto" }}>{formatMoney(bill.amount)}</Text>
          </Flex>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", padding: "10px 0 12px", borderTop: `1px solid ${palette.borderSoft}`, borderBottom: `1px solid ${palette.borderSoft}` }}>
            {[
              ["类型", billTypeLabels[bill.type] || bill.type],
              ["状态", bill.reversedAt ? "已撤销" : "有效"],
              ["时长", durationLabels[bill.duration] || bill.duration || "-"],
              ["到期变化", bill.type === "renewal" ? `${formatDate(bill.beforeExpiresAt)} → ${formatDate(bill.afterExpiresAt)}` : formatDate(bill.afterExpiresAt)]
            ].map(([label, value]) => (
              <div key={label}>
                <Text type="secondary" style={{ fontSize: 12, display: "block" }}>{label}</Text>
                <Text strong style={{ fontSize: 13 }}>{value}</Text>
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 10 }}>{actions(bill)}</div>
        </Card>
      ))}
    </Flex>
  );
}

function App() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("themeMode") === "dark");
  const palette = darkMode ? THEME_PALETTES.dark : THEME_PALETTES.light;
  const toggleTheme = useCallback(() => {
    setDarkMode(current => {
      const next = !current;
      localStorage.setItem("themeMode", next ? "dark" : "light");
      return next;
    });
  }, []);
  const modeValue = useMemo(() => ({ darkMode, toggleTheme, palette }), [darkMode, toggleTheme, palette]);

  return (
    <ConfigProvider
      theme={{
        algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: palette.primary,
          colorText: palette.text,
          colorTextSecondary: palette.textSecondary,
          colorTextTertiary: palette.textMuted,
          colorBorder: palette.border,
          colorBorderSecondary: palette.borderSoft,
          colorFill: palette.fill,
          colorFillSecondary: palette.fillSecondary,
          colorFillTertiary: palette.fillTertiary,
          colorBgLayout: palette.page,
          colorBgContainer: palette.surface,
          colorBgElevated: palette.surfaceElevated,
          colorBgSpotlight: palette.surfaceElevated,
          borderRadius: 12,
          borderRadiusLG: 16,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif",
          fontSize: 14,
          fontSizeHeading1: 28,
          fontSizeHeading2: 22,
          fontSizeHeading3: 18,
          fontSizeHeading4: 17,
          fontWeightStrong: 600,
          lineHeight: 1.5,
          motionDurationMid: "0.2s",
          motionEaseInOut: "cubic-bezier(0.4, 0, 0.2, 1)"
        },
        components: {
          Layout: { bodyBg: palette.page, headerBg: "transparent", siderBg: "transparent" },
          Card: {
            borderRadiusLG: 18,
            headerFontSize: 15,
            headerFontSizeSM: 14,
            headerHeight: 54,
            colorBgContainer: palette.surface,
            colorBorderSecondary: palette.border
          },
          Menu: {
            itemBorderRadius: 10,
            itemHeight: 40,
            fontSize: 14,
            fontWeightStrong: 600,
            itemBg: "transparent",
            itemColor: palette.textSecondary,
            itemHoverBg: palette.fill,
            itemHoverColor: palette.text,
            itemSelectedBg: darkMode ? "rgba(10,132,255,0.15)" : "rgba(0,122,255,0.1)",
            itemSelectedColor: palette.primary
          },
          Table: {
            headerBg: darkMode ? palette.surfaceElevated : "rgba(120,120,128,0.06)",
            headerColor: palette.textSecondary,
            headerSplitColor: "transparent",
            rowHoverBg: palette.surfaceHover,
            borderColor: palette.borderSoft,
            colorBgContainer: palette.surface,
            cellPaddingBlock: 16,
            cellPaddingInline: 16,
            fontSize: 13,
            borderRadius: 0
          },
          Button: {
            fontWeight: 500,
            controlHeight: 36,
            controlHeightLG: 44,
            borderRadius: 10,
            borderRadiusLG: 12,
            defaultBg: darkMode ? palette.surfaceElevated : "rgba(120,120,128,0.1)",
            defaultColor: palette.text,
            defaultBorderColor: "transparent",
            defaultHoverBg: darkMode ? palette.fill : "rgba(120,120,128,0.15)",
            defaultHoverColor: palette.text,
            defaultHoverBorderColor: "transparent",
            textHoverBg: palette.fill,
            textTextHoverColor: palette.text
          },
          Input: {
            controlHeight: 36,
            colorBgContainer: palette.surface,
            hoverBg: palette.surfaceHover,
            activeBg: palette.surface,
            borderRadius: 10
          },
          Select: {
            controlHeight: 36,
            borderRadius: 10,
            optionSelectedBg: darkMode ? "rgba(10,132,255,0.2)" : "rgba(0,122,255,0.08)",
            optionActiveBg: palette.fill
          },
          DatePicker: {
            controlHeight: 36,
            borderRadius: 10,
            colorBgContainer: palette.surface
          },
          Modal: {
            borderRadiusLG: 20,
            headerBg: palette.surface,
            contentBg: palette.surface
          },
          Tag: {
            borderRadiusSM: 6
          },
          Statistic: {
            titleFontSize: 12,
            contentFontSize: 22
          }
        }
      }}
    >
      <ThemeModeContext.Provider value={modeValue}>
        <AntApp>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/*" element={<RequireAuth><DataProvider><AppLayout /></DataProvider></RequireAuth>} />
            </Routes>
          </BrowserRouter>
        </AntApp>
      </ThemeModeContext.Provider>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")).render(<App />);
