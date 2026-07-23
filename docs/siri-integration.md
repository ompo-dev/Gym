# Integração com a Siri (e Atalhos)

> **TL;DR** — Tudo no Gym é texto de baixo atrito. A Siri não precisa de IA
> própria: ela só entrega uma frase ditada para o **mesmo** motor de enrich que
> processa uma nota digitada. Um deep link `gym://add?text=...` faz isso, **sem
> código nativo**, funcionando em builds instalados (dev client / TestFlight /
> App Store). O "preview pra confirmar" é a própria nota aparecendo no dia e
> resolvendo em calorias / séries.

Código:
- Parser puro: [`src/core/siri/commandLink.ts`](../src/core/siri/commandLink.ts)
- Runtime (deep link → enrich → dia): [`src/core/siri/useCommandLink.ts`](../src/core/siri/useCommandLink.ts)
- Ligado na raiz: [`src/app/_layout.tsx`](../src/app/_layout.tsx)
- Teste: [`src/core/siri/commandLink.test.ts`](../src/core/siri/commandLink.test.ts)

---

## 1. Por que funciona sem IA nova

O app inteiro é uma pipeline de texto:

```
frase ("comprei 2 bananas" | "supino 80kg 3x10" | "receita de frango")
  → bus.addEntry(text, domain)        // src/core/command/CommandBus.ts
  → enrich (foodAuto | workoutAuto)   // decide refeição/compra/receita ou exercício/plano
  → nota resolvida no dia (calorias / séries / preço)
```

A Siri só precisa injetar `text` nessa pipeline. É por isso que **uma única
porta de entrada (`add`) cobre quase tudo**: o enrich é quem classifica.

---

## 2. Mapa completo de funcionalidades

### 2.1 Dieta (`domain: food`)

| Capacidade | Como se ativa por texto | Onde vive |
|---|---|---|
| Registrar refeição | "arroz, feijão e frango" | `foodAuto` → `foodSchema` |
| Registrar compra | "comprei 2 bananas por 5 reais" | `foodAuto` → `purchase` → despensa |
| Gerar receita | "receita de frango com o que tenho" | `foodAuto` → `recipe` (usa despensa) |
| Nota multi-ação | "comprei 3 e comi 4" → vira 2 notas | `foodMultiSchema` (split) |
| Foto de comida / cardápio | anexo de imagem | `FoodMediaCaptureSheet` |
| Código de barras | scan → Open Food Facts | `openFoodFacts.ts` |
| Editar nutrição (manual) | sheet de edição | `FoodNutritionEditSheet` |
| Editar com IA | "troca o feijão por feijão preto" | `foodEdit` → `mergeFoodEdit` |
| Salvar refeição p/ repetir | bookmark no detalhe | `SavedMealRepository` |
| Despensa (geladeira) | derivada das compras, com preço/kg | `domains/pantry.ts` |
| Metas (kcal / macros / micros) | dock de totais + sheet | `FoodGoalsSheet` |
| Confiança + raciocínio da IA | mostrado no detalhe | `FoodEntryDetailSheet` |

Detalhes nutricionais por item: proteína, carbo, gordura, água, açúcar, fibra,
sódio, quantidade e unidade.

### 2.2 Treino (`domain: workout`)

| Capacidade | Como se ativa por texto | Onde vive |
|---|---|---|
| Registrar exercício + séries | "supino reto 80kg 3x10" | `workoutAuto` → `parseWorkoutText` |
| Registrar cardio | "corrida 5km 30min" (km + tempo) | `parseWorkoutSetLine` (distância/duração) |
| Criar treino / plano | "monte um treino de peito" | `workoutPlanSchema` → `planToNotes` |
| Renomear exercício | edita o título da nota (re-enrich) | `WorkoutOutliner` |
| Adicionar / remover série | botões `+` / backspace na linha | `WorkoutOutliner` |
| Salvar exercício | bookmark na nota | `SavedExerciseRepository` |
| Músculos / anatomia | vem só da IA | `domains/muscles.ts`, `anatomy.ts` |
| Carga de treino (training load) | derivada das séries | `domains/trainingLoad.ts` |
| Progresso por exercício | histórico de sessões | `domains/workoutProgress.ts` |

