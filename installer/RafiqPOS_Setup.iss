; =====================================================================
; رفيق POS — اسكربت برنامج التثبيت الرسمي (Inno Setup 6)
; متوافق من Windows 7 SP1 (32 و 64 بت) حتى Windows 11
; =====================================================================

#define MyAppName "رفيق POS"
#define MyAppEnglishName "Rafiq POS"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "ISlam Khaled Ali"
#define MyAppCopyright "Copyright © 2026 ISlam Khaled Ali. All rights reserved."
#define MyAppExeName "RafiqPOS.exe"

; ---------------------------------------------------------------------
; المتطلبات المدمجة داخل ملف التثبيت (تعمل بدون إنترنت) — راجع installer\prerequisites\README.md
; يتحقق ملف البناء (انشاء_ملف_التثبيت_Setup.bat) من بصمات SHA256 قبل الوصول لهنا.
; ---------------------------------------------------------------------
#if Ver < EncodeVer(6,7,3)
  #error Inno Setup 6.7.3+ required (security fixes incl. RedirectionGuard). See installer\prerequisites\README.md
#endif

#define DotNetInstaller "ndp48-x86-x64-allos-enu.exe"
#define ReleaseDir "..\desktop\bin\Release"
; مجلد المتطلبات: ملف البناء يمرر مجلد Staging تم التحقق من بصماته وتواقيعه للتو (/DPrereqDir=...)
#ifndef PrereqDir
  #define PrereqDir AddBackslash(SourcePath) + "prerequisites"
#endif

#if !FileExists(AddBackslash(PrereqDir) + DotNetInstaller)
  #error Missing ndp48-x86-x64-allos-enu.exe in PrereqDir (.NET Framework 4.8 offline installer). See installer\prerequisites\README.md
#endif
#if !FileExists(AddBackslash(SourcePath) + ReleaseDir + "\runtimes\fixed109\msedgewebview2.exe")
  #error Missing desktop\bin\Release\runtimes\fixed109\msedgewebview2.exe (WebView2 Fixed Runtime 109 x86). Build with the Setup .bat script.
#endif
#if !FileExists(AddBackslash(SourcePath) + ReleaseDir + "\dist\index.html")
  #error Missing desktop\bin\Release\dist\index.html (frontend build). Build with the Setup .bat script.
#endif
#if !FileExists(AddBackslash(PrereqDir) + "MicrosoftEdgeWebview2Setup.exe")
  #error Missing MicrosoftEdgeWebview2Setup.exe in PrereqDir
#endif
#if !FileExists(AddBackslash(AddBackslash(SourcePath) + ReleaseDir) + MyAppExeName)
  #error Missing desktop\bin\Release\RafiqPOS.exe (C# Release build). Build with the Setup .bat script.
#endif

