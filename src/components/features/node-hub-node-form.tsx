import * as React from "react"
import { KeyRound } from "lucide-react"

import { postJson } from "@/api"
import { toast } from "@/components/features/toast"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { NumberField } from "@/components/arc/number-field/number-field"
import { Select } from "@/components/arc/select/select"
import { Switch } from "@/components/arc/switch/switch"
import { Textarea } from "@/components/arc/textarea/textarea"
import type { NodeHubMachine, NodeHubNode, NodeHubProtocol } from "@/types"

// The node editor for node-hub. Settings follow Xboard's protocol_settings (snake_case), the shape
// node-hub/node-config.js validates; fields the form does not show stay in the draft untouched.

type Settings = Record<string, unknown>

export type NodeHubNodeDraft = Pick<NodeHubNode, "machineId" | "name" | "protocol" | "host" | "serverPort" | "listenIp" | "enabled" | "sortOrder" | "region" | "networkLevel" | "inboundType"> & { settings: Settings }

export const NODE_HUB_PROTOCOLS: { value: NodeHubProtocol; label: string }[] = [
  { value: "vless", label: "VLESS" },
  { value: "vmess", label: "VMess" },
  { value: "trojan", label: "Trojan" },
  { value: "shadowsocks", label: "Shadowsocks" },
  { value: "hysteria", label: "Hysteria2" },
  { value: "tuic", label: "TUIC" },
  { value: "anytls", label: "AnyTLS" },
]

export const NODE_HUB_NETWORK_LEVELS = [
  { value: "premium", label: "精品线路" },
  { value: "optimized", label: "优化线路" },
  { value: "standard", label: "普通线路" },
] as const

const networks = ["tcp", "ws", "grpc", "h2", "httpupgrade", "xhttp"].map(value => ({ value, label: value === "httpupgrade" ? "HTTPUpgrade" : value === "xhttp" ? "XHTTP" : value.toUpperCase() }))
const ssCiphers = ["2022-blake3-aes-128-gcm", "2022-blake3-aes-256-gcm", "2022-blake3-chacha20-poly1305", "aes-128-gcm", "aes-192-gcm", "aes-256-gcm", "chacha20-ietf-poly1305", "xchacha20-ietf-poly1305"].map(value => ({ value, label: value }))
const fingerprints = ["chrome", "firefox", "safari", "ios", "edge", "random"].map(value => ({ value, label: value }))
const certModes = [
  { value: "none", label: "不由节点管理" },
  { value: "http", label: "ACME HTTP-01" },
  { value: "dns", label: "ACME DNS-01" },
  { value: "self", label: "自签名" },
  { value: "file", label: "服务器上的文件" },
  { value: "content", label: "直接粘贴证书" },
]
// Keys kept in the advanced JSON box: lists and objects the form has no fields for.
const ADVANCED_KEYS = ["multiplex", "custom_outbounds", "custom_routes", "custom_route_rules"] as const

export function protocolLabel(protocol: string) {
  return NODE_HUB_PROTOCOLS.find(item => item.value === protocol)?.label || protocol
}

/** TLS / REALITY tag for a node, for tables. */
export function nodeSecurityLabel(node: Pick<NodeHubNode, "protocol" | "settings">) {
  if (["hysteria", "tuic", "anytls"].includes(node.protocol)) return "TLS"
  const tls = Number(node.settings?.tls ?? 0)
  return tls === 2 ? "REALITY" : tls === 1 ? "TLS" : ""
}

