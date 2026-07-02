import BoardgameGroupClient from './BoardgameGroupClient';

export const metadata = { title: 'Boardgame Leaderboard' };

export default async function BoardgameGroupPage({ params }: { params: Promise<{ accessKey: string }> }) {
  const { accessKey } = await params;
  return <BoardgameGroupClient accessKey={accessKey} />;
}
