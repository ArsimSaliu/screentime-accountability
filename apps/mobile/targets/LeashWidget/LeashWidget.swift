import SwiftUI
import WidgetKit

// MARK: - Shared state (written by the app via the App Group, key "leash_widget")

/// Mirrors `WidgetState` in apps/mobile/src/lib/widget.ts. Times are Unix seconds.
struct LeashState: Codable {
  var streakDays: Int
  var bestStreakDays: Int
  var pendingRequestId: String?
  var pendingMinutes: Int?
  var pendingExpiresAt: Double?
  var downtime: String?
  var updatedAt: Double

  static let placeholder = LeashState(
    streakDays: 4, bestStreakDays: 9, pendingRequestId: nil, pendingMinutes: nil,
    pendingExpiresAt: nil, downtime: "22:00–07:00", updatedAt: Date().timeIntervalSince1970)

  /// A pending request only counts until it expires.
  var activePending: (minutes: Int, expires: Date)? {
    guard let minutes = pendingMinutes, let exp = pendingExpiresAt else { return nil }
    let expires = Date(timeIntervalSince1970: exp)
    return expires > Date() ? (minutes, expires) : nil
  }
}

private let appGroup =
  Bundle.main.object(forInfoDictionaryKey: "REACT_NATIVE_DEVICE_ACTIVITY_APP_GROUP") as? String

func loadLeashState() -> LeashState? {
  guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: "leash_widget"),
    let data = json.data(using: .utf8)
  else { return nil }
  return try? JSONDecoder().decode(LeashState.self, from: data)
}

// MARK: - Timeline

struct LeashEntry: TimelineEntry {
  let date: Date
  let state: LeashState?
}

struct LeashProvider: TimelineProvider {
  func placeholder(in context: Context) -> LeashEntry {
    LeashEntry(date: Date(), state: .placeholder)
  }

  func getSnapshot(in context: Context, completion: @escaping (LeashEntry) -> Void) {
    completion(LeashEntry(date: Date(), state: loadLeashState() ?? .placeholder))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<LeashEntry>) -> Void) {
    let now = Date()
    let state = loadLeashState()
    var entries = [LeashEntry(date: now, state: state)]
    // Re-render right after a pending request expires so it disappears on time.
    if let pending = state?.activePending {
      entries.append(LeashEntry(date: pending.expires.addingTimeInterval(1), state: state))
    }
    // The app also reloads the widget whenever something changes.
    completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60))))
  }
}

// MARK: - Views

struct LeashWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: LeashEntry

  var body: some View {
    content
      .widgetURL(deepLink)
      .containerBackground(for: .widget) { Color(.systemBackground) }
  }

  private var deepLink: URL? {
    if let id = entry.state?.pendingRequestId, entry.state?.activePending != nil {
      return URL(string: "leash://request/\(id)")
    }
    return URL(string: "leash://")
  }

  @ViewBuilder private var content: some View {
    if let state = entry.state {
      switch family {
      case .accessoryInline:
        Text("🔥 \(state.streakDays)-day streak")
      case .accessoryCircular:
        VStack(spacing: 0) {
          Text("\(state.streakDays)").font(.title2).bold()
          Text("days").font(.caption2)
        }
      case .accessoryRectangular:
        VStack(alignment: .leading, spacing: 2) {
          Text("🔥 \(state.streakDays)-day streak").font(.headline)
          if let pending = state.activePending {
            Text("⏳ \(pending.minutes) min requested")
          } else if let downtime = state.downtime {
            Text("🌙 \(downtime)")
          } else {
            Text("Best: \(state.bestStreakDays) days")
          }
        }
      case .systemMedium:
        HStack(alignment: .top, spacing: 16) {
          StreakBlock(state: state)
          Divider()
          VStack(alignment: .leading, spacing: 8) {
            PendingOrDowntime(state: state)
            Spacer(minLength: 0)
            Text("Best streak: \(state.bestStreakDays) days")
              .font(.caption).foregroundStyle(.secondary)
          }
          Spacer(minLength: 0)
        }
      default:
        VStack(alignment: .leading, spacing: 6) {
          StreakBlock(state: state)
          Spacer(minLength: 0)
          PendingOrDowntime(state: state)
        }
      }
    } else {
      VStack(alignment: .leading, spacing: 4) {
        Text("Leash").font(.headline)
        Text("Open the app to set up your limits.").font(.caption).foregroundStyle(.secondary)
      }
    }
  }
}

private struct StreakBlock: View {
  let state: LeashState
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("STREAK").font(.caption2).bold().foregroundStyle(.secondary)
      Text("\(state.streakDays >= 7 ? "🔥 " : "")\(state.streakDays)")
        .font(.system(size: 34, weight: .heavy, design: .rounded))
        .foregroundStyle(Color("LeashAccent"))
        .minimumScaleFactor(0.6)
      Text(state.streakDays == 1 ? "day without extra time" : "days without extra time")
        .font(.caption2).foregroundStyle(.secondary)
    }
  }
}

private struct PendingOrDowntime: View {
  let state: LeashState
  var body: some View {
    if let pending = state.activePending {
      VStack(alignment: .leading, spacing: 2) {
        Text("⏳ \(pending.minutes) min requested").font(.caption).bold()
        Text(pending.expires, style: .relative).font(.caption2).foregroundStyle(.secondary)
      }
    } else if let downtime = state.downtime {
      Text("🌙 Downtime \(downtime)").font(.caption)
    } else {
      Text("No pending requests").font(.caption).foregroundStyle(.secondary)
    }
  }
}

// MARK: - Widget

struct LeashStreakWidget: Widget {
  let kind = "LeashStreakWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LeashProvider()) { entry in
      LeashWidgetView(entry: entry)
    }
    .configurationDisplayName("Leash")
    .description("Your streak and any pending request for more time.")
    .supportedFamilies([
      .systemSmall, .systemMedium, .accessoryInline, .accessoryCircular, .accessoryRectangular,
    ])
  }
}

@main
struct LeashWidgetBundle: WidgetBundle {
  var body: some Widget {
    LeashStreakWidget()
  }
}
