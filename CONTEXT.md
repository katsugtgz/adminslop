# EduAdmin Pro Premium

Domain glossary for the education administration product. This captures business language only; implementation details and roadmap sequencing belong elsewhere.

## Language

**Satuan Pendidikan**:
The primary operational data boundary for a school-like institution such as SD, SMP, SMA, SMK, madrasah, or equivalent learning unit.
_Avoid_: Tenant, workspace, account, customer, sekolah when used as a narrower synonym.

**Profil Satuan Pendidikan**:
The official identity information that describes one **Satuan Pendidikan**, such as name, NPSN, jenjang, address, logo, and **Kepala Satuan Pendidikan**.
_Avoid_: User profile, operational defaults, app-wide account settings.

**Pengaturan Satuan Pendidikan**:
Operational settings and defaults that control how one **Satuan Pendidikan** uses the product, such as time zone, **Tahun Ajaran Aktif**, **Semester Aktif**, and print preferences.
_Avoid_: Official identity only, global application settings, per-user preferences.

**Identitas Cetak**:
Official identity details shown on printed or exported school documents, such as the **Satuan Pendidikan** name, logo, address, NPSN, and **Kepala Satuan Pendidikan** name or identifier when applicable.
_Avoid_: Proof of approval, digital signature, document content verification, generic app branding.

**Tanda Tangan Cetak**:
Printed signature area or signature image used in document output for an official person such as **Kepala Satuan Pendidikan**.
_Avoid_: Legal digital signature, automatic approval, proof that document content was reviewed.

**Stempel Cetak**:
Printed stamp or stamp image used in document output for a **Satuan Pendidikan**.
_Avoid_: Legal seal workflow, content approval, replacement for audit trail or verification.

**Template Cetak**:
A controlled document layout used to produce consistent printed or exported output.
_Avoid_: Free-form page builder, per-school custom code, untested layout variant.

**Preferensi Cetak**:
Limited operational choices that adjust document output for one **Satuan Pendidikan**, such as A4/F4 paper size, margin, logo visibility, or header options.
_Avoid_: Unrestricted template editing, content approval workflow, personal user preference.

**Pratinjau Cetak**:
A preview of document output before printing or exporting.
_Avoid_: Official issued document, approval step, editable source document.

**Dokumen Cetak**:
The printed or exported output produced from a **Template Cetak** and relevant document data.
_Avoid_: Source record, editable draft, proof of legal signing.

**Pengguna**:
A person who signs in and can act in one or more **Satuan Pendidikan**.
_Avoid_: Account, tenant.

**Pendidik dan Tenaga Kependidikan (PTK)**:
A personnel record for an educator or education staff member inside one **Satuan Pendidikan**.
_Avoid_: Login account, access role, global employee identity, automatic **Pengguna**.

**Keanggotaan Satuan Pendidikan**:
The relationship that grants a **Pengguna** a role inside one **Satuan Pendidikan**.
_Avoid_: User role when it hides which Satuan Pendidikan the role belongs to.

**Satuan Pendidikan Aktif**:
The **Satuan Pendidikan** currently selected by a **Pengguna** as the operational context for tenant-scoped work.
_Avoid_: Global school context, mixed-school dashboard, client-supplied tenant.

**Peran Akses**:
A broad access label granted to a **Pengguna** through **Keanggotaan Satuan Pendidikan** inside one **Satuan Pendidikan**, such as **Admin Satuan Pendidikan**, **Guru**, **Wali Kelas**, or **Kepala Satuan Pendidikan** when that person has application access.
_Avoid_: Global superuser role, personnel record, job title by itself, UI-only label without authorization meaning.

**Izin Akses**:
A specific action that a **Pengguna** is allowed to perform inside one **Satuan Pendidikan** context, such as viewing **Absensi Harian**, changing **Nilai Peserta Didik**, or issuing **E-Raport**.
_Avoid_: Peran Akses, hidden button only, global permission, informal trust assumption.

**Pembatasan Akses**:
A rule or condition that limits or denies a **Pengguna** action inside one **Satuan Pendidikan** context.
_Avoid_: Broken feature, generic error, client-side-only guard, global ban without Satuan Pendidikan context.

**Peserta Didik**:
An individual recorded as learning inside one **Satuan Pendidikan**.
_Avoid_: Siswa as the canonical domain term, global student identity, cross-school merged learner record.

**Status Peserta Didik**:
The lifecycle state of a **Peserta Didik** inside one **Satuan Pendidikan**, such as Aktif, Pindah, Lulus, or Keluar.
_Avoid_: Deleting learner history, enrollment role, attendance status.

**Mutasi Peserta Didik**:
A recorded movement of a **Peserta Didik** into or out of a **Satuan Pendidikan**, including transfer-in or transfer-out situations.
_Avoid_: Silent deletion, automatic cross-school identity merge, ordinary class promotion.

**Alumni**:
A display label for a **Peserta Didik** whose **Status Peserta Didik** is Lulus.
_Avoid_: Separate person entity, new tenant boundary, deleted active learner record.

**Wali Peserta Didik**:
A responsible family member or guardian contact recorded for one **Peserta Didik** inside one **Satuan Pendidikan**.
_Avoid_: Parent login account, generic emergency contact, automatic **Pengguna** identity, messaging channel.

**Kontak Darurat**:
An optional contact used for urgent situations related to a **Peserta Didik**.
_Avoid_: Primary guardian responsibility, routine announcement channel, consent-free messaging target.

