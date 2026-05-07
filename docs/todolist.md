# Vite Durable Chat 优化待办

这份待办只针对 `apps/playground-vite-web/src/features/durable-chat`。

目标：

- 提升后续新增功能时的可测试性
- 让分层更贴近 [docs/architecture.md](/Users/david/Documents/github/agent-infra/docs/architecture.md) 中的 `Minimal layers`
- 避免继续把纯规则、解析逻辑、边界访问逻辑堆进 `runtime` hook 和大型组件

## 0. 调研与范围确认

- [x] 对照 `docs/architecture.md` 中的 `Minimal layers` 完成一次 Vite durable-chat 结构审查
- [x] 确认当前主要问题不是“没有测试”，而是 `service` / `schema` 缺位，导致逻辑回流到 `runtime` / `components`
- [x] 确认本轮只做 **Vite-only** 优化，不触碰 Next 的 UI 结构

## 1. 当前结构问题清单

### 1.1 `runtime` 过胖

- [ ] 拆解 [apps/playground-vite-web/src/features/durable-chat/runtime/use-durable-chat-runtime.ts](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/runtime/use-durable-chat-runtime.ts) 的职责清单，按 `schema / repo / service / runtime / ui` 重新归类
- [ ] 从 `use-durable-chat-runtime.ts` 中移出 search panel 的未知 shape 解析逻辑
- [ ] 从 `use-durable-chat-runtime.ts` 中移出 search panel 的 view-model 构建逻辑
- [ ] 从 `use-durable-chat-runtime.ts` 中移出纯选择器 / 纯派生逻辑，只保留 orchestration
- [ ] 评估是否需要把 `use-durable-chat-runtime.ts` 进一步拆成多个 runtime 子模块

### 1.2 `service` 层缺位

- [x] 新建 `apps/playground-vite-web/src/features/durable-chat/service/`
- [x] 将 [apps/playground-vite-web/src/features/durable-chat/runtime/build-transcript-blocks.ts](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/runtime/build-transcript-blocks.ts) 迁移到 `service/`
- [x] 将 [apps/playground-vite-web/src/features/durable-chat/runtime/assistant-turn-actions.ts](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/runtime/assistant-turn-actions.ts) 迁移到 `service/`
- [x] 将 [apps/playground-vite-web/src/features/durable-chat/runtime/live-search-tools.ts](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/runtime/live-search-tools.ts) 迁移到 `service/`
- [ ] 评估是否新增统一的 `service/transcript-presentation.ts`，用于收口 persisted transcript + live draft 的展示派生逻辑

### 1.3 `schema` 层缺位

- [x] 新建 `apps/playground-vite-web/src/features/durable-chat/schema/`
- [x] 抽出 `asRecord` 到 `schema/search-panel.ts`
- [x] 抽出 `deriveHostname` 到 `schema/search-panel.ts`
- [x] 抽出 `parseSearchResultItem` 到 `schema/search-panel.ts`
- [x] 抽出 `buildSearchPanelSection` 中的外部 shape 解析部分到 `schema/search-panel.ts`
- [x] 让 runtime 只消费已解析的 search-panel shape，不直接解析未知 `artifact`

### 1.4 `repo` 层过薄

- [x] 让 [apps/playground-vite-web/src/features/durable-chat/repo/chat-api.ts](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/repo/chat-api.ts) 从空壳 re-export 变成真实 facade
- [x] 将 timeline fetch 收口到 `repo/chat-api.ts`
- [x] 将 thread messages fetch 收口到 `repo/chat-api.ts`
- [ ] 评估是否将 search panel 相关数据抓取也统一收口到 repo
- [x] 新建 `repo/browser-clipboard.ts`，承接 `navigator.clipboard` 访问
- [x] 将 `sessionStorage` 的 live draft 读写包装收口到 repo

### 1.5 `ui` 组件里埋了过多展示规则

- [ ] 从 [apps/playground-vite-web/src/features/durable-chat/components/message-list.tsx](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/components/message-list.tsx) 中梳理所有 feature-specific 展示规则
- [x] 把 live assistant 的可复制文本聚合逻辑下沉到 `service`
- [x] 把 search label 是否显示、copy scope、action visibility 等规则下沉到 `service`
- [x] 把 `SearchStatusLabel` 的文案 / 状态映射规则从组件中抽离
- [x] 把 `LiveAssistantContent` 的 segment 组合顺序、可见性判定抽离成纯函数
- [x] 把 [apps/playground-vite-web/src/features/durable-chat/components/search-results-panel.tsx](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/components/search-results-panel.tsx) 的轻量展示规则下沉到 `service/search-panel-presentation.ts`
- [x] 把 [apps/playground-vite-web/src/features/durable-chat/components/composer-dock.tsx](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/components/composer-dock.tsx) 的 toggle / send-button policy 抽成 `service/composer-state.ts`

