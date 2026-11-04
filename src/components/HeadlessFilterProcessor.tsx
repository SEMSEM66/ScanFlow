import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { filterService } from '../services/FilterService';
import { FilterType } from '../types';

export interface FilterProcessorHandle {
  applyFilter: (imageUri: string, filterType: FilterType) => Promise<string>;
}

export const HeadlessFilterProcessor = forwardRef<FilterProcessorHandle>((_, ref) => {
  const webViewRef = useRef<any>(null);
  const pendingRequests = useRef<
    Map<string, { resolve: (val: string) => void; reject: (err: any) => void }>
  >(new Map());

  useImperativeHandle(ref, () => ({
    applyFilter: async (imageUri: string, filterType: FilterType): Promise<string> => {
      if (filterType === 'original') {
        return imageUri;
      }

      const id = 'req_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();

      // Read image as base64
      const base64Data = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const mimeType = imageUri.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const fullDataUrl = `data:${mimeType};base64,${base64Data}`;

      return new Promise<string>((resolve, reject) => {
        pendingRequests.current.set(id, { resolve, reject });

        const script = `
          if (window.processImage) {
            window.processImage('${id}', '${fullDataUrl}', '${filterType}');
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({ id: '${id}', error: 'Processor not ready' }));
          }
          true;
        `;
        webViewRef.current?.injectJavaScript(script);
      });
    },
  }));

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      const req = pendingRequests.current.get(data.id);
      if (!req) return;

      pendingRequests.current.delete(data.id);

      if (data.error) {
        req.reject(new Error(data.error));
      } else if (data.dataUrl) {
        const savedFileUri = await filterService.saveBase64Image(data.dataUrl, 'filter');
        req.resolve(savedFileUri);
      }
    } catch (err) {
      console.error('[HeadlessFilterProcessor] Error parsing message:', err);
    }
  };

  const WebViewComp = WebView as any;

  return (
    <View style={styles.hiddenContainer} pointerEvents="none">
      <WebViewComp
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: filterService.getProcessorHtml() }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        style={styles.webView}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  hiddenContainer: {
    width: 1,
    height: 1,
    position: 'absolute',
    top: -100,
    left: -100,
    opacity: 0,
  },
  webView: {
    width: 1,
    height: 1,
  },
});
