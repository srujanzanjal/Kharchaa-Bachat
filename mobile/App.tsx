import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
  BackHandler,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { WEB_APP_URL, isInternalUrl } from './src/config';

// Keep splash screen visible until the initial WebView load resolves
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Handle Android hardware/software back button
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );
    return () => backSubscription.remove();
  }, [canGoBack]);

  // Hide splash screen on initial load completion or error
  const handleLoadEnd = useCallback(() => {
    setIsLoading(false);
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    webViewRef.current?.reload();
  }, []);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
  }, []);

  // Filter navigation: internal app routes remain in WebView; external links open natively
  const handleShouldStartLoad = useCallback((request: { url: string }) => {
    const url = request.url;
    if (isInternalUrl(url)) {
      return true;
    }

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        }
      })
      .catch((err) => {
        console.warn('Unable to open external link:', url, err);
      });
    return false;
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style="light" />

        {/* Primary Web UI Container */}
        <WebView
          ref={webViewRef}
          source={{ uri: WEB_APP_URL }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          allowsBackForwardNavigationGestures={true}
          pullToRefreshEnabled={true}
          bounces={false}
          keyboardDisplayRequiresUserAction={false}
          allowsInlineMediaPlayback={true}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onLoadEnd={handleLoadEnd}
          onError={handleError}
          onHttpError={(syntheticEvent) => {
            const { statusCode } = syntheticEvent.nativeEvent;
            if (statusCode >= 500) {
              handleError();
            }
          }}
        />

        {/* Minimal Initial Branded Loading Indicator */}
        {isLoading && !hasError && (
          <View style={styles.loadingOverlay}>
            <Text style={styles.brandTitle}>Kharchaa Bachat</Text>
            <ActivityIndicator size="small" color="#F59E0B" style={styles.spinner} />
            <Text style={styles.loadingSubtitle}>Loading…</Text>
          </View>
        )}

        {/* Native Network / Offline Error State */}
        {hasError && (
          <View style={styles.errorContainer}>
            <Text style={styles.brandBadge}>Kharchaa Bachat</Text>
            <Text style={styles.errorHeading}>{"Couldn't connect"}</Text>
            <Text style={styles.errorDescription}>
              Please check your internet connection and try again.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              activeOpacity={0.8}
              onPress={handleRetry}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#131211',
  },
  webView: {
    flex: 1,
    backgroundColor: '#131211',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#131211',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  brandTitle: {
    color: '#F3F1ED',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  spinner: {
    marginTop: 18,
    marginBottom: 10,
  },
  loadingSubtitle: {
    color: '#A8A29E',
    fontSize: 14,
    letterSpacing: -0.2,
  },
  errorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#131211',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    zIndex: 20,
  },
  brandBadge: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  errorHeading: {
    color: '#F3F1ED',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorDescription: {
    color: '#A8A29E',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 290,
  },
  retryButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 24,
  },
  retryButtonText: {
    color: '#131211',
    fontSize: 15,
    fontWeight: '700',
  },
});
