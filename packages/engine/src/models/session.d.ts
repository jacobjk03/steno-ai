import { z } from 'zod';
export declare const SessionSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    scope: z.ZodEnum<["user", "agent", "hive"]>;
    scopeId: z.ZodString;
    startedAt: z.ZodDate;
    endedAt: z.ZodNullable<z.ZodDate>;
    summary: z.ZodNullable<z.ZodString>;
    topics: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    messageCount: z.ZodDefault<z.ZodNumber>;
    factCount: z.ZodDefault<z.ZodNumber>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    tenantId: string;
    scope: "user" | "agent" | "hive";
    scopeId: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
    startedAt: Date;
    endedAt: Date | null;
    summary: string | null;
    topics: string[];
    messageCount: number;
    factCount: number;
}, {
    id: string;
    tenantId: string;
    scope: "user" | "agent" | "hive";
    scopeId: string;
    createdAt: Date;
    startedAt: Date;
    endedAt: Date | null;
    summary: string | null;
    metadata?: Record<string, unknown> | undefined;
    topics?: string[] | undefined;
    messageCount?: number | undefined;
    factCount?: number | undefined;
}>;
export type Session = z.infer<typeof SessionSchema>;
export declare const CreateSessionSchema: z.ZodObject<{
    tenantId: z.ZodString;
    scope: z.ZodEnum<["user", "agent", "hive"]>;
    scopeId: z.ZodString;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    tenantId: string;
    scope: "user" | "agent" | "hive";
    scopeId: string;
    metadata: Record<string, unknown>;
}, {
    tenantId: string;
    scope: "user" | "agent" | "hive";
    scopeId: string;
    metadata?: Record<string, unknown> | undefined;
}>;
export type CreateSession = z.infer<typeof CreateSessionSchema>;
//# sourceMappingURL=session.d.ts.map