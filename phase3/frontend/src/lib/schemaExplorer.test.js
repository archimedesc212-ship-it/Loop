import { describe, it, expect } from 'vitest';
import { filterSchemaTables, incomingReferences, outgoingReferences } from './schemaExplorer';

const tables = {
  artists: { name: 'artists', columns: [{ name: 'artist_id', type: 'int unsigned' }], fks: [] },
  songs: { name: 'songs', columns: [{ name: 'song_id', type: 'int unsigned' }, { name: 'primary_artist_id', type: 'int unsigned' }], fks: [
    { name: 'fk_song_artist', ref: 'artists', cols: ['primary_artist_id'], refCols: ['artist_id'], onDelete: 'RESTRICT', onUpdate: 'CASCADE', nullable: false, unique: false },
  ] },
};

describe('ER explorer helpers', () => {
  it('searches table names, column names and column types without case sensitivity', () => {
    expect(filterSchemaTables(tables, 'SONG').map((x) => x.name)).toEqual(['songs']);
    expect(filterSchemaTables(tables, 'unsigned').map((x) => x.name)).toEqual(['artists', 'songs']);
    expect(filterSchemaTables(tables, 'primary_artist').map((x) => x.name)).toEqual(['songs']);
    expect(filterSchemaTables(tables, '  ').map((x) => x.name)).toEqual(['artists', 'songs']);
  });
  it('finds incoming references and returns outgoing relationship metadata', () => {
    expect(incomingReferences(tables, 'artists')).toEqual([{ from: 'songs', name: 'fk_song_artist', columns: ['primary_artist_id'], refColumns: ['artist_id'], onDelete: 'RESTRICT' }]);
    expect(outgoingReferences(tables.songs)[0]).toMatchObject({ to: 'artists', columns: ['primary_artist_id'], refColumns: ['artist_id'], unique: false });
    expect(incomingReferences(tables, 'missing')).toEqual([]);
  });
});
