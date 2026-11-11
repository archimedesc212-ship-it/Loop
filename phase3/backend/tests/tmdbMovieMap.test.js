const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapMovie } = require('../src/providers/tmdb');

test('TMDB movie mapping returns safe poster URLs and mapped metadata', () => {
  const movie = mapMovie({ id: 123, title: 'Sound of Music', original_title: 'Sound of Music', release_date: '2024-07-12', original_language: 'en', overview: 'A movie.', poster_path: '/poster_abc-1.jpg' });
  assert.equal(movie.externalId, '123');
  assert.equal(movie.year, 2024);
  assert.equal(movie.posterUrl, 'https://image.tmdb.org/t/p/w342/poster_abc-1.jpg');
  assert.equal(movie.sourceUrl, 'https://www.themoviedb.org/movie/123');
});

test('TMDB movie mapping rejects unsafe or malformed poster paths', () => {
  for (const posterPath of ['https://evil.example/poster.jpg', '/../secret', '/folder/image.jpg?token=x', null]) {
    assert.equal(mapMovie({ id: 3, title: 'Test', poster_path: posterPath }).posterUrl, null);
  }
});
