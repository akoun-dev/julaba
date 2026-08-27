'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'

// ============== TYPES ==============

interface OrbitOtpProps {
  /** Number of OTP digits (default: 4) */
  length?: number
  /** Called when all digits are filled */
  onComplete?: (value: string) => void
  /** Called on every change */
  onChange?: (value: string) => void
  /** Called when resend button is clicked */
  onResend?: () => void
  /** Resend countdown in seconds (default: 30) */
  resendDelay?: number
  /** Controlled error message */
  error?: string
  /** Whether currently verifying */
  verifying?: boolean
  /** External reset trigger */
  resetKey?: number
}

// ============== COMPONENT ==============

export function OrbitOtp({
  length = 4,
  onComplete,
  onChange,
  onResend,
  resendDelay = 30,
  error,
  verifying = false,
  resetKey = 0,
}: OrbitOtpProps) {
  const [values, setValues] = useState<string[]>(() => Array(length).fill(''))
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [countdown, setCountdown] = useState(resendDelay)
  const [isComplete, setIsComplete] = useState(false)
  const [orbitAngle, setOrbitAngle] = useState(0)
  const [dashOffset, setDashOffset] = useState(0)
  const inputRefs = useRef<(HTMLDivElement | null)[]>([])
  const hiddenInputRef = useRef<HTMLInputElement>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const animFrameRef = useRef<number>(0)

  // Reset when resetKey changes
  useEffect(() => {
    setValues(Array(length).fill(''))
    setFocusedIndex(0)
    setIsComplete(false)
    setOrbitAngle(0)
    setDashOffset(0)
    setCountdown(resendDelay)
  }, [resetKey, length, resendDelay])

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) {
      if (countdownRef.current) clearInterval(countdownRef.current)
      return
    }
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [countdown > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Orbit animation during verification
  useEffect(() => {
    if (!verifying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      return
    }
    let angle = 0
    let offset = 0
    const animate = () => {
      angle = (angle + 2) % 360
      offset = (offset + 1.5) % 100
      setOrbitAngle(angle)
      setDashOffset(offset)
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animFrameRef.current = requestAnimationFrame(animate)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [verifying])

  const handleBoxClick = useCallback(
    (index: number) => {
      setFocusedIndex(index)
      hiddenInputRef.current?.focus()
    },
    []
  )

  const handleHiddenInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, '')
      if (!raw) return

      const newValues = [...values]
      let writeIdx = focusedIndex

      for (let i = 0; i < raw.length && writeIdx < length; i++) {
        newValues[writeIdx] = raw[i]
        writeIdx++
      }

      setValues(newValues)
      onChange?.(newValues.join(''))

      const nextIdx = Math.min(writeIdx, length - 1)
      setFocusedIndex(nextIdx)

      const joined = newValues.join('')
      const allFilled = newValues.every((v) => v !== '')
      setIsComplete(allFilled)
      if (allFilled && joined.length === length) {
        onComplete?.(joined)
      }
    },
    [values, focusedIndex, length, onComplete, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Backspace') {
        e.preventDefault()
        const newValues = [...values]
        if (newValues[focusedIndex]) {
          newValues[focusedIndex] = ''
        } else if (focusedIndex > 0) {
          newValues[focusedIndex - 1] = ''
          setFocusedIndex(focusedIndex - 1)
        }
        setValues(newValues)
        onChange?.(newValues.join(''))
        setIsComplete(false)
      } else if (e.key === 'ArrowLeft' && focusedIndex > 0) {
        setFocusedIndex(focusedIndex - 1)
      } else if (e.key === 'ArrowRight' && focusedIndex < length - 1) {
        setFocusedIndex(focusedIndex + 1)
      }
    },
    [values, focusedIndex, length, onChange]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault()
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
      if (!pasted) return
      const newValues = [...values]
      for (let i = 0; i < pasted.length; i++) {
        newValues[i] = pasted[i]
      }
      setValues(newValues)
      onChange?.(newValues.join(''))
      const nextIdx = Math.min(pasted.length, length - 1)
      setFocusedIndex(nextIdx)
      const allFilled = newValues.every((v) => v !== '')
      setIsComplete(allFilled)
      if (allFilled) {
        onComplete?.(newValues.join(''))
      }
    },
    [values, length, onComplete, onChange]
  )

  const handleResend = useCallback(() => {
    if (countdown > 0) return
    onResend?.()
    setCountdown(resendDelay)
    setValues(Array(length).fill(''))
    setFocusedIndex(0)
    setIsComplete(false)
  }, [countdown, onResend, resendDelay, length])

  // Orbit positions for verification animation
  const orbitPositions = useMemo(() => {
    const radius = 52
    return values.map((_, i) => {
      const baseAngle = (i / length) * 360
      const angle = ((baseAngle + orbitAngle) * Math.PI) / 180
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      }
    })
  }, [values, orbitAngle, length])

  const canResend = countdown <= 0

  return (
    <div className="orbit-otp-wrapper">
      {/* Hidden accessible input */}
      <input
        ref={hiddenInputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        onChange={handleHiddenInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className="orbit-otp-sr-only"
        aria-label={`Code OTP à ${length} chiffres`}
        value={values.join('')}
      />

      {/* Verification orbit animation */}
      {verifying && (
        <div className="orbit-verification-container">
          <svg
            width="130"
            height="130"
            viewBox="-65 -65 130 130"
            className="orbit-svg"
          >
            {/* Outer track */}
            <circle
              cx="0"
              cy="0"
              r="52"
              fill="none"
              stroke="rgba(59,130,246,0.15)"
              strokeWidth="1.5"
            />
            {/* Spinning dashed circle */}
            <circle
              cx="0"
              cy="0"
              r="52"
              fill="none"
              stroke="rgba(59,130,246,0.6)"
              strokeWidth="1.5"
              strokeDasharray="8 12"
              strokeDashoffset={dashOffset}
              className="orbit-spin-circle"
            />
            {/* Center glow */}
            <circle cx="0" cy="0" r="16" fill="rgba(59,130,246,0.08)" />
            <circle cx="0" cy="0" r="6" fill="rgba(59,130,246,0.4)" />
            {/* Orbiting digits */}
            {values.map((val, i) => (
              <g
                key={i}
                transform={`translate(${orbitPositions[i].x}, ${orbitPositions[i].y})`}
              >
                <circle cx="0" cy="0" r="14" fill="rgba(59,130,246,0.12)" />
                <text
                  x="0"
                  y="1"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#3B82F6"
                  fontSize="14"
                  fontWeight="700"
                  fontFamily="inherit"
                >
                  {val}
                </text>
              </g>
            ))}
          </svg>
          <p className="orbit-verifying-text">Vérification en cours…</p>
        </div>
      )}

      {/* OTP input boxes */}
      {!verifying && (
        <>
          <div className="orbit-otp-boxes">
            {values.map((val, i) => (
              <div
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el
                }}
                className={`
                  orbit-otp-box
                  ${focusedIndex === i ? 'orbit-otp-box--focused' : ''}
                  ${val ? 'orbit-otp-box--filled' : ''}
                  ${error ? 'orbit-otp-box--error' : ''}
                `}
                onClick={() => handleBoxClick(i)}
                role="button"
                tabIndex={-1}
                aria-label={`Chiffre ${i + 1}${val ? ` : ${val}` : ''}`}
              >
                {val && <span className="orbit-otp-digit">{val}</span>}
                {focusedIndex === i && !val && (
                  <span className="orbit-otp-cursor" />
                )}
              </div>
            ))}
          </div>

          {/* Error message */}
          {error && <p className="orbit-otp-error">{error}</p>}

          {/* Resend */}
          <div className="orbit-otp-resend">
            {canResend ? (
              <button className="orbit-otp-resend-btn" onClick={handleResend}>
                Renvoyer le code
              </button>
            ) : (
              <span className="orbit-otp-resend-timer">
                Renvoyer dans <strong>{countdown}s</strong>
              </span>
            )}
          </div>
        </>
      )}

      <style jsx>{`
        .orbit-otp-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
        }

        .orbit-otp-sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border-width: 0;
        }

        /* ---- Verification orbit ---- */
        .orbit-verification-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          padding: 8px 0;
        }

        .orbit-svg {
          filter: drop-shadow(0 0 12px rgba(59, 130, 246, 0.25));
        }

        .orbit-spin-circle {
          transform-origin: center;
          animation: orbitSpin 3s linear infinite;
        }

        @keyframes orbitSpin {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -100; }
        }

        .orbit-verifying-text {
          font-size: 13px;
          color: #64748b;
          letter-spacing: 0.02em;
        }

        /* ---- OTP Boxes ---- */
        .orbit-otp-boxes {
          display: flex;
          gap: 10px;
          justify-content: center;
        }

        .orbit-otp-box {
          width: 51px;
          height: 51px;
          border-radius: 12px;
          border: 1.5px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          user-select: none;
        }

        .orbit-otp-box:hover {
          border-color: rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.06);
        }

        .orbit-otp-box--focused {
          border-color: #3B82F6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15), 0 0 20px rgba(59, 130, 246, 0.1);
          background: rgba(59, 130, 246, 0.06);
        }

        .orbit-otp-box--filled {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.12);
        }

        .orbit-otp-box--focused.orbit-otp-box--filled {
          border-color: #3B82F6;
          background: rgba(59, 130, 246, 0.08);
        }

        .orbit-otp-box--error {
          border-color: rgba(239, 68, 68, 0.5) !important;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1) !important;
        }

        .orbit-otp-digit {
          font-size: 20px;
          font-weight: 700;
          color: #ffffff;
          line-height: 1;
        }

        .orbit-otp-cursor {
          width: 2px;
          height: 24px;
          background: #3B82F6;
          border-radius: 1px;
          animation: cursorBlink 1s step-end infinite;
        }

        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        /* ---- Error ---- */
        .orbit-otp-error {
          font-size: 13px;
          color: #f87171;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.15);
          border-radius: 8px;
          padding: 8px 16px;
          margin-top: 16px;
          text-align: center;
          width: 100%;
          max-width: 320px;
        }

        /* ---- Resend ---- */
        .orbit-otp-resend {
          margin-top: 20px;
          min-height: 20px;
        }

        .orbit-otp-resend-timer {
          font-size: 13px;
          color: #475569;
        }

        .orbit-otp-resend-timer strong {
          color: #64748b;
        }

        .orbit-otp-resend-btn {
          font-size: 13px;
          font-weight: 500;
          color: #3B82F6;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
          transition: all 0.15s ease;
        }

        .orbit-otp-resend-btn:hover {
          background: rgba(59, 130, 246, 0.1);
          color: #60a5fa;
        }
      `}</style>
    </div>
  )
}
