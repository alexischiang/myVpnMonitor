import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  App as AntApp,
  Avatar,
  Card as AntCard,
  Button,
  Breadcrumb,
  Checkbox,
  Col,
  ConfigProvider,
  DatePicker,
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
  Radio,
  Row,
  Select,
  Skeleton,
  Spin,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme
} from "antd";
import {
  ApiOutlined,
  BellOutlined,
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
  SearchOutlined,
  SunOutlined,
  TeamOutlined,
  UserOutlined,
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

const { Header, Content, Sider } = AntLayout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const DataContext = createContext(null);
const ThemeModeContext = createContext({ darkMode: false, toggleTheme: () => {}, palette: {} });

// 鈹€鈹€鈹€ Design tokens 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const PALETTE = {
  light: {
    primary:         "#2E6BE6",
    primaryDark:     "#2157C3",
    page:            "#F4F4F5",
    surface:         "#FFFFFF",
    surfaceElevated: "#FAFAFA",
    surfaceHover:    "#F0F1F3",
    border:          "rgba(17, 24, 39, 0.10)",
    text:            "#09090B",
    textSub:         "#3F3F46",
    textMuted:       "#71717A",
    fill:            "rgba(24, 24, 27, 0.04)",
    fillMid:         "rgba(24, 24, 27, 0.08)",
    fillLight:       "rgba(244, 244, 245, 0.96)",
    shadow:          "0 1px 2px rgba(17, 24, 39, 0.04), 0 8px 20px rgba(17, 24, 39, 0.04)",
    shadowSm:        "0 1px 2px rgba(17, 24, 39, 0.06)"
  },
  dark: {
    primary:         "#3F7CEC",
    primaryDark:     "#2C63C8",
    page:            "#060809",
    surface:         "#0d1117",
    surfaceElevated: "#161b22",
    surfaceHover:    "#1c2128",
    border:          "rgba(255, 255, 255, 0.09)",
    text:            "#F5F5F5",
    textSub:         "#C9CBD1",
    textMuted:       "#8A8F98",
    fill:            "rgba(255, 255, 255, 0.04)",
    fillMid:         "rgba(255, 255, 255, 0.07)",
    fillLight:       "rgba(255, 255, 255, 0.03)",
    shadow:          "0 1px 2px rgba(0, 0, 0, 0.34), 0 12px 24px rgba(0, 0, 0, 0.20)",
    shadowSm:        "0 1px 2px rgba(0, 0, 0, 0.30)"
  }
};

// 鈹€鈹€鈹€ Form constants 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const NAV_DISPLAY = {
  "/urls":  { label: "订阅池", icon: ApiOutlined },
  "/users": { label: "用户", icon: TeamOutlined },
  "/bills": { label: "账单", icon: DollarOutlined }
};

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
  { value: "mixed",       label: "混合节点列表" }
];
const DEFAULT_SC_TARGET = "clash";

// 鈹€鈹€鈹€ Helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function serviceProviderLabel(item, fallback = DEFAULT_PROVIDER) {
  return item?.serviceProvider || item?.provider || fallback;
}

function subscriptionLabel(s) {
  const tail   = s.url ? s.url.slice(-4) : "????";
  const expire = s.metrics?.expireAt ? formatDate(s.metrics.expireAt) : "Unknown expiry";
  return `${serviceProviderLabel(s)} - ${tail} - ${expire} - ${s.email || "No email"}`;
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
    return user.relayPath ? absoluteUrl(user.relayPath) : "自定义链接不可用";
  }
  return user.subscription?.url || "关联链接不可用";
}

function statusColor(status) {
  return { ok: "green", warning: "gold", error: "red", expired: "default", depleted: "red", unknown: "blue" }[status] || "default";
}

const tablePag = { pageSize: 20, showSizeChanger: false };

// 鈹€鈹€鈹€ Context hooks 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function useData()      { return useContext(DataContext); }
function useTheme()     { return useContext(ThemeModeContext); }
function usePalette()   { return useContext(ThemeModeContext).palette; }

// 鈹€鈹€鈹€ Error Boundary 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <AntCard bordered={false} style={{ padding: 32, background: "#fff1f0", border: "1px solid #ffa39e", borderRadius: 12, margin: 16 }}>
          <Text strong style={{ display: "block", color: "#cf1322", marginBottom: 8 }}>页面渲染错误</Text>
          <pre style={{ fontSize: 12, color: "#595959", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {this.state.error?.message}
            {"\n"}
            {this.state.error?.stack}
          </pre>
          <Button danger ghost onClick={() => this.setState({ error: null })} style={{ marginTop: 12, borderRadius: 6 }}>
            重试
          </Button>
        </AntCard>
      );
    }
    return this.props.children;
  }
}

// 鈹€鈹€鈹€ Primitive UI components 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function Card({ children, style, pad = 20, hover = false, onClick }) {
  const p = usePalette();
  return (
    <AntCard
      className="app-card"
      hoverable={hover}
      bordered={false}
      bodyStyle={{ padding: pad }}
      style={{
        background: p.surface,
        borderRadius: 8,
        border: `1px solid ${p.border}`,
        boxShadow: p.shadow,
        cursor: onClick ? "pointer" : undefined,
        ...style
      }}
      onClick={onClick}
    >
      {children}
    </AntCard>
  );
}

const STATUS_BADGE_CLASS = {
  ok:      "dw-badge dw-badge-ok",
  warning: "dw-badge dw-badge-warning",
  error:   "dw-badge dw-badge-error",
  expired: "dw-badge dw-badge-expired",
  depleted:"dw-badge dw-badge-depleted",
  unknown: "dw-badge dw-badge-unknown"
};

function StatusBadge({ status }) {
  const cls = STATUS_BADGE_CLASS[status] || "dw-badge dw-badge-expired";
  return <Tag bordered={false} className={cls}>{statusLabels[status] || "Unknown"}</Tag>;
}

