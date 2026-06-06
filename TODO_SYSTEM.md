# FitLife - TODO System

## Priority Legend
- P0: Critical / Blocking
- P1: High Priority
- P2: Medium Priority
- P3: Low Priority / Nice-to-have

---

## Completed

- [x] **P0** Audit all 3 source projects
- [x] **P0** Create clean project architecture with Vite + ES Modules
- [x] **P0** Migrate auth service to ES modules
- [x] **P0** Migrate Supabase client to ES modules
- [x] **P0** Migrate AI service to ES modules
- [x] **P0** Migrate meals service to ES modules
- [x] **P0** Create SPA router with auth guards
- [x] **P0** Implement all 20 pages
- [x] **P0** Build passes successfully
- [x] **P1** PWA manifest + service worker + icons
- [x] **P1** Vercel deployment configuration
- [x] **P1** AI Coach with real Google Gemini chat
- [x] **P1** Admin dashboard with real Supabase data
- [x] **P1** Create all tracking documentation

## In Progress

- [ ] **P1** Supabase Edge Function deployment documentation
- [ ] **P1** Full responsive testing across device sizes
- [ ] **P2** AI Vision meal photo scanning (camera API integration)

## Backlog

### P1 - High Priority
- [ ] Google OAuth redirect handling (hash-based routing callback)
- [ ] Email confirmation flow UI
- [ ] Rate limiting on AI endpoints
- [ ] Admin role-based access control (Supabase RLS for admin queries)

### P2 - Medium Priority
- [ ] Meal photo upload to Supabase R2/Storage
- [ ] Recipe detail view (individual recipe page)
- [ ] Export nutrition reports as PDF
- [ ] Push notification integration (Web Push API)
- [ ] Chart.js integration for progress analytics
- [ ] Weekly/monthly nutrition reports
- [ ] Dark/light mode toggle (currently dark only)

### P3 - Nice-to-Have
- [ ] Barcode scanning for packaged foods
- [ ] Social sharing of achievements
- [ ] Meal plan sharing with friends/family
- [ ] Wearable device integration (Apple Health, Google Fit)
- [ ] Multi-language support (i18n)
- [ ] Accessibility audit (ARIA labels, keyboard navigation)
- [ ] Performance optimization (lazy loading pages, code splitting)
- [ ] E2E testing with Playwright

---

## Known Limitations
1. Admin dashboard data access depends on Supabase RLS policies (anon key may restrict some queries)
2. AI Vision meal scanning uses placeholder UI (no camera API integration yet)
3. Training workouts use sample data (no persistent workout storage)
4. Notifications are currently static/sample data
5. Premium subscription is UI-only (no payment integration)
6. Recipe data is sample-based (no persistent recipe database)

## Last Updated
2026-05-27
