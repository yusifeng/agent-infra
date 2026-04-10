这个 handoff 使用的代码包是：`repomix-agent-infra-direction-full.txt`

对应的分析 prompt 是：`agent-infra-direction-handoff-prompt.md`

## 打包目的
这不是一个单点 bug 修复包，而是一个“平台方向与接口形态”分析包。

目标是让 WebGPT 在静态阅读上下文的前提下，判断：
- `agent-infra` 的下一阶段主线应该是什么
- `playground-web` 作为第一消费者，应该如何正确使用 `agent-infra`
- 如何做到“简单使用路径很顺手，但高级自定义不会被封死”

## 打包层级
- tier: `full`
- 原因：这次问题跨越了 domain contract、DTO contract、runtime adapter、db persistence、以及 consumer app 的用法，不适合只给局部文件

## 主要包含内容

### Root / Docs
- `README.md`
- `docs/architecture.md`
- `docs/roadmap.md`
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`

### Packages
- `packages/core`
- `packages/contracts`
- `packages/db`
- `packages/runtime-pi`
- `packages/shared`

### Playground Consumer Context
- `apps/playground-web/app/runtime-pi/page.tsx`
- `apps/playground-web/components/runtime-pi-playground-page.tsx`
- `apps/playground-web/lib/runtime-pi-repo.ts`
- `apps/playground-web/lib/runtime-pi-dto.ts`
- `apps/playground-web/app/api/runtime-pi/meta/route.ts`
- `apps/playground-web/app/api/runtime-pi/threads/route.ts`
- `apps/playground-web/app/api/runtime-pi/threads/[threadId]/messages/route.ts`
- `apps/playground-web/app/api/runtime-pi/runs/[threadId]/route.ts`

## 为什么这些文件足够
- `packages/core` 展示 durable truth 与 repository contracts
- `packages/contracts` 展示刚引入的 consumer-facing DTO boundary
- `packages/db` 展示 persistence 实现与 `run_events` 落库方式
- `packages/runtime-pi` 展示 runtime adapter 和实际事件到 durable records 的翻译
- `apps/playground-web/*runtime-pi*` 展示当前第一消费者是如何接这套系统的

## 不在本包内的内容
- 浏览器本地 `pi-narrow` 相关大部分 UI 细节没有作为主分析对象
- 已删除的 `runtime-ai-sdk` 不再纳入上下文

## 阅读建议
如果需要快速聚焦，可优先阅读：
1. `packages/core/src/types.ts`
2. `packages/contracts/src/index.ts`
3. `packages/runtime-pi/src/runtime.ts`
4. `apps/playground-web/app/api/runtime-pi/runs/[threadId]/route.ts`
5. `apps/playground-web/components/runtime-pi-playground-page.tsx`

然后再回到：
- `README.md`
- `docs/architecture.md`
- `docs/roadmap.md`

这些文件用来帮助判断“仓库应该往哪里收口”。
