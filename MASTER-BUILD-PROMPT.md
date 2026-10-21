# 🔥 FORGE OS — ULTIMATE MASTER BUILD PROMPT
## The Complete RV Park, Apartment & Property Management Operating System

**Project Name:** ForgeOS  
**Official Name:** ForgeOS Property Manager  
**Slogan:** One System. Every Site. Total Control.  
**GitHub:** https://github.com/larrinamsalva/ForgeOS-Property-Manager  
**Repository:** `larrinamsalva/ForgeOS-Property-Manager`  
**Project Owner:** Larrina Salva  
**Platform:** Responsive web application + installable mobile/tablet app  
**Primary Customers:** RV park owners, campground operators, apartment managers, mobile home communities, and rental-property businesses.

---

# PART 1 — THE MISSION

You are my senior software architect, full-stack engineer, database engineer, business application designer, security specialist, quality assurance engineer, and technical product manager.

Your mission is to build **ForgeOS**, a professional all-in-one property management operating system.

This is intended to become a real commercial software product.

I want property owners to be able to operate their businesses without depending on expensive middleman management software for every daily task.

ForgeOS should manage an entire property business from one secure application.

It must eventually support:

- RV parks and RV resorts
- Campgrounds
- Mobile home parks
- Apartment complexes
- Duplexes and rental houses
- Cabins and seasonal rentals
- Commercial properties
- Mixed-use properties
- Multiple properties belonging to the same owner

The goal is to make everyday operations easier, more organized, more accurate, and less time-consuming.

**This must be working software, not just a visual concept.**

Build an attractive dashboard, but functionality, accurate data, security, and reliable operations take priority over decoration.

Implement the product in organized, testable phases. Build the foundation first, then extend it without repeatedly rebuilding existing features.

Do not make unrelated changes or claim unfinished functionality is complete.

---

# PART 2 — GITHUB REPOSITORY SAFETY

Use this repository:

https://github.com/larrinamsalva/ForgeOS-Property-Manager

The repository was originally created as private and contains a README and license.

**IMPORTANT:** Use `larrinamsalva/ForgeOS-Property-Manager` (no trailing period). Verify the current canonical repository name using my connected GitHub account before beginning.

Do not use the older `larrinamsalva/Forgeos` repository because that repository contains unrelated VibraHeal work.

## Before writing code

1. Inspect the repository and its default branch.
2. Read the README, license, and existing project files.
3. Check for existing application structure.
4. Check for existing pull requests and unmerged work.
5. Inspect project configuration if present.
6. Identify the correct place to add the application.
7. Preserve unrelated files and repository history.
8. Use the existing stack if a functional ForgeOS implementation has already been started.

If the repository only contains initial documentation, create a clean application structure.

Do not overwrite unrelated projects.

Do not expose the private repository publicly.

Do not change the repository license without my permission.

Develop on feature branches and create GitHub pull requests.

Do not force-push, delete branches containing work, merge pull requests automatically, or overwrite existing code indiscriminately.

**Each major milestone must leave the repository in a working, testable state.**

---

# PART 3 — TECHNOLOGY AND ARCHITECTURE

Create a modern, maintainable software architecture suitable for commercial use.

If the repository has no existing application stack, prefer:

**Frontend**
- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui or a similarly accessible component system
- Lucide icons
- Responsive desktop, mobile, and tablet layouts
- Dark mode and light mode

**Backend**
- Supabase
- PostgreSQL
- Supabase Authentication
- Secure server-side operations
- PostgreSQL Row Level Security
- Database migrations
- Supabase Storage for authorized attachments

**Deployment**
- Vercel-compatible web deployment
- Separate development, staging, and production configuration
- Installable progressive web app architecture for future tablet use

**Quality**
- TypeScript strict mode
- Zod or equivalent input validation
- Unit tests
- Database integration tests
- Playwright browser tests
- Accessibility checks
- Automated linting and production builds

Use currently maintained stable dependencies.

Keep the architecture modular so additional property-management features can be added without breaking earlier functions.

Never reuse a database or authentication instance from my other projects without explicit approval.

Do not hardcode credentials.

Provide `.env.example` with placeholders and clear setup instructions.

If required external accounts are not connected, implement everything possible safely and report exactly what remains to be configured.

Do not substitute local-only demonstration storage for a real database and describe it as production-ready.

## Independence and ownership

Design ForgeOS so the property owner maintains control over their business records.

Support future features for:

- Full data export
- Secure data backups
- Recoverable records
- Provider migration
- Owner-controlled billing settings
- Self-hosting or alternative hosting where practical
- Avoidance of unnecessary vendor lock-in

Use external services only where they provide clear value or are required for secure payments, messaging, infrastructure, or similar services.

---

# PART 4 — MAIN APPLICATION DESIGN

ForgeOS needs to look like an established, premium property-management product.

Use a professional visual identity.

Suggested appearance:

