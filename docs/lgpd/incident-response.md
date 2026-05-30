# Resposta a incidentes de segurança (LGPD art. 48)

Procedimento de detecção, contenção e notificação de incidentes envolvendo
dados pessoais. A LGPD (art. 48) exige comunicação à ANPD e ao titular em prazo
razoável quando o incidente puder acarretar risco ou dano relevante.

## 1. Detecção

Fontes de sinal (Cloudflare Observability / Logpush):

| Evento | Significado | Ação |
|--------|-------------|------|
| `lgpd.rights-request.secret-missing` / `lgpd.consent.secret-missing` | Endpoint exposto sem `LGPD_HASH_SECRET`. | Provisionar o segredo; investigar se houve submissões. |
| `lgpd.rights-request.details-unencrypted` | `details` gravado em claro (sem chave de cifra). | Provisionar `LGPD_KV_ENCRYPTION_KEY`; reavaliar registros já gravados. |
| `lgpd.<scope>.rate-limited` (volume anômalo) | Possível abuso/scraping. | Investigar origem; considerar bloqueio upstream. |
| `lgpd.<scope>.no-client-ip` (volume anômalo) | Possível bypass de proxy / má configuração. | Verificar topologia (Cloudflare Access / proxy). |
| Violação de compliance `block` em `/api/run` | Tentativa de injetar/colher segredo. | Revisar amostra (já redigida) e padrão. |

**Ação recomendada:** configurar alerta (Logpush → e-mail/Slack) sobre
`secret-missing`, `details-unencrypted` e picos de `rate-limited`.

## 2. Verificação de integridade

Cada `request:<id>` carrega um campo `integrity` (SHA-256 de
`id|requestType|nameHash|emailHash|receivedAt`). Um job periódico deve
recomputar e comparar; divergência indica adulteração → tratar como incidente.

## 3. Classificação e contenção

1. Confirmar o incidente e seu escopo (quais registros/titulares).
2. Conter: rotacionar segredos (`LGPD_HASH_SECRET`, `LGPD_KV_ENCRYPTION_KEY`),
   revogar acessos, isolar o binding KV se necessário.
3. Preservar evidências (logs, snapshots do KV).

## 4. Notificação (art. 48)

- **ANPD e titulares:** comunicar em prazo razoável (referência usual: **até 3
  dias úteis** a partir do conhecimento), quando houver risco/dano relevante.
- Conteúdo mínimo: natureza dos dados, titulares afetados, medidas técnicas,
  riscos e medidas de mitigação adotadas.
- Registrar a decisão de notificar/não notificar e a justificativa.

## 5. Contatos

| Papel | Nome | Contato |
|-------|------|---------|
| Encarregado (DPO) | _(preencher)_ | _(preencher)_ |
| Responsável técnico | _(preencher)_ | _(preencher)_ |
| Canal ANPD | — | https://www.gov.br/anpd |

## Revisão

| Data | Responsável | Mudança |
|------|-------------|---------|
| _(preencher)_ | _(DPO)_ | Versão inicial. |
