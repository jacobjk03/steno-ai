import { normalizeEntityName } from '../packages/engine/src/extraction/llm-extractor.js';

const tests = [
  'casey.', '- jordan', 'when casey', "'al agent", 'mvp,', 'harrington &',
  '-   Al Engineering:', 'aurora city.', 'glen.', 'When Casey', 'User',
  'brightwell capital', 'Northshore Bank', '- - test', 'the User',
];
for (const t of tests) {
  console.log(JSON.stringify(t).padEnd(30) + ' → ' + JSON.stringify(normalizeEntityName(t)));
}
