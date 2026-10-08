import { escapeLike } from './escape-like.js';

describe('escapeLike (BRW-2)', () => {
  it('escapes the LIKE wildcards % and _', () => {
    expect(escapeLike('50%_off')).toBe('50\\%\\_off');
  });

  it('escapes the escape character itself', () => {
    expect(escapeLike('c:\\fotos')).toBe('c:\\\\fotos');
  });

  it('leaves other text untouched', () => {
    expect(escapeLike('Silla de Roble ñ')).toBe('Silla de Roble ñ');
  });
});
