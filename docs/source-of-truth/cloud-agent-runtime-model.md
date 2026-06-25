# Cloud Agent Runtime 模型说明

这份说明定义 `apps/cloud-agent-next-web` 与 `packages/cloud-agent-runtime`
当前采用的云端 Agent Runtime 概念模型。

它记录的是长期事实和边界，不是某一次 cleanup 的执行步骤。临时调研、smoke
输出和待办仍然保留在 `docs/cloud-agent-runtime-alignment.md` 或任务 todo 中。

## 当前状态

Cloud Agent Runtime 当前以两个真实 coding-agent provider 作为验证目标：

- Claude Code SDK
- Codex SDK

当前目标不是继续增加第三个 SDK，而是把已有 provider 路径收敛成一条稳定的
runtime 主线：

- provider adapter 负责和真实 SDK 对接
- Docker 是当前可验证的 sandbox baseline
- app host 负责 auth、thread ownership、DB wiring、route/stream、queue/worker
- package runtime 负责 provider-neutral adapter contract、runtime event builders、
  provider transcript append helper、Docker process primitives、provider config helpers

## 核心对象

### 1. Product Thread

Product thread 是宿主产品中的对话入口。

它负责表达：

- 用户正在和哪个 runtime provider 对话
- 产品侧 thread id
- 产品侧消息列表
- 当前 active provider session binding

Product thread 不等同于 provider-native session。Claude 和 Codex 可以有自己的
session/thread id；这些 id 通过 provider session binding 连接到 product thread。

### 2. Run

Run 是一次用户消息触发的 agent execution。

Run 负责表达：

- 哪条 product thread 被执行
- 触发它的 user message
- provider id
- run lifecycle status
- durable runtime events
- tool invocation projection
- final assistant message

Run 可以因为 provider-native resume 失败而在同一个 run 内执行一次受控 fallback。
这种 fallback 必须留下 `provider_session_recovery` event，并归档旧 provider session
binding。

### 3. Provider Session Binding

Provider session binding 是 product thread 和 SDK-native session/thread 的桥。

它必须记录：

- product thread id
- provider id
- provider session id
- provider config home identity / project key
- active 或 archived 状态

同一 product thread 同一 provider 在正常情况下只有一个 active binding。resume
失败时，旧 binding 归档，新 binding 在 fallback run 中创建。

### 4. Raw Provider Transcript

Raw provider transcript 是 SDK 原始消息、事件或 JSONL 的审计副本。

它的职责是：

- 保留 provider-native 细节
- 支持后续 debug、恢复、replay、审计
- 不污染产品消息 schema
- 不强迫 app route 理解 Claude 或 Codex 私有格式

Raw transcript 不应被直接当作 product messages。产品消息和 UI timeline 使用
normalized runtime events 与 final assistant message projection。

### 5. Normalized Runtime Events

Normalized runtime events 是 provider-neutral timeline。

稳定事件族包括：

- run lifecycle
- assistant message delta / completed
- tool call started / delta / completed / failed
- file or workspace change
- usage
- permission requested / resolved
- provider session bound / recovery
- provider raw transcript reference
- sandbox or process failure

Provider adapter 可以保留 provider-specific extension payload，但 app route 和 browser
stream 不应依赖 Claude/Codex 原始事件格式作为主契约。

## Workspace And Sandbox

### 1. 默认 workspace 策略

当前默认策略是一位用户一个稳定 workspace。

这意味着：

- 同一用户的多个 thread 默认共享 workspace
- 用户级 MCP、skills、profile、credentials 可以自然作用于这个 workspace
- AI 写入的文件默认落在该用户 workspace 下

未来可以增加 per-run 或 per-process private workspace，但它必须作为显式 scope
override，而不是破坏默认 user workspace 模型。

### 2. Guest Path

Docker mode 下，provider SDK 和工具看到的工作目录是 guest path：

- workspace: `/workspace`
- provider config home: `/agent-home`
- credentials mount: `/agent-credentials`

模型可见输出应优先使用 guest path，不应暴露宿主机真实绝对路径。

### 3. Host Path

Host path 是 app/server 保存 workspace、provider config、credentials 和 DB 的真实路径。

Host path 只应存在于：

- server-side config
- DB/internal metadata
- smoke/debug 输出
- operator-facing diagnostics

Host path 不应进入普通 assistant-visible tool output。

### 4. Docker Container Lifecycle

当前 Docker provider 使用 per-run ephemeral container 作为 baseline。每次 provider
process invocation 都创建一个容器，退出后由 Docker `--rm` 清理。

同一个 run 可能发生合法的 fallback retry，因此 container name 不能只由 run id
决定。当前规则是：

- 保留 provider + run id 前缀，便于排查
- 追加 per-invocation nonce，避免同 run 重试撞名

后续如果引入 warm container 或 per-workspace container pool，需要继续保证 run/event
审计可以解释容器生命周期。

## Provider Differences

### Claude Code SDK

Claude path 可以显式传入工具、permission mode、MCP server、skills、config dir 和
resume session id。

Claude 的 tool/permission bridge 可以被 runtime 映射成 provider-neutral events。当前
Claude durable approval bridge 是 permission/approval 的参考实现。

### Codex SDK

Codex path 更接近“启动一个 coding-agent runtime 并订阅 thread events”。它不要求 app
像 Claude 一样显式列出每个内置 coding tool。

Codex 的工具能力、sandbox policy、approval policy 由 Codex SDK/runtime config 表达。
Runtime adapter 的职责是把 Codex thread events 归一成我们的 runtime events，而不是把
Codex 强行伪装成 Claude 的 tool-list 模型。

## Secrets, MCP, And Skills

Secrets 是 runtime-only 配置，不属于 product messages，也不应写入 workspace。

当前规则：

- env secret 只在 provider process env 中存在
- mounted credential files 只读挂载
- credentials 不复制进 workspace
- stdio MCP 只允许在 Docker mode 中执行
- local mode 不应静默执行宿主机 stdio MCP
- user-level MCP 和 skills 默认随用户 workspace 共享

## Recovery Boundary

当前恢复主线是：

1. product thread 保存 provider session binding
2. provider config home 持久保存 SDK-native session/config 文件
3. raw provider transcript 持久保存 provider-native 审计材料
4. normalized run events 持久保存产品可解释 timeline
5. resume 失败时归档旧 binding，记录 `provider_session_recovery`，并无 session 重试一次

当前没有把 Claude 或 Codex 的 provider-native session store 替换为统一数据库
session store。多 worker、跨机器或远端持久化需要在后续阶段引入 DB/S3/Redis 类
provider session materialization 策略。

## Known Current Limits

- Docker 是当前 baseline，不是最终生产安全边界。
- Codex SDK 需要 Responses-compatible endpoint；DeepSeek Chat Completions-compatible
  endpoint 不能直接满足 Codex SDK 的 `/responses` protocol。
- `apps/cloud-agent-next-web` 是验证 surface，不是永久产品边界。
- Artifact 属于增强能力，不是当前 runtime 基础设施的主线必需项。
