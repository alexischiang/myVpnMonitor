import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
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
  Divider,
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
              padding: "10px 12px",
              borderRadius: 6,
              border: `1px solid ${selected ? "var(--ant-color-text)" : "var(--ant-color-border-secondary)"}`,
              background: selected ? "var(--ant-color-fill-tertiary)" : "var(--ant-color-bg-container)",
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
          >
            <Text strong style={{ fontSize: 14, color: selected ? "var(--ant-color-text)" : undefined }}>{label}</Text>
            {expiry && <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 2 }}>到 {formatDate(expiry)}</Text>}
          </div>
        );
      })}
    </div>
  );
}

function subscriptionLabel(s) {
  const tail = s.url ? s.url.slice(-4) : "????";
  const expire = s.metrics?.expireAt ? formatDate(s.metrics.expireAt) : "未知到期";
  const email = s.email || "无邮箱";
  return `${tail} · ${expire} · ${email}`;
}
const inModalPickerProps = {};

const GROUP = { background: "var(--ant-color-bg-container)", border: "1px solid var(--ant-color-border-secondary)", borderRadius: 8, padding: "4px 0", overflow: "hidden" };
const GROUP_ITEM = { padding: "10px 16px 6px", marginBottom: 0 };
const GROUP_SEP = { height: 1, background: "var(--ant-color-border-secondary)", margin: "0 16px" };
const TEXTAREA_GROUP = { background: "var(--ant-color-bg-container)", border: "1px solid var(--ant-color-border-secondary)", borderRadius: 8, padding: "12px 16px" };

const modalFormStyles = {
  header: { paddingBottom: 16, borderBottom: "1px solid var(--ant-color-border-secondary)", marginBottom: 0 },
  body: { paddingTop: 20 }
};

function createMuse(palette) {
  return {
    app: { minHeight: "100dvh", background: palette.page },
    sider: {
      minHeight: "100dvh",
      background: palette.sidebar,
      padding: "24px 12px",
      borderRight: `1px solid ${palette.border}`
    },
    header: isMobile => ({
      height: "auto",
      background: palette.page,
      padding: isMobile
        ? "calc(18px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) 12px calc(16px + env(safe-area-inset-left))"
        : "26px 32px 14px",
      lineHeight: 1.3
    }),
    content: isMobile => ({
      padding: isMobile
        ? "12px calc(16px + env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))"
        : "16px 24px 40px",
      width: "100%",
      margin: "0 auto"
    }),
    card: {
      borderRadius: 8,
      background: palette.surface,
      border: `1px solid ${palette.border}`,
      boxShadow: palette.shadowCard
    },
    softCard: {
      borderRadius: 8,
      background: palette.surface,
      border: `1px solid ${palette.border}`,
      boxShadow: palette.shadowSoft
    },
    pageSection: {
      background: palette.surface,
      border: `1px solid ${palette.border}`,
      borderRadius: 8,
      overflow: "hidden"
    },
    pageHeader: {
      padding: "16px 20px",
      borderBottom: `1px solid ${palette.border}`,
      background: palette.surface
    },
    pageBody: {
      padding: 20
    },
    brandAvatar: {
      background: palette.action,
      color: palette.surface
    },
    menu: { borderInlineEnd: 0, background: "transparent" },
    navDivider: `1px solid ${palette.border}`
  };
}

const tablePagination = { pageSize: 20, showSizeChanger: false };

const resizableTableComponents = {
  header: {
    cell: ResizableHeaderCell
  }
};

function columnStorageKey(column, index) {
  if (column.key) return String(column.key);
  if (Array.isArray(column.dataIndex)) return column.dataIndex.join(".");
  if (column.dataIndex) return String(column.dataIndex);
  if (typeof column.title === "string") return column.title;
  return `column-${index}`;
}

function ResizableHeaderCell({ width, onResizeColumn, children, style, ...restProps }) {
  function handleMouseDown(event) {
    if (!width || !onResizeColumn) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = width;

    function handleMouseMove(moveEvent) {
      const nextWidth = Math.max(72, Math.round(startWidth + moveEvent.clientX - startX));
      onResizeColumn(nextWidth);
    }

    function handleMouseUp() {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.classList.remove("is-resizing-table-column");
    }

    document.body.classList.add("is-resizing-table-column");
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <th {...restProps} style={{ ...style, width }}>
      <span className="resizable-table-title">{children}</span>
      {width ? <span className="resizable-table-handle" onMouseDown={handleMouseDown} /> : null}
    </th>
  );
}

