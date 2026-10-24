package com.ghostygains.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VehicleStatePolicyTest {
    @Test fun freshVehicleConfirmationPausesSteps() {
        assertTrue(VehicleStatePolicy.isFresh(1000L, 2000L, true))
    }

    @Test fun missedExitEventuallyResumesSteps() {
        assertTrue(VehicleStatePolicy.isFresh(1000L, 1000L + VehicleStatePolicy.TIMEOUT_MS - 1, true))
        assertFalse(VehicleStatePolicy.isFresh(1000L, 1000L + VehicleStatePolicy.TIMEOUT_MS, true))
    }

    @Test fun oldInstallRebootAndRevokedPermissionCannotKeepDrivingFlag() {
        assertFalse(VehicleStatePolicy.isFresh(-1L, 2000L, true))
        assertFalse(VehicleStatePolicy.isFresh(10000L, 1000L, true))
        assertFalse(VehicleStatePolicy.isFresh(1000L, 2000L, false))
        assertFalse(VehicleStatePolicy.isFresh(1000L, 2000L, true, sameBoot = false))
    }

    @Test fun manualResumePreventsImmediateFalseRedetectionAndExpires() {
        assertTrue(VehicleStatePolicy.isManualResumeActive(1000L, 1001L))
        assertFalse(VehicleStatePolicy.isManualResumeActive(1000L, 1000L + VehicleStatePolicy.MANUAL_RESUME_MS))
        assertFalse(VehicleStatePolicy.isManualResumeActive(-1L, 1000L))
        assertFalse(VehicleStatePolicy.isManualResumeActive(10000L, 1000L))
    }
}
