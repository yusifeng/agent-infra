# 云端 Agent Runtime 对齐稿

这份文档用于把 `repomix-output/1.md` 里的方案落到
`agent-infra` 当前项目边界里。它不是实现 TODO，也不是最终 source of
truth；它先帮我们对齐模型、边界、风险和实施顺序。

日期：2026-06-22

## 目标校准

这件事的核心目标不是做一个 Claude Code Web UI，也不是把某一个 SDK 的
session/message 格式搬到网页里。核心目标是实践一套企业内部可部署的云端
Agent Runtime：我们自己掌握用户、租户、workspace、run、沙箱、工具、权限、
secret、MCP/skill 配置、持久化和审计；Claude Code、Codex 或其他 SDK 只是
可替换的 agent 执行引擎。

因此，provider-neutral 数据结构的目的只是给不同 SDK 一个共同的控制面和观测面：
它要能承接 Claude 的 session/raw messages，也要能承接 Codex 的 thread/events，
但它本身不是最终目的。第一阶段最重要的是把 workspace/sandbox/run event/tool
execution 这些基础设施跑稳，并确保后续切换 SDK 时不用重写产品层
Thread/Run/Workspace/Message 模型。

换句话说，这里的“聚合型数据结构”不是为了把 Claude、Codex 的所有原始格式
压成一个折中格式，而是为了让我们的云端 runtime 拥有稳定的产品事实和审计事实：
谁在什么 workspace 里发起了哪个 run、SDK 在沙箱里做了哪些工具调用、改了哪些
文件、请求了哪些权限、使用了哪些 secret ref。不同 SDK 的 raw transcript 可以
被保留，但只能作为 provider-owned debug/resume 资料，不能反过来成为控制面主线。

明确非目标：

- 不把 Claude JSONL、Claude `SessionStore` 或 Codex raw notification 直接当成
  产品主数据模型。
- 不优先做复杂 UI、artifact gallery、workspace preview/download 或评测管理台。
- 不依赖系统提示词来实现隔离；路径、secret、网络和工具权限必须由执行面强制。

### 当前优先级校准

截至 2026-06-24，这份文档的优先级应按下面这条主线理解：我们不是为了做一个
Claude Code 网页壳，也不是为了追求抽象本身，而是在实践一套企业内部可部署的
云端 Agent Runtime。Claude Code、Codex 或其他 SDK 都只是可替换的执行引擎；
我们的核心资产是 sandbox/workspace/control plane/event store/secret/permission
这些 runtime 基础设施。

因此后续实现时，如果出现取舍，按这个顺序判断：

1. **执行隔离优先**：先确保 SDK process、工具命令、MCP stdio、文件写入都能进入
   sandbox/worker 执行面，用户视角 cwd 是 `/workspace`，不能暴露宿主机路径、
   provider home 或其他用户 workspace。
2. **durable state 优先**：`Thread`、`Run`、`Message`、`RunEvent`、
   `ToolInvocation`、`ProviderSessionBinding`、`ProviderTranscript`、workspace
   file/change state 必须是我们自己的事实源。SDK raw session 只做 resume/debug
   资料。
3. **工具、权限、secret 边界优先**：Bash/Read/Write/Edit 这类基础工具要先有
   可审计 lifecycle；permission callback 和 SecretBroker 要先接到统一 policy，
   再考虑更复杂的 MCP、skills、插件市场。
4. **SDK-neutral adapter 服务于 runtime 控制面**：Claude first 可以用来快速跑通，
   但每个新增能力都要能解释 Codex 怎么接入；如果某个设计只有 Claude 能表达，
   就要回到 provider-neutral event/store/interface 重新收口。SDK 抽象不是目的，
   目的是让 sandbox、workspace、run、tool、permission、secret 这些控制面能力
   不被某一个 SDK 绑定。
5. **观测和恢复优先于 UI 细节**：run timeline、tool trace、usage/error、
   file changes、raw transcript drill-down 先作为后端事实跑稳；页面只承担验证面。
6. **Artifact 和复杂 UI 后置**：preview/download/gallery、评测、管理台体验、
   复杂 diff UI 都是增强项，不能抢在 sandbox、worker、event store、permission、
   secret、resume 前面。

一个最小可验收版本应该能证明：两个用户各自拥有独立默认 workspace；多个 thread
默认共享同一用户 workspace；某个 run 写文件时只写入该用户 `/workspace`；run
events、tool calls、provider transcript 和文件变更都可持久化/replay；将 Claude
换成 Codex 时不需要重写产品层 thread/run/workspace/message 模型。

所以近期验收不应以“网页能不能像普通 chatbot 一样回复”为主，而应以“云端
Agent Runtime 是否可控”为主：任务是否从 durable run 进入 worker，agent SDK
和工具命令是否运行在受控 workspace/sandbox，文件、secret、MCP、permission
是否通过统一 policy 和审计面，事件是否能在刷新、进程重启、SDK 切换后继续解释。

### 2026-06-25 再确认

当前目的可以再压缩成一句话：我们要实践的是一套云端 Agent Runtime，而不是一个
Claude Code Web 包装层。Claude Code、Codex、OpenAI Agents SDK 或其他 SDK 都是
执行层 adapter；它们负责各自擅长的 agent loop、模型调用、工具循环和 provider
native session。我们要掌握的是企业内部部署时真正难替代的 runtime 控制面：
tenant/user/workspace、sandbox、worker/queue、permission、secret、MCP/skills、
tool events、run events、provider transcript、审计和恢复。

这也意味着：统一数据结构不是产品目的本身，而是为了让不同 SDK 都接入同一套
runtime 控制面。它应该足够表达各种 SDK 的运行事实，但不应该被任何一个 SDK 的
raw message/session 格式牵着走。

因此，SDK-neutral / 聚合型数据结构不是为了抽象而抽象，也不是为了把所有 SDK 的
原始格式抹平。它的职责是成为我们的产品事实和审计事实：同一套
`Thread / Run / Message / RunEvent / ToolInvocation / Workspace /
ProviderSessionBinding / ProviderTranscript` 能接 Claude，也能接 Codex；切 SDK
时不重写 workspace、sandbox、permission、secret 和 observability 主链路。SDK
原始 transcript 必须保留，但它是 provider-owned resume/debug 资料，不是产品层
唯一消息源。

按这个理解回看 TODO，当前优先级大方向成立：我们现在做的是 cloud runtime
control plane，不是某个 SDK 的 UI 壳。后续所有实现都应该服务于一个问题：
当 Claude Code、Codex 或其他 SDK 被换掉时，tenant/user/workspace/sandbox/run/
tool/permission/secret/observability 这些平台能力是否仍然成立。执行时要避免两个
偏差：

- 不继续为了“数据模型更漂亮”而推迟 sandbox/worker/permission/secret 的真实闭环。
  现有类型可以继续演进，但演进目标必须来自执行隔离、工具调用、审批、secret 发放、
  workspace 变更和跨 SDK 适配的真实需求。
- 不为了让网页尽快像聊天产品一样顺滑，而把 SDK process、工具命令、MCP stdio、
  secret 注入和文件写入留在 Next route 或宿主机路径里。UI 只是验证面，runtime
  控制面才是主线。

按这个目标重新读下面的 TODO，结论是：大的优先级方向符合当前诉求，但需要把
“基础模型已经接回”和“生产闭环已经完成”区分开。P0/P1 不是接下来继续空转的重点；
它们只应该在真实 sandbox、工具、权限、secret、MCP、Codex 接入暴露表达不足时
做有根据的演进。当前真正要推进的是 P2/P4/P5，并用 Codex 做横向反证：

1. P2 是主线：workspace、sandbox、worker/queue、cwd/path 映射、provider home
   隔离、run 生命周期和恢复语义。它直接回答“SDK 在哪里跑、文件写到哪里、
   多用户如何隔离、以后能不能换 sandbox provider”。
2. P4 要和 P2 同步推进：Bash/Read/Write/Edit、工具调用 lifecycle、文件写入、
   file change/diff 是验证 sandbox 是否真实可控的最小闭环，不是 UI 装饰。
3. P5 是企业内部部署必须尽早进入的安全控制面：permission、SecretBroker、
   MCP/skills/profile、tool allowlist、stdio MCP 只能在 sandbox 内跑。这些不能
   后置到“功能完成以后再补”，否则运行时边界会被 SDK adapter 私有配置绑住。
4. Codex/第二 SDK 验证不是后置功能，而是持续的架构反证手段：每完成一块
   sandbox、tool、permission、secret、workspace diff 能力，都要确认这不是
   Claude-only 语义。
5. P3 作为 durable state 底座继续补强：run events、provider transcript、
   approval state、queue state、workspace file index 都要可 replay/attach/audit。
   但它服务于执行控制面，不是为了把 Claude/Codex raw 格式设计成产品主模型。
6. P6 里的 Artifact gallery、preview/download、评测和复杂管理 UI 继续后置。
   其中 workspace diff/review 属于 runtime 文件事实，可以保留较高优先级；
   artifact 展示体验不是当前主线。

所以，当前 TODO 的正确读法是：先把已经打好的 provider-neutral 数据结构用在真实
执行路径上，证明同一个 `Thread / Run / RunEvent / ToolInvocation / Workspace /
ProviderSessionBinding / ProviderTranscript` 能承接 Claude，也能承接 Codex；再
根据真实执行暴露的问题反向完善类型和接口，而不是继续为了抽象本身扩模型。

### 2026-06-25 Claude Agent SDK 官方接入准则

这一节来自 Claude Agent SDK 官方文档和官方 cookbook 的再核对，用来约束后续
Claude adapter、Docker runner、web streaming 和 session/resume 的实现。它不是
Claude-only 产品模型，而是我们接入 Claude 这个 provider 时必须遵守的边界。

高置信结论：

- TypeScript SDK 的主接口是 `query({ prompt, options })`，返回
  `AsyncGenerator<SDKMessage>`。adapter 应消费这个 async iterator，把 raw
  `SDKMessage` 保存到 `ProviderTranscriptStore`，再投影成我们的
  provider-neutral `RunEvent` / `ToolInvocation` / `Message`。
- 新 Claude 会话默认应让 SDK 自己生成 `session_id`。我们从 `system/init` 或
  `result` message 捕获 provider session id，并写入 `ProviderSessionBinding`。
  `sessionId` 只是高级覆盖项，不应该把产品层 `thread.id` 当成 Claude
  `sessionId` 传入。
- 多用户、多 thread、云端服务恢复指定历史会话时，应使用保存的 provider
  session id 作为 `resume`。`continue: true` 只适合单进程、单目录、只关心最近
  会话的场景；它会按当前 `cwd` 找最近会话，不适合作为云端多用户恢复语义。
- Claude session 是对话历史，不是文件系统快照。SDK 会把本地 JSONL transcript
  写在 `CLAUDE_CONFIG_DIR/projects/<encoded-cwd>/...` 或默认 `~/.claude/projects`
  下；`cwd` 或 `CLAUDE_CONFIG_DIR` 不一致会导致 resume 找不到预期历史。跨主机/
  serverless 恢复需要搬运对应 JSONL，或接官方 `SessionStore` adapter。即便接
  `SessionStore`，它也是 provider transcript/resume 资料，不替代我们的
  `Thread`、`Message`、`RunEvent` 和 workspace 文件事实。
- Web/Server 集成优先用 SSE。官方 hosting 示例是服务端消费 SDK message stream，
  然后以 `text/event-stream` 把本 turn 的 SDK message 序列化给浏览器。我们仍应
  保留自己的 normalized event schema；SSE 只是 transport，不是产品事件模型。
- 若需要 token/tool 级进度，可开启 `includePartialMessages`，接收
  `stream_event`，再把 text delta、tool input delta、tool result、usage 等投影为
  normalized runtime events。默认完整 message 仍要保存 raw provider event。
- 权限是 SDK 的一等能力。`permissionMode`、`allowedTools`、`disallowedTools`、
  `canUseTool`、hooks 和 MCP permission prompt 都可能影响工具执行。Web UI 如果
  不使用全自动策略，就必须有 durable approval bridge：SDK callback 产生
  `permission_requested`，UI/HTTP 写入 allow/deny/modify decision，worker 再恢复
  SDK 执行。
- 企业/多租户部署必须隔离 `cwd`、`CLAUDE_CONFIG_DIR`、settings/memory、MCP 配置、
  credentials 和网络出口。默认建议按 user/workspace/provider 分配独立 config dir，
  使用 `settingSources: []`，关闭自动记忆，secret 只经 `SecretBroker` 发放，egress
  通过 allowlist/proxy 审计。
- 对 Docker/subprocess runner，没有找到官方稳定契约要求业务系统自己操纵 SDK
  内部 stdin/stdout JSONL，也没有找到“stdin 必须常开”的官方依据。若使用
  Docker 包 SDK，stdin/stdout 协议应被视为我们自己的 runner IPC：普通单次 run
  可以写入初始请求后关闭 stdin；只有 approval bridge 或 streaming input 需要后续
  写入时才保持 stdin 打开。若改走 CLI `stream-json`，也应把它当公开 CLI 接口，
  不要假设 SDK 内部协议稳定。

这些结论落到 `agent-infra` 的设计要求是：

- `Thread` 是产品会话；`ProviderSessionBinding` 保存 Claude `session_id` /
  Codex thread id 等 provider-owned id；二者不能混用。
- `ProviderTranscriptStore` 必须保存 raw provider events；UI、observability 和 DB
  查询默认消费 normalized `RunEvent` / `Message` / `ToolInvocation`。
- Browser streaming 第一版继续用 SSE；需要中途输入、多人 approval 或更复杂双向
  控制时，再叠加 WebSocket 或 “SSE events + REST approval decision”。
- Permission bridge 必须 provider-neutral：`permission.requested(toolName,input,
  toolUseId,scope)` -> durable pending state -> UI/HTTP decision -> provider callback
  resume。
- workspace/configDir/credentialDir/path mapping 是 sandbox/runtime 事实，不能让
  Claude SDK 默认读取服务进程的 `~/.claude`、项目 settings 或宿主路径。

已核对的主要资料：

- Claude Agent SDK sessions：
  https://code.claude.com/docs/en/agent-sdk/sessions
- Claude Agent SDK TypeScript reference：
  https://code.claude.com/docs/en/agent-sdk/typescript
- Claude Agent SDK streaming output：
  https://code.claude.com/docs/en/agent-sdk/streaming-output
- Claude Agent SDK permissions：
  https://code.claude.com/docs/en/agent-sdk/permissions
- Claude Agent SDK user input / approvals：
  https://code.claude.com/docs/en/agent-sdk/user-input
- Claude Agent SDK hosting：
  https://code.claude.com/docs/en/agent-sdk/hosting
- Claude Agent SDK session storage：
  https://code.claude.com/docs/en/agent-sdk/session-storage
- Claude Agent SDK secure deployment：
  https://code.claude.com/docs/en/agent-sdk/secure-deployment
- Anthropic cookbook hosting example：
  https://github.com/anthropics/claude-cookbooks/tree/main/claude_agent_sdk/hosting
- TypeScript session store examples：
  https://github.com/anthropics/claude-agent-sdk-typescript/tree/main/examples/session-stores

### 2026-06-25 Codex SDK provider 接入准则

这一节用于约束第二个真实 SDK 的接入。结论是：当前项目应该优先适配
**Codex SDK**，而不是先把 OpenAI Agents SDK 作为第二条 provider 主线。

原因很直接：我们正在做的是云端 coding agent runtime，不是通用业务 Agent
应用框架。Codex SDK 官方定位是把 Codex agent 嵌入 workflow 和 app，TypeScript
SDK 通过 `Codex` client 控制本地 Codex agent thread，支持 `startThread()`、
`resumeThread()`、`thread.run()` 和 `thread.runStreamed()`；它的 thread/run/
sandbox/working directory 语义更接近 Claude Code SDK。OpenAI Agents SDK 则是
更上层的通用 agent 应用框架，拥有自己的 Agent、Runner、Session、Tool、
Handoff、Guardrail、Tracing、Sandbox agent 和 HITL 机制。它很强，但它会和我们
正在建设的 runtime control plane 在 orchestration、session、tool execution、
approval、sandbox 和 tracing 上发生大量重叠。

因此，短期接入策略是：

- Codex SDK 作为 `AgentAdapter` provider，和 Claude Code SDK 平级。
- Agents SDK 暂不作为第二 provider 主线；后续如果要做业务型 Agent、multi-agent
  orchestration，或“业务 Agent 把代码任务委托给 Codex”，再考虑把 Agents SDK
  放在更上层，甚至把 Codex 当成 Agents SDK 的工具。
- 不让 Codex SDK 接管我们的产品层 state。Codex thread id、`~/.codex/sessions`
  和 raw JSONL/events 都是 provider-owned resume/debug 资料；产品事实仍然是
  `Thread / Run / Message / RunEvent / ToolInvocation / Workspace /
  ProviderSessionBinding / ProviderTranscript`。

官方资料和当前包核对后的高置信事实：

- Codex SDK TypeScript 需要 Node.js 18+，主要入口是
  `import { Codex } from "@openai/codex-sdk"`，然后 `new Codex()`、
  `startThread()`、`run()` / `runStreamed()`。
- `run()` 会缓冲到 turn 结束；`runStreamed()` 返回 async generator，可消费
  structured events。对我们来说，`runStreamed()` 是 provider adapter 主入口，
  因为它能投影 tool calls、streaming response、file changes 和 usage。
- 同一个 `Thread` instance 连续 `run()` 可以继续同一会话；失去内存对象后可用
  `resumeThread(threadId)` 恢复。SDK 文档说明 thread 持久化在
  `~/.codex/sessions`。
- Codex 默认在当前 working directory 运行；可用 `workingDirectory` 指定目录。
  为避免非 git repo 报错，可在创建 thread 时传 `skipGitRepoCheck: true`。
