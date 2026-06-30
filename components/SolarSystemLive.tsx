'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import northernLandRings from '@/data/northern-land-rings.json';
import snowIceData from '@/data/snow-ice-frames.json';

type PlanetName = 'Mercury' | 'Venus' | 'Earth' | 'Mars' | 'Jupiter' | 'Saturn';
type BodyName = PlanetName | 'Moon';
type Orientation = 'calendar' | 'earth-top' | 'earth-bottom' | 'location-top';
type CenterMode = 'sun' | 'earth';
type SkyOverlay = 'off' | 'daylight' | 'current';
type GeoCoordinate = [longitude: number, latitude: number];
type SnowIceData = {
  frames: string[];
};
type SnowIceLayer = {
  firstPath: string;
  secondPath: string;
  blend: number;
};

type OrbitalElements = {
  name: PlanetName;
  a: [number, number];
  e: [number, number];
  inclination: [number, number];
  longitude: [number, number];
  perihelion: [number, number];
  node: [number, number];
  displayRadius: number;
  color: string;
  size: number;
};

type PlanetPosition = OrbitalElements & {
  angle: number;
  distance: number;
  heliocentricX: number;
  heliocentricY: number;
  x: number;
  y: number;
};

type ZodiacConstellation = {
  name: string;
  month: string;
  longitude: number;
  points: Array<[number, number]>;
  lines: number[][];
  visiblePoints?: number[];
};

const CENTER = 320;
const DEG = Math.PI / 180;
const CALENDAR_ROTATION = (90 - 280.7) * DEG;
const MONTH_LABEL_ROTATION = -15;
const GEOCENTRIC_RADIUS = 270;
const GEOCENTRIC_MAX_AU = 11;
const GEOCENTRIC_LOG_STRENGTH = 5;
const HELIOCENTRIC_RADIUS_PER_AU = GEOCENTRIC_RADIUS / GEOCENTRIC_MAX_AU;
const EARTH_CENTERED_MOON_RADIUS = 48;
const EARTH_MAX_COMPRESSED_SIZE = 42;
const DAYLIGHT_WEDGE_RADIUS = 375;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;
const MONTH_MS = 30.436875 * DAY_MS;
const YEAR_MS = 365.2425 * DAY_MS;
const DATE_TIME_RANGE_MS = 20 * YEAR_MS;
const DAY_SLIDER_POSITION = 0.25;
const MONTH_SLIDER_POSITION = 0.6;
const EARTH_CENTERED_PLANET_SIZES: Record<PlanetName, number> = {
  Mercury: 2,
  Venus: 3,
  Earth: 18,
  Mars: 2.5,
  Jupiter: 4.5,
  Saturn: 4
};
const HELIOCENTRIC_SCALE_PLANET_SIZES: Record<PlanetName, number> = {
  Mercury: 0.8,
  Venus: 1.1,
  Earth: 1.1,
  Mars: 0.9,
  Jupiter: 2.2,
  Saturn: 2
};
const BODY_NAMES: BodyName[] = ['Mercury', 'Venus', 'Earth', 'Moon', 'Mars', 'Jupiter', 'Saturn'];

type ViewSettings = {
  centerMode: CenterMode;
  radialSpread: number;
  orientation: Orientation;
  showLabels: boolean;
  showOrbits: boolean;
  showZodiac: boolean;
  showNightShadow: boolean;
  skyOverlay: SkyOverlay;
  visibleBodies: Record<BodyName, boolean>;
  latitude: number | null;
  longitude: number | null;
};

const DEFAULT_SETTINGS: ViewSettings = {
  centerMode: 'sun',
  radialSpread: 0,
  orientation: 'calendar',
  showLabels: true,
  showOrbits: true,
  showZodiac: true,
  showNightShadow: true,
  skyOverlay: 'daylight',
  visibleBodies: {
    Mercury: true,
    Venus: true,
    Earth: true,
    Moon: true,
    Mars: true,
    Jupiter: true,
    Saturn: true
  },
  latitude: null,
  longitude: null
};

function parseCoordinate(value: string | null, minimum: number, maximum: number) {
  if (value === null || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function parseRadialSpread(value: string | null) {
  if (value === null) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number / 100)) : 0;
}

function readSelectedTime(search: string) {
  const value = new URLSearchParams(search).get('time');
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function writeSelectedTime(timestamp: number | null) {
  const url = new URL(window.location.href);
  if (timestamp === null) url.searchParams.delete('time');
  else url.searchParams.set('time', new Date(timestamp).toISOString());
  window.history.replaceState(window.history.state, '', url);
}

function timeSliderToOffset(value: number) {
  const sign = Math.sign(value);
  const position = Math.min(1, Math.abs(value));
  if (position <= DAY_SLIDER_POSITION) {
    return sign * DAY_MS * (position / DAY_SLIDER_POSITION);
  }
  if (position <= MONTH_SLIDER_POSITION) {
    const progress =
      (position - DAY_SLIDER_POSITION) / (MONTH_SLIDER_POSITION - DAY_SLIDER_POSITION);
    return sign * DAY_MS * Math.pow(MONTH_MS / DAY_MS, progress);
  }
  const progress = (position - MONTH_SLIDER_POSITION) / (1 - MONTH_SLIDER_POSITION);
  return sign * MONTH_MS * Math.pow(YEAR_MS / MONTH_MS, progress);
}

function timeOffsetToSlider(offset: number) {
  const sign = Math.sign(offset);
  const duration = Math.min(YEAR_MS, Math.abs(offset));
  if (duration <= DAY_MS) return sign * (duration / DAY_MS) * DAY_SLIDER_POSITION;
  if (duration <= MONTH_MS) {
    const progress = Math.log(duration / DAY_MS) / Math.log(MONTH_MS / DAY_MS);
    return sign *
      (DAY_SLIDER_POSITION + progress * (MONTH_SLIDER_POSITION - DAY_SLIDER_POSITION));
  }
  const progress = Math.log(duration / MONTH_MS) / Math.log(YEAR_MS / MONTH_MS);
  return sign * (MONTH_SLIDER_POSITION + progress * (1 - MONTH_SLIDER_POSITION));
}

function localDateTimeValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function playbackSpeedFromSlider(value: number) {
  return HOUR_MS * Math.pow(MONTH_MS / HOUR_MS, value / 100);
}

function playbackSliderFromSpeed(speed: number) {
  return (Math.log(speed / HOUR_MS) / Math.log(MONTH_MS / HOUR_MS)) * 100;
}

function playbackSpeedLabel(speed: number) {
  if (speed < DAY_MS) return `${Math.round(speed / HOUR_MS)} hours / second`;
  if (speed < MONTH_MS * 0.8) {
    const days = speed / DAY_MS;
    return `${days < 10 ? days.toFixed(1) : Math.round(days)} days / second`;
  }
  return '1 month / second';
}

function readPlaybackSettings(search: string) {
  const params = new URLSearchParams(search);
  const rate = Number(params.get('rate'));
  const speed = Number.isFinite(rate) && rate > 0
    ? Math.min(MONTH_MS, Math.max(HOUR_MS, rate * HOUR_MS))
    : DAY_MS;
  return { playing: params.get('play') === '1', speed };
}

function writePlaybackSettings(playing: boolean, speed: number) {
  const url = new URL(window.location.href);
  if (playing) {
    url.searchParams.set('play', '1');
    url.searchParams.delete('time');
  } else {
    url.searchParams.delete('play');
  }
  url.searchParams.set('rate', String(Math.round((speed / HOUR_MS) * 1000) / 1000));
  window.history.replaceState(window.history.state, '', url);
}

function readSettings(search: string): ViewSettings {
  const params = new URLSearchParams(search);
  const latitude = parseCoordinate(params.get('lat'), -90, 90);
  const longitude = parseCoordinate(params.get('lon'), -180, 180);
  const orientationParam = params.get('orientation');
  const orientation: Orientation =
    orientationParam === 'earth-top' || orientationParam === 'earth-bottom'
      ? orientationParam
      : orientationParam === 'location-top' && latitude !== null && longitude !== null
        ? orientationParam
      : 'calendar';
  const hiddenBodies = new Set((params.get('hide') || '').toLowerCase().split(',').filter(Boolean));
  const visibleBodies = Object.fromEntries(
    BODY_NAMES.map((name) => [name, !hiddenBodies.has(name.toLowerCase())])
  ) as Record<BodyName, boolean>;
  const skyParam = params.get('sky');
  const skyOverlay: SkyOverlay =
    skyParam === 'current' || skyParam === 'off'
      ? skyParam
      : params.get('daylight') === '0'
        ? 'off'
        : 'daylight';

  return {
    centerMode: params.get('center') === 'earth' ? 'earth' : 'sun',
    radialSpread: parseRadialSpread(params.get('spread')),
    orientation,
    showLabels: params.get('labels') !== '0',
    showOrbits: params.get('orbits') !== '0',
    showZodiac: params.get('zodiac') !== '0',
    showNightShadow: params.get('shadow') !== '0',
    skyOverlay,
    visibleBodies,
    latitude,
    longitude
  };
}

function writeSettings(settings: ViewSettings) {
  const url = new URL(window.location.href);

  if (settings.centerMode === 'sun') url.searchParams.delete('center');
  else url.searchParams.set('center', settings.centerMode);

  const radialSpread = settings.radialSpread ?? 0;
  if (radialSpread === 0) url.searchParams.delete('spread');
  else url.searchParams.set('spread', String(Math.round(radialSpread * 100)));

  if (settings.orientation === 'calendar') url.searchParams.delete('orientation');
  else url.searchParams.set('orientation', settings.orientation);

  if (settings.showLabels) url.searchParams.delete('labels');
  else url.searchParams.set('labels', '0');

  if (settings.showOrbits) url.searchParams.delete('orbits');
  else url.searchParams.set('orbits', '0');

  if (settings.showZodiac) url.searchParams.delete('zodiac');
  else url.searchParams.set('zodiac', '0');

  if (settings.showNightShadow) url.searchParams.delete('shadow');
  else url.searchParams.set('shadow', '0');

  url.searchParams.delete('daylight');
  if ((settings.skyOverlay ?? 'daylight') === 'daylight') url.searchParams.delete('sky');
  else url.searchParams.set('sky', settings.skyOverlay ?? 'daylight');

  const hiddenBodies = BODY_NAMES.filter((name) => !settings.visibleBodies[name]).map((name) =>
    name.toLowerCase()
  );
  if (hiddenBodies.length) url.searchParams.set('hide', hiddenBodies.join(','));
  else url.searchParams.delete('hide');

  if (settings.latitude === null) url.searchParams.delete('lat');
  else url.searchParams.set('lat', String(Math.round(settings.latitude * 10000) / 10000));

  if (settings.longitude === null) url.searchParams.delete('lon');
  else url.searchParams.set('lon', String(Math.round(settings.longitude * 10000) / 10000));

  window.history.replaceState(window.history.state, '', url);
}

function rotationForOrientation(
  orientation: Orientation,
  earthAngle: number,
  locationAngle: number | null
) {
  if (orientation === 'earth-top') return Math.PI / 2 - earthAngle - CALENDAR_ROTATION;
  if (orientation === 'earth-bottom') return -Math.PI / 2 - earthAngle - CALENDAR_ROTATION;
  if (orientation === 'location-top' && locationAngle !== null) {
    return Math.PI / 2 - locationAngle - CALENDAR_ROTATION;
  }
  return 0;
}

function shortestAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function rotateVector(x: number, y: number, rotation: number) {
  return {
    x: x * Math.cos(rotation) - y * Math.sin(rotation),
    y: x * Math.sin(rotation) + y * Math.cos(rotation)
  };
}

function geocentricPoint(x: number, y: number, rotation: number, radialSpread: number) {
  const rotated = rotateVector(x, y, rotation);
  const distance = Math.hypot(rotated.x, rotated.y);
  if (distance === 0) return { x: CENTER, y: CENTER };
  const logarithmicRadius =
    GEOCENTRIC_RADIUS *
    (Math.log1p(
      Math.min(distance, GEOCENTRIC_MAX_AU) * GEOCENTRIC_LOG_STRENGTH
    ) /
      Math.log1p(GEOCENTRIC_MAX_AU * GEOCENTRIC_LOG_STRENGTH));
  const compressedRadius =
    logarithmicRadius + (GEOCENTRIC_RADIUS - logarithmicRadius) * radialSpread;

  return {
    x: CENTER + (rotated.x / distance) * compressedRadius,
    y: CENTER - (rotated.y / distance) * compressedRadius
  };
}

function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function mixPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  progress: number
) {
  return { x: mix(from.x, to.x, progress), y: mix(from.y, to.y, progress) };
}

