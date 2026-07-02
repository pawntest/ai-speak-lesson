# Context Diff English — 「知ってるのに話せない」を終わらせる

シーンの中で実際に口に出し、**自分が本当に伝えたかったこと**を選び、
自分の言葉が**一歩だけ良くなる差分**を体で覚える英会話練習ツール。

- 翻訳暗記ではなく「感じた状況 → 英語表現」の回路を作る
- AIは正解を押し付けない。意図を選ぶのはあなた
- 改善は常に1チャンクだけ。すぐ言い直せる長さ
- 学んだ差分はカードになり、日本語の足場が段階的に消える

## クイックスタート
```bash
npm install
npm run dev       # http://localhost:5173 (API: 8787)
```
外部AIキーなしで全フローが動く(モックモード)。

## コマンド
| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー(client+API) |
| `npm run typecheck` | 型チェック(app+server) |
| `npm test` | vitest |
| `npm run build` | 本番ビルド |
| `npm start` | 本番起動(distを配信) |

## 構成
- `src/` React UI(シーン→発話→意図選択→差分→再挑戦→コレクション)
- `server/` Express API・AIプロバイダ(mock / Gemini無料枠)・課金ゲート
- `shared/` 型とzodスキーマ
- `docs/DEPLOY.md` 無料枠デプロイ&収益化手順

## ドキュメント
- プロダクト契約: `PRODUCT_CONTRACT.md`
- 意思決定記録: `docs/working/decisions.md`
- 収益化設計: `docs/working/monetization.md`
