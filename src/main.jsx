import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
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

// 鈹€鈹€鈹€ Form constants 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const NAV_DISPLAY = {
  "/dashboard": { label: "Dashboard", icon: DashboardOutlined },
  "/urls":  { label: "Pool", icon: ApiOutlined },
  "/users": { label: "Users", icon: TeamOutlined },
  "/bills": { label: "Bills", icon: DollarOutlined },
  "/emby":  { label: "Emby", icon: PlayCircleOutlined },
  "/subconverter": { label: "Subconverter", icon: NodeIndexOutlined }
};

const inModalSelectProps = { virtual: false, getPopupContainer: n => n.parentElement };
const inModalPickerProps = {};
const durationDaysMap = { monthly: 30, quarterly: 90, half_yearly: 180, yearly: 360 };
// 永久用户的到期日哨兵（须与 server.js 的 LIFETIME_EXPIRES_AT 一致）
const LIFETIME_EXPIRES_AT = "9999-12-31T00:00:00.000Z";
const isFixedDuration = duration => Object.prototype.hasOwnProperty.call(durationDaysMap, duration);

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

const FORM_MODAL_STYLES = {
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, borderBottom: "1px solid var(--ant-color-border-secondary)", marginBottom: 0 },
  body:   { paddingTop: 20 }
};

function useModalCls() {
  const { darkMode } = useContext(ThemeModeContext);
  return darkMode ? "app-modal app-modal-dark" : "app-modal";
}

function FormModal({ children, title, onCancel, ...props }) {
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

const VENDOR_COLORS = ["blue", "green", "orange", "purple", "cyan", "magenta", "red", "geekblue", "volcano", "gold", "lime"];
const vendorColorMap = {};
function getVendorColor(name) {
  if (!name) return "default";
  if (!vendorColorMap[name]) {
    const idx = Object.keys(vendorColorMap).length % VENDOR_COLORS.length;
    vendorColorMap[name] = VENDOR_COLORS[idx];
  }
  return vendorColorMap[name];
}
function VendorTag({ name }) {
  if (!name) return null;
  return <Tag color={getVendorColor(name)} style={{ marginRight: 4, borderRadius: 4 }}>{name}</Tag>;
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
  if (user?.scMode === "vendor") return "subconverter";
  if (user?.scMode === "custom") return user.subconverterConfig?.target ? "subconverter" : "direct";
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

function initialScMode(user, vendors) {
  if (user?.scMode) return user.scMode;
  if (!user?.id) return "vendor";
  if (user.subconverterConfig) return "custom";
  return "vendor";
}

function initialVendorId(user, vendors, subscriptions) {
  if (user?.vendorId) return user.vendorId;
  if (!user?.id) {
    const sub = subscriptions?.find(s => s.id === user?.subscriptionId);
    const v = sub ? vendors.find(v => v.name === sub.serviceProvider) : null;
    return v?.id || (vendors.length ? vendors[0].id : null);
  }
  const sub = subscriptions?.find(s => s.id === user.subscriptionId);
  const v = sub ? vendors.find(v => v.name === sub.serviceProvider) : null;
  return v?.id || null;
}

function userClientSubscriptionUrl(user) {
  const usesSc = user?.scMode === "vendor" || user?.scMode === "custom"
    ? (user.scMode === "vendor" || user.subconverterConfig?.target)
    : Boolean(user?.subconverterConfig?.target);
  if (usesSc) {
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

function SectionCard({ title, extra, children, style }) {
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
  warning:  "warning",
  error:    "error",
  expired:  "default",
  depleted: "error",
  unknown:  "processing"
};

function StatusBadge({ status }) {
  return <Badge status={STATUS_BADGE_MAP[status] || "default"} text={statusLabels[status] || status || "未知"} style={{ whiteSpace: "nowrap" }} />;
}

const VIP_COLORS = { vip3: "#eb2f96", vip2: "#faad14", vip1: "#13c2c2" };
function VipTag({ level }) {
  const bg = VIP_COLORS[level] || VIP_COLORS.vip1;
  const num = level.replace("vip", "");
  return <Tag style={{ background: bg, color: "#fff", border: "none", borderRadius: 4, fontWeight: 600, fontSize: 11, lineHeight: "18px", padding: "0 6px", marginLeft: 6 }}>VIP {num}</Tag>;
}

function CopyButton({ value, size = "small", label, buttonProps = {} }) {
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

function ManagementSection({ title, actions, summary, children }) {
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
        <Spin indicator={<LoadingOutlined spin style={{ fontSize: 32 }} />} style={{ color: "var(--ant-color-primary)" }} />
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
      // overlay mask (Modal等遮罩) — 取代 .ant-modal-mask 覆写
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
        // 取代 .ant-btn box-shadow 覆写
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
        // 取代 .ant-radio-group-solid 覆写：未选中文字/边框、实心选中态配色
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

// 鈹€鈹€鈹€ Auth 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function RequireAuth({ children }) {
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
  const p = usePalette();
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");

  async function submit(values) {
    setLoading(true); setErr("");
    try {
      const res     = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ ...values, remember: false }) });
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
          <Form layout="vertical" onFinish={submit} requiredMark={false}>
            <Form.Item name="account" label="账号" rules={[{ required: true, message: "请输入账号" }]} style={{ marginBottom: 16 }}>
              <Input autoFocus autoComplete="username" placeholder="账号" size="large" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]} style={{ marginBottom: 20 }}>
              <Input.Password autoComplete="current-password" placeholder="密码" size="large" />
            </Form.Item>
            {err && <Text type="danger" style={{ display: "block", marginBottom: 14, fontSize: 13 }}>{err}</Text>}
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
                    <Routes>
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/urls" element={<UrlPoolPage />} />
                      <Route path="/urls/detail/:id" element={<PoolDetailPage />} />
                      <Route path="/users" element={<UsersPage />} />
                      <Route path="/users/detail/:id" element={<UserDetailPage />} />
                      <Route path="/bills" element={<BillsPage />} />
                      <Route path="/emby" element={<EmbyPage />} />
                      <Route path="/subconverter" element={<SubconverterPage />} />
                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
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

// 鈹€鈹€鈹€ DataProvider 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function DataProvider({ children }) {
  const nav = useNavigate();
  const [state, setState] = useState({ subscriptions: [], users: [], bills: [], vendors: [], placeholderNodes: [], embyUsers: [], meta: null, loading: true, error: "" });
  const [busy, setBusy] = useState(null);

  const apis = useMemo(() => ({
    subscriptions: "/api/subscriptions",
    users: "/api/users",
    bills: "/api/bills",
    vendors: "/api/vendors",
    placeholderNodes: "/api/placeholder-nodes",
    embyUsers: "/api/emby-users",
    meta:  "/api/app-meta"
  }), []);

  const reload = useCallback(async (collections = null) => {
    const keys = collections || ["subscriptions", "users", "bills", "vendors", "placeholderNodes", "embyUsers", "meta"];
    setState(s => ({ ...s, loading: !collections, error: "" }));
    try {
      const results = await Promise.all(keys.map(k => fetchJson(apis[k])));
      setState(s => { const p = {}; keys.forEach((k, i) => { p[k] = results[i]; }); return { ...s, ...p, loading: false, error: "" }; });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, [apis]);

  useEffect(() => {
    fetchJson("/api/auth/me").catch(() => nav("/login", { replace: true }));
    reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const isMobile = !screens.md;

  const cacheText = cache?.error ? `Error: ${cache.error}` : (cache?.body || "(no YAML fetched)");
  const cacheSource = cache?.storage === "cached" ? "缓存" : cache?.storage === "live" ? "实时" : "";
  const cacheMeta = cache?.fetchedAt ? `${cacheSource ? `[${cacheSource}] ` : ""}${formatDateTime(cache.fetchedAt)} - ${formatBytes(cache.bodyLength || 0)}${cache.truncated ? " (truncated)" : ""}` : "";

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
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Info card */}
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
              { label: "到期时间", value: m.expireAt ? formatDate(m.expireAt) : "-" },
              { label: "剩余流量", value: m.totalBytes ? `${formatBytes(m.remainingBytes)} / ${formatBytes(m.totalBytes)}` : "-" },
              { label: "已用流量", value: m.usedBytes ? formatBytes(m.usedBytes) : "-" },
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

        {/* YAML viewer */}
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

// 鈹€鈹€鈹€ Subscription Form 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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
    // 编辑了订阅链接、或新建订阅：保存后实时拉取该 URL 的流量/到期信息并刷新列表。
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

// 鈹€鈹€鈹€ URL Pool Page 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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
        </div>
      ))}
    </Flex>
  );
}

