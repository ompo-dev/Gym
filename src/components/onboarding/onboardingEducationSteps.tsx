import {
  Camera,
  Droplet,
  Popcorn,
  ScanSearch,
  Sparkles,
  Target,
  UtensilsCrossed,
} from "lucide-react-native";
import { type ReactNode } from "react";
import { View } from "react-native";

import { AppText } from "@/components/atoms/AppText";
import { copy } from "./onboardingContent";
import { useOnboardingTheme } from "./onboardingTheme";

export function DetailsStep({
  lang,
  text,
}: {
  lang: "pt-BR" | "en-US";
  text: (typeof copy)["pt-BR"];
}) {
  const { colors, styles } = useOnboardingTheme();

  const examples =
    lang === "pt-BR"
      ? [
          {
            icon: <Popcorn color="#F97316" size={34} strokeWidth={2.1} />,
            left: {
              title: '"chips"',
              value: "280 cal",
              subtitle: "62 % de precisão",
              tone: "warm" as const,
            },
            right: {
              title: '"Meio pacote de Pop Corners Kettle Corn"',
              value: "190 cal",
              subtitle: "93 % de precisão",
              tone: "good" as const,
            },
          },
          {
            icon: <Droplet color="#5EA0FF" size={34} strokeWidth={2.1} />,
            left: {
              title: '"mirtilos"',
              value: "80 cal",
              subtitle: "65 % de precisão",
              tone: "warm" as const,
            },
            right: {
              title: '"3,2 oz de mirtilos"',
              value: "52 cal",
              subtitle: "95 % de precisão",
              tone: "good" as const,
            },
          },
          {
            icon: (
              <UtensilsCrossed color="#22C55E" size={34} strokeWidth={2.1} />
            ),
            left: {
              title: '"salada"',
              value: "430 cal",
              subtitle: "68 % de precisão",
              tone: "warm" as const,
            },
            right: {
              title: '"Salada Chick-fil-A com molho"',
              value: "520 cal",
              subtitle: "94 % de precisão",
              tone: "good" as const,
            },
          },
        ]
      : [
          {
            icon: <Popcorn color="#F97316" size={34} strokeWidth={2.1} />,
            left: {
              title: '"chips"',
              value: "280 cal",
              subtitle: "62 % accuracy",
              tone: "warm" as const,
            },
            right: {
              title: '"Half bag of Pop Corners Kettle Corn"',
              value: "190 cal",
              subtitle: "93 % accuracy",
              tone: "good" as const,
            },
          },
          {
            icon: <Droplet color="#5EA0FF" size={34} strokeWidth={2.1} />,
            left: {
              title: '"blueberries"',
              value: "80 cal",
              subtitle: "65 % accuracy",
              tone: "warm" as const,
            },
            right: {
              title: '"3.2 oz blueberries"',
              value: "52 cal",
              subtitle: "95 % accuracy",
              tone: "good" as const,
            },
          },
          {
            icon: (
              <UtensilsCrossed color="#22C55E" size={34} strokeWidth={2.1} />
            ),
            left: {
              title: '"salad"',
              value: "430 cal",
              subtitle: "68 % accuracy",
              tone: "warm" as const,
            },
            right: {
              title: '"Chick-fil-A salad with dressing"',
              value: "520 cal",
              subtitle: "94 % accuracy",
              tone: "good" as const,
            },
          },
        ];

  return (
    <View style={[styles.stepSection, styles.centeredStep]}>
      <SectionPill label={lang === "pt-BR" ? "Dica rápida" : "Quick tip"} />
      <View style={styles.titleIconWrap}>
        <AppText variant="title" style={styles.largeCenterTitle}>
          {text.detailsTitle}
        </AppText>
        <Target color={colors.accentSoft} size={24} strokeWidth={2.3} />
      </View>
      <AppText
        variant="body"
        color={colors.textSecondary}
        style={styles.centerSubtitle}
      >
        {text.detailsBody}
      </AppText>

      {examples.map((example) => (
        <DetailExampleCard
          key={example.left.title}
          icon={example.icon}
          left={example.left}
          right={example.right}
        />
      ))}
    </View>
  );
}

