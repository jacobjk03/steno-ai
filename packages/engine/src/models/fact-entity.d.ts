import { z } from 'zod';
export declare const FactEntitySchema: z.ZodObject<{
    factId: z.ZodString;
    entityId: z.ZodString;
    role: z.ZodEnum<["subject", "object", "mentioned"]>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    createdAt: Date;
    factId: string;
    entityId: string;
    role: "object" | "subject" | "mentioned";
}, {
    createdAt: Date;
    factId: string;
    entityId: string;
    role: "object" | "subject" | "mentioned";
}>;
export type FactEntity = z.infer<typeof FactEntitySchema>;
export declare const CreateFactEntitySchema: z.ZodObject<{
    factId: z.ZodString;
    entityId: z.ZodString;
    role: z.ZodDefault<z.ZodEnum<["subject", "object", "mentioned"]>>;
}, "strip", z.ZodTypeAny, {
    factId: string;
    entityId: string;
    role: "object" | "subject" | "mentioned";
}, {
    factId: string;
    entityId: string;
    role?: "object" | "subject" | "mentioned" | undefined;
}>;
export type CreateFactEntity = z.infer<typeof CreateFactEntitySchema>;
//# sourceMappingURL=fact-entity.d.ts.map