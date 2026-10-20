# 📘 SPID Software Engineering Training & Internship Logbook

**Trainee / Engineer:** Malitha Tishamal  
**Project:** SPID (Southern Provincial Irrigation Department) File Management System  
**Training Period:** Week of 19 Oct 2026 – 26 Oct 2026  
**Supervision / Clearance:** Level 4 System Engineering  

---

## 📅 Daily Training Log Entries

### Day 1: Monday, 19 October 2026

#### 1. Tasks & Objectives
- Implemented an **Avatar Upload Confirmation & Preview Modal Workflow** in both Administrator and Staff profile management pages.
- Synchronized the **"Last Update" timestamp** dynamically across the client and database upon avatar modification.
- Connected **Real-Time Avatar Rendering** in Administrator & Staff Personnel Directories (`AccountTable`), replacing default static initials with verified profile pictures.
- Added client-side **Export to Excel (CSV with UTF-8 BOM)** and **Print to PDF** functionality to the Personnel and Admin management directories.

#### 2. Technical Implementation Details
1. **Confirmation State Machine in Profile Management (`/admin/profile` & `/staff/profile`):**
   - Engineered a 2-stage upload process preventing premature server writes on file selection.
   - Leveraged `FileReader` to create an ephemeral client-side Base64 preview (`pendingAvatarBase64`).
   - Integrated an interactive Confirmation Modal (`showAvatarConfirmModal`) allowing the user to inspect the crop and resolution before dispatching a multipart request.
   - Added a direct "Save New Avatar" fallback action button on the identity card.
   - Added an Avatar Removal Confirmation Modal (`showAvatarRemoveModal`) to safely reset the avatar to initials.

2. **Database & Metadata Synchronization (`ProfileController.ts` & `ProfileRepository.ts`):**
   - Extended `ProfileController.uploadAvatar` to update `auth.users.user_metadata.avatar_url` via `admin.auth.admin.updateUserById`.
   - Updated the `profiles` table `updated_at` column with `new Date().toISOString()` on each photo update.
   - Modified `ProfileRepository.ts` (`PROFILE_SELECT` and `listAllWithLockout`) to fetch and map `avatar_url` from auth metadata, making it accessible to directory tables.
   - Updated the `formattedUpdateDate` memoized hook in both profile pages to evaluate `profile?.updated_at || profile?.approved_at || profile?.created_at`, ensuring the UI date label reflects changes in real-time.

3. **Real-Time Directory Avatar Integration (`AccountTable.tsx`):**
   - Added local avatar state and listeners for the `spid_avatar_updated` and `storage` browser events.
   - Dynamically mapped table rows to display either the user's stored `avatar_url` (or active session avatar) with graceful fallback to two-letter initials on error.

4. **Directory Export & Reporting Engine (`AccountDirectoryPage.tsx`):**
   - **Export to Excel:** Programmed `handleExportExcel` to serialize filtered directory rows (ID, Name, Role, Email, Phone, Section, Status, Last Login) into a CSV document encoded with `\uFEFF` (Byte Order Mark) for native UTF-8 rendering in Microsoft Excel.
   - **Print to PDF:** Created `handlePrintPDF` with custom print CSS stylesheet and `@media print` rules, producing formatted landscape personnel rosters with official departmental letterheads.

#### 3. Files Modified & Added
- `src/types/auth.ts`: Added `updated_at` and `avatar_url` to `ProfileDTO`.
- `src/models/ProfileRepository.ts`: Added `updated_at` to select queries and `avatar_url` mapping in `listAllWithLockout`.
- `src/controllers/ProfileController.ts`: Updated `uploadAvatar` to sync `user_metadata` and update `profiles.updated_at`.
- `src/components/admin/AccountTable.tsx`: Added avatar image rendering and real-time event listeners.
- `src/components/admin/AccountDirectoryPage.tsx`: Integrated Export Excel and Print PDF buttons and reporting handlers.
- `src/app/admin/profile/page.tsx`: Implemented Avatar Confirmation modal, dynamic Last Update label, and removal confirmation.
- `src/app/staff/profile/page.tsx`: Implemented Avatar Confirmation modal, dynamic Last Update label, and removal confirmation.

#### 4. Testing & Verification
- `npx tsc --noEmit`: 0 errors.
- Verified modal confirmation flows and preview rendering for both Admin and Staff roles.
- Tested Excel export with special characters and commas; verified proper column delimitations in Excel.
- Tested print preview dialog in Chrome and Edge; verified print formatting.

#### 5. Competencies & Skills Gained
- Advanced React 19 state machines and modal confirmation patterns.
- Supabase Auth User Metadata integration and synchronization.
- Client-side document generation (CSV data blobs, dynamic HTML print streams).
- Real-time cross-component event broadcasting (`window.dispatchEvent` + `BroadcastChannel`).
