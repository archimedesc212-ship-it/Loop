"""MUSE Query Studio — a small Streamlit interface that runs the Phase 3 queries on MySQL and shows the results.

  pip install -r requirements.txt
  cp .env.example .env      # then fill in your MySQL user and password
  streamlit run streamlit_app.py

Developed by Vaishnav Sai.
"""
import altair as alt
import streamlit as st

import muse_queries as M

st.set_page_config(page_title='MUSE Query Studio', page_icon='🎧', layout='wide')

st.markdown('''<style>
.block-container {padding-top: 2.2rem; max-width: 1250px;}
h1 {letter-spacing: -0.02em;}
.muse-sub {color: #A9A3BF; margin-top: -0.6rem; margin-bottom: 1.2rem;}
.chip {display: inline-block; padding: 2px 10px; margin: 0 6px 6px 0; border-radius: 999px; font-size: 0.78rem;
       background: #2A2540; color: #D9CCFF; border: 1px solid #3D3560;}
.q-question {font-size: 1.05rem; color: #ECE9F5; margin: 0.2rem 0 0.6rem;}
.kpi {background: #1C1A2B; border: 1px solid #2E2A45; border-radius: 12px; padding: 14px 16px;}
.kpi .v {font-size: 1.7rem; font-weight: 700; color: #F2EEFF;}
.kpi .l {font-size: 0.8rem; color: #A9A3BF; text-transform: uppercase; letter-spacing: 0.05em;}
.credit {color: #8D86A6; font-size: 0.8rem; margin-top: 1.5rem;}
</style>''', unsafe_allow_html=True)

ACCENT = '#C89BFF'
QUERIES = M.parse_queries()
BY_ID = {q.id: q for q in QUERIES}


@st.cache_resource
def connection():
    return M.connect()


def run(sql, params=None):
    """Run a read-only query; reconnect once if the cached connection has dropped."""
    try:
        return M.run(sql, params, conn=connection())
    except M.pymysql.err.OperationalError:
        connection.clear()
        return M.run(sql, params, conn=connection())


def chart(df, spec):
    if not spec or df.empty or spec['x'] not in df or spec['y'] not in df:
        return None
    x, y = spec['x'], spec['y']
    if spec['kind'] == 'line':
        c = alt.Chart(df).mark_line(point=True, color=ACCENT).encode(x=alt.X(f'{x}:O', title=x.replace('_', ' '), axis=alt.Axis(labelAngle=0)),
                                                                     y=alt.Y(f'{y}:Q', title=y.replace('_', ' ')), tooltip=list(df.columns))
    else:
        c = alt.Chart(df).mark_bar(color=ACCENT, cornerRadiusEnd=3).encode(
            y=alt.Y(f'{x}:N', sort='-x', title=None, axis=alt.Axis(labelOverlap=False, labelLimit=220)),
            x=alt.X(f'{y}:Q', title=y.replace('_', ' ')), tooltip=list(df.columns))
    return c.properties(height=max(240, 30 * len(df))).configure_view(strokeWidth=0)


def table_height(df):
    """Tall enough to show up to 30 rows without scrolling."""
    return 38 + 35 * min(len(df), 30)


def show_result(df, ms, truncated, spec=None, key='result'):
    st.caption(f'{len(df)} row{"s" if len(df) != 1 else ""} · {ms:.1f} ms' + (' · first 5,000 rows shown' if truncated else ''))
    st.dataframe(df, use_container_width=True, hide_index=True, height=table_height(df))
    c = chart(df, spec)
    if c is not None:
        st.altair_chart(c, use_container_width=True)
    st.download_button('Download CSV', df.to_csv(index=False).encode('utf-8'), file_name=f'muse_{key}.csv', mime='text/csv', key=f'dl_{key}')


# ------------------------------------------------------------------ sidebar
with st.sidebar:
    st.markdown('## 🎧 MUSE')
    st.caption('Music Mood Intelligence & Recommendation Database System')
    cfg = M.settings()
    try:
        ver = run('SELECT VERSION() AS v')[0]['v'].iloc[0]
        tables = run("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'")[0]['n'].iloc[0]
        st.success(f'Connected · MySQL {ver.split("-")[0]}')
        st.caption(f'Database `{cfg["database"]}` · {tables} tables · user `{cfg["user"]}`')
        connected = True
    except Exception as e:  # show the real reason, do not hide it
        st.error(f'Not connected: {e}')
        st.caption('Load database/phase2/schema.sql in MySQL, then set MUSE_DB_* in app/.env (see .env.example).')
        connected = False
    st.divider()
    st.caption(f'{len(QUERIES)} queries loaded from `{M.QUERY_FILE.name}`')
    st.markdown(f'<div class="credit">{M.CREDIT}</div>', unsafe_allow_html=True)

st.title('MUSE Query Studio')
st.markdown('<div class="muse-sub">Run the Phase 3 SQL queries on the MUSE database and see the results as tables and charts.</div>',
            unsafe_allow_html=True)
if not connected:
    st.stop()

tab_dash, tab_lib, tab_mood, tab_sql = st.tabs(['📊 Dashboard', '📚 Query library', '🌈 Mood explorer', '⌨️ SQL playground'])

