const { ensureDataFile, handleApi, sendJson } = require("../server");

let initialized = false;

module.exports = async function vercelApiHandler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  try {
    if (!initialized) {
      await ensureDataFile();
      initialized = true;
    }
    await handleApi(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
};
