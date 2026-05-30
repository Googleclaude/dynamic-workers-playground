# Registro de Operações de Tratamento — ROPA (LGPD art. 37)

Registro das operações de tratamento de dados pessoais, mantido pelo
controlador. Campos entre `_(...)_` devem ser preenchidos com os dados reais da
organização antes da operação em produção.

## Identificação

| Campo | Valor |
|-------|-------|
| Controlador | _(Razão social / CNPJ — ver `src/client/lgpd/constants.ts`)_ |
| Encarregado (DPO) | _(Nome / e-mail)_ |
| Sistema | dynamic-workers-playground |

## Operações

### R1 — Solicitação de direitos do titular

| Campo | Valor |
|-------|-------|
| Categorias de dados | Identificadores pseudonimizados (hash de nome, e-mail, CPF), texto livre `details`, locale. |
| Categorias de titulares | Visitantes que exercem direitos do art. 18. |
| Finalidade | Atender pedidos do art. 18. |
| Base legal | Art. 7º, II (ver `bases-legais.md`). |
| Compartilhamento | Nenhum por padrão. |
| Transferência internacional | Ver `transferencia-internacional.md`. |
| Medidas de segurança | HMAC server-side; AES-256-GCM em repouso (opt-in); rate-limit por DO; gate de origem; integridade por SHA-256. |
| Prazo de retenção | _(definir — sugestão: prazo legal de comprovação)_ |
| Eliminação | _(definir procedimento — apagar `request:<id>` e `protocol:<protocolo>` no KV)_ |

### R2 — Registro de consentimento

| Campo | Valor |
|-------|-------|
| Categorias de dados | `id` do consentimento, versão, categorias, método, `serverTs`, `ip_hash`, `ua_hash`. |
| Categorias de titulares | Visitantes do site. |
| Finalidade | Comprovar consentimento (art. 8º §1º). |
| Base legal | Art. 7º, I e II. |
| Compartilhamento | Nenhum. |
| Medidas de segurança | `serverTs` autoritativo; pseudonimização de IP/UA; rate-limit. |
| Prazo de retenção | _(definir)_ |

### R3 — Logs de execução / redação

| Campo | Valor |
|-------|-------|
| Categorias de dados | Código-fonte e saídas potencialmente contendo PII/segredos incidentais. |
| Finalidade | Operação do playground e prevenção de vazamento. |
| Base legal | Art. 7º, IX. |
| Medidas de segurança | Bloqueio de segredos; redação de PII em todos os canais; stack traces redigidas antes do log (`src/server.ts`). |
| Prazo de retenção | Efêmero. |

## Eventos de log estruturados (trilha de auditoria)

O código emite eventos JSON que apoiam a demonstração de conformidade:
`lgpd.rights-request.received`, `lgpd.rights-request.secret-missing`,
`lgpd.rights-request.rate-limited`, `lgpd.rights-request.kv-missing`,
`lgpd.rights-request.details-unencrypted`, `lgpd.consent.audit`,
`lgpd.<scope>.no-client-ip`.

## Revisão

| Data | Responsável | Mudança |
|------|-------------|---------|
| _(preencher)_ | _(DPO)_ | Versão inicial. |
