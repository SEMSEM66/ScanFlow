import React, { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme';
import { SHEET_CLOSE_BEZIER, SHEET_SKIRT, SHEET_SPRING, SheetMachine, type SheetDriver } from './sheetMotion';

const closeEasing = Easing.bezier(SHEET_CLOSE_BEZIER[0], SHEET_CLOSE_BEZIER[1], SHEET_CLOSE_BEZIER[2], SHEET_CLOSE_BEZIER[3]);

interface BottomSheetProps {
  visible: boolean;
  /** The user wants to close the sheet (backdrop tap, pull-down). Set `visible` to false. */
  onClose: () => void;
  /**
   * The sheet and its modal are completely gone. Open the next modal, picker,
   * share sheet or scanner only from here (iOS shows one presentation at a time).
   */
  onDismiss?: () => void;
  /** False → backdrop tap and pull-down do nothing (e.g. while a file is created). Default true. */
  dismissible?: boolean;
  /** Where a pull-down may start: anywhere (default) or only on the handle / title ('top' – sheets with sliders or lists). */
  dragArea?: 'full' | 'top';
  /** Darkness of the backdrop when open (0–1). Default 0.45. */
  dim?: number;
  /** Corner radius at the top. Default `borderRadius.xl`. */
  radius?: number;
  /** Extra style of the sheet (e.g. padding). */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * iOS-style bottom sheet: the backdrop fades in while the sheet glides up
 * with a soft spring; tap the backdrop or pull the sheet down to close it.
 * The sheet keeps its content while it glides out. Motion and state:
 * `sheetMotion.ts` (unit-tested). Uses only React Native's `Animated`
 * (native driver) and `PanResponder` – runs in Expo Go.
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({
  visible,
  onClose,
  onDismiss,
  dismissible = true,
  dragArea = 'full',
  dim = 0.45,
  radius,
  style,
  children,
}) => {
  const { colors, borderRadius } = useTheme();
  // The modal stays presented while the sheet glides out (`visible` is already false then)
  const [presented, setPresented] = useState(visible);
  const [layout, setLayout] = useState<{ height: number; seq: number } | null>(null);
  const [windowHeight] = useState(() => Dimensions.get('window').height);
  // Offset of the sheet below its open position (0 = open); parked below the window while hidden
  const [offset] = useState(() => new Animated.Value(windowHeight));
  const [machine] = useState(() => {
    const driver: SheetDriver = {
      set: (value) => offset.setValue(value),
      animate: (to, animation, done) => {
        const anim =
          animation.type === 'spring'
            ? Animated.spring(offset, {
                toValue: to,
                ...SHEET_SPRING,
                velocity: animation.velocity * 1000, // pt/ms → pt/s
                useNativeDriver: true,
              })
            : Animated.timing(offset, {
                toValue: to,
                duration: animation.duration,
                easing: closeEasing,
                useNativeDriver: true,
              });
        anim.start(({ finished }) => done(finished));
      },
      stop: () => offset.stopAnimation(),
      present: setPresented,
    };
    return new SheetMachine(driver, windowHeight);
  });
  const [pan] = useState(() =>
    PanResponder.create({
      // Never on touch start: taps go to the buttons; a clear vertical movement takes over
      onMoveShouldSetPanResponder: (_e, g) => machine.wantsDrag(g.dx, g.dy, g.moveY - g.dy),
      onPanResponderGrant: () => machine.dragStart(),
      onPanResponderMove: (_e, g) => machine.dragMove(g.dy),
      onPanResponderRelease: (_e, g) => machine.dragEnd(g.dy, g.vy),
      onPanResponderTerminate: () => machine.dragCancel(),
      onPanResponderTerminationRequest: () => false,
    })
  );

  // Latest callbacks and options (they change with every render of the screen)
  useEffect(() => {
    machine.configure({ onClose, onDismiss, dismissible, dragArea });
  });

  useEffect(() => {
    machine.setVisible(visible);
  }, [machine, visible]);

  // Hand the height over only after the backdrop range below has been updated with it
  useEffect(() => {
    if (layout) machine.layoutSheet(layout.height);
  }, [machine, layout]);

  useEffect(() => () => machine.dispose(), [machine]);

  // Backdrop darkness follows the sheet: hidden = 0, open = dim (also while it is pulled)
  const fadeRange = Math.max(1, layout?.height ?? windowHeight);
  const backdropOpacity = useMemo(
    () => offset.interpolate({ inputRange: [0, fadeRange], outputRange: [dim, 0], extrapolate: 'clamp' }),
    [offset, fadeRange, dim]
  );

  const onSheetLayout = (e: LayoutChangeEvent) => {
    const height = e.nativeEvent.layout.height;
    setLayout((prev) => ({ height, seq: (prev?.seq ?? 0) + 1 }));
  };

  const cornerRadius = radius ?? borderRadius.xl;

  return (
    <Modal
      visible={visible || presented}
      transparent
      animationType="none"
      onRequestClose={() => machine.userClose()}
      onDismiss={() => machine.nativeDismissed()}
    >
      <View style={styles.root} onLayout={(e) => machine.layoutRoot(e.nativeEvent.layout.height)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => machine.userClose()} accessible={false}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]} />
        </Pressable>
        <Animated.View
          {...pan.panHandlers}
          onLayout={onSheetLayout}
          pointerEvents={visible ? 'auto' : 'none'}
          accessibilityViewIsModal
          onAccessibilityEscape={() => machine.userClose()}
          style={[
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: cornerRadius,
              borderTopRightRadius: cornerRadius,
            },
            style,
            { transform: [{ translateY: offset }] },
          ]}
        >
          {children}
          <View pointerEvents="none" style={[styles.skirt, { backgroundColor: colors.surface }]} />
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: '#000000',
  },
  skirt: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    height: SHEET_SKIRT,
  },
});
