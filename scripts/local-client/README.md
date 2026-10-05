# 本地正式服务连接

同一套现有 React 页面在本地运行、热更新，默认连接 `https://rinspace.com`。
不运行业务数据库、不使用共享测试账号、不复制官网 Cookie/token；测试夹具只供
自动化检查，用户启动入口从不加载它。

当前不是已开源或已部署的完整客户端：授权闭环、原安全中心与上传运输已通过隔离 Chromium，
但生产 native config 只读检查为 404，后端仍默认关闭。此时仅能匿名读取正式公开
数据，不能用这个入口验收真实登录或喜欢/收藏。当前状态和页面开发入口见
[前端 README](../../README.md)。

## 运行

在私仓功能工作树的 `ui/` 中，使用 Node.js 22 和仓库固定的 pnpm 9.7：

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm dev:real
# 默认 http://127.0.0.1:5173/；端口占用时：
corepack pnpm dev:real --port 5176
```

根目录也可执行 `npm run dev:real`。修改现有 `ui/src/`，Vite 负责热更新；Ctrl-C
停止。不要改成 LAN、0.0.0.0 或公开域名。普通 start/build、常规 Vite 与发布入口
未修改；本入口不接受任意上游，不读取生产环境文件或平台管理凭据。

## 官网授权流程与边界

后端与官网候选经受审查部署并明确启用后：

1. 点击现有登录入口，再选择“前往官网授权”。本地不填写手机号/验证码。
2. 在固定 rinspace.com 确认页查看真实账号、回调与正式数据风险；未登录时先用
   官网现有流程登录自己的账号。只授权自己信任并主动运行的代码。
3. 用户主动允许后，官网以一次性 code/state/issuer 返回独立 loopback listener。
   本地进程做 PKCE 兑换，并查询正式 session 确认账号后才接入。
4. 返回同一套本地页面；既有身份接口得到正式确认的状态与本地 CSRF。允许清单的
   业务请求附加进程内 Bearer，权限、封禁、审核、配额仍由正式服务执行。
5. 页面刷新与 HMR 保留会话；重启工具须重新授权。本地退出仅撤销当前本地 SID，
   不退出官网设备。设备管理/全局撤销的正式身份规则保持不变。

临时回调 3 分钟后退役；取消或超时须重新开始。完成/取消后返回本地，回调 URL
清除 code，页面无外部资源；无效回调也清除敏感 query。关闭 keep-alive，不复用
已消费 listener。浏览器仅持本地 HttpOnly、SameSite=Lax 标识与本地 CSRF；
access/refresh/verifier 留在进程内，不写 .env、Git、日志或浏览器存储。

Host、精确 Origin、Fetch Metadata 和 WebSocket 来源限制保持开启；写入还需本地
会话与 CSRF。Cookie 不按端口隔离，这里不宣称隔离同 OS 用户下的恶意程序。
传入正式 Cookie、外来 Authorization/CSRF、设备、内部签名和转发头均不向官方
转发；官方 Cookie、认证挑战、CORS、重定向也不交给本地浏览器。

续期串行协调，网络重试保留同一 request ID，包括官方已轮换但回复丢失的情况。
网络故障显示暂时不可用，不模拟登录/写入成功，不自动重试业务写入。
本地前端的 401 恢复只自动重试 GET/HEAD；业务写入的原错误留给用户判断。工具会在
转发前续期/核对正式会话，普通官网的既有恢复规则保持不变。

## 文件连接的当前状态

既有头像/封面/附件/资料服务保持原格式。精确 `POST /api/file` 的总 body 上限为
81 MiB，对齐正式服务的 80 MiB 附件及 multipart 开销；其他 API 仍为 32 MiB。
实际可用文件大小、类型、权限、审核与配额由原前端/正式后端决定，不是都可以传
80 MiB。工具完整接收 body 后再次核对会话，单文件串行，失败不发送部分请求、不
自动重放、不写磁盘；并发 429，请求超限 413。接收 body 30 秒，文件上游 120 秒。

直接字节响应保留 Range/条件请求、HEAD/304/416、文件名与 UTF-8 filename*；
不复制正式 Cookie、CORS、认证挑战、响应长度/编码或执行 API 数据文档。
**正式 PDF/历史 file blob 仍未接通**：它们使用 307/302，当前工具明确拒绝上游跳转。
隔离直接字节测试不代表这些实际下载已经成功。未提供本地接入的业务能力使用
官网，不把完整下载或所有业务功能作为前端开源的前置条件。

## 原安全中心与二次验证

服务获授权上线后，原 `/settings` 可读取同一正式设备与个人凭据元数据，并执行
单台/当前/全部设备退出、个人凭据撤销及全部安全撤销。核验表单和样式不变：本地
进程调用已配置的正式 CloudBase 验证入口，正式 Rinspace 服务检查其 subject 与
本地 UID/SID/用途/目标。只有 canonical public client ID 可进入本地 config；不需要
用户复制生产环境文件或供应商密钥。常规官网核验请求保持不变。

provider challenge/token 与正式 action proof 留在进程内，浏览器只持短期随机
handle；本地会话、Origin/CSRF、发码间隔/尝试上限、绑定/期限/并发检查仍开启。
错码、captcha、限流或设施错误不会显示完成或退出有效账号；尚未实现图片验证码
交互。退出当前/全部会话需重新授权，撤销其他设备或单项个人凭据不会退出本地。
远端清理未完成时保留 pending 状态，不称所有运行面已清理。

## 当前未完成项

- 生产接口和同意页尚未启用；无授权写入仍为 503，不发送到正式业务服务。
  `/__rinspace_local/status` 区分本地已实现与后端启用需求；固定 config 尚未确认时
  authorizationReady=false。配置尚未上线时，登录按钮显示明确错误。
- 上述安全操作只通过合成供应商与隔离数据库/浏览器检查；真实短信、账号及图片
  验证码仍待获授权验收。其余身份操作未全部适配，不盲目代理 Cookie-only 接口。
- 81 MiB 上传运输与直接字节响应只通过隔离检查，未上传/下载正式私有文件；PDF/
  blob 跳转、Writer/Quiver、渲染与代码工作区仍未全部接通，不把 SPA fallback 当成功。
  Gitea 与里世界只跳官方网页，不做本地运行时。
- 真实账号与喜欢/收藏/评论/上传/发布验收尚未执行。生产操作需由账号持有人或
  明确获授权者主动进行，记录对象和恢复方式。
- 现有 rinspacehq/rinspace-web 已进入迁移准备，保留历史与贡献；内容迁移、公开
  许可/输入及私仓固定发行消费尚未完成，不从其历史 UI 开发当前产品。

以上是实施阶段边界。核心目标是用户修改同一份真实表世界前端，需要时用自己的
账号查看受保护页面；不要求本地执行全部业务操作，修改前端不需要先提交 PR。

## 检查

```sh
corepack pnpm check:real-client
corepack pnpm check
corepack pnpm check:env-boundary
corepack pnpm check:i18n
# 合成隔离 Chromium 全授权流程；不访问生产账号/数据：
node scripts/local-client/check-authorization-browser.mjs
# 启动工具后，显式允许全新 Chromium 匿名读取正式服务：
node scripts/local-client/check-browser.mjs --live-read-only --port 5173
```

浏览器授权检查拦截整个正式域名，使用合成账号/数据和本地 Vite 资源，原官网登录
只检查表单入口、不发送短信；原设置页核验/撤销使用合成供应商，不发真实短信。
文件检查调用原上传/资料服务模块，只传隔离供应商；并不是生产文件验证或所有上传
表单的端到端验收。
两个测试配置使用独立 node_modules 预编译缓存。
夹具中的喜欢/收藏不是生产验证，也不作为用户日常客户端的虚拟数据库。

维护者可在匿名只读检查加 `--hmr-probe`，从外部用 apply_patch 临时给
`src/styles/index.css` 加 `:root { --rin-local-hmr-probe: v1; }`，向进程输入 v1；
改成 v2 并输入 v2。完成后移除该行、输入 close，确认原样式无 diff。脚本本身不
修改源码。正式构建、数据库迁移、发布与部署仍只走既有获批私仓流程。
