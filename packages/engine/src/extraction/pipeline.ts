import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { LLMAdapter } from '../adapters/llm.js';
import type { SourceType } from '../config.js';
import type {
  ExtractionInput,
  PipelineResult,
  ExtractedFact,
  ExtractedEntity,
  ExtractedEdge,
} from './types.js';
import { extractHeuristic } from './heuristic.js';
import { extractWithLLM, normalizeEntityName } from './llm-extractor.js';
import { deduplicateFacts } from './dedup.js';
import { processContradictions } from './contradiction.js';
import { buildEntityIdMap, persistEdges } from './entity-extractor.js';
import { hashInput } from './hasher.js';
import { updateScratchpad } from '../scratchpad/scratchpad.js';

export interface PipelineConfig {
  storage: StorageAdapter;
  embedding: EmbeddingAdapter;
  cheapLLM: LLMAdapter;
  smartLLM?: LLMAdapter;
  extractionTier?: 'heuristic_only' | 'cheap_only' | 'auto' | 'smart_only';
  embeddingModel: string;
  embeddingDim: number;
  decayHalfLifeDays?: number;
  decayNormalizationK?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function inputToText(input: ExtractionInput): string {
  if (typeof input.data === 'string') return input.data;
  if (typeof input.data === 'object' && input.data !== null) {
    const data = input.data as Record<string, unknown>;
    if (Array.isArray(data.messages)) {
      return (data.messages as unknown[])
        .filter((m): m is { role: string; content: string } =>
          typeof m === 'object' && m !== null &&
          typeof (m as Record<string, unknown>).role === 'string' &&
          typeof (m as Record<string, unknown>).content === 'string',
        )
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');
    }
    return JSON.stringify(input.data);
  }
  return String(input.data);
}

export function mergeFacts(
  heuristic: ExtractedFact[],
  llm: ExtractedFact[],
): ExtractedFact[] {
  const llmContents = new Set(llm.map(f => f.content.toLowerCase()));
  const unique = heuristic.filter(f => !llmContents.has(f.content.toLowerCase()));
  return [...llm, ...unique];
}

export function mergeEntities(
  heuristic: ExtractedEntity[],
  llm: ExtractedEntity[],
): ExtractedEntity[] {
  const seen = new Map<string, ExtractedEntity>();
  for (const e of [...heuristic, ...llm]) {
    const normalized = normalizeEntityName(e.canonicalName);
    if (normalized.length === 0) continue;
    seen.set(normalized, { ...e, canonicalName: normalized });
  }
  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// Core extraction logic (shared between pipeline and queue worker)
// ---------------------------------------------------------------------------

async function executeExtraction(
  config: PipelineConfig,
  extractionId: string,
  input: ExtractionInput,
  startTime: number,
): Promise<PipelineResult> {
  const tier = config.extractionTier ?? 'auto';
  const textContent = inputToText(input);

  let totalTokensInput = 0;
  let totalTokensOutput = 0;
  const tiersUsed: string[] = [];

  // Run heuristic extraction (always)
  const heuristicResult = extractHeuristic(textContent);
  tiersUsed.push('heuristic');

  let mergedFacts: ExtractedFact[] = heuristicResult.facts;
  let mergedEntities: ExtractedEntity[] = heuristicResult.entities;
  let mergedEdges: ExtractedEdge[] = heuristicResult.edges;

  // Run LLM extraction (unless heuristic_only)
  if (tier !== 'heuristic_only') {
    const llmToUse = tier === 'smart_only' ? (config.smartLLM ?? config.cheapLLM) : config.cheapLLM;
    const llmTier = tier === 'smart_only' ? 'smart_llm' : 'cheap_llm';

    // Fetch existing facts for the LLM to compare against (enables contradiction detection)
    let existingFactsForLLM = input.existingFacts?.map(f => ({
      lineageId: f.lineageId,
      content: f.content,
    }));

    if (!existingFactsForLLM || existingFactsForLLM.length === 0) {
      try {
        const queryEmbedding = await config.embedding.embed(textContent.slice(0, 1000));
        const similar = await config.storage.vectorSearch({
          embedding: queryEmbedding,
          tenantId: input.tenantId,
          scope: input.scope,
          scopeId: input.scopeId,
          limit: 20,
          minSimilarity: 0.3,
          validOnly: true,
        });
        if (similar.length > 0) {
          existingFactsForLLM = similar.map(s => ({
            lineageId: s.fact.lineageId ?? s.fact.id,
            content: s.fact.content,
          }));
        }
      } catch {
        // Non-fatal — extraction continues without existing facts
      }
    }

    const llmResult = await extractWithLLM(
      { llm: llmToUse, tier: llmTier },
      textContent,
      existingFactsForLLM,
    );

    totalTokensInput += llmResult.tokensInput;
    totalTokensOutput += llmResult.tokensOutput;
    tiersUsed.push(llmTier);

    // Escalate to smart LLM if confidence is low
    let finalLLMResult = llmResult;
    if (
      tier === 'auto' &&
      llmResult.confidence < 0.6 &&
      config.smartLLM
    ) {
      const smartResult = await extractWithLLM(
        { llm: config.smartLLM, tier: 'smart_llm' },
        textContent,
        existingFactsForLLM,
      );
      totalTokensInput += smartResult.tokensInput;
      totalTokensOutput += smartResult.tokensOutput;
      tiersUsed.push('smart_llm');
      finalLLMResult = smartResult;
    }

    // Merge results: LLM takes priority
    mergedFacts = mergeFacts(heuristicResult.facts, finalLLMResult.facts);

    // Merge entities: dedup by canonicalName, LLM overwrites heuristic
    mergedEntities = mergeEntities(heuristicResult.entities, finalLLMResult.entities);
    mergedEdges = [...heuristicResult.edges, ...finalLLMResult.edges];
  }

  // Run deduplication against existing memories
  const dedupedFacts = await deduplicateFacts(
    {
      storage: config.storage,
      embedding: config.embedding,
      llm: config.cheapLLM,
    },
    mergedFacts,
    input.tenantId,
    input.scope,
    input.scopeId,
  );

  // Process contradictions
  const contradictionResults = processContradictions(dedupedFacts);

  // Persist facts
  let factsCreated = 0;
  let factsUpdated = 0;
  let factsInvalidated = 0;
  let entitiesCreated = 0;
  let edgesCreated = 0;

  // Determine the final tier label
  const uniqueTiers = [...new Set(tiersUsed)];
  const tierUsed: PipelineResult['tier'] = uniqueTiers.length > 1 ? 'multi_tier' :
    (uniqueTiers[0] === 'heuristic' ? 'heuristic' :
      uniqueTiers[0] === 'cheap_llm' ? 'cheap_llm' : 'smart_llm');

  // Ensure "User" entity exists — LLM creates edges like "user → shops_at → target"
  // but never extracts "user" as an entity, so those edges get silently dropped.
  if (!mergedEntities.some(e => e.canonicalName === 'user')) {
    mergedEntities.push({
      name: 'User',
      entityType: 'person',
      canonicalName: 'user',
      properties: { scopeId: input.scopeId },
    });
  }

  // Persist entities ONCE (before the fact loop) to build entityIdMap.
  const { entityIdMap, entitiesCreated: newEntitiesCreated } = await buildEntityIdMap(
    config.storage,
    config.embedding,
    input.tenantId,
    mergedEntities,
  );
  entitiesCreated = newEntitiesCreated;

  // Collect the first persisted factId to anchor edges (edges reference a fact).
  let firstFactId: string | undefined;

  // ── BATCH EMBED all extracted facts at once (1 API call instead of N) ──
  const factsToEmbed = contradictionResults.filter(r => r.fact.operation !== 'noop');
  const factTexts = factsToEmbed.map(r => r.fact.content);
  const factEmbeddings = factTexts.length > 0 ? await config.embedding.embedBatch(factTexts) : [];
  let factEmbIdx = 0;

  // Persist facts and link entities per-fact.
  for (const { fact, contradictionStatus, contradictsId } of contradictionResults) {
    // Skip noop facts
    if (fact.operation === 'noop') continue;

    // Generate IDs
    const factId = crypto.randomUUID();
    if (!firstFactId) firstFactId = factId;

    let lineageId: string;

    if (fact.operation === 'update' && fact.existingLineageId) {
      // For updates, reuse existing lineage ID
      lineageId = fact.existingLineageId;
    } else {
      lineageId = crypto.randomUUID();
    }

    // Use pre-computed batch embedding
    const embedding = factEmbeddings[factEmbIdx++] ?? await config.embedding.embed(fact.content);

    // Create fact in storage
    await config.storage.createFact({
      id: factId,
      lineageId,
      tenantId: input.tenantId,
      scope: input.scope,
      scopeId: input.scopeId,
      sessionId: input.sessionId,
      content: fact.content,
      embeddingModel: config.embeddingModel,
      embeddingDim: config.embeddingDim,
      embedding,
      importance: fact.importance,
      confidence: fact.confidence,
      operation: fact.operation === 'add' || fact.operation === undefined ? 'create' :
        fact.operation === 'update' ? 'update' :
          fact.operation === 'invalidate' ? 'invalidate' : 'create',
      contradictionStatus,
      contradictsId: contradictsId ?? undefined,
      sourceType: fact.sourceType,
      originalContent: fact.originalContent,
      extractionId,
      extractionTier: tierUsed === 'multi_tier' ? 'heuristic' : tierUsed,
      modality: fact.modality,
      tags: fact.tags,
      metadata: {},
    });

    // Track counts
    if (fact.operation === 'update') {
      factsUpdated++;

      // Invalidate the old fact version
      if (fact.existingLineageId) {
        // Find old facts by lineage and invalidate the current valid one
        const oldFacts = await config.storage.getFactsByLineage(
          input.tenantId,
          fact.existingLineageId,
        );
        for (const oldFact of oldFacts) {
          if (oldFact.id !== factId && oldFact.validUntil === null) {
            await config.storage.invalidateFact(input.tenantId, oldFact.id);
            factsInvalidated++;
          }
        }
      }
    } else if (fact.operation === 'invalidate') {
      factsInvalidated++;
    } else {
      // 'add', 'contradict', undefined → new fact created
      factsCreated++;
    }

    // Link only the entities that THIS fact mentions.
    // If the LLM provided entityCanonicalNames, use those for precise linking.
    // Otherwise fall back to TEXT-MATCH: check if the entity name appears in the fact content.
    // NEVER link all entities — that creates garbage links.
    let relevantNames = fact.entityCanonicalNames;
    if (!relevantNames || relevantNames.length === 0) {
      const contentLower = fact.content.toLowerCase();
      relevantNames = [];
      for (const [canonicalName] of entityIdMap) {
        if (canonicalName === 'user') {
          if (contentLower.startsWith('user ') || contentLower.includes(' user ')) {
            relevantNames.push(canonicalName);
          }
        } else if (canonicalName.length >= 3 && contentLower.includes(canonicalName)) {
          relevantNames.push(canonicalName);
        }
      }
    }
    for (const name of relevantNames) {
      const entityId = entityIdMap.get(name);
      if (entityId) {
        await config.storage.linkFactEntity(factId, entityId, 'mentioned');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Store raw conversation chunks alongside extracted facts (hybrid memory)
  // ---------------------------------------------------------------------------
  if (input.inputType === 'conversation' && typeof input.data === 'object' && input.data !== null) {
    const messages = (input.data as Record<string, unknown>).messages as Array<{ role: string; content: string }> | undefined;
    if (messages && Array.isArray(messages)) {
      // Filter valid messages
      const validMsgs = messages.filter(msg => msg.content && msg.content.trim().length >= 10);

      // ── BATCH EMBED all chunks at once ──
      const chunkTexts = validMsgs.map(msg => msg.content);
      const chunkEmbeddings = chunkTexts.length > 0 ? await config.embedding.embedBatch(chunkTexts) : [];

      for (let ci = 0; ci < validMsgs.length; ci++) {
        const msg = validMsgs[ci]!;
        const chunkId = crypto.randomUUID();
        const chunkLineageId = crypto.randomUUID();

        await config.storage.createFact({
          id: chunkId,
          lineageId: chunkLineageId,
          tenantId: input.tenantId,
          scope: input.scope,
          scopeId: input.scopeId,
          sessionId: input.sessionId,
          content: `${msg.role}: ${msg.content}`,
          embeddingModel: config.embeddingModel,
          embeddingDim: config.embeddingDim,
          embedding: chunkEmbeddings[ci] ?? [],
          importance: 0.3,
          confidence: 1.0,
          operation: 'create',
          sourceType: 'conversation',
          originalContent: msg.content,
          extractionId,
          extractionTier: 'heuristic',
          modality: 'document',
          tags: ['raw_chunk', msg.role],
          metadata: { role: msg.role },
          contradictionStatus: 'none',
        });
        factsCreated++;
      }
    }
  } else if (typeof input.data === 'string' && input.data.length > 50) {
    const paragraphs = input.data.split(/\n\n+/).filter(p => p.trim().length > 50);

    // ── BATCH EMBED all paragraphs at once ──
    const paraEmbeddings = paragraphs.length > 0 ? await config.embedding.embedBatch(paragraphs) : [];

    for (let pi = 0; pi < paragraphs.length; pi++) {
      const para = paragraphs[pi]!;
      const chunkId = crypto.randomUUID();
      const chunkLineageId = crypto.randomUUID();

      await config.storage.createFact({
        id: chunkId,
        lineageId: chunkLineageId,
        tenantId: input.tenantId,
        scope: input.scope,
        scopeId: input.scopeId,
        sessionId: input.sessionId,
        content: para,
        embeddingModel: config.embeddingModel,
        embeddingDim: config.embeddingDim,
        embedding: paraEmbeddings[pi] ?? [],
        importance: 0.3,
        confidence: 1.0,
        operation: 'create',
        sourceType: (input.inputType === 'conversation' || input.inputType === 'document' || input.inputType === 'url' || input.inputType === 'raw_text' ? input.inputType : 'raw_text') as SourceType,
        originalContent: para,
        extractionId,
        extractionTier: 'heuristic',
        modality: 'document',
        tags: ['raw_chunk'],
        metadata: {},
        contradictionStatus: 'none',
      });
      factsCreated++;
    }
  }

  // Create edges ONCE after all facts are persisted.
  console.log(`[steno] Edge creation: ${mergedEdges.length} edges to persist, firstFactId=${firstFactId ? 'set' : 'MISSING'}`);
  if (mergedEdges.length > 0) {
    for (const e of mergedEdges.slice(0, 5)) {
      console.log(`[steno]   edge: "${e.sourceName}" → "${e.relation}" → "${e.targetName}"`);
    }
  }
  if (firstFactId !== undefined && mergedEdges.length > 0) {
    edgesCreated = await persistEdges(
      config.storage,
      input.tenantId,
      firstFactId,
      mergedEdges,
      entityIdMap,
    );
  }

  const durationMs = Date.now() - startTime;

  // Update extraction record to 'completed'
  await config.storage.updateExtraction(input.tenantId, extractionId, {
    status: 'completed',
    tierUsed,
    factsCreated,
    factsUpdated,
    factsInvalidated,
    entitiesCreated,
    edgesCreated,
    costTokensInput: totalTokensInput,
    costTokensOutput: totalTokensOutput,
    durationMs,
    completedAt: new Date(),
  });

  // Update scratchpad with newly extracted facts
  try {
    const factContents = contradictionResults
      .filter(r => r.fact.operation !== 'noop')
      .map(r => r.fact.content);

    if (factContents.length > 0) {
      await updateScratchpad(config.storage, config.cheapLLM, input.tenantId, input.scope, input.scopeId, factContents);
    }
  } catch {
    // Scratchpad update failure should not break the pipeline
  }

  // Increment usage
  await config.storage.incrementUsage(
    input.tenantId,
    totalTokensInput + totalTokensOutput,
    0,
    1,
    0,
  );

  return {
    extractionId,
    factsCreated,
    factsUpdated,
    factsInvalidated,
    entitiesCreated,
    edgesCreated,
    tier: tierUsed,
    costTokensInput: totalTokensInput,
    costTokensOutput: totalTokensOutput,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Main pipeline (synchronous — creates its own extraction record)
// ---------------------------------------------------------------------------

export async function runExtractionPipeline(
  config: PipelineConfig,
  input: ExtractionInput,
): Promise<PipelineResult> {
  const startTime = Date.now();

  // 1. Hash input for dedup
  const inputHash = await hashInput({ type: input.inputType, data: input.data });

  // 2. Check if already processed
  const existing = await config.storage.getExtractionByHash(input.tenantId, inputHash);
  if (existing && existing.status === 'completed') {
    return {
      extractionId: existing.id,
      factsCreated: existing.factsCreated,
      factsUpdated: existing.factsUpdated,
      factsInvalidated: existing.factsInvalidated,
      entitiesCreated: existing.entitiesCreated,
      edgesCreated: existing.edgesCreated,
      tier: existing.tierUsed ?? 'heuristic',
      costTokensInput: existing.costTokensInput,
      costTokensOutput: existing.costTokensOutput,
      durationMs: existing.durationMs ?? 0,
    };
  }

  // 3. Create extraction record with status='queued'
  //    Handle race condition: concurrent workers may try to create the same hash simultaneously
  const extractionId = crypto.randomUUID();
  const textContent = inputToText(input);

  try {
    await config.storage.createExtraction({
      id: extractionId,
      tenantId: input.tenantId,
      inputType: input.inputType,
      inputData: textContent,
      inputHash,
      inputSize: textContent.length,
      scope: input.scope,
      scopeId: input.scopeId,
      sessionId: input.sessionId,
    });
  } catch {
    // Duplicate hash — another worker beat us. Return their result.
    const raceWinner = await config.storage.getExtractionByHash(input.tenantId, inputHash);
    if (raceWinner) {
      return {
        extractionId: raceWinner.id,
        factsCreated: raceWinner.factsCreated,
        factsUpdated: raceWinner.factsUpdated,
        factsInvalidated: raceWinner.factsInvalidated,
        entitiesCreated: raceWinner.entitiesCreated,
        edgesCreated: raceWinner.edgesCreated,
        tier: raceWinner.tierUsed ?? 'heuristic',
        costTokensInput: raceWinner.costTokensInput,
        costTokensOutput: raceWinner.costTokensOutput,
        durationMs: raceWinner.durationMs ?? 0,
      };
    }
    throw new Error('Extraction race condition: duplicate hash but no existing record found');
  }

  // 4. Update status to 'processing'
  await config.storage.updateExtraction(input.tenantId, extractionId, {
    status: 'processing',
  });

  try {
    return await executeExtraction(config, extractionId, input, startTime);
  } catch (err) {
    await config.storage.updateExtraction(input.tenantId, extractionId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Queue worker entry — processes a pre-created extraction record
// ---------------------------------------------------------------------------

/**
 * Run extraction for a pre-created extraction record (from queue).
 * Unlike runExtractionPipeline, this does NOT create the extraction record
 * or perform hash-based dedup — both were already handled by the API route.
 * It updates the existing record through the pipeline lifecycle.
 */
export async function runExtractionFromQueue(
  config: PipelineConfig,
  extractionId: string,
  input: ExtractionInput,
): Promise<PipelineResult> {
  const startTime = Date.now();

  // Update status to 'processing'
  await config.storage.updateExtraction(input.tenantId, extractionId, {
    status: 'processing',
  });

  try {
    return await executeExtraction(config, extractionId, input, startTime);
  } catch (err) {
    await config.storage.updateExtraction(input.tenantId, extractionId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
