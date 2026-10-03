// Contract tests on a local chain (ganache). Run: npm run test:contract
import test from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import { BrowserProvider, ContractFactory, ZeroAddress, keccak256, parseUnits, toUtf8Bytes } from "ethers";
import { compile } from "./compile.mjs";

const artifacts = compile();
const usdc = (v) => parseUnits(String(v), 6);
const HOUR = 3600;
const DAY = 86_400;
const TX = { gasLimit: 3_000_000 };
const FLOOD = 26_538;
const WARN = 24_092;
const src = keccak256(toUtf8Bytes("open-meteo glofas response"));

async function reverts(p, name) {
  await assert.rejects(p, (e) => {
    assert.equal(e.revert?.name, name, `expected ${name}, got ${e.revert?.name ?? e.shortMessage}`);
    return true;
  });
}

async function setup(t, opts = {}) {
  const engine = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 1337, hardfork: "shanghai" },
    wallet: { totalAccounts: 10 },
  });
  const provider = new BrowserProvider(engine);
  t.after(async () => {
    provider.destroy();
    await engine.disconnect();
  });
  const s = await Promise.all([...Array(10).keys()].map((i) => provider.getSigner(i)));
  const [manager, reporter, guardian, donor, outsider, ...people] = s;
  const deploy = async (name, signer, ...args) => {
    const a = artifacts[name];
    const c = await new ContractFactory(a.abi, a.bytecode, signer).deploy(...args);
    await c.waitForDeployment();
    return c;
  };
  const token = await deploy("MockUSDC", donor);
  const fund = await deploy("OmiFund", manager, await token.getAddress(), await manager.getAddress(), await reporter.getAddress(), await guardian.getAddress(), HOUR);
  const now = async () => (await provider.getBlock("latest")).timestamp;
  const warp = async (secs) => {
    await provider.send("evm_increaseTime", [secs]);
    await provider.send("evm_mine", []);
  };
  const start = (await now()) + 600;
  const end = start + 120 * DAY;
  const cover = usdc(opts.cover ?? 100);
  await (await fund.connect(manager).addSite("Lokoja", 76750, 66750, FLOOD, WARN, start, end, cover, 3000, 2)).wait();
  const homes = people.slice(0, opts.households ?? 3);
  const homeAddrs = await Promise.all(homes.map((h) => h.getAddress()));
  await (await fund.connect(manager).addHouseholds(0, homeAddrs)).wait();
  await (await token.connect(donor).mint(await donor.getAddress(), usdc(10_000))).wait();
  await (await token.connect(donor).approve(await fund.getAddress(), usdc(10_000))).wait();
  if ((opts.fund ?? 300) > 0) await (await fund.connect(donor).fund(0, usdc(opts.fund ?? 300))).wait();
  const day0 = Math.floor(start / DAY) + 1;
  const as = (who) => fund.connect(who);
  const bal = async (addr) => await token.balanceOf(addr);
  // Post one reading and settle it after the challenge window.
  const step = async (day, observed, forecast) => {
    const id = Number(await fund.readingCount());
    await (await as(reporter).postReading(0, day, observed, forecast, src)).wait();
    await warp(HOUR + 1);
    await (await as(outsider).settle(id, TX)).wait();
    return id;
  };
  return { provider, fund, token, manager, reporter, guardian, donor, outsider, homes, homeAddrs, warp, now, start, end, day0, as, bal, step };
}

test("nothing can be posted before the season, and households freeze when it starts", async (t) => {
  const c = await setup(t);
  await reverts(c.as(c.reporter).postReading.staticCall(0, c.day0, 1, 1, src), "OutOfSeason");
  await c.warp(700);
  await reverts(c.as(c.manager).addHouseholds.staticCall(0, [await c.outsider.getAddress()]), "SeasonUnderway");
  await reverts(c.as(c.manager).removeHousehold.staticCall(0, c.homeAddrs[0]), "SeasonUnderway");
});

test("only the right roles can act", async (t) => {
  const c = await setup(t);
  await reverts(c.as(c.outsider).addSite.staticCall("x", 0, 0, 10, 5, (await c.now()) + 100, (await c.now()) + 200, 1, 0, 1), "NotManager");
  await c.warp(700);
  await reverts(c.as(c.outsider).postReading.staticCall(0, c.day0, 1, 1, src), "NotReporter");
  await (await c.as(c.reporter).postReading(0, c.day0, 1, 1, src)).wait();
  await reverts(c.as(c.outsider).veto.staticCall(0), "NotGuardian");
});

test("a normal river pays nothing", async (t) => {
  const c = await setup(t);
  await c.warp(700);
  await c.step(c.day0, 11_500, 12_000);
  await c.step(c.day0 + 1, WARN + 10, FLOOD - 1);
  const s = await c.fund.site(0);
  assert.equal(s.balance, usdc(300));
  assert.equal(s.earlyPaid, false);
  assert.equal(await c.fund.totalPaid(), 0n);
});

test("forecast trigger pays the early share once, then two days above the flood level pay the rest", async (t) => {
  const c = await setup(t);
  await c.warp(700);
  await c.step(c.day0, 20_000, FLOOD + 500); // forecast median reaches the flood level
  for (const h of c.homeAddrs) assert.equal(await c.bal(h), usdc(30));
  await c.step(c.day0 + 1, 22_000, FLOOD + 900); // no second early payout
  for (const h of c.homeAddrs) assert.equal(await c.bal(h), usdc(30));
  await c.step(c.day0 + 2, FLOOD + 1, FLOOD + 900); // streak 1
  for (const h of c.homeAddrs) assert.equal(await c.bal(h), usdc(30));
  await c.step(c.day0 + 3, FLOOD + 300, FLOOD); // streak 2 -> full
  for (const h of c.homeAddrs) assert.equal(await c.bal(h), usdc(100));
  const s = await c.fund.site(0);
  assert.equal(s.fullPaid, true);
  assert.equal(s.balance, 0n);
  assert.equal(await c.fund.totalPaid(), usdc(300));
  await c.step(c.day0 + 4, FLOOD + 900, FLOOD + 900); // paid out; nothing more
  for (const h of c.homeAddrs) assert.equal(await c.bal(h), usdc(100));
});

