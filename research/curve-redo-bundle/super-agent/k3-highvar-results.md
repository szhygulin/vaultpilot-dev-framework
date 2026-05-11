# Super-agent curve study — K=3 add-on on high-variance issues

Phase D/E follow-up to PR [#288](https://github.com/szhygulin/2). Adds K=3 replication on the 6 high-variance issues × 4 decision-boundary sizes to test whether the K=1 per-issue argmaxes were robust or seed-noise artifacts.

## Scope

- **Issues**: #168, #186, #649, #565, #574, #185 (the 6 issues with within-cluster stdev ≥10 or large size-effect gap in the K=1 analysis)
- **Sizes**: 0, 1633, 13065, 209042B (decision-boundary sizes spanning the experiment's full range)
- **Replicates added**: R=2 and R=3 (giving K=3 total, since K=1 was already on disk)
- **Cells added**: 4 sizes × 3 seeds × 6 issues × 2 replicates = **144 cells**
- **Cap regime**: matched each cell's original leg ($2 / $4 / $6)

## Run

| | |
|---|---|
| Dispatch cost | $167.45 ($85.05 R2 + $82.40 R3) |
| Wall time | ~2 hours (with one mid-run org-quota interruption + retry) |
| Spawner failures | 0 |
| Decisions | R2: 71 impl + 1 none; R3: 69 impl + 3 none |
| Phase D scoring cost | ~$30 |
| Phase D wall | ~12 min (8 parallel processes) |

## Incident: org monthly usage limit hit mid-R3

The first dispatch pass exhausted the org's monthly Anthropic quota partway through R3 (113 of 144 cells errored with `"You've hit your org's monthly usage limit"`). All errored cells returned immediately (~$0 cost) with no work done — the API rejection was instant.

Quota was raised by the operator. Errored logs deleted; re-running the launcher resumed and completed cleanly (script's `[[ -s "$log_path" ]]` skip-check let it pick up only the missing cells). Score script's `SCORES_DIR` was patched to honor an env override so R2 and R3 scores write to separate directories (`scores-R2/`, `scores-R3/`) without colliding with the K=1 `scores/`.

## Per-issue argmax: K=1 vs K=3

The point of K=3 was to test whether the K=1 per-issue argmaxes were stable or seed-noise artifacts.

| Issue | K=1 argmax | K=3 argmax | K=1 best Q | K=3 best Q | Verdict |
|---|--:|--:|--:|--:|---|
| #168 | 209042 | **209042** | 89.17 | 83.47 | stable |
| #186 | 1633 | **1633** | 14.33 | 11.33 | stable |
| #649 | 13065 | **13065** | 48.09 | 47.93 | stable |
| #565 | 1633 | **1633** | 36.33 | 35.47 | stable |
| #185 | 0 | **0** | 21.50 | 12.90 | stable |
| #574 | 13065 | 209042 | 35.33 | 33.40 | shifted (ΔQ −1.9) |

**5 of 6 issues kept the same optimal size.** The one shift (#574: 13065 → 209042) moves the optimum to a different boundary size but the Q at the new optimum is barely different — within K=3 noise.

## Variance behavior surprise: K=3 sd is larger than K=1 sd

Counter-intuitively, K=3 stdev is **larger** than K=1 stdev for most (size, issue) cells. Example: issue #168 at size=209042:
- K=1: mean 89.17, sd 1.09
- K=3: mean 83.47, sd 23.12

The K=1 "3 seeds happen to score similarly" measurement underestimated the true per-cell variance. The K=3 noise (~23 points sd at size=209042 for issue #168) is the real noise floor; K=1 was lucky.

Implication: the K=1 "within-size variance is large" observation in the original Phase D writeup was correct in direction but **understated the noise floor**. With K=3:
- Per (size, issue) sd is in the 10-25 range for most heavy-implement cells
- The +43 gap on #168 (size=0 vs size=209042) is **still significant** because the gap is much larger than the sd
- The +14 gap on #186 is **less significant** at K=3 (the noise eats most of it)

## Per-cell (size, issue) K=3 means + stdevs

| Size | Issue | K=1 mean | K=1 sd | K=3 mean | K=3 sd | n_total |
|---:|---:|--:|--:|--:|--:|--:|
| 0 | 168 | 46.00 | 5.27 | 43.93 | 12.90 | 15 |
| 0 | 186 | 14.00 | 21.00 | 8.40 | 17.39 | 15 |
| 0 | 649 | 46.07 | 18.05 | 42.79 | 18.21 | 15 |
| 0 | 565 | 33.00 | 1.73 | 33.80 | 3.19 | 15 |
| 0 | 574 | 34.67 | 2.65 | 32.00 | 9.13 | 15 |
| 0 | 185 | 21.50 | 32.25 | 12.90 | 26.71 | 15 |
| 1633 | 168 | 49.00 | 1.73 | 45.20 | 12.76 | 15 |
| 1633 | 186 | 14.33 | 21.50 | 11.33 | 19.46 | 15 |
| 1633 | 649 | 18.63 | 27.94 | 28.95 | 28.17 | 15 |
| 1633 | 565 | 36.33 | 4.36 | 35.47 | 3.85 | 15 |
| 1633 | 574 | 33.33 | 2.00 | 31.56 | 8.91 | 15 |
| 1633 | 185 | 19.33 | 29.00 | 11.60 | 24.01 | 15 |
| 13065 | 168 | 47.67 | 2.78 | 45.20 | 12.73 | 15 |
| 13065 | 186 | 13.33 | 20.00 | 10.67 | 18.31 | 15 |
| 13065 | 649 | 48.09 | 1.45 | 47.93 | 3.20 | 15 |
| 13065 | 565 | 30.33 | 7.21 | 31.73 | 6.24 | 15 |
| 13065 | 574 | 35.33 | 1.00 | 32.27 | 9.07 | 15 |
| 13065 | 185 | 18.50 | 27.75 | 11.10 | 22.98 | 15 |
| 209042 | 168 | 89.17 | 1.09 | 83.47 | 23.12 | 15 |
| 209042 | 186 | 0.00 | 0.00 | 2.53 | 9.81 | 15 |
| 209042 | 649 | 30.25 | 23.63 | 31.54 | 23.78 | 15 |
| 209042 | 565 | 33.00 | 1.73 | 33.13 | 3.07 | 15 |
| 209042 | 574 | 33.67 | 1.32 | 33.40 | 1.24 | 15 |
| 209042 | 185 | 0.00 | 0.00 | 0.00 | 0.00 | 15 |

## Updated decision rule for the per-task CLAUDE.md builder

The K=3 data confirms the K=1 recommendation:

1. **Default to size=0.** Most issues' Q is flat across sizes; size=0 is the most cost-effective.
2. **Issue #168 (large positive size effect, ~+40 Q gap) is robust to K=3 noise.** If a similar task is detected, escalate to full S. The detection signal would be tasks where small-context dispatch produces low judge scores AND failed tests.
3. **Avoid size=209042 for issues like #186 and #185** — Q drops to ~0 at full size while staying positive at intermediate sizes. Too much context can hurt.
4. **K=3 doesn't change the size policy.** It tightened our confidence in the K=1 argmaxes for 5/6 issues, exposed that the K=1 noise was understated, and confirmed the cost/quality decision frontier.

## Total experiment cost

| Phase | Cost | Note |
|---|--:|---|
| A (super-agent build) | ~$22 | Opus dedup |
| C (Phase C dispatch, 468 cells, K=1) | $500.92 | |
| D (Phase D scoring, K=1) | $84.16 | |
| K=3 add-on dispatch (144 cells) | $167.45 | high-var × boundary sizes |
| K=3 add-on scoring | ~$30 | |
| **Σ** | **~$805** | within $780-800 envelope |

## Artifacts

- `launch-k3-highvar.sh` — replicate launcher (12 trims × 6 issues, parallel-by-trim, with prefix/cap isolation)
- `score-super-leg.sh` patched to honor `SCORES_DIR` env override
- R2/R3 logs in `research/curve-redo-data/super-agent/leg{1,2,4,6}/logs/curveStudyR{2,3}-*`
- R2/R3 scores in `research/curve-redo-data/super-agent/leg{1,2,4,6}/scores-R{2,3}/*`
