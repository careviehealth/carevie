export type HeightUnit = "cm" | "ft_in";
export type WeightUnit = "kg" | "lbs";

const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;
const KG_PER_LB = 0.45359237;

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const computeBmiFromMetrics = (
  heightCm: number | null,
  weightKg: number | null
): number | null => {
  if (!heightCm || !weightKg) return null;
  if (heightCm < 50 || heightCm > 260) return null;
  if (weightKg < 10 || weightKg > 400) return null;
  const heightMeters = heightCm / 100;
  return roundTo(weightKg / (heightMeters * heightMeters), 1);
};

export const lbsToKg = (lbs: number) => roundTo(lbs * KG_PER_LB, 2);

export const kgToLbs = (kg: number) => roundTo(kg / KG_PER_LB, 2);

export const feetInchesToCm = (feet: number, inches: number) =>
  roundTo((feet * INCHES_PER_FOOT + inches) * CM_PER_INCH, 2);

export const cmToFeetAndInches = (cm: number) => {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return {
    feet: Math.floor(totalInches / INCHES_PER_FOOT),
    inches: totalInches % INCHES_PER_FOOT,
  };
};

export const feetInchesToDecimalFeet = (feet: number, inches: number) =>
  roundTo(feet + inches / INCHES_PER_FOOT, 4);

export const decimalFeetToFeetAndInches = (heightFt: number) => {
  const totalInches = Math.round(heightFt * INCHES_PER_FOOT);
  return {
    feet: Math.floor(totalInches / INCHES_PER_FOOT),
    inches: totalInches % INCHES_PER_FOOT,
  };
};

export const inferHeightUnit = (heightFt: number | null | undefined): HeightUnit =>
  heightFt !== null && heightFt !== undefined ? "ft_in" : "cm";

export const inferWeightUnit = (weightLbs: number | null | undefined): WeightUnit =>
  weightLbs !== null && weightLbs !== undefined ? "lbs" : "kg";

export const formatHeightValue = (params: {
  unit: HeightUnit;
  heightCm?: number | null;
  heightFeet?: number | null;
  heightInches?: number | null;
}) => {
  if (params.unit === "ft_in") {
    const feet = params.heightFeet ?? 0;
    const inches = params.heightInches ?? 0;
    return `${feet} ft ${inches} in`;
  }
  return params.heightCm != null ? `${params.heightCm} cm` : "";
};

export const formatWeightValue = (params: {
  unit: WeightUnit;
  weightKg?: number | null;
  weightLbs?: number | null;
}) => {
  if (params.unit === "lbs") {
    return params.weightLbs != null ? `${params.weightLbs} lbs` : "";
  }
  return params.weightKg != null ? `${params.weightKg} kg` : "";
};

export const sanitizeBoundedWholeNumberInput = (raw: string, max: number) => {
  const digitsOnly = raw.replace(/\D/g, '');
  if (!digitsOnly) return '';
  const parsed = Number(digitsOnly);
  if (!Number.isFinite(parsed)) return '';
  if (parsed > max) return String(max);
  return String(parsed);
};