function CopyButton({ value, size = "small" }) {
  const { message } = AntApp.useApp();
  const [done, setDone] = useState(false);
  function copy() {
    copyText(value || "").then(() => {
      message.success("Copied");
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
    <Space size={4} style={{ maxWidth: "100%", minWidth: 0 }}>
      <Tag bordered={false} style={{
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
        {value || "-"}
      </Tag>
      {value && <CopyButton value={value} />}
    </Space>
  );
}

function PageSection({ title, actions, children }) {
  const p = usePalette();
  const screens = Grid.useBreakpoint();
  const mobile = !screens.md;
  return (
    <AntCard
      bordered={false}
      className="page-section-card"
      bodyStyle={{ padding: 0 }}
      style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: 8, overflow: "hidden", boxShadow: p.shadowSm }}
    >
      <Flex style={{ padding: "16px 20px", borderBottom: `1px solid ${p.border}` }} align={mobile ? "flex-start" : "center"} justify="space-between" vertical={mobile} gap={10}>
        <Text strong style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>{title}</Text>
        {actions && <div style={{ width: mobile ? "100%" : "auto" }}>{actions}</div>}
      </Flex>
      <div style={{ padding: 20 }}>{children}</div>
    </AntCard>
  );
}

function ManagementSection({ kicker, title, actions, summary, children }) {
  const screens = Grid.useBreakpoint();
  const mobile = !screens.md;
  return (
    <AntCard bordered={false} className="saas-section-card" bodyStyle={{ padding: 0 }}>
      <div className="saas-section-head">
        <div className={summary ? "saas-section-summary" : undefined}>
          <div>
            <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>{kicker}</Text>
            <Text strong className="saas-section-title">{title}</Text>
          </div>
          {summary}
        </div>
        {actions ? <div className="saas-toolbar-actions">{actions}</div> : null}
      </div>
      <div className={`saas-section-body${mobile ? " mobile" : ""}`}>
        {children}
      </div>
    </AntCard>
  );
}

function ToolbarSearch(props) {
  return <Input.Search allowClear className="saas-toolbar-search" {...props} />;
}

function InlineActions({ children }) {
  return <Flex wrap={false} gap={6} align="center">{children}</Flex>;
}

function CardActions({ children }) {
  return (
    <Flex wrap gap={8} align="center">
      {React.Children.map(children, child => child && React.isValidElement(child)
        ? React.cloneElement(child, { size: "small", style: { ...child.props.style, height: 32, paddingInline: 12, borderRadius: 6, fontSize: 13 } })
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
            {expiry && <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 2 }}>Expires {formatDate(expiry)}</Text>}
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
  function handleCopy() { copyText(code || "").then(() => { message.success("Copied"); setCopied(true); setTimeout(() => setCopied(false), 1800); }); }
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
        <Text strong style={{ fontSize: 15 }}>{busy?.label || "澶勭悊涓?.."}</Text>
        <div style={{ width: "100%", height: 4, borderRadius: 999, background: "var(--ant-color-fill-secondary)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, width: `${pct}%`, background: "var(--ant-color-primary)", transition: "width 0.6s ease" }} />
        </div>
      </Flex>
    </Modal>
  );
}

// 鈹€鈹€鈹€ Resizable table columns 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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

// 鈹€鈹€鈹€ Theme config 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function makeAntTheme(palette, dark) {
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      // color
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
      // typography — Inter-style scale: 12/14/16/20/24/32
      fontFamily: "'Inter', 'IBM Plex Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif",
      fontSize:           14,
      fontSizeSM:         12,
      fontSizeLG:         16,
      fontSizeHeading1:   32,
      fontSizeHeading2:   24,
      fontSizeHeading3:   20,
      fontSizeHeading4:   16,
      fontSizeHeading5:   14,
      fontWeightStrong:    600,
      lineHeight:          1.5,
      // spacing — 4px base grid
      sizeUnit:    4,
      sizeStep:    4,
      sizeXXS:     4,
      sizeXS:      8,
      sizeSM:     12,
      size:       16,
      sizeMD:     16,
      sizeLG:     24,
      sizeXL:     32,
      // radius — 6px controls, 8px cards, 12px overlays
      borderRadiusXS:  4,
      borderRadiusSM:  6,
      borderRadius:    8,
      borderRadiusLG: 12,
      // motion
      motionDurationMid: "0.16s"
    },
    components: {
      Layout: {
        bodyBg: palette.page,
        headerBg: palette.page,
        siderBg: palette.surface,
        triggerBg: palette.surface,
        triggerColor: palette.textSub
      },
      Card: {
        borderRadiusLG: 8,
        colorBgContainer: palette.surface,
        colorBorderSecondary: palette.border,
        boxShadowTertiary: "none"
      },
      Menu: {
        itemBorderRadius: 8,
        itemHeight: 42,
        fontSize: 14,
        itemBg: "transparent",
        itemColor: palette.textSub,
        itemHoverBg: palette.fill,
        itemHoverColor: palette.text,
        itemSelectedBg: dark ? "rgba(63,124,236,0.12)" : palette.fillMid,
        itemSelectedColor: palette.text,
        horizontalItemSelectedBg: "transparent",
        horizontalItemSelectedColor: palette.text,
        horizontalItemHoverBg: "transparent",
        horizontalItemHoverColor: palette.text,
        popupBg: palette.surfaceElevated,
        activeBarHeight: 0, activeBarWidth: 0
      },
      Table: {
        headerBg: palette.surfaceElevated,
        headerColor: palette.textSub,
        rowHoverBg: palette.surfaceHover,
        borderColor: palette.border,
        colorBgContainer: palette.surface,
        cellPaddingBlock: 12,
        cellPaddingInline: 14,
        fontSize: 13,
        borderRadius: 0
      },
      Button: {
        fontWeight: 600,
        controlHeight: 36,
        controlHeightLG: 42,
        borderRadius: 6,
        borderRadiusLG: 6,
        colorPrimary: palette.primary,
        colorPrimaryHover: palette.primaryDark,
        colorPrimaryActive: palette.primaryDark,
        primaryColor: "#fff",
        defaultBg: palette.surfaceElevated,
        defaultColor: palette.text,
        defaultBorderColor: palette.border,
        defaultHoverBg: palette.fill,
        defaultHoverColor: palette.text,
        defaultHoverBorderColor: palette.border,
        defaultActiveBg: palette.fillMid,
        defaultActiveBorderColor: palette.border,
        defaultActiveColor: palette.text,
        textHoverBg: palette.fill,
        textActiveBg: palette.fillMid,
        colorLink: palette.primary,
        colorLinkHover: palette.primaryDark
      },
      Input: {
        controlHeight: 36,
        borderRadius: 6,
        colorBgContainer: palette.surfaceElevated,
        colorText: palette.text,
        colorIcon: palette.textMuted,
        hoverBorderColor: palette.border,
        activeBorderColor: palette.primary,
        activeShadow: "0 0 0 0 transparent",
        colorTextPlaceholder: palette.textMuted
      },
      Select: {
        controlHeight: 36,
        borderRadius: 6,
        optionSelectedBg: palette.surfaceHover,
        optionActiveBg: palette.surfaceHover,
        colorBgContainer: palette.surfaceElevated,
        colorText: palette.text,
        hoverBorderColor: palette.border,
        activeBorderColor: palette.primary,
        activeOutlineColor: "transparent"
      },
      DatePicker: {
        controlHeight: 36,
        borderRadius: 6,
        colorBgContainer: palette.surfaceElevated,
        colorText: palette.text,
        hoverBorderColor: palette.border,
        activeBorderColor: palette.primary,
        activeShadow: "0 0 0 0 transparent"
      },
      Dropdown: {
        colorBgElevated: palette.surfaceElevated
      },
      Breadcrumb: {
        itemColor: palette.textMuted,
        lastItemColor: palette.text,
        separatorColor: palette.textMuted,
        linkColor: palette.textMuted
      },
      Modal: { borderRadiusLG: 12, headerBg: palette.surface, contentBg: palette.surface, colorBgElevated: palette.surface },
      Tag: { borderRadiusSM: 6, defaultBg: palette.fill, defaultColor: palette.textSub },
      Statistic:  { titleFontSize: 12, contentFontSize: 22 },
      Drawer:     { colorBgElevated: palette.surface, colorBgMask: "rgba(0, 0, 0, 0.48)" },
      Notification: { colorBgElevated: palette.surfaceElevated }
    }
  };
}

// 鈹€鈹€鈹€ Auth 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function RequireAuth({ children }) {
  const [ready, setReady] = useState(false);
  const [ok, setOk]       = useState(false);
  useEffect(() => { fetchJson("/api/auth/me").then(() => setOk(true)).catch(() => setOk(false)).finally(() => setReady(true)); }, []);
  if (!ready) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><Spin size="large" /></div>;
  if (!ok)    return <Navigate to="/login" replace />;
  return children;
}

