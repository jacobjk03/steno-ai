import type { StorageAdapter } from '../adapters/storage.js';
import type { EmbeddingAdapter } from '../adapters/embedding.js';
import type { LLMAdapter } from '../adapters/llm.js';
import type {
  ExtractionInput,
  PipelineResult,
  ExtractedFact,
  ExtractedEntity,
  ExtractedEdge,
} from './types.js';
import { extractHeuristic } from './heuristic.js';
import { extractWithLLM } from './llm-extractor.js';
import { deduplicateFacts } from './dedup.js';
import { processContradictions } from './contradiction.js';
import { buildEntityIdMap, persistEdges } from './entity-extractor.js';
import { hashInput } from './hasher.js';

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
    seen.set(e.canonicalName, e);
  }
  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function runExtractionPipeline(
  config: PipelineConfig,
  input: ExtractionInput,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const tier = config.extractionTier ?? 'auto';

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
  const extractionId = crypto.randomUUID();
  const textContent = inputToText(input);

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

  // 4. Update status to 'processing'
  await config.storage.updateExtraction(input.tenantId, extractionId, {
    status: 'processing',
  });

  try {
    let totalTokensInput = 0;
    let totalTokensOutput = 0;
    const tiersUsed: string[] = [];

    // 5. Convert input to text (already done above)
    // textContent is ready

    // 6. Run heuristic extraction (always)
    const heuristicResult = extractHeuristic(textContent);
    tiersUsed.push('heuristic');

    let mergedFacts: ExtractedFact[] = heuristicResult.facts;
    let mergedEntities: ExtractedEntity[] = heuristicResult.entities;
    let mergedEdges: ExtractedEdge[] = heuristicResult.edges;

    // 7. Run LLM extraction (unless heuristic_only)
    if (tier !== 'heuristic_only') {
      const llmToUse = tier === 'smart_only' ? (config.smartLLM ?? config.cheapLLM) : config.cheapLLM;
      const llmTier = tier === 'smart_only' ? 'smart_llm' : 'cheap_llm';

      const existingFactsForLLM = input.existingFacts?.map(f => ({
        lineageId: f.lineageId,
        content: f.content,
      }));

      const llmResult = await extractWithLLM(
        { llm: llmToUse, tier: llmTier },
        textContent,
        existingFactsForLLM,
      );

      totalTokensInput += llmResult.tokensInput;
      totalTokensOutput += llmResult.tokensOutput;
      tiersUsed.push(llmTier);

      // 8. Escalate to smart LLM if confidence is low
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

      // 9. Merge results: LLM takes priority
      mergedFacts = mergeFacts(heuristicResult.facts, finalLLMResult.facts);

      // 10. Merge entities: dedup by canonicalName, LLM overwrites heuristic
      mergedEntities = mergeEntities(heuristicResult.entities, finalLLMResult.entities);
      mergedEdges = [...heuristicResult.edges, ...finalLLMResult.edges];
    }

    // 11. Run deduplication against existing memories
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

    // 12. Process contradictions
    const contradictionResults = processContradictions(dedupedFacts);

    // 13. Persist facts
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

    // 13a. Persist entities ONCE (before the fact loop) to build entityIdMap.
    //      This prevents duplicate entity rows and duplicate edges from being
    //      created for every fact in the loop.
    const { entityIdMap, entitiesCreated: newEntitiesCreated } = await buildEntityIdMap(
      config.storage,
      config.embedding,
      input.tenantId,
      mergedEntities,
    );
    entitiesCreated = newEntitiesCreated;

    // Collect the first persisted factId to anchor edges (edges reference a fact).
    let firstFactId: string | undefined;

    // 13b. Persist facts and link entities per-fact.
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

      // Embed fact content
      const embedding = await config.embedding.embed(fact.content);

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

      // Link only the entities that THIS fact mentions (not all entities).
      // If the fact has entityCanonicalNames, use those for precise linking.
      // Otherwise fall back to linking all entities (backward compat).
      const relevantNames = fact.entityCanonicalNames;
      if (relevantNames && relevantNames.length > 0) {
        for (const name of relevantNames) {
          const entityId = entityIdMap.get(name);
          if (entityId) {
            await config.storage.linkFactEntity(factId, entityId, 'mentioned');
          }
        }
      } else {
        // Fallback: link all entities (heuristic facts without per-fact entity tracking)
        for (const entityId of entityIdMap.values()) {
          await config.storage.linkFactEntity(factId, entityId, 'mentioned');
        }
      }
    }

    // 13c. Create edges ONCE after all facts are persisted.
    //      Use the first persisted factId as the anchor; if no facts were created
    //      (all were noop), skip edge creation.
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

    // 15. Update extraction record to 'completed'
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

    // 16. Increment usage
    await config.storage.incrementUsage(
      input.tenantId,
      totalTokensInput + totalTokensOutput,
      0,
      1,
      0,
    );

    // 17. Return PipelineResult
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
  } catch (err) {
    // 18. On error: update extraction to 'failed', re-throw
    await config.storage.updateExtraction(input.tenantId, extractionId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
