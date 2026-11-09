// Executes .sql files containing mysql-CLI style DELIMITER directives.
// Sections with the default ';' delimiter are sent as one multi-statement
// batch; sections inside "DELIMITER $$" are split on the custom delimiter.
const fs = require('fs');

function splitSqlFile(text) {
  const chunks = [];
  let delimiter = ';';
  let buf = [];
  const flush = () => {
    const sql = buf.join('\n').trim();
    if (sql) chunks.push(sql);
    buf = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (m) { flush(); delimiter = m[1]; continue; }
    if (delimiter !== ';' && line.trimEnd().endsWith(delimiter)) {
      buf.push(line.trimEnd().slice(0, -delimiter.length));
      flush();
    } else {
      buf.push(line);
    }
  }
  flush();
  return chunks;
}

async function runSqlText(conn, text) {
  const chunks = splitSqlFile(text);
  for (const sql of chunks) await conn.query(sql);
  return chunks.length;
}

const runSqlFile = (conn, file, transform = (s) => s) => runSqlText(conn, transform(fs.readFileSync(file, 'utf8')));

module.exports = { splitSqlFile, runSqlFile, runSqlText };
