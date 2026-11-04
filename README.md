# 🏛️ SPID File Management System v3.0.0

**A Secure, Modern Digital File Management Platform for the Southern Provincial Irrigation Department, Galle, Sri Lanka.**

The **SPID File Management System** is a full-stack web application designed to digitize departmental file management, streamline inter-departmental file requests, and improve administrative workflows at the **Southern Provincial Irrigation Department (SPID), Galle, Sri Lanka**.

The platform provides dedicated Administrator and Staff portals, centralized file registration and tracking, account administration, role-based access control, and audit logging.

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [System Architecture](#️-system-architecture)
- [Technology Stack](#️-technology-stack)
- [Portals and Application Routes](#-portals-and-application-routes)
- [Middleware and Security](#-middleware-and-security)
- [Backend Architecture](#-backend-architecture)
- [Performance Optimization](#-performance-optimization)
- [API Reference](#-api-reference)
- [Departmental Workflow Support](#-departmental-workflow-support)
- [Getting Started](#-getting-started)
- [Environment Configuration](#-environment-configuration)
- [Enterprise Production Architecture & Troubleshooting](#️-enterprise-production-architecture--troubleshooting)
- [Security Considerations](#-security-considerations)
- [Developer](#-developer)

## 📌 Overview

The system replaces traditional manual file-tracking workflows with a centralized digital platform.

### Main Objectives

- **Digital Transformation:** Modernize departmental file management processes.
- **Efficient File Tracking:** Simplify file registration, searching, requisition, and status tracking.
- **Administrative Control:** Manage user accounts, departmental sections, and permissions.
- **Security:** Apply authentication, authorization, and database access policies.
- **Accountability:** Maintain audit records for important administrative operations.
- **Usability:** Provide responsive interfaces and streamlined user interactions.

## ✨ Key Features

### 👑 Administrator Portal

- Administrative dashboard and system statistics.
- File registration and centralized file management.
- User account approval, rejection, disabling, and lockout management.
- Administrator and staff account management.
- Departmental section creation and management.
- File requisition review and approval workflows, including staff-selected
  priorities to help administrators determine fulfillment order.
- Profile management and account security features.
- Audit log access.

### 👔 Staff Portal

- Staff dashboard with relevant file and request information.
- File searching and registration.
- File requisition and checkout requests with High, Normal, or Low priority.
- Request status tracking and cancellation of pending requests before admin
  review.
- Profile and password management.
- Section-aware access to relevant information.

### 🔐 Authentication and Authorization

- Supabase Authentication integration.
- Email and password sign-in.
- User registration with administrative approval workflows.
- Password recovery and reset.
- Role-based access control (RBAC).
- Protected application routes.
- Account-status enforcement.
- Server-side authorization for protected operations.

### 📂 File Management

- Centralized file registration.
- File identification and categorization, using the file number as the unique
  business identity (no two live records may share a File No; a rejected
  submission releases its number for reuse).
- Departmental section association.
- Storage rack and cupboard location tracking.
- File search and inspection.
- File requisition and checkout workflows.

### 📝 Audit and Account Security

- Audit records for supported administrative actions.
- Account lockout handling for repeated failed login attempts.
- User profile and account status management.
- Database access protection through configured Row-Level Security (RLS) policies.

## 🏗️ System Architecture

The application follows a layered architecture that separates the user interface, request handling, business logic, and data access responsibilities.

```text
                 Presentation Layer
            Next.js App Router / React
                         |
                         v
              Middleware & Route Guards
                         |
                         v
              Controller / Service Layer
          Authentication / Validation / RBAC
                         |
                         v
                 Repository Layer
                         |
                         v
                  Supabase Services
             +-----------+-----------+
             |           |           |
         PostgreSQL   Supabase Auth  Storage
             |
       Row-Level Security
```

### Architecture Layers

**1. Presentation Layer**

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- Framer Motion
- TanStack Table

**2. Middleware and Request Protection Layer**

- Authentication-related route checks.
- Session-aware request handling.
- Role-based route redirection.
- Account-status checks, where implemented.

**3. Controller and Service Layer**

- Business logic and request validation.
- Authentication and authorization.
- Account management and lockout handling.
- File and section management.
- Audit log generation.

**4. Data Repository Layer**

- Database query organization.
- Supabase PostgreSQL integration.
- Profile, section, file, and audit record access.
- Row-Level Security enforcement through configured database policies.

## 🛠️ Technology Stack

| Category | Technologies |
|---|---|
| Frontend | Next.js 15, React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Backend | Next.js API Route Handlers |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| File Storage | Supabase Storage |
| Security | RBAC, RLS, server-side authorization |
| Data Tables | TanStack Table |
| Charts | ApexCharts |
| Animations | Framer Motion |
| Version Control | Git, GitHub |

## 🧭 Portals and Application Routes

### Administrator Routes

| Route | Purpose |
|---|---|
| `/admin/default` | Administrative dashboard and statistics |
| `/admin/nft-marketplace` | System file listing and inspection |
| `/admin/data-tables` | Account directory and administrative data |
| `/admin/add-new-file` | Register a new file |
| `/admin/admin-management` | Manage administrator accounts |
| `/admin/users` | View and manage user accounts |
| `/admin/section-management` | Create and manage departmental sections |
| `/admin/staff-file-request` | Review staff file requests |
| `/admin/profile` | Administrator profile and security settings |

### Staff Routes

| Route | Purpose |
|---|---|
| `/staff/default` | Staff dashboard |
| `/staff/files` | Search and view files |
| `/staff/add-new-file` | Register a new file |
| `/staff/request-file` | Submit a file requisition |
| `/staff/your-requests` | Track submitted requests |
| `/staff/profile` | Manage staff profile information |

### Authentication Routes

| Route | Purpose |
|---|---|
| `/auth/sign-in` | User authentication |
| `/auth/sign-up` | New account registration |
| `/auth/forgot-password` | Request password recovery |
| `/auth/reset-password` | Reset account password |

**Note:** Application routes and available actions may vary with the deployed version and configured permissions.

## 🛡️ Middleware and Security

Middleware can perform request-level checks before allowing navigation to protected routes.

### Route Protection

Protected route prefixes include:

- `/admin`
- `/staff`
- `/rtl`, if configured in the application

### Authentication and Session Handling

- Unauthenticated users attempting to access protected pages can be redirected to the sign-in page.
- Authenticated users can be redirected to the appropriate portal according to their role.
- Account-status restrictions can prevent access for pending, disabled, rejected, or locked accounts.
- Session cookies can support efficient authentication-related request handling.

### Security Principles

- Validate session authenticity on the server.
- Enforce role and account-status checks for sensitive operations.
- Do not trust client-provided role or status values.
- Apply RLS policies to relevant database tables.
- Protect private environment variables and service credentials.

**Important:** Cookie-based session caching must not replace server-side authorization. Sensitive API operations should verify the authenticated user's identity, role, account status, and permissions.

## ⚙️ Backend Architecture

The backend separates responsibilities into controllers, services, and repositories.

### Controllers

| Controller | Responsibility |
|---|---|
| `AuthController` | Authentication, logout, and session-related operations |
| `AdminController` | Administrative account operations |
| `SectionController` | Departmental section management |
| `ProfileController` | Profile updates, avatars, and password changes |
| `FileController` | File registration and requisition workflows |

### Services

| Service | Responsibility |
|---|---|
| `AuthorizationService` | Server-side authorization checks |
| `LockoutService` | Failed login attempt tracking and account lockout handling |
| `StorageService` | File and avatar storage operations |

### Repositories

| Repository | Responsibility |
|---|---|
| `ProfileRepository` | User profile data access |
| `SectionRepository` | Departmental section data access |
| `AuditLogRepository` | Audit record persistence |
| `FileRepository` | File data access and retrieval |

*These names describe the intended architecture and should be aligned with the actual source tree before publication.*

## ⚡ Performance Optimization

### Optimistic UI Updates

Supported administrative actions can update the interface immediately while the server request is processed. Failed operations should restore the previous state where rollback handling is implemented.

### In-Memory Caching

Frequently accessed data, such as departmental sections, can be cached to reduce repeated requests. Cache invalidation should occur when relevant data changes.

### Visibility-Aware Polling

Background refresh operations can pause or reduce activity when the browser tab is hidden, helping limit unnecessary network traffic.

### Session-Aware Rendering

Session and profile data can be reused where safe to reduce redundant loading and improve navigation responsiveness.

**Performance note:** Fast perceived UI response does not mean that database operations complete in zero milliseconds. Actual performance depends on network latency, server processing, and database response times.

## 🌐 API Reference

The following endpoints describe the intended API surface and should be verified against the implemented route handlers.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Authenticate a user |
| `POST` | `/api/auth/logout` | End the application session |
| `POST` | `/api/auth/register` | Register a new account |
| `GET` | `/api/auth/me` | Retrieve the current user's profile |
| `GET` | `/api/sections` | Retrieve available sections |
| `GET` | `/api/admin/sections` | Retrieve administrative section data |
| `POST` | `/api/admin/sections` | Create a section |
| `PATCH` | `/api/admin/sections/[id]` | Update a section |
| `DELETE` | `/api/admin/sections/[id]` | Delete a section |
| `GET` | `/api/admin/users` | List user accounts |
| `PATCH` | `/api/admin/users/[id]` | Update account status or details |
| `DELETE` | `/api/admin/users/[id]` | Delete a user account |
| `GET` | `/api/profile` | Retrieve the current user's profile |
| `PATCH` | `/api/profile` | Update profile information |
| `POST` | `/api/profile/avatar` | Upload a profile avatar |
| `POST` | `/api/profile/change-password` | Change the account password |

## 🏢 Departmental Workflow Support

The system is intended to support relevant departmental workflows involving:

- Administration and Human Resources
- Irrigation Planning, Design, and Feasibility
- Water Management, Operations, and Hydrology
- Central Registry and Archive
- Land Acquisition and Surveys
- Finance, Accounts, and Procurement
- Regional Engineering Offices in Galle, Matara, and Hambantota

## 🚀 Getting Started

### Prerequisites

- Node.js compatible with the project dependencies
- npm
- Git
- A configured Supabase project

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/malitha-tishamal/SPID-File-Management-System.git
```

**2. Navigate to the project directory**

```bash
cd SPID-File-Management-System
```

**3. Install dependencies**

```bash
npm install
```

**4. Configure environment variables**

Create a `.env.local` file in the project root and configure the required variables according to the application's implementation.

**5. Apply database migrations**

Run the project's database migrations in the documented order, ensuring that database policies and required tables are configured.

**6. Start the development server**

```bash
npm run dev
```

**7. Open the application**

Navigate to [http://localhost:3000](http://localhost:3000).

## 🔧 Environment Configuration

Configure the environment variables required by the project. Common examples may include:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_public_key
SUPABASE_SERVICE_ROLE_KEY=your_server_side_service_role_key
```

Use the exact variable names referenced by the application's source code. Additional variables may be required.

**Never commit real API keys, database passwords, or service-role credentials to Git.** Server-only secrets must not be exposed to browser-side code.

## 🛠️ Enterprise Production Architecture & Troubleshooting

This section details critical architectural guidelines, root-cause analyses, and corporate-standard resolutions established to ensure system stability, multi-tenant state consistency, and reliable build pipelines.

### 1. Centralized User Session & Profile Architecture (`useProfile`)

#### Anti-Pattern (Ad-Hoc Component Fetching)
In distributed UI architectures, individual navigation elements (such as `Sidebar`, `StaffSidebar`, and `Navbar`) must **never** execute separate network requests to `/api/auth/me` or maintain isolated `localStorage` states. Ad-hoc implementations introduce:
* **Network Request Waterfalls:** Redundant duplicate requests hitting `/api/auth/me` on every navigation event.
* **State Drift & Race Conditions:** Profile or avatar modifications made in the Profile view fail to reflect in the Sidebar or Navbar without full-page reloads.
* **Runtime Vulnerabilities:** Component-level hook omissions leading to `ReferenceError: useState is not defined`.

#### Corporate Standard Implementation
All user session metadata, active roles, and avatar URLs are centralized within [`ProfileContext.tsx`](src/contexts/ProfileContext.tsx) and exposed via the custom hook `useProfile()`. The entire application tree is wrapped by `<ProfileProvider>` in [`AppWrappers.tsx`](src/app/AppWrappers.tsx).

* **Single Source of Truth (SSOT):** Components consume state via:
  ```tsx
  import { useProfile } from 'contexts/ProfileContext';

  const { profile, avatarUrl, clearProfile } = useProfile();
  const displayName = profile?.full_name || 'SPID Officer';
  const displayRole = profile?.role || 'Administrator';
  ```
* **Instant Cache Hydration:** Profiles hydrate synchronously from local storage during initial paint, then revalidate in the background against `/api/auth/me`.
* **Atomic Sign-Out Pipeline:** `clearProfile()` synchronously wipes local storage, purges session cookies, dispatches cache-invalidation events, and routes to `/auth/sign-in`.

---

### 2. Next.js Workspace Isolation & Lockfile Boundary Configuration

#### Root Cause
In development environments where a secondary `package-lock.json` resides in an ancestor directory (such as `~/package-lock.json`), Next.js emits:
```text
⚠ Warning: Next.js inferred your workspace root, but it may not be correct.
We detected multiple lockfiles and selected /Users/.../package-lock.json as root directory.
```
This causes Next.js output file tracing to traverse outside the repository, leading to packaging anomalies and build cache collisions.

#### Production Standard Solution
Explicitly define `outputFileTracingRoot` in [`next.config.js`](next.config.js):
```javascript
const path = require('path');

const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, './'),
  // ...
};

module.exports = nextConfig;
```

---

### 3. Build Artifact Integrity & Cache Invalidation

#### Symptoms
* `ENOENT: no such file or directory, open '.next/routes-manifest.json'`
* `TypeError: b.C is not a function`
* `PackFileCacheStrategy: Caching failed for pack`

#### Diagnostic & Remediation
These errors occur under two conditions:
1. **Concurrency Collisions:** Executing `npm run build` while an active `next dev` instance is running in another terminal window.
2. **Storage Exhaustion:** The host machine running out of disk space, preventing Webpack and Next.js from flushing manifests to disk.

#### Standard Reset Workflow
1. Terminate all running Next.js development processes:
   ```bash
   pkill -f "next"
   ```
2. Purge the compiled cache:
   ```bash
   rm -rf .next
   ```
3. Execute compile-time static type checking:
   ```bash
   npx tsc --noEmit
   ```
4. Verify complete production compilation:
   ```bash
   npm run build
   ```
5. Resume local development:
   ```bash
   npm run dev
   ```

---

### 4. Navigation Responsiveness & Visual Feedback Architecture

#### Issue & Latency Analysis
In Next.js App Router, client-side navigation between pages can appear delayed or sluggish under two scenarios:
1. **Lack of Instant Click Feedback:** Without top-level route transition indicators or active link states, users feel a "dead click" sensation during the 200–500ms server component render or data fetch.
2. **On-Demand Dev Compilation:** In `npm run dev`, routes are compiled Just-In-Time (JIT) on first access (1.5s–4s compilation time). In production (`npm run build`), routes are fully pre-compiled and load instantaneously.

#### Production Standard Solution
* **Route Prefetching:** Set `prefetch={true}` on all [`NavLink`](src/components/link/NavLink.tsx) instances in both [`SidebarLinks`](src/components/sidebar/components/Links.tsx) and [`StaffSidebar`](src/components/staffSidebar/index.tsx) to download route bundles ahead of interaction.
* **Global Progress Bar:** [`NavigationProgressBar`](src/components/navigation/NavigationProgressBar.tsx) renders an animated gradient bar at the top of the viewport (`fixed top-0 z-[99999]`) the moment an internal link is clicked, completing automatically when the target route mounts.
* **Inline Button Tactile Spinners:** Active and pending states immediately display a spinning micro-indicator inside the clicked sidebar link, confirming receipt of the user's action within <10ms.

---

### 5. Supabase Auth Error Recovery & Cookie Sanitation

#### Root Cause (`AuthApiError: Invalid Refresh Token`)
When an authenticated session expires, is revoked, or has its refresh token rotated, stale cookies (`sb-*-auth-token`) may remain in the client browser. Repeated calls to `supabase.auth.getUser()` in API routes and middleware repeatedly query Supabase Auth with the dead token, generating `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` logs and adding blocking network latency (300ms–1500ms) to every request.

#### Production Standard Solution
* **Middleware Cookie Sanitation:** [`updateSupabaseSession`](src/config/supabase/middleware.ts) wraps `supabase.auth.getUser()` in a try/catch block. Upon detecting an authentication error or invalid token, stale cookies (`spid_session_auth` and `sb-*-auth-token`) are automatically purged from the response, breaking retry loops and routing directly to sign-in.
* **Safe Service Fallbacks:** [`AuthorizationService.getSessionProfile()`](src/services/AuthorizationService.ts) safely catches authentication exceptions and returns `null`, preventing unhandled promise rejections and server-side log storms.

---

### 6. Elimination of `/api/auth/me` Network Floods & Heartbeat Throttling

#### Root Causes
1. **Unconditional Hydration Fetch on Auth Pages:** On initial mount, `ProfileContext` called `refreshProfile()` unconditionally. On public authentication routes (such as `/auth/sign-in`), the unauthenticated browser fired `GET /api/auth/me`, producing redundant `401 Unauthorized` responses.
2. **Window Focus Storms in SessionWatchdog:** `SessionWatchdog` attached listeners to `focus` and `visibilitychange` with `forceCheck = true`. Every time a user clicked into the window, both events fired in parallel, producing concurrent duplicate `POST /api/auth/me` requests.
3. **Ad-Hoc Component Queries:** Pages like `admin/add-new-file`, `staff/add-new-file`, `staff/request-file`, and `AccountDirectoryPage` executed independent `fetch('/api/auth/me')` calls instead of reading from `useProfile()`.

#### Corporate Standard Solution
* **Auth Route Exclusion:** [`ProfileContext.tsx`](src/contexts/ProfileContext.tsx) bypasses `/api/auth/me` verification when on public auth routes without an active local session, eliminating `401` log clutter.
* **Concurrent Check Deduplication:** [`SessionWatchdog.tsx`](src/components/auth/SessionWatchdog.tsx) implements an `inFlightCheck` guard and increases interaction throttling from 15s to 60s, completely suppressing duplicate parallel requests.
* **Centralized SSOT Consumption:** Replaced all ad-hoc component `fetch('/api/auth/me')` calls across the administrative and staff portals with reactive `useProfile()` state consumption.



## 🔐 Security Considerations

- Enforce authorization on protected server-side operations.
- Configure and test Row-Level Security policies.
- Validate API request data.
- Protect session cookies and authentication credentials.
- Apply appropriate account lockout and password recovery controls.
- Restrict access to sensitive administrative actions.
- Ensure audit logs are protected against unauthorized modification.
- Test file access and storage permissions before production deployment.

## 🔮 Future Enhancements

Potential enhancements include:

- Advanced file lifecycle tracking.
- Expanded reporting and analytics.
- Notification and reminder workflows.
- Enhanced audit reporting.
- Additional performance and accessibility improvements.

## 👨‍💻 Developer

**Malitha Tishamal**

Full-Stack Developer | DevOps | AI Enthusiast

- **GitHub:** [@malitha-tishamal](https://github.com/malitha-tishamal)
- **LinkedIn:** [Malitha Tishamal](https://www.linkedin.com/in/malitha-tishamal/)
- **Portfolio:** [malithatishamal.vercel.app](https://malithatishamal.vercel.app/)

## 🙏 Acknowledgements

Developed for digital workflow improvement at the **Southern Provincial Irrigation Department (SPID), Galle, Sri Lanka**.

## 📄 License

Add the appropriate license information based on the project's ownership and distribution permissions.
