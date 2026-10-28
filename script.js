'use strict';

/* ==========================================================================
   BMI Calculator logic
   ========================================================================== */

/**
 * Standard BMI categories for adults aged 20 and older.
 * The first category whose upper limit is greater than the BMI wins.
 */
const BMI_CATEGORIES = [
  {
    key: 'underweight',
    label: 'Underweight',
    max: 18.5,
    explanation:
      'Your BMI is below the healthy weight range for adults. Being underweight can have many causes. If this result is unexpected, consider talking with a healthcare professional.'
  },
  {
    key: 'healthy',
    label: 'Healthy weight',
    max: 25,
    explanation:
      'Your BMI falls within the healthy weight range for adults. BMI is one screening indicator, not a complete picture of your health.'
  },
  {
    key: 'overweight',
    label: 'Overweight',
    max: 30,
    explanation:
      'Your BMI is above the healthy weight range for adults. BMI does not measure body fat, muscle, or fitness, so consider discussing any concerns with a healthcare professional.'
  },
  {
    key: 'obesity',
    label: 'Obesity',
    max: Infinity,
    explanation:
      'Your BMI falls in the obesity range for adults. BMI is a screening measure, not a diagnosis. A healthcare professional can help you understand what this result means for you.'
  }
];

/**
 * Validation rules for each number input, keyed by input id.
 * Limits are deliberately generous so they catch typos without
 * rejecting unusual but real measurements.
 */
const FIELD_RULES = {
  'height-cm': {
    min: 50,
    max: 300,
    empty: 'Enter your height in centimeters.',
    invalid: 'Enter your height as a number, for example 170.',
    negative: 'Height cannot be negative.',
    zero: 'Height must be greater than zero.',
    range: 'Enter a height between 50 and 300 cm.'
  },
  'weight-kg': {
    min: 10,
    max: 500,
    empty: 'Enter your weight in kilograms.',
    invalid: 'Enter your weight as a number, for example 70.',
    negative: 'Weight cannot be negative.',
    zero: 'Weight must be greater than zero.',
    range: 'Enter a weight between 10 and 500 kg.'
  },
  'height-ft': {
    min: 1,
    max: 9,
    empty: 'Enter your height in feet.',
    invalid: 'Enter feet as a number, for example 5.',
    negative: 'Feet cannot be negative.',
    zero: 'Feet must be at least 1.',
    range: 'Enter feet between 1 and 9.'
  },
  'height-in': {
    min: 0,
    max: 11.99,
    allowZero: true,
    empty: 'Enter your height in inches. Use 0 if there are no extra inches.',
    invalid: 'Enter inches as a number, for example 8.',
    negative: 'Inches cannot be negative.',
    zero: 'Enter inches between 0 and 11.99.',
    range: 'Enter inches between 0 and 11.99.'
  },
  'weight-lb': {
    min: 20,
    max: 1100,
    empty: 'Enter your weight in pounds.',
    invalid: 'Enter your weight as a number, for example 154.',
    negative: 'Weight cannot be negative.',
    zero: 'Weight must be greater than zero.',
    range: 'Enter a weight between 20 and 1,100 lb.'
  }
};

/* --------------------------------------------------------------------------
   Element references
   -------------------------------------------------------------------------- */

const form = document.getElementById('bmi-form');
const themeToggle = document.getElementById('theme-toggle');
const formStatus = document.getElementById('form-status');
const resultStatus = document.getElementById('result-status');

const resultPanel = document.getElementById('result');
const resultBmi = document.getElementById('result-bmi');
const resultCategory = document.getElementById('result-category');
const resultExplanation = document.getElementById('result-explanation');
const calculateAgainButton = document.getElementById('calculate-again');

const unitRadios = Array.from(document.querySelectorAll('input[name="unit"]'));
const numberInputs = Array.from(form.querySelectorAll('input[type="number"]'));
const scaleSegments = Array.from(document.querySelectorAll('[data-scale-category]'));
const scaleLabels = Array.from(document.querySelectorAll('[data-scale-label]'));

const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

/* --------------------------------------------------------------------------
   Unit switching
   -------------------------------------------------------------------------- */

function getSelectedUnit() {
  return form.querySelector('input[name="unit"]:checked').value;
}

/** Return only the number inputs belonging to the visible unit panel. */
function getActiveFields() {
  return Array.from(
    form.querySelectorAll('[data-unit-panel]:not([hidden]) input[type="number"]')
  );
}

/** Show the chosen unit's panel and disable the hidden one. */
function applyUnit(unit) {
  const panels = Array.from(form.querySelectorAll('[data-unit-panel]'));

  panels.forEach((panel) => {
    const isActive = panel.dataset.unitPanel === unit;
    panel.hidden = !isActive;

    Array.from(panel.querySelectorAll('input')).forEach((input) => {
      input.disabled = !isActive;
      if (!isActive) {
        clearFieldError(input);
      }
    });
  });

  hideResult();
  formStatus.textContent = '';
}

/* --------------------------------------------------------------------------
   Validation
   -------------------------------------------------------------------------- */

/** Read one input and return either { value } or { error }. */
function readMeasurement(input) {
  const rule = FIELD_RULES[input.id];
  const rawValue = input.value.trim();

  if (rawValue === '') {
    return { error: rule.empty };
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    return { error: rule.invalid };
  }

  if (value < 0) {
    return { error: rule.negative };
  }

  if (value === 0 && !rule.allowZero) {
    return { error: rule.zero };
  }

  if (value < rule.min || value > rule.max) {
    return { error: rule.range };
  }

  return { value };
}