function daylightHourAngle(latitude: number, solarDeclination: number) {
  const sunriseCosine = -Math.tan(latitude * DEG) * Math.tan(solarDeclination);
  if (sunriseCosine >= 1) return 0;
  if (sunriseCosine <= -1) return Math.PI;
  return Math.acos(sunriseCosine);
}

function radialWedgePath(
  centerX: number,
  centerY: number,
  radius: number,
  angle: number,
  halfAngle: number
) {
  if (halfAngle <= 0.0001) return '';
  if (halfAngle >= Math.PI - 0.0001) {
    return [
      `M ${centerX + radius} ${centerY}`,
      `A ${radius} ${radius} 0 1 0 ${centerX - radius} ${centerY}`,
      `A ${radius} ${radius} 0 1 0 ${centerX + radius} ${centerY}`,
      'Z'
    ].join(' ');
  }

  const startAngle = angle - halfAngle;
  const endAngle = angle + halfAngle;
  const start = {
    x: centerX + Math.cos(startAngle) * radius,
    y: centerY - Math.sin(startAngle) * radius
  };
  const end = {
    x: centerX + Math.cos(endAngle) * radius,
    y: centerY - Math.sin(endAngle) * radius
  };

  return [
    `M ${centerX} ${centerY}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${halfAngle * 2 > Math.PI ? 1 : 0} 0 ${end.x} ${end.y}`,
    'Z'
  ].join(' ');
}

function projectEarthLocation(latitude: number, longitude: number, date: Date, rotation: number) {
  const greenwichSiderealAngle = greenwichSiderealRotation(date);
  const latitudeRadians = latitude * DEG;
  const localSiderealAngle = greenwichSiderealAngle + longitude * DEG;
  const polarRadius = Math.cos(latitudeRadians);
  const polarX = polarRadius * Math.cos(localSiderealAngle);
  const polarY = polarRadius * Math.sin(localSiderealAngle);

  return {
    x: polarX * Math.cos(rotation) - polarY * Math.sin(rotation),
    y: polarX * Math.sin(rotation) + polarY * Math.cos(rotation),
    nearSide: latitude >= 0
  };
}

function greenwichSiderealRotation(date: Date) {
  const julianDate = date.getTime() / 86400000 + 2440587.5;
  const centuries = (julianDate - 2451545) / 36525;
  const greenwichSiderealDegrees =
    280.46061837 +
    360.98564736629 * (julianDate - 2451545) +
    0.000387933 * centuries * centuries -
    (centuries * centuries * centuries) / 38710000;

  return greenwichSiderealDegrees * DEG;
}

function projectObserverZenith(latitude: number, longitude: number, date: Date, rotation: number) {
  const latitudeRadians = latitude * DEG;
  const localSiderealAngle = greenwichSiderealRotation(date) + longitude * DEG;
  const equatorialX = Math.cos(latitudeRadians) * Math.cos(localSiderealAngle);
  const equatorialY = Math.cos(latitudeRadians) * Math.sin(localSiderealAngle);
  const equatorialZ = Math.sin(latitudeRadians);
  const obliquity = 23.43928 * DEG;
  const eclipticX = equatorialX;
  const eclipticY = Math.cos(obliquity) * equatorialY + Math.sin(obliquity) * equatorialZ;
  const eclipticZ = -Math.sin(obliquity) * equatorialY + Math.cos(obliquity) * equatorialZ;
  const rotated = rotateVector(eclipticX, eclipticY, rotation);

  return { x: rotated.x, y: rotated.y, z: eclipticZ };
}

// Natural Earth 1:110m country polygons that intersect the visible northern hemisphere.
const NORTHERN_LAND_RINGS = northernLandRings as GeoCoordinate[][];
const SNOW_ICE = snowIceData as SnowIceData;

