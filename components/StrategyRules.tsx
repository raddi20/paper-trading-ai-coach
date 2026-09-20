import { FILL_MODEL_DOC, STRATEGY_RULES } from "@/lib/constants";

export function StrategyRules({ compact = false }: { compact?: boolean }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">
        Strategy rules (always visible)
      </p>
      <h2 className="mt-2 text-lg font-semibold">{STRATEGY_RULES.name}</h2>
      <p className="mt-1 text-sm leading-6 text-mute">{STRATEGY_RULES.summary}</p>
      <div className={`mt-4 grid gap-4 ${compact ? "" : "md:grid-cols-2"}`}>
        <RuleList title="Buy (long only)" items={STRATEGY_RULES.entries} />
        <RuleList title="Sell" items={STRATEGY_RULES.exits} />
      </div>
      <p className="mt-4 text-sm leading-6 text-mute">{STRATEGY_RULES.sizing}</p>
      {!compact ? (
        <div className="mt-4 rounded-xl border border-border bg-card-2 p-4">
          <p className="text-sm font-medium">{FILL_MODEL_DOC.title}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-mute">
            {FILL_MODEL_DOC.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function RuleList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-mute">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
