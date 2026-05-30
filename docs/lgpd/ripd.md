# Relatório de Impacto à Proteção de Dados — RIPD (LGPD art. 38)

Avaliação de impacto das operações de tratamento. Revisar trimestralmente ou a
cada mudança significativa.

## 1. Necessidade e proporcionalidade

- **Minimização.** Identificadores diretos nunca são persistidos em claro:
  o cliente envia SHA-256, o servidor re-HMAC com `LGPD_HASH_SECRET`
  (`src/lgpd.ts`, `src/hashing.ts`). CPF é opcional. IP/UA são truncados a 16
  hex. O campo `cpfLast2` foi removido.
- **Finalidade.** Cada operação tem finalidade declarada em `bases-legais.md`.

## 2. Riscos identificados e tratamento

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|---------------|---------|-----------|
| 1 | Exfiltração do KV expõe identificadores | Baixa | Médio | HMAC com segredo separado; rainbow table inviável sem o segredo. |
| 2 | `details` contém dado pessoal/sensível em texto livre | Média | Alto | AES-256-GCM em repouso quando `LGPD_KV_ENCRYPTION_KEY` está setado; **ação:** tornar a chave obrigatória em produção e orientar o titular a não inserir dados sensíveis. |
| 3 | Submissão não autenticada (qualquer um abre pedido por terceiros) | Média | Médio | Gate de origem + rate-limit; **depende** de Cloudflare Access à frente (ver README). Resíduo aceito apenas atrás de auth upstream. |
| 4 | Antedatação de consentimento | Baixa | Médio | `serverTs` autoritativo (não controlável pelo cliente). |
| 5 | Vazamento de segredo/PII na saída do worker | Média | Alto | Scanner de compliance bloqueia segredos e redige PII em todos os canais, incluindo logs e stack traces. |
| 6 | Exaustão de recurso / DoS | Média | Médio | Limite de corpo por streaming (não burlável por chunked encoding); rate-limit com limpeza por alarm. |

## 3. Riscos residuais

- **R3** depende de configuração de implantação (Cloudflare Access). Sem ela, o
  resíduo é alto — documentado e sinalizado no README e em `setup-lgpd.sh`.
- **Transferência internacional** (arts. 33–36): ver `transferencia-internacional.md`.

## 4. Direitos do titular (art. 18)

Os nove tipos do art. 18 são aceitos (`RIGHTS_REQUEST_TYPES`). O sistema
**recebe** e protocola; o **atendimento** (resposta em até 15 dias, art. 19) é
processo manual/operacional a ser definido pelo controlador. **Ação:** definir
SLA e fluxo de fulfillment (`received` → `in-progress` → `fulfilled`).

## Revisão

| Data | Responsável | Mudança |
|------|-------------|---------|
| _(preencher)_ | _(DPO)_ | Versão inicial. |
