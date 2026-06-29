# Flatmate Ledger

House-first expense tracking for shared flats in Pakistan.

This document is the product and architecture baseline for a Splitwise-style app optimized for:

- a single house manager/admin
- Pakistan-specific payment behavior
- cash handling
- receipt/photo-based expense capture
- flexible split rules
- offline-friendly usage
- monthly settlement and reporting

## 1. Product Requirement Document

### 1.1 Problem Statement

Shared flats in Pakistan often manage expenses informally through WhatsApp chats, screenshots, manual notes, and cash handoffs. This creates:

- confusion over who owes what
- delayed reimbursements
- disputes over bill splits
- no clean record of cash collected
- weak visibility into recurring costs like rent, internet, gas, cleaner, and utilities
- difficulty closing monthly accounts

### 1.2 Product Vision

Build a house-focused expense tracker where one manager can run the flat like a lightweight finance operating system:

- add flatmates and house rules
- capture expenses with proof
- assign payment responsibility
- collect and confirm payments
- simplify debts
- resolve disputes
- report monthly settlement clearly

### 1.3 Target Users

- Manager/Admin: house captain, senior flatmate, landlord proxy, or trusted collector
- Flatmate: any resident contributing to house expenses

### 1.4 Core Use Cases

- record a new bill with photo
- split rent, utilities, groceries, and shared services
- show who owes money and who has paid
- manage cash collected by the manager
- confirm payments via screenshot or manual confirmation
- handle disputes and comments on expenses
- close the month with settlement export

### 1.5 Key Product Principles

- House-first, not generic group-first
- Cash-aware, not just digital payments
- Manager-led governance with auditability
- Fast capture on mobile
- Works well with weak connectivity
- Supports Pakistan payment habits and local currency

### 1.6 Success Metrics

- weekly active houses
- expenses created per house per month
- % of expenses with receipt attached
- payment confirmation rate
- settlement completion rate by month end
- dispute resolution time
- retention after first month

### 1.7 Non-Goals for MVP

- full bank payment rails
- automated bank reconciliation
- AI bill extraction from receipt images
- multi-house property management for landlords
- complex accounting ledger exports for businesses

---

## 2. User Roles and Permissions

### 2.1 Roles

#### Manager/Admin

Primary controller for the house.

Permissions:

- create house
- invite/remove flatmates
- assign roles
- configure house rules
- create/edit/approve/reject expenses
- confirm or reject payments
- view all balances and cash in hand
- manage recurring expenses
- resolve disputes
- export reports
- close monthly cycle

#### Flatmate

House member who can contribute expenses and track balances.

Permissions:

- view house and personal balances
- create expenses
- upload receipts
- comment on expenses
- mark payment intent or upload proof
- view settlement suggestions
- view own history and due reminders

#### Viewer

Optional read-only role for landlord, auditor, or parent.

Permissions:

- view summaries and reports
- no edits or confirmations

### 2.2 Permission Matrix

| Capability | Manager | Flatmate | Viewer |
|---|---:|---:|---:|
| View house dashboard | Yes | Yes | Yes |
| Add expense | Yes | Yes | No |
| Edit own expense before approval | Yes | Yes | No |
| Approve/reject expense | Yes | No | No |
| Confirm payment | Yes | No | No |
| Upload payment proof | Yes | Yes | No |
| Add/remove flatmates | Yes | No | No |
| Configure split rules | Yes | No | No |
| Comment on expense | Yes | Yes | No |
| Export reports | Yes | Limited | Limited |
| Resolve disputes | Yes | No | No |

---

## 3. Database Schema

Recommended baseline: PostgreSQL via Supabase.

### 3.1 Core Tables

#### users

- id
- phone
- email
- full_name
- avatar_url
- default_currency
- locale
- created_at
- updated_at

#### houses

- id
- name
- address
- city
- country
- base_currency
- timezone
- created_by
- current_month_start
- current_month_end
- created_at
- updated_at

#### house_members

- id
- house_id
- user_id
- role
- status
- joined_at
- left_at
- room_name
- phone_display
- is_default_payer

#### house_rules

- id
- house_id
- rule_type
- rule_value_json
- active_from
- active_to
- created_by
- created_at

Examples:

