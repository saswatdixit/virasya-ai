/**
 * Server-Side Audio Container and Duration Validator
 *
 * Enforces:
 * 1. Strict file size bounds: (0, 5 MiB] (5,242,880 bytes).
 * 2. Magic-byte container format verification (rejects renamed binaries or arbitrary payloads).
 * 3. Deep structural frame/chunk parsing to determine actual audio duration directly from container data.
 * 4. Strict duration bounds: (0, 60.0] seconds.
 * 5. Fail-closed on corrupted, truncated, malformed, or unparsable audio.
 *
 * Compatible with Deno Edge Runtime and Node.js (zero external dependencies).
 */

export const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MiB = 5,242,880 bytes
export const MAX_AUDIO_DURATION_SECONDS = 60.0;

export interface AudioValidationSuccess {
  valid: true;
  format: "wav" | "ogg" | "mp3" | "flac" | "m4a" | "webm";
  durationSeconds: number;
  byteSize: number;
}

export interface AudioValidationFailure {
  valid: false;
  code:
    | "EMPTY_AUDIO"
    | "AUDIO_TOO_LARGE"
    | "UNRECOGNIZED_CONTAINER"
    | "MALFORMED_AUDIO_HEADER"
    | "AUDIO_DURATION_UNVERIFIABLE"
    | "AUDIO_TOO_LONG";
  error: string;
  byteSize: number;
}

export type AudioValidationResult = AudioValidationSuccess | AudioValidationFailure;

/**
 * Validate audio bytes and extract true container duration at trusted server boundary.
 */
