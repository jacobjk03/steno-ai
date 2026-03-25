import { type SupabaseClient } from '@supabase/supabase-js';
export interface SupabaseConfig {
    url: string;
    serviceRoleKey: string;
}
export declare function createSupabaseClient(config: SupabaseConfig): SupabaseClient;
//# sourceMappingURL=client.d.ts.map