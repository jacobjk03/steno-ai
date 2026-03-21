/**
 * Pure-JS vector operations for SQLite — no native extensions needed.
 */

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export function serializeEmbedding(embedding: number[]): Buffer {
  const arr = new Float32Array(embedding);
  return Buffer.from(arr.buffer);
}

export function deserializeEmbedding(blob: Buffer): Float32Array {
  // Ensure proper alignment by copying into a new ArrayBuffer
  const ab = new ArrayBuffer(blob.byteLength);
  const view = new Uint8Array(ab);
  view.set(new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength));
  return new Float32Array(ab);
}