### 1.6 markdown 相关目录混杂

- [ ] 评估是否将 markdown 相关文件从 `components/` 收口到 `components/markdown/*` 或 `ui/markdown/*`
- [ ] 梳理 [apps/playground-vite-web/src/features/durable-chat/components/markdown-service.ts](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/components/markdown-service.ts) 的职责，确认哪些属于 UI 支撑基础设施，哪些值得单独抽层

## 2. 推荐的渐进式重构顺序

### 第 1 轮：最低风险，先补 `service`

- [x] 迁移纯函数文件到 `service/`
- [x] 保持 import path 和行为不变，只做物理归位
- [x] 保留现有测试，通过迁移验证 service 层落位不会引入行为变化

### 第 2 轮：补 `schema/search-panel.ts`

- [x] 从 `use-durable-chat-runtime.ts` 中移出 search panel 的 shape 解析
- [x] 在 `schema/search-panel.ts` 中为未知 shape 的解析写 focused tests
- [x] 在 `service/search-panel.ts` 中收口 `buildSearchPanelData`

### 第 3 轮：收口 `repo`

- [x] 完成 `repo/chat-api.ts` facade 化
- [x] 将 clipboard 封装挪到 `repo/browser-clipboard.ts`
- [x] 把 `sessionStorage` 读写纳入 repo

### 第 4 轮：runtime 变薄

- [ ] 在 `use-durable-chat-runtime.ts` 中只保留 orchestration / side effects
- [x] 评估是否将 live draft 恢复与轮询拆成 `runtime/live-draft-recovery.ts`
- [x] 评估是否将 transcript / search panel 的状态协调拆成更窄的 runtime 模块

## 3. 测试补强待办

### 3.1 repo tests

- [x] 为 `repo/chat-api.ts` 增加边界测试
- [x] 覆盖 HTTP 成功/失败路径
- [x] 覆盖 storage read/write 解析失败路径
- [x] 覆盖 clipboard repo 的浏览器边界行为

### 3.2 service tests

- [ ] 将 transcript block 的纯函数测试迁移为 service 语义
- [ ] 将 assistant turn action scope 的纯函数测试迁移为 service 语义
- [ ] 将 live search entry derivation 的纯函数测试迁移为 service 语义
- [x] 为 search panel 的 parse/build 逻辑新增 schema/service tests
- [ ] 后续新增功能优先要求：每个新展示规则先有 service test
- [ ] 后续新增功能优先要求：每个新 copy/merge/derive/parse 先有 service test

### 3.3 runtime tests

- [ ] 为 `useDurableChatRuntime` 增加 hook 级行为测试
- [ ] 覆盖 active thread 切换
- [ ] 覆盖 restored live draft 恢复
- [ ] 覆盖 refresh loop 行为
- [ ] 覆盖 open search result 时 timeline -> panel data 链路
- [ ] 覆盖 reconcile after run completed

### 3.4 UI tests

- [ ] 为 `ChatMessageList` 增加组件测试
- [ ] 覆盖 persisted transcript + live draft 同时存在时的展示
- [ ] 覆盖 search label / search status / actions 的正确出现与隐藏
- [x] 为 `SearchResultsPanel` 增加 loading / error / populated 三态测试
- [ ] 为 `ComposerDock` 增加 toggle disabled/enabled 与 send button 状态测试
- [ ] 为 `site-icon-badge` 增加 hostname / fallback 测试

## 4. 需要持续遵守的新增功能规则

- [ ] 新功能接入外部数据 shape 时，优先进入 `schema` / `repo`
- [ ] 新功能的纯 derive / merge / display rule 优先进入 `service`
- [ ] `runtime` 只做 orchestration 和 side effects
- [ ] `ui` 只做 props 绑定与 interaction
- [ ] 不再把长期 feature policy 直接写进大型组件或 fat hook

## 5. 当前可先不动的部分

- [ ] 保持 [apps/playground-vite-web/src/features/durable-chat/durable-chat-console.tsx](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/durable-chat-console.tsx) 作为当前组合根，不做过度抽象
- [ ] 保持 [apps/playground-vite-web/src/features/durable-chat/runtime/use-chat-session-controller.ts](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/runtime/use-chat-session-controller.ts) 当前形态，除非后续状态机复杂度继续上升
- [ ] 保持 [apps/playground-vite-web/src/features/durable-chat/runtime/use-run-inspector-controller.ts](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/runtime/use-run-inspector-controller.ts) 当前形态，先不动

## 6. 备注

- [ ] 不做“大重构”作为前提条件
- [ ] 优先做低风险、高收益、可逐轮提交的整理
- [ ] 每一轮重构都需要带上 targeted verification
- [ ] 每一轮重构都优先保持行为不变，再追求层次更纯