- `Codex({ env })` 可以控制传给 Codex CLI 子进程的环境变量。若提供 `env`，
  SDK 不继承 `process.env`；SDK 会再注入必需变量，例如 `CODEX_API_KEY`。
  `baseUrl` 会转换为 Codex CLI 的 `--config openai_base_url=...`。
- 当前安装的 `@openai/codex-sdk@0.142.0` README 明确写着：TypeScript SDK
  wraps `codex` CLI from `@openai/codex`，通过 stdin/stdout JSONL 与 CLI 交换
  events。这意味着它不是纯 HTTP client；它会启动本地 Codex CLI 进程。
- 当前安装包类型中，`ThreadOptions` 包含 `model`、`sandboxMode`、
  `workingDirectory`、`skipGitRepoCheck`、`modelReasoningEffort`、
  `networkAccessEnabled`、`webSearchMode`、`approvalPolicy`、
  `additionalDirectories`。
- 当前安装包类型中，`SandboxMode` 是 `"read-only" | "workspace-write" |
  "danger-full-access"`，`ApprovalMode` 是 `"never" | "on-request" |
  "on-failure" | "untrusted"`。
- 当前安装包类型中，`ThreadEvent` 覆盖 `thread.started`、`turn.started`、
  `turn.completed`、`turn.failed`、`item.started`、`item.updated`、
  `item.completed`、`error`；item 覆盖 `agent_message`、`reasoning`、
  `command_execution`、`file_change`、`mcp_tool_call`、`web_search`、
  `todo_list`、`error`。
- OpenAI Codex auth 文档说明 Codex app/CLI/IDE 可以使用 ChatGPT 登录或 API key；
  programmatic Codex CLI workflows/CI 更适合 API key 方式。Codex 会把登录信息缓存在
  `~/.codex/auth.json` 或 OS credential store；如果使用 file storage，应把
  `auth.json` 当成 secret。
- 2026-06-25 新增本地开发验证路径：`CODEX_AUTH_MODE=codex-home` + `CODEX_HOME`
  可以从本机 Codex 登录目录复制 `auth.json` 到当前 provider config dir。这个路径只
  复制 auth 文件，不复制本机 `config.toml`、MCP、plugin 或 project trust 设置；它
  只用于本地 smoke/web 验证，不是正式多租户 secret/auth 策略。

这些事实落到我们的 provider 层，映射应是：

- `Codex` client construction -> provider factory。它只能接收经过 SecretBroker
  和 profile policy 收口后的 `apiKey`、`baseUrl`、`env`、`config`。
- `startThread()` / `resumeThread()` -> `ProviderSessionBinding`。产品层 thread
  id 不能直接当 Codex thread id；首次 run 由 Codex 产生 `thread.started.thread_id`，
  adapter 捕获后写入 binding，后续 run 用 binding 恢复。
- `runStreamed()` async generator -> `AgentAdapter.run()`。adapter 消费 raw
  `ThreadEvent`，先写 `ProviderTranscriptStore`，再投影成 normalized
  `AgentRuntimeEvent`。
- `item.completed(agent_message)` -> `agent_message_delta` / final assistant content。
  当前 Codex SDK 类型没有 token-level text delta；第一版可以把 completed
  `agent_message.text` 作为完整 delta。
- `command_execution` -> `tool_call_started` / `tool_call_completed` /
  `tool_call_failed`。
- `file_change` -> `file_change_detected`，再由 worker 结束后的 workspace diff
  扫描补充真实文件事实。
- `mcp_tool_call` -> provider-neutral tool lifecycle；MCP 配置仍必须由我们的 profile
  / policy 生成，不能直接让 Codex CLI 继承宿主机用户 MCP 配置。
- `turn.completed.usage` -> 后续 usage summary。第一版可以先保留 raw transcript，
  再把 usage 投影进 run event 或 observability usage model。
- Codex `sandboxMode` 只是 provider-native sandbox 配置，不替代我们的
  `SandboxProvider`。在 Docker runtime 中，Codex SDK/CLI process 应该运行在容器内，
  `workingDirectory` 应该是 guest `/workspace`；host 只看到 mounted user workspace。
- Codex `~/.codex/sessions` / `CODEX_HOME` / auth cache 对应 Claude 的 provider
  config dir 问题。多用户环境必须把 Codex home/config/session/cache 指到按
  user/workspace/provider 隔离的目录，不能使用宿主服务用户的 `~/.codex`。

当前代码状态和风险：

- `packages/cloud-agent-runtime` 已经有 `CodexAgentAdapter` 雏形，也已经依赖
  `@openai/codex-sdk`。它目前覆盖了 start/resume、`runStreamed()`、raw transcript
  保存、agent message、command execution、MCP tool call 和 file change 的基本映射。
- `apps/cloud-agent-next-web` 已经把 Codex 接入 `prepareCloudAgentTurn()` 的真实
  provider path。Codex local adapter 和 Docker adapter 都能通过同一套
  `ProviderSessionBinding`、`ProviderTranscriptStore` 和 normalized runtime events
  进入 app 主链路。
- 现有 `CodexAgentAdapter` 仍需要类型/行为收口，不能直接认为已经完成：新 thread
  首个 `provider_session_bound` 的发出时机要持续测试；`item.updated` 是否需要投影
  中间进度要明确；usage projection 需要进入 typed runtime event；authentication、
  baseUrl、configDir 和 `codex-home` dev auth materialization 需要从“可运行”进一步
  收成清晰的 provider config/auth boundary。
- Codex SDK 是 CLI wrapper，所以接入 Docker 时不能只把 npm SDK 装在宿主机。
  正确的 sandbox 路径应类似 Claude Docker adapter：容器内安装 SDK/CLI，容器内
  `CODEX_HOME` / config dir / sessions 持久到隔离 provider home，workspace mount
  到 `/workspace`，SDK 在容器内 spawn Codex CLI。
- 如果先做 local/host Codex smoke，它只能证明 event mapping 和 provider binding，
  不能证明企业 runtime 的 sandbox 隔离。local 模式必须标记为开发逃生口，不能作为
  sandbox 主路径。
- 2026-06-25 本地 smoke 已验证：`@openai/codex-sdk` 直连
  `https://api.deepseek.com` 时，Codex CLI 会请求 Responses/WebSocket 路径
  `wss://api.deepseek.com/responses`，DeepSeek 返回 404。结合 Codex 官方配置参考中
  `model_providers.<id>.wire_api` 当前只支持 `responses`，以及 DeepSeek 官方文档当前
  暴露的是 OpenAI Chat Completions `/chat/completions` 和 Anthropic-compatible API，
  这应被视为协议不匹配，而不是 API key 错误。若要用 DeepSeek 跑 Codex SDK，需要
  一个 Responses-compatible gateway/adapter；直接把 Claude 的
  `https://api.deepseek.com/anthropic` 或 DeepSeek OpenAI Chat base URL 填给 Codex
  不足以跑通。
- 2026-06-25 随后新增 `CODEX_AUTH_MODE=codex-home` 本机 Codex 登录复用路径后，
  Codex local smoke 和 Docker smoke 都已经可以跑通。Docker smoke 验证了 Codex
  SDK/CLI 在容器内执行，公开 cwd 为 `/workspace`，并能产生 provider session id、
  raw transcript 和 normalized command execution events。该路径只用于本地开发和
  架构验证，不是正式 secret/auth 策略。

接下来代码切片建议：

1. **已完成：先收紧 package adapter**：基于当前安装的 `@openai/codex-sdk` 类型，给
   `CodexAgentAdapter` 加 deterministic fake-client tests，覆盖 new thread binding、
   resume、agent message、command execution、file change、MCP call、turn failure、
   timeout/abort、raw transcript append。
2. **已完成：再加 Codex config resolver**：类似 `resolveClaudeAgentConfig`，集中读取
   `OPENAI_API_KEY` / `CODEX_API_KEY`、base URL、model、reasoning effort、
   sandbox mode、approval policy、web search/network、`CODEX_HOME` / config dir、
   env allowlist。默认低成本、低推理；不要在 smoke 中默认高价模型或高 reasoning。
3. **已完成：接 app provider factory**：把 `prepareCloudAgentTurn()` 里的 Codex
   fallback 替换为真实 provider adapter 路径，同时把 transcript store、provider
   session binding、workspace path、secret env 接入同一套 app runtime。`local`
   明确是不隔离开发逃生口；默认执行面可以走 Docker。
4. **部分完成：补 Codex smoke**：用最小 prompt 验证 thread id 持久化、第二 turn resume、
   raw transcript、normalized run events、usage/raw event 保存。若真实 SDK auth
   不可用，至少保留 fake-client deterministic tests 和 fail-fast diagnostics。当前
   local/docker smoke 都已证明 DeepSeek 直连会卡在 Responses protocol 404。
5. **已完成基础版：做 DockerCodexAgentAdapter**：构建 Codex runtime image，让 SDK/CLI 在容器内跑，
   `pwd` 返回 `/workspace`，写文件只进入用户 workspace mount，Codex home/session
   只进入隔离 provider config dir，secret 只通过 SecretBroker 注入。2026-06-25
   Docker smoke 预检已验证容器 `pwd === /workspace`；随后 Codex SDK 直连 DeepSeek
   失败于 `wss://api.deepseek.com/responses` 404，属于 provider protocol 不匹配。
6. **再验证 Codex 横向反证**：同一产品 `Thread / Run / Message / RunEvent /
   ToolInvocation / ProviderTranscript / WorkspaceChange` 链路能同时解释 Claude 和
   Codex；如果某个字段只有 Claude 能表达，再回到 provider-neutral type 收口。

### 2026-06-25 Refactor Baseline

这次整理不是继续扩功能，而是把已经跑起来的 Claude + Codex 双 provider 路径收成
一条更清楚的 runtime 标准路径。当前应该按下面边界执行：

| 层级 | 当前职责 | 整理方向 |
| --- | --- | --- |
| `apps/cloud-agent-next-web` routes | Next request/response、临时登录、owner/thread 检查、SSE/stream attach、错误映射 | route 变薄，把 message POST、event replay/follow 和 worker orchestration 下沉到 app-local service |
| `apps/cloud-agent-next-web` runtime composition | 读取 env、解析 profile/MCP/skills/secrets、选择 local/docker adapter、接 DB stores | 先 app-local 拆分 `agent-runtime.ts`，稳定后再移动纯 helper 到 package |
| `packages/cloud-agent-runtime` provider layer | `AgentAdapter`、Claude/Codex local adapters、Docker adapters、transcript store interface、sandbox/storage/secret/permission types | 强化 typed runtime events，抽共享 Docker process plumbing，保留 provider runner 私有协议 |
| provider native SDK | Claude Code SDK、Codex SDK/CLI 的 agent loop、native resume/thread/session、raw events | 只作为 execution engine 和 provider-owned transcript/resume 资料，不成为产品主数据 |
| durable app/db facts | `Thread`、`Run`、`Message`、`RunEvent`、`ToolInvocation`、`ProviderSessionBinding`、`ProviderTranscript`、workspace diff/index | 继续作为跨 SDK 的控制面和审计事实 |

当前已确认的 provider/sandbox 状态：

- Claude local path 是不隔离开发逃生口；Docker Claude path 才是 `/workspace`
  隔离验证主线。
- Codex local path 同样是不隔离开发逃生口；Docker Codex path 已验证容器内
  `pwd === /workspace`，并通过 `codex-home` dev auth 完成本地 smoke。
- `codex-home` 只复制本机 Codex 登录 `auth.json` 到 provider config dir，不复制
  宿主 `config.toml`、MCP、plugin 或 project trust 设置；它必须继续被视为 dev-only
  auth materializer。
- Docker smoke 的默认临时目录放在仓库根 `.tmp/cloud-agent-runtime/...`，而不是
  package 内 `.tmp` 或 macOS `/tmp`/`/var/folders`。这样既避免 Vitest 误发现 smoke
  临时文件，也能保证 Docker Desktop/Colima 可以 bind mount。
- Claude/Codex Docker adapters 已共享 `docker-agent-process` 的 Docker args、mount、
  env、stdout/stderr streaming、timeout、container name 和 guest path normalization
  基础设施；provider runner IPC 仍然分开，Claude 继续消费 `SDKMessage`，Codex
  继续消费 `ThreadEvent`。
- raw provider transcript 必须继续写 `ProviderTranscriptStore`；UI 和 app 主链路
  应消费 normalized `RunEvent` / `Message` / `ToolInvocation`。
- 多个 thread 默认共享同一用户 workspace；未来需要 private run workspace 时，
  应通过 workspace scope policy 增加覆盖，而不是把当前 thread id 写死为 workspace
  目录名。
- `apps/cloud-agent-next-web/lib/agent-runtime.ts` 已拆成 app-local runtime modules：
  `agent-runtime-scope.ts` 管 paths/scope/credentials materialization，
  `agent-runtime-secrets.ts` 管 workspace secret refs 和 file/env delivery，
  `agent-runtime-profile.ts` 管 profile/MCP/skills/audit，
  `agent-runtime-provider-factory.ts` 管 Claude/Codex local/docker adapter 创建，
  `agent-runtime-config.ts` 管 execution mode/timeouts/Codex inner sandbox，
  `agent-runtime-continuity.ts` 管 provider session replay/compact continuity。主文件
  现在保留 turn composition、fallback streaming 和 provider 分支编排。

接下来整理优先级：

1. 先补 characterization 和文档基线，避免在不知道当前行为的情况下搬代码。
2. 先强化 `AgentRuntimeEvent` 的 typed builders，让 Claude/Codex mapper 进入同一
   normalized event contract。
3. 再抽 Docker command/mount/env/stdout JSONL/timeout 等共享执行 plumbing，但不要
   合并 Claude/Codex runner IPC。
4. 然后 app-local 拆分 `agent-runtime.ts`、message route、event stream 和 worker
   orchestration。
5. 最后收口 provider session recovery、permission/approval、secret/MCP/profile
   边界，并把稳定事实提升到 `docs/source-of-truth`。

当前基线验证命令：

```bash
PATH=/Users/david/.nvm/versions/node/v22.17.1/bin:$PATH \
  pnpm --filter @agent-infra/cloud-agent-runtime test

PATH=/Users/david/.nvm/versions/node/v22.17.1/bin:$PATH \
  pnpm --filter @agent-infra/cloud-agent-runtime typecheck

PATH=/Users/david/.nvm/versions/node/v22.17.1/bin:$PATH \
  pnpm --filter cloud-agent-next-web typecheck

PATH=/Users/david/.nvm/versions/node/v22.17.1/bin:/opt/homebrew/bin:$PATH \
  CODEX_AUTH_MODE=codex-home \
  CODEX_HOME=/Users/david/.codex \
  CODEX_AGENT_TIMEOUT_MS=60000 \
  pnpm --filter @agent-infra/cloud-agent-runtime smoke:codex

PATH=/Users/david/.nvm/versions/node/v22.17.1/bin:/opt/homebrew/bin:$PATH \
  CODEX_AUTH_MODE=codex-home \
  CODEX_HOME=/Users/david/.codex \
  CODEX_AGENT_TIMEOUT_MS=90000 \
  pnpm --filter @agent-infra/cloud-agent-runtime smoke:codex:docker
```

2026-06-25 当前结果：runtime package tests、runtime typecheck、cloud Next app
typecheck、Claude local smoke、Claude Docker smoke、app Codex streamed path 均通过。
Codex local smoke 和 Codex Docker smoke 在当前 shell env 下走 DeepSeek fallback，失败于
`wss://api.deepseek.com/responses` 404；DeepSeek 当前 OpenAI-compatible API 是
Chat Completions，而 Codex SDK 请求 Responses protocol。Codex Docker smoke 的容器
preflight 已证明 `pwd === /workspace`。Claude Docker smoke 通过 DeepSeek
Anthropic-compatible endpoint 与 `deepseek-v4-flash` 验证了 `Bash`、`Read`、
`Edit`、`Write`，provider session JSONL 存在于隔离 provider config dir，
workspace `pwd === /workspace`。

已核对的主要资料：

- Codex SDK：
  https://developers.openai.com/codex/sdk
- Codex authentication：
  https://developers.openai.com/codex/auth
- 本地 npm 包 `@openai/codex-sdk@0.142.0` README / `dist/index.d.ts`
- OpenAI Agents SDK TypeScript overview：
  https://openai.github.io/openai-agents-js/
- OpenAI Agents SDK running agents：
  https://openai.github.io/openai-agents-js/guides/running-agents/
- OpenAI Agents SDK sessions：
  https://openai.github.io/openai-agents-js/guides/sessions/
- OpenAI Agents SDK human-in-the-loop：
  https://openai.github.io/openai-agents-js/guides/human-in-the-loop/

## 已确认决策

这些结论先作为后续讨论和 TODO 的基线；除非明确推翻，后面不再反复重开：

- 主要落地会新开项目；`agent-infra` 和 `ripple` 先作为架构参考、概念来源和
  可复用经验，不直接把当前仓库改造成最终 cloud agent runtime。
- 控制面由我们自己实现。用户、tenant、workspace、thread、run、MCP、
  skill、secret、artifact、audit、permission policy 都是产品/runtime 事实，
  不交给 Claude 或 Codex SDK 代管。
- SDK 的位置是 `AgentAdapter` / execution engine。SDK 可以负责 agent loop、
  provider-native tools、permission mode、resume hint 和 raw transcript，但不能
  反向决定我们的多租户、workspace、sandbox、DB 或 UI 事件模型。
- SDK session/thread id 只作为 provider binding 或 resume hint。产品层的
  durable `Thread`、`Run`、`Workspace` 不能依赖 SDK 内部状态作为事实源。
- 沙箱能力先定义为 `SandboxProvider` 抽象，不把业务逻辑写死到 Docker、
  E2B、Daytona、nsjail、gVisor 或 microVM。
