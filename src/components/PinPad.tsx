import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon, type IconName } from './ui/Icon';
import { capsule, useTheme } from '../theme';
import { useTranslation } from '../i18n';

type IoniconName = IconName;

export interface PinPadAction {
  icon: IoniconName;
  accessibilityLabel: string;
  onPress: () => void;
}

interface PinPadProps {
  /** Number of digits (dots). */
  length: number;
  /** Digits entered so far. */
  value: string;
  onDigit: (digit: string) => void;
  onDelete: () => void;
  /** Keypad disabled (waiting period, check running). */
  disabled?: boolean;
  /** Optional key bottom left (e.g. Face ID). */
  leftAction?: PinPadAction | null;
  /** Change the number to shake the dots (wrong PIN). */
  shakeKey?: number;
  compact?: boolean;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['left', '0', 'del'],
];

/** Remaining ms until `until` (epoch ms), re-rendering twice a second while > 0. */
export function useCountdown(until: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    if (until <= Date.now()) return () => clearTimeout(first);
    const id = setInterval(() => {
      tick();
      if (Date.now() >= until) clearInterval(id);
    }, 500);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [until]);
  return Math.max(0, until - now);
}

/** Dots + numeric keypad shared by the lock screen and the PIN dialog. */
export const PinPad: React.FC<PinPadProps> = ({
  length,
  value,
  onDigit,
  onDelete,
  disabled = false,
  leftAction,
  shakeKey = 0,
  compact = false,
}) => {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const [shake] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (shakeKey === 0) return;
    shake.setValue(0);
    Animated.sequence(
      [12, -12, 9, -9, 5, -5, 0].map((toValue) =>
        Animated.timing(shake, { toValue, duration: 45, useNativeDriver: true })
      )
    ).start();
  }, [shakeKey, shake]);

  const key = compact ? 64 : 72;

  return (
    <View style={styles.root}>
      <Animated.View
        style={[styles.dotsRow, { transform: [{ translateX: shake }] }]}
        accessible
        accessibilityLabel={`${value.length} / ${length}`}
      >
        {Array.from({ length }, (_, idx) => {
          const filled = idx < value.length;
          return (
            <View
              key={idx}
              style={[
                styles.dot,
                {
                  backgroundColor: filled ? colors.primary : 'transparent',
                  borderColor: filled ? colors.primary : colors.border,
                },
              ]}
            />
          );
        })}
      </Animated.View>

      <View style={[styles.keypad, { gap: compact ? 10 : 14 }]}>
        {ROWS.map((row, rIdx) => (
          <View key={rIdx} style={styles.keypadRow}>
            {row.map((item) => {
              if (item === 'left') {
                if (!leftAction) return <View key={item} style={{ width: key, height: key }} />;
                return (
                  <TouchableOpacity
                    key={item}
                    activeOpacity={0.7}
                    onPress={leftAction.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={leftAction.accessibilityLabel}
                    style={[styles.key, { width: key, height: key }, capsule(key)]}
                  >
                    <Icon name={leftAction.icon} size={28} color={colors.primary} />
                  </TouchableOpacity>
                );
              }
              if (item === 'del') {
                return (
                  <TouchableOpacity
                    key={item}
                    activeOpacity={0.7}
                    disabled={value.length === 0}
                    onPress={onDelete}
                    accessibilityRole="button"
                    accessibilityLabel={t.security.deleteDigit}
                    style={[styles.key, { width: key, height: key, opacity: value.length === 0 ? 0.3 : 1 }, capsule(key)]}
                  >
                    <Icon name="delete.left" size={26} color={colors.textPrimary} />
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={item}
                  activeOpacity={0.7}
                  disabled={disabled}
                  onPress={() => onDigit(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item}
                  style={[
                    styles.key,
                    {
                      width: key,
                      height: key,
                      ...capsule(key),
                      backgroundColor: colors.surfaceSubdued,
                      opacity: disabled ? 0.4 : 1,
                    },
                  ]}
                >
                  <Text style={[typography.title1, { color: colors.textPrimary }]}>{item}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    width: '100%',
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
    marginBottom: 28,
    minHeight: 16,
  },
  dot: {
    width: 14,
    height: 14,
    ...capsule(14),
    borderWidth: 1.5,
  },
  keypad: {
    width: '100%',
    maxWidth: 320,
    paddingHorizontal: 24,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  key: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
