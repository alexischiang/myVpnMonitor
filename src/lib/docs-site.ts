// Customer docs live on the standalone docs site (nexora-docs repo); the server keeps 301-ing old /docs/* links there.
const DOCS_SITE_URL = String(import.meta.env.VITE_DOCS_SITE_URL || "https://docs.webprovider.top").replace(/\/+$/, "")

/** Tutorials landing page, the target of every 使用文档 / 使用教程 entry in the account area. */
export const DOCS_URL = `${DOCS_SITE_URL}/docs/`
