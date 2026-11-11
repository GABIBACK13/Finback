---
name: Cartão e pendente
overview: O cartão entra como uma conta ligada a um banco, com dia de fechamento e limite. Qualquer lançamento passa a ter situação pago ou pendente, com pago como padrão; pendente fica fora do saldo e, no cartão, consome o limite.
todos:
  - id: schema
    content: "Migração v7: kind, pai, dia, limite e paid"
    status: completed
  - id: worker
    content: CRUD do cartão, paid na gravação e saldo só do que está pago
    status: completed
  - id: ui
    content: Formulário do cartão, seletores e situação pago/pendente
    status: completed
  - id: verify
    content: Conferir saldo, limite e dashboard no navegador
    status: completed
isProject: false
---

# Cartão de crédito e lançamento pendente

O cartão é uma linha de `banks` com `kind = 'card'`. Assim o lançamento, a importação, a transferência e o filtro do início continuam usando `bank_id`, sem uma segunda conta no formulário.

## Esquema (versão 7)

Em [src/db/schema.sql](src/db/schema.sql) e em `src/db/migrate-v7.sql`, aplicado em `openSchema` quando a versão for menor que 7:

- `banks.kind` `bank` ou `card`, padrão `bank`.
- `banks.parent_bank_id` aponta para o banco do cartão.
- `banks.closing_day` de 1 a 31.
- `banks.limit_cents` maior ou igual a zero.
- `transactions.paid` inteiro 0 ou 1, padrão 1. Os lançamentos já gravados nascem pagos.

Conta comum deixa pai, dia e limite vazios. Cartão exige os três, e o pai tem de ser uma conta, nunca outro cartão. O `CHECK` cruzado fica no `schema.sql`; a migração só adiciona colunas, e o worker recusa o resto. Um comentário no schema registra por que o cartão mora em `banks`.

Excluir um banco que ainda tem cartão responde “Este banco ainda tem um cartão.” O cartão segue a mesma trava de lançamento, regra e histórico que o banco.

## Limite e saldo

O saldo de [listBanks](src/db/worker.ts) e todos os totais do dashboard (abertura, fluxo, classes, títulos, contas e transferências) passam a exigir `paid = 1`. O demonstrativo continua fora do saldo.

No cartão, o limite usado soma só o pendente: débito aumenta, crédito (estorno) diminui, transferência e demonstrativo não entram. Disponível é limite menos usado. O saldo do cartão continua sendo só o que já foi pago.

Pagar a fatura não é automático. O pagamento é um lançamento na conta (ou uma transferência da conta para o cartão) e os lançamentos do cartão são marcados como pagos, o que libera o limite e os faz entrar no saldo.

## Telas

[src/components/BanksPage.tsx](src/components/BanksPage.tsx) ganha a escolha Conta ou Cartão. No cartão, o formulário pede nome, banco, dia de fechamento e limite. A lista mostra, no cartão, o banco, “Fecha no dia N”, limite, usado, disponível e saldo. Dá para editar nome, banco, dia e limite. O tipo não muda depois de criar.

O seletor de conta em Início, Transações e Importar mostra o cartão como “Nome · Banco”.

Em [src/components/TransactionsPage.tsx](src/components/TransactionsPage.tsx) e na revisão de [src/components/ImportPage.tsx](src/components/ImportPage.tsx), cada lançamento tem Pago ou Pendente. O padrão é Pago, inclusive no rascunho importado. A lista marca “Pendente”. Gravação, edição e `importTransactions` persistem `paid`.

`CONTEXT.md` ganha uma frase no que já funciona. O próximo passo continua sendo padrões de PDF e Excel.

## Conferência

No navegador: criar um cartão, lançar um débito pendente e ver o saldo parado com o limite usado subindo; marcar como pago e ver o saldo mudar e o limite voltar. O mesmo débito pendente numa conta comum fica fora do saldo e do dashboard até ser pago.