- Deep charcoal or navy sidebar
- Professional blue accents
- Clean white or dark surfaces depending on theme
- Teal or green for available/success
- Amber for warnings
- Red for overdue or urgent situations
- Clear typography and balanced spacing
- Readable tables, forms, and status labels

## Design rules

- No white text on white fields.
- No dark text on dark fields.
- No unreadable grey-on-grey labels.
- Do not use green-filled text inputs that make text difficult to see.
- Place labels above inputs.
- Use visible borders and high-contrast placeholders.
- Make save, edit, delete, and cancel actions obvious.
- Make table rows and cards easy to select.
- Use clear hover, focus, selected, disabled, and error states.
- Support phones, tablets, and desktops.
- Provide loading, empty, error, and success states.
- Keep navigation compact but readable.
- Provide confirmation before destructive operations.
- Do not clutter the dashboard with unnecessary charts.

## Main navigation

Create or plan these navigation areas:

1. Overview
2. Properties
3. Property Map
4. RV Sites & Units
5. Customers & Tenants
6. Reservations
7. Leases & Occupancy
8. Utility Meters
9. Tablet Meter Reader
10. Billing & Invoices
11. Payments & Receipts
12. Maintenance
13. Inventory & Supplies
14. Equipment & Purchasing
15. Employees
16. Daily Operations
17. Communications
18. Reports & Analytics
19. Business Settings
20. Security & Administration

For Phase 1, implement the relevant foundational screens.

Future screens may be listed as clearly marked upcoming modules, but must not contain fake functionality.

---

# PART 5 — MULTI-PROPERTY MANAGEMENT

ForgeOS must support one owner operating multiple properties.

The owner may have one small RV park or dozens of managed locations.

## Property profile

Each property should have:

- Unique property ID
- Property name
- Property category
- Street address
- City
- State
- ZIP code
- Country
- Property timezone
- Business phone
- Email
- Property contact
- Property description
- Property image
- Management organization
- Operating status
- Number of sites or units
- Utility availability
- Default rental policies
- Default billing settings
- Property notes

Each property must maintain its own records.

Add an easy property-switching menu.

Owners should be able to view one property's information or consolidated information from all authorized properties.

Property managers should see only the locations they are allowed to manage.

---

# PART 6 — RV SITES AND APARTMENT UNITS

Build a complete site and unit directory.

## RV site records

Support:

- Site number
- Property
- Section or row
- Site category
- Back-in or pull-through
- Standard or premium site
- Tent or cabin site
- Site dimensions
- Maximum RV length
- Electrical amperage: 20, 30, 50, or other
- Electric hookup
- Water hookup
- Sewer hookup
- Gas service
- Wi-Fi availability
- Parking
- Accessibility
- Amenities
- Nightly rate
- Weekly rate
- Monthly rate
- Seasonal rate
- Deposit configuration
- Assigned electric meter
- Assigned water meter
- Assigned gas meter
- Notes
- Site photos
- Current occupancy
- Site history

## Apartment records

Support:

- Building name
- Unit number
- Floor
- Bedrooms
- Bathrooms
- Square footage
- Rental rate
- Security deposit settings
- Furnished/unfurnished
- Parking assignments
- Utilities included
- Assigned utility meters
- Amenities
- Accessibility information
- Unit condition
- Maintenance status
- Lease/occupancy records
- Photos
- Notes

## Site statuses

Use explicit states:

- Available
- Reserved
- Occupied
- Out of service
- Blocked
- In preparation

Separate physical availability from reservation and occupancy records so statuses cannot become inconsistent.

## Essential operations

Owners and authorized staff must be able to:

- Add sites
- Edit sites
- Archive sites
- Search by site number
- Filter by property and section
- Filter by occupancy
- View current tenant
- View past occupants
- View assigned meters
- View rent information if authorized
- View maintenance history
- Export a site directory

Do not lose historical records when a site is archived.

---

# PART 7 — INTERACTIVE PROPERTY MAP

Create a visual property-management map.

## Basic map

Provide a layout containing:

- RV sites
- Apartment buildings
- Cabins
- Roads
- Parking
- Restrooms
- Laundry buildings
- Office
- Maintenance buildings
- Storage
- Common areas
- Utility areas

Each site should display a status color.

Selecting a site should open its information panel.

## Owner layout editor

Eventually allow authorized managers to:

- Add site blocks
- Move site blocks
- Change layout positions
- Label rows and sections
- Add roads and facilities
- Resize the display
- Zoom and pan
- Save the layout

Begin with a practical map grid and store coordinates in the database.

Do not let an advanced graphical editor delay the working Phase 1 application.

Plan optional background images and aerial map overlays.

Keep core layout functionality usable without a paid mapping API.

---

# PART 8 — CUSTOMER AND TENANT MANAGEMENT

Customer records are among the most important components of ForgeOS.

Each customer should have a permanent, unique record.

## Customer details

Include:

- Customer ID
- First name
- Last name
- Preferred name
- Phone number
- Secondary phone
- Email
- Mailing address
- Emergency contact
- Emergency contact number
- Communication preference
- Customer status
- Property relationship
- Notes
- Date created
- Last updated
- Created by
- Updated by

