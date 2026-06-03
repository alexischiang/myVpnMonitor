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
  BarsOutlined,
  CalendarOutlined,
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

function createMuse(palette) {
  return {
    app: {
    minHeight: "100dvh",
    background: palette.page
    },
    sider: {
    minHeight: "100dvh",
    background: palette.sidebar,
    padding: "28px 16px 24px"
    },
    header: isMobile => ({
    height: "auto",
    background: palette.page,
    padding: isMobile ? "18px 16px 8px" : "24px 28px 10px",
    lineHeight: 1.3
    }),
    content: isMobile => ({
    padding: isMobile ? "12px 16px 24px" : "14px 28px 28px"
    }),
    card: {
    borderRadius: 16,
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    boxShadow: palette.shadowCard
    },
    softCard: {
    borderRadius: 16,
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    boxShadow: palette.shadowSoft
    },
    brandAvatar: {
    background: palette.primary,
    boxShadow: "0 8px 16px rgba(24, 144, 255, 0.28)"
    },
    menu: {
    borderInlineEnd: 0,
    background: "transparent"
    },
    navDivider: `1px solid ${palette.border}`
  };
}

const iconColorMap = {
  blue: "#1890ff",
  green: "#52c41a",
  orange: "#faad14",
  purple: "#722ed1",
  cyan: "#13c2c2"
};

const tablePagination = { pageSize: 20, showSizeChanger: false };

const THEME_PALETTES = {
  light: {
    primary: "#2563eb",
    page: "#f6f8fb",
    sidebar: "#f6f8fb",
    surface: "#ffffff",
    surfaceElevated: "#ffffff",
    surfaceHover: "#f1f5f9",
    border: "#e2e8f0",
    borderSoft: "#edf2f7",
    text: "#0f172a",
    textSecondary: "#64748b",
    textMuted: "#94a3b8",
    fill: "#e2e8f0",
    fillSecondary: "#f1f5f9",
    fillTertiary: "#f8fafc",
    shadowCard: "0 6px 16px rgba(15, 23, 42, 0.04)",
    shadowSoft: "0 4px 12px rgba(15, 23, 42, 0.03)"
  },
  dark: {
    primary: "#60a5fa",
    page: "#0b1220",
    sidebar: "#0b1220",
    surface: "#111827",
    surfaceElevated: "#172033",
    surfaceHover: "#1f2a3d",
    border: "#334155",
    borderSoft: "#243244",
    text: "#f8fafc",
    textSecondary: "#cbd5e1",
    textMuted: "#94a3b8",
    fill: "#1f2a3d",
    fillSecondary: "#172033",
    fillTertiary: "#223047",
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
    setBusy({ label });
    try {
      return await task();
    } finally {
      setBusy(null);
    }
  }, []);

  const value = useMemo(() => ({ ...state, reload, runAsync }), [state, reload, runAsync]);
  return (
    <DataContext.Provider value={value}>
      {children}
      <Modal open={Boolean(busy)} footer={null} closable={false} centered maskClosable={false}>
        <Flex vertical align="center" gap={14} style={{ padding: "16px 0" }}>
          <Spin size="large" />
          <Text strong>{busy?.label || "处理中..."}</Text>
          <Text type="secondary">请稍候，操作完成后会自动关闭。</Text>
        </Flex>
      </Modal>
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
  const text = value || "未知";
  return (
    <Flex align="center" gap={8}>
      <Tag color="gold">{String(text).slice(-4)}</Tag>
      <Text code ellipsis={{ tooltip: text }}>{text}</Text>
      <Button size="small" icon={<CopyOutlined />} style={{ fontWeight: 400 }} onClick={() => copyText(value || "")}>复制</Button>
    </Flex>
  );
}

