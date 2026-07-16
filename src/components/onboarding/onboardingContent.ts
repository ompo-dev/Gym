import {
  Bike,
  CircleHelp,
  Dumbbell,
  Fish,
  Footprints,
  Leaf,
  Mars,
  MoonStar,
  Target,
  Users,
  Venus,
} from "lucide-react-native";

import type {
  OnboardingActivity,
  OnboardingBias,
  OnboardingConsideration,
  OnboardingProfile,
} from "@/core/onboarding";
// Dot colors by bias index: strong blue (lowest) → light blue → white (neutral) → orange → red (highest).
export const BIAS_DOT_COLORS = ["#2F6BFF", "#5BA7F7", "#FFFFFF", "#F5A03D", "#F0574B"];

type GenderOption = OnboardingProfile["gender"];
export type LangKey = "pt-BR" | "en-US";

export interface OnboardingText {
  welcomeTitle: string;
  welcomeBody: string;
  welcomeHint: string;
  start: string;
  skip: string;
  continue: string;
  finish: string;
  stageProfile: string;
  stageApp: string;
  genderTitle: string;
  genderBody: string;
  birthdayTitle: string;
  birthdayBody: string;
  birthdayField: string;
  birthdaySafety: string;
  heightTitle: string;
  heightBody: string;
  weightTitle: string;
  weightBody: string;
  currentWeight: string;
  goalWeight: string;
  goalDate: string;
  goalDateCta: string;
  activityTitle: string;
  activityBody: string;
  considerationsTitle: string;
  considerationsBody: string;
  considerationsNotes: string;
  considerationsHint: string;
  uncertaintyTitle: string;
  uncertaintyBody: string;
  goalsTitle: string;
  goalsBody: string;
  personalize: string;
  micros: string;
  metabolism: string;
  reasoning: string;
  accuracyTitle: string;
  accuracyBody: string;
  detailsTitle: string;
  detailsBody: string;
  captureTitle: string;
  captureBody: string;
  pickerDone: string;
  pickerCancel: string;
  saveDate: string;
  neutral: string;
}