**Wali Kelas**:
A **Guru** or **PTK** assigned to guide one **Rombongan Belajar** for a specific **Tahun Ajaran** and **Semester**.
_Avoid_: Wali Peserta Didik, parent/guardian contact, automatic **Admin Satuan Pendidikan**, permanent teacher attribute.

**Rombongan Belajar**:
A group of **Peserta Didik** who learn together within one **Satuan Pendidikan** during a specific academic period, commonly labelled in the UI as a class such as 7A, 8B, or XII IPA 1.
_Avoid_: Kelas as the canonical domain term when it could mean grade level, room, teaching session, or cohort.

**Tingkat**:
The grade or level of learning, such as Kelas 7, Kelas 10, Fase E, or an equivalent curriculum level.
_Avoid_: Rombongan Belajar, ruang kelas, teaching session.

**Penempatan Rombongan Belajar**:
The placement record that connects one **Peserta Didik** to one **Rombongan Belajar** for a specific **Tahun Ajaran** and **Semester**.
_Avoid_: Overwriting the learner's current class, permanent identity attribute, class history deletion.

**Kenaikan Tingkat**:
The transition of a **Peserta Didik** from one **Tingkat** to the next academic level.
_Avoid_: Moving rooms only, editing class label, automatic deletion of prior placement history.

**Tinggal Tingkat**:
The condition where a **Peserta Didik** remains at the same **Tingkat** for the next academic period.
_Avoid_: Failed account, deleted learner, attendance status.

**Tahun Ajaran**:
The main academic period used by a **Satuan Pendidikan**, such as 2026/2027.
_Avoid_: Calendar year, fiscal year, generic year.

**Semester**:
A subdivision of a **Tahun Ajaran**, such as Ganjil or Genap.
_Avoid_: Calendar quarter, month range, one-off grading period.

**Tahun Ajaran Aktif**:
The **Tahun Ajaran** currently used as the default academic context for viewing or creating records.
_Avoid_: Only year available, irreversible archive boundary.

**Semester Aktif**:
The **Semester** currently used as the default academic context for viewing or creating records.
_Avoid_: Only semester available, hidden filter that prevents historical access.

**Penilaian**:
An assessment activity performed by a **Guru** for a learning context, such as an assignment, quiz, project, practice, or test.
_Avoid_: Nilai Akhir, raport score, raw number without assessment context.

**Komponen Nilai**:
A category or type used to group **Penilaian**, such as formative, summative, practice, or project.
_Avoid_: Final grade, arbitrary spreadsheet column, unexplained weighting bucket.

**Nilai Peserta Didik**:
The result received by one **Peserta Didik** for one **Penilaian**.
_Avoid_: Nilai Akhir, class average, teacher-only note.

**Nilai Akhir**:
The summarized or processed result used for reporting, derived from one or more **Nilai Peserta Didik** and any visible adjustment.
_Avoid_: Only source of truth, untraceable manual score, deleted assessment history.

**E-Raport**:
The learning result report document for one **Peserta Didik** in one **Satuan Pendidikan** for a specific **Semester**.
_Avoid_: Raw grade entry screen, always-editable recap, silently changing official report.

**Draf E-Raport**:
An **E-Raport** that has not yet been officially issued and may still be reviewed or corrected.
_Avoid_: Final report, permanent archive, student-facing official copy.

**E-Raport Terbit**:
An **E-Raport** version that has been officially issued for a **Peserta Didik** and should not be changed silently.
_Avoid_: Editable draft, temporary preview, untracked overwrite.

**Revisi E-Raport**:
A recorded correction to an **E-Raport Terbit** when an issued report needs to change.
_Avoid_: Silent edit, deleted previous version, informal teacher note.

**Absensi Harian**:
The daily attendance record for one **Peserta Didik** on one school day within a **Satuan Pendidikan**.
_Avoid_: Attendance for a specific lesson, QR scan event, generic activity log.

**Absensi Pembelajaran**:
Attendance for a **Peserta Didik** in a specific learning session or subject context.
_Avoid_: Whole-school daily attendance, school-day presence, QR capture method.

**Status Kehadiran**:
The attendance state recorded for an attendance entry, such as Hadir, Izin, Sakit, or Alpa.
_Avoid_: Free-text note as the primary status, QR scan success, punishment category.

**Absensi QR**:
A QR-assisted way to capture attendance, initially focused on **Absensi Harian** for the MVP.
_Avoid_: Canonical attendance model, proof that attendance cannot be corrected, replacement for Status Kehadiran.

**Butir Soal**:
One individual question item that can be reviewed, reused, and assembled into a question package.
_Avoid_: Whole exam package, unreviewed AI output, anonymous question text without learning context.

**Bank Soal**:
A reusable collection of **Butir Soal** available for search, review, and future use by a **Guru** inside a **Satuan Pendidikan**.
_Avoid_: One-off test file, final exam package, private scratchpad without review responsibility.

**Paket Soal**:
A selected arrangement of **Butir Soal** for a specific use, such as practice, quiz, test, or assessment.
_Avoid_: Raw question bank, single question item, permanent source of truth for all questions.

**Kunci Jawaban**:
The expected answer attached to a **Butir Soal** when the question type requires one.
_Avoid_: Student answer, grading result, teacher-only note unrelated to the question.

**Pembahasan**:
The explanation attached to a **Butir Soal** to help understand the answer or reasoning.
_Avoid_: Kunci Jawaban, generic lesson material, AI output that has not been reviewed.

**Perangkat Ajar**:
An umbrella term for teaching and learning planning documents prepared or reviewed by a **Guru** for a learning context.
_Avoid_: One fixed document format, unreviewed AI output, file detached from Satuan Pendidikan and academic context.

