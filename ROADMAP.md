# Roadmap — GymNotes

> Estado: rascunho vivo. Atualizado em 21/07/2026.
> Este documento existe para uma coisa: decidir **o que perguntar no onboarding** e
> **por quê**, ligando cada dado coletado a uma capacidade futura concreta.

---

## 1. A estratégia do onboarding

O onboarding é **deliberadamente longo**, e isso não é acidente:

1. **Demonstra valor antes de cobrar.** Cada pergunta respondida devolve algo visível — o dock enchendo, as metas aparecendo coloridas no fim.
2. **Investimento acumulado antes do paywall.** Quem chegou até o fim pensa "já vim até aqui" na hora de assinar.
3. **É a única janela em que perguntar é natural.** Depois do onboarding, toda pergunta vira fricção. Aqui, é o produto.

O contrapeso honesto: **pergunta sem consumidor é imposto cobrado do usuário.** A regra deste documento é que todo dado coletado aparece na tabela da seção 4 com o que vai consumi-lo — mesmo que esse consumidor ainda não exista, ele precisa estar nomeado e datado.

---

## 2. O que já é coletado

Onboarding atual: 10 perguntas, todas de dieta.

| Campo | Consumidor hoje |
|---|---|
| `gender`, `birthDate`, `heightCm`, `weightKg` | `buildOnboardingSummary` → Harris-Benedict → BMR |
| `goalWeightKg`, `goalDate` | `calorieAdjustment`, e única entrada de proteína/gordura |
| `activity` | `activityMultiplier` → TDEE |
| `considerations` | `athlete` +180 kcal · `strength` proteína 1.6→1.8 g/kg · `endurance` carbo +28 |
| `notes` | texto livre no prompt da IA de comida |
| `micronutrients` | linhas de açúcar/fibra/sódio no `FoodGoalsSheet` |
| `estimationBias` | ±120 kcal no alvo diário |

---

## 3. As três lacunas estruturais

Levantadas por auditoria do código, não por intuição.

### 3.1 O treino não sabe nada sobre o usuário

Zero referências a `onboardingProfile` em todo o domínio de treino.

### 3.2 A IA de treino roda cega — e são três portões, não um

| Portão | Onde |
|---|---|
| `userContext` só é buscado para comida | `src/core/command/CommandBus.ts:166` |
| O enrich de treino passa `userContext: undefined` literal | `src/core/command/CommandBus.ts:249` |
| A instrução de sistema sobre contexto só entra se `domain === 'food'` | `src/core/enrich/deepseek.ts:192` |
| O bloco de contexto idem | `src/core/enrich/deepseek.ts:204` |

Pior: o modelo recebe **só a primeira linha não-vazia** da nota (`getWorkoutExerciseLine`), e se ela parsear como série, vem despida das métricas por `stripWorkoutMetrics`. Ele nunca vê o treino inteiro.

**Atenção ao ligar:** `userContext` entra no `hashKey` do cache (`CommandBus.ts:171-174`). Ligar isso invalida todo cache de treino existente.

### 3.3 As pontes dieta↔treino são de mão única

As três pontes que existem (`activity`, `considerations`, e o cálculo de proteína) vão sempre de **declaração → dieta**. Nenhuma lê o log de treino real.

Consequências concretas:

- Quem declarou "moderado" e treinou 6x na semana come igual a quem não treinou
- O cardio registrado (distância, duração) não entra em lugar nenhum do cálculo calórico
- A proteína é calculada sobre o peso-meta, ignorando o volume realmente levantado
- Dia de treino e dia de descanso têm o mesmo alvo

---

## 4. O que coletar, e para quê

Ordenado por quando o consumidor existe.

### Fase A — dados que um consumidor atual usaria

| Dado | Pergunta | Consumidor |
|---|---|---|
| `weightUnit` | kg ou lb? | `parseWorkoutText` infere hoje por heurística; declarado elimina ambiguidade |
| `trainingLevel` | iniciante / intermediário / avançado | Contexto da IA de treino (depois de abrir os 3 portões) · limiares do monitor |
| `workoutGoal` | hipertrofia / força / resistência / emagrecer | Prompt de treino · e é a ponte que falta para a dieta variar com o objetivo |