export function defaultNodeSettings(protocol: NodeHubProtocol): Settings {
  switch (protocol) {
    case "vless": return { network: "tcp", tls: 2, flow: "xtls-rprx-vision", reality_settings: { server_name: "www.microsoft.com", server_port: 443, private_key: "", short_id: "" } }
    case "vmess": return { network: "tcp", tls: 0 }
    case "trojan": return { network: "tcp", tls: 1, tls_settings: { server_name: "" } }
    case "shadowsocks": return { cipher: "2022-blake3-aes-128-gcm" }
    case "hysteria": return { version: 2, tls: { server_name: "" }, bandwidth: { up: 0, down: 0 }, obfs: { open: false, type: "salamander", password: "" } }
    case "tuic": return { tls: { server_name: "" }, congestion_control: "bbr", alpn: ["h3"] }
    case "anytls": return { tls: { server_name: "" }, padding_scheme: [] }
  }
}

export function emptyNodeDraft(machineId = 0): NodeHubNodeDraft {
  return { machineId, name: "", protocol: "vless", host: "", serverPort: 443, listenIp: "0.0.0.0", enabled: true, sortOrder: 1, region: "", networkLevel: "", inboundType: "package", settings: defaultNodeSettings("vless") }
}

export function nodeDraftFrom(node: NodeHubNode): NodeHubNodeDraft {
  const { machineId, name, protocol, host, serverPort, listenIp, enabled, sortOrder, region, networkLevel, inboundType } = node
  return { machineId, name, protocol, host, serverPort, listenIp, enabled, sortOrder, region, networkLevel, inboundType, settings: structuredClone(node.settings || {}) }
}

/** The advanced JSON box's text for a node's settings, empty when none of its keys are set. */
export function advancedSettingsText(settings: Settings) {
  const picked = Object.fromEntries(ADVANCED_KEYS.filter(key => settings[key] !== undefined).map(key => [key, settings[key]]))
  return Object.keys(picked).length ? JSON.stringify(picked, null, 2) : ""
}

/** Merges the advanced JSON box back into the settings; throws a message for the field when it is not a JSON object. */
export function applyAdvancedSettings(settings: Settings, text: string): Settings {
  const next = { ...settings }
  for (const key of ADVANCED_KEYS) delete next[key]
  if (!text.trim()) return next
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error("不是有效的 JSON。") }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("需要一个 JSON 对象，例如 {\"custom_route_rules\": []}。")
  const unknownKeys = Object.keys(parsed).filter(key => !(ADVANCED_KEYS as readonly string[]).includes(key))
  if (unknownKeys.length) throw new Error(`不支持的字段：${unknownKeys.join("、")}。只能填写 ${ADVANCED_KEYS.join("、")}。`)
  return { ...next, ...parsed }
}

function read(settings: Settings, path: string[]): unknown {
  return path.reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Settings)[key] : undefined, settings)
}

function write(settings: Settings, path: string[], value: unknown): Settings {
  const next = structuredClone(settings)
  let cursor: Settings = next
  for (const key of path.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) cursor[key] = {}
    cursor = cursor[key] as Settings
  }
  const last = path[path.length - 1]
  if (value === undefined) delete cursor[last]
  else cursor[last] = value
  return next
}

const str = (value: unknown) => value === undefined || value === null ? "" : String(value)

