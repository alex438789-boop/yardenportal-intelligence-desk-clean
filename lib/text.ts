import * as OpenCC from "opencc-js";

const converter = OpenCC.Converter({ from: "cn", to: "tw" });

export function toTraditionalChinese(value: string | null | undefined) {
  if (!value) return value ?? null;
  return converter(value);
}