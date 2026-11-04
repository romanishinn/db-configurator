---
name: founder
disable-model-invocation: true
description: >-
  Test a business idea before launch, end to end. A board of directors (three
  published frameworks), a competitor map, a simulated buyer panel, pricing, the
  offer, unit economics (CFO), marketing, brand, operations, a launch plan, and a
  final business plan with a computed verdict. Use when the user says "test my
  business idea", "would this work", "pressure-test this", "validate demand",
  "is this profitable", "write my business plan", or works through a new venture.
  In this project it runs with real agents (see the D&B adaptation below); do the
  arithmetic yourself and be honest about simulated-buyer limits.
---

# D&B adaptation (these rules override anything below)

This is the **outside view** of the D&B harness (`docs/harness/README.md`, "Внешний взгляд"): an objective opinion from the
side on an important decision. It never replaces the owner's decision and is never part of the routine `/task` cycle.

1. **Only on the owner's word, every time.** It is expensive. Say what you will run (which lenses, how many panel buyers, how many
   agent runs) and wait for a yes. Default scope: board + the lenses the question needs; panel N=20, not 100, unless asked.
2. **Real agents, not one head.** Run each board lens as its own `outside-advisor` agent, independently, in parallel; run each panel
   buyer as a `panel-buyer` agent in waves of ~10 (do not answer for a buyer). Do the CFO arithmetic yourself and show every step.
   Give each agent only the idea file and public facts: never the owner's private finance.
