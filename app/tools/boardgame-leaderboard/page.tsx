import { Trophy } from 'lucide-react';
import BoardgameLanding from './BoardgameLanding';

export const metadata = { title: 'Boardgame Leaderboard' };

export default function BoardgameLeaderboardPage() {
  return (
    <div className="bgl-landing">
      <div className="bgl-landing-icon"><Trophy size={34} /></div>
      <span className="eyebrow">Boardgame leaderboard</span>
      <h1>Who actually rules game night?</h1>
      <p>Keep match history and Elo ratings for your group. No account required—the private group link is the key.</p>
      <BoardgameLanding />
    </div>
  );
}
