import { useMemo, useState } from 'react';
import schema from '../data/muse-schema-model.json';
import { filterSchemaTables, incomingReferences, outgoingReferences } from '../lib/schemaExplorer';
import { PageHead, Empty, Stat, ErrorState } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

const tables = schema.tables || {};
const allTables = Object.values(tables);
const totalColumns = allTables.reduce((sum, table) => sum + table.columns.length, 0);
const totalKeys = allTables.reduce((sum, table) => sum + table.fks.length, 0);

export default function DatabaseExplorer() {
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState('users');
  const [tab, setTab] = useState('columns');
  const live = useApi(() => api.databaseSummary(), []);
  const filtered = useMemo(() => filterSchemaTables(tables, search), [search]);
  const selected = filtered.find((table) => table.name === selectedName) || filtered[0] || null;
  const incoming = useMemo(() => selected ? incomingReferences(tables, selected.name) : [], [selected]);
  const outgoing = selected ? outgoingReferences(selected) : [];
  const primary = new Set(selected?.pk || []);
  const unique = new Set((selected?.uniques || []).flatMap((item) => item.cols));

  const open = (name) => {
    if (!tables[name]) return;
    setSelectedName(name);
    setTab('columns');
  };

  return (
    <div className="page stack" style={{ '--gap': '18px' }}>
      <PageHead kicker="DBMS / READ-ONLY EXPLORER" title="LOOP DBMS explorer">
        <p className="soft small">Inspect LOOP’s MySQL schema, primary and foreign keys, normalised entities, views and migrations.</p>
      </PageHead>
      <section className="card stack" aria-labelledby="live-dbms-title" style={{ '--gap': 12 }}>
        <div className="row between wrap">
          <div className="stack" style={{ '--gap': 3 }}>
            <h2 id="live-dbms-title">Live MySQL database</h2>
            <p className="small muted">Counts queried from the connected backend, not copied from the frontend schema file.</p>
          </div>
          <span className={`chip ${live.data ? 'success' : ''}`}>{live.data ? 'Live connection' : live.loading ? 'Checking…' : 'Not verified'}</span>
        </div>
        {live.error && <ErrorState error={live.error} onRetry={live.reload} />}
        {live.data && <>
          <div className="grid-4">
            <Stat label="Base tables" value={live.data.tables ?? '—'} />
            <Stat label="Views" value={live.data.views ?? '—'} />
            <Stat label="Columns" value={live.data.columns ?? '—'} />
            <Stat label="Foreign keys" value={live.data.foreignKeys ?? '—'} />
          </div>
          <div className="grid-4">
            <Stat label="Indexes" value={live.data.indexes ?? '—'} />
            <Stat label="Functions" value={live.data.functions ?? '—'} />
            <Stat label="Procedures" value={live.data.procedures ?? '—'} />
            <Stat label="Triggers" value={live.data.triggers ?? '—'} />
          </div>
          <p className="tiny muted">Latest applied migration: {live.data.latestMigration ?? 'not reported'} · Sampled {live.data.sampledAt ? new Date(live.data.sampledAt).toLocaleString() : 'just now'}</p>
        </>}
        {!live.data && !live.loading && !live.error && <p className="small muted">No live database summary was returned. Confirm DB mode and MySQL connectivity.</p>}
      </section>
      <div className="grid-4">
        <Stat label="Snapshot tables" value={allTables.length} />
        <Stat label="Snapshot columns" value={totalColumns} />
        <Stat label="Snapshot foreign keys" value={totalKeys} />
        <Stat label="Snapshot views" value={schema.views?.length || 0} />
      </div>
      <div className="card schema-explorer-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.78fr) minmax(0, 1.7fr)', gap: 18, padding: 16, alignItems: 'start' }}>
        <aside className="stack" style={{ '--gap': '10px', minWidth: 0 }} aria-label="Database tables">
          <label className="field"><span>Find a table or column</span>
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. listening_history" />
          </label>
          <div className="tiny muted">{filtered.length} of {allTables.length} tables</div>
          <div className="stack" style={{ '--gap': '4px', maxHeight: 650, overflowY: 'auto' }}>
            {filtered.map((table) => <button key={table.name} type="button" className={`nav-link${selected?.name === table.name ? ' active' : ''}`}
              style={{ justifyContent: 'space-between', textAlign: 'left', width: '100%' }} onClick={() => open(table.name)}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{table.name}</span>
              <span className="tiny muted">{table.columns.length}</span>
            </button>)}
            {!filtered.length && <Empty title="No matching table">Try a table name, column name or SQL data type.</Empty>}
          </div>
        </aside>
        <section className="stack" style={{ '--gap': '14px', minWidth: 0 }} aria-label="Selected table details">
          {!selected ? <Empty title="Choose a table">Select a table from the list to inspect its structure.</Empty> : <>
            <div className="row between wrap">
              <div className="stack" style={{ '--gap': '3px' }}>
                <h2 style={{ fontSize: '1.25rem', overflowWrap: 'anywhere' }}>{selected.name}</h2>
                <span className="tiny muted">{selected.columns.length} columns · {selected.pk.length} primary-key columns · {outgoing.length} outgoing relationships</span>
              </div>
              <div className="toggle-group" role="tablist" aria-label="Table details">
                {['columns', 'relationships'].map((name) => <button key={name} role="tab" aria-selected={tab === name} className={tab === name ? 'on' : ''}
                  onClick={() => setTab(name)}>{name === 'columns' ? 'Columns & keys' : 'Relationships'}</button>)}
              </div>
            </div>
            {tab === 'columns' ? (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Column</th><th>Type</th><th>Null</th><th>Key</th></tr></thead>
                  <tbody>{selected.columns.map((column) => <tr key={column.name}>
                    <td><b>{column.name}</b>{column.autoInc && <span className="tiny muted"> · auto</span>}{column.generated && <span className="tiny muted"> · generated</span>}</td>
                    <td className="num">{column.type}</td>
                    <td>{column.nullable ? 'YES' : 'NO'}</td>
                    <td>{primary.has(column.name) ? <span className="chip">PK</span> : unique.has(column.name) ? <span className="chip">UQ</span> : '—'}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            ) : (
              <div className="stack" style={{ '--gap': '16px' }}>
                <div className="stack" style={{ '--gap': '8px' }}>
                  <h3 style={{ fontSize: '0.95rem' }}>References to other tables</h3>
                  {outgoing.length ? outgoing.map((fk) => <div className="card row between wrap" key={fk.name} style={{ padding: 12 }}>
                    <div className="stack" style={{ '--gap': '3px' }}><b className="small">{fk.columns.join(', ')} → {fk.refColumns.join(', ')}</b><span className="tiny muted">{fk.name} · delete {fk.onDelete.toLowerCase()} · update {fk.onUpdate.toLowerCase()}{fk.nullable ? ' · nullable' : ''}{fk.unique ? ' · unique' : ''}</span></div>
                    <button className="btn ghost sm" onClick={() => open(fk.to)}>{fk.to} ↗</button>
                  </div>) : <p className="small muted">This table does not reference another table.</p>}
                </div>
                <div className="stack" style={{ '--gap': '8px' }}>
                  <h3 style={{ fontSize: '0.95rem' }}>Tables that reference this table</h3>
                  {incoming.length ? incoming.map((fk) => <div className="card row between wrap" key={`${fk.from}.${fk.name}`} style={{ padding: 12 }}>
                    <div className="stack" style={{ '--gap': '3px' }}><b className="small">{fk.from}.{fk.columns.join(', ')} → {fk.refColumns.join(', ')}</b><span className="tiny muted">{fk.name} · delete {fk.onDelete.toLowerCase()}</span></div>
                    <button className="btn ghost sm" onClick={() => open(fk.from)}>{fk.from} ↗</button>
                  </div>) : <p className="small muted">No incoming foreign keys in this schema snapshot.</p>}
                </div>
              </div>
            )}
          </>}
        </section>
      </div>
      <section className="panel stack" style={{ '--gap': '10px' }}>
        <div className="row between wrap"><h3>Schema snapshot notes</h3><span className="tiny muted">Generated {schema.generatedAt ? new Date(schema.generatedAt).toLocaleDateString() : 'date not recorded'}</span></div>
        <p className="small soft">This is a read-only schema snapshot from <code>docs/erd/schema-model.json</code>, not a live connection. The running backend uses MySQL for authentication, catalogue records, playlists, search history, playback events and audit data. Apply the listed migrations before the DBMS demonstration.</p>
        <div className="row wrap">{(schema.migrations || []).map((migration) => <span className="chip" key={migration.version}>{migration.version} · {migration.name}</span>)}</div>
        <details><summary className="small muted">Views ({schema.views?.length || 0})</summary>
          <div className="row wrap" style={{ marginTop: 10 }}>{(schema.views || []).map((name) => <span className="chip" key={name}>{name}</span>)}</div>
        </details>
      </section>
    </div>
  );
}
