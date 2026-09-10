import { imageDimensions } from "@dustwave/media-core/image-dimensions";
import { AppError } from "./model";

import { LOGO_MAX_BYTES, LOGO_MAX_DIMENSION, LOGO_TYPES } from "./logo-policy";

export function validateLogo(bytes: Uint8Array, contentType: string) {
  if (bytes.length > LOGO_MAX_BYTES) throw new AppError("logo_too_large", 413);
  if (!LOGO_TYPES.includes(contentType)) throw new AppError("invalid_logo");
  const dimensions = imageDimensions(bytes, contentType);
  if (!dimensions) throw new AppError("invalid_logo");
  const complete =
    contentType === "image/png"
      ? bytes.length >= 45 &&
        [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130].every(
          (byte, i) => bytes[bytes.length - 12 + i] === byte,
        )
      : bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (!complete) throw new AppError("invalid_logo");
  if (
    dimensions.width > LOGO_MAX_DIMENSION ||
    dimensions.height > LOGO_MAX_DIMENSION
  )
    throw new AppError("logo_dimensions");
  return dimensions;
}
