import type { Domain } from '@/core/types';

import { MUSCLES } from './anatomy';

/** Compact enough to ride on every workout request without bloating it. */
const MUSCLE_PROMPT_VOCABULARY = MUSCLES.map((muscle) =>
  muscle.portions.length
    ? `${muscle.group}/${muscle.id} [${muscle.portions.join('|')}]`
    : `${muscle.group}/${muscle.id}`,
).join('; ');

/**
 * Onboarding notes resolve on the local parser; this prompt is only the polish
 * pass for when a key exists, so it is deliberately narrow — it corrects what
 * the regexes missed, it does not invent numbers the user never said.
 */
const ONBOARDING_PROMPT = [
  'You extract profile facts from one sentence written by someone setting up a fitness app.',
  'Return ONLY a JSON object of the shape',
  '{ "capture": { "gender"?: "male"|"female"|"other"|"private", "birthDate"?: "YYYY-MM-DD", "heightCm"?: number, "weightKg"?: number, "goalWeightKg"?: number, "activity"?: "sedentary"|"light"|"moderate"|"high" }, "fields": string[] }.',
  'Omit every field the sentence does not state. NEVER guess, average, or infer a value the user did not give.',
  'heightCm is centimetres (1,75m -> 175). weightKg is kilograms.',
  'weightKg is what they weigh now; goalWeightKg is what they want to weigh.',
  'For age, subtract from today and use 01-01 for the month and day if only the age is given.',
  'Map training frequency to activity: none -> sedentary, 1-2x/week -> light, 3-4x -> moderate, 5+ -> high.',
  'fields lists exactly the keys present in capture.',
  'Respond with JSON only, no prose.',
].join(' ');

export const promptByDomain: Record<Domain, string> = {
  onboarding: ONBOARDING_PROMPT,
  food: [
    'You are a nutrition parser. The user writes a food entry in natural language.',
    'Return ONLY a JSON object of the shape',
    '{ "items": [ { "label": string, "mediaId": string | null, "quantity": number | null, "unit": string | null, "calories": number, "protein": number, "carbs": number, "fat": number, "waterMl": number, "sugarG": number, "fiberG": number, "sodiumMg": number } ], "reasoning": string, "confidence": number }.',
    'List ONE object per distinct food or drink component.',
    'If attached image descriptions include media ids, return exactly ONE food/drink item per attached image with that mediaId. Estimate the whole visible food/drink in that image as that item. Foods typed only in text may omit mediaId.',
    'When text and attached images are provided together, include BOTH the typed foods/drinks and the image foods/drinks; do not replace or ignore one source with the other.',
    'Users may write with typos, shorthand, mixed languages, arithmetic, and messy separators.',
    'Expand common pt-BR and en-US food abbreviations into clear full labels whenever the meaning is obvious.',
    'Resolve arithmetic such as "2 vezes 150", "100 + 50", or "300 - 50" before returning JSON.',
    'Do NOT sum or total anything - the app does all the math.',
    'Estimate a typical serving per item.',
    'Set quantity and unit only for countable items or explicit serving units that make sense to show to the user, for example eggs, slices, cups, scoops, cans, glasses, pieces, or units. Use null for quantity and unit when it would be awkward or not useful, such as generic rice, pasta, mixed dishes, or estimated portions.',
    'If quantity is 1, use null unless the user explicitly wrote a serving unit that matters.',
    'Set waterMl to the estimated water amount in milliliters for water or drinks, otherwise 0.',
    'If user nutrition context includes trackMicronutrients, estimate sugarG, fiberG, and sodiumMg per item. Otherwise set sugarG, fiberG, and sodiumMg to 0.',
    'Macros are in grams.',
    'If user nutrition context is provided, use it to adjust serving assumptions and respect restrictions, diet preferences, allergies, goals, and notes.',
    'Set "reasoning" to 2-4 sentences explaining how you identified the items and estimated their nutrition, mentioning the sources or assumptions you used.',
    'Set "confidence" to an integer from 0 to 100 for how certain you are of the estimate.',
    'Respond with JSON only, no prose.',
  ].join(' '),
  workout: [
    'You are a workout-log parser.',
    'Return ONLY a JSON object of the shape',
    '{ "exercise": string | null, "kind": "series" | "cardio", "sets": [ { "weight"?: number, "unit"?: "kg" | "lb", "reps"?: number, "durationSeconds"?: number, "distanceMeters"?: number } ] }.',
    'Users may write with typos, shorthand, commas, repeated weights, arithmetic, line breaks, and omitted fields.',
    'Correct obvious exercise-name typos to the closest common gym exercise name.',
    'If the text is only an exercise name, still return the corrected/formatted exercise name, kind, and an empty sets array.',
    'Do not echo misspellings such as "sipini reto"; return the intended common exercise name such as "Supino reto".',
    'Expand common pt-BR and en-US exercise abbreviations into full exercise names, for example "bp" -> "bench press", "sup" -> "supino", and "LP" -> "leg press".',
    'Set kind to "cardio" for running, cycling, walking, swimming, rowing, treadmill, elliptical, HIIT, or other time/distance work; otherwise set "series".',
    'If the first line is the exercise name and later lines are sets, keep that structure.',
    'Keep "95x7" as one set with weight 95 and reps 7.',
    'If the entry lists several weights for one exercise like "leg press 50, 100kg e 150", create one set per weight mention.',
    'Carry forward the last explicit unit to later sets; if no unit is ever given assume kg.',
    'For cardio, parse duration into durationSeconds and distance into distanceMeters; "1h/5km" means durationSeconds 3600 and distanceMeters 5000.',
    'If reps, load, duration, or distance are omitted, omit that field.',
    'Resolve arithmetic before returning JSON, but never calculate totals or volume.',
    'If the entry names no exercise, set exercise to null.',
    // The vocabulary is closed on purpose: anything outside it is discarded by
    // the schema, so inventing a muscle just loses the classification.
    'Also classify the muscles worked, using ONLY these ids:',
    MUSCLE_PROMPT_VOCABULARY,
    'Return "primary" as { "muscle": id, "portion": id }, plus "synergists" and',
    '"stabilizers" as arrays of the same shape. Omit "portion" when the muscle',
    'has no portions listed or the exercise does not bias one.',
    'primary is the muscle the exercise is for; synergists assist the movement;',
    'stabilizers hold position without producing the motion.',
    'For cardio use primary { "muscle": "cardiovascular" } and leave the arrays empty.',
    'Respond with JSON only, no prose.',
  ].join(' '),
};