- 第一版先实现 `DockerSandboxProvider`。目标是把本地学习版和内部 MVP
  跑起来：每个 run 在受控容器里执行，只挂载当前 workspace，限制资源，
  把网络、secret、MCP、文件同步都通过明确接口收口。
- Docker-first 不是最终安全承诺。它用于验证 control plane、runner、
  workspace materialization、agent adapter 和 policy enforcement 的形状；
  后续可以加 Daytona/E2B/gVisor/Firecracker 等 provider。
- Ripple 的价值主要是学习 control plane：user sandbox、session/job、
  connector auth、permission request、Codex app-server bridge。它不是我们
  最终强多租户沙箱的直接复制对象。

## 当前实现状态

截至 2026-06-24，当前仓库已经有第一版可运行骨架：

- `packages/cloud-agent-runtime` 新增 provider-neutral runtime 边界：
  `AgentAdapter`、`SandboxProvider`、`StorageProvider`、
  `ProviderTranscriptStore`、`SecretBroker`、`ProviderSessionBinding`。
- `DockerSandboxProvider` 可以通过本机 Docker/Colima 跑 smoke，用于先验证
  workspace mount、network policy、resource limits、exec、file diff、
  destroy 这些执行面边界。
- `LocalWorkspaceStorageProvider` 用本地文件夹模拟 workspace/object storage
  materialization。它不是浏览器 `localStorage`，也不是最终对象存储方案。
- `ClaudeAgentAdapter` 已接入官方 `@anthropic-ai/claude-agent-sdk`，把 Claude
  SDK stream 投影成 provider-neutral runtime event，包括 `agent_start`、
  `agent_message_delta`、`agent_completed`、`agent_failed`、
  `provider_session_bound` 和 tool call lifecycle。
- Claude 最小工具集已经打开 `Bash`、`Read`、`Write`、`Edit`。`tools`
  用于限制可见工具，`allowedTools` 用于自动允许执行；当前默认
  `permissionMode=acceptEdits`，先减少本地验证中的人工 approval 阻塞。
- `AdapterAgentRunner` 是第一版 provider-neutral runner 边界。它消费
  `AgentAdapter` event stream，聚合 `content`、`providerSessionId`、
  failure 和原始 runtime events；Next app 不再自己解析 Claude SDK stream。
- cloud Next app 的消息 route 创建 user message 和 queued run 后，只把 durable
  `runId` 交给 queue；worker 根据 `runs.trigger_message_id`、thread 和 message
  repository 从 DB 恢复 user/content/thread/provider，再把 run 标记为 running。
  这已经去掉了 route -> worker 的内存 job payload 依赖，但 dispatcher 仍是
  in-process，后续还要替换成独立 worker/queue 后端。
- cloud Next app 新增 `pnpm --filter cloud-agent-next-web worker:run <runId>`
  standalone worker entrypoint。它和 in-process queue 复用同一段 runId 执行逻辑，
  用于验证“执行入口可以脱离 route”；真正的队列领取、重试、租户 worker pool 和
  多进程 follow 仍是后续工作。
- cloud Next app 新增 `pnpm --filter cloud-agent-next-web worker:once`，可以从 DB
  中寻找最早的 queued run 并执行一次。这让独立进程开始能从 durable runs 表拉活，
  但当前没有分布式 claim/lease/visibility timeout，不能当生产队列语义使用。
- `runs` 已新增 claim/lease 基础字段：`claimOwner`、`claimExpiresAt`、
  `attemptCount`。`RunRepository.claimNextQueued()` 可以按 app scope 领取最早
  queued run，或在 lease 过期后重新领取 running run；terminal status 会清理
  claim。`worker:once` 已改用这个 claim 入口。
- `RunRepository.extendClaim()` 和 worker claim renewal 已完成。独立 worker 带
  `CLOUD_AGENT_WORKER_ID` 执行时，会在 run 期间按 lease 的半周期续租；worker
  崩溃后 lease 到期，其他 worker 可以重新领取。
- cloud Next app 新增 `pnpm --filter cloud-agent-next-web worker:loop` 长驻 worker
  poller。它会持续 claim queued/lease-expired runs、执行、续租，并支持
  SIGINT/SIGTERM 退出。它仍是本地 DB poller，不是 Redis/BullMQ/Temporal 这类
  外部队列系统。
- cloud Next app 新增 `pnpm --filter cloud-agent-next-web worker:bullmq` BullMQ worker。
  `CLOUD_AGENT_RUN_QUEUE_PROVIDER=bullmq` 时，message route 只创建 durable run 并把
  `runId` enqueue 到 Redis；BullMQ worker 消费 job 后仍先通过 DB `claimById` 写入
  claim/lease，再复用现有 run execution。Redis 只承担调度，DB 仍是 run/event 事实源。
- `/api/runtime/queue` 已有 BullMQ 最小操作面：GET 在 BullMQ ready 时返回 queue
  counts 和最近 failed jobs；POST 支持 `retry-failed` 和 `clean-completed` 两个受控
  action，用于最小死信重放和 completed job 清理。
- `/api/runtime/queue` 同时返回 DB-backed run queue snapshot：按 app scope 汇总
  queued/running/completed/failed/cancelled counts，并列出 queued、running、
  retry-delayed、lease-expired、failed 和 dead-letter run 样本。dead-letter 是
  基于当前 `CLOUD_AGENT_WORKER_MAX_ATTEMPTS`（默认 3）对 failed runs 的最小分类；
  snapshot 还会返回 summary 和 recommended actions，提示 operator 应该先 requeue
  lease-expired runs、retry retryable failed runs，还是处理 dead-letter runs。
  这个 snapshot 来自 durable run store，是我们自己的控制面事实；BullMQ counts 只
  作为 Redis 调度层状态。
- `/api/runtime/queue` 已有 DB failed run retry 最小动作：
  `POST { action: "retry-db-failed-runs" }` 会把 cloud app scope 内的 failed runs
  重新置为 queued，可选设置 `nextAttemptDelayMs`，并写入 `run_requeued` run event
  作为审计记录。这个动作重放的是 durable run，不依赖 BullMQ job 状态。
- `/api/runtime/queue` 已有 DB lease-expired run requeue 最小动作：
  `POST { action: "requeue-db-lease-expired-runs" }` 会把 claim 已过期的 running
  runs 显式排回 queued、清理 claim owner/expiry，并写入 `run_requeued` event。
  这给管理员一个手动恢复 stale running run 的 durable 操作面，而不只依赖后续
  worker 抢占过期 lease。
- `/api/runtime/queue` 已有 DB dead-letter cancel 最小动作：
  `POST { action: "cancel-db-dead-letter-runs" }` 会把达到
  `CLOUD_AGENT_WORKER_MAX_ATTEMPTS` 的 failed runs 标记为 `cancelled`，并写入
  `run_cancelled` event。这是人工关闭不再重试任务的受控审计路径，不删除 run
  或历史错误。
- worker pool 已有最小 durable registry：DB 记录 worker id、queue provider、
  active/draining/stopped status、concurrency、active run ids 和 heartbeat；
  `worker:loop` 与 `worker:bullmq` 会写入 heartbeat，`/api/runtime/queue` 会返回
  worker registry snapshot、池级 summary、recommended actions 和 stale worker 列表。
  summary 会聚合 worker status counts、queue provider counts、active run ids/count
  和 stale worker count；recommended actions 会指向已有的 drain、clear-drain 和
  mark-stale-workers-stopped 操作。它先解决“有哪些 worker 在跑、正在处理哪些 run、
  哪些 worker 心跳过期、下一步应该执行哪个受控动作”的操作边界，更完整的队列监控、
  死信策略和 workflow backend 仍是后续工作。
- worker pool 已有最小控制动作：`POST /api/runtime/queue { action: "drain-worker" }`
  会在 worker registry metadata 中记录单 worker drain request；
  `{ action: "drain-workers" }` 可以把当前非 stopped worker pool 批量置为 draining。
  `worker:loop` 和 `worker:bullmq` 下一次 heartbeat 后会进入 draining，不再领取新
  任务，并在 active run 收尾后 mark stopped。`mark-worker-stopped` 只用于清理
  stale/已退出 worker 的 registry 状态，不直接 kill 进程；HTTP 操作默认会拒绝标记
  仍带 active run ids 的 worker，除非显式 `force=true`。`mark-stale-workers-stopped`
  会按 heartbeat 过期阈值批量把仍然 stale 的 worker 标记为 stopped，并用 DB 条件
  更新避免误停已经恢复 heartbeat 的 worker。人工 mark stopped 和 stale cleanup 会在
  worker registry metadata 中记录 actor/reason/desiredStatus，保留最小操作审计线索。
- worker drain 已有最小撤销动作：`clear-worker-drain` 和 `clear-workers-drain`
  会把 worker registry control metadata 的 desired status 改回 `active`，用于撤销
  尚未被 worker 进程实际执行的 drain request。已经进入 shutdown 的进程仍可能按本地
  stopping 状态退出，后续由 heartbeat/stale worker 操作面反映真实状态。
- `worker:loop` 支持 `CLOUD_AGENT_WORKER_CONCURRENCY` bounded concurrency：同一
  worker 进程可以并发 claim/execute 多个 run；收到 SIGINT/SIGTERM 后不再 claim
  新任务，并等待当前 active executions 收尾。
- `runs` 已新增 `nextAttemptAt`，worker 异常失败时可以按 exponential backoff
  重新排回 queued。`claimNextQueued()` 只领取 `nextAttemptAt` 到期的 queued run，
  worker loop 会继续轮询等待重试窗口。
- run event stream route 支持 DB polling follow：`/api/runs/<runId>/events?stream=true`
  先 replay DB events，再同时使用 in-memory hub 和 DB polling 追新事件。这样独立
  worker 进程写入 `run_events` 后，Next route 仍能看到 live timeline。
- cloud Next app 新增 run queue provider 边界：默认 `in-process` provider 方便
  本地单进程调试；`CLOUD_AGENT_RUN_QUEUE_PROVIDER=db-queue` 或 `db-poll` 时，
  message route 只创建 user message 和 durable queued run，然后通过 DB polling +
  run event hub attach/follow；真正 SDK 执行由独立 `worker:loop` 通过同一 provider
  claim run 后完成。旧的 `CLOUD_AGENT_RUN_DISPATCH=external` 仍作为兼容别名。
- run queue provider 有 manifest/diagnostics 边界：
  `GET /api/runtime/queue` 返回当前 provider、支持状态、planned backends 和 required
  env。当前支持 `in-process`、`db-poll`、`db-queue` 与 `bullmq`；`db-queue` 是显式
  DB-backed worker provider 名称，继续复用 durable claim/lease 字段；`bullmq`
  需要 `REDIS_URL`，缺失时 diagnostics 会显示 ready=false。diagnostics 会区分
  `ready` 和 `productionReady`：`in-process` / `db-poll` 可用于开发或本地验证，但会
  标记 production issue；`db-queue` / `bullmq` 是当前 production target。`temporal`
  仍作为 planned production backend 固定名字和必需 env，配置后会 fail-fast，不会静默
  降级到本地 DB provider。
- cloud Next app 新增 thread active-runs API 和最小 UI reattach：页面加载或切回
  thread 时可以查询该 thread 的 queued/running run，并通过
  `/api/runs/<runId>/events?stream=true` replay/follow durable run events，恢复
  streaming delta、tool call、file change 和 pending approval 状态。
- Claude SDK 的 env/model/permission/tool/thinking 配置集中在
  `resolveClaudeAgentConfig`。package smoke、Next route 和后续 Docker runner
  应共享这套配置，避免“脚本一套、网页一套”。
- `apps/cloud-agent-next-web` 是第一版 cloud runtime 验证面。它使用
  Admin/123456 的临时本地登录，后续会替换为正式 tenant/user auth。
- cloud Next app 使用 App Router 的 `/new` 与 `/chat/[threadId]` 绑定
  thread URL；首次从 `/new` 发送消息后会创建 thread 并跳转到
  `/chat/<threadId>`。
- `apps/cloud-agent-next-web/app/api/threads/[threadId]/messages` 已接到
  `ClaudeAgentAdapter + AdapterAgentRunner`。route 显式使用 Node runtime，
  Next config 将 `@agent-infra/cloud-agent-runtime` 和
  `@anthropic-ai/claude-agent-sdk` 作为 server external package，避免 Next
  打包器接管会启动本地 Claude Code 子进程的 SDK。
- cloud Next app 已改用 Tailwind 4；当前只保留轻量 utility 样式，不引入
  shadcn/radix 组件体系。
- thread 已有第一版 provider session resume：首次运行不再把产品层 thread UUID
  传给 Claude `sessionId`，而是让 Claude SDK 创建 provider-native `session_id`，
  SDK 返回真实 session id 后保存为 `ProviderSessionBinding`；后续同一 thread
  使用保存的 provider session id 作为 `resume`。thread/message/run 主路径已经切到
  SQLite；provider session binding 和 provider transcript 已接 DB 主链路，后续仍要
  补 replay/follow 和恢复策略验证。
- session resume 失败时已有显式 `provider_session_recovery` run event：默认策略是
  `archive_and_restart`，即归档旧 provider session binding，然后无 resume 重试一次；
  active binding 上的 `replay` / `compact` lifecycle metadata 也能把恢复策略投影为
  `replay_transcript` / `compact`，作为 provider-neutral continuity 输入。
  provider-specific transcript injection、fork 和原生 compact 执行仍是后续增强。
- cloud Next app 新增 provider session lifecycle 后端控制面：
  `GET/POST /api/threads/<threadId>/provider-sessions` 可以列出 thread 的 provider
  session bindings、transcript summary 和 replay plan，也可以把 active binding 标记为
  `forked` / `archived`，或通过 `replay` / `compact` action 在 active binding metadata
  中记录 provider transcript replay plan。`replay` 和 `compact` 会保持 active binding，
  让后续 run 可以继续读到 continuity metadata。lifecycle action 会写入
  `provider_session_lifecycle` run event，recovery report 也会返回 lifecycle events，
  因而 fork/compact/replay/archive 不只是 binding metadata 变化，而是进入可回放审计
  事实。它先解决 durable 状态和审计事实，真正 UI 入口和 provider-specific compact
  执行策略仍是后续增强。
- cloud Next app 新增 provider session recovery report：
  `GET /api/threads/<threadId>/provider-sessions/recovery` 会聚合 provider session
  bindings、transcript replay plans、`provider_session_recovery` run events、source
  runs、strategy counts 和 provider recovery manifests。manifest 会声明 Claude /
  Codex 对 `resume`、`archive_and_restart`、`replay_transcript`、`compact`、`fork`
  的当前支持状态，并为每个 provider session 生成 recommended actions。这样控制面
  可以按 active/archived/forked 状态、transcript replay 可用性和 provider 能力给出
  下一步恢复建议；active session 有 transcript replay plan 时会同时推荐
  `replay_transcript` 和 `compact`。这避免把不同 SDK 的恢复差异埋在 adapter 私有逻辑里。它先补齐
  recovery observability drill-down 的后端事实；replay plan 还会为最近的 transcript
  entries 生成受限短摘要，并通过 provider-neutral continuity prompt 注入 Claude /
  Codex adapter。真正 provider-specific transcript injection / compact 执行仍是后续增强。
- Claude local adapter 和 Docker adapter 都支持注入 `ProviderTranscriptStore`。
  cloud Next app 当前用 DB-backed transcript store，把 provider raw SDK messages
  写入 `provider_transcript_entries`，UI 仍消费 normalized runtime events。
- 工具调用已经有双轨记录：`RunEvent` 保存可回放事件流，`ToolInvocation`
  在 assistant message 落库后保存结构化当前态，便于后续查询、审计和 UI 展示。
- Claude Write/Edit 成功时会派生最小 `file_change_detected` run event，先记录
  path、toolCallId 和 changeType。
- `file_change_detected` run event 已同步到 workspace 文件事实：runtime event
  recorder 会为 run 创建/复用 pending workspace change set，写入
  `workspace_file_changes`，并更新 workspace file index。当前仍是事件派生的最小
  reviewable file-change 事实，不等于内容级 diff、snapshot 合并或冲突处理已经完成。
- worker 会在 agent run 前后扫描 user workspace 文件 hash，并把真实
  created/modified/deleted diff 同步成 `workspace_diff` change set、file change
  rows 和 workspace file index。这样即使 SDK 没有上报 Write/Edit 事件，run
  结束后仍能从 durable DB 解释实际文件变化。小文本文件的 created/modified/deleted
  unified diff 已可从 run observability 读取；change set 会记录 before/after
  workspace manifest hash refs 和 changeCounts，作为后续 merge/rollback 的最小
  snapshot 输入；workspace change set 已有后端列表、merge/discard 和小文本 rollback
  控制面，可按 owner 校验后把 pending change set 标记为 merged/discarded，或把
  带小文本 snapshot 的 change set 回滚到 before 状态。当前仍未做完整 workspace
  snapshot 持久化/合并、冲突处理、review UI 和通用二进制/大文件回滚。
- Docker 执行路径的公开 cwd 固定为 `/workspace`，`agent_start` / run event 不再
  暴露宿主机 workspace 绝对路径。`local` execution 只作为不隔离开发逃生口。
- `CodexAgentAdapter` 已有最小 SDK smoke：通过 `@openai/codex-sdk` 的
  `runStreamed()` 事件流，把 Codex thread、command execution、file change、
  agent message 和 usage 投影到同一套 provider-neutral runtime events，并保存
  raw transcript。
- provider session replay/compact metadata 已有 provider-neutral continuity
  context 最小链路：cloud Next app 会把 active binding metadata 中的
  transcript replay plan 转成 `AgentContinuityContext`，Claude local adapter、
  Docker Claude adapter 和 Codex adapter 都通过同一个 prompt builder 注入这段
  恢复背景。它只声明“这是恢复背景”，不会伪装成 provider-native session replay
  已经成功；真正 provider-specific transcript injection、compact 执行和恢复管理
  UI 仍是后续增强。
