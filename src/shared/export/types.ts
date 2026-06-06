export type ExportCellValue = string | number | boolean | null | undefined;

export type ExportColumn<T> = {
  key: string;
  header: string;
  value: (row: T) => ExportCellValue;
};

export type ExportTablePayload<T> = {
  title: string;
  filename: string;
  columns: ExportColumn<T>[];
  rows: T[];
  filterLabel?: string;
  generatedAt?: Date;
  exportProfile?: string;
  formatPreset?: string;
};
