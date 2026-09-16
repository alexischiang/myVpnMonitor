// Provider transport only: no application order, wallet or fulfillment access.
function createGatewayClient({ sign, compact }) {
  async function postPaymentForm(endpoint, params, config) {
    const response = await fetch(`${config.apiBaseUrl}${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(15000),
      body: new URLSearchParams(compact(params))
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Payment gateway returned non-JSON response (${response.status}).`);
    }
    if (!response.ok) throw new Error(payload?.errMsg || `Payment gateway request failed: ${response.status}`);
    if (payload.status !== 0) throw new Error(payload.errMsg || "Payment gateway rejected the order.");
    return payload.result || {};
  }


  async function postXinhuiForm(endpoint, params, config) {
    const signed = { ...compact(params), sign_type: "MD5" };
    signed.sign = sign(signed, config);
    const response = await fetch(`${config.apiBaseUrl}${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(15000),
      body: new URLSearchParams(signed)
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`新汇返回了非 JSON 响应（${response.status}）。`);
    }
    if (!response.ok) throw new Error(payload?.msg || `新汇请求失败：${response.status}`);
    if (Number(payload.code) !== 1) throw new Error(payload.msg || "新汇拒绝了请求。");
    return payload;
  }


  async function createGatewayPayment(config, params) {
    if (config.provider === "test") return { result: { tid: `test-${params.merOrderTid}`, payOrderStatus: 0 }, requestParams: {} };
    if (config.provider !== "xinhui") {
      const signed = compact(params);
      signed.sign = sign(signed, config);
      return { result: await postPaymentForm("/api/services/app/Api_PayOrder/CreateOrderPay", signed, config), requestParams: signed };
    }
    const requestParams = {
      pid: config.merchantId,
      type: params.channelCode,
      out_trade_no: params.merOrderTid,
      notify_url: params.notifyUrl,
      return_url: params.returnUrl,
      name: params.clientUserPayRemark,
      money: params.money,
      clientip: params.clientip,
      device: "jump"
    };
    const payload = await postXinhuiForm("/mapi.php", requestParams, config);
    return {
      requestParams: { ...requestParams, sign_type: "MD5" },
      result: { tid: payload.trade_no, payUrl: payload.payurl || payload.qrcode || payload.urlscheme, payOrderStatus: 0 }
    };
  }


  async function queryGatewayPayment(config, order) {
    if (config.provider !== "xinhui") {
      const params = { mid: config.merchantId, merOrderTid: order.merOrderTid };
      params.sign = sign(params, config);
      return postPaymentForm("/api/services/app/Api_PayOrder/QueryPayOrder", params, config);
    }
    const url = new URL(`${config.apiBaseUrl}/api.php`);
    url.search = new URLSearchParams({ act: "order", pid: config.merchantId, key: config.merchantSecret, out_trade_no: order.merOrderTid });
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const payload = await response.json();
    if (!response.ok || Number(payload.code) !== 1) throw new Error(payload.msg || `新汇查单失败：${response.status}`);
    const status = Number(payload.status);
    return {
      tid: payload.trade_no,
      money: payload.money,
      payOrderStatus: status === 1 ? 1 : status === 0 ? 0 : 3
    };
  }

  return { createGatewayPayment, queryGatewayPayment };
}

module.exports = { createGatewayClient };
