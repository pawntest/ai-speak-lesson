# Research & Design Decisions

---
**Feature**: `ai-conversation`
**Discovery Scope**: New Feature (Greenfield)
**Date**: 2026-01-29
---

## Summary
- **Feature**: ai-conversation
- **Discovery Scope**: New Feature（グリーンフィールド開発）
- **Key Findings**:
  - OpenAI Chat Completions APIはストリーミング対応、リアルタイム応答に最適
  - React 19のuseState/useEffectを活用したチャットUI設計
  - 会話履歴はローカルストレージ + 将来的にバックエンド永続化を検討

## Research Log

### OpenAI Chat Completions API
- **Context**: AI応答生成のための外部API選定
- **Sources Consulted**: OpenAI公式ドキュメント (https://platform.openai.com/docs/api-reference/chat)
- **Findings**:
  - `POST /v1/chat/completions` でメッセージ配列を送信
  - `stream: true` でSSE（Server-Sent Events）によるストリーミング応答
  - `messages` 配列で会話履歴を維持（developer/user/assistant roles）
  - `gpt-4o` や `gpt-5.2` などのモデルが利用可能
  - `max_completion_tokens` でトークン制限
  - `temperature` で応答のランダム性を制御
- **Implications**: ストリーミングを使用することで1秒以内の応答表示要件を満たせる

### React チャットUIアーキテクチャ
- **Context**: フロントエンドフレームワーク選定とUI設計
- **Sources Consulted**: React公式ドキュメント (https://react.dev/learn)
- **Findings**:
  - React 19のuseStateで会話状態管理
  - コンポーネント分離: ChatContainer → MessageList → MessageBubble
  - Lifting state upパターンで会話状態を親コンポーネントで管理
  - useEffectでスクロール制御とタイマー管理
- **Implications**: 機能ごとにコンポーネントを分離し、再利用性を確保

### 瞬発力トレーニングのタイマー実装
- **Context**: 1秒以内の返答を促すタイマー機能
- **Sources Consulted**: 内部要件分析
- **Findings**:
  - AIメッセージ受信時にタイマー開始
  - requestAnimationFrameまたはsetIntervalで経過時間を更新
  - ユーザー送信時にタイマー停止、1秒以内なら達成フィードバック
- **Implications**: パフォーマンス考慮でrequestAnimationFrameを推奨

### 文法フィードバック機能
- **Context**: ユーザー主導のオンデマンド文法解析
- **Sources Consulted**: 内部要件分析
- **Findings**:
  - 自動フィードバックではなく、ユーザーが解説ボタンをクリックして開始
  - ダイアログUIで文法解析結果を表示
  - 正しい表現の場合はCongratulations評価
- **Implications**: UI/UXとして非侵襲的なフィードバック設計

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Feature-based | 機能ごとにディレクトリを分離 | スケーラブル、明確な境界 | 初期は過剰な可能性 | 中規模以上に推奨 |
| Component-based | UI/ロジック/サービスで分離 | シンプル、学習コスト低 | 大規模時に混乱 | 初期開発に適合 |
| Hybrid | 機能別 + 共通コンポーネント | バランス良好 | 設計判断が必要 | 採用決定 |

**選択**: Hybrid（機能別 + 共通コンポーネント）アプローチを採用

## Design Decisions

### Decision: フロントエンドフレームワーク
- **Context**: チャットUIの構築
- **Alternatives Considered**:
  1. React + TypeScript — 豊富なエコシステム、型安全性
  2. Vue.js — リアクティブ、学習しやすい
  3. Next.js — SSR/SSG対応、フルスタック
- **Selected Approach**: React + TypeScript
- **Rationale**: 型安全性、コンポーネント指向、豊富なチャットUI参考実装
- **Trade-offs**: 初期設定が必要、バンドルサイズ考慮
- **Follow-up**: Next.jsへの移行は将来のスケーリング時に検討

### Decision: AI API選定
- **Context**: 英会話AIパートナーのバックエンド
- **Alternatives Considered**:
  1. OpenAI Chat Completions API — 高品質、ストリーミング対応
  2. Anthropic Claude API — 長文コンテキスト対応
  3. Google Gemini API — マルチモーダル対応
- **Selected Approach**: OpenAI Chat Completions API
- **Rationale**: ストリーミング対応で1秒以内表示要件を満たす、安定したAPI
- **Trade-offs**: API利用コスト、レート制限
- **Follow-up**: 将来的にプロバイダー抽象化レイヤーを追加

### Decision: 会話履歴保存
- **Context**: 会話セッションの永続化
- **Alternatives Considered**:
  1. LocalStorage — シンプル、オフライン対応
  2. IndexedDB — 大容量対応
  3. Backend DB — 複数デバイス同期
- **Selected Approach**: LocalStorage（初期フェーズ）
- **Rationale**: MVP向けにシンプルな実装、後でバックエンド追加可能
- **Trade-offs**: 容量制限（5MB）、デバイス間同期なし
- **Follow-up**: Phase 2でバックエンドDBへ移行

### Decision: 状態管理
- **Context**: 会話状態とUI状態の管理
- **Alternatives Considered**:
  1. React useState/useContext — 軽量、標準
  2. Zustand — シンプルなグローバル状態
  3. Redux Toolkit — 堅牢、デバッグツール充実
- **Selected Approach**: React useState + useContext
- **Rationale**: 初期フェーズではシンプルな状態管理で十分
- **Trade-offs**: 大規模化時に再設計が必要
- **Follow-up**: 複雑化時にZustandへの移行を検討

## Risks & Mitigations
- **API応答遅延**: ストリーミング使用で体感速度向上、タイムアウト設定
- **API利用コスト**: token使用量モニタリング、max_tokens制限
- **LocalStorage容量制限**: 古いセッションの自動削除、圧縮検討
- **ブラウザ互換性**: モダンブラウザターゲット、ポリフィル最小限

## References
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat) — ストリーミング、メッセージ形式
- [React 19 Documentation](https://react.dev/learn) — フック、コンポーネント設計
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) — 型定義
