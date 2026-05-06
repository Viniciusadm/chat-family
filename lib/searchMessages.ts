export interface SearchableMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  createdAtMs: number;
}

export interface HighlightRange {
  start: number;
  end: number;
}

export interface SearchSnippet {
  text: string;
  ranges: HighlightRange[];
}

export interface SearchResult {
  message: SearchableMessage;
  score: number;
  snippet: SearchSnippet;
}

export function normalize(input: string): string {
  return input.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function tokenize(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp: number[] = new Array(a.length + 1);
  for (let j = 0; j <= a.length; j++) dp[j] = j;
  for (let i = 1; i <= b.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = i;
    for (let j = 1; j <= a.length; j++) {
      const tmp = dp[j];
      dp[j] =
        b[i - 1] === a[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
      if (dp[j] < rowMin) rowMin = dp[j];
    }
    if (rowMin > max) return max + 1;
  }
  return dp[a.length];
}

function scoreMessage(
  normalizedContent: string,
  phrase: string,
  tokens: string[]
): number {
  let score = 0;
  let anyMatch = false;

  if (phrase && tokens.length > 1 && normalizedContent.includes(phrase)) {
    score += 1000;
    anyMatch = true;
  }

  const words = normalizedContent.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    if (normalizedContent.includes(token)) {
      score += 100;
      const wordBoundary = new RegExp(`\\b${escapeRegExp(token)}\\b`);
      if (wordBoundary.test(normalizedContent)) {
        score += 50;
      }
      anyMatch = true;
      continue;
    }
    if (token.length >= 4) {
      const fuzzy = words.some((w) => levenshtein(w, token, 1) <= 1);
      if (fuzzy) {
        score += 20;
        anyMatch = true;
      }
    }
  }

  return anyMatch ? score : 0;
}

function buildSnippet(
  content: string,
  normalizedContent: string,
  phrase: string,
  tokens: string[]
): SearchSnippet {
  const candidates: string[] = [];
  if (phrase && tokens.length > 1) candidates.push(phrase);
  candidates.push(...tokens);

  let matchStart = -1;
  for (const cand of candidates) {
    if (!cand) continue;
    const idx = normalizedContent.indexOf(cand);
    if (idx >= 0) {
      matchStart = idx;
      break;
    }
  }

  if (matchStart < 0) {
    const fallback = content.length > 120 ? content.slice(0, 117) + "…" : content;
    return { text: fallback, ranges: [] };
  }

  const window = 80;
  const start = Math.max(0, matchStart - Math.floor(window / 2));
  const end = Math.min(content.length, start + window);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  const text = prefix + content.slice(start, end) + suffix;

  const offset = prefix.length - start;
  const terms = phrase && tokens.length > 1 ? [phrase, ...tokens] : tokens;
  const ranges: HighlightRange[] = [];
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    while (from <= normalizedContent.length) {
      const i = normalizedContent.indexOf(term, from);
      if (i < 0) break;
      if (i >= start && i + term.length <= end) {
        ranges.push({ start: i + offset, end: i + term.length + offset });
      }
      from = i + term.length;
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  const merged: HighlightRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  return { text, ranges: merged };
}

export function searchMessages(
  index: SearchableMessage[],
  query: string,
  options: { limit?: number } = {}
): SearchResult[] {
  const phrase = normalize(query.trim());
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const limit = options.limit ?? 50;

  const scored: SearchResult[] = [];
  for (const msg of index) {
    if (!msg.content) continue;
    const normalizedContent = normalize(msg.content);
    const score = scoreMessage(normalizedContent, phrase, tokens);
    if (score === 0) continue;
    scored.push({
      message: msg,
      score,
      snippet: buildSnippet(msg.content, normalizedContent, phrase, tokens),
    });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score || b.message.createdAtMs - a.message.createdAtMs
  );

  return scored.slice(0, limit);
}
