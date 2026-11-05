import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { authService } from '../services/AuthService';
import { documentScanner } from '../services/DocumentScannerService';
import { saveScan, type SavedScan, type ScanTarget } from '../services/ScanImportService';
import { storageService } from '../services/StorageService';
import type { LanguageMode } from '../types';

/**
 * App-wide scan entry point. `scan()` opens the preferred scanner:
 *  - iOS document scanner (VisionKit, default): live edge overlay, auto
 *    capture, multi-page batches; pages come back cropped and are stored
 *    without another detection pass,
 *  - or ScanFlow's own camera screen (/scan) – setting, or fallback when the
 *    system scanner is unavailable.
 * `importFromLibrary()` imports photos (with edge detection).
 * New documents are opened afterwards; for target documents the caller reloads.
 */

export type ScanOutcome =
  | { status: 'saved'; scan: SavedScan }
  | { status: 'cancelled' }
  /** The in-app camera screen was opened instead (it stores the pages itself). */
  | { status: 'camera' }
  /** Another scan / import is still running. */
  | { status: 'busy' }
  | { status: 'failed' };

interface ScannerContextValue {
  scan: (target?: ScanTarget) => Promise<ScanOutcome>;
  importFromLibrary: (target?: ScanTarget) => Promise<ScanOutcome>;
  busy: boolean;
}

const ScannerContext = createContext<ScannerContextValue | null>(null);

/** Title of a new scan, e.g. "Scan 05.11.2026 14:03". */
export function scanDocumentTitle(
  template: string,
  language: LanguageMode,
  format: (template: string, vars: Record<string, string | number>) => string,
  now: Date = new Date()
): string {
  const locale = language === 'de' ? 'de-DE' : 'en-US';
  return format(template, {
    date: now.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
  });
}

function cameraRoute(target: ScanTarget) {
  const params: Record<string, string> = {};
  if (target.documentId) params.documentId = target.documentId;
  if (target.replacePageId) params.replacePageId = target.replacePageId;
  return { pathname: '/scan' as const, params };
}

/** A running scan older than this while the app UI is usable has failed to present. */
const STUCK_SCAN_MS = 1500;

export const ScannerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colors, typography, borderRadius } = useTheme();
  const { t, language, formatString } = useTranslation();
  // true while a flow is starting (settings / permission) or importing; not while the scanner is shown
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const offerCamera = useCallback(
    (target: ScanTarget) => {
      Alert.alert(t.scan.scannerFailedTitle, t.scan.scannerFailed, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.scan.useInAppCamera, onPress: () => router.push(cameraRoute(target)) },
      ]);
    },
    [t]
  );

  /** Pipeline import + storage with progress overlay; opens new documents. */
  const store = useCallback(
    async (uris: string[], target: ScanTarget, detect: boolean): Promise<ScanOutcome> => {
      busyRef.current = true;
      setBusy(true);
      setProgress(formatString(t.scan.processing, { current: 1, total: uris.length }));
      try {
        const saved = await saveScan({
          ...target,
          uris,
          detect,
          title: scanDocumentTitle(t.scan.documentTitle, language, formatString),
          onProgress: (current, total) => setProgress(formatString(t.scan.processing, { current, total })),
        });
        if (saved.created) router.push({ pathname: '/document/[id]', params: { id: saved.documentId } });
        return { status: 'saved', scan: saved };
      } catch (err) {
        console.error('[Scanner] Saving the scan failed:', err);
        Alert.alert(t.common.error, t.scan.saveFailed);
        return { status: 'failed' };
      } finally {
        busyRef.current = false;
        setBusy(false);
        setProgress(null);
      }
    },
    [t, language, formatString]
  );

  const scan = useCallback(
    async (target: ScanTarget = {}): Promise<ScanOutcome> => {
      if (busyRef.current) return { status: 'busy' };
      if (documentScanner.isScanning) {
        // The scanner covers the whole screen – if the app can be used, its presentation failed.
        if (documentScanner.runningForMs < STUCK_SCAN_MS) return { status: 'busy' };
        offerCamera(target);
        return { status: 'failed' };
      }

      busyRef.current = true;
      let pages: string[] | null;
      try {
        const mode = await authService.getScannerMode();
        if (mode === 'camera' || !documentScanner.isSystemScannerAvailable()) {
          router.push(cameraRoute(target));
          return { status: 'camera' };
        }

        const access = await documentScanner.ensureCameraAccess();
        if (access !== 'granted') {
          Alert.alert(t.scan.cameraPermissionTitle, t.scan.cameraPermissionMessage, [
            { text: t.common.cancel, style: 'cancel' },
            { text: t.scan.openSettings, onPress: () => Linking.openSettings() },
          ]);
          return { status: 'cancelled' };
        }

        const running = documentScanner.scan();
        busyRef.current = false; // double taps now hit documentScanner.isScanning
        pages = await running;
      } catch (err) {
        console.warn('[Scanner] iOS document scanner failed:', err);
        offerCamera(target);
        return { status: 'failed' };
      } finally {
        busyRef.current = false;
      }
      if (!pages) return { status: 'cancelled' };

      // Retake: the scanner may return several pages – all are kept (see saveScan).
      const outcome = await store(pages, target, false);
      if (outcome.status !== 'saved') {
        for (const uri of pages) await storageService.deleteTempFile(uri);
      }
      return outcome;
    },
    [offerCamera, store, t]
  );

  const importFromLibrary = useCallback(
    async (target: ScanTarget = {}): Promise<ScanOutcome> => {
      if (busyRef.current) return { status: 'busy' };
      busyRef.current = true;
      let uris: string[];
      const single = !!target.replacePageId;
      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: !single,
          selectionLimit: single ? 1 : 0,
          orderedSelection: true,
          quality: 1,
          exif: false,
        });
        if (result.canceled || !result.assets?.length) return { status: 'cancelled' };
        uris = result.assets.map((a) => a.uri);
      } catch (err) {
        console.error('[Scanner] Photo library import failed:', err);
        Alert.alert(t.common.error, t.scan.importFailed);
        return { status: 'failed' };
      } finally {
        busyRef.current = false;
      }
      return store(single ? uris.slice(0, 1) : uris, target, true);
    },
    [store, t]
  );

  const value = useMemo(() => ({ scan, importFromLibrary, busy }), [scan, importFromLibrary, busy]);

  return (
    <ScannerContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {progress !== null ? (
          <View style={styles.overlay} accessibilityViewIsModal>
            <View style={[styles.card, { backgroundColor: colors.card, borderRadius: borderRadius.lg }]}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[typography.subhead, styles.text, { color: colors.textPrimary }]}>{progress}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </ScannerContext.Provider>
  );
};

export function useScanner(): ScannerContextValue {
  const ctx = useContext(ScannerContext);
  if (!ctx) throw new Error('useScanner must be used within a ScannerProvider');
  return ctx;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  card: {
    minWidth: 220,
    maxWidth: 300,
    paddingHorizontal: 24,
    paddingVertical: 22,
    alignItems: 'center',
  },
  text: {
    marginTop: 12,
    textAlign: 'center',
  },
});
