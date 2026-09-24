; =====================================================================
; رفيق POS — اسكربت برنامج التثبيت الرسمي (Inno Setup 6)
; متوافق من Windows 7 SP1 (32 و 64 بت) حتى Windows 11
; =====================================================================

#define MyAppName "رفيق POS"
#define MyAppEnglishName "Rafiq POS"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Rafiq POS"
#define MyAppExeName "RafiqPOS.exe"

[Setup]
; الهوية الأساسية للبرنامج
AppId={{A879E05E-9F93-4B9F-84E3-8E5F92CE3C81}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\RafiqPOS
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=Output
OutputBaseFilename=RafiqPOS_Setup_v{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupIconFile=app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}

; التوافق مع الأنظمة: ويندوز 7 الحزمة 1 كحد أدنى
MinVersion=6.1sp1
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
CloseApplications=yes
RestartApplications=no
PrivilegesRequired=admin
AlwaysShowDirOnReadyPage=yes

[Languages]
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
arabic.BeveledLabel=رفيق POS — Rafiq POS
english.BeveledLabel=Rafiq POS

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Dirs]
; إعطاء صلاحيات الكتابة الكاملة لجميع المستخدمين في مجلد البيانات
Name: "{commonappdata}\RafiqPOS"; Permissions: users-full
Name: "{commonappdata}\RafiqPOS\data"; Permissions: users-full
Name: "{commonappdata}\RafiqPOS\data\webview_profile"; Permissions: users-full

[Files]
; الملفات التنفيذية والمكتبات الأساسية للبرنامج
Source: "..\desktop\bin\Release\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb,data\*.db,data\*.db-wal,data\*.db-shm"

; مثبت WebView2 أونلاين الحديث (فقط لويندوز 10 وويندوز 11 إذا لم يكن متوفراً)
Source: "prerequisites\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: IsWindows10OrLater and not IsWebView2Installed

; حماية قاعدة البيانات: تُحفظ في C:\ProgramData\RafiqPOS\data ولا تُحذف عند إلغاء التثبيت
Source: "..\desktop\bin\Release\data\rafiq_pos.db"; DestDir: "{commonappdata}\RafiqPOS\data"; Flags: onlyifdoesntexist uninsneveruninstall; Permissions: users-full

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\إلغاء التثبيت"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; 1. تثبيت WebView2 على ويندوز 10 وويندوز 11 أونلاين إذا لزم الأمر
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "جاري تهيئة مشغّل العرض (WebView2 Runtime)..."; Check: IsWindows10OrLater and not IsWebView2Installed

; تشغيل البرنامج بعد انتهاء التثبيت (لويندوز 7 مدمج به مشغل fixed109 تلقائياً بدون الحاجة لتثبيت أي برامج خارجية)
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

// التحقق مما إذا كان النظام ويندوز 7 أو 8 (Legacy)
function IsLegacyWindows(): Boolean;
var
  Version: TWindowsVersion;
begin
  GetWindowsVersionEx(Version);
  Result := (Version.Major < 10);
end;

// التحقق من وجود دوت نت فريموورك متوافق (.NET 4.6.2 أو أعلى)
function IsDotNetCompatible(): Boolean;
var
  Release: Cardinal;
begin
  Result := False;
  if RegQueryDWordValue(HKLM, 'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full', 'Release', Release) then
  begin
    // 394802 = .NET 4.6.2, 461808 = .NET 4.7.2, 528040 = .NET 4.8
    if Release >= 394802 then
      Result := True;
  end;
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

// التحقق من إمكانية تشغيل البرنامج (لويندوز 7 جاهز دائماً بفضل النسخة المدمجة fixed109)
function IsAppReadyToLaunch(): Boolean;
begin
  if IsLegacyWindows() then
    Result := True
  else
    Result := IsWebView2Installed();
end;

function InitializeSetup(): Boolean;
var
  Msg: String;
begin
  Result := True;

  // فحص دوت نت فريموورك المتوافق
  if not IsDotNetCompatible() then
  begin
    Msg := 'يتطلب تشغيل رفيق POS وجود حزمة Microsoft .NET Framework (الإصدار 4.6.2 أو أحدث).' + #13#10 + #13#10 +
           'يرجى تثبيت الحزمة على جهازك ثم إعادة تشغيل برنامج التثبيت.';
    MsgBox(Msg, mbError, MB_OK);
    Result := False;
    Exit;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssDone then
  begin
    AllowSetForegroundWindow(ASFW_ANY);
  end;
end;
