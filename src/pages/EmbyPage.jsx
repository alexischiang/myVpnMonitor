import React, { useState } from "react";
import {
  App as AntApp,
  Button,
  Checkbox,
  DatePicker,
  Divider,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Table,
  Tabs
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { fetchJson, postJson, putJson } from "../api";
import { formatDate, formatMoney } from "../utils";
import {
  useData,
  FormModal,
  inModalSelectProps,
  useResponsiveList,
  ManagementSection,
  StatusBadge,
  InlineActions,
  CardActions,
  useResizableCols,
  Text
} from "../lib.jsx";

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
  const { runAsync, embyVendors, reload } = useData();
  const [form] = Form.useForm();
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorUrl, setNewVendorUrl] = useState("");
  const [addingVendor, setAddingVendor] = useState(false);

  async function handleAddVendor() {
    const name = newVendorName.trim();
    const serverUrl = newVendorUrl.trim();
    if (!name || !serverUrl) return;
    setAddingVendor(true);
    try {
      const created = await postJson("/api/emby-vendors", { name, servers: [{ url: serverUrl, label: "" }] });
      await reload(["embyVendors"]);
      form.setFieldValue("embyVendorId", created.id);
      setNewVendorName("");
      setNewVendorUrl("");
    } finally {
      setAddingVendor(false);
    }
  }

  async function submit(values) {
    await runAsync(async () => {
      const payload = {
        customerName: values.customerName,
        embyVendorId: values.embyVendorId,
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
        embyVendorId: item.embyVendorId || undefined,
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
          <Form.Item name="embyVendorId" label="Emby 供应商" rules={[{ required: true, message: "请选择 Emby 供应商" }]} style={{ marginBottom: 0, flex: "1 1 220px" }}>
            <Select
              placeholder="选择供应商"
              allowClear
              options={embyVendors.map(v => ({ label: v.name, value: v.id }))}
              dropdownRender={menu => (
                <>
                  {menu}
                  <Divider style={{ margin: "8px 0" }} />
                  <Flex vertical gap={8} style={{ padding: "0 8px 8px" }}>
                    <Input placeholder="供应商名称" value={newVendorName} onChange={e => setNewVendorName(e.target.value)} size="small" />
                    <Flex gap={8}>
                      <Input placeholder="http://example.com:8096" value={newVendorUrl} onChange={e => setNewVendorUrl(e.target.value)} onPressEnter={handleAddVendor} size="small" />
                      <Button size="small" loading={addingVendor} onClick={handleAddVendor} icon={<PlusOutlined />} />
                    </Flex>
                  </Flex>
                </>
              )}
            />
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

function EmbyVendorForm({ item, onClose, onSaved }) {
  const { runAsync } = useData();
  const [form] = Form.useForm();

  async function submit(values) {
    await runAsync(async () => {
      const payload = { name: values.name, website: values.website || "", servers: values.servers, note: values.note || "" };
      if (item.id) {
        await putJson(`/api/emby-vendors/${item.id}`, payload);
      } else {
        await postJson("/api/emby-vendors", payload);
      }
      onSaved();
    }, item.id ? "正在保存..." : "正在创建...");
  }

  return (
    <FormModal title={item.id ? "编辑 Emby 供应商" : "新建 Emby 供应商"} onCancel={onClose} open width={560}>
      <Form form={form} layout="vertical" initialValues={{
        name: item.name || "",
        website: item.website || "",
        servers: item.servers?.length ? item.servers : [{ url: "", label: "" }],
        note: item.note || ""
      }} onFinish={submit}>
        <Flex wrap gap={12}>
          <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: "请输入供应商名称" }]} style={{ marginBottom: 0, flex: "1 1 180px" }}>
            <Input />
          </Form.Item>
          <Form.Item name="website" label="官网" style={{ marginBottom: 0, flex: "1 1 200px" }}>
            <Input placeholder="https://example.com" />
          </Form.Item>
        </Flex>
        <Form.Item label="服务器列表" required style={{ marginTop: 16, marginBottom: 0 }}>
          <Form.List name="servers" rules={[{ validator: async (_, list) => { if (!list || !list.length) throw new Error("至少添加一个服务器"); } }]}>
            {(fields, { add, remove }, { errors }) => (
              <Flex vertical gap={8}>
                {fields.map(({ key, name, ...rest }) => (
                  <Flex key={key} gap={8} align="start">
                    <Form.Item {...rest} name={[name, "url"]} rules={[{ required: true, message: "请输入地址" }]} style={{ marginBottom: 0, flex: "1 1 220px" }}>
                      <Input placeholder="http://example.com:8096" />
                    </Form.Item>
                    <Form.Item {...rest} name={[name, "label"]} style={{ marginBottom: 0, flex: "0 1 120px" }}>
                      <Input placeholder="标签（可选）" />
                    </Form.Item>
                    {fields.length > 1 && <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} style={{ marginTop: 4 }} />}
                  </Flex>
                ))}
                <Button type="dashed" onClick={() => add({ url: "", label: "" })} icon={<PlusOutlined />} style={{ width: "100%" }}>添加服务器</Button>
                <Form.ErrorList errors={errors} />
              </Flex>
            )}
          </Form.List>
        </Form.Item>
        <Form.Item name="note" label="备注" style={{ marginTop: 16, marginBottom: 0 }}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Button type="primary" htmlType="submit" block style={{ marginTop: 20 }}>{item.id ? "保存" : "创建"}</Button>
      </Form>
    </FormModal>
  );
}

