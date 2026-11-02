# متطلبات ملف التثبيت الأوفلاين — Offline installer prerequisites

ملف تثبيت رفيق POS يجب أن يثبت البرنامج ويشغّله **بدون إنترنت** على Windows 7 SP1 (32/64 بت) حتى Windows 11.
لذلك تُدمج ملفات مايكروسوفت التالية داخل ملف Setup. ملفات مايكروسوفت هذه **غير موجودة في المستودع**؛ يجب على المسؤول عن البناء تحميلها مرة واحدة ووضعها في هذا المجلد.

The Rafiq POS Setup must install and start **offline** on Windows 7 SP1 (x86/x64) through Windows 11, so the
Microsoft files below are bundled into the Setup. They are **not stored in the repository**: the build maintainer
downloads them once and places them in this folder (`installer\prerequisites\`, or the folder named by the
`RAFIQ_PREREQ_DIR` environment variable).

## 1. ملفات إلزامية في هذا المجلد — Required files in this folder

| # | File (exact name) | Version | Official download | Used for |
|---|---|---|---|---|
| 1 | `ndp48-x86-x64-allos-enu.exe` | .NET Framework 4.8 offline installer (121,346,568 bytes; Microsoft serves it as `NDP48-x86-x64-AllOS-ENU.exe`) | https://go.microsoft.com/fwlink/?linkid=2088631 (page: https://dotnet.microsoft.com/download/dotnet-framework/net48 → "Runtime – Offline installer") | Installed silently by Setup when .NET 4.8 (Release ≥ 528040) is missing |
| 2 | `Microsoft.WebView2.FixedVersionRuntime.109.0.1518.140.x86.cab` | WebView2 Fixed Version Runtime **109.0.1518.140, x86** | https://developer.microsoft.com/microsoft-edge/webview2/ → "Fixed Version" → version 109.0.1518.140, architecture x86 | Extracted by the build script into `desktop\bin\Release\runtimes\fixed109` and installed to `{app}\runtimes\fixed109`. Mandatory on Windows 7/8/8.1 (109 is the last version supporting them); offline fallback on Windows 10/11 when Evergreen is not installed (e.g. Windows 10 LTSC) |
| 3 | `MicrosoftEdgeWebview2Setup.exe` | WebView2 Evergreen bootstrapper (already in the repo) | https://go.microsoft.com/fwlink/p/?LinkId=2124703 | Optional, unchecked "install latest WebView2 (needs internet)" option on the finish page (Windows 10/11 only) |

- اختر نسخة **x86** من مشغل العرض حتى على ويندوز 64 بت؛ برنامج رفيق مبني 32 بت (x86).
  Use the **x86** runtime even on 64-bit Windows: RafiqPOS.exe is built for x86.
- إذا لم تعد مايكروسوفت تعرض الإصدار 109 في القائمة، استخدم نسخة الأرشيف الموثقة لدى المشروع (نفس البصمة).
  If Microsoft no longer lists 109.0.1518.140, use the project's archived copy (it must match the pinned hash).
- لا تضع ملفات مستخرجة بدلاً من ملف CAB؛ السكربت يتحقق من بصمة CAB ثم يستخرجه بنفسه (`expand.exe -F:*`).
  Keep the CAB itself; the build verifies its hash and extracts it. (Advanced: `RAFIQ_FIXED109_DIR` can point to an
  already-extracted folder containing `msedgewebview2.exe` only together with `RAFIQ_ALLOW_UNVERIFIED_FIXED109=YES`;
  the CAB hash is then skipped but every `.exe`/`.dll` signature and the version are still checked.)

## 2. التحقق من البصمات والتواقيع — Hash and signature verification

The build script `انشاء_ملف_التثبيت_Setup.bat` always reads the pins from the **repository** copy of
`installer/prerequisites/SHA256SUMS.txt` (never from `RAFIQ_PREREQ_DIR`) and:

1. Step 2 (fail fast): SHA256 of each downloaded file (`%SystemRoot%\System32\certutil.exe`) + Microsoft
   Authenticode check (`installer/verify_signatures.ps1`: status `Valid`, signer `O=Microsoft Corporation`, chain
   ending at a Microsoft root) for the `.exe` files.
2. Step 7 (after npm/MSBuild, which run third-party code): copies the files into a **new** staging folder under
   `%TEMP%`, re-hashes and re-checks the signatures of the **staged copies**, extracts the CAB from the staged copy,
   checks that every `.exe`/`.dll` of the runtime is Microsoft-signed, that there are no junctions/symlinks, and that
   `msedgewebview2.exe` is version **109.0.1518.140** — both in the extraction and again in
   `desktop\bin\Release\runtimes\fixed109`.
3. ISCC packs only the staged copies (`ISCC /DPrereqDir=<staging>`); the staging folder is deleted afterwards.

A pin that starts with `UNVERIFIED` stops the build. **Current state:** the .NET 4.8 pin is verified (official
download, 121,346,568 bytes, valid Microsoft signature, 2026-11-01). The **CAB pin is UNVERIFIED** — the build fails
until it has been verified with the procedure below. The bootstrapper pin is the committed repository copy; its
Microsoft signature is enforced on every build.

### Pin verification procedure (إجراء اعتماد بصمة جديدة) — never replace a failing pin casually

لا تستبدل بصمة فشلت بمجرد نسخ البصمة الجديدة. اعتماد أي بصمة يتطلب كل ما يلي:

1. **Two independent downloads** of the file from the official Microsoft URL (different machines/networks, ideally
   different people); both SHA256 values must be identical (`certutil -hashfile <file> SHA256`).
2. **Authenticode**: `powershell Get-AuthenticodeSignature .\<file>` → `Status: Valid`, signer
   `CN=Microsoft Corporation, O=Microsoft Corporation, …`, chain to a Microsoft root
   (or run `powershell -File installer\verify_signatures.ps1 -Path <file>`). For the CAB: extract it
   (`expand <cab> -F:* <dir>`) and run `verify_signatures.ps1 -Path <dir>\Microsoft.WebView2.FixedVersionRuntime.109.0.1518.140.x86 -Tree -VersionFile msedgewebview2.exe -ExpectedVersion 109.0.1518.140`.
3. **Expected version**: .NET installer product version 4.8.x (file Properties → Details); WebView2
   `msedgewebview2.exe` file version 109.0.1518.140; Windows 7 `.msu`: the SHA1 embedded in the Microsoft Update
   Catalog file name (e.g. `windows6.1-kb4474419-v3-x64_<sha1>.msu`) must equal `certutil -hashfile <file> SHA1`.
4. **Second-person review**: a second maintainer repeats steps 1–3 and approves the change to `SHA256SUMS.txt`
   (or to the `PIN_…` lines inside the Windows 7 script). Record date, size, source URL and both reviewers in the
   comment above the pin.

## 3. أدوات جهاز البناء — Build machine tools (Windows 10/11)

| Tool | Where the script looks | Download |
|---|---|---|
| Node.js 22 LTS + `frontend\node_modules` (`npm ci` once) | `npm` in PATH | https://nodejs.org |
| MSBuild (.NET Framework 4.8 Developer Pack) | `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe`, then `Framework\`, or `RAFIQ_MSBUILD` | https://dotnet.microsoft.com/download/dotnet-framework/net48 (Developer Pack) |
| `nuget.exe` | `RAFIQ_NUGET`, PATH, then `tools\nuget.exe`. Offline machine: may be skipped if `desktop\packages` is already complete | https://dist.nuget.org/win-x86-commandline/latest/nuget.exe |
| Inno Setup **6.7.4 or newer** (enforced by `#if Ver < EncodeVer(6,7,4)`; needed for its security fixes such as RedirectionGuard) | `RAFIQ_ISCC`, `%ProgramFiles(x86)%\Inno Setup 6`, `%ProgramFiles%\Inno Setup 6`, `%LOCALAPPDATA%\Programs\Inno Setup 6`, PATH | https://jrsoftware.org/isdl.php |

| Windows PowerShell 5.1 + `certutil.exe` | `%SystemRoot%\System32\…` (full paths) | built into Windows 10/11 |
| `signtool.exe` (only when signing) | `RAFIQ_SIGNTOOL`, PATH, Windows Kits 10 | Windows 10/11 SDK |

**Code signing:** set `RAFIQ_SIGN_THUMBPRINT` to the SHA1 thumbprint of the code-signing certificate stored in the
Windows certificate store or on the hardware token. ISCC then signs the Setup **and the uninstaller** (Inno
`SignTool=` + `SignedUninstaller=yes`) via `signtool /sha1 … /fd sha256 /tr … /td sha256`, and the build verifies the
result with `signtool verify /pa`. If signing was requested and fails, the build fails. Password-based `.pfx` signing
(`/p %CERT_PASS%`) was removed; `*.pfx`/`*.p12` are git-ignored, and the build stops if `RafiqCert.pfx` is found in
the repository without a thumbprint.

Build: double-click `انشاء_ملف_التثبيت_Setup.bat` (or run it with `RAFIQ_NO_PAUSE=1` for automation).
Steps: tools → SHA256 + signature check → NuGet restore → `npm run build` → MSBuild Release x86 → copy
`frontend\dist` to `desktop\bin\Release\dist` → staging + re-verification + Fixed 109 into
`desktop\bin\Release\runtimes\fixed109` → ISCC (signed when configured).
`RAFIQ_FIXED109_DIR` (pre-extracted runtime) additionally requires `RAFIQ_ALLOW_UNVERIFIED_FIXED109=YES`; the
Authenticode/version tree check still applies.
ISCC itself also refuses to compile if `ndp48…exe`, `runtimes\fixed109\msedgewebview2.exe`, `dist\index.html` or
`RafiqPOS.exe` is missing.

## 4. ويندوز 7 — Windows 7 SP1 machines

The Setup installs .NET 4.8 itself, but on Windows 7 .NET 4.8 needs these updates first (Setup warns if they look
missing). They are **not** bundled into the Setup; ship the folder `تحديثات_ويندوز7_الجاهزة` next to the Setup:

| Order | Update | Purpose | Download |
|---|---|---|---|
| 1 | KB4490628 | Servicing Stack Update (install **first**) | https://www.catalog.update.microsoft.com/Search.aspx?q=KB4490628 |
| 2 | KB4474419 | SHA-2 code signing support | https://www.catalog.update.microsoft.com/Search.aspx?q=KB4474419 |
| 3 | KB4019990 | D3DCompiler_47 (required by .NET 4.8 on Win7) | https://www.catalog.update.microsoft.com/Search.aspx?q=KB4019990 |

Place them with these **exact** names: `تحديثات_ويندوز7_الجاهزة\x64\KB4490628.msu`, `x64\KB4474419.msu`,
`x64\KB4019990.msu` and the same under `x86\` (rename the catalog files; nothing else is searched). Run
`تثبيت_التحديثات_تلقائيا.bat` as administrator, restart, then run the Setup. The script copies each file to an
administrator-only temp folder, checks its SHA256 against the `PIN_…` lines inside the script and installs only that
copy. **All Windows 7 pins are currently `UNVERIFIED`** (the old values were never confirmed), so the maintainer must
verify and set them with the procedure in section 2 before distributing the folder. The scripts are version-controlled;
only `*.msu` binaries are git-ignored.

**Offline certificate problem:** if .NET 4.8 setup fails on an offline Windows 7 with "A certificate chain could not
be built to a trusted root authority", the machine lacks *Microsoft Root Certificate Authority 2011*. Copy
`http://www.microsoft.com/pki/certs/MicRooCerAut2011_2011_03_22.crt` from a connected PC and run (as admin):
`certutil -addstore root MicRooCerAut2011_2011_03_22.crt`, then run the Setup again.

## 5. الحجم المتوقع — Expected installer size

Roughly: app + UI `dist` (~59 MB, of which ~29 MB is `دليل_الأدوية_المصرية_الشامل.xlsx` and ~20 MB tutorial videos in
`frontend/public`) + .NET 4.8 (~112 MB, already compressed) + WebView2 Fixed 109 x86 (CAB ~110–130 MB; LZMA2 keeps it
similar). Expect a Setup of about **280–320 MB**. Product content was not changed.

## 6. مخاطر متبقية معروفة — Known residual risks

- **.NET 4.8 self-extraction location (S2):** `ndp48-x86-x64-allos-enu.exe` first self-extracts its payload, by
  default to a temporary folder at the root of the drive with the most free space, then runs the inner `setup.exe`
  elevated. On a machine where standard users can write to that drive root (e.g. `D:\`), a user could race to plant
  DLLs in that folder. Microsoft's official deployment guide does not document an extract-to-folder switch for this
  package, so Setup does not rely on one. Mitigation: install on machines where non-admin users cannot write to the
  root of other fixed drives, or pre-install .NET 4.8 as an administrator before running the Rafiq Setup (then Setup
  skips it).
- **Junction races:** Setup removes junctions/symlinks in `C:\ProgramData\RafiqPOS` and `{app}` and locks the data
  root before granting permissions (no `/T` on user-writable folders, `/L` everywhere). A user who keeps Modify rights
  on `data`, `logs` or `backups` could still create a new link inside them during the few seconds of an upgrade;
  permission inheritance only adds the same Modify right Setup grants there.
