import React, { useMemo, useState } from "react";
import { App as AntApp, Button, Input } from "antd";
import { CheckCircleOutlined, CopyOutlined, QrcodeOutlined } from "@ant-design/icons";
import { copyText } from "../utils";

const plans = [
  {
    id: "basic",
    name: "BASIC",
    title: "基本套餐",
    subtitle: "普通线路，高峰期易卡顿，仅适合轻量用户做搜索看文档。",
    accent: "#2f8f5b",
    perks: ["每月 100G 流量", "轻量使用", "最多 5 台设备"],
    options: [
      { id: "basic-30", label: "月付", days: "30天", price: 39, traffic: "100G/月", devices: 1 },
      { id: "basic-90", label: "季付", days: "90天", price: 109, traffic: "100G/月", devices: 2 },
      { id: "basic-180", label: "半年付", days: "180天", price: 199, traffic: "100G/月", devices: 3 },
      { id: "basic-360", label: "年付", days: "360天", price: 369, traffic: "100G/月", devices: 3 },
      { id: "basic-unlimited-180", label: "半年付", days: "180天", price: 399, traffic: "无限流量", devices: 5 },
      { id: "basic-unlimited-360", label: "年付", days: "360天", price: 599, traffic: "无限流量", devices: 5 }
    ]
  },
  {
    id: "pro",
    name: "PRO",
    title: "高级套餐",
    subtitle: "优质节点，普通专线连接，稳定 GPT 解锁，流媒体解锁",
    accent: "#2457d6",
    recommended: true,
    perks: ["每月 200G 流量", "优质节点", "最多 8 台设备"],
    options: [
      { id: "pro-30", label: "月付", days: "30天", price: 49, traffic: "200G/月", devices: 3 },
      { id: "pro-90", label: "季付", days: "90天", price: 129, traffic: "200G/月", devices: 3 },
      { id: "pro-180", label: "半年付", days: "180天", price: 229, traffic: "200G/月", devices: 5 },
      { id: "pro-360", label: "年付", days: "360天", price: 429, traffic: "200G/月", devices: 5 },
      { id: "pro-unlimited-180", label: "半年付", days: "180天", price: 439, traffic: "无限流量", devices: 8 },
      { id: "pro-unlimited-360", label: "年付", days: "360天", price: 679, traffic: "无限流量", devices: 8 }
    ]
  },
  {
    id: "ultra",
    name: "ULTRA",
    title: "极致套餐",
    subtitle: "全球顶级国际内网专线，极致低延迟，专属客服技术支持",
    accent: "#8a4ddb",
    perks: ["每月 300G 流量", "独享级带宽体验", "年付赠送 Emby 权益"],
    options: [
      { id: "ultra-30", label: "月付", days: "30天", price: 89, traffic: "300G/月", devices: 1 },
      { id: "ultra-90", label: "季付", days: "90天", price: 239, traffic: "300G/月", devices: 2 },
      { id: "ultra-180", label: "半年付", days: "180天", price: 449, traffic: "300G/月", devices: 3 },
      { id: "ultra-360", label: "年付", days: "360天", price: 859, traffic: "300G/月", devices: 3 }
    ]
  }
];

function findInitialOption() {
  const plan = plans.find(item => item.id === "pro");
  return { plan, option: plan.options.find(item => item.id === "pro-360") };
}

function PlanCard({ plan, selectedId, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const visibleOptions = expanded ? plan.options : plan.options.slice(0, 1);
  const hiddenCount = plan.options.length - visibleOptions.length;

  return (
    <section className={`pricing-plan ${plan.recommended ? "pricing-plan-featured" : ""}`} style={{ "--plan-accent": plan.accent }}>
      <div className="pricing-plan-head">
        <div>
          <span className="pricing-plan-name">{plan.name}</span>
          <h2>{plan.title}</h2>
        </div>
        {plan.recommended && <span className="pricing-badge">推荐</span>}
      </div>
      <p>{plan.subtitle}</p>
      <div className="pricing-perks">
        {plan.perks.map(perk => (
          <span key={perk}><CheckCircleOutlined />{perk}</span>
        ))}
      </div>
      <div className="pricing-options">
        {visibleOptions.map(option => {
          const active = selectedId === option.id;
          const unlimited = option.traffic === "无限流量";
          return (
            <button key={option.id} className={`pricing-option ${unlimited ? "pricing-option-unlimited" : ""} ${active ? "pricing-option-active" : ""}`} onClick={() => onSelect(plan, option)}>
              <span>{option.label}<em>{option.days}</em>{unlimited && <b>无限</b>}</span>
              <strong>¥{option.price}</strong>
              <small>{option.traffic} · {option.devices} 台设备</small>
            </button>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <button className="pricing-expand" onClick={() => setExpanded(true)}>
          展开更多套餐（{hiddenCount}）
        </button>
      )}
      {expanded && (
        <button className="pricing-expand pricing-expand-muted" onClick={() => setExpanded(false)}>
          收起
        </button>
      )}
    </section>
  );
}

export default function PricingPage() {
  const initial = useMemo(findInitialOption, []);
  const [selected, setSelected] = useState(initial);
  const [contact, setContact] = useState("");
  const { notification } = AntApp.useApp();

  const paymentNote = useMemo(() => {
    const suffix = contact.trim() ? `-${contact.trim()}` : "";
    return `NEXORA-${selected.plan.name}-${selected.option.days}-${selected.option.price}${suffix}`;
  }, [contact, selected]);

  async function copyNote() {
    await copyText(paymentNote);
    notification.success({ message: "已复制付款备注", placement: "bottomRight" });
  }

  return (
    <main className="pricing-page">
      <section className="pricing-hero">
        <div>
          <span className="pricing-kicker">NEXORA</span>
          <h1>选择适合你的套餐</h1>
          <p>付款后请把付款截图和备注发给客服，客服会为你开通或续费，并发送 D Page 查询页面。</p>
        </div>
      </section>

      <section className="pricing-layout">
        <div className="pricing-list">
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              selectedId={selected.option.id}
              onSelect={(nextPlan, nextOption) => setSelected({ plan: nextPlan, option: nextOption })}
            />
          ))}
        </div>

        <aside className="pricing-pay">
          <div className="pricing-pay-sticky">
            <span className="pricing-pay-label">当前选择</span>
            <h2>{selected.plan.name} · {selected.option.label}</h2>
            <div className="pricing-price">¥{selected.option.price}</div>
            <div className="pricing-pay-meta">
              <span>{selected.option.days}</span>
              <span>{selected.option.traffic}</span>
              <span>{selected.option.devices} 台设备</span>
            </div>

            <label className="pricing-contact">
              <span>联系方式或备注</span>
              <Input value={contact} onChange={event => setContact(event.target.value)} placeholder="微信 / 邮箱 / 用户名" />
            </label>

            <div className="pricing-note">
              <span>付款备注</span>
              <strong>{paymentNote}</strong>
              <Button icon={<CopyOutlined />} onClick={copyNote}>复制备注</Button>
            </div>

            <div className="pricing-qr">
              <div className="pricing-qr-title"><QrcodeOutlined />支付宝扫码付款</div>
              <img src="/alipay-qr.jpg" alt="支付宝收款码" />
            </div>

            <p className="pricing-help">请按所选金额付款。付款后发送截图和备注给客服，用于核对订单。</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
