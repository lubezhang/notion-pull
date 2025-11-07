# Repository Guidelines
- 使用中文

## Project Structure & Module Organization
- `src/` holds TypeScript sources: CLI (`src/cli.ts`), orchestrator (`src/index.ts`), configuration (`src/config.ts`), and feature stubs under `src/notion`, `src/markdown`, `src/assets`, `src/output`.
- `docs/` contains design notes and requirements; keep additional specs there.
- Build artifacts compile to `dist/`; it is git-ignored and regenerated via `npm run build`.
- Add new modules under the closest existing domain folder; e.g. Notion pagination helpers live in `src/notion/`.

## Build, Test, and Development Commands
- `npm run dev` — execute the CLI in watch-like mode using `tsx src/cli.ts`.
- `npm run build` — emit transpiled JavaScript and type declarations into `dist/`.
- `npm run lint` — lint all TypeScript files using the ESLint flat config.
- `npm test` — placeholder; replace with the real test runner when implemented.

## Coding Style & Naming Conventions
- Use TypeScript with ECMAScript module syntax; prefer named exports for shared utilities.
- 依赖包管理使用pnpm
- 代码缩进使用4个空格
- 变量名、函数名、文件名采用小驼峰命名法
- 类名采用大驼峰命名法
- 函数和方法需要有完成的注释，包括功能说明、参数说明、返回值说明、异常说明
- 注释采用JSDoc格式

## Testing Guidelines
- Introduce tests under `src/**/__tests__/` or `tests/` once the harness is chosen.
- Match test filenames to targets (e.g., `config.test.ts` for `config.ts`).
- Smoke-test the CLI via `npm run dev -- --dry-run` against mocked pages before merging.

## Commit & Pull Request Guidelines
- Follow concise, imperative commit messages (`feat: add traversal queue`, `fix: guard missing token`).
- Each PR should describe scope, testing evidence (`npm run lint`, `npm run build`), and reference related issues.
- Include before/after notes or demo output when behavior changes the CLI interface or generated files.
