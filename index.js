console.log("test out");

function InputStream(input) {
  let pos = 0,
    line = 1,
    col = 0;
  return {
    next: next,
    peek: peek,
    eof: eof,
    croak: croak,
  };
  function next() {
    let ch = input.charAt(pos++);
    if (ch === "\n") line++, (col = 0);
    else col++;
    return ch;
  }
  function peek() {
    return input.charAt(pos);
  }
  function eof() {
    return peek() === "";
  }
  function croak(msg) {
    throw new Error(msg + " (" + line + ":" + col + ")");
  }
}

//----------------------------------------------------------
function TokenStream(input) {
  let current = null;
  let keywords = " if then else lambda λ true false ";
  return {
    next: next,
    peek: peek,
    eof: eof,
    croak: input.croak,
  };
  function is_keyword(x) {
    return keywords.indexOf(" " + x + " ") >= 0;
  }
  function is_digit(ch) {
    return /[0-9]/i.test(ch);
  }
  function is_id_start(ch) {
    return /[a-zλ_]/i.test(ch);
  }
  function is_id(ch) {
    return is_id_start(ch) || "?!-<>=0123456789".indexOf(ch) >= 0;
  }
  function is_op_char(ch) {
    return "+-*/%=&|<>!".indexOf(ch) >= 0;
  }
  function is_punc(ch) {
    return ",;(){}[]".indexOf(ch) >= 0;
  }
  function is_whitespace(ch) {
    return " \t\n".indexOf(ch) >= 0;
  }
  function read_while(predicate) {
    let str = "";
    while (!input.eof() && predicate(input.peek())) str += input.next();
    return str;
  }
  function read_number() {
    let has_dot = false;
    let number = read_while(function (ch) {
      if (ch === ".") {
        if (has_dot) return false;
        has_dot = true;
        return true;
      }
      return is_digit(ch);
    });
    return { type: "num", value: parseFloat(number) };
  }
  function read_ident() {
    let id = read_while(is_id);
    return {
      type: is_keyword(id) ? "kw" : "let",
      value: id,
    };
  }
  function read_escaped(end) {
    let escaped = false,
      str = "";
    input.next();
    while (!input.eof()) {
      let ch = input.next();
      if (escaped) {
        str += ch;
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === end) {
        break;
      } else {
        str += ch;
      }
    }
    return str;
  }
  function read_string() {
    return { type: "str", value: read_escaped('"') };
  }
  function skip_comment() {
    read_while(function (ch) {
      return ch !== "\n";
    });
    input.next();
  }
  function read_next() {
    read_while(is_whitespace);
    if (input.eof()) return null;
    let ch = input.peek();
    if (ch === "#") {
      skip_comment();
      return read_next();
    }
    if (ch === '"') return read_string();
    if (is_digit(ch)) return read_number();
    if (is_id_start(ch)) return read_ident();
    if (is_punc(ch))
      return {
        type: "punc",
        value: input.next(),
      };
    if (is_op_char(ch))
      return {
        type: "op",
        value: read_while(is_op_char),
      };
    input.croak("Can't handle character: " + ch);
  }
  function peek() {
    return current || (current = read_next());
  }
  function next() {
    let tok = current;
    current = null;
    return tok || read_next();
  }
  function eof() {
    return peek() === null;
  }
}

