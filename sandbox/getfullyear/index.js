// Function to get the full years for the current and next year
const getFullYears = () => {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear + 1];
};

module.exports = getFullYears;