function getFullYears() {
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  return [currentYear, nextYear];
}

module.exports = getFullYears;