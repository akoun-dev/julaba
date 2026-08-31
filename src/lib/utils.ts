import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Re-exported from the voice subsystem (its actual home, since localIntent's
// own responses need it) so UI code — backoffice screens especially — has a
// UI-neutral place to import it from without a second, independently
// duplicated implementation.
export { formatFCFA } from '@/lib/voice/localIntent'