export function CaptureStep({
  lang,
  text,
}: {
  lang: "pt-BR" | "en-US";
  text: (typeof copy)["pt-BR"];
}) {
  const { colors, styles } = useOnboardingTheme();

  return (
    <View style={[styles.stepSection, styles.centeredStep]}>
      <SectionPill label={lang === "pt-BR" ? "Só um aviso" : "Just a note"} />
      <View style={styles.titleIconWrap}>
        <AppText variant="title" style={styles.largeCenterTitle}>
          {text.captureTitle}
        </AppText>
        <Camera color={colors.accentSoft} size={24} strokeWidth={2.3} />
      </View>
      <AppText
        variant="body"
        color={colors.textSecondary}
        style={styles.centerSubtitle}
      >
        {text.captureBody}
      </AppText>

      <MethodCard
        tone="photo"
        icon={<Camera color="#FF62E5" size={22} strokeWidth={2.2} />}
        label={lang === "pt-BR" ? "FOTO" : "PHOTO"}
        title={lang === "pt-BR" ? "Tirar uma foto" : "Take a photo"}
        body={
          lang === "pt-BR"
            ? "Fotografe seu prato e a GymNotes cuida do resto."
            : "Photograph your plate and GymNotes handles the rest."
        }
        detected={
          lang === "pt-BR" ? "A GymNotes reconheceu" : "GymNotes recognized"
        }
        value="390 cal"
        item="sushi hosomaki"
      />

      <MethodCard
        tone="menu"
        icon={<ScanSearch color="#FFB357" size={22} strokeWidth={2.2} />}
        label={lang === "pt-BR" ? "SCAN" : "SCAN"}
        title={lang === "pt-BR" ? "Escanear um menu" : "Scan a menu"}
        body={
          lang === "pt-BR"
            ? "Aponte para o menu e a GymNotes lê para você."
            : "Point at a menu and GymNotes reads it for you."
        }
        detected={
          lang === "pt-BR" ? "A GymNotes detectou" : "GymNotes detected"
        }
        value={lang === "pt-BR" ? "3 itens" : "3 items"}
        item={
          lang === "pt-BR"
            ? "macarrão com carne ass..."
            : "beef pasta, dumplings..."
        }
      />
    </View>
  );
}

function SectionPill({ label }: { label: string }) {
  const { colors, styles } = useOnboardingTheme();

  return (
    <View style={styles.sectionPill}>
      <AppText variant="label" color={colors.accentSoft}>
        {label}
      </AppText>
    </View>
  );
}

function DetailExampleCard({
  icon,
  left,
  right,
}: {
  icon: ReactNode;
  left: {
    title: string;
    value: string;
    subtitle: string;
    tone: "good" | "warm" | "neutral";
  };
  right: {
    title: string;
    value: string;
    subtitle: string;
    tone: "good" | "warm" | "neutral";
  };
}) {
  const { colors, styles } = useOnboardingTheme();

  return (
    <View style={styles.detailExampleCard}>
      <View style={styles.detailSticker}>{icon}</View>
      <View style={styles.detailCompareRow}>
        <CompareTile {...left} />
        <View style={styles.compareArrow}>
          <AppText variant="heading" color={colors.textTertiary}>
            {"\u2192"}
          </AppText>
        </View>
        <CompareTile {...right} />
      </View>
    </View>
  );
}

function MethodCard({
  tone,
  icon,
  label,
  title,
  body,
  detected,
  value,
  item,
}: {
  tone: "photo" | "menu";
  icon: ReactNode;
  label: string;
  title: string;
  body: string;
  detected: string;
  value: string;
  item: string;
}) {
  const { colors, styles } = useOnboardingTheme();

  const isPhoto = tone === "photo";

  return (
    <View
      style={[
        styles.methodCard,
        isPhoto ? styles.methodCardPhoto : styles.methodCardMenu,
      ]}
    >
      <View style={styles.methodVisualRow}>
        <View style={styles.phoneMock}>
          <View style={styles.phoneNotch} />
          <AppText variant="caption" color="#FFFFFF" style={styles.phoneLabel}>
            {label}
          </AppText>
          <View
            style={[
              styles.phoneFood,
              isPhoto ? styles.phoneFoodPhoto : styles.phoneFoodMenu,
            ]}
          />
          <View style={styles.phoneShutter} />
        </View>

        <View style={styles.detectPanel}>
          <View style={styles.detectLabelRow}>
            <Sparkles color="#D96CFF" size={14} strokeWidth={2.4} />
            <AppText variant="label" color={colors.textSecondary}>
              {detected}
            </AppText>
          </View>
          <AppText variant="metric" style={styles.detectValue}>
            {value}
          </AppText>
          <AppText variant="secondary" style={styles.detectItem}>
            {item}
          </AppText>
        </View>
      </View>

      <View style={styles.methodCopyRow}>
        <View
          style={[
            styles.methodIcon,
            isPhoto ? styles.methodIconPhoto : styles.methodIconMenu,
          ]}
        >
          {icon}
        </View>
        <View style={styles.methodCopy}>
          <AppText variant="heading" style={styles.methodTitle}>
            {title}
          </AppText>
          <AppText
            variant="secondary"
            color={colors.textSecondary}
            style={styles.methodBody}
          >
            {body}
          </AppText>
        </View>
      </View>
    </View>
  );
}

function CompareTile({
  title,
  value,
  subtitle,
  tone,
}: {
  title: string;
  value: string;
  subtitle: string;
  tone: "good" | "warm" | "neutral";
}) {
  const { styles } = useOnboardingTheme();

  const toneStyle =
    tone === "good"
      ? [styles.compareTile, styles.compareGood]
      : tone === "warm"
        ? [styles.compareTile, styles.compareWarm]
        : [styles.compareTile, styles.compareNeutral];

  return (
    <View style={toneStyle}>
      <AppText variant="secondary">{title}</AppText>
      <AppText variant="metric" style={styles.compareValue}>
        {value}
      </AppText>
      <AppText
        variant="caption"
        color={
          tone === "good" ? "#52FF91" : tone === "warm" ? "#FFB357" : "#B8B8BD"
        }
      >
        {subtitle}
      </AppText>
    </View>
  );
}