function SwitchField({ id, label, description, checked, onCheckedChange }: { id: string; label: string; description?: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <Field orientation="horizontal" className="justify-between"><FieldContent><FieldLabel htmlFor={id}>{label}</FieldLabel>{description ? <FieldDescription>{description}</FieldDescription> : null}</FieldContent><Switch id={id} checked={checked} onCheckedChange={onCheckedChange} /></Field>
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="grid gap-3"><h3 className="text-sm font-semibold">{title}</h3><div className="grid items-start gap-3 sm:grid-cols-2">{children}</div></section>
}

export function NodeHubNodeForm({ draft, onChange, machines, advancedText, onAdvancedTextChange, advancedError, creating }: {
  draft: NodeHubNodeDraft
  onChange: (draft: NodeHubNodeDraft) => void
  machines: NodeHubMachine[]
  advancedText: string
  onAdvancedTextChange: (text: string) => void
  advancedError?: string
  creating: boolean
}) {
  const [generating, setGenerating] = React.useState(false)
  const s = draft.settings
  const set = (path: string[], value: unknown) => onChange({ ...draft, settings: write(draft.settings, path, value) })
  const field = <K extends keyof NodeHubNodeDraft>(key: K, value: NodeHubNodeDraft[K]) => onChange({ ...draft, [key]: value })
  const protocol = draft.protocol
  const streamProtocol = protocol === "vless" || protocol === "vmess" || protocol === "trojan"
  const tls = Number(s.tls ?? (protocol === "trojan" ? 1 : 0))
  const network = str(s.network || "tcp")
  // Hysteria2, TUIC and AnyTLS keep their TLS block under settings.tls; the stream protocols use tls_settings.
  const tlsPath = streamProtocol ? ["tls_settings"] : ["tls"]
  const needsCertificate = streamProtocol ? tls === 1 : true
  const certMode = str(read(s, ["cert_config", "cert_mode"]) || "none")

  async function generateRealityKeys() {
    setGenerating(true)
    try {
      const keys = await postJson<{ privateKey: string; publicKey: string; shortId: string }>("/api/node-hub/reality-keypair")
      onChange({ ...draft, settings: write(write(write(draft.settings, ["reality_settings", "private_key"], keys.privateKey), ["reality_settings", "public_key"], keys.publicKey), ["reality_settings", "short_id"], keys.shortId) })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "生成密钥失败" })
    } finally {
      setGenerating(false)
    }
  }

  // The connection address follows the machine's address until the admin types their own.
  function changeMachine(machineId: number) {
    const previousHost = machines.find(machine => machine.id === draft.machineId)?.host || ""
    const host = !draft.host || draft.host === previousHost ? machines.find(machine => machine.id === machineId)?.host || "" : draft.host
    onChange({ ...draft, machineId, host })
  }

  function changeProtocol(next: NodeHubProtocol) {
    const keep = Object.fromEntries(["kernel_type", "cert_config", ...ADVANCED_KEYS].filter(key => draft.settings[key] !== undefined).map(key => [key, draft.settings[key]]))
    onChange({ ...draft, protocol: next, settings: { ...defaultNodeSettings(next), ...keep } })
  }

  function changeTls(next: number) {
    let settings = write(draft.settings, ["tls"], next)
    if (next === 2 && !read(settings, ["reality_settings"])) settings = write(settings, ["reality_settings"], { server_name: "www.microsoft.com", server_port: 443, private_key: "", short_id: "" })
    if (next === 1 && !read(settings, ["tls_settings"])) settings = write(settings, ["tls_settings"], { server_name: "" })
    if (next === 0 || network !== "tcp") settings = write(settings, ["flow"], protocol === "vless" ? "" : undefined)
    onChange({ ...draft, settings })
  }

  const tlsOptions = protocol === "vless" ? [{ value: "0", label: "无" }, { value: "1", label: "TLS" }, { value: "2", label: "REALITY" }]
    : protocol === "vmess" ? [{ value: "0", label: "无" }, { value: "1", label: "TLS" }]
    : [{ value: "1", label: "TLS" }, { value: "2", label: "REALITY" }]
  const flowError = protocol === "vless" && s.flow && (network !== "tcp" || tls === 0) ? "xtls-rprx-vision 需要 TCP 传输并启用 TLS 或 REALITY。" : undefined

  return <div className="grid gap-6">
    <FormSection title="基本信息">
      <Select label="所属机器" id="node-machine" className="w-full" value={draft.machineId ? String(draft.machineId) : ""} placeholder="选择机器" onValueChange={value => changeMachine(Number(value))} disabled={!creating} description={creating ? undefined : "节点创建后不能换机器。"} options={machines.map(machine => ({ value: String(machine.id), label: `${machine.name}${machine.host ? ` · ${machine.host}` : ""}` }))} />
      <Select label="协议" id="node-protocol" className="w-full" value={protocol} onValueChange={value => changeProtocol(value as NodeHubProtocol)} disabled={!creating} description={creating ? undefined : "协议创建后不能修改，需要换协议请新建节点。"} options={NODE_HUB_PROTOCOLS} />
      <Input label="节点名称" id="node-name" value={draft.name} onChange={event => field("name", event.target.value)} placeholder="香港 01" maxLength={80} />
      <Input label="连接地址" id="node-host" description="写进用户订阅的域名或 IP。" value={draft.host} onChange={event => field("host", event.target.value.trim())} placeholder="hk.example.com" />
      <NumberField size="md" label="端口" id="node-port" value={draft.serverPort} onValueChange={value => field("serverPort", value)} min={1} max={65535} locale="zh-CN" formatOptions={{ useGrouping: false }} />
      <Input label="监听地址" id="node-listen" description="节点在机器上监听的地址，一般保持 0.0.0.0。" value={draft.listenIp} onChange={event => field("listenIp", event.target.value.trim())} placeholder="0.0.0.0" />
      <Input label="地区" id="node-region" value={draft.region} onChange={event => field("region", event.target.value)} placeholder="例如：香港、美国、台湾" maxLength={64} />
      <Select label="网络级别" id="node-level" className="w-full" value={draft.networkLevel || "unset"} onValueChange={value => field("networkLevel", value === "unset" ? "" : value)} options={[{ value: "unset", label: "未设置" }, ...NODE_HUB_NETWORK_LEVELS.map(level => ({ value: level.value, label: level.label }))]} />
      <Select label="入站类型" id="node-type" className="w-full" value={draft.inboundType} onValueChange={value => field("inboundType", value as "package" | "custom")} description="定制节点只能在用户页单独授权，不参与线路组。" options={[{ value: "package", label: "套餐节点" }, { value: "custom", label: "定制节点" }]} />
      <NumberField size="md" label="排序" id="node-order" value={draft.sortOrder} onValueChange={value => field("sortOrder", value)} min={0} locale="zh-CN" />
      <SwitchField id="node-enabled" label="启用节点" description="停用后机器最长约 1 分钟内停止该节点。" checked={draft.enabled} onCheckedChange={enabled => field("enabled", enabled)} />
      <Select label="内核" id="node-kernel" className="w-full" value={str(s.kernel_type) || "default"} onValueChange={value => set(["kernel_type"], value === "default" ? undefined : value)} description="默认由 xboard-node 自己选择。" options={[{ value: "default", label: "默认" }, { value: "xray", label: "Xray" }, { value: "singbox", label: "sing-box" }]} />
    </FormSection>

    {streamProtocol ? <FormSection title="传输">
      <Select label="传输方式" id="node-network" className="w-full" value={network} onValueChange={value => onChange({ ...draft, settings: write(write(draft.settings, ["network"], value), ["network_settings"], undefined) })} options={networks} />
      {network === "ws" ? <>
        <Input label="路径" id="node-ws-path" value={str(read(s, ["network_settings", "path"]))} onChange={event => set(["network_settings", "path"], event.target.value || undefined)} placeholder="/ws" />
        <Input label="Host 头" id="node-ws-host" value={str(read(s, ["network_settings", "headers", "Host"]))} onChange={event => set(["network_settings", "headers", "Host"], event.target.value || undefined)} placeholder="cdn.example.com" />
      </> : null}
      {network === "grpc" ? <Input label="服务名" id="node-grpc-service" value={str(read(s, ["network_settings", "serviceName"]))} onChange={event => set(["network_settings", "serviceName"], event.target.value || undefined)} placeholder="grpc" /> : null}
      {network === "h2" || network === "httpupgrade" || network === "xhttp" ? <>
        <Input label="路径" id="node-net-path" value={str(read(s, ["network_settings", "path"]))} onChange={event => set(["network_settings", "path"], event.target.value || undefined)} placeholder="/" />
        <Input label="Host" id="node-net-host" value={str(read(s, ["network_settings", "host"]))} onChange={event => set(["network_settings", "host"], event.target.value || undefined)} placeholder="example.com" />
      </> : null}
      {network === "xhttp" ? <Select label="XHTTP 模式" id="node-xhttp-mode" className="w-full" value={str(read(s, ["network_settings", "mode"])) || "auto"} onValueChange={value => set(["network_settings", "mode"], value === "auto" ? undefined : value)} options={["auto", "packet-up", "stream-up", "stream-one"].map(value => ({ value, label: value }))} /> : null}
    </FormSection> : null}

    {streamProtocol ? <FormSection title="安全">
      <Select label="安全类型" id="node-tls" className="w-full" value={String(tls)} onValueChange={value => changeTls(Number(value))} options={tlsOptions} />
      {protocol === "vless" ? <Select label="Flow" id="node-flow" className="w-full" value={str(s.flow) || "none"} onValueChange={value => set(["flow"], value === "none" ? "" : value)} description={flowError} options={[{ value: "none", label: "无" }, { value: "xtls-rprx-vision", label: "xtls-rprx-vision" }]} /> : null}
      {tls === 1 ? <>
        <Input label="证书域名（SNI）" id="node-tls-sni" value={str(read(s, ["tls_settings", "server_name"]))} onChange={event => set(["tls_settings", "server_name"], event.target.value.trim())} placeholder="node.example.com" />
        <SwitchField id="node-tls-insecure" label="允许不安全证书" description="客户端跳过证书校验，只用于自签名证书。" checked={read(s, ["tls_settings", "allow_insecure"]) === true} onCheckedChange={checked => set(["tls_settings", "allow_insecure"], checked || undefined)} />
      </> : null}
      {tls === 2 ? <>
        <Input label="伪装域名（server_name）" id="node-reality-sni" value={str(read(s, ["reality_settings", "server_name"]))} onChange={event => set(["reality_settings", "server_name"], event.target.value.trim())} placeholder="www.microsoft.com" />
        <NumberField size="md" label="伪装目标端口" id="node-reality-port" value={Number(read(s, ["reality_settings", "server_port"]) || 443)} onValueChange={value => set(["reality_settings", "server_port"], value)} min={1} max={65535} locale="zh-CN" formatOptions={{ useGrouping: false }} />
        <Input label="伪装目标（dest）" id="node-reality-dest" description="留空时使用 伪装域名:端口。" value={str(read(s, ["reality_settings", "dest"]))} onChange={event => set(["reality_settings", "dest"], event.target.value.trim() || undefined)} placeholder="www.microsoft.com:443" />
        <Input label="Short ID" id="node-reality-sid" value={str(read(s, ["reality_settings", "short_id"]))} onChange={event => set(["reality_settings", "short_id"], event.target.value.trim())} placeholder="不超过 16 位十六进制" maxLength={16} />
        <Input label="私钥" id="node-reality-private" value={str(read(s, ["reality_settings", "private_key"]))} onChange={event => onChange({ ...draft, settings: write(write(draft.settings, ["reality_settings", "private_key"], event.target.value.trim()), ["reality_settings", "public_key"], undefined) })} placeholder="点击生成密钥对" autoComplete="off" spellCheck={false} />
        <Input label="公钥" id="node-reality-public" description="保存时由私钥推导，写进用户订阅。" value={str(read(s, ["reality_settings", "public_key"]))} readOnly placeholder="保存后生成" />
        <div className="flex items-end sm:col-span-2"><Button variant="secondary" onClick={() => void generateRealityKeys()} loading={generating}><KeyRound />生成密钥对</Button></div>
      </> : null}
      {tls !== 0 ? <Select label="uTLS 指纹" id="node-utls" className="w-full" value={read(s, ["utls", "enabled"]) === false ? "off" : str(read(s, ["utls", "fingerprint"])) || "chrome"} onValueChange={value => set(["utls"], value === "off" ? { enabled: false, fingerprint: "chrome" } : { enabled: true, fingerprint: value })} options={[...fingerprints, { value: "off", label: "关闭" }]} /> : null}
    </FormSection> : null}

    {protocol === "shadowsocks" ? <FormSection title="Shadowsocks">
      <Select label="加密方式" id="node-ss-cipher" className="w-full" value={str(s.cipher) || "2022-blake3-aes-128-gcm"} onValueChange={value => set(["cipher"], value)} description="2022 系列每个用户的密码由 uuid 生成。" options={ssCiphers} />
      <Input label="插件" id="node-ss-plugin" value={str(s.plugin)} onChange={event => set(["plugin"], event.target.value.trim() || null)} placeholder="obfs、v2ray-plugin，可留空" />
      <Input label="插件参数" id="node-ss-plugin-opts" value={str(s.plugin_opts)} onChange={event => set(["plugin_opts"], event.target.value.trim() || null)} placeholder="obfs=http;obfs-host=example.com" />
    </FormSection> : null}

    {!streamProtocol && protocol !== "shadowsocks" ? <FormSection title={`${protocolLabel(protocol)} 设置`}>
      <Input label="证书域名（SNI）" id="node-sni" value={str(read(s, ["tls", "server_name"]))} onChange={event => set(["tls", "server_name"], event.target.value.trim())} placeholder="node.example.com" />
      <SwitchField id="node-insecure" label="允许不安全证书" description="客户端跳过证书校验，只用于自签名证书。" checked={read(s, ["tls", "allow_insecure"]) === true} onCheckedChange={checked => set(["tls", "allow_insecure"], checked || undefined)} />
      {protocol === "hysteria" ? <>
        <NumberField size="md" label="上行带宽" id="node-hy-up" value={Number(read(s, ["bandwidth", "up"]) || 0)} onValueChange={value => set(["bandwidth", "up"], value)} min={0} suffix=" Mbps" description="0 表示不限制。" locale="zh-CN" />
        <NumberField size="md" label="下行带宽" id="node-hy-down" value={Number(read(s, ["bandwidth", "down"]) || 0)} onValueChange={value => set(["bandwidth", "down"], value)} min={0} suffix=" Mbps" description="0 表示不限制。" locale="zh-CN" />
        <SwitchField id="node-hy-obfs" label="Salamander 混淆" checked={read(s, ["obfs", "open"]) === true} onCheckedChange={checked => set(["obfs", "open"], checked)} />
        {read(s, ["obfs", "open"]) === true ? <Input label="混淆密码" id="node-hy-obfs-password" value={str(read(s, ["obfs", "password"]))} onChange={event => set(["obfs", "password"], event.target.value)} autoComplete="off" /> : null}
      </> : null}
      {protocol === "tuic" ? <>
        <Select label="拥塞控制" id="node-tuic-cc" className="w-full" value={str(s.congestion_control) || "bbr"} onValueChange={value => set(["congestion_control"], value)} options={["bbr", "cubic", "new_reno"].map(value => ({ value, label: value }))} />
        <Input label="ALPN" id="node-tuic-alpn" description="多个用英文逗号分隔。" value={Array.isArray(s.alpn) ? s.alpn.join(",") : "h3"} onChange={event => set(["alpn"], event.target.value.split(",").map(item => item.trim()).filter(Boolean))} placeholder="h3" />
      </> : null}
      {protocol === "anytls" ? <div className="sm:col-span-2"><Textarea label="Padding 方案" id="node-anytls-padding" description="每行一条，留空使用默认方案。" value={Array.isArray(s.padding_scheme) ? s.padding_scheme.join("\n") : ""} onChange={event => set(["padding_scheme"], event.target.value.split("\n").map(item => item.trim()).filter(Boolean))} rows={4} /></div> : null}
    </FormSection> : null}

    {needsCertificate && protocol !== "shadowsocks" ? <FormSection title="证书">
      <Select label="证书模式" id="node-cert-mode" className="w-full" value={certMode} onValueChange={value => set(["cert_config"], value === "none" ? undefined : { ...(read(s, ["cert_config"]) as Settings || {}), cert_mode: value })} description="由节点在机器上申请或加载证书。选「不由节点管理」时需要自行在机器上配置证书。" options={certModes} />
      {certMode === "http" || certMode === "dns" ? <>
        <Input label="证书域名" id="node-cert-domain" value={str(read(s, ["cert_config", "domain"]))} onChange={event => set(["cert_config", "domain"], event.target.value.trim())} placeholder="node.example.com" />
        <Input label="ACME 邮箱" id="node-cert-email" type="email" value={str(read(s, ["cert_config", "email"]))} onChange={event => set(["cert_config", "email"], event.target.value.trim())} placeholder="admin@example.com" />
      </> : null}
      {certMode === "http" ? <NumberField size="md" label="HTTP-01 端口" id="node-cert-http-port" value={Number(read(s, ["cert_config", "http_port"]) || 80)} onValueChange={value => set(["cert_config", "http_port"], value)} min={1} max={65535} locale="zh-CN" formatOptions={{ useGrouping: false }} /> : null}
      {certMode === "dns" ? <>
        <Input label="DNS 服务商" id="node-cert-dns-provider" value={str(read(s, ["cert_config", "dns_provider"]))} onChange={event => set(["cert_config", "dns_provider"], event.target.value.trim())} placeholder="cloudflare、alidns" />
        <Textarea label="DNS 环境变量" id="node-cert-dns-env" description="每行一个 KEY=VALUE，例如 CF_DNS_API_TOKEN=..." value={Object.entries((read(s, ["cert_config", "dns_env"]) as Record<string, string>) || {}).map(([key, value]) => `${key}=${value}`).join("\n")} onChange={event => set(["cert_config", "dns_env"], Object.fromEntries(event.target.value.split("\n").map(line => line.split("=")).filter(parts => parts[0]?.trim()).map(([key, ...value]) => [key.trim(), value.join("=").trim()])))} rows={3} spellCheck={false} />
      </> : null}
      {certMode === "file" ? <>
        <Input label="证书文件路径" id="node-cert-file" value={str(read(s, ["cert_config", "cert_file"]))} onChange={event => set(["cert_config", "cert_file"], event.target.value.trim())} placeholder="/etc/ssl/node.crt" />
        <Input label="私钥文件路径" id="node-cert-key-file" value={str(read(s, ["cert_config", "key_file"]))} onChange={event => set(["cert_config", "key_file"], event.target.value.trim())} placeholder="/etc/ssl/node.key" />
      </> : null}
      {certMode === "content" ? <>
        <Textarea label="证书（PEM）" id="node-cert-content" value={str(read(s, ["cert_config", "cert_content"]))} onChange={event => set(["cert_config", "cert_content"], event.target.value)} rows={4} spellCheck={false} />
        <Textarea label="私钥（PEM）" id="node-cert-key-content" value={str(read(s, ["cert_config", "key_content"]))} onChange={event => set(["cert_config", "key_content"], event.target.value)} rows={4} spellCheck={false} />
      </> : null}
    </FormSection> : null}

    <section className="grid gap-3">
      <h3 className="text-sm font-semibold">高级设置</h3>
      <Textarea label="高级设置（JSON）" hideLabel id="node-advanced" description={`可选，JSON 对象，只能包含 ${ADVANCED_KEYS.join("、")}，原样下发给 xboard-node。`} value={advancedText} onChange={event => onAdvancedTextChange(event.target.value)} error={advancedError} rows={5} spellCheck={false} className="font-mono" />
    </section>
  </div>
}
