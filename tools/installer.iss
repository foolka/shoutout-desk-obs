#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef PackageDir
  #error PackageDir is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif

[Setup]
AppName=Shoutout Desk OBS
AppVersion={#AppVersion}
AppPublisher=FermionaPlay
AppPublisherURL=https://github.com/foolka/shoutout-desk-obs
AppSupportURL=https://github.com/foolka/shoutout-desk-obs/issues
AppUpdatesURL=https://github.com/foolka/shoutout-desk-obs/releases
#ifdef TestRoot
AppId=ShoutoutDeskOBS.InstallerTest
DefaultDirName={#TestRoot}\plugin
PrivilegesRequired=lowest
CreateUninstallRegKey=no
OutputBaseFilename=shoutout-desk-obs-{#AppVersion}-installer-test
#else
AppId={{0E2F1904-12EF-4B40-9213-E3EF26097249}
DefaultDirName={commonappdata}\obs-studio\plugins\shoutout-desk-obs
PrivilegesRequired=admin
OutputBaseFilename=shoutout-desk-obs-{#AppVersion}-windows-x64-setup
#endif
OutputDir={#OutputDir}
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
MinVersion=10.0
UsePreviousAppDir=no
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableWelcomePage=no
WizardStyle=modern dark
WizardSizePercent=110
SetupIconFile={#PackageDir}\shoutout-desk-obs\data\data\icon.ico
UninstallDisplayIcon={app}\data\data\icon.ico
UninstallDisplayName=Shoutout Desk OBS
UninstallFilesDir={app}\uninstall
LicenseFile={#PackageDir}\LICENSE
Compression=lzma2
SolidCompression=yes
CloseApplications=no
RestartApplications=no
AlwaysRestart=no
SetupLogging=yes
SetupMutex=ShoutoutDeskOBS.Setup
VersionInfoVersion={#AppVersion}.0

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "ru"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "uk"; MessagesFile: "compiler:Languages\Ukrainian.isl"

[CustomMessages]
#include "installer-messages.iss"

[Files]
Source: "{#PackageDir}\shoutout-desk-obs\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PackageDir}\manifest.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PackageDir}\README.md"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "{#PackageDir}\README.ru.md"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "{#PackageDir}\README.uk.md"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "{#PackageDir}\LICENSE"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "{#PackageDir}\THIRD_PARTY_NOTICES.md"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "{#PackageDir}\CHANGELOG.md"; DestDir: "{app}\docs"; Flags: ignoreversion

[Messages]
en.FinishedLabel=Shoutout Desk OBS is installed.%n%nOpen OBS from your usual shortcut, then choose Docks > Shoutout Desk and sign in with Twitch.%n%nYour people, history and saved sign-in were not changed.
ru.FinishedLabel=Shoutout Desk OBS установлен.%n%nОткройте OBS привычным ярлыком, затем Док-панели > Shoutout Desk и войдите через Twitch.%n%nСписок людей, история и сохранённый вход не изменены.
uk.FinishedLabel=Shoutout Desk OBS установлено.%n%nВідкрийте OBS звичним ярликом, потім Док-панелі > Shoutout Desk та увійдіть через Twitch.%n%nСписок людей, історію та збережений вхід не змінено.

[Code]
var
  ObsPage: TInputDirWizardPage;

function ExpectedTarget: String;
begin
#ifdef TestRoot
  Result := ExpandFileName('{#TestRoot}\plugin');
#else
  Result := ExpandConstant('{commonappdata}\obs-studio\plugins\shoutout-desk-obs');
#endif
end;

function ObsVersionProblem(const Root: String): String;
var
  MS, LS: Cardinal;
begin
  Result := CustomMessage('ObsMissing');
  if not GetVersionNumbers(AddBackslash(Root) + 'bin\64bit\obs64.exe', MS, LS) then Exit;
  if (MS shr 16) < 32 then begin
    Result := CustomMessage('ObsOld');
    Exit;
  end;
  Result := CustomMessage('QtOld');
  if not GetVersionNumbers(AddBackslash(Root) + 'bin\64bit\Qt6Core.dll', MS, LS) then Exit;
  if ((MS shr 16) <> 6) or ((MS and $FFFF) < 8) then Exit;
  Result := CustomMessage('ObsPortable');
  if FileExists(AddBackslash(Root) + 'portable_mode.txt') or
     FileExists(AddBackslash(Root) + 'bin\64bit\portable_mode.txt') or
     FileExists(AddBackslash(Root) + 'obs_portable_mode.txt') then Exit;
  Result := '';
end;

function ObsProcessProblem: String;
var
  Locator, Services, Processes: Variant;
begin
  Result := '';
  try
    Locator := CreateOleObject('WbemScripting.SWbemLocator');
    Services := Locator.ConnectServer('', 'root\CIMV2');
    Processes := Services.ExecQuery('SELECT ProcessId FROM Win32_Process WHERE Name = ''obs64.exe''');
    if Processes.Count > 0 then Result := CustomMessage('ObsRunning');
  except
    Result := CustomMessage('ProcessCheckFailed');
  end;
end;

procedure InitializeWizard;
var
  Root: String;
begin
  WizardForm.ReadyMemo.WordWrap := True;
  WizardForm.ReadyMemo.ScrollBars := ssVertical;
  ObsPage := CreateInputDirPage(wpLicense, CustomMessage('ObsTitle'),
    CustomMessage('ObsDescription'), CustomMessage('ObsExplanation'), False, '');
  ObsPage.Add('OBS Studio:');
  Root := ExpandConstant('{param:OBSROOT|}');
  if Root = '' then RegQueryStringValue(HKLM64, 'SOFTWARE\OBS Studio', '', Root);
  if Root = '' then RegQueryStringValue(HKLM32, 'SOFTWARE\OBS Studio', '', Root);
  if Root = '' then Root := ExpandConstant('{autopf}\obs-studio');
  ObsPage.Values[0] := Root;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Problem: String;
begin
  Result := True;
  if CurPageID = ObsPage.ID then begin
    Problem := ObsVersionProblem(ObsPage.Values[0]);
    if Problem <> '' then begin
      Log(Problem);
      SuppressibleMsgBox(Problem, mbError, MB_OK, IDOK);
      Result := False;
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := CustomMessage('InvalidTarget');
  if CompareText(RemoveBackslashUnlessRoot(ExpandFileName(WizardDirValue)),
    RemoveBackslashUnlessRoot(ExpectedTarget)) <> 0 then Exit;
  Result := ObsVersionProblem(ObsPage.Values[0]);
  if Result <> '' then Exit;
  Result := ObsProcessProblem;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo,
  MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := 'OBS Studio: ' + ObsPage.Values[0] + NewLine + NewLine +
    CustomMessage('InstallLocation') + NewLine + ExpectedTarget + NewLine + NewLine +
    CustomMessage('DataPreserved') + NewLine + NewLine + CustomMessage('NoAutoClose');
end;

function InitializeUninstall: Boolean;
var
  Problem: String;
begin
  Problem := ObsProcessProblem;
  Result := Problem = '';
  if not Result then SuppressibleMsgBox(Problem, mbError, MB_OK, IDOK);
end;
