/** Convert a catalogue search response into compact, safe autocomplete rows. */
export function buildSearchSuggestions(result) {
  const songs = Array.isArray(result?.songs) ? result.songs : [];
  const artists = Array.isArray(result?.artists) ? result.artists : [];
  const albums = Array.isArray(result?.albums) ? result.albums : [];
  return [
    ...songs.slice(0, 5).filter((song) => song?.title).map((song) => ({
      key: `song-${song.id}`, kind: 'Song', title: song.title,
      detail: song.artist?.name || 'Unknown artist',
      query: `${song.title} ${song.artist?.name || ''}`.trim(),
    })),
    ...artists.slice(0, 3).filter((artist) => artist?.name).map((artist) => ({
      key: `artist-${artist.id}`, kind: 'Artist', title: artist.name,
      detail: artist.type ? String(artist.type).toLowerCase() : 'Artist', query: artist.name,
    })),
    ...albums.slice(0, 2).filter((album) => album?.title).map((album) => ({
      key: `album-${album.id}`, kind: 'Album', title: album.title,
      detail: album.artist || 'Album', query: `${album.title} ${album.artist || ''}`.trim(),
    })),
  ];
}
