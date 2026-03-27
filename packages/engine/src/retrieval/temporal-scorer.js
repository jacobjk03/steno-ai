const MONTH_NAMES = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
];
const MONTH_ABBR = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];
/**
 * Extract temporal references from a search query.
 * Returns null if query has no temporal component.
 */
export function extractTimeReference(query) {
    const lower = query.toLowerCase();
    let ordering;
    if (/\bfirst\b/.test(lower))
        ordering = 'first';
    if (/\blast\b/.test(lower) && !/\blast\s+(week|month|year)\b/.test(lower))
        ordering = 'last';
    // Try explicit date: "March 15th", "March 15, 2023"
    for (let i = 0; i < MONTH_NAMES.length; i++) {
        const name = MONTH_NAMES[i];
        const abbr = MONTH_ABBR[i];
        const monthPattern = new RegExp(`(?:${name}|${abbr})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{4}))?`, 'i');
        const match = lower.match(monthPattern);
        if (match) {
            return { month: i, day: parseInt(match[1], 10), year: match[2] ? parseInt(match[2], 10) : undefined, ordering };
        }
        const reversePattern = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:${name}|${abbr})(?:[,\\s]+(\\d{4}))?`, 'i');
        const revMatch = lower.match(reversePattern);
        if (revMatch) {
            return { month: i, day: parseInt(revMatch[1], 10), year: revMatch[2] ? parseInt(revMatch[2], 10) : undefined, ordering };
        }
    }
    // Month-only: "in February", "during March"
    for (let i = 0; i < MONTH_NAMES.length; i++) {
        if (lower.includes(MONTH_NAMES[i]) || lower.includes(MONTH_ABBR[i])) {
            return { month: i, ordering };
        }
    }
    // Relative: "yesterday", "last week", "last month"
    if (/\byesterday\b/.test(lower)) {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), ordering };
    }
    if (/\blast\s+week\b/.test(lower)) {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), ordering };
    }
    if (/\blast\s+month\b/.test(lower)) {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return { year: d.getFullYear(), month: d.getMonth(), ordering };
    }
    if (ordering)
        return { ordering };
    return null;
}
/**
 * Score candidates by temporal proximity to the query's time reference.
 * Mutates candidates in place, setting their `temporalScore`.
 */
export function scoreTemporalRelevance(candidates, timeRef) {
    // For ordering queries ("which first/last"), score by eventDate order
    if (timeRef.ordering && !timeRef.month && !timeRef.day && !timeRef.year) {
        const withDates = candidates.filter(c => c.fact.eventDate != null);
        if (withDates.length === 0)
            return;
        withDates.sort((a, b) => {
            const aDate = new Date(a.fact.eventDate).getTime();
            const bDate = new Date(b.fact.eventDate).getTime();
            return timeRef.ordering === 'first' ? aDate - bDate : bDate - aDate;
        });
        for (let i = 0; i < withDates.length; i++) {
            withDates[i].temporalScore = 1.0 - (i / withDates.length);
        }
        return;
    }
    // For date-proximity queries, score by distance to reference date
    const now = new Date();
    const refDate = new Date(timeRef.year ?? now.getFullYear(), timeRef.month ?? 0, timeRef.day ?? 15);
    const refTime = refDate.getTime();
    let maxDistance = 0;
    for (const c of candidates) {
        const eventDate = c.fact.eventDate ?? c.fact.documentDate;
        if (!eventDate)
            continue;
        const dist = Math.abs(new Date(eventDate).getTime() - refTime);
        if (dist > maxDistance)
            maxDistance = dist;
    }
    if (maxDistance === 0)
        return;
    for (const c of candidates) {
        const eventDate = c.fact.eventDate ?? c.fact.documentDate;
        if (!eventDate) {
            c.temporalScore = 0;
            continue;
        }
        const dist = Math.abs(new Date(eventDate).getTime() - refTime);
        c.temporalScore = 1.0 - (dist / maxDistance);
    }
}
//# sourceMappingURL=temporal-scorer.js.map