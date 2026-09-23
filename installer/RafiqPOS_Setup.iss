; =====================================================================
; رفيق نقاط البيع — اسكربت برنامج التثبيت الرسمي (Inno Setup 6)
; متوافق من Windows 7 SP1 (32 و 64 بت) حتى Windows 11
; =====================================================================

#define MyAppName "رفيق نقاط البيع"
#define MyAppEnglishName "Rafiq POS"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Rafiq Solutions"
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

[Languages]
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

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

; مثبت WebView2 أونلاين الحديث (فقط لويندوز 10 وويندوز 11)
Source: "prerequisites\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: IsWindows10OrLater and not IsWebView2Installed

; مثبت WebView2 أوفلاين إصدار 109 الرسمي المخصص لويندوز 7 وويندوز 8
Source: "prerequisites\MicrosoftEdgeWebView2RuntimeInstallerX86_109.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall skipifsourcedoesntexist; Check: IsLegacyWindows and not IsWebView2Installed

; حماية قاعدة البيانات: تُحفظ في C:\ProgramData\RafiqPOS\data ولا تُحذف عند إلغاء التثبيت
Source: "..\desktop\bin\Release\data\rafiq_pos.db"; DestDir: "{commonappdata}\RafiqPOS\data"; Flags: onlyifdoesntexist uninsneveruninstall; Permissions: users-full

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\إلغاء تثبيت {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; 1. تثبيت WebView2 على ويندوز 10 وويندوز 11 أونلاين إذا لزم الأمر
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "جاري فحص وتثبيت مشغّل WebView2 Runtime لنظام ويندوز 10/11..."; Check: IsWindows10OrLater and not IsWebView2Installed

; 2. تثبيت WebView2 إصدار 109 أوفلاين المخصص لويندوز 7 بدون أي اتصال بالإنترنت
Filename: "{tmp}\MicrosoftEdgeWebView2RuntimeInstallerX86_109.exe"; Parameters: "/silent /install"; StatusMsg: "جاري تثبيت مشغّل WebView2 Runtime إصدار 109 المتوافق مع ويندوز 7..."; Check: IsLegacyWindows and not IsWebView2Installed and FileExists(ExpandConstant('{tmp}\MicrosoftEdgeWebView2RuntimeInstallerX86_109.exe'))

; تشغيل البرنامج بعد انتهاء التثبيت
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
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
  // فحص سجلات 32-بت و 64-بت
  if RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-F600A9E7E3DC}', 'pv', VersionStr) or
     RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-F600A9E7E3DC}', 'pv', VersionStr) or
     RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-F600A9E7E3DC}', 'pv', VersionStr) then
  begin
    if Length(VersionStr) > 0 then
      Result := True;
  end;
end;

function InitializeSetup(): Boolean;
var
  Msg: String;
begin
  Result := True;

  // 1. فحص دوت نت فريموورك المتوافق
  if not IsDotNetCompatible() then
  begin
    Msg := 'يتطلب تشغيل رفيق نقاط البيع وجود حزمة Microsoft .NET Framework (4.6.2 أو أعلى) على هذا الجهاز.' + #13#10 +
           'يرجى تثبيتها قبل المتابعة، ثم إعادة تشغيل هذا المثبّت.';
    MsgBox(Msg, mbError, MB_OK);
    Result := False;
    Exit;
  end;
end;