Métricas de série: peso (kg/lb) × reps, duração (tempo), distância (m/km),
volume e pace derivados.

### 2.3 Dia, Rotinas, Onboarding, Ajustes

| Área | Capacidade |
|---|---|
| Dia | navegar (anterior / próximo / hoje), dock de totais, salvar o dia como rotina |
| Rotinas | salvar dieta/treino do dia, marcar dia da semana, recarregar depois |
| Onboarding | perfil capturado por texto (parser + IA), sem formulário rígido |
| Ajustes | perfil de saúde, chave de IA (BYO key), metas, listas salvas, controle de peso, assinatura |

### 2.4 Superfície de ferramentas para IA (`src/core/tools/registry.ts`)

Já existe um registro de ferramentas validado por schema — a base natural para
uma Siri nativa futura (§8):

| Tool | O que faz |
|---|---|
| `addEntries` | escreve 1+ notas (mesmo motor de enrich); todas desfazem juntas |
| `readDay` | lê notas + totais de um dia |
| `readExerciseHistory` | sessões passadas de um exercício (p/ prescrever carga) |
| `readSavedMeals` | refeições salvas com nutrição |
| `readPantry` | o que foi comprado, último preço, preço/kg |

### 2.5 Intents de enrich

`foodAuto` · `foodEdit` · `workoutAuto` · `onboarding` — ver `CommandBus.ts`.

---

## 3. Arquitetura da integração

```
"Ei Siri, adicionar no Gym"
      │  (Atalho ditado abre a URL)
      ▼
gym://add?text=<ditado>&domain=food
      │  Linking.useURL()  →  useCommandLink()
      ▼
parseCommandLink()      // valida com Zod, ignora link inválido
      ▼
runCommandLink()        // setDate(hoje) → navega pra aba → bus.addEntry()
      ▼
nota aparece no dia e resolve  →  ESTE é o preview de confirmação
```

Tudo o que `runCommandLink` faz é focar o dia certo e chamar `bus.addEntry` —
idêntico a digitar. Nenhuma lógica de IA duplicada.

---

## 4. Contrato do deep link

```
gym://add?text=<obrigatório>&domain=<food|workout>&date=<YYYY-MM-DD>
gym://log?...   (alias idêntico)
```

| Param | Regras | Default |
|---|---|---|
| `text` | 1–500 chars, URL-encoded | — (obrigatório) |
| `domain` | `food` ou `workout` | `food` |
| `date` | `YYYY-MM-DD` | hoje |

Regras de rejeição (link é ignorado, não quebra o app): host fora de
`add`/`log`, `text` vazio, `domain` inválido, `date` malformado, esquema ≠ `gym`.

Exemplos:

```
gym://add?text=In-N-Out%20Burger%20with%20fries
gym://add?domain=workout&text=supino%2080kg%203x10
gym://add?domain=food&text=comprei%202%20bananas
gym://log?text=agua%20500ml&date=2026-07-23
```

---

## 5. Configurar o Atalho (Shortcuts app) — passo a passo

> Funciona no app **instalado** (dev client, TestFlight ou App Store), porque aí
> o esquema `gym://` pertence ao Gym. Dentro do **Expo Go** o esquema pertence
> ao próprio Expo Go — pra testar em dev use o §7.

**Atalho "Adicionar comida no Gym":**

1. Abra o app **Atalhos** → `+` → novo atalho.
2. Ação **"Pedir entrada"** (Ask for Input) → tipo *Texto* → prompt "O que você comeu/comprou?".
3. Ação **"Abrir URL"** (Open URL):
   `gym://add?domain=food&text=[Entrada Fornecida]`
   *(insira a variável "Entrada Fornecida"; o iOS codifica o texto)*.
