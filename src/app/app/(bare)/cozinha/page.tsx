import { requirePage } from "@/lib/auth";
import { KitchenDisplay } from "./kitchen-display";
import { getKitchenOrdersAction } from "./actions";

export const metadata = { title: "Cozinha" };

export default async function KitchenPage() {
  await requirePage("kitchen.view", "cozinha");
  const res = await getKitchenOrdersAction();
  return <KitchenDisplay initial={res.ok ? (res.data ?? []) : []} />;
}
