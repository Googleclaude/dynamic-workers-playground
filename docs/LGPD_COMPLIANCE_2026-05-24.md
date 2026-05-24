# LGPD — Parecer de Conformidade — 2026-05-24

**Repo:** `googleclaude/dynamic-workers-playground`
**Commit auditado:** `970944e` (main)
**Auditor:** Claude (Opus 4.7) via Claude Code
**Escopo:** conformidade técnica com a Lei 13.709/2018 (LGPD)

---

## Sumário

A implementação técnica está alinhada com os princípios da LGPD — minimização (HMAC client-side antes do envio + HMAC server-side com segredo), segurança (criptografia em trânsito/repouso, Origin check, rate-limit por DO), prevenção (compliance scanner bloqueia secrets e redacta PII), transparência (privacy.json detalhada em pt-BR e en, banner de consentimento granular, página de direitos). Conformidade formal é **parcial**: faltam três peças documentais — declaração explícita de bases legais por endpoint, política de retenção de logs e mecanismo de detecção/notificação de incidentes — e dois placeholders (`CONTROLLER_INFO`/`DPO_INFO`) que precisam ser preenchidos antes do go-live.

---

## 1. Bases legais (art. 7º e 11)

| Tratamento | Base legal | Documentação | Status |
|---|---|---|---|
| Cookie `lgpd-consent` (necessário) | Art. 7º V (execução de contrato) | Implícita; declarada em `privacy.json` | Parcial |
| Cookies `theme`, `i18nextLng` (functional) | Art. 7º IX + consentimento granular | Categorizado em `ConsentContext`; opt-in explícito | ✅ Conforme |
| `/api/lgpd/rights-request` (hashes de nome/email/CPF) | Art. 7º II (obrigação legal — LGPD art. 18) | Comentários em `lgpd.ts:1-12` | ✅ Conforme |
| `/api/lgpd/consent-audit` (ip_hash, ua_hash) | Art. 7º IX (legítimo interesse — accountability) | Implícito | Parcial |
| Logs estruturados via tail (dynamic worker) | Art. 7º IX | Não declarado | Parcial |

**Ação corretiva:** criar `docs/lgpd-legal-basis.md` listando cada tratamento, base, finalidade, retenção e compartilhamento.

---

## 2. Princípios (art. 6º)

| Princípio | Status | Evidência |
|---|---|---|
| Finalidade | Parcial | Categorias `necessary`/`functional`/`preferences` declaradas, mas finalidade específica de cada cookie só no locale |
| Adequação | N/A | Avaliação humana do controller |
| Necessidade (minimização) | ✅ Conforme | SHA-256 client-side + HMAC server-side; nenhum CPF/email/IP em claro |
| Transparência | ✅ Conforme | `privacy.json` pt-BR + en, banner, página de direitos, comentários no código |
| Segurança | ✅ Conforme | HMAC com segredo, Origin check, DO rate-limit, compliance scanner, security headers |
| Prevenção | ✅ Conforme | `scanFiles` bloqueia secrets; `redactString` em toda saída; `.gitignore` reforçado |
| Não discriminação | N/A | Sem decisão automatizada baseada em atributos |
| Responsabilização | Parcial | Audit log estruturado existe; `CONTROLLER_INFO`/`DPO_INFO` em `constants.ts` ainda com placeholders |

**Ação corretiva imediata:** preencher `CONTROLLER_INFO` e `DPO_INFO` em `src/client/lgpd/constants.ts` antes de qualquer deploy público.

---

## 3. Direitos do titular (art. 18)

| Direito | Suportado? | Modo |
|---|---|---|
| Confirmação / Acesso | Parcial | Recebe via `/api/lgpd/rights-request` (`requestType: "confirmation"|"access"`); resposta manual em 15 dias úteis |
| Correção | Parcial | Mesmo padrão |
| Anonimização/bloqueio/eliminação | Parcial | Mesmo padrão |
| Portabilidade | Parcial | Mesmo padrão |
| Informação sobre compartilhamento | Parcial | Mesmo padrão |
| Revogação de consentimento | ✅ Conforme | `ConsentContext.revoke()` + endpoint registra |
| Oposição | Parcial | Mesmo padrão de rights-request |

**Status global:** Parcial.
LGPD permite fulfillment manual (15 dias úteis). Gap real: não há dashboard admin pra listar protocolos pendentes.

**Ação corretiva (Fase C):** endpoint admin autenticado `GET /api/lgpd/admin/requests?status=received`.

---

## 4. Segurança e sigilo (arts. 46–49)

| Item | Status | Evidência |
|---|---|---|
| Criptografia em trânsito | ✅ Conforme | Cloudflare Workers HTTPS-only; CDN jsdelivr `https:` |
| Criptografia em repouso | ✅ Conforme | Cloudflare KV criptografado pela plataforma; HMAC adicional nos campos sensíveis |
| Controle de acesso | Parcial | README orienta Cloudflare Access upstream; código tem Origin check + DO rate-limit; sem auth admin nativa (mas endpoints admin ainda não existem) |
| Pseudonimização | ✅ Conforme | HMAC-SHA256 com `LGPD_HASH_SECRET` para nome, email, CPF, IP, UA |
| Gestão de segredo | ✅ Conforme | `LGPD_HASH_SECRET` via `wrangler secret put`; sem hardcode |
| Sigilo (não-redação de PII em logs) | ✅ Conforme | `redactString` em todos os outputs; apenas hashes em audit |

