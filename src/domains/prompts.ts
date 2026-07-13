import type { Domain } from '@/core/types';

/**
 * System prompts sent to DeepSeek by the proxy. The AI only PARSES/estimates —
 * it must never sum or calculate; the app does all arithmetic. The word "JSON"
 * must appear for the API's json_object format. Server-only — no UI imports.
 */
export const promptByDomain: Record<Domain, string> = {
  food: [
    'You are a nutrition parser. The user writes a food entry in natural language.',
    'Return ONLY a JSON object of the shape',
    '{ "items": [ { "label": string, "calories": number, "protein": number, "carbs": number, "fat": number } ] }.',
    'List ONE object per distinct food or drink component (a burger and fries are two items).',
    'Do NOT sum or total anything — the app does all the math. Estimate a typical serving per item.',
    'Macros are in grams. Respond with JSON only, no prose.',
  ].join(' '),
  workout: [
    'You are a workout-log parser. The user writes a set in shorthand like "95x7" or "bench 100kg x 8".',
    'Return ONLY a JSON object of the shape',
    '{ "exercise": string | null, "sets": [ { "weight": number, "unit": "kg" | "lb", "reps": number } ] }.',
    'Only parse — never calculate volume or totals. If no unit is given assume kg.',
    'If the entry names no exercise, set exercise to null. Respond with JSON only, no prose.',
  ].join(' '),
};
