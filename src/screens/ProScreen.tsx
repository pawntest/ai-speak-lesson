/**
 * ProScreen — understated pricing + license activation (D8).
 */
import { useState } from "react";
import { activateLicense, storeLicenseKey } from "../api";

interface ProScreenProps {
  licensed: boolean;
  onLicensed(): void;
  onBack(): void;
}

export default function ProScreen({ licensed, onLicensed, onBack }: ProScreenProps) {
  const upgradeUrl = import.meta.env.VITE_UPGRADE_URL;
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleActivate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = key.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await activateLicense(trimmed);
      if (result.valid) {
        storeLicenseKey(trimmed);
        onLicensed();
        setMessage(null);
      } else {
        setMessage("That key didn't check out. Please try again.");
      }
    } catch {
      setMessage("Couldn't check the key right now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen pro-screen">
      <header className="flow-top">
        <button type="button" className="ghost-btn" onClick={onBack}>
          ← Back
        </button>
      </header>

      {licensed ? (
        <div className="pro-card pro-active">
          <span className="pro-badge">Pro</span>
          <h1 className="pro-title">Pro is active</h1>
          <p className="pro-line">Unlimited coaching, unlimited cards. Enjoy the practice.</p>
        </div>
      ) : (
        <>
          <div className="pro-card">
            <span className="pro-badge">Pro</span>
            <h1 className="pro-title">
              ¥600<span className="pro-per">/mo</span>
            </h1>
            <ul className="pro-perks">
              <li>♾️ Unlimited coach turns (free = 3/day)</li>
              <li>📌 Unlimited saved cards (free = 10)</li>
              <li>🆕 Early access to new scenes</li>
            </ul>
            {upgradeUrl ? (
              <a className="primary-btn upsell-cta" href={upgradeUrl} target="_blank" rel="noreferrer">
                Go Pro
              </a>
            ) : (
              <button type="button" className="primary-btn upsell-cta" disabled>
                Pro coming soon
              </button>
            )}
          </div>

          <div className="pro-license">
            <h2 className="section-title">Have a license key?</h2>
            <form className="license-form" onSubmit={handleActivate}>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Your license key"
                autoCapitalize="none"
                autoCorrect="off"
                disabled={busy}
              />
              <button type="submit" className="say-submit" disabled={busy || !key.trim()}>
                Activate
              </button>
            </form>
            {message && <p className="soft-hint">{message}</p>}
          </div>
        </>
      )}
    </div>
  );
}
