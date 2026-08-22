# BestRobux Mobile

Aplicativo Android do BestRobux usando o **mesmo Supabase do site**.

## Rodar

```bash
cd mobile
npm install
npx expo start
```

Para Android, abra pelo Expo Go ou gere um build Android com EAS.

O app busca `SUPABASE_URL` e `SUPABASE_ANON_KEY` pelo endpoint público `/api/config` do site, então não duplica banco nem credenciais privadas.

## Próximas telas

- Login/cadastro
- Checkout
- Pedidos
- Conta/perfil
- Notificações
- Conversas
- Área administrativa conforme o cargo
