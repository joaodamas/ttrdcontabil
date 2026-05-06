export type CsvColumn = { key: string; label: string }

export function exportToCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns: CsvColumn[]
) {
  const escape = (val: unknown) => {
    if (val === null || val === undefined) return ''
    const str = String(val).replace(/"/g, '""')
    return /[,"\n\r]/.test(str) ? `"${str}"` : str
  }

  const header = columns.map((c) => escape(c.label)).join(',')
  const body = rows
    .map((row) => columns.map((c) => escape(row[c.key])).join(','))
    .join('\n')

  // BOM UTF-8 para o Excel abrir corretamente
  const blob = new Blob(['﻿' + header + '\n' + body], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
