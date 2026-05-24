# Relatório de Revisão — `dynamic-workers-playground`

**Branch:** `claude/lgpd-lightweight-router-i18n` · **Base:** `main`
**PRs cobertos:** #12 (refactor i18n/router), #13 (sweep LGPD + vitest)
**Última atualização:** 2026-05-24

## Sumário Executivo

A base implementa um scaffold LGPD funcional e bem documentado: consentimento
gateado por categoria, pseudonimização forte (HMAC-SHA256 com segredo de
servidor), rate-limit por Durable Object, e direitos do titular via endpoint
`/api/lgpd/rights-request`. As lacunas relevantes são **operacionais**
(placeholders de Controlador/DPO não preenchidos, ausência de Cloudflare Access
obrigatório, sem cláusula explícita de transferência internacional) e
**processuais** (sem CI, sem mecanismo de incidente, sem endpoint para o
titular consultar seu protocolo). O PR #12 reduz superfície de ataque ao
remover 4 dependências em troca de ~150 linhas auditáveis sem introduzir
vulnerabilidades novas.

## Pré-checagens

| Verificação | Resultado |
|---|---|
| `git log --all -G "(api_key\|secret\|password\|token\|bearer\|AKIA\|ghp_\|sk-)"` | Único hit: `sk-example-key-12345` em `src/server.ts:258` — placeholder documentado em CLAUDE.md. Nenhuma credencial real no histórico. |
| Repo de Skills (`SKILL.md` + frontmatter)? | N/A — é playground de Workers. |
| Leitura de `/mnt/user-data/uploads`? | Nenhuma referência. N/A. |
| CI configurado (`.github/workflows/`) | Ausente — registrado como dívida técnica (P1). |

---

## 1. Parecer LGPD Item-a-Item

### Art. 7º / 11 — Bases legais

**Classificação:** Parcialmente Conforme.

| Tratamento | Base implícita | Lacuna |
|---|---|---|
| `lgpd-consent` em localStorage (`necessary`) | Art. 7º IX — legítimo interesse (operação) | Documentado em `banner.json` |
| `theme`/`i18nextLng` localStorage | Art. 7º I — consentimento (`functional`) | Gateado em `useDarkMode` + `i18n.tsx:114` |
| HMAC de identificadores no rights request | Art. 7º VI — exercício de direitos | Registrado em `lgpd.ts:91-222` |
| Audit log de consentimento (`ip_hash`, `ua_hash`) | Art. 7º II — cumprimento de obrigação legal | Política não declara explicitamente a base |

**Ação:** adicionar seção "Base legal por operação" em `privacy.json` mapeando
cada tratamento → inciso do art. 7º.

### Art. 6º — Princípios

**Classificação:** Conforme (com ressalvas).

| Princípio | Evidência | Status |
|---|---|---|
| Finalidade | Comentários de propósito em `lgpd.ts:1-12` | OK |
| Adequação | Categorias mapeadas para uso real | OK |
| Necessidade/minimização | CPF opcional (`lgpd.ts:150-151`); IP/UA hasheados; sem `cpfLast2` | OK (forte) |
| Transparência | Política PT-BR + EN, 12 seções LGPD | OK |
| Segurança | HMAC-SHA256 + rate-limit DO + Origin check | OK (ver Art. 46) |
| Prevenção | 503 quando `LGPD_HASH_SECRET` ausente | OK (exemplar) |
| Não discriminação | Rate-limit por IP-hash, não por atributo de titular | OK |
| Responsabilização | Logs estruturados com `event`, `protocol`, `ts` | OK |

**Ressalva:** placeholders `[Razão Social do Controlador]`, `dpo@example.com`
ainda em `constants.ts` — `setup-lgpd.sh` detecta mas não bloqueia o deploy.

### Art. 18 — Direitos do titular

**Classificação:** Parcialmente Conforme.

Endpoint aceita os 9 tipos do art. 18 (`lgpd.ts:16-26`). Cliente coleta via
`DataRightsForm.tsx`.

Lacunas:

1. **Sem endpoint de consulta por protocolo** — titular recebe protocolo
   `LGPD-AAAAMMDD-xxxxxxxx` mas não pode consultar status.
2. **Resposta ao titular não automatizada** — como email é hasheado, o operador
   fisicamente não consegue responder digitalmente sem reidentificação manual.
