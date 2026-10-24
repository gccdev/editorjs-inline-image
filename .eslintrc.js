module.exports = {
  extends: 'airbnb-base',
  plugins: ['jest'],
  rules: {
    'class-methods-use-this': ['off'],
    'no-underscore-dangle': ['error', { allowAfterThis: true }],
    'no-console': ['error', { allow: ['error'] }],
  },
  globals: {
    fetch: false,
    document: false,
    MutationObserver: false,
    FileReader: false,
    FormData: false,
    File: false,
    atob: false,
    Uint8Array: false,
  },
  env: {
    'jest/globals': true,
  },
};
