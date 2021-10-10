import { formatDistanceStrict } from 'date-fns';
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
};

// https://github.com/date-fns/date-fns/issues/1706#issuecomment-836601089
function formatDistance(
  token: string | number,
  count: any,
  options: { addSuffix?: any; comparison?: any },
) {
  options = options || {};

  const result = formatDistanceLocale[token].replace('{{count}}', count);

  if (options.addSuffix) {
    if (options.comparison > 0) {
      return 'in ' + result;
    } else {
      return result + ' ago';
    }
  }

  return result;
}

export function formatDistanceAbbrev(from: Date, to: Date, options: any) {
  return formatDistanceStrict(from, to, {
    ...options,
    locale: { ...locale, formatDistance },
  });
}
