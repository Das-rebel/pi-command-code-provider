/**
 * Image encoding for the Command Code provider.
 *
 * Converts ImageContent parts from the PI framework into the upstream
 * base64 image format expected by the CommandCode API.
 *
 * PI's ImageContent has: { type: "image", data: string, mimeType: string }
 * where data is already base64-encoded.
 */

import type { ImageContent } from "@mariozechner/pi-ai";

import type { CommandCodeImage } from "./types.js";

/**
 * Encode an ImageContent into the CommandCode upstream image format.
 *
 * PI already provides base64 data and mimeType directly on ImageContent.
 * Returns null if data is empty.
 */
export function encodeImage(image: ImageContent): CommandCodeImage | null {
  if (!image.data || image.data.length === 0) return null;

  return {
    type: "image",
    source: {
      type: "base64",
      media_type: image.mimeType || "image/png",
      data: image.data,
    },
  };
}
