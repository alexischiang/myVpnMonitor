import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  App as AntApp,
  Button,
  Checkbox,
  DatePicker,
  Divider,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  Modal,
  Radio,
  Select,
  Spin,
  Steps,
  Table,
  Typography
} from "antd";
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  LoadingOutlined,
  PlusOutlined,
  RetweetOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { fetchJson, postJson } from "../api";
import {
  billTypeLabels,
  copyText,
  durationLabels,
  formatBytes,
  formatDate,
  formatDateTime,
  formatMoney,
  formatUserExpiry,
  userStatus
} from "../utils";
import {
  calcExpiry,
  Card,
  CardActions,
  DurationRadio,
  FormModal,
  inModalPickerProps,
  inModalSelectProps,
  initialOutputModeForUser,
  InlineActions,
  LIFETIME_EXPIRES_AT,
  lookupPrice,
  ManagementSection,
  OutputModeSection,
  PageSection,
  serviceProviderLabel,
  StatusBadge,
  ToolbarSearch,
  useData,
  usePalette,
  useResizableCols,
  useResponsiveList,
  userClientSubscriptionUrl,
  useSubscriptionRecommendation,
  UrlText,
  VendorTag,
  VipTag
} from "../lib.jsx";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ─── PlaceholderTagSelect ─────────────────────────────────────────────────────

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

// ─── User Form ────────────────────────────────────────────────────────────────