## RV and vehicle information

Allow:

- RV make
- RV model
- RV year
- RV length
- RV type
- License plate
- Vehicle make/model
- Tow vehicle
- Additional vehicles
- Parking notes

## Customer profile tabs

Create a customer detail experience with:

- Overview
- Current site/unit
- Stay history
- Reservations
- Lease history
- Utility readings
- Invoices
- Payments
- Deposits
- Maintenance requests
- Documents
- Communications
- Authorized notes

Only show tabs and records the current user is permitted to access.

## Historical accuracy

A customer may:

- Move from one site to another
- Leave and return later
- Rent multiple units
- Have multiple vehicles
- Have family or additional occupants
- Change contact information

These activities must not destroy previous records.

Maintain occupancy and billing history separately from editable customer identity information.

Do not expose sensitive details to unauthorized employees.

---

# PART 9 — RESERVATIONS AND AVAILABILITY

Build a complete reservations system in a later phase.

Support:

- Arrival date
- Departure date
- Property
- Site or unit type
- Requested site
- Customer
- Guest count
- RV information
- Pets, where relevant
- Reservation status
- Rate plan
- Deposit due
- Deposit received
- Confirmation number
- Reservation notes

Reservation statuses:

- Inquiry
- Tentative
- Confirmed
- Checked in
- Completed
- Cancelled
- No-show

## Reservation features

- Availability calendar
- Search by dates
- Block unavailable sites
- Avoid overlapping confirmed reservations
- Move reservations between compatible sites
- Record cancellations
- Record reservation deposits
- Create arrival lists
- Create departure lists
- Send confirmation notices
- Support future online booking
- Support future waiting lists

Provide monthly, weekly, and daily calendar views as appropriate.

Do not treat a reservation as actual occupancy until the guest checks in.

---

# PART 10 — LEASES, MOVE-INS AND MOVE-OUTS

Support RV and apartment occupancy workflows.

## Move-in checklist

- Select customer
- Select property
- Select site
- Confirm availability
- Record move-in date
- Select billing period
- Establish rental rate
- Set deposit requirements
- Record initial meter readings
- Record occupants
- Record vehicle information
- Save move-in condition
- Attach authorized documents

## Move-out checklist

- Record actual departure date
- Record final meter readings
- Check for open invoices
- Record deposit accounting
- Record unit condition
- Mark maintenance needs
- Close the stay
- Prepare site for its next occupant
- Preserve historical records

Support future lease documents, renewals, extensions, and occupancy agreements.

Prevent two incompatible active occupancies from overlapping on the same site.

Never automatically delete billing history when an occupant moves out.

---

# PART 11 — THE TABLET UTILITY METER READER

**THIS IS ONE OF THE HIGHEST-PRIORITY FORGEOS FEATURES.**

Create an installable tablet-friendly application, ideally using a progressive web app initially.

The objective is simple:

An employee walks or drives through the RV park, enters electric, water, and gas readings, and ForgeOS places those readings in the correct meter and customer billing history.

No handwriting.

No manually transferring readings between notebooks, spreadsheets, and billing software.

## Meter record

Store:

- Unique meter ID
- Property ID
- Assigned site/unit
- Utility type
- Meter serial number
- Meter location
- Measurement units
- Number of register digits
- Meter multiplier where applicable
- Installation date
- Removal date
- Meter status
- Last validated reading
- Meter photo
- Notes

Meter assignments must have effective dates so replacement meters retain historical accuracy.

## Tablet reading workflow

1. Employee opens ForgeOS Tablet Reader.
2. Signs in securely.
3. Selects assigned property.
4. Opens today's reading route.
5. Sees site number and meter details.
6. Reads the actual utility meter.
7. Enters the new reading.
8. Optionally takes a picture.
9. Saves the reading.
10. Advances to the next meter.
11. Repeats until the route is complete.
12. Synchronizes pending readings with the main system.

## Tablet interface

Create:

- Large numeric input
- Big Save button
- Next Meter button
- Previous Meter button
- Camera button
- Flag Problem button
- Missing Meter button
- Reading progress counter
- Sync status
- Offline indicator
- Site number displayed prominently
- Last reading comparison
- Search meter/site
- Battery-conscious interface

Make the tablet readable outdoors.

## Meter reading validation

Handle:

- Normal readings
- Duplicate submissions
- Readings lower than previous readings
- Unusually large consumption
- Meter replacement
- Counter rollover
- Incorrect meter assignment
- Missed readings
- Damaged meters
- Zero consumption
- Estimated readings when explicitly authorized

Never silently accept an impossible reading.

Allow supervisors to review or correct readings while retaining the original entry and correction history.

## Offline operation

The tablet must continue to collect readings without internet access.

Use appropriate offline local storage, such as IndexedDB.

Requirements:

