// src/components/MenuGrid.jsx
import { useCart } from "../store/cartStore";
import ItemCard from "./ItemCard";

export default function MenuGrid({ items, onQuickAdd, onOpen }) {
  const add = useCart((s) => s.add);

  const handleQuickAdd = onQuickAdd ?? ((prod, selectedMods) => add(prod, selectedMods));

  return (
    <section className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 bg-[radial-gradient(140%_80%_at_50%_0%,rgba(201,26,77,0.12),transparent_55%)]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pb-16">
        <div className="grid gap-3 sm:gap-4 md:gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--card-min,170px)),1fr))] [--card-min:170px] sm:[--card-min:200px] md:[--card-min:220px] lg:[--card-min:240px]">
        {items.map((p) => (
        <ItemCard
              key={p.id || p.name}
  item={p}
              onQuickAdd={handleQuickAdd}
  onOpen={onOpen}
/>
        ))}
      </div>
    </div>
    </section>
  );
}
