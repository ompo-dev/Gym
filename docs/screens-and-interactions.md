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
- Refeicoes salvas (so quando aberto pela dieta).
- Treinos: monitoramento e treinos salvos (so quando aberto pelo treino).
- Preferencias.
- Aparencia e dispositivo.
- Assinatura placeholder.
- Connect GymNotes placeholder.
- Feedback, legal e sair.

Essa secao e a unica que muda por dominio: dieta mostra refeicoes salvas,
treino mostra a secao de treinos. O resto e igual nos dois.

### Monitoramento de Treino

Resumo do historico inteiro:

- dias treinados, series e volume;
- tempo e distancia, quando maiores que zero;
- `Salvar treino de hoje`, que vira template do dia visivel;
- lista por exercicio com sessoes, series, volume, tempo, distancia e data do
  ultimo registro, ordenada pelo mais recente.

### Treinos Salvos (ajustes)

Lista dos templates persistidos, com icone de haltere para forca e de rota para
cardio, e os exercicios do template embaixo do nome. A lixeira apaga o
template.

Interacoes funcionais hoje:

- Aparencia abre um menu com `system`, `light` e `dark`; a opcao escolhida e
  aplicada na hora e a linha mostra o modo atual.
- Gerenciar metas nutricionais salva tipo de meta, peso-alvo, data-alvo,
  preferencias, metas e micronutrientes no perfil local.
- Monitoramento de treino agrega o historico completo por exercicio.
- Salvar treino de hoje e apagar treino salvo escrevem em `saved_workouts`.
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
- Linhas como `100x8` ou `95 kg x 7` viram series de carga.
- Linhas como `5km`, `30 min`, `1h30` ou `1h/5km` viram cardio.

Como a linha aparece:

- serie de carga: peso e unidade em azul, `x`, repeticoes em verde, e o volume
  da serie a direita;
- so repeticoes: `12 reps`;
- cardio: tempo em laranja e distancia em verde, separados por `/`, e o pace a
  direita quando da para calcular.

Totais no dock: series, volume, tempo e distancia. Tocar no dock com o teclado
fechado abre o painel de progresso.

Acoes na entrada resolvida:

- bookmark alterna salvar/dessalvar o exercicio como template (so em entrada
  `done`). Preenchido significa salvo, e o estado vem do banco, nao da sessao.
  Desmarcar apaga o template na hora, sem confirmacao e sem undo;
- `+` adiciona linha.

Com o teclado aberto, o footer mostra series/volume/distancia e um `+` que abre
o seletor de treinos salvos.

IA:

- O parser local entende series e cardio.
- A IA recebe so a linha do exercicio e devolve nome corrigido e `kind`.
- As series nunca vem da IA.
- Em falha de IA, o parser local ainda resolve a entrada.

## Progresso do Treino

Arquivo: `WorkoutProgressSheet.tsx`

Abre ao tocar no `TotalsDock` do treino com o teclado fechado.

Mostra:

- resumo do dia: series, volume, tempo e distancia;
- badge com a contagem de PRs do dia, ou `Hoje` quando nao ha nenhum;
- ate 6 recordes batidos hoje, cada um com exercicio, tipo de PR, marca
  anterior e marca nova.

Tipos de PR: carga (volume), distancia, tempo e pace. Exercicio sem historico
aparece como `Primeiro registro`. Sem nenhum PR, mostra `Sem PRs ainda hoje`.

## Seletor de Treino Salvo

Aberto pelo `+` do footer da tela de treino com o teclado aberto.

- Lista os templates salvos, exercicio e dia juntos.
- Selecao multipla; o check no header confirma.
- Confirmar cria uma entrada por exercicio de cada template escolhido, so com o
  nome. Series ficam em branco.
