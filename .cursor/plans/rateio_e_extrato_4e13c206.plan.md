---
name: Rateio e extrato
overview: A SPA já grava bancos, classes e lançamentos. Esta etapa acrescenta o filtro da classificação, o rateio do valor entre classes e a importação do extrato Sicredi em CSV, com revisão antes de gravar.
todos:
  - id: schema
    content: Migrar o esquema para scope, partes do rateio e identificador único por banco
    status: in_progress
  - id: split-ui
    content: Utilitário de rateio e filtro de classe no formulário e na tela de classes
    status: pending
  - id: sicredi
    content: Serviço do CSV Sicredi e motor de sugestão por título
    status: pending
  - id: import-ui
    content: Página de revisão com abas, lista, um a um e finalizar
    status: pending
  - id: verify
    content: Conferir no navegador rateio, filtro, importação, duplicata e persistência; atualizar CONTEXT.md
    status: pending
isProject: false
---

# Rateio e extrato

A SPA em [`src/`](src/) continua a fonte. Débito, crédito, transferência e demonstrativo seguem iguais no saldo. O que muda é a classificação, o vínculo com a classe e a entrada por extrato.

A execução continua em [`AGENTS.md`](AGENTS.md): SQL só em [`src/db/`](src/db/), tela chama hook, hook chama o client. O caso real de extrato libera [`src/services/statements/`](src/services/statements/) só para leitura de arquivo e sugestão de classificação, sem SQL. Atualizar essa frase no `AGENTS.md`. PDF e Excel aparecem no seletor, mas esta entrega só implementa CSV no padrão Sicredi.

## Classificação por tipo

Em `classes`, `scope` nulo ou `debit`, `credit`, `transfer`. Nulo aparece em todo lançamento. Débito só no débito, crédito só no crédito, transferência só na transferência. Demonstrativo lista todas, com ou sem scope. A subclasse segue a classe, sem scope próprio.

Na tela de classes, o campo é "Aparece em": Todos, Débito, Crédito, Transferência. Trocar o scope não reescreve lançamento antigo. No seletor, a classe já gravada continua visível mesmo que o filtro novo a escondesse.

## Rateio

O lançamento deixa de ter uma classe só. Nova tabela de partes, cada uma com classe obrigatória, subclasse opcional e valor em centavos. Sem partes, o lançamento fica sem classificação. Com partes, a soma tem de ser igual ao valor do lançamento. Apagar o lançamento apaga as partes. Apagar classe ou subclasse usada continua recusado.

[`src/lib/split.ts`](src/lib/split.ts) é o utilitário: resto em relação ao total, e a mesma proporção aplicada a outro total, com a diferença de arredondamento no último pedaço. [`src/components/SplitEditor.tsx`](src/components/SplitEditor.tsx) usa esse utilitário no formulário e na revisão do extrato: incluir linha, completar o restante, mostrar quanto falta ou quanto passou.

## Migração

[`src/db/schema.sql`](src/db/schema.sql) passa a ser o esquema completo da versão 2, usado só quando ainda não há `schema_migrations`. O worker hoje executa esse arquivo em todo abertura; isso não pode carimbar a versão 2 por cima de um banco já criado. Banco na versão 1 sobe por [`src/db/migrate-v2.sql`](src/db/migrate-v2.sql): coluna `scope`, coluna `external_id`, tabela de partes, uma parte para cada lançamento que já tinha classe, remoção da classe solta na tabela de lançamentos. Identificador único por banco: `UNIQUE (bank_id, external_id)`. Lançamento manual fica com identificador nulo, e o SQLite aceita vários nulos.

## Extrato Sicredi

Na tela de transações, "Importar extrato" abre [`src/components/ImportPage.tsx`](src/components/ImportPage.tsx). Antes do arquivo: banco, formato (PDF, CSV, Excel) e padrão. CSV oferece Padrão Sicredi. PDF e Excel avisam que ainda não há padrão.

O CSV é `;`, com cabeçalho `Data;Descricao;CodTransacao;Identificador;Tipo;Valor;Saldo`.

- Data `DD/MM/AAAA` vira a data do lançamento.
- `Descricao` vira o título.
- `Identificador` é o identificador único naquele banco. `CodTransacao` não é gravado.
- `CREDITO` e `DEBITO` viram crédito e débito. Outro tipo entra sinalizado para a pessoa escolher; não vira transferência nem demonstrativo sozinho.
- `Valor` entra pelo módulo, com `R$` e sinal. A leitura assinada fica em [`src/lib/money.ts`](src/lib/money.ts), sem mudar o campo manual, que continua positivo.
- `Saldo` vira a descrição inicial `Saldo após o lançamento: R$ …` e também aparece na revisão como "Saldo no extrato", para continuar visível se a descrição for trocada.
- Linha sem identificador nasce ignorada e não sai dessa seção.

O parser é [`src/services/statements/sicredi-csv.ts`](src/services/statements/sicredi-csv.ts). O hook [`src/hooks/useStatementImport.ts`](src/hooks/useStatementImport.ts) lê o arquivo, compara com o banco e só grava no finalizar.

## Revisão

A revisão fica na memória até finalizar. Duas abas: A revisar e Ignorados. Identificador que já existe naquele banco nasce em Ignorados. Qualquer linha pode ir para lá; dá para trazê-la de volta. Trazer um duplicado não cria outro lançamento: ao finalizar, ele volta para Ignorados com o aviso.

Dois modos. A listagem mostra todas as linhas da aba; clicar numa linha abre o modo um a um naquele ponto. Um a um tem anterior e próximo. Próximo marca a linha atual como feita e avança. O indicador de feito também pode ser ligado na listagem. Dá para editar tipo, título, descrição, observação e o rateio. O banco não muda. Transferência pede o banco de destino nessa linha.

O motor em [`src/services/statements/classify.ts`](src/services/statements/classify.ts) olha o título, sem diferença de maiúsculas, no mesmo banco. A fonte é uma linha já classificada nesta importação ou, se não houver, o lançamento salvo mais recente com esse título. Copia a descrição e as partes, reescaladas pelo utilitário para o valor novo. Não mexe em linha que a pessoa já editou.

Finalizar grava, numa transação só, as linhas feitas e fora de Ignorados. As outras ficam de fora. O botão mostra a quantidade. Se uma falha, nada dessa finalização é gravado.

## Memória

No fim, [`CONTEXT.md`](CONTEXT.md) atualiza só o que funciona, o ponteiro para [`src/db/schema.sql`](src/db/schema.sql) e o próximo passo: padrões de PDF e Excel. Sem copiar SQL.
