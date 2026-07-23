# Plano de implementação — GymNotes

> Companheiro do [ROADMAP.md](ROADMAP.md). O roadmap diz **o quê e por quê**;
> este documento diz **onde, em que ordem e como verificar**.
>
> Estado do repo na escrita: 26 suites / 206 testes verdes, `tsc --noEmit` e
> `expo lint` limpos, `expo-doctor` 18/18.

## Como ler isto

Cada fase abaixo traz: pré-requisitos, tabela de arquivos, os trechos literais
(o que existe hoje × o que vira), comportamento e casos de borda, migração de
dados, tabela de testes e riscos.

**Critério de pronto, igual em toda sub-fase:**

```bash
npx tsc --noEmit && npx expo lint && npx jest
```

Verde nos três, e o app não pode ficar quebrado no meio de uma sub-fase.

---

## ⚠️ Grau de confiança deste documento

As 6 especificações foram escritas por agentes que leram o código, e depois
**a revisão cruzada não rodou** — a sessão bateu o limite de uso. O que eu
verifiquei mecanicamente no lugar dela:

| Verificação | Resultado |
|---|---|
| Citações `arquivo:linha` conferidas contra o disco | **143 válidas** |
| Linhas apontando além do fim do arquivo | **0** |
| Arquivos citados que não existem | 35 — todos arquivos **a criar**, mais 22 casos de `.ts` onde era `.tsx` (corrigidos) |

Ou seja: as âncoras são reais. O que **não** foi verificado é se cada trecho
proposto está semanticamente certo. Trate as seções `### Trechos` como projeto
detalhado, não como patch pronto — quem implementar deve reler o arquivo alvo
antes de editar.

---

## Grafo de dependência

```
Fase 0  portões da IA de treino ─────┬──────────────► Fase 5.2  treino gerado
                                     │
Fase 2  coleta (A/B/C) ──────────────┘

Fase 1.1  CompositeCommand ──┬───────────────────► Fase 5.1  receita
Fase 1.2  date opcional ─────┤                          ▲
Fase 1.3  registro ──────────┘                          │
Fase 1.4  ferramentas de leitura ───────────────────────┤
                                                        │
Fase 4  intent compra + geladeira ──────────────────────┘

Fase 3  ponte treino→dieta  (independente de tudo)
```

**Por que cada aresta existe:**

| Aresta | Motivo concreto |
|---|---|
| 0 → 5.2 | O treino gerado precisa que o modelo receba perfil e nota inteira. Sem os portões abertos ele monta treino no vácuo |
| 2 → 5.2 | Aparelhos, lesões e objetivo são o insumo do treino gerado. A fase 0 cria `buildWorkoutPromptContext`, que é **onde** esses campos entram |
| 1.1 → 5 | Receita e plano semanal são ações multi-passo. Sem `CompositeCommand`, desfazer vira N toques |
| 1.2 → 5.2 | "Treino da semana" grava em 7 datas. Hoje `addEntry` carimba só o dia visível |
| 1.3 → 5 | O modelo precisa endereçar comandos por nome, com schema. É o contrato da ferramenta |
| 1.4 → 5.1 | "mais leve que a de ontem" e "com o que tem na geladeira" exigem **leitura** antes da escrita |
| 4 → 5.1 | Sem despensa não há o que consultar para montar receita com o que existe |

**Fase 3 não depende de nada e ninguém depende dela.** É a única que pode rodar
em qualquer momento — inclusive primeiro, se você quiser valor visível cedo.

---

## Ordem recomendada

| # | Sub-fase | Arquivos-chave | Entrega |
|---|---|---|---|
| 1 | **0** — portões da IA de treino | `CommandBus.ts`, `deepseek.ts`, `prompts.ts`, `onboarding.ts` | A IA de treino passa a saber quem é a pessoa e a ver a nota inteira |
| 2 | **1.1** — `CompositeCommand` | `core/command/` | Ação multi-passo com um undo só |
| 3 | **1.2** — `date` opcional no `addEntry` | `CommandBus.ts` | Escrever em outro dia |
| 4 | **3** — ponte treino→dieta | `trainingLoad.ts` (novo), `food.ts`, `useFoodGoals.ts` | Alvo calórico varia com o treino real |
| 5 | **2** — coleta A/B/C | `onboardingQuestions.ts`, `core/onboarding.ts`, store | Os dados das fases seguintes existem |
| 6 | **4** — intent compra + geladeira | `enrich/types.ts`, `deepseek.ts`, `PantryRepository.ts` (novo), `db.ts` | "comprei patinho" para de virar caloria |
| 7 | **1.3 + 1.4** — registro + leitura | `core/tools/` (novo) | Contrato de ferramenta |
| 8 | **5.1** — receita no detalhe | `FoodEntryDetailSheet.tsx`, `schemas.ts` | Receita passo a passo |
| 9 | **5.2** — treino gerado | `workoutPlan.ts` (novo) | "monte um treino pra semana" |

### Por que 0 vem antes de tudo

É a única fase que **melhora o que já existe** sem depender de nada. E ela cria
`buildWorkoutPromptContext`, que é o lugar onde a fase 2 vai pendurar
`trainingLevel`, `workoutGoal` e `weightUnit`. Fazer 2 antes é coletar dado que
não tem para onde ir.

### Por que 3 aparece cedo mesmo sendo independente

É a maior entrega visível sem tocar em IA nenhuma, e não conflita com arquivo de
ninguém. Se o orçamento acabar depois dela, o app ficou melhor de verdade.

---

## Conflitos de arquivo

Estas fases tocam os mesmos arquivos e **não podem ser paralelizadas**:

| Arquivo | Disputado por | Ordem obrigatória |
|---|---|---|
| `src/core/command/CommandBus.ts` | Fase 0 (contexto) e 1.2 (`date`) | 0 → 1.2 |
| `src/core/enrich/deepseek.ts` | Fase 0 (contexto por domínio) e 4 (intent novo) | 0 → 4 |
| `src/core/onboarding.ts` | Fase 0 (`buildWorkoutPromptContext`) e 2 (campos novos) | 0 → 2 |

**Seguro em paralelo:** Fase 3 (cria módulo puro novo e mexe em `food.ts` /
`useFoodGoals.ts`, que ninguém mais toca) e Fase 1.1 (arquivo novo em
`core/command/`, só adiciona export).

---

## Pontos de corte

Onde dá para parar e ainda ter entregue algo inteiro:

| Parar depois de | O que o usuário ganhou |
|---|---|
| **Fase 0** | Nome de exercício e anatomia melhoram porque o modelo enfim tem contexto |
| **Fase 3** | O alvo calórico responde ao treino real. Nenhuma IA envolvida |
| **Fase 4** | Geladeira funcionando, com histórico de preço. Vale sozinha |
| **Fase 5.1** | Receita com o que há em casa — a capacidade que vende o produto |

---

## Duas dívidas que atravessam tudo

Nenhuma bloqueia as fases, mas as duas continuam abertas:

1. **Código órfão do onboarding anterior** — `src/domains/onboardingConfig.ts`,
   `src/domains/onboardingNotes.ts`, o ramo `onboarding` do `CommandBus` e o
   alargamento de `Domain` compilam e têm teste, mas não rodam. Decidir antes da
   fase 4, que mexe no mesmo `CommandBus`.
2. **Proxy `/api/enrich` sem deploy** — o modo `managed` não funciona em build
   standalone. Toda fase que depende de IA depende, hoje, de chave própria.

---

# Especificações

## Fase 0 — Abrir os portões da IA de treino

### Pré-requisitos

Nada precisa ser criado antes. O que precisa ser verdade (verificado, não assumido):

1. **O parse local do treino não depende do que é enviado à IA.** `localData = parseWorkoutText(entry.text, …)` é calculado em `src/core/command/CommandBus.ts:231-234`, antes da chamada, a partir de `entry.text` inteiro. O merge em `CommandBus.ts:274-283` faz `{ ...localData, exercise, kind, primary, synergists, stabilizers }` — **`sets` sempre vem do parser local, nunca da IA**. Trocar o payload enviado não pode quebrar parsing algum.
2. **O único chamador de `enrich` com `domain: 'workout'` é o `CommandBus`.** `DayTemplate.tsx:472, 682, 788` e `SettingsSheet.tsx:342` são todos `domain: 'food'`. Ninguém consome `sets` vindos do modelo — logo o prompt pode parar de pedi-los.
3. **`getWorkoutExerciseLine` também é usado pelo parser local** (`src/domains/workout.ts:294`). A função **não pode ser tocada**; a correção é no ponto de chamada (`CommandBus.ts:235`), que é onde a decisão errada mora.
4. **O cache é só memória.** `Lru` (`src/core/cache/lru.ts:6`) é um `Map` puro dentro da instância `bus` (`src/core/command/bus.ts:12`). Nada é persistido. "Invalidar o cache existente" custa, no pior caso, uma chamada extra por nota **na sessão atual**. Não há migração de cache a fazer.
5. **`profile` pode ser `null`** (usuário novo, `useAppStore.ts:83`). Todo o caminho novo precisa degradar para exatamente o comportamento de hoje nesse caso.

### Arquivos

| arquivo | ação | o que exatamente muda |
|---|---|---|
| `src/core/onboarding.ts` | editar | nova `buildWorkoutPromptContext(profile, locale, today?)` — subconjunto do perfil sem nutrição, reusando `normalizeOnboardingProfile`, `estimateAge`, `considerationText` |
| `src/core/command/CommandBus.ts` | editar | `BusDeps.getUserContext` recebe `domain`; `userContext` passa a valer para food **e** workout (nunca onboarding), calculado num helper com try/catch; o enrich de treino envia `entry.text` inteiro e o `userContext`; nome de exercício vindo da IA é higienizado |
| `src/core/command/bus.ts` | editar | a dep `getUserContext` roteia por domínio: workout → `buildWorkoutPromptContext`, resto → `buildOnboardingPromptContext` |
| `src/core/enrich/deepseek.ts` | editar | instrução de sistema e bloco de contexto deixam de ser `domain === 'food'`; viram uma tabela `Partial<Record<Domain, {label, instruction}>>` |
| `src/domains/prompts.ts` | editar | `promptByDomain.workout`: assume nota inteira, proíbe devolver `sets`, restringe o formato de `exercise`; remove 6 instruções que viraram letra morta |
| `src/core/command/CommandBus.test.ts` | editar | 2 asserts existentes mudam (payload agora é a nota inteira) + 5 testes novos |
| `src/core/onboarding.test.ts` | editar | 1 teste novo |
| `src/app/api/enrich+api.test.ts` | editar | 2 testes novos (única superfície onde a montagem do prompt é observável) |

Nenhum arquivo novo. Nenhuma chave de i18n (nada disso é visível como texto).

---

### Trechos

#### 1. `src/core/onboarding.ts` — contexto de treino

Hoje só existe `buildOnboardingPromptContext` (`onboarding.ts:183-218`), que devolve bloco nutricional: `targets=2518 kcal, protein 153g…`, `micronutrientTargets=…`, `calorieEstimationBias=2`. Mandar isso para um parser de treino é ruído (e ~2x tokens).

Adicionar **depois** de `buildOnboardingPromptContext` (reusa tudo que já está no arquivo):

