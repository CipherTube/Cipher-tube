---
title: Circle Licensing and Consumer Disclosure Audit
summary: Working checklist and support SOP for auditing Circle entity scope, licensing, consumer risk notices and complaint routing, with every item marked verified or unverified against Circle's own licenses page.
---

# Circle Licensing and Consumer Disclosure Audit

Scope: Circle's US and international licensing, the consumer risk notices attached to
those licenses, and the escalation path when a customer complaint is unresolved.

Source of record: https://www.circle.com/legal/licenses (Last Updated 8 September 2026),
read on 21 November 2026. Every claim below carries a marker.

* `[VERIFIED]` seen in Circle's licenses page on 21 Nov 2026.
* `[UNVERIFIED]` asserted elsewhere, not confirmed at the source. Do not publish until checked.
* `[GAP]` Circle's page does not address it; treat as an open question for counsel.

This is an engineering and operations checklist. It is not legal advice.

## 1. Entity and charter scope

| Activity | Entity | Identifier | Status |
|---|---|---|---|
| US money transmission | Circle Internet Financial, LLC | NMLS #1201441 | `[VERIFIED]` licences held under this entity unless noted |
| Federal trust / custody | First National Digital Currency Bank, N.A., d/b/a Circle National Trust | OCC Charter 25361 | `[VERIFIED]` |
| New York virtual currency / trust | Circle Internet Trust Company LLC, d/b/a Circle New York Trust | NYDFS limited purpose trust charter | `[VERIFIED]` |
| EEA (France) | Circle Internet Financial Europe SAS | ACPR EMI No. 17788; AMF CASP No. E2026-005 (issued 24 Apr 2026) | `[VERIFIED]` |
| UK | Circle entity under FCA | E-Money Issuer No. 900480 | `[VERIFIED]` |
| Singapore | Circle Internet Singapore Pte. Ltd. | MAS MPI No. PS20200630 | `[VERIFIED]` |
| Bermuda | Circle Bermuda entity | BMA DAB Licence No. 54786 | `[VERIFIED]` |
| Abu Dhabi | Circle ADGM entity | FSRA FSP No. 250035 | `[VERIFIED]` |

Checklist:
1. `[VERIFIED]` Identify which entity covers the activity before quoting any licence number.
2. `[VERIFIED]` Do not describe Circle as "federally regulated" without naming the charter: it is a
   national trust bank charter, which is narrower than a full bank charter.
3. `[GAP]` The page does not state which entity holds USDC reserves. Do not assert a custodian from
   this page.

## 2. State licensing

`[VERIFIED]` sample of state licences held by Circle Internet Financial, LLC:

| State | Licence | Number |
|---|---|---|
| Alabama | Money Transmitter (Securities Commission) | SC514 |
| Alaska | Money Transmitter | AKMT-10090 |
| Arizona | Money Transmitter (DIFI) | 0927830 |
| Arkansas | Money Transmitter (Securities Dept) | 43388 |
| California | DFAL licence | Application pending |

Checklist:
1. `[VERIFIED]` California is an application pending, not a licence. Never present California as licensed.
2. `[GAP]` The remaining states are further down the same page and were not captured here. Complete
   the table from the source before using it in any customer-facing material.
3. `[UNVERIFIED]` The claim that Hawaii and Wyoming require no licence for this activity was in the
   briefing material but is not confirmed on the page. Verify before relying on it.

## 3. Consumer risk disclosures

`[VERIFIED]` from the state disclosure text on the same page:
1. Virtual currency transactions are irrevocable; losses from fraudulent or accidental transactions
   may have no recourse.
2. Digital assets are not legal tender and are not government backed.
3. `[VERIFIED]` FDIC and SIPC coverage is not provided for digital assets held with Circle.
4. `[UNVERIFIED]` "Reserves reported weekly" appears in Circle's site navigation. Earlier material
   described monthly Big Four attestations. Confirm the current cadence on the transparency page
   before stating either.

Checklist:
1. Any customer-facing flow that moves value must display irreversibility before confirmation.
2. Do not imply deposit insurance. State the negative explicitly.
3. Keep the risk notice version and date with each disclosure you ship.

## 4. Complaint routing SOP

1. Triage: capture jurisdiction, product, entity, and whether the issue is money transmission,
   trust activity, or account administration.
2. Set expectations: state that transactions are irreversible and that no deposit insurance applies.
3. Circle first, `[VERIFIED]` channels: Circle Support Portal, (888) 762-4966, or support email.
   Record timestamp, case reference, and the entity named.
4. Escalate if unresolved, `[VERIFIED]` examples from the page:
   * New York: NYDFS Consumer Assistance Unit, One Commerce Plaza, Albany NY 12257, 1-877-226-5697.
   * Alaska: Division of Banking & Securities, 550 W. 7th Ave Suite 1850, Anchorage AK 99501, (907) 269-8140.
   * Arizona: DIFI, (800) 544-0708.
   * California: DFPI, (866) 275-2677.
5. Log the escalation in the audit trail with the regulator, date, and reference.

## 5. Open questions

1. Which entity holds reserves, and what is the current attestation cadence?
2. Which states beyond the five sampled here hold licences, and is any other application pending?
3. Does the federal stablecoin regime change which entity issues USDC for US customers?
4. For CipherTube: does holding customer USDC trigger money transmission licensing in the states
   where customers sit? Counsel question, not an engineering one.

## 6. How this maps to the gateway

The gateway session service provides the tamper-evident audit chain this SOP assumes at step 5.
It does not provide KYC, sanctions screening, or custody, and the compliance map in
[GATEWAY_COMPLIANCE.md](GATEWAY_COMPLIANCE.md) says so explicitly.
