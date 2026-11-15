# Lucid Horizon — Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/febriyanto32/token-radar-01-rebuild/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/febriyanto32/token-radar-01-rebuild/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for the make.fun **token-radar-01** bounty. It reads a
sealed DefiLlama snapshot of 758 protocols, finds the ones whose record shows
no token, ranks them by what their launch would be worth, and shows a reader
how to farm each one.

## The board

- **758 protocols scanned**, **342 record no token**, **40 on the watchlist**,
  **198 ranked** on the board (snapshot of 2026-11-14).
- Rank 1: **Steakhouse Financial** — implied value about **$713.5M**.
- The board covers every protocol on the snapshot's watchlist, plus 158
  protocols below the $50M floor. The watchlist is a floor, never a ceiling.
- Protocols whose token already trades are shown apart, in the "Already
  trading" section — never mixed into the launch board.

## The model — radar-3

The implied value is this entry's own claim, worked out from the snapshot's
own figures only:

```
implied_value_usd = TVL × 0.30 × growth × maturity × chain × category
```

- **Growth** — the 7-day TVL change, clamped to −50…+150%. A rise is
  rewarded at 0.6 per point; a fall is penalised at 1.2 per point. A protocol
  losing TVL into a launch is worth less than one gaining it.
- **Maturity** — 0.70 for a protocol listed yesterday, rising linearly to
  1.00 at three years. A protocol that has run for years with no token has a
  deeper base of users and integrations for a token to land on.
- **Chain** — the best chain it runs on, up to 1.10 for Ethereum. A token
  needs somewhere liquid to trade.
- **Category** — what a token can claim of the TVL. A direct fee on the TVL
  (lending, exchanges, real-world assets) scores above a thin slice
  (curators and allocators take only a small cut of the capital they direct).

No name is hardcoded anywhere: the same formula ranks every protocol, and
the board keeps the ones that record no token. "Records no token" is a
statement about DefiLlama's record, never a claim that the protocol has no
token at all. The radar does not predict whether or when a token is issued.

Every ranked protocol carries a six-step farm plan with concrete actions,
what they cost and how long they take.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Node 22, standard library only, no network. Two runs write the same bytes.

## Layout

- `main.ts` — the entrypoint: reads the snapshot, ranks, writes the board.
- `lib/model.ts` — the value model, the board's eligibility rule, farm plans.
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte.
- `dashboard/` — the page: board, detail view, filters, launched list.
- `screenshots/` — three screenshots of the dashboard on live data.
- `board.json`, `data.js`, `dossier.json` — written by `main.ts` into the
  output directory (not checked in; the grader runs the program).

## License

MIT. See `LICENSE`.
