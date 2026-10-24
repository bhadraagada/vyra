import CoreMotion
import ExpoModulesCore

public class VyraMotionModule: Module {
  private let activityManager = CMMotionActivityManager()

  public func definition() -> ModuleDefinition {
    Name("VyraMotion")

    Events("onActivity", "onDriveDetected")

    Function("isAvailable") {
      CMMotionActivityManager.isActivityAvailable()
    }

    Function("setAutoStartEnabled") { (enabled: Bool) in
      MotionMonitor.setEnabled(enabled)
    }

    Function("isAutoStartEnabled") {
      MotionMonitor.isEnabled
    }

    Function("takePendingDriveStart") {
      MotionMonitor.takePendingDriveStart()
    }

    Function("startActivityUpdates") { () -> Void in
      activityManager.startActivityUpdates(to: .main) { [weak self] activity in
        guard let activity else { return }
        self?.sendEvent("onActivity", [
          "activity": activityName(activity),
          "confidence": confidenceName(activity.confidence),
          "at": (activity.startDate.timeIntervalSince1970 * 1000).rounded(),
        ])
      }
    }

    Function("stopActivityUpdates") {
      activityManager.stopActivityUpdates()
    }

    OnStartObserving("onDriveDetected") {
      DispatchQueue.main.async { [weak self] in
        MotionMonitor.shared.onDrive = { at in
          self?.sendEvent("onDriveDetected", ["at": at])
        }
      }
    }

    OnStopObserving("onDriveDetected") {
      DispatchQueue.main.async {
        MotionMonitor.shared.onDrive = nil
      }
    }

    OnDestroy {
      activityManager.stopActivityUpdates()
    }
  }
}

private func activityName(_ activity: CMMotionActivity) -> String {
  if activity.automotive { return "automotive" }
  if activity.cycling { return "cycling" }
  if activity.running { return "running" }
  if activity.walking { return "walking" }
  if activity.stationary { return "stationary" }
  return "unknown"
}

private func confidenceName(_ confidence: CMMotionActivityConfidence) -> String {
  switch confidence {
  case .high: return "high"
  case .medium: return "medium"
  default: return "low"
  }
}
