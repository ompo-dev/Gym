import AppIntents
import SwiftUI
import WidgetKit

// App Group shared with the RN app (app.json + expo-target.config.js). The app
// writes today's snapshot via @bacons/apple-targets ExtensionStorage
// (src/core/widgets/*), which lands as a dictionary under these keys.
private let appGroup = "group.com.ompinho.gymnotes"
private let scheme = "gym"

private func num(_ value: Any?) -> Double { (value as? NSNumber)?.doubleValue ?? 0 }

// MARK: - Shared snapshot

struct DaySnapshot {
  var calories = 0.0, caloriesGoal = 0.0
  var protein = 0.0, proteinGoal = 0.0
  var carbs = 0.0, carbsGoal = 0.0
  var fat = 0.0, fatGoal = 0.0
  var sets = 0.0, volumeKg = 0.0

  static func load() -> DaySnapshot {
    var s = DaySnapshot()
    let defaults = UserDefaults(suiteName: appGroup)
    if let f = defaults?.dictionary(forKey: "food") {
      s.calories = num(f["calories"]); s.caloriesGoal = num(f["caloriesGoal"])
      s.protein = num(f["protein"]); s.proteinGoal = num(f["proteinGoal"])
      s.carbs = num(f["carbs"]); s.carbsGoal = num(f["carbsGoal"])
      s.fat = num(f["fat"]); s.fatGoal = num(f["fatGoal"])
    }
    if let w = defaults?.dictionary(forKey: "workout") {
      s.sets = num(w["sets"]); s.volumeKg = num(w["volumeKg"])
    }
    return s
  }
}

struct SnapshotEntry: TimelineEntry {
  let date: Date
  let snapshot: DaySnapshot
}

struct SnapshotProvider: TimelineProvider {
  func placeholder(in context: Context) -> SnapshotEntry {
    SnapshotEntry(date: Date(), snapshot: DaySnapshot())
  }
  func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
    completion(SnapshotEntry(date: Date(), snapshot: DaySnapshot.load()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
    let entry = SnapshotEntry(date: Date(), snapshot: DaySnapshot.load())
    completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(1800))))
  }
}

private func ratio(_ value: Double, _ goal: Double) -> Double {
  goal > 0 ? min(value / goal, 1) : 0
}

// MARK: - Shared views

struct MacroRing: View {
  let label: String
  let value: Double
  let goal: Double
  let color: Color

  var body: some View {
    VStack(spacing: 3) {
      ZStack {
        Circle().stroke(color.opacity(0.22), lineWidth: 5)
        Circle()
          .trim(from: 0, to: ratio(value, goal))
          .stroke(color, style: StrokeStyle(lineWidth: 5, lineCap: .round))
          .rotationEffect(.degrees(-90))
        Text("\(Int(value))").font(.system(size: 12, weight: .bold))
      }
      .frame(width: 44, height: 44)
      Text(label).font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
    }
  }
}

private func macroRow(_ s: DaySnapshot) -> some View {
  HStack {
    MacroRing(label: "P", value: s.protein, goal: s.proteinGoal, color: .green)
    MacroRing(label: "C", value: s.carbs, goal: s.carbsGoal, color: .purple)
    MacroRing(label: "F", value: s.fat, goal: s.fatGoal, color: .yellow)
  }
}

// MARK: - Diet widget

struct DietWidgetView: View {
  let s: DaySnapshot
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 5) {
        Image(systemName: "flame.fill").foregroundStyle(.orange)
        Text("\(Int(s.calories))").font(.title2.weight(.bold))
        Text("/ \(Int(s.caloriesGoal))").font(.caption).foregroundStyle(.secondary)
      }
      ProgressView(value: ratio(s.calories, s.caloriesGoal)).tint(.orange)
      macroRow(s)
    }
    .padding(6)
    .containerBackground(.fill.tertiary, for: .widget)
  }
}

struct DietWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "GymDiet", provider: SnapshotProvider()) { entry in
      DietWidgetView(s: entry.snapshot)
    }
    .configurationDisplayName("Dieta de hoje")
    .description("Calorias e macros de hoje.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

// MARK: - Workout widget

struct WorkoutWidgetView: View {
  let s: DaySnapshot
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Label("Treino", systemImage: "dumbbell.fill")
        .font(.caption.weight(.bold)).foregroundStyle(.secondary)
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text("\(Int(s.sets))").font(.system(size: 34, weight: .bold))
        Text("séries").font(.caption).foregroundStyle(.secondary)
      }
      Text("\(Int(s.volumeKg)) kg").font(.headline).foregroundStyle(.blue)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .padding(8)
    .containerBackground(.fill.tertiary, for: .widget)
  }
}

