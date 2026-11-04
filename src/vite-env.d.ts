/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Badge and tab title for side-by-side branch builds. Unset = main. */
  readonly VITE_BUILD_LABEL?: string;
}
