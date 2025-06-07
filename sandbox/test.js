const getFullYears = require('./index');

describe('getFullYears', () => {
  it('should return an array containing the current year and the next year as numbers', () => {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const expected = [currentYear, nextYear];
    expect(getFullYears()).toEqual(expected);
  });
});