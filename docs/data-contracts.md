# Contratos de Dados

Os contratos abaixo refletem os tipos atuais em `src/core/types.ts` e
`src/domains/schemas.ts`. Sempre validar dados externos com Zod antes de
salvar/aplicar.

## Entry

```ts
type Domain = "food" | "workout";
type EntryStatus = "thinking" | "queued" | "done" | "error";
type EntryMediaKind = "foodPhoto" | "menuPhoto" | "barcode";

interface Entry {
  id: string;
  date: string; // YYYY-MM-DD local
  domain: Domain;
  text: string;
  media?: EntryMediaAttachment[];
  status: EntryStatus;
  data: EnrichData | null;
  error: string | null;
  createdAt: number;
}
```

## EntryMediaAttachment

```ts
interface EntryMediaAttachment {
  id: string;
  kind: "foodPhoto" | "menuPhoto" | "barcode";
  uri?: string;
  description: string;
}
```

Uso:

- `id` liga foto/barcode a `FoodItem.mediaId`.
- `description` pode ser digitada pelo usuario ou gerada pela IA.
- Barcode pode ter `uri` da imagem do produto no Open Food Facts.

## FoodItem

```ts
interface FoodItem {
  label: string;
  mediaId?: string;
  quantity?: number;
  unit?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
}
```

Regras:

- Macros em gramas.
- `waterMl` em mililitros.
- `sugarG` e `fiberG` em gramas.
- `sodiumMg` em miligramas.
- `quantity/unit` so para itens contaveis ou unidades explicitas que fazem
  sentido na UI: ovos, copos, latas, fatias, unidades, porcoes etc.
- Nao usar quantidade para coisas genericas como arroz cozido estimado, pasta,
  pratos mistos ou porcao sem unidade util.
- Se quantidade for 1, preferir omitir, exceto quando a unidade importa.

## FoodData

```ts
interface FoodData {
  items: FoodItem[];
  reasoning?: string;
  confidence?: number;
}
```

`reasoning` e `confidence` sao opcionais para compatibilidade com rows antigas e
edicoes manuais.

## FoodEditData

```ts
interface FoodEditData {
  description?: string;
  meal: FoodData;
  changes: {
    action: "added" | "edited" | "removed";
    item: string;
    note?: string;
  }[];
}
```

Uso:

- Resposta esperada do prompt de edicao com IA.
- `description` vira o texto final da refeicao.
- `meal` e a refeicao final.
- `changes` descreve as edicoes aplicadas, mas nao deve aparecer no raciocinio final.

## WorkoutData

```ts
interface WorkoutSet {
  weight?: number;
  unit?: "kg" | "lb";
  reps?: number;
  durationSeconds?: number;
  distanceMeters?: number;
}

type WorkoutKind = "strength" | "cardio";

interface WorkoutData {
  exercise: string | null;
  kind?: WorkoutKind;
  sets: WorkoutSet[];
}
```

Todos os campos de `WorkoutSet` sao opcionais porque a mesma estrutura serve
para musculacao e cardio. Duas regras de `.refine` em `setSchema` garantem que a
serie ainda faca sentido:

1. a serie precisa de pelo menos uma metrica (`weight`, `reps`,
   `durationSeconds` ou `distanceMeters`);
2. `weight` sem `reps` e invalido — carga sem repeticao nao gera volume.

Outras regras do schema:

- `null` em qualquer campo opcional e tratado como ausente (`nullToUndefined`),
  porque a IA costuma devolver `null` em vez de omitir a chave.
- `kind` aceita aliases e normaliza antes de validar: `serie`, `series`,
  `strength`, `forca` e `musculacao` viram `strength`; `cardio` fica `cardio`.
  A comparacao ignora acento e caixa.
- `sets` tem `.default([])`, entao uma resposta so com nome de exercicio
  (`{ exercise: "Supino reto", kind: "series" }`) valida.
- Zero series continua valido: o outliner cria o exercicio antes das linhas.

Volume (so conta series com carga e repeticao):

```ts
volumeKg = sum(toKg(weight, unit ?? "kg") * reps)
```

Cardio nao entra no volume. Duracao e distancia somam em campos proprios, e o
pace e derivado, nunca armazenado:

```ts
paceSecondsPerKm = durationSeconds / (distanceMeters / 1000)
```

## WorkoutTotals

```ts
interface WorkoutTotals {
  sets: number;
  volumeKg: number;
  durationSeconds: number;
  distanceMeters: number;
}
```

`describeTotals` sempre devolve as quatro chaves (`sets`, `vol`, `time`,
`dist`), mesmo zeradas. Quem quiser esconder metrica vazia filtra na tela.

## SavedWorkout

```ts
type SavedWorkoutKind = "exercise" | "day";

interface SavedWorkout {
  id: string;
  kind: SavedWorkoutKind;
  name: string;
  exercises: string[];
  sourceEntryId?: string;
  sourceDate?: string;
  createdAt: number;
}
```

Uso:

- `kind: "exercise"`: um exercicio salvo pelo bookmark do outliner.
  `sourceEntryId` aponta para a `Entry` de origem.
