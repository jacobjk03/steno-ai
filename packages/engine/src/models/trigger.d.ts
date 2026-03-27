import { z } from 'zod';
export type TriggerCondition = {
    topic_match?: string[];
    entity_present?: string[];
    keyword_any?: string[];
    semantic_similarity?: {
        text: string;
        threshold: number;
    };
    AND?: TriggerCondition[];
    OR?: TriggerCondition[];
};
export declare const TriggerConditionSchema: z.ZodType<TriggerCondition>;
export declare const TriggerSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    scope: z.ZodEnum<["user", "agent", "session", "hive"]>;
    scopeId: z.ZodString;
    condition: z.ZodType<TriggerCondition, z.ZodTypeDef, TriggerCondition>;
    factIds: z.ZodArray<z.ZodString, "many">;
    entityIds: z.ZodArray<z.ZodString, "many">;
    queryTemplate: z.ZodNullable<z.ZodString>;
    priority: z.ZodDefault<z.ZodNumber>;
    active: z.ZodDefault<z.ZodBoolean>;
    timesFired: z.ZodDefault<z.ZodNumber>;
    lastFiredAt: z.ZodNullable<z.ZodDate>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    active: boolean;
    id: string;
    tenantId: string;
    scope: "user" | "agent" | "session" | "hive";
    scopeId: string;
    createdAt: Date;
    condition: TriggerCondition;
    factIds: string[];
    entityIds: string[];
    queryTemplate: string | null;
    priority: number;
    timesFired: number;
    lastFiredAt: Date | null;
}, {
    id: string;
    tenantId: string;
    scope: "user" | "agent" | "session" | "hive";
    scopeId: string;
    createdAt: Date;
    condition: TriggerCondition;
    factIds: string[];
    entityIds: string[];
    queryTemplate: string | null;
    lastFiredAt: Date | null;
    active?: boolean | undefined;
    priority?: number | undefined;
    timesFired?: number | undefined;
}>;
export type Trigger = z.infer<typeof TriggerSchema>;
export declare const CreateTriggerSchema: z.ZodObject<{
    tenantId: z.ZodString;
    scope: z.ZodEnum<["user", "agent", "session", "hive"]>;
    scopeId: z.ZodString;
    condition: z.ZodType<TriggerCondition, z.ZodTypeDef, TriggerCondition>;
    factIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    entityIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    queryTemplate: z.ZodOptional<z.ZodString>;
    priority: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    tenantId: string;
    scope: "user" | "agent" | "session" | "hive";
    scopeId: string;
    condition: TriggerCondition;
    factIds: string[];
    entityIds: string[];
    priority: number;
    queryTemplate?: string | undefined;
}, {
    tenantId: string;
    scope: "user" | "agent" | "session" | "hive";
    scopeId: string;
    condition: TriggerCondition;
    factIds?: string[] | undefined;
    entityIds?: string[] | undefined;
    queryTemplate?: string | undefined;
    priority?: number | undefined;
}>;
export type CreateTrigger = z.infer<typeof CreateTriggerSchema>;
//# sourceMappingURL=trigger.d.ts.map