- Claude local adapter 已接入官方 SDK 的 `canUseTool` callback。callback 先进入
  provider-neutral `PermissionBroker`，再投影成 `permission_requested` /
  `approval_resolved` runtime events，并把 allow/deny 决策返回给 SDK。当前完成的是
  local/policy broker 桥接；Docker runner、独立 worker 和 UI 人工 approval 还需要
  后续双向协议。
- `permission_requested` / `approval_resolved` 已接入 durable
  `run_approval_requests` 状态表。runtime event recorder 会在写入 normalized
  `RunEvent` 后同步创建 pending approval request，并在 resolve event 到来时把
  该 request 标记为 approved/denied。当前完成的是 durable 状态基础，不等于 UI
  人工审批桥已经完成。
- cloud Next app 已新增 run approval HTTP 控制面：可以按 run 查询
  `run_approval_requests`，也可以把某个 pending request 标记为 approved/denied。
  HTTP API 只写 durable decision state，不伪造 provider runtime event；真正的
  `approval_resolved` 应由 SDK callback 经 `PermissionBroker` 拿到 decision 后
  发出。当前仍缺的是让 SDK/worker 在等待期间挂起，并在 HTTP decision 到来后恢复执行。
- cloud Next app 新增 `DurablePermissionBroker`：在显式
  `CLOUD_AGENT_APPROVAL_BRIDGE=durable` 时，SDK `canUseTool` callback 会等待
  `run_approval_requests` 的 HTTP decision，拿到 approved/denied 后再恢复 SDK
  执行，并由 adapter 发出 `approval_resolved` event。该桥已经支持 local Claude
  adapter 和 Docker Claude runner；Docker runner 使用 stdout 发
  `permission_requested`，宿主 worker 经 broker 等待 durable decision 后，通过
  stdin 写回 `approval_decision`。
- cloud Next app 新增最小 run event replay API：
  `GET /api/runs/[runId]/events`，按当前登录用户校验 thread ownership 后返回已
  持久化的 normalized run events。
- cloud Next app 的 run event API 支持 `?stream=true`：先 replay DB 中已有
  normalized run events，再通过 in-memory `CloudRunEventHub` follow 当前 run 的
  live events；run 完成/失败时关闭订阅。
- `AgentProfile` 和 `WorkspaceSecretRef` 已进入 core/contracts/db：profile 保存
  provider/model/tool allowlist/MCP servers/skill refs/secret refs/approval/sandbox
  配置；secret ref 只保存引用和投递目标，不保存 raw secret。
- cloud Next app 执行前会读取 workspace/provider 的 active `AgentProfile`，
  并把 model、tool allowlist、approval policy、sandbox mode、remote MCP servers
  和 skill refs 应用到 Claude adapter 配置。MCP 使用 `strictMcpConfig=true`，只允许
  profile 显式传入的 MCP server；HTTP/SSE remote MCP 会直接进入 SDK options，
  stdio MCP 只在 Docker execution mode 下传入，让 MCP command 在容器内执行。
  local execution mode 会跳过 stdio MCP，避免它在宿主 Next route 环境运行。
- MCP/Profile 配置解析会写入 `mcp_profile_audit` run event，记录每个 profile MCP
  server/skill ref 的 enabled/skipped 决策、transport、target 和跳过原因。这样
  remote MCP、Docker-only stdio MCP、缺失 url/command/name 或 unsupported transport
  不再只是 adapter 私有判断，而会进入 durable timeline。
- remote HTTP/SSE MCP 支持可选 host allowlist：
  `CLOUD_AGENT_MCP_REMOTE_HOST_ALLOWLIST`。配置后，不在 allowlist 中的 remote MCP
  会被跳过，并在 `mcp_profile_audit` 中记录 `remote_host_not_allowlisted`。这只是
  最小 egress policy，不等于完整 MCP gateway/proxy 已完成。
- remote HTTP/SSE MCP 支持 per-server `toolAllowlist`：profile 中的
  `toolAllowlist` 会编译到 Claude SDK remote MCP `tools` policy，并在
  `mcp_profile_audit` 中记录该 server 允许的工具名。当前只用于 SDK 原生 remote
  MCP tool policy，不等于完整 MCP gateway/per-tool 审计代理已完成。
- remote HTTP/SSE MCP 默认要求 HTTPS：`http:` URL 会被跳过并在
  `mcp_profile_audit` 中记录 `remote_insecure_http_not_allowed`；只有显式设置
  `CLOUD_AGENT_MCP_ALLOW_INSECURE_HTTP=true` 时才允许本地/内网 HTTP MCP endpoint。
- remote HTTP/SSE MCP 默认跳过 inline headers：除非显式设置
  `CLOUD_AGENT_MCP_ALLOW_INLINE_HEADERS=true`，profile 里带 `headers` 的 remote MCP
  会被跳过，并在 `mcp_profile_audit` 中记录 `inline_headers_not_allowed`。这是为了
  避免 Authorization 这类 raw secret 被长期保存在 AgentProfile metadata；推荐改用
  secret refs / proxy delivery。
- stdio MCP 支持可选 command allowlist：`CLOUD_AGENT_MCP_STDIO_COMMAND_ALLOWLIST`
  配置后，Docker 执行模式下不在 allowlist 中的 stdio MCP command 会被跳过，并在
  `mcp_profile_audit` 中记录 `stdio_command_not_allowlisted`。这只是最小命令级
  policy，不等于完整 MCP gateway、包签名或 per-tool policy 已完成。
- skill refs 支持可选 allowlist：`CLOUD_AGENT_SKILL_REF_ALLOWLIST`。配置后，不在
  allowlist 中的 profile skill ref 会被跳过，并在 `mcp_profile_audit` 中记录
  `skill_ref_not_allowlisted`。enabled skill refs 会写入每个 run 的
  `skill-materialization.json` manifest，并通过 `CLOUD_AGENT_SKILLS_MANIFEST`
  注入 sandbox env；Docker 执行时该 manifest 位于只读 `/agent-credentials` 挂载内。
  这只是最小 materialization plan，不等于 skill 包下载、版本 pinning 或签名校验已经完成。
- SecretBroker 新增 provider manifest/diagnostics 边界：当前支持 `env` provider；
  `vault`、`kms`、`proxy`、`file-materializer` 作为 planned production providers 固定
  名称和 required env。`GET /api/runtime/secrets` 可以检查当前 secret broker
  provider 是否 ready；未实现 provider 会 fail-fast，不会静默改走 env。
- cloud Next app 的 agent runtime 已接入 workspace secret refs：执行前读取当前
  workspace 的 active `WorkspaceSecretRef`，经 SecretBroker resolve 后只把
  `delivery=env` 的短期 secret 注入 adapter env；`delivery=file` 会写入 per-run
  credentials dir，并在 Docker 执行时只读挂载到 `/agent-credentials`，再把容器内
  文件路径作为目标 env 注入 adapter；`delivery=proxy` 会生成可验签的短期 HMAC
  proxy token 注入目标 env，token claims 绑定 scope/purpose/ref/targetName，不把
  raw secret value 发给 sandbox；sandbox 内工具可通过
  注入的 `CLOUD_AGENT_SECRET_PROXY_URL` 访问
  `POST /api/runtime/secrets/proxy-exchange`，用该 token 兑换 scoped secret value；
  route 会验证签名/过期时间并重新检查 delivery/env allowlist，同时写入不含 raw
  value 的 `secret_broker_audit`。如果 active workspace secret 使用 `delivery=proxy`
  但没有配置 `CLOUD_AGENT_SECRET_PROXY_URL`，runtime 会 fail-closed。每次 run 会重建
  自己的 credentials dir，减少跨 run 残留。env ref 默认 fail-closed，需要通过
  `CLOUD_AGENT_SECRET_ENV_ALLOWLIST` 显式允许；delivery 需要通过
  `CLOUD_AGENT_SECRET_DELIVERY_ALLOWLIST` 显式允许。SecretBroker issued/rejected 会
  写入 `secret_broker_audit` run event，审计事件不包含 raw secret value。
- `WorkspaceFileIndexEntry` 已进入 core/contracts/db：记录 workspace 内文件/目录的
  path、hash、mime、size、preview capability、metadata 和 deletedAt，为后续
  workspace browser、preview/download、artifact metadata 提供索引基础。
- `Artifact` metadata 新增版本化 `CloudArtifactMetadataV1`：可表达
  workspaceId、producedByRunId、sourcePath、contentHash、mime、size 和 preview
  capability；现有 `Artifact.uri` 继续作为 read/download URL 承载字段。
- Runtime event mapper 已支持 `permission_requested` 和 `approval_resolved`，
  provider adapter 后续可以把 Claude/Codex permission callback 投影进同一套
  durable `RunEvent`。

Claude env 放在：

```text
apps/cloud-agent-next-web/.env.local
```

注意：本机 shell / Codex 进程里可能已经有全局 `ANTHROPIC_BASE_URL`。cloud
Next app 通过 `readServerEnv()` 显式读取 `apps/cloud-agent-next-web/.env.local`，
并让该文件覆盖外层环境；`smoke:claude` 也用同样的覆盖语义。否则本项目明明写
DeepSeek，也可能被外层环境误导到 AnyRouter/OpenRouter 这类 gateway。

最小配置：

```env
ANTHROPIC_API_KEY=...
ANTHROPIC_BASE_URL=
```

DeepSeek Claude Code compatibility 配置：

```env
ANTHROPIC_API_KEY=<你的 DeepSeek API Key>
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_MODEL=deepseek-v4-flash
```

DeepSeek 官方文档使用 `ANTHROPIC_AUTH_TOKEN`。本 app 在检测到
`api.deepseek.com` base URL 时，会把 `ANTHROPIC_API_KEY` 自动映射成
`ANTHROPIC_AUTH_TOKEN` 传给 Claude Code 子进程。默认模型有意设置为
`deepseek-v4-flash`，并在 SDK option 里关闭 thinking，降低 smoke 测试成本。
需要长上下文/pro/max effort 时，再显式设置 `ANTHROPIC_MODEL=deepseek-v4-pro[1m]`
和 `CLAUDE_CODE_EFFORT_LEVEL=max`。

DeepSeek smoke 也走同一套 Claude Agent SDK 调用。默认工具集先保持最小可用：
`Bash`、`Read`、`Write`、`Edit`，并关闭 thinking、使用 flash 模型，避免连通性
和工具链验证一开始就消耗过多 token。需要更强模型、thinking 或更长工具循环时，
再通过 env 显式打开。

Claude agent package smoke 默认只有 5 秒超时，可通过 `CLAUDE_AGENT_TIMEOUT_MS`
调整；cloud Next web chat 默认使用 120 秒，可通过
`CLOUD_AGENT_WEB_CLAUDE_TIMEOUT_MS` 调整。`CLAUDE_AGENT_TIMEOUT_MS` 是底层
SDK timeout 的显式覆盖项，如果写在 `.env.local` 中会覆盖 web 默认值。
后续长任务执行再按 run/resource policy 单独放宽。

本地开发命令：

```bash
pnpm dev:cloud-agent-next-web
```

真实 Claude SDK smoke：

```bash
pnpm --filter @agent-infra/cloud-agent-runtime smoke:claude
```

该 smoke 默认读取 `apps/cloud-agent-next-web/.env.local`，不会打印密钥。
如果 DeepSeek 返回 SDK system event `api_retry` 且 `error_status=401`，
`ClaudeAgentAdapter` 会立即投影成 `agent_failed`，错误为
`Claude provider authentication failed...`，而不是等到 timeout。

`ANTHROPIC_API_KEY` 为空时，页面仍然可以创建 thread 和保存消息，但 assistant
会返回“ClaudeAgentAdapter is wired, but ANTHROPIC_API_KEY is empty.”。如果
DeepSeek 判定 token 无效，assistant message 会保存认证失败原因。填入或更换
API key 后需要重启 dev server，让 Next 进程重新读取 `.env.local`。

本 slice 暂时没有把 Claude 官方 `SessionStore` 接到数据库。原因是当前目标是
先跑通 adapter、Docker sandbox、thread URL 和 provider session binding；
`SessionStore` 后续应该通过我们自己的 `ProviderTranscriptStore` / DB adapter
映射进去，用于 resume/fork/debug，而不是直接替代产品层 `Thread` 和 `Message`。

## 2026-06-24 调研记录

这一轮重点核对了 Claude Agent SDK 官方用法、几个社区 Claude Code Web 集成，
以及本地 `/Users/david/Documents/github/ripple` 的控制面方案。

### Claude Agent SDK 的合理位置

官方 SDK 的定位是 agent loop/runtime adapter，而不是我们的产品数据库或
thread/workspace 模型。TypeScript 用法是 `query({ prompt, options })` 返回
async iterator；应用消费 SDK stream，然后把 typed message 投影成自己的事件。

我们应该遵守这条边界：

- SDK 负责模型调用、工具循环、内置工具、permission mode、resume/session
  hint、MCP/skills 等 provider-native 能力。
- 我们负责 tenant/user/workspace/thread/run/artifact/secret/audit/permission
  policy 这些产品事实。
- UI 和 route 不直接依赖 Claude 原始 message 格式。Claude、Codex、Pi 都要
  先进入同一套 `RuntimeEvent` / `RunEvent` schema。
- Claude `sessionStore`、JSONL、Codex raw events 这类原始 transcript 可以保存，
  但应作为 `ProviderTranscriptStore`，不是 UI messages 的唯一事实源。
- `resume` 和 provider session id 是 binding/hint；产品层 `Thread`、`Run`、
  `Workspace` 必须在 provider 状态丢失时仍能解释和恢复。

### 社区 Claude Code Web 集成

社区方案的共性是：Web 应用通常不重写 agent loop，而是把 Claude Code SDK/CLI
当执行引擎，然后围绕它补齐 workspace、session、permission、streaming 和
artifacts。

- `tfriedel/openwebui-claude-code`：Open WebUI pipe。每个 chat 有隔离
  workspace，同一 chat resume 同一 Claude Code session，工具调用和 artifacts
  inline 展示；模型、permission mode、tool allowlist、workspace root 等都做成
  配置项。
- `sugyan/claude-code-webui`：强调实时流式、project directory 选择、conversation
  history、tool permission 管理和 plan/normal 模式切换。
- 一些 CLI wrapper Web UI 使用 WebSocket 或 polling 连接后端进程。这说明
  transport 可以是 SSE/NDJSON/WebSocket，但关键不是协议，而是后端是否把
  provider events 归一、可重放、可恢复。
- `claude-code-viewer` 这类 session log viewer 更关注原始日志、严格 schema 和
  progressive disclosure。它提醒我们：raw transcript 应保留给 debug/审计，
  但产品 UI 仍应消费归一事件。
- streaming 部署层需要注意反向代理 buffering。无论用 SSE、NDJSON 还是
  WebSocket，都要有 heartbeat、可重新 attach、以及禁止 proxy buffering 的
  headers。

### Ripple 本地仓库方案

Ripple 的主线是 control plane / execution plane 分离：Rust server 负责
multi-user/session/run/workspace/sandbox/connector auth/skill manifest/approval
bridge/API boundary，执行委托给 server-side Codex app-server。

关键设计：

- 多租户入口是 `X-Ripple-User-Id`。隔离单元是 `user_id`，不是 session。
- 每个 user 有长期 sandbox/workspace：`.ripple/sandboxes/<user_id>/workspace`。
  session/run 都在这个用户 workspace 上执行；session 只保存元信息、消息、
  pending approval、pending connector auth、Codex thread id 等控制面状态。
- `SandboxManager` 负责 user sandbox 目录、workspace、credentials、sessions、
  `codex-home`、skill settings、archive 等路径。它明确把 user workspace 和
  session metadata 分开。
- `JobManager` 负责 `/runs`：创建 run、记录 job、写 `events.jsonl`、后台启动
  Codex provider、保存 output file、stderr/stdout tail、status、metadata。
- `/runs/{job_id}/events` 以 SSE 从 `events.jsonl` offset 读取并 follow，同时把
  Codex raw notification 派生成 plan/runtime/tool/usage 等 public event。
  这对我们后续的 durable `run_events` 很有参考价值。
- Codex app-server 是 per-user 长生命周期进程/会话管理。它通过 JSON-RPC stdin/
  stdout 初始化、发请求、接 notification，再按 thread/turn 路由到对应队列。
- 权限层不是靠 prompt：`thread_permission_config_for_user` 给 Codex 配
  managed permission profile。workspace 可写，service `CODEX_HOME` 和宿主
  `.codex` 禁读，runtime/cache 目录按需读写，`CODEX_HOME` 从 shell env 中排除。
- Codex auth 是 server-level auth，经 user `codex-home/auth.json` symlink 使用；
  用户 workspace 不直接拥有 service auth 文件。
- workspace API 提供 list/preview/save/rename/delete/create/upload/search，并
  对路径做 workspace-root validation，隐藏敏感顶层目录。
- frontend `useChatRun` 保存每个 running session 的 view state、AbortController、
  runtime timeline、plan、usage，并在 thread 切换时保持运行态。这值得作为
  我们 cloud Next app 后续交互层参考，但不是产品事实源。

Ripple 对我们的启发：

- 用户级 workspace 是更稳定的默认模型；thread 不应该天然拥有单独文件根。
- session lock 只保护同一 session 的连续聊天/compaction；同一 user workspace
  可以有多个 run 并发，冲突由任务/文件层处理。
- run event 必须可重放。UI 当前 stream 只是视图，`events.jsonl` 或 DB
  `run_events` 才是恢复、调试、观测、attach 的事实源。
- provider-specific raw events 可以被派生成 public runtime events，但不能让
  public schema 直接等于某一个 provider 的 raw schema。