3. **Where things are written.** Wherever this file says `founder/`, use `docs/external-view/<YYYY-MM-DD>-<topic>/` for NON-financial
   material only (idea, competitors with linked public sources, customer portrait, pitch, objections, recommendations).
   **Finance never goes into the repository:** `numbers.json`, margins, purchase or dealer terms, commissions, ad budgets, unit
   economics, the business-plan figures. Show them in the chat only; the owner stores them privately. Do not write them to any file
   in the project, not even temporarily. **Private place (owner's decision, 2026-11-04): one personal Google Doc in the owner's own Drive**,
   titled "D&B — Founder: финансовые выводы (приватно)". Create it on the first run (Drive/Docs connector), add one dated section per
   run, and tell the owner in the chat that it exists. Never share it (no sharing, no link access, no copies, no second place), never
   paste its content or link into any file of the project. If the Drive connector is unavailable, show the numbers in the chat only.
4. **Red lines of the project apply to the outputs:** never name the manufacturer or any other company's name the owner has put
   off-limits; no secrets; no invented facts (a missing number is an open question).
5. **Status of results.** Every conclusion is a **hypothesis** until confirmed by real people or real data. Simulated-buyer quotes are
   never used as testimonials or reviews on any page. The buy rate is an upper bound.
6. **Hand-back.** End with: the verdict, the three biggest risks, what would change the verdict, and what the owner must decide. The
   owner's decisions after the review are logged by `scribe` in `docs/decisions.md` verbatim; the board's recommendations are not
   decisions and are not logged as such.

# Founder — validate a business before you launch it (single file)

Eleven lenses in one skill. Run them in order, or any one on its own. Everything
reads and writes a `founder/` folder in the project so steps build on each other.

```
board -> competitors -> consumer -> pricing -> offer -> cfo -> marketing -> brand -> ops -> launch -> plan
```

Global rules:
- **Score the business, not the founder.**
- **Never invent facts** — no made-up market size, price, review, CAC or margin.
  If a number is missing, name it as an open question and say which step answers it.
- **Public sources only for research, every fact linked.**
- A PASS / "Not yet" is a result, not a failure. Say it plainly, never soften a
  failing check.

## Step 0 — the idea file (`founder/idea.md`)
Write it first from what the user said:
- What it is (one sentence) · Who it's for (specific) · What it sells + price ·
  Where/how customers find and get it · Budget and constraints.
If name, customer, product or price is missing, ask up to 3 questions, then write it.
Do not invent a budget, market size or competitor.

---

## 1. BOARD — three lenses score the idea and vote
Apply each of the three lenses below separately. Each gives: Score 1-10 | Vote
FUND / FUND IF / PASS, then: What is strong · What would kill it (top 3) · Questions
for the founder · If FUND IF, the conditions. Keep disagreements. Summarize: the
vote, the risks more than one lens raised (first), merged conditions as a checklist,
and the strongest version of the business the board can see (may differ from the pitch).

**The Offers lens** (from *$100M Offers*, Hormozi — apply the framework, never speak as him):
- Pick the market first: pain is massive, buyers have money, easy to reach, growing.
- Value equation: value rises with dream outcome + perceived likelihood, falls with
  time + effort/sacrifice. Most offers fail on likelihood (no proof) or effort.
- Don't compete on price — if the only difference is cheaper, it's a commodity.
- Build the offer stack: every problem → a solution, keep cheap-to-deliver +
  valuable, add real urgency, bonuses, guarantee, a name.

**The Monopoly lens** (from *Zero to One*, Thiel):
- Competition destroys profit. Goal: a small market you can dominate, then expand.
- Durable advantage = proprietary tech/know-how ~10x better, network effects,
  economies of scale, or brand. Most small businesses have none — ask which it builds.
- Seven questions: engineering (breakthrough vs incremental?), timing (why now?),
  monopoly (big share of a small market?), people (right team?), distribution (a way
  to reach buyers?), durability (holds in 10 years?), secret (what do you know others don't?).
- Distribution is half the business: how do the first 100 customers arrive, at what cost?

**The Product lens** (from Isaacson's *Steve Jobs* + Apple's public record):
- Focus means saying no — cut until one thing is brilliant.
- Start from the customer's experience and work back.
- Own the whole experience; seams between people/systems are where it breaks.
- Craft including the parts nobody sees. Simplicity is the hard part — say it in one sentence.

---

## 2. COMPETITORS — map the field and find the gap
From `idea.md`, find 5-10 direct + indirect competitors plus main substitutes
(Direct = same thing/same buyer; Indirect = different product, same job; Substitute
= how buyers cope without a business). For each: name, type, url, location/channel,
price of the comparable item, what it sells, positioning line (their own words; replace any manufacturer or supplier name with "the manufacturer" before writing it down),
rating, review count, date. For the top 3-5, read 1-3★ then "love it, but…" 4★
reviews; note recurring complaints with counts + linked verbatim quotes.
Write `founder/competitors.md`: the table (sorted by directness), price range
(low/median/high), a text positioning map on the two axes that matter to this buyer,
ranked complaints with links, **the gap** nobody fills well (tied to evidence; if
none, say so), and the threat — who copies this fastest and how.

---

## 3. CONSUMER PANEL — simulate buyers to surface objections
Build `founder/customer.json`: target (one specific line), 2-4 segments (share +
income range), 4-8 buying behaviours (share + how), 4-8 real objections, optional
habits. Ground it in what the user knows and the competitor complaints; show it and
let them correct it — a wrong customer makes the whole panel wrong.
Write `founder/pitch.md`: 3-6 plain lines of exactly what a buyer sees (product,
price, where/how, any opening offer) — nothing the business can't deliver.
Run the panel: for N buyers (20 for a first look, 100 for depth), create one buyer
persona each from the segments/behaviours/objections, show each the same pitch, and
have each answer **independently and NOT agreeably**: buys (yes/no), purchases in
first month, reason code, reason in their own voice, main objection, what would
change their mind, and 4 price answers (too cheap / a bargain / getting expensive /
too expensive). Never answer for a buyer. (Here: run one `panel-buyer` agent
per buyer in waves of ~10; never reason a buyer through yourself.)
Tally: buy rate, buy rate by segment/behaviour/income, top pass reasons with quotes,
what flips a no, average purchases in month one, and collect the price answers.
**Honest limit (say once):** simulated buyers surface objections and wording well but
predict conversion badly — models lean agreeable, so treat the buy rate as an UPPER
bound and confirm big calls with real people (a waitlist, pre-sale, a landing page
with a price) before signing anything. Never use panel quotes as testimonials.

---

## 4. PRICING — the price buyers will actually pay
From the panel's four price answers per buyer, compute the Van Westendorp points:
point of marginal cheapness, point of marginal expensiveness, optimal price point,
indifference price — giving an acceptable price range. Set it against real competitor
prices and the CFO margin. Recommend a price, a good/better/best ladder, and an
opening offer to test.

---

## 5. OFFER — make it too good to refuse
List every problem the buyer hits on the way to the result; turn each into a solution;
keep the cheap-to-deliver + valuable ones; stack with honest bonuses, an affordable
guarantee, real (never fake) urgency, and a clear name. Score on the value equation
(outcome, likelihood, time, effort). Re-test on a quick buyer panel to see if the buy
rate moves. Build directly against the top objections the panel raised.

---

## 6. CFO — unit economics (do the arithmetic, trace every number)
Build `founder/numbers.json`-style inputs and compute, per unit: contribution after
direct costs, the real margin at planned volume, break-even in units/day (or /month),
year 1 month by month, cash needed before payback, payback period, and three
what-ifs (price drops, sales low, costs rise). **Every number traces to an input the
user can check; a missing input is an open question, never a guess.** Separate
genuine pass-through lines (e.g. install, logistics billed to the client at cost)
from the margin pool so they don't wrongly eat the gross margin. Derive the ad
kill-line: max cost-per-qualified-lead = (allowed ad spend per sale) × (lead→sale
conversion).

---

## 7. MARKETING — positioning, channels, campaign
Turn the panel + competitor map into: positioning (answers an objection buyers
raised), the channels the target customer actually uses, a dated 30-day launch
campaign, the first ten hooks, a budget split, the max you can pay for a customer
(from the CFO), and the numbers to watch. For paid channels, design A/B tests one
variable at a time (angle → creative → audience/geo → landing → funnel), with a
minimum sample and a kill-line; prove a profitable cost-per-sale on one segment/region
before scaling. Treat any agency revenue promise as a hypothesis to validate, not a fact.

---

## 8. BRAND — name, voice, look
Name candidates with the trademark / domain / handle checks to run before falling in
love with one. A one-line promise, a tagline, a voice, and a brief for the look
(colours, type, logo, the first things a customer sees) — all matching the chosen
positioning.

---

## 9. OPS — how it runs on day one
Suppliers (write only "the manufacturer", never a name) and their costs (costs go to the private document, never to a repository file), who works when, step-by-step routines (open / serve or ship
/ close), the tools, the licences and permits to check, and a risk register with what
to do when each thing goes wrong. Feed real costs back to the CFO. Define how quality
travels when expanding to a new region.

---

## 10. LAUNCH — a dated plan that starts with a cheap real test
A cheap real-world test first (waitlist, pre-sale, or pop-up with a real price so real
buyers confirm what the simulated panel said), then a dated countdown to opening with
owners and deadlines, the launch-day run sheet, and the first 30 days of what to measure
and change.

---

## 11. PLAN — compile everything, verdict computed from the numbers
Compile the board verdict, competitors, panel, pricing, offer, CFO, marketing, brand,
ops and launch into one business plan. The verdict at the top is **computed, never
written by hand**, from four checks:
1. Each unit earns money before fixed costs.
2. Year 1 makes an operating profit.
3. Break-even fits inside capacity (if a capacity was given).
4. Enough simulated buyers buy (default bar 25%; state it if you change it).
Verdict = **Profitable** (all pass), **Not yet** (lead with the failing check and which
step fixes it), or **Incomplete** (missing inputs; name the step that fills each).
Add a half-page executive summary: what it is + who for (2 sentences), the verdict and
the three numbers behind it (margin, break-even, year 1 — in the private document / chat only, never in a repository file), where board and panel agreed
and disagreed, the biggest risk and what will be done, what's needed to start (cash +
first test), and the one thing to do this week. Never soften a failing check.

---

## Output
`founder/idea.md`, `founder/competitors.md`, `founder/customer.json`, `founder/pitch.md`,
panel results, pricing, offer, CFO numbers, marketing, brand, ops, launch, and
`founder/business-plan.md` + `founder/summary.md`. In the repository these two files carry NO figures (no margin, break-even, costs, prices of suppliers, budgets): the figures live only in the private document / chat.

Credit: method from the founder-skill pack. Copyright (c) Jake Schincariol, MIT License (keep the full license text of the original pack with any redistribution).
This is the single-file adaptation, further adapted for D&B (see the block at the top); the Python tools of the original are not included.
