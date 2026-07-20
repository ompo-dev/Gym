# Arquitetura

## Visao Geral

```mermaid
flowchart TD
  User["Usuario"] --> UI["Expo UI / React Native"]
  UI --> Hooks["Hooks de tela"]
  Hooks --> Store["Zustand: dia visivel e preferencias"]
  Hooks --> Bus["CommandBus"]
  Bus --> Repo["SQLite repositories"]
  Bus --> Enrich["/api/enrich"]
  Enrich --> AI["DeepSeek API"]
  UI --> OFF["Open Food Facts"]
  OFF --> Store
  Repo --> DB["gym.db"]
  Store --> UI
```

O app e local-first. A fonte persistente e `gym.db` no telefone. A store guarda
so o dia visivel de cada dominio para manter memoria baixa e UI responsiva.

## Camadas

| Camada | Pasta | Responsabilidade |
| --- | --- | --- |
| Rotas | `src/app` | Entradas do Expo Router e endpoint `/api/enrich`. |
| Templates | `src/components/templates` | Composicao de telas inteiras. |
| Organisms | `src/components/organisms` | Sheets, camera, lista, totais, detalhes. |
| Molecules/Atoms | `src/components/molecules`, `src/components/atoms` | UI reutilizavel menor. |
| Hooks | `src/hooks` | Ligacao entre UI, store e repositorios. |
| Core | `src/core` | Comandos, datas, IA client, utilitarios, onboarding e Open Food Facts. |
| Domains | `src/domains` | Schemas, prompts e logica pura de comida/treino. |
| Data | `src/data` | SQLite e repositories. |
| Store | `src/store` | Estado de app e preferencias. |
| i18n | `src/i18n` | Dicionario simples pt-BR/en-US. |

## Padrao de Dominio

`DomainConfig<TData, TTotals>` permite que dieta e treino usem o mesmo
`DayTemplate`.

Cada dominio define:

- `id`: `food` ou `workout`.
- `title` e `placeholder`.
- `accent`: cor principal.
- `schema`: schema Zod que valida a resposta.
- `formatResult`: resumo de uma entrada resolvida.
- `emptyTotals`, `addToTotals`, `describeTotals`: totalizadores do dia.

Com isso, `DayTemplate` renderiza lista, header, footer, totais, undo e
persistencia para ambos os dominios.

Cada dominio ainda tem seus fluxos exclusivos:

- comida: midia, barcode, detalhes nutricionais e metas;
- treino: outliner de series, painel de progresso/PR, exercicios salvos e o
  monitor de treino/cardio.

O dock de totais e o mesmo componente nos dois: em comida abre
`FoodGoalsSheet`, em treino abre `WorkoutProgressSheet`.

## Modulos de Dominio de Treino

| Arquivo | Responsabilidade |
| --- | --- |
| `workout.ts` | parser de series/cardio, totais, formatadores |
| `anatomy.ts` | vocabulario grupamento -> musculo -> porcao, meta semanal |
| `muscles.ts` | tabela de palavras-chave, ponte para o historico sem classificacao |
| `workoutProgress.ts` | PRs do dia, para o painel da tela de treino |
| `workoutMonitor.ts` | agregacao do monitor: volume, series, cardio, streak |
| `chartScale.ts` | escala de eixo e lacunas, compartilhada pelos graficos |
| `routines.ts` | o que vira dia salvo em cada dominio |

Todos puros e testados sem SQLite nem React — a UI so renderiza o que eles
devolvem.

## Persistencia

`src/data/db.ts` abre um unico banco `gym.db` com:

- `entries`: notas de comida e treino.
- `settings`: chave-valor para tema, idioma e onboarding.
- `saved_meals`: refeicoes salvas.
- `saved_exercises` (tabela `saved_workouts`): exercicios salvos avulsos.
- `saved_routines`: dias salvos dos **dois** dominios, com `domain`, `name`,
  `weekday` opcional e `items` JSON. Uma tabela so porque a diferenca entre
  treino e dieta esta no conteudo de `items`, nao na forma.

A antiga `kind = day` em `saved_workouts` e legado: nada escreve mais, o leitor
ainda aceita.

`EntryRepository` valida `data` ao ler. Se uma row antiga estava `done`, mas o
JSON nao valida mais, ela volta como `error` para poder ser refeita em vez de
quebrar a UI.

`EntryRepository.findAll(domain)` le o historico inteiro de um dominio, fora da
regra "so o dia visivel". Existe porque comparar PR e agregar evolucao precisa
de todos os dias. Hoje so treino usa, em dois lugares: `WorkoutProgressSheet` e
o monitor de treino em ajustes. Ambos leem sob demanda ao abrir o painel, nunca
no caminho de digitacao.

