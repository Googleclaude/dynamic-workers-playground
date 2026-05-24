# Security Policy

## Reporting a Vulnerability

This is a demo / playground project, not production software. If you discover a
vulnerability that materially affects users running this code, open a private
security advisory on the repository or email the maintainer listed in
`package.json`.

Please include:

- A description of the issue and its impact.
- Steps to reproduce (a minimal repo, request, or input).
- Any suggested remediation.

We aim to acknowledge reports within 7 days.

## Scope

In scope:

- Bugs in `src/server.ts`, `src/github.ts`, `src/logging.ts`, and the client
  bundle that affect availability, integrity, or isolation of the host Worker.
- Issues that allow a request to break out of the dynamic Worker sandbox or
  exfiltrate state from the host environment.

Out of scope:

- The fact that the playground executes arbitrary user-supplied JavaScript by
  design. Public deployments should be gated behind Cloudflare Access or
  equivalent — see the note in `README.md`.
- Findings that depend on attacker-controlled deployments (your own
  `wrangler.jsonc`).

## Hardening already in place

- `globalOutbound: null` on dynamic Workers blocks outbound network access from
  user code.
- `/api/run` rejects payloads larger than 2 MiB; `/api/github` rejects payloads
  larger than 16 KiB.
- GitHub imports are capped at 10 directory levels, 200 files, and 5 MiB total.
- GitHub URL segments are validated against `[A-Za-z0-9._-]` and reject `..`
  before being interpolated into the API URL.
