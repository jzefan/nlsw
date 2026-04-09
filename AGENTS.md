## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways,SToP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent strategy

- Use subagents liberally to keep main context window clean
- Offload research,exploration,and parallel analysis to subagents
- For complex problems,throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself:"Would a staff engineer approve this?"
- Run tests, check logs,demonstrate correctness

### 5. Demand Elegance(Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky:"Knowing everything I know now,implement the elegant solution"
- Skip this for simple,obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs,errors,failing tests-then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to tasks/todo.md
6. **Capture Lessons**: Update `tasks/lessons.md ` after corrections

## Core Principles

- **simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs
- **优先使用胶水编程思维**: 复用现成库，不重复造轮子
- **先规划后实现**: 不要一上来就写代码
- **持续自我改进**: 从每次错误中学习，更新规则，降低未来错误率
- **验证为王**: 任何时候都要证明你的改动是正确的，不要假设它们是正确的
- **优雅但实用**: 在追求优雅的同时，确保解决方案是实用的，不要过度设计
- **错误处理**: 始终处理错误，避免静默失败，使用 try-catch 或错误返回
- **日志记录**: 适当记录日志，帮助调试和监控，但避免过度日志
- **安全第一**: 处理用户输入时要小心，避免注入攻击
- **性能意识**: 在编写代码时考虑性能，但不要过早优化
- **代码可读性**: 写清晰、易读的代码，使用有意义的变量和函数名，添加必要的注释
- **测试驱动**: 在可能的情况下编写测试，确保代码的正确性和可维护性
