import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './ui/Icon';
import { capsule, corner, hairline, radius, useTheme } from '../theme';
import { useTranslation } from '../i18n';

export type LegalDocType = 'privacy' | 'terms' | 'licenses';

interface LegalModalProps {
  visible: boolean;
  type: LegalDocType;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ visible, type, onClose }) => {
  const { colors, typography, spacing } = useTheme();
  const { t, language } = useTranslation();
  const insets = useSafeAreaInsets();

  const title =
    type === 'privacy'
      ? t.settings.privacyPolicy
      : type === 'terms'
        ? t.settings.termsOfService
        : t.settings.licenses;

  const isDe = language === 'de';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={[typography.headline, { color: colors.textPrimary, fontWeight: '700', flex: 1 }]}>
            {title}
          </Text>
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
          {type === 'privacy' && (
            <View style={styles.textContainer}>
              <Text style={[typography.title3, styles.sectionTitle, { color: colors.textPrimary }]}>
                {isDe ? 'Datenschutzerklärung für ScanFlow' : 'ScanFlow Privacy Policy'}
              </Text>
              <Text style={[typography.caption1, { color: colors.textSecondary, marginBottom: 12 }]}>
                {isDe ? 'Stand: November 2026' : 'Last updated: November 2026'}
              </Text>

              <Text style={[typography.bodyBold, styles.heading, { color: colors.textPrimary }]}>
                {isDe ? '1. 100% Offline & Keine Datenerfassung' : '1. 100% Offline & Zero Data Collection'}
              </Text>
              <Text style={[typography.body, styles.paragraph, { color: colors.textSecondary }]}>
                {isDe
                  ? 'ScanFlow ist so konzipiert, dass zu keinem Zeitpunkt persönliche Daten, gescannte Dokumente oder Nutzungsstatistiken erfasst, gespeichert oder übertragen werden. Es existieren keine Benutzerkonten, keine Werbenetzwerke, keine Analysedienste und keine Tracking-Tools.'
                  : 'ScanFlow is designed from the ground up to collect, store, and transmit zero personal data, scanned documents, or telemetry. There are no user accounts, no advertising networks, no analytics trackers, and no telemetry services.'}
              </Text>

              <Text style={[typography.bodyBold, styles.heading, { color: colors.textPrimary }]}>
                {isDe ? '2. Lokale Speicherung auf dem Gerät' : '2. On-Device Local Storage'}
              </Text>
              <Text style={[typography.body, styles.paragraph, { color: colors.textSecondary }]}>
                {isDe
                  ? 'Alle Dokumente, Seitenbilder und durch Texterkennung (Apple Vision) extrahierten Texte verbleiben ausschließlich in der isolierten Sandbox-Umgebung Ihres iPhones (lokale SQLite-Datenbank und verschlüsseltes iOS-Dateisystem). Datensicherungen werden nur dann erstellt, wenn Sie die Backup-Funktion über die Dateien-App manuell anstoßen.'
                  : 'All documents, page images, and text extracted via Apple Vision OCR remain strictly inside your iPhone’s sandboxed container (local SQLite database and encrypted iOS file system). Backups are created only when you manually initiate a backup via the Files app.'}
              </Text>

              <Text style={[typography.bodyBold, styles.heading, { color: colors.textPrimary }]}>
                {isDe ? '3. Kamera & Fotomediathek' : '3. Camera & Photo Library Access'}
              </Text>
              <Text style={[typography.body, styles.paragraph, { color: colors.textSecondary }]}>
                {isDe
                  ? 'Der Zugriff auf die Kamera und die Fotomediathek wird ausschließlich für das Scannen und den Import von Dokumenten direkt auf dem Gerät genutzt. Bilder werden niemals an Dritte oder Server weitergeleitet.'
                  : 'Camera and photo library permissions are used solely for capturing and importing documents directly on your device. Images are never transmitted to any third party or remote server.'}
              </Text>

              <Text style={[typography.bodyBold, styles.heading, { color: colors.textPrimary }]}>
                {isDe ? '4. Sicherheit, PIN & Biometrie' : '4. Security, PIN & Biometrics'}
              </Text>
              <Text style={[typography.body, styles.paragraph, { color: colors.textSecondary }]}>
                {isDe
                  ? 'Face ID und Touch ID werden über das native iOS LocalAuthentication Framework ausgeführt. ScanFlow hat keinen Zugriff auf Ihre biometrischen Daten. Ein optionaler ScanFlow-PIN wird mit PBKDF2-HMAC-SHA256 salted gehasht und geschützt im iOS Keychain (nur auf diesem Gerät) abgelegt.'
                  : 'Face ID and Touch ID authentication are processed natively by iOS LocalAuthentication. ScanFlow never accesses your biometric data. Optional ScanFlow PINs are salted with PBKDF2-HMAC-SHA256 and stored exclusively in the iOS Keychain (this device only).'}
              </Text>

              <Text style={[typography.bodyBold, styles.heading, { color: colors.textPrimary }]}>
                {isDe ? '5. In-App-Käufe (StoreKit 2)' : '5. In-App Purchases (StoreKit 2)'}
              </Text>
              <Text style={[typography.body, styles.paragraph, { color: colors.textSecondary }]}>
                {isDe
                  ? 'Abonnements und Käufe werden über Apples StoreKit 2 direkt mit Apple abgewickelt. ScanFlow verwendet keine externen Zahlungsanbieter oder Tracker.'
                  : 'Subscriptions and purchases are processed directly by Apple via StoreKit 2. ScanFlow employs zero third-party payment gateways or analytics SDKs.'}
              </Text>
            </View>
          )}

          {type === 'terms' && (
            <View style={styles.textContainer}>
              <Text style={[typography.title3, styles.sectionTitle, { color: colors.textPrimary }]}>
                {isDe ? 'Nutzungsbedingungen für ScanFlow' : 'ScanFlow Terms of Use'}
              </Text>
              <Text style={[typography.caption1, { color: colors.textSecondary, marginBottom: 12 }]}>
                {isDe ? 'Stand: November 2026' : 'Last updated: November 2026'}
              </Text>

              <Text style={[typography.bodyBold, styles.heading, { color: colors.textPrimary }]}>
                {isDe ? '1. Leistungsbeschreibung' : '1. Description of Service'}
              </Text>
              <Text style={[typography.body, styles.paragraph, { color: colors.textSecondary }]}>
                {isDe
                  ? 'ScanFlow ist eine Offline-Dokumenten- und PDF-Werkzeug-App für iOS. Die Funktionen umfassen das Scannen, Zuschneiden, Filtern, Organisieren und Exportieren von Dokumenten.'
                  : 'ScanFlow is an offline document scanner and PDF utility for iOS. Features include scanning, perspective cropping, filtering, organizing, and exporting documents.'}
              </Text>

              <Text style={[typography.bodyBold, styles.heading, { color: colors.textPrimary }]}>
                {isDe ? '2. Lokale Datenverantwortung' : '2. Data Responsibility'}
              </Text>
              <Text style={[typography.body, styles.paragraph, { color: colors.textSecondary }]}>
                {isDe
                  ? 'Da ScanFlow vollständig offline arbeitet und keine eigenen Cloud-Speicher bereitstellt, liegt die Verantwortung für die Sicherung und Aufbewahrung wichtiger Dokumente beim Nutzer (z.B. über die ZIP-Backup-Funktion oder iCloud Drive).'
                  : 'Because ScanFlow operates 100% offline without remote cloud servers, backing up important documents remains the responsibility of the user (e.g., via the ZIP Backup feature or iCloud Drive).'}
              </Text>

              <Text style={[typography.bodyBold, styles.heading, { color: colors.textPrimary }]}>
                {isDe ? '3. Visuelle Unterschriften' : '3. Visual Signatures'}
              </Text>
              <Text style={[typography.body, styles.paragraph, { color: colors.textSecondary }]}>
                {isDe
                  ? 'Die Funktion "Unterschrift einfügen" erzeugt eine rein visuelle Darstellung Ihrer Unterschrift auf der PDF-Seite. Es handelt sich hierbei nicht um eine qualifizierte elektronische Signatur (QES) gemäß eIDAS-Verordnung.'
                  : 'The "Insert Signature" feature renders a visual graphical signature on the document page. It does not constitute a Qualified Electronic Signature (QES) under eIDAS regulations.'}
              </Text>

              <Text style={[typography.bodyBold, styles.heading, { color: colors.textPrimary }]}>
                {isDe ? '4. Abonnements & Käufe' : '4. Subscriptions & Purchases'}
              </Text>
              <Text style={[typography.body, styles.paragraph, { color: colors.textSecondary }]}>
                {isDe
                  ? 'Abonnements verlängern sich automatisch über Ihren Apple-Account, sofern sie nicht mindestens 24 Stunden vor Ablauf in den iOS-Einstellungen gekündigt werden. Es gelten die Standard-EULA-Bedingungen von Apple.'
                  : 'Subscriptions automatically renew through your Apple Account unless canceled in your iOS Settings at least 24 hours before renewal. Apple’s Standard EULA terms apply.'}
              </Text>
            </View>
          )}

          {type === 'licenses' && (
            <View style={styles.textContainer}>
              <Text style={[typography.title3, styles.sectionTitle, { color: colors.textPrimary }]}>
                {t.settings.licenses}
              </Text>
              <Text style={[typography.caption1, { color: colors.textSecondary, marginBottom: 12 }]}>
                {isDe
                  ? 'ScanFlow verwendet die folgenden Open-Source-Bibliotheken:'
                  : 'ScanFlow uses the following open source libraries:'}
              </Text>

              {[
                { name: 'React & React Native', lic: 'MIT License', copy: 'Copyright (c) Meta Platforms, Inc.' },
                { name: 'Expo SDK', lic: 'MIT License', copy: 'Copyright (c) 650 Industries, Inc.' },
                { name: '@shopify/react-native-skia', lic: 'MIT License', copy: 'Copyright (c) Shopify Inc.' },
                { name: 'pdf-lib', lic: 'MIT License', copy: 'Copyright (c) Andrew Dillon' },
                { name: 'react-native-reanimated', lic: 'MIT License', copy: 'Copyright (c) Software Mansion' },
                { name: 'react-native-gesture-handler', lic: 'MIT License', copy: 'Copyright (c) Software Mansion' },
                { name: 'react-native-screens', lic: 'MIT License', copy: 'Copyright (c) Software Mansion' },
                { name: 'react-native-safe-area-context', lic: 'MIT License', copy: 'Copyright (c) Janic Duplessis' },
              ].map((item) => (
                <View
                  key={item.name}
                  style={[styles.licenseCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                >
                  <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>{item.name}</Text>
                  <Text style={[typography.caption1, { color: colors.primary, marginTop: 2 }]}>{item.lic}</Text>
                  <Text style={[typography.caption2, { color: colors.textSecondary, marginTop: 2 }]}>
                    {item.copy}
                  </Text>
                </View>
              ))}
            </View>
          )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    ...capsule(32),
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  textContainer: {
    marginTop: 8,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  heading: {
    marginTop: 14,
    marginBottom: 4,
  },
  paragraph: {
    lineHeight: 20,
  },
  licenseCard: {
    borderWidth: hairline,
    ...corner(radius.sm),
    padding: 12,
    marginBottom: 10,
  },
});
