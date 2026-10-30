declare module '@viridis/dfm-core' {
  export const LIGHT_INTENSITIES: readonly string[];
  export const SPINE_LINK_KINDS: readonly string[];
  export function checkConnectivitySync(
    input: unknown,
  ): import('../components/woodland-map-editor').Preview;
  /** Draft spine corridors from stream and ridge/valley/saddle lines (dfm-core 0.2.0). */
  export function deriveSpine(input: unknown): {
    engine: string;
    inputChecksum: string | null;
    status: 'ok' | 'incomplete';
    reasons: string[];
    warnings: string[];
    features: import('../components/woodland-map-editor').WoodlandFeature[];
  };
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
