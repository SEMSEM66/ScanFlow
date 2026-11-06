import React from 'react';
import NativeSegmentedControl, { type SegmentedControlProps } from '@react-native-segmented-control/segmented-control';

// The package's legacy class declaration intersects NativeMethods with React.Component,
// which TS 6 / React 19 does not accept as a JSX class. Its documented props still apply.
const SegmentedControl = NativeSegmentedControl as unknown as React.ComponentType<SegmentedControlProps>;
export { SegmentedControl };