- default split type
- late fee policy
- approval requirement
- cash collection schedule
- guest charge policy

#### categories

- id
- house_id
- name
- icon
- color
- is_system
- created_at

#### expenses

- id
- house_id
- created_by
- approved_by
- category_id
- title
- note
- amount
- currency
- expense_date
- due_date
- split_type
- status
- is_recurring
- recurrence_id
- receipt_url
- created_at
- updated_at

Status examples:

- draft
- pending_approval
- approved
- rejected
- disputed
- settled

#### expense_splits

- id
- expense_id
- user_id
- split_method
- share_percent
- share_amount
- owed_amount
- is_guest_assigned_to_host
- created_at

#### payments

- id
- house_id
- expense_id
- payer_user_id
- receiver_user_id
- amount
- currency
- method
- payment_date
- proof_url
- confirmation_status
- confirmed_by
- confirmed_at
- note
- created_at

#### settlements

- id
- house_id
- period_start
- period_end
- algorithm_version
- total_expenses
- total_payments
- net_balance
- generated_at
- finalized_at
- finalized_by

#### settlement_lines

- id
- settlement_id
- from_user_id
- to_user_id
- amount
- status
- created_at

#### comments

- id
- expense_id
- user_id
- body
- created_at
- updated_at

#### disputes

- id
- expense_id
- opened_by
- reason
- status
- resolution_note
- resolved_by
- resolved_at
- created_at

#### recurring_templates

- id
- house_id
- title
- amount
- currency
- category_id
- split_type
- recurrence_pattern_json
- auto_create
- next_run_at
- created_by
- created_at

#### cash_ledger

- id
- house_id
- user_id
- entry_type
- amount
- currency
- related_payment_id
- related_expense_id
- balance_after
- note
- created_by
- created_at

Entry types:

- cash_collected
- cash_spent
- reimbursement
- adjustment
- advance

#### activity_log

- id
- house_id
- actor_user_id
- action_type
- entity_type
- entity_id
- metadata_json
- created_at

#### notifications

- id
- user_id
- house_id
- notification_type
- title
- body
- read_at
- delivery_status
- created_at

#### shopping_lists

- id
- house_id
- created_by
- title
- status
- created_at
- updated_at

#### shopping_list_items

- id
- shopping_list_id
- title
- quantity
- notes
- is_done
- created_at

### 3.2 Suggested Indexes

- `house_members(house_id, user_id)`
- `expenses(house_id, expense_date, status)`
- `expense_splits(expense_id, user_id)`
- `payments(house_id, payer_user_id, payment_date)`
- `settlement_lines(settlement_id, from_user_id, to_user_id)`
- `activity_log(house_id, created_at)`

### 3.3 Data Notes

- Store money as integer minor units where possible.
- Keep currency code per record.
- Never infer paid status from screenshots alone.
- Receipts and payment screenshots should live in object storage, not the relational tables.

---

## 4. User Stories

### Manager/Admin Stories

- As a manager, I want to add flatmates so the house ledger is complete.
- As a manager, I want to create a bill with receipt photo so the expense is verifiable.
- As a manager, I want to approve or reject submitted expenses so only valid items affect balances.
- As a manager, I want to see cash in hand so I can track money already collected.
- As a manager, I want to confirm payments so the ledger stays trustworthy.
- As a manager, I want to generate a monthly settlement report so the house can close accounts cleanly.

### Flatmate Stories

- As a flatmate, I want to see how much I owe so I know my current status.
- As a flatmate, I want to submit my portion of a bill so I can participate in shared costs.
- As a flatmate, I want to upload payment proof so the manager can confirm it.
- As a flatmate, I want to comment on an expense so I can raise questions or disputes.
- As a flatmate, I want reminders before due dates so I don’t miss payment deadlines.

### System Stories

- As the system, I want to auto-calculate debts so manual errors are reduced.
- As the system, I want to simplify settlements so users make the minimum number of payments.
- As the system, I want to support offline capture so expense entry still works with weak internet.
- As the system, I want to log all changes so disputes can be audited later.

---

## 5. Feature Modules

### 5.1 Authentication and Onboarding

- email OTP
- phone OTP
- WhatsApp notification bootstrap
- house invitation flow
- profile setup