function useResizableColumns(columns, storageKey) {
  const [widths, setWidths] = useState(() => {
    if (typeof window === "undefined" || !storageKey) return {};
    try {
      return JSON.parse(localStorage.getItem(`table-widths:${storageKey}`) || "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (typeof window === "undefined" || !storageKey) return;
    localStorage.setItem(`table-widths:${storageKey}`, JSON.stringify(widths));
  }, [storageKey, widths]);

  const resizableColumns = useMemo(() => columns.map((column, index) => {
    const key = columnStorageKey(column, index);
    const width = widths[key] || column.width || 140;
    const originalHeaderCell = column.onHeaderCell;
    return {
      ...column,
      key,
      width,
      onHeaderCell: currentColumn => ({
        ...(typeof originalHeaderCell === "function" ? originalHeaderCell(currentColumn) : {}),
        width,
        onResizeColumn: nextWidth => {
          setWidths(currentWidths => ({ ...currentWidths, [key]: nextWidth }));
        }
      })
    };
  }), [columns, widths]);

  const scrollX = useMemo(() => resizableColumns.reduce((sum, column) => sum + (Number(column.width) || 140), 0), [resizableColumns]);

  return { columns: resizableColumns, components: resizableTableComponents, scrollX };
}

const THEME_PALETTES = {
  light: {
    primary: "#0071e3",
    action: "#000000",
    actionHover: "#4f4e4a",
    page: "#ffffff",
    sidebar: "#ffffff",
    surface: "#ffffff",
    surfaceElevated: "#ffffff",
    surfaceHover: "#f5f5f5",
    border: "#e7e6e2",
    borderSoft: "#e7e6e2",
    text: "#292827",
    textSecondary: "#4f4e4a",
    textMuted: "#9e9c98",
    fill: "#f5f5f5",
    fillSecondary: "#e7e6e2",
    fillTertiary: "#f5f5f5",
    shadowCard: "none",
    shadowSoft: "none"
  },
  dark: {
    primary: "#60a5fa",
    action: "#ffffff",
    actionHover: "#e7e6e2",
    page: "#101010",
    sidebar: "#151515",
    surface: "#181818",
    surfaceElevated: "#202020",
    surfaceHover: "#242424",
    border: "rgba(231,230,226,0.16)",
    borderSoft: "rgba(231,230,226,0.12)",
    text: "#f5f5f5",
    textSecondary: "#cbc9c4",
    textMuted: "#9e9c98",
    fill: "rgba(245,245,245,0.08)",
    fillSecondary: "rgba(245,245,245,0.10)",
    fillTertiary: "rgba(245,245,245,0.06)",
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
      styles={{ content: { borderRadius: 8, padding: "28px 24px 24px" } }}>
      <Flex vertical align="center" gap={20}>
        <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--ant-color-fill-tertiary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spin size="default" />
        </div>
        <Flex vertical align="center" gap={6} style={{ width: "100%" }}>
          <Text strong style={{ fontSize: 16 }}>{busy?.label || "处理中..."}</Text>
          <Progress percent={progress} showInfo={false} strokeColor="var(--ant-color-primary)" trailColor="var(--ant-color-fill-secondary)" strokeLinecap="round" style={{ width: "100%", margin: "4px 0" }} />
          <Text type="secondary" style={{ fontSize: 12 }}>请稍候，完成后自动关闭</Text>
        </Flex>
      </Flex>
    </Modal>
  );
}

function DataProvider({ children }) {
  const [state, setState] = useState({ subscriptions: [], users: [], bills: [], meta: null, loading: true, error: "" });
  const [busy, setBusy] = useState(null);

  const collectionApis = useMemo(() => ({
    subscriptions: "/api/subscriptions",
    users: "/api/users",
    bills: "/api/bills",
    meta: "/api/app-meta"
  }), []);

  const reload = useCallback(async (collections = null) => {
    const keys = collections || ["subscriptions", "users", "bills", "meta"];
    setState(current => ({ ...current, loading: !collections, error: "" }));
    try {
      const results = await Promise.all(keys.map(k => fetchJson(collectionApis[k])));
      setState(current => {
        const patch = {};
        keys.forEach((k, i) => { patch[k] = results[i]; });
        return { ...current, ...patch, loading: false, error: "" };
      });
    } catch (error) {
      setState(current => ({ ...current, loading: false, error: error.message }));
    }
  }, [collectionApis]);

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
  return <CopyableUrlPill value={value} />;
}

function CopyableUrlPill({ value, className = "" }) {
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
    <div className={`copyable-url ${className}`}>
      <Text code className="copyable-url-text">{text}</Text>
      <Button className="copyable-url-button" size="small" icon={copied ? <CheckOutlined /> : <CopyOutlined />} style={copied ? { color: "#52c41a", borderColor: "#52c41a" } : {}} onClick={handleCopy} />
    </div>
  );
}

function MobileUrlBlock({ value }) {
  return <CopyableUrlPill value={value} className="copyable-url-mobile" />;
}

function renderYamlLine(line) {
  if (!line) return " ";
  const commentIndex = line.indexOf("#");
  const source = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";
  const keyMatch = source.match(/^(\s*-?\s*)([A-Za-z0-9_.-]+)(\s*:\s*)(.*)$/);
  if (keyMatch) {
    return (
      <>
        {keyMatch[1]}
        <span className="code-token-key">{keyMatch[2]}</span>
        <span className="code-token-punctuation">{keyMatch[3]}</span>
        {renderYamlValue(keyMatch[4])}
        {comment && <span className="code-token-comment">{comment}</span>}
      </>
    );
  }
  return (
    <>
      {renderYamlValue(source)}
      {comment && <span className="code-token-comment">{comment}</span>}
    </>
  );
}

function renderYamlValue(value) {
  if (!value) return value;
  const parts = value.split(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\btrue\b|\bfalse\b|\bnull\b|-?\b\d+(?:\.\d+)?\b)/gi);
  return parts.map((part, index) => {
    if (!part) return null;
    if (/^'.*'$|^".*"$/.test(part)) return <span className="code-token-string" key={index}>{part}</span>;
    if (/^(true|false)$/i.test(part)) return <span className="code-token-boolean" key={index}>{part}</span>;
    if (/^null$/i.test(part)) return <span className="code-token-null" key={index}>{part}</span>;
    if (/^-?\d+(?:\.\d+)?$/.test(part)) return <span className="code-token-number" key={index}>{part}</span>;
    return part;
  });
}

function CodeViewer({ code, meta, language = "YAML" }) {
  const { message } = AntApp.useApp();
  const [copied, setCopied] = useState(false);
  const lines = String(code || "").split("\n");

  function handleCopy() {
    copyText(code || "").then(() => {
      message.success("已复制");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="code-viewer">
      <div className="code-viewer-toolbar">
        <div className="code-viewer-tabs">
          <span className="code-viewer-tab code-viewer-tab-active">{language}</span>
        </div>
        <Button type="text" size="small" icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={handleCopy} />
      </div>
      {meta && <div className="code-viewer-meta">{meta}</div>}
      <pre className="code-viewer-body" aria-label={`${language} code`}>
        {lines.map((line, index) => (
          <div className="code-viewer-line" key={`${index}-${line.slice(0, 12)}`}>
            <span className="code-viewer-line-number">{index + 1}</span>
            <code>{renderYamlLine(line)}</code>
          </div>
        ))}
      </pre>
    </div>
  );
}

function userOutputMode(user) {
  return user?.subconverterConfig?.target ? "subconverter" : "direct";
}

function userClientSubscriptionUrl(user) {
  if (userOutputMode(user) === "subconverter") {
    return user.relayPath ? absoluteUrl(user.relayPath) : "自定义 URL 不存在";
  }
  return user.subscription?.url || "关联 URL 不存在";
}

function PageCard({ title, extra, children }) {
  const muse = useMuse();
  const screens = Grid.useBreakpoint();
  const mobile = !screens.md;
  return (
    <section style={muse.pageSection}>
      <div style={muse.pageHeader}>
        <Flex align={mobile ? "stretch" : "center"} justify="space-between" gap={12} vertical={mobile}>
          <Text strong style={{ fontSize: 16, lineHeight: 1.4 }}>{title}</Text>
          {extra ? <div style={{ width: mobile ? "100%" : "auto" }}>{extra}</div> : null}
        </Flex>
      </div>
      <div style={muse.pageBody}>{children}</div>
    </section>
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
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500
          }
        });
      })}
    </Flex>
  );
}

function PoolDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const { darkMode, palette } = useThemeMode();
  const { subscriptions, users, reload, runAsync } = useData();
  const [cache, setCache] = useState(null);
  const [refreshingTraffic, setRefreshingTraffic] = useState(false);
  const item = subscriptions.find(entry => entry.id === id);
  const boundUsers = item ? users.filter(user => user.subscriptionId === item.id) : [];
  const userColumns = [
    { title: "用户 ID", dataIndex: "userId" },
    { title: "微信名", dataIndex: "wechatName", render: v => v || "—" },
    { title: "到期", render: (_, u) => formatDate(u.expiresAt) },
    { title: "状态", render: (_, u) => <StatusBadge status={userStatus(u)} /> },
  ];
  const boundUserTable = useResizableColumns(userColumns, "url-detail-bound-users");

  useEffect(() => {
    if (!item?.id) return;
    let cancelled = false;
    runAsync(async () => {
      const result = await fetchJson(`/api/subscriptions/${item.id}/cache`).catch(error => ({ error: error.message }));
      if (!cancelled) setCache(result);
    }, "正在读取详情...");
    return () => {
      cancelled = true;
    };
  }, [item?.id, runAsync]);

  if (!item) {
    return (
      <PageCard title="URL 详情">
        <Empty description="没有找到这条池 URL。" />
      </PageCard>
    );
  }

  async function refreshTraffic() {
    setRefreshingTraffic(true);
    try {
      await runAsync(async () => {
        await postJson(`/api/subscriptions/${item.id}/refresh`);
        await reload(["subscriptions"]);
      }, "正在刷新 URL 数据...");
    } finally {
      setRefreshingTraffic(false);
    }
  }

  const m = item.metrics || {};
  const trafficPercent = m.totalBytes ? Math.max(0, Math.min(100, Math.round((m.remainingBytes || 0) / m.totalBytes * 100))) : 0;
  const usedPercent = m.totalBytes ? Math.max(0, Math.min(100, Math.round((m.usedBytes || 0) / m.totalBytes * 100))) : 0;
  const detailTone = darkMode
    ? {
      panel: palette.surface,
      panelSoft: palette.fillTertiary,
      border: palette.border,
      title: "#f5f5f5",
      text: "#e5e5e5",
      muted: palette.textMuted,
      mutedStrong: palette.textSecondary
    }
    : {
      panel: palette.surface,
      panelSoft: palette.fillTertiary,
      border: palette.border,
      title: palette.text,
      text: palette.text,
      muted: palette.textMuted,
      mutedStrong: palette.textSecondary
    };
  const isNarrow = !screens.lg;
  const isMobileDetail = !screens.md;
  const detailSingleColumn = !screens.xl;
  const sectionTitleStyle = {
    margin: 0,
    color: detailTone.title,
    fontSize: 18,
    lineHeight: 1.35,
    fontWeight: 600
  };
  const keyTextStyle = {
    color: detailTone.muted,
    fontSize: 14,
    lineHeight: 1.55,
    fontWeight: 400
  };
  const valueTextStyle = {
    color: detailTone.text,
    fontSize: 14,
    lineHeight: 1.45,
    fontWeight: 500
  };
  const sectionStyle = {
    padding: isNarrow ? "22px 0" : "26px 0",
    borderTop: `1px solid ${detailTone.border}`
  };
  const firstSectionStyle = {
    ...sectionStyle,
    borderTop: "none",
    paddingTop: 0
  };
  const infoRows = [
    { label: "状态", value: <StatusBadge status={item.status} /> },
    { label: "到期时间", value: m.expireAt ? formatDateTime(m.expireAt) : "-" },
    { label: "HTTP 状态", value: item.httpStatus || "-" },
    { label: "上次检查", value: item.lastCheckedAt ? formatDateTime(item.lastCheckedAt) : "-" }
  ];
  const trafficRows = [
    { label: "剩余流量", value: m.remainingBytes != null ? formatBytes(m.remainingBytes) : "-", tone: "remaining" },
    { label: "已用流量", value: m.usedBytes != null ? formatBytes(m.usedBytes) : "-", tone: "used" },
    { label: "总流量", value: m.totalBytes != null ? formatBytes(m.totalBytes) : "-", tone: "total" }
  ];
  const usageRows = [
    { label: "绑定用户", value: `${boundUsers.length} 人` },
    { label: "剩余流量比例", value: `${trafficPercent}%` },
    { label: "池 URL ID", value: item.id }
  ];
  const renderRows = rows => (
    <div style={{ display: "grid", gap: 15 }}>
      {rows.map(row => (
        <div
          key={row.label}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(92px, 0.42fr) minmax(0, 1fr)",
            gap: 16,
            alignItems: "start"
          }}
        >
          <Text style={keyTextStyle}>{row.label}</Text>
          <div style={{ ...valueTextStyle, minWidth: 0, textAlign: isNarrow ? "left" : "right", wordBreak: "break-word" }}>{row.value}</div>
        </div>
      ))}
    </div>
  );
  const cacheText = cache?.error ? `错误：${cache.error}` : (cache?.body || "（未获取到实时 YAML）");
  const cacheMeta = cache?.fetchedAt
    ? `${formatDateTime(cache.fetchedAt)} · ${formatBytes(cache.bodyLength || 0)}${cache.truncated ? "（已截断）" : ""}`
    : "";
  return (
    <div className="detail-page" style={{ color: detailTone.text }}>
      <header style={{ padding: isNarrow ? "2px 0 18px" : "4px 0 22px", borderBottom: `1px solid ${detailTone.border}` }}>
        <div style={{ height: 1, background: detailTone.border, margin: isNarrow ? "14px 0 18px" : "18px 0 20px" }} />
        <div className="detail-hero">
          <div className="detail-hero-toolbar">
            <div className="detail-hero-actions">
              <Button size="small" onClick={() => navigate("/urls")} style={{ height: 32, borderRadius: 6, paddingInline: 12, fontSize: 13 }}>返回 URL 池</Button>
              <Button
                className="detail-refresh-button"
                size="small"
                icon={<ReloadOutlined />}
                loading={refreshingTraffic}
                onClick={refreshTraffic}
                style={{ height: 32, borderRadius: 6, paddingInline: refreshingTraffic ? 16 : 12 }}
              >
                刷新
              </Button>
            </div>
          </div>
          <div className="detail-hero-main">
            <Title level={1} style={{ margin: 0, color: detailTone.title, fontSize: isMobileDetail ? 24 : isNarrow ? 26 : 32, lineHeight: 1.25, fontWeight: 600 }}>
              {item.email || item.name || "池 URL 详情"}
            </Title>
            <CopyableUrlPill value={item.url} className="detail-url-copyable" />
          </div>
        </div>
      </header>

      <main
        style={{
          display: "grid",
          gridTemplateColumns: detailSingleColumn ? "1fr" : "minmax(0, 1fr) minmax(300px, 380px)",
          columnGap: detailSingleColumn ? 0 : 48
        }}
      >
        <div style={{ padding: isNarrow ? "22px 0 0" : "28px 0 0", minWidth: 0 }}>
          <section style={firstSectionStyle}>
            <Flex justify="space-between" align="center" gap={12} wrap="wrap" style={{ marginBottom: 16 }}>
              <Title level={3} style={sectionTitleStyle}>流量</Title>
            </Flex>
            <div className="traffic-visual-panel">
              <div className="traffic-visual-header">
                <div>
                  <Text type="secondary" style={{ display: "block", fontSize: 13 }}>剩余流量比例</Text>
                  <Text strong style={{ fontSize: 28, lineHeight: 1.2 }}>{trafficPercent}%</Text>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Text type="secondary" style={{ display: "block", fontSize: 13 }}>已用流量比例</Text>
                  <Text strong style={{ fontSize: 20, lineHeight: 1.35 }}>{usedPercent}%</Text>
                </div>
              </div>
              <div className="traffic-bar" aria-label={`剩余 ${trafficPercent}%，已用 ${usedPercent}%`}>
                <div className="traffic-bar-used" style={{ width: `${usedPercent}%` }} />
                <div className="traffic-bar-remaining" style={{ width: `${trafficPercent}%` }} />
              </div>
              <div className="traffic-stat-grid">
                {trafficRows.map(row => (
                  <div className={`traffic-stat traffic-stat-${row.tone}`} key={row.label}>
                    <Text type="secondary" style={{ display: "block", fontSize: 13 }}>{row.label}</Text>
                    <Text strong className="traffic-stat-value">{row.value}</Text>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section style={sectionStyle}>
            <Flex justify="space-between" align="center" gap={12} wrap="wrap" style={{ marginBottom: 16 }}>
              <Title level={3} style={sectionTitleStyle}>绑定用户</Title>
              <Text style={keyTextStyle}>{boundUsers.length} 人正在使用</Text>
            </Flex>
            {boundUsers.length && isMobileDetail ? (
              <div className="detail-user-card-list">
                {boundUsers.map(user => (
                  <div className="detail-user-card" key={user.id}>
                    <div>
                      <Text strong>{user.userId}</Text>
                      <Text type="secondary" style={{ display: "block", fontSize: 12, marginTop: 2 }}>{user.wechatName || "—"}</Text>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <Text style={{ display: "block", fontSize: 13 }}>{formatDate(user.expiresAt)}</Text>
                      <StatusBadge status={userStatus(user)} />
                    </div>
                  </div>
                ))}
              </div>
            ) : boundUsers.length ? (
              <Table className="plain-detail-table" size="small" rowKey="id" columns={boundUserTable.columns} components={boundUserTable.components} dataSource={boundUsers} pagination={false} scroll={{ x: Math.max(620, boundUserTable.scrollX) }} />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无绑定用户" />
            )}
          </section>

          <section style={sectionStyle}>
            <Flex justify="space-between" align="center" gap={12} wrap="wrap" style={{ marginBottom: 16 }}>
              <Title level={3} style={sectionTitleStyle}>实时 YAML</Title>
            </Flex>
            <CodeViewer code={cacheText} meta={cacheMeta} language="YAML" />
          </section>
        </div>

        <aside
          style={{
            padding: detailSingleColumn ? "24px 0 0" : "28px 0 0 24px",
            borderLeft: detailSingleColumn ? "none" : `1px solid ${detailTone.border}`,
            borderTop: detailSingleColumn ? `1px solid ${detailTone.border}` : "none"
          }}
        >
          <section style={firstSectionStyle}>
            <Title level={3} style={{ ...sectionTitleStyle, marginBottom: 18 }}>信息</Title>
            {renderRows(infoRows)}
          </section>

          <section style={sectionStyle}>
            <Title level={3} style={{ ...sectionTitleStyle, marginBottom: 18 }}>使用情况</Title>
            {renderRows(usageRows)}
          </section>

          {item.lastError && (
            <section style={sectionStyle}>
              <Title level={3} style={{ ...sectionTitleStyle, marginBottom: 12, color: "var(--ant-color-error)" }}>错误</Title>
              <Paragraph style={{ margin: 0, color: detailTone.text, fontSize: 13, lineHeight: 1.7 }}>{item.lastError}</Paragraph>
            </section>
          )}
        </aside>
      </main>
    </div>
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
    <AntLayout style={{ ...muse.app, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ width: "100%", maxWidth: 400, padding: "0 24px" }}>
        <div style={{ border: "1px solid var(--ant-color-border-secondary)", borderRadius: 8, padding: "22px 24px", background: "var(--ant-color-bg-container)", marginBottom: 16, textAlign: "center" }}>
          <Title level={3} style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>XELA monitor</Title>
          <Text type="secondary" style={{ fontSize: 14 }}>订阅中转管理后台</Text>
        </div>
        <div style={{ border: "1px solid var(--ant-color-border-secondary)", borderRadius: 8, padding: "26px 24px", background: "var(--ant-color-bg-container)" }}>
          <Form layout="vertical" size="large" onFinish={submit} requiredMark={false}>
            <Form.Item name="account" label="账号" rules={[{ required: true, message: "请输入账号" }]} style={{ marginBottom: 18 }}>
              <Input autoComplete="username" placeholder="请输入账号" style={{ borderRadius: 6, height: 40 }} />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]} style={{ marginBottom: 20 }}>
              <Input.Password autoComplete="current-password" placeholder="请输入密码" style={{ borderRadius: 6, height: 40 }} />
            </Form.Item>
            {message && <Text type="danger" style={{ display: "block", marginBottom: 14, fontSize: 13 }}>{message}</Text>}
            <Button type="primary" htmlType="submit" block loading={loading} size="large" style={{ borderRadius: 6, fontWeight: 600, height: 42 }}>登录</Button>
          </Form>
        </div>
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
  const { meta, loading, error, subscriptions, users, bills } = useData();
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

  const selectedMenuKey = location.pathname.startsWith("/urls") ? "/urls" : location.pathname;
  const activeMenuItem = menuItems.find(item => item.key === selectedMenuKey);
  const isUrlDetail = /^\/urls\/detail\/[^/]+/.test(location.pathname);
  const nav = <SideNavigation selectedKey={selectedMenuKey} onSelect={handleMenu} />;
  const initialLoading = loading && !subscriptions.length && !users.length && !bills.length;

  return (
    <AntLayout style={muse.app}>
      {!isMobile && <Sider width={252} style={muse.sider}>{nav}</Sider>}
      <AntLayout style={muse.app}>
        <Header style={muse.header(isMobile)}>
          <Flex align="center" justify="space-between" gap={16}>
            <Flex align="center" gap={12}>
              {isMobile && <Button icon={<MenuFoldOutlined />} onClick={() => setDrawerOpen(true)} />}
              <div>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase" }}>{activeMenuItem?.label || "Dashboard"}</Text>
                <Title level={4} style={{ margin: "2px 0 0", fontSize: 17, fontWeight: 700 }}>订阅中转控制台</Title>
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
            {error && <Card bordered style={muse.softCard}><Text type="danger">{error}</Text></Card>}
            {initialLoading ? (
              <DashboardSkeleton />
            ) : (
              <>
                {!isUrlDetail && (
                  <>
                    <Summary />
                    <div className="summary-route-divider" />
                  </>
                )}
                <Routes>
                  <Route path="/urls" element={<UrlPoolPage />} />
                  <Route path="/urls/detail/:id" element={<PoolDetailPage />} />
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
            <Card bordered style={muse.softCard}>
              <Skeleton active paragraph={{ rows: 1 }} title={{ width: "45%" }} />
            </Card>
          </Col>
        ))}
      </Row>
      <Card bordered style={muse.card}>
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
        <Text strong style={{ fontSize: 15 }}>XELA</Text>
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
    const screens = Grid.useBreakpoint();
    const cols = screens.xl ? 4 : screens.md ? 4 : screens.sm ? 2 : 2;
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
        {items.map(item => (
            <Card bordered style={{ ...muse.softCard, minWidth: 0 }} styles={{ body: { padding: "12px 14px" } }} key={item.title}>
            <Statistic
               title={<Text type="secondary" style={{ display: "block", fontSize: 12, fontWeight: 500 }}>{item.title}</Text>}
              value={item.value}
               valueStyle={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2, color: palette.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
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
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 8, display: "block" }}>状态监控</Text>
        <StatGrid items={statusItems} />
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 8, display: "block" }}>收入情况</Text>
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
  const { notification } = AntApp.useApp();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(null);
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
      try {
        await run();
        await reload(["subscriptions"]);
      } catch (error) {
        notification.error({ message: "操作失败", description: error.message, placement: "bottomRight" });
      }
    }, "正在处理 URL 池操作...");
  }

  const actions = (item, compact = false) => {
    const Wrap = compact ? InlineActions : CardActions;
    const buttonProps = compact ? { size: "small", style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy } : { style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy };
    return (
      <Wrap>
        <Button {...buttonProps} icon={<EditOutlined />} onClick={() => setEditing(item)}>编辑</Button>
        <Button {...buttonProps} icon={<ReloadOutlined />} onClick={() => action(() => postJson(`/api/subscriptions/${item.id}/refresh`))}>刷新</Button>
        <Button {...buttonProps} icon={<EyeOutlined />} onClick={() => navigate(`/urls/detail/${item.id}`)}>查看</Button>
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
    { title: "实时 YAML", render: () => "查看时获取", width: 120 },
    { title: "操作", render: (_, item) => actions(item, true), width: 300 }
  ].map(column => ({
    ...column,
    onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }),
    onCell: () => ({ style: { whiteSpace: "nowrap" } })
  }));
  const poolTable = useResizableColumns(columns, "url-pool");

  return (
    <section className="flat-list-section">
      <div className="flat-list-header">
        <Title level={3} style={{ margin: 0, fontSize: 18, lineHeight: 1.35 }}>URL 池</Title>
        <Toolbar>
          <Input.Search allowClear placeholder="搜索 URL、邮箱或备注" style={{ width: 210 }} onSearch={setKeyword} onChange={event => setKeyword(event.target.value)} />
          <Button onClick={() => setShowExpired(v => !v)}>{showExpired ? "隐藏已到期" : "显示已到期"}</Button>
          <Button icon={<PlusOutlined />} onClick={() => setEditing({})}>添加 URL</Button>
        </Toolbar>
      </div>
      {mobile ? <PoolCards items={visible} actions={actions} /> : <Table className="plain-detail-table user-flat-table" size="middle" rowKey="id" columns={poolTable.columns} components={poolTable.components} dataSource={visible} pagination={tablePagination} scroll={{ x: Math.max(1520, poolTable.scrollX) }} />}
      {editing && <SubscriptionForm item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(["subscriptions"]); }} />}
    </section>
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
          bordered
          style={muse.softCard}
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
              ["实时 YAML", "查看时获取"]
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
    <Modal title={item.id ? "编辑池 URL" : "添加池 URL"} open onCancel={onClose} footer={null} destroyOnHidden styles={modalFormStyles}>
      <Form form={form} layout="vertical" initialValues={{ url: item.url || "", email: item.email || "", note: item.note || "" }} onFinish={submit}>
        <Flex vertical gap={16}>
          <div style={GROUP}>
            <Form.Item name="url" label="订阅 URL" rules={[{ required: true, type: "url", message: "请输入正确的 URL" }]} style={GROUP_ITEM}><Input variant="borderless" placeholder="https://" /></Form.Item>
            <div style={GROUP_SEP} />
            <Form.Item name="email" label="绑定邮箱" rules={[{ required: true, type: "email", message: "请输入邮箱" }]} style={GROUP_ITEM}><Input variant="borderless" placeholder="user@example.com" /></Form.Item>
          </div>
          <div style={TEXTAREA_GROUP}>
            <Form.Item name="note" label="备注" style={{ marginBottom: 0 }}><TextArea variant="borderless" rows={3} placeholder="选填" style={{ padding: 0 }} /></Form.Item>
          </div>
          <Flex justify="end"><Button type="primary" htmlType="submit">保存</Button></Flex>
        </Flex>
      </Form>
    </Modal>
  );
}

