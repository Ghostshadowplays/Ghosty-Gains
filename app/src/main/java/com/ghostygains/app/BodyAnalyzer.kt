package com.ghostygains.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PointF
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.pose.Pose
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.PoseLandmark
import com.google.mlkit.vision.pose.accurate.AccuratePoseDetectorOptions
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteOrder
import kotlin.math.acos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * On-device physique measurement for progress photos.
 *
 * ML Kit pose finds the joints, a segmentation mask gives the body outline, and widths are
 * measured across the outline at fixed points between the joints. Every width is divided by the
 * body height in the photo (or torso length if the feet are cut off), so the numbers don't
 * depend on how far away the camera was. All processing stays on the phone.
 */
class BodyAnalyzer(private val context: Context) {

    companion object {
        private const val MAX_EDGE = 1440
        private const val MASK_THRESHOLD = 0.5f
    }

    private class Mask(val w: Int, val h: Int, val data: FloatArray) {
        fun at(x: Float, y: Float): Float {
            val xi = x.roundToInt()
            val yi = y.roundToInt()
            if (xi < 0 || yi < 0 || xi >= w || yi >= h) return 0f
            return data[yi * w + xi]
        }
    }

    private class Span(val width: Float, val a: PointF, val b: PointF)

    private val dir = File(context.filesDir, "progress").apply { mkdirs() }

    fun photoFile(id: String) = File(dir, "$id.jpg")
    fun markedFile(id: String) = File(dir, "${id}_marked.jpg")

    fun delete(id: String) {
        photoFile(id).delete()
        markedFile(id).delete()
    }