[Setup]
; الهوية الأساسية للبرنامج
AppId={{A879E05E-9F93-4B9F-84E3-8E5F92CE3C81}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppCopyright={#MyAppCopyright}
DefaultDirName={autopf}\RafiqPOS
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=Output
OutputBaseFilename=RafiqPOS_Setup_v{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=120,120
SetupIconFile=app.ico
WizardImageFile=wizard_sidebar.bmp,wizard_sidebar_2x.bmp
WizardSmallImageFile=wizard_small.bmp,wizard_small_2x.bmp
UninstallDisplayIcon={app}\{#MyAppExeName}

; التوافق مع الأنظمة: ويندوز 7 الحزمة 1 كحد أدنى
MinVersion=6.1sp1
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
CloseApplications=yes
RestartApplications=no
PrivilegesRequired=admin
AlwaysShowDirOnReadyPage=yes
#ifdef SignEnabled
; التوقيع الرقمي: ملف البناء يعرّف أداة "rafiqsign" عبر ISCC /S (بصمة شهادة من مخزن الشهادات /sha1، بدون كلمة مرور)
; Inno يوقّع ملف Setup وملف إلغاء التثبيت معاً
SignTool=rafiqsign
SignedUninstaller=yes
#endif

[Languages]
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
arabic.BeveledLabel=رفيق POS — Rafiq Enterprise POS
english.BeveledLabel=Rafiq POS — Enterprise Edition

; تخصيص نصوص معالج التثبيت لتعكس الهوية الاحترافية لنظام رفيق
arabic.WelcomeLabel1=مرحباً بك في معالج تثبيت منصة رفيق POS
arabic.WelcomeLabel2=سيقوم هذا المعالج بتثبيت منصة رفيق المتكاملة لنقاط البيع وإدارة المتاجر ومحلات التجزئة على جهاز الكمبيوتر الخاص بك.%n%nالمواصفات الهندسية الأساسية للنظام:%n• تشغيل أوفلاين 100%% بدون الحاجة لأي اتصال بالإنترنت.%n• محرك بيانات فائق الاستقرار ومعاملات مالية ذرية آمنة لحماية بيانات المحل.%n• توافق فوري مع قارئ الباركود، موازين الأوزان، وطابعات الإيصالات الحرارية.%n• توافق تام بنسخة واحدة مستقرة من Windows 7 SP1 حتى Windows 11.%n%nانقر على «التالي» للمتابعة، أو «إلغاء» للخروج من معالج التثبيت.

arabic.FinishedHeadingLabel=اكتمل تثبيت رفيق POS بنجاح!
arabic.FinishedLabelNoIcons=تم تثبيت نظام رفيق لنقاط البيع وإدارة المتاجر بنجاح على جهازك.%n%nيمكنك الآن تشغيل البرنامج وبدء إعداد متجرك التجاري.
arabic.FinishedLabel=تم تثبيت نظام رفيق لنقاط البيع وإدارة المتاجر بنجاح وهو جاهز للتشغيل الفوري.%n%nانقر على «إنهاء» لتشغيل رفيق والبدء مباشرة.

english.WelcomeLabel1=Welcome to Rafiq POS Setup
english.WelcomeLabel2=This wizard will install Rafiq Enterprise POS (Retail & Store Management System) on your computer.%n%nBuilt-in Enterprise Capabilities:%n• 100%% Offline Operation — no internet required.%n• Ultra-fast & crash-resilient SQLite WAL database engine.%n• Instant compatibility with barcode scanners, digital scales, and receipt printers.%n• Runs reliably on Windows 7 SP1 through Windows 11.%n%nClick Next to continue, or Cancel to exit Setup.
english.FinishedHeadingLabel=Rafiq POS Setup Complete!
english.FinishedLabelNoIcons=Rafiq POS has been successfully installed on your computer.%n%nYou may now launch the application to start setting up your store.
english.FinishedLabel=Rafiq POS has been successfully installed and is ready for use.%n%nClick Finish to launch Rafiq POS and get started.

[Tasks]
Name: "desktopicon"; Description: "إنشاء اختصار لبرنامج رفيق على سطح المكتب"; GroupDescription: "خيارات إضافية:"

[Dirs]
; البرنامج نفسه في Program Files للقراءة فقط للمستخدمين العاديين (لا صلاحيات كتابة على {app})
; صلاحية "تعديل" فقط (بدون تحكم كامل) على المجلدات التي يكتب فيها البرنامج أثناء التشغيل بحساب مستخدم عادي
Name: "{commonappdata}\RafiqPOS"
; التحديثات تُثبت فقط بملف Setup الرسمي (بصلاحيات المسؤول)، لذلك لا يوجد مجلد تحديثات قابل للكتابة
Name: "{commonappdata}\RafiqPOS\data"; Permissions: users-modify
; webview_profile يرث صلاحية "تعديل" من data (لا نضبط صلاحيات على مجلد داخل شجرة قابلة للكتابة)
Name: "{commonappdata}\RafiqPOS\data\webview_profile"
Name: "{commonappdata}\RafiqPOS\logs"; Permissions: users-modify
Name: "{commonappdata}\RafiqPOS\backups"; Permissions: users-modify

[InstallDelete]
; إزالة مجلد التحديثات القديم القابل للكتابة من الإصدارات السابقة (لم يعد مستخدماً)
Type: filesandordirs; Name: "{commonappdata}\RafiqPOS\updates"

[Files]
; ملفات البرنامج + الواجهة (dist). مجلد مشغل العرض fixed109 يُنسخ بسطر مستقل بالأسفل بدون استثناءات حتى لا يُحذف منه أي ملف
Source: "{#ReleaseDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb,*.xml,*_test_output.json,data\*,rollback_backup\*,update_staging\*,نسخة_تلقائية_*\*,*.db,*.db-wal,*.db-shm,\runtimes\fixed109\*"

; مشغل العرض WebView2 Fixed Runtime 109 (x86) — إلزامي لويندوز 7/8/8.1، واحتياطي بدون إنترنت لويندوز 10/11 إذا لم يكن Evergreen مثبتاً
; (البرنامج 32 بت x86 لذلك نسخة x86 تعمل على أنظمة 32 و 64 بت)
Source: "{#ReleaseDir}\runtimes\fixed109\*"; DestDir: "{app}\runtimes\fixed109"; Flags: ignoreversion recursesubdirs createallsubdirs

; .NET Framework 4.8 أوفلاين: لا يُنسخ للجهاز، يُستخرج مؤقتاً ويُشغّل من PrepareToInstall فقط إذا لم يكن مثبتاً
Source: "{#PrereqDir}\{#DotNetInstaller}"; DestDir: "{tmp}"; Flags: dontcopy

; مثبت WebView2 Evergreen (يحتاج إنترنت) — اختياري من صفحة الإنهاء فقط؛ البرنامج يعمل بدونه عبر fixed109
Source: "{#PrereqDir}\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Check: IsWindows10OrLater and not IsWebView2Installed

; قاعدة البيانات: تُنشأ تلقائياً عند أول تشغيل عبر DatabaseService و MigrationRunner في {commonappdata}\RafiqPOS\data
; حماية البيانات من الحذف أو الاستبدال عند إلغاء التثبيت أو الترقية: Flags: onlyifdoesntexist uninsneveruninstall


[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\إلغاء التثبيت"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; 0. صلاحيات مجلدات الكتابة (بعد أن قفل PrepareToInstall جذر {commonappdata}\RafiqPOS وأزال أي روابط Junction/Symlink):
;    "تعديل" قابل للوراثة على المجلد العلوي فقط — بدون /T (لا نمر على شجرة يتحكم فيها المستخدم)، و /L حتى لا يُتبع أي رابط
;    المجلد {app} أُعيد ضبطه في CurStepChanged(ssInstall) ليرث صلاحيات Program Files (قراءة فقط للمستخدمين)
Filename: "{sys}\icacls.exe"; Parameters: """{commonappdata}\RafiqPOS\data"" /grant *S-1-5-32-545:(OI)(CI)M /C /L /Q"; Flags: runhidden waituntilterminated; StatusMsg: "جاري تأمين صلاحيات مجلدات البيانات..."; Check: IsSafeDataDir('data')
Filename: "{sys}\icacls.exe"; Parameters: """{commonappdata}\RafiqPOS\logs"" /grant *S-1-5-32-545:(OI)(CI)M /C /L /Q"; Flags: runhidden waituntilterminated; Check: IsSafeDataDir('logs')
Filename: "{sys}\icacls.exe"; Parameters: """{commonappdata}\RafiqPOS\backups"" /grant *S-1-5-32-545:(OI)(CI)M /C /L /Q"; Flags: runhidden waituntilterminated; Check: IsSafeDataDir('backups')
; 1. صلاحيات القراءة والتشغيل لعمليات WebView2 المعزولة (Sandbox) على مجلد المشغل الثابت (توصية مايكروسوفت للـ Fixed Runtime)
;    S-1-15-2-1 = ALL APPLICATION PACKAGES (ويندوز 8 فأحدث)، S-1-15-2-2 = ALL RESTRICTED APPLICATION PACKAGES (ويندوز 10 فأحدث)
Filename: "{sys}\icacls.exe"; Parameters: """{app}\runtimes\fixed109"" /grant *S-1-15-2-1:(OI)(CI)(RX) /T /C /L /Q"; Flags: runhidden waituntilterminated; Check: IsWindows8OrLater
Filename: "{sys}\icacls.exe"; Parameters: """{app}\runtimes\fixed109"" /grant *S-1-15-2-2:(OI)(CI)(RX) /T /C /L /Q"; Flags: runhidden waituntilterminated; Check: IsWindows10OrLater

; 2. اختياري (يحتاج إنترنت): تثبيت WebView2 Evergreen الأحدث على ويندوز 10/11 غير المحتوي عليه. غير محدد افتراضياً؛ البرنامج يعمل بدونه عبر fixed109
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; Description: "تثبيت أحدث نسخة من مشغل العرض WebView2 (يتطلب اتصال إنترنت — اختياري)"; StatusMsg: "جاري تثبيت مشغّل العرض (WebView2 Runtime)..."; Flags: postinstall unchecked skipifsilent waituntilterminated; Check: IsWindows10OrLater and not IsWebView2Installed and not DotNetRestartPending

; تشغيل البرنامج بعد انتهاء التثبيت (لا يُعرض إذا كانت إعادة تشغيل الجهاز مطلوبة بعد تثبيت .NET 4.8)
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent; Check: IsAppReadyToLaunch

[Code]
// واجهات Win32 لإجبار نافذة التثبيت على الظهور في المقدمة وأخذ التركيز بعد تخطي رسالة UAC
function GetForegroundWindow(): HWND;
  external 'GetForegroundWindow@user32.dll stdcall';
function GetWindowThreadProcessId(hWnd: HWND; lpdwProcessId: DWORD): DWORD;
  external 'GetWindowThreadProcessId@user32.dll stdcall';
function GetCurrentThreadId(): DWORD;
  external 'GetCurrentThreadId@kernel32.dll stdcall';
function AttachThreadInput(idAttach: DWORD; idAttachTo: DWORD; fAttach: BOOL): BOOL;
  external 'AttachThreadInput@user32.dll stdcall';
function SetForegroundWindow(hWnd: HWND): BOOL;
  external 'SetForegroundWindow@user32.dll stdcall';
function BringWindowToTop(hWnd: HWND): BOOL;
  external 'BringWindowToTop@user32.dll stdcall';
function ShowWindow(hWnd: HWND; nCmdShow: Integer): BOOL;
  external 'ShowWindow@user32.dll stdcall';
function SetWindowPos(hWnd: HWND; hWndInsertAfter: HWND; X, Y, cx, cy: Integer; uFlags: UINT): BOOL;
  external 'SetWindowPos@user32.dll stdcall';
procedure keybd_event(bVk: Byte; bScan: Byte; dwFlags: DWORD; dwExtraInfo: LongInt);
  external 'keybd_event@user32.dll stdcall';
function AllowSetForegroundWindow(dwProcessId: DWORD): BOOL;
  external 'AllowSetForegroundWindow@user32.dll stdcall';

const
  VK_MENU = $12;
  KEYEVENTF_KEYUP = $2;
  SW_RESTORE = 9;
  HWND_TOPMOST = -1;
  HWND_NOTOPMOST = -2;
  TOP_FLAGS = 67; // SWP_NOSIZE (1) or SWP_NOMOVE (2) or SWP_SHOWWINDOW (64)
  ASFW_ANY = $FFFFFFFF;
  DOTNET48_RELEASE = 528040; // أقل قيمة Release لـ .NET Framework 4.8 (البرنامج مبني عليه)
  ATTR_DIRECTORY = $10;
  ATTR_REPARSE_POINT = $400;   // Junction / Symlink / Mount point
  MAX_TREE_DEPTH = 40;

var
  DotNetRestartRequired: Boolean; // تم تثبيت .NET 4.8 ويلزم إعادة تشغيل الجهاز قبل تشغيل رفيق
  PreservedCount: Integer;
  PreserveDirPath: String;

// إجراء لتنشيط نافذة المثبت وجعلها في المقدمة فوراً وكسر قيود Focus Stealing لنظام ويندوز
procedure ForceWizardToForeground();
var
  ForeWnd: HWND;
  ForeThread, AppThread: DWORD;
begin
  if WizardForm = nil then Exit;

  try
    // 1. محاكاة نقر مفتاح Alt لفك قفل Windows Foreground Lock
    keybd_event(VK_MENU, 0, 0, 0);
    keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);

    // 2. ربط خيط معالجة الإدخال بالنافذة النشطة في الخلفية
    ForeWnd := GetForegroundWindow();
    if (ForeWnd <> 0) and (ForeWnd <> WizardForm.Handle) then
    begin
      ForeThread := GetWindowThreadProcessId(ForeWnd, 0);
      AppThread := GetCurrentThreadId();
      if (ForeThread <> 0) and (ForeThread <> AppThread) then
      begin
        AttachThreadInput(ForeThread, AppThread, True);
        ShowWindow(WizardForm.Handle, SW_RESTORE);
        BringWindowToTop(WizardForm.Handle);
        SetForegroundWindow(WizardForm.Handle);
        AttachThreadInput(ForeThread, AppThread, False);
      end;
    end;

    // 3. رفع النافذة لأعلى ترتيب النوافذ والتركيز المباشر
    ShowWindow(WizardForm.Handle, SW_RESTORE);
    WizardForm.BringToFront();
    SetWindowPos(WizardForm.Handle, HWND_TOPMOST, 0, 0, 0, 0, TOP_FLAGS);
    BringWindowToTop(WizardForm.Handle);
    SetForegroundWindow(WizardForm.Handle);
    SetWindowPos(WizardForm.Handle, HWND_NOTOPMOST, 0, 0, 0, 0, TOP_FLAGS);
    SetForegroundWindow(WizardForm.Handle);
  except
  end;
end;

procedure WizardOnShow(Sender: TObject);
begin
  ForceWizardToForeground();
end;

procedure InitializeWizard();
begin
  // ضبط الخطوط العامة لمعالج التثبيت لتكون عصرية وأنيقة
  WizardForm.Font.Name := 'Segoe UI';
  WizardForm.Font.Size := 9;

  // ترقية خط ولون عنوان شاشة الترحيب لتعكس هوية رفيق
  WizardForm.WelcomeLabel1.Font.Name := 'Segoe UI';
  WizardForm.WelcomeLabel1.Font.Size := 13;
  WizardForm.WelcomeLabel1.Font.Style := [fsBold];
  WizardForm.WelcomeLabel1.Font.Color := $002D3700; // Forest Green #00372D ($00BBGGRR)

  // ترقية خط ولون عنوان شاشة النهاية
  WizardForm.FinishedHeadingLabel.Font.Name := 'Segoe UI';
  WizardForm.FinishedHeadingLabel.Font.Size := 13;
  WizardForm.FinishedHeadingLabel.Font.Style := [fsBold];
  WizardForm.FinishedHeadingLabel.Font.Color := $002D3700;

  // ترقية عناوين ووصف الصفحات الداخلية
  WizardForm.PageNameLabel.Font.Name := 'Segoe UI';
  WizardForm.PageNameLabel.Font.Size := 10;
  WizardForm.PageNameLabel.Font.Style := [fsBold];
  WizardForm.PageNameLabel.Font.Color := $002D3700;

  WizardForm.PageDescriptionLabel.Font.Name := 'Segoe UI';
  WizardForm.PageDescriptionLabel.Font.Size := 9;
  WizardForm.PageDescriptionLabel.Font.Color := $004A453C;

  // إخفاء الحواف ثلاثية الأبعاد الكلاسيكية القديمة لمظهر مسطح وعصري
  WizardForm.Bevel.Visible := False;
  WizardForm.Bevel1.Visible := False;

  WizardForm.OnShow := @WizardOnShow;
  ForceWizardToForeground();
end;

procedure CurPageChanged(CurPageIndex: Integer);
begin
  if CurPageIndex = wpWelcome then
  begin
    ForceWizardToForeground();
  end
  else if CurPageIndex = wpFinished then
  begin
    // السماح للبرنامج المشغل عند إنهاء التثبيت بالظهور في المقدمة مباشرة
    AllowSetForegroundWindow(ASFW_ANY);
  end;
end;

procedure DeinitializeSetup();
begin
  // منح الصلاحية لعملية رفيق التالية بأخذ تركيز الشاشة
  AllowSetForegroundWindow(ASFW_ANY);
end;

// التحقق مما إذا كان النظام ويندوز 10 أو أعلى
function IsWindows10OrLater(): Boolean;
var
  Version: TWindowsVersion;
begin
  GetWindowsVersionEx(Version);
  Result := (Version.Major >= 10);
end;

// التحقق مما إذا كان النظام ويندوز 8 أو أحدث (6.2+)
function IsWindows8OrLater(): Boolean;
var
  Version: TWindowsVersion;
begin
  GetWindowsVersionEx(Version);
  Result := (Version.Major > 6) or ((Version.Major = 6) and (Version.Minor >= 2));
end;

// التحقق مما إذا كان النظام ويندوز 7 تحديداً (6.1)
function IsWindows7(): Boolean;
var
  Version: TWindowsVersion;
begin
  GetWindowsVersionEx(Version);
  Result := (Version.Major = 6) and (Version.Minor = 1);
end;

// التحقق مما إذا كان النظام ويندوز 7 أو 8 (Legacy)
function IsLegacyWindows(): Boolean;
var
  Version: TWindowsVersion;
begin
  GetWindowsVersionEx(Version);
  Result := (Version.Major < 10);
end;

// التحقق من أن ويندوز 7 يحتوي على الحزمة الخدمية الأولى (SP1) كحد أدنى
function IsWin7MissingSP1(): Boolean;
var
  Version: TWindowsVersion;
begin
  GetWindowsVersionEx(Version);
  Result := (Version.Major = 6) and (Version.Minor = 1) and (Version.ServicePackMajor < 1);
end;

// التحقق من وجود .NET Framework 4.8 أو أحدث (Release >= 528040). البرنامج مبني على 4.8 ولا يعمل على 4.6/4.7
function IsDotNet48Installed(): Boolean;
var
  Release: Cardinal;
begin
  Result := False;
  if RegQueryDWordValue(HKLM, 'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full', 'Release', Release) then
    Result := (Release >= DOTNET48_RELEASE);
end;

function DotNetRestartPending(): Boolean;
begin
  Result := DotNetRestartRequired;
end;

// Inno Setup يعرض خيار "إعادة تشغيل الجهاز الآن" في صفحة الإنهاء عندما تُرجع هذه الدالة True
function NeedRestart(): Boolean;
begin
  Result := DotNetRestartRequired;
end;

// هل تحديث ويندوز (KB) مثبت؟ يقرأ سجل خدمة المكونات (CBS). قد يعطي نتيجة سالبة خاطئة إذا حُذف التحديث بعد استبداله بتحديث أحدث،
// لذلك يُستخدم للتحذير فقط وليس لمنع التثبيت.
function HasWindowsUpdatePackage(const KB: String): Boolean;
var
  Names: TArrayOfString;
  RootKey: Integer;
  I: Integer;
  Prefix: String;
begin
  Result := False;
  if IsWin64 then
    RootKey := HKLM64
  else
    RootKey := HKLM;
  Prefix := Lowercase('Package_for_' + KB);
  if RegGetSubkeyNames(RootKey, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\Packages', Names) then
  begin
    for I := 0 to GetArrayLength(Names) - 1 do
    begin
      if Pos(Prefix, Lowercase(Names[I])) = 1 then
      begin
        Result := True;
        Exit;
      end;
    end;
  end;
end;

// قائمة متطلبات ويندوز 7 الناقصة لتثبيت .NET 4.8 (فارغة إذا كان كل شيء موجوداً)
function Win7MissingUpdatesText(): String;
begin
  Result := '';
  if not HasWindowsUpdatePackage('KB4490628') then
    Result := Result + '• KB4490628 (تحديث مكدس الخدمة SSU) — يُثبت أولاً' + #13#10;
  if not HasWindowsUpdatePackage('KB4474419') then
    Result := Result + '• KB4474419 (دعم التوقيع الرقمي SHA-2) — يُثبت ثانياً' + #13#10;
  if not FileExists(ExpandConstant('{sys}\D3DCompiler_47.dll')) then
    Result := Result + '• KB4019990 (مكتبة D3DCompiler_47 المطلوبة لـ .NET 4.8)' + #13#10;
end;

// تثبيت .NET Framework 4.8 المرفق بدون إنترنت. يُرجع نصاً فارغاً عند النجاح أو رسالة خطأ عربية دقيقة توقف التثبيت.
function InstallDotNet48(): String;
var
  ResultCode: Integer;
  InstallerPath: String;
  ProgressPage: TOutputProgressWizardPage;
begin
  Result := '';
  ProgressPage := CreateOutputProgressPage('تثبيت متطلبات التشغيل', 'جاري تثبيت Microsoft .NET Framework 4.8 (بدون إنترنت)...');
  ProgressPage.SetText('جاري تثبيت .NET Framework 4.8 — قد يستغرق ذلك من 5 إلى 15 دقيقة على الأجهزة القديمة.', 'يرجى عدم إغلاق المعالج أو إطفاء الجهاز. Installing .NET Framework 4.8, please wait...');
  ProgressPage.SetProgress(0, 0);
  ProgressPage.Show;
  try
    ExtractTemporaryFile('{#DotNetInstaller}');
    InstallerPath := ExpandConstant('{tmp}\{#DotNetInstaller}');
    Log('Installing .NET Framework 4.8: ' + InstallerPath + ' /q /norestart');
    if not Exec(InstallerPath, '/q /norestart', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      Result := 'تعذر تشغيل مثبت .NET Framework 4.8 المرفق (' + SysErrorMessage(ResultCode) + ').' + #13#10 +
                'قد يكون برنامج الحماية (Antivirus) منع تشغيله. أوقف الحماية مؤقتاً ثم أعد تشغيل ملف التثبيت.' + #13#10 +
                'Could not start the bundled .NET Framework 4.8 installer.';
      Exit;
    end;
    Log('.NET Framework 4.8 installer exit code: ' + IntToStr(ResultCode));
  finally
    ProgressPage.Hide;
  end;

  case ResultCode of
    0:
      begin
        if not IsDotNet48Installed() then
        begin
          // بعض الأجهزة لا تحدّث قيمة Release قبل إعادة التشغيل
          DotNetRestartRequired := True;
          Log('.NET 4.8 reported success but Release key not updated yet; restart required.');
        end;
      end;
    1641, 3010:
      begin
        DotNetRestartRequired := True;
        SuppressibleMsgBox('تم تثبيت Microsoft .NET Framework 4.8 بنجاح، لكن يلزم إعادة تشغيل الجهاز لإكماله.' + #13#10#13#10 +
               'سيكمل المعالج تثبيت رفيق الآن، وفي الصفحة الأخيرة اختر «نعم، أعد تشغيل الكمبيوتر الآن».' + #13#10 +
               'لا تشغّل البرنامج قبل إعادة التشغيل.' + #13#10#13#10 +
               '.NET Framework 4.8 was installed; a restart is required before running Rafiq POS.',
               mbInformation, MB_OK, IDOK);
      end;
    1602:
      Result := 'تم إلغاء تثبيت .NET Framework 4.8، ولا يمكن تشغيل رفيق بدونه (رمز 1602).' + #13#10 +
                'أعد تشغيل ملف التثبيت واتركه يكمل حتى النهاية.' + #13#10 +
                '.NET Framework 4.8 installation was cancelled (1602).';
    5100:
      Result := 'جهازك لا يستوفي متطلبات .NET Framework 4.8 (رمز 5100).' + #13#10 +
                'على ويندوز 7: شغّل أولاً «تحديثات_ويندوز7_الجاهزة\تثبيت_التحديثات_تلقائيا.bat» كمسؤول' + #13#10 +
                '(KB4490628 ثم KB4474419 ثم KB4019990)، أعد تشغيل الجهاز، ثم شغّل ملف تثبيت رفيق مجدداً.' + #13#10 +
                'ملاحظة: .NET 4.8 لا يدعم Windows 8.0 (يلزم 8.1).' + #13#10 +
                '.NET Framework 4.8 requirements not met (5100). Install the Windows 7 updates first.';
  else
    begin
      Result := 'فشل تثبيت .NET Framework 4.8 (رمز الخطأ ' + IntToStr(ResultCode) + ').' + #13#10 +
                'على ويندوز 7: تأكد من تثبيت تحديثات ويندوز 7 المرفقة ثم أعد تشغيل الجهاز وحاول مجدداً.' + #13#10 +
                'إذا ظهرت مشكلة شهادة (Certificate/Trust) على جهاز بدون إنترنت راجع installer\prerequisites\README.md.' + #13#10 +
                'سجل التثبيت التفصيلي موجود في مجلد %TEMP% باسم يبدأ بـ "Microsoft .NET Framework 4.8 Setup".' + #13#10 +
                '.NET Framework 4.8 setup failed with exit code ' + IntToStr(ResultCode) + '.';
    end;
  end;
end;

// =====================================================================
// حماية مجلدات البيانات من هجمات الروابط (Junction / Symlink) — C1 / C4
// المستخدم العادي (كاشير) قد يزرع رابطاً مكان مجلد يكتب فيه المثبت بصلاحيات المسؤول،
// فيمنح المثبت صلاحيات أو يحذف ملفات في مجلد آخر. لذلك: نكتشف الروابط ونزيلها (الرابط فقط، وليس الهدف)
// ثم نقفل جذر {commonappdata}\RafiqPOS قبل أي منح صلاحيات.
// =====================================================================

function GetEntryAttributes(const Path: String; var Attr: DWORD): Boolean;
var
  FindRec: TFindRec;
begin
  Result := False;
  Attr := 0;
  if FindFirst(RemoveBackslashUnlessRoot(Path), FindRec) then
  begin
    try
      Attr := FindRec.Attributes;
      Result := True;
    finally
      FindClose(FindRec);
    end;
  end;
end;

function PathEntryExists(const Path: String): Boolean;
var
  Attr: DWORD;
begin
  Result := GetEntryAttributes(Path, Attr);
end;

function IsReparsePoint(const Path: String): Boolean;
var
  Attr: DWORD;
begin
  Result := GetEntryAttributes(Path, Attr) and ((Attr and ATTR_REPARSE_POINT) <> 0);
end;

// يحذف الرابط نفسه فقط (RemoveDirectory/DeleteFile على رابط لا يلمس الهدف)
function RemoveLinkOnly(const Path: String): Boolean;
var
  Attr: DWORD;
begin
  Result := True;
  if not GetEntryAttributes(Path, Attr) then Exit;
  if (Attr and ATTR_REPARSE_POINT) = 0 then Exit;
  Log('SECURITY: removing reparse point (link only): ' + Path);
  if (Attr and ATTR_DIRECTORY) <> 0 then
    RemoveDir(Path)
  else
    DeleteFile(Path);
  Result := not PathEntryExists(Path);
  if not Result then
    Log('SECURITY: could not remove reparse point: ' + Path);
end;

// يزيل كل الروابط داخل الشجرة دون الدخول فيها. يرجع False إذا بقي رابط لم يمكن حذفه.
function RemoveLinksInTree(const Dir: String; Depth: Integer): Boolean;
var
  FindRec: TFindRec;
  Item: String;
begin
  Result := True;
  if Depth > MAX_TREE_DEPTH then Exit;
  if FindFirst(AddBackslash(Dir) + '*', FindRec) then
  begin
    try
      repeat
        if (FindRec.Name <> '.') and (FindRec.Name <> '..') then
        begin
          Item := AddBackslash(Dir) + FindRec.Name;
          if (FindRec.Attributes and ATTR_REPARSE_POINT) <> 0 then
          begin
            if not RemoveLinkOnly(Item) then
              Result := False;
          end
          else if (FindRec.Attributes and ATTR_DIRECTORY) <> 0 then
          begin
            if not RemoveLinksInTree(Item, Depth + 1) then
              Result := False;
          end;
        end;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
end;

function RunIcacls(const Params: String): Integer;
var
  ResultCode: Integer;
begin
  if not Exec(ExpandConstant('{sys}\icacls.exe'), Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    ResultCode := -1;
  Log('icacls ' + Params + ' -> ' + IntToStr(ResultCode));
  Result := ResultCode;
end;

function LinkAttackMessage(const Path: String): String;
begin
  Result := 'تم اكتشاف رابط (Junction/Symlink) غير مسموح به في مجلد بيانات رفيق ولم يمكن إزالته:' + #13#10 + Path + #13#10 + #13#10 +
            'لحماية الجهاز تم إيقاف التثبيت. احذف هذا الرابط يدوياً بحساب المسؤول ثم أعد تشغيل ملف التثبيت.' + #13#10 +
            'An unexpected link (junction/symlink) was found in the Rafiq data folder and could not be removed: ' + Path + #13#10 +
            'Setup stopped for security. Remove it as an administrator and run Setup again.';
end;

// يتأكد أن جذر البيانات ومجلداته ليست روابط، ثم يقفل الجذر: النظام والمسؤولون تحكم كامل، المستخدمون قراءة فقط.
// بعد القفل لا يستطيع المستخدم العادي إنشاء أو استبدال أي عنصر مباشرة داخل الجذر.
function SecureDataRoot(): String;
var
  Root: String;
  Names: TArrayOfString;
  I: Integer;
begin
  Result := '';
  Root := ExpandConstant('{commonappdata}\RafiqPOS');

  if not RemoveLinkOnly(Root) then
  begin
    Result := LinkAttackMessage(Root);
    Exit;
  end;
  if not DirExists(Root) then
    if not CreateDir(Root) then
    begin
      Result := 'تعذر إنشاء مجلد بيانات رفيق: ' + Root + #13#10 + 'Could not create the data folder: ' + Root;
      Exit;
    end;

  // ملكية المسؤولين أولاً (مستخدم أنشأ المجلد قبل التثبيت قد يمنع المسؤولين من تعديل صلاحياته)
  RunIcacls('"' + Root + '" /setowner *S-1-5-32-544 /C /L /Q');
  if RunIcacls('"' + Root + '" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F *S-1-5-32-545:(OI)(CI)RX /C /L /Q') <> 0 then
  begin
    Result := 'تعذر تأمين صلاحيات مجلد بيانات رفيق (icacls):' + #13#10 + Root + #13#10 +
              'Could not lock the permissions of the Rafiq data folder.';
    Exit;
  end;

  // بعد القفل: افحص الجذر مرة أخرى ثم أزل أي روابط داخل الشجرة كلها (data, webview_profile, logs, backups, updates القديم ...)
  if IsReparsePoint(Root) then
  begin
    Result := LinkAttackMessage(Root);
    Exit;
  end;
  SetArrayLength(Names, 5);
  Names[0] := 'data';
  Names[1] := 'data\webview_profile';
  Names[2] := 'logs';
  Names[3] := 'backups';
  Names[4] := 'updates';
  for I := 0 to GetArrayLength(Names) - 1 do
  begin
    if not RemoveLinkOnly(AddBackslash(Root) + Names[I]) then
    begin
      Result := LinkAttackMessage(AddBackslash(Root) + Names[I]);
      Exit;
    end;
  end;
  if not RemoveLinksInTree(Root, 0) then
  begin
    Result := LinkAttackMessage(Root + '\...');
    Exit;
  end;
  // ملكية المسؤولين على مجلدات الكتابة العليا فقط (بدون /T)
  for I := 0 to 3 do
    if DirExists(AddBackslash(Root) + Names[I]) then
      RunIcacls('"' + AddBackslash(Root) + Names[I] + '" /setowner *S-1-5-32-544 /C /L /Q');
end;

// يُستخدم في [Run]: لا تمنح صلاحيات على مجلد إلا إذا كان مجلداً حقيقياً (وليس رابطاً) داخل الجذر
function IsSafeDataDir(const SubDir: String): Boolean;
var
  Path: String;
  Attr: DWORD;
begin
  Path := ExpandConstant('{commonappdata}\RafiqPOS\') + SubDir;
  Result := GetEntryAttributes(Path, Attr) and ((Attr and ATTR_DIRECTORY) <> 0) and ((Attr and ATTR_REPARSE_POINT) = 0) and
            (not IsReparsePoint(ExpandConstant('{commonappdata}\RafiqPOS')));
  if not Result then
    Log('SECURITY: skipping permission grant on unsafe or missing folder: ' + Path);
end;

// ---------------------------------------------------------------------
// C4: الترقية فوق نسخة قديمة كانت تمنح المستخدمين "تحكم كامل" على {app}
// ---------------------------------------------------------------------
function IsDataLikeFile(const FileName: String): Boolean;
var
  Ext: String;
begin
  Ext := Lowercase(ExtractFileExt(FileName));
  Result := (Ext = '.db') or (Ext = '.db-wal') or (Ext = '.db-shm') or (Ext = '.sqlite') or (Ext = '.bak');
end;

// ملفات قواعد بيانات قديمة داخل {app} (مثل نسخ أمان التحديث القديمة) تُنقل ولا تُحذف
procedure PreserveDataFile(const Path: String);
var
  Attempt: Integer;
  Candidate, Dest: String;
begin
  if PreserveDirPath = '' then
  begin
    for Attempt := 0 to 4 do
    begin
      Candidate := ExpandConstant('{commonappdata}\RafiqPOS\backups\legacy_app_folder_') +
                   GetDateTimeString('yyyymmdd_hhnnss', #0, #0) + '_' + IntToStr(Random(100000));
      // يجب ألا يكون موجوداً مسبقاً (حتى لا نكتب داخل رابط زرعه مستخدم)
      if (not PathEntryExists(Candidate)) and CreateDir(Candidate) and (not IsReparsePoint(Candidate)) then
      begin
        PreserveDirPath := Candidate;
        Break;
      end;
    end;
    if PreserveDirPath = '' then
    begin
      Log('Could not create a fresh preservation folder; leaving data file in place: ' + Path);
      Exit;
    end;
  end;
  PreservedCount := PreservedCount + 1;
  Dest := AddBackslash(PreserveDirPath) + IntToStr(PreservedCount) + '_' + ExtractFileName(Path);
  if not RenameFile(Path, Dest) then
  begin
    if FileCopy(Path, Dest, True) then
      DeleteFile(Path);
  end;
  Log('Preserved legacy data file: ' + Path + ' -> ' + Dest);
end;

// يحذف محتوى مجلد داخل {app} بدون اتباع أي رابط (الرابط يُحذف هو فقط)
procedure DeleteTreeNoFollow(const Dir: String; Depth: Integer);
var
  FindRec: TFindRec;
  Item: String;
begin
  if Depth > MAX_TREE_DEPTH then Exit;
  if FindFirst(AddBackslash(Dir) + '*', FindRec) then
  begin
    try
      repeat
        if (FindRec.Name <> '.') and (FindRec.Name <> '..') then
        begin
          Item := AddBackslash(Dir) + FindRec.Name;
          if (FindRec.Attributes and ATTR_REPARSE_POINT) <> 0 then
            RemoveLinkOnly(Item)
          else if (FindRec.Attributes and ATTR_DIRECTORY) <> 0 then
          begin
            DeleteTreeNoFollow(Item, Depth + 1);
            if not RemoveDir(Item) then
              Log('Could not remove folder: ' + Item);
          end
          else if IsDataLikeFile(FindRec.Name) then
            PreserveDataFile(Item)
          else if not DeleteFile(Item) then
            Log('Could not delete file: ' + Item);
        end;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
end;

// يعمل في ssInstall (بعد إغلاق البرنامج المفتوح وقبل نسخ الملفات):
// 1) إزالة الروابط من {app}  2) ملكية المسؤولين + إعادة الصلاحيات للوراثة من Program Files (/T /L)
// 3) حذف كل ما في {app} عدا ملفات إلغاء التثبيت؛ المثبت يعيد نسخ كل ملفات البرنامج مباشرة بعد ذلك.
// البيانات الحقيقية في ProgramData ولا تُلمس. الخطوة لا تعمل إلا على مجلد اسمه RafiqPOS ومثبت فيه رفيق مسبقاً.
procedure HardenAndCleanAppDir();
var
  AppDir, Name: String;
  FindRec: TFindRec;
begin
  AppDir := RemoveBackslashUnlessRoot(ExpandConstant('{app}'));
  if not DirExists(AppDir) then Exit;
  if (CompareText(ExtractFileName(AppDir), 'RafiqPOS') <> 0) or
     not (FileExists(AddBackslash(AppDir) + 'unins000.dat') or FileExists(AddBackslash(AppDir) + '{#MyAppExeName}')) then
  begin
    Log('Upgrade cleanup skipped: ' + AppDir + ' is not a previous Rafiq POS installation folder.');
    Exit;
  end;
  if IsReparsePoint(AppDir) then
  begin
    Log('SECURITY: application folder is a reparse point, cleanup skipped: ' + AppDir);
    Exit;
  end;

  RemoveLinksInTree(AppDir, 0);
  RunIcacls('"' + AppDir + '" /setowner *S-1-5-32-544 /T /C /L /Q');
  RunIcacls('"' + AppDir + '" /reset /T /C /L /Q');
  // أُعيد الفحص بعد سحب صلاحيات الكتابة (يغلق نافذة السباق قبل التنظيف)
  RemoveLinksInTree(AppDir, 0);

  if FindFirst(AddBackslash(AppDir) + '*', FindRec) then
  begin
    try
      repeat
        Name := FindRec.Name;
        if (Name <> '.') and (Name <> '..') and (CompareText(Copy(Name, 1, 5), 'unins') <> 0) then
        begin
          if (FindRec.Attributes and ATTR_REPARSE_POINT) <> 0 then
            RemoveLinkOnly(AddBackslash(AppDir) + Name)
          else if (FindRec.Attributes and ATTR_DIRECTORY) <> 0 then
          begin
            DeleteTreeNoFollow(AddBackslash(AppDir) + Name, 1);
            RemoveDir(AddBackslash(AppDir) + Name);
          end
          else if IsDataLikeFile(Name) then
            PreserveDataFile(AddBackslash(AppDir) + Name)
          else
            DeleteFile(AddBackslash(AppDir) + Name);
        end;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
  Log('Upgrade cleanup of the application folder finished: ' + AppDir);
end;

// يعمل قبل نسخ الملفات: تثبيت .NET 4.8 إذا لزم، ثم تأمين مجلد البيانات. إرجاع نص غير فارغ يوقف التثبيت ويعرض الرسالة.
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not IsDotNet48Installed() then
    Result := InstallDotNet48();
  if Result = '' then
    Result := SecureDataRoot();
end;

// التحقق من وجود مشغّل WebView2 Runtime في النظام
function IsWebView2Installed(): Boolean;
var
  VersionStr: String;
begin
  Result := False;
  if RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-F600A9E7E3DC}', 'pv', VersionStr) or
     RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-F600A9E7E3DC}', 'pv', VersionStr) or
     RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-F600A9E7E3DC}', 'pv', VersionStr) then
  begin
    if Length(VersionStr) > 0 then
      Result := True;
  end;
end;

// التحقق من إمكانية تشغيل البرنامج: لا إعادة تشغيل معلقة لـ .NET، ومشغل العرض متوفر (المدمج fixed109 أو Evergreen)
function IsAppReadyToLaunch(): Boolean;
begin
  if DotNetRestartRequired or not IsDotNet48Installed() then
    Result := False
  else
    Result := FileExists(ExpandConstant('{app}\runtimes\fixed109\msedgewebview2.exe')) or
              ((not IsLegacyWindows()) and IsWebView2Installed());
end;

function InitializeSetup(): Boolean;
var
  Msg: String;
  Missing: String;
begin
  Result := True;

  // 1. فحص الحزمة الأولى على ويندوز 7 (Windows 7 SP1)
  if IsWin7MissingSP1() then
  begin
    Msg := 'نظام التشغيل غير مدعوم مباشرة:' + #13#10 + #13#10 +
           'يتطلب برنامج رفيق لنقاط البيع نظام Windows 7 Service Pack 1 (SP1) على الأقل.' + #13#10 +
           'جهازك يعمل حالياً بنظام Windows 7 بدون الحزمة الأولى (Service Pack 1).' + #13#10#13#10 +
           'خطوات الحل بالعربي:' + #13#10 +
           '1. قم بتثبيت حزمة التحديث Windows 7 Service Pack 1 (SP1).' + #13#10 +
           '2. أعد تشغيل جهاز الكمبيوتر ثم شغّل برنامج التثبيت مجدداً.';
    MsgBox(Msg, mbCriticalError, MB_OK);
    Result := False;
    Exit;
  end;

  // 2. .NET Framework 4.8: يُثبت تلقائياً من النسخة المرفقة (PrepareToInstall). على ويندوز 7 ننبه مسبقاً إذا كانت تحديثاته المطلوبة ناقصة
  if (not IsDotNet48Installed()) and IsWindows7() then
  begin
    Missing := Win7MissingUpdatesText();
    if Missing <> '' then
    begin
      Msg := 'تنبيه قبل تثبيت .NET Framework 4.8 على ويندوز 7:' + #13#10 + #13#10 +
             'لم يتم العثور على التحديثات التالية (مطلوبة لتثبيت .NET 4.8 بدون أخطاء):' + #13#10 + Missing + #13#10 +
             'الحل الموصى به:' + #13#10 +
             '1. اضغط «لا» لإيقاف التثبيت الآن.' + #13#10 +
             '2. شغّل «تحديثات_ويندوز7_الجاهزة\تثبيت_التحديثات_تلقائيا.bat» كمسؤول ثم أعد تشغيل الجهاز.' + #13#10 +
             '3. شغّل ملف تثبيت رفيق مرة أخرى.' + #13#10 + #13#10 +
             'إذا كنت متأكداً أن تحديثات أحدث تشملها مثبتة بالفعل اضغط «نعم» للمتابعة.' + #13#10 +
             'Windows 7 updates required by .NET Framework 4.8 seem missing. Continue anyway?';
      if SuppressibleMsgBox(Msg, mbConfirmation, MB_YESNO, IDYES) = IDNO then
      begin
        Result := False;
        Exit;
      end;
    end;
  end;

  // 3. توجيه وإرشاد استباقي لمستخدمي ويندوز 7 بخصوص تحديثات الأمان
  if IsLegacyWindows() then
  begin
    // رسالة تنبيهية إرشادية بدون حجب التثبيت
    Log('Windows 7/8 environment detected. The bundled WebView2 Fixed Runtime 109 will be used.');
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    HardenAndCleanAppDir();
  end
  else if CurStep = ssDone then
  begin
    AllowSetForegroundWindow(ASFW_ANY);
  end;
end;