- Reading collection while offline
- Queued unsynced records
- Locally preserved meter photos
- Idempotent syncing
- Duplicate prevention
- Retry failed operations
- Explicit conflict handling
- Visible sync history
- Manual Sync Now action
- Unsynced-record warning before logout
- Storage usage warnings
- Secure handling of offline private data

Background syncing may be limited by browser or device platform. Provide reliable foreground/manual syncing rather than promising synchronization a device cannot perform.

Prevent data loss if the internet disconnects midway through a reading route.

Make it easy for a manager to identify missing or unverified readings.

## Reading schedule

Allow:

- Monthly routes
- Weekly routes
- Custom routes
- Assigned employees
- Route completion status
- Per-site reading history
- Reading exceptions
- End-of-route report

Support multiple meters per site.

---

# PART 12 — AUTOMATIC UTILITY CALCULATIONS

Electricity, water, and gas must be calculated automatically from approved readings.

## Electricity

Support:

- kWh readings
- Usage differences
- Fixed charges
- Per-kWh rates
- Tiered pricing
- Meter multipliers
- Authorized taxes and fees

Example:

Previous reading: 10,000 kWh  
Current reading: 10,420 kWh  
Usage: 420 kWh  
Rate: $0.20/kWh  
Charge: $84.00

## Water

Support:

- Gallons
- Cubic feet
- Configurable meter units
- Unit conversions
- Base service charges
- Usage rates
- Tiered rates
- Approved sewer charges where applicable

## Gas

Support:

- Therms
- Cubic feet
- Meter multipliers
- Configurable conversion factors
- Fixed service charges
- Usage charges

## Billing accuracy

Utility rates must be property-specific and effective-date-based.

Do not assume a single universal utility rate.

Some properties include utilities in rent.

Other properties charge separately.

Support both.

When a meter is replaced or reset, calculate consumption correctly across its documented reading history.

Use precise decimal calculations.

Never use binary floating-point operations for financial totals.

Every calculated utility charge should retain its source readings, rate version, period, calculation details, and any adjustments.

Create tests for unusual readings and billing edge cases.

---

# PART 13 — RENT, INVOICING AND MONTHLY BILLS

ForgeOS must eventually eliminate the need for manual monthly bill calculations.

## Rental rate options

Support:

- Nightly rent
- Weekly rent
- Monthly rent
- Seasonal rent
- Custom agreements
- Site-specific prices
- Unit-specific prices
- Effective-dated rate changes
- Discounts
- Approved fees
- Proration where applicable

## Monthly statement

An invoice may include:

- Monthly rent
- Electricity
- Water
- Gas
- Sewer
- Approved service charges
- Additional authorized fees
- Previous balance
- Credits
- Applicable taxes
- Current amount due

Example:

**Example RV Site #12 Monthly Statement**

Rent: $650.00  
Electricity: $84.00  
Water: $25.00  
Gas: $16.00  
Previous balance: $50.00  

**Total Due: $825.00**

Use sample information only for this example.

Real invoices must come from actual records.

## Invoice features

- Unique invoice number
- Customer name
- Property name
- Site/unit number
- Billing dates
- Due date
- Itemized charges
- Meter readings
- Usage calculations
- Tax information when applicable
- Payment history
- Balance due
- Invoice status
- PDF download
- Printable format
- Email delivery
- Correction and credit workflows

Invoice statuses:

- Draft
- Approved
- Issued
- Partially Paid
- Paid
- Overdue
- Voided

Require explicit configuration before automatically issuing live customer invoices.

Finalized invoices and payment history must be auditable.

---

# PART 14 — PAYMENTS, RECEIPTS AND PAST-DUE ACCOUNTS

Build an accurate customer financial ledger.

## Payment methods

Support:

- Cash
- Check
- Manual bank transfer records
- Card payments through an authorized provider
- Online payments in a future customer portal
- Partial payments
- Multiple payments per invoice

## Payment operations

Allow owners to:

- Record received payments
- Issue receipts
- Review balances
- Allocate payments to invoices
- Apply approved credits
- Record refunds
- Record adjustments
- Reconcile transactions
- View payment history
- Export financial reports

Never silently alter or erase a completed payment record.

Use reversing transactions or documented adjustments where appropriate.

## Past-due balances

Support:

- Current balances
- Past-due invoices
- Aging reports
- Grace periods
- Configurable late fee settings
- Fee waivers
- Reminder schedules
- Payment arrangements
- Account notes

Late-fee automation must remain disabled until the owner explicitly configures and approves rules consistent with applicable laws.

Do not build automatic eviction or unlawful utility shutoff features.

## Deposits

Track security deposits and reservation deposits separately from income when accounting rules require it.

Support:

- Deposit received
- Deposit held
- Deposit applied
- Deposit returned
- Deposit deductions
- Remaining deposit balance
- Historical transaction records

## Payment processor

Plan integration with a reputable processor such as Stripe where appropriate.

Never store raw card details.

Separate ForgeOS subscription payments from tenant rent and utility payments.

