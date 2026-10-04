import Link from "next/link";
import { RULES } from "@/lib/river";

export const metadata = { title: "OMI — rules and docs" };

export default function DocsPage() {
  return (
    <main className="prose">
      <p className="kicker">Rules & docs</p>
      <h1 style={{ maxWidth: "20ch" }}>How OMI decides, and how to check it.</h1>
      <p className="lede">
        OMI is an open protocol for flood funds. Anyone can open a fund for a stretch of river, register the households it protects, and anyone
        can put money in. The money pays out by a rule fixed before the season, using public river data. This page gives every rule and every way
        to check it.
      </p>

      <h2>The rules</h2>
      <ul>
        <li>
          <b>Flood level.</b> The river flow a place reaches about once in {RULES.floodReturnYears} years. It is fitted to the highest daily flow
          in each year of that river&apos;s record (a Gumbel distribution, method of moments, the standard first-pass flood-frequency method).
        </li>
        <li>
          <b>Warning level.</b> The once-in-{RULES.warnReturnYears}-years flow. It is shown to households and moves no money.
        </li>
        <li>
          <b>Early payout.</b> {RULES.earlyShareBps / 100}% of each household&apos;s cover, once per season, when the median of the GloFAS ensemble
          forecast reaches the flood level within {RULES.earlyLeadDays} days. This is the money that arrives before the water.
        </li>
        <li>
          <b>Full payout.</b> The rest of the cover, once per season, when the river has been at or above the flood level {RULES.consecutiveDays}{" "}
          days in a row. One bad reading can&apos;t trigger it.
        </li>
        <li>
          <b>Households.</b> Registered by the fund&apos;s manager before the season starts, up to 500 per fund. Once the season starts nobody can
          be added or removed, so nobody can join after a flood is forecast.
        </li>
        <li>
          <b>Short of money.</b> If a fund holds less than it owes, every household gets an equal share of what it holds.
        </li>
        <li>
          <b>Where money can go.</b> Only to the households of the fund it was given to. The contract has no withdraw function, for anyone.
          Money left at the end of a season stays with the fund for its next season.
        </li>
      </ul>

      <h2>Where the river data comes from</h2>
      <p>
        GloFAS, the Global Flood Awareness System run by the EU&apos;s Copernicus Emergency Management Service, models daily river flow on a 0.05°
        grid (about 5 km) worldwide, with a historical record and a 50-member ensemble forecast. OMI reads it through Open-Meteo&apos;s free flood
        API, with no key. Licence: CC BY 4.0.
      </p>
      <p>
        A point you type rarely sits exactly on the main channel; the cell next to it can be a side stream carrying a hundredth of the water. OMI
        searches a 5 × 5 block of cells around the point (about 10 km either way) and keeps the one carrying the most water over the last 60 days.
        The report says how far it moved your point.
      </p>

      <h2>How the money moves</h2>
      <ul>
        <li>
          The <b>reporter</b> posts one reading per fund per day: yesterday&apos;s flow, the 15-day forecast high, and the keccak256 fingerprint of the
          exact data it used. The raw data is saved in the repository under <code>data/readings/</code>, so anyone can recompute the fingerprint.
        </li>
        <li>
          Every reading <b>waits one hour</b> before it can move money. In that hour the <b>guardian</b> can stop it if the numbers don&apos;t match
          the source. The guardian can only stop readings; it can&apos;t move money or change a fund.
        </li>
        <li>
          After the hour, <b>anyone</b> can settle readings, in the order they were posted. Settling applies the rules and, if one is met, pays every
          household of that fund in the same transaction. Nobody has to file a claim.
        </li>
      </ul>

      <h2>Check it yourself</h2>
      <ul>
        <li>
          Any river, as JSON: <code>GET /api/river?lat=7.8&amp;lon=6.74</code>. Snapped cell, flood and warning levels, every past year replayed,
          today&apos;s status, 30-day forecast. No key, open to other sites.
        </li>
        <li>
          Every fund, as JSON: <code>GET /api/fund</code>. Funds, households, balances, readings, payouts, read live from Arc.
        </li>
        <li>
          Re-run any place from the code: <code>npm run backtest -- 7.8 6.74</code>
        </li>
        <li>
          Tests: <code>npm test</code> runs the river engine tests and the contract tests on a local chain.
        </li>
      </ul>

      <h2>Open a fund for your river</h2>
      <p>
        Search a town on <Link href="/river">Any river</Link>, check its report, then use <b>Open a fund for this river</b> at the bottom. Your wallet
        becomes the fund&apos;s manager. Register the households before the season starts, put money in, and share the fund&apos;s page with donors.
        The daily reporter picks up every open fund automatically.
      </p>

      <h2>What OMI can&apos;t do yet</h2>
      <ul>
        <li>
          <b>One reporter.</b> Today one key posts the readings, checked by the one-hour window and the guardian. The next step is several independent
          reporters that must agree before a reading counts.
        </li>
        <li>
          <b>Model data, not gauges.</b> GloFAS is a model. Where a river gauge exists, a fund should check its levels against the gauge record too.
        </li>
        <li>
          <b>Short records.</b> Some places have under 30 years of history, so their once-in-10-years level carries real uncertainty. The report shows
          how many years it used.
        </li>
        <li>
          <b>Households need a wallet.</b> Payouts land in a USDC wallet. Turning that into cash locally needs a mobile-money or exchange partner.
        </li>
        <li>
          <b>Not insurance.</b> OMI is a donor-funded early-cash fund, the model aid agencies call anticipatory action. Selling cover for a price would
          need an insurance licence where the households live.
        </li>
      </ul>
    </main>
  );
}
