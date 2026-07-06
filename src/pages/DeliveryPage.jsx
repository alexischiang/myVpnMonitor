import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { App as AntApp, Button, Empty, Flex, Spin, Typography } from "antd";
import { CheckCircleOutlined, CopyOutlined, LinkOutlined, ReadOutlined, RocketOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { fetchJson } from "../api";
import { copyText, formatDate } from "../utils";

const { Text } = Typography;

const TEXT = {
  title: "\u67e5\u8be2",
  active: "\u8ba2\u9605\u5df2\u751f\u6548",
  expiresAt: "\u5230\u671f\u65f6\u95f4",
  activeGroup: "\u5957\u9910\u7b49\u7ea7",
  vipLevel: "VIP \u7b49\u7ea7",
  unknown: "\u672a\u77e5",
  subscriptionUrl: "\u8ba2\u9605 URL",
  copyUrl: "\u590d\u5236\u8ba2\u9605 URL",
  copied: "\u5df2\u590d\u5236\u8ba2\u9605 URL",
  importShadowrocket: "\u4e00\u952e\u5bfc\u5165 Shadowrocket",
  tutorials: "\u5ba2\u6237\u7aef\u4f7f\u7528\u6559\u7a0b",
  notFound: "\u8ba2\u9605\u4e0d\u5b58\u5728\u6216\u5df2\u5931\u6548\uff0c\u8bf7\u8054\u7cfb\u5ba2\u670d\u3002"
};

const groupLabels = { basic: "Basic", pro: "Pro", ultra: "Ultra" };
const vipLabels = { vip1: "VIP 1", vip2: "VIP 2", vip3: "VIP 3" };

function Metric({ label, value }) {
  return (
    <div className="delivery-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TutorialLink({ item }) {
  return (
    <a className="delivery-tutorial" href={item.url} target="_blank" rel="noreferrer">
      <span className="delivery-tutorial-icon"><ReadOutlined /></span>
      <span>
        <strong>{item.platform}</strong>
        <em>{item.client}</em>
      </span>
    </a>
  );
}

export default function DeliveryPage() {
  const { token } = useParams();
  const { notification } = AntApp.useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = `NEXORA - ${TEXT.title}`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchJson(`/api/public/delivery/${encodeURIComponent(token || "")}`)
      .then(payload => {
        if (!cancelled) {
          setData(payload);
          setError("");
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message || TEXT.notFound);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const display = useMemo(() => ({
    expiresAt: data?.expiresAt ? formatDate(data.expiresAt) : TEXT.unknown,
    activeGroup: groupLabels[data?.activeGroup] || data?.activeGroup || "-",
    vipLevel: vipLabels[data?.vipLevel] || String(data?.vipLevel || "-").toUpperCase()
  }), [data]);

  async function copySubscription() {
    await copyText(data.subscriptionUrl);
    notification.success({ message: TEXT.copied, placement: "bottomRight" });
  }

  function importShadowrocket() {
    window.location.href = `shadowrocket://add/${encodeURIComponent(data.subscriptionUrl)}`;
  }

  if (loading) {
    return (
      <main className="delivery-page">
        <div className="delivery-shell delivery-centered">
          <Spin size="large" />
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="delivery-page">
        <div className="delivery-shell delivery-centered">
          <Empty description={error || TEXT.notFound} />
        </div>
      </main>
    );
  }

  return (
    <main className="delivery-page">
      <section className="delivery-shell">
        <div className="delivery-hero">
          <div className="delivery-brand">NEXORA</div>
          <div className="delivery-status">
            <CheckCircleOutlined />
            <span>{TEXT.active}</span>
          </div>
        </div>

        <div className="delivery-card delivery-summary">
          <Metric label={TEXT.expiresAt} value={display.expiresAt} />
          <Metric label={TEXT.activeGroup} value={display.activeGroup} />
          <Metric label={TEXT.vipLevel} value={display.vipLevel} />
        </div>

        <div className="delivery-card">
          <Flex align="center" gap={10} className="delivery-section-title">
            <LinkOutlined />
            <Text strong>{TEXT.subscriptionUrl}</Text>
          </Flex>
          <div className="delivery-url-box">{data.subscriptionUrl}</div>
          <div className="delivery-action-stack">
            <Button type="primary" icon={<CopyOutlined />} block size="large" onClick={copySubscription}>
              {TEXT.copyUrl}
            </Button>
            <Button icon={<RocketOutlined />} block size="large" onClick={importShadowrocket}>
              {TEXT.importShadowrocket}
            </Button>
          </div>
        </div>

        <div className="delivery-card">
          <Flex align="center" gap={10} className="delivery-section-title">
            <SafetyCertificateOutlined />
            <Text strong>{TEXT.tutorials}</Text>
          </Flex>
          <div className="delivery-tutorial-grid">
            {(data.tutorials || []).map(item => <TutorialLink key={`${item.platform}-${item.client}`} item={item} />)}
          </div>
        </div>
      </section>
    </main>
  );
}
