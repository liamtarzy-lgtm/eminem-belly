import { GameLayout } from "@/app/_components/games/GameLayout";
import { GuessTheSong } from "@/app/_components/games/GuessTheSong";

export const metadata = { title: "Guess the Song in 2 Seconds — Eminem Belly" };

export default function GuessTheSongPage() {
  return (
    <GameLayout title="Guess the Song">
      <GuessTheSong />
    </GameLayout>
  );
}
