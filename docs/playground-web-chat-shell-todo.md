# Playground Web Chat Shell TODO

本清单用于把 `apps/playground-web` 的聊天页面从“借鉴项目 + 外部样式库耦合”继续收敛到“本地可维护实现”，同时保持当前参考样式不回退。

## 目标

- 保持 `/new` 与 `/chat/[threadId]` 的视觉结构和参考项目一致。
- 继续去掉页面级外部 UI 栈耦合，避免后续只能靠 patch 维持。
- 不改变任何 durable chat 的后端 API、DTO、SSE 协议和业务语义。

## Mainline

- [x] 用本地 chat-shell theme/provider 替代 route-group 级别的外部 provider
- [x] 从 `playground-web` 中移除已无代码引用的 `@lobehub/ui`、`@lobehub/icons`、`framer-motion`、`@ant-design/nextjs-registry`、`antd`、`antd-style`
- [x] 建立本地 `chat-shell` 组件目录，拆分 monolithic `durable-chat-console`
- [x] 抽离 `Sidebar` / `ChatHeader` / `WelcomeState`
- [x] 抽离 `MessageList` / `MessageItem` / `MessageActions`
- [x] 抽离 `ComposerDock`，固定 sticky 结构与消息区滚动边界
- [x] 抽离 `DurableLogPane`
- [x] 清理 `durable-chat-console` 仅保留状态编排、数据请求与组件装配
- [x] 运行 `pnpm --filter playground-web typecheck`
- [x] 运行 `pnpm --filter playground-web build`
- [x] 用本地 dev 快照检查 `/new` 与至少一个已有 thread 页面

## Phase 2: Style Fidelity

- [x] 把 sidebar 背景与 list item 结构向参考项目靠拢
- [x] 补齐 thread 分组折叠与 hover action 占位结构
- [x] 补齐 message action 区的 copy / regenerate / delete 视觉位
- [x] 调整 composer 的 sticky 按钮、textarea 高度与 action icon 尺寸
- [x] 再次运行 `pnpm --filter playground-web typecheck`
- [x] 再次运行 `pnpm --filter playground-web build`
- [x] 再次用本地 dev 快照检查 `/new` 与已有 thread 页面
- [x] 继续对照参考项目收紧 `message typography` 与 assistant 内容宽度
- [x] 继续对照参考项目收紧 `sidebar` 底部区域与 item hover 交互
- [x] 继续对照参考项目收紧 `composer` 的模型选择器与右侧按钮视觉

## Phase 3: Final Polish

- [x] 复核 `/new` 空状态与参考项目在垂直位置、标题字号、描述宽度上的偏差
- [x] 复核已有 thread 页面在 user bubble 尺寸、assistant 段落间距上的偏差
- [x] 复核大宽度屏幕下 sidebar / chat / log 三列切换时的最终视觉一致性

## Phase 4: Markdown

- [x] 引入本地 `markdownService`，替换 assistant 纯文本段落分割渲染
- [x] 新增本地 `MarkdownRenderer` 与 worker，避免重新引入外部 chat UI 栈
- [x] 补齐基础 markdown 样式、代码块复制按钮和安全清洗
- [x] 接入本地 `shiki`，补齐 markdown 代码块高亮
- [x] 收紧 assistant markdown 的段落间距和 block 动画

## Acceptance

- `durable-chat-console.tsx` 不再承载整页 UI 细节。
- 聊天壳的视觉 token 与组件结构落在本地文件中，可继续替换成 shadcn 风格 primitives，而不是依赖整套借鉴库。
- `playground-web` 构建、类型检查、基本页面渲染正常。
