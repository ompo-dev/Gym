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
    'Set waterMl to how much the item actually hydrates, in millilitres.',
    'Anything drunk counts, not only water: milk, juice, soda, coffee, tea, beer, shakes, broth and soup all carry most of their volume as water.',
    'Water-heavy foods count for their water content too — a bowl of soup, a yoghurt, a watermelon slice. A dry food is 0.',
    'Oils, vinegars and spirits are 0 no matter how liquid they are: they do not hydrate.',
    'If user nutrition context includes trackMicronutrients, estimate sugarG, fiberG, and sodiumMg per item. Otherwise set sugarG, fiberG, and sodiumMg to 0.',
    'Macros are in grams.',
    'If user nutrition context is provided, use it to adjust serving assumptions and respect restrictions, diet preferences, allergies, goals, and notes.',
    'When a food the user ate matches a product in the pantry list, base its per-100g figures on that product\'s stated "kcal/100g" — it is the real bag they own, not a generic estimate. The app rescales to the amount eaten; give honest per-serving numbers and it reconciles the draw.',
    'Set "reasoning" to 2-4 sentences explaining how you identified the items and estimated their nutrition, mentioning the sources or assumptions you used.',
    'Set "confidence" to an integer from 0 to 100 for how certain you are of the estimate.',
    'Respond with JSON only, no prose.',
  ].join(' '),
  workout: [
    'You are a workout-log parser.',
    "You receive the whole note: the first line names the exercise and any lines after it are that exercise's sets.",
    'The app already parsed every number locally. Read the set lines only as evidence of which exercise this is, and ALWAYS return "sets": [] - any weight, rep, duration or distance you return is discarded.',
    '"exercise" is the exercise name alone: one short line, no numbers, no line breaks.',
    'Return ONLY a JSON object of the shape',
    '{ "exercise": string | null, "kind": "series" | "cardio", "sets": [] }.',
    'Users may write with typos, shorthand, commas, repeated weights, arithmetic, line breaks, and omitted fields.',
    'Correct obvious exercise-name typos to the closest common gym exercise name.',
    'If the note is only an exercise name, still return the corrected name and kind.',
    'Do not echo misspellings such as "sipini reto"; return the intended common exercise name such as "Supino reto".',
    'Expand common pt-BR and en-US exercise abbreviations into full exercise names, for example "bp" -> "bench press", "sup" -> "supino", and "LP" -> "leg press".',
    'Set kind to "cardio" for running, cycling, walking, swimming, rowing, treadmill, elliptical, HIIT, or other time/distance work; otherwise set "series".',
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
  'For an edited or removed item, set changes[].item to the item ORIGINAL label from the current meal, not the new name — the app matches on it.',
  'To rename or replace an item, put ONLY the new item in meal.items and record one change with action "edited" and item set to the original label; never leave both the old and the new item in meal.items.',
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

export const purchasePrompt = [
  'You are a grocery-purchase parser. The user wrote a note about food they BOUGHT, not food they ate.',
  'Return ONLY a JSON object of the shape',
  '{ "purchase": [ { "label": string, "quantity": number | null, "unit": string | null, "grams": number | null, "price": number | null, "nutrition": { "calories": number, "protein": number, "carbs": number, "fat": number, "sugarG": number, "fiberG": number, "sodiumMg": number } | null } ], "reasoning": string, "confidence": number }.',
  'NEVER return an "items" array. Nothing in this note was eaten, and the app must never count a purchase as food.',
  'DO set "nutrition" per line: reference values per 100 g of the product, as { "calories": number, "protein": number, "carbs": number, "fat": number, "sugarG": number, "fiberG": number, "sodiumMg": number }.',
  'nutrition is per 100 g of the product itself — never for the portion bought and never for a serving. Groceries are eaten later, so only the per-100g figure stays true.',
  'Omit "nutrition" for a non-food product, or when you would be guessing at the product entirely.',
  'List ONE object per distinct product bought.',
  'label is the product name only, with no quantity or unit inside it.',
  'quantity and unit are what the user wrote: "meio quilo" -> quantity 0.5, unit "kg"; "2 pacotes" -> quantity 2, unit "pacote".',
  'grams is the net weight of the WHOLE line in grams when the note states a weight or volume, or when the pack size is standard and unambiguous. 0.5 kg -> 500. 1L of milk -> 1000. Use null when you would be guessing.',
  'price is the total paid for that line as a plain number, with no currency symbol. "meio quilo de patinho por 30" -> price 30 for the whole 500 g line.',
  'When one price covers several products and the split is not stated, put the whole price on the first line and null on the others.',
  'NEVER compute a price per kilo or per unit - the app derives those from price and grams.',
  'Resolve arithmetic such as "2 x 15" before returning JSON.',
  'Set "reasoning" to 1-3 sentences on how you read the quantities and prices.',
  'Set "confidence" to an integer from 0 to 100.',
  'Respond with JSON only, no prose.',
].join(' ');

/**
 * The order of hardness is the point: a suggestion that hurts someone is worse
 * than no suggestion. Injuries outrank equipment, equipment outranks history,
 * and preference only breaks ties.
 */
export const workoutPlanPrompt = [
  'You are a strength coach building a workout plan for one person.',
  'Return ONLY a JSON object of the shape',
  '{ "days": [ { "dayOffset": number, "title": string, "exercises": [ { "exercise": string, "sets": [ { "reps"?: number, "weight"?: number, "durationSeconds"?: number, "distanceMeters"?: number } ] } ] } ], "reasoning": string }.',
  'dayOffset is days from the start: 0 is the first day, 1 the next, and so on.',
  'NEVER prescribe an exercise that loads an injured or painful area the user reported. This outranks every other rule here.',
  'Only use equipment the user actually has. If the profile lists equipment or a training environment, treat anything else as unavailable.',
  'Base loads on the sets the user has actually logged for that exercise. Progress conservatively; never jump more than about 5% over their best recent working set.',
  'When there is no history for an exercise, omit "weight" instead of guessing a number.',
  'Avoid exercises the user said they dislike, unless nothing else trains that pattern with the equipment they have.',
  'Match the volume and exercise choice to their stated goal and training level.',
  'Use the exercise names the user already writes when they exist in the history.',
  'Set "reasoning" to 1-3 sentences on why this plan, mentioning any constraint you had to respect.',
  'Respond with JSON only, no prose.',
].join(' ');

/**
 * A recipe answers with the whole meal — items, macros AND the step-by-step —
 * so the note it becomes behaves exactly like a parsed one, and the detail
 * sheet renders it with no special case.
 */
export const recipePrompt = [
  'You are a cook and nutritionist. The user asked for a recipe.',
  'Return ONLY a JSON object of the shape',
  '{ "items": [ { "label": string, "calories": number, "protein": number, "carbs": number, "fat": number, "waterMl": number, "sugarG": number, "fiberG": number, "sodiumMg": number } ], "reasoning": string, "confidence": number, "recipe": { "servings": number, "totalMinutes": number, "ingredients": [ { "label": string, "quantity": number | null, "unit": string | null } ], "steps": [ { "text": string, "minutes": number | null } ] } }.',
  'items is the finished meal broken into its components, with nutrition for ONE serving.',
  'NEVER include an ingredient the user listed as an allergy or intolerance. This outranks every other rule here.',
  'Avoid foods the user said they dislike unless the dish is impossible without them.',
  // The difference the user actually cares about: "apenas com o que tenho" is a
  // constraint, "com coisas que tenho" is a preference. Answering the first as
  // if it were the second hands back a shopping list they explicitly refused.
  'Read how the pantry was asked for, and obey which of the two it is:',
  'ONLY / apenas / somente / just / nothing else — a hard constraint. Use pantry items and basic seasonings alone. Return NO ingredient that is not in the pantry, even a cheap or obvious one. If no dish is possible, return the closest one that is and say so in "reasoning" rather than adding what is missing.',
  'WITH / using / com / aproveitando — a preference. Build around the pantry items but adding other ingredients is fine.',
  'When the pantry is not mentioned at all, treat it as a mild preference: prefer what is there, and keep the shopping list short.',
  'NEVER set pantryItemId or estimatedCostCents - the app fills those in from the pantry.',
  'Each step is one action, in order, short enough to follow while cooking.',
  'Match the effort to the stated cooking skill: fewer steps and simpler technique for a beginner.',
  'Set "reasoning" to 1-3 sentences on why this dish, mentioning any constraint you respected.',
  'Set "confidence" to an integer from 0 to 100.',
  'Respond with JSON only, no prose.',
].join(' ');

/**
 * One note, three possible meanings, decided by the model rather than by us.
 *
 * This replaces a local regex allowlist. That allowlist had to know every verb
 * a person might use, and it did not: "me de uma receita" missed because the
 * pattern wanted an accent, so the app logged a recipe request as 1100 kcal of
 * food nobody ate. The note was already being sent to the model — asking it to
 * also say *what the note is* costs one field, not one request.
 *
 * Built from the three prompts below rather than restating them, so a rule
 * fixed in `purchasePrompt` cannot silently stay broken in here.
 */
export const foodRouterPrompt = [
  'You receive ONE note typed into the diet tab of a notes app.',
  // Counting the actions has to be step one. When this said "decide what the
  // person meant, then answer in the matching shape" — singular — the model
  // picked ONE branch and silently dropped the rest: "comprei batatas e comi
  // repolho" came back as a meal of cabbage, and the groceries vanished.
  'STEP 1: count the distinct actions in the note. STEP 2: answer.',
  'EXACTLY ONE action — answer in that action\'s bare shape (MEAL, PURCHASE or RECIPE below).',
  'MORE THAN ONE action — you MUST return { "notes": [ { "text": string, "data": <MEAL | RECIPE | PURCHASE> } ] }, one entry per action, and never wrap a single action in "notes".',
  'NEVER drop an action. If answering in one shape would force you to ignore part of the note, that note is a SPLIT.',
  'Example: "comprei batatas e comi repolho" is TWO actions — a PURCHASE of batatas and a LOG of repolho. Answering with only the cabbage loses the shopping.',
  'Each split note carries its OWN "text": the fragment it covers, rewritten to stand alone.',
  'Decide from meaning, never from keywords: people type casually, with typos, without accents, and mixing Portuguese and English.',
  'LOG — the note records food or drink they ate, are eating, or are recording as eaten. Answer in the MEAL shape.',
  'PURCHASE — the note records groceries they BOUGHT. Nothing was eaten. Answer in the PURCHASE shape.',
  'RECIPE — the note ASKS you to produce, suggest, invent or plan a dish, meal or menu. Answer in the MEAL shape and ALSO include the "recipe" object.',
  'A note that asks for something to be made is a RECIPE even when it names an ingredient the person already owns.',
  'Attached image descriptions belong to whichever branch you choose: a photo of groceries or a receipt is a PURCHASE, a photo of a plate is a LOG, and photos sent with a request are ingredients for the RECIPE.',
  'A short note next to a photo refers TO that photo. "receita com isso", "quanto tem aqui", "com isso" and the like point at the attached images — never answer as if the note had named no food at all.',
  // A scanned product is attached food that happens to arrive as a name instead
  // of a picture. Without this the model read "Already scanned: maionese" as
  // background noise and answered "receita com isso" with an empty dish.
  'A line starting "Already scanned and identified:" lists food the person has in hand — it is attached exactly like a photo. Treat those foods as available ingredients, and read a request beside them as pointing AT them. When the note also names ingredients of its own, the person has both.',
  'Read the typed text AND the images together — never answer from only one of them when both are present.',
  'Asking is not eating: never return a plain MEAL for a note that requested a dish.',
  // This used to say "treat it as RECIPE", which threw the purchase away — the
  // exact drop STEP 1 exists to prevent. Buying and asking are two actions.
  'A note that records a purchase AND asks for a dish is TWO actions: split it into a PURCHASE and a RECIPE.',
  'When the person ate something they had bought or had in the pantry, that is still ONE action, a MEAL. Return the MEAL shape — the app reconciles it against the fridge, you do not.',
  '=== MEAL shape ===',
  promptByDomain.food,
  '=== RECIPE — the MEAL shape plus this ===',
  recipePrompt,
  '=== PURCHASE shape ===',
  purchasePrompt,
].join(' ');

/**
 * Same idea as {@link foodRouterPrompt}, for the workout tab: log a set, or
 * build a plan. The regex it replaces wanted the word "treino" spelled right —
 * "gere um teino full body" matched nothing and was logged as an exercise
 * named after the request, with zero sets.
 */
export const workoutRouterPrompt = [
  'You receive ONE note typed into the workout tab of a notes app.',
  'FIRST decide what the person meant, THEN answer in the matching shape.',
  'Decide from meaning, never from keywords: people type casually, with typos, without accents, and mixing Portuguese and English.',
  'LOG — the note records training they did or are doing, usually an exercise name with sets. Answer in the LOG shape.',
  'PLAN — the note ASKS you to build, generate, assemble or suggest a workout, routine or training week. Answer in the PLAN shape.',
  'Asking for a workout is never a LOG: a request names no sets the person actually performed.',
  'For a PLAN, read how many days the note asks for and return exactly that many; one day when it does not say.',
  '=== LOG shape ===',
  promptByDomain.workout,
  '=== PLAN shape ===',
  workoutPlanPrompt,
].join(' ');