### Fase B — dados para a IA que monta treino

> Depende de: portões da 3.2 abertos.

| Dado | Por quê |
|---|---|
| `environment` | academia completa / academia básica / casa / ao ar livre |
| `equipment[]` | o que existe de verdade — halteres, barra, máquinas, elásticos, kettlebell |
| `sportsLiked[]` | esportes e modalidades que a pessoa gosta |
| `exercisesDisliked[]` | o que ela se recusa a fazer |
| `injuries[]` / `conditions[]` | dores, lesões, condições — **restrição dura, nunca sugestão** |

### Fase C — dados para a IA que monta dieta

| Dado | Por quê |
|---|---|
| `foodsLiked[]` / `foodsDisliked[]` | receita que a pessoa não come é receita não feita |
| `restrictions[]` | alergias e intolerâncias — restrição dura |
| `cookingSkill` / `cookingMinutes` | receita de 40min para quem tem 10 é inútil |
| `budget` | faixa de gasto com comida |

### Fase D — geladeira virtual

Nada aqui é formulário. A pessoa já escreve notas de dieta; passa a escrever compras
no mesmo lugar, com as mesmas palavras que usaria:

```
"comprei banana"                          → item na geladeira
"comprei meio quilo de patinho por 30"    → item + preço + preço/kg derivado
```

| Dado | Origem |
|---|---|
| `pantry[]` | extraído das notas de compra |
| preço unitário e por kg | dito pela pessoa na própria nota |
| histórico de preço | acumulado a cada compra repetida |

**Bloqueio conhecido:** hoje só existem dois intents, `parse` e `foodEdit`
(`src/core/enrich/types.ts:53`). Uma nota "comprei meio quilo de patinho" é
interpretada como comida **ingerida** e soma ~1100 kcal ao dia. Antes de qualquer
geladeira é preciso um intent `purchase` que separe comprar de comer.

Ninguém digita preço duas vezes: o preço/kg da compra passada vira a estimativa
da próxima, e o app sugere o que comprar já com custo previsto.

---

## 4b. As duas capacidades que tudo isso destrava

### Receita a partir do que já existe em casa

```
"me dá uma receita com patinho"
```

O app monta a refeição, adiciona como nota, e ao tocar nas calorias o detalhe
nutricional traz a **receita completa passo a passo** — já calculada, usando o
que está na geladeira, e listando à parte o que falta comprar com custo estimado
do histórico.

Reusa o que existe: `food.entryDetail` já é o modal do detalhe nutricional, e
`FoodNutritionEditSheet` já edita item a item. A receita entra como mais um
bloco nesse detalhe.

### Treino montado com a realidade da pessoa

```
"monte um treino full body pra hoje"
```

Considera, em ordem de dureza:

1. **Restrições** — dores, lesões, condições. Nunca sugere o que machuca.
2. **Realidade física** — local de treino e aparelhos que existem de verdade.
3. **Histórico** — cargas e repetições que ela já registrou, direto do log.
4. **Preferência** — o que ela gosta e o que se recusa a fazer.
5. **Objetivo** — hipertrofia, força, resistência.

O ponto é o acúmulo: quanto mais a pessoa usa, menos ela precisa dizer. Carga,
progressão, exercícios preferidos e frequência real **saem do log**, não de
pergunta.

## 4c. A camada de ferramentas — a IA que age no app

O objetivo: a pessoa escreve em linguagem natural e o app **faz**.

```
"me dá uma receita com o que tem na geladeira"
"uma receita com patinho, mais leve que a de ontem"
"monte um treino full body pra hoje"
"monte meu treino da semana inteira"
```

O modelo devolve **comando + dados**; o app valida e executa. É um chat que
opera o app, não um chat que responde sobre o app.

### O que já existe (a metade fácil)

