# Plano: Background Tasks + Notificacoes

Status: **implementado** (todas as 4 fases). tsc limpo, 401 testes, lint sem erro.
**Exige rebuild** do dev build (EAS): `expo-notifications` + `expo-background-task`
sao modulos nativos e adicionam config plugins. Background task **nao roda em
simulador iOS** — testar em device com `BackgroundTask.triggerTaskWorkerForTestingAsync()`.

Mapa fase → codigo:

| Fase | Arquivo(s) |
| --- | --- |
| 0 sweep no boot | `EntryRepository.findPending`, `CommandBus.resumePending`, chamada em `app/_layout.tsx` |
| 1 background drain | `core/background/enrichDrain.ts` (defineTask + registerEnrichDrain) |
| 2 lembretes locais | `core/notifications/reminders.ts` + `reminderPrefs.ts`, secao em `SettingsSheet.tsx`, plugin em `app.json` |
| 3 nudge de lapso | `reminders.maybeNudgeLapsed` + `EntryRepository.lastLoggedDate`, chamado pela task |

Testes: `resumePending` no `CommandBus.test.ts`; helpers puros em `reminderPrefs.test.ts`.
Fluxo documentado em `data-flows.md` §14-15.

---

Refs Expo SDK 57: [expo-background-task](https://docs.expo.dev/versions/v57.0.0/sdk/background-task/),
[expo-task-manager](https://docs.expo.dev/versions/v57.0.0/sdk/task-manager/),
[expo-notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).
Exemplos: background [daily-quotes-app](https://github.com/betomoedano/daily-quotes-app),
notificacoes [quick-push](https://github.com/betomoedano/quick-push).

---

## Por que (o buraco real)

O retry de enrich e **em memoria**: `CommandBus` guarda `attempts` num `Map` e
reagenda com `setTimeout`/`schedule` (`retryLater`). Isso morre quando o app e
morto ou fica muito tempo em background. Nada, no boot, re-enfileira notas presas
em `thinking`/`queued`/`error:offline` — `enqueueEnrich` so e chamado em
add/edit/retry(toque do usuario). Resultado: quem escreve uma nota sem rede, fecha
o app e volta depois ve a nota travada, sem retry automatico.

Isso e exatamente o que background task resolve: um worker que o SO acorda e que
**drena a fila** reusando o mesmo bus. E notificacoes locais dao o outro lado —
lembrar de anotar — sem backend, alinhado ao produto (local-first, backend so
depois pra IA+login).

---

## Escada (o que fazer e o que pular)

| Precisa | Rung / decisao |
| --- | --- |
| Nota travada apos kill | **Fase 0**: sweep no boot (sem dep nova). Pega 90% dos casos. |
| Nota travada com app nunca reaberto | **Fase 1**: `expo-background-task` drena a fila (min 15min). |
| Lembrete em horario fixo ("anote o jantar") | **Fase 2**: `scheduleNotificationAsync` local, sem background task. |
| Lembrete condicional ("so se nao anotou hoje") | **Fase 3**: background task calcula estado + dispara local. |
| Push do servidor (streak, novidade) | **Deferido**: precisa backend + credenciais APNs/FCM. Nao agora. |

Regra ponytail: notificacao de horario fixo **nao** precisa de background task —
`scheduleNotificationAsync` com trigger `DAILY` ja repete sozinho. Background task
so entra quando o conteudo depende de estado de runtime (Fase 3) ou pra drenar
enrich (Fase 1).

---

## Fase 0 — Sweep no boot (sem dep nova)

O dreno mais barato e o que nem precisa de background task: ao abrir, re-enfileirar
o que ficou pendente.

1. `EntryRepository.findPending()`: `SELECT * FROM entries WHERE status IN
   ('thinking','queued') OR (status='error' AND error='enrich.offline')`. (Novo
   metodo; segue o padrao dos `findByDate`/`findAll` existentes.)
2. `CommandBus.resumePending()`: para cada, `this.enqueueEnrich(entry)`. Ja e
   idempotente — cache LRU + `inflight` deduplicam, e `applyResolved` so
   sobrescreve a propria nota.
3. Chamar uma vez no root, depois do hydrate (`_layout.tsx`, no `useEffect` que ja
   roda `hydratePrefs`).

Custo: ~2 metodos + 1 chamada. Sem lib. **Entrega o grosso do valor** — a maioria
dos "travou" e app reaberto na mao.

## Fase 1 — Background drain (`expo-background-task`)

Estende a Fase 0 para quando o app **nunca** e reaberto.

- `npx expo install expo-background-task expo-task-manager`
- Novo modulo `src/core/background/enrichDrain.ts`, importado cedo (no
  `_layout.tsx`, escopo de modulo) — `TaskManager.defineTask` **tem** que rodar no
  escopo global, nao dentro de componente.
- A task chama a **mesma** `bus.resumePending()`. O `bus` ja e singleton de modulo
  (`src/core/command/bus.ts`), entao a task nao precisa de React montado.
- `BackgroundTask.registerTaskAsync(id, { minimumInterval: 15 })` uma vez, apos
  onboarding.
- Retorna `BackgroundTaskResult.Success`/`Failed`.

Idempotencia (o ponto que o usuario pediu pra lembrar):
- Enrich e chaveado por `hashKey(domain, locale:userContext:texto normalizado)` +
  `inflight` Map → rodar a mesma nota duas vezes e um no-op de rede na segunda.
- Splits usam `CompositeCommand` atomico; reprocessar uma nota ja resolvida nao
  acontece porque o sweep so pega status pendente, e `AddEntryCommand` nascida
  `done` retorna sem re-enrich.
- Unico risco: foreground e background no mesmo processo enfileirando a mesma nota
  — `inflight` cobre. Cross-process (cold background) so a task roda. Baixo risco.

Limites (docs): iOS decide a hora (min 15min e so um piso), **nao roda em
simulador**, um unico worker pra todas as tasks JS. Precisa API key local + rede —
a task herda ambas do mesmo `enrich` client.

## Fase 2 — Notificacoes locais (`expo-notifications`)

Lembretes de horario fixo. Sem backend, sem push.

- `npx expo install expo-notifications` (+ `expo-task-manager` ja instalado).
- Config `app.json`: plugin `expo-notifications` (icon/color Android). Push
  (`UIBackgroundModes`) **nao** precisa — so local.
- Permissao: pedir no primeiro toggle de lembrete (nao no boot). Android 13+ exige
  criar um channel antes do prompt aparecer (`setNotificationChannelAsync`).
- Agendar com `scheduleNotificationAsync` + trigger `DAILY` (`{ type: DAILY, hour,
  minute }`). Ex: "Anote o que comeu hoje" as 21h.
- **Reagendar de forma idempotente**: em toda mudanca de config, `cancelAll` +
  reagenda tudo. Nunca empilha duplicata. (Mesma disciplina do bus: estado unico,
  reconstruido, nao incrementado.)
- Settings novo em `SettingsSheet`: liga/desliga + horario, persistido em
  `SettingsRepository`.

Ladder: isto e so agendamento nativo. Sem background task, sem worker.

## Fase 3 — Lembrete inteligente (opcional, depois)

So se a Fase 2 no fixo nao bastar. Background task acorda → `EntryRepository`
checa se houve nota `food`/`workout` hoje → se nao, dispara notificacao local
(padrao daily-quotes: task decide conteudo e agenda). Reusa a task da Fase 1.

## Deferido — Push do servidor

`getExpoPushTokenAsync` + Expo Push Service + credenciais + registro do token num
backend. O produto so ganha backend depois (IA+login). Ate la, **nao**. Anotar e
seguir.

---

## Onde as pecas encaixam (arquitetura atual)

- `bus` singleton de modulo (`core/command/bus.ts`) → alcancavel por task sem UI.
- `resumePending()` novo no `CommandBus`, ao lado de `retry()`. Reusa
  `enqueueEnrich` → cache/inflight/backoff/composite de graca.
- `EntryRepository.findPending()` novo, padrao dos outros metodos.
- `defineTask` no escopo de modulo de `core/background/enrichDrain.ts`, importado
  por `_layout.tsx`.
- Notificacoes: modulo `core/notifications/` (permissao + agenda idempotente),
  ligado por um settings novo.

## Teste

- Enrich drain (Fase 0/1): unit no `resumePending` com repo/enrich fake
  (`CommandBus.test.ts` ja tem o padrao) — sweep so toca pendentes, dispara
  enrich uma vez por nota, e no-op na segunda (idempotencia).
- Background/notif no device: `BackgroundTask.triggerTaskWorkerForTestingAsync()`
  (so dev). Simulador iOS nao roda background task.

## Ordem de execucao

1. **Fase 0** (sweep no boot) — maior valor, custo minimo, sem dep. Fazer primeiro.
2. **Fase 1** (background drain) — quando quiser cobrir app-nunca-reaberto.
3. **Fase 2** (lembretes locais fixos) — feature nova, independente das anteriores.
4. Fase 3 / push — so se pedido.
