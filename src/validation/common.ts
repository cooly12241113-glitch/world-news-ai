import * as z from "zod";

const hasVisibleCharacter = (value: string): boolean => value.trim().length > 0;

export const NonEmptyStringSchema = z.string().min(1).refine(hasVisibleCharacter);
export const IdSchema = NonEmptyStringSchema;
export const ISODateStringSchema = z.iso.datetime({ offset: true });
export const URLStringSchema = z.string().refine((value) => {
  if (!URL.canParse(value)) {
    return false;
  }

  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
});
export const LanguageCodeSchema = z.string().regex(
  /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/,
);
export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/);
export const ConfidenceLevelSchema = z.enum(["low", "medium", "high"]);
export const UniqueIdArraySchema = z
  .array(IdSchema)
  .refine((values) => new Set(values).size === values.length);
