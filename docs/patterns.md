# Padroes do Projeto

## Local-first

Regra padrao: salve localmente primeiro e sincronize/enriqueca depois.

- Entradas novas entram como `thinking`.
- SQLite e a persistencia principal.
- Store guarda so a tela atual.
- IA e integracoes externas nunca devem ser pre-condicao para manter a nota do
  usuario.

## Validacao nas Bordas

Dados externos passam por Zod:

- resposta da IA;
- rows vindas de SQLite;
- payload de `/api/enrich`;
- JSON antigo salvo no banco.

Se dado antigo nao valida, degrade com seguranca para `error` ou fallback em vez
de quebrar renderizacao.

## DomainConfig Antes de Condicional Solta

Quando algo serve para dieta e treino, adicionar no `DomainConfig` ou em
componente compartilhado.

Use condicional por dominio so quando o fluxo e realmente especifico, como:

- foto/cardapio/barcode;
- detalhes nutricionais;
- metas alimentares;
- outliner de treino.

## CommandBus Para Mutacoes de Entry

Use `CommandBus` para:

- add;
- delete;
- edit de texto;
- retry;
- undo.

Fluxos especiais que combinam varias fontes, como foto + barcode + nota, podem
orquestrar no `DayTemplate`, mas ainda devem persistir via `EntryRepository` e
atualizar a store de forma imutavel.

## Repositories

Repository fala com SQLite; UI e componente nao devem montar SQL direto.

Padrao atual:

- `EntryRepository`
- `SettingsRepository`
- `SavedMealRepository`

## Imutabilidade

Ao atualizar arrays/objetos:

- criar novo array;
- criar novo objeto;
- nunca mutar entrada existente.

Isso e especialmente importante em Zustand, porque re-render depende de novas
referencias.

## Midia de Comida

Um anexo tem identidade propria.

- `FoodMediaDraft.id` vira `EntryMediaAttachment.id`.
- `FoodItem.mediaId` aponta para esse id.
- Foto/menu normal pode ser analisada pela IA.
- Barcode nao vai para IA visual; barcode ja traz `FoodData`.

Nao juntar foto com item textual por chute quando a foto deve ser item proprio.
Se a IA nao ligar `mediaId`, usar fallback para preservar a imagem.

## Quantidade e Duplicatas

Use `mergeDuplicateFoodItems` antes de salvar listas combinadas.

Objetivo:

- dois codigos de barras iguais viram quantidade 2;
- "mais um copo de refri" edita o item existente;
- itens nao contaveis nao ganham numero visual.

Mostrar quantidade na UI so com `formatFoodQuantity`, que filtra unidades
contaveis.

## Hidratacao

Hidratacao sempre vive em `waterMl`.

Fontes:

- IA para agua e bebidas digitadas/fotografadas.
- Open Food Facts para bebidas com volume conhecido.
- Edicao manual em input `H`.

Formato visual:

- abaixo de 1000: `ml`;
- 1000 ou mais: `L` ao sair do foco.

## Raciocinio da IA

`reasoning` pertence ao estado final da refeicao, nao ao historico de edicoes.

Quando editar manualmente:

- limpar `reasoning` e `confidence`;
- salvar data atualizada;
- pedir para IA refazer descricao/raciocinio quando houve mudanca real.

Quando editar com IA:

- enviar `currentFood` completo;
- aplicar retorno com `mergeFoodEdit`;
- raciocinio deve vir reescrito do zero.

## UI de Sheets

Use `SheetFrame` como base.

Modos:

- `size="sheet"`: sheet inferior glass.
- `size="full"`: page sheet iOS-like.

Teclado:

- Para edicao manual, usar `keyboardAwareScroll`.
- Para overlays acima do teclado, informar `onOcclusionChange` e adicionar inset
  temporario so enquanto teclado/input existem.
- Nao deixar scroll extra quando teclado esta fechado.

Header:

- Editor manual: X a esquerda, titulo central, check a direita.
- Detalhes: titulo a esquerda, menu e X a direita.

## UI Nativa iOS

Antes de criar simulacao manual de comportamento iOS, verificar se Expo UI ja
cobre.

Padrao:

1. tentar `@expo/ui/swift-ui` lazy via `onboardingNative.ts`;
2. usar componente nativo quando disponivel;
3. fallback React Native quando nao disponivel.

Nao importar `@expo/ui/swift-ui` diretamente em qualquer arquivo sem lazy guard.

## i18n

Strings de UI devem vir de `t(key)` ou `copy[lang]` no onboarding.

Evitar texto hardcoded em componente, exceto valores tecnicos ou placeholders
explicitamente temporarios.

## Cores de Nutrientes

Usar tokens de `Colors`:

- calorias: `colors.calories`;
- proteina: `colors.protein`;
- carboidratos: `colors.carbs`;
- gordura: `colors.fat`;
- hidratacao: `colors.water`.

Na barra compacta, calorias usa icone de fogo; macros/hidratacao usam letras.

## Como Adicionar Novo Campo Nutricional

Ordem minima:

1. atualizar `foodItemSchema`;
2. atualizar `FoodTotals` e `FoodGoals`;
3. atualizar `sumFoodData`, `defaultFoodGoals`, `foodGoalsFromProfile`;
4. atualizar prompts;
5. atualizar `FoodEntryDetailSheet`, `FoodNutritionEditSheet`, `FoodGoalsSheet`
   e `TotalsDock`;
6. atualizar docs e testes de schema/domain.

## Como Adicionar Nova Fonte de Alimento

Exemplo futuro: importacao de restaurante.

Fluxo esperado:

1. fonte externa retorna `FoodData` ou dados suficientes para mapear para
   `FoodData`;
2. criar `FoodMediaDraft` ou outro rascunho com `data`;
3. no envio, juntar com nota/fotos;
4. passar por `mergeDuplicateFoodItems`;
5. salvar uma unica `Entry`.

## Testes

Testes unitarios atuais ficam junto do dominio/componente:

- `src/domains/food.test.ts`
- `src/domains/schemas.test.ts`
- `src/core/command/CommandBus.test.ts`
- `src/core/food/openFoodFacts.test.ts`
- `src/components/molecules/WorkoutOutliner.test.ts`

Priorizar testes em logica pura:

- merge de duplicatas;
- calculos de metas;
- mapping de Open Food Facts;
- parsing de treino;
- command bus e retry.
