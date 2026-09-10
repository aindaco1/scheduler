import { fetchWithTimeout } from "@dustwave/worker-core/provider-fetch";
import { AppError } from "./model";

// Keep the shared timeout alive through the response body. Only the iCloud
// adapter follows redirects, after validating each destination itself.
export function fetchProvider(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  maximumBytes = 2_000_000,
): Promise<Response> {
  return fetchWithTimeout(input, { ...init, redirect: "manual" }, timeoutMs, {
    fetchTarget: async (target, options) => {
      const response = await fetch(target, options);
      if (!response.body) return response;
      const reader = response.body.getReader();
      const signal = options!.signal!;
      const abort = () => {
        void reader.cancel().catch(() => {});
      };
      signal.addEventListener("abort", abort, { once: true });
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          if (signal.aborted)
            throw new AppError("provider_unavailable", 503, true);
          const { done, value } = await reader.read();
          if (signal.aborted)
            throw new AppError("provider_unavailable", 503, true);
          if (done) break;
          size += value.byteLength;
          if (size > maximumBytes)
            throw new AppError("provider_response_too_large", 503);
          chunks.push(value);
        }
      } catch (error) {
        void reader.cancel().catch(() => {});
        throw error;
      } finally {
        signal.removeEventListener("abort", abort);
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return new Response(bytes, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
  });
}
