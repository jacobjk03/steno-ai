"use strict";
/**
 * Sliding Window Inference Pipeline — like Hydra DB's context-enriched chunking.
 *
 * Splits long text into segments with overlapping context windows.
 * Each segment gets surrounding context (lookback + lookahead) so the LLM can:
 * - Resolve pronouns ("he" → "John")
 * - Resolve references ("that framework" → "React")
 * - Understand temporal context from earlier messages
 *
 * This prevents the "Orphaned Pronoun Paradox" where isolated chunks lose meaning.
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEnrichedSegments = createEnrichedSegments;
var DEFAULT_CONFIG = {
    segmentSize: 800,
    hPrev: 2,
    hNext: 1,
    minInputLength: 3500, // Window multi-turn conversations for pronoun/temporal resolution
    maxSegments: 6, // Allow more segments for better coverage
};
/**
 * Split text into segments at sentence boundaries.
 */
function splitIntoSegments(text, segmentSize) {
    var segments = [];
    var current = '';
    // Split by sentences (period/exclamation/question followed by space or newline)
    var sentences = text.split(/(?<=[.!?])\s+/);
    for (var _i = 0, sentences_1 = sentences; _i < sentences_1.length; _i++) {
        var sentence = sentences_1[_i];
        if (current.length + sentence.length > segmentSize && current.length > 0) {
            segments.push(current.trim());
            current = sentence;
        }
        else {
            current += (current ? ' ' : '') + sentence;
        }
    }
    if (current.trim())
        segments.push(current.trim());
    return segments;
}
/**
 * Create enriched segments with sliding window context.
 *
 * For each segment, includes surrounding context so the LLM can resolve
 * references and understand temporal relationships.
 */
function createEnrichedSegments(text, config) {
    var c = __assign(__assign({}, DEFAULT_CONFIG), config);
    // Short inputs don't need windowing
    if (text.length < c.minInputLength) {
        return [{
                segment: text,
                contextWindow: text,
                index: 0,
                total: 1,
            }];
    }
    var segments = splitIntoSegments(text, c.segmentSize);
    // Cap segments to avoid excessive LLM calls
    var effectiveSegments = segments.length > c.maxSegments
        ? segments.slice(0, c.maxSegments)
        : segments;
    return effectiveSegments.map(function (seg, i) {
        // Build context window with lookback and lookahead
        var prevStart = Math.max(0, i - c.hPrev);
        var nextEnd = Math.min(segments.length - 1, i + c.hNext);
        var contextBefore = segments.slice(prevStart, i).join('\n');
        var contextAfter = segments.slice(i + 1, nextEnd + 1).join('\n');
        var contextWindow = '';
        if (contextBefore) {
            contextWindow += "[PRECEDING CONTEXT \u2014 use this to resolve pronouns, references, and temporal expressions in the current segment]\n".concat(contextBefore, "\n\n");
        }
        contextWindow += "[CURRENT SEGMENT \u2014 extract facts from this]\n".concat(seg);
        if (contextAfter) {
            contextWindow += "\n\n[FOLLOWING CONTEXT]\n".concat(contextAfter);
        }
        return {
            segment: seg,
            contextWindow: contextWindow,
            index: i,
            total: effectiveSegments.length,
        };
    });
}