---

## 5. Registro de operações (art. 37)

- `console.log(JSON.stringify({event, ts, ip_hash, ua_hash, ...}))` em todos os caminhos LGPD relevantes (`lgpd.ts`)
- Tail-worker pipeline captura eventos dos dynamic workers (`logging.ts`)
- Audit record persistido em KV com `protocol`, `receivedAt`, `integrity` (SHA-256 dos campos críticos)

**Gap:** sem política de retenção declarada. Logs operacionais do Cloudflare têm retenção limitada pela plataforma.

**Ação corretiva:**
- Declarar política em `docs/lgpd-retention.md` (sugestão: 6 meses para audit, 90 dias para operacional, 5 anos para protocolos de direitos por exigência de prestação de contas)
- Implementar via TTL no KV: `kv.put(key, value, { expirationTtl: 15_552_000 })` para audit (180 dias)

---

## 6. Incidentes — detecção e notificação (art. 48)

| Item | Status |
|---|---|
| Detecção automatizada de violação | ❌ Não Conforme |
| Endpoint/webhook de notificação à ANPD | ❌ Não Conforme |
| Notificação aos titulares afetados | ❌ Não Conforme |
| Playbook de resposta a incidente | ❌ Não documentado |

**Status:** **Não Conforme.**

**Ação corretiva (Fase C):**
- `compliance.blocked` em métrica observability + webhook quando >N/min
- `docs/incident-response.md` com SLA (2 dias úteis pra incidentes graves à ANPD)
- Mecanismo de email batch para titulares (depende do `LGPD_KV` indexar por `subject:emailHash`)

---

## 7. Transferência internacional (arts. 33–36)

- `/api/github` chama `github.com` + `raw.githubusercontent.com` (US-based) — mas é o **dado do próprio usuário** que ele solicita importar
- Cloudflare Workers edge é global; KV replicado globalmente; dados de titulares brasileiros podem residir/transitar fora do BR
- `@typescript/vfs` (PR #14) fetcha lib do jsdelivr — sem dado de usuário enviado, só nomes de arquivos de lib

**Status:** **Parcial.**

**Ação corretiva (Fase C):**
- Seção "Transferência Internacional" na política de privacidade explicando: (a) Cloudflare signatário de SCCs/cláusulas-padrão; (b) considerar `jurisdiction: "eu"` no KV se público-alvo for BR/EU
- Documentar provedores third-party usados: GitHub Inc. (importer), jsDelivr (CDN — Fastly/PrismaCDN)

---

## 8. Matriz consolidada de conformidade

| Item | Status |
|---|---|
| Bases legais declaradas | 🟡 Parcial |
| Princípio da finalidade | 🟡 Parcial |
| Minimização (pseudonimização HMAC) | ✅ Conforme |
| Transparência | ✅ Conforme |
| Segurança técnica | ✅ Conforme |
| Prevenção (scanner + redactor) | ✅ Conforme |
| Responsabilização (audit logs + DPO info) | 🟡 Parcial (placeholders) |
| Direitos do titular — receptáculo | 🟡 Parcial (fulfillment manual) |
| Criptografia em trânsito | ✅ Conforme |
| Criptografia em repouso | ✅ Conforme |
| Controle de acesso | 🟡 Parcial (Cloudflare Access upstream) |
| Registro de operações (art. 37) | 🟡 Parcial (sem retenção declarada) |
| Detecção/notificação de incidentes (art. 48) | 🔴 Não Conforme |
| Transferência internacional documentada | 🟡 Parcial |

---

## 9. Plano de remediação faseado

**Fase A — Bloqueante antes do próximo deploy público:**
- Preencher `CONTROLLER_INFO` / `DPO_INFO` em `constants.ts` (ou ocultar UI até preenchido)

**Fase B — Curto prazo (≤ 1 mês):**
- `docs/lgpd-legal-basis.md` — matriz endpoint × base legal × finalidade × retenção
- `docs/lgpd-retention.md` — política formal de retenção
- TTL no KV (`expirationTtl`) para audit records

**Fase C — Médio prazo (≤ 1 trimestre):**
- Observability alerts para `compliance.blocked` (art. 48 — detecção)
- `docs/incident-response.md` — playbook formal
- Adendo "Transferência Internacional" na política
- Endpoint admin autenticado para fulfillment de direitos
- Mecanismo de notificação a titulares (batch email)

---

## 10. Referências

- Lei 13.709/2018 (LGPD): https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- ANPD — Resolução 15/2024 (incidentes): https://www.gov.br/anpd/pt-br/assuntos/noticias/resolucao-cd-anpd-no-15-de-24-de-abril-de-2024
- Cloudflare LGPD/Privacy: https://www.cloudflare.com/trust-hub/lgpd-compliance/
