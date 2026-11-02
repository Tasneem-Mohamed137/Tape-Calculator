'use strict';

/* =========================================================
   1. DOM — select the nodes once
   ========================================================= */
const screenEl = document.querySelector('.screen');
const valueEl  = document.getElementById('value');
const exprEl   = document.getElementById('expr');
const keysEl   = document.getElementById('keys');
const tapeEl   = document.getElementById('tape');
const tearBtn  = document.getElementById('tear');

/* =========================================================
   2. State
   ========================================================= */
const state = {
  current: '0',    // number being typed (string, so "0." and "1.50" survive)
  previous: null,  // left-hand number waiting for an operator
  operator: null,  // '+', '−', '×', '÷'
  fresh: false,    // true → next digit replaces the display instead of appending
  error: false,
};

const MAX_DIGITS = 12;

const operations = {
  '+': (a, b) => a + b,
  '−': (a, b) => a - b,
  '×': (a, b) => a * b,
  '÷': (a, b) => a / b,
};

/* =========================================================
   3. Logic — small pure-ish functions
   ========================================================= */
// Trim floating-point noise: 0.1 + 0.2 → "0.3"
const format = (n) => String(parseFloat(n.toPrecision(MAX_DIGITS)));

function reset() {
  Object.assign(state, { current: '0', previous: null, operator: null, fresh: false, error: false });
}

function inputDigit(d) {
  if (state.error) reset();
  if (state.fresh) { state.current = d; state.fresh = false; }
  else if (state.current.replace(/[-.]/g, '').length < MAX_DIGITS) {
    state.current = state.current === '0' ? d : state.current + d;
  }
}

function inputDot() {
  if (state.error) reset();
  if (state.fresh) { state.current = '0.'; state.fresh = false; return; }
  if (!state.current.includes('.')) state.current += '.';
}

function calculate(a, op, b) {
  if (op === '÷' && b === 0) return null;          // can't divide by zero
  return operations[op](a, b);
}

function setError() {
  Object.assign(state, { current: 'Cannot divide by 0', previous: null, operator: null, error: true, fresh: true });
}

function chooseOperator(op) {
  if (state.error) return;
  // Chain: 2 + 3 × … → resolve 2 + 3 first
  if (state.operator && !state.fresh) {
    const result = calculate(parseFloat(state.previous), state.operator, parseFloat(state.current));
    if (result === null) return setError();
    state.current = format(result);
  }
  state.previous = state.current;
  state.operator = op;
  state.fresh = true;
}

function equals() {
  if (state.error || !state.operator) return;
  const a = parseFloat(state.previous);
  const b = parseFloat(state.current);
  const result = calculate(a, state.operator, b);
  if (result === null) return setError();

  const answer = format(result);
  printTape(`${state.previous} ${state.operator} ${state.current}`, answer);
  Object.assign(state, { current: answer, previous: null, operator: null, fresh: true });
}

function deleteLast() {
  if (state.error) return reset();
  if (state.fresh) return;
  state.current = state.current.length > 1 && !(state.current.length === 2 && state.current[0] === '-')
    ? state.current.slice(0, -1)
    : '0';
}

function negate() {
  if (state.error || state.current === '0') return;
  state.current = state.current.startsWith('-') ? state.current.slice(1) : '-' + state.current;
}

function percent() {
  if (state.error) return;
  state.current = format(parseFloat(state.current) / 100);
  state.fresh = true;
}

/* Map every action name to its function — keeps the event code tiny */
const actions = {
  clear:   reset,
  delete:  deleteLast,
  negate,
  percent,
  dot:     inputDot,
  equals,
};

/* =========================================================
   4. Render — one function paints the whole UI from state
   ========================================================= */
function render() {
  valueEl.textContent = state.current;
  exprEl.textContent  = state.operator ? `${state.previous} ${state.operator}` : '';
  screenEl.classList.toggle('is-error', state.error);

  // light the operator key that is waiting for a second number
  keysEl.querySelectorAll('[data-op]').forEach((btn) =>
    btn.classList.toggle('is-armed', state.fresh && btn.dataset.op === state.operator)
  );
}

function printTape(expression, answer) {
  tapeEl.querySelector('.tape__empty')?.remove();
  const li = document.createElement('li');
  li.className = 'is-new';
  li.dataset.answer = answer;
  li.innerHTML = `${expression} =<b></b>`;
  li.querySelector('b').textContent = answer;     // textContent → no HTML injection
  tapeEl.append(li);                              // CSS column-reverse shows newest first
}

function clearTape() {
  tapeEl.innerHTML = '<li class="tape__empty">Finished sums print here.</li>';
}

/* =========================================================
   5. Events — listen, then hand off to the logic above
   ========================================================= */
// One listener for every button (event delegation)
keysEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  if (btn.dataset.num !== undefined)      inputDigit(btn.dataset.num);
  else if (btn.dataset.op)                chooseOperator(btn.dataset.op);
  else                                    actions[btn.dataset.action]?.();

  render();
});

// Reuse an answer by clicking a line on the tape
tapeEl.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-answer]');
  if (!li) return;
  Object.assign(state, { current: li.dataset.answer, error: false, fresh: true });
  render();
});

tearBtn.addEventListener('click', clearTape);

// Keyboard support — find the matching on-screen key so it animates too
const keyMap = { '*': '×', '/': '÷', '-': '−', '+': '+' };

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  let selector = null;

  if (/^\d$/.test(k))                          selector = `[data-num="${k}"]`;
  else if (keyMap[k])                          selector = `[data-op="${keyMap[k]}"]`;
  else if (k === '.' || k === ',')             selector = '[data-action="dot"]';
  else if (k === 'Enter' || k === '=')         selector = '[data-action="equals"]';
  else if (k === 'Backspace')                  selector = '[data-action="delete"]';
  else if (k === 'Escape' || k === 'Delete')   selector = '[data-action="clear"]';
  else if (k === '%')                          selector = '[data-action="percent"]';

  const btn = selector && keysEl.querySelector(selector);
  if (!btn) return;

  e.preventDefault();                           // stop Enter from re-clicking a focused button
  btn.click();
  btn.classList.add('is-down');
  setTimeout(() => btn.classList.remove('is-down'), 110);
});

render();