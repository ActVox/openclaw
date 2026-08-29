import { isUtf8 } from "node:buffer";
import { detectMime } from "@openclaw/media-core/mime";

const TEXT_APPLICATION_MIME_TYPES = new Set([
  "application/javascript",
  "application/json",
  "application/xml",
  "application/yaml",
  "image/svg+xml",
]);

function isReadableTextMime(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    TEXT_APPLICATION_MIME_TYPES.has(mimeType) ||
    mimeType.endsWith("+json") ||
    mimeType.endsWith("+xml")
  );
}

function hasTextByteOrderMark(buffer: Buffer): boolean {
  return (
    (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) ||
    (buffer.length >= 2 &&
      ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff)))
  );
}

function decodeUtf16ByteOrderMark(buffer: Buffer): string | undefined {
  if (buffer.length < 2) {
    return undefined;
  }
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder("utf-16le", { fatal: true }).decode(buffer.subarray(2));
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder("utf-16be", { fatal: true }).decode(buffer.subarray(2));
  }
  return undefined;
}

async function assertReadableTextBuffer(buffer: Buffer, filePath: string): Promise<void> {
  if (hasTextByteOrderMark(buffer)) {
    return;
  }
  const mimeType = await detectMime({ buffer });
  if (!mimeType || isReadableTextMime(mimeType)) {
    return;
  }
  throw new Error(
    `Read detected ${mimeType} for ${filePath}; read supports text and image files only. Use the matching media, transcription, document, or archive capability instead.`,
  );
}

function assertReadableDecodedText(
  text: string,
  filePath: string,
  rejectDecodeReplacement: boolean,
): void {
  if (text.length === 0) {
    return;
  }
  const hasNul = text.includes("\0");
  let controls = 0;
  let total = 0;
  for (const char of text) {
    total += 1;
    const codePoint = char.codePointAt(0) ?? 0;
    if (
      codePoint === 0 ||
      codePoint === 0x7f ||
      (codePoint < 0x20 && ![0x09, 0x0a, 0x0c, 0x0d, 0x1b].includes(codePoint))
    ) {
      controls += 1;
    }
  }
  if (!hasNul && controls / total <= 0.02 && !rejectDecodeReplacement) {
    return;
  }
  throw new Error(
    `Read detected binary content for ${filePath}; read supports text and image files only. Use the matching media, transcription, document, or archive capability instead.`,
  );
}

export async function decodeReadableTextBuffer(params: {
  buffer: Buffer;
  filePath: string;
  decodeText?: () => string;
  usesCustomDecoder: boolean;
}): Promise<string> {
  await assertReadableTextBuffer(params.buffer, params.filePath);
  const bomDecodedText = params.usesCustomDecoder
    ? undefined
    : decodeUtf16ByteOrderMark(params.buffer);
  const decodedText = bomDecodedText ?? params.decodeText?.() ?? params.buffer.toString("utf8");
  assertReadableDecodedText(
    decodedText,
    params.filePath,
    bomDecodedText === undefined &&
      !params.usesCustomDecoder &&
      !isUtf8(params.buffer) &&
      decodedText.includes("\uFFFD"),
  );
  return decodedText.startsWith("\uFEFF") ? decodedText.slice(1) : decodedText;
}
