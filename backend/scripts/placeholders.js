// Safe substitution of the placeholders used in database/*.sql and database/migrations/*.sql:
//   __DB__, __APP_USER__, __APP_HOST__ (identifiers, pasted into SQL text) and __APP_PASSWORD__ (a string literal).
// Identifiers cannot be bound as parameters, so they are validated against strict patterns before they are pasted;
// anything else (a quote, a backtick, a space, a semicolon) is refused instead of being written into a GRANT.
// After substitution no __NAME__ placeholder may remain, so a typo cannot reach MySQL silently.
// Developed by Vaishnav Sai.
const PATTERNS = {
  database: /^[A-Za-z0-9_]{1,64}$/,          // MySQL schema name, unquoted-safe
  appUser: /^[A-Za-z0-9_.-]{1,32}$/,          // MySQL account name (max 32 chars)
  appHost: /^[A-Za-z0-9_.%:-]{1,255}$/,       // host name, IP, or MySQL wildcard (%)
};

function check(name, value) {
  if (typeof value !== 'string' || !PATTERNS[name].test(value)) {
    throw new Error(`Refusing to substitute ${name}=${JSON.stringify(value)}: it must match ${PATTERNS[name]}`);
  }
  return value;
}

/**
 * @param {{database:string, appUser:string, appHost:string, appPassword?:string}} db
 * @param {(v:string)=>string} escape  driver escape function for the password literal (e.g. conn.escape)
 * @returns {(sql:string)=>string}
 */
function makeTransform(db, escape) {
  const database = check('database', db.database);
  const appUser = check('appUser', db.appUser);
  const appHost = check('appHost', db.appHost);
  const appPw = typeof db.appPassword === 'string' && escape ? escape(db.appPassword).slice(1, -1) : null;
  return (sql) => {
    let out = sql.replace(/__DB__/g, database).replace(/__APP_USER__/g, appUser).replace(/__APP_HOST__/g, appHost);
    if (out.includes('__APP_PASSWORD__')) {
      if (appPw === null) throw new Error('__APP_PASSWORD__ is used but no application password is configured');
      out = out.replace(/__APP_PASSWORD__/g, () => appPw);   // function form: "$&" etc. in a password stay literal
    }
    const left = out.match(/__[A-Z][A-Z_]*__/);
    if (left) throw new Error(`Unknown placeholder ${left[0]} in SQL text`);
    return out;
  };
}

module.exports = { makeTransform, PATTERNS };
