module.exports = {
  title: "NEXORA 文档中心",
  tagline: "产品使用教程与帮助文档",
  url: "https://webprovider.top",
  baseUrl: "/docs/",
  trailingSlash: true,
  onBrokenLinks: "throw",
  markdown: { hooks: { onBrokenMarkdownLinks: "warn" } },
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: require.resolve("./sidebars.js")
        },
        blog: false,
        theme: { customCss: require.resolve("./src/css/custom.css") }
      }
    ]
  ],
  themeConfig: {
    navbar: {
      title: "NEXORA",
      items: [
        { type: "docSidebar", sidebarId: "docsSidebar", position: "left", label: "使用教程" },
        { href: "https://webprovider.top/account", label: "返回用户中心", position: "right" }
      ]
    },
    colorMode: { respectPrefersColorScheme: true }
  }
};