function UsersPage() {
  const { users, subscriptions, reload, runAsync, busy } = useData();
  const { notification } = AntApp.useApp();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(null);
  const [renewing, setRenewing] = useState(null);
  const mobile = useResponsiveList();
  const visible = users.filter(user => `${user.userId || ""} ${user.wechatName || ""} ${user.imessageId || ""} ${user.subscription?.url || ""}`.toLowerCase().includes(keyword.toLowerCase()));

  async function mutate(run) {
    await runAsync(async () => {
      try {
        await run();
        await reload(["users", "bills"]);
      } catch (error) {
        notification.error({ message: "操作失败", description: error.message, placement: "bottomRight" });
      }
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
    { title: "#", render: (_, __, index) => index + 1, width: 48 },
    { title: "用户 ID", dataIndex: "userId", width: 120 },
    { title: "状态", render: (_, user) => <StatusBadge status={userStatus(user)} />, width: 76 },
    { title: "到期", render: (_, user) => formatDate(user.expiresAt), width: 104 },
    { title: "时长", render: (_, user) => durationLabels[user.duration] || "未知", width: 72 },
    { title: "总付款", render: (_, user) => formatMoney(user.actualPaid), width: 88 },
    { title: "客户订阅 URL", render: (_, user) => <UrlText value={userClientSubscriptionUrl(user)} />, width: 560 },
    { title: "绑定邮箱", render: (_, user) => user.subscription?.email || "", width: 220 },
    { title: "购买时间", render: (_, user) => formatDate(user.purchasedAt), width: 104 },
    { title: "操作", render: (_, user) => actions(user, true), width: 190 }
  ].map(column => ({
    ...column,
    onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }),
    onCell: () => ({ style: { whiteSpace: "nowrap" } })
  }));
  const userTable = useResizableColumns(columns, "users-v2");

  return (
    <section className="flat-list-section">
      <div className="flat-list-header">
        <Title level={3} style={{ margin: 0, fontSize: 18, lineHeight: 1.35 }}>用户管理</Title>
        <Toolbar>
          <Input.Search allowClear placeholder="搜索用户、邮箱或 URL" style={{ minWidth: 240 }} onSearch={setKeyword} onChange={event => setKeyword(event.target.value)} />
          <Button icon={<PlusOutlined />} onClick={() => setEditing({})}>添加用户</Button>
        </Toolbar>
      </div>
      {mobile ? <UserCards users={visible} actions={actions} /> : <Table className="plain-detail-table user-flat-table" size="middle" rowKey="id" columns={userTable.columns} components={userTable.components} dataSource={visible} pagination={tablePagination} scroll={{ x: Math.max(1380, userTable.scrollX) }} />}
      {editing && <UserForm item={editing} subscriptions={subscriptions} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(["users", "bills"]); }} />}
      {renewing && <RenewForm user={renewing} subscriptions={subscriptions} onClose={() => setRenewing(null)} onSaved={async () => { setRenewing(null); await reload(["users", "bills"]); }} />}
    </section>
  );
}