- 权限 profile、workspace path 映射、secret/env allowlist 应放在执行面强制，
  不是靠系统提示词。

### 方案对比结论

- Claude 社区 Web UI 多数从“chat/session 体验”出发，适合参考 streaming、
  permission mode、tool trace、artifact 展示。
- Ripple 从“多用户控制面”出发，更适合参考 workspace/sandbox/session/run/
  connector/permission 的平台模型。
- 我们应选择 Ripple 风格的控制面，再接 Claude SDK / Codex SDK 作为可替换
  `AgentAdapter`。不要把我们的模型收缩成 Claude JSONL 或 Codex app-server
  notification 的薄壳。

## SDK-neutral Runtime 原则

这部分作为后续架构和实现 TODO 的约束：

- `RuntimeEvent` / `RunEvent` 必须是我们自己的版本化 schema。字段应该表达
  `agent_started`、`message_delta`、`tool_call_started`、`tool_call_delta`、
  `tool_call_completed`、`tool_call_failed`、`file_change`、
  `permission_requested`、`approval_resolved`、`usage_updated`、
  `provider_session_bound`、`provider_session_lifecycle`、`run_requeued`、
  `run_completed`、`run_failed` 等平台事件。
- Provider raw event 必须可保存，但只能作为 debug/resume/fork/audit 的输入。
  UI、DB 查询、observability、artifact 关联优先使用 normalized event。
- Transport 独立于 schema。Next route 可以先用 NDJSON，run API 可以用 SSE，
  未来需要双向 approval 或 attach 多客户端时再加 WebSocket；三者都消费同一
  event store。
- `Thread` 保存产品会话元信息和消息时间线；`ProviderSessionBinding` 保存
  Claude session id / Codex thread id；`ProviderTranscriptStore` 保存 provider
  原始 transcript；三者有关联但不能互相替代。
- `Workspace` 默认按 user 级长期存在；thread 共享 workspace。需要更强隔离时，
  在 run 层创建 overlay/private workspace/scratch mount，而不是把 durable
  thread 强行变成文件隔离单元。
- `Artifact` 暂时不是第一阶段主线。第一阶段只需要能记录“run 改了哪些文件 /
  写到了 workspace 哪里”，后续再把 preview、download、snapshot、artifact
  gallery 做成增强能力。

## 分阶段 TODO

这份 TODO 的优先级按“企业内部部署的云端 Agent 基础设施”排序。第一阶段目标是
把多用户 workspace、sandbox 执行边界、SDK adapter、工具调用、run event 和
SQLite 持久化跑稳；Artifact、复杂 UI、评测、管理台增强都放到后面。换句话说，
SDK-neutral schema 是为了服务 sandbox/runtime/control plane，不是为了追求抽象
本身。

### P0：先接回现有 durable 基础设施

- [x] 确认当前仓库已有 `Thread`、`Run`、`Message`、`RunEvent`、
  `ToolInvocation`、`Artifact` 和对应 repository 接口。
- [x] 明确 cloud agent runtime 不另起一套 thread/message/run 模型，而是在
  `packages/core`、`packages/contracts`、`packages/db`、`packages/app` 上扩展。
- [x] 盘点 `packages/db` 现有 schema/repo 是否已经覆盖上述 repository，
  确认 cloud app 应复用哪些现成实现。
- [x] 把 `apps/cloud-agent-next-web` 当前 app-local JSON thread store 标记为
  spike-only，并将 thread/message/run 的主写入路径切到 SQLite repositories。

### P1：最小 Cloud Runtime 数据语义

- [x] 给 `RunEvent` 定义 provider-neutral、版本化事件 payload 类型。存储层可以
  保持 `type + payload`，但 contracts/types 层要有明确 union。
- [x] 第一批事件只覆盖基础链路：`run_started`、`agent_message_delta`、
  `tool_call_started`、`tool_call_delta`、`tool_call_completed`、
  `tool_call_failed`、`file_change_detected`、`provider_session_bound`、
  `usage_updated`、`run_completed`、`run_failed`。
- [x] 暂不把 `artifact_created` 放入第一批必需事件；文件变更先用
  `file_change_detected` 表达。
- [x] 新增或规范 `Workspace` 语义：企业内部部署第一版按 user 级默认 workspace，
  多个 thread 共享；run 可创建临时 overlay/private scratch。
- [x] 新增 `ProviderSessionBinding`：记录我们的 thread/run/workspace 与 Claude
  session id、Codex thread id 等 provider-owned id 的关系。
- [x] 新增 `ProviderTranscript` / `ProviderTranscriptStore`：保存 Claude raw
  message/JSONL/SessionStore、Codex raw notification，用于 resume/debug/audit。

### P2：Workspace / Sandbox / Worker 执行面

P2 的核心不是 session resume，而是把 agent 执行从 Next route 和宿主机路径里
拿出来，形成可队列化、可隔离、可续租、可恢复的 worker/sandbox 执行面。resume
只作为这条链路上的连续性能力，不能反过来主导 workspace 或 sandbox 模型。

#### P2 暂停快照（2026-06-25）

P2 现在先暂停，不继续深挖。当前已经足够支撑回到主线验证：

- workspace/sandbox 主路径已经成型：user 级 workspace、Docker sandbox、
  `/workspace` 公开 cwd、provider home/config/credential/run temp/private scratch
  目录边界已经固定；`local` execution 只保留为显式开发逃生口。
- worker/queue 主路径已经具备最小生产形态：route 可以只创建 durable run，
  独立 worker 通过 DB claim/lease/renew/retry/cancel 执行；`db-queue` 和 BullMQ
  都有 provider seam；run event attach/follow 可以跨进程从 DB replay/follow。
- queue/worker 运维面已有最小可观测和控制动作：queue snapshot、summary、
  recommended actions、dead-letter 分类、failed retry、lease-expired requeue、
  dead-letter cancel、worker registry/heartbeat、drain、clear-drain、stale worker
  cleanup 和 stopped audit metadata。
- provider session 主路径已有最小连续性事实：binding、raw transcript store、
  recovery event、lifecycle audit、replay plan、compact/replay continuity prompt、
  recovery report、strategy manifest 和 recommended actions。

暂停时仍未完成、但不阻塞回归主线的 P2 增强项：

- 更完整的死信策略、worker pool 管理、租户级 worker pool 和更正式的运维控制面。
- Temporal 或其他 workflow backend 的真实 provider 实现。
- provider-specific transcript injection、native compact/fork 执行策略和恢复管理 UI。
- 更严格的生产部署拓扑、水平扩容、跨节点 worker 调度和完整 SLO/告警策略。

接下来不再用 P2 继续扩展控制面，而是回到主线：验证真实 SDK 执行、Docker sandbox
写文件路径、工具事件、workspace 文件事实、permission/secret/MCP/profile，以及用
CodexAdapter 横向反证 provider-neutral 抽象。

- [x] 固化 user 级 workspace resolver：user workspace、provider config dir、
  credentials dir、run temp dir、private scratch dir。
- [x] Docker sandbox 继续作为第一版 `SandboxProvider`，挂载 user workspace 到
  `/workspace`。
- [x] 默认 Claude agent SDK process 和工具命令进入 Docker sandbox 内运行；
  `CLOUD_AGENT_CLAUDE_EXECUTION=local` 只作为显式开发逃生口。
- [x] 抽出本地 in-process queue/worker seam：Next route 创建 user message/run
  后 enqueue job，worker 负责 SDK stream、run events、assistant message、
  tool invocations 和 run terminal status。
- [x] 将 queue job payload 收缩为 durable `runId`：run 先以 `queued` 状态落库，
  worker 从 DB 恢复 thread、trigger message、owner 和 provider，并在真正执行前
  标记 `running`。
- [x] 增加 standalone worker entrypoint：同一段 runId job 执行逻辑可由
  `worker:run <runId>` 在 route 之外调用，作为独立 worker/queue 后端前的进程边界
  验证。
- [x] 增加 DB-backed `worker:once` poller：独立进程可以查找最早 queued run 并执行
  一次，验证 route 外 durable queue 拉活路径。
- [x] 增加 run claim/lease/attempt 基础语义：`RunRepository.claimNextQueued`
  按 app scope 领取 queued 或 lease-expired run，写入 worker id、lease expiry 和
  attempt count，terminal 状态清理 claim。
- [x] 增加 run claim 续租：`RunRepository.extendClaim` 只允许当前 worker 在 lease
  未过期前续租；standalone worker 执行期间会定时续租。
- [x] 增加长驻 `worker:loop` poller：独立进程可以持续 claim/execute/renew queued
  runs，形成 route 创建 run、worker 拉取 run 的本地闭环。
- [x] 增加 worker bounded concurrency：`CLOUD_AGENT_WORKER_CONCURRENCY` 控制单
  worker 进程并发 run 数；worker 停止时不再领取新 run，并等待 active run 收尾。
- [x] 增加 retry/backoff 基础语义：worker-mode 异常失败时，如果未超过最大尝试
  次数，会将 run 重新置为 queued 并设置 `nextAttemptAt`；claim 只领取到期 run。
- [x] 增加跨进程 run event follow（DB polling）：stream route 不再只依赖
  in-memory hub，独立 worker 写入 DB 后也能被 attach/follow 看到。
- [x] 增加 run queue provider seam：`in-process` provider 继续支持本地请求内执行；
  `db-poll` / `db-queue` provider 让 message route 只做 user message/run 创建和
  stream attach，不再在请求内 enqueue/await SDK execution；独立 `worker:loop`
  通过同一 provider 从 DB claim 后执行。
- [x] 增加 DB-backed `db-queue` provider 名称：worker scripts 不再硬编码 `db-poll`，
  `db-queue` 可作为外部 worker 模式的显式配置，仍复用 durable run claim/lease/
  retry/cancel/follow 语义。
- [x] 增加 worker queue options diagnostics：`/api/runtime/queue` 会返回当前 worker
  concurrency、lease、poll、retry、idle 配置；worker scripts 与 diagnostics 复用同一
  套 env 解析，后续 worker pool 操作边界不再散落在脚本里。
- [x] 增加 DB-backed queue 并发 claim 测试：多 worker 同时 claim queued runs 时不
  会重复领取同一个 run；未抢到的 run 会在后续 poll/claim 中继续被领取。
- [x] 增加 run queue provider diagnostics/fail-fast：固定 `bullmq`、`temporal`
  planned backend 名称和 required env，未实现的 provider 配置会明确报错，不会静默
  退回本地 DB provider；diagnostics 会返回 production readiness，避免把
  `in-process` / `db-poll` 误当生产执行面。
- [x] 增加 BullMQ queue provider（minimal）：route 可把 durable `runId` enqueue 到
  Redis/BullMQ；`worker:bullmq` 消费 job 后通过 DB `claimById` 写入 claim/lease，
  再复用现有 SDK execution、retry、cancel、event follow 链路。
- [x] 增加 BullMQ queue 操作面（minimal）：`/api/runtime/queue` 可返回 queue counts
  和 failed jobs，并支持 `retry-failed` / `clean-completed` 两个受控运维 action。
- [x] 增加 worker registry/heartbeat（minimal）：DB 记录 worker id、queue provider、
  status、concurrency、active run ids 和 heartbeat；`worker:loop` / `worker:bullmq`
  会定期写入 active/draining/stopped，`/api/runtime/queue` 可返回最近 worker 列表。
- [x] 增加 worker drain 控制面（minimal）：`/api/runtime/queue` 支持
  `drain-worker` 和 `mark-worker-stopped`；worker heartbeat 会保留 control metadata，
  收到 drain request 后停止领取新任务，等待 active runs 收尾后退出。
- [x] 增加 DB run queue snapshot（minimal）：`/api/runtime/queue` 可从 durable run
  store 返回 app scope counts、queued/running/failed 样本、retry-delayed runs 和
  lease-expired runs，并带 summary/recommended actions，避免只依赖 BullMQ 或进程内
  状态判断队列健康。
- [x] 增加 DB dead-letter 分类（minimal）：queue snapshot 会按
  `CLOUD_AGENT_WORKER_MAX_ATTEMPTS` 把 failed runs 中达到重试上限的 run 投影为
  `deadLetterRuns`，用于人工判断和后续重放。
- [x] 增加 DB failed run retry（minimal）：`/api/runtime/queue` 可把 app scope failed
  runs 重新排回 queued，并写入 `run_requeued` event；达到 dead-letter 阈值的 failed
  run 默认不会被普通 retry 重放，会作为 `skippedDeadLetterRuns` 返回，只有显式
  `includeDeadLetter=true` 才会纳入重试；BullMQ job retry 继续只处理 Redis 调度层
  failed jobs。
- [x] 增加 DB lease-expired run requeue（minimal）：`/api/runtime/queue` 可把 claim
  已过期的 running runs 显式排回 queued，清理 claim owner/expiry，并写入
  `run_requeued` event。
- [x] 增加 DB dead-letter cancel（minimal）：`/api/runtime/queue` 可把达到最大尝试
  次数的 failed runs 标记为 `cancelled`，并写入 `run_cancelled` event，作为人工
  关闭不再重试任务的审计路径。
- [x] 增加 run cancellation 基础语义：HTTP cancel route 可将 owned queued/running
  run 标记为 `cancelled`，写入 `run_cancelled` event；worker 在执行前和事件循环中
  检查 cancelled 状态，不把取消误报成 failed/retry；聊天 stop 会调用 cancel API。
- [ ] 把 queue/worker 生产操作边界补完整：Next route 最终只做控制面、鉴权、run
  创建和 stream/attach。这条链路已有 `db-poll` / `db-queue` 和 BullMQ provider；
  BullMQ 已有最小 counts、failed retry 和 completed cleanup 操作面，DB run queue
  snapshot 已能暴露 durable counts、retry-delayed、lease-expired runs、summary 和
  recommended actions，DB failed run retry 已能重放 durable failed runs，
  DB lease-expired requeue 已能恢复 stale
  running runs，dead-letter runs 已有最小分类和人工 cancel 动作，worker registry
  已有 heartbeat/active run/stale worker 可观测性、池级 summary 和 recommended actions，worker drain 已有单 worker、
  worker pool 和 clear-drain 最小控制动作；mark stopped 默认保护 active runs，
  stale worker 已有批量 mark stopped 动作，worker stopped/stale cleanup 会写入
  actor/reason metadata；DB retry 已默认跳过 dead-letter runs，并要求显式
  `includeDeadLetter=true` 才能重放；仍需补更完整的死信策略、worker 池管理能力，
  以及 Temporal 等更完整 workflow backend 的实际实现。
- [x] session resume 最小规则：首次 Claude run 不传产品 thread id 作为
  provider `sessionId`，而是捕获 SDK 返回的 provider session id 并写入 binding；
  后续恢复指定 thread 时使用 binding 中的 provider session id 作为 `resume`，不在
  多用户云端路径依赖 `continue: true`；resume/session 失效时归档旧 binding，并无
  resume 重试一次。
- [x] provider 状态丢失后的显式恢复策略（最小版）：resume 失败时记录
  `provider_session_recovery` event，归档旧 binding，并用 `archive_and_restart`
  策略无 resume 重试一次。
- [x] provider session lifecycle 后端边界（最小版）：可列出 binding +
  transcript summary，并可把 active session 标记为 forked/archived/compact-ready，
  metadata 保留 actor、reason 和 transcript replay summary。
- [x] provider session lifecycle audit event（最小版）：archive/fork/compact/replay
  action 会写入 `provider_session_lifecycle` run event，recovery report 会同时返回
  lifecycle events 和 recovery events，保证 session 恢复控制面动作可回放、可审计。
- [x] provider transcript replay plan（最小版）：provider session API 会返回最近
  transcript entry refs、ordinal range、source run ids 和受限短摘要；`replay` action
  会把该 replay plan 写回 active binding metadata，作为后续 provider-specific replay
  的 durable 输入索引和 provider-neutral continuity 背景。
- [x] provider transcript replay/compact recovery hint（最小版）：active binding 的
  replay/compact metadata 会进入执行层；如果后续 resume 失败且 replay plan 可用，
  worker 会记录 `provider_session_recovery strategy=replay_transcript` 或
  `strategy=compact`，归档旧 binding 并无 resume 重试。
- [x] provider-neutral continuity prompt（最小版）：active binding 的 replay/compact
  metadata 会被转成 `AgentContinuityContext`，并通过统一 prompt builder 注入 Claude
  local、Docker Claude 和 Codex adapter，用于无 provider-native resume 时给 SDK
  提供恢复背景；`compact` action 会保持 active binding，避免控制面记录了 compact
  意图但执行层拿不到 metadata。continuity prompt 会包含最近 transcript entries 的
  受限短摘要，但不会把 provider raw JSONL/notification 当成产品消息全量灌入 prompt。
- [x] provider session recovery observability（最小版）：新增 thread 级 recovery
  report API，可聚合 session bindings、transcript replay plan、recovery events、
  source runs 和 strategy counts，作为 fork/compact/replay 后续 UI 和恢复策略调试
  的后端入口。
- [x] provider recovery strategy manifest（最小版）：recovery report 会返回 Claude /
  Codex 对 resume、archive restart、replay transcript、compact、fork 的
  supported/planned/manual 状态，先把不同 SDK 的恢复能力差异显式暴露给控制面。
- [x] provider recovery recommended actions（最小版）：recovery report 会按 session
  status、provider manifest 和 replay plan 给出 per-session recommended actions，
  让后续 UI/worker 不需要自己猜该 resume、replay、compact、archive restart 还是
  等待人工处理。
- [ ] session resume 增强规则：fork/compact/replay 的 provider-specific 执行策略、
  replay 已有最小 recovery hint、recovery report API、provider strategy manifest
  和 recommended actions，仍需补真正 provider-specific transcript injection /
  compact 执行和恢复管理 UI。
- [x] Provider raw transcript 与 product messages 分离：raw 用于恢复和审计，
  UI 消费 normalized message/event。
