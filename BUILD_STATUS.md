# Build and verification status

Verification date: 2026-11-08

## Verified in this environment

- Runtime: Node.js 22.16.0, npm 10.9.2.
- `package.json` parses as valid JSON.
- `render.yaml` parses as YAML; Render environment-variable boolean values are quoted strings.
- All 38 TypeScript source and test files pass TypeScript `transpileModule` syntax diagnostics (zero syntax diagnostics).
- Strict TypeScript type-check passed for the dependency-independent modules: core errors, random ID helper, asset store, memory cache, bounded fetch helpers, logger, VietSchool CSV parser, and safe expression parser.
- Standalone runtime checks passed for the CSV parser (comma/semicolon delimiters, decimal comma, quoted multiline cells, malformed quote rejection) and safe math parser (precedence, implicit multiplication, powers, and unsafe expression rejection).
- Independent runtime checks passed for bounded asset storage, RGB565 byte length/endianness, bounded memory cache, and upstream response byte limits in the previous verification pass. AssetStore now also validates dimensions, pixel format, and exact `width * height * 2` byte length before accepting an asset.
- XiaoZhi integration documentation now includes the upstream `data/.mcp_server_settings.json` configuration shape for remote `streamable-http` MCP servers (`url`, `transport`, and Bearer `headers`). The upstream sample currently documents this transport.

## Not verified here

The project dependencies could not be downloaded. `npm view fastify version` and `npm install` fail because this environment cannot resolve `registry.npmjs.org` (`EAI_AGAIN`); offline installation also has no cached dependency packages. Therefore:

- `npm run build` has **not** been run successfully.
- `npm test` has **not** been executed.
- Fastify, MCP SDK, image decoder, and provider integration tests have not run as a full suite.
- The remote connection to a live XiaoZhi backend has not been tested. The exact deployed XiaoZhi tag and its MCP client protocol support must still be checked.

## Run after network access is available

```bash
npm install
npm run check
```

`npm run check` runs the TypeScript build followed by the test suite. The first successful `npm install` will create `package-lock.json`; commit that generated lockfile to make subsequent installs reproducible. Render's build command installs dev dependencies explicitly because TypeScript is a build-time dependency:

```bash
npm install --include=dev --no-audit --no-fund && npm run build
```

Do not enable external providers until their credentials and usage terms have been configured and reviewed. `VIETSCHOOL_ENABLED`, `MUSIC_ENABLED`, `IMAGE_ENABLED`, and `MAP_ENABLED` default to false.

## Render deployment bundle update (2026-11-08)

- Added root-level `DEPLOY_RENDER.md` with GitHub upload, Render Blueprint apply, post-deploy health check, REST smoke request, MCP endpoint and XiaoZhi integration steps.
- Updated `render.yaml` for a Node Web Service on the Free plan in the Singapore region; it builds with dev dependencies, starts via `npm start`, checks `/health`, limits concurrency/assets for the small instance, and generates `DEVICE_API_KEY` with Render's `generateValue` support.
- Updated README deployment instructions and added `.nvmrc` selecting Node 22.
- `render.yaml` was parsed successfully with a YAML parser after the update. This validates YAML syntax, not Render's remote provisioning or an actual deploy.
- A fresh `npm install --include=dev --no-audit --no-fund` attempt timed out in this environment. No `package-lock.json` was generated. Full `npm run build` and integration tests remain unverified; do not treat this package as a successfully deployed service yet.
