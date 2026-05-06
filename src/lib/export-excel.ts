export type ExcelColumn = { key: string; label: string }

function escapeHtml(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function exportToExcel(
  filename: string,
  rows: Record<string, unknown>[],
  columns: ExcelColumn[],
) {
  const table = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
</head>
<body>
  <table>
    <thead>
      <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`

  const blob = new Blob([table], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