- [x] 对企业内部部署写清楚默认安全姿态：内部可信 MVP，但不共享 provider home、
  不暴露 host path、不把长期 secret 直接写入 workspace。

### P3：SQLite 持久化和 Durable Run Events

- [x] 把 cloud app 的 thread/message/run 写入现有 DB repository，而不是
  app-local JSON。
- [x] 持久化 `provider_session_bindings` 和 `provider_transcripts`。
- [x] 让 Claude adapter 产生的 normalized events append 到 `RunEventRepository`。
- [x] 增加最小 replay API：route 可以从 durable `run_events` 读取某个 run 的
  已持久化事件，用于页面刷新后恢复时间线。
- [x] route streaming 支持从 durable run events replay 并通过 hub follow live
  events，不再只能依赖当前 route-local SDK stream。
- [x] 增加最小后端 attach/follow 语义：同一 run 刷新后可以先读已有 output、
  tool calls 和 terminal status，再继续跟随 live events。
- [x] 增加最小前端 reattach：thread 加载时查询 active runs，并通过 durable run
  events stream 恢复 assistant delta、tool calls、file changes 和 pending approval。
- [x] 不做 JSON -> SQLite 迁移；本地 spike 数据可以丢弃。

### P4：工具函数和工具调用基础设施

- [x] 把 `Bash`、`Read`、`Write`、`Edit` 作为第一批基础工具能力记录到
  provider-neutral tool event 中。
- [x] 统一工具调用生命周期：started、delta、completed、failed。
- [x] `ToolInvocationRepository` 与 `RunEventRepository` 的关系要明确：
  `ToolInvocation` 保存结构化当前态，`RunEvent` 保存可重放事件流。
- [x] 文件写入先记录到 provider-neutral 事件/工具当前态：path、toolCallId、
  status、error；先不做完整 Artifact 管理。
- [x] 明确工具执行 cwd：Docker sandbox 内固定 `/workspace`，不得向模型暴露宿主机真实
  路径。
- [x] 后续 approval bridge 打开前，本地验证可继续 `acceptEdits`，但接口上要能
  表达 permission request。

### P5：Permission / Secret / MCP 企业安全能力

P5 关注企业内部部署最容易出安全边界问题的能力：人工 approval、secret 发放、
MCP/skills/profile 配置和第二 SDK 验证。它们都应该挂在 workspace/run/control
plane 上，而不是落成某一个 SDK adapter 的私有配置。

- [x] CodexAdapter 最小 smoke：先只验证同一 `AgentAdapter`、`RunEvent`、
  workspace、sandbox、provider transcript 接口能接第二个 SDK，不追求功能完整。
- [x] Permission/approval event schema：把 Claude/Codex 的 permission request/
  resolve 映射为 provider-neutral request/resolve 事件。
- [x] Permission/approval callback bridge（local/policy）：Claude local adapter
  接入真实 SDK `canUseTool` callback，通过 `PermissionBroker` 决策并写入统一
  permission/approval runtime events。
- [x] Durable approval request store + HTTP decision API：`permission_requested`
  会创建 pending `run_approval_requests`，`approval_resolved` 会解析为
  approved/denied 状态；HTTP API 可以列出 run approvals 并提交 approve/deny。
- [x] Durable waiting broker（local adapter）：显式
  `CLOUD_AGENT_APPROVAL_BRIDGE=durable` 时，Claude local `canUseTool` callback 可以
  等待 HTTP 写入的 durable decision，再恢复 SDK 执行。
- [x] Permission/approval callback bridge（Docker/worker durable path）：Docker
  runner 已有 stdout/stdin approval IPC，worker 可通过 durable broker 等待 HTTP
  decision，并在决策后恢复 SDK 执行。
- [x] Permission/approval UI bridge（minimal）：message stream 会投影
  `approval_request` / `approval_resolved`，页面可对当前 run 的 pending approval
  做允许/拒绝操作。
- [x] Permission/approval reattach（minimal）：刷新或切回 thread 后，如果 run
  仍为 queued/running，页面可通过 durable run event replay 恢复 pending approval。
- [x] Permission/approval timeout/expired 状态：durable broker 超时会把 pending
  approval request 标记为 `expired`，写入带 `status=expired` 的
  `approval_resolved` run event；message stream 和 reattach UI 可以把 expired 与
  普通 deny 区分开。
- [x] Permission/approval cancelled 状态：run cancel 会把 pending approval request
  标记为 `cancelled`，写入带 `status=cancelled` 的 `approval_resolved` run event；
  durable broker、message stream 和 reattach UI 可以把 cancelled 与 deny/expired
  区分开。
- [x] Permission/approval 多客户端最小广播：HTTP approve/deny 会立即写入并发布
  `approval_resolved` durable run event，其他 attach 客户端可通过 event stream 看到
  决策；SDK callback 后续返回同一决策时会跳过重复的 resolved event。
- [x] Permission/approval 并发决策最小语义：repository 增加 pending-only resolve；
  HTTP decision、timeout、run cancel 和 runtime callback 都不会覆盖已经 resolved 的
  approval request，后到的 HTTP 决策会返回 409。
- [ ] Permission/approval UX/attach 增强：补齐更完整的管理台审批体验。
- [x] Secret refs：持久化 per-workspace secret references，不保存 raw secret。
- [x] SecretBroker 最小边界：env-backed secret ref 解析、短期 credential 发放、
  delivery/env allowlist、无 raw value 审计、fail-closed。
- [x] SecretBroker provider diagnostics/fail-fast：固定 `vault`、`kms`、`proxy`、
  `file-materializer` planned provider 名称和 required env，未实现 provider 配置会
  明确报错，不会静默退回 env。
- [x] SecretBroker agent runtime 注入链路：workspace active secret refs 会通过
  broker resolve 成短期 env secrets 注入 adapter env；issued/rejected 写入
  `secret_broker_audit` run event，不落 raw value。
- [x] SecretBroker file delivery 最小链路：`delivery=file` 的 allowlisted secret 会
  materialize 到 per-run credentials dir；Docker adapter 将该目录只读挂载到
  `/agent-credentials`，并把容器内文件路径注入目标 env，避免把宿主路径暴露给容器内
  agent/tools。
- [x] SecretBroker proxy token 最小链路：`delivery=proxy` 的 allowlisted secret ref
  会得到短期 HMAC token，绑定 scope/purpose/ref/targetName 后注入目标 env；runtime
  package 提供 token 验签/过期校验 helper，token 不包含 raw secret value，缺少
  `CLOUD_AGENT_SECRET_PROXY_SIGNING_KEY` 时 fail-closed 并记录 rejected audit。
- [x] SecretBroker proxy exchange 最小链路：`POST /api/runtime/secrets/proxy-exchange`
  可以用短期 HMAC proxy token 兑换 scoped secret value；runtime 会把
  `CLOUD_AGENT_SECRET_PROXY_URL` 注入 sandbox env，缺失时 fail-closed；route 会校验
  签名、过期时间、proxy delivery allowlist 和 env secret allowlist，并写入不含 raw
  value 的 `secret_broker_audit`。这仍只是最小内置 gateway，不等于 Vault/KMS 或独立
  proxy service 已完成。
- [ ] SecretBroker 生产增强：Vault/KMS/secret manager 真实 provider、proxy gateway
  独立服务化/网络边界、文件注入 materializer 和轮换策略。
- [x] MCP/Skill/Profile registry：每个 workspace 的 provider/model、MCP servers、
  skills、tool allowlist、approval/sandbox profile 进入 durable model。
- [x] AgentProfile 执行配置链路（minimal）：执行前读取 workspace/provider active
  profile，并将 model、tool allowlist、approval policy、sandbox mode 应用到
  Claude adapter 配置。
- [x] Remote MCP/Skill SDK option 链路（minimal）：profile 中显式配置的 HTTP/SSE
  MCP servers 和 skill refs 会进入 Claude SDK options，并启用 `strictMcpConfig`，
  避免读取 provider home/project 中未受控 MCP 配置。
- [x] Stdio MCP sandbox pass-through（minimal）：profile 中显式配置的 `transport=stdio`
  MCP server 只在 Docker execution mode 下进入 Claude SDK options，让 MCP command
  在容器内运行；local execution mode 会跳过 stdio MCP。
- [x] Stdio MCP command allowlist（minimal）：通过
  `CLOUD_AGENT_MCP_STDIO_COMMAND_ALLOWLIST` 可按 command 跳过未允许的 stdio MCP，
  并把 allow/deny 决策写入 `mcp_profile_audit`。
- [x] MCP/Profile audit event（minimal）：执行前记录 `mcp_profile_audit` run event，
  明确 remote MCP、stdio MCP、skill refs 的 enabled/skipped 决策和跳过原因。
- [x] Remote MCP host allowlist（minimal）：通过
  `CLOUD_AGENT_MCP_REMOTE_HOST_ALLOWLIST` 可按 hostname 跳过未允许的 HTTP/SSE MCP，
  并把 allow/deny 决策写入 `mcp_profile_audit`。
- [x] Remote MCP HTTPS policy（minimal）：HTTP/SSE MCP 默认只允许 `https:` URL；
  `http:` URL 会记录 `remote_insecure_http_not_allowed`，除非显式设置
  `CLOUD_AGENT_MCP_ALLOW_INSECURE_HTTP=true`。
- [x] Remote MCP inline headers policy（minimal）：默认跳过带 inline headers 的
  HTTP/SSE MCP server，并在 `mcp_profile_audit` 中记录
  `inline_headers_not_allowed`；需要兼容旧 profile 时可显式打开
  `CLOUD_AGENT_MCP_ALLOW_INLINE_HEADERS=true`。
- [x] Remote MCP per-server tool policy（minimal）：profile 中 HTTP/SSE MCP server
  可声明 `toolAllowlist`，runtime 会编译成 Claude SDK remote MCP `tools` policy，并在
  `mcp_profile_audit` 记录 per-server tool allowlist。stdio MCP 暂不伪造 per-tool
  enforce，仍依赖 sandbox + command allowlist。
- [x] Skill ref allowlist（minimal）：通过 `CLOUD_AGENT_SKILL_REF_ALLOWLIST` 可跳过
  未允许的 profile skill refs，并把 allow/deny 决策写入 `mcp_profile_audit`。
- [x] Skill materialization manifest（minimal）：enabled skill refs 会写入 per-run
  `skill-materialization.json`，并通过 `CLOUD_AGENT_SKILLS_MANIFEST` 注入 sandbox env；
  `mcp_profile_audit` 会记录 enabled skill 的 manifest path，先让 skill refs 从
  profile 字符串进入可审计执行面计划。
- [ ] MCP/Skill materialization 增强：stdio MCP 已有 Docker-only 最小链路和最小
  profile audit，remote MCP 已有最小 host allowlist，skill refs 已有最小 allowlist；
  remote MCP 已有 SDK 原生 per-server tool policy，skill refs 已有 per-run manifest；
  但还需要 gateway/proxy 执行审计、实际 egress enforcement、跨 transport per-tool
  policy；skills/plugins 的真实文件 materialization、版本
  pinning、签名/风险等级和禁用 shell execution 策略仍待补齐。
- [x] Stream hub：route-local streaming 后续抽成可 attach/reconnect 的 server
  能力。
- [x] Observability 后端 API：按 run 聚合 timeline events、tool trace、usage/error、
  file change events 和 provider raw transcript drill-down。
- [x] Observability workspace diff 后端增强（minimal）：run observability 中的
  workspace file changes 会带可选 `diff`；worker before/after baseline 捕获的小文本
  created/modified/deleted 文件可返回 unified diff；缺少 baseline、当前文件不可读
  或文件过大时返回明确 unavailable reason。
- [ ] Observability UI/管理台：run timeline、tool trace、usage、errors、
  file changes、provider raw event drill-down 的可视化。

### P6：Artifact 和更完整 workspace 增强

- [x] 明确 Artifact 不是第一阶段主线；第一阶段只做文件变更、workspace index
  和必要 metadata，不做完整 artifact gallery。
- [x] 增加 workspace file index：content hash、mime、size、preview capability。
- [x] 增加 artifact metadata：producedByRunId、source path、download/read URL。
- [ ] 只有当基础工具、run events、workspace 持久化稳定后，再增强 artifact
  preview/download/gallery。
- [x] 增加 workspace diff/review 最小持久化模型：change set、
  created/modified/deleted file changes、merge/discard status、snapshot refs。
- [x] 将 `file_change_detected` runtime event 同步成 workspace change set、
  file change row 和 workspace file index entry，让“run 改了哪些文件”进入 durable
  runtime 事实。
- [x] 增加 worker before/after workspace hash diff：run 完成后记录真实
  created/modified/deleted 文件变化，并跳过已由 `file_change_detected` 表达的
  同一路径/类型，减少重复 file change row。
- [x] 增加 workspace manifest snapshot refs（minimal）：`workspace_diff` change set
  会写入 before/after path-hash manifest 的稳定 SHA-256 ref、fileCount 和
  changeCounts，为后续 merge/rollback 提供最小 snapshot 输入。
- [x] workspace diff 内容增强（minimal）：created/modified/deleted 小文本文件可以在
  observability DTO 中返回 unified diff；缺少 baseline、当前文件不可读或文件过大时
  显式返回 unavailable。
- [x] workspace diff review 后端控制面（minimal）：`/api/workspace/change-sets`
  可列出当前用户 workspace 的 change sets，`merge`/`discard` action 可将 pending
  change set 标记为 resolved，并记录 actor/reason metadata。
- [x] workspace snapshot/rollback 后端控制面（minimal）：workspace diff metadata
  会为小文本 created/modified/deleted 保存 before/after snapshot；change set
  `rollback` action 可按 owner 校验后删除 created 文件、恢复 modified/deleted 文件
  的 before 内容，并更新 workspace file index。大文件、二进制、冲突合并和 UI
  review 仍不在这一最小链路内。
- [ ] 增强 workspace diff/review：完整 snapshot 持久化/合并、冲突处理、review UI、
  snapshot/version 回滚。

## 推荐近期顺序

近期不用继续扩 UI 细节，也不要围绕某一个 SDK 的网页体验倒推架构。当前已经完成
了 durable model、SQLite 主路径、provider transcript、最小 Claude/Codex adapter、
run event replay/follow、基础工具事件、profile/secret refs 和 workspace file index。
从现在往后，优先级应按“云端 runtime 是否真的可控、可隔离、可审计、可替换 SDK”
排序。换句话说，下面的顺序不是“先把模型画完整再实现”，而是“用真实执行闭环校验
模型是否够用”：

1. 回到真实 SDK 执行闭环：用 Claude Code SDK 通过当前 worker/sandbox 路径完成
   Bash/Read/Write/Edit 的端到端验证，重点看 SDK event 如何进入
   provider-neutral run events、tool invocations、assistant message 和 DB replay。
2. 收紧执行面隔离：继续验证 agent SDK process 和工具命令都在 sandbox/worker
   内运行。验收重点是容器内 `pwd=/workspace`、不暴露 host path、不共享 provider
   home、不读取其他用户 workspace/secret。P2 的 worker/queue 控制面暂时不再深挖。
3. 把文件写入结果变成 runtime 事实：在现有 file index、workspace diff 和
   `file_change_detected` 事件之上，优先保证“这个 run 改了哪些文件、文件在哪、
   如何回放/审计”可以从 DB 解释。
4. 落地 permission / SecretBroker / MCP / skills 执行策略：approval request 要
   变成 durable pending state，UI/worker 可以双向协作；secret refs 只发放
   scoped、短期、allowlisted credential，并留下不含 raw value 的审计事件；
   MCP/skills/profile 必须按 workspace/user 归属 materialize 到 sandbox，而不是
   变成某个 SDK adapter 的私有配置。
5. 继续用 CodexAdapter 横向反证抽象：这不是后置大任务，而是每新增一块 runtime
   能力时都要确认它不是 Claude-only 语义；Codex 可以暂时功能少，但必须能穿过
   同一套 adapter/event/workspace/sandbox/store/permission/secret 边界。
6. 补 session/resume 增强语义：provider session binding、raw transcript、
   replay/compact continuity 和 recovery report 已有最小事实；真正 provider-specific
   transcript injection、native compact/fork 和恢复 UI 暂时排在主线闭环之后。
7. 做后端 observability，而不是先做复杂管理台：run timeline、tool trace、usage、
   errors、file changes、provider raw transcript drill-down 先有 API/数据事实，
   UI 只做必要验证面。
8. Artifact、workspace browser、preview/download/gallery、评测和复杂 UI 放到
   后续增强；它们不能抢在 sandbox、secret、permission、resume 和 diff 前面。

如果只排接下来最实际的三步，应是：

1. 先验证和收紧 Docker sandbox 执行路径：Claude SDK process、Bash/Read/Write/Edit、
   stdio MCP、provider home、secret file/env、workspace mount 都在容器内，并能稳定
   证明 `pwd=/workspace` 与 host path 不外泄。
2. 然后把文件写入结果变成 runtime 事实：workspace file index、file change set、
   diff/review、run event、tool invocation 都能从 DB 解释“这个 run 改了哪些文件”。
3. 再用 Codex adapter 横向验证：同一套 worker/sandbox/workspace/event/permission/
   secret 接口可以接第二个 SDK，发现 Claude-only 的表达就回到 provider-neutral
   类型中修正。

## Provider 命名约定

为了避免后续出现一堆含义不同的 `ProviderXxx`，先固定这些词：

- `AgentAdapter`：Claude、Codex、Pi 这类 agent SDK / runtime 的适配层。
  它负责把统一的 run request 转成对应 SDK 调用，并把 SDK stream 投影成
  我们的 message / run event。
- `SandboxProvider`：Docker、Daytona、E2B、gVisor、Firecracker 这类执行
  环境后端。它负责创建/销毁 sandbox、执行命令、访问 workspace 文件、
  收集变更。
