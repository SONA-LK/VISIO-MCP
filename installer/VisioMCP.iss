; VisioMCP Installer Script for Inno Setup 6
; Download Inno Setup: https://jrsoftware.org/isinfo.php
; Build: iscc VisioMCP.iss

#define MyAppName "VisioMCP"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "VisioMCP"
#define MyAppURL "https://github.com/SONA-LK/VISIO-MCP"
#define MyAppExeName "VisioMCP.exe"
#define MyAppDescription "MCP server for controlling Microsoft Visio"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\dist-installer
OutputBaseFilename=VisioMCP-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0.17763
; Windows 10 1809+ required (for COM security)

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Main executable — must be built before running installer
Source: "..\VisioMCP.exe"; DestDir: "{app}"; Flags: ignoreversion
; Default config template
Source: "config.template.json"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
var
  VisioFound: Boolean;
  VisioPath: String;

// Search for VISIO.EXE in common locations
function FindVisio(): Boolean;
var
  Paths: TArrayOfString;
  I: Integer;
begin
  Result := False;
  SetArrayLength(Paths, 6);
  Paths[0] := ExpandConstant('{pf}\Microsoft Office\root\Office16\VISIO.EXE');
  Paths[1] := ExpandConstant('{pf32}\Microsoft Office\root\Office16\VISIO.EXE');
  Paths[2] := ExpandConstant('{pf}\Microsoft Office\Office16\VISIO.EXE');
  Paths[3] := ExpandConstant('{pf32}\Microsoft Office\Office16\VISIO.EXE');
  Paths[4] := ExpandConstant('{pf}\Microsoft Office\Office15\VISIO.EXE');
  Paths[5] := ExpandConstant('{pf32}\Microsoft Office\Office15\VISIO.EXE');

  for I := 0 to GetArrayLength(Paths) - 1 do
  begin
    if FileExists(Paths[I]) then
    begin
      VisioPath := Paths[I];
      Result := True;
      Exit;
    end;
  end;
end;

procedure InitializeWizard();
begin
  VisioFound := FindVisio();
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = wpWelcome then
  begin
    if not VisioFound then
    begin
      if MsgBox(
        'Microsoft Visio was not found on this machine.' + #13#10 +
        'VisioMCP requires Microsoft Visio to function.' + #13#10 + #13#10 +
        'You can still install VisioMCP and configure the Visio path manually.' + #13#10 +
        'Continue installation anyway?',
        mbConfirmation, MB_YESNO) = IDNO then
      begin
        Result := False;
      end;
    end;
  end;
end;

// Create config file and log directory after install
procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigDir: String;
  LogDir: String;
  ConfigFile: String;
  ConfigContent: String;
begin
  if CurStep = ssPostInstall then
  begin
    ConfigDir := ExpandConstant('{localappdata}\VisioMCP');
    LogDir    := ConfigDir + '\logs';
    ConfigFile := ConfigDir + '\config.json';

    // Create directories
    ForceDirectories(ConfigDir);
    ForceDirectories(LogDir);

    // Write config only if it doesn't exist
    if not FileExists(ConfigFile) then
    begin
      ConfigContent := '{' + #13#10;
      if VisioFound then
        ConfigContent := ConfigContent + '  "visioPath": "' + StringReplace(VisioPath, '\', '\\', [rfReplaceAll]) + '",' + #13#10;
      ConfigContent := ConfigContent + '  "autoStartVisio": true,' + #13#10;
      ConfigContent := ConfigContent + '  "logLevel": "info",' + #13#10;
      ConfigContent := ConfigContent + '  "confirmDestructiveActions": false,' + #13#10;
      ConfigContent := ConfigContent + '  "allowSilentOverwrite": false,' + #13#10;
      ConfigContent := ConfigContent + '  "comTimeoutMs": 30000' + #13#10;
      ConfigContent := ConfigContent + '}' + #13#10;
      SaveStringToFile(ConfigFile, ConfigContent, False);
    end;
  end;
end;

// Show MCP client configuration after install
procedure DeinitializeSetup();
var
  InstallDir: String;
begin
  InstallDir := ExpandConstant('{app}');
  MsgBox(
    'VisioMCP installed successfully!' + #13#10 + #13#10 +
    'To use with Claude Desktop, add this to your claude_desktop_config.json:' + #13#10 + #13#10 +
    '{' + #13#10 +
    '  "mcpServers": {' + #13#10 +
    '    "visio": {' + #13#10 +
    '      "command": "' + StringReplace(InstallDir, '\', '\\', [rfReplaceAll]) + '\\VisioMCP.exe"' + #13#10 +
    '    }' + #13#10 +
    '  }' + #13#10 +
    '}' + #13#10 + #13#10 +
    'Config file: %LOCALAPPDATA%\VisioMCP\config.json' + #13#10 +
    'Log files:   %LOCALAPPDATA%\VisioMCP\logs\',
    mbInformation, MB_OK);
end;

[UninstallRun]
; No registry entries to clean up — config stays in LOCALAPPDATA

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