export const copy: Record<LangKey, OnboardingText> = {
  "pt-BR": {
    welcomeTitle: "Bem-vindo ao GymNotes",
    welcomeBody: "O app de contagem de calorias mais simples do mundo.",
    welcomeHint: "Feito para você manter o hábito.",
    start: "Começar",
    skip: "Já tem uma conta? Entrar",
    continue: "Continuar",
    finish: "Entrar no GymNotes",
    stageProfile: "Quem é você?",
    stageApp: "GymNotes",
    genderTitle: "Qual é o seu gênero?",
    genderBody: "Isso nos ajuda a calcular metas precisas de calorias e macros",
    birthdayTitle: "Quando é seu aniversário?",
    birthdayBody:
      "Usamos isso apenas para calcular sua idade para métricas de saúde e metas. Sua data de nascimento fica privada e segura.",
    birthdayField: "Data de nascimento",
    birthdaySafety: "Seus dados são privados e seguros",
    heightTitle: "Qual é sua altura?",
    heightBody:
      "Isso ajuda a estimar seu gasto energético diário com mais precisão.",
    weightTitle: "Qual é seu peso?",
    weightBody:
      "Com isso montamos metas realistas e uma previsão inicial de calorias.",
    currentWeight: "Peso atual",
    goalWeight: "Peso-meta",
    goalDate: "Data-alvo (opcional)",
    goalDateCta: "Definir data-alvo",
    activityTitle: "Qual é seu nível de atividade?",
    activityBody: "Seja honesto! Isso afeta suas necessidades calóricas.",
    considerationsTitle: "Alguma consideração especial?",
    considerationsBody:
      "Selecione tudo que se aplica. Você poderá mudar isso depois.",
    considerationsNotes: "Algo mais? (opcional)",
    considerationsHint: "Isso ajuda a personalizar suas metas nutricionais.",
    uncertaintyTitle:
      "Como o GymNotes deve lidar com a incerteza das calorias?",
    uncertaintyBody:
      "Quando os dados variam, escolha se prefere estimativas mais conservadoras ou mais altas.",
    goalsTitle: "Suas metas personalizadas",
    goalsBody:
      "Calculamos uma primeira versão com base no seu perfil. Você poderá ajustar depois.",
    personalize: "Personalizar metas",
    micros: "Acompanhar micronutrientes",
    metabolism: "Informações de metabolismo",
    reasoning: "Raciocínio do GymNotes",
    accuracyTitle: "A GymNotes é precisa?",
    accuracyBody:
      "Em alguns casos, a GymNotes pode ser mais precisa que apps como MyFitnessPal e Lose It",
    detailsTitle: "Quanto mais detalhes você der, mais precisa a GymNotes fica",
    detailsBody:
      "Marca, quantidade e detalhes do restaurante ajudam a GymNotes.",
    captureTitle: "Você não precisa digitar tudo",
    captureBody: "Há outras quatro formas fáceis de registrar sua comida.",
    pickerDone: "Concluir",
    pickerCancel: "Cancelar",
    saveDate: "Salvar data",
    neutral: "Sem viés",
  },
  "en-US": {
    welcomeTitle: "Welcome to GymNotes",
    welcomeBody: "The simplest calorie counting app in the world.",
    welcomeHint: "Built to help you keep the habit.",
    start: "Start",
    skip: "Already have an account? Sign in",
    continue: "Continue",
    finish: "Open GymNotes",
    stageProfile: "Who are you?",
    stageApp: "GymNotes",
    genderTitle: "What is your gender?",
    genderBody: "This helps us calculate accurate calorie and macro targets",
    birthdayTitle: "When is your birthday?",
    birthdayBody:
      "We only use this to calculate your age for health metrics and goals. Your birth date stays private and secure.",
    birthdayField: "Birth date",
    birthdaySafety: "Your data stays private and secure",
    heightTitle: "What is your height?",
    heightBody:
      "This helps estimate your daily energy expenditure more accurately.",
    weightTitle: "What is your weight?",
    weightBody:
      "We use this to create realistic goals and your initial calorie target.",
    currentWeight: "Current weight",
    goalWeight: "Goal weight",
    goalDate: "Target date (optional)",
    goalDateCta: "Set target date",
    activityTitle: "What is your activity level?",
    activityBody: "Be honest. This affects your calorie needs.",
    considerationsTitle: "Any special considerations?",
    considerationsBody: "Select all that apply. You can change this later.",
    considerationsNotes: "Anything else? (optional)",
    considerationsHint: "This helps personalize your nutrition targets.",
    uncertaintyTitle: "How should GymNotes handle calorie uncertainty?",
    uncertaintyBody:
      "When nutrition data varies, pick whether you want lower, balanced, or higher estimates.",
    goalsTitle: "Your personalized goals",
    goalsBody:
      "This is a first pass based on your profile. You can adjust it later.",
    personalize: "Customize goals",
    micros: "Track micronutrients",
    metabolism: "Metabolism insights",
    reasoning: "GymNotes reasoning",
    accuracyTitle: "Is GymNotes accurate?",
    accuracyBody:
      "In some cases, GymNotes can be more accurate than apps like MyFitnessPal and Lose It",
    detailsTitle: "The more detail you give, the more accurate GymNotes gets",
    detailsBody: "Brand, quantity, and restaurant details help GymNotes.",
    captureTitle: "You don't need to type everything",
    captureBody: "There are four other easy ways to log your food.",
    pickerDone: "Done",
    pickerCancel: "Cancel",
    saveDate: "Save date",
    neutral: "Neutral",
  },
} as const;

export const genderOptions: {
  value: GenderOption;
  label: Record<"pt-BR" | "en-US", string>;
  Icon: typeof Mars;
}[] = [
  {
    value: "male",
    label: { "pt-BR": "Masculino", "en-US": "Male" },
    Icon: Mars,
  },
  {
    value: "female",
    label: { "pt-BR": "Feminino", "en-US": "Female" },
    Icon: Venus,
  },
  {
    value: "other",
    label: { "pt-BR": "Outro", "en-US": "Other" },
    Icon: Users,
  },
  {
    value: "private",
    label: { "pt-BR": "Prefiro não dizer", "en-US": "Prefer not to say" },
    Icon: CircleHelp,
  },
];