**Jenis Perangkat Ajar**:
The type of teaching document, such as Modul Ajar, RPP, ATP, Alur Tujuan Pembelajaran, Program Semester, or another recognized planning document type.
_Avoid_: Individual document instance, hard-coded single format, generic file category.

**Mata Pelajaran**:
A subject area taught in a **Satuan Pendidikan**, such as Matematika, Bahasa Indonesia, or PAI.
_Avoid_: Teacher assignment, learning session, generic topic, global teacher property.

**Pembelajaran**:
The learning-teaching activity or context where a **Guru**, **Peserta Didik**, and learning material meet for a specific purpose.
_Avoid_: Mata Pelajaran itself, daily attendance, document type.

**Beban Mengajar**:
The assignment of a **Guru** to teach a **Mata Pelajaran** for a **Rombongan Belajar** or **Tingkat** in a specific **Tahun Ajaran** and **Semester** inside one **Satuan Pendidikan**.
_Avoid_: Global teacher subject ownership, employment status, role label.

**Kurikulum**:
The official learning framework used by a **Satuan Pendidikan**, such as Kurikulum Merdeka or another recognized curriculum.
_Avoid_: AI-generated curriculum, random material collection, product help guide.

**Capaian Pembelajaran**:
An official learning achievement statement within a **Kurikulum** for a learning phase, level, or **Mata Pelajaran** context.
_Avoid_: Teacher's daily objective, unverified AI suggestion, Tujuan Pembelajaran.

**Tujuan Pembelajaran**:
A more specific learning objective derived from **Capaian Pembelajaran** for planning or teaching.
_Avoid_: Capaian Pembelajaran itself, activity step, assessment item.

**Alur Tujuan Pembelajaran**:
An ordered sequence of **Tujuan Pembelajaran** used to plan learning over a period or context.
_Avoid_: Raw unordered objective list, single Tujuan Pembelajaran, unreviewed AI-generated sequence.

**Admin Satuan Pendidikan**:
A **Pengguna** responsible for operational setup and records inside one **Satuan Pendidikan**.
_Avoid_: Superadmin, admin global.

**Guru**:
A **Pendidik dan Tenaga Kependidikan (PTK)** with teaching responsibility inside one **Satuan Pendidikan**.
_Avoid_: Teacher when the product language is Bahasa Indonesia, automatic login account, global subject owner.

**Kepala Satuan Pendidikan**:
A person or official position with formal leadership responsibility inside one **Satuan Pendidikan**, used for official identity, print/signature context, and E-Raport context.
_Avoid_: Superuser, owner, principal when used outside Bahasa Indonesia UI, automatic application admin, mandatory approver for every AI document.

**Permintaan AI**:
A user request for AI assistance to prepare or draft product content, such as questions, teaching documents, curriculum-related drafts, or usage help answers.
_Avoid_: Final document, automatic approval, hidden background magic, untraceable AI action.

**Draf AI**:
An initial AI-assisted result that still requires human review before it can be used as product content or an official document.
_Avoid_: Final approved content, verified document, source of truth without review.

**Status Permintaan AI**:
The processing state of a **Permintaan AI**, such as Diproses, Selesai, Gagal, or Dibatalkan.
_Avoid_: Hidden processing state, technical error code as primary user language, document approval status.

**Riwayat Perubahan**:
A record that important product data has been created, changed, removed, or corrected over time.
_Avoid_: Invisible overwrite, developer-only log, unrelated activity feed.

**Koreksi Data**:
A change made to fix important product data after it has already been saved or used.
_Avoid_: Silent edit, deletion of prior state, informal note without accountability.

**Catatan Audit**:
A trace of who performed an important action, what changed, when it happened, and in which **Satuan Pendidikan** context.
_Avoid_: Global superadmin feature, public activity feed, technical debug log as user-facing language.

**Mode Offline**:
A limited working condition where a **Pengguna** can continue selected safe tasks when internet connection is poor or unavailable.
_Avoid_: Full offline product, bypassing server authorization, offline issuing of official documents.

**Perubahan Tertunda**:
Data entered or changed on the user's device that has not yet been synchronized to the server.
_Avoid_: Officially saved server record, invisible local-only data, completed synchronization.

**Sinkronisasi Data**:
The process of sending **Perubahan Tertunda** to the server and receiving the latest relevant server data.
_Avoid_: Manual export/import, backup only, proof that no conflict can happen.

**Konflik Sinkronisasi**:
A condition where local **Perubahan Tertunda** and server data differ in a way that needs safe resolution.
_Avoid_: Technical error only, automatic data loss, silent overwrite.

**Impor Data**:
The process of bringing records from a file or template into one **Satuan Pendidikan Aktif**.
_Avoid_: Silent overwrite, cross-school merge, unrestricted bulk update, bypassing validation.

**Template Impor**:
A product-provided file format used to prepare data for **Impor Data**.
_Avoid_: Arbitrary spreadsheet shape, source of truth, per-school custom schema, final saved record.

**Validasi Impor**:
The review and checking step before imported data is saved or used.
_Avoid_: Final save, silent correction, automatic duplicate merge, technical parser success only.

**Hasil Impor**:
A user-facing summary of an import attempt, including records that succeeded, failed, or need correction.
_Avoid_: Hidden log, final data model, proof that all rows were accepted, technical stack trace.

**Ekspor Data**:
The process of taking product data out of the system for archive, reporting, or operational use within one **Satuan Pendidikan** context.
_Avoid_: Unrestricted data dump, cross-Satuan Pendidikan export, backup substitute, permission-free sharing.

