import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as FCFA currency. All FCFA amounts in the project are
 * integers (see AGENTS.md) — this uses the same Intl.NumberFormat as the
 * voice subsystem's formatFCFA (src/lib/voice/localIntent) but is
 * importable from a UI-neutral location so backoffice and other screens
 * don't redefine their own local formatter.
 */
export function formatFCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'
}
