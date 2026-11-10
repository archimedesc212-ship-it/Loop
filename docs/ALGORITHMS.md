# Algorithms

Every algorithm below runs on data in MySQL, mostly inside stored procedures,
and every tunable number is a row in `model_parameters` (bounded by
`min_value` / `max_value`, changed only through Admin › Models, audited by
trigger). Values quoted are those of the active model versions in the seed.

> MUSE classifies **music**. A "sad" song is a song whose sound matches the
> profile of the Sad mood. Nothing here infers or diagnoses a listener's state of mind.

## 1. Mood analysis of songs — `sp_analyze_song_moods` (MOOD model 2.0)

Each mood stores a target profile (energy, valence, danceability, acousticness,
instrumentalness, tempo band). For every song's **current** audio analysis:

```
fit(song, mood) = 0.32·sim(energy) + 0.32·sim(valence) + 0.09·sim(danceability)
                + 0.09·sim(acousticness) + 0.08·sim(instrumentalness) + 0.10·tempo_fit
sim(x, t)       = 1 − |x − t|                       (fn_unit_similarity)
tempo_fit       = 1 inside [tempo_min, tempo_max], falling linearly to 0 at 40 BPM outside (fn_tempo_fit)
confidence      = (fit − fit_floor) / (1 − fit_floor)          fit_floor = 0.62
```

Keep the best mood always, plus others with confidence ≥ 0.35, at most 4 per song
(`ROW_NUMBER() OVER (PARTITION BY song_id ORDER BY conf DESC)`). Then **curator
decisions win**: `song_mood_curations` REMOVE rows are deleted and ADD rows are
inserted with the curator's confidence, on every run. Results are written for one
model version only, so older versions stay in `song_moods` for comparison (Q27).

Mood segments (`mood_segments`, SEGMENTS model) divide a song into time ranges, each
with its own energy/valence and the nearest mood on the energy–valence plane
(`fn_nearest_mood`); triggers keep segments inside the song and non-overlapping.

## 2. Reading a sentence — `moodParser.parse`

Deterministic and fully explained back to the user:

1. Normalise (lower-case, unify quotes, strip punctuation).
2. Match phrases from `mood_keywords` and `context_keywords` (plus every mood and context name), **longest first**; a matched span cannot be reused, so "feel good" beats "good".
3. A phrase with a negation in the three words before it (`not, no, never, don't, without, hardly…`) is **flipped** if it names a bright mood ("not happy" → Sad 0.6 + Calm 0.5) and **ignored** otherwise.
4. An intensifier right before a phrase (`very, really, so, super, bahut…`) multiplies its weight by 1.25.
5. Sum weights per mood; keep the top 3, normalised so the strongest is 1. The first context phrase becomes the context.
6. Return every match with how it was read; if nothing matched, `422 MOOD_NOT_UNDERSTOOD` with suggestions.

Target sound for the batch = the weight-averaged mood profiles; with a context, energy
and valence are averaged with the context's profile and the context decides texture
(instrumentalness, tempo band, maximum speechiness — e.g. Focus caps speechiness).

## 3. Learning a listener's taste — `sp_refresh_user_preferences_core` (PREFERENCE model 1.0)

Runs after every finished play, rating and like (same transaction), when a session
closes, and weekly for everyone.

**Signals** (one per event, from permanent tables only):

| Event | Signal |
|---|---|
| completed play (≥ 90 %) | `w_complete` = +1.0 |
| partial play | `w_partial × completion` = 0.4 × share |
| skip (< 30 s and < 50 %) | `w_skip` = −0.6 |
| replay (finished in the previous 24 h) | + `w_replay_bonus` = +0.5 |
| like | `w_like` = +2.0 |
| rating r ★ | (r − 3) × `w_rating` = ±0.8 per star |

**Decay** with two half-lives, `fn_decay(age, h) = 0.5^(age/h)`:

```
short_term = Σ signal · 0.5^(age_days / 7)        (half_life_short_days = 7)
long_term  = Σ signal · 0.5^(age_days / 90)       (half_life_long_days  = 90)
```

aggregated per genre (primary genre of the song), artist, mood (weighted by mood
confidence) and context (of the session).

**Blend with cold start**:

```
evidence = min(1, completed_plays / 25)                        (cold_start_plays = 25)
blended  = evidence · (0.4 · short/max_short + 0.6 · long/max_long)    (short_term_share = 0.4)
         + (1 − evidence) · onboarding_weight
```

