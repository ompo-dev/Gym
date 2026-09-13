import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
  useFonts as usePoppinsFonts,
} from "@expo-google-fonts/poppins";
import {
  Platform,
  Text,
  TextInput,
  type TextProps,
  type TextInputProps,
  type TextStyle,
} from "react-native";

import { Fonts } from "@/constants/theme";

const USE_POPPINS = Platform.OS === "android" || Platform.OS === "web";

type DefaultStyleComponent<TProps> = {
  defaultProps?: Partial<TProps>;
};

let defaultFontInstalled = false;

function withDefaultStyle<TProps extends { style?: unknown }>(
  component: DefaultStyleComponent<TProps>,
  style: TextStyle,
): void {
  component.defaultProps = {
    ...component.defaultProps,
    style: [style, component.defaultProps?.style],
  } as Partial<TProps>;
}

export function installDefaultFontFamily(): void {
  if (!USE_POPPINS || !Fonts?.regular || defaultFontInstalled) return;
  defaultFontInstalled = true;
  const style = { fontFamily: Fonts.regular };
  withDefaultStyle<TextProps>(
    Text as unknown as DefaultStyleComponent<TextProps>,
    style,
  );
  withDefaultStyle<TextInputProps>(
    TextInput as unknown as DefaultStyleComponent<TextInputProps>,
    style,
  );
}

export function useAppFonts(): boolean {
  const [loaded, error] = usePoppinsFonts(
    USE_POPPINS
      ? {
          Poppins_400Regular,
          Poppins_500Medium,
          Poppins_600SemiBold,
          Poppins_700Bold,
          Poppins_800ExtraBold,
        }
      : {},
  );
  return !USE_POPPINS || loaded || Boolean(error);
}
