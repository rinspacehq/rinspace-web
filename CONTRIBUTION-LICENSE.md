# Rinspace Web Contribution Terms / 贡献条款

> **Migration preparation / 迁移准备：** This frontend candidate carries the existing contribution
> terms for the proposed migration into `rinspacehq/rinspace-web`. Public source cutover and release
> approval remain pending. This status note does not revoke or retroactively change rights already
> granted. / 本候选保留既有贡献规则，公开源码切换与发行仍待批准，不撤销或追溯改变既有权利。

> Version 1.0, dated 2026-09-04. 中文与英文旨在表达同一规则；如有不一致，以中文条款为准。These terms are not a copyright assignment and do not require an external CLA account or form.

## 中文

### 1. 适用范围

“贡献”是您有意通过 Git commit、Pull Request 或项目维护者指定的其他渠道提交、拟纳入 Rinspace Web 的原创或依法取得授权的代码、文档及其他材料。您醒目标注为 `Not a Contribution` 的材料、仅用于讨论的链接，以及按 [`SECURITY.md`](./SECURITY.md) 私密报告的漏洞信息，不属于本条款所称贡献。

本条款中的“Rinspace”指任务优先（上海）网络科技有限责任公司。

### 2. 贡献许可

除非您与 Rinspace 另有有效书面协议，您依照下述签署流程提交的每项贡献，均由您按照仓库内 [`licenses/Apache-2.0.txt`](./licenses/Apache-2.0.txt) 所载 Apache License 2.0 授予 Rinspace 及依法取得该贡献的接收者。该许可包含 Apache License 2.0 第二条列明的复制、创作衍生作品、公开展示、公开表演、再许可和分发权，以及第三条规定范围内的专利许可；具体条件、限制、专利终止和通知义务以 Apache License 2.0 的完整文本为准。

您理解并同意，Rinspace 可以把贡献纳入面向社区的 `AGPL-3.0-only` 版本，也可以在 Rinspace 有权许可的范围内将其纳入另行授权的专有或商业版本，并可以为这些目的修改、组合、分发和再许可贡献。除另有书面约定外，上述使用不需要再次取得您的许可，也不产生报酬、雇佣或必须合并贡献的承诺。

### 3. 权利保留与保证

您保留贡献的著作权；本条款不转让著作权，也不转让作者依法不得转让的人身权。您按照 [`DCO`](./DCO) 1.1 证明自己有权提交贡献，并应在提交前披露第三方代码、素材及其来源和许可证。

如果雇主、客户、学校或其他组织可能拥有或控制该贡献，您须在提交前取得足够授权。代表公司或其他机构提交时，您须具有相应权限。无法确认权限时，请先联系维护者，不要提交。

### 4. 接受方式

每个非豁免 commit 都须包含与该 commit 作者姓名和邮箱一致的签署行：

```text
Signed-off-by: Your Name <you@example.com>
```

使用 `git commit -s` 或 `git commit --signoff` 可以自动添加。签署表示您已阅读并证明符合 DCO 1.1，同时接受本贡献条款。列为 `Co-authored-by` 的每位共同作者也必须添加自己的匹配签署行。补签可以通过修改 commit message 完成，无需注册外部服务、上传证件、填写独立 CLA 或进入公开贡献者名册。

### 5. 个人信息

Git commit、签署行和 Pull Request 是公开记录，通常会由 GitHub、镜像和下游副本长期保存并再分发。请使用您愿意公开的姓名和邮箱；可以使用 GitHub 提供的 `noreply` 邮箱。不要提交身份证件、住址、电话、手写签名、生产数据或其他不必要个人信息。

Rinspace 仅为审查贡献、证明授权、安全审计和争议处理而使用这些公开记录，不另建普通贡献者身份证件库或私密 CLA 台账。个人信息请求可发送至 `lunifans@outlook.com`；但已经进入 Git 历史及下游副本的记录，可能为证明许可、维护项目完整性或履行法定义务而不能从所有副本中删除。

### 6. 大额或机构贡献

普通贡献适用上述仓库内流程。对于权属复杂、由机构集中提供、包含大量既有代码、专利风险较高或维护者认为会显著影响权利链的贡献，Rinspace 可以在合并前要求单独书面协议。提出 Pull Request 不保证合并；在单独协议签署前，维护者可以关闭或暂缓相关贡献。

### 7. 法律适用与版本

本贡献提交与接受流程原则上适用中华人民共和国大陆地区法律；协商不成时，由 Rinspace 住所地有管辖权的中华人民共和国人民法院管辖。本条不改变 Apache License 2.0 对已许可贡献的许可条件。

条款更新只适用于更新后新提交或重新签署的贡献。已经有效授予的许可继续依其提交时版本和 Apache License 2.0 执行。维护者应通过仓库历史保存条款版本，不得以静默修改追溯扩张既有授权。

## English summary

For every intentional Contribution submitted for inclusion in Rinspace Web, unless a separate written agreement applies, you license the Contribution to 任务优先（上海）网络科技有限责任公司 and lawful recipients under Apache License 2.0. You retain copyright. Rinspace may incorporate the Contribution into the `AGPL-3.0-only` community edition and separately licensed proprietary or commercial editions, subject to the Apache License 2.0 terms.

Add a matching `Signed-off-by` trailer to every commit with `git commit -s`. Each co-author needs a matching sign-off. The sign-off certifies DCO 1.1 and accepts these Contribution Terms. Ordinary contributors do not need an external account, identity document, separate CLA form, or private registry. Use an email address you are willing to publish; a GitHub `noreply` address is accepted. Large, corporate, ownership-complex, or patent-sensitive submissions may require a separate written agreement before merge.
