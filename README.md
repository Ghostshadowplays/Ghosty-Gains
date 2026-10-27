# Ghosty Gains

**Ghosty Gains** is a comprehensive, privacy-first bodybuilding, nutrition, and physique coaching application for Android. Designed to maximize training efficiency, progressive overload, and physical well-being, it delivers smart routine guidance, real-time macro tracking, hardware-integrated activity monitoring, and on-device computer vision physique analysis.

---

## Key Features

### Today & Weekly Review
- **Today overview**: Opens with today's routine, working sets logged, calorie/protein/water/step progress and shortcuts to add food, water, weight and sleep.
- **Weekly review**: Combines training days, working sets, average logged protein, steps, sleep and bodyweight. Weight change compares two seven-day averages; missing days are not treated as zero.
- **Simpler navigation**: Five consistent outline icons, larger tap targets and text, visible keyboard focus, reduced-motion support and pinch zoom in both the browser and Android. Workout settings expand below the routine. Nutrition's Add Food button opens the food choices.

### 🏋️ Training & Workout Splits
- **Tailored Training Splits**: Structured routines designed for muscle hypertrophy, joint health, and safe progression across various fitness levels and equipment access (Gym, Dumbbells/Home, Bodyweight).
- **Interactive Muscle Focus Picker**: Visual SVG-based body map to target specific muscle groups and receive recommended exercises, form cues, and sets.
- **Built-in Rest Timer & Custom Exercise Logging**: Configurable rest interval timer, form cue logging, and weekly completion tracking.
- **Set-by-set training journal**: Start/resume/finish a dated workout; log actual weight in kg or lb, reps and optional RPE for each working set. Edit today's sets without duplicating them, compare the previous session, reuse its values, and review recent workouts. Bodyweight sets use 0 added weight. Existing weekly exercise checks and historical completion records remain saved.
- **Progression & records**: Each exercise shows its best load/reps and previous working sets. Suggestions build reps within the prescribed range before suggesting the smallest available load increase; incomplete sets or reported RPE above 8 hold the load steady. Timed and distance exercises retain their existing completion controls.
- **RPE Workout Intensity**: A 1–10 slider adjusts exercise count, working sets, reps in reserve and rest. RPE 6 gives 5 exercises with 4 sets, RPE 7–8 gives 3–4 exercises with 3 sets, and RPE 9–10 gives 2–3 exercises with 2 sets. Training style presets choose a starting RPE; the slider remains adjustable. RPE 1–5 uses 5 exercises, 4 easy sets and longer rests. Recovery days stay as recovery days.
- **Personal Supplement Checklist**: Goals & Logs → Supps lets users choose from Vitamin D3, Creatine, Protein Powder, Omega-3, Multivitamins, Beta-Alanine and Electrolytes. Choices stay saved; separate Taken today checks reset daily. The plan guide explains conditional options for the active goal, training style and RPE without automatically selecting products. It accounts for age, pregnancy/postpartum, heart/blood pressure context and UK vitamin D season; dietary gaps remain conditional. Existing checked supplements and custom backup entries are preserved on upgrade.

### 🥗 Nutrition & Macro Optimization
- **Dual Mode Nutrition Tracking**:
  - **Simple Mode (Auto-Pilot)**: Automated balanced meal suggestions and 30-day rotation plans matched to target calories and macros.
  - **Pro Mode**: Granular logging by meal slot (Breakfast, Lunch, Dinner, Snacks) with custom food creations and UK takeaway estimates.
  - Switch between Simple and Pro at any time, including after opening history or future meal plans. The selected mode is saved and switching keeps the selected date and existing entries.
- **Barcode Scanner**: Fast nutrition lookup powered by Google Code Scanner / ML Kit and Open Food Facts.
- **Hydration Tracker & Shopping List**: Fluid intake logger and monthly grocery aggregation.
- **Custom Meal Builder**: Add any number of scanned or manual ingredients with exact gram weights. All 12 nutrition totals update immediately. Done saves the recipe, ingredient list and total weight to the Library; select it later to log any gram serving. Missing label nutrients are shown as Unknown. For liquid labels, enter the weight of 100ml to convert ml nutrition to grams.
- **Nutrition History**: Use History or the date picker in Nutrition to open earlier entries, see the day's foods and totals, and add missed entries. Past days use your current profile targets for comparison.
- **Meal Prep**: Select a future date and add planned meals, or use Copy to Coming Days to prepare 1–7 days from the selected day. Existing plans are protected unless replacement is selected. Plans retain ingredient details and exact serving nutrition, and only enter eaten totals when marked Eaten on or after their date.

