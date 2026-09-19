# Funding VergeCommon

VergeCommon is an open-source project operated by Viridis LLC. The hosted public beta is free to use. Project support is separate from co-op funds, land interests, carbon credits and any proceeds recorded in a workspace.

## Website support

The website includes `/support-project/`, with a single optional Stripe Payment Link configured in `lib/project-support.ts`. Until a verified live link is present, the page offers nonfinancial contribution paths and clearly says online contributions are not open. It never displays a placeholder checkout or claims that a payment succeeded.

The prepared checkout is **Support VergeCommon**: a voluntary, one-time USD contribution, with the supporter choosing $1–$1,000. It provides no goods, app entitlement, ownership, carbon credits, payouts, preferential treatment or TestFlight access. Contributions go to Viridis LLC; no charitable tax receipt or deduction is promised. Stripe would collect payment information on its own hosted page. The application does not collect card details or need a Stripe secret key for this link.

On September 19, the connected Stripe account displayed **ViridisNorth**, with public business name **Viridis LLC**, and charges/payouts enabled. No existing VergeCommon product was found. The connector denied product creation because its credential lacks the necessary permission. No product, price or Payment Link was created, and no payment was attempted. An owner-authorized setup route with product-creation permission is still needed. The checkout remains unconfigured.

Before enabling the link, verify the recipient, description, one-time customer-selected amount, support/refund contact and receipt wording on the actual Stripe page. Keep tax treatment and any account-profile corrections with the operator; this implementation does not establish either. Do not silently repurpose a different project's product or payment link. Do not mark the flow payment-tested based only on opening checkout: record provider test evidence separately from any explicitly authorized real payment.

## A paid native app

A paid App Store download is a possible later business model, with the website remaining a low-friction way for neighbors to join a co-op. Its value should come from useful native field work, such as offline journaling and deliberate submission/export, and be checked with actual users before choosing a price. Availability alone is not demand or revenue.

No price, subscription or paid entitlement has been selected or implemented. A finished upfront-paid app uses Apple's distribution and pricing system; Stripe website support does not configure that price. The native beta must use TestFlight without charging for tester access or offering it as a funding reward. See [the Apple release review](APPLE_RELEASE.md) for the current product, signing and review blockers and official Apple sources.

## Operator records

Keep project-support receipts distinct from any co-op ledger and report only settled contributions/refunds/fees as payment activity. Hosting expenses, contributor work, future development and ecological outcomes are different records. Do not present a support contribution as conservation acreage protected, a verified carbon reduction or recurring revenue.
