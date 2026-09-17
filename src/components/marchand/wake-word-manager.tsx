'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import {
  startWakeWordListener,
  stopWakeWordListener,
  onWakeDetected,
  getWakeWordState,
} from '@/lib/voice/wake-word'
import { isAnySTTAvailable as isSTTAvailable, initSherpaModel } from '@/lib/voice/stt-factory'

/**
 * Invisible component that manages the wake word listener lifecycle.
 * page.tsx only mounts this once isAuthenticated is already true, so this
 * component's own mount IS "just logged in" — there's no separate auth
 * transition to watch for here.
 * - Starts listening on mount (if enabled + STT available), after a short
 *   settle delay
 * - Stops listening on unmount (logout)
 * - Opens voice modal when wake word is detected, and starts listening for
 *   the command right away — saying "Julaba" should be enough on its own,
 *   the same as pressing and holding the mic button, not "Julaba" then a
 *   separate manual press.
 * - Pauses/resumes when voice modal opens/closes (handled by voice-modal.tsx)
 */
export function WakeWordManager() {
  const { openVoiceModal, setVoiceAutoRecord, voiceEnabled, wakeWordEnabled } = useAppStore()
  const hasSettledRef = useRef(false)

  // Warm the offline STT model right after login, for BOTH roles — not just
  // at the marchand auth screen. This is the earliest role-agnostic mount
  // point: on an offline device the model must be loading (or loaded) long
  // before the first voice interaction, otherwise the wake word and both
  // voice modals start deaf (audit P0: init early, not only at marchand auth).
  useEffect(() => {
    void initSherpaModel()
  }, [])

  // Wire wake word detection → open voice modal and start listening
  // immediately (mirrors the bottom bar's press-and-hold: setVoiceAutoRecord
  // then openVoiceModal — voice-modal.tsx/prod-voice-modal.tsx both start
  // listening on mount when they see voiceAutoRecord true).
  useEffect(() => {
    onWakeDetected(() => {
      setVoiceAutoRecord(true)
      openVoiceModal()
    })
  }, [openVoiceModal, setVoiceAutoRecord])

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
