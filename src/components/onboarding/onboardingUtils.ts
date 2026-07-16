import { addDays, todayISO } from "@/core/date";
import { buildOnboardingSummary, defaultOnboardingProfile } from "@/core/onboarding";

export const PICKER_NONE = "__none__";
export const goalDateOptions = [28, 56, 84, 112].map((days) => ({
  days,
  value: addDays(todayISO(), days),
}));
export type PickerKind = "height" | "weight" | "goalWeight" | "goalDate";
export type PickerValue = number | string | null;
export function isoToDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatISODate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatHeightFeetInches(heightCm: number) {
  const totalInches = Math.round(heightCm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet} ft ${inches} in`;
}


export function ageLabel(date: string, lang: "pt-BR" | "en-US") {
  const age = buildOnboardingSummary({
    ...defaultOnboardingProfile(),
    birthDate: date,
  }).age;
  return lang === "pt-BR" ? `${age} anos` : `${age} years old`;
}

export function formatDate(date: string, lang: "pt-BR" | "en-US") {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(lang, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function goalMonthLabels(goalDate: string | null, lang: "pt-BR" | "en-US") {
  const today = new Date();
  const target = goalDate
    ? new Date(goalDate)
    : new Date(addDays(todayISO(), 84));
  const spanMonths = Math.max(
    2,
    Math.round((target.getTime() - today.getTime()) / 2_592_000_000),
  );
  return [0, 1, 2, 3].map((offset) => {
    if (offset === 0) return lang === "pt-BR" ? "hoje" : "today";
    const labelDate = new Date(
      today.getFullYear(),
      today.getMonth() + Math.round((spanMonths / 3) * offset),
      1,
    );
    return labelDate
      .toLocaleDateString(lang, { month: "short" })
      .replace(".", "");
  });
}

export function valueY(
  value: number,
  min: number,
  span: number,
  height: number,
  top: number,
  bottom: number,
) {
  return top + (1 - (value - min) / span) * (height - top - bottom);
}

export function range(start: number, end: number, step: number) {
  const values: number[] = [];
  for (
    let value = start;
    value <= end;
    value = Math.round((value + step) * 10) / 10
  ) {
    values.push(value);
  }
  return values;
}
