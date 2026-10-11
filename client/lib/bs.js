import NepaliDate from 'nepali-date-converter';

// Ledger dates are stored as Gregorian YYYY-MM-DD strings. People type and read
// Bikram Sambat (BS). These helpers convert between the two. Dates are built at
// local noon so timezone offsets (Nepal is UTC+5:45) never shift the day.
const pad = (n) => String(n).padStart(2, '0');
const adString = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseAd = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
};

export const BS_MONTHS = ['Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

export function adToBs(ad) {
  const d = parseAd(ad);
  if (!d) return '';
  try {
    const n = new NepaliDate(d);
    return `${n.getYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  } catch {
    return '';
  }
}

// Returns the AD string for a BS "YYYY-MM-DD", or null when it is not a real BS date.
export function bsToAd(bs) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((bs || '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  try {
    const n = new NepaliDate(y, mo - 1, d);
    if (n.getYear() !== y || n.getMonth() !== mo - 1 || n.getDate() !== d) return null;
    const js = n.toJsDate();
    return adString(new Date(js.getFullYear(), js.getMonth(), js.getDate(), 12));
  } catch {
    return null;
  }
}

export const todayBs = () => adToBs(adString(new Date()));

// "2083-06-19" -> "19 Ashwin 2083"
export function longBs(bs) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bs || '');
  return m ? `${Number(m[3])} ${BS_MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}