Do not enable live payment collection until the business account, legal settings, authorization, and reconciliation procedures are ready.

---

# PART 15 — MAINTENANCE AND WORK ORDERS

Property owners need one place to manage repairs.

## Maintenance requests

Allow authorized users to create requests containing:

- Property
- Site or unit
- Customer
- Problem description
- Category
- Priority
- Photos
- Requested date
- Assigned employee
- Status
- Notes

## Maintenance statuses

- New
- Assigned
- Scheduled
- In Progress
- Waiting for Parts
- Completed
- Closed
- Cancelled

## Work order details

Support:

- Technician assignments
- Work descriptions
- Parts required
- Supplies used
- Equipment used
- Time spent
- Estimated cost
- Actual cost
- Before and after photos
- Completion date
- Manager approval

## Preventive maintenance

Allow recurring checks for:

- Water lines
- Electrical pedestals
- Sewer connections
- Restrooms
- Laundry facilities
- Pool and common areas
- Roads
- Lighting
- Office facilities
- Fire safety equipment
- HVAC
- Plumbing
- Buildings

Provide future maintenance calendars and overdue work alerts.

---

# PART 16 — INVENTORY, SUPPLIES AND EQUIPMENT

Create a professional inventory system.

## Inventory records

Each item should support:

- Item name
- SKU or internal code
- Category
- Quantity
- Unit of measure
- Storage location
- Supplier
- Unit cost
- Reorder threshold
- Restock quantity
- Last purchase date
- Notes

Examples:

- Electrical breakers
- Water hoses
- PVC pipe
- Fittings
- Valves
- Cleaning chemicals
- Paper products
- Toilet supplies
- Light bulbs
- Screws
- Plumbing parts
- Groundskeeping supplies

## Features

- Add stock
- Remove stock
- Transfer stock
- Inventory adjustments
- Minimum quantity alerts
- Purchase requests
- Purchase orders
- Supplier directory
- Inventory history
- Cost tracking
- Assign materials to work orders

## Equipment tracking

Include:

- Equipment identification
- Serial numbers
- Property assignment
- Condition
- Maintenance schedule
- Employee checkout
- Return dates
- Repair history

Avoid inventory totals that can become incorrect when multiple employees update quantities simultaneously.

---

# PART 17 — EMPLOYEES AND DAILY OPERATIONS

Create staff management features.

## Staff profiles

Include:

- Employee ID
- Name
- Contact information
- Authorized role
- Assigned properties
- Employment status
- Start date
- Supervisor
- Permissions
- Assigned tasks
- Work history

## Staff roles

At minimum:

**Owner:** Organization-wide control.

**Administrator:** Authorized administrative operations.

**Property Manager:** Property operations and delegated financial access.

**Office Staff:** Reservations and approved customer operations.

**Maintenance Staff:** Assigned maintenance jobs and limited site information.

**Meter Technician:** Assigned utility routes and meter entry only.

**Customer/Resident:** Future access only to their own authorized information.

Enforce all permissions in the backend and database.

## Daily checklists

Allow property owners to create customized checklists such as:

**Morning**
- Review arrivals
- Review departures
- Check vacant sites
- Check property messages
- Check maintenance requests
- Assign work

**Grounds**
- Empty trash
- Inspect restrooms
- Inspect laundry room
- Check exterior lights
- Inspect water leaks
- Check site cleanliness
- Inspect roadways

**Office**
- Review customer accounts
- Record payments
- Review unpaid balances
- Review reservation requests
- Check billing schedule
- Review employee tasks

Allow tasks to be assigned, completed, dated, and audited.

Support recurring schedules.

---

# PART 18 — COMMUNICATIONS AND CUSTOMER NOTIFICATIONS

Build a communication center.

Support:

- Individual customer messages
- Property-wide announcements
- Reservation confirmations
- Arrival instructions
- Payment confirmations
- Rent reminders
- Utility notices
- Maintenance notices
- Emergency advisories
- Service interruption notices

Future delivery methods:

- In-app notifications
- Email
- SMS through an approved provider
- Optional customer portal notifications

## Communication features

- Message templates
- Recipient selection
- Delivery history
- Communication preferences
- Scheduled messages
- Staff notes
- Spanish-language message support

Keep sensitive communications appropriately restricted.

Respect communication opt-ins and applicable messaging requirements.

Do not send real notices from fictional demonstration data.

---

# PART 19 — RESIDENT AND CUSTOMER PORTAL

Plan a secure resident portal for a future milestone.

Residents should eventually be able to:

- Sign into their own account
- View their assigned property/site
- See current rent
- View invoices
- Review utility usage
- Download receipts
- Submit maintenance requests
- Receive announcements
- Update approved contact information
- Review lease documents
- Pay bills when online payments are configured

A resident must never be able to access another resident's information.

The resident portal should be independently permissioned from staff administration.

---

# PART 20 — OWNER DASHBOARD AND REPORTS

Create a premium owner dashboard.

## Dashboard cards