test("the full payout needs consecutive days; a gap resets the count", async (t) => {
  const c = await setup(t);
  await c.warp(700);
  await c.step(c.day0, FLOOD + 10, 0);
  await c.step(c.day0 + 2, FLOOD + 10, 0); // not the next day
  assert.equal((await c.fund.site(0)).fullPaid, false);
  await c.step(c.day0 + 3, FLOOD - 1, 0); // dips below
  await c.step(c.day0 + 4, FLOOD, 0);
  assert.equal((await c.fund.site(0)).fullPaid, false);
  await c.step(c.day0 + 5, FLOOD, 0);
  assert.equal((await c.fund.site(0)).fullPaid, true);
  for (const h of c.homeAddrs) assert.equal(await c.bal(h), usdc(100));
});

test("readings wait for the challenge window, settle in order, and the guardian can veto", async (t) => {
  const c = await setup(t);
  await c.warp(700);
  await (await c.as(c.reporter).postReading(0, c.day0, FLOOD + 1, FLOOD + 1, src)).wait();
  await (await c.as(c.reporter).postReading(0, c.day0 + 1, FLOOD + 1, FLOOD + 1, src)).wait();
  await reverts(c.as(c.outsider).settle.staticCall(0), "NotReady");
  await reverts(c.as(c.outsider).settle.staticCall(1), "OutOfOrder");
  await reverts(c.as(c.reporter).postReading.staticCall(0, c.day0 + 1, 1, 1, src), "DayNotAfterLast");
  await (await c.as(c.guardian).veto(0)).wait();
  await (await c.as(c.guardian).veto(1)).wait();
  await (await c.as(c.outsider).settleReady(10, TX)).wait();
  assert.equal(await c.fund.nextToSettle(), 2n);
  assert.equal(await c.fund.totalPaid(), 0n, "vetoed readings move no money");
  await c.warp(HOUR + 1);
  await reverts(c.as(c.guardian).veto.staticCall(1), "ReadingClosed");
});

test("if the site is short of money, every household gets an equal share of what's there", async (t) => {
  const c = await setup(t, { fund: 60 });
  await c.warp(700);
  await c.step(c.day0, FLOOD + 1, 0);
  await c.step(c.day0 + 1, FLOOD + 1, 0);
  for (const h of c.homeAddrs) assert.equal(await c.bal(h), usdc(20));
  assert.equal((await c.fund.site(0)).balance, 0n);
});

test("money is conserved: what came in is either paid out or still held by the site", async (t) => {
  const c = await setup(t, { households: 4, fund: 1000, cover: 75 });
  await c.warp(700);
  await c.step(c.day0, 1, FLOOD);
  await c.step(c.day0 + 1, FLOOD, FLOOD);
  await c.step(c.day0 + 2, FLOOD, FLOOD);
  const held = (await c.fund.site(0)).balance;
  const paid = await c.fund.totalPaid();
  assert.equal(held + paid, usdc(1000));
  assert.equal(await c.token.balanceOf(await c.fund.getAddress()), held);
  assert.equal(paid, usdc(300));
});

test("a new season starts only after the last one ends, and keeps the leftover money", async (t) => {
  const c = await setup(t, { fund: 500 });
  await reverts(c.as(c.manager).renewSeason.staticCall(0, (await c.now()) + 10 * DAY, (await c.now()) + 20 * DAY), "SeasonNotOver");
  await c.warp(700);
  await c.step(c.day0, FLOOD, FLOOD);
  await c.step(c.day0 + 1, FLOOD, FLOOD);
  assert.equal((await c.fund.site(0)).balance, usdc(200));
  await c.warp(121 * DAY);
  const n = await c.now();
  await (await c.as(c.manager).renewSeason(0, n + 600, n + 600 + 90 * DAY)).wait();
  const s = await c.fund.site(0);
  assert.equal(s.fullPaid, false);
  assert.equal(s.earlyPaid, false);
  assert.equal(s.balance, usdc(200));
});

test("setup rejects bad settings and bad households", async (t) => {
  const c = await setup(t);
  const n = await c.now();
  await reverts(c.as(c.manager).addSite.staticCall("x", 0, 0, 0, 0, n + 100, n + 200, 1, 0, 1), "BadSettings");
  await reverts(c.as(c.manager).addSite.staticCall("x", 0, 0, 10, 11, n + 100, n + 200, 1, 0, 1), "BadSettings");
  await reverts(c.as(c.manager).addSite.staticCall("x", 0, 0, 10, 5, n - 1, n + 200, 1, 0, 1), "BadSettings");
  await reverts(c.as(c.manager).addSite.staticCall("x", 0, 0, 10, 5, n + 100, n + 200, 1, 10_001, 1), "BadSettings");
  await reverts(c.as(c.manager).addHouseholds.staticCall(0, [ZeroAddress]), "BadHousehold");
  await reverts(c.as(c.manager).addHouseholds.staticCall(0, [c.homeAddrs[0]]), "BadHousehold");
  await reverts(c.as(c.donor).fund.staticCall(0, 0), "ZeroAmount");
  await reverts(c.as(c.donor).fund.staticCall(5, 1), "UnknownSite");
});
