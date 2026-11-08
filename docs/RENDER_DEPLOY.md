# Render Free deployment

The repository includes a root-level `render.yaml` Blueprint. For the exact GitHub-to-Render flow, see [`../DEPLOY_RENDER.md`](../DEPLOY_RENDER.md). The Blueprint targets the Singapore region for lower network latency to Vietnam.

1. Push the project to a Git repository.
2. In Render select **New → Web Service** and connect the repository.
3. Runtime: Node. Instance: Free.
4. Build command: `npm install --include=dev --no-audit --no-fund && npm run build`.
5. Start command: `npm start`.
6. Health check path: `/health`.
7. Set `DEVICE_API_KEY` using Render's secret/generate-value control. Never commit it.
8. Render normally exposes `RENDER_EXTERNAL_HOSTNAME`, which the server uses to build asset URLs. Set `PUBLIC_BASE_URL=https://YOUR_SERVICE.onrender.com` when using a custom domain or when the platform hostname is not available.
9. Keep optional providers disabled until their keys and terms are verified.
10. Deploy; then check `/health`, `/v1/tools`, and a protected graph request.

## Free-plan behavior

Free web services spin down after 15 minutes without inbound traffic, and a cold start can take about a minute. Local filesystem modifications are lost on restart/spin-down/redeploy. Do not run a self-ping or cron workaround. Assets and caches are in RAM and short-lived by design. This service does not persist chat history, student data, or images. `NODE_OPTIONS=--max-old-space-size=384` caps the V8 heap to leave room for native buffers and runtime overhead.

Current Render documentation: https://render.com/docs/free


For OpenStreetMap standard tiles, set `OSM_CONTACT_EMAIL`, provide visible attribution, and keep snapshots strictly on-demand. Render Free RAM is not a durable seven-day cache, which OSM policy expects when response headers do not specify another cache lifetime. Keep `MAP_ENABLED=false` on Render Free unless you add a compliant durable cache or switch to a tile provider whose terms match this deployment. See https://operations.osmfoundation.org/policies/tiles/. Tile usage policy: https://operations.osmfoundation.org/policies/tiles/