### 5.2 House and Member Management

- create house
- invite/remove members
- assign manager
- set room names
- member status tracking

### 5.3 Expense Management

- add expense
- upload receipt
- assign split rules
- recurring expense creation
- approval workflow
- comments and disputes

### 5.4 Payments and Cash

- mark payment as paid
- upload payment screenshot
- manager confirmation
- cash in hand ledger
- partial payments
- cash collection tracking

### 5.5 Balances and Debt Engine

- per-person ledger
- house summary balances
- simplified debt graph
- settle-up recommendations

### 5.6 Analytics and Reporting

- category spend breakdown
- monthly trends
- debt/pending graph
- export to PDF
- export to Excel

### 5.7 Notifications

- due reminders
- payment confirmation alerts
- low cash alerts
- recurring bill reminders
- dispute status updates

### 5.8 Utility Features

- shopping list
- guest history
- room-wise split logic
- multi-currency support
- offline sync queue

---

## 6. MVP Scope

### Must Have

- OTP login by phone or email
- one house with one manager
- add flatmates
- add expense
- receipt upload
- equal split among all or selected members
- percentage split
- unequal amount split
- payment proof upload
- manager confirmation of payments
- balance dashboard
- per-person ledger
- cash-in-hand tracking
- comments on expenses
- expense approval workflow
- monthly PDF and Excel export

### Should Have

- recurring expenses
- settlement suggestions
- low cash alerts
- reminders
- guest split assigned to host
- activity log

### Could Wait

- WhatsApp automation
- offline mode with sync
- room-wise split
- advanced analytics
- multi-currency
- shopping list
- interest rules

### MVP Definition

The MVP is complete when a house can:

- onboard members
- record bills
- split them accurately
- record and confirm payments
- see balances and cash
- close the month with exportable settlement reports

---

## 7. Advanced Feature Roadmap

### Phase 2

- WhatsApp reminders and notifications
- offline-first local queue
- recurring bill automation
- guest history
- room-based split logic
- settlement suggestions with one-click pay list

### Phase 3

- multi-house support for power users
- group budget targets
- predictive cash shortage alerts
- payment OCR from screenshots
- smart late fee engine
- richer analytics by category and month

### Phase 4

- bank or wallet integration
- QR-based payment confirmation
- landlord / property manager module
- AI assistant for receipt classification
- more sophisticated household governance tools

---

## 8. Admin Dashboard Structure

### Dashboard Sections

#### Overview

- total house balance
- total collected this month
- total pending this month
- cash in hand
- overdue payments
- pending approvals

#### Expenses

- all expenses table
- filters by status, category, member, date
- create/edit/approve/reject expense

#### Payments

- payment requests
- payment proofs
- confirmed and pending payments
- partial payment view

#### Balances

- per-person balance summary
- who owes whom
- settlement recommendations

#### Cash Ledger

- collected cash
- spent cash
- net cash position
- low cash warnings

#### Disputes

- open disputes
- comments
- resolution actions

#### Reports

- monthly settlement PDF
- Excel export
- category summary
- trend charts

#### Settings

- house rules
- categories
- notification preferences
- recurring expenses
- permissions

---

## 9. Mobile App Screen List

### Shared Screens

- splash
- login
- OTP verification
- profile setup
- house join/create
- home dashboard
- notifications
- settings

### Flatmate Screens

- my balance
- add expense
- expense detail
- upload receipt
- comment thread
- payment status
- settlement suggestions
- history

### Manager Screens

- house overview
- members
- approve expenses
- confirm payments
- cash ledger
- disputes
- reports
- recurring bills
- house rules

### Utility Screens

- shopping list
- guest history
- multi-currency settings
- offline sync status

---

## 10. API Endpoint Plan

Base style: REST with auth via JWT/session from Supabase or Firebase custom auth layer.

### Auth

- `POST /auth/request-otp`
- `POST /auth/verify-otp`
- `POST /auth/logout`
- `GET /me`

### Houses

- `POST /houses`
- `GET /houses/:id`
- `PATCH /houses/:id`
- `GET /houses/:id/members`
- `POST /houses/:id/invite`
- `PATCH /houses/:id/rules`

### Expenses

