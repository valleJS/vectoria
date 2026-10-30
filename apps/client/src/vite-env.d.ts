interface ImportMetaEnv {
  /** Full WebSocket URL override, e.g. wss://game.example.com/ws. Defaults to same-origin /ws. */
  readonly VITE_WS_URL?: string;
  /** HTTP API origin override, e.g. https://game.example.com. Defaults to same-origin. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
