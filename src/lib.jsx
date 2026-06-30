import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  App as AntApp,
  Avatar,
  Badge,
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
  Steps,
  Table,
  Tabs,
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
  CloseOutlined,
  DashboardOutlined,
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  EyeOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  NodeIndexOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  RetweetOutlined,
  SearchOutlined,
  SunOutlined,
  TeamOutlined,
  UserOutlined,
  LoadingOutlined,
  WarningOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import "antd/dist/reset.css";
import "./styles.css";
import { apiFetch, fetchJson, postJson, putJson, deleteJson } from "./api";
import {
  absoluteUrl,
  billTypeLabels,
  copyText,
  durationLabels,
  formatBytes,
  formatDate,
  formatDateTime,
  formatMoney,
  formatUserExpiry,
  statusLabels,
  userStatus
} from "./utils";

// ─── Destructured antd components ────────────────────────────────────────────

export const { Header, Content, Sider } = AntLayout;
export const { Title, Text, Paragraph } = Typography;
export const { TextArea } = Input;

// ─── Contexts ────────────────────────────────────────────────────────────────

export const DataContext = createContext(null);
export const ThemeModeContext = createContext({ darkMode: false, toggleTheme: () => {}, palette: {} });

// ─── Design tokens ───────────────────────────────────────────────────────────

export const PALETTE = {
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
    surface:         "#060809",
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

// ─── Form constants ──────────────────────────────────────────────────────────

export const NAV_DISPLAY = {
  "/dashboard": { label: "Dashboard", icon: DashboardOutlined },
  "/urls":  { label: "Pool", icon: ApiOutlined },
  "/users": { label: "Users", icon: TeamOutlined },
  "/bills": { label: "Bills", icon: DollarOutlined },
  "/emby":  { label: "Emby", icon: PlayCircleOutlined },
  "/subconverter": { label: "Subconverter", icon: NodeIndexOutlined }
};

export const inModalSelectProps = { virtual: false, getPopupContainer: n => n.parentElement };
export const inModalPickerProps = {};
export const durationDaysMap = { monthly: 30, quarterly: 90, half_yearly: 180, yearly: 360 };
export const LIFETIME_EXPIRES_AT = "9999-12-31T00:00:00.000Z";
export const isFixedDuration = duration => Object.prototype.hasOwnProperty.call(durationDaysMap, duration);

export const FIELD_GROUP = {
  background: "var(--ant-color-bg-container)",
  border: "1px solid var(--ant-color-border-secondary)",
  borderRadius: 12,
  padding: "4px 0",
  overflow: "hidden"
};
export const FIELD_ITEM = { padding: "10px 16px 6px", marginBottom: 0 };
export const FIELD_SEP  = { height: 1, background: "var(--ant-color-border-secondary)", margin: "0 16px" };
export const MODAL_STYLES = {
  header: { paddingBottom: 16, borderBottom: "1px solid var(--ant-color-border-secondary)", marginBottom: 0 },
  body:   { paddingTop: 20 }
};

export const FORM_MODAL_STYLES = {
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, borderBottom: "1px solid var(--ant-color-border-secondary)", marginBottom: 0 },
  body:   { paddingTop: 20 }
};

