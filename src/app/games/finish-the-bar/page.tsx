import { GameLayout } from "@/app/_components/games/GameLayout";
import { FinishTheBar } from "@/app/_components/games/FinishTheBar";

export const metadata = { title: "Finish the Bar — Eminem Belly" };

export default function FinishTheBarPage() {
  return (
    <GameLayout title="Finish the Bar">
      <FinishTheBar />
    </GameLayout>
  );
}
