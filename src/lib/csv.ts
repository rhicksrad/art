const ESCAPED_PATTERN = /[",\n\r]/;

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
};

const escapeValue = (value: string): string => {
  if (value.length === 0) {
    return "";
  }

  if (!ESCAPED_PATTERN.test(value)) {
    return value;
  }

  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
};

const buildHeader = (rows: Record<string, unknown>[]): string[] => {
  const keys = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (key.trim().length > 0) {
        keys.add(key);
      }
    });
  });
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
};

const buildCsv = (rows: Record<string, unknown>[]): string => {
  if (rows.length === 0) {
    return "";
  }

  const header = buildHeader(rows);
  const lines: string[] = [];
  lines.push(header.map(escapeValue).join(","));

  rows.forEach((row) => {
    const values = header.map((key) => escapeValue(formatValue(row[key])));
    lines.push(values.join(","));
  });

  return `${lines.join("\r\n")}\r\n`;
};

export const exportCsv = (
  filename: string,
  rows: Record<string, unknown>[]
): void => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const csv = buildCsv(rows);
  if (csv.length === 0) {
    return;
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
};
