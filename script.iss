; Inno Setup script for Poshat Launcher
; Downloads the latest MSI/EXE from GitHub Releases and installs it silently.
;
; How it works:
;   1. On "Ready" page, installer calls GitHub API to find the latest release.
;   2. Parses JSON to extract the download URL for the matching asset.
;   3. Downloads the MSI, then runs msiexec /i to install.
;
; To release a new version:
;   1. Push a tag: git tag v0.1.0 && git push --tags
;   2. CI builds Windows + Linux, publishes to GitHub Releases (draft).
;   3. Edit the draft, publish it — the installer will pick up the new version.

#define MyAppName       "Poshat Launcher"
#define MyAppVersion    "0.1.3"
#define MyAppPublisher  "Poshat"
#define MyAppURL        "https://poshatlauncher.pages.dev/"
#define MyAppExeName    "Poshat Launcher.exe"
#define GitHubOwner     "d0976155-tech"
#define GitHubRepo      "Poshat-Launcher"

[Setup]
AppId={{B3F1F0C6-2C9A-4D5A-9E1C-POSHATLAUNCHER}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=.
OutputBaseFilename=Poshat_Launcher_Installer
Compression=lzma2/ultra
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
SetupIconFile=src-tauri\icons\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; MSI/EXE is downloaded at runtime (see [Code]) into {tmp}\app.msi

[Run]
Filename: "msiexec.exe"; \
  Parameters: "/i ""{tmp}\app.msi"" /passive /norestart"; \
  StatusMsg: "Установка {#MyAppName}..."; \
  Flags: waituntilterminated

[Code]
var
  DownloadPage: TDownloadWizardPage;

function GetLatestDownloadUrl: String;
var
  Output: AnsiString;
  OutputStr: String;
  HttpReq: Variant;
  Json: Variant;
  Assets: Variant;
  I: Integer;
  FileName: String;
  DownloadUrl: String;
begin
  Result := '';
  try
    HttpReq := CreateOleObject('MSXML2.ServerXMLHTTP.6.0');
    HttpReq.open('GET', 'https://api.github.com/repos/{#GitHubOwner}/{#GitHubRepo}/releases/latest', False);
    HttpReq.setRequestHeader('User-Agent', '{#MyAppName}-Installer');
    HttpReq.send('');
    if HttpReq.Status = 200 then
    begin
      Output := HttpReq.responseText;
      OutputStr := String(Output);

      { Find browser_download_url for an MSI file containing "x64" }
      { Simple text parsing since Inno Setup has no JSON library }
      I := Pos('"browser_download_url":', OutputStr);
      while I > 0 do
      begin
        { Extract the URL value }
        Delete(OutputStr, 1, I + 21);
        DownloadUrl := Copy(OutputStr, 1, Pos('"', OutputStr) - 1);

        { Check if this is the MSI we want (x64 + .msi) }
        if (Pos('.msi', LowerCase(DownloadUrl)) > 0) and
           (Pos('x64', LowerCase(DownloadUrl)) > 0) then
        begin
          Result := DownloadUrl;
          Exit;
        end;

        I := Pos('"browser_download_url":', OutputStr);
      end;
    end;
  except
    { If anything goes wrong, return empty — user will see error }
  end;
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateDownloadPage(
    'Загрузка {#MyAppName}',
    'Подождите, пока установщик скачает необходимые файлы.',
    nil);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Url: String;
begin
  if CurPageID = wpReady then
  begin
    Url := GetLatestDownloadUrl;
    if Url = '' then
    begin
      SuppressibleMsgBox(
        'Не удалось определить ссылку на скачивание.' + #13#10 +
        'Проверьте подключение к интернету и попробуйте снова.',
        mbCriticalError, MB_OK, IDOK);
      Result := False;
      Exit;
    end;

    DownloadPage.Clear;
    DownloadPage.Add(Url, 'app.msi', '');
    DownloadPage.Show;
    try
      try
        DownloadPage.Download;
        Result := True;
      except
        SuppressibleMsgBox(
          'Не удалось скачать установочный пакет:' + #13#10 + GetExceptionMessage,
          mbCriticalError, MB_OK, IDOK);
        Result := False;
      end;
    finally
      DownloadPage.Hide;
    end;
  end
  else
    Result := True;
end;
