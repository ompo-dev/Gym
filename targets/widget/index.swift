import AppIntents
import SwiftUI
import WidgetKit

// The whole native surface stays deep-link only: no App Group, no shared data.
// Every entry point just opens `gym://add?...`, which the RN app already handles
// (src/core/siri/useCommandLink.ts) and runs through the same enrich pipeline as
// a typed note. A live-data widget (today's totals) would need an App Group and
// is deliberately left out.

private let scheme = "gym"

// MARK: - Quick-add widget

struct QuickAddEntry: TimelineEntry {
  let date: Date
}

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
  }
}
