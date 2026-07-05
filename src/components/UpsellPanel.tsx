/**
 * UpsellPanel — gentle freemium prompt (D8, tone per D7: never punishing,
 * never blocking the parts of the loop that stay free).
 * Includes an inline license-key form so a Pro purchaser can unlock
 * mid-flow without losing their place.
 */
import { useState } from "react";
import { activateLicense, storeLicenseKey } from "../api";

export type UpsellReason = "quota" | "cards";

const MESSAGES: Record<UpsellReason, string> = {
  quota: "You've used today's 3 free coach turns. Pro = unlimited.",
  cards: "Free saves up to 10 cards. Pro = unlimited cards.",
};

interface UpsellPanelProps {
  reason: UpsellReason;
  onActivated(): void;
}

export default function UpsellPanel({ reason, onActivated }: UpsellPanelProps) {
  const upgradeUrl = import.meta.env.VITE_UPGRADE_URL;
  const [showKeyForm, setShowKeyForm] = useState(false);
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
        setMessage("Pro is active. Welcome!");
        onActivated();
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
    <div className="upsell" role="status">
      <p className="upsell-message">{MESSAGES[reason]}</p>
      <p className="upsell-sub">Free resets tomorrow — learning never stops.</p>
      <div className="actions-row">
        {upgradeUrl ? (
          <a className="primary-btn upsell-cta" href={upgradeUrl} target="_blank" rel="noreferrer">
            Go Pro — ¥600/mo
          </a>
        ) : (
          <button type="button" className="primary-btn upsell-cta" disabled>
            Pro coming soon
          </button>
        )}
        <button type="button" className="ghost-btn" onClick={() => setShowKeyForm((s) => !s)}>
          Enter license key
        </button>
      </div>
      {showKeyForm && (
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
      )}
      {message && <p className="soft-hint">{message}</p>}
    </div>
  );
}
