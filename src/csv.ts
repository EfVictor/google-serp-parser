import fs from "fs";
import path from "path";
import { SearchResult } from "./types";

// Сохранение результата парсинга в CSV-файл.
export function saveToCsv(results: SearchResult[], filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const header = "kind,link,anchor,snippet\n";
  const rows = results.map((r) =>
    [r.kind, r.link, r.anchor, r.snippet].map(escapeCsv).map((v) => `"${v}"`).join(",")
  );

  fs.writeFileSync(filePath, header + rows.join("\n"), "utf-8");
}

// Экранирование значения под CSV.
function escapeCsv(value: string): string {
  return String(value).replace(/\r?\n/g, " ").replace(/"/g, '""');
}