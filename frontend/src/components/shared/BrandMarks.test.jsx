import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GitHubMark } from './BrandMarks';

describe('BrandMarks', () => {
  it('GitHubMark renders an svg icon', () => {
    const { container } = render(<GitHubMark />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
