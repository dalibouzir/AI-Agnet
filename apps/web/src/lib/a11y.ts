import { createElement } from 'react';

export function srOnly(text: string) {
  return createElement('span', { className: 'sr-only' }, text);
}