| Peça | Onde |
|---|---|
| Execução reversível | `Command` (`execute`/`undo`) + pilha de undo no `CommandBus` |
| Saída estruturada da IA | `deepseek.ts:84` já usa `response_format: json_object` |
| Validação de fronteira | `schemaByDomain` valida a resposta do modelo com zod antes de aplicar |
| Idempotência e cache | `hashKey` + LRU, dedupe de chamadas em voo |

**A ferramenta não é subsistema novo — é a generalização do `enrich`.** Hoje o
enrich é uma ferramenta única e fixa ("interprete esta nota"). Ferramentas são a
mesma mecânica com um contrato aberto.

### O que falta (a metade que dá trabalho)

**1. Comandos não são endereçáveis.** `Command` tem três membros: `label`,
`execute`, `undo`. Existem exatamente três implementações (`AddEntryCommand`,
`DeleteEntryCommand`, `EditEntryCommand`), e cada uma recebe no construtor um
objeto **já montado** pelo chamador. Não há nome, não há registro, não há schema
de argumento. O modelo não tem o que endereçar.

Falta: um registro `nome → { schema zod, construir(args) }`. O schema serve
duas vezes — descreve a ferramenta para o modelo e valida a resposta dele.

**2. Não dá para escrever em outro dia.** `bus.addEntry` carimba
`date: store.getDay(domain).date` (`CommandBus.ts:103`) — sempre o dia visível.
"Treino da semana toda" precisa gravar em 7 datas. Correção pequena: um parâmetro
`date` opcional. O SQLite já aceita (o `repo.insert` grava qualquer data); só o
store descarta o que não é do dia visível (`useAppStore.ts:95`), o que está certo
para exibição.

**3. Undo vira 7 toques.** Um plano semanal empilha 7 comandos. O usuário desfaz
um e sobram 6. Falta um `CompositeCommand` — que é o padrão clássico e cabe na
interface atual sem mudá-la:

```
execute() → executa os filhos em ordem
undo()    → desfaz em ordem inversa
label     → "Plano da semana"
```

**4. Nada lê o histórico para responder.** "mais leve que a de ontem" e "com o que
tem na geladeira" exigem uma ferramenta de **leitura** antes da de escrita. Hoje o
modelo só recebe o texto da nota — ele nunca consulta nada.

### Ordem natural

| | |
|---|---|
| 1 | `CompositeCommand` — desbloqueia qualquer ação multi-passo, e é o menor pedaço |
| 2 | `date` opcional no `addEntry` |
| 3 | Registro de comandos com schema zod |
| 4 | Ferramentas de leitura (geladeira, histórico, log de treino) |
| 5 | Loop de ferramentas no `enrich`: modelo pede leitura → app responde → modelo devolve escrita |

O passo 5 é o único que muda o formato da conversa com o provedor. Os quatro
primeiros são refatoração interna e valem por si só, mesmo sem IA nenhuma.

---

## 5. O que fica de fora, e por quê

| Não perguntar | Motivo |
|---|---|
| Divisão de treino (ABC, push/pull) | **Inferível** do histórico de notas em 2 semanas |
| Que dias da semana treina | **Inferível** — as datas das notas já dizem |
| Tempo por sessão | **Inferível** — do primeiro ao último registro do dia |
| Exercícios favoritos | **Inferível** — `SavedExerciseRepository` já registra o que se repete |
| Frequência real | **Inferível** — `currentStreak` e o log já sabem |
| `micronutrientTargets` (valores) | Nunca foi coletado em canto nenhum; defaults servem |
| Foto/medidas corporais | Alto atrito, nenhum consumidor planejado |

**Regra:** dado inferível do uso não vira pergunta. O app descobre sozinho e acerta mais que a memória da pessoa.

---

## 5b. Privacidade — e o limite honesto da frase

O dado do usuário **fica no aparelho dele**. Não existe servidor nosso guardando
perfil, notas, geladeira ou histórico: tudo vive no SQLite local
(`src/data/db.ts`). Isso é raro na categoria e vale ser dito.

