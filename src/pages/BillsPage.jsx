import React, { useState } from "react";
import { App as AntApp, Button, DatePicker, Empty, Flex, Modal, Table, Tag } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { postJson, fetchJson } from "../api";
import {
  billTypeLabels,
  durationLabels,
  formatDate,
  formatDateTime,
  formatMoney
} from "../utils";
import {
  CardActions,
  InlineActions,
  ManagementSection,
  ToolbarSearch,
  Text,
  tablePag,
  useData,
  usePalette,
  useResizableCols,
  useResponsiveList
} from "../lib.jsx";

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

export default BillsPage;
