Pod::Spec.new do |s|
  s.name           = 'VyraMotion'
  s.version        = '1.0.0'
  s.summary        = 'VYRA drive detection with CoreMotion and significant location changes'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'VYRA'
  s.homepage       = 'https://github.com/expo/expo'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  # Swift 5 mode: MotionMonitor is a main-thread singleton without Sendable annotations.
  s.swift_version  = '5.0'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreLocation', 'CoreMotion'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