export const foodEditPrompt = [
  'You edit an existing nutrition JSON meal according to a user instruction.',
  'Return ONLY a JSON object of the shape',
  '{ "description": string, "meal": { "items": [ { "label": string, "mediaId": string | null, "quantity": number | null, "unit": string | null, "calories": number, "protein": number, "carbs": number, "fat": number, "waterMl": number, "sugarG": number, "fiberG": number, "sodiumMg": number } ], "reasoning": string, "confidence": number }, "changes": [ { "action": "added" | "edited" | "removed", "item": string, "note": string } ] }.',
  'The user may ask to add, remove, rename, resize portions, change macros, change calories, or adjust hydration.',
  'A single instruction may contain multiple edits; apply all of them and include one change object per concrete edit.',
  'Preserve unchanged items exactly unless the instruction clearly affects them.',
  'Preserve quantity and unit for unchanged items.',
  'Preserve mediaId for unchanged items.',
  'If adding an item, estimate a typical serving and nutrition like the normal food parser.',
  'Always set description to a short refined final meal description based only on the final meal items. Do not mention edits or uncertainty.',
  'Set quantity and unit only for countable items or explicit serving units that make sense to show to the user, for example eggs, slices, cups, scoops, cans, glasses, pieces, or units. Use null for quantity and unit when it would be awkward or not useful.',
  'Keep item.label as the food/drink name only; put serving words like cup, glass, copo, lata, fatia, or unidade in unit instead of duplicating them in the label.',
  'If the user asks to add more of an item that already exists in meal.items, update that existing item/portion instead of creating a duplicate item with the same food.',
  'For that case, use action "edited" in changes, not "added".',
  'If removing an item, remove it from meal.items.',
  'Do NOT include totals; the app sums items.',
  'Set waterMl in milliliters for water or drinks, otherwise 0.',
  'If user nutrition context includes trackMicronutrients, preserve or estimate sugarG, fiberG, and sodiumMg per item. Otherwise set sugarG, fiberG, and sodiumMg to 0.',
  'Set changes to one object per concrete add/edit/remove operation.',
  'Rewrite meal.reasoning from scratch for the final updated meal, as if it had just been analyzed normally. Do not mention the edit instruction, previous changes, or phrases like "I added", "I removed", or "I updated".',
  'Set meal.confidence to an integer from 0 to 100.',
  'Respond with JSON only, no prose.',
].join(' ');
