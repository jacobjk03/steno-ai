#!/usr/bin/env node

export { createServer } from './server.js';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Steno from '@steno-ai/sdk';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const apiKey = process.env.STENO_API_KEY;
  if (!apiKey) {
    console.error(
      'Error: STENO_API_KEY environment variable is required.\n\n' +
        'Set it before running:\n' +
        '  export STENO_API_KEY=sk_steno_...\n\n' +
        'Or pass it inline:\n' +
        '  STENO_API_KEY=sk_steno_... npx @steno-ai/mcp',
    );
    process.exit(1);
  }

  const steno = new Steno(apiKey);
  const server = createServer(steno);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
