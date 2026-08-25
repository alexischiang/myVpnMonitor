const assert = require("node:assert/strict");
const { normalizeTicketAttachments, ticketStatusForReply, validateTicketText } = require("./server");

assert.equal(ticketStatusForReply("admin"), "pending_user");
assert.equal(ticketStatusForReply("user"), "pending_support");
assert.equal(validateTicketText("  已恢复连接  ", "回复", 1, 20), "已恢复连接");
assert.throws(() => validateTicketText("x", "描述", 2, 20), /至少/);
assert.deepEqual(normalizeTicketAttachments([{ url: "/uploads/markdown/01234567-89ab-cdef-0123-456789abcdef.png", name: "错误截图.png" }]), [{ url: "/uploads/markdown/01234567-89ab-cdef-0123-456789abcdef.png", name: "错误截图.png" }]);
assert.throws(() => normalizeTicketAttachments(Array(4).fill({ url: "/uploads/markdown/a.png", name: "a" })), /最多/);

console.log("ticket checks passed");
