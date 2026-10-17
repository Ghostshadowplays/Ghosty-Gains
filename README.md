# Ghosty Gains

**Ghosty Gains** is a comprehensive, privacy-first bodybuilding, nutrition, and physique coaching application for Android. Designed to maximize training efficiency, progressive overload, and physical well-being, it delivers smart routine guidance, real-time macro tracking, hardware-integrated activity monitoring, and on-device computer vision physique analysis.

---

## Key Features

### 🏋️ Training & Workout Splits
- **Tailored Training Splits**: Structured routines designed for muscle hypertrophy, joint health, and safe progression across various fitness levels and equipment access (Gym, Dumbbells/Home, Bodyweight).
- **Interactive Muscle Focus Picker**: Visual SVG-based body map to target specific muscle groups and receive recommended exercises, form cues, and sets.
- **Built-in Rest Timer & Custom Exercise Logging**: Configurable rest interval timer, form cue logging, and weekly completion tracking.

### 🥗 Nutrition & Macro Optimization
- **Dual Mode Nutrition Tracking**:
  - **Simple Mode (Auto-Pilot)**: Automated balanced meal suggestions and 30-day rotation plans matched to target calories and macros.
  - **Pro Mode**: Granular logging by meal slot (Breakfast, Lunch, Dinner, Snacks) with custom food creations and UK takeaway estimates.
- **Barcode Scanner**: Fast nutrition lookup powered by Google Code Scanner / ML Kit and Open Food Facts.
- **Hydration Tracker & Shopping List**: Fluid intake logger and monthly grocery aggregation.

### ⚡ Activity & Recovery Readiness
- **Hardware Pedometer Integration**: Real-time step tracking, distance calculation, active calorie burn estimation, and weekly trend graphs.
- **Sleep & Recovery Scoring**: Sleep duration, sleep debt calculations, bedtime/wake-time logs, restorative quality metrics, and sleep hygiene checklist.

### 📸 On-Device Physique Tracking & Computer Vision
- **Privacy-First Physique Analysis**: On-device pose detection and silhouette segmentation powered by Google ML Kit (Pose Detection & Selfie Segmentation). Photos never leave the device.
- **Standardized Pose Comparison**: Visual overlay and comparative metrics for Front, Side, and Back poses to evaluate lean gains and body composition changes over time.
- **Weight & Tape Measurements**: Metric and imperial bodyweight tracking alongside circumference measurements (chest, arms, waist, thighs, calves).

### 🔒 Privacy & Data Portability
- **100% Local Processing**: All sensitive user health data and photos remain stored securely on the local device.
- **Backup & Restore**: Simple JSON export/import to backup workout logs, nutrition history, and body measurements.

---

## Tech Stack & Architecture

- **Platform**: Android (minSdk 24 / Android 7.0, targetSdk 34 / Android 14)
- **Language / Runtime**: Kotlin 1.9.24, Java 17, AndroidX
- **UI Engine**: High-performance hybrid interface utilizing Android WebKit / WebView, modern HTML5, CSS3, and JavaScript
- **Machine Learning & Vision**:
  - Google Play Services Code Scanner (`play-services-code-scanner`)
  - Google ML Kit Barcode Scanning (`barcode-scanning`)
  - Google ML Kit Pose Detection Accurate (`pose-detection-accurate`)
  - Google ML Kit Subject / Selfie Segmentation (`subject-segmentation`, `segmentation-selfie`)
- **Build System**: Gradle 8.8 with Kotlin DSL (`build.gradle.kts`), Android Gradle Plugin (AGP) 8.4.2

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
- **Android SDK**: API Level 34

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
   ```bash
   # On Windows
   .\gradlew assembleRelease

   # On Linux / macOS
   ./gradlew assembleRelease
   ```
   The release APK will be located in `app/build/outputs/apk/release/`.

---

## Automated Releases (CI/CD)

The project includes a GitHub Actions workflow (`.github/workflows/release.yml`) configured to automatically build and attach APKs:
- **Trigger**: Creating and publishing a new release tag in GitHub or dispatching manually from the Actions tab.
- **Artifact**: Compiles the release APK with Java 17 and attaches it directly to the GitHub Release assets.

---

## License

This project is licensed under the terms defined in the [LICENSE](LICENSE) file.