Show real operational information:

- Total properties
- Total sites and units
- Occupied sites
- Available sites
- Reserved sites
- Occupancy percentage
- Upcoming arrivals
- Upcoming departures
- New customer records
- Pending maintenance
- Outstanding meter readings
- Invoices pending approval
- Payments received
- Past-due accounts
- Inventory warnings

Only display real calculated figures for connected modules.

If a future module is not implemented, show an honest unavailable or upcoming state.

## Reports

Plan:

- Daily operations report
- Site occupancy report
- Reservation report
- Tenant history report
- Rent roll
- Monthly billing report
- Utility usage report
- Meter reading exceptions
- Past-due aging report
- Payment history
- Maintenance report
- Inventory report
- Employee completion report
- Revenue trends
- Multi-property comparison

Support filters for:

- Date range
- Property
- Site
- Customer
- Employee
- Status
- Category

Provide CSV export first where practical and PDF export when appropriate.

---

# PART 21 — MULTI-BUSINESS AND COMMERCIAL PRODUCT SUPPORT

ForgeOS should eventually be something I can sell to other independent property owners.

Design with multiple separate business organizations in mind.

Each subscribing business should have:

- Its own organization account
- Its own owners and employees
- Its own properties
- Its own customers
- Its own meter data
- Its own billing records
- Its own permissions
- Its own settings

No customer organization's data may leak into another organization's account.

## Future SaaS features

Plan but do not implement billing plans prematurely:

- Business registration
- Organization onboarding
- Subscription management
- Monthly or annual ForgeOS subscription
- Subscription status
- Plan entitlements
- Staff account invitations
- Business profile
- Property limits where applicable
- Support tools
- Secure account export

The software must distinguish between:

1. An owner paying for ForgeOS software.
2. A tenant paying rent or utilities to the property owner.

These are separate payment flows and must never be mixed.

---

# PART 22 — DATABASE DESIGN

Create a normalized, extensible PostgreSQL schema.

Suggested foundational entities:

- organizations
- organization_memberships
- properties
- property_memberships
- sites_units
- site_amenities
- customers
- customer_contacts
- vehicles
- occupants
- occupancy_stays
- property_layouts
- site_layout_positions
- audit_events
- attachments

Plan future tables for:

- reservations
- reservation_assignments
- leases
- meters
- meter_assignments
- meter_readings
- meter_reading_photos
- meter_reading_routes
- meter_reading_route_items
- offline_sync_operations
- utility_rate_schedules
- utility_rate_components
- billing_periods
- recurring_charges
- invoices
- invoice_line_items
- payments
- payment_allocations
- deposits
- ledger_adjustments
- refunds
- maintenance_requests
- work_orders
- work_order_materials
- inventory_items
- inventory_movements
- equipment
- suppliers
- purchase_orders
- employee_tasks
- checklist_templates
- checklist_results
- notifications
- message_templates
- communication_logs
- subscription_accounts

Do not prematurely create every future table.

Implement only the tables needed for the active milestone while documenting future relationships.

## Database rules

- Use reliable unique IDs.
- Apply foreign key constraints.
- Keep multi-organization ownership explicit.
- Use effective-dated relationships for historical assignments.
- Enforce valid data constraints.
- Handle timestamps and property time zones correctly.
- Use precise financial values.
- Avoid destructive migrations.
- Maintain created and updated timestamps.
- Preserve important business history.
- Keep source readings linked to calculated charges.
- Use transactions for multi-record financial operations.
- Apply Row Level Security.
- Include database indexes for frequently filtered records.
- Document backup and recovery expectations.

---

# PART 23 — SECURITY AND PERMISSIONS

Protect customer and company information.

Minimum requirements:

- Secure login
- Session handling
- Role-based access control
- Property-scoped permissions
- Organization-scoped permissions
- Database Row Level Security
- Server-side authorization
- Safe file uploads
- Private attachment storage
- Input validation
- Audit logging
- Protection from common injection attacks
- Safe error messages
- Secret management
- Rate limiting where appropriate
- Separation of development and production data

## Critical security tests

Verify that:

- One property owner cannot access another business's records.
- A maintenance employee cannot edit utility rates.
- A meter technician cannot view private financial reports.
- A resident cannot access another resident's invoices.
- Unauthorized employees cannot download private documents.
- A user cannot change a record's organization ID to bypass access controls.

Test these restrictions through actual backend or database requests, not only through the interface.

Never commit real passwords, API tokens, customer payment information, or production records.

---

# PART 24 — DATA RELIABILITY AND RECORD KEEPING

ForgeOS must retain dependable business history.

Build with:

- Safe record updates
- Required-field validation
- Archive instead of accidental deletion
- Auditable changes
- Transaction-safe financial updates
- Idempotent data operations
- Protection against duplicate submissions
- Searchable history
- Error recovery
- Migration tracking
- Backup guidance
- Data export readiness

Financial and meter-reading records should never be silently overwritten.

Maintain correction history.

