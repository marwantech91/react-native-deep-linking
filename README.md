# React Native Deep Linking

![React Native](https://img.shields.io/badge/React_Native-0.72-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

Universal links and deep linking handler for React Native. Parse URLs, navigate to screens, and handle deferred deep links.

## Features

- **Universal Links** - iOS AASA support
- **App Links** - Android assetlinks.json
- **Custom Schemes** - `myapp://` URLs
- **Route Matching** - Pattern-based routing
- **Deferred Links** - Handle links after install
- **React Navigation** - Built-in integration

## Installation

```bash
npm install @marwantech/react-native-deep-linking
```

## Quick Start

```typescript
import { DeepLinkRouter } from '@marwantech/react-native-deep-linking';

const router = new DeepLinkRouter({
  schemes: ['myapp', 'https'],
  hosts: ['myapp.com', 'www.myapp.com'],
});

// Define routes
router.register('/product/:id', (params) => {
  navigation.navigate('Product', { id: params.id });
});

router.register('/user/:userId/posts/:postId', (params) => {
  navigation.navigate('Post', {
    userId: params.userId,
    postId: params.postId,
  });
});

// Handle incoming URL
router.handle('myapp://product/123');
// -> Navigates to Product screen with id: '123'
```

## Route Patterns

```typescript
// Static routes
router.register('/home', () => navigate('Home'));
router.register('/settings/privacy', () => navigate('Privacy'));

// Dynamic parameters
router.register('/product/:id', ({ id }) => navigate('Product', { id }));

// Multiple parameters
router.register('/category/:cat/product/:id', ({ cat, id }) => {
  navigate('Product', { category: cat, productId: id });
});

// Optional parameters
router.register('/search/:query?', ({ query }) => {
  navigate('Search', { query: query || '' });
});

// Wildcard (catch-all)
router.register('/blog/*', (params, url) => {
  navigate('Blog', { path: url.pathname });
});

// Query parameters
// URL: /search?q=shoes&sort=price
router.register('/search', (params, url) => {
  navigate('Search', {
    query: url.searchParams.get('q'),
    sort: url.searchParams.get('sort'),
  });
});
```

## React Navigation Integration

```typescript
import { NavigationContainer } from '@react-navigation/native';
import { useDeepLinking } from '@marwantech/react-native-deep-linking';

const linking = {
  prefixes: ['myapp://', 'https://myapp.com'],
  config: {
    screens: {
      Home: '',
      Product: 'product/:id',
      Category: 'category/:name',
      Profile: 'user/:userId',
      Settings: 'settings',
    },
  },
};

function App() {
  return (
    <NavigationContainer linking={linking}>
      <AppNavigator />
    </NavigationContainer>
  );
}
```

## Advanced Usage

### With Authentication

```typescript
const router = new DeepLinkRouter();

router.register('/account/settings', async (params, url, context) => {
  if (!context.isAuthenticated) {
    // Save deep link for after login
    await storage.set('pending_deep_link', url.href);
    navigate('Login');
    return;
  }
  navigate('AccountSettings');
});

// After login, check for pending link
async function onLoginSuccess() {
  const pendingLink = await storage.get('pending_deep_link');
  if (pendingLink) {
    await storage.remove('pending_deep_link');
    router.handle(pendingLink);
  }
}
```

### Deferred Deep Links

Handle links that opened the app store (for new installs):

```typescript
import { DeferredDeepLink } from '@marwantech/react-native-deep-linking';

const deferred = new DeferredDeepLink({
  // Check your attribution service
  checkAttribution: async () => {
    const data = await Attribution.getData();
    return data?.deepLink;
  },
});

// On app first launch
async function onFirstLaunch() {
  const deferredLink = await deferred.check();
  if (deferredLink) {
    router.handle(deferredLink);
  }
}
```

### URL Validation

```typescript
const router = new DeepLinkRouter({
  schemes: ['myapp', 'https'],
  hosts: ['myapp.com'],
  validate: (url) => {
    // Custom validation
    if (url.pathname.includes('admin')) {
      return false; // Block admin routes
    }
    return true;
  },
});
```

## React Hook

```typescript
import { useDeepLink } from '@marwantech/react-native-deep-linking';

function App() {
  const { initialUrl, latestUrl } = useDeepLink();

  useEffect(() => {
    if (latestUrl) {
      console.log('App opened with:', latestUrl);
      handleDeepLink(latestUrl);
    }
  }, [latestUrl]);

  return <AppContent />;
}
```

### useDeepLinkHandler

```typescript
import { useDeepLinkHandler } from '@marwantech/react-native-deep-linking';

function ProductScreen() {
  // Handle links while on this screen
  useDeepLinkHandler('/product/:id', (params) => {
    // Refresh product data
    loadProduct(params.id);
  });

  return <ProductView />;
}
```

## Platform Setup

### iOS - Universal Links

1. Add Associated Domains capability:
```
applinks:myapp.com
```

2. Host `apple-app-site-association` at `https://myapp.com/.well-known/`:
```json
{
  "applinks": {
    "apps": [],
    "details": [{
      "appID": "TEAMID.com.myapp",
      "paths": ["*"]
    }]
  }
}
```

### Android - App Links

1. Add intent filter in `AndroidManifest.xml`:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="myapp.com" />
</intent-filter>
```

2. Host `assetlinks.json` at `https://myapp.com/.well-known/`:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.myapp",
    "sha256_cert_fingerprints": ["..."]
  }
}]
```

### Custom URL Scheme

**iOS** - Add to `Info.plist`:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>myapp</string>
    </array>
  </dict>
</array>
```

**Android** - Add to `AndroidManifest.xml`:
```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="myapp" />
</intent-filter>
```

## Testing

```bash
# iOS Simulator
xcrun simctl openurl booted "myapp://product/123"

# Android Emulator
adb shell am start -a android.intent.action.VIEW -d "myapp://product/123"

# Universal link (iOS)
xcrun simctl openurl booted "https://myapp.com/product/123"
```

## API Reference

```typescript
interface DeepLinkRouterOptions {
  schemes?: string[];           // ['myapp', 'https']
  hosts?: string[];            // ['myapp.com']
  validate?: (url: URL) => boolean;
  onNoMatch?: (url: URL) => void;
  onError?: (error: Error) => void;
}

interface RouteParams {
  [key: string]: string;
}

type RouteHandler = (
  params: RouteParams,
  url: URL,
  context?: Record<string, unknown>
) => void | Promise<void>;
```

## License

MIT
