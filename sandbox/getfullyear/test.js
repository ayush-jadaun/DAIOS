const getFullYears = require('./index');

test('returns an array with the current and next year', () => {
  const currentYear = new Date().getFullYear();
  expect(getFullYears()).toEqual([currentYear, currentYear + 1]);
});