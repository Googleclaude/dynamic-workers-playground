# Transferência internacional de dados (LGPD arts. 33–36)

Avaliação da exposição a tratamento fora do Brasil e das salvaguardas
aplicáveis.

## 1. Exposição

O sistema roda em **Cloudflare Workers** e persiste em **Workers KV** e
**Durable Objects** — infraestrutura distribuída globalmente. Por padrão, dados
pessoais podem ser processados/armazenados **fora do território nacional**, o
que caracteriza transferência internacional (art. 33).

Adicionalmente, `/api/github` faz `fetch` a `api.github.com` /
`raw.githubusercontent.com` (EUA), porém transfere **apenas código-fonte
público**, não dados pessoais de titulares.

## 2. Salvaguardas possíveis (art. 33)

| Opção | Descrição | Aplicabilidade |
|-------|-----------|----------------|
| **Data Localization Suite / Regional Services (BR)** | Restringe processamento e chaves a data centers no Brasil. | **Recomendado.** Requer plano Cloudflare compatível; configurar região `br` para Workers/KV. |
| Cláusulas-padrão contratuais (art. 33, II) | Garantias contratuais com o operador. | Alternativa/complemento. |
| Consentimento específico (art. 33, VIII) | Titular consente com a transferência. | Pouco prático para o fluxo atual. |

## 3. Situação atual e ação corretiva

- **Status:** Parcialmente conforme — há transferência sem salvaguarda formal
  configurada no `wrangler.jsonc`.
- **Ação corretiva (prioridade média):**
  1. Avaliar custo/viabilidade da Data Localization Suite.
  2. Se adotada, documentar a configuração regional e referenciá-la na ROPA.
  3. Se não adotada, formalizar cláusulas-padrão e registrar a decisão aqui,
     com avaliação de adequação do país de destino.

## 4. Pseudonimização como mitigação

Mesmo sem localização regional, os identificadores transferidos/armazenados
estão pseudonimizados (HMAC) e o `details` pode ser cifrado em repouso, o que
reduz — mas não elimina — o risco da transferência.

## Revisão

| Data | Responsável | Mudança |
|------|-------------|---------|
| _(preencher)_ | _(DPO)_ | Versão inicial. |
