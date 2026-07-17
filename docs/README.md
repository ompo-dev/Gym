# GymNotes Docs

Esta pasta documenta o estado atual do app GymNotes de ponta a ponta. O app e
local-first: quase tudo vive no telefone do usuario; rede hoje entra
principalmente para enriquecimento por IA e consulta de codigo de barras.

## Indice

- [Arquitetura](./architecture.md): camadas, responsabilidades e padroes do codigo.
- [Telas e interacoes](./screens-and-interactions.md): o que existe em cada tela, sheet e menu.
- [Fluxos de dados](./data-flows.md): caminhos completos de onboarding, notas, IA, fotos, barcode e edicao.
- [Contratos de dados](./data-contracts.md): formatos JSON, tabelas SQLite, payloads da IA e schemas principais.
- [Padroes do projeto](./patterns.md): convencoes para evoluir a aplicacao sem baguncar o fluxo.

## Principios do Produto

- O usuario anota comida ou treino com o minimo de friccao.
- O app salva localmente primeiro, mostra estado de processamento e atualiza
  quando a IA responde.
- O onboarding cria um perfil nutricional local usado para metas e contexto dos
  prompts.
- Dieta e treino compartilham a mesma estrutura de dia, lista, totais e comandos.
- Fotos, cardapios e codigos de barras complementam a nota digitada; nenhuma
  fonte deve apagar outra.

## Stack Atual

- Expo SDK no `package.json`: `expo@^54.0.35`.
- Navegacao: `expo-router` com `NativeTabs`.
- UI nativa iOS quando disponivel: `@expo/ui/swift-ui` carregado de forma lazy.
- Persistencia local: `expo-sqlite`.
- Estado visivel: `zustand`.
- Validacao de contratos: `zod`.
- Camera, barcode e galeria: `expo-camera` e `expo-image-picker`.
- Imagens: `expo-image`.
- Icones React Native: `lucide-react-native`.

## Rotas

| Rota | Arquivo | Descricao |
| --- | --- | --- |
| `/` | `src/app/index.tsx` | Dia de dieta, usando `DayTemplate` com `foodConfig`. |
| `/workout` | `src/app/workout.tsx` | Dia de treino, usando `DayTemplate` com `workoutConfig`. |
| `/api/enrich` | `src/app/api/enrich+api.ts` | Proxy server-side para IA. |

`src/app/_layout.tsx` decide se mostra onboarding ou tabs principais:

1. carrega preferencias locais com `hydratePrefs`;
2. se ainda nao carregou, mostra fundo vazio;
3. se onboarding terminou, mostra `AppTabs`;
4. senao mostra `OnboardingFlow`.

## Onde Comecar ao Mexer

- Fluxo de dia e anotacoes: `src/components/templates/DayTemplate.tsx`.
- Persistencia de notas: `src/data/EntryRepository.ts`.
- Enriquecimento por IA: `src/core/command/CommandBus.ts` e `src/app/api/enrich+api.ts`.
- Contratos de comida/treino: `src/domains/schemas.ts`.
- Metas e calculos nutricionais: `src/core/onboarding.ts` e `src/domains/food.ts`.
- UI de detalhes de comida: `src/components/organisms/FoodEntryDetailSheet.tsx`.