### ⚡ Activity & Recovery Readiness
- **Hardware Pedometer Integration**: Real-time step tracking, distance calculation, active calorie burn estimation, and weekly trend graphs.
- **Vehicle Detection Recovery**: Fresh activity checks and walking/running transitions clear missed vehicle exits. Unconfirmed driving state expires after five minutes. “I'm not driving” resumes steps with a two-minute grace period against repeated false detection.
- **Machine Display Photos**: Activity → Read a Machine Display takes a camera or gallery image and reads labelled steps, kcal, distance and duration. Review and edit the detected readings before adding them to today's training. Missing readings remain blank. Reusing the same image on the same day is blocked. Adding steps to the daily counter is optional, to avoid counting steps already detected by the phone. Machine calories are listed separately from estimated walking calories.
- **Sleep & Recovery Scoring**: Sleep duration, sleep debt calculations, bedtime/wake-time logs, restorative quality metrics, and sleep hygiene checklist.

### First-use Guide
- New users receive a ten-step tutorial after setup. It dims other areas, highlights each control, and asks users to open the main tabs themselves. Use **? Guide** in the header to replay it; Back and Skip Tour are available throughout.

### Photo Reader Availability
- Android bundles Google ML Kit text recognition for local, offline machine display reading. Camera access is requested when taking a photo; Choose Photo uses Android's photo picker.
- The standalone HTML uses Tesseract.js. Its first use requires internet access to download the reader and English model; photos are processed in the browser. If the download fails or the display cannot be read, enter the values manually. Clear photos of a final results screen with visible labels and units work best.

### 📸 On-Device Physique Tracking & Computer Vision
- **Privacy-First Physique Analysis**: On-device pose detection and silhouette segmentation powered by Google ML Kit (Pose Detection & Selfie Segmentation). Photos never leave the device.
- **Standardized Pose Comparison**: Visual overlay and comparative metrics for Front, Side, and Back poses to evaluate lean gains and body composition changes over time.
- **Weight & Tape Measurements**: Metric and imperial bodyweight tracking alongside circumference measurements (chest, arms, waist, thighs, calves).

### 🔒 Privacy & Data Portability
- **100% Local Processing**: All sensitive user health data and photos remain stored securely on the local device.
- **Backup & Restore**: Simple JSON export/import to backup workout logs, nutrition history, and body measurements.
- **Full Backup with photos**: App Data & Backup offers a separate full JSON archive with original and marked progress images plus all logs. Restore works across Android and the browser, including files stored in browser IndexedDB. Images are validated and restored under new IDs before metadata is committed; failed photo imports keep the current logs. Older data-only JSON backups are still supported. Data Backup and the daily automatic backup continue to exclude image bytes; choose Full Backup when moving devices.

---

## Tech Stack & Architecture

- **Platform**: Android (minSdk 24 / Android 7.0, targetSdk 36 / Android 16)
- **Language / Runtime**: Kotlin 1.9.24, Java 17, AndroidX
- **UI Engine**: High-performance hybrid interface utilizing Android WebKit / WebView, modern HTML5, CSS3, and JavaScript
- **Machine Learning & Vision**:
  - Google Play Services Code Scanner (`play-services-code-scanner`)
  - Google ML Kit Barcode Scanning (`barcode-scanning`)
  - Google ML Kit Pose Detection Accurate (`pose-detection-accurate`)
  - Google ML Kit Subject / Selfie Segmentation (`subject-segmentation`, `segmentation-selfie`)
  - Google ML Kit Text Recognition (`text-recognition`, bundled Latin model)
- **Build System**: Gradle 8.11.1 with Kotlin DSL (`build.gradle.kts`), Android Gradle Plugin (AGP) 8.10.1

---

## Project Structure

```text
Ghosty Gains/
├── .github/
│   └── workflows/
│       └── release.yml          # Automated CI/CD release build workflow
├── app/
│   ├── build.gradle.kts         # App-level build configurations & dependencies
│   └── src/
│       └── main/
│           ├── AndroidManifest.xml
│           ├── assets/          # Application web bundle, exercise library, assets
│           │   ├── app.css
│           │   ├── app.js
│           │   ├── exercise_library.js
│           │   ├── exercises/
│           │   └── index.html
│           ├── java/com/ghostygains/app/
│           │   ├── MainActivity.kt      # Native WebView host, bridge & sensors
│           │   ├── BodyAnalyzer.kt      # ML Kit pose & silhouette segmentation
│           │   └── VehicleDetector.kt
│           └── res/             # Android app icons, drawables, and XML configs
├── keystore/
│   └── ghostygains-debug.keystore # Shared debug signing key
├── tools/
│   └── build_exercise_library.py # Exercise data builder tool
├── build.gradle.kts             # Top-level build script
├── settings.gradle.kts          # Project settings & repositories
└── README.md
```

---

## Getting Started & Building

