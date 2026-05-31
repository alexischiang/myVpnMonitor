const { ensureDataFile, handleApi, sendJson } = require("../server");

module.exports = async function vercelApiHandler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  try {
    await ensureDataFile();
    await handleApi(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
};
