#define AppName "OpenMarquee"
#define AppVersion "0.3.2"

[Setup]
AppId={{1A7D02CF-5F9F-47A2-956A-CF21BD618F50}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Muhammad Ashfaq
AppPublisherURL=https://github.com/MianAshfaq/OpenMarquee
AppSupportURL=https://github.com/MianAshfaq/OpenMarquee/issues
AppUpdatesURL=https://github.com/MianAshfaq/OpenMarquee/releases
AppCopyright=Copyright (c) 2026 Muhammad Ashfaq and OpenMarquee contributors
VersionInfoVersion=0.3.2.0
VersionInfoCompany=Muhammad Ashfaq
VersionInfoDescription=OpenMarquee digital signage installer
VersionInfoProductName=OpenMarquee
VersionInfoProductVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=OpenMarquee-Setup-v{#AppVersion}
SetupIconFile=OpenMarquee.ico
LicenseFile=TERMS.txt
UninstallDisplayIcon={app}\OpenMarquee.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
ArchitecturesAllowed=x64compatible

[Files]
Source: "..\dist\OpenMarquee\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\LICENSE"; DestDir: "{app}"; DestName: "LICENSE.txt"; Flags: ignoreversion
Source: "TERMS.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\OpenMarquee"; Filename: "{app}\OpenMarquee.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\OpenMarquee"; Filename: "{app}\OpenMarquee.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\OpenMarquee.exe"; Description: "Launch OpenMarquee"; Flags: nowait postinstall skipifsilent