Provide confirmation for irreversible or destructive operations.

Make record retention configurable where appropriate and compatible with legal requirements.

---

# PART 25 — COMPLETE DEVELOPMENT ROADMAP

Organize the build into the following milestones.

## MILESTONE 1 — FOUNDATION

**Build this first.**

Deliver:

- Working application shell
- Responsive layout
- Dark/light theme
- Navigation
- Authentication
- Organization and property-scoped roles
- Database migrations
- Security policies
- Property management
- RV site and apartment unit management
- Customer management
- Basic occupancy assignments
- Occupancy history
- Operational dashboard
- Site directory
- Basic site layout/grid
- Search and filtering
- Form validation
- Safe archive actions
- Automated tests
- Setup instructions
- Pull request

This milestone should establish a dependable foundation for every future feature.

## MILESTONE 2 — RESERVATIONS AND LEASES

Deliver:

- Reservation calendar
- Availability search
- Booking records
- Site conflict prevention
- Arrivals/departures
- Move-in process
- Move-out process
- Lease foundations
- Occupancy changes
- Customer history integration

## MILESTONE 3 — TABLET METER READER

Deliver:

- Installable tablet experience
- Meter directory
- Meter assignments
- Reading routes
- Reading entry
- Meter photography
- Offline collection
- Local queue
- Sync logic
- Duplicate prevention
- Supervisor review
- Meter history
- Route progress
- Tested offline workflows

## MILESTONE 4 — UTILITIES AND BILLING

Deliver:

- Utility rate schedules
- Electric calculations
- Water calculations
- Gas calculations
- Monthly rent charges
- Billing periods
- Itemized invoices
- Invoice approval
- PDF statements
- Customer account ledgers
- Credits and adjustments
- Rate calculation tests
- Meter-to-invoice integration

## MILESTONE 5 — PAYMENTS AND COLLECTIONS

Deliver:

- Manual payment recording
- Payment allocation
- Receipts
- Deposits
- Past-due tracking
- Grace periods
- Configurable fees
- Customer account history
- Reconciliation
- Optional payment processor architecture

## MILESTONE 6 — OPERATIONS

Deliver:

- Maintenance requests
- Work orders
- Employee assignments
- Daily checklists
- Inventory
- Purchasing
- Equipment
- Supplier management
- Operational notifications

## MILESTONE 7 — REPORTS, PORTAL AND COMMERCIAL READINESS

Deliver:

- Owner reports
- Multi-property dashboards
- Resident portal
- Customer communications
- Advanced exports
- Backup/recovery plan
- Subscription architecture
- Security audit
- Accessibility audit
- Performance improvements
- Deployment documentation
- Commercial launch checklist

**Do not sacrifice correctness by building every milestone simultaneously.**

Keep the whole plan documented, but implement and test milestones in sequence.

---

# PART 26 — REQUIRED PHASE 1 ACCEPTANCE TESTS

Before considering the first milestone complete, demonstrate these workflows using fictional data.

## Test 1 — New Owner Account

An owner can authenticate and create or access an organization.

## Test 2 — Create Property

Create a sample property named "Pine Creek RV Park."

Verify that the new property persists after reloading.

## Test 3 — Multiple Properties

Create a second sample property named "Pine Creek Apartments."

Verify that both can be independently selected.

## Test 4 — Add RV Sites

Create at least ten RV sites with unique numbers, sizes, amenities, and rates.

## Test 5 — Add Apartment Units

Create multiple apartment units with bedroom, bathroom, and rent information.

## Test 6 — Site Directory

Verify search and filtering work.

## Test 7 — Customer Creation

Add a fictional customer.

Refresh and confirm the customer record remains in the database.

## Test 8 — Customer Editing

Update customer contact information without losing record history.

## Test 9 — Site Assignment

Assign a customer to an available RV site.

Verify the dashboard reflects the current occupancy.

## Test 10 — Occupancy Conflict

Try to assign two overlapping active stays to the same site.

The application must reject the conflicting assignment.

## Test 11 — Move-Out History

Complete a customer's stay and confirm the occupancy history remains intact.

## Test 12 — Role Permissions

A restricted employee must not be able to access unauthorized organization or property records.

## Test 13 — Responsive Dashboard

Verify the main screens display correctly on desktop, tablet, and phone viewport sizes.

## Test 14 — Theme Readability

Verify text fields, labels, table headers, and buttons remain readable in dark and light mode.

## Test 15 — Data Safety

Verify archive and delete controls do not unexpectedly remove customer or occupancy history.

## Test 16 — Quality Checks

Run the project's type checks, lint checks, unit tests, integration tests where configured, and production build.

Include real test results, not assumptions.

---

# PART 27 — FIRST RUN EXECUTION INSTRUCTIONS

Now begin the actual development.

**Do not only create a written plan. Implement working code.**

Follow this order:

### Step 1 — Inspect

Read the repository and identify existing structure.

Protect all existing work.

### Step 2 — Establish architecture

