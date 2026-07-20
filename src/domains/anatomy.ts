/**
 * Grupamento -> musculo -> porcao, for the whole body.
 *
 * This is a fixed vocabulary, not a guess: anatomy does not change per user, so
 * it lives here rather than being re-derived by the model on every note. The
 * model's job is to map an exercise ONTO this list — and because the ids below
 * are what the schema validates against, it cannot invent a muscle that does
 * not exist here.
 */

export type MuscleGroupId =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'legs'
  | 'glutes'
  | 'core'
  | 'cardio'
  | 'other';

export interface MuscleDefinition {
  id: string;
  group: MuscleGroupId;
  /** Portions of this muscle. Empty when the muscle is not usefully divisible. */
  portions: readonly string[];
}

export const MUSCLES: readonly MuscleDefinition[] = [
  // ---- peito
  { id: 'pectoralis-major', group: 'chest', portions: ['clavicular', 'sternal', 'abdominal'] },
  { id: 'pectoralis-minor', group: 'chest', portions: [] },
  { id: 'serratus-anterior', group: 'chest', portions: [] },

  // ---- costas
  { id: 'latissimus-dorsi', group: 'back', portions: [] },
  { id: 'trapezius', group: 'back', portions: ['upper', 'middle', 'lower'] },
  { id: 'rhomboids', group: 'back', portions: [] },
  { id: 'teres-major', group: 'back', portions: [] },
  { id: 'erector-spinae', group: 'back', portions: [] },

  // ---- ombros
  { id: 'deltoid', group: 'shoulders', portions: ['anterior', 'lateral', 'posterior'] },
  { id: 'rotator-cuff', group: 'shoulders', portions: [] },

  // ---- bracos
  { id: 'biceps-brachii', group: 'arms', portions: ['long-head', 'short-head'] },
  { id: 'brachialis', group: 'arms', portions: [] },
  { id: 'brachioradialis', group: 'arms', portions: [] },
  { id: 'triceps-brachii', group: 'arms', portions: ['long-head', 'lateral-head', 'medial-head'] },
  { id: 'forearm-flexors', group: 'arms', portions: [] },

  // ---- pernas
  {
    id: 'quadriceps',
    group: 'legs',
    portions: ['rectus-femoris', 'vastus-lateralis', 'vastus-medialis', 'vastus-intermedius'],
  },
  { id: 'hamstrings', group: 'legs', portions: ['biceps-femoris', 'semitendinosus', 'semimembranosus'] },
  { id: 'adductors', group: 'legs', portions: [] },
  { id: 'gastrocnemius', group: 'legs', portions: ['medial', 'lateral'] },
  { id: 'soleus', group: 'legs', portions: [] },
  { id: 'tibialis-anterior', group: 'legs', portions: [] },

  // ---- gluteos
  { id: 'gluteus-maximus', group: 'glutes', portions: [] },
  { id: 'gluteus-medius', group: 'glutes', portions: [] },
  { id: 'gluteus-minimus', group: 'glutes', portions: [] },

  // ---- core
  { id: 'rectus-abdominis', group: 'core', portions: ['upper', 'lower'] },
  { id: 'obliques', group: 'core', portions: ['internal', 'external'] },
  { id: 'transverse-abdominis', group: 'core', portions: [] },

  // ---- cardio has no muscle target; kept so every entry maps somewhere
  { id: 'cardiovascular', group: 'cardio', portions: [] },

  // Where an exercise the vocabulary does not cover lands. Named rather than
  // dropped, so the monitor can say how much it could not classify.
  { id: 'unclassified', group: 'other', portions: [] },
];

export const MUSCLE_IDS: readonly string[] = MUSCLES.map((muscle) => muscle.id);

const BY_ID = new Map(MUSCLES.map((muscle) => [muscle.id, muscle]));

export function muscleById(id: string): MuscleDefinition | undefined {
  return BY_ID.get(id);
}

export function groupOfMuscle(id: string): MuscleGroupId | undefined {
  return BY_ID.get(id)?.group;
}

/** `chest/pectoralis-major/sternal` — the flat form the model returns. */
export function isValidPortion(muscleId: string, portion: string | undefined): boolean {
  const muscle = BY_ID.get(muscleId);
  if (!muscle) return false;
  return portion === undefined || muscle.portions.includes(portion);
}

export const GROUP_ORDER: readonly MuscleGroupId[] = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'glutes',
  'core',
  'cardio',
  'other',
];

export const GROUP_COLORS: Record<MuscleGroupId, string> = {
  chest: '#FF922E',
  back: '#34C759',
  shoulders: '#FFD60A',
  arms: '#5E5CE6',
  legs: '#4D8DFF',
  glutes: '#FF6B9D',
  core: '#FF453A',
  cardio: '#BF5AF2',
  other: '#8E8E93',
};

/**
 * Weekly set targets per muscle, the number this app calls "volume".
 * Volume is SETS, not tonnage: 8-12 hard sets per muscle per week is the
 * common low-volume prescription, below 8 is maintenance, above ~20 is where
 * most people stop recovering.
 */
export const WEEKLY_SET_TARGET = { min: 8, max: 12, hard: 20 } as const;

export type VolumeVerdict = 'under' | 'inRange' | 'above' | 'excessive';

export function volumeVerdict(weeklySets: number): VolumeVerdict {
  if (weeklySets < WEEKLY_SET_TARGET.min) return 'under';
  if (weeklySets <= WEEKLY_SET_TARGET.max) return 'inRange';
  if (weeklySets <= WEEKLY_SET_TARGET.hard) return 'above';
  return 'excessive';
}