function PageCard({ title, extra, children }) {
  const muse = useMuse();
  const { palette } = useThemeMode();
  return (
    <Card
      hoverable
      bordered={false}
      style={muse.card}
      title={<Flex align="center" gap={10}><DashboardOutlined /><Text strong style={{ fontSize: 16 }}>{title}</Text></Flex>}
      extra={extra}
      styles={{ header: { padding: "20px 24px", borderBottomColor: palette.borderSoft }, body: { padding: 24 } }}
    >
      {children}
    </Card>
  );
}

function Toolbar({ children }) {
  return <Flex wrap="nowrap" gap={8} justify="flex-end" align="center">{children}</Flex>;
}

function InlineActions({ children }) {
  return <Flex wrap="nowrap" gap={6} align="center">{children}</Flex>;
}

function CardActions({ children }) {
  return <Flex wrap="wrap" gap={8} align="center">{children}</Flex>;
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
    <AntLayout style={muse.app}>
      <Content>
        <Row justify="center" align="middle" style={{ minHeight: "100dvh", padding: 24 }}>
          <Col xs={22} sm={16} md={10} lg={7} xl={6}>
            <Card hoverable bordered={false} style={muse.card} styles={{ body: { padding: 32 } }}>
        <Flex vertical gap={8}>
          <Avatar size={48} style={muse.brandAvatar}>X</Avatar>
          <Title level={3} style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>XELA monitor</Title>
          <Text type="secondary" style={{ fontSize: 14 }}>订阅中转管理后台</Text>
        </Flex>
        <Form layout="vertical" size="large" onFinish={submit} requiredMark={false}>
          <Form.Item name="account" label="账号" rules={[{ required: true, message: "请输入账号" }]}>
            <Input prefix={<UserOutlined />} autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          {message && <Paragraph type="danger">{message}</Paragraph>}
          <Button type="primary" htmlType="submit" block loading={loading}>登录</Button>
        </Form>
      </Card>
          </Col>
        </Row>
      </Content>
      <Modal open={loading} footer={null} closable={false} centered maskClosable={false}>
        <Flex vertical align="center" gap={14} style={{ padding: "16px 0" }}>
          <Spin size="large" />
          <Text strong>正在登录...</Text>
          <Text type="secondary">请稍候，登录完成后会自动跳转。</Text>
        </Flex>
      </Modal>
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
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>Pages / {menuItems.find(item => item.key === location.pathname)?.label || "Dashboard"}</Text>
                <Title level={4} style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700 }}>订阅中转控制台</Title>
              </div>
            </Flex>
            <Space size={14} wrap>
              <Text type="secondary" style={{ fontSize: 13 }}>Version {meta?.version || "--"}</Text>
              <Button
                type="text"
                shape="circle"
                size="small"
                title={darkMode ? "切换日间模式" : "切换夜间模式"}
                icon={darkMode ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
              />
              <Button icon={<LogoutOutlined />} onClick={logout}>退出</Button>
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
  return (
    <Flex vertical gap={22}>
      <Flex align="center" gap={12} style={{ padding: "0 8px 18px", borderBottom: muse.navDivider }}>
        <Avatar style={muse.brandAvatar}>X</Avatar>
        <Text strong style={{ fontSize: 14 }}>XELA monitor</Text>
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
  const expiringUsers = users.filter(user => userStatus(user) === "warning").length;
  const items = [
    { title: "池 URL", value: subscriptions.length, icon: <ApiOutlined />, color: "blue" },
    { title: "用户", value: users.length, icon: <TeamOutlined />, color: "green" },
    { title: "需关注 URL", value: counts.warning || 0, icon: <BarsOutlined />, color: "orange" },
    { title: "即将到期用户", value: expiringUsers, icon: <CalendarOutlined />, color: "purple" },
    { title: "实付款合计", value: formatMoney(paidTotal), icon: <DollarOutlined />, color: "cyan" }
  ];
  return (
    <Row gutter={[16, 16]}>
      {items.map(item => (
        <Col xs={24} sm={12} xl={Math.floor(24 / items.length)} key={item.title}>
          <Card hoverable bordered={false} style={muse.softCard} styles={{ body: { padding: "18px 20px" } }}>
            <Flex justify="space-between" align="center">
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</Text>}
                value={item.value}
                valueStyle={{ fontSize: 24, fontWeight: 700, lineHeight: 1.15, color: palette.text }}
              />
              <Avatar size={42} icon={item.icon} style={{ background: iconColorMap[item.color] || palette.primary, boxShadow: "0 8px 16px rgba(24, 144, 255, 0.18)" }} />
            </Flex>
          </Card>
        </Col>
      ))}
    </Row>
  );
}

