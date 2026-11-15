const SMALL_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "but",
  "or",
  "for",
  "nor",
  "on",
  "at",
  "to",
  "from",
  "by",
  "of",
  "in",
  "with",
  "as",
  "via",
  "vs",
  "per",
]);

/** Title case for system-defined UI labels only; never use on user names or record values. */
export function formatUiLabel(label: string): string {
  const words = [...label.matchAll(/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu)];
  let index = 0;
  return label.replace(/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu, (word, offset: number) => {
    const position = index++;
    if (label[offset - 1] === "&" && label[offset + word.length] === ";") return word;
    if (word !== word.toLowerCase() && word[0] === word[0].toLowerCase()) return word;
    if (word.length > 1 && word === word.toUpperCase()) return word;
    const phrasalIn =
      position > 0 && ["sign", "log"].includes(words[position - 1][0].toLowerCase());
    if (
      position > 0 &&
      position < words.length - 1 &&
      SMALL_WORDS.has(word.toLowerCase()) &&
      !(phrasalIn && word.toLowerCase() === "in")
    ) {
      return word.toLowerCase();
    }
    return word[0].toUpperCase() + word.slice(1);
  });
}