- `StorageProvider`：local filesystem、S3、R2、MinIO 这类 workspace /
  artifact 字节存储后端。它负责 materialize workspace 和保存快照/产物。
- `ProviderSessionBinding`：我们的 `thread/workspace/run` 到 Claude session
  id、Codex thread id 等 provider-owned session id 的映射。
- `ProviderTranscriptStore`：原样保存 Claude `SessionStoreEntry`、Codex raw
  events 等 provider 原始 transcript。它是 resume/fork/debug 的事实源，
  不是产品 UI 的唯一消息源。
- `SecretBroker`：secret 解析和发放边界，不叫 provider。它负责把
  `SecretRef` 转成短期、限权、可审计的执行凭证。

规则是：`Provider` 用在“可替换基础设施后端”；`Adapter` 用在“接某个 agent
SDK”；`Store` 用在“持久化原始状态”；`Broker` 用在“受控发放敏感能力”。

## 起点判断

`repomix-output/1.md` 里最值得保留的判断是：用户看到的“云端文件夹”
不应该等同于服务器上的长期目录。更稳的模型是：

- 数据库存事实、关系、权限、索引
- 对象存储存文件字节、workspace 快照、插件包、运行产物
- 沙箱本地盘只作为一次 agent 执行时的临时 working copy

放到本项目中，更合适的产品模型是：

```text
Tenant / Org
  -> User
     -> Workspace
        -> Threads
           -> Runs
              -> Sandbox sessions / provider sessions
```

`thread` 仍然应该是 durable conversation timeline。Claude/Codex SDK
自己的 session/thread id 可以存成 provider binding，但不能替代本项目
自己的 durable thread/workspace/run 模型。

## 当前项目中可以复用的东西

这个仓库已经有很适合作为 control plane 的底座：

- `packages/core` 已经定义 `Thread`、`Run`、`Message`、
  `MessagePart`、`ToolInvocation`、`RunEvent`
- `packages/app` 已经有 `AgentInfraRuntimePort`，可以把 app use case
  和 runtime adapter 分开
- `packages/db` 已经负责 Drizzle 持久化
- `apps/playground-next-web` 和 `apps/playground-fastify-server` 已经有
  host-local auth、cookie session、request current user
- `playground_thread_catalog` 已经证明 thread ownership 可以绑定到宿主
  auth user
- Next/Fastify 的 stream route 已经证明 run creation、runtime execution、
  live update、attach-stream、durable reconcile 可以跑通
- observability、dataset capture、eval run、usage、trace/timeline 已经是
  将来 cloud agent inspection 的基础

现在最大的缺口是：当前 runtime port 还是“文本 turn runtime”。它还不表达
workspace、object storage、sandbox setup、MCP materialization、plugin
loading、secret brokerage、network policy、file diff、queued worker 这些
云端 runner 概念。

## SDK 现状核对

最初仓库没有接入 Claude Agent SDK、OpenAI Agents SDK 或 Codex SDK，依赖里主要
还是 `@mariozechner/pi-ai` / `@mariozechner/pi-agent-core`。当前
`packages/cloud-agent-runtime` 已经新增 Claude adapter 和最小 Codex adapter；
它们仍应被视为 runtime adapter slice，而不是替代 durable control plane。

官方文档核对后的判断：

- Claude Agent SDK 确实支持 built-in file/code tools、hooks、subagents、
  MCP、permissions、sessions、skills、plugins。它也明确给了多租户隔离
  相关配置：显式 `cwd`、`settingSources: []`、每租户
  `CLAUDE_CONFIG_DIR`、`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`。
- Codex 可以通过 `@openai/codex-sdk` 程序化控制，也可以作为 MCP server
  暴露 `codex()` / `codex-reply()` 给 Agents SDK 调用。
- OpenAI Agents SDK 有 SandboxAgent、manifest、sandbox client、local /
  Docker provider、snapshot、hosted shell container、mounted files、
  network policy、skills 等概念。

结论：Claude 和 Codex 都能接，但 SDK 不会替我们解决 durable workspace、
多租户权限、对象存储、审计、secret、沙箱生命周期这些平台问题。

## Thread、Session、Workspace 的关系

建议统一用这些词：

- `Workspace`：用户拥有的 durable project space。它包含文件树 metadata、
  object storage keys、安装的插件、启用的 MCP、prompt profile、
  secret refs、默认 agent profile。
- `Thread`：workspace 内的 durable conversation timeline。它复用并扩展
  当前 `Thread` 概念。
- `Run`：一次执行尝试。一次 run 可以创建或 attach 一个 sandbox session，
  也可以绑定一个 provider-specific session/thread id。
- `Provider session`：Claude session id、Codex SDK thread id、Codex MCP
  conversation id、Agents SDK run state。这是 adapter-owned state。
- `Sandbox session`：执行环境状态或快照。它可以 per-run ephemeral，也可以
  短期 resumable，或者从对象存储 snapshot 重新 materialize。

当前第一版收敛为：每个用户先只有一个默认 workspace，`workspaceId =
"default"`。多个 thread 默认共享这个 workspace；thread 不再拥有自己的
文件根目录。这样 user 级 skills、MCP、secret refs、provider config 可以有
稳定归属，也更贴近网页版 agent workspace 的使用习惯。

这个决定不排斥未来的更细隔离。需要为某个 run、某个高风险 MCP、某个临时
工具链创建秘密空间时，不新增 thread 级 workspace，而是在 workspace 下创建
短期 `private workspace / overlay / scratch`，由 sandbox provider 挂载进去，
run 结束后决定丢弃、合并或生成 artifact。也就是说，产品层的 durable
workspace 是用户级；执行层可以按 run 创建更小的临时隔离空间。

Claude 的 session resume 和 Codex SDK 的 thread resume 很有用，但只能作为
辅助恢复手段。产品层必须能在这些状态丢失时靠自己的 durable state 恢复：

- provider session 丢失：用 durable messages、workspace snapshot、run
  artifacts 重建上下文
- sandbox 丢失：从 object storage materialize 新 working copy
- web route / worker 重启：从 DB 的 run status 和 run events 恢复

## 目标架构

建议把 control plane 和 execution plane 明确分开：

```text
Browser / management UI
  -> Next or Fastify API / BFF
     -> packages/app use cases
     -> packages/core contracts and repo interfaces
     -> packages/db repositories
     -> queue
        -> Agent Runner worker
           -> Workspace materializer
           -> Sandbox manager
           -> Provider adapter: Claude / Codex / existing Pi
           -> MCP gateway / tool proxy
           -> Secret broker
           -> Object storage sync
           -> Audit/run events
```

Next app 可以继续作为第一验证面，但长期 runtime 概念应该进入 packages。
Web route 应该负责创建任务、鉴权、stream/attach，不应该直接承担 sandbox
执行、secret 注入、插件权限策略。

## 数据和接口基线

这一节是早期“先定概念再写实现”的基线清单。现在已经进入实现阶段，所以它不再
表示需要停下来重新设计；后续只在真实 sandbox、worker、permission、secret、MCP
或第二 SDK 接入暴露出表达不足时，才回到这些类型/接口做有根据的演进。

需要长期保持清晰的概念包括：

- Workspace：`tenantId`、`ownerUserId`、title/status、metadata、storage root
- File tree：path、type、object key、content hash、size、version、timestamps
- Agent profile：provider adapter、model、prompt layers、enabled tools、
  approval policy、filesystem policy、network policy
- Plugin catalog / installation：package object key、version、signature、
  risk level、review status、per-workspace config
- MCP config：approved server definition、transport、tool allowlist、
  secret requirements、network requirements
- Secret refs：只存引用，不把 raw secret 放进 run config 或 sandbox env
- Sandbox run request：workspace snapshot、plugin materialization plan、
  provider adapter config、resource limits、network policy
- Provider session binding：run/thread/workspace 到 provider session/thread id
  与 resume metadata 的绑定
- File change result：created/modified/deleted files、hashes、artifact object
  keys、conflict handling、commit/snapshot policy
- Audit log：actor、workspace、run、tool call、network request、approval、
  secret-ref usage、file sync outcome

## 沙箱方向

你说 Docker 可能偏重，这个担心是合理的。但我们现在选择先做
`DockerSandboxProvider`，原因不是 Docker 最终最优，而是它最容易让我们
把 execution plane 的关键边界真实跑起来：进程隔离、文件挂载、资源限制、
环境注入、网络策略、stdout/stderr、artifact 收集和销毁流程。

建议分阶段：

1. 本地 POC / 内部 MVP：`DockerSandboxProvider`。一个 run 一个受控容器，
   不共享 home，不共享 `.claude` / `.codex`，不放 raw secret，workspace
   通过只属于当前用户/工作区的目录或 volume 挂载。
2. 更安全的自托管多租户：Docker + gVisor、read-only root、非 root 用户、
   resource limit、无直接网络、所有 egress 走 proxy/tool gateway。
3. 公共用户或不可信代码：Firecracker microVM、独立 VM，或 E2B/Daytona/
   Modal 这类 managed sandbox provider。
4. 企业级隔离：tenant-dedicated worker pool、node pool、bucket、KMS key、
   stricter audit/egress。

核心问题不是“Docker 要不要用”，而是“第一阶段是否允许不可信代码/MCP/
包安装”。只要允许，强 filesystem/process/network/secret 边界就是产品核心。

`pwd` 暴露也属于这条边界：如果 Claude/Codex SDK 或工具命令直接在 Next
route 的宿主机进程里运行，`cwd` 只能是宿主机真实路径，模型调用 `pwd` 会看见
类似 `.cloud-agent-data/workspaces/...` 的 host path。这不能作为多租户隔离
方案。真正的用户视角应该由 sandbox 的 mount namespace 提供：宿主机目录
bind mount 到容器内固定路径，例如 `/workspace`，容器 `--workdir /workspace`。
这样工具执行 `pwd` 返回的是 `/workspace`，而不是宿主机绝对路径。长期方案里，
agent SDK process 和 stdio MCP/tool command 都应该在 sandbox/worker 执行面内
启动，而不是由 Next route 直接在宿主机启动。

当前验证实现已经新增 `DockerClaudeAgentAdapter`：Next route 仍是控制面，
负责鉴权、thread、workspace path 和 provider config；Claude SDK 由 Docker
容器内的 runner 启动，容器把用户 workspace 挂载到 `/workspace`，把 provider
config 挂载到 `/agent-home`。这不是最终 worker pool，但它已经把 `pwd` 和
Bash 工具执行位置从宿主机推进到容器内。

### 默认安全姿态

第一版明确是“可信内部 MVP”，不是面向公共不可信用户的 SaaS 隔离承诺。但即便在
这个信任等级下，默认姿态也要按后续可升级的强边界设计：

- 控制面和执行面分离：Next/Fastify route 只负责鉴权、run 创建、持久化、
  replay/follow；agent SDK process、stdio MCP 和工具命令应进入 sandbox/worker。
- workspace 默认 user 级长期存在，容器内固定挂载为 `/workspace`；模型和工具
  看到的 cwd 只能是 `/workspace` 或其子路径，不暴露宿主机绝对路径。
- provider home/config dir 不共享：Claude、Codex 等 provider 的 home/config
  必须按 user/workspace/provider 隔离，不能复用服务进程的 `.claude`、`.codex`
  或宿主全局配置。
- 长期 secret 不写入 workspace、不写入 provider home、不进入 product message。
  `WorkspaceSecretRef` 只保存引用；`SecretBroker` 只发放 scoped、短期、allowlisted
  credential，并记录不含 raw value 的 audit event。
- 本地 POC 可以临时放宽网络，但接口和 policy 按 default-deny/allowlist 设计；
  未来企业部署应通过 egress proxy/MCP gateway 做域名、工具和 secret usage 审计。
- Docker-first 只用于学习和内部 MVP。需要公共不可信 workload 时，必须升级到
  gVisor/microVM/tenant-dedicated worker pool 或 managed sandbox provider。
- 验收时至少证明：容器内 `pwd=/workspace`，不能读取其他用户 workspace，
  不能读取宿主敏感目录，不能看到其他用户 provider home，secret 发放有 allowlist
  和 audit，run 完成后临时层可以销毁或转为受控 snapshot。

`DockerSandboxProvider` 的第一版最小能力应该包括：

- `create`：根据 workspace snapshot / local workspace path 创建 run 容器
- `exec`：在容器内执行 agent command 或 tool command，并捕获事件
- `readFile` / `writeFile` / `listFiles`：通过 provider API 访问 workspace
- `collectChanges`：计算 run 后文件 diff / artifact
- `destroy`：销毁容器和临时层
- `limits`：CPU、memory、timeout、max output、max file size
- `policy`：filesystem mount、env allowlist、network mode、secret refs、
  MCP allowlist

## 多租户边界

多租户要分层做：

- 应用鉴权：每个 API 请求先解析 actor、tenant、workspace、role
- 数据库 scope：成为 shared product facts 的表应该带 `tenant_id` 和/或
  `workspace_id`，不能只靠 `user_id`
- 对象存储隔离：object key 基于 durable ID 生成，不用用户路径做安全边界；
  上传下载走 signed URL 或后端代理
- 沙箱隔离：不共享 workspace directory、provider config home、MCP config、
  host secrets
- 网络隔离：default deny，外部访问走 gateway/proxy policy
- secret 隔离：sandbox 拿 secret ref 或 proxy access，不拿长期 raw token
- 审计：每个 tool call、approval、file write、network request、secret-ref
  usage 都绑定 `tenantId`、`workspaceId`、`threadId`、`runId`

当前 playground auth 可以作为 prototype host model，但它还不是 tenant model。
现有 source-of-truth 明确把 auth 留在 host 层，不让 shared packages 拥有
通用 User 模型。要做 cloud runtime，需要单独决定 tenant/workspace 是否进入
package-level durable model。

## Plugin、MCP、Skill、Prompt

`repomix-output/1.md` 中把 prompt、skill、MCP、tool、permission manifest
统一成插件 bundle 的方向是对的，但本仓库不应该一开始做完整 marketplace。

第一阶段只建议做内部 plugin model：

- prompt fragments
- skills as files/bundles
- approved remote MCP servers
- approved stdio MCP servers，但只能在 sandbox 内跑
- explicit permissions manifest
- per-workspace enable/disable
- version pinning

第一阶段不要开放：

- 任意 `npx` MCP
- 任意用户发布插件
- 任意 package install
- 用户上传可执行 tool code

Prompt 建议分层：

```text
Platform policy
Org policy
Agent profile prompt
Workspace instructions
User preference addendum
Plugin prompt fragments
Task prompt
```

安全规则不能只靠 prompt。filesystem、tool、network、secret policy 必须在
模型外强制执行。

## 推荐实施切片

这部分是早期实施切片草案；当前执行优先级以上面的“分阶段 TODO”和“推荐近期
顺序”为准。保留在这里作为背景，但 Artifact 已降级为后续增强。

1. 概念模型文档：Workspace、AgentProfile、PluginInstall、McpConfig、
   SecretRef、SandboxRun、ProviderSessionBinding
2. 持久化骨架：先加 package-level schema/repo contracts，不接真实 SDK
3. Worker seam：把 runtime execution 移到可队列化 runner 边界，同时保持当前
   text-turn 行为
4. Workspace materialization：对象存储抽象 + 本地 filesystem materializer
5. Sandbox prototype：先实现 `DockerSandboxProvider`，再评估 gVisor /
   managed provider 路线
6. Claude adapter spike：一个 workspace、一个 thread、一个 run，显式 `cwd`，
   隔离 config dir，只接一个 approved skill/MCP fixture
7. Codex adapter spike：在 `@openai/codex-sdk`、Codex MCP server、
   `codex exec`、OpenAI SandboxAgent 中选第一条路线
8. Policy gateway：tool allow/deny/approval、MCP allowlist、secret refs、
   egress proxy
9. File change tracking：先捕获 created/modified/deleted 和写入路径；artifact
   preview/download/snapshot 后续再增强
10. Observability integration：SDK events、tool calls、file changes、sandbox
    lifecycle 映射进 run events/timeline/usage

## Next.js 验证面

`apps/cloud-agent-next-web` 已经作为第一版验证面落地。它的定位不是产品边界，
而是用真实浏览器/route 验证 package API：

- App Router route/page 保持很薄。
- `lib/*services.ts` 只负责 auth、thread store、workspace/config dir 和
  runtime package 组装。
- Claude SDK 细节必须留在 `packages/cloud-agent-runtime`。
- 当前 workspace 路径已经通过 `resolveWorkspaceRuntimePaths()` 统一生成。
  默认是 user 级 workspace，thread 只保存 `workspaceId` 引用。这个 resolver
  同时预留 provider config、credentials、run artifacts 和 per-run private
  workspace 路径，避免以后把路径规则散落在 route handler 里。
- 当前 thread/message/run 主路径已经切到 SQLite repository；app-local JSON store
  只应被视为历史 spike 产物，不再作为长期主线。

接下来仍应补齐 storage -> sandbox -> runner -> transcript store -> changes
闭环。Next app 可以继续作为验证面，但不能把 durable runtime 模型沉淀在页面或
route 本地。

## 早期确认项

这些问题是早期进入实现前的确认项。多数已经在当前 TODO 中收敛为默认选择；
保留它们是为了提醒后续实现不要误把本地 MVP 假设当成最终生产边界。

1. 第一版信任等级：只面向本机学习/可信内部用户，还是要从第一天就按
   半不可信用户设计？建议先声明为“可信内部 MVP”，但接口保留升级空间。
2. 容器生命周期：先做 per-run ephemeral container，还是 per-workspace
   warm container？建议先 per-run，后续再做 warm pool / resume。
3. workspace 持久化：第一版用 local filesystem storage 还是一开始接
   S3/R2/MinIO？建议先做 `StorageProvider` 接口 + local 实现。
