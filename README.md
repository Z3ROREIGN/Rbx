# Best Robux

Loja web com catálogo, personalização de quantidade, contas de cliente, pedidos e checkout PIX.

## Estrutura

- `index.html` — vitrine e catálogo
- `auth.html` — login e cadastro
- `account.html` — área do cliente e histórico
- `api/config.js` — entrega somente as configurações públicas do Supabase
- `api/create-payment.js` — cria pedido e cobrança no servidor
- `api/webhook.js` — recebe eventos e confirma o status da transação
- `api/health.js` — health check
- `supabase/schema.sql` — tabelas, RLS e triggers
- `vercel.json` — headers de segurança
- `.env.example` — modelo das variáveis

## Variáveis de ambiente

Configure na hospedagem, nunca no frontend:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
MISTICPAY_CLIENT_ID
MISTICPAY_CLIENT_SECRET
MISTICPAY_WEBHOOK_URL
SITE_URL
```

A `SUPABASE_SERVICE_ROLE_KEY` e a `MISTICPAY_CLIENT_SECRET` são exclusivamente de servidor.

## Supabase

Execute `supabase/schema.sql` no SQL Editor do projeto antes de testar a área de cliente.

Ative confirmação de e-mail no Auth se quiser exigir validação da conta.

## Deploy

O projeto usa funções serverless em `api/`, portanto deve ser hospedado em uma plataforma que execute essas funções. Depois do deploy, configure as variáveis de ambiente e use a URL pública da função `/api/webhook` como webhook da conta de pagamentos.

## Fluxo

1. Cliente cria uma conta ou entra.
2. Seleciona quantidade e modalidade.
3. O servidor recalcula o valor.
4. O servidor cria a cobrança.
5. O pedido é salvo no banco.
6. O cliente recebe o QR Code e o copia-e-cola.
7. O webhook recebe a alteração.
8. O servidor consulta a transação para confirmar o estado.
9. O histórico da conta é atualizado.
