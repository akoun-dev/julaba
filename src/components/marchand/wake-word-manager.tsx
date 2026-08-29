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
 * page.tsx only mounts this once isAuthenticated is already true, so this
 * component's own mount IS "just logged in" — there's no separate auth
 * transition to watch for here.
 * - Starts listening on mount (if enabled + STT available), after a short
 *   settle delay
 * - Stops listening on unmount (logout)
 * - Opens voice modal when wake word is detected
 * - Pauses/resumes when voice modal opens/closes (handled by voice-modal.tsx)
 */
export function WakeWordManager() {
  const { openVoiceModal, voiceEnabled, wakeWordEnabled } = useAppStore()
  const hasSettledRef = useRef(false)

  // Wire wake word detection → open voice modal
  useEffect(() => {
    onWakeDetected(() => {
      openVoiceModal()
    })
  }, [openVoiceModal])

  // Start / stop as settings change. On the very first activation (right
  // after mount = right after login), wait a moment so we don't compete
  // with other startup work for the mic; later manual toggles react instantly.
  useEffect(() => {
    if (!voiceEnabled || !wakeWordEnabled || !isSTTAvailable()) {
      stopWakeWordListener()
      return
    }

    const state = getWakeWordState()
    if (state === 'listening' || state === 'detected') return

    if (!hasSettledRef.current) {
      hasSettledRef.current = true
      const timer = setTimeout(() => startWakeWordListener(), 2000)
      return () => clearTimeout(timer)
    }

    startWakeWordListener()
  }, [voiceEnabled, wakeWordEnabled])

  // Cleanup on unmount (logout)
  useEffect(() => {
    return () => {
      stopWakeWordListener()
    }
  }, [])

  return null // This component renders nothing
}
