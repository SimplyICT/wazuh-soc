# Agents

## Memory

This project has a `memory/` folder for reviewed learnings and a `knowledge/` folder for domain knowledge. See `../super-memory/` for cross-project memory and the harness orientation.

## Conventions

### TypeScript
- Prefer type inference over explicit return types unless the return type is a public API contract
- Avoid `as any` — always use real type safety. If you need escape hatches, prefer `as const`, branded types, or `satisfies`
- Prefer `Promise.withResolvers()` over `new Promise((resolve, reject) => ...)` for event-driven completion
- Prefer inline expressions over one-line wrapper functions — extract only when the name creates a durable contract
- When adding packages, use the project's package manager install command, not manual edits
- Run `check`/`format`/`lint` after making changes; if they don't exist, consider adding them

### General
- Keep exported types named and documented at their point of definition rather than using `ReturnType<typeof fn>`
- Ask questions one at a time
- Prefer boring, explicit patterns over unnecessary abstractions