Onboarding answers rank-weight the picks (1, 0.85, 0.7 … min 0.4). A new listener is
100 % onboarding; after 25 finished songs it is 100 % behaviour. The test
`preferences decay with age` inserts a 30-day-old play and checks it has mostly faded
from short-term (< 20 % of a fresh play) but is still strong in long-term (> 60 %).

## 4. Similar-listener collaborative refinement

For Daily, Regional, Discovery and Similar mixes (never private sessions), LOOP compares the listener's completed tracks from the last 180 days with other listeners' completed tracks. A neighbour must share at least two completed tracks; at most the 100 strongest overlaps are considered. Candidate tracks completed by at least two neighbours receive a small confidence-weighted boost:

```
listener_confidence = min(1, distinct_neighbours / 5)
boost_weight = 0.12 · listener_confidence
final = base_score · (1 − boost_weight) + neighbour_completion_score · boost_weight
```

This is request-time collaborative filtering, not a persistent user-similarity table. It is deliberately conservative: one neighbour cannot change a ranking, and new listeners without enough shared history continue to use onboarding, regional and trend signals. The adjusted order and scores are written back only to that generated recommendation batch so the API and saved batch remain consistent.

## 5. Scoring candidates — `sp_generate_recommendations` (RECOMMENDER model 3.0)

Candidates are `v_recommendation_candidates` (active, analysed, with a primary genre),
filtered by: content filter, discovery-only, seed song, chosen language,
**1★ ratings (never again)**, and songs played in the last 2 h (`recent_exclusion_hours`).

| Signal | Score in [0, 1] | Weight |
|---|---|---|
| **mood** | Σ(song mood confidence × requested mood weight) / Σ requested weights — only when moods were requested | 0.30 |
| **audio** | 0.3 sim(energy) + 0.3 sim(valence) + 0.1 × (danceability, acousticness, instrumentalness, tempo fit); penalised when speechiness exceeds the cap | 0.18 |
| **preference** | 0.45 genre + 0.30 artist + 0.25 mood (learned blended scores); a rating refines it (60 % taste, 40 % (r−1)/4); in a private session averaged with the session's temporary taste | 0.18 |
| **recency** | `fn_feature_similarity` to the average sound of the last ≤ 10 well-finished plays in 72 h — only when there are at least 2 | 0.07 |
| **trend** | 1 − (momentum_rank − 1)/(n − 1) in the latest 7-day snapshot | 0.05 |
| **context** | half context-mood overlap, half energy/instrumentalness/tempo/speechiness fit — only with a context | 0.10 |
| **regional** | first language 1.0, second 0.85, others 0.7, unlisted 0.1, instrumental 0.5; + 0.25 if the artist is from the listener's region — only if languages or region are set | 0.07 |
| **exploration** | unheard artist 1, heard artist but unheard song 0.6, heard song 0 (doubled weight for Discovery) | 0.05 |

```
final = Σ wᵢ·scoreᵢ / Σ wᵢ          (only over signals that apply to this batch)
        − w_repetition · repetition      w_repetition = 0.15
repetition = 0.7 · min(1, plays_this_week / 4) + 0.3 · skip_rate
```

Dividing by the weights that apply keeps scores comparable between, say, a mood
request (mood signal present) and a daily mix (no mood signal).

**Diversity**, in the same statement with window functions: at most `artist_cap` = 2
songs per artist and `CEIL(limit × genre_max_share)` = 40 % per genre
(`ROW_NUMBER() OVER (PARTITION BY artist_id …)`), then rank by score.

The ranked list is stored in `recommendation_items` with **every** signal score, so the
UI's score breakdown and the reasons come from the same numbers.

### Strategies

| Strategy | What changes |
|---|---|
| Mood / text | requested moods + targets from the parser |
| Context (`/recommendations/context/:code`) | context moods and texture; Focus prefers instrumental, low-speech |
| Daily mix | targets = the average sound of the last 30 days; moods = top learned moods (cold start: the Morning context) |
| Because you liked (`similar`) | seed = the most recent like or 4–5★ song; targets and moods = the seed's |
| Regional | restricted to the listener's first language (or the region's main language); targets from taste |
| Discovery | only never-played songs; exploration weight doubled |
| Recovery | three short stages — low & calm → easing → bright (energy 0.30 → 0.38 → 0.62, valence 0.22 → 0.50 → 0.80) — a musical arc, not a judgement about the listener |
| World | archetype moods weighted by the listener's affinity (below) |

