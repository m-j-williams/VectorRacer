'use client';

import { Check, RotateCcw, Shuffle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { flushSync } from 'react-dom';

type Suit = '♠' | '♥' | '♦' | '♣';
type Card = { rank: string; suit: Suit };
type BookAnalysis = { cards: Card[]; handEv: number; cribEv: number; netEv: number };
type VoteResults = { counts: Record<string, number>; total: number };

const suits: Suit[] = ['♠', '♥', '♦', '♣'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Average crib values from 3,003,700 simulated hands published by Cribbage 121.
// Rows and columns follow the rank order above. Suits are intentionally ignored in the crib estimate.
const ownCribValues = [
  [5.25,4.2,4.45,5.45,5.5,3.82,3.78,3.73,3.36,3.38,3.68,3.39,3.43],
  [4.2,5.68,6.95,4.53,5.49,3.9,3.85,3.62,3.65,3.53,3.8,3.55,3.57],
  [4.45,6.95,5.88,4.88,5.99,3.76,3.68,3.86,3.7,3.65,3.84,3.63,3.65],
  [5.45,4.53,4.88,5.64,6.57,3.89,3.74,3.9,3.71,3.61,3.88,3.61,3.62],
  [5.5,5.49,5.99,6.57,8.92,6.7,6.07,5.52,5.46,6.69,7.03,6.7,6.69],
  [3.82,3.9,3.76,3.89,6.7,5.76,4.98,4.74,5.14,3.15,3.38,3.13,3.13],
  [3.78,3.85,3.68,3.74,6.07,4.98,5.99,6.64,4.1,3.11,3.5,3.21,3.22],
  [3.73,3.62,3.86,3.9,5.52,4.74,6.64,5.46,4.79,3.89,3.43,3.22,3.24],
  [3.36,3.65,3.7,3.71,5.46,5.14,4.1,4.79,5.13,4.3,4.01,2.97,3.07],
  [3.38,3.53,3.65,3.61,6.69,3.15,3.11,3.89,4.3,4.7,4.63,3.38,2.85],
  [3.68,3.8,3.84,3.88,7.03,3.38,3.5,3.43,4.01,4.63,5.37,4.88,4.05],
  [3.39,3.55,3.63,3.61,6.7,3.13,3.21,3.22,2.97,3.38,4.88,4.69,3.5],
  [3.43,3.57,3.65,3.62,6.69,3.13,3.22,3.24,3.07,2.85,4.05,3.5,4.62]
];

const opponentCribValues = [
  [6.02,5.06,5.2,5.69,6.1,4.92,4.9,4.89,4.65,4.45,4.69,4.39,4.28],
  [5.06,6.46,7.36,5.44,6.11,5.12,5.12,5.02,4.8,4.64,4.86,4.57,4.49],
  [5.2,7.36,6.76,6.08,6.87,4.94,5.16,5.08,4.81,4.68,4.98,4.63,4.58],
  [5.69,5.44,6.08,6.58,7.59,5.47,4.84,5.03,4.74,4.53,4.78,4.48,4.41],
  [6.1,6.11,6.87,7.59,9.39,7.74,7.08,6.34,6.26,7.51,7.62,7.38,7.23],
  [4.92,5.12,4.94,5.47,7.74,7.23,6.56,5.99,6.3,4.37,4.6,4.27,4.21],
  [4.9,5.12,5.16,4.84,7.08,6.56,7.27,7.84,5.45,4.43,4.68,4.41,4.32],
  [4.89,5.02,5.08,5.03,6.34,5.99,7.84,6.77,5.97,5.03,4.6,4.34,4.26],
  [4.65,4.8,4.81,4.74,6.26,6.3,5.45,5.97,6.49,5.48,4.97,4.12,4.08],
  [4.45,4.64,4.68,4.53,7.51,4.37,4.43,5.03,5.48,6.01,5.58,4.62,3.95],
  [4.69,4.86,4.98,4.78,7.62,4.6,4.68,4.6,4.97,5.58,6.5,5.49,4.84],
  [4.39,4.57,4.63,4.48,7.38,4.27,4.41,4.34,4.12,4.62,5.49,5.84,4.5],
  [4.28,4.49,4.58,4.41,7.23,4.21,4.32,4.26,4.08,3.95,4.84,4.5,5.65]
];

function rankNumber(card: Card) {
  return ranks.indexOf(card.rank) + 1;
}

function fifteenValue(card: Card) {
  return Math.min(rankNumber(card), 10);
}

function scoreHand(kept: Card[], cut: Card, isCrib = false) {
  const cards = [...kept, cut];
  let score = 0;

  for (let mask = 1; mask < (1 << cards.length); mask += 1) {
    const sum = cards.reduce((total, card, index) => total + ((mask & (1 << index)) ? fifteenValue(card) : 0), 0);
    if (sum === 15) score += 2;
  }

  for (let first = 0; first < cards.length; first += 1) {
    for (let second = first + 1; second < cards.length; second += 1) {
      if (cards[first].rank === cards[second].rank) score += 2;
    }
  }

  const runLengths: number[] = [];
  for (let mask = 1; mask < (1 << cards.length); mask += 1) {
    const run = cards.filter((_, index) => mask & (1 << index)).map(rankNumber);
    if (run.length < 3 || new Set(run).size !== run.length) continue;
    const low = Math.min(...run);
    const high = Math.max(...run);
    if (high - low + 1 === run.length) runLengths.push(run.length);
  }
  const longestRun = Math.max(0, ...runLengths);
  score += runLengths.filter((length) => length === longestRun).reduce((total, length) => total + length, 0);

  if (kept.every((card) => card.suit === kept[0].suit)) {
    if (cut.suit === kept[0].suit) score += 5;
    else if (!isCrib) score += 4;
  }
  if (kept.some((card) => card.rank === 'J' && card.suit === cut.suit)) score += 1;

  return score;
}

function chooseOpponentDiscards(available: Card[], isYourCrib: boolean, rng: () => number) {
  const candidates: { cards: Card[]; weight: number }[] = [];
  let totalWeight = 0;

  available.forEach((first, firstIndex) => {
    available.slice(firstIndex + 1).forEach((second) => {
      const firstRank = ranks.indexOf(first.rank);
      const secondRank = ranks.indexOf(second.rank);
      const tableValue = (isYourCrib ? opponentCribValues : ownCribValues)[firstRank][secondRank];
      // A pone avoids productive crib combinations; a dealer favors them. The published
      // pair averages naturally make fives, pairs, 2-3, and 7-8 meaningfully non-uniform.
      const weight = Math.exp(isYourCrib ? -(tableValue - 4) * 0.9 : (tableValue - 4) * 0.5);
      totalWeight += weight;
      candidates.push({ cards: [first, second], weight });
    });
  });

  let target = rng() * totalWeight;
  for (const candidate of candidates) {
    target -= candidate.weight;
    if (target <= 0) return candidate.cards;
  }
  return candidates[candidates.length - 1].cards;
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function random(seed: number) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function cardLabel(card: Card) {
  return `${card.rank}${card.suit}`;
}

function CardMarks({ card }: { card: Card }) {
  return (
    <>
      <span className="card-corner card-corner-top">
        <strong>{card.rank}</strong>
        <span>{card.suit}</span>
      </span>
      <span className="card-suit" aria-hidden="true">{card.suit}</span>
      <span className="card-corner card-corner-bottom" aria-hidden="true">
        <strong>{card.rank}</strong>
        <span>{card.suit}</span>
      </span>
    </>
  );
}

function CardFace({ card, selected, tossed, cardRef, onClick }: { card: Card; selected: boolean; tossed: boolean; cardRef?: Ref<HTMLButtonElement>; onClick: () => void }) {
  const red = card.suit === '♥' || card.suit === '♦';
  return (
    <button
      type="button"
      className={`playing-card ${red ? 'red-card' : ''} ${selected ? 'selected-card' : ''} ${tossed ? 'tossed-card' : ''}`}
      ref={cardRef}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${card.rank} of ${card.suit}, ${selected ? 'selected' : 'not selected'}`}
    >
      <CardMarks card={card} />
      {selected && <span className="card-check"><Check size={14} strokeWidth={3} /></span>}
    </button>
  );
}

function TableCard({ card, faceDown = false }: { card?: Card; faceDown?: boolean }) {
  const isValidCard = card && ranks.includes(card.rank) && suits.includes(card.suit);
  if (faceDown || (card && !isValidCard)) return <span className="table-card card-back" aria-label="Hidden card" />;
  if (!card) return <span className="table-card table-card-empty" aria-label="Empty card slot">+</span>;
  const red = card.suit === '♥' || card.suit === '♦';
  return <span className={`table-card ${red ? 'red-card' : ''}`} aria-label={cardLabel(card)}><CardMarks card={card} /></span>;
}

function MiniCard({ card }: { card: Card }) {
  const red = card.suit === '♥' || card.suit === '♦';
  return <span className={`mini-card ${red ? 'red-card' : ''}`}>{cardLabel(card)}</span>;
}

export default function CribbageClient({ dailyKey, displayDate }: { dailyKey: string; displayDate: string }) {
  const [activeDay, setActiveDay] = useState({ key: dailyKey, label: displayDate });
  const challenge = useMemo(() => {
    const rng = random(hash(`next-move-${activeDay.key}`));
    const deck = suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })));
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(rng() * (index + 1));
      [deck[index], deck[swap]] = [deck[swap], deck[index]];
    }
    const hand = deck.slice(0, 6);
    const isYourCrib = rng() > 0.5;
    const cut = deck[6];
    const opponentDiscards = chooseOpponentDiscards(deck.slice(7), isYourCrib, rng);
    return { hand, isYourCrib, cut, opponentDiscards };
  }, [activeDay.key]);

  const [selected, setSelected] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [voteResults, setVoteResults] = useState<VoteResults>({ counts: {}, total: 0 });
  const [votesUnavailable, setVotesUnavailable] = useState(false);
  const handCardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tossTargetRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const keptAnimationsRef = useRef<Animation[]>([]);
  const voterIdRef = useRef<string | null>(null);
  const handKey = challenge.hand.map(cardLabel).join(',');
  const cribOwner = challenge.isYourCrib ? 'player' : 'opponent';

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ day: activeDay.key, hand: handKey, owner: cribOwner });
    fetch(`/api/cribbage/votes?${query}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load votes.');
        return response.json() as Promise<VoteResults>;
      })
      .then((data) => {
        if (!active) return;
        setVoteResults(data);
        setVotesUnavailable(false);
      })
      .catch(() => {
        if (active) setVotesUnavailable(true);
      });
    return () => { active = false; };
  }, [activeDay.key, cribOwner, handKey]);

  const allPairs = useMemo(() => {
    const pairs: Card[][] = [];
    challenge.hand.forEach((card, first) => {
      challenge.hand.slice(first + 1).forEach((other) => pairs.push([card, other]));
    });
    return pairs
      .map((cards) => ({ cards, weight: voteResults.counts[cards.map(cardLabel).sort().join('-')] ?? 0 }))
      .sort((a, b) => b.weight - a.weight);
  }, [challenge, voteResults.counts]);

  const bookAnalyses = useMemo<BookAnalysis[]>(() => {
    const known = new Set(challenge.hand.map(cardLabel));
    const possibleCuts = suits
      .flatMap((suit) => ranks.map((rank) => ({ rank, suit })))
      .filter((card) => !known.has(cardLabel(card)));

    return allPairs
      .map(({ cards }) => {
        const discards = new Set(cards.map(cardLabel));
        const kept = challenge.hand.filter((card) => !discards.has(cardLabel(card)));
        const handEv = possibleCuts.reduce((total, cut) => total + scoreHand(kept, cut), 0) / possibleCuts.length;
        const firstRank = ranks.indexOf(cards[0].rank);
        const secondRank = ranks.indexOf(cards[1].rank);
        const cribEv = (challenge.isYourCrib ? ownCribValues : opponentCribValues)[firstRank][secondRank];
        return {
          cards,
          handEv,
          cribEv,
          netEv: handEv + (challenge.isYourCrib ? cribEv : -cribEv)
        };
      })
      .sort((first, second) => second.netEv - first.netEv);
  }, [allPairs, challenge]);

  const bookAnalysis = bookAnalyses[0];
  const bookChoice = bookAnalysis.cards;
  const selectedCards = selected.map((index) => challenge.hand[index]);
  const selectedKey = selectedCards.map(cardLabel).sort().join('-');
  const selectedAnalysis = bookAnalyses.find((item) => item.cards.map(cardLabel).sort().join('-') === selectedKey);
  const keptCards = challenge.hand.filter((_, index) => !selected.includes(index));
  const actualHand = submitted ? scoreHand(keptCards, challenge.cut) : 0;
  const actualCrib = submitted
    ? scoreHand([...selectedCards, ...challenge.opponentDiscards], challenge.cut, true)
    : 0;
  const actualNet = actualHand + (challenge.isYourCrib ? actualCrib : -actualCrib);
  const matchesBook = submitted && selectedCards.every((card) => bookChoice.some((book) => cardLabel(book) === cardLabel(card)));
  const totalCommunityWeight = voteResults.total;
  const rankedResults = bookAnalyses.map((analysis) => {
    const discardLabels = new Set(analysis.cards.map(cardLabel));
    const kept = challenge.hand.filter((card) => !discardLabels.has(cardLabel(card)));
    const handValue = scoreHand(kept, challenge.cut);
    const cribValue = scoreHand([...analysis.cards, ...challenge.opponentDiscards], challenge.cut, true);
    const communityWeight = allPairs.find((item) => item.cards.every((card) => discardLabels.has(cardLabel(card))))?.weight ?? 0;
    return {
      ...analysis,
      percent: totalCommunityWeight > 0 ? Math.round((communityWeight / totalCommunityWeight) * 100) : 0,
      actual: handValue + (challenge.isYourCrib ? cribValue : -cribValue)
    };
  });
  const highestCommunityPercent = Math.max(1, ...rankedResults.map((result) => result.percent));

  const cribTable = (
    <div className={`crib-table ${submitted ? 'is-submitted' : ''} ${challenge.isYourCrib ? 'crib-table-yours' : 'crib-table-theirs'}`}>
      <div className="crib-table-label">
        <span>{challenge.isYourCrib ? 'Your crib' : 'Opponent’s crib'}</span>
        <small>{submitted ? `${actualCrib} points in this crib` : 'Waiting for your toss'}</small>
      </div>
      <div className="toss-group">
        <span>Your toss</span>
        <div>
          {[0, 1].map((slot) => (
            <span className="toss-card-target" key={slot} ref={(node) => { tossTargetRefs.current[slot] = node; }}>
              <TableCard card={selectedCards[slot]} />
            </span>
          ))}
        </div>
      </div>
      <div className="toss-group">
        <span>Opponent toss</span>
        <div>
          <TableCard card={submitted ? challenge.opponentDiscards[0] : undefined} faceDown={!submitted} />
          <TableCard card={submitted ? challenge.opponentDiscards[1] : undefined} faceDown={!submitted} />
        </div>
      </div>
      <div className="cut-group">
        <span>Cut card</span>
        <TableCard key={cardLabel(challenge.cut)} card={submitted ? challenge.cut : undefined} faceDown={!submitted} />
      </div>
    </div>
  );

  function toggleCard(index: number) {
    if (submitted) return;
    setSelected((current) => {
      if (current.includes(index)) return current.filter((value) => value !== index);
      if (current.length === 2) return [current[1], index];
      return [...current, index];
    });
  }

  function reset() {
    handCardRefs.current.forEach((card) => {
      if (card) {
        card.style.visibility = '';
        card.style.flex = '';
      }
    });
    keptAnimationsRef.current.forEach((animation) => animation.cancel());
    keptAnimationsRef.current = [];
    setSelected([]);
    setSubmitted(false);
    setIsLocking(false);
  }

  async function recordVote(discardKey: string) {
    try {
      if (!voterIdRef.current) voterIdRef.current = crypto.randomUUID();
      const voterId = voterIdRef.current;
      const response = await fetch('/api/cribbage/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: activeDay.key, handKey, cribOwner, discardKey, voterId })
      });
      if (!response.ok) throw new Error('Unable to save vote.');
      setVoteResults(await response.json() as VoteResults);
      setVotesUnavailable(false);
    } catch {
      setVotesUnavailable(true);
    }
  }

  async function lockInChoice() {
    if (selected.length !== 2 || isLocking) return;
    setIsLocking(true);
    void recordVote(selectedKey);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSubmitted(true);
      setIsLocking(false);
      return;
    }

    const keptCardElements = challenge.hand
      .map((_, index) => selected.includes(index) ? null : handCardRefs.current[index])
      .filter((card): card is HTMLButtonElement => Boolean(card));
    const keptBoxes = keptCardElements.map((card) => card.getBoundingClientRect());
    const rowBox = keptCardElements[0]?.parentElement?.getBoundingClientRect();
    const rowGap = keptCardElements[0]?.parentElement
      ? Number.parseFloat(getComputedStyle(keptCardElements[0].parentElement!).columnGap) || 0
      : 0;
    const keptWidth = keptBoxes.reduce((total, box) => total + box.width, 0) + rowGap * (keptBoxes.length - 1);
    const keptStart = rowBox ? rowBox.left + (rowBox.width - keptWidth) / 2 : keptBoxes[0]?.left ?? 0;
    let nextKeptLeft = keptStart;
    const keptMoves = keptCardElements.map((card, index) => {
      const box = keptBoxes[index];
      const moveX = nextKeptLeft - box.left;
      nextKeptLeft += box.width + rowGap;
      const baseTransform = getComputedStyle(card).transform;
      const animation = card.animate([
        { transform: baseTransform },
        { transform: `translate(${moveX}px, 0) ${baseTransform === 'none' ? '' : baseTransform}` }
      ], { duration: 620, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      keptAnimationsRef.current.push(animation);
      return animation.finished;
    });

    const flights = selected.map((handIndex, slot) => {
      const source = handCardRefs.current[handIndex];
      const target = tossTargetRefs.current[slot];
      if (!source || !target) return Promise.resolve();
      const sourceBox = source.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      const clone = source.cloneNode(true) as HTMLElement;
      clone.classList.add('flying-card');
      Object.assign(clone.style, {
        left: `${sourceBox.left}px`, top: `${sourceBox.top}px`,
        width: `${sourceBox.width}px`, height: `${sourceBox.height}px`
      });
      document.body.appendChild(clone);
      source.style.visibility = 'hidden';

      const moveX = targetBox.left + targetBox.width / 2 - (sourceBox.left + sourceBox.width / 2);
      const moveY = targetBox.top + targetBox.height / 2 - (sourceBox.top + sourceBox.height / 2);
      const scale = Math.min(targetBox.width / sourceBox.width, targetBox.height / sourceBox.height);
      const animation = clone.animate([
        { transform: 'translate(0, 0) scale(1) rotate(0deg)' },
        { transform: `translate(${moveX}px, ${moveY}px) scale(${scale}) rotate(${slot === 0 ? -2 : 2}deg)` }
      ], { duration: 620, delay: slot * 70, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      return animation.finished.finally(() => clone.remove());
    });

    await Promise.all([...flights, ...keptMoves]);

    flushSync(() => {
      setSubmitted(true);
      setIsLocking(false);
    });
  }

  function generateTestDay() {
    const start = Date.UTC(2020, 0, 1, 12);
    const span = Date.UTC(2035, 11, 31, 12) - start;
    const date = new Date(start + Math.floor(Math.random() * span));
    setActiveDay({
      key: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric'
      }).format(date)
    });
    reset();
  }

  return (
    <div className="cribbage-page">
      <header className="cribbage-header">
        <div>
          <span className="crib-kicker">{activeDay.key === dailyKey ? 'Daily hand' : 'Test hand'} · {activeDay.label}</span>
          <h1>Next move<span>— cribbage</span></h1>
          <p>Choose the two cards you’d send to the crib. Then see how your play stacks up.</p>
        </div>
        <div className="crib-header-actions">
          <button className="random-day-button" type="button" onClick={generateTestDay}>
            <Shuffle size={15} /> Random test day
          </button>
          <div className={`crib-owner ${challenge.isYourCrib ? 'your-crib' : 'their-crib'}`}>
            <span className="crib-owner-icon" aria-hidden="true">♣</span>
            <span>
              <small>The crib belongs to</small>
              <strong>{challenge.isYourCrib ? 'You' : 'Your opponent'}</strong>
            </span>
          </div>
        </div>
      </header>

      <main className="cribbage-game">
        <section className="hand-panel" aria-labelledby="hand-heading">
          <div className="hand-heading-row">
            <div>
              <span className="step-label">01 · Your hand</span>
              <h2 id="hand-heading">Pick two to toss</h2>
            </div>
            <span className="pick-count">{selected.length} of 2 selected</span>
          </div>

          {!challenge.isYourCrib && cribTable}

          <div className="card-row">
            {challenge.hand.map((card, index) => (
              <CardFace
                key={cardLabel(card)}
                card={card}
                selected={selected.includes(index)}
                tossed={submitted && selected.includes(index)}
                cardRef={(node) => { handCardRefs.current[index] = node; }}
                onClick={() => toggleCard(index)}
              />
            ))}
          </div>

          {challenge.isYourCrib && cribTable}

          <div className="crib-action-row">
            {!submitted ? (
              <button className="submit-pick" type="button" disabled={selected.length !== 2 || isLocking} onClick={lockInChoice}>
                {isLocking ? 'Sending to crib…' : 'Lock in my choice'} {!isLocking && <span>→</span>}
              </button>
            ) : (
              <button className="reset-pick" type="button" onClick={reset}><RotateCcw size={16} /> Try another</button>
            )}
          </div>
        </section>

        <aside className={`reveal-panel ${submitted ? 'is-revealed' : ''}`} aria-live="polite">
          {!submitted ? (
            <div className="locked-reveal">
              <span className="locked-suits">♠ <i>♥</i> ♣ <i>♦</i></span>
              <h2>Results are under the cut card.</h2>
              <p>Make your choice to reveal today’s community picks and the book play.</p>
            </div>
          ) : (
            <>
              <div className="results-heading">
                <span className="step-label">02 · The reveal</span>
                <h2>Every possible toss</h2>
                <p>
                  Ranked by expected value · {votesUnavailable
                    ? 'community votes unavailable'
                    : `${voteResults.total} community ${voteResults.total === 1 ? 'pick' : 'picks'}`}
                </p>
              </div>
              <div className="your-choice-summary">
                <span>Your choice</span>
                <span className="your-choice-cards"><MiniCard card={selectedCards[0]} /><MiniCard card={selectedCards[1]} /></span>
                <div className="choice-values">
                  <strong>Expected {selectedAnalysis?.netEv.toFixed(2)}</strong>
                  <small>Actual {actualNet} · {actualHand} hand {challenge.isYourCrib ? '+' : '−'} {actualCrib} crib</small>
                </div>
              </div>
              <div className="result-list">
                {rankedResults.map((result, index) => {
                  const isYours = selectedCards.every((card) => result.cards.some((choice) => cardLabel(choice) === cardLabel(card)));
                  return (
                    <div className="result-item" key={result.cards.map(cardLabel).join('-')}>
                      <div className="result-meta">
                        <span className="result-rank">{index + 1}</span>
                        <span className="result-cards"><MiniCard card={result.cards[0]} /><MiniCard card={result.cards[1]} /></span>
                        <span className="result-stats">
                          <small>EV {result.netEv.toFixed(2)} · Actual {result.actual}</small>
                          <strong>{result.percent}%</strong>
                        </span>
                      </div>
                      <div className="result-track"><span style={{ width: `${(result.percent / highestCommunityPercent) * 100}%` }} /></div>
                      {isYours && <span className="your-pick-tag">Your pick</span>}
                    </div>
                  );
                })}
              </div>

              <div className="book-choice">
                <div className="book-icon" aria-hidden="true">♟</div>
                <div className="book-copy">
                  <span>The book choice</span>
                  <div><MiniCard card={bookChoice[0]} /><MiniCard card={bookChoice[1]} /></div>
                  <p>
                    {bookAnalysis.handEv.toFixed(2)} hand EV {challenge.isYourCrib ? '+' : '−'} {bookAnalysis.cribEv.toFixed(2)} crib EV
                    {' '}= {bookAnalysis.netEv.toFixed(2)} net points.
                  </p>
                </div>
                <strong className={matchesBook ? 'book-match' : ''}>{matchesBook ? 'You found it' : 'Expert play'}</strong>
              </div>
            </>
          )}
        </aside>
      </main>

      <footer className="cribbage-footer">
        <span>One hand every day.</span>
        <span>Come back tomorrow for a fresh deal.</span>
      </footer>
    </div>
  );
}
