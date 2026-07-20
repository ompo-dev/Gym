/**
 * Exercise name -> muscle group, by keyword.
 *
 * ponytail: a lookup table, not a model call. It reaches the history already on
 * disk, works offline and costs nothing. The ceiling is coverage: anything not
 * listed lands in `other`, and the monitor shows that bucket honestly instead of
 * hiding it. Upgrade path when `other` gets big: add a `muscle` field to
 * workoutSchema and let the parser fill it going forward, keeping this table as
 * the fallback for old rows.
 */
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'legs'
  | 'glutes'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'calves'
  | 'cardio'
  | 'other';

/** Order matters: the first hit wins, so specific patterns come before broad ones. */
const RULES: readonly (readonly [RegExp, MuscleGroup])[] = [
  // Cardio first — "corrida na esteira" must not be caught by a leg keyword.
  [
    /\b(?:cardio|corrida|correr|run|running|esteira|treadmill|caminhada|walk|walking|bike|bicicleta|ciclismo|cycling|spinning|eliptico|elliptical|remo\s*ergometro|rowing\s*machine|natacao|nadar|swim|swimming|escada|stair|hiit|pular\s*corda|jump\s*rope)\b/i,
    'cardio',
  ],

  // Arms before chest/back: "triceps testa" and "rosca" are unambiguous.
  [/\b(?:triceps|tricep|testa|frances|french\s*press|pulley\s*triceps|mergulho|dips?)\b/i, 'triceps'],
  [/\b(?:biceps|bicep|rosca|curl|martelo|hammer|scott|preacher)\b/i, 'biceps'],

  [
    /\b(?:ombro|ombros|shoulder|deltoid|deltoide|desenvolvimento|overhead\s*press|militar|military|elevacao\s*lateral|lateral\s*raise|elevacao\s*frontal|front\s*raise|arnold|encolhimento|shrug)\b/i,
    'shoulders',
  ],
  [
    /\b(?:peito|peitoral|chest|supino|bench\s*press|crucifixo|fly|flies|crossover|voador|peck\s*deck)\b/i,
    'chest',
  ],
  [
    // No bare "back": it is a body part, not an exercise, and it would steal
    // "back squat" (legs) and "back extension" (core).
    /\b(?:costas|dorsal|remada|row|puxada|pulldown|pull\s*down|barra\s*fixa|pull\s*up|chin\s*up|pullover|serrote|lat\b)/i,
    'back',
  ],
  [
    /\b(?:panturrilha|calf|calves|gemeos|seated\s*calf|elevacao\s*de\s*panturrilha)\b/i,
    'calves',
  ],
  [
    /\b(?:gluteo|gluteos|glute|glutes|elevacao\s*pelvica|hip\s*thrust|coice|kickback|abducao|abduction)\b/i,
    'glutes',
  ],
  [
    /\b(?:perna|pernas|leg|quadriceps|quadricipes|posterior|isquiotibiais|hamstring|agachamento|squat|leg\s*press|cadeira\s*extensora|leg\s*extension|mesa\s*flexora|leg\s*curl|afundo|lunge|avanco|stiff|levantamento\s*terra|deadlift|passada|bulgaro)\b/i,
    'legs',
  ],
  [
    /\b(?:abdomen|abdominal|abs|core|prancha|plank|obliquo|oblique|elevacao\s*de\s*pernas|leg\s*raise|lombar|hiperextensao|back\s*extension)\b/i,
    'core',
  ],
];

/** Strips accents so "abdômen" and "abdomen" hit the same rule. */
function normalize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function muscleGroupOf(exercise: string): MuscleGroup {
  const normalized = normalize(exercise);
  if (!normalized) return 'other';
  for (const [pattern, group] of RULES) {
    if (pattern.test(normalized)) return group;
  }
  return 'other';
}

/** Display order: biggest movers first, `other` last so it reads as a remainder. */
export const MUSCLE_ORDER: readonly MuscleGroup[] = [
  'legs',
  'back',
  'chest',
  'shoulders',
  'glutes',
  'biceps',
  'triceps',
  'core',
  'calves',
  'cardio',
  'other',
];

export const MUSCLE_COLORS: Record<MuscleGroup, string> = {
  legs: '#4D8DFF',
  back: '#34C759',
  chest: '#FF922E',
  shoulders: '#FFD60A',
  glutes: '#FF6B9D',
  biceps: '#5E5CE6',
  triceps: '#64D2FF',
  core: '#FF453A',
  calves: '#30D158',
  cardio: '#BF5AF2',
  other: '#8E8E93',
};
