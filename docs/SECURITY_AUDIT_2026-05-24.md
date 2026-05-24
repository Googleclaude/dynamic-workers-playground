# Security Audit — 2026-05-24

**Repo:** `googleclaude/dynamic-workers-playground`
**Commit auditado:** `970944e` (main)
**Auditor:** Claude (Opus 4.7) via Claude Code
**Escopo:** segurança técnica do código, headers HTTP, fluxos de I/O, validação de input, scan de histórico git
**Fora de escopo:** infraestrutura Cloudflare (assumida segura pela plataforma), código de terceiros (dependabot trata)

---

## 1. Sumário executivo

O playground tem base sólida de segurança após PRs #14 e #15: compliance scanner ativo bloqueia secrets na entrada e redacta PII em todas as saídas, há pseudonimização HMAC com segredo servidor, headers de segurança aplicados em todas as respostas da API, rate-limit via Durable Object. Histórico do git foi varrido com `git log --all` e está limpo (sem secrets reais). Restam duas vulnerabilidades de confiança alta/média não corrigidas (S-01, S-02 abaixo) e cobertura zero de testes automatizados para as correções recentes — o que cria risco de regressão silenciosa.

## 2. Achados

### 🔴 S-01 — Body-size check bypassável (HIGH, confiança 9)

**Local:** `src/server.ts:302`
**Trecho atual:**

```ts
const contentLength = Number(request.headers.get("content-length") ?? 0);
if (contentLength > MAX_RUN_BODY_BYTES) {
  return withSecurityHeaders(
    Response.json({ error: "Request body too large." }, { status: 413 })
  );
}

const { files, pathname, options } =
  (await request.json()) as RunRequestBody;
```

**Vetor:** Um cliente que envia `Transfer-Encoding: chunked` (sem `Content-Length`) faz o check ver `0` e passar. Em seguida `request.json()` consome todo o corpo — não há limite intrínseco no parser do Cloudflare Workers (apenas o limite de 100 MB da plataforma, muito acima dos nossos 10 MB).

**Impacto:** memory exhaustion no isolate; processamento de payload arbitrariamente grande sem rejeição precoce.

**Fix proposto:**

```ts
async function readBodyWithLimit(request: Request, maxBytes: number): Promise<ArrayBuffer | null> {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
  return merged.buffer;
}
```

Substituir o check de `Content-Length` por `readBodyWithLimit` + parsing manual de JSON.

---

### 🟡 S-02 — `github.ts` segue redirects (MEDIUM, confiança 7)

**Local:** `src/github.ts:74, 92, 105`
**Trecho:**

```ts
const fileResponse = await fetch(item.download_url!);
```

**Vetor:** `fetch()` no Cloudflare Workers segue redirects por padrão. O allowlist `isSafeDownloadUrl` valida apenas o host **inicial**; se `raw.githubusercontent.com` (ou um proxy intermediário) responder com `302` para um host arbitrário, escapamos o controle. Embora GitHub hoje não faça isso, é defesa em profundidade comum.

**Fix proposto:**

```ts
const fileResponse = await fetch(item.download_url!, { redirect: "manual" });
if (fileResponse.status >= 300 && fileResponse.status < 400) {
  // GitHub raw não deveria redirecionar — recusar
  return;
}
```

---

### ✅ S-03 — Stack trace leak (corrigido em #15)
`buildErrorResponse` retornava `error.stack` ao cliente — corrigido para retornar só `message` redactada. Stack continua logada internamente via `console.error`.

### ✅ S-04 — Compliance scanner era dead code (corrigido em #15)
`scanFiles` + `redactString` existiam em `compliance.ts` mas nunca eram chamados. Agora `/api/run` chama ambos.

### ✅ S-05 — `download_url` sem validação (corrigido em #15)
`isSafeDownloadUrl(host ∈ {raw.githubusercontent.com, api.github.com})` ativo antes de qualquer fetch.

### ✅ S-06 — Timestamp LGPD forjável (corrigido em #15)
`body.ts` validado contra ISO 8601 + janela ±5 min futuro / 24 h passado.

### ✅ S-07 — Sem limites de tamanho no `/api/run` (corrigido em #15, com gap S-01)
Limites de 10 MB / 50 files / 1 MB por arquivo aplicados, **mas** S-01 acima permite bypass do limite de body total.

### ✅ S-08 — `.gitignore` permissivo (corrigido em #15)
`.env*`, `*.pem`, `*.key`, `credentials*`, `*secret*` adicionados.

### ✅ S-09 — Headers de segurança ausentes (corrigido em #15)
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` aplicados via `withSecurityHeaders` em toda resposta da API.

---

## 3. Scan do histórico (`git log --all`)

| Padrão | Ocorrências | Local |
|---|---|---|
| `AKIA[0-9A-Z]{16}` | 1 | fixture `AKIAIOSFODNN7EXAMPLE` (compliance.test.ts) |
| `sk-[A-Za-z0-9_-]{20,}` | 2 | `sk-example-key-12345` (server.ts, documentado), fixture sequencial |
| `ghp_[A-Za-z0-9]{20,}` | 1 | fixture sequencial |
| `-----BEGIN.*PRIVATE KEY-----` | 1 | fixture com payload `MIIEowIBAAKCAQEAxxxx` |
| `.env`, `credentials.*`, `*.pem` | 0 | nunca commitado |

**Veredito:** ✅ Histórico limpo. Sem secrets reais.

---

## 4. Hardening adicional sugerido (não-bloqueante)

- **CSP** para o app estático (Cloudflare assets serve o React app; headers via `_headers` file)
- **HSTS** — já é gerenciado pelo Cloudflare edge na maioria dos deploys; não precisamos no Worker
- **CORS explícito** em `/api/*` se vamos suportar cross-origin no futuro (hoje a aplicação é same-origin, então a ausência é OK)
- **Rate-limit** em `/api/run` e `/api/github` (hoje só LGPD tem) — depende do Cloudflare Access cobrir antes

## 5. Recomendação de processo

| Item | Ação |
|---|---|
| Pre-commit hook | `gitleaks` ou `trufflehog` |
| CI obrigatório | `npm test` + `npm run build` em todo PR; bloquear merge se vermelho |
| SAST | GitHub CodeQL (grátis para repos públicos) |
| Política de revisão | PRs em `src/lgpd*.ts` / `src/compliance.ts` requerem checklist explícita |
| Cadência | Auditoria de segurança trimestral, revisão pós-incidente sempre |

## 6. Próximos passos

Issue de tracking criada para todos os achados abertos. Fase A (S-01, S-02, testes mínimos) deve preceder o próximo release.
