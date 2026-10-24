package com.ghostygains.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.math.sqrt

class MainActivity : AppCompatActivity(), SensorEventListener {

    private lateinit var webView: WebView
    private var sensorManager: SensorManager? = null
    private var stepCounterSensor: Sensor? = null
    private var stepDetectorSensor: Sensor? = null
    private var accelerometerSensor: Sensor? = null
    private lateinit var prefs: SharedPreferences

    private var initialStepOffset = -1
    private var todaySteps = 0
    private var lastRecordedDate = ""
    // Latest hardware step counter total seen this session (-1 until the first reading)
    private var lastSensorTotal = -1

    // Accelerometer fallback step detection
    private var lastAccelMag = 9.8f
    private var lastStepTimestamp = 0L
    private val accelThreshold = 12.2f
    private val stepCooldownMs = 280L

    // WebView camera request waiting on the Android CAMERA runtime permission
    private var pendingWebPermission: PermissionRequest? = null

    // <input type="file"> support (photo snap + backup restore)
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var cameraPhotoUri: Uri? = null

    private val mainHandler = Handler(Looper.getMainLooper())
    private val syncRunnable = object : Runnable {
        override fun run() {
            checkAndResetDailySteps()
            notifyWebviewSteps(todaySteps)
            mainHandler.postDelayed(this, 3000)
        }
    }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        resolvePendingWebPermission()
        registerStepSensors()
        VehicleDetector.register(applicationContext)
        notifyWebviewSteps(todaySteps)
    }

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = fileChooserCallback
        fileChooserCallback = null
        if (callback == null) return@registerForActivityResult

        var uris: Array<Uri>? = null
        if (result.resultCode == RESULT_OK) {
            val data = result.data
            val clip = data?.clipData
            uris = when {
                clip != null && clip.itemCount > 0 -> Array(clip.itemCount) { clip.getItemAt(it).uri }
                data?.data != null -> arrayOf(data.data!!)
                // Camera capture returns no data; the photo is written to cameraPhotoUri
                cameraPhotoUri != null -> arrayOf(cameraPhotoUri!!)
                else -> null
            }
        }
        cameraPhotoUri = null
        callback.onReceiveValue(uris)
    }

    // Progress photo capture + on-device analysis
    private val bodyAnalyzer by lazy { BodyAnalyzer(applicationContext) }
    private val analysisExecutor = Executors.newSingleThreadExecutor()
    private var pendingProgressPose = "front"
    private var progressCaptureUri: Uri? = null

    private val takeProgressPhotoLauncher = registerForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val uri = progressCaptureUri
        progressCaptureUri = null
        if (saved && uri != null) analyzeProgressPhoto(uri) else notifyProgressCancelled()
    }

    private val pickProgressPhotoLauncher = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) analyzeProgressPhoto(uri) else notifyProgressCancelled()
    }

    private val progressCameraPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            launchProgressCamera()
        } else {
            Toast.makeText(this, "Camera permission is needed to take progress photos", Toast.LENGTH_LONG).show()
            notifyProgressCancelled()
        }
    }

    // Barcode from a still photo (more reliable than the live in-app camera on some phones)
    private var barcodePhotoUri: Uri? = null

    private val takeBarcodePhotoLauncher = registerForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val uri = barcodePhotoUri
        barcodePhotoUri = null
        if (saved && uri != null) scanBarcodeInPhoto(uri) else notifyWebviewBarcode(null, "cancelled")
    }

    private val barcodeCameraPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) launchBarcodePhoto() else notifyWebviewBarcode(null, "cancelled")
    }

    companion object {
        private const val PREFS_NAME = "GhostyGainsPrefs"
        private const val KEY_TODAY_STEPS = "today_steps"
        private const val KEY_LAST_DATE = "last_date"
        private const val KEY_STEP_OFFSET = "step_offset"
        private const val KEY_STEPS_PAUSED = "steps_paused"
    }

    private fun isStepsPaused(): Boolean = prefs.getBoolean(KEY_STEPS_PAUSED, false)

    // Step counter / detector only deliver events once Physical activity is allowed (Android 10+)
    private fun hasActivityPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        checkAndResetDailySteps()

        // Init Sensors
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        stepCounterSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        stepDetectorSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
        accelerometerSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        webView = findViewById(R.id.webView)

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.allowFileAccessFromFileURLs = true
        settings.allowUniversalAccessFromFileURLs = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(false)
        settings.mediaPlaybackRequiresUserGesture = false

        webView.webViewClient = object : WebViewClient() {}
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) return
                runOnUiThread {
                    val wantsCamera = request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    if (wantsCamera && !hasCameraPermission()) {
                        // The page can only use the camera once the app itself holds CAMERA
                        pendingWebPermission?.deny()
                        pendingWebPermission = request
                        permissionLauncher.launch(arrayOf(Manifest.permission.CAMERA))
                    } else {
                        request.grant(request.resources)
                    }
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest?) {
                if (pendingWebPermission == request) pendingWebPermission = null
            }

            override fun onShowFileChooser(
                view: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback
                return launchFileChooser(fileChooserParams)
            }
        }

        webView.addJavascriptInterface(WebAppInterface(this), "AndroidApp")

        webView.loadUrl("file:///android_asset/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("if (typeof window.handleAndroidBack === 'function') { window.handleAndroidBack(); } else { 'unhandled'; }") { result ->
                    if (result == "\"unhandled\"" || result == "null" || result == null) {
                        if (webView.canGoBack()) {
                            webView.goBack()
                        } else {
                            isEnabled = false
                            onBackPressedDispatcher.onBackPressed()
                        }
                    }
                }
            }
        })

        requestAppPermissions()
        registerStepSensors()
        VehicleDetector.register(applicationContext)
    }

    private fun hasCameraPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    private fun resolvePendingWebPermission() {
        val req = pendingWebPermission ?: return
        pendingWebPermission = null
        if (hasCameraPermission()) {
            req.grant(req.resources)
        } else {
            req.deny()
            Toast.makeText(this, "Camera permission is needed to scan barcodes", Toast.LENGTH_LONG).show()
        }
    }

    private fun launchFileChooser(params: WebChromeClient.FileChooserParams?): Boolean {
        val acceptsImages = params?.acceptTypes?.any { it.startsWith("image") } == true
        val contentIntent = params?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
        }

        // ACTION_IMAGE_CAPTURE throws if CAMERA is declared but not granted, so only offer it when allowed
        val cameraIntent = if (acceptsImages && hasCameraPermission()) createCameraIntent() else null

        val intent = when {
            cameraIntent != null && params?.isCaptureEnabled == true -> cameraIntent
            cameraIntent != null -> Intent.createChooser(contentIntent, "Choose photo").apply {
                putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
            }
            else -> contentIntent
        }

        return try {
            fileChooserLauncher.launch(intent)
            true
        } catch (_: Exception) {
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = null
            cameraPhotoUri = null
            false
        }
    }

    private fun createCameraIntent(): Intent? {
        return try {
            val dir = File(cacheDir, "captures").apply { mkdirs() }
            val photo = File(dir, "barcode_${System.currentTimeMillis()}.jpg")
            val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", photo)
            cameraPhotoUri = uri
            Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, uri)
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun getTodayDateStr(): String {
        return SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
    }

    private fun checkAndResetDailySteps() {
        val today = getTodayDateStr()
        val savedDate = prefs.getString(KEY_LAST_DATE, "")
        if (savedDate != today) {
            todaySteps = 0
            initialStepOffset = -1
            prefs.edit()
                .putString(KEY_LAST_DATE, today)
                .putInt(KEY_TODAY_STEPS, 0)
                .putInt(KEY_STEP_OFFSET, -1)
                .apply()
        } else {
            todaySteps = prefs.getInt(KEY_TODAY_STEPS, 0)
            initialStepOffset = prefs.getInt(KEY_STEP_OFFSET, -1)
        }
        lastRecordedDate = today
    }

    private fun requestAppPermissions() {
        val permissions = mutableListOf<String>()
        if (!hasCameraPermission()) {
            permissions.add(Manifest.permission.CAMERA)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.ACTIVITY_RECOGNITION)
            }
        }
        if (permissions.isNotEmpty()) {
            permissionLauncher.launch(permissions.toTypedArray())
        }
    }

    private fun registerStepSensors() {
        sensorManager?.let { sm ->
            sm.unregisterListener(this)
            // Use exactly one source so steps are never double counted
            when {
                stepCounterSensor != null -> sm.registerListener(this, stepCounterSensor, SensorManager.SENSOR_DELAY_UI)
                stepDetectorSensor != null -> sm.registerListener(this, stepDetectorSensor, SensorManager.SENSOR_DELAY_UI)
                accelerometerSensor != null -> sm.registerListener(this, accelerometerSensor, SensorManager.SENSOR_DELAY_GAME)
                else -> Unit
            }
        }
    }

    override fun onResume() {
        super.onResume()
        checkAndResetDailySteps()
        registerStepSensors()
        VehicleDetector.register(applicationContext)
        mainHandler.post(syncRunnable)
    }

    override fun onPause() {
        super.onPause()
        mainHandler.removeCallbacks(syncRunnable)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return
        checkAndResetDailySteps()

        when (event.sensor.type) {
            Sensor.TYPE_STEP_COUNTER -> applyStepCounterTotal(event.values[0].toInt())
            Sensor.TYPE_STEP_DETECTOR -> {
                if (event.values[0] == 1.0f && !VehicleDetector.isInVehicle(this) && !isStepsPaused()) {
                    todaySteps++
                    prefs.edit().putInt(KEY_TODAY_STEPS, todaySteps).apply()
                    notifyWebviewSteps(todaySteps)
                }
            }
            Sensor.TYPE_ACCELEROMETER -> {
                val x = event.values[0]
                val y = event.values[1]
                val z = event.values[2]
                val mag = sqrt((x * x + y * y + z * z).toDouble()).toFloat()
                val now = System.currentTimeMillis()
                if (mag > accelThreshold && lastAccelMag <= accelThreshold && (now - lastStepTimestamp) > stepCooldownMs &&
                    !VehicleDetector.isInVehicle(this) && !isStepsPaused()) {
                    lastStepTimestamp = now
                    todaySteps++
                    prefs.edit().putInt(KEY_TODAY_STEPS, todaySteps).apply()
                    notifyWebviewSteps(todaySteps)
                }
                lastAccelMag = mag
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun applyStepCounterTotal(totalSensorSteps: Int) {
        lastSensorTotal = totalSensorSteps
        val inVehicle = VehicleDetector.isInVehicle(this)
        val reanchor = VehicleDetector.consumeReanchor(this)
        if (inVehicle || reanchor) {
            // Hold the count still while driving. Moving the vehicle start point up too means
            // the receiver won't subtract these same steps again when the journey ends.
            initialStepOffset = totalSensorSteps - todaySteps
            prefs.edit()
                .putInt(KEY_STEP_OFFSET, initialStepOffset)
                .putInt("vehicle_enter_count", totalSensorSteps)
                .apply()
            return
        }
        if (isStepsPaused() || initialStepOffset < 0 || totalSensorSteps < initialStepOffset) {
            // Paused: keep moving the start point up so these steps never count
            initialStepOffset = totalSensorSteps - todaySteps
            prefs.edit().putInt(KEY_STEP_OFFSET, initialStepOffset).apply()
            return
        }
        val calculatedSteps = (totalSensorSteps - initialStepOffset).coerceAtLeast(0)
        if (calculatedSteps > todaySteps) {
            todaySteps = calculatedSteps
            prefs.edit().putInt(KEY_TODAY_STEPS, todaySteps).apply()
            notifyWebviewSteps(todaySteps)
        }
    }

    /**
     * Reads the hardware counter right now instead of waiting for the next (often batched) event,
     * optionally runs [beforeReport] (e.g. pause/resume), then tells the page the result.
     */
    private fun syncStepsNow(beforeReport: ((Int?) -> Unit)? = null) {
        checkAndResetDailySteps()
        if (!hasActivityPermission() && stepCounterSensor != null) {
            beforeReport?.invoke(null)
            notifyWebviewStepSync("permission")
            requestAppPermissions()
            return
        }
        if (stepCounterSensor == null) {
            beforeReport?.invoke(null)
            notifyWebviewStepSync("ok")
            return
        }
        VehicleDetector.readStepCounter(this) { total ->
            checkAndResetDailySteps()
            if (total != null) applyStepCounterTotal(total)
            beforeReport?.invoke(total)
            notifyWebviewStepSync(if (total != null) "ok" else "no_reading")
        }
    }

    private fun setStepsPausedNow(paused: Boolean) {
        // Count everything up to this moment first, then flip the switch
        syncStepsNow { total ->
            prefs.edit().putBoolean(KEY_STEPS_PAUSED, paused).apply()
            if (!paused) {
                // Start counting from the current total so steps taken while paused never appear
                initialStepOffset = if (total != null) total - todaySteps else -1
                prefs.edit().putInt(KEY_STEP_OFFSET, initialStepOffset).apply()
            }
        }
    }

    private fun notifyWebviewStepSync(status: String) {
        val steps = todaySteps
        val paused = isStepsPaused()
        runOnUiThread {
            webView.evaluateJavascript("if (typeof window.onNativeStepSync === 'function') { window.onNativeStepSync($steps, '$status', $paused); }", null)
        }
    }

    private fun notifyWebviewSteps(steps: Int) {
        runOnUiThread {
            webView.evaluateJavascript("if (typeof window.onNativeStepUpdate === 'function') { window.onNativeStepUpdate($steps); }", null)
        }
    }

    private fun notifyWebviewBarcode(code: String?, status: String) {
        val codeJs = if (code == null) "null" else JSONObject.quote(code)
        val statusJs = JSONObject.quote(status)
        runOnUiThread {
            webView.evaluateJavascript("if (typeof window.onNativeBarcodeResult === 'function') { window.onNativeBarcodeResult($codeJs, $statusJs); }", null)
        }
    }

    private fun startNativeBarcodeScan() {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS)
            .enableAutoZoom()
            .build()

        try {
            GmsBarcodeScanning.getClient(this, options).startScan()
                .addOnSuccessListener { barcode -> notifyWebviewBarcode(barcode.rawValue, "ok") }
                .addOnCanceledListener { notifyWebviewBarcode(null, "cancelled") }
                .addOnFailureListener { notifyWebviewBarcode(null, "error") }
        } catch (_: Exception) {
            notifyWebviewBarcode(null, "error")
        }
    }

    private fun startProgressPhoto(source: String, pose: String) {
        pendingProgressPose = if (pose in listOf("front", "side", "back")) pose else "front"
        if (source == "gallery") {
            pickProgressPhotoLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        } else if (hasCameraPermission()) {
            launchProgressCamera()
        } else {
            progressCameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun launchProgressCamera() {
        try {
            val dir = File(cacheDir, "captures").apply { mkdirs() }
            val photo = File(dir, "progress_${System.currentTimeMillis()}.jpg")
            val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", photo)
            progressCaptureUri = uri
            takeProgressPhotoLauncher.launch(uri)
        } catch (_: Exception) {
            Toast.makeText(this, "No camera app available", Toast.LENGTH_LONG).show()
            notifyProgressCancelled()
        }
    }

    private fun analyzeProgressPhoto(uri: Uri) {
        val id = "pp_${System.currentTimeMillis()}"
        val pose = pendingProgressPose
        evalJs("if (typeof window.onProgressPhotoStatus === 'function') { window.onProgressPhotoStatus('analyzing'); }")
        analysisExecutor.execute {
            val json = try {
                bodyAnalyzer.analyze(uri, id, pose)
            } catch (e: Throwable) {
                JSONObject().put("ok", false).put("id", id).put("pose", pose).put("error", "Analysis failed: ${e.message}")
            }
            // Drop the temporary camera file; the analyser keeps its own copy
            if (uri.authority == "$packageName.fileprovider") {
                try { contentResolver.delete(uri, null, null) } catch (_: Exception) {}
            }
            val payload = JSONObject.quote(json.toString())
            evalJs("if (typeof window.onProgressPhotoResult === 'function') { window.onProgressPhotoResult(JSON.parse($payload)); }")
        }
    }

    private fun notifyProgressCancelled() {
        evalJs("if (typeof window.onProgressPhotoStatus === 'function') { window.onProgressPhotoStatus('cancelled'); }")
    }

    private fun evalJs(script: String) {
        runOnUiThread { webView.evaluateJavascript(script, null) }
    }

    private fun copyProgressPhotoToGallery(id: String): Boolean {
        val file = bodyAnalyzer.photoFile(id)
        if (!file.exists()) return false
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, "GhostyGains_$id.jpg")
                    put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                    put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/GhostyGains")
                }
                val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return false
                contentResolver.openOutputStream(uri)?.use { out -> file.inputStream().use { it.copyTo(out) } } ?: return false
                true
            } else {
                val dir = getExternalFilesDir(Environment.DIRECTORY_PICTURES) ?: return false
                file.copyTo(File(dir, "GhostyGains_$id.jpg"), overwrite = true)
                true
            }
        } catch (_: Exception) {
            false
        }
    }

    override fun onDestroy() {
        analysisExecutor.shutdown()
        super.onDestroy()
    }

    private fun launchBarcodePhoto() {
        try {
            val dir = File(cacheDir, "captures").apply { mkdirs() }
            val photo = File(dir, "barcode_${System.currentTimeMillis()}.jpg")
            val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", photo)
            barcodePhotoUri = uri
            takeBarcodePhotoLauncher.launch(uri)
        } catch (_: Exception) {
            notifyWebviewBarcode(null, "error")
        }
    }

    private fun scanBarcodeInPhoto(uri: Uri) {
        try {
            val image = InputImage.fromFilePath(this, uri)
            val scanner = BarcodeScanning.getClient(
                BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS).build()
            )
            scanner.process(image)
                .addOnSuccessListener { codes ->
                    // Prefer product barcodes over QR codes / other symbols on the pack
                    val productFormats = setOf(Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E)
                    val best = codes.firstOrNull { it.format in productFormats } ?: codes.firstOrNull()
                    notifyWebviewBarcode(best?.rawValue, if (best?.rawValue != null) "ok" else "notfound")
                }
                .addOnFailureListener { notifyWebviewBarcode(null, "notfound") }
                .addOnCompleteListener {
                    scanner.close()
                    try { contentResolver.delete(uri, null, null) } catch (_: Exception) {}
                }
        } catch (_: Exception) {
            notifyWebviewBarcode(null, "notfound")
        }
    }

    private val stateFile by lazy { File(filesDir, "ghosty_state.json") }

    // Write to a temp file then rename, so a crash mid-write never corrupts the saved copy
    private fun writeStateFile(json: String): Boolean {
        return try {
            val tmp = File(filesDir, "ghosty_state.json.tmp")
            tmp.writeText(json, Charsets.UTF_8)
            if (stateFile.exists()) stateFile.copyTo(File(filesDir, "ghosty_state.prev.json"), overwrite = true)
            tmp.renameTo(stateFile) || run { stateFile.writeText(json, Charsets.UTF_8); true }
        } catch (_: Exception) {
            false
        }
    }

    private fun readStateFile(): String {
        for (f in listOf(stateFile, File(filesDir, "ghosty_state.prev.json"))) {
            try {
                if (f.exists() && f.length() > 2) return f.readText(Charsets.UTF_8)
            } catch (_: Exception) {}
        }
        return ""
    }

    /** Keeps one always-current backup in Downloads; overwrites the file this install created. */
    private fun writeAutoBackup(content: String): Boolean {
        val name = "GhostyGains_AutoBackup.json"
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
                val existing = contentResolver.query(
                    collection, arrayOf(MediaStore.Downloads._ID),
                    "${MediaStore.Downloads.DISPLAY_NAME}=?", arrayOf(name), null
                )?.use { c -> if (c.moveToFirst()) android.content.ContentUris.withAppendedId(collection, c.getLong(0)) else null }
                val uri = existing ?: contentResolver.insert(collection, ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name)
                    put(MediaStore.Downloads.MIME_TYPE, "application/json")
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }) ?: return false
                contentResolver.openOutputStream(uri, "wt")?.use { it.write(content.toByteArray(Charsets.UTF_8)) } ?: return false
                true
            } else {
                val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return false
                File(dir, name).writeText(content, Charsets.UTF_8)
                true
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun saveToDownloads(fileName: String, content: String): String? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                    put(MediaStore.Downloads.MIME_TYPE, "application/json")
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return null
                contentResolver.openOutputStream(uri)?.use { it.write(content.toByteArray(Charsets.UTF_8)) } ?: return null
                "Downloads/$fileName"
            } else {
                val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
                val file = File(dir, fileName)
                file.writeText(content, Charsets.UTF_8)
                file.absolutePath
            }
        } catch (_: Exception) {
            null
        }
    }

    inner class WebAppInterface(private val context: Context) {
        @JavascriptInterface
        fun vibrate(milliseconds: Long) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                    val vibrator = vibratorManager?.defaultVibrator
                    vibrator?.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vibrator?.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE))
                    } else {
                        @Suppress("DEPRECATION")
                        vibrator?.vibrate(milliseconds)
                    }
                }
            } catch (_: Exception) {}
        }

        @JavascriptInterface
        fun showToast(message: String) {
            runOnUiThread {
                Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
            }
        }

        @JavascriptInterface
        fun getTodayNativeSteps(): Int {
            checkAndResetDailySteps()
            return todaySteps
        }

        @JavascriptInterface
        fun setTodayNativeSteps(steps: Int) {
            runOnUiThread {
                todaySteps = steps.coerceAtLeast(0)
                // Re-anchor to the last known hardware total. Resetting to -1 made the next sensor
                // event re-baseline, which silently dropped any steps the phone had batched up.
                initialStepOffset = if (lastSensorTotal >= 0) lastSensorTotal - todaySteps else -1
                prefs.edit().putInt(KEY_TODAY_STEPS, todaySteps).putInt(KEY_STEP_OFFSET, initialStepOffset).apply()
                notifyWebviewSteps(todaySteps)
            }
        }

        @JavascriptInterface
        fun syncSteps() {
            runOnUiThread { syncStepsNow() }
        }

        @JavascriptInterface
        fun setStepsPaused(paused: Boolean) {
            runOnUiThread { setStepsPausedNow(paused) }
        }

        @JavascriptInterface
        fun isStepsPaused(): Boolean = this@MainActivity.isStepsPaused()

        @JavascriptInterface
        fun hasActivityPermission(): Boolean = this@MainActivity.hasActivityPermission()

        @JavascriptInterface
        fun hasStepSensor(): Boolean {
            return stepCounterSensor != null || stepDetectorSensor != null || accelerometerSensor != null
        }

        @JavascriptInterface
        fun getSensorType(): String {
            return when {
                stepCounterSensor != null -> "Hardware Step Counter"
                stepDetectorSensor != null -> "Hardware Step Detector"
                accelerometerSensor != null -> "Motion Accelerometer"
                else -> "Manual / Simulation"
            }
        }

        @JavascriptInterface
        fun requestPermissions() {
            runOnUiThread {
                requestAppPermissions()
            }
        }

        @JavascriptInterface
        fun hasCameraPermission(): Boolean = this@MainActivity.hasCameraPermission()

        @JavascriptInterface
        fun scanBarcodeNative() {
            runOnUiThread { startNativeBarcodeScan() }
        }

        @JavascriptInterface
        fun saveTextFile(fileName: String, content: String): String {
            return saveToDownloads(fileName, content) ?: ""
        }

        @JavascriptInterface
        fun takeProgressPhoto(source: String, pose: String) {
            runOnUiThread { startProgressPhoto(source, pose) }
        }

        @JavascriptInterface
        fun deleteProgressPhoto(id: String) {
            if (id.matches(Regex("pp_\\d+"))) bodyAnalyzer.delete(id)
        }

        @JavascriptInterface
        fun saveProgressPhotoToGallery(id: String): Boolean {
            return id.matches(Regex("pp_\\d+")) && copyProgressPhotoToGallery(id)
        }

        @JavascriptInterface
        fun scanBarcodeFromPhoto(source: String) {
            runOnUiThread {
                if (hasCameraPermission()) launchBarcodePhoto()
                else barcodeCameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }

        @JavascriptInterface
        fun isInVehicle(): Boolean = VehicleDetector.isInVehicle(context)

        @JavascriptInterface
        fun clearVehicleDetection() {
            runOnUiThread {
                VehicleDetector.resumeWalking(applicationContext) {
                    checkAndResetDailySteps()
                    syncStepsNow()
                }
            }
        }

        @JavascriptInterface
        fun saveStateBackup(json: String): Boolean = json.length > 2 && writeStateFile(json)

        @JavascriptInterface
        fun loadStateBackup(): String = readStateFile()

        @JavascriptInterface
        fun clearStateBackup() {
            stateFile.delete()
            File(filesDir, "ghosty_state.prev.json").delete()
        }

        @JavascriptInterface
        fun autoBackupToDownloads(json: String): Boolean = writeAutoBackup(json)

        @JavascriptInterface
        fun copyToClipboard(text: String) {
            runOnUiThread {
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                clipboard?.setPrimaryClip(ClipData.newPlainText("Ghosty Gains", text))
            }
        }
    }
}
