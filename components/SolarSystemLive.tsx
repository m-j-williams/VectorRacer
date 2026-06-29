'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';

type PlanetName = 'Mercury' | 'Venus' | 'Earth' | 'Mars' | 'Jupiter' | 'Saturn';
type BodyName = PlanetName | 'Moon';
type Orientation = 'calendar' | 'earth-top' | 'earth-bottom' | 'location-top';

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
  x: number;
  y: number;
};

type ZodiacConstellation = {
  name: string;
  month: string;
  points: Array<[number, number]>;
  lines: number[][];
};

const CENTER = 320;
const DEG = Math.PI / 180;
const BODY_NAMES: BodyName[] = ['Mercury', 'Venus', 'Earth', 'Moon', 'Mars', 'Jupiter', 'Saturn'];

type ViewSettings = {
  orientation: Orientation;
  showLabels: boolean;
  showOrbits: boolean;
  showZodiac: boolean;
  visibleBodies: Record<BodyName, boolean>;
  latitude: number | null;
  longitude: number | null;
};

const DEFAULT_SETTINGS: ViewSettings = {
  orientation: 'calendar',
  showLabels: true,
  showOrbits: true,
  showZodiac: true,
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

  return {
    orientation,
    showLabels: params.get('labels') !== '0',
    showOrbits: params.get('orbits') !== '0',
    showZodiac: params.get('zodiac') !== '0',
    visibleBodies,
    latitude,
    longitude
  };
}

function writeSettings(settings: ViewSettings) {
  const url = new URL(window.location.href);

  if (settings.orientation === 'calendar') url.searchParams.delete('orientation');
  else url.searchParams.set('orientation', settings.orientation);

  if (settings.showLabels) url.searchParams.delete('labels');
  else url.searchParams.set('labels', '0');

  if (settings.showOrbits) url.searchParams.delete('orbits');
  else url.searchParams.set('orbits', '0');

  if (settings.showZodiac) url.searchParams.delete('zodiac');
  else url.searchParams.set('zodiac', '0');

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
  if (orientation === 'earth-top') return Math.PI / 2 - earthAngle;
  if (orientation === 'earth-bottom') return -Math.PI / 2 - earthAngle;
  if (orientation === 'location-top' && locationAngle !== null) return Math.PI / 2 - locationAngle;
  return 0;
}

function shortestAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function projectEarthLocation(latitude: number, longitude: number, date: Date, rotation: number) {
  const julianDate = date.getTime() / 86400000 + 2440587.5;
  const centuries = (julianDate - 2451545) / 36525;
  const greenwichSiderealDegrees =
    280.46061837 +
    360.98564736629 * (julianDate - 2451545) +
    0.000387933 * centuries * centuries -
    (centuries * centuries * centuries) / 38710000;
  const latitudeRadians = latitude * DEG;
  const localSiderealAngle = (greenwichSiderealDegrees + longitude) * DEG;
  const equatorialX = Math.cos(latitudeRadians) * Math.cos(localSiderealAngle);
  const equatorialY = Math.cos(latitudeRadians) * Math.sin(localSiderealAngle);
  const equatorialZ = Math.sin(latitudeRadians);
  const obliquity = 23.43928 * DEG;
  const eclipticX = equatorialX;
  const eclipticY = Math.cos(obliquity) * equatorialY + Math.sin(obliquity) * equatorialZ;
  const eclipticZ = -Math.sin(obliquity) * equatorialY + Math.cos(obliquity) * equatorialZ;

  return {
    x: eclipticX * Math.cos(rotation) - eclipticY * Math.sin(rotation),
    y: eclipticX * Math.sin(rotation) + eclipticY * Math.cos(rotation),
    nearSide: eclipticZ >= 0
  };
}

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
    size: 12
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
    size: 10
  }
];