### Prerequisites
- **Android Studio** (Hedgehog / Iguana / Jellyfish or newer recommended)
- **Java Development Kit (JDK)**: Version 17
- **Android SDK**: API Level 36 and Build Tools 35.0.0

### Local Build Instructions

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/<your-username>/Ghosty-Gains.git
   cd "Ghosty Gains"
   ```

2. **Build Debug APK**:
   ```bash
   # On Windows (PowerShell / Command Prompt)
   .\gradlew assembleDebug

   # On Linux / macOS
   chmod +x gradlew
   ./gradlew assembleDebug
   ```
   The generated APK will be available in `app/build/outputs/apk/debug/`.

3. **Build Release APK**:
   Configure upload signing as described below first.
   ```bash
   # On Windows
   .\gradlew assembleRelease

   # On Linux / macOS
   ./gradlew assembleRelease
   ```
   The release APK will be located in `app/build/outputs/apk/release/`.

### Google Play app bundle

Release builds use a private upload key, separate from the shared debug key. On this release machine, the key is `keystore/ghostygains-upload.jks` and its credentials are in `keystore.properties`. Both files are ignored by Git: back them up securely together. The public certificate is `keystore/ghostygains-upload-certificate.pem`.

On another machine, restore the upload key, copy `keystore.properties.example` to `keystore.properties`, and enter its credentials. For an app already uploaded to Play, use its existing registered upload key. Never generate a replacement key just to build an update.

```powershell
.\gradlew.bat :app:testReleaseUnitTest :app:lintRelease :app:bundleRelease
```

Upload `app/build/outputs/bundle/release/app-release.aab` to a Play Console testing or production track with Play App Signing enabled. The Google Play package name is `com.ghostyware.gains`. This bundle is version 1.5.3 (version code 16); increase `versionCode` before uploading any subsequent update. Play uses its app signing key to sign installations, while this local key signs uploads.

Release builds enable R8 code optimization, obfuscation, and resource shrinking. The JavaScript bridge's annotated methods retain their callable names. The matching crash deobfuscation file is `app/build/outputs/mapping/release/mapping.txt`; AGP also embeds it in the AAB for Play Console. Archive each release's mapping with its AAB so crash reports can be decoded using the correct version.

Existing sideloaded APKs use the debug key and cannot be updated in place by an installation signed with a different key. Export a **Full Backup with photos** before switching an existing installation to Google Play, then restore it in the Play version.

---

## Automated Releases (CI/CD)

### Regression checks

Run `node --test tools/workout_nutrition.test.cjs tools/daily_planning.test.cjs tools/supplements.test.cjs tools/training_journal.test.cjs` for workout, nutrition, calendar, meal prep, machine reading, supplements, training records, progression and weekly review calculations, and `.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug` for the Android recovery policy tests and APK build.

`node tools/app_ui.test.cjs` checks both HTML entry points in a real browser, including workout completion by click, touch and keyboard, saved checks, RPE presets, recipes, serving sizes, barcode nutrients, nutrition history, seven-day meal prep, the guided tutorial, supplement choices and daily resets, plan suggestions and machine photo review. Photo OCR is stubbed in this repeatable UI suite; the Android bridge simulation covers stale callbacks, cancellation, permission denial and camera errors. It requires `playwright-core` on the Node module path and Microsoft Edge; set `BROWSER_PATH` to use another installed Chromium browser. Set `UI_SCREENSHOT_DIR` to save mobile tutorial and supplement screenshots. Real Android camera capture and OCR should also be checked on a phone.

`node tools/experience_ui.test.cjs` checks both entry points for legacy data migration, Today shortcuts, saved-set editing, kg/lb conversion, previous-session values, personal records, weekly review, full-photo export/restore/re-export and invalid-backup protection. It also checks 320/390/768px layouts. It uses the same browser setup; `UI_SCREENSHOT_DIR` saves Today screenshots. Physical-device checking is still needed for native photo transfer and pinch gestures.

The project includes a GitHub Actions workflow (`.github/workflows/release.yml`) configured to build and attach signed APKs and Play bundles:
- **Trigger**: Creating and publishing a new release tag in GitHub or dispatching manually from the Actions tab.
- **Artifact**: Checks and builds the release APK and AAB with Java 17 and attaches them to GitHub Release assets. It does not submit the app to Google Play.
- **Required repository secrets**: `GHOSTYGAINS_UPLOAD_KEYSTORE_BASE64` (base64-encoded upload keystore), `GHOSTYGAINS_STORE_PASSWORD`, `GHOSTYGAINS_KEY_ALIAS`, and `GHOSTYGAINS_KEY_PASSWORD`. Configure these from the same upload key used locally; the workflow fails clearly if any are missing.

---

## License

This project is licensed under the terms defined in the [LICENSE](LICENSE) file.
