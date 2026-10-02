# 用户资料页改动说明

日期：2026-10-02

范围：`/@demo-orbit-reader` 及其他用户资料页。

## 已修改的代码

| 文件 | 修改内容 |
| --- | --- |
| `src/pages/Profile/index.tsx` | 为「关于」内容的 iframe 注入明暗主题基础样式，解决深色模式下 HTML 内容仍显示白底的问题；个人网站链接只接受 `http` 和 `https` 地址，显示域名并以新标签页打开。 |
| `src/styles/migrated-pages.css` | 收紧封面、资料栏和操作区的间距；桌面端将资料区整理为三列；缩短「关于」区域的默认高度；为网站链接加入简洁、可截断的胶囊样式。 |
| `src/demo/mock/identity.ts` | 为确定性的演示用户 `@demo-orbit-reader` 提供个人网站示例地址。 |
| `src/demo/mock/handlers.test.ts` | 断言演示资料接口返回该网站地址。 |
| `src/pages/Profile/ProfileLocalization.test.tsx` | 覆盖深色模式下的「关于」内容、网站链接地址、新窗口行为，以及链接不含图片节点。 |

## 个人网站链接的最终行为

- 显示网站域名，例如 `orbit-reader.example`。
- 保留外链箭头，并在新标签页打开。
- 不显示 favicon，不请求 `/favicon.ico`，也不提供 favicon 配置字段。
- 非 `http` 或 `https` 的地址不会被渲染为链接。

## 如何预览

在项目根目录运行：

```powershell
pnpm start
```

打开 `http://localhost:5173/@demo-orbit-reader`，刷新页面即可看到最终效果。

## 验证结果

- `pnpm check`：通过。
- `pnpm lint`：通过，存在 9 条与本次无关的既有 React Hooks 依赖警告。
- `pnpm test`：通过，120 个测试文件、553 项测试。