function projectGeoRings(rings: GeoCoordinate[][]) {
  return rings.map((ring) =>
    `${ring
      .map(([longitude, latitude], index) => {
        // Orthographic projection above the equator; southern points continue outside
        // the globe so the SVG clip cleanly cuts polygons at the equator instead of
        // folding the hidden hemisphere back into view.
        const radius = latitude >= 0
          ? Math.cos(latitude * DEG)
          : 1 - Math.sin(latitude * DEG);
        const angle = longitude * DEG;
        const x = radius * Math.cos(angle);
        const y = -radius * Math.sin(angle);
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(4)} ${y.toFixed(4)}`;
      })
      .join(' ')} Z`
  ).join(' ');
}

function snowIceLayer(date: Date): SnowIceLayer {
  const year = date.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const nextYearStart = Date.UTC(year + 1, 0, 1);
  const yearProgress = (date.getTime() - yearStart) / (nextYearStart - yearStart);
  const framePosition = yearProgress * SNOW_ICE.frames.length;
  const firstFrameIndex = Math.floor(framePosition) % SNOW_ICE.frames.length;
  const secondFrameIndex = (firstFrameIndex + 1) % SNOW_ICE.frames.length;
  const blend = framePosition - Math.floor(framePosition);

  return {
    firstPath: SNOW_ICE.frames[firstFrameIndex],
    secondPath: SNOW_ICE.frames[secondFrameIndex],
    blend
  };
}

function snowIceOpacity(weight: number) {
  return weight <= 0 ? 0 : 1 - Math.pow(0.03, weight);
}

const EARTH_LAND_PATH = projectGeoRings(NORTHERN_LAND_RINGS);

// JPL approximate Keplerian elements and rates for 1800–2050.
const PLANETS: OrbitalElements[] = [
  {
    name: 'Mercury',
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    inclination: [7.00497902, -0.00594749],
    longitude: [252.2503235, 149472.67411175],
    perihelion: [77.45779628, 0.16047689],
    node: [48.33076593, -0.12534081],
    displayRadius: 55,
    color: '#a9a9a9',
    size: 4
  },
  {
    name: 'Venus',
    a: [0.72333566, 0.0000039],
    e: [0.00677672, -0.00004107],
    inclination: [3.39467605, -0.0007889],
    longitude: [181.9790995, 58517.81538729],
    perihelion: [131.60246718, 0.00268329],
    node: [76.67984255, -0.27769418],
    displayRadius: 83,
    color: '#e8c78b',
    size: 6
  },
  {
    name: 'Earth',
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    inclination: [-0.00001531, -0.01294668],
    longitude: [100.46457166, 35999.37244981],
    perihelion: [102.93768193, 0.32327364],
    node: [0, 0],
    displayRadius: 114,
    color: '#55aaff',
    size: 7
  },
  {
    name: 'Mars',
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    inclination: [1.84969142, -0.00813131],
    longitude: [-4.55343205, 19140.30268499],
    perihelion: [-23.94362959, 0.44441088],
    node: [49.55953891, -0.29257343],
    displayRadius: 150,
    color: '#e06b42',
    size: 5
  },
  {
    name: 'Jupiter',
    a: [5.202887, -0.00011607],
    e: [0.04838624, -0.00013253],
    inclination: [1.30439695, -0.00183714],
    longitude: [34.39644051, 3034.74612775],
    perihelion: [14.72847983, 0.21252668],
    node: [100.47390909, 0.20469106],
    displayRadius: 211,
    color: '#d9b38c',
    size: 7
  },
  {
    name: 'Saturn',
    a: [9.53667594, -0.0012506],
    e: [0.05386179, -0.00050991],
    inclination: [2.48599187, 0.00193609],
    longitude: [49.95424423, 1222.49362201],
    perihelion: [92.59887831, -0.41897216],
    node: [113.66242448, -0.28867794],
    displayRadius: 275,
    color: '#e4cf9a',
    size: 6
  }
];

// Western line figures derived from d3-celestial's J2000 constellation data.
const ZODIAC: ZodiacConstellation[] = [
  { name: 'Sagittarius', month: 'DEC', longitude: 284.2,
    points: [[-11.8, 10.5], [-10.2, 7.7], [-11, 2.5], [-9.2, -2.6], [-12.8, -7.6], [4.7, 19.3], [5, 14.9], [-0.4, 2.6], [-4.7, -0.8], [13, 16.4], [14.2, 8.8], [13.2, -1.6], [8.3, -3.2], [5.4, -3.6], [2.9, -2.8], [-2.3, -1.6], [-14.9, 3.2], [0.7, 0], [0.1, -6.8], [1.4, -7.6], [3.4, -10], [4.5, -11.3], [4.5, -13.4], [-1.6, -7.5], [-2.5, -5.6]],
    lines: [[0, 1, 2, 3, 4], [5, 6, 7, 8, 3], [9, 10, 11, 12, 13, 14, 15, 8, 2, 16, 1, 7, 17, 15, 18, 19, 20, 21, 22], [18, 23, 24, 15]],
    visiblePoints: [1, 2, 7, 8, 15, 16, 17, 18, 19, 23] },
  { name: 'Capricorn', month: 'JAN', longitude: 312.2,
    points: [[-11.7, -7.1], [-10.8, -4.5], [-8.7, -1], [-4, 7.6], [-2.4, 9.5], [7.1, 4.3], [12.6, -2.9], [10.7, -2.3], [5.9, -2.1], [1.4, -1.6]],
    lines: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0]],
    visiblePoints: [1, 3, 4, 5, 6, 7, 9] },
  { name: 'Aquarius', month: 'FEB', longitude: 334.6,
    points: [[-27.4, 1.6], [-26, 1], [-14.9, -2.9], [-5.2, -9], [-0.7, -7.8], [1.4, -9.3], [3.2, -9.2], [8.2, -0.6], [15.4, 1.2], [12.9, 15], [-5, 6.6], [-2, -0.4], [0.4, -10.9], [16.8, 13.8], [22.1, 11.1]],
    lines: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [2, 10], [3, 11], [5, 12], [13, 8, 14]],
    visiblePoints: [0, 2, 3, 4, 5, 7, 8, 9, 13] },
  { name: 'Pisces', month: 'MAR', longitude: 12.6,
    points: [[9.9, -17.5], [9.3, -23.8], [11.5, -20.6], [9.3, -13.4], [14.9, -6.9], [18.9, 0.2], [23.6, 7.6], [21.2, 7.1], [17.8, 4.5], [14.6, 3.7], [9.9, 2.1], [6.9, 1.7], [2.8, 2], [-11.2, 2.9], [-16.7, 4.3], [-20.1, 3.4], [-22.3, 4.6], [-23.2, 7], [-20.4, 9.3], [-16.1, 8.7], [-14.9, 6.8], [-26.9, 6.4]],
    lines: [[0, 1, 2, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 14], [17, 21]],
    visiblePoints: [0, 1, 2, 4, 6, 12, 13, 14, 17, 19] },
  { name: 'Aries', month: 'APR', longitude: 38.2,
    points: [[10.3, -5.2], [-1.1, -0.9], [-4.4, 2.2], [-4.7, 3.9]],
    lines: [[0, 1, 2, 3]],
    visiblePoints: [0, 1, 2, 3] },
  { name: 'Taurus', month: 'MAY', longitude: 65.1,
    points: [[21.8, -7.8], [4.6, -2.5], [2.6, -1.8], [0.1, -1.5], [1, -3.7], [2.6, -5.6], [18.7, -16.4], [-5.2, 2.1], [-14.5, 5.3], [-4.5, 9.6], [-15.2, 6.1], [-11.8, 16]],
    lines: [[0, 1, 2, 3, 4, 5, 6], [3, 7, 8, 9], [8, 10, 11]],
    visiblePoints: [0, 1, 2, 3, 5, 6, 7, 8, 10] },
  { name: 'Gemini', month: 'JUN', longitude: 104.3,
    points: [[-12.7, 0.5], [-10.6, 0.5], [-5, -2.5], [2.2, -8.4], [8.4, -10.3], [11.2, -5.8], [8.8, -4.5], [4.6, 1.1], [0.3, 2.8], [-6.7, 7.6], [-4.6, 11.6], [4, 7.4]],
    lines: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [7, 11]],
    visiblePoints: [0, 1, 2, 4, 5, 7, 9, 10, 11] },
  { name: 'Cancer', month: 'JUL', longitude: 128.1,
    points: [[4.5, 6.9], [0.8, -0.3], [0.4, -4.1], [1.3, -12.5], [-7, 10]],
    lines: [[0, 1, 2, 3], [1, 4]],
    visiblePoints: [0, 1, 2, 3, 4] },
  { name: 'Leo', month: 'AUG', longitude: 152.6,
    points: [[-6.4, 8.3], [-6.7, 2.7], [-3.2, -0.8], [11.5, -1.6], [21, 5.3], [11.5, 4.3], [-4.1, -4.9], [-10.6, -7.9], [-12.5, -5.3]],
    lines: [[0, 1, 2, 3, 4, 5, 0], [2, 6, 7, 8]],
    visiblePoints: [0, 1, 2, 3, 4, 5, 6, 8] },
  { name: 'Virgo', month: 'SEP', longitude: 197.9,
    points: [[-26, -7.9], [-24.6, -2.5], [-16.2, 0.3], [-10, 1.2], [-1.8, 5.9], [2.5, 12.4], [17.2, 6.5], [24.9, 6.1], [-4.1, -13], [-6, -4.3], [5.3, 0.2], [13, -2.2], [25.8, -2.6]],
    lines: [[0, 1, 2, 3, 4, 5, 6, 7], [8, 9, 3], [4, 10, 11, 12]],
    visiblePoints: [1, 3, 5, 7, 8, 9, 10, 12] },
  { name: 'Libra', month: 'OCT', longitude: 233,
    points: [[-4.4, 5.4], [-8, -5.2], [-0.9, -12.9], [4, -6.6], [4.4, 8.7], [4.9, 10.6]],
    lines: [[0, 1, 2, 3, 4, 5], [1, 3]],
    visiblePoints: [0, 1, 2, 3, 4, 5] },
  { name: 'Scorpius', month: 'NOV', longitude: 255.1,
    points: [[-12.6, -8.2], [-12.3, -12.3], [-11.1, -15.5], [-7.3, -8.8], [-5.3, -7.9], [-3.7, -5.8], [-0.3, 1.2], [0.1, 5.5], [0.7, 10.4], [5, 11.4], [11, 11.2], [13.5, 7.9], [12.3, 6.6], [10.1, 4.4]],
    lines: [[0, 1, 2], [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]],
    visiblePoints: [0, 1, 2, 3, 4, 5, 6, 10, 12, 13] }
];

function valueAt([base, rate]: [number, number], centuries: number) {
  return base + rate * centuries;
}

function solveEccentricAnomaly(meanAnomaly: number, eccentricity: number) {
  let eccentricAnomaly = meanAnomaly;
  for (let index = 0; index < 10; index += 1) {
    eccentricAnomaly -=
      (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) /
      (1 - eccentricity * Math.cos(eccentricAnomaly));
  }
  return eccentricAnomaly;
}

function orbitalFrame(planet: OrbitalElements, date: Date) {
  const julianDate = date.getTime() / 86400000 + 2440587.5;
  const centuries = (julianDate - 2451545) / 36525;
  const semiMajorAxis = valueAt(planet.a, centuries);
  const eccentricity = valueAt(planet.e, centuries);
  const inclination = valueAt(planet.inclination, centuries) * DEG;
  const longitude = valueAt(planet.longitude, centuries);
  const perihelion = valueAt(planet.perihelion, centuries);
  const nodeDegrees = valueAt(planet.node, centuries);
  const node = nodeDegrees * DEG;
  const argumentOfPerihelion = (perihelion - nodeDegrees) * DEG;
  const meanAnomaly = ((((longitude - perihelion) % 360) + 540) % 360 - 180) * DEG;

  return {
    semiMajorAxis,
    eccentricity,
    inclination,
    node,
    argumentOfPerihelion,
    meanAnomaly
  };
}

function eclipticCoordinates(frame: ReturnType<typeof orbitalFrame>, eccentricAnomaly: number) {
  const orbitalX = frame.semiMajorAxis * (Math.cos(eccentricAnomaly) - frame.eccentricity);
  const orbitalY =
    frame.semiMajorAxis *
    Math.sqrt(1 - frame.eccentricity * frame.eccentricity) *
    Math.sin(eccentricAnomaly);
  const cosW = Math.cos(frame.argumentOfPerihelion);
  const sinW = Math.sin(frame.argumentOfPerihelion);
  const cosNode = Math.cos(frame.node);
  const sinNode = Math.sin(frame.node);
  const cosInclination = Math.cos(frame.inclination);

  return {
    x:
      (cosW * cosNode - sinW * sinNode * cosInclination) * orbitalX +
      (-sinW * cosNode - cosW * sinNode * cosInclination) * orbitalY,
    y:
      (cosW * sinNode + sinW * cosNode * cosInclination) * orbitalX +
      (-sinW * sinNode + cosW * cosNode * cosInclination) * orbitalY
  };
}

function sampledOrbit(planet: OrbitalElements, date: Date, steps = 120) {
  const frame = orbitalFrame(planet, date);
  return Array.from({ length: steps + 1 }, (_, index) =>
    eclipticCoordinates(frame, (index / steps) * Math.PI * 2)
  );
}

function positionPlanet(planet: OrbitalElements, date: Date): PlanetPosition {
  const frame = orbitalFrame(planet, date);
  const eccentricAnomaly = solveEccentricAnomaly(frame.meanAnomaly, frame.eccentricity);
  const ecliptic = eclipticCoordinates(frame, eccentricAnomaly);
  const angle = Math.atan2(ecliptic.y, ecliptic.x);

  return {
    ...planet,
    angle,
    distance: Math.hypot(ecliptic.x, ecliptic.y),
    heliocentricX: ecliptic.x,
    heliocentricY: ecliptic.y,
    x: CENTER + Math.cos(angle) * planet.displayRadius,
    y: CENTER - Math.sin(angle) * planet.displayRadius
  };
}

function Planet({
  planet,
  showLabel,
  sunPosition,
  solarDeclination,
  earthSurfaceRotation,
  snowIce,
  showNightShadow
}: {
  planet: PlanetPosition;
  showLabel: boolean;
  sunPosition: { x: number; y: number };
  solarDeclination: number;
  earthSurfaceRotation: number;
  snowIce: SnowIceLayer;
  showNightShadow: boolean;
}) {
  const labelOnLeft = planet.x < CENTER || planet.x > 550;
  const labelX = planet.x + (labelOnLeft ? -11 : 11);
  const labelAnchor = labelOnLeft ? 'end' : 'start';
  const lightAngle = Math.atan2(sunPosition.y - planet.y, sunPosition.x - planet.x) / DEG;
  const terminatorRadius = planet.size * Math.abs(Math.sin(solarDeclination));
  const terminatorSegment =
    terminatorRadius < 0.001
      ? `L ${planet.x} ${planet.y + planet.size}`
      : `A ${terminatorRadius} ${planet.size} 0 0 ${solarDeclination < 0 ? 1 : 0} ${planet.x} ${planet.y + planet.size}`;
  const polarNightPath = [
    `M ${planet.x} ${planet.y - planet.size}`,
    terminatorSegment,
    `A ${planet.size} ${planet.size} 0 0 1 ${planet.x} ${planet.y - planet.size}`,
    'Z'
  ].join(' ');

  return (
    <g className="solar-planet">
      <title>{`${planet.name}: ${planet.distance.toFixed(2)} AU from the Sun`}</title>
      {planet.name === 'Saturn' ? (
        <ellipse
          className="saturn-ring"
          cx={planet.x}
          cy={planet.y}
          rx={planet.size * 1.8}
          ry={planet.size * 1.6}
          transform={`rotate(-8 ${planet.x} ${planet.y})`}
        />
      ) : null}
      {planet.name === 'Earth' ? (
        <g>
          <circle data-body="Earth" className="earth-lit" cx={planet.x} cy={planet.y} r={planet.size} />
          <g
            clipPath="url(#earth-surface-clip)"
            transform={`translate(${planet.x} ${planet.y}) scale(${planet.size})`}
          >
            <g transform={`rotate(${-earthSurfaceRotation / DEG})`}>
              <path
                aria-label="Northern Hemisphere continents"
                className="earth-land"
                d={EARTH_LAND_PATH}
                fill="#214b2d"
                fillOpacity="0.92"
                fillRule="evenodd"
              />
              <path
                aria-label="Seasonal Northern Hemisphere snow and ice"
                d={snowIce.firstPath}
                fill="#d8edf1"
                fillOpacity={snowIceOpacity(1 - snowIce.blend)}
                fillRule="evenodd"
              />
              <path
                aria-label="Seasonal Northern Hemisphere snow and ice"
                d={snowIce.secondPath}
                fill="#d8edf1"
                fillOpacity={snowIceOpacity(snowIce.blend)}
                fillRule="evenodd"
              />
            </g>
          </g>
          {showNightShadow ? (
            <path
              aria-label="Earth night shadow"
              d={polarNightPath}
              fill="#02070c"
              fillOpacity="0.78"
              transform={`rotate(${lightAngle} ${planet.x} ${planet.y})`}
            />
          ) : null}
          <circle className="earth-outline" cx={planet.x} cy={planet.y} r={planet.size} />
        </g>
      ) : (
        <circle data-body={planet.name} cx={planet.x} cy={planet.y} fill={planet.color} r={planet.size} />
      )}
      {planet.name === 'Jupiter' ? (
        <circle
          className="jupiter-band"
          cx={planet.x}
          cy={planet.y}
          r={planet.size * 0.62}
          strokeWidth={Math.max(0.4, planet.size * 0.08)}
        />
      ) : null}
      {showLabel ? (
        <text className="planet-label" x={labelX} y={planet.y - planet.size - 5} textAnchor={labelAnchor}>
          {planet.name}
        </text>
      ) : null}
    </g>
  );
}

function ZodiacMap({ rotation }: { rotation: number }) {
  return (
    <g aria-label="Traditional zodiac constellation ring">
      <circle className="zodiac-ring" cx={CENTER} cy={CENTER} r="309" />
      {ZODIAC.map((constellation, index) => {
        const angleDegrees =
          constellation.longitude + CALENDAR_ROTATION / DEG + rotation / DEG;
        const angle = angleDegrees * DEG;
        const monthAngle =
          (90 + MONTH_LABEL_ROTATION + index * 30 + rotation / DEG) * DEG;
        const mapRadius = 325;
        const labelRadius = 296;
        const monthRadius = 270;
        const x = CENTER + Math.cos(angle) * mapRadius;
        const y = CENTER - Math.sin(angle) * mapRadius;
        const labelX = CENTER + Math.cos(angle) * labelRadius;
        const labelY = CENTER - Math.sin(angle) * labelRadius;
        const monthX = CENTER + Math.cos(monthAngle) * monthRadius;
        const monthY = CENTER - Math.sin(monthAngle) * monthRadius;
        const visiblePoints = constellation.visiblePoints
          ? new Set(constellation.visiblePoints)
          : null;

        return (
          <g key={constellation.name}>
            <g transform={`translate(${x} ${y}) rotate(${90 - angleDegrees})`}>
              {constellation.lines.map((line, lineIndex) => {
                const filteredLine = visiblePoints
                  ? line.filter((pointIndex) => visiblePoints.has(pointIndex))
                  : line;
                if (filteredLine.length < 2) return null;
                return (
                  <polyline
                    key={lineIndex}
                    className="zodiac-line"
                    points={filteredLine
                      .map((pointIndex) => {
                        const [pointX, pointY] = constellation.points[pointIndex];
                        return `${-pointX},${pointY}`;
                      })
                      .join(' ')}
                  />
                );
              })}
              {constellation.points.map(([pointX, pointY], pointIndex) =>
                !visiblePoints || visiblePoints.has(pointIndex) ? (
                  <circle
                    key={pointIndex}
                    className="zodiac-star"
                    cx={-pointX}
                    cy={pointY}
                    r="1"
                  />
                ) : null
              )}
            </g>
            <text className="zodiac-label" x={labelX} y={labelY} textAnchor="middle">
              {constellation.name}
            </text>
            <text className="zodiac-month" x={monthX} y={monthY} textAnchor="middle">
              {constellation.month}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function SolarSystemLive() {
  const [liveNow, setLiveNow] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [timePlaying, setTimePlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(DAY_MS);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settings, setSettings] = useState<ViewSettings>(DEFAULT_SETTINGS);
  const [animatedRotation, setAnimatedRotation] = useState(0);
  const [rotationAnimating, setRotationAnimating] = useState(false);
  const [centerProgress, setCenterProgress] = useState(0);
  const [locationDraft, setLocationDraft] = useState({ latitude: '', longitude: '' });
  const [locationStatus, setLocationStatus] = useState('');
  const rotationFrame = useRef<number | null>(null);
  const centerFrame = useRef<number | null>(null);

  useEffect(() => {
    const readUrl = () => {
      const next = readSettings(window.location.search);
      const playback = readPlaybackSettings(window.location.search);
      setSettings(next);
      setSelectedTime(playback.playing ? null : readSelectedTime(window.location.search));
      setPlaybackSpeed(playback.speed);
      setTimePlaying(playback.playing);
      setCenterProgress(next.centerMode === 'earth' ? 1 : 0);
      setLocationDraft({
        latitude: next.latitude === null ? '' : String(next.latitude),
        longitude: next.longitude === null ? '' : String(next.longitude)
      });
    };
    const start = window.setTimeout(() => {
      readUrl();
      setLiveNow(new Date());
    }, 0);
    const timer = window.setInterval(() => setLiveNow(new Date()), 1000);
    window.addEventListener('popstate', readUrl);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
      window.removeEventListener('popstate', readUrl);
      if (rotationFrame.current !== null) window.cancelAnimationFrame(rotationFrame.current);
      if (centerFrame.current !== null) window.cancelAnimationFrame(centerFrame.current);
    };
  }, []);

  useEffect(() => {
    if (!timePlaying) return;
    let previousTick = window.performance.now();
    let playbackFrame = 0;
    const animatePlayback = (currentTick: number) => {
      const elapsedSeconds = (currentTick - previousTick) / 1000;
      previousTick = currentTick;
      setSelectedTime((current) => {
        const next = (current ?? Date.now()) + elapsedSeconds * playbackSpeed;
        return Math.min(next, Date.now() + DATE_TIME_RANGE_MS);
      });
      playbackFrame = window.requestAnimationFrame(animatePlayback);
    };
    playbackFrame = window.requestAnimationFrame(animatePlayback);

    return () => window.cancelAnimationFrame(playbackFrame);
  }, [playbackSpeed, timePlaying]);

  const now = selectedTime === null ? liveNow : new Date(selectedTime);
  const timeSliderValue = liveNow
    ? timeOffsetToSlider((selectedTime ?? liveNow.getTime()) - liveNow.getTime())
    : 0;

  function updateSettings(update: (current: ViewSettings) => ViewSettings) {
    setSettings((current) => {
      const next = update(current);
      writeSettings(next);
      return next;
    });
  }

  function setTimeFromSlider(value: number) {
    setTimePlaying(false);
    writePlaybackSettings(false, playbackSpeed);
    if (!liveNow || Math.abs(value) < 0.0005) {
      setSelectedTime(null);
      writeSelectedTime(null);
      return;
    }
    const timestamp = Math.round((liveNow.getTime() + timeSliderToOffset(value)) / 60000) * 60000;
    setSelectedTime(timestamp);
    writeSelectedTime(timestamp);
  }

  function setTimeFromDateTime(value: string) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return;
    setTimePlaying(false);
    writePlaybackSettings(false, playbackSpeed);
    setSelectedTime(timestamp);
    writeSelectedTime(timestamp);
  }

  function toggleTimePlayback() {
    if (timePlaying) {
      setTimePlaying(false);
      if (selectedTime !== null) writeSelectedTime(selectedTime);
      writePlaybackSettings(false, playbackSpeed);
      return;
    }
    const startTime = selectedTime ?? liveNow?.getTime();
    if (startTime === undefined) return;
    setSelectedTime(startTime);
    setTimePlaying(true);
    writePlaybackSettings(true, playbackSpeed);
  }

  function setPlaybackRate(value: number) {
    const speed = playbackSpeedFromSlider(value);
    setPlaybackSpeed(speed);
    writePlaybackSettings(timePlaying, speed);
  }

  function setBodyVisible(name: BodyName, visible: boolean) {
    updateSettings((current) => ({
      ...current,
      visibleBodies: { ...current.visibleBodies, [name]: visible }
    }));
  }

  function setCenterMode(centerMode: CenterMode) {
    if (centerMode === settings.centerMode) return;
    if (centerFrame.current !== null) window.cancelAnimationFrame(centerFrame.current);

    const from = centerProgress;
    const destination = centerMode === 'earth' ? 1 : 0;
    updateSettings((current) => ({ ...current, centerMode }));

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCenterProgress(destination);
      return;
    }

    const startedAt = window.performance.now();
    const duration = 1150;
    const animate = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      setCenterProgress(mix(from, destination, eased));

      if (progress < 1) {
        centerFrame.current = window.requestAnimationFrame(animate);
      } else {
        centerFrame.current = null;
      }
    };

    centerFrame.current = window.requestAnimationFrame(animate);
  }

  function applyLocation(latitude: number, longitude: number) {
    const roundedLatitude = Math.round(latitude * 10000) / 10000;
    const roundedLongitude = Math.round(longitude * 10000) / 10000;
    setLocationDraft({
      latitude: String(roundedLatitude),
      longitude: String(roundedLongitude)
    });
    updateSettings((current) => ({
      ...current,
      latitude: roundedLatitude,
      longitude: roundedLongitude
    }));
  }

  function applyLocationDraft() {
    const latitude = parseCoordinate(locationDraft.latitude, -90, 90);
    const longitude = parseCoordinate(locationDraft.longitude, -180, 180);
    if (latitude === null || longitude === null) {
      setLocationStatus('Enter latitude from −90 to 90 and longitude from −180 to 180.');
      return;
    }
    applyLocation(latitude, longitude);
    setLocationStatus('Location set.');
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('Location is not available in this browser.');
      return;
    }
    setLocationStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        applyLocation(coords.latitude, coords.longitude);
        setLocationStatus('Current location set.');
      },
      () => setLocationStatus('Unable to access your location.'),
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 }
    );
  }

  function clearLocation() {
    setLocationDraft({ latitude: '', longitude: '' });
    updateSettings((current) => ({
      ...current,
      orientation: current.orientation === 'location-top' ? 'calendar' : current.orientation,
      latitude: null,
      longitude: null
    }));
    setLocationStatus('Location cleared.');
  }

  const naturalPlanets = useMemo(
    () => (now ? PLANETS.map((planet) => positionPlanet(planet, now)) : []),
    [now]
  );
  const naturalEarth = naturalPlanets.find((planet) => planet.name === 'Earth');
  const naturalLocationProjection =
    now && settings.latitude !== null && settings.longitude !== null
      ? projectEarthLocation(settings.latitude, settings.longitude, now, 0)
      : null;
  const naturalLocationAngle = naturalLocationProjection
    ? Math.atan2(naturalLocationProjection.y, naturalLocationProjection.x)
    : null;
  const targetRotation = naturalEarth
    ? rotationForOrientation(settings.orientation, naturalEarth.angle, naturalLocationAngle)
    : 0;
  const viewRotation = rotationAnimating ? animatedRotation : targetRotation;
  const sceneRotation = viewRotation + CALENDAR_ROTATION;
  const earthSurfaceRotation = now ? greenwichSiderealRotation(now) + sceneRotation : 0;
  const snowIce = useMemo(
    () => now
      ? snowIceLayer(now)
      : { firstPath: '', secondPath: '', blend: 0 },
    [now]
  );

  function setOrientation(orientation: Orientation) {
    if (!naturalEarth || orientation === settings.orientation) return;

    if (rotationFrame.current !== null) window.cancelAnimationFrame(rotationFrame.current);
    const from = rotationAnimating ? animatedRotation : targetRotation;
    const destination = rotationForOrientation(orientation, naturalEarth.angle, naturalLocationAngle);
    const delta = shortestAngleDelta(from, destination);

    updateSettings((current) => ({ ...current, orientation }));

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRotationAnimating(false);
      return;
    }

    setAnimatedRotation(from);
    setRotationAnimating(true);
    const startedAt = window.performance.now();
    const duration = 850;

    const animate = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedRotation(from + delta * eased);

      if (progress < 1) {
        rotationFrame.current = window.requestAnimationFrame(animate);
      } else {
        rotationFrame.current = null;
        setRotationAnimating(false);
      }
    };

    rotationFrame.current = window.requestAnimationFrame(animate);
  }
  const orbitSamples = useMemo(
    () =>
      now
        ? Object.fromEntries(PLANETS.map((planet) => [planet.name, sampledOrbit(planet, now)]))
        : {},
    [now]
  ) as Partial<Record<PlanetName, Array<{ x: number; y: number }>>>;
  const earthRaw = naturalEarth
    ? { x: naturalEarth.heliocentricX, y: naturalEarth.heliocentricY }
    : { x: 0, y: 0 };
  const sunEclipticLongitude = Math.atan2(-earthRaw.y, -earthRaw.x);
  const solarDeclination = Math.asin(
    Math.sin(23.43928 * DEG) * Math.sin(sunEclipticLongitude)
  );
  const sunEarthCentered = geocentricPoint(
    -earthRaw.x,
    -earthRaw.y,
    sceneRotation,
    settings.radialSpread ?? 0
  );
  const sunPosition = mixPoint(
    { x: CENTER, y: CENTER },
    sunEarthCentered,
    centerProgress
  );
  const heliocentricSunRadius = mix(15, 4, settings.radialSpread ?? 0);
  const sunRadius = mix(heliocentricSunRadius, 8, centerProgress);

  const planets = naturalPlanets.map((planet) => {
    const angle = planet.angle + sceneRotation;
    const sunCenteredRadius = mix(
      planet.displayRadius,
      planet.distance * HELIOCENTRIC_RADIUS_PER_AU,
      settings.radialSpread ?? 0
    );
    const sunCentered = {
      x: CENTER + Math.cos(angle) * sunCenteredRadius,
      y: CENTER - Math.sin(angle) * sunCenteredRadius
    };
    const earthCentered = geocentricPoint(
      planet.heliocentricX - earthRaw.x,
      planet.heliocentricY - earthRaw.y,
      sceneRotation,
      settings.radialSpread ?? 0
    );
    const point = mixPoint(sunCentered, earthCentered, centerProgress);
    const earthCenteredSize = planet.name === 'Earth'
      ? mix(
          EARTH_CENTERED_PLANET_SIZES.Earth,
          EARTH_MAX_COMPRESSED_SIZE,
          settings.radialSpread ?? 0
        )
      : EARTH_CENTERED_PLANET_SIZES[planet.name];
    const heliocentricSize = mix(
      planet.size,
      HELIOCENTRIC_SCALE_PLANET_SIZES[planet.name],
      settings.radialSpread ?? 0
    );

    return {
      ...planet,
      angle,
      size: mix(heliocentricSize, earthCenteredSize, centerProgress),
      x: point.x,
      y: point.y
    };
  });
  const earth = planets.find((planet) => planet.name === 'Earth');
  const orbitPaths = PLANETS.map((planet) => {
    const samples = orbitSamples[planet.name] || [];
    const points = samples.map((sample) => {
      const angle = Math.atan2(sample.y, sample.x) + sceneRotation;
      const sunCenteredRadius = mix(
        planet.displayRadius,
        Math.hypot(sample.x, sample.y) * HELIOCENTRIC_RADIUS_PER_AU,
        settings.radialSpread ?? 0
      );
      const sunCentered = {
        x: CENTER + Math.cos(angle) * sunCenteredRadius,
        y: CENTER - Math.sin(angle) * sunCenteredRadius
      };
      const earthCentered = geocentricPoint(
        sample.x - earthRaw.x,
        sample.y - earthRaw.y,
        sceneRotation,
        settings.radialSpread ?? 0
      );
      return mixPoint(sunCentered, earthCentered, centerProgress);
    });

    return {
      name: planet.name,
      path: points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(' ')
    };
  });
  const daysSinceJ2000 = now ? now.getTime() / 86400000 + 2440587.5 - 2451545 : 0;
  const moonAngle = ((218.316 + 13.176396 * daysSinceJ2000) % 360) * DEG + sceneRotation;
  const naturalEarthDisplay = naturalEarth
    ? {
        x:
          CENTER +
          Math.cos(naturalEarth.angle + sceneRotation) *
            mix(
              naturalEarth.displayRadius,
              naturalEarth.distance * HELIOCENTRIC_RADIUS_PER_AU,
              settings.radialSpread ?? 0
            ),
        y:
          CENTER -
          Math.sin(naturalEarth.angle + sceneRotation) *
            mix(
              naturalEarth.displayRadius,
              naturalEarth.distance * HELIOCENTRIC_RADIUS_PER_AU,
              settings.radialSpread ?? 0
            )
      }
    : { x: CENTER, y: CENTER };
  const moonSunCenteredRadius = mix(18, 3.5, settings.radialSpread ?? 0);
  const moonSunCentered = {
    x: naturalEarthDisplay.x + Math.cos(moonAngle) * moonSunCenteredRadius,
    y: naturalEarthDisplay.y - Math.sin(moonAngle) * moonSunCenteredRadius
  };
  const earthCenteredMoonRadius = mix(
    EARTH_CENTERED_MOON_RADIUS,
    GEOCENTRIC_RADIUS,
    settings.radialSpread ?? 0
  );
  const moonEarthCentered = {
    x: CENTER + Math.cos(moonAngle) * earthCenteredMoonRadius,
    y: CENTER - Math.sin(moonAngle) * earthCenteredMoonRadius
  };
  const moonPosition = mixPoint(moonSunCentered, moonEarthCentered, centerProgress);
  const moonX = moonPosition.x;
  const moonY = moonPosition.y;
  const moonLightAngle = Math.atan2(sunPosition.y - moonY, sunPosition.x - moonX) / DEG;
  const heliocentricMoonRadius = mix(3.6, 0.7, settings.radialSpread ?? 0);
  const moonRadius = mix(heliocentricMoonRadius, 8, centerProgress);
  const moonOrbitRadius = mix(moonSunCenteredRadius, earthCenteredMoonRadius, centerProgress);
  const projectedLocation =
    now && settings.latitude !== null && settings.longitude !== null
      ? projectEarthLocation(settings.latitude, settings.longitude, now, sceneRotation)
      : null;
  const locationX = earth && projectedLocation ? earth.x + projectedLocation.x * earth.size : 0;
  const locationY = earth && projectedLocation ? earth.y - projectedLocation.y * earth.size : 0;
  const locationMarkerReferenceSize = mix(
    PLANETS.find((planet) => planet.name === 'Earth')?.size ?? 7,
    EARTH_CENTERED_PLANET_SIZES.Earth,
    centerProgress
  );
  const locationMarkerScale = earth
    ? Math.max(0.35, earth.size / locationMarkerReferenceSize)
    : 1;
  const alignmentAngle = naturalEarth
    ? naturalEarth.angle + sceneRotation + Math.PI
    : 0;
  const alignmentStart = earth
    ? mixPoint(sunPosition, { x: earth.x, y: earth.y }, centerProgress)
    : sunPosition;
  const daylightHalfAngle =
    settings.latitude === null ? 0 : daylightHourAngle(settings.latitude, solarDeclination);
  const daylightCenterAngle = earth
    ? Math.atan2(earth.y - sunPosition.y, sunPosition.x - earth.x)
    : 0;
  const daylightWedgePath = earth
    ? radialWedgePath(
        earth.x,
        earth.y,
        DAYLIGHT_WEDGE_RADIUS,
        daylightCenterAngle,
        daylightHalfAngle
      )
    : '';
  const daylightHours = (daylightHalfAngle / Math.PI) * 24;
  const observerZenith =
    now && settings.latitude !== null && settings.longitude !== null
      ? projectObserverZenith(settings.latitude, settings.longitude, now, sceneRotation)
      : null;
  const zenithProjectionLength = observerZenith
    ? Math.hypot(observerZenith.x, observerZenith.y)
    : 0;
  const currentSkyCenterAngle = observerZenith
    ? Math.atan2(observerZenith.y, observerZenith.x)
    : 0;
  const currentSkyVisiblePath =
    earth && zenithProjectionLength > 0.0001
      ? radialWedgePath(
          earth.x,
          earth.y,
          DAYLIGHT_WEDGE_RADIUS,
          currentSkyCenterAngle,
          Math.PI / 2
        )
      : '';
  const currentSkyHiddenPath =
    earth && zenithProjectionLength > 0.0001
      ? radialWedgePath(
          earth.x,
          earth.y,
          DAYLIGHT_WEDGE_RADIUS,
          currentSkyCenterAngle + Math.PI,
          Math.PI / 2
        )
      : '';
  const sunDirectionLength = Math.hypot(earthRaw.x, earthRaw.y) || 1;
  const rotatedSunDirection = rotateVector(
    -earthRaw.x / sunDirectionLength,
    -earthRaw.y / sunDirectionLength,
    sceneRotation
  );
  const sunAltitude = observerZenith
    ? Math.asin(
        Math.min(
          1,
          Math.max(
            -1,
            observerZenith.x * rotatedSunDirection.x +
              observerZenith.y * rotatedSunDirection.y
          )
        )
      ) / DEG
    : 0;
  const twilightBlend = Math.min(1, Math.max(0, (3 - sunAltitude) / 9));
  const nightBlend = Math.min(1, Math.max(0, (-6 - sunAltitude) / 6));

  if (!now) {
    return <div className="solar-loading">Locating the planets…</div>;
  }

  return (
    <div className="solar-tool">
      <button
        aria-expanded={menuOpen}
        aria-label={menuOpen ? 'Close solar system menu' : 'Open solar system menu'}
        className="solar-menu-button"
        onClick={() => setMenuOpen((open) => !open)}
        type="button"
      >
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {menuOpen ? (
        <aside className="solar-menu-panel">
          <section>
            <span className="solar-menu-heading">Displayed time</span>
            <time dateTime={now.toISOString()}>
              {now.toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'medium'
              })}
            </time>
            <label className="solar-time-control">
              <input
                aria-label="Time offset from now"
                max="1000"
                min="-1000"
                onChange={(event) => setTimeFromSlider(Number(event.target.value) / 1000)}
                step="1"
                type="range"
                value={Math.round(timeSliderValue * 1000)}
              />
              <span className="solar-time-scale">
                <small className="edge-start" style={{ left: '0%' }}>−1 year</small>
                <small style={{ left: '20%' }}>−1 month</small>
                <small style={{ left: '37.5%' }}>−1 day</small>
                <small style={{ left: '50%' }}>Now</small>
                <small style={{ left: '62.5%' }}>+1 day</small>
                <small style={{ left: '80%' }}>+1 month</small>
                <small className="edge-end" style={{ left: '100%' }}>+1 year</small>
              </span>
            </label>
            <label className="solar-date-time-control">
              <span>Date and time</span>
              <input
                max={liveNow ? localDateTimeValue(new Date(liveNow.getTime() + DATE_TIME_RANGE_MS)) : undefined}
                min={liveNow ? localDateTimeValue(new Date(liveNow.getTime() - DATE_TIME_RANGE_MS)) : undefined}
                onChange={(event) => setTimeFromDateTime(event.target.value)}
                type="datetime-local"
                value={localDateTimeValue(now)}
              />
            </label>
            <div className="solar-playback-control">
              <div>
                <span>Time playback</span>
                <output>{playbackSpeedLabel(playbackSpeed)}</output>
              </div>
              <button
                aria-label={timePlaying ? 'Pause time playback' : 'Play time forward'}
                onClick={toggleTimePlayback}
                type="button"
              >
                {timePlaying ? 'Pause' : 'Play'}
              </button>
              <label>
                <span>Playback speed</span>
                <input
                  aria-label="Time playback speed"
                  max="100"
                  min="0"
                  onChange={(event) => setPlaybackRate(Number(event.target.value))}
                  step="1"
                  type="range"
                  value={Math.round(playbackSliderFromSpeed(playbackSpeed))}
                />
              </label>
              <div className="solar-playback-scale">
                <small>1 hour / second</small>
                <small>1 month / second</small>
              </div>
            </div>
            <button
              className="solar-now-button"
              disabled={selectedTime === null}
              onClick={() => setTimeFromSlider(0)}
              type="button"
            >
              Return to now
            </button>
          </section>

          <section>
            <span className="solar-menu-heading">Center</span>
            <label className="solar-toggle">
              <input
                checked={settings.centerMode === 'sun'}
                name="center-mode"
                onChange={() => setCenterMode('sun')}
                type="radio"
              />
              Sun centered
            </label>
            <label className="solar-toggle">
              <input
                checked={settings.centerMode === 'earth'}
                name="center-mode"
                onChange={() => setCenterMode('earth')}
                type="radio"
              />
              Earth centered
            </label>
            <label className="solar-range-control">
              <span>
                Radial compression
                <output>
                  {Math.round(
                    (settings.centerMode === 'sun'
                      ? 1 - (settings.radialSpread ?? 0)
                      : settings.radialSpread ?? 0) * 100
                  )}%
                </output>
              </span>
              <input
                aria-label={
                  settings.centerMode === 'sun'
                    ? 'Heliocentric radial compression'
                    : 'Earth-centered radial compression'
                }
                max="100"
                min="0"
                onChange={(event) =>
                  updateSettings((current) => ({
                    ...current,
                    radialSpread:
                      current.centerMode === 'sun'
                        ? 1 - Number(event.target.value) / 100
                        : Number(event.target.value) / 100
                  }))
                }
                step="1"
                type="range"
                value={Math.round(
                  (settings.centerMode === 'sun'
                    ? 1 - (settings.radialSpread ?? 0)
                    : settings.radialSpread ?? 0) * 100
                )}
              />
              <span className="solar-range-ends">
                <small>{settings.centerMode === 'sun' ? 'Scale model' : 'Current'}</small>
                <small>{settings.centerMode === 'sun' ? 'Useful view' : 'One circle'}</small>
              </span>
            </label>
          </section>

          <section>
            <span className="solar-menu-heading">Orientation</span>
            <label className="solar-toggle">
              <input
                checked={settings.orientation === 'calendar'}
                name="orientation"
                onChange={() => setOrientation('calendar')}
                type="radio"
              />
              Sagittarius at top
            </label>
            <label className="solar-toggle">
              <input
                checked={settings.orientation === 'earth-top'}
                name="orientation"
                onChange={() => setOrientation('earth-top')}
                type="radio"
              />
              Earth at top
            </label>
            <label className="solar-toggle">
              <input
                checked={settings.orientation === 'earth-bottom'}
                name="orientation"
                onChange={() => setOrientation('earth-bottom')}
                type="radio"
              />
              Sun at top
            </label>
            <label className="solar-toggle">
              <input
                checked={settings.orientation === 'location-top'}
                disabled={settings.latitude === null || settings.longitude === null}
                name="orientation"
                onChange={() => setOrientation('location-top')}
                type="radio"
              />
              My location at top
            </label>
          </section>

          <section>
            <span className="solar-menu-heading">Display</span>
            <label className="solar-toggle">
              <input
                checked={settings.showLabels}
                onChange={(event) =>
                  updateSettings((current) => ({ ...current, showLabels: event.target.checked }))
                }
                type="checkbox"
              />
              Planet labels
            </label>
            <label className="solar-toggle">
              <input
                checked={settings.showOrbits}
                onChange={(event) =>
                  updateSettings((current) => ({ ...current, showOrbits: event.target.checked }))
                }
                type="checkbox"
              />
              Orbit paths
            </label>
            <label className="solar-toggle">
              <input
                checked={settings.showZodiac}
                onChange={(event) =>
                  updateSettings((current) => ({ ...current, showZodiac: event.target.checked }))
                }
                type="checkbox"
              />
              Zodiac map
            </label>
            <label className="solar-toggle">
              <input
                checked={settings.showNightShadow}
                onChange={(event) =>
                  updateSettings((current) => ({
                    ...current,
                    showNightShadow: event.target.checked
                  }))
                }
                type="checkbox"
              />
              Night shadow
            </label>
            <span className="solar-overlay-heading">Sky overlay</span>
            {([
              ['off', 'Off'],
              ['daylight', 'Daylight window'],
              ['current', 'Current sky']
            ] as Array<[SkyOverlay, string]>).map(([value, label]) => (
              <label className="solar-toggle" key={value}>
                <input
                  checked={(settings.skyOverlay ?? 'daylight') === value}
                  name="sky-overlay"
                  onChange={() =>
                    updateSettings((current) => ({ ...current, skyOverlay: value }))
                  }
                  type="radio"
                />
                {label}
              </label>
            ))}
          </section>

          <section>
            <span className="solar-menu-heading">Bodies</span>
            <div className="solar-body-options">
              {BODY_NAMES.map((name) => (
                <label className="solar-toggle" key={name}>
                  <input
                    checked={settings.visibleBodies[name]}
                    onChange={(event) => setBodyVisible(name, event.target.checked)}
                    type="checkbox"
                  />
                  {name}
                </label>
              ))}
            </div>
          </section>

          <section>
            <span className="solar-menu-heading">Your location</span>
            <div className="solar-location-grid">
              <label>
                <span>Latitude</span>
                <input
                  inputMode="decimal"
                  max="90"
                  min="-90"
                  onChange={(event) =>
                    setLocationDraft((current) => ({
                      ...current,
                      latitude: event.target.value
                    }))
                  }
                  placeholder="41.8781"
                  step="any"
                  type="number"
                  value={locationDraft.latitude}
                />
              </label>
              <label>
                <span>Longitude</span>
                <input
                  inputMode="decimal"
                  max="180"
                  min="-180"
                  onChange={(event) =>
                    setLocationDraft((current) => ({
                      ...current,
                      longitude: event.target.value
                    }))
                  }
                  placeholder="-87.6298"
                  step="any"
                  type="number"
                  value={locationDraft.longitude}
                />
              </label>
            </div>
            <div className="solar-location-actions">
              <button onClick={useCurrentLocation} type="button">Use my location</button>
              <button onClick={applyLocationDraft} type="button">Apply coordinates</button>
              {settings.latitude !== null && settings.longitude !== null ? (
                <button className="subtle" onClick={clearLocation} type="button">Clear</button>
              ) : null}
            </div>
            {locationStatus ? <p className="solar-location-status">{locationStatus}</p> : null}
            <p className="solar-location-privacy">
              Coordinates are stored only in this URL. Sharing the URL shares the location.
            </p>
          </section>

          <section>
            <span className="solar-menu-heading">About this view</span>
            <p>
              A live, top-down view of the Sun, Moon, Earth, and the five planets visible without
              a telescope. Positions follow JPL’s approximate orbital model.
            </p>
            <p>
              Planet sizes and the Moon’s distance are enlarged for clarity. In Sun-centered
              mode, radial compression blends between shared-scale planetary distances and the
              more readable default spacing; body sizes remain illustrative at both ends.
            </p>
            <p>
              Earth-centered mode translates every position relative to Earth and compresses large
              distances so the visible planets remain inside the zodiac ring.
            </p>
            <p>
              With a location set, the sky overlay can show either the seasonal daylight window or
              the half of the ecliptic currently above your horizon. Current sky shifts from blue
              through violet, then shades the sky outside your view after dark. Its horizon may
              tilt relative to the polar Earth marker because Earth’s equator and the ecliptic are
              tilted relative to one another.
            </p>
            <p>
              The zodiac uses simplified bright-star figures at approximate ecliptic longitudes.
              In the Sagittarius-at-top view, Sagittarius is at the top; Earth-oriented views rotate
              the entire map. Each constellation’s north points outward.
            </p>
            <p>
              Earth is viewed from above the North Pole. Its land layer uses a polar
              projection, with the equator forming the outside edge of the globe.
              A unified snow-and-ice layer crossfades through 46 vector snapshots sampled
              every eight days from NOAA’s 2023 Northern Hemisphere analysis, including
              Greenland’s observed coverage.
            </p>
            <a
              className="solar-source"
              href="https://ssd.jpl.nasa.gov/planets/approx_pos.html"
              rel="noreferrer"
              target="_blank"
            >
              Position model: NASA/JPL ↗
            </a>
            <a
              className="solar-source"
              href="https://pwg.gsfc.nasa.gov/stargaze/Secliptc.htm"
              rel="noreferrer"
              target="_blank"
            >
              Zodiac and ecliptic: NASA/GSFC ↗
            </a>
            <a
              className="solar-source"
              href="https://github.com/ofrohn/d3-celestial"
              rel="noreferrer"
              target="_blank"
            >
              Constellation lines: d3-celestial ↗
            </a>
            <a
              className="solar-source"
              href="https://www.naturalearthdata.com/"
              rel="noreferrer"
              target="_blank"
            >
              Land shapes: Natural Earth ↗
            </a>
            <a
              className="solar-source"
              href="https://nsidc.org/data/g02156"
              rel="noreferrer"
              target="_blank"
            >
              Snow and ice coverage: NOAA IMS ↗
            </a>
          </section>
        </aside>
      ) : null}

      <svg
        aria-label="Current top-down view of the naked-eye solar system"
        className="solar-stage"
        role="img"
        viewBox="-35 -35 710 710"
      >
          <defs>
            <radialGradient id="sun-glow">
              <stop offset="0" stopColor="#fff7b2" />
              <stop offset="0.48" stopColor="#ffc928" />
              <stop offset="1" stopColor="#f07b16" />
            </radialGradient>
            <radialGradient
              cx={earth?.x ?? CENTER}
              cy={earth?.y ?? CENTER}
              gradientUnits="userSpaceOnUse"
              id="daylight-wedge-gradient"
              r={DAYLIGHT_WEDGE_RADIUS}
            >
              <stop offset="0" stopColor="#35a5ff" stopOpacity="0.36" />
              <stop offset="0.32" stopColor="#238be8" stopOpacity="0.21" />
              <stop offset="0.72" stopColor="#176cbd" stopOpacity="0.08" />
              <stop offset="1" stopColor="#0a3a73" stopOpacity="0" />
            </radialGradient>
            <radialGradient
              cx={earth?.x ?? CENTER}
              cy={earth?.y ?? CENTER}
              gradientUnits="userSpaceOnUse"
              id="current-sky-twilight-gradient"
              r={DAYLIGHT_WEDGE_RADIUS}
            >
              <stop offset="0" stopColor="#7569dc" stopOpacity="0.31" />
              <stop offset="0.42" stopColor="#584eaf" stopOpacity="0.18" />
              <stop offset="1" stopColor="#302b68" stopOpacity="0" />
            </radialGradient>
            <radialGradient
              cx={earth?.x ?? CENTER}
              cy={earth?.y ?? CENTER}
              gradientUnits="userSpaceOnUse"
              id="current-sky-night-gradient"
              r={DAYLIGHT_WEDGE_RADIUS}
            >
              <stop offset="0" stopColor="#343d82" stopOpacity="0.3" />
              <stop offset="0.55" stopColor="#252c66" stopOpacity="0.2" />
              <stop offset="1" stopColor="#171c48" stopOpacity="0.1" />
            </radialGradient>
            <clipPath id="earth-surface-clip">
              <circle cx="0" cy="0" r="1" />
            </clipPath>
          </defs>

        <rect x="-35" y="-35" width="710" height="710" fill="#000000" />
        {earth &&
        settings.visibleBodies.Earth &&
        (settings.skyOverlay ?? 'daylight') === 'daylight' &&
        projectedLocation &&
        daylightWedgePath &&
        centerProgress > 0 ? (
          <path
            aria-label={`Estimated daylight window: ${daylightHours.toFixed(1)} hours`}
            className="daylight-wedge"
            d={daylightWedgePath}
            data-daylight-hours={daylightHours.toFixed(2)}
            fill="url(#daylight-wedge-gradient)"
            opacity={centerProgress}
          >
            <title>{`Estimated daylight window at ${settings.latitude?.toFixed(2)}° latitude: ${daylightHours.toFixed(1)} hours`}</title>
          </path>
        ) : null}
        {earth &&
        settings.visibleBodies.Earth &&
        (settings.skyOverlay ?? 'daylight') === 'current' &&
        observerZenith &&
        currentSkyVisiblePath &&
        currentSkyHiddenPath &&
        centerProgress > 0 ? (
          <g
            aria-label={`Current sky; Sun altitude ${sunAltitude.toFixed(1)} degrees`}
            className="current-sky-overlay"
            data-sun-altitude={sunAltitude.toFixed(2)}
          >
            <path
              d={currentSkyVisiblePath}
              fill="url(#daylight-wedge-gradient)"
              opacity={centerProgress * (1 - nightBlend) * (1 - twilightBlend)}
            />
            <path
              d={currentSkyVisiblePath}
              fill="url(#current-sky-twilight-gradient)"
              opacity={centerProgress * (1 - nightBlend) * twilightBlend}
            />
            <path
              d={currentSkyHiddenPath}
              fill="url(#current-sky-night-gradient)"
              opacity={centerProgress * nightBlend}
            />
          </g>
        ) : null}
        {settings.showZodiac ? <ZodiacMap rotation={viewRotation} /> : null}
        {settings.showOrbits
          ? orbitPaths.map((orbit) => (
              <path
                key={orbit.name}
                className="orbit-line"
                d={orbit.path}
              />
            ))
          : null}

        {settings.showZodiac && settings.visibleBodies.Earth && earth ? (
          <line
            className="earth-alignment"
            x1={alignmentStart.x}
            y1={alignmentStart.y}
            x2={CENTER + Math.cos(alignmentAngle) * 346}
            y2={CENTER - Math.sin(alignmentAngle) * 346}
          />
        ) : null}

        <circle
          data-body="Sun"
          cx={sunPosition.x}
          cy={sunPosition.y}
          fill="url(#sun-glow)"
          r={sunRadius}
        />
        {settings.showLabels ? (
          <text
            className="sun-label"
            x={sunPosition.x}
            y={sunPosition.y + sunRadius + 19}
            textAnchor="middle"
          >
            Sun
          </text>
        ) : null}

        {planets
          .filter((planet) => settings.visibleBodies[planet.name])
          .map((planet) => (
            <Planet
              key={planet.name}
              planet={planet}
              showLabel={settings.showLabels}
              solarDeclination={solarDeclination}
              sunPosition={sunPosition}
              earthSurfaceRotation={earthSurfaceRotation}
              snowIce={snowIce}
              showNightShadow={settings.showNightShadow}
            />
          ))}

        {earth && settings.visibleBodies.Earth && projectedLocation ? (
          <g
            aria-label="Your location on Earth"
            className={`earth-location${projectedLocation.nearSide ? '' : ' far-side'}`}
            data-location-marker="true"
            transform={`translate(${locationX} ${locationY}) scale(${locationMarkerScale})`}
          >
            <title>
              {`Your location: ${settings.latitude?.toFixed(4)}°, ${settings.longitude?.toFixed(4)}°${
                projectedLocation.nearSide ? '' : ' (far side of Earth)'
              }`}
            </title>
            <circle className="earth-location-halo" cx="0" cy="0" r="3.1" />
            <circle className="earth-location-dot" cx="0" cy="0" r="1.35" />
          </g>
        ) : null}

        {earth && settings.visibleBodies.Moon ? (
          <g>
            {settings.showOrbits ? (
              <circle
                className="moon-orbit"
                cx={earth.x}
                cy={earth.y}
                r={moonOrbitRadius}
              />
            ) : null}
              <circle className="moon-dark" cx={moonX} cy={moonY} r={moonRadius} />
              <path
                className="moon-lit"
                d={`M ${moonX} ${moonY - moonRadius} A ${moonRadius} ${moonRadius} 0 0 1 ${moonX} ${moonY + moonRadius} L ${moonX} ${moonY - moonRadius} Z`}
                transform={`rotate(${moonLightAngle} ${moonX} ${moonY})`}
              />
              <circle className="moon-outline" cx={moonX} cy={moonY} r={moonRadius} />
            {settings.showLabels ? (
              <text className="moon-label" x={moonX + 6} y={moonY + 3}>
                Moon
              </text>
            ) : null}
          </g>
        ) : null}
      </svg>
    </div>
  );
}
