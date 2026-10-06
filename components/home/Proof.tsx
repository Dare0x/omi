import Link from "next/link";

const TX = "0x2220ab7ed0e16f1dead1b2b31137832d44de91adb465d09525977c44e57d78ef";

// The replayed 2022 payout as it sits on Arc: a receipt anyone can open.
export default function Proof() {
  return (
    <section className="pf" aria-labelledby="pf-h">
      <div className="pf-copy">
        <p className="mono-k">Not a mock-up</p>
        <h2 id="pf-h" className="pf-h">It already paid out, on-chain.</h2>
        <p className="pf-sub">
          We fed the September 2022 readings through the live contract on Arc&apos;s test network. When the second day over the flood level
          settled, the contract paid every registered household in one transaction.
        </p>
        <p className="pf-links">
          <a href={`https://explorer.testnet.arc.io/tx/${TX}`}>Open the transaction on the Arc explorer →</a>
          <Link href="/fund">Every fund, reading and payout, live →</Link>
          <a href="https://github.com/Dare0x/omi">The code →</a>
        </p>
      </div>
      <div className="pf-receipt mono" aria-label="Payout receipt">
        <div className="pf-row pf-row-h">
          <span>
            <i className="pf-dot" />
            Payout · full
          </span>
          <span>Arc testnet</span>
        </div>
        <div className="pf-row">
          <span className="faint">Site</span>
          <span>Lokoja 2022 replay</span>
        </div>
        <div className="pf-row">
          <span className="faint">Trigger</span>
          <span>2 days over 26,538 m³/s</span>
        </div>
        <div className="pf-row">
          <span className="faint">Readings</span>
          <span>12–24 Sep 2022, replayed</span>
        </div>
        <div className="pf-row">
          <span className="faint">Paid</span>
          <span>2 households · 1 test USDC each</span>
        </div>
        <div className="pf-row">
          <span className="faint">Block</span>
          <span>65,525,225</span>
        </div>
        <div className="pf-row">
          <span className="faint">Transaction</span>
          <a href={`https://explorer.testnet.arc.io/tx/${TX}`}>0x2220ab7e…e57d78ef</a>
        </div>
      </div>
    </section>
  );
}