function DwellixLogo({ size = 34 }) {
  const p = usePalette();
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.29), background: p.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 20 18" fill="none">
        <path d="M10 1L1 8.5V17h6v-5h6v5h6V8.5L10 1Z" fill="#fff" />
      </svg>
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");

  async function submit(values) {
    setLoading(true); setErr("");
    try {
      const res     = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ ...values, remember: false }) });
      const payload = await res.json();
      if (!res.ok) return setErr(payload.error || "Sign-in failed");
      navigate("/urls", { replace: true });
    } catch { setErr("Unable to reach the login service"); }
    finally  { setLoading(false); }
  }

  return (
    <Flex className="saas-login-shell" align="center" justify="center">
      <Flex vertical className="saas-login-wrap">
        <Flex vertical className="saas-login-brand">
          <Space direction="vertical" size={12} align="center" className="saas-login-brand-stack">
            <Tag bordered={false} className="saas-login-kicker">管理控制台</Tag>
            <DwellixLogo size={52} />
            <Title level={3} style={{ margin: 0, fontWeight: 800, letterSpacing: -0.5 }}>XELA Monitor</Title>
          </Space>
          <Text type="secondary" style={{ fontSize: 14 }}>订阅运营控制台</Text>
        </Flex>
        <AntCard bordered={false} className="saas-login-card saas-form-shell">
          <Form layout="vertical" onFinish={submit} requiredMark={false}>
            <Form.Item name="account" label="账号" rules={[{ required: true, message: "请输入账号" }]} style={{ marginBottom: 16 }}>
              <Input autoFocus autoComplete="username" placeholder="账号" size="large" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]} style={{ marginBottom: 20 }}>
              <Input.Password autoComplete="current-password" placeholder="密码" size="large"  />
            </Form.Item>
            {err && <Text type="danger" className="saas-login-error">{err}</Text>}
            <Button type="primary" htmlType="submit" block loading={loading} size="large">登录</Button>
          </Form>
        </AntCard>
      </Flex>
    </Flex>
  );
}

function MiniProgressBar({ pct }) {
  const p = usePalette();
  const color = pct < 20 ? "#ef4444" : pct < 50 ? "#f59e0b" : p.primary;
  return (
    <div style={{ height: 6, borderRadius: 999, background: p.fillMid, overflow: "hidden", marginTop: 6 }}>
      <div style={{ height: "100%", borderRadius: 999, width: `${pct}%`, background: color, transition: "width 0.4s" }} />
    </div>
  );
}

function DonutChart({ pct = 0, size = 120, strokeWidth = 14, label, sublabel, color }) {
  const p = usePalette();
  const c = color || p.primary;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const yellowDash = Math.min((pct / 100) * 0.35 * circ, 0.35 * circ);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={p.fillMid} strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E8E84A" strokeWidth={strokeWidth}
          strokeDasharray={`${yellowDash} ${circ}`} strokeDashoffset={-dash} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
        {label && <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1, color: p.text }}>{label}</span>}
        {sublabel && <span style={{ fontSize: 10, color: p.textMuted, fontWeight: 500, textAlign: "center", lineHeight: 1.2 }}>{sublabel}</span>}
      </div>
    </div>
  );
}

function CircleStatTile({ pct = 0, label, sublabel, size = 80, strokeWidth = 8 }) {
  const p = usePalette();
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ background: p.surface, borderRadius: 16, boxShadow: p.shadow, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={p.fillMid} strokeWidth={strokeWidth} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={p.primary} strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: p.primary }}>{pct}%</span>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: p.text, lineHeight: 1.2 }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: p.textMuted, marginTop: 3 }}>{sublabel}</div>}
      </div>
    </div>
  );
}

