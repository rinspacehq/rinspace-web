# Rinspace 表世界前端

这里是 Rinspace 现有表世界的 React/Vite 前端，不是另做的一套 Demo。页面、组件、
样式、路由、翻译和浏览器请求代码都在这个目录内；本地接入工具连接正式服务，
不运行 Rinspace 业务数据库。

> 迁移准备状态：这份现有前端源码已公开到 `rinspacehq/rinspace-web`，
> 官网尚未切换消费公开发行；源码公开不等于唯一前端来源已完成切换。
> 本地真实账号授权代码已实现，但正式后端尚未启用，不能宣称已可登录。

## 本地修改页面

使用 Node.js 22 和项目固定的 pnpm 9.7，在本目录执行：

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm dev:real
```

打开 `http://127.0.0.1:5173/`。端口占用时执行
`corepack pnpm dev:real --port 5176`，访问对应端口。修改 `src/` 后由 Vite 热更新，
Ctrl-C 停止服务。现有 `pnpm start` 是原始 Vite 入口，不是默认连接正式服务的入口。

不需要私仓配置、平台管理密钥、测试账号、Cookie/token 导出或本地业务数据库。
当前候选可以匿名读取正式公开数据；安装命令是使用说明，不代表已完成干净环境
安装和正式发行验收。

## 真实账号与本地能力

本地登录的用途是查看和修改本人有权访问的页面，不是提供全部官网功能。
正式授权服务启用后，本地登录入口打开 `rinspace.com`：用户登录自己的账号并
确认授权，随后返回本地页面。前端修改无需提交 PR 或获得逐人开发资格。

当前生产授权接口尚未启用，登录会显示明确的不可用原因；不要复制官网凭据或
关闭来源校验来绕过它。匿名页面开发不需要等待授权上线。

连接的是正式服务，不是虚拟数据。已接入的操作可能影响真实账号和数据；未支持
的业务操作使用官网，不显示模拟成功。Gitea 和里世界入口只打开对应官方网页。
本地不部署 Gitea、Mastodon、Renderer 或代码工作区，也不要求把它们全部接通。

## 源码与检查

| 目录 | 用途 |
| --- | --- |
| `src/` | 实际页面、组件、样式、翻译、路由与请求代码 |
| `public/` | 前端静态资源，已按源码范围审查；发行另行验收 |
| `contracts/` | 前端自身需要的固定契约、路由和测试输入 |
| `scripts/` | 构建、生成与检查工具 |
| `scripts/local-client/` | 本地正式服务连接、授权和会话工具，不包含业务数据库 |
| `tests/`、`playwright/` | 浏览器回归与自动化测试输入 |

```sh
corepack pnpm check
corepack pnpm check:routes
corepack pnpm check:i18n
corepack pnpm check:env-boundary
corepack pnpm check:entrypoints
corepack pnpm check:animate-ui
corepack pnpm check:real-client
corepack pnpm test
```

自动化夹具只用于无生产凭据的测试，不作为默认用户体验。贡献和脱敏要求见
[CONTRIBUTING.md](CONTRIBUTING.md)。现有构建命令为 `pnpm build`；本工作区正式
候选构建只通过获准的固定提交 self-hosted 流程执行。

生产模式沿用现有两项公共 CloudBase 参数的必填检查：
`REACT_APP_CLOUDBASE_ENV_ID` 和 `REACT_APP_CLOUDBASE_ACCESS_KEY`（前端 publishable key）。
这不是平台管理密钥；不要复制生产环境文件。本地 `pnpm dev:real` 不要求这些参数。

产品构建仅使用 `index.html`；构建检查报告在 `build/reports/`，浏览器性能报告在
`test-results/performance/`，不改写待验收的构建产物。浏览器回归从空
匿名状态开始，不依赖维护者保存的会话。生产观测、历史截图和原始组件 catalog
工具属于私仓，不是公开启动或测试的前提。内部实验页及原检查保留在私仓，
通过私仓入口使用独立的实验构建配置，不进入产品构建。

## 官网如何使用贡献

目标是公开仓库成为唯一可编辑前端来源：贡献经维护者审查后产生固定发行，私仓
验证并锁定同一产物的版本、来源提交和摘要，再原样部署。私仓不手工搬页面/CSS，
不维护第二套前端，也不自动把公开 PR 或 `main/latest` 同步到生产。

这条消费链路尚未正式切换。迁移沿用现有 rinspace-web 许可体系：Rinspace 自有
软件采用 AGPL-3.0-only 社区许可，保留独立商业许可；第三方、资产和品牌继续
遵守原 [LICENSE](LICENSE)、[LICENSING.md](LICENSING.md)、
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)、[资产](ASSET-LICENSES.md)与
[商标](TRADEMARKS.md)条款。贡献条款、DCO 和第三方完整许可文本也在本目录内，
不依赖私仓父目录。当前 notice 仍明确记录 SDK 分发许可与其他发行审查的未闭合项。
不另改为 MIT。本次源码已有获批范围和干净来源记录；后续变更继续核对差异，
不能把源码公开直接视为固定发行、私仓消费或官网切换已经完成。