**Mas há um limite que não pode ser omitido na comunicação.** Interpretar uma nota
exige um modelo de linguagem, e esse modelo roda na DeepSeek
(`src/core/enrich/deepseek.ts:23`). O texto da nota — o que a pessoa comeu, o que
treinou, e futuramente as dores e condições que ela declarar — **sai do aparelho**
nessa chamada.

| Afirmação | Verdadeira? |
|---|---|
| "Seus dados ficam no seu aparelho" | Sim — armazenamento é 100% local |
| "Não temos servidor" | Sim, hoje — o proxy `/api/enrich` não está deployado |
| "Nada sai do seu aparelho" | **Não.** O texto da nota vai para a DeepSeek |
| "Não guardamos seus dados" | Sim — nós não. A política de retenção do provedor é outra história |

O que a comunicação pode dizer sem mentir: *armazenamento local, nenhuma conta,
nenhum servidor nosso; o texto que você escreve é enviado à IA para ser
interpretado.* Com chave própria, é a chave **do usuário** falando com o provedor
dele — o que fortalece o argumento em vez de enfraquecer.

Consequências de projeto:

- Dor, lesão e condição são **dado de saúde**. Se forem para o prompt, isso precisa
  estar explícito na tela em que forem coletados, não enterrado numa política.
- Vale avaliar um modo "sem IA" para quem não quiser enviar nada: o parser local de
  treino já resolve 100% offline, e código de barras + edição manual cobrem a dieta.
- Se um dia existir inferência local no dispositivo, a frase "nada sai daqui" passa
  a ser verdadeira — e aí vira o diferencial de verdade.

---

## 6. Ordem de implementação

| Fase | Entrega | Depende de |
|---|---|---|
| 0 | Abrir os 3 portões da IA de treino + mandar a nota inteira, não só a 1ª linha | — |
| 1 | Fase A de coleta (4 perguntas) | — |
| 2 | Ponte treino→dieta: alvo calórico varia por dia treinado | Fase 1 |
| 3 | Fase B de coleta + IA que monta treino | Fase 0 |
| 4 | Fase C de coleta + IA que monta dieta | Fase 3 |
| 5 | Intent `purchase` — separar comprar de comer | — |
| 6 | Geladeira virtual + preços a partir das notas | Fase 5 |
| 7 | Receita no detalhe nutricional, com o que há em casa | Fases 4 e 6 |
| 8 | "monte um treino pra hoje" lendo restrições, aparelhos e log | Fases 0 e 3 |

**Paywall** entra depois da tela de metas, no fim do onboarding.

---

## 7. Riscos assumidos

- **Onboarding longo aumenta abandono.** A aposta é que quem abandona não converteria. Precisa de medição, não de fé.
- **Dado coletado e nunca usado é dívida** — e pior, é dado pessoal guardado sem propósito. Toda fase acima tem prazo; o que não for consumido até lá sai do onboarding.
- **Lesões e condições são dado de saúde.** Coletar exige cuidado de privacidade e deixa o app perto de reivindicação médica. Tratar como restrição de exercício, nunca como diagnóstico ou recomendação clínica.
- **Preço de alimento varia por região e no tempo.** Fonte de dados ainda indefinida.

---

## 8. Pendências técnicas fora do roadmap de produto

- **Ícones novos** (`dark-icon.svg`, `light-icon.svg`): precisam virar PNG 1024×1024 quadrado, sem cantos arredondados nem transparência. Expo não aceita SVG para ícone de app. Alternativa: refazer no Icon Composer (macOS) e apontar `ios.icon` para o `.icon`.
- **Código órfão do onboarding anterior**: `src/domains/onboardingConfig.ts`, `src/domains/onboardingNotes.ts`, o ramo `onboarding` do `CommandBus` e o alargamento de `Domain` compilam e têm teste, mas não rodam. Apagar ou justificar.
- **Proxy `/api/enrich` sem deploy**: o modo `managed` não funciona em build standalone.
