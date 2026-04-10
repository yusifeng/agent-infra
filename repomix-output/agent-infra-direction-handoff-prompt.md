你拿到的是 **repomix 打包代码 + 描述材料**，不是可执行仓库。
请先做静态分析，不要假设你能运行任何本地命令。
（项目中使用到的pi-mono github地址为： https://github.com/badlogic/pi-mono）
## Inputs
- 代码包：`repomix-agent-infra-direction-full.txt`
- 文件清单：`repomix-agent-infra-direction-files.md`
- 说明：路径统一使用仓库相对路径（repo-relative）

## 背景
这个仓库当前的目标，不是做一个聊天产品，也不是做一个像 `pi-web-ui` 那样的大而全出口。

当前更明确的方向是：
- `agent-infra` = durable execution backend for agent runtimes
- `packages/core` 定义 durable truth 和 repository contracts
- `packages/db` 实现 persistence
- `packages/runtime-pi` 负责把 `pi-agent-core` / `pi-ai` 的运行过程落成 `run / message / message_part / tool_invocation / run_events`
- `packages/contracts` 刚刚被引入，用来定义 browser/API 消费的 DTO contract
- `apps/playground-web` 不被视为产品，而被视为 **第一消费者**，用于通过真实使用来反向定义 `agent-infra` 应该暴露的接口

当前 `/runtime-pi` 路径已经可以：
- 使用真实 `@agent-infra/db + @agent-infra/runtime-pi`
- 左侧 thread，右侧聊天
- 选择 DeepSeek 模型
- 持久化 thread / run / message / tool invocation / run events

但是目前仓库还缺少一个更高层的、正式的“如何使用这套 agent-infra”的入口。  
例如，Next route 里还在直接编排 repository 和 runtime，而不是调用一层稳定的 application/use-case API。

## 你要回答的核心问题
请基于这些材料，回答：

**`agent-infra` 接下来最应该具体做什么？大方向应该是什么？**

同时重点分析下面这个设计目标：

**这套系统应该做到：**
1. 简单场景下非常容易使用
2. 需要自定义逻辑时，不会因为包装太死而很难扩展
3. 不会逐渐滑向一个像 `pi-web-ui` 那样的大杂烩出口

## Hard Constraints
1. 不要建议运行任何命令（包括测试、构建、lint）。
2. 不要依赖仓库外文件。
3. 不要把它往“完整聊天产品”方向推进。
4. 不要泛泛而谈“分层”“解耦”，必须结合当前代码结构给出判断。
5. 不要只给抽象建议，必须给出下一阶段具体推进顺序。

## 重点希望你分析的点
请务必覆盖这些问题：

1. `agent-infra` 的下一阶段主线，最合理应该是什么？
   - 是继续补 runtime adapter？
   - 是补 application/use-case layer？
   - 是先强化 contracts？
   - 是先强化 observability / timeline / replay？

2. `playground-web` 作为第一消费者，最佳实践下应该如何使用 `agent-infra`？
   - 它应该直接碰 repo 和 runtime 吗？
   - 还是应该只调用更高层的 use-case / service API？

3. “简单易用，但不封死自定义逻辑”的最佳接口形态是什么？
   - 请给出你建议的 package boundary
   - 请给出 public API 的建议形态
   - 请给出 simple path 和 advanced path 各是什么

4. `contracts` 的边界是否合理？
   - 它应该只放 DTO 吗？
   - 是否还应该放 request/response input contracts？
   - 是否要避免放 domain rule？

5. 下一阶段最值得做的 3 到 5 个 PR 是什么？
   - 请按顺序给
   - 每个 PR 说明目标、涉及包、为什么先做它

6. 哪些方向现在不该做？
   - 例如哪些东西会把仓库重新带回“大杂烩出口”

## Required Output
请按下面结构输出：

1. **Direction Summary**
   - 用 3 到 6 条，明确说出这个仓库下一阶段的大方向

2. **Architecture Judgment**
   - 评价当前 `core / db / runtime-pi / contracts / playground-web` 这套分层
   - 指出哪里已经对，哪里还没闭合

3. **Recommended Interface Shape**
   - 给出你建议的 package boundaries
   - 给出“简单使用路径”和“高级自定义路径”
   - 最好给出简短伪代码示意

4. **Recommended Next PRs**
   - 给出 3 到 5 个按顺序排列的 PR / phase
   - 每个都要包含：目的、主要改动点、为什么它排在这里

5. **What Not To Do**
   - 列出应该避免的方向

6. **Acceptance Criteria**
   - 用可观察、可验证的语言说明：做到什么程度，说明方向是对的

## 我特别关心的判断
如果你认为下一步最该新增一个 `@agent-infra/app` / `@agent-infra/use-cases` 之类的包，请明确说：
- 为什么它现在比继续改 UI 更重要
- 它和 `core` / `contracts` / `runtime-pi` 的边界应该怎么切

如果你认为不是这条路，也请给出你更好的替代方案和理由。
