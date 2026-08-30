import type { Automation } from "./types";

// Normaliza para comparar sem acento, sem caixa e sem pontuação sobrando.
export function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matches(automation: Automation, text: string): boolean {
  const haystack = normalize(text || "");
  if (automation.match_type === "any") return true;
  if (!haystack) return false;

  const needles = (automation.keywords || []).map(normalize).filter(Boolean);
  if (needles.length === 0) return false;

  if (automation.match_type === "exact") {
    return needles.includes(haystack);
  }
  // contains: palavra-chave aparece como palavra inteira dentro do texto
  const words = new Set(haystack.split(" "));
  return needles.some((n) =>
    n.includes(" ") ? haystack.includes(n) : words.has(n)
  );
}

export function pickRandom<T>(list: T[]): T | null {
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}
