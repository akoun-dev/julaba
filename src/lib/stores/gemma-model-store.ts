import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  addGemmaDownloadListeners,
  cancelGemmaDownload,
  downloadGemmaModel,
  getGemmaAvailability,
  mapGemmaError,
  removeGemmaModel,
  type GemmaModelErrorCode,
} from '@/lib/ai/gemma-model'

export type GemmaModelStatus = 'idle' | 'checking' | 'waiting-network' | 'preparing' | 'downloading' | 'verifying' | 'ready' | 'error' | 'cancelled' | 'unsupported'

interface GemmaModelState {
  status: GemmaModelStatus
  progressPercent: number
  downloadedBytes: number
  totalBytes: number
  modelVersion: string | null
  modelReady: boolean
  errorCode: GemmaModelErrorCode | null
  errorMessage: string | null
  lastErrorAt: number | null
  lastCheckedAt: number | null
  refreshStatus: () => Promise<void>
  startDownload: () => Promise<void>
  retryDownload: () => Promise<void>
  cancelDownload: () => Promise<void>
  removeModel: () => Promise<void>
}

let downloadPromise: Promise<void> | null = null
let removeListeners: (() => Promise<void>) | null = null

export const useGemmaModelStore = create<GemmaModelState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      progressPercent: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      modelVersion: null,
      modelReady: false,
      errorCode: null,
      errorMessage: null,
      lastErrorAt: null,
      lastCheckedAt: null,

      refreshStatus: async () => {
        if (downloadPromise) return
        set({ status: 'checking' })
        try {
          const result = await getGemmaAvailability()
          const checkedAt = Date.now()
          if (!result.available) {
            set({ status: 'unsupported', modelReady: false, errorCode: 'NATIVE_UNSUPPORTED', errorMessage: 'Cet appareil ne prend pas en charge l’assistant hors ligne.', lastCheckedAt: checkedAt })
            return
          }
          set({ status: result.modelReady ? 'ready' : 'idle', modelReady: result.modelReady, modelVersion: result.modelReady ? 'Gemma3-1B-IT_multi-prefill-seq_q4_ekv4096' : null, errorCode: null, errorMessage: null, lastCheckedAt: checkedAt })
        } catch (error) {
          const mapped = mapGemmaError(error)
          set({ status: 'error', modelReady: false, errorCode: mapped.code, errorMessage: mapped.message, lastErrorAt: Date.now(), lastCheckedAt: Date.now() })
        }
      },

      startDownload: async () => {
        if (get().modelReady || get().status === 'downloading' || get().status === 'preparing' || get().status === 'verifying') return
        if (downloadPromise) return downloadPromise

        set({ status: 'preparing', errorCode: null, errorMessage: null, progressPercent: 0 })

        // Assign the shared promise before the first await. This closes the
        // synchronous race between two screens starting the same download.
        downloadPromise = (async () => {
          try {
            removeListeners = await addGemmaDownloadListeners(
              (progress) => set({ status: 'downloading', progressPercent: progress.percent, downloadedBytes: progress.downloadedBytes, totalBytes: progress.totalBytes }),
              (state) => {
                if (state.state === 'verifying') set({ status: 'verifying' })
                if (state.state === 'cancelled') set({ status: 'cancelled', modelReady: false, errorCode: 'DOWNLOAD_CANCELLED', errorMessage: 'Téléchargement annulé.' })
                if (state.state === 'error') {
                  const mapped = mapGemmaError(new Error(state.errorCode || state.message || '[UNKNOWN]'))
                  set({ status: 'error', modelReady: false, errorCode: mapped.code, errorMessage: mapped.message, lastErrorAt: Date.now() })
                }
                if (state.state === 'ready') set({ status: 'ready', modelReady: true, modelVersion: 'Gemma3-1B-IT_multi-prefill-seq_q4_ekv4096', progressPercent: 100, errorCode: null, errorMessage: null })
              },
            )
            await downloadGemmaModel()
            set({ status: 'ready', modelReady: true, progressPercent: 100, errorCode: null, errorMessage: null })
          } catch (error) {
            const mapped = mapGemmaError(error)
            set({ status: mapped.code === 'DOWNLOAD_CANCELLED' ? 'cancelled' : 'error', modelReady: false, errorCode: mapped.code, errorMessage: mapped.message, lastErrorAt: Date.now() })
          } finally {
            await removeListeners?.()
            removeListeners = null
            downloadPromise = null
          }
        })()

        return downloadPromise
      },

      retryDownload: async () => {
        await get().startDownload()
      },

      cancelDownload: async () => {
        await cancelGemmaDownload()
        set({ status: 'cancelled', errorCode: 'DOWNLOAD_CANCELLED', errorMessage: 'Téléchargement annulé.' })
      },

      removeModel: async () => {
        if (downloadPromise) return
        await removeGemmaModel()
        set({ status: 'idle', modelReady: false, modelVersion: null, progressPercent: 0, downloadedBytes: 0, totalBytes: 0, errorCode: null, errorMessage: null })
      },
    }),
    {
      name: 'julaba-gemma-model',
      partialize: (state) => ({
        modelVersion: state.modelVersion,
        modelReady: state.modelReady,
        lastErrorAt: state.lastErrorAt,
        lastCheckedAt: state.lastCheckedAt,
      }),
    },
  ),
)
