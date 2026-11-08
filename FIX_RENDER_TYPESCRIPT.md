# Fix Render TypeScript build errors (2026-11-08)

The Render log supplied for commit `060c7185c39aa057215e17d5e16469e5082d1382` reports type errors in `src/app.ts`, `src/mcp/mcp-server.ts`, and `src/tools/graphics/raster.ts`. This patch addresses those exact diagnostics without disabling TypeScript strictness.

## Changes

### `src/app.ts`

- Replaced `trustProxy: 1` with `trustProxy: false`. The current Fastify type definitions no longer accept numeric hop-count trust, and blindly trusting forwarded headers is not a safe workaround. The application does not need forwarded host/protocol data for its current routes.
- Explicitly typed the application as the default `FastifyInstance` so route registration and auth helpers share the same raw-server generic.
- Narrowed the error handler's unknown error value before reading `statusCode` or `message`.

### `src/core/types.ts` and Zod imports

- Switched Zod imports to the explicit `zod/v4` entry point so tool schemas implement the Standard Schema JSON conversion contract expected by MCP SDK v2.
- Updated the test's Zod import to the same v4 entry point.

### `src/mcp/mcp-server.ts`

- Passed the actual Zod v4 validator as `inputSchema` instead of coercing it to `never`.
- Typed the callback's arguments as `unknown`, which is appropriate for the central executor that performs validation itself.
- Added a narrow adapter-boundary cast for Node's `IncomingMessage` typing difference under `exactOptionalPropertyTypes`; the runtime request is still the Fastify raw Node request and the already-parsed body is passed separately.

### `src/tools/graphics/raster.ts`

- Declared circle octants and triangle edges as fixed-length tuples to satisfy `noUncheckedIndexedAccess` without non-null assertions or weakening compiler settings.

### `package.json`

- Removed `@types/jpeg-js`, which is a stub package. `jpeg-js` provides its own type declarations; this removes the warning shown in Render's install log.

## Apply to the GitHub repository

Replace the files above in the repository root project, commit, and push. The existing Render Web Service will deploy the new commit automatically if auto-deploy is enabled. Otherwise use **Manual Deploy → Deploy latest commit**.

```powershell
git add src/app.ts src/core/types.ts src/mcp/mcp-server.ts src/tools/graphics/raster.ts src/tools/search/index.ts src/tools/vietschool/index.ts src/tools/music/index.ts src/tools/graphics/index.ts src/tools/graphics/graph-2d.ts src/tools/graphics/graph-3d.ts src/tools/image/index.ts src/tools/map/index.ts tests/tool-executor.test.ts package.json BUILD_STATUS.md FIX_RENDER_TYPESCRIPT.md
git commit -m "Fix Render TypeScript build errors"
git push origin main
```

Keep the existing build command `yarn install && yarn build` if that is what the Render service currently uses. The TypeScript build is the failing phase shown in the supplied log; package installation itself completed successfully.

## Verification limits

The patch was reviewed against the current MCP SDK v2 registration contract and Fastify's current proxy-trust type contract. This execution environment cannot resolve `registry.npmjs.org` (`EAI_AGAIN`), so dependencies cannot be installed here and a full dependency-backed `yarn build` / `npm run check` cannot be honestly claimed. Run the build on Render after pushing this patch. If a new compiler diagnostic appears, use the new log because fixing these reported errors may reveal later errors that the compiler had not reached before.