//----------------------------------------------------------\
const FALSE = { type: "bool", value: false };
function Parse(input) {
  let PRECEDENCE = {
    "=": 1,
    "||": 2,
    "&&": 3,
    "<": 7,
    ">": 7,
    "<=": 7,
    ">=": 7,
    "===": 7,
    "!==": 7,
    "+": 10,
    "-": 10,
    "*": 20,
    "/": 20,
    "%": 20,
  };
  return parse_toplevel();
  function is_punc(ch) {
    let tok = input.peek();
    return tok && tok.type === "punc" && (!ch || tok.value === ch) && tok;
  }
  function is_kw(kw) {
    let tok = input.peek();
    return tok && tok.type === "kw" && (!kw || tok.value === kw) && tok;
  }
  function is_op(op) {
    let tok = input.peek();
    return tok && tok.type === "op" && (!op || tok.value === op) && tok;
  }
  function skip_punc(ch) {
    if (is_punc(ch)) input.next();
    else input.croak('Expecting punctuation: "' + ch + '"');
  }
  function skip_kw(kw) {
    if (is_kw(kw)) input.next();
    else input.croak('Expecting keyword: "' + kw + '"');
  }
  function skip_op(op) {
    if (is_op(op)) input.next();
    else input.croak('Expecting operator: "' + op + '"');
  }
  function unexpected() {
    input.croak("Unexpected token: " + JSON.stringify(input.peek()));
  }

  function delimited(start, stop, separator, parser) {
    let a = [],
      first = true;
    skip_punc(start);
    while (!input.eof()) {
      if (is_punc(stop)) break;
      if (first) first = false;
      else skip_punc(separator);
      if (is_punc(stop)) break;
      a.push(parser());
    }
    skip_punc(stop);
    return a;
  }
  function parse_letname() {
    let name = input.next();
    if (name.type !== "let") input.croak("Expecting letiable name");
    return name.value;
  }
  function parse_if() {
    skip_kw("if");
    let cond = parse_expression();
    if (!is_punc("{")) skip_kw("then");
    let then = parse_expression();
    let ret = {
      type: "if",
      cond: cond,
      then: then,
    };
    if (is_kw("else")) {
      input.next();
      ret.else = parse_expression();
    }
    return ret;
  }
  function parse_lambda() {
    return {
      type: "lambda",
      lets: delimited("(", ")", ",", parse_letname),
      body: parse_expression(),
    };
  }
  function parse_bool() {
    return {
      type: "bool",
      value: input.next().value === "true",
    };
  }

  function parse_expression() {
    return maybe_call(function () {
      return maybe_binary(parse_atom(), 0);
    });
  }
  function maybe_call(expr) {
    //распознает начало парсинга после открывающей скобки или парсинг из функции expr
    expr = expr();
    return is_punc("(") ? parse_call(expr) : expr;
  }
  function parse_call(func) {
    return {
      type: "call",
      func: func,
      args: delimited("(", ")", ",", parse_expression),
    };
  }
  function parse_atom() {
    //распознается начало выражения (, или начало блока {, или if, или true-false, или lambda, или если не все перечисленное тогда let , или num, или str
    return maybe_call(function () {
      if (is_punc("(")) {
        input.next();
        let exp = parse_expression();
        skip_punc(")");
        return exp;
      }
      if (is_punc("{")) return parse_prog();
      if (is_kw("if")) return parse_if();
      if (is_kw("true") || is_kw("false")) return parse_bool();
      if (is_kw("lambda") || is_kw("λ")) {
        input.next();
        return parse_lambda();
      }
      let tok = input.next();
      if (tok.type === "let" || tok.type === "num" || tok.type === "str")
        return tok;
      unexpected();
    });
  }
  function maybe_binary(left, my_prec) {
    //рспознается бинарное выражение
    //сюда в left передается parse_atom()
    let tok = is_op();
    if (tok) {
      let his_prec = PRECEDENCE[tok.value];
      if (his_prec > my_prec) {
        input.next();
        return maybe_binary(
          //вот этотовотвсе в {} будет left
          {
            type: tok.value === "=" ? "assign" : "binary",
            operator: tok.value,
            left: left,
            right: maybe_binary(parse_atom(), his_prec),
          },
          my_prec
        );
      }
    }
    return left;
  }
  function parse_toplevel() {
    let prog = [];
    while (!input.eof()) {
      prog.push(parse_expression());
      if (!input.eof()) skip_punc(";");
    }
    return { type: "prog", prog: prog };
  }
  function parse_prog() {
    let prog = delimited("{", "}", ";", parse_expression);
    if (prog.length === 0) return FALSE;
    if (prog.length === 1) return prog[0];
    return { type: "prog", prog: prog };
  }
}

const code = "A = operation(n - 1) + C*(n - 2)";
console.clear();
console.log(code);
const inputStream = InputStream(code);
const tokenStream = TokenStream(inputStream);
const parse = Parse(tokenStream);

console.log(parse);