function setFieldError(input, message) {
  const errorElement = document.getElementById(`${input.id}-error`);
  if (!errorElement) return;

  errorElement.textContent = message;
  errorElement.hidden = false;
  input.setAttribute('aria-invalid', 'true');
}

function clearFieldError(input) {
  const errorElement = document.getElementById(`${input.id}-error`);
  if (!errorElement) return;

  errorElement.textContent = '';
  errorElement.hidden = true;
  input.removeAttribute('aria-invalid');
}

/** Validate every visible input, collecting errors and valid values. */
function validateActiveFields() {
  const values = {};
  const messages = [];
  let firstInvalid = null;

  getActiveFields().forEach((input) => {
    const outcome = readMeasurement(input);

    if (outcome.error) {
      setFieldError(input, outcome.error);
      messages.push(outcome.error);

      if (!firstInvalid) {
        firstInvalid = input;
      }
    } else {
      clearFieldError(input);
      values[input.id] = outcome.value;
    }
  });

  return {
    valid: firstInvalid === null,
    firstInvalid,
    messages,
    values
  };
}

/* --------------------------------------------------------------------------
   Calculation
   -------------------------------------------------------------------------- */

/**
 * Convert validated values into a BMI number.
 * Metric:    weight (kg) / height (m)²
 * Imperial:  weight (lb) × 703 / height (in)²
 */
function calculateBmi(unit, values) {
  let bmi;

  if (unit === 'metric') {
    const heightMeters = values['height-cm'] / 100;
    bmi = values['weight-kg'] / (heightMeters * heightMeters);
  } else {
    const totalInches = values['height-ft'] * 12 + values['height-in'];
    bmi = (values['weight-lb'] * 703) / (totalInches * totalInches);
  }

  return Number.isFinite(bmi) && bmi > 0 ? bmi : null;
}

/** Find the category for a BMI value (category uses the displayed rounded value). */
function getCategory(bmi) {
  return BMI_CATEGORIES.find((category) => bmi < category.max);
}

function getScrollBehavior() {
  return reduceMotionQuery.matches ? 'auto' : 'smooth';
}

/* --------------------------------------------------------------------------
   Result rendering
   -------------------------------------------------------------------------- */

function showResult(bmi) {
  const roundedBmi = Math.round(bmi * 10) / 10;
  const displayBmi = roundedBmi.toFixed(1);
  const category = getCategory(roundedBmi);

  resultBmi.textContent = displayBmi;
  resultCategory.textContent = category.label;
  resultExplanation.textContent = category.explanation;
  resultPanel.dataset.category = category.key;

  scaleSegments.forEach((segment) => {
    segment.classList.toggle(
      'is-active',
      segment.dataset.scaleCategory === category.key
    );
  });

  scaleLabels.forEach((label) => {
    label.classList.toggle('is-active', label.dataset.scaleLabel === category.key);
  });

  resultPanel.hidden = false;
  resultStatus.textContent = `Your BMI is ${displayBmi}. Category: ${category.label}.`;

  resultPanel.scrollIntoView({ behavior: getScrollBehavior(), block: 'nearest' });
}

function hideResult() {
  resultPanel.hidden = true;
  resultStatus.textContent = '';
}

/* --------------------------------------------------------------------------
   Event handlers
   -------------------------------------------------------------------------- */

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const validation = validateActiveFields();

  if (!validation.valid) {
    hideResult();
    const entryWord = validation.messages.length > 1 ? 'entries' : 'entry';
    formStatus.textContent = `Please check your ${entryWord}. ${validation.messages.join(' ')}`;
    validation.firstInvalid.focus();
    return;
  }

  formStatus.textContent = '';

  const bmi = calculateBmi(getSelectedUnit(), validation.values);

  // A final safety net for unexpected input combinations.
  if (bmi === null) {
    hideResult();
    formStatus.textContent =
      'We could not calculate a BMI from those values. Please review your entries.';
    return;
  }

  showResult(bmi);
});

form.addEventListener('reset', (event) => {
  // Preserve the selected unit but clear every field, error, and result.
  event.preventDefault();

  numberInputs.forEach((input) => {
    input.value = '';
    clearFieldError(input);
  });

  hideResult();
  formStatus.textContent = '';

  const firstField = getActiveFields()[0];
  if (firstField) {
    firstField.focus();
  }
});

unitRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.checked) {
      applyUnit(radio.value);
    }
  });
});

numberInputs.forEach((input) => {
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') {
      clearFieldError(input);
    }
    formStatus.textContent = '';
  });
});

calculateAgainButton.addEventListener('click', () => {
  const firstField = getActiveFields()[0];
  if (!firstField) return;

  firstField.scrollIntoView({ behavior: getScrollBehavior(), block: 'center' });
  firstField.focus({ preventScroll: true });
});

/* --------------------------------------------------------------------------
   Theme
   -------------------------------------------------------------------------- */

function syncThemeLabel() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  themeToggle.setAttribute(
    'aria-label',
    isDark ? 'Switch to light mode' : 'Switch to dark mode'
  );
}

themeToggle.addEventListener('click', () => {
  const nextTheme =
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';

  document.documentElement.dataset.theme = nextTheme;
  syncThemeLabel();

  try {
    localStorage.setItem('bmi-theme', nextTheme);
  } catch (error) {
    // Storage can be unavailable (for example in strict private mode).
  }
});

/* --------------------------------------------------------------------------
   Initialise
   -------------------------------------------------------------------------- */

if (!document.documentElement.dataset.theme) {
  document.documentElement.dataset.theme = 'light';
}

syncThemeLabel();
applyUnit(getSelectedUnit());

const yearElement = document.getElementById('current-year');
if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}
