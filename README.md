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
- File requisition review and approval workflows.
- Profile management and account security features.
- Audit log access.

### 👔 Staff Portal

- Staff dashboard with relevant file and request information.
- File searching and registration.
- File requisition and checkout requests.
- Request status tracking.
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
- File identification and categorization.
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