## 5. Explanations — `recommendation_reasons`

Reasons are inserted only when the signal is really there, with a strength used to
show the top three:

| Reason | Condition |
|---|---|
| MOOD_MATCH "Carries the {mood} feel you asked for" | mood score ≥ 0.45 |
| AUDIO_FIT | audio score ≥ 0.88 |
| CONTEXT_FIT "Fits {context}: {bpm} BPM" | context score ≥ 0.6 |
| FAVORITE_GENRE "You often play {genre} ({count} plays)" | genre in the listener's top 3 with ≥ 3 plays |
| ARTIST_THIS_WEEK / FAVORITE_ARTIST | ≥ 3 plays this week / top-5 artist with ≥ 2 plays |
| REPLAYED_MOOD_LANGUAGE "Because you replay {mood} {language} tracks" | ≥ 2 replays of that mood in that language |
| RATED_HIGH | the listener rated it ≥ 4★ |
| SIMILAR_RECENT / SIMILAR_SEED | recency score ≥ 0.85 / audio score ≥ 0.8 to the seed |
| TRENDING "Rising on MUSE this week (+{pct}% plays)" | top-10 momentum with positive velocity |
| LANGUAGE_PICK / REGIONAL_POPULAR | one of the listener's languages / ≥ 3 regional listeners in 30 days |
| NEW_DISCOVERY | unheard artist |
| SESSION_TASTE | private session: the genre is in temporary memory |
| ONBOARDING_PICK | onboarding genre with < 3 plays (cold start) |

Text comes from `reason_types.template` + the stored JSON params (`v_recommendation_explanations`), never from free-form generation.

## 6. MUSE World — `worldService.generate` (WORLD model 1.0)

1. **Evidence** from the permanent profile: mood preferences (blended and recent), the language played most in 30 days, region, last week's archetype, the region's trending moods (7D), month.
2. **Archetype score** for each of the 8 archetypes (each with weighted moods):
   `taste_fit` = weighted average of the listener's affinity (½ blended + ½ recent) for the archetype's moods, + `season_boost` 0.25 if the month is in season, − `novelty_penalty` 0.3 if it was last week's archetype, + a tiny deterministic jitter from SHA-256(user, week, archetype, version).
3. **Title** from the archetype's word lists, indexed by a hash of (user, week, version); never the same as last week's.
4. **Songs**: the engine with strategy WORLD, archetype moods weighted by the listener's affinity, 18 songs.
5. Stored as version *n* in `weekly_worlds` with `theme` (palette, motif, seed for the generative art) and `signals` (all evidence above, plus the top archetype scores) — so the page can say exactly why this world was chosen.

Same inputs in the same week give the same world. Regenerate creates version n+1 and
supersedes the old one; `sp_rollback_world` re-activates the previous version.

## 7. Trends — `sp_generate_trend_snapshot`

For each window (24H, 7D, 30D) and entity type (song, artist, genre, mood, language),
over all listeners and per region: plays in the current window vs the previous
window of the same length (skips excluded), distinct listeners, and

```
velocity_pct  = 100 · (curr − prev) / prev                  (NULL when prev = 0)
momentum      = curr · (1 + clamp((curr − prev)/prev, −1, 3))     (growth 1 when prev = 0)
momentum_rank = RANK() OVER (PARTITION BY entity_type, region ORDER BY momentum DESC, listeners DESC)
```

Momentum rewards both volume and growth, with growth capped so one play rising to
four does not outrank a song played 50 times.

## 8. Listening insights (SQL)

| Insight | Technique |
|---|---|
| Streaks | gaps-and-islands: `DATE_SUB(day, INTERVAL ROW_NUMBER() OVER (ORDER BY day) DAY)` groups consecutive days |
| Daily minutes + 7-day moving average | recursive calendar CTE, `AVG() OVER (ORDER BY day ROWS 6 PRECEDING)` |
| Mood Journey | per play, the song's primary mood; share per day/week/month; transitions with `LAG()` inside a session; first/last mood per session |
| This week vs last week | `v_weekly_mood_summary` with `LAG()` over weeks |
| Peak hour, heatmap | `HOUR()`, `DAYOFWEEK()` aggregation over 60 days |
