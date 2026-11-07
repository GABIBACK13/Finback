---
name: grill-me
description: Entrevista uma ideia nova, uma pergunta por vez, antes de qualquer código. Use somente quando o usuário invocar /grill-me, grill-me, ou pedir para questionar um plano ou desenho ainda não fechado.
disable-model-invocation: true
---

# Grill-me

Entrevista para afiar uma ideia nova. Não serve para segurar o MVP já especificado em `AGENTS.md`, `CONTEXT.md` e `.cursor/plans/finback_spa_local_dad978ce.plan.md`.

## Como conduzir

1. Leia `AGENTS.md` e `CONTEXT.md`. Não reabra decisão que esses arquivos já fecharam, a menos que o usuário diga que quer mudá-la.
2. Não edite arquivo, não proponha diff e não escreva plano. A saída desta sessão é a conversa.
3. Uma pergunta por vez, em português. Espere a resposta antes da próxima.
4. Pergunte só o que ainda impede uma decisão. Se o código ou o `CONTEXT.md` já respondem, não pergunte.
5. Pare quando der para decidir em uma frase. Diga essa frase e o que ficou de fora. Aí encerre.

Se o usuário disser que não sabe, registre isso e siga. Não chute a resposta por ele.