- `kind: "day"`: o dia inteiro salvo pelo monitor de treino. `sourceDate`
  guarda o dia de origem. O `name` e a data formatada do dia visivel, sem ponto
  final, nao um titulo escolhido pelo usuario.
- `exercises` guarda so nomes, nao series. Reaplicar um template cria entradas
  novas e vazias para o usuario preencher.
- Nomes sao limpos antes de salvar: `trim`, remocao de vazios e dedupe
  case-insensitive. Se sobrar lista vazia, `save` devolve `null` e nao grava.
- Na leitura, `toSavedWorkout` descarta row com `kind` desconhecido, com
  `exercises` que nao faz parse, ou que fica sem exercicio depois da limpeza.
  A row sai de `all()` calada. `count()` e um `COUNT(*)` cru, entao pode
  divergir de `all().length` quando alguma row e descartada.
- `save` e idempotente por origem: se ja existe registro com o mesmo
  `sourceEntryId` (ou o mesmo `sourceDate` para `kind: "day"`), devolve o
  existente em vez de duplicar.

## EnrichRequest

```ts
interface EnrichRequest {
  text: string;
  domain: "food" | "workout";
  intent?: "parse" | "foodEdit";
  currentFood?: FoodData;
  media?: EnrichMediaInput[];
  context?: string;
  userContext?: string;
  locale: string;
}
```

`intent`:

- omitido ou `parse`: parse normal.
- `foodEdit`: editar refeicao existente.

`context`:

- treino: ultimo exercicio conhecido.

`userContext`:

- comida: perfil nutricional local vindo do onboarding.

## EnrichMediaInput

```ts
interface EnrichMediaInput {
  id: string;
  kind: "foodPhoto" | "menuPhoto";
  mimeType?: string;
  base64: string;
  description?: string;
}
```

Barcode nao entra aqui porque os dados vem de Open Food Facts.

## EnrichResponse

```ts
type EnrichResponse =
  | {
      ok: true;
      data: unknown;
      mediaDescriptions?: { id: string; description: string }[];
    }
  | { ok: false; error: string };
```

`data` sempre deve ser revalidado contra o schema do dominio antes de aplicar.

## OpenFoodFactsFood

```ts
interface OpenFoodFactsFood {
  text: string;
  data: FoodData;
  imageUri?: string;
}
```

Mapeamento:

- `text`: nome do produto, com marca quando existe.
- `data.items[0]`: produto como item.
- `quantity: 1`, `unit: "unidade"` para permitir merge de duplicados.
- `waterMl`: volume quando produto parece hidratante, como agua, leite, suco,
  refrigerante, bebida, cafe, cha, iogurte ou kefir.
- `sugarG`, `fiberG`: importados de `sugars_*` e `fiber_*` quando existem.
- `sodiumMg`: importado de `sodium_*` convertido de g para mg; se faltar,
  usa `salt_*` convertido para sodio aproximado.
- Oleos e vinagre nao contam como hidratacao.

## OnboardingProfile

```ts
interface OnboardingProfile {
  gender: "male" | "female" | "other" | "private";
  birthDate: string;
  heightCm: number;
  weightKg: number;
  goalWeightKg: number;
  goalDate: string | null;
  activity: "sedentary" | "light" | "moderate" | "high";
  considerations: (
    | "high-protein"
    | "low-carb"
    | "athlete"
    | "strength"
    | "endurance"
    | "vegetarian"
  )[];
  notes: string;
  estimationBias: 0 | 1 | 2 | 3 | 4;
  trackMicronutrients: boolean;
  micronutrients: {
    sugar: boolean;
    fiber: boolean;
    sodium: boolean;
  };
  micronutrientTargets: {
    sugarG: number;
    fiberG: number;
    sodiumMg: number;
  };
}
```

Perfis antigos sem `micronutrients` ou `micronutrientTargets` sao normalizados
em `normalizeOnboardingProfile` ao hidratar/salvar.

## OnboardingSummary

```ts
interface OnboardingSummary {
  age: number;
  bmr: number;
  tdee: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
  deltaKg: number;
  targetDays: number;
}
```

Calculos:

- `bmr`: Harris-Benedict.
- `tdee`: BMR vezes multiplicador de atividade.
- `calories`: TDEE ajustado por meta, vies e consideracoes.
- `protein/carbs/fat/waterMl/sugarG/fiberG/sodiumMg`: metas diarias.

## SQLite

Tabela `entries`:

```sql
CREATE TABLE entries (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL,
  domain TEXT NOT NULL,
  text TEXT NOT NULL,
  media TEXT,
  status TEXT NOT NULL,
  data TEXT,
  error TEXT,
  createdAt INTEGER NOT NULL
);
CREATE INDEX idx_entries_day ON entries (domain, date);
```