export const DEFAULT_PROVIDER = "YKK Cloud";
export const SC_TARGETS = [
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
export const DEFAULT_SC_TARGET = "clash";

export const tablePag = { pageSize: 20, showSizeChanger: false };

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function serviceProviderLabel(item, fallback = DEFAULT_PROVIDER) {
  return item?.serviceProvider || item?.provider || fallback;
}

const VENDOR_COLORS = ["blue", "green", "orange", "purple", "cyan", "magenta", "red", "geekblue", "volcano", "gold", "lime"];
const vendorColorMap = {};
export function getVendorColor(name) {
  if (!name) return "default";
  if (!vendorColorMap[name]) {
    const idx = Object.keys(vendorColorMap).length % VENDOR_COLORS.length;
    vendorColorMap[name] = VENDOR_COLORS[idx];
  }
  return vendorColorMap[name];
}

export function subscriptionLabel(s) {
  const tail   = s.url ? s.url.slice(-4) : "????";
  const expire = s.metrics?.expireAt ? formatDate(s.metrics.expireAt) : "Unknown expiry";
  return `${serviceProviderLabel(s)} - ${tail} - ${expire} - ${s.email || "No email"}`;
}

export function calcExpiry(purchasedAt, duration) {
  const days = durationDaysMap[duration];
  if (!days || !purchasedAt) return null;
  const d = new Date(purchasedAt instanceof Object ? purchasedAt.toDate() : purchasedAt);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d;
}

export function recommendationDate(v) {
  if (!v) return "";
  if (typeof v.toISOString === "function") return v.toISOString();
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export function initialOutputModeForUser(user) {
  if (!user?.id) return "subconverter";
  return user.outputMode === "direct" ? "direct" : "subconverter";
}

export function userClientSubscriptionUrl(user) {
  const usesSc = user.outputMode !== "direct";
  if (usesSc) {
    return user.relayPath ? absoluteUrl(user.relayPath) : "自定义链接不可用";
  }
  return user.subscription?.url || "关联链接不可用";
}

export function statusColor(status) {
  return { ok: "green", expiring: "gold", invalid: "red", low_traffic: "orange", warning: "gold", error: "red", expired: "default", depleted: "red", unknown: "blue" }[status] || "default";
}

// ─── Context hooks ───────────────────────────────────────────────────────────

export function useModalCls() {
  const { darkMode } = useContext(ThemeModeContext);
  return darkMode ? "app-modal app-modal-dark" : "app-modal";
}

export function useData()      { return useContext(DataContext); }
export function useTheme()     { return useContext(ThemeModeContext); }
export function usePalette()   { return useContext(ThemeModeContext).palette; }

export function lookupPrice(pricing, group, duration) {
  if (!pricing || !group || !duration) return undefined;
  const row = pricing.find(r => r.group === group);
  return row && typeof row[duration] === "number" ? row[duration] : undefined;
}

export function useResponsiveList() {
  const screens = Grid.useBreakpoint();
  return !screens.md;
}

// ─── Error Boundary ──────────────────────────────────────────────────────────

export class ErrorBoundary extends React.Component {
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

// ─── Primitive UI components ─────────────────────────────────────────────────

export function Card({ children, style, pad = 20, hover = false, onClick }) {
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

export function SectionCard({ title, extra, children, style }) {
  const p = usePalette();
  return (
    <AntCard
      bordered={false}
      title={title}
      extra={extra}
      style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: 15, boxShadow: p.shadowSm, ...style }}
      styles={{ header: { padding: "16px 20px", minHeight: 48 }, body: { padding: "16px 20px" } }}
    >
      {children}
    </AntCard>
  );
}

const STATUS_BADGE_MAP = {
  ok:       "success",
  expiring: "warning",
  invalid:  "error",
  low_traffic: "warning",
  warning:  "warning",
  error:    "error",
  expired:  "default",
  depleted: "error",
  unknown:  "processing"
};

export function StatusBadge({ status }) {
  return <Badge status={STATUS_BADGE_MAP[status] || "default"} text={statusLabels[status] || status || "未知"} style={{ whiteSpace: "nowrap" }} />;
}

const VIP_COLORS = { vip3: "#eb2f96", vip2: "#faad14", vip1: "#13c2c2" };
export function VipTag({ level, isFamilyFriend, isBusiness }) {
  const tagStyle = { color: "#fff", border: "none", borderRadius: 4, fontWeight: 600, fontSize: 11, lineHeight: "18px", padding: "0 6px", marginLeft: 6 };
  if (isFamilyFriend) return <Tag style={{ ...tagStyle, background: "#722ed1" }}>FNDS</Tag>;
  if (isBusiness) return <Tag style={{ ...tagStyle, background: "#1677ff" }}>BUS</Tag>;
  const bg = VIP_COLORS[level] || VIP_COLORS.vip1;
  const num = level.replace("vip", "");
  return <Tag style={{ ...tagStyle, background: bg }}>VIP {num}</Tag>;
}

export function CopyButton({ value, size = "small", label, buttonProps = {} }) {
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
      type="text"
      size={size}
      {...buttonProps}
      icon={done ? <CheckOutlined style={{ color: "var(--ant-color-primary)" }} /> : <CopyOutlined />}
      onClick={copy}
      style={{ flexShrink: 0, ...buttonProps.style }}
    >{label}</Button>
  );
}

export function UrlPill({ value, mono = true }) {
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

export function UrlText({ value }) {
  return <UrlPill value={value} mono />;
}

export function MobileUrlBlock({ value }) {
  return <CopyButton value={value} />;
}

export function CopyableUrlPill({ value, className }) {
  return (
    <span className={`copyable-url copyable-url-mobile${className ? ` ${className}` : ""}`}>
      <Text className="copyable-url-text" copyable code>{value}</Text>
    </span>
  );
}

export function VendorTag({ name }) {
  if (!name) return null;
  return <Tag color={getVendorColor(name)} style={{ marginRight: 4, borderRadius: 4 }}>{name}</Tag>;
}

export function PageSection({ title, actions, children }) {
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

export function ManagementSection({ title, actions, summary, children }) {
  const screens = Grid.useBreakpoint();
  const mobile = !screens.md;
  return (
    <div className="mgmt-section">
      <div className="mgmt-section-head">
        <div className="mgmt-section-title-group">
          <Text className="mgmt-section-title">{title}</Text>
          {summary}
        </div>
        {actions && <div className="mgmt-section-actions">{actions}</div>}
      </div>
      <div className={`mgmt-section-body${mobile ? " mobile" : ""}`}>
        {children}
      </div>
    </div>
  );
}

export function ToolbarSearch(props) {
  return <Input.Search allowClear className="saas-toolbar-search" {...props} />;
}

export function InlineActions({ children }) {
  return <Flex wrap={false} gap={6} align="center">{children}</Flex>;
}

export function CardActions({ children }) {
  return (
    <Flex wrap gap={8} align="center">
      {React.Children.map(children, child => child && React.isValidElement(child)
        ? React.cloneElement(child, { size: "small", style: { ...child.props.style, height: 32, paddingInline: 12, borderRadius: 6, fontSize: 13 } })
        : child
      )}
    </Flex>
  );
}

export function DurationRadio({ purchasedAt, value, onChange }) {
  const p = usePalette();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {Object.entries(durationLabels).map(([key, label]) => {
        const expiry   = calcExpiry(purchasedAt, key);
        const selected = value === key;
        const hint     = key === "lifetime" ? "永不到期"
                       : key === "custom"   ? "由到期日期决定"
                       : expiry             ? `Expires ${formatDate(expiry)}`
                       : null;
        return (
          <div key={key} onClick={() => onChange?.(key)} style={{
            padding: "10px 12px", borderRadius: 10, cursor: "pointer",
            border: `1px solid ${selected ? p.primary : p.border}`,
            background: selected ? p.fill : p.surface,
            transition: "all 0.15s"
          }}>
            <Text strong style={{ fontSize: 14, color: selected ? p.primary : undefined }}>{label}</Text>
            {hint && <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 2 }}>{hint}</Text>}
          </div>
        );
      })}
    </div>
  );
}

