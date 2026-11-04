import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { FilterType } from '../types';
import { storageService } from './StorageService';

export class FilterService {
  /**
   * Rotates an image by 90 degrees clockwise and saves the new file
   */
  async rotateImage(uri: string): Promise<string> {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ rotate: 90 }],
      { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
    );
    return storageService.saveImage(result.uri, 'rotated');
  }

  /**
   * Generates HTML with canvas script for headless image filter processing
   */
  getProcessorHtml(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;background:transparent;">
        <canvas id="canvas" style="display:none;"></canvas>
        <script>
          window.processImage = function(id, base64Data, filterType) {
            var img = new Image();
            img.onload = function() {
              var canvas = document.getElementById('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              var ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);

              if (filterType === 'original') {
                var out = canvas.toDataURL('image/jpeg', 0.92);
                window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, dataUrl: out }));
                return;
              }

              var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              var d = imgData.data;
              var len = d.length;

              if (filterType === 'grayscale') {
                for (var i = 0; i < len; i += 4) {
                  var g = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
                  d[i] = g;
                  d[i+1] = g;
                  d[i+2] = g;
                }
              } else if (filterType === 'blackAndWhite') {
                for (var i = 0; i < len; i += 4) {
                  var g = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
                  // High contrast threshold binarization
                  var v = g > 138 ? 255 : 0;
                  d[i] = v;
                  d[i+1] = v;
                  d[i+2] = v;
                }
              } else if (filterType === 'auto') {
                // Auto contrast stretching + slight brightness
                for (var i = 0; i < len; i += 4) {
                  var r = d[i], g = d[i+1], b = d[i+2];
                  // Contrast stretch
                  d[i] = Math.min(255, Math.max(0, (r - 128) * 1.35 + 138));
                  d[i+1] = Math.min(255, Math.max(0, (g - 128) * 1.35 + 138));
                  d[i+2] = Math.min(255, Math.max(0, (b - 128) * 1.35 + 138));
                }
              } else if (filterType === 'magicColor') {
                // CamScanner Magic Color: brighten background, saturate colors, sharpen dark text
                for (var i = 0; i < len; i += 4) {
                  var r = d[i], g = d[i+1], b = d[i+2];
                  var lum = 0.299 * r + 0.587 * g + 0.114 * b;
                  
                  if (lum > 160) {
                    // Brighten light areas (paper background)
                    d[i] = Math.min(255, r * 1.15 + 15);
                    d[i+1] = Math.min(255, g * 1.15 + 15);
                    d[i+2] = Math.min(255, b * 1.15 + 15);
                  } else {
                    // Darken text and boost saturation
                    d[i] = Math.max(0, r * 0.85);
                    d[i+1] = Math.max(0, g * 0.85);
                    d[i+2] = Math.max(0, b * 0.85);
                  }
                }
              }

              ctx.putImageData(imgData, 0, 0);
              var resultDataUrl = canvas.toDataURL('image/jpeg', 0.92);
              window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, dataUrl: resultDataUrl }));
            };
            img.onerror = function(err) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, error: 'Image failed to load' }));
            };
            img.src = base64Data;
          };
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Saves a base64 DataURL as a JPEG file in the scanflow storage directory
   */
  async saveBase64Image(dataUrl: string, prefix: string = 'filter'): Promise<string> {
    await storageService.initStorageDirectory();
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
    const targetUri = `${FileSystem.documentDirectory}scanflow/${filename}`;

    await FileSystem.writeAsStringAsync(targetUri, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return targetUri;
  }
}

export const filterService = new FilterService();
