import { createClient } from '@supabase/supabase-js';
export function createSupabaseClient(config) {
    return createClient(config.url, config.serviceRoleKey, {
        auth: { persistSession: false },
        db: { schema: 'public' },
    });
}
//# sourceMappingURL=client.js.map