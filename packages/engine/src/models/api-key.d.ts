import { z } from 'zod';
export declare const ApiKeySchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    keyHash: z.ZodString;
    keyPrefix: z.ZodString;
    name: z.ZodString;
    scopes: z.ZodArray<z.ZodEnum<["read", "write", "admin"]>, "many">;
    expiresAt: z.ZodNullable<z.ZodDate>;
    lastUsedAt: z.ZodNullable<z.ZodDate>;
    active: z.ZodBoolean;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    name: string;
    active: boolean;
    id: string;
    tenantId: string;
    createdAt: Date;
    keyHash: string;
    keyPrefix: string;
    scopes: ("read" | "write" | "admin")[];
    expiresAt: Date | null;
    lastUsedAt: Date | null;
}, {
    name: string;
    active: boolean;
    id: string;
    tenantId: string;
    createdAt: Date;
    keyHash: string;
    keyPrefix: string;
    scopes: ("read" | "write" | "admin")[];
    expiresAt: Date | null;
    lastUsedAt: Date | null;
}>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export declare const CreateApiKeySchema: z.ZodObject<{
    tenantId: z.ZodString;
    name: z.ZodDefault<z.ZodString>;
    scopes: z.ZodDefault<z.ZodArray<z.ZodEnum<["read", "write", "admin"]>, "many">>;
    expiresAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    name: string;
    tenantId: string;
    scopes: ("read" | "write" | "admin")[];
    expiresAt?: Date | undefined;
}, {
    tenantId: string;
    name?: string | undefined;
    scopes?: ("read" | "write" | "admin")[] | undefined;
    expiresAt?: Date | undefined;
}>;
export type CreateApiKey = z.infer<typeof CreateApiKeySchema>;
//# sourceMappingURL=api-key.d.ts.map