```ts
/**
 * O que um parser de treino consegue usar: quem é a pessoa, não quantas
 * calorias ela deve comer. Deliberadamente sem alvos, macros e micronutrientes
 * — o prompt de treino não tem o que fazer com eles e paga tokens por eles.
 */
export function buildWorkoutPromptContext(
  profile: OnboardingProfile | null,
  locale: string,
  today = todayISO(),
): string | undefined {
  if (!profile) return undefined;
  profile = normalizeOnboardingProfile(profile);
  const lang = locale.toLowerCase().startsWith('en') ? 'en-US' : 'pt-BR';
  const considerations = profile.considerations.map((item) => considerationText[item][lang]);
  const notes = profile.notes.trim().slice(0, 240);

  return [
    lang === 'pt-BR' ? 'Perfil local do usuário:' : 'Local user profile:',
    `age=${estimateAge(profile.birthDate, today)}`,
    `gender=${profile.gender}`,
    `heightCm=${profile.heightCm}`,
    `weightKg=${profile.weightKg}`,
    `activity=${profile.activity}`,
    considerations.length ? `considerations=${considerations.join(', ')}` : '',
    notes ? `userNotes=${notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
```

Saída típica < 200 caracteres — bem abaixo do teto de 1000 que o proxy impõe em `src/app/api/enrich+api.ts:40` (`userContext: z.string().max(1000)`). É aqui que a Fase A do roadmap vai pendurar `trainingLevel`, `workoutGoal` e `weightUnit`; a função existe para ter onde.

#### 2. `src/core/command/CommandBus.ts` — os dois portões do bus

**a) assinatura da dep.** Hoje (`CommandBus.ts:55`):

```ts
  getUserContext?: () => string | undefined;
```

Vira:

```ts
  getUserContext?: (domain: Domain) => string | undefined;
```

Uma função de zero argumentos continua atribuível a essa assinatura — os testes existentes (`CommandBus.test.ts:109`) não quebram.

**b) portão 1.** Hoje (`CommandBus.ts:166`):

```ts
    const userContext = entry.domain === 'food' ? this.deps.getUserContext?.() : undefined;
```

Vira:

```ts
    const userContext = this.userContext(entry.domain);
```

com este método privado novo (colocar junto de `lastExercise`, no fim da classe):

```ts
  /**
   * Onboarding fica de fora de propósito: essas notas são o que *constrói* o
   * perfil, e devolver o perfil atual para o modelo faria ele repetir valores
   * default como se o usuário os tivesse dito — o merge de onboarding preenche
   * lacunas com o que a IA responde (CommandBus.ts:211-217).
   *
   * O try/catch é o que mantém o ramo de treino infalível: isto roda FORA do
   * try de runEnrich, e um throw aqui deixaria a nota presa em 'thinking' para
   * sempre (enqueueEnrich engole o erro em CommandBus.ts:147-149).
   */
  private userContext(domain: Domain): string | undefined {
    if (domain === 'onboarding') return undefined;
    try {
      return this.deps.getUserContext?.(domain);
    } catch {
      return undefined;
    }
  }
```

**c) portão 2 + nota inteira.** Hoje (`CommandBus.ts:243-253`):

```ts
      let promise = this.inflight.get(key);
      if (!promise) {
        promise = this.deps.enrichFn({
          text: exerciseText,
          domain: entry.domain,
          context: fallbackExercise,
          userContext: undefined,
          locale,
        });
```

Vira:

```ts
      let promise = this.inflight.get(key);
      if (!promise) {
        promise = this.deps.enrichFn({
          // A nota inteira: as linhas de série são a melhor pista de qual
          // exercício é ("30min" desambigua esteira de agachamento). O parse
          // dos números continua sendo local — nada do que a IA devolver em
          // `sets` é lido (ver o merge abaixo).
          text: entry.text,
          domain: entry.domain,
          context: fallbackExercise,
          userContext,
          locale,
        });
```

`exerciseText` **continua sendo calculado** (`CommandBus.ts:235`) e o portão de `CommandBus.ts:237-241` fica intacto:

```ts
      if (!exerciseText) {
        this.cache.set(key, localData);
        await this.applyResolved(entry, localData);
        return;
      }
```

Ele agora significa apenas "a nota não nomeia exercício nenhum, só números — não há o que a IA corrigir". É o que mantém verde o teste `CommandBus.test.ts:190` e evita gastar chamada com `"8x100\n95"`.

**d) higienizar o nome vindo da IA.** Hoje (`CommandBus.ts:273-276`):

```ts
        const aiData = parsed.data as WorkoutData;
        const data: WorkoutData = {
          ...localData,
          exercise: aiData.exercise ?? localData.exercise,
```

Vira:

```ts
        const aiData = parsed.data as WorkoutData;
        const data: WorkoutData = {
          ...localData,
          exercise: cleanExerciseName(aiData.exercise) ?? localData.exercise,
```

com constante e helper no topo do arquivo (junto de `MAX_UNDO`, `CommandBus.ts:23`):

```ts
const MAX_EXERCISE_NAME = 60;
```

e, na seção de funções livres do módulo:

```ts
/**
 * O modelo agora vê a nota inteira; um eco das linhas de série virando nome de
 * exercício apareceria como título da nota. `workoutSchema` não limita o campo
 * (schemas.ts:119), então o limite mora aqui — no único ramo que consome IA.
 */
function cleanExerciseName(value: string | null | undefined): string | null {
  const name = value?.split('\n')[0].trim() ?? '';
  return name && name.length <= MAX_EXERCISE_NAME ? name : null;
}
```

Semântica preservada: IA devolvendo `null` continua caindo em `localData.exercise`; agora `''` e lixo caem também.

#### 3. `src/core/command/bus.ts` — a fiação real

Hoje (`bus.ts:16-17`):

```ts
  getUserContext: () =>
    buildOnboardingPromptContext(useAppStore.getState().onboardingProfile, getLang()),
```

Vira:

```ts
  getUserContext: (domain) => {
    const profile = useAppStore.getState().onboardingProfile;
    const locale = getLang();
    return domain === 'workout'
      ? buildWorkoutPromptContext(profile, locale)
      : buildOnboardingPromptContext(profile, locale);
  },
```

Import correspondente em `bus.ts:4`:

```ts
import { buildOnboardingPromptContext, buildWorkoutPromptContext } from '@/core/onboarding';
```

#### 4. `src/core/enrich/deepseek.ts` — os outros dois portões

Hoje, sistema (`deepseek.ts:188-197`):

```ts
  const system = [
    intent === 'foodEdit' ? foodEditPrompt : promptByDomain[domain],
    'Write the "label", "item", "note", "exercise" and "reasoning" text in',
    `${language}.`,
    userContext && domain === 'food'
      ? 'Use the user nutrition context to choose serving assumptions, calories and macros; respect restrictions, diet preferences and notes when relevant.'
      : '',
  ]
    .filter(Boolean)
    .join(' ');
```

e bloco do usuário (`deepseek.ts:203-204`):

```ts
  const userContextBlock =
    userContext && domain === 'food' ? `User nutrition context:\n${userContext}\n\n` : '';
```

Adicionar no topo do módulo (perto de `MODEL`, `deepseek.ts:22`):

```ts
/**
 * Como cada domínio deve ler o contexto de perfil. Domínio ausente = o contexto
 * é descartado, e é assim que 'onboarding' fica de fora sem um `if` extra.
 */
const USER_CONTEXT: Partial<Record<Domain, { label: string; instruction: string }>> = {
  food: {
    label: 'User nutrition context',
    instruction:
      'Use the user nutrition context to choose serving assumptions, calories and macros; respect restrictions, diet preferences and notes when relevant.',
  },
  workout: {
    label: 'User profile',
    instruction:
      'Use the user profile only to pick the most likely exercise name and the muscles it trains; never invent sets, loads, duration or distance the entry does not state.',
  },
};
```

E substituir os dois trechos por:

```ts
  const contextCopy = userContext ? USER_CONTEXT[domain] : undefined;
  const system = [
    intent === 'foodEdit' ? foodEditPrompt : promptByDomain[domain],
    'Write the "label", "item", "note", "exercise" and "reasoning" text in',
    `${language}.`,
    contextCopy?.instruction ?? '',
  ]
    .filter(Boolean)
    .join(' ');
```

```ts
  const userContextBlock = contextCopy ? `${contextCopy.label}:\n${userContext}\n\n` : '';
```

`intent === 'foodEdit'` só ocorre com `domain === 'food'` (garantido em `enrich+api.ts:53`), então o caminho de edição de comida continua recebendo exatamente a instrução de hoje.

#### 5. `src/domains/prompts.ts` — `promptByDomain.workout`

O prompt de hoje (`prompts.ts:54-83`) descreve um trabalho que o app não usa: ele pede sets, unidades, aritmética e carry-forward de unidade — e **tudo isso é jogado fora** no merge. Com a nota inteira chegando, manter esses pedidos é pagar tokens de saída para produzir lixo e aumentar a chance de o modelo confundir "95x7" com um exercício.

**Remover** estas 6 linhas exatas:

```ts
    'If the first line is the exercise name and later lines are sets, keep that structure.',
    'Keep "95x7" as one set with weight 95 and reps 7.',
    'If the entry lists several weights for one exercise like "leg press 50, 100kg e 150", create one set per weight mention.',
    'Carry forward the last explicit unit to later sets; if no unit is ever given assume kg.',
    'For cardio, parse duration into durationSeconds and distance into distanceMeters; "1h/5km" means durationSeconds 3600 and distanceMeters 5000.',
    'If reps, load, duration, or distance are omitted, omit that field.',
    'Resolve arithmetic before returning JSON, but never calculate totals or volume.',
```

**Trocar** a linha de forma:

```ts
    '{ "exercise": string | null, "kind": "series" | "cardio", "sets": [ { "weight"?: number, "unit"?: "kg" | "lb", "reps"?: number, "durationSeconds"?: number, "distanceMeters"?: number } ] }.',
```

por:

```ts
    '{ "exercise": string | null, "kind": "series" | "cardio", "sets": [] }.',
```

**Trocar**:

```ts
    'If the text is only an exercise name, still return the corrected/formatted exercise name, kind, and an empty sets array.',
```

por:

```ts
    'If the note is only an exercise name, still return the corrected name and kind.',
```

**Acrescentar**, logo depois de `'You are a workout-log parser.'`:

```ts
    "You receive the whole note: the first line names the exercise and any lines after it are that exercise's sets.",
    'The app already parsed every number locally. Read the set lines only as evidence of which exercise this is, and ALWAYS return "sets": [] — any weight, rep, duration or distance you return is discarded.',
    '"exercise" is the exercise name alone: one short line, no numbers, no line breaks.',
```

O resto (correção de typo, expansão de abreviação, regra de `kind`, `exercise: null`, `MUSCLE_PROMPT_VOCABULARY` e o bloco de `primary`/`synergists`/`stabilizers`, `'Respond with JSON only, no prose.'`) fica **intacto** — é exatamente o que o merge consome.

---

### Comportamento

**O que o usuário vê.** Nada de novo na tela. O que muda é a taxa de acerto:

- `esteira\n30min 5km` → o modelo hoje recebe só `"esteira"`; passa a receber a nota inteira e classifica `kind: 'cardio'` e `primary: { muscle: 'cardiovascular' }` com a métrica à vista.
- `sup\n60x12` com perfil `considerations=treino de força` → contexto ajuda a resolver o nome ambíguo.
- Nomes e músculos continuam sendo a única coisa que a IA decide. Séries, cargas, tempo e distância continuam 100% locais e idênticos ao que são hoje.

**Casos de borda.**

| entrada | o que acontece |
|---|---|
| `8x100\n95` (sem nome de exercício) | `getWorkoutExerciseLine` → `null` → **nenhuma chamada de IA**, resolve local. Igual a hoje. |
| perfil `null` (usuário novo) | `buildWorkoutPromptContext` → `undefined` → `contextCopy` `undefined` → prompt idêntico ao de hoje. |
| `getUserContext` lança | capturado no helper → `undefined` → a nota resolve normalmente. |
| IA devolve `exercise` com quebra de linha ou > 60 chars | `cleanExerciseName` → `null` → cai no nome do parser local. |
| IA devolve `sets` preenchido | ignorado — o merge sobrescreve com `localData.sets`. |
| `userContext` > 1000 chars (proxy) | `enrich+api.ts:40` responde 400 → `{ ok:false }` → o ramo de treino cai em `localData`. Nota resolve. |
| nota de onboarding | `userContext` continua `undefined` (`CommandBus.ts:194` não muda). |

**Quando falha.** A propriedade "o treino nunca falha" é preservada por construção e **em três pontos**, todos verificáveis por teste: (1) `!res.ok` → `applyResolved(localData)` (`CommandBus.ts:260-264`); (2) schema inválido → `applyResolved(localData)` (`:266-271`); (3) `catch` → `applyResolved(localData)` (`:286-291`). A única regressão possível era um throw **antes** do `try`, na montagem do `userContext` — e é exatamente por isso que o helper tem try/catch. Não existe caminho novo que produza `status: 'error'` em treino.

**Efeito colateral visível no prompt.** Com a nota inteira, `normalizeForEnrich` (`deepseek.ts:187`) agora expande abreviações em todas as linhas, então `normalizedText !== textWithMedia` passa a ser comum e o bloco vira `Original entry: … / Normalized arithmetic: …` (`deepseek.ts:198-201`). É o mesmo formato já usado para comida; o rótulo "arithmetic" já era impreciso antes desta mudança e não vale corrigir agora.

---

### Migração de dados

**Nenhuma.**

- **SQLite**: nenhuma tabela, coluna ou índice muda. `entries.data` continua guardando o JSON de `WorkoutData` com a mesma forma (`workoutSchema` não é tocado, `src/domains/schemas.ts:118-129`). Linhas antigas continuam válidas.
- **Settings**: nenhuma chave nova. O perfil já existe em `onboardingProfile` (`useAppStore.ts:31, 139`) e já é lido pelo caminho de comida.
- **Cache**: `userContext` já compõe o `hashKey` (`CommandBus.ts:171-174`) — a chave de treino **muda de valor** ao ligar isso. Isso é correto e barato: o `Lru` é um `Map` em memória dentro da instância `bus`, morre com o processo e nunca foi persistido. Custo real: até uma chamada extra por nota, uma vez, na sessão em que o perfil muda. **Não fazer nada** — tirar `userContext` da chave seria um bug (dois perfis diferentes passariam a compartilhar resposta).
- Bônus: hoje a chave de treino já é derivada da **nota inteira** enquanto o payload é só a primeira linha; depois da mudança chave e payload passam a descrever a mesma coisa. Contagem de chamadas não muda.

---

### Testes

| arquivo de teste | o que verifica | por que quebraria sem isso |
|---|---|---|
| `src/core/command/CommandBus.test.ts` (**editar** :218-220 e :240-242) | `text` agora é `'sipino reto\n8x100'` e `'corida\n1h/5km'` | os dois asserts atuais pinam `'sipino reto'` / `'corida'` e **vão falhar**; sem atualizar, a suíte fica vermelha |
| idem — novo: `'workout enrich sends the whole note, not just the exercise line'` | `addEntry('sipino reto\n8x100\n95x7', 'workout')` → `enrichFn` recebe `text` igual ao texto completo | alguém "otimizando" tokens volta ao `exerciseText` e o modelo fica cego de novo, silenciosamente |
| idem — novo: `'workout enrich carries the user profile context'` | `harness(fn, { getUserContext: () => 'age=22\nactivity=light' })` → `objectContaining({ domain: 'workout', userContext: 'age=22\nactivity=light' })` | é o portão do `CommandBus.ts:166`; sem teste ele volta a `domain === 'food'` num refactor e ninguém percebe |
| idem — novo: `'an onboarding note never receives the profile'` | com `getUserContext` retornando texto, `addEntry(…, 'onboarding')` → `enrichFn` chamado com `userContext: undefined` | sem isso, o perfil default vaza para o prompt que **constrói** o perfil e o modelo passa a "confirmar" valores que o usuário nunca disse |
| idem — novo: `'a throwing profile builder still resolves the workout note'` | `getUserContext: () => { throw new Error('boom') }` → `status === 'done'` e `data.sets` do parser local | é a propriedade "treino nunca falha"; sem o try/catch a nota fica presa em `'thinking'` para sempre e nada na UI denuncia |
| idem — novo: `'an AI exercise name that echoes the note is discarded'` | IA devolve `exercise: 'Supino reto\n100kg x 8'` → `data.exercise === 'Supino reto'`; IA devolve 80 chars → cai no nome local | mandar a nota inteira é exatamente o que cria essa classe de resposta; sem guarda, o título da nota vira lixo multi-linha |
| idem — manter :190 `'workout entries are parsed locally without calling the AI'` | `'8x100\n95'` não chama a IA | pina o portão `!exerciseText`, que é o que segura o custo |
| `src/core/onboarding.test.ts` — novo | `buildWorkoutPromptContext(defaultOnboardingProfile(), 'pt-BR', '2026-07-14')` contém `age=21`, `weightKg=98`, `treino de força` e **não** contém `kcal` nem `targets=` | o valor da função é ser o subconjunto certo; sem o assert negativo ela vira cópia da nutricional na primeira "melhoria" |
| `src/app/api/enrich+api.test.ts` — novo: `'a workout request carries the profile block into the prompt'` | `post({ ...workout, userContext: 'age=22' })` → `body.messages[0].content` contém `'Use the user profile only'`; `messages[1].content` contém `'User profile:\nage=22'` | **é a única superfície onde a montagem do prompt é observável** — `deepseek.ts` não tem teste próprio; os portões :192 e :204 podem voltar a `domain === 'food'` sem nenhum sinal |
| idem — novo: `'a food request keeps its nutrition wording'` | `domain: 'food'` + `userContext` → `messages[1].content` contém `'User nutrition context:'` | a refatoração para `USER_CONTEXT` mexe no caminho de comida, que hoje funciona e não tem teste algum |

Padrões a seguir: `flush()` e `harness()` de `CommandBus.test.ts:7,14`; leitura do body via `JSON.parse(fetchMock.mock.calls[0][1].body as string)` como em `enrich+api.test.ts:49`. Tudo `.ts` — `testMatch` é `<rootDir>/src/**/*.test.ts`.

---

### Riscos

| risco | como detectar cedo |
|---|---|
| **Os dois asserts existentes de treino quebram** (`CommandBus.test.ts:219, 241`). É esperado, não é regressão — mas se alguém "consertar" mudando o código em vez do teste, o portão fecha de novo. | `npm test` na primeira rodada. Atualizar os asserts **junto** com a mudança, no mesmo commit. |
| **Modelo devolve `sets` mesmo instruído a não devolver.** Inócuo hoje (merge descarta), mas vira bug no dia em que alguém decidir consumir `aiData.sets`. | O merge em `CommandBus.ts:274-283` é explícito sobre isso; manter o comentário. Teste `'workout entries use AI to correct the exercise name but keep local set parsing'` (:208) já pina que `sets` sai do parser local. |
| **Nome de exercício absurdo escapando do teto de 60.** Nomes reais em pt-BR/en-US cabem folgado; um teto apertado demais rejeitaria nomes legítimos. | O fallback é sempre o nome local — falha para o comportamento de hoje, nunca para vazio. Se aparecer nome truncado em uso real, subir `MAX_EXERCISE_NAME`; é uma constante. |
| **Custo/latência.** A nota inteira em vez de uma linha. Notas de treino têm 2-6 linhas curtas: dezenas de tokens de entrada a mais, e a **saída encolhe** (sets deixam de ser gerados). Saldo provavelmente negativo em tokens. | Nada a instrumentar. Se virar preocupação, o portão `!exerciseText` já corta o caso mais barato. |
| **Privacidade (ROADMAP §5b).** Idade, peso, altura, gênero e `notes` livre passam a sair do aparelho **também** nas requisições de treino. Não é classe nova de dado (já sai no fluxo de comida), mas o `notes` é texto livre e a Fase B do roadmap pretende colocar `injuries[]`/`conditions[]` no perfil — aí vira **dado de saúde** e exige aviso explícito na tela em que for coletado, não em política enterrada. | Decisão de produto, não de código. Registrar em `ROADMAP.md` §5b que a Fase 0 estendeu o envio do perfil ao domínio de treino, antes de a Fase B adicionar lesões. |
| **`deepseek.ts` não tem teste unitário próprio.** A refatoração de `USER_CONTEXT` mexe no caminho de comida em produção. | Os dois testes novos em `enrich+api.test.ts` cobrem os dois domínios pela rota do proxy — é o caminho que exercita `runEnrichEngine` de ponta a ponta com `fetch` mockado. |
| **Teto de 1000 chars do proxy em `userContext`.** O contexto de treino cabe hoje (<200), mas a Fase A vai crescê-lo. | Falha graciosa (400 → `{ok:false}` → `localData`), então nunca perde a nota. Ao adicionar campos na Fase A, medir a saída de `buildWorkoutPromptContext` no teste com um `expect(context.length).toBeLessThan(1000)`. |

**Pulei:** `CompositeCommand`, `date` opcional no `addEntry`, registro de comandos e qualquer leitura de histórico — são as Fases 1-8 do roadmap e nenhuma é necessária para abrir os portões. **Pulei também** reusar `buildOnboardingPromptContext` para treino: economizaria 20 linhas ao custo de mandar `targets=2518 kcal, protein 153g` para um parser de exercícios; adicionar quando/se o prompt de treino tiver o que fazer com números de dieta.

---

## Fase 1 — Camada de ferramentas e comandos endereçáveis

### Pré-requisitos

| Precisa existir | Por quê |
|---|---|
| `Command` (`src/core/command/Command.ts:2-6`) inalterado na forma | O `CompositeCommand` **cabe na interface atual sem mudá-la**. Nenhum membro novo (`name`, `id`) entra em `Command` — o nome vive no registro, não no comando. |
| `CommandBus.run` (`CommandBus.ts:72-77`) empilhando **depois** do `execute()` | Se um filho do composite falhar, `run` rejeita e nada entra na pilha de undo. É o que torna o rollback do composite suficiente. |
| `zod@4.4.3` (`package.json:38`) | Verificado em `node_modules/zod/index.d.ts` → reexporta `v4/classic/external.js`, que exporta `toJSONSchema` (`node_modules/zod/v4/classic/external.d.ts:10`) e `prettifyError` (`:9`). São as duas peças que fazem o schema servir duas vezes. |
| `z.iso.date()` | Executado contra o zod instalado: aceita `2026-07-21` e `2024-02-29`, rejeita `2026-02-30`, `2026-13-01`, `2026-2-1`. **Não escreva regex de data à mão** — `Date.parse('2026-02-30')` retorna `1772409600000` (rola para 02/03), então a checagem ingênua passa lixo. |
| Testes injetáveis | `jest` roda `<rootDir>/src/**/*.test.ts` (`package.json:66-68`), só `.ts`. `CommandBus.ts` não importa nenhum repositório — o teste injeta tudo via `BusDeps` (`CommandBus.test.ts:14-56`). **O registro tem de seguir o mesmo padrão**: nada de `import { EntryRepository }` em escopo de módulo, senão o teste arrasta `expo-sqlite`. |

### Fora de escopo (NÃO fazer agora)

1. **Nenhum loop de conversa com o provedor.** `deepseek.ts` e `src/app/api/enrich+api.ts` não são tocados. Nada de campo `tools` no corpo do request (`deepseek.ts:73-81`), nada de ler `tool_calls`, nada de multi-turno. O passo 5 do roadmap (`ROADMAP.md:232`) continua não implementado.
2. **`toolCatalog()` não entra em prompt nenhum.** A função existe, é testada, e não tem chamador em produção nesta entrega. É proposital.
3. **Nenhum intent novo.** Continuam só `'parse' | 'foodEdit'` (`enrich/types.ts:54`).
4. **Nenhuma ferramenta de geladeira.** Não existe tabela `pantry` nem coluna de preço (`db.ts:10-56`), e o próprio roadmap trava isso atrás do intent `purchase` (`ROADMAP.md:120-123`). O que existe de mais próximo é `saved_meals` — a ferramenta se chama `readSavedMeals` e **não** deve ser apresentada ao modelo como "geladeira". Inventar `readPantry` agora seria devolver `[]` para sempre.
5. **Nenhuma ferramenta de escrita além de `addEntries`.** `deleteEntry`/`editEntry` exigem que o modelo tenha id de entry, que ele só obtém via `readDay`. Assinatura reservada no fim desta spec; não implementar.
6. **`invokeTool` não executa nada.** Devolve o `Command`; quem chama decide `bus.run(cmd)`. Auto-executar colocaria ação de modelo não revisada direto no SQLite.
7. **Nenhuma chave i18n, nenhum modal, nenhuma tela.** `Command.label` nunca é renderizado — a toast usa `t('undo.deleted')` (`DayTemplate.tsx:879`); `label` é diagnóstico.
8. **Não alterar `useAppStore.upsertEntry`** (`useAppStore.ts:95`). Descartar entry de outro dia está certo para exibição.

### Arquivos

| Arquivo | Ação | O que exatamente muda |
|---|---|---|
| `C:\Projects\Teste\Gym\src\core\command\Command.ts` | editar | Adiciona `CompositeCommand` (execute em ordem, undo reverso, rollback em falha parcial). Atualiza o comentário do topo, que hoje diz "Add/Delete implement this". |
| `C:\Projects\Teste\Gym\src\core\command\CommandBus.ts` | editar | (a) extrai `createAddEntry(text, domain, media?, date?): Command \| null` de `addEntry`; (b) `addEntry` ganha 4º parâmetro `date?: string`; (c) `lastExercise` passa a receber a data e devolve `undefined` quando a entry não é do dia visível. Exporta `AddEntryCommand`? **Não** — o factory substitui isso. |
| `C:\Projects\Teste\Gym\src\core\tools\registry.ts` | criar | ~260 linhas. `ToolDeps`, `ToolResult`, `defineTool`, `toolRegistry` (1 escrita + 3 leituras), `invokeTool`, `isToolName`, `toolCatalog`. Zero import de `@/data/*` e de `@/core/command/bus`. |
| `C:\Projects\Teste\Gym\src\core\command\bus.ts` | editar | +6 linhas: `export const appToolDeps: ToolDeps` amarrando o singleton aos repositórios reais. É o único lugar que conhece SQLite. |
| `C:\Projects\Teste\Gym\src\core\command\Command.test.ts` | criar | Composite: ordem, undo reverso, rollback parcial, filho único. |
| `C:\Projects\Teste\Gym\src\core\command\CommandBus.test.ts` | editar | +4 testes de `date` (repo grava / store ignora / enrich alcança / fallback de exercício não vaza entre dias). |
| `C:\Projects\Teste\Gym\src\core\tools\registry.test.ts` | criar | Catálogo, dispatch, validação, composite ponta a ponta, leituras. |

---

### Trechos

#### 1. `CompositeCommand` — `src/core/command/Command.ts`

**Hoje (arquivo inteiro, 6 linhas):**

```ts
/** A reversible user action. Add/Delete implement this; the bus keeps an undo stack. */
export interface Command {
  readonly label: string;
  execute(): Promise<void>;
  undo(): Promise<void>;
}
```

**Vira** (interface intocada, classe acrescentada abaixo):

```ts
/** A reversible user action. The bus keeps an undo stack of these. */
export interface Command {
  readonly label: string;
  execute(): Promise<void>;
  undo(): Promise<void>;
}

/**
 * N ações, um undo. Um plano semanal empilharia sete comandos e sete toques
 * para desfazer; como composite ele ocupa uma entrada da pilha do bus e sai
 * inteiro de uma vez.
 *
 * Serial de propósito: a ordem é observável (as entries aparecem na ordem em
 * que o modelo pediu) e o rollback só é simples enquanto se sabe exatamente
 * quais filhos já rodaram.
 */
export class CompositeCommand implements Command {
  constructor(
    readonly label: string,
    private readonly children: readonly Command[],
  ) {}

  async execute(): Promise<void> {
    const done: Command[] = [];
    try {
      for (const child of this.children) {
        await child.execute();
        done.push(child);
      }
    } catch (error) {
      // Meio plano é pior que plano nenhum: o usuário veria três dos sete dias
      // sem saber qual falhou, e o bus não empilha nada (run() só empilha
      // depois do execute), então não haveria undo para limpar.
      for (const child of done.reverse()) {
        // Best-effort: o erro que importa é o original, relançado abaixo.
        await child.undo().catch(() => {});
      }
      throw error;
    }
  }

  async undo(): Promise<void> {
    for (const child of [...this.children].reverse()) await child.undo();
  }
}
```

#### 2. `date` opcional — `src/core/command/CommandBus.ts`

**Hoje (`CommandBus.ts:98-113`):**

```ts
  async addEntry(text: string, domain: Domain, media?: EntryMediaAttachment[]): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    const entry: Entry = {
      id: newId(),
      date: this.deps.store.getDay(domain).date,
      domain,
      text: trimmed,
      media: media?.length ? media : undefined,
      status: 'thinking',
      data: null,
      error: null,
      createdAt: this.now(),
    };
    await this.run(new AddEntryCommand(this, entry));
  }
```

**Vira:**

```ts
  /**
   * Monta o comando sem executá-lo. Existe para o composite: `AddEntryCommand`
   * é privado e a montagem da entry (id, trim, createdAt, dia padrão) precisa
   * continuar acontecendo num lugar só.
   */
  createAddEntry(
    text: string,
    domain: Domain,
    media?: EntryMediaAttachment[],
    date?: string,
  ): Command | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const entry: Entry = {
      id: newId(),
      date: date ?? this.deps.store.getDay(domain).date,
      domain,
      text: trimmed,
      media: media?.length ? media : undefined,
      status: 'thinking',
      data: null,
      error: null,
      createdAt: this.now(),
    };
    return new AddEntryCommand(this, entry);
  }

  /** `date` omitido = dia visível, que é o caso de toda a UI de hoje. */
  async addEntry(
    text: string,
    domain: Domain,
    media?: EntryMediaAttachment[],
    date?: string,
  ): Promise<void> {
    const cmd = this.createAddEntry(text, domain, media, date);
    if (cmd) await this.run(cmd);
  }
```

`useDay.ts:27` (`bus.addEntry(text, domain, media)`) não muda — o parâmetro é o quarto e opcional.

**Verificação pedida — o repo grava mesmo assim. Confirmado, caminho por caminho:**

| Passo | Arquivo:linha | Comportamento com data ≠ dia visível |
|---|---|---|
| `persistUpsert` → `repo.insert` | `CommandBus.ts:152-155` → `EntryRepository.ts:120-123` → `insertRow` `:81-98` | `INSERT OR REPLACE` com `entry.date` cru. **Grava.** Nenhum filtro por dia. |
| `persistUpsert` → `store.upsert` | `useAppStore.ts:92-95` | `if (entry.date !== day.date) return {}`. **Descarta**, correto para exibição. |
| enrich resolvendo depois | `CommandBus.ts:363-367` | `await this.deps.repo.update(id, patch)` acontece **antes** do lookup no store. A linha do SQLite recebe `status: 'done'` e `data` mesmo que a entry não esteja na tela. **Grava.** |
| undo do add | `CommandBus.ts:157-160` | `repo.delete(id)` sempre; `store.remove` filtra só por id, então remover algo que não está na lista é no-op. **Seguro.** |

**Vazamento real encontrado — `lastExercise`.** Hoje (`CommandBus.ts:230` e `:369-376`):

```ts
      const fallbackExercise = this.lastExercise(entry.domain);
// ...
  private lastExercise(domain: Domain): string | undefined {
    const entries = this.deps.store.getDay(domain).entries;
```

Escrever "8x100" (sem nome de exercício) em outra data herdaria o último exercício do **dia visível**. Sete dias de plano nascem todos com o contexto de hoje. Correção mínima:

```ts
      const fallbackExercise = this.lastExercise(entry.domain, entry.date);
// ...
  private lastExercise(domain: Domain, date: string): string | undefined {
    const day = this.deps.store.getDay(domain);
    // O fallback é "a série anterior desta sessão". Fora do dia visível não há
    // sessão em memória para herdar, e a de hoje não é a dele.
    if (day.date !== date) return undefined;
    const entries = day.entries;
```

#### 3. Registro type-safe — `src/core/tools/registry.ts` (novo)

**O problema de tipos, nomeado:** um `Record<string, ToolDef<S>>` com `S` variando por chave produz, no dispatch, uma união `ToolDef<A> | ToolDef<B>`; `tool.args.safeParse(raw)` devolve `A | B` e `tool.build(...)` não é chamável (assinaturas não correlacionadas). **A saída é não deixar `S` escapar da definição**: o `S` fica ligado dentro de `defineTool`, que faz parse **e** build no mesmo escopo e devolve uma forma apagada. Fora dali toda ferramenta tem o mesmo tipo — o que é honesto, porque o que volta do modelo é `unknown`.

```ts
import { z } from 'zod';

import { CompositeCommand, type Command } from '@/core/command/Command';
import type { CommandBus } from '@/core/command/CommandBus';
import type { Domain, Entry } from '@/core/types';
import type { SavedMeal } from '@/data/SavedMealRepository';
import { foodConfig, sumFoodData } from '@/domains/food';
import type { FoodData, WorkoutData } from '@/domains/schemas';
import { workoutConfig } from '@/domains/workout';
import { sessionsByExercise } from '@/domains/workoutProgress';

const MAX_BATCH = 31;          // um mês de plano é o teto; uma semana são 7
const MAX_HISTORY_SESSIONS = 20;
const DEFAULT_HISTORY_SESSIONS = 5;
const MAX_SAVED_MEALS = 50;
const DEFAULT_SAVED_MEALS = 20;

/**
 * Tudo o que uma ferramenta pode tocar, injetado. Nada de importar
 * `@/data/*` aqui: o registro precisa carregar em jest, onde expo-sqlite não
 * existe. É o mesmo motivo pelo qual `CommandBus` recebe `BusDeps`.
 */
export interface ToolDeps {
  bus: CommandBus;
  entries: {
    findByDate: (domain: Domain, date: string) => Promise<Entry[]>;
    findAll: (domain: Domain) => Promise<Entry[]>;
  };
  savedMeals: { all: () => Promise<SavedMeal[]> };
  today: () => string;
}

/** Chaves estáveis, no espírito de `ENRICH_ERROR` (CommandBus.ts:30-34). */
export const TOOL_ERROR = {
  unknown: 'tool.unknown',
  args: 'tool.args',
} as const;

export type ToolResult =
  | { ok: true; kind: 'command'; command: Command }
  | { ok: true; kind: 'data'; data: unknown }
  | { ok: false; error: string; detail?: string };

interface Tool {
  readonly description: string;
  readonly args: z.ZodType;
  readonly invoke: (raw: unknown, deps: ToolDeps) => Promise<ToolResult>;
}

/**
 * O único lugar onde o tipo dos argumentos de uma ferramenta é conhecido — e o
 * único onde precisa ser. `S` fica preso a esta chamada, então `build` enxerga
 * os args já validados e tipados; do lado de fora toda ferramenta tem a mesma
 * forma apagada, que é o que o dispatch pode honestamente prometer.
 */
function defineTool<S extends z.ZodType>(spec: {
  description: string;
  args: S;
  build: (args: z.output<S>, deps: ToolDeps) => ToolResult | Promise<ToolResult>;
}): Tool {
  return {
    description: spec.description,
    args: spec.args,
    invoke: async (raw, deps) => {
      const parsed = spec.args.safeParse(raw);
      if (!parsed.success) {
        return { ok: false, error: TOOL_ERROR.args, detail: z.prettifyError(parsed.error) };
      }
      return spec.build(parsed.data, deps);
    },
  };
}
```

**Schemas de argumento** (`onboarding` fica de fora do enum de propósito — o modelo nunca escreve nota de perfil):

```ts
const isoDate = z.iso.date();
const writableDomain = z.enum(['food', 'workout']);

const addEntriesArgs = z.object({
  entries: z
    .array(
      z.object({
        text: z.string().min(1).max(500),
        domain: writableDomain,
        date: isoDate.optional(),
      }),
    )
    .min(1)
    .max(MAX_BATCH),
  label: z.string().min(1).max(60).optional(),
});
```

**As ferramentas:**

```ts
export const toolRegistry = {
  addEntries: defineTool({
    description:
      'Write one or more notes. Same engine as a note typed by hand: each one is parsed and enriched. Omit `date` to write on the day the user is looking at. All entries in one call undo together.',
    args: addEntriesArgs,
    build: (args, deps) => {
      const commands = args.entries.flatMap((item) => {
        const cmd = deps.bus.createAddEntry(item.text, item.domain, undefined, item.date);
        return cmd ? [cmd] : [];
      });
      if (!commands.length) {
        return { ok: false, error: TOOL_ERROR.args, detail: 'every entry text was blank' };
      }
      return {
        ok: true,
        kind: 'command',
        command: new CompositeCommand(args.label ?? `${commands.length} entries`, commands),
      };
    },
  }),

  readDay: defineTool({
    description:
      'Read what the user logged on one day: the notes and the day totals. Use it to compare against a previous day.',
    args: z.object({ domain: writableDomain, date: isoDate.optional() }),
    build: async (args, deps) => {
      const date = args.date ?? deps.today();
      const entries = await deps.entries.findByDate(args.domain, date);
      return {
        ok: true,
        kind: 'data',
        data: args.domain === 'food' ? foodDay(date, entries) : workoutDay(date, entries),
      };
    },
  }),

  readExerciseHistory: defineTool({
    description:
      'Past sessions for one exercise, newest first, with sets/volume/duration/distance. Use it before prescribing load.',
    args: z.object({
      exercise: z.string().min(1).max(80),
      limit: z.number().int().min(1).max(MAX_HISTORY_SESSIONS).optional(),
    }),
    build: async (args, deps) => {
      const all = await deps.entries.findAll('workout');
      const byExercise = sessionsByExercise(all);
      const key = args.exercise.toLocaleLowerCase();
      // ponytail: substring nos dois sentidos ("supino" acha "supino reto").
      // Teto conhecido: sem fuzzy/acentos. Trocar por um matcher de verdade
      // quando o histórico ficar grande o bastante para dar falso positivo.
      const days =
        byExercise.get(key) ??
        [...byExercise.entries()].find(([k]) => k.includes(key) || key.includes(k))?.[1];
      if (!days) return { ok: true, kind: 'data', data: { exercise: args.exercise, sessions: [] } };

      const sessions = [...days.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, args.limit ?? DEFAULT_HISTORY_SESSIONS)
        .map(([date, session]) => ({ date, ...session.totals }));
      return {
        ok: true,
        kind: 'data',
        data: { exercise: [...days.values()][0]?.name ?? args.exercise, sessions },
      };
    },
  }),

  readSavedMeals: defineTool({
    // NÃO é a geladeira. São refeições que o usuário salvou; não há estoque,
    // nem quantidade, nem preço. Geladeira depende do intent `purchase`
    // (ROADMAP.md:120-123), que não existe.
    description: 'Meals the user saved and can repeat, with their nutrition.',
    args: z.object({ limit: z.number().int().min(1).max(MAX_SAVED_MEALS).optional() }),
    build: async (args, deps) => {
      const meals = await deps.savedMeals.all(); // já vem ORDER BY createdAt DESC
      return {
        ok: true,
        kind: 'data',
        data: meals.slice(0, args.limit ?? DEFAULT_SAVED_MEALS).map((meal) => ({
          id: meal.id,
          name: meal.name,
          items: meal.data.items.map((item) => item.label),
          totals: sumFoodData(meal.data),
        })),
      };
    },
  }),
} satisfies Record<string, Tool>;
```

**Helpers de leitura** (reusam `sumFoodData` `food.ts:57`, `foodConfig`/`workoutConfig.addToTotals` — nenhuma aritmética nova):

```ts
function isFoodEntry(entry: Entry): entry is Entry & { data: FoodData } {
  return entry.status === 'done' && !!entry.data && 'items' in entry.data;
}

function isWorkoutEntry(entry: Entry): entry is Entry & { data: WorkoutData } {
  return entry.status === 'done' && !!entry.data && 'sets' in entry.data;
}

function foodDay(date: string, entries: Entry[]) {
  const done = entries.filter(isFoodEntry);
  return {
    date,
    domain: 'food' as const,
    entries: done.map((entry) => ({
      id: entry.id,
      text: entry.text,
      items: entry.data.items.map((item) => item.label),
      totals: sumFoodData(entry.data),
    })),
    totals: done.reduce((acc, e) => foodConfig.addToTotals(acc, e.data), foodConfig.emptyTotals),
  };
}

function workoutDay(date: string, entries: Entry[]) {
  const done = entries.filter(isWorkoutEntry);
  return {
    date,
    domain: 'workout' as const,
    entries: done.map((entry) => ({
      id: entry.id,
      text: entry.text,
      exercise: entry.data.exercise,
      kind: entry.data.kind,
      sets: entry.data.sets,
    })),
    totals: done.reduce(
      (acc, e) => workoutConfig.addToTotals(acc, e.data),
      workoutConfig.emptyTotals,
    ),
  };
}
```

**Dispatch e catálogo:**

```ts
export type ToolName = keyof typeof toolRegistry;

const TOOL_NAMES = Object.keys(toolRegistry) as ToolName[];

export function isToolName(value: string): value is ToolName {
  return TOOL_NAMES.includes(value as ToolName);
}

export async function invokeTool(
  name: string,
  raw: unknown,
  deps: ToolDeps,
): Promise<ToolResult> {
  if (!isToolName(name)) return { ok: false, error: TOOL_ERROR.unknown, detail: name };
  return toolRegistry[name].invoke(raw, deps);
}

export interface ToolDescription {
  name: ToolName;
  description: string;
  /** JSON Schema draft-07. */
  parameters: Record<string, unknown>;
}

/**
 * O mesmo schema que valida a resposta descreve a pergunta. Derivado, não
 * escrito à mão — é o que impede a descrição e a validação de divergirem.
 *
 * Construído aqui e não em `defineTool` porque `toJSONSchema` pode lançar em
 * tipos irrepresentáveis; na inicialização do módulo isso derruba o app, numa
 * chamada explícita é só um erro (e um teste pega).
 */
export function toolCatalog(): ToolDescription[] {
  return TOOL_NAMES.map((name) => ({
    name,
    description: toolRegistry[name].description,
    parameters: z.toJSONSchema(toolRegistry[name].args, { target: 'draft-07', io: 'input' }),
  }));
}
```

Verificado executando contra o zod instalado: `z.toJSONSchema(schema, { target: 'draft-07', io: 'input' })` devolve objeto com `Object.keys === ['$schema','type','properties','required']` — a propriedade `~standard` **não** é enumerável, então `JSON.stringify` do catálogo sai limpo. `JSONSchema` tem index signature `[k: string]: unknown` (`node_modules/zod/v4/core/json-schema.d.ts:4`), logo atribui a `Record<string, unknown>` sem cast.

#### 4. Wiring — `src/core/command/bus.ts`

**Hoje** o arquivo termina em `:26` com o fechamento do `new CommandBus({...})`. **Acrescentar** (imports novos: `todayISO` de `@/core/date`, `SavedMealRepository`, `type ToolDeps`):

```ts
/** O único lugar que sabe que as ferramentas falam com SQLite de verdade. */
export const appToolDeps: ToolDeps = {
  bus,
  entries: EntryRepository,
  savedMeals: SavedMealRepository,
  today: todayISO,
};
```

Sem ciclo de import: `registry.ts` importa `CommandBus` **só como tipo** e nunca importa `bus.ts`.

---

### Comportamento

**O que o usuário vê hoje, depois destas quatro entregas: nada.** Não há chamador em produção do registro. As entregas 1–3 do roadmap são refatoração interna que vale por si (`ROADMAP.md:234-235`); a 4 é leitura pura. O que muda de observável:

- **Undo de ação multi-passo:** um composite consome **uma** entrada da pilha (`MAX_UNDO = 20`, `CommandBus.ts:23`) e sai inteiro. `undo(expected)` (`CommandBus.ts:88-94`) continua funcionando: passe o próprio composite.
- **Falha no meio do composite:** nada fica na tela e nada fica no banco — os filhos que já rodaram são desfeitos em ordem inversa e o erro original é relançado. `run()` rejeita, a pilha de undo fica intacta.
- **Sete haptics.** `applyResolved` dispara `onResolved?.()` por entry resolvida (`CommandBus.ts:351` → `bus.ts:23-25`). Um plano de 7 dias vibra 7 vezes conforme cada enrich retorna. Não é bug, é aceitável hoje (espalhado no tempo de rede); quando houver UI de plano, silenciar por composite.
- **Enrich dedupado de graça:** 3 dias com "supino reto 4x80" compartilham a mesma promise em voo e o mesmo LRU (`CommandBus.ts:171-180`), porque a chave é `domain + locale + userContext + texto normalizado` — data não entra. Correto: o parse do texto não depende do dia.
- **Ferramenta de leitura num dia vazio:** `readDay` devolve `{ date, domain, entries: [], totals: <zerados> }` — nunca erro. `readExerciseHistory` de exercício desconhecido devolve `{ exercise, sessions: [] }`.
- **Entries `thinking`/`queued`/`error` não aparecem nas leituras** — os filtros exigem `status === 'done'` e `data` válido, igual a `sessionsByExercise` (`workoutProgress.ts:82`). O modelo nunca lê uma nota que ainda não foi interpretada.
- **Quando o modelo erra os argumentos:** `invokeTool` devolve `{ ok: false, error: 'tool.args', detail: <mensagem zod legível> }`. Não lança. Nome inexistente → `{ ok: false, error: 'tool.unknown', detail: <nome> }`.

**Buraco de UI que a entrega 2 expõe (ler antes de usar `date` no futuro):** `useDay` só carrega o dia visível (`useDay.ts:16-24`) e a navegação trava em hoje — `goNext` só avança `if (next <= todayISO())` (`useDay.ts:41-44`) e `canGoNext: day.date < todayISO()` (`:50`). **Uma entry gravada em data futura fica no SQLite e é inalcançável pela UI.** O parâmetro `date` é correto e testável hoje; "monte meu treino da semana inteira" só faz sentido depois que alguém decidir conscientemente liberar a navegação para o futuro. Não faça essa mudança dentro desta área — é decisão de produto, e mexe em `canGoNext`, no rótulo do header e no botão "hoje".

### Migração de dados

**Nenhuma.** Nada a fazer.

- **Schema SQLite inalterado.** `entries.date TEXT NOT NULL` (`db.ts:14`) sempre aceitou qualquer data; `insertRow` (`EntryRepository.ts:81-98`) nunca filtrou. O índice `idx_entries_day (domain, date)` (`db.ts:23`) já serve `findByDate` para datas passadas e futuras.
- **Nenhuma chave nova em `settings`.** As existentes seguem em `useAppStore.ts:47-53`.
- **Compatível com base existente em ambos os sentidos.** Bases antigas continuam lendo; entries escritas por ferramenta são linhas comuns — mesmo formato, mesmo enrich, mesma validação de `parseData` (`EntryRepository.ts:24-32`). Uma versão anterior do app instalada por cima não quebra: só não navega até datas futuras.
- **Nada persiste sobre ferramentas.** `toolRegistry` é código; `ToolResult` é efêmero. Não há tabela de tool calls, nem histórico de invocação. Quando o passo 5 precisar de auditoria, aí sim vira migração.

### Testes

| Arquivo de teste | O que verifica | Por que quebraria sem isso |
|---|---|---|
| `src/core/command/Command.test.ts` | `execute()` roda os filhos na ordem declarada | Ordem invertida faz as notas do plano aparecerem trocadas; `createdAt` é `now()` (mockável) e desempata a lista. |
| idem | `undo()` desfaz em ordem **inversa** | Undo em ordem direta pode remover algo de que um filho posterior depende; é o contrato clássico do padrão e ninguém revisaria isso de novo. |
| idem | filho 3 de 5 lança → os 2 anteriores são desfeitos e o erro original é relançado | **O teste mais importante do lote.** Sem ele, um plano parcial fica no banco sem undo nenhum (o bus só empilha depois do `execute`) e o usuário vê 2 dos 5 dias sem saber por quê. |
| idem | falha no rollback de um filho não engole o erro original | Diagnóstico: relançar o erro do rollback esconderia a causa real. |
| `src/core/command/CommandBus.test.ts` | `addEntry(text, 'food', undefined, '2026-07-10')` → `rows` tem a entry com `date: '2026-07-10'` e `day.food.entries` continua vazio | É exatamente a afirmação do roadmap (`ROADMAP.md:203-208`) que precisava de prova: SQLite grava, store descarta. |
| idem | o enrich de uma entry fora do dia visível chega a `done` **no repo** | `patch()` faz `repo.update` antes do lookup no store (`CommandBus.ts:363-366`); se alguém inverter, a entry de outro dia fica `thinking` para sempre. |
| idem | `addEntry` sem `date` continua carimbando o dia visível | Regressão do caminho que 100% da UI usa (`useDay.ts:27`). |
| idem | nota de workout sem nome de exercício, gravada em outra data, **não** herda o exercício do dia visível | O bug real de `lastExercise` (`CommandBus.ts:230`): um plano semanal nasceria com o contexto de hoje em todos os dias. |
| `src/core/tools/registry.test.ts` | `toolCatalog()` devolve uma descrição por ferramenta, cada uma com `parameters.type === 'object'`, e **não lança** | `z.toJSONSchema` lança em tipos irrepresentáveis: um schema de argumento "esperto" adicionado depois quebraria o catálogo silenciosamente até o dia da integração. |
| idem | `JSON.stringify(toolCatalog())` não contém `~standard` | Prova que o payload que vai para o prompt é limpo; se o zod mudar isso numa minor, o custo por chamada sobe sem ninguém notar. |
| idem | `invokeTool('nope', {}, deps)` → `{ ok: false, error: 'tool.unknown' }` | Nome vem do modelo. Lançar aqui derrubaria a tela. |
| idem | `addEntries` com `date: '2026-02-30'` → `{ ok: false, error: 'tool.args' }` | Fronteira de confiança. Regex feita à mão passaria (`Date.parse` rola para 02/03); `z.iso.date()` rejeita. É a razão de a data não ser um regex. |
| idem | `addEntries` com 32 itens → rejeitado; com 31 → aceito | Sem o teto, um modelo em loop escreve centenas de linhas no banco do usuário. |
| idem | `addEntries` com 7 itens → um `CompositeCommand`; após `bus.run` + `bus.undo()` o repo volta a zero | O teste ponta a ponta das entregas 1+2+3 juntas — é o cenário "plano da semana" inteiro. |
| idem | `addEntries` com `domain: 'onboarding'` → rejeitado | Deixar o modelo escrever nota de perfil corromperia `OnboardingProfile` sem passar pelo fluxo de onboarding. |
| idem | `readDay('food')` soma só entries `done` e ignora `thinking`/`error` | Somar uma entry sem `data` é `NaN` no prompt; e o modelo responderia sobre comida que o app ainda não interpretou. |
| idem | `readExerciseHistory('supino')` acha `"Supino reto"` e devolve as sessões da mais recente para a mais antiga, respeitando `limit` | Sem o match por substring a ferramenta responde `[]` na maioria das vezes e o modelo conclui "sem histórico"; sem a ordenação ele compara com a sessão errada. |
| idem | `readSavedMeals` respeita o `limit` padrão | Guarda de custo: `all()` não pagina (`SavedMealRepository.ts:118-124`). |

Alvo: as 26 suítes / 206 testes atuais continuam verdes, `tsc --noEmit` e `expo lint` limpos.

### Riscos

| Risco | Como detectar cedo |
|---|---|
| **Correlação de união no registro.** Se alguém "melhorar" `defineTool` expondo `S` no tipo `Tool` (ex.: `Tool<S>` no `Record`), o dispatch para de compilar e a tentação vira `as any`. | `tsc --noEmit` acusa na hora. A regra: se `ToolResult` deixar de ser o tipo de retorno uniforme de `invoke`, o desenho foi perdido. Manter o comentário do `defineTool`. |
| **Entry em data futura é invisível** (`useDay.ts:41-50`). Um plano semanal grava e some. | Teste manual: gravar em `todayISO()+1` e tentar navegar. Enquanto a UI não liberar o futuro, use `date` só para passado/hoje. |
| **`z.toJSONSchema` lança** com um schema de argumento futuro (`.transform`, `.refine` em posição ruim, `z.coerce`). | O teste do catálogo. Verificado agora: `.refine` sobrevive (o refinamento é só descartado do JSON Schema); `.trim()` e `z.coerce` **não foram verificados** — por isso os schemas desta entrega não usam nenhum dos dois. O trim continua onde sempre esteve, dentro de `createAddEntry`. |
| **Payload de leitura estourando o prompt.** `readExerciseHistory` chama `findAll('workout')` — a tabela inteira. | Hoje já existem dois chamadores de `findAll` (`WorkoutProgressSheet.tsx:34`, `WorkoutMonitorSheet.tsx:206`), então o custo não é novo, mas a resposta é. Os tetos (`limit`, `slice`) estão nos schemas. Se o histórico crescer, o próximo passo é `findRange(domain, from, to)` no `EntryRepository` — não agora. |
| **Rollback silencioso demais.** O `.catch(() => {})` no rollback do composite esconde falha de undo. | Deliberado: o erro que importa é o original. Se aparecer relato de "sumiu metade", o primeiro lugar a instrumentar é ali. |
| **Alguém liga `toolCatalog()` no prompt junto com esta entrega.** Aí o formato da conversa muda e o passo 5 entra pela porta dos fundos, sem desenho. | Revisar diff em `deepseek.ts` e `enrich+api.ts`: qualquer alteração nesses dois arquivos nesta entrega é sinal de escopo vazando. |
| **`readSavedMeals` ser vendida como geladeira** na descrição para o modelo. | A descrição da ferramenta é literal ("meals the user saved"). Se virar "what the user has at home", o modelo passa a prometer receitas com ingredientes que não existem em lugar nenhum do banco. |

**Assinaturas reservadas, não implementar agora:** `deleteEntry({ id })` e `editEntry({ id, text })` — ambas dependem de `readDay` ter entregado o id ao modelo primeiro, e de uma decisão sobre se um modelo pode apagar dado do usuário sem confirmação. Quando entrarem, entram como mais duas chaves em `toolRegistry` e mais nada: é para isso que o registro existe.

---

## Fase 2 — Estender a coleta do onboarding

Li os arquivos. Aqui está a especificação.

## Coleta estendida do onboarding — Fases A, B, C

### Pré-requisitos

**1. Corrigir `VALID_IDS` do draft antes de qualquer coisa.**
`src/domains/onboardingDraft.ts:23-33` lista 9 ids e **falta `'micronutrients'`**. Hoje, quem escolhe micronutrientes e fecha o app perde a resposta no restore *e* a pergunta é refeita. Adicionar 13 ids novos a uma lista mantida à mão que já está fora de sincronia garante repetir o bug. Corrigir + travar com teste (ver seção Testes) é pré-requisito, não melhoria opcional.

**2. `normalizeOnboardingProfile` é o único ponto de estrangulamento — confirmar que continua sendo.**
Todo caminho de leitura passa por ela: `parseOnboardingProfile` (`src/store/useAppStore.ts:216-223`), `completeOnboarding` (`:178`), `updateOnboardingProfile` (`:199`), `buildOnboardingSummary` (`src/core/onboarding.ts:141`), `buildOnboardingPromptContext` (`:189`). É por isso que campos novos com default em `defaultOnboardingProfile()` migram sozinhos — o `{ ...base, ...profile }` de `onboarding.ts:110-119` já é a migração. Não inventar migração nova.

**3. Fases B e C não têm consumidor.** O próprio ROADMAP.md:294-302 põe Fase B depois da Fase 0 (abrir os 3 portões de `CommandBus.ts:166`, `:249`, `deepseek.ts:192`, `:204`). Coletar equipamento e lesão antes disso é cobrar pedágio por dado que ninguém lê — e lesão é dado de saúde (ROADMAP.md:312). **Recomendação: mergear as Fases A/B/C como código, ligar só A.** Especifico o flag abaixo.

---

### Arquivos

| arquivo | ação | o que exatamente muda |
|---|---|---|
| `src/core/onboarding.ts` | editar | 6 type aliases novos; 14 campos em `OnboardingProfile`; 2 defaults em `defaultOnboardingProfile`; guarda de array em `normalizeOnboardingProfile`; 4º parâmetro `domain` em `buildOnboardingPromptContext` + linhas novas. **`buildOnboardingSummary` não é tocada.** |
| `src/domains/onboardingQuestions.ts` | editar | 13 ids em `QuestionId`; kind `'list'`; `QUESTION_IDS` exportado; entradas em `COLOR`/`ASK`; blocos em `buildQuestions` atrás de `PHASES`; `splitList`; campos novos em `profileFromAnswers` |
| `src/components/organisms/OnboardingOutliner.tsx` | editar | um bloco novo para `kind === 'list'` (TextInput que grava no blur), prop `onList`, `useState` local do texto cru |
| `src/components/templates/OnboardingTemplate.tsx` | editar | uma linha: `onList={(items) => answer(question.id, items)}` |
| `src/domains/onboardingDraft.ts` | editar | `VALID_IDS` passa a ser `QUESTION_IDS` importado (ou lista corrigida + teste de paridade) |
| `src/components/onboarding/onboardingContent.ts` | editar | `trainingLevelOptions`, `workoutGoalOptions`, `environmentOptions`, `equipmentOptions`, `cookingSkillOptions`, `budgetOptions` — mesmo formato de `activityOptions` (`:220-262`) |
| `src/i18n/index.ts` | editar | ~13 chaves `onboarding.ask.*` + ~10 `onboarding.hint.*` em **pt-BR e en-US** |
| `src/components/organisms/settings/HealthProfileSheet.tsx` | editar | uma `Section` nova com 3 `SettingsRow` (weightUnit, trainingLevel, workoutGoal) reusando `OptionMenu` |
| `src/domains/workout.ts` | editar | `parseWorkoutSetLines(lines, unitHint = 'kg')` — parâmetro, nada mais |
| `src/components/molecules/WorkoutOutliner.tsx` | editar | `:253` passa o `weightUnit` do perfil |
| `src/core/onboarding.test.ts` | editar | testes de compat + prompt |
| `src/domains/onboardingQuestions.test.ts` | editar | testes de script + list |
| `src/domains/onboardingDraft.test.ts` | editar | teste de paridade com `QUESTION_IDS` |

Sem arquivo novo. Sem tabela SQLite nova. Sem chave de settings nova.

---

### Trechos

#### 1. `src/core/onboarding.ts` — tipos

Hoje, `:23-37`:

```ts
export interface OnboardingProfile {
  gender: OnboardingGender;
  birthDate: string;
  heightCm: number;
  weightKg: number;
  goalWeightKg: number;
  goalDate: string | null;
  activity: OnboardingActivity;
  considerations: OnboardingConsideration[];
  notes: string;
  estimationBias: OnboardingBias;
  trackMicronutrients: boolean;
  micronutrients: OnboardingMicronutrients;
  micronutrientTargets: OnboardingMicronutrientTargets;
}
```

Vira (adições ao fim, nada removido, nada reordenado):

```ts
export type OnboardingWeightUnit = 'kg' | 'lb';
export type OnboardingTrainingLevel = 'beginner' | 'intermediate' | 'advanced';
export type OnboardingWorkoutGoal = 'hypertrophy' | 'strength' | 'endurance' | 'weightLoss';
export type OnboardingEnvironment = 'fullGym' | 'basicGym' | 'home' | 'outdoor';
export type OnboardingEquipment = 'dumbbells' | 'barbell' | 'machines' | 'bands' | 'kettlebell';
export type OnboardingCookingSkill = 'none' | 'basic' | 'confident';
export type OnboardingBudget = 'tight' | 'normal' | 'flexible';

export interface OnboardingProfile {
  /* …os 13 campos atuais, intactos… */

  // Fase A
  weightUnit: OnboardingWeightUnit;          // default concreto: 'kg'
  trainingLevel?: OnboardingTrainingLevel;   // ausente = nunca perguntado
  workoutGoal?: OnboardingWorkoutGoal;
  // Fase B
  environment?: OnboardingEnvironment;
  equipment: OnboardingEquipment[];
  sportsLiked: string[];
  exercisesDisliked: string[];
  injuries: string[];
  // Fase C
  foodsLiked: string[];
  foodsDisliked: string[];
  restrictions: string[];
  cookingSkill?: OnboardingCookingSkill;
  budget?: OnboardingBudget;
}
```

**Por que escalares B/C são opcionais e não têm default.** `trainingLevel: 'beginner'` como default faria todo perfil já salvo *afirmar* que o usuário é iniciante. Um perfil antigo tem que ficar **calado**, não errado — a linha some do prompt em vez de mentir. `weightUnit` é a exceção: default `'kg'` reproduz exatamente o comportamento de hoje (`src/domains/workout.ts:245` e `:266` já usam `'kg'` como hint padrão), então o default não é uma afirmação nova.

**Por que as listas são `string[]` cru e não uniões fechadas.** `sportsLiked`, `injuries`, `foodsLiked` etc. terminam concatenadas num prompt de texto. Uma união fechada exigiria label i18n para cada item e ainda assim erraria o que a pessoa realmente tem. `equipment` é a exceção: os 5 valores do ROADMAP.md:90 cobrem quase tudo e um chip custa 1 toque contra ~8s de digitação. Se aparecer demanda por equipamento fora da lista, ele vira `kind: 'list'` e o tipo vira `string[]` — troca de uma linha.

#### 2. `src/core/onboarding.ts` — defaults

`:85-101` ganha, dentro do objeto retornado:

```ts
    weightUnit: 'kg',
    equipment: [],
    sportsLiked: [],
    exercisesDisliked: [],
    injuries: [],
    foodsLiked: [],
    foodsDisliked: [],
    restrictions: [],
```

Escalares opcionais **não entram** — ausente é o estado correto.

#### 3. `src/core/onboarding.ts` — guarda de array no normalize

Hoje, `:103-120`:

```ts
export function normalizeOnboardingProfile(profile: Partial<OnboardingProfile>): OnboardingProfile {
  const base = defaultOnboardingProfile();
  const legacyTrack = Boolean(profile.trackMicronutrients);
  const micronutrients = { ...base.micronutrients, ...(profile.micronutrients ?? micronutrientsFromTrack(legacyTrack)) };
  return {
    ...base,
    ...profile,
    micronutrients,
    micronutrientTargets: { ...base.micronutrientTargets, ...profile.micronutrientTargets },
    trackMicronutrients: Object.values(micronutrients).some(Boolean),
  };
}
```

Vira — mesmo corpo, mais um helper e um bloco de listas:

```ts
/** JSON de disco não é confiável: um valor não-array quebraria o `.map` do prompt. */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function normalizeOnboardingProfile(profile: Partial<OnboardingProfile>): OnboardingProfile {
  const base = defaultOnboardingProfile();
  const legacyTrack = Boolean(profile.trackMicronutrients);
  const micronutrients = { ...base.micronutrients, ...(profile.micronutrients ?? micronutrientsFromTrack(legacyTrack)) };
  return {
    ...base,
    ...profile,
    micronutrients,
    micronutrientTargets: { ...base.micronutrientTargets, ...profile.micronutrientTargets },
    trackMicronutrients: Object.values(micronutrients).some(Boolean),
    considerations: stringList(profile.considerations) as OnboardingConsideration[],
    equipment: stringList(profile.equipment) as OnboardingEquipment[],
    sportsLiked: stringList(profile.sportsLiked),
    exercisesDisliked: stringList(profile.exercisesDisliked),
    injuries: stringList(profile.injuries),
    foodsLiked: stringList(profile.foodsLiked),
    foodsDisliked: stringList(profile.foodsDisliked),
    restrictions: stringList(profile.restrictions),
  };
}
```

`considerations` entra na guarda de propósito: `onboarding.ts:192` já faz `profile.considerations.map(...)` sem proteção — se o JSON de disco corromper, **toda** enriquecimento de nota estoura hoje. São 8 arrays sob uma guarda de 3 linhas. É validação de fronteira; não simplificar fora.

#### 4. `src/core/onboarding.ts` — prompt context

Hoje, `:183-218` — assinatura e retorno:

```ts
export function buildOnboardingPromptContext(
  profile: OnboardingProfile | null,
  locale: string,
  today = todayISO(),
): string | undefined {
```

Vira, com **4º parâmetro posicional** (os 4 call sites existentes — `DayTemplate.tsx:477,687,793`, `SettingsSheet.tsx:347`, `bus.ts:17` — não mudam, e `onboarding.test.ts:28-39` que passa `today` posicionalmente continua verde):

```ts
export function buildOnboardingPromptContext(
  profile: OnboardingProfile | null,
  locale: string,
  today = todayISO(),
  domain: 'food' | 'workout' = 'food',
): string | undefined {
```

Dentro, antes do `return`, um bloco por fase. Cada linha só existe se o campo existir — é o que faz perfil antigo ficar calado:

```ts
  const shared = [
    profile.trainingLevel ? `trainingLevel=${profile.trainingLevel}` : '',
    profile.workoutGoal ? `workoutGoal=${profile.workoutGoal}` : '',
    profile.injuries.length ? `injuries/conditions (HARD constraint)=${profile.injuries.join(', ')}` : '',
  ];

  const workoutLines = [
    `weightUnit=${profile.weightUnit}`,
    profile.environment ? `environment=${profile.environment}` : '',
    profile.equipment.length ? `equipment=${profile.equipment.join(', ')}` : '',
    profile.sportsLiked.length ? `sportsLiked=${profile.sportsLiked.join(', ')}` : '',
    profile.exercisesDisliked.length ? `exercisesDisliked=${profile.exercisesDisliked.join(', ')}` : '',
  ];

  const foodLines = [
    profile.restrictions.length ? `restrictions (HARD constraint)=${profile.restrictions.join(', ')}` : '',
    profile.foodsLiked.length ? `foodsLiked=${profile.foodsLiked.join(', ')}` : '',
    profile.foodsDisliked.length ? `foodsDisliked=${profile.foodsDisliked.join(', ')}` : '',
    profile.cookingSkill ? `cookingSkill=${profile.cookingSkill}` : '',
    profile.budget ? `budget=${profile.budget}` : '',
  ];
```

e o array de retorno existente (`:201-215`) ganha, antes do `.filter(Boolean).join('\n')`:

```ts
    ...shared,
    ...(domain === 'workout' ? workoutLines : foodLines),
```

Nota de precisão: o cabeçalho `'Perfil nutricional local do usuário:'` (`:202`) precisa virar `'Perfil do usuário:'` / `'Local user profile:'` quando `domain === 'workout'` — senão a IA de treino recebe um bloco anunciado como nutricional. O teste existente `onboarding.test.ts:41` checa `targets=2518 kcal`, não o cabeçalho, então não quebra.

`restrictions` e `injuries` levam `(HARD constraint)` no rótulo porque ROADMAP.md:93 e :155 dizem que são restrição dura. O modelo não infere isso do nome do campo.

**`buildOnboardingSummary` (`:137-181`) não muda.** Nenhum campo novo entra em caloria, macro ou água. Isso é o que protege os números congelados de `onboarding.test.ts:19-24` (`bmr 2122`, `calories 2518`, `protein 153`, `carbs 333`, `waterMl 3450`). Se um campo novo mexer no cálculo, esses 5 números mudam e o teste vira sinal de regressão sem contexto. A ponte `workoutGoal → dieta` é Fase 2 do roadmap, não desta área.

#### 5. `src/domains/onboardingQuestions.ts` — ids e kinds

Hoje `:26-36` e `:43`:

```ts
export type QuestionId =
  | 'gender' | 'birthDate' | 'heightCm' | 'weightKg' | 'goalWeightKg'
  | 'goalDate' | 'activity' | 'considerations' | 'micronutrients' | 'estimationBias';

export type QuestionKind = 'choice' | 'multi' | 'picker' | 'date' | 'bias';
```

Vira — array como fonte de verdade, tipo derivado:

```ts
export const QUESTION_IDS = [
  'gender', 'birthDate', 'heightCm', 'weightKg', 'goalWeightKg', 'goalDate',
  'activity', 'considerations', 'micronutrients', 'estimationBias',
  // Fase A
  'weightUnit', 'trainingLevel', 'workoutGoal',
  // Fase B
  'environment', 'equipment', 'sportsLiked', 'exercisesDisliked', 'injuries',
  // Fase C
  'foodsLiked', 'foodsDisliked', 'restrictions', 'cookingSkill', 'budget',
] as const;

export type QuestionId = (typeof QUESTION_IDS)[number];

/** `list`: texto livre virando itens. É o único kind novo — chips já existem em `multi`. */
export type QuestionKind = 'choice' | 'multi' | 'picker' | 'date' | 'bias' | 'list';

export const splitList = (text: string): string[] =>
  text.split(',').map((item) => item.trim()).filter(Boolean);
```

`COLOR` (`:69-80`) e `ASK` (`:82-93`) são `Record<QuestionId, string>` — o `tsc` **exige** as 13 entradas novas nos dois. É a rede de segurança principal contra esquecer metade da mudança. Não trocar por `Partial<Record<...>>`.

Ordem no script: Fase A **depois de `activity`** e antes de `considerations` (é contexto de treino, casa com a pergunta de atividade). B e C **depois de `estimationBias`**, no fim, porque são as caras e o usuário já viu o dock encher.

#### 6. `src/domains/onboardingQuestions.ts` — o flag de fase

`buildQuestions` (`:111-155`) hoje retorna um array literal. Vira o mesmo array literal, fatiado:

```ts
/** ponytail: uma constante em vez de feature-flag store. Fase B/C não têm
 *  consumidor (ROADMAP 3.2 — os 3 portões da IA de treino estão fechados).
 *  Ligar quando a Fase 0 entrar; até lá o código existe e é testado, não roda. */
const PHASES: { A: boolean; B: boolean; C: boolean } = { A: true, B: false, C: false };

export function buildQuestions(lang: Lang): Question[] {
  const base = (id: QuestionId, kind: QuestionKind): Question => ({ /* inalterado */ });
  const fromOptions = (id: QuestionId, opts: readonly { value: string; label: Record<Lang, string> }[]) => ({
    ...base(id, 'choice'),
    options: opts.map((o) => ({ value: o.value, label: o.label[lang] })),
  });
  const openList = (id: QuestionId): Question => ({
    ...base(id, 'list'),
    optional: true,
    hint: t('onboarding.listHint' as 'onboarding.tap'),
  });

  return [
    /* …os 10 blocos atuais, na ordem atual, com Fase A inserida após 'activity'… */
    ...(PHASES.A ? [
      fromOptions('weightUnit', weightUnitOptions),
      fromOptions('trainingLevel', trainingLevelOptions),
      fromOptions('workoutGoal', workoutGoalOptions),
    ] : []),
    /* considerations, micronutrients, estimationBias — inalterados */
    ...(PHASES.B ? [
      fromOptions('environment', environmentOptions),
      { ...base('equipment', 'multi'), optional: true,
        options: equipmentOptions.map((o) => ({ value: o.value, label: o.label[lang], Icon: o.Icon })) },
      openList('sportsLiked'),
      openList('exercisesDisliked'),
      openList('injuries'),
    ] : []),
    ...(PHASES.C ? [
      openList('foodsLiked'),
      openList('foodsDisliked'),
      openList('restrictions'),
      fromOptions('cookingSkill', cookingSkillOptions),
      fromOptions('budget', budgetOptions),
    ] : []),
  ];
}
```

`trainingLevel` e `workoutGoal` levam `description` nas opções (`activityOptions` já faz isso, `:229-233`) — "intermediário" sem explicação é o usuário chutando.

`injuries` absorve `conditions`: ROADMAP.md:93 trata os dois como a mesma restrição dura e o consumidor é o mesmo. Uma pergunta, um campo. Segunda pergunta só quando algo distinguir os dois. **`conditions` não existe no tipo** — campo sem consumidor é dívida (ROADMAP.md:311).

#### 7. `src/domains/onboardingQuestions.ts` — `profileFromAnswers`

`:202-214` retorna um objeto literal. Ganha, ao fim, antes do `}`:

```ts
    weightUnit: (one('weightUnit') as OnboardingProfile['weightUnit']) ?? base.weightUnit,
    trainingLevel: one('trainingLevel') as OnboardingProfile['trainingLevel'],
    workoutGoal: one('workoutGoal') as OnboardingProfile['workoutGoal'],
    environment: one('environment') as OnboardingProfile['environment'],
    equipment: many('equipment') as OnboardingProfile['equipment'],
    sportsLiked: many('sportsLiked'),
    exercisesDisliked: many('exercisesDisliked'),
    injuries: many('injuries'),
    foodsLiked: many('foodsLiked'),
    foodsDisliked: many('foodsDisliked'),
    restrictions: many('restrictions'),
    cookingSkill: one('cookingSkill') as OnboardingProfile['cookingSkill'],
    budget: one('budget') as OnboardingProfile['budget'],
```

Os escalares opcionais **sem `?? base.x`** de propósito: não respondido tem que sair `undefined`. Os helpers `one`/`many`/`num` (`:188-200`) não mudam. `many` já devolve `string[]`, que é exatamente o que o kind `list` grava.

#### 8. `src/components/organisms/OnboardingOutliner.tsx` — kind `list`

O componente hoje tem 3 ramos no `subLines` (`:61-108` chips, `:110-130` sheet, `:132-149` texto de notas). Ganha um quarto. Duas mudanças no topo:

```ts
import { useState } from 'react';
// …
  onList?: (items: string[]) => void;
```

e, junto dos outros hooks (`:41-45`), incondicional:

```ts
  // A lista fica como texto cru enquanto se digita; só vira array ao sair do
  // campo. Escrever a cada tecla marcaria a pergunta como respondida na 1ª
  // letra, revelando o próximo bloco e disparando o scrollToEnd do template
  // (OnboardingTemplate.tsx:172) no meio da digitação.
  // ponytail: o custo é que texto não confirmado não entra no draft. Se isso
  // incomodar, gravar a cada tecla e suprimir o auto-scroll enquanto focado.
  const [listDraft, setListDraft] = useState(() => {
    const value = answers[question.id];
    return Array.isArray(value) ? value.join(', ') : '';
  });
```

O bloco novo, depois do de `allowsText` (`:149`):

```tsx
        {question.kind === 'list' ? (
          <View style={styles.subLine}>
            <View style={styles.subMarker}>
              <AppText variant="caption" color={colors.textTertiary}>{'+'}</AppText>
            </View>
            <TextInput
              value={listDraft}
              onChangeText={setListDraft}
              onEndEditing={() => onList?.(splitList(listDraft))}
              onBlur={() => onList?.(splitList(listDraft))}
              placeholder={question.hint}
              placeholderTextColor={colors.textTertiary}
              multiline
              style={[styles.notesInput, { color: colors.text }]}
              accessibilityLabel={question.question}
            />
          </View>
        ) : null}
```

Reusa `styles.subLine`, `styles.subMarker`, `styles.notesInput` (`:183-202`) — zero estilo novo. O ramo `:110-130` (sheet) é guardado por `question.options ? null :` — uma pergunta `list` não tem `options`, então cairia nele. **Trocar a guarda de `question.options ?` para `question.options || question.kind === 'list' ?`**, senão toda pergunta de lista ganha um "toque para escolher" morto por cima do campo.

O `key={question.id}` do template (`:175`) garante uma instância por pergunta, então o `useState` local nunca vaza texto de uma lista para outra.

#### 9. `src/components/templates/OnboardingTemplate.tsx`

Uma linha no `visible.map` (`:173-185`), ao lado de `onSkip`:

```tsx
                onList={(items) => answer(question.id, items)}
```

`answer` (`:95-96`) já aceita `string | string[]`. `pick` (`:98-112`) não muda — `list` não usa chips. `displayFor` (`:265-271`) não muda — sai cedo em `typeof value !== 'string'`.

#### 10. `src/domains/onboardingDraft.ts`

`:23-33` vira:

```ts
import { QUESTION_IDS, type Answers, type QuestionId } from './onboardingQuestions';
const VALID_IDS: readonly QuestionId[] = QUESTION_IDS;
```

Se importar valor de `onboardingQuestions` puxar a cadeia `onboardingContent → lucide-react-native → @/constants/theme` para dentro do teste de draft (que hoje só mocka `SettingsRepository`, `onboardingDraft.test.ts:5`) e o suite quebrar, a alternativa é manter a lista à mão **com `'micronutrients'` incluído** e travar a paridade no teste (ver Testes). Não deixar as duas listas divergentes de novo.

#### 11. `weightUnit` chegando ao parser

`src/domains/workout.ts:265-273` hoje:

```ts
export function parseWorkoutSetLines(lines: string[]): (WorkoutSet | null)[] {
  let lastUnit: 'kg' | 'lb' = 'kg';
```

Vira:

```ts
export function parseWorkoutSetLines(
  lines: string[],
  unitHint: 'kg' | 'lb' = 'kg',
): (WorkoutSet | null)[] {
  let lastUnit: 'kg' | 'lb' = unitHint;
```

`parseWorkoutText` (`:307`) repassa via nova opção `weightUnit` em `ParseWorkoutTextOptions` (`:275-278`); `CommandBus.ts:231` passa `weightUnit` junto de `locale`/`fallbackExercise`. `WorkoutOutliner.tsx:253` passa `useAppStore.getState().onboardingProfile?.weightUnit ?? 'kg'`.

Escopo deliberado: `weightUnit` muda **o hint do parser e a linha do prompt**, não a exibição. Converter todo display kg↔lb (`formatWorkoutSet` `:52`, `getWorkoutSetVolume` `:90`, `formatWeight` de settings, `PickerSheet`) é outra área inteira. O default `'kg'` mantém o comportamento atual bit a bit.

---

### Comportamento

**Fase A ligada (o que vai ao ar).** Depois de "qual é o seu nível de atividade?", três blocos novos, cada um 1 toque: *kg ou lb?* / *iniciante, intermediário ou avançado?* / *hipertrofia, força, resistência ou emagrecer?*. Cada opção escolhida revela sua linha de explicação indentada, igual `activity` faz hoje. O onboarding vai de 10 para 13 perguntas, ~+12s.

**Fase B/C (código pronto, `PHASES` desligado).** Ligar acrescenta 10 blocos: 3 de escolha (1 toque), 1 de chips múltiplos, 6 de texto livre. As 6 de texto são as caras: ~10-15s cada se respondidas. **Onboarding de 13 → 23 perguntas, +90s.** Todas as 10 são `optional: true`, então "pular" resolve cada uma com 1 toque — mas 10 toques de "pular" é uma experiência pior que não perguntar.

**Pergunta de lista.** Bloco com bullet, o campo de texto abaixo com placeholder ("ex: joelho direito, ombro esquerdo") e a linha "pular". Digita separando por vírgula; ao sair do campo (teclado fechado ou toque fora) o texto vira itens e o próximo bloco aparece. Voltar ao campo depois mostra o texto como estava — sem reformatação surpresa no meio da digitação.

**Bordas.**
- Texto só com vírgulas e espaços → `splitList` filtra vazios → `[]` → equivale a pular. Não trava o script (`currentQuestion` avança por `id in answers`, `onboardingQuestions.ts:170`).
- Apagar tudo de uma lista já respondida → grava `[]` no blur → a pergunta volta a `isAnswered === false` mas continua visível e o script segue. Idêntico ao comportamento de desmarcar todos os chips de `considerations` hoje.
- Fechar o app com texto digitado e não confirmado (sem blur) → o texto se perde, a pergunta reaparece vazia. Consequência aceita do gravar-no-blur; está anotada no código.
- Rodar com `PHASES.B = false` e um draft salvo por uma build com `B = true` → `parseDraft` mantém as respostas (o id está em `QUESTION_IDS`) mas `buildQuestions` não devolve o bloco; `currentQuestion` ignora e `profileFromAnswers` grava os campos no perfil mesmo assim. Nada quebra; o dado só não é mostrado.

**Falha.** `onboarding_profile` corrompido no SQLite: `parseOnboardingProfile` (`useAppStore.ts:216-223`) já cai no `catch` e devolve `null` → perfil default. JSON válido mas com `injuries: "joelho"` (string em vez de array): `stringList` devolve `[]` em vez de estourar `.map` no prompt de toda nota. É por isso que a guarda existe.

---

### Migração de dados

**Schema SQLite: nenhuma mudança.** A tabela `settings` é key/value TEXT (`src/data/SettingsRepository.ts:7-17`); o perfil inteiro é um JSON num valor.

**Chaves: nenhuma nova.** `onboarding_profile` (`useAppStore.ts:50`) e `onboarding_draft` (`onboardingDraft.ts:14`) continuam iguais, com o mesmo formato externo.

**Compatibilidade com base existente — os três casos:**

| o que está no disco | o que acontece | por quê |
|---|---|---|
| Perfil salvo por build antiga (13 campos) | Ganha `weightUnit: 'kg'` e as 7 listas vazias; escalares B/C ficam `undefined` | `{ ...base, ...profile }` em `onboarding.ts:110` — `base` vem de `defaultOnboardingProfile()`, que agora tem os defaults. `JSON.stringify` nunca grava `undefined`, então nenhuma chave ausente sobrescreve o default |
| Perfil antigo lido pelo prompt | `weightUnit=kg` aparece (só no domínio treino); nenhuma linha de nível/objetivo/lesão/restrição | Cada linha nova é condicional ao campo existir. Perfil antigo fica calado em vez de afirmar `trainingLevel=beginner` |
| Draft salvo por build antiga | Restaura normalmente; ids novos simplesmente não estão lá | `parseDraft` (`onboardingDraft.ts:40-60`) itera `VALID_IDS` e ignora ausentes |

**Downgrade.** Instalar uma build antiga sobre um perfil novo: `{ ...base, ...profile }` mantém os campos desconhecidos no objeto em memória e eles voltam ao disco no próximo `JSON.stringify` — o dado sobrevive a ida e volta. Nenhum código antigo lê campo que não conhece.

**Nada é apagado, nada é renomeado, nenhum script roda no boot.** Se a especificação exigisse migração, seria sinal de que o formato foi quebrado.

---

### Testes

| arquivo de teste | o que verifica | por que quebraria sem isso |
|---|---|---|
| `src/core/onboarding.test.ts` | `normalizeOnboardingProfile({ gender: 'female', weightKg: 70 })` (perfil "antigo") devolve `weightUnit === 'kg'`, `injuries === []`, `trainingLevel === undefined` | É o contrato de migração inteiro. Sem ele, um default mal colocado transforma todo usuário existente num "iniciante" e ninguém percebe |
| `src/core/onboarding.test.ts` | Os 5 números congelados de `buildOnboardingSummary` (`:19-24`) continuam 2122/2518/153/333/3450 depois dos campos novos | Único guarda contra um campo de Fase A vazar para o cálculo calórico. Já existe — não relaxar |
| `src/core/onboarding.test.ts` | `normalizeOnboardingProfile({ injuries: 'joelho' as never, considerations: null as never })` devolve `[]` nos dois e `buildOnboardingPromptContext` do resultado não estoura | JSON corrompido quebraria o enriquecimento de **toda** nota, não só a tela de perfil. É a fronteira de confiança |
| `src/core/onboarding.test.ts` | `buildOnboardingPromptContext(perfilCompleto, 'pt-BR', hoje, 'workout')` contém `equipment=`, `weightUnit=`, `injuries/conditions (HARD constraint)=` e **não** contém `foodsLiked` nem `restrictions` | Sem isso a IA de comida recebe a lista de halteres em toda nota — token pago, ruído, e o campo pode influenciar a resposta errada |
| `src/core/onboarding.test.ts` | `buildOnboardingPromptContext(perfilAntigo, …)` não contém `trainingLevel` nem `workoutGoal` | É a diferença entre "calado" e "mentindo". Sem o teste, alguém adiciona `?? 'beginner'` num refactor e o modelo passa a receber uma afirmação falsa |
| `src/domains/onboardingQuestions.test.ts` | `buildQuestions('pt-BR').map(q => q.id)` bate com a lista esperada para `PHASES` atual; toda pergunta tem `question` não-vazia e diferente da chave i18n | `t(ASK[id] as 'onboarding.ask.gender')` (`:115`) usa cast — chave errada vira `undefined` em runtime, não erro de `tsc`. Este é o único detector |
| `src/domains/onboardingQuestions.test.ts` | `profileFromAnswers({ injuries: ['joelho'], trainingLevel: 'advanced' }, base)` produz os campos; `profileFromAnswers({}, base).trainingLevel === undefined` | Prova o "não respondido = ausente" ponta a ponta, não só no normalize |
| `src/domains/onboardingQuestions.test.ts` | `splitList('  joelho ,, ombro , ')` → `['joelho', 'ombro']` | Único parser novo. Vírgula solta e espaço à toa são o caso comum, não o exótico |
| `src/domains/onboardingQuestions.test.ts` | Toda pergunta `kind === 'list'` tem `hint` e `optional === true` | Lista sem hint é campo em branco sem instrução; lista obrigatória trava o onboarding de quem não tem lesão nenhuma |
| `src/domains/onboardingDraft.test.ts` | `VALID_IDS` (via `parseDraft`) aceita **todo** id de `QUESTION_IDS`, incluindo `micronutrients` | É o bug de hoje. Sem trava de paridade ele volta na próxima pergunta adicionada — já voltou uma vez |
| `src/domains/onboardingDraft.test.ts` | `parseDraft` com `injuries: [1, 2]` devolve `{}` naquele id | O teste `:35-39` já cobre isso para `considerations`; estender a um id de lista prova que a regra vale para o kind novo |
| `src/domains/workout.test.ts` | `parseWorkoutSetLines(['100x8'], 'lb')[0].unit === 'lb'` e `parseWorkoutSetLines(['100x8'])[0].unit === 'kg'` | O default `'kg'` no parâmetro é o que garante zero mudança de comportamento para quem já usa. Um default trocado reinterpretaria todo log existente |

`testMatch` é `<rootDir>/src/**/*.test.ts` — só `.ts`. O bloco `list` do `OnboardingOutliner.tsx` **não terá teste de componente**; a lógica testável (`splitList`, `profileFromAnswers`) está fora do `.tsx` de propósito.

---

### Riscos

**A conta do pedágio é a Fase B/C, e ela não tem consumidor.** 10 perguntas, ~90s, incluindo dado de saúde, para alimentar prompts que hoje recebem `userContext: undefined` (`CommandBus.ts:249`) e são barrados por `domain === 'food'` (`deepseek.ts:192`, `:204`). Detecção antecipada: se ao ligar `PHASES.B` ninguém conseguir apontar a linha de código que lê `profile.equipment`, não ligue. O `PHASES` existe exatamente para tornar essa decisão reversível numa linha.

**`weightUnit` parece inócuo e não é.** Ele entra em `buildOnboardingPromptContext`, que entra no `hashKey` do cache (`CommandBus.ts:171-174`). Mudar a string do contexto **invalida todo o cache de enriquecimento existente** — o ROADMAP.md:56 já avisa disso para o caso do treino. Sintoma: primeira sessão depois do deploy fica lenta e queima quota. Detecção: comparar a saída de `buildOnboardingPromptContext(perfilAntigo, 'pt-BR', hoje)` antes e depois; para domínio `food`, com perfil antigo, ela tem que sair **byte a byte idêntica**. Vale um teste de snapshot dedicado.

**`updateOnboardingProfile` apaga com `undefined`.** `useAppStore.ts:192-198` faz `{ ...current, ...patch }`. Um patch com `trainingLevel: undefined` explícito zera o valor salvo. `HealthProfileSheet` passa o draft inteiro (`:100`), então não dispara hoje — mas qualquer chamada parcial nova pode. Detecção: teste em `useAppStore.test.ts` no estilo do `:38-44` ("a later write merges onto the earlier one") com um campo opcional.

**As 13 entradas de `COLOR` e `ASK` são obrigatórias, as 26 chaves i18n também — mas por caminhos diferentes.** `Record<QuestionId, string>` faz o `tsc` cobrar `COLOR`/`ASK`. As chaves i18n são cobradas porque `dict['en-US'][key]` (`i18n/index.ts:710`) não indexa chave faltante. Já `ASK[id]` apontar para uma chave **inexistente** passa pelo cast e vira `undefined` em runtime. Detecção: o teste de "question não-vazia" acima; sem ele o sintoma é um bullet com pergunta em branco no dispositivo.

**Ordem do script muda o `visible.slice`.** `OnboardingTemplate.tsx:93` mostra `questions.slice(0, activeIndex + 1)`. Inserir Fase A no meio muda o índice de `considerations` em diante. É por índice calculado, não literal, então funciona — mas `onboardingQuestions.test.ts:39` (`currentQuestion(questions.slice(5), answers)`) usa um `slice(5)` literal e **vai quebrar**. Ajustar esse teste é parte da mudança, não uma surpresa.

**`sportsLiked` como texto livre vira lixo de prompt.** "corrida, natação e as vezes jiu jitsu mas o joelho" numa lista de esportes. Nenhuma validação o impede — o campo é `string[]` por escolha. Aceitável enquanto o consumidor é um LLM; deixa de ser no momento em que algo tentar casar esses valores com uma tabela de exercícios.

---

## Fase 3 — Ponte treino → dieta

### Pre-requisitos

1. **Nada de schema novo, nada de coleta nova.** A ponte le o que ja esta gravado: `entries` do dominio `workout` na data (`EntryRepository.findByDate`, `src/data/EntryRepository.ts:102`) e `OnboardingProfile.weightKg`/`activity` (`src/core/onboarding.ts:23-37`). O roadmap lista Fase 2 como dependente da Fase 1 (`ROADMAP.md:296`) — **nao e**: `workoutGoal`/`trainingLevel` nao entram em nenhuma conta abaixo. Pode ser feita antes.
2. **Entender por que somar a queima inteira esta errado.** `activityMultiplier` (`src/core/onboarding.ts:64-69`) ja embute treino no TDEE. Quem declarou `high` (1.725) e treinou receberia o mesmo treino duas vezes. Toda a especificacao gira em torno disso.
3. **`useFoodGoals()` hoje nao recebe data** (`src/hooks/useFoodGoals.ts:5`) e tem exatamente 2 chamadores:
   - `src/components/organisms/FoodGoalsSheet.tsx:139` — renderizado em `DayTemplate.tsx:882` (onde `date` ja existe em escopo, ver `DayTemplate.tsx:885` que ja passa `date` para `WorkoutProgressSheet`) **e** em `OnboardingTemplate.tsx:195` (onde nao existe dia nenhum).
   - `src/components/organisms/settings/SettingsAccountCards.tsx:57` — Ajustes, sem dia.
   
   Logo a assinatura vira `useFoodGoals(date?: string)`, **opcional**. Sem data = alvo declarado (Ajustes e onboarding continuam corretos sem tocar em nada).

### Arquivos

| arquivo | acao | o que exatamente muda |
|---|---|---|
| `src/domains/trainingLoad.ts` | **criar** | ~85 linhas. Funcoes puras: `setBurnKcal`, `dayTrainingLoad`, `trainingAdjustment`. Todas as constantes calibraveis vivem aqui. |
| `src/domains/trainingLoad.test.ts` | **criar** | Suite nova (vira a 27a). |
| `src/core/onboarding.ts` | editar | Novo tipo `TrainingAdjustment` + `noTrainingAdjustment` + tabela `assumedTrainingKcal`/`assumedDailyTrainingKcal`. `buildOnboardingSummary` ganha 3o parametro com default. 2 linhas mudam dentro do corpo. |
| `src/core/onboarding.test.ts` | editar | +2 testes. |
| `src/domains/food.ts` | editar | `FoodGoals` ganha `trainingKcal`. `defaultFoodGoals` ganha `trainingKcal: 0`. `foodGoalsFromProfile` ganha 2o parametro com default. |
| `src/domains/totals.test.ts` | editar | +1 teste; o teste existente da linha 60 vira canario de regressao (nao alterar). |
| `src/domains/workout.ts` | editar | Exporta `isWorkoutData` (hoje duplicado privado em 2 arquivos). |
| `src/domains/workoutMonitor.ts` | editar | Apaga a copia privada (`:188-190`), importa de `./workout`. Zero mudanca de comportamento. |
| `src/domains/workoutProgress.ts` | editar | Idem (`:45-47`). |
| `src/hooks/useFoodGoals.ts` | editar | `date?: string`, leitura do dia de treino, `useMemo`. De 8 para ~35 linhas. |
| `src/components/organisms/FoodGoalsSheet.tsx` | editar | Prop `date?: string`; passa para o hook; nova linha "+374 cal · do treino de hoje" sob a barra de calorias. |
| `src/components/templates/DayTemplate.tsx` | editar | **1 linha** (882): passa `date={date}`. |
| `src/i18n/index.ts` | editar | 1 chave nova nos 2 dicts. |
| `src/components/templates/OnboardingTemplate.tsx` | **nao tocar** | Nao passa `date` -> alvo declarado. Correto: no onboarding nao ha log. |
| `src/components/organisms/settings/SettingsAccountCards.tsx` | **nao tocar** | `useFoodGoals()` sem data -> plano declarado. Correto: Ajustes mostra o plano, nao o dia. |

### Trechos

#### 1. `src/core/onboarding.ts` — tabela do que o multiplicador ja assume

Depois de `activityMultiplier` (linha 64-69), **adicionar**:

```ts
/**
 * O que um dia de treino REAL acrescenta ao alvo. Vem do log
 * (src/domains/trainingLoad.ts), nao da declaracao do onboarding.
 */
export interface TrainingAdjustment {
  /** kcal a somar ao alvo, ja liquido do que `activity` assume. */
  calories: number;
  /** g/kg extra de proteina num dia com levantamento de verdade. */
  proteinPerKg: number;
}

export const noTrainingAdjustment: TrainingAdjustment = { calories: 0, proteinPerKg: 0 };

/**
 * Quanto de TREINO cada nivel declarado ja embute no multiplicador, em kcal/dia.
 * Sem isso quem declarou "pesado" e treinou receberia o treino duas vezes.
 * ponytail: tabela calibravel — a fatia de treino dentro do gap ate 1.2 e
 * estimativa (o resto do gap e NEAT), nao derivacao. Mexer aqui se o alvo
 * do dia treinado ficar alto demais.
 */
const assumedTrainingKcal: Record<OnboardingActivity, number> = {
  sedentary: 0,
  light: 120,
  moderate: 250,
  high: 400,
};

export function assumedDailyTrainingKcal(activity: OnboardingActivity): number {
  return assumedTrainingKcal[activity];
}
```

#### 2. `src/core/onboarding.ts` — `buildOnboardingSummary`

Atual (`:137-140` e `:149-155`):

```ts
export function buildOnboardingSummary(
  profile: OnboardingProfile,
  today = todayISO(),
): OnboardingSummary {
...
  let calories = Math.round(tdeeBase + calorieAdjustment + biasAdjustment(profile.estimationBias));
  if (profile.considerations.includes('athlete')) calories += 180;
  calories = clamp(calories, 1400, 4200);

  let proteinPerKg = profile.considerations.includes('strength') ? 1.8 : 1.6;
  if (profile.considerations.includes('high-protein')) proteinPerKg += 0.15;
  const protein = Math.round(profile.goalWeightKg * proteinPerKg);
```

Vira:

```ts
export function buildOnboardingSummary(
  profile: OnboardingProfile,
  today = todayISO(),
  training: TrainingAdjustment = noTrainingAdjustment,
): OnboardingSummary {
...
  let calories = Math.round(tdeeBase + calorieAdjustment + biasAdjustment(profile.estimationBias));
  if (profile.considerations.includes('athlete')) calories += 180;
  calories += training.calories;
  calories = clamp(calories, 1400, 4200);

  let proteinPerKg = profile.considerations.includes('strength') ? 1.8 : 1.6;
  if (profile.considerations.includes('high-protein')) proteinPerKg += 0.15;
  proteinPerKg += training.proteinPerKg;
  const protein = Math.round(profile.goalWeightKg * proteinPerKg);
```

**Nao mexer em mais nada.** O bonus entra **antes** do `clamp` (teto de 4200 continua valendo) e a linha 160 (`carbs = Math.round((calories - protein * 4 - fat * 9) / 4)`) absorve o excedente sozinha — e por isso que o calculo mora aqui e nao num pos-processamento do `FoodGoals`: duplicar a formula do residuo em dois lugares e a maneira garantida de eles divergirem.

Os 6 chamadores existentes de `buildOnboardingSummary` (`food.ts:44`, `onboarding.ts:191`, `OnboardingTemplate.tsx:89`, `HealthProfileSheet.tsx:98`, `NutritionGoalsSheet.tsx:245`, `onboardingUtils.ts:29`) **nao mudam** — o default os mantem identicos.

#### 3. `src/domains/workout.ts` — guard exportado

Adicionar (`import type { Entry } from '@/core/types';` no topo — sem ciclo: `core/types` importa `domains/schemas`, nao `domains/workout`):

```ts
export function isWorkoutData(data: Entry['data']): data is WorkoutData {
  return Boolean(data && 'sets' in data);
}
```

Apagar as copias privadas em `workoutMonitor.ts:188-190` e `workoutProgress.ts:45-47`, importando de `./workout` (ambos ja importam desse modulo). Comportamento identico; e a 3a copia que dispara a limpeza.

#### 4. `src/domains/trainingLoad.ts` (novo)

```ts
import type { Entry } from '@/core/types';
import {
  assumedDailyTrainingKcal,
  noTrainingAdjustment,
  type OnboardingProfile,
  type TrainingAdjustment,
} from '@/core/onboarding';

import type { WorkoutSet } from './schemas';
import { isWorkoutData } from './workout';

/** ~1 kcal por kg de corpo por km percorrido — vale para corrida e caminhada. */
const KCAL_PER_KG_PER_KM = 1.036;
/** Cardio sem distancia registrada: so o tempo diz alguma coisa. */
const CARDIO_MET = 7;
/** Musculacao incluindo o descanso entre series. */
const STRENGTH_MET = 3.5;
/** Uma serie de trabalho mais o descanso dela. */
const SECONDS_PER_STRENGTH_SET = 180;
/**
 * So metade do gasto volta para o prato. Estimativa de queima erra para cima e
 * o apetite compensa; devolver 100% apaga o deficit justamente no dia treinado.
 * ponytail: knob principal desta ponte.
 */
const TRAINING_CREDIT = 0.5;
/** Teto de sanidade: "100km" digitado errado nao vira 5000 kcal de licenca. */
const MAX_TRAINING_BONUS_KCAL = 600;
const STRENGTH_PROTEIN_BONUS_PER_KG = 0.2;
const MIN_SETS_FOR_PROTEIN_BONUS = 8;

const kcalPerMinute = (met: number, weightKg: number): number => (met * 3.5 * weightKg) / 200;

/**
 * Uma serie, um gasto — nunca dois. Uma corrida traz distancia E duracao no
 * mesmo set; contar as duas dobrava o mesmo esforco.
 */
export function setBurnKcal(set: WorkoutSet, weightKg: number): number {
  if (set.distanceMeters) return (set.distanceMeters / 1000) * KCAL_PER_KG_PER_KM * weightKg;
  if (set.durationSeconds) return kcalPerMinute(CARDIO_MET, weightKg) * (set.durationSeconds / 60);
  if (set.reps !== undefined) {
    return kcalPerMinute(STRENGTH_MET, weightKg) * (SECONDS_PER_STRENGTH_SET / 60);
  }
  return 0;
}

export interface DayTrainingLoad {
  burnKcal: number;
  /**
   * Series com carga declarada. Peso corporal queima (entra no `burnKcal`) mas
   * nao dispara o bonus de proteina: o gatilho e levantamento, nao movimento.
   */
  strengthSets: number;
}

/** `entries` sao as notas de treino DO DIA. Pendentes e com erro nao contam. */
export function dayTrainingLoad(entries: Entry[], weightKg: number): DayTrainingLoad {
  return entries.reduce<DayTrainingLoad>(
    (load, entry) => {
      if (entry.status !== 'done' || !isWorkoutData(entry.data)) return load;
      return entry.data.sets.reduce<DayTrainingLoad>(
        (acc, set) => ({
          burnKcal: acc.burnKcal + setBurnKcal(set, weightKg),
          strengthSets: acc.strengthSets + (set.weight !== undefined ? 1 : 0),
        }),
        load,
      );
    },
    { burnKcal: 0, strengthSets: 0 },
  );
}

/**
 * Aditivo e nunca subtrativo: `max(0, ...)`. Um dia de descanso devolve o alvo
 * declarado, exatamente o de hoje — ninguem que so usa a aba de dieta perde
 * caloria por causa desta feature.
 */
export function trainingAdjustment(
  entries: Entry[],
  profile: OnboardingProfile,
): TrainingAdjustment {
  const load = dayTrainingLoad(entries, profile.weightKg);
  if (load.burnKcal <= 0) return noTrainingAdjustment;

  const net = load.burnKcal - assumedDailyTrainingKcal(profile.activity);
  const calories = Math.min(
    MAX_TRAINING_BONUS_KCAL,
    Math.max(0, Math.round(net * TRAINING_CREDIT)),
  );
  return {
    calories,
    proteinPerKg:
      load.strengthSets >= MIN_SETS_FOR_PROTEIN_BONUS ? STRENGTH_PROTEIN_BONUS_PER_KG : 0,
  };
}
```

**De onde sai cada numero — o que `workoutMonitor` ja faz vs o que faltava:**

| precisa | ja existe | onde |
|---|---|---|
| somar sets/volume/duracao/distancia de um dia | **sim** | `workoutConfig.addToTotals` (`workout.ts:351`), usado por `useTotals` |
| baldes por dia com sets/load/distancia/duracao | **sim** | `buildMonitorReport().weeks` (`workoutMonitor.ts:481-495`, granularidade `day`) |
| distinguir cardio de forca | **sim** | `WorkoutData.kind` (`schemas.ts:124`) e `isCardioSession` (`workoutProgress.ts:69`) |
| **converter esforco em kcal** | **nao existe em lugar nenhum** | e o unico calculo novo |
| **saber o que o `activityMultiplier` ja contou** | **nao existe** | tabela nova em `onboarding.ts` |

Por que **nao** reusar `buildMonitorReport`: ele e uma janela de 7/15/30 dias com foco, comparacao com janela anterior e 8 mapas intermediarios (`workoutMonitor.ts:292-680`) para responder "estou progredindo". Aqui a pergunta e "quanto este dia queimou". Rodar o relatorio inteiro para ler um balde e caro e acopla o alvo calorico ao `MonitorFocus`.

Por que **sets** e nao tonelagem para a proteina: o proprio `workoutMonitor.ts:32-37` ja documenta que tonelagem "nao tem faixa de referencia". 1 serie de leg press 200kg x 10 = 2000 kg contra 1 serie de elevacao lateral 8kg x 12 = 96 kg — usar tonelagem faria a proteina explodir no dia de perna.

#### 5. `src/domains/food.ts`

`FoodGoals` (`:18-27`) ganha um campo; `defaultFoodGoals` (`:32-41`) ganha `trainingKcal: 0`:

```ts
export interface FoodGoals {
  calories: number;
  // ...inalterado...
  sodiumMg: number;
  /** Quanto das calorias veio do treino do dia. 0 em dia de descanso. */
  trainingKcal: number;
}
```

`foodGoalsFromProfile` (`:43-55`) vira:

```ts
export function foodGoalsFromProfile(
  profile: OnboardingProfile,
  training: TrainingAdjustment = noTrainingAdjustment,
): FoodGoals {
  // `undefined` no 2o argumento cai no default `todayISO()` do proprio summary.
  const summary = buildOnboardingSummary(profile, undefined, training);
  return {
    calories: summary.calories,
    protein: summary.protein,
    carbs: summary.carbs,
    fat: summary.fat,
    waterMl: summary.waterMl,
    sugarG: summary.sugarG,
    fiberG: summary.fiberG,
    sodiumMg: summary.sodiumMg,
    trainingKcal: training.calories,
  };
}
```

`trainingKcal` fica em `FoodGoals` e **nao** em `OnboardingSummary`: `HealthProfileSheet` e `NutritionGoalsSheet` consomem o summary e ali o campo seria sempre 0 — ruido.

#### 6. `src/hooks/useFoodGoals.ts`

Atual (8 linhas, inteiro):

```ts
export function useFoodGoals() {
  const profile = useAppStore((s) => s.onboardingProfile) ?? defaultOnboardingProfile();
  return foodGoalsFromProfile(profile);
}
```

Vira:

```ts
import { useEffect, useMemo, useState } from 'react';

import { defaultOnboardingProfile } from '@/core/onboarding';
import type { Entry } from '@/core/types';
import { EntryRepository } from '@/data/EntryRepository';
import { type FoodGoals, foodGoalsFromProfile } from '@/domains/food';
import { trainingAdjustment } from '@/domains/trainingLoad';
import { useAppStore } from '@/store/useAppStore';

/**
 * Sem `date` devolve o alvo declarado — e o que Ajustes e o onboarding devem
 * mostrar. Com `date`, o alvo daquele dia: soma o treino efetivamente
 * registrado na data.
 */
export function useFoodGoals(date?: string): FoodGoals {
  const storedProfile = useAppStore((s) => s.onboardingProfile);
  const profile = useMemo(
    () => storedProfile ?? defaultOnboardingProfile(),
    [storedProfile],
  );
  // Sinal de mudanca, nao fonte: o store so conhece a aba de treino se ela ja
  // tiver sido aberta (`emptyDay()` afirma hoje com zero entradas,
  // useAppStore.ts:46), entao a leitura continua vindo do SQLite. Registrar uma
  // serie troca a identidade do array e re-dispara o efeito.
  // ponytail: um SELECT por mutacao de treino. Se pesar, o caminho e o store
  // publicar o dia de treino carregado.
  const workoutSignal = useAppStore((s) => s.workout.entries);
  const [dayWorkout, setDayWorkout] = useState<Entry[]>([]);

  useEffect(() => {
    if (!date) {
      setDayWorkout([]);
      return;
    }
    let alive = true;
    void EntryRepository.findByDate('workout', date).then((entries) => {
      if (alive) setDayWorkout(entries);
    });
    return () => {
      alive = false;
    };
  }, [date, workoutSignal]);

  return useMemo(
    () => foodGoalsFromProfile(profile, trainingAdjustment(dayWorkout, profile)),
    [dayWorkout, profile],
  );
}
```

O hook e deliberadamente burro: **toda** decisao esta em `trainingAdjustment` + `buildOnboardingSummary`, ambas puras e testadas. O que sobra aqui e fiacao (jest so roda `*.test.ts`, `package.json:testMatch`).

#### 7. `src/components/organisms/FoodGoalsSheet.tsx`

Props (`:27-30`) e a chamada (`:139`):

```ts
interface FoodGoalsSheetProps {
  totals: FoodTotals;
  visible: boolean;
  /** Sem data o painel mostra o alvo declarado (onboarding). */
  date?: string;
}

export function FoodGoalsSheet({ totals, visible, date }: FoodGoalsSheetProps) {
  const colors = useColors();
  const goals = useFoodGoals(date);
```

Dentro de `<View style={styles.caloriesBlock}>`, logo **apos** `<AnimatedCaloriesBar ... />` (`:173-177`):

```tsx
{goals.trainingKcal > 0 ? (
  <AppText variant="caption" color={colors.accent}>
    {`+${goals.trainingKcal} cal · ${t('goals.training')}`}
  </AppText>
) : null}
```

Sem essa linha o numero muda sozinho e vira ticket de bug. Nao e enfeite.

#### 8. `src/i18n/index.ts`

Junto de `"goals.over"` nos dois dicionarios (pt-BR `:192`, en-US `:531`):

```ts
"goals.training": "do treino de hoje",   // pt-BR
"goals.training": "from today's workout", // en-US
```

`Key` deriva de `pt-BR` (`:684`) e `t` indexa `dict[getLang()][key]` (`:710`) — esquecer o en-US **quebra o `tsc`**, nao passa silencioso.

#### 9. `src/components/templates/DayTemplate.tsx:882`

```tsx
{foodTotals ? <FoodGoalsSheet totals={foodTotals} visible={foodGoalsVisible} date={date} /> : null}
```

`date` ja esta em escopo desde `:244` (`useDay(config.id)`); a linha 885 vizinha ja o usa.

### Comportamento

**Exemplo trabalhado** (perfil default: homem, 98 kg, meta 85 kg, `activity: 'light'`, `considerations: ['strength']`; baseline verificado em `onboarding.test.ts:21-24` = 2518 cal / 153 P / 333 C / 64 G):

| dia | log | queima | bonus | alvo |
|---|---|---|---|---|
| descanso | nada | 0 | 0 | **2518 cal · 153 P · 333 C** (identico a hoje) |
| so cardio | 5 km em 30 min | 508 | `round((508-120)*0.5)` = 194 | 2712 cal · 153 P · 382 C |
| so forca | 12 series com carga | 216 | 48 | 2566 cal · **170 P** · 331 C |
| completo | 20 series + 5 km | 868 | 374 | **2892 cal · 170 P · 409 C** |

O usuario ve: abre a aba Dieta num dia treinado, toca no dock, o painel mostra `2892` no lugar de `2518` e, sob a barra, `+374 cal · do treino de hoje` no accent. As calorias extras caem quase todas em **carboidrato** (333 -> 409) porque carbo e o residuo (`onboarding.ts:160`) — que e o que se quer num dia de treino. Proteina sobe 153 -> 170 so quando houve levantamento com carga.

**Casos de borda:**

| caso | resultado |
|---|---|
| Dia de descanso | `noTrainingAdjustment`, alvo **byte-identico** ao de hoje. Nao ha regressao para quem so usa dieta. |
| Declarou `high`, treinou leve (12 series = 216 kcal) | `216 - 400 < 0` -> `max(0,·)` -> bonus **0**. Ja estava pago no multiplicador. Correto, e nunca negativo. |
| Declarou `sedentary`, treinou | assumido 0 -> credito integral de 50%. Correto. |
| Corrida com distancia **e** duracao no mesmo set | so a distancia conta (`setBurnKcal` retorna no 1o `if`). Sem essa ordem um 5k/30min contaria 508+360 = 868 em vez de 508. |
| Prancha 60 s (forca com duracao) | cai no ramo cardio: 3,4 kcal. Irrelevante, nao vale ramo proprio. |
| Barra fixa / flexao (so `reps`) | queima conta (18 kcal/serie); **nao** conta para o bonus de proteina (`set.weight !== undefined`). Assimetria intencional, documentada no tipo. |
| Nota `thinking`/`queued`/`error` | ignorada (`entry.status !== 'done'`). O alvo sobe quando o enrich resolve, nao antes. |
| Exercicio criado sem series (`sets: []`, valido por `schemas.ts:125-127`) | 0 kcal. |
| Nota de treino absurda ("100 km") | bonus travado em **600 kcal**; alem disso o `clamp(1400, 4200)` de `onboarding.ts:151` continua sendo a ultima linha. |
| Navegar para dia passado na aba Dieta | o efeito re-roda com o novo `date` e o alvo passa a ser o daquele dia. |
| Registrar um treino com a aba Dieta montada | `workoutSignal` troca de identidade -> efeito re-roda -> alvo sobe sem remount. |
| Tela de Ajustes | `useFoodGoals()` sem data -> plano declarado. `GoalsSummary` nao muda. |
| Onboarding | `FoodGoalsSheet` sem `date` -> alvo declarado. Nao ha log ainda. |
| **Falha do SQLite** | `.then` nunca resolve, `dayWorkout` fica `[]` -> alvo declarado. **Degrada para o comportamento de hoje**, nao para tela quebrada. Sem `.catch` porque `[]` ja e o fallback correto. |
| Primeiro frame | render 1 devolve o alvo declarado, render 2 o ajustado (~1 SELECT indexado). Numero pode piscar uma vez; o painel so aparece com `visible`. |

### Migracao de dados

**Nenhuma.** Explicitamente:

- **SQLite**: sem `ALTER TABLE`, sem migracao em `src/data/db.ts`. A tabela `entries` (`id, date, domain, text, media, status, data, error, createdAt`) ja tem tudo. A leitura usa `findByDate('workout', date)`, que ja existe e ja e usada por `useDay`.
- **Chaves de settings**: nenhuma nova. `onboarding_profile` guarda o mesmo JSON; `OnboardingProfile` nao ganha campo, entao `normalizeOnboardingProfile` (`onboarding.ts:103`) nao muda e perfis ja gravados continuam validos.
- **Base existente**: notas de treino antigas funcionam sem reprocessamento — `setBurnKcal` le `weight/reps/durationSeconds/distanceMeters`, campos que existem desde sempre em `setSchema` (`schemas.ts:77-88`). Nao depende de `primary`/`synergists` (que so aparecem em notas recentes) nem de `kind`.
- **Cache de enrich**: intocado. `userContext` nao muda, entao o `hashKey` do `CommandBus` nao invalida nada — ao contrario do alerta da secao 3.2 do `ROADMAP.md:56`, que vale para a Fase 0, nao para esta.
- **`FoodGoals.trainingKcal`** e derivado em memoria a cada render. Nunca persiste.

### Testes

| arquivo de teste | o que verifica | por que quebraria sem isso |
|---|---|---|
| `src/domains/trainingLoad.test.ts` (novo) | Corrida com distancia **e** duracao no mesmo set conta so a distancia (`5000 m` + `1800 s`, 98 kg -> ~508, nao ~868) | Sem isso o cardio conta em dobro e o alvo do dia de corrida vira ficcao. E o bug mais provavel de reintroduzir num refactor. |
| idem | 20 series com carga -> `strengthSets === 20`, `burnKcal ≈ 360` | Fixa a unidade do gasto de forca (por serie, nao por tonelagem). |
| idem | `activity: 'high'` + 12 series -> `calories === 0` | O anti-dupla-contagem e a razao de existir desta funcao; sem teste alguem "simplifica" o `max(0, ...)` fora. |
| idem | Entrada com `distanceMeters: 5_000_000` -> `calories === 600` | Teto de sanidade sobre dado que veio de parser/IA. Fronteira nao confiavel. |
| idem | Notas `thinking`/`error`/sem `sets` -> `noTrainingAdjustment` | Alvo subindo antes do enrich resolver, ou por nota que falhou, e dinheiro falso. |
| idem | 7 series com carga -> `proteinPerKg === 0`; 8 series -> `0.2` | Fixa o gatilho; sem isso um unico aquecimento levaria +17 g de proteina. |
| idem | Serie so com `reps` (peso corporal) queima > 0 mas nao dispara proteina | A assimetria e deliberada — sem teste ela vira "bug" e alguem a remove. |
| `src/core/onboarding.test.ts` (editar) | `buildOnboardingSummary(perfil, '2026-07-14', noTrainingAdjustment)` devolve **exatamente** 2518/153/333 (mesmos valores do teste da linha 14) | Canario: prova que o 3o parametro e neutro por default e que nenhum usuario atual teve o alvo mexido. |
| idem | Com `{ calories: 374, proteinPerKg: 0.2 }` -> `calories === 2892`, `protein === 170`, `carbs === 409` | Prova que o excedente cai no carboidrato pelo residuo. Se alguem mover o `+= training.calories` para depois do `clamp`, ou somar as calorias fora do summary, este teste cai. |
| idem | `{ calories: 5000 }` -> `calories === 4200` | O bonus entra **antes** do clamp. Ordem errada = alvo sem teto. |
| `src/domains/totals.test.ts` (editar) | Teste existente da linha 60 (`foodGoalsFromProfile` sem 2o argumento) **passa sem alteracao** | Regressao pura: a assinatura nova tem que ser retrocompativel. |
| idem | `foodGoalsFromProfile(perfil, { calories: 374, proteinPerKg: 0.2 })` -> `trainingKcal === 374` e `calories` maior que o baseline | Sem `trainingKcal` propagado, o painel nao consegue explicar por que o numero mudou. |
| `src/domains/workoutMonitor.test.ts` / `workoutProgress.test.ts` | Continuam verdes apos trocar o guard privado pelo exportado | Prova que a deduplicacao do `isWorkoutData` e neutra. |

Meta: 26 -> 27 suites, ~206 -> ~218 testes. `tsc --noEmit` e `expo lint` continuam limpos (o unico risco de tipo e a chave i18n faltando no en-US, que o proprio `tsc` pega).

### Riscos

| risco | como detectar cedo |
|---|---|
| **Constantes calibradas no chute.** `TRAINING_CREDIT = 0.5` e `assumedTrainingKcal` sao estimativas, nao derivacoes. Se erradas para cima, quem quer emagrecer come de volta o treino e o peso nao cai — a critica classica do MyFitnessPal. | Rodar o exemplo trabalhado acima antes de fechar: 20 series + 5 km num usuario de 98 kg deve dar bonus na faixa de 300-400, nao 800+. Se der acima de 500, `TRAINING_CREDIT` esta alto. Todas as constantes num bloco so no topo de `trainingLoad.ts` justamente para virarem uma linha de ajuste. |
| **Alvo pulsando na tela.** Render 1 declarado, render 2 ajustado. Se o SELECT demorar (base grande, cold start), o usuario ve `2518` virar `2892`. | Abrir a Dieta num dia com treino registrado, com o app recem-aberto. Se piscar visivelmente, o proximo passo e nao renderizar a barra ate `dayWorkout` resolver — nao trocar de arquitetura. |
| **Loop de efeito.** `workoutSignal` como dependencia. Se algum dia `setEntries` for chamado dentro de um efeito que dependa do estado local do hook, vira loop. | Hoje nao existe: o efeito so escreve `setDayWorkout` (estado local), nunca no store. Um `console` temporario de contagem de render no `FoodGoalsSheet` fecha a duvida em 30 segundos. |
| **Um SELECT por mutacao de treino.** Registrar 10 series = 10 leituras se as duas abas estiverem montadas. | Barato (indice `domain+date`, poucas linhas), mas se um dia pesar o caminho e o store publicar o dia de treino carregado, nao um cache novo. Marcado com `ponytail:` no codigo. |
| **Dupla contagem escondendo-se no `athlete`.** `considerations: ['athlete']` ja soma +180 kcal fixos (`onboarding.ts:150`). Quem marcou `athlete` **e** declarou `high` **e** treina recebe tres creditos parciais. | Teste com `considerations: ['athlete']` + `activity: 'high'` + treino pesado: o alvo nao deve passar de ~3600 para o perfil default. Se passar, o `+180` do `athlete` precisa entrar na tabela `assumedTrainingKcal` — mudanca de uma linha. |
| **Proteina disparada por aquecimento.** 8 series com carga inclui aquecimentos de 20 kg. | Aceito: 8 series e um limiar deliberadamente alto para um dia real. Se virar reclamacao, `MIN_SETS_FOR_PROTEIN_BONUS` sobe. |
| **`weightKg` corrompido no perfil.** `normalizeOnboardingProfile` faz spread sem validar faixa; um `weightKg: 4000` vindo do storage inflaria a queima. | Coberto pelo teto de 600 kcal — uma guarda so, no lugar por onde tudo passa, em vez de validacao repetida em cada chamador. |
| **Roadmap diz que Fase 2 depende da Fase 1.** Se o executor esperar a Fase 1, a entrega trava sem motivo. | Nenhuma linha desta especificacao le `workoutGoal`, `trainingLevel`, `weightUnit` ou `environment`. Atualizar `ROADMAP.md:296` para `Depende de: —` ao fechar. |

---

## Fase 4 — Intent de compra e geladeira virtual

### Pré-requisitos

Nada de código precede esta área — as duas fases não dependem de nenhuma outra do roadmap (`ROADMAP.md:299-300`). O que precisa existir é entendimento de três fatos verificados no código:

1. **`schemaByDomain[domain]` é o único validador de `entry.data`** — usado em `src/data/EntryRepository.ts:27` (leitura do disco), `src/core/command/CommandBus.ts:316` (resolução do enrich) e `src/core/enrich/deepseek.ts:223` (defesa em profundidade). Qualquer forma nova de dado de comida precisa passar pelos três, ou uma linha "done" é rebaixada para `error` na próxima leitura (`EntryRepository.ts:67`).
2. **Oito call sites distinguem comida de treino com `'items' in data`** — `NoteRow.tsx:38`, `routines.ts:8`, `DayTemplate.tsx:338/719/785`, `FoodEntryDetailSheet.tsx:146`, `AppModalHost.tsx:74`, `SettingsSheet.tsx:731`. Se o dado de compra também tiver `items`, os oito passam a mentir. **Por isso a chave de topo do schema de compra é `purchase`, não `items`** — é a decisão que faz o resto da mudança caber sem tocar em nenhum desses arquivos.
3. **`useTotals` soma cegamente** — `src/hooks/useTotals.ts:15` chama `config.addToTotals` para toda entrada `done`. O bloqueio de calorias tem que estar dentro de `foodConfig.addToTotals`, não no hook.

**Decisão de classificação (a pergunta central).** Heurística local determinística **antes** da IA, em `src/domains/purchase.ts`, decidindo qual `intent` vai na requisição.

- *Não no prompt* (modelo escolhe o ramo): o erro seria silencioso e caro — um almoço real voltando como compra some 900 kcal do dia sem nenhum sinal na tela. Calorias do dia não podem depender do humor do modelo.
- *Não num classificador separado*: dobra chamadas e latência em toda nota de dieta para uma decisão que uma regex acerta.
- *Local*: é o mesmo padrão parser-first que treino (`CommandBus.ts:229-241`) e onboarding (`CommandBus.ts:185-226`) já usam, roda sem rede/chave, e é testável em jest (`testMatch` só pega `.ts` — um módulo puro em `src/domains/` tem teste, um repositório não).

### Arquivos

| arquivo | ação | o que exatamente muda |
|---|---|---|
| `src/domains/purchase.ts` | criar | `classifyFoodNote`, `isPurchaseData`, `formatMoney`, `purchaseTotalPrice`, `formatPurchaseTotal` |
| `src/domains/schemas.ts` | editar | `purchaseItemSchema`, `purchaseSchema`, `foodEntrySchema` (união), `EnrichData` alargado, `schemaByDomain.food` |
| `src/domains/prompts.ts` | editar | `export const purchasePrompt` |
| `src/core/enrich/types.ts` | editar | `intent?: 'parse' \| 'foodEdit' \| 'purchase'` |
| `src/core/enrich/deepseek.ts` | editar | `EnrichEngineInput.intent` alargado; seleção de prompt; **seleção de schema de saída** |
| `src/app/api/enrich+api.ts` | editar | enum de `intent` + guarda `purchase` só com `domain === 'food'` |
| `src/core/command/CommandBus.ts` | editar | classifica antes de montar a chave; envia `intent`; não envia `userContext` em compra |
| `src/domains/food.ts` | editar | `foodConfig` tipado em `FoodEntryData`; guarda em `formatResult` e `addToTotals`; `foodLabelKey` exportado |
| `src/domains/pantry.ts` | criar | modelo de leitura puro sobre `Entry[]`: `purchaseLines`, `pricePerKg`, `pricePerUnit`, `pantryItems` |
| `src/data/PantryRepository.ts` | criar | 12 linhas: `all()` = `pantryItems(await EntryRepository.findAll('food'))` |
| `src/components/organisms/settings/PantrySheet.tsx` | criar | lista da geladeira (produto, última compra, preço, preço/kg derivado) |
| `src/core/appModals.ts` | editar | id `settings.pantry` + label + link a partir de `settings.root` + variante da união `AppModal` |
| `src/components/organisms/SettingsSheet.tsx` | editar | `pantryVisible`, `openPantry`, uma `SettingsRow` na seção de refeições, render do sheet |
| `src/components/atoms/AppIcon.tsx` | editar | `ShoppingBasket` no import e `shoppingBasket:` no mapa |
| `src/i18n/index.ts` | editar | 6 chaves novas nos dois blocos |
| `src/domains/purchase.test.ts` | criar | ver tabela de testes |
| `src/domains/pantry.test.ts` | criar | ver tabela de testes |
| `src/domains/schemas.test.ts` | editar | disjunção da união |
| `src/domains/totals.test.ts` | editar | compra não soma |
| `src/core/command/CommandBus.test.ts` | editar | roteamento de intent |
| `src/core/enrich/client.test.ts` | editar | resposta em forma de refeição sob intent de compra é rejeitada |

**Não tocar** em `DayTemplate.tsx`, `NoteRow.tsx`, `NotesList.tsx`, `useTotals.ts`, `routines.ts`, `EntryRepository.ts`, `db.ts`. Todos já se comportam corretamente com a união porque testam `'items' in data`. Se você se pegar editando um deles, o schema de compra ganhou a chave errada.

### Trechos

#### 1. `src/domains/schemas.ts` — a união disjunta

Hoje (`schemas.ts:151` e `:176-180`):

```ts
export type EnrichData = FoodData | WorkoutData | OnboardingData;
...
export const schemaByDomain = {
  food: foodSchema,
  workout: workoutSchema,
  onboarding: onboardingSchema,
} satisfies Record<Domain, z.ZodType>;
```

Vira — inserir os schemas logo depois de `foodEditSchema` (`schemas.ts:44`):

```ts
/**
 * One line of a purchase note. There is deliberately no nutrition here: nothing
 * in this note was eaten, and a calorie field that exists is a calorie field
 * something will eventually sum.
 */
export const purchaseItemSchema = z.object({
  label: z.string().min(1),
  quantity: z.coerce.number().positive().optional().catch(undefined),
  unit: z.string().trim().min(1).max(32).optional().catch(undefined),
  /** Net mass of the whole line, when the note or a standard pack states one. */
  grams: z.coerce.number().positive().optional().catch(undefined),
  /**
   * Total paid for THIS line, in the user's local currency. Never a unit price:
   * price per kg is derived on read, so it can never drift from what was paid.
   */
  price: z.coerce.number().nonnegative().optional().catch(undefined),
});
export type PurchaseItem = z.infer<typeof purchaseItemSchema>;

export const purchaseSchema = z.object({
  // `.min(1)` matters: an empty purchase would validate as "a resolved note that
  // says nothing", and the row would render a price of zero forever.
  purchase: z.array(purchaseItemSchema).min(1),
  reasoning: z.string().max(2000).optional().catch(undefined),
  confidence: z.coerce.number().optional().catch(undefined),
});
export type PurchaseData = z.infer<typeof purchaseSchema>;

/**
 * What a `food` entry may hold. Disjoint by construction — `items` is required
 * on one side, `purchase` on the other — which is what keeps every existing
 * `'items' in data` guard meaning exactly "this is a meal".
 */
export const foodEntrySchema = z.union([purchaseSchema, foodSchema]);
export type FoodEntryData = z.infer<typeof foodEntrySchema>;
```

e as duas linhas de baixo:

```ts
export type EnrichData = FoodEntryData | WorkoutData | OnboardingData;
...
export const schemaByDomain = {
  food: foodEntrySchema,
  workout: workoutSchema,
  onboarding: onboardingSchema,
} satisfies Record<Domain, z.ZodType>;
```

#### 2. `src/domains/purchase.ts` — novo

```ts
import { getLang, t } from '@/i18n';

import type { PurchaseData } from './schemas';

/**
 * Purchase vs. consumption, decided locally and before anything is sent.
 *
 * The model never gets a vote here on purpose: a note misread as a purchase
 * silently drops a real meal out of the day's calories, and there is no screen
 * on which that failure is visible. A regex that is wrong is wrong the same way
 * every time, and has a test.
 */

/** Acquisition verbs. Tight on purpose — see `classifyFoodNote`. */
const BOUGHT_RE =
  /\b(comprei|compramos|comprado|comprada|comprados|compradas|paguei|pagamos|bought|purchased|paid)\b/;

/** Consumption verbs. */
const ATE_RE = /\b(comi|comemos|almocei|jantei|lanchei|tomei|bebi|ingeri|ate|eaten|drank)\b/;

/**
 * Lower-cased but NOT accent-folded, unlike `foodLabelKey`. Folding turns the
 * very common "até" into "ate" and every "comprei X até sexta" would stop being
 * a purchase.
 */
export function classifyFoodNote(text: string): 'parse' | 'purchase' {
  const lowered = text.toLowerCase();
  // Eating wins over buying: "comprei um pastel e comi" is a meal. Counting
  // food that was only bought is a smaller lie than hiding food that was eaten,
  // and the user can already fix it by editing the note — an edit re-enriches.
  if (ATE_RE.test(lowered)) return 'parse';
  return BOUGHT_RE.test(lowered) ? 'purchase' : 'parse';
}

export function isPurchaseData(data: unknown): data is PurchaseData {
  return Boolean(data && typeof data === 'object' && 'purchase' in data);
}

/**
 * No `Intl`: Hermes ships it unevenly across platforms and two locales do not
 * justify finding that out on a user's phone.
 * ponytail: the symbol follows the current UI language, not the currency the
 * money was spent in. Store a currency on the line if the app ever travels.
 */
export function formatMoney(value: number): string {
  const fixed = value.toFixed(2);
  return getLang() === 'en-US' ? `$${fixed}` : `R$ ${fixed.replace('.', ',')}`;
}

export function purchaseTotalPrice(data: PurchaseData): number {
  return data.purchase.reduce((sum, item) => sum + (item.price ?? 0), 0);
}

/** The one-line summary on the note row, where a meal shows "620 cal". */
export function formatPurchaseTotal(data: PurchaseData): string {
  const total = purchaseTotalPrice(data);
  return total > 0 ? formatMoney(total) : t('purchase.noPrice');
}
```

#### 3. `src/domains/prompts.ts` — prompt de compra

Acrescentar no fim do arquivo (depois de `foodEditPrompt`, `prompts.ts:109`):

```ts
export const purchasePrompt = [
  'You are a grocery-purchase parser. The user wrote a note about food they BOUGHT, not food they ate.',
  'Return ONLY a JSON object of the shape',
  '{ "purchase": [ { "label": string, "quantity": number | null, "unit": string | null, "grams": number | null, "price": number | null } ], "reasoning": string, "confidence": number }.',
  'NEVER return calories, macros, or an "items" array. Nothing in this note was eaten.',
  'List ONE object per distinct product bought.',
  'label is the product name only, with no quantity or unit inside it.',
  'quantity and unit are what the user wrote: "meio quilo" -> quantity 0.5, unit "kg"; "2 pacotes" -> quantity 2, unit "pacote".',
  'grams is the net weight of the WHOLE line in grams when the note states a weight or volume, or when the pack size is standard and unambiguous. 0.5 kg -> 500. 1L of milk -> 1000. Use null when you would be guessing.',
  'price is the total paid for that line as a plain number, with no currency symbol. "meio quilo de patinho por 30" -> price 30 for the whole 500 g line.',
  'When one price covers several products and the split is not stated, put the whole price on the first line and null on the others.',
  'NEVER compute a price per kilo or per unit - the app derives those from price and grams.',
  'Resolve arithmetic such as "2 x 15" before returning JSON.',
  'Set "reasoning" to 1-3 sentences on how you read the quantities and prices.',
  'Set "confidence" to an integer from 0 to 100.',
  'Respond with JSON only, no prose.',
].join(' ');
```

#### 4. `src/core/enrich/types.ts:53`

```ts
  intent?: 'parse' | 'foodEdit';
```
vira
```ts
  intent?: 'parse' | 'foodEdit' | 'purchase';
```

#### 5. `src/core/enrich/deepseek.ts` — prompt e, sobretudo, schema de saída

`deepseek.ts:45` hoje:
```ts
  intent: 'parse' | 'foodEdit';
```
vira
```ts
  intent: 'parse' | 'foodEdit' | 'purchase';
```

`deepseek.ts:188-190` hoje:
```ts
  const system = [
    intent === 'foodEdit' ? foodEditPrompt : promptByDomain[domain],
```
vira
```ts
  const system = [
    intent === 'foodEdit'
      ? foodEditPrompt
      : intent === 'purchase'
        ? purchasePrompt
        : promptByDomain[domain],
```
(import: `import { foodEditPrompt, promptByDomain, purchasePrompt } from '@/domains/prompts';`)

`deepseek.ts:222-224` hoje:
```ts
  // Validate the model output here too (defense in depth).
  const parsed = (intent === 'foodEdit' ? foodEditSchema : schemaByDomain[domain]).safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'AI response did not match schema' };
```
vira
```ts
  // Validate the model output here too (defense in depth). A purchase is pinned
  // to `purchaseSchema`, NOT to `schemaByDomain.food` — the union would happily
  // accept a meal-shaped reply and a note that says "comprei" would land 1100
  // kcal on the day. Failing loudly here is the guarantee.
  const outputSchema =
    intent === 'foodEdit'
      ? foodEditSchema
      : intent === 'purchase'
        ? purchaseSchema
        : schemaByDomain[domain];
  const parsed = outputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'AI response did not match schema' };
```
(import: `import { foodEditSchema, purchaseSchema, schemaByDomain } from '@/domains/schemas';`)

Não mexer em `deepseek.ts:178-181` (legenda de imagens já é `intent === 'parse'`) nem em `:192-194/:204` (bloco de contexto nutricional já é condicional a `userContext`, que o bus deixa de mandar).

#### 6. `src/app/api/enrich+api.ts:36` e `:53`

```ts
  intent: z.enum(['parse', 'foodEdit']).default('parse'),
```
vira
```ts
  intent: z.enum(['parse', 'foodEdit', 'purchase']).default('parse'),
```

e a guarda em `:53-55`:
```ts
  if (input.intent === 'foodEdit' && (input.domain !== 'food' || !input.currentFood)) {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }
```
vira
```ts
  if (input.intent === 'foodEdit' && (input.domain !== 'food' || !input.currentFood)) {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }
  if (input.intent === 'purchase' && input.domain !== 'food') {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }
```

#### 7. `src/core/command/CommandBus.ts` — roteamento

`CommandBus.ts:164-166` hoje:
```ts
  private async runEnrich(entry: Entry): Promise<void> {
    const locale = this.deps.getLocale ? this.deps.getLocale() : this.deps.locale ?? 'pt-BR';
    const userContext = entry.domain === 'food' ? this.deps.getUserContext?.() : undefined;
```
vira
```ts
  private async runEnrich(entry: Entry): Promise<void> {
    const locale = this.deps.getLocale ? this.deps.getLocale() : this.deps.locale ?? 'pt-BR';
    // Decided locally, before the key is built and before anything leaves the
    // device. The nutrition context is dead weight on a purchase, so it stays
    // out of the request AND out of the cache key — which also means a purchase
    // note can never collide with a meal parse of the same text.
    const intent = entry.domain === 'food' ? classifyFoodNote(entry.text) : undefined;
    const userContext =
      entry.domain === 'food' && intent === 'parse' ? this.deps.getUserContext?.() : undefined;
```
(import: `import { classifyFoodNote } from '@/domains/purchase';`)

`CommandBus.ts:295-305` (a cauda genérica, por onde comida passa) hoje:
```ts
    let promise = this.inflight.get(key);
    if (!promise) {
      promise = this.deps.enrichFn({
        text: entry.text,
        domain: entry.domain,
        context: undefined,
        userContext,
        locale,
      });
      this.inflight.set(key, promise);
    }
```
vira (só uma linha nova):
```ts
    let promise = this.inflight.get(key);
    if (!promise) {
      promise = this.deps.enrichFn({
        text: entry.text,
        domain: entry.domain,
        context: undefined,
        intent,
        userContext,
        locale,
      });
      this.inflight.set(key, promise);
    }
```

A validação em `:316` (`schemaByDomain[entry.domain].safeParse`) **não muda**: a união já aceita a resposta de compra, e o pino de forma verdadeiro está no `deepseek.ts`.

#### 8. `src/domains/food.ts` — o bloqueio das calorias

`food.ts:142` — tirar o `function` de módulo privado para reuso na despensa:
```ts
function foodLabelKey(label: string): string {
```
vira
```ts
export function foodLabelKey(label: string): string {
```

`food.ts:246-270` hoje:
```ts
export const foodConfig: DomainConfig<FoodData, FoodTotals> = {
  ...
  schema: foodSchema,
  formatResult: (data) => `${round(sumFoodData(data).calories)} cal`,
  emptyTotals: { ... },
  addToTotals: (totals, data) => {
    const summed = sumFoodData(data);
    return { ... };
  },
```
vira
```ts
export const foodConfig: DomainConfig<FoodEntryData, FoodTotals> = {
  ...
  schema: foodEntrySchema,
  formatResult: (data) =>
    isPurchaseData(data)
      ? formatPurchaseTotal(data)
      : `${round(sumFoodData(data).calories)} cal`,
  emptyTotals: { ... },
  addToTotals: (totals, data) => {
    // Food in the fridge is not food in the person. Returning the accumulator
    // untouched is the entire point of the purchase intent.
    if (isPurchaseData(data)) return totals;
    const summed = sumFoodData(data);
    return { ... };
  },
```
(imports: `foodEntrySchema`, `type FoodEntryData` de `./schemas`; `formatPurchaseTotal`, `isPurchaseData` de `./purchase`)

`describeTotals` e `emptyTotals` ficam iguais.

#### 9. `src/domains/pantry.ts` — novo (a geladeira)

```ts
import type { Entry } from '@/core/types';

import { foodLabelKey } from './food';
import { isPurchaseData } from './purchase';

/**
 * The pantry has no storage of its own. A purchase note IS the record, so the
 * fridge is a projection over `entries` recomputed on read: nothing to migrate,
 * nothing to keep in sync, and deleting or editing the note is automatically
 * the right thing — which a mirrored table would have to be taught, once per
 * lifecycle event, forever.
 *
 * ponytail: no consumption tracking, so buying bananas twice shows two
 * purchases and never "half a kilo left". Add a `purchases` table with its own
 * state the day something actually decrements stock (phase 7 recipes).
 */

export interface PantryPurchase {
  entryId: string;
  /** Local YYYY-MM-DD of the note, for display. */
  date: string;
  boughtAt: number;
  label: string;
  quantity?: number;
  unit?: string;
  grams?: number;
  price?: number;
}

export interface PantryItem {
  key: string;
  label: string;
  /** Newest first. This is the price history: it grows on every repeat buy. */
  history: PantryPurchase[];
  lastBoughtAt: number;
  lastPrice?: number;
  /** Derived, never stored. */
  lastPricePerKg?: number;
  lastPricePerUnit?: number;
}

export function purchaseLines(entries: Entry[]): PantryPurchase[] {
  return entries.flatMap((entry) =>
    entry.status === 'done' && isPurchaseData(entry.data)
      ? entry.data.purchase.map((item) => ({
          entryId: entry.id,
          date: entry.date,
          boughtAt: entry.createdAt,
          label: item.label,
          quantity: item.quantity,
          unit: item.unit,
          grams: item.grams,
          price: item.price,
        }))
      : [],
  );
}

/** Undefined rather than 0 when it cannot be known — a made-up price per kilo
 *  is worse than none, because phase 7 will spend money on it. */
export function pricePerKg(line: PantryPurchase): number | undefined {
  if (line.price === undefined || !line.grams) return undefined;
  return (line.price / line.grams) * 1000;
}

export function pricePerUnit(line: PantryPurchase): number | undefined {
  if (line.price === undefined || !line.quantity) return undefined;
  return line.price / line.quantity;
}

/** One row per product, most recently bought first. */
export function pantryItems(entries: Entry[]): PantryItem[] {
  const byKey = new Map<string, PantryPurchase[]>();
  for (const line of purchaseLines(entries)) {
    const key = foodLabelKey(line.label);
    byKey.set(key, [...(byKey.get(key) ?? []), line]);
  }

  return [...byKey.entries()]
    .map(([key, lines]): PantryItem => {
      const history = [...lines].sort((a, b) => b.boughtAt - a.boughtAt);
      const last = history[0];
      // The newest priced line, not the newest line: "comprei banana" with no
      // price must not erase the R$/kg the previous purchase established.
      const priced = history.find((line) => line.price !== undefined);
      return {
        key,
        label: last.label,
        history,
        lastBoughtAt: last.boughtAt,
        lastPrice: priced?.price,
        lastPricePerKg: priced ? pricePerKg(priced) : undefined,
        lastPricePerUnit: priced ? pricePerUnit(priced) : undefined,
      };
    })
    .sort((a, b) => b.lastBoughtAt - a.lastBoughtAt);
}
```

#### 10. `src/data/PantryRepository.ts` — novo

```ts
import { pantryItems, type PantryItem } from '@/domains/pantry';

import { EntryRepository } from './EntryRepository';

/**
 * Read model, not a table. Kept in `data/` anyway so callers reach the pantry
 * the same way they reach every other store, and so the aggregation itself
 * stays in `domains/` where jest can run it without SQLite.
 *
 * ponytail: full scan of the food domain per open, via the `findAll` that the
 * routine/monitor screens already use. Materialize a `purchases` table when the
 * pantry needs state of its own, not before.
 */
export const PantryRepository = {
  async all(): Promise<PantryItem[]> {
    return pantryItems(await EntryRepository.findAll('food'));
  },
};
```

#### 11. `src/core/appModals.ts` — quatro inserções

- `AppModalId` (após `"settings.savedMeals"`, linha 31): `| "settings.pantry"`
- `APP_MODAL_LABELS` (após linha 70): `"settings.pantry": "Geladeira",`
- `APP_MODAL_LINKS["settings.root"]` (array em `:109-119`): acrescentar `"settings.pantry",`
- União `AppModal` (após linha 180): `| { id: "settings.pantry"; domain: Domain }`

#### 12. `src/components/organisms/settings/PantrySheet.tsx` — novo

```tsx
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/atoms/AppText';
import { SettingsRow } from '@/components/molecules/SettingsRow';
import { Spacing } from '@/constants/theme';
import { PantryRepository } from '@/data/PantryRepository';
import type { PantryItem } from '@/domains/pantry';
import { formatMoney } from '@/domains/purchase';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

import { SheetFrame } from '../SheetFrame';
import { Divider, Section } from './primitives';

function subtitleOf(item: PantryItem): string {
  const last = item.history[0];
  const amount = last.quantity && last.unit ? `${last.quantity} ${last.unit}` : last.label;
  const perKg = item.lastPricePerKg
    ? ` · ${formatMoney(item.lastPricePerKg)}/${t('pantry.perKg')}`
    : item.lastPricePerUnit
      ? ` · ${formatMoney(item.lastPricePerUnit)}/${t('pantry.perUnit')}`
      : '';
  const times = item.history.length > 1 ? ` · ${item.history.length} ${t('pantry.times')}` : '';
  return `${amount}${perKg}${times}`;
}

export function PantrySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const [items, setItems] = useState<PantryItem[]>([]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void PantryRepository.all().then((next) => {
      if (active) setItems(next);
    });
    return () => {
      active = false;
    };
  }, [visible]);

  return (
    <SheetFrame
      visible={visible}
      title={t('settings.pantry.title')}
      onClose={onClose}
      centerTitle
      size="full">
      {items.length === 0 ? (
        <View style={{ padding: Spacing.four }}>
          <AppText variant="secondary" color={colors.textSecondary}>
            {t('pantry.empty')}
          </AppText>
        </View>
      ) : (
        <ScrollView>
          <Section label={t('settings.pantry.title')}>
            {items.map((item, index) => (
              <View key={item.key}>
                {index > 0 ? <Divider /> : null}
                <SettingsRow
                  icon="shoppingBasket"
                  iconColor={colors.protein}
                  title={item.label}
                  subtitle={subtitleOf(item)}
                  trailing={
                    item.lastPrice !== undefined ? (
                      <AppText variant="value" color={colors.text}>
                        {formatMoney(item.lastPrice)}
                      </AppText>
                    ) : undefined
                  }
                />
              </View>
            ))}
          </Section>
        </ScrollView>
      )}
    </SheetFrame>
  );
}
```

Linhas sem `onPress` de propósito: `SettingsRow` renderiza conteúdo puro quando `onPress` é `undefined` (`SettingsRow.tsx:55`). Não há nada para abrir até a fase 7.

#### 13. `src/components/organisms/SettingsSheet.tsx` — três inserções

Junto de `:150`:
```ts
  const pantryVisible = activeSettingsId === "settings.pantry";
```
Junto de `openSavedMeals` (`:198-202`):
```ts
  const openPantry = () => {
    if (!canOpenAppModal("settings.root", "settings.pantry")) return;
    openAppModal({ id: "settings.pantry", domain });
  };
```
Na seção de refeições, depois da row de `routine.savedDiets` (`:496-503`):
```tsx
              <Divider />
              <SettingsRow
                icon="shoppingBasket"
                iconColor={colors.protein}
                title={t("settings.pantry.title")}
                subtitle={t("settings.pantry.subtitle")}
                trailing={<Chevron />}
                onPress={openPantry}
              />
```
E ao lado de `<ApiKeysSheet .../>` (`:693-696`):
```tsx
      <PantrySheet
        visible={pantryVisible}
        onClose={() => closeAppModal("settings.pantry")}
      />
```
Sem contagem no subtítulo de propósito: uma contagem obrigaria um scan completo toda vez que Ajustes abre.

#### 14. `src/components/atoms/AppIcon.tsx`

Acrescentar `ShoppingBasket,` ao import (ordem alfabética, entre `SendHorizontal` e `Settings2`, `:37`) e `shoppingBasket: ShoppingBasket,` ao mapa (`:89`).

#### 15. `src/i18n/index.ts` — 6 chaves, nos **dois** blocos

`Key` é derivado de `pt-BR` (`i18n/index.ts:684`) e `t` indexa `dict[getLang()]`, então o TypeScript quebra se `en-US` não receber as mesmas chaves.

| chave | pt-BR | en-US |
|---|---|---|
| `purchase.noPrice` | `"compra"` | `"purchase"` |
| `settings.pantry.title` | `"Geladeira"` | `"Pantry"` |
| `settings.pantry.subtitle` | `"O que você comprou"` | `"What you bought"` |
| `pantry.empty` | `"Nada comprado ainda. Escreva \"comprei ...\" numa nota de dieta."` | `"Nothing bought yet. Write \"bought ...\" in a diet note."` |
| `pantry.perKg` | `"kg"` | `"kg"` |
| `pantry.perUnit` | `"un"` | `"ea"` |
| `pantry.times` | `"compras"` | `"purchases"` |

### Comportamento

**"comprei meio quilo de patinho por 30"** — a linha aparece na lista de dieta como qualquer nota, mostra "pensando", e resolve mostrando **`R$ 30,00`** no lugar de "620 cal", na mesma cor de destaque de comida. Nenhuma caloria entra no dock. `NoteRow` chega nesse texto por `StatusBadge` (`NoteRow.tsx:83-89`), porque `isFoodData` retorna false — **zero mudança de componente para a fase 5 aparecer na tela**.

**Tocar na linha** não abre nada. O detalhe nutricional só existe para `resolvedFood` (`NoteRow.tsx:135`), então uma compra não tem alvo de toque à direita. Editar o texto continua funcionando (o `TextInput` é a linha inteira).

**"comprei um pastel e comi na hora"** — classificado como refeição, soma calorias. É a direção segura escolhida de propósito.

**"comi um X" que na verdade era compra** — o usuário edita o texto para "comprei um X"; `EditEntryCommand` (`CommandBus.ts:417-444`) já limpa `data`, remarca `thinking` e re-enriquece, e a reclassificação acontece sozinha. **Essa é a única válvula de escape, e ela não custa nenhum código novo.** Vale nos dois sentidos.

**Compra sem preço** ("comprei banana") — resolve normalmente, a linha mostra "compra"/"purchase", e o produto entra na geladeira sem histórico de preço. Quando a mesma banana for comprada com preço, a geladeira passa a exibir o preço.

**Modelo devolve forma de refeição num intent de compra** — `purchaseSchema` rejeita, `runEnrichEngine` responde `{ok:false}`, `CommandBus.runEnrich` chama `setError` e a linha mostra "tentar de novo" (`NoteRow.tsx:75-81`). Falha barulhenta, nunca calorias silenciosas.

**Sem chave e sem proxy** — igual a hoje: `ENRICH_UNCONFIGURED` e "configure a chave em Ajustes". Não há parser local de compra; ao contrário de treino, extrair quantidade+preço não é regex. A classificação é local, a extração não.

**Offline** — `NetworkError` → `retryLater` → "na fila" → backoff, idêntico a comida (`CommandBus.ts:331-346`).

**Geladeira** — Ajustes → seção de refeições → "Geladeira". Lista produtos do mais recente para o mais antigo, com último preço à direita e `quantidade · R$ x,xx/kg · N compras` embaixo. Vazia: uma frase dizendo como criar a primeira. Apagar a nota de compra remove o item da geladeira na próxima abertura, sem nenhum código de sincronização.

**Limitação nomeada:** nota de compra **com foto ou código de barras** cai no caminho composto de `DayTemplate.handleAddEntry` (`DayTemplate.tsx:450-551`), que chama `enrich` direto com `intent` padrão e valida com `foodSchema` — ou seja, vira refeição. Não é regressão (é o comportamento atual) e o caminho de texto puro, que é o que a fase 5 promete, está coberto. Caminho de upgrade: mover esse bloco para dentro do `CommandBus`, que é a mesma dívida já registrada no comentário `ponytail:` em `DayTemplate.tsx:497-500`.

### Migração de dados

**Nenhuma alteração de schema SQLite.** `src/data/db.ts` não muda: sem tabela nova, sem `ALTER TABLE`, sem índice novo. A compra mora na coluna `entries.data` que já existe, como JSON, exatamente como refeição e treino.

**Nenhuma chave nova em `settings`.** A tabela key-value (`db.ts:24-27`, `SettingsRepository`) não é tocada.

**Compatibilidade com base existente:**

- `EntryRepository.parseData` (`:24-32`) valida contra `schemaByDomain[domain]`, que passa de `foodSchema` para a **união**. União só *acrescenta* formas aceitas: toda linha de comida já gravada continua validando exatamente como antes. Nenhuma linha "done" é rebaixada para `error` por `toEntry` (`:67`).
- Notas de "comprei ..." escritas **antes** desta mudança já estão gravadas como `FoodData` com calorias, e já foram somadas nos dias passados. Elas **não** são reprocessadas — não há migração retroativa e não deve haver: reescrever silenciosamente o histórico calórico de alguém é pior que o bug original. Editar o texto da nota reclassifica; é a mesma válvula de escape.
- Downgrade do app (build antiga lendo linha de compra nova): `foodSchema` rejeita, `parseData` devolve `null`, `toEntry` rebaixa para `error`. A linha aparece como falha em vez de crashar — degradação já projetada no código existente.
- Cache LRU (`CommandBus.ts:63`) é só memória, morre com o processo, não migra. Dentro de uma sessão, a chave de uma compra deixa de incluir `userContext`, então não colide com um parse de refeição do mesmo texto feito antes.

**A geladeira não persiste nada.** É `SELECT * FROM entries WHERE domain = 'food'` (via `EntryRepository.findAll`, `:111-118`) mais agregação em memória. É a razão principal de a fase 6 não ter migração: não existe segunda cópia para ficar fora de sincronia.

### Testes

| arquivo de teste | o que verifica | por que quebraria sem isso |
|---|---|---|
| `src/domains/purchase.test.ts` (criar) | `classifyFoodNote`: "comprei meio quilo de patinho por 30" → `purchase`; "comi um pastel" → `parse`; "comprei um pastel e comi" → `parse`; "comprei carne até sexta" → `purchase`; "no lanche comi o que comprei ontem" → `parse` | é a única coisa entre uma refeição real e um dia com 0 kcal. O caso do "até" é o que impede alguém de "otimizar" a regex com NFD folding e transformar toda compra com prazo em refeição |
| `src/domains/purchase.test.ts` (criar) | `purchaseTotalPrice` soma linhas e ignora as sem preço; `formatPurchaseTotal` sem preço nenhum devolve o rótulo, não "R$ 0,00" | "R$ 0,00" numa nota sem preço lê como "de graça" |
| `src/domains/schemas.test.ts` (editar) | `foodSchema.safeParse(compra).success === false`; `purchaseSchema.safeParse({items:[…]}).success === false`; `purchaseSchema.safeParse({purchase: []}).success === false`; `foodEntrySchema` aceita as duas formas válidas | a disjunção é o que sustenta os oito `'items' in data`. Se alguém acrescentar `items` ao schema de compra, oito telas passam a tratar compra como refeição e só este teste avisa |
| `src/domains/totals.test.ts` (editar) | `foodConfig.addToTotals(totals, {purchase:[{label:'patinho', price:30}]})` devolve o acumulador com os mesmos números; `foodConfig.formatResult(compra)` contém "30" | é o bloqueio inteiro da fase 5, num assert |
| `src/core/command/CommandBus.test.ts` (editar) | nota "comprei 1kg de patinho por 30" chama `enrichFn` com `intent:'purchase'` e `userContext: undefined`, e resolve `done` com `data.purchase` de 1 item; nota "burger" continua chamando com `intent:'parse'` e o `userContext` do perfil | pega regressão de roteamento — o teste de `userContext` que já existe (`:106-121`) não pega, porque usa `objectContaining` |
| `src/core/enrich/client.test.ts` (editar) | com chave própria e `intent:'purchase'`, um retorno `{items:[{…, calories: 1100}]}` devolve `{ok:false}` | prova que a seleção de schema em `deepseek.ts:223` está pinada no de compra e não na união. Sem isso, o modelo pode reintroduzir as calorias por conta própria |
| `src/domains/pantry.test.ts` (criar) | duas compras do mesmo produto viram um `PantryItem` com `history` de 2, mais recente primeiro; `pricePerKg` de 500 g por 30 é 60; linha sem `grams` devolve `undefined`, não `Infinity` nem 0; compra sem preço não apaga o `lastPricePerKg` da anterior; entradas de refeição e entradas `thinking` não entram | preço/kg é exatamente o número que a fase 7 vai usar para sugerir compra. `undefined` vs. um número inventado é a diferença entre "não sei" e uma mentira com duas casas decimais |

Alvo: as 26 suítes / 206 testes continuam verdes, `tsc --noEmit` e `expo lint` limpos. Nenhum teste existente precisa mudar de expectativa — só ganham vizinhos.

### Riscos

| risco | como detectar cedo |
|---|---|
| **Falso positivo da regex zera uma refeição real.** É o único modo de falha silencioso que sobra. | A precedência `ATE_RE` faz o erro pender para o lado seguro, e `purchase.test.ts` fixa cinco frases reais. Ao acrescentar verbo novo à `BOUGHT_RE`, acrescente também o caso na tabela. Sinal em produção: usuário relatando "sumiu caloria" — sempre olhe o texto da nota primeiro |
| **Alguém dá `items` ao schema de compra** (para "reusar o parser de comida"). Quebra os oito guards de uma vez e o dano é distribuído. | O teste de disjunção em `schemas.test.ts` falha imediatamente. O comentário no schema explica por quê |
| **`foodLabelKey` foi escrito para refeição, não para mercadoria** — ele remove "copo/fatia/lata de" e mapeia "refri"→"refrigerante" (`food.ts:142-173`). "1 lata de refri" e "refrigerante" agrupam juntos, o que aqui é certo; "leite integral" e "leite desnatado" ficam separados, o que também é certo. Casos estranhos vão aparecer. | `pantry.test.ts` fixa o agrupamento esperado. Se um dia divergir do que refeição precisa, extraia uma segunda função em vez de mexer nesta |
| **Preço sem moeda.** Trocar o idioma no app reformata compras antigas de `R$ 30,00` para `$30.00`. | Nomeado no `ponytail:` de `formatMoney`. Caminho de upgrade: gravar a moeda na linha no momento da escrita. Não vale antes de alguém viajar |
| **Scan completo do domínio de comida ao abrir a geladeira.** | Nomeado no `ponytail:` de `PantryRepository`. Sinal: abertura perceptivelmente lenta. Correção: materializar `purchases` com `entryId` e apagar por `entryId` no `persistRemove` |
| **Despensa sem consumo** — comprar banana 5x mostra 5 compras, nunca "acabou". | Aceito para a fase 6: nada decrementa estoque até a fase 7. A tela lista *compras*, não estoque, e o texto reflete isso |
| **Nota de compra com foto vira refeição** (caminho de `DayTemplate.handleAddEntry`). | Documentado acima. Repro: escrever "comprei 1kg de patinho" com foto anexada. Correção pertence à mesma dívida do comentário em `DayTemplate.tsx:497-500` |
| **Proxy `/api/enrich` sem deploy** (`ROADMAP.md:321`) — a mudança em `enrich+api.ts` não é exercida em build standalone. | Já coberto: `client.test.ts` roda os dois caminhos. Não deixe a validação de `intent` do servidor divergir da do cliente |

---

## Fase 5 — Receita e treino gerado

Pré-requisito das duas capacidades. É refatoração interna pura e vale por si só, sem IA nenhuma (ROADMAP.md:228-231).

### Pré-requisitos

Nenhum. Não depende do registro de comandos (ROADMAP 4c item 3) nem do loop de ferramentas (item 5). É o item 1 e 2 da "ordem natural" do roadmap e pode começar hoje.

O que já existe e é reusado: `Command` (`src/core/command/Command.ts:2-6`, 3 membros: `label`/`execute`/`undo`), a pilha de undo com cap em 20 (`CommandBus.ts:73-77`), e o fato de `useAppStore.upsertEntry` já descartar entry fora do dia visível (`useAppStore.ts:95`) — o que torna a escrita em outra data segura para a UI sem nenhuma mudança de store.

### Arquivos

| arquivo | ação | o que exatamente muda |
|---|---|---|
| `src/core/command/CompositeCommand.ts` | criar | classe `CompositeCommand implements Command`; executa filhos em ordem, desfaz em ordem inversa, faz rollback se um filho falhar no meio |
| `src/core/command/CommandBus.ts` | editar | extrai `buildAddEntry` de `addEntry` (linhas 98-113); `addEntry` passa a chamá-lo; novo método `runPlan`; import de `CompositeCommand` e de `Command` já existe (linha 15) |
| `src/core/command/CompositeCommand.test.ts` | criar | ordem, undo invertido, rollback parcial, lista vazia |
| `src/core/command/CommandBus.test.ts` | editar | 2 testes novos: `runPlan` grava em datas diferentes; um undo desfaz o plano inteiro |

### Trechos

**`CommandBus.ts:98-113` — atual:**

```ts
  async addEntry(text: string, domain: Domain, media?: EntryMediaAttachment[]): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    const entry: Entry = {
      id: newId(),
      date: this.deps.store.getDay(domain).date,
      domain,
      text: trimmed,
      media: media?.length ? media : undefined,
      status: 'thinking',
      data: null,
      error: null,
      createdAt: this.now(),
    };
    await this.run(new AddEntryCommand(this, entry));
  }
```

**vira:**

```ts
  /**
   * `date` cai no dia visível quando omitido — que é o comportamento antigo.
   * Um plano grava em outras datas; o SQLite já aceita qualquer data e o store
   * já ignora o que não é do dia visível (useAppStore.ts:95), que é o certo
   * para exibição.
   */
  buildAddEntry(
    text: string,
    domain: Domain,
    options: { date?: string; media?: EntryMediaAttachment[]; createdAt?: number } = {},
  ): Command | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const entry: Entry = {
      id: newId(),
      date: options.date ?? this.deps.store.getDay(domain).date,
      domain,
      text: trimmed,
      media: options.media?.length ? options.media : undefined,
      status: 'thinking',
      data: null,
      error: null,
      createdAt: options.createdAt ?? this.now(),
    };
    return new AddEntryCommand(this, entry);
  }

  async addEntry(text: string, domain: Domain, media?: EntryMediaAttachment[]): Promise<void> {
    const command = this.buildAddEntry(text, domain, { media });
    if (command) await this.run(command);
  }

  /**
   * Um undo para o plano inteiro. Retorna null quando nada era gravável — o
   * chamador não deve mostrar toast de undo nesse caso.
   */
  async runPlan(
    label: string,
    items: readonly { text: string; domain: Domain; date?: string }[],
  ): Promise<Command | null> {
    const base = this.now();
    const children = items.flatMap((item, index) => {
      const command = this.buildAddEntry(item.text, item.domain, {
        date: item.date,
        // createdAt escalonado: EntryRepository ordena por createdAt ASC
        // (EntryRepository.ts:105) e um plano inteiro no mesmo ms embaralha a
        // ordem das linhas. Mesmo truque que DayTemplate.tsx:768 já usa.
        createdAt: base + index,
      });
      return command ? [command] : [];
    });
    if (!children.length) return null;
    return this.run(new CompositeCommand(label, children));
  }
```

**`src/core/command/CompositeCommand.ts` — arquivo novo, ~35 linhas:**

```ts
import type { Command } from './Command';

/**
 * Vários comandos, um undo. `CommandBus.run` só empilha depois que `execute`
 * resolve (CommandBus.ts:73-76), então um composite que lança não deixa nada
 * na pilha — e por isso o rollback tem que acontecer aqui dentro, senão o dia
 * fica meio escrito e sem como desfazer.
 */
export class CompositeCommand implements Command {
  constructor(
    readonly label: string,
    private readonly children: readonly Command[],
  ) {}

  async execute(): Promise<void> {
    const done: Command[] = [];
    try {
      for (const child of this.children) {
        await child.execute();
        done.push(child);
      }
    } catch (error) {
      for (let i = done.length - 1; i >= 0; i--) {
        // ponytail: undo de rollback engolido — a falha que importa é a
        // original. Se um undo de rollback falhar, a linha órfã fica visível
        // e o usuário apaga na mão.
        try { await done[i].undo(); } catch { /* noop */ }
      }
      throw error;
    }
  }

  async undo(): Promise<void> {
    for (let i = this.children.length - 1; i >= 0; i--) {
      await this.children[i].undo();
    }
  }
}
```

`AddEntryCommand` continua privado ao módulo (`CommandBus.ts:381`). O acesso externo é só via `buildAddEntry`/`runPlan`.

### Comportamento

O usuário não vê nada de novo por si só. Com um plano rodando: as notas do dia visível aparecem imediatamente; as dos outros dias só aparecem ao navegar com o `DateNav` (elas estão no SQLite, o store as descarta na hora — `useAppStore.ts:95`).

Borda: plano parcialmente falho. Se a 4ª de 7 escritas falhar (SQLite cheio, por exemplo), as 3 primeiras são desfeitas e nada fica na tela. O chamador recebe o throw e mostra erro.

Borda: `runPlan([])` → `null`, sem toast, sem entrada na pilha de undo.

### Migração de dados

Nenhuma. Nenhuma coluna, nenhuma chave de settings, nenhum formato persistido muda. `entries.date` já é `TEXT NOT NULL` e aceita qualquer `YYYY-MM-DD` (`db.ts:14`).

### Testes

| arquivo | o que verifica | por que quebraria sem isso |
|---|---|---|
| `src/core/command/CompositeCommand.test.ts` | filhos executam na ordem declarada | um plano fora de ordem grava exercícios trocados de dia |
| idem | `undo()` desfaz na ordem inversa | desfazer na mesma ordem pode ressuscitar estado inconsistente entre comandos dependentes |
| idem | filho 3 lançando desfaz 1 e 2 e propaga o erro | sem isso, meio plano fica gravado e invisível para o undo |
| idem | `label` é o passado no construtor | é o texto do toast |
| `src/core/command/CommandBus.test.ts` | `runPlan` com 3 itens em 3 datas grava 3 linhas com as datas certas no repo fake | é a razão de existir do parâmetro `date` |
| idem | um `bus.undo()` remove as 3 | o roadmap chama isso de "undo vira 7 toques" (ROADMAP.md:210) |
| idem | `addEntry` sem `date` continua carimbando o dia visível | regressão do comportamento de todo o app |
| idem | `runPlan` escalona `createdAt` | ordem das linhas no dia |

### Riscos

- **`buildAddEntry` público expõe construção de comando sem execução.** Se alguém construir e não rodar, o comando some sem efeito — inofensivo, mas confuso. Detectar cedo: `runPlan` é o único consumidor previsto; se aparecer um segundo, revisar.
- **Rollback dentro de `execute` engole exceções de undo.** Se o SQLite estiver realmente quebrado, as linhas parciais ficam. Detecção: o teste de rollback parcial afirma repo vazio ao final; em produção, a linha órfã é visível na lista.

---

## Fase 7 — Receita no detalhe nutricional

`"me dá uma receita com patinho"` → o app monta a refeição, adiciona como nota, e `food.entryDetail` mostra a receita passo a passo já calculada.

### Pré-requisitos

**Pode começar agora:** o schema da receita, a persistência, o render no detalhe, o roteamento da nota e o intent `recipe`. Nada disso precisa do loop de ferramentas (ROADMAP 4c item 5) — a receita é um `enrich` single-shot com um intent novo, exatamente a mesma mecânica que `foodEdit` já usa hoje (`deepseek.ts:187-223`), com o contexto injetado pelo app do mesmo jeito que `userContext` já é (`deepseek.ts:204`).

**Não pode começar antes:** a metade "usando o que há na geladeira e listando o que falta comprar com custo estimado". Hoje `EnrichRequest.intent` é `'parse' | 'foodEdit'` (`src/core/enrich/types.ts:52`) e não existe intent `purchase`, nem tabela de despensa, nem histórico de preço. Uma nota "comprei meio quilo de patinho" hoje soma ~1100 kcal ao dia (ROADMAP.md:120-123). Isso é Fase 5 + Fase 6 e é bloqueio duro **só para os campos `pantryItemId` e `estimatedCostCents`** — a receita em si (ingredientes + passos) funciona sem eles.

**Degradação obrigatória enquanto a Fase 6 não existe:** todo ingrediente sai com `pantryItemId: null` (= "falta comprar") e `estimatedCostCents: undefined` (= sem custo). O bloco "Falta comprar" lista tudo e não mostra total. Isso é honesto e visível; não inventar preço.

**Bloqueio de tamanho:** `FoodEntryDetailSheet.tsx` está com **804 linhas**. O teto do projeto é 800. Tem que encolher antes de ganhar bloco novo.

### Arquivos

| arquivo | ação | o que exatamente muda |
|---|---|---|
| `src/domains/schemas.ts` | editar | `recipeIngredientSchema`, `recipeStepSchema`, `foodRecipeSchema`, tipos `FoodRecipe`/`FoodRecipeIngredient`; `foodSchema` ganha `recipe` opcional |
| `src/domains/prompts.ts` | editar | novo export `recipePrompt` |
| `src/core/enrich/types.ts` | editar | `intent?: 'parse' \| 'foodEdit' \| 'recipe'` (linha 52); novo campo opcional `pantry?: string` em `EnrichRequest` |
| `src/core/enrich/deepseek.ts` | editar | `EnrichEngineInput.intent` alarga (linha 45) + `pantry?`; seleção de prompt (189), bloco de instrução (209), `max_tokens` (218), schema de validação (223), novo `pantryBlock` |
| `src/domains/noteRequest.ts` | criar | `detectNoteRequest(text, domain)` — router local por regex |
| `src/domains/noteRequest.test.ts` | criar | positivos, negativos, ambos os idiomas |
| `src/hooks/useNoteRequests.ts` | criar | orquestra placeholder → enrich → resolve/erro, para receita e para plano de treino |
| `src/components/molecules/MacroStat.tsx` | criar | move `MacroStat`, `MicroSource`, `MICRO_STATS`, `ConfidenceRing` para fora do detail sheet |
| `src/components/organisms/FoodRecipeCard.tsx` | criar | render do bloco de receita (~170 linhas com styles) |
| `src/components/organisms/FoodEntryDetailSheet.tsx` | editar | remove os 4 símbolos movidos + 4 regras de style; importa de `@/components/molecules/MacroStat`; insere o bloco de receita entre itens e raciocínio |
| `src/components/organisms/FoodNutritionEditSheet.tsx` | editar | `handleSave` derruba `recipe` (linha 416-421) |
| `src/domains/food.ts` | editar | `mergeFoodEdit` (237-243) trata `recipe` explicitamente |
| `src/components/templates/DayTemplate.tsx` | editar | `handleAddEntry` e `onRetry` passam pelo router antes do bus |
| `src/i18n/index.ts` | editar | 11 chaves novas nos dois blocos (`pt-BR` inicia linha 5, `en-US` linha 344) |

### Trechos

**`schemas.ts` — depois de `foodItemSchema` (linha 21):**

```ts
/**
 * Um ingrediente da receita. `pantryItemId` é escrito pelo APP, nunca aceito do
 * modelo: o modelo só conhece a geladeira pelo que injetamos, e um "tem sim"
 * errado custa o ingrediente que falta na hora do fogão.
 */
export const recipeIngredientSchema = z.object({
  label: z.string().trim().min(1).max(80),
  quantity: z.coerce.number().positive().optional().catch(undefined),
  unit: z.string().trim().min(1).max(32).optional().catch(undefined),
  /** null = precisa comprar. Preenchido pela despensa (Fase 6); até lá sempre null. */
  pantryItemId: z.string().min(1).nullable().default(null),
  /** Centavos inteiros. undefined = sem histórico de preço para este item. */
  estimatedCostCents: z.coerce.number().int().nonnegative().optional().catch(undefined),
});
export type FoodRecipeIngredient = z.infer<typeof recipeIngredientSchema>;

export const recipeStepSchema = z.object({
  text: z.string().trim().min(1).max(400),
  minutes: z.coerce.number().int().positive().max(600).optional().catch(undefined),
});

export const foodRecipeSchema = z.object({
  servings: z.coerce.number().int().positive().max(20).default(1),
  totalMinutes: z.coerce.number().int().positive().max(600).optional().catch(undefined),
  ingredients: z.array(recipeIngredientSchema).min(1).max(30),
  steps: z.array(recipeStepSchema).min(1).max(20),
});
export type FoodRecipe = z.infer<typeof foodRecipeSchema>;
```

**`foodSchema` (linha 23-30) — atual:**

```ts
export const foodSchema = z.object({
  items: z.array(foodItemSchema),
  reasoning: z.string().max(2000).optional().catch(undefined),
  confidence: z.coerce.number().optional().catch(undefined),
});
```

**vira** (uma linha a mais, mesmo padrão `.optional().catch(undefined)` e pela mesma razão já documentada nas linhas 25-27):

```ts
export const foodSchema = z.object({
  items: z.array(foodItemSchema),
  reasoning: z.string().max(2000).optional().catch(undefined),
  confidence: z.coerce.number().optional().catch(undefined),
  // Mesma regra do reasoning: `EntryRepository.parseData` revalida toda linha
  // persistida contra o schema ATUAL (EntryRepository.ts:24-32), e um campo
  // obrigatório aqui apagaria toda refeição já salva. Receita meio válida cai
  // inteira no `.catch` em vez de derrubar a refeição.
  recipe: foodRecipeSchema.optional().catch(undefined),
});
```

**Onde a receita é persistida: dentro de `FoodData`, sem tabela nova.** Justificativa concreta — a receita tem que viajar junto com a refeição, e `FoodData` é o que viaja: `entries.data` (TEXT JSON, `db.ts:19`), `saved_meals.data` (`SavedMealRepository.ts:85-116` recebe `FoodData` inteiro), e `saved_routines.items[].data` (`routineFoodItemsSchema` embrulha `foodSchema`, `schemas.ts:160-165`). Tabela separada perderia a receita no instante em que o usuário marcasse a refeição como salva ou salvasse o dia como rotina, e cobraria repositório novo, join novo e cascade de delete.

**Bug de receita velha — verificado, não suposto.** Rodei zod 4.4.3 do próprio `node_modules`: chave ausente de um campo `.optional().catch(undefined)` é **omitida** do objeto parseado (`Object.keys` não a inclui). Logo `{ ...antigo, ...parseado }` **preserva** o valor antigo. Três lugares fazem esse spread:

1. `FoodNutritionEditSheet.tsx:416-421` — atual:

```ts
    await onSave(nextText, {
      ...data,
      items: savedItems,
      reasoning: undefined,
      confidence: undefined,
    });
```

vira (o usuário mexeu nos números na mão; a receita calculada não vale mais):

```ts
    await onSave(nextText, {
      ...data,
      items: savedItems,
      reasoning: undefined,
      confidence: undefined,
      recipe: undefined,
    });
```

2. `food.ts:237-243` `mergeFoodEdit` — atual:

```ts
  return foodSchema.parse({
    ...current,
    ...edit.meal,
    items: mergeDuplicateFoodItems([...keptOrEdited, ...returnedItems.values()]),
    reasoning: edit.meal.reasoning ?? current.reasoning,
    confidence: edit.meal.confidence ?? current.confidence,
  });
```

vira (explícito: a edição por IA mudou os itens; só vale a receita que a própria edição devolveu):

```ts
  return foodSchema.parse({
    ...current,
    ...edit.meal,
    items: mergeDuplicateFoodItems([...keptOrEdited, ...returnedItems.values()]),
    reasoning: edit.meal.reasoning ?? current.reasoning,
    confidence: edit.meal.confidence ?? current.confidence,
    // Sem `??`: uma edição que não devolveu receita é uma edição que invalidou
    // a antiga. Manter seria mostrar passo a passo de outra refeição.
    recipe: edit.meal.recipe,
  });
```

3. `DayTemplate.tsx:673` — `foodSchema.parse({ ...latestData, reasoning, confidence })`. **Não mudar.** Esse caminho só reescreve o raciocínio (`REFRESH_REASONING_INSTRUCTION`, linha 52-53) e preservar a receita é o comportamento correto. Vai um teste fixando isso.

**`deepseek.ts` — 5 edições pontuais:**

- linha 45: `intent: 'parse' | 'foodEdit';` → `intent: 'parse' | 'foodEdit' | 'recipe';`
- `EnrichEngineInput` ganha `pantry?: string;`
- linha 189, atual `intent === 'foodEdit' ? foodEditPrompt : promptByDomain[domain],` → 
  ```ts
    intent === 'recipe' ? recipePrompt : intent === 'foodEdit' ? foodEditPrompt : promptByDomain[domain],
  ```
- novo bloco junto de `userContextBlock` (linha 203-204):
  ```ts
  const pantryBlock = intent === 'recipe' && pantry ? `Pantry:\n${pantry}\n\n` : '';
  ```
  e `userContent` (linha 210) vira `${contextBlock}${userContextBlock}${pantryBlock}${currentFoodBlock}${instructionBlock}`
- linha 209, atual `intent === 'foodEdit' ? \`Instruction: ${text}\` : entryBlock;` → `recipe` usa `` `Request: ${text}` ``
- linha 218 `max_tokens`: `intent === 'parse' ? 1100 : intent === 'recipe' ? 2600 : 1800`
- linha 223 validação: `recipe` valida com **`foodEditSchema`** — o envelope `{ description?, meal, changes[] }` (`schemas.ts:33-43`) serve verbatim, `changes` já tem `.default([])`. Um schema a menos.
- linha 179 (`describeFoodMedia` só para `intent === 'parse'`) fica como está: pedido de receita não tem foto.

**`prompts.ts` — novo export, no fim do arquivo:**

```ts
export const recipePrompt = [
  'You create a cookable recipe and its nutrition from a user request.',
  'Return ONLY a JSON object of the shape',
  '{ "description": string, "meal": { "items": [ ... same item shape as the food parser ... ], "reasoning": string, "confidence": number, "recipe": { "servings": number, "totalMinutes": number, "ingredients": [ { "label": string, "quantity": number | null, "unit": string | null } ], "steps": [ { "text": string, "minutes": number | null } ] } } }.',
  'meal.items is the finished dish broken into its nutritional components, exactly like the normal food parser would break it down.',
  'recipe.ingredients is the shopping/prep list; one entry per distinct ingredient, with the amount for the whole recipe, not per serving.',
  'Do NOT set pantryItemId or estimatedCostCents; the app fills those in.',
  'If a Pantry block is provided, prefer ingredients that appear in it and say so in reasoning.',
  'recipe.steps are ordered, imperative, and each one is a single action a person performs.',
  'Do NOT sum or total anything - the app does all the math.',
  'Set description to a short name for the finished dish.',
  'If user nutrition context is provided, respect restrictions, allergies, diet preferences and goals - a recipe the person cannot eat is a failed recipe.',
  'Respond with JSON only, no prose.',
].join(' ');
```

**`src/domains/noteRequest.ts` — arquivo novo, ~45 linhas:**

```ts
import type { Domain } from '@/core/types';

export type NoteRequest = 'recipe' | 'workoutPlan';

/**
 * ponytail: roteador por regex, deliberadamente conservador. O teto é conhecido
 * — ele erra em frases criativas e cai no parse normal, que é a falha certa.
 * Caminho de upgrade: o registro `nome -> { schema zod, construir(args) }` da
 * ROADMAP 4c item 3 substitui este arquivo inteiro; até lá, um classificador
 * remoto custaria um round-trip em TODA nota escrita.
 */
const ASK = String.raw`(?:me\s+d[êe]|d[êe]|monta|monte|montar|cria|criar|fa[çc]a|faz|sugere|sugira|quero|preciso\s+de|build|make|plan|give\s+me|create)`;

const RECIPE_RE = new RegExp(String.raw`\b${ASK}\b[^\n]{0,40}\breceitas?\b`, 'i');
const RECIPE_HEAD_RE = /^\s*receitas?\s+(com|de|usando|pra|para)\b/i;
const RECIPE_EN_RE = new RegExp(String.raw`\b${ASK}\b[^\n]{0,40}\brecipes?\b`, 'i');

const PLAN_RE = new RegExp(String.raw`\b${ASK}\b[^\n]{0,40}\btreinos?\b`, 'i');
const PLAN_HEAD_RE = /^\s*treinos?\s+(da\s+semana|de\s+hoje|pra\s+hoje|full\s*body|abc)\b/i;
const PLAN_EN_RE = new RegExp(String.raw`\b${ASK}\b[^\n]{0,40}\bworkouts?\b`, 'i');

export function detectNoteRequest(text: string, domain: Domain): NoteRequest | null {
  const line = text.trim();
  if (!line) return null;
  if (domain === 'food') {
    return RECIPE_RE.test(line) || RECIPE_HEAD_RE.test(line) || RECIPE_EN_RE.test(line)
      ? 'recipe'
      : null;
  }
  if (domain === 'workout') {
    return PLAN_RE.test(line) || PLAN_HEAD_RE.test(line) || PLAN_EN_RE.test(line)
      ? 'workoutPlan'
      : null;
  }
  return null;
}
```

**`src/hooks/useNoteRequests.ts` — arquivo novo, ~130 linhas.** Assinatura:

```ts
export function useNoteRequests(domain: Domain, date: string): {
  /** true = a nota foi consumida como pedido; o chamador NÃO cria nota normal. */
  handle: (text: string) => boolean;
};
```

Fluxo da receita, reusando literalmente o padrão que `DayTemplate.handleAddEntry` já usa para mídia (linhas 450-551):

1. `EntryRepository.insert(placeholder)` + `useAppStore.getState().upsertEntry('food', placeholder)` com `status: 'thinking'`, `text` = o pedido original. O `NoteRow` já renderiza `ThinkingIndicator` para `status: 'thinking'` (`NoteRow.tsx:52`) — nenhum componente novo de loading.
2. `enrich({ domain: 'food', intent: 'recipe', locale, text, userContext: buildOnboardingPromptContext(useAppStore.getState().onboardingProfile, locale), pantry: undefined })`.
3. `foodEditSchema.safeParse(response.data)`; sucesso → `EntryRepository.update(id, { text: parsed.data.description ?? text, data: parsed.data.meal, status: 'done', error: null })` + `upsertEntry`.
4. Falha → `{ status: 'error', error: ENRICH_ERROR.failed }` (`CommandBus.ts:30-34`).

**`DayTemplate.tsx:426-431` — atual:**

```ts
  const handleAddEntry = useCallback(
    (text: string) => {
      if (!isFood) {
        addEntry(text);
        return;
      }
```

**vira:**

```ts
  const noteRequests = useNoteRequests(config.id, date);
  const handleAddEntry = useCallback(
    (text: string) => {
      if (noteRequests.handle(text)) return;
      if (!isFood) {
        addEntry(text);
        return;
      }
```

E `onRetry` (linha 871), hoje `onRetry={retryEntry}`, vira um wrapper: se `detectNoteRequest(entry.text, config.id)` casar, apaga a linha errada e re-executa o pedido; senão chama `retryEntry`. **Sem isso**, tocar em "tentar de novo" numa receita que falhou manda o texto "me dá uma receita com patinho" para o parser de comida e cria uma nota de ~0 kcal (ou, no treino, um exercício chamado "Monte um treino full body").

**`MacroStat.tsx` — extração mecânica.** Move de `FoodEntryDetailSheet.tsx`: `MacroStat` (67-91), `MicroSource` (93-99), `MICRO_STATS` (101-111), `ConfidenceRing` (113-121) e as regras de style `macroStat`, `macroValue`, `macroLabel`, `macroLabelText` (676-692). `macroRow` (671-675) **fica** no detail sheet — é layout de linha, não do stat. Saldo: −69 linhas, +2 de import → detail sheet vai de 804 para ~737, com folga para o bloco novo.

**`FoodEntryDetailSheet.tsx` — inserir entre o fecho da seção de itens (linha 577) e o bloco de raciocínio (579):**

```tsx
            {data.recipe ? (
              <View style={styles.section}>
                <AppText variant="heading">{t('recipe.title')}</AppText>
                <FoodRecipeCard recipe={data.recipe} />
              </View>
            ) : null}
```

**`FoodRecipeCard.tsx` — componente novo.** Props: `{ recipe: FoodRecipe }`. Estrutura, usando só o que já existe (`GlassSurface glass="regular"`, `AppText`, `AppIcon`, `Radii`/`Spacing`, `useColors`):

- Cabeçalho: `servings` + `totalMinutes` (ícone `clock`, existe em `AppIcon.tsx:68`).
- Ingredientes: uma linha por item, ícone `check` (`AppIcon.tsx:62`) em `colors.success` quando `pantryItemId !== null`, ícone `circleDot` (67) em `colors.textTertiary` quando `null`. Não inventar `shoppingCart` — não existe no registry (`AppIcon.tsx:54-102`); adicionar exige importar o lucide lá.
- Bloco "Falta comprar": só os `pantryItemId === null`. Total = soma dos `estimatedCostCents` **calculada no app** (a regra "Do NOT sum or total anything - the app does all the math" já é lei em `prompts.ts:42`). Se **qualquer** ingrediente do bloco tiver `estimatedCostCents === undefined`, não mostra total — mostra `t('recipe.costUnknown')`. Soma parcial exibida como total é preço mentiroso.
- Passos: lista numerada, `minutes` por passo quando houver.

### Comportamento

O usuário escreve `"me dá uma receita com patinho"` na aba Dieta e aperta enviar. A linha aparece na hora com o spinner de "pensando", igual a qualquer nota. Segundos depois vira uma refeição normal com nome de prato ("Patinho ao molho de tomate") e calorias no dock. Tocando nas calorias, o detalhe nutricional abre com a mesma carta de totais e a mesma lista de itens de sempre, e **abaixo dos itens** uma carta nova: rendimento, tempo, ingredientes com marcação de "tem"/"falta", o que precisa comprar e — quando houver histórico de preço — quanto sai.

Bordas:

- **Sem geladeira (hoje).** Todo ingrediente aparece como "falta comprar", sem custo, e o rodapé diz que não há histórico de preço. Nada some, nada mente.
- **Falso positivo do roteador.** "receita da minha avó, 300 kcal" escrito como registro vira pedido de receita. É por isso que as regexes exigem verbo de pedido; o teste negativo fixa esses casos. Quando erra, o usuário apaga a linha.
- **Falso negativo.** "quero comer algo com patinho hoje" vira nota de comida com ~0 kcal. Falha certa: nunca cria nota fantasma.
- **Enrich falha / sem chave.** Placeholder vira `status: 'error'`; o usuário toca em "tentar de novo" e o wrapper de `onRetry` re-executa o pedido, não o parser.
- **Edição manual depois da receita.** Mexer nos macros na mão apaga a receita (é outro prato agora). Edição por IA que devolve receita nova substitui; que não devolve, apaga. Refresh de raciocínio preserva.
- **Refeição salva / dia salvo.** Marcar como refeição salva ou salvar o dia como rotina leva a receita junto, porque ela mora dentro de `FoodData`.

### Migração de dados

Nenhuma alteração de schema SQLite. Nenhuma chave de settings nova.

Compatibilidade com base existente, ponto crítico: `EntryRepository.parseData` (`EntryRepository.ts:24-32`) revalida cada linha persistida contra o schema **atual** e uma linha `done` que não valida é rebaixada para `error` (`EntryRepository.ts:67`). Por isso `recipe` **tem** que ser `.optional().catch(undefined)` — um campo obrigatório aqui transformaria toda refeição já gravada em erro na primeira abertura do app após o update. Mesmo raciocínio vale para `saved_meals.data` (parseado sem zod, `SavedMealRepository.ts:44` — só um `JSON.parse` com cast, então lá é tolerante por acidente) e para `saved_routines.items` (parseado com zod, `SavedRoutineRepository.ts:54`, e uma linha que não valida é **descartada**, `linha 55`).

### Testes

| arquivo de teste | o que verifica | por que quebraria sem isso |
|---|---|---|
| `src/domains/schemas.test.ts` | `foodSchema` parseia refeição **sem** `recipe` e a chave fica ausente | é a garantia de compatibilidade de toda linha já gravada |
| idem | receita inválida (`steps: []`) cai no `.catch` e a refeição sobrevive sem `recipe` | uma receita malformada não pode custar a refeição |
| idem | `foodRecipeSchema` força `pantryItemId` default `null` e coage `estimatedCostCents` a inteiro | evita `have: true` vindo do modelo e centavos fracionados |
| idem | `foodEditSchema` aceita `meal.recipe` (o envelope reusado pelo intent `recipe`) | é o schema que valida a resposta do modelo |
| `src/domains/food.test.ts` | `mergeFoodEdit` com `edit.meal` sem receita **remove** a receita antiga | comportamento verificado do zod: spread preservaria; passo a passo de outro prato |
| idem | `mergeFoodEdit` com receita nova substitui a antiga | edição por IA tem que poder trocar a receita |
| `src/domains/noteRequest.test.ts` | positivos pt-BR e en-US ("me dá uma receita com patinho", "give me a recipe with beef", "monte um treino full body pra hoje") | é o único gatilho da capacidade |
| idem | negativos ("receita da vovó 300kcal", "arroz com feijão", "supino 100x8") | falso positivo transforma registro em pedido |
| idem | `detectNoteRequest('...receita...', 'workout')` retorna `null` e vice-versa | pedido tem que respeitar o domínio da aba |
| `src/core/enrich/deepseek.ts` (via teste novo `deepseek.test.ts` ou extensão de `client.test.ts`) | `intent: 'recipe'` seleciona `recipePrompt`, injeta `Pantry:` quando `pantry` vem, e valida com `foodEditSchema` | um intent que cai no prompt errado devolve JSON do formato errado |

Testes de render (`FoodRecipeCard`) **não** entram: `testMatch` é `<rootDir>/src/**/*.test.ts` (package.json:66-68), só `.ts`. Toda lógica testável do card (quais ingredientes vão para "falta comprar", quando o total é suprimido) tem que sair do `.tsx` para uma função pura — colocar em `src/domains/food.ts`:

```ts
export function recipeShoppingList(recipe: FoodRecipe): {
  missing: FoodRecipeIngredient[];
  totalCents: number | null; // null quando algum custo é desconhecido
}
```

e testar essa função em `src/domains/food.test.ts`. O card só chama.

### Riscos

- **Receita silenciosamente desatualizada.** É o risco central e ele é invisível: o usuário edita macros na mão e o passo a passo continua lá, agora mentindo. Detecção cedo: os dois testes de `mergeFoodEdit` + o teste de `handleSave` derrubando `recipe`. Se algum novo caminho de escrita de `FoodData` aparecer, ele precisa decidir explicitamente sobre `recipe` — grep por `foodSchema.parse({` acha todos (hoje: `DayTemplate.tsx:536,621,672,673,787`, `food.ts:237`).
- **`max_tokens: 2600` truncando a receita.** Resposta cortada = JSON inválido = `'AI returned invalid JSON'` (`deepseek.ts:104`), terminal, sem retry. Detecção: se aparecer taxa de falha alta em receitas longas, é isso. Mitigação: `steps` já tem `.max(20)` e o prompt manda passos de ação única.
- **Custo por receita.** 2600 tokens de saída por pedido, no modelo `deepseek-v4-flash` (`deepseek.ts:22`). Não há throttle nenhum: o usuário pode pedir 10 receitas seguidas.
- **Preço regional.** ROADMAP.md:313 já registra: "preço de alimento varia por região e no tempo, fonte de dados ainda indefinida". Aqui a fonte é o próprio usuário (o que ele digitou ao comprar), o que é a saída certa — mas exige a Fase 6 e não tem moeda modelada em lugar nenhum do app. Armazenar centavos inteiros e formatar por locale evita o pior; ainda assim, decidir a moeda é decisão pendente.
- **Detail sheet voltar a estourar 800 linhas.** A extração do `MacroStat` compra ~65 linhas de folga, não mais que isso. O próximo bloco tem que nascer em arquivo próprio.

---

## Fase 8 — Treino montado com a realidade da pessoa

`"monte um treino full body pra hoje"` / `"monte meu treino da semana inteira"`.

### Pré-requisitos

**Bloqueio duro, e é de coleta, não de código:** a ordem de dureza que o roadmap define (restrições > aparelhos > histórico > preferências > objetivo, ROADMAP.md:153-159) precisa de dados que **não existem em lugar nenhum**. `OnboardingProfile` (`src/core/onboarding.ts:23-37`) tem 13 campos e nenhum é `injuries`, `equipment`, `environment`, `exercisesDisliked`, `sportsLiked`, `workoutGoal` ou `trainingLevel`. Isso é a Fase B/Fase 3 do roadmap. **Sem ela, os níveis 1, 2, 4 e 5 da ordem de dureza simplesmente não existem** e a capacidade colapsa em "histórico + `considerations`".

O que **pode** ser feito hoje sem uma pergunta nova: o nível 3 (histórico de cargas), porque o log já está gravado, e um recorte do nível 5, porque `considerations` já coleta `strength`/`endurance`/`athlete` (`onboarding.ts:7-13`).

**Não precisa da camada de ferramentas:** nem das ferramentas de leitura (ROADMAP 4c item 4) nem do loop (item 5). O app lê o próprio histórico localmente e injeta como bloco de contexto — exatamente o que `buildOnboardingPromptContext` já faz para comida (`onboarding.ts:183-218`, consumido em `deepseek.ts:204`). O loop de ferramentas só seria necessário se o **modelo** tivesse que decidir o que consultar; aqui o app sabe de antemão.

**Precisa da camada de execução compartilhada acima:** `CompositeCommand` + `date` opcional. "Semana toda" grava em 7 datas e tem que desfazer em um toque.

**Fase 0 do roadmap (os 3 portões) não bloqueia o plano em si** — o enrich do plano é um intent novo com bloco de contexto próprio, não passa pelo gate `domain === 'food'` de `deepseek.ts:192,204`. Mas bloqueia a *qualidade das notas resultantes*: cada exercício gerado vira nota de treino e é enriquecido cego (`CommandBus.ts:249` passa `userContext: undefined` literal). **Atenção ao ligar a Fase 0:** `userContext` entra no `hashKey` (`CommandBus.ts:171-174`) e invalida todo o cache de treino existente.

### Arquivos

| arquivo | ação | o que exatamente muda |
|---|---|---|
| `src/core/onboarding.ts` | editar | `OnboardingProfile` ganha `workout: WorkoutProfile`; `defaultOnboardingProfile` e `normalizeOnboardingProfile` preenchem defaults |
| `src/domains/workoutPlan.ts` | criar | `workoutPlanSchema`, `planToNoteRequests`, `isBlockedExercise` |
| `src/domains/workoutPlan.test.ts` | criar | validação, mapeamento offset→data, round-trip com `parseWorkoutText`, filtro de lesão |
| `src/domains/workoutContext.ts` | criar | `buildWorkoutPromptContext` — restrições, aparelhos, histórico de cargas, preferências, objetivo |
| `src/domains/workoutContext.test.ts` | criar | ordem dos blocos, cap de exercícios, perfil nulo |
| `src/domains/prompts.ts` | editar | novo export `workoutPlanPrompt` |
| `src/core/enrich/types.ts` | editar | intent ganha `'workoutPlan'`; novo campo `workoutContext?: string` |
| `src/core/enrich/deepseek.ts` | editar | mesmas 5 edições pontuais do intent `recipe`, mais o ramo `workoutPlan` |
| `src/hooks/useNoteRequests.ts` | editar | ramo `workoutPlan`: contexto → enrich → `planToNoteRequests` → `bus.runPlan` |
| `src/components/templates/DayTemplate.tsx` | editar | `undoLabel` vira estado (hoje hardcoded na linha 879) |
| `src/i18n/index.ts` | editar | `undo.planCreated`, `plan.workoutLabel`, `plan.blocked` nos dois blocos |
| `src/domains/onboardingQuestions.ts` + `src/components/onboarding/onboardingContent.ts` | editar (Fase B) | perguntas novas — **fora do escopo desta área**, listar como dependência |

### Trechos

**`OnboardingProfile` (`onboarding.ts:23-37`)** ganha um sub-objeto em vez de 7 campos soltos, para que `normalizeOnboardingProfile` (103-120) preencha o default de uma vez para todo perfil já gravado:

```ts
export type WorkoutEnvironment = 'fullGym' | 'basicGym' | 'home' | 'outdoor';
export type WorkoutGoal = 'hypertrophy' | 'strength' | 'endurance' | 'weightLoss';
export type TrainingLevel = 'beginner' | 'intermediate' | 'advanced';

export interface WorkoutProfile {
  environment: WorkoutEnvironment;
  equipment: string[];
  /** Restrição dura. Nunca sugestão. Dado de saúde — ver ROADMAP 5b. */
  injuries: string[];
  exercisesDisliked: string[];
  sportsLiked: string[];
  goal: WorkoutGoal;
  level: TrainingLevel;
}
```

e em `normalizeOnboardingProfile`, junto do tratamento que já existe para `micronutrients`:

```ts
    workout: { ...base.workout, ...profile.workout },
```

**`workoutPlanSchema` (`src/domains/workoutPlan.ts`):**

```ts
export const plannedSetSchema = z.object({
  reps: z.coerce.number().int().positive().max(100).optional().catch(undefined),
  weightKg: z.coerce.number().nonnegative().max(1000).optional().catch(undefined),
  durationSeconds: z.coerce.number().int().positive().max(36_000).optional().catch(undefined),
  distanceMeters: z.coerce.number().positive().max(200_000).optional().catch(undefined),
});

export const plannedExerciseSchema = z.object({
  exercise: z.string().trim().min(1).max(80),
  sets: z.array(plannedSetSchema).min(1).max(12),
});

export const workoutPlanSchema = z.object({
  days: z
    .array(
      z.object({
        /**
         * 0 = hoje. O app é quem resolve a data. Uma data ISO vinda do modelo
         * não é confiável — é a diferença entre "amanhã" e 1970-01-01, e o
         * SQLite aceitaria as duas caladamente.
         */
        dayOffset: z.coerce.number().int().min(0).max(13),
        exercises: z.array(plannedExerciseSchema).min(1).max(8),
      }),
    )
    .min(1)
    .max(7),
});
export type WorkoutPlan = z.infer<typeof workoutPlanSchema>;
```

Sem campo `reasoning` no plano: nada no domínio de treino renderiza raciocínio (`WorkoutData`, `schemas.ts:118-128`, não tem o campo), e dado coletado sem consumidor é dívida — a própria regra do ROADMAP.md:311.

**Plano → notas.** O ponto de reuso que decide a viabilidade: cada exercício vira uma nota de treino no **mesmo formato de texto multi-linha que o parser já lê**, então não há caminho de dados novo, nem render novo, e o usuário edita no outliner como qualquer nota.

```ts
import { addDays } from '@/core/date';
import {
  formatWorkoutDistance,
  formatWorkoutDuration,
  formatWorkoutSet,
  serializeWorkoutLines,
} from '@/domains/workout';

/** Uma linha de série no dialeto que `parseWorkoutSetLine` entende. */
function setLine(set: z.infer<typeof plannedSetSchema>): string {
  if (set.weightKg !== undefined && set.reps !== undefined) {
    return formatWorkoutSet(set.weightKg, 'kg', set.reps);       // "100 kg x 8"
  }
  if (set.reps !== undefined) return `${set.reps} reps`;
  return [
    set.distanceMeters !== undefined ? formatWorkoutDistance(set.distanceMeters) : '',
    set.durationSeconds !== undefined ? formatWorkoutDuration(set.durationSeconds) : '',
  ]
    .filter(Boolean)
    .join(' ');                                                   // "5 km 30 min"
}

export function planToNoteRequests(
  plan: WorkoutPlan,
  today: string,
  isBlocked: (exercise: string) => boolean,
): { text: string; domain: 'workout'; date: string }[] {
  return plan.days.flatMap((day) =>
    day.exercises
      .filter((exercise) => !isBlocked(exercise.exercise))
      .map((exercise) => ({
        domain: 'workout' as const,
        date: addDays(today, day.dayOffset),
        text: serializeWorkoutLines([
          exercise.exercise,
          ...exercise.sets.map(setLine).filter(Boolean),
        ]),
      })),
  );
}
```

**O filtro de restrição é uma barreira do app, não uma instrução de prompt.** O prompt pede; o filtro garante. Um modelo pode ser convencido a ignorar uma regra de texto, não pode ser convencido a atravessar um `filter`. Como é dado de saúde (ROADMAP.md:312 e 5b), isso não é simplificável:

```ts
export function isBlockedExercise(exercise: string, workout: WorkoutProfile): boolean {
  const term = normalizeTerm(exercise); // NFD, sem acento, lowercase — mesmo tratamento de food.ts:121-127
  return [...workout.injuries, ...workout.exercisesDisliked]
    .map(normalizeTerm)
    .filter((banned) => banned.length >= 3)
    .some((banned) => term.includes(banned));
}
```

**`buildWorkoutPromptContext` (`src/domains/workoutContext.ts`)** — mesmo estilo de linhas `chave=valor` de `buildOnboardingPromptContext` (`onboarding.ts:201-217`), na ordem de dureza:

```ts
export function buildWorkoutPromptContext(input: {
  profile: OnboardingProfile | null;
  history: Entry[];   // EntryRepository.findAll('workout')
  today: string;
  locale: string;
}): string
```

Emite, nesta ordem:

1. `Hard constraints (never violate): injuries=..., avoid=...`
2. `Environment: environment=..., equipment=...`
3. `Load history (last logged session per exercise, most recent first):` — até **12** exercícios, cada linha `Supino reto: last 100 kg x 8 on 2026-07-18, best volume 3200 kg`. Os números saem de `buildHistory` (`workoutProgress.ts:100-131`) e `sessionsByExercise` (78-98), que já existem, já somam sessão dividida em várias notas e já têm teste. **Não reimplementar.**
4. `Prefers: sportsLiked=...`
5. `Goal: goal=..., level=..., considerations=...`
6. `Trained on: 2026-07-15, 2026-07-18, ...` (últimos 14 dias, para o modelo não empilhar o mesmo grupo)

Cap em 12 exercícios porque o contexto viaja em toda chamada de plano e `max_tokens` do request é finito.

**`deepseek.ts`** — o ramo `workoutPlan` valida com `workoutPlanSchema` e usa `max_tokens: 2200`. O bloco de contexto entra como `Workout context:\n${workoutContext}\n\n`, análogo ao `userContextBlock` de comida (linha 204).

**`DayTemplate.tsx:879` — atual:**

```tsx
          {undoVisible ? <UndoToast label={t('undo.deleted')} onUndo={handleUndo} /> : null}
```

**vira** (o `UndoToast` já recebe `label` como prop, `UndoToast.tsx:10`; nada muda nele):

```tsx
          {undoVisible ? <UndoToast label={undoLabel} onUndo={handleUndo} /> : null}
```

com `const [undoLabel, setUndoLabel] = useState(t('undo.deleted'))`, setado para `t('undo.planCreated')` quando `bus.runPlan` resolve com um `Command` não-nulo, e o mesmo `undoCommand.current`/`timer.current` já existentes (`DayTemplate.tsx:265-266, 378-390`) fazem o resto.

### Comportamento

O usuário escreve `"monte meu treino da semana inteira"` na aba Treino. A linha aparece com o spinner. Alguns segundos depois ela some e no lugar surgem os exercícios **de hoje** — os dos outros dias foram gravados e aparecem ao navegar com as setas do `DayHeader`. Um toast "Plano da semana criado · Desfazer" fica 4 segundos; um toque apaga o plano inteiro.

Cada exercício é uma nota de treino normal: editável no outliner, com carga sugerida já preenchida a partir do que a pessoa levantou da última vez, marcável como exercício salvo, contando no dock e no monitor.

Bordas:

- **Sem os campos da Fase B.** O modelo recebe só histórico + `considerations` e monta um treino genérico-porém-progressivo. Nenhuma restrição é aplicada porque `injuries` está vazio. Funciona, mas é a versão fraca — e é por isso que a Fase B é pré-requisito de verdade, não de fachada.
- **Restrição violada pelo modelo.** O exercício é descartado silenciosamente pelo filtro. Se o dia inteiro for descartado, o dia sai vazio do plano. Se **todos** os dias saírem vazios, `runPlan` devolve `null` e a nota vira `status: 'error'` — não um plano vazio fingindo sucesso.
- **`dayOffset` fora de faixa.** Rejeitado pelo schema, plano inteiro descartado. Preferível a gravar em 1970.
- **Usuário está num dia passado.** `today` no `planToNoteRequests` é o **dia visível** (`useDay().date`), não `todayISO()`. "pra hoje" com o app aberto em 15/jul grava em 15/jul. É o comportamento que a navegação de dias do app já ensina.
- **Undo depois de navegar.** O `CompositeCommand` guarda os comandos, não a tela: desfazer de outro dia apaga tudo mesmo assim, e o store remove só as linhas do dia visível (`useAppStore.ts:104-110`) — as outras já saíram do SQLite e não voltam ao serem visitadas.
- **Plano parcialmente escrito.** Rollback do `CompositeCommand`: ou 35 notas, ou nenhuma.

### Migração de dados

**SQLite: nenhuma mudança.** Nenhuma tabela nova, nenhuma coluna nova. O plano só produz linhas em `entries` no formato que já existe.

**Chave de settings: `onboarding_profile` (`useAppStore.ts:50`)**, gravada como JSON (linha 182/201). O sub-objeto `workout` é preenchido para todo perfil antigo por `normalizeOnboardingProfile`, que `parseOnboardingProfile` (`useAppStore.ts:216-223`) já roda em toda leitura. Perfil gravado antes desta mudança carrega os defaults e nada quebra.

**Cuidado de privacidade que é requisito, não sugestão:** `injuries` e `conditions` são dado de saúde e **saem do aparelho** na chamada à DeepSeek (ROADMAP.md:261-265, 281-283). A tela que coletar esses campos precisa dizer isso na própria tela. Isso vale para a Fase B (coleta) e é dependência desta capacidade.

### Testes

| arquivo de teste | o que verifica | por que quebraria sem isso |
|---|---|---|
| `src/domains/workoutPlan.test.ts` | `dayOffset` fora de 0-13 rejeita o plano inteiro | data inventada grava em ano errado, invisível para sempre |
| idem | `planToNoteRequests` mapeia offset 0/3/6 para as datas certas a partir do dia visível | "semana toda" nas datas erradas é a falha silenciosa mais cara |
| idem | **round-trip**: `parseWorkoutText(planToNoteRequests(...)[0].text)` devolve exercício, peso e reps do plano | se o texto gerado não é o dialeto que o parser lê, toda nota do plano vira exercício sem série |
| idem | round-trip de cardio: `5 km 30 min` volta como `distanceMeters: 5000, durationSeconds: 1800` | mesma razão, no ramo cardio |
| idem | exercício que casa com `injuries` é descartado | é a barreira de saúde; prompt não é garantia |
| idem | plano cujos exercícios são todos bloqueados devolve lista vazia | plano vazio não pode virar "sucesso" |
| `src/domains/workoutContext.test.ts` | restrições aparecem antes de aparelhos, que aparecem antes de histórico | a ordem de dureza é o requisito do roadmap |
| idem | histórico limitado a 12 exercícios, os mais recentes | prompt sem teto estoura `max_tokens` e a resposta trunca |
| idem | `profile: null` produz contexto só com histórico, sem lançar | o perfil é nulo antes do onboarding terminar (`useAppStore.ts:191` documenta o caso) |
| `src/core/command/CommandBus.test.ts` | `runPlan` de 2 dias × 2 exercícios dispara 4 `enrichFn` | fixa o custo de enrich por plano; se virar 8, alguém duplicou o enqueue |
| `src/core/onboarding.test.ts` | `normalizeOnboardingProfile({})` preenche `workout` com defaults | perfil antigo lido do settings sem `workout` quebraria toda leitura de `profile.workout.injuries` |

### Riscos

- **Enxurrada de enrich.** Cada exercício planejado vira `AddEntryCommand` → `enqueueEnrich` → uma chamada DeepSeek para classificar anatomia (`CommandBus.ts:243-252`). 7 dias × 8 exercícios = até 56 chamadas, disparadas sem `await` (`CommandBus.ts:147`), portanto quase simultâneas. O `inflight` dedupe só requests idênticos e o `hashKey` inclui a carga, que muda a cada dia progressivo — então dedupe real é baixo. `deepseek.ts:90` trata 429 como erro de transporte e o bus faz backoff até 5 tentativas, depois marca `ENRICH_ERROR.offline` (`CommandBus.ts:334-336`). **Detecção cedo:** o teste que conta invocações de `enrichFn`; em produção, notas de plano com `status: 'error'` e `error: 'enrich.offline'`. **Mitigação hoje:** o `.max(7)` de dias e o `.max(8)` de exercícios no schema tetam em 56. **Caminho de upgrade** (marcar com comentário `ponytail:`): o próprio plano devolver `primary`/`synergists` por exercício e inserir com `status: 'done'`, zerando as chamadas — custa resposta maior e vale a pena só se o 429 aparecer.
- **A capacidade prometida não é a capacidade entregue.** Sem a Fase B, "considera restrições > aparelhos > histórico > preferências > objetivo" entrega dois dos cinco. Se isso for entregue como está e comunicado como a coisa completa, é promessa quebrada. Detecção: o teste de ordem em `workoutContext.test.ts` mostra quais blocos saem vazios.
- **Dado de saúde no prompt.** Cada plano manda lesões e condições para a DeepSeek. É verdadeiro hoje para o texto de qualquer nota, mas lesão é categoria diferente. Precisa de aviso na tela de coleta antes de a Fase B ser considerada pronta.
- **Roteador de regex no domínio de treino é mais arriscado que no de comida.** "treino de peito hoje" é um registro legítimo e a regex do plano exige verbo de pedido justamente por isso — mas "quero treino de peito" cai no pedido. Detecção: casos negativos no `noteRequest.test.ts`. Falha barata (o usuário apaga), mas irritante se comum.
- **Beira de reivindicação médica.** ROADMAP.md:312: tratar como restrição de exercício, nunca como diagnóstico ou recomendação clínica. O prompt não pode conter linguagem de recomendação de saúde, e o texto da UI também não.

---

## Ordem de execução recomendada

1. **Camada compartilhada** (`CompositeCommand` + `date`) — independente, testável, útil sozinha, nenhum bloqueio.
2. **Extração do `MacroStat`** — 15 minutos, destrava o teto de linhas do detail sheet.
3. **Schema da receita + os 3 pontos de spread** — sem IA, sem UI; só schema e merge, com os testes que fixam a não-obsolescência.
4. **`FoodRecipeCard` + bloco no detail sheet** — render puro, degradando para "tudo falta comprar".
5. **`noteRequest` + `useNoteRequests` + intent `recipe`** — fecha a Fase 7 na versão sem geladeira.
6. **Fase B de coleta** (fora desta área) — bloqueio duro da Fase 8.
7. **`workoutContext` + `workoutPlan` + intent `workoutPlan`** — fecha a Fase 8.

Os passos 1 a 5 não dependem de nada do que ainda não existe. O passo 7 depende do 6, e o custo completo da Fase 7 (geladeira e preço) depende das Fases 5 e 6 do roadmap, que não fazem parte desta área.
