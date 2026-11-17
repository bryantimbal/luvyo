# LUVYO on Android: build, install and publish to Google Play

LUVYO ships as a native Android app built with **Capacitor 8**. The web app (the standalone build in
`dist/`) is packaged inside the APK, so it starts instantly, works offline, and uses Android's own
location and camera permissions. Everything below is already set up in this repository:

| Item | Where |
|---|---|
| Android project (Capacitor 8.6, target API 36 / Android 16, min API 24 / Android 7) | `android/` |
| App ID / name | `ph.luvyo.app` / `LUVYO` (`capacitor.config.json`) |
| Icons, adaptive icon, splash screens in LUVYO green | `android/app/src/main/res/` |
| Permissions: internet, location (only when the rider taps), camera (report photos) | `android/app/src/main/AndroidManifest.xml` |
| Release signing that reads a local, uncommitted `keystore.properties` | `android/app/build.gradle` |
| Cloud build: debug APK on every push, plus a signed bundle when secrets exist | `.github/workflows/android.yml` |
| Public privacy policy page (Play requires a URL) | `apps/web/privacy.html` → https://ninjatechph.github.io/luvyo/privacy.html |
| Store graphics | `docs/store/` |

> **Choose your track.** Part A gets the app onto your own phone in minutes. Part D publishes it on
> Google Play. Play publishing needs real (verified) transport data first, because the bundled data
> is test data (see `docs/DATA.md`). Until then, keep the app on Internal or Closed testing.

---

## Part A — Put the app on your phone (fastest)

### A1. Download the APK that GitHub builds for you (no setup)

**Quickest:** on your phone, open
**https://github.com/ninjatechph/luvyo/raw/android-builds/LUVYO-debug.apk**. That's always the newest
build of `main`. Then continue at step 5.

Or, from the Actions page:

1. On GitHub, open **ninjatechph/luvyo → Actions → Android build**.
2. Open the newest run with a green check. Every push to `main` starts one, or press
   **Run workflow** to start one.
3. Under **Artifacts**, download **luvyo-debug-apk** (a zip) and unzip it to get `app-debug.apk`.
4. Get the file onto your phone: email it to yourself, use Google Drive, or open GitHub in the
   phone's browser and download it there.
5. On the phone, tap the APK. Android asks to allow installs from that app (Chrome, Files or Drive):
   allow it, then tap **Install**.
6. Open **LUVYO**. Allow location when asked if you want "Current location" and nearby stops.

> If the Actions tab shows *"Workflows aren't being run on this repository"*, open **Actions** and press
> **I understand my workflows, go ahead and enable them**.

### A2. Or build it on your computer

Do Part B once, then run:

```bash
npm run android:apk
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Install it as in A1,
or plug the phone in and use Part C.

---

## Part B — Set up your computer (one time)

1. **Install Node.js 22 LTS** from nodejs.org.
2. **Install Android Studio** (current stable) from developer.android.com/studio. It includes JDK 21.
3. Open Android Studio → **More Actions → SDK Manager**:
   - **SDK Platforms:** tick **Android 16 (API 36)**.
   - **SDK Tools:** tick **Android SDK Build-Tools**, **Android SDK Platform-Tools** and
     **Android SDK Command-line Tools**.
   - Click **Apply** and **accept the Google SDK licence agreements** when prompted.
4. Set `ANDROID_HOME` to the SDK folder shown at the top of the SDK Manager (macOS:
   `~/Library/Android/sdk`, Windows: `%LOCALAPPDATA%\Android\Sdk`, Linux: `~/Android/Sdk`).
   On macOS/Linux add this to `~/.zshrc` or `~/.bashrc`:

   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   ```

   On Windows, add it under *System Properties → Environment Variables*.
5. Get the code and its dependencies:

   ```bash
   git clone https://github.com/ninjatechph/luvyo.git
   ```

   ```bash
   cd luvyo
   ```

   ```bash
   npm ci
   ```

---

## Part C — Build and run during development

1. Rebuild the web app and copy it into the Android project. Run this after **every** change to
   `apps/web`, `core` or `data`:

   ```bash
   npm run android:sync
   ```

2. Open the project in Android Studio:

   ```bash
   npm run android:open
   ```

   Wait for "Gradle sync" to finish (the first time downloads a few hundred MB).
3. **Run on your phone with a cable:**
   - On the phone: **Settings → About phone → tap "Build number" 7 times** to unlock Developer options,
     then **Settings → System → Developer options → USB debugging: on**.
   - Connect USB, accept the "Allow USB debugging?" prompt, choose the phone in Android Studio's
     device menu and press **Run ▶**.
4. **Or run on an emulator:** Android Studio → **Device Manager → Create device** (for example, Pixel 8,
   API 36) → Run ▶.
5. **Debug the web part:** with the app running, open Chrome on your computer at `chrome://inspect`
   and click **inspect** under LUVYO to get the console, network and elements views.

---

## Part D — Publish on Google Play

### D1. Readiness checklist

