import { formatDistanceStrict, isEqual } from 'date-fns';
import locale from 'date-fns/locale/en-US';

const formatDistanceLocale = {
  lessThanXSeconds: '{{count}}s',
  xSeconds: '{{count}}s',
  halfAMinute: '30s',
  lessThanXMinutes: '{{count}}m',
  xMinutes: '{{count}}m',
  aboutXHours: '{{count}}h',
  xHours: '{{count}}h',
  xDays: '{{count}}d',
  aboutXWeeks: '{{count}}w',
  xWeeks: '{{count}}w',
  aboutXMonths: '{{count}}m',
  xMonths: '{{count}}m',
  aboutXYears: '{{count}}y',
  xYears: '{{count}}y',
  overXYears: '{{count}}y',
  almostXYears: '{{count}}y',
} as { [key: string]: string };

// https://github.com/date-fns/date-fns/issues/1706#issuecomment-836601089
export function formatDistance(
  token: string | number,
  count: any,
  options: { addSuffix?: any; comparison?: any } = {},
) {
  const result = formatDistanceLocale[token].replace('{{count}}', count);

  if (options.addSuffix) {
    if (options.comparison > 0) {
      return `in ${result}`;
    }
    return `${result} ago`;
  }

  return result;
}

export function formatDistanceAbbrev(from: Date, to: Date, options?: any) {
  if (isEqual(from, to)) return 'now';

  return formatDistanceStrict(from, to, {
    ...options,
    locale: { ...locale, formatDistance },
  });
}
