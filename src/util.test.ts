import { formatDistanceAbbrev } from './util';

describe('formatDistanceAbbrev', () => {
  it('returns "now" when distance is zero', () => {
    const now = new Date();
    const result = formatDistanceAbbrev(now, now);
    expect(result).toEqual('now');
  });
});