function EmbyUsersTab() {
  const { embyUsers, embyVendors, reload, runAsync, busy } = useData();
  const { notification } = AntApp.useApp();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(null);
  const mobile = useResponsiveList();

  const visible = embyUsers.filter(u => {
    const vendor = embyVendors.find(v => v.id === u.embyVendorId);
    const hay = `${u.customerName || ""} ${vendor?.name || ""} ${u.serverUrl || ""} ${u.username || ""} ${u.note || ""}`.toLowerCase();
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
    { title: "供应商", render: (_, u) => { const vendor = embyVendors.find(v => v.id === u.embyVendorId); return vendor ? vendor.name : (u.serverUrl || "-"); }, ellipsis: true, width: 140 },
    { title: "用户名", dataIndex: "username", width: 120 },
    { title: "到期时间", render: (_, u) => u.expiresAt ? formatDate(u.expiresAt) : "-", width: 104 },
    { title: "客户付款", render: (_, u) => formatMoney(u.actualPaid), width: 88 },
    { title: "状态", render: (_, u) => <StatusBadge status={embyUserStatus(u)} />, width: 80 },
    { title: "操作", render: (_, u) => actions(u, true), width: 150 }
  ].map(col => ({ ...col, onHeaderCell: () => ({ style: { whiteSpace: "nowrap" } }), onCell: () => ({ style: { whiteSpace: "nowrap" } }) }));

  const embyTable = useResizableCols(columns, "emby-users");

  return (
    <ManagementSection
      title="Emby 用户"
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
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(() => { const vendor = embyVendors.find(v => v.id === item.embyVendorId); return vendor ? vendor.name : (item.serverUrl || "-"); })()}</Text>
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
      {editing && <EmbyUserForm item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(["embyUsers", "embyVendors"]); }} />}
    </ManagementSection>
  );
}

function EmbyVendorsTab() {
  const { embyVendors, embyUsers, reload, runAsync, busy } = useData();
  const { notification } = AntApp.useApp();
  const mobile = useResponsiveList();
  const [editing, setEditing] = useState(null);

  async function mutate(run) {
    await runAsync(async () => {
      try { await run(); await reload(["embyVendors"]); }
      catch (e) { notification.error({ message: "操作失败", description: e.message, placement: "bottomRight" }); }
    }, "处理中...");
  }

  function handleDelete(vendor) {
    Modal.confirm({
      title: "删除 Emby 供应商",
      content: `确认删除「${vendor.name}」？`,
      onOk: () => mutate(() => fetchJson(`/api/emby-vendors/${vendor.id}`, { method: "DELETE" }))
    });
  }

  const bp = { size: "small", style: { fontWeight: 400 }, loading: !!busy, disabled: !!busy };

  const columns = [
    { title: "名称", dataIndex: "name", width: 140 },
    { title: "官网", dataIndex: "website", ellipsis: true, width: 180, render: v => v ? <a href={v} target="_blank" rel="noreferrer">{v.replace(/^https?:\/\//, "")}</a> : "-" },
    { title: "服务器", render: (_, v) => { const s = v.servers || []; return s.length === 1 ? (s[0].label || s[0].url) : `${s.length} 台服务器`; }, ellipsis: true, width: 160 },
    { title: "备注", dataIndex: "note", ellipsis: true, width: 120 },
    { title: "用户数", render: (_, v) => embyUsers.filter(u => u.embyVendorId === v.id).length, width: 80 },
    {
      title: "操作", width: 140,
      render: (_, v) => (
        <InlineActions>
          <Button {...bp} icon={<EditOutlined />} onClick={() => setEditing(v)}>编辑</Button>
          <Button {...bp} danger icon={<DeleteOutlined />} onClick={() => handleDelete(v)}>删除</Button>
        </InlineActions>
      )
    }
  ];

  return (
    <ManagementSection
      title="Emby 供应商"
      actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>添加</Button>}
    >
      {mobile
        ? <Flex vertical gap={0}>
            {embyVendors.map(v => (
              <div key={v.id} style={{ padding: 16, borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
                <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 15 }}>{v.name}</Text>
                  <InlineActions>
                    <Button {...bp} icon={<EditOutlined />} onClick={() => setEditing(v)} />
                    <Button {...bp} danger icon={<DeleteOutlined />} onClick={() => handleDelete(v)} />
                  </InlineActions>
                </Flex>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 10 }}>{(() => { const s = v.servers || []; return s.length === 1 ? (s[0].label || s[0].url) : `${s.length} 台服务器`; })()}</Text>
                {v.note && <Text type="secondary" style={{ fontSize: 12, display: "block" }}>{v.note}</Text>}
              </div>
            ))}
            {!embyVendors.length && <Empty description="暂无 Emby 供应商。" />}
          </Flex>
        : <Table dataSource={embyVendors} columns={columns} rowKey="id" pagination={false} size="small" />
      }
      {editing && <EmbyVendorForm item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(["embyVendors"]); }} />}
    </ManagementSection>
  );
}

function EmbyPage() {
  return (
    <Tabs items={[
      { key: "users", label: "用户管理", children: <EmbyUsersTab /> },
      { key: "vendors", label: "供应商管理", children: <EmbyVendorsTab /> }
    ]} />
  );
}

export default EmbyPage;
