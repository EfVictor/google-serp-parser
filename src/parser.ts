import { ParseResult, SearchResult } from "./types";

/**
 * Regex-only парсер.
 * Ограничение: разметка SERP нестабильна, regex заточен под сохранённый snapshot HTML.
 * Контракт: извлекаем содержимое (title/link/snippet/kind (ad|organic)) и ссылку на "Следующую" страницу, если она есть.
 * 
 * Стратегия:
 * 1) Сужаем HTML до основного контейнера результатов (#rso), чтобы не ловить мусор из header/footer.
 * 2) Делим выдачу на одинаковые блоки (div.MjjYud) — это “карточка” результата в выдаче.
 * 3) Внутри каждого блока:
 *    - определяем kind: "ad" | "organic"
 *    - достаём link/anchor/snippet локально (не даём данным “перетечь” из соседних блоков)
 */
export function parseGoogleHtml(html: string): ParseResult {
  const rsoHtml = extractRsoSection(html);

  // Если по какой-то причине #rso не найден — парсим по всему HTML.
  const scope = rsoHtml ?? html;

  const blocks = splitMjjYudBlocks(scope);

  const results: SearchResult[] = [];
  for (const block of blocks) {
    const parsed = parseResultBlock(block);
    if (parsed) results.push(parsed);
  }

  return {
    results,
    nextPageUrl: extractNextPageUrl(html),
  };
}

// Получение основного контейнера результатов (#rso).
function extractRsoSection(html: string): string | null {
  const m = html.match(
    /<div[^>]+id="rso"[^>]*>([\s\S]*?)<div[^>]+id="botstuff"[^>]*>/i
  );
  return m ? m[1] : null;
}


//Делим HTML на блоки div.MjjYud.
function splitMjjYudBlocks(scopeHtml: string): string[] {
  const re = /<div\s+class="MjjYud"[^>]*>/g;

  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(scopeHtml)) !== null) {
    starts.push(m.index);
  }
  if (starts.length === 0) return [];

  const blocks: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : scopeHtml.length;
    blocks.push(scopeHtml.slice(start, end));
  }

  return blocks;
}

// Парсинг одного блока
function parseResultBlock(blockHtml: string): SearchResult | null {
  const kind: SearchResult["kind"] = isAdBlock(blockHtml) ? "ad" : "organic";

  const common = kind === "ad" ? parseAdFields(blockHtml) : parseOrganicFields(blockHtml);
  if (!common) return null;

  return { kind, ...common };
}

// Определение "рекламы". В данном случае происходит поиск по (data-text-ad="1")
function isAdBlock(blockHtml: string): boolean {
  return /data-text-ad="1"/i.test(blockHtml);
}

/**
* Парсинг органических результатов
* Обычно содержит ссылку <a ...><h3>...</h3></a>
*/
function parseOrganicFields(blockHtml: string): Omit<SearchResult, "kind"> | null {
  const m = blockHtml.match(
    /<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<h3\b[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/a>/i
  );
  if (!m) return null;

  const rawHref = m[1];
  const rawTitle = m[2];

  const link = normalizeGoogleLink(rawHref);
  const anchor = normalizeText(rawTitle);

  // Сниппет чаще всего лежит в div.VwiC3b (внутри блока).
  const snippetMatch = blockHtml.match(
    /<div\s+class="VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  );
  const snippet = snippetMatch ? normalizeText(snippetMatch[1]) : "";

  // Без ссылки/заголовка такой результат не нужен.
  if (!link || !anchor) return null;

  return { link, anchor, snippet };
}


 /**
* Парсинг рекламных результатов
* - заголовок: div.CCgQ5 > span
* - текст:    div.p4wth > span
*/
function parseAdFields(blockHtml: string): Omit<SearchResult, "kind"> | null {
  const hrefMatch = blockHtml.match(/<a\b[^>]*href="([^"]+)"[^>]*>/i);
  if (!hrefMatch) return null;

  const link = normalizeGoogleLink(hrefMatch[1]);

  // Заголовок рекламы
  const titleMatch =
    blockHtml.match(
      /<div\s+class="CCgQ5[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i
    ) ||
    // fallback: первый span после ссылки (на случай другой структуры)
    blockHtml.match(/<a\b[^>]*href="[^"]+"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);

  const anchor = titleMatch ? normalizeText(titleMatch[1]) : "";

  // Текст рекламы
  const snippetMatch =
    blockHtml.match(
      /<div\s+class="p4wth"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i
    ) ||
    // fallback: любой “первый осмысленный” span с текстом после заголовка
    blockHtml.match(/<span[^>]*>([\s\S]{20,}?)<\/span>/i);

  const snippet = snippetMatch ? normalizeText(snippetMatch[1]) : "";

  if (!link) return null;

  return { link, anchor, snippet };
}

// Поиск ссылки на следующую страницу выдачи.
function extractNextPageUrl(html: string): string | null {
  const nextMatch =
    // id=pnnext (href перед id)
    html.match(/<a\b[^>]*href="([^"]+)"[^>]*\bid="pnnext"[^>]*>/i) ||
    // id=pnnext (id перед href)
    html.match(/<a\b[^>]*\bid="pnnext"[^>]*href="([^"]+)"[^>]*>/i) ||
     // aria-label содержит "След" (href перед aria-label)
    html.match(/<a\b[^>]*href="([^"]+)"[^>]*\baria-label="[^"]*След[^"]*"[^>]*>/i) ||
     // aria-label содержит "След" (aria-label перед href)
    html.match(/<a\b[^>]*\baria-label="[^"]*След[^"]*"[^>]*href="([^"]+)"[^>]*>/i);

  if (!nextMatch) return null;

  const href = decodeHtmlEntities((nextMatch[1] ?? nextMatch[2]) as string);

  if (/^https?:\/\//i.test(href)) return href;
  return `https://www.google.com${href.startsWith("/") ? "" : "/"}${href}`;
}

// Приведение href к итоговому URL.
function normalizeGoogleLink(href: string): string {
  const decoded = decodeHtmlEntities(href);

   // Абсолютный URL
  if (/^https?:\/\//i.test(decoded)) return decoded;

  //  Редирект Google
  if (decoded.startsWith("/url?")) {
    const extracted = extractQueryParam(decoded, "q") || extractQueryParam(decoded, "url");
    if (extracted) {
      try {
        return decodeURIComponent(extracted);
      } catch {
        return extracted;
      }
    }
  }

  // Любая другая относительная ссылка
  return `https://www.google.com${decoded.startsWith("/") ? "" : "/"}${decoded}`;
}

// Получение query-param через RegExp.
function extractQueryParam(url: string, key: string): string | null {
  const re = new RegExp(`[?&]${escapeRegExp(key)}=([^&]+)`, "i");
  const m = url.match(re);
  return m ? m[1] : null;
}

// Форматирование HTML-фрагмента в читаемый текст
function normalizeText(htmlFragment: string): string {
  const withoutTags = htmlFragment
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const text = decodeHtmlEntities(withoutTags)
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text === '"' || text === "“" || text === "”") return "";

  return text;
}

// Декодирование HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

// Экранирование спецсимволов
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}