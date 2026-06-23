import React, { useCallback, useEffect, useState } from "react";
import {
  App as AntApp,
  Button,
  Card as AntCard,
  Checkbox,
  Divider,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Table,
  Tag,
  Typography
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  WarningOutlined
} from "@ant-design/icons";

import { fetchJson, postJson, putJson, deleteJson } from "../api";
import {
  Card,
  FormModal,
  InlineActions,
  SC_TARGETS,
  DEFAULT_SC_TARGET,
  SectionCard,
  Text,
  TextArea,
  inModalSelectProps,
  useData,
  usePalette,
  useResponsiveList
} from "../lib.jsx";

const { Title, Paragraph } = Typography;

function PresetForm({ preset, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const initial = {
    target: preset?.target || DEFAULT_SC_TARGET,
    config: preset?.config || "",
    emoji: preset?.emoji !== false,
    udp: preset?.udp !== false,
    scv: Boolean(preset?.scv),
    sort: Boolean(preset?.sort)
  };

  async function submit(values) {
    setSaving(true);
    try {
      await fetchJson(`/api/presets`, { method: "PUT", body: JSON.stringify(values) });
      await onSaved();
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <FormModal title="全局转换预设" open onCancel={onClose}>
      <Form form={form} layout="vertical" initialValues={initial} onFinish={submit}>
        <Flex gap={16} wrap="wrap">
          <Form.Item name="target" label="输出目标" style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <Select {...inModalSelectProps} allowClear placeholder="target" options={SC_TARGETS} />
          </Form.Item>
          <Form.Item name="config" label="远程配置 URL" style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <Input placeholder="选填，https://..." />
          </Form.Item>
        </Flex>
        <Flex gap={16} wrap="wrap" align="center" style={{ marginTop: 16 }}>
          <Form.Item name="emoji" valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>Emoji</Checkbox></Form.Item>
          <Form.Item name="udp" valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>UDP</Checkbox></Form.Item>
          <Form.Item name="scv" valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>跳过 TLS 验证</Checkbox></Form.Item>
          <Form.Item name="sort" valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>节点排序</Checkbox></Form.Item>
        </Flex>
        <Flex vertical gap={10} style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" block loading={saving}>保存</Button>
        </Flex>
      </Form>
    </FormModal>
  );
}

function VendorOverrideModal({ vendor, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    form.setFieldsValue({
      overrideExclude: vendor.overrideExclude || "",
      overrideInclude: vendor.overrideInclude || "",
      overrideRename: vendor.overrideRename || ""
    });
  }, [vendor.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(values) {
    setSaving(true);
    try {
      await fetchJson(`/api/vendors/${vendor.id}`, { method: "PUT", body: JSON.stringify(values) });
      await onSaved();
      onClose();
    } finally { setSaving(false); }
  }

  function handleClear() {
    fetchJson(`/api/vendors/${vendor.id}`, { method: "PUT", body: JSON.stringify({ overrideExclude: "", overrideInclude: "", overrideRename: "" }) })
      .then(onSaved).then(onClose);
  }

  return (
    <FormModal title={`字段屏蔽：${vendor.name}`} open onCancel={onClose}>
      <Form form={form} layout="vertical" onFinish={submit}>
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
          仅覆盖全局预设的节点筛选字段，留空则沿用全局预设。
        </Text>
        <Form.Item name="overrideInclude" label="include"><Input placeholder="节点包含规则" /></Form.Item>
        <Form.Item name="overrideExclude" label="exclude"><Input placeholder="节点排除规则" /></Form.Item>
        <Form.Item name="overrideRename" label="rename"><Input placeholder="old-name@new-name" /></Form.Item>
        <Flex vertical gap={10} style={{ marginTop: 16 }}>
          <Button type="primary" htmlType="submit" block loading={saving}>保存</Button>
          <Button danger block onClick={handleClear}>清除屏蔽</Button>
        </Flex>
      </Form>
    </FormModal>
  );
}

function VendorPresetSection() {
  const { vendors, presets, reload } = useData();
  const [editingPreset, setEditingPreset] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const p = usePalette();
  const preset = (presets || [])[0] || null;
  const hasOverride = v => Boolean(v.overrideExclude || v.overrideInclude || v.overrideRename);

  return (
    <SectionCard title="转换预设管理">
      <AntCard size="small" style={{ background: p.card, border: `1px solid ${p.border}`, borderRadius: 10, marginBottom: 16 }} styles={{ header: { padding: "8px 16px", minHeight: 40 }, body: { padding: "12px 16px" } }}
        extra={<Button size="small" type="link" onClick={() => setEditingPreset(true)}>编辑预设</Button>}
        title={<Text strong>全局转换预设</Text>}>
        {preset?.target
          ? <Text type="secondary" style={{ fontSize: 12 }}>{preset.target}{preset.config ? ` · config` : ""}</Text>
          : <Text type="secondary" style={{ fontSize: 12 }}>未设置预设</Text>}
      </AntCard>
      <Divider orientation="left" orientationMargin={0} style={{ margin: "8px 0" }}><Text type="secondary" style={{ fontSize: 12 }}>供应商字段屏蔽</Text></Divider>
      {vendors.length === 0
        ? <Text type="secondary">暂无供应商，请在新增订阅时添加。</Text>
        : <Flex gap={12} wrap="wrap">
            {vendors.map(v => (
              <AntCard key={v.id} style={{ minWidth: 180, background: p.card, border: `1px solid ${p.border}`, borderRadius: 10 }} styles={{ header: { padding: "8px 16px", minHeight: 40 }, body: { padding: "12px 16px" } }}
                extra={<Button size="small" type="link" onClick={() => setEditingVendor(v)}>编辑屏蔽</Button>}
                title={<Text strong>{v.name}</Text>}>
                {hasOverride(v)
                  ? <Text type="secondary" style={{ fontSize: 12 }}>{[
                      v.overrideExclude && `exclude: ${v.overrideExclude}`,
                      v.overrideInclude && `include: ${v.overrideInclude}`,
                      v.overrideRename && `rename`
                    ].filter(Boolean).join(" · ")}</Text>
                  : <Text type="secondary" style={{ fontSize: 12 }}>沿用全局预设</Text>}
              </AntCard>
            ))}
          </Flex>
      }
      {editingPreset && <PresetForm preset={preset} onClose={() => setEditingPreset(false)} onSaved={() => reload(["presets"])} />}
      {editingVendor && <VendorOverrideModal vendor={editingVendor} onClose={() => setEditingVendor(null)} onSaved={() => reload(["vendors"])} />}
    </SectionCard>
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

function SubconverterPage() {
  return (
    <Flex vertical gap={24}>
      <VendorPresetSection />
      <PlaceholderNodesSection />
    </Flex>
  );
}

export default SubconverterPage;
