'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Gauge, Pause, Play, RotateCcw, Snowflake, SunMedium, Waves } from 'lucide-react';
import northernLandRings from '@/data/northern-land-rings.json';
import snowIceData from '@/data/snow-ice-frames.json';

type GeoCoordinate = [number, number];

const DEG = Math.PI / 180;
const SIGMA = 5.670374419e-8;
const LAND_PATH = (northernLandRings as GeoCoordinate[][]).map((ring) =>
  `${ring.map(([longitude, latitude], index) => {
    const radius = latitude >= 0 ? Math.cos(latitude * DEG) : 1 - Math.sin(latitude * DEG);
    return `${index ? 'L' : 'M'}${(radius * Math.cos(longitude * DEG)).toFixed(4)} ${(-radius * Math.sin(longitude * DEG)).toFixed(4)}`;
  }).join(' ')} Z`
).join(' ');

const ICE_FRAMES = (snowIceData as { frames: string[] }).frames;

function iceFrame(dayOfYear: number) {
  const position = (dayOfYear / 365) * ICE_FRAMES.length;
  return ICE_FRAMES[Math.floor(position) % ICE_FRAMES.length];
}

const BASE_CO2 = 280;

function co2Forcing(co2: number) {
  // Myhre et al. logarithmic approximation, relative to preindustrial CO₂.
  return 5.35 * Math.log(co2 / BASE_CO2);
}

function equilibriumTemperature(solar: number, albedo: number, co2: number, emissivity: number) {
  const absorbed = solar * (1 - albedo) / 4;
  return Math.pow((absorbed + co2Forcing(co2)) / (SIGMA * (1 - emissivity / 2)), 0.25);
}

function Arrow({ x1, y1, x2, y2, kind, delay = 0, flux, maxFlux }: {
  x1: number; y1: number; x2: number; y2: number; kind: 'solar' | 'heat' | 'reflected'; delay?: number; flux: number; maxFlux: number;
}) {
  const strength = Math.max(0.12, Math.min(1, flux / maxFlux));
  return <line className={`climate-ray ${kind}`} style={{ animationDelay: `${delay}s`, opacity: strength, strokeWidth: 2.5 + strength * 4.5 }} x1={x1} y1={y1} x2={x2} y2={y2} />;
}