function UserForm({ item, subscriptions, onClose, onSaved }) {
  const { runAsync, busy, pricing } = useData();
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const expiryTouched = useRef(false);
  const subscriptionTouched = useRef(false);
  const paidTouched = useRef(Boolean(item.id));
  const initialOutputMode = initialOutputModeForUser(item);
  const purchasedAt = Form.useWatch("purchasedAt", form);
  const duration = Form.useWatch("duration", form);
  const expiresAt = Form.useWatch("expiresAt", form);
  const group = Form.useWatch("group", form);

  const { result: recommended, reason: recommendReason, loading: recommendLoading } = useSubscriptionRecommendation({
    expiresAt: expiresAt || calcExpiry(purchasedAt, duration),
    duration,
    ignoredUserId: item.id || "",
    enabled: step >= 2 && Boolean(purchasedAt && duration)
  });

  useEffect(() => {
    if (!item.id && recommended?.id && !subscriptionTouched.current) {
      form.setFieldsValue({ subscriptionId: recommended.id });
    }
  }, [form, item.id, recommended?.id]);

  useEffect(() => {
    if (paidTouched.current) return;
    const price = lookupPrice(pricing, group, duration);
    if (price !== undefined) form.setFieldsValue({ actualPaid: String(price) });
  }, [group, duration, pricing, form]);

  const initialPurchasedAt = item.purchasedAt ? dayjs(item.purchasedAt) : dayjs();
  const initialDuration = item.duration || "monthly";
  const initialExpiresAt = item.expiresAt ? dayjs(item.expiresAt) : dayjs(calcExpiry(initialPurchasedAt, initialDuration));

  function handleChange(changed, values) {
    if (Object.prototype.hasOwnProperty.call(changed, "subscriptionId")) {
      subscriptionTouched.current = true;
    }
    if (Object.prototype.hasOwnProperty.call(changed, "actualPaid")) { paidTouched.current = true; }
    if (Object.prototype.hasOwnProperty.call(changed, "group") || Object.prototype.hasOwnProperty.call(changed, "duration")) { paidTouched.current = false; }
    if (Object.prototype.hasOwnProperty.call(changed, "expiresAt")) { expiryTouched.current = true; return; }
    if (Object.prototype.hasOwnProperty.call(changed, "duration")) {
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
      const payload = {
        ...values,
        purchasedAt: values.purchasedAt ? values.purchasedAt.format("YYYY-MM-DD") : "",
        expiresAt: values.expiresAt ? values.expiresAt.toISOString() : "",
        placeholderTag: values.placeholderTag || null,
        useDefaultPlaceholder: values.useDefaultPlaceholder !== false
      };
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
      <Form form={form} layout="vertical" initialValues={{ userId: item.userId || "", wechatName: item.wechatName || "", imessageId: item.imessageId || "", purchasedAt: initialPurchasedAt, actualPaid: item.actualPaid ?? "", duration: initialDuration, expiresAt: initialExpiresAt, subscriptionId: item.subscriptionId || subscriptions[0]?.id || "", outputMode: initialOutputMode, placeholderTag: item.placeholderTag || "", showUserInfo: item.showUserInfo !== false, useDefaultPlaceholder: item.useDefaultPlaceholder !== false, blockUserinfo: item.blockUserinfo !== false, group: item.group || "pro", isBusiness: Boolean(item.isBusiness), isFamilyFriend: Boolean(item.isFamilyFriend) }} onValuesChange={handleChange} onFinish={submit}>
        <Steps current={step} size="small" style={{ marginBottom: 24 }} items={[{ title: "身份信息" }, { title: "订阅信息" }, { title: "投递模式" }, { title: "高级设置" }]} />
        <div style={{ display: step === 0 ? "block" : "none" }}>
          <Flex gap={16} wrap="wrap">
            <Form.Item name="userId" label="用户 ID" rules={[{ required: true, message: "请输入用户 ID" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}><Input placeholder="必填" /></Form.Item>
            <Form.Item name="wechatName" label="微信号" style={{ marginBottom: 0, flex: "1 1 160px" }}><Input placeholder="选填" /></Form.Item>
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
            <Form.Item name="isFamilyFriend" valuePropName="checked" style={{ marginBottom: 0, alignSelf: "flex-end" }}>
              <Checkbox>亲友账户</Checkbox>
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
            <Form.Item name="actualPaid" label="本次消费金额" rules={[{ required: true, message: "请输入本次消费金额" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
              <Input type="number" min="0" step="0.01" placeholder="0.00" />
            </Form.Item>
          </Flex>
          <Form.Item name="duration" label="套餐时长" style={{ marginTop: 16, marginBottom: 0 }}>
            <DurationRadio purchasedAt={purchasedAt} />
          </Form.Item>
        </div>
        <div style={{ display: step === 2 ? "block" : "none" }}>
          {recommendLoading ? <Flex justify="center" align="center" style={{ padding: "48px 0" }}><Spin indicator={<LoadingOutlined spin />} tip="正在匹配推荐订阅池..." /></Flex> : (
            <OutputModeSection form={form} initialOutputMode={initialOutputMode} subscriptions={subscriptions} recommended={recommended} recommendReason={recommendReason} showRecommendation={!item.id} userExpiresAt={expiresAt || calcExpiry(purchasedAt, duration)} />
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

// ─── Renew Form ───────────────────────────────────────────────────────────────

function RenewForm({ user, subscriptions, onClose, onSaved }) {
  const { runAsync, pricing } = useData();
  const [form] = Form.useForm();
  const subscriptionTouched = useRef(false);
  const paidTouched = useRef(false);
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
    enabled: Boolean(purchasedAt && duration)
  });

  useEffect(() => {
    if (recommended?.id && !subscriptionTouched.current) form.setFieldsValue({ subscriptionId: recommended.id });
  }, [form, recommended?.id]);

  useEffect(() => {
    if (paidTouched.current) return;
    const price = lookupPrice(pricing, user.group, duration);
    if (price !== undefined) form.setFieldsValue({ actualPaid: String(price) });
  }, [duration, pricing, user.group, form]);

  async function submit(values) {
    await runAsync(async () => {
      const payload = {
        ...values,
        purchasedAt: values.purchasedAt.format("YYYY-MM-DD")
      };
      if (values.expiresAt && typeof values.expiresAt.toISOString === "function") payload.expiresAt = values.expiresAt.toISOString();
      await postJson(`/api/users/${user.id}/renew`, payload);
      await onSaved();
    }, "Renewing user...");
  }

  return (
    <FormModal title={`${user.userId || "用户"} 续费`} open onCancel={onClose} width={760}>
      <Form form={form} layout="vertical" initialValues={{ purchasedAt: dayjs(), actualPaid: "", duration: user.duration || "monthly", subscriptionId: user.subscriptionId || subscriptions[0]?.id || "", outputMode: initialOutputMode }} onValuesChange={changed => { if (Object.prototype.hasOwnProperty.call(changed, "subscriptionId")) subscriptionTouched.current = true; if (Object.prototype.hasOwnProperty.call(changed, "actualPaid")) paidTouched.current = true; if (Object.prototype.hasOwnProperty.call(changed, "duration")) paidTouched.current = false; }} onFinish={submit}>
        <Divider orientation="left" orientationMargin={0} style={{ marginTop: 0 }}><Text type="secondary" style={{ fontSize: 12 }}>续费详情</Text></Divider>
        <Flex gap={16} wrap="wrap">
          <Form.Item name="purchasedAt" label="续费日期" rules={[{ required: true, message: "请选择续费日期" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <DatePicker {...inModalPickerProps} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="actualPaid" label="本次消费金额" rules={[{ required: true, message: "请输入本次消费金额" }]} style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <Input type="number" min="0" step="0.01" placeholder="0.00" />
          </Form.Item>
        </Flex>
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 12 }}>当前到期日：{user.expiresAt ? formatDate(user.expiresAt) : "未知"}</Text>
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
          <OutputModeSection form={form} initialOutputMode={initialOutputMode} subscriptions={subscriptions} recommended={recommended} recommendReason={recommendReason} showRecommendation userExpiresAt={renewalExpiresAt} />
        )}
        <div style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" block>确认续费</Button>
        </div>
      </Form>
    </FormModal>
  );
}

// ─── User Detail Page ─────────────────────────────────────────────────────────

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
              ["微信号", user.wechatName || "-"],
              ["iMessage", user.imessageId || "-"],
              ["VIP 等级", <VipTag key="vip" level={lvl} isFamilyFriend={user.isFamilyFriend} isBusiness={user.isBusiness} />],
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

// ─── User Cards ───────────────────────────────────────────────────────────────

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
              {(() => { const lvl = user.level || (user.actualPaid <= 300 ? "vip1" : user.actualPaid <= 1000 ? "vip2" : "vip3"); return <VipTag level={lvl} isFamilyFriend={user.isFamilyFriend} isBusiness={user.isBusiness} />; })()}
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

// ─── Users Page ───────────────────────────────────────────────────────────────

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
    if (vipFilter) {
      if (vipFilter === "fnds") { if (!u.isFamilyFriend) return false; }
      else if (vipFilter === "bus") { if (!u.isBusiness) return false; }
      else { if (u.isFamilyFriend || u.isBusiness) return false; const lvl = u.level || (u.actualPaid <= 300 ? "vip1" : u.actualPaid <= 1000 ? "vip2" : "vip3"); if (lvl !== vipFilter) return false; }
    }
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
    { title: "VIP", width: 72, render: (_, u) => { const lvl = u.level || (u.actualPaid <= 300 ? "vip1" : u.actualPaid <= 1000 ? "vip2" : "vip3"); return <VipTag level={lvl} isFamilyFriend={u.isFamilyFriend} isBusiness={u.isBusiness} />; } },
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
          <Select allowClear placeholder="VIP 等级" style={{ width: 110 }} value={vipFilter} onChange={v => { setVipFilter(v || null); setPage(1); }} options={[{ value: "vip1", label: "VIP 1" }, { value: "vip2", label: "VIP 2" }, { value: "vip3", label: "VIP 3" }, { value: "fnds", label: "亲友" }, { value: "bus", label: "企业" }]} />
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

export default UsersPage;
export { UserDetailPage, UserForm, RenewForm, UserCards };
