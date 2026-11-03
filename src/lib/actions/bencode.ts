import { createHash } from "node:crypto";

const MAX_DEPTH = 32;

type BencodeValue = number | Uint8Array | BencodeValue[] | Map<string, BencodeValue>;

export type TorrentMetadata = {
  infoHash: string;
  name: string | null;
  files: { path: string; size: number }[];
  pieceSize: number | null;
  pieceCount: number | null;
  trackers: string[];
  createdBy: string | null;
  comment: string | null;
  createdAt: string | null;
};

const ASCII_ZERO = 0x30;
const COLON = 0x3a;
const LETTER_D = 0x64;
const LETTER_E = 0x65;
const LETTER_I = 0x69;
const LETTER_L = 0x6c;

const decoder = new TextDecoder();

// Guarda a posição de `info` porque o infohash é o SHA-1 dos bytes originais desse dicionário.
class BencodeReader {
  position = 0;
  infoSpan: [number, number] | null = null;

  constructor(private readonly bytes: Uint8Array) {}

  read(depth = 0): BencodeValue {
    if (depth > MAX_DEPTH) throw new Error("bencode_too_deep");

    const byte = this.bytes[this.position];

    if (byte === LETTER_I) return this.readInteger();
    if (byte === LETTER_L) return this.readList(depth);
    if (byte === LETTER_D) return this.readDictionary(depth);
    return this.readBytes();
  }

  private readDigits(terminator: number) {
    const start = this.position;
    while (this.position < this.bytes.length && this.bytes[this.position] !== terminator) this.position += 1;
    if (this.position >= this.bytes.length) throw new Error("bencode_truncated");

    const value = Number(decoder.decode(this.bytes.subarray(start, this.position)));
    if (!Number.isSafeInteger(value)) throw new Error("bencode_invalid_number");

    this.position += 1;
    return value;
  }

  private readInteger() {
    this.position += 1;
    return this.readDigits(LETTER_E);
  }

  private readBytes() {
    const first = this.bytes[this.position];
    if (first === undefined || first < ASCII_ZERO || first > ASCII_ZERO + 9) throw new Error("bencode_invalid");

    const length = this.readDigits(COLON);
    const end = this.position + length;
    if (end > this.bytes.length) throw new Error("bencode_truncated");

    const value = this.bytes.subarray(this.position, end);
    this.position = end;
    return value;
  }

  private readList(depth: number) {
    const items: BencodeValue[] = [];
    this.position += 1;

    while (this.bytes[this.position] !== LETTER_E) {
      if (this.position >= this.bytes.length) throw new Error("bencode_truncated");
      items.push(this.read(depth + 1));
    }

    this.position += 1;
    return items;
  }

  private readDictionary(depth: number) {
    const entries = new Map<string, BencodeValue>();
    this.position += 1;

    while (this.bytes[this.position] !== LETTER_E) {
      if (this.position >= this.bytes.length) throw new Error("bencode_truncated");

      const key = decoder.decode(this.readBytes());
      const start = this.position;
      entries.set(key, this.read(depth + 1));
      if (key === "info" && depth === 0) this.infoSpan = [start, this.position];
    }

    this.position += 1;
    return entries;
  }
}

function text(value: BencodeValue | undefined) {
  return value instanceof Uint8Array ? decoder.decode(value) : null;
}

function count(value: BencodeValue | undefined) {
  return typeof value === "number" ? value : null;
}

function readTrackers(root: Map<string, BencodeValue>) {
  const announce = text(root.get("announce"));
  const tiers = root.get("announce-list");
  const listed = Array.isArray(tiers) ? tiers.flatMap((tier) => (Array.isArray(tier) ? tier.map(text) : [])) : [];

  return [...new Set([announce, ...listed].filter((tracker): tracker is string => Boolean(tracker)))];
}

function readFiles(info: Map<string, BencodeValue>, name: string | null) {
  const files = info.get("files");

  if (!Array.isArray(files)) {
    return name ? [{ path: name, size: count(info.get("length")) ?? 0 }] : [];
  }

  return files.flatMap((file) => {
    if (!(file instanceof Map)) return [];

    const segments = file.get("path.utf-8") ?? file.get("path");
    const path = Array.isArray(segments) ? segments.map(text).filter(Boolean).join("/") : null;
    return path ? [{ path, size: count(file.get("length")) ?? 0 }] : [];
  });
}

export function parseTorrent(bytes: Uint8Array): TorrentMetadata {
  const reader = new BencodeReader(bytes);
  const root = reader.read();
  const info = root instanceof Map ? root.get("info") : null;

  if (!(root instanceof Map) || !(info instanceof Map) || !reader.infoSpan) throw new Error("torrent_invalid");

  const [start, end] = reader.infoSpan;
  const name = text(info.get("name.utf-8")) ?? text(info.get("name"));
  const pieces = info.get("pieces");
  const created = count(root.get("creation date"));

  return {
    infoHash: createHash("sha1").update(bytes.subarray(start, end)).digest("hex"),
    name,
    files: readFiles(info, name),
    pieceSize: count(info.get("piece length")),
    pieceCount: pieces instanceof Uint8Array ? Math.floor(pieces.byteLength / 20) : null,
    trackers: readTrackers(root),
    createdBy: text(root.get("created by")),
    comment: text(root.get("comment")),
    createdAt: created ? new Date(created * 1000).toISOString() : null,
  };
}
