# Vite Durable Chat 分层清单

这份清单只针对 `apps/playground-vite-web/src/features/durable-chat`，用于约束 `use-durable-chat-runtime.ts` 的职责边界，避免后续新增功能继续把解析、纯派生和展示规则堆回 runtime。

## schema

职责：

- 接收未知外部 shape
- 做最小安全解析
- 输出已知、可消费的数据结构

当前文件：

- `schema/search-panel.ts`

不应再进入 runtime 的内容：

- `artifact` / `details` 的未知 shape 判定
- hostname/source/result item 的容错解析

## repo

职责：

- 承接 durable-chat-client HTTP facade
- 承接浏览器边界访问
- 返回“边界已经处理过”的结果，不让 runtime 直接碰底层 API 细节

当前文件：

- `repo/chat-api.ts`
- `repo/browser-clipboard.ts`
- `repo/live-draft-storage.ts`

不应再进入 runtime 的内容：

- thread messages / runs / timeline 的直接 fetch
- search tool invocation 的过滤
- `navigator.clipboard`
- `sessionStorage`

## service

职责：

- 纯 derive / merge / display rule
- transcript / search / composer 的 view-model 计算
- 不做副作用，不访问浏览器 API

当前文件：

- `service/build-transcript-blocks.ts`
- `service/transcript-presentation.ts`
- `service/assistant-turn-actions.ts`
- `service/live-assistant-presentation.ts`
- `service/live-search-tools.ts`
- `service/search-label-presentation.ts`
- `service/search-panel.ts`
- `service/search-panel-presentation.ts`
- `service/composer-state.ts`
- `service/chat-view-state.ts`

不应再进入 runtime / ui 的内容：

- transcript block 构建
- copy scope / action visibility
- live search entry 汇总
- search label / status 文案映射
- composer toggle / send button policy
- search panel view-model 构建

## runtime

职责：

- orchestration
- side effects
- feature state 协调
- 把 repo/service 串成可供 UI 消费的运行时接口

当前文件：

- `runtime/use-durable-chat-runtime.ts`
- `runtime/live-draft-recovery.ts`
- `runtime/search-panel-controller.ts`
- `runtime/use-search-panel-state.ts`

runtime 当前仍然应该保留的内容：

- route/thread 切换
- hydration / reconcile
- send / stop / load older messages
- scroll / viewport / textarea side effects
- live draft 恢复与刷新 loop

## ui

职责：

- props 绑定
- interaction
- 视觉层组合

当前文件：

- `components/message-list.tsx`
- `components/composer-dock.tsx`
- `components/search-results-panel.tsx`
- `components/site-icon-badge.tsx`

UI 不应继续吸收的内容：

- search/result artifact 解析
- transcript 合并规则
- copy scope / action policy
- provider/model feature gating

## 对 `use-durable-chat-runtime.ts` 的当前判断

当前已经移出的内容：

- search panel 未知 shape 解析
- search panel view-model 构建
- transcript 展示派生
- search panel 本地状态编排
- live draft 恢复逻辑

当前仍留在 `use-durable-chat-runtime.ts` 的合理职责：

- orchestration
- refs / abort controller 管理
- route-aware hydration
- scroll / textarea side effects
- send / load / reconcile 的流程编排

下一步如果继续变薄，优先顺序应是：

1. 保持 runtime 只组合已有 repo/service/runtime 子模块
2. 不为了拆 hook 而拆 hook
3. 只有当某块 side effect 真正独立时，再继续下沉到 runtime 子模块
