/**
 * CommonJS test helper exporting transliterateDevanagariToLatin
 * for Node test execution.
 */
const fs = require('fs');
const path = require('path');

const translitPath = path.join(__dirname, '../src/preserve/transliterate.ts');
let code = fs.readFileSync(translitPath, 'utf8');

// Strip TypeScript export/type declarations for clean CommonJS evaluation
code = code
  .replace(/export\s+const\s+/g, 'const ')
  .replace(/export\s+function\s+/g, 'function ')
  .replace(/:\s*Record<string,\s*string>/g, '')
  .replace(/:\s*boolean/g, '')
  .replace(/:\s*string/g, '')
  .replace(/:\s*RegExpExecArray\s*\|\s*null/g, '');

const fn = new Function(code + '\nreturn { transliterateDevanagariToLatin, COMMON_HINDI_WORDS, isDevanagari };');
module.exports = fn();