function ReminderItem({ icon, title, subtitle, urgent }) {
  const p = usePalette();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: `1px solid ${p.border}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: p.textMuted }}>{subtitle}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {urgent && <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.primary }} />}
        <span style={{ color: p.textMuted, fontSize: 16 }}>›</span>
      </div>
    </div>
  );
}

// 鈹€鈹€鈹€ App layout 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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
  const isDetail = /^\/urls\/detail\/[^/]+/.test(location.pathname);
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
      <Header className="console-workspace-header" style={{ background: "transparent", padding: 0, lineHeight: 1 }}>
        <div className="console-workspace-inner console-workspace-inner-top">
          <HeaderBar
            selectedKey={selKey}
            isMobile={isMobile}
            onDrawer={() => setDrawer(true)}
            darkMode={darkMode}
            toggleTheme={toggleTheme}
            logout={logout}
            version={meta?.version}
          />
        </div>
      </Header>

      <AntLayout className="console-main-layout" style={{ background: "transparent", minWidth: 0 }}>
        {!isMobile && (
          <Sider width={200} className="console-layout-sider">
            <SidebarNav selectedKey={selKey} onSelect={handleNav} version={meta?.version} />
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
                    <Routes>
                      <Route path="/urls" element={<UrlPoolPage />} />
                      <Route path="/urls/detail/:id" element={<PoolDetailPage />} />
                      <Route path="/users" element={<UsersPage />} />
                      <Route path="/bills" element={<BillsPage />} />
                      <Route path="*" element={<Navigate to="/urls" replace />} />
                    </Routes>
                  </ErrorBoundary>
                )}

                <Text className="console-workspace-footer">
                  {loading ? "同步中..." : `最后更新：${formatDateTime(meta?.updatedAt)}`}
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
        <SidebarNav selectedKey={selKey} onSelect={handleNav} version={meta?.version} showBrand />
      </Drawer>

      <BusyOverlay busy={busy} />
    </AntLayout>
  );
}

// 鈹€鈹€鈹€ DataProvider 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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

  const runAsync = useCallback(async (task, label = "澶勭悊涓?..") => {
    setBusy({ label });
    try { return await task(); } finally { setBusy(null); }
  }, []);

  const value = useMemo(() => ({ ...state, reload, runAsync, busy }), [state, reload, runAsync, busy]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// 鈹€鈹€鈹€ Helpers (sub-pages) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function useResponsiveList() {
  const screens = Grid.useBreakpoint();
  return !screens.md;
}

// 鈹€鈹€鈹€ URL Pool 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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
    { title: "User ID", dataIndex: "userId" },
    { title: "WeChat", dataIndex: "wechatName", render: v => v || "-" },
    { title: "Expires", render: (_, u) => formatDate(u.expiresAt) },
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

  const cacheText = cache?.error ? `Error: ${cache.error}` : (cache?.body || "(no YAML fetched)");
  const cacheMeta = cache?.fetchedAt ? `${formatDateTime(cache.fetchedAt)} - ${formatBytes(cache.bodyLength || 0)}${cache.truncated ? " (truncated)" : ""}` : "";

  return (
    <div className="detail-page" style={{ color: p.text }}>
      {/* 鈹€鈹€ Page header: title + back 鈹€鈹€ */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <Button size="small" onClick={() => navigate("/urls")} style={{ marginBottom: 10, borderRadius: 6 }}>返回订阅池</Button>
          <Title level={2} style={{ margin: 0, fontSize: isMobile ? 26 : 34, fontWeight: 900, letterSpacing: -1, lineHeight: 1.1 }}>
            订阅池<br />详情
          </Title>
        </div>
        {/* Circle stat tiles */}
        {!isMobile && (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <CircleStatTile pct={trafficPct} label="剩余" sublabel={m.totalBytes ? formatBytes(m.remainingBytes) : "-"} size={76} strokeWidth={7} />
            <CircleStatTile pct={usedPct} label="已用" sublabel={m.usedBytes ? formatBytes(m.usedBytes) : "-"} size={76} strokeWidth={7} />
            <CircleStatTile pct={Math.min(100, boundUsers.length * 10)} label="Users" sublabel={`${boundUsers.length} 已绑定`} size={76} strokeWidth={7} />
          </div>
        )}
      </div>

      {/* 鈹€鈹€ Three-column main grid 鈹€鈹€ */}
      <div style={{ display: "grid", gridTemplateColumns: singleCol ? "1fr" : "minmax(0,1fr) minmax(240px,300px) minmax(240px,280px)", gap: 20, alignItems: "start" }}>

        {/* Column 1: Info card + bound users + YAML */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Info card 鈥?Customer Details style */}
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
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "HTTP 状态", value: item.httpStatus || "-" },
                { label: "最近检查", value: item.lastCheckedAt ? formatDate(item.lastCheckedAt) : "-" },
                { label: "到期时间", value: m.expireAt ? formatDate(m.expireAt) : "-" },
                { label: "绑定用户", value: `${boundUsers.length} users` }
              ].map(r => (
                <div key={r.label}>
                  <Text type="secondary" style={{ fontSize: 11, display: "block" }}>{r.label}</Text>
                  <Text strong style={{ fontSize: 13 }}>{r.value}</Text>
                </div>
              ))}
            </div>
            {/* Status + note */}
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

          {/* Bound users */}
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
                      <Text style={{ display: "block", fontSize: 13 }}>{formatDate(u.expiresAt)}</Text>
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
        </div>

        {/* Column 2: Green traffic card (Transaction style) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Green traffic card */}
          <div style={{ background: p.primary, borderRadius: 16, padding: "20px", color: "#fff", boxShadow: "0 4px 20px rgba(13,151,98,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, marginBottom: 4 }}>
                  {m.totalBytes ? formatBytes(m.remainingBytes) : "-"}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>剩余流量</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>
                {trafficPct}%
              </div>
            </div>
            <div style={{ marginTop: 18, fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
              总计 {m.totalBytes ? formatBytes(m.totalBytes) : "-"}
            </div>
            {/* Progress bar on green */}
            <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${trafficPct}%`, borderRadius: 999, background: "#fff", opacity: 0.9 }} />
            </div>
          </div>

          {/* Traffic breakdown rows */}
          {[
            { label: "已用流量", bytes: m.usedBytes, icon: "↑" },
            { label: "总流量", bytes: m.totalBytes, icon: "○" }
          ].map(row => (
            <Card key={row.label} pad="14px 16px">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: p.fill, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: p.primary, fontWeight: 700 }}>{row.icon}</span>
                  </div>
                  <div>
                    <Text strong style={{ fontSize: 14, display: "block" }}>
                      {row.bytes != null ? formatBytes(row.bytes) : "-"}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{row.label}</Text>
                  </div>
                </div>
                <span style={{ fontSize: 16, color: p.primary, fontWeight: 700 }}>✓</span>
              </div>
            </Card>
          ))}

          {/* Expire info card */}
          <Card pad="14px 16px">
            <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>到期时间</Text>
            <Text strong style={{ fontSize: 16, display: "block" }}>
              {m.expireAt ? formatDate(m.expireAt) : "-"}
            </Text>
            <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: "block" }}>
              ID：{item.id}
            </Text>
          </Card>
        </div>

        {/* Column 3: YAML viewer */}
        {!singleCol && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ fontSize: 16, fontWeight: 700 }}>实时配置</Text>
              {cacheMeta && <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 2 }}>{cacheMeta}</Text>}
            </div>
            <CodeViewer code={cacheText} meta="" language="YAML" />
          </div>
        )}
      </div>

      {/* YAML for single-col */}
      {singleCol && (
        <div style={{ marginTop: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 16, fontWeight: 700 }}>实时配置</Text>
            {cacheMeta && <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 2 }}>{cacheMeta}</Text>}
          </div>
          <CodeViewer code={cacheText} meta="" language="YAML" />
        </div>
      )}
    </div>
  );
}

