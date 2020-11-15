/**
 * Helper for making Elements with attributes
 *
 * @param  {string} tagName New Element tag name
 * @param  {Array|string} classNames List or name of CSS class
 * @param  {object} attributes Any attributes
 * @returns {Element}
 */
export const make = (tagName, classNames = null, attributes = {}) => {
  const el = document.createElement(tagName);

  if (Array.isArray(classNames)) {
    el.classList.add(...classNames);
  } else if (classNames) {
    el.classList.add(classNames);
  }

  Object.keys(attributes).forEach((attrName) => {
    el[attrName] = attributes[attrName];
  });

  return el;
};

/**
 * Validates Url
 *
 * @param {string} url Url to validate
 * @returns {boolean} Valid Url
 */
export const isUrl = (url) => {
  const regex = /(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&//=]*)/g;
  return regex.test(url);
};

/**
 * Creates an element with the Unsplash image author information
 *
 * @param {{appName: string, authorName: string, authorProfileLink: string}}
 *  appName - Application name registered on Unsplash
 *  authorName - Image author name
 *  authorProfileLink - Unsplash author profile link object
 *
 * @returns {HTMLDivElement}
 */
export const createImageCredits = ({ title }) => {
  const wrapper = make('div', 'inline-image__image-credits');
  const titleElement = make('div', null, {
    innerHTML: `${title}`,
    style: 'display: inline;',
  });

  wrapper.appendChild(titleElement);
  return wrapper;
};
