# Financial reporting and visualization

The report center follows the reference workflow: period summary → current/prior trend → factual explanation → source records. Market and date filters remain in force. It does not generate causal or weather-based explanations.

## Ownership and sources

| Report | Source and date | Coverage |
| --- | --- | --- |
| Sales and customers | Current order status, Eastern pickup date | Platform preorders; completed sales are not bank settlement |
| Vendor sales and costs | Checked-in vendor session reports, session date | Vendor's own reports; includes on-site sales and preorders |
| Operator fee income | Payments on issued vendor invoices, Eastern recording date | Actual registered receipts; invoice face value is not income |
| Other operator income and expenses | Staff entries, supplied transaction date | Grants, donations, sponsorships, venue, insurance, labor, transport, marketing, equipment and other categories |
| Fees due | Current balance on invoices due in selected period | Receivables; do not add to recorded income |

Vendor goods costs and operating expenses are optional integer cents. They are returned only in the owning vendor's session and analytics APIs, never in university sales reports or sales audit details. Administrators can maintain sales reports but cannot write vendor cost fields. Updates from older clients preserve omitted fields; explicit `null` clears a cost, and `0` confirms no cost.

## Calculation rules

- Gross profit = sales − goods costs, for reports that contain goods costs only.
- Gross margin = gross profit / sales from those same reports; unknown when that denominator is zero.
- Operating surplus = sales − goods costs − operating expenses, for reports containing both costs only. It is not after-tax net income.
- Surplus margin uses sales from the same fully covered reports. Reporting coverage is displayed beside these partial totals.
- Operator net balance = recorded income − recorded expenses. It stays unknown when either side has no entries. Even when present it is a balance of registered flows, not complete accounting profit.
- Missing operator days remain chart gaps. Explicit zero entries remain zero. Public university expenses remain shared and are not allocated to individual markets.
- Current and prior charts align by actual day offset, including DST and month boundaries. Monthly comparisons aggregate those aligned days, which can span two prior calendar months.
- Daily customers are distinct within a date. The same customer can appear on multiple dates; daily counts are not additive to the period customer count.

Manual finance entries use a UUID request key to deduplicate retries. A changed payload with the same key conflicts. Corrections preserve the original amount and reason in the database, mark the entry void using optimistic version checking, and exclude it from active summaries. Invoice payments continue through the invoice workflow so they are not entered twice as manual fee income.

## Interactions and performance

The report library supports search and local favorites. Comparative charts support pointer selection, a keyboard/touch range control, and paginated exact-value tables. Charts render at most 120 periods, vendor cost charts at most 60 reports, and all drawing animations are disabled. Full financial records and all vendor business records can be exported as CSV; missing values stay blank and formula-like text is escaped.

This change does not collect physical inventory movements, spoilage, banking settlements or complete accounting ledgers. Do not infer inventory turnover, net profit, break-even, subsidy reliance or climate effects from these reports.

Validation: application/public builds, financial aggregation and API regression tests, and the existing test suite. Per the user's instruction, no manual administrator login or visual acceptance was performed on the preview or deployed site.
