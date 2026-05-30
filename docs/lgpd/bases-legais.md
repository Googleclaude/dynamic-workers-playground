# Bases legais do tratamento (LGPD art. 7º)

Este documento mapeia cada operação de tratamento de dados pessoais realizada
pelo código a uma base legal do art. 7º da Lei nº 13.709/2018 (LGPD). Deve ser
revisado pelo Encarregado (DPO) e atualizado a cada mudança nas operações.

> **Nota.** O playground não trata dados pessoais sensíveis (art. 11). Caso o
> campo livre `details` de uma solicitação venha a conter dado sensível por
> iniciativa do titular, ver a ação corretiva em `ripd.md`.

## Operação 1 — Solicitação de direitos do titular (`/api/lgpd/rights-request`)

| Item | Descrição |
|------|-----------|
| Dados tratados | Hash do nome, hash do e-mail, hash do CPF (opcional), texto livre `details`, locale; metadados `ip_hash`, `ua_hash`. |
| Finalidade | Receber e processar pedidos de exercício de direitos (art. 18). |
| **Base legal** | **Art. 7º, II — cumprimento de obrigação legal/regulatória pelo controlador** (atender ao art. 18). Subsidiariamente, art. 7º, IX (legítimo interesse) para os metadados anti-abuso. |
| Retenção | Definida pelo controlador; ver `ropa.md`. |
| Observações | Identificadores são pseudonimizados via HMAC (`src/hashing.ts`); `details` é cifrado em repouso quando `LGPD_KV_ENCRYPTION_KEY` está provisionado (`src/encryption.ts`). |

## Operação 2 — Registro de consentimento (`/api/lgpd/consent-audit`)

| Item | Descrição |
|------|-----------|
| Dados tratados | `id` do consentimento (UUID), versão, categorias, método; `serverTs`; metadados `ip_hash`, `ua_hash`. |
| Finalidade | Comprovar quando e como o consentimento foi concedido/revogado (prova de conformidade). |
| **Base legal** | **Art. 7º, I — consentimento** para os cookies/categorias não-necessárias. O próprio registro de auditoria apoia-se no art. 7º, II (dever de comprovação, art. 8º §1º). |
| Retenção | Enquanto durar a relação + prazo de comprovação; ver `ropa.md`. |
| Observações | `serverTs` é autoritativo e não pode ser antedatado pelo cliente (`src/lgpd.ts`). |

## Operação 3 — Logs de execução e redação (`/api/run`)

| Item | Descrição |
|------|-----------|
| Dados tratados | Código-fonte enviado, saída/headers/logs do worker convidado — que podem conter PII/segredos incidentais. |
| Finalidade | Operar o playground e prevenir vazamento de segredos/PII na saída. |
| **Base legal** | **Art. 7º, IX — legítimo interesse** (segurança da informação e operação do serviço), com minimização via redação automática (`src/compliance.ts`). |
| Retenção | Logs efêmeros; saída redigida antes de retornar ao cliente. |
| Observações | Segredos bloqueiam a execução; PII é redigida em todos os canais (corpo, headers, logs, erro). |

## Revisão

| Data | Responsável | Mudança |
|------|-------------|---------|
| _(preencher)_ | _(DPO)_ | Versão inicial. |
