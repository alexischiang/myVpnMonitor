import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  App as AntApp,
  Button,
  Checkbox,
  Col,
  ConfigProvider,
  DatePicker,
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
  Skeleton,
  Spin,
  Table,
  Tag,
  Typography,
  theme
} from "antd";
import {
  ApiOutlined,
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  EyeOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  PlusOutlined,
  ReloadOutlined,
  RetweetOutlined,
  SunOutlined,
  TeamOutlined,
  WarningOutlined
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

const { Header, Content } = AntLayout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const DataContext = createContext(null);
const ThemeModeContext = createContext({ darkMode: false, toggleTheme: () => {}, palette: {} });

// ─── Design tokens ───────────────────────────────────────────────────────────

const PALETTE = {
  light: {
    primary: "#0D9762",
    primaryDark: "#154618",
    page: "#EEEEE9",
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    surfaceHover: "#F0F7F4",
    border: "#E0E0D8",
    text: "#111111",
    textSub: "#555550",
    textMuted: "#9A9A90",
    fill: "#F0F7F4",
    fillMid: "#E0F0EA",
    fillLight: "#F5F9F7",
    shadow: "0 2px 8px rgba(0,0,0,0.07)",
    shadowSm: "0 1px 3px rgba(0,0,0,0.05)"
  },
  dark: {
    primary: "#22C982",
    primaryDark: "#22C982",
    page: "#0D1A12",
    surface: "#14201A",
    surfaceElevated: "#1C2E22",
    surfaceHover: "#1C2E22",
    border: "rgba(13,151,98,0.20)",
    text: "#EEF5F1",
    textSub: "#A0C4B0",
    textMuted: "#6A9A7A",
    fill: "rgba(13,151,98,0.10)",
    fillMid: "rgba(13,151,98,0.15)",
    fillLight: "rgba(13,151,98,0.06)",
    shadow: "none",
    shadowSm: "none"
  }
};

// ─── Navigation items ─────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: "/urls",  label: "URL 池" },
  { key: "/users", label: "用户管理" },
  { key: "/bills", label: "账单管理" }
];

// ─── Form constants ───────────────────────────────────────────────────────────

const inModalSelectProps = { virtual: false, getPopupContainer: n => n.parentElement };
const inModalPickerProps = {};
const durationDaysMap = { monthly: 30, quarterly: 90, half_yearly: 180, yearly: 360 };

const FIELD_GROUP = {
  background: "var(--ant-color-bg-container)",
  border: "1px solid var(--ant-color-border-secondary)",
  borderRadius: 12,
  padding: "4px 0",
  overflow: "hidden"
};
const FIELD_ITEM = { padding: "10px 16px 6px", marginBottom: 0 };
const FIELD_SEP  = { height: 1, background: "var(--ant-color-border-secondary)", margin: "0 16px" };
const MODAL_STYLES = {
  header: { paddingBottom: 16, borderBottom: "1px solid var(--ant-color-border-secondary)", marginBottom: 0 },
  body:   { paddingTop: 20 }
};

const DEFAULT_PROVIDER = "YKK Cloud";
const SC_TARGETS = [
  { value: "clash",       label: "Clash" },
  { value: "clashr",      label: "ClashR" },
  { value: "quan",        label: "Quantumult" },
  { value: "quanx",       label: "Quantumult X" },
  { value: "loon",        label: "Loon" },
  { value: "surge&ver=4", label: "Surge 4" },
  { value: "surge&ver=3", label: "Surge 3" },
  { value: "shadowrocket",label: "Shadowrocket" },
  { value: "v2ray",       label: "V2Ray" },
  { value: "mixed",       label: "Mixed（节点列表）" }
];
const DEFAULT_SC_TARGET = "clash";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serviceProviderLabel(item, fallback = DEFAULT_PROVIDER) {
  return item?.serviceProvider || item?.provider || fallback;
}

function subscriptionLabel(s) {
  const tail   = s.url ? s.url.slice(-4) : "????";
  const expire = s.metrics?.expireAt ? formatDate(s.metrics.expireAt) : "未知到期";
  return `${serviceProviderLabel(s)} · ${tail} · ${expire} · ${s.email || "无邮箱"}`;
}

function calcExpiry(purchasedAt, duration) {
  const days = durationDaysMap[duration];
  if (!days || !purchasedAt) return null;
  const d = new Date(purchasedAt instanceof Object ? purchasedAt.toDate() : purchasedAt);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d;
}

function recommendationDate(v) {
  if (!v) return "";
  if (typeof v.toISOString === "function") return v.toISOString();
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function initialOutputModeForUser(user) {
  return user?.id ? (user.subconverterConfig?.target ? "subconverter" : "direct") : "subconverter";
}

function initialSubconverterConfig(user) {
  const sc = user?.subconverterConfig || {};
  return {
    target:  sc.target  || DEFAULT_SC_TARGET,
    config:  sc.config  || "",
    include: sc.include || "",
    exclude: sc.exclude || "",
    rename:  sc.rename  || "",
    emoji: sc.emoji !== false,
    udp:   sc.udp   !== false,
    scv:   Boolean(sc.scv),
    sort:  Boolean(sc.sort)
  };
}

function buildSubconverterConfig(values) {
  const sc = values.subconverterConfig || {};
  return values.outputMode === "subconverter"
    ? { ...sc, target: sc.target || DEFAULT_SC_TARGET }
    : null;
}

function userClientSubscriptionUrl(user) {
  if ((user?.subconverterConfig?.target ? "subconverter" : "direct") === "subconverter") {
    return user.relayPath ? absoluteUrl(user.relayPath) : "自定义 URL 不存在";
  }
  return user.subscription?.url || "关联 URL 不存在";
}

function statusColor(status) {
  return { ok: "green", warning: "gold", error: "red", expired: "default", depleted: "red", unknown: "blue" }[status] || "default";
}

const tablePag = { pageSize: 20, showSizeChanger: false };

// ─── Context hooks ────────────────────────────────────────────────────────────

function useData()      { return useContext(DataContext); }
function useTheme()     { return useContext(ThemeModeContext); }
function usePalette()   { return useContext(ThemeModeContext).palette; }

// ─── Primitive UI components ─────────────────────────────────────────────────

function Card({ children, style, pad = 20, hover = false, onClick }) {
  const p = usePalette();
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setHovered(true)}
      onMouseLeave={() => hover && setHovered(false)}
      style={{
        background: p.surface,
        borderRadius: 16,
        border: `1px solid ${hovered ? p.primary : p.border}`,
        boxShadow: hovered ? `0 4px 16px rgba(13,151,98,0.12)` : p.shadow,
        padding: pad,
        transition: "border-color 0.16s, box-shadow 0.16s, transform 0.16s",
        transform: hovered ? "translateY(-2px)" : "none",
        cursor: onClick ? "pointer" : undefined,
        ...style
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--ant-color-text-tertiary)", display: "block", marginBottom: 10 }}>
      {children}
    </Text>
  );
}

function StatusBadge({ status }) {
  return <Tag color={statusColor(status)}>{statusLabels[status] || "未知"}</Tag>;
}

function CopyButton({ value, size = "small" }) {
  const { message } = AntApp.useApp();
  const [done, setDone] = useState(false);
  function copy() {
    copyText(value || "").then(() => {
      message.success("已复制");
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    });
  }
  return (
    <Button
      size={size}
      type="text"
      icon={done ? <CheckOutlined style={{ color: "var(--ant-color-primary)" }} /> : <CopyOutlined />}
      onClick={copy}
      style={{ flexShrink: 0 }}
    />
  );
}

function UrlPill({ value, mono = true }) {
  const p = usePalette();
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", minWidth: 0 }}>
      <span style={{
        fontFamily: mono ? "ui-monospace, Menlo, monospace" : undefined,
        fontSize: 12,
        background: p.fillLight,
        borderRadius: 6,
        padding: "2px 7px",
        color: p.text,
        wordBreak: "break-all",
        minWidth: 0,
        flex: 1
      }}>
        {value || "—"}
      </span>
      {value && <CopyButton value={value} />}
    </div>
  );
}