Select the appropriate stack and create concise technical documentation.

### Step 3 — Build database foundation

Create migrations, relationships, permissions, and security rules for the first milestone.

### Step 4 — Build user interface

Create the working shell, navigation, theme, dashboard, and property selector.

### Step 5 — Build property management

Implement property creation, editing, viewing, and switching.

### Step 6 — Build site and unit management

Implement the site and apartment directories, forms, statuses, and filters.

### Step 7 — Build customer management

Implement real persistent records, detail pages, editing, and searching.

### Step 8 — Build occupancy tracking

Connect customers to sites, enforce conflict rules, and maintain historical stays.

### Step 9 — Add tests

Implement and execute the Phase 1 acceptance checks.

### Step 10 — Review

Inspect for unfinished buttons, permission problems, unreadable controls, failed builds, and data-loss risks.

### Step 11 — Open pull request

Create a clear pull request containing the completed Phase 1 work.

Do not merge it automatically.

### Step 12 — Report

Provide:

- Repository inspection summary
- Architecture summary
- Features implemented
- Features not yet implemented
- Tests executed
- Test results
- Security findings
- External setup needed
- Database setup instructions
- Local development instructions
- Deployment instructions
- Pull request link
- Recommended next milestone

If testing is blocked because services are not provisioned, clearly distinguish verified working features from untested functionality.

Do not invent a deployed website or working service if one does not exist.

---

# PART 28 — IMPORTANT PRODUCT REQUIREMENTS

These principles apply throughout the complete ForgeOS project.

**1. Business reliability first.**  
Actual record integrity matters more than animations or decorations.

**2. Easy enough for everyday workers.**  
An employee should not need technical training to enter a meter reading or complete a checklist.

**3. Independent property operation.**  
Owners should be able to manage their business from ForgeOS without manually duplicating work in unrelated management applications.

**4. Offline field operations.**  
Once implemented, meter-reading workflows must protect collected work during connectivity interruptions.

**5. Accurate money management.**  
Every rent charge, utility calculation, payment, deposit, adjustment, and balance must be traceable.

**6. Multi-property support from the beginning.**  
Avoid designing the database as though every business owns exactly one RV park.

**7. Simple and readable UI.**  
Never prioritize decorative design over usability.

**8. No fake functionality.**  
A feature is only completed when its data flow, authorization, persistence, and key tests work.

**9. Preserve working features.**  
New releases must not casually break previously completed modules.

**10. Commercial-quality direction.**  
Build with the expectation that real owners, managers, employees, and residents may eventually depend on this system.

---

# PART 29 — THE REAL-WORLD DAILY WORKFLOW

Imagine an owner opening ForgeOS at 7:00 AM.

The dashboard shows:

- 85 total sites
- 72 occupied sites
- 8 available sites
- 5 reserved sites
- 3 arrivals scheduled
- 2 departures expected
- 4 maintenance requests
- 12 utility meters awaiting readings
- 6 invoices requiring attention
- 3 inventory items below minimum stock

These are illustrative numbers, not production data.

The owner assigns the meter route to an employee.

The employee opens the tablet application and begins collecting readings around the RV park.

At site 14, the employee enters the electric reading and takes a meter photo.

At site 15, the internet connection disappears.

The employee continues entering readings.

When connectivity returns, ForgeOS synchronizes the unsent work without losing or duplicating records.

The owner reviews reading exceptions and approves the completed utility route.

ForgeOS calculates usage from the correct meter histories and active rate schedules.

The owner reviews a draft monthly billing batch.

After approval, ForgeOS generates accurate itemized invoices.

Customers can eventually receive their statements, review balances, and make authorized payments.

Maintenance employees see their assignments.

Office staff manage arrivals and customer records.

Managers review occupancy.

The owner can run reports across one property or the entire business.

**That is the experience ForgeOS must eventually deliver.**

---

# PART 30 — FINAL INSTRUCTION

This is a serious, long-term application development project.

I want you to take ownership of the technical execution while preserving my decisions and control of the repository.

Make sound engineering decisions.

Prioritize practical features.

Keep code understandable.

Build secure permissions.

Use a reliable database.

Design for future expansion.

Prevent data loss.

Test before proposing merges.

Document important decisions.

Do not silently expand scope or perform destructive actions.

Where a task requires external credentials, payment activation, infrastructure changes, or legal policy choices, implement the safe preparatory work and clearly identify what needs my approval.

**BEGIN BUILDING MILESTONE 1 NOW.**

Inspect my actual ForgeOS GitHub repository, establish the application architecture, build the dashboard, property directory, site/unit records, customer management, and occupancy foundation.

Run the appropriate tests and create a pull request for me to review.

Then provide the Phase 1 completion report and identify exactly what will be required for the tablet meter-reading milestone.

Do not merge the pull request without my approval.

**FORGE OS**

**ONE SYSTEM. EVERY SITE. TOTAL CONTROL.**

Build this to become the operating system a real RV park or apartment owner would be proud to use every day.