struct WorkoutWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "GymWorkout", provider: SnapshotProvider()) { entry in
      WorkoutWidgetView(s: entry.snapshot)
    }
    .configurationDisplayName("Treino de hoje")
    .description("Séries e carga de hoje.")
    .supportedFamilies([.systemSmall])
  }
}

// MARK: - Macros widget (home + lock screen)

struct MacrosWidgetView: View {
  @Environment(\.widgetFamily) var family
  let s: DaySnapshot

  var body: some View {
    switch family {
    case .accessoryCircular:
      Gauge(value: ratio(s.calories, s.caloriesGoal)) {
        Image(systemName: "flame.fill")
      } currentValueLabel: {
        Text("\(Int(s.calories))")
      }
      .gaugeStyle(.accessoryCircularCapacity)
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 2) {
        Text("\(Int(s.calories)) / \(Int(s.caloriesGoal)) cal").font(.headline)
        Text("P \(Int(s.protein))  C \(Int(s.carbs))  F \(Int(s.fat))")
          .font(.caption).foregroundStyle(.secondary)
      }
    default:
      macroRow(s)
        .padding(6)
        .containerBackground(.fill.tertiary, for: .widget)
    }
  }
}

struct MacrosWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "GymMacros", provider: SnapshotProvider()) { entry in
      MacrosWidgetView(s: entry.snapshot)
    }
    .configurationDisplayName("Macros de hoje")
    .description("Proteína, carboidrato e gordura — inclui tela de bloqueio.")
    .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
  }
}

// MARK: - Quick-add widget (deep link only)

struct QuickAddEntry: TimelineEntry { let date: Date }

struct QuickAddProvider: TimelineProvider {
  func placeholder(in context: Context) -> QuickAddEntry { QuickAddEntry(date: Date()) }
  func getSnapshot(in context: Context, completion: @escaping (QuickAddEntry) -> Void) {
    completion(QuickAddEntry(date: Date()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<QuickAddEntry>) -> Void) {
    completion(Timeline(entries: [QuickAddEntry(date: Date())], policy: .never))
  }
}

struct QuickAddView: View {
  private func link(_ title: String, _ symbol: String, _ domain: String, _ tint: Color) -> some View {
    Link(destination: URL(string: "\(scheme)://add?domain=\(domain)")!) {
      Label(title, systemImage: symbol)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(tint.opacity(0.22), in: .rect(cornerRadius: 12))
    }
  }
  var body: some View {
    VStack(spacing: 10) {
      link("Comida", "fork.knife", "food", .blue)
      link("Treino", "dumbbell", "workout", .orange)
    }
    .font(.subheadline.weight(.semibold))
    .containerBackground(.fill.tertiary, for: .widget)
  }
}

struct QuickAddWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "GymQuickAdd", provider: QuickAddProvider()) { _ in
      QuickAddView()
    }
    .configurationDisplayName("Adicionar no Gym")
    .description("Registrar comida ou treino rápido.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

// MARK: - Siri App Intent (opens the same gym://add deep link)

struct AddToGymIntent: AppIntent {
  static var title: LocalizedStringResource = "Adicionar no Gym"
  static var description = IntentDescription("Registra uma comida ou treino ditado no Gym.")

  @Parameter(title: "O que", requestValueDialog: "O que você comeu, comprou ou treinou?")
  var text: String

  func perform() async throws -> some IntentResult & OpensIntent {
    let encoded = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? text
    let url = URL(string: "\(scheme)://add?domain=food&text=\(encoded)")!
    return .result(opensIntent: OpenURLIntent(url))
  }
}

struct GymShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AddToGymIntent(),
      phrases: [
        "Adicionar no \(.applicationName)",
        "Registrar no \(.applicationName)",
        "Anotar no \(.applicationName)",
      ],
      shortTitle: "Adicionar no Gym",
      systemImageName: "plus.circle.fill"
    )
  }
}

// MARK: - Bundle

@main
struct GymWidgetBundle: WidgetBundle {
  var body: some Widget {
    QuickAddWidget()
    DietWidget()
    WorkoutWidget()
    MacrosWidget()
  }
}
