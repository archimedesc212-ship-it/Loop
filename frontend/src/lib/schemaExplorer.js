/** Search helpers for the read-only ER explorer. */
export function filterSchemaTables(tables, search = '') {
  const q = String(search || '').trim().toLowerCase();
  const all = Object.values(tables || {}).sort((a, b) => a.name.localeCompare(b.name));
  if (!q) return all;
  return all.filter((table) => table.name.toLowerCase().includes(q)
    || table.columns.some((column) => column.name.toLowerCase().includes(q) || column.type.toLowerCase().includes(q)));
}

export function incomingReferences(tables, tableName) {
  return Object.values(tables || {}).flatMap((table) => (table.fks || [])
    .filter((fk) => fk.ref === tableName)
    .map((fk) => ({ from: table.name, name: fk.name, columns: fk.cols, refColumns: fk.refCols, onDelete: fk.onDelete }))
  ).sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name));
}

export function outgoingReferences(table) {
  return (table?.fks || []).map((fk) => ({
    to: fk.ref, name: fk.name, columns: fk.cols, refColumns: fk.refCols,
    onDelete: fk.onDelete, onUpdate: fk.onUpdate, nullable: fk.nullable, unique: fk.unique,
  })).sort((a, b) => a.to.localeCompare(b.to));
}