**Arsip Data**:
Important product data that is no longer active for daily operations but remains stored for history, reporting, or accountability.
_Avoid_: Permanent deletion, hidden loss of history, backup file only, active operational record.

**Penghapusan Data**:
The action of removing data from active use or normal operational views.
_Avoid_: Automatic hard delete, silent disappearance, erasing used academic records, bypassing audit.

**Pemulihan Data**:
The action of returning archived or deleted data to active use when rules still allow it.
_Avoid_: Recreating unrelated new data, undo without audit, restoring data across Satuan Pendidikan boundaries.

**Retensi Data**:
Rules for how long important product data is kept and under what conditions it may be archived, deleted, or restored.
_Avoid_: Ad-hoc cleanup, storage optimization only, user preference without policy, silent expiry.

**Notifikasi**:
A user-facing notice inside the application about something that needs attention or has changed.
_Avoid_: External messaging channel, spam, technical system log, hidden background status.

**Pengingat**:
A notice that prompts a **Pengguna** to act before or around a due time or expected completion point.
_Avoid_: Punishment, generic notification without action, external reminder without consent.

**Tugas Tertunda**:
Work that has not been completed and needs attention from a **Pengguna** in the relevant **Satuan Pendidikan** context.
_Avoid_: Technical background job, completed task, hidden queue, cross-school task list.

**Preferensi Notifikasi**:
Choices that control which notifications a **Pengguna** or **Satuan Pendidikan** receives.
_Avoid_: Consent-free external messages, global spam switch, authorization rule, audit substitute.

**Dokumen AI**:
A learning or administration document whose draft content is produced with AI assistance and remains the responsibility of a **Guru**.
_Avoid_: Auto-approved document, machine-authored final document.

**Verifikasi Dokumen AI**:
A **Guru**'s confirmation that they have reviewed and take responsibility for a **Dokumen AI**.
_Avoid_: Approval by AI, automatic signature, principal-only approval.

**Panduan Penggunaan**:
User-facing guidance that helps a **Pengguna** understand how to use the product without needing direct explanation from the builder.
_Avoid_: Developer documentation, technical manual, training that assumes expert users.

**Tur Awal**:
A short first-use walkthrough that introduces a screen or module in a few simple steps.
_Avoid_: Long tutorial, mandatory training course, hidden documentation.

**Bantuan Kontekstual**:
Guidance shown near the current task, such as examples, empty-state instructions, and help actions that explain what to do next.
_Avoid_: Generic help page disconnected from the user's current screen.

**Bantuan AI**:
An assistant-like help experience that answers usage questions using approved product guidance and school-administration knowledge.
_Avoid_: Unverified advice, support chatbot that invents product behavior, replacement for clear UI.

**Instansi Pengelola**:
An optional organization above one or more **Satuan Pendidikan** for future purchasing, oversight, or distribution relationships.
_Avoid_: Tenant utama, batas data operasional.

## Relationships

