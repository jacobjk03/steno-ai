/**
 * Process extracted facts and annotate contradictions.
 * Facts with operation='contradict' get contradictionStatus='active'
 * and contradictsId set to the fact they contradict.
 * All other facts get contradictionStatus='none'.
 */
export function processContradictions(facts) {
    return facts.map(fact => {
        if (fact.operation === 'contradict' && fact.contradictsFactId) {
            return {
                fact,
                contradictionStatus: 'active',
                contradictsId: fact.contradictsFactId,
            };
        }
        return {
            fact,
            contradictionStatus: 'none',
            contradictsId: null,
        };
    });
}
//# sourceMappingURL=contradiction.js.map