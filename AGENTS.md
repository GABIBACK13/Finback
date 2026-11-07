# FinBack

SPA de finanças pessoais, só no navegador. Vite, React, TypeScript, Tailwind e React Router. SQLite WASM `@sqlite.org/sqlite-wasm`, VFS `opfs-sahpool`, conexão só no worker. Sem servidor e sem banco em memória. Valores em centavos, moeda BRL, textos da interface em português.

## Pastas

- `src/components/` — tela e classes Tailwind no mesmo arquivo.
- `src/db/` — worker, client RPC e schema. SQL só aqui.
- `src/hooks/` — a UI fala com o client por aqui.
- `src/lib/` — função pura (dinheiro, data, rateio). Criar só quando houver uma.
- `src/services/statements/` — leitura de extrato e sugestão de classificação. Sem SQL.
- `App.tsx` — junta as rotas.

## Proibido

SQL em componente. Segunda conexão com o banco. Fallback em memória se o OPFS falhar. Pasta `src/database/`. Fora de `src/services/statements/`, não criar `src/services/`.

## Memória entre sessões

No começo de uma sessão que continua o produto, ler `CONTEXT.md`. Ao fim de uma etapa (esquema, tela ou persistência), atualizar só três blocos: o que funciona, o ponteiro para o schema e o próximo passo. Não copiar SQL para lá. Quando `src/db/schema.sql` existir, ele é a fonte da verdade.

## Comentários

Comentário explica decisão que o código não mostra. `// executa o SQL` não entra. O caso típico é o OPFS e o worker.