// Compact, classroom-friendly asterisms arranged as a 12-month seasonal ring.
const ZODIAC: ZodiacConstellation[] = [
  {
    name: 'Sagittarius',
    month: 'DEC',
    points: [[-17, -7], [-9, -12], [1, -8], [12, -13], [8, -3], [18, 3], [7, 5], [3, 14], [-8, 10], [-12, 1]],
    lines: [[0, 1, 2, 4, 6, 8, 9, 0], [2, 3], [4, 5], [6, 7]]
  },
  {
    name: 'Capricorn',
    month: 'JAN',
    points: [[-17, -8], [-7, -3], [0, 11], [7, 3], [17, -9], [4, -5]],
    lines: [[0, 1, 2, 3, 4, 5, 0]]
  },
  {
    name: 'Aquarius',
    month: 'FEB',
    points: [[-18, -9], [-10, -13], [-3, -7], [5, -12], [13, -6], [18, 2], [8, 5], [2, 13], [-8, 8], [-15, 14]],
    lines: [[0, 1, 2, 3, 4, 5, 6, 7], [6, 8, 9]]
  },
  {
    name: 'Pisces',
    month: 'MAR',
    points: [[-18, -8], [-13, -14], [-7, -9], [-10, -2], [0, 2], [10, 7], [15, 13], [19, 7], [14, 1], [8, 5]],
    lines: [[0, 1, 2, 3, 0], [3, 4, 9], [9, 5, 6, 7, 8, 5]]
  },
  {
    name: 'Aries',
    month: 'APR',
    points: [[-17, 9], [-8, 3], [1, -2], [9, -11], [17, -8]],
    lines: [[0, 1, 2, 3, 4]]
  },
  {
    name: 'Taurus',
    month: 'MAY',
    points: [[-18, -13], [-8, -5], [0, 2], [9, -5], [18, -13], [0, 13], [-9, 8], [10, 8]],
    lines: [[0, 1, 2, 3, 4], [2, 5], [5, 6], [5, 7]]
  },
  {
    name: 'Gemini',
    month: 'JUN',
    points: [[-10, -15], [8, -14], [-8, -4], [7, -3], [-13, 7], [12, 8], [-16, 15], [15, 16]],
    lines: [[0, 2, 4, 6], [1, 3, 5, 7], [2, 3], [4, 5]]
  },
  {
    name: 'Cancer',
    month: 'JUL',
    points: [[0, -16], [0, -4], [-13, 5], [-18, 14], [11, 5], [17, 14]],
    lines: [[0, 1, 2, 3], [1, 4, 5]]
  },
  {
    name: 'Leo',
    month: 'AUG',
    points: [[-17, 10], [-9, 3], [-13, -6], [-7, -14], [0, -7], [3, 3], [14, 8], [18, -3]],
    lines: [[0, 1, 2, 3, 4, 5, 0], [5, 6, 7]]
  },
  {
    name: 'Virgo',
    month: 'SEP',
    points: [[-17, -9], [-7, -5], [0, 2], [10, -8], [17, -3], [8, 6], [14, 15], [-2, 13], [-12, 8]],
    lines: [[0, 1, 2, 3, 4], [2, 5, 6], [5, 7, 8, 1]]
  },
  {
    name: 'Libra',
    month: 'OCT',
    points: [[-14, -10], [11, -11], [17, 5], [2, 14], [-16, 6], [0, 1]],
    lines: [[0, 1, 2, 3, 4, 0], [0, 5, 2]]
  },
  {
    name: 'Scorpius',
    month: 'NOV',
    points: [[-16, -12], [-10, -5], [-3, -9], [2, -2], [4, 7], [10, 13], [17, 9], [14, 2]],
    lines: [[0, 1, 2, 3, 4, 5, 6, 7]]
  }
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

function positionPlanet(planet: OrbitalElements, date: Date): PlanetPosition {
  const julianDate = date.getTime() / 86400000 + 2440587.5;
  const centuries = (julianDate - 2451545) / 36525;
  const semiMajorAxis = valueAt(planet.a, centuries);
  const eccentricity = valueAt(planet.e, centuries);
  const inclination = valueAt(planet.inclination, centuries) * DEG;
  const longitude = valueAt(planet.longitude, centuries);
  const perihelion = valueAt(planet.perihelion, centuries);
  const node = valueAt(planet.node, centuries) * DEG;
  const argumentOfPerihelion = (perihelion - valueAt(planet.node, centuries)) * DEG;
  const meanAnomaly = ((((longitude - perihelion) % 360) + 540) % 360 - 180) * DEG;
  const eccentricAnomaly = solveEccentricAnomaly(meanAnomaly, eccentricity);
  const orbitalX = semiMajorAxis * (Math.cos(eccentricAnomaly) - eccentricity);
  const orbitalY =
    semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(eccentricAnomaly);
  const cosW = Math.cos(argumentOfPerihelion);
  const sinW = Math.sin(argumentOfPerihelion);
  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  const cosInclination = Math.cos(inclination);
  const eclipticX =
    (cosW * cosNode - sinW * sinNode * cosInclination) * orbitalX +
    (-sinW * cosNode - cosW * sinNode * cosInclination) * orbitalY;
  const eclipticY =
    (cosW * sinNode + sinW * cosNode * cosInclination) * orbitalX +
    (-sinW * sinNode + cosW * cosNode * cosInclination) * orbitalY;
  const angle = Math.atan2(eclipticY, eclipticX);

  return {
    ...planet,
    angle,
    distance: Math.hypot(orbitalX, orbitalY),
    x: CENTER + Math.cos(angle) * planet.displayRadius,
    y: CENTER - Math.sin(angle) * planet.displayRadius
  };
}

function Planet({ planet, showLabel }: { planet: PlanetPosition; showLabel: boolean }) {
  const labelOnLeft = planet.x < CENTER || planet.x > 550;
  const labelX = planet.x + (labelOnLeft ? -11 : 11);
  const labelAnchor = labelOnLeft ? 'end' : 'start';
  const lightAngle = Math.atan2(CENTER - planet.y, CENTER - planet.x) / DEG;

  return (
    <g className="solar-planet">
      <title>{`${planet.name}: ${planet.distance.toFixed(2)} AU from the Sun`}</title>
      {planet.name === 'Saturn' ? (
        <ellipse
          className="saturn-ring"
          cx={planet.x}
          cy={planet.y}
          rx={planet.size + 8}
          ry={planet.size * 0.48}
          transform={`rotate(-18 ${planet.x} ${planet.y})`}
        />
      ) : null}
      {planet.name === 'Earth' ? (
        <g>
          <circle data-body="Earth" className="earth-dark" cx={planet.x} cy={planet.y} r={planet.size} />
          <path
            className="earth-lit"
            d={`M ${planet.x} ${planet.y - planet.size} A ${planet.size} ${planet.size} 0 0 1 ${planet.x} ${planet.y + planet.size} L ${planet.x} ${planet.y - planet.size} Z`}
            transform={`rotate(${lightAngle} ${planet.x} ${planet.y})`}
          />
          <circle className="earth-outline" cx={planet.x} cy={planet.y} r={planet.size} />
        </g>
      ) : (
        <circle data-body={planet.name} cx={planet.x} cy={planet.y} fill={planet.color} r={planet.size} />
      )}
      {planet.name === 'Jupiter' ? (
        <path
          className="jupiter-band"
          d={`M ${planet.x - 10} ${planet.y + 2} Q ${planet.x} ${planet.y + 5} ${planet.x + 10} ${planet.y + 2}`}
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
        const angleDegrees = 90 + index * 30 + rotation / DEG;
        const angle = angleDegrees * DEG;
        const mapRadius = 325;
        const labelRadius = 292;
        const x = CENTER + Math.cos(angle) * mapRadius;
        const y = CENTER - Math.sin(angle) * mapRadius;
        const labelX = CENTER + Math.cos(angle) * labelRadius;
        const labelY = CENTER - Math.sin(angle) * labelRadius;

        return (
          <g key={constellation.name}>
            <g transform={`translate(${x} ${y}) rotate(${90 - angleDegrees})`}>
              {constellation.lines.map((line, lineIndex) => (
                <polyline
                  key={lineIndex}
                  className="zodiac-line"
                  points={line.map((pointIndex) => constellation.points[pointIndex].join(',')).join(' ')}
                />
              ))}
              {constellation.points.map(([pointX, pointY], pointIndex) => (
                <circle
                  key={pointIndex}
                  className="zodiac-star"
                  cx={pointX}
                  cy={pointY}
                  r={pointIndex === 0 ? 1.45 : 1}
                />
              ))}
            </g>
            <text className="zodiac-label" x={labelX} y={labelY - 2} textAnchor="middle">
              {constellation.name}
            </text>
            <text className="zodiac-month" x={labelX} y={labelY + 7} textAnchor="middle">
              {constellation.month}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function SolarSystemLive() {
  const [now, setNow] = useState<Date | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settings, setSettings] = useState<ViewSettings>(DEFAULT_SETTINGS);
  const [animatedRotation, setAnimatedRotation] = useState(0);
  const [rotationAnimating, setRotationAnimating] = useState(false);
  const [locationDraft, setLocationDraft] = useState({ latitude: '', longitude: '' });
  const [locationStatus, setLocationStatus] = useState('');
  const rotationFrame = useRef<number | null>(null);

  useEffect(() => {
    const readUrl = () => {
      const next = readSettings(window.location.search);
      setSettings(next);
      setLocationDraft({
        latitude: next.latitude === null ? '' : String(next.latitude),
        longitude: next.longitude === null ? '' : String(next.longitude)
      });
    };
    const start = window.setTimeout(() => {
      readUrl();
      setNow(new Date());
    }, 0);
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    window.addEventListener('popstate', readUrl);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
      window.removeEventListener('popstate', readUrl);
      if (rotationFrame.current !== null) window.cancelAnimationFrame(rotationFrame.current);
    };
  }, []);

  function updateSettings(update: (current: ViewSettings) => ViewSettings) {
    setSettings((current) => {
      const next = update(current);
      writeSettings(next);
      return next;
    });
  }

  function setBodyVisible(name: BodyName, visible: boolean) {
    updateSettings((current) => ({
      ...current,
      visibleBodies: { ...current.visibleBodies, [name]: visible }
    }));
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
  const planets = naturalPlanets.map((planet) => {
    const angle = planet.angle + viewRotation;
    return {
      ...planet,
      angle,
      x: CENTER + Math.cos(angle) * planet.displayRadius,
      y: CENTER - Math.sin(angle) * planet.displayRadius
    };
  });
  const earth = planets.find((planet) => planet.name === 'Earth');
  const daysSinceJ2000 = now ? now.getTime() / 86400000 + 2440587.5 - 2451545 : 0;
  const moonAngle = ((218.316 + 13.176396 * daysSinceJ2000) % 360) * DEG + viewRotation;
  const moonX = earth ? earth.x + Math.cos(moonAngle) * 18 : 0;
  const moonY = earth ? earth.y - Math.sin(moonAngle) * 18 : 0;
  const moonLightAngle = Math.atan2(CENTER - moonY, CENTER - moonX) / DEG;
  const moonRadius = 3.6;
  const projectedLocation =
    now && settings.latitude !== null && settings.longitude !== null
      ? projectEarthLocation(settings.latitude, settings.longitude, now, viewRotation)
      : null;
  const locationX = earth && projectedLocation ? earth.x + projectedLocation.x * earth.size : 0;
  const locationY = earth && projectedLocation ? earth.y - projectedLocation.y * earth.size : 0;

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
            <span className="solar-menu-heading">Current time</span>
            <time dateTime={now.toISOString()}>
              {now.toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'medium'
              })}
            </time>
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
              December at top
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
              Earth at bottom
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
              Planet sizes, orbit spacing, and the Moon’s distance are enlarged for clarity. This
              is a positional diagram, not a scale model.
            </p>
            <p>
              The zodiac is a stylized, evenly spaced seasonal ring. In the December-at-top view,
              Sagittarius is at the top; Earth-oriented views rotate the entire map. Each
              constellation’s north points outward.
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
          </defs>

        <rect x="-35" y="-35" width="710" height="710" fill="#000000" />
        {settings.showZodiac ? <ZodiacMap rotation={viewRotation} /> : null}
        {settings.showOrbits
          ? PLANETS.map((planet) => (
              <circle
                key={planet.name}
                className="orbit-line"
                cx={CENTER}
                cy={CENTER}
                r={planet.displayRadius}
              />
            ))
          : null}

        {settings.showZodiac && settings.visibleBodies.Earth && earth ? (
          <line
            className="earth-alignment"
            x1={CENTER}
            y1={CENTER}
            x2={CENTER + Math.cos(earth.angle) * 346}
            y2={CENTER - Math.sin(earth.angle) * 346}
          />
        ) : null}

        <circle cx={CENTER} cy={CENTER} fill="url(#sun-glow)" r="15" />
        {settings.showLabels ? (
          <text className="sun-label" x={CENTER} y={CENTER + 34} textAnchor="middle">
            Sun
          </text>
        ) : null}

        {planets
          .filter((planet) => settings.visibleBodies[planet.name])
          .map((planet) => (
            <Planet key={planet.name} planet={planet} showLabel={settings.showLabels} />
          ))}

        {earth && settings.visibleBodies.Earth && projectedLocation ? (
          <g
            aria-label="Your location on Earth"
            className={`earth-location${projectedLocation.nearSide ? '' : ' far-side'}`}
            data-location-marker="true"
          >
            <title>
              {`Your location: ${settings.latitude?.toFixed(4)}°, ${settings.longitude?.toFixed(4)}°${
                projectedLocation.nearSide ? '' : ' (far side of Earth)'
              }`}
            </title>
            <circle className="earth-location-halo" cx={locationX} cy={locationY} r="3.1" />
            <circle className="earth-location-dot" cx={locationX} cy={locationY} r="1.35" />
          </g>
        ) : null}

        {earth && settings.visibleBodies.Moon ? (
          <g>
            {settings.showOrbits ? (
              <circle className="moon-orbit" cx={earth.x} cy={earth.y} r="18" />
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