Tabela `settings`:

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
```

Chaves conhecidas:

- `theme`: `system | light | dark`.
- `lang`: `pt-BR | en-US`.
- `onboarding_done`: `"1"` ou `"0"`.
- `onboarding_profile`: JSON de `OnboardingProfile`.

Tabela `saved_meals`:

```sql
CREATE TABLE saved_meals (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  media TEXT,
  sourceEntryId TEXT,
  createdAt INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_saved_meals_source
  ON saved_meals (sourceEntryId)
  WHERE sourceEntryId IS NOT NULL;
```

Tabela `saved_workouts`:

```sql
CREATE TABLE saved_workouts (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  exercises TEXT NOT NULL,
  sourceEntryId TEXT,
  sourceDate TEXT,
  createdAt INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_saved_workouts_source
  ON saved_workouts (sourceEntryId)
  WHERE sourceEntryId IS NOT NULL;
CREATE UNIQUE INDEX idx_saved_workouts_day
  ON saved_workouts (sourceDate)
  WHERE sourceDate IS NOT NULL AND kind = 'day';
```

`exercises` e um array JSON de strings.

A idempotencia de `SavedWorkoutRepository.save` vem do SELECT-antes-do-INSERT no
proprio repository, que devolve o registro existente por `sourceEntryId` (ou por
`kind = 'day'` + `sourceDate`) em vez de inserir de novo. Os dois indices unicos
parciais sao a garantia no nivel do banco contra corrida — um exercicio por
`Entry`, um template de dia por data. Como o `INSERT` nao tem `ON CONFLICT` nem
`try/catch`, violar esses indices propaga erro em vez de devolver o existente.
Nao tirar o SELECT achando que o indice cobre.

`db.ts` roda migracao aditiva ao abrir: colunas faltantes (`entries.media`,
`saved_meals.media`, `saved_meals.sourceEntryId`) sao adicionadas via
`ALTER TABLE` antes da criacao dos indices.

## Prompt de Food Parse

Forma esperada:

```json
{
  "items": [
    {
      "label": "arroz com frango",
      "mediaId": null,
      "quantity": null,
      "unit": null,
      "calories": 510,
      "protein": 30.6,
      "carbs": 60,
      "fat": 15,
      "waterMl": 0,
      "sugarG": 0,
      "fiberG": 0,
      "sodiumMg": 0
    }
  ],
  "reasoning": "Texto curto explicando estimativa.",
  "confidence": 65
}
```

Obrigatorio no prompt:

- Retornar JSON puro.
- Um objeto por componente distinto.
- Incluir texto e imagens quando ambos existem.
- Nao retornar totais.
- Usar contexto do perfil quando enviado.
- Se `userContext` incluir `trackMicronutrients`, calcular `sugarG`,
  `fiberG` e `sodiumMg` por item; caso contrario retornar `0`.

## Prompt de Food Edit

Forma esperada:

```json
{
  "description": "arroz com frango e ovo frito",
  "meal": {
    "items": [
      {
        "label": "arroz com frango",
        "calories": 510,
        "protein": 30.6,
        "carbs": 60,
        "fat": 15,
        "waterMl": 0,
        "sugarG": 0,
        "fiberG": 0,
        "sodiumMg": 0
      },
      {
        "label": "ovo frito",
        "quantity": 1,
        "unit": "unidade",
        "calories": 90,
        "protein": 6,
        "carbs": 0.5,
        "fat": 7,
        "waterMl": 0,
        "sugarG": 0,
        "fiberG": 0,
        "sodiumMg": 0
      }
    ],
    "reasoning": "Raciocinio novo para a refeicao final.",
    "confidence": 70
  },
  "changes": [
    {
      "action": "added",
      "item": "ovo frito",
      "note": "Incluido como uma unidade."
    }
  ]
}
```

Regras:

- Preservar itens nao afetados.
- Preservar `mediaId` de itens nao afetados.
- Se usuario pede mais de um item que ja existe, editar o item existente e
  ajustar quantidade/macros.
- Raciocinio deve ser refeito do zero, sem mencionar a edicao.

## Prompt de Workout Parse

Forma pedida ao modelo:

```json
{
  "exercise": "Supino reto",
  "kind": "series",
  "sets": [{ "weight": 100, "unit": "kg", "reps": 8 }]
}
```

O prompt pede `"series" | "cardio"` porque o modelo responde melhor em termos
do dominio; `normalizeWorkoutKind` traduz para o enum interno
`"strength" | "cardio"` na validacao. Nao "consertar" essa diferenca alinhando
os dois lados sem trocar as duas pontas.

Obrigatorio no prompt:

- Corrigir erro de digitacao no nome do exercicio, sem ecoar a grafia errada.
- Expandir abreviacoes pt-BR/en-US (`bp` -> bench press, `sup` -> supino,
  `LP` -> leg press).
- Texto so com nome de exercicio ainda devolve nome + `kind` + `sets` vazio.
- `kind: "cardio"` para corrida, bike, caminhada, natacao, remo, esteira,
  eliptico e HIIT; o resto e `"series"`.
- Cardio devolve `durationSeconds` e `distanceMeters` (`1h/5km` -> `3600` e
  `5000`).
- Campo ausente e omitido, nunca preenchido com `0`.
- Nunca calcular totais nem volume.

Na pratica o `CommandBus` so aproveita `exercise` e `kind` da resposta: as
series vem sempre do parser local. Ver `docs/data-flows.md` secao 10.
