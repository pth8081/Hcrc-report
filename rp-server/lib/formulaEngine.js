// lib/formulaEngine.js — Bộ đánh giá công thức AN TOÀN cho cột tính toán
// trong app.ReportCatalog.DefinitionJson.columns (vd { "key": "tyLeLoiNhuan",
// "label": "Tỷ lệ lợi nhuận", "formula": "measures.loiNhuan / measures.doanhThu" }).
// KHÔNG dùng eval()/Function() chạy thẳng chuỗi công thức — tự viết tokenizer +
// parser + evaluator giới hạn đúng ngữ pháp bên dưới, nên công thức KHÔNG THỂ
// trở thành đường thực thi mã tuỳ ý, kể cả nếu DefinitionJson sau này bị sửa
// từ nguồn không đáng tin.
//
// Bản sao CÙNG NỘI DUNG cũng có ở api-server/lib/formulaEngine.js — cố ý
// trùng lặp, cùng lý do với reportEngine.js (xem tài liệu kiến trúc, mục 08).
//
// Ngữ pháp (ưu tiên thấp -> cao):
//   expr    := logic
//   logic   := compare (('&&' | '||') compare)*
//   compare := add (('>'|'<'|'>='|'<='|'=='|'!=') add)?
//   add     := mul (('+'|'-') mul)*
//   mul     := unary (('*'|'/') unary)*
//   unary   := '-' unary | '!' unary | primary
//   primary := NUMBER | STRING | IDENT ('.' IDENT)* | call | '(' expr ')'
//   call    := IDENT '(' (expr (',' expr)*)? ')'
//
// Định danh (IDENT hoặc IDENT.IDENT) được tra qua resolveField(path) do nơi
// gọi truyền vào — CÙNG cách đọc field với reportEngine.js: 'measures.xxx',
// 'entityCode'/'eventDate'/'sourceSystem', còn lại coi là khoá trong Dimensions.
// Hàm hỗ trợ: ROUND(x, n=0), ABS(x), MIN(...), MAX(...), IF(cond, a, b).

const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER_RE = /\d+(\.\d+)?/y;
const TWO_CHAR_OPS = ['>=', '<=', '==', '!=', '&&', '||'];

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let value = '';
      while (j < src.length && src[j] !== quote) { value += src[j]; j++; }
      if (src[j] !== quote) throw new Error(`Công thức thiếu dấu đóng chuỗi: "${src}"`);
      tokens.push({ type: 'string', value });
      i = j + 1;
      continue;
    }

    NUMBER_RE.lastIndex = i;
    const num = NUMBER_RE.exec(src);
    if (num && num.index === i) {
      tokens.push({ type: 'number', value: parseFloat(num[0]) });
      i += num[0].length;
      continue;
    }

    IDENT_RE.lastIndex = i;
    const ident = IDENT_RE.exec(src);
    if (ident && ident.index === i) {
      tokens.push({ type: 'ident', value: ident[0] });
      i += ident[0].length;
      continue;
    }

    const two = src.slice(i, i + 2);
    if (TWO_CHAR_OPS.includes(two)) {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }

    if ('+-*/(),.<>!'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    throw new Error(`Ký tự không hợp lệ trong công thức: "${ch}" (trong "${src}")`);
  }
  tokens.push({ type: 'eof' });
  return tokens;
}

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  function expect(type, value) {
    const t = peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`Công thức sai cú pháp — cần "${value ?? type}", gặp "${t.value ?? t.type}"`);
    }
    return next();
  }

  function parseExpr() {
    let node = parseCompare();
    while (peek().type === 'op' && ['&&', '||'].includes(peek().value)) {
      const op = next().value;
      node = { type: 'logic', op, left: node, right: parseCompare() };
    }
    return node;
  }
  function parseCompare() {
    let node = parseAdd();
    if (peek().type === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes(peek().value)) {
      const op = next().value;
      node = { type: 'compare', op, left: node, right: parseAdd() };
    }
    return node;
  }
  function parseAdd() {
    let node = parseMul();
    while (peek().type === 'op' && ['+', '-'].includes(peek().value)) {
      const op = next().value;
      node = { type: 'binary', op, left: node, right: parseMul() };
    }
    return node;
  }
  function parseMul() {
    let node = parseUnary();
    while (peek().type === 'op' && ['*', '/'].includes(peek().value)) {
      const op = next().value;
      node = { type: 'binary', op, left: node, right: parseUnary() };
    }
    return node;
  }
  function parseUnary() {
    if (peek().type === 'op' && (peek().value === '-' || peek().value === '!')) {
      const op = next().value;
      return { type: 'unary', op, arg: parseUnary() };
    }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = peek();
    if (t.type === 'number') { next(); return { type: 'number', value: t.value }; }
    if (t.type === 'string') { next(); return { type: 'string', value: t.value }; }
    if (t.type === 'op' && t.value === '(') {
      next();
      const node = parseExpr();
      expect('op', ')');
      return node;
    }
    if (t.type === 'ident') {
      next();
      const path = [t.value];
      while (peek().type === 'op' && peek().value === '.') {
        next();
        path.push(expect('ident').value);
      }
      if (peek().type === 'op' && peek().value === '(') {
        next();
        const args = [];
        if (!(peek().type === 'op' && peek().value === ')')) {
          args.push(parseExpr());
          while (peek().type === 'op' && peek().value === ',') { next(); args.push(parseExpr()); }
        }
        expect('op', ')');
        if (path.length !== 1) throw new Error(`Tên hàm không hợp lệ: "${path.join('.')}"`);
        return { type: 'call', name: path[0], args };
      }
      return { type: 'field', path };
    }
    throw new Error(`Công thức sai cú pháp gần "${t.value ?? t.type}"`);
  }

  const node = parseExpr();
  expect('eof');
  return node;
}

