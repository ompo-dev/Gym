import AppIntents
import Foundation

private let appGroup = "group.com.ompinho.gymnotes"

// Lives in targets/_shared so @bacons/apple-targets links it into the MAIN app
// target (not just the widget). App Shortcuts are only surfaced by Siri when the
// AppShortcutsProvider is in the main app — an extension's provider is ignored.
// Gated to iOS 18 because App Shortcuts live there, and the main app deploys to
// iOS 15.1; the user's device is far newer.

@available(iOS 18.0, *)
struct AddToGymIntent: AppIntent {
  static var title: LocalizedStringResource = "Adicionar no Gym"
  static var openAppWhenRun: Bool = true

  @Parameter(title: "O que", requestValueDialog: "O que você comeu, comprou ou treinou?")
  var text: String

  func perform() async throws -> some IntentResult {
    let payload: [String: String] = ["text": text, "domain": "food"]
    if let data = try? JSONSerialization.data(withJSONObject: payload) {
      UserDefaults(suiteName: appGroup)?.set(data, forKey: "pendingCommand")
    }
    return .result()
  }
}

@available(iOS 18.0, *)
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
