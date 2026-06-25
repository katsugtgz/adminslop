# EduAdmin Pro Premium

Domain glossary for the education administration product. This captures business language only; implementation details and roadmap sequencing belong elsewhere.

## Language

**Satuan Pendidikan**:
The primary operational data boundary for a school-like institution such as SD, SMP, SMA, SMK, madrasah, or equivalent learning unit.
_Avoid_: Tenant, workspace, account, customer, sekolah when used as a narrower synonym.

**Pengguna**:
A person who signs in and can act in one or more **Satuan Pendidikan**.
_Avoid_: Account, tenant.

**Keanggotaan Satuan Pendidikan**:
The relationship that grants a **Pengguna** a role inside one **Satuan Pendidikan**.
_Avoid_: User role when it hides which Satuan Pendidikan the role belongs to.

**Admin Satuan Pendidikan**:
A **Pengguna** responsible for operational setup and records inside one **Satuan Pendidikan**.
_Avoid_: Superadmin, admin global.

**Guru**:
A **Pengguna** responsible for teaching-related records and learning documents inside one **Satuan Pendidikan**.
_Avoid_: Teacher when the product language is Bahasa Indonesia.

**Kepala Satuan Pendidikan**:
A **Pengguna** with formal leadership responsibility inside one **Satuan Pendidikan**.
_Avoid_: Superuser, owner, principal when used outside Bahasa Indonesia UI.

**Instansi Pengelola**:
An optional organization above one or more **Satuan Pendidikan** for future purchasing, oversight, or distribution relationships.
_Avoid_: Tenant utama, batas data operasional.

## Relationships

- A **Pengguna** may have **Keanggotaan Satuan Pendidikan** in many **Satuan Pendidikan**.
- A **Satuan Pendidikan** may have many **Pengguna** through **Keanggotaan Satuan Pendidikan**.
- A **Keanggotaan Satuan Pendidikan** grants one or more role labels such as **Admin Satuan Pendidikan**, **Guru**, or **Kepala Satuan Pendidikan** inside that **Satuan Pendidikan** only.
- An **Instansi Pengelola** may oversee or purchase for many **Satuan Pendidikan**, but does not replace **Satuan Pendidikan** as the operational data boundary.

## Example dialogue

> **Dev:** "Kalau satu guru mengajar di dua sekolah, apakah datanya bercampur?"
> **Domain expert:** "Tidak. Guru itu adalah satu **Pengguna**, tetapi ia memilih **Satuan Pendidikan** aktif melalui **Keanggotaan Satuan Pendidikan** sebelum melihat siswa, nilai, raport, absensi, atau perangkat ajar."

## Flagged ambiguities

- "Tenant", "sekolah", "customer", dan "account" sempat bisa berarti batas data yang berbeda — resolved: **Satuan Pendidikan** adalah batas data operasional utama; **Instansi Pengelola** hanya layer opsional di atasnya.
- "Admin", "superadmin", dan "owner" sempat bisa berarti kuasa global — resolved: role awal MVP hanya berlaku di dalam satu **Satuan Pendidikan** melalui **Keanggotaan Satuan Pendidikan**.