// ─── YAML viewer ─────────────────────────────────────────────────────────────

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
export function CodeViewer({ code, meta, language = "YAML" }) {
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

export function BusyOverlay({ busy }) {
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
        <Spin indicator={<LoadingOutlined spin style={{ fontSize: 32 }} />} style={{ color: "var(--ant-color-primary)" }} />
        <Text strong style={{ fontSize: 15 }}>{busy?.label || "处理中..."}</Text>
        <div style={{ width: "100%", height: 4, borderRadius: 999, background: "var(--ant-color-fill-secondary)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, width: `${pct}%`, background: "var(--ant-color-primary)", transition: "width 0.6s ease" }} />
        </div>
      </Flex>
    </Modal>
  );
}

// ─── Resizable table columns ─────────────────────────────────────────────────

export const resizableComponents = { header: { cell: ResizableHeaderCell } };

export function ResizableHeaderCell({ width, onResizeColumn, children, style, ...rest }) {
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

export function useResizableCols(columns, key) {
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

// ─── Theme config ────────────────────────────────────────────────────────────

export function makeAntTheme(palette, dark) {
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
      fontFamily: "'Manrope', 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif",
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
      motionDurationMid: "0.16s",
      // overlay mask (Modal等遮罩)
      colorBgMask: "rgba(0, 0, 0, 0.35)"
    },
    components: {
      Layout: {
        bodyBg: palette.page,
        headerBg: palette.surface,
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
        borderRadius: 0,
        borderRadiusLG: 0
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
        colorLinkHover: palette.primaryDark,
        primaryShadow: "none",
        defaultShadow: "none",
        dangerShadow: "none"
      },
      Input: {
        controlHeight: 36,
        borderRadius: 6,
        colorBgContainer: "transparent",
        colorText: palette.text,
        colorIcon: palette.textMuted,
        hoverBorderColor: palette.text,
        activeBorderColor: palette.text,
        activeShadow: "0 0 0 0 transparent",
        colorTextPlaceholder: palette.textMuted
      },
      Select: {
        controlHeight: 36,
        borderRadius: 6,
        optionSelectedBg: palette.fillLight,
        optionActiveBg: palette.fillLight,
        colorBgContainer: "transparent",
        colorText: palette.text,
        hoverBorderColor: palette.text,
        activeBorderColor: palette.text,
        activeOutlineColor: "transparent"
      },
      DatePicker: {
        controlHeight: 36,
        borderRadius: 6,
        colorBgContainer: "transparent",
        colorText: palette.text,
        hoverBorderColor: palette.text,
        activeBorderColor: palette.text,
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
      Radio: {
        buttonColor: palette.textSub,
        buttonSolidCheckedColor: "#fff",
        buttonSolidCheckedBg: palette.primary,
        buttonSolidCheckedHoverBg: palette.primaryDark,
        buttonSolidCheckedActiveBg: palette.primaryDark
      },
      Statistic:  { titleFontSize: 12, contentFontSize: 22 },
      Drawer:     { colorBgElevated: palette.surface, colorBgMask: "rgba(0, 0, 0, 0.48)" },
      Notification: { colorBgElevated: palette.surfaceElevated }
    }
  };
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export function RequireAuth({ children }) {
  return children;
}

// ─── FormModal ───────────────────────────────────────────────────────────────

export function FormModal({ children, title, onCancel, ...props }) {
  const modalCls = useModalCls();
  return (
    <Modal
      footer={null}
      destroyOnHidden
      closable={false}
      title={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <span>{title}</span>
          <Button type="text" icon={<CloseOutlined />} onClick={onCancel} style={{ width: 32, height: 32, padding: 0, borderRadius: 6 }} />
        </div>
      }
      onCancel={onCancel}
      styles={FORM_MODAL_STYLES}
      className={`${modalCls} form-modal`}
      {...props}
    >
      {children}
    </Modal>
  );
}

// ─── DataProvider ────────────────────────────────────────────────────────────

export function DataProvider({ children }) {
  const nav = useNavigate();
  const [state, setState] = useState({ subscriptions: [], users: [], bills: [], vendors: [], presets: [], placeholderNodes: [], embyUsers: [], embyVendors: [], pricing: [], meta: null, loading: true, error: "" });
  const [busy, setBusy] = useState(null);

  const apis = useMemo(() => ({
    subscriptions: "/api/subscriptions",
    users: "/api/users",
    bills: "/api/bills",
    vendors: "/api/vendors",
    presets: "/api/presets",
    placeholderNodes: "/api/placeholder-nodes",
    embyUsers: "/api/emby-users",
    embyVendors: "/api/emby-vendors",
    pricing: "/api/pricing",
    meta:  "/api/app-meta"
  }), []);
  const initialCollections = useMemo(() => ["subscriptions", "users", "bills", "meta"], []);
  const deferredCollections = useMemo(() => ["vendors", "presets", "placeholderNodes", "embyUsers", "embyVendors", "pricing"], []);

  const reload = useCallback(async (collections = null, { silent = false } = {}) => {
    const keys = collections || initialCollections;
    setState(s => ({ ...s, loading: !collections && !silent, error: silent ? s.error : "" }));
    try {
      const results = await Promise.all(keys.map(k => fetchJson(apis[k])));
      setState(s => { const p = {}; keys.forEach((k, i) => { p[k] = results[i]; }); return { ...s, ...p, loading: silent ? s.loading : false, error: silent ? s.error : "" }; });
    } catch (err) {
      if (silent) {
        console.warn("[data] background reload failed:", err.message);
        return;
      }
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, [apis, initialCollections]);

  useEffect(() => {
    fetchJson("/api/auth/me").catch(() => nav("/login", { replace: true }));
    reload().then(() => reload(deferredCollections, { silent: true }));
  }, [deferredCollections, nav, reload]);

  const runAsync = useCallback(async (task, label = "处理中...") => {
    setBusy({ label });
    try { return await task(); } finally { setBusy(null); }
  }, []);

  const value = useMemo(() => ({ ...state, reload, runAsync, busy }), [state, reload, runAsync, busy]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// ─── Shared components used across pages ─────────────────────────────────────

export function MiniProgressBar({ pct }) {
  const p = usePalette();
  const color = pct < 20 ? "#ef4444" : pct < 50 ? "#f59e0b" : p.primary;
  return (
    <div style={{ height: 6, borderRadius: 999, background: p.fillMid, overflow: "hidden", marginTop: 6 }}>
      <div style={{ height: "100%", borderRadius: 999, width: `${pct}%`, background: color, transition: "width 0.4s" }} />
    </div>
  );
}

export function DonutChart({ pct = 0, size = 120, strokeWidth = 14, label, sublabel, color }) {
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

export function CircleStatTile({ pct = 0, label, sublabel, size = 80, strokeWidth = 8 }) {
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

export function ReminderItem({ icon, title, subtitle, urgent }) {
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

export function DwellixLogo({ size = 34 }) {
  const p = usePalette();
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.29), background: p.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 20 18" fill="none">
        <path d="M10 1L1 8.5V17h6v-5h6v5h6V8.5L10 1Z" fill="#fff" />
      </svg>
    </div>
  );
}

export function useSubscriptionRecommendation({ expiresAt, purchasedAt, duration, ignoredUserId = "", enabled = true }) {
  const normExpiry = recommendationDate(expiresAt);
  const normPurchased = recommendationDate(purchasedAt);
  const [state, setState] = useState({ result: null, reason: null, loading: false });
  useEffect(() => {
    if (!enabled || (!normExpiry && (!normPurchased || !duration))) {
      setState({ result: null, reason: null, loading: false });
      return;
    }
    let cancelled = false;
    setState(s => ({ ...s, loading: true }));
    postJson("/api/subscriptions/recommend", { expiresAt: normExpiry, purchasedAt: normPurchased, duration, ignoredUserId })
      .then(payload => {
        if (!cancelled) setState({ result: payload.subscription || null, reason: payload.reason || null, loading: false });
      })
      .catch(err => { if (!cancelled) setState({ result: null, reason: err.message, loading: false }); });
    return () => { cancelled = true; };
  }, [enabled, normExpiry, normPurchased, duration, ignoredUserId]);
  return state;
}

export function OutputModeSection({ form, initialOutputMode, subscriptions, recommended, recommendReason, showRecommendation, userExpiresAt }) {
  const outputMode = Form.useWatch("outputMode", form);
  const useSubconverter = (outputMode || initialOutputMode) === "subconverter";

  const sortedSubOptions = useMemo(() => {
    const userExp = userExpiresAt ? new Date(userExpiresAt instanceof Object && userExpiresAt.toDate ? userExpiresAt.toDate() : userExpiresAt).getTime() : null;
    const list = subscriptions.map(s => {
      const subExp = s.metrics?.expireAt ? new Date(s.metrics.expireAt).getTime() : 0;
      const diffDays = userExp && subExp ? Math.round((subExp - userExp) / 86400000) : null;
      const diffLabel = diffDays !== null ? `${diffDays >= 0 ? "+" : ""}${diffDays}天` : "?天";
      const vendor = serviceProviderLabel(s);
      const expLabel = s.metrics?.expireAt ? formatDate(s.metrics.expireAt) : "未知";
      const email = s.email || "无邮箱";
      return { value: s.id, label: `${diffLabel} - ${vendor} - ${expLabel} - ${email}`, expireAt: subExp };
    });
    return list.sort((a, b) => b.expireAt - a.expireAt);
  }, [subscriptions, userExpiresAt]);

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
        <Select virtual={false} options={sortedSubOptions} />
      </Form.Item>
      {useSubconverter && (
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 12 }}>
          订阅转换将使用全局转换预设，并按所选订阅池的供应商自动叠加字段屏蔽。
        </Text>
      )}
    </>
  );
}
