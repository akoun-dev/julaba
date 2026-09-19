// Fichiers de configuration du port ONNX dioula — EMBARQUÉS dans l'app.
//
// MODE-914 (voix dioula opt-in) : contrairement au pilote baoulé (dont les
// petits fichiers sont téléchargés depuis le dépôt Hugging Face
// onnx-community/mms-tts-aka-ONNX), le port dioula a été produit PAR NOUS
// (optimum-cli export, facebook/mms-tts-dyu → ONNX fp32 114 Mo) et n'existe
// dans aucun dépôt HF. Ces cinq fichiers sont donc copiés TELS QUELS depuis
// l'export optimum (prouvé par synthèse WAV, scripts/synthese-dyu-test.py)
// et embarqués ici : seuls les 114 Mo du poids sont téléchargés, via le
// proxy streaming de l'app (/api/voix/dyu-model → GitHub Releases — GitHub
// n'envoie pas d'en-têtes CORS, un fetch navigateur direct échouerait).
//
// Provenance des poids : https://huggingface.co/facebook/mms-tts-dyu (Meta
// MMS-TTS, VITS 16 kHz) — LICENCE CC-BY-NC-4.0 : pilote/évaluation
// uniquement, production commerciale = décision dédiée (même cadre que le
// pilote baoulé B3-033/034).
//
// À l'installation (downloadMmsDyuVoice), ces fichiers sont écrits dans le
// Cache API sous les clés HF virtuelles de MMS_DYU_MODEL_ID (mms-tts.ts) :
// transformers.js v2 trouve tout localement et ne touche JAMAIS au réseau
// pour cet identifiant.

/** config.json de l'export optimum (VitsModel, 16 kHz, vocab 32+unk). */
export const MMS_DYU_MODEL_CONFIG: Record<string, unknown> = {
  _attn_implementation_autoset: true,
  _name_or_path: 'facebook/mms-tts-dyu',
  activation_dropout: 0.1,
  architectures: ['VitsModel'],
  attention_dropout: 0.1,
  depth_separable_channels: 2,
  depth_separable_num_layers: 3,
  duration_predictor_dropout: 0.5,
  duration_predictor_filter_channels: 256,
  duration_predictor_flow_bins: 10,
  duration_predictor_kernel_size: 3,
  duration_predictor_num_flows: 4,
  duration_predictor_tail_bound: 5.0,
  ffn_dim: 768,
  ffn_kernel_size: 3,
  flow_size: 192,
  hidden_act: 'relu',
  hidden_dropout: 0.1,
  hidden_size: 192,
  initializer_range: 0.02,
  layer_norm_eps: 1e-05,
  layerdrop: 0.1,
  leaky_relu_slope: 0.1,
  model_type: 'vits',
  noise_scale: 0.667,
  noise_scale_duration: 0.8,
  num_attention_heads: 2,
  num_hidden_layers: 6,
  num_speakers: 1,
  posterior_encoder_num_wavenet_layers: 16,
  prior_encoder_num_flows: 4,
  prior_encoder_num_wavenet_layers: 4,
  resblock_dilation_sizes: [[1, 3, 5], [1, 3, 5], [1, 3, 5]],
  resblock_kernel_sizes: [3, 7, 11],
  sampling_rate: 16000,
  speaker_embedding_size: 0,
  speaking_rate: 1.0,
  spectrogram_bins: 513,
  transformers_version: '4.46.3',
  upsample_initial_channel: 512,
  upsample_kernel_sizes: [16, 16, 4, 4],
  upsample_rates: [8, 8, 2, 2],
  use_bias: true,
  use_stochastic_duration_prediction: true,
  vocab_size: 32,
  wavenet_dilation_rate: 1,
  wavenet_dropout: 0.0,
  wavenet_kernel_size: 5,
  window_size: 4,
}

/** vocab.json du checkpoint dyu : 26 lettres latines + ŋ ɔ ɛ ɲ + espace,
 * apostrophe, tiret et underscore (AUCUN chiffre — voir normalizeDyuText). */
export const MMS_DYU_VOCAB: Record<string, number> = {
  ' ': 17,
  "'": 14,
  '-': 18,
  _: 13,
  a: 23,
  b: 2,
  c: 31,
  d: 27,
  e: 30,
  f: 16,
  g: 19,
  h: 11,
  i: 12,
  j: 4,
  k: 24,
  l: 15,
  m: 10,
  n: 20,
  o: 7,
  p: 6,
  r: 28,
  s: 8,
  t: 0,
  u: 3,
  v: 26,
  w: 9,
  y: 1,
  z: 21,
  'ŋ': 29,
  'ɔ': 25,
  'ɛ': 22,
  'ɲ': 5,
}

/** tokenizer_config.json (VitsTokenizer — pad « t », unk hors vocab). */
export const MMS_DYU_TOKENIZER_CONFIG = {
  add_blank: true,
  added_tokens_decoder: {
    '0': {
      content: 't',
      lstrip: false,
      normalized: false,
      rstrip: false,
      single_word: false,
      special: true,
    },
    '32': {
      content: '<unk>',
      lstrip: false,
      normalized: false,
      rstrip: false,
      single_word: false,
      special: true,
    },
  },
  clean_up_tokenization_spaces: true,
  is_uroman: false,
  language: 'dyu',
  model_max_length: 1e28,
  normalize: true,
  pad_token: 't',
  phonemize: false,
  tokenizer_class: 'VitsTokenizer',
  unk_token: '<unk>',
} as const

/** special_tokens_map.json. */
export const MMS_DYU_SPECIAL_TOKENS_MAP = {
  pad_token: 't',
  unk_token: '<unk>',
} as const

/** added_tokens.json (unk hors vocab char-level). */
export const MMS_DYU_ADDED_TOKENS = {
  '<unk>': 32,
} as const
