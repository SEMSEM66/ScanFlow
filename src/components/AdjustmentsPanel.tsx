import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import Slider from '@react-native-community/slider';
import { hairline, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { Adjustments } from '../types';
import { DEFAULT_ADJUSTMENTS } from '../imaging/types';
import { Button } from './ui';

interface AdjustmentsPanelProps {
  value: Adjustments;
  /** Called when a slider is released / the switch toggled (triggers a re-render of the page). */
  onChange: (value: Adjustments) => void;
  onApplyToAll: () => void;
  onClose: () => void;
  busy?: boolean;
}

/** Bottom sheet with brightness / contrast / sharpness sliders and a denoise switch. */
export const AdjustmentsPanel: React.FC<AdjustmentsPanelProps> = ({ value, onChange, onApplyToAll, onClose, busy }) => {
  const { colors, typography, spacing } = useTheme();
  const { t } = useTranslation();
  const [local, setLocal] = useState<Adjustments>(value);
  // Re-sync with the page value when it changes from outside (React "adjust state on prop change" pattern)
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setLocal(value);
  }

  const commit = (next: Adjustments) => {
    setLocal(next);
    onChange(next);
  };

  const row = (label: string, key: 'brightness' | 'contrast' | 'sharpness', min: number, max: number) => (
    <View style={styles.row} key={key}>
      <View style={styles.rowHeader}>
        <Text style={[typography.body, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[typography.footnote, { color: colors.textSecondary }]}>
          {Math.round(local[key] * 100)}
        </Text>
      </View>
      <Slider
        minimumValue={min}
        maximumValue={max}
        step={0.05}
        value={local[key]}
        disabled={busy}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.border}
        onValueChange={(v) => setLocal((p) => ({ ...p, [key]: v }))}
        onSlidingComplete={(v) => commit({ ...local, [key]: Math.round(v * 100) / 100 })}
        accessibilityLabel={label}
      />
    </View>
  );

  return (
      <View style={{ paddingTop: 24, paddingHorizontal: spacing.base, paddingBottom: spacing.xxl }}>
        <View style={styles.titleRow}>
          <Text style={[typography.title2, { color: colors.textPrimary }]}>{t.filters.adjust}</Text>
          <TouchableOpacity onPress={() => commit({ ...DEFAULT_ADJUSTMENTS })} disabled={busy}>
            <Text style={[typography.bodyMedium, { color: colors.primary }]}>{t.common.reset}</Text>
          </TouchableOpacity>
        </View>
        {row(t.filters.brightness, 'brightness', -1, 1)}
        {row(t.filters.contrast, 'contrast', -1, 1)}
        {row(t.filters.sharpness, 'sharpness', 0, 1)}
        <View style={[styles.switchRow, { borderColor: colors.borderLight }]}>
          <Text style={[typography.body, { color: colors.textPrimary }]}>{t.filters.denoise}</Text>
          <Switch
            value={local.denoise}
            disabled={busy}
            onValueChange={(v) => commit({ ...local, denoise: v })}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
        <Button
          variant="tinted"
          title={t.filters.applyToAll}
          disabled={busy}
          onPress={onApplyToAll}
          style={styles.applyAll}
        />
        <Button title={t.common.done} onPress={onClose} style={styles.done} />
      </View>
  );
};

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  row: { marginTop: 10 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: hairline,
  },
  applyAll: { marginTop: 18 },
  done: { marginTop: 10 },
});
