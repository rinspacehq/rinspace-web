# 新前端检查与候选产物流程 / Frontend checks and candidate artifacts

这些流程随当前前端源码公开，不复用历史 Demo/容器/发布流程。源码公开和公开
main 的审查合入不等于官网切换；未调度正式构建、发行或部署。既有 1036 文件
中只同步 README 的迁移状态和三个隔离检查/回归工具的运行时布局，其余 1032 文件
保持原字节；新增流程控制输入逐提交审查。

These workflows accompany the published frontend, not historical demo releases. Public source
and main integration do not activate production inputs or authorize builds, releases or deployment.
Only migration-status documentation and the isolated runtime layout in three check/test tools
differ from the reviewed source baseline; control inputs require review of each new commit.

## PR 与 DCO

- ci.yml 使用一次性 GitHub-hosted Ubuntu runner。冻结依赖安装禁用生命周期脚本和
  pnpm hooks；现有类型、路由、翻译、模板、全部 UI 单测、本地连接与发行工具检查
  在空凭据环境、无网络、无私仓挂载的 bubblewrap 中运行。不作正式构建。
- dco.yml 的 pull_request_target 仅读取提交元数据，检出的是受信任 base SHA，
  不检出、不安装、不执行 PR head。逐提交核对作者及共同作者的真实 trailer 签署；
  超过 250 个提交的 PR 要求拆分，不截断后冒充完成。
  Job 名称保留现有必需状态检查，不修改或绕过 main 的 DCO 保护规则。
- 两者只有只读权限，不使用生产 secrets、不共享正式构建缓存；外部 PR 不进入
  私仓、生产或正式构建 runner。Action 均锁定已核对的官方完整 commit SHA。

PR checks run on disposable hosted runners with no production secrets. DCO uses trusted-base
code and PR metadata only. External PR code never runs on a private or production runner.