4. Renomeie o atalho para **"Adicionar comida no Gym"** — esse vira o comando de voz.
5. Falar: **"Ei Siri, adicionar comida no Gym"** → a Siri pergunta, você dita,
   o Gym abre e registra.

**Atalho "Adicionar treino no Gym":** igual, mas `domain=workout`.

**Variante único-atalho (menu):** um atalho "Gym" com **"Escolher no Menu"**
(Comida / Treino) que muda só o `domain`. Menos comandos, um toque a mais.

> Dá pra exportar esses atalhos como link do iCloud e distribuir junto do app,
> pra o usuário não montar na mão.

---

## 6. O preview de confirmação

O usuário pediu "retornar uma prévia pra confirmar se foi registrado". Na
abordagem por deep link isso é **a própria nota**: ao abrir, o Gym cai no dia
certo, a nota surge em `thinking` e resolve para "In-N-Out Burger — 720 cal
· P22 C87 F31" (ou séries, no treino). Ver = registrado.

Um snippet inline dentro da própria Siri (como no mockup, sem abrir o app) é o
upgrade do §8.

---

## 7. Testar em desenvolvimento

Esquema nativo (dev client / build standalone):

```bash
# iOS simulator
xcrun simctl openurl booted "gym://add?text=In-N-Out%20Burger%20with%20fries&domain=food"

# Android emulator
adb shell am start -a android.intent.action.VIEW -d "gym://add?domain=workout&text=supino%2080kg%203x10"
```

Forma agnóstica (resolve Expo Go vs standalone automaticamente):

```bash
npx uri-scheme open "gym://add?text=frango" --ios
npx uri-scheme open "gym://add?text=frango" --android
```

---

## 8. Upgrade: Siri nativa com App Intents (snippet inline)

Para o resultado do mockup — a Siri mostrando o card "Logged — 720 cal" **sem
abrir o app** — é preciso **App Intents nativos (Swift)**. Isso implica:

- **Config plugin** + código Swift (`AppIntent` + `AppShortcutsProvider` + uma
  `View` de snippet) — nada disso existe no fluxo managed hoje.
- **Dev build via EAS** (`npx expo prebuild` / dev client). **Sai do Expo Go** —
  conflita com o pin de SDK 54 pra Expo Go. Decisão de produto, não técnica.
- O App Intent chamaria a mesma lógica: reusaria o `toolRegistry`/`bus` via uma
  ponte (por ex. um endpoint local ou um módulo nativo que dispara o enrich).

Esboço:

```swift
struct LogToGym: AppIntent {
  static var title: LocalizedStringResource = "Registrar no Gym"
  @Parameter(title: "O que") var text: String
  func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
    let preview = try await GymBridge.log(text: text)   // → enrich
    return .result(dialog: "Registrei \(preview.title)", view: LogSnippet(preview))
  }
}
```

**Recomendação:** manter o deep link (§3–5) como caminho padrão de baixo
atrito, e só adicionar App Intents quando houver um build nativo dedicado
(fora do Expo Go).

---

## 9. Limitações e roadmap

- **Editar por voz** ("muda o feijão pra feijão preto" numa nota específica)
  ainda não: exige mirar uma entry existente + o tool de edição. O deep link
  hoje sempre **cria** nota nova. (Ligado ao bug de `mergeFoodEdit` — ver
  memória `product-direction`.)
- **Snippet inline na Siri** → §8 (App Intents / dev build).
- **Deduplicação**: a mesma URL não re-dispara na mesma sessão (`useCommandLink`).
  Repetir a frase idêntica seguidas vezes precisa de `addEventListener` — trocar
  se virar necessidade real.
- **Widgets** (pedido do usuário) são superfície irmã: um widget "adicionar
  rápido" abriria o mesmo `gym://add`.
