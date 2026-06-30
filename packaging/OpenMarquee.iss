#define AppName "OpenMarquee"
#define AppVersion "0.3.0"

[Setup]
AppId={{1A7D02CF-5F9F-47A2-956A-CF21BD618F50}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Muhammad Ashfaq
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=OpenMarquee-Setup-v{#AppVersion}
SetupIconFile=OpenMarquee.ico
UninstallDisplayIcon={app}\OpenMarquee.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
ArchitecturesAllowed=x64compatible

[Files]
Source: "..\dist\OpenMarquee\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\OpenMarquee"; Filename: "{app}\OpenMarquee.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\OpenMarquee"; Filename: "{app}\OpenMarquee.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\OpenMarquee.exe"; Description: "Launch OpenMarquee"; Flags: nowait postinstall skipifsilent
