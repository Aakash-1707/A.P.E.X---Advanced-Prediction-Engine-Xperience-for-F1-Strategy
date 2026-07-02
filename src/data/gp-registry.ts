/**
 * Canonical 2026 GP name registry — mirrors ml_pipeline/gp_registry.py + gp_registry.json
 */
import registry from '../../gp_registry.json';
import type { Race } from './mock';

export interface GpRegistryEntry {
  id: string;
  predictor_name: string;
  openf1_names: string[];
  aliases?: string[];
  fastf1_historical_names?: string[];
  fastf1_2026_names?: string[];
  country: string;
  circuit?: string;
}

const ENTRIES = registry.grand_prix as GpRegistryEntry[];

function norm(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function getOrderedPredictorNames(): string[] {
  return ENTRIES.map((gp) => gp.predictor_name);
}

export function resolvePredictorName(name: string): string | null {
  if (!name?.trim()) return null;
  const raw = name.trim();
  const n = norm(raw);

  for (const gp of ENTRIES) {
    const candidates = [gp.predictor_name, ...gp.openf1_names, ...(gp.aliases ?? [])];
    for (const candidate of candidates) {
      if (norm(candidate) === n) return gp.predictor_name;
    }
  }

  for (const gp of ENTRIES) {
    const candidates = [gp.predictor_name, ...gp.openf1_names, ...(gp.aliases ?? [])];
    for (const candidate of candidates) {
      const c = norm(candidate);
      if (n.includes(c) || c.includes(n)) return gp.predictor_name;
    }
  }

  return null;
}

export function resolveOpenF1MeetingName(meetingName: string, country?: string): string | null {
  if (!meetingName) return null;

  const n = norm(meetingName);
  const matches = ENTRIES.filter((gp) =>
    [gp.predictor_name, ...gp.openf1_names].some((c) => norm(c) === n),
  );

  if (matches.length === 1) return matches[0].predictor_name;

  if (country?.toLowerCase() === 'spain') {
    const lower = meetingName.toLowerCase();
    if (lower.includes('barcelona') || lower.includes('catalunya')) {
      return 'Barcelona Grand Prix';
    }
    if (lower.includes('spanish') || lower.includes('madrid') || lower.includes('madring')) {
      return 'Spanish Grand Prix';
    }
  }

  if (matches.length) return matches[0].predictor_name;
  return resolvePredictorName(meetingName);
}

/** Map an OpenF1 Race row → canonical predictor GP name for Supabase lookups. */
export function resolvePredictorGpName(race: Race): string {
  const fromMeeting = resolveOpenF1MeetingName(race.name, race.country);
  if (fromMeeting) return fromMeeting;

  if (race.name.toLowerCase().endsWith('grand prix')) {
    const hit = resolvePredictorName(race.name);
    if (hit) return hit;
    return race.name;
  }

  const fromCountry = ENTRIES.find((gp) => gp.country === race.country);
  return fromCountry?.predictor_name ?? race.name;
}

export function gpCountry(predictorName: string): string | undefined {
  return ENTRIES.find((gp) => gp.predictor_name === predictorName)?.country;
}
