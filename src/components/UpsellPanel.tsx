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
  quota: "今日の無料コーチ回数（3回）を使い切りました。Proで無制限に。",
  cards: "無料で保存できるカードは10枚まで。Proで無制限に保存できます。",
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
        setMessage("Proが有効になりました。ようこそ！");
        onActivated();
      } else {
        setMessage("このキーは確認できませんでした。入力をもう一度お確かめください。");
      }
    } catch {
      setMessage("いまはキーを確認できませんでした。少し待ってからもう一度どうぞ。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upsell" role="status">
      <p className="upsell-message">{MESSAGES[reason]}</p>
      <p className="upsell-sub">明日になれば無料枠はまた使えます。学びは止まりません。</p>
      <div className="actions-row">
        {upgradeUrl ? (
          <a className="primary-btn upsell-cta" href={upgradeUrl} target="_blank" rel="noreferrer">
            Proにアップグレード ¥600/月
          </a>
        ) : (
          <button type="button" className="primary-btn upsell-cta" disabled>
            アップグレード準備中
          </button>
        )}
        <button type="button" className="ghost-btn" onClick={() => setShowKeyForm((s) => !s)}>
          ライセンスキーを入力
        </button>
      </div>
      {showKeyForm && (
        <form className="license-form" onSubmit={handleActivate}>
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="購入時に届いたキー"
            autoCapitalize="none"
            autoCorrect="off"
            disabled={busy}
          />
          <button type="submit" className="say-submit" disabled={busy || !key.trim()}>
            有効化
          </button>
        </form>
      )}
      {message && <p className="soft-hint">{message}</p>}
    </div>
  );
}
