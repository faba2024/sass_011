import { z } from "zod";

export const zId = z.string().uuid();
export const zMoney = z.coerce.number().min(0, "Valor inválido").max(1_000_000);
export const zOptText = (max = 500) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
export const zText = (min = 1, max = 120, msg = "Campo obrigatório") => z.string().trim().min(min, msg).max(max);
export const zDigits = z.string().optional().nullable().transform((v) => (v ? v.replace(/\D/g, "") || null : null));