- `POST /houses/:id/expenses`
- `GET /houses/:id/expenses`
- `GET /expenses/:id`
- `PATCH /expenses/:id`
- `POST /expenses/:id/approve`
- `POST /expenses/:id/reject`
- `POST /expenses/:id/comment`
- `POST /expenses/:id/dispute`

### Payments

- `POST /payments`
- `GET /houses/:id/payments`
- `PATCH /payments/:id/confirm`
- `PATCH /payments/:id/reject`

### Balances and Settlements

- `GET /houses/:id/balances`
- `GET /houses/:id/ledger`
- `POST /houses/:id/settlements/generate`
- `GET /houses/:id/settlements`
- `GET /settlements/:id`
- `POST /settlements/:id/finalize`

### Reports

- `GET /houses/:id/reports/monthly`
- `GET /houses/:id/reports/export/pdf`
- `GET /houses/:id/reports/export/xlsx`

### Utilities

- `POST /files/upload-url`
- `GET /notifications`
- `PATCH /notifications/:id/read`
- `GET /shopping-lists`
- `POST /shopping-lists`

### Realtime Subscriptions

- expense created or updated
- payment confirmed
- dispute opened or resolved
- settlement finalized
- notification created

---

## 11. Debt Simplification Logic

### Goal

Minimize the number of transactions required to settle all balances.

### Definitions

- `balance > 0`: user should receive money
- `balance < 0`: user owes money
- `balance = 0`: settled

### Algorithm

1. Compute each member’s net balance from all approved expenses and confirmed payments.
2. Split members into:
   - creditors: positive balances
   - debtors: negative balances
3. Sort creditors descending by amount.
4. Sort debtors ascending by absolute amount.
5. Match the largest debtor with the largest creditor.
6. Transfer the minimum of the two amounts.
7. Reduce both balances and continue until all balances are zero or within rounding tolerance.

### Pseudocode

```text
creditors = sort_desc(balance > 0)
debtors = sort_desc(abs(balance < 0))

while creditors not empty and debtors not empty:
    c = creditors[0]
    d = debtors[0]
    amount = min(c.amount, d.amount)
    create settlement line d -> c for amount
    c.amount -= amount
    d.amount -= amount
    remove any zeroed entries
```

### Notes

- Use smallest currency unit to avoid floating errors.
- Round only at the presentation layer.
- Keep settlement algorithm versioned so historical reports remain reproducible.
- If the house uses cash-in-hand, subtract that from the house liquidity summary but not from member debt unless explicitly allocated.

---

## 12. Settlement Flow

### Step 1: Expense Entry

- User adds expense with amount, date, category, note, and receipt.
- System computes split entries.
- If approval is required, status becomes pending approval.

### Step 2: Balance Update

- Approved expense updates each member’s ledger.
- Dashboard refreshes balances and due amounts.

### Step 3: Payment Capture

- Flatmate marks payment as paid.
- Optional screenshot attached.
- Manager confirms or rejects.
- On confirmation, payment updates net balance and cash ledger.

### Step 4: Reminder and Collection

- Due date reminder is sent before deadline.
- Low cash alerts notify manager if cash reserve drops below threshold.

### Step 5: Settlement Generation

- At month end or on demand, system computes all balances.
- Debt simplification produces minimum payment pairs.
- Suggested settlement list is generated.

### Step 6: Finalization

- Manager marks the month settled.
- Report is exported to PDF/XLSX.
- Settlement snapshot is locked for audit history.

### Step 7: Carry Forward

- Any unpaid amounts roll into the next period.
- Advanced payment or credit can be carried forward as a balance adjustment.

---

## 13. Security and Privacy Recommendations

### Authentication

- use OTP-based login
- support session expiry and token rotation
- allow phone or email recovery

### Authorization

- enforce row-level security by house membership
- never allow cross-house access
- manager-only actions must be checked server-side

### Data Protection

- encrypt data in transit with TLS
- encrypt storage objects at rest
- store file access through signed URLs
- avoid exposing phone numbers by default

### Auditability

- log changes to expenses, balances, and settlements
- preserve a tamper-evident activity log
- version settlement runs

### Privacy

- minimize personal data collection
- mask contact info in UI
- let users hide personal notes if house rules allow
- give users export/delete options where legally appropriate

