package com.ghostygains.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Stops car/bus/train journeys counting as steps.
 *
 * Google's activity recognition tells us when the user gets in and out of a vehicle. On entry
 * we note the hardware step counter; on exit, the steps "taken" in between are added to the
 * day's offset so they never show up. While the flag is set, MainActivity also ignores the
 * step detector / accelerometer fallback.
 */
object VehicleDetector {
    const val PREFS = "GhostyGainsPrefs"
    const val KEY_IN_VEHICLE = "in_vehicle"
    private const val KEY_ENTER_COUNT = "vehicle_enter_count"
    private const val KEY_ENTER_DATE = "vehicle_enter_date"
    private const val KEY_STEP_OFFSET = "step_offset"
    private const val KEY_LAST_DATE = "last_date"
    private const val KEY_CONFIRMED_AT = "vehicle_confirmed_elapsed"
    private const val KEY_REANCHOR = "vehicle_reanchor_steps"
    private const val KEY_MANUAL_RESUME = "vehicle_manual_resume_elapsed"
    private const val KEY_BOOT_COUNT = "vehicle_boot_count"

    private fun bootCount(context: Context): Int =
        Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)

    fun hasPermission(context: Context): Boolean {
        val perm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) Manifest.permission.ACTIVITY_RECOGNITION
        else "com.google.android.gms.permission.ACTIVITY_RECOGNITION"
        return ContextCompat.checkSelfPermission(context, perm) == PackageManager.PERMISSION_GRANTED
    }

    fun isInVehicle(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_IN_VEHICLE, false)) return false
        val confirmed = prefs.getLong(KEY_CONFIRMED_AT, -1L)
        // Repair old installs, a missed EXIT, revoked permissions, and timestamps from a reboot.
        if (!VehicleStatePolicy.isFresh(confirmed, SystemClock.elapsedRealtime(), hasPermission(context),
                prefs.getInt(KEY_BOOT_COUNT, -1) == bootCount(context))) {
            prefs.edit().putBoolean(KEY_IN_VEHICLE, false).putInt(KEY_ENTER_COUNT, -1)
                .putBoolean(KEY_REANCHOR, true).remove(KEY_CONFIRMED_AT).apply()
            return false
        }
        return true
    }

    fun consumeReanchor(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_REANCHOR, false)) return false
        prefs.edit().putBoolean(KEY_REANCHOR, false).apply()
        return true
    }

    fun resumeWalking(context: Context, done: () -> Unit) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putLong(KEY_MANUAL_RESUME, SystemClock.elapsedRealtime()).apply()
        onExit(context, done)
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, VehicleTransitionReceiver::class.java)
        // The system writes the transition result into the intent, so it must be mutable
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
        return PendingIntent.getBroadcast(context, 4201, intent, flags)
    }

    /** Safe to call on every launch; does nothing without permission or Play services. */
    @SuppressLint("MissingPermission")
    fun register(context: Context) {
        if (!hasPermission(context)) return
        val transitions = listOf(
            ActivityTransition.Builder().setActivityType(DetectedActivity.IN_VEHICLE)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER).build(),
            ActivityTransition.Builder().setActivityType(DetectedActivity.IN_VEHICLE)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT).build(),
            ActivityTransition.Builder().setActivityType(DetectedActivity.WALKING)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER).build(),
            ActivityTransition.Builder().setActivityType(DetectedActivity.RUNNING)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER).build()
        )
        try {
            ActivityRecognition.getClient(context)
                .requestActivityTransitionUpdates(ActivityTransitionRequest(transitions), pendingIntent(context))
            // Refresh current activity so the stored flag never depends on receiving one EXIT.
            ActivityRecognition.getClient(context).requestActivityUpdates(30000L, pendingIntent(context))
        } catch (_: Exception) {
            // No Play services / permission revoked: steps just won't be vehicle-filtered
        }
    }

    private fun today() = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())

    /** Reads the current hardware step counter total (sensor reports it straight after registering). */
    fun readStepCounter(context: Context, callback: (Int?) -> Unit) {
        val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val sensor = sm?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        if (sm == null || sensor == null) {
            callback(null)
            return
        }
        val handler = Handler(Looper.getMainLooper())
        var done = false
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent?) {
                if (done || event == null) return
                done = true
                sm.unregisterListener(this)
                callback(event.values[0].toInt())
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        try {
            if (!sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_FASTEST)) {
                done = true
                callback(null)
                return
            }
        } catch (_: SecurityException) {
            done = true
            callback(null)
            return
        }
        handler.postDelayed({
            if (!done) {
                done = true
                sm.unregisterListener(listener)
                callback(null)
            }
        }, 4000)
    }

    fun onEnter(context: Context, done: () -> Unit) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (VehicleStatePolicy.isManualResumeActive(prefs.getLong(KEY_MANUAL_RESUME, -1L), SystemClock.elapsedRealtime())) {
            done()
            return
        }
        val alreadyInVehicle = isInVehicle(context)
        val confirmation = SystemClock.elapsedRealtime()
        prefs.edit().putBoolean(KEY_IN_VEHICLE, true).putLong(KEY_CONFIRMED_AT, confirmation)
            .putInt(KEY_BOOT_COUNT, bootCount(context)).apply()
        if (alreadyInVehicle) { done(); return }
        readStepCounter(context) { count ->
            // An asynchronous counter response must not restore an entry after walking resumes.
            if (prefs.getBoolean(KEY_IN_VEHICLE, false) && prefs.getLong(KEY_CONFIRMED_AT, -1) == confirmation) {
                prefs.edit().putInt(KEY_ENTER_COUNT, count ?: -1).putString(KEY_ENTER_DATE, today()).apply()
            }
            done()
        }
    }

    fun onExit(context: Context, done: () -> Unit) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_IN_VEHICLE, false)) { done(); return }
        val confirmation = prefs.getLong(KEY_CONFIRMED_AT, -1)
        readStepCounter(context) { count ->
            if (prefs.getLong(KEY_CONFIRMED_AT, -1) != confirmation) { done(); return@readStepCounter }
            val enterCount = prefs.getInt(KEY_ENTER_COUNT, -1)
            val sameDay = prefs.getString(KEY_ENTER_DATE, "") == today() && prefs.getString(KEY_LAST_DATE, "") == today()
            val offset = prefs.getInt(KEY_STEP_OFFSET, -1)
            val edit = prefs.edit().putBoolean(KEY_IN_VEHICLE, false).putInt(KEY_ENTER_COUNT, -1)
                .remove(KEY_CONFIRMED_AT)
            // Push today's offset forward by the "steps" the vehicle produced
            if (count != null && enterCount >= 0 && sameDay && offset >= 0 && count >= enterCount) {
                edit.putInt(KEY_STEP_OFFSET, offset + (count - enterCount))
            } else {
                edit.putBoolean(KEY_REANCHOR, true)
            }
            edit.apply()
            done()
        }
    }
}

class VehicleTransitionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (ActivityRecognitionResult.hasResult(intent)) {
            val result = ActivityRecognitionResult.extractResult(intent) ?: return
            if (SystemClock.elapsedRealtime() - result.elapsedRealtimeMillis !in 0..60000L) return
            val activity = result.mostProbableActivity
            if (activity.confidence < 75) return
            val pending = goAsync()
            when (activity.type) {
                DetectedActivity.IN_VEHICLE -> VehicleDetector.onEnter(context.applicationContext) { pending.finish() }
                DetectedActivity.WALKING, DetectedActivity.RUNNING, DetectedActivity.ON_FOOT, DetectedActivity.STILL ->
                    VehicleDetector.onExit(context.applicationContext) { pending.finish() }
                else -> pending.finish()
            }
            return
        }
        if (!ActivityTransitionResult.hasResult(intent)) return
        val result = ActivityTransitionResult.extractResult(intent) ?: return
        val last = result.transitionEvents.lastOrNull {
            it.activityType == DetectedActivity.IN_VEHICLE ||
                ((it.activityType == DetectedActivity.WALKING || it.activityType == DetectedActivity.RUNNING) &&
                    it.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER)
        } ?: return
        if (SystemClock.elapsedRealtimeNanos() - last.elapsedRealTimeNanos !in 0..60000000000L) return
        val pending = goAsync()
        val finish = { pending.finish() }
        if (last.activityType == DetectedActivity.IN_VEHICLE && last.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER) {
            VehicleDetector.onEnter(context.applicationContext, finish)
        } else {
            VehicleDetector.onExit(context.applicationContext, finish)
        }
    }
}
