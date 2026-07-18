# Telas e Interacoes

## Root

Arquivo: `src/app/_layout.tsx`

Estados:

- `prefsLoaded=false`: mostra tela vazia escura enquanto carrega settings.
- `onboardingDone=false`: mostra `OnboardingFlow`.
- `onboardingDone=true`: mostra tabs nativas com Dieta e Treino.

## Tabs

Arquivo: `src/components/app-tabs.tsx`

Usa `expo-router/unstable-native-tabs`.

- Tab Dieta: rota `index`, SF Symbol `fork.knife`.
- Tab Treino: rota `workout`, SF Symbol `dumbbell`.

## Onboarding

Arquivo principal: `src/components/onboarding/OnboardingFlow.tsx`

Total de passos: 11.

| Passo | Componente | Dados coletados/usados |
| --- | --- | --- |
| 0 | `WelcomeStep` | entrada ou skip. |
| 1 | `SelectionStep` genero | `gender`. |
| 2 | `SingleValueStep` aniversario | `birthDate`. |
| 3 | `MeasurementsStep` | `heightCm`, `weightKg`, `goalWeightKg`, `goalDate`. |
| 4 | `SelectionStep` atividade | `activity`. |
| 5 | `ConsiderationsStep` | `considerations`, `notes`. |
| 6 | `UncertaintyStep` | `estimationBias`. |
| 7 | `GoalsStep` | mostra metas calculadas, `trackMicronutrients`. |
| 8 | `AccuracyStep` | educacao visual de precisao. |
| 9 | `DetailsStep` | educacao sobre detalhes na nota. |
| 10 | `CaptureStep` | educacao sobre foto/menu. |

Interacoes:

- Back volta um passo.
- Continue avanca.
- Ultimo passo chama `completeOnboarding(profile)`.
- Skip salva o perfil atual e entra no app.
- Altura e peso usam `PickerSheet`.
- Aniversario e data-alvo usam `DatePickerSheet`.

Calculos:

- `buildOnboardingSummary` calcula BMR por Harris-Benedict.
- TDEE usa multiplicador de atividade.
- Calorias sao ajustadas por meta de peso, dias ate meta e vies.
- Proteina, carbo, gordura e hidratacao viram metas diarias.
- Ao ativar micronutrientes no onboarding, acucar/fibras/sodio ficam ativos no
  perfil salvo.

## Tela de Dieta

Rota: `/`

Composicao:

- `DayHeader`: data, anterior/proximo/hoje, ajustes.
- `NotesList`: entradas do dia e input de nova nota.
- `TotalsDock`: barra de calorias/macros/hidratacao.
- `FoodGoalsSheet`: metas quando a barra e tocada com teclado fechado.
- Sheets de comida: detalhes, midia, barcode, edicao.

Interacoes principais:

- Digitar comida e enviar no teclado.
- Tocar em uma entrada resolvida abre detalhes nutricionais.
- Editar texto de uma entrada existente reprocessa a entrada.
- Apagar entrada mostra `UndoToast` por 4 segundos.
- Erro mostra `tentar de novo`.
- Com teclado aberto, footer mostra calorias compactas, midia, refeicao salva e fechar teclado.
- Botao de midia abre menu de camera/galeria/barcode.
- Botao de refeicao salva abre o seletor de refeicoes salvas.

## Menu de Midia

Arquivo: `FoodMediaActionMenu.tsx`

Opcoes:

- `Adicionar foto`: captura ou seleciona foto de alimento.
- `Tirar foto do menu`: captura ou seleciona foto de cardapio.
- `Codigo de barras`: abre camera em modo scanner.

## Camera e Galeria

Arquivo: `FoodMediaCaptureSheet.tsx`

Modos:

- `foodPhoto`
- `menuPhoto`
- `barcode`

Interacoes:

- X fecha.
- Shutter tira foto com base64.
- Botao galeria abre biblioteca do telefone com selecao multipla.
- Mini galeria ao lado esquerdo do shutter mostra fotos capturadas na sessao.
- Barcode usa `onBarcodeScanned` e fecha a camera antes de abrir o editor do produto.

Permissoes:

- Camera: `expo-camera`.
- Galeria: `expo-image-picker`.

## Galeria de Rascunhos na Nota

Arquivo: `FoodMediaDraftTray.tsx`

Mostra miniaturas anexadas antes do input.

Interacoes:

- Tocar abre sheet com cada imagem/barcode.
- Usuario pode editar descricao por anexo.
- Usuario pode remover anexo quando o tray esta em modo editavel.

As descricoes sao enviadas como contexto para a IA. Quando a IA descreve uma
imagem sem descricao manual, a descricao volta para `entry.media`.

## Detalhes Nutricionais

Arquivo: `FoodEntryDetailSheet.tsx`

Conteudo:

- Header com titulo e menu.
- Nome/descricao da refeicao.
- Card de totais: calorias, hidratacao, proteina, carboidratos e gordura.
- Lista de itens.
- Raciocinio da IA e confianca.