3. **Sem fluxo de anonimização/eliminação automático** — pedido é recebido mas
   não há job/handler que execute.

**Ação:** endpoint `GET /api/lgpd/rights-request/:protocol` com challenge
baseado em hash de email + protocolo. PR #13 já endereça parte do tema 2.

### Arts. 46-49 — Segurança e sigilo

**Classificação:** Parcialmente Conforme.

| Item | Status | Evidência |
|---|---|---|
| Criptografia em trânsito | OK | TLS via Cloudflare |
| Criptografia em repouso | OK | KV AES-256 server-side encrypted |
| Pseudonimização | OK (forte) | HMAC-SHA256 com `LGPD_HASH_SECRET` ≥32 bytes |
| Controle de acesso ao endpoint | **Crítico** | Endpoints aceitam POSTs não autenticados — depende totalmente do operador colocar atrás de Cloudflare Access |
| Origin check (CSRF) | OK | `lgpd.ts:71-80` rejeita Origins cross-host |
| Rate-limit | OK | `LgpdRateLimit` DO, 5/10min por hash de IP |
| Secret management | OK | `wrangler secret put`, nunca em código |

**Ação imediata:** ou exigir header `CF-Access-Authenticated-User-Email` em
produção (via env flag), ou exibir banner vermelho no `/data-rights` quando o
hostname é público sem Access detectado.

### Art. 37 — Registro de operações

**Classificação:** Parcialmente Conforme.

`lgpd.ts` emite eventos estruturados:

- `lgpd.rights-request.received` / `rate-limited` / `secret-missing` / `kv-missing`
- `lgpd.consent.audit`

Lacunas:

- Sem definição de retenção (Workers logs default = 7 dias). LGPD não estipula
  prazo mínimo, mas demonstração de conformidade pede tipicamente 5 anos.
- Logs vão para `console.log` → Cloudflare observability. Sem export para
  SIEM/storage de longa duração.

**Ação:** habilitar Workers Logpush para R2/external com retenção declarada.
Documentar em `privacy.json` seção "retention".

### Art. 48 — Incidentes

**Classificação:** Não Conforme.

Nenhum mecanismo de detecção (anomalia, rate-spike, KV write failure crítico)
ou notificação (canal pré-definido).

**Ação:** alerta básico via Cloudflare Workers Analytics + `ctx.waitUntil` para
POST de erro a um webhook do operador.

### Arts. 33-36 — Transferência internacional

**Classificação:** Parcialmente Conforme.

Cloudflare KV/Workers podem armazenar/processar em qualquer região do mundo. O
texto da política deve declarar essa realidade.

**Ação:** revisar seção `international-transfer` em `privacy.json` citando
Cloudflare como sub-operador internacional + base legal (art. 33 II — execução
de contrato com salvaguardas contratuais da CF).

---

## 2. Fase 5 — Refatoração

### 5.1 Complexidade ciclomática alta

`handleRightsRequest` em `src/lgpd.ts:134-148` — 10 condições encadeadas.

Antes:

```ts
if (
    !body.requestType ||
    !RIGHTS_REQUEST_TYPES.has(body.requestType) ||
    !body.nameHash ||
    !HEX64_RE.test(body.nameHash) ||
    !body.emailHash ||
    !HEX64_RE.test(body.emailHash) ||
    !body.details ||
    typeof body.details !== "string" ||
    body.details.length === 0 ||
    body.details.length > 2000 ||
    body.confirmedSubject !== true
) {
    return Response.json({ error: "invalid-payload" }, { status: 400 });
}
```

Depois:

```ts
function validateRightsRequestBody(body: RightsRequestBody): string | null {
    if (!body.requestType || !RIGHTS_REQUEST_TYPES.has(body.requestType)) return "invalid-request-type";
    if (!body.nameHash || !HEX64_RE.test(body.nameHash)) return "invalid-name-hash";
    if (!body.emailHash || !HEX64_RE.test(body.emailHash)) return "invalid-email-hash";
    if (!body.details || typeof body.details !== "string") return "missing-details";
    if (body.details.length === 0 || body.details.length > 2000) return "details-length";
    if (body.confirmedSubject !== true) return "subject-not-confirmed";
    if (body.cpfHash && !HEX64_RE.test(body.cpfHash)) return "invalid-cpf-hash";
    return null;
}

// no handler:
const err = validateRightsRequestBody(body);
if (err) return Response.json({ error: err }, { status: 400 });
```

