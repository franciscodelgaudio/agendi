export const EXPORT_FORMATS = ["pdf", "xlsx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export type ReportColumnKind = "text" | "money" | "date";
export type ReportColumn = { label: string; kind: ReportColumnKind };
export type ReportValue = string | number | null;
export type ReportTable = { title: string; columns: ReportColumn[]; rows: ReportValue[][]; total?: ReportValue[] };
export type Report = {
  title: string;
  subtitle: string;
  fileName: string;
  details: { label: string; value: string }[];
  highlights: { label: string; cents: number }[];
  tables: ReportTable[];
};

export function parseExportFormat(value: string | null | undefined): ExportFormat | null {
  return EXPORT_FORMATS.includes(value as ExportFormat) ? (value as ExportFormat) : null;
}
