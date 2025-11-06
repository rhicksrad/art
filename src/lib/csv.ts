const sanitizeValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
};

const escapeValue = (value: string): string => {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const buildHeader = (rows: Record<string, unknown>[]): string[] => {
  const fields = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (key && key.trim().length > 0) {
        fields.add(key);
      }
    });
  });
  return Array.from(fields);
};

const toCsv = (rows: Record<string, unknown>[]): string => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '';
  }

  const header = buildHeader(rows);
  const lines = [header.join(',')];

  rows.forEach((row) => {
    const values = header.map((field) => {
      const raw = sanitizeValue(row[field]);
      return escapeValue(raw);
    });
    lines.push(values.join(','));
  });

  return lines.join('\n');
};

const getDownloadLink = (): HTMLAnchorElement => {
  const link = document.createElement('a');
  link.style.display = 'none';
  return link;
};

export const exportCsv = (filename: string, rows: Record<string, unknown>[]): void => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const csv = toCsv(rows);
  if (csv.length === 0) {
    return;
  }

  const blob = new Blob(["\ufeff", csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = getDownloadLink();
  link.href = url;
  link.download = filename || 'export.csv';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};

export default exportCsv;
