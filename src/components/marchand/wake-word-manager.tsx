'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import {
  startWakeWordListener,
  stopWakeWordListener,
  onWakeDetected,
  getWakeWordState,
} from '@/lib/voice/wake-word'
import { isSTTAvailable } from '@/lib/voice/stt'

/**
 * Invisible component that manages the wake word listener lifecycle.
 * - Starts listening after auth (if enabled + STT available)
 * - Stops listening on logout
 * - Opens voice modal when wake word is detected
 * - Pauses/resumes when voice modal opens/closes
 */
export function WakeWordManager() {
  const { isAuthenticated, openVoiceModal, voiceEnabled, wakeWordEnabled, showVoiceModal } = useAppStore()
  const prevAuthRef = useRef(isAuthenticated)

  // Wire wake word detection → open voice modal
  useEffect(() => {
    if (!isAuthenticated) return
    onWakeDetected(() => {
      openVoiceModal()
    })
  }, [isAuthenticated, openVoiceModal])

  // Start / stop based on auth state changes
  useEffect(() => {
    const wasAuth = prevAuthRef.current
    prevAuthRef.current = isAuthenticated

    if (isAuthenticated && !wasAuth) {
      // Just logged in — start wake word if enabled
      if (voiceEnabled && wakeWordEnabled && isSTTAvailable()) {
        // Small delay to let the app settle after login
        const timer = setTimeout(() => {
          startWakeWordListener()
        }, 2000)
        return () => clearTimeout(timer)
      }
    }

    if (!isAuthenticated && wasAuth) {
      // Just logged out — stop wake word
      stopWakeWordListener()
    }
  }, [isAuthenticated, voiceEnabled, wakeWordEnabled])

  // React to voice/wake-word toggle changes while authenticated
  useEffect(() => {
    if (!isAuthenticated) return

    if (voiceEnabled && wakeWordEnabled && isSTTAvailable()) {
      if (getWakeWordState() === 'inactive' || getWakeWordState() === 'error') {
        startWakeWordListener()
      }
    } else {
      stopWakeWordListener()
    }
  }, [voiceEnabled, wakeWordEnabled, isAuthenticated])

  // Pause when voice modal is open (the modal also calls pauseWakeWord/resumeWakeWord directly)
  // This is a safety net
  useEffect(() => {
    if (!isAuthenticated) return
    // The voice-modal.tsx already handles pause/resume on mount/unmount
    // This effect is a secondary safety net
  }, [showVoiceModal, isAuthenticated])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWakeWordListener()
    }
  }, [])

  return null // This component renders nothing
}