function DashboardPage() {
  return <ConsoleOverview />;
}

function VendorPresetModal({ vendor, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const raw = vendor.defaultSubconverterConfig || {};
  const sc = raw.subconverterConfig ? { ...raw.subconverterConfig, target: raw.subconverterConfig.target || raw.target } : raw;

  const scFields = { target: sc.target || DEFAULT_SC_TARGET, config: sc.config || "", include: sc.include || "", exclude: sc.exclude || "", rename: sc.rename || "", emoji: sc.emoji !== false, udp: sc.udp !== false, scv: Boolean(sc.scv), sort: Boolean(sc.sort) };

  useEffect(() => {
    form.setFieldsValue({ subconverterConfig: scFields });
  }, [vendor.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(values) {
    setSaving(true);
    try {
      await fetchJson(`/api/vendors/${vendor.id}`, { method: "PUT", body: JSON.stringify({ defaultSubconverterConfig: values.subconverterConfig }) });
      await onSaved();
      onClose();
    } finally { setSaving(false); }
  }

  function handleClear() {
    fetchJson(`/api/vendors/${vendor.id}`, { method: "PUT", body: JSON.stringify({ defaultSubconverterConfig: null }) })
      .then(onSaved).then(onClose);
  }

  return (
    <FormModal title={`预设：${vendor.name}`} open onCancel={onClose}>
      <Form form={form} layout="vertical"
        initialValues={{ subconverterConfig: scFields }}
        onFinish={submit}>
        <SubconverterPanel />
        <Flex vertical gap={10} style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" block loading={saving}>保存</Button>
          <Button danger block onClick={handleClear}>清除预设</Button>
        </Flex>
      </Form>
    </FormModal>
  );
}

function VendorPresetSection() {
  const { vendors, reload } = useData();
  const [editing, setEditing] = useState(null);
  const p = usePalette();

  return (
    <SectionCard title="转换预设管理">
      {vendors.length === 0
        ? <Text type="secondary">暂无供应商，请在新增订阅时添加。</Text>
        : <Flex gap={12} wrap="wrap">
            {vendors.map(v => (
              <AntCard key={v.id} style={{ minWidth: 180, background: p.card, border: `1px solid ${p.border}`, borderRadius: 10 }} styles={{ header: { padding: "8px 16px", minHeight: 40 }, body: { padding: "12px 16px" } }}
                extra={<Button size="small" type="link" onClick={() => setEditing(v)}>编辑预设</Button>}
                title={<Text strong>{v.name}</Text>}>
                {v.defaultSubconverterConfig
                  ? <Text type="secondary" style={{ fontSize: 12 }}>{v.defaultSubconverterConfig.target}{v.defaultSubconverterConfig.exclude ? ` · exclude: ${v.defaultSubconverterConfig.exclude}` : ""}</Text>
                  : <Text type="secondary" style={{ fontSize: 12 }}>未设置预设</Text>}
              </AntCard>
            ))}
          </Flex>
      }
      {editing && <VendorPresetModal vendor={editing} onClose={() => setEditing(null)} onSaved={() => reload(["vendors"])} />}
    </SectionCard>
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

function OutputModeSection({ form, initialOutputMode, subscriptions, recommended, recommendReason, showRecommendation, vendors, userExpiresAt }) {
  const outputMode = Form.useWatch("outputMode", form);
  const scMode = Form.useWatch("scMode", form);
  const useSubconverter = (outputMode || initialOutputMode) === "subconverter";
  const vendorOptions = (vendors || []).filter(v => v.defaultSubconverterConfig).map(v => ({ value: v.id, label: v.name }));

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
        <>
          <Divider orientation="left" orientationMargin={0}><Text type="secondary" style={{ fontSize: 12 }}>订阅转换设置</Text></Divider>
          <Form.Item name="scMode" label="配置来源" style={{ marginBottom: 12 }}>
            <Radio.Group optionType="button" buttonStyle="solid" style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
              <Radio.Button value="vendor" style={{ textAlign: "center" }}>跟随供应商预设</Radio.Button>
              <Radio.Button value="custom" style={{ textAlign: "center" }}>自定义配置</Radio.Button>
            </Radio.Group>
          </Form.Item>
          {scMode === "vendor" ? (
            <Form.Item name="vendorId" label="供应商预设" rules={[{ required: true, message: "请选择供应商" }]} style={{ marginBottom: 0 }}>
              <Select {...inModalSelectProps} options={vendorOptions} placeholder="选择供应商" />
            </Form.Item>
          ) : (
            <SubconverterPanel />
          )}
        </>
      )}
    </>
  );
}

// 鈹€鈹€鈹€ User Form 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function UserForm({ item, subscriptions, onClose, onSaved }) {
  const { runAsync, busy, vendors } = useData();
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const expiryTouched = useRef(false);
  const subscriptionTouched = useRef(false);
  const initialOutputMode = initialOutputModeForUser(item);
  const purchasedAt = Form.useWatch("purchasedAt", form);
  const duration = Form.useWatch("duration", form);
  const expiresAt = Form.useWatch("expiresAt", form);

  const { result: recommended, reason: recommendReason, loading: recommendLoading } = useSubscriptionRecommendation({
    expiresAt: expiresAt || calcExpiry(purchasedAt, duration),
    duration,
    ignoredUserId: item.id || "",
    fallbackId: item.subscriptionId || subscriptions[0]?.id || "",
    enabled: step >= 2 && Boolean(purchasedAt && duration)
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
    if (Object.prototype.hasOwnProperty.call(changed, "subscriptionId")) {
      subscriptionTouched.current = true;
      const sub = subscriptions.find(s => s.id === changed.subscriptionId);
      const v = (vendors || []).find(v => v.name === sub?.serviceProvider);
      if (v?.id && values.scMode === "vendor") {
        form.setFieldsValue({ vendorId: v.id });
      }
    }
    if (Object.prototype.hasOwnProperty.call(changed, "expiresAt")) { expiryTouched.current = true; return; }
    if (Object.prototype.hasOwnProperty.call(changed, "duration")) {
      // 永久：清空到期日期（由后端补哨兵）；自定义：保留用户手填值，二者均不自动推算
      if (values.duration === "lifetime") { form.setFieldsValue({ expiresAt: null }); return; }
      if (values.duration === "custom") return;
    }
    if (!expiryTouched.current && (Object.prototype.hasOwnProperty.call(changed, "purchasedAt") || Object.prototype.hasOwnProperty.call(changed, "duration"))) {
      const next = calcExpiry(values.purchasedAt, values.duration);
      if (next) form.setFieldsValue({ expiresAt: dayjs(next) });
    }
  }

  async function submit(values) {
    await runAsync(async () => {
      const scMode = values.outputMode === "subconverter" ? (values.scMode || "vendor") : "custom";
      const payload = {
        ...values,
        purchasedAt: values.purchasedAt ? values.purchasedAt.format("YYYY-MM-DD") : "",
        expiresAt: values.expiresAt ? values.expiresAt.toISOString() : "",
        scMode,
        vendorId: scMode === "vendor" ? (values.vendorId || null) : null,
        subconverterConfig: scMode === "custom" ? buildSubconverterConfig(values) : null,
        placeholderTag: values.placeholderTag || null,
        useDefaultPlaceholder: values.useDefaultPlaceholder !== false
      };
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
    <FormModal title={item.id ? "编辑用户" : "新建用户"} open onCancel={onClose} width={760}>
      <Form form={form} layout="vertical" initialValues={{ userId: item.userId || "", wechatName: item.wechatName || "", imessageId: item.imessageId || "", purchasedAt: initialPurchasedAt, actualPaid: item.actualPaid ?? "", duration: initialDuration, expiresAt: initialExpiresAt, subscriptionId: item.subscriptionId || subscriptions[0]?.id || "", outputMode: initialOutputMode, subconverterConfig: initialSubconverterConfig(item), scMode: initialScMode(item, vendors || []), vendorId: initialVendorId(item, vendors || [], subscriptions), placeholderTag: item.placeholderTag || "", showUserInfo: item.showUserInfo !== false, useDefaultPlaceholder: item.useDefaultPlaceholder !== false, blockUserinfo: item.blockUserinfo !== false, group: item.group || "pro", isBusiness: Boolean(item.isBusiness) }} onValuesChange={handleChange} onFinish={submit}>
        <Steps current={step} size="small" style={{ marginBottom: 24 }} items={[{ title: "身份信息" }, { title: "订阅信息" }, { title: "投递模式" }, { title: "高级设置" }]} />
        <div style={{ display: step === 0 ? "block" : "none" }}>
          <Flex gap={16} wrap="wrap">
            <Form.Item name="userId" label="用户 ID" rules={[{ required: true, message: "请输入用户 ID" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}><Input placeholder="必填" /></Form.Item>
            <Form.Item name="wechatName" label="微信名" style={{ marginBottom: 0, flex: "1 1 160px" }}><Input placeholder="选填" /></Form.Item>
            <Form.Item name="imessageId" label="iMessage ID" style={{ marginBottom: 0, flex: "1 1 160px" }}><Input placeholder="选填" /></Form.Item>
          </Flex>
          <Flex gap={16} wrap="wrap" align="center" style={{ marginTop: 16 }}>
            <Form.Item name="group" label="套餐" style={{ marginBottom: 0 }}>
              <Radio.Group optionType="button" buttonStyle="solid">
                <Radio.Button value="basic">Basic</Radio.Button>
                <Radio.Button value="pro">Pro</Radio.Button>
                <Radio.Button value="ultra">Ultra</Radio.Button>
              </Radio.Group>
            </Form.Item>
            <Form.Item name="isBusiness" valuePropName="checked" style={{ marginBottom: 0, alignSelf: "flex-end" }}>
              <Checkbox>企业用户</Checkbox>
            </Form.Item>
          </Flex>
        </div>
        <div style={{ display: step === 1 ? "block" : "none" }}>
          <Flex gap={16} wrap="wrap">
            <Form.Item name="purchasedAt" label="购买日期" rules={[{ required: true, message: "请选择购买日期" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
              <DatePicker {...inModalPickerProps} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="expiresAt" label="到期日期" rules={duration === "lifetime" ? [] : [{ required: true, message: "请选择到期日期" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
              <DatePicker {...inModalPickerProps} style={{ width: "100%" }} disabled={duration === "lifetime"} placeholder={duration === "lifetime" ? "永久有效" : undefined} />
            </Form.Item>
            <Form.Item name="actualPaid" label="总消费金额" rules={[{ required: true, message: "请输入总消费金额" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
              <Input type="number" min="0" step="0.01" placeholder="0.00" />
            </Form.Item>
          </Flex>
          <Form.Item name="duration" label="套餐时长" style={{ marginTop: 16, marginBottom: 0 }}>
            <DurationRadio purchasedAt={purchasedAt} />
          </Form.Item>
        </div>
        <div style={{ display: step === 2 ? "block" : "none" }}>
          {recommendLoading ? <Flex justify="center" align="center" style={{ padding: "48px 0" }}><Spin indicator={<LoadingOutlined spin />} tip="正在匹配推荐订阅池..." /></Flex> : (
            <OutputModeSection form={form} initialOutputMode={initialOutputMode} subscriptions={subscriptions} recommended={recommended} recommendReason={recommendReason} showRecommendation={!item.id} vendors={vendors} userExpiresAt={expiresAt || calcExpiry(purchasedAt, duration)} />
          )}
        </div>
        <div style={{ display: step === 3 ? "block" : "none" }}>
          <PlaceholderTagSelect />
          <Form.Item name="blockUserinfo" valuePropName="checked" style={{ marginTop: 12, marginBottom: 0 }}>
            <Checkbox>屏蔽原 userinfo</Checkbox>
          </Form.Item>
          {fallbackLogs.length > 0 && (
            <>
              <Divider orientation="left" orientationMargin={0}><Text type="secondary" style={{ fontSize: 12 }}>历史记录</Text></Divider>
              <Table className="saas-data-table" size="small" rowKey="id" columns={fbTable.columns} components={fbTable.components} dataSource={fallbackLogs} pagination={false} scroll={{ x: Math.max(620, fbTable.scrollX) }} />
            </>
          )}
        </div>
        <Flex gap={12} style={{ marginTop: 24 }}>
          {step > 0 && <Button block onClick={() => setStep(step - 1)}>上一步</Button>}
          {step < 3 && <Button type="primary" block onClick={() => form.validateFields(step === 0 ? ["userId"] : step === 1 ? ["purchasedAt", "actualPaid"] : ["subscriptionId"]).then(() => setStep(step + 1))}>下一步</Button>}
          {step === 3 && <Button type="primary" htmlType="submit" block loading={!!busy} disabled={!!busy}>{item.id ? "保存修改" : "创建用户"}</Button>}
        </Flex>
      </Form>
    </FormModal>
  );
}

// 鈹€鈹€鈹€ Renew Form 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function RenewForm({ user, subscriptions, onClose, onSaved }) {
  const { runAsync, vendors } = useData();
  const [form] = Form.useForm();
  const subscriptionTouched = useRef(false);
  const purchasedAt = Form.useWatch("purchasedAt", form);
  const duration = Form.useWatch("duration", form);
  const expiresAt = Form.useWatch("expiresAt", form);
  const initialOutputMode = initialOutputModeForUser(user);

  let renewalExpiresAt = "";
  if (duration === "lifetime") {
    renewalExpiresAt = LIFETIME_EXPIRES_AT;
  } else if (duration === "custom") {
    renewalExpiresAt = expiresAt ? expiresAt.toISOString() : "";
  } else {
    const renewalBase = user.expiresAt && purchasedAt && new Date(user.expiresAt) > purchasedAt.toDate() ? user.expiresAt : purchasedAt;
    renewalExpiresAt = renewalBase && duration ? calcExpiry(renewalBase, duration) : "";
  }

  const { result: recommended, reason: recommendReason, loading: recommendLoading } = useSubscriptionRecommendation({
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
      const scMode = values.outputMode === "subconverter" ? (values.scMode || "vendor") : "custom";
      const payload = {
        ...values,
        purchasedAt: values.purchasedAt.format("YYYY-MM-DD"),
        scMode,
        vendorId: scMode === "vendor" ? (values.vendorId || null) : null,
        subconverterConfig: scMode === "custom" ? buildSubconverterConfig(values) : null
      };
      if (values.expiresAt && typeof values.expiresAt.toISOString === "function") payload.expiresAt = values.expiresAt.toISOString();
      delete payload.outputMode;
      await postJson(`/api/users/${user.id}/renew`, payload);
      await onSaved();
    }, "Renewing user...");
  }

  return (
    <FormModal title={`${user.userId || "用户"} 续费`} open onCancel={onClose} width={760}>
      <Form form={form} layout="vertical" initialValues={{ purchasedAt: dayjs(), actualPaid: "", duration: user.duration || "monthly", subscriptionId: user.subscriptionId || subscriptions[0]?.id || "", outputMode: initialOutputMode, subconverterConfig: initialSubconverterConfig(user), scMode: initialScMode(user, vendors || []), vendorId: initialVendorId(user, vendors || [], subscriptions) }} onValuesChange={changed => { if (Object.prototype.hasOwnProperty.call(changed, "subscriptionId")) subscriptionTouched.current = true; }} onFinish={submit}>
        <Divider orientation="left" orientationMargin={0} style={{ marginTop: 0 }}><Text type="secondary" style={{ fontSize: 12 }}>续费详情</Text></Divider>
        <Flex gap={16} wrap="wrap">
          <Form.Item name="purchasedAt" label="续费日期" rules={[{ required: true, message: "请选择续费日期" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <DatePicker {...inModalPickerProps} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="actualPaid" label="总消费金额" rules={[{ required: true, message: "请输入总消费金额" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <Input type="number" min="0" step="0.01" placeholder="0.00" />
          </Form.Item>
        </Flex>
        <Form.Item name="duration" label="续费时长" style={{ marginTop: 16, marginBottom: 0 }}>
          <DurationRadio purchasedAt={user.expiresAt && purchasedAt && new Date(user.expiresAt) > purchasedAt.toDate() ? user.expiresAt : purchasedAt} />
        </Form.Item>
        {duration === "custom" && (
          <Form.Item name="expiresAt" label="到期日期" rules={[{ required: true, message: "请选择到期日期" }]} style={{ marginTop: 16, marginBottom: 0 }}>
            <DatePicker {...inModalPickerProps} style={{ width: "100%" }} />
          </Form.Item>
        )}
        <Divider orientation="left" orientationMargin={0}><Text type="secondary" style={{ fontSize: 12 }}>投递模式</Text></Divider>
        {recommendLoading ? <Flex justify="center" align="center" style={{ padding: "48px 0" }}><Spin indicator={<LoadingOutlined spin />} tip="正在匹配推荐订阅池..." /></Flex> : (
          <OutputModeSection form={form} initialOutputMode={initialOutputMode} subscriptions={subscriptions} recommended={recommended} recommendReason={recommendReason} showRecommendation vendors={vendors} userExpiresAt={renewalExpiresAt} />
        )}
        <div style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" block>确认续费</Button>
        </div>
      </Form>
    </FormModal>
  );
}

// 鈹€鈹€鈹€ Users Page 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const p = usePalette();
  const screens = Grid.useBreakpoint();
  const { users, subscriptions, bills } = useData();

  const user = users.find(u => u.id === id);
  if (!user) return <PageSection title="用户详情"><Empty description="未找到该用户。" /></PageSection>;

  const subscription = subscriptions.find(s => s.id === user.subscriptionId);
  const lvl = user.level || (user.actualPaid <= 300 ? "vip1" : user.actualPaid <= 1000 ? "vip2" : "vip3");
  const isMobile = !screens.md;

  const keyStyle = { color: p.textMuted, fontSize: 13 };
  const valueStyle = { fontSize: 13, fontWeight: 500 };

  const userBills = bills.filter(b => b.userId === user.id).slice().sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  const billCols = [
    { title: "时间", dataIndex: "occurredAt", render: v => formatDateTime(v), width: 160 },
    { title: "类型", render: (_, b) => billTypeLabels[b.type] || b.type, width: 80 },
    { title: "金额", render: (_, b) => formatMoney(b.amount), width: 100 },
    { title: "时长", render: (_, b) => durationLabels[b.duration] || b.duration || "-", width: 100 },
    { title: "状态", render: (_, b) => b.reversedAt ? "已冲销" : "有效", width: 80 }
  ];

  const fallbackCols = [
    { title: "时间", dataIndex: "at", render: v => formatDateTime(v), width: 160 },
    { title: "原池", dataIndex: "fromSubscriptionLabel", ellipsis: true, width: 160 },
    { title: "新池", dataIndex: "toSubscriptionLabel", ellipsis: true, width: 160 },
    { title: "原因", dataIndex: "reasonText", width: 180 }
  ];

  const logs = (user.fallbackLogs || []).slice().sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <div className="detail-page" style={{ color: p.text }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <Button size="small" onClick={() => navigate("/users")} style={{ marginBottom: 10, borderRadius: 6 }}>返回用户列表</Button>
          <Title level={2} style={{ margin: 0, fontSize: isMobile ? 26 : 34, fontWeight: 900, letterSpacing: -1, lineHeight: 1.1 }}>
            用户详情
          </Title>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Card>
          <Text strong style={{ fontSize: 16, fontWeight: 700, display: "block", marginBottom: 16 }}>基本信息</Text>
          <div style={{ display: "grid", gap: 12 }}>
            {[
              ["用户 ID", user.userId || "-"],
              ["微信名", user.wechatName || "-"],
              ["iMessage", user.imessageId || "-"],
              ["VIP 等级", <VipTag key="vip" level={lvl} />],
              ["状态", <StatusBadge key="status" status={userStatus(user)} />],
              ["到期时间", formatUserExpiry(user)],
              ["时长", durationLabels[user.duration] || "Unknown"],
              ["购买日期", formatDate(user.purchasedAt)],
              ["总消费金额", formatMoney(user.actualPaid)],
              ["客户端链接", <UrlText key="url" value={userClientSubscriptionUrl(user)} />]
            ].map(([label, value]) => (
              <div key={label} style={{ display: "grid", gridTemplateColumns: "100px minmax(0,1fr)", gap: 12, alignItems: "start" }}>
                <Text style={keyStyle}>{label}</Text>
                <div style={valueStyle}>{value}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <Text strong style={{ fontSize: 16, fontWeight: 700, display: "block", marginBottom: 16 }}>引用池 URL</Text>
          {subscription ? (
            <div style={{ display: "grid", gap: 12 }}>
              {[
                ["名称", subscription.email || subscription.name || "未命名"],
                ["供应商", serviceProviderLabel(subscription)],
                ["URL", <UrlText key="pool-url" value={subscription.url} />],
                ["到期时间", subscription.metrics?.expireAt ? formatDate(subscription.metrics.expireAt) : "-"],
                ["剩余流量", formatBytes(subscription.metrics?.remainingBytes)],
                ["状态", <StatusBadge key="status" status={subscription.status} />]
              ].map(([label, value]) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "100px minmax(0,1fr)", gap: 12, alignItems: "start" }}>
                  <Text style={keyStyle}>{label}</Text>
                  <div style={valueStyle}>{value}</div>
                </div>
              ))}
              <Button size="small" style={{ marginTop: 8, borderRadius: 6, width: "fit-content" }} onClick={() => navigate(`/urls/detail/${subscription.id}`)}>查看池详情</Button>
            </div>
          ) : (
            <Empty description="未绑定池 URL" />
          )}
        </Card>

        <Card>
          <Text strong style={{ fontSize: 16, fontWeight: 700, display: "block", marginBottom: 16 }}>订单记录</Text>
          {userBills.length > 0 ? (
            <Table
              size="small"
              rowKey="id"
              columns={billCols}
              dataSource={userBills}
              pagination={userBills.length > 10 ? { pageSize: 10 } : false}
              scroll={{ x: 520 }}
            />
          ) : (
            <Empty description="暂无订单记录" />
          )}
        </Card>

        <Card>
          <Text strong style={{ fontSize: 16, fontWeight: 700, display: "block", marginBottom: 16 }}>Fallback 切换日志</Text>
          {logs.length > 0 ? (
            <Table
              size="small"
              rowKey="id"
              columns={fallbackCols}
              dataSource={logs}
              pagination={logs.length > 10 ? { pageSize: 10 } : false}
              scroll={{ x: 660 }}
            />
          ) : (
            <Empty description="暂无切换记录" />
          )}
        </Card>
      </div>
    </div>
  );
}

function UserCards({ users: list, actions }) {
  const p = usePalette();
  if (!list.length) return <Empty description="无匹配用户。" />;
  return (
    <Flex vertical gap={0}>
      {list.map(user => (
        <div key={user.id} style={{ padding: 16, borderBottom: `1px solid ${p.border}` }}>
          <Flex justify="space-between" gap={12} align="center" style={{ marginBottom: 4 }}>
            <Flex align="center" gap={6}>
              <Text strong style={{ fontSize: 15 }}>{user.userId}</Text>
              {(() => { const lvl = user.level || (user.actualPaid <= 300 ? "vip1" : user.actualPaid <= 1000 ? "vip2" : "vip3"); return <VipTag level={lvl} />; })()}
            </Flex>
            <StatusBadge status={userStatus(user)} />
          </Flex>
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userClientSubscriptionUrl(user)}</Text>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", padding: "12px 0", borderTop: `1px solid ${p.border}` }}>
            {[["到期", formatUserExpiry(user)], ["时长", durationLabels[user.duration] || "Unknown"], ["消费", formatMoney(user.actualPaid)], ["购买", formatDate(user.purchasedAt)]].map(([label, value]) => (
              <div key={label}>
                <Text type="secondary" style={{ fontSize: 12, display: "block" }}>{label}</Text>
                <Text strong style={{ fontSize: 13 }}>{value}</Text>
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 2 }}>{actions(user)}</div>
        </div>
      ))}
    </Flex>
  );
}

function UsersPage() {
  const { users, subscriptions, reload, runAsync, busy } = useData();
  const { notification } = AntApp.useApp();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(null);
  const [renewing, setRenewing] = useState(null);
  const [vipFilter, setVipFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [page, setPage] = useState(1);
  const mobile = useResponsiveList();

  const visible = users.filter(u => {
    if (keyword && !`${u.userId || ""} ${u.wechatName || ""} ${u.imessageId || ""} ${u.subscription?.url || ""} ${u.subscription?.email || ""}`.toLowerCase().includes(keyword.toLowerCase())) return false;
    if (vipFilter) { const lvl = u.level || (u.actualPaid <= 300 ? "vip1" : u.actualPaid <= 1000 ? "vip2" : "vip3"); if (lvl !== vipFilter) return false; }
    if (statusFilter && userStatus(u) !== statusFilter) return false;
    return true;
  });

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
        {!compact && <Button {...bp} icon={<CopyOutlined />} onClick={() => copyText(userClientSubscriptionUrl(user)).then(() => notification.success({ message: "已复制", placement: "bottomRight" }))}>复制链接</Button>}
        <Button {...bp} icon={<EyeOutlined />} onClick={() => navigate(`/users/detail/${user.id}`)}>查看</Button>
        <Button {...bp} icon={<RetweetOutlined />} onClick={() => setRenewing(user)}>续费</Button>
        <Button {...bp} icon={<EditOutlined />} onClick={() => setEditing(user)}>编辑</Button>
        <Button {...bp} danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "删除用户", content: "确认删除该用户？", onOk: () => mutate(() => fetchJson(`/api/users/${user.id}`, { method: "DELETE" })) })}>删除</Button>
      </Wrap>
    );
  };

  const pageSize = 20;
  const columns = [
    { title: "#", render: (_, __, i) => (page - 1) * pageSize + i + 1, width: 48 },
    { title: "用户 ID", dataIndex: "userId", width: 120, render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: "VIP", width: 72, render: (_, u) => { const lvl = u.level || (u.actualPaid <= 300 ? "vip1" : u.actualPaid <= 1000 ? "vip2" : "vip3"); return <VipTag level={lvl} />; } },
    { title: "状态", render: (_, u) => <StatusBadge status={userStatus(u)} />, width: 76 },
    { title: "到期时间", render: (_, u) => formatUserExpiry(u), width: 104 },
    { title: "时长", render: (_, u) => durationLabels[u.duration] || "Unknown", width: 72 },
    { title: "总消费金额", render: (_, u) => formatMoney(u.actualPaid), width: 88 },
    { title: "客户端链接", render: (_, u) => <UrlText value={userClientSubscriptionUrl(u)} />, width: 560 },
    { title: "绑定邮箱", render: (_, u) => { const email = u.subscription?.email; const vendor = serviceProviderLabel(u.subscription); return email ? <span><VendorTag name={vendor} />{email}</span> : ""; }, width: 280 },
    { title: "购买日期", render: (_, u) => formatDate(u.purchasedAt), width: 104 },
    { title: "操作", render: (_, u) => actions(u, true), width: 190 }
  ].map(col => ({ ...col, onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }), onCell: () => ({ style: { whiteSpace: "nowrap" } }) }));
  const userTable = useResizableCols(columns, "users-v2");

  return (
    <ManagementSection
      title="Users"
      actions={
        <>
          <ToolbarSearch placeholder="搜索用户、邮箱或链接" style={{ width: 220 }} onSearch={setKeyword} onChange={e => { setKeyword(e.target.value); setPage(1); }} />
          <Select allowClear placeholder="VIP 等级" style={{ width: 110 }} value={vipFilter} onChange={v => { setVipFilter(v || null); setPage(1); }} options={[{ value: "vip1", label: "VIP 1" }, { value: "vip2", label: "VIP 2" }, { value: "vip3", label: "VIP 3" }]} />
          <Select allowClear placeholder="状态" style={{ width: 110 }} value={statusFilter} onChange={v => { setStatusFilter(v || null); setPage(1); }} options={[{ value: "ok", label: "正常" }, { value: "warning", label: "即将到期" }, { value: "expired", label: "已到期" }]} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>
            新建用户
          </Button>
        </>
      }
    >
      <div>
        {mobile
          ? <UserCards users={visible} actions={actions} />
          : <Table className="plain-detail-table user-flat-table saas-data-table" size="middle" rowKey="id" columns={userTable.columns} components={userTable.components} dataSource={visible} pagination={{ pageSize, current: page, onChange: setPage, showSizeChanger: false }} scroll={{ x: Math.max(1380, userTable.scrollX) }} />
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
    <Flex vertical gap={0}>
        <div style={{ padding: 16, borderBottom: `1px solid ${p.border}` }}>
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>筛选合计</Text>
          <Text strong style={{ fontSize: 20 }}>{formatMoney(total)}</Text>
        </div>
      {!bills.length && <Empty description="无匹配账单。" />}
      {bills.map(bill => (
        <div key={bill.id} style={{ padding: 16, borderBottom: `1px solid ${p.border}` }}>
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
        </div>
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
      title="Bills"
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

function PlaceholderTagSelect() {
  const { placeholderNodes } = useData();
  const options = placeholderNodes
    .filter(p => p.tag !== "default")
    .map(p => ({ label: `${p.tag}（${p.nodes.length}个节点）`, value: p.tag }));
  return (
    <Flex vertical gap={8}>
      <Form.Item name="showUserInfo" valuePropName="checked" style={{ marginBottom: 0 }}>
        <Checkbox>显示用户信息</Checkbox>
      </Form.Item>
      <Form.Item name="useDefaultPlaceholder" valuePropName="checked" style={{ marginBottom: 0 }}>
        <Checkbox>使用默认占位节点（default）</Checkbox>
      </Form.Item>
      <Form.Item name="placeholderTag" style={{ marginBottom: 0 }}>
        <Select placeholder="额外占位节点标签（选填）" allowClear options={options} {...inModalSelectProps} />
      </Form.Item>
    </Flex>
  );
}

function EmbyUserForm({ item, onClose, onSaved }) {
  const { runAsync } = useData();
  const [form] = Form.useForm();

  async function submit(values) {
    await runAsync(async () => {
      const payload = {
        customerName: values.customerName,
        serverUrl: values.serverUrl,
        username: values.username,
        password: values.password,
        purchasedAt: values.purchasedAt ? values.purchasedAt.format("YYYY-MM-DD") : null,
        expiresAt: values.expiresAt ? values.expiresAt.format("YYYY-MM-DD") : null,
        cost: values.cost,
        actualPaid: values.actualPaid,
        note: values.note || ""
      };
      if (item.id) {
        await putJson(`/api/emby-users/${item.id}`, payload);
      } else {
        await postJson("/api/emby-users", payload);
      }
      onSaved();
    }, item.id ? "正在保存..." : "正在创建...");
  }

  return (
    <FormModal title={item.id ? "编辑 Emby 用户" : "新建 Emby 用户"} onCancel={onClose} open width={600}>
      <Form form={form} layout="vertical" initialValues={{
        customerName: item.customerName || "",
        serverUrl: item.serverUrl || "",
        username: item.username || "",
        password: item.password || "",
        purchasedAt: item.purchasedAt ? dayjs(item.purchasedAt) : dayjs(),
        expiresAt: item.expiresAt ? dayjs(item.expiresAt) : null,
        cost: item.cost ?? "",
        actualPaid: item.actualPaid ?? "",
        note: item.note || ""
      }} onFinish={submit}>
        <Flex wrap gap={12}>
          <Form.Item name="customerName" label="客户名称" rules={[{ required: true, message: "请输入客户名称" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <Input />
          </Form.Item>
          <Form.Item name="serverUrl" label="服务器地址" rules={[{ required: true, message: "请输入服务器地址" }]} style={{ marginBottom: 0, flex: "1 1 220px" }}>
            <Input placeholder="http://example.com:8096" />
          </Form.Item>
        </Flex>
        <Flex wrap gap={12} style={{ marginTop: 16 }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <Input.Password />
          </Form.Item>
        </Flex>
        <Flex wrap gap={12} style={{ marginTop: 16 }}>
          <Form.Item name="purchasedAt" label="购买日期" style={{ marginBottom: 0, flex: "1 1 140px" }}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="expiresAt" label="到期时间" style={{ marginBottom: 0, flex: "1 1 140px" }}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
        </Flex>
        <Flex wrap gap={12} style={{ marginTop: 16 }}>
          <Form.Item name="cost" label="采购成本" style={{ marginBottom: 0, flex: "1 1 120px" }}>
            <Input type="number" min={0} step={0.01} />
          </Form.Item>
          <Form.Item name="actualPaid" label="客户付款" style={{ marginBottom: 0, flex: "1 1 120px" }}>
            <Input type="number" min={0} step={0.01} />
          </Form.Item>
        </Flex>
        <Form.Item name="note" label="备注" style={{ marginTop: 16, marginBottom: 0 }}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Button type="primary" htmlType="submit" block style={{ marginTop: 20 }}>{item.id ? "保存" : "创建"}</Button>
      </Form>
    </FormModal>
  );
}

function EmbyPage() {
  const { embyUsers, reload, runAsync, busy } = useData();
  const { notification } = AntApp.useApp();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(null);
  const mobile = useResponsiveList();

  const visible = embyUsers.filter(u => {
    const hay = `${u.customerName || ""} ${u.serverUrl || ""} ${u.username || ""} ${u.note || ""}`.toLowerCase();
    return hay.includes(keyword.toLowerCase());
  });

  async function mutate(run) {
    await runAsync(async () => {
      try { await run(); await reload(["embyUsers"]); }
      catch (e) { notification.error({ message: "操作失败", description: e.message, placement: "bottomRight" }); }
    }, "Processing...");
  }

  function embyUserStatus(u) {
    if (!u.expiresAt) return "ok";
    const diff = dayjs(u.expiresAt).diff(dayjs(), "day");
    if (diff < 0) return "expired";
    if (diff < 7) return "warning";
    return "ok";
  }

  const actions = (item, compact = false) => {
    const Wrap = compact ? InlineActions : CardActions;
    const bp = compact ? { size: "small", style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy } : { style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy };
    return (
      <Wrap>
        <Button {...bp} icon={<EditOutlined />} onClick={() => setEditing(item)}>编辑</Button>
        <Button {...bp} danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "删除 Emby 用户", content: `确认删除「${item.customerName}」？`, onOk: () => mutate(() => fetchJson(`/api/emby-users/${item.id}`, { method: "DELETE" })) })}>删除</Button>
      </Wrap>
    );
  };

  const columns = [
    { title: "#", render: (_, __, i) => i + 1, width: 48 },
    { title: "客户", dataIndex: "customerName", width: 120, render: v => <Text strong style={{ fontWeight: 600 }}>{v}</Text> },
    { title: "服务器", dataIndex: "serverUrl", ellipsis: true, width: 200 },
    { title: "用户名", dataIndex: "username", width: 120 },
    { title: "到期时间", render: (_, u) => u.expiresAt ? formatDate(u.expiresAt) : "-", width: 104 },
    { title: "客户付款", render: (_, u) => formatMoney(u.actualPaid), width: 88 },
    { title: "状态", render: (_, u) => <StatusBadge status={embyUserStatus(u)} />, width: 80 },
    { title: "操作", render: (_, u) => actions(u, true), width: 150 }
  ].map(col => ({ ...col, onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }), onCell: () => ({ style: { whiteSpace: "nowrap" } }) }));

  const embyTable = useResizableCols(columns, "emby-users");

  return (
    <ManagementSection
      title="Emby 服务"
      actions={
        <Flex gap={8} align="center" wrap>
          <Input prefix={<SearchOutlined />} placeholder="搜索..." allowClear value={keyword} onChange={e => setKeyword(e.target.value)} style={{ width: 180 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>添加</Button>
        </Flex>
      }
    >
      {mobile
        ? <Flex vertical gap={0}>
            {!visible.length && <Empty description="暂无 Emby 用户。" />}
            {visible.map(item => (
              <div key={item.id} style={{ padding: 16, borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
                <Flex justify="space-between" gap={12} align="center" style={{ marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 15 }}>{item.customerName}</Text>
                  <StatusBadge status={embyUserStatus(item)} />
                </Flex>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.serverUrl}</Text>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", padding: "12px 0", borderTop: "1px solid var(--ant-color-border-secondary)" }}>
                  {[["用户名", item.username], ["到期", item.expiresAt ? formatDate(item.expiresAt) : "-"], ["付款", formatMoney(item.actualPaid)], ["购买", formatDate(item.purchasedAt)]].map(([label, value]) => (
                    <div key={label}>
                      <Text type="secondary" style={{ fontSize: 12, display: "block" }}>{label}</Text>
                      <Text strong style={{ fontSize: 13 }}>{value}</Text>
                    </div>
                  ))}
                </div>
                <div style={{ paddingTop: 2 }}>{actions(item)}</div>
              </div>
            ))}
          </Flex>
        : <Table
            className="plain-detail-table"
            size="small"
            rowKey="id"
            columns={embyTable.columns}
            components={embyTable.components}
            dataSource={visible}
            pagination={visible.length > 20 ? { pageSize: 20 } : false}
            scroll={{ x: Math.max(910, embyTable.scrollX) }}
          />
      }
      {editing && <EmbyUserForm item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(["embyUsers"]); }} />}
    </ManagementSection>
  );
}

function SubconverterPage() {
  return (
    <Flex vertical gap={24}>
      <VendorPresetSection />
      <PlaceholderNodesSection />
    </Flex>
  );
}

function PlaceholderNodesSection() {
  const { placeholderNodes, reload, runAsync, busy } = useData();
  const { notification } = AntApp.useApp();
  const mobile = useResponsiveList();
  const [editing, setEditing] = useState(null);

  async function mutate(run) {
    await runAsync(async () => {
      try { await run(); await reload(["placeholderNodes"]); }
      catch (e) { notification.error({ message: "操作失败", description: e.message, placement: "bottomRight" }); }
    }, "处理中...");
  }

  function handleDelete(item) {
    Modal.confirm({
      title: "删除占位节点组",
      content: `确认删除标签「${item.tag}」及其所有节点？`,
      onOk: () => mutate(() => deleteJson(`/api/placeholder-nodes/${item.id}`))
    });
  }

  const columns = [
    { title: "标签", dataIndex: "tag", key: "tag", width: 150 },
    {
      title: "节点列表", dataIndex: "nodes", key: "nodes",
      render: nodes => (
        <Flex wrap gap={4}>
          {(nodes || []).map((n, i) => <Tag key={i}>{n}</Tag>)}
          {(!nodes || !nodes.length) && <Text type="secondary">无节点</Text>}
        </Flex>
      )
    },
    {
      title: "操作", key: "actions", width: 140,
      render: (_, record) => (
        <InlineActions>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(record)} disabled={!!busy}>编辑</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} disabled={!!busy}>删除</Button>
        </InlineActions>
      )
    }
  ];

  return (
    <SectionCard title="占位节点" extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setEditing({})}>新增</Button>}>
      {mobile
        ? <Flex vertical gap={12}>
            {placeholderNodes.map(item => (
              <Card key={item.id} pad={12}>
                <Flex vertical gap={8}>
                  <Flex justify="space-between" align="center">
                    <Text strong>{item.tag}</Text>
                    <InlineActions>
                      <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(item)} disabled={!!busy} />
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(item)} disabled={!!busy} />
                    </InlineActions>
                  </Flex>
                  <Flex wrap gap={4}>
                    {(item.nodes || []).map((n, i) => <Tag key={i}>{n}</Tag>)}
                  </Flex>
                </Flex>
              </Card>
            ))}
            {!placeholderNodes.length && <Empty description="暂无占位节点组" />}
          </Flex>
        : <Table dataSource={placeholderNodes} columns={columns} rowKey="id" pagination={false} size="small" />
      }
      {editing !== null && (
        <PlaceholderNodeFormModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(["placeholderNodes"]); }}
          mutate={mutate}
        />
      )}
    </SectionCard>
  );
}

function PlaceholderNodeFormModal({ item, onClose, onSaved, mutate }) {
  const [form] = Form.useForm();
  const isEdit = Boolean(item.id);

  async function submit(values) {
    const nodes = (values.nodesText || "").split("\n").map(s => s.trim()).filter(Boolean);
    const payload = { tag: values.tag, nodes };
    await mutate(async () => {
      if (isEdit) {
        await putJson(`/api/placeholder-nodes/${item.id}`, payload);
      } else {
        await postJson("/api/placeholder-nodes", payload);
      }
    });
    onSaved();
  }

  return (
    <FormModal title={isEdit ? "编辑占位节点组" : "新增占位节点组"} open onCancel={onClose}>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ tag: item.tag || "", nodesText: (item.nodes || []).join("\n") }}
        onFinish={submit}
      >
        <Form.Item name="tag" label="标签名" rules={[{ required: true, message: "请输入标签名" }]}>
          <Input placeholder="如：vip、notice、ads" />
        </Form.Item>
        <Form.Item name="nodesText" label="节点名称（每行一个）" rules={[{ required: true, message: "请至少填写一个节点名" }]}>
          <TextArea rows={6} placeholder={"广告位A\n续费提醒\n通知节点"} />
        </Form.Item>
        <div style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" block>保存</Button>
        </div>
      </Form>
    </FormModal>
  );
}

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
  const activeUsers = users.filter(item => userStatus(item) !== "expired");
  const activeUserPct = users.length ? Math.round((activeUsers.length / users.length) * 100) : 0;
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
    { label: "池URL数", value: totalUrls, hint: `${activeUrls} 活跃订阅` },
    { label: "用户", value: users.length, hint: `${expiringUsers.length} 即将到期` },
    { label: "活跃用户", value: activeUsers.length, hint: `占比 ${activeUserPct}%` },
    { label: "本月收入", value: formatMoney(monthIncome), hint: `今日 ${formatMoney(todayIncome)}` },
    { label: "总收入", value: formatMoney(paidTotal), hint: `共 ${activeBills.length} 笔账单` },
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

