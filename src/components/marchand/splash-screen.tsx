'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface SplashScreenProps {
  /** Called once the splash animation finishes (after counter reaches 100) */
  onDone: () => void
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [counter, setCounter] = useState(0)
  const [phase, setPhase] = useState<'logo' | 'name' | 'counter' | 'done'>('logo')
  const doneCalled = useRef(false)

  // Phase 1: Logo fades in immediately
  // Keep the brand transition short so it does not delay the primary task.
  // Hydration happens in parallel in the app router.
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('name'), 250)
    const t2 = setTimeout(() => setPhase('counter'), 450)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  // Counter animation: 0 to 100 over a short, non-blocking transition.
  useEffect(() => {
    if (phase !== 'counter') return
    const startTime = Date.now()
    const duration = 600

    const tick = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out curve for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 3)
      setCounter(Math.round(eased * 100))

      if (progress >= 1) {
        setPhase('done')
        if (!doneCalled.current) {
          doneCalled.current = true
          setTimeout(onDone, 100)
        }
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [phase, onDone])

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          key='splash'
          className='fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5]'
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
        >
          {/* Logo — fadeIn + subtle scale */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className='w-24 h-24 rounded-3xl shadow-xl overflow-hidden mb-6'
          >
            <img
              src='/icon-only.png'
              alt='Jùlaba'
              className='w-full h-full object-contain'
            />
          </motion.div>

          {/* App name — rises from bottom + fadeIn */}
          <AnimatePresence>
            {phase !== 'logo' && (
              <motion.h1
                key='name'
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className='text-4xl font-extrabold text-[#C66A2C] tracking-tight'
              >
                Jùlaba
              </motion.h1>
            )}
          </AnimatePresence>

          {/* Counter — fades in after name appears */}
          <AnimatePresence>
            {phase === 'counter' && (
              <motion.div
                key='counter'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className='mt-6 flex flex-col items-center gap-2'
              >
                {/* Progress bar background */}
                <div className='w-48 h-1.5 bg-[#C66A2C]/10 rounded-full overflow-hidden'>
                  <motion.div
                    className='h-full bg-[#C66A2C] rounded-full'
                    initial={{ width: '0%' }}
                    animate={{ width: `${counter}%` }}
                    transition={{ duration: 0.1, ease: 'linear' }}
                  />
                </div>
                <span className='text-sm font-semibold text-[#C66A2C]/70 tabular-nums'>
                  {counter}%
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
