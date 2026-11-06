import React from 'react';
import { NativeTabs } from 'expo-router/native-tabs';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import { useScanner } from '../../src/components/ScannerProvider';

/** SDK 58's system tab bar; the disabled scanner item emits a press without selecting its placeholder. */
export default function TabLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const scanner = useScanner();
  return (
    <NativeTabs tintColor={colors.primary}>
      <NativeTabs.Trigger name="(library)">
        <NativeTabs.Trigger.Label>{t.library.title}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'folder', selected: 'folder.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scan-tab-placeholder" disabled listeners={{ tabPress: () => { if (!scanner.busy) void scanner.scan(); } }}>
        <NativeTabs.Trigger.Label>{t.scan.title}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="camera" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(tools)">
        <NativeTabs.Trigger.Label>{t.tools.title}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'wrench.and.screwdriver', selected: 'wrench.and.screwdriver.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(settings)">
        <NativeTabs.Trigger.Label>{t.settings.title}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