export function ClimateModel() {
  const [solar, setSolar] = useState(1361);
  const [albedo, setAlbedo] = useState(0.12);
  const [co2, setCo2] = useState(420);
  const [cloudCover, setCloudCover] = useState(0.67);
  const [waterVapor, setWaterVapor] = useState(1);
  const [temperature, setTemperature] = useState(288);
  const [playing, setPlaying] = useState(true);
  const [iceFeedback, setIceFeedback] = useState(true);
  const [showBudget, setShowBudget] = useState(true);
  const [dayOfYear, setDayOfYear] = useState(79);
  const [flowRate, setFlowRate] = useState(5);
  const [earthRotation, setEarthRotation] = useState(0);
  // Northern snow/ice peaks in boreal winter. Temperature changes its extent around
  // that seasonal cycle; the toggle disables only the temperature feedback.
  const seasonalIce = 0.5 + 0.5 * Math.cos(2 * Math.PI * (dayOfYear - 15) / 365);
  const seasonalIceAlbedo = 0.012 + seasonalIce * 0.018;
  const temperatureIceAlbedo = iceFeedback
    ? Math.max(-0.018, Math.min(0.2, (288 - temperature) * 0.006))
    : 0;
  const iceAlbedo = Math.max(0, seasonalIceAlbedo + temperatureIceAlbedo);
  const effectiveAlbedo = Math.min(0.68, Math.max(0.08,
    albedo + 0.03 + cloudCover * 0.18 + iceAlbedo
  ));
  const atmosphericEmissivity = Math.min(0.94, Math.max(0.2,
    0.35 + waterVapor * 0.3 + cloudCover * 0.194
  ));
  const target = equilibriumTemperature(solar, effectiveAlbedo, co2, atmosphericEmissivity);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      // A 90-day mixed-layer response time, advanced in simulated days.
      setTemperature((value) => value + (target - value) * dt * flowRate / 90);
      setDayOfYear((value) => (value + dt * flowRate) % 365);
      // Deliberately exaggerated and independent of the calendar: 12° CCW per real second.
      setEarthRotation((value) => (value + dt * 12) % 360);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [flowRate, playing, target]);

  const absorbed = solar * (1 - effectiveAlbedo) / 4;
  const incomingSolar = solar / 4;
  const surfaceEmission = SIGMA * Math.pow(temperature, 4);
  const outgoing = surfaceEmission * (1 - atmosphericEmissivity / 2) - co2Forcing(co2);
  const reflected = incomingSolar * effectiveAlbedo;
  const atmosphericShortwaveFraction = Math.min(0.42,
    0.12 + waterVapor * 0.072 + cloudCover * 0.055
  );
  const atmosphericAbsorption = incomingSolar * atmosphericShortwaveFraction;
  const surfaceAbsorption = Math.max(0, incomingSolar - reflected - atmosphericAbsorption);
  const backRadiation = surfaceEmission * atmosphericEmissivity / 2 + co2Forcing(co2);
  const imbalance = absorbed - outgoing;
  const atmosphereColor = `rgba(97, 186, 224, ${0.12 + atmosphericEmissivity * .25})`;
  const rays = useMemo(() => [-66, -22, 22, 66], []);
  const declination = 23.44 * Math.sin(2 * Math.PI * (dayOfYear - 80) / 365);
  const terminatorRadius = Math.max(0.002, Math.abs(Math.sin(declination * DEG)));
  const terminatorSweep = declination < 0 ? 1 : 0;
  const shadowPath = `M0 -1 A${terminatorRadius} 1 0 0 ${terminatorSweep} 0 1 A1 1 0 0 0 0 -1 Z`;
  const calendarDate = new Date(Date.UTC(2025, 0, 1 + Math.floor(dayOfYear)));
  const dateLabel = calendarDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });

  function reset() {
    setSolar(1361); setAlbedo(0.12); setCo2(420); setCloudCover(0.67); setWaterVapor(1); setTemperature(288);
    setPlaying(true); setIceFeedback(true); setDayOfYear(79); setFlowRate(5); setEarthRotation(0);
  }

  return (
    <div className="climate-tool">
      <header className="climate-heading">
        <div>
          <span className="climate-kicker">One-dimensional climate lab</span>
          <h1>Earth’s energy balance</h1>
          <p>Follow energy into and out of a single, globally averaged column of the climate system.</p>
        </div>
      </header>

      <div className="climate-layout">
        <section className="climate-stage-card" aria-label="Animated global energy model">
          {showBudget ? <div className="budget-card">
            <span>Global energy budget</span>
            <div className="budget-incoming"><label>Incoming sunlight</label><strong>{incomingSolar.toFixed(0)}</strong><small>W/m²</small></div>
            <div><label>Reflected</label><strong>{reflected.toFixed(0)}</strong><small>W/m²</small></div>
            <div><label>Surface absorption</label><strong>{surfaceAbsorption.toFixed(0)}</strong><small>W/m²</small></div>
            <div><label>Atmospheric absorption</label><strong>{atmosphericAbsorption.toFixed(0)}</strong><small>W/m²</small></div>
            <div><label>Outgoing blackbody</label><strong>{outgoing.toFixed(0)}</strong><small>W/m²</small></div>
          </div> : null}
          <svg className="climate-stage" viewBox="0 0 900 650" role="img" aria-label="Sunlight enters from the left; Earth emits heat through a simplified atmosphere">
            <defs>
              <clipPath id="climate-earth-clip"><circle cx="0" cy="0" r="1" /></clipPath>
              <radialGradient id="earth-ocean"><stop offset="0" stopColor="#4fb6e9"/><stop offset="1" stopColor="#176395"/></radialGradient>
              <filter id="earth-glow"><feGaussianBlur stdDeviation="8"/></filter>
            </defs>
            <rect width="900" height="650" fill="#071521" />
            <circle cx="500" cy="325" r="190" fill={atmosphereColor} stroke="#77caeb" strokeOpacity=".45" strokeWidth="2" />
            <circle cx="500" cy="325" r="150" fill="none" stroke="#7ad1ef" strokeDasharray="5 9" strokeOpacity=".28" />
            <text className="atmosphere-label" x="500" y="105" textAnchor="middle">ONE-LAYER ATMOSPHERE</text>

            {rays.map((offset, i) => <Arrow key={offset} x1={30} y1={325 + offset} x2={365} y2={325 + offset} kind="solar" flux={solar / 4} maxFlux={375} delay={i * .25} />)}
            <Arrow x1={345} y1={255} x2={120} y2={130} kind="reflected" flux={reflected} maxFlux={160} delay={.4} />
            <Arrow x1={356} y1={370} x2={135} y2={490} kind="reflected" flux={reflected} maxFlux={160} delay={1.1} />

            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
              const a = angle * DEG;
              return <Arrow key={angle} x1={500 + Math.cos(a) * 126} y1={325 + Math.sin(a) * 126} x2={500 + Math.cos(a) * 285} y2={325 + Math.sin(a) * 285} kind="heat" flux={outgoing} maxFlux={300} delay={i * .16} />;
            })}
            {[35, 145, 215, 325].map((angle, i) => {
              const a = angle * DEG;
              return <Arrow key={angle} x1={500 + Math.cos(a) * 182} y1={325 + Math.sin(a) * 182} x2={500 + Math.cos(a) * 132} y2={325 + Math.sin(a) * 132} kind="heat" flux={backRadiation} maxFlux={200} delay={i * .3 + .2} />;
            })}

            <circle cx="500" cy="325" r="132" fill="#3fa9de" opacity=".3" filter="url(#earth-glow)" />
            <g transform="translate(500 325) scale(125)">
              <circle r="1" fill="url(#earth-ocean)" />
              <g clipPath="url(#climate-earth-clip)" transform={`rotate(${-earthRotation})`}>
                <path d={LAND_PATH} fill="#3d7f55" fillRule="evenodd" />
                <path
                  d={iceFrame(dayOfYear)}
                  fill="#e5f7fb"
                  fillOpacity={Math.max(.35, Math.min(.98, .68 + (288 - temperature) * .025))}
                  fillRule="evenodd"
                />
                <g fill="none" stroke="#f4fbff" strokeLinecap="round" strokeWidth=".075" opacity={cloudCover * .82}>
                  <path d="M-.82 -.15 A.834 .834 0 0 1 -.25 -.795" strokeDasharray=".24 .1 .12 .09" />
                  <path d="M.2 -.82 A.844 .844 0 0 1 .82 -.2" strokeDasharray=".16 .09 .27 .1" />
                  <path d="M.82 .2 A.844 .844 0 0 1 .2 .82" strokeDasharray=".26 .11 .13 .08" />
                  <path d="M-.25 .8 A.838 .838 0 0 1 -.82 .15" strokeDasharray=".14 .08 .24 .1" />
                </g>
              </g>
              <path d={shadowPath} fill="#02070c" fillOpacity=".7" />
              <circle r="1" fill="none" stroke="#9ee1ff" strokeWidth=".012" />
            </g>
            <text className="ray-label solar-copy" x="74" y="230">incoming sunlight · {(solar / 4).toFixed(0)} W/m²</text>
            <text className="ray-label reflected-copy" x="103" y="112">reflected · {reflected.toFixed(0)} W/m²</text>
            <text className="ray-label heat-copy" x="704" y="112">heat to space · {outgoing.toFixed(0)} W/m²</text>
            <text className="ray-label heat-copy" x="558" y="520">back-radiation · {backRadiation.toFixed(0)} W/m²</text>
          </svg>
          <div className="stage-readouts">
            <div className="temperature-readout"><span>Global surface</span><strong>{(temperature - 273.15).toFixed(1)}°C</strong><small>moving toward {(target - 273.15).toFixed(1)}°C</small></div>
            <div className={`climate-status ${Math.abs(imbalance) < 1 ? 'balanced' : ''}`}>
              <span>{Math.abs(imbalance) < 1 ? 'Near equilibrium' : imbalance > 0 ? 'Earth is warming' : 'Earth is cooling'}</span>
              <strong>{imbalance > 0 ? '+' : ''}{imbalance.toFixed(1)} W/m²</strong>
            </div>
          </div>
          <button className="play-button" onClick={() => setPlaying((v) => !v)} aria-label={playing ? 'Pause model' : 'Run model'}>{playing ? <Pause /> : <Play />}</button>
        </section>

        <aside className="climate-controls">
          <div className="control-heading"><div><span>Model controls</span><h2>Change the climate</h2></div><button onClick={reset} title="Reset model"><RotateCcw size={18}/></button></div>
          <label className="climate-slider"><span><SunMedium size={18}/> Solar intensity <output>{solar} W/m²</output></span><input type="range" min="1100" max="1500" step="1" value={solar} onChange={(e) => setSolar(+e.target.value)} /><small>fainter Sun <i/> brighter Sun</small></label>
          <label className="climate-slider"><span><Waves size={18}/> Surface reflectivity <output>{Math.round(albedo * 100)}%</output></span><input type="range" min="0.04" max="0.35" step="0.01" value={albedo} onChange={(e) => setAlbedo(+e.target.value)} /><small>dark ocean <i/> bright surface</small></label>
          <label className="climate-slider"><span><span className="cloud-icon">☁</span> Cloud cover <output>{Math.round(cloudCover * 100)}%</output></span><input type="range" min="0" max="1" step="0.01" value={cloudCover} onChange={(e) => setCloudCover(+e.target.value)} /><small>clear sky <i/> overcast</small></label>
          <label className="climate-slider greenhouse"><span><span className="vapor-icon">H₂O</span> Water vapor <output>{Math.round(waterVapor * 100)}% modern</output></span><input type="range" min="0" max="2" step="0.02" value={waterVapor} onChange={(e) => setWaterVapor(+e.target.value)} /><small>dry atmosphere <i/> humid atmosphere</small></label>
          <label className="climate-slider greenhouse"><span><span className="gas-icon">CO₂</span> CO₂ concentration <output>{co2} ppm</output></span><input type="range" min="180" max="1200" step="5" value={co2} onChange={(e) => setCo2(+e.target.value)} /><small>glacial atmosphere <i/> high CO₂</small></label>
          <label className="climate-slider"><span><CalendarDays size={18}/> Time of year <output>{dateLabel}</output></span><input type="range" min="0" max="364" step="1" value={dayOfYear} onChange={(e) => setDayOfYear(+e.target.value)} /><small>January <i/> December</small></label>
          <label className="climate-slider"><span><Gauge size={18}/> Time flow rate <output>{flowRate < 1 ? flowRate.toFixed(1) : flowRate.toFixed(0)} days/s</output></span><input type="range" min="0" max="100" step="1" value={(Math.log10(flowRate) + 1) / (Math.log10(60) + 1) * 100} onChange={(e) => setFlowRate(Math.pow(10, -1 + (+e.target.value / 100) * (Math.log10(60) + 1)))} /><small>0.1 day/s <i/> 60 days/s</small></label>
          <div className="climate-switches">
            <label><span><Snowflake size={18}/><span><strong>Ice–albedo feedback</strong><small>Season sets ice; temperature expands or retreats it</small></span></span><input type="checkbox" checked={iceFeedback} onChange={(e) => setIceFeedback(e.target.checked)}/></label>
            <label><span><span className="budget-icon">±</span><span><strong>Energy budget</strong><small>Show top-of-atmosphere fluxes</small></span></span><input type="checkbox" checked={showBudget} onChange={(e) => setShowBudget(e.target.checked)}/></label>
          </div>
          <div className="model-note"><strong>What this model assumes</strong><p>Clouds cool by reflecting sunlight and warm by absorbing infrared. Water vapor absorbs both sunlight and infrared. These effects are compressed into one global grey layer—not a weather or forecasting model.</p></div>
        </aside>
      </div>
    </div>
  );
}