公开 PR 检查固定使用 ubuntu-22.04。首次 Ubuntu 24.04 hosted run
[37264175473](https://github.com/rinspacehq/rinspace-web/actions/runs/37264175473)
在隔离启动时报告 `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`，
测试尚未开始；DCO 同次通过。这是实际 runner 的命名空间初始化兼容性问题，
不能以本地通过替代远端验证。改用 GitHub 仍支持的 Ubuntu 22.04 hosted image，
保留原 bubblewrap 的网络/PID 隔离、空凭据环境和全部检查，不改内核保护设置。
具体 LSM 拒绝规则未在该次 run 中直接采集，不将 AppArmor 推断写成已确认事实。
参考 [GitHub runner 镜像](https://github.com/actions/runner-images)与
[Ubuntu 安全特性表](https://documentation.ubuntu.com/security/security-features/security-features-tables/)；
修复是否通过以该 PR 的新 GitHub run 为准。

第二次 Ubuntu 22.04 run
[37264454946](https://github.com/rinspacehq/rinspace-web/actions/runs/37264454946)
已越过网络命名空间初始化，随后因 hosted Node 位于工具缓存、只读 `/usr` 下
没有 `/usr/bin/node` 挂载点而停止。隔离入口把同一固定 Node 二进制只读挂到自己
的 `/tools/node`，PATH 只增加这个目录；不改系统目录、隔离边界或业务代码。
该路径布局增加回归，并在本地以只读且无 Node 的 `/usr/bin` 实际验证。

第三次 run
[37264759383](https://github.com/rinspacehq/rinspace-web/actions/runs/37264759383)
外层隔离探针已通过，源码独立入口的内层隔离仍调用系统 Node 而停止。
两个入口现统一只读挂载当前固定运行时到 `/tools/node`；内层改动先落在私仓
干净来源提交再同步，所有页面、业务请求和隔离检查阶段保持不变。
修复后的本地嵌套检查在不可用系统 Node 的布局中通过类型/路由/模板/翻译阶段；
完整隔离入口另通过 135 文件 / 1082 UI 测试与 61 项本地/发行工具测试。
完整入口复用既有冻结依赖，不冒充 hosted runner 的新安装或远端结果。

第四次 run
[37265749774](https://github.com/rinspacehq/rinspace-web/actions/runs/37265749774)
已执行到入口测试：Playwright 读取用户目录时报告 `uv_os_homedir returned ENOENT`。
空凭据环境不挂载 host passwd/profile，且 runner 不是 root；本地 UID 1001 沙箱
复现同一错误。按 [Node 的用户目录约定](https://nodejs.org/api/os.html#oshomedir)，
两个隔离入口显式使用沙箱 tmpfs 内新建的空 HOME；不继承宿主 HOME、不挂载
宿主账号目录或凭据。内层改动仍先来自私仓干净来源，业务代码不变。
本地非 root 检查发现输入回归的子进程另外清空环境，也丢弃了这个 HOME；
回归保留全部原断言，为该子进程单独分配并清理空临时用户目录。可选浏览器检查
的清空环境子进程也显式使用沙箱 HOME，避免同一问题再次落到另一入口。
本地按同一 lock 新安装 902 个依赖（禁用生命周期/hooks，复用下载存储，不改 lock），
在 UID 1001、无可用系统 Node、空临时 HOME、无账号/私仓输入的沙箱中完成全部
135 文件 / 1082 UI 测试与 62 项本地/发行工具测试；私仓来源的类型/输入检查也通过。
该结果仍不代替最终提交的 GitHub CI，不作正式构建或真实账号上线验收。

## 固定候选：默认关闭，构建不等于发布

frontend-candidate.yml 只有显式 workflow_dispatch。它要求 canonical main 上的
完整提交同时等于 workflow SHA、远端 main 和已批准 source SHA；版本必须是明确
vMAJOR.MINOR.PATCH，且不能覆盖已有 tag/release。它没有写仓库、创建 Release、
推送 tag、调用私仓或部署的步骤。

这个阶段只在隔离 runner 的 `/stage/<run-id>/` 留存一次构建出的候选字节与摘要，
不上传公开 Actions artifact。启用前由负责人另行确认：

1. 源码/新增流程与署名审查、源码公开和该次内部候选构建调度授权；公开编译产物
   的完整再分发许可审查仍单独待办。
2. frontend-candidate 环境的 main-only 和人工审批保护已实际设置；仅声明 environment
   名称不会自动设置这些保护。不得从当前工作区自动创建或放开这些配置。
3. 隔离的一次性 self-hosted runner 已准备，含 Node 22.22.3、pnpm 9.7.0、Linux
   bubblewrap；标签须同时包括 rinspace-release-build 和
   rinspace-public-frontend-isolated。不能把后一个标签贴到既有私仓/生产 runner。
   无 Docker socket、生产挂载、云管理身份、用户 npm 配置或私仓/生产缓存，完成后销毁。
   注册必须加 --no-default-labels，只设置上述两个专用标签；候选 job 也仅匹配它们。
   不保留通用 self-hosted/Linux/X64 标签，否则历史 PR 的通用排队任务也可选中它。
   This is still a Linux x64 self-hosted runner; omitting default routing labels prevents
   unrelated generic jobs from claiming the single-use candidate runner.
4. 在受保护环境中明确设置 RINSPACE_FRONTEND_CANDIDATE_ENABLED、
   RINSPACE_FRONTEND_ISOLATED_RUNNER_APPROVED 为 true，
   RINSPACE_FRONTEND_DISTRIBUTION_APPROVED 保持 false；
   RINSPACE_FRONTEND_REVIEWED_SOURCE/REVIEWED_VERSION 为该次精确值。
   缺少批准时流程失败，不生成候选；本 workflow 也拒绝分发开关变为 true。
5. RINSPACE_FRONTEND_COMPATIBILITY 是已双方评审的 api/identity/shared JSON，
   不是由候选自己宣称私仓支持。RINSPACE_FRONTEND_PUBLIC_CONFIG 只含经审查的
   浏览器公开配置；两项 CloudBase 必填参数中的 access key 是 publishable key，
   不是管理密钥。不得复制生产 .env、私有账号/管理手机号摘要或 server 配置。

The candidate workflow stays disabled until exact source/version and isolated-runner approvals
are configured. It requires distribution approval to remain false and never uploads a public
artifact. A protected environment and an isolated ephemeral runner are separate prerequisites.

构建在仅含公开输入和固定安装依赖的临时副本中进行，原工作树不修改。原 build
pipeline 执行一次；实际检查结果绑定 source、lock、public config。产物包含：

- site/：完整原始构建字节，不混入旧静态资源或私仓补丁。
- shared/：顶栏/发帖组件、相对依赖、样式、品牌与完整法律输入的固定原字节；
  contract.json 声明固定第三方依赖和 consumer-owned runtime bridge，原始 Animate
  catalog 不进入包，也不作为一个独立组件库分发。Mastodon 适配器本次不改接。
- manifest.json：完整来源、版本、兼容、lock/config 摘要、逐文件大小和 SHA-256。
- LICENSE、THIRD_PARTY_NOTICES、CycloneDX sbom.json 与 provenance.json。
- 外部 public-evidence.json 和 checksums.txt：绑定同一个 tar.gz 与 manifest 摘要。

归档采用私仓已准备消费的严格 ustar-gzip-v1；只含普通、不可执行文件，manifest
不自引用。依赖清单来自同一冻结安装的 pnpm licenses list --json，包含开发与运行
依赖，去除本机路径和作者邮箱。许可证字段只是包元数据，不保证所有依赖已获
分发许可；已披露的 wx-cloud-client-sdk 1.8.10 准确版本许可未知不会被补造。

The site is packaged byte-for-byte; metadata binds the same immutable candidate. Shared inputs
are only for existing one-way integration. The SBOM records installed metadata, not license grants.

## 后续私仓消费

候选仅留在专用 runner 宿主的私有 stage 目录，不是公开发行。宿主从已停机的
一次性 runner 取出相同 tar.gz/证据，并以固定摘要交给私仓进行独立、无生产
凭据的集成检查，绑定 integration commit/change ID 与 compatibility；公开构建
日志不能伪造私仓验收。双方接受且完成编译产物分发审查后，另获授权把这些原字节
发布为固定 GitHub Release，
私仓锁定精确 URL/版本/摘要，再改接已有 runtime/部署消费者和保留回退产物。
公开来源正式切换及删除私仓重复前端仍待单独验收，productionAuthorized 始终 false。

Private integration, immutable release publication, production consumption, rollback acceptance,
backend authorization rollout and source cutover are separate pending steps, not completed here.

安全设计参考：[GitHub Actions 安全指南](https://docs.github.com/en/actions/reference/security/secure-use)
和[环境保护说明](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)。

## 源码公开前的本地验证记录 / Pre-publication local validation — 2026-10-05

- 当前修改为 11 个新增流程/脚本/测试/说明文件；原 1036 个迁出文件逐字节复核
  一致，原范围摘要仍为 6638fa3315dab6a16f1158f87111418313dc4653b131cc357ab4393e24865528。
  私仓实现、生产配置、旧原工作树和既有发布门禁未修改。新流程仅保存在本地，
  尚未推送；本地提交不授权源码公开、实际构建、发行或生产切换。
- Node 语法、Ruby YAML 解析和 actionlint 1.7.11 通过；自定义 runner 标签明确声明。
  actionlint 此处未使用 shellcheck，不宣称 shellcheck 或实际 GitHub run 已通过。
- 新增 20 项测试在空环境、无网络、无私仓挂载下通过；实际共享源码闭包核对通过。
  按 pnpm 9 的实际 versions 数组格式扩展全部版本，修正后再次通过 20 项测试。
- 新隔离入口的完整 UI 首跑 1081/1082 通过；既有 BlogMarkdown“保存草稿不改变
  公开版本”断言失败，流程随即停止，未跳过、未删改断言或构建。该文件原样定向
  复查 10/10 通过，完整入口原样重跑通过 135 文件/1082 UI 测试，随后 40 本地
  工具和 20 发行工具测试通过。首跑失败保留为稳定性观察，不声称从未失败。
- 此次检查复用既有冻结 lock 的安装依赖，不是新安装。既有安装的真实 pnpm 9
  licenses JSON 解析到 898 个去重的包版本，清除路径/作者字段；SDK 1.8.10 的
  元数据标签为 Unknown，不升级为许可证已获确认。新 runner 的实际安装、完整
  生命周期需求、正式构建、发行署名审查和实际上传仍未验收。
- 公共打包函数生成的明确合成 ustar 包通过私仓现有摘要/清单/隔离落盘检查，
  含长路径前缀；落盘页面与输入原字节相同，篡改和不兼容被拒绝。只清理本次
  产生的合成临时目录，未安装真实产品，不能作为私仓实际同包消费完成的证据。

Syntax/YAML/actionlint, the 20 current release-tool tests, unchanged-source checks and synthetic
private-consumer interoperability passed. Full frontend checks passed on rerun; the first-run
UI failure is retained above. No actual build, upload, release, backend rollout or cutover ran.