function UserCards({ users, actions }) {
  const muse = useMuse();
  const { palette } = useThemeMode();
  if (!users.length) return <Empty description="还没有匹配的用户。" />;
  return (
    <Flex vertical gap={12}>
      {users.map(user => (
        <Card hoverable bordered style={muse.softCard} styles={{ body: { padding: 16 } }} key={user.id}>
          <Flex justify="space-between" gap={12} align="center" style={{ marginBottom: 10 }}>
            <Text strong ellipsis={{ tooltip: user.userId }} style={{ fontSize: 15 }}>{user.userId}</Text>
            <StatusBadge status={userStatus(user)} />
          </Flex>
          <div style={{ padding: "10px 0 12px", borderTop: `1px solid ${palette.borderSoft}`, borderBottom: `1px solid ${palette.borderSoft}` }}>
            <MobileUrlBlock value={userClientSubscriptionUrl(user)} />
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

const SC_TARGETS = [
  { value: "clash", label: "Clash" },
  { value: "clashr", label: "ClashR" },
  { value: "quan", label: "Quantumult" },
  { value: "quanx", label: "Quantumult X" },
  { value: "loon", label: "Loon" },
  { value: "surge&ver=4", label: "Surge 4" },
  { value: "surge&ver=3", label: "Surge 3" },
  { value: "shadowrocket", label: "Shadowrocket" },
  { value: "v2ray", label: "V2Ray" },
  { value: "mixed", label: "Mixed（节点列表）" }
];

const DEFAULT_SC_TARGET = "clash";

function initialOutputModeForUser(user) {
  return user?.id
    ? (user.subconverterConfig?.target ? "subconverter" : "direct")
    : "subconverter";
}

function initialSubconverterConfig(user) {
  const sc = user?.subconverterConfig || {};
  return {
    target: sc.target || DEFAULT_SC_TARGET,
    config: sc.config || "",
    include: sc.include || "",
    exclude: sc.exclude || "",
    rename: sc.rename || "",
    emoji: sc.emoji !== false,
    udp: sc.udp !== false,
    scv: Boolean(sc.scv),
    sort: Boolean(sc.sort)
  };
}

function buildSubconverterConfig(values) {
  const sc = values.subconverterConfig || {};
  return values.outputMode === "subconverter"
    ? { ...sc, target: sc.target || DEFAULT_SC_TARGET }
    : null;
}

function recommendationDate(value) {
  if (!value) return "";
  if (typeof value?.toISOString === "function") return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function useSubscriptionRecommendation({ expiresAt, purchasedAt, duration, ignoredUserId = "", fallbackId = "", enabled = true }) {
  const [state, setState] = useState({ result: null, reason: null, loading: false });
  useEffect(() => {
    const normalizedExpiresAt = recommendationDate(expiresAt);
    const normalizedPurchasedAt = recommendationDate(purchasedAt);
    if (!enabled || (!normalizedExpiresAt && (!normalizedPurchasedAt || !duration))) {
      setState({ result: null, reason: null, loading: false });
      return;
    }
    let cancelled = false;
    setState(previous => ({ ...previous, loading: true }));
    postJson("/api/subscriptions/recommend", {
      expiresAt: normalizedExpiresAt,
      purchasedAt: normalizedPurchasedAt,
      duration,
      ignoredUserId,
      fallbackId
    }).then(payload => {
      if (cancelled) return;
      setState({
        result: payload.subscription || payload.recommended || null,
        reason: payload.reason || null,
        loading: false
      });
    }).catch(error => {
      if (cancelled) return;
      setState({ result: null, reason: error.message, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, expiresAt, purchasedAt, duration, ignoredUserId, fallbackId]);
  return state;
}

function SubconverterPanel() {
  return (
    <div style={GROUP}>
      <div style={{ padding: "10px 16px 0" }}>
        <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>Subconverter 参数</Text>
      </div>
      <Row gutter={0}>
        <Col xs={24} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
          <Form.Item name={["subconverterConfig", "target"]} label="输出格式" style={GROUP_ITEM}>
            <Select {...inModalSelectProps} variant="borderless" allowClear placeholder="target" options={SC_TARGETS} style={{ marginLeft: -11 }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={16}>
          <Form.Item name={["subconverterConfig", "config"]} label="远程配置 URL" style={GROUP_ITEM}>
            <Input variant="borderless" placeholder="选填，https://..." />
          </Form.Item>
        </Col>
      </Row>
      <div style={GROUP_SEP} />
      <Row gutter={0}>
        <Col xs={24} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
          <Form.Item name={["subconverterConfig", "include"]} label="include" style={GROUP_ITEM}>
            <Input variant="borderless" placeholder="节点过滤正则" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
          <Form.Item name={["subconverterConfig", "exclude"]} label="exclude" style={GROUP_ITEM}>
            <Input variant="borderless" placeholder="节点排除正则" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name={["subconverterConfig", "rename"]} label="rename" style={{ ...GROUP_ITEM, paddingBottom: 4 }}>
            <Input variant="borderless" placeholder="旧名@新名" />
          </Form.Item>
        </Col>
      </Row>
      <div style={GROUP_SEP} />
      <div style={{ padding: "10px 16px 12px" }}>
        <Flex gap={16} wrap="wrap" align="center">
          <Form.Item name={["subconverterConfig", "emoji"]} valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>Emoji</Checkbox></Form.Item>
          <Form.Item name={["subconverterConfig", "udp"]} valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>UDP</Checkbox></Form.Item>
          <Form.Item name={["subconverterConfig", "scv"]} valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>跳过 TLS 验证</Checkbox></Form.Item>
          <Form.Item name={["subconverterConfig", "sort"]} valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>排序节点</Checkbox></Form.Item>
        </Flex>
      </div>
    </div>
  );
}

function OutputModeSection({ form, initialOutputMode, subscriptions, recommended, recommendReason, showRecommendation }) {
  const outputMode = Form.useWatch("outputMode", form);
  const useSubconverter = (outputMode || initialOutputMode) === "subconverter";
  return (
    <>
      <div style={GROUP}>
        <div style={{ padding: "10px 16px 0" }}>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>输出方式</Text>
        </div>
        <Form.Item name="outputMode" style={{ ...GROUP_ITEM, paddingBottom: 4 }}>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
          >
            <Radio.Button value="subconverter" style={{ textAlign: "center" }}>A. Subconverter</Radio.Button>
            <Radio.Button value="direct" style={{ textAlign: "center" }}>B. 池 URL</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <div style={GROUP_SEP} />
        {showRecommendation && (
          <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
            <Text type={recommended ? "secondary" : "warning"} style={{ fontSize: 12 }}>
              {recommended ? `推荐：${subscriptionLabel(recommended)}` : (recommendReason || "无匹配池 URL，请手动选择")}
            </Text>
          </div>
        )}
        <Form.Item name="subscriptionId" label={useSubconverter ? "绑定池 URL" : "使用池 URL"} rules={[{ required: true, message: "请选择池 URL" }]} style={{ ...GROUP_ITEM, paddingBottom: 4 }}>
          <Select virtual={false} variant="borderless" options={subscriptions.map(s => ({ value: s.id, label: subscriptionLabel(s) }))} style={{ marginLeft: -11 }} />
        </Form.Item>
      </div>

      {useSubconverter && <SubconverterPanel />}
    </>
  );
}

function UserForm({ item, subscriptions, onClose, onSaved }) {
  const { runAsync, busy } = useData();
  const [form] = Form.useForm();
  const expiryTouched = useRef(false);
  const subscriptionTouched = useRef(false);
  const initialOutputMode = initialOutputModeForUser(item);
  const purchasedAt = Form.useWatch("purchasedAt", form);
  const duration = Form.useWatch("duration", form);
  const expiresAt = Form.useWatch("expiresAt", form);

  const { result: recommended, reason: recommendReason } = useSubscriptionRecommendation({
    expiresAt: expiresAt || calcExpiry(purchasedAt, duration),
    duration,
    ignoredUserId: item.id || "",
    fallbackId: item.subscriptionId || subscriptions[0]?.id || "",
    enabled: Boolean(purchasedAt && duration)
  });

  useEffect(() => {
    if (!item.id && recommended?.id && !subscriptionTouched.current) {
      form.setFieldsValue({ subscriptionId: recommended.id });
    }
  }, [form, item.id, recommended?.id]);

  const initialPurchasedAt = item.purchasedAt ? dayjs(item.purchasedAt) : dayjs();
  const initialDuration = item.duration || "monthly";
  const initialExpiresAt = item.expiresAt
    ? dayjs(item.expiresAt)
    : dayjs(calcExpiry(initialPurchasedAt, initialDuration));

  function handleUserFormChange(changed, values) {
    if (Object.prototype.hasOwnProperty.call(changed, "subscriptionId")) {
      subscriptionTouched.current = true;
    }
    if (Object.prototype.hasOwnProperty.call(changed, "expiresAt")) {
      expiryTouched.current = true;
      return;
    }
    if (!expiryTouched.current && (Object.prototype.hasOwnProperty.call(changed, "purchasedAt") || Object.prototype.hasOwnProperty.call(changed, "duration"))) {
      const nextExpiry = calcExpiry(values.purchasedAt, values.duration);
      if (nextExpiry) form.setFieldsValue({ expiresAt: dayjs(nextExpiry) });
    }
  }

  async function submit(values) {
    await runAsync(async () => {
      const payload = {
        ...values,
        purchasedAt: values.purchasedAt ? values.purchasedAt.format("YYYY-MM-DD") : "",
        expiresAt: values.expiresAt ? values.expiresAt.toISOString() : "",
        subconverterConfig: buildSubconverterConfig(values)
      };
      delete payload.outputMode;
      if (item.id) await fetchJson(`/api/users/${item.id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await postJson("/api/users", payload);
      await onSaved();
    }, item.id ? "正在更新用户..." : "正在添加用户...");
  }

  const fallbackLogs = Array.isArray(item.fallbackLogs) ? item.fallbackLogs : [];
  const fallbackLogColumns = [
    { title: "\u65f6\u95f4", dataIndex: "at", render: value => formatDateTime(value), width: 150 },
    { title: "\u539f\u56e0", dataIndex: "reasonText", render: value => value || "-", width: 150 },
    { title: "\u539f\u6c60 URL", dataIndex: "fromSubscriptionLabel", ellipsis: true },
    { title: "\u65b0\u6c60 URL", dataIndex: "toSubscriptionLabel", ellipsis: true }
  ];
  const fallbackLogTable = useResizableColumns(fallbackLogColumns, "user-fallback-logs");
  return (
    <Modal title={item.id ? "编辑用户" : "添加用户"} open onCancel={onClose} footer={null} destroyOnHidden width={720} styles={modalFormStyles}>
      <Form form={form} layout="vertical" initialValues={{
        userId: item.userId || "",
        wechatName: item.wechatName || "",
        imessageId: item.imessageId || "",
        purchasedAt: initialPurchasedAt,
        actualPaid: item.actualPaid ?? "",
        duration: initialDuration,
        expiresAt: initialExpiresAt,
        subscriptionId: item.subscriptionId || subscriptions[0]?.id || "",
        outputMode: initialOutputMode,
        subconverterConfig: initialSubconverterConfig(item)
      }} onValuesChange={handleUserFormChange} onFinish={submit}>
        <Flex vertical gap={12}>
          <div style={GROUP}>
            <div style={{ padding: "10px 16px 0" }}>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>基本信息</Text>
            </div>
            <Row gutter={0}>
              <Col xs={24} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
                <Form.Item name="userId" label="用户 ID" rules={[{ required: true, message: "请输入用户 ID" }]} style={GROUP_ITEM}><Input variant="borderless" placeholder="必填" /></Form.Item>
              </Col>
              <Col xs={24} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
                <Form.Item name="wechatName" label="微信名" style={GROUP_ITEM}><Input variant="borderless" placeholder="选填" /></Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="imessageId" label="iMessage ID" style={{ ...GROUP_ITEM, paddingBottom: 4 }}><Input variant="borderless" placeholder="选填" /></Form.Item>
              </Col>
            </Row>
          </div>

          <div style={GROUP}>
            <div style={{ padding: "10px 16px 0" }}>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>套餐信息</Text>
            </div>
            <Row gutter={0}>
              <Col xs={24} sm={12} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
                <Form.Item name="purchasedAt" label="购买时间" rules={[{ required: true, message: "请选择购买时间" }]} style={GROUP_ITEM}>
                  <DatePicker {...inModalPickerProps} variant="borderless" style={{ width: "100%", paddingLeft: 0 }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
                <Form.Item name="expiresAt" label="到期时间" rules={[{ required: true, message: "请选择到期时间" }]} style={GROUP_ITEM}>
                  <DatePicker {...inModalPickerProps} variant="borderless" style={{ width: "100%", paddingLeft: 0 }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="actualPaid" label="实付款" rules={[{ required: true, message: "请输入" }]} style={{ ...GROUP_ITEM, paddingBottom: 4 }}>
                  <Input variant="borderless" type="number" min="0" step="0.01" placeholder="0.00" style={{ paddingLeft: 0 }} />
                </Form.Item>
              </Col>
            </Row>
            <div style={GROUP_SEP} />
            <Form.Item name="duration" label="购买时长" style={{ ...GROUP_ITEM, paddingBottom: 4 }}>
              <DurationRadio purchasedAt={purchasedAt} />
            </Form.Item>
          </div>

          <OutputModeSection
            form={form}
            initialOutputMode={initialOutputMode}
            subscriptions={subscriptions}
            recommended={recommended}
            recommendReason={recommendReason}
            showRecommendation={!item.id}
          />

          {fallbackLogs.length > 0 && (
            <div style={GROUP}>
              <div style={{ padding: "10px 16px 8px" }}>
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>{"\u81ea\u52a8\u6362\u6c60\u65e5\u5fd7"}</Text>
              </div>
              <div style={GROUP_SEP} />
              <div style={{ padding: "10px 16px 12px" }}>
                <Table
                  size="small"
                  rowKey="id"
                  columns={fallbackLogTable.columns}
                  components={fallbackLogTable.components}
                  dataSource={fallbackLogs}
                  pagination={false}
                  scroll={{ x: Math.max(620, fallbackLogTable.scrollX) }}
                />
              </div>
            </div>
          )}

          <Button className="detail-refresh-button" htmlType="submit" block size="large" loading={!!busy} disabled={!!busy} style={{ borderRadius: 6, fontWeight: 600 }}>
            {item.id ? "保存" : "添加用户"}
          </Button>
        </Flex>
      </Form>
    </Modal>
  );
}

function RenewForm({ user, subscriptions, onClose, onSaved }) {
  const { runAsync } = useData();
  const [form] = Form.useForm();
  const subscriptionTouched = useRef(false);
  const purchasedAt = Form.useWatch("purchasedAt", form);
  const duration = Form.useWatch("duration", form);
  const initialOutputMode = initialOutputModeForUser(user);

  const renewalBase = user.expiresAt && purchasedAt && new Date(user.expiresAt) > purchasedAt.toDate() ? user.expiresAt : purchasedAt;
  const renewalExpiresAt = renewalBase && duration ? calcExpiry(renewalBase, duration) : "";
  const { result: recommended, reason: recommendReason } = useSubscriptionRecommendation({
    expiresAt: renewalExpiresAt,
    duration,
    ignoredUserId: user.id,
    fallbackId: user.subscriptionId || subscriptions[0]?.id || "",
    enabled: Boolean(purchasedAt && duration)
  });

  useEffect(() => {
    if (recommended?.id && !subscriptionTouched.current) {
      form.setFieldsValue({ subscriptionId: recommended.id });
    }
  }, [form, recommended?.id]);

  function handleRenewFormChange(changed) {
    if (Object.prototype.hasOwnProperty.call(changed, "subscriptionId")) {
      subscriptionTouched.current = true;
    }
  }

  async function submit(values) {
    await runAsync(async () => {
      const payload = {
        ...values,
        purchasedAt: values.purchasedAt.format("YYYY-MM-DD"),
        subconverterConfig: buildSubconverterConfig(values)
      };
      delete payload.outputMode;
      await postJson(`/api/users/${user.id}/renew`, payload);
      await onSaved();
    }, "正在续费用户...");
  }
  return (
    <Modal title={`${user.userId || "用户"} 续费`} open onCancel={onClose} footer={null} destroyOnHidden width={720} styles={modalFormStyles}>
      <Form form={form} layout="vertical" initialValues={{
        purchasedAt: dayjs(),
        actualPaid: "",
        duration: user.duration || "monthly",
        subscriptionId: user.subscriptionId || subscriptions[0]?.id || "",
        outputMode: initialOutputMode,
        subconverterConfig: initialSubconverterConfig(user)
      }} onValuesChange={handleRenewFormChange} onFinish={submit}>
        <Flex vertical gap={12}>
          <div style={GROUP}>
            <div style={{ padding: "10px 16px 0" }}>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>续费信息</Text>
            </div>
            <Row gutter={0}>
              <Col xs={24} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
                <Form.Item name="purchasedAt" label="续费时间" rules={[{ required: true, message: "请选择续费时间" }]} style={GROUP_ITEM}>
                  <DatePicker {...inModalPickerProps} variant="borderless" style={{ width: "100%", paddingLeft: 0 }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={16}>
                <Form.Item name="actualPaid" label="实付款" rules={[{ required: true, message: "请输入" }]} style={GROUP_ITEM}>
                  <Input variant="borderless" type="number" min="0" step="0.01" placeholder="0.00" style={{ paddingLeft: 0 }} />
                </Form.Item>
              </Col>
            </Row>
            <div style={GROUP_SEP} />
            <Form.Item name="duration" label="续费时长" style={{ ...GROUP_ITEM, paddingBottom: 4 }}>
              <DurationRadio purchasedAt={user.expiresAt && purchasedAt && new Date(user.expiresAt) > purchasedAt.toDate() ? user.expiresAt : purchasedAt} />
            </Form.Item>
          </div>

          <OutputModeSection
            form={form}
            initialOutputMode={initialOutputMode}
            subscriptions={subscriptions}
            recommended={recommended}
            recommendReason={recommendReason}
            showRecommendation
          />

          <Button type="primary" htmlType="submit" block size="large" style={{ borderRadius: 6, fontWeight: 600 }}>
            确认续费
          </Button>
        </Flex>
      </Form>
    </Modal>
  );
}

function BillsPage() {
  const { bills, reload, runAsync, busy } = useData();
  const { notification } = AntApp.useApp();
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
      try {
        await run();
        await reload(["bills", "users"]);
      } catch (error) {
        notification.error({ message: "操作失败", description: error.message, placement: "bottomRight" });
      }
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
  const billTable = useResizableColumns(columns, "bills");

  return (
    <section className="flat-list-section">
      <div className="flat-list-header">
        <Title level={3} style={{ margin: 0, fontSize: 18, lineHeight: 1.35 }}>账单管理</Title>
        <Toolbar>
          <DatePicker picker="month" value={month} onChange={setMonth} placeholder="筛选月份" style={{ minWidth: 150 }} />
          <Input.Search allowClear placeholder="搜索用户、类型或备注" style={{ minWidth: 240 }} onSearch={setKeyword} onChange={event => setKeyword(event.target.value)} />
        </Toolbar>
      </div>
      {mobile ? <BillCards bills={visible} actions={actions} total={total} /> : <Table className="plain-detail-table user-flat-table" size="middle" rowKey="id" columns={billTable.columns} components={billTable.components} dataSource={visible} pagination={tablePagination} scroll={{ x: Math.max(1100, billTable.scrollX) }} summary={() => <Table.Summary fixed><Table.Summary.Row><Table.Summary.Cell index={0} colSpan={4}>筛选合计</Table.Summary.Cell><Table.Summary.Cell index={4}><Text strong>{formatMoney(total)}</Text></Table.Summary.Cell><Table.Summary.Cell index={5} colSpan={4}>{visible.length} 笔账单</Table.Summary.Cell></Table.Summary.Row></Table.Summary>} />}
    </section>
  );
}

function BillCards({ bills, actions, total }) {
  const muse = useMuse();
  const { palette } = useThemeMode();
  return (
    <Flex vertical gap={12}>
      <Card hoverable bordered style={muse.softCard}><Statistic title="筛选合计" value={formatMoney(total)} /></Card>
      {!bills.length && <Empty description="还没有匹配的账单。" />}
      {bills.map(bill => (
        <Card hoverable bordered style={muse.softCard} styles={{ body: { padding: 16 } }} key={bill.id}>
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
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem("themeMode");
    if (stored) return stored === "dark";
    return false;
  });

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
          borderRadius: 6,
          borderRadiusLG: 8,
          borderRadiusSM: 4,
          fontFamily: "'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: 14,
          fontSizeHeading1: 28,
          fontSizeHeading2: 22,
          fontSizeHeading3: 18,
          fontSizeHeading4: 17,
          fontWeightStrong: 600,
          lineHeight: 1.5,
          motionDurationMid: "0.18s",
          motionEaseInOut: "cubic-bezier(0.4, 0, 0.2, 1)"
        },
        components: {
          Layout: { bodyBg: palette.page, headerBg: "transparent", siderBg: "transparent" },
          Card: {
            borderRadiusLG: 8,
            headerFontSize: 15,
            headerFontSizeSM: 14,
            headerHeight: 54,
            colorBgContainer: palette.surface,
            colorBorderSecondary: palette.border
          },
          Menu: {
            itemBorderRadius: 6,
            itemHeight: 36,
            fontSize: 14,
            fontWeightStrong: 600,
            itemBg: "transparent",
            itemColor: palette.textSecondary,
            itemHoverBg: palette.fill,
            itemHoverColor: palette.text,
            itemSelectedBg: palette.fill,
            itemSelectedColor: palette.text
          },
          Table: {
            headerBg: palette.fillTertiary,
            headerColor: palette.textSecondary,
            headerSplitColor: palette.border,
            rowHoverBg: palette.surfaceHover,
            borderColor: palette.borderSoft,
            colorBgContainer: palette.surface,
            cellPaddingBlock: 12,
            cellPaddingInline: 14,
            fontSize: 13,
            borderRadius: 0
          },
          Button: {
            fontWeight: 500,
            controlHeight: 34,
            controlHeightLG: 40,
            borderRadius: 4,
            borderRadiusLG: 6,
            defaultBg: palette.surface,
            defaultColor: palette.text,
            defaultBorderColor: palette.border,
            defaultHoverBg: palette.fill,
            defaultHoverColor: palette.text,
            defaultHoverBorderColor: palette.text,
            primaryColor: palette.surface,
            primaryBg: palette.action,
            primaryHoverBg: palette.actionHover,
            primaryActiveBg: palette.actionHover,
            primaryBorderColor: palette.action,
            textHoverBg: palette.fill,
            textTextHoverColor: palette.text
          },
          Input: {
            controlHeight: 34,
            colorBgContainer: palette.surface,
            hoverBg: palette.surfaceHover,
            activeBg: palette.surface,
            borderRadius: 6
          },
          Select: {
            controlHeight: 34,
            borderRadius: 6,
            optionSelectedBg: palette.fill,
            optionActiveBg: palette.fill
          },
          DatePicker: {
            controlHeight: 34,
            borderRadius: 6,
            colorBgContainer: palette.surface
          },
          Modal: {
            borderRadiusLG: 8,
            headerBg: palette.surface,
            contentBg: palette.surface
          },
          Tag: {
            borderRadiusSM: 6
          },
          Statistic: {
            titleFontSize: 12,
            contentFontSize: 22
          },
          Drawer: {
            colorBgElevated: palette.surfaceElevated
          },
          Tabs: {
            inkBarColor: palette.primary,
            itemColor: palette.textSecondary,
            itemSelectedColor: palette.primary,
            itemHoverColor: palette.text,
            cardBg: palette.fill
          },
          Notification: {
            colorBgElevated: palette.surfaceElevated
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