- [ ] Replace the development dataset with verified fares, routes and schedules (`docs/DATA.md`), or
      keep the app on Internal/Closed testing only and say clearly in the listing that it is a preview.
- [ ] Put your support email and an effective date in `apps/web/privacy.html`, then publish it:

  ```bash
  npm run deploy:pages
  ```

- [ ] Choose the **store name**. Play allows at most **30 characters**. "LUVYO – Philippine Mobility App"
      is 31, so use for example **LUVYO: PH Mobility App** or **LUVYO – Commute Planner**. The
      launcher name stays **LUVYO**.
- [ ] Confirm the app ID `ph.luvyo.app` is what you want. **It can never change after the first upload.**
      To change it, edit `appId` in `capacitor.config.json` and `applicationId`/`namespace` in
      `android/app/build.gradle` **before** uploading.

### D2. Create a Google Play developer account

1. Go to play.google.com/console and sign up. The fee is **US$25, one time**.
2. Choose **Personal** (you as an individual) or **Organisation** (a registered business, which needs
   a D-U-N-S number). Complete identity verification. This can take a few days.
3. **Personal accounts created after November 2023 must run a closed test** with **at least 12 testers
   who stay opted in for 14 continuous days** before Google lets you apply for production (see D9).
   Start recruiting testers early.

### D3. Create your upload key (once, and keep it safe)

Google Play App Signing holds the real app-signing key. You sign uploads with your own **upload key**.

1. Create the key. `keytool` comes with Android Studio's JDK; on Windows use the full path, e.g.
   `"C:\Program Files\Android\Android Studio\jbr\bin\keytool"`:

   ```bash
   keytool -genkeypair -v -keystore luvyo-upload.jks -alias luvyo-upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Answer the prompts and choose strong passwords.
2. **Move `luvyo-upload.jks` somewhere outside the repository and back it up** (password manager or
   encrypted drive). If you lose it, Google can reset the upload key, but it takes time.
3. Create `android/keystore.properties`. It is already git-ignored, so never commit it:

   ```properties
   storeFile=/full/path/to/luvyo-upload.jks
   storePassword=YOUR_STORE_PASSWORD
   keyAlias=luvyo-upload
   keyPassword=YOUR_KEY_PASSWORD
   ```

### D4. Set the version

In `android/app/build.gradle`:

```gradle
versionCode 1        // whole number; must INCREASE with every upload (2, 3, 4…)
versionName "0.1.0"  // what users see
```

### D5. Build the signed release bundle (.aab)

```bash
npm run android:bundle
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`.
(Equivalent in Android Studio: **Build → Generate Signed App Bundle / APK → Android App Bundle**.)

### D6. Create the app in Play Console

**Create app**, then:
- **App name:** your ≤30-character store name.
- **Default language:** English (United States) – en-US. Add Filipino (fil) later as a translation.
- **App or game:** App. **Free or paid:** Free.
- Accept the declarations.

### D7. Complete "App content" (Policy → App content)

| Section | What to enter for LUVYO |
|---|---|
| Privacy policy | `https://ninjatechph.github.io/luvyo/privacy.html` |
| Ads | No, the app doesn't contain ads |
| App access | All functionality is available without special access (no login needed) |
| Content rating | Fill in the questionnaire: Reference/Utility, no violence or gambling. Users can share content (community reports) → Yes; mention moderation. Expected: Everyone / PEGI 3 |
| Target audience | 13+ (not designed for children) |
| News app | No |
| Data safety | See the table below |
| Government app | No (LUVYO is not affiliated with DOTr/LTFRB/MMDA) |
| Financial features | None |
| Health | None |

**Data safety form** (matches the current app):

| Data type | Collected? | Shared? | Notes |
|---|---|---|---|
| Location – approximate & precise | Yes, optional | No | Only when the user taps a location feature; used for app functionality |
| Photos | Yes, optional | No | Only if attached to a community report |
| User IDs | Yes | No | Pseudonymous device/contributor ID for community reports |
| App interactions | Yes | No | Aggregated search counts for analytics |
| Encrypted in transit | Yes | | |
| Users can request deletion | Yes | | In-app: Profile → Delete my account & data |

> In the current standalone build, rider data stays on the phone and nothing is sent to a server. When
> you connect the app to the LUVYO server, the answers above apply; update the form if you add
> analytics or crash-reporting SDKs.

Location uses **foreground only**, so no background-location declaration is needed.

### D8. Store listing (Grow → Store presence → Main store listing)

- **Short description (≤80):** Compare jeep, bus, MRT/LRT, tricycle & ride-hailing fares and times.
- **Full description:** use the text in `docs/PLAYSTORE.md`.
- **App icon:** `docs/store/app-icon-512.png` (512×512).
- **Feature graphic:** `docs/store/feature-graphic-1024x500.png`.
- **Phone screenshots:** 2–8 images, portrait 9:16 (for example 1080×1920). Take them on your phone
  (power + volume down) or in the emulator. Don't use screenshots that show "DEV DATA" for production.