- A **Pengguna** may have **Keanggotaan Satuan Pendidikan** in many **Satuan Pendidikan**.
- A **Satuan Pendidikan** may have many **Pengguna** through **Keanggotaan Satuan Pendidikan**.
- A **Keanggotaan Satuan Pendidikan** grants one or more **Peran Akses** such as **Admin Satuan Pendidikan**, **Guru**, **Wali Kelas**, or **Kepala Satuan Pendidikan** inside that **Satuan Pendidikan** only.
- A **Peran Akses** groups broad responsibility, while **Izin Akses** describes a specific allowed action and **Pembatasan Akses** describes why an action is limited or denied.
- Access decisions apply within the active **Satuan Pendidikan** context and must not rely on a global superuser concept or UI visibility alone.
- A **Pendidik dan Tenaga Kependidikan (PTK)** is personnel data inside one **Satuan Pendidikan** and does not automatically imply a **Pengguna** login.
- A **PTK** may be connected to a **Pengguna** through **Keanggotaan Satuan Pendidikan** when that person needs application access.
- A **Guru** is a **PTK** with teaching responsibility or **Beban Mengajar**; **Admin Satuan Pendidikan** is an access role, not automatically personnel data.
- **Kepala Satuan Pendidikan** primarily describes the official leadership person or position for **Profil Satuan Pendidikan**, print/signature context, and E-Raport context; it does not automatically imply login access.
- When a **Kepala Satuan Pendidikan** needs to use the application, that person must also be represented as a **Pengguna** with **Keanggotaan Satuan Pendidikan** and the appropriate access role.
- **Profil Satuan Pendidikan** describes the official identity of one **Satuan Pendidikan**; **Pengaturan Satuan Pendidikan** controls its operational defaults. The UI may use the friendlier label "Pengaturan Sekolah", but the domain language remains **Satuan Pendidikan**.
- **Identitas Cetak** is derived from **Profil Satuan Pendidikan** for document output and may include the **Kepala Satuan Pendidikan** context needed for printed forms.
- **Tanda Tangan Cetak** and **Stempel Cetak** are print-output elements in the MVP; they do not by themselves prove approval, legal digital signing, or **Verifikasi Dokumen AI**.
- A **Dokumen Cetak** is produced from a **Template Cetak**, relevant document data, **Identitas Cetak**, and any allowed **Preferensi Cetak**.
- **Preferensi Cetak** allows limited per-**Satuan Pendidikan** output choices, while **Template Cetak** remains controlled by the product for consistency and testability.
- **Pratinjau Cetak** helps users inspect output before print or export, but it is not an approval workflow or official issued document by itself.
- A **Pengguna** acts on tenant-scoped records through exactly one **Satuan Pendidikan Aktif** at a time; if only one membership exists, it may be selected automatically, but switching Satuan Pendidikan is explicit.
- A **Peserta Didik** belongs to one **Satuan Pendidikan** for operational records in the MVP; moving to another Satuan Pendidikan creates a separate destination record rather than automatically merging identity across schools.
- **Status Peserta Didik** indicates whether a Peserta Didik is Aktif, Pindah, Lulus, or Keluar without deleting historical records such as values, attendance, or E-Raport.
- **Mutasi Peserta Didik** records transfer-related movement into or out of a Satuan Pendidikan; **Alumni** is a display label for a Peserta Didik with Status Peserta Didik Lulus, not a separate entity.
- A **Peserta Didik** may have one or more **Wali Peserta Didik** contacts inside one **Satuan Pendidikan**; a **Wali Peserta Didik** is not automatically a **Pengguna** of the application in the MVP.
- **Kontak Darurat** may be recorded for urgent situations, but it does not replace **Wali Peserta Didik** responsibility or create a routine messaging channel.
- A **Wali Kelas** is a **Guru** or **PTK** assignment for one **Rombongan Belajar** in a specific **Tahun Ajaran** and **Semester**, and may coordinate recap, attendance, communication, or E-Raport duties for that Rombongan Belajar.
- **Wali Kelas** is not the same as **Wali Peserta Didik** and is not automatically an **Admin Satuan Pendidikan**; the assignment should be historical, not a permanent field on the Guru or Rombongan Belajar.
- NIS or NISN may describe a **Peserta Didik**, but neither replaces **Satuan Pendidikan** as the data boundary.
- A **Rombongan Belajar** contains many **Peserta Didik** and belongs to one **Satuan Pendidikan** for a specific academic period.
- A **Tingkat** can be shared by many **Rombongan Belajar**; for example, 7A and 7B are different Rombongan Belajar at the same Tingkat.
- **Penempatan Rombongan Belajar** records which **Rombongan Belajar** a **Peserta Didik** belongs to for a specific **Tahun Ajaran** and **Semester**; current class context should be derived from placement, not overwritten on the Peserta Didik record.
- **Kenaikan Tingkat** and **Tinggal Tingkat** describe academic progression decisions while preserving prior **Penempatan Rombongan Belajar** history for values, attendance, and E-Raport.
- **Tahun Ajaran** and **Semester** form the main academic time context for records such as values, attendance, E-Raport, Rombongan Belajar, learning documents, and question banks.
- **Tahun Ajaran Aktif** and **Semester Aktif** provide defaults for current work, but older academic records remain accessible when selected explicitly.
- A **Penilaian** belongs to a learning context in one **Satuan Pendidikan**, **Tahun Ajaran**, and **Semester**, and may be grouped by **Komponen Nilai**.
- A **Nilai Peserta Didik** records one **Peserta Didik**'s result for one **Penilaian**.
- A **Nilai Akhir** is used for reporting and should remain traceable to its contributing **Nilai Peserta Didik** and any visible adjustment.
- An **E-Raport** is prepared for one **Peserta Didik** in one **Satuan Pendidikan** for a specific **Semester**, using **Nilai Akhir** and other reportable learning information.
- A **Draf E-Raport** may be reviewed or corrected before issuing; an **E-Raport Terbit** is the official issued version.
- Changes after an **E-Raport Terbit** should be represented as a **Revisi E-Raport**, not as a silent overwrite.
- **Absensi Harian** records a **Status Kehadiran** for one **Peserta Didik** on one school day within one **Satuan Pendidikan**.
- **Absensi Pembelajaran** records attendance for a specific learning session and should not be conflated with **Absensi Harian**.
- **Absensi QR** is a capture method for **Absensi Harian** in the MVP; a QR scan supports attendance entry but does not replace **Status Kehadiran** or correction rules.
- A **Butir Soal** may include **Kunci Jawaban** and **Pembahasan** when relevant, and remains subject to **Guru** review before use.
- A **Bank Soal** contains reusable **Butir Soal**; a **Paket Soal** is assembled from selected Butir Soal for a specific practice, quiz, test, or assessment use.
- AI may assist in drafting **Butir Soal**, **Kunci Jawaban**, or **Pembahasan**, but the reviewed question remains the responsibility of the **Guru** who uses it.
- A **Permintaan AI** produces a **Draf AI** when successful; that draft is not final content until the responsible human reviews it through the relevant domain process.
- **Status Permintaan AI** must make the AI workflow visible to the user with simple states such as Diproses, Selesai, Gagal, or Dibatalkan.
- **Riwayat Perubahan** records important changes to product data so records do not change silently.
- **Koreksi Data** is used when saved or previously used data needs to be fixed, while preserving accountability for the change.
- **Catatan Audit** captures who did what, when, and in which **Satuan Pendidikan** context; it is not a global superuser concept.
- Important records such as **Nilai Akhir**, **E-Raport Terbit**, **Absensi Harian**, **Status Peserta Didik**, and **Perangkat Ajar** should use **Riwayat Perubahan**, **Koreksi Data**, or **Catatan Audit** when changed after meaningful use.
- **Mode Offline** supports selected safe tasks only; suitable early candidates include **Absensi Harian** input or draft **Nilai Peserta Didik** entry.
- **Perubahan Tertunda** should be clearly visible to the user as data saved on the device but not yet synchronized to the server.
- **Sinkronisasi Data** sends **Perubahan Tertunda** and refreshes server data; if local and server data differ, the result is a **Konflik Sinkronisasi** that must be resolved without silent overwrite.
- Sensitive actions such as issuing **E-Raport Terbit**, making **Koreksi Data**, or completing **Verifikasi Dokumen AI** should remain online-only until explicit future rules exist.
- **Impor Data** and **Ekspor Data** operate within one **Satuan Pendidikan Aktif** and must respect that tenant boundary.
- **Impor Data** should use a **Template Impor**, pass **Validasi Impor**, and produce a **Hasil Impor** before users treat the data as accepted.
- Similar NIS, NISN, names, or other potential matches during **Impor Data** should be shown for review rather than silently merged or overwritten.
- **Ekspor Data** produces data for archive, reporting, or operational use and remains subject to **Peran Akses**, **Izin Akses**, and **Catatan Audit** where appropriate.
- Important records such as **Peserta Didik**, **PTK**, **Nilai Peserta Didik**, **Nilai Akhir**, **Absensi Harian**, **E-Raport**, and **Perangkat Ajar** should normally move to **Arsip Data** or use controlled **Penghapusan Data**, not hard delete.
- **Penghapusan Data**, **Pemulihan Data**, and **Retensi Data** for important records should preserve **Catatan Audit** and avoid silent loss of history.
- Hard delete is exceptional and should be reserved for clearly scoped cases such as unused mistaken input, privacy or legal requests, or explicit internal administrative procedure.
- **Notifikasi** and **Pengingat** should use simple user-facing language and focus attention on **Tugas Tertunda** or important changes inside the relevant **Satuan Pendidikan** context.
- **Preferensi Notifikasi** controls notification choices but does not replace **Peran Akses**, **Izin Akses**, consent rules, or **Catatan Audit**.
- External channels such as WhatsApp, email, or parent-facing messages should require explicit future consent and audit decisions before becoming routine notification channels.
- **Perangkat Ajar** is classified by **Jenis Perangkat Ajar** and belongs to one **Satuan Pendidikan**, **Tahun Ajaran**, and optionally a **Semester**.
- A **Perangkat Ajar** may be related to a **Tingkat**, **Rombongan Belajar**, or subject context depending on the document type.
- A **Perangkat Ajar** produced with AI assistance is treated as a **Draf AI** and **Dokumen AI** until the responsible **Guru** completes **Verifikasi Dokumen AI**.
- A **Mata Pelajaran** describes the subject area; a **Pembelajaran** describes a learning-teaching context or activity involving that subject area.
- A **Guru** teaches through **Beban Mengajar** inside one **Satuan Pendidikan**; the Guru does not globally own a **Mata Pelajaran** across all contexts.
- A **Beban Mengajar** connects one **Guru** with a **Mata Pelajaran**, **Tahun Ajaran**, **Semester**, and either a **Rombongan Belajar** or **Tingkat** depending on the school setup.
- A **Kurikulum** provides **Capaian Pembelajaran**; **Tujuan Pembelajaran** is derived from Capaian Pembelajaran; **Alur Tujuan Pembelajaran** orders Tujuan Pembelajaran for planning.
- **Perangkat Ajar**, **Bank Soal**, **Paket Soal**, **Penilaian**, and **Pembelajaran** may reference **Kurikulum**, **Capaian Pembelajaran**, **Tujuan Pembelajaran**, or **Alur Tujuan Pembelajaran** as learning context.
- AI may assist in preparing curriculum-related drafts or structured seed data, but official curriculum meaning must remain traceable to approved sources and reviewed before product use.
- A **Dokumen AI** is verified through **Verifikasi Dokumen AI** by the responsible **Guru**; AI output never becomes official or ready-to-use content merely because the **Permintaan AI** finished successfully.
- **Panduan Penggunaan** may appear as **Tur Awal**, **Bantuan Kontekstual**, or **Bantuan AI**, but the baseline UI must remain understandable without relying on AI assistance.
- An **Instansi Pengelola** may oversee or purchase for many **Satuan Pendidikan**, but does not replace **Satuan Pendidikan** as the operational data boundary.

