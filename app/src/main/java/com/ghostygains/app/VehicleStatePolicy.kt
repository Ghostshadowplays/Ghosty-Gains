package com.ghostygains.app

/** Activity timestamps use uptime, so a reboot or missing confirmation cannot leave steps paused. */
internal object VehicleStatePolicy {
    const val TIMEOUT_MS = 5 * 60 * 1000L
    const val MANUAL_RESUME_MS = 2 * 60 * 1000L

    fun isFresh(confirmed: Long, now: Long, permission: Boolean, sameBoot: Boolean = true): Boolean =
        permission && sameBoot && confirmed >= 0 && now >= confirmed && now - confirmed < TIMEOUT_MS

    fun isManualResumeActive(resumedAt: Long, now: Long): Boolean =
        resumedAt >= 0 && now >= resumedAt && now - resumedAt < MANUAL_RESUME_MS
}
