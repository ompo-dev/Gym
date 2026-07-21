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
| `trainingDays` | que dias você treina? | Alvo calórico por dia · `currentStreak` deixa de punir descanso planejado |
| `trainingLevel` | iniciante / intermediário / avançado | Contexto da IA de treino (depois de abrir os 3 portões) · limiares do monitor |
| `workoutGoal` | hipertrofia / força / resistência / emagrecer | Prompt de treino · e é a ponte que falta para a dieta variar com o objetivo |

### Fase B — dados para a IA que monta treino

> Depende de: portões da 3.2 abertos.

| Dado | Por quê |
|---|---|
| `environment` | academia completa / academia básica / casa / ao ar livre |
| `equipment[]` | o que existe de verdade — halteres, barra, máquinas, elásticos, kettlebell |
| `sessionMinutes` | quanto tempo por sessão |
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

| Dado | Por quê |
|---|---|
| `pantry[]` | o que a pessoa comprou/tem em casa |
| preços por região | sugerir a receita mais barata com o que já existe |

Receitas montadas com o que ela **já comprou**, respeitando gostos, restrições e a meta do dia.

---

## 5. O que fica de fora, e por quê

| Não perguntar | Motivo |
|---|---|
| Divisão de treino (ABC, push/pull) | **Inferível** do histórico de notas em 2 semanas |
| Exercícios favoritos | **Inferível** — `SavedExerciseRepository` já registra o que se repete |
| Frequência real | **Inferível** — `currentStreak` e o log já sabem |
| `micronutrientTargets` (valores) | Nunca foi coletado em canto nenhum; defaults servem |
| Foto/medidas corporais | Alto atrito, nenhum consumidor planejado |

**Regra:** dado inferível do uso não vira pergunta. O app descobre sozinho e acerta mais que a memória da pessoa.

---

## 6. Ordem de implementação

| Fase | Entrega | Depende de |
|---|---|---|
| 0 | Abrir os 3 portões da IA de treino + mandar a nota inteira, não só a 1ª linha | — |
| 1 | Fase A de coleta (4 perguntas) | — |
| 2 | Ponte treino→dieta: alvo calórico varia por dia treinado | Fase 1 |
| 3 | Fase B de coleta + IA que monta treino | Fase 0 |
| 4 | Fase C de coleta + IA que monta dieta | Fase 3 |
| 5 | Geladeira virtual + preços | Fase 4 |

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
