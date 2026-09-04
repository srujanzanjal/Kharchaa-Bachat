# Kharchaa Bachat — Mobile Shell (Expo / React Native)

A lightweight, production-ready Expo mobile shell for **Kharchaa Bachat** that wraps the deployed Next.js web application inside an optimized native `WebView`.

---

## Architecture Overview

```text
                    ┌─────────────────────────┐
                    │     iPhone / Android    │
                    │                         │
                    │   Expo Mobile Shell     │
                    │   (react-native-webview)│
                    └────────────┬────────────┘
                                 │ HTTPS
                                 ▼
                    ┌─────────────────────────┐
                    │      Vercel / Web       │
                    │  https://kharchaa-bachat│
                    │       .vercel.app       │
                    └────────────┬────────────┘
                                 │ Server Actions
                                 ▼
                    ┌─────────────────────────┐
                    │   PostgreSQL / Supabase │
                    └─────────────────────────┘
```

- **Single Source of Truth**: The Next.js web application remains the exclusive source of truth for UI, UX, financial logic, ledger calculations, and backend database transactions.
- **Zero Native Screen Duplication**: All pages (Home, Add Expense, History, Recap, Earn, Settings, Secret Mode, Developer Mode) render seamlessly inside the mobile WebView.
- **Strict Credential Isolation**: The mobile shell contains **NO** database URLs, PostgreSQL credentials, Supabase service role keys, or secrets. It communicates strictly over public HTTPS.

---

## Getting Started

### 1. Prerequisites
- Node.js 20+
- npm (or yarn / pnpm)
- Expo Go on iOS/Android device, or configured iOS Simulator / Android Emulator

### 2. Install Dependencies
```bash
cd mobile
npm install
```

### 3. Start Expo Development Server
```bash
npx expo start
```

### 4. Run on Android
```bash
# In Expo development environment or connected emulator/device:
npx expo start --android
# Or for direct native prebuild / run:
npx expo run:android
```

### 5. Run on iOS (macOS required)
```bash
# In Expo development environment or iOS Simulator:
npx expo start --ios
# Or for direct native prebuild / run:
npx expo run:ios
```

---

## Configuration

The web application URL is centralized in [`src/config.ts`](./src/config.ts):

```typescript
export const PRODUCTION_WEB_APP_URL = "https://kharchaa-bachat.vercel.app/";
```

- **Production Target**: Defaults to `https://kharchaa-bachat.vercel.app/`.
- **Staging / Local Testing**: Can be overridden at runtime using the `EXPO_PUBLIC_WEB_APP_URL` environment variable without code changes.

---

## Mobile Shell Features

- **Safe Areas & Status Bar**: Native status bar and safe area edge handling prevents content collisions with notches, Dynamic Island, and home indicators.
- **Branded Splash & Loading State**: Seamless `#131211` dark background and branded indicator during initialization.
- **Offline / Network Error State**: If connection is lost or the server cannot be reached, displays a native offline card with a "Try Again" reload action.
- **Android Back Button**: Automatically navigates WebView browser history (`webView.goBack()`) before allowing app exit.
- **External Link Handling**: Safely delegates foreign domains and links to system browser or native handlers.
- **EAS Build Ready**: Configured in `eas.json` for internal distribution, APK generation, and App Store / Play Store bundles.

---

## Security Policy

> [!CAUTION]
> **NEVER** put database URLs (`DATABASE_URL`), Supabase service role keys, PostgreSQL credentials, or server-side API secrets into this `mobile/` directory, `app.json`, or environment variables. All ledger operations and financial logic must execute on the Next.js server.
