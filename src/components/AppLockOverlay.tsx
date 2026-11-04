import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, AppStateStatus } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { authService } from '../services/AuthService';

export const AppLockOverlay: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useTranslation();

  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);

  // Check lock setting on mount
  useEffect(() => {
    async function checkLock() {
      const enabled = await authService.isAppLockEnabled();
      setIsLockEnabled(enabled);
      if (enabled) {
        setIsLocked(true);
        triggerAuth();
      }
    }
    checkLock();
  }, []);

  // Listen to AppState transitions
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      const enabled = await authService.isAppLockEnabled();
      setIsLockEnabled(enabled);

      if (enabled) {
        if (nextState === 'background' || nextState === 'inactive') {
          setIsLocked(true);
        } else if (nextState === 'active') {
          triggerAuth();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const triggerAuth = async () => {
    setAuthFailed(false);
    const success = await authService.authenticate(t.auth.prompt);
    if (success) {
      setIsLocked(false);
      setAuthFailed(false);
    } else {
      setAuthFailed(true);
    }
  };

  if (isLockEnabled && isLocked) {
    return (
      <View style={[styles.lockContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSubdued }]}>
          <Ionicons name="lock-closed" size={56} color={colors.primary} />
        </View>

        <Text style={[typography.title1, styles.title, { color: colors.textPrimary }]}>
          ScanFlow
        </Text>

        <Text style={[typography.body, styles.subtitle, { color: colors.textSecondary }]}>
          {authFailed ? t.auth.failed : t.auth.prompt}
        </Text>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={triggerAuth}
          style={[
            styles.unlockButton,
            {
              backgroundColor: colors.primary,
              borderRadius: borderRadius.round,
              marginTop: spacing.xl,
            },
          ]}
        >
          <Ionicons name="scan-outline" size={22} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={[typography.bodyBold, { color: '#FFFFFF' }]}>
            Mit Face ID entsperren
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
};

const styles = StyleSheet.create({
  lockContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
});
