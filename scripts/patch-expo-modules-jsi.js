const fs = require('fs');
const path = require('path');

const targetFile = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-modules-jsi',
  'apple',
  'Sources',
  'ExpoModulesJSI',
  'Runtime',
  'Values',
  'JavaScriptObject.swift'
);

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, 'utf8');
  
  // Patch sending 'slot' across JavaScriptActor.assumeIsolated closure boundary in Swift 6.2
  const oldCode = `    try runtime._withUnsafeGuaranteedRef { runtime in
      try JavaScriptActor.assumeIsolated {
        try encode(JavaScriptValue.Slot(slot), runtime)
      }
    }`;

  const newCode = `    try runtime._withUnsafeGuaranteedRef { runtime in
      let slotAddress = UInt(bitPattern: slot)
      try JavaScriptActor.assumeIsolated {
        let isolatedSlot = UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: slotAddress)!
        try encode(JavaScriptValue.Slot(isolatedSlot), runtime)
      }
    }`;

  if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('[patch-expo-modules-jsi] Successfully patched JavaScriptObject.swift for Swift 6.2 concurrency.');
  } else if (content.includes('let slotAddress = UInt(bitPattern: slot)')) {
    console.log('[patch-expo-modules-jsi] JavaScriptObject.swift is already patched.');
  } else {
    console.warn('[patch-expo-modules-jsi] Warning: target code pattern not found in JavaScriptObject.swift');
  }
} else {
  console.log('[patch-expo-modules-jsi] target file not found, skipping patch.');
}
