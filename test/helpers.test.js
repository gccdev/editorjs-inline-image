import { createImageCredits } from '../src/helpers';

describe('createImageCredits', () => {
  it('shows markup in a media title as text', () => {
    const credits = createImageCredits({ title: '<img src=x onerror="window.pwned=1">' });

    expect(credits.querySelector('img')).toBeNull();
    expect(credits.textContent).toBe('<img src=x onerror="window.pwned=1">');
  });
});
