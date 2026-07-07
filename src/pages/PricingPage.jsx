import React, { useEffect, useMemo, useState } from "react";
import { CheckCircleOutlined, LinkOutlined, LoadingOutlined, ReloadOutlined } from "@ant-design/icons";
import { postJson, fetchJson } from "../api";

const plans = [
  {
    id: "test",
    name: "TEST",
    title: "支付测试",
    subtitle: "用于验证支付页面、回调和订单状态，不对应正式套餐。",
    accent: "#d64b32",
    perks: ["测试金额 1 元", "用于支付链路验证", "不发放正式权益"],
    options: [
      { id: "test-001", label: "测试商品", days: "即时", price: 1, traffic: "测试", devices: 1 }
    ]
  },
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
              <span>{option.label}<em>{option.days}</em>{unlimited && <b>无限流量</b>}</span>
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
  const [order, setOrder] = useState(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setOrder(null);
    setError("");
  }, [selected.option.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentOrder = params.get("paymentOrder");
    if (!paymentOrder) return;

    setChecking(true);
    setError("");
    fetchJson(`/api/payments/orders/${encodeURIComponent(paymentOrder)}`)
      .then(nextOrder => {
        setOrder(nextOrder);
        if (nextOrder.deliveryUrl) window.location.href = nextOrder.deliveryUrl;
      })
      .catch(e => setError(e.message || "查询支付状态失败"))
      .finally(() => setChecking(false));

    params.delete("paymentOrder");
    const nextQuery = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`
    );
  }, []);

  async function createOrder() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("请输入有效邮箱，用于生成你的订阅用户");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const nextOrder = await postJson("/api/payments/orders", {
        planId: selected.plan.id,
        planName: selected.plan.name,
        optionId: selected.option.id,
        optionLabel: `${selected.plan.name} ${selected.option.label} ${selected.option.days}`,
        amount: selected.option.price,
        email: normalizedEmail,
        returnUrl: window.location.href
      });
      setOrder(nextOrder);
      if (nextOrder.payUrl) window.open(nextOrder.payUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e.message || "创建支付订单失败");
    } finally {
      setLoading(false);
    }
  }

  async function checkOrder() {
    if (!order?.id) return;
    setChecking(true);
    setError("");
    try {
      const nextOrder = await fetchJson(`/api/payments/orders/${order.id}`);
      setOrder(nextOrder);
      if (nextOrder.deliveryUrl) window.location.href = nextOrder.deliveryUrl;
    } catch (e) {
      setError(e.message || "查询支付状态失败");
    } finally {
      setChecking(false);
    }
  }

  const paid = order?.status === "paid";

  return (
    <main className="pricing-page">
      <section className="pricing-hero">
        <div>
          <span className="pricing-kicker">NEXORA</span>
          <h1>选择适合你的套餐</h1>
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

            <label className="pricing-email-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                placeholder="you@example.com"
                autoComplete="email"
                onChange={event => setEmail(event.target.value)}
              />
            </label>

            <button className="pricing-pay-button" onClick={createOrder} disabled={loading || paid}>
              {loading ? <LoadingOutlined /> : <LinkOutlined />}
              {paid ? "已支付成功" : order ? "重新生成支付订单" : "生成支付订单"}
            </button>

            {order && (
              <div className={`pricing-order pricing-order-${order.status}`}>
                <span>平台订单</span>
                <strong>{order.tid || order.merOrderTid}</strong>
                <span>支付状态</span>
                <strong>{paid ? "支付成功" : order.status === "pending" ? "等待支付" : order.statusText}</strong>
                {order.payUrl && !paid && (
                  <a className="pricing-pay-link" href={order.payUrl} target="_blank" rel="noreferrer">
                    打开支付页面
                  </a>
                )}
                {order.deliveryUrl && (
                  <a className="pricing-pay-link" href={order.deliveryUrl}>
                    Open D Page
                  </a>
                )}
                {order.fulfillmentStatus === "failed" && (
                  <p className="pricing-order-note">{order.fulfillmentError || "Fulfillment failed. Please contact support."}</p>
                )}
                <button className="pricing-check-button" onClick={checkOrder} disabled={checking}>
                  <ReloadOutlined spin={checking} />刷新支付状态
                </button>
              </div>
            )}

            {error && <p className="pricing-error">{error}</p>}

            <p className="pricing-help">
              支付完成后系统会通过平台回调自动更新状态。如果页面没有变化，可以点击刷新支付状态。
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
