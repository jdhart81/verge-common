declare module '@viridis/dfm-core' {
  export const LIGHT_INTENSITIES: readonly string[];
  export function checkConnectivitySync(
    input: unknown,
  ): import('../components/woodland-map-editor').Preview;
  export function toLandscapePackage(
    input: unknown,
    options?: {
      name?: string;
      generator?: string;
      sources?: Record<string, unknown>;
      created?: string;
    },
  ): Record<string, unknown>;
}
