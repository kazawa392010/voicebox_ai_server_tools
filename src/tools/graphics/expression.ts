import { AppError } from '../../core/errors.js';

type Node =
  | { kind: 'number'; value: number }
  | { kind: 'variable'; name: 'x' | 'y' }
  | { kind: 'unary'; op: '+' | '-'; child: Node }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: Node; right: Node }
  | { kind: 'function'; name: string; child: Node };

const functions: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt,
  log: Math.log, log10: Math.log10, exp: Math.exp, abs: Math.abs,
  asin: Math.asin, acos: Math.acos, atan: Math.atan
};
type Token = { kind: 'number' | 'identifier' | 'operator' | 'paren'; value: string };

function tokenize(source: string): Token[] {
  if (source.length > 256) throw new AppError('EXPRESSION_TOO_LONG', 'Biểu thức tối đa 256 ký tự.');
  const normalized = source
    .replace(/[−–]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (char) => `^${'⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(char)}`);
  const tokens: Token[] = [];
  const regex = /\s*(?:(\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([a-zA-Z_][a-zA-Z0-9_]*)|([+\-*/^])|([(),]))/gy;
  let pos = 0;
  while (pos < normalized.length) {
    regex.lastIndex = pos;
    const match = regex.exec(normalized);
    if (!match) throw new AppError('EXPRESSION_SYNTAX', `Ký tự không hợp lệ tại vị trí ${pos}.`);
    pos = regex.lastIndex;
    if (match[1]) tokens.push({ kind: 'number', value: match[1] });
    else if (match[2]) tokens.push({ kind: 'identifier', value: match[2].toLowerCase() });
    else if (match[3]) tokens.push({ kind: 'operator', value: match[3] });
    else if (match[4]) tokens.push({ kind: 'paren', value: match[4] });
    if (tokens.length > 160) throw new AppError('EXPRESSION_TOO_COMPLEX', 'Biểu thức có quá nhiều thành phần.');
  }

  // Support common mathematical notation such as 2x, 2(x+1), and (x+1)(x-1).
  const output: Token[] = [];
  const isValueEnd = (token: Token): boolean => token.kind === 'number'
    || (token.kind === 'paren' && token.value === ')')
    || (token.kind === 'identifier' && ['x', 'y', 'pi', 'e'].includes(token.value));
  const isValueStart = (token: Token): boolean => token.kind === 'number'
    || token.kind === 'identifier'
    || (token.kind === 'paren' && token.value === '(');
  for (const token of tokens) {
    const previous = output[output.length - 1];
    if (previous && isValueEnd(previous) && isValueStart(token)) output.push({ kind: 'operator', value: '*' });
    output.push(token);
  }
  return output;
}

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}
  parse(): Node {
    const node = this.addSub();
    if (this.index !== this.tokens.length) throw new AppError('EXPRESSION_SYNTAX', 'Biểu thức còn ký hiệu thừa.');
    return node;
  }
  private peek(value?: string): boolean {
    const token = this.tokens[this.index];
    return Boolean(token && (value === undefined || token.value === value));
  }
  private take(): Token {
    const token = this.tokens[this.index++];
    if (!token) throw new AppError('EXPRESSION_SYNTAX', 'Biểu thức chưa hoàn chỉnh.');
    return token;
  }
  private addSub(): Node {
    let node = this.mulDiv();
    while (this.peek('+') || this.peek('-')) {
      const op = this.take().value as '+' | '-';
      node = { kind: 'binary', op, left: node, right: this.mulDiv() };
    }
    return node;
  }
  private mulDiv(): Node {
    let node = this.unary();
    while (this.peek('*') || this.peek('/')) {
      const op = this.take().value as '*' | '/';
      node = { kind: 'binary', op, left: node, right: this.unary() };
    }
    return node;
  }
  private unary(): Node {
    if (this.peek('+') || this.peek('-')) {
      const op = this.take().value as '+' | '-';
      return { kind: 'unary', op, child: this.unary() };
    }
    return this.power();
  }
  // Exponentiation binds more tightly than a leading sign and is right-associative.
  private power(): Node {
    const left = this.primary();
    if (this.peek('^')) {
      this.take();
      return { kind: 'binary', op: '^', left, right: this.unary() };
    }
    return left;
  }
  private primary(): Node {
    const token = this.take();
    if (token.kind === 'number') {
      const value = Number(token.value);
      if (!Number.isFinite(value)) throw new AppError('EXPRESSION_NUMBER', 'Hằng số không hợp lệ.');
      return { kind: 'number', value };
    }
    if (token.kind === 'paren' && token.value === '(') {
      const value = this.addSub();
      if (!this.peek(')')) throw new AppError('EXPRESSION_SYNTAX', 'Thiếu dấu đóng ngoặc.');
      this.take();
      return value;
    }
    if (token.kind === 'identifier') {
      if (token.value === 'x' || token.value === 'y') return { kind: 'variable', name: token.value };
      if (token.value === 'pi') return { kind: 'number', value: Math.PI };
      if (token.value === 'e') return { kind: 'number', value: Math.E };
      if (!Object.hasOwn(functions, token.value)) throw new AppError('EXPRESSION_FUNCTION', `Không hỗ trợ hàm ${token.value}.`);
      if (!this.peek('(')) throw new AppError('EXPRESSION_SYNTAX', `Hàm ${token.value} cần dấu ngoặc.`);
      this.take();
      const child = this.addSub();
      if (!this.peek(')')) throw new AppError('EXPRESSION_SYNTAX', 'Thiếu dấu đóng ngoặc hàm.');
      this.take();
      return { kind: 'function', name: token.value, child };
    }
    throw new AppError('EXPRESSION_SYNTAX', 'Thiếu toán hạng trong biểu thức.');
  }
}

function evaluate(node: Node, x: number, y: number): number {
  switch (node.kind) {
    case 'number': return node.value;
    case 'variable': return node.name === 'x' ? x : y;
    case 'unary': return node.op === '-' ? -evaluate(node.child, x, y) : evaluate(node.child, x, y);
    case 'function': return functions[node.name]!(evaluate(node.child, x, y));
    case 'binary': {
      const a = evaluate(node.left, x, y), b = evaluate(node.right, x, y);
      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? Number.NaN : a / b;
        case '^': return Math.pow(a, b);
      }
    }
  }
}

export function compileExpression(expression: string): (x: number, y?: number) => number {
  const source = expression.trim().replace(/^[zy]\s*=\s*/i, '');
  const tree = new Parser(tokenize(source)).parse();
  return (x, y = 0) => evaluate(tree, x, y);
}