// 鈹€鈹€鈹€ Subscription Form 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function SubscriptionForm({ item, onClose, onSaved }) {
  const { runAsync } = useData();
  const [form] = Form.useForm();
  async function submit(values) {
    await runAsync(async () => {
      if (item.id) await fetchJson(`/api/subscriptions/${item.id}`, { method: "PUT", body: JSON.stringify(values) });
      else await postJson("/api/subscriptions", values);
      await onSaved();
    }, item.id ? "Updating URL pool..." : "Creating URL pool...");
  }
  return (
    <Modal title={item.id ? "编辑订阅" : "新增订阅"} open onCancel={onClose} footer={null} destroyOnHidden styles={MODAL_STYLES}>
      <Form form={form} layout="vertical" initialValues={{ url: item.url || "", email: item.email || "", note: item.note || "" }} onFinish={submit}>
        <Divider orientation="left" orientationMargin={0} style={{ marginTop: 0 }}><Text type="secondary" style={{ fontSize: 12 }}>基本信息</Text></Divider>
        <Flex gap={16} wrap="wrap">
          <Form.Item name="url" label="订阅链接" rules={[{ required: true, type: "url", message: "请输入有效的链接" }]} style={{ marginBottom: 0, flex: "1 1 200px" }}>
            <Input placeholder="https://" />
          </Form.Item>
          <Form.Item name="email" label="绑定邮箱" rules={[{ required: true, type: "email", message: "请输入邮箱地址" }]} style={{ marginBottom: 0, flex: "1 1 200px" }}>
            <Input placeholder="user@example.com" />
          </Form.Item>
        </Flex>
        <Divider orientation="left" orientationMargin={0}><Text type="secondary" style={{ fontSize: 12 }}>备注</Text></Divider>
        <Form.Item name="note" label="备注" style={{ marginBottom: 0 }}>
          <TextArea rows={4} placeholder="选填" />
        </Form.Item>
        <Flex justify="flex-end" gap={10} style={{ marginTop: 24 }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" htmlType="submit">保存</Button>
        </Flex>
      </Form>
    </Modal>
  );
}

function SidebarNav({ selectedKey, onSelect, version, showBrand = false }) {
  const menuItems = Object.entries(NAV_DISPLAY).map(([key, meta]) => {
    const Icon = meta.icon;
    return {
      key,
      icon: <Icon style={{ fontSize: 15 }} />,
      label: meta.label
    };
  });

  return (
    <Flex vertical className="console-sidebar">
      {showBrand && (
        <Flex className="console-sidebar-brand" align="center">
          <Flex className="console-sidebar-brandmark" align="center" justify="center">
            <DwellixLogo size={32} />
          </Flex>
          <Flex vertical className="console-sidebar-brandcopy">
            <Text className="console-sidebar-kicker">管理控制台</Text>
            <Text strong className="console-sidebar-title">XELA Monitor</Text>
          </Flex>
        </Flex>
      )}
      <Text className="console-sidebar-group-label">导航</Text>
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        className="console-sidebar-menu"
        onClick={onSelect}
      />
    </Flex>
  );
}

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
        {isMobile && (
          <Button className="console-header-icon" type="default" icon={<MenuOutlined />} onClick={onDrawer} />
        )}
        <Flex className="console-header-brand" align="center">
          <Flex className="console-header-brandmark" align="center" justify="center">
            <DwellixLogo size={32} />
          </Flex>
          <Text strong className="console-header-brandtitle">XELA Monitor</Text>
        </Flex>
        <Breadcrumb
          className="console-header-breadcrumb"
          separator={<Text className="console-header-slash">/</Text>}
          items={[
            { title: <Text className="console-header-path">工作区</Text> },
            { title: <Text strong className="console-header-title">{pageMeta.label}</Text> }
          ]}
        />
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
        <Button className="console-header-icon" type="default" icon={<BellOutlined />} />
        <Tooltip title={darkMode ? "切换亮色" : "切换暗色"}>
          <Button className="console-header-icon" type="default" icon={darkMode ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} />
        </Tooltip>
        <Dropdown menu={userMenu} trigger={["click"]} placement="bottomRight">
          <Button className="console-user-button" type="default">
            <Avatar size={30} icon={<UserOutlined />} style={{ background: p.fillMid, color: p.primary }} />
            <Flex vertical className="console-user-copy">
              <Text className="console-user-name">管理员</Text>
              <Text className="console-user-meta">构建 {version || "--"}</Text>
            </Flex>
          </Button>
        </Dropdown>
      </Flex>
    </Flex>
  );
}