function PageSection({ title, actions, children }) {
  const p = usePalette();
  const screens = Grid.useBreakpoint();
  const mobile = !screens.md;
  return (
    <div style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: 16, overflow: "hidden", boxShadow: p.shadow }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${p.border}`, display: "flex", alignItems: mobile ? "flex-start" : "center", justifyContent: "space-between", flexDirection: mobile ? "column" : "row", gap: 10 }}>
        <Text strong style={{ fontSize: 16 }}>{title}</Text>
        {actions && <div style={{ width: mobile ? "100%" : "auto" }}>{actions}</div>}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function ActionBar({ children }) {
  const screens = Grid.useBreakpoint();
  const mobile = !screens.md;
  return (
    <Flex wrap gap={8} justify={mobile ? "flex-start" : "flex-end"} align="center" style={{ width: "100%", minWidth: 0 }}>
      {React.Children.map(children, child => {
        if (!React.isValidElement(child)) return child;
        const isInput = child.type === Input.Search || child.type === DatePicker;
        return (
          <div style={{ flex: mobile ? (isInput ? "1 1 100%" : "1 1 auto") : "0 1 auto", minWidth: 0 }}>
            {React.cloneElement(child, { style: { ...child.props.style, width: mobile ? "100%" : child.props.style?.width } })}
          </div>
        );
      })}
    </Flex>
  );
}

function PageTitle({ children }) {
  return <Text strong style={{ fontSize: 18, margin: 0, lineHeight: 1.35 }}>{children}</Text>;
}

function SubmitBtn({ loading, disabled, children }) {
  return (
    <Button type="primary" htmlType="submit" block size="large" loading={loading} disabled={disabled}
      style={{ borderRadius: 999, fontWeight: 700, height: 44 }}>
      {children}
    </Button>
  );
}

function InlineActions({ children }) {
  return <Flex wrap={false} gap={6} align="center">{children}</Flex>;
}

function CardActions({ children }) {
  return (
    <Flex wrap gap={8} align="center">
      {React.Children.map(children, child => child && React.isValidElement(child)
        ? React.cloneElement(child, { size: "small", style: { ...child.props.style, height: 32, paddingInline: 12, borderRadius: 999, fontSize: 13 } })
        : child
      )}
    </Flex>
  );
}

function DurationRadio({ purchasedAt, value, onChange }) {
  const p = usePalette();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {Object.entries(durationLabels).map(([key, label]) => {
        const expiry   = calcExpiry(purchasedAt, key);
        const selected = value === key;
        return (
          <div key={key} onClick={() => onChange?.(key)} style={{
            padding: "10px 12px", borderRadius: 10, cursor: "pointer",
            border: `1px solid ${selected ? p.primary : p.border}`,
            background: selected ? p.fill : p.surface,
            transition: "all 0.15s"
          }}>
            <Text strong style={{ fontSize: 14, color: selected ? p.primary : undefined }}>{label}</Text>
            {expiry && <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 2 }}>到 {formatDate(expiry)}</Text>}
          </div>
        );
      })}
    </div>
  );
}

// YAML viewer
function renderYamlLine(line) {
  if (!line) return " ";
  const ci = line.indexOf("#");
  const src = ci >= 0 ? line.slice(0, ci) : line;
  const cmt = ci >= 0 ? line.slice(ci) : "";
  const km  = src.match(/^(\s*-?\s*)([A-Za-z0-9_.-]+)(\s*:\s*)(.*)$/);
  if (km) return <>{km[1]}<span className="code-token-key">{km[2]}</span><span className="code-token-punctuation">{km[3]}</span>{renderYamlVal(km[4])}{cmt && <span className="code-token-comment">{cmt}</span>}</>;
  return <>{renderYamlVal(src)}{cmt && <span className="code-token-comment">{cmt}</span>}</>;
}
function renderYamlVal(v) {
  if (!v) return v;
  return v.split(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\btrue\b|\bfalse\b|\bnull\b|-?\b\d+(?:\.\d+)?\b)/gi)
    .map((p, i) => {
      if (!p) return null;
      if (/^'.*'$|^".*"$/.test(p)) return <span className="code-token-string" key={i}>{p}</span>;
      if (/^(true|false)$/i.test(p)) return <span className="code-token-boolean" key={i}>{p}</span>;
      if (/^null$/i.test(p)) return <span className="code-token-null" key={i}>{p}</span>;
      if (/^-?\d+(?:\.\d+)?$/.test(p)) return <span className="code-token-number" key={i}>{p}</span>;
      return p;
    });
}
function CodeViewer({ code, meta, language = "YAML" }) {
  const { message } = AntApp.useApp();
  const [copied, setCopied] = useState(false);
  const lines = String(code || "").split("\n");
  function handleCopy() { copyText(code || "").then(() => { message.success("已复制"); setCopied(true); setTimeout(() => setCopied(false), 1800); }); }
  return (
    <div className="code-viewer">
      <div className="code-viewer-toolbar">
        <div className="code-viewer-tabs"><span className="code-viewer-tab code-viewer-tab-active">{language}</span></div>
        <Button type="text" size="small" icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={handleCopy} />
      </div>
      {meta && <div className="code-viewer-meta">{meta}</div>}
      <pre className="code-viewer-body">
        {lines.map((line, i) => (
          <div className="code-viewer-line" key={i}>
            <span className="code-viewer-line-number">{i + 1}</span>
            <code>{renderYamlLine(line)}</code>
          </div>
        ))}
      </pre>
    </div>
  );
}

function BusyOverlay({ busy }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!busy) { setPct(0); return; }
    setPct(15);
    const t1 = setTimeout(() => setPct(50), 400);
    const t2 = setTimeout(() => setPct(80), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [busy]);
  return (
    <Modal open={Boolean(busy)} footer={null} closable={false} centered maskClosable={false} width={300}
      styles={{ content: { borderRadius: 16, padding: "28px 24px 24px" } }}>
      <Flex vertical align="center" gap={16}>
        <Spin size="large" style={{ color: "var(--ant-color-primary)" }} />
        <Text strong style={{ fontSize: 15 }}>{busy?.label || "处理中..."}</Text>
        <div style={{ width: "100%", height: 4, borderRadius: 999, background: "var(--ant-color-fill-secondary)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, width: `${pct}%`, background: "var(--ant-color-primary)", transition: "width 0.6s ease" }} />
        </div>
      </Flex>
    </Modal>
  );
}

// ─── Resizable table columns ──────────────────────────────────────────────────

const resizableComponents = { header: { cell: ResizableHeaderCell } };

function ResizableHeaderCell({ width, onResizeColumn, children, style, ...rest }) {
  function onMouseDown(e) {
    if (!width || !onResizeColumn) return;
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startW = width;
    function onMove(me) { onResizeColumn(Math.max(72, Math.round(startW + me.clientX - startX))); }
    function onUp()   { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.classList.remove("col-resizing"); }
    document.body.classList.add("col-resizing");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }
  return (
    <th {...rest} style={{ ...style, width }}>
      <span className="resizable-table-title">{children}</span>
      {width ? <span className="resizable-table-handle" onMouseDown={onMouseDown} /> : null}
    </th>
  );
}

function useResizableCols(columns, key) {
  const [widths, setWidths] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`col-w:${key}`) || "{}"); } catch { return {}; }
  });
  useEffect(() => { localStorage.setItem(`col-w:${key}`, JSON.stringify(widths)); }, [key, widths]);
  const cols = useMemo(() => columns.map((col, i) => {
    const colKey = col.key || (Array.isArray(col.dataIndex) ? col.dataIndex.join(".") : col.dataIndex) || col.title || `c${i}`;
    const w = widths[colKey] || col.width || 140;
    return { ...col, key: colKey, width: w, onHeaderCell: cur => ({
      ...(typeof col.onHeaderCell === "function" ? col.onHeaderCell(cur) : {}),
      width: w, onResizeColumn: nw => setWidths(p => ({ ...p, [colKey]: nw }))
    })};
  }), [columns, widths]);
  const scrollX = useMemo(() => cols.reduce((s, c) => s + (Number(c.width) || 140), 0), [cols]);
  return { columns: cols, components: resizableComponents, scrollX };
}

// ─── Theme config ─────────────────────────────────────────────────────────────

function makeAntTheme(palette, dark) {
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary:        palette.primary,
      colorText:           palette.text,
      colorTextSecondary:  palette.textSub,
      colorTextTertiary:   palette.textMuted,
      colorBorder:         palette.border,
      colorBorderSecondary:palette.border,
      colorFill:           palette.fill,
      colorFillSecondary:  palette.fillMid,
      colorFillTertiary:   palette.fillLight,
      colorBgLayout:       palette.page,
      colorBgContainer:    palette.surface,
      colorBgElevated:     palette.surfaceElevated,
      colorBgSpotlight:    palette.surfaceElevated,
      borderRadius:    10,
      borderRadiusLG: 16,
      borderRadiusSM:  6,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif",
      fontSize: 14, fontSizeHeading3: 20, fontSizeHeading4: 17,
      fontWeightStrong: 700, lineHeight: 1.5,
      motionDurationMid: "0.16s"
    },
    components: {
      Layout: { bodyBg: palette.page, headerBg: "transparent", siderBg: "transparent" },
      Card:   { borderRadiusLG: 16, colorBgContainer: palette.surface, colorBorderSecondary: palette.border },
      Menu: {
        itemBorderRadius: 999, itemHeight: 38, fontSize: 14,
        itemBg: "transparent", itemColor: palette.textSub,
        itemHoverBg: palette.fill, itemHoverColor: palette.primary,
        itemSelectedBg: palette.fill, itemSelectedColor: palette.primary,
        horizontalItemSelectedBg: "transparent", horizontalItemSelectedColor: palette.primary,
        horizontalItemHoverBg: "transparent", horizontalItemHoverColor: palette.primary,
        activeBarHeight: 0, activeBarWidth: 0
      },
      Table: {
        headerBg: palette.fillLight, headerColor: palette.textSub,
        rowHoverBg: palette.surfaceHover, borderColor: palette.border,
        colorBgContainer: palette.surface, cellPaddingBlock: 12, cellPaddingInline: 14,
        fontSize: 13, borderRadius: 0
      },
      Button: {
        fontWeight: 600, controlHeight: 36, controlHeightLG: 42,
        borderRadius: 999, borderRadiusLG: 999,
        colorPrimary: palette.primary, colorPrimaryHover: palette.primaryDark,
        primaryColor: "#fff",
        defaultBg: palette.surface, defaultColor: palette.text,
        defaultBorderColor: palette.border,
        defaultHoverBg: palette.fill, defaultHoverColor: palette.primary,
        defaultHoverBorderColor: palette.primary
      },
      Input:      { controlHeight: 36, borderRadius: 10, colorBgContainer: palette.surface },
      Select:     { controlHeight: 36, borderRadius: 10, optionSelectedBg: palette.fill, optionActiveBg: palette.fill },
      DatePicker: { controlHeight: 36, borderRadius: 10, colorBgContainer: palette.surface },
      Modal:      { borderRadiusLG: 16, headerBg: palette.surface, contentBg: palette.surface },
      Tag:        { borderRadiusSM: 999 },
      Statistic:  { titleFontSize: 12, contentFontSize: 22 },
      Drawer:     { colorBgElevated: palette.surfaceElevated },
      Notification: { colorBgElevated: palette.surfaceElevated }
    }
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function RequireAuth({ children }) {
  const [ready, setReady] = useState(false);
  const [ok, setOk]       = useState(false);
  useEffect(() => { fetchJson("/api/auth/me").then(() => setOk(true)).catch(() => setOk(false)).finally(() => setReady(true)); }, []);
  if (!ready) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><Spin size="large" /></div>;
  if (!ok)    return <Navigate to="/login" replace />;
  return children;
}

function LoginPage() {
  const p = usePalette();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");

  async function submit(values) {
    setLoading(true); setErr("");
    try {
      const res     = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ ...values, remember: false }) });
      const payload = await res.json();
      if (!res.ok) return setErr(payload.error || "登录失败");
      navigate("/urls", { replace: true });
    } catch { setErr("无法连接登录服务"); }
    finally  { setLoading(false); }
  }

  return (
    <div style={{ minHeight: "100vh", background: p.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 380, padding: "0 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: p.primary, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 22, fontWeight: 800, marginBottom: 12 }}>X</div>
          <Title level={3} style={{ margin: 0, fontWeight: 800 }}>XELA Monitor</Title>
          <Text type="secondary">订阅中转管理后台</Text>
        </div>
        <Card pad={28}>
          <Form layout="vertical" onFinish={submit} requiredMark={false}>
            <Form.Item name="account" label="账号" rules={[{ required: true, message: "请输入账号" }]} style={{ marginBottom: 16 }}>
              <Input autoComplete="username" placeholder="账号" size="large" style={{ borderRadius: 10 }} />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]} style={{ marginBottom: 20 }}>
              <Input.Password autoComplete="current-password" placeholder="密码" size="large" style={{ borderRadius: 10 }} />
            </Form.Item>
            {err && <Text type="danger" style={{ display: "block", marginBottom: 14, fontSize: 13 }}>{err}</Text>}
            <Button type="primary" htmlType="submit" block loading={loading} size="large" style={{ borderRadius: 999, fontWeight: 700, height: 44 }}>登录</Button>
          </Form>
        </Card>
      </div>
    </div>
  );
}

// ─── Top navigation ───────────────────────────────────────────────────────────

function TopNav({ selectedKey, onSelect, isMobile, onDrawer, darkMode, toggleTheme, logout, version }) {
  const p = usePalette();
  return (
    <div style={{ display: "flex", alignItems: "center", width: "100%", height: "100%", gap: 16 }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {isMobile && <Button type="text" icon={<MenuOutlined />} onClick={onDrawer} style={{ color: p.textSub }} />}
        <div style={{ width: 34, height: 34, borderRadius: 10, background: p.primary, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: -0.5 }}>X</div>
        <Text strong style={{ fontSize: 15, letterSpacing: -0.3 }}>XELA</Text>
      </div>

      {/* Center nav */}
      {!isMobile && (
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <Menu
            mode="horizontal"
            selectedKeys={[selectedKey]}
            items={NAV_ITEMS}
            onClick={onSelect}
            style={{ border: "none", background: "transparent", minWidth: 0, fontSize: 14, fontWeight: 600 }}
          />
        </div>
      )}
      {isMobile && <div style={{ flex: 1 }} />}

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>v{version || "--"}</Text>
        <Button type="text" shape="circle" icon={darkMode ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} style={{ color: p.textSub }} />
        <Button type="text" shape="circle" icon={<LogoutOutlined />} onClick={logout} style={{ color: p.textSub }} />
      </div>
    </div>
  );
}

// ─── Dashboard (Summary) ─────────────────────────────────────────────────────

function KpiCard({ label, value, accent = false }) {
  const p = usePalette();
  return (
    <Card pad="18px 20px">
      <Text style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, color: p.textMuted, display: "block", marginBottom: 8 }}>{label}</Text>
      <Text style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: accent ? p.primary : p.text }}>{value}</Text>
    </Card>
  );
}

function MiniProgressBar({ pct, warn = false }) {
  const p = usePalette();
  const color = pct < 20 ? "#ef4444" : pct < 50 ? "#f59e0b" : p.primary;
  return (
    <div style={{ height: 6, borderRadius: 999, background: p.fillMid, overflow: "hidden", marginTop: 6 }}>
      <div style={{ height: "100%", borderRadius: 999, width: `${pct}%`, background: color, transition: "width 0.4s" }} />
    </div>
  );
}

function Dashboard() {
  const p = usePalette();
  const { subscriptions, users, bills } = useData();
  const screens = Grid.useBreakpoint();
  const wide = screens.xl;

  // KPI data
  const counts       = subscriptions.reduce((a, s) => ({ ...a, [s.status]: (a[s.status] || 0) + 1 }), {});
  const activeBills  = bills.filter(b => !b.reversedAt);
  const paidTotal    = activeBills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const now          = new Date();
  const monthPfx     = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const todayPfx     = `${monthPfx}-${String(now.getDate()).padStart(2, "0")}`;
  const monthIncome  = activeBills.filter(b => (b.occurredAt || "").startsWith(monthPfx)).reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const todayIncome  = activeBills.filter(b => (b.occurredAt || "").startsWith(todayPfx)).reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const expiringUsers = users.filter(u => userStatus(u) === "warning");

  // Most critical URL (lowest remaining %)
  const criticalUrl = [...subscriptions]
    .filter(s => s.status !== "expired" && s.metrics?.totalBytes)
    .sort((a, b) => (a.metrics.remainingBytes / a.metrics.totalBytes) - (b.metrics.remainingBytes / b.metrics.totalBytes))[0];

  const recentBills = [...bills].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).slice(0, 5);

  const leftCol = (
    <Flex vertical gap={24} style={{ flex: 1, minWidth: 0 }}>
      {/* Hero title */}
      <div>
        <div style={{ fontSize: wide ? 44 : 32, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1.5, color: p.text }}>订阅中转</div>
        <div style={{ fontSize: wide ? 44 : 32, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1.5, color: p.textMuted }}>控制台</div>
      </div>

      {/* Status KPIs */}
      <div>
        <SectionLabel>状态监控</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${wide ? 4 : 2}, 1fr)`, gap: 10 }}>
          <KpiCard label="池 URL"     value={subscriptions.length} />
          <KpiCard label="用户总数"   value={users.length} />
          <KpiCard label="需关注 URL" value={counts.warning || 0} accent={!!(counts.warning)} />
          <KpiCard label="即将到期"   value={expiringUsers.length} accent={!!expiringUsers.length} />
        </div>
      </div>

      {/* Income KPIs */}
      <div>
        <SectionLabel>收入概览</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${wide ? 3 : 1}, 1fr)`, gap: 10 }}>
          <KpiCard label="今日收入" value={formatMoney(todayIncome)} />
          <KpiCard label="本月收入" value={formatMoney(monthIncome)} />
          <KpiCard label="累计收款" value={formatMoney(paidTotal)} />
        </div>
      </div>
    </Flex>
  );

  const rightCol = (
    <Flex vertical gap={12} style={{ width: wide ? 292 : "100%", flexShrink: 0 }}>
      {/* Critical URL card */}
      {criticalUrl && (
        <Card>
          <SectionLabel>最需关注 URL</SectionLabel>
          <Text strong style={{ fontSize: 14, display: "block" }}>{criticalUrl.email || serviceProviderLabel(criticalUrl)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{serviceProviderLabel(criticalUrl)}</Text>
          {criticalUrl.metrics?.totalBytes && (() => {
            const pct = Math.round(criticalUrl.metrics.remainingBytes / criticalUrl.metrics.totalBytes * 100);
            return (
              <>
                <Flex justify="space-between" style={{ marginTop: 10 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>剩余流量</Text>
                  <Text style={{ fontSize: 12 }}>{pct}%</Text>
                </Flex>
                <MiniProgressBar pct={pct} />
                <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
                  {formatBytes(criticalUrl.metrics.remainingBytes)} / {formatBytes(criticalUrl.metrics.totalBytes)}
                </Text>
              </>
            );
          })()}
        </Card>
      )}

      {/* Expiring users */}
      {expiringUsers.length > 0 && (
        <Card>
          <SectionLabel>即将到期用户</SectionLabel>
          <Flex vertical gap={10}>
            {expiringUsers.slice(0, 4).map(u => (
              <Flex key={u.id} justify="space-between" align="center">
                <Flex align="center" gap={8}>
                  <WarningOutlined style={{ color: "#f59e0b", fontSize: 13 }} />
                  <Text style={{ fontSize: 13 }}>{u.userId}</Text>
                </Flex>
                <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(u.expiresAt)}</Text>
              </Flex>
            ))}
            {expiringUsers.length > 4 && <Text type="secondary" style={{ fontSize: 12 }}>+{expiringUsers.length - 4} 更多</Text>}
          </Flex>
        </Card>
      )}

      {/* Recent bills */}
      {recentBills.length > 0 && (
        <Card>
          <SectionLabel>最近账单</SectionLabel>
          <Flex vertical gap={10}>
            {recentBills.map(b => (
              <Flex key={b.id} justify="space-between" align="center">
                <div style={{ minWidth: 0 }}>
                  <Text style={{ fontSize: 13, display: "block" }} ellipsis={{ tooltip: b.userLabel }}>{b.userLabel}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{formatDate(b.occurredAt)}</Text>
                </div>
                <Text strong style={{ fontSize: 13, color: b.reversedAt ? p.textMuted : p.primary, flexShrink: 0, marginLeft: 12 }}>{formatMoney(b.amount)}</Text>
              </Flex>
            ))}
          </Flex>
        </Card>
      )}
    </Flex>
  );

  return (
    <div style={{ marginBottom: 32 }}>
      <Flex gap={28} align="flex-start" vertical={!wide}>
        {leftCol}
        {rightCol}
      </Flex>
      <div style={{ height: 1, background: p.border, marginTop: 28 }} />
    </div>
  );
}

// ─── App layout ───────────────────────────────────────────────────────────────

function AppLayout() {
  const p = usePalette();
  const { darkMode, toggleTheme } = useTheme();
  const { meta, loading, error, subscriptions, users, bills } = useData();
  const [drawer, setDrawer]         = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();
  const screens   = Grid.useBreakpoint();
  const isMobile  = !screens.lg;
  const selKey    = location.pathname.startsWith("/urls") ? "/urls" : location.pathname;
  const isDetail  = /^\/urls\/detail\/[^/]+/.test(location.pathname);
  const initial   = loading && !subscriptions.length && !users.length && !bills.length;

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    navigate("/login", { replace: true });
  }

  function handleNav({ key }) { navigate(key); setDrawer(false); }

  return (
    <AntLayout style={{ minHeight: "100dvh", background: p.page, flexDirection: "column" }}>
      {/* Top nav bar */}
      <Header style={{ height: 60, background: p.surface, borderBottom: `1px solid ${p.border}`, padding: "0 24px", lineHeight: 1, position: "sticky", top: 0, zIndex: 100 }}>
        <TopNav
          selectedKey={selKey} onSelect={handleNav}
          isMobile={isMobile}  onDrawer={() => setDrawer(true)}
          darkMode={darkMode}  toggleTheme={toggleTheme}
          logout={logout}      version={meta?.version}
        />
      </Header>

      <Content style={{
        padding: isMobile
          ? "16px calc(16px + env(safe-area-inset-right)) calc(32px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))"
          : "24px 32px 48px",
        minWidth: 0
      }}>
        {error && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 12, padding: "10px 16px", marginBottom: 16 }}><Text type="danger">{error}</Text></div>}

        {initial ? (
          <Flex vertical gap={16}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[1,2,3,4].map(i => <Card key={i} pad={20}><Skeleton active paragraph={{ rows: 1 }} /></Card>)}
            </div>
            <Card><Skeleton active paragraph={{ rows: 6 }} /></Card>
          </Flex>
        ) : (
          <>
            {!isDetail && <Dashboard />}
            <Routes>
              <Route path="/urls"             element={<UrlPoolPage />} />
              <Route path="/urls/detail/:id"  element={<PoolDetailPage />} />
              <Route path="/users"            element={<UsersPage />} />
              <Route path="/bills"            element={<BillsPage />} />
              <Route path="*"                 element={<Navigate to="/urls" replace />} />
            </Routes>
          </>
        )}

        <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 24 }}>
          {loading ? "同步中..." : `Last updated: ${formatDateTime(meta?.updatedAt)}`}
        </Text>
      </Content>

      {/* Mobile drawer */}
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={240}
        styles={{ header: { padding: "16px 20px" }, body: { padding: "8px 12px" } }}
        title={<Flex align="center" gap={10}><div style={{ width: 30, height: 30, borderRadius: 8, background: p.primary, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>X</div><Text strong>XELA</Text></Flex>}
      >
        <Menu mode="inline" selectedKeys={[selKey]} items={NAV_ITEMS} onClick={handleNav}
          style={{ border: "none", background: "transparent" }} />
      </Drawer>

      <BusyOverlay busy={useData().busy} />
    </AntLayout>
  );
}

// ─── DataProvider ─────────────────────────────────────────────────────────────

function DataProvider({ children }) {
  const [state, setState] = useState({ subscriptions: [], users: [], bills: [], meta: null, loading: true, error: "" });
  const [busy, setBusy] = useState(null);

  const apis = useMemo(() => ({
    subscriptions: "/api/subscriptions",
    users: "/api/users",
    bills: "/api/bills",
    meta:  "/api/app-meta"
  }), []);

  const reload = useCallback(async (collections = null) => {
    const keys = collections || ["subscriptions", "users", "bills", "meta"];
    setState(s => ({ ...s, loading: !collections, error: "" }));
    try {
      const results = await Promise.all(keys.map(k => fetchJson(apis[k])));
      setState(s => { const p = {}; keys.forEach((k, i) => { p[k] = results[i]; }); return { ...s, ...p, loading: false, error: "" }; });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, [apis]);

  useEffect(() => { reload(); }, [reload]);

  const runAsync = useCallback(async (task, label = "处理中...") => {
    setBusy({ label });
    try { return await task(); } finally { setBusy(null); }
  }, []);

  const value = useMemo(() => ({ ...state, reload, runAsync, busy }), [state, reload, runAsync, busy]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// ─── Helpers (sub-pages) ──────────────────────────────────────────────────────

function useResponsiveList() {
  const screens = Grid.useBreakpoint();
  return !screens.md;
}

// ─── URL Pool ─────────────────────────────────────────────────────────────────

function UrlText({ value }) {
  return <UrlPill value={value} mono />;
}

function MobileUrlBlock({ value }) {
  return <CopyButton value={value} />;
}

function CopyableUrlPill({ value, className }) {
  return (
    <span className={`copyable-url copyable-url-mobile${className ? ` ${className}` : ""}`}>
      <Text className="copyable-url-text" copyable code>{value}</Text>
    </span>
  );
}

function PoolDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const p = usePalette();
  const { darkMode } = useTheme();
  const { subscriptions, users, reload, runAsync } = useData();
  const [cache, setCache] = useState(null);
  const [refreshingTraffic, setRefreshingTraffic] = useState(false);
  const item = subscriptions.find(e => e.id === id);
  const boundUsers = item ? users.filter(u => u.subscriptionId === item.id) : [];

  const userCols = [
    { title: "用户 ID", dataIndex: "userId" },
    { title: "微信名", dataIndex: "wechatName", render: v => v || "—" },
    { title: "到期", render: (_, u) => formatDate(u.expiresAt) },
    { title: "状态", render: (_, u) => <StatusBadge status={userStatus(u)} /> }
  ];
  const boundUserTable = useResizableCols(userCols, "url-detail-bound-users");

  useEffect(() => {
    if (!item?.id) return;
    let cancelled = false;
    runAsync(async () => {
      const result = await fetchJson(`/api/subscriptions/${item.id}/cache`).catch(e => ({ error: e.message }));
      if (!cancelled) setCache(result);
    }, "正在读取详情...");
    return () => { cancelled = true; };
  }, [item?.id, runAsync]);

  if (!item) return (
    <PageSection title="URL 详情"><Empty description="没有找到这条池 URL。" /></PageSection>
  );

  async function refreshTraffic() {
    setRefreshingTraffic(true);
    try {
      await runAsync(async () => {
        await postJson(`/api/subscriptions/${item.id}/refresh`);
        await reload(["subscriptions"]);
      }, "正在刷新 URL 数据...");
    } finally { setRefreshingTraffic(false); }
  }

  const m = item.metrics || {};
  const trafficPct = m.totalBytes ? Math.max(0, Math.min(100, Math.round((m.remainingBytes || 0) / m.totalBytes * 100))) : 0;
  const usedPct = m.totalBytes ? Math.max(0, Math.min(100, Math.round((m.usedBytes || 0) / m.totalBytes * 100))) : 0;
  const isNarrow = !screens.lg;
  const isMobile = !screens.md;
  const singleCol = !screens.xl;
  const borderColor = p.border;

  const sectionStyle = { padding: isNarrow ? "22px 0" : "26px 0", borderTop: `1px solid ${borderColor}` };
  const titleStyle = { margin: 0, fontSize: 18, fontWeight: 600 };
  const keyStyle = { color: p.textMuted, fontSize: 14 };
  const valueStyle = { fontSize: 14, fontWeight: 500 };

  const renderRows = rows => (
    <div style={{ display: "grid", gap: 15 }}>
      {rows.map(row => (
        <div key={row.label} style={{ display: "grid", gridTemplateColumns: "minmax(92px, 0.42fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
          <Text style={keyStyle}>{row.label}</Text>
          <div style={{ ...valueStyle, minWidth: 0, textAlign: isNarrow ? "left" : "right", wordBreak: "break-word" }}>{row.value}</div>
        </div>
      ))}
    </div>
  );

  const cacheText = cache?.error ? `错误：${cache.error}` : (cache?.body || "（未获取到实时 YAML）");
  const cacheMeta = cache?.fetchedAt ? `${formatDateTime(cache.fetchedAt)} · ${formatBytes(cache.bodyLength || 0)}${cache.truncated ? "（已截断）" : ""}` : "";

  return (
    <div className="detail-page" style={{ color: p.text }}>
      <header style={{ padding: isNarrow ? "2px 0 18px" : "4px 0 22px", borderBottom: `1px solid ${borderColor}` }}>
        <div style={{ height: 1, background: borderColor, margin: isNarrow ? "14px 0 18px" : "18px 0 20px" }} />
        <div className="detail-hero">
          <div className="detail-hero-toolbar">
            <div className="detail-hero-actions">
              <Button size="small" onClick={() => navigate("/urls")} style={{ height: 32, borderRadius: 6, paddingInline: 12, fontSize: 13 }}>返回 URL 池</Button>
              <Button className="detail-refresh-button" size="small" icon={<ReloadOutlined />} loading={refreshingTraffic} onClick={refreshTraffic} style={{ height: 32, borderRadius: 6, paddingInline: refreshingTraffic ? 16 : 12 }}>刷新</Button>
            </div>
          </div>
          <div className="detail-hero-main">
            <Title level={1} style={{ margin: 0, fontSize: isMobile ? 24 : isNarrow ? 26 : 32, lineHeight: 1.25, fontWeight: 600 }}>{item.email || item.name || "池 URL 详情"}</Title>
            <CopyableUrlPill value={item.url} className="detail-url-copyable" />
          </div>
        </div>
      </header>

      <main style={{ display: "grid", gridTemplateColumns: singleCol ? "1fr" : "minmax(0,1fr) minmax(300px,380px)", columnGap: singleCol ? 0 : 48 }}>
        <div style={{ padding: isNarrow ? "22px 0 0" : "28px 0 0", minWidth: 0 }}>
          <section style={{ padding: isNarrow ? "22px 0 0" : "28px 0 0", borderTop: "none" }}>
            <Flex justify="space-between" align="center" gap={12} wrap="wrap" style={{ marginBottom: 16 }}>
              <Title level={3} style={titleStyle}>流量</Title>
            </Flex>
            <div className="traffic-visual-panel">
              <div className="traffic-visual-header">
                <div>
                  <Text type="secondary" style={{ display: "block", fontSize: 13 }}>剩余流量比例</Text>
                  <Text strong style={{ fontSize: 28, lineHeight: 1.2 }}>{trafficPct}%</Text>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Text type="secondary" style={{ display: "block", fontSize: 13 }}>已用流量比例</Text>
                  <Text strong style={{ fontSize: 20, lineHeight: 1.35 }}>{usedPct}%</Text>
                </div>
              </div>
              <div className="traffic-bar">
                <div className="traffic-bar-used" style={{ width: `${usedPct}%` }} />
                <div className="traffic-bar-remaining" style={{ width: `${trafficPct}%` }} />
              </div>
              <div className="traffic-stat-grid">
                {[
                  { label: "剩余流量", value: m.remainingBytes != null ? formatBytes(m.remainingBytes) : "-", tone: "remaining" },
                  { label: "已用流量", value: m.usedBytes != null ? formatBytes(m.usedBytes) : "-", tone: "used" },
                  { label: "总流量", value: m.totalBytes != null ? formatBytes(m.totalBytes) : "-", tone: "total" }
                ].map(row => (
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
              <Title level={3} style={titleStyle}>绑定用户</Title>
              <Text style={keyStyle}>{boundUsers.length} 人正在使用</Text>
            </Flex>
            {boundUsers.length && isMobile ? (
              <div className="detail-user-card-list">
                {boundUsers.map(u => (
                  <div className="detail-user-card" key={u.id}>
                    <div>
                      <Text strong>{u.userId}</Text>
                      <Text type="secondary" style={{ display: "block", fontSize: 12, marginTop: 2 }}>{u.wechatName || "—"}</Text>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <Text style={{ display: "block", fontSize: 13 }}>{formatDate(u.expiresAt)}</Text>
                      <StatusBadge status={userStatus(u)} />
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
              <Title level={3} style={titleStyle}>实时 YAML</Title>
            </Flex>
            <CodeViewer code={cacheText} meta={cacheMeta} language="YAML" />
          </section>
        </div>

        <aside style={{ padding: singleCol ? "24px 0 0" : "28px 0 0 24px", borderLeft: singleCol ? "none" : `1px solid ${borderColor}`, borderTop: singleCol ? `1px solid ${borderColor}` : "none" }}>
          <section style={{ paddingBottom: 24 }}>
            <Title level={3} style={{ ...titleStyle, marginBottom: 18 }}>信息</Title>
            {renderRows([
              { label: "状态", value: <StatusBadge status={item.status} /> },
              { label: "到期时间", value: m.expireAt ? formatDateTime(m.expireAt) : "-" },
              { label: "HTTP 状态", value: item.httpStatus || "-" },
              { label: "上次检查", value: item.lastCheckedAt ? formatDateTime(item.lastCheckedAt) : "-" }
            ])}
          </section>
          <section style={sectionStyle}>
            <Title level={3} style={{ ...titleStyle, marginBottom: 18 }}>使用情况</Title>
            {renderRows([
              { label: "绑定用户", value: `${boundUsers.length} 人` },
              { label: "剩余流量比例", value: `${trafficPct}%` },
              { label: "池 URL ID", value: item.id }
            ])}
          </section>
          {item.lastError && (
            <section style={sectionStyle}>
              <Title level={3} style={{ ...titleStyle, marginBottom: 12, color: "var(--ant-color-error)" }}>错误</Title>
              <Paragraph style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>{item.lastError}</Paragraph>
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}

// ─── Subscription Form ────────────────────────────────────────────────────────

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
    <Modal title={item.id ? "编辑池 URL" : "添加池 URL"} open onCancel={onClose} footer={null} destroyOnHidden styles={MODAL_STYLES}>
      <Form form={form} layout="vertical" initialValues={{ url: item.url || "", email: item.email || "", note: item.note || "" }} onFinish={submit}>
        <Flex vertical gap={16}>
          <div style={FIELD_GROUP}>
            <Form.Item name="url" label="订阅 URL" rules={[{ required: true, type: "url", message: "请输入正确的 URL" }]} style={FIELD_ITEM}><Input variant="borderless" placeholder="https://" /></Form.Item>
            <div style={FIELD_SEP} />
            <Form.Item name="email" label="绑定邮箱" rules={[{ required: true, type: "email", message: "请输入邮箱" }]} style={FIELD_ITEM}><Input variant="borderless" placeholder="user@example.com" /></Form.Item>
          </div>
          <div style={{ ...FIELD_GROUP, padding: "10px 16px 12px" }}>
            <Form.Item name="note" label="备注" style={{ marginBottom: 0 }}><TextArea variant="borderless" rows={3} placeholder="选填" style={{ padding: 0 }} /></Form.Item>
          </div>
          <Flex justify="end"><SubmitBtn loading={false}>保存</SubmitBtn></Flex>
        </Flex>
      </Form>
    </Modal>
  );
}

// ─── URL Pool Page ────────────────────────────────────────────────────────────

function PoolCards({ items, actions }) {
  const p = usePalette();
  if (!items.length) return <Empty description="还没有池 URL。" />;
  return (
    <Flex vertical gap={12}>
      {items.map(item => (
        <Card key={item.id} hover style={{ padding: 16 }}>
          <Flex justify="space-between" gap={12} align="start" style={{ marginBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <Text strong style={{ display: "block", fontSize: 15 }}>{item.email || item.name || "未填写"}</Text>
              <Text type="secondary" style={{ fontSize: 13 }}>{item.customerCount || 0} 个客户</Text>
            </div>
            <StatusBadge status={item.status} />
          </Flex>
          <div style={{ padding: "10px 0 12px", borderTop: `1px solid ${p.border}`, borderBottom: `1px solid ${p.border}` }}>
            <UrlPill value={item.url} />
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
            {[["到期", item.status === "expired" ? "-" : formatDate(item.metrics?.expireAt)]].map(([label, value]) => (
              <Flex justify="space-between" align="center" gap={12} key={label}>
                <Text type="secondary" style={{ fontSize: 13, flex: "0 0 auto" }}>{label}</Text>
                <Text strong style={{ fontSize: 13 }}>{value}</Text>
              </Flex>
            ))}
          </div>
          <div style={{ paddingTop: 2 }}>{actions(item)}</div>
        </Card>
      ))}
    </Flex>
  );
}

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

  async function action(run) {
    await runAsync(async () => {
      try { await run(); await reload(["subscriptions"]); }
      catch (e) { notification.error({ message: "操作失败", description: e.message, placement: "bottomRight" }); }
    }, "正在处理 URL 池操作...");
  }

  const actions = (item, compact = false) => {
    const Wrap = compact ? InlineActions : CardActions;
    const bp = compact ? { size: "small", style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy } : { style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy };
    return (
      <Wrap>
        <Button {...bp} icon={<EditOutlined />} onClick={() => setEditing(item)}>编辑</Button>
        <Button {...bp} icon={<ReloadOutlined />} onClick={() => action(() => postJson(`/api/subscriptions/${item.id}/refresh`))}>刷新</Button>
        <Button {...bp} icon={<EyeOutlined />} onClick={() => navigate(`/urls/detail/${item.id}`)}>查看</Button>
        <Button {...bp} danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "删除池 URL", content: "确定删除吗？", onOk: () => action(() => fetchJson(`/api/subscriptions/${item.id}`, { method: "DELETE" })) })}>删除</Button>
      </Wrap>
    );
  };

  const columns = [
    { title: "#", render: (_, __, i) => i + 1, width: 64 },
    { title: "邮箱", render: (_, item) => item.email || item.name || "未填写", width: 160 },
    { title: "池 URL", dataIndex: "url", render: v => <UrlText value={v} />, width: 320 },
    { title: "客户数", dataIndex: "customerCount", render: v => v || 0, width: 82 },
    { title: "剩余流量", render: (_, item) => {
      if (item.status === "expired" || !item.metrics?.totalBytes) return <span>{formatBytes(item.metrics?.remainingBytes)}</span>;
      const pct = Math.round(item.metrics.remainingBytes / item.metrics.totalBytes * 100);
      return <Flex vertical gap={2} style={{ minWidth: 90 }}><Progress percent={pct} size="small" strokeColor={pct < 20 ? "#ff4d4f" : pct < 50 ? "#faad14" : "#52c41a"} showInfo={false} /><Text style={{ fontSize: 11 }}>{formatBytes(item.metrics.remainingBytes)} / {formatBytes(item.metrics.totalBytes)}</Text></Flex>;
    }, width: 140 },
    { title: "到期", render: (_, item) => item.status === "expired" ? "-" : formatDate(item.metrics?.expireAt), width: 120 },
    { title: "状态", dataIndex: "status", render: v => <StatusBadge status={v} />, width: 90 },
    { title: "操作", render: (_, item) => actions(item, true), width: 300 }
  ].map(col => ({ ...col, onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }), onCell: () => ({ style: { whiteSpace: "nowrap" } }) }));
  const poolTable = useResizableCols(columns, "url-pool");

  return (
    <section className="flat-list-section">
      <div className="flat-list-header">
        <PageTitle>URL 池</PageTitle>
        <ActionBar>
          <Input.Search allowClear placeholder="搜索 URL、邮箱或备注" style={{ width: 210 }} onSearch={setKeyword} onChange={e => setKeyword(e.target.value)} />
          <Button onClick={() => setShowExpired(v => !v)}>{showExpired ? "隐藏已到期" : "显示已到期"}</Button>
          <Button icon={<PlusOutlined />} onClick={() => setEditing({})}>添加 URL</Button>
        </ActionBar>
      </div>
      {mobile
        ? <PoolCards items={visible} actions={actions} />
        : <Table className="plain-detail-table user-flat-table" size="middle" rowKey="id" columns={poolTable.columns} components={poolTable.components} dataSource={visible} pagination={tablePag} scroll={{ x: Math.max(1520, poolTable.scrollX) }} />
      }
      {editing && <SubscriptionForm item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(["subscriptions"]); }} />}
    </section>
  );
}


// ─── Subconverter Panel ───────────────────────────────────────────────────────

function SubconverterPanel() {
  return (
    <div style={FIELD_GROUP}>
      <div style={{ padding: "10px 16px 0" }}>
        <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>Subconverter 参数</Text>
      </div>
      <Row gutter={0}>
        <Col xs={24} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
          <Form.Item name={["subconverterConfig", "target"]} label="输出格式" style={FIELD_ITEM}>
            <Select {...inModalSelectProps} variant="borderless" allowClear placeholder="target" options={SC_TARGETS} style={{ marginLeft: -11 }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={16}>
          <Form.Item name={["subconverterConfig", "config"]} label="远程配置 URL" style={FIELD_ITEM}>
            <Input variant="borderless" placeholder="选填，https://..." />
          </Form.Item>
        </Col>
      </Row>
      <div style={FIELD_SEP} />
      <Row gutter={0}>
        <Col xs={24} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
          <Form.Item name={["subconverterConfig", "include"]} label="include" style={FIELD_ITEM}>
            <Input variant="borderless" placeholder="节点过滤正则" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
          <Form.Item name={["subconverterConfig", "exclude"]} label="exclude" style={FIELD_ITEM}>
            <Input variant="borderless" placeholder="节点排除正则" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name={["subconverterConfig", "rename"]} label="rename" style={{ ...FIELD_ITEM, paddingBottom: 4 }}>
            <Input variant="borderless" placeholder="旧名@新名" />
          </Form.Item>
        </Col>
      </Row>
      <div style={FIELD_SEP} />
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

function useSubscriptionRecommendation({ expiresAt, purchasedAt, duration, ignoredUserId = "", fallbackId = "", enabled = true }) {
  const [state, setState] = useState({ result: null, reason: null, loading: false });
  useEffect(() => {
    const normExpiry = recommendationDate(expiresAt);
    const normPurchased = recommendationDate(purchasedAt);
    if (!enabled || (!normExpiry && (!normPurchased || !duration))) {
      setState({ result: null, reason: null, loading: false });
      return;
    }
    let cancelled = false;
    setState(s => ({ ...s, loading: true }));
    postJson("/api/subscriptions/recommend", { expiresAt: normExpiry, purchasedAt: normPurchased, duration, ignoredUserId, fallbackId })
      .then(payload => {
        if (!cancelled) setState({ result: payload.subscription || payload.recommended || null, reason: payload.reason || null, loading: false });
      })
      .catch(err => { if (!cancelled) setState({ result: null, reason: err.message, loading: false }); });
    return () => { cancelled = true; };
  }, [enabled, expiresAt, purchasedAt, duration, ignoredUserId, fallbackId]);
  return state;
}

function OutputModeSection({ form, initialOutputMode, subscriptions, recommended, recommendReason, showRecommendation }) {
  const outputMode = Form.useWatch("outputMode", form);
  const useSubconverter = (outputMode || initialOutputMode) === "subconverter";
  return (
    <>
      <div style={FIELD_GROUP}>
        <div style={{ padding: "10px 16px 0" }}>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>输出方式</Text>
        </div>
        <Form.Item name="outputMode" style={{ ...FIELD_ITEM, paddingBottom: 4 }}>
          <Radio.Group optionType="button" buttonStyle="solid" style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <Radio.Button value="subconverter" style={{ textAlign: "center" }}>A. Subconverter</Radio.Button>
            <Radio.Button value="direct" style={{ textAlign: "center" }}>B. 池 URL</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <div style={FIELD_SEP} />
        {showRecommendation && (
          <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
            <Text type={recommended ? "secondary" : "warning"} style={{ fontSize: 12 }}>
              {recommended ? `推荐：${subscriptionLabel(recommended)}` : (recommendReason || "无匹配池 URL，请手动选择")}
            </Text>
          </div>
        )}
        <Form.Item name="subscriptionId" label={useSubconverter ? "绑定池 URL" : "使用池 URL"} rules={[{ required: true, message: "请选择池 URL" }]} style={{ ...FIELD_ITEM, paddingBottom: 4 }}>
          <Select virtual={false} variant="borderless" options={subscriptions.map(s => ({ value: s.id, label: subscriptionLabel(s) }))} style={{ marginLeft: -11 }} />
        </Form.Item>
      </div>
      {useSubconverter && <SubconverterPanel />}
    </>
  );
}

// ─── User Form ────────────────────────────────────────────────────────────────

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
  const initialExpiresAt = item.expiresAt ? dayjs(item.expiresAt) : dayjs(calcExpiry(initialPurchasedAt, initialDuration));

  function handleChange(changed, values) {
    if (Object.prototype.hasOwnProperty.call(changed, "subscriptionId")) subscriptionTouched.current = true;
    if (Object.prototype.hasOwnProperty.call(changed, "expiresAt")) { expiryTouched.current = true; return; }
    if (!expiryTouched.current && (Object.prototype.hasOwnProperty.call(changed, "purchasedAt") || Object.prototype.hasOwnProperty.call(changed, "duration"))) {
      const next = calcExpiry(values.purchasedAt, values.duration);
      if (next) form.setFieldsValue({ expiresAt: dayjs(next) });
    }
  }

  async function submit(values) {
    await runAsync(async () => {
      const payload = { ...values, purchasedAt: values.purchasedAt ? values.purchasedAt.format("YYYY-MM-DD") : "", expiresAt: values.expiresAt ? values.expiresAt.toISOString() : "", subconverterConfig: buildSubconverterConfig(values) };
      delete payload.outputMode;
      if (item.id) await fetchJson(`/api/users/${item.id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await postJson("/api/users", payload);
      await onSaved();
    }, item.id ? "正在更新用户..." : "正在添加用户...");
  }

  const fallbackLogs = Array.isArray(item.fallbackLogs) ? item.fallbackLogs : [];
  const fbCols = [
    { title: "时间", dataIndex: "at", render: v => formatDateTime(v), width: 150 },
    { title: "原因", dataIndex: "reasonText", render: v => v || "-", width: 150 },
    { title: "原池 URL", dataIndex: "fromSubscriptionLabel", ellipsis: true },
    { title: "新池 URL", dataIndex: "toSubscriptionLabel", ellipsis: true }
  ];
  const fbTable = useResizableCols(fbCols, "user-fallback-logs");

  return (
    <Modal title={item.id ? "编辑用户" : "添加用户"} open onCancel={onClose} footer={null} destroyOnHidden width={720} styles={MODAL_STYLES}>
      <Form form={form} layout="vertical" initialValues={{ userId: item.userId || "", wechatName: item.wechatName || "", imessageId: item.imessageId || "", purchasedAt: initialPurchasedAt, actualPaid: item.actualPaid ?? "", duration: initialDuration, expiresAt: initialExpiresAt, subscriptionId: item.subscriptionId || subscriptions[0]?.id || "", outputMode: initialOutputMode, subconverterConfig: initialSubconverterConfig(item) }} onValuesChange={handleChange} onFinish={submit}>
        <Flex vertical gap={12}>
          <div style={FIELD_GROUP}>
            <div style={{ padding: "10px 16px 0" }}><Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>基本信息</Text></div>
            <Row gutter={0}>
              <Col xs={24} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
                <Form.Item name="userId" label="用户 ID" rules={[{ required: true, message: "请输入用户 ID" }]} style={FIELD_ITEM}><Input variant="borderless" placeholder="必填" /></Form.Item>
              </Col>
              <Col xs={24} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
                <Form.Item name="wechatName" label="微信名" style={FIELD_ITEM}><Input variant="borderless" placeholder="选填" /></Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="imessageId" label="iMessage ID" style={{ ...FIELD_ITEM, paddingBottom: 4 }}><Input variant="borderless" placeholder="选填" /></Form.Item>
              </Col>
            </Row>
          </div>
          <div style={FIELD_GROUP}>
            <div style={{ padding: "10px 16px 0" }}><Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>套餐信息</Text></div>
            <Row gutter={0}>
              <Col xs={24} sm={12} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
                <Form.Item name="purchasedAt" label="购买时间" rules={[{ required: true, message: "请选择购买时间" }]} style={FIELD_ITEM}>
                  <DatePicker {...inModalPickerProps} variant="borderless" style={{ width: "100%", paddingLeft: 0 }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
                <Form.Item name="expiresAt" label="到期时间" rules={[{ required: true, message: "请选择到期时间" }]} style={FIELD_ITEM}>
                  <DatePicker {...inModalPickerProps} variant="borderless" style={{ width: "100%", paddingLeft: 0 }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="actualPaid" label="实付款" rules={[{ required: true, message: "请输入" }]} style={{ ...FIELD_ITEM, paddingBottom: 4 }}>
                  <Input variant="borderless" type="number" min="0" step="0.01" placeholder="0.00" style={{ paddingLeft: 0 }} />
                </Form.Item>
              </Col>
            </Row>
            <div style={FIELD_SEP} />
            <Form.Item name="duration" label="购买时长" style={{ ...FIELD_ITEM, paddingBottom: 4 }}>
              <DurationRadio purchasedAt={purchasedAt} />
            </Form.Item>
          </div>
          <OutputModeSection form={form} initialOutputMode={initialOutputMode} subscriptions={subscriptions} recommended={recommended} recommendReason={recommendReason} showRecommendation={!item.id} />
          {fallbackLogs.length > 0 && (
            <div style={FIELD_GROUP}>
              <div style={{ padding: "10px 16px 8px" }}><Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>自动换池日志</Text></div>
              <div style={FIELD_SEP} />
              <div style={{ padding: "10px 16px 12px" }}>
                <Table size="small" rowKey="id" columns={fbTable.columns} components={fbTable.components} dataSource={fallbackLogs} pagination={false} scroll={{ x: Math.max(620, fbTable.scrollX) }} />
              </div>
            </div>
          )}
          <Button htmlType="submit" block size="large" loading={!!busy} disabled={!!busy} style={{ borderRadius: 999, fontWeight: 700, background: "var(--dw-primary)", borderColor: "var(--dw-primary)", color: "#fff" }}>
            {item.id ? "保存" : "添加用户"}
          </Button>
        </Flex>
      </Form>
    </Modal>
  );
}

// ─── Renew Form ───────────────────────────────────────────────────────────────

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
    if (recommended?.id && !subscriptionTouched.current) form.setFieldsValue({ subscriptionId: recommended.id });
  }, [form, recommended?.id]);

  async function submit(values) {
    await runAsync(async () => {
      const payload = { ...values, purchasedAt: values.purchasedAt.format("YYYY-MM-DD"), subconverterConfig: buildSubconverterConfig(values) };
      delete payload.outputMode;
      await postJson(`/api/users/${user.id}/renew`, payload);
      await onSaved();
    }, "正在续费用户...");
  }

  return (
    <Modal title={`${user.userId || "用户"} 续费`} open onCancel={onClose} footer={null} destroyOnHidden width={720} styles={MODAL_STYLES}>
      <Form form={form} layout="vertical" initialValues={{ purchasedAt: dayjs(), actualPaid: "", duration: user.duration || "monthly", subscriptionId: user.subscriptionId || subscriptions[0]?.id || "", outputMode: initialOutputMode, subconverterConfig: initialSubconverterConfig(user) }} onValuesChange={changed => { if (Object.prototype.hasOwnProperty.call(changed, "subscriptionId")) subscriptionTouched.current = true; }} onFinish={submit}>
        <Flex vertical gap={12}>
          <div style={FIELD_GROUP}>
            <div style={{ padding: "10px 16px 0" }}><Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>续费信息</Text></div>
            <Row gutter={0}>
              <Col xs={24} md={8} style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}>
                <Form.Item name="purchasedAt" label="续费时间" rules={[{ required: true, message: "请选择续费时间" }]} style={FIELD_ITEM}>
                  <DatePicker {...inModalPickerProps} variant="borderless" style={{ width: "100%", paddingLeft: 0 }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={16}>
                <Form.Item name="actualPaid" label="实付款" rules={[{ required: true, message: "请输入" }]} style={FIELD_ITEM}>
                  <Input variant="borderless" type="number" min="0" step="0.01" placeholder="0.00" style={{ paddingLeft: 0 }} />
                </Form.Item>
              </Col>
            </Row>
            <div style={FIELD_SEP} />
            <Form.Item name="duration" label="续费时长" style={{ ...FIELD_ITEM, paddingBottom: 4 }}>
              <DurationRadio purchasedAt={user.expiresAt && purchasedAt && new Date(user.expiresAt) > purchasedAt.toDate() ? user.expiresAt : purchasedAt} />
            </Form.Item>
          </div>
          <OutputModeSection form={form} initialOutputMode={initialOutputMode} subscriptions={subscriptions} recommended={recommended} recommendReason={recommendReason} showRecommendation />
          <Button type="primary" htmlType="submit" block size="large" style={{ borderRadius: 999, fontWeight: 700 }}>确认续费</Button>
        </Flex>
      </Form>
    </Modal>
  );
}

