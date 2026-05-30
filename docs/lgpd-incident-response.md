# LGPD — Playbook de Resposta a Incidentes

**Audit ref:** L-02 (audit 2026-05-24)
**Última revisão:** 2026-05-24
**Base normativa:** Lei 13.709/2018, art. 48; Resolução CD/ANPD nº 15/2024

O art. 48 obriga o controlador a comunicar à ANPD e aos titulares afetados qualquer incidente de segurança que possa acarretar risco ou dano relevante. Este playbook define detecção, classificação, contenção e notificação.

## 1. Detecção

### 1.1 Sinais automatizados (instrumentados no código)

O Worker emite eventos estruturados de alta severidade via `reportSecurityEvent` (ver `src/security-events.ts`). Cada evento sai como `console.error` com `kind: "security-alert"` e é captável por **Cloudflare Logpush** ou **Workers Analytics Engine**.

| Sinal | Evento | O que pode indicar |
|---|---|---|
| Secret detectado em código submetido | `security-alert` · `secret-in-source` | Vazamento de credencial de um usuário; tentativa de exfiltração |
| Pico de payloads bloqueados por compliance | threshold de `secret-in-source` | Abuso automatizado / scraping de secrets |
| Rajada de falhas de validação nos endpoints LGPD | `security-alert` · `lgpd-validation-burst` | Tentativa de enumeração / ataque |
| Falha de origin (CSRF) repetida | `security-alert` · `forbidden-origin-burst` | Tentativa de CSRF |

### 1.2 Regra de threshold (configurar no Logpush/Analytics)

A agregação por janela **não** é feita dentro do Worker (evita estado/DO desnecessário). Configure no destino de logs:

```
ALERTA se count(kind="security-alert") > 10 em janela de 5 min
  → notificar canal de plantão (PagerDuty / Slack / email do DPO)
```

### 1.3 Webhook opcional (tempo real)

Se a env var `LGPD_ALERT_WEBHOOK` estiver definida (`wrangler secret put LGPD_ALERT_WEBHOOK`), cada `security-alert` dispara um POST imediato com o payload do evento (já pseudonimizado — só hashes). Use para integração direta com Slack/PagerDuty sem esperar o Logpush.

## 2. Classificação de severidade

| Nível | Critério | SLA de notificação |
|---|---|---|
| **Grave** | Vazamento confirmado de dado de titular reidentificável (ex: `LGPD_HASH_SECRET` comprometido + KV exfiltrado) | ANPD em **2 dias úteis**; titulares afetados em prazo razoável |
| **Médio** | Acesso indevido a dado pseudonimizado (KV sem o secret) | Avaliação interna; comunicação se risco relevante |
| **Baixo** | Tentativa bloqueada (compliance/rate-limit/origin) sem vazamento | Registro interno; sem notificação externa |

> Pseudonimização HMAC rebaixa a maioria dos incidentes de KV para **Médio** — o dado vazado não é reidentificável sem o segredo, que vive fora do KV.

## 3. Contenção

1. **Rotacionar `LGPD_HASH_SECRET`** se houver suspeita de comprometimento: `wrangler secret put LGPD_HASH_SECRET`. Nota: rotacionar invalida o matching de hashes antigos — documentar no registro do incidente.
2. **Revogar tokens admin** (`LGPD_ADMIN_TOKEN`) se o vetor for o endpoint admin.
3. **Bloquear no Cloudflare Access / WAF** se houver IP/ASN de origem identificável.
4. **Purgar KV** se dado indevido foi gravado: `wrangler kv key delete`.

## 4. Notificação à ANPD (Resolução 15/2024)

Comunicar em até **2 dias úteis** da ciência do incidente grave, contendo:

- Descrição da natureza dos dados afetados
- Número aproximado de titulares
- Medidas técnicas de proteção (informar que dados estavam pseudonimizados com HMAC, se aplicável)
- Riscos relacionados ao incidente
- Medidas adotadas/propostas para reverter ou mitigar

Canal: peticionamento eletrônico no site da ANPD (gov.br/anpd).

## 5. Notificação aos titulares

Quando o risco for relevante, comunicar diretamente. Como só armazenamos `emailHash` (HMAC, não reversível), a notificação direta por email **não é possível a partir do KV** — exige:

1. Aviso público no playground (banner) e/ou na página de privacidade
2. Se o titular tiver protocolo aberto, anexar a comunicação ao protocolo

> **Limitação de design assumida:** a pseudonimização que protege em repouso impede a notificação direta. Esse trade-off é aceito — a alternativa (guardar email em claro para poder notificar) aumentaria o risco do próprio dado que se quer proteger.

## 6. Registro pós-incidente (art. 37 + accountability)

Todo incidente, independentemente de severidade, é registrado com: timestamp, sinais que dispararam, classificação, ações de contenção, decisão de notificação (e justificativa se não notificou), responsável. Reter por 5 anos.

## 7. Teste do playbook

- Simular `security-alert` em staging (submeter código com `AKIA...` fake) e confirmar que o evento aparece no Logpush e dispara o webhook.
- Exercício de mesa semestral do fluxo de notificação à ANPD.

## Histórico de revisões

| Data | Mudança |
|---|---|
| 2026-05-24 | Documento inicial (L-02 audit fix) |
