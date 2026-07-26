import Foundation
import SwiftUI
import WidgetKit

// App Group shared with the RN app (app.json + expo-target.config.js). The app
// writes today's snapshot via @bacons/apple-targets ExtensionStorage
// (src/core/widgets/*), which lands as a dictionary under these keys.
private let appGroup = "group.com.ompinho.gymnotes"

private func num(_ value: Any?) -> Double { (value as? NSNumber)?.doubleValue ?? 0 }

private func snapshotObject(_ defaults: UserDefaults?, _ key: String) -> [String: Any]? {
  if let dict = defaults?.dictionary(forKey: key) {
    return dict
  }
  if let data = defaults?.data(forKey: key),
     let object = try? JSONSerialization.jsonObject(with: data),
     let dict = object as? [String: Any] {
    return dict
  }
  if let string = defaults?.string(forKey: key),
     let data = string.data(using: .utf8),
     let object = try? JSONSerialization.jsonObject(with: data),
     let dict = object as? [String: Any] {
    return dict
  }
  return nil
}

// MARK: - Shared snapshot

struct DaySnapshot {
  var calories = 0.0, caloriesGoal = 0.0
  var protein = 0.0, proteinGoal = 0.0
  var carbs = 0.0, carbsGoal = 0.0
  var fat = 0.0, fatGoal = 0.0
  var sugar = 0.0, sugarGoal = 0.0
  var fiber = 0.0, fiberGoal = 0.0
  var sodium = 0.0, sodiumGoal = 0.0
  var sets = 0.0, volumeKg = 0.0
  var durationSeconds = 0.0, distanceMeters = 0.0

  static func load() -> DaySnapshot {
    var s = DaySnapshot()
    let defaults = UserDefaults(suiteName: appGroup)
    if let f = snapshotObject(defaults, "food") {
      s.calories = num(f["calories"]); s.caloriesGoal = num(f["caloriesGoal"])
      s.protein = num(f["protein"]); s.proteinGoal = num(f["proteinGoal"])
      s.carbs = num(f["carbs"]); s.carbsGoal = num(f["carbsGoal"])
      s.fat = num(f["fat"]); s.fatGoal = num(f["fatGoal"])
      s.sugar = num(f["sugarG"]); s.sugarGoal = num(f["sugarGoal"])
      s.fiber = num(f["fiberG"]); s.fiberGoal = num(f["fiberGoal"])
      s.sodium = num(f["sodiumMg"]); s.sodiumGoal = num(f["sodiumGoal"])
    }
    if let w = snapshotObject(defaults, "workout") {
      s.sets = num(w["sets"]); s.volumeKg = num(w["volumeKg"])
      s.durationSeconds = num(w["durationSeconds"]); s.distanceMeters = num(w["distanceMeters"])
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

private func durationText(_ seconds: Double) -> String {
  let minutes = Int((seconds / 60).rounded())
  if minutes < 60 { return "\(minutes) min" }
  let hours = minutes / 60
  let rest = minutes % 60
  return rest > 0 ? "\(hours) h \(rest) min" : "\(hours) h"
}

private func distanceText(_ meters: Double) -> String {
  if meters >= 1000 {
    let km = meters / 1000
    return km.rounded() == km ? "\(Int(km)) km" : String(format: "%.1f km", km)
  }
  return "\(Int(meters.rounded())) m"
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

private func microLine(_ s: DaySnapshot) -> some View {
  VStack(alignment: .leading, spacing: 1) {
    Text("Acucar \(Int(s.sugar))/\(Int(s.sugarGoal)) g")
    Text("Fibra \(Int(s.fiber))/\(Int(s.fiberGoal)) g")
    Text("Sodio \(Int(s.sodium))/\(Int(s.sodiumGoal)) mg")
  }
  .font(.system(size: 9, weight: .semibold))
  .foregroundStyle(.secondary)
  .lineLimit(1)
  .minimumScaleFactor(0.75)
}

// MARK: - Diet widget

struct DietWidgetView: View {
  let s: DaySnapshot
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 5) {
        Image(systemName: "flame.fill").foregroundStyle(.orange)
        Text("\(Int(s.calories))").font(.title2.weight(.bold))
        Text("/ \(Int(s.caloriesGoal))").font(.caption).foregroundStyle(.secondary)
      }
      ProgressView(value: ratio(s.calories, s.caloriesGoal)).tint(.orange)
      macroRow(s)
      microLine(s)
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
    .description("Calorias, macros e micros de hoje.")
    .supportedFamilies([.systemSmall])
  }
}

// MARK: - Cardio widget

struct CardioWidgetView: View {
  let s: DaySnapshot
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Label("Cardio", systemImage: "figure.run")
        .font(.caption.weight(.bold)).foregroundStyle(.secondary)
      Text(durationText(s.durationSeconds)).font(.system(size: 28, weight: .bold))
      Text(distanceText(s.distanceMeters)).font(.headline).foregroundStyle(.green)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .padding(8)
    .containerBackground(.fill.tertiary, for: .widget)
  }
}

struct CardioWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "GymCardio", provider: SnapshotProvider()) { entry in
      CardioWidgetView(s: entry.snapshot)
    }
    .configurationDisplayName("Cardio de hoje")
    .description("Tempo e distancia de cardio hoje.")
    .supportedFamilies([.systemSmall])
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
        Text("Ac \(Int(s.sugar))  Fib \(Int(s.fiber))  Na \(Int(s.sodium))")
          .font(.caption2).foregroundStyle(.secondary)
      }
    default:
      VStack(spacing: 5) {
        macroRow(s)
        microLine(s)
      }
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

// MARK: - Bundle

@main
struct GymWidgetBundle: WidgetBundle {
  var body: some Widget {
    DietWidget()
    CardioWidget()
    WorkoutWidget()
    MacrosWidget()
  }
}