// ─── Users Page ───────────────────────────────────────────────────────────────

function UserCards({ users: list, actions }) {
  const p = usePalette();
  if (!list.length) return <Empty description="还没有匹配的用户。" />;
  return (
    <Flex vertical gap={12}>
      {list.map(user => (
        <Card key={user.id} hover style={{ padding: 16 }}>
          <Flex justify="space-between" gap={12} align="center" style={{ marginBottom: 10 }}>
            <Text strong style={{ fontSize: 15 }}>{user.userId}</Text>
            <StatusBadge status={userStatus(user)} />
          </Flex>
          <div style={{ padding: "10px 0 12px", borderTop: `1px solid ${p.border}`, borderBottom: `1px solid ${p.border}` }}>
            <UrlPill value={userClientSubscriptionUrl(user)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", padding: "12px 0" }}>
            {[["到期", formatDate(user.expiresAt)], ["时长", durationLabels[user.duration] || "未知"], ["总付款", formatMoney(user.actualPaid)], ["购买时间", formatDate(user.purchasedAt)]].map(([label, value]) => (
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

function UsersPage() {
  const { users, subscriptions, reload, runAsync, busy } = useData();
  const { notification } = AntApp.useApp();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(null);
  const [renewing, setRenewing] = useState(null);
  const mobile = useResponsiveList();

  const visible = users.filter(u => `${u.userId || ""} ${u.wechatName || ""} ${u.imessageId || ""} ${u.subscription?.url || ""}`.toLowerCase().includes(keyword.toLowerCase()));

  async function mutate(run) {
    await runAsync(async () => {
      try { await run(); await reload(["users", "bills"]); }
      catch (e) { notification.error({ message: "操作失败", description: e.message, placement: "bottomRight" }); }
    }, "正在处理用户操作...");
  }

  const actions = (user, compact = false) => {
    const Wrap = compact ? InlineActions : CardActions;
    const bp = compact ? { size: "small", style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy } : { style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy };
    return (
      <Wrap>
        <Button {...bp} icon={<RetweetOutlined />} onClick={() => setRenewing(user)}>续费</Button>
        <Button {...bp} icon={<EditOutlined />} onClick={() => setEditing(user)}>编辑</Button>
        <Button {...bp} danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "删除用户", content: "确定删除吗？", onOk: () => mutate(() => fetchJson(`/api/users/${user.id}`, { method: "DELETE" })) })}>删除</Button>
      </Wrap>
    );
  };

  const columns = [
    { title: "#", render: (_, __, i) => i + 1, width: 48 },
    { title: "用户 ID", dataIndex: "userId", width: 120 },
    { title: "状态", render: (_, u) => <StatusBadge status={userStatus(u)} />, width: 76 },
    { title: "到期", render: (_, u) => formatDate(u.expiresAt), width: 104 },
    { title: "时长", render: (_, u) => durationLabels[u.duration] || "未知", width: 72 },
    { title: "总付款", render: (_, u) => formatMoney(u.actualPaid), width: 88 },
    { title: "客户订阅 URL", render: (_, u) => <UrlText value={userClientSubscriptionUrl(u)} />, width: 560 },
    { title: "绑定邮箱", render: (_, u) => u.subscription?.email || "", width: 220 },
    { title: "购买时间", render: (_, u) => formatDate(u.purchasedAt), width: 104 },
    { title: "操作", render: (_, u) => actions(u, true), width: 190 }
  ].map(col => ({ ...col, onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }), onCell: () => ({ style: { whiteSpace: "nowrap" } }) }));
  const userTable = useResizableCols(columns, "users-v2");

  return (
    <section className="flat-list-section">
      <div className="flat-list-header">
        <PageTitle>用户管理</PageTitle>
        <ActionBar>
          <Input.Search allowClear placeholder="搜索用户、邮箱或 URL" style={{ minWidth: 240 }} onSearch={setKeyword} onChange={e => setKeyword(e.target.value)} />
          <Button icon={<PlusOutlined />} onClick={() => setEditing({})}>添加用户</Button>
        </ActionBar>
      </div>
      {mobile
        ? <UserCards users={visible} actions={actions} />
        : <Table className="plain-detail-table user-flat-table" size="middle" rowKey="id" columns={userTable.columns} components={userTable.components} dataSource={visible} pagination={tablePag} scroll={{ x: Math.max(1380, userTable.scrollX) }} />
      }
      {editing && <UserForm item={editing} subscriptions={subscriptions} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(["users", "bills"]); }} />}
      {renewing && <RenewForm user={renewing} subscriptions={subscriptions} onClose={() => setRenewing(null)} onSaved={async () => { setRenewing(null); await reload(["users", "bills"]); }} />}
    </section>
  );
}

// ─── Bills Page ───────────────────────────────────────────────────────────────

function BillCards({ bills, actions, total }) {
  const p = usePalette();
  return (
    <Flex vertical gap={12}>
      <Card style={{ padding: 16 }}>
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>筛选合计</Text>
        <Text strong style={{ fontSize: 20 }}>{formatMoney(total)}</Text>
      </Card>
      {!bills.length && <Empty description="还没有匹配的账单。" />}
      {bills.map(bill => (
        <Card key={bill.id} hover style={{ padding: 16 }}>
          <Flex justify="space-between" gap={12} align="start" style={{ marginBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <Text strong style={{ display: "block", fontSize: 15 }}>{bill.userLabel}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(bill.occurredAt)}</Text>
            </div>
            <Text type={Number(bill.amount) < 0 ? "danger" : "success"} strong style={{ fontSize: 16, flex: "0 0 auto" }}>{formatMoney(bill.amount)}</Text>
          </Flex>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", padding: "10px 0 12px", borderTop: `1px solid ${p.border}`, borderBottom: `1px solid ${p.border}` }}>
            {[["类型", billTypeLabels[bill.type] || bill.type], ["状态", bill.reversedAt ? "已撤销" : "有效"], ["时长", durationLabels[bill.duration] || bill.duration || "-"], ["到期变化", bill.type === "renewal" ? `${formatDate(bill.beforeExpiresAt)} → ${formatDate(bill.afterExpiresAt)}` : formatDate(bill.afterExpiresAt)]].map(([label, value]) => (
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

function BillsPage() {
  const { bills, reload, runAsync, busy } = useData();
  const { notification } = AntApp.useApp();
  const [keyword, setKeyword] = useState("");
  const [month, setMonth] = useState(null);
  const mobile = useResponsiveList();

  const visible = bills.filter(bill => {
    const hay = `${bill.userLabel || ""} ${bill.description || ""} ${billTypeLabels[bill.type] || ""}`.toLowerCase();
    const bm = bill.occurredAt ? bill.occurredAt.slice(0, 7) : "";
    return hay.includes(keyword.toLowerCase()) && (!month || bm === month.format("YYYY-MM"));
  });
  const total = visible.filter(b => !b.reversedAt).reduce((s, b) => s + (Number(b.amount) || 0), 0);

  async function mutate(run) {
    await runAsync(async () => {
      try { await run(); await reload(["bills", "users"]); }
      catch (e) { notification.error({ message: "操作失败", description: e.message, placement: "bottomRight" }); }
    }, "正在处理账单操作...");
  }

  const actions = (bill, compact = false) => {
    const Wrap = compact ? InlineActions : CardActions;
    const bp = compact ? { size: "small", style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy } : { style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy };
    return (
      <Wrap>
        {!bill.reversedAt && <Button {...bp} onClick={() => mutate(() => postJson(`/api/bills/${bill.id}/reverse`))}>撤销</Button>}
        <Button {...bp} danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "删除账单", content: "确定删除这笔账单吗？", onOk: () => mutate(() => fetchJson(`/api/bills/${bill.id}`, { method: "DELETE" })) })}>删除</Button>
      </Wrap>
    );
  };

  const columns = [
    { title: "#", render: (_, __, i) => i + 1, width: 64 },
    { title: "账单时间", render: (_, b) => formatDateTime(b.occurredAt) },
    { title: "用户", dataIndex: "userLabel" },
    { title: "类型", render: (_, b) => billTypeLabels[b.type] || b.type },
    { title: "金额", render: (_, b) => <Text type={Number(b.amount) < 0 ? "danger" : "success"} strong>{formatMoney(b.amount)}</Text> },
    { title: "时长", render: (_, b) => durationLabels[b.duration] || b.duration || "-" },
    { title: "到期变化", render: (_, b) => b.type === "renewal" ? `${formatDate(b.beforeExpiresAt)} 延至 ${formatDate(b.afterExpiresAt)}` : formatDate(b.afterExpiresAt) },
    { title: "状态", render: (_, b) => b.reversedAt ? <Tag>已撤销</Tag> : <Tag color="success">有效</Tag> },
    { title: "操作", render: (_, b) => actions(b, true), width: 170 }
  ].map(col => ({ ...col, onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }), onCell: () => ({ style: { whiteSpace: "nowrap" } }) }));
  const billTable = useResizableCols(columns, "bills");

  return (
    <section className="flat-list-section">
      <div className="flat-list-header">
        <PageTitle>账单管理</PageTitle>
        <ActionBar>
          <DatePicker picker="month" value={month} onChange={setMonth} placeholder="筛选月份" style={{ minWidth: 150 }} />
          <Input.Search allowClear placeholder="搜索用户、类型或备注" style={{ minWidth: 240 }} onSearch={setKeyword} onChange={e => setKeyword(e.target.value)} />
        </ActionBar>
      </div>
      {mobile
        ? <BillCards bills={visible} actions={actions} total={total} />
        : <Table className="plain-detail-table user-flat-table" size="middle" rowKey="id" columns={billTable.columns} components={billTable.components} dataSource={visible} pagination={tablePag} scroll={{ x: Math.max(1100, billTable.scrollX) }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>筛选合计</Table.Summary.Cell>
                  <Table.Summary.Cell index={4}><Text strong>{formatMoney(total)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} colSpan={4}>{visible.length} 笔账单</Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
      }
    </section>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem("themeMode");
    return stored ? stored === "dark" : false;
  });
  const palette = darkMode ? PALETTE.dark : PALETTE.light;
  const toggleTheme = useCallback(() => {
    setDarkMode(cur => {
      const next = !cur;
      localStorage.setItem("themeMode", next ? "dark" : "light");
      return next;
    });
  }, []);
  const ctxValue = useMemo(() => ({ darkMode, toggleTheme, palette }), [darkMode, toggleTheme, palette]);

  return (
    <ConfigProvider theme={makeAntTheme(palette, darkMode)}>
      <ThemeModeContext.Provider value={ctxValue}>
        <AntApp>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
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