**Ganho:** error code preciso para o cliente, complexidade do handler cai de
~14 para ~6, validador isolado para unit-test.

### 5.2 Código duplicado

`sha256Hex` está em `src/hashing.ts` (server) **e** `src/client/lgpd/api.ts:18-26`
(client) com implementação idêntica.

```ts
// src/client/lgpd/api.ts — antes
async function sha256Hex(input: string): Promise<string> {
    const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(input),
    );
    return Array.from(new Uint8Array(buf), (b) =>
        b.toString(16).padStart(2, "0"),
    ).join("");
}

// depois
import { sha256Hex } from "../../shared/hashing";
```

Mover `src/hashing.ts` → `src/shared/hashing.ts` e importar de ambos os lados
(Workers runtime + browser ambos têm `crypto.subtle`).

**Ganho:** uma única implementação para auditar.

### 5.3 Performance previsível

`lgpd-rate-limit.ts:13-18` faz `storage.get` → `filter` → `storage.put` mesmo
quando bloqueia e o array filtrado é igual ao stored.

Antes:

```ts
if (recent.length >= MAX_REQUESTS) {
    await this.ctx.storage.put(key, recent);
    return { allowed: false, remaining: 0 };
}
```

Depois:

```ts
if (recent.length >= MAX_REQUESTS) {
    if (recent.length !== stored.length) {
        await this.ctx.storage.put(key, recent);
    }
    return { allowed: false, remaining: 0 };
}
```

**Ganho:** elimina DO storage write a cada request bloqueado quando não há
expiração nova — alivia write-amplification sob ataque sustentado.

### 5.4 Nomes ambíguos

Key `i18nextLng` em `src/client/i18n.tsx:43` foi mantida por compatibilidade
após remover i18next. Adicionar comentário explicando:

```ts
// Kept as "i18nextLng" for backward compatibility with users who already
// have the key set from the old i18next-browser-languagedetector storage.
const STORAGE_KEY = "i18nextLng";
```

### 5.5 Testes ausentes em caminhos críticos

| Caminho | Cobertura atual |
|---|---|
| `hashing.ts` (HMAC) | PR #13 adiciona |
| `consentStorage.ts` | PR #13 adiciona |
| `handleRightsRequest` validação | Ausente |
| `LgpdRateLimit` DO | Ausente (Miniflare suporta) |
| `router.tsx` navigate/popstate | Ausente |
| `i18n.tsx` Trans parsing | Ausente (regex pode ter edge case com `<1>` aninhado) |

**Prioridade:** validador de rights request + Trans component.

### 5.6 Padronização ausente

| Ferramenta | Estado | Recomendação |
|---|---|---|
| Linter (eslint/biome) | Ausente | `biome` (rápido, sem config) |
| Formatter | Ausente | `biome format` (mesma toolchain) |
| Type-check em CI | Ausente | `tsc --noEmit` em `.github/workflows/ci.yml` |
| Indentação | Inconsistente — tabs em `src/client/**`, spaces em `src/server.ts`, `src/github.ts` | biome unifica |
| Pre-commit hook | Ausente | `simple-git-hooks` opcional |

---

## 3. Matriz de Achados

| # | Severidade | Trilha | Achado | Status |
|---|---|---|---|---|
| L1 | High | LGPD/Segurança | Endpoints `/api/lgpd/*` sem autenticação | Documentado, depende do operador |
| L2 | High | LGPD/Direitos | Sem endpoint para titular consultar status do protocolo | Dívida técnica |
| L3 | Medium | LGPD/Incidentes | Sem detecção/notificação de incidente | Dívida técnica |
| L4 | Medium | LGPD/Conformidade | Placeholders em `constants.ts` | Detectado por `setup-lgpd.sh` (não bloqueia) |
| L5 | Medium | LGPD/Retenção | Logs sem retenção declarada | Dívida técnica |
| L6 | Low | LGPD/Transferência | Texto de transferência internacional genérico | Endereçar em PR de privacy.json |
| R1 | Medium | Refatoração | `handleRightsRequest` complexidade ~14 | Patch proposto |
| R2 | Low | Refatoração | `sha256Hex` duplicado server/client | Patch proposto |
| R3 | Low | Performance | DO storage write redundante em deny | Patch proposto |
| T1 | High | Testes | Sem cobertura para validador, Trans, router | PR proposto |
| T2 | Medium | Testes | Sem teste para `LgpdRateLimit` DO | Dívida técnica |
| P1 | Medium | Processo | Sem CI (`.github/workflows/`) | PR proposto |
| P2 | Low | Processo | Sem linter/formatter — indentação inconsistente | PR proposto |
| S1 | None | Segurança | Histórico git limpo — nenhum segredo real | OK |
| S2 | None | Segurança | PR #12 não introduz vulnerabilidades novas | OK |

