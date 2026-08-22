const express = require("express");

function createMainApp(requestHandler) {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestHandler);
  return app;
}

module.exports = { createMainApp };
