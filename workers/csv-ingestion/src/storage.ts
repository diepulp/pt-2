/**
 * Storage Client
 *
 * Wraps the Supabase JS client to generate signed URLs for the `imports`
 * storage bucket and download the CSV content as a Web ReadableStream.
 *
 * The Supabase JS client is used ONLY for Storage operations here — all
 * database queries go through the `pg` pool in `repo.ts`.
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

import { createClient } from '@supabase/supabase-js';

import type { Config } from './config.js';

/** Name of the Supabase Storage bucket holding uploaded CSV files. */
const IMPORTS_BUCKET = 'imports';

/**
 * Create a storage client bound to the configured Supabase project.
 *
 * The service_role key is used so that bucket access bypasses RLS. The
 * `imports` bucket has no RLS policies (private, server-only access).
 *
 * @param config - Validated worker configuration.
 * @returns Object with methods for signed URL generation and CSV download.
 */
export function createStorageClient(config: Config) {
  const supabase = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
  );

  return {
    /**
     * Generate a short-lived signed URL for a file in the imports bucket.
     *
     * @param storagePath - Path within the bucket (e.g. `imports/<casino_id>/<batch_id>.csv`).
     * @returns Signed URL string valid for `STORAGE_SIGNED_URL_EXPIRY_SECONDS`.
     * @throws Error if the Supabase Storage API returns an error or no URL.
     */
    async getSignedUrl(storagePath: string): Promise<string> {
      const { data, error } = await supabase.storage
        .from(IMPORTS_BUCKET)
        .createSignedUrl(storagePath, config.STORAGE_SIGNED_URL_EXPIRY_SECONDS);

      if (error !== null || data?.signedUrl === undefined) {
        throw new Error(
          `Storage signed URL failed for path "${storagePath}": ${error?.message ?? 'no URL returned'}`,
        );
      }

      return data.signedUrl;
    },

    /**
     * Download a CSV file by its signed URL and return the response body as
     * a Web `ReadableStream<Uint8Array>`.
     *
     * The stream is handed directly to the CSV parser in `ingest.ts` so the
     * file is never fully buffered in memory.
     *
     * @param signedUrl - A valid signed URL returned by {@link getSignedUrl}.
     * @returns Web ReadableStream of the CSV bytes.
     * @throws Error if the HTTP response is not OK or the body is null.
     */
    async downloadStream(
      signedUrl: string,
    ): Promise<ReadableStream<Uint8Array>> {
      const response = await fetch(signedUrl);

      if (!response.ok) {
        throw new Error(
          `Storage download failed with HTTP ${response.status} ${response.statusText}`,
        );
      }

      if (response.body === null) {
        throw new Error('Storage download returned an empty body');
      }

      return response.body;
    },
  };
}

/** Inferred type of the storage client returned by {@link createStorageClient}. */
export type StorageClient = ReturnType<typeof createStorageClient>;