export function validateAudioBuffer(buffer: Uint8Array, fileExtension = ""): AudioValidationResult {
  const byteSize = buffer.byteLength;

  if (byteSize === 0) {
    return {
      valid: false,
      code: "EMPTY_AUDIO",
      error: "Audio recording is empty (0 bytes).",
      byteSize,
    };
  }

  if (byteSize > MAX_AUDIO_BYTES) {
    return {
      valid: false,
      code: "AUDIO_TOO_LARGE",
      error: `Audio file size (${byteSize} bytes) exceeds the 5 MiB (5,242,880 bytes) limit.`,
      byteSize,
    };
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // 1. WAV (RIFF WAVE)
  if (byteSize >= 12 && readAscii(buffer, 0, 4) === "RIFF" && readAscii(buffer, 8, 4) === "WAVE") {
    return parseWav(buffer, view, byteSize);
  }

  // 2. OGG (OggS container: Vorbis or Opus)
  if (byteSize >= 14 && readAscii(buffer, 0, 4) === "OggS") {
    return parseOgg(buffer, view, byteSize);
  }

  // 3. FLAC (fLaC)
  if (byteSize >= 42 && readAscii(buffer, 0, 4) === "fLaC") {
    return parseFlac(buffer, view, byteSize);
  }

  // 4. WebM / Matroska (EBML: 0x1A 0x45 0xDF 0xA3)
  if (
    byteSize >= 12 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return parseWebM(buffer, view, byteSize);
  }

  // 5. MP4 / M4A / AAC in BMFF (starts with [size][ftyp])
  if (byteSize >= 12 && readAscii(buffer, 4, 4) === "ftyp") {
    return parseM4a(buffer, view, byteSize);
  }

  // 6. MP3 (ID3v2 or direct MPEG frame sync)
  if (
    (byteSize >= 10 && readAscii(buffer, 0, 3) === "ID3") ||
    isMpegFrameSync(buffer, 0)
  ) {
    return parseMp3(buffer, view, byteSize);
  }

  return {
    valid: false,
    code: "UNRECOGNIZED_CONTAINER",
    error: `Unsupported or invalid audio format. Permitted containers: WAV, OGG, MP3, M4A, FLAC, WebM. File extension was '${fileExtension}'.`,
    byteSize,
  };
}

// -----------------------------------------------------------------------------
// Container Parsers
// -----------------------------------------------------------------------------

function parseWav(buffer: Uint8Array, view: DataView, byteSize: number): AudioValidationResult {
  let offset = 12;
  let sampleRate = 0;
  let byteRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataSize = 0;
  let foundFmt = false;
  let foundData = false;

  while (offset + 8 <= byteSize) {
    const chunkId = readAscii(buffer, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkId === "fmt ") {
      if (chunkSize < 16 || chunkDataOffset + 16 > byteSize) {
        return {
          valid: false,
          code: "MALFORMED_AUDIO_HEADER",
          error: "WAV 'fmt ' chunk is corrupt or truncated.",
          byteSize,
        };
      }
      channels = view.getUint16(chunkDataOffset + 2, true);
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
      byteRate = view.getUint32(chunkDataOffset + 8, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
      foundFmt = true;
    } else if (chunkId === "data") {
      dataSize = chunkSize;
      foundData = true;
      // If dataSize is 0xFFFFFFFF or malformed, clip to available payload
      const availableData = byteSize - chunkDataOffset;
      if (dataSize > availableData) {
        dataSize = availableData;
      }
      break;
    }

    offset += 8 + chunkSize;
    // Chunks in RIFF are word-aligned (2-byte aligned)
    if (chunkSize % 2 !== 0) offset += 1;
  }

  if (!foundFmt || sampleRate <= 0 || channels <= 0) {
    return {
      valid: false,
      code: "MALFORMED_AUDIO_HEADER",
      error: "WAV file does not contain valid audio format specification.",
      byteSize,
    };
  }

  if (!foundData || dataSize <= 0) {
    return {
      valid: false,
      code: "AUDIO_DURATION_UNVERIFIABLE",
      error: "WAV file contains no audio data chunk.",
      byteSize,
    };
  }

  // Derive mathematical byteRate from sampleRate, channels, bitsPerSample to prevent forged rate
  const derivedByteRate = sampleRate * channels * Math.max(1, Math.floor(bitsPerSample / 8));
  if (byteRate <= 0 || Math.abs(byteRate - derivedByteRate) > derivedByteRate * 0.1) {
    byteRate = derivedByteRate;
  }

  const duration = dataSize / byteRate;
  return checkDuration(duration, "wav", byteSize);
}

function parseFlac(buffer: Uint8Array, view: DataView, byteSize: number): AudioValidationResult {
  // STREAMINFO is the first metadata block right after 'fLaC' (offset 4)
  const isLast = (buffer[4] & 0x80) !== 0;
  const blockType = buffer[4] & 0x7f;
  const blockLength = (buffer[5] << 16) | (buffer[6] << 8) | buffer[7];

  if (blockType !== 0 || blockLength < 34 || 8 + blockLength > byteSize) {
    return {
      valid: false,
      code: "MALFORMED_AUDIO_HEADER",
      error: "FLAC STREAMINFO block is corrupt or missing.",
      byteSize,
    };
  }

  // STREAMINFO payload starts at offset 8:
  // bytes 10-17 of payload (offset 18-25 in file):
  // sample_rate (20 bits), channels (3 bits), bits_per_sample (5 bits), total_samples (36 bits)
  const b0 = buffer[18];
  const b1 = buffer[19];
  const b2 = buffer[20];
  const sampleRate = (b0 << 12) | (b1 << 4) | (b2 >> 4);

  const b3 = buffer[21];
  const b4 = buffer[22];
  const b5 = buffer[23];
  const b6 = buffer[24];
  const b7 = buffer[25];

  // total_samples is bottom 4 bits of b2 + b3..b7 (36 bits)
  const top4Bits = b2 & 0x0f;
  const totalSamples =
    top4Bits * 2 ** 32 +
    (b3 * 2 ** 24 + b4 * 2 ** 16 + b5 * 2 ** 8 + b6) +
    b7 / 256;

  if (sampleRate <= 0 || totalSamples <= 0) {
    return {
      valid: false,
      code: "AUDIO_DURATION_UNVERIFIABLE",
      error: "FLAC header does not specify valid sample rate or sample count.",
      byteSize,
    };
  }

  const duration = totalSamples / sampleRate;
  return checkDuration(duration, "flac", byteSize);
}

function parseOgg(buffer: Uint8Array, view: DataView, byteSize: number): AudioValidationResult {
  // Detect codec and sample rate from initial pages
  let sampleRate = 48000; // Default standard for Opus
  let isVorbis = false;

  // Check first packet in first page
  // Page header is 27 bytes + N segments
  const numSegments = buffer[26];
  let firstPacketOffset = 27 + numSegments;

  if (firstPacketOffset + 8 <= byteSize) {
    const packetSig = readAscii(buffer, firstPacketOffset, 8);
    if (packetSig.startsWith("OpusHead")) {
      sampleRate = 48000;
    } else if (packetSig.startsWith("\x01vorbis")) {
      isVorbis = true;
      if (firstPacketOffset + 16 <= byteSize) {
        sampleRate = view.getUint32(firstPacketOffset + 12, true);
      }
    }
  }

  // To find the total stream duration, locate the final Ogg page granule position.
  // We scan backwards from the end of the file for the capture pattern "OggS" (0x4F 0x67 0x67 0x53).
  let lastGranule = -1;
  const searchLimit = Math.max(0, byteSize - 65536); // search last 64 KB

  for (let i = byteSize - 14; i >= searchLimit; i--) {
    if (
      buffer[i] === 0x4f &&
      buffer[i + 1] === 0x67 &&
      buffer[i + 2] === 0x67 &&
      buffer[i + 3] === 0x53
    ) {
      // Found an OggS page header
      // Granule position is an 8-byte little-endian int at offset + 6
      const low = view.getUint32(i + 6, true);
      const high = view.getUint32(i + 10, true);
      // If granule position is not -1 (0xFFFFFFFF 0xFFFFFFFF)
      if (low !== 0xffffffff || high !== 0xffffffff) {
        const granule = high * 2 ** 32 + low;
        if (granule > 0) {
          lastGranule = granule;
          break;
        }
      }
    }
  }

  if (lastGranule <= 0 || sampleRate <= 0) {
    return {
      valid: false,
      code: "AUDIO_DURATION_UNVERIFIABLE",
      error: "Unable to verify Ogg stream granule duration.",
      byteSize,
    };
  }

  const duration = lastGranule / sampleRate;
  return checkDuration(duration, "ogg", byteSize);
}

function parseM4a(buffer: Uint8Array, view: DataView, byteSize: number): AudioValidationResult {
  // ISO BMFF / QuickTime container (M4A / AAC)
  let offset = 0;
  let duration = -1;

  while (offset + 8 <= byteSize) {
    const boxSize = view.getUint32(offset, false);
    const boxType = readAscii(buffer, offset + 4, 4);

    if (boxSize < 8 || offset + boxSize > byteSize + 8) {
      break;
    }

    if (boxType === "moov") {
      duration = parseMoov(buffer, view, offset + 8, offset + boxSize);
      break;
    }

    offset += boxSize;
  }

  if (duration <= 0) {
    return {
      valid: false,
      code: "AUDIO_DURATION_UNVERIFIABLE",
      error: "Could not find valid 'moov' / 'mvhd' duration box in M4A container.",
      byteSize,
    };
  }

  return checkDuration(duration, "m4a", byteSize);
}

function parseMoov(buffer: Uint8Array, view: DataView, start: number, end: number): number {
  let offset = start;

  while (offset + 8 <= end) {
    const boxSize = view.getUint32(offset, false);
    const boxType = readAscii(buffer, offset + 4, 4);

    if (boxSize < 8 || offset + boxSize > end) break;

    if (boxType === "mvhd") {
      const version = buffer[offset + 8];
      let timescale = 0;
      let dur = 0;

      if (version === 0 && offset + 24 <= end) {
        timescale = view.getUint32(offset + 20, false);
        dur = view.getUint32(offset + 24, false);
      } else if (version === 1 && offset + 32 <= end) {
        timescale = view.getUint32(offset + 28, false);
        const highDur = view.getUint32(offset + 32, false);
        const lowDur = view.getUint32(offset + 36, false);
        dur = highDur * 2 ** 32 + lowDur;
      }

      if (timescale > 0 && dur > 0) {
        return dur / timescale;
      }
    }

    offset += boxSize;
  }

  return -1;
}

function parseWebM(buffer: Uint8Array, view: DataView, byteSize: number): AudioValidationResult {
  // EBML Matroska / WebM parser
  // Look for Segment (0x18538067) -> Info (0x1549A966) -> Duration (0x4489)
  let offset = 0;

  // Skip EBML Header
  const headerId = readEbmlId(buffer, offset);
  if (headerId.id !== 0x1a45dfa3) {
    return {
      valid: false,
      code: "MALFORMED_AUDIO_HEADER",
      error: "Invalid WebM EBML header.",
      byteSize,
    };
  }
  offset += headerId.len;
  const headerSize = readEbmlVint(buffer, offset);
  offset += headerSize.len + Number(headerSize.val);

  let timestampScale = 1000000; // default 1 ms (1,000,000 ns)
  let containerDurationSec = -1;
  let maxClusterTimestamp = -1;

  while (offset + 4 <= byteSize) {
    const el = readEbmlId(buffer, offset);
    if (el.id === 0) break;
    offset += el.len;

    const elSize = readEbmlVint(buffer, offset);
    offset += elSize.len;
    const contentLen = Number(elSize.val);

    // Segment (0x18538067)
    if (el.id === 0x18538067) {
      // Continue parsing inside Segment
      continue;
    }

    // Info (0x1549A966) inside Segment
    if (el.id === 0x1549a966) {
      const infoEnd = Math.min(offset + contentLen, byteSize);
      let infoOff = offset;
      while (infoOff + 2 <= infoEnd) {
        const infoEl = readEbmlId(buffer, infoOff);
        if (infoEl.id === 0) break;
        infoOff += infoEl.len;

        const infoSize = readEbmlVint(buffer, infoOff);
        infoOff += infoSize.len;
        const valLen = Number(infoSize.val);

        if (infoEl.id === 0x2ad7b1) {
          // TimestampScale
          if (valLen === 4) timestampScale = view.getUint32(infoOff, false);
          else if (valLen === 2) timestampScale = view.getUint16(infoOff, false);
        } else if (infoEl.id === 0x4489) {
          // Duration (float32 or float64)
          if (valLen === 4) {
            containerDurationSec = (view.getFloat32(infoOff, false) * timestampScale) / 1e9;
          } else if (valLen === 8) {
            containerDurationSec = (view.getFloat64(infoOff, false) * timestampScale) / 1e9;
          }
        }

        infoOff += valLen;
      }

      if (containerDurationSec > 0) {
        return checkDuration(containerDurationSec, "webm", byteSize);
      }
    }

    // Cluster (0x1F43B675)
    if (el.id === 0x1f43b675) {
      const clusterEnd = Math.min(offset + contentLen, byteSize);
      let clOff = offset;
      while (clOff + 2 <= clusterEnd) {
        const clEl = readEbmlId(buffer, clOff);
        if (clEl.id === 0) break;
        clOff += clEl.len;

        const clSize = readEbmlVint(buffer, clOff);
        clOff += clSize.len;
        const clLen = Number(clSize.val);

        if (clEl.id === 0xe7) {
          // Cluster Timestamp
          let ts = 0;
          for (let k = 0; k < clLen; k++) {
            ts = ts * 256 + buffer[clOff + k];
          }
          if (ts > maxClusterTimestamp) maxClusterTimestamp = ts;
        }

        clOff += clLen;
      }
    }

    offset += contentLen;
  }

  if (maxClusterTimestamp > 0) {
    const clusterDur = (maxClusterTimestamp * timestampScale) / 1e9;
    return checkDuration(clusterDur, "webm", byteSize);
  }

  return {
    valid: false,
    code: "AUDIO_DURATION_UNVERIFIABLE",
    error: "WebM container does not contain verifiable duration or timestamp clusters.",
    byteSize,
  };
}

function parseMp3(buffer: Uint8Array, view: DataView, byteSize: number): AudioValidationResult {
  let offset = 0;

  // Skip ID3v2 tag if present
  if (byteSize >= 10 && readAscii(buffer, 0, 3) === "ID3") {
    const tagSize =
      ((buffer[6] & 0x7f) << 21) |
      ((buffer[7] & 0x7f) << 14) |
      ((buffer[8] & 0x7f) << 7) |
      (buffer[9] & 0x7f);
    offset = 10 + tagSize;
  }

  // Find first MPEG audio frame
  while (offset + 4 <= byteSize && !isMpegFrameSync(buffer, offset)) {
    offset++;
  }

  if (offset + 4 > byteSize) {
    return {
      valid: false,
      code: "MALFORMED_AUDIO_HEADER",
      error: "No valid MPEG audio frame sync found in MP3 file.",
      byteSize,
    };
  }

  const h0 = buffer[offset];
  const h1 = buffer[offset + 1];
  const h2 = buffer[offset + 2];
  const h3 = buffer[offset + 3];

  const versionBits = (h1 >> 3) & 0x03; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
  const layerBits = (h1 >> 1) & 0x03; // 1 = Layer III
  const sampleRateIdx = (h2 >> 2) & 0x03;
  const channelMode = (h3 >> 6) & 0x03;

  if (layerBits !== 1 || sampleRateIdx === 3) {
    return {
      valid: false,
      code: "MALFORMED_AUDIO_HEADER",
      error: "Unsupported MPEG audio layer or sample rate.",
      byteSize,
    };
  }

  const sampleRateMap = [44100, 48000, 32000];
  const sampleRate = sampleRateMap[sampleRateIdx] || 44100;
  const isMono = channelMode === 3;
  const samplesPerFrame = versionBits === 3 ? 1152 : 576;

  // Check for Xing / Info header in first frame
  const xingOffset = offset + (versionBits === 3 ? (isMono ? 21 : 36) : isMono ? 13 : 21);
  if (xingOffset + 12 <= byteSize) {
    const tag = readAscii(buffer, xingOffset, 4);
    if (tag === "Xing" || tag === "Info") {
      const flags = view.getUint32(xingOffset + 4, false);
      if ((flags & 0x01) !== 0) {
        const totalFrames = view.getUint32(xingOffset + 8, false);
        if (totalFrames > 0) {
          const duration = (totalFrames * samplesPerFrame) / sampleRate;
          return checkDuration(duration, "mp3", byteSize);
        }
      }
    }
  }

  // Scan MPEG frames across the file
  let frameCount = 0;
  let scanOffset = offset;

  while (scanOffset + 4 <= byteSize) {
    if (!isMpegFrameSync(buffer, scanOffset)) {
      scanOffset++;
      continue;
    }

    const b1 = buffer[scanOffset + 1];
    const b2 = buffer[scanOffset + 2];
    const brIdx = (b2 >> 4) & 0x0f;
    const srIdx = (b2 >> 2) & 0x03;
    const pad = (b2 >> 1) & 0x01;

    if (brIdx === 0 || brIdx === 15 || srIdx === 3) {
      scanOffset++;
      continue;
    }

    // Bitrate table for MPEG-1 Layer III (kbps)
    const bitrateTable = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
    const bitrate = bitrateTable[brIdx] * 1000;
    const curSampleRate = sampleRateMap[srIdx] || sampleRate;

    const frameLen = Math.floor((144 * bitrate) / curSampleRate) + pad;
    if (frameLen <= 4) {
      scanOffset++;
      continue;
    }

    frameCount++;
    const currentDur = (frameCount * samplesPerFrame) / curSampleRate;
    if (currentDur > MAX_AUDIO_DURATION_SECONDS) {
      return {
        valid: false,
        code: "AUDIO_TOO_LONG",
        error: `Audio duration (${currentDur.toFixed(1)}s) exceeds the maximum limit of 60 seconds.`,
        byteSize,
      };
    }

    scanOffset += frameLen;
  }

  if (frameCount < 2) {
    return {
      valid: false,
      code: "AUDIO_DURATION_UNVERIFIABLE",
      error: "Unable to verify frame sequence in MP3 file.",
      byteSize,
    };
  }

  const finalDuration = (frameCount * samplesPerFrame) / sampleRate;
  return checkDuration(finalDuration, "mp3", byteSize);
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function checkDuration(
  duration: number,
  format: "wav" | "ogg" | "mp3" | "flac" | "m4a" | "webm",
  byteSize: number
): AudioValidationResult {
  if (isNaN(duration) || duration <= 0) {
    return {
      valid: false,
      code: "AUDIO_DURATION_UNVERIFIABLE",
      error: `Could not verify a positive audio duration for format '${format}'.`,
      byteSize,
    };
  }

  if (duration > MAX_AUDIO_DURATION_SECONDS) {
    return {
      valid: false,
      code: "AUDIO_TOO_LONG",
      error: `Audio duration (${duration.toFixed(1)}s) exceeds the maximum limit of 60 seconds.`,
      byteSize,
    };
  }

  return {
    valid: true,
    format,
    durationSeconds: Math.round(duration * 100) / 100,
    byteSize,
  };
}

function readAscii(buffer: Uint8Array, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length && offset + i < buffer.byteLength; i++) {
    s += String.fromCharCode(buffer[offset + i]);
  }
  return s;
}

function isMpegFrameSync(buffer: Uint8Array, offset: number): boolean {
  if (offset + 1 >= buffer.byteLength) return false;
  return buffer[offset] === 0xff && (buffer[offset + 1] & 0xe0) === 0xe0;
}

function readEbmlId(buffer: Uint8Array, offset: number): { id: number; len: number } {
  if (offset >= buffer.byteLength) return { id: 0, len: 0 };
  const first = buffer[offset];
  let numBytes = 0;
  if ((first & 0x80) !== 0) numBytes = 1;
  else if ((first & 0x40) !== 0) numBytes = 2;
  else if ((first & 0x20) !== 0) numBytes = 3;
  else if ((first & 0x10) !== 0) numBytes = 4;
  else return { id: 0, len: 0 };

  if (offset + numBytes > buffer.byteLength) return { id: 0, len: 0 };
  let id = 0;
  for (let i = 0; i < numBytes; i++) {
    id = id * 256 + buffer[offset + i];
  }
  return { id, len: numBytes };
}

function readEbmlVint(buffer: Uint8Array, offset: number): { val: bigint; len: number } {
  if (offset >= buffer.byteLength) return { val: 0n, len: 0 };
  const first = buffer[offset];
  let numBytes = 0;
  let mask = 0;

  if ((first & 0x80) !== 0) {
    numBytes = 1;
    mask = 0x7f;
  } else if ((first & 0x40) !== 0) {
    numBytes = 2;
    mask = 0x3f;
  } else if ((first & 0x20) !== 0) {
    numBytes = 3;
    mask = 0x1f;
  } else if ((first & 0x10) !== 0) {
    numBytes = 4;
    mask = 0x0f;
  } else if ((first & 0x08) !== 0) {
    numBytes = 5;
    mask = 0x07;
  } else if ((first & 0x04) !== 0) {
    numBytes = 6;
    mask = 0x03;
  } else if ((first & 0x02) !== 0) {
    numBytes = 7;
    mask = 0x01;
  } else if ((first & 0x01) !== 0) {
    numBytes = 8;
    mask = 0x00;
  } else {
    return { val: 0n, len: 0 };
  }

  if (offset + numBytes > buffer.byteLength) return { val: 0n, len: 0 };
  let val = BigInt(first & mask);
  for (let i = 1; i < numBytes; i++) {
    val = (val << 8n) | BigInt(buffer[offset + i]);
  }
  return { val, len: numBytes };
}
