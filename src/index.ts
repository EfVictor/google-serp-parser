import fs from "fs";
import path from "path";
import { parseGoogleHtml } from "./parser";
import { saveToCsv } from "./csv";

// Пути к входному HTML и выходному CSV. Заданы по умолчанию, но можно вынести в env.
const inputHtmlPath = path.resolve("input", "google.html");
const outputCsvPath = path.resolve("output", "result.csv");

const html = fs.readFileSync(inputHtmlPath, "utf-8");

const parsed = parseGoogleHtml(html);

saveToCsv(parsed.results, outputCsvPath);

console.log("Parsed results:", parsed.results.length);
console.log("Next page:", parsed.nextPageUrl);
console.log("CSV saved to:", outputCsvPath);