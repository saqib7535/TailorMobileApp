# Building the Tailor Shop POS Android APK

This project's web app (`www/`) is complete and fully tested in a browser. This machine has Node.js but **no Java/Android SDK**, so the native Android project must be generated and compiled on a computer with **Android Studio** installed. Everything up to that point is already done for you.

## What's already done

- `www/` — the complete offline-first web app (HTML/CSS/vanilla JS): Login, Dashboard, Customers, Garment Categories + Measurement Fields, Measurements, Orders/Invoices (create, search, detail, status pipeline, payments, delivery + signature capture), Suppliers, Purchases, Inventory, Expenses, Reports, User Management, Settings, and Backup/Restore — fully tested with real seeded data.
- `capacitor.config.json` — app id `com.soothmedia.tailorpos`, app name "Tailor Shop POS", encrypted SQLite enabled.
- `package.json` — declares the Capacitor CLI/core plus 4 plugins:
  - `@capacitor-community/sqlite` (offline encrypted SQLite)
  - `@capacitor/camera`, `@capacitor/filesystem`, `@capacitor/preferences`

The `android/` native project itself is **not yet generated** — that's the one step this environment can't do (needs the Android SDK), so it's the first thing to run on your build machine below.

## One-time setup on your build machine

1. Install **Android Studio** (includes the Android SDK) — https://developer.android.com/studio
2. Install a **JDK 17** (Android Studio bundles one; standalone Temurin 17 also works).
3. Install **Node.js 18+** if this project is being built on a different machine than it was developed on.

## Build steps

```bash
# from the project root
npm install            # installs @capacitor/cli and friends
npx cap add android     # generates the android/ folder (first time only)
npx cap sync android     # re-run this any time you change files under www/
npx cap open android     # opens the android/ folder in Android Studio
```

In Android Studio:

1. Let Gradle finish its initial sync (first time only — downloads Gradle + AGP, needs internet once).
2. **Run ▶** on a device/emulator to test, or
3. **Build → Generate Signed Bundle / APK → APK** to produce a release APK:
   - Create a new keystore (or use an existing one) when prompted — keep the keystore file and passwords safe, you'll need the *same* keystore for every future update to this app.
   - Choose the `release` build variant.
   - The signed APK lands in `android/app/release/app-release.apk`.

After `cap add android`, confirm `AndroidManifest.xml` declares the `CAMERA` permission (needed for the QR/barcode invoice scanner and customer photo capture) and `INTERNET` (Capacitor's default WebView requirement — the app makes no network calls itself; internet is not required to use the app). Capacitor adds these automatically from the plugins listed in `package.json`, but it's worth a quick check the first time.

## If you change the web app later

Any time you edit files under `www/`, re-run:

```bash
npx cap sync android
```

then rebuild in Android Studio. You do **not** need to re-run `cap add android`.

## Notes & platform-specific behavior

- **Offline by design**: no server, no API calls. All data lives in an on-device SQLite database (`@capacitor-community/sqlite`, encrypted).
- **Backup file format differs by platform**: the web/browser build exports a raw `.sqlite` file; the native Android build (via the SQLite plugin's JSON export mode) exports a `.json` dump instead. A backup taken on one platform can only be restored on that same platform — this is explained in the app's Backup screen (More → Backup & Restore).
- **Camera features** (invoice QR/barcode scanner, customer photo capture, shop logo upload) use standard web APIs (`getUserMedia`, `<input type="file" capture>`) that Capacitor's WebView already supports once the `CAMERA` permission is granted at runtime — no extra native plugin code was needed.
- **Printing** (invoices via jsPDF, in Thermal 58mm / Thermal 80mm / A4) opens the generated PDF through the in-app Print Preview, which calls `window.print()` — on Android this hands off to the system Print dialog (Save as PDF, or print over Wi-Fi to a supported printer), fully offline. Report exports use the same jsPDF + autotable path, always at A4.
- **Auto-logout**: configurable in Settings (Admin/Manager view varies — see role matrix below); 0 disables it.
- **Auto-backup**: runs silently at most once per day if enabled in Settings/Backup, on top of the manual "Backup Now" button.
- **App icon/splash**: currently using Capacitor's default icon plus the `capacitor.config.json` splash screen background color (`#0f172a`, matching the login gradient). To brand it, replace the images under `android/app/src/main/res/mipmap-*` and see https://capacitorjs.com/docs/guides/splash-screens-and-icons for the asset-generation tool.

## Role matrix (enforced both at the router level and inside each screen)

| Feature | Admin | Manager | Tailor | Reception |
|---|---|---|---|---|
| Dashboard, Orders, Customers, Measurements | full | full | full | full |
| New Order | yes | yes | no | yes |
| Categories, Suppliers, Purchases, Inventory, Expenses, Reports | full | full | no | no |
| User Management | full | no | no | no |
| Settings (shop/tax/language/theme/license/reset) | full | view-only | no | no |
| Backup & Restore | full | view-only | no | no |

## Product-key licensing (anti-resale)

Every install requires a product key before it will show the login screen — see `www/js/services/licenseService.js`. Keys are Trial (7 days), Monthly (30 days), or Lifetime, and are verified fully offline (no server call). The key format is `TS-<T|M|L><6-char payload>-<8-hex signature>`, e.g. `TS-T7K9QX-4F2A9B1C`.

**To issue a key for a customer**, run this on your own dev machine (never on a customer's device):

```bash
node keygen.js trial            # one 7-day key, e.g. TS-T4G7K2-A1B2C3D4
node keygen.js month 3          # three 30-day keys
node keygen.js lifetime 1 "Al-Farooq Tailors - paid in full"   # one lifetime key with a note
```

Every key generated is printed to the console **and** appended to `product-keys.txt` in the project root, so you always have your own record of who has which key. Neither `keygen.js` nor `product-keys.txt` is ever bundled into the APK (they live outside `www/`, which is the only folder Capacitor syncs) — keep both private.

A logged-in Admin (or Manager, view-only) can also see the current license's plan and days remaining from Settings, and re-activate with a new key from there without needing to reach the initial activation screen.

**Important limitation to know about**: because the app must work with zero internet access, this check runs entirely inside the JS that ships in the APK. A technically determined person could theoretically decompile the APK and find the verification logic. What this system reliably stops is casual copying/resale — every fresh install demands a real key, and trial/monthly keys self-expire even if shared. It is not unbreakable DRM; true tamper-proof licensing would require a server round-trip, which conflicts with the offline requirement.