Efeito que le repository precisa ser chaveado por dia, nunca por `entries`:
`entries` muda a cada upsert (cada tecla que dispara edicao, cada resolucao da
IA), e leitura de tabela nessa frequencia e desperdicio puro.

## Estado

`useAppStore` guarda:

- `food` e `workout`: dia visivel e entradas desse dia.
- `theme`, `lang`, `prefsLoaded`.
- `onboardingDone`, `onboardingProfile`.

O store nao tenta guardar historico completo. Ao trocar de dia, `useDay`
consulta SQLite e troca apenas a lista visivel.

## Comandos

`CommandBus` centraliza efeitos de entrada:

- `addEntry`
- `deleteEntry`
- `editEntry`
- `retry`
- `undo`

Ele cria entradas em `thinking`, salva localmente, chama IA quando necessario,
aplica cache LRU, faz backoff em falha de rede e atualiza repository + store.

Comida com foto/barcode tem caminho especial em `DayTemplate`, porque precisa
juntar dados de Open Food Facts, imagens, descricoes e nota em um unico
resultado.

## IA

Cliente:

- `src/core/enrich/client.ts` chama `/api/enrich`.
- Timeout: 20 segundos.
- Base URL: `EXPO_PUBLIC_API_URL`, senao host do Metro, senao localhost.

Servidor:

- `src/app/api/enrich+api.ts` valida payload com Zod.
- Gera descricoes de imagens quando necessario.
- Monta prompt por dominio.
- Chama DeepSeek.
- Valida resposta no servidor e o cliente valida de novo antes de aplicar.

## UI Nativa iOS

`src/components/onboarding/onboardingNative.ts` carrega `@expo/ui/swift-ui`
apenas quando:

- plataforma e iOS;
- modulo `ExpoUI` existe;
- require dinamico funciona.

Se nao existir, o app cai para componentes React Native normais. Isso evita
quebrar Expo Go ou plataformas sem Expo UI.

Hoje o uso nativo aparece em:

- onboarding: botoes, sheets, pickers e toggles quando disponivel;
- menu de detalhes nutricionais: `SwiftMenu` para comportamento proximo de iOS;
- monitor de treino: `NativeSegmented` para as abas e os periodos, com pills RN
  como fallback.

## Temas e Cores

`src/constants/theme.ts` define tokens de light/dark:

- calories: laranja.
- protein: verde.
- carbs: roxo.
- fat: amarelo.
- water: azul claro.

Os totais e inputs usam estes tokens; numeros principais ficam em texto do tema.

## Limites Atuais

- Login, pagamento e integracoes sao placeholders em ajustes.
- Refeicoes salvas sao persistidas, mas gerenciamento completo ainda e visual.
- Barcode depende de Open Food Facts e pode retornar valores por porcao ou por 100g/ml conforme disponibilidade.
- Exercicio salvo guarda so o nome, nao series. Reaplicar cria linhas vazias.
- Dia salvo (`saved_routines`) so tem ida: grava e lista em Ajustes, mas nenhum
  picker aplica um treino ou dieta salvo a um dia.
- PR, monitor e evolucao de treino sao calculados na hora, lendo o historico
  completo a cada abertura do painel. Sem cache e sem tabela agregada.
- A classificacao muscular vem da IA por entrada. Historico anterior cai na
  tabela de palavras-chave de `muscles.ts`, que so acerta o grupamento — musculo
  e porcao ficam vazios e a fatia sem classificacao aparece no monitor.
- As chaves de API do usuario ficam em texto puro na tabela `settings`.
- `SettingsSheet.tsx` passa de 4500 linhas e hospeda todos os sub-sheets de
  ajustes, inclusive o monitor de treino inteiro. E o maior arquivo do projeto
  e o proximo candidato obvio a quebrar por sheet.
- `canOpenAppModal` e conselho, nao regra: e funcao pura que o chamador precisa
  lembrar de invocar; a store nao verifica. Mover a checagem para dentro da
  store nao e de graca — `day.root` e `onboarding.root` sao `AppModalId` mas
  nao fazem parte da uniao `AppModal`, sao raizes virtuais nunca empilhadas.
  Inferir a origem pelo topo da pilha daria `day.root` tambem no onboarding,
  quebrando os pickers dele.
- O dock de treino mostra tempo e distancia mesmo zerados em dia so de
  musculacao.
