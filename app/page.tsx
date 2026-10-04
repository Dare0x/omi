import Link from "next/link";
import LiveGauge from "@/components/LiveGauge";
import PlaceSearch from "@/components/PlaceSearch";
import { PeaksChart, ReplayChart, fmt, fmtDayYear } from "@/components/Charts";
import { HOME_SITE } from "@/lib/featured";
import { savedReport, savedSites } from "@/lib/snapshot";

export default function Home() {
  const r = savedReport(HOME_SITE);
  if (!r) {
    return (
      <main className="problem">
        <p>The saved river data is missing. Run npm run snapshot.</p>
      </main>
    );
  }
  const paidRows = r.backtest.rows.filter((y) => y.paid);
  const y2022 = r.backtest.rows.find((y) => y.year === 2022);
  const replay2022 = r.replays.find((p) => p.year === 2022);
  const daysEarly = y2022?.floodDate ? Math.round((Date.parse(y2022.peakDate) - Date.parse(y2022.floodDate)) / 86_400_000) : null;
  const perYear = r.backtest.fairPremiumShare;

  return (
    <main>
      <section className="hero">
        <p className="kicker">Open flood-fund protocol · USDC on Arc · any river on Earth</p>
        <h1>Flood money that arrives before the water does.</h1>
        <p className="lede">
          Donors fill a fund for a river town. When the forecast shows the river reaching its flood level, every registered household gets{" "}
          {r.rules.earlyShareBps / 100}% of its cover in USDC. When the river has stayed over that level for {r.rules.consecutiveDays} days,
          the rest follows. No claim forms, no assessors, nobody in between who can sit on the money.
        </p>
        <p className="lede">
          It works for any river on Earth: OMI sets each river&apos;s flood level from decades of its own record, and anyone can open a fund for
          their river in one step.
        </p>
        <PlaceSearch />
      </section>

      <section className="section" aria-labelledby="live">
        <div className="section-head">
          <h2 id="live">Case study: the river at Lokoja, right now</h2>
          <p>
            Lokoja is where the Niger and the Benue meet. Every number below comes from GloFAS, the global flood model the UN and the Red
            Cross use, and is checked against levels set from this river&apos;s own history.
          </p>
        </div>
        <LiveGauge
          initial={r}
          place={
            <>
              <b>Lokoja, Kogi State, Nigeria</b> <span className="faint">· {r.site.river}</span>
            </>
          }
        />
      </section>

      {y2022 && replay2022 && (
        <section className="section" aria-labelledby="replay">
          <div className="section-head">
            <h2 id="replay">2022, replayed</h2>
            <p>
              The 2022 floods killed 662 people in Nigeria and displaced 2.4 million, the worst since 2012. Run against that year&apos;s river,
              OMI&apos;s rules would have raised the warning on {fmtDayYear(y2022.warnDate!)} and paid every household in full on{" "}
              {fmtDayYear(y2022.floodDate!)}
              {daysEarly !== null && daysEarly > 0 ? `, ${daysEarly} days before the river peaked` : ""}. Aid usually arrives weeks after.
            </p>
          </div>
          <ReplayChart replay={replay2022} row={y2022} floodLevel={r.floodLevel} warnLevel={r.warnLevel} />
          <p className="small faint">
            The early payout depends on the forecast, and archived GloFAS forecasts aren&apos;t public, so this replay shows only the warning
            level and the full payout, which come from the river&apos;s recorded flow.
          </p>
        </section>
      )}

      <section className="section" aria-labelledby="years">
        <div className="section-head">
          <h2 id="years">
            Every year since {r.history.firstYear}: it would have paid {paidRows.length} times
          </h2>
          <p>
            The flood level is the flow this river reaches about once every {r.rules.floodReturnYears} years, worked out from {r.history.years}{" "}
            years of its own record. Nobody told the rules which years were bad. They picked out{" "}
            {paidRows.map((y) => y.year).join(", ").replace(/, ([^,]*)$/, " and $1")}, and 2012 and 2022 are Nigeria&apos;s two worst flood
            years in living memory.
          </p>
        </div>
        <PeaksChart rows={r.backtest.rows} floodLevel={r.floodLevel} />
        <p className="muted">
          Paying out {paidRows.length} times in {r.backtest.years} years means a fair yearly cost of about{" "}
          <span className="num">{(perYear * 100).toFixed(1)}%</span> of the cover. Covering one household for $100 costs a donor about{" "}
          <span className="num">${fmt(perYear * 100)}</span> a year.
        </p>
      </section>

      <section className="section" aria-labelledby="any">
        <div className="section-head">
          <h2 id="any">Other rivers, other continents</h2>
          <p>
            The same rules, run on rivers far from Lokoja. Each one gets its own flood level from its own record, its own replay of every past
            year and today&apos;s forecast. Type any town in the box at the top to add another.
          </p>
        </div>
        <div className="places">
          {savedSites().map((s) => (
            <Link
              key={s.site.slug}
              href={`/river?lat=${s.site.lat}&lon=${s.site.lon}&name=${encodeURIComponent(`${s.site.name}, ${s.site.country}`)}`}
            >
              <span>
                {s.site.name}, {s.site.country}
              </span>
              <span className="faint">
                {s.site.river} · flood level {fmt(s.floodLevel)} m³/s · would have paid {s.backtest.events}× in {s.backtest.years} years
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="rules">
        <div className="section-head">
          <h2 id="rules">The rules, in full</h2>
          <p>Fixed in the contract before the season starts. Nobody can change them halfway, including us.</p>
        </div>
        <ul className="rules">
          <li>
            <b>Flood level</b>
            <span>The flow this spot of river reaches about once in {r.rules.floodReturnYears} years, from its own record.</span>
          </li>
          <li>
            <b>Early payout</b>
            <span>
              {r.rules.earlyShareBps / 100}% of the cover, once, when the forecast median reaches the flood level within{" "}
              {r.rules.earlyLeadDays} days.
            </span>
          </li>
          <li>
            <b>Full payout</b>
            <span>The rest of the cover, once, when the river has been at or above the flood level {r.rules.consecutiveDays} days in a row.</span>
          </li>
          <li>
            <b>Who gets paid</b>
            <span>Households registered before the season starts. Nobody can be added once a flood is forecast.</span>
          </li>
          <li>
            <b>Every reading waits</b>
            <span>Each daily reading waits an hour before it can move money, and a guardian can stop one that doesn&apos;t match the source data.</span>
          </li>
          <li>
            <b>Where money can go</b>
            <span>Only to the households of the site it was given to. The contract has no withdraw function.</span>
          </li>
        </ul>
        <p>
          <Link href="/docs">How to check every number yourself →</Link>
        </p>
      </section>
    </main>
  );
}
