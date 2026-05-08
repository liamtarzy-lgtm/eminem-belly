import { GameLayout } from "@/app/_components/games/GameLayout";
import { GuessTheSong } from "@/app/_components/games/GuessTheSong";
import { getGameSongs, getCatalogForDistractors } from "@/lib/games/queries";

export const metadata = { title: "Guess the Song in 2 Seconds — Eminem Belly" };
export const dynamic = "force-dynamic";

export default async function GuessTheSongPage() {
  const [pool, catalog] = await Promise.all([
    getGameSongs(),
    getCatalogForDistractors(),
  ]);

  return (
    <GameLayout title="Guess the Song">
      <GuessTheSong pool={pool} catalog={catalog} />
    </GameLayout>
  );
}