function useResponsiveList() {
  const screens = Grid.useBreakpoint();
  return !screens.md;
}

function UrlPoolPage() {
  const { subscriptions, reload, runAsync } = useData();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(null);
  const [debug, setDebug] = useState(null);
  const mobile = useResponsiveList();
  const visible = subscriptions.filter(item => `${item.email || ""} ${item.url || ""} ${item.note || ""}`.toLowerCase().includes(keyword.toLowerCase()));

  async function action(run) {
    await runAsync(async () => {
      await run();
      await reload();
    }, "正在处理 URL 池操作...");
  }

  async function showCache(item) {
    await runAsync(async () => {
      try {
        const payload = await fetchJson(`/api/subscriptions/${item.id}/cache`);
      setDebug({
        title: `${item.email || "池 URL"} 缓存`,
        content: [
          `HTTP 状态：${payload.status || "未知"}`,
          `客户端：${payload.client || "未知"}`,
          `存储位置：${payload.storage || "未知"}${payload.bodyFile ? ` (${payload.bodyFile})` : ""}`,
          `缓存时间：${formatDateTime(payload.fetchedAt)}`,
          `长度：${payload.bodyLength}${payload.truncated ? "（已截断）" : ""}`,
          "",
          payload.body || "（空）"
        ].join("\n")
      });
      } catch (error) {
        setDebug({ title: "缓存为空", content: error.message });
      }
    }, "正在读取缓存...");
  }

  async function showDebug(item) {
    await runAsync(async () => {
      const payload = await fetchJson(`/api/subscriptions/${item.id}/debug`);
      setDebug({ title: "订阅返回信息", content: JSON.stringify(payload, null, 2) });
    }, "正在读取返回信息...");
  }

  const actions = (item, compact = false) => {
    const Wrap = compact ? InlineActions : CardActions;
    const buttonProps = compact ? { size: "small", style: { fontWeight: 400 } } : { style: { fontWeight: 400 } };
    return (
      <Wrap>
        <Button {...buttonProps} icon={<EditOutlined />} onClick={() => setEditing(item)}>编辑</Button>
        <Button {...buttonProps} icon={<ReloadOutlined />} onClick={() => action(() => postJson(`/api/subscriptions/${item.id}/refresh`))}>状态</Button>
        <Button {...buttonProps} icon={<RetweetOutlined />} onClick={() => action(() => postJson(`/api/subscriptions/${item.id}/refresh-cache`))}>缓存</Button>
        <Button {...buttonProps} icon={<EyeOutlined />} onClick={() => showCache(item)}>查看</Button>
        <Button {...buttonProps} onClick={() => showDebug(item)}>返回</Button>
        <Button {...buttonProps} danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "删除池 URL", content: "确定删除这个池 URL 吗？", onOk: () => action(() => fetchJson(`/api/subscriptions/${item.id}`, { method: "DELETE" })) })}>删除</Button>
      </Wrap>
    );
  };

  const columns = [
    { title: "#", render: (_, __, index) => index + 1, width: 64 },
    { title: "邮箱", dataIndex: "email", render: (_, item) => item.email || item.name || "未填写", width: 160 },
    { title: "池 URL", dataIndex: "url", render: value => <UrlText value={value} />, width: 320 },
    { title: "客户数", dataIndex: "customerCount", render: value => value || 0, width: 82 },
    { title: "剩余流量", render: (_, item) => item.status === "expired" ? "-" : formatBytes(item.metrics?.remainingBytes), width: 105 },
    { title: "到期", render: (_, item) => item.status === "expired" ? "-" : formatDate(item.metrics?.expireAt), width: 120 },
    { title: "状态", dataIndex: "status", render: value => <StatusBadge status={value} />, width: 90 },
    { title: "缓存", render: (_, item) => item.cachedConfig?.fetchedAt ? `${formatDateTime(item.cachedConfig.fetchedAt)} · ${formatBytes(item.cachedConfig.bodyLength || item.cachedConfig.body?.length || 0)}` : "未缓存", width: 210 },
    { title: "操作", render: (_, item) => actions(item, true), width: 370 }
  ].map(column => ({
    ...column,
    onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }),
    onCell: () => ({ style: { whiteSpace: "nowrap" } })
  }));

  return (
    <PageCard title="URL 池" extra={<Toolbar><Input.Search allowClear placeholder="搜索 URL、邮箱或备注" style={{ width: 210 }} onSearch={setKeyword} onChange={event => setKeyword(event.target.value)} /><Button icon={<ReloadOutlined />} onClick={() => action(() => postJson("/api/subscriptions/cache-refresh"))}>刷新缓存</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>添加 URL</Button></Toolbar>}>
      {mobile ? <PoolCards items={visible} actions={actions} /> : <Table size="middle" rowKey="id" columns={columns} dataSource={visible} pagination={tablePagination} scroll={{ x: 1520 }} />}
      {editing && <SubscriptionForm item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
      {debug && <DebugModal title={debug.title} content={debug.content} onClose={() => setDebug(null)} />}
    </PageCard>
  );
}

