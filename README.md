# OMI — flood money that arrives before the water does

OMI is an open protocol for flood funds on [Arc](https://arc.io), Circle's stablecoin chain. Anyone can open a fund for a stretch of river,
register the households it protects, and anyone can put USDC in. The money pays out by a rule fixed before the season, using public river data:

- **30% of each household's cover** when the GloFAS ensemble forecast median reaches the river's flood level within 15 days,
- **the rest** when the river has stayed at or above the flood level for 2 days in a row.

No claim forms, no assessors, nobody in between who can sit on the money. The contract has no withdraw function, for anyone: money can only go
to the households of the fund it was given to.

*Omi* means water in Yoruba.

## Why

In 2022 Nigeria's floods killed 662 people and displaced 2.4 million (NEMA). Relief usually arrives weeks after the water. Replayed against the
river's recorded flow at Lokoja, where the Niger and the Benue meet, OMI's rules raise the warning on **14 Sep 2022** and pay every household in
full on **23 Sep 2022**, six days before the river peaked on 29 Sep.

Nobody told the rules which years were bad. Over the 29 years on record at Lokoja they fire in **1999, 2012 and 2022**, and 2012 and 2022 are
Nigeria's two worst flood years in living memory. Three payouts in 29 years means covering a household for $100 costs a donor about $10 a year.

## How it works

1. **Any river on Earth.** Type a town. OMI moves the point onto the main channel nearby (the GloFAS cell carrying the most water within about
   10 km), fits the river's annual peaks with a Gumbel distribution, and sets the **flood level** (once in 10 years) and **warning level** (once in 5).
2. **Backtest.** Every past year is replayed against the rules, giving the years it would have paid, the warning lead time and the fair yearly cost.
3. **Open a fund.** From the river's report, any wallet can open a fund with those levels and becomes its manager. Households are registered before
   the season; once it starts nobody can be added, so nobody can join after a flood is forecast.
4. **Daily readings.** A reporter posts each fund's flow and forecast high with the keccak256 fingerprint of the exact source data. Each reading waits
   one hour; a guardian can veto it if it doesn't match the source.
5. **Settlement.** After the hour, anyone can settle readings in order. If a rule is met, every household is paid in the same transaction.

Every number comes from deterministic code. No AI model produces or changes any level, status or payout.

## Live

| | |
|---|---|
| App | https://omi-one-lac.vercel.app |
| Contract, Arc testnet | see `deployments/arc-testnet.json` |
| Contract, Arc mainnet | see `deployments/arc-mainnet.json` |
| River API | `GET /api/river?lat=7.8&lon=6.74` |
| Fund API | `GET /api/fund` |

## Run it

```bash
npm install
npm test            # river engine tests + contract tests on a local chain
npm run dev         # http://localhost:3000
npm run backtest -- 7.8 6.74   # full report for any latitude/longitude
```

Deploying (needs `.env` with `DEPLOYER_KEY` and `GUARDIAN_ADDRESS`; see `.env.example`):

```bash
npm run deploy -- arc-testnet
npm run sites -- arc-testnet 1 3      # opens Lokoja + the 2022 replay site: 1 USDC cover, 3 USDC each
npm run report -- arc-testnet         # daily: post readings for every open fund, settle ready ones
npm run replay -- arc-testnet post    # testnet only: replay 12–24 Sep 2022 through the contract
npm run replay -- arc-testnet settle  # an hour later
```

## Layout

- `lib/river.ts` — the river engine: snapping, return levels, backtest, live status, forecast
- `contracts/OmiFund.sol` — the protocol: open funds, households, readings, challenge window, payouts
- `scripts/` — tests, compile, deploy, reporter, replay, snapshot
- `app/` — the website and the public APIs
- `data/featured.json` — saved reports for the featured rivers, so pages open instantly

## Limits

- **One reporter today**, checked by the one-hour window and the guardian. Next: several independent reporters that must agree.
- **Model data, not gauges.** GloFAS is a model; where a gauge exists, check levels against it.
- **Short records** at some places make the once-in-10-years level uncertain; the report shows the years used.
- **Households need a USDC wallet**; cashing out locally needs a mobile-money partner.
- **Not insurance.** OMI is a donor-funded early-cash fund (what aid agencies call anticipatory action).

## Data and licence

River data: GloFAS river discharge, Copernicus Emergency Management Service, CC BY 4.0, via [Open-Meteo](https://open-meteo.com/en/docs/flood-api).
Code: MIT.
