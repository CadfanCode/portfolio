/**
 * Types for the one environment variable the app reads.
 *
 * `vite/client` gives `ImportMetaEnv` an index signature, so without this
 * declaration `import.meta.env.VITE_SAFE_AUTH_URL` type-checks as `any` and a
 * typo in the name is a runtime `undefined` rather than a compile error.
 * Declaring it is the same habit `virtual-cv.d.ts` follows for the CV plugin.
 */
interface ImportMetaEnv {
  /**
   * Where the `safe-auth` backend lives, for the safe exhibit.
   *
   * Unset is the normal case and is not a misconfiguration. In development the
   * exhibit falls back to `/safe-auth`, which `vite.config.ts` proxies to
   * localhost:8080; on a deploy with no backend that path 404s immediately and
   * the exhibit runs its recorded transcript. Set this only when there is a
   * real deployment to point at.
   */
  readonly VITE_SAFE_AUTH_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
