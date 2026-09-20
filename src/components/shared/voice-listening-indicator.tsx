"use client"

import { X } from "lucide-react"

interface VoiceListeningIndicatorProps {
    subtitle: string
    onStop: () => void
}

/** Shared listening state used by auth and Tata's conversation modal. */
export function VoiceListeningIndicator({
    subtitle,
    onStop,
}: VoiceListeningIndicatorProps) {
    return (
        <div className="fixed inset-x-4 bottom-4 z-[120] mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-[var(--voice-indicator-bg)] p-3 shadow-2xl">
            <div className="flex h-9 w-9 shrink-0 animate-pulse items-center justify-center rounded-full bg-[var(--vl-marchand)] text-white shadow-md shadow-[var(--vl-marchand-shadow)] ring-4 ring-[var(--vl-marchand-ring)]">
                <img
                    src="/icon-only.png"
                    alt=""
                    aria-hidden="true"
                    className="h-7 w-7 object-contain"
                />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">Tata t'écoute…</p>
                <p className="truncate text-xs text-white/60">{subtitle}</p>
            </div>
            <button
                type="button"
                aria-label="Arrêter l'écoute"
                onClick={onStop}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    )
}
