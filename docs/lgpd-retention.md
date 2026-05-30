# LGPD — Política de Retenção de Dados

**Audit ref:** L-03 (audit 2026-05-24)
**Última revisão:** 2026-05-24

A LGPD não fixa prazos rígidos — o art. 16 exige que dados sejam eliminados após o fim do tratamento, **exceto** para cumprimento de obrigação legal, estudo por órgão de pesquisa, transferência a terceiro ou uso exclusivo do controlador (anonimizado). A política abaixo balanceia minimização (princípio do art. 6º III) com a necessidade de comprovar conformidade.

## Retenção por tipo de registro

| Registro | KV prefix | Retenção | Justificativa LGPD | Mecanismo |
|---|---|---|---|---|
| Solicitações de direitos do titular | `request:{id}`, `protocol:{protocol}` | **5 anos** | Art. 16 II — cumprimento de obrigação legal (resposta em 15 dias úteis exige trilha auditável); art. 37 — registro de operações | `expirationTtl` no `kv.put` em `lgpd.ts` (`RIGHTS_TTL_SECONDS`) |
| Audit de consentimento | `consent-audit:{id}` | **180 dias** | Operacional — substituído quando o usuário renova/revoga consentimento; cobre janela típica de auditoria | `expirationTtl` no `kv.put` em `lgpd.ts` (`AUDIT_TTL_SECONDS`) |
| Logs estruturados (`console.log`) | — | **Limite do plano Cloudflare Workers** (typicamente 7–30 dias para Workers Observability) | Operacional + accountability art. 37 | Plataforma; sem ação no código |
| Hashes IP/UA dentro dos registros acima | — | Mesma vida do registro pai | Pseudonimização HMAC torna o dado funcionalmente anônimo para terceiros sem o secret | — |

## Como funciona o TTL no Cloudflare KV

`expirationTtl` é setado no momento do `kv.put`. Cloudflare retorna o valor enquanto não expira; após o prazo, retorna `null` na leitura e o registro é colectado em background. A garantia é "eventual" — algumas leituras podem retornar `null` antes do prazo nominal por causa de eventual consistency entre datacenters.

Para alterar os prazos:

1. Edite `RIGHTS_TTL_SECONDS` / `AUDIT_TTL_SECONDS` em `src/lgpd.ts`
2. **Importante:** TTL só afeta registros *futuros*. Registros já gravados mantêm o TTL que tinham na hora do put.
3. Documente a mudança aqui e em `CHANGELOG.md`

## Quando renovar / refrescar

- **Rights request — status muda (received → processing → completed):** abrir uma nova entrada ao invés de atualizar a existente, mantendo a trilha. Se a atualização in-place for necessária, re-aplicar `expirationTtl: RIGHTS_TTL_SECONDS` no put.
- **Consent audit — novo consentimento do mesmo usuário:** a chave KV usa `body.id` (UUID v4 do `ConsentRecord`), que muda a cada decisão de consent. Cada decisão é uma entrada nova com seus próprios 180 dias.

## Exclusão sob demanda (art. 18 VI)

Quando o titular solicita eliminação via `/api/lgpd/rights-request` com `requestType: "anonymization-blocking-deletion"`, o processamento é manual (15 dias úteis). O fluxo é:

1. Operador identifica os hashes do titular via `nameHash` / `emailHash` / `cpfHash`
2. Lista registros do KV: `kv.list({prefix: "request:"})` + filtro pelo `subject.*Hash`
3. `kv.delete` para cada chave
4. Documentar a deleção no protocolo da solicitação

> **TODO Fase C:** automatizar via endpoint admin (`DELETE /api/lgpd/admin/subject/:hash`) com autenticação.

## Não-aplicabilidade

Os hashes HMAC persistidos (subject, ip, ua) **não são considerados dado pessoal** desde que o `LGPD_HASH_SECRET` não vaze. O HMAC com segredo dedicado (não SHA-256 puro) torna rainbow tables inviáveis — a ANPD considera isso anonimização efetiva sob art. 12 §1º. Portanto a retenção poderia ser indefinida, **mas mantemos 5 anos** por princípio de minimização e para alinhar com prazos típicos de prescrição cível.

## Histórico de revisões

| Data | Mudança |
|---|---|
| 2026-05-24 | Documento inicial (L-03 audit fix) — TTL implementado: 5 anos para rights-request, 180 dias para consent-audit |
