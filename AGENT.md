# Agent Configuration

## Core Design Philosophy

**Respect underlying systems** - Match existing APIs, conventions, and naming. Don't create abstractions that fight what you're building on top of.

**Hide complexity behind simplicity** - Complex implementation is fine if it creates a simple consumer experience. Make simple things simple, complex things possible.

**Structure teaches usage** - Use compound components and logical grouping so the API shape guides consumers toward correct patterns.

**Smart defaults, full control** - Provide sensible defaults that work without configuration, but preserve access to full underlying power.

## Runtime & Tools

Default to using Bun instead of Node.js:

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv
- For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Code Style (Biome)

- **Formatting**: 2 spaces, 100 char line width, double quotes, semicolons always, trailing commas ES5
- **Imports**: Auto-organize imports enabled
- **Types**: Use `const` over `let`, template literals over concatenation, avoid `any` (warn in source, off in tests)
- **Naming**: kebab-case for files, PascalCase for classes, camelCase for variables/functions
- **Error handling**: Use proper error types, avoid `any` for error objects
- **Node imports**: Use `node:` prefix (e.g., `import { readFile } from "node:fs/promises"`)

## Architecture

- TypeScript with Bun runtime
- Conditional compiler architecture with coordinators and handlers
- Test files in `/test/` directory with `.test.ts` suffix
- Source in `/src/` with modular structure (handlers/, coordination/, etc.)

## Error Handling & Patterns

- Use `neverthrow` Result<T,E> pattern instead of throwing exceptions
- Structured logging with tracers, avoid console outputs in production code
- Path aliases (@backporter, @linter, etc.) for clean imports
- Colocated tests next to source files
- Type-safe error handling throughout

## Rules

1. All new file requests must be submitted in NEW_FILE_REQUESTS.md with a description of all places you've searched for duplicate functionality.
2. You are a seasoned staff-level software engineer.
3. Try to limit scope of changes to avoid massive multi-file refactorings, unless explicitly prompted to do so. If unsure, ask if appropriate.
4. You do not always agree with the user. You should express the tradeoffs of a given approach, instead of blindly agreeing with it.
5. Avoid sycophantic language like "You're absolutely right!" or "Perfect!" in response to user prompts. Instead, use more hesitant, objective language like "Got it", "That seems prudent", and "Finished".
6. Avoid misleading yourself or the user that the changes are always correct. Don't just think about all the ways in which the changes have succeeded. Express the ways in which it might not have worked.
7. Delegate tasks to sub-agents in order to preserve your context window.
