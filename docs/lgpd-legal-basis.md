# LGPD — Matriz de Bases Legais por Tratamento

**Audit ref:** L-01 (audit 2026-05-24)
**Última revisão:** 2026-05-24
**Base normativa:** Lei 13.709/2018, arts. 7º (dados pessoais) e 11 (dados sensíveis)

Este documento mapeia cada operação de tratamento de dado pessoal realizada pelo playground à sua base legal, finalidade, dados envolvidos e retenção. É a evidência de conformidade exigida pelo princípio da responsabilização (art. 6º X) e pelo registro de operações (art. 37).

> **Importante:** o playground em si não coleta dados de titulares para operar — ele executa código de Workers fornecido pelo usuário. As operações de tratamento abaixo derivam exclusivamente da camada de compliance LGPD (banner de consentimento + endpoints de direitos), não da funcionalidade-núcleo.

## Matriz

| # | Tratamento | Dados pessoais | Base legal (art. 7º/11) | Finalidade | Retenção | Onde no código |
|---|---|---|---|---|---|---|
| 1 | Cookie de consentimento | `id` (UUID), versão, categorias, timestamp, locale | **Art. 7º I** — consentimento (o próprio registro do consentimento) | Comprovar que o consentimento foi obtido e registrar a escolha do titular | localStorage do navegador (client-side); auditoria server-side 180 dias | `src/client/lgpd/ConsentContext.tsx`, `consentStorage.ts` |
| 2 | Cookies funcionais (`theme`, `i18nextLng`) | preferência de tema e idioma | **Art. 7º I** — consentimento granular (categoria `functional`, opt-in) | Persistir preferências de UI entre sessões | localStorage até revogação | `src/client/i18n.tsx`, `useDarkMode` |
| 3 | Audit de consentimento (server-side) | `ip_hash` (HMAC), `ua_hash` (HMAC), categorias, método | **Art. 7º IX** — legítimo interesse (accountability/prova de conformidade) | Trilha auditável das decisões de consentimento para demonstração à ANPD | 180 dias (`AUDIT_TTL_SECONDS`) | `src/lgpd.ts` → `handleConsentAudit` |
| 4 | Solicitação de direitos do titular | `nameHash`, `emailHash`, `cpfHash` (todos HMAC), detalhes textuais, `ip_hash`, `ua_hash` | **Art. 7º II** — cumprimento de obrigação legal (LGPD art. 18 obriga o controlador a atender pedidos) | Receber e processar pedidos de exercício de direitos (acesso, correção, eliminação, etc.) | 5 anos (`RIGHTS_TTL_SECONDS`) | `src/lgpd.ts` → `handleRightsRequest` |
| 5 | Logs operacionais estruturados | `ip_hash`, `ua_hash`, eventos | **Art. 7º IX** — legítimo interesse (segurança e operação) | Detecção de abuso, depuração, registro de operações (art. 37) | Limite da plataforma Cloudflare (Logpush/Observability) | `console.log` estruturado em `src/lgpd.ts` |

## Dados sensíveis (art. 11)

O **CPF não é dado sensível** sob a LGPD (sensíveis são origem racial/étnica, convicção religiosa, opinião política, saúde, vida sexual, genético, biométrico). Portanto nenhuma operação acima recai no art. 11. O CPF é dado pessoal comum, tratado sob art. 7º II (obrigação legal) quando fornecido numa solicitação de direitos, e **sempre pseudonimizado via HMAC** antes de qualquer persistência.

## Pseudonimização como salvaguarda transversal

Todos os identificadores diretos (nome, email, CPF, IP, user-agent) são submetidos a **HMAC-SHA256 com `LGPD_HASH_SECRET`** antes de persistir. Sob art. 12 §1º, dado pseudonimizado por processo que impede reidentificação sem o segredo é tratado com proteção reforçada. Consequência prática: um vazamento do KV sem o vazamento concomitante do `LGPD_HASH_SECRET` não expõe titulares.

## Revogação e oposição

- **Revogação de consentimento** (tratamentos #1, #2): `ConsentContext.revoke()` limpa o estado e dispara um novo audit. Base art. 8º §5º.
- **Oposição a tratamento por legítimo interesse** (#3, #5): via solicitação de direitos `requestType: "opposition"`. Avaliada caso a caso pelo controlador.

## Quando esta matriz deve ser revisada

- Ao adicionar qualquer endpoint que receba/persista dado de titular
- Ao mudar a finalidade de um tratamento existente
- Ao alterar prazos de retenção (sincronizar com `docs/lgpd-retention.md`)
- No mínimo, revisão semestral

## Histórico de revisões

| Data | Mudança |
|---|---|
| 2026-05-24 | Documento inicial (L-01 audit fix) |