4. 网络策略：第一版完全断网、允许全网，还是 allowlist proxy？建议接口上
   按 default-deny 设计，本地 POC 可以临时放宽。
5. secret 策略：第一版是否允许把短期 secret 注入容器 env？建议不注入长期
   raw secret；只允许 scoped、短期、按 run 生成的 env 或文件，并全部审计。
6. MCP 策略：第一版只支持 remote HTTP/SSE MCP，还是允许 stdio MCP？
   建议 remote MCP 先走 gateway；stdio MCP 只能在 Docker sandbox 内跑。
7. 第一条 agent adapter：先 Claude Agent SDK，还是先 Codex？
   当前倾向 Claude first，因为它的 MCP、skills、permissions、sessions
   组合更贴近第一版 cloud runtime 验证；Codex 作为第二 adapter。
8. 新项目技术栈：继续 TypeScript/pnpm/Drizzle/Fastify 或 Next route，
   还是换 Rust/Go worker？建议控制面先 TypeScript，runner 可以后续拆。
9. 队列和 worker：第一版是否必须引入 Redis/BullMQ/Temporal？建议先用
   简单 DB-backed queue 或内存 worker seam，别让队列系统盖过 runtime 设计。
10. 安全验收标准：第一版至少要验证容器不能读宿主敏感目录、不能越过
    workspace、不能拿到其他用户 secret、资源限制生效、run 后能完整清理。

## 主要风险

- 把 SDK session 当成产品事实源。它们只是 resume hints。
- 把 sandbox execution 放进 Next route handler。长任务需要 worker、queue、
  cancellation、retry、attach-stream。
- 让 playground auth 无意识进入 shared package facts，而没有明确 tenant /
  workspace 模型。
- 过早允许任意 MCP command。stdio MCP 本质是本地代码执行。
- 多租户共享 provider home directory。
- 把 raw secret 放进 sandbox env。
- 用 prompt 代替安全策略。
- workspace、sandbox、policy、artifact sync 还没真实前，先过度建设插件市场 UI。

## Analysis Brief

> 这是早期分析摘要。当前已经进入实现阶段，执行优先级以上面的
> “分阶段 TODO”和“推荐近期顺序”为准。

### Goal

定义一套适配本仓库的 cloud multi-tenant agent runtime 架构，后续能让 Claude
和 Codex 在隔离 workspace 中运行。

### Product Boundary

中心是 platform/runtime infrastructure。playground app 可以验证流程，但 durable
行为应该进入 packages。

### Scope

本轮范围是架构对齐、source-of-truth 候选概念、SDK 适配判断、沙箱策略、
多租户模型、阶段性实施顺序。

### Non-goals

不做 marketplace UI；不开放任意用户工具执行；不假设 Docker 单独足以承载公共
不可信 workloads。早期的“不写实现代码”只适用于当时的架构对齐阶段，现在已经不再
适用。

### Source-of-Truth Impact

现在先不创建新的 source-of-truth。等本稿对齐后，可能需要拆出 workspace
model、cloud runner model、sandbox/security model、plugin/MCP permission model。

### Data / Type / Interface First

先定 Workspace、AgentProfile、PluginInstall、McpServerConfig、SecretRef、
SandboxRun、ProviderSessionBinding、ProviderTranscript、WorkspaceFileChange、
AuditEvent、RuntimeAdapter，再接 SDK。Artifact 先保留为可选增强，不作为第一批
阻塞模型。

### Layer Impact

预计影响 `core`、`contracts`、`db`、`app`、新的或扩展的 runtime package、
`durable-chat-server`、Next/Fastify route adapters、observability UI。当前
`runtime-pi` 应继续作为 adapter，不应该吞掉整个 cloud runner 模型。

### Risks / Ambiguities

第一阶段沙箱等级已经收敛为 `DockerSandboxProvider`。剩余风险是 Docker
MVP 被误解成公共不可信 workload 的最终隔离方案，以及混淆 host auth、
product tenancy、SDK sessions、workspace state。

### Need Subagent?

这份对齐稿暂时不需要。进入实现前，值得让一个高强度独立 review 专门看
sandbox/tenancy 模型。

### Test Strategy

先写 package tests 覆盖持久化和策略不变量：workspace ownership、
run-to-workspace binding、plugin/MCP allowlist、secret-ref handling、
file versioning、provider-session binding。runtime adapter 先用 fake SDK
client 测，再做真实 Claude/Codex smoke。

### Alignment Questions

1. 第一阶段信任等级是否明确写成“可信内部 MVP，非公共不可信 SaaS”？
2. 容器生命周期是否先定为 per-run ephemeral？
3. 第一个可跑 milestone 是否先用 local filesystem storage 实现
   `StorageProvider`？
4. 网络策略第一版是本地放宽但接口按 default-deny，还是从一开始强制 deny？
5. 第一条真实 agent adapter 是否确认 Claude Agent SDK first？
6. 新项目第一版是否沿用 TypeScript/pnpm/Drizzle/Fastify 的主栈？

### Ready for Todo?

已经可以进入基础设施切片实现。优先级不再是继续讨论 UI，而是把
SDK-neutral event/store、sandbox/worker 执行面、session resume、SecretBroker、
permission bridge、workspace diff 和后端 observability 做成稳定边界。信任等级、
网络策略、容器生命周期仍会影响安全验收，但不阻塞第一版本地/内部 MVP 继续推进。

## 2026-06-25 Cleanup 进度与 recovery 缺口

当前 cleanup 已经把几个容易失控的 app-local 文件拆开：`agent-runtime.ts` 只保留
turn composition，message route 的 POST orchestration 移到
`thread-message-route-service.ts`，run event replay/live attach 复用
`run-event-follow-stream.ts`，worker 的 job loading、attempt execution、failure
handling、lease/retry、final message assembly 和 provider session recovery 判断也已
拆成独立模块。

provider session recovery 现在的边界是：

- `provider-session-manifest.ts` 保存各 provider 支持/计划中的 recovery action。
- `provider-transcript-replay.ts` 只负责 raw transcript summary 与 replay plan
  构建。
- `provider-session-store.ts` 继续负责 owner 校验、DB transition、lifecycle event
  写入和 DTO/report 拼装。
- `provider-session-recovery.ts` 负责 worker 在 resume 失败时如何选择
  `archive_and_restart` / `compact` / `replay_transcript` 策略。

还没有被真实 run 证明的 recovery 缺口：

1. 同一个产品 thread 的第二条消息是否一定带上 provider-native resume id。
2. dev server 重启后，DB 中的 provider binding 与 provider config home / JSONL /
   Codex sessions 是否能共同恢复同一 provider session。
3. Docker mode 下 config home volume 是否稳定到足以支持 resume，而不是只保存了
   DB binding。
4. resume 失败后的 archive-and-restart fallback 是否只触发一次，且事件序列足够解释
   旧 binding 为什么被归档。
5. replay/compact 目前是 control-plane metadata，不是 provider-native transcript
   injection；在真实 provider-specific replay 实现前，不能把它当完整恢复能力。

## 2026-06-25 Permission / Approval 边界

当前 provider-neutral approval 事实是 `permission_requested` 与
`approval_resolved` 事件，加上 `run_approval_requests` 持久化表。Claude adapter 已经
可以通过 Claude Agent SDK 的 permission callback / Docker runner permission bridge
接入这套 durable approval bridge：provider 发出 permission request，app 写入 pending
approval，UI/API 决策后 broker 返回 allow/deny，adapter 再继续或失败。

Codex 的边界不能简单照搬 Claude 的 `canUseTool` 形态。官方 Codex 文档把 sandbox 和
approval 分成两层：sandbox/permission profile 定义技术边界，approval policy 定义何时
越界需要请求审批。Codex 的常规控制面应先通过 `CODEX_SANDBOX_MODE`、
`CODEX_APPROVAL_POLICY`、未来 permission profile / config materialization 表达。对
Codex 来说，第一版 provider-neutral 事件可以继续记录 approval outcome，但不应该假设
Codex SDK 会像 Claude 一样给我们每个工具调用一个自定义 `canUseTool` callback。

因此当前策略是：

- Claude 继续作为 durable permission bridge 的参考实现。
- Codex 第一版以 provider config 的 sandbox/approval policy 约束执行边界。
- 如果 Codex 后续 SDK/CLI 暴露结构化 approval request，再映射到同一套
  `permission_requested` / `approval_resolved` 事件。
- dev allow / non-interactive mode 必须通过 env/config 显式开启，并且在 run event 或
  provider diagnostics 中可追踪；不能用隐藏默认值绕过审计。
- approval-required mode 只有在 UI/API 能 resolve pending request 时才能作为默认模式。

已核对的 Codex 官方资料包括：

- https://developers.openai.com/codex/permissions
- https://developers.openai.com/codex/agent-approvals-security
- https://developers.openai.com/codex/concepts/sandboxing
- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/config-reference

## 2026-06-25 Runtime event contract

provider adapter 输出两层事实：raw provider transcript 与 normalized runtime events。raw
transcript 用于 provider-native debug/resume；normalized runtime events 用于 app
持久化、stream、tool trace、approval、workspace diff 和 observability。

provider adapter 的 required events：

- `agent_start`：每个 run 至少一次，记录 provider、cwd/thread/run 范围。
- `agent_message_delta` 或 `agent_completed`：成功 run 必须能还原最终 assistant
  content；如果 provider 只给最终消息，可以只发 `agent_completed`。
- `agent_completed` / `agent_failed`：每条 adapter execution 必须以成功或失败事件收尾。
- `tool_call_started` / `tool_call_completed` / `tool_call_failed`：provider 暴露工具事实时
  必须映射，不能只塞进 raw transcript。
- `provider_session_bound`：provider 产生可 resume session/thread id 时必须发出。
- `permission_requested` / `approval_resolved`：provider 进入 durable approval bridge
  时必须发出。

best-effort events：

- `usage_updated`：provider 暴露 token/usage 时发出；没有 usage 时不阻塞 run。
- `file_change_detected`：工具事件能直接识别文件路径时发出；否则由 workspace diff
  fallback 兜底。
- `provider_transcript_mirrored`：用于标记 raw transcript mirror 状态，不是 UI 主线。
- `provider_session_recovery`：resume/replay/compact/fallback 发生时发出。

provider-specific extension 的规则：

- extension payload 可以保留在 normalized event 的 `payload` 中，但必须仍满足事件的
  required keys。
- app route 不应该读取 Claude/Codex raw SDK 字段；需要展示或审计时先进入
  `RunEvent` / `ToolInvocation` / `ProviderTranscript`。
- 对无法跨 provider 对齐的原始字段，优先保存到 `ProviderTranscriptStore`，而不是扩成
  产品消息字段。

失败路径 expectations：

- 认证失败：`agent_failed` -> `run_failed`，error 中保留 provider 返回的可读原因，
  但不包含 secret。
- timeout：`agent_failed` -> `run_failed`，error 明确 timeout ms。
- tool failed：尽量发 `tool_call_failed`，run 是否失败由 provider terminal event 决定。
- permission denied/expired/cancelled：先发 `approval_resolved`，再由 provider/worker
  映射成 `tool_call_failed` 或 `agent_failed`。
- resume failed：发 `provider_session_recovery`，按 documented policy archive/fallback。
- Docker exit 非 0：发 `agent_failed`，stderr 可摘要化进入 error；host path 不能泄漏到
  model-visible output。

## 2026-06-25 Smoke 结果

本轮 cleanup 后已跑过的验收：

- `pnpm --filter @agent-infra/cloud-agent-runtime test`：21 个 test file / 85 个 tests 通过。
- `pnpm --filter @agent-infra/cloud-agent-runtime typecheck`：通过。
- `pnpm --filter cloud-agent-next-web typecheck`：通过。
- `pnpm --filter @agent-infra/cloud-agent-runtime smoke:claude`：通过，DeepSeek
  Anthropic-compatible endpoint，`deepseek-v4-flash`，5s timeout。
- `pnpm --filter @agent-infra/cloud-agent-runtime smoke:claude:docker`：通过，容器内
  cwd 是 `/workspace`，Bash/Read/Edit/Write 均完成，provider session JSONL 写入
  provider config dir，raw transcript 有 643 条。
- `pnpm --filter cloud-agent-next-web smoke:approval`：通过，approved 和 denied 两条
  durable approval 路径都落入 `run_approval_requests` 和
  `permission_requested` / `approval_resolved` events。
- `pnpm --filter cloud-agent-next-web smoke:resume`：通过，Docker Claude 同一 thread
  第二次 run 复用同一个 provider session id，两个 run 都有 transcript，第二次 run
  有 Bash invocation，workspace file index 包含 `resume-proof.txt` 和 `resume-pwd.txt`。
- `pnpm --filter cloud-agent-next-web smoke:resume:fallback`：通过，注入无效 Claude
  provider session 后，旧 binding 被归档，新 provider session 重新绑定，并持久化
  `provider_session_recovery` event。这个 smoke 同时暴露并修复了 Docker container
  lifecycle 问题：同一 run 内发生合法重试时，container name 不能只由 run id 决定；
  当前 Docker provider 使用 run id 前缀加 per-invocation nonce，避免 fallback 重试撞名。
- Web/API streamed Claude message：通过，`POST /api/threads/new/messages` 返回
  `user_message`、`assistant_delta` 和 `completed`，assistant 内容为
  `web-stream-smoke-ok`。
- Web/API file-writing message：通过，stream 返回 `tool_call`、`file_change` 和
  `completed`，文件写到 admin 默认 workspace 的 `web-smoke/file.txt`，内容为
  `web-file-smoke-ok`。
- Run event replay API：通过，`GET /api/runs/:runId/events` 能回放 completed run 的
  `run_started`、`provider_session_bound`、tool events、`file_change_detected`、
  message deltas 和 `run_completed`。
- Web/API streamed Codex message：通过，dev server 当前环境能返回
  `codex-error-smoke` 并绑定 Codex provider session。

当前没有通过但已解释的 smoke：

- `pnpm --filter @agent-infra/cloud-agent-runtime smoke:codex` 和
  `smoke:codex:docker` 在当前 shell env 下走 DeepSeek fallback，失败于
  `wss://api.deepseek.com/responses` 404。DeepSeek 当前 OpenAI-compatible API 是
  Chat Completions，而 Codex SDK 请求 Responses protocol；这需要 Responses-compatible
  endpoint/gateway 或显式 Codex/OpenAI auth。Docker Codex preflight 已证明容器 cwd 是
  `/workspace`。
- in-app browser automation 连接到的 browser 对象处于 closed state，本轮没有完成真实
  浏览器点击/刷新验证；已用 API stream + replay 验证对应后端行为。

## 已核对资料

- 当前方案：`repomix-output/1.md`
- 本地 Ripple 仓库：
  `/Users/david/Documents/github/ripple/AGENTS.md`
  `/Users/david/Documents/github/ripple/README.md`
  `/Users/david/Documents/github/ripple/crates/ripple-server/src/sessions.rs`
  `/Users/david/Documents/github/ripple/crates/ripple-server/src/sandbox.rs`
  `/Users/david/Documents/github/ripple/crates/ripple-server/src/jobs.rs`
  `/Users/david/Documents/github/ripple/crates/ripple-server/src/api/runs.rs`
  `/Users/david/Documents/github/ripple/crates/ripple-server/src/codex/app_server.rs`
  `/Users/david/Documents/github/ripple/crates/ripple-server/src/codex/events.rs`
  `/Users/david/Documents/github/ripple/crates/ripple-server/src/codex/permissions.rs`
  `/Users/david/Documents/github/ripple/crates/ripple-server/src/workspace.rs`
  `/Users/david/Documents/github/ripple/app/src/hooks/useChatRun.ts`
  `/Users/david/Documents/github/ripple/app/src/lib/api.ts`
- 仓库边界：`roadmap.md`
- 架构说明：`docs/architecture.md`
- Host auth source-of-truth：
  `docs/source-of-truth/playground-host-auth-model.md`
- Claude Agent SDK overview：
  https://code.claude.com/docs/en/agent-sdk/overview
- Claude Agent SDK hosting / multi-tenant isolation：
  https://code.claude.com/docs/en/agent-sdk/hosting
- Claude Agent SDK secure deployment：
  https://code.claude.com/docs/en/agent-sdk/secure-deployment
- Claude skills / plugins / MCP / sessions / permissions：
  https://code.claude.com/docs/en/agent-sdk/skills
  https://code.claude.com/docs/en/agent-sdk/plugins
  https://code.claude.com/docs/en/agent-sdk/mcp
  https://code.claude.com/docs/en/agent-sdk/sessions
  https://code.claude.com/docs/en/agent-sdk/permissions
- Claude Agent SDK TypeScript reference：
  https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-typescript
- Claude Code CLI reference：
  https://docs.anthropic.com/en/docs/claude-code/cli-reference
- Open WebUI Claude Code Pipe：
  https://github.com/tfriedel/openwebui-claude-code
- Claude Code WebUI：
  https://github.com/sugyan/claude-code-webui
- Claude Code Viewer：
  https://github.com/d-kimuson/claude-code-viewer
- Claude Code Web UI article：
  https://dev.to/lennardv2/claude-code-web-ui-19m5
- Streaming deployment notes：
  https://github.com/baryhuang/claude-code-by-agents/blob/main/STREAMING_DEPLOYMENT.md
- Codex SDK：
  https://developers.openai.com/codex/sdk
- Codex with Agents SDK / MCP server：
  https://developers.openai.com/codex/guides/agents-sdk
- Codex sandboxing / non-interactive mode：
  https://developers.openai.com/codex/concepts/sandboxing
  https://developers.openai.com/codex/noninteractive
- OpenAI Agents SDK sandbox agents / shell tools：
  https://developers.openai.com/api/docs/guides/agents/sandboxes
  https://developers.openai.com/api/docs/guides/tools-shell
