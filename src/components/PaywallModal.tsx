import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './ui/Icon';
import { Button } from './ui/Button';
import { capsule, corner, hairline, radius, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import {
  monetizationService,
  PRO_PRODUCT_IDS,
  type ProProductId,
  type StoreProduct,
} from '../services/MonetizationService';
import { haptics } from '../utils/haptics';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({ visible, onClose, onSuccess }) => {
  const { colors, typography, spacing } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<ProProductId>(PRO_PRODUCT_IDS.yearly);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    monetizationService
      .fetchProducts()
      .then((list) => {
        if (alive) {
          setProducts(list);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('[PaywallModal] fetchProducts failed:', err);
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [visible]);

  const handleSelectTier = (id: ProProductId) => {
    void haptics.selection();
    setSelectedProductId(id);
  };

  const handlePurchase = async () => {
    if (purchasing || restoring) return;
    setPurchasing(true);
    try {
      const outcome = await monetizationService.purchase(selectedProductId);
      if (outcome.success) {
        void haptics.success();
        Alert.alert(t.monetization.purchaseSuccessTitle, t.monetization.purchaseSuccessMessage, [
          {
            text: t.common.ok,
            onPress: () => {
              onSuccess?.();
              onClose();
            },
          },
        ]);
      } else if (outcome.error && outcome.error !== 'cancelled') {
        void haptics.error();
        Alert.alert(t.common.error, outcome.error);
      }
    } catch (err) {
      console.error('[PaywallModal] purchase failed:', err);
      void haptics.error();
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (purchasing || restoring) return;
    setRestoring(true);
    try {
      const outcome = await monetizationService.restorePurchases();
      if (outcome.unlocked) {
        void haptics.success();
        Alert.alert(t.monetization.restoreSuccessTitle, t.monetization.restoreSuccessMessage, [
          {
            text: t.common.ok,
            onPress: () => {
              onSuccess?.();
              onClose();
            },
          },
        ]);
      } else {
        void haptics.warning();
        Alert.alert(t.monetization.restoreNoneTitle, t.monetization.restoreNoneMessage);
      }
    } catch (err) {
      console.error('[PaywallModal] restore failed:', err);
      void haptics.error();
    } finally {
      setRestoring(false);
    }
  };

  const isYearly = selectedProductId === PRO_PRODUCT_IDS.yearly;
  const isLifetime = selectedProductId === PRO_PRODUCT_IDS.lifetime;

  const ctaLabel = isYearly
    ? t.monetization.subscribeTrial
    : isLifetime
      ? t.monetization.purchaseNow
      : t.monetization.subscribeNow;

  const features: { icon: IconName; text: string }[] = [
    { icon: 'doc.text.viewfinder', text: t.monetization.featureOcr },
    { icon: 'doc.richtext', text: t.monetization.featureWord },
    { icon: 'doc.on.doc', text: t.monetization.featurePdfToolkit },
    { icon: 'lock.fill', text: t.monetization.featurePassword },
    { icon: 'person.text.rectangle', text: t.monetization.featureIdCard },
    { icon: 'signature', text: t.monetization.featureSignatures },
    { icon: 'pencil.and.ellipsis.rectangle', text: t.monetization.featureSmartNaming },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
        {/* Header toolbar */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: colors.surfaceSubdued }]}
            accessibilityRole="button"
            accessibilityLabel={t.common.close}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="xmark" size={16} color={colors.textSecondary} weight="bold" />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.base }]}
        >
          {/* Pro Hero */}
          <View style={styles.heroSection}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primarySubdued }]}>
              <Icon name="sparkles" size={32} color={colors.primary} />
            </View>
            <Text style={[typography.title1, styles.heroTitle, { color: colors.textPrimary }]}>
              {t.monetization.proTitle}
            </Text>
            <Text style={[typography.body, styles.heroSubtitle, { color: colors.textSecondary }]}>
              {t.monetization.proSubtitle}
            </Text>
            <View style={[styles.badge, { backgroundColor: colors.primarySubdued }]}>
              <Icon name="checkmark.shield.fill" size={14} color={colors.primary} />
              <Text style={[typography.caption1, { color: colors.primary, fontWeight: '600', marginLeft: 4 }]}>
                {t.monetization.unlimitedBadge}
              </Text>
            </View>
          </View>

          {/* Feature List */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {features.map((item, index) => (
              <View
                key={item.text}
                style={[
                  styles.featureRow,
                  index > 0 && { borderTopWidth: hairline, borderTopColor: colors.borderLight },
                ]}
              >
                <View style={[styles.featureIconBox, { backgroundColor: colors.primarySubdued }]}>
                  <Icon name={item.icon} size={18} color={colors.primary} />
                </View>
                <Text style={[typography.body, styles.featureText, { color: colors.textPrimary }]}>
                  {item.text}
                </Text>
              </View>
            ))}
          </View>

          {/* Pricing Tiers */}
          <View style={styles.tiersContainer}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
            ) : (
              products.map((p) => {
                const isSelected = selectedProductId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => handleSelectTier(p.id as ProProductId)}
                    activeOpacity={0.75}
                    style={[
                      styles.tierCard,
                      {
                        backgroundColor: isSelected ? colors.primarySubdued : colors.surfaceSubdued,
                        borderColor: isSelected ? colors.primary : colors.borderLight,
                      },
                    ]}
                  >
                    <View style={styles.tierRadioRow}>
                      <Icon
                        name={isSelected ? 'checkmark.circle.fill' : 'circle'}
                        size={20}
                        color={isSelected ? colors.primary : colors.textMuted}
                      />
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text
                            style={[
                              typography.headline,
                              {
                                color: isSelected ? colors.primary : colors.textPrimary,
                                fontWeight: isSelected ? '700' : '600',
                              },
                            ]}
                          >
                            {p.id === PRO_PRODUCT_IDS.yearly
                              ? t.monetization.yearlyTitle
                              : p.id === PRO_PRODUCT_IDS.monthly
                                ? t.monetization.monthlyTitle
                                : t.monetization.lifetimeTitle}
                          </Text>
                          {p.badge && (
                            <View style={[styles.tierBadge, { backgroundColor: colors.primary }]}>
                              <Text style={[typography.caption2, styles.tierBadgeText]}>{p.badge}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[typography.caption1, { color: colors.textSecondary, marginTop: 2 }]}>
                          {p.description}
                        </Text>
                      </View>
                      <Text
                        style={[
                          typography.headline,
                          {
                            color: isSelected ? colors.primary : colors.textPrimary,
                            fontWeight: '700',
                          },
                        ]}
                      >
                        {p.displayPrice}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          {/* CTA & Actions */}
          <View style={styles.ctaSection}>
            <Button
              title={purchasing ? t.monetization.purchasing : ctaLabel}
              loading={purchasing}
              disabled={purchasing || restoring}
              onPress={handlePurchase}
              size="large"
              style={{ width: '100%' }}
            />

            <TouchableOpacity
              onPress={handleRestore}
              disabled={purchasing || restoring}
              style={styles.restoreBtn}
              accessibilityRole="button"
            >
              {restoring ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[typography.subhead, { color: colors.primary, fontWeight: '600' }]}>
                  {t.monetization.restorePurchases}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={[typography.caption2, styles.legalNote, { color: colors.textSecondary }]}>
              {t.monetization.legalNote}
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  closeButton: {
    width: 32,
    height: 32,
    ...capsule(32),
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  heroSection: {
    alignItems: 'center',
    marginVertical: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    ...capsule(64),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontWeight: '800',
    textAlign: 'center',
  },
  heroSubtitle: {
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    ...corner(radius.sm),
    marginTop: 10,
  },
  card: {
    borderWidth: hairline,
    ...corner(radius.lg),
    overflow: 'hidden',
    marginTop: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  featureIconBox: {
    width: 32,
    height: 32,
    ...corner(radius.xs),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureText: {
    flex: 1,
    fontWeight: '500',
  },
  tiersContainer: {
    marginTop: 16,
    gap: 10,
  },
  tierCard: {
    borderWidth: 1.5,
    ...corner(radius.md),
    padding: 14,
  },
  tierRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    ...capsule(16),
    marginLeft: 8,
  },
  tierBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 10,
  },
  ctaSection: {
    marginTop: 20,
    alignItems: 'center',
  },
  restoreBtn: {
    marginTop: 14,
    paddingVertical: 8,
  },
  legalNote: {
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    lineHeight: 16,
  },
});
