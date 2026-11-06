# Local Expo module of the ScanFlow app (linked by Expo autolinking from ./modules).
Pod::Spec.new do |s|
  s.name           = 'ScanFlowOcr'
  s.version        = '1.0.0'
  s.summary        = 'On-device text recognition for ScanFlow (Apple Vision)'
  s.description    = 'Recognizes text in page images with VNRecognizeTextRequest. Runs fully offline.'
  s.author         = 'ScanFlow'
  s.homepage       = 'https://github.com/SEMSEM66/ScanFlow'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'Vision', 'ImageIO', 'CoreGraphics', 'PDFKit'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
