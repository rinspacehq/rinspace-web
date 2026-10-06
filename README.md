# Rinspace 表世界前端

Rinspace 的表世界 React 前端。这里包含实际使用的页面、组件、样式、路由、翻译和浏览器请求代码。你可以在本地修改它们，连接 Rinspace 的正式服务查看效果；不需要运行后端或准备测试账号。

## 一键在本地运行

需要 Git、Node.js 22 或更新版本（含 Corepack）。克隆仓库后，只需在仓库根目录运行一条命令：

```sh
git clone https://github.com/rinspacehq/rinspace-web.git
cd rinspace-web
node scripts/start-local.mjs
```

打开 **http://127.0.0.1:5173/**。脚本会按锁文件安装依赖（禁用依赖安装脚本），然后启动连接 `rinspace.com` 的本地前端。修改 `src/` 会自动刷新页面；按 Ctrl-C 停止。端口被占用时运行 `node scripts/start-local.mjs --port 5176`，再打开对应端口。已有依赖时，也可以运行 `corepack pnpm dev:real`。

这是一键**本地启动**：它只监听本机 `127.0.0.1`，不启动业务数据库，也不要求私仓配置、生产环境文件、平台管理密钥或共享测试账号。

## 登录与可用范围

匿名页面可以直接查看。需要查看仅登录可见的页面时，从本地页面选择前往官网授权，在 `rinspace.com` 登录自己的账号并确认授权，再返回本地页面。请只授权自己信任的代码，不要把密码、验证码、Cookie 或 token 复制给本地工具或他人。

本地登录的目的是帮助你检查自己修改的页面，不是让本地副本具备官网全部业务能力。请求连接真实服务；已接入的写操作可能修改真实账号数据，未接通的功能应在官网使用，不会模拟成功。Gitea 和里世界入口跳转官方网页，不在本机部署它们。

正式授权配置和官网同意页已启用，但维护者尚未完成真实账号的本地受保护页面验收。当前已知限制及安全边界见[本地连接说明](scripts/local-client/README.md)。遇到问题时请报告脱敏现象，不要发送账号凭据或授权回调地址。

## 修改与验证

从 `src/` 中的页面和组件开始修改。`public/` 放静态资源，`contracts/` 放前端所需的契约输入，`scripts/` 放构建与检查工具，`tests/` 和 `playwright/` 放浏览器测试。

提交前至少运行与你的改动相关的测试。常用检查：

```sh
corepack pnpm check
corepack pnpm check:routes
corepack pnpm check:i18n
corepack pnpm check:real-client
corepack pnpm test
```

修改构建、资源或环境边界时，再运行 `corepack pnpm check:independent`、`corepack pnpm check:env-boundary` 和相应的浏览器测试。自动化测试使用隔离输入，不需要真实账号。完整的提交与截图要求见[贡献指南](CONTRIBUTING.md)；公开 CI 与候选产物流程见[流程说明](.github/FRONTEND-CI.md)。

## 发布状态

源码已经公开，但 `rinspace.com` 还没有切换为消费本仓库的前端发行包。上面的一键脚本只用于本地预览，不会将网站发布到公网；单独运行 `corepack pnpm build` 也不等于完成可登录站点的部署。本地授权需要受来源限制的回调和连接工具，不能把生产环境文件复制进仓库。

维护者会审查公开贡献，构建固定版本并在私仓对同一产物做集成验证，之后才可能让官网消费该版本。目前公开 `v0.2.0` 是集成预发布版；官网尚未切换来源，私仓仍保留当前生产前端。公开 `main`、未审查 PR 或 `latest` 都不会自动进入生产。

修改并查看表世界页面只需使用上面的本地命令；本仓库目前不提供公网自部署脚本。

## 贡献、许可与安全

欢迎提交页面、组件、样式、翻译和可复现的测试改进。请在 PR 中说明受影响页面和验证结果，保留必要的明暗主题及窄屏对照；不要提交构建产物、凭据、真实用户私有数据或未经确认可分发的素材。提交须遵守 [DCO](DCO) 和[贡献许可](CONTRIBUTION-LICENSE.md)，参见[贡献指南](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私密报告。

Rinspace 自有软件按 [AGPL-3.0-only 社区许可](LICENSE)发布，同时保留独立商业许可。第三方代码、字体、素材及品牌分别遵守[许可说明](LICENSING.md)、[第三方声明](THIRD_PARTY_NOTICES.md)、[资产许可](ASSET-LICENSES.md)和[商标规则](TRADEMARKS.md)；第三方许可待核实之处仍按声明如实披露。
