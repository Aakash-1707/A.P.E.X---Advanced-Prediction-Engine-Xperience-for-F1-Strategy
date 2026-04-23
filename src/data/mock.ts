export type Driver = {
  pos: number;
  name: string;
  team: string;
  points: number;
  image: string;
  abbr: string;
  color: string;
  number?: string | number;
};

export const teamColors: Record<string, string> = {
  'McLaren': '#FF8000',
  'Red Bull Racing': '#1E5BC6',
  'Red Bull': '#1E5BC6',
  'Ferrari': '#E8002D',
  'Mercedes': '#00B2A9',
  'Aston Martin': '#229971',
  'Alpine': '#2293D1',
  'Williams': '#1868DB',
  'RB': '#6692FF',
  'Haas': '#B6BABD',
  'Kick Sauber': '#52E252',
};

export const drivers: Driver[] = [
  {
    pos: 1,
    name: 'Max Verstappen',
    team: 'Red Bull Racing',
    points: 374,
    image: 'https://images.pexels.com/photos/12801138/pexels-photo-12801138.jpeg?auto=compress&cs=tinysrgb&w=400',
    abbr: 'VER',
    color: '#1E5BC6',
  },
  {
    pos: 2,
    name: 'Lando Norris',
    team: 'McLaren',
    points: 331,
    image: 'https://images.pexels.com/photos/8985454/pexels-photo-8985454.jpeg?auto=compress&cs=tinysrgb&w=400',
    abbr: 'NOR',
    color: '#FF8000',
  },
  {
    pos: 3,
    name: 'Charles Leclerc',
    team: 'Ferrari',
    points: 307,
    image: 'https://images.pexels.com/photos/11413104/pexels-photo-11413104.jpeg?auto=compress&cs=tinysrgb&w=400',
    abbr: 'LEC',
    color: '#E8002D',
  },
];

export type Constructor = {
  pos: number;
  name: string;
  points: number;
  color?: string;
};

export const constructors: Constructor[] = [
  { pos: 1, name: 'McLaren', points: 608 },
  { pos: 2, name: 'Red Bull Racing', points: 581 },
  { pos: 3, name: 'Ferrari', points: 564 },
];

export type Race = {
  round: number;
  name: string;
  location: string;
  country: string;
  date: string;
  time: string;
  status: 'completed' | 'upcoming' | 'live' | 'cancelled';
  meeting_key?: number;
  date_iso?: string;
};

export const races: Race[] = [
  { round: 18, name: 'United States GP', location: 'Circuit of the Americas', country: 'USA', date: 'Oct 19', time: '14:00 CT', status: 'completed' },
  { round: 19, name: 'Mexico City GP', location: 'Autódromo Hermanos Rodríguez', country: 'Mexico', date: 'Oct 26', time: '14:00 CST', status: 'completed' },
  { round: 20, name: 'São Paulo GP', location: 'Interlagos', country: 'Brazil', date: 'Nov 02', time: '14:00 BRT', status: 'live' },
  { round: 21, name: 'Las Vegas GP', location: 'Las Vegas Strip Circuit', country: 'USA', date: 'Nov 22', time: '22:00 PST', status: 'upcoming' },
  { round: 22, name: 'Qatar GP', location: 'Lusail Circuit', country: 'Qatar', date: 'Nov 30', time: '19:00 AST', status: 'upcoming' },
  { round: 23, name: 'Abu Dhabi GP', location: 'Yas Marina', country: 'UAE', date: 'Dec 07', time: '17:00 GST', status: 'upcoming' },
];

export const telemetryLap = Array.from({ length: 60 }, (_, i) => {
  const t = i / 59;
  const speed = 120 + Math.sin(t * Math.PI * 3) * 90 + Math.cos(t * 8) * 20 + 100;
  const throttle = Math.max(0, Math.min(100, 70 + Math.sin(t * 10) * 40));
  const brake = Math.max(0, Math.min(100, 30 - Math.sin(t * 10) * 40));
  const rpm = 8000 + Math.sin(t * Math.PI * 4) * 3500 + 2000;
  return { t: i, speed, throttle, brake, rpm };
});

export const tyreData = {
  soft: Array.from({ length: 25 }, (_, i) => ({ lap: i + 1, wear: Math.min(100, i * 4.2 + Math.random() * 2) })),
  medium: Array.from({ length: 35 }, (_, i) => ({ lap: i + 1, wear: Math.min(100, i * 2.9 + Math.random() * 1.5) })),
  hard: Array.from({ length: 45 }, (_, i) => ({ lap: i + 1, wear: Math.min(100, i * 2.2 + Math.random() * 1.2) })),
};

export const qualifyingPredictions = [
  { driver: 'VER', name: 'Max Verstappen', team: 'Red Bull', prob: 32, color: '#1E5BC6' },
  { driver: 'NOR', name: 'Lando Norris', team: 'McLaren', prob: 28, color: '#FF8000' },
  { driver: 'LEC', name: 'Charles Leclerc', team: 'Ferrari', prob: 18, color: '#E8002D' },
  { driver: 'PIA', name: 'Oscar Piastri', team: 'McLaren', prob: 12, color: '#FF8000' },
  { driver: 'SAI', name: 'Carlos Sainz', team: 'Ferrari', prob: 6, color: '#E8002D' },
  { driver: 'HAM', name: 'Lewis Hamilton', team: 'Mercedes', prob: 4, color: '#00B2A9' },
];

export const racePredictions = [
  { driver: 'NOR', name: 'Lando Norris', team: 'McLaren', prob: 34, color: '#FF8000' },
  { driver: 'VER', name: 'Max Verstappen', team: 'Red Bull', prob: 30, color: '#1E5BC6' },
  { driver: 'PIA', name: 'Oscar Piastri', team: 'McLaren', prob: 16, color: '#FF8000' },
  { driver: 'LEC', name: 'Charles Leclerc', team: 'Ferrari', prob: 11, color: '#E8002D' },
  { driver: 'SAI', name: 'Carlos Sainz', team: 'Ferrari', prob: 5, color: '#E8002D' },
  { driver: 'RUS', name: 'George Russell', team: 'Mercedes', prob: 4, color: '#00B2A9' },
];