// 鈹€鈹€鈹€ URL Pool Page 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function PoolCards({ items, actions }) {
  const p = usePalette();
  if (!items.length) return <Empty description="暂无订阅。" />;
  return (
    <Flex vertical gap={12}>
      {items.map(item => (
        <Card key={item.id} hover style={{ padding: 16 }}>
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
    { title: "URL", dataIndex: "url", render: v => <UrlText value={v} />, width: 320 },
    { title: "用户", dataIndex: "customerCount", render: v => v || 0, width: 82 },
    { title: "剩余流量", render: (_, item) => {
      if (item.status === "expired" || !item.metrics?.totalBytes) return <span>{formatBytes(item.metrics?.remainingBytes)}</span>;
      const pct = Math.round(item.metrics.remainingBytes / item.metrics.totalBytes * 100);
      return <Flex vertical gap={2} style={{ minWidth: 90 }}><Progress percent={pct} size="small" strokeColor={pct < 20 ? "#ff4d4f" : pct < 50 ? "#faad14" : "#52c41a"} showInfo={false} /><Text style={{ fontSize: 11 }}>{formatBytes(item.metrics.remainingBytes)} / {formatBytes(item.metrics.totalBytes)}</Text></Flex>;
    }, width: 140 },
    { title: "到期时间", render: (_, item) => item.status === "expired" ? "-" : formatDate(item.metrics?.expireAt), width: 120 },
    { title: "状态", dataIndex: "status", render: v => <StatusBadge status={v} />, width: 90 },
    { title: "操作", render: (_, item) => actions(item, true), width: 300 }
  ].map(col => ({ ...col, onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }), onCell: () => ({ style: { whiteSpace: "nowrap" } }) }));
  const poolTable = useResizableCols(columns, "url-pool");

  return (
    <div className="console-page-stack">
      <ConsoleOverview />
      <ManagementSection
        kicker="订阅池"
        title="订阅管理"
        actions={
          <>
            <ToolbarSearch placeholder="搜索订阅..." style={{ width: 220 }} onSearch={setKeyword} onChange={e => setKeyword(e.target.value)} />
            <Button onClick={() => setShowExpired(v => !v)} style={{ borderRadius: 6 }}>
              {showExpired ? "隐藏已过期" : "显示已过期"}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>
              新增订阅
            </Button>
          </>
        }
      >
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


// 鈹€鈹€鈹€ Subconverter Panel 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function SubconverterPanel() {
  return (
    <>
      <Flex gap={16} wrap="wrap">
        <Form.Item name={["subconverterConfig", "target"]} label="输出目标" style={{ marginBottom: 0, flex: "1 1 160px" }}>
          <Select {...inModalSelectProps} allowClear placeholder="target" options={SC_TARGETS} />
        </Form.Item>
        <Form.Item name={["subconverterConfig", "config"]} label="远程配置 URL" style={{ marginBottom: 0, flex: "1 1 160px" }}>
          <Input placeholder="选填，https://..." />
        </Form.Item>
        <Form.Item name={["subconverterConfig", "include"]} label="include" style={{ marginBottom: 0, flex: "1 1 160px" }}>
          <Input placeholder="节点包含规则" />
        </Form.Item>
        <Form.Item name={["subconverterConfig", "exclude"]} label="exclude" style={{ marginBottom: 0, flex: "1 1 160px" }}>
          <Input placeholder="节点排除规则" />
        </Form.Item>
        <Form.Item name={["subconverterConfig", "rename"]} label="rename" style={{ marginBottom: 0, flex: "1 1 160px" }}>
          <Input placeholder="old-name@new-name" />
        </Form.Item>
      </Flex>
      <Flex gap={16} wrap="wrap" align="center" style={{ marginTop: 16 }}>
        <Form.Item name={["subconverterConfig", "emoji"]} valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>Emoji</Checkbox></Form.Item>
        <Form.Item name={["subconverterConfig", "udp"]} valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>UDP</Checkbox></Form.Item>
        <Form.Item name={["subconverterConfig", "scv"]} valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>跳过 TLS 验证</Checkbox></Form.Item>
        <Form.Item name={["subconverterConfig", "sort"]} valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>节点排序</Checkbox></Form.Item>
      </Flex>
    </>
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
      <Form.Item name="outputMode" style={{ marginBottom: 12 }}>
        <Radio.Group optionType="button" buttonStyle="solid" style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <Radio.Button value="subconverter" style={{ textAlign: "center" }}>A. 订阅转换</Radio.Button>
          <Radio.Button value="direct" style={{ textAlign: "center" }}>B. 直链</Radio.Button>
        </Radio.Group>
      </Form.Item>
      {showRecommendation && (
        <Text type={recommended ? "secondary" : "warning"} style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
          {recommended ? `推荐：${subscriptionLabel(recommended)}` : (recommendReason || "无匹配订阅池，请手动选择")}
        </Text>
      )}
      <Form.Item name="subscriptionId" label={useSubconverter ? "绑定订阅池" : "当前订阅池"} rules={[{ required: true, message: "请选择订阅池" }]} style={{ marginBottom: 0 }}>
        <Select virtual={false} options={subscriptions.map(s => ({ value: s.id, label: subscriptionLabel(s) }))} />
      </Form.Item>
      {useSubconverter && (
        <>
          <Divider orientation="left" orientationMargin={0}><Text type="secondary" style={{ fontSize: 12 }}>订阅转换设置</Text></Divider>
          <SubconverterPanel />
        </>
      )}
    </>
  );
}

// 鈹€鈹€鈹€ User Form 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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
    }, item.id ? "Updating user..." : "Creating user...");
  }

  const fallbackLogs = Array.isArray(item.fallbackLogs) ? item.fallbackLogs : [];
  const fbCols = [
    { title: "Time", dataIndex: "at", render: v => formatDateTime(v), width: 150 },
    { title: "Reason", dataIndex: "reasonText", render: v => v || "-", width: 150 },
    { title: "Previous URL", dataIndex: "fromSubscriptionLabel", ellipsis: true },
    { title: "Current URL", dataIndex: "toSubscriptionLabel", ellipsis: true }
  ];
  const fbTable = useResizableCols(fbCols, "user-fallback-logs");

  return (
    <Modal title={item.id ? "编辑用户" : "新建用户"} open onCancel={onClose} footer={null} destroyOnHidden width={760} styles={MODAL_STYLES}>
      <Form form={form} layout="vertical" initialValues={{ userId: item.userId || "", wechatName: item.wechatName || "", imessageId: item.imessageId || "", purchasedAt: initialPurchasedAt, actualPaid: item.actualPaid ?? "", duration: initialDuration, expiresAt: initialExpiresAt, subscriptionId: item.subscriptionId || subscriptions[0]?.id || "", outputMode: initialOutputMode, subconverterConfig: initialSubconverterConfig(item) }} onValuesChange={handleChange} onFinish={submit}>
        <Divider orientation="left" orientationMargin={0} style={{ marginTop: 0 }}><Text type="secondary" style={{ fontSize: 12 }}>身份信息</Text></Divider>
        <Flex gap={16} wrap="wrap">
          <Form.Item name="userId" label="用户 ID" rules={[{ required: true, message: "请输入用户 ID" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}><Input placeholder="必填" /></Form.Item>
          <Form.Item name="wechatName" label="微信名" style={{ marginBottom: 0, flex: "1 1 160px" }}><Input placeholder="选填" /></Form.Item>
          <Form.Item name="imessageId" label="iMessage ID" style={{ marginBottom: 0, flex: "1 1 160px" }}><Input placeholder="选填" /></Form.Item>
        </Flex>
        <Divider orientation="left" orientationMargin={0}><Text type="secondary" style={{ fontSize: 12 }}>订阅信息</Text></Divider>
        <Flex gap={16} wrap="wrap">
          <Form.Item name="purchasedAt" label="购买日期" rules={[{ required: true, message: "请选择购买日期" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <DatePicker {...inModalPickerProps} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="expiresAt" label="到期日期" rules={[{ required: true, message: "请选择到期日期" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <DatePicker {...inModalPickerProps} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="actualPaid" label="实付金额" rules={[{ required: true, message: "请输入实付金额" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <Input type="number" min="0" step="0.01" placeholder="0.00" />
          </Form.Item>
        </Flex>
        <Form.Item name="duration" label="套餐时长" style={{ marginTop: 16, marginBottom: 0 }}>
          <DurationRadio purchasedAt={purchasedAt} />
        </Form.Item>
        <Divider orientation="left" orientationMargin={0}><Text type="secondary" style={{ fontSize: 12 }}>投递模式</Text></Divider>
        <OutputModeSection form={form} initialOutputMode={initialOutputMode} subscriptions={subscriptions} recommended={recommended} recommendReason={recommendReason} showRecommendation={!item.id} />
        {fallbackLogs.length > 0 && (
          <>
            <Divider orientation="left" orientationMargin={0}><Text type="secondary" style={{ fontSize: 12 }}>历史记录</Text></Divider>
            <Table className="saas-data-table" size="small" rowKey="id" columns={fbTable.columns} components={fbTable.components} dataSource={fallbackLogs} pagination={false} scroll={{ x: Math.max(620, fbTable.scrollX) }} />
          </>
        )}
        <Flex justify="flex-end" gap={10} style={{ marginTop: 24 }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" htmlType="submit" loading={!!busy} disabled={!!busy}>
            {item.id ? "保存修改" : "创建用户"}
          </Button>
        </Flex>
      </Form>
    </Modal>
  );
}

// 鈹€鈹€鈹€ Renew Form 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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
    }, "Renewing user...");
  }

  return (
    <Modal title={`${user.userId || "用户"} 续费`} open onCancel={onClose} footer={null} destroyOnHidden width={760} styles={MODAL_STYLES}>
      <Form form={form} layout="vertical" initialValues={{ purchasedAt: dayjs(), actualPaid: "", duration: user.duration || "monthly", subscriptionId: user.subscriptionId || subscriptions[0]?.id || "", outputMode: initialOutputMode, subconverterConfig: initialSubconverterConfig(user) }} onValuesChange={changed => { if (Object.prototype.hasOwnProperty.call(changed, "subscriptionId")) subscriptionTouched.current = true; }} onFinish={submit}>
        <Divider orientation="left" orientationMargin={0} style={{ marginTop: 0 }}><Text type="secondary" style={{ fontSize: 12 }}>续费详情</Text></Divider>
        <Flex gap={16} wrap="wrap">
          <Form.Item name="purchasedAt" label="续费日期" rules={[{ required: true, message: "请选择续费日期" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <DatePicker {...inModalPickerProps} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="actualPaid" label="实付金额" rules={[{ required: true, message: "请输入实付金额" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <Input type="number" min="0" step="0.01" placeholder="0.00" />
          </Form.Item>
        </Flex>
        <Form.Item name="duration" label="续费时长" style={{ marginTop: 16, marginBottom: 0 }}>
          <DurationRadio purchasedAt={user.expiresAt && purchasedAt && new Date(user.expiresAt) > purchasedAt.toDate() ? user.expiresAt : purchasedAt} />
        </Form.Item>
        <Divider orientation="left" orientationMargin={0}><Text type="secondary" style={{ fontSize: 12 }}>投递模式</Text></Divider>
        <OutputModeSection form={form} initialOutputMode={initialOutputMode} subscriptions={subscriptions} recommended={recommended} recommendReason={recommendReason} showRecommendation />
        <Flex justify="flex-end" gap={10} style={{ marginTop: 24 }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" htmlType="submit">确认续费</Button>
        </Flex>
      </Form>
    </Modal>
  );
}

// 鈹€鈹€鈹€ Users Page 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function UserCards({ users: list, actions }) {
  const p = usePalette();
  if (!list.length) return <Empty description="无匹配用户。" />;
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
            {[["到期", formatDate(user.expiresAt)], ["时长", durationLabels[user.duration] || "Unknown"], ["实付", formatMoney(user.actualPaid)], ["购买", formatDate(user.purchasedAt)]].map(([label, value]) => (
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
      catch (e) { notification.error({ message: "Action failed", description: e.message, placement: "bottomRight" }); }
    }, "Processing user action...");
  }

  const actions = (user, compact = false) => {
    const Wrap = compact ? InlineActions : CardActions;
    const bp = compact ? { size: "small", style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy } : { style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy };
    return (
      <Wrap>
        <Button {...bp} icon={<RetweetOutlined />} onClick={() => setRenewing(user)}>续费</Button>
        <Button {...bp} icon={<EditOutlined />} onClick={() => setEditing(user)}>编辑</Button>
        <Button {...bp} danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "删除用户", content: "确认删除该用户？", onOk: () => mutate(() => fetchJson(`/api/users/${user.id}`, { method: "DELETE" })) })}>删除</Button>
      </Wrap>
    );
  };

  const columns = [
    { title: "#", render: (_, __, i) => i + 1, width: 48 },
    { title: "用户 ID", dataIndex: "userId", width: 120 },
    { title: "状态", render: (_, u) => <StatusBadge status={userStatus(u)} />, width: 76 },
    { title: "到期时间", render: (_, u) => formatDate(u.expiresAt), width: 104 },
    { title: "时长", render: (_, u) => durationLabels[u.duration] || "Unknown", width: 72 },
    { title: "实付金额", render: (_, u) => formatMoney(u.actualPaid), width: 88 },
    { title: "客户端链接", render: (_, u) => <UrlText value={userClientSubscriptionUrl(u)} />, width: 560 },
    { title: "绑定邮箱", render: (_, u) => u.subscription?.email || "", width: 220 },
    { title: "购买日期", render: (_, u) => formatDate(u.purchasedAt), width: 104 },
    { title: "操作", render: (_, u) => actions(u, true), width: 190 }
  ].map(col => ({ ...col, onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }), onCell: () => ({ style: { whiteSpace: "nowrap" } }) }));
  const userTable = useResizableCols(columns, "users-v2");

  return (
    <ManagementSection
      kicker="用户管理"
      title="用户列表"
      actions={
        <>
          <ToolbarSearch placeholder="搜索用户、邮箱或链接" style={{ width: 220 }} onSearch={setKeyword} onChange={e => setKeyword(e.target.value)} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>
            新建用户
          </Button>
        </>
      }
    >
      <div>
        {mobile
          ? <UserCards users={visible} actions={actions} />
          : <Table className="plain-detail-table user-flat-table saas-data-table" size="middle" rowKey="id" columns={userTable.columns} components={userTable.components} dataSource={visible} pagination={tablePag} scroll={{ x: Math.max(1380, userTable.scrollX) }} />
        }
      </div>
      {editing && <UserForm item={editing} subscriptions={subscriptions} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(["users", "bills"]); }} />}
      {renewing && <RenewForm user={renewing} subscriptions={subscriptions} onClose={() => setRenewing(null)} onSaved={async () => { setRenewing(null); await reload(["users", "bills"]); }} />}
    </ManagementSection>
  );
}

// 鈹€鈹€鈹€ Bills Page 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function BillCards({ bills, actions, total }) {
  const p = usePalette();
  return (
    <Flex vertical gap={12}>
        <Card style={{ padding: 16 }}>
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>筛选合计</Text>
          <Text strong style={{ fontSize: 20 }}>{formatMoney(total)}</Text>
        </Card>
      {!bills.length && <Empty description="无匹配账单。" />}
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
            {[["类型", billTypeLabels[bill.type] || bill.type], ["状态", bill.reversedAt ? "已冲销" : "有效"], ["时长", durationLabels[bill.duration] || bill.duration || "-"], ["到期变更", bill.type === "renewal" ? `${formatDate(bill.beforeExpiresAt)} -> ${formatDate(bill.afterExpiresAt)}` : formatDate(bill.afterExpiresAt)]].map(([label, value]) => (
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
      catch (e) { notification.error({ message: "Action failed", description: e.message, placement: "bottomRight" }); }
    }, "Processing billing action...");
  }

  const actions = (bill, compact = false) => {
    const Wrap = compact ? InlineActions : CardActions;
    const bp = compact ? { size: "small", style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy } : { style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy };
    return (
      <Wrap>
        {!bill.reversedAt && <Button {...bp} onClick={() => mutate(() => postJson(`/api/bills/${bill.id}/reverse`))}>冲销</Button>}
        <Button {...bp} danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "删除账单", content: "确认删除该账单？", onOk: () => mutate(() => fetchJson(`/api/bills/${bill.id}`, { method: "DELETE" })) })}>删除</Button>
      </Wrap>
    );
  };

  const columns = [
    { title: "#", render: (_, __, i) => i + 1, width: 64 },
    { title: "发生时间", render: (_, b) => formatDateTime(b.occurredAt) },
    { title: "用户", dataIndex: "userLabel" },
    { title: "类型", render: (_, b) => billTypeLabels[b.type] || b.type },
    { title: "金额", render: (_, b) => <Text type={Number(b.amount) < 0 ? "danger" : "success"} strong>{formatMoney(b.amount)}</Text> },
    { title: "时长", render: (_, b) => durationLabels[b.duration] || b.duration || "-" },
    { title: "到期变更", render: (_, b) => b.type === "renewal" ? `${formatDate(b.beforeExpiresAt)} to ${formatDate(b.afterExpiresAt)}` : formatDate(b.afterExpiresAt) },
    { title: "状态", render: (_, b) => b.reversedAt ? <Tag>已冲销</Tag> : <Tag color="success">有效</Tag> },
    { title: "操作", render: (_, b) => actions(b, true), width: 170 }
  ].map(col => ({ ...col, onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }), onCell: () => ({ style: { whiteSpace: "nowrap" } }) }));
  const billTable = useResizableCols(columns, "bills");

  return (
    <ManagementSection
      kicker="财务"
      title="账单管理"
      summary={
        <div className="saas-summary-pill">
          <span>{formatMoney(total)}</span>
          <small>合计</small>
        </div>
      }
      actions={
        <>
          <DatePicker picker="month" value={month} onChange={setMonth} placeholder="筛选月份" style={{ width: 140, borderRadius: 8 }} />
          <ToolbarSearch placeholder="搜索账单" style={{ width: 200 }} onSearch={setKeyword} onChange={e => setKeyword(e.target.value)} />
        </>
      }
    >
      <div>
        {mobile
          ? <BillCards bills={visible} actions={actions} total={total} />
          : <Table className="plain-detail-table user-flat-table saas-data-table" size="middle" rowKey="id" columns={billTable.columns} components={billTable.components} dataSource={visible} pagination={tablePag} scroll={{ x: Math.max(1100, billTable.scrollX) }}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4}>筛选合计</Table.Summary.Cell>
                    <Table.Summary.Cell index={4}><Text strong>{formatMoney(total)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={5} colSpan={4}>{visible.length} 条记录</Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
        }
      </div>
    </ManagementSection>
  );
}

// 鈹€鈹€鈹€ App root 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function ConsoleOverview() {
  const p = usePalette();
  const navigate = useNavigate();
  const { subscriptions, users, bills } = useData();
  const screens = Grid.useBreakpoint();
  const wide = screens.xl;
  const md = screens.md;

  const counts = subscriptions.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {});
  const activeBills = bills.filter(item => !item.reversedAt);
  const paidTotal = activeBills.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const now = new Date();
  const monthPfx = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const todayPfx = `${monthPfx}-${String(now.getDate()).padStart(2, "0")}`;
  const monthIncome = activeBills.filter(item => (item.occurredAt || "").startsWith(monthPfx)).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const todayIncome = activeBills.filter(item => (item.occurredAt || "").startsWith(todayPfx)).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const expiringUsers = users.filter(item => userStatus(item) === "warning");
  const activeUrls = subscriptions.filter(item => item.status === "ok").length;
  const totalUrls = subscriptions.length;
  const activeUrlPct = totalUrls ? Math.round((activeUrls / totalUrls) * 100) : 0;
  const warningPct = totalUrls ? Math.round(((counts.warning || 0) / totalUrls) * 100) : 0;
  const goalPct = paidTotal > 0 ? Math.min(100, Math.round((monthIncome / paidTotal) * 100)) : 0;

  const criticalUrl = [...subscriptions]
    .filter(item => item.status !== "expired" && item.metrics?.totalBytes)
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
    { label: "活跃订阅", value: activeUrls, hint: `${activeUrlPct}% 可用率` },
    { label: "用户", value: users.length, hint: `${expiringUsers.length} 即将到期` },
    { label: "本月收入", value: formatMoney(monthIncome), hint: `今日 ${formatMoney(todayIncome)}` },
    { label: "告警", value: counts.warning || 0, hint: criticalUrl ? "需跟进" : "全部正常", accent: !!(counts.warning || criticalUrl) }
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
                    <span>{formatDate(pool.metrics?.expireAt)}</span>
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
                    <span>{formatDate(user.expiresAt)}</span>
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

function App() {
  const [darkMode, setDarkMode] = useState(true);
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