## Example dialogue

> **Dev:** "Kalau satu guru mengajar di dua sekolah, apakah datanya bercampur?"
> **Domain expert:** "Tidak. **Guru** adalah **PTK** di Satuan Pendidikan itu. Jika Guru tersebut punya akun, ia menjadi **Pengguna** yang memilih **Satuan Pendidikan Aktif** melalui **Keanggotaan Satuan Pendidikan** sebelum melihat **Peserta Didik**, nilai, **E-Raport**, absensi, atau perangkat ajar."

## Flagged ambiguities

- "Tenant", "sekolah", "customer", dan "account" sempat bisa berarti batas data yang berbeda — resolved: **Satuan Pendidikan** adalah batas data operasional utama; **Instansi Pengelola** hanya layer opsional di atasnya.
- "Profil sekolah", "pengaturan sekolah", "school config", dan "tenant settings" sempat bisa mencampur identitas resmi dengan default operasional — resolved: **Profil Satuan Pendidikan** menyimpan identitas resmi, sedangkan **Pengaturan Satuan Pendidikan** menyimpan default operasional; label UI boleh memakai "Pengaturan Sekolah" agar ramah pengguna.
- "Admin", "superadmin", dan "owner" sempat bisa berarti kuasa global — resolved: role awal MVP hanya berlaku di dalam satu **Satuan Pendidikan** melalui **Keanggotaan Satuan Pendidikan**.
- "Role", "permission", "izin", "akses", "boleh edit", dan "sembunyikan tombol" sempat bisa mencampur label peran dengan tindakan spesifik — resolved: **Peran Akses** adalah label tanggung jawab dalam satu Satuan Pendidikan, **Izin Akses** adalah tindakan yang diizinkan, **Pembatasan Akses** adalah batas/penolakan tindakan, dan tidak ada superuser global.
- "Guru", "data guru", "PTK", "akun guru", dan "admin sekolah" sempat bisa mencampur data personel dengan akun login — resolved: **Pendidik dan Tenaga Kependidikan (PTK)** adalah data personel, **Guru** adalah PTK dengan tanggung jawab mengajar, **Pengguna** adalah identitas login, dan **Admin Satuan Pendidikan** adalah role akses.
- "Kepala sekolah", "Kepala Satuan Pendidikan", "approval kepala", dan "akun kepala" sempat bisa mencampur jabatan resmi dengan akses aplikasi — resolved: **Kepala Satuan Pendidikan** adalah jabatan/personel resmi untuk profil, cetakan, tanda tangan, dan konteks E-Raport; akses aplikasi tetap melalui **Pengguna** dan **Keanggotaan Satuan Pendidikan** bila diperlukan.
- "Tanda tangan", "stempel", "signature", "cap sekolah", dan "digital signature" sempat bisa mencampur tampilan cetak dengan approval atau tanda tangan legal — resolved: **Identitas Cetak**, **Tanda Tangan Cetak**, dan **Stempel Cetak** adalah elemen output cetak MVP; approval konten tetap melalui proses domain seperti **Verifikasi Dokumen AI**, sedangkan digital signature/legal audit dapat menjadi fitur lanjutan.
- "Template", "format cetak", "custom layout", "print setting", dan "preview" sempat bisa mencampur layout terkendali dengan editor bebas — resolved: MVP memakai **Template Cetak** yang dikendalikan produk, **Preferensi Cetak** yang terbatas per Satuan Pendidikan, **Pratinjau Cetak** sebelum output, dan **Dokumen Cetak** sebagai hasil print/export.
- "Generate AI", "hasil AI", "draft AI", "AI selesai", dan "AI error" sempat bisa mencampur proses bantuan AI dengan dokumen final — resolved: **Permintaan AI** adalah permintaan proses, **Draf AI** adalah hasil awal yang harus direview, **Status Permintaan AI** menjelaskan Diproses/Selesai/Gagal/Dibatalkan, dan dokumen tetap membutuhkan proses domain seperti **Verifikasi Dokumen AI** sebelum siap dipakai.
- "Log", "audit", "riwayat", "koreksi", "hapus", dan "undo" sempat bisa mencampur jejak perubahan pengguna dengan log teknis — resolved: **Riwayat Perubahan** mencatat data penting yang berubah, **Koreksi Data** memperbaiki data yang sudah tersimpan/dipakai, dan **Catatan Audit** menyimpan siapa melakukan apa, kapan, serta dalam konteks **Satuan Pendidikan** mana.
- "Offline", "sinkron", "sync", "tersimpan", "pending", dan "konflik" sempat bisa mencampur data tersimpan di perangkat dengan data resmi server — resolved: **Mode Offline** hanya untuk tugas aman terbatas, **Perubahan Tertunda** adalah data lokal yang belum tersinkron, **Sinkronisasi Data** mengirim/mengambil data server, dan **Konflik Sinkronisasi** diselesaikan tanpa silent overwrite.
- "Import", "upload Excel", "template", "validasi", "duplikat", "export", dan "download data" sempat bisa mencampur perpindahan data dengan overwrite massal atau ekspor lintas sekolah — resolved: **Impor Data** memakai **Template Impor**, melewati **Validasi Impor**, menghasilkan **Hasil Impor**, tidak silent overwrite/merge, dan **Ekspor Data** tetap berada dalam satu **Satuan Pendidikan Aktif**.
- "Hapus", "arsip", "restore", "hard delete", "retensi", dan "bersihkan data" sempat bisa mencampur data tidak aktif dengan penghapusan permanen — resolved: data penting normalnya menjadi **Arsip Data** atau melalui **Penghapusan Data** terkendali, **Pemulihan Data** mengikuti aturan, **Retensi Data** menjelaskan lama penyimpanan, dan hard delete hanya kasus khusus dengan **Catatan Audit**.
- "Notifikasi", "reminder", "pengingat", "tugas", "WhatsApp", "email", dan "spam" sempat bisa mencampur pemberitahuan dalam aplikasi dengan kanal eksternal — resolved: MVP memakai **Notifikasi** dan **Pengingat** dalam aplikasi untuk **Tugas Tertunda**, **Preferensi Notifikasi** mengatur pilihan notifikasi, dan kanal eksternal butuh keputusan lanjutan soal consent serta audit.
- "Signature gate" dan "verifikasi" sempat bisa berarti persetujuan kepala sekolah — resolved: **Verifikasi Dokumen AI** adalah tanggung jawab **Guru** yang meninjau isi dokumen.
- "Konteks sekolah", "sekolah aktif", dan "dashboard lintas sekolah" sempat bisa mencampur data — resolved: operasi data selalu berjalan dalam satu **Satuan Pendidikan Aktif**; dashboard lintas Satuan Pendidikan bukan bagian MVP.
- "Tutorial", "splash", "self guide", dan "help" sempat bisa berarti dokumentasi teknis — resolved: produk memakai **Panduan Penggunaan** untuk pengguna non-teknis, dengan **Tur Awal**, **Bantuan Kontekstual**, dan **Bantuan AI** sebagai bentuknya.
- "Siswa", "murid", **Peserta Didik**, NIS, dan NISN sempat bisa berarti identitas lintas sekolah — resolved: **Peserta Didik** adalah istilah domain utama untuk individu yang tercatat belajar di satu **Satuan Pendidikan**; NIS/NISN hanya atribut pengenal, bukan mekanisme penggabungan data lintas Satuan Pendidikan.
- "Pindah", "lulus", "keluar", "alumni", dan "hapus siswa" sempat bisa mencampur lifecycle dengan penghapusan data — resolved: **Status Peserta Didik** menyatakan Aktif/Pindah/Lulus/Keluar, **Mutasi Peserta Didik** mencatat perpindahan, dan **Alumni** hanya label untuk Peserta Didik berstatus Lulus; riwayat nilai, absensi, dan E-Raport tidak dihapus.
- "Orang tua", "wali", "kontak darurat", "login wali", dan "WhatsApp orang tua" sempat bisa mencampur kontak administratif dengan akun pengguna atau kanal pesan — resolved: **Wali Peserta Didik** adalah kontak/penanggung jawab administratif, **Kontak Darurat** opsional untuk kondisi mendesak, dan parent login/notifikasi orang tua bukan bagian MVP kecuali diputuskan sebagai fitur lanjutan dengan consent dan audit.
- "Wali", "wali kelas", "wali murid", dan "wali siswa" sempat bisa mencampur penugasan Guru dengan kontak keluarga — resolved: **Wali Kelas** adalah Guru/PTK yang ditugaskan membina Rombongan Belajar per Tahun Ajaran/Semester, sedangkan **Wali Peserta Didik** adalah kontak/penanggung jawab keluarga.
- "Kelas" sempat bisa berarti rombel, tingkat, ruang, atau sesi belajar — resolved: **Rombongan Belajar** adalah kelompok Peserta Didik seperti 7A/8B/XII IPA 1, sedangkan **Tingkat** adalah level seperti Kelas 7 atau Fase E.
- "Naik kelas", "pindah kelas", "kelas sekarang", dan "tidak naik" sempat bisa mendorong overwrite data Peserta Didik — resolved: **Penempatan Rombongan Belajar** menyimpan riwayat rombel per Tahun Ajaran/Semester, sedangkan **Kenaikan Tingkat** dan **Tinggal Tingkat** menjelaskan keputusan progres akademik tanpa menghapus riwayat lama.
- "Tahun", "periode", dan "semester aktif" sempat bisa tercampur dengan tahun kalender atau filter tersembunyi — resolved: **Tahun Ajaran** + **Semester** adalah konteks waktu akademik utama; **Tahun Ajaran Aktif** dan **Semester Aktif** hanya default, bukan penghalang akses data lama.
- "Nilai" sempat bisa berarti angka harian, aktivitas penilaian, komponen rekap, atau nilai raport — resolved: **Penilaian** adalah aktivitasnya, **Nilai Peserta Didik** adalah hasil per Peserta Didik, dan **Nilai Akhir** adalah hasil rekap yang tetap bisa ditelusuri.
- "Raport", "E-Raport", "nilai final", dan "terbit" sempat bisa tercampur antara rekap yang masih berubah dan dokumen resmi — resolved: **Nilai Akhir** adalah bahan pelaporan, **Draf E-Raport** masih dapat diperiksa, **E-Raport Terbit** adalah versi resmi, dan koreksi setelah terbit dicatat sebagai **Revisi E-Raport**.
- "Absensi", "presensi", "QR", dan "kehadiran" sempat bisa berarti kehadiran harian, kehadiran per pelajaran, atau cara scan — resolved: MVP memakai **Absensi Harian** sebagai model utama, **Status Kehadiran** untuk Hadir/Izin/Sakit/Alpa, dan **Absensi QR** hanya sebagai cara pencatatan.
- "Bank soal", "soal", "paket ujian", "kunci", dan "pembahasan" sempat bisa tercampur antara item soal dan susunan ujian — resolved: **Butir Soal** adalah item individual, **Bank Soal** adalah kumpulan reusable, **Paket Soal** adalah susunan untuk kebutuhan tertentu, dengan **Kunci Jawaban** dan **Pembahasan** melekat ke Butir Soal jika relevan.
- "Perangkat Ajar", "Modul Ajar", "RPP", "ATP", dan "Program Semester" sempat bisa dianggap satu format dokumen — resolved: **Perangkat Ajar** adalah istilah payung, sedangkan **Jenis Perangkat Ajar** membedakan jenis dokumennya.
- "Mapel", "pelajaran", "pembelajaran", dan "guru mapel" sempat bisa mencampur bidang pelajaran dengan penugasan guru — resolved: **Mata Pelajaran** adalah bidangnya, **Pembelajaran** adalah konteks/aktivitas belajar-mengajar, dan **Beban Mengajar** adalah penugasan Guru dalam satu Satuan Pendidikan.
- "Kurikulum", "CP", "TP", "ATP", "Panduan Kurikulum", dan "AI seed" sempat bisa mencampur struktur resmi dengan materi buatan — resolved: **Kurikulum** adalah kerangka resmi, **Capaian Pembelajaran** adalah capaian resmi, **Tujuan Pembelajaran** adalah turunan yang lebih spesifik, dan **Alur Tujuan Pembelajaran** adalah urutan TP; AI boleh membantu persiapan tetapi bukan sumber kebenaran tanpa pelacakan sumber dan review.
