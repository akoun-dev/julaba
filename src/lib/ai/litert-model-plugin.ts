import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export interface GemmaLocalInfo {
  bytes: number
  expectedBytes: number
  version: string
  sha256?: string
}

export interface GemmaDownloadProgress {
  downloadedBytes: number
  totalBytes: number
  percent: number
}

export interface GemmaDownloadState {
  state: 'idle' | 'downloading' | 'verifying' | 'ready' | 'error' | 'cancelled'
  errorCode?: string
  message?: string
}

export interface LiteRtModelPlugin {
  isAvailable(): Promise<{ available: boolean; modelReady: boolean; reason?: string }>
  getLocalInfo(): Promise<GemmaLocalInfo>
  download(options: { url: string; version: string; sha256: string; expectedBytes: number }): Promise<void>
  cancel(): Promise<void>
  remove(): Promise<void>
  addListener(eventName: 'downloadProgress', listenerFunc: (data: GemmaDownloadProgress) => void): Promise<PluginListenerHandle>
  addListener(eventName: 'downloadState', listenerFunc: (data: GemmaDownloadState) => void): Promise<PluginListenerHandle>
  generate(options: {
    systemPrompt: string
    prompt: string
    maxTokens?: number
    temperature?: number
  }): Promise<{ text: string }>
}

export const LiteRtModel = registerPlugin<LiteRtModelPlugin>('LiteRtModel')