Itens:

- Cada item mostra nome, opcionalmente miniatura ligada por `mediaId`, quantidade quando faz sentido, calorias e expand/collapse.
- Expandido mostra proteina, carboidratos e gordura.
- Se micronutrientes estiverem ativos no perfil, o item expandido tambem mostra
  acucar, fibras e/ou sodio.

Menu:

- Salvar como refeicao.
- Editar nutricao.
  - Editar com IA.
  - Editar manualmente.
- Excluir refeicao.

Quando iOS nativo esta disponivel, o menu usa `SwiftMenu`. Caso contrario, usa
`FoodEntryActionMenu`.

## Editar Manualmente

Arquivo: `FoodNutritionEditSheet.tsx`

Pode abrir como sheet independente ou dentro dos detalhes.

Conteudo:

- X a esquerda.
- Check a direita.
- Campo grande de descricao da comida.
- Toggle `Calcular total automaticamente`.
- Toggle `Autoajustar calorias dos itens`.
- Bloco `Nutricao total`.
- Cards de itens.
- Botao `Adicionar item`.

Regras:

- Com total automatico ligado, totais ficam opacos/desabilitados e sao somados dos itens.
- Com total automatico desligado, o usuario edita os totais e o app salva um item agregado.
- Autoajuste recalcula calorias quando proteina/carbo/gordura mudam.
- Inputs de macros exibem inicial, separador e input na mesma linha.
- Hidratacao mostra `ml`; ao sair do foco, valores >= 1000 aparecem em `L`.
- Inputs de acucar, fibras e sodio aparecem nos totais e nos itens quando esses
  micronutrientes estao ativos no perfil.
- Cada item pode ser removido mesmo se for o unico item.
- Botoes `-` e `+` ajustam quantidade e escalam macros.
- Itens com imagem mostram a miniatura ao lado do nome.

Ao salvar, `reasoning` e `confidence` sao limpos. Se realmente houve mudanca,
`DayTemplate` pede para a IA refazer raciocinio e descricao.

## Editar com IA

Arquivo: `FoodAiEditSheet.tsx`

Comportamento:

- Abre input focado acima do teclado.
- Nao tem botao de enviar proprio; usa send do teclado iOS.
- Tem botao para abaixar/fechar teclado.
- Enquanto envia, mostra `Enviando e recalculando...`.
- O teclado deve continuar aberto apos retorno.

Payload enviado:

- Instrucao do usuario.
- JSON atual da refeicao.
- Contexto nutricional do onboarding.

Retorno esperado:

- `description` final.
- `meal` final.
- `changes`.

O app aplica `mergeFoodEdit` para evitar duplicatas e preservar itens nao
afetados.

## Metas de Comida

Arquivo: `FoodGoalsSheet.tsx`

Abre ao tocar no `TotalsDock` da dieta com teclado fechado.

Mostra:

- Barra de progresso de calorias.
- Rings de proteina, carboidratos, gordura e hidratacao.
- Linhas de acucar/fibras/sodio quando esses micronutrientes estao ativos.

Metas vem de `useFoodGoals`, que usa o perfil do onboarding ou perfil padrao.

## Ajustes

Arquivo: `SettingsSheet.tsx`

Conteudo:

- Conta visual placeholder.
- Resumo de metas.
- Perfil de saude.
- Controle de peso.
- Refeicoes salvas.
- Preferencias.
- Aparencia e dispositivo.
- Assinatura placeholder.
- Connect GymNotes placeholder.
- Feedback, legal e sair.

Interacoes funcionais hoje:

- Aparencia alterna `system -> light -> dark`.
- Gerenciar metas nutricionais salva tipo de meta, peso-alvo, data-alvo,
  preferencias, metas e micronutrientes no perfil local.
- Gerenciar informacoes de saude salva genero, data de nascimento, altura, peso
  e nivel de atividade; isso recalcula BMR/TDEE/metas via Harris-Benedict.
- Controle de peso e registrar peso atualizam o peso do perfil local.
- Refeicoes salvas abre lista de refeicoes persistidas em SQLite.
- Sair limpa onboarding e volta para `OnboardingFlow`.
- Contagem de refeicoes salvas e lida de SQLite.

Interacoes visuais ainda sem backend real:

- Assinatura e API keys.

## Tela de Treino

Rota: `/workout`

Usa o mesmo `DayTemplate`, mas com `workoutConfig`.

Entrada:

- Input cria exercicio/series.
- `WorkoutOutliner` permite editar exercicio e linhas de serie.
- Linhas como `100x8`, `95 kg x 7` ou semelhantes viram sets.

Totais:

- Numero de series.
- Volume em kg.

IA:

- O parser local entende series.
- A IA e usada apenas para melhorar nome de exercicio quando ha nome.
- Em falha de IA, o parser local ainda resolve a entrada.
