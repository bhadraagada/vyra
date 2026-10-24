import CoreLocation
import CoreMotion
import ExpoModulesCore

/// Watches significant location changes and asks CoreMotion if the user drives.
/// The module and the app delegate subscriber share it. Use the instance only on the main thread.
final class MotionMonitor: NSObject, CLLocationManagerDelegate {
  static let shared = MotionMonitor()

  private static let enabledKey = "vyraMotion.autoStartEnabled"
  private static let pendingKey = "vyraMotion.pendingDriveStart"
  private static let lastDetectedKey = "vyraMotion.lastDetectedAt"
  private static let lookback: TimeInterval = 5 * 60
  private static let dedupe: TimeInterval = 10 * 60

  private let locationManager = CLLocationManager()
  private let activityManager = CMMotionActivityManager()

  /// Set while JS listens to onDriveDetected. Gets the drive start in epoch ms.
  var onDrive: ((Double) -> Void)?

  static var isEnabled: Bool { UserDefaults.standard.bool(forKey: enabledKey) }

  private override init() {
    super.init()
    locationManager.delegate = self
  }

  func setEnabled(_ enabled: Bool) {
    UserDefaults.standard.set(enabled, forKey: Self.enabledKey)
    if enabled {
      locationManager.startMonitoringSignificantLocationChanges()
    } else {
      locationManager.stopMonitoringSignificantLocationChanges()
    }
  }

  /// Returns the pending drive start in epoch ms and clears it. Safe on any thread.
  static func takePendingDriveStart() -> Double? {
    let defaults = UserDefaults.standard
    guard let at = defaults.object(forKey: pendingKey) as? Double else { return nil }
    defaults.removeObject(forKey: pendingKey)
    return at
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard CMMotionActivityManager.isActivityAvailable() else { return }
    let now = Date()
    activityManager.queryActivityStarting(from: now.addingTimeInterval(-Self.lookback), to: now, to: .main) { [weak self] activities, _ in
      guard let drive = activities?.first(where: { $0.automotive && $0.confidence != .low }) else { return }
      self?.driveDetected(startedAt: drive.startDate)
    }
  }

  private func driveDetected(startedAt: Date) {
    let defaults = UserDefaults.standard
    let now = Date().timeIntervalSince1970
    // Every significant change during one drive finds automotive again. Report the drive once.
    if now - defaults.double(forKey: Self.lastDetectedKey) < Self.dedupe { return }
    defaults.set(now, forKey: Self.lastDetectedKey)

    let at = (startedAt.timeIntervalSince1970 * 1000).rounded()
    defaults.set(at, forKey: Self.pendingKey)
    onDrive?(at)
  }
}

/// Re-arms monitoring in didFinishLaunching, before JS loads. iOS relaunches the app in the
/// background for a significant location change, and only a delegate set at launch gets that event.
public class VyraMotionAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    if MotionMonitor.isEnabled {
      MotionMonitor.shared.setEnabled(true)
    }
    return true
  }
}
