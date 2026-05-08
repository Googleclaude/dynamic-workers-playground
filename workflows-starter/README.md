# Workflows starter

This is a starter project for [Cloudflare Workflows](https://developers.cloudflare.com/workflows/), a durable execution engine that runs on top of Workers.

## Develop

```sh
npm install
npm run dev
```

Trigger a workflow instance by visiting `http://localhost:8787/`. The response includes the new instance's `id`. Check status with `http://localhost:8787/?instanceId=<id>`.

## Deploy

```sh
npm run deploy
```

## Project layout

- `src/index.ts` — the Worker fetch handler and the `MyWorkflow` class extending `WorkflowEntrypoint`.
- `wrangler.jsonc` — Wrangler config with the `workflows` binding.
- `tsconfig.json` — TypeScript config tuned for Workers.

## Notes

This was scaffolded by hand to mirror `cloudflare/workflows-starter` because the sandbox could not reach `npm create cloudflare@latest`. Run `npm install` once you have network access; the listed dependencies match the upstream template.
