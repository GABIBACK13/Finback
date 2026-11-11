# FinBack

## O que funciona

Bancos, classes com filtro por tipo, lançamentos com rateio e importação do CSV Sicredi e do CSV Minhas Finanças (débitos, créditos e transferências). No rateio, a primeira classe já entra com o total e se ajusta sozinha. Dá para cadastrar classe e subclasse no lançamento. A descrição sugere textos parecidos do mesmo tipo e copia a classe. A revisão do extrato começa na data mais antiga, mostra a data de cada lançamento e aceita transferência de crédito, com o banco de origem. O saldo do arquivo vai para a observação. Regras de importação, iguais ou com `%`, classificam o extrato ou impedem a inferência. Ao abrir o arquivo, regras e o histórico do banco já inferem a classificação. As inferidas ficam na própria aba e podem ser marcadas todas como feitas. Na importação Minhas Finanças, o De-Para inicial mapeia ou cria contas, cartões e categorias, salva os mapeamentos no banco para reutilização automática em importações futuras, e exibe indicadores visuais de status (mapeamento salvo, nome idêntico, manual ou pendente) e contadores por seção. A revisão separa contas e cartões com marcação em lote por seção. Cada finalização fica no histórico e pode ser revertida ou apagada. O início resume saldo, entradas, saídas e classes, com um banco ou todos juntos. Cartão de crédito vinculado a uma conta, com dia de fechamento e limite; lançamentos pagos ou pendentes, onde pendentes consomem o limite no cartão e itens pagos debitam diretamente do saldo da conta bancária vinculada. Em Bancos e Cartões, clicar no banco ou cartão abre suas movimentações filtradas em Transações, com controle de visualização de compras dos cartões vinculados.

## Decisões fechadas

- Lançamento: débito, crédito, transferência e demonstrativo. Só os três primeiros mexem no saldo. Demonstrativo fica de fora.
- Uma conexão por origem. A segunda aba avisa que o FinBack já está aberto.
- OPFS no worker, pool `finback`, diretório `.finback`, arquivo `/finback.sqlite3`. Se o OPFS não abrir, a tela mostra o erro e não grava nada.
- Dinheiro em centavos, moeda BRL, data civil `YYYY-MM-DD`.

## Banco

A fonte da verdade é `src/db/schema.sql`.

## Próximo passo

Padrões de PDF e Excel.
