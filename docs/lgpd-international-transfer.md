# LGPD — Transferência Internacional de Dados

**Audit ref:** L-04 (audit 2026-05-24)
**Última revisão:** 2026-05-24
**Base normativa:** Lei 13.709/2018, arts. 33 a 36

A LGPD restringe a transferência internacional de dados pessoais, permitindo-a apenas em hipóteses específicas (país com nível adequado de proteção, garantias contratuais/SCC, consentimento específico, cumprimento de obrigação legal, etc.). Este documento mapeia os fluxos transfronteiriços do playground e suas salvaguardas.

## Fluxos identificados

| Fluxo | Destino | País/Região | Dado pessoal envolvido? | Base (arts. 33–36) | Salvaguarda |
|---|---|---|---|---|---|
| Hospedagem do Worker + KV | Cloudflare (edge global) | Global (inclui EUA, UE, etc.) | Sim — audit/rights records (pseudonimizados) | Art. 33 VIII — garantias por cláusulas-padrão contratuais | Cloudflare adere a SCCs da UE; dados pseudonimizados via HMAC |
| Import do GitHub | github.com, raw.githubusercontent.com | EUA (GitHub Inc.) | **Não** — é o código do próprio usuário que ele solicita importar | N/A — não é dado de titular coletado | Allowlist de host + `redirect: manual` (S-02) |
| Type-checker (lib TS) | cdn.jsdelivr.net | Global (Fastly/CDN) | **Não** — só nomes de arquivos de lib do TypeScript | N/A | Nenhum dado de usuário transita; só metadados de lib |

## Análise

### Cloudflare (hospedagem) — o único fluxo com dado de titular

Os registros de audit de consentimento e de solicitações de direitos residem no Cloudflare KV, que é replicado globalmente. Isso constitui transferência internacional sob o art. 33.

**Salvaguardas aplicáveis:**

1. **Cláusulas-padrão contratuais (art. 33 VIII):** A Cloudflare oferece DPA (Data Processing Addendum) com Standard Contractual Clauses. O controlador que fizer deploy deve **aceitar o DPA da Cloudflare** no dashboard da conta.
2. **Pseudonimização:** todos os campos de titular são HMAC antes de persistir — o dado que cruza fronteira não é reidentificável sem o `LGPD_HASH_SECRET`.
3. **Restrição de jurisdição (opcional, recomendado para público BR/UE):** o Cloudflare KV e Durable Objects suportam restrição de localização. Para Durable Objects, usar `jurisdiction` hint:
   ```ts
   // Exemplo — restringir DO à UE
   const id = env.LgpdRateLimit.idFromName(ipHash); // hoje: global
   // alternativa com jurisdiction:
   // const ns = env.LgpdRateLimit.jurisdiction("eu");
   // const id = ns.idFromName(ipHash);
   ```
   > **TODO (decisão de negócio):** habilitar `jurisdiction: "eu"` se a base de titulares justificar. A `"eu"` é a mais próxima de garantia de localização disponível na Cloudflare; não há hint `"br"` no momento.

### GitHub e jsDelivr — sem transferência de dado de titular

Nenhum dado pessoal de titular do playground é enviado a esses serviços. O import do GitHub transfere código-fonte que o próprio usuário escolhe importar (não é dado de terceiro titular). O type-checker só baixa arquivos de definição de tipo do TypeScript.

## Obrigação do deployer

Quem fizer deploy público deve:

1. ✅ Aceitar o **DPA da Cloudflare** (dashboard → conta → legal)
2. ✅ Declarar a transferência internacional na **política de privacidade** (`privacy.json` — adicionar seção apontando para este documento)
3. ⬜ Avaliar habilitar `jurisdiction: "eu"` conforme a base de titulares
4. ✅ Garantir que `LGPD_HASH_SECRET` está provisionado (sem ele os endpoints retornam 503 — não há persistência de dado em claro)

## Histórico de revisões

| Data | Mudança |
|---|---|
| 2026-05-24 | Documento inicial (L-04 audit fix) |