---

## 4. Plano de Aplicação Faseado

### Onda 1 — agora (em PR / pronto para merge)

- **PR #12** — refactor i18n/router, fecha #10, reduz attack surface, sincroniza
  package-lock com package.json.
- **PR #13** — sweep de correctness no `privacy.json` + vitest setup.

### Onda 2 — próxima sessão (commits atômicos, Conventional Commits)

```
fix(lgpd): extract rights-request body validator + precise error codes
refactor(privacy): consolidate sha256Hex into src/shared/hashing
perf(lgpd): skip redundant DO write when rate-limit denies and window unchanged
test(lgpd): unit tests for validateRightsRequestBody + Trans regex parsing
test(router): popstate + navigate + Link interception
ci(github): add type-check + test workflow on PR
chore(format): add biome config + apply tab/space normalization
docs(privacy): map each processing operation to its art. 7º base legal
docs(privacy): cite Cloudflare as international sub-processor per art. 33 II
```

### Onda 3 — dívida técnica registrada (issues, não commits imediatos)

- `feat(lgpd): GET /api/lgpd/rights-request/:protocol with hash challenge` (L2)
- `feat(lgpd): incident detection hook + operator webhook` (L3)
- `feat(observability): Logpush to R2 with 5-year retention` (L5)
- `feat(lgpd): require CF-Access auth header on /api/lgpd/*` (L1)
- `chore(deps): investigate dependabot alert #8 after #12 merge`

---

## 5. Checklist de Validação Pós-Merge

```
[ ] npm install resolve sem 403 (lockfile sincronizado após #12)
[ ] npm test passa (após #13)
[ ] Banner aparece em primeira visita; localStorage["lgpd-consent"] gravado
[ ] Accept All grava theme/i18nextLng; Reject limpa as duas chaves
[ ] /privacy, /data-rights, /manage-consent renderizam sem reload (SPA)
[ ] Back/forward do browser atualiza a rota
[ ] LanguageSwitcher altera todas as strings da página
[ ] Sem LGPD_HASH_SECRET: POST /api/lgpd/rights-request → 503 { error: "secret-unavailable" }
[ ] Com secret + payload inválido: 400
[ ] Com payload válido: 200 { protocol: "LGPD-...", receivedAt }
[ ] 6º request em 10min do mesmo IP-hash: 429 { error: "rate-limited" }
[ ] Origin cross-host (browser): 403 { error: "forbidden-origin" }
[ ] document.documentElement.lang reflete o idioma selecionado
[ ] Deploy de produção atrás de Cloudflare Access (manual)
[ ] Placeholders em constants.ts substituídos antes de deploy público
```

---

## 6. Recomendações de Processo

1. **CI mínimo** (`.github/workflows/ci.yml`): `npm ci` → `npm run types` →
   `tsc --noEmit` → `npm test`. ~30 linhas, bloqueia regressão.
2. **SAST**: GitHub CodeQL JS/TS (default suite) + Dependabot version updates
   semanal.
3. **Política de revisão**: 1 approval obrigatório em PRs tocando
   `src/lgpd*.ts` / `src/hashing.ts` / `wrangler.jsonc`.
4. **Pre-deploy gate**: `setup-lgpd.sh` deve **falhar** (exit 1) — não apenas
   warn — quando placeholders persistem ou Cloudflare Access não está
   configurado.
5. **Hook local opcional**: `simple-git-hooks` rodando `biome check --staged`
   em pre-commit.
