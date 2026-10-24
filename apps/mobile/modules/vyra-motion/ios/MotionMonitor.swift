import CoreLocation
import CoreMotion
import ExpoModulesCore

/// Watches significant location changes and asks CoreMotion if the user drives.
/// The module and the app delegate subscriber share it. Use the instance only on the main thread.
/// The static members are safe on any thread.
final class MotionMonitor: NSObject, CLLocationManagerDelegate {
  static let shared = MotionMonitor()

  private static let enabledKey = "vyraMotion.autoStartEnabled"
  private static let pendingKey = "vyraMotion.pendingDriveStart"
  private static let lastDriveStartKey = "vyraMotion.lastDriveStart"
  private static let lookback: TimeInterval = 5 * 60

  private let locationManager = CLLocationManager()
  private let activityManager = CMMotionActivityManager()

  /// Set while JS listens to onDriveDetected. Gets the drive start in epoch ms.
  var onDrive: ((Double) -> Void)?

  static var isEnabled: Bool { UserDefaults.standard.bool(forKey: enabledKey) }

  private override init() {
    super.init()
    locationManager.delegate = self
  }

  /// Guards the enabled flag and the pending start together. CoreMotion results arrive on main and JS calls
  /// setEnabled on its own thread, so a drive must not be saved between turning detection off and clearing it.
  private static let lock = NSLock()

  /// Saves the flag at once, so isEnabled returns the new value right after. The CLLocationManager calls run on main.
  static func setEnabled(_ enabled: Bool) {
    let defaults = UserDefaults.standard
    lock.lock()
    defaults.set(enabled, forKey: enabledKey)
    // A drive found before detection was turned off must not start a trip later.
    if !enabled { defaults.removeObject(forKey: pendingKey) }
    lock.unlock()
    DispatchQueue.main.async {
      MotionMonitor.shared.updateMonitoring()
    }
  }

  /// Starts or stops significant change monitoring to match the saved flag. Main thread only.
  func updateMonitoring() {
    if Self.isEnabled {
      locationManager.startMonitoringSignificantLocationChanges()
    } else {
      locationManager.stopMonitoringSignificantLocationChanges()
    }
  }

  /// Returns the pending drive start in epoch ms and clears it. Safe on any thread.
  static func takePendingDriveStart() -> Double? {
    let defaults = UserDefaults.standard
    lock.lock()
    defer { lock.unlock() }
    guard let at = defaults.object(forKey: pendingKey) as? Double else { return nil }
    defaults.removeObject(forKey: pendingKey)
    return at
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard CMMotionActivityManager.isActivityAvailable() else { return }
    let now = Date()
    activityManager.queryActivityStarting(from: now.addingTimeInterval(-Self.lookback), to: now, to: .main) { [weak self] activities, _ in
      // The latest automotive interval. An earlier one in the window can be the drive that already ended.
      guard let drive = activities?.last(where: { $0.automotive && $0.confidence != .low }) else { return }
      self?.driveDetected(startedAt: drive.startDate)
    }
  }

  private func driveDetected(startedAt: Date) {
    let defaults = UserDefaults.standard
    let at = (startedAt.timeIntervalSince1970 * 1000).rounded()
    Self.lock.lock()
    // Skip if detection was turned off while the CoreMotion query ran.
    // Every significant change during one automotive interval finds the same start. Report each interval once.
    // A newer interval passes even right after the last one. If a trip still records, JS ignores the extra start.
    let isNew = Self.isEnabled && at > defaults.double(forKey: Self.lastDriveStartKey)
    if isNew {
      defaults.set(at, forKey: Self.lastDriveStartKey)
      defaults.set(at, forKey: Self.pendingKey)
    }
    Self.lock.unlock()
    // Sent outside the lock. JS checks isAutoStartEnabled() again before it starts a trip.
    if isNew { onDrive?(at) }
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
      MotionMonitor.shared.updateMonitoring()
    }
    return true
  }
}