export const activityOptions: {
  value: OnboardingActivity;
  label: Record<"pt-BR" | "en-US", string>;
  body: Record<"pt-BR" | "en-US", string>;
  Icon: typeof MoonStar;
}[] = [
  {
    value: "sedentary",
    label: { "pt-BR": "Sedentário", "en-US": "Sedentary" },
    body: {
      "pt-BR": "Pouco ou nenhum exercício, rotina mais parada.",
      "en-US": "Little to no exercise, mostly inactive days.",
    },
    Icon: MoonStar,
  },
  {
    value: "light",
    label: { "pt-BR": "Levemente ativo", "en-US": "Lightly active" },
    body: {
      "pt-BR": "Treino leve 1-3 vezes por semana.",
      "en-US": "Light training 1-3 times per week.",
    },
    Icon: Footprints,
  },
  {
    value: "moderate",
    label: { "pt-BR": "Moderadamente ativo", "en-US": "Moderately active" },
    body: {
      "pt-BR": "Treino moderado 3-5 vezes por semana.",
      "en-US": "Moderate training 3-5 times per week.",
    },
    Icon: Bike,
  },
  {
    value: "high",
    label: { "pt-BR": "Muito ativo", "en-US": "Very active" },
    body: {
      "pt-BR": "Treinos intensos ou rotina fisicamente pesada.",
      "en-US": "Intense training or very active routine.",
    },
    Icon: Dumbbell,
  },
];

export const considerationOptions: {
  value: OnboardingConsideration;
  label: Record<"pt-BR" | "en-US", string>;
  Icon: typeof Fish;
}[] = [
  {
    value: "high-protein",
    label: { "pt-BR": "Alta proteína", "en-US": "High protein" },
    Icon: Fish,
  },
  {
    value: "low-carb",
    label: { "pt-BR": "Baixo carboidrato", "en-US": "Low carb" },
    Icon: Leaf,
  },
  {
    value: "athlete",
    label: { "pt-BR": "Atleta", "en-US": "Athlete" },
    Icon: Target,
  },
  {
    value: "strength",
    label: { "pt-BR": "Treino de força", "en-US": "Strength training" },
    Icon: Dumbbell,
  },
  {
    value: "endurance",
    label: { "pt-BR": "Treino de resistência", "en-US": "Endurance" },
    Icon: Bike,
  },
  {
    value: "vegetarian",
    label: { "pt-BR": "Vegetariano/Vegano", "en-US": "Vegetarian/Vegan" },
    Icon: Leaf,
  },
];

export const biasMeta: Record<
  OnboardingBias,
  {
    title: Record<"pt-BR" | "en-US", string>;
    body: Record<"pt-BR" | "en-US", string>;
    example: Record<"pt-BR" | "en-US", string>;
  }
> = {
  0: {
    title: { "pt-BR": "Mais baixo", "en-US": "Lower" },
    body: {
      "pt-BR": "Prefira estimativas mais conservadoras quando existir dúvida.",
      "en-US": "Prefer more conservative estimates when data is fuzzy.",
    },
    example: {
      "pt-BR": "Refeicao de 500-700 cal -> registrada como 500 cal",
      "en-US": "500-700 cal meal -> logged as 500 cal",
    },
  },
  1: {
    title: { "pt-BR": "Baixo", "en-US": "Slightly lower" },
    body: {
      "pt-BR": "Mantém um viés leve para baixo.",
      "en-US": "Keep a slight downward bias.",
    },
    example: {
      "pt-BR": "Refeicao de 500-700 cal -> registrada como 560 cal",
      "en-US": "500-700 cal meal -> logged as 560 cal",
    },
  },
  2: {
    title: { "pt-BR": "Sem viés", "en-US": "Neutral" },
    body: {
      "pt-BR": "Abordagem equilibrada para acompanhamento preciso.",
      "en-US": "Balanced approach for the most neutral tracking.",
    },
    example: {
      "pt-BR": "Refeicao de 500-700 cal -> registrada como 600 cal",
      "en-US": "500-700 cal meal -> logged as 600 cal",
    },
  },
  3: {
    title: { "pt-BR": "Alto", "en-US": "Slightly higher" },
    body: {
      "pt-BR": "Puxa um pouco para cima quando os dados variam.",
      "en-US": "Lean a bit higher when nutrition data varies.",
    },
    example: {
      "pt-BR": "Refeicao de 500-700 cal -> registrada como 640 cal",
      "en-US": "500-700 cal meal -> logged as 640 cal",
    },
  },
  4: {
    title: { "pt-BR": "Mais alto", "en-US": "Higher" },
    body: {
      "pt-BR": "Use a faixa superior como padrão quando existir incerteza.",
      "en-US": "Use the higher end when uncertainty is high.",
    },
    example: {
      "pt-BR": "Refeicao de 500-700 cal -> registrada como 700 cal",
      "en-US": "500-700 cal meal -> logged as 700 cal",
    },
  },
};