# ------------------------------------------------------------------ dashboard
with tab_dash:
    k = run(BY_ID['Q03'].sql)[0].iloc[0]
    cols = st.columns(5)
    for col, (label, value) in zip(cols, [('Plays', f'{int(k.total_plays):,}'), ('Listeners', int(k.listeners)),
                                          ('Hours listened', f'{k.hours_listened:,.1f}'), ('Avg completion', f'{k.avg_completion_pct:.1f}%'),
                                          ('Songs played', int(k.distinct_songs))]):
        col.markdown(f'<div class="kpi"><div class="l">{label}</div><div class="v">{value}</div></div>', unsafe_allow_html=True)
    st.caption(f'From Q03 · plays between {k.first_play:%d %b %Y} and {k.last_play:%d %b %Y}')
    a, b = st.columns(2)
    with a:
        st.subheader('When people listen')
        df = run(BY_ID['Q13'].sql)[0]
        st.altair_chart(chart(df, BY_ID['Q13'].chart), use_container_width=True)
        st.caption('Q13 · plays per hour of the day')
    with b:
        st.subheader('Mood map of the catalogue')
        df = run(BY_ID['Q07'].sql)[0]
        st.altair_chart(chart(df, BY_ID['Q07'].chart), use_container_width=True)
        st.caption('Q07 · songs per mood (active mood model)')
    a, b = st.columns(2)
    with a:
        st.subheader('Listening by context')
        df = run(BY_ID['Q11'].sql)[0]
        st.altair_chart(chart(df, BY_ID['Q11'].chart), use_container_width=True)
        st.caption('Q11 · hours per listening context')
    with b:
        st.subheader('Favourite mood of each listener')
        st.dataframe(run(BY_ID['Q16'].sql)[0], use_container_width=True, hide_index=True)
        st.caption('Q16 · window function ROW_NUMBER() per listener')

# ------------------------------------------------------------------ query library
with tab_lib:
    labels = [f'{q.id} · {q.title}' for q in QUERIES]
    pick = st.selectbox('Choose a query', labels, index=0)
    q = QUERIES[labels.index(pick)]
    st.markdown(f'<div class="q-question">{q.question}</div>', unsafe_allow_html=True)
    st.markdown(''.join(f'<span class="chip">{c}</span>' for c in q.concepts), unsafe_allow_html=True)
    st.code(q.sql + ';', language='sql')
    df, ms, tr = run(q.sql)
    show_result(df, ms, tr, q.chart, key=q.id)

# ------------------------------------------------------------------ mood explorer (parameterised query)
with tab_mood:
    moods = run('SELECT name FROM moods ORDER BY name')[0]['name'].tolist()
    c1, c2, c3 = st.columns([1.2, 1, 1])
    mood = c1.selectbox('Mood', moods, index=moods.index('Calm') if 'Calm' in moods else 0)
    min_conf = c2.slider('Minimum confidence', 0.0, 1.0, 0.6, 0.05)
    langs = ['Any'] + run('SELECT name FROM languages ORDER BY name')[0]['name'].tolist()
    lang = c3.selectbox('Language', langs)
    sql = '''SELECT s.title, a.name AS artist, COALESCE(l.name, '—') AS language, sm.confidence,
       f.energy, f.valence, f.tempo_bpm, s.popularity
FROM song_moods sm
INNER JOIN moods m                ON m.mood_id = sm.mood_id
INNER JOIN intelligence_models im ON im.model_id = sm.model_id AND im.is_active = 1
INNER JOIN songs s                ON s.song_id = sm.song_id
INNER JOIN artists a              ON a.artist_id = s.primary_artist_id
INNER JOIN audio_features f       ON f.feature_id = sm.feature_id
LEFT JOIN languages l             ON l.language_id = s.language_id
WHERE m.name = %s AND sm.confidence >= %s AND (%s = 'Any' OR l.name = %s)
ORDER BY sm.confidence DESC, s.popularity DESC'''
    params = (mood, min_conf, lang, lang)
    st.code(sql.replace('%s', '?') + ';', language='sql')
    st.caption(f'Values are sent separately (parameterised query): {params}')
    df, ms, tr = run(sql, params)
    if df.empty:
        st.info('No song is tagged with this mood at this confidence. Lower the slider or choose another language.')
    else:
        show_result(df, ms, tr, key='mood')
        sc = alt.Chart(df).mark_circle(size=110, color=ACCENT, opacity=0.85).encode(
            x=alt.X('energy:Q', scale=alt.Scale(domain=[0, 1])), y=alt.Y('valence:Q', scale=alt.Scale(domain=[0, 1])),
            tooltip=['title', 'artist', 'confidence', 'tempo_bpm']).properties(height=320).configure_view(strokeWidth=0)
        st.markdown('**Where these songs sit: energy × valence (positivity)**')
        st.altair_chart(sc, use_container_width=True)

# ------------------------------------------------------------------ SQL playground
with tab_sql:
    st.markdown('Write your own **SELECT** query. It runs inside a read-only transaction, so nothing can be changed.')
    default = 'SELECT g.name AS genre, COUNT(*) AS songs\nFROM song_genres sg\nJOIN genres g ON g.genre_id = sg.genre_id\nGROUP BY g.name\nORDER BY songs DESC;'
    text = st.text_area('SQL', default, height=180)
    if st.button('Run query', type='primary'):
        try:
            df, ms, tr = run(text)
            show_result(df, ms, tr, key='playground')
        except ValueError as e:
            st.warning(str(e))
        except M.pymysql.MySQLError as e:
            st.error(f'MySQL error {e.args[0]}: {e.args[1] if len(e.args) > 1 else ""}')
