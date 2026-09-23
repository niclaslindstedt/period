# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# The local Expo module behind the iCloud Drive backend (see ../index.ts).
# Autolinked from ../expo-module.config.json — there is no npm package here.

Pod::Spec.new do |s|
  s.name           = 'ICloudStore'
  s.version        = '1.0.0'
  s.summary        = "Reads and writes the cycle log in the app's iCloud container"
  s.description    = "A file-shaped API (list/read/write/remove) over the app's own iCloud Documents folder, coordinated with NSFileCoordinator."
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
