# Formstack Form Inventory (Phase 0)

Source: 8 forms exported from `3CFrontierCSA.formstack.com` (2026-06-30).
Purpose: map each Formstack form to a native portal destination so the Formstack subscription can be cancelled (Phase 4).

> SECURITY: the Formstack password was shared in plaintext earlier — change it.

---

## Summary table

| # | Form | Audience | Maps to | Build size |
|---|------|----------|---------|-----------|
| 1 | 3C Application | Public (job seekers) | Existing `/apply` + applications system — parity check | Small–Med |
| 2 | 3C Internet Sale Submission | Reps | Existing portal sales entry — parity check | Small–Med |
| 3 | 3C Leads Request | Reps/Managers | NEW portal form (leads/territory; has file uploads) | Medium |
| 4 | **3C Onboarding Form** | New hires | **Our onboarding flow** — but reveals missing fields (see below) | Medium |
| 5 | Expedite Internet Order | Reps | NEW portal form (order management) | Small |
| 6 | Manager Final Interview Submission | Managers | Recruiting hire/convert flow (has signature) | Medium |
| 7 | New Fiber Report | Reps | NEW portal form (knock/sales reporting) | Small |
| 8 | Payroll Dispute | Contractors | NEW portal form (payroll/commission dispute; file upload) | Small |

---

## Per-form field detail

### 1. 3C Application — `forms/3c_application` (PUBLIC job application)
Name (first/last), Phone, Email, Market (19 metro options: Des Moines/Davenport/Iowa City IA, Indianapolis, Lexington, Dayton, Albuquerque, Colorado Springs/Denver, Phoenix, Las Vegas, Seattle, St Joseph, Lansing/Grand Rapids MI, Irvine/LA, Portland, Dallas), Employment Desired (Full/Part/Either), 18 or older (Y/N), Ever convicted of a felony (Y/N) + explanation, US work authorization (Y/N), How did you find us, Referred-by employee name, **Resume upload**, Additional info.
**→ Portal:** the public `/apply` page + `applications` collection already exist. Needs parity check + likely add: felony, work-auth, employment-type, 18+, resume upload.

### 2. 3C Internet Sale Submission — `forms/3c_sale_submission` (REP logs a sale)
Rep name/email, Market, Internet Company (T-Fiber/AT&T/Verizon/Frontier/Spectrum), Service Sold (500/1/2/5/10 Gig), Add-ons (Eero Plus, Whole Home Wifi, Home Phone, DirecTV, ADT), Customer name, Internet Account Number, Install Date/Time.
**→ Portal:** reps already log sales in the portal (sales system). Parity check vs existing sale form; may just need the extra fields (add-ons, service tier, account #, install date).

### 3. 3C Leads Request — `forms/3c_leads_request` (REP/MANAGER requests leads/territory)
Campaign, 3C Manager name + email, Rep name, Leads Request Location (11 territories), Special Request explanation, Leads Request Category, Reason for Request, Lead Pack Code, hostile-situation description, **3 file uploads** (police report/text/photos; blind-knocking details; lasso screenshot), New-rep SalesRabbit phone + email.
**→ Portal:** NEW form. Ties into pipeline/territory. Uses Phase-1 file uploads.

### 4. 3C Onboarding Form — `forms/3c_onboarding_form` (NEW HIRE onboarding) ⭐
**Channel** (Xfinity/T-Fiber/AT&T/Verizon/Frontier/Spectrum/Ripple), Name, Phone, Email, **Address** (full), **Market** (16 states), **Shirt Size**, **Hiring Manager** (Aiden/Cash/Jeremy/Mason/Miles/Trent/Will), **Background check authorization (Y/N)**, **Social (SSN)**, **Drivers License #**, **Picture of Drivers License (upload)**, **Badge Photo (upload)**.
**→ Portal:** THIS is our onboarding flow. Status of each field vs what we built:
- ✅ Name, Phone, Email, Address — built
- ✅ DL photo upload — built (Phase 1)
- ✅ Background-check authorization — *item exists but only free text; this form shows a simple Yes/No + the vendor handoff is the real gap*
- ❌ **Social (SSN)** — captured RAW as plain text on the current Formstack form (compliance risk). Our design deliberately routes this through a vendor, never stored raw. GAP/decision.
- ❌ **Drivers License #** — same: raw text today; no capture in portal yet.
- ❌ **Channel** selection — not in portal onboarding
- ❌ **Market** (state) — not captured (we have address, not market)
- ❌ **Shirt Size** — not captured
- ❌ **Hiring Manager** — not captured as an onboarding field
- ❌ **Badge Photo** upload — not captured (would reuse Phase-1 storage)

### 5. Expedite Internet Order — `forms/expedite_internet_order` (REP requests faster install)
Rep name/email, Customer name/phone/email/address, Order Number, Desired expedite dates, Reason (3 options).
**→ Portal:** NEW small form (order management / customer service).

### 6. Manager Final Interview Submission — `forms/hire_candidate_manager` (MANAGER hire decision)
Internet Provider, Job Position, Hiring Manager (named list), Hiring Manager Email, Candidate name/email, Market, Did Candidate Show (Y/N), Extend Offer (Y/N), Rate Candidate (1–5), 3 promotion-only checks, **Manager Signature (drawn)**.
**→ Portal:** recruiting hire/convert flow. The drawn signature is the one notable widget (needs a signature-pad component or a simpler "approved by" record).

### 7. New Fiber Report — `forms/new_fiber_report` (REP knock/sales report)
Company Sold, Rep name/email, Date Knocked, Pack Number, Number of Reps, Doors Knocked, # Customer Contacts, # of Sales, Order Number.
**→ Portal:** NEW small reporting form (feeds pipeline/metrics).

### 8. Payroll Dispute — `forms/payroll_dispute` (CONTRACTOR disputes pay)
Contractor name/email, Campaign, Type of order, Date of Install, **Upload screenshot of order**.
**→ Portal:** NEW small form (payroll/commission dispute; reuses Phase-1 upload).

---

## Key findings

1. **The real onboarding form captures SSN + DL# as RAW plain text** (form #4, "Social" + "Drivers License #"). That's a compliance risk in the current Formstack setup, and it confirms our biggest gap — but it also means the boss currently *does* collect these directly. Decision needed: keep the vendor-reference design (safer, no raw SSN stored) vs. match the current raw-capture behavior.
2. **3 forms map to systems that already exist** in the portal (application→applications, sale→sales, onboarding→onboarding) — these are parity/extension work, not from-scratch.
3. **4 forms are brand-new** small/medium native forms (Leads Request, Expedite Order, New Fiber Report, Payroll Dispute) + the Manager Interview (signature).
4. **To actually cancel Formstack, all 8 must be rebuilt** and their embeds replaced wherever they live (likely the public marketing site for #1, and links/bookmarks reps use for the rest).