function PoolCards({ items, actions }) {
  const muse = useMuse();
  if (!items.length) return <Empty description="还没有池 URL。" />;
  return (
    <Flex vertical gap={12}>
      {items.map(item => (
        <Card hoverable bordered={false} style={muse.softCard} key={item.id}>
          <Flex justify="space-between" gap={12} align="start">
            <div><Text strong>{item.email || item.name || "未填写"}</Text><br /><Text type="secondary">{item.customerCount || 0} 个客户</Text></div>
            <StatusBadge status={item.status} />
          </Flex>
          <UrlText value={item.url} />
          <Descriptions size="small" column={1}>
            <Descriptions.Item label="剩余流量">{item.status === "expired" ? "-" : formatBytes(item.metrics?.remainingBytes)}</Descriptions.Item>
            <Descriptions.Item label="到期">{item.status === "expired" ? "-" : formatDate(item.metrics?.expireAt)}</Descriptions.Item>
            <Descriptions.Item label="缓存">{item.cachedConfig?.fetchedAt ? formatDateTime(item.cachedConfig.fetchedAt) : "未缓存"}</Descriptions.Item>
          </Descriptions>
          {actions(item)}
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
  const { customUrls, subscriptions, reload, runAsync } = useData();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(null);
  const [debug, setDebug] = useState(null);
  const mobile = useResponsiveList();
  const visible = customUrls.filter(item => `${item.name || ""} ${item.note || ""} ${item.source?.url || ""}`.toLowerCase().includes(keyword.toLowerCase()));

  async function preview(item) {
    await runAsync(async () => {
      const payload = await fetchJson(`/api/custom-urls/${item.id}/preview`);
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
    const buttonProps = compact ? { size: "small", style: { fontWeight: 400 } } : { style: { fontWeight: 400 } };
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
    { title: "名称", dataIndex: "name" },
    { title: "自定义 URL", render: (_, item) => <UrlText value={absoluteUrl(item.publicPath)} />, width: 320 },
    { title: "池 URL", render: (_, item) => <UrlText value={item.source?.url || "池 URL 不存在"} />, width: 320 },
    { title: "到期", render: (_, item) => item.expiresAt ? formatDateTime(item.expiresAt) : "长期有效" },
    { title: "缓存", render: (_, item) => item.source?.cache?.fetchedAt ? `${formatDateTime(item.source.cache.fetchedAt)} · ${formatBytes(item.source.cache.bodyLength || 0)}` : "未缓存", width: 230 },
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
      {debug && <DebugModal title={debug.title} content={debug.content} onClose={() => setDebug(null)} />}
    </PageCard>
  );
}

function CustomUrlCards({ items, actions }) {
  const muse = useMuse();
  if (!items.length) return <Empty description="还没有自定义 URL。" />;
  return (
    <Flex vertical gap={12}>
      {items.map(item => (
        <Card hoverable bordered={false} style={muse.softCard} key={item.id}>
          <Flex justify="space-between" gap={12}><Text strong>{item.name}</Text>{item.enabled === false ? <Tag>已停用</Tag> : <Tag color="success">正常</Tag>}</Flex>
          <UrlText value={absoluteUrl(item.publicPath)} />
          <UrlText value={item.source?.url || "池 URL 不存在"} />
          <Descriptions size="small" column={1}>
            <Descriptions.Item label="到期">{item.expiresAt ? formatDateTime(item.expiresAt) : "长期有效"}</Descriptions.Item>
            <Descriptions.Item label="缓存">{item.source?.cache?.fetchedAt ? formatDateTime(item.source.cache.fetchedAt) : "未缓存"}</Descriptions.Item>
          </Descriptions>
          {actions(item)}
        </Card>
      ))}
    </Flex>
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
          <Col xs={24} md={12}><Form.Item name="sourceSubscriptionId" label="池 URL" rules={[{ required: true, message: "请选择池 URL" }]}><Select options={subscriptions.map(source => ({ value: source.id, label: source.email || source.url }))} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="expiresAt" label="到期时间"><DatePicker showTime style={{ width: "100%" }} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="mode" label="Clash mode"><Select options={[{ value: "", label: "保持原配置" }, { value: "Rule", label: "Rule" }, { value: "Global", label: "Global" }, { value: "Direct", label: "Direct" }]} /></Form.Item></Col>
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
  const { users, subscriptions, reload, runAsync } = useData();
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
    const buttonProps = compact ? { size: "small", style: { fontWeight: 400 } } : { style: { fontWeight: 400 } };
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
    { title: "客户订阅 URL", render: (_, user) => <UrlText value={absoluteUrl(user.relayPath || user.subscription?.relayPath) || user.subscription?.url || "关联 URL 不存在"} />, width: 320 },
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
  if (!users.length) return <Empty description="还没有匹配的用户。" />;
  return (
    <Flex vertical gap={12}>
      {users.map(user => (
        <Card hoverable bordered={false} style={muse.softCard} key={user.id}>
          <Flex justify="space-between" gap={12}><Text strong>{user.userId}</Text><StatusBadge status={userStatus(user)} /></Flex>
          <UrlText value={absoluteUrl(user.relayPath || user.subscription?.relayPath) || user.subscription?.url || "关联 URL 不存在"} />
          <Descriptions size="small" column={1}>
            <Descriptions.Item label="到期">{formatDate(user.expiresAt)}</Descriptions.Item>
            <Descriptions.Item label="时长">{durationLabels[user.duration] || "未知"}</Descriptions.Item>
            <Descriptions.Item label="总付款">{formatMoney(user.actualPaid)}</Descriptions.Item>
            <Descriptions.Item label="购买时间">{formatDate(user.purchasedAt)}</Descriptions.Item>
          </Descriptions>
          {actions(user)}
        </Card>
      ))}
    </Flex>
  );
}

function UserForm({ item, subscriptions, onClose, onSaved }) {
  const { runAsync } = useData();
  async function submit(values) {
    await runAsync(async () => {
      const payload = { ...values, purchasedAt: values.purchasedAt ? values.purchasedAt.format("YYYY-MM-DD") : "" };
      if (item.id) await fetchJson(`/api/users/${item.id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await postJson("/api/users", payload);
      await onSaved();
    }, item.id ? "正在更新用户..." : "正在添加用户...");
  }
  return (
    <Modal title={item.id ? "编辑用户" : "添加用户"} open onCancel={onClose} footer={null} destroyOnHidden>
      <Form layout="vertical" initialValues={{
        userId: item.userId || "",
        wechatName: item.wechatName || "",
        imessageId: item.imessageId || "",
        purchasedAt: item.purchasedAt ? dayjs(item.purchasedAt) : dayjs(),
        actualPaid: item.actualPaid ?? "",
        duration: item.duration || "monthly",
        subscriptionId: item.subscriptionId || subscriptions[0]?.id || "",
        useCustomRelay: Boolean(item.useCustomRelay)
      }} onFinish={submit}>
        <Form.Item name="userId" label="用户 ID" rules={[{ required: true, message: "请输入用户 ID" }]}><Input /></Form.Item>
        <Form.Item name="wechatName" label="微信名"><Input /></Form.Item>
        <Form.Item name="imessageId" label="iMessage ID"><Input /></Form.Item>
        <Row gutter={16}>
          <Col xs={24} sm={12}><Form.Item name="purchasedAt" label="购买时间" rules={[{ required: true, message: "请选择购买时间" }]}><DatePicker style={{ width: "100%" }} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="actualPaid" label="实付款" rules={[{ required: true, message: "请输入付款金额" }]}><Input type="number" min="0" step="0.01" /></Form.Item></Col>
        </Row>
        <Form.Item name="duration" label="购买时长"><Select options={Object.entries(durationLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="subscriptionId" label="使用池 URL" rules={[{ required: true, message: "请选择池 URL" }]}><Select options={subscriptions.map(source => ({ value: source.id, label: source.email || source.url }))} /></Form.Item>
        <Form.Item name="useCustomRelay" valuePropName="checked">
          <Checkbox>启用自定义 URL 中转逻辑</Checkbox>
        </Form.Item>
        <Flex justify="end"><Button type="primary" htmlType="submit">保存</Button></Flex>
      </Form>
    </Modal>
  );
}

function RenewForm({ user, subscriptions, onClose, onSaved }) {
  const { runAsync } = useData();
  async function submit(values) {
    await runAsync(async () => {
      await postJson(`/api/users/${user.id}/renew`, { ...values, purchasedAt: values.purchasedAt.format("YYYY-MM-DD") });
      await onSaved();
    }, "正在续费用户...");
  }
  return (
    <Modal title={`${user.userId || "用户"} 续费`} open onCancel={onClose} footer={null} destroyOnHidden>
      <Form layout="vertical" initialValues={{ purchasedAt: dayjs(), actualPaid: "", duration: user.duration || "monthly", subscriptionId: user.subscriptionId || subscriptions[0]?.id || "", useCustomRelay: Boolean(user.useCustomRelay) }} onFinish={submit}>
        <Form.Item name="purchasedAt" label="续费时间" rules={[{ required: true, message: "请选择续费时间" }]}><DatePicker style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="actualPaid" label="实付款" rules={[{ required: true, message: "请输入付款金额" }]}><Input type="number" min="0" step="0.01" /></Form.Item>
        <Form.Item name="duration" label="续费时长"><Select options={Object.entries(durationLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="subscriptionId" label="使用池 URL" rules={[{ required: true, message: "请选择池 URL" }]}><Select options={subscriptions.map(source => ({ value: source.id, label: source.email || source.url }))} /></Form.Item>
        <Form.Item name="useCustomRelay" valuePropName="checked">
          <Checkbox>启用自定义 URL 中转逻辑</Checkbox>
        </Form.Item>
        <Flex justify="end"><Button type="primary" htmlType="submit">确认续费</Button></Flex>
      </Form>
    </Modal>
  );
}

function BillsPage() {
  const { bills, reload, runAsync } = useData();
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
    const buttonProps = compact ? { size: "small", style: { fontWeight: 400 } } : { style: { fontWeight: 400 } };
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
  return (
    <Flex vertical gap={12}>
      <Card hoverable bordered={false} style={muse.softCard}><Statistic title="筛选合计" value={formatMoney(total)} /></Card>
      {!bills.length && <Empty description="还没有匹配的账单。" />}
      {bills.map(bill => (
        <Card hoverable bordered={false} style={muse.softCard} key={bill.id}>
          <Flex justify="space-between" gap={12}><div><Text strong>{bill.userLabel}</Text><br /><Text type="secondary">{formatDateTime(bill.occurredAt)}</Text></div><Text type={Number(bill.amount) < 0 ? "danger" : "success"} strong>{formatMoney(bill.amount)}</Text></Flex>
          <Descriptions size="small" column={1}>
            <Descriptions.Item label="类型">{billTypeLabels[bill.type] || bill.type}</Descriptions.Item>
            <Descriptions.Item label="时长">{durationLabels[bill.duration] || bill.duration || "-"}</Descriptions.Item>
            <Descriptions.Item label="到期变化">{bill.type === "renewal" ? `${formatDate(bill.beforeExpiresAt)} 延至 ${formatDate(bill.afterExpiresAt)}` : formatDate(bill.afterExpiresAt)}</Descriptions.Item>
            <Descriptions.Item label="状态">{bill.reversedAt ? "已撤销" : "有效"}</Descriptions.Item>
          </Descriptions>
          {actions(bill)}
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
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
          fontSize: 14,
          fontSizeHeading1: 30,
          fontSizeHeading2: 24,
          fontSizeHeading3: 20,
          fontSizeHeading4: 18,
          fontWeightStrong: 700,
          lineHeight: 1.55
        },
        components: {
          Layout: { bodyBg: palette.page, headerBg: "transparent", siderBg: "transparent" },
          Card: {
            borderRadiusLG: 16,
            headerFontSize: 16,
            headerFontSizeSM: 15,
            headerHeight: 58,
            colorBgContainer: palette.surface,
            colorBorderSecondary: palette.borderSoft
          },
          Menu: {
            itemBorderRadius: 10,
            itemHeight: 44,
            fontSize: 14,
            fontWeightStrong: 700,
            itemBg: "transparent",
            itemColor: darkMode ? palette.textSecondary : undefined,
            itemHoverBg: darkMode ? palette.surfaceHover : undefined,
            itemHoverColor: darkMode ? palette.text : undefined,
            itemSelectedBg: darkMode ? palette.primary : undefined,
            itemSelectedColor: darkMode ? "#ffffff" : undefined
          },
          Table: {
            headerBg: darkMode ? palette.surface : "#fafafa",
            headerColor: palette.textSecondary,
            headerSplitColor: palette.border,
            rowHoverBg: palette.surfaceHover,
            borderColor: palette.borderSoft,
            colorBgContainer: palette.surface,
            cellPaddingBlock: 18,
            cellPaddingInline: 16,
            fontSize: 13
          },
          Button: {
            fontWeight: 600,
            controlHeight: 38,
            controlHeightLG: 44,
            defaultBg: palette.surfaceElevated,
            defaultColor: palette.text,
            defaultBorderColor: palette.border,
            defaultHoverBg: palette.surfaceHover,
            defaultHoverColor: palette.text,
            defaultHoverBorderColor: palette.border,
            textHoverBg: palette.surfaceHover,
            textTextHoverColor: palette.text
          },
          Input: {
            controlHeight: 38,
            colorBgContainer: palette.surface,
            hoverBg: palette.surfaceHover,
            activeBg: palette.surface
          },
          Select: {
            controlHeight: 38,
            optionSelectedBg: darkMode ? palette.primary : undefined,
            optionActiveBg: palette.surfaceHover
          },
          DatePicker: {
            controlHeight: 38,
            colorBgContainer: palette.surface
          },
          Statistic: {
            titleFontSize: 13,
            contentFontSize: 24
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