- **Category:** Maps & Navigation. **Tags:** Navigation, Transit, Travel.
- **Contact details:** a support email is required; a website is optional (the GitHub Pages link).
- **Translations → Add → Filipino:** a Filipino title and descriptions (optional, recommended).

### D9. Testing tracks

1. **Internal testing** (fastest, up to 100 testers, available within minutes):
   **Testing → Internal testing → Create new release → upload `app-release.aab`** → release name
   `0.1.0 (1)` → save, review, roll out. Add testers' Google accounts under **Testers** and share the
   opt-in link.
2. **Closed testing** (required for new personal accounts before production):
   **Testing → Closed testing → Create track** → upload the same or a newer bundle → add **at least
   12 testers** (email list or Google Group) → roll out. Keep **12+ testers opted in for 14 days**.
3. Then go to **Dashboard → Apply for production** and answer Google's questions about your test.

### D10. Release to production

**Production → Create new release → add the bundle → release notes (en-US, and fil if you added
it) → Review release → Start rollout.** Start with a staged rollout (for example 20%). Google's review
typically takes from a few hours to several days for new apps.

### D11. Ship an update

1. Make your changes, then raise `versionCode` (and `versionName`) in `android/app/build.gradle`.
2. Build the new bundle:

   ```bash
   npm run android:bundle
   ```

3. Play Console → the track you use → **Create new release** → upload → roll out.

---

## Part E — Signed Play bundles from GitHub Actions (optional)

To let the cloud build produce `app-release.aab` too, add these **repository secrets**
(**Settings → Secrets and variables → Actions → New repository secret**):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | The keystore file, base64-encoded (see below) |
| `ANDROID_KEYSTORE_PASSWORD` | Store password |
| `ANDROID_KEY_ALIAS` | `luvyo-upload` |
| `ANDROID_KEY_PASSWORD` | Key password |

On macOS/Linux, copy the base64 text to your clipboard with:

```bash
base64 -i luvyo-upload.jks | pbcopy
```

On Windows PowerShell, use:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("luvyo-upload.jks")) | Set-Clipboard
```

Each run then also uploads a **luvyo-release-aab** artifact, ready for Play Console.

---

## Part F — Alternative: a Trusted Web Activity (Bubblewrap)

A TWA is a thin Android shell around the hosted website. Updates go live without a Play upload, but it
needs internet on first launch and **Digital Asset Links at the root of the domain**. The site at
`ninjatechph.github.io/luvyo/` sits in a sub-folder, so a TWA would also need one of:
- a repository named **`ninjatechph.github.io`** that serves `/.well-known/assetlinks.json`, or
- a **custom domain** for the site (for example `luvyo.ph`), with `/.well-known/assetlinks.json` on it.

Steps, if you choose this route:
1. Install the Bubblewrap CLI:

   ```bash
   npm i -g @bubblewrap/cli
   ```

2. Generate the Android project from the web manifest:

   ```bash
   bubblewrap init --manifest https://YOUR-DOMAIN/manifest.webmanifest
   ```

3. Build the app (it asks for or creates the signing key):

   ```bash
   bubblewrap build
   ```

4. Publish the generated `assetlinks.json` (with your **Play App Signing** SHA-256 from Play Console →
   Setup → App signing) at `https://YOUR-DOMAIN/.well-known/assetlinks.json`.
5. Upload `app-release-bundle.aab` to Play as in Part D.

We recommend staying on **Capacitor** (Parts A–E) because it works offline from first launch, needs no
domain set-up, and leaves room for native features (push notifications, background ride recording).

---

## Part G — Moving from the demo to the live service

The Android app currently runs the **standalone** build: engines and demo data inside the app, rider
data on the phone. When the LUVYO server is hosted (HTTPS) with Supabase sign-in:
1. Add an API base-URL setting to `apps/web/lib/api.js` and `lib/community.js` so they call
   `https://api.your-domain/…` instead of the in-app stand-in. This setting isn't built yet.
2. Build the Android app without `lib/standalone.js` (a server-mode variant of
   `scripts/build-static.mjs`).
3. Update the Data safety form: community reports, accounts and analytics are then stored on your
   servers.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `SDK location not found` | Set `ANDROID_HOME`, or create `android/local.properties` with `sdk.dir=/path/to/Android/sdk` |
| `Unsupported class file major version` / Java errors | Use JDK 21: Android Studio → Settings → Build Tools → Gradle → Gradle JDK = 21 |
| Licences not accepted | Android Studio → SDK Manager → install API 36 and accept the agreements |
| App opens to a blank screen | Run `npm run android:sync` (the web build wasn't copied), then rebuild |
| Location never asks / doesn't work | Phone Settings → Apps → LUVYO → Permissions → Location → "Allow only while using the app" |
| Play: "signed in debug mode" | Upload the bundle from `npm run android:bundle` with `keystore.properties` in place |
| Play: "Version code 1 has already been used" | Increase `versionCode` |
| Play: target API level error | This project targets API 36. If Play later raises the requirement, update Capacitor, which bumps `android/variables.gradle` |
| "App not installed" when sideloading | Uninstall the older copy first (debug and release builds use different signatures) |