    /** Runs the full pipeline. Must be called off the main thread. */
    fun analyze(source: Uri, id: String, pose: String): JSONObject {
        val result = JSONObject().put("id", id).put("pose", pose)
        val bitmap = loadUprightBitmap(source) ?: return result.put("ok", false).put("error", "Could not open that photo.")

        FileOutputStream(photoFile(id)).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 88, it) }
        result.put("photoUri", Uri.fromFile(photoFile(id)).toString())
            .put("width", bitmap.width)
            .put("height", bitmap.height)

        val image = InputImage.fromBitmap(bitmap, 0)
        val detected = try {
            val detector = PoseDetection.getClient(
                AccuratePoseDetectorOptions.Builder()
                    .setDetectorMode(AccuratePoseDetectorOptions.SINGLE_IMAGE_MODE)
                    .build()
            )
            Tasks.await(detector.process(image)).also { detector.close() }
        } catch (e: Exception) {
            null
        }

        val lm = detected?.let { landmarks(it) }
        if (lm == null) {
            return result.put("ok", false).put("error", "Couldn't find a body in this photo. Stand further back so shoulders to knees are in frame.")
        }

        val (mask, maskSource) = segment(image, bitmap.width, bitmap.height)
            ?: return result.put("ok", false).put("error", "Couldn't separate your body from the background. Try a plainer background and better light.")

        val measured = measure(lm, mask, pose)
        drawMarked(bitmap, measured.second, id)

        val metrics = measured.first
        metrics.getJSONObject("flags").put("mask", maskSource)
        return result.put("ok", true)
            .put("markedUri", Uri.fromFile(markedFile(id)).toString())
            .put("ref", metrics.getString("ref"))
            .put("metrics", metrics.getJSONObject("metrics"))
            .put("flags", metrics.getJSONObject("flags"))
            .put("warnings", metrics.getJSONArray("warnings"))
    }

    private fun loadUprightBitmap(uri: Uri): Bitmap? {
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

            var sample = 1
            while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_EDGE) sample *= 2
            val decoded = context.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
            } ?: return null

            val orientation = context.contentResolver.openInputStream(uri)?.use {
                ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
            } ?: ExifInterface.ORIENTATION_NORMAL

            val matrix = Matrix()
            when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
                ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
                ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            }
            val scale = min(1f, MAX_EDGE.toFloat() / max(decoded.width, decoded.height))
            matrix.postScale(scale, scale)
            Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
                .copy(Bitmap.Config.ARGB_8888, true)
        } catch (_: Exception) {
            null
        }
    }

    /** Subject segmentation (sharper, Play-services module) with the bundled selfie model as fallback. */
    private fun segment(image: InputImage, w: Int, h: Int): Pair<Mask, String>? {
        try {
            val seg = SubjectSegmentation.getClient(
                SubjectSegmenterOptions.Builder().enableForegroundConfidenceMask().build()
            )
            val res = Tasks.await(seg.process(image))
            seg.close()
            val buf = res.foregroundConfidenceMask
            if (buf != null && buf.capacity() >= w * h) {
                val arr = FloatArray(w * h)
                buf.rewind()
                buf.get(arr)
                return Mask(w, h, arr) to "subject"
            }
        } catch (_: Exception) {
            // Module not downloaded yet / no Play services: fall through to the selfie model
        }

        return try {
            val seg = Segmentation.getClient(
                SelfieSegmenterOptions.Builder()
                    .setDetectorMode(SelfieSegmenterOptions.SINGLE_IMAGE_MODE)
                    .build()
            )
            val m = Tasks.await(seg.process(image))
            seg.close()
            val fb = m.buffer.order(ByteOrder.nativeOrder()).asFloatBuffer()
            fb.rewind()
            val raw = FloatArray(m.width * m.height)
            fb.get(raw)
            if (m.width == w && m.height == h) {
                Mask(w, h, raw) to "selfie"
            } else {
                // Nearest-neighbour upscale to image size so measurements share one coordinate space
                val arr = FloatArray(w * h)
                for (y in 0 until h) {
                    val sy = min(m.height - 1, y * m.height / h)
                    for (x in 0 until w) arr[y * w + x] = raw[sy * m.width + min(m.width - 1, x * m.width / w)]
                }
                Mask(w, h, arr) to "selfie"
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun landmarks(pose: Pose): Map<Int, PoseLandmark>? {
        val all = pose.allPoseLandmarks.associateBy { it.landmarkType }
        val required = listOf(PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER, PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP)
        if (required.any { (all[it]?.inFrameLikelihood ?: 0f) < 0.5f }) return null
        return all
    }

    private fun mid(a: PointF, b: PointF) = PointF((a.x + b.x) / 2f, (a.y + b.y) / 2f)

    /** Width of the body outline through [c] along unit direction [d] (sums mask confidence for sub-pixel edges). */
    private fun span(mask: Mask, c: PointF, d: PointF, maxLen: Float): Span? {
        if (mask.at(c.x, c.y) < MASK_THRESHOLD) return null
        var pos = 0f
        while (pos < maxLen && mask.at(c.x + d.x * (pos + 1), c.y + d.y * (pos + 1)) >= MASK_THRESHOLD) pos += 1f
        var neg = 0f
        while (neg < maxLen && mask.at(c.x - d.x * (neg + 1), c.y - d.y * (neg + 1)) >= MASK_THRESHOLD) neg += 1f
        if (pos >= maxLen || neg >= maxLen) return null

        var sum = 0f
        var t = -neg - 3f
        while (t <= pos + 3f) {
            sum += mask.at(c.x + d.x * t, c.y + d.y * t)
            t += 1f
        }
        return Span(sum, PointF(c.x - d.x * neg, c.y - d.y * neg), PointF(c.x + d.x * pos, c.y + d.y * pos))
    }

    /** Average width of a limb measured perpendicular to the bone at fractions [ts] between two joints. */
    private fun limb(mask: Mask, a: PointF?, b: PointF?, ts: List<Float>): Span? {
        if (a == null || b == null) return null
        val len = hypot(b.x - a.x, b.y - a.y)
        if (len < 10f) return null
        val perp = PointF(-(b.y - a.y) / len, (b.x - a.x) / len)
        val spans = ts.mapNotNull { t -> span(mask, PointF(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t), perp, len) }
        if (spans.isEmpty()) return null
        val mid = spans[spans.size / 2]
        return Span(spans.map { it.width }.average().toFloat(), mid.a, mid.b)
    }

    private fun measure(lm: Map<Int, PoseLandmark>, mask: Mask, pose: String): Pair<JSONObject, Map<String, Span>> {
        fun p(type: Int, minLikelihood: Float = 0.5f): PointF? =
            lm[type]?.takeIf { it.inFrameLikelihood >= minLikelihood }?.position

        val ls = p(PoseLandmark.LEFT_SHOULDER)!!
        val rs = p(PoseLandmark.RIGHT_SHOULDER)!!
        val lh = p(PoseLandmark.LEFT_HIP)!!
        val rh = p(PoseLandmark.RIGHT_HIP)!!
        val sMid = mid(ls, rs)
        val hMid = mid(lh, rh)
        val torsoLen = hypot(hMid.x - sMid.x, hMid.y - sMid.y)
        val down = PointF((hMid.x - sMid.x) / torsoLen, (hMid.y - sMid.y) / torsoLen)
        val across = PointF(down.y, -down.x)
        val warnings = JSONArray()
        val spans = linkedMapOf<String, Span>()

        fun torsoAt(f: Float) = span(mask, PointF(sMid.x + down.x * torsoLen * f, sMid.y + down.y * torsoLen * f), across, torsoLen * 2f)

        // Height reference: top of the outline above the nose down to the heels
        val heelL = p(PoseLandmark.LEFT_HEEL) ?: p(PoseLandmark.LEFT_ANKLE)
        val heelR = p(PoseLandmark.RIGHT_HEEL) ?: p(PoseLandmark.RIGHT_ANKLE)
        val nose = p(PoseLandmark.NOSE, 0.3f) ?: PointF(sMid.x - down.x * torsoLen * 0.45f, sMid.y - down.y * torsoLen * 0.45f)
        var top = PointF(nose.x, nose.y)
        while (mask.at(top.x - down.x, top.y - down.y) >= MASK_THRESHOLD && top.y > 0) top = PointF(top.x - down.x, top.y - down.y)
        val fullBody = heelL != null && heelR != null
        val heightPx = if (fullBody) {
            val feet = mid(heelL!!, heelR!!)
            (feet.x - top.x) * down.x + (feet.y - top.y) * down.y
        } else 0f
        val useHeight = fullBody && heightPx > torsoLen * 2.2f
        val refPx = if (useHeight) heightPx else torsoLen
        if (!useHeight) warnings.put("Feet not fully in frame — measured against torso length instead of height. Include head to feet next time for best tracking.")

        if (pose == "side") {
            torsoAt(0.30f)?.let { spans["chest"] = it }
            (0..14).mapNotNull { torsoAt(0.45f + it * 0.03f) }.maxByOrNull { it.width }?.let { spans["waist"] = it }
            (0..8).mapNotNull { torsoAt(0.95f + it * 0.03f) }.maxByOrNull { it.width }?.let { spans["hips"] = it }
        } else {
            torsoAt(0.10f)?.let { spans["shoulders"] = it }
            torsoAt(0.30f)?.let { spans["chest"] = it }
            (0..14).mapNotNull { torsoAt(0.48f + it * 0.025f) }.minByOrNull { it.width }?.let { spans["waist"] = it }
            (0..10).mapNotNull { torsoAt(0.88f + it * 0.025f) }.maxByOrNull { it.width }?.let { spans["hips"] = it }

            val armTs = listOf(0.35f, 0.45f, 0.55f)
            limb(mask, ls, p(PoseLandmark.LEFT_ELBOW), armTs)?.let { spans["armL"] = it }
            limb(mask, rs, p(PoseLandmark.RIGHT_ELBOW), armTs)?.let { spans["armR"] = it }
            val thighTs = listOf(0.30f, 0.38f, 0.46f)
            limb(mask, lh, p(PoseLandmark.LEFT_KNEE), thighTs)?.let { spans["thighL"] = it }
            limb(mask, rh, p(PoseLandmark.RIGHT_KNEE), thighTs)?.let { spans["thighR"] = it }
            val calfTs = listOf(0.25f, 0.32f, 0.39f)
            limb(mask, p(PoseLandmark.LEFT_KNEE), p(PoseLandmark.LEFT_ANKLE), calfTs)?.let { spans["calfL"] = it }
            limb(mask, p(PoseLandmark.RIGHT_KNEE), p(PoseLandmark.RIGHT_ANKLE), calfTs)?.let { spans["calfR"] = it }
        }

        // Arms touching the torso merge into the chest outline; legs touching merge thighs
        val shoulderW = spans["shoulders"]?.width
        val armsMerged = pose != "side" && shoulderW != null && (spans["chest"]?.width ?: 0f) > shoulderW * 1.08f
        if (armsMerged) {
            spans.remove("chest")
            warnings.put("Arms are touching your sides, so chest/lat width was skipped. Hold arms about 30–45° out from your body.")
        }
        val hipW = spans["hips"]?.width
        val legsMerged = hipW != null && listOf("thighL", "thighR").any { (spans[it]?.width ?: 0f) > hipW * 0.75f }
        if (legsMerged) {
            spans.remove("thighL")
            spans.remove("thighR")
            warnings.put("Legs are touching, so thigh size was skipped. Stand with feet about shoulder-width apart.")
        }

        fun armAngle(s: PointF, e: PointF?): Double? {
            e ?: return null
            val len = hypot(e.x - s.x, e.y - s.y)
            if (len < 1f) return null
            val cos = ((e.x - s.x) * down.x + (e.y - s.y) * down.y) / len
            return Math.toDegrees(acos(cos.coerceIn(-1f, 1f).toDouble()))
        }
        val angles = listOfNotNull(armAngle(ls, p(PoseLandmark.LEFT_ELBOW)), armAngle(rs, p(PoseLandmark.RIGHT_ELBOW)))

        val metrics = JSONObject()
        fun put(key: String, s: Span?) { if (s != null) metrics.put(key, s.width / refPx) }
        fun putPair(key: String, l: String, r: String) {
            val vals = listOfNotNull(spans[l]?.width, spans[r]?.width)
            if (vals.isNotEmpty()) metrics.put(key, vals.average() / refPx)
            spans[l]?.let { metrics.put(l, it.width / refPx) }
            spans[r]?.let { metrics.put(r, it.width / refPx) }
        }
        put("shoulders", spans["shoulders"])
        put("chest", spans["chest"])
        put("waist", spans["waist"])
        put("hips", spans["hips"])
        putPair("arm", "armL", "armR")
        putPair("thigh", "thighL", "thighR")
        putPair("calf", "calfL", "calfR")

        val flags = JSONObject()
            .put("fullBody", useHeight)
            .put("armsMerged", armsMerged)
            .put("legsMerged", legsMerged)
            .put("armAngle", if (angles.isEmpty()) JSONObject.NULL else angles.average())
            // Shoulder-joint spread vs torso length changes when the body is turned, so it flags rotation between photos
            .put("facing", hypot(rs.x - ls.x, rs.y - ls.y) / torsoLen)
            .put("bodyFill", refPx / mask.h)

        if (refPx / mask.h < 0.45f && useHeight) warnings.put("You're quite small in the frame. Step closer so your body fills most of the photo.")
        if (angles.isNotEmpty() && pose != "side" && angles.average() > 70) warnings.put("Arms are raised high, which changes shoulder/arm readings. Use the same relaxed 30–45° arm position each time.")

        return JSONObject()
            .put("ref", if (useHeight) "height" else "torso")
            .put("metrics", metrics)
            .put("flags", flags)
            .put("warnings", warnings) to spans
    }

    private fun drawMarked(src: Bitmap, spans: Map<String, Span>, id: String) {
        val out = src.copy(Bitmap.Config.ARGB_8888, true)
        val canvas = Canvas(out)
        val stroke = max(3f, out.width / 220f)
        val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeWidth = stroke; strokeCap = Paint.Cap.ROUND }
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = max(22f, out.width / 34f)
            setShadowLayer(4f, 0f, 0f, Color.BLACK)
            isFakeBoldText = true
        }
        val labels = mapOf(
            "shoulders" to "Shoulders", "chest" to "Chest/Lats", "waist" to "Waist", "hips" to "Hips",
            "armL" to "Arm", "armR" to "Arm", "thighL" to "Thigh", "thighR" to "Thigh", "calfL" to "Calf", "calfR" to "Calf"
        )
        spans.forEach { (key, s) ->
            line.color = if (key.startsWith("arm") || key.startsWith("thigh") || key.startsWith("calf")) Color.rgb(197, 134, 240) else Color.rgb(0, 200, 255)
            canvas.drawLine(s.a.x, s.a.y, s.b.x, s.b.y, line)
            canvas.drawCircle(s.a.x, s.a.y, stroke * 1.4f, line)
            canvas.drawCircle(s.b.x, s.b.y, stroke * 1.4f, line)
            val label = labels[key] ?: key
            val tx = if (key.endsWith("R")) min(s.a.x, s.b.x) - text.measureText(label) - stroke * 3 else max(s.a.x, s.b.x) + stroke * 3
            canvas.drawText(label, tx.coerceIn(4f, out.width - text.measureText(label) - 4f), (s.a.y + s.b.y) / 2f + text.textSize / 3f, text)
        }
        FileOutputStream(markedFile(id)).use { out.compress(Bitmap.CompressFormat.JPEG, 85, it) }
    }
}