### Abuse Prevention

- rate-limit OTP requests
- prevent duplicate expense submission
- detect suspicious repeated payment confirmations
- soft-lock deleted members from reappearing in historical reports

### Operational Safety

- backups enabled daily
- file retention policy for receipts
- admin alerting for failed sync jobs
- environment secrets managed outside code

---

## 14. GitHub README Draft

```md
# Flatmate Ledger

Flatmate Ledger is a house-focused expense tracker built for shared flats in Pakistan.

It helps a house manager and flatmates track:

- rent and utility bills
- shared groceries and services
- cash collected and spent
- payment proof and confirmations
- disputes and comments
- monthly settlements

## Why this exists

Shared flat finances are often handled in WhatsApp chats and manual notes. Flatmate Ledger turns that into a clean, auditable house ledger.

## Core Features

- OTP login via phone/email
- manager/admin dashboard
- add expenses with receipt photos
- flexible split types
- payment screenshot upload
- manager payment confirmation
- cash-in-hand tracking
- debt simplification
- settlement reports
- monthly analytics

## Recommended Stack

- Frontend: Flutter or React Native
- Backend: Supabase or Firebase
- Database: PostgreSQL if using Supabase
- Storage: Supabase Storage or Firebase Storage
- Auth: OTP via email/phone
- Exports: PDF and Excel

## MVP Scope

- house creation and invitations
- expense capture
- balance tracking
- payment proof and confirmation
- simplified settlement
- monthly export

## Roadmap

- WhatsApp notifications
- offline sync
- recurring bills
- shopping lists
- advanced analytics

## License

Private startup project.
```

---

## 15. Development Milestones

### Milestone 1: Product Definition

- finalize MVP scope
- finalize roles and permissions
- approve data model
- choose frontend and backend stack

### Milestone 2: Foundation

- auth flow
- house creation/join flow
- storage setup
- basic database schema
- row-level access rules

### Milestone 3: Core Expense Engine

- create expense flow
- split logic
- expense list and detail views
- receipt upload
- approval workflow

### Milestone 4: Payment and Ledger

- payment proof upload
- manager confirmation
- balances and per-person ledger
- cash-in-hand tracking

### Milestone 5: Settlement and Reports

- debt simplification
- settlement suggestion flow
- PDF export
- Excel export

### Milestone 6: Analytics and Quality

- monthly category charts
- pending debt graph
- activity log
- reminders

### Milestone 7: Beta Hardening

- offline support
- performance tuning
- error monitoring
- privacy review
- pilot launch in 3 to 5 houses

### Milestone 8: Growth

- WhatsApp notifications
- recurring bills
- shopping list
- multi-currency
- advanced reporting

---

## Recommended Technical Architecture

### Frontend

- Flutter if mobile-first is the priority
- React Native if faster shared web/mobile iteration is preferred
- Web admin portal can be built in React/Next.js if a desktop-heavy manager UI is needed

### Backend

- Supabase is the best fit for this product because it gives:
  - PostgreSQL
  - auth
  - storage
  - realtime updates
  - row-level security

### Services

- file storage for receipts and payment screenshots
- scheduled jobs for reminders and recurring bills
- export worker for PDF/XLSX
- notification service for email, SMS, and WhatsApp later

### Deployment Advice

- start with a monolith-style app plus modular services
- keep business rules in the backend
- version settlement and split logic
- design for future WhatsApp and payment integration without locking the MVP into them

---

## Startup Practicality Notes

- Build the manager dashboard first because it defines the core workflow.
- Keep the first release house-centric instead of trying to support many unrelated group types.
- Treat cash tracking as a first-class feature because it is highly relevant in Pakistan.
- Make approvals optional by house rule so the product works for both strict and casual flats.
- Avoid overbuilding payments infrastructure before validating the manual ledger workflow.

---

## Suggested MVP Stack Choice

If the goal is fastest practical startup delivery:

- Frontend: Flutter
- Backend/Auth/DB: Supabase
- Storage: Supabase Storage
- Exports: server-side worker
- Notifications: email first, WhatsApp later

If the goal is web-first admin adoption:

- Frontend: React + Next.js
- Mobile: React Native later
- Backend/Auth/DB: Supabase

