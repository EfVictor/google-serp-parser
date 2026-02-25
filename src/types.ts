/**
 * Описание одного элемента поисковой выдачи.
 * link    — URL
 * anchor  — текст заголовка результата 
 * snippet — текст сниппета
 * kind    — тип результата: реклама (ad) или органика (organic)
 */
export interface SearchResult {
  link: string;
  anchor: string;
  snippet: string;
  kind: "ad" | "organic";
}

/**
 * Результат парсинга SERP.
 * results     — результат парсинга сохранённой страницы SERP
 * nextPageUrl — ссылка на следующую страницу результатов 
 */ 
export interface ParseResult {
  results: SearchResult[];
  nextPageUrl: string | null;
}