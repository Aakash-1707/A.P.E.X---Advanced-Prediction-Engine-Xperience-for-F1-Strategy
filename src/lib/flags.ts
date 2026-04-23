import { Race } from '../data/mock';

const COUNTRY_FLAGS: Record<string, string> = {
  Australia: 'au',
  China: 'cn',
  Japan: 'jp',
  Bahrain: 'bh',
  'Saudi Arabia': 'sa',
  USA: 'us',
  'United States': 'us',
  Italy: 'it',
  Monaco: 'mc',
  Spain: 'es',
  Canada: 'ca',
  Austria: 'at',
  UK: 'gb',
  'United Kingdom': 'gb',
  Hungary: 'hu',
  Belgium: 'be',
  Netherlands: 'nl',
  Azerbaijan: 'az',
  Singapore: 'sg',
  Mexico: 'mx',
  Brazil: 'br',
  Qatar: 'qa',
  'Abu Dhabi': 'ae',
  UAE: 'ae',
  'United Arab Emirates': 'ae',
};

export function getFlagCode(race: Race): string | null {
  const country = (race.country || '').toLowerCase().trim();
  const name = (race.name || '').toLowerCase().trim();
  const location = (race.location || '').toLowerCase().trim();

  const isAbuDhabi =
    /abu\s*dhabi/.test(name) ||
    /abu\s*dhabi/.test(location) ||
    /yas\s*marina/.test(location) ||
    /u\.?a\.?e/.test(country) ||
    /united arab emirates/.test(country) ||
    /emirates/.test(name);

  if (isAbuDhabi) return 'ae';
  return COUNTRY_FLAGS[race.country] ?? null;
}

export function getFlagUrl(race: Race): string | null {
  const code = getFlagCode(race);
  return code ? `https://flagcdn.com/w320/${code}.png` : null;
}