const FUNCTIONS = {
  ROUND: (x, n = 0) => { const f = Math.pow(10, n); return Math.round(x * f) / f; },
  ABS: (x) => Math.abs(x),
  MIN: (...xs) => Math.min(...xs),
  MAX: (...xs) => Math.max(...xs),
  IF: (cond, a, b) => (cond ? a : b)
};

function evalNode(node, resolveField) {
  switch (node.type) {
    case 'number': return node.value;
    case 'string': return node.value;
    case 'field': return resolveField(node.path);
    case 'unary': {
      const v = evalNode(node.arg, resolveField);
      return node.op === '-' ? -v : !v;
    }
    case 'binary': {
      const l = evalNode(node.left, resolveField);
      const r = evalNode(node.right, resolveField);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return r === 0 || r === null || r === undefined ? null : l / r;
      }
      break;
    }
    case 'compare': {
      const l = evalNode(node.left, resolveField);
      const r = evalNode(node.right, resolveField);
      switch (node.op) {
        case '>': return l > r;
        case '<': return l < r;
        case '>=': return l >= r;
        case '<=': return l <= r;
        case '==': return l === r;
        case '!=': return l !== r;
      }
      break;
    }
    case 'logic': {
      const l = evalNode(node.left, resolveField);
      if (node.op === '&&') return l && evalNode(node.right, resolveField);
      return l || evalNode(node.right, resolveField);
    }
    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new Error(`Hàm không được hỗ trợ trong công thức: "${node.name}"`);
      return fn(...node.args.map(a => evalNode(a, resolveField)));
    }
    default:
      throw new Error(`Node công thức không hợp lệ: ${node.type}`);
  }
}

// Cache AST theo chuỗi công thức — cùng 1 công thức được parse lại rất nhiều
// lần (mỗi dòng dữ liệu trong 1 lượt chạy báo cáo), không cần parse lại mỗi lần.
// Chặn TRÊN kích thước (LRU, Map giữ đúng thứ tự chèn nên không cần thư viện
// ngoài) — công thức do admin định nghĩa trong DefinitionJson nên số lượng
// thực tế nhỏ, nhưng tiến trình chạy dài ngày qua nhiều lượt sửa báo cáo vẫn
// không nên để Map phình vô hạn không giới hạn.
const AST_CACHE_MAX = 500;
const astCache = new Map();
function parseFormula(formula) {
  if (astCache.has(formula)) {
    const ast = astCache.get(formula);
    astCache.delete(formula);
    astCache.set(formula, ast); // đưa lên "gần dùng nhất" — xoá theo LRU khi đầy
    return ast;
  }
  const ast = parse(tokenize(formula));
  if (astCache.size >= AST_CACHE_MAX) {
    astCache.delete(astCache.keys().next().value); // xoá mục cũ nhất (ít dùng nhất)
  }
  astCache.set(formula, ast);
  return ast;
}

// resolveField(path: string[]) => giá trị field — nơi gọi (reportEngine.js)
// truyền vào cách đọc field từ 1 dòng dữ liệu cụ thể.
function evaluateFormula(formula, resolveField) {
  return evalNode(parseFormula(formula), resolveField);
}

module.exports = { evaluateFormula, parseFormula };
