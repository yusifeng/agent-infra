# Research Activity Projection And Runtime UX Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] 当前 research policy gate 会返回结构化 policy result，例如 `blocked_by_policy` 和 `redirected_by_policy`。
- [x] 当前普通用户 UI 仍然能看到内部策略文案，例如“策略收敛 / Search results are already available...”。
- [x] 用户已经明确选择 **方案 B**：policy message 保留在服务端内部链路里，但不进入任何普通用户可见 transcript projection。
- [x] 当前 research activity 的 live 状态和 completed summary 还没有完全分层，真实交互里出现了 `searchLabel` 中间态丢失的问题。
- [x] 当前生成中的自动跟随到底部逻辑仍然会在用户主动往上看历史内容时把视口拖回底部。
- [x] thread `ab13ac5b-a22e-4352-9d5e-37a97756a8b8` 对应 run `1f1ae4ad-9c0d-4147-932c-0ded2d70d46a` 已完成，但数据库中的 thread title 仍为 `New Thread`，说明 auto-title 没有写回成功。

### 0.2 Goals
- [x] policy message 不再进入任何普通用户可见 transcript projection。
- [x] research activity UI 只展示用户可理解的研究摘要和必要细项，不展示内部策略解释。
- [ ] live 搜索/浏览状态与 completed summary 分层明确，`searchLabel` 和中间态稳定。
- [ ] 生成中一旦用户主动向上滚动，就停止自动跟随到底部，直到用户显式恢复跟随。
- [ ] auto-title 失败路径先具备足够 observability，再修复当前未生效问题。

### 0.3 Non-goals
- [x] 不修改 shared infra 的 planner / policy result 基本语义。
- [x] 不引入 `<system-reminder>` 字符串标签作为前后端主协议。
- [x] 不做新的 debug/inspector UI。
- [x] 不在这一轮改变 search budget / openUrl 策略本身。
- [x] 不扩展 replay/share 之外的额外产品面。

## 1. Definitions First

### 1.1 Source of Truth
- [ ] 对齐现有文档：
  - `docs/source-of-truth/playground-search-browse-policy-model.md`
  - `docs/source-of-truth/playground-thread-auto-title-model.md`
- [ ] 在实现稳定后更新相应 source-of-truth，而不是保留并行定义在 todo 中。

### 1.2 Projection boundary
- [x] 明确定义 `policy message` 的边界：
  - 服务端内部 runtime / model-facing 链路中允许存在。
  - 普通用户可见 transcript projection 中禁止出现。
- [x] 明确定义“普通用户可见 transcript projection”的适用面：
  - live chat
  - replay
  - shared snapshot
- [x] 明确定义 research activity UI 允许展示的内容：
  - search summary
  - browse summary
  - query / page title / source 明细
  - 不包含 policy explanation text

### 1.3 Live vs completed activity state
- [ ] 定义 live research status 只来自运行中状态源，例如 `liveAssistantDraft.tools`。
- [ ] 定义 completed summary 只来自 transcript 中已经持久化的 search/openUrl 结果。
- [ ] 明确定义当 live 和 completed 同时存在时的优先级和切换规则，避免 summary 到来后 live label 异常消失或残留。

### 1.4 Follow-output state
- [ ] 定义一个显式的“是否继续跟随输出”状态，而不是只靠 `nearBottom` 推断。
- [ ] 规则定死：
  - 初始生成时默认允许跟随。
  - 用户在生成中手动向上滚动后，立即停止自动跟随。
  - 只有用户显式点击“回到底部/恢复跟随”后才重新跟随。

### 1.5 Auto-title observability
- [ ] 明确定义 auto-title 失败/跳过原因的分类日志：
  - no generator
  - no source text
  - title no longer default
  - provider request failed
  - normalized title empty
  - rename/writeback failed
- [ ] 明确观测目标：
  - 能分辨“没有触发”
  - “触发但生成失败”
  - “生成成功但写回放弃”

## 2. Backend / Platform

### 2.1 Transcript projection filtering
- [x] 找到普通用户可见 transcript DTO / projection 构建位置。
- [x] 在服务端 projection 阶段过滤掉 policy message，不再把这类内部文案下发给 UI。
- [x] 保证 policy result 仍可继续留在服务端内部链路，供模型下一步推理使用。

### 2.2 Auto-title observability and fix
- [ ] 为 auto-title 增加结构化日志和失败原因分类。
- [ ] 用 thread `ab13ac5b-a22e-4352-9d5e-37a97756a8b8` 这类默认标题 case 验证真实失败点。
- [ ] 在确认失败根因后，补最小修复，确保 completed run 的默认标题 thread 能正常自动改名。

## 3. Frontend Boundary

### 3.1 Research activity projection
- [x] 调整 research activity service，使 policy entry 不再进入用户可见摘要。
- [x] 保留 search/browse summary 和细项展示。
- [x] 确保 replay / shared snapshot 也遵守同一可见性规则。

### 3.2 Live status rendering
- [ ] 把 live status 与 completed summary 渲染逻辑拆开。
- [ ] 修复搜索中的中间状态展示，确保 `searchLabel` 和 browse label 在进行中可稳定出现。
- [ ] 避免 live 状态和 completed summary 相互覆盖造成闪断。

### 3.3 Auto-follow behavior
- [ ] 重构生成中自动滚动逻辑，改为基于显式 follow-output 状态。
- [ ] 用户主动上滚后停止自动跟随，不再反复把视口拉回底部。
- [ ] 保留用户显式恢复跟随的路径。

## 4. Tests

### 4.1 Backend tests
- [x] 为 transcript projection 增加测试，确认 policy message 不再进入普通用户可见响应。
- [ ] 为 auto-title observability 增加 focused tests，覆盖主要 skip/failure 分类。
- [ ] 为 auto-title 修复补回归测试，覆盖 completed run 后默认标题 thread 被写回的路径。

### 4.2 Frontend tests
- [x] research activity tests：policy entry 继续参与内部逻辑，但不进入用户可见 summary。
- [ ] live status tests：search/browse 进行中 label 稳定显示，completed summary 到来后正确切换。
- [ ] auto-follow tests：用户滚离底部后，流式更新不再强制滚到底部。
- [ ] replay/shared snapshot tests：不再显示 policy 文案。

## 5. Recommended Execution Order

### Loop 1
- [x] 收紧 projection boundary：
  - 服务端过滤 policy message
  - 前端 research summary 不再展示 policy text
- [x] 跑 targeted tests
- [x] 跑 `codex review`
- [x] clean 后立即提交

### Loop 2
- [ ] 拆分 live status 与 completed summary
- [ ] 修复 `searchLabel` / browse 中间态回归
- [ ] 跑 targeted tests
- [ ] 跑 `codex review`
- [ ] clean 后立即提交

### Loop 3
- [ ] 重构 follow-output 状态
- [ ] 修复用户上滚后仍被拖到底部的问题
- [ ] 跑 targeted tests
- [ ] 跑 `codex review`
- [ ] clean 后立即提交

### Loop 4
- [ ] 补强 auto-title observability
- [ ] 定位并修复默认标题 thread 的 auto-title 失效问题
- [ ] 跑 targeted tests
- [ ] 跑 `codex review`
- [ ] clean 后立即提交

### Loop 5
- [ ] 更新 source-of-truth / README
- [ ] 删除 `docs/todolist